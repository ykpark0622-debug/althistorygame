'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),T=require('../map-templates.js');
globalThis.MapTemplates=T;const E=require('../engine.js');globalThis.GameEngine=E;const D=require('../map-document.js');
const t=T.get('world-balanced'),clone=value=>JSON.parse(JSON.stringify(value));
assert.ok(t,'The balanced world template is registered');
assert.equal(t.recommended,true);assert.equal(t.width,2160);assert.equal(t.height,1080);
assert.ok(t.provinces.length>=3000&&t.provinces.length<10000,'A manageable world with several thousand regions');
assert.ok(t.provinces.length<T.get('world-detailed').provinces.length/5,'At least 80 percent fewer regions than the detailed world');
const ids=new Set(),countryIds=new Set(t.countries.map(c=>c.id));
assert.equal(countryIds.size,t.countries.length,'Country IDs are unique');
assert.deepEqual([...countryIds].sort(),T.get('world-detailed').countries.map(c=>c.id).sort(),'All existing country and territory groups are retained');
for(const p of t.provinces){
 assert.ok(!ids.has(p.id),'Duplicate province '+p.id);ids.add(p.id);assert.ok(countryIds.has(p.owner),'Unknown owner '+p.owner);
 assert.ok(p.name&&p.path&&!/NaN|Infinity/.test(p.path),'Readable named geometry '+p.id);
 assert.ok([p.cx,p.cy,p.area,...p.bbox].every(Number.isFinite),'Finite geometry '+p.id);
 assert.ok(p.cx>=0&&p.cy>=0&&p.cx<=t.width&&p.cy<=t.height,'Visible center '+p.id);
 assert.ok(p.bbox[0]>=-.1&&p.bbox[1]>=-.1&&p.bbox[2]<=t.width+.1&&p.bbox[3]<=t.height+.1,'World bounds '+p.id);
 assert.ok(p.bbox[0]<=p.bbox[2]&&p.bbox[1]<=p.bbox[3],'Ordered bounds '+p.id);
 assert.ok(p.area>=0&&p.area<t.width*t.height*.49,'No spherical complement '+p.id);
}
const counts=Object.fromEntries(['fra','deu','che','ita','esp'].map(id=>[id,t.provinces.filter(p=>p.owner===id).length]));
assert.deepEqual(counts,{fra:96,deu:108,che:26,ita:107,esp:52});
assert.ok(t.provinces.some(p=>p.owner==='ita'&&/Firenze|Florence/i.test(p.name)),'Florence remains separately editable');
assert.ok(t.provinces.some(p=>p.owner==='ita'&&/Roma|Rome/i.test(p.name)),'Rome remains separately editable');
assert.ok(t.landPath&&t.waterPath&&t.riversPath,'The global physical layers are present');
for(const country of t.countries){
 assert.match(country.color,/^#[0-9a-f]{6}$/i,'Country color '+country.id);
 assert.ok(t.provinces.some(p=>p.owner===country.id),'Every listed country has geometry '+country.id);
 if(country.focusBounds)assert.ok(country.focusBounds.every(Number.isFinite),'Finite focus '+country.id);
}
console.log('PASS balanced density, country palette, unique geometry IDs and global projection bounds');

// Check actual rings, not just their bounding boxes: large antimeridian boxes
// otherwise conceal missing Alaska, Siberia and Pacific island geometry.
const ringsById=new Map();
function rings(p){
 if(ringsById.has(p.id))return ringsById.get(p.id);
 const value=[];
 for(const subpath of p.path.split(/(?=M)/)){
  if(!subpath.startsWith('M'))continue;
  assert.ok(!/[A-DF-KN-Y]/i.test(subpath),'Expected straight projected boundary path '+p.id);
  const nums=subpath.match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)?.map(Number)||[];
  assert.equal(nums.length%2,0,'Paired path coordinates '+p.id);
  const ring=[];for(let i=0;i<nums.length;i+=2)ring.push([nums[i],nums[i+1]]);
  if(ring.length>=3)value.push(ring);
 }
 ringsById.set(p.id,value);return value;
}
function contains(p,x,y){
 let inside=false;
 for(const ring of rings(p))for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const a=ring[i],b=ring[j];
  if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;
 }
 return inside;
}
const locations=[
 ['rus',37.6,55.75,'Moscow'],['rus',100,60,'Siberia'],['rus',160,56,'Kamchatka'],
 ['usa',-100,40,'continental USA'],['usa',-150,64,'Alaska'],['usa',-155.5,19.5,'Hawaii'],
 ['aus',133,-25,'Australia'],['aus',146.8,-42,'Tasmania'],['can',-110,56,'Canada'],
 ['chn',106,35,'China'],['ind',78,23,'India'],['npl',84,28,'Nepal'],['btn',90.4,27.4,'Bhutan'],
 ['che',8,47,'Switzerland'],['lie',9.55,47.15,'Liechtenstein'],['smr',12.46,43.94,'San Marino'],['and',1.57,42.55,'Andorra'],['vat',12.452,41.904,'Vatican'],
 ['bra',-52,-10,'Brazil'],['arg',-65,-35,'Argentina'],
 ['zaf',25,-29,'South Africa'],['lso',28.5,-29.5,'Lesotho enclave'],['cod',23,-3,'Congo'],['egy',29,27,'Egypt'],
 ['mdg',47,-19,'Madagascar'],['jpn',138,36,'Honshu'],['idn',110,-7.5,'Java'],
 ['nzl',172,-43,'New Zealand'],['cub',-78,21,'Cuba'],['ita',9,40,'Sardinia'],['ita',14,37.5,'Sicily']
];
for(const [country,lon,lat,label]of locations){
 const x=(lon+180)*6,y=(90-lat)*6;
 assert.ok(t.provinces.some(p=>p.owner===country&&p.bbox[0]<=x&&p.bbox[2]>=x&&p.bbox[1]<=y&&p.bbox[3]>=y&&contains(p,x,y)),label+' remains colored by '+country);
}
for(const [surrounding,lon,lat,label]of [['zaf',28.5,-29.5,'Lesotho'],['ita',12.46,43.94,'San Marino']]){
 assert.ok(!t.provinces.some(p=>p.owner===surrounding&&contains(p,(lon+180)*6,(90-lat)*6)),label+' enclave hole survives the surrounding country dissolve');
}
const russia=t.countries.find(c=>c.id==='rus');
assert.ok(russia.focusBounds&&russia.focusBounds[2]-russia.focusBounds[0]<t.width*.6,'Russian label/focus uses mainland instead of wrapping across the whole globe');
const vatican=t.provinces.find(p=>p.owner==='vat');
assert.ok(vatican.area>0&&vatican.bbox[0]<vatican.bbox[2]&&vatican.bbox[1]<vatican.bbox[3],'Subpixel Vatican outline is preserved by selective precision');
console.log('PASS mainland and island point coverage, including both sides of the antimeridian');

