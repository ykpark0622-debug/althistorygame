'use strict';
// Exercise the distribution ZIP's rebuild path without moving canonical sources
// or overwriting any generated files while other integration tests are running.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),builder=path.join(root,'tools/build-map-assets.cjs'),rawSource=path.join(root,'tools/map-source/world-detailed.json'),nativeRequire=createRequire(builder),writes=new Map();
let fallbackRead=false;
const proxy=Object.assign({},fs,{
  existsSync(filename){return path.resolve(filename)===rawSource?false:fs.existsSync(filename);},
  readFileSync(filename,...args){assert.notEqual(path.resolve(filename),rawSource,'raw world source is absent in deployment');if(String(filename).includes('assets'+path.sep+'maps'+path.sep+'world-detailed.'))fallbackRead=true;return fs.readFileSync(filename,...args);},
  statSync(filename,...args){assert.notEqual(path.resolve(filename),rawSource,'raw world source is absent in deployment');return fs.statSync(filename,...args);},
  writeFileSync(filename,value){writes.set(path.resolve(filename),value);},
  mkdirSync(){}
});
const sandbox={__dirname:path.dirname(builder),Buffer,console:{log(){}},require(id){return id==='node:fs'?proxy:nativeRequire(id);}};
vm.runInNewContext(fs.readFileSync(builder,'utf8'),sandbox,{filename:builder});
assert.equal(fallbackRead,true,'must rebuild from the distributed hashed world base');
assert.equal(String(writes.get(path.join(root,'map-templates.js'))),fs.readFileSync(path.join(root,'map-templates.js'),'utf8'));
const manifest=JSON.parse(writes.get(path.join(root,'assets/maps/manifest.json')));
assert.equal(manifest.templates.length,17);
for(const asset of manifest.assets)for(const file of [asset,...(asset.parts||[])])assert.equal(Buffer.from(writes.get(path.join(root,file.path))).compare(fs.readFileSync(path.join(root,file.path))),0,file.path);
assert.ok(manifest.assets.find(asset=>asset.id==='world-detailed').parts.length>1,'world source fallback must reconstruct distributed fragments');
console.log('PASS distribution without raw world source rebuilds the exact registry and all seventeen logical assets with their fragments');
