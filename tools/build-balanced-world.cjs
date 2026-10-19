'use strict';
// Build-time GIS processing only. The published template is static JSON/SVG.
// Existing template IDs and province IDs are deliberately untouched. Geometry is
// dissolved per country without resimplifying global coastlines or removing islands.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const cache = path.resolve(process.argv[2] || path.join(root, '../map-data-cache'));
const modules = process.env.MAP_BUILD_MODULES || path.resolve(root, '../map-build-deps/node_modules');
const mapshaper = require(path.join(modules, 'mapshaper'));
const bounds = [-180, -90, 180, 90], offsetX = 0, offsetY = 0, width = 2160, height = 1080;
const read = filename => JSON.parse(fs.readFileSync(path.join(cache, filename), 'utf8'));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
function csv(text) {
  const rows = []; let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (c === ',' || c === '\n')) { row.push(value.replace(/\r$/, '')); value = ''; if (c === '\n') { rows.push(row); row = []; } }
    else value += c;
  }
  if (value || row.length) { row.push(value); rows.push(row); }
  const head = rows.shift(); return rows.filter(r => r.length > 1).map(r => Object.fromEntries(head.map((key, i) => [key, r[i] || ''])));
}
function winding(feature) {
  const g = feature.geometry, polygons = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : null;
  if (polygons) for (const polygon of polygons) for (let i = 0; i < polygon.length; i++) {
    const ring = polygon[i]; let sum = 0;
    for (let j = 0; j < ring.length - 1; j++) sum += ring[j][0] * ring[j + 1][1] - ring[j + 1][0] * ring[j][1];
    if ((i === 0 && sum > 0) || (i > 0 && sum < 0)) ring.reverse();
  }
  return feature;
}
function geoBounds(feature) {
  const box = [Infinity, Infinity, -Infinity, -Infinity];
  function walk(value) { if (typeof value[0] === 'number') { box[0] = Math.min(box[0], value[0]); box[1] = Math.min(box[1], value[1]); box[2] = Math.max(box[2], value[0]); box[3] = Math.max(box[3], value[1]); } else value.forEach(walk); }
  if (feature.geometry?.coordinates) walk(feature.geometry.coordinates);
  return box;
}
const intersects = box => box[0] < bounds[2] && box[2] > bounds[0] && box[1] < bounds[3] && box[3] > bounds[1];
function touches(feature) {
  if (!intersects(geoBounds(feature))) return false;
  const g = feature.geometry, polygons = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : [];
  const inside = (x,y) => x >= bounds[0] && x <= bounds[2] && y >= bounds[1] && y <= bounds[3];
  const inRing = (x,y,ring) => { let hit=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit; };
  for (const polygon of polygons) {
    for (const ring of polygon) for (let i=0;i<ring.length;i++) {
      const a=ring[i],b=ring[(i+1)%ring.length];if(inside(a[0],a[1]))return true;
      let low=0,high=1;const dx=b[0]-a[0],dy=b[1]-a[1],p=[-dx,dx,-dy,dy],q=[a[0]-bounds[0],bounds[2]-a[0],a[1]-bounds[1],bounds[3]-a[1]];
      for(let j=0;j<4&&low<=high;j++){if(!p[j]){if(q[j]<0){low=1;high=0;}}else{const t=q[j]/p[j];if(p[j]<0)low=Math.max(low,t);else high=Math.min(high,t);}}
      if(low<=high)return true;
    }
    for(const [x,y] of [[bounds[0],bounds[1]],[bounds[0],bounds[3]],[bounds[2],bounds[1]],[bounds[2],bounds[3]]])if(inRing(x,y,polygon[0])&&!polygon.slice(1).some(r=>inRing(x,y,r)))return true;
  }
  return false;
}
const localBox = (box, digits=1) => box.map((v,i) => +(Math.max(0,Math.min(i%2?height:width,v-(i%2?offsetY:offsetX)))).toFixed(digits));
function run(features, commands) {
  return new Promise((resolve, reject) => mapshaper.applyCommands('-i input.geojson ' + commands + ' -o format=geojson output.geojson', {'input.geojson': JSON.stringify({type:'FeatureCollection', features})}, (error, output) => {
    if (error) reject(error); else resolve(JSON.parse(output['output.geojson']).features);
  }));
}
async function main() {
  const d3 = await import(require('node:url').pathToFileURL(path.join(modules, 'd3-geo/src/index.js')).href);
  const projection = d3.geoEquirectangular().scale(2160 / (2 * Math.PI)).translate([1080, 540]).precision(0.12);
  const draw = d3.geoPath(projection).digits(1);
  // Subpixel microstates must retain real geometry so that deep zoom remains
  // selectable. Do not replace them with circles or inflate their boundaries.
  const fineDraw = d3.geoPath(projection).digits(4);
  const registry = require(path.join(root, 'map-templates.js'));
  const prior = registry.get('world-detailed');
  assert(prior && prior.width === width && prior.height === height, 'Prior global coordinate contract');
  const metadata = csv(fs.readFileSync(path.join(root, 'tools/map-source/licenses/geoBoundariesOpen-meta.csv'), 'utf8'));
  const metaByKey = new Map(metadata.map(m => [m.boundaryISO + ':' + m.boundaryType, m]));
  const allowed = license => /Creative Commons Attribution|Open Data Commons|Public Domain|CC0|Open Government|Etalab|Data license Germany|Singapore Open Data|Federal Office of Topography swisstopo/.test(license || '') || license === 'National Institute of Statistics (INE) Data License';
  const cgaz = read('cgaz-adm2-simplified.geojson');
  const countries = new Map(), used = new Map(), report = [], sourceFiles = new Set(['cgaz-adm2-simplified.geojson','ne-countries.geojson']);
  const provinces = [], ids = new Set();
  for (const feature of cgaz.features) {
    const iso = feature.properties.shapeGroup, type = feature.properties.shapeType, m = metaByKey.get(iso + ':' + type);
    if (iso === 'ATA' || type === 'DISP' || !m || !allowed(m.boundaryLicense) || !touches(feature)) continue;
    if (!countries.has(iso)) countries.set(iso, []);
    countries.get(iso).push(feature);
  }
  const replacements = {DEU:['extra-DEU.geojson','ADM3',null], CHE:['balanced-CHE-ADM1.geojson','ADM1','8%'], ITA:['balanced-ITA-ADM3.geojson','ADM3','6%']};
  const croatia = path.join(cache, 'balanced-HRV-ADM1.geojson');
  if (fs.existsSync(croatia)) replacements.HRV = ['balanced-HRV-ADM1.geojson','ADM1','8%'];
  // Budgets reflect screen readability and country size. Neighbouring source
  // polygons may be dissolved, but no operation crosses a country boundary.
  const targets = {DEU:108,FRA:96,CHE:26,ITA:107,ESP:52,GBR:85,POL:80,RUS:160,TUR:75,SWE:45,FIN:30,NOR:40,IRL:26,PRT:30,AUT:35,HUN:25,CZE:35,SVK:25,UKR:80,HRV:21,BIH:25,SRB:30,NLD:25,BEL:20,DNK:25,ALB:20,MKD:20,SVN:20,ROU:42,BGR:28,BLR:40,EST:15,LVA:20,LTU:20,CYP:8,KWT:6,LUX:12,LIE:1,MLT:3,MCO:1,SMR:1,AND:7,ISL:15,JOR:15,IRQ:40,SAU:40,TUN:24,
    CHN:200,IND:160,USA:180,BRA:140,CAN:100,AUS:60,IDN:100,KOR:60,PRK:35,JPN:80,MEX:80,ARG:80,CHL:40,PER:40,COL:60,VEN:40,ECU:30,BOL:35,PRY:20,URY:15,GRL:6,
    NGA:45,EGY:35,DZA:40,MAR:35,LBY:22,ZAF:52,SDN:40,COD:45,ETH:40,AGO:35,TZA:35,KEN:35,MOZ:30,MDG:30,MLI:25,NER:25,TCD:25,NAM:25,ZMB:25,ZWE:25,BWA:25,
    IRN:65,PAK:60,AFG:45,KAZ:65,UZB:30,TKM:25,KGZ:20,TJK:20,MNG:40,NPL:25,BGD:30,THA:45,VNM:40,MMR:40,LAO:25,KHM:25,MYS:35,PHL:50,PNG:35,NZL:30,
    TWN:20,SGP:1,BRN:4,QAT:5,BHR:4,ARE:7,OMN:20,YEM:30,SYR:25,LBN:10,ISR:10,ARM:15,AZE:25,GEO:20,
    JAM:8,LCA:4,PLW:3,NRU:1,MDV:10,TLS:10,WSM:4,SLB:10,VUT:6,KIR:3,CPV:6,COM:3,SUR:10,GUY:10,GMB:8,LSO:10,SWZ:5,CUB:25,DOM:15,HTI:10,GTM:20,HND:20,SLV:10,NIC:20,PAN:15,CRI:15,BLZ:6,BHS:8,TON:3,ATG:2,GRD:2,BRB:1,KNA:2,DMA:2,VCT:2,MHL:3,FSM:4,TUV:2,STP:2,GNQ:8,BDI:10,RWA:10,MWI:15,BEN:15,TGO:10,LBR:15,SLE:14,GNB:9,DJI:6,ERI:15,GIN:20,GHA:25,UGA:25,SEN:20,SSD:25,CMR:25,CAF:25,BFA:25,GAB:20,COG:20};
  for (const [iso, replacement] of Object.entries(replacements)) {
    const [filename, type, simplify] = replacement; sourceFiles.add(filename);
    let features = read(filename).features.filter(touches);
    if (simplify) features = await run(features, '-simplify weighted ' + simplify + ' keep-shapes');
    for (const f of features) Object.assign(f.properties, {shapeGroup:iso, shapeType:type});
    countries.set(iso, features);
  }
  // Each country is processed separately, so no union can cross a country border.
  // Small adjacent administrative polygons are dissolved into compact game regions.
  for (const [iso, original] of [...countries].sort(([a],[b]) => a.localeCompare(b))) {
    let features = original.map(clone).sort((a,b) => String(a.properties.shapeID).localeCompare(String(b.properties.shapeID)));
    const sourceCount = features.length, sourceType = features[0]?.properties.shapeType;
    const target = Math.min(sourceCount, targets[iso] || 25);
    let groups = new Map();
    if (features.length > target) {
      // In mapshaper 0.7, pct controls the number of merges, despite CLI wording.
      const mergePct = ((features.length - target) / features.length * 100).toFixed(8) + '%';
      features = await run(features, '-cluster pct=' + mergePct);
      for (const f of features) { const key = f.properties.cluster; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(f); }
      for (const members of groups.values()) {
        const sorted = members.slice();
        // geoArea is orientation-sensitive; planar SVG area is a reliable local size.
        sorted.sort((a,b) => draw.area(winding(clone(b))) - draw.area(winding(clone(a))));
        const originalIds = members.map(f => String(f.properties.shapeID)).sort();
        const largestName = sorted[0].properties.shapeName;
        for (const f of members) Object.assign(f.properties, {balancedID:hash(iso + ':' + originalIds.join('|')).slice(0,16), balancedName:members.length > 1 ? largestName + ' 일대' : largestName, memberCount:members.length});
      }
      features = await run(features, '-dissolve cluster copy-fields=shapeGroup,shapeType,balancedID,balancedName,memberCount');
    }
    const merged = sourceCount !== features.length;
    const m = metaByKey.get(iso + ':' + sourceType); if (m) used.set(iso + ':' + sourceType, m);
    let accepted = 0, originalArea = 0, unionArea = 0;
    for (const f of original) originalArea += draw.area(winding(clone(f)));
    for (const feature of features) {
      const p = feature.properties, id = 'worldb_' + iso.toLowerCase() + '_' + (p.balancedID || hash(iso + ':' + p.shapeID).slice(0,16));
      winding(feature); const worldBox = draw.bounds(feature).flat();
      const digits = worldBox[2]-worldBox[0]<0.1 || worldBox[3]-worldBox[1]<0.1 ? 4 : 1;
      const shape = (digits===4 ? fineDraw : draw)(feature);
      if (!shape || !worldBox.every(Number.isFinite) || /NaN|Infinity/.test(shape)) throw Error('Invalid geometry: ' + id);
      const area = draw.area(feature), center = draw.centroid(feature);
      assert(area < 2160 * 1080 * 0.49, 'Spherical winding: ' + id); assert(!ids.has(id), 'Duplicate: ' + id);
      if (!touches(feature)) continue;
      ids.add(id); accepted++; unionArea += area;
      const bbox = localBox(worldBox,digits);
      provinces.push({id, name:p.balancedName || p.shapeName || iso, owner:iso.toLowerCase(), path:shape, cx:+Math.max(bbox[0],Math.min(bbox[2],center[0] - offsetX)).toFixed(digits), cy:+Math.max(bbox[1],Math.min(bbox[3],center[1] - offsetY)).toFixed(digits), area:+area.toFixed(digits), bbox, administrativeLevel:sourceType, ...(p.memberCount > 1 ? {mergedAreas:p.memberCount, grouping:'게임용 인접 행정구역 묶음'} : {})});
    }
    const change = originalArea ? Math.abs(unionArea-originalArea)/originalArea : 0;
    assert(change < 0.003, 'Dissolve changed area: ' + iso + ' ' + change);
    report.push({iso, sourceType, input:sourceCount, regions:accepted, merged, areaChangeRatio:change});
  }
  // Same fallback policy as the detailed world template.
  for (const feature of read('ne-countries.geojson').features) {
    const p = feature.properties, iso = p.ISO_A3_EH === '-99' ? p.ADM0_A3 : p.ISO_A3_EH;
    if (!iso || iso === 'ATA' || countries.has(iso) || !touches(feature)) continue;
    winding(feature); const b = draw.bounds(feature).flat(), c = draw.centroid(feature);
    const digits = b[2]-b[0]<0.1 || b[3]-b[1]<0.1 ? 4 : 1;
    const shape = (digits===4 ? fineDraw : draw)(feature);
    if (!shape || !b.every(Number.isFinite)) continue;
    const bbox=localBox(b,digits);
    provinces.push({id:'worldb_ne_' + iso.toLowerCase(), name:p.NAME_KO || p.NAME || iso, owner:iso.toLowerCase(), path:shape, cx:+Math.max(bbox[0],Math.min(bbox[2],c[0]-offsetX)).toFixed(digits), cy:+Math.max(bbox[1],Math.min(bbox[3],c[1]-offsetY)).toFixed(digits), area:+draw.area(feature).toFixed(digits), bbox});
    report.push({iso, sourceType:'Natural Earth admin-0', input:1, regions:1, merged:false, areaChangeRatio:0});
  }
  provinces.sort((a,b) => a.id.localeCompare(b.id));
  const countryList = [...new Set(provinces.map(p=>p.owner))].sort().map(id => {
    const old = prior.countries.find(c=>c.id===id), own = provinces.filter(p=>p.owner===id);
    const focus = [Math.min(...own.map(p=>p.bbox[0])),Math.min(...own.map(p=>p.bbox[1])),Math.max(...own.map(p=>p.bbox[2])),Math.max(...own.map(p=>p.bbox[3]))];
    const oldFocus = old?.focusBounds;
    const usableOldFocus = oldFocus && oldFocus[2]>oldFocus[0] && oldFocus[3]>oldFocus[1];
    return {...(old || {id,name:id.toUpperCase(),color:'#a0ad96'}), focusBounds:usableOldFocus ? oldFocus : [Math.max(0,focus[0]),Math.max(0,focus[1]),Math.min(width,focus[2]),Math.min(height,focus[3])]};
  });
  const credits = [...used.values()].map(m=>({country:m.boundaryISO,type:m.boundaryType,year:m.boundaryYearRepresented,source:m.boundarySource,license:m.boundaryLicense,licenseUrl:m.licenseSource,sourceUrl:m.boundarySourceURL,original:m.staticDownloadLink}));
  const newSourceFile=path.join(root,'tools/map-source/licenses/europe-balanced-sources.json');
  if(fs.existsSync(newSourceFile))for(const source of JSON.parse(fs.readFileSync(newSourceFile,'utf8')).newSources||[]){
    const credit=credits.find(item=>item.country===source.country&&item.type===source.type);
    if(credit)Object.assign(credit,{year:source.year,source:source.source,license:source.license,licenseUrl:source.licenseUrl,sourceUrl:source.sourceUrl,original:source.fixedDownloadUrl,attribution:source.attribution});
  }
  const spanishCredit=credits.find(item=>item.country==='ESP');
  if(spanishCredit)Object.assign(spanishCredit,{licenseUrl:'https://www.ine.es/ss/Satellite?L=0&c=Page&cid=1254735849170&p=1254735849170&pagename=Ayuda/INELayout',attribution:'Elaboración propia con datos extraídos del sitio web del INE: www.ine.es. Datos de límites administrativos: 2018. Modificados para este juego; sin patrocinio ni aprobación del INE.'});
  const {landPath,waterPath,riversPath}=prior;
  for (const filename of ['ne-land.geojson','ne-lakes.geojson','ne-rivers.geojson']) sourceFiles.add(filename);
  const template = {id:'world-balanced', name:'세계 · 균형 지도', recommended:true, width,height,offsetX,offsetY,geographicBounds:bounds, provinces,countries:countryList,landPath,waterPath,riversPath,
    notice:'현대 행정 경계를 바탕으로 구역 수와 밀도를 조정한 세계 지도입니다. 국가 안에서 인접 행정구역을 합친 게임용 구역이며 실제 역사적 국경이 아닙니다. 국토 크기와 화면 가독성을 고려해 국가별 구역 수를 다르게 정했습니다. 자료가 부족한 국가는 국가 단위로 표시하며 자료 시점과 해안선은 다를 수 있습니다. 시대에 맞는 소유국은 편집기에서 조정하세요.',
    source:'Natural Earth · geoBoundaries gbOpen · ISTAT · ©swisstopo · IGN · BKG · INE(Spain 2018, INE Data License)',sourceDocumentation:'WORLD-MAP-SOURCES.md',provenance:'tools/map-source/licenses/world-balanced-sources.json', sources:prior.sources,credits,
    licenseNotice:prior.licenseNotice + ' 이 세계 균형 지도는 경계 단순화와 인접 구역 병합을 추가했습니다. 국가별 원자료 조건과 변경 사실은 WORLD-MAP-SOURCES.md, BALANCED-MAP-SOURCES.md, MAP-SOURCES.md 및 함께 제공되는 출처 자료를 확인하세요.',
    balancing:{method:'국가별 행정단계 선택 + 국토 규모에 따른 국가 안의 인접 구역 병합', referenceTemplate:'world-detailed', countries:report}};
  assert(provinces.length < 7000, 'Balanced world map must stay manageable');
  for(const [iso,count] of Object.entries({FRA:96,DEU:108,CHE:26,ITA:107,ESP:52}))assert.equal(provinces.filter(p=>p.owner===iso.toLowerCase()).length,count,'Country balance: '+iso);
  assert(provinces.every(p=>p.cx>=0&&p.cy>=0&&p.cx<=width&&p.cy<=height&&p.bbox[0]>=0&&p.bbox[1]>=0&&p.bbox[2]<=width&&p.bbox[3]<=height),'Global coordinate bounds');
  const out = path.join(root,'tools/map-source/world-balanced.json');
  fs.writeFileSync(out, JSON.stringify(template));
  const summary = {templateId:template.id,regions:provinces.length,countryCount:countryList.length,referenceRegions:prior.provinces.length,referenceCountryCount:prior.countries.length,maximumAreaChangeRatio:Math.max(...report.map(item=>item.areaChangeRatio)),bytes:fs.statSync(out).size,sha256:hash(fs.readFileSync(out)),bounds,projection:'Equirectangular 2160x1080, 0.1 px SVG paths; global paths, bounds and centroids; d3 antimeridian clipping',inheritedPhysicalPaths:{templateId:prior.id,sha256:hash([landPath,waterPath,riversPath].join('\n'))},countries:report,sources:[...sourceFiles].sort().map(filename=>({filename,sha256:hash(fs.readFileSync(path.join(cache,filename)))}))};
  fs.writeFileSync(path.join(root,'tools/map-source/licenses/world-balanced-build.json'),JSON.stringify(summary,null,2)+'\n');
  const inherited = JSON.parse(fs.readFileSync(newSourceFile,'utf8'));
  const provenance = {...inherited, templateFamily:template.id, documentation:'WORLD-MAP-SOURCES.md', balancingBuild:'tools/map-source/licenses/world-balanced-build.json', inheritedEuropeanDocumentation:'BALANCED-MAP-SOURCES.md', transformations:['select modern source layers','merge neighbouring source areas into game regions within each country','retain source island geometries and inherited physical layers','convert map coordinates with antimeridian clipping','assign display names and new fixed worldb_ game IDs'], distributionNote:'Preserve WORLD-MAP-SOURCES.md, BALANCED-MAP-SOURCES.md, MAP-SOURCES.md, this provenance file and the inherited country-source metadata when redistributing the map data. Source requirements do not change the licence of unrelated engine or scenario content.'};
  fs.writeFileSync(path.join(root,'tools/map-source/licenses/world-balanced-sources.json'),JSON.stringify(provenance,null,2)+'\n');
  console.log(JSON.stringify({...summary,countries:report.filter(item=>['FRA','DEU','CHE','ITA','ESP','CHN','IND','USA','RUS','BRA','CAN','AUS','JPN','KOR','PRK','IDN'].includes(item.iso)),sources:summary.sources.map(item=>item.filename)},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
