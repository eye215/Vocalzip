/* A new account-partitioned IndexedDB; never opens or upgrades the original recordings database. Append only. */
(()=>{'use strict';if(typeof window==='undefined')return;let ready;
const open=()=>ready||=(new Promise((resolve,reject)=>{const q=indexedDB.open('vocalzip_precision_v1',1);q.onupgradeneeded=()=>q.result.createObjectStore('results',{keyPath:'id'});q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);}));
async function transaction(mode,run){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('results',mode),store=tx.objectStore('results');let result;tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error||Error('precision storage failed'));tx.onabort=()=>reject(tx.error||Error('precision storage aborted'));const req=run(store,tx);if(req){req.onsuccess=()=>{result=req.result;};req.onerror=()=>tx.abort();}});}
window.VzipPrecisionStore={
 async list(owner){if(!owner)return [];return (await transaction('readonly',s=>s.getAll())).filter(r=>r.owner===owner).sort((a,b)=>a.result.analyzedAt.localeCompare(b.result.analyzedAt));},
 async get(owner,id){const r=await transaction('readonly',s=>s.get(id));return r?.owner===owner?r:null;},
 async cached(owner,key){return (await this.list(owner)).find(r=>r.key===key)||null;},
 async append(record,{signal}={}){if(!record.owner||!record.id||!record.result||signal?.aborted)throw Error('precision record not ready');return transaction('readwrite',(s,tx)=>{if(signal?.aborted){tx.abort();return;}const abort=()=>tx.abort();signal?.addEventListener('abort',abort,{once:true});tx.addEventListener('complete',()=>signal?.removeEventListener('abort',abort));tx.addEventListener('abort',()=>signal?.removeEventListener('abort',abort));return s.add(structuredClone(record));});}
};})();
