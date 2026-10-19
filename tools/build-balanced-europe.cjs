'use strict';
// Build-time GIS processing only. The published template is static JSON/SVG.
// Existing template IDs and province IDs are deliberately untouched.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const cache = path.resolve(process.argv[2] || path.join(root, '../map-data-cache'));
const modules = process.env.MAP_BUILD_MODULES || path.resolve(root, '../map-build-deps/node_modules');
const mapshaper = require(path.join(modules, 'mapshaper'));
const bounds = [-25, 20, 50, 72], offsetX = 930, offsetY = 108, width = 450, height = 312;
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
const localBox = box => box.map((v,i) => +(Math.max(0,Math.min(i%2?height:width,v-(i%2?offsetY:offsetX)))).toFixed(1));
function run(features, commands) {
  return new Promise((resolve, reject) => mapshaper.applyCommands('-i input.geojson ' + commands + ' -o format=geojson output.geojson', {'input.geojson': JSON.stringify({type:'FeatureCollection', features})}, (error, output) => {
    if (error) reject(error); else resolve(JSON.parse(output['output.geojson']).features);
  }));
}
async function main() {
  const d3 = await import(require('node:url').pathToFileURL(path.join(modules, 'd3-geo/src/index.js')).href);
  const projection = d3.geoEquirectangular().scale(2160 / (2 * Math.PI)).translate([1080, 540]).precision(0.12);
  const draw = d3.geoPath(projection).digits(1);
  const registry = require(path.join(root, 'map-templates.js'));
  const prior = registry.get('regional_europe_med_modern');
  assert(prior && prior.offsetX === offsetX && prior.offsetY === offsetY, 'Prior regional coordinate contract');
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
  const targets = {DEU:108, GBR:85, POL:80, RUS:150, TUR:75, SWE:45, FIN:30, NOR:40, IRL:26, PRT:30, AUT:35, HUN:25, CZE:35, SVK:25, UKR:80, HRV:21, BIH:25, SRB:30, NLD:25, BEL:20, DNK:25, ALB:20, MKD:20, SVN:20, ROU:42, BGR:28, BLR:40, EST:15, LVA:20, LTU:20, CYP:8, KWT:6, LUX:12, LIE:1, MLT:3, MCO:1, SMR:1, AND:7, ISL:15, JOR:15, IRQ:40, SAU:40, TUN:24};
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
    const target = targets[iso] || (sourceCount > 120 ? 80 : sourceCount);
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
      const p = feature.properties, id = 'balanced_' + iso.toLowerCase() + '_' + (p.balancedID || hash(iso + ':' + p.shapeID).slice(0,16));
      winding(feature); const shape = draw(feature), worldBox = draw.bounds(feature).flat();
      if (!shape || !worldBox.every(Number.isFinite) || /NaN|Infinity/.test(shape)) throw Error('Invalid geometry: ' + id);
      const area = draw.area(feature), center = draw.centroid(feature);
      assert(area < 2160 * 1080 * 0.49, 'Spherical winding: ' + id); assert(!ids.has(id), 'Duplicate: ' + id);
      if (!touches(feature)) continue;
      ids.add(id); accepted++; unionArea += area;
      const bbox = localBox(worldBox);
      provinces.push({id, name:p.balancedName || p.shapeName || iso, owner:iso.toLowerCase(), path:shape, cx:+Math.max(bbox[0],Math.min(bbox[2],center[0] - offsetX)).toFixed(1), cy:+Math.max(bbox[1],Math.min(bbox[3],center[1] - offsetY)).toFixed(1), area:+area.toFixed(1), bbox, administrativeLevel:sourceType, ...(p.memberCount > 1 ? {mergedAreas:p.memberCount, grouping:'게임용 인접 행정구역 묶음'} : {})});
    }
    const change = originalArea ? Math.abs(unionArea-originalArea)/originalArea : 0;
    assert(change < 0.003, 'Dissolve changed area: ' + iso + ' ' + change);
    report.push({iso, sourceType, input:sourceCount, regions:accepted, merged, areaChangeRatio:change});
  }
  // Same fallback policy as the detailed world template.
  for (const feature of read('ne-countries.geojson').features) {
    const p = feature.properties, iso = p.ISO_A3_EH === '-99' ? p.ADM0_A3 : p.ISO_A3_EH;
    if (!iso || iso === 'ATA' || countries.has(iso) || !touches(feature)) continue;
    winding(feature); const shape = draw(feature), b = draw.bounds(feature).flat(), c = draw.centroid(feature);
    if (!shape || !b.every(Number.isFinite)) continue;
    const bbox=localBox(b);
    provinces.push({id:'balanced_ne_' + iso.toLowerCase(), name:p.NAME_KO || p.NAME || iso, owner:iso.toLowerCase(), path:shape, cx:+Math.max(bbox[0],Math.min(bbox[2],c[0]-offsetX)).toFixed(1), cy:+Math.max(bbox[1],Math.min(bbox[3],c[1]-offsetY)).toFixed(1), area:+draw.area(feature).toFixed(1), bbox});
    report.push({iso, sourceType:'Natural Earth admin-0', input:1, regions:1, merged:false, areaChangeRatio:0});
  }
  provinces.sort((a,b) => a.id.localeCompare(b.id));
  const countryList = [...new Set(provinces.map(p=>p.owner))].sort().map(id => {
    const old = prior.countries.find(c=>c.id===id), own = provinces.filter(p=>p.owner===id);
    const focus = [Math.min(...own.map(p=>p.bbox[0])),Math.min(...own.map(p=>p.bbox[1])),Math.max(...own.map(p=>p.bbox[2])),Math.max(...own.map(p=>p.bbox[3]))];
    return {...(old || {id,name:id.toUpperCase(),color:'#a0ad96'}), focusBounds:[Math.max(0,focus[0]),Math.max(0,focus[1]),Math.min(width,focus[2]),Math.min(height,focus[3])]};
  });
  const credits = [...used.values()].map(m=>({country:m.boundaryISO,type:m.boundaryType,year:m.boundaryYearRepresented,source:m.boundarySource,license:m.boundaryLicense,licenseUrl:m.licenseSource,sourceUrl:m.boundarySourceURL,original:m.staticDownloadLink}));
  const newSourceFile=path.join(root,'tools/map-source/licenses/europe-balanced-sources.json');
  if(fs.existsSync(newSourceFile))for(const source of JSON.parse(fs.readFileSync(newSourceFile,'utf8')).newSources||[]){
    const credit=credits.find(item=>item.country===source.country&&item.type===source.type);
    if(credit)Object.assign(credit,{year:source.year,source:source.source,license:source.license,licenseUrl:source.licenseUrl,sourceUrl:source.sourceUrl,original:source.fixedDownloadUrl,attribution:source.attribution});
  }
  const spanishCredit=credits.find(item=>item.country==='ESP');
  if(spanishCredit)Object.assign(spanishCredit,{licenseUrl:'https://www.ine.es/ss/Satellite?L=0&c=Page&cid=1254735849170&p=1254735849170&pagename=Ayuda/INELayout',attribution:'Elaboración propia con datos extraídos del sitio web del INE: www.ine.es. Datos de límites administrativos: 2018. Modificados para este juego; sin patrocinio ni aprobación del INE.'});
  async function physical(filename, filter) {
    sourceFiles.add(filename);
    const features = await run(read(filename).features.filter(f=>!filter||filter(f)), '-clip bbox=' + bounds.join(','));
    return draw({type:'FeatureCollection',features:features.map(winding)}) || '';
  }
  const landPath=await physical('ne-land.geojson');
  const waterPath=await physical('ne-lakes.geojson',f=>Number(f.properties.scalerank??f.properties.SCALERANK??0)<=5);
  const riversPath=await physical('ne-rivers.geojson',f=>Number(f.properties.scalerank??f.properties.SCALERANK??0)<=5);
  const template = {id:'europe-balanced', name:'유럽과 지중해 · 균형 지도', recommended:true, width,height,offsetX,offsetY,geographicBounds:bounds, provinces,countries:countryList,landPath,waterPath,riversPath,
    notice:'현대 행정 경계를 바탕으로 구역 수를 조정한 게임용 지도입니다. 프랑스·스페인은 도 단위, 스위스는 주 단위, 이탈리아는 도 단위를 사용합니다. 독일 등 일부 국가는 인접 행정구역을 합친 게임용 구역이며 실제 역사적 국경이 아닙니다. 국가별 자료 시점과 해안선은 다를 수 있습니다. 시대에 맞는 소유국은 편집기에서 조정하세요.',
    source:'Natural Earth · geoBoundaries gbOpen · ISTAT · ©swisstopo · IGN · BKG · INE(Spain 2018, INE Data License)',sourceDocumentation:'BALANCED-MAP-SOURCES.md',provenance:'tools/map-source/licenses/europe-balanced-sources.json', sources:prior.sources,credits,
    licenseNotice:prior.licenseNotice + ' 이 균형 지도는 경계 단순화와 인접 구역 병합을 추가했습니다. 세부 출처와 적용 라이선스는 BALANCED-MAP-SOURCES.md를 함께 보관하세요.',
    balancing:{method:'국가별 행정단계 선택 + 국가 안에서 인접 구역 병합', referenceTemplate:'regional_europe_med_modern', countries:report}};
  if(provinces.length >= 3000) console.error(JSON.stringify({regions:provinces.length,countries:report}));
  assert(provinces.length < 3000, 'Balanced map must stay manageable');
  for(const [iso,count] of Object.entries({FRA:96,DEU:108,CHE:26,ITA:107,ESP:52}))assert.equal(provinces.filter(p=>p.owner===iso.toLowerCase()).length,count,'Country balance: '+iso);
  assert(provinces.every(p=>p.cx>=0&&p.cy>=0&&p.cx<=width&&p.cy<=height&&p.bbox[0]>=0&&p.bbox[1]>=0&&p.bbox[2]<=width&&p.bbox[3]<=height),'Crop-local bounds');
  const out = path.join(root,'tools/map-source/europe-balanced.json');
  fs.writeFileSync(out, JSON.stringify(template));
  const summary = {templateId:template.id,regions:provinces.length,countryCount:countryList.length,bytes:fs.statSync(out).size,sha256:hash(fs.readFileSync(out)),bounds,projection:'Equirectangular 2160x1080, 0.1 px SVG paths; world paths with local crop bounds/centroids',countries:report,sources:[...sourceFiles].sort().map(filename=>({filename,sha256:hash(fs.readFileSync(path.join(cache,filename)))}))};
  fs.writeFileSync(path.join(root,'tools/map-source/licenses/europe-balanced-build.json'),JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify({...summary,countries:report.filter(item=>['FRA','DEU','CHE','ITA','ESP','HRV'].includes(item.iso)),sources:summary.sources.map(item=>item.filename)},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
