(function(root,factory){const C=typeof module==='object'&&module.exports?require('./core.js'):root.VzipBilling;const api=factory(C);if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipBillingImport=api})(globalThis,C=>{
'use strict';
const fields={
 payment:{date:['결제일','결제날짜','paymentdate','date'],amount:['결제금액','금액','amount'],charged:['충전횟수','레슨횟수충전','총횟수','sessions'],passAmount:['레슨권금액','계약금액'],passName:['레슨권','레슨권이름','상품'],kind:['결제유형','유형','kind'],method:['결제방법','결제수단','method'],memo:['메모','비고','내용','note'],student:['수강생','사용자','student'],reference:['결제번호','거래번호','reference']},
 deduction:{date:['레슨날짜','레슨일','수강일','날짜','date'],start:['시작시간','시작','start'],end:['종료시간','종료','end'],status:['진행상태','레슨상태','상태','status'],units:['차감횟수','차감','횟수','deduction'],memo:['레슨내용','레슨메모','메모','내용','note'],student:['수강생','사용자','student'],passName:['레슨권','레슨권이름','상품'],lessonId:['lesson_id','레슨id','기존레슨id'],reference:['외부id','notionid','기록id']}
};
const labels={date:'날짜',amount:'결제금액',charged:'충전 횟수',passAmount:'레슨권 금액',passName:'레슨권 이름',kind:'결제/환불',method:'결제 방법',memo:'메모',student:'수강생',reference:'외부 거래/기록 ID',start:'시작 시간',end:'종료 시간',status:'진행 상태',units:'차감 횟수',lessonId:'기존 Lesson ID'};
const norm=value=>String(value??'').toLowerCase().replace(/[\s_\-().]/g,'');
function autoMap(headers,kind){const mapping={};for(const [field,names] of Object.entries(fields[kind]))mapping[field]=headers.findIndex(header=>names.some(name=>norm(header)===norm(name)));return mapping}
function drafts(rows,mapping,settings,state){
 const get=(row,key)=>mapping[key]>=0?(row[mapping[key]]??''):'';
 return rows.slice(1).map((raw,index)=>{
  const name=String(get(raw,'passName')).trim(),found=C.active(state.passes).filter(pass=>pass.name===name);
  const row={sourceRow:index+2,raw:raw.slice(),selected:true,sourceKey:settings.hash+':'+settings.sheet+':'+(index+2),
   date:get(raw,'date'),passId:found.length===1?found[0].id:(settings.passId||''),memo:get(raw,'memo'),student:get(raw,'student'),reference:get(raw,'reference')};
  if(settings.kind==='payment')Object.assign(row,{amount:get(raw,'amount'),kind:/환불|refund/i.test(get(raw,'kind'))?'refund':'payment',method:get(raw,'method'),
   newPass:settings.mode==='new',passName:name||String(get(raw,'date'))+' 레슨권',charged:get(raw,'charged'),passAmount:get(raw,'passAmount')});
  else{const status=C.status(get(raw,'status'));Object.assign(row,{status,start:get(raw,'start'),end:get(raw,'end'),units:get(raw,'units')!==''?get(raw,'units'):(status==='completed'?'1':'0'),lessonId:String(get(raw,'lessonId')).trim()})}
  return row;
 });
}
function inspect(rows,settings,state,lessons=[]){
 const seen=new Set(),knownLessons=new Set(lessons.map(row=>row.lesson_id));
 return rows.map(row=>{
  const result={...row,errors:[],warnings:[],suspected:false,newPass:null};
  try{
   const data={passId:row.passId,date:C.date(row.date,{date1904:settings.date1904}),memo:String(row.memo||''),student:String(row.student||'')};
   if(settings.kind==='payment'){
    let amount=C.money(row.amount);data.kind=amount<0?'refund':row.kind||'payment';data.amount=Math.abs(amount);data.method=String(row.method||'');data.reference=String(row.reference||'');
    if(row.newPass){
     if(data.kind==='refund')throw Error('환불은 기존 레슨권에 연결해 주세요.');
     result.newPass={name:String(row.passName||'').trim(),totalUnits:C.units(row.charged),amount:row.passAmount!==''&&row.passAmount!==undefined?C.money(row.passAmount):data.amount,teacher:'',memo:'일괄 업로드에서 생성'};
     if(!result.newPass.name||result.newPass.totalUnits<=0||result.newPass.amount<0)throw Error('새 레슨권의 이름·충전 횟수·금액을 확인해 주세요.');
     data.passId='new:'+row.sourceRow;result.warnings.push('이 행에서 새 레슨권 생성. 분할 결제는 기존 레슨권을 선택하세요.');
    }else if(row.charged!=='')result.warnings.push('기존 레슨권의 충전 횟수는 변경하지 않아요.');
    if(!data.amount)throw Error('금액은 0보다 커야 해요.');
   }else{
    data.status=C.status(row.status);if(data.status==='unconfirmed')throw Error('수강 상태를 직접 확인해 주세요.');
    data.units=C.units(row.units);data.start=C.time(row.start);data.end=C.time(row.end);data.lessonId=row.lessonId||'';data.legacyRef=data.lessonId?'':(String(row.reference||'')||'import:'+settings.hash+':'+settings.sheet+':'+row.sourceRow);
    if(data.units<0)throw Error('차감 횟수는 음수가 될 수 없어요.');
    if(['scheduled','cancelled','free'].includes(data.status)&&data.units!==0)throw Error('예정·취소·무료는 0회예요.');
    if(data.start&&data.end&&data.end<=data.start)throw Error('시작·종료 시간을 확인해 주세요.');
    if(data.lessonId&&!knownLessons.has(data.lessonId))throw Error('기존 Lesson ID를 찾지 못했어요.');
    if(C.active(state.deductions).some(item=>(data.lessonId&&item.lessonId===data.lessonId)||(!data.lessonId&&item.legacyRef===data.legacyRef)))throw Error('이미 연결된 수강 기록이에요. 기존 이력에서 수정해 주세요.');
    if(!data.start&&!data.end)result.warnings.push('날짜만 있는 과거 기록 · 같은 날짜의 다른 수강도 등록 가능');
   }
   if(!result.newPass&&!C.active(state.passes).some(pass=>pass.id===data.passId))throw Error('연결 레슨권을 선택해 주세요.');
   const compareData=result.newPass?{...data,passId:'new:'+result.newPass.name+':'+result.newPass.totalUnits+':'+result.newPass.amount}:data;
   const key=C.fingerprint(settings.kind,compareData),existing=settings.kind==='payment'?C.active(state.payments):C.active(state.deductions);
   result.suspected=seen.has(key)||existing.some(item=>{if(!result.newPass)return C.fingerprint(settings.kind,item)===key;const pass=state.passes.find(pass=>pass.id===item.passId);return pass?.name===result.newPass.name&&pass?.totalUnits===result.newPass.totalUnits&&pass?.amount===result.newPass.amount&&C.fingerprint(settings.kind,item)===C.fingerprint(settings.kind,{...data,passId:item.passId})})||(settings.kind==='payment'&&data.reference&&existing.some(item=>item.reference===data.reference))||state.importRows.some(item=>item.sourceKey===row.sourceKey&&item.status==='imported');
   seen.add(key);if(result.suspected)result.warnings.push('중복 의심 · 별도 기록인지 확인 후 선택하세요.');
   result.data=data;
  }catch(error){result.errors.push(error.message)}
  return result;
 });
}
return {fields,labels,autoMap,drafts,inspect};
});
