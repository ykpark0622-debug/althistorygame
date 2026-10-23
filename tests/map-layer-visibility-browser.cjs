'use strict';
// Local Chrome regression. No production gallery, database or remote geometry
// is contacted; real release assets and portable gallery JSON are used.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));
const root=path.resolve(__dirname,'..'),output=path.resolve(__dirname,'../../../outputs'),base='https://map-layer-visibility.test';
const report={checks:[],browserErrors:[],notes:['Actual map workshop and file import are tested using local release assets. Display controls must never edit map documents or game progress.']};
const definitions=JSON.parse(fs.readFileSync(path.join(root,'tools/map-source/historical-presets.json'),'utf8'));
const fixture=JSON.parse(fs.readFileSync(path.join(root,'examples/maps/historical_europe_1444.map.json'),'utf8'));
function passed(name,details){report.checks.push({name,passed:true,...(details?{details}:{})});console.log('PASS '+name);}
const overlays=(page,layer)=>page.locator('#editor-root [data-map-overlay="'+layer+'"]');
const control=(page,layer)=>page.locator('#editor-root [data-map-layer="'+layer+'"]');
async function ready(page,id){await page.waitForFunction(id=>{const t=MapTemplates.get(id);return t&&document.querySelector('#editor-dialog[open]')&&document.querySelector('#editor-root .map-heading h2')?.textContent.includes(t.name);},id);}
async function choose(page,region,era,id){await settings(page);await page.getByLabel('① 사용할 지역 지도',{exact:true}).selectOption(region);await page.getByLabel('② 시대 기본안',{exact:true}).selectOption(era);await page.getByRole('button',{name:'③ 이 설정으로 지도 준비',exact:true}).click();await ready(page,id);}
async function settings(page){const field=page.getByLabel('① 사용할 지역 지도',{exact:true});if(!await field.isVisible())await page.getByRole('button',{name:'지도 설정',exact:true}).click();}
async function countryValue(page,label){return page.getByRole('combobox',{name:label,exact:true}).getAttribute('data-country-id');}
async function save(page){await page.getByRole('button',{name:'지도 저장',exact:true}).click();return page.evaluate(()=>MapMaker.getStored());}
async function game(page){return page.evaluate(()=>({scenario:HistoryCrossroads.getScenario(),state:HistoryCrossroads.getState(),rawScenario:localStorage.getItem('history-crossroads:web:v1:scenario'),rawSave:localStorage.getItem('history-crossroads:web:v1:autosave')}));}
async function main(){
 fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1500,height:1100}}),page=await context.newPage();page.setDefaultTimeout(45000);
  page.on('pageerror',error=>report.browserErrors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==base)return route.abort();const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});return route.fulfill({contentType:{'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'}[path.extname(file)]||'text/plain',body:fs.readFileSync(file)});});
  await page.goto(base+'/index.html');await page.waitForFunction(()=>window.HistoryCrossroads?.getScenario());const initialGame=await game(page);
  await page.locator('#scenario-import').setInputFiles(path.join(root,'examples/maps/historical_europe_1444.map.json'));await ready(page,'europe-balanced');
  assert.equal(await control(page,'influence').isChecked(),false);assert.equal(await control(page,'occupation').isChecked(),true);assert.equal(await overlays(page,'influence').count(),0);
  const expectedInfluence=Object.keys(fixture.map.initial.influence).length;assert.ok(expectedInfluence>0);const portableSaved=await save(page);assert.deepEqual(portableSaved,await page.evaluate(doc=>MapDocument.normalize(doc),fixture));
  passed('Previously distributed 1444 gallery JSON opens with clean country colors and influence hatching off',{influenceRegionsRetained:expectedInfluence});
  await page.screenshot({path:path.join(output,'map-hatching-fixed.png'),fullPage:true});
  await control(page,'influence').check();assert.equal(await overlays(page,'influence').count(),expectedInfluence);
  const influenced=Object.keys(fixture.map.initial.influence)[0];await page.locator('#editor-root [data-province="'+influenced+'"]').dispatchEvent('click');assert.equal(await countryValue(page,'영향국'),fixture.map.initial.influence[influenced]);
  await control(page,'influence').uncheck();assert.equal(await overlays(page,'influence').count(),0);assert.equal(await countryValue(page,'영향국'),fixture.map.initial.influence[influenced]);assert.deepEqual(await save(page),portableSaved);assert.deepEqual(await game(page),initialGame);
  passed('Influence hatching can be shown and hidden while real region editing, stored map JSON and game progress stay unchanged');
  await choose(page,'europe_med','historical_1444','historical_europe_1444');assert.equal(await control(page,'influence').isChecked(),false);assert.equal(await overlays(page,'influence').count(),0);
  await control(page,'influence').check();const templateInfluence=definitions.find(row=>row.id==='historical_europe_1444').influence;assert.equal(await overlays(page,'influence').count(),Object.keys(templateInfluence).length);await control(page,'influence').uncheck();
  passed('The installed 1444 era preset also defaults to no influence hatching and still contains all historical relations');
  await choose(page,'world','historical_1939','historical_world_1939');const ww2=definitions.find(row=>row.id==='historical_world_1939'),occupationCount=Object.keys(ww2.occupation).length,influenceCount=Object.keys(ww2.influence).length;
  assert.ok(occupationCount>0);assert.equal(await control(page,'occupation').isChecked(),true);assert.equal(await control(page,'influence').isChecked(),false);assert.equal(await overlays(page,'occupation').count(),occupationCount);assert.equal(await overlays(page,'influence').count(),0);
  const ww2Saved=await save(page);await control(page,'occupation').uncheck();assert.equal(await overlays(page,'occupation').count(),0);await control(page,'influence').check();assert.equal(await overlays(page,'influence').count(),influenceCount);assert.equal(await overlays(page,'occupation').count(),0);await control(page,'occupation').check();assert.equal(await overlays(page,'occupation').count(),occupationCount);await control(page,'influence').uncheck();assert.equal(await overlays(page,'influence').count(),0);assert.deepEqual(await save(page),ww2Saved);
  passed('1939 military occupation remains visible by default and its checkbox works independently from influence',{occupationCount,influenceCount});
  const occupied=Object.keys(ww2.occupation)[0];await page.locator('#editor-root [data-province="'+occupied+'"]').dispatchEvent('click');assert.equal(await countryValue(page,'군사 점령국'),ww2.occupation[occupied]);
  const before=await page.locator('#editor-root [data-map-world]').getAttribute('transform');await page.locator('#editor-root [data-map-tool="in"]').click();const after=await page.locator('#editor-root [data-map-world]').getAttribute('transform');assert.notEqual(after,before);
  passed('Region selection and zoom remain available with the new display controls');
  await page.getByRole('button',{name:'닫기',exact:true}).last().click();
  await page.evaluate(async()=>{const doc=await MapMaker.getStored();window.__layerScenario=MapDocument.toScenario(doc);window.__layerState=MapView.initialState(__layerScenario);window.__layerHolder=document.createElement('div');__layerHolder.id='layer-regression';document.body.append(__layerHolder);window.__layerOriginal={scenario:JSON.stringify(__layerScenario),state:JSON.stringify(__layerState),template:JSON.stringify(MapTemplates.get(__layerScenario.map.templateId))};MapView.render(__layerHolder,__layerScenario,__layerState);window.__layerSvg=__layerHolder.querySelector('svg');});
  await page.locator('#layer-regression [data-map-layer="occupation"]').uncheck();await page.locator('#layer-regression [data-map-layer="influence"]').check();
  const rerender=await page.evaluate(()=>{MapView.render(__layerHolder,__layerScenario,__layerState);return{sameSvg:__layerSvg===__layerHolder.querySelector('svg'),occupation:__layerHolder.querySelector('[data-map-layer="occupation"]').checked,influence:__layerHolder.querySelector('[data-map-layer="influence"]').checked,occupationCount:__layerHolder.querySelectorAll('[data-map-overlay="occupation"]').length,influenceCount:__layerHolder.querySelectorAll('[data-map-overlay="influence"]').length,dataUnchanged:JSON.stringify(__layerScenario)===__layerOriginal.scenario&&JSON.stringify(__layerState)===__layerOriginal.state&&JSON.stringify(MapTemplates.get(__layerScenario.map.templateId))===__layerOriginal.template};});
  assert.deepEqual(rerender,{sameSvg:true,occupation:false,influence:true,occupationCount:0,influenceCount,dataUnchanged:true});assert.deepEqual(await game(page),initialGame);
  passed('Re-rendering a map keeps its per-view layer preferences, reuses geometry and leaves scenario/state/template data byte-for-byte unchanged');
  assert.deepEqual(report.browserErrors,[]);report.passed=true;await context.close();
 }finally{fs.writeFileSync(path.join(output,'map-hatching-fixed-browser-report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
}
main().catch(error=>{report.passed=false;report.failure=error.stack||String(error);fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'map-hatching-fixed-browser-report.json'),JSON.stringify(report,null,2)+'\n');console.error(error);process.exitCode=1;});
