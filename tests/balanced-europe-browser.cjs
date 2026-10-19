'use strict';
// Focused, local browser coverage. All requests are served from the release
// folder; no login, external service or production database is contacted.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));
const root=path.resolve(__dirname,'..'),output=path.resolve(__dirname,'../../../outputs');
const base='https://balanced-europe.test',templateId='europe-balanced';
const report={templateId,checks:[],network:{},screenshots:[],browserErrors:[],notes:['Download contents and filenames are checked using the generated Blob. This automation environment cannot verify Chrome filesystem saving.']};
function passed(name,details){report.checks.push({name,passed:true,...(details?{details}: {})});console.log('PASS '+name);}
async function serve(page,requests,offline=false){
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(offline){
   if(url.href==='https://offline-balanced.test/index.html')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'standalone.html'))});
   requests.push(url.href);return route.abort();
  }
  if(url.origin!==base){report.network.externalBlocked=(report.network.externalBlocked||0)+1;return route.abort();}
  if(url.pathname.startsWith('/assets/maps/'))requests.push(url.pathname.slice(1));
  const file=path.resolve(root,'.'+url.pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'};
  return route.fulfill({contentType:types[path.extname(file)]||'text/plain',body:fs.readFileSync(file)});
 });
}
async function captureDownloads(page){
 await page.evaluate(()=>{
  const blobs=new Map(),create=URL.createObjectURL.bind(URL),click=HTMLAnchorElement.prototype.click;
  window.__balancedDownloads=[];
  URL.createObjectURL=blob=>{const url=create(blob);blobs.set(url,blob);return url;};
  HTMLAnchorElement.prototype.click=function(){
   if(!this.hasAttribute('download'))return click.call(this);
   window.__balancedDownloads.push({name:this.download,blob:blobs.get(this.href)});
  };
 });
}
async function visibleItalyPoint(page){
 const map=page.locator('#editor-root .v2-editor-map svg');await map.scrollIntoViewIfNeeded();
 return page.evaluate(id=>{
  const template=MapTemplates.get(id),italy=new Set(template.provinces.filter(p=>p.owner==='ita').map(p=>p.id));
  const svg=document.querySelector('#editor-root .v2-editor-map svg');
  const candidates=[...svg.querySelectorAll('[data-province]')].filter(node=>italy.has(node.dataset.province)).map(node=>({node,box:node.getBBox()})).sort((a,b)=>b.box.width*b.box.height-a.box.width*a.box.height);
  for(const {node,box} of candidates)for(const fx of [.5,.3,.7,.2,.8])for(const fy of [.5,.3,.7,.2,.8]){
   const point=svg.createSVGPoint();point.x=box.x+box.width*fx;point.y=box.y+box.height*fy;
   if(!node.isPointInFill(point))continue;
   const screen=point.matrixTransform(node.getScreenCTM());
   if(screen.x<0||screen.y<0||screen.x>=innerWidth||screen.y>=innerHeight)continue;
   if(document.elementFromPoint(screen.x,screen.y)?.closest('[data-province]')!==node)continue;
   return{id:node.dataset.province,x:screen.x,y:screen.y};
  }
  throw Error('No visible Italian province interior is available for a real click');
 },templateId);
}
async function closeEditor(page){await page.getByRole('button',{name:'닫기',exact:true}).last().click();}
async function main(){
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1500,height:1100}}),page=await context.newPage(),requests=[],dialogs=[];
  let rejectNextDialog=false;
  page.setDefaultTimeout(60000);page.on('pageerror',error=>report.browserErrors.push(error.message));
  page.on('dialog',async dialog=>{dialogs.push(dialog.message());if(rejectNextDialog){rejectNextDialog=false;await dialog.dismiss();}else await dialog.accept();});
  await serve(page,requests);await page.goto(base+'/index.html');
  await page.waitForFunction(()=>window.HistoryCrossroads?.getScenario());
  assert.deepEqual(requests,[]);assert.equal(await page.locator('#player-map [data-province]').count(),0);
  passed('Home starts without downloading or constructing any map');

  const metadata=await page.evaluate(id=>MapTemplates.list().find(item=>item.id===id),templateId);
  assert.equal(metadata.recommended,true);
  const direct=await page.evaluate(async id=>{const template=await MapTemplates.ensure(id);return{id:template.id,count:template.provinces.length,files:MapTemplates.assetInfo(id).files,owners:Object.fromEntries(['fra','deu','che','ita'].map(owner=>[owner,template.provinces.filter(p=>p.owner===owner).length]))};},templateId);
  assert.deepEqual(requests.sort(),direct.files.slice().sort());assert.ok(requests.every(file=>file.includes('/europe-balanced.')));
  assert.ok(direct.owners.ita>=75&&direct.owners.ita<=150,'Italy must have useful province-level detail');
  assert.equal(await page.evaluate(()=>MapTemplates.isLoaded('world-detailed')),false);
  report.network.balancedFiles=direct.files;report.provinces=direct.count;report.countryCounts=direct.owners;
  passed('Balanced Europe loads only its own hashed assets, without the detailed world',direct);

  const gameBefore=await page.evaluate(()=>({scenario:HistoryCrossroads.getScenario(),state:HistoryCrossroads.getState(),scenarioRaw:localStorage.getItem('history-crossroads:web:v1:scenario'),saveRaw:localStorage.getItem('history-crossroads:web:v1:autosave')}));
  await page.locator('#story-panel [data-launch-action="new-map"]').click();
  await page.getByLabel('지도 제목',{exact:true}).waitFor();
  const choose=page.locator(`[data-recommended-template="${templateId}"]`);
  assert.equal(await choose.isVisible(),true);
  await page.getByLabel('지도 제목',{exact:true}).fill('유럽 균형 지도 브라우저 검사');
  const beforeChoose=requests.length;await choose.click();
  await page.waitForFunction(id=>document.querySelector('#editor-root .map-heading h2')?.textContent.includes(MapTemplates.get(id).name),templateId);
  assert.equal(requests.length,beforeChoose,'An already prepared recommended map must reuse the geometry cache');
  assert.equal(await page.getByLabel('지도 제목',{exact:true}).inputValue(),'유럽 균형 지도 브라우저 검사');
  assert.equal(await page.locator('#editor-root [data-province]').count(),direct.count);
  assert.equal(await page.locator('#editor-root circle').count(),0);
  passed('Map workshop exposes the recommended map and keeps the title while switching');

  await page.getByLabel('중심 국가',{exact:true}).selectOption('ita');
  await page.locator('#editor-root [data-map-tool="country"]').click();
  const selected=await visibleItalyPoint(page);await page.mouse.click(selected.x,selected.y);
  await page.locator('#editor-root .v2-province-panel').getByLabel('시작 소유국',{exact:true}).selectOption('fra');
  await page.getByRole('button',{name:'지도 저장',exact:true}).click();
  const saved=await page.evaluate(()=>MapMaker.getStored());
  assert.equal(saved.map.templateId,templateId);assert.equal(saved.map.initial.owners[selected.id],'fra');
  assert.equal(saved.map.playerCountry,'ita');
  const gameAfter=await page.evaluate(()=>({scenario:HistoryCrossroads.getScenario(),state:HistoryCrossroads.getState(),scenarioRaw:localStorage.getItem('history-crossroads:web:v1:scenario'),saveRaw:localStorage.getItem('history-crossroads:web:v1:autosave')}));
  assert.deepEqual(gameAfter,gameBefore);
  passed('A real Italian province click edits ownership and saves without replacing the game',{province:selected.id});

  const map=page.locator('#editor-root .v2-editor-map svg');await map.scrollIntoViewIfNeeded();
  const priorScale=await page.locator('#editor-root [data-map-world]').evaluate(node=>node.transform.baseVal.consolidate().matrix.a),box=await map.boundingBox();
  await page.mouse.move(box.x+box.width*.45,box.y+box.height*.5);await page.mouse.wheel(0,-200);
  await page.waitForFunction(prior=>document.querySelector('#editor-root [data-map-world]').transform.baseVal.consolidate().matrix.a>prior,priorScale);
  await page.locator('#editor-root [data-map-tool="reset"]').click();
  assert.equal(await page.locator('#editor-root [data-map-world]').getAttribute('transform'),'translate(0 0) scale(1)');
  passed('Wheel zoom and map reset work on the balanced map');
  const screenshot=path.join(output,'europe-balanced-editor.png');await page.screenshot({path:screenshot,fullPage:true});report.screenshots.push(screenshot);

  // A province override cannot silently disappear when changing to the old grid.
  await page.getByLabel('① 사용할 지역 지도',{exact:true}).selectOption('europe_med');
  await page.getByLabel('② 시대 기본안',{exact:true}).selectOption('1754');
  rejectNextDialog=true;const dialogsBefore=dialogs.length,nextDialog=page.waitForEvent('dialog');
  await page.getByRole('button',{name:'③ 이 설정으로 지도 준비',exact:true}).click();
  await nextDialog;
  await page.waitForFunction(()=>MapTemplates.isLoaded('regional_europe_med_1754'));
  await page.waitForFunction(()=>!document.querySelector('#editor-root button[data-recommended-template]')?.textContent.includes('불러오는 중'));
  await page.waitForFunction(()=>document.querySelector('#editor-root .map-heading h2')?.textContent.includes(MapTemplates.get('europe-balanced').name));
  assert.equal(dialogs.length,dialogsBefore+1);assert.equal(rejectNextDialog,false);
  await page.getByRole('button',{name:'지도 저장',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>MapMaker.getStored()),saved);
  passed('Rejecting a map change preserves all edited province ownership');

  await captureDownloads(page);await page.getByRole('button',{name:'지도 JSON 내보내기',exact:true}).click();
  const exported=await page.evaluate(async()=>({name:__balancedDownloads[0].name,text:await __balancedDownloads[0].blob.text()}));
  assert.match(exported.name,/\.map\.json$/);assert.deepEqual(JSON.parse(exported.text),saved);
  await closeEditor(page);await page.reload();await page.waitForFunction(()=>window.HistoryCrossroads?.getScenario());
  await page.locator('#map-maker-button').click();
  assert.equal(await page.getByLabel('지도 제목',{exact:true}).inputValue(),saved.title);
  assert.equal((await page.evaluate(()=>MapMaker.getStored())).map.initial.owners[selected.id],'fra');
  await closeEditor(page);
  const imported={...saved,title:'유럽 균형 지도 JSON 재가져오기'};
  await page.locator('#scenario-import').setInputFiles({name:'balanced-europe.map.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});
  await page.getByLabel('지도 제목',{exact:true}).waitFor();assert.equal(await page.getByLabel('지도 제목',{exact:true}).inputValue(),imported.title);
  await page.getByRole('button',{name:'지도 저장',exact:true}).click();
  const reimported=await page.evaluate(()=>MapMaker.getStored());assert.deepEqual(reimported.map,saved.map);
  await closeEditor(page);
  passed('Generated map JSON round-trips through reload, reopening and file import');

  await page.locator('#story-panel [data-launch-action="setup-map"]').click();
  await page.getByLabel('① 사용할 지역 지도',{exact:true}).selectOption('europe_med');
  await page.getByLabel('② 시대 기본안',{exact:true}).selectOption('1754');
  await page.getByRole('button',{name:'③ 이 설정으로 지도 준비',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#editor-root .map-heading h2')?.textContent.includes('1754'));
  assert.equal(await page.locator('#editor-root [data-province]').count(),26641);
  assert.equal(await page.evaluate(()=>MapTemplates.regions().length),6);
  assert.deepEqual(await page.evaluate(()=>MapTemplates.eras('europe_med').map(era=>era.id)),['1754','modern']);
  assert.deepEqual(await page.evaluate(()=>MapMaker.getStored()),reimported);
  await closeEditor(page);
  passed('The scenario editor retains the old Europe 1754 grid and six region choices');

  const offlineContext=await browser.newContext({viewport:{width:1500,height:1100}}),offline=await offlineContext.newPage(),offlineRequests=[];
  offline.setDefaultTimeout(60000);offline.on('pageerror',error=>report.browserErrors.push(error.message));offline.on('dialog',dialog=>dialog.accept());
  await serve(offline,offlineRequests,true);await offline.goto('https://offline-balanced.test/index.html');
  await offline.waitForFunction(()=>window.HistoryCrossroads?.getScenario());
  await offline.locator('#story-panel [data-launch-action="new-map"]').click();
  await offline.locator(`[data-recommended-template="${templateId}"]`).click();
  await offline.waitForFunction(id=>document.querySelector('#editor-root .map-heading h2')?.textContent.includes(MapTemplates.get(id).name),templateId);
  assert.equal(await offline.locator('#editor-root [data-province]').count(),direct.count);
  assert.equal(await offline.evaluate(()=>MapTemplates.get('europe-balanced').provinces.filter(p=>p.owner==='ita').length),direct.owners.ita);
  assert.deepEqual(offlineRequests,[]);
  passed('The standalone HTML includes the same recommended map and works with all network blocked');
  assert.deepEqual(report.browserErrors,[]);report.network.runtimeErrors=0;report.network.offlineRequests=offlineRequests.length;
  report.passed=true;
 }finally{
  fs.writeFileSync(path.join(output,'europe-balanced-browser-report.json'),JSON.stringify(report,null,2)+'\n');
  await browser.close();
 }
}
main().catch(error=>{report.passed=false;report.failure=error.stack||String(error);fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'europe-balanced-browser-report.json'),JSON.stringify(report,null,2)+'\n');console.error(error);process.exitCode=1;});
