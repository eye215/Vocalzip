const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../core.js'),B=require('../backup.js');
let seq=0;const context={uid:()=>String(++seq),now:'2026-11-05T02:00:00Z'};
function run(state,type,payload,options={}){return C.reduce(state,{type,payload,options},context)}
function fixture(){
 let s=run(C.empty('device'),'hourly-rate.save',{hourlyRate:50000});
 s=run(s,'pass.save',{name:'기존 레슨권',totalUnits:1000,amount:300000});const passId=s.passes[0].id;
 s=run(s,'payment.save',{passId,date:'2026-11-04',amount:200000});
 return run(s,'deduction.save',{passId,date:'2026-11-05',status:'completed',units:200});
}
test('Hourly ledger and settings history survive JSON backup round-trip',()=>{
 const state=fixture();assert.deepEqual(B.parse(JSON.stringify(state)),state);assert.equal(state.history[0].collection,'settings');
 const revised=run(state,'hourly-rate.save',{hourlyRate:60000},{ackImpact:true});assert.deepEqual(B.validate(revised),revised);
});
test('Hourly backup preview uses paid hours and owed amount, not contractual pass totals',()=>{
 const state=fixture(),summary=B.summary(state);assert.equal(summary.remainingUnits,200);assert.equal(summary.netPaid,200000);assert.equal(summary.unpaid,0);assert.equal(summary.unit,'시간');
 assert.equal(C.totals(state).total.remainingUnits,800);assert.equal(C.totals(state).total.unpaid,100000);
});
test('Hourly preview includes actual underpayment and refunds',()=>{
 let state=fixture(),passId=state.passes[0].id;state=run(state,'payment.save',{passId,date:'2026-11-05',kind:'refund',amount:150000});
 const summary=B.summary(state);assert.equal(summary.remainingUnits,-100);assert.equal(summary.unpaid,50000);assert.deepEqual(B.validate(state),state);
});
test('Old backups without an hourly rate retain session-based values',()=>{
 const state=run(C.empty('device'),'pass.save',{name:'기존',totalUnits:1000,amount:300000});assert.deepEqual(B.validate(state),state);
 assert.equal(B.summary(state).unit,'회');assert.equal(B.summary(state).remainingUnits,1000);assert.equal(B.summary(state).unpaid,300000);
});
test('Invalid hourly prices are rejected without relaxing unknown-field checks',()=>{
 for(const rate of [0,-1,'50000',1.5,null,1e13]){const state=fixture();state.hourlyRate=rate;assert.throws(()=>B.validate(state),/시간당/)}
 const state=fixture();state.unrecognizedSetting=true;assert.throws(()=>B.validate(state),/알 수 없는/);
});
test('Only well-formed hourly-rate settings audit events are accepted',()=>{
 const mutations=[r=>r.action='unrelated.save',r=>r.entityId='other',r=>r.before=null,r=>r.after.rate=0,r=>r.before.rate='0',r=>r.after.id='other'];
 for(const mutate of mutations){const state=fixture();mutate(state.history[0]);assert.throws(()=>B.validate(state))}
});
test('Settings validation does not weaken lesson or payment integrity',()=>{
 const state=fixture();state.deductions.push({...state.deductions[0],id:'new-id'});assert.throws(()=>B.validate(state),/중복/);
 const payment=fixture();payment.payments[0].passId='missing';assert.throws(()=>B.validate(payment),/레슨권/);
});
