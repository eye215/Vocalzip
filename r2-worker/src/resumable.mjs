async function boundedJson(request,fail){
 const limit=65536;if(Number(request.headers.get('content-length'))>limit)fail(413,'body too large');
 if(!request.body)fail(400,'invalid JSON');const reader=request.body.getReader(),out=new Uint8Array(limit);let size=0;
 try{for(;;){const next=await reader.read();if(next.done)break;if(size+next.value.length>limit){await reader.cancel();fail(413,'body too large');}out.set(next.value,size);size+=next.value.length;}}finally{reader.releaseLock();}
 try{return JSON.parse(new TextDecoder().decode(out.subarray(0,size)));}catch{fail(400,'invalid JSON');}
}
/* Additive upload-v2 protocol. Per-attempt keys and SHA-256 Merkle proofs make
 * a completed attempt immutable. No object deletion or new storage binding. */
const PART=8*1024*1024,HEX=/^[0-9a-f]{64}$/,ID=/^[A-Za-z0-9_-]{1,100}$/,EXT=/^[a-z0-9]{1,8}$/;
const bytes=hex=>Uint8Array.from(hex.match(/../g)||[],s=>parseInt(s,16));
const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
const digest=b=>crypto.subtle.digest('SHA-256',b).then(hex);
function leaf(index,length,hash){const b=new Uint8Array(41),v=new DataView(b.buffer);b[0]=0;v.setUint32(1,index);v.setUint32(5,length);b.set(bytes(hash),9);return digest(b);}
function pair(a,b){const out=new Uint8Array(65);out[0]=1;out.set(bytes(a),1);out.set(bytes(b),33);return digest(out);}
export async function handleUploadV2(request,env,uid,{fail,json,readJson,sign,equal,assertSession}){
 const url=new URL(request.url),path=url.pathname,method=request.method,enabled=env.UPLOADS_V2_ENABLED==='true';
 const write=()=>{if(!enabled)fail(503,'resumable uploads are paused');};
 if(env.SESSION_GUARD_ENABLED!=='true')fail(503,'registered sessions required');
 const canonical=d=>'vzip-upload-v2\\n'+JSON.stringify([2,d.owner,d.mediaId,d.key,d.uploadId,d.size,d.type,d.ext,d.root,d.attempt]);
 function schema(d){
  if(!d||d.version!==2||d.owner!==uid||!ID.test(d.mediaId||'')||!EXT.test(d.ext||'')||
   !/^audio\/[A-Za-z0-9.+-]{1,60}$/.test(d.type||'')||!HEX.test(d.root||'')||
   !/^[0-9a-f-]{36}$/.test(d.attempt||'')||typeof d.uploadId!=='string'||!d.uploadId.length||d.uploadId.length>500||
   !Number.isSafeInteger(d.size)||d.size<1||d.size>(Number(env.MAX_FILE_BYTES)||2*1024**3)||
   d.key!=='u/'+uid+'/'+d.mediaId+'/'+d.attempt+'/original.'+d.ext)fail(400,'invalid upload descriptor');
 }
 async function ticket(upload){
  schema(upload?.descriptor);
  const d=upload.descriptor,expected=await sign(canonical(d)),given=upload.signature;
  if(typeof given!=='string'||expected.length!==given.length||!equal(expected,given))fail(403,'invalid upload signature');
  return d;
 }
 async function completed(d){
  const head=await env.MEDIA.head(d.key);if(!head)return null;
  const m=head.customMetadata||{};
  if(head.size!==d.size||head.httpMetadata?.contentType!==d.type||m.owner!==uid||m.mediaId!==d.mediaId||m.uploadAttempt!==d.attempt||m.uploadRoot!==d.root)fail(409,'upload object changed');
  return {status:'complete',key:d.key,size:head.size,etag:head.httpEtag,root:d.root};
 }
 if(path==='/v2/uploads'&&method==='POST'){
  write();const body=await boundedJson(request,fail);
  if(!ID.test(body.mediaId||'')||!EXT.test(body.ext||'')||!HEX.test(body.root||'')||!/^audio\/[A-Za-z0-9.+-]{1,60}$/.test(body.contentType||''))fail(400,'invalid upload');
  if(!Number.isSafeInteger(body.size)||body.size<1||body.size>(Number(env.MAX_FILE_BYTES)||2*1024**3))fail(413,'invalid upload size');
  const attempt=crypto.randomUUID(),key='u/'+uid+'/'+body.mediaId+'/'+attempt+'/original.'+body.ext;
  const upload=await env.MEDIA.createMultipartUpload(key,{httpMetadata:{contentType:body.contentType},
   customMetadata:{owner:uid,mediaId:body.mediaId,size:String(body.size),uploadAttempt:attempt,uploadRoot:body.root}});
  await assertSession();
  const descriptor={version:2,owner:uid,mediaId:body.mediaId,key,uploadId:upload.uploadId,size:body.size,type:body.contentType,ext:body.ext,root:body.root,attempt};
  return json({descriptor,signature:await sign(canonical(descriptor)),partSize:PART});
 }
 if(path==='/v2/uploads/status'&&method==='POST'){
  const d=await ticket((await boundedJson(request,fail)).upload),done=await completed(d);
  await assertSession();return json(done||{status:'pending'});
 }
 let match;
 if((match=path.match(/^\/v2\/uploads\/parts\/(\d{1,3})$/))&&method==='PUT'){
  write();let upload;try{upload=JSON.parse(request.headers.get('x-vzip-upload')||'');}catch{fail(400,'invalid upload descriptor');}
  const d=await ticket(upload),n=Number(match[1]),count=Math.ceil(d.size/PART);
  if(n<1||n>count)fail(400,'invalid part number');
  if(await completed(d))fail(409,'upload already complete');
  const expected=Math.min(PART,d.size-(n-1)*PART),declared=request.headers.get('content-length');
  if(declared!==null&&Number(declared)!==expected)fail(413,'part size mismatch');
  const proof=(request.headers.get('x-vzip-proof')||'').split(',').filter(Boolean);
  if(proof.length!==Math.ceil(Math.log2(count))||!proof.every(x=>HEX.test(x)))fail(400,'invalid upload proof');
  if(!request.body)fail(413,'empty part');
  const reader=request.body.getReader(),body=new Uint8Array(expected);let offset=0;
  try{
   for(;;){const next=await reader.read();if(next.done)break;if(offset+next.value.length>expected){await reader.cancel();fail(413,'part too large');}body.set(next.value,offset);offset+=next.value.length;}
  }finally{reader.releaseLock();}
  if(offset!==expected)fail(413,'part size mismatch');
  let hash=await leaf(n-1,expected,await digest(body)),position=n-1;
  for(const sibling of proof){hash=position%2?await pair(sibling,hash):await pair(hash,sibling);position=Math.floor(position/2);}
  if(hash!==d.root)fail(422,'part does not match original');
  const part=await env.MEDIA.resumeMultipartUpload(d.key,d.uploadId).uploadPart(n,body);
  await assertSession();return json({partNumber:part.partNumber,etag:part.etag});
 }
 if(path==='/v2/uploads/complete'&&method==='POST'){
  const body=await boundedJson(request,fail),d=await ticket(body.upload),count=Math.ceil(d.size/PART),parts=body.parts;
  if(!Array.isArray(parts)||parts.length!==count||parts.some((p,i)=>p.partNumber!==i+1||typeof p.etag!=='string'||!p.etag.length||p.etag.length>200))fail(400,'invalid upload parts');
  let done=await completed(d);
  if(!done){
   write();
   try{await env.MEDIA.resumeMultipartUpload(d.key,d.uploadId).complete(parts);}
   catch(error){done=await completed(d);if(!done)fail(503,'upload completion is pending');}
   done=done||await completed(d);if(!done)fail(503,'upload completion is not confirmed');
  }
  await assertSession();return json(done);
 }
 fail(404,'not found');
}
