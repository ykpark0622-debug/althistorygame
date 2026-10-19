'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),T=require('../map-templates.js'),E=require('../engine.js');
const template=T.get('world-detailed'),demo=JSON.parse(fs.readFileSync(path.join(root,'examples/world-detailed-demo.json'),'utf8'));
assert.ok(T.get('eastasia1419'));assert.ok(T.get('world1754'));assert.ok(template.provinces.length>=22000);assert.ok(template.countries.length>=180);
const ids=new Set(),countries=new Set(template.countries.map(c=>c.id));
for(const p of template.provinces){assert.ok(!ids.has(p.id),'duplicate '+p.id);ids.add(p.id);assert.ok(countries.has(p.owner),'unknown owner '+p.owner);assert.ok(p.name);assert.ok(p.path&&!/NaN|Infinity/.test(p.path));assert.ok([p.cx,p.cy,p.area,...p.bbox].every(Number.isFinite));assert.ok(p.area<template.width*template.height*.49,'globe-spanning wrong winding '+p.id);assert.ok(p.bbox[0]>=-.1&&p.bbox[2]<=template.width+.1);}
assert.ok(template.landPath&&template.waterPath&&template.riversPath);assert.ok(template.provinces.filter(p=>p.owner==='fra').length>2000);assert.ok(template.provinces.filter(p=>p.owner==='esp').length>8000);assert.ok(template.provinces.filter(p=>p.owner==='che').length>2000);assert.ok(ids.has('ne_omn'));
const france=template.countries.find(c=>c.id==='fra');assert.ok(france.focusBounds[0]>1000&&france.focusBounds[2]<1200&&france.focusBounds[1]<300,'France focus should be mainland Europe rather than an overseas ISO alias');
console.log('PASS '+template.provinces.length+' unique real-world regions; valid projected geometry, owners, physical layers and fallbacks');
assert.deepEqual(E.validateScenario(demo).errors,[]);
let state=E.createState(demo,{seed:123,playerName:'지도 검사'}),initial=E.clone(state);
let count=0;
while(!state.endingId&&count++<30){if(state.activeRandomEventId){state=E.choose(demo,state,0);continue;}const status=E.getReignStatus(demo,state);if(status.ready)state=E.settleTurn(demo,state);else{const card=status.cards.find(c=>!Object.hasOwn(status.decisions,c.part.id));state=E.choosePart(demo,state,card.event.id,0);}}
assert.equal(state.endingId,'renewal');assert.equal(Object.keys(state.map.owners).length,template.provinces.length);assert.deepEqual(initial,E.createState(demo,{seed:123,playerName:'지도 검사'}));
const restored=E.restoreState(demo,JSON.parse(JSON.stringify(state)));assert.deepEqual(restored.map,state.map);assert.equal(restored.endingId,state.endingId);
console.log('PASS dense-map reign scenario choices, outcomes, immutable input and save/reload replay');
const source=JSON.parse(fs.readFileSync(path.join(root,'tools/map-source/licenses/world-detailed-provenance.json'),'utf8'));assert.equal(source.regions,template.provinces.length);assert.ok(source.sources.length>150);assert.equal(source.geoBoundariesCommit,'5c25134028196d43ce97b5071934fd0cfc92f09f');
console.log('PASS source inventory and fixed source version match runtime map');
