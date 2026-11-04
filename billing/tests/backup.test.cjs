const test=require('node:test'),assert=require('node:assert/strict'),C=require('../core.js'),B=require('../backup.js');
let seq=0;const ctx={uid:()=>String(++seq),now:'2026-11-04T09:00:00Z'};
function fixture(){let state=C.reduce(C.empty('device'),{type:'pass.save',payload:{name:'기본권',totalUnits:1000,amount:300000}},ctx);state=C.reduce(state,{type:'deduction.save',payload:{passId:state.passes[0].id,date:'2026-11-04',status:'completed',lessonId:'lesson'}},ctx);return state}
test('Existing plain JSON backups retain complete ledger and audit history',()=>{const state=fixture();assert.deepEqual(B.parse(JSON.stringify(state)),state);assert.equal(B.summary(state).remainingUnits,900)});
test('Malformed, unsupported and oversized backups are rejected',()=>{
 assert.throws(()=>B.parse('{bad'));const state=fixture();state.schemaVersion=2;assert.throws(()=>B.validate(state));assert.throws(()=>B.parse(' '.repeat(B.LIMIT+1)));
});
test('Money and session counts cannot be strings, negative uses, or noninteger',()=>{
 for(const value of ['300000',0.5,Number.MAX_SAFE_INTEGER+1]){const state=fixture();state.passes[0].amount=value;assert.throws(()=>B.validate(state))}
 const state=fixture();state.deductions[0].units=-100;assert.throws(()=>B.validate(state));
});
test('Broken references and cancelled-pass active records cannot be restored',()=>{
 const state=fixture();state.deductions[0].passId='missing';assert.throws(()=>B.validate(state));const cancelled=fixture();cancelled.passes[0].voidedAt=ctx.now;assert.throws(()=>B.validate(cancelled));
});
test('Duplicate IDs and double lesson deductions are rejected',()=>{
 const duplicate=fixture();duplicate.passes.push({...duplicate.passes[0]});assert.throws(()=>B.validate(duplicate));
 const repeated=fixture();repeated.deductions.push({...repeated.deductions[0],id:'distinct'});assert.throws(()=>B.validate(repeated));
});
test('Status, dates, imports and audit references are checked',()=>{
 const date=fixture();date.deductions[0].date='2026-02-30';assert.throws(()=>B.validate(date));
 const status=fixture();status.deductions[0].status='free';assert.throws(()=>B.validate(status));
 const imported=fixture();imported.importRows.push({id:'row',batchId:'missing',status:'imported'});assert.throws(()=>B.validate(imported));
 const audit=fixture();audit.history[0].at='bad';assert.throws(()=>B.validate(audit));
});
test('Equivalent cloud content ignores only local revision, never account or money',()=>{
 const state=fixture();assert.equal(B.same(state,{...state,revision:99}),true);assert.equal(B.same(state,{...state,owner:'another'}),false);
 const changed=structuredClone(state);changed.passes[0].amount++;assert.equal(B.same(state,changed),false);
});
test('Acknowledged overdraw and safely undone imports remain valid backups',()=>{
 let state=fixture();state=C.reduce(state,{type:'deduction.save',payload:{passId:state.passes[0].id,date:'2026-11-04',status:'completed',units:2000},options:{allowOverdraw:true}},ctx);assert.equal(B.summary(B.validate(state)).remainingUnits,-1100);
 let imported=C.reduce(C.empty('device'),{type:'import.commit',payload:{batchId:'batch',kind:'payment',rows:[{sourceRow:2,newPass:{name:'new',totalUnits:100,amount:1000},data:{date:'2026-11-04',amount:1000,kind:'payment'}}]}},ctx);
 imported=C.reduce(imported,{type:'import.undo',payload:{id:'batch'}},ctx);assert.deepEqual(B.validate(imported),imported);
});

test('Postgres JSONB key ordering does not cause false conflicts or duplicate uploads',()=>{
 const state=fixture();function reversed(value){if(Array.isArray(value))return value.map(reversed);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).reverse().map(key=>[key,reversed(value[key])]));return value}
 assert.equal(B.same(state,reversed(state)),true);
});
