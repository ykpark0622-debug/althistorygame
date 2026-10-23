'use strict';
// Exercise the distribution ZIP's rebuild path without moving canonical sources
// or overwriting any generated files while other integration tests are running.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),builder=path.join(root,'tools/build-map-assets.cjs'),nativeRequire=createRequire(builder),writes=new Map();
const sourceIds=['world-detailed','world-balanced','gallery_china_korea_research','gallery_eastasia_research','gallery_europe_research','gallery_world_research'];
const worldSources=new Set(sourceIds.map(id=>path.join(root,'tools/map-source',...(id.startsWith('gallery_')?['research-bases']:[]),id+'.json'))),fallbackReads=new Set();
const proxy=Object.assign({},fs,{
  existsSync(filename){return worldSources.has(path.resolve(filename))?false:fs.existsSync(filename);},
  readFileSync(filename,...args){assert.equal(worldSources.has(path.resolve(filename)),false,'raw world and research sources are absent in deployment');for(const id of sourceIds)if(String(filename).includes('assets'+path.sep+'maps'+path.sep+id+'.'))fallbackReads.add(id);return fs.readFileSync(filename,...args);},
  statSync(filename,...args){assert.equal(worldSources.has(path.resolve(filename)),false,'raw world sources are absent in deployment');return fs.statSync(filename,...args);},
  writeFileSync(filename,value){writes.set(path.resolve(filename),value);},
  mkdirSync(){}
});
const sandbox={__dirname:path.dirname(builder),Buffer,console:{log(){}},require(id){return id==='node:fs'?proxy:nativeRequire(id);}};
vm.runInNewContext(fs.readFileSync(builder,'utf8'),sandbox,{filename:builder});
assert.deepEqual([...fallbackReads].sort(),[...sourceIds].sort(),'must rebuild world and research geometry from their distributed hashed bases');
assert.equal(String(writes.get(path.join(root,'map-templates.js'))),fs.readFileSync(path.join(root,'map-templates.js'),'utf8'));
const manifest=JSON.parse(writes.get(path.join(root,'assets/maps/manifest.json')));
assert.equal(manifest.templates.length,42);
assert.equal(manifest.templates.find(template=>template.id==='europe-balanced')?.recommended,true);
assert.equal(manifest.templates.find(template=>template.id==='world-balanced')?.recommended,true);
for(const asset of manifest.assets)for(const file of [asset,...(asset.parts||[])])assert.equal(Buffer.from(writes.get(path.join(root,file.path))).compare(fs.readFileSync(path.join(root,file.path))),0,file.path);
assert.ok(manifest.assets.find(asset=>asset.id==='world-detailed').parts.length>1,'world source fallback must reconstruct distributed fragments');
console.log('PASS distribution without raw geometry sources rebuilds the exact registry and all forty-two logical assets');
