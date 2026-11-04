const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../core.js'),P=require('../pending.js');
let sequence=0;
const context={uid:()=>'id'+(++sequence),now:'2026-11-04T09:00:00Z'};
const run=(state,type,payload,options={})=>C.reduce(state,{type,payload,options},context);
const L=(id,date,status)=>({lesson_id:id,lesson_date:date,lesson_status:C.status(status)});
test('Main app v6 "done" lessons count as completed; missing status stays unconfirmed',()=>{
 assert.equal(C.status('done'),'completed');
 assert.equal(C.status(undefined),'unconfirmed');
 assert.equal(C.status('scheduled'),'scheduled');
});
test('Pending lists: completed to deduct, status-less to confirm, future and scheduled ignored',()=>{
 const state=run(C.empty('t'),'pass.save',{name:'10회권',amount:300000,totalUnits:1000});
 const lessons=[L('a','2026-11-01','done'),L('b','2026-10-20',undefined),L('c','2026-11-10','done'),L('d','2026-11-02','scheduled'),L('e','2026-11-03','cancelled')];
 const g=P.classify(lessons,state,'2026-11-04');
 assert.deepEqual(g.toDeduct.map(x=>x.lesson_id),['a']);
 assert.deepEqual(g.toConfirm.map(x=>x.lesson_id),['b']);
 assert.equal(g.toRestore.length,0);
});
test('One-tap deduction removes the lesson from pending and is guarded against duplicates',()=>{
 let state=run(C.empty('t'),'pass.save',{name:'10회권',amount:300000,totalUnits:1000});
 const passId=P.defaultPass(state,C.totals(state)),lesson=L('a','2026-11-01','done');
 assert.equal(passId,state.passes[0].id);
 const cmd=P.deductionFor(lesson,passId);
 state=C.reduce(state,cmd,context);
 assert.equal(C.totals(state).total.usedUnits,100);
 assert.equal(C.totals(state).total.usedAmount,30000);
 assert.equal(P.classify([lesson],state,'2026-11-04').toDeduct.length,0);
 assert.throws(()=>C.reduce(state,cmd,context),/이미 있어요/);
});
test('A charged lesson later cancelled in the app is offered for restore; voiding restores the balance',()=>{
 let state=run(C.empty('t'),'pass.save',{name:'10회권',amount:300000,totalUnits:1000});
 state=C.reduce(state,P.deductionFor(L('a','2026-11-01','done'),state.passes[0].id),context);
 const g=P.classify([L('a','2026-11-01','cancelled')],state,'2026-11-04');
 assert.equal(g.toRestore.length,1);
 const d=g.toRestore[0].deduction;
 state=run(state,'entity.void',{collection:'deductions',id:d.id,expectedVersion:d.version});
 assert.equal(C.totals(state).total.remainingUnits,1000);
 assert.equal(P.classify([L('a','2026-11-01','cancelled')],state,'2026-11-04').toRestore.length,0);
});
test('Same-day cancel charges are intentional and not offered for restore',()=>{
 let state=run(C.empty('t'),'pass.save',{name:'10회권',amount:300000,totalUnits:1000});
 state=run(state,'deduction.save',{passId:state.passes[0].id,lessonId:'a',date:'2026-11-01',status:'noshow',units:100});
 assert.equal(P.classify([L('a','2026-11-01','cancelled')],state,'2026-11-04').toRestore.length,0);
});
test('Default pass is first-in-first-out among passes with a full session left',()=>{
 let state=run(C.empty('t'),'pass.save',{name:'1회권',amount:30000,totalUnits:100});
 state={...run(state,'pass.save',{name:'10회권',amount:300000,totalUnits:1000})};
 state.passes[1].createdAt='2026-11-04T10:00:00Z';
 const first=state.passes[0].id,second=state.passes[1].id;
 assert.equal(P.defaultPass(state,C.totals(state)),first);
 state=run(state,'deduction.save',{passId:first,date:'2026-11-01',status:'completed',units:100});
 assert.equal(P.defaultPass(state,C.totals(state)),second);
});
