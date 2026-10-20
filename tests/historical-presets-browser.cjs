'use strict';
// Real Chrome UI checks served only from this release. Nothing is uploaded to
// a live gallery. Exported Blob bytes are inspected; disk saving is not tested.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {chromium}=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));
const root=path.resolve(__dirname,'..'),output=path.resolve(__dirname,'../../../outputs');
const base='https://historical-presets.test';
const report={checks:[],maps:[],screenshots:[],browserErrors:[],network:{},notes:['All pages and geometry are fulfilled from local release files. No production database or gallery is contacted. Export Blob contents and import round trips are checked; Chrome filesystem saving is outside this test.']};
const regionLabel='① 사용할 지역 지도',eraLabel='② 시대 기본안',prepareLabel='③ 이 설정으로 지도 준비';
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
function passed(name,details){report.checks.push({name,passed:true,...(details?{details}:{})});console.log('PASS '+name);}
async function serve(page,requests,{offline=false}={}){
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(offline){
   if(url.origin===base&&url.pathname==='/index.html')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'standalone.html'))});
   requests.push(url.href);return route.abort();
  }
  if(url.origin!==base)return route.abort();
  if(url.pathname.startsWith('/assets/maps/'))requests.push(url.pathname.slice(1));
  const file=path.resolve(root,'.'+url.pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'};
  return route.fulfill({contentType:mime[path.extname(file)]||'text/plain',body:fs.readFileSync(file)});
 });
}
async function ready(page){await page.goto(base+'/index.html');await page.waitForFunction(()=>window.HistoryCrossroads?.getScenario());}
async function waitMap(page,id){await page.waitForFunction(id=>{const t=MapTemplates.get(id);return document.querySelector('#editor-dialog[open]')&&t&&document.querySelector('#editor-root .map-heading h2')?.textContent.includes(t.name);},id);}
async function close(page){await page.getByRole('button',{name:'닫기',exact:true}).last().click();}
async function chooseMap(page,definition){
 await page.getByLabel(regionLabel,{exact:true}).selectOption(definition.regionId);
 await page.getByLabel(eraLabel,{exact:true}).selectOption(definition.eraId);
 await page.getByRole('button',{name:prepareLabel,exact:true}).click();await waitMap(page,definition.id);
}
async function snapshot(page){return page.evaluate(()=>({scenario:HistoryCrossroads.getScenario(),state:HistoryCrossroads.getState(),rawScenario:localStorage.getItem('history-crossroads:web:v1:scenario'),rawSave:localStorage.getItem('history-crossroads:web:v1:autosave')}));}
async function captureDownload(page){
 await page.evaluate(()=>{
  const blobs=new Map(),create=URL.createObjectURL.bind(URL),click=HTMLAnchorElement.prototype.click;window.__historicalDownloads=[];
  URL.createObjectURL=blob=>{const url=create(blob);blobs.set(url,blob);return url;};
  HTMLAnchorElement.prototype.click=function(){if(!this.hasAttribute('download'))return click.call(this);__historicalDownloads.push({name:this.download,blob:blobs.get(this.href)});};
 });
}
async function digestInPage(page,id){return page.evaluate(async id=>{
 const template=MapTemplates.get(id),body=new TextEncoder().encode(JSON.stringify(template));
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',body)),value=>value.toString(16).padStart(2,'0')).join('');
},id);}
async function web(browser,definitions,T){
 const context=await browser.newContext({viewport:{width:1500,height:1100}}),page=await context.newPage(),requests=[];
 page.setDefaultTimeout(60000);page.on('pageerror',error=>report.browserErrors.push(error.message));page.on('dialog',dialog=>dialog.accept());
 await serve(page,requests);await ready(page);assert.deepEqual(requests,[]);const initial=await snapshot(page);
 await page.locator('#story-panel [data-launch-action="new-map"]').click();await waitMap(page,'regional_eastasia_1592');
 const cached=new Set(requests);
 for(const definition of definitions){
  const before=requests.length,expected=T.assetInfo(definition.id).files.filter(file=>!cached.has(file));
  await chooseMap(page,definition);
  const newRequests=requests.slice(before);assert.deepEqual([...newRequests].sort(),[...expected].sort(),'Only selected base and patch: '+definition.id);
  newRequests.forEach(file=>cached.add(file));
  const metadata=await page.evaluate(id=>{const t=MapTemplates.get(id);return{id:t.id,count:t.provinces.length,countries:t.countries.length,initial:t.historicalInitial};},definition.id);
  assert.equal(metadata.count,T.get(definition.id).provinces.length);assert.equal(await page.locator('#editor-root [data-province]').count(),metadata.count);
  assert.equal(await page.getByLabel(regionLabel,{exact:true}).inputValue(),definition.regionId);assert.equal(await page.getByLabel(eraLabel,{exact:true}).inputValue(),definition.eraId);
  const options=await page.getByLabel(eraLabel,{exact:true}).locator('option').evaluateAll(nodes=>nodes.map(node=>node.value));
  for(const sibling of definitions.filter(row=>row.regionId===definition.regionId))assert.ok(options.includes(sibling.eraId));
  for(const era of T.eras(definition.regionId))assert.ok(options.includes(era.id));assert.ok(options.includes('balanced_modern'));
  await page.getByLabel('중심 국가',{exact:true}).selectOption(definition.playerCountry);
  const countryName=definition.countries.find(country=>country.id===definition.playerCountry).name;
  assert.equal(await page.getByLabel('중심 국가',{exact:true}).locator('option:checked').textContent(),countryName);
  assert.equal(await digestInPage(page,definition.id),hash(T.get(definition.id)));
  report.maps.push({...metadata,eraId:definition.eraId,baseId:definition.baseId,requests:newRequests});
  passed(definition.id+': era controls expose historical countries and fetch only the selected shared base/patch',{count:metadata.count,countries:metadata.countries,newFiles:newRequests.length});
  if(['historical_europe_1648','historical_world_1914','historical_world_1939'].includes(definition.id))assert.equal(newRequests.length,1,'A later era reuses its balanced geometry');
  const screenshot=path.join(output,definition.id+'-editor.png');await page.screenshot({path:screenshot,fullPage:true});report.screenshots.push(screenshot);
 }
 report.network.webMapFiles=requests.length;
 passed('All five historical templates match their source political layouts without changing any balanced province paths');
 // The current map is 1939: clear a real Japanese occupation through the form.
 const ww2=definitions.find(definition=>definition.id==='historical_world_1939');
 const occupied=Object.entries(ww2.occupation||{}).find(([id,owner])=>ww2.countries.find(country=>country.id===owner)?.name.includes('일본'))||Object.entries(ww2.occupation||{})[0];
 assert.ok(occupied,'1939 includes an explicit occupied province');
 const [province,occupier]=occupied;
 await page.locator('#editor-root [data-province="'+province+'"]').dispatchEvent('click');
 assert.equal(await page.getByLabel('군사 점령국',{exact:true}).inputValue(),occupier);
 await page.getByLabel('군사 점령국',{exact:true}).selectOption('__none__');
 await page.getByLabel('시작 표식',{exact:true}).fill('역사 지도 브라우저 검사');
 await page.getByRole('button',{name:'지도 저장',exact:true}).click();
 const saved=await page.evaluate(()=>MapMaker.getStored());assert.equal(saved.map.initial.occupation[province],null);assert.equal(saved.map.initial.markers[province],'역사 지도 브라우저 검사');
 const cleared=await page.evaluate(async province=>{const doc=await MapMaker.getStored();return MapView.initialState(MapDocument.toScenario(doc)).map.occupation[province]??null;},province);assert.equal(cleared,null);
 passed('A 1939 occupation can be cleared in the province form and its null override is stored');
 await captureDownload(page);await page.getByRole('button',{name:'지도 JSON 내보내기',exact:true}).click();
 const download=await page.evaluate(async()=>({name:__historicalDownloads[0].name,text:await __historicalDownloads[0].blob.text()}));assert.match(download.name,/\.map\.json$/);assert.deepEqual(JSON.parse(download.text),saved);
 await close(page);await page.locator('#scenario-import').setInputFiles({name:download.name,mimeType:'application/json',buffer:Buffer.from(download.text)});await waitMap(page,ww2.id);
 await page.locator('#editor-root [data-province="'+province+'"]').dispatchEvent('click');assert.equal(await page.getByLabel('군사 점령국',{exact:true}).inputValue(),'__none__');assert.equal(await page.getByLabel('시작 표식',{exact:true}).inputValue(),'역사 지도 브라우저 검사');
 await page.getByRole('button',{name:'지도 저장',exact:true}).click();assert.deepEqual(await page.evaluate(()=>MapMaker.getStored()),saved);
 await close(page);assert.deepEqual(await snapshot(page),initial);
 passed('Historical map JSON Blob export/import preserves the exact cleared occupation, marker and active game');
 // Gallery downloads deliberately reference old base IDs so an existing site
 // can open them before its template registry has been updated.
 const mapsFolder=path.join(root,'examples/maps'),files=fs.readdirSync(mapsFolder).filter(file=>file.endsWith('.map.json'));
 const legacy=files.map(file=>({file,doc:JSON.parse(fs.readFileSync(path.join(mapsFolder,file),'utf8'))})).find(row=>row.doc.map.templateId==='world-balanced'&&/1939/.test(row.doc.title))||files.map(file=>({file,doc:JSON.parse(fs.readFileSync(path.join(mapsFolder,file),'utf8'))})).find(row=>['europe-balanced','world-balanced'].includes(row.doc.map.templateId));
 assert.ok(legacy,'Portable gallery map exists');await page.locator('#scenario-import').setInputFiles(path.join(mapsFolder,legacy.file));await waitMap(page,legacy.doc.map.templateId);
 assert.equal(await page.getByLabel('지도 제목',{exact:true}).inputValue(),legacy.doc.title);assert.equal(await page.getByLabel(eraLabel,{exact:true}).inputValue(),'balanced_modern');
 await page.getByRole('button',{name:'지도 저장',exact:true}).click();
 const portable=await page.evaluate(()=>MapMaker.getStored());assert.equal(portable.map.templateId,legacy.doc.map.templateId);
 const inPageNormalized=await page.evaluate(doc=>MapDocument.normalize(doc),legacy.doc);assert.deepEqual(portable,inPageNormalized);
 await close(page);assert.deepEqual(await snapshot(page),initial);
 passed('A gallery map using the existing balanced base imports through the real file picker with historical countries intact',{file:legacy.file,baseId:legacy.doc.map.templateId});
 await context.close();
}
async function offline(browser,definitions,T){
 if(process.argv.includes('--web-only')){report.offlineSkipped=true;return;}
 const context=await browser.newContext({viewport:{width:1500,height:1100}}),page=await context.newPage(),requests=[];
 page.setDefaultTimeout(60000);page.on('pageerror',error=>report.browserErrors.push(error.message));page.on('dialog',dialog=>dialog.accept());
 await serve(page,requests,{offline:true});await ready(page);assert.equal(await page.evaluate(()=>MapTemplates.offline),true);
 await page.locator('#story-panel [data-launch-action="new-map"]').click();await waitMap(page,'regional_eastasia_1592');
 for(const definition of definitions){
  await chooseMap(page,definition);assert.equal(await digestInPage(page,definition.id),hash(T.get(definition.id)));
  assert.equal(await page.locator('#editor-root [data-province]').count(),T.get(definition.id).provinces.length);
 }
 assert.deepEqual(requests,[]);report.network.offlineRequests=0;passed('The full standalone HTML selects all five exact historical layouts with every network request blocked');
 await context.close();
}
async function main(){
 fs.mkdirSync(output,{recursive:true});const definitions=JSON.parse(fs.readFileSync(path.join(root,'tools/map-source/historical-presets.json'),'utf8')),T=require('../map-templates.js');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{await web(browser,definitions,T);await offline(browser,definitions,T);assert.deepEqual(report.browserErrors,[]);report.passed=true;}
 finally{fs.writeFileSync(path.join(output,'historical-maps-browser-report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
}
main().catch(error=>{report.passed=false;report.failure=error.stack||String(error);fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'historical-maps-browser-report.json'),JSON.stringify(report,null,2)+'\n');console.error(error);process.exitCode=1;});