const doc=D.create({id:'world_balanced_qa',templateId:t.id,title:'세계 균형 지도 검사'});
const province=t.provinces.find(p=>p.owner==='ita');
doc.map.initial={owners:{[province.id]:'fra'},occupation:{},influence:{},markers:{}};
assert.deepEqual(D.validate(doc).errors,[]);assert.deepEqual(D.normalize(clone(doc)),doc);
assert.deepEqual(D.fromScenario(D.toScenario(doc)),doc,'Portable map/scenario round trip');
const scenario=D.toScenario(doc);
Object.assign(scenario,{draft:false,start:'first',stats:[{id:'funds',name:'재정',initial:50,min:0,max:100}],events:[{id:'first',title:'지도 검사',body:'선택 결과가 세계 지도에 반영됩니다.',next:'END',choices:[{text:'이탈리아에 반환',effects:{funds:-5},territory:[{prov:province.id,to:'ita',marker:'반환'}]}]}],endings:[{id:'normal',title:'완료',body:'지도를 편집했습니다.',kind:'mixed',priority:0,immediate:false,when:[]}],defaultEnding:'normal'});
assert.deepEqual(E.validateScenario(scenario).errors,[]);
const before=clone(scenario),state=E.createState(scenario,{seed:52,playerName:'검사자'});
assert.equal(state.map.owners[province.id],'fra');assert.equal(Object.keys(state.map.owners).length,t.provinces.length);
const next=E.choose(scenario,state,0);
assert.equal(next.map.owners[province.id],'ita');assert.equal(next.map.markers[province.id],'반환');assert.equal(next.stats.funds,45);assert.equal(next.endingId,'normal');
assert.deepEqual(E.restoreState(scenario,clone(next)),next);assert.deepEqual(scenario,before);assert.equal(state.map.owners[province.id],'fra');
console.log('PASS portable editable map, playable choice territory effects and immutable save replay');

const sourcePath=path.join(root,'tools/map-source/world-balanced.json'),reportPath=path.join(root,'tools/map-source/licenses/world-balanced-build.json');
const report=JSON.parse(fs.readFileSync(reportPath,'utf8'));
// The web distribution omits duplicate raw geometry. Its lazily reconstructed
// registry payload must still match the build provenance byte for byte.
const sourceBytes=fs.existsSync(sourcePath)?fs.readFileSync(sourcePath):Buffer.from(JSON.stringify(t));
assert.equal(report.regions,t.provinces.length);assert.equal(report.bytes,sourceBytes.length);
assert.equal(report.sha256,crypto.createHash('sha256').update(sourceBytes).digest('hex'));
for(const country of report.countries){
 assert.ok(country.regions>0,'Country retained '+country.iso);assert.ok(country.areaChangeRatio<0.003,'Area conserved '+country.iso);
 assert.equal(country.regions,t.provinces.filter(p=>p.owner===country.iso.toLowerCase()).length,'Country count matches source report '+country.iso);
}
assert.equal(report.countryCount,t.countries.length);assert.equal(report.countries.length,t.countries.length);
assert.ok(report.sources.length>=5);for(const source of report.sources)assert.match(source.sha256,/^[0-9a-f]{64}$/,'Fixed source digest '+source.filename);
assert.ok(t.credits?.length>100,'Per-source license credits remain available');
assert.ok(t.sourceDocumentation&&fs.existsSync(path.join(root,t.sourceDocumentation)),'Source and derivative-data notice ships with template');
assert.ok(t.licenseNotice&&/Natural Earth|geoBoundaries/.test(t.source),'Licensed source metadata retained');
console.log('PASS build provenance hash, source area conservation and per-source credits');

const prior=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/v25-map-manifest.json'),'utf8'));
const current=JSON.parse(fs.readFileSync(path.join(root,'assets/maps/manifest.json'),'utf8'));
for(const entry of prior.templates)assert.deepEqual(current.templates.find(item=>item.id===entry.id),entry,'Unchanged template '+entry.id);
for(const asset of prior.assets)assert.deepEqual(current.assets.find(item=>item.id===asset.id),asset,'Unchanged source asset '+asset.id);
assert.deepEqual(current.regions,prior.regions);assert.deepEqual(current.eras,prior.eras);
assert.equal(current.templates.length,prior.templates.length+10);
console.log('PASS all '+prior.templates.length+' previous template asset hashes, IDs, sizes and region/era metadata remain exact');
