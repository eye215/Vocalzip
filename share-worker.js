importScripts('chunk-media-core.js');
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
/* App shell cache (offline launch). Online the app is never older than the server:
 * - pages (navigations): network first; the kept copy is used only when the network fails
 * - same-origin static files (with or without ?v=): network first, kept copy only when the network fails, so a file
 *   changed without a ?v= bump is never stuck on an old copy (the browser's own HTTP cache works as before)
 * - the version-pinned CDN libraries (exact x.y.z in the address): kept copy first, they never change
 * Never kept: POST, range requests, media, the playback stream, share inbox, Supabase/R2/Worker/API calls (other origins). */
const SHELL='vzip-shell-v1',SHELL_PREFIX='vzip-shell-';
const STATIC=/\.(?:js|mjs|css|html|svg|png|jpe?g|webp|gif|ico|woff2?|webmanifest)$/i;
const PINNED=/^https:\/\/cdn\.jsdelivr\.net\/npm\/(?:@[\w.-]+\/)?[\w.-]+@\d+\.\d+\.\d+\//;
const scopeUrl=()=>new URL(self.registration.scope);
// One kept copy per page: the address without ?query (start_url, ?shared=1) and index.html as the folder itself.
const pageKey=u=>u.origin+u.pathname.replace(/index\.html$/,'');
const usable=response=>response&&response.status===200&&(response.type==='basic'||response.type==='cors');
async function keep(key,response){
 if(!usable(response))return;
 const cache=await caches.open(SHELL);await cache.put(key,response);
 // A new ?v= replaces the older versions of the same file.
 const u=new URL(key);
 if(u.searchParams.has('v'))for(const request of await cache.keys()){const k=new URL(request.url);if(k.origin===u.origin&&k.pathname===u.pathname&&k.search!==u.search)await cache.delete(request)}
}
const kept=async key=>(await caches.open(SHELL)).match(key);
const pinnedFetch=url=>fetch(url,{mode:'cors',credentials:'omit'});
async function networkFirst(request,key){
 try{
  const response=await fetch(request);
  if(usable(response)){
   // Rewrite the kept copy only when the server's file changed (same ETag = same file), not on every launch.
   const tag=response.headers.get('etag'),old=tag?await kept(key).catch(()=>null):null;
   if(!old||old.headers.get('etag')!==tag)await keep(key,response.clone()).catch(()=>{});
  }
  return response;
 }catch(error){const copy=await kept(key);if(copy)return copy;throw error}
}
async function cacheFirst(request,key,load=()=>fetch(request)){
 const copy=await kept(key);if(copy)return copy;
 const response=await load();if(usable(response))await keep(key,response.clone()).catch(()=>{});return response;
}
/* The first visit loads before this worker controls the page: read the page once and keep the files it names
 * (scripts, styles, icons, and the fonts the styles name). Files already kept are not fetched again. */
async function warm(){
 const scope=scopeUrl(),cache=await caches.open(SHELL),root=pageKey(scope);
 let page=await cache.match(root);
 if(!page){page=await fetch(root,{cache:'no-cache'});if(!usable(page))return;await cache.put(root,page.clone())}
 const names=text=>[...text.matchAll(/(?:src|href)="([^"#]+)"/g)].map(m=>m[1]);
 const fonts=text=>[...text.matchAll(/url\(["']?([^"')]+\.woff2(?:\?[^"')]*)?)["']?\)/g)].map(m=>m[1]);
 const want=(ref,base)=>{try{const u=new URL(ref,base);return (u.origin===scope.origin&&u.pathname.startsWith(scope.pathname)&&STATIC.test(u.pathname))||PINNED.test(u.href)?u:null}catch{return null}};
 const get=async u=>{
  let response=await cache.match(u.href);
  if(!response){response=await (u.origin===scope.origin?fetch(u.href):pinnedFetch(u.href));if(!usable(response))return null;await keep(u.href,response.clone())}
  return response;
 };
 await Promise.all([...new Set(names(await page.text()))].map(async ref=>{
  const u=want(ref,root);if(!u)return;
  try{const response=await get(u);if(response&&/\.css$/i.test(u.pathname))await Promise.all(fonts(await response.text()).map(f=>{const x=want(f,u.href);return x?get(x).catch(()=>{}):null}))}catch{}
 }));
}
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const name of await caches.keys())if(name.startsWith(SHELL_PREFIX)&&name!==SHELL)await caches.delete(name);
 await self.clients.claim();
})()));
self.addEventListener('message',event=>{if(event.data?.type==='vzip-shell-warm')event.waitUntil(warm().catch(()=>{}))});
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
 if(u.origin!==scope.origin){
  if(event.request.method==='GET'&&!event.request.headers.has('range')&&PINNED.test(u.href))event.respondWith(cacheFirst(event.request,u.href,()=>pinnedFetch(u.href)).catch(()=>fetch(event.request)));
  return;
 }
 if(u.pathname.startsWith(scope.pathname+'__vzip_media__/')){
  event.respondWith((async()=>{
   if(!['GET','HEAD'].includes(event.request.method))return new Response(null,{status:405});
   const id=u.pathname.slice((scope.pathname+'__vzip_media__/').length);
   const session=await streams('readonly',store=>store.get(id));
   if(!session||session.expires<=Date.now())return new Response('재생 시간이 만료됐어요. 파일의 재생 버튼을 다시 눌러 주세요.',{status:410,headers:{'Cache-Control':'no-store'}});
   return VzipChunks.response(session.item,event.request,(part,start,end,signal)=>fetch(part.url,{
    headers:{Range:'bytes='+start+'-'+end},signal,cache:'no-store',credentials:'omit'
   }),error=>{self.clients.get(event.clientId).then(client=>client?.postMessage({type:'vzip-stream-error',message:error.message})).catch(()=>{})});
  })().catch(()=>new Response('재생 준비 실패',{status:502})));
 }else if(u.pathname===scope.pathname+'share-inbox'&&event.request.method==='POST'){
  event.respondWith((async()=>{try{const form=await event.request.formData();const files=form.getAll('files').filter(x=>x instanceof File);if(!files.length)throw Error('No files');await store(files);return Response.redirect(scope.href+'?shared=1',303)}catch{return Response.redirect(scope.href+'?share_error=1',303)}})());
 }else if(event.request.method==='GET'&&!event.request.headers.has('range')&&u.pathname.startsWith(scope.pathname)){
  if(event.request.mode==='navigate')event.respondWith(networkFirst(event.request,pageKey(u)));
  else if(STATIC.test(u.pathname))event.respondWith(networkFirst(event.request,u.searchParams.has('v')?u.href:u.origin+u.pathname));
 }
});
