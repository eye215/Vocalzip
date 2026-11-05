/* Validate untrusted backup/cloud snapshots before replacing any ledger. */
(function(root,factory){const C=typeof module==='object'&&module.exports?require('./core.js'):root.VzipBilling;const api=factory(C);if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipBillingBackup=api})(globalThis,C=>{
'use strict';const LIMIT=8*1024*1024,collections=['passes','payments','deductions','adjustments','imports','importRows','history'];
const fail=message=>{throw Error('정산 백업 오류: '+message)};
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const text=(value,label)=>{if(typeof value!=='string'||value.length>100000)fail(label);return value};
const id=value=>{text(value,'ID');if(!value||value.length>256)fail('ID');return value};
const integer=(n,label,negative=false,max=1000000000000)=>{if(!Number.isSafeInteger(n)||Math.abs(n)>max||(!negative&&n<0))fail(label)};
function validate(input){
 const state=JSON.parse(JSON.stringify(input));C.validateState(state);id(state.owner);integer(state.revision,'버전',false,Number.MAX_SAFE_INTEGER-1);
 for(const key of Object.keys(state))if(!['schemaVersion','owner','revision','hourlyRate',...collections].includes(key))fail('알 수 없는 최상위 필드: '+key);
 if(state.hourlyRate!==undefined){integer(state.hourlyRate,'시간당 레슨비');if(!state.hourlyRate)fail('시간당 레슨비는 0보다 커야 해요.')}
 const maps={};let count=0;
 for(const key of collections){maps[key]=new Map();count+=state[key].length;if(count>100000)fail('기록은 최대 100,000개예요.');
  for(const row of state[key]){if(!object(row))fail(key+' 기록');id(row.id);if(maps[key].has(row.id))fail('중복 ID');maps[key].set(row.id,row);
   if(['passes','payments','deductions','adjustments'].includes(key)){
    integer(row.version,'기록 버전');if(!row.version)fail('기록 버전');for(const stamp of ['createdAt','updatedAt'])if(!Number.isFinite(Date.parse(row[stamp])))fail('기록 시각');
    if(row.voidedAt!=null&&!Number.isFinite(Date.parse(row.voidedAt)))fail('취소 시각');
   }
  }
 }
 const date=value=>{if(typeof value!=='string'||C.date(value)!==value)fail('날짜')};
 for(const pass of state.passes){if(!text(pass.name,'레슨권 이름').trim())fail('레슨권 이름');integer(pass.totalUnits,'총 횟수',false,100000000);if(!pass.totalUnits)fail('총 횟수');integer(pass.amount,'금액');if(pass.expires)date(pass.expires)}
 const lessonIds=new Set(),legacyIds=new Set();
 for(const key of ['payments','deductions','adjustments'])for(const row of state[key]){
  const pass=maps.passes.get(row.passId);if(!pass||(!row.voidedAt&&pass.voidedAt))fail('연결 레슨권이 없거나 취소됐어요.');date(row.date);
  for(const field of ['memo','student','method','reference'])if(row[field]!=null)text(row[field],field);
  if(key==='payments'){if(!['payment','refund'].includes(row.kind))fail('결제 유형');integer(row.amount,'결제 금액');if(!row.amount)fail('결제 금액')}
  if(key==='adjustments'){integer(row.unitsDelta,'조정 횟수',true,100000000);integer(row.amountDelta,'조정 금액',true);if(!row.memo?.trim()||(!row.unitsDelta&&!row.amountDelta))fail('조정 사유/값')}
  if(key==='deductions'){
   if(C.status(row.status)!==row.status||row.status==='unconfirmed')fail('수강 상태');integer(row.units,'차감 횟수',false,100000000);
   if(['scheduled','cancelled','free'].includes(row.status)&&row.units)fail('상태와 차감 횟수가 달라요.');
   for(const field of ['start','end'])if(row[field]&&C.time(row[field])!==row[field])fail('수강 시간');
   if(row.start&&row.end&&row.end<=row.start)fail('종료 시간');
   if(!row.lessonId&&!row.legacyRef)fail('수강 참조 ID');for(const key of ['lessonId','legacyRef'])if(row[key])id(row[key]);
   if(!row.voidedAt){if(row.lessonId){if(lessonIds.has(row.lessonId))fail('동일 레슨 중복 차감');lessonIds.add(row.lessonId)}
    else{if(legacyIds.has(row.legacyRef))fail('동일 과거 수강 중복 차감');legacyIds.add(row.legacyRef)}}
  }
 }
 for(const batch of state.imports){
  if(!['payment','deduction'].includes(batch.kind)||!['applied','undone'].includes(batch.status))fail('업로드 상태');
  if(!Array.isArray(batch.created)||batch.created.length>4000)fail('업로드 생성 이력');
  for(const ref of batch.created){if(!['passes','payments','deductions'].includes(ref.collection)||!maps[ref.collection].has(ref.id))fail('업로드 참조');integer(ref.version,'업로드 버전')}
  for(const key of ['success','failed','duplicates','skipped'])integer(batch[key]??0,'업로드 건수');
 }
 for(const row of state.importRows){if(!maps.imports.has(row.batchId)||!['imported','undone','failed','skipped'].includes(row.status))fail('업로드 행 이력');
  if(['imported','undone'].includes(row.status)&&(!['payments','deductions'].includes(row.collection)||!maps[row.collection].has(row.entityId)))fail('업로드 행 참조')}
 for(const row of state.history){if(!['passes','payments','deductions','adjustments','ledger','settings'].includes(row.collection))fail('변경 이력 유형');id(row.entityId);text(row.action,'변경 작업');if(!Number.isFinite(Date.parse(row.at)))fail('변경 시각')}
 for(const row of state.history.filter(row=>row.collection==='settings')){
  if(row.entityId!=='hourly-rate'||row.action!=='hourly-rate.save'||!object(row.before)||!object(row.after)||row.before.id!=='hourly-rate'||row.after.id!=='hourly-rate')fail('시간당 레슨비 변경 이력');
  integer(row.before.rate,'변경 전 시간당 레슨비');integer(row.after.rate,'변경 후 시간당 레슨비');if(!row.after.rate)fail('변경 후 시간당 레슨비');
 }
 C.check(state,true);
 if(state.hourlyRate)for(const value of Object.values(C.hourlyTotals(state)))if(!Number.isSafeInteger(value))fail('시간 정산 계산 범위');
 return state;
}
function parse(source){if(typeof source!=='string'||new TextEncoder().encode(source).length>LIMIT)fail('파일은 8MB 이하로 나눠 주세요.');let data;try{data=JSON.parse(source)}catch{fail('JSON 형식이 올바르지 않아요.')}return validate(data)}
function summary(state){const hourly=state.hourlyRate?C.hourlyTotals(state):null,totals=hourly||C.totals(state).total;return {owner:state.owner,passes:C.active(state.passes).length,payments:C.active(state.payments).length,deductions:C.active(state.deductions).length,remainingUnits:totals.remainingUnits,netPaid:totals.netPaid,unpaid:hourly?hourly.owed:totals.unpaid,unit:hourly?'시간':'회'}}
function canonical(value){if(Array.isArray(value))return value.map(canonical);if(object(value))return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));return value}
function same(a,b){return JSON.stringify(canonical({...a,revision:0}))===JSON.stringify(canonical({...b,revision:0}))}
return {LIMIT,validate,parse,summary,same};
});
