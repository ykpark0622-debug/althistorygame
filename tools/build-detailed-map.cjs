'use strict';
// Build-time only. Install dependencies outside the published site; runtime has no GIS dependencies.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),cache=path.resolve(process.argv[2]||path.join(root,'../map-data-cache'));
const modules=process.env.MAP_BUILD_MODULES||path.resolve(root,'../map-build-deps/node_modules');
function csv(text){let rows=[],row=[],value='',quoted=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}else if(!quoted&&(c===','||c==='\n')){row.push(value.replace(/\r$/,''));value='';if(c==='\n'){rows.push(row);row=[];}}else value+=c;}if(value||row.length){row.push(value);rows.push(row);}const head=rows.shift();return rows.filter(r=>r.length>1).map(r=>Object.fromEntries(head.map((k,i)=>[k,r[i]||''])));}
const read=name=>JSON.parse(fs.readFileSync(path.join(cache,name),'utf8'));
async function main(){
 const d3=await import(require('node:url').pathToFileURL(path.join(modules,'d3-geo/src/index.js')).href);
 const width=2160,height=1080,projection=d3.geoEquirectangular().scale(width/(2*Math.PI)).translate([width/2,height/2]).precision(0.12),draw=d3.geoPath(projection).digits(1);
 const metadata=csv(fs.readFileSync(path.join(root,'tools/map-source/licenses/geoBoundariesOpen-meta.csv'),'utf8'));
 const metaByKey=new Map(metadata.map(m=>[m.boundaryISO+':'+m.boundaryType,m]));
 const ne=read('ne-countries.geojson'),countryByIso=new Map();
 const shortNames={KOR:'대한민국',PRK:'조선민주주의인민공화국',CHN:'중국',TWN:'대만',USA:'미국',GBR:'영국',FRA:'프랑스',RUS:'러시아'};
 for(const f of ne.features)if(f.properties.ADM0_A3)countryByIso.set(f.properties.ADM0_A3,f);
 // Dependencies may share an ISO alias with their sovereign. Never overwrite the sovereign's geometry.
 for(const f of ne.features){const p=f.properties;for(const key of [p.ISO_A3,p.ISO_A3_EH])if(key&&key!=='-99'&&!countryByIso.has(key))countryByIso.set(key,f);}
 const nameFor=iso=>{const p=countryByIso.get(iso)?.properties,m=metadata.find(m=>m.boundaryISO===iso);return shortNames[iso]||p?.NAME_KO||p?.NAME||m?.boundaryName||iso;};
 function winding(feature){const g=feature.geometry;if(!g)return feature;const polygons=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:null;if(polygons){for(const polygon of polygons)for(let i=0;i<polygon.length;i++){const ring=polygon[i];let sum=0;for(let j=0;j<ring.length-1;j++)sum+=ring[j][0]*ring[j+1][1]-ring[j+1][0]*ring[j][1];if((i===0&&sum>0)||(i>0&&sum<0))ring.reverse();}}return feature;}
 const allowed=license=>/Creative Commons Attribution|Open Data Commons|Public Domain|CC0|Open Government|Etalab|Data license Germany|Singapore Open Data|Federal Office of Topography swisstopo/.test(license||'');
 const provinces=[],used=new Map(),excluded=new Map(),represented=new Set(),ids=new Set();
 function add(feature,id,iso,name,meta){
  if(ids.has(id))throw Error('Duplicate province id '+id);winding(feature);const shape=draw(feature);if(!shape||/NaN|Infinity/.test(shape))return false;
  const bounds=draw.bounds(feature),area=draw.area(feature),center=draw.centroid(feature);
  if(!bounds.flat().every(Number.isFinite)||area>width*height*0.49)throw Error('Invalid spherical winding '+id+' area '+area);
  const bbox=bounds.flat().map(n=>+n.toFixed(1));
  const p={id,name:name||nameFor(iso),owner:iso.toLowerCase(),path:shape,cx:+center[0].toFixed(1),cy:+center[1].toFixed(1),area:+area.toFixed(1),bbox};
  provinces.push(p);ids.add(id);represented.add(iso);if(meta)used.set(iso+':'+meta.boundaryType,meta);return true;
 }
 const source=read('cgaz-adm2-simplified.geojson'),refined={FRA:'ADM4',ESP:'ADM3',DEU:'ADM3',CHE:'ADM3'};
 const inputs=[...source.features.filter(f=>!refined[f.properties.shapeGroup]),...Object.keys(refined).flatMap(iso=>read('extra-'+iso+'.geojson').features)];
 for(const feature of inputs){const p=feature.properties,iso=p.shapeGroup;if(iso==='ATA'||p.shapeType==='DISP')continue;const m=metaByKey.get(iso+':'+p.shapeType);
  if(!m||!allowed(m.boundaryLicense)){excluded.set(iso,{iso,type:p.shapeType,license:m?.boundaryLicense||'No matching source metadata'});continue;}
  add(feature,'gb_'+iso.toLowerCase()+'_'+String(p.shapeID).toLowerCase().replace(/[^a-z0-9_-]/g,'_'),iso,p.shapeName,m);
 }
 // A single Natural Earth country polygon fills countries without a selected open administrative source.
 for(const feature of ne.features){const iso=feature.properties.ISO_A3_EH==='-99'?feature.properties.ADM0_A3:feature.properties.ISO_A3_EH;if(!iso||iso==='ATA'||represented.has(iso))continue;add(feature,'ne_'+iso.toLowerCase(),iso,nameFor(iso),null);}
 const palette=['#bf6d5e','#c1a45b','#8da58c','#789ab1','#a193b4','#b79170','#72a398','#ac7f91','#98a965','#8291a0','#ba927c','#a7acb5','#b3a16b'];
 const familiarColors={FRA:'#5276ae',GBR:'#b96558',ESP:'#d0ad48',CHE:'#9276a7',DEU:'#98a96d',ITA:'#a2b79f',RUS:'#b77978',CHN:'#b49b5e',JPN:'#c78d85',KOR:'#83a58a',USA:'#789db2'};
 const countries=[...represented].sort((a,b)=>nameFor(a).localeCompare(nameFor(b),'ko')).map(iso=>({id:iso.toLowerCase(),name:nameFor(iso),color:familiarColors[iso]||palette[Math.max(0,Number(countryByIso.get(iso)?.properties.MAPCOLOR13||1)-1)%palette.length]}));
 for(const c of countries){const f=countryByIso.get(c.id.toUpperCase());if(!f)continue;const polygons=f.geometry.type==='MultiPolygon'?f.geometry.coordinates:[f.geometry.coordinates];let main=null,area=-1;for(const coordinates of polygons){const part=winding({type:'Feature',geometry:{type:'Polygon',coordinates}}),a=draw.area(part);if(a>area){area=a;main=part;}}if(main)c.focusBounds=draw.bounds(main).flat().map(n=>+n.toFixed(1));}
 function physical(file,filter){const data=read(file);data.features=data.features.filter(f=>!filter||filter(f)).map(winding);return draw(data)||'';}
 const template={id:'world-detailed',name:'세계 세부 지도 · 현대 행정구역',width,height,provinces,countries,
  landPath:physical('ne-land.geojson'),waterPath:physical('ne-lakes.geojson',f=>Number(f.properties.scalerank??f.properties.SCALERANK??0)<=5),riversPath:physical('ne-rivers.geojson',f=>Number(f.properties.scalerank??f.properties.SCALERANK??0)<=5),
  notice:'현대 행정구역을 바탕으로 만든 게임용 지도입니다. 역사 시대의 국경이 아닙니다. 국가별 구역의 크기·자료 연도가 다릅니다. 자료가 없거나 이용 조건이 불명확한 곳은 Natural Earth 국가 단위로 표시합니다. 분쟁지역·해안선은 원자료의 표현을 따르며 역사적 영유권을 판단하지 않습니다.',
  source:'geoBoundaries CGAZ ADM2 + 유럽 일부 ADM3/4 + Natural Earth 1:10m · 경계 단순화·좌표 변환·공개 원자료 선별 · ©swisstopo',
  sources:[{name:'geoBoundaries',url:'https://www.geoboundaries.org/',license:'원자료별 공개 라이선스'},{name:'Natural Earth',url:'https://www.naturalearthdata.com/about/terms-of-use/',license:'Public domain'},{name:'©swisstopo',url:'https://www.swisstopo.admin.ch/en/terms-of-use-free-geodata-and-geoservices',license:'출처 표시'}]};
 const out=path.join(root,'tools/map-source/world-detailed.json');
 const licenseDir=path.join(root,'tools/map-source/licenses');
 const sourceRows=[...used.values()].map(m=>({country:m.boundaryISO,type:m.boundaryType,year:m.boundaryYearRepresented,source:m.boundarySource,license:m.boundaryLicense,licenseUrl:m.licenseSource,sourceUrl:m.boundarySourceURL,original:m.staticDownloadLink}));
 template.credits=sourceRows;template.licenseNotice='geoBoundaries: Runfola et al. (2020), PLoS ONE 15(4): e0231866. 현대 원자료의 경계를 단순화하고 게임 좌표로 변환했습니다. © OpenStreetMap contributors · OSM 유래 가공 데이터베이스는 ODbL 1.0, CC BY-SA 원자료의 수정 도형에는 해당 동일조건을 유지합니다. 아래 원출처·라이선스 정보를 지도와 함께 보관하세요. 프로그램 코드나 창작 시나리오의 라이선스와 구분됩니다.';
 fs.writeFileSync(out,JSON.stringify(template));
 const report={templateId:template.id,builtAt:'2026-10-19',geoBoundariesCommit:'5c25134028196d43ce97b5071934fd0cfc92f09f',sourceArchiveSHA256:'598f6c70893d60a35b96eb0dc31fd1c045e69177e4b8203407710306f6585de1',originalRegions:source.features.length,regions:provinces.length,countries:countries.length,simplification:'mapshaper weighted 3% keep-shapes; Natural Earth 10–12%; Equirectangular SVG coordinates rounded to 0.1px',fallbackCountries:[...excluded.values()],sources:sourceRows};
 fs.writeFileSync(path.join(licenseDir,'world-detailed-provenance.json'),JSON.stringify(report,null,2)+'\n');
 const text=['# 세계 세부 지도: 출처와 이용 조건','','이 문서는 지도 데이터에 적용됩니다. 프로그램 엔진·시나리오의 라이선스를 바꾸지 않습니다.','','- Natural Earth 1:10m land, lakes, rivers, admin-0: public domain. https://www.naturalearthdata.com/about/terms-of-use/','- geoBoundaries: Runfola, D. et al. (2020), geoBoundaries: A global database of political administrative boundaries. PLoS ONE 15(4): e0231866. https://doi.org/10.1371/journal.pone.0231866','- CGAZ 자료: https://www.geoboundaries.org/globalDownloads.html','- 고정 원본: https://github.com/wmgeolab/geoBoundaries/tree/'+report.geoBoundariesCommit+'/releaseData/CGAZ','- 원본 zip SHA-256: '+report.sourceArchiveSHA256,'- 가공: 공개 원자료의 경계 선별, 단순화, 게임 좌표 변환, 한국어 국가명 추가. 게임 구역 ID는 이 버전에 고정되어 있습니다.','- 가공 지도 도형은 tools/map-source/world-detailed.json으로도 제공합니다. 원본·국가별 조건은 licenses/geoBoundariesOpen-meta.csv 및 world-detailed-provenance.json을 함께 보관하세요.','- geoBoundaries 프로젝트의 CC BY 4.0 안내와 별도로, 개별 경계에는 아래 원자료 조건이 적용됩니다. 출처, 라이선스 링크, 변경 사실을 유지하세요.','- OpenStreetMap 유래 데이터: © OpenStreetMap contributors, https://www.openstreetmap.org/copyright ; ODbL 1.0 https://opendatacommons.org/licenses/odbl/1-0/ 에 따라 해당 가공 데이터베이스를 제공합니다.','- CC BY-SA 원자료의 수정 도형에는 해당 동일조건 공유 라이선스가 유지됩니다. 지도 데이터의 재사용을 프로그램 코드의 이용 조건으로 제한하지 않습니다.','','현대 경계 자료이며, 국가별 자료의 연도·행정단계·정확도가 다릅니다. 분쟁지역은 CGAZ의 원자료 표현(미국 국무부 기준)을 따릅니다. 확인 불명확한 원자료는 선택하지 않고 Natural Earth로 대체했습니다.','','## 선택한 행정 경계의 원출처','','| 국가 | 단계·연도 | 라이선스 | 출처 |','|---|---|---|---|',...sourceRows.map(m=>'| '+[m.country,m.type+' · '+m.year,m.license+' · '+m.licenseUrl,m.source+' · '+m.sourceUrl].map(v=>String(v).replace(/\|/g,'/').replace(/\r?\n/g,' ')).join(' | ')+' |'),'','## 국가 단위 대체 목록','',...report.fallbackCountries.map(m=>'- '+m.iso+' / '+m.type+' / 원자료 표기: '+m.license),''];
 fs.writeFileSync(path.join(root,'MAP-SOURCES.md'),text.join('\n'));
 console.log(JSON.stringify({regions:provinces.length,countries:countries.length,bytes:fs.statSync(out).size,fallback:[...excluded.keys()],physicalBytes:[template.landPath.length,template.waterPath.length,template.riversPath.length],sha256:crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex')},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
