const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../core.js'),I=require('../import.js'),F=require('../files.js');
let sequence=0;
const context={uid:()=>String(++sequence),now:'2026-11-04T09:00:00Z'};
const run=(state,type,payload,options={})=>C.reduce(state,{type,payload,options},context);
function setup(amount=300000,totalUnits=1000){const state=run(C.empty('test'),'pass.save',{name:'10회권',amount,totalUnits});return {state,passId:state.passes[0].id}}
test('Installments and refunds remain separate from contractual amount',()=>{
 let {state,passId}=setup();state=run(state,'payment.save',{passId,date:'2026-11-01',amount:100000,kind:'payment'});
 state=run(state,'payment.save',{passId,date:'2026-11-02',amount:200000,kind:'payment'});
 state=run(state,'payment.save',{passId,date:'2026-11-03',amount:50000,kind:'refund'});
 const total=C.totals(state).total;assert.equal(total.amount,300000);assert.equal(total.paid,300000);assert.equal(total.refunded,50000);assert.equal(total.unpaid,50000);
});
test('Per-pass rational allocation rounds once and consumes the exact full price',()=>{
 let {state,passId}=setup(100000,300);
 for(let i=0;i<3;i++)state=run(state,'deduction.save',{passId,date:'2026-11-04',status:'completed',lessonId:'lesson-'+i});
 assert.equal(C.totals(state).total.usedAmount,100000);assert.equal(C.totals(state).total.unusedAmount,0);
});
test('Status defaults, consecutive sessions, free lessons and completion cancellation',()=>{
 let {state,passId}=setup();for(const status of ['scheduled','cancelled','free'])state=run(state,'deduction.save',{passId,date:'2026-11-04',status});
 state=run(state,'deduction.save',{passId,date:'2026-11-04',status:'noshow',units:100});
 state=run(state,'deduction.save',{passId,date:'2026-11-04',status:'completed',units:200});
 let row=state.deductions.at(-1);state=run(state,'deduction.save',{...row,expectedVersion:row.version,status:'cancelled',units:0});
 assert.equal(C.totals(state).total.usedUnits,100);assert.equal(state.history.at(-1).before.units,200);
});
test('Same lesson cannot be deducted twice across different passes',()=>{
 let {state,passId}=setup();state=run(state,'pass.save',{name:'다른 권',amount:10000,totalUnits:100});
 state=run(state,'deduction.save',{passId,date:'2026-11-04',status:'completed',lessonId:'one'});
 assert.throws(()=>run(state,'deduction.save',{passId:state.passes[1].id,date:'2026-11-04',status:'completed',lessonId:'one'}),/동일 레슨/);
});
test('Date-only historical lessons on the same day are distinct',()=>{
 let {state,passId}=setup();for(let i=0;i<2;i++)state=run(state,'deduction.save',{passId,date:'2026-11-04',status:'completed'});
 assert.equal(state.deductions.length,2);assert.notEqual(state.deductions[0].legacyRef,state.deductions[1].legacyRef);assert.equal(C.totals(state).total.usedUnits,200);
});
test('Cancelling and restoring deductions retains audit history',()=>{
 let {state,passId}=setup();state=run(state,'deduction.save',{passId,date:'2026-11-04',status:'completed'});let row=state.deductions[0];
 state=run(state,'entity.void',{collection:'deductions',id:row.id,expectedVersion:row.version});assert.equal(C.totals(state).total.usedUnits,0);
 row=state.deductions[0];state=run(state,'entity.restore',{collection:'deductions',id:row.id,expectedVersion:row.version});assert.equal(C.totals(state).total.usedUnits,100);assert.equal(state.history.at(-1).before.voidedAt,context.now);
});
test('Duplicate payments require explicit confirmation and stale edits fail',()=>{
 let {state,passId}=setup(),data={passId,date:'2026-11-04',amount:50000};
 state=run(state,'payment.save',data);assert.throws(()=>run(state,'payment.save',data),/동일한 결제/);
 const row=state.payments[0];assert.throws(()=>run(state,'payment.save',{...row,expectedVersion:0,amount:40000}),/다른 곳/);
 state=run(state,'payment.save',data,{allowDuplicate:true});assert.equal(state.payments.length,2);
});
test('Failed operations do not mutate their input and overdraw needs explicit acknowledgement',()=>{
 const {state,passId}=setup(1000,100),copy=JSON.stringify(state);
 assert.throws(()=>run(state,'deduction.save',{passId,date:'2026-11-04',status:'completed',units:200}),/잔여 횟수/);
 assert.equal(JSON.stringify(state),copy);
 const next=run(state,'deduction.save',{passId,date:'2026-11-04',status:'completed',units:200},{allowOverdraw:true});assert.equal(C.totals(next).total.remainingUnits,-100);
});
test('Pass edits with history require impact acknowledgement and recompute settlement',()=>{
 let {state,passId}=setup();state=run(state,'deduction.save',{passId,date:'2026-11-04',status:'completed'});
 const pass=state.passes[0],edit={...pass,expectedVersion:pass.version,amount:400000};
 assert.throws(()=>run(state,'pass.save',edit),/영향/);state=run(state,'pass.save',edit,{ackImpact:true});assert.equal(C.totals(state).total.usedAmount,40000);
});
test('Manual adjustments are separate reversible transactions with effective rate',()=>{
 let {state,passId}=setup();state=run(state,'deduction.save',{passId,date:'2026-11-04',status:'completed'});
 state=run(state,'adjustment.create',{passId,date:'2026-11-04',unitsDelta:1000,amountDelta:100000,memo:'추가 충전'});
 assert.equal(state.passes[0].amount,300000);assert.equal(C.totals(state).total.amount,400000);assert.equal(C.totals(state).total.usedAmount,20000);
 const row=state.adjustments[0];state=run(state,'entity.void',{collection:'adjustments',id:row.id,expectedVersion:row.version});assert.equal(C.totals(state).total.usedAmount,30000);
});
const paymentRow=(passId,n=2)=>({sourceRow:n,sourceKey:'file:'+n,raw:['2026-11-04',1000],data:{passId,date:'2026-11-04',amount:1000,kind:'payment',memo:String(n)}});
test('Import commits selected rows atomically and undo affects only newly created data',()=>{
 let {state,passId}=setup();state=run(state,'payment.save',{passId,date:'2026-11-01',amount:5000});
 state=run(state,'import.commit',{batchId:'batch',kind:'payment',fileName:'입금.csv',rows:[paymentRow(passId)],otherRows:[{sourceRow:3,raw:['bad'],errors:['날짜 오류']}],failed:1});
 assert.equal(state.imports[0].success,1);assert.equal(state.importRows[1].status,'failed');
 state=run(state,'import.undo',{id:'batch'});assert.equal(C.totals(state).total.paid,5000);assert.equal(state.payments.length,2);assert.equal(state.imports[0].status,'undone');
});
test('Undo is blocked after an imported payment was edited',()=>{
 let {state,passId}=setup();state=run(state,'import.commit',{batchId:'batch',kind:'payment',rows:[paymentRow(passId)]});const payment=state.payments[0];
 state=run(state,'payment.save',{...payment,amount:2000,expectedVersion:payment.version});assert.throws(()=>run(state,'import.undo',{id:'batch'}),/수정된/);
});
test('Undo refuses to remove a pass referenced by later records',()=>{
 let state=C.empty('test');state=run(state,'import.commit',{batchId:'batch',kind:'payment',rows:[{...paymentRow('new'),newPass:{name:'신규',amount:1000,totalUnits:100}}]});
 state=run(state,'deduction.save',{passId:state.passes[0].id,date:'2026-11-04',status:'completed'});assert.throws(()=>run(state,'import.undo',{id:'batch'}),/연결/);
});
test('One invalid selected row rolls back the whole import',()=>{
 const {state,passId}=setup(),before=JSON.stringify(state);
 assert.throws(()=>run(state,'import.commit',{batchId:'batch',kind:'payment',rows:[paymentRow(passId),{...paymentRow(passId,3),data:{passId,date:'bad',amount:1000}}]}));
 assert.equal(JSON.stringify(state),before);
});
test('Notion aliases map and ambiguous historical attendance requires review',()=>{
 const headers=['수강생','레슨날짜','레슨내용','시작시간','종료시간'],mapping=I.autoMap(headers,'deduction'),{state,passId}=setup();
 assert.equal(mapping.student,0);assert.equal(mapping.memo,2);const options={kind:'deduction',passId,hash:'file',sheet:'0'};
 const rows=I.drafts([headers,['김학생','2026년 11월 4일','노션 메모','','']],mapping,options,state);
 assert.equal(rows[0].status,'unconfirmed');assert.match(I.inspect(rows,options,state)[0].errors.join(),/확인/);
 rows[0].status='completed';rows[0].units='1';assert.equal(I.inspect(rows,options,state)[0].errors.length,0);
});
test('Same-date different attendance is not automatically duplicate',()=>{
 const {state,passId}=setup(),settings={kind:'deduction',passId,hash:'file',sheet:'0'},headers=['레슨날짜','상태','레슨내용'];
 const rows=I.drafts([headers,['2026-11-04','완료','오전'],['2026-11-04','완료','오후']],I.autoMap(headers,'deduction'),settings,state);
 assert.deepEqual(I.inspect(rows,settings,state).map(row=>row.suspected),[false,false]);
});
test('CSV supports BOM, quotes, multiline notes and empty cells without evaluating formulas',()=>{
 const rows=F.csv('\uFEFF결제일,금액,메모\r\n2026-11-04,"100,000","첫 줄\n둘째 ""줄"""\r\n2026-11-05,50000,=1+1');
 assert.equal(rows.length,3);assert.equal(rows[1][2],'첫 줄\n둘째 "줄"');assert.equal(rows[2][2],'=1+1');
 assert.deepEqual(F.csv('날짜\t메모\n2026-11-04\t자료'),[['날짜','메모'],['2026-11-04','자료']]);
 assert.throws(()=>F.csv('a,b\n"unclosed'));
});
test('Date and currency normalization reject ambiguous or impossible values',()=>{
 assert.equal(C.date('2024.2.29'),'2024-02-29');assert.equal(C.date('November 4, 2026'),'2026-11-04');
 assert.equal(C.date(61),'1900-03-01');assert.equal(C.date(1,{date1904:true}),'1904-01-02');assert.throws(()=>C.date(60));
 assert.throws(()=>C.date('2026-02-30'));assert.equal(C.money('₩ 100,000원'),100000);assert.equal(C.units('1.25회'),125);assert.throws(()=>C.units('0.001'));assert.equal(C.money('1,000.00'),1000);
});
test('Fractional use never drifts under a sequence of edits and reversals',()=>{
 let {state,passId}=setup(99999,1000);
 for(let i=0;i<20;i++)state=run(state,'deduction.save',{passId,date:'2026-11-04',status:'completed',units:25});
 assert.equal(C.totals(state).total.usedAmount,50000);
 for(const initial of state.deductions.slice(0,10))state=run(state,'entity.void',{collection:'deductions',id:initial.id,expectedVersion:initial.version});
 const total=C.totals(state).total;assert.equal(total.usedUnits,250);assert.equal(total.usedAmount,25000);assert.equal(total.usedAmount+total.unusedAmount,total.amount);
});

