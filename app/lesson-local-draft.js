/* Lesson form binding for the existing local-only outbox. Never sends a field-draft RPC.
 * A separate receipt records explicit lesson saves; only a read-back of the existing server
 * payload completes the exact draft revisions submitted by that save. Draft text is never deleted. */
(() => {
'use strict';
const V=window.VZ,O=window.VzipFieldDraftOutbox;
if(!V||!O)return;
const fields=new Set(['memo','prepMemo','feedback']),rescue=new Map(),volatileReceipts=new Map(),bindings=new Set();
const recordKey=r=>JSON.stringify([r.entityId,r.field,r.editorId]);
const current=()=>{
 const scope=window.VzipAccountScope,owner=window.vzipCloudUserId?.(),session=window.vzipCloudSessionId?.();
 return scope&&!scope.leaving&&owner&&owner===scope.owner&&window.vzipCloudSignedIn?.()&&session?{owner,session,storage:scope.storage}:null;
};
const same=c=>{const now=current();return !!c&&!!now&&now.owner===c.owner&&now.session===c.session;};
const receiptKey=c=>'vzip_lesson_draft_receipts_v1:'+encodeURIComponent(c.owner);
const memoryKey=(owner,key)=>owner+':'+key;
function receipts(c){
 if(!same(c))throw Error('identity_changed');
 const raw=c.storage.getItem(receiptKey(c));
 const r=raw===null?{schema:1,owner:c.owner,done:{},pending:{}}:JSON.parse(raw);
 if(!r||r.schema!==1||r.owner!==c.owner||!r.done||Array.isArray(r.done)||!r.pending||Array.isArray(r.pending))throw Error('invalid_receipts');
 for(const [key,rev] of Object.entries(r.done)){
  const tuple=JSON.parse(key);
  if(!Array.isArray(tuple)||tuple.length!==3||tuple.some(x=>typeof x!=='string')||!fields.has(tuple[1])||!Number.isSafeInteger(rev)||rev<0)throw Error('invalid_receipts');
 }
 for(const p of Object.values(r.pending)){
  if(!p||typeof p.lessonId!=='string'||!p.values||!Array.isArray(p.records)||!Object.keys(p.values).length||Object.entries(p.values).some(([f,t])=>!fields.has(f)||typeof t!=='string')||p.records.some(x=>typeof x.key!=='string'||!Number.isSafeInteger(x.revision)||x.revision<0))throw Error('invalid_receipts');
 }
 for(const [key,p] of volatileReceipts)if(p.owner===c.owner)r.pending[key]=p.receipt;
 return r;
}
function writeReceipts(c,r){
 if(!same(c))throw Error('identity_changed');
 c.storage.setItem(receiptKey(c),JSON.stringify(r));
 for(const key of Object.keys(r.pending))volatileReceipts.delete(key);
}
let verifyTimer=null,verifying=false,verifyAgain=false;
function scheduleVerification(){
 clearTimeout(verifyTimer);verifyTimer=setTimeout(()=>{verifyTimer=null;void verify();},1500);
}
async function verify(){
 if(verifying){verifyAgain=true;return;}
 const c=current();if(!c||typeof window.vzipAccountImportBaseline!=='function')return;
 verifying=true;
 try{
  const before=receipts(c);if(!Object.keys(before.pending).length)return;
  // Reuse the application's authenticated read-only boundary, never a new write/transport.
  const baseline=await window.vzipAccountImportBaseline();if(!same(c))return;
  const r=receipts(c),acknowledged=[];
  for(const [key,p] of Object.entries(before.pending)){
   const lesson=baseline?.payload?.lessons?.find(x=>x.id===p.lessonId);
   if(!lesson)continue;
   // A later submission of the same field must not be consumed by an older server response.
   if(JSON.stringify(r.pending[key])!==JSON.stringify(p))continue;
   const confirmed=new Set(Object.entries(p.values).filter(([f,t])=>(lesson[f]||'')===t).map(([f])=>f));
   if(!confirmed.size)continue;
   for(const ref of p.records)if(confirmed.has(JSON.parse(ref.key)[1]))r.done[ref.key]=Math.max(r.done[ref.key]||0,ref.revision);
   const values=Object.fromEntries(Object.entries(p.values).filter(([f])=>!confirmed.has(f)));
   if(Object.keys(values).length)r.pending[key]={...p,values,records:p.records.filter(ref=>!confirmed.has(JSON.parse(ref.key)[1]))};
   else delete r.pending[key];
   acknowledged.push(key);
  }
  writeReceipts(c,r);
  for(const key of acknowledged)volatileReceipts.delete(key);
  for(const binding of bindings)binding.refresh();
 }catch{/* An unconfirmed or unrecordable acknowledgement leaves all drafts recoverable. */}
 finally{verifying=false;if(verifyAgain){verifyAgain=false;scheduleVerification();}}
}
for(const event of ['online','focus','vzip:auth-changed'])window.addEventListener(event,scheduleVerification);
window.addEventListener('vzip:data-changed',e=>{if(e.detail?.source==='cloud-merge')scheduleVerification();});

V.lessonLocalDraft={bind({form,lessonId,inputs}){
 const c=current(),editorId=crypto.randomUUID();
 let entityId=lessonId||'new:'+crypto.randomUUID(),closed=false;
 const controller=new AbortController(),signal=controller.signal,entries=[],observed=new Map();
 const warning=document.createElement('p');warning.className='small muted';warning.setAttribute('role','status');warning.hidden=true;form.prepend(warning);
 const warn=()=>{warning.hidden=false;warning.textContent='초안을 기기에 저장하지 못했어요. 새로고침 전에 입력 내용을 복사해 주세요.';};
 let outbox=null;
 try{
  if(!c)throw Error('identity');
  outbox=O.create({owner:c.owner,sessionId:c.session,editorId,storage:c.storage,
   getOwner:()=>same(c)?c.owner:'',getSessionId:()=>current()?.session||'',
   send:async()=>{throw Error('local_only');}});
 }catch{warn();}
 const allowed=()=>!closed&&c&&same(c);
 const all=()=>{
  let records=[];
  try{const list=outbox?.list();records=list?.records||[];if(list?.corrupt.length)warn();}catch{warn();}
  for(const r of rescue.values())if(r.owner===c?.owner){records=records.filter(x=>recordKey(x)!==recordKey(r));records.push(r);}
  return records;
 };
 const done=()=>{try{return receipts(c).done;}catch{warn();return {};}};
 const matches=r=>lessonId?r.entityId===lessonId||r.entityId==='new:'+lessonId:r.entityId.startsWith('new:')&&!V.db.lessons.some(l=>l.id===r.entityId.slice(4));
 const pendingRecords=()=>{
  const completed=done();
  return all().filter(r=>matches(r)&&r.text!==r.baseText&&r.localRevision>(completed[recordKey(r)]||0));
 };
 function capture(entry){
  if(!allowed())return;
  const value=entry.input.value,key=memoryKey(c.owner,recordKey({entityId,field:entry.field,editorId}));
  if(value===entry.last&&!rescue.has(key))return;
  entry.last=value;entry.touched=true;
  try{
   if(!outbox)throw Error('storage_unavailable');
   outbox.start({entityId,field:entry.field},entry.base);
   outbox.edit({entityId,field:entry.field},value);rescue.delete(key);
   entry.status.textContent='이 기기에 초안 저장됨';
   if(![...rescue.values()].some(r=>r.owner===c.owner))warning.hidden=true;
  }catch{
   let revision=rescue.get(key)?.localRevision||0;
   try{revision=Math.max(revision,outbox?.read({entityId,field:entry.field})?.localRevision||0);}catch{}
   rescue.set(key,{owner:c.owner,entityId,field:entry.field,editorId,baseText:entry.base,text:value,localRevision:revision+1,updatedAt:Date.now(),volatile:true});
   entry.status.textContent='입력 내용은 이 화면에 남아 있어요';warn();
  }
 }
 function paint(entry){
  if(!allowed())return;
  const list=pendingRecords().filter(r=>r.field===entry.field&&r.editorId!==editorId).sort((a,b)=>b.updatedAt-a.updatedAt);
  for(const r of list)observed.set(recordKey(r),r);
  // Equal text from repeated explicit restores is one choice; completion still tracks every record.
  const options=list.filter((r,i)=>list.findIndex(x=>x.text===r.text)===i);
  entry.notice.replaceChildren();entry.notice.hidden=!options.length;
  if(!options.length)return;
  const line=document.createElement('div');line.className='row';
  const label=document.createElement('span');label.className='grow small';label.textContent='저장 안 된 초안이 있어요 ·';
  const load=document.createElement('button');load.type='button';load.className='btn sm secondary';load.textContent='불러오기';line.append(label,load);entry.notice.append(line);
  const select=document.createElement('select');select.setAttribute('aria-label',(entry.field==='memo'?'내 메모':entry.field==='feedback'?'전체 피드백':'준비 메모')+' 초안 선택');
  options.forEach((r,i)=>select.append(new Option((!lessonId?'새 레슨 '+(i+1)+' · ':'')+new Date(r.updatedAt).toLocaleString('ko-KR'),String(i))));
  if(options.length>1)entry.notice.append(select);
  const hint=document.createElement('p');hint.className='small muted';
  const explain=()=>{
   const r=options[Number(select.value)||0],confirmed=lessonId?V.db.lessons.find(l=>l.id===lessonId)?.[entry.field]||'':entry.base;
   hint.textContent=r.volatile?'기기에 저장하지 못한 내용이에요. 새로고침 전에 복사해 주세요.':r.baseText!==confirmed?'확정 내용이 바뀌었어요. 초안은 불러온 뒤 저장해야 반영돼요.':'불러온 뒤 저장해야 확정돼요.';
  };
  explain();select.onchange=explain;entry.notice.append(hint);
  load.onclick=()=>{
   if(!allowed())return;
   const r=options[Number(select.value)||0];
   if(!lessonId)entityId=r.entityId;
   entry.input.value=r.text;capture(entry);entry.notice.hidden=true;
   entry.status.textContent=r.volatile?'초안을 불러왔어요. 새로고침 전에 내용을 복사해 주세요.':'초안을 불러왔어요. 저장해야 반영돼요.';
   entry.input.dispatchEvent(new Event('input',{bubbles:true}));entry.input.focus();
  };
 }
 for(const [field,input] of Object.entries(inputs)){
  if(!fields.has(field)||!input)continue;
  const notice=document.createElement('div');notice.className='card stack';notice.dataset.lessonDraft=field;notice.hidden=true;
  const status=document.createElement('p');status.className='small muted';status.setAttribute('role','status');
  input.closest('label').after(notice,status);
  const entry={field,input,notice,status,base:input.value,last:input.value,touched:false};entries.push(entry);
  for(const event of ['input','change','compositionend'])input.addEventListener(event,()=>capture(entry),{signal});
  paint(entry);
 }
 const flush=()=>entries.forEach(capture);
 const release=window.VzipAccountScope?.beforeLeave?.(()=>dispose());
 function dispose(){if(closed)return;flush();closed=true;controller.abort();release?.();bindings.delete(api);}
 const api={
  get lessonId(){return lessonId||entityId.slice(4);},
  value(field,confirmed){const entry=entries.find(x=>x.field===field);return entry&&(entry.touched||entry.input.value!==entry.base)?entry.input.value:confirmed||'';},
  prepare(values){
   flush();if(!allowed())return null;
   // Only acknowledge revisions offered in this form, plus this editor's own input. Another tab's
   // later/unseen revision remains a draft even if it appeared while the save was being prepared.
   const seen=new Map(observed);
   for(const r of pendingRecords())if(r.editorId===editorId)seen.set(recordKey(r),r);
   const records=[...seen.values()].filter(r=>Object.hasOwn(values,r.field)&&(lessonId||r.entityId===entityId));
   const submittedFields=new Set(records.map(r=>r.field)),submittedValues=Object.fromEntries(Object.entries(values).filter(([f])=>submittedFields.has(f)));
   return records.length?{id:crypto.randomUUID(),lessonId:api.lessonId,values:submittedValues,records:records.map(r=>({key:recordKey(r),revision:r.localRevision}))}:null;
  },
  accepted(ticket){
   if(!ticket||!allowed())return;
   const {id,...receipt}=ticket;volatileReceipts.set(id,{owner:c.owner,receipt});
   try{const r=receipts(c);r.pending[id]=receipt;writeReceipts(c,r);}catch{warn();}
   scheduleVerification();
  },
  canSave(){if(c?allowed():!closed&&!current()&&!window.VzipAccountScope?.leaving)return true;V.toast('계정이 바뀌었어요. 원래 계정에서 다시 열어 주세요.','error');return false;},
  refresh(){for(const entry of entries)if(!entry.touched)paint(entry);},
  dispose
 };
 for(const event of ['pagehide','beforeunload'])window.addEventListener(event,flush,{signal});
 document.addEventListener('visibilitychange',flush,{signal});
 window.addEventListener('vzip:auth-changed',()=>{if(!allowed())dispose();},{signal});
 bindings.add(api);scheduleVerification();return api;
}};
})();
