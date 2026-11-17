const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../app/mr-cancel.js'),Y=require('./helpers/mr-synth.cjs');

test('full-take onset search recovers a consistent position hidden by isolated repeated passages',()=>{
 const source=Y.mr(60),voice=Y.vocal(45).x,rec=Y.record(voice,source,{offset:5,db:6,noise:0});
 const mr=new Float32Array(885*Y.SR);mr.set(source);
 // Isolated 15 s passages match each old probe exactly, but never form the whole take.
 for(let part=0;part<3;part++)for(let copy=0;copy<6;copy++)
  mr.set(rec.x.subarray(part*15*Y.SR,(part+1)*15*Y.SR),(60+(part*6+copy)*45)*Y.SR);
 assert.equal(C.coarse(rec.x,mr).candidates.some(c=>Math.abs(c.lag/Y.SR-5)<.1),false);
 const progress=[],out=C.coarse(rec.x,mr,{dense:true,onProgress:p=>progress.push(p)});
 assert.ok(Math.abs(out.candidates[0].lag/Y.SR-5)<.1,JSON.stringify(out.candidates));
 assert.ok(out.candidates[0].votes>=3);assert.ok(out.candidates.length<=C.RULES.candidates);
 assert.equal(progress.at(-1),1);assert.ok(progress.length<=C.RULES.onsetGridWindows+3);
 assert.ok(progress.every((p,i)=>p>=0&&p<=1&&(!i||p>=progress[i-1])));
});

test('long-take rescue keeps the onset grid bounded and rejects silence',()=>{
 const progress=[],out=C.coarse(new Float32Array(600*Y.SR),Y.mr(20),{dense:true,onProgress:p=>progress.push(p)});
 assert.equal(out.ok,false);assert.deepEqual(out.candidates,[]);
 assert.ok(progress.length<=C.RULES.onsetGridWindows+3);assert.equal(progress.at(-1),1);
});
