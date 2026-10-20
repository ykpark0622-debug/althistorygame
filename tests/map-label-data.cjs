'use strict';
// A cropped map deliberately uses a nonzero geometry offset: label positions
// belong to its local viewport, never to the original world coordinates.
const assert=require('node:assert/strict');
const template={id:'label_crop',name:'국명 위치 검사',width:450,height:312,offsetX:930,offsetY:108,
 countries:[{id:'france',name:'프랑스',color:'#537bb5',focusBounds:[50,90,200,240]},{id:'italy',name:'이탈리아',color:'#a0b89c'}],
 provinces:[{id:'west',name:'서쪽',owner:'france',path:'M1000 200L1050 200L1050 250Z',cx:95,cy:117},{id:'east',name:'동쪽',owner:'italy',path:'M1100 250L1150 250L1150 300Z',cx:195,cy:167}]};
globalThis.MapTemplates={get:id=>id===template.id?template:null};
const E=require('../engine.js'),M=require('../map-document.js');
const clone=value=>JSON.parse(JSON.stringify(value));
const base=()=>M.create({id:'country_label_positions',templateId:template.id,title:'국명 좌표'});
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
function withPosition(value){const doc=base();doc.map.countries.push({id:'france',name:'프랑스',color:'#537bb5',labelPosition:value});return doc;}

test('explicit crop-local coordinates, both viewport corners and hidden labels are accepted',()=>{
 for(const position of [[0,0],[450,312],[125.125,211.875],null]){
  const document=withPosition(position);assert.deepEqual(M.validate(document).errors,[]);
  const normalized=M.normalize(document);assert.deepEqual(normalized.map.countries[0].labelPosition,position);
  assert.deepEqual(E.validateScenario(M.toScenario(normalized),{allowDraft:true}).errors,[]);
 }
 assert.equal(M.normalize(base()).map.countries.length,0,'Existing maps retain automatic labels without extra overrides');
});
test('canonicalization is idempotent and returns independent coordinate arrays',()=>{
 const document=withPosition([120.5,211.75]),before=clone(document),normalized=M.normalize(document);
 assert.deepEqual(document,before);assert.deepEqual(M.normalize(normalized),normalized);
 document.map.countries[0].labelPosition[0]=20;assert.equal(normalized.map.countries[0].labelPosition[0],120.5);
 const scenario=M.toScenario(normalized);scenario.map.countries[0].labelPosition[1]=10;
 assert.equal(normalized.map.countries[0].labelPosition[1],211.75);
});
test('label-only overrides and hidden labels survive map/scenario/JSON round trips',()=>{
 const document=withPosition([125,180]);document.map.countries.push({id:'italy',name:'이탈리아',color:'#a0b89c',labelPosition:null});
 const canonical=M.normalize(document),scenario=M.toScenario(canonical);
 assert.deepEqual(M.fromScenario(scenario),canonical);assert.deepEqual(M.normalize(JSON.parse(JSON.stringify(canonical))),canonical);
 assert.deepEqual(M.fromScenario(JSON.parse(JSON.stringify(scenario))),canonical);
 assert.equal(Object.hasOwn(canonical.map.countries[1],'labelPosition'),true);assert.equal(canonical.map.countries[1].labelPosition,null);
});
test('a new state without territory may store a label and automatic placement is restored by omission',()=>{
 const document=base();document.map.countries.push({id:'new_union',name:'새 연방',color:'#aabbcc',labelPosition:[300,200]});
 const withLabel=M.normalize(document);assert.deepEqual(withLabel.map.countries[0].labelPosition,[300,200]);
 delete document.map.countries[0].labelPosition;assert.equal(Object.hasOwn(M.normalize(document).map.countries[0],'labelPosition'),false);
});
test('invalid label coordinates fail in both portable maps and ordinary scenarios without mutation',()=>{
 for(const value of [[-0.01,10],[451,10],[10,313],[930,108],[NaN,10],[10,Infinity],[],[1],[1,2,3],['1',2],{x:1,y:2},'auto',false]){
  const document=withPosition(value),before=structuredClone(document),scenario=M.toScenario(base());scenario.map.countries=document.map.countries;
  assert.ok(M.validate(document).errors.length>0,JSON.stringify(value));assert.throws(()=>M.normalize(document));
  assert.ok(E.validateScenario(scenario,{allowDraft:true}).errors.length>0,JSON.stringify(value));assert.deepEqual(document,before);
 }
});
test('playing and replaying preserve chosen label positions and ownership semantics',()=>{
 const scenario=M.toScenario(withPosition([123,234]));delete scenario.draft;
 scenario.stats=[{id:'funds',name:'재정',min:0,max:100,initial:50}];scenario.start='first';scenario.defaultEnding='end';
 scenario.events=[{id:'first',title:'국경 협정',body:'국경을 바꾼다.',next:'END',choices:[{text:'합의',effects:{funds:2},territory:[{prov:'east',to:'france'}]}]}];
 scenario.endings=[{id:'end',title:'협정 체결',body:'새 국경',kind:'mixed',priority:0,immediate:false,when:[]}];
 assert.deepEqual(E.validateScenario(scenario).errors,[]);const before=clone(scenario),state=E.choose(scenario,E.createState(scenario,{seed:11}),0);
 assert.equal(state.map.owners.east,'france');assert.deepEqual(E.restoreState(scenario,clone(state)),state);assert.deepEqual(scenario,before);
 assert.deepEqual(M.fromScenario(scenario).map.countries[0].labelPosition,[123,234]);
});
console.log(passed+' map label data tests passed.');
