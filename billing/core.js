/* Project B: pure billing ledger. No writes to Vocalzip application data. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipBilling=api})(typeof globalThis!=='undefined'?globalThis:this,()=>{
'use strict';
const clone=value=>JSON.parse(JSON.stringify(value)),MAX=1000000000000;
const active=rows=>rows.filter(row=>!row.voidedAt),str=value=>String(value??'').trim();
function fail(message){throw Error(message)}
function integer(value,label,{negative=false,max=MAX}={}){if(!Number.isSafeInteger(value)||Math.abs(value)>max||(!negative&&value<0))fail(label+' 값을 확인해 주세요.');return value}
function money(value){const text=str(value).replace(/[,\s₩원]/g,'').replace(/^KRW/i,'').replace(/\.0+$/,'');if(!/^-?\d+$/.test(text))fail('금액은 원 단위 정수로 입력해 주세요.');return integer(Number(text),'금액',{negative:true})}
function units(value){const text=str(value).replace(/[\s,회]/g,'');if(!/^-?\d+(\.\d{1,2})?$/.test(text))fail('횟수는 소수 둘째 자리까지 입력해 주세요.');const sign=text[0]==='-'?-1:1,[whole,frac='']=text.replace('-','').split('.');return integer(sign*(Number(whole)*100+Number(frac.padEnd(2,'0'))),'횟수',{negative:true,max:100000000})}
function date(value,{date1904=false}={}){
 if(typeof value==='number'||/^\d{1,5}(\.\d+)?$/.test(str(value))){
  const serial=Number(value);if(!Number.isFinite(serial)||serial<1||serial>2958465||(!date1904&&Math.floor(serial)===60))fail('엑셀 날짜 값을 확인해 주세요.');
  const offset=date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,serial<60?31:30);
  return new Date(offset+Math.floor(serial)*86400000).toISOString().slice(0,10);
 }
 let text=str(value).replace(/년\s*/g,'-').replace(/월\s*/g,'-').replace(/일$/,'').replace(/[./]/g,'-');
 let match=text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ]\d{2}:\d{2}.*)?$/);
 if(!match){const names=['january','february','march','april','may','june','july','august','september','october','november','december'];const en=text.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);if(en){const month=names.findIndex(name=>name===en[1].toLowerCase()||name.slice(0,3)===en[1].toLowerCase())+1;if(month)match=[text,en[3],String(month),en[2]]}}
 if(!match)fail('날짜는 YYYY-MM-DD 형식으로 확인해 주세요.');
 const [y,m,d]=match.slice(1).map(Number),result=new Date(Date.UTC(y,m-1,d));
 if(y<1900||y>9999||result.getUTCFullYear()!==y||result.getUTCMonth()+1!==m||result.getUTCDate()!==d)fail('존재하지 않는 날짜예요.');
 return [y,String(m).padStart(2,'0'),String(d).padStart(2,'0')].join('-');
}
function time(value){const text=str(value);if(!text)return '';if(typeof value==='number'&&value>=0&&value<1){const minutes=Math.round(value*1440)%1440;return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0')}if(!/^([01]?\d|2[0-3]):[0-5]\d$/.test(text))fail('시간은 HH:MM 형식으로 입력해 주세요.');return text.padStart(5,'0')}
const statuses={done:'completed',scheduled:'scheduled',예정:'scheduled',완료:'completed',completed:'completed',취소:'cancelled',cancelled:'cancelled',canceled:'cancelled','당일 취소':'noshow',당일취소:'noshow',noshow:'noshow',무료:'free',무료레슨:'free',free:'free'};
const status=value=>statuses[str(value).toLowerCase()]||'unconfirmed';
function empty(owner='local'){return {schemaVersion:1,owner,revision:0,passes:[],payments:[],deductions:[],adjustments:[],imports:[],importRows:[],history:[]}}
function validateState(state){if(!state||state.schemaVersion!==1||!Number.isSafeInteger(state.revision)||!['passes','payments','deductions','adjustments','imports','importRows','history'].every(key=>Array.isArray(state[key])))fail('지원하지 않는 정산 데이터 형식이에요.');return state}
function rounded(numerator,denominator){if(!denominator)return 0;return Number((BigInt(numerator)+BigInt(denominator)/2n)/BigInt(denominator))}
function passBalance(state,pass){
 const changes=active(state.adjustments).filter(row=>row.passId===pass.id),payments=active(state.payments).filter(row=>row.passId===pass.id);
 const chargedUnits=pass.totalUnits+changes.reduce((sum,row)=>sum+row.unitsDelta,0),amount=pass.amount+changes.reduce((sum,row)=>sum+row.amountDelta,0);
 const usedUnits=active(state.deductions).filter(row=>row.passId===pass.id).reduce((sum,row)=>sum+row.units,0);
 const paid=payments.filter(row=>row.kind==='payment').reduce((sum,row)=>sum+row.amount,0),refunded=payments.filter(row=>row.kind==='refund').reduce((sum,row)=>sum+row.amount,0);
 const usedAmount=chargedUnits?rounded(BigInt(amount)*BigInt(usedUnits),chargedUnits):0;
 return {id:pass.id,name:pass.name,chargedUnits,usedUnits,remainingUnits:chargedUnits-usedUnits,amount,paid,refunded,netPaid:paid-refunded,usedAmount,unusedAmount:amount-usedAmount,unpaid:amount-paid+refunded,rate:chargedUnits?amount*100/chargedUnits:0};
}
function totals(state){const passes=active(state.passes).map(pass=>passBalance(state,pass)),total={chargedUnits:0,usedUnits:0,remainingUnits:0,amount:0,paid:0,refunded:0,netPaid:0,usedAmount:0,unusedAmount:0,unpaid:0};for(const pass of passes)for(const key of Object.keys(total))total[key]+=pass[key];return {passes,total}}
function fingerprint(kind,row){const fields=kind==='payment'?['passId','date','kind','amount','method','memo','student']:['passId','date','start','end','status','units','memo','student'];return JSON.stringify(fields.map(key=>str(row[key])))}
function check(state,allowOverdraw=false){
 const balances=totals(state);for(const balance of balances.passes){
  integer(balance.chargedUnits,'조정 후 충전 횟수');integer(balance.amount,'조정 후 레슨권 금액');
  if(!balance.chargedUnits&&(balance.amount||balance.usedUnits))fail('충전 횟수가 0이면 금액과 사용 횟수도 0이어야 해요.');
  if(balance.remainingUnits<0&&!allowOverdraw)fail('잔여 횟수를 초과해요. 차감/조정 값을 확인하거나 초과 사용을 명시적으로 확인해 주세요.');
 }
 for(const value of Object.values(balances.total))if(!Number.isSafeInteger(value)||Math.abs(value)>Number.MAX_SAFE_INTEGER)fail('전체 정산 금액/횟수가 계산 범위를 초과했어요.');
 return balances;
}
function reduce(original,command,context={}){
 validateState(original);const state=clone(original),now=context.now||new Date().toISOString(),uid=context.uid||(()=>globalThis.crypto.randomUUID());
 const payload=command.payload||{},opts=command.options||{};
 const findPass=id=>{const pass=state.passes.find(row=>row.id===id&&!row.voidedAt);if(!pass)fail('연결할 레슨권을 선택해 주세요.');return pass};
 function audit(collection,before,after,action,batchId){state.history.push({id:uid(),at:now,collection,entityId:after.id,action,before:before?clone(before):null,after:clone(after),batchId:batchId||null})}
 function put(collection,data,action,batchId){
  const before=data.id?state[collection].find(row=>row.id===data.id):null;
  if(data.id&&!before)fail('수정할 기록을 찾지 못했어요.');
  if(before&&data.expectedVersion!==before.version)fail('다른 곳에서 수정된 기록이에요. 다시 열어 주세요.');
  const after={...(before||{}),...data,id:before?.id||uid(),createdAt:before?.createdAt||now,updatedAt:now,version:(before?.version||0)+1};
  delete after.expectedVersion;if(batchId)after.importBatchId=batchId;
  if(before)state[collection][state[collection].indexOf(before)]=after;else state[collection].push(after);
  audit(collection,before,after,action,batchId);return after;
 }
 function passWrite(data,batchId){
  const name=str(data.name);if(!name)fail('레슨권 이름을 입력해 주세요.');
  integer(data.totalUnits,'총 횟수',{max:100000000});integer(data.amount,'레슨권 금액');if(!data.totalUnits)fail('총 횟수는 0보다 커야 해요.');
  const prior=state.passes.find(row=>row.id===data.id);
  if(prior&&(prior.amount!==data.amount||prior.totalUnits!==data.totalUnits)&&[...state.payments,...state.deductions,...state.adjustments].some(row=>row.passId===prior.id)&&!opts.ackImpact)fail('사용 이력이 있어요. 정산 금액 변경 영향을 확인해 주세요.');
  return put('passes',{id:data.id,expectedVersion:data.expectedVersion,name,totalUnits:data.totalUnits,amount:data.amount,teacher:str(data.teacher),expires:data.expires?date(data.expires):'',memo:str(data.memo)},'pass.save',batchId);
 }
 function paymentWrite(data,batchId){
  findPass(data.passId);const kind=data.kind||'payment';if(!['payment','refund'].includes(kind))fail('결제/환불 유형을 확인해 주세요.');
  const row={id:data.id,expectedVersion:data.expectedVersion,passId:data.passId,date:date(data.date),kind,amount:integer(data.amount,'결제금액'),method:str(data.method),memo:str(data.memo),student:str(data.student),reference:str(data.reference)};
  if(!row.amount)fail('결제/환불 금액은 0보다 커야 해요.');
  if(active(state.payments).some(item=>item.id!==row.id&&((row.reference&&item.reference===row.reference)||fingerprint('payment',item)===fingerprint('payment',row)))&&!opts.allowDuplicate)fail('동일한 결제 의심 기록이 있어요. 별도 결제임을 확인해 주세요.');
  return put('payments',row,'payment.save',batchId);
 }
 function deductionWrite(data,batchId){
  findPass(data.passId);const normalized=status(data.status);if(normalized==='unconfirmed')fail('실제 수강 상태를 확인해 주세요.');
  const count=data.units??(normalized==='completed'?100:0);integer(count,'차감 횟수',{max:100000000});
  if(['scheduled','cancelled','free'].includes(normalized)&&count!==0)fail('예정·취소·무료 레슨은 0회예요. 당일 취소 차감은 당일 취소 상태를 선택해 주세요.');
  const lessonId=str(data.lessonId),legacyRef=str(data.legacyRef)||(lessonId?'':uid());
  if(active(state.deductions).some(row=>row.id!==data.id&&((lessonId&&row.lessonId===lessonId)||(!lessonId&&legacyRef&&row.legacyRef===legacyRef))))fail('동일 레슨의 차감 기록이 이미 있어요. 기존 기록을 수정하거나 취소해 주세요.');
  const row={id:data.id,expectedVersion:data.expectedVersion,passId:data.passId,lessonId,legacyRef,date:date(data.date),start:time(data.start),end:time(data.end),status:normalized,units:count,memo:str(data.memo),student:str(data.student)};
  if(row.start&&row.end&&row.end<=row.start)fail('종료 시간은 시작 시간보다 늦어야 해요.');
  return put('deductions',row,'deduction.save',batchId);
 }
 if(command.type==='pass.save')passWrite(payload);
 else if(command.type==='payment.save')paymentWrite(payload);
 else if(command.type==='deduction.save')deductionWrite(payload);
 else if(command.type==='adjustment.create'){
  findPass(payload.passId);integer(payload.unitsDelta,'조정 횟수',{negative:true,max:100000000});integer(payload.amountDelta,'조정 금액',{negative:true});
  if(!str(payload.memo)||(!payload.unitsDelta&&!payload.amountDelta))fail('조정 값과 사유를 입력해 주세요.');
  put('adjustments',{passId:payload.passId,date:date(payload.date),unitsDelta:payload.unitsDelta,amountDelta:payload.amountDelta,memo:str(payload.memo)},'adjustment.create');
 }else if(command.type==='entity.void'||command.type==='entity.restore'){
  if(!['payments','deductions','adjustments'].includes(payload.collection))fail('취소할 수 없는 기록이에요.');
  const row=state[payload.collection].find(item=>item.id===payload.id);if(!row)fail('기록을 찾지 못했어요.');
  if(command.type==='entity.restore')findPass(row.passId);
  if(command.type==='entity.restore'&&payload.collection==='deductions'&&active(state.deductions).some(other=>other.id!==row.id&&((row.lessonId&&other.lessonId===row.lessonId)||(row.legacyRef&&other.legacyRef===row.legacyRef))))fail('동일 레슨에 다른 차감이 있어 복구할 수 없어요.');
  if(command.type==='entity.restore'&&payload.collection==='payments'&&active(state.payments).some(other=>other.id!==row.id&&fingerprint('payment',other)===fingerprint('payment',row))&&!opts.allowDuplicate)fail('동일 결제가 있어 복구할 수 없어요.');
  put(payload.collection,{id:row.id,expectedVersion:payload.expectedVersion,voidedAt:command.type==='entity.void'?now:null},command.type);
 }else if(command.type==='import.commit'){
  if(!['payment','deduction'].includes(payload.kind))fail('업로드 유형을 확인해 주세요.');
  if(!payload.batchId||state.imports.some(batch=>batch.id===payload.batchId))fail('이미 등록한 업로드 작업이에요.');
  if(!Array.isArray(payload.rows)||!payload.rows.length||payload.rows.length>2000)fail('등록할 행을 선택해 주세요. 한 번에 최대 2,000행이에요.');
  const created=[],seen=new Set();
  for(const item of payload.rows){
   if(seen.has(item.sourceRow))fail('동일 업로드 행이 두 번 선택됐어요.');seen.add(item.sourceRow);
   if(item.suspected&&!opts.allowDuplicate)fail('중복 의심 행을 확인해 주세요.');
   const data=clone(item.data);if(data.id)fail('일괄 등록은 기존 데이터를 덮어쓰지 않아요.');
   if(item.newPass){const pass=passWrite(item.newPass,payload.batchId);data.passId=pass.id;created.push({collection:'passes',id:pass.id,version:pass.version})}
   const row=payload.kind==='payment'?paymentWrite(data,payload.batchId):deductionWrite(data,payload.batchId);
   const collection=payload.kind==='payment'?'payments':'deductions';created.push({collection,id:row.id,version:row.version});
   state.importRows.push({id:uid(),batchId:payload.batchId,sourceRow:item.sourceRow,raw:item.raw,sourceKey:item.sourceKey,collection,entityId:row.id,status:'imported'});
  }
  for(const row of payload.otherRows||[]){if(seen.has(row.sourceRow))fail('중복 업로드 행');state.importRows.push({id:uid(),batchId:payload.batchId,sourceRow:row.sourceRow,raw:row.raw,status:row.errors?.length?'failed':'skipped',errors:row.errors||[],warnings:row.warnings||[]})}
  state.imports.push({id:payload.batchId,fileName:str(payload.fileName),fileHash:str(payload.fileHash),kind:payload.kind,at:now,success:payload.rows.length,failed:payload.failed||0,duplicates:payload.duplicates||0,skipped:payload.skipped||0,status:'applied',created});
 }else if(command.type==='import.undo'){
  const batch=state.imports.find(row=>row.id===payload.id);if(!batch||batch.status!=='applied')fail('되돌릴 수 없는 업로드예요.');
  const createdIds=new Set(batch.created.map(row=>row.id));
  for(const record of batch.created){
   const current=state[record.collection].find(row=>row.id===record.id);
   if(!current||current.version!==record.version||current.voidedAt)fail('업로드 후 수정된 기록이 있어요. 안전한 되돌리기를 위해 개별 기록을 먼저 확인해 주세요.');
   if(record.collection==='passes'&&[...state.payments,...state.deductions,...state.adjustments].some(row=>row.passId===current.id&&!createdIds.has(row.id)))fail('업로드 이후 다른 기록이 레슨권에 연결되어 있어 되돌릴 수 없어요.');
  }
  for(const record of batch.created)put(record.collection,{id:record.id,expectedVersion:record.version,voidedAt:now},'import.undo',batch.id);
  batch.status='undone';batch.undoneAt=now;state.importRows.filter(row=>row.batchId===batch.id&&row.status==='imported').forEach(row=>row.status='undone');
 }else fail('지원하지 않는 정산 작업이에요.');
 const balances=check(state,true);
 if(!opts.allowOverdraw){const before=new Map(totals(original).passes.map(pass=>[pass.id,pass.remainingUnits]));
  if(balances.passes.some(pass=>pass.remainingUnits<Math.min(0,before.get(pass.id)||0)))fail('잔여 횟수를 초과해요. 차감/조정 값을 확인하거나 초과 사용을 명시적으로 확인해 주세요.');
 }
 state.revision++;return state;
}
return {empty,validateState,reduce,totals,passBalance,fingerprint,money,units,date,time,status,active,check};
});
