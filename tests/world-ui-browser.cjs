'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));
const base=process.env.GAME_TEST_URL||'http://127.0.0.1:8141',out=path.resolve(process.argv[2]||path.join(__dirname,'../../../..','outputs'));
async function main(){
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1366,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
  const start=Date.now();await page.goto(base+'/index.html?scenario=examples/world-detailed-demo.json');await page.waitForFunction(()=>window.HistoryCrossroads?.getScenario()?.map?.templateId==='world-detailed');await page.locator('[data-action="default-name"]').click();
  assert.equal(await page.locator('#player-map [data-province]').count(),await page.evaluate(()=>MapTemplates.get('world-detailed').provinces.length));assert.ok(await page.locator('#player-map [data-map-region] option').count()<=81);
  assert.equal(await page.locator('.reign-card').count(),3);const desktop=await page.evaluate(()=>{const m=document.querySelector('#player-map-panel').getBoundingClientRect(),s=document.querySelector('#story-panel').getBoundingClientRect();return{mapX:m.x,mapW:m.width,storyX:s.x,storyW:s.width,overflow:document.documentElement.scrollWidth>innerWidth};});assert.ok(desktop.storyX>desktop.mapX+desktop.mapW-2);assert.equal(desktop.overflow,false);console.log('PASS real atlas boot and desktop left-map/right-story ('+(Date.now()-start)+'ms) '+JSON.stringify(desktop));
  await page.locator('[data-map-tool="country"]').click();
  assert.ok(await page.evaluate(()=>document.querySelector('#player-map [data-map-world]').transform.baseVal.consolidate().matrix.a>5),'Country button must focus metropolitan France rather than distant dependencies');
  const original=await page.evaluate(()=>document.querySelector('#player-map svg'));
  await page.locator('[data-part-event="border_1"][data-part-choice="1"]').click();
  await page.locator('[data-part-event="tax_1"][data-part-choice="0"]').click();
  await page.locator('[data-part-event="pact_1"][data-part-choice="0"]').click();
  assert.ok((await page.evaluate(()=>HistoryCrossroads.getState().map.occupation)));
  assert.equal(await page.locator('.reign-card.selected').count(),3);assert.ok(await page.locator('#timeline-panel').innerText());
  await page.evaluate(()=>window.scrollTo(0,0));fs.mkdirSync(out,{recursive:true});await page.screenshot({path:path.join(out,'history-crossroads-v2.1-desktop.png'),fullPage:true});
  const transform=await page.locator('#player-map [data-map-world]').getAttribute('transform'),view=await page.locator('#player-map svg').boundingBox();await page.mouse.move(view.x+view.width*.5,view.y+view.height*.5);await page.mouse.wheel(0,-120);await page.waitForFunction(t=>document.querySelector('#player-map [data-map-world]').getAttribute('transform')!==t,transform);console.log('PASS dense map wheel zoom after real choices and timeline updates');
  await page.locator('#save-button').click();assert.match(await page.locator('#toast').innerText(),/현재 진행을 저장/);const saved=await page.evaluate(()=>HistoryCrossroads.getState());await page.reload();await page.waitForFunction(()=>HistoryCrossroads?.getState()?.history.length===3);assert.deepEqual((await page.evaluate(()=>HistoryCrossroads.getState())).map,saved.map);console.log('PASS dense atlas real browser manual save and autosave/reload restore all region ownership and decisions');
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));const mobile=await page.evaluate(()=>{const m=document.querySelector('#player-map-panel').getBoundingClientRect(),s=document.querySelector('#story-panel').getBoundingClientRect();return{mapY:m.y,mapBottom:m.bottom,storyY:s.y,width:document.documentElement.scrollWidth,viewport:innerWidth};});assert.ok(mobile.storyY>=mobile.mapBottom-2);assert.ok(mobile.width<=mobile.viewport+1);await page.screenshot({path:path.join(out,'history-crossroads-v2.1-mobile.png'),fullPage:true});console.log('PASS mobile map-first stack without horizontal overflow '+JSON.stringify(mobile));
  await page.setViewportSize({width:1366,height:900});await page.locator('#edit-button').click();await page.getByRole('button',{name:'지도·초기 영토',exact:true}).click();assert.ok(await page.locator('#editor-root [data-map-region]').count());await page.locator('#editor-root [data-map-search]').fill('Brussels');assert.ok(await page.locator('#editor-root [data-map-region] option').count()<85);console.log('PASS actual dense atlas opens and searches in scenario editor');
  assert.deepEqual(errors,[]);console.log('All real atlas UI checks passed.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
