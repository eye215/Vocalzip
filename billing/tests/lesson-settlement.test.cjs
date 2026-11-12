const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../core.js'),P=require('../pending.js');
const TODAY='2026-11-09';
let n=0;const ctx={now:'2026-11-09T12:00:00Z',uid:()=>'fixture-'+(++n)};
const run=(s,type,payload)=>C.reduce(s,{type,payload},ctx);
const lesson=(id,status='completed',extra={})=>({lesson_id:id,lesson_date:TODAY,lesson_status:status,...extra});
function seed(){
 let s=run(C.empty('fixture'),'pass.save',{name:'10회',amount:300000,totalUnits:1000});
 s=run(s,'payment.save',{passId:s.passes[0].id,date:TODAY,kind:'payment',amount:300000});
 s=run(s,'payment.save',{passId:s.passes[0].id,date:TODAY,kind:'refund',amount:10000});
 s=run(s,'deduction.save',{passId:s.passes[0].id,date:TODAY,status:'completed',units:200,memo:'keep'});
 return s;
}
for(const status of ['scheduled','cancelled']){
 test('imported lesson '+status+' restores its exact linked charge, never a same-date neighbour',()=>{
  let s=seed(),d=s.deductions[0];
  s=run(s,'deduction.save',{passId:s.passes[0].id,date:TODAY,status:'completed',units:100,lessonId:'other'});
  const l=lesson('bill-'+d.id,status,{billing_deduction_id:d.id});
  const group=P.classify([l,lesson('other')],s,TODAY);
  assert.equal(group.toRestore.length,1);assert.equal(group.toRestore[0].deduction.id,d.id);
  const cmd=P.cancellationFor(l,d),before=JSON.stringify(s),pay=JSON.stringify(s.payments);
  P.verifyLesson(cmd,[l,lesson('other')],s);const after=C.reduce(s,cmd,ctx);
  assert.equal(JSON.stringify(s),before);
  assert.equal(JSON.stringify(after.payments),pay);
  assert.equal(C.totals(after).total.remainingUnits,900);
  assert.equal(after.deductions.find(r=>r.lessonId==='other').voidedAt,undefined);
  assert.equal(after.history.at(-1).before.units,200);
  assert.throws(()=>C.reduce(after,cmd,ctx),/수정된/);
  assert.equal(P.classify([l],after,TODAY).toRestore.length,0);
  assert.equal(P.autoCandidates([l],after,TODAY,0).length,0);
 });
}
test('completed imports, intentional same-day cancellation charges and unlinked dates are preserved',()=>{
 const s=seed(),d=s.deductions[0];
 assert.equal(P.classify([lesson('import','completed',{billing_deduction_id:d.id})],s,TODAY).toRestore.length,0);
 const intentional=structuredClone(s);intentional.deductions[0].status='noshow';
 assert.equal(P.classify([lesson('import','cancelled',{billing_deduction_id:d.id})],intentional,TODAY).toRestore.length,0);
 assert.equal(P.classify([lesson('same-date','cancelled')],s,TODAY).toRestore.length,0);
 assert.equal(P.classify([lesson('missing','cancelled',{billing_deduction_id:'gone'})],s,TODAY).toDeduct.length,0);
});
test('conflicting or foreign lesson links are not guessed or charged again',()=>{
 const s=seed(),d=s.deductions[0];d.lessonId='someone-else';
 const l=lesson('import','cancelled',{billing_deduction_id:d.id}),before=JSON.stringify(s);
 assert.equal(P.linkedDeduction(l,s).conflict,true);
 assert.equal(P.classify([l],s,TODAY).toRestore.length,0);
 assert.throws(()=>P.verifyLesson(P.cancellationFor(l,d),[l],s),/일치하지/);
 assert.equal(JSON.stringify(s),before);
});
test('two active targets for one lesson require manual reconciliation',()=>{
 let s=seed(),d=s.deductions[0];
 s=run(s,'deduction.save',{passId:s.passes[0].id,date:TODAY,status:'completed',units:100,lessonId:'lesson'});
 const l=lesson('lesson','cancelled',{billing_deduction_id:d.id});
 assert.equal(P.linkedDeduction(l,s).conflict,true);
 assert.equal(P.classify([l],s,TODAY).toRestore.length,0);
});
for(const change of ['removed','status','date','time','link','touched']){
 test('stale deduction rejects '+change+' before financial writes',()=>{
  const s=seed(),l=lesson('new'),cmd=P.deductionFor(l,s.passes[0].id),now=structuredClone(l);
  if(change==='status')now.lesson_status='cancelled';
  if(change==='date')now.lesson_date='2026-11-08';
  if(change==='time')now.lesson_start='10:00';
  if(change==='link')now.billing_deduction_id='other';
  if(change==='touched')now.lesson_touched=1;
  const before=JSON.stringify(s);
  assert.throws(()=>P.verifyLesson(cmd,change==='removed'?[]:[now],s),/변경되거나 삭제/);
  assert.equal(JSON.stringify(s),before);
 });
}
test('stale cancellation, duplicate lesson IDs and a different cancellation target are refused',()=>{
 const s=seed(),d=s.deductions[0],l=lesson('import','cancelled',{billing_deduction_id:d.id}),cmd=P.cancellationFor(l,d);
 assert.throws(()=>P.verifyLesson(cmd,[{...l,lesson_status:'completed'}],s),/변경되거나 삭제/);
 assert.throws(()=>P.verifyLesson(cmd,[l,l],s),/변경되거나 삭제/);
 cmd.payload.id='other';assert.throws(()=>P.verifyLesson(cmd,[l],s),/취소할 레슨/);
});
test('current guards accept object key reordering, explicit legacy confirmation and unrelated lesson edits',()=>{
 const s=seed(),l=lesson('legacy','unconfirmed'),cmd=P.deductionFor(l,s.passes[0].id);
 cmd.options.lessonGuard=Object.fromEntries(Object.entries(cmd.options.lessonGuard).reverse());
 P.verifyLesson(cmd,[l,lesson('other','cancelled')],s);
 assert.equal(C.reduce(s,cmd,ctx).deductions.at(-1).lessonId,'legacy');
});
test('scheduled and cancelled lessons cannot acquire a new completed charge through the app bridge',()=>{
 const s=seed();
 for(const status of ['scheduled','cancelled','free']){
  const l=lesson('blocked',status),cmd=P.deductionFor(l,s.passes[0].id);
  assert.throws(()=>P.verifyLesson(cmd,[l],s),/완료로 확인된/);
 }
});
test('existing completed charge linked only by deduction ID still prevents duplicate billing',()=>{
 const s=seed(),l=lesson('import','completed',{billing_deduction_id:s.deductions[0].id});
 assert.throws(()=>P.verifyLesson(P.deductionFor(l,s.passes[0].id),[l],s),/이미 있어요/);
});
