'use strict';
// End-to-end web-upload packaging check. Every request is fulfilled from this
// release directory; no live GitHub, Supabase, analytics or hosting is used.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const {chromium}=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));
const root=path.resolve(__dirname,'..'),origin='https://web-upload.test';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function fixture(){return {schemaVersion:1,id:'web_upload_private',title:'웹업로드개인원고검사',subtitle:'개인원고부제',description:'개인원고설명',start:'first',stats:[{id:'trust',name:'신뢰',initial:50,min:0,max:100}],flags:[],events:[{id:'first',title:'개인첫사건',body:'{name}, 개인원고본문입니다.',next:'second',choices:[{text:'검사용 선택',effects:{trust:5}}]},{id:'second',title:'개인다음사건',body:'개인둘째본문입니다.',next:'END',choices:[{text:'이야기 종료',effects:{}}]}],endings:[{id:'end',title:'개인결말',body:'개인결말본문입니다.',kind:'mixed',priority:0,immediate:false,when:[]}],defaultEnding:'end'};}
async function routed(browser,body){
 const page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true}),requests=[],errors=[],failures=new Set();
 // Inspect the exact download Blob in Chromium without depending on desktop
 // download policies or a user-visible file picker in the test environment.
 await page.addInitScript(()=>{
  const blobs=new Map(),create=URL.createObjectURL.bind(URL),click=HTMLAnchorElement.prototype.click;
  globalThis.__downloadBlobs=[];
  URL.createObjectURL=blob=>{const url=create(blob);blobs.set(url,blob);return url;};
  HTMLAnchorElement.prototype.click=function(){
   const blob=blobs.get(this.href);if(this.download&&blob){const name=this.download;blob.text().then(text=>globalThis.__downloadBlobs.push({name,text}));return;}
   return click.call(this);
  };
 });
 page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());requests.push(url.pathname);
  if(url.origin!==origin)return route.abort();
  if(failures.has(url.pathname))return route.fulfill({status:503,body:'temporary failure'});
  if(body&&url.pathname==='/offline.html')return route.fulfill({contentType:'text/html',body});
  if(body)return route.abort();
  if(url.pathname==='/standalone.html'&&fs.existsSync(path.join(root,'standalone-web.html')))return route.fulfill({contentType:'text/html',body:fs.readFileSync(path.join(root,'standalone-web.html'))});
  if(url.pathname.startsWith('/_vercel/'))return route.fulfill({contentType:'text/javascript',body:''});
  const file=path.resolve(root,'.'+url.pathname);
  if(!file.startsWith(root+path.sep)||!fs.existsSync(file))return route.fulfill({status:404,body:''});
  const types={'.js':'text/javascript','.json':'application/json','.css':'text/css','.html':'text/html','.txt':'text/plain'};
  return route.fulfill({contentType:types[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
 });
 return {page,requests,errors,failures};
}
async function main(){
 const wrapper=fs.readFileSync(path.join(root,fs.existsSync(path.join(root,'standalone-web.html'))?'standalone-web.html':'standalone.html'),'utf8');
 const encoded=wrapper.match(/<script\b[^>]*id=["']program-download-manifest["'][^>]*>([\s\S]*?)<\/script\s*>/i);
 assert.ok(encoded,'hosted standalone entry is a small download wrapper');
 const descriptor=JSON.parse(encoded[1]);
 assert.ok(Buffer.byteLength(wrapper)<2*1024*1024);
 const source=Buffer.concat(descriptor.files.map(file=>{const bytes=fs.readFileSync(path.join(root,file.path));assert.equal(bytes.length,file.bytes);assert.ok(bytes.length<=1024*1024);assert.equal(sha(bytes),file.sha256);return bytes;}));
 assert.equal(source.length,descriptor.bytes);assert.equal(sha(source),descriptor.sha256);
 for(const marker of ['map-templates-script','map-view-script','engine-script','app-script','standalone-styles'])assert.ok(source.includes(Buffer.from('id="'+marker+'"')));
 console.log('PASS web entry and each program piece are small; reconstruction matches the complete offline program byte for byte');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const direct=await routed(browser);
  await direct.page.goto(origin+'/standalone.html');await direct.page.waitForFunction(()=>globalThis.__downloadBlobs.length===1);
  const directSha=await direct.page.evaluate(async()=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(globalThis.__downloadBlobs[0].text))),value=>value.toString(16).padStart(2,'0')).join(''));
  assert.equal(directSha,descriptor.sha256);
  assert.deepEqual(direct.errors,[]);await direct.page.close();
  console.log('PASS direct standalone link downloads the complete original offline HTML');
  const {page,requests,errors,failures}=await routed(browser);
  await page.goto(origin+'/index.html?home=1');await page.evaluate(()=>HistoryCrossroads.ready);
  assert.equal(requests.filter(file=>file.startsWith('/assets/maps/')||file.startsWith('/assets/program/')).length,0);
  await page.evaluate(source=>HistoryCrossroads.importScenario(source),fixture());
  await page.locator('[data-action="default-name"]').click();await page.locator('[data-choice="0"]').click();
  const state=await page.evaluate(()=>HistoryCrossroads.getState()),story=await page.evaluate(()=>HistoryCrossroads.getScenario());
  await page.locator('#help-button').click();
  const middle=descriptor.files[Math.floor(descriptor.files.length/2)].path;failures.add('/'+middle);
  await page.locator('#download-html').click();
  await page.waitForFunction(()=>!document.getElementById('status-message').hidden&&document.getElementById('status-message').textContent.includes('프로그램'));
  assert.deepEqual(await page.evaluate(()=>HistoryCrossroads.getState()),state);
  assert.deepEqual(await page.evaluate(()=>HistoryCrossroads.getScenario()),story);
  assert.equal(await page.evaluate(()=>globalThis.__downloadBlobs.length),0);
  failures.clear();await page.locator('#download-html').click();await page.waitForFunction(()=>globalThis.__downloadBlobs.length===1);
  const downloaded=await page.evaluate(()=>globalThis.__downloadBlobs[0]);
  assert.equal(downloaded.name,'history-crossroads-player.html');
  const html=downloaded.text;
  for(const marker of ['웹업로드개인원고검사','개인원고부제','개인원고본문입니다','개인결말본문입니다'])assert.equal(html.includes(marker),false,marker);
  assert.ok(html.includes('map-templates-script'));assert.equal(/<script\b[^>]*id=["']program-download-manifest["']/.test(html),false);
  assert.deepEqual(await page.evaluate(()=>HistoryCrossroads.getState()),state);
  assert.deepEqual(await page.evaluate(()=>HistoryCrossroads.getScenario()),story);
  assert.ok(requests.includes('/'+middle));assert.deepEqual(errors,[]);await page.close();
  console.log('PASS missing program piece preserves private manuscript/progress; retry downloads a clean standalone HTML');

  const offline=await routed(browser,html),p=offline.page;
  await p.goto(origin+'/offline.html');await p.evaluate(()=>HistoryCrossroads.ready);
  assert.equal(await p.evaluate(()=>HistoryCrossroads.getScenario().draft),true);
  await p.evaluate(()=>MapMaker.startNew());await p.getByRole('button',{name:'지도 설정',exact:true}).click();await p.getByLabel('지도 제목',{exact:true}).waitFor();
  await p.getByLabel('① 사용할 지역 지도',{exact:true}).selectOption('europe_med');
  await p.getByRole('button',{name:'③ 이 설정으로 지도 준비',exact:true}).click();
  await p.getByRole('button',{name:'지도 저장',exact:true}).click();
  assert.equal((await p.evaluate(()=>MapMaker.getStored())).map.templateId,'europe-balanced');
  await p.getByLabel('② 시대 기본안',{exact:true}).selectOption('1754');
  await p.getByRole('button',{name:'③ 이 설정으로 지도 준비',exact:true}).click();
  await p.getByRole('button',{name:'지도 저장',exact:true}).click();
  assert.equal((await p.evaluate(()=>MapMaker.getStored())).map.templateId,'regional_europe_med_1754');
  await p.getByLabel('① 사용할 지역 지도',{exact:true}).selectOption('south_america');
  await p.getByRole('button',{name:'③ 이 설정으로 지도 준비',exact:true}).click();
  await p.getByRole('button',{name:'지도 저장',exact:true}).click();
  assert.equal((await p.evaluate(()=>MapMaker.getStored())).map.templateId,'regional_south_america_1754');
  assert.deepEqual(offline.requests,['/offline.html']);assert.deepEqual(offline.errors,[]);await p.close();
  console.log('PASS downloaded program opens blank and edits Europe/South America entirely offline');
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
