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
  const cached=geometry(template),view={container,template,scenarioKey,geometry:cached,uid:'map'+(++serial),scale:1,x:0,y:0,selected:null,labels:false,countryLabels:true,showInfluence:false,showOccupation:true,signatures:new Map(),labelSignature:'',legendSignature:'',overlaySignature:'',ignoreClick:false};
  view.clipMarkup=`<clipPath id="${view.uid}crop" clipPathUnits="userSpaceOnUse"><rect x="0" y="0" width="${template.width}" height="${template.height}"/></clipPath>`;
  const background=template.landPath?`<path class="map-land" d="${esc(template.landPath)}" aria-hidden="true"/>`:'';
  const water=(template.waterPath?`<path class="map-water" d="${esc(template.waterPath)}" aria-hidden="true"/>`:'')+(template.riversPath?`<path class="map-rivers" d="${esc(template.riversPath)}" vector-effect="non-scaling-stroke" aria-hidden="true"/>`:'');
  container.innerHTML=`<style>.province-map:focus-visible{outline:3px solid #6f9987;outline-offset:-3px}.map-toolbar [data-map-tool="keyboard"]:focus-visible{outline:3px solid #6f9987;outline-offset:2px}.map-province.map-brush-selected,.map-province.map-stroke-preview{stroke:#e9b747;stroke-width:2.8;stroke-opacity:1}.map-province.map-stroke-preview{filter:brightness(1.08)}.map-country-label,.map-country-label:focus,.map-country-label:focus-visible{outline:none!important}.map-country-label{opacity:1}.map-country-label-background,.map-country-label-frame{pointer-events:none}</style><section class="history-map${cached.dense?' map-dense':''}${(template.regionId||template.geographicBounds)?' map-regional':''}" style="--map-aspect:${template.width}/${template.height}"><div class="map-heading"><div><span class="small-label">선택으로 달라지는 지도</span><h2>${esc(template.name)} <small>${template.provinces.length.toLocaleString()}개 지역</small></h2></div><span class="map-zoom-status" data-map-zoom>100%</span></div><div class="map-viewport"><svg class="province-map" viewBox="0 0 ${template.width} ${template.height}" preserveAspectRatio="xMidYMid meet" tabindex="0" role="img" aria-label="${esc(template.name)}. 지도를 클릭한 뒤 WASD로 이동합니다. Shift로 빠르게 이동하고 휠로 확대·축소합니다."><defs data-map-defs>${view.clipMarkup}</defs><g clip-path="url(#${view.uid}crop)" data-map-viewport-clip><g data-map-world clip-path="url(#${view.uid}crop)"><g data-map-geography transform="${geometryOffset(template)}">${background}${cached.html}${water}</g><g data-map-overlays aria-hidden="true"></g><g data-map-labels aria-hidden="true"></g></g></g></svg><div class="map-toolbar" role="group" aria-label="지도 조작"><button type="button" class="btn subtle" data-map-tool="keyboard" title="지도를 클릭한 뒤 WASD로 이동 · Shift로 빠르게 이동">WASD 이동</button><button type="button" class="btn subtle" data-map-tool="in" aria-label="지도 확대" title="확대">＋</button><button type="button" class="btn subtle" data-map-tool="out" aria-label="지도 축소" title="축소">−</button><button type="button" class="btn subtle" data-map-tool="country" title="플레이어 국가로 이동">내 나라</button><button type="button" class="btn subtle" data-map-tool="reset">${(template.regionId||template.geographicBounds)?'전체 보기':'세계'}</button><button type="button" class="btn subtle" data-map-tool="countries" aria-label="국명" aria-pressed="true" title="국명 켜기·끄기">국명</button><button type="button" class="btn subtle" data-map-tool="labels" aria-pressed="false">지명</button></div><div class="map-hover" data-map-hover hidden></div><span class="map-gesture-hint">휠 확대·축소 · 드래그 이동</span></div><div class="map-layer-controls" data-map-layer-controls style="display:flex;align-items:center;flex-wrap:wrap;gap:9px 18px;padding:11px 16px 0;font:12px/1.5 sans-serif;color:#53644e"><label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" style="width:15px;height:15px;margin:0;accent-color:#285849;cursor:pointer" data-map-layer="influence">영향권 빗금</label><label style="display:inline-flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" style="width:15px;height:15px;margin:0;accent-color:#285849;cursor:pointer" data-map-layer="occupation">점령 빗금</label><span style="font-size:11px;color:#7b8171;flex:1 1 230px">지역을 누르면 영향권과 점령국을 확인할 수 있습니다.</span></div><div class="map-selection" aria-live="polite">지역을 누르거나 검색하세요. 빗금은 점령·영향권입니다. 표식 내용은 지역을 선택하면 확인할 수 있습니다.</div><div class="map-region-select"><label class="map-search-label"${cached.dense?'':' hidden'}>지역 검색<input type="search" data-map-search placeholder="지역·국가 이름 검색" autocomplete="off" aria-label="지역 또는 국가 이름 검색"></label><label>지역 선택<select data-map-region aria-label="지도 지역 선택"></select></label><span class="map-search-count" data-map-search-count></span></div><div class="map-legend"></div><p class="map-comparison" hidden></p><details class="map-notice"><summary>지도 안내·출처</summary><p>${esc(template.notice||'')}</p><p>${sourceMarkup(template)}</p></details></section>`;
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
 function labelPoint(view,point){return [Math.max(0,Math.min(view.template.width,(point.x-view.x)/view.scale)),Math.max(0,Math.min(view.template.height,(point.y-view.y)/view.scale))];}
 function manualLabelPosition(value){return Array.isArray(value)&&value.length===2&&value.every(Number.isFinite);}
 function ownedLabelBounds(view,p){const box=p.bbox||p.bounds;if(Array.isArray(box)&&box.length===4&&box.every(Number.isFinite))return box;try{const measured=view.nodes.get(p.id)?.getBBox?.();if(measured){const dx=Number(view.template.offsetX||0),dy=Number(view.template.offsetY||0);return [measured.x-dx,measured.y-dy,measured.x+measured.width-dx,measured.y+measured.height-dy];}}catch{}return [p.cx,p.cy,p.cx,p.cy];}
 function transform(view,refreshLabels=true){
  const {width,height}=view.template;view.x=Math.max(width*(1-view.scale),Math.min(0,view.x));view.y=Math.max(height*(1-view.scale),Math.min(0,view.y));
  view.world.setAttribute('transform',`translate(${view.x} ${view.y}) scale(${view.scale})`);const zoomText=Math.round(view.scale*100)+'%';if(view.zoomStatus.textContent!==zoomText)view.zoomStatus.textContent=zoomText;if(refreshLabels)renderLabels(view);
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
 function clearSelection(view){
  const hadSelection=Boolean(view.selected||view.labelSelectedCountry);
  const old=view.nodes.get(view.selected);old?.classList.remove('selected');if(view.geometry.dense)old?.removeAttribute('tabindex');
  view.selected=null;view.labelSelectedCountry='';view.select.value='';view.hover.hidden=true;
  view.selection.textContent='지역을 누르거나 검색하세요. 빗금은 점령·영향권입니다. 표식 내용은 지역을 선택하면 확인할 수 있습니다.';
  // A focused SVG path has its own outline even after .selected is removed.
  const active=view.container.ownerDocument?.activeElement;if(active&&active!==view.svg&&view.svg.contains(active))active.blur?.();
  view.labelSignature='';renderLabels(view);if(hadSelection)view.context.options.onSelectionClear?.();
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
  const editing=Boolean(view.context.options.labelEditMode),placement=view.context.options.labelPlacementCountry||'',selected=view.geometry.byId.get(view.selected),show=view.labels&&(!view.geometry.dense||view.scale>=4),minX=-view.x/view.scale,minY=-view.y/view.scale,maxX=(view.template.width-view.x)/view.scale,maxY=(view.template.height-view.y)/view.scale;
  let visible=show?view.template.provinces.filter(p=>p.cx>=minX&&p.cx<=maxX&&p.cy>=minY&&p.cy<=maxY).sort((a,b)=>(b.area||0)-(a.area||0)).slice(0,LABEL_LIMIT):[];
  if(selected&&!visible.includes(selected))visible.unshift(selected);
  const matrix=view.svg.getScreenCTM?.(),screenScale=matrix?Math.hypot(matrix.a,matrix.b)||1:1;
  const pixelScale=view.scale*screenScale,labelWidth=text=>[...String(text)].reduce((width,char)=>width+(/[\u1100-\uffff]/.test(char)?11:6.3),0),labelBox=(x,y,text)=>({left:x*pixelScale-labelWidth(text)/2-7,right:x*pixelScale+labelWidth(text)/2+7,top:y*pixelScale-14,bottom:y*pixelScale+7}),overlaps=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
  const occupied=selected?[labelBox(selected.cx,selected.cy,selected.name)]:[],countryLabels=[];
  if(!editing&&view.countryLabels){
   const toolbar=view.container.querySelector('.map-toolbar')?.getBoundingClientRect?.();
   if(toolbar?.width&&toolbar?.height){const a=screenPoint(view,{clientX:toolbar.left,clientY:toolbar.top}),b=screenPoint(view,{clientX:toolbar.right,clientY:toolbar.bottom});occupied.push({left:(a.x-view.x)/view.scale*pixelScale-4,right:(b.x-view.x)/view.scale*pixelScale+4,top:(a.y-view.y)/view.scale*pixelScale-4,bottom:(b.y-view.y)/view.scale*pixelScale+4});}
  }
  function placeLabel(candidate,name){
   if(editing||candidate.manual)return {...candidate,box:labelBox(candidate.cx,candidate.cy,name)};
   const half=(labelWidth(name)/2+7)/pixelScale,clamp=(value,low,high)=>high<low?(low+high)/2:Math.max(low,Math.min(high,value));
   const fit=(dx,dy)=>{const cx=clamp(candidate.cx+dx/pixelScale,minX+half,maxX-half),cy=clamp(candidate.cy+dy/pixelScale,minY+14/pixelScale,maxY-7/pixelScale);return{cx,cy,box:labelBox(cx,cy,name)};};
   let chosen=fit(0,0),best=Infinity;
   // Keep every name. Search nearby screen positions instead of suppressing
   // small realms; these offsets are presentation only and never enter JSON.
   for(let ring=0;ring<=6;ring++)for(let step=0;step<(ring?16:1);step++){
    const angle=step*Math.PI/8,radius=ring*20,point=fit(Math.cos(angle)*radius,Math.sin(angle)*radius);
    const overlap=occupied.reduce((sum,box)=>sum+(overlaps(point.box,box)?Math.max(0,Math.min(point.box.right,box.right)-Math.max(point.box.left,box.left))*Math.max(0,Math.min(point.box.bottom,box.bottom)-Math.max(point.box.top,box.top)):0),0),distance=Math.hypot((point.cx-candidate.cx)*pixelScale,(point.cy-candidate.cy)*pixelScale),score=overlap*100+distance;
    if(score<best){best=score;chosen=point;}if(!overlap)return {...candidate,...point,anchorX:candidate.cx,anchorY:candidate.cy};
   }
   return {...candidate,...chosen,anchorX:candidate.cx,anchorY:candidate.cy};
  }
  const candidates=[...(view.countryLabelAnchors?.values()||[])].map(candidate=>view.labelDragPreview?.id===candidate.id?{...candidate,cx:view.labelDragPreview.position[0],cy:view.labelDragPreview.position[1],manual:true}:candidate).sort((a,b)=>Number(Boolean(b.manual))-Number(Boolean(a.manual))||b.area-a.area);
  for(const candidate of view.countryLabels?candidates:[]){
   const {id,cx,cy}=candidate,name=country(view,id);if(cx<minX||cx>maxX||cy<minY||cy>maxY)continue;
   const placed=placeLabel(candidate,name);occupied.push(placed.box);countryLabels.push({...placed,name});
  }
  visible=visible.filter(p=>p===selected||!countryLabels.some(label=>overlaps(labelBox(p.cx,p.cy,p.name),label.box)));
  const selectedLabel=editing?(view.labelSelectedCountry??view.context.options.selectedLabelCountry??placement):'';
  const signature=visible.map(p=>p.id).join('|')+'@'+view.scale.toFixed(3)+'@'+screenScale.toFixed(4)+'@'+editing+'@'+placement+'@'+selectedLabel+'@'+countryLabels.map(label=>label.id+':'+label.name+':'+label.cx+','+label.cy+':'+label.anchorX+','+label.anchorY+':'+Boolean(label.manual)).join('|');if(signature===view.labelSignature)return;view.labelSignature=signature;
  const fontStyle=`font-size:${11/pixelScale}px;stroke-width:${2.4/pixelScale}px`;
  const focusedLabel=view.labelLayer.ownerDocument?.activeElement?.getAttribute?.('data-map-country-label');
  const backdrops=countryLabels.map(label=>`<g data-map-country-label-backdrop="${esc(label.id)}"><rect data-map-label-background="${esc(label.id)}" class="map-country-label-background" fill="#fff8e8" fill-opacity="0.78" stroke="none"${editing?` data-map-label-hit="${esc(label.id)}" style="pointer-events:all;cursor:grab;touch-action:none"`:''}/>${selectedLabel===label.id?`<rect data-map-label-frame="${esc(label.id)}" class="map-country-label-frame" fill="none" stroke="#526f61" stroke-width="1.2" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>`:''}</g>`).join('');
  const leaders=countryLabels.filter(label=>Number.isFinite(label.anchorX)&&Math.hypot(label.cx-label.anchorX,label.cy-label.anchorY)*pixelScale>12).map(label=>`<line data-map-label-leader="${esc(label.id)}" x1="${label.anchorX}" y1="${label.anchorY}" x2="${label.cx}" y2="${label.cy}" stroke="#526f61" stroke-opacity="0.5" stroke-width="0.7" vector-effect="non-scaling-stroke" pointer-events="none"/>`).join('');
  view.labelLayer.innerHTML=leaders+backdrops+countryLabels.map(label=>`<text x="${label.cx}" y="${label.cy}" data-map-country-label="${esc(label.id)}" class="map-country-label"${editing?` role="button" tabindex="0" aria-pressed="${selectedLabel===label.id}" aria-label="${esc(label.name)} 국명 위치. 드래그하거나 화살표 키로 이동"`:''} style="${fontStyle};opacity:1;outline:none${editing?';pointer-events:all;cursor:grab;touch-action:none':''}${placement===label.id?';fill:#143f32;text-decoration:underline':''}">${esc(label.name)}</text>`).join('')+visible.map(p=>`<text x="${p.cx}" y="${p.cy}" class="map-label" style="${fontStyle}">${esc(p.name)}</text>`).join('');
  // SVG text outlines scale differently between browsers. Measure the actual
  // full name, then give the background and selection frame screen-pixel padding.
  const textNodes=[...view.labelLayer.querySelectorAll('[data-map-country-label]')],boxes=textNodes.map((node,index)=>{let box;try{box=node.getBBox?.();}catch{}if(!box||![box.x,box.y,box.width,box.height].every(Number.isFinite)){const label=countryLabels[index],width=labelWidth(label.name)/pixelScale;box={x:label.cx-width/2,y:label.cy-10/pixelScale,width,height:13/pixelScale};}return box;});
  const backdropGroups=[...view.labelLayer.querySelectorAll('[data-map-country-label-backdrop]')];textNodes.forEach((node,index)=>{const box=boxes[index],group=backdropGroups[index],paddingX=5/pixelScale,paddingY=3/pixelScale;for(const rect of group?.querySelectorAll?.('rect')||[]){rect.setAttribute('x',box.x-paddingX);rect.setAttribute('y',box.y-paddingY);rect.setAttribute('width',box.width+paddingX*2);rect.setAttribute('height',box.height+paddingY*2);rect.setAttribute('rx',3/pixelScale);rect.setAttribute('ry',3/pixelScale);}});
  if(focusedLabel&&(!editing||focusedLabel===selectedLabel))textNodes.find(node=>node.getAttribute('data-map-country-label')===focusedLabel)?.focus?.({preventScroll:true});
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
  const {svg,container}=view,doc=container.ownerDocument,win=doc.defaultView||root,listeners=[],keys=new Set();let drag=null,pendingClick=null,pendingPoint=null,pendingLabel=null,frame=0,lastTime=0,shift=false,disposed=false;
  const listen=(target,type,handler,options)=>{target.addEventListener(type,handler,options);listeners.push(()=>target.removeEventListener(type,handler,options));};
  const mode=()=>view.context.options.labelEditMode?'inspect':(['paint','select'].includes(view.context.options.interactionMode)?view.context.options.interactionMode:'inspect');
  const labelId=node=>{const hit=node?.closest?.('[data-map-country-label],[data-map-label-hit]');return hit?.dataset.mapCountryLabel||hit?.dataset.mapLabelHit;};
  const focusLabel=id=>[...view.labelLayer.querySelectorAll('[data-map-country-label]')].find(node=>node.getAttribute('data-map-country-label')===id)?.focus?.({preventScroll:true});
  const chooseLabel=id=>{if(!id||view.labelSelectedCountry===id)return;view.labelSelectedCountry=id;renderLabels(view);};
  const blockedInput=node=>Boolean(node?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"]'));
  const visible=()=>{if(disposed||!container.isConnected||!svg.isConnected||!svg.getClientRects().length)return false;for(let node=container;node&&node.nodeType===1;node=node.parentElement){if(node.hidden||node.getAttribute('aria-hidden')==='true'||(node.tagName==='DIALOG'&&!node.open))return false;}return true;};
  const keyboardTarget=node=>{const toolbar=container.querySelector('.map-toolbar');return Boolean(node&&(node===svg||svg.contains(node)||(toolbar&&toolbar.contains(node)&&node.closest?.('button')))&&!blockedInput(node));};
  const modalBlocks=()=>[...doc.querySelectorAll('dialog[open],[role="dialog"][aria-modal="true"]')].some(node=>!node.contains(svg)&&node.getClientRects().length&&win.getComputedStyle(node).visibility!=='hidden');
  const canMove=()=>visible()&&!doc.hidden&&keyboardTarget(doc.activeElement)&&!modalBlocks();
  const stopKeys=()=>{keys.clear();shift=false;lastTime=0;if(frame)win.cancelAnimationFrame(frame);frame=0;if(!disposed&&view.context&&svg.isConnected)renderLabels(view);};
  const keyboardFrame=time=>{frame=0;if(!keys.size||!canMove()){stopKeys();return;}const dt=lastTime?Math.min(40,time-lastTime)/1000:1/60;lastTime=time;let dx=Number(keys.has('KeyA'))-Number(keys.has('KeyD')),dy=Number(keys.has('KeyW'))-Number(keys.has('KeyS'));const length=Math.hypot(dx,dy),matrix=svg.getScreenCTM?.(),screenScale=matrix?Math.hypot(matrix.a,matrix.b)||1:1;if(length&&dt){const distance=440*(shift?2:1)*dt/screenScale;view.x+=dx/length*distance;view.y+=dy/length*distance;transform(view,false);}frame=win.requestAnimationFrame(keyboardFrame);};
  const clearStroke=stroke=>{if(!stroke)return;for(const [id,before]of stroke.preview){const node=view.nodes.get(id);if(!node)continue;if(before.fill)node.style.setProperty('--province-color',before.fill,before.priority);else node.style.removeProperty('--province-color');node.classList.toggle('map-stroke-preview',before.selected);}};
  const touchProvince=(stroke,id)=>{if(!id||!view.geometry.byId.has(id)||stroke.ids.has(id))return;stroke.ids.add(id);const node=view.nodes.get(id);stroke.preview.set(id,{fill:node.style.getPropertyValue('--province-color'),priority:node.style.getPropertyPriority('--province-color'),selected:node.classList.contains('map-stroke-preview')});if(stroke.mode==='paint')node.style.setProperty('--province-color',color(view.context.options.paintColor));node.classList.add('map-stroke-preview');};
  const pointProvince=(event,fallback)=>{const target=doc.elementFromPoint?.(event.clientX,event.clientY);return (target&&svg.contains(target)?target.closest?.('[data-province]')?.dataset.province:null)||fallback;};
  const traceStroke=event=>{if(!drag?.stroke)return;const stroke=drag.stroke,last=stroke.last||event,distance=Math.hypot(event.clientX-last.clientX,event.clientY-last.clientY),steps=Math.min(256,Math.max(1,Math.ceil(distance/5)));for(let i=1;i<=steps;i++){const clientX=last.clientX+(event.clientX-last.clientX)*i/steps,clientY=last.clientY+(event.clientY-last.clientY)*i/steps;touchProvince(stroke,pointProvince({clientX,clientY}));}stroke.last={clientX:event.clientX,clientY:event.clientY};};
  const release=pointer=>{try{if(svg.hasPointerCapture?.(pointer))svg.releasePointerCapture(pointer);}catch{}};
  const cancel=()=>{const old=drag;drag=null;clearStroke(old?.stroke);if(old){release(old.pointer);view.ignoreClick=true;}pendingClick=null;pendingPoint=null;pendingLabel=null;delete view.labelDragPreview;view.hover.hidden=true;if(view.context&&!disposed)renderLabels(view);};
  const down=event=>{if(event.button!==0||drag||!visible())return;stopKeys();const point=screenPoint(view,event),label=view.context.options.labelEditMode&&labelId(event.target),anchor=label&&view.countryLabelAnchors?.get(label),currentMode=mode();drag={point,x:event.clientX,y:event.clientY,vx:view.x,vy:view.y,province:event.target.closest?.('[data-province]')?.dataset.province,pointer:event.pointerId,moved:false,label:anchor?label:null,anchor:anchor?[anchor.cx,anchor.cy]:null};view.ignoreClick=false;pendingClick=null;pendingPoint=null;pendingLabel=null;if(!anchor&&currentMode!=='inspect'){drag.stroke={mode:currentMode,ids:new Set(),preview:new Map(),last:{clientX:event.clientX,clientY:event.clientY}};touchProvince(drag.stroke,pointProvince(event,drag.province));}if(anchor){chooseLabel(label);focusLabel(label);}else svg.focus({preventScroll:true});try{svg.setPointerCapture?.(event.pointerId);}catch{}view.hover.hidden=true;if(anchor||drag.stroke)event.preventDefault();};
  const previewLabel=point=>{const position=[Math.max(0,Math.min(view.template.width,drag.anchor[0]+(point.x-drag.point.x)/view.scale)),Math.max(0,Math.min(view.template.height,drag.anchor[1]+(point.y-drag.point.y)/view.scale))];view.labelDragPreview={id:drag.label,position};renderLabels(view);return position;};
  const move=event=>{
   if(drag){if(event.pointerId!==drag.pointer)return;if(!visible()){cancel();return;}const point=screenPoint(view,event);if(Math.hypot(event.clientX-drag.x,event.clientY-drag.y)>5)drag.moved=true;if(drag.stroke){if(mode()!==drag.stroke.mode){cancel();return;}traceStroke(event);return;}if(drag.moved){if(drag.label){if(!view.context.options.labelEditMode){cancel();return;}previewLabel(point);}else{view.x=drag.vx+point.x-drag.point.x;view.y=drag.vy+point.y-drag.point.y;transform(view);}}return;}
   if(view.context.options.labelEditMode&&labelId(event.target)){view.hover.hidden=true;return;}
   const p=view.geometry.byId.get(event.target.closest?.('[data-province]')?.dataset.province);view.hover.hidden=!p;if(p){const text=regionText(view,p);if(view.hover.textContent!==text)view.hover.textContent=text;}
  };
  const up=event=>{if(!drag||event.pointerId!==drag.pointer)return;if(!visible()){cancel();return;}const old=drag;if(old.stroke){if(mode()!==old.stroke.mode){cancel();return;}traceStroke(event);const ids=[...old.stroke.ids],strokeMode=old.stroke.mode;drag=null;clearStroke(old.stroke);release(old.pointer);pendingClick=null;pendingPoint=null;view.ignoreClick=true;if(ids.length)view.context.options.onProvinceStroke?.(ids,{mode:strokeMode});return;}const label=old.label,moved=old.moved,point=screenPoint(view,event),position=label&&moved&&view.context.options.labelEditMode?previewLabel(point):null;view.ignoreClick=moved;pendingClick=moved?null:old.province;pendingPoint=moved?null:point;pendingLabel=!moved?label:null;drag=null;delete view.labelDragPreview;release(old.pointer);if(position)view.context.options.onLabelMove?.(label,position);else if(label&&!view.context.options.labelPlacementCountry)view.context.options.onLabelSelect?.(label);if(!disposed){pendingLabel=!moved?label:null;renderLabels(view);if(label)focusLabel(label);}};
  const lostCapture=()=>{if(drag)cancel();};
  const wheel=event=>{event.preventDefault();if(drag)return;stopKeys();const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?view.template.height:1);zoom(view,Math.exp(-Math.max(-400,Math.min(400,pixels))*.002),screenPoint(view,event));view.hover.hidden=true;};
  const leave=()=>{view.hover.hidden=true;};
  const click=event=>{
   const tool=event.target.closest?.('[data-map-tool]')?.dataset.mapTool;
   if(tool){stopKeys();if(tool==='in')zoom(view,1.4);if(tool==='out')zoom(view,1/1.4);if(tool==='reset'){view.scale=1;view.x=0;view.y=0;transform(view);}if(tool==='country')focusCountry(view,view.context.scenario.map?.playerCountry);if(tool==='countries'){view.countryLabels=!view.countryLabels;event.target.closest('[data-map-tool]').setAttribute('aria-pressed',String(view.countryLabels));view.labelSignature='';renderLabels(view);}if(tool==='labels'){view.labels=!view.labels;event.target.closest('[data-map-tool]').setAttribute('aria-pressed',String(view.labels));view.labelSignature='';renderLabels(view);}return;}
   const focus=event.target.closest?.('[data-map-country]')?.dataset.mapCountry;if(focus){stopKeys();focusCountry(view,focus);return;}
   if(view.context.options.labelEditMode&&view.context.options.labelPlacementCountry&&svg.contains(event.target)){pendingClick=null;pendingLabel=null;if(!view.ignoreClick){const point=pendingPoint||screenPoint(view,event);if(point.x>=0&&point.x<=view.template.width&&point.y>=0&&point.y<=view.template.height)view.context.options.onLabelMove?.(view.context.options.labelPlacementCountry,labelPoint(view,point));}pendingPoint=null;view.ignoreClick=false;return;}
   const clickedLabel=view.context.options.labelEditMode&&(labelId(event.target)||pendingLabel);if(clickedLabel){const pointerLabel=pendingLabel;pendingLabel=null;pendingClick=null;pendingPoint=null;if(!view.ignoreClick){chooseLabel(clickedLabel);if(!pointerLabel)view.context.options.onLabelSelect?.(clickedLabel);}view.ignoreClick=false;return;}
   const id=event.target.closest?.('[data-province]')?.dataset.province||(event.target===svg?pendingClick:null);pendingClick=null;pendingPoint=null;
   if(!view.ignoreClick){if(id&&mode()==='inspect')select(view,id);else if(!id&&svg.contains(event.target))clearSelection(view);}view.ignoreClick=false;
  };
  const outside=event=>{
   if(!visible()||drag||!event.target.isConnected||svg.contains(event.target)||event.target.closest?.('button,a,input,textarea,select,label,summary,[role="button"],[role="combobox"],[contenteditable]:not([contenteditable="false"])'))return;
   clearSelection(view);
  };
  const key=event=>{
   if(event.isComposing||event.keyCode===229||event.ctrlKey||event.altKey||event.metaKey||blockedInput(event.target)){stopKeys();return;}
   if(event.code==='ShiftLeft'||event.code==='ShiftRight'){shift=true;return;}
   if(['KeyW','KeyA','KeyS','KeyD'].includes(event.code)&&keyboardTarget(event.target)&&canMove()){event.preventDefault();if(drag)return;keys.add(event.code);shift=event.shiftKey;view.hover.hidden=true;if(!frame)frame=win.requestAnimationFrame(keyboardFrame);return;}
   const label=view.context.options.labelEditMode&&labelId(event.target);if(label){chooseLabel(label);if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const anchor=view.countryLabelAnchors?.get(label),matrix=svg.getScreenCTM?.(),screenScale=matrix?Math.hypot(matrix.a,matrix.b)||1:1,step=(event.shiftKey?10:1)/(view.scale*screenScale);if(anchor){const point=[Math.max(0,Math.min(view.template.width,anchor.cx+(event.key==='ArrowRight'?step:event.key==='ArrowLeft'?-step:0))),Math.max(0,Math.min(view.template.height,anchor.cy+(event.key==='ArrowDown'?step:event.key==='ArrowUp'?-step:0)))];view.context.options.onLabelMove?.(label,point);focusLabel(label);}}else if(event.key==='Enter'||event.key===' '){event.preventDefault();view.context.options.onLabelSelect?.(label);}return;}
   if(event.key==='Enter'||event.key===' '){const id=event.target.closest?.('[data-province]')?.dataset.province;if(id&&mode()==='inspect'){event.preventDefault();select(view,id);}}else if(event.target===svg&&['+','=','-','0'].includes(event.key)){event.preventDefault();if(event.key==='0'){view.scale=1;view.x=view.y=0;transform(view);}else zoom(view,event.key==='-'?1/1.4:1.4);}
  };
  const keyup=event=>{if(event.code==='ShiftLeft'||event.code==='ShiftRight')shift=false;if(keys.delete(event.code)&&!keys.size)stopKeys();if(event.ctrlKey||event.altKey||event.metaKey)stopKeys();};
  const focusIn=event=>{if(!keyboardTarget(event.target))stopKeys();else if(view.context.options.labelEditMode)chooseLabel(labelId(event.target));};
  const visibility=()=>{if(doc.hidden){stopKeys();cancel();}};
  const blur=()=>{stopKeys();cancel();};
  const change=event=>event.target.value?select(view,event.target.value):clearSelection(view),search=()=>renderSearch(view);
  const layers=event=>{const layer=event.target.dataset?.mapLayer;if(layer==='influence')view.showInfluence=event.target.checked;else if(layer==='occupation')view.showOccupation=event.target.checked;else return;update(view);};
  container.querySelector('[data-map-layer="influence"]').checked=view.showInfluence;
  container.querySelector('[data-map-layer="occupation"]').checked=view.showOccupation;
  for(const [type,handler]of Object.entries({pointerdown:down,pointermove:move,pointerup:up,pointercancel:cancel,lostpointercapture:lostCapture,pointerleave:leave,wheel}))listen(svg,type,handler,type==='wheel'?{passive:false}:undefined);
  listen(container,'keydown',key);listen(container,'click',click);listen(container,'change',layers);listen(view.select,'change',change);listen(view.search,'input',search);listen(doc,'click',outside);listen(doc,'keyup',keyup,true);listen(doc,'focusin',focusIn);listen(doc,'visibilitychange',visibility);listen(win,'blur',blur);listen(container,'compositionstart',stopKeys);
  const resize=()=>{if(view.context&&!disposed){view.labelSignature='';renderLabels(view);}};let observer=null;if(typeof win.ResizeObserver==='function'){observer=new win.ResizeObserver(resize);observer.observe(svg);}else listen(win,'resize',resize);if(doc.fonts?.addEventListener)listen(doc.fonts,'loadingdone',resize);
  view.cancelInteraction=()=>{stopKeys();cancel();};
  view.dispose=()=>{if(disposed)return;stopKeys();cancel();disposed=true;observer?.disconnect();for(const remove of listeners)remove();};
 }
 function update(view){
  const {map,reference,countries}=view.context;let diff=0;const overlay=[],patterns=new Map(),legend=new Map();
  const editing=Boolean(view.context.options.labelEditMode),ownedBounds=new Map(),countryBounds=new Map([...countries].filter(([,c])=>Array.isArray(c.focusBounds)&&c.focusBounds.length===4&&c.focusBounds.every(Number.isFinite)).map(([id,c])=>[id,c.focusBounds]));view.countryLabelAnchors=new Map();
  const patternId=(id,type)=>{const key=type+'|'+id;if(!patterns.has(key))patterns.set(key,{id:view.uid+type+patterns.size,color:color(countries.get(id)?.color),reverse:type==='i'});return patterns.get(key).id;};
  for(const p of view.template.provinces){
   const id=p.id,owner=ownerOf(view,p),occupier=map.occupation?.[id],influence=map.influence?.[id],fill=color(countries.get(owner)?.color),different=Boolean(reference&&['owners','occupation','influence','markers'].some(k=>(map[k]?.[id]??null)!==(reference[k]?.[id]??null)));
   legend.set(owner,fill);if(different)diff++;
   const bounds=countryBounds.get(owner);if(bounds&&p.cx>=bounds[0]&&p.cx<=bounds[2]&&p.cy>=bounds[1]&&p.cy<=bounds[3]){const distance=(p.cx-(bounds[0]+bounds[2])/2)**2+(p.cy-(bounds[1]+bounds[3])/2)**2,previous=view.countryLabelAnchors.get(owner);if(!previous||distance<previous.distance)view.countryLabelAnchors.set(owner,{id:owner,cx:p.cx,cy:p.cy,bounds,distance,area:(bounds[2]-bounds[0])*(bounds[3]-bounds[1])});}
   if(countries.get(owner)?.labelPosition!==null){const box=ownedLabelBounds(view,p),previous=ownedBounds.get(owner);if(previous){previous.bounds=[Math.min(previous.bounds[0],box[0]),Math.min(previous.bounds[1],box[1]),Math.max(previous.bounds[2],box[2]),Math.max(previous.bounds[3],box[3])];previous.provinces.push(p);}else ownedBounds.set(owner,{bounds:box.slice(),provinces:[p]});}
   const signature=fill+'|'+different;if(view.signatures.get(id)!==signature){const node=view.nodes.get(id);node?.setAttribute('style','--province-color:'+fill);node?.classList.toggle('map-diff',different);view.signatures.set(id,signature);}
   if(occupier&&view.showOccupation)overlay.push(`<path class="map-layer" data-map-overlay="occupation" d="${esc(p.path)}" transform="${geometryOffset(view.template)}" fill="url(#${patternId(occupier,'o')})"/>`);
   if(influence&&view.showInfluence)overlay.push(`<path class="map-layer" data-map-overlay="influence" d="${esc(p.path)}" transform="${geometryOffset(view.template)}" fill="url(#${patternId(influence,'i')})"/>`);
  }
  // Every owned country gets an automatic anchor, including unmodified template
  // countries in gallery/player views. Pick an owned province near its extent.
  for(const [id,{bounds,provinces}]of ownedBounds){if(view.countryLabelAnchors.has(id))continue;let anchor=null,distance=Infinity;for(const p of provinces){const next=(p.cx-(bounds[0]+bounds[2])/2)**2+(p.cy-(bounds[1]+bounds[3])/2)**2;if(next<distance){distance=next;anchor=p;}}if(anchor)view.countryLabelAnchors.set(id,{id,cx:anchor.cx,cy:anchor.cy,bounds,area:(bounds[2]-bounds[0])*(bounds[3]-bounds[1])});}
  // Saved positions are in the template's local coordinates, matching province
  // centroids. They do not move as ownership, zoom or automatic labels change.
  for(const [id,c]of countries){if(c.labelPosition===null){view.countryLabelAnchors.delete(id);continue;}if(manualLabelPosition(c.labelPosition)&&(legend.has(id)||(editing&&view.context.options.labelPlacementCountry===id))){const previous=view.countryLabelAnchors.get(id);view.countryLabelAnchors.set(id,{...previous,id,cx:c.labelPosition[0],cy:c.labelPosition[1],bounds:previous?.bounds||[0,0,view.template.width,view.template.height],area:previous?.area||0,manual:true});}}
  const interaction=editing?'inspect':view.context.options.interactionMode,selectedIds=new Set(view.context.options.selectedProvinces||[]);for(const id of view.brushSelection||[])if(!selectedIds.has(id))view.nodes.get(id)?.classList.remove('map-brush-selected');for(const id of selectedIds)if(!view.brushSelection?.has(id))view.nodes.get(id)?.classList.add('map-brush-selected');view.brushSelection=selectedIds;
  view.labelLayer.setAttribute('aria-hidden',String(!editing));view.svg.setAttribute('role',editing?'group':'img');view.svg.setAttribute('tabindex','0');view.svg.style.cursor=(editing&&view.context.options.labelPlacementCountry)||interaction==='paint'||interaction==='select'?'crosshair':'';
  const hint=view.container.querySelector('.map-gesture-hint');if(hint)hint.textContent=editing?(view.context.options.labelPlacementCountry?`${country(view,view.context.options.labelPlacementCountry)} 국명 위치를 누르세요 · WASD 이동`:'국명을 드래그해 이동 · 화살표 키로 미세 조정 · WASD 이동'):interaction==='paint'?'드래그로 칠하기 · WASD 이동 · Shift로 빠르게 · 휠 확대·축소':interaction==='select'?'드래그로 여러 지역 선택 · WASD 이동 · 휠 확대·축소':'지도를 클릭한 뒤 WASD · Shift로 빠르게 · 휠 확대·축소 · 드래그 이동';
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
  let view=views.get(container);if(!view||view.template!==cfg.template||view.scenarioKey!==scenarioKey||!container.contains(view.svg)){view=createView(container,cfg.template,scenarioKey);const camera=options.initialCamera;if(camera?.templateId===cfg.template.id&&['scale','x','y'].every(key=>Number.isFinite(camera[key]))){view.scale=Math.max(1,Math.min(MAX_ZOOM,camera.scale));view.x=camera.x;view.y=camera.y;}}else view.cancelInteraction?.();
  if(options.labelEditMode&&!view.context?.options.labelEditMode)view.countryLabels=true;
  view.context={...cfg,scenario,map:state?.map||initialState(scenario).map,reference:options.compareState?.map,options};
  if(Object.prototype.hasOwnProperty.call(options,'selectedLabelCountry')){const next=options.selectedLabelCountry||'';if(view.externalLabelCountry!==next){view.labelSelectedCountry=next;view.externalLabelCountry=next;}}
  update(view);
 }
 function dispose(container){views.get(container)?.dispose();views.delete(container);}
 function getCamera(container){const view=views.get(container);return view?{templateId:view.template.id,scale:view.scale,x:view.x,y:view.y}:null;}
 root.MapView={render,initialState,dispose,getCamera};
})(typeof globalThis!=='undefined'?globalThis:this);
