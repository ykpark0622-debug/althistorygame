/* Readable regional views derived from the existing world-balanced template.
 * Coordinates in SVG paths stay in the world projection; labels, bounds and
 * focus rectangles are crop-local, as required by map-view.js.
 * Source and individual data licences: WORLD-MAP-SOURCES.md.
 * This source runs during both asset generation and the offline HTML build.
 */
(function(root){
  'use strict';
  const registry=root.MapTemplates;
  if(!registry)throw new Error('MapTemplates must load before balanced regional maps.');
  if(registry.balancedRegions){if(typeof module!=='undefined'&&module.exports)module.exports=registry;return;}
  const originalGet=registry.get.bind(registry),originalList=registry.list.bind(registry);
  const definitions=[
    {id:'balanced_eastasia_modern',regionId:'eastasia',eraId:'balanced_modern',name:'동아시아 · 균형 지도',bounds:[73,15,150,55]},
    {id:'balanced_asia_modern',regionId:'asia',eraId:'balanced_modern',name:'아시아 전체 · 균형 지도',bounds:[25,-12,180,80]},
    {id:'balanced_north_america_modern',regionId:'north_america',eraId:'balanced_modern',name:'북아메리카 · 균형 지도',bounds:[-180,5,-10,84]},
    {id:'balanced_south_america_modern',regionId:'south_america',eraId:'balanced_modern',name:'남아메리카 · 균형 지도',bounds:[-85,-58,-30,15]}
  ];
  // Match the existing regional authoring presets, including neighbouring
  // islands and overseas territories. Physical background is cropped without
  // this ownership filter so non-editable neighbouring land remains visible.
  const memberships={
    eastasia:new Set('chn mng kor prk jpn twn hkg mac rus'.split(' ')),
    asia:new Set('afg arm aze bhr bgd btn brn khm chn cyp geo hkg ind idn irn irq isr jpn jor kaz kwt kgz lao lbn mac mys mdv mng mmr npl prk omn pak phl qat rus sau sgp kor lka syr twn tjk tha tls tur tkm are uzb vnm yem esb pse cyn cnm kas wsb scr iot'.split(' ')),
    north_america:new Set('usa can mex grl cub hti dom jam bhs blz gtm hnd slv nic cri pan atg brb dma grd kna lca vct tto pri maf sxm abw cuw tca spm msr vir blm aia vgb cym bmu bjn ser fra gbr nld col'.split(' ')),
    south_america:new Set('arg bol bra chl col ecu flk guy pry per sur ury ven sgs fra'.split(' '))
  };
  const cache=new Map(),geometryCache=new Map();
  // Tiny countries and islands in the balanced source use four decimals.
  // Retain that precision when translating bounds or clipping boundary shapes;
  // a tenth-pixel rounding can otherwise flatten a selectable tiny province.
  const round=value=>Math.round(value*10000)/10000;
  const same=(a,b)=>a[0]===b[0]&&a[1]===b[1];
  const inside=(point,rect)=>point[0]>=rect[0]&&point[0]<=rect[2]&&point[1]>=rect[1]&&point[1]<=rect[3];
  const overlaps=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
  function parsePath(path){
    const parts=[];let current=null,match;
    const commands=/([ML])(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)|(Z)/g;
    while((match=commands.exec(path||''))){
      if(match[4]){if(current)current.closed=true;continue;}
      if(match[1]==='M'){current={points:[],closed:false};parts.push(current);}
      if(current)current.points.push([+match[2],+match[3]]);
    }
    return parts;
  }
  function compact(points,closed){
    const result=[];
    for(const point of points){const next=[round(point[0]),round(point[1])];if(!result.length||!same(result[result.length-1],next))result.push(next);}
    if(closed&&result.length>1&&same(result[0],result[result.length-1]))result.pop();
    return result;
  }
  function signedArea(points){
    let area=0;for(let i=0,j=points.length-1;i<points.length;j=i++)area+=points[j][0]*points[i][1]-points[i][0]*points[j][1];
    return area/2;
  }
  function clipRing(ring,rect){
    let output=ring;
    for(let edge=0;edge<4&&output.length;edge++){
      const axis=edge%2,limit=rect[edge],keepGreater=edge<2,input=output;output=[];
      const keep=point=>keepGreater?point[axis]>=limit:point[axis]<=limit;
      let previous=input[input.length-1],previousInside=keep(previous);
      for(const point of input){
        const currentInside=keep(point);
        if(currentInside!==previousInside){
          const factor=(limit-previous[axis])/(point[axis]-previous[axis]);
          const intersection=[previous[0]+factor*(point[0]-previous[0]),previous[1]+factor*(point[1]-previous[1])];
          intersection[axis]=limit;output.push(intersection);
        }
        if(currentInside)output.push(point);
        previous=point;previousInside=currentInside;
      }
    }
    output=compact(output,true);
    return output.length>=3&&Math.abs(signedArea(output))>1e-10?output:[];
  }
  function clipSegment(start,end,rect){
    let low=0,high=1;
    const dx=end[0]-start[0],dy=end[1]-start[1],p=[-dx,dx,-dy,dy],q=[start[0]-rect[0],rect[2]-start[0],start[1]-rect[1],rect[3]-start[1]];
    for(let edge=0;edge<4;edge++){
      if(p[edge]===0){if(q[edge]<0)return null;}
      else{const ratio=q[edge]/p[edge];if(p[edge]<0)low=Math.max(low,ratio);else high=Math.min(high,ratio);if(low>high)return null;}
    }
    return[[round(start[0]+low*dx),round(start[1]+low*dy)],[round(start[0]+high*dx),round(start[1]+high*dy)]];
  }
  function clipLine(points,rect){
    const result=[];let current=null;
    for(let index=1;index<points.length;index++){
      const segment=clipSegment(points[index-1],points[index],rect);
      if(!segment||same(segment[0],segment[1])){current=null;continue;}
      if(current&&same(current[current.length-1],segment[0]))current.push(segment[1]);
      else{current=segment;result.push(current);}
    }
    return result;
  }
  function encode(points,closed){return points.map((point,index)=>(index?'L':'M')+point[0]+','+point[1]).join('')+(closed?'Z':'');}
  function clipParts(parts,rect){
    const result=[];let bbox=[Infinity,Infinity,-Infinity,-Infinity],area=0;
    for(const part of parts){
      const rings=part.closed?[clipRing(part.points,rect)]:clipLine(part.points,rect);
      for(const points of rings){
        if(!points.length)continue;
        result.push(encode(points,part.closed));
        if(part.closed)area+=signedArea(points);
        for(const point of points){bbox[0]=Math.min(bbox[0],point[0]);bbox[1]=Math.min(bbox[1],point[1]);bbox[2]=Math.max(bbox[2],point[0]);bbox[3]=Math.max(bbox[3],point[1]);}
      }
    }
    return{path:result.join(''),bbox,area:round(Math.abs(area))};
  }
  function physical(source,key,rect){
    if(!geometryCache.has(key))geometryCache.set(key,parsePath(source[key]));
    return clipParts(geometryCache.get(key),rect).path;
  }
  function make(definition){
    if(cache.has(definition.id))return cache.get(definition.id);
    const source=originalGet('world-balanced');
    if(!source)return null;
    const [west,south,east,north]=definition.bounds;
    const rect=[(west+180)*6,(90-north)*6,(east+180)*6,(90-south)*6];
    const offsetX=rect[0],offsetY=rect[1],localBounds=bounds=>bounds.map((value,index)=>round(value-(index%2?offsetY:offsetX)));
    const provinces=[],owners=new Map();
    for(const province of source.provinces){
      if(!memberships[definition.regionId].has(province.owner))continue;
      if(province.bbox&&!overlaps(province.bbox,rect))continue;
      let geometry;
      if(province.bbox&&inside([province.bbox[0],province.bbox[1]],rect)&&inside([province.bbox[2],province.bbox[3]],rect))geometry={path:province.path,bbox:province.bbox,area:province.area};
      else geometry=clipParts(parsePath(province.path),rect);
      if(!geometry.path)continue;
      // A cross-border source centre can lie outside the selected viewport.
      // Put its label inside the clipped geometry's bounding rectangle instead.
      const cx=Math.max(geometry.bbox[0],Math.min(geometry.bbox[2],province.cx));
      const cy=Math.max(geometry.bbox[1],Math.min(geometry.bbox[3],province.cy));
      const local=Object.assign({},province,{path:geometry.path,bbox:localBounds(geometry.bbox),cx:round(cx-offsetX),cy:round(cy-offsetY),area:geometry.area});
      provinces.push(local);
      const prior=owners.get(province.owner);
      owners.set(province.owner,prior?[Math.min(prior[0],local.bbox[0]),Math.min(prior[1],local.bbox[1]),Math.max(prior[2],local.bbox[2]),Math.max(prior[3],local.bbox[3])]:local.bbox.slice());
    }
    const countries=source.countries.map(country=>{
      const result=Object.assign({},country);delete result.focusBounds;
      if(owners.has(country.id))result.focusBounds=owners.get(country.id).slice();
      return result;
    });
    const template=Object.assign({},source,{
      id:definition.id,name:definition.name,recommended:true,balancedRegionId:definition.regionId,
      width:rect[2]-rect[0],height:rect[3]-rect[1],offsetX,offsetY,
      geographicBounds:definition.bounds.slice(),provinces,countries,
      landPath:physical(source,'landPath',rect),waterPath:physical(source,'waterPath',rect),riversPath:physical(source,'riversPath',rect),
      notice:'세계 균형 지도를 '+definition.name.split(' · ')[0]+' 범위로 자른 현대 편집용 지도입니다. 기존 지역별 지도와 같은 범위를 사용하며 주변 일부 국가는 배경으로만 보입니다. '+source.notice,
      balancedCrop:{sourceId:'world-balanced',regionId:definition.regionId,geographicBounds:definition.bounds.slice(),provinceCount:provinces.length,idsPreserved:true}
    });
    cache.set(definition.id,template);return template;
  }
  registry.balancedRegions=()=>definitions.map(definition=>Object.assign({},definition,{bounds:definition.bounds.slice()}));
  registry.get=id=>{const definition=definitions.find(item=>item.id===id);return definition?make(definition):originalGet(id);};
  registry.list=()=>originalList().concat(definitions.map(definition=>({id:definition.id,name:definition.name,recommended:true,balancedRegionId:definition.regionId,provinceCount:make(definition).provinces.length})));
  if(typeof module!=='undefined'&&module.exports)module.exports=registry;
})(typeof globalThis!=='undefined'?globalThis:this);
