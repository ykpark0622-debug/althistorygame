'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),T=require('../map-templates.js');
const definitions=JSON.parse(fs.readFileSync(path.join(root,'tools/map-source/historical-presets.json'),'utf8'));
const prior=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/v2111-map-manifest.json'),'utf8'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'assets/maps/manifest.json'),'utf8'));
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
let passed=0;
async function test(name,fn){await fn();passed++;console.log('PASS '+name);}
function browser(){
 const requests=[];
 const context={URL,AbortController,TextEncoder,crypto:crypto.webcrypto,setTimeout,clearTimeout,location:{href:'https://maps.test/index.html'},document:{currentScript:{src:'https://maps.test/map-templates.js'}},fetch:async url=>{
  requests.push(url);const filename=new URL(url).pathname.slice(1);assert.ok(filename.startsWith('assets/maps/'));
  return{ok:true,status:200,headers:{get:()=>null},text:async()=>fs.readFileSync(path.join(root,filename),'utf8')};
 }};
 vm.runInNewContext(fs.readFileSync(path.join(root,'map-templates.js'),'utf8'),context);
 return{maps:context.MapTemplates,requests};
}
(async()=>{
await test('all twenty-eight prior templates, the five prior political definitions and original region/era choices are unchanged',()=>{
 assert.equal(prior.templates.length,28);assert.equal(definitions.length,15);assert.equal(manifest.templates.length,42);
 const hashes=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/v2111-historical-definition-hashes.json'),'utf8'));
 for(const before of hashes)assert.equal(hash(definitions.find(row=>row.id===before.id)),before.sha256,'Unchanged historical definition '+before.id);
 for(const template of prior.templates)assert.deepEqual(manifest.templates.find(row=>row.id===template.id),template,'Unchanged old template '+template.id);
 for(const asset of prior.assets)assert.deepEqual(manifest.assets.find(row=>row.id===asset.id),asset,'Unchanged old asset '+asset.id);
 assert.deepEqual(manifest.regions,prior.regions);assert.deepEqual(manifest.eras,prior.eras);
});
await test('all historical layouts reuse the original province identities, shapes and base source credits',()=>{
 for(const definition of definitions){
  const template=T.get(definition.id),base=T.get(definition.baseId),known=new Set(definition.countries.map(country=>country.id));
  assert.equal(template.provinces.length,base.provinces.length);assert.equal(Object.keys(definition.owners).length,base.provinces.length);
  assert.equal(template.historicalRegionId,definition.regionId);assert.equal(template.historicalEraId,definition.eraId);assert.equal(template.recommended,false);
  assert.deepEqual(template.historicalInitial,{occupation:definition.occupation||{},markers:definition.markers||{}});
  assert.deepEqual(template.countries,definition.countries);assert.deepEqual(template.credits,base.credits);
  for(let i=0;i<base.provinces.length;i++){
   const before=base.provinces[i],after=template.provinces[i];assert.equal(after.id,before.id);assert.equal(after.path,before.path);assert.deepEqual(after.bbox,before.bbox);assert.equal(after.cx,before.cx);assert.equal(after.cy,before.cy);
   assert.equal(after.owner,definition.owners[after.id]);assert.ok(known.has(after.owner));
   assert.equal(after.influence,definition.influence?.[after.id]);if(after.influence)assert.ok(known.has(after.influence));
  }
  const patch=manifest.assets.find(row=>row.id===definition.id);assert.equal(patch.type,'patch');assert.equal(patch.baseId,definition.baseId);assert.equal(patch.parts,undefined);assert.ok(patch.bytes<1024*1024,'Small political patch');
  const body=JSON.parse(fs.readFileSync(path.join(root,patch.path),'utf8'));assert.ok(!body.metadata.provinces);
  assert.ok(body.changes.every(change=>Object.keys(change[1]).every(key=>['owner','influence'].includes(key))));
 }
});
await test('offline political derivation produces exactly the same fifteen maps without extra geometry copies',()=>{
 const bases=[...new Set(definitions.map(definition=>definition.baseId))].map(id=>clone(T.get(id)));
 const context={MapTemplates:{get:id=>bases.find(template=>template.id===id)||null,list:()=>bases.map(template=>({id:template.id,name:template.name,provinceCount:template.provinces.length}))},HistoricalMapPresetDefinitions:clone(definitions)};
 vm.runInNewContext(fs.readFileSync(path.join(root,'tools/map-source/historical-presets.cjs'),'utf8'),context);
 assert.equal(context.HistoricalMapPresetDefinitions,undefined);
 for(const definition of definitions)assert.equal(hash(context.MapTemplates.get(definition.id)),hash(T.get(definition.id)),'Exact offline identity '+definition.id);
});
await test('offline research recipes reconstruct all four shared bases before the fifteen political wrappers',()=>{
 const bases=['world-balanced','world-detailed','europe-balanced'].map(id=>clone(T.get(id)));
 const context={MapTemplates:{get:id=>bases.find(template=>template.id===id)||null,list:()=>bases.map(template=>({id:template.id,name:template.name,provinceCount:template.provinces.length}))}};
 vm.runInNewContext(fs.readFileSync(path.join(root,'tools/map-source/research-bases.cjs'),'utf8'),context);
 for(const definition of context.MapTemplates.researchBases())assert.equal(hash(context.MapTemplates.get(definition.id)),hash(T.get(definition.id)),'Exact offline research base '+definition.id);
 context.HistoricalMapPresetDefinitions=clone(definitions);
 vm.runInNewContext(fs.readFileSync(path.join(root,'tools/map-source/historical-presets.cjs'),'utf8'),context);
 for(const definition of definitions)assert.equal(hash(context.MapTemplates.get(definition.id)),hash(T.get(definition.id)),'Research recipe and political patch identity '+definition.id);
});
await test('the region and era controls restore all historical choices and preserve existing era defaults',()=>{
 const context=vm.createContext({MapTemplates:T,console});
 vm.runInContext(fs.readFileSync(path.join(root,'editor.js'),'utf8'),context);
 const editor=context.ScenarioEditorV2;
 for(const definition of definitions){
  assert.deepEqual(clone(editor.mapSetupSelection(definition.id)),{regionId:definition.regionId,eraId:definition.eraId});
  assert.ok(editor.mapSetupEras(definition.regionId).some(era=>era.id===definition.eraId));
  assert.equal(editor.mapSetupTemplateId(definition.regionId,definition.eraId),definition.id);
  const draft={schemaVersion:2,mode:'chronicle',stats:[],flags:[],events:[],endings:[]};
  const plan=editor.planMapChange(draft,definition.id);assert.equal(plan.error,undefined);assert.equal(plan.nextMap.templateId,definition.id);
  if(definition.playerCountry)assert.equal(plan.nextMap.playerCountry,definition.playerCountry);
 }
 for(const region of T.regions()){
  const old=prior.eras[region.id];for(const era of old)assert.ok(editor.mapSetupEras(region.id).some(row=>row.id===era.id));
  assert.equal(editor.mapSetupDefault(region).eraId,['europe_med','world'].includes(region.id)?'balanced_modern':region.defaultEra);
 }
});
await test('a selected historical era loads only its shared balanced base and small patch, then reuses the base for another era',async()=>{
 for(const region of ['eastasia','europe_med','world']){
  const selected=definitions.filter(definition=>definition.regionId===region),{maps,requests}=browser();
  assert.equal(requests.length,0);
  const first=await maps.ensure(selected[0].id),info=maps.assetInfo(first.id);assert.equal(requests.length,info.files.length);
  assert.ok(requests.every(url=>info.files.some(file=>url.endsWith('/'+file))));assert.equal(hash(first),hash(T.get(first.id)));
  const before=requests.length,second=await maps.ensure(selected[1].id);
  assert.equal(requests.length,before+1,'Only one additional political patch');assert.equal(hash(second),hash(T.get(second.id)));
  assert.ok(!requests.some(url=>url.includes('world-detailed')));assert.equal(maps.isLoaded(first.id),true);
 }
});
await test('all four research atlas bases are lazy and sibling historical dates reuse their geometry',async()=>{
 for(const baseId of [...new Set(definitions.filter(row=>row.galleryDocument).map(row=>row.baseId))]){
  const selected=definitions.filter(row=>row.baseId===baseId),{maps,requests}=browser();
  assert.equal(requests.length,0);
  const first=await maps.ensure(selected[0].id),expected=maps.assetInfo(first.id).files;
  assert.deepEqual(requests.map(url=>new URL(url).pathname.slice(1)).sort(),[...expected].sort());
  for(const other of definitions.filter(row=>row.baseId!==baseId))assert.equal(maps.isLoaded(other.id),false,'Unselected political era stays unloaded');
  assert.equal(hash(first),hash(T.get(first.id)));
  if(selected[1]){const before=requests.length;await maps.ensure(selected[1].id);assert.equal(requests.length,before+1,'Sibling era fetches one political patch');}
 }
});
await test('historical occupation and marker defaults agree in the engine, preview and editor and can be cleared or restored',()=>{
 const template={id:'historical_defaults_test',name:'점령 기본값 검사',width:10,height:10,countries:[{id:'a',name:'갑국',color:'#123456'},{id:'b',name:'을국',color:'#654321'}],provinces:[{id:'p',name:'검사 지역',owner:'a',path:'M0,0L10,0L10,10Z',cx:5,cy:5}],historicalInitial:{occupation:{p:'b'},markers:{p:'점령 검사'}},defaultPlayerCountry:'a'};
 T.register(template);globalThis.MapTemplates=T;const E=require('../engine.js');globalThis.GameEngine=E;const D=require('../map-document.js');
 const doc=D.create({id:'historical_defaults_doc',templateId:template.id,title:'점령 기본값'});
 const scenario=D.toScenario(doc);Object.assign(scenario,{draft:false,start:'first',stats:[{id:'funds',name:'재정',initial:50,min:0,max:100}],events:[{id:'first',title:'검사',body:'검사',next:'END',choices:[{text:'완료',effects:{}}]}],endings:[{id:'normal',title:'완료',body:'완료',kind:'mixed',priority:0,immediate:false,when:[]}],defaultEnding:'normal'});
 assert.deepEqual(E.validateScenario(scenario).errors,[]);
 const state=E.createState(scenario,{seed:1});assert.equal(state.map.occupation.p,'b');assert.equal(state.map.markers.p,'점령 검사');
 const context=vm.createContext({MapTemplates:T,GameEngine:E});vm.runInContext(fs.readFileSync(path.join(root,'editor.js'),'utf8'),context);
 assert.deepEqual(clone(context.ScenarioEditorV2.initialMapState(scenario).map),state.map,'Fallback editor preview matches game');
 vm.runInContext(fs.readFileSync(path.join(root,'map-view.js'),'utf8'),context);
 assert.deepEqual(clone(context.MapView.initialState(scenario).map),state.map,'Map preview matches game');
 const cleared=clone(doc);cleared.map.initial.occupation={p:null};cleared.map.initial.markers={p:null};
 const normalized=D.normalize(cleared);assert.equal(normalized.map.initial.occupation.p,null);assert.equal(normalized.map.initial.markers.p,null);
 const clearScenario=clone(scenario);clearScenario.map=normalized.map;
 const clearState=E.createState(clearScenario,{seed:1});assert.equal(clearState.map.occupation.p,undefined);assert.equal(clearState.map.markers.p,undefined);
 assert.deepEqual(clone(context.MapView.initialState(clearScenario).map),clearState.map);assert.deepEqual(clone(context.ScenarioEditorV2.initialMapState(clearScenario).map),clearState.map);
 const next=E.choose(clearScenario,clearState,0);assert.deepEqual(E.restoreState(clearScenario,clone(next)),next,'Explicit clears survive replay');
});
console.log(passed+' historical preset integration tests passed.');
})().catch(error=>{console.error(error);process.exitCode=1;});
