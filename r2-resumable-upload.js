/* SHA-256 verified, account-bound R2 multipart journal. No original bytes or tokens stored. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipResumableUploads=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const PART=8*1024*1024,MAX=2*1024**3,HEX=/^[0-9a-f]{64}$/,PREFIX='vzip_r2_multipart_v2:';
const clone=x=>JSON.parse(JSON.stringify(x)),hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
const raw=h=>Uint8Array.from(h.match(/../g)||[],s=>parseInt(s,16));
const hash=b=>crypto.subtle.digest('SHA-256',b).then(hex);
const fault=(message,code)=>Object.assign(Error(message),{code});
async function leaf(index,size,digest){const b=new Uint8Array(41),v=new DataView(b.buffer);b[0]=0;v.setUint32(1,index);v.setUint32(5,size);b.set(raw(digest),9);return hash(b);}
async function pair(a,b){const out=new Uint8Array(65);out[0]=1;out.set(raw(a),1);out.set(raw(b),33);return hash(out);}
async function tree(manifest){
 let level=await Promise.all(manifest.hashes.map((h,i)=>leaf(i,Math.min(PART,manifest.size-i*PART),h)));const levels=[level];
 while(level.length>1){const next=[];for(let i=0;i<level.length;i+=2)next.push(pair(level[i],level[i+1]||level[i]));level=await Promise.all(next);levels.push(level);}
 return levels;
}
function proof(levels,index){const out=[];for(const level of levels.slice(0,-1)){out.push(level[index^1]||level[index]);index=Math.floor(index/2);}return out;}
async function inspect(file,{check=()=>{},onProgress=()=>{}}={}){
 if(!Number.isSafeInteger(file?.size)||file.size<1||file.size>MAX)throw fault('파일 크기를 확인해 주세요.','size');
 const hashes=[];
 for(let offset=0;offset<file.size;offset+=PART){check();const bytes=await file.slice(offset,offset+PART).arrayBuffer();check();hashes.push(await hash(bytes));check();onProgress(Math.round((offset+bytes.byteLength)/file.size*100));}
 const manifest={size:file.size,hashes},levels=await tree(manifest);check();return {...manifest,root:levels.at(-1)[0]};
}
function create({storage,identity,api,onReceipt}){
 const initial=identity();if(!initial?.owner||!initial.session||!initial.endpoint)throw fault('로그인이 필요해요.','identity');
 const {owner,session,endpoint}=initial,prefix=PREFIX+encodeURIComponent(owner)+':'+encodeURIComponent(endpoint)+':';
 const current=()=>{const x=identity();if(x?.owner!==owner||x?.session!==session||x?.endpoint!==endpoint)throw fault('로그인이 변경되어 업로드를 중단했어요.','identity');};
 function valid(r){
  const m=r?.manifest;
  return r?.version===2&&r.owner===owner&&r.endpoint===endpoint&&/^[A-Za-z0-9_-]{1,100}$/.test(r.id||'')&&
   Number.isSafeInteger(m?.size)&&m.size>0&&m.size<=MAX&&Array.isArray(m.hashes)&&m.hashes.length===Math.ceil(m.size/PART)&&m.hashes.every(h=>HEX.test(h))&&HEX.test(m.root||'')&&
   /^audio\/[A-Za-z0-9.+-]{1,60}$/.test(r.type||'')&&/^[a-z0-9]{1,8}$/.test(r.ext||'')&&Array.isArray(r.parts)&&r.parts.length<=m.hashes.length&&
   r.context?.kind==='library'&&r.context.metadata?.id===r.id&&r.context.metadata.size===m.size&&r.context.metadata.type===r.type&&JSON.stringify(r.context).length<=16384&&
   r.parts.every(p=>Number.isInteger(p.partNumber)&&p.partNumber>=1&&p.partNumber<=m.hashes.length&&typeof p.etag==='string'&&p.etag.length>0&&p.etag.length<=200)&&
   new Set(r.parts.map(p=>p.partNumber)).size===r.parts.length&&
   (!r.ticket||(r.ticket.descriptor?.version===2&&r.ticket.descriptor.owner===owner&&r.ticket.descriptor.mediaId===r.id&&r.ticket.descriptor.root===m.root&&r.ticket.descriptor.size===m.size&&
    r.ticket.descriptor.type===r.type&&r.ticket.descriptor.ext===r.ext&&r.ticket.descriptor.key==='u/'+owner+'/'+r.id+'/'+r.ticket.descriptor.attempt+'/original.'+r.ext&&
    /^[0-9a-f-]{36}$/.test(r.ticket.descriptor.attempt||'')&&typeof r.ticket.descriptor.uploadId==='string'&&r.ticket.descriptor.uploadId.length>0&&r.ticket.descriptor.uploadId.length<=500&&typeof r.ticket.signature==='string'&&r.ticket.signature.length<=100))&&
   (!r.receipt||(r.ticket&&r.receipt.key===r.ticket.descriptor.key&&r.receipt.size===m.size&&r.receipt.root===m.root&&typeof r.receipt.etag==='string'&&r.receipt.etag.length>0&&r.receipt.etag.length<=200));
 }
 function read(id){
  current();const text=storage.getItem(prefix+id);if(text===null)return null;
  if(text.length>65536)throw fault('업로드 재개 기록이 너무 커요.','corrupt');
  let r;try{r=JSON.parse(text);}catch{throw fault('업로드 재개 기록을 확인해야 해요.','corrupt');}
  if(!valid(r)||r.id!==id)throw fault('업로드 재개 기록 형식이 달라요.','corrupt');delete r.padding;return r;
 }
 function pending(){
  current();const ids=[];for(let i=0;i<storage.length;i++){const k=storage.key(i);if(k?.startsWith(prefix))ids.push(k.slice(prefix.length));}
  if(ids.length>16)throw fault('보류 중인 업로드 한도를 확인해 주세요.','capacity');
  return ids.map(read).filter(Boolean).map(clone);
 }
 function write(record){
  current();if(!valid(record))throw fault('업로드 재개 기록을 확인하지 못했어요.','corrupt');
  if(storage.getItem(prefix+record.id)===null&&pending().length>=16)throw fault('보류 중인 업로드 한도에 도달했어요.','capacity');
  const out={...record,padding:''},length=JSON.stringify(out).length;if(length>65536)throw fault('업로드 재개 기록이 너무 커요.','capacity');
  out.padding=' '.repeat(65536-length);storage.setItem(prefix+record.id,JSON.stringify(out));current();
 }
 function verify(r,done){
  if(!done||done.key!==r.ticket?.descriptor.key||done.size!==r.manifest.size||done.root!==r.manifest.root||
   typeof done.etag!=='string'||!done.etag.length||done.etag.length>200||/^W\//i.test(done.etag))throw fault('완료된 원본을 확인하지 못했어요.','receipt');
  return {key:done.key,size:done.size,etag:done.etag,root:done.root};
 }
 async function finish(id,{signal}={}){
  const r=read(id);if(!r)return null;
  if(!r.ticket)return {status:'needs_file',id};
  if(signal?.aborted)throw new DOMException('업로드를 취소했어요.','AbortError');
  let done=await api('/v2/uploads/status',{method:'POST',body:{upload:r.ticket},signal});current();
  if(done.status!=='complete'){
   if(done.status!=='pending')throw fault('업로드 상태를 확인하지 못했어요.','receipt');
   if(r.parts.length!==r.manifest.hashes.length)return {status:'needs_file',id};
   done=await api('/v2/uploads/complete',{method:'POST',body:{upload:r.ticket,parts:[...r.parts].sort((a,b)=>a.partNumber-b.partNumber)},signal});current();
  }
  const receipt=verify(r,done);r.receipt=receipt;write(r);
  await onReceipt?.(clone(r.context),clone(receipt));current();
  return {status:'complete',id,context:clone(r.context),receipt};
 }
 async function upload(file,{mediaId,type=file.type,ext,context,onProgress,signal}={}){
  const check=()=>{current();if(signal?.aborted)throw new DOMException('업로드를 취소했어요.','AbortError');};
  const notify=value=>{try{onProgress?.(value);}catch{}};
  check();let r=read(mediaId);
  if(r?.ticket){const done=await finish(mediaId,{signal});check();if(done?.status==='complete'){notify(100);return done.receipt;}}
  const manifest=await inspect(file,{check,onProgress:value=>notify(Math.min(5,Math.floor(value/20)))});check();
  if(r){
   if(r.manifest.root!==manifest.root||r.manifest.size!==file.size||r.type!==type||r.ext!==ext)throw fault('이전 업로드의 원본과 달라요. 새 파일로 가져와 주세요.','source_changed');
  }else{
   if(!context||JSON.stringify(context).length>16384)throw fault('파일 연결 정보가 너무 커요.','context');
   r={version:2,owner,endpoint,id:mediaId,type,ext,manifest,context:clone(context),ticket:null,parts:[],receipt:null};write(r);
  }
  if(!r.ticket){
   const start=await api('/v2/uploads',{method:'POST',body:{mediaId,contentType:type,size:file.size,ext,root:manifest.root},signal});check();
   if(start.partSize!==PART)throw fault('업로드 조각 크기가 달라요.','receipt');
   r.ticket={descriptor:start.descriptor,signature:start.signature};write(r);
  }
  const levels=await tree(r.manifest);check();if(levels.at(-1)[0]!==r.manifest.root)throw fault('업로드 원본 기록이 달라요.','corrupt');
  const controller=new AbortController(),cancel=()=>controller.abort();if(signal?.aborted)cancel();signal?.addEventListener('abort',cancel,{once:true});
  let next=0,failure=null,lastProgress=0;const sending=new Map();
  const partCheck=()=>{check();if(controller.signal.aborted)throw new DOMException('업로드를 취소했어요.','AbortError');};
  const progress=()=>{
   const complete=r.parts.reduce((sum,p)=>sum+Math.min(PART,r.manifest.size-(p.partNumber-1)*PART),0);
   lastProgress=Math.max(lastProgress,Math.min(99,Math.round((complete+[...sending.values()].reduce((sum,n)=>sum+n,0))/r.manifest.size*100)));
   notify(lastProgress);
  };
  const send=async()=>{
   while(!failure){
    const i=next++;if(i>=r.manifest.hashes.length)return;if(r.parts.some(p=>p.partNumber===i+1))continue;
    try{
     partCheck();const body=file.slice(i*PART,(i+1)*PART);let part;
     for(let attempt=0;;attempt++){
      try{sending.set(i,0);part=await api('/v2/uploads/parts/'+(i+1),{method:'PUT',body,signal:controller.signal,headers:{'X-Vzip-Upload':JSON.stringify(r.ticket),'X-Vzip-Proof':proof(levels,i).join(',')},
       onUploadBytes:sent=>{sending.set(i,Math.min(body.size,sent));progress();}});break;}
      catch(error){partCheck();if([400,401,403,409,413,422].includes(error.status)||attempt>=2)throw error;await new Promise(resolve=>setTimeout(resolve,250*(attempt+1)));partCheck();}
     }
     partCheck();if(part?.partNumber!==i+1||typeof part.etag!=='string'||!part.etag.length)throw fault('업로드 조각을 확인하지 못했어요.','receipt');
     sending.delete(i);r.parts.push({partNumber:part.partNumber,etag:part.etag});write(r);progress();
    }catch(error){if(!failure)failure=error;controller.abort();return;}
   }
  };
  try{
   await Promise.all([send(),send()]);if(failure)throw failure;partCheck();
   const done=await finish(mediaId,{signal});check();if(done?.status!=='complete')throw fault('업로드 완료를 확인하지 못했어요.','receipt');notify(100);return done.receipt;
  }finally{signal?.removeEventListener('abort',cancel);}

 }
 function acknowledge(id,metadata){
  const r=read(id);if(!r)return;
  if(!r.receipt||metadata?.storageProvider!=='r2'||metadata.r2Key!==r.receipt.key||metadata.size!==r.receipt.size||(metadata.r2Etag&&metadata.r2Etag!==r.receipt.etag))throw fault('보관함 연결 결과가 달라요.','receipt');
  current();storage.removeItem(prefix+id);current();
 }
 return {upload,finish,pending,acknowledge,prefix};
}
return {create,inspect,tree,proof,PART_SIZE:PART};
});
