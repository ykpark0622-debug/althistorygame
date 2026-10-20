'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(root,'map-templates.js'),'utf8'),manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/maps/manifest.json'),'utf8'));
const files=manifest.assets.flatMap(asset=>[asset,...(asset.parts||[])]);
const urls=new Map(files.map(asset=>[new URL(asset.path,'https://example.test/game/').href,asset]));
function logicalAsset(asset){const value=JSON.parse(fs.readFileSync(path.join(root,asset.path),'utf8'));return asset.parts?JSON.parse(asset.parts.map(part=>fs.readFileSync(path.join(root,part.path),'utf8')).join('')):value;}
function browser(options={}) {
  const requests=[];
  const context={URL,AbortController,TextEncoder,crypto:crypto.webcrypto,setTimeout:options.setTimeout||setTimeout,clearTimeout,location:{href:'https://example.test/game/index.html?mapMaker=1'},document:{currentScript:{src:'https://example.test/game/map-templates.js'}},fetch:async(url,init)=>{
    requests.push(url);const asset=urls.get(url);assert.ok(asset,'only manifest-owned URLs may be fetched');
    if(options.fetch)return options.fetch(url,init,asset,requests);
    return response(fs.readFileSync(path.join(root,asset.path),'utf8'));
  }};
  vm.runInNewContext(source,context,{filename:'map-templates.js'});
  return {maps:context.MapTemplates,requests,context};
}
function response(body,status=200){return {ok:status>=200&&status<300,status,headers:{get:()=>null},text:async()=>body};}
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
(async()=>{
await test('metadata and synchronous lookup never request geometry in browser',async()=>{
  const {maps,requests}=browser();assert.equal(maps.list().length,28);assert.equal(maps.regions().length,6);
  assert.equal(maps.eras('eastasia').length,4);assert.equal(maps.regionalId('eastasia','1592'),'regional_eastasia_1592');
  assert.equal(maps.get('regional_eastasia_1592'),null);assert.equal(maps.isLoaded('world-detailed'),false);assert.equal(requests.length,0);
  await assert.rejects(maps.ensure('../world.json'));assert.equal(requests.length,0);
});
await test('recommended balanced Europe stays separate from existing region eras and loads only its own geometry',async()=>{
  const {maps,requests}=browser(),metadata=maps.list().find(template=>template.id==='europe-balanced');
  assert.equal(metadata.recommended,true);assert.equal(maps.selection(metadata.id),null);
  assert.deepEqual(Array.from(maps.eras('europe_med'),era=>era.id),['1754','modern']);
  assert.equal(maps.get(metadata.id),null);assert.equal(requests.length,0);
  const template=await maps.ensure(metadata.id);assert.equal(template.recommended,true);
  assert.equal(requests.length,maps.assetInfo(metadata.id).files.length);
  assert.ok(requests.every(url=>url.includes('/europe-balanced.')));
  assert.equal(maps.isLoaded('world-detailed'),false);assert.equal(maps.isLoaded('regional_europe_med_modern'),false);
});
await test('recommended balanced world fetches only its own geometry and preserves the detailed and Europe caches',async()=>{
  const {maps,requests}=browser(),metadata=maps.list().find(template=>template.id==='world-balanced');
  assert.equal(metadata.recommended,true);assert.equal(maps.selection(metadata.id),null);
  assert.equal(maps.get(metadata.id),null);assert.equal(requests.length,0);
  const template=await maps.ensure(metadata.id);assert.equal(template.recommended,true);
  assert.equal(requests.length,maps.assetInfo(metadata.id).files.length);
  assert.ok(requests.every(url=>url.includes('/world-balanced.')));
  assert.equal(maps.isLoaded('world-detailed'),false);assert.equal(maps.isLoaded('europe-balanced'),false);
  assert.ok(maps.list().find(item=>item.id==='europe-balanced')?.recommended);
});
await test('each new balanced continent fetches one independent JSON without the world or other continents',async()=>{
  for(const regionId of ['eastasia','asia','north_america','south_america']){
    const {maps,requests}=browser(),id='balanced_'+regionId+'_modern',metadata=maps.list().find(template=>template.id===id);
    assert.equal(metadata.balancedRegionId,regionId);assert.equal(metadata.recommended,true);
    const detail=maps.assetInfo(id);assert.equal(detail.files.length,1);assert.equal(maps.get(id),null);assert.equal(requests.length,0);
    const template=await maps.ensure(id);assert.equal(template.balancedRegionId,regionId);assert.equal(template.provinces.length,metadata.provinceCount);
    assert.equal(requests.length,1);assert.ok(requests[0].endsWith('.json'));assert.ok(requests[0].includes('/'+id+'.'));
    assert.equal(maps.isLoaded('world-balanced'),false);assert.equal(maps.isLoaded('world-detailed'),false);
    assert.equal(JSON.stringify(template),JSON.stringify(require('../map-templates.js').get(id)));
  }
});
await test('selected region fetches only its geometry index, fragments and era patch, with exact old content',async()=>{
  const {maps,requests}=browser(),selected=await maps.ensure('regional_eastasia_1592');
  assert.equal(requests.length,maps.assetInfo(selected.id).files.length);assert.ok(requests.every(url=>url.includes('regional_eastasia_')));assert.ok(!requests.some(url=>url.includes('world-detailed')));
  assert.equal(new Set(requests).size,requests.length);
  assert.equal(selected.provinces.length,5591);assert.equal(maps.get(selected.id),selected);assert.equal(maps.isLoaded(selected.id),true);
  const node=require('../map-templates.js');assert.equal(JSON.stringify(selected),JSON.stringify(node.get(selected.id)));
});
await test('same map requests coalesce, cached era change only fetches changed era',async()=>{
  const {maps,requests}=browser();const [a,b]=await Promise.all([maps.ensure('regional_eastasia_1592'),maps.ensure('regional_eastasia_1592')]);
  assert.equal(a,b);const count=maps.assetInfo(a.id).files.length;assert.equal(requests.length,count);await maps.ensureScenario({map:{templateId:a.id}});assert.equal(requests.length,count);
  await maps.ensure('regional_eastasia_1419');assert.equal(requests.length,count+1);assert.ok(requests[count].includes('regional_eastasia_1419'));
  assert.equal(maps.get('regional_eastasia_1592'),a);assert.equal(a.provinces.filter(p=>p.owner==='joseon').length,407);
});
await test('switching continents fetches that continent and world aliases share the same base',async()=>{
  const {maps,requests}=browser();await maps.ensure('regional_south_america_modern');const count=maps.assetInfo('regional_south_america_modern').files.length;assert.equal(requests.length,count);assert.ok(requests.every(url=>url.includes('regional_south_america_modern')));
  await maps.ensure('regional_world_modern');assert.equal(requests.length,count+maps.assetInfo('regional_world_modern').files.length);assert.equal(maps.isLoaded('world-detailed'),true);
  const worldCount=requests.filter(url=>url.includes('/world-detailed.')).length;
  const before=requests.length,additional=maps.assetInfo('regional_world_1754').files.filter(file=>!file.includes('/world-detailed.')).length;await maps.ensure('regional_world_1754');assert.equal(requests.length,before+additional);assert.equal(requests.filter(url=>url.includes('/world-detailed.')).length,worldCount);
});
await test('failed downloads do not register templates and retry keeps previous map intact',async()=>{
  let fail=true;const {maps,requests}=browser({fetch:async(url,init,asset)=>url.includes('regional_eastasia_1419')&&fail?response('missing',404):response(fs.readFileSync(path.join(root,asset.path),'utf8'))});
  const previous=await maps.ensure('regional_eastasia_1592');await assert.rejects(maps.ensure('regional_eastasia_1419'),/404/);
  assert.equal(maps.get(previous.id),previous);assert.equal(maps.isLoaded('regional_eastasia_1419'),false);
  fail=false;await maps.ensure('regional_eastasia_1419');assert.equal(requests.filter(url=>url.includes('regional_eastasia_modern')).length,manifest.assets.find(asset=>asset.id==='regional_eastasia_modern').parts.length+1);assert.equal(requests.filter(url=>url.includes('regional_eastasia_1419')).length,2);
});
await test('malformed era content cannot poison cache and is retryable',async()=>{
  let corrupt=true;const {maps}=browser({fetch:async(url,init,asset)=>{
    const body=fs.readFileSync(path.join(root,asset.path),'utf8');if(!corrupt||!url.includes('regional_eastasia_1592'))return response(body);
    const value=JSON.parse(body);value.changes[0][1].owner='no-such-owner';return response(JSON.stringify(value));
  }});
  await assert.rejects(maps.ensure('regional_eastasia_1592'));assert.equal(maps.isLoaded('regional_eastasia_1592'),false);
  corrupt=false;assert.equal((await maps.ensure('regional_eastasia_1592')).id,'regional_eastasia_1592');
});
await test('HTML error responses and oversize responses fail without changing selected cache',async()=>{
  let body='<html>not a map</html>';const {maps}=browser({fetch:async()=>response(body)});
  await assert.rejects(maps.ensure('eastasia1419'),/손상|크기/);body=' '.repeat(183100);await assert.rejects(maps.ensure('eastasia1419'),/크기/);assert.equal(maps.get('eastasia1419'),null);
});
await test('stalled requests time out, abort and permit a later retry',async()=>{
  let stalled=true,signal;
  const {maps,requests}=browser({setTimeout:fn=>setTimeout(fn,stalled?0:1000),fetch:async(url,init,asset)=>{
    signal=init.signal;
    if(stalled)return new Promise(()=>{});
    return response(fs.readFileSync(path.join(root,asset.path),'utf8'));
  }});
  await assert.rejects(maps.ensure('eastasia1419'),/초과/);assert.equal(signal.aborted,true);assert.equal(maps.get('eastasia1419'),null);
  stalled=false;assert.equal((await maps.ensure('eastasia1419')).id,'eastasia1419');assert.equal(requests.length,2);
});
await test('preinstalled offline assets synchronously reconstruct shared era maps',async()=>{
  const {maps,requests}=browser(),values={};for(const asset of manifest.assets.filter(asset=>asset.id==='regional_eastasia_modern'||asset.id==='regional_eastasia_1592'))values[asset.path]=logicalAsset(asset);
  maps.installAssets(values);const template=maps.get('regional_eastasia_1592');assert.equal(template.provinces.length,5591);await maps.ensure(template.id);assert.equal(requests.length,0);
});
await test('Node lazy lookup and standalone registration preserve all twenty-eight template contracts',async()=>{
  const maps=require('../map-templates.js');assert.equal(maps.get('missing'),null);assert.equal(maps.list().length,28);
  for(const metadata of maps.list()){const template=maps.get(metadata.id);assert.equal(template.provinces.length,metadata.provinceCount);assert.equal(maps.register(template),template);assert.equal(maps.get(metadata.id),template);}
  const sizes=JSON.parse(fs.readFileSync(path.join(root,'assets/maps/SIZES.json'),'utf8'));const world=sizes.templates.find(t=>t.id==='world-detailed'),east=sizes.templates.find(t=>t.id==='regional_eastasia_1592');
  assert.ok(source.length<60000);assert.ok(east.gzipBytes<world.gzipBytes*0.15);assert.ok(manifest.assets.every(asset=>/\.[a-f0-9]{16}\.json$/.test(asset.path)));
});
await test('all physical map files fit their web-upload budget and match byte, SHA-256 and gzip metrics',async()=>{
  assert.equal(manifest.assets.length,28);
  for(const asset of manifest.assets){
    let totalGzip=0,totalBytes=0;
    for(const file of [asset,...(asset.parts||[])]){
      const bytes=fs.readFileSync(path.join(root,file.path));const balancedCrop=manifest.templates.find(template=>template.id===asset.id)?.balancedRegionId;assert.ok(bytes.length<=(balancedCrop?8:1)*1024*1024,file.path);if(balancedCrop)assert.equal(asset.parts,undefined,'balanced crop is one JSON');assert.equal(bytes.length,file.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),file.sha256);assert.ok(file.path.includes(file.sha256.slice(0,16)));
      assert.equal(Buffer.from(bytes.toString('utf8'),'utf8').compare(bytes),0,'every fragment independently decodes as UTF-8');
      totalGzip+=zlib.gzipSync(bytes,{level:9}).length;totalBytes+=bytes.length;
      if(file!==asset)assert.equal(file.gzipBytes,zlib.gzipSync(bytes,{level:9}).length);
    }
    assert.equal(asset.gzipBytes,totalGzip);
    if(asset.parts){const index=JSON.parse(fs.readFileSync(path.join(root,asset.path),'utf8'));assert.equal(index.format,'hc-map-chunks-v1');assert.deepEqual(index.parts,asset.parts);assert.equal(totalBytes-asset.bytes,asset.contentBytes);}
  }
});
await test('a damaged same-length map fragment is rejected and retry succeeds',async()=>{
  let corrupt=true;const {maps,requests}=browser({fetch:async(url,init,asset)=>{
    const body=fs.readFileSync(path.join(root,asset.path),'utf8');return response(corrupt&&asset.path.endsWith('.txt')?'!'+body.slice(1):body);
  }});
  await assert.rejects(maps.ensure('regional_eastasia_1592'),/손상/);assert.equal(maps.isLoaded('regional_eastasia_1592'),false);
  corrupt=false;assert.equal((await maps.ensure('regional_eastasia_1592')).provinces.length,5591);
  assert.ok(requests.filter(url=>url.endsWith('.txt')).length>manifest.assets.find(asset=>asset.id==='regional_eastasia_modern').parts.length);
});
await test('fragment requests are limited to three in flight and preserve their original order',async()=>{
  let active=0,maximum=0;const {maps}=browser({fetch:async(url,init,asset)=>{
    if(asset.path.endsWith('.txt')){active++;maximum=Math.max(maximum,active);await new Promise(resolve=>setTimeout(resolve,5));active--;}
    return response(fs.readFileSync(path.join(root,asset.path),'utf8'));
  }});
  const selected=await maps.ensure('regional_eastasia_1592');assert.equal(maximum,3);assert.equal(active,0);assert.equal(JSON.stringify(selected),JSON.stringify(require('../map-templates.js').get(selected.id)));
});
console.log(passed+' map loader tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
