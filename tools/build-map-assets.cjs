'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto'), zlib = require('node:zlib'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), sourceDir = path.join(__dirname, 'map-source'), output = path.join(root, 'assets/maps');
const createRegistry = require('./map-loader-runtime.cjs');
const sources = JSON.parse(fs.readFileSync(path.join(sourceDir, 'legacy-templates.json'), 'utf8'));
// New authoring presets have their own IDs; saved scenarios keep their original
// geometry and province IDs when a more readable template is introduced.
const balancedSource = path.join(sourceDir, 'europe-balanced.json');
if (fs.existsSync(balancedSource)) sources.push(JSON.parse(fs.readFileSync(balancedSource, 'utf8')));
// Web distributions omit the larger processed world sources. Rebuild them from
// their verified, manifest-owned hashed assets instead of keeping duplicate data.
function addDistributedSource(id) {
  const source = path.join(sourceDir, id + '.json');
  if (fs.existsSync(source)) {
    sources.push(JSON.parse(fs.readFileSync(source, 'utf8')));
    return;
  }
  const previousManifest = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8'));
  const descriptor = previousManifest.assets.find(asset => asset.type === 'base' && asset.id === id);
  if (!descriptor) throw new Error('Missing ' + id + ' source and hashed base asset.');
  for (const file of [descriptor, ...(descriptor.parts || [])]) {
    if (!path.resolve(root, file.path).startsWith(output + path.sep)) throw new Error('World source must be inside assets/maps.');
  }
  const previousRegistry = createRegistry({}, previousManifest, name => name === 'node:fs' ? fs : require(name), root);
  sources.push(previousRegistry.get(id));
}
addDistributedSource('world-balanced');
// Development may keep the processed world source separately. Distribution ZIPs
// use its identical hashed base asset, avoiding an extra 24.5 MB copy.
addDistributedSource('world-detailed');
const sourceApi = {get: id => sources.find(template => template.id === id) || null, list: () => sources.map(template => ({id:template.id,name:template.name,provinceCount:template.provinces.length,...(template.recommended ? {recommended:true} : {})}))};
const sandbox = {MapTemplates: sourceApi};
vm.runInNewContext(fs.readFileSync(path.join(sourceDir, 'regional-presets.cjs'), 'utf8'), sandbox, {filename:'regional-presets.cjs'});
vm.runInNewContext(fs.readFileSync(path.join(sourceDir, 'balanced-regions.cjs'), 'utf8'), sandbox, {filename:'balanced-regions.cjs'});
const original = sandbox.MapTemplates;
const all = original.list().map(item => original.get(item.id));
const manifest = {format:'hc-map-manifest-v1', regions:original.regions(), eras:Object.fromEntries(original.regions().map(region => [region.id, original.eras(region.id)])), templates:[], assets:[]};
fs.mkdirSync(output, {recursive:true});
const chunkBytes = 1024 * 1024;
const digest = body => crypto.createHash('sha256').update(body).digest('hex');
const compressedBytes = body => zlib.gzipSync(body, {level:9}).length;
function save(id, type, value, baseId) {
  const content = Buffer.from(JSON.stringify(value), 'utf8'), contentHash = digest(content), parts = [];
  // Continental balanced crops stay in one web-uploadable JSON file. Older
  // assets retain their exact original chunking, URLs and cached bytes.
  const singleCrop = Boolean(value.template?.balancedRegionId);
  if (singleCrop && content.length > 8 * chunkBytes) throw new Error('Balanced crop exceeds the 8 MiB web-upload limit: ' + id);
  let body = content;
  if (content.length > chunkBytes && !singleCrop) {
    for (let start = 0; start < content.length;) {
      let end = Math.min(start + chunkBytes, content.length);
      // Never cut a UTF-8 continuation sequence: every fragment is valid text.
      while (end < content.length && (content[end] & 0xc0) === 0x80) end--;
      const part = content.subarray(start, end), hash = digest(part);
      const filename = id + '.' + contentHash.slice(0,16) + '.part-' + String(parts.length + 1).padStart(3,'0') + '.' + hash.slice(0,16) + '.txt';
      fs.writeFileSync(path.join(output, filename), part);
      parts.push({path:'assets/maps/' + filename, bytes:part.length, gzipBytes:compressedBytes(part), sha256:hash});
      start = end;
    }
    body = Buffer.from(JSON.stringify({format:'hc-map-chunks-v1', id, type, contentBytes:content.length, contentSha256:contentHash, parts}), 'utf8');
  }
  // Hash the index itself. Immutable cache keys must change when its format changes.
  const hash = digest(body), filename = id + '.' + hash.slice(0,16) + '.json';
  fs.writeFileSync(path.join(output, filename), body);
  const descriptor = {id,type,path:'assets/maps/'+filename,bytes:body.length,gzipBytes:compressedBytes(body) + parts.reduce((sum, part) => sum + part.gzipBytes, 0),sha256:hash};
  if (parts.length) Object.assign(descriptor, {format:'hc-map-chunks-v1', contentBytes:content.length, contentSha256:contentHash, parts});
  if (baseId) descriptor.baseId=baseId;
  manifest.assets.push(descriptor);return descriptor;
}
const downloadBytes = descriptor => descriptor.bytes + (descriptor.parts || []).reduce((sum, part) => sum + part.bytes, 0);
const bases = new Map();
for(const template of all.filter(template => !template.regionId || (template.eraId === 'modern' && template.regionId !== 'world'))) {
  bases.set(template.id, save(template.id,'base',{format:'hc-map-base-v1',template}));
}
for(const template of all) {
  let descriptor = bases.get(template.id), baseId;
  if (!descriptor) {
    baseId = template.regionId === 'world' ? 'world-detailed' : original.regionalId(template.regionId,'modern');
    const base = original.get(baseId), metadata = Object.assign({},template), changes=[];
    for(const key of ['provinces','landPath','waterPath','riversPath'])delete metadata[key];
    assert.equal(template.provinces.length,base.provinces.length);
    for(let index=0;index<template.provinces.length;index++) {
      const current=template.provinces[index], prior=base.provinces[index], set={}, remove=[];
      assert.equal(current.id,prior.id);assert.equal(current.path,prior.path);
      for(const key of Object.keys(current))if(JSON.stringify(current[key])!==JSON.stringify(prior[key]))set[key]=current[key];
      for(const key of Object.keys(prior))if(!(key in current))remove.push(key);
      if(Object.keys(set).length||remove.length)changes.push([index,set,remove]);
    }
    descriptor=save(template.id,'patch',{format:'hc-map-era-v1',id:template.id,baseId,metadata,changes},baseId);
  }
  const entry={id:template.id,name:template.name,provinceCount:template.provinces.length,asset:descriptor.path,downloadBytes:downloadBytes(descriptor)+(baseId?downloadBytes(bases.get(baseId)):0)};
  if(template.recommended)entry.recommended=true;
  if(template.balancedRegionId)entry.balancedRegionId=template.balancedRegionId;
  if(template.regionId){entry.regionId=template.regionId;entry.eraId=template.eraId;}
  if(baseId)entry.baseId=baseId;
  manifest.templates.push(entry);
}
const source='/* Natural Earth / geoBoundaries. Source and attribution: MAP-SOURCES.md. Generated by tools/build-map-assets.cjs. */\n(function(root){\n\'use strict\';\nconst manifest='+JSON.stringify(manifest)+';\nconst createMapRegistry='+createRegistry.toString()+';\nconst api=createMapRegistry(root,manifest,typeof module!==\'undefined\'&&module.exports?require:null,typeof __dirname!==\'undefined\'?__dirname:null);\nroot.MapTemplates=api;\nif(typeof module!==\'undefined\'&&module.exports)module.exports=api;\n})(typeof globalThis!==\'undefined\'?globalThis:this);\n';
fs.writeFileSync(path.join(root,'map-templates.js'),source);
fs.writeFileSync(path.join(root,'map-regions.js'),'/* Regional metadata is included in the lightweight map-templates.js registry. */\n(function(root){\'use strict\';const registry=root.MapTemplates||(typeof require===\'function\'?require(\'./map-templates.js\'):null);if(!registry)throw new Error(\'map-templates.js must load before map-regions.js\');if(typeof module!==\'undefined\'&&module.exports)module.exports=registry;})(typeof globalThis!==\'undefined\'?globalThis:this);\n');
fs.writeFileSync(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const registry=createRegistry({},manifest,require,root);
for(const template of all)assert.equal(JSON.stringify(registry.get(template.id)),JSON.stringify(template),'exact template identity: '+template.id);
const metrics=manifest.templates.map(entry=>({id:entry.id,regions:entry.provinceCount,bytes:entry.downloadBytes,gzipBytes:[entry.asset,...(entry.baseId?[manifest.templates.find(item=>item.id===entry.baseId).asset]:[])].reduce((sum,file)=>sum+manifest.assets.find(asset=>asset.path===file).gzipBytes,0)}));
fs.writeFileSync(path.join(output,'SIZES.json'),JSON.stringify({registryBytes:Buffer.byteLength(source),priorMonolithBytes:Buffer.byteLength(JSON.stringify(sources.find(template=>template.id==='world-detailed'))),templates:metrics},null,2)+'\n');
console.log(JSON.stringify({registryBytes:Buffer.byteLength(source),templates:metrics},null,2));
