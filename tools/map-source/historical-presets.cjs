/* Historical political layouts on the unchanged balanced province grid.
 * Political definitions are injected once from historical-presets.json by
 * the asset and offline builders. Geometry and original source credits stay
 * in their existing shared base templates.
 */
(function(root){
  'use strict';
  const registry=root.MapTemplates,definitions=root.HistoricalMapPresetDefinitions;
  if(!registry)throw new Error('MapTemplates must load before historical presets.');
  if(registry.historicalPresets){if(typeof module!=='undefined'&&module.exports)module.exports=registry;return;}
  if(!Array.isArray(definitions)||!definitions.length)throw new Error('Historical political definitions are missing.');
  const originalGet=registry.get.bind(registry),originalList=registry.list.bind(registry),cache=new Map();
  const copy=value=>JSON.parse(JSON.stringify(value));
  const ids=new Set();
  for(const definition of definitions){
    if(!definition||typeof definition.id!=='string'||ids.has(definition.id)||typeof definition.baseId!=='string'||!Array.isArray(definition.countries)||!definition.owners)throw new Error('Invalid historical preset definition.');
    ids.add(definition.id);
  }
  function make(definition){
    if(cache.has(definition.id))return cache.get(definition.id);
    const base=originalGet(definition.baseId);
    if(!base)return null;
    const countries=copy(definition.countries),countryIds=new Set(countries.map(country=>country.id));
    if(countryIds.size!==countries.length)throw new Error('Duplicate historical country: '+definition.id);
    const provinces=base.provinces.map(province=>{
      const owner=definition.owners[province.id];
      if(!countryIds.has(owner))throw new Error('Historical owner is missing: '+definition.id+' / '+province.id);
      const next=Object.assign({},province,{owner});
      delete next.influence;
      const influence=definition.influence&&definition.influence[province.id];
      if(influence!=null){
        if(!countryIds.has(influence))throw new Error('Unknown historical influence: '+definition.id+' / '+province.id);
        next.influence=influence;
      }
      return next;
    });
    const provinceIds=new Set(provinces.map(province=>province.id));
    const historicalInitial={occupation:{},markers:{}};
    for(const [layer,values]of [['occupation',definition.occupation],['markers',definition.markers]])for(const [province,value]of Object.entries(values||{})){
      if(!provinceIds.has(province))throw new Error('Unknown historical '+layer+' province: '+definition.id+' / '+province);
      if(layer==='occupation'&&!countryIds.has(value))throw new Error('Unknown historical occupation: '+definition.id+' / '+province);
      if(layer==='markers'&&(typeof value!=='string'||!value))throw new Error('Invalid historical marker: '+definition.id+' / '+province);
      historicalInitial[layer][province]=value;
    }
    const template=Object.assign({},base,{
      id:definition.id,name:definition.name,countries,provinces,
      historicalBaseId:definition.baseId,historicalRegionId:definition.regionId,
      historicalEraId:definition.eraId,historicalYear:definition.year,
      historicalInitial,
      historicalNotice:definition.notice,
      notice:definition.notice+' '+(base.notice||'')
    });
    // Historical presets are small political patches, not additional full
    // geometry sources for the downloadable offline program.
    template.recommended=false;
    delete template.balancedRegionId;
    delete template.regionId;
    delete template.eraId;
    if(definition.source)template.historicalSource=copy(definition.source);
    if(definition.sources)template.sources=[...(base.sources||[]),...copy(definition.sources)];
    if(definition.playerCountry)template.defaultPlayerCountry=definition.playerCountry;
    cache.set(definition.id,template);return template;
  }
  registry.historicalPresets=()=>definitions.map(definition=>({id:definition.id,baseId:definition.baseId,regionId:definition.regionId,eraId:definition.eraId,name:definition.name,year:definition.year,notice:definition.notice}));
  registry.get=id=>{const definition=definitions.find(item=>item.id===id);return definition?make(definition):originalGet(id);};
  registry.list=()=>originalList().concat(definitions.map(definition=>({
    id:definition.id,name:definition.name,provinceCount:make(definition).provinces.length,
    historicalBaseId:definition.baseId,historicalRegionId:definition.regionId,
    historicalEraId:definition.eraId,historicalYear:definition.year,historicalNotice:definition.notice
  })));
  // The closure owns the definitions; leave no extra application-level global.
  delete root.HistoricalMapPresetDefinitions;
  if(typeof module!=='undefined'&&module.exports)module.exports=registry;
})(typeof globalThis!=='undefined'?globalThis:this);
