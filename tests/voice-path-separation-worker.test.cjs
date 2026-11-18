const {test}=require('node:test'),assert=require('node:assert/strict');
const S=require('../app/voice-path-separation-model.js'),api=()=>import('../worker/voice-path-separation-worker.mjs');
function row(){const metadata={id:'fake-take',storageProvider:'r2',r2Key:'u/fake-owner/fake-take',size:128,analysis:{at:17,metrics:{voicedSeconds:12}},review:'preserve'};metadata[S.FIELD]=S.request(metadata,'fake-request',100);return {id:metadata.id,user_id:'fake-owner',metadata};}
test('claim and completion patch only the optional result field and bind the exact request and source',async()=>{
 const {processRow}=await api(),r=row(),copy=structuredClone(r),calls=[];const db={query:async(sql,args)=>{calls.push({sql,args});return {rowCount:1};}};
 const result={version:'vp-0.2',voicedSeconds:20,confidence:{meanStrength:.95,glitchShare:0,outsideBandShare:0}};
 assert.equal(await processRow(db,r,{read:async()=>Buffer.alloc(128),analyze:async()=>({result,quality:S.quality(result),processingMs:10})}),'done');
 assert.deepEqual(r,copy);assert.equal(calls.length,2);
 for(const c of calls){assert.match(c.sql,/jsonb_set\(metadata, '\{voicePathSeparation\}'/);assert.match(c.sql,/coalesce\(metadata->'voicePathSeparation','null'::jsonb\)=\$3::jsonb/);assert.match(c.sql,/metadata->>'r2Key'=\$4/);assert.ok(!c.sql.includes("'{analysis}'"));assert.deepEqual(c.args.slice(0,2),[r.id,r.user_id]);}
 assert.equal(JSON.parse(calls[1].args[5]).state,'done');
});
test('a lost claim never reads media; a late completion cannot overwrite a newer request',async()=>{
 const {processRow}=await api();let reads=0;assert.equal(await processRow({query:async()=>({rowCount:0})},row(),{read:async()=>{reads++;}}),'changed');assert.equal(reads,0);
 let queries=0;const result={version:'vp-0.2',voicedSeconds:20,confidence:{meanStrength:.95,glitchShare:0,outsideBandShare:0}};
 assert.equal(await processRow({query:async()=>({rowCount:++queries===1?1:0})},row(),{read:async()=>Buffer.alloc(128),analyze:async()=>({result,quality:S.quality(result)})}),'changed');
});
test('failure and wrong-sized source keep the original and prior measurements',async()=>{
 const {processRow}=await api();for(const fail of[false,true]){const r=row(),copy=structuredClone(r),calls=[],db={query:async(sql,args)=>{calls.push(args);return {rowCount:1};}};
 assert.equal(await processRow(db,r,{read:async()=>{if(fail)throw Error('private path');return Buffer.alloc(127);}}),'failed');assert.deepEqual(r,copy);assert.equal(JSON.parse(calls.at(-1)[5]).state,'failed');assert.ok(!JSON.stringify(calls).includes('private path'));}
});
test('unstable isolated readings are withheld and not stored as usable measurements',async()=>{
 const {processRow}=await api(),calls=[],db={query:async(sql,args)=>{calls.push(args);return {rowCount:1};}};
 const result={version:'vp-0.2',voicedSeconds:20,confidence:{meanStrength:.4,glitchShare:0,outsideBandShare:0}};
 assert.equal(await processRow(db,row(),{read:async()=>Buffer.alloc(128),analyze:async()=>({result,quality:S.quality(result)})}),'withheld');assert.equal(JSON.parse(calls.at(-1)[5]).result,undefined);
});
test('the full synthetic isolated signal is measured while timbre, breath and loudness stay withheld',async()=>{
 const {analyze}=await api(),bytes=Buffer.from('fake source'),copy=Buffer.from(bytes);
 const measured=await analyze(bytes,{separator:async()=>Buffer.from('fake separated signal'),decoder:async(_,{rate})=>Float32Array.from({length:rate*12},(_,i)=>.2*Math.sin(2*Math.PI*220*i/rate))});
 assert.equal(measured.result.seconds,12);assert.equal(measured.quality.ok,true);assert.equal(measured.result.resonance,null);assert.equal(measured.result.breath,null);assert.equal(measured.result.onsets,null);assert.equal(measured.result.sustain.loudSdDb,null);assert.deepEqual(bytes,copy);
});
test('a truncated separated signal is rejected instead of reported as a whole recording',async()=>{
 const {analyze}=await api();await assert.rejects(analyze(Buffer.from('fake'),{separator:async()=>Buffer.from('fake separated'),decoder:async(_,{rate})=>new Float32Array(rate*(rate===44100?12:10))}),/duration-changed/);
});
test('selection stays bound to the diagnosed source and interrupted work is settled without an automatic retry',async()=>{
 const {waiting}=await api(),queued=row(),expired=row(),active=row(),calls=[];expired.id='fake-expired';active.id='fake-active';
 expired.metadata[S.FIELD]={...expired.metadata[S.FIELD],state:'running',startedAt:Date.now()-31*60000};active.metadata[S.FIELD]={...active.metadata[S.FIELD],state:'running',startedAt:Date.now()};
 const copy=structuredClone([queued,expired,active]),db={query:async(sql,args)=>{calls.push({sql,args});return sql.startsWith('select')?{rows:[queued,expired,active]}:{rowCount:1};}};
 assert.deepEqual(await waiting(db,{size:128,month:'2025-08'}),[queued]);assert.deepEqual(calls[0].args,[S.VERSION,'128','2025-08']);assert.equal(calls.length,2);assert.equal(calls[1].args[0],'fake-expired');assert.equal(JSON.parse(calls[1].args[5]).state,'failed');assert.deepEqual([queued,expired,active],copy);
});
