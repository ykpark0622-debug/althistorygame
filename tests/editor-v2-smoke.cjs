'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const base=path.resolve(__dirname,'..');
class FakeElement{
  constructor(doc,tag='div',attributes={}){this.doc=doc;this.tagName=tag.toUpperCase();this.attributes={};this.dataset={};this.children=[];this.parentElement=null;this.listeners={};this._html='';this._text='';this.value='';this.files=[];this.hidden=false;this.disabled=false;this.open=false;this.className='';this.style={};this.classList={add:()=>{},remove:()=>{},toggle:()=>{},contains:()=>false};for(const [key,value]of Object.entries(attributes))this.setAttribute(key,value);}
  set id(value){if(this.attributes.id)this.doc.ids.delete(this.attributes.id);this.attributes.id=String(value);if(value)this.doc.ids.set(String(value),this);}
  get id(){return this.attributes.id||'';}
  get ownerDocument(){return this.doc;}
  setAttribute(key,value){if(key==='id'){this.id=value;return;}this.attributes[key]=String(value);if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(value);if(key==='class')this.className=String(value);}
  getAttribute(key){return this.attributes[key]??null;}
  removeAttribute(key){delete this.attributes[key];if(key==='open')this.open=false;}
  get textContent(){return this._text;}
  set textContent(value){this.clearChildren();this._text=String(value??'');this._html='';}
  get innerHTML(){return this._html;}
  set innerHTML(value){this.clearChildren();this._html=String(value??'');this._text='';this.doc.parseChildren(this,this._html);}
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
  getBoundingClientRect(){return {left:0,top:0,right:300,bottom:44,width:300,height:44};}
  showModal(){this.open=true;this.setAttribute('open','');}
  close(){this.open=false;this.removeAttribute('open');}
}
class FakeDocument{
  constructor(index,options={}){this.ids=new Map();this.listeners={};this.all=[];this.title='역사의 갈림길';this.downloads=[];this.blobs=new Map();this.activeElement=null;this.options=options;this.head=this.createElement('head');this.body=this.createElement('body');this.parseChildren(this.body,index);this.documentElement={get outerHTML(){return '';}};}
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
function setup(){
 const doc=new FakeDocument('<dialog id="editor-dialog"></dialog><div id="editor-root"></div>');
 const context=vm.createContext({document:doc,console,confirm:()=>true,requestAnimationFrame:()=>1,cancelAnimationFrame(){},setTimeout,clearTimeout,Blob,URL,crypto:require('node:crypto').webcrypto});
 context.globalThis=context;context.window=context;
 context.innerWidth=1440;context.innerHeight=1000;context.addEventListener=(...args)=>doc.addEventListener(...args);context.removeEventListener=(...args)=>doc.removeEventListener(...args);
 for(const file of ['map-templates.js','engine.js'])vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),context);
 require('./preloaded-map-fixture.cjs')(context);
 let mapClick;
 context.MapView={render(container,scenario,state,options){mapClick=options.onProvince;},initialState(scenario){const t=context.MapTemplates.get(scenario.map.templateId);return {map:{owners:{...Object.fromEntries(t.provinces.map(p=>[p.id,p.owner])),...(scenario.map.initial?.owners||{})},occupation:{},influence:{},markers:{}}};}};
 context.ScenarioFlowchart={mount(){return ()=>{};}};
 vm.runInContext(fs.readFileSync(path.join(base,'editor.js'),'utf8'),context);
 const visible=()=>doc.all.filter(node=>doc.body.contains(node));
 const buttons=text=>visible().filter(node=>node.tagName==='BUTTON'&&node.textContent===text);
 const click=text=>{const button=buttons(text)[0];assert(button,'missing button '+text);button.click();};
 const field=label=>{const picker=visible().find(node=>node.getAttribute('role')==='combobox'&&node.getAttribute('aria-label')===label);if(picker)return picker;const node=visible().find(node=>node.tagName==='LABEL'&&node.children[0]?.textContent===label);assert(node,'missing field '+label);return node.children.find(child=>['INPUT','SELECT','TEXTAREA'].includes(child.tagName));};
 const change=(label,value,type='change')=>{const node=field(label);if(node.getAttribute('role')==='combobox'){node.click();const wrap=node.parentElement,search=wrap.querySelector('input');search.value=value;search.dispatch('input');const option=wrap.querySelectorAll('[role="option"]').find(item=>item.getAttribute('data-country-id')===value);assert(option,'missing country result '+label+' '+value);option.click();return;}node.value=value;node.dispatch(type);};
 const realm=value=>vm.runInContext('JSON.parse('+JSON.stringify(JSON.stringify(value))+')',context);
 return {doc,context,click,buttons,field,change,realm,mapClick:()=>mapClick};
}
let cases=0;function test(name,run){run();console.log('PASS '+name);cases++;}
test('V1 blank opens and closes without upgrade',()=>{const t=setup();let saved;t.context.ScenarioEditor.open(t.context.GameEngine.createBlankScenario(),next=>saved=next);t.click('초안 저장');assert.equal(saved.schemaVersion,1);assert.equal(saved.map,undefined);});
test('map tab selects template, edits owner by province click and saves',()=>{const t=setup();let saved;t.context.ScenarioEditor.open(t.context.GameEngine.createBlankScenario(),next=>saved=next,{page:'map'});t.change('지도 템플릿','eastasia1419');t.mapClick()('tsushima');t.change('시작 소유국','joseon');t.click('초안 저장');assert.equal(saved.schemaVersion,2);assert.equal(saved.map.initial.owners.tsushima,'joseon');assert.equal(t.context.GameEngine.validateScenario(saved,t.realm({allowDraft:true})).errors.length,0);});
test('reign form builds parts, turn, card and ordered rules',()=>{const t=setup();let saved;t.context.ScenarioEditor.open(t.context.GameEngine.createBlankScenario(),next=>saved=next);t.change('플레이 방식','reign');t.click('치세·연도');t.click('＋ 연도·차례 추가');t.click('＋ 새 사건을 만들어 이 연도에 추가');t.buttons('＋ 결과 규칙 추가')[0].click();t.buttons('＋ 결과 규칙 추가')[1].click();t.click('초안 저장');assert.equal(saved.mode,'reign');assert.equal(saved.reign.parts.length,3);assert.equal(saved.reign.turns.length,1);assert.equal(saved.reign.turns[0].eventIds.length,1);assert.equal(saved.reign.turns[0].between.length,1);assert.equal(saved.reign.turns[0].settlements.length,1);assert.equal(saved.events[0].part,'war');assert.equal(t.context.GameEngine.validateScenario(saved,t.realm({allowDraft:true})).errors.length,0);});
test('reference rename updates effects, conditions, start, next, turn and layout',()=>{const t=setup();const data=t.realm({stats:[],flags:[],endings:[],start:'old',events:[{id:'old',next:'old',choices:[{next:'old',when:[{kind:'stat',key:'score'}],effects:{score:2},setFlags:{won:true}}]}],randomEvents:[{eventId:'old',when:[{kind:'flag',key:'won'}]}],reign:{parts:[],turns:[{eventIds:['old'],between:[{effects:{score:-1},setFlags:{won:false}}]}]},editorLayout:{positions:{old:{x:40,y:50}}}});t.context.ScenarioEditorV2.rewriteReferences(data,'stat','score','gold');t.context.ScenarioEditorV2.rewriteReferences(data,'flag','won','victory');t.context.ScenarioEditorV2.rewriteReferences(data,'event','old','new');assert.equal(data.start,'new');assert.equal(data.events[0].choices[0].effects.gold,2);assert.equal(data.events[0].choices[0].when[0].key,'gold');assert.equal(data.reign.turns[0].between[0].setFlags.victory,false);assert.equal(data.randomEvents[0].eventId,'new');assert.equal(data.editorLayout.positions.new.x,40);});
test('normal choice editor writes result, historical and territory',()=>{const t=setup();let saved;const s=t.context.GameEngine.createBlankScenario();s.schemaVersion=2;s.mode='chronicle';s.map=t.realm({templateId:'eastasia1419',playerCountry:'joseon',initial:{}});s.events=t.realm([{id:'first',title:'첫 사건',body:'본문',when:[],next:'END',choices:[{text:'선택',effects:{},setFlags:{},when:[]}]}]);s.start='first';t.context.ScenarioEditor.open(s,next=>saved=next,{page:'events'});t.change('선택 후 결과 본문','선택한 결과','input');const historic=t.doc.all.find(node=>node.tagName==='LABEL'&&node.children.some(child=>child.textContent==='실제 역사에서 선택한 경로로 표시'));historic.children[0].checked=true;historic.children[0].dispatch('change');t.click('＋ 영토 변화 추가');t.change('변경할 지역','tsushima');t.change('소유국','joseon');t.click('초안 저장');assert.equal(saved.events[0].choices[0].result,'선택한 결과');assert.equal(saved.events[0].choices[0].historical,true);assert.equal(saved.events[0].choices[0].territory[0].to,'joseon');assert.equal(saved.events[0].choices[0].territory[0].prov,'tsushima');});
test('territory condition form edits layer, province and country',()=>{const t=setup();let saved;const s=t.context.GameEngine.createBlankScenario();s.schemaVersion=2;s.mode='chronicle';s.map=t.realm({templateId:'eastasia1419',playerCountry:'joseon',initial:{}});s.events=t.realm([{id:'first',title:'첫 사건',body:'본문',when:[],next:'END',choices:[{text:'선택',effects:{},setFlags:{},when:[]}]}]);s.start='first';t.context.ScenarioEditor.open(s,next=>saved=next,{page:'events'});t.buttons('＋ 조건 추가')[0].click();t.change('지역','tsushima');t.change('비교할 상태','influence');t.change('대상 국가','joseon');t.click('초안 저장');assert.equal(saved.events[0].when[0].kind,'territory');assert.equal(saved.events[0].when[0].key,'tsushima');assert.equal(saved.events[0].when[0].field,'influence');assert.equal(saved.events[0].when[0].value,'joseon');assert.equal(t.context.GameEngine.validateScenario(saved,t.realm({allowDraft:true})).errors.length,0);});
test('dense map effect search stays bounded and preserves selection outside results',()=>{
 const t=setup();let saved;
 vm.runInContext(`{
 const dense={id:'dense_test',countries:[{id:'country_a',name:'A',color:'#123456'}],provinces:Array.from({length:50000},(_,i)=>({id:'r'+i,name:i===43210?'Needle':'Region'+i,owner:'country_a'}))};
 const previous=MapTemplates;globalThis.MapTemplates={get:id=>id==='dense_test'?dense:previous.get(id),list:()=>previous.list()};
 }`,t.context);
 const s=t.context.GameEngine.createBlankScenario();s.schemaVersion=2;s.mode='chronicle';s.map=t.realm({templateId:'dense_test',playerCountry:'country_a',initial:{}});s.start='first';
 s.events=t.realm([{id:'first',title:'사건',body:'본문',when:[{kind:'territory',key:'r49999',field:'owner',op:'eq',value:'country_a'}],next:'END',choices:[{text:'선택',effects:{},setFlags:{},when:[],territory:[{prov:'r49999',to:'country_a'}]}]}]);
 t.context.ScenarioEditor.open(s,next=>saved=next,{page:'events'});
 assert.ok(t.field('변경할 지역').children.length<=101);
 assert.equal(t.field('변경할 지역').value,'r49999');
 t.change('변경할 지역 검색','Needle','input');
 assert.equal(t.field('변경할 지역').children.length,2);
 assert.equal(t.field('변경할 지역').value,'r49999');
 t.change('변경할 지역','r43210');
 t.change('변경할 지역 검색','no matching region','input');
 assert.equal(t.field('변경할 지역').children.length,1);
 assert.equal(t.field('변경할 지역').value,'r43210');
 t.change('지역 검색','Needle','input');
 assert.equal(t.field('지역').value,'r49999');
 t.change('지역','r43210');t.click('초안 저장');
 assert.equal(saved.events[0].choices[0].territory[0].prov,'r43210');
 assert.equal(saved.events[0].when[0].key,'r43210');
});
console.log('Editor V2 smoke: '+cases+' passed');
