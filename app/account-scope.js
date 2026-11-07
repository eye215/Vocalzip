/* Account-local boundary. Disabled until server contract rollout is approved. */
(() => {
'use strict';
if (!window.VZIP_DEVICE_SESSIONS_ENABLED) return;
// Hide cached account content from keyboard/assistive navigation before async auth resolves.
document.querySelectorAll('.v-app,.v-nav').forEach(el=>{el.inert=true;});
const raw=window.localStorage, MARKER='vzip_account_scope_owner_v1', CLAIM='vzip_legacy_claim_owner_v1';
const owner=raw.getItem(MARKER)||'';
const namespace='vzip_account_v1:'+encodeURIComponent(owner||'unclaimed')+':';
const key=k=>namespace+k;
const hooks=new Set();
let leaving=false, protection=null;
const storage={
 getItem:k=>raw.getItem(key(k)),
 setItem:(k,v)=>raw.setItem(key(k),v),
 removeItem:k=>raw.removeItem(key(k)),
 key:i=>{const keys=[];for(let n=0;n<raw.length;n++){const k=raw.key(n);if(k?.startsWith(namespace))keys.push(k.slice(namespace.length));}return keys[i]??null;},
 get length(){let n=0;for(let i=0;i<raw.length;i++)if(raw.key(i)?.startsWith(namespace))n++;return n;}
};
const mediaDb=()=> 'vocalzip_media_v1_account_'+encodeURIComponent(owner||'unclaimed');
const protect=()=>protection ||= Promise.all([...hooks].map(fn=>Promise.resolve().then(fn))).catch(e=>{protection=null;throw e;});
const scope=window.VzipAccountScope={
 owner,storage,key,mediaDb,
 get leaving(){return leaving;},
 beforeLeave(fn){hooks.add(fn);return()=>hooks.delete(fn);},
 async switchTo(next){
  next=String(next||'');
  if(next===owner)return true;
  leaving=true;
  try{
   await protect();window.VZ?.closeSheets?.();
   // Keep all old closures bound to the old namespace until the page is destroyed.
   raw.setItem(MARKER,next);
   location.reload();
   return false;
  }catch(e){leaving=false;throw e;}
 },
 async lock(){leaving=true;await protect();window.VZ?.closeSheets?.();},
 canImportLegacy(){const claimed=raw.getItem(CLAIM);return !!owner&&(!claimed||claimed===owner);},
 async importLegacy(){
  if(!navigator.locks?.request)throw Error('안전한 이전을 위해 최신 Safari 또는 Chrome에서 다시 시도해 주세요.');
  return navigator.locks.request('vzip-legacy-import-owner',{mode:'exclusive'},()=>scope.copyLegacy());
 },
 async copyLegacy(){
  if(!scope.canImportLegacy()||leaving)throw Error('이전 자료를 이 계정으로 가져올 수 없어요.');
  const data=raw.getItem('vocal-zip_mvp_v1');
  const summary={records:0,files:0,conflicts:0};
  const previous=raw.getItem(CLAIM);
  if(previous&&previous!==owner)throw Error('이전 자료의 소유 계정이 달라요.');
  // Claim first: a partially completed copy is only resumable by the same account.
  raw.setItem(CLAIM,owner);
  const ensure=()=>{if(raw.getItem(CLAIM)!==owner||raw.getItem(MARKER)!==owner||leaving)throw Error('계정이 변경되어 이전을 중단했어요. 원본은 남아 있어요.');};
  if(!window.vzipAccountImportBaseline)throw Error('클라우드 자료 확인 기능을 불러오지 못했어요.');
  const baseline=await window.vzipAccountImportBaseline();ensure();
  const cloudIds=new Set(baseline.mediaIds);
  if(data){
   const legacy=JSON.parse(data), current=JSON.parse(storage.getItem('vocal-zip_mvp_v1')||'{}');
   for(const k of ['categories','songs','lessons','assignments','practices','comparisonReports','performances']){
    current[k] ||= [];const ids=new Set(current[k].map(x=>String(x.id))),remoteIds=new Set((baseline.payload[k]||[]).map(x=>String(x.id)));
    const deleted=new Set([...(current.deleted?.[k]||[]),...(legacy.deleted?.[k]||[]),...(baseline.payload.deleted?.[k]||[])].map(String));
    for(const row of legacy[k]||[]){
     if(row.ownerId&&row.ownerId!==owner){summary.conflicts++;continue;}
     if(deleted.has(String(row.id)))continue;
     if(remoteIds.has(String(row.id))){summary.conflicts++;continue;}
     if(ids.has(String(row.id))){if(JSON.stringify(current[k].find(x=>String(x.id)===String(row.id)))!==JSON.stringify(row))summary.conflicts++;continue;}
     current[k].push(row);ids.add(String(row.id));summary.records++;
    }
   }
   ensure();storage.setItem('vocal-zip_mvp_v1',JSON.stringify(current));storage.setItem('vzip_account_dirty','1');
  }
  const open=name=>new Promise((resolve,reject)=>{
   const r=indexedDB.open(name,1);
   r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('recordings'))r.result.createObjectStore('recordings',{keyPath:'id'});};
   r.onerror=()=>reject(r.error);r.onsuccess=()=>resolve(r.result);
  });
  const source=await open('vocalzip_media_v1');
  try{
   // Cursor one record at a time: do not load hundreds of blobs together.
   const ids=await new Promise((resolve,reject)=>{const t=source.transaction('recordings'),r=t.objectStore('recordings').getAllKeys();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
   for(const id of ids){
    ensure();
    if(cloudIds.has(String(id))){summary.conflicts++;continue;}
    let file=await new Promise((resolve,reject)=>{const r=source.transaction('recordings').objectStore('recordings').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    if(!file)continue;
    if(file.accountOwner&&file.accountOwner!==owner){summary.conflicts++;continue;}
    if(file.blob instanceof Blob&&file.blob.size<=25*1024*1024){file={...file,bytes:await file.blob.arrayBuffer()};delete file.blob;}
    const dest=await open(mediaDb());
    try{
     await new Promise((resolve,reject)=>{
      ensure();const t=dest.transaction('recordings','readwrite'),s=t.objectStore('recordings'),q=s.get(id);
      q.onsuccess=()=>{if(q.result){summary.conflicts++;return;}s.add({...file,accountOwner:owner,pendingUpload:true});summary.files++;};
      t.oncomplete=resolve;t.onerror=t.onabort=()=>reject(t.error||Error('파일 복사 실패'));
     });
    }finally{dest.close();}
   }
  }finally{source.close();}
  ensure();window.dispatchEvent(new CustomEvent('vzip:data-changed',{detail:{source:'legacy-import'}}));
  window.dispatchEvent(new Event('vzip:media-saved'));
  return summary;
 }
};
window.addEventListener('storage',e=>{
 if(e.key===MARKER&&e.newValue!==owner){
  document.body.classList.add('vzip-auth-locked');
  document.getElementById('vzip-auth-screen')?.removeAttribute('hidden');
  scope.lock().then(()=>location.reload()).catch(e=>window.VZ?.toast(e.message,'error'));
 }
});
})();
