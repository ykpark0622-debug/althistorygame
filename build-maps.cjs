const fs=require('node:fs'),path=require('node:path');
const palette=['#648d75','#c4a85b','#ad705e','#6c91b0','#9d82b3','#8a9e63','#c28d53','#709d98','#b87789','#7b8998'];
const names={joseon:'조선',ming:'명',jianzhou:'건주 여진',odori:'오도리 여진',japan:'일본',tsushima:'쓰시마 소 씨',ryukyu:'류큐',tatar:'타타르',oirat:'오이라트',other:'기타 세력',france:'프랑스',britain:'영국',spain:'스페인',portugal:'포르투갈',dutch:'네덜란드',austria:'오스트리아',prussia:'프로이센',hre:'독일 제후국',savoy:'사르데냐',genoa:'제노바',italy:'이탈리아 국가들',swiss:'스위스',lorraine:'로렌 공국',corsica:'코르시카 공화국',denmark:'덴마크',sweden:'스웨덴',poland:'폴란드',russia:'러시아',ottoman:'오스만 제국',persia:'페르시아',india:'인도 제후국',qing:'청',usa:'미국',native:'원주민'};
const colors={joseon:'#648d75',ming:'#c4a85b',japan:'#ad705e',tsushima:'#9d82b3',france:'#4c72b2',britain:'#bd645c',spain:'#c8a649',austria:'#97abb8',native:'#a8a38a'};
function block(html,id){const m=html.match(new RegExp('<script[^>]*id="'+id+'"[^>]*>([\\s\\S]*?)<\\/script>'));if(!m)throw Error('Missing '+id);return JSON.parse(m[1]);}
function make(file,id,name,width,height){
 const {topology:topo,metadata:meta}=JSON.parse(fs.readFileSync(file,'utf8'));
 const geoms=topo.objects[Object.keys(topo.objects)[0]].geometries;
 const arcs=topo.arcs.map(arc=>{let x=0,y=0;return arc.map(p=>{x+=p[0];y+=p[1];return topo.transform?[x*topo.transform.scale[0]+topo.transform.translate[0],y*topo.transform.scale[1]+topo.transform.translate[1]]:p;});});
 function ring(refs){let out=[];for(const ref of refs){let points=arcs[ref<0?~ref:ref];if(ref<0)points=[...points].reverse();out.push(...(out.length?points.slice(1):points));}return out;}
 const polygons=geoms.map(g=>(g.type==='Polygon'?[g.arcs]:g.arcs).map(poly=>poly.map(ring)));
 const project=([lon,lat])=>id==='world1754'?[lon,-lat*1.25]:[lon*Math.cos(35*Math.PI/180),-lat];
 const all=polygons.flat(3).length; if(!all)throw Error('Empty geometry');
 const coords=polygons.flat(3).map(project);
 const xs=coords.map(p=>p[0]),ys=coords.map(p=>p[1]);
 const bounds=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
 const scale=Math.min((width-20)/(bounds[2]-bounds[0]),(height-20)/(bounds[3]-bounds[1]));
 const dx=(width-scale*(bounds[2]-bounds[0]))/2,dy=(height-scale*(bounds[3]-bounds[1]))/2;
 const xy=p=>{const [x,y]=project(p);return [+(dx+(x-bounds[0])*scale).toFixed(1),+(dy+(y-bounds[1])*scale).toFixed(1)];};
 const provinces=geoms.map((g,i)=>{
  const rings=polygons[i].flat().map(r=>r.map(xy));
  let best=[],bestArea=-1;
  for(const pts of rings){let a=0;for(let j=0;j<pts.length;j++){const b=pts[(j+1)%pts.length];a+=pts[j][0]*b[1]-b[0]*pts[j][1];}if(Math.abs(a)>bestArea){bestArea=Math.abs(a);best=pts;}}
  let area=0,cx=0,cy=0;for(let j=0;j<best.length;j++){const a=best[j],b=best[(j+1)%best.length],cross=a[0]*b[1]-b[0]*a[1];area+=cross;cx+=(a[0]+b[0])*cross;cy+=(a[1]+b[1])*cross;}
  if(Math.abs(area)>0.01){cx/=3*area;cy/=3*area;}else{cx=best[0]?.[0]||0;cy=best[0]?.[1]||0;}
  const svg=rings.map(pts=>{let s='';for(let j=0;j<pts.length;j++){const p=pts[j];s+=(j===0||Math.abs(p[0]-pts[j-1][0])>width/2?'M':'L')+p.join(',');}return s+'Z';}).join('');
  const m=meta[g.id]||{};return {id:g.id,name:m.name||g.id,owner:m.owner||'other',note:m.note||'',influence:m.infl||null,path:svg,cx:+cx.toFixed(1),cy:+cy.toFixed(1),area:Math.round(bestArea/2)};
 });
 const countryIds=[...new Set([...Object.keys(names).filter(k=>provinces.some(p=>p.owner===k||p.influence===k)),...provinces.map(p=>p.owner)])];
 if(id==='world1754'&&!countryIds.includes('usa'))countryIds.push('usa');
 return {id,name,width,height,provinces,countries:countryIds.map((key,i)=>({id:key,name:names[key]||key,color:colors[key]||palette[i%palette.length]})),notice:'현대 행정구역을 묶어 재구성한 시나리오용 지도입니다. 당시의 정확한 경계·실효 지배와 다를 수 있습니다.',source:'Made with Natural Earth · 사용자 제공 시연판의 지도 데이터 재사용'};
}
const templates=[make(path.join(__dirname,'tools/map-source/eastasia1419.json'),'eastasia1419','동아시아 1419년',1000,720),make(path.join(__dirname,'tools/map-source/world1754.json'),'world1754','세계 1754년',1100,600)];
fs.writeFileSync(path.join(__dirname,'map-templates.js'),`/* Made with Natural Earth. https://www.naturalearthdata.com/about/terms-of-use/ */\n(function(root){'use strict';const templates=${JSON.stringify(templates)};const api={get:id=>templates.find(t=>t.id===id)||null,list:()=>templates.map(t=>({id:t.id,name:t.name,provinceCount:t.provinces.length}))};root.MapTemplates=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;})(typeof globalThis!=='undefined'?globalThis:this);\n`);
console.log(JSON.stringify(templates.map(t=>({id:t.id,provinces:t.provinces.length,countries:t.countries.length})),null,2));
