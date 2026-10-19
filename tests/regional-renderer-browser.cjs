'use strict';
// Real SVG regression with local metadata and unchanged global source paths.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
let playwright;try{playwright=require('playwright');}catch{playwright=require(path.resolve(path.dirname(process.execPath),'../node_modules/playwright'));}
async function main(){
 const browser=await playwright.chromium.launch({channel:process.env.MAP_TEST_BROWSER||'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1200,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));await page.route('**/*',route=>route.abort());
  await page.setContent('<!doctype html><html lang="ko"><body><main style="width:900px;margin:20px"><div id="map"></div></main></body></html>');
  await page.addStyleTag({content:fs.readFileSync(path.join(__dirname,'../map-view.css'),'utf8')});
  await page.addScriptTag({content:fs.readFileSync(path.join(__dirname,'../map-view.js'),'utf8')});
  const initial=await page.evaluate(()=>{
   const countries=[{id:'joseon',name:'조선',color:'#4477aa',focusBounds:[0,0,100,130]},{id:'japan',name:'일본',color:'#aa6655',focusBounds:[300,50,400,200]},{id:'france',name:'프랑스',color:'#6655aa',available:false}];
   window.region={id:'regional_test_1592',name:'동아시아 · 1592년',regionId:'eastasia',eraId:'1592',width:400,height:240,offsetX:600,offsetY:200,countries,provinces:[{id:'left',name:'한양',owner:'joseon',path:'M590,170h110v160h-110Z',cx:50,cy:65,bbox:[0,0,100,130]},{id:'right',name:'규슈',owner:'japan',path:'M900,250h140v150h-140Z',cx:350,cy:125,bbox:[300,50,400,200]}],landPath:'M500,100h600v400h-600Z',waterPath:'M995,210h5v15h-5Z',riversPath:'M620,230v30'};
   window.legacy={id:'legacy',name:'기존 지도',width:400,height:240,countries,provinces:[{id:'legacy',name:'기존 지역',owner:'joseon',path:'M10,10h90v90h-90Z',cx:55,cy:55,bbox:[10,10,100,100]}]};
   window.MapTemplates={get:id=>id===region.id?region:id===legacy.id?legacy:null};window.scenario={id:'regional_game',map:{templateId:region.id,playerCountry:'joseon',countries:[],initial:{}}};window.state=MapView.initialState(scenario);state.map.occupation.left='japan';state.map.influence.left='japan';state.map.markers.left='수도';window.picks=[];window.options={onProvince:id=>picks.push(id)};
   MapView.render(document.querySelector('#map'),scenario,state,options);window.originalSvg=document.querySelector('svg');
   const svg=document.querySelector('svg'),path=document.querySelector('[data-province="left"]'),overlay=document.querySelector('.map-layer'),labels=document.querySelector('[data-map-labels]');
   const point=(node,x,y)=>{const p=svg.createSVGPoint();p.x=x;p.y=y;const transformed=p.matrixTransform(node.getCTM());return{x:transformed.x,y:transformed.y};};
   return{viewBox:svg.getAttribute('viewBox'),geography:document.querySelector('[data-map-geography]').getAttribute('transform'),overlay:overlay.getAttribute('transform'),pathPoint:point(path,650,265),overlayPoint:point(overlay,650,265),labelPoint:point(labels,50,65),reset:document.querySelector('[data-map-tool="reset"]').textContent,legend:[...document.querySelectorAll('[data-map-country]')].map(n=>n.dataset.mapCountry),clipCount:document.querySelectorAll('clipPath').length,circles:document.querySelectorAll('svg circle').length};
  });
  assert.equal(initial.viewBox,'0 0 400 240');assert.equal(initial.geography,'translate(-600 -200)');assert.equal(initial.overlay,initial.geography);assert.deepEqual(initial.pathPoint,initial.labelPoint);assert.deepEqual(initial.overlayPoint,initial.labelPoint);assert.equal(initial.reset,'전체 보기');assert.deepEqual(initial.legend,['joseon','japan']);assert.equal(initial.clipCount,1);assert.equal(initial.circles,0);
  await page.locator('[data-province="left"]').dispatchEvent('pointermove');assert.match(await page.locator('[data-map-hover]').textContent(),/수도/);await page.locator('[data-province="left"]').dispatchEvent('click');assert.match(await page.locator('.map-selection').textContent(),/수도/);assert.equal(await page.evaluate(()=>state.map.markers.left),'수도');assert.deepEqual(await page.evaluate(()=>picks),['left']);
  console.log('PASS regional source paths align with local labels; markers stay readable without circles');
  await page.evaluate(()=>{const svg=document.querySelector('svg');svg.style.height='590px';svg.style.aspectRatio='auto';});
  const clip=await page.evaluate(()=>{const svg=document.querySelector('svg'),rect=svg.getBoundingClientRect();const hit=document.elementFromPoint(rect.left+50,rect.top+3);return{hit:hit?.closest('[data-province]')?.dataset.province||null,outer:document.querySelector('[data-map-viewport-clip]').getAttribute('clip-path'),inner:document.querySelector('[data-map-world]').getAttribute('clip-path')};});
  assert.equal(clip.hit,null);assert.equal(clip.outer,clip.inner);assert.match(clip.outer,/^url\(#map\d+crop\)$/);
  console.log('PASS crop clips original paths from viewport letterboxing and outside selected geography');
  await page.locator('[data-map-tool="country"]').click();
  const focused=await page.evaluate(()=>{const m=document.querySelector('[data-map-world]').transform.baseVal.consolidate().matrix;return{scale:m.a,x:m.e,y:m.f};});
  assert.ok(focused.scale>1);assert.ok(focused.x<=0&&focused.x>=400*(1-focused.scale));assert.ok(focused.y<=0&&focused.y>=240*(1-focused.scale));
  await page.evaluate(()=>{state.map.markers.right='새 표식';MapView.render(document.querySelector('#map'),scenario,state,options);});
  assert.equal(await page.evaluate(()=>originalSvg===document.querySelector('svg')),true);assert.equal(await page.locator('clipPath').count(),1);assert.equal(await page.locator('svg circle').count(),0);await page.locator('[data-map-region]').selectOption('right');assert.match(await page.locator('.map-selection').textContent(),/새 표식/);
  const transform=await page.locator('[data-map-world]').getAttribute('transform');assert.notEqual(transform,'translate(0 0) scale(1)');
  console.log('PASS country focus remains inside crop; updates preserve gestures and crop definition');
  await page.evaluate(()=>{scenario={...scenario,id:'another_game'};MapView.render(document.querySelector('#map'),scenario,state,options);});
  assert.equal(await page.evaluate(()=>originalSvg===document.querySelector('svg')),false);assert.equal(await page.locator('[data-map-world]').getAttribute('transform'),'translate(0 0) scale(1)');
  await page.evaluate(()=>{scenario={id:'legacy_game',map:{templateId:'legacy',playerCountry:'france',countries:[],initial:{}}};MapView.render(document.querySelector('#map'),scenario,MapView.initialState(scenario),options);});
  assert.equal(await page.locator('[data-map-geography]').getAttribute('transform'),'translate(0 0)');assert.equal(await page.locator('[data-map-tool="reset"]').textContent(),'세계');assert.equal(await page.locator('[data-map-tool="country"]').isDisabled(),true);assert.deepEqual(errors,[]);
  console.log('PASS changing scenario resets matching-template view; existing maps still render without offsets');
 }finally{await browser.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
