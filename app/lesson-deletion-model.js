/* Explicit lesson deletion plans. Pure, ID-bound, resumable; no storage or network. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipLessonDeletionModel=api;})(globalThis,()=>{
'use strict';
const copy=v=>JSON.parse(JSON.stringify(v)),rows=v=>Array.isArray(v)?v:[],fail=m=>{throw Error(m)};
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const same=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
/** Ignore only the chosen file links and the timestamp changed by their cleanup. */
function lessonValue(lesson,selected=[]){
 const value=copy(lesson),gone=new Set(selected);delete value.updatedAt;
 if(Array.isArray(value.recordings))value.recordings=value.recordings.filter(r=>!gone.has(r.id));
 return JSON.stringify(canonical(value));
}
async function fingerprint(lesson,selected=[]){
 const bytes=new TextEncoder().encode(lessonValue(lesson,selected));
 return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
}
function target(lesson,ledger){
 const hits=rows(ledger?.deductions).filter(d=>!d.voidedAt&&(d.lessonId===lesson.id||lesson.billingDeductionId&&d.id===lesson.billingDeductionId));
 if(hits.length>1||hits.some(d=>d.lessonId&&d.lessonId!==lesson.id))fail('레슨과 정산 연결이 일치하지 않아요. 수강 기록을 먼저 확인해 주세요.');
 return hits[0]||null;
}
async function plan({id,owner,lesson,mediaIds=[],deduction=null,cloud=false}){
 if(typeof id!=='string'||!id||typeof owner!=='string'||!owner||!lesson?.id)fail('삭제 대상과 계정을 확인해 주세요.');
 if(!Array.isArray(mediaIds)||mediaIds.some(x=>typeof x!=='string'||!rows(lesson.recordings).some(r=>r.id===x))||new Set(mediaIds).size!==mediaIds.length)fail('이 레슨에 연결된 파일만 선택해 주세요.');
 if(deduction&&(deduction.voidedAt||target(lesson,{deductions:[deduction]})?.id!==deduction.id||!Number.isSafeInteger(deduction.version)))fail('취소할 정산 차감을 다시 확인해 주세요.');
 return {version:1,id,owner,lesson:{id:lesson.id,date:lesson.date||'',billingDeductionId:lesson.billingDeductionId||''},lessonSignature:await fingerprint(lesson,mediaIds),mediaIds:[...mediaIds],linkedMediaIds:[...new Set(rows(lesson.recordings).map(r=>r.id))],deduction:deduction?{id:deduction.id,version:deduction.version}:null,cloud:!!cloud,
  done:{prepared:!cloud,billing:!deduction,media:[],cloud:!cloud,lesson:false},phase:'ready',error:''};
}
function validate(job){
 if(!job||job.version!==1||typeof job.id!=='string'||!job.id||typeof job.owner!=='string'||!job.owner||!job.lesson?.id||
  !Array.isArray(job.mediaIds)||new Set(job.mediaIds).size!==job.mediaIds.length||job.mediaIds.some(id=>typeof id!=='string'||!id)||!/^[a-f0-9]{64}$/.test(job.lessonSignature)||
  !Array.isArray(job.linkedMediaIds)||job.mediaIds.some(id=>!job.linkedMediaIds.includes(id))||
  job.deduction&&(!job.deduction.id||!Number.isSafeInteger(job.deduction.version)||job.deduction.version<1)||
  !job.done||!Array.isArray(job.done.media)||job.done.media.some(id=>!job.mediaIds.includes(id))||
  ['prepared','billing','cloud','lesson'].some(k=>typeof job.done[k]!=='boolean')||typeof job.cloud!=='boolean')fail('삭제 작업 기록을 확인할 수 없어요. 원본은 자동으로 지우지 않습니다.');
 return job;
}
async function execute(original,ports){
 let job=copy(validate(original));
 const guard=async()=>{if(await ports.owner()!==job.owner)fail('계정이 변경되어 삭제를 멈췄어요. 원래 계정에서 다시 확인해 주세요.');await ports.verify(job);};
 const save=async patch=>{const next={...job,...patch};await ports.save(next);job=next;ports.progress?.(copy(job));};
 await guard();await save({phase:'running',error:''});
 try{
  if(!job.done.prepared){await guard();await ports.ensureServerProtection(job);await guard();await save({done:{...job.done,prepared:true}});}
  if(!job.done.billing){await guard();await ports.cancelCharge(job);await guard();await save({done:{...job.done,billing:true}});}
  for(const id of job.mediaIds){
   if(job.done.media.includes(id))continue;
   await guard();await ports.removeMedia(job,id);await guard();
   await save({done:{...job.done,media:[...job.done.media,id]}});
  }
  if(!job.done.cloud){await guard();await ports.removeCloudLesson(job);await guard();await save({done:{...job.done,cloud:true}});}
  if(!job.done.lesson){await guard();await ports.removeLocalLesson(job);await save({done:{...job.done,lesson:true}});}
  await save({phase:'complete',error:''});return job;
 }catch(error){
  // Preserve the last durable step. If persisting an acknowledgement failed, retry the same ID-bound operation.
  try{await save({phase:'failed',error:String(error.message||error).slice(0,500)});}catch{}
  throw error;
 }
}
return {lessonValue,fingerprint,target,plan,validate,execute};
});
