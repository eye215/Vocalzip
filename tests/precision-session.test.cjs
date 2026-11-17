const test=require('node:test'),assert=require('node:assert/strict'),S=require('../app/precision-session-model.js');
test('eight comfortable tasks expand into repeatable vowel/siren/level trials without forced extremes',()=>{
 const s=S.create({id:'fake-session',owner:'fake',targetMidi:57,environment:'same-mic'});assert.equal(new Set(s.tasks.map(t=>t.group)).size,8);assert.equal(s.tasks.length,20);
 assert.deepEqual(s.tasks.filter(t=>t.group==='vowels').map(t=>t.vowel),['a','e','i','o','u']);assert.equal(s.tasks.filter(t=>t.task==='siren-up').length,3);
 assert.ok(s.tasks.every(t=>!t.maxPitch&&!t.minPitch));assert.ok(s.tasks.every(t=>t.targetMidi===57));
});
test('failed task can retry without dropping its earlier audio or successful neighboring tasks',()=>{
 const s=S.create({id:'s',owner:'fake',targetMidi:57});const first=s.tasks[0].id,next=s.tasks[1].id;
 S.capture(s,first,{mediaId:'original',revision:'rev',duration:5});S.result(s,first,{quality:{state:'withheld'}},'failed');
 S.capture(s,next,{mediaId:'neighbor',revision:'r2',duration:5});S.result(s,next,{quality:{state:'high'}},'complete');
 S.capture(s,first,{mediaId:'retry',revision:'r3',duration:5});S.result(s,first,{quality:{state:'high'}},'complete');
 assert.deepEqual(s.tasks[0].attempts.map(a=>a.mediaId),['original','retry']);assert.equal(s.tasks[1].state,'complete');assert.equal(S.progress(s).complete,2);
});
test('analysis failure and restored recording interruption retain captured media references',()=>{
 const s=S.create({id:'s',owner:'fake',targetMidi:57});S.capture(s,s.tasks[0].id,{mediaId:'saved',revision:'r',duration:3});
 s.tasks[0].state='analyzing';const restored=S.restore(JSON.parse(JSON.stringify(s)),'fake');assert.equal(restored.tasks[0].state,'captured');assert.equal(restored.tasks[0].attempts[0].mediaId,'saved');
 assert.equal(S.restore(s,'different-owner'),null);
});
test('session summary contains only measured task results and never adds recording duration to practice time',()=>{
 const s=S.create({id:'s',owner:'fake',targetMidi:57});assert.deepEqual(S.summary(s).results,[]);
 S.capture(s,s.tasks[0].id,{mediaId:'m',revision:'r',duration:5});S.result(s,s.tasks[0].id,{metrics:{f0:{value:220}}},'complete');
 const report=S.summary(s);assert.equal(report.results.length,1);assert.equal(report.practiceMinutes,null);assert.equal(report.results[0].result.metrics.f0.value,220);
});
test('unknown task, missing media and invalid comfortable pitch fail safely',()=>{
 assert.throws(()=>S.create({id:'s',owner:'fake',targetMidi:200}),/pitch/);const s=S.create({id:'s',owner:'fake',targetMidi:57});
 assert.throws(()=>S.capture(s,'missing',{mediaId:'m'}),/task/);assert.throws(()=>S.capture(s,s.tasks[0].id,{}),/media/);
});
