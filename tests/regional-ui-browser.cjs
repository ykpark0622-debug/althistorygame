'use strict';
// Optional end-to-end browser checks against the locally served complete app.
// Does not sign in, contact an AI service, or write to a production database.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));
const base=process.env.GAME_TEST_URL||'http://127.0.0.1:8142';
const out=path.resolve(process.argv[2]||path.join(__dirname,'../../..','outputs'));
async function draftSnapshot(page){
 await page.locator('#editor-root').getByRole('button',{name:'JSON',exact:true}).click();
 const draft=JSON.parse(await page.getByLabel('전체 시나리오 JSON',{exact:true}).inputValue());
 await page.locator('#editor-root').getByRole('button',{name:'지도·초기 영토',exact:true}).click();
 return draft;
}
async function visibleProvince(page){
 await page.locator('#editor-root .v2-editor-map svg').scrollIntoViewIfNeeded();
 return page.evaluate(()=>{
  const container=document.querySelector('#editor-root .v2-editor-map'),svg=container.querySelector('svg');
  const nodes=[...container.querySelectorAll('[data-province]')].map(node=>({node,box:node.getBBox()})).filter(({box})=>box.width>8&&box.height>8).sort((a,b)=>b.box.width*b.box.height-a.box.width*a.box.height);
  for(const {node,box} of nodes.slice(0,200)){
   for(const fx of [.5,.3,.7])for(const fy of [.5,.3,.7]){
    const point=svg.createSVGPoint();point.x=box.x+box.width*fx;point.y=box.y+box.height*fy;
    if(!node.isPointInFill(point))continue;
    const screen=point.matrixTransform(node.getScreenCTM());
    if(screen.x<0||screen.y<0||screen.x>=innerWidth||screen.y>=innerHeight)continue;
    if(document.elementFromPoint(screen.x,screen.y)?.closest('[data-province]')!==node)continue;
    return{id:node.dataset.province,x:screen.x,y:screen.y,style:node.getAttribute('style')};
   }
  }
  throw Error('No visible province interior was available for a real map click');
 });
}
async function main(){
 fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({channel:process.env.MAP_TEST_BROWSER||'chrome',headless:true});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1100}}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(60000);page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
  page.on('dialog',dialog=>dialog.accept());
  await page.goto(base+'/index.html');await page.waitForFunction(()=>window.HistoryCrossroads?.getScenario());
  assert.equal(await page.locator('#player-map [data-province]').count(),0,'A blank program must not construct the whole world');
  await page.locator('#story-panel [data-launch-action="setup-map"]').click();
  const regionSelect=()=>page.getByLabel('① 사용할 지역 지도',{exact:true}),eraSelect=()=>page.getByLabel('② 시대 기본안',{exact:true});
  await regionSelect().waitFor({state:'visible'});
  assert.deepEqual(await regionSelect().locator('option').evaluateAll(nodes=>nodes.map(node=>node.value)),['eastasia','europe_med','asia','north_america','south_america','world']);
  await regionSelect().selectOption('europe_med');await eraSelect().selectOption('1754');
  await page.getByRole('button',{name:'③ 이 설정으로 지도 준비',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#editor-root .map-heading h2')?.textContent.includes('1754'));
  let draft=await draftSnapshot(page);assert.equal(draft.map.templateId,'regional_europe_med_1754');
  const cropped=await page.evaluate(()=>{const template=MapTemplates.get('regional_europe_med_1754'),full=MapTemplates.list().find(t=>t.id==='world-detailed');return{count:template.provinces.length,full:full.provinceCount,width:template.width,height:template.height,dom:document.querySelectorAll('#editor-root [data-province]').length,viewBox:document.querySelector('#editor-root svg').getAttribute('viewBox')};});
  assert.equal(cropped.dom,cropped.count);assert.ok(cropped.count<cropped.full);assert.equal(cropped.viewBox,`0 0 ${cropped.width} ${cropped.height}`);
  await page.locator('#editor-root .editor-content').evaluate(node=>{node.scrollTop=0;});
  await page.screenshot({path:path.join(out,'v22-region-era-setup.png')});
  console.log('PASS blank launcher exposes six regions; Europe/Mediterranean 1754 opens only its cropped regions');

  await page.getByLabel('빠른 칠하기',{exact:true}).check();
  await page.getByLabel('칠할 시작 소유국',{exact:true}).selectOption('britain');
  let picked=await visibleProvince(page);
  const originalOwner=await page.evaluate(id=>MapTemplates.get('regional_europe_med_1754').provinces.find(province=>province.id===id).owner,picked.id);
  const paintCountry=originalOwner==='britain'?'france':'britain';
  await page.getByLabel('칠할 시작 소유국',{exact:true}).selectOption(paintCountry);
  // Selecting a tool may scroll the editor; locate the same visible region afresh.
  await page.locator('#editor-root .v2-editor-map svg').scrollIntoViewIfNeeded();picked=await visibleProvince(page);
  const actualOriginal=await page.evaluate(id=>MapTemplates.get('regional_europe_med_1754').provinces.find(province=>province.id===id).owner,picked.id);
  const actualPaint=actualOriginal==='britain'?'france':'britain';
  if(actualPaint!==paintCountry){await page.getByLabel('칠할 시작 소유국',{exact:true}).selectOption(actualPaint);await page.locator('#editor-root .v2-editor-map svg').scrollIntoViewIfNeeded();picked=await visibleProvince(page);}
  await page.mouse.click(picked.x,picked.y);
  assert.equal(await page.locator('#editor-root .v2-province-panel').getByLabel('시작 소유국',{exact:true}).inputValue(),actualPaint);
  draft=await draftSnapshot(page);assert.equal(draft.map.initial.owners[picked.id],actualPaint);
  await page.getByRole('button',{name:'마지막 칠하기 되돌리기',exact:true}).click();
  draft=await draftSnapshot(page);assert.equal(Object.hasOwn(draft.map.initial.owners,picked.id),false,'Undo must remove a newly added override, not rewrite an equivalent default');
  assert.equal(await page.getByRole('button',{name:'마지막 칠하기 되돌리기',exact:true}).isDisabled(),true);
  await page.locator('#editor-root [data-map-search]').fill(picked.id);
  await page.locator('#editor-root [data-map-region]').selectOption(picked.id);
  draft=await draftSnapshot(page);assert.equal(draft.map.initial.owners[picked.id],actualPaint);
  await page.locator('#editor-root .v2-editor-map svg').scrollIntoViewIfNeeded();
  await page.screenshot({path:path.join(out,'v22-regional-map-editor.png')});
  console.log('PASS a real province click changes initial ownership; undo restores the original; a second edit remains in the draft');

  await eraSelect().selectOption('modern');await page.getByRole('button',{name:'③ 이 설정으로 지도 준비',exact:true}).click();
  draft=await draftSnapshot(page);assert.equal(draft.map.templateId,'regional_europe_med_modern');assert.equal(draft.map.initial.owners[picked.id],actualPaint,'Changing era must preserve an explicit manual edit');
  await page.locator('#editor-root').getByRole('button',{name:'초안 저장',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('#editor-dialog').open);
  let saved=await page.evaluate(()=>HistoryCrossroads.getScenario());assert.equal(saved.draft,true);assert.equal(saved.events.length,0);assert.equal(saved.map.initial.owners[picked.id],actualPaint);
  await page.reload();await page.waitForFunction(()=>HistoryCrossroads?.getScenario()?.map?.templateId==='regional_europe_med_modern');
  saved=await page.evaluate(()=>HistoryCrossroads.getScenario());assert.equal(saved.events.length,0);assert.equal(saved.map.initial.owners[picked.id],actualPaint);assert.equal(await page.evaluate(()=>HistoryCrossroads.getState()),null);
  console.log('PASS era switching keeps manual ownership; a map-only blank draft survives save and reload');

  await page.locator('#story-panel [data-launch-action="mode-ai"]').click();
  await page.locator('#story-panel [data-ai-field="mapRegion"]').selectOption('europe_med');
  await page.locator('#story-panel [data-ai-field="mapEra"]').selectOption('1754');
  await page.locator('#story-panel [data-ai-field="mode"]').selectOption('reign');
  const prompt=await page.locator('#story-panel [data-ai-prompt]').inputValue();
  assert.match(prompt,/regional_europe_med_1754/);assert.match(prompt,/유럽과 지중해/);assert.match(prompt,/시대 기본안: 1754/);assert.match(prompt,/이 지도 밖의 지역 ID를 쓰지 마라/);assert.match(prompt,/mode:"reign"/);
  console.log('PASS AI request includes selected regional scope, era, valid map ID and reign mode without contacting an AI');

  await page.goto(base+'/index.html?scenario=examples/imjin-world.json');
  await page.waitForFunction(()=>HistoryCrossroads?.getScenario()?.map?.templateId==='regional_eastasia_1592');
  if(await page.locator('[data-action="default-name"]').count())await page.locator('[data-action="default-name"]').click();
  const start=await page.evaluate(()=>{const scenario=HistoryCrossroads.getScenario(),template=MapTemplates.get(scenario.map.templateId),world=document.querySelector('#player-map [data-map-world]'),svg=document.querySelector('#player-map svg');return{template:scenario.map.templateId,count:template.provinces.length,fullCount:MapTemplates.list().find(t=>t.id==='world-detailed').provinceCount,dom:document.querySelectorAll('#player-map [data-province]').length,viewBox:svg.getAttribute('viewBox'),expected:`0 0 ${template.width} ${template.height}`,transform:world.getAttribute('transform'),offset:document.querySelector('#player-map [data-map-geography]').getAttribute('transform'),expectedOffset:`translate(${-template.offsetX} ${-template.offsetY})`,reset:document.querySelector('#player-map [data-map-tool="reset"]').textContent,legend:[...document.querySelectorAll('#player-map [data-map-country]')].map(node=>node.dataset.mapCountry),clipCount:document.querySelectorAll('#player-map clipPath').length};});
  assert.equal(start.dom,start.count);assert.ok(start.count<start.fullCount);assert.equal(start.viewBox,start.expected);assert.equal(start.transform,'translate(0 0) scale(1)');assert.equal(start.offset,start.expectedOffset);assert.equal(start.reset,'전체 보기');assert.equal(start.clipCount,1);assert.ok(!start.legend.some(id=>['fra','france','britain','usa'].includes(id)),JSON.stringify(start.legend));
  assert.equal(await page.locator('#player-map [data-map-tool="country"]').textContent(),'조선');
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,'v22-imjin-regional-desktop.png'),fullPage:true});
  console.log('PASS Imjin sample starts on cropped East Asia at 100%, without a country-focus click or a world legend');

  const map=page.locator('#player-map svg');await map.scrollIntoViewIfNeeded();const box=await map.boundingBox();await page.mouse.move(box.x+box.width*.45,box.y+box.height*.5);await page.mouse.wheel(0,-200);
  await page.waitForFunction(()=>document.querySelector('#player-map [data-map-world]').transform.baseVal.consolidate().matrix.a>1);
  const zoom=await page.evaluate(()=>{const scenario=HistoryCrossroads.getScenario(),template=MapTemplates.get(scenario.map.templateId),m=document.querySelector('#player-map [data-map-world]').transform.baseVal.consolidate().matrix;return{x:m.e,y:m.f,scale:m.a,width:template.width,height:template.height,clips:document.querySelectorAll('#player-map clipPath').length};});
  assert.ok(zoom.x<=0&&zoom.x>=zoom.width*(1-zoom.scale));assert.ok(zoom.y<=0&&zoom.y>=zoom.height*(1-zoom.scale));assert.equal(zoom.clips,1);
  await page.locator('#player-map [data-map-tool="reset"]').click();assert.equal(await page.locator('#player-map [data-map-world]').getAttribute('transform'),'translate(0 0) scale(1)');
  console.log('PASS real regional wheel zoom is local and bounded; reset returns to the selected regional extent');

  const summaries=await page.locator('#story-panel [data-choice]').evaluateAll(nodes=>nodes.map(node=>({count:node.querySelectorAll('.map-effect-summary').length,text:node.querySelector('.map-effect-summary')?.textContent||''})));
  assert.ok(summaries.every(choice=>choice.count<=1));assert.ok(summaries.some(choice=>/외 \d+개 지역에 변화/.test(choice.text)));
  const affected=await page.evaluate(()=>{const scenario=HistoryCrossroads.getScenario();scenario.id+='_badge_test';scenario.start='palace_crisis';scenario.player.askName=false;HistoryCrossroads.importScenario(scenario);return new Set(scenario.events.find(event=>event.id==='palace_crisis').choices[1].territory.map(change=>change.prov)).size;});
  assert.ok(affected>=100);await page.waitForFunction(count=>document.querySelector('#story-panel [data-choice="1"] .map-effect-summary')?.textContent.includes(`외 ${count-1}개`),affected);
  const hundreds=await page.locator('#story-panel [data-choice="1"] .map-effect-summary').textContent();assert.ok(hundreds.includes(`외 ${affected-1}개 지역에 변화`));assert.equal(await page.locator('#story-panel [data-choice="1"] .map-effect-summary').count(),1);
  await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(out,'v22-imjin-compact-choices.png'),fullPage:true});
  console.log('PASS choice effects stay one map badge per choice, including '+affected+' affected regions');

  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));
  const mobile=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth,mapBottom:document.querySelector('#player-map-panel').getBoundingClientRect().bottom,storyTop:document.querySelector('#story-panel').getBoundingClientRect().top}));
  assert.ok(mobile.width<=mobile.viewport+1);assert.ok(mobile.storyTop>=mobile.mapBottom-2);
  await page.screenshot({path:path.join(out,'v22-imjin-regional-mobile.png'),fullPage:true});
  assert.deepEqual(errors,[]);console.log('PASS mobile cropped map and compact choices have no horizontal overflow');
  console.log('All regional UI browser checks passed. Screenshots: '+out);
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
