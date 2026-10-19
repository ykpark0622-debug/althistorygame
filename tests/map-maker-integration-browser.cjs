'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {chromium}=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));
const base=process.env.GAME_TEST_URL||'http://history-crossroads.test';
const output=path.resolve(__dirname,'../../../outputs');
async function captureGeneratedDownload(page){
 // This Windows automation environment denies Chrome filesystem downloads:
 // even a standalone seven-byte Blob reports "실패 - 권한 부족" in chrome://downloads.
 // Inspect the actual app's generated download Blob and filename instead. This
 // checks export generation/round trips, not browser filesystem save behavior.
 await page.evaluate(()=>{
  if(!window.__hcCaptureInstalled){
   window.__hcCaptureInstalled=true;const blobs=new Map(),create=URL.createObjectURL.bind(URL),click=HTMLAnchorElement.prototype.click;
   URL.createObjectURL=blob=>{const url=create(blob);blobs.set(url,blob);return url;};
   // The existing program exporter clicks a detached anchor; listening only on
   // document would miss that supported DOM path.
   HTMLAnchorElement.prototype.click=function(){
    if(!this.hasAttribute('download'))return click.call(this);
    window.__hcGeneratedDownloads.push({name:this.download,blob:blobs.get(this.href)});
   };
  }
  window.__hcGeneratedDownloads=[];
 });
}
async function main(){
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1500,height:1100}}),errors=[],dialogs=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',async d=>{dialogs.push(d.message());await d.accept();});
  // Serve the actual release assets in-browser. This also keeps system proxy/
  // ad-blocker injected scripts outside a deterministic application test.
  await page.route('**/*',async r=>{
   const url=new URL(r.request().url());if(url.origin!==base)return r.abort();
   if(process.env.GAME_TEST_URL)return r.continue();
   const file=path.resolve(__dirname,'..','.'+url.pathname),root=path.resolve(__dirname,'..');
   if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return r.fulfill({status:404,body:''});
   const types={'.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json'};
   return r.fulfill({contentType:types[path.extname(file)]||'text/plain',body:fs.readFileSync(file)});
  });
  await page.goto(base+'/index.html?scenario=examples/imjin-world.json');
  await page.waitForFunction(()=>HistoryCrossroads.getScenario().id==='imjin_crossroads_regional_v22');
  await page.locator('[data-action="default-name"]').click();
  await page.locator('[data-choice="0"]').click();
  const game=await page.evaluate(()=>({scenario:HistoryCrossroads.getScenario(),state:HistoryCrossroads.getState(),saved:localStorage.getItem('history-crossroads:web:v1:scenario'),auto:localStorage.getItem('history-crossroads:web:v1:autosave')}));
  await page.locator('#map-maker-button').click();
  assert.equal(await page.locator('#editor-dialog.map-maker-mode[open]').count(),1);
  assert.equal(await page.locator('#editor-root .editor-nav').count(),0);
  await page.getByLabel('지도 제목',{exact:true}).fill('브라우저통합검사지도_비공개');
  const province=await page.evaluate(()=>MapTemplates.get('regional_eastasia_1592').provinces.find(p=>p.owner==='japan').id);
  await page.locator(`#editor-root [data-province="${province}"]`).dispatchEvent('click');
  await page.getByLabel('시작 소유국',{exact:true}).selectOption('joseon');
  await page.getByRole('button',{name:'지도 저장',exact:true}).click();
  const map=await page.evaluate(()=>MapMaker.getStored());
  assert.equal(map.map.initial.owners[province],'joseon');
  assert.deepEqual(await page.evaluate(()=>HistoryCrossroads.getState()),game.state);
  assert.equal(await page.evaluate(()=>localStorage.getItem('history-crossroads:web:v1:scenario')),game.saved);
  assert.equal(await page.evaluate(()=>localStorage.getItem('history-crossroads:web:v1:autosave')),game.auto);
  assert.equal(await page.locator('#editor-root circle').count(),0);
  await page.screenshot({path:path.join(output,'v23-map-maker.png'),fullPage:true});
  console.log('PASS full application map edits preserve the exact Imjin game and progress; no circles or story tabs');

  await captureGeneratedDownload(page);
  await page.getByRole('button',{name:'지도 JSON 내보내기',exact:true}).click();
  const generatedMap=await page.evaluate(async()=>({name:__hcGeneratedDownloads[0].name,text:await __hcGeneratedDownloads[0].blob.text()}));
  assert.match(generatedMap.name,/\.map\.json$/);
  assert.deepEqual(JSON.parse(generatedMap.text),map);
  await page.getByRole('button',{name:'닫기',exact:true}).last().click();
  await page.reload();await page.waitForFunction(()=>HistoryCrossroads.getState()?.history.length===1);
  await page.locator('#map-maker-button').click();assert.equal(await page.getByLabel('지도 제목',{exact:true}).inputValue(),map.title);
  await page.getByRole('button',{name:'닫기',exact:true}).last().click();
  const changed={...map,title:'지도파일로열기검사'};
  await page.locator('#scenario-import').setInputFiles({name:'standalone-map.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(changed))});
  await page.getByLabel('지도 제목',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('지도 제목',{exact:true}).inputValue(),changed.title);
  assert.deepEqual(await page.evaluate(()=>HistoryCrossroads.getState()),game.state);
  console.log('PASS actual application map JSON Blob generation and file import round-trip without replacing the story');

  await page.getByLabel('지도 제목',{exact:true}).fill('새이야기바탕지도');
  const oldDialogs=dialogs.length;
  await page.getByRole('button',{name:'이 지도로 시나리오 만들기',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('#editor-dialog').classList.contains('map-maker-mode'));
  const draft=await page.evaluate(()=>HistoryCrossroads.getScenario());
  assert.equal(draft.draft,true);assert.equal(draft.title,'새이야기바탕지도');assert.equal(draft.events.length,0);assert.equal(draft.endings.length,0);
  assert.equal(draft.map.initial.owners[province],'joseon');assert.equal(dialogs.length,oldDialogs,'Explicit create must save and close without an extra discard confirmation');
  assert.ok(await page.getByRole('button',{name:'사건·선택지',exact:true}).isVisible());
  assert.ok(!new URL(page.url()).searchParams.has('scenario'));
  console.log('PASS explicit create switches to a new empty story with the edited map and no extra discard prompt');

  await page.getByRole('button',{name:'닫기',exact:true}).last().click();
  await page.evaluate(({game,map})=>{
   localStorage.setItem('history-crossroads:web:v1:scenario',game.saved);localStorage.setItem('history-crossroads:web:v1:autosave',game.auto);
   sessionStorage.setItem('hc:pendingMapImport',JSON.stringify({id:'11111111-1111-4111-8111-111111111111',title:map.title,data:map}));
  },{game,map});
  await page.goto(base+'/index.html?mapMaker=1');
  await page.getByLabel('지도 제목',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('지도 제목',{exact:true}).inputValue(),map.title);
  assert.deepEqual(await page.evaluate(()=>HistoryCrossroads.getState()),game.state);
  assert.equal(await page.evaluate(()=>sessionStorage.getItem('hc:pendingMapImport')),null);
  assert.ok(!new URL(page.url()).searchParams.has('mapMaker'));
  await page.getByRole('button',{name:'닫기',exact:true}).last().click();
  console.log('PASS gallery handoff opens a map while retaining the saved game and consumes only its own import envelope');

  await page.locator('#help-button').click();
  await captureGeneratedDownload(page);await page.locator('#download-html').click();
  await page.waitForFunction(()=>__hcGeneratedDownloads.length>0);
  const programText=await page.evaluate(async()=>__hcGeneratedDownloads[0].blob.text());
  assert.ok(programText.includes('id="map-maker-script"'));assert.ok(programText.includes('id="map-document-script"'));
  assert.ok(!programText.includes('브라우저통합검사지도_비공개'));assert.ok(!programText.includes('지도파일로열기검사'));
  assert.deepEqual(await page.evaluate(()=>HistoryCrossroads.getState()),game.state);
  assert.deepEqual(errors,[]);
  console.log('PASS blank program export Blob includes offline map tools and excludes personal maps; runtime errors 0');
  console.log('NOTE Browser filesystem download saving was not verified: this automation environment denies even minimal Blob downloads with insufficient permissions.');
 }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
