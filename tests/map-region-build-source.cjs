'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),file=path.join(root,'tools/build-map-regions.cjs'),destination=path.join(root,'tools/map-source/regional-presets.cjs'),nativeRequire=createRequire(file),original=fs.readFileSync(destination,'utf8'),writes=new Map();
let rebuilt=0;
const sandbox={__dirname:path.dirname(file),Buffer,console:{log(){}},require(id){
  if(id==='./build-map-assets.cjs'){rebuilt++;return {};}
  if(id==='node:fs')return Object.assign({},fs,{
    readFileSync(filename,...args){return path.resolve(filename)===destination?original.replace(/\/\* ERA_MASKS_START \*\/[\s\S]*?\/\* ERA_MASKS_END \*\//,'/* ERA_MASKS_START */{}/* ERA_MASKS_END */'):fs.readFileSync(filename,...args);},
    writeFileSync(filename,source){writes.set(path.resolve(filename),source);}
  });
  return nativeRequire(id);
}};
vm.runInNewContext(fs.readFileSync(file,'utf8'),sandbox,{filename:file});
assert.equal(rebuilt,1,'historical mask updates must rebuild the split assets');
assert.equal(writes.size,1);assert.equal(writes.get(destination),original,'generated mask source must preserve the existing historical preset exactly');
assert.equal(writes.has(path.join(root,'map-regions.js')),false,'the runtime compatibility shim must not be a mask destination');
console.log('PASS historical-mask generator updates source presets and delegates hashed asset rebuild');
