'use strict';
const assert=require('node:assert/strict');
require('../map-templates.js');
require('../map-regions.js');
const E=require('../engine.js'),scenario=require('../examples/imjin-world.json');
const atlas=MapTemplates.get('world-detailed');
let passed=0;
function test(name,run){run();passed++;console.log('PASS '+name);}
function play(plan,seed=5,randomChoice=1){
 let state=E.createState(scenario,{seed,playerName:'검증국왕'}),seen=[];
 while(!state.endingId){
  assert.ok(state.history.length<35,'Scenario must terminate');
  const event=E.getEvent(scenario,state);seen.push(event.id);
  const index=state.activeRandomEventId?Math.min(randomChoice,event.choices.length-1):(plan[event.id]??0);
  assert.ok(E.getChoices(scenario,state)[index]?.enabled,event.id+' choice '+index+' is locked');
  const pending=state.activeRandomEventId?state.pendingNext:null;
  state=E.choose(scenario,state,index);
  if(pending){assert.equal(state.activeRandomEventId,null);assert.equal(state.pendingNext,null);}
 }
 return {state,seen};
}
const strong={envoys_1591:1,landing_1592:0,prepared_pass:0,court_1592:0,navy_1592:0,ming_1593:1,talks_1593:0,rebuild_1594:1,strategy_1596:1,command_1597:0,late_war_1598:1,withdrawal_1598:2,overseas_council:1};
test('scenario validates without warnings and identifies the whole peninsula as Joseon',()=>{
 assert.deepEqual(E.validateScenario(scenario),{errors:[],warnings:[]});
 const s=E.createState(scenario,{seed:5});
 assert.equal(E.getMapConfig(scenario).countries.find(c=>c.id===scenario.map.playerCountry).name,'조선');
 const korean=atlas.provinces.filter(p=>['kor','prk'].includes(p.owner));
 assert.equal(korean.length,407);assert.ok(korean.every(p=>s.map.owners[p.id]==='joseon'));
 assert.equal(scenario.map.initial.markers[atlas.provinces.find(p=>p.owner==='prk'&&p.name==='Uiju').id],'의주 · 압록강의 길');
});
test('all six endings are reachable through legal choices without state mutation',()=>{
 const plans=[
  ['japan_victory',{court_1592:1,palace_crisis:1}],
  ['full_terms',{talks_1593:2}],
  ['partition',{talks_1593:1,excluded_talks:1}],
  ['ascension',strong],
  ['recovery',{...strong,withdrawal_1598:1}],
  ['pyrrhic',{landing_1592:1,command_1597:1}]
 ];
 for(const [expected,plan]of plans){const {state}=play(plan);assert.equal(state.endingId,expected);assert.deepEqual(E.restoreState(scenario,JSON.parse(JSON.stringify(state))),state);console.log('  '+expected+' '+JSON.stringify(state.stats));}
});
test('preparation adds a scene and preserving the fleet skips rebuilding',()=>{
 const prepared=play(strong),unprepared=play({landing_1592:1,command_1597:1});
 assert.ok(prepared.seen.includes('prepared_pass'));assert.ok(!unprepared.seen.includes('prepared_pass'));
 assert.ok(!prepared.seen.includes('naval_recovery'));assert.ok(unprepared.seen.includes('naval_recovery'));
 assert.equal(unprepared.seen.includes('palace_crisis'),false);
});
test('overseas conquest needs logistics and a preserved fleet, not military score alone',()=>{
 let state=E.createState(scenario,{seed:5});
 while(state.eventId!=='withdrawal_1598'){
  const event=E.getEvent(scenario,state);const index=state.activeRandomEventId?1:({...strong,rebuild_1594:0}[event.id]??0);
  state=E.choose(scenario,state,Math.min(index,event.choices.length-1));
 }
 assert.ok(state.stats.military>=80);assert.equal(state.flags.logistics,false);
 assert.equal(E.getChoices(scenario,state)[2].enabled,false);
});
test('occupation clears after withdrawal, partition transfers ownership, conquest reaches the correct Tsushima',()=>{
 const recovered=play({...strong,withdrawal_1598:1}).state;
 for(const p of atlas.provinces.filter(p=>['kor','prk'].includes(p.owner))){assert.equal(recovered.map.owners[p.id],'joseon');assert.equal(recovered.map.occupation[p.id],undefined);}
 const divided=play({talks_1593:1,excluded_talks:1}).state;
 assert.ok(atlas.provinces.some(p=>p.owner==='kor'&&divided.map.owners[p.id]==='japan'));
 const conquered=play(strong).state;
 const island=atlas.provinces.find(p=>p.owner==='jpn'&&p.name==='Tsushima'&&p.cx/6-180<131);
 const city=atlas.provinces.find(p=>p.owner==='jpn'&&p.name==='Tsushima'&&p.cx/6-180>131);
 assert.equal(conquered.map.owners[island.id],'joseon');assert.equal(conquered.map.owners[city.id],'japan');
});
test('random encounters trigger by their rules, return to the story and never interrupt completed peace',()=>{
 const seen=new Set();
 for(let seed=0;seed<10&&seen.size<3;seed++){
  for(const plan of [{landing_1592:1,command_1597:1},{envoys_1591:2,landing_1592:2,court_1592:2,navy_1592:1,rebuild_1594:2,strategy_1596:2,command_1597:2,naval_recovery:1,late_war_1598:1}]){
   const {state}=play(plan,seed,2);Object.entries(state.randomEventCounts).filter(([,n])=>n>0).forEach(([id,n])=>{assert.equal(n,1);seen.add(id);});
  }
 }
 assert.deepEqual([...seen].sort(),['deserters','grain','refugees']);
 for(const plan of [{court_1592:1,palace_crisis:1},{talks_1593:2},{talks_1593:1,excluded_talks:1}]){
  const {state}=play(plan);assert.ok(state.endingId);assert.deepEqual(state.history.at(-1).eventRolls,[]);
 }
});
test('marked reference choices complete a historical broad-outline comparison',()=>{
 const ref=E.getHistoricalReference(scenario);assert.equal(ref.complete,true);assert.equal(ref.state.endingId,'pyrrhic');
 assert.ok(ref.state.history.some(h=>h.eventId==='command_1597'&&h.choiceIndex===1));
 assert.ok(ref.state.history.some(h=>h.eventId==='naval_recovery'));assert.ok(!ref.state.flags.ascension);
});
console.log(passed+' Imjin scenario checks passed.');
