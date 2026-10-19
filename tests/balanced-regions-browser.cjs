'use strict';
// These tests use a local release route only. No production gallery or database
// is contacted. Download JSON is inspected as a Blob rather than written by Chrome.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));
const root=path.resolve(__dirname,'..'),output=path.resolve(__dirname,'../../../outputs');
const base='https://balanced-regions.test',report={checks:[],maps:{},browserErrors:[],notes:['Generated download contents are checked as a Blob; Chrome filesystem saving is not exercised.']};
const specs=[
 {region:'eastasia',id:'balanced_eastasia_modern',oldDefault:'1592',owner:'chn',alternate:'jpn'},
 {region:'asia',id:'balanced_asia_modern',oldDefault:'modern',owner:'ind',alternate:'jpn'},
 {region:'north_america',id:'balanced_north_america_modern',oldDefault:'1754',owner:'usa',alternate:'can'},
 {region:'south_america',id:'balanced_south_america_modern',oldDefault:'1754',owner:'bra',alternate:'arg'}
];
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function passed(name){report.checks.push({name,passed:true});console.log('PASS '+name);}
async function serve(page,requests,fail={}){
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(url.origin!==base)return route.abort();
  if(url.pathname.startsWith('/assets/maps/')){
   requests.push(url.pathname.slice(1));
   if(fail.id&&url.pathname.includes('/'+fail.id+'.'))return route.fulfill({status:503,body:'Temporary local test failure'});
  }
  const file=path.resolve(root,'.'+url.pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'};
  return route.fulfill({contentType:mime[path.extname(file)]||'text/plain',body:fs.readFileSync(file)});
 });
}
async function gameSnapshot(page){return page.evaluate(()=>({scenario:HistoryCrossroads.getScenario(),state:HistoryCrossroads.getState(),scenarioRaw:localStorage.getItem('history-crossroads:web:v1:scenario'),saveRaw:localStorage.getItem('history-crossroads:web:v1:autosave')}));}
async function visibleInterior(page,owner){
 const svg=page.locator('#editor-root .v2-editor-map svg');await svg.scrollIntoViewIfNeeded();
 return page.evaluate(owner=>{
  const svg=document.querySelector('#editor-root .v2-editor-map svg');
  const name=document.querySelector('#editor-root .map-heading h2').childNodes[0].textContent.trim();
  const template=MapTemplates.list().map(row=>MapTemplates.get(row.id)).find(t=>t&&t.name===name);
  if(!template)throw Error('Cannot resolve displayed map '+name);
  const ids=new Set(template.provinces.filter(p=>p.owner===owner).map(p=>p.id));
  const candidates=[...svg.querySelectorAll('[data-province]')].filter(node=>ids.has(node.dataset.province)).map(node=>({node,box:node.getBBox()})).sort((a,b)=>b.box.width*b.box.height-a.box.width*a.box.height);
  for(const {node,box}of candidates)for(const fx of [.5,.3,.7,.2,.8])for(const fy of [.5,.3,.7,.2,.8]){
   const point=svg.createSVGPoint();point.x=box.x+box.width*fx;point.y=box.y+box.height*fy;if(!node.isPointInFill(point))continue;
   const screen=point.matrixTransform(node.getScreenCTM());if(screen.x<0||screen.y<0||screen.x>=innerWidth||screen.y>=innerHeight)continue;
   if(document.elementFromPoint(screen.x,screen.y)?.closest('[data-province]')===node)return {id:node.dataset.province,x:screen.x,y:screen.y};
  }
  throw Error('No visible province interior for '+owner);
 },owner);
}
async function close(page){await page.getByRole('button',{name:'닫기',exact:true}).last().click();}
async function waitMap(page,id){await page.waitForFunction(id=>{const t=MapTemplates.get(id);return t&&document.querySelector('#editor-root .map-heading h2')?.textContent.includes(t.name);},id);}
async function prepare(page,region,era){await page.getByLabel('① 사용할 지역 지도',{exact:true}).selectOption(region);await page.getByLabel('② 시대 기본안',{exact:true}).selectOption(era);await page.getByRole('button',{name:'③ 이 설정으로 지도 준비',exact:true}).click();}
async function runCrop(browser,spec){
 const context=await browser.newContext({viewport:{width:1500,height:1100}}),page=await context.newPage(),requests=[];
 page.setDefaultTimeout(60000);page.on('pageerror',error=>report.browserErrors.push(error.message));page.on('dialog',dialog=>dialog.accept());
 await serve(page,requests);await page.goto(base+'/index.html');await page.waitForFunction(()=>window.HistoryCrossroads?.getScenario());
 assert.deepEqual(requests,[],'No home geometry');
 const before=await gameSnapshot(page);
 const data=await page.evaluate(async id=>{
  const t=await MapTemplates.ensure(id);return {id:t.id,count:t.provinces.length,name:t.name,files:MapTemplates.assetInfo(id).files,template:t};
 },spec.id);
 assert.equal(data.files.length,1);assert.deepEqual(requests,data.files);assert.equal(await page.evaluate(()=>MapTemplates.isLoaded('world-balanced')),false);assert.equal(await page.evaluate(()=>MapTemplates.isLoaded('world-detailed')),false);
 report.maps[spec.region]={id:spec.id,count:data.count,bytes:Buffer.byteLength(JSON.stringify(data.template)),files:data.files};
 passed(spec.region+': selected crop fetches one standalone JSON without the world maps');
 await page.evaluate(async({id,owner})=>{await MapMaker.importDocument(MapDocument.create({id:'balanced_region_browser',templateId:id,title:'균형 지역 지도 검사',playerCountry:owner}));},spec);
 await waitMap(page,spec.id);
 assert.equal(await page.getByLabel('① 사용할 지역 지도',{exact:true}).inputValue(),spec.region);
 assert.equal(await page.getByLabel('② 시대 기본안',{exact:true}).inputValue(),'balanced_modern');
 assert.equal(await page.locator('#editor-root [data-recommended-template]').count(),0);
 assert.equal(await page.locator('#editor-root [data-province]').count(),data.count);
 const oldEras=await page.evaluate(region=>MapTemplates.eras(region).map(e=>e.id),spec.region);
 const eras=await page.getByLabel('② 시대 기본안',{exact:true}).locator('option').evaluateAll(nodes=>nodes.map(node=>node.value));
 assert.deepEqual(eras,['balanced_modern',...oldEras]);
 // Leaving then returning to a region must retain its prior historical default.
 await page.getByLabel('① 사용할 지역 지도',{exact:true}).selectOption('world');
 assert.equal(await page.getByLabel('② 시대 기본안',{exact:true}).inputValue(),'balanced_modern');
 await page.getByLabel('① 사용할 지역 지도',{exact:true}).selectOption(spec.region);
 assert.equal(await page.getByLabel('② 시대 기본안',{exact:true}).inputValue(),spec.oldDefault);
 await page.getByLabel('② 시대 기본안',{exact:true}).selectOption('balanced_modern');
 assert.equal(await page.getByRole('button',{name:'③ 이 설정으로 지도 준비',exact:true}).isDisabled(),true);
 passed(spec.region+': integrated region/era controls retain every previous era and default');
 await page.getByLabel('중심 국가',{exact:true}).selectOption(spec.owner);
 await page.locator('#editor-root [data-map-tool="country"]').click();
 const selected=await visibleInterior(page,spec.owner);await page.mouse.click(selected.x,selected.y);
 const ownerSelect=page.locator('#editor-root .v2-province-panel').getByLabel('시작 소유국',{exact:true});
 await ownerSelect.selectOption(spec.alternate);await page.getByRole('button',{name:'지도 저장',exact:true}).click();
 const saved=await page.evaluate(()=>MapMaker.getStored());assert.equal(saved.map.templateId,spec.id);assert.equal(saved.map.initial.owners[selected.id],spec.alternate);
 assert.deepEqual(await gameSnapshot(page),before);
 const svg=page.locator('#editor-root .v2-editor-map svg');await svg.scrollIntoViewIfNeeded();const box=await svg.boundingBox();
 const scale=await page.locator('#editor-root [data-map-world]').evaluate(node=>node.transform.baseVal.consolidate().matrix.a);
 await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.wheel(0,-180);
 await page.waitForFunction(scale=>document.querySelector('#editor-root [data-map-world]').transform.baseVal.consolidate().matrix.a>scale,scale);
 passed(spec.region+': real province click edits ownership, wheel zoom works and the game is preserved');
 await page.evaluate(()=>{const blobs=new Map(),create=URL.createObjectURL.bind(URL),click=HTMLAnchorElement.prototype.click;window.__cropDownloads=[];URL.createObjectURL=blob=>{const url=create(blob);blobs.set(url,blob);return url;};HTMLAnchorElement.prototype.click=function(){if(!this.hasAttribute('download'))return click.call(this);__cropDownloads.push({name:this.download,blob:blobs.get(this.href)});};});
 await page.getByRole('button',{name:'지도 JSON 내보내기',exact:true}).click();
 const exported=await page.evaluate(async()=>({name:__cropDownloads[0].name,text:await __cropDownloads[0].blob.text()}));
 assert.match(exported.name,/\.map\.json$/);assert.deepEqual(JSON.parse(exported.text),saved);
 await close(page);await page.reload();await page.waitForFunction(()=>window.HistoryCrossroads?.getScenario());
 await page.locator('#map-maker-button').click();await waitMap(page,spec.id);
 assert.deepEqual(await page.evaluate(()=>MapMaker.getStored()),saved);
 assert.equal(await page.getByLabel('② 시대 기본안',{exact:true}).inputValue(),'balanced_modern');
 await close(page);await page.locator('#scenario-import').setInputFiles({name:spec.id+'.map.json',mimeType:'application/json',buffer:Buffer.from(exported.text)});await waitMap(page,spec.id);
 assert.deepEqual(await page.evaluate(()=>MapMaker.getStored()),saved);
 if(spec.region==='eastasia'){const screenshot=path.join(output,'balanced-regions-selector.png');await page.screenshot({path:screenshot,fullPage:true});report.screenshot=screenshot;}
 await close(page);assert.deepEqual(await gameSnapshot(page),before);
 passed(spec.region+': map saving, reopening, JSON export/import and selector recovery preserve the edits');
 await context.close();
}
async function safety(browser){
 const context=await browser.newContext({viewport:{width:1500,height:1100}}),page=await context.newPage(),requests=[],fail={};
 page.setDefaultTimeout(60000);page.on('pageerror',error=>report.browserErrors.push(error.message));
 let reject=false,dialogs=[];page.on('dialog',async d=>{dialogs.push(d.message());if(reject){reject=false;await d.dismiss();}else await d.accept();});
 await serve(page,requests,fail);await page.goto(base+'/index.html');await page.waitForFunction(()=>window.HistoryCrossroads?.getScenario());
 const initial=await page.evaluate(async()=>{
  const world=await MapTemplates.ensure('world-balanced'),east=await MapTemplates.ensure('balanced_eastasia_modern');
  const inside=east.provinces.find(p=>p.owner==='kor').id,outside=world.provinces.find(p=>p.owner==='bra').id;
  const doc=MapDocument.create({id:'crop_switch_safety',templateId:world.id,title:'편집 보존 검사'});
  doc.map.initial={owners:{[inside]:'jpn',[outside]:'jpn'},occupation:{},influence:{},markers:{[inside]:'보존',[outside]:'범위 밖'}};
  await MapMaker.importDocument(doc);return {doc,inside,outside};
 });
 await waitMap(page,'world-balanced');await page.getByRole('button',{name:'지도 저장',exact:true}).click();
 reject=true;await prepare(page,'eastasia','balanced_modern');await page.waitForFunction(()=>!document.querySelector('#editor-root')?.textContent.includes('불러오는 중'));
 await waitMap(page,'world-balanced');await page.getByRole('button',{name:'지도 저장',exact:true}).click();
 assert.equal(dialogs.length,1);assert.deepEqual(await page.evaluate(()=>MapMaker.getStored()),initial.doc);
 passed('Rejecting crop loss keeps the world map and all inside/outside initial edits');
 await prepare(page,'eastasia','balanced_modern');await waitMap(page,'balanced_eastasia_modern');await page.getByRole('button',{name:'지도 저장',exact:true}).click();
 const cropped=await page.evaluate(()=>MapMaker.getStored());assert.equal(cropped.map.initial.owners[initial.inside],'jpn');assert.equal(cropped.map.initial.markers[initial.inside],'보존');assert.equal(cropped.map.initial.owners[initial.outside],undefined);
 passed('Accepting a narrower crop preserves in-range province edits under the same world IDs');
 fail.id='balanced_south_america_modern';await prepare(page,'south_america','balanced_modern');await page.getByText(/지도를 불러오지 못했습니다. 기존 지도와 편집 내용은 유지했습니다/).waitFor();
 await waitMap(page,'balanced_eastasia_modern');await page.getByRole('button',{name:'지도 저장',exact:true}).click();assert.deepEqual(await page.evaluate(()=>MapMaker.getStored()),cropped);
 fail.id='';await page.getByRole('button',{name:'③ 이 설정으로 지도 준비',exact:true}).click();await waitMap(page,'balanced_south_america_modern');
 passed('A failed selected-map request preserves edited data and the same selection can be retried');
 await close(page);
 // Apply one old historical layout in the actual scenario editor as well.
 await page.locator('#story-panel [data-launch-action="setup-map"]').click();await prepare(page,'north_america','1754');await waitMap(page,'regional_north_america_1754');
 assert.ok(await page.evaluate(()=>MapTemplates.get('regional_north_america_1754').provinces.some(p=>p.owner==='france')));
 await close(page);assert.deepEqual(await page.evaluate(()=>MapMaker.getStored()),cropped);
 passed('The existing North America 1754 historical layout still applies independently of saved map work');
 await context.close();
}
async function offline(browser){
 if(process.argv.includes('--web-only')){report.offlineSkipped=true;return;}
 const context=await browser.newContext({viewport:{width:1500,height:1100}}),page=await context.newPage(),requests=[];
 page.setDefaultTimeout(60000);page.on('pageerror',error=>report.browserErrors.push(error.message));page.on('dialog',d=>d.accept());
 await page.route('**/*',route=>{const url=route.request().url();if(url==='https://balanced-regions-offline.test/index.html')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'standalone.html'))});requests.push(url);return route.abort();});
 await page.goto('https://balanced-regions-offline.test/index.html');await page.waitForFunction(()=>window.HistoryCrossroads?.getScenario());
 const maps=await page.evaluate(async specs=>{
  const result={};for(const spec of specs){const t=await MapTemplates.ensure(spec.id);await MapMaker.importDocument(MapDocument.create({id:'offline_crop',templateId:spec.id,title:'오프라인 지역 지도'}));result[spec.id]={t,count:document.querySelectorAll('#editor-root [data-province]').length,region:document.querySelector('select')?.value};document.querySelectorAll('#editor-root button').forEach(button=>{if(button.textContent==='닫기')button.click();});}return result;
 },specs);
 const source=require('../map-templates.js');for(const spec of specs){assert.equal(maps[spec.id].count,source.get(spec.id).provinces.length);assert.equal(hash(maps[spec.id].t),hash(source.get(spec.id)));}
 assert.deepEqual(requests,[]);passed('The offline HTML derives all four matching cropped maps without any network request');await context.close();
}
async function main(){fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});try{for(const spec of specs)await runCrop(browser,spec);await safety(browser);await offline(browser);assert.deepEqual(report.browserErrors,[]);report.passed=true;}finally{fs.writeFileSync(path.join(output,'balanced-regions-browser-report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}}
main().catch(error=>{report.passed=false;report.failure=error.stack||String(error);fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'balanced-regions-browser-report.json'),JSON.stringify(report,null,2)+'\n');console.error(error);process.exitCode=1;});
