'use strict';
// Focused UI regression for the shared region -> era -> prepare map workflow.
// All requests are fulfilled from this release; no production service is used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));
const root=path.resolve(__dirname,'..'),output=path.resolve(__dirname,'../../../outputs');
const base='https://integrated-map.test',regionLabel='① 사용할 지역 지도',eraLabel='② 시대 기본안',prepareLabel='③ 이 설정으로 지도 준비';
const report={checks:[],browserErrors:[],screenshots:[],network:{},notes:['All runtime requests use local release files. Production login, database and disk downloads are outside this focused UI test.']};
function passed(name,details){report.checks.push({name,passed:true,...(details?{details}:{})});console.log('PASS '+name);}
async function serve(page,requests,options={}){
 await page.route('**/*',route=>{
  const url=new URL(route.request().url());
  if(options.offline){
   if(url.origin===base&&url.pathname==='/index.html')return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'standalone.html'))});
   requests.push(url.href);return route.abort();
  }
  if(url.origin!==base)return route.abort();
  if(url.pathname.startsWith('/assets/maps/'))requests.push(url.pathname.slice(1));
  if(options.fail?.(url))return route.fulfill({status:503,body:'Intentional local retry coverage'});
  const file=path.resolve(root,'.'+url.pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});
  const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'};
  return route.fulfill({contentType:types[path.extname(file)]||'text/plain',body:fs.readFileSync(file)});
 });
}
async function ready(page){await page.goto(base+'/index.html');await page.waitForFunction(()=>window.HistoryCrossroads?.getScenario());}
async function waitMap(page,id){await page.waitForFunction(templateId=>{const t=MapTemplates.get(templateId);return t&&document.querySelector('#editor-root .map-heading h2')?.textContent.includes(t.name);},id);}
async function expectSetup(page,region,era){assert.equal(await page.getByLabel(regionLabel,{exact:true}).inputValue(),region);assert.equal(await page.getByLabel(eraLabel,{exact:true}).inputValue(),era);}
async function chooseMap(page,region,era){await page.getByLabel(regionLabel,{exact:true}).selectOption(region);if(era)await page.getByLabel(eraLabel,{exact:true}).selectOption(era);await page.getByRole('button',{name:prepareLabel,exact:true}).click();}
async function close(page){await page.getByRole('button',{name:'닫기',exact:true}).last().click();}
async function gameSnapshot(page){return page.evaluate(()=>({scenario:HistoryCrossroads.getScenario(),state:HistoryCrossroads.getState(),scenarioRaw:localStorage.getItem('history-crossroads:web:v1:scenario'),saveRaw:localStorage.getItem('history-crossroads:web:v1:autosave')}));}
async function main(){
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1500,height:1100}}),page=await context.newPage(),requests=[];
  page.setDefaultTimeout(60000);page.on('pageerror',error=>report.browserErrors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await serve(page,requests);await ready(page);
  assert.deepEqual(requests,[]);const gameBefore=await gameSnapshot(page);
  await page.locator('#story-panel [data-launch-action="new-map"]').click();await waitMap(page,'regional_eastasia_1592');
  await expectSetup(page,'eastasia','1592');
  assert.equal(await page.locator('[data-recommended-template]').count(),0);
  assert.equal(await page.locator('#editor-root').getByRole('heading',{name:'추천 지도',exact:true}).count(),0);
  passed('New map starts with matching East Asia 1592 selectors and no separate recommended-map panel');

  await page.getByLabel('지도 제목',{exact:true}).fill('지역·시대 통합 지도 검사');
  await page.getByLabel(regionLabel,{exact:true}).selectOption('europe_med');
  await expectSetup(page,'europe_med','balanced_modern');
  await waitMap(page,'regional_eastasia_1592');
  assert.equal(await page.getByRole('button',{name:prepareLabel,exact:true}).isEnabled(),true);
  await page.getByRole('button',{name:prepareLabel,exact:true}).click();await waitMap(page,'europe-balanced');
  assert.equal(await page.locator('#editor-root [data-province]').count(),2431);
  assert.equal(await page.getByRole('button',{name:prepareLabel,exact:true}).isEnabled(),false);
  assert.equal(await page.getByLabel('지도 제목',{exact:true}).inputValue(),'지역·시대 통합 지도 검사');
  passed('Europe defaults to balanced modern and only changes the map after Prepare');

  await page.getByLabel('중심 국가',{exact:true}).selectOption('ita');
  await page.getByLabel('편집할 국가',{exact:true}).selectOption('ita');
  await page.getByLabel('표시 이름',{exact:true}).fill('이탈리아 연합');
  await page.getByLabel('색상 #RRGGBB',{exact:true}).fill('#446688');
  await page.getByRole('button',{name:'지도 저장',exact:true}).click();
  const savedEurope=await page.evaluate(()=>MapMaker.getStored());
  assert.equal(savedEurope.map.templateId,'europe-balanced');assert.equal(savedEurope.map.playerCountry,'ita');
  assert.equal(savedEurope.map.countries.find(c=>c.id==='ita').name,'이탈리아 연합');
  await close(page);await page.locator('#map-maker-button').click();await waitMap(page,'europe-balanced');await expectSetup(page,'europe_med','balanced_modern');
  assert.equal(await page.getByLabel('지도 제목',{exact:true}).inputValue(),savedEurope.title);
  await page.getByLabel('편집할 국가',{exact:true}).selectOption('ita');
  assert.equal(await page.getByLabel('표시 이름',{exact:true}).inputValue(),'이탈리아 연합');
  assert.equal(await page.getByLabel('색상 #RRGGBB',{exact:true}).inputValue(),'#446688');
  passed('Saved balanced Europe reopens with correct selectors, title and edited country labels');

  const screenshot=path.join(output,'integrated-map-selector.png');await page.screenshot({path:screenshot,fullPage:true});report.screenshots.push(screenshot);
  await chooseMap(page,'world');await waitMap(page,'world-balanced');await expectSetup(page,'world','balanced_modern');
  assert.equal(await page.locator('#editor-root [data-province]').count(),5939);
  await page.getByRole('button',{name:'지도 저장',exact:true}).click();
  const savedWorld=await page.evaluate(()=>MapMaker.getStored());
  assert.equal(savedWorld.map.templateId,'world-balanced');
  await close(page);await page.locator('#map-maker-button').click();await waitMap(page,'world-balanced');await expectSetup(page,'world','balanced_modern');
  assert.equal(await page.getByLabel('지도 제목',{exact:true}).inputValue(),savedEurope.title);
  passed('World balanced uses the same selectors and survives save and reopen');

  for(const [templateId,era] of [['regional_europe_med_1754','1754'],['regional_europe_med_modern','modern']]){
   await chooseMap(page,'europe_med',era);await waitMap(page,templateId);await expectSetup(page,'europe_med',era);
   await page.getByRole('button',{name:'지도 저장',exact:true}).click();await close(page);await page.locator('#map-maker-button').click();
   await waitMap(page,templateId);await expectSetup(page,'europe_med',era);
   assert.equal(await page.locator('#editor-root [data-province]').count(),26641);
  }
  passed('Detailed Europe 1754 and modern remain selectable and reopen without being relabeled balanced');

  await close(page);
  await page.locator('#scenario-import').setInputFiles({name:'balanced-world.map.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(savedWorld))});
  await waitMap(page,'world-balanced');await expectSetup(page,'world','balanced_modern');
  assert.equal(await page.getByLabel('지도 제목',{exact:true}).inputValue(),savedWorld.title);
  await close(page);
  assert.deepEqual(await gameSnapshot(page),gameBefore);
  passed('Map file import resolves its setup selectors while preserving the active game');

  await page.locator('#story-panel [data-launch-action="setup-map"]').click();
  await page.getByLabel(regionLabel,{exact:true}).waitFor();
  await chooseMap(page,'europe_med');await waitMap(page,'europe-balanced');await expectSetup(page,'europe_med','balanced_modern');
  assert.equal(await page.locator('[data-recommended-template]').count(),0);
  await close(page);assert.deepEqual(await gameSnapshot(page),gameBefore);
  passed('Scenario map editor shares the integrated workflow and keeps the unapplied game intact');
  report.network.editorMapRequests=requests.length;

  // Start a new browser context so the target map is absent from cache.
  const retryContext=await browser.newContext({viewport:{width:1500,height:1100}}),retry=await retryContext.newPage(),retryRequests=[];
  let blockWorld=true;
  retry.setDefaultTimeout(60000);retry.on('pageerror',error=>report.browserErrors.push(error.message));retry.on('dialog',dialog=>dialog.accept());
  await serve(retry,retryRequests,{fail:url=>blockWorld&&url.pathname.includes('/world-balanced.')});await ready(retry);
  await retry.locator('#story-panel [data-launch-action="new-map"]').click();await waitMap(retry,'regional_eastasia_1592');
  await retry.getByLabel('지도 제목',{exact:true}).fill('재시도 중 보존할 제목');
  await chooseMap(retry,'world');
  await retry.locator('#editor-report').filter({hasText:'지도를 불러오지 못했습니다'}).waitFor();
  await waitMap(retry,'regional_eastasia_1592');
  assert.equal(await retry.getByLabel('지도 제목',{exact:true}).inputValue(),'재시도 중 보존할 제목');
  assert.equal(await retry.getByRole('button',{name:prepareLabel,exact:true}).isEnabled(),true);
  blockWorld=false;await retry.getByRole('button',{name:prepareLabel,exact:true}).click();await waitMap(retry,'world-balanced');
  await expectSetup(retry,'world','balanced_modern');
  assert.equal(await retry.getByLabel('지도 제목',{exact:true}).inputValue(),'재시도 중 보존할 제목');
  passed('Failed selected-map loading preserves the current map and title, then Prepare retries successfully');
  report.network.retryRequests=retryRequests.filter(file=>file.includes('/world-balanced.')).length;

  const offlineContext=await browser.newContext({viewport:{width:1500,height:1100}}),offline=await offlineContext.newPage(),offlineRequests=[];
  offline.setDefaultTimeout(60000);offline.on('pageerror',error=>report.browserErrors.push(error.message));offline.on('dialog',dialog=>dialog.accept());
  await serve(offline,offlineRequests,{offline:true});await ready(offline);
  await offline.locator('#story-panel [data-launch-action="new-map"]').click();await waitMap(offline,'regional_eastasia_1592');
  for(const [region,id,count] of [['europe_med','europe-balanced',2431],['world','world-balanced',5939]]){
   await chooseMap(offline,region);await waitMap(offline,id);await expectSetup(offline,region,'balanced_modern');
   assert.equal(await offline.locator('#editor-root [data-province]').count(),count);
  }
  assert.deepEqual(offlineRequests,[]);assert.equal(await offline.locator('[data-recommended-template]').count(),0);
  passed('Standalone HTML exposes both balanced maps in the same selectors with all network blocked');
  report.network.offlineRequests=offlineRequests.length;
  assert.deepEqual(report.browserErrors,[]);report.passed=true;
 }finally{
  fs.writeFileSync(path.join(output,'integrated-map-browser-report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();
 }
}
main().catch(error=>{report.passed=false;report.failure=error.stack||String(error);fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'integrated-map-browser-report.json'),JSON.stringify(report,null,2)+'\n');console.error(error);process.exitCode=1;});