test('Existing acknowledged overdraw does not prevent payments or partial recovery',()=>{
 let {state,passId}=setup(1000,100);state=run(state,'deduction.save',{passId,date:'2026-11-04',status:'completed',units:300},{allowOverdraw:true});
 state=run(state,'payment.save',{passId,date:'2026-11-04',amount:1000});
 const deduction=state.deductions[0];state=run(state,'deduction.save',{...deduction,expectedVersion:deduction.version,units:200});
 assert.equal(C.totals(state).total.remainingUnits,-100);assert.equal(C.totals(state).total.paid,1000);
 assert.throws(()=>run(state,'deduction.save',{passId,date:'2026-11-04',status:'completed'}),/잔여 횟수/);
});
test('Records belonging to an undone new pass cannot be restored invisibly',()=>{
 let state=run(C.empty('test'),'import.commit',{batchId:'batch',kind:'payment',rows:[{...paymentRow('new'),newPass:{name:'신규',amount:1000,totalUnits:100}}]});
 state=run(state,'import.undo',{id:'batch'});const row=state.payments[0];
 assert.throws(()=>run(state,'entity.restore',{collection:'payments',id:row.id,expectedVersion:row.version}),/레슨권/);
});
test('Explicit new-pass import mode never silently attaches to the default pass',()=>{
 const {state,passId}=setup(),settings={kind:'payment',passId,mode:'new',hash:'new',sheet:'0'},headers=['결제일','금액','충전횟수'];
 const rows=I.drafts([headers,['2026-11-04',10000,1]],I.autoMap(headers,'payment'),settings,state);
 assert.equal(rows[0].newPass,true);assert.equal(I.inspect(rows,settings,state)[0].newPass.totalUnits,100);
});
