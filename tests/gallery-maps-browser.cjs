'use strict';
// Routes every resource and Supabase call locally. Never connects to a real project.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));
const root=path.resolve(__dirname,'..');
require(path.join(root,'map-templates.js'));const E=require(path.join(root,'engine.js'));globalThis.GameEngine=E;
require(path.join(root,'map-document.js'));
const map=MapDocument.create({templateId:'eastasia1419',title:'나의 1419년 지도'});
const story=JSON.parse(fs.readFileSync(path.join(root,'examples/chronicle-sejong.json'),'utf8'));
const id=index=>'00000000-0000-4000-8000-'+String(index).padStart(12,'0');
function mockBackend(input){
  window.__queries=[];window.__writes=[];window.__rpcs=[];window.__missingColumn=false;
  const user={id:'me',email:'test@example.invalid',is_anonymous:false,user_metadata:{full_name:'시험 제작자'}};
  const records=input.records;
  localStorage.setItem('hc:workingMap:v1',JSON.stringify(input.map));
  const client={auth:{async getSession(){return {data:{session:{user}}};},onAuthStateChange(){},async signInAnonymously(){return {data:{user}};}},async rpc(name,args){window.__rpcs.push({name,args});return {data:false,error:null};},from(table){
    let rows=table==='scenarios'?records.slice():[],one=false,filters=[],orders=[],from=0,to=10000,payload=null,operation='select';
    const query={select(){return query;},eq(field,value){filters.push([field,value]);if(field==='likes.user_id')return query;rows=rows.filter(item=>item[field]===value);return query;},in(field,values){rows=rows.filter(item=>values.includes(item[field]));return query;},or(expression){if(expression.startsWith('status.eq.'))rows=rows.filter(item=>item.status==='hidden'||item.report_count>0);return query;},contains(field,values){rows=rows.filter(item=>values.every(value=>item[field].includes(value)));return query;},order(field,options){orders.push([field,options.ascending]);return query;},range(a,b){from=a;to=b+1;return query;},single(){one=true;return query;},maybeSingle(){one=true;return query;},insert(value){operation='insert';payload=value;return query;},update(value){operation='update';payload=value;return query;},delete(){operation='delete';return query;},then(resolve){
      window.__queries.push({table,operation,filters});
      if(window.__missingColumn&&table==='scenarios')return Promise.resolve({data:null,error:{message:'column scenarios.content_kind does not exist'}}).then(resolve);
      if(operation==='insert'){
        window.__writes.push({table,operation,payload});
        if(table==='scenarios'){const row={...records[0],...payload,id:input.nextId,content_kind:payload.data.type==='map'?'map':'scenario',map_template_id:payload.data.map?.templateId};records.unshift(row);rows=[row];}
      }else if(operation==='update'){window.__writes.push({table,operation,payload,filters});rows.forEach(row=>Object.assign(row,payload));}
      rows.sort((a,b)=>{for(const [field,asc]of orders)if(a[field]!==b[field])return(a[field]>b[field]?1:-1)*(asc?1:-1);return 0;});
      return Promise.resolve({data:one?(rows[0]||null):rows.slice(from,to),count:rows.length,error:null}).then(resolve);
    }};return query;
  }};
  window.supabase={createClient:()=>client};
}
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const page=await browser.newPage({viewport:{width:1280,height:960}}),errors=[],mapRequests=[];
  page.on('pageerror',error=>errors.push(String(error)));
  const records=Array.from({length:60},(_,i)=>({id:id(i+1),author_id:'me',author_name:'시험 제작자',title:(i%2?'지도 ':'시나리오 ')+i,subtitle:'',summary:'지역과 시대를 편집한 시험 작품',tags:['시험'],event_count:i%2?0:6,ending_count:i%2?0:3,like_count:i,play_count:0,report_count:0,status:'public',created_at:'2026-10-19T00:00:00Z',updated_at:'2026-10-19T00:00:00Z',content_kind:i%2?'map':'scenario',schema_version:i%2?1:story.schemaVersion,mode:i%2?'map':'chronicle',map_template_id:i%2?map.map.templateId:story.map?.templateId,data:i%2?map:story}));
  await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname.startsWith('/assets/maps/'))mapRequests.push(url.pathname);
    if(url.origin!=='https://gallery.test')return route.abort();
    if(url.pathname==='/config.js')return route.fulfill({contentType:'application/javascript',body:'window.HC_COMMUNITY={supabaseUrl:"https://mock.invalid",supabaseKey:"public-test"};'});
    if(url.pathname==='/vendor/supabase.js')return route.fulfill({contentType:'application/javascript',body:'('+mockBackend.toString()+')('+JSON.stringify({records,map,nextId:id(900)})+');'});
    if(url.pathname==='/index.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><body>지도 편집기로 이동</body></html>'});
    if(url.pathname.startsWith('/_vercel/'))return route.fulfill({contentType:'application/javascript',body:''});
    const file=path.join(root,url.pathname.slice(1));
    if(!fs.existsSync(file))return route.fulfill({status:404,body:'missing'});
    const type=file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html';
    return route.fulfill({contentType:type,body:fs.readFileSync(file)});
  });
  try{
    await page.goto('https://gallery.test/gallery.html?kind=map');
    await page.waitForFunction(()=>document.querySelectorAll('.g-card').length===24);
    assert.equal(await page.locator('#gallery-title').textContent(),'지도 갤러리');
    assert.equal(await page.locator('.g-card .play-count').count(),0);
    assert.equal(await page.locator('.g-card').filter({hasText:'사건 0'}).count(),0);
    assert.equal(await page.locator('.g-card [data-act=play]').first().textContent(),'지도 편집하기');
    await page.locator('#more-button').click();await page.waitForFunction(()=>document.querySelectorAll('.g-card').length===30);
    assert.deepEqual(mapRequests,[],'gallery listing and pagination must not request geometry');
    console.log('ok map-only gallery cards, metadata and server pagination');
    await page.locator('.g-card [data-act=open]').first().click();
    await page.locator('#gallery-map-preview .province-map').waitFor();
    assert.equal(mapRequests.length,1);assert.match(mapRequests[0],/eastasia1419\./);
    await page.screenshot({path:path.resolve(root,'../../outputs/v24-map-gallery.png')});
    assert.equal(await page.locator('#detail-content dt').filter({hasText:'사건'}).count(),0);
    assert.ok(new URL(page.url()).searchParams.get('kind')==='map');
    await page.getByRole('button',{name:'닫기',exact:true}).click();
    console.log('ok map detail preview, link kind and map-only actions');
    await page.locator('#upload-button').click();
    await page.locator('#up-title').fill('공유한 시험 지도');
    await page.locator('#up-consent').check();
    await page.locator('#upload-form button[type=submit]').click();
    await page.getByRole('heading',{name:'올렸습니다!'}).waitFor();
    const writes=await page.evaluate(()=>window.__writes);
    assert.equal(writes.length,1);assert.equal(writes[0].payload.data.type,'map');assert.equal(writes[0].payload.data.events,undefined);
    assert.equal(writes[0].payload.content_kind,undefined,'server must derive kind');
    await page.getByRole('button',{name:'갤러리에서 보기'}).click();await page.locator('#gallery-map-preview .province-map').waitFor();
    await page.getByRole('button',{name:'닫기',exact:true}).click();
    console.log('ok compact map upload through existing auth and content table, mock only');
    await page.locator('#upload-button').click();
    await page.locator('input[name="up-source"][value="file"]').check();
    await page.locator('#upload-file').setInputFiles({name:'scenario.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(story))});
    await page.getByText('지도 전용 JSON이 아닙니다.',{exact:false}).waitFor();
    await page.locator('#up-title').fill('잘못 고른 파일');await page.locator('#up-consent').check();
    await page.locator('#upload-form button[type=submit]').click();
    assert.match(await page.locator('#upload-error').textContent(),/지도 전용 JSON이 아닙니다/);
    assert.equal(await page.evaluate(()=>window.__writes.length),1);
    await page.getByRole('button',{name:'취소',exact:true}).click();
    console.log('ok scenario JSON is refused in map upload before writing');
    await page.locator('#kind-select').selectOption('scenario');
    await page.waitForFunction(()=>document.querySelector('#gallery-title').textContent==='시나리오 갤러리'&&document.querySelectorAll('.g-card').length===24);
    assert.equal(await page.locator('.g-card').filter({hasText:'지도 편집하기'}).count(),0);
    assert.equal(await page.locator('.g-card .play-count').count(),24);
    await page.locator('#kind-select').selectOption('map');await page.waitForFunction(()=>document.querySelectorAll('.g-card').length===24&&document.querySelector('.g-card [data-act=play]').textContent==='지도 편집하기');
    const selected=await page.locator('.g-card [data-act=play]').first().getAttribute('data-id');
    await page.locator('.g-card [data-act=play]').first().click();await page.waitForURL('**/index.html?mapMaker=1');
    const imported=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('hc:pendingMapImport')));
    assert.equal(imported.id,selected);assert.equal(imported.data.type,'map');
    assert.equal(await page.evaluate(()=>sessionStorage.getItem('hc:pendingImport')),null);
    console.log('ok map/scenario isolation and map-maker import without starting a game');
    await page.goto('https://gallery.test/gallery.html?kind=map');await page.waitForFunction(()=>document.querySelectorAll('.g-card').length===24);
    await page.evaluate(()=>window.__missingColumn=true);await page.locator('#sort-select').selectOption('recent');
    await page.getByText('지도 공유를 위한 갤러리 업데이트가 필요합니다.',{exact:false}).waitFor();
    assert.match(await page.locator('#card-grid').textContent(),/migrate-v2\.3-maps\.sql/);
    assert.deepEqual(errors,[]);
    console.log('ok missing migration has actionable message; page errors 0');
    console.log('Passed 6 mocked map gallery browser checks. No production requests or writes.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
