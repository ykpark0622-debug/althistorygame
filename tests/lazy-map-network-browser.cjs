'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));
const root=path.resolve(__dirname,'..'),output=path.resolve(root,'../../outputs'),origin='http://lazy-maps.test';
async function routed(browser){
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),requests=[],errors=[],failures=new Set();
 page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.route('**/*',async r=>{
  const url=new URL(r.request().url());if(url.origin!==origin)return r.abort();
  if(url.pathname.startsWith('/assets/maps/')){requests.push(url.pathname);if(failures.has(url.pathname))return r.fulfill({status:503,body:'temporary failure'});}
  if(url.pathname.startsWith('/_vercel/'))return r.fulfill({contentType:'text/javascript',body:''});
  const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return r.fulfill({status:404,body:''});
  const types={'.js':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html'};
  return r.fulfill({contentType:types[path.extname(file)]||'text/plain',body:fs.readFileSync(file)});
 });
 return {page,requests,errors,failures};
}
async function main(){
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const {page,requests,errors,failures}=await routed(browser);
  await page.goto(origin+'/index.html?home=1');await page.evaluate(()=>HistoryCrossroads.ready);
  assert.equal(requests.length,0);assert.equal(await page.evaluate(()=>MapTemplates.get('world-detailed')),null);
  await page.locator('#map-maker-button').click();await page.getByLabel('지도 제목',{exact:true}).waitFor();
  const east=await page.evaluate(()=>MapTemplates.assetInfo('regional_eastasia_1592'));
  assert.deepEqual(requests.slice().sort(),east.files.map(p=>'/'+p).sort());
  assert.equal(await page.evaluate(()=>MapTemplates.isLoaded('world-detailed')),false);
  await page.getByLabel('지도 제목',{exact:true}).fill('지역별 로딩 검사 지도');
  const province=await page.evaluate(()=>MapTemplates.get('regional_eastasia_1592').provinces.find(p=>p.owner==='japan').id);
  await page.locator(`[data-province="${province}"]`).dispatchEvent('click');
  await page.getByLabel('시작 소유국',{exact:true}).selectOption('joseon');
  await page.getByLabel('② 시대 기본안',{exact:true}).selectOption('1754');
  const count=requests.length;await page.getByRole('button',{name:'③ 이 설정으로 지도 준비',exact:true}).click();
  await page.waitForFunction(()=>MapTemplates.isLoaded('regional_eastasia_1754'));
  await page.getByRole('button',{name:'지도 저장',exact:true}).click();
  const edited=await page.evaluate(()=>MapMaker.getStored());
  assert.equal(edited.map.templateId,'regional_eastasia_1754');assert.equal(edited.map.initial.owners[province],'joseon');
  assert.equal(requests.length,count+1,'Changing era downloads only the era patch');
  const beforeAgain=requests.length;
  await page.evaluate(()=>MapTemplates.ensure('regional_eastasia_1592'));assert.equal(requests.length,beforeAgain);
  console.log('PASS blank home requests zero maps; East Asia requests only its base+era; era changes reuse geometry and preserve edits');

  const europe=await page.evaluate(()=>MapTemplates.assetInfo('regional_europe_med_1754'));
  const europeParts=europe.files.filter(file=>file.endsWith('.txt'));
  assert.ok(europeParts.length>=3,'Europe geometry is split into small web-upload pieces');
  const failedPart=europeParts[Math.floor(europeParts.length/2)];
  failures.add('/'+failedPart);
  await page.getByLabel('① 사용할 지역 지도',{exact:true}).selectOption('europe_med');
  await page.getByRole('button',{name:'③ 이 설정으로 지도 준비',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#editor-report')?.textContent.includes('불러오'));
  assert.deepEqual(await page.evaluate(()=>MapMaker.getStored()),edited);
  assert.equal(await page.getByLabel('지도 제목',{exact:true}).inputValue(),edited.title);
  assert.equal(await page.evaluate(()=>MapTemplates.isLoaded('regional_europe_med_1754')),false);
  assert.ok(requests.includes('/'+failedPart),'failure exercises a middle geometry piece');
  failures.clear();await page.getByRole('button',{name:'③ 이 설정으로 지도 준비',exact:true}).click();
  await page.waitForFunction(()=>MapTemplates.isLoaded('regional_europe_med_1754'));
  await page.getByRole('button',{name:'지도 저장',exact:true}).click();
  assert.equal((await page.evaluate(()=>MapMaker.getStored())).map.templateId,'regional_europe_med_1754');
  assert.ok(!requests.some(p=>p.includes('world-detailed')));
  await page.screenshot({path:path.join(output,'v24-lazy-map-maker.png')});
  assert.deepEqual(errors,[]);await page.close();
  console.log('PASS a failed continent load keeps the current draft and saved map; retry loads Europe without requesting the world');

  const game=await routed(browser),p=game.page;
  await p.goto(origin+'/index.html?scenario=examples/imjin-world.json');
  await p.waitForFunction(()=>HistoryCrossroads.getState());
  await p.locator('[data-action="default-name"]').click();await p.locator('[data-choice="0"]').click();
  const state=await p.evaluate(()=>HistoryCrossroads.getState()),saved=await p.evaluate(()=>localStorage.getItem('history-crossroads:web:v1:autosave'));
  const gameAssets=await p.evaluate(()=>MapTemplates.assetInfo('regional_eastasia_1592').files);
  assert.deepEqual(game.requests.slice().sort(),gameAssets.map(file=>'/'+file).sort());
  assert.ok(!game.requests.some(url=>url.includes('world-detailed')));
  const beforeHome=game.requests.length;
  await p.locator('#home-link').click();await p.waitForURL(url=>url.searchParams.get('home')==='1');await p.evaluate(()=>HistoryCrossroads.ready);
  assert.equal(game.requests.length,beforeHome,'Home with a saved mapped game does not fetch geometry');
  assert.equal(await p.evaluate(()=>localStorage.getItem('history-crossroads:web:v1:autosave')),saved);
  await p.locator('#resume-scenario-link').click();await p.waitForFunction(()=>HistoryCrossroads.getState()?.history.length===1);
  assert.deepEqual(await p.evaluate(()=>HistoryCrossroads.getState()),state);assert.deepEqual(game.errors,[]);await p.close();
  console.log('PASS scenario URL loads only East Asia and home/resume preserves the exact verified save without a home map download');

  const offline=await browser.newPage({viewport:{width:1440,height:1000}}),offlineRequests=[],offlineErrors=[];
  offline.on('pageerror',e=>offlineErrors.push(e.message));
  await offline.route('**/*',async r=>{
   if(r.request().url()==='http://offline-maps.test/index.html')return r.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'standalone.html'))});
   offlineRequests.push(r.request().url());return r.abort();
  });
  await offline.goto('http://offline-maps.test/index.html');await offline.evaluate(()=>HistoryCrossroads.ready);
  await offline.evaluate(()=>MapMaker.startNew());await offline.getByLabel('지도 제목',{exact:true}).waitFor();
  await offline.getByLabel('① 사용할 지역 지도',{exact:true}).selectOption('europe_med');
  await offline.getByRole('button',{name:'③ 이 설정으로 지도 준비',exact:true}).click();
  await offline.getByRole('button',{name:'지도 저장',exact:true}).click();
  assert.equal((await offline.evaluate(()=>MapMaker.getStored())).map.templateId,'regional_europe_med_1754');
  assert.equal(offlineRequests.length,0);assert.deepEqual(offlineErrors,[]);await offline.close();
  console.log('PASS single-file offline version edits East Asia and Europe with zero asset/network requests');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
