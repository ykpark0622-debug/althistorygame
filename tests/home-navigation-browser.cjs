'use strict';
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));
const base=process.env.GAME_TEST_URL||'http://127.0.0.1:8142';
async function main(){
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
  await page.goto(base+'/index.html?scenario=examples/imjin-world.json');
  await page.waitForFunction(()=>window.HistoryCrossroads?.getScenario()?.id==='imjin_crossroads_regional_v22');
  await page.locator('[data-action="default-name"]').click();
  await page.locator('[data-choice="0"]').click();
  const before=await page.evaluate(()=>HistoryCrossroads.getState());
  const savedAuto=await page.evaluate(()=>localStorage.getItem('history-crossroads:web:v1:autosave'));
  assert.equal(await page.locator('#player-map circle').count(),0);
  assert.ok(Object.keys(before.map.markers).length>0,'Annotations must remain in scenario state');
  const first=Object.keys(before.map.markers)[0];
  await page.locator('#player-map [data-map-search]').fill(first);
  await page.locator('#player-map [data-map-region]').selectOption(first);
  assert.ok((await page.locator('#player-map .map-selection').innerText()).includes(before.map.markers[first]));
  await page.evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:path.resolve(__dirname,'../../../outputs/v221-map-no-circles.png'),fullPage:true});
  console.log('PASS visible map circles removed while region annotation and state remain accessible');

  await page.locator('#home-link').click();await page.waitForURL(url=>url.searchParams.get('home')==='1');
  await page.waitForFunction(()=>window.HistoryCrossroads?.ready);await page.evaluate(()=>HistoryCrossroads.ready);
  assert.equal(await page.locator('#scenario-title').innerText(),'당신의 이야기를 여세요');
  assert.ok(await page.locator('#resume-scenario-link').isVisible());assert.ok(await page.locator('#player-map-panel').isHidden());
  assert.equal(await page.evaluate(()=>HistoryCrossroads.getState()),null);
  assert.equal(await page.evaluate(()=>localStorage.getItem('history-crossroads:web:v1:autosave')),savedAuto);
  await page.keyboard.press('1');assert.equal(await page.evaluate(()=>localStorage.getItem('history-crossroads:web:v1:autosave')),savedAuto);
  await page.screenshot({path:path.resolve(__dirname,'../../../outputs/v221-home-screen.png'),fullPage:true});
  console.log('PASS logo returns to home with the exact saved progress and no hidden keyboard choice');

  await page.locator('#story-panel [data-launch-action="mode-ai"]').click();
  await page.locator('#story-panel [data-ai-field="mapRegion"]').selectOption('eastasia');
  assert.ok(await page.locator('#story-panel [data-ai-field="mapEra"]').isVisible());
  assert.ok(await page.locator('#resume-scenario-link').isVisible());
  await page.locator('#resume-scenario-link').click();
  await page.waitForURL(url=>url.searchParams.has('scenario')&&!url.searchParams.has('home'));
  await page.waitForFunction(()=>window.HistoryCrossroads?.getState()?.history.length===1);
  assert.deepEqual(await page.evaluate(()=>HistoryCrossroads.getState()),before);
  assert.equal(await page.locator('#player-map circle').count(),0);
  console.log('PASS home AI controls work and resume restores the original scenario and choice');

  await page.locator('#home-link').click();await page.waitForURL(url=>url.searchParams.get('home')==='1');
  await page.locator('#story-panel [data-launch-action="demo-reign"]').click();
  await page.waitForFunction(()=>window.HistoryCrossroads?.getScenario()?.id==='regional_europe_demo_v22');
  assert.ok(!(new URL(page.url())).searchParams.has('home'));
  assert.equal(await page.locator('body').evaluate(node=>node.classList.contains('is-home')),false);
  assert.ok(await page.locator('#player-map-panel').isVisible());
  assert.deepEqual(errors,[]);
  console.log('PASS opening another scenario leaves home normally; runtime errors 0');
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
