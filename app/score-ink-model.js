/* Private, immutable PDF strokes. No original PDF bytes, signed URLs or account tokens. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipScoreInk=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const COLLECTION='scoreAnnotations',PREFIX='vzip_score_ink_v1:',MAX_BYTES=2*1024*1024,MAX_POINTS=2048;
const clone=x=>JSON.parse(JSON.stringify(x)),fail=(message,code)=>Object.assign(Error(message),{code});
const unit=n=>Number.isFinite(n)&&n>=0&&n<=1;
const validId=x=>typeof x==='string'&&x.length>0&&x.length<=200;
function valid(s){
 return s?.version===1&&validId(s.id)&&validId(s.ownerId)&&validId(s.songId)&&validId(s.scoreId)&&
  typeof s.r2Key==='string'&&s.r2Key.startsWith('u/'+s.ownerId+'/'+s.scoreId+'/')&&!s.r2Key.includes('..')&&s.r2Key.length<=300&&
  /^[0-9a-f]{64}$/.test(s.pdfHash||'')&&Number.isInteger(s.page)&&s.page>=1&&s.page<=2000&&
  ['pen','highlighter'].includes(s.tool)&&/^#[0-9a-f]{6}$/i.test(s.color||'')&&Number.isFinite(s.width)&&s.width>=0.001&&s.width<=0.06&&
  (s.opacity===undefined||Number.isFinite(s.opacity)&&s.opacity>=0.05&&s.opacity<=1)&&
  Array.isArray(s.points)&&s.points.length>=1&&s.points.length<=MAX_POINTS&&s.points.every(p=>Array.isArray(p)&&p.length===3&&p.every(unit))&&
  Number.isFinite(s.createdAt)&&s.createdAt>0;
}
const same=(a,b)=>JSON.stringify(['version','id','ownerId','songId','scoreId','r2Key','pdfHash','page','tool','color','width','opacity','points','createdAt'].map(k=>a[k]))===JSON.stringify(['version','id','ownerId','songId','scoreId','r2Key','pdfHash','page','tool','color','width','opacity','points','createdAt'].map(k=>b[k]));
const opacity=s=>s.opacity===undefined?(s.tool==='highlighter'?0.28:1):s.opacity;
function scope(s,b){return s.songId===b.songId&&s.scoreId===b.scoreId&&s.r2Key===b.r2Key&&s.pdfHash===b.pdfHash&&s.ownerId===b.ownerId;}
function point(x,y,pressure=0.5){return [x,y,pressure].map(n=>Math.round(Math.max(0,Math.min(1,Number.isFinite(n)?n:0.5))*100000)/100000);}
function hit(s,p,aspect=1){
 const x=p[0],y=p[1]*aspect,r=Math.max(s.width/2,0.018),pts=s.points;
 const dist=(a,b)=>{
  const ax=a[0],ay=a[1]*aspect,bx=b[0],by=b[1]*aspect,dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/den)):0;
  return Math.hypot(x-ax-t*dx,y-ay-t*dy);
 };
 return pts.some((q,i)=>dist(q,pts[Math.max(0,i-1)])<=r);
}
function path(s,aspect=1){
 const pts=s.points.map(p=>[p[0]*1000,p[1]*aspect*1000]);
 return pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(2)+' '+p[1].toFixed(2)).join(' ')+(pts.length===1?' l0.01 0':'');
}
function create({storage,identity,getData,change}){
 const start=identity(),owner=start?.owner,session=start?.session;
 if(!owner||!session)throw fail('필기하려면 로그인해 주세요.','identity');
 const key=PREFIX+encodeURIComponent(owner),current=()=>{const now=identity();if(now?.owner!==owner||now?.session!==session)throw fail('로그인이 바뀌어 필기를 중단했어요.','identity');};
 function read(){
  current();const text=storage.getItem(key);if(text===null)return {version:1,owner,records:[],deleted:[]};
  if(text.length*2>MAX_BYTES)throw fail('필기 보관 공간 한도를 확인해 주세요.','capacity');
  let out;try{out=JSON.parse(text);}catch{throw fail('필기 복구 기록을 확인해야 해요. 기존 기록은 보존했어요.','corrupt');}
  if(out?.version!==1||out.owner!==owner||!Array.isArray(out.records)||!Array.isArray(out.deleted)||!out.deleted.every(validId)||
   out.records.length>4000||!out.records.every(s=>valid(s)&&s.ownerId===owner)||new Set(out.records.map(s=>s.id)).size!==out.records.length)
   throw fail('필기 복구 기록 형식이 달라요. 기존 기록은 보존했어요.','corrupt');
  return out;
 }
 function data(){
  current();const d=getData();
  if(d[COLLECTION]!==undefined&&!Array.isArray(d[COLLECTION])||d.deleted?.[COLLECTION]!==undefined&&!Array.isArray(d.deleted[COLLECTION]))
   throw fail('저장된 필기 형식을 확인해야 해요.','corrupt');
  return d;
 }
 function exists(d,s){return d.songs?.some(song=>song.id===s.songId&&song.scores?.some(score=>score.id===s.scoreId&&!score.deleted&&score.r2Key===s.r2Key));}
 function put(ledger){
  current();const text=JSON.stringify(ledger);if(text.length*2>MAX_BYTES||ledger.records.length>4000||ledger.deleted.length>10000)throw fail('필기 보관 공간이 가득 찼어요. 기존 필기는 유지돼요.','capacity');
  storage.setItem(key,text);current();
 }
 function restore(){
  const d=data(),ledger=read(),rows=d[COLLECTION]||[],gone=new Set([...(d.deleted?.[COLLECTION]||[]),...ledger.deleted]);
  const retained=ledger.records.filter(s=>!gone.has(s.id));
  if(retained.length!==ledger.records.length)put({...ledger,records:retained,deleted:[...gone]});
  const additions=retained.filter(s=>!gone.has(s.id)&&exists(d,s)&&!rows.some(r=>r.id===s.id));
  const remove=rows.filter(s=>s.ownerId===owner&&gone.has(s.id)).map(s=>s.id);
  const freshGone=ledger.deleted.filter(id=>!(d.deleted?.[COLLECTION]||[]).includes(id));
  if(!additions.length&&!remove.length&&!freshGone.length)return true;
  current();return change(next=>{
   const dead=new Set([...(next.deleted?.[COLLECTION]||[]),...ledger.deleted]);
   next[COLLECTION]=(next[COLLECTION]||[]).filter(s=>s.ownerId!==owner||!dead.has(s.id));
   for(const s of additions)if(!dead.has(s.id)&&exists(next,s)&&!next[COLLECTION].some(r=>r.id===s.id))next[COLLECTION].push(clone(s));
   next.deleted||={};next.deleted[COLLECTION]=[...dead];
  });
 }
 function list(binding,page){
  const d=data(),ledger=read(),gone=new Set([...(d.deleted?.[COLLECTION]||[]),...ledger.deleted]),map=new Map();
  for(const s of [...ledger.records,...(d[COLLECTION]||[])])if(valid(s)&&s.ownerId===owner&&!gone.has(s.id)&&scope(s,binding)&&(!page||s.page===page))map.set(s.id,s);
  return [...map.values()].sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id)).map(clone);
 }
 function commit({add=[],remove=[]}={},mutate){
  current();const d=data(),ledger=read(),rows=d[COLLECTION]||[],gone=new Set([...(d.deleted?.[COLLECTION]||[]),...ledger.deleted]);
  if(!Array.isArray(add)||!Array.isArray(remove)||add.some(s=>!valid(s)||s.ownerId!==owner||gone.has(s.id)||!exists(d,s)))throw fail('현재 악보의 필기인지 확인해 주세요.','binding');
  for(const id of remove){if(!validId(id)||[...rows,...ledger.records].some(s=>s.id===id&&s.ownerId!==owner))throw fail('다른 사용자의 필기는 수정할 수 없어요.','identity');gone.add(id);}
  const map=new Map(ledger.records.map(s=>[s.id,s]));
  for(const s of add){
   const old=rows.find(r=>r.id===s.id)||map.get(s.id);
   if(old&&!same(old,s))throw fail('같은 필기 ID의 다른 내용은 덮어쓰지 않아요.','conflict');
   map.set(s.id,clone(s));
  }
  // Account-scoped recovery copy is durable before updating the shared root.
  put({version:1,owner,records:[...map.values()].filter(s=>!gone.has(s.id)),deleted:[...gone]});
  const saved=change(next=>{
   for(const s of add)if(!exists(next,s))throw fail('악보가 변경됐어요.','binding');
   next[COLLECTION]=(next[COLLECTION]||[]).filter(s=>!remove.includes(s.id));
   for(const s of add)if(!next[COLLECTION].some(r=>r.id===s.id))next[COLLECTION].push(clone(s));
   next.deleted||={};next.deleted[COLLECTION]=[...new Set([...(next.deleted[COLLECTION]||[]),...remove])];
   mutate?.(next);
  });
  current();return saved;
 }
 function removeScore(b){
  const d=data();if(b.ownerId!==owner||!exists(d,b))throw fail('악보가 변경됐어요. 다시 확인해 주세요.','binding');
  const ids=[...new Set([...(d[COLLECTION]||[]),...read().records].filter(s=>s.ownerId===owner&&s.songId===b.songId&&s.scoreId===b.scoreId&&s.r2Key===b.r2Key).map(s=>s.id))];
  return commit({remove:ids},next=>{if(!exists(next,b))throw fail('악보가 바뀌어 삭제를 중단했어요.','binding');const song=next.songs.find(s=>s.id===b.songId);song.scores= song.scores.filter(s=>s.id!==b.scoreId);});
 }
 return {restore,list,commit,removeScore,key};
}
return {COLLECTION,valid,opacity,point,hit,path,create,MAX_POINTS,MAX_BYTES};
});
