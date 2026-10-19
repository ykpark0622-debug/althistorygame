'use strict';
// Update historical owner-mask source, then rebuild the hashed regional assets.
const fs=require('node:fs'),path=require('node:path');
const base=path.resolve(__dirname,'..');
function area(ring){let result=0;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];result+=a[0]*b[1]-b[0]*a[1];}return Math.abs(result/2);}
function simplify(ring){
  // Douglas-Peucker removes redundant coast vertices without filling inner holes.
  function distance(p,a,b){let x=a[0],y=a[1],dx=b[0]-x,dy=b[1]-y;if(dx||dy){const t=((p[0]-x)*dx+(p[1]-y)*dy)/(dx*dx+dy*dy);if(t>1){x=b[0];y=b[1];}else if(t>0){x+=dx*t;y+=dy*t;}}return(p[0]-x)**2+(p[1]-y)**2;}
  function split(points,first,last,out){let index=0,max=0.0025;for(let i=first+1;i<last;i++){const d=distance(points[i],points[first],points[last]);if(d>max){max=d;index=i;}}if(index){if(index-first>1)split(points,first,index,out);out.push(points[index]);if(last-index>1)split(points,index,last,out);}}
  const out=[ring[0]];split(ring,0,ring.length-1,out);out.push(ring[ring.length-1]);
  return(out.length>=4?out:ring).map(p=>p.map(n=>+n.toFixed(2)));
}
function masks(name){
  const {topology:t,metadata}=JSON.parse(fs.readFileSync(path.join(base,'tools/map-source',name+'.json'),'utf8'));
  const arcs=t.arcs.map(arc=>{let x=0,y=0;return arc.map(p=>{if(t.transform){x+=p[0];y+=p[1];return[x*t.transform.scale[0]+t.transform.translate[0],y*t.transform.scale[1]+t.transform.translate[1]];}return p;});});
  function ring(refs){const points=[];for(const ref of refs){let a=arcs[ref<0?~ref:ref];if(ref<0)a=a.slice().reverse();points.push(...(points.length?a.slice(1):a));}return points;}
  return t.objects[Object.keys(t.objects)[0]].geometries.map(g=>{
    let polygons=(g.type==='Polygon'?[g.arcs]:g.arcs).map(poly=>poly.map(ring)).filter(poly=>area(poly[0])>=0.001);
    if(!polygons.length)polygons=(g.type==='Polygon'?[g.arcs]:g.arcs).map(poly=>poly.map(ring));
    const points=polygons.flat(2),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
    return{i:g.id,o:metadata[g.id]?.owner||'other',b:[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)].map(n=>+n.toFixed(3)),p:polygons.map(poly=>poly.map(simplify))};
  });
}
const data={'1419':masks('eastasia1419'),'1754':masks('world1754')};
const file=path.join(base,'tools/map-source/regional-presets.cjs'),original=fs.readFileSync(file,'utf8'),pattern=/\/\* ERA_MASKS_START \*\/[\s\S]*?\/\* ERA_MASKS_END \*\//;
if(!pattern.test(original))throw new Error('Historical-mask markers are missing from tools/map-source/regional-presets.cjs.');
const source=original.replace(pattern,'/* ERA_MASKS_START */'+JSON.stringify(data)+'/* ERA_MASKS_END */');
if(source!==original)fs.writeFileSync(file,source);
console.log('tools/map-source/regional-presets.cjs: '+Buffer.byteLength(source)+' bytes; historical masks '+Buffer.byteLength(JSON.stringify(data))+' bytes');
require('./build-map-assets.cjs');
