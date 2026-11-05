// Lessons the app created from billing's own attendance records are not asked to be deducted again.
const {test}=require('node:test');const assert=require('node:assert/strict');
const P=require('../pending.js');
const state={deductions:[{id:'d1',lessonId:'',date:'2026-10-01',status:'completed',units:100},{id:'gone',voidedAt:'2026-11-01',date:'2026-10-02',status:'completed',units:100}]};
const lesson=(id,extra={})=>({lesson_id:id,lesson_date:'2026-10-01',lesson_status:'completed',...extra});
test('app lessons made from billing records are never asked again (record kept, deleted or ledger rebuilt); others wait',()=>{
 const g=P.classify([lesson('from-billing',{billing_deduction_id:'d1'}),lesson('plain'),lesson('orphan',{billing_deduction_id:'gone'}),lesson('rebuilt',{billing_deduction_id:'not-in-ledger'})],state,'2026-11-05');
 assert.deepEqual(g.toDeduct.map(l=>l.lesson_id),['plain']);
});

test('auto-deduction takes only lessons completed after it was turned on, with no record on that date; 2 hours = 2회',()=>{
 const since=new Date('2026-11-05T09:00:00').getTime(),later=since+60000;
 const st={deductions:[{id:'x',lessonId:'',date:'2026-11-03',status:'completed',units:100}]};
 const ls=[
  {lesson_id:'two',lesson_date:'2026-11-04',lesson_status:'completed',lesson_start:'19:00',lesson_end:'21:00',lesson_touched:later},
  {lesson_id:'one',lesson_date:'2026-11-05',lesson_status:'completed',lesson_touched:later},
  {lesson_id:'old',lesson_date:'2026-11-04',lesson_status:'completed',lesson_touched:since-1},
  {lesson_id:'sameday',lesson_date:'2026-11-03',lesson_status:'completed',lesson_touched:later},
  {lesson_id:'history',lesson_date:'2026-09-01',lesson_status:'completed',lesson_touched:later},
  {lesson_id:'cancelled',lesson_date:'2026-11-04',lesson_status:'cancelled',lesson_touched:later}];
 assert.deepEqual(P.autoCandidates(ls,st,'2026-11-05',since).map(x=>[x.lesson.lesson_id,x.units]),[['two',200],['one',100]]);
 assert.equal(P.unitsFor({lesson_start:'10:00',lesson_end:'11:30'}),150);
});

test('a lesson whose deduction was deleted in billing waits in 정산 대기 and is not auto-deducted again',()=>{
 const since=new Date('2026-11-05T09:00:00').getTime(),later=since+60000;
 const st={deductions:[{id:'undone',lessonId:'again',date:'2026-11-04',status:'completed',units:100,voidedAt:'2026-11-05T10:00:00Z'}]};
 const ls=[{lesson_id:'again',lesson_date:'2026-11-04',lesson_status:'completed',lesson_touched:later}];
 assert.deepEqual(P.classify(ls,st,'2026-11-05').toDeduct.map(l=>l.lesson_id),['again']);
 assert.deepEqual(P.autoCandidates(ls,st,'2026-11-05',since),[]);
});

test('a lesson the app made from a ledger record that was later deleted is not auto-deducted',()=>{
 const since=new Date('2026-11-05T09:00:00').getTime(),later=since+60000;
 const st={deductions:[{id:'gone',lessonId:'',date:'2026-11-04',status:'completed',units:100,voidedAt:'2026-11-05T10:00:00Z'}]};
 const ls=[{lesson_id:'bill-gone',lesson_date:'2026-11-04',lesson_status:'completed',billing_deduction_id:'gone',lesson_touched:later}];
 assert.deepEqual(P.autoCandidates(ls,st,'2026-11-05',since),[]);
});
