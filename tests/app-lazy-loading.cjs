'use strict';
// Reuse the release harness's DOM, but inject a tiny delayed map registry. These
// tests exercise application state transitions without downloading map assets.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const harnessFile=path.join(__dirname,'release-compat.cjs');
let harness=fs.readFileSync(harnessFile,'utf8').split('let passed=0;')[0];
harness=harness.replace("    if(script.src==='app.js'||script.id==='app-script')context.ScenarioEditor=", "    if(script.src==='app.js'||script.id==='app-script')options.beforeApp?.(context);\n    if(script.src==='app.js'||script.id==='app-script')context.ScenarioEditor=");
const sandbox={require,__dirname,console,process,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,AbortController,Buffer};
vm.runInNewContext(harness+'\nthis.boot=boot;this.fixture=fixture;',sandbox,{filename:harnessFile});
const boot=sandbox.boot,fixture=sandbox.fixture;
const copy=value=>JSON.parse(JSON.stringify(value));
const savedKey='history-crossroads:web:v1:scenario',autoKey='history-crossroads:web:v1:autosave';
function mapped(id='map_a',title='지도 원고'){
  const data=fixture(title);data.schemaVersion=2;data.mode='chronicle';
  data.map={templateId:id,playerCountry:'a',countries:[],initial:{owners:{},occupation:{},influence:{},markers:{}}};return data;
}
function registry(initial=[]){
  const loaded=new Set(initial),requests=[],pending=new Map();let context;
  const template=id=>({id,name:id==='map_a'?'갑 지도':'을 지도',width:200,height:100,countries:[{id:'a',name:'갑국',color:'#123456'},{id:'b',name:'을국',color:'#778899'}],provinces:[{id:'alpha',name:'첫 지역',owner:'a',path:'M0 0L1 0L1 1Z'},{id:'beta',name:'둘째 지역',owner:'b',path:'M1 0L2 0L2 1Z'}]});
  return {requests,pending,get context(){return context;},install(ctx){
    context=ctx;ctx.MapView={render(){}};
    ctx.MapTemplates={get:id=>loaded.has(id)?template(id):null,list:()=>['map_a','map_b'].map(id=>({id,name:template(id).name})),regions:()=>[],selection:()=>null,
      ensure(id){requests.push(id);if(loaded.has(id))return Promise.resolve(template(id));let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});pending.set(id,{resolve(){loaded.add(id);resolve(template(id));},reject});return promise;}};
  }};
}
async function drain(){for(let i=0;i<30;i++)await Promise.resolve();}
function openGalleryHandoff(app,pending){
  const store=new Map([['hc:pendingImport',JSON.stringify(pending)]]);
  app.context.HC_COMMUNITY={};app.context.MutationObserver=class{observe(){}};
  app.context.sessionStorage={getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,String(value)),removeItem:key=>store.delete(key)};
  vm.runInContext(fs.readFileSync(path.resolve(__dirname,'../community-bridge.js'),'utf8'),app.context,{filename:'community-bridge.js'});
  return store;
}
let passed=0;
async function test(name,run){try{await run();passed++;console.log('PASS '+name);}catch(error){process.exitCode=1;console.error('FAIL '+name+'\n'+error.stack);}}

