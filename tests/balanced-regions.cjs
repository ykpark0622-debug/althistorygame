'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),T=require('../map-templates.js');
globalThis.MapTemplates=T;const E=require('../engine.js');globalThis.GameEngine=E;const D=require('../map-document.js');
const clone=value=>JSON.parse(JSON.stringify(value)),world=T.get('world-balanced'),worldById=new Map(world.provinces.map(p=>[p.id,p]));
const specs=[
 {region:'eastasia',id:'balanced_eastasia_modern',bounds:[73,15,150,55],has:['chn','kor','prk','jpn','twn'],not:['usa','fra','phl','tha','aus'],points:[['kor',127,37.5],['jpn',138,36],['twn',121,23.5]]},
 {region:'asia',id:'balanced_asia_modern',bounds:[25,-12,180,80],has:['chn','jpn','kor','ind','tur','rus','idn'],not:['usa','fra','aus','egy','ken','rou','gum','fsm'],points:[['ind',78,23],['npl',84,28],['jpn',138,36],['idn',110,-7.5],['rus',160,56]]},
 {region:'north_america',id:'balanced_north_america_modern',bounds:[-180,5,-10,84],has:['usa','can','mex','cub','grl'],not:['rus','bra','ven','sur','aus'],points:[['usa',-100,40],['usa',-150,64],['usa',-155.5,19.5],['can',-110,56],['cub',-78,21]]},
 {region:'south_america',id:'balanced_south_america_modern',bounds:[-85,-58,-30,15],has:['bra','arg','chl','per','ven'],not:['usa','cub','pan','rus','aus'],points:[['bra',-52,-10],['arg',-65,-35],['chl',-70,-30]]}
];
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
function rings(p){
 const result=[];
 for(const subpath of p.path.split(/(?=M)/)){
  if(!subpath.startsWith('M'))continue;
  assert.ok(!/[A-DF-KN-Y]/i.test(subpath),'Only projected straight boundary segments: '+p.id);
  const values=subpath.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)?.map(Number)||[];
  assert.equal(values.length%2,0,'Paired path coordinates: '+p.id);
  const ring=[];for(let i=0;i<values.length;i+=2)ring.push([values[i],values[i+1]]);
  if(ring.length>=3)result.push(ring);
 }
 return result;
}
function contains(p,x,y){let inside=false;for(const ring of rings(p))for(let i=0,j=ring.length-1;i<ring.length;j=i++){
 const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
}return inside;}
test('the previous nineteen template files and six region/era definitions remain byte-for-byte compatible',()=>{
 const previous=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/v261-map-manifest.json'),'utf8'));
 const current=JSON.parse(fs.readFileSync(path.join(root,'assets/maps/manifest.json'),'utf8'));
 for(const entry of previous.templates)assert.deepEqual(current.templates.find(item=>item.id===entry.id),entry,'Old template: '+entry.id);
 for(const asset of previous.assets)assert.deepEqual(current.assets.find(item=>item.id===asset.id),asset,'Old geometry asset: '+asset.id);
 assert.deepEqual(current.regions,previous.regions);assert.deepEqual(current.eras,previous.eras);
 assert.equal(current.templates.length,42,'Original templates, four balanced crops, fifteen historical layouts and four research bases');
});
for(const spec of specs)test(spec.region+' is a genuinely clipped crop with reusable world province identities',()=>{
 const t=T.get(spec.id),[west,south,east,north]=spec.bounds;
 assert.ok(t,'Registered crop '+spec.id);assert.strictEqual(T.get(spec.id),t,'Stable cached identity');
 assert.equal(t.offsetX,(west+180)*6);assert.equal(t.offsetY,(90-north)*6);
 assert.equal(t.width,(east-west)*6);assert.equal(t.height,(north-south)*6);
 assert.ok(t.provinces.length>30&&t.provinces.length<world.provinces.length);
 const ids=new Set(),countries=new Map(t.countries.map(c=>[c.id,c]));
 const represented=new Set(t.provinces.map(p=>p.owner));
 for(const p of t.provinces){
  const base=worldById.get(p.id);assert.ok(base,'An existing world province '+p.id);
  assert.ok(!ids.has(p.id),'No duplicate crop province '+p.id);ids.add(p.id);
  assert.equal(p.owner,base.owner);assert.equal(p.name,base.name);assert.ok(countries.has(p.owner));
  assert.ok([p.cx,p.cy,p.area,...p.bbox].every(Number.isFinite),'Finite geometry '+p.id);
  assert.ok(p.cx>=0&&p.cx<=t.width&&p.cy>=0&&p.cy<=t.height,'Local center '+p.id);
  assert.ok(p.bbox[0]>=-.11&&p.bbox[1]>=-.11&&p.bbox[2]<=t.width+.11&&p.bbox[3]<=t.height+.11,'Crop-local bounds '+p.id);
  assert.ok(p.bbox[0]<p.bbox[2]&&p.bbox[1]<p.bbox[3]&&p.area>=0,'Nonempty geometry '+p.id);
  for(const ring of rings(p))for(const [x,y]of ring)assert.ok(x>=t.offsetX-.11&&x<=t.offsetX+t.width+.11&&y>=t.offsetY-.11&&y<=t.offsetY+t.height+.11,'Global path is actually clipped, not only its bbox: '+p.id+' '+x+','+y);
 }
 for(const id of spec.has)assert.ok(represented.has(id),'Relevant country '+id);
 for(const id of spec.not)assert.ok(!represented.has(id),'No unrelated country/dateline false-positive '+id);
 for(const country of t.countries){
  const original=world.countries.find(c=>c.id===country.id);assert.ok(original,'World country identity '+country.id);
  assert.equal(country.name,original.name);assert.equal(country.color,original.color);
  if(country.focusBounds){const b=country.focusBounds;assert.ok(b.every(Number.isFinite)&&b[0]>=0&&b[1]>=0&&b[2]<=t.width&&b[3]<=t.height&&b[0]<b[2]&&b[1]<b[3],'Crop-local country focus '+country.id);}
  if(Object.hasOwn(country,'available'))assert.equal(country.available,represented.has(country.id),'Availability is local '+country.id);
 }
 for(const [owner,lon,lat]of spec.points)assert.ok(t.provinces.some(p=>p.owner===owner&&contains(p,(lon+180)*6,(90-lat)*6)),'Mainland/island coverage '+owner+' '+lon+','+lat);
 if(spec.region==='south_america')assert.ok(!t.provinces.some(p=>p.owner==='fra'&&90-(p.cy+t.offsetY)/6>=8),'French Caribbean islands are not South American rows');
 const info=T.assetInfo(spec.id);assert.equal(info.files.length,1,'A selected crop downloads one new JSON, no full-world dependency');
 const bytes=fs.readFileSync(path.join(root,info.files[0]));assert.ok(bytes.length<25*1024*1024,'GitHub web upload size');
 assert.ok(t.credits?.length>100,'Original source credits remain available');assert.deepEqual(t.credits,world.credits);
});
test('offline derivation from only the embedded balanced world exactly matches the four web assets',()=>{
 const base=clone(world),offline=vm.createContext({MapTemplates:{get:id=>id==='world-balanced'?base:null,list:()=>[{id:'world-balanced'}]}});
 vm.runInContext(fs.readFileSync(path.join(root,'tools/map-source/balanced-regions.cjs'),'utf8'),offline,{filename:'balanced-regions.cjs'});
 const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
 for(const spec of specs){const web=T.get(spec.id),local=offline.MapTemplates.get(spec.id);assert.equal(hash(local),hash(web),'Same offline/web geometry '+spec.id);}
});
test('all four cropped map documents survive normalization, scenario conversion, choices and save replay',()=>{
 for(const spec of specs){
  const t=T.get(spec.id),province=t.provinces[0],alternate=t.countries.find(c=>c.id!==province.owner).id;
  const doc=D.create({id:'balanced_region_qa',templateId:t.id,title:'균형 지역 지도 검사'});
  doc.map.initial={owners:{[province.id]:alternate},occupation:{},influence:{},markers:{}};
  assert.deepEqual(D.validate(doc).errors,[]);assert.deepEqual(D.fromScenario(D.toScenario(doc)),D.normalize(clone(doc)));
  const scenario=D.toScenario(doc);
  Object.assign(scenario,{draft:false,start:'first',stats:[{id:'funds',name:'재정',initial:50,min:0,max:100}],events:[{id:'first',title:'검사',body:'지역 지도 검사',next:'END',choices:[{text:'반환',effects:{funds:-5},territory:[{prov:province.id,to:province.owner,marker:'반환'}]}]}],endings:[{id:'normal',title:'완료',body:'완료',kind:'mixed',priority:0,immediate:false,when:[]}],defaultEnding:'normal'});
  assert.deepEqual(E.validateScenario(scenario).errors,[]);
  const before=clone(scenario),state=E.createState(scenario,{seed:1}),next=E.choose(scenario,state,0);
  assert.equal(next.map.owners[province.id],province.owner);assert.equal(next.stats.funds,45);assert.equal(next.endingId,'normal');
  assert.deepEqual(E.restoreState(scenario,clone(next)),next);assert.deepEqual(scenario,before);assert.equal(state.map.owners[province.id],alternate);
 }
});
const context=vm.createContext({console});
for(const file of ['map-templates.js','map-regions.js','engine.js','editor.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
require('./preloaded-map-fixture.cjs')(context);
const realm=value=>vm.runInContext('JSON.parse('+JSON.stringify(JSON.stringify(value))+')',context);
function draftFor(map){const s=context.GameEngine.createBlankScenario();s.schemaVersion=2;s.mode='chronicle';s.map=realm(map);return s;}
test('switching world to crop preserves in-range initial edits and accurately translates custom focus bounds',()=>{
 const crop=T.get(specs[0].id),inside=crop.provinces.find(p=>p.owner==='kor'),outside=world.provinces.find(p=>p.owner==='bra');
 const bounds=[crop.offsetX+inside.cx-.5,crop.offsetY+inside.cy-.5,crop.offsetX+inside.cx+.5,crop.offsetY+inside.cy+.5];
 const draft=draftFor({templateId:world.id,playerCountry:'kor',countries:[{id:'kor',name:'내 나라',color:'#123456',focusBounds:bounds}],initial:{owners:{[inside.id]:'jpn',[outside.id]:'jpn'},occupation:{[inside.id]:'kor'},influence:{},markers:{[inside.id]:'보존',[outside.id]:'제외'}}});
 const original=clone(draft),result=context.ScenarioEditorV2.planMapChange(draft,crop.id),next=clone(result.nextMap);
 assert.equal(result.removed,2);assert.equal(next.initial.owners[inside.id],'jpn');assert.equal(next.initial.markers[inside.id],'보존');assert.equal(next.initial.occupation[inside.id],'kor');assert.equal(next.initial.owners[outside.id],undefined);
 assert.equal(next.countries[0].name,'내 나라');assert.equal(next.countries[0].color,'#123456');
 assert.deepEqual(next.countries[0].focusBounds,[bounds[0]-crop.offsetX,bounds[1]-crop.offsetY,bounds[2]-crop.offsetX,bounds[3]-crop.offsetY]);
 assert.deepEqual(clone(draft),original,'Planning never mutates the original draft');
 draft.map=realm(next);const wider=clone(context.ScenarioEditorV2.planMapChange(draft,world.id).nextMap);
 assert.equal(wider.initial.owners[inside.id],'jpn');assert.deepEqual(wider.countries[0].focusBounds,bounds,'A wider world restores the same custom world coordinates');
});
test('out-of-crop event territory changes and conditions block a destructive map switch',()=>{
 const crop=T.get(specs[0].id),outside=world.provinces.find(p=>p.owner==='bra');
 const draft=draftFor({templateId:world.id,playerCountry:'kor',countries:[],initial:{}});
 draft.events=realm([{id:'test',title:'범위 밖 참조',body:'검사',when:[{kind:'territory',key:outside.id,field:'owner',op:'eq',value:'bra'}],choices:[{text:'검사',territory:[{prov:outside.id,to:'kor'}]}]}]);
 const before=clone(draft),result=context.ScenarioEditorV2.planMapChange(draft,crop.id);
 assert.ok(result.blocked?.length>=2);assert.ok(result.blocked.every(row=>row.id===outside.id));assert.equal(result.nextMap,undefined);assert.deepEqual(clone(draft),before);
});
console.log(count+' balanced regional map tests passed.');
