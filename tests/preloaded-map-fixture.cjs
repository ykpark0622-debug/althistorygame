'use strict';
// Legacy DOM tests exercise editing and replay with maps already available.
// Browser request isolation and failed async loads have separate loader/UI tests.
const path=require('node:path'),vm=require('node:vm');
const maps=require(path.resolve(__dirname,'../map-templates.js'));
module.exports=function install(context){
 context.__fixtureMapGet=id=>maps.get(id);
 vm.runInContext(`{const registry=MapTemplates,read=registry.get.bind(registry);registry.get=id=>{let value=read(id);if(!value){value=__fixtureMapGet(id);if(value)registry.register(value);}return value;};}`,context);
};
