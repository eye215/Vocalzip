// Lessons the app created from billing's own attendance records are not asked to be deducted again.
const {test}=require('node:test');const assert=require('node:assert/strict');
const P=require('../pending.js');
const state={deductions:[{id:'d1',lessonId:'',date:'2026-10-01',status:'completed',units:100},{id:'gone',voidedAt:'2026-11-01',date:'2026-10-02',status:'completed',units:100}]};
const lesson=(id,extra={})=>({lesson_id:id,lesson_date:'2026-10-01',lesson_status:'completed',...extra});
test('app lessons made from an active billing record are settled; others still wait',()=>{
 const g=P.classify([lesson('from-billing',{billing_deduction_id:'d1'}),lesson('plain'),lesson('orphan',{billing_deduction_id:'gone'})],state,'2026-11-05');
 assert.deepEqual(g.toDeduct.map(l=>l.lesson_id),['plain','orphan']);
});
