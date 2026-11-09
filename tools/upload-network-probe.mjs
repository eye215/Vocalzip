// Synthetic audio only. Never lists or touches customer files; never logs tokens/IDs.
import {readFileSync} from 'node:fs';
import {randomUUID,randomBytes} from 'node:crypto';
import vm from 'node:vm';
const base='https://chxnbtiyuyhiywzeshis.supabase.co',endpoint='https://vocalzip-media.eye215.workers.dev';
const service=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!service)throw Error('MISSING_SERVICE');
let uid='',token='',cleanupOK=true;
const handles=new Map(),check=(v,c)=>{if(!v)throw Error(c);};
async function auth(path,body,method=body?'POST':'GET'){
 const r=await fetch(base+path,{method,headers:{apikey:service,Authorization:'Bearer '+(token||service),'X-Client-Info':'vocalzip-device-session-v2','content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
 let data;try{data=await r.json();}catch{}return {status:r.status,data};
}
async function worker(path,method='DELETE'){
 return fetch(endpoint+path,{method,headers:{authorization:'Bearer '+token,'X-Client-Info':'vocalzip-device-session-v2'},signal:AbortSignal.timeout(15000)});
}
try{
 const email='vzip-upload-ci-'+randomUUID()+'@example.invalid',password=randomBytes(32).toString('base64url');
 const created=await auth('/auth/v1/admin/users',{email,password,email_confirm:true,user_metadata:{purpose:'synthetic upload latency test'}});
 uid=created.data?.id||'';check(created.status<300&&/^[a-f0-9-]{36}$/.test(uid),'CREATE_FAILED');
 const login=await auth('/auth/v1/token?grant_type=password',{email,password});token=login.data?.access_token||'';check(login.status===200&&token,'LOGIN_FAILED');
 const registered=await auth('/rest/v1/rpc/vzip_register_session',{p_label:'Synthetic upload latency test'});check(registered.status===200&&registered.data?.status==='active','SESSION_FAILED');
 const bytes=randomBytes(32*1024*1024),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 bytes.write('RIFF',0);view.setUint32(4,bytes.length-8,true);bytes.write('WAVEfmt ',8);view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,48000,true);view.setUint32(28,96000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);bytes.write('data',36);view.setUint32(40,bytes.length-44,true);
 const file=new File([bytes],'synthetic.wav',{type:'audio/wav'}),original=readFileSync('r2-storage.js','utf8');
 for(const lanes of [2,4,4,2]){
  let initMs=0,partsMs=0,completeMs=0,active=0,peak=0;
  const localStorage={getItem:()=>null,setItem(){},removeItem(){}};
  const window={localStorage,VzipAccountScope:{storage:localStorage},VZIP_R2_ENDPOINT:endpoint,vzipCloudSignedIn:()=>true,vzipCloudAccessToken:async()=>token,addEventListener(){}};
  const transport=async(url,options)=>{
   const path=new URL(url).pathname,at=performance.now();let r;
   if(path.includes('/parts/')){active++;peak=Math.max(peak,active);}
   try{
    r=await fetch(url,{...options,signal:options.signal||AbortSignal.timeout(30000)});
    if(path==='/v1/uploads'&&r.ok){const h=await r.clone().json();check(h.key.startsWith('u/'+uid+'/'),'WRONG_SCOPE');handles.set(h.key,h.uploadId);}
    return r;
   }finally{
    const ms=performance.now()-at;
    if(path==='/v1/uploads')initMs+=ms;else if(path.endsWith('/complete'))completeMs+=ms;else if(path.includes('/parts/')){partsMs+=ms;active--;}
   }
  };
  const code=lanes===4?original.replace('await Promise.all([send(),send()]);','await Promise.all([send(),send(),send(),send()]);'):original;
  check(lanes===2||code!==original,'LANE_PATCH_FAILED');
  vm.runInNewContext(code,{window,Blob,URL,DOMException,AbortController,AbortSignal,setTimeout,clearTimeout,location:{href:'https://vocalzip.yullul.com/'},fetch:transport});
  const at=performance.now(),done=await window.VzipR2.upload(file,{mediaId:'upload-ci-'+randomUUID(),signal:AbortSignal.timeout(60000)});
  const totalMs=performance.now()-at;check(done.size===file.size&&peak===lanes,'UPLOAD_CHECK_FAILED');
  const sample=await fetch(endpoint+'/v1/media/'+done.key.split('/').map(encodeURIComponent).join('/'),{headers:{authorization:'Bearer '+token,'X-Client-Info':'vocalzip-device-session-v2',range:'bytes=0-63'},signal:AbortSignal.timeout(15000)});
  check(sample.status===206&&Buffer.from(await sample.arrayBuffer()).equals(bytes.subarray(0,64)),'BYTES_CHANGED');
  check((await worker('/v1/media/'+done.key.split('/').map(encodeURIComponent).join('/'))).ok,'OBJECT_CLEANUP_FAILED');handles.delete(done.key);
  console.log(JSON.stringify({synthetic_upload:true,bytes:file.size,lanes,peak,totalMs:Math.round(totalMs),initMs:Math.round(initMs),summedPartMs:Math.round(partsMs),completeMs:Math.round(completeMs),networkMiBps:Number((file.size/1048576/(totalMs/1000)).toFixed(2)),bytes_verified:true,object_deleted:true,client_region:'GitHub-hosted runner; not iPhone or user network'}));
 }
}catch(e){console.error('UPLOAD_PROBE_STOPPED '+(/^[A-Z_]+$/.test(e.message)?e.message:'REQUEST_OR_CHECK'));process.exitCode=1;}
finally{
 for(const [key,id]of handles){
  if(!uid||!key.startsWith('u/'+uid+'/')){cleanupOK=false;continue;}
  try{await worker('/v1/uploads/'+encodeURIComponent(id)+'?key='+encodeURIComponent(key));const r=await worker('/v1/media/'+key.split('/').map(encodeURIComponent).join('/'));if(!r.ok&&r.status!==404)cleanupOK=false;}catch{cleanupOK=false;}
 }
 if(uid){try{token='';const r=await auth('/auth/v1/admin/users/'+uid,undefined,'DELETE');check(r.status<300,'AUTH_CLEANUP_FAILED');}catch{cleanupOK=false;}}
 console.log(JSON.stringify({synthetic_fixture_cleaned:cleanupOK,customer_data_used:false,library_rows_created:false,ai_calls:0}));
 if(!cleanupOK)process.exitCode=1;
}
