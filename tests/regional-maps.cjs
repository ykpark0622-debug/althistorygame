'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const maps=require(path.resolve(__dirname,'../map-regions.js'));
const world=maps.get('world-detailed'),worldById=new Map(world.provinces.map(p=>[p.id,p]));
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name);}
test('six regional choices and explicit supported eras',()=>{
  assert.deepEqual(maps.regions().map(r=>r.id),['eastasia','europe_med','asia','north_america','south_america','world']);
  assert.deepEqual(maps.eras('eastasia').map(e=>e.id),['1419','1592','1754','modern']);
  assert.deepEqual(maps.eras('world').map(e=>e.id),['1754','modern']);
  assert.equal(maps.regionalId('world','1592'),null);assert.equal(maps.regionalId('missing','modern'),null);
  assert.equal(maps.selection('world-detailed'),null);assert.equal(maps.selection('regional_world_1592'),null);
});
test('legacy templates retain identity and contents',()=>{
  for(const id of ['eastasia1419','world1754','world-detailed'])assert.strictEqual(maps.get(id),maps.get(id));
  assert.equal(world.provinces.length,61940);assert.equal(maps.get('eastasia1419').provinces.length,124);
  assert.equal(maps.get('world1754').provinces.length,167);
});
test('regional views share original paths, use local coordinates and cache identity',()=>{
  for(const region of maps.regions()){
    const id=maps.regionalId(region.id,region.defaultEra),t=maps.get(id);assert.strictEqual(t,maps.get(id));
    assert.deepEqual(maps.selection(id),{regionId:region.id,eraId:region.defaultEra});
    assert.ok(t.width>0&&t.width<=2160&&t.height>0&&t.height<=1080);
    if(region.id==='world')assert.equal(t.provinces.length,61940);else assert.ok(t.provinces.length<61940);
    assert.equal(t.landPath,world.landPath);assert.equal(t.waterPath,world.waterPath);assert.equal(t.riversPath,world.riversPath);
    for(const p of t.provinces){const base=worldById.get(p.id);assert.ok(base);assert.equal(p.path,base.path);assert.ok(p.cx>=0&&p.cx<=t.width&&p.cy>=0&&p.cy<=t.height,p.id);assert.ok(p.bbox[0]>=0&&p.bbox[1]>=0&&p.bbox[2]<=t.width&&p.bbox[3]<=t.height,p.id);}
    for(const country of t.countries)if(country.focusBounds){const b=country.focusBounds;assert.ok(b[0]>=0&&b[1]>=0&&b[2]<=t.width&&b[3]<=t.height,country.id);}
  }
});
test('1592 Joseon unites both peninsula grids without altering the modern source',()=>{
  const t=maps.get(maps.regionalId('eastasia','1592')),byId=new Map(t.provinces.map(p=>[p.id,p]));
  const peninsula=world.provinces.filter(p=>p.owner==='kor'||p.owner==='prk');assert.equal(peninsula.length,407);
  for(const p of peninsula){assert.equal(byId.get(p.id)?.owner,'joseon');assert.ok(['kor','prk'].includes(worldById.get(p.id).owner));}
  assert.equal(t.countries.find(c=>c.id==='joseon').available,true);assert.equal(t.countries.find(c=>c.id==='fra').available,false);
  assert.ok(t.provinces.some(p=>p.owner==='ming'));assert.ok(t.provinces.some(p=>p.owner==='tsushima'));assert.ok(t.provinces.some(p=>p.owner==='unassigned'));
});
test('1419 frontier and 1754 colonial preset differ from modern ownership',()=>{
  const early=maps.get(maps.regionalId('eastasia','1419')),late=maps.get(maps.regionalId('eastasia','1592'));
  assert.ok(early.provinces.filter(p=>p.owner==='joseon').length<late.provinces.filter(p=>p.owner==='joseon').length);
  const europe=maps.get(maps.regionalId('europe_med','1754')),america=maps.get(maps.regionalId('north_america','1754'));
  assert.ok(europe.provinces.some(p=>p.owner==='lorraine'));assert.ok(europe.provinces.some(p=>p.owner==='prussia'));
  assert.ok(america.provinces.some(p=>p.owner==='france'));assert.ok(america.provinces.some(p=>p.owner==='native'));
  assert.ok(!europe.provinces.some(p=>worldById.get(p.id).owner==='kor'));
  for(const id of ['fra','gbr','kor','prk','jpn'])assert.ok(europe.countries.some(c=>c.id===id),'imported country remains valid: '+id);
});
test('modern preset preserves country owners and cropped lists include regional descriptors',()=>{
  const t=maps.get(maps.regionalId('eastasia','modern'));
  for(const p of t.provinces)assert.equal(p.owner,worldById.get(p.id).owner);
  const listing=maps.list();assert.equal(listing.length,28);assert.equal(listing.filter(t=>t.regionId).length,14);
  assert.equal(listing.find(t=>t.id==='europe-balanced')?.recommended,true);
  assert.equal(listing.find(t=>t.id==='world-balanced')?.recommended,true);
});
test('continent lists exclude unrelated continents while preserving relevant islands',()=>{
  const asia=maps.get(maps.regionalId('asia','modern'));
  for(const id of ['aus','egy','ken','rou','gum','fsm'])assert.ok(!asia.provinces.some(p=>p.owner===id),'not an Asian province: '+id);
  for(const id of ['chn','jpn','kor','ind','tur','rus'])assert.ok(asia.provinces.some(p=>p.owner===id),'Asian member: '+id);
  const east=maps.get(maps.regionalId('eastasia','modern'));
  for(const id of ['phl','tha','mmr','vnm'])assert.ok(!east.provinces.some(p=>p.owner===id),'not an East Asian province: '+id);
  const north=maps.get(maps.regionalId('north_america','modern')),south=maps.get(maps.regionalId('south_america','modern'));
  assert.ok(north.provinces.some(p=>p.owner==='grl'));assert.ok(north.provinces.some(p=>p.owner==='cub'));
  for(const id of ['bra','ven','sur'])assert.ok(!north.provinces.some(p=>p.owner===id));
  for(const id of ['usa','cub','pan'])assert.ok(!south.provinces.some(p=>p.owner===id));
  assert.ok(!south.provinces.some(p=>p.owner==='fra'&&90-(p.cy+south.offsetY)/6>=8),'French Caribbean islands are not South American rows');
});
console.log(passed+' regional map tests passed.');
