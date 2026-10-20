'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const workspace=path.resolve(__dirname,'..'),dataDir=path.join(__dirname,'map-source/history-input');
const target=path.resolve(__dirname,'..');
const reportDir=path.join(target,'build-reports/historical');fs.mkdirSync(reportDir,{recursive:true});
const maps=require('../map-templates.js');
const specs=[
 {year:1444,id:'historical_europe_1444',baseId:'europe-balanced',regionId:'europe_med',eraId:'historical_1444',name:'유럽 · 1444년',title:'유럽 15세기 · 1444년',player:'Kingdom of France',date:'1444년 무렵'},
 {year:1648,id:'historical_europe_1648',baseId:'europe-balanced',regionId:'europe_med',eraId:'historical_1648',name:'유럽 · 1648년',title:'유럽 17세기 · 1648년',player:'Kingdom of France',date:'1648년 베스트팔렌 조약 이후'},
 {year:1550,id:'historical_world_1550',baseId:'world-balanced',regionId:'world',eraId:'historical_1550',name:'세계 · 1550년',title:'세계 16세기 · 1550년',player:'Joseon Dynasty',date:'1550년 무렵'},
 {year:1914,id:'historical_world_1914',baseId:'world-balanced',regionId:'world',eraId:'historical_1914',name:'세계 · 1914년',title:'제1차 세계대전 전야 · 1914년',player:'German Empire',date:'1914년 7월, 유럽 전쟁 발발 직전'},
 {year:1939,id:'historical_world_1939',baseId:'world-balanced',regionId:'world',eraId:'historical_1939',name:'세계 · 1939년',title:'제2차 세계대전 전야 · 1939년',player:'Republic of China',date:'1939년 8월, 폴란드 침공 직전·중일전쟁 진행 중'}
];
const reviewPaths=['early-review.json','wars-review.json'];
let reviews=reviewPaths.filter(f=>fs.existsSync(path.join(dataDir,f))).map(f=>JSON.parse(fs.readFileSync(path.join(dataDir,f),'utf8')));
const translations=Object.assign({},...reviews.map(r=>r.names||{}));
const correctors=['early-corrections.cjs','wars-corrections.cjs','geographic-gaps.cjs'].filter(f=>fs.existsSync(path.join(dataDir,f))).map(f=>require(path.join(dataDir,f)));
Object.assign(translations,...correctors.map(fn=>fn.names||{}));
for(const [name,value]of Object.entries({...translations}))if(/^\(.*\)$/.test(name)&&!translations[name.slice(1,-1)])translations[name.slice(1,-1)]=value;
const digest=v=>crypto.createHash('sha256').update(v).digest('hex');
const key=name=>'hist_'+digest(name).slice(0,16);
const palettes=['#6296b4','#c16e5d','#c5a65b','#8ca36b','#a98bb6','#c7946f','#77a69b','#af8493','#8b9da8','#b0a176','#6c8d7d','#9ca866'];
const preferredColors={'Kingdom of France':'#547eb4','French Third Republic':'#547eb4','Kingdom of England':'#c36758','Kingdom of Great Britain':'#c36758','Ottoman Empire':'#69a188','Russian Empire':'#8eaa76','Union of Soviet Socialist Republics':'#ba625a','German Empire':'#8c929b','Nazi Germany':'#88939a','Kingdom of Castile':'#d2b356','Spanish Empire':'#c5a452','Empire of Japan':'#c57572','Republic of China':'#c3ac64','Ming Dynasty':'#c4a452','Joseon Dynasty':'#61958a','Manchukuo':'#cfb978'};
const namesEqual=(a,b)=>a.replace(/^\(|\)$/g,'')===b.replace(/^\(|\)$/g,'');
function geometryPolys(geometry){return geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[];}
function bounds(points){return points.reduce((b,p)=>[Math.min(b[0],p[0]),Math.min(b[1],p[1]),Math.max(b[2],p[0]),Math.max(b[3],p[1])],[Infinity,Infinity,-Infinity,-Infinity]);}
function pointRing(x,y,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function pointPolys(x,y,polys){return polys.some(poly=>pointRing(x,y,poly[0])&&!poly.slice(1).some(ring=>pointRing(x,y,ring)));}
function pathRings(svg){const rings=[];let ring;for(const match of svg.matchAll(/([ML])(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)|(Z)/g)){if(match[1]==='M'){ring=[];rings.push(ring);}if(match[1])ring.push([+match[2],+match[3]]);}return rings;}
function provinceSamples(province,template){const rings=pathRings(province.path),b=bounds(rings.flat()),points=[];const n=7;
 for(let i=0;i<n;i++)for(let j=0;j<n;j++){const x=b[0]+(i+.5)*(b[2]-b[0])/n,y=b[1]+(j+.5)*(b[3]-b[1])/n;if(rings.reduce((n,r)=>n+(pointRing(x,y,r)?1:0),0)%2)points.push([x/6-180,90-y/6]);}
 if(!points.length){const x=province.cx+(template.offsetX||0),y=province.cy+(template.offsetY||0);points.push([x/6-180,90-y/6]);}
 return {points,bbox:[b[0]/6-180,90-b[3]/6,b[2]/6-180,90-b[1]/6],lon:(province.cx+(template.offsetX||0))/6-180,lat:90-(province.cy+(template.offsetY||0))/6};
}
function fallback(year,iso,lon,lat,modernName){
 if(year<1700){
  if(iso==='ata')return '남극 · 정주 국가 없음';
  if(['aus','nzl','png','slb','vut','ncl','fji','wsm','ton','kir','tuv','fsm','mhl','plw','nru'].includes(iso))return lon<145?'오세아니아 원주민 공동체 · 경계 미상':'태평양 여러 공동체 · 경계 미상';
  if(lon< -30&&lat>12)return '북아메리카 원주민 공동체 · 경계 미상';
  if(lon< -30)return '남아메리카 원주민 공동체 · 경계 미상';
  if(lon>-22&&lon<55&&lat<25)return lat>3?'아프리카 여러 공동체 · 경계 미상':'남부아프리카 여러 공동체 · 경계 미상';
  if(lat>55&&lon>35)return '북방 여러 공동체 · 경계 미상';
  return modernName+' 일대 · 경계 미상';
 }
 if(iso==='ata')return '남극 · 영유권 주장 구분 생략';
 return modernName+' 일대 · 자료 공백';
}
const out=[],reports=[];
for(const spec of specs){
 const template=maps.get(spec.baseId),modernNames=new Map(template.countries.map(c=>[c.id,c.name]));
 const raw=JSON.parse(fs.readFileSync(path.join(dataDir,'active-'+spec.year+'.geojson'),'utf8')).features;
 const features=raw.map((f,index)=>({index,name:f.properties.Name,area:f.properties.Area||Infinity,parent:f.properties.MemberOf||'',polys:geometryPolys(f.geometry)}));
 for(const f of features)f.boxes=f.polys.map(p=>bounds(p[0]));
 features.sort((a,b)=>a.area-b.area||a.index-b.index);
 const assigned=[],summary={},fallbacks=[];
 for(const p of template.provinces){
  const s=provinceSamples(p,template),candidate=features.filter(f=>f.boxes.some(b=>b[0]<=s.bbox[2]&&b[2]>=s.bbox[0]&&b[1]<=s.bbox[3]&&b[3]>=s.bbox[1]));
  const votes=new Map();
  for(const [lon,lat]of s.points){const f=candidate.find(f=>pointPolys(lon,lat,f.polys));if(f)votes.set(f,(votes.get(f)||0)+1);}
  const source=[...votes].sort((a,b)=>b[1]-a[1]||a[0].area-b[0].area)[0]?.[0];
  let result={name:source?.name||fallback(spec.year,p.owner,s.lon,s.lat,modernNames.get(p.owner)||p.owner)};
  if(source?.parent){const parts=source.parent.split(';').map(x=>x.trim());result.influence=parts.find(name=>name&&!namesEqual(name,result.name));}
  const context={year:spec.year,lon:s.lon,lat:s.lat,modernOwner:p.owner,chosenName:result.name,candidates:candidate.map(f=>f.name),provinceId:p.id,provinceName:p.name};
  for(const correct of correctors){const correction=correct({...context,chosenName:result.name});if(correction)result={...result,...correction};}
  if(result.influence&&namesEqual(result.name,result.influence))delete result.influence;
  result.name=result.name.replace(/^\((.*)\)$/,'$1');
  if(result.influence)result.influence=result.influence.replace(/^\((.*)\)$/,'$1');
  if(result.occupation)result.occupation=result.occupation.replace(/^\((.*)\)$/,'$1');
  if(result.influence===result.name)delete result.influence;
  assigned.push({province:p,...s,source:source?.name,...result});
  summary[result.name]=(summary[result.name]||0)+1;
  if(!source)fallbacks.push({id:p.id,name:p.name,iso:p.owner,lon:s.lon,lat:s.lat,assigned:result.name});
 }
 const owners={},influence={},occupation={},markers={},countryData=new Map();
 function register(name){if(!countryData.has(name)){const id=key(name),nameKo=translations[name]||name;countryData.set(name,{id,name:nameKo,color:preferredColors[name]||palettes[parseInt(digest(name).slice(0,6),16)%palettes.length]});}return countryData.get(name).id;}
 for(const a of assigned){owners[a.province.id]=register(a.name);if(a.influence)influence[a.province.id]=register(a.influence);if(a.occupation)occupation[a.province.id]=register(a.occupation);if(a.marker)markers[a.province.id]=a.marker;}
 for(const [name,c]of countryData){const owned=assigned.filter(a=>a.name===name);if(!owned.length)continue;let b=owned.reduce((b,a)=>{const q=a.province.bbox;return [Math.min(b[0],q[0]),Math.min(b[1],q[1]),Math.max(b[2],q[2]),Math.max(b[3],q[3])];},[Infinity,Infinity,-Infinity,-Infinity]);b=[Math.max(0,b[0]),Math.max(0,b[1]),Math.min(template.width,b[2]),Math.min(template.height,b[3])];if(b[2]>b[0]&&b[3]>b[1])c.focusBounds=b;}
 const notice=spec.date+'를 기준으로 한 역사 지도 초안입니다. 현대 균형 지도의 구획을 유지하고 공개 역사 경계를 표본 대조하여 영토를 근사 배치했습니다. 도시국가·복잡한 월경지·정확한 전선은 일부 생략됩니다. 빗금은 상위 세력의 영향권 또는 점령이며, 식민지·자치령·제후령도 편집 가능한 단위로 구분합니다. 경계 미상으로 표시한 지역은 빈 땅이 아니라 여러 공동체가 살던 곳입니다. 지역명은 위치 검색을 위한 현대 지명이 남아 있습니다.';
 const description=spec.title+'\n기준: '+spec.date+'\n'+notice+'\n역사 경계: Cliopatria v0.2.1, Seshat Global History Databank (CC BY 4.0, https://github.com/Seshat-Global-History-Databank/cliopatria). 변경: 연도 추출·균형 구획에 재배치·한국어 명칭·수동 보정. https://creativecommons.org/licenses/by/4.0/\n바탕 구획: 기존 Natural Earth / geoBoundaries 균형 지도. 세부 출처와 데이터별 이용조건은 HISTORICAL-MAP-SOURCES.md 및 기존 WORLD-MAP-SOURCES.md를 확인하세요. 지도만 포함하며 전쟁·외교·경제 시뮬레이션은 시나리오에서 작성합니다.';
 const countries=[...countryData.values()].sort((a,b)=>a.name.localeCompare(b.name,'ko'));
 const playerCountry=countryData.get(spec.year===1550?'Joseon':spec.player)?.id||countries[0].id;
 out.push({...spec,notice,description,countries,owners,influence,occupation,markers,playerCountry,source:'Cliopatria v0.2.1 (CC BY 4.0), Seshat Global History Databank; 역사 경계 근사 재배치·한국어 번역·수동 보정',sources:[{name:'Cliopatria v0.2.1 · CC BY 4.0',url:'https://github.com/Seshat-Global-History-Databank/cliopatria/tree/v0.2.1'}]});
 const report={id:spec.id,year:spec.year,regions:assigned.length,countries:countries.length,sourceCoverageRegions:assigned.length-fallbacks.length,fallbackRegions:fallbacks.length,summary,untranslated:[...countryData.keys()].filter(n=>!translations[n]&&!/[가-힣]/.test(n)),fallbacks,assignments:assigned.map(a=>({id:a.province.id,province:a.province.name,iso:a.province.owner,lon:a.lon,lat:a.lat,name:a.name,influence:a.influence,occupation:a.occupation,source:a.source,editorialNote:a.note}))};
 fs.writeFileSync(path.join(reportDir,'assignments-'+spec.year+'.json'),JSON.stringify(report,null,2)+'\n');reports.push({...report,assignments:undefined,fallbacks:undefined});
 console.log(spec.year,assigned.length,countries.length,'source coverage',assigned.length-fallbacks.length,'fallback',fallbacks.length,'untranslated',report.untranslated.length);
}
fs.writeFileSync(path.join(target,'tools/map-source/historical-presets.json'),JSON.stringify(out)+'\n');
fs.writeFileSync(path.join(reportDir,'historical-summary.json'),JSON.stringify(reports,null,2)+'\n');
module.exports={specs,out,reports};
