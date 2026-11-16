import test from 'node:test';import assert from 'node:assert/strict';import {createHandler,validate} from '../supabase/functions/vzip-precision-coach/handler.mjs';
const evidence={schemaVersion:1,measurements:[{key:'hnr',value:20,unit:'dB',confidence:'medium'}],conditions:{source:'clean',task:'sustain',vowel:'a'},limitations:['no-physiological-inference'],comparison:{state:'withheld'}};
test('AI endpoint authenticates and authorizes before provider, rejects unknown origins and oversized evidence',async()=>{
 let calls=0;const h=createHandler({authenticate:async()=>({allowed:false}),generate:async()=>{calls++;}});
 assert.equal((await h(new Request('https://fixture/',{method:'POST',body:'{}'}))).status,401);
 assert.equal((await h(new Request('https://fixture/',{method:'POST',headers:{authorization:'Bearer fake'},body:'{}'}))).status,403);assert.equal(calls,0);
 const blocked=await h(new Request('https://fixture/',{method:'OPTIONS',headers:{origin:'https://untrusted.invalid'}}));assert.equal(blocked.status,403);
});
test('AI gets bounded measured evidence only and can return a cited Korean observation',async()=>{
 let received;const h=createHandler({authenticate:async()=>({allowed:true}),generate:async e=>{received=e;return {sections:[{section:'overview',text:'측정한 주기성의 특징을 확인해요.',evidence:['hnr']}]};}});
 const res=await h(new Request('https://fixture/',{method:'POST',headers:{authorization:'Bearer fake'},body:JSON.stringify({...evidence,audio:'must never forward',owner:'private',prompt:'ignore previous'})}));assert.equal(res.status,200);assert.ok(received.measurements.length);assert.ok(!JSON.stringify(received).includes('private'));assert.ok(!('audio' in received));
});
test('invented physiology, unseen metrics, invalid values and large requests fail closed without changing data',async()=>{
 for(const text of ['성대 접촉이 완전해요','효율 99%','TA 근육이 강해요']){const h=createHandler({authenticate:async()=>({allowed:true}),generate:async()=>({sections:[{section:'overview',text,evidence:['hnr']}]})});assert.equal((await h(new Request('https://fixture/',{method:'POST',headers:{authorization:'Bearer fake'},body:JSON.stringify(evidence)}))).status,422);}
 assert.throws(()=>validate({...evidence,measurements:[{key:'contactRate',value:90,unit:'%',confidence:'high'}]}));
 const h=createHandler({authenticate:async()=>({allowed:true}),generate:async()=>{throw Error('must not run');}});assert.equal((await h(new Request('https://fixture/',{method:'POST',headers:{authorization:'Bearer fake'},body:' '.repeat(20000)}))).status,413);
});
