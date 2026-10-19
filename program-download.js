(function(root){
  'use strict';
  const MAX_PART_BYTES=1024*1024,MAX_TOTAL_BYTES=64*1024*1024,MAX_PARTS=128;
  const invalid=()=>new Error('프로그램 내려받기 파일의 구성을 확인할 수 없습니다.');
  function validate(descriptor,source){
    const current=new URL(root.location.href),base=new URL(source||current.href,current);
    if(!['http:','https:'].includes(base.protocol)||base.origin!==current.origin||base.username||base.password)throw invalid();
    if(!descriptor||descriptor.format!=='hc-program-parts-v1'||!Number.isSafeInteger(descriptor.bytes)||descriptor.bytes<1||descriptor.bytes>MAX_TOTAL_BYTES||!/^[a-f0-9]{64}$/.test(descriptor.sha256)||!Array.isArray(descriptor.files)||!descriptor.files.length||descriptor.files.length>MAX_PARTS)throw invalid();
    let total=0;const seen=new Set();
    const files=descriptor.files.map(file=>{
      if(!file||typeof file.path!=='string'||!/^assets\/program\/standalone\.\d{3}\.[a-f0-9]{16}\.txt$/.test(file.path)||!Number.isSafeInteger(file.bytes)||file.bytes<1||file.bytes>MAX_PART_BYTES||!/^[a-f0-9]{64}$/.test(file.sha256)||!file.path.endsWith('.'+file.sha256.slice(0,16)+'.txt')||seen.has(file.path))throw invalid();
      const url=new URL(file.path,base);if(url.origin!==current.origin||url.username||url.password||url.search||url.hash)throw invalid();
      seen.add(file.path);total+=file.bytes;return {...file,url:url.href};
    });
    if(total!==descriptor.bytes)throw invalid();return files;
  }
  async function digest(bytes){
    if(!root.crypto?.subtle)throw Error('프로그램 내려받기는 HTTPS 또는 localhost 주소에서 이용해 주세요.');
    const hash=await root.crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash),value=>value.toString(16).padStart(2,'0')).join('');
  }
  async function readPart(file){
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000);
    try{
      const response=await root.fetch(file.url,{credentials:'same-origin',redirect:'error',signal:controller.signal});
      if(!response.ok)throw Error('프로그램 파일을 불러올 수 없습니다. 잠시 후 다시 시도해 주세요.');
      if(response.url&&new URL(response.url,file.url).href!==file.url)throw invalid();
      const declared=Number(response.headers?.get('Content-Length'));if(Number.isFinite(declared)&&declared>MAX_PART_BYTES)throw invalid();
      let bytes;
      if(response.body?.getReader){
        const reader=response.body.getReader(),chunks=[];let size=0;
        try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>file.bytes){await reader.cancel();throw invalid();}chunks.push(value);}}
        finally{reader.releaseLock();}
        bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
      }else bytes=new Uint8Array(await response.arrayBuffer());
      if(bytes.byteLength!==file.bytes||await digest(bytes)!==file.sha256)throw Error('프로그램 파일이 온전하지 않습니다. 새로고침한 뒤 다시 시도해 주세요.');
      return bytes;
    }finally{clearTimeout(timeout);}
  }
  async function reconstruct(descriptor,source,onProgress){
    const files=validate(descriptor,source),parts=new Array(files.length);let completed=0,failed=false;
    // Three bounded requests keep downloading responsive without flooding a static host.
    for(let start=0;start<files.length;start+=3)await Promise.all(files.slice(start,start+3).map(async(file,index)=>{
      try{parts[start+index]=await readPart(file);completed++;if(onProgress&&!failed)onProgress(completed,files.length);}
      catch(error){failed=true;throw error;}
    }));
    const bytes=new Uint8Array(descriptor.bytes);let offset=0;
    for(const part of parts){bytes.set(part,offset);offset+=part.byteLength;}
    if(await digest(bytes)!==descriptor.sha256)throw Error('프로그램 전체 파일을 확인하지 못했습니다. 다시 시도해 주세요.');
    try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw invalid();}
  }
  const api={reconstruct,validate,MAX_PART_BYTES,MAX_TOTAL_BYTES};
  if(typeof module==='object'&&module.exports)module.exports=api;else root.ProgramDownload=api;
})(typeof globalThis==='object'?globalThis:this);
