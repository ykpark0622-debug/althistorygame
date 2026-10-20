'use strict';
// Real Chrome against local release files. No production database or gallery is
// contacted. Export tests inspect the generated Blob, not filesystem downloads.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));
const root=path.resolve(__dirname,'..'),output=path.resolve(__dirname,'../../../outputs'),base='https://map-workshop-tools.test';
const report={checks:[],browserErrors:[],notes:['Generated JSON is inspected as an actual download Blob. Browser filesystem saving is not exercised.','Every request is served from the local release; no production services are contacted.']};
const fixture=JSON.parse(fs.readFileSync(path.join(root,'examples/maps/historical_europe_1444.map.json'),'utf8'));
function passed(name,details){report.checks.push({name,passed:true,...details&&{details}});console.log('PASS '+name);}
const editor=page=>page.locator('#editor-root');
async function ready(page,id){await page.waitForFunction(id=>{const t=MapTemplates.get(id);return t&&document.querySelector('#editor-dialog[open]')&&document.querySelector('#editor-root .map-heading h2')?.textContent.includes(t.name);},id);}
async function save(page){await page.getByRole('button',{name:'지도 저장',exact:true}).click();return page.evaluate(()=>MapMaker.getStored());}
async function close(page){await page.getByRole('button',{name:'닫기',exact:true}).last().click();}
async function game(page){return page.evaluate(()=>({scenario:HistoryCrossroads.getScenario(),state:HistoryCrossroads.getState(),rawScenario:localStorage.getItem('history-crossroads:web:v1:scenario'),rawSave:localStorage.getItem('history-crossroads:web:v1:autosave')}));}
async function importDocument(page,doc){await page.evaluate(async doc=>{await MapTemplates.ensure(doc.map.templateId);await MapMaker.importDocument(doc);},doc);await ready(page,doc.map.templateId);}
async function customCountry(page,id){await page.getByLabel('편집할 국가 검색',{exact:true}).fill(id);await page.getByLabel('편집할 국가',{exact:true}).selectOption(id);}
async function exported(page){
 await page.evaluate(()=>{if(!window.__toolCapture){window.__toolCapture=true;const blobs=new Map(),create=URL.createObjectURL.bind(URL),click=HTMLAnchorElement.prototype.click;URL.createObjectURL=blob=>{const url=create(blob);blobs.set(url,blob);return url;};HTMLAnchorElement.prototype.click=function(){if(!this.hasAttribute('download'))return click.call(this);window.__toolDownloads.push({name:this.download,blob:blobs.get(this.href)});};}window.__toolDownloads=[];});
 await page.getByRole('button',{name:'지도 JSON 내보내기',exact:true}).click();
 return page.evaluate(async()=>({name:__toolDownloads[0].name,text:await __toolDownloads[0].blob.text()}));
}
async function effective(page,doc){return page.evaluate(doc=>MapView.initialState(MapDocument.toScenario(doc)).map,doc);}
async function localPoint(page,screen){return page.evaluate(({x,y})=>{const world=document.querySelector('#editor-root [data-map-world]');const p=new DOMPoint(x,y).matrixTransform(world.getScreenCTM().inverse());return[p.x,p.y];},screen);}
async function centerOnMap(page,fx=.65,fy=.65){
 const svg=editor(page).locator('svg').first();await svg.scrollIntoViewIfNeeded();const b=await svg.boundingBox();return{x:b.x+b.width*fx,y:b.y+b.height*fy};
}
async function countryColor(page,document,id,hex){
 const results=await page.evaluate(({document,id,hex})=>{const scenario=MapDocument.toScenario(document),state=MapView.initialState(scenario),ids=Object.entries(state.map.owners).filter(([,owner])=>owner===id).map(([prov])=>prov);return{count:ids.length,all:ids.every(prov=>globalThis.document.querySelector('#editor-root [data-province="'+prov+'"]').style.getPropertyValue('--province-color').toLowerCase()===hex)};},{document,id,hex});
 assert.ok(results.count>0,'The selected existing country owns visible regions');assert.equal(results.all,true);return results.count;
}
async function searchAndColor(page,initialGame){
 await importDocument(page,fixture);const original=await save(page),country=fixture.map.countries.find(c=>/프랑스/.test(c.name));assert.ok(country);
 const paintSearch=page.getByLabel('칠할 시작 소유국 검색',{exact:true}),paintSelect=page.getByLabel('칠할 시작 소유국',{exact:true});
 const paintBefore=await paintSelect.inputValue();await paintSearch.fill('찾을수없는국가_zzzz');assert.equal(await paintSelect.inputValue(),paintBefore);assert.equal(await paintSelect.locator('option:enabled').count(),1);
 assert.deepEqual(await save(page),original,'A zero-result search cannot edit ownership or current country');
 await paintSearch.fill('프랑스');assert.ok((await paintSelect.locator('option').allTextContents()).some(t=>/프랑스/.test(t)));await paintSelect.selectOption(country.id);assert.equal(await paintSelect.inputValue(),country.id);
 await customCountry(page,country.id);assert.equal(await page.getByLabel('편집할 국가',{exact:true}).inputValue(),country.id);
 const editSelect=page.getByLabel('편집할 국가',{exact:true});await page.getByLabel('편집할 국가 검색',{exact:true}).fill('없는국가_zzzz');assert.equal(await editSelect.inputValue(),country.id);assert.deepEqual(await save(page),original);
 await page.getByLabel('편집할 국가 검색',{exact:true}).fill('프랑스');assert.ok((await editSelect.locator('option').allTextContents()).some(t=>/프랑스/.test(t)));
 passed('Both country controls search by Korean name and ID while zero results preserve the selected country and all map data');
 const picker=page.getByLabel('국가 색상',{exact:true});assert.equal(await picker.getAttribute('type'),'color');await picker.fill('#123abc');
 let changed=await save(page);assert.equal(changed.map.countries.find(c=>c.id===country.id).color,'#123abc');const count=await countryColor(page,changed,country.id,'#123abc');
 const palette=editor(page).getByRole('button',{name:/^국가 색상 #[a-fA-F0-9]{6}$/}).first();const paletteHex=(await palette.getAttribute('aria-label')).slice(-7).toLowerCase();await palette.click();
 changed=await save(page);assert.equal(changed.map.countries.find(c=>c.id===country.id).color.toLowerCase(),paletteHex);await countryColor(page,changed,country.id,paletteHex);
 const download=await exported(page);assert.match(download.name,/\.map\.json$/);assert.deepEqual(JSON.parse(download.text),changed);
 await close(page);await page.locator('#scenario-import').setInputFiles({name:'country-color.map.json',mimeType:'application/json',buffer:Buffer.from(download.text)});await ready(page,'europe-balanced');assert.deepEqual(await save(page),changed);await countryColor(page,changed,country.id,paletteHex);
 assert.deepEqual(await game(page),initialGame);passed('Native color picking and palette clicks recolor every already-owned region; save/export/import retain the exact color',{regions:count});return{document:changed,country:country.id};
}
async function blankMaps(page,initialGame,dialogState){
 for(const[id,count]of[['historical_world_1939',5939],['historical_europe_1444',2431]]){
  const document=await page.evaluate(async id=>{const template=await MapTemplates.ensure(id),doc=MapDocument.create({id:'blank_'+id,templateId:id,title:'백지도 검사 '+id});const p=template.provinces[0],country=template.countries.find(c=>c.id===p.owner);doc.map.initial.markers[p.id]='백지도 전에 남긴 표식';doc.map.countries.push({id:country.id,name:country.name,color:country.color,labelPosition:[template.width/2,template.height/2]});await MapMaker.importDocument(doc);return doc;},id);await ready(page,id);
  const original=await save(page),stateBefore=await effective(page,original);assert.ok(Object.keys(stateBefore.influence).length>0);if(id.endsWith('1939'))assert.ok(Object.keys(stateBefore.occupation).length>0);
  if(id.endsWith('1939')){dialogState.reject=true;await page.getByRole('button',{name:'백지도 만들기',exact:true}).click();assert.deepEqual(await save(page),original);passed('Cancelling the blank-map confirmation leaves the complete historical map untouched');}
  await page.getByRole('button',{name:'백지도 만들기',exact:true}).click();const blank=await save(page),state=await effective(page,blank),owners=Object.values(state.owners);
  assert.equal(owners.length,count);assert.equal(new Set(owners).size,1);assert.ok(!Object.values(stateBefore.owners).every(owner=>owner===owners[0]));
  assert.deepEqual(state.occupation,{});assert.deepEqual(state.influence,{});assert.deepEqual(state.markers,{});
  const colors=await page.locator('#editor-root [data-province]').evaluateAll(nodes=>[...new Set(nodes.map(n=>n.style.getPropertyValue('--province-color')))]);assert.equal(colors.length,1);assert.equal(await editor(page).locator('[data-map-country-label]').count(),0,'Blank map must not show ghost names from manually positioned old countries');
  assert.deepEqual(await game(page),initialGame);
  await page.getByRole('button',{name:'백지도 만들기 되돌리기',exact:true}).click();assert.deepEqual(await save(page),original);assert.deepEqual(await effective(page,original),stateBefore);
  passed(id+': blanking all '+count+' regions clears historical occupation, influence and markers; undo restores the exact complete map and game progress');
 }
}
async function labelTools(page,document,country,initialGame){
 await importDocument(page,document);await customCountry(page,country);await page.getByLabel('국명 위치 편집',{exact:true}).check();
 await page.getByLabel('중심 국가',{exact:true}).selectOption(country);await page.locator('#editor-root [data-map-tool="country"]').click();
 const svg=editor(page).locator('svg').first();await svg.scrollIntoViewIfNeeded();let box=await svg.boundingBox();const dragStart={x:box.x+box.width*.82,y:box.y+box.height*.78};
 // Zoom and then pan the actual SVG before moving text, exercising both inverse
 // transforms rather than relying on the untransformed viewport.
 await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.wheel(0,-130);
 const transformBeforePan=await page.locator('#editor-root [data-map-world]').getAttribute('transform');await page.mouse.move(dragStart.x,dragStart.y);await page.mouse.down();await page.mouse.move(dragStart.x-25,dragStart.y-17,{steps:5});await page.mouse.up();
 const transformAfterPan=await page.locator('#editor-root [data-map-world]').getAttribute('transform');assert.notEqual(transformAfterPan,transformBeforePan);
 await page.getByLabel('빠른 칠하기',{exact:true}).check();await page.getByLabel('국명 위치 편집',{exact:true}).check();
 // Checking an editor toggle may rebuild its view, so focus, zoom and pan after
 // those controls as well before obtaining the final expected coordinates.
 await page.locator('#editor-root [data-map-tool="country"]').click();await svg.scrollIntoViewIfNeeded();box=await svg.boundingBox();await page.mouse.move(box.x+box.width*.5,box.y+box.height*.5);await page.mouse.wheel(0,-90);
 const p={x:box.x+box.width*.88,y:box.y+box.height*.82};await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x-15,p.y-10,{steps:4});await page.mouse.up();
 const label=editor(page).locator('[data-map-country-label="'+country+'"]');await label.waitFor();const b=await label.boundingBox(),from={x:b.x+b.width/2,y:b.y+b.height/2},to={x:from.x+45,y:from.y+25},expected=await localPoint(page,to),before=await save(page),viewBefore=await page.locator('#editor-root [data-map-world]').getAttribute('transform');
 await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:8});await page.mouse.up();
 const moved=await save(page),position=moved.map.countries.find(c=>c.id===country)?.labelPosition;assert.ok(Array.isArray(position),'Drag must save country.labelPosition');
 const startLocal=await localPoint(page,from),delta=[to.x-from.x,to.y-from.y];
 // The pointer need not start on the text anchor (SVG text has its own baseline).
 // Compare the translated anchor using the CTM scale; this also catches storing
 // screen pixels or world-offset coordinates instead of crop-local coordinates.
 const startAnchor=await page.evaluate(({country,position,from,to})=>{const n=document.querySelector('[data-map-country-label="'+country+'"]'),world=document.querySelector('#editor-root [data-map-world]'),m=world.getScreenCTM(),a=new DOMPoint(from.x,from.y).matrixTransform(m.inverse()),b=new DOMPoint(to.x,to.y).matrixTransform(m.inverse());return{dx:b.x-a.x,dy:b.y-a.y,x:Number(n.getAttribute('x')),y:Number(n.getAttribute('y'))};},{country,position,from,to});
 assert.ok(Math.abs(startAnchor.x-position[0])<.02);assert.ok(Math.abs(startAnchor.y-position[1])<.02);assert.ok(position[0]>=0&&position[0]<=450&&position[1]>=0&&position[1]<=312);
 assert.equal(await page.locator('#editor-root [data-map-world]').getAttribute('transform'),viewBefore,'Dragging the label must not pan');assert.deepEqual(moved.map.initial,before.map.initial,'Dragging labels must never paint territory');
 // A second move starts from a known saved anchor and provides an exact inverse
 // transform assertion independent of automatic initial placement.
 const lb=await label.boundingBox(),a={x:lb.x+lb.width/2,y:lb.y+lb.height/2},z={x:a.x+24,y:a.y-12},aLocal=await localPoint(page,a),zLocal=await localPoint(page,z);
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(z.x,z.y,{steps:6});await page.mouse.up();const dragged=await save(page),second=dragged.map.countries.find(c=>c.id===country).labelPosition;
 assert.ok(Math.abs(second[0]-(position[0]+zLocal[0]-aLocal[0]))<.02);assert.ok(Math.abs(second[1]-(position[1]+zLocal[1]-aLocal[1]))<.02);assert.deepEqual(dragged.map.initial,before.map.initial);
 passed('Dragging a country label after zoom and pan saves crop-local coordinates, preserves viewport and does not paint territory');
 const download=await exported(page);assert.deepEqual(JSON.parse(download.text),dragged);await close(page);await page.locator('#scenario-import').setInputFiles({name:'moved-label.map.json',mimeType:'application/json',buffer:Buffer.from(download.text)});await ready(page,'europe-balanced');assert.deepEqual(await save(page),dragged);
 await customCountry(page,country);await page.getByLabel('국명 위치 편집',{exact:true}).check();await page.getByRole('button',{name:'국명 숨기기',exact:true}).click();const hidden=await save(page);assert.equal(hidden.map.countries.find(c=>c.id===country).labelPosition,null);assert.equal(editor(page).locator('[data-map-country-label="'+country+'"]').count?await editor(page).locator('[data-map-country-label="'+country+'"]').count():-1,0);
 await page.getByRole('button',{name:'국명 위치 자동 배치',exact:true}).click();const automatic=await save(page);assert.equal(Object.hasOwn(automatic.map.countries.find(c=>c.id===country)||{},'labelPosition'),false);
 passed('Label coordinates survive JSON export/import; hiding stores explicit null and automatic placement removes the manual override');
 await page.getByRole('button',{name:'＋ 새 국가 추가',exact:true}).click();const newId=await page.getByLabel('편집할 국가',{exact:true}).inputValue();assert.match(newId,/^country_/);await page.getByLabel('표시 이름',{exact:true}).fill('새 국명 배치');await page.getByLabel('빠른 칠하기',{exact:true}).uncheck();await page.getByLabel('국명 위치 편집',{exact:true}).uncheck();const ownable=await page.evaluate(()=>MapTemplates.get('europe-balanced').provinces.find(p=>p.owner==='fra').id);await editor(page).locator('[data-province="'+ownable+'"]').dispatchEvent('click');await page.getByLabel('시작 소유국',{exact:true}).selectOption(newId);await page.getByRole('button',{name:'선택한 국명 위치 지정',exact:true}).click();
 const prior=await save(page),target=await centerOnMap(page,.72,.76),local=await localPoint(page,target);await page.mouse.click(target.x,target.y);const placed=await save(page),newCountry=placed.map.countries.find(c=>c.id===newId);assert.ok(newCountry);assert.ok(Math.abs(newCountry.labelPosition[0]-local[0])<.02,JSON.stringify({expected:local,actual:newCountry.labelPosition,target}));assert.ok(Math.abs(newCountry.labelPosition[1]-local[1])<.02,JSON.stringify({expected:local,actual:newCountry.labelPosition,target}));assert.deepEqual(placed.map.initial,prior.map.initial);assert.equal(await editor(page).locator('[data-map-country-label="'+newId+'"]').count(),1);
 const beforeToggle=await save(page);for(const layer of['influence','occupation']){const c=editor(page).locator('[data-map-layer="'+layer+'"]');await c.setChecked(!await c.isChecked());}await editor(page).locator('[data-map-tool="labels"]').click();assert.deepEqual(await save(page),beforeToggle);assert.deepEqual(await game(page),initialGame);
 passed('A newly added country can gain territory and place a label by clicking the map; display toggles preserve every saved coordinate and territory');
 const invalid=structuredClone(placed);invalid.map.countries.find(c=>c.id===newId).labelPosition=[999999,1];await editor(page).locator('input[type="file"]').setInputFiles({name:'invalid-label.map.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});await page.waitForFunction(()=>document.querySelector('#editor-report')?.textContent.includes('국명'));assert.deepEqual(await save(page),placed);assert.deepEqual(await game(page),initialGame);
 passed('An out-of-range imported label is rejected atomically while the edited map, stored map and active game are preserved');
 await editor(page).locator('[data-map-layer="influence"]').uncheck();await editor(page).locator('[data-map-layer="occupation"]').check();await editor(page).locator('[data-country-editor]').scrollIntoViewIfNeeded();
 await page.locator('#editor-dialog').screenshot({path:path.join(output,'map-workshop-tools-preview.png')});report.screenshot=path.join(output,'map-workshop-tools-preview.png');
 await page.evaluate(()=>{window.__createdWorkshopScenario=null;MapMaker.configure({onCreateScenario:scenario=>{window.__createdWorkshopScenario=scenario;}});});await page.getByRole('button',{name:'이 지도로 시나리오 만들기',exact:true}).click();const scenario=await page.evaluate(()=>__createdWorkshopScenario);assert.deepEqual(scenario.map,placed.map);assert.deepEqual(await game(page),initialGame);passed('Creating a scenario carries the edited colors, ownership and custom label coordinates into the empty scenario');
 return placed;
}
async function offline(browser,document){
 if(process.argv.includes('--web-only')){report.offlineSkipped=true;return;}
 const context=await browser.newContext({viewport:{width:1500,height:1100}}),page=await context.newPage(),requests=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>report.browserErrors.push(e.message));page.on('dialog',d=>d.accept());
 const url='https://map-workshop-offline.test/index.html';await page.route('**/*',route=>{if(route.request().url()===url)return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'standalone.html'))});requests.push(route.request().url());return route.abort();});await page.goto(url);await page.waitForFunction(()=>window.HistoryCrossroads?.getScenario());
 await importDocument(page,document);await customCountry(page,document.map.playerCountry);assert.equal(await page.getByLabel('국가 색상',{exact:true}).getAttribute('type'),'color');await page.getByLabel('국가 색상',{exact:true}).fill('#6b459f');await page.getByLabel('국명 위치 편집',{exact:true}).check();await page.getByRole('button',{name:'선택한 국명 위치 지정',exact:true}).click();const target=await centerOnMap(page);await page.mouse.click(target.x,target.y);const saved=await save(page);assert.ok(saved.map.countries.find(c=>c.id===document.map.playerCountry).labelPosition);await page.getByRole('button',{name:'백지도 만들기',exact:true}).click();await page.getByRole('button',{name:'백지도 만들기 되돌리기',exact:true}).click();assert.deepEqual(await save(page),saved);assert.deepEqual(requests,[]);passed('The generated offline program supports searchable color editing, label placement and reversible blank maps without network requests');await context.close();
}
async function main(){
 fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({channel:'chrome',headless:true});
 try{const context=await browser.newContext({viewport:{width:1500,height:1100}}),page=await context.newPage(),dialogState={reject:false};page.setDefaultTimeout(60000);page.on('pageerror',e=>report.browserErrors.push(e.message));page.on('dialog',async d=>{if(dialogState.reject){dialogState.reject=false;await d.dismiss();}else await d.accept();});
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.origin!==base)return route.abort();const file=path.resolve(root,'.'+u.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:''});return route.fulfill({contentType:{'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'}[path.extname(file)]||'text/plain',body:fs.readFileSync(file)});});
 await page.goto(base+'/index.html?scenario=examples/imjin-world.json');await page.waitForFunction(()=>HistoryCrossroads.getScenario().id==='imjin_crossroads_regional_v22');await page.locator('[data-action="default-name"]').click();await page.locator('[data-choice="0"]').click();const initialGame=await game(page);
 const colored=await searchAndColor(page,initialGame);await blankMaps(page,initialGame,dialogState);const edited=await labelTools(page,colored.document,colored.country,initialGame);await context.close();await offline(browser,edited);assert.deepEqual(report.browserErrors,[]);report.passed=true;
 }finally{fs.writeFileSync(path.join(output,'map-workshop-tools-browser-report.json'),JSON.stringify(report,null,2)+'\n');await browser.close();}
}
main().catch(error=>{report.passed=false;report.failure=error.stack||String(error);fs.mkdirSync(output,{recursive:true});fs.writeFileSync(path.join(output,'map-workshop-tools-browser-report.json'),JSON.stringify(report,null,2)+'\n');console.error(error);process.exitCode=1;});
