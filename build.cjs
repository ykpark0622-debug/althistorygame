'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const dir=__dirname,read=f=>fs.readFileSync(path.join(dir,f),'utf8');
// The web build loads selected regional JSON assets. The downloadable file
// keeps one world geometry plus historical derivation code, avoiding a second
// embedded copy of every overlapping continental view.
function offlineMapScripts(){
 const maps=require('./map-templates.js');
 const sourceIds=['eastasia1419','world1754','world-detailed',...maps.list().filter(template=>template.recommended&&!template.balancedRegionId&&!template.historicalBaseId).map(template=>template.id)];
 const templates=[...new Set(sourceIds)].map(id=>maps.get(id));
 if(templates.some(template=>!template))throw Error('Offline map sources are missing.');
 const registry=`(function(root){'use strict';const templates=${JSON.stringify(templates)};const cache=new Map(templates.map(t=>[t.id,t]));root.MapTemplates={get:id=>cache.get(id)||null,list:()=>templates.map(t=>({id:t.id,name:t.name,provinceCount:t.provinces.length,...(t.recommended?{recommended:true}:{})}))};})(globalThis);`;
 const historicalDefinitions=JSON.parse(read('tools/map-source/historical-presets.json'));
 const presets=read('tools/map-source/regional-presets.cjs')+'\n'+read('tools/map-source/balanced-regions.cjs')+'\n'+read('tools/map-source/research-bases.cjs')+'\nglobalThis.HistoricalMapPresetDefinitions='+JSON.stringify(historicalDefinitions)+';\n'+read('tools/map-source/historical-presets.cjs');
 const adapter=`\n(function(root){const maps=root.MapTemplates,originalGet=maps.get.bind(maps),custom=new Map();maps.get=id=>custom.get(id)||originalGet(id);maps.register=t=>{custom.set(t.id,t);return t;};maps.isLoaded=maps.has=id=>Boolean(maps.get(id));maps.ensure=id=>{const t=maps.get(id);return t?Promise.resolve(t):Promise.reject(new Error('지도 템플릿을 찾을 수 없습니다: '+id));};maps.ensureScenario=value=>value?.map?.templateId?maps.ensure(value.map.templateId):Promise.resolve(null);maps.offline=true;})(globalThis);`;
 return {'map-templates.js':registry,'map-regions.js':presets+adapter};
}
const offlineMaps=offlineMapScripts();
// Cache immutable hashed files only. Lists and executable entry points must
// still revalidate so a deployment can point at its new asset filenames.
const mapManifest=JSON.parse(read('assets/maps/manifest.json'));
const vercel=JSON.parse(read('vercel.json'));
vercel.headers=(vercel.headers||[]).filter(rule=>!rule.source.startsWith('/assets/maps/')&&!rule.source.startsWith('/assets/program/'));
const cacheAsset=asset=>vercel.headers.push({source:'/'+asset.path,headers:[{key:'Cache-Control',value:'public, max-age=31536000, immutable'}]});
for(const asset of mapManifest.assets)for(const part of [asset,...(asset.parts||[])])cacheAsset(part);
const scriptFiles=[['map-templates.js','map-templates-script'],['map-regions.js','map-regions-script'],['map-view.js','map-view-script'],['engine.js','engine-script'],['map-document.js','map-document-script'],['bootstrap.js','bootstrap-script'],['flowchart.js','flowchart-script'],['editor.js','editor-script'],['map-maker.js','map-maker-script'],['ai-helper.js','ai-script'],['app.js','app-script']];
const styles=[['styles.css','game-styles'],['flowchart.css','flowchart-styles'],['launcher.css','launcher-styles'],['map-view.css','map-view-styles'],['map-maker.css','map-maker-styles']];
let standalone=read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,'').replace(/<link\b[^>]*rel="stylesheet"[^>]*>/gi,'').replace(/<a\b[^>]*data-community-only[^>]*>[\s\S]*?<\/a>/gi,'');
standalone=standalone.replace('</head>',styles.map(([file,id])=>`<style id="${id}">${read(file).replace(/<\/style/gi,'<\\/style')}</style>`).join('\n')+'\n<style id="standalone-styles">[data-community-only],[data-web-only]{display:none!important}</style>\n</head>');
standalone=standalone.replace('</body>',scriptFiles.map(([file,id])=>`<script id="${id}">${(offlineMaps[file]||read(file)).replace(/<\/script/gi,'<\\/script')}</script>`).join('\n')+'\n</body>');
for(const match of standalone.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi))new vm.Script(match[1]);
fs.writeFileSync(path.join(dir,'standalone.html'),standalone);
// GitHub's web upload should never need to accept the complete offline HTML.
// Fragments contain plain UTF-8 text, not executable scripts; the downloader
// checks each part and the final SHA-256 before offering the offline file.
const programDir=path.join(dir,'assets/program');fs.mkdirSync(programDir,{recursive:true});
for(const name of fs.readdirSync(programDir))if(/^standalone\.\d{3}\.[a-f0-9]{16}\.txt$/.test(name))fs.unlinkSync(path.join(programDir,name));
const data=Buffer.from(standalone,'utf8'),partLimit=1024*1024,programFiles=[];
for(let start=0;start<data.length;){
 let end=Math.min(start+partLimit,data.length);
 while(end<data.length&&(data[end]&0xc0)===0x80)end--;
 const part=data.subarray(start,end),sha256=crypto.createHash('sha256').update(part).digest('hex');
 const file={path:`assets/program/standalone.${String(programFiles.length+1).padStart(3,'0')}.${sha256.slice(0,16)}.txt`,bytes:part.length,sha256};
 fs.writeFileSync(path.join(dir,file.path),part);programFiles.push(file);cacheAsset(file);start=end;
}
const programManifest={format:'hc-program-parts-v1',bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex'),files:programFiles};
fs.writeFileSync(path.join(programDir,'manifest.json'),JSON.stringify(programManifest,null,2)+'\n');
const webEntry=`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>역사의 갈림길 · 프로그램 내려받기</title>
<style>body{font:16px/1.7 system-ui,sans-serif;max-width:38rem;margin:12vh auto;padding:1.5rem;background:#f4f2eb;color:#263d33}main{background:#fffdf7;padding:2rem;border-radius:1rem}a,button{display:inline-block;background:#234c3e;color:white;border:0;border-radius:.4rem;padding:.7rem 1rem;font:inherit;text-decoration:none;cursor:pointer}[hidden]{display:none!important}</style></head>
<body><main><h1>역사의 갈림길</h1><p>지도가 포함된 오프라인 프로그램을 준비합니다. 시나리오와 개인 저장 내용은 포함되지 않습니다.</p><p id="program-download-status" role="status">프로그램 파일을 확인하고 있습니다.</p><a id="program-download-save" hidden>프로그램 파일 저장</a><button id="program-download-start" type="button" hidden>다시 시도</button><p><a href="index.html">초기 화면으로</a></p></main>
<script id="program-download-manifest" type="application/json">${JSON.stringify(programManifest).replace(/</g,'\\u003c')}</script>
<script src="program-download.js"></script>
<script>(function(){'use strict';const status=document.getElementById('program-download-status'),save=document.getElementById('program-download-save'),retry=document.getElementById('program-download-start');let blobUrl;async function prepare(){retry.hidden=true;save.hidden=true;status.textContent='프로그램 파일을 확인하고 있습니다.';try{const descriptor=JSON.parse(document.getElementById('program-download-manifest').textContent),html=await ProgramDownload.reconstruct(descriptor,location.href,(done,total)=>{status.textContent='프로그램 준비 중: '+done+' / '+total;});if(blobUrl)URL.revokeObjectURL(blobUrl);blobUrl=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));save.href=blobUrl;save.download='history-crossroads-player.html';save.hidden=false;status.textContent='프로그램이 준비되었습니다. 저장 창이 열리지 않으면 아래 버튼을 눌러 주세요.';save.click();}catch(error){status.textContent=error.name==='AbortError'?'파일을 불러오는 시간이 길어졌습니다. 다시 시도해 주세요.':error.message;retry.hidden=false;}}retry.addEventListener('click',prepare);prepare();})();</script>
</body></html>\n`;
fs.writeFileSync(path.join(dir,'standalone-web.html'),webEntry);
fs.writeFileSync(path.join(dir,'vercel.json'),JSON.stringify(vercel,null,2)+'\n');
fs.writeFileSync(path.join(dir,'VERSION.txt'),'역사의 갈림길 — 전체화면 · 지도 설정 먼저 보기 · 스크롤 유지\nVersion: 2.13.0-community\nBuild date: 2026-10-23\nRuntime: static HTML, CSS, JavaScript + Supabase (optional)\n');
const files=[];function visit(folder){for(const ent of fs.readdirSync(path.join(dir,folder),{withFileTypes:true})){const rel=path.posix.join(folder,ent.name);if(ent.isDirectory())visit(rel);else if(!['RELEASE-MANIFEST.json','tools/map-source/world-detailed.json','tools/map-source/world-balanced.json'].includes(rel)){const data=fs.readFileSync(path.join(dir,rel));files.push({path:rel,bytes:data.length,sha256:crypto.createHash('sha256').update(data).digest('hex')});}}}visit('');
fs.writeFileSync(path.join(dir,'RELEASE-MANIFEST.json'),JSON.stringify({version:'2.13.0-community',builtAt:'2026-10-23',scenarioIncluded:false,examplesSeparate:true,files},null,2)+'\n');
console.log(`Built blank standalone HTML, ${programFiles.length} web download parts, and manifest (${files.length} files; examples separate).`);
