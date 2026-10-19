'use strict';
const {spawnSync}=require('node:child_process'),path=require('node:path');
for(const file of ['build.cjs','tests/engine-v2.cjs','tests/ai-gallery-v2.cjs','tests/editor-v2-smoke.cjs','tests/flow-reign-smoke.cjs','tests/release-compat.cjs']){
 const result=spawnSync(process.execPath,[path.join(__dirname,file)],{cwd:__dirname,stdio:'inherit'});
 if(result.error)throw result.error;if(result.status!==0)process.exit(result.status||1);
}
console.log('All suites passed. Production login/database are not exercised by these offline tests.');
