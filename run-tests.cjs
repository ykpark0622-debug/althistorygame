'use strict';
const {spawnSync}=require('node:child_process'),path=require('node:path');
for(const file of ['build.cjs','tests/program-download.cjs','tests/map-loader.cjs','tests/map-build-fallback.cjs','tests/map-region-build-source.cjs','tests/engine-v2.cjs','tests/ai-gallery-v2.cjs','tests/editor-v2-smoke.cjs','tests/editor-regional-country.cjs','tests/flow-reign-smoke.cjs','tests/detailed-map.cjs','tests/regional-maps.cjs','tests/imjin-sample.cjs','tests/map-document.cjs','tests/gallery-maps.cjs','tests/release-compat.cjs','tests/app-lazy-loading.cjs']){
 const result=spawnSync(process.execPath,[path.join(__dirname,file)],{cwd:__dirname,stdio:'inherit'});
 if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);
}
console.log('All suites passed. Production login/database are not exercised by these offline tests.');
