'use strict';
// Maker-only regression harness: no Supabase, analytics or other remote calls.
// These short stories are fixtures only; published examples remain separate JSON.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const dist=path.resolve(__dirname,'..');
const hostedAnalytics=source=>/^\/_vercel\/(?:insights|speed-insights)\//.test(source||'');
const clone=value=>JSON.parse(JSON.stringify(value));
function fixture(title='QA가 만든 임시 원고'){
  return {schemaVersion:1,id:'release_fixture',title,subtitle:'검사용 임시 부제',description:'배포파일에 들어가면 안 되는 임시 원고 설명',start:'first',
    stats:[{id:'trust',name:'신뢰',initial:50,min:0,max:100}],flags:[],
    events:[{id:'first',title:'임시사건 첫날',body:'{name}, 검사용 첫날 본문입니다.',next:'second',choices:[{text:'검사용 선택을 한다.',effects:{trust:5}}]},
      {id:'second',title:'임시사건 다음날',body:'{{name}}, 검사용 둘째 날 본문입니다.',next:'END',choices:[{text:'검사용 이야기를 마친다.',effects:{}}]}],
    endings:[{id:'end',title:'검사용 결말',body:'검사용 마지막 본문입니다.',kind:'mixed',priority:0,immediate:false,when:[]}],defaultEnding:'end'};
}
class FakeElement{
  constructor(doc,tag='div',attributes={}){this.doc=doc;this.tagName=tag.toUpperCase();this.attributes={};this.dataset={};this.children=[];this.parentElement=null;this.listeners={};this._html='';this._text='';this.value='';this.files=[];this.hidden=false;this.disabled=false;this.open=false;this.className='';this.style={};this.classList={add:(...values)=>{this.className=[...new Set([...this.className.split(/\s+/).filter(Boolean),...values])].join(' ');},remove:(...values)=>{this.className=this.className.split(/\s+/).filter(value=>value&&!values.includes(value)).join(' ');},toggle:(value,force)=>{const exists=this.classList.contains(value),next=force===undefined?!exists:Boolean(force);if(next)this.classList.add(value);else this.classList.remove(value);return next;},contains:value=>this.className.split(/\s+/).includes(value)};for(const [key,value]of Object.entries(attributes))this.setAttribute(key,value);}
  set id(value){if(this.attributes.id)this.doc.ids.delete(this.attributes.id);this.attributes.id=String(value);if(value)this.doc.ids.set(String(value),this);}
  get id(){return this.attributes.id||'';}
  get ownerDocument(){return this.doc;}
  setAttribute(key,value){if(key==='id'){this.id=value;return;}this.attributes[key]=String(value);if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value);if(key==='class')this.className=String(value);if(['disabled','hidden','open'].includes(key))this[key]=true;}
  getAttribute(key){return this.attributes[key]??null;}
  removeAttribute(key){delete this.attributes[key];if(['disabled','hidden','open'].includes(key))this[key]=false;}
  get textContent(){return this._text;}
  set textContent(value){this.clearChildren();this._text=String(value??'');this._html='';}
  get innerHTML(){return this._html;}
  set innerHTML(value){this.clearChildren();this._html=String(value??'');this._text='';this.doc.parseChildren(this,this._html);}
  insertAdjacentHTML(position,value){this.innerHTML=position==='afterbegin'?String(value)+this.innerHTML:this.innerHTML+String(value);}
  clearChildren(){for(const child of [...this.children])child.remove();this.children=[];}
  append(...children){for(let child of children){if(typeof child==='string')child=this.doc.createTextNode(child);child.parentElement=this;this.children.push(child);}}
  prepend(...children){for(const child of children.reverse()){child.parentElement=this;this.children.unshift(child);}}
  replaceChildren(...children){this.clearChildren();this._html='';this._text='';this.append(...children);}
  remove(){this.clearChildren();if(this.id&&this.doc.ids.get(this.id)===this)this.doc.ids.delete(this.id);if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(child=>child!==this);this.parentElement=null;}
  addEventListener(type,listener){(this.listeners[type]??=[]).push(listener);}
  removeEventListener(type,listener){this.listeners[type]=(this.listeners[type]||[]).filter(item=>item!==listener);}
  matches(selector){
    if(selector.includes(','))return selector.split(',').some(part=>this.matches(part.trim()));
    if(selector.startsWith('#'))return this.id===selector.slice(1);
    const attr=selector.match(/^([a-z]+)?\[([^=\]]+)(?:=["']?([^\]"']+)["']?)?\]$/i);
    if(attr)return(!attr[1]||this.tagName===attr[1].toUpperCase())&&this.getAttribute(attr[2])!==null&&(attr[3]===undefined||this.getAttribute(attr[2])===attr[3]);
    if(selector.startsWith('.'))return this.className.split(/\s+/).includes(selector.slice(1));
    return this.tagName===selector.toUpperCase();
  }
  closest(selector){let current=this;while(current){if(current.matches(selector))return current;current=current.parentElement;}return null;}
  querySelectorAll(selector){const found=[];const visit=node=>{for(const child of node.children){if(child.matches(selector))found.push(child);visit(child);}};visit(this);return found;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  contains(node){for(let current=node;current;current=current.parentElement)if(current===this)return true;return false;}
  dispatch(type,event={}){event.target??=this;event.preventDefault??=()=>{event.defaultPrevented=true;};event.stopPropagation??=()=>{event.stopped=true;};let current=this;while(current){for(const listener of current.listeners[type]||[])listener(event);if(typeof current['on'+type]==='function')current['on'+type](event);if(event.stopped)return event;current=current.parentElement;}this.doc.dispatch(type,event);return event;}
  click(){if(this.tagName==='A'){this.doc.downloads.push({name:this.download,text:this.doc.blobs.get(this.href)});return;}this.dispatch('click');}
  focus(){this.doc.activeElement=this;}
  scrollIntoView(){}
  showModal(){this.open=true;this.setAttribute('open','');}
  close(){this.open=false;this.removeAttribute('open');}
}
class FakeDocument{
  constructor(index,options={}){this.ids=new Map();this.listeners={};this.all=[];this.title='역사의 갈림길';this.downloads=[];this.blobs=new Map();this.activeElement=null;this.options=options;this.body=this.createElement('body');this.parseChildren(this.body,index);this.documentElement={get outerHTML(){return '';}};}
  createElement(tag){const node=new FakeElement(this,tag);this.all.push(node);return node;}
  createElementNS(ns,tag){return this.createElement(tag);}
  createTextNode(text){const node=this.createElement('span');node.textContent=text;return node;}
  getElementById(id){return this.ids.get(id)||null;}
  parseChildren(parent,html){const markup=html.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script\s*>)/gi,'$1$2').replace(/(<style\b[^>]*>)[\s\S]*?(<\/style\s*>)/gi,'$1$2');for(const match of markup.matchAll(/<([a-z][a-z0-9-]*)\b([^>]*)>/gi)){const node=this.createElement(match[1]);for(const attr of match[2].matchAll(/([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g))node.setAttribute(attr[1],attr[2]??attr[3]??attr[4]??'');parent.append(node);}}
  addEventListener(type,listener){(this.listeners[type]??=[]).push(listener);}
  dispatch(type,event){for(const listener of this.listeners[type]||[])listener(event);}
  removeEventListener(type,listener){this.listeners[type]=(this.listeners[type]||[]).filter(item=>item!==listener);}
  querySelectorAll(selector){return this.all.filter(node=>(node===this.body||this.body.contains(node))&&node.matches(selector));}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  cloneNode(){
    const copy=new FakeDocument('');copy.title=this.title;
    for(const [id,node]of this.ids){const next=copy.createElement(node.tagName.toLowerCase());next.id=id;next._html=node.innerHTML;next._text=node.textContent;next.value=node.value;for(const [key,value]of Object.entries(node.attributes))next.setAttribute(key,value);copy.body.append(next);}
    copy.documentElement={get outerHTML(){return '<html><head><title>'+copy.title+'</title></head><body>'+[...copy.ids].filter(([id])=>!['player-name-input','player-name-form','name-error'].includes(id)).map(([id,node])=>node.tagName==='SCRIPT'?'<script id="'+id+'"'+(node.getAttribute('type')?' type="'+node.getAttribute('type')+'"':'')+'>'+node.textContent+node.innerHTML+'</script>':'<div id="'+id+'">'+node.textContent+node.innerHTML+'</div>').join('')+'</body></html>';}};
    return copy;
  }
}
function memoryStorage(entries={}){const data=new Map(Object.entries(entries));return{data,get length(){return data.size;},key:index=>[...data.keys()][index]??null,getItem:key=>data.has(key)?data.get(key):null,setItem:(key,value)=>data.set(key,String(value)),removeItem:key=>data.delete(key)};}
async function boot(options={}){
  const index=fs.readFileSync(path.join(dist,options.singleFile?'standalone.html':'index.html'),'utf8');
  const doc=new FakeDocument(index),storage=memoryStorage(options.entries),requests=[];let editorOpened;
  const scripts=[...index.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].map(match=>({attributes:match[1],source:match[2],src:match[1].match(/\bsrc="([^"]+)"/)?.[1],id:match[1].match(/\bid="([^"]+)"/)?.[1]}));
  for(const script of scripts)if(script.id&&doc.getElementById(script.id))doc.getElementById(script.id).textContent=script.source;
  const location=new URL(options.url||'http://localhost:8123/index.html');
  const fetch=async(url,init={})=>{
    const target=new URL(String(url),location.href);requests.push({url:target.href,init});
    const response=options.response;
    if(response instanceof Error)throw response;
    let text;
    if(response!==undefined)text=typeof response==='string'?response:response.text;
    else if(target.origin===location.origin&&fs.existsSync(path.join(dist,path.basename(target.pathname))))text=fs.readFileSync(path.join(dist,path.basename(target.pathname)),'utf8');
    else throw Error('Unexpected fetch: '+target.href);
    return {ok:response?.ok??true,status:response?.status??200,url:response?.url??target.href,headers:{get:key=>key.toLowerCase()==='content-length'?(response?.length??String(Buffer.byteLength(text))):null},body:response?.body??null,text:async()=>text};
  };
  class FileReader{constructor(){this.listeners={};this.result=null;}addEventListener(type,fn){this.listeners[type]=fn;}readAsText(file){Promise.resolve().then(()=>file.text()).then(text=>{this.result=text;this.listeners.load?.();this.onload?.({target:this});},()=>{this.listeners.error?.();this.onerror?.();});}}
  class DOMParser{parseFromString(text){const parsed=new FakeDocument(text);for(const match of text.matchAll(/<script\b[^>]*id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/script\s*>/gi)){const node=parsed.getElementById(match[1]);if(node)node.textContent=match[2];}return parsed.cloneNode();}}
  const context=vm.createContext({document:doc,localStorage:storage,location,URL,URLSearchParams,TextEncoder,TextDecoder,Uint8Array,ArrayBuffer,AbortController,Blob:class{constructor(parts){this.text=parts.join('');}},FileReader,DOMParser,fetch,console,
    setTimeout:()=>0,clearTimeout(){},requestAnimationFrame:()=>0,cancelAnimationFrame(){},confirm:()=>true,crypto:{getRandomValues:array=>{array[0]=0;return array;}}});
  context.window=context;context.globalThis=context;
  context.addEventListener=(...args)=>doc.addEventListener(...args);
  context.removeEventListener=(...args)=>doc.removeEventListener(...args);
  context.URL=class extends URL{};context.URL.createObjectURL=blob=>{const id='blob:'+doc.blobs.size;doc.blobs.set(id,blob.text);return id;};context.URL.revokeObjectURL=()=>{};
  for(const script of scripts){
    if(/\btype=["']application\/json["']/.test(script.attributes))continue;
    // Community transport is outside this deterministic, local maker test scope.
    if(script.src==='community-bridge.js'||hostedAnalytics(script.src))continue;
    if(script.src==='app.js'||script.id==='app-script')context.ScenarioEditor={open:(scenario,onApply,settings)=>{editorOpened={scenario,onApply,options:settings};},close:()=>options.editorClose!==false};
    vm.runInContext(script.src?fs.readFileSync(path.join(dist,script.src),'utf8'):script.source,context,{filename:script.src||script.id||'inline-script'});
    if(script.src==='map-templates.js')require('./preloaded-map-fixture.cjs')(context);
  }
  if(context.HistoryCrossroads?.ready)await context.HistoryCrossroads.ready;
  const drain=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
  await drain();
  return{context,doc,storage,requests,drain,get api(){return context.HistoryCrossroads;},get editorOpened(){return editorOpened;},node:id=>doc.getElementById(id),
    scenario:()=>clone(context.HistoryCrossroads.getScenario()),
    data(value){context.qaImportJSON=JSON.stringify(value);return vm.runInContext('JSON.parse(qaImportJSON)',context);},
    submitName(name){const input=doc.getElementById('player-name-input');assert.ok(input,'Expected name input');input.value=name;doc.getElementById('player-name-form').dispatch('submit');},
    clickChoice(index){const choice=doc.getElementById('story-panel').querySelectorAll('[data-choice]').find(node=>node.dataset.choice===String(index));assert.ok(choice,'Expected rendered choice');choice.click();},
    file(text,size=Buffer.byteLength(text)){return{name:'scenario.json',size,type:'application/json',text:async()=>text};}
  };
}
let passed=0;
async function test(name,run){try{await run();passed++;process.stdout.write('PASS '+name+'\n');}catch(error){process.exitCode=1;process.stderr.write('FAIL '+name+'\n'+error.stack+'\n');}}
async function fails(action,pattern){let caught;try{await action();}catch(error){caught=error;}assert.ok(caught,'Expected import rejection');if(pattern)assert.match(caught.message,pattern);}
function clickPart(app,eventId,index=0){const node=app.node('story-panel').querySelectorAll('[data-part-choice]').find(item=>item.dataset.partEvent===eventId&&item.dataset.partChoice===String(index));assert.ok(node,'Expected part choice '+eventId);assert.equal(node.disabled,false);node.click();}
function settle(app){const node=app.node('story-panel').querySelector('[data-action="settle-reign"]');assert.ok(node,'Expected settle action');assert.equal(node.disabled,false);node.click();}
function reignFixture(){const s=fixture('통합 검사 치세');s.schemaVersion=2;s.mode='reign';s.events[0].part='civil';s.events[0].choices[0].result='민정 결정의 결과 {name}';s.events[0].choices[0].next='RETURN';s.events[1].part='military';s.events[1].choices[0].result='군정 결정의 결과 {name}';s.events.push({id:'response',title:'돌발 대응 본문',body:'{name}의 돌발 대응',next:'RETURN',choices:[{text:'대응을 마친다',result:'돌발 대응의 결과 {name}'}]});s.randomEvents=[{id:'once',title:'검사용 돌발',eventId:'response',chance:100,priority:1,once:true}];s.reign={parts:[{id:'civil',name:'민정'},{id:'military',name:'군정'}],turns:[{id:'one',date:'1701',title:'치세 첫해',body:'첫해 통합 검사',eventIds:['first','second'],between:[{id:'entry',text:'연초 지원 {name}',effects:{trust:1}}],settlements:[{id:'balance',text:'첫해 정산 결과 {name}',effects:{trust:2}}]},{id:'two',date:'1702',title:'치세 둘째 해',eventIds:['first','second'],between:[{id:'defer',text:'다음 해의 결과 {name}',effects:{trust:3}}],settlements:[{id:'last',text:'최종 정산 결과 {name}',effects:{trust:4}}]}]};return s;}

async function main(){
  await test('program starts with a blank draft, exposes clone-based API, and stores under a fixed release namespace',async()=>{
    const app=await boot();assert.ok(app.api);for(const name of ['getScenario','importScenario','importText','newScenario','resumeScenario','startScenarioOver'])assert.equal(typeof app.api[name],'function');
    const blank=app.scenario();assert.equal(blank.draft,true);assert.deepEqual(blank.events,[]);assert.deepEqual(blank.stats,[]);assert.deepEqual(blank.endings,[]);
    const changed=app.api.getScenario();changed.title='외부 변경';assert.notEqual(app.scenario().title,'외부 변경');
    await app.api.importScenario(app.data(fixture()));assert.ok(app.storage.data.has('history-crossroads:web:v1:scenario'));
    assert.equal([...app.storage.data.keys()].some(key=>key.startsWith('history-crossroads:v1:')),false);
    const isolated=await boot({entries:{'history-crossroads:v1:ql622c:scenario':JSON.stringify(fixture('과거 묶음의 원고'))}});
    assert.deepEqual(isolated.scenario().events,[],'Program-only release must not silently import old example namespaces');
  });
  await test('BOM JSON import enters the name gate and gameplay/manual save/reload preserve the imported story and player',async()=>{
    const app=await boot();await app.api.importText('\uFEFF'+JSON.stringify(fixture()));assert.ok(app.node('player-name-form'));assert.equal(app.node('save-button').disabled,true);
    app.submitName('검증 국왕');app.clickChoice(0);app.node('save-button').click();
    const save=JSON.parse(app.storage.getItem('history-crossroads:web:v1:save'));assert.equal(save.state.playerName,'검증 국왕');assert.equal(save.state.stats.trust,55);
    const reloaded=await boot({entries:Object.fromEntries(app.storage.data)});assert.equal(reloaded.scenario().id,'release_fixture');assert.equal(reloaded.api.getState(),null);assert.equal(reloaded.node('player-name-form'),null);
    assert.ok(reloaded.node('resume-scenario-link'));assert.ok(reloaded.node('restart-scenario-button'));await reloaded.api.resumeScenario();
    assert.ok(reloaded.node('story-panel').innerHTML.includes('검증 국왕'));assert.ok(reloaded.node('story-panel').innerHTML.includes('둘째 날'));
    reloaded.node('edit-button').click();assert.equal(reloaded.editorOpened.scenario.id,'release_fixture');
  });
  await test('malformed JSON, invalid schema, and oversized text reject without replacing the current scenario or saved progress',async()=>{
    const app=await boot();await app.api.importScenario(app.data(fixture()));app.submitName('기존 이름');app.clickChoice(0);
    const before=app.scenario(),saved=Object.fromEntries(app.storage.data);
    await fails(()=>app.api.importText('{broken'));
    await fails(()=>app.api.importScenario(app.data({...fixture(),start:'missing'})));
    await fails(()=>app.api.importText(JSON.stringify(fixture())+' '.repeat(5*1024*1024)),/5\s*MB|5메가|5\s*MiB/i);
    assert.deepEqual(app.scenario(),before);assert.deepEqual(Object.fromEntries(app.storage.data),saved);
  });
  await test('new scenario opens an empty flow editor and blank drafts survive reload',async()=>{
    const app=await boot();await app.api.importScenario(app.data(fixture()));await app.api.newScenario();assert.equal(app.scenario().draft,true);assert.deepEqual(app.scenario().events,[]);
    assert.equal(app.editorOpened.options.page,'flowchart');assert.deepEqual(clone(app.editorOpened.scenario.events),[]);
    const reloaded=await boot({entries:Object.fromEntries(app.storage.data)});assert.deepEqual(reloaded.scenario().events,[]);assert.equal(reloaded.node('player-name-form'),null);
  });
  await test('opening a saved mapless story waits on home without changing progress or accepting keyboard choices',async()=>{
    const seed=await boot();await seed.api.importScenario(seed.data(fixture('선택을 기다리는 원고')));seed.submitName('원래 국왕');seed.clickChoice(0);seed.node('save-button').click();
    const entries=Object.fromEntries(seed.storage.data),before=clone(seed.api.getState());
    for(const suffix of ['', '?home=1']){
      const app=await boot({url:'http://localhost:8123/index.html'+suffix,entries});
      assert.equal(app.api.getState(),null);assert.ok(app.doc.body.classList.contains('is-home'));assert.equal(app.node('player-map-panel').hidden,true);
      assert.match(app.node('story-panel').innerHTML,/선택을 기다리는 원고/);assert.ok(app.node('resume-scenario-link'));assert.ok(app.node('restart-scenario-button'));
      app.doc.dispatch('keydown',{key:'1',target:app.doc.body,preventDefault(){}});
      assert.deepEqual(Object.fromEntries(app.storage.data),entries);assert.equal(app.requests.length,0);
      app.node('resume-scenario-link').click();await app.drain();assert.deepEqual(clone(app.api.getState()),before);assert.equal(app.doc.body.classList.contains('is-home'),false);
    }
  });
  await test('starting the saved story over resets gameplay after explicit name submission and preserves the manual save and collection',async()=>{
    const seed=await boot();await seed.api.importScenario(seed.data(fixture('처음으로 돌아갈 원고')));seed.submitName('지난 국왕');seed.clickChoice(0);seed.node('save-button').click();seed.clickChoice(0);
    const entries=Object.fromEntries(seed.storage.data),app=await boot({entries}),autoKey='history-crossroads:web:v1:autosave',saveKey='history-crossroads:web:v1:save';
    assert.ok(Object.keys(entries).some(key=>key.includes(':collection:')));
    app.node('restart-scenario-button').click();await app.drain();assert.ok(app.node('player-name-form'));assert.equal(app.api.getState().turn,0);assert.equal(app.api.getState().stats.trust,50);assert.equal(app.api.getState().history.length,0);
    assert.equal(app.storage.getItem(autoKey),entries[autoKey]);assert.equal(app.storage.getItem(saveKey),entries[saveKey]);
    app.submitName('새 국왕');assert.equal(app.api.getState().playerName,'새 국왕');assert.equal(JSON.parse(app.storage.getItem(autoKey)).state.history.length,0);
    assert.equal(app.storage.getItem(saveKey),entries[saveKey]);for(const key of Object.keys(entries).filter(key=>key.includes(':collection:')))assert.equal(app.storage.getItem(key),entries[key]);
    assert.equal(app.scenario().title,'처음으로 돌아갈 원고');assert.equal(app.doc.body.classList.contains('is-home'),false);
  });
  await test('starting a saved story without a name gate writes its fresh state only after the explicit action',async()=>{
    const seed=await boot(),source=fixture('이름 입력 없는 원고');source.player={askName:false,defaultName:'왕'};await seed.api.importScenario(seed.data(source));seed.clickChoice(0);seed.node('save-button').click();
    const entries=Object.fromEntries(seed.storage.data),app=await boot({entries}),saveKey='history-crossroads:web:v1:save';
    assert.deepEqual(Object.fromEntries(app.storage.data),entries);await app.api.startScenarioOver();assert.equal(app.api.getState().turn,0);assert.equal(app.node('player-name-form'),null);assert.equal(app.api.getState().stats.trust,50);
    assert.equal(JSON.parse(app.storage.getItem('history-crossroads:web:v1:autosave')).state.turn,0);assert.equal(app.storage.getItem(saveKey),entries[saveKey]);
  });
  await test('file chooser and drop zone load JSON while oversize and broken files preserve the current story',async()=>{
    const app=await boot(),input=app.node('scenario-import');assert.ok(input);
    input.files=[app.file('\uFEFF'+JSON.stringify(fixture('파일 선택으로 연 원고')))];input.dispatch('change');await app.drain();
    assert.equal(app.scenario().title,'파일 선택으로 연 원고');
    app.node('open-scenario-button').click();const drop=app.doc.querySelector('[data-scenario-dropzone]');assert.ok(drop);
    drop.dispatch('drop',{dataTransfer:{files:[app.file(JSON.stringify(fixture('끌어서 연 원고')))],types:['Files']}});await app.drain();
    assert.equal(app.scenario().title,'끌어서 연 원고');
    const before=app.scenario();input.files=[app.file(JSON.stringify(fixture()),5*1024*1024+1)];input.dispatch('change');await app.drain();assert.deepEqual(app.scenario(),before);
    assert.ok(app.doc.querySelectorAll('[data-launch-error]').some(node=>/5\s*MB/i.test(node.textContent)));
    input.files=[app.file('{bad')];input.dispatch('change');await app.drain();assert.deepEqual(app.scenario(),before);
  });
  await test('same-origin relative query URLs auto-load over HTTP with redirects disabled',async()=>{
    const app=await boot({url:'https://example.test/player/index.html?scenario=fixtures%2Fstory.json',response:JSON.stringify(fixture('주소로 연 원고'))});
    assert.equal(app.scenario().title,'주소로 연 원고');assert.equal(app.requests.length,1);
    assert.equal(app.requests[0].url,'https://example.test/player/fixtures/story.json');assert.equal(app.requests[0].init.redirect,'error');
  });
  await test('foreign origins, non-HTTP protocols, embedded credentials, and file-page URL loading are blocked before fetch',async()=>{
    for(const [page,requested]of [
      ['https://example.test/index.html','https://outside.test/story.json'],
      ['https://example.test/index.html','//outside.test/story.json'],
      ['https://example.test/index.html','file:///C:/story.json'],
      ['https://example.test/index.html','javascript:alert(1)'],
      ['https://example.test/index.html','https://user:pass@example.test/story.json'],
      ['file:///C:/player/index.html','story.json']
    ]){
      const app=await boot({url:page+'?scenario='+encodeURIComponent(requested)});
      assert.equal(app.requests.length,0,requested);assert.deepEqual(app.scenario().events,[]);assert.ok(app.doc.querySelectorAll('[data-launch-error]').some(node=>node.textContent));
    }
  });
  await test('failed HTTP, malformed remote JSON, oversized response, and cross-origin final URL retain prior saved scenario',async()=>{
    const seed=await boot();await seed.api.importScenario(seed.data(fixture('이미 저장한 원고')));seed.submitName('기존 플레이어');seed.clickChoice(0);
    const entries=Object.fromEntries(seed.storage.data);
    for(const response of [
      new Error('network failure'),{ok:false,status:404,text:''},'{broken',
      {length:String(5*1024*1024+1),text:JSON.stringify(fixture())},
      {text:JSON.stringify(fixture()),url:'https://outside.test/story.json'},
      JSON.stringify(fixture())+' '.repeat(5*1024*1024)
    ]){
      const app=await boot({url:'https://example.test/index.html?scenario=story.json',entries,response});
      assert.equal(app.scenario().title,'이미 저장한 원고');assert.equal(app.node('player-name-form'),null);
      assert.deepEqual(Object.fromEntries(app.storage.data),entries,'Failed request must not replace storage');
    }
  });
  await test('streamed UTF-8 loads safely and oversized or malformed streams roll back',async()=>{
    function stream(chunks){let index=0;const audit={cancelled:false,released:false};return{audit,body:{getReader:()=>({read:async()=>index<chunks.length?{done:false,value:chunks[index++]}:{done:true},cancel:async()=>{audit.cancelled=true;},releaseLock:()=>{audit.released=true;}})}};}
    const text=JSON.stringify(fixture('스트림으로 읽은 원고')),bytes=new TextEncoder().encode(text),valid=stream([bytes.slice(0,31),bytes.slice(31)]);
    const good=await boot({url:'https://example.test/index.html?scenario=stream.json',response:{text:'',length:'0',body:valid.body}});
    assert.equal(good.scenario().title,'스트림으로 읽은 원고');assert.equal(valid.audit.released,true);
    const oversized=stream([new Uint8Array(3*1024*1024),new Uint8Array(3*1024*1024)]);
    const tooLarge=await boot({url:'https://example.test/index.html?scenario=large.json',response:{text:'',length:'0',body:oversized.body}});
    assert.deepEqual(tooLarge.scenario().events,[]);assert.equal(oversized.audit.cancelled,true);assert.equal(oversized.audit.released,true);
    const invalid=stream([new Uint8Array([0xff,0xfe])]);
    const bad=await boot({url:'https://example.test/index.html?scenario=bad.json',response:{text:'',length:'0',body:invalid.body}});
    assert.deepEqual(bad.scenario().events,[]);assert.ok(bad.doc.querySelectorAll('[data-launch-error]').some(node=>/UTF-8/.test(node.textContent)));
  });
  await test('reopening an unchanged linked story retains its existing named autosave',async()=>{
    const source=fixture('같은 링크의 원고'),url='https://example.test/index.html?scenario=again.json',app=await boot({url,response:JSON.stringify(source)});app.submitName('이어 하는 이름');app.clickChoice(0);
    const entries=Object.fromEntries(app.storage.data);
    const reopened=await boot({url,entries,response:JSON.stringify(source)});
    assert.equal(reopened.api.getState(),null);assert.equal(reopened.requests.length,0);await reopened.api.resumeScenario();
    assert.deepEqual(Object.fromEntries(reopened.storage.data),entries);assert.equal(reopened.node('player-name-form'),null);
    assert.ok(reopened.node('story-panel').innerHTML.includes('이어 하는 이름'));assert.ok(reopened.node('story-panel').innerHTML.includes('둘째 날'));
  });
  await test('reopening the same linked URL preserves locally edited story content and saved drafts without fetching the server original',async()=>{
    const url='https://example.test/index.html?scenario=linked.json',original=fixture('서버에 있는 원고');
    for(const draft of [false,true]){
      const app=await boot({url,response:JSON.stringify(original)});app.node('edit-button').click();
      const edited=clone(original);edited.events[0].body='작성자가 이 브라우저에서 바꾼 새 본문';if(draft)edited.draft=true;
      app.editorOpened.onApply(app.data(edited));
      const reopened=await boot({url,entries:Object.fromEntries(app.storage.data),response:JSON.stringify(original)});
      assert.equal(reopened.requests.length,0,'An already adopted URL must prefer local author changes');
      assert.equal(reopened.scenario().events[0].body,edited.events[0].body);assert.equal(reopened.scenario().draft,draft?true:undefined);
    }
  });
  await test('direct JSON replacements and newly emptied drafts remain local when the same linked URL is reopened',async()=>{
    const url='https://example.test/index.html?scenario=linked.json',original=fixture('교체 전 서버 원고');
    for(const action of ['replace','blank']){
      const app=await boot({url,response:JSON.stringify(original)});
      if(action==='replace')await app.api.importText(JSON.stringify(fixture('사용자가 직접 연 별도 원고')));else await app.api.newScenario();
      const expected=app.scenario(),reopened=await boot({url,entries:Object.fromEntries(app.storage.data),response:JSON.stringify(original)});
      assert.equal(reopened.requests.length,0,'Manual decisions at the current linked URL must survive reload');assert.deepEqual(reopened.scenario(),expected);
    }
  });
  await test('opening a different scenario query fetches the new story after local changes to the old query',async()=>{
    const first=await boot({url:'https://example.test/index.html?scenario=first.json',response:JSON.stringify(fixture('첫 링크 원고'))});
    await first.api.importScenario(first.data(fixture('첫 링크에서 직접 고친 원고')));
    const changed=await boot({url:'https://example.test/index.html?scenario=second.json',entries:Object.fromEntries(first.storage.data),response:JSON.stringify(fixture('둘째 링크 원고'))});
    assert.equal(changed.requests.length,1);assert.equal(changed.requests[0].url,'https://example.test/second.json');assert.equal(changed.scenario().title,'둘째 링크 원고');
  });
  await test('manual replacement on the plain root page invalidates old linked context before an old URL is revisited',async()=>{
    const linked='https://example.test/index.html?scenario=linked.json',original=fixture('예전에 링크로 연 서버 원고');
    const first=await boot({url:linked,response:JSON.stringify(original)});
    const plain=await boot({url:'https://example.test/index.html',entries:Object.fromEntries(first.storage.data)});
    await plain.api.importScenario(plain.data(fixture('루트 화면에서 직접 연 새 원고')));
    const revisited=await boot({url:linked,entries:Object.fromEntries(plain.storage.data),response:JSON.stringify(original)});
    assert.equal(revisited.requests.length,1,'Old linked context must not be reused for a manually replaced root-page story');assert.equal(revisited.scenario().title,original.title);
  });
  await test('an editor cancellation rejects imported replacements without touching the active scenario',async()=>{
    const app=await boot({editorClose:false});await app.api.importScenario(app.data(fixture('기존 원고')));const before=app.scenario();
    app.node('editor-dialog').open=true;await fails(()=>app.api.importScenario(app.data(fixture('교체 시도'))),/취소/);assert.deepEqual(app.scenario(),before);
  });
  await test('single-file program export contains only a blank scenario and no imported story or player DOM',async()=>{
    const source=fixture('공유하면안되는개인원고제목'),app=await boot({singleFile:true});await app.api.importScenario(app.data(source));app.submitName('공유하면안되는플레이어');app.clickChoice(0);
    app.node('journal-button').click();app.node('open-scenario-button').click();app.node('help-button').click();
    app.node('download-html').click();await app.drain();assert.equal(app.doc.downloads.length,1);
    const html=app.doc.downloads[0].text;assert.ok(html&&html.includes('<html>'));
    for(const text of [source.title,source.description,source.events[0].title,source.events[0].body,source.events[1].body,'공유하면안되는플레이어','release_fixture','검사용 선택을 한다.'])assert.equal(html.includes(text),false,'Export leaks '+text);
    const embedded=html.match(/<script\b[^>]*id="scenario-data"[^>]*>([\s\S]*?)<\/script>/);
    if(embedded){const data=JSON.parse(embedded[1]);assert.equal(data.draft,true);assert.deepEqual(data.events,[]);assert.deepEqual(data.endings,[]);}
    else assert.ok(html.includes('globalThis.DEFAULT_SCENARIO = GameEngine.createBlankScenario();'));
    assert.deepEqual(app.scenario(),source,'Export must not replace the active story');
  });
  await test('release source and standalone assets are coherent and contain no bundled example scenario',async()=>{
    const index=fs.readFileSync(path.join(dist,'index.html'),'utf8'),html=fs.readFileSync(path.join(dist,'standalone.html'),'utf8');
    assert.ok(index.includes('src="bootstrap.js"'));assert.equal(index.includes('src="scenario.js"'),false);
    const sources=[...index.matchAll(/(?:src|href)="([^"#:]+\.(?:js|css))"/g)].map(match=>match[1]);
    for(const source of sources)if(!hostedAnalytics(source))assert.ok(fs.existsSync(path.join(dist,source)),source+' must exist');
    assert.ok(index.indexOf('engine.js')<index.indexOf('bootstrap.js'));assert.ok(index.indexOf('bootstrap.js')<index.indexOf('app.js'));
    assert.equal(/<script\b[^>]*\bsrc=/i.test(html),false);assert.equal(/<link\b[^>]*\brel=["']stylesheet["']/i.test(html),false);
    for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi))if(!/type=["']application\/json["']/.test(match[1]))new vm.Script(match[2]);
    for(const [filename,id]of [['map-templates.js','map-templates-script'],['map-view.js','map-view-script'],['engine.js','engine-script'],['flowchart.js','flowchart-script'],['editor.js','editor-script'],['ai-helper.js','ai-script'],['app.js','app-script']]){
      const bundled=html.match(new RegExp('<script id="'+id+'">([\\s\\S]*?)<\\/script>'));
      assert.ok(bundled,id+' must be bundled');
      if(filename==='map-templates.js'){
        const offline=vm.createContext({console});
        vm.runInContext(bundled[1],offline);
        vm.runInContext(html.match(/<script id="map-regions-script">([\s\S]*?)<\/script>/)[1],offline);
        for(const item of require('../map-templates.js').list())assert.equal(offline.MapTemplates.get(item.id).provinces.length,item.provinceCount);
        assert.equal(offline.MapTemplates.offline,true);
      }else assert.equal(bundled[1].trim(),fs.readFileSync(path.join(dist,filename),'utf8').replace(/<\/script/gi,'<\\/script').trim(),filename+' inline bundle must match current source');
    }
    for(const [filename,id]of [['styles.css','game-styles'],['flowchart.css','flowchart-styles'],['launcher.css','launcher-styles'],['map-view.css','map-view-styles']]){
      const bundled=html.match(new RegExp('<style id="'+id+'">([\\s\\S]*?)<\\/style>'));
      assert.ok(bundled,id+' must be bundled');assert.equal(bundled[1].trim(),fs.readFileSync(path.join(dist,filename),'utf8').replace(/<\/style/gi,'<\\/style').trim(),filename+' inline bundle must match current source');
    }
    for(const filename of fs.readdirSync(dist))if(/\.(?:html|js|css|json)$/i.test(filename)){
      const text=fs.readFileSync(path.join(dist,filename),'utf8');for(const marker of ['haeon_1894','imjin_1591_five_fates','해온국','1591, 조선의 다섯 갈림길','release_fixture'])assert.equal(text.includes(marker),false,filename+' includes '+marker);
    }
    assert.equal(fs.existsSync(path.join(dist,'scenario.json')),false);assert.equal(fs.existsSync(path.join(dist,'scenario.js')),false);
  });
  await test('V2 chronicle displays escaped named results after ordinary and final choices',async()=>{
    const app=await boot(),source=fixture();source.schemaVersion=2;source.events[0].choices[0].result='중간 결과 {name}';source.events[1].choices[0].result='마지막 결과 {name}';await app.api.importText(JSON.stringify(source));app.submitName('<검증왕>');app.clickChoice(0);assert.ok(app.node('story-panel').innerHTML.includes('중간 결과 &lt;검증왕&gt;'));app.clickChoice(0);assert.equal(app.api.getState().endingId,'end');assert.ok(app.node('story-panel').innerHTML.includes('마지막 결과 &lt;검증왕&gt;'),'Ending must preserve the final choice result');assert.equal(app.node('story-panel').innerHTML.includes('마지막 결과 <검증왕>'),false);
  });
  await test('V2 map country overrides preserve defaults, cleared layers redraw, and map state survives reload',async()=>{
    const app=await boot(),source=fixture(),template=app.context.MapTemplates.list()[0],full=app.context.MapTemplates.get(template.id),country=full.countries[0],other=full.countries[1],province=full.provinces[0].id;source.schemaVersion=2;source.map={templateId:template.id,playerCountry:country.id,countries:[{id:country.id,name:'부분 국가 이름'}],initial:{owners:{[province]:country.id},occupation:{[province]:other.id},influence:{[province]:other.id},markers:{[province]:'비공개 시작 표식'}}};source.events[0].choices[0].territory=[{prov:province,occupation:null,influence:null,marker:null}];await app.api.importText(JSON.stringify(source));app.submitName('지도 검사');const map=app.node('player-map'),shape=map.querySelector(`[data-province="${province}"]`);assert.ok(map.querySelector('.map-legend').innerHTML.includes('부분 국가 이름'));assert.equal(shape.getAttribute('style'),'--province-color:'+country.color);assert.equal(map.querySelector('[data-map-overlays]').innerHTML.includes('map-marker'),false);assert.equal(app.api.getState().map.markers[province],'비공개 시작 표식');assert.ok(map.querySelector('[data-map-overlays]').innerHTML.includes('map-layer'));app.clickChoice(0);const state=clone(app.api.getState());for(const layer of ['occupation','influence','markers'])assert.equal(Object.hasOwn(state.map[layer],province),false);assert.equal(map.querySelector(`[data-province="${province}"]`),shape,'Cached map updates must retain the province node');assert.equal(map.querySelector('[data-map-overlays]').innerHTML.includes('비공개 시작 표식'),false);assert.equal(map.querySelector('[data-map-overlays]').innerHTML.includes('map-layer'),false);const reopened=await boot({entries:Object.fromEntries(app.storage.data)});assert.equal(reopened.api.getState(),null);await reopened.api.resumeScenario();assert.deepEqual(clone(reopened.api.getState()),state);assert.equal(reopened.node('player-map').querySelector(`[data-province="${province}"]`).getAttribute('style'),'--province-color:'+country.color);
  });
  await test('territory risk previews isolate changed layers without cloning the full map or changing live state',async()=>{
    const app=await boot(),source=fixture(),template=app.context.MapTemplates.get(app.context.MapTemplates.list()[0].id),province=template.provinces[0].id,country=template.countries[0].id,other=template.countries[1].id;
    source.schemaVersion=2;source.map={templateId:template.id,playerCountry:country,initial:{owners:{[province]:country},occupation:{[province]:other},influence:{[province]:other},markers:{[province]:'원래 표식'}}};
    source.events[0].choices=[{text:'모든 지도 층을 바꾸는 예상 선택',effects:{trust:-10},territory:[{prov:province,to:other,occupation:null,influence:null,marker:null}]},{text:'영토를 유지하는 선택',effects:{}},{text:'소유권만 바꾸는 예상 선택',effects:{},territory:[{prov:province,to:other}]}];
    source.endings.unshift({id:'projected_loss',title:'예상된 영토 상실',body:'예상 선택으로 발생하는 영토 상실입니다.',kind:'bad',priority:10,immediate:true,chance:10,when:[{kind:'territory',layer:'owner',key:province,op:'eq',value:other}]});
    const originalClone=app.context.GameEngine.clone;let directMapClones=0;
    app.context.GameEngine.clone=value=>{if(value?.owners&&value?.occupation&&value?.influence&&value?.markers)directMapClones++;return originalClone(value);};
    const originalTest=app.context.GameEngine.testConditions,observations=[];
    app.context.GameEngine.testConditions=(conditions,candidate)=>{observations.push({turn:candidate.turn,map:candidate.map});return originalTest(conditions,candidate);};
    await app.api.importText(JSON.stringify(source));app.submitName('지도 예상 검사');
    assert.ok(app.node('story-panel').innerHTML.includes('예상된 영토 상실 10%'),'Risk should be evaluated against the hypothetical territory change');
    const before=clone(app.api.getState());assert.equal(before.stats.trust,50);assert.equal(before.map.owners[province],country);assert.equal(before.map.occupation[province],other);assert.equal(before.map.influence[province],other);assert.equal(before.map.markers[province],'원래 표식');
    observations.length=0;app.node('save-button').click();assert.deepEqual(clone(app.api.getState()),before,'Rerendering previews must preserve the live state');assert.equal(directMapClones,0,'Preview rendering must not deep-clone a dense map for each choice');
    const liveMap=observations.find(item=>item.turn===0)?.map,unchanged=observations.find(item=>item.turn===1&&item.map.owners[province]===country)?.map,ownerOnly=observations.find(item=>item.turn===1&&item.map.owners[province]===other&&item.map.markers[province]==='원래 표식')?.map;
    assert.ok(liveMap&&ownerOnly);assert.equal(unchanged,liveMap,'A choice with no territory change should reuse all map layers');assert.notEqual(ownerOnly.owners,liveMap.owners);for(const layer of ['occupation','influence','markers'])assert.equal(ownerOnly[layer],liveMap[layer],'Unchanged '+layer+' should remain shared');
    app.clickChoice(1);const after=clone(app.api.getState());assert.deepEqual(after.map,before.map,'An unselected territory effect must not leak into the actual decision');assert.equal(after.stats.trust,50);
  });
  await test('V2 reign previews ignored next correctly, returns from encounters, persists decisions, and renders final settlements',async()=>{
    const app=await boot();await app.api.importText(JSON.stringify(reignFixture()));app.submitName('치세 검사');assert.ok(app.node('story-panel').innerHTML.includes('연초 지원 치세 검사'));const first=app.node('story-panel').querySelectorAll('[data-part-choice]').find(node=>node.dataset.partEvent==='first');assert.ok(first,'First part must render');assert.ok(app.node('story-panel').innerHTML.includes('돌발 사건 검사용 돌발 100%'),'Ordinary reign next RETURN must not suppress encounter preview');clickPart(app,'first');assert.equal(app.api.getState().activeRandomEventId,'once');assert.equal(app.api.getState().pendingNext,'REIGN');assert.ok(app.node('story-panel').innerHTML.includes('치세'));app.clickChoice(0);assert.equal(app.api.getState().activeRandomEventId,null);assert.ok(app.api.getState().reign.decisions.civil);assert.ok(app.node('story-panel').innerHTML.includes('돌발 대응의 결과 치세 검사'));const reopened=await boot({entries:Object.fromEntries(app.storage.data)});assert.equal(reopened.api.getState(),null);await reopened.api.resumeScenario();assert.ok(reopened.api.getState().reign.decisions.civil);assert.equal(reopened.node('player-name-form'),null);clickPart(reopened,'second');settle(reopened);assert.equal(reopened.api.getState().reign.turnIndex,1);assert.ok(reopened.node('story-panel').innerHTML.includes('첫해 정산 결과 치세 검사'));assert.ok(reopened.node('story-panel').innerHTML.includes('다음 해의 결과 치세 검사'));clickPart(reopened,'first');clickPart(reopened,'second');settle(reopened);assert.equal(reopened.api.getState().endingId,'end');assert.ok(reopened.node('story-panel').innerHTML.includes('최종 정산 결과 치세 검사'));reopened.node('journal-button').click();assert.equal(reopened.node('info-content').innerHTML.includes('undefined'),false);assert.ok(reopened.node('info-content').innerHTML.includes('턴 결산'));const balances=reopened.node('info-content').innerHTML.split('</article>').filter(entry=>entry.includes('턴 결산'));assert.equal(balances.length,2);for(const [index,amount]of [[0,2],[1,4]]){assert.match(balances[index],new RegExp('신뢰\\s*[+＋]'+amount));assert.equal(balances[index].includes('수치 변화 없음'),false,'Settlement changes must be reflected in the journal');}assert.ok(balances[0].includes('첫해 정산 결과 치세 검사'));assert.ok(balances[1].includes('최종 정산 결과 치세 검사'));
  });
  await test('actual V2 examples render through both modes and retain the last displayed state after reload',async()=>{
    for(const filename of ['chronicle-sejong.json','reign-france.json']){const app=await boot(),source=JSON.parse(fs.readFileSync(path.join(dist,'examples',filename),'utf8'));await app.api.importText(JSON.stringify(source));app.submitName('예시 검사');let actions=0;while(!app.api.getState().endingId&&actions++<100){const state=app.api.getState();if(source.mode==='reign'&&!state.activeRandomEventId){const status=app.context.GameEngine.getReignStatus(app.data(source),state);if(status.ready)settle(app);else {const card=status.cards.find(item=>!Object.hasOwn(status.decisions,item.part.id));assert.ok(card);const choice=card.choices.find(item=>item.enabled);assert.ok(choice);clickPart(app,card.event.id,choice.index);}}else {const choice=app.context.GameEngine.getChoices(app.data(source),state).find(item=>item.enabled);assert.ok(choice);app.clickChoice(choice.index);}assert.equal(app.node('status-message').classList.contains('error'),false);}assert.ok(app.api.getState().endingId);assert.ok(app.node('story-panel').innerHTML.includes('ending-title'));const reopened=await boot({entries:Object.fromEntries(app.storage.data)});assert.equal(reopened.api.getState(),null);await reopened.api.resumeScenario();assert.deepEqual(clone(reopened.api.getState()),clone(app.api.getState()));assert.ok(reopened.node('story-panel').innerHTML.includes('ending-title'));assert.ok(reopened.node('player-map').innerHTML.includes('province-map'));}
  });
  await test('dense atlas saves only owner differences and restores the full verified state',async()=>{
    const app=await boot(),source=JSON.parse(fs.readFileSync(path.join(dist,'examples/world-detailed-demo.json'),'utf8'));
    await app.api.importText(JSON.stringify(source));app.submitName('세부 지도 저장');clickPart(app,'border_1',1);app.node('save-button').click();
    const before=clone(app.api.getState()),savedText=app.storage.getItem('history-crossroads:web:v1:save'),saved=JSON.parse(savedText);
    assert.equal(saved.state.mapEncoding,'template-delta-v1');assert.ok(savedText.length<60000);assert.ok(Object.keys(saved.state.map.owners).length<10);assert.equal(Object.keys(before.map.owners).length,app.context.MapTemplates.get('world-detailed').provinces.length);
    const reopened=await boot({entries:Object.fromEntries(app.storage.data)});assert.equal(reopened.api.getState(),null);await reopened.api.resumeScenario();assert.deepEqual(clone(reopened.api.getState()),before);reopened.node('load-button').click();assert.deepEqual(clone(reopened.api.getState()),before);
    const legacyEntries=Object.fromEntries(app.storage.data);legacyEntries['history-crossroads:web:v1:autosave']=JSON.stringify({...saved,state:before});const legacy=await boot({entries:legacyEntries});assert.equal(legacy.api.getState(),null);await legacy.api.resumeScenario();assert.deepEqual(clone(legacy.api.getState()),before);
  });
  await test('standalone V2 export removes private map/results DOM and keeps offline-only visibility rules',async()=>{
    const app=await boot({singleFile:true}),source=reignFixture(),template=app.context.MapTemplates.list()[0],full=app.context.MapTemplates.get(template.id);source.map={templateId:template.id,playerCountry:full.countries[0].id,initial:{markers:{[full.provinces[0].id]:'내보내면안되는지도표식'}}};source.title='내보내면안되는치세원고';source.events[0].choices[0].result='내보내면안되는결과문';await app.api.importText(JSON.stringify(source));app.submitName('내보내면안되는치세이름');clickPart(app,'first');app.node('help-button').click();app.node('download-html').click();await app.drain();assert.equal(app.doc.downloads.length,1);const html=app.doc.downloads[0].text;for(const marker of [source.title,'내보내면안되는지도표식','내보내면안되는결과문','내보내면안되는치세이름'])assert.equal(html.includes(marker),false,marker);assert.ok(html.includes('standalone-styles'),'Export must keep the CSS hiding dynamic gallery/sample links offline');
  });
  await test('web player downloads the full blank offline bundle and preserves the active V2 manuscript',async()=>{
    const app=await boot(),source=reignFixture();source.title='웹내보내기개인원고';await app.api.importText(JSON.stringify(source));app.submitName('웹내보내기개인이름');clickPart(app,'first');const before=clone(app.api.getState());app.node('help-button').click();app.node('download-html').click();await app.drain();assert.equal(app.doc.downloads.length,1);const html=app.doc.downloads[0].text;assert.ok(app.requests.some(request=>request.url.endsWith('/standalone.html')));for(const marker of [source.title,'웹내보내기개인이름','민정 결정의 결과 웹내보내기개인이름'])assert.equal(html.includes(marker),false);for(const id of ['map-templates-script','map-view-script','engine-script','app-script','standalone-styles'])assert.ok(html.includes('id="'+id+'"'),id+' must remain embedded');assert.deepEqual(clone(app.api.getState()),before);assert.deepEqual(app.scenario(),source);
  });
}
main().then(()=>process.stdout.write(`${passed} release tests passed${process.exitCode?' (some failures)':''}.\n`));