async function main(){
  await test('blank startup and home metadata download no map data',async()=>{
    const r=registry(),app=await boot({beforeApp:ctx=>r.install(ctx)});
    assert.deepEqual(r.requests,[]);assert.equal(app.scenario().draft,true);
    const manuscript=mapped(),stored=JSON.stringify(manuscript),auto=JSON.stringify({signature:'unused',state:{turn:4}});
    const h=registry(),home=await boot({url:'http://localhost:8123/index.html?home=1',entries:{[savedKey]:stored,[autoKey]:auto},beforeApp:ctx=>h.install(ctx)});
    assert.deepEqual(h.requests,[]);assert.deepEqual(copy(home.scenario()),copy(manuscript));assert.equal(home.api.getState(),null);
    assert.equal(home.storage.getItem(savedKey),stored);assert.equal(home.storage.getItem(autoKey),auto);assert.ok(home.node('resume-scenario-link'));
  });
  await test('a delayed map import preserves current work until success and freezes the incoming manuscript',async()=>{
    const r=registry(),app=await boot({beforeApp:ctx=>r.install(ctx)});app.api.importScenario(app.data(fixture('기존 원고')));app.submitName('이름');app.clickChoice(0);
    const state=copy(app.api.getState()),candidate=app.data(mapped());const loading=app.api.importScenario(candidate);candidate.title='외부 변경';
    assert.deepEqual(r.requests,['map_a']);assert.equal(app.scenario().title,'기존 원고');assert.deepEqual(copy(app.api.getState()),state);
    r.pending.get('map_a').resolve();await loading;assert.equal(app.scenario().title,'지도 원고');
  });
  await test('a later map import wins even if an earlier asset resolves afterwards',async()=>{
    const r=registry(),app=await boot({beforeApp:ctx=>r.install(ctx)});
    const first=app.api.importScenario(app.data(mapped('map_a','먼저 연 원고'))),second=app.api.importScenario(app.data(mapped('map_b','나중 원고')));
    r.pending.get('map_b').resolve();await second;r.pending.get('map_a').resolve();assert.equal(await first,null);assert.equal(app.scenario().title,'나중 원고');
  });
  await test('a failed asset preserves exact manuscript and save; retry can load the map',async()=>{
    const r=registry(),app=await boot({beforeApp:ctx=>r.install(ctx)});app.api.importScenario(app.data(fixture('기존 원고')));app.submitName('국왕');app.clickChoice(0);
    const state=copy(app.api.getState()),entries=Object.fromEntries(app.storage.data),loading=app.api.importScenario(app.data(mapped()));
    r.pending.get('map_a').reject(Error('network unavailable'));await assert.rejects(loading,/network unavailable/);
    assert.equal(app.scenario().title,'기존 원고');assert.deepEqual(copy(app.api.getState()),state);assert.deepEqual(Object.fromEntries(app.storage.data),entries);
    const retry=app.api.importScenario(app.data(mapped()));r.pending.get('map_a').resolve();await retry;assert.equal(app.scenario().map.templateId,'map_a');
  });
  await test('startup waits for its saved map before replaying autosave and leaves the original storage intact',async()=>{
    const ready=registry(['map_a']),original=await boot({beforeApp:ctx=>ready.install(ctx)});original.api.importScenario(original.data(mapped()));original.submitName('저장한 국왕');original.clickChoice(0);
    const before=copy(original.api.getState()),entries=Object.fromEntries(original.storage.data),r=registry();
    const loading=boot({entries,beforeApp:ctx=>r.install(ctx)});assert.deepEqual(r.requests,['map_a']);
    assert.equal(r.context.localStorage.getItem(savedKey),entries[savedKey]);assert.equal(r.context.localStorage.getItem(autoKey),entries[autoKey]);
    r.pending.get('map_a').resolve();const app=await loading;assert.deepEqual(copy(app.api.getState()),before);assert.deepEqual(Object.fromEntries(app.storage.data),entries);
  });
  await test('home opens its editor only after hydrating the saved map and original progress',async()=>{
    const ready=registry(['map_a']),original=await boot({beforeApp:ctx=>ready.install(ctx)});original.api.importScenario(original.data(mapped()));original.submitName('돌아온 국왕');original.clickChoice(0);
    const before=copy(original.api.getState()),r=registry(),home=await boot({url:'http://localhost:8123/index.html?home=1',entries:Object.fromEntries(original.storage.data),beforeApp:ctx=>r.install(ctx)});
    assert.deepEqual(r.requests,[]);home.node('edit-button').click();assert.deepEqual(r.requests,['map_a']);assert.equal(home.editorOpened,undefined);
    r.pending.get('map_a').resolve();await drain();assert.deepEqual(copy(home.api.getState()),before);assert.equal(home.editorOpened.scenario.map.templateId,'map_a');
  });
  await test('startup map failure retains an actionable retry and resumes the preserved save',async()=>{
    const ready=registry(['map_a']),original=await boot({beforeApp:ctx=>ready.install(ctx)});original.api.importScenario(original.data(mapped()));original.submitName('재시도 국왕');original.clickChoice(0);
    const before=copy(original.api.getState()),entries=Object.fromEntries(original.storage.data),r=registry(),loading=boot({entries,beforeApp:ctx=>r.install(ctx)});
    r.pending.get('map_a').reject(Error('offline'));const app=await loading;assert.equal(app.storage.getItem(autoKey),entries[autoKey]);assert.equal(app.api.getState(),null);
    const retry=app.doc.querySelector('[data-launch-action="retry-startup"]');assert.equal(retry.hidden,false);retry.click();r.pending.get('map_a').resolve();await drain();assert.deepEqual(copy(app.api.getState()),before);
  });
  await test('a different scenario URL loads only its selected map rather than the previously saved map',async()=>{
    const r=registry(),incoming=mapped('map_b','주소에서 온 지도');
    const loading=boot({url:'http://localhost:8123/index.html?scenario=next.json',entries:{[savedKey]:JSON.stringify(mapped('map_a','예전 지도'))},response:JSON.stringify(incoming),beforeApp:ctx=>r.install(ctx)});
    await drain();assert.deepEqual(r.requests,['map_b']);r.pending.get('map_b').resolve();const app=await loading;assert.equal(app.scenario().title,'주소에서 온 지도');assert.deepEqual(r.requests,['map_b']);
  });
  await test('AI map selection waits for the selected asset and stale completions cannot enable or rewrite its prompt',async()=>{
    const r=registry(),app=await boot({beforeApp:ctx=>r.install(ctx)});app.doc.querySelector('[data-launch-action="mode-ai"]').click();assert.deepEqual(r.requests,[]);
    let field=app.doc.querySelector('[data-ai-field="mapTemplateId"]');field.value='map_b';field.dispatch('change');await drain();
    assert.equal(app.doc.querySelector('[data-launch-action="ai-copy-prompt"]').disabled,true);
    field=app.doc.querySelector('[data-ai-field="mapTemplateId"]');field.value='map_a';field.dispatch('change');await drain();
    r.pending.get('map_b').resolve();await drain();assert.equal(app.doc.querySelector('[data-launch-action="ai-copy-prompt"]').disabled,true);
    r.pending.get('map_a').resolve();await drain();assert.equal(app.doc.querySelector('[data-launch-action="ai-copy-prompt"]').disabled,false);
    assert.match(app.doc.querySelector('[data-ai-prompt]').value,/templateId: map_a/);assert.doesNotMatch(app.doc.querySelector('[data-ai-prompt]').value,/templateId: map_b/);
  });
  await test('gallery consumes a pending scenario only after its selected map and import complete',async()=>{
    const r=registry(),app=await boot({beforeApp:ctx=>r.install(ctx)});app.api.importScenario(app.data(fixture('현재 작업')));
    const pending={id:'11111111-1111-4111-8111-111111111111',title:'공유 지도 시나리오',data:mapped('map_a','갤러리 원고')};
    const handoff=openGalleryHandoff(app,pending);await drain();assert.ok(handoff.has('hc:pendingImport'));assert.equal(app.scenario().title,'현재 작업');
    r.pending.get('map_a').resolve();await drain();assert.equal(handoff.has('hc:pendingImport'),false);assert.equal(app.scenario().title,'갤러리 원고');
    assert.equal(JSON.parse(app.storage.getItem('hc:galleryOrigin')).id,pending.id);
  });
  await test('gallery map failure leaves the pending manuscript and current progress available for retry',async()=>{
    const r=registry(),app=await boot({beforeApp:ctx=>r.install(ctx)});app.api.importScenario(app.data(fixture('계속할 원고')));app.submitName('기존 국왕');app.clickChoice(0);
    const before=copy(app.api.getState()),pending={id:'22222222-2222-4222-8222-222222222222',title:'다시 열 원고',data:mapped()};
    const handoff=openGalleryHandoff(app,pending);await drain();r.pending.get('map_a').reject(Error('offline'));await drain();
    assert.deepEqual(JSON.parse(handoff.get('hc:pendingImport')),copy(pending));assert.deepEqual(copy(app.api.getState()),before);assert.equal(app.scenario().title,'계속할 원고');
  });
  console.log(passed+' lazy application checks passed');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
