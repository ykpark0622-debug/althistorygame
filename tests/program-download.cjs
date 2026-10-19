'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const dir=path.resolve(__dirname,'..'),source=fs.readFileSync(path.join(dir,'program-download.js'),'utf8');
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const fixtureParts=[Buffer.from('<!doctype html><html lang="ko">'),Buffer.from('한글 지도 🌏와 선택지'),Buffer.from('</html>')];
const fixture={format:'hc-program-parts-v1',bytes:Buffer.concat(fixtureParts).length,sha256:hash(Buffer.concat(fixtureParts)),files:fixtureParts.map((bytes,index)=>({path:`assets/program/standalone.${String(index+1).padStart(3,'0')}.${hash(bytes).slice(0,16)}.txt`,bytes:bytes.length,sha256:hash(bytes)}))};
function context(fetch){
 const root={location:{href:'https://game.example/sub/index.html'},crypto:crypto.webcrypto,fetch,URL,AbortController,TextDecoder,Uint8Array,setTimeout,clearTimeout};
 root.globalThis=root;vm.runInNewContext(source,root);return root.ProgramDownload;
}
function response(bytes,changes={}){return {ok:true,url:'',headers:{get:()=>null},arrayBuffer:async()=>bytes,...changes};}
const clone=value=>JSON.parse(JSON.stringify(value));
(async()=>{
 let checks=0;
 const requests=[],progress=[];
 const api=context(async url=>{requests.push(url);const index=fixture.files.findIndex(file=>url.endsWith(file.path));return response(fixtureParts[index]);});
 assert.equal(await api.reconstruct(fixture,'https://game.example/sub/standalone.html',(done,total)=>progress.push([done,total])),Buffer.concat(fixtureParts).toString('utf8'));checks++;
 assert.equal(requests.length,3);assert(requests.every(url=>url.startsWith('https://game.example/sub/assets/program/')));assert.equal(progress.at(-1)[0],3);checks++;
 for(const mutate of [
   value=>{value.format='unknown';},value=>{value.bytes=65*1024*1024;},value=>{value.bytes++;},
   value=>{value.files[0].path='https://attacker.example/file.txt';},value=>{value.files[0].path='../assets/program/file.txt';},
   value=>{value.files[0].bytes=1024*1024+1;},value=>{value.files[0].sha256='broken';},
   value=>{value.files[1]=value.files[0];},value=>{value.files=[];},value=>{value.files[0].path=value.files[0].path+'?x=1';}
 ]){const invalid=clone(fixture);mutate(invalid);assert.throws(()=>api.validate(invalid));checks++;}
 assert.throws(()=>api.validate(fixture,'https://other.example/standalone.html'));assert.throws(()=>api.validate(fixture,'https://user:pass@game.example/standalone.html'));checks++;
 const corrupt=context(async()=>response(Buffer.from('corrupt')));await assert.rejects(()=>corrupt.reconstruct(fixture),/온전/);checks++;
 const badTotal=clone(fixture);badTotal.sha256='0'.repeat(64);await assert.rejects(()=>api.reconstruct(badTotal),/전체/);checks++;
 const missing=context(async()=>response(new Uint8Array(),{ok:false}));await assert.rejects(()=>missing.reconstruct(fixture),/불러올/);checks++;
 const redirect=context(async()=>response(fixtureParts[0],{url:'https://other.example/file.txt'}));await assert.rejects(()=>redirect.reconstruct(fixture),/구성/);checks++;
 let cancelled=false;
 const overflow=context(async()=>response(null,{body:{getReader:()=>({read:async()=>({value:new Uint8Array(1000),done:false}),cancel:async()=>{cancelled=true;},releaseLock(){}})}}));
 await assert.rejects(()=>overflow.reconstruct(fixture),/구성/);assert(cancelled);checks++;
 const invalidUtf8=Buffer.from([0xff]),utf8Hash=hash(invalidUtf8),utf8Descriptor={format:fixture.format,bytes:1,sha256:utf8Hash,files:[{path:`assets/program/standalone.001.${utf8Hash.slice(0,16)}.txt`,bytes:1,sha256:utf8Hash}]};
 await assert.rejects(()=>context(async()=>response(invalidUtf8)).reconstruct(utf8Descriptor),/구성/);checks++;
 // The generated wrapper and all fragments must produce the exact full offline file.
 const descriptor=JSON.parse(fs.readFileSync(path.join(dir,'assets/program/manifest.json'),'utf8'));
 const wrapper=fs.readFileSync(path.join(dir,'standalone-web.html'),'utf8'),embedded=JSON.parse(wrapper.match(/<script id="program-download-manifest" type="application\/json">([\s\S]*?)<\/script>/)[1]);
 assert.deepEqual(embedded,descriptor);assert(Buffer.byteLength(wrapper)<30*1024);checks++;
 for(const file of descriptor.files){const data=fs.readFileSync(path.join(dir,file.path));assert(data.length<=1024*1024);assert.equal(data.length,file.bytes);assert.equal(hash(data),file.sha256);assert.doesNotThrow(()=>new TextDecoder('utf-8',{fatal:true}).decode(data));}checks++;
 const actual=context(async url=>response(fs.readFileSync(path.join(dir,new URL(url).pathname.replace(/^\/sub\//,'')))));
 assert.equal(await actual.reconstruct(descriptor),fs.readFileSync(path.join(dir,'standalone.html'),'utf8'));checks++;
 const headers=JSON.parse(fs.readFileSync(path.join(dir,'vercel.json'),'utf8')).headers;
 assert(descriptor.files.every(file=>headers.some(rule=>rule.source==='/'+file.path&&rule.headers.some(header=>header.value.includes('immutable')))));checks++;
 console.log(`Program download checks passed: ${checks} (bounded UTF-8 parts, integrity, same-origin, legacy offline artifact).`);
})().catch(error=>{console.error(error);process.exitCode=1;});
