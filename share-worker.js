importScripts('chunk-media-core.js');
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
const STREAM_DB='vzip_stream_sessions_v1';
function streamDb(){return new Promise((resolve,reject)=>{const request=indexedDB.open(STREAM_DB,1);request.onupgradeneeded=()=>request.result.createObjectStore('streams',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
async function streams(mode,action){
 const db=await streamDb();
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction('streams',mode);const result=action(tx.objectStore('streams'));let value;result.onsuccess=()=>value=result.result;tx.oncomplete=()=>resolve(value);tx.onerror=tx.onabort=()=>reject(tx.error)})}finally{db.close()}
}
self.addEventListener('message',event=>{
 const data=event.data;if(!['vzip-stream-open','vzip-stream-clear'].includes(data?.type))return;
 event.waitUntil((async()=>{
  try{
   if(data.type==='vzip-stream-clear'){await streams('readwrite',store=>store.clear());return}
   const client=await self.clients.get(event.source.id);
   if(!client||new URL(client.url).origin!==self.location.origin)throw Error('잘못된 재생 요청이에요.');
   if(!/^[a-z0-9-]{36}$/i.test(data.id)||data.expires<=Date.now()||data.expires>Date.now()+3600000)throw Error('잘못된 재생 세션이에요.');
   VzipChunks.validate(data.item);
   for(const part of data.item.parts){
    const url=new URL(part.url);
    if(url.origin!=='https://chxnbtiyuyhiywzeshis.supabase.co'||!url.pathname.startsWith('/storage/v1/object/sign/vocal-recordings/'))throw Error('잘못된 파일 주소예요.');
   }
   const old=await streams('readonly',store=>store.getAll());
   for(const item of old)if(item.expires<Date.now())await streams('readwrite',store=>store.delete(item.id));
   await streams('readwrite',store=>store.put({id:data.id,item:data.item,expires:data.expires}));
   event.ports[0]?.postMessage({ok:true});
  }catch(error){event.ports[0]?.postMessage({error:error.message})}
 })());
});
const DB='vzip_share_inbox_v1';
function openDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore('files',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function store(files){const db=await openDb();await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');for(const file of files)tx.objectStore('files').put({id:crypto.randomUUID(),name:file.name,type:file.type,lastModified:file.lastModified,blob:file});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}
self.addEventListener('fetch',event=>{
 const u=new URL(event.request.url),scope=new URL(self.registration.scope);
 if(u.origin!==scope.origin)return;
 if(u.pathname.startsWith(scope.pathname+'__vzip_media__/')){
  event.respondWith((async()=>{
   if(!['GET','HEAD'].includes(event.request.method))return new Response(null,{status:405});
   const id=u.pathname.slice((scope.pathname+'__vzip_media__/').length);
   const session=await streams('readonly',store=>store.get(id));
   if(!session||session.expires<=Date.now())return new Response('재생 시간이 만료됐어요. 파일의 재생 버튼을 다시 눌러 주세요.',{status:410,headers:{'Cache-Control':'no-store'}});
   return VzipChunks.response(session.item,event.request,(part,start,end,signal)=>fetch(part.url,{
    headers:{Range:'bytes='+start+'-'+end},signal,cache:'no-store',credentials:'omit'
   }));
  })().catch(()=>new Response('재생 준비 실패',{status:502})));
 }else if(u.pathname===scope.pathname+'share-inbox'&&event.request.method==='POST'){
  event.respondWith((async()=>{try{const form=await event.request.formData();const files=form.getAll('files').filter(x=>x instanceof File);if(!files.length)throw Error('No files');await store(files);return Response.redirect(scope.href+'?shared=1',303)}catch{return Response.redirect(scope.href+'?share_error=1',303)}})());
 }
});
