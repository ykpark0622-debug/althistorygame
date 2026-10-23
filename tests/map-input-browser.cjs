'use strict';
// Renderer controls in actual Chrome, with local code and geometry only.
// The fixture isolates camera and pointer behavior from editor/server state.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));
const root=path.resolve(__dirname,'..');
const checks=[];
function pass(name){checks.push(name);console.log('PASS '+name);}
async function fixture(browser,controlledClock=false){
 const page=await browser.newPage({viewport:{width:1200,height:1000}});page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<style>'+fs.readFileSync(path.join(root,'map-view.css'),'utf8')+'</style><input id="typing"><button id="outside">Outside map</button><div id="map" style="width:1000px"></div><div id="second" style="width:500px"></div>');
 if(controlledClock)await page.evaluate(()=>{let serial=0;window.__frames=new Map();window.requestAnimationFrame=callback=>{const id=++serial;__frames.set(id,callback);return id;};window.cancelAnimationFrame=id=>__frames.delete(id);window.__tick=time=>{const queued=[...__frames.values()];__frames.clear();queued.forEach(callback=>callback(time));};});
 await page.evaluate(()=>{
  window.fixture={id:'fixture',name:'Input fixture',width:1000,height:500,countries:[{id:'one',name:'One',color:'#336699',focusBounds:[0,0,1000,500]},{id:'two',name:'Two',color:'#998833'}],provinces:[0,1,2,3].map(i=>({id:'p'+i,name:'P'+i,owner:'one',path:'M'+i*250+' 0h250v500h-250Z',cx:i*250+125,cy:250,bbox:[i*250,0,i*250+250,500]}))};
  window.MapTemplates={get:()=>fixture};window.scenario={id:'test',map:{templateId:'fixture',countries:[],playerCountry:'one',initial:{}}};
  window.calls=[];window.clicks=[];window.labelMoves=[];window.options={onProvinceStroke:(ids,meta)=>calls.push({ids,...meta}),onProvince:id=>clicks.push(id),onLabelMove:(id,position)=>labelMoves.push({id,position})};
  window.holder=document.querySelector('#map');
 });
 await page.addScriptTag({content:fs.readFileSync(path.join(root,'map-view.js'),'utf8')});
 await page.evaluate(()=>{window.state=MapView.initialState(scenario);window.beforeData=JSON.stringify({scenario,state,fixture});MapView.render(holder,scenario,state,options);});
 return {page,errors};
}
const camera=page=>page.evaluate(()=>MapView.getCamera(holder));
async function reset(page,extra={}){await page.evaluate(extra=>{MapView.dispose(holder);MapView.render(holder,scenario,state,{...options,...extra,initialCamera:{templateId:'fixture',scale:2,x:-400,y:-150}});},extra);}
async function main(){
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const {page,errors}=await fixture(browser);
  await reset(page);const before=await camera(page);await page.locator('#map [data-map-tool="keyboard"]').focus();await page.keyboard.down('KeyD');await page.waitForFunction(x=>MapView.getCamera(holder).x<x,before.x);await page.keyboard.up('KeyD');const moved=await camera(page);await page.waitForTimeout(90);assert.deepEqual(await camera(page),moved);
  pass('Focused native keyboard control moves the camera and key release stops it');
  await page.locator('#typing').focus();await page.keyboard.down('KeyA');await page.waitForTimeout(80);await page.keyboard.up('KeyA');assert.deepEqual(await camera(page),moved);
  await page.locator('#map svg').focus();await page.locator('#map svg').dispatchEvent('keydown',{key:'Process',code:'KeyA',isComposing:true,keyCode:229});await page.keyboard.down('Control');await page.keyboard.down('KeyA');await page.waitForTimeout(70);await page.keyboard.up('KeyA');await page.keyboard.up('Control');assert.deepEqual(await camera(page),moved);
  pass('Text input, IME composition and modified shortcuts leave the camera unchanged');
  await reset(page,{interactionMode:'paint',paintColor:'#ff0000',selectedProvinces:['p3']});
  const pts=await page.evaluate(()=>[...holder.querySelectorAll('[data-province]')].map(n=>{const r=n.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,id:n.dataset.province};}).filter(p=>p.x>40&&p.x<900));assert.ok(pts.length>=2);
  const strokeCamera=await camera(page);await page.mouse.move(pts[0].x,pts[0].y);await page.mouse.down();await page.mouse.move(pts[1].x,pts[1].y,{steps:15});await page.mouse.move(pts[0].x,pts[0].y,{steps:15});await page.mouse.up();const paint=await page.evaluate(()=>calls[0]);assert.equal(paint.mode,'paint');assert.ok(paint.ids.length>=2);assert.equal(new Set(paint.ids).size,paint.ids.length);assert.equal(await page.evaluate(()=>calls.length),1);assert.equal(await page.evaluate(()=>clicks.length),0);assert.deepEqual(await camera(page),strokeCamera);
  pass('One paint gesture commits each crossed region once, without extra inspect clicks or camera panning');
  await page.mouse.move(pts[0].x,pts[0].y);await page.mouse.down();assert.ok(await page.locator('#map .map-stroke-preview').count());await page.locator('#map svg').dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();assert.equal(await page.evaluate(()=>calls.length),1);assert.equal(await page.locator('#map .map-stroke-preview').count(),0);assert.equal(await page.locator('#map [data-province="p3"]').evaluate(n=>n.classList.contains('map-brush-selected')),true);assert.equal(await page.locator('#map [data-province="p0"]').evaluate(n=>n.style.getPropertyValue('--province-color')),'#336699');
  pass('Canceled strokes restore color and retain the existing selection without committing');
  await page.evaluate(()=>MapView.render(holder,scenario,state,{...options,interactionMode:'select',selectedProvinces:['p3']}));await page.mouse.move(pts[0].x,pts[0].y);await page.mouse.down();await page.mouse.move(pts[1].x,pts[1].y,{steps:12});await page.mouse.up();assert.equal(await page.evaluate(()=>calls[1].mode),'select');assert.equal(await page.evaluate(()=>calls.length),2);assert.equal(await page.locator('#map .map-stroke-preview').count(),0);
  pass('Selection strokes have an independent callback and leave no temporary preview behind');
  await page.evaluate(()=>{const saved=MapView.getCamera(holder);MapView.dispose(holder);holder.replaceChildren();MapView.render(holder,scenario,state,{...options,initialCamera:saved});});assert.deepEqual(await camera(page),strokeCamera);
  await page.locator('#map [data-province="p1"]').dispatchEvent('click');assert.equal(await page.evaluate(()=>clicks.at(-1)),'p1');
  pass('Explicit cleanup and recreation restore camera state and preserve ordinary inspect clicks');
  await page.locator('#map svg').focus();await page.keyboard.down('KeyA');await page.waitForFunction(x=>MapView.getCamera(holder).x>x,strokeCamera.x);await page.evaluate(()=>{holder.hidden=true});await page.waitForTimeout(80);const hidden=await camera(page);await page.waitForTimeout(90);assert.deepEqual(await camera(page),hidden);await page.keyboard.up('KeyA');await page.evaluate(()=>{holder.hidden=false;MapView.dispose(holder)});assert.equal(await camera(page),null);assert.equal(await page.evaluate(()=>JSON.stringify({scenario,state,fixture})===beforeData),true);assert.deepEqual(errors,[]);await page.close();
  pass('Hiding or disposing the view stops movement and all gestures preserve source data');
  const controlled=await fixture(browser,true),clockPage=controlled.page;
  async function displacement(codes,fast=false){await reset(clockPage);const initial=await camera(clockPage);await clockPage.locator('#map svg').focus();if(fast)await clockPage.keyboard.down('Shift');for(const code of codes)await clockPage.keyboard.down(code);await clockPage.evaluate(()=>{__tick(100);__tick(120);__tick(140);});for(const code of codes)await clockPage.keyboard.up(code);if(fast)await clockPage.keyboard.up('Shift');const next=await camera(clockPage);return Math.hypot(next.x-initial.x,next.y-initial.y);}
  const normal=await displacement(['KeyD']),diagonal=await displacement(['KeyD','KeyS']),fast=await displacement(['KeyD'],true);assert.ok(Math.abs(diagonal-normal)<.00001);assert.ok(Math.abs(fast/normal-2)<.00001);assert.equal(await clockPage.evaluate(()=>__frames.size),0);
  pass('Deterministic frame checks verify diagonal normalization, double Shift speed and no queued frame after key release');
  await reset(clockPage);await clockPage.locator('#map svg').focus();await clockPage.keyboard.down('KeyD');await clockPage.evaluate(()=>MapView.render(document.querySelector('#second'),scenario,state,options));await clockPage.locator('#second svg').focus();await clockPage.evaluate(()=>__tick(200));assert.equal(await clockPage.evaluate(()=>__frames.size),0);await clockPage.keyboard.up('KeyD');
  await clockPage.locator('#map svg').focus();await clockPage.keyboard.down('KeyD');await clockPage.evaluate(()=>{holder.remove();__tick(220)});assert.equal(await clockPage.evaluate(()=>__frames.size),0);await clockPage.keyboard.up('KeyD');assert.deepEqual(controlled.errors,[]);await clockPage.close();
  pass('Switching between map widgets or removing a moving map releases its animation loop');
  console.log('Map input browser: '+checks.length+' checks passed; no remote requests or browser errors.');
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
