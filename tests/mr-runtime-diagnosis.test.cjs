const {test}=require('node:test'),assert=require('node:assert/strict');
const api=()=>import('../worker/mr-runtime-diagnosis.mjs');
function fixture({rows,read}={}){
 const calls=[],records=rows||[{user_id:'fake-owner',metadata:{songId:'fake-song',storageProvider:'r2',r2Key:'fake-recording'}}];
 const db={query:async(sql,args)=>{calls.push({sql,args});if(sql.includes('from public.vocal_media'))return {rows:records};if(sql.includes('from public.vocal_data'))return {rows:[{tracks:[{kind:'file',r2Key:'fake-mr',size:128}]}]};return {rows:[]};}};
 const source=read||(async(meta,owner)=>{assert.equal(calls.at(-1).sql,'ROLLBACK');assert.equal(owner,'fake-owner');return Buffer.alloc(128,meta.r2Key==='fake-mr'?2:1);});
 return {db,calls,read:source};
}
test('runtime diagnosis only selects inside a read-only transaction and never exposes metadata',async()=>{
 const {loadBundle}=await api(),f=fixture(),bundle=await loadBundle(f.db,128,f.read);
 assert.deepEqual(Object.keys(bundle),['recording','references']);assert.equal(bundle.recording.length,128);assert.equal(bundle.references.length,1);
 assert.equal(f.calls[0].sql,'BEGIN READ ONLY');assert.equal(f.calls.at(-1).sql,'ROLLBACK');
 assert.ok(f.calls.every(c=>/^(BEGIN READ ONLY|SET LOCAL|select |ROLLBACK)/.test(c.sql)));assert.deepEqual(f.calls[2].args,['128',null]);
 assert.ok(!JSON.stringify(bundle).includes('fake-owner'));assert.ok(!JSON.stringify(bundle).includes('fake-song'));
});
test('different owners or songs and too many candidates fail before any media read',async()=>{
 const {loadBundle}=await api();
 for(const rows of[[],[{user_id:'a',metadata:{songId:'x'}},{user_id:'b',metadata:{songId:'x'}}],[{user_id:'a',metadata:{songId:'x'}},{user_id:'a',metadata:{songId:'y'}}],Array.from({length:3},()=>({user_id:'a',metadata:{songId:'x'}}))]){
  let reads=0;const f=fixture({rows,read:async()=>{reads++;}});await assert.rejects(loadBundle(f.db,128,f.read),e=>e.code==='selection-ambiguous');assert.equal(reads,0);assert.equal(f.calls.at(-1).sql,'ROLLBACK');
 }
});
test('duplicate entries are accepted only for identical original bytes',async()=>{
 const {loadBundle}=await api(),rows=[1,2].map(n=>({user_id:'fake-owner',metadata:{songId:'fake-song',r2Key:'fake-'+n}}));
 const good=fixture({rows});assert.equal((await loadBundle(good.db,128,good.read)).recording.length,128);
 let reads=0;const bad=fixture({rows,read:async()=>Buffer.alloc(128,++reads)});await assert.rejects(loadBundle(bad.db,128,bad.read),e=>e.code==='selection-content-differs');assert.equal(reads,2);
});
test('the diagnosis month disambiguates same-size recordings with different original bytes',async()=>{
 const {loadBundle}=await api(),rows=['2025-08','2025-09'].map((month,i)=>({user_id:'fake-owner',metadata:{songId:'fake-song',r2Key:'fake-'+i,recordedDate:month+'-01'}}));
 const f=fixture({rows}),query=f.db.query.bind(f.db);f.db.query=async(sql,args)=>sql.includes('from public.vocal_media')&&args?.[1]?{rows:rows.filter(r=>r.metadata.recordedDate.startsWith(args[1]))}:query(sql,args);
 const result=await loadBundle(f.db,128,async meta=>Buffer.alloc(128,meta.r2Key==='fake-0'?2:3),'2025-08');
 assert.equal(result.recording[0],2);
});
test('size and error handling cannot interpolate secrets into SQL or logs',async()=>{
 const {parseSize,parseMonth,safeFailure,DiagnosticError}=await api();
 for(const value of['128; delete from x',0,-1,NaN,Infinity,300*1024*1024])assert.throws(()=>parseSize(value));
 assert.equal(parseSize('128'),128);assert.deepEqual(safeFailure(Error('SECRET')), {status:'failed',code:'operation-failed'});
 assert.equal(parseMonth('2025-08'),'2025-08');for(const value of['2025-13','2025-8','2025-08-01',"2025-08' OR true"])assert.throws(()=>parseMonth(value));
 assert.deepEqual(safeFailure(new DiagnosticError('SECRET')), {status:'failed',code:'operation-failed'});
 assert.deepEqual(safeFailure(new DiagnosticError('source-size-mismatch')), {status:'failed',code:'source-size-mismatch'});
});
