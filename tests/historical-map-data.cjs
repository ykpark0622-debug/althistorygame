'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');global.MapTemplates=require('../map-templates.js');global.GameEngine=require('../engine.js');
const D=require('../map-document.js');require('../map-view.js');
const definitions=JSON.parse(fs.readFileSync(path.join(root,'tools/map-source/historical-presets.json'),'utf8'));
let passed=0;
for(const definition of definitions){
 const filename=definition.galleryDocument?path.join(root,definition.galleryDocument):path.join(root,'examples/maps',definition.id+'.map.json'),buffer=fs.readFileSync(filename),doc=JSON.parse(buffer);
 assert.ok(buffer.length<1048576,'Gallery1MiB limit');assert.equal(doc.map.templateId,definition.baseId,'Portable existing base');assert.deepEqual(D.validate(doc).errors,[]);
 const portable=MapView.initialState(D.toScenario(doc)).map;
 const installed=MapView.initialState(D.toScenario(D.create({templateId:definition.id,id:'test_installed',title:'검사'}))).map;
 assert.deepEqual(portable,installed,'Identical effective map in installed preset and gallery document: '+definition.id);
 const countries=new Map(definition.countries.map(c=>[c.id,c]));assert.ok(countries.has(definition.playerCountry));
 assert.ok(definition.countries.every(c=>/[가-힣]/.test(c.name)),'Korean country names');
 assert.equal(Object.keys(portable.owners).length,MapTemplates.get(definition.baseId).provinces.length,'Complete ownership on the selected preserved base geometry');
 assert.ok(Object.values(portable.owners).every(id=>countries.has(id)),'Every province has a known period owner');
 for(const layer of ['influence','occupation'])assert.ok(Object.values(portable[layer]).every(id=>countries.has(id)));
 console.log('PASS historical map JSON, installed state identity, Korean names and all province owners: '+definition.id);passed++;
}
const world=definitions.find(d=>d.year===1939),byId=new Map(world.countries.map(c=>[c.id,c]));
assert.ok(Object.entries(world.occupation).some(([province,id])=>/일본/.test(byId.get(id).name)&&world.owners[province]!==id));
assert.ok(!world.countries.some(c=>/덴마크.*노르웨이/.test(c.name)),'No obsoleteDenmark-Norwayunion1939');
console.log('PASS1939 occupation differs from sovereignty, and known obsolete union names are corrected');passed++;
console.log(passed+' historical map data checks passed.');
