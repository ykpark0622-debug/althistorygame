(function(root){
 'use strict';
 const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const views=new WeakMap(),geometryCache=new WeakMap();let serial=0;
 const MAX_ZOOM=40,SEARCH_LIMIT=80,LABEL_LIMIT=130;
 const color=c=>/^#[0-9a-f]{6}$/i.test(c||'')?c:'#a6b5a4';
 const searchKey=value=>String(value||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase();
 const country=(view,id)=>view.context.countries.get(id)?.name||id||'없음';
 const ownerOf=(view,p)=>view.context.map.owners?.[p.id]||p.owner;
 const geometryOffset=template=>`translate(${-Number(template.offsetX||0)} ${-Number(template.offsetY||0)})`;
 function config(scenario){const template=root.MapTemplates?.get(scenario.map?.templateId);if(!template)return null;const countries=new Map(template.countries.map(c=>[c.id,c]));for(const c of scenario.map.countries||[])countries.set(c.id,{...countries.get(c.id),...c});return {template,countries};}
 function initialState(scenario){const cfg=config(scenario);if(!cfg)return null;const map={owners:{},occupation:{},influence:{},markers:{}};for(const p of cfg.template.provinces){map.owners[p.id]=p.owner;if(p.influence)map.influence[p.id]=p.influence;}for(const key of ['occupation','markers'])Object.assign(map[key],cfg.template.historicalInitial?.[key]||{});for(const key of Object.keys(map))for(const [id,value]of Object.entries(scenario.map.initial?.[key]||{})){if(key!=='owners'&&value===null)delete map[key][id];else map[key][id]=value;}return {map};}
 function geometry(template){
  let cached=geometryCache.get(template);if(cached)return cached;
  const dense=template.provinces.length>1000;
  // Boundaries are trusted, generated assets. Geometry is built once, independently of game state.
  cached={dense,byId:new Map(),search:[],html:template.provinces.map(p=>{
   return `<path class="map-province" data-province="${esc(p.id)}" d="${esc(p.path)}" vector-effect="non-scaling-stroke"${dense?'':` role="button" tabindex="0" aria-label="${esc(p.name)}"`}/>`;
  }).join('')};
  for(const p of template.provinces){cached.byId.set(p.id,p);cached.search.push({province:p,key:searchKey([p.name,p.id,p.note||'',p.countryName||''].join(' '))});}
  geometryCache.set(template,cached);return cached;
 }
 function safeUrl(value){try{const url=new URL(value);return /^https?:$/.test(url.protocol)?url.href:null;}catch{return null;}}
 function sourceMarkup(template){
  const sources=Array.isArray(template.sources)?template.sources:[];
  const url=safeUrl(template.sourceUrl),primary=sources.length?sources.map(source=>{const href=safeUrl(source.url);return href?`<a href="${esc(href)}" target="_blank" rel="noreferrer">${esc(source.name||source.title||href)}</a>${source.license?` (${esc(source.license)})`:''}`:esc(source.name||source.title||'');}).join(' · '):`${esc(template.source||'')}${url?` · <a href="${esc(url)}" target="_blank" rel="noreferrer">지도 데이터·이용 조건</a>`:' · <a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noreferrer">이용 조건</a>'}`;
  const link=(value,label)=>{const href=safeUrl(/^https?:\/\//i.test(value||'')?value:'https://'+value);return href?`<a href="${esc(href)}" target="_blank" rel="noreferrer">${esc(label)}</a>`:esc(label);};
  return primary+(template.licenseNotice?`<span class="map-license-notice">${esc(template.licenseNotice)}</span>`:'')+(template.credits?.length?`<details class="map-source-list"><summary>국가별 원출처·라이선스 ${template.credits.length}건</summary><ul>${template.credits.map(c=>`<li><strong>${esc(c.country)} · ${esc(c.type)} · ${esc(c.year)}</strong><br>${link(c.sourceUrl,c.source)}<br>${link(c.licenseUrl,c.license)}</li>`).join('')}</ul></details>`:'');
 }
 function createView(container,template,scenarioKey){
  views.get(container)?.dispose();
  const cached=geometry(template),view={container,template,scenarioKey,geometry:cached,uid:'map'+(++serial),scale:1,x:0,y:0,selected:null,labels:false,signatures:new Map(),labelSignature:'',legendSignature:'',overlaySignature:'',ignoreClick:false};
  view.clipMarkup=`<clipPath id="${view.uid}crop" clipPathUnits="userSpaceOnUse"><rect x="0" y="0" width="${template.width}" height="${template.height}"/></clipPath>`;
  const background=template.landPath?`<path class="map-land" d="${esc(template.landPath)}" aria-hidden="true"/>`:'';
  const water=(template.waterPath?`<path class="map-water" d="${esc(template.waterPath)}" aria-hidden="true"/>`:'')+(template.riversPath?`<path class="map-rivers" d="${esc(template.riversPath)}" vector-effect="non-scaling-stroke" aria-hidden="true"/>`:'');
  container.innerHTML=`<section class="history-map${cached.dense?' map-dense':''}${(template.regionId||template.geographicBounds)?' map-regional':''}" style="--map-aspect:${template.width}/${template.height}"><div class="map-heading"><div><span class="small-label">선택으로 달라지는 지도</span><h2>${esc(template.name)} <small>${template.provinces.length.toLocaleString()}개 지역</small></h2></div><span class="map-zoom-status" data-map-zoom>100%</span></div><div class="map-viewport"><svg class="province-map" viewBox="0 0 ${template.width} ${template.height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(template.name)}. 휠로 확대·축소하고 드래그로 이동합니다."><defs data-map-defs>${view.clipMarkup}</defs><g clip-path="url(#${view.uid}crop)" data-map-viewport-clip><g data-map-world clip-path="url(#${view.uid}crop)"><g data-map-geography transform="${geometryOffset(template)}">${background}${cached.html}${water}</g><g data-map-overlays aria-hidden="true"></g><g data-map-labels aria-hidden="true"></g></g></g></svg><div class="map-toolbar" role="group" aria-label="지도 조작"><button type="button" class="btn subtle" data-map-tool="in" aria-label="지도 확대" title="확대">＋</button><button type="button" class="btn subtle" data-map-tool="out" aria-label="지도 축소" title="축소">−</button><button type="button" class="btn subtle" data-map-tool="country" title="플레이어 국가로 이동">내 나라</button><button type="button" class="btn subtle" data-map-tool="reset">${(template.regionId||template.geographicBounds)?'전체 보기':'세계'}</button><button type="button" class="btn subtle" data-map-tool="labels" aria-pressed="false">지명</button></div><div class="map-hover" data-map-hover hidden></div><span class="map-gesture-hint">휠 확대·축소 · 드래그 이동</span></div><div class="map-selection" aria-live="polite">지역을 누르거나 검색하세요. 빗금은 점령·영향권입니다. 표식 내용은 지역을 선택하면 확인할 수 있습니다.</div><div class="map-region-select"><label class="map-search-label"${cached.dense?'':' hidden'}>지역 검색<input type="search" data-map-search placeholder="지역·국가 이름 검색" autocomplete="off" aria-label="지역 또는 국가 이름 검색"></label><label>지역 선택<select data-map-region aria-label="지도 지역 선택"></select></label><span class="map-search-count" data-map-search-count></span></div><div class="map-legend"></div><p class="map-comparison" hidden></p><details class="map-notice"><summary>지도 안내·출처</summary><p>${esc(template.notice||'')}</p><p>${sourceMarkup(template)}</p></details></section>`;
  for(const [key,selector] of Object.entries({svg:'svg',world:'[data-map-world]',defs:'[data-map-defs]',overlays:'[data-map-overlays]',labelLayer:'[data-map-labels]',selection:'.map-selection',select:'[data-map-region]',search:'[data-map-search]',searchCount:'[data-map-search-count]',legend:'.map-legend',comparison:'.map-comparison',zoomStatus:'[data-map-zoom]',hover:'[data-map-hover]'}))view[key]=container.querySelector(selector);
  view.nodes=new Map([...container.querySelectorAll('[data-province]')].map(node=>[node.dataset.province,node]));
  bind(view);views.set(container,view);return view;
 }
 function screenPoint(view,event){
  const matrix=view.svg.getScreenCTM?.();
  if(matrix){try{const inverse=matrix.inverse();return {x:inverse.a*event.clientX+inverse.c*event.clientY+inverse.e,y:inverse.b*event.clientX+inverse.d*event.clientY+inverse.f};}catch{/* Detached or temporarily hidden SVG: use its measured viewport. */}}
  const rect=view.svg.getBoundingClientRect?.()||{left:0,top:0,width:view.template.width,height:view.template.height};
  const ratio=Math.min(rect.width/view.template.width,rect.height/view.template.height)||1;
  return {x:(event.clientX-rect.left-(rect.width-view.template.width*ratio)/2)/ratio,y:(event.clientY-rect.top-(rect.height-view.template.height*ratio)/2)/ratio};
 }
 function transform(view){
  const {width,height}=view.template;view.x=Math.max(width*(1-view.scale),Math.min(0,view.x));view.y=Math.max(height*(1-view.scale),Math.min(0,view.y));
  view.world.setAttribute('transform',`translate(${view.x} ${view.y}) scale(${view.scale})`);view.zoomStatus.textContent=Math.round(view.scale*100)+'%';renderLabels(view);
 }
 function zoom(view,factor,anchor={x:view.template.width/2,y:view.template.height/2}){
  const previous=view.scale;view.scale=Math.max(1,Math.min(MAX_ZOOM,previous*factor));const ratio=view.scale/previous;
  view.x=anchor.x-(anchor.x-view.x)*ratio;view.y=anchor.y-(anchor.y-view.y)*ratio;transform(view);
 }
 function regionText(view,p,includeReference=true){
  const {map,reference}=view.context,id=p.id;
  return `${p.name} · 소유 ${country(view,ownerOf(view,p))}${map.occupation?.[id]?' · 점령 '+country(view,map.occupation[id]):''}${map.influence?.[id]?' · 영향권 '+country(view,map.influence[id]):''}${map.markers?.[id]?' · '+map.markers[id]:''}${includeReference&&reference?' · 기준 소유 '+country(view,reference.owners?.[id]):''}`;
 }
 function select(view,id,callback=true){
  const p=view.geometry.byId.get(id);if(!p)return;
  if(view.selected!==id){const old=view.nodes.get(view.selected);old?.classList.remove('selected');if(view.geometry.dense)old?.removeAttribute('tabindex');view.selected=id;view.nodes.get(id)?.classList.add('selected');if(view.geometry.dense)view.nodes.get(id)?.setAttribute('tabindex','0');}
  const text=regionText(view,p);view.selection.textContent=text;view.nodes.get(id)?.setAttribute('aria-label',text);if(view.geometry.dense)view.nodes.get(id)?.setAttribute('role','button');
  if(![...view.select.children].some(node=>node.value===id||node.getAttribute?.('value')===id))renderSearch(view);
  view.select.value=id;renderLabels(view);if(callback)view.context.options.onProvince?.(id,p);
 }
 function renderSearch(view){
  const query=searchKey(view.search.value.trim()),dense=view.geometry.dense,countryKeys=new Map([...view.context.countries].map(([id,c])=>[id,searchKey(c.name)]));
  let count=0;const results=[];
  for(const item of view.geometry.search){if(!query||item.key.includes(query)||(countryKeys.get(ownerOf(view,item.province))||'').includes(query)){count++;if(!dense||results.length<SEARCH_LIMIT)results.push(item.province);}}
  const selected=view.geometry.byId.get(view.selected);if(selected&&!results.some(p=>p.id===selected.id))results.unshift(selected);
  view.select.innerHTML='<option value="">지역 선택</option>'+results.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}${dense?' · '+esc(country(view,ownerOf(view,p))):''}</option>`).join('');
  view.select.value=view.selected||'';view.searchCount.textContent=dense?(count>SEARCH_LIMIT?`${count.toLocaleString()}개 중 ${SEARCH_LIMIT}개 표시 · 검색어를 좁혀 주세요`:`${count.toLocaleString()}개 지역`):'';
 }
 function renderLabels(view){
  const selected=view.geometry.byId.get(view.selected),show=view.labels&&(!view.geometry.dense||view.scale>=4),minX=-view.x/view.scale,minY=-view.y/view.scale,maxX=(view.template.width-view.x)/view.scale,maxY=(view.template.height-view.y)/view.scale;
  let visible=show?view.template.provinces.filter(p=>p.cx>=minX&&p.cx<=maxX&&p.cy>=minY&&p.cy<=maxY).sort((a,b)=>(b.area||0)-(a.area||0)).slice(0,LABEL_LIMIT):[];
  if(selected&&!visible.includes(selected))visible.unshift(selected);
  const matrix=view.svg.getScreenCTM?.(),screenScale=matrix?Math.hypot(matrix.a,matrix.b)||1:1;
  const pixelScale=view.scale*screenScale,labelWidth=text=>[...String(text)].reduce((width,char)=>width+(/[\u1100-\uffff]/.test(char)?11:6.3),0),labelBox=(x,y,text)=>({left:x*pixelScale-labelWidth(text)/2-5,right:x*pixelScale+labelWidth(text)/2+5,top:y*pixelScale-10,bottom:y*pixelScale+7}),overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  const occupied=selected?[labelBox(selected.cx,selected.cy,selected.name)]:[],countryLabels=[];
  for(const candidate of [...(view.countryLabelAnchors?.values()||[])].sort((a,b)=>b.area-a.area)){
   const {id,cx,cy,bounds}=candidate,name=country(view,id);if(cx<minX||cx>maxX||cy<minY||cy>maxY)continue;
   if((bounds[2]-bounds[0])*pixelScale<labelWidth(name)*.8||(bounds[3]-bounds[1])*pixelScale<18)continue;
   const box=labelBox(cx,cy,name);if(occupied.some(other=>overlaps(box,other)))continue;
   occupied.push(box);countryLabels.push({...candidate,name,box});if(countryLabels.length>=90)break;
  }
  visible=visible.filter(p=>p===selected||!countryLabels.some(label=>overlaps(labelBox(p.cx,p.cy,p.name),label.box)));
  const signature=visible.map(p=>p.id).join('|')+'@'+view.scale.toFixed(3)+'@'+screenScale.toFixed(4)+'@'+countryLabels.map(label=>label.id+':'+label.name+':'+label.cx+','+label.cy).join('|');if(signature===view.labelSignature)return;view.labelSignature=signature;
  const fontStyle=`font-size:${11/pixelScale}px;stroke-width:${2.4/pixelScale}px`;
  view.labelLayer.innerHTML=countryLabels.map(label=>`<text x="${label.cx}" y="${label.cy}" class="map-country-label" style="${fontStyle}">${esc(label.name)}</text>`).join('')+visible.map(p=>`<text x="${p.cx}" y="${p.cy}" class="map-label" style="${fontStyle}">${esc(p.name)}</text>`).join('');
 }
 function focusCountry(view,id){
  const provinces=view.template.provinces.filter(p=>ownerOf(view,p)===id);if(!provinces.length)return;
  let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
  for(const p of provinces){let box=p.bbox||p.bounds;try{if(!box){const b=view.nodes.get(p.id)?.getBBox?.();if(b){const dx=Number(view.template.offsetX||0),dy=Number(view.template.offsetY||0);box=[b.x-dx,b.y-dy,b.x+b.width-dx,b.y+b.height-dy];}}}catch{}if(Array.isArray(box)&&box.length===4){left=Math.min(left,box[0]);top=Math.min(top,box[1]);right=Math.max(right,box[2]);bottom=Math.max(bottom,box[3]);}else{left=Math.min(left,p.cx);top=Math.min(top,p.cy);right=Math.max(right,p.cx);bottom=Math.max(bottom,p.cy);}}
  const mainland=view.context.countries.get(id)?.focusBounds;if(Array.isArray(mainland)&&mainland.length===4&&mainland.every(Number.isFinite)&&provinces.some(p=>p.cx>=mainland[0]&&p.cx<=mainland[2]&&p.cy>=mainland[1]&&p.cy<=mainland[3]))[left,top,right,bottom]=mainland;
  left=Math.max(0,Math.min(view.template.width,left));right=Math.max(left,Math.min(view.template.width,right));top=Math.max(0,Math.min(view.template.height,top));bottom=Math.max(top,Math.min(view.template.height,bottom));
  const width=Math.max(8,right-left),height=Math.max(8,bottom-top);view.scale=Math.max(1,Math.min(MAX_ZOOM,Math.min(view.template.width/(width*1.3),view.template.height/(height*1.3))));view.x=view.template.width/2-(left+right)/2*view.scale;view.y=view.template.height/2-(top+bottom)/2*view.scale;transform(view);
 }
 function bind(view){
  const {svg,container}=view;let drag=null,pendingClick=null;
  const down=event=>{if(event.button!==0)return;const point=screenPoint(view,event);drag={point,x:event.clientX,y:event.clientY,vx:view.x,vy:view.y,province:event.target.closest?.('[data-province]')?.dataset.province,pointer:event.pointerId,moved:false};view.ignoreClick=false;pendingClick=null;svg.setPointerCapture?.(event.pointerId);view.hover.hidden=true;};
  const move=event=>{
   if(drag){const point=screenPoint(view,event);if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>5)drag.moved=true;if(drag.moved){view.x=drag.vx+point.x-drag.point.x;view.y=drag.vy+point.y-drag.point.y;transform(view);}return;}
   const p=view.geometry.byId.get(event.target.closest?.('[data-province]')?.dataset.province);view.hover.hidden=!p;if(p){const text=regionText(view,p);if(view.hover.textContent!==text)view.hover.textContent=text;}
  };
  const up=event=>{if(!drag)return;view.ignoreClick=drag.moved;pendingClick=drag.moved?null:drag.province;drag=null;try{svg.releasePointerCapture?.(event.pointerId);}catch{}};
  const cancel=()=>{drag=null;pendingClick=null;view.ignoreClick=true;view.hover.hidden=true;};
  const wheel=event=>{event.preventDefault();const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?view.template.height:1);zoom(view,Math.exp(-Math.max(-400,Math.min(400,pixels))*.002),screenPoint(view,event));view.hover.hidden=true;};
  const leave=()=>{view.hover.hidden=true;};
  const click=event=>{
   const tool=event.target.closest?.('[data-map-tool]')?.dataset.mapTool;
   if(tool){if(tool==='in')zoom(view,1.4);if(tool==='out')zoom(view,1/1.4);if(tool==='reset'){view.scale=1;view.x=0;view.y=0;transform(view);}if(tool==='country')focusCountry(view,view.context.scenario.map?.playerCountry);if(tool==='labels'){view.labels=!view.labels;event.target.closest('[data-map-tool]').setAttribute('aria-pressed',String(view.labels));view.labelSignature='';renderLabels(view);}return;}
   const focus=event.target.closest?.('[data-map-country]')?.dataset.mapCountry;if(focus){focusCountry(view,focus);return;}
   const id=event.target.closest?.('[data-province]')?.dataset.province||(event.target===svg?pendingClick:null);pendingClick=null;if(id&&!view.ignoreClick)select(view,id);view.ignoreClick=false;
  };
  const key=event=>{if(event.key==='Enter'||event.key===' '){const id=event.target.closest?.('[data-province]')?.dataset.province;if(id){event.preventDefault();select(view,id);}}else if(event.target===svg&&['+','=','-','0'].includes(event.key)){event.preventDefault();if(event.key==='0'){view.scale=1;view.x=view.y=0;transform(view);}else zoom(view,event.key==='-'?1/1.4:1.4);}};
  const change=event=>select(view,event.target.value),search=()=>renderSearch(view);
  for(const [type,handler]of Object.entries({pointerdown:down,pointermove:move,pointerup:up,pointercancel:cancel,pointerleave:leave,wheel,keydown:key}))svg.addEventListener(type,handler,type==='wheel'?{passive:false}:undefined);
  container.addEventListener('click',click);view.select.addEventListener('change',change);view.search.addEventListener('input',search);
  view.dispose=()=>container.removeEventListener('click',click);
 }
 function update(view){
  const {map,reference,countries}=view.context;let diff=0;const overlay=[],patterns=new Map(),legend=new Map();
  const countryBounds=new Map([...countries].filter(([,c])=>Array.isArray(c.focusBounds)&&c.focusBounds.length===4&&c.focusBounds.every(Number.isFinite)).map(([id,c])=>[id,c.focusBounds]));view.countryLabelAnchors=new Map();
  const patternId=(id,type)=>{const key=type+'|'+id;if(!patterns.has(key))patterns.set(key,{id:view.uid+type+patterns.size,color:color(countries.get(id)?.color),reverse:type==='i'});return patterns.get(key).id;};
  for(const p of view.template.provinces){
   const id=p.id,owner=ownerOf(view,p),occupier=map.occupation?.[id],influence=map.influence?.[id],fill=color(countries.get(owner)?.color),different=Boolean(reference&&['owners','occupation','influence','markers'].some(k=>(map[k]?.[id]??null)!==(reference[k]?.[id]??null)));
   legend.set(owner,fill);if(different)diff++;
   const bounds=countryBounds.get(owner);if(bounds&&p.cx>=bounds[0]&&p.cx<=bounds[2]&&p.cy>=bounds[1]&&p.cy<=bounds[3]){const distance=(p.cx-(bounds[0]+bounds[2])/2)**2+(p.cy-(bounds[1]+bounds[3])/2)**2,previous=view.countryLabelAnchors.get(owner);if(!previous||distance<previous.distance)view.countryLabelAnchors.set(owner,{id:owner,cx:p.cx,cy:p.cy,bounds,distance,area:(bounds[2]-bounds[0])*(bounds[3]-bounds[1])});}
   const signature=fill+'|'+different;if(view.signatures.get(id)!==signature){const node=view.nodes.get(id);node?.setAttribute('style','--province-color:'+fill);node?.classList.toggle('map-diff',different);view.signatures.set(id,signature);}
   if(occupier)overlay.push(`<path class="map-layer" d="${esc(p.path)}" transform="${geometryOffset(view.template)}" fill="url(#${patternId(occupier,'o')})"/>`);
   if(influence)overlay.push(`<path class="map-layer" d="${esc(p.path)}" transform="${geometryOffset(view.template)}" fill="url(#${patternId(influence,'i')})"/>`);
  }
  const patternMarkup=[...patterns.values()].map(p=>`<pattern id="${p.id}" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(${p.reverse?-35:35})"><line x1="0" y1="0" x2="0" y2="8" stroke="${p.color}" stroke-width="3"/></pattern>`).join('');
  const overlayMarkup=overlay.join(''),overlaySignature=patternMarkup+overlayMarkup;if(view.overlaySignature!==overlaySignature){view.defs.innerHTML=view.clipMarkup+patternMarkup;view.overlays.innerHTML=overlayMarkup;view.overlaySignature=overlaySignature;}
  const legendMarkup=[...legend].map(([id,fill])=>`<button type="button" class="map-country-key" data-map-country="${esc(id)}" title="${esc(country(view,id))}로 이동"><i style="background:${fill}"></i>${esc(country(view,id))}</button>`).join('');
  if(legendMarkup!==view.legendSignature){view.legend.innerHTML=legendMarkup;view.legendSignature=legendMarkup;}
  view.comparison.hidden=!reference;view.comparison.textContent=reference?`금색 테두리: 기준 경로와 다른 지역 ${diff.toLocaleString()}개. 기준 경로는 작성자가 표시한 선택을 따라 계산합니다.`:'';
  const focus=view.container.querySelector('[data-map-tool="country"]'),player=view.context.scenario.map?.playerCountry;focus.disabled=!player||!legend.has(player);focus.textContent=player?country(view,player):'내 나라';focus.title=focus.disabled&&player?'선택한 지도 안에 플레이어 국가의 지역이 없습니다.':'플레이어 국가로 이동';
  renderSearch(view);if(view.selected)select(view,view.selected,false);transform(view);
 }
 function render(container,scenario,state,options={}){
  if(!container)return;const cfg=config(scenario);if(!cfg){views.get(container)?.dispose();views.delete(container);container.replaceChildren();container.hidden=true;return;}container.hidden=false;
  const scenarioKey=scenario.id||'';
  let view=views.get(container);if(!view||view.template!==cfg.template||view.scenarioKey!==scenarioKey||!container.contains(view.svg))view=createView(container,cfg.template,scenarioKey);
  view.context={...cfg,scenario,map:state?.map||initialState(scenario).map,reference:options.compareState?.map,options};update(view);
 }
 root.MapView={render,initialState};
})(typeof globalThis!=='undefined'?globalThis:this);
