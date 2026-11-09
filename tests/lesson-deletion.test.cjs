const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const P=require('../app/lesson-deletion-model.js'),Merge=require('../data-merge.js'),C=require('../billing/core.js');
const lesson=()=>({id:'l',date:'2026-11-09',feedback:'private feedback',recordings:[{id:'m'},{id:'keep'}]});
const empty=()=>({categories:[],songs:[{id:'song'}],lessons:[lesson()],assignments:[{id:'a',lessonId:'l',lessonIds:['l','other'],memo:'keep'}],practices:[{id:'p',minutes:20,mediaIds:['m']} ]});
const charge={id:'d',version:1,lessonId:'l',units:100};
async function fixture({cloud=true,selected=['m'],billing=true}={}){
 const db=empty(),events=[],jobs=[],job=await P.plan({id:'op',owner:'alice',lesson:db.lessons[0],mediaIds:selected,deduction:billing?charge:null,cloud});
 let account='alice',cancelled=false,files=new Set(['m','keep']),persisted=job;
 const ports={owner:()=>account,verify:async j=>{
  const current=db.lessons.find(l=>l.id===j.lesson.id);
  if(current&&await P.fingerprint(current,j.mediaIds)!==j.lessonSignature)throw Error('changed');
 },
 save:async j=>{persisted=structuredClone(j);jobs.push(persisted);},
 cancelCharge:async()=>{if(!cancelled){cancelled=true;events.push('billing');}},
 removeMedia:async(j,id)=>{files.delete(id);Merge.deleteMedia(db,id);events.push('media:'+id);},
 removeCloudLesson:async()=>{events.push('cloud');},
 removeLocalLesson:async()=>{Merge.deleteLesson(db,'l');events.push('lesson');}};
 return {db,events,jobs,job,ports,files,persisted:()=>persisted,account:x=>account=x};
}
test('explicit targets run in order and preserve unselected files, practices and homework',async()=>{
 const x=await fixture();const result=await P.execute(x.job,x.ports);
 assert.deepEqual(x.events,['billing','media:m','cloud','lesson']);assert.equal(result.phase,'complete');
 assert.ok(x.files.has('keep'));assert.equal(x.db.practices[0].minutes,20);
 assert.equal(x.db.assignments[0].memo,'keep');assert.deepEqual(x.db.assignments[0].lessonIds,['other']);
 assert.deepEqual(x.db.practices[0].mediaIds,[]);
});
test('default plan only deletes lesson and does not touch charge or files',async()=>{
 const x=await fixture({cloud:false,selected:[],billing:false});await P.execute(x.job,x.ports);
 assert.deepEqual(x.events,['lesson']);assert.deepEqual([...x.files],['m','keep']);
 assert.deepEqual(x.db.practices[0].mediaIds,['m']);
});
test('failed acknowledgement retries the same billing operation without returning units twice',async()=>{
 const x=await fixture();const save=x.ports.save;let fail=true;
 x.ports.save=async j=>{if(fail&&j.done.billing){fail=false;throw Error('quota');}return save(j);};
 await assert.rejects(P.execute(x.job,x.ports),/quota/);assert.deepEqual(x.events,['billing']);
 await P.execute(x.persisted(),x.ports);assert.equal(x.events.filter(e=>e==='billing').length,1);assert.equal(x.events.at(-1),'lesson');
});
test('a failed second file resumes after reload without repeating the first completed file',async()=>{
 const x=await fixture({selected:['m','keep']});const remove=x.ports.removeMedia;
 x.ports.removeMedia=async(j,id)=>{if(id==='keep')throw Error('offline');await remove(j,id);};
 await assert.rejects(P.execute(x.job,x.ports),/offline/);
 assert.ok(x.db.lessons.length);assert.deepEqual(x.persisted().done.media,['m']);
 x.ports.removeMedia=remove;await P.execute(JSON.parse(JSON.stringify(x.persisted())),x.ports);
 assert.equal(x.events.filter(e=>e==='media:m').length,1);assert.equal(x.db.lessons.length,0);
});
test('quota before the first intent write performs no irreversible actions',async()=>{
 const x=await fixture();x.ports.save=async()=>{throw Error('quota');};
 await assert.rejects(P.execute(x.job,x.ports),/quota/);assert.deepEqual(x.events,[]);
});
test('account change stops the plan before actions, including between awaited steps',async()=>{
 const x=await fixture();x.account('bob');await assert.rejects(P.execute(x.job,x.ports),/계정/);assert.deepEqual(x.events,[]);
 const y=await fixture();y.ports.cancelCharge=async()=>{y.events.push('billing');y.account('bob');};
 await assert.rejects(P.execute(y.job,y.ports),/계정/);assert.deepEqual(y.events,['billing']);assert.ok(y.db.lessons.length);
});
test('changed lesson content is rejected but selected file unlink and timestamps are allowed',async()=>{
 const x=await fixture(),before=await P.fingerprint(lesson(),['m']);
 Merge.deleteMedia(x.db,'m');x.db.lessons[0].updatedAt=999;
 assert.equal(await P.fingerprint(x.db.lessons[0],['m']),before);
 x.db.lessons[0].feedback='new feedback';
 await assert.rejects(P.execute(x.job,x.ports),/changed/);assert.deepEqual(x.events,[]);
});
test('persisted plans retain only IDs, date, counters and an irreversible content hash',async()=>{
 const x=await fixture();const raw=JSON.stringify(x.job);
 assert.ok(!raw.includes('private feedback'));assert.match(x.job.lessonSignature,/^[a-f0-9]{64}$/);
 await assert.rejects(P.plan({id:'x',owner:'alice',lesson:lesson(),mediaIds:['unrelated']}),/연결/);
 const bad={...x.job,mediaIds:['unrelated']};assert.throws(()=>P.validate(bad),/삭제 작업/);
});
test('ambiguous ID links fail without guessing a charge from the date',()=>{
 const l=lesson();assert.equal(P.target(l,{deductions:[{id:'other',date:l.date,lessonId:'other'}]}),null);
 assert.throws(()=>P.target({...l,billingDeductionId:'d'},{deductions:[{...charge,lessonId:'other'}]}),/연결/);
 assert.throws(()=>P.target({...l,billingDeductionId:'d'},{deductions:[charge,{...charge,id:'d2'}]}),/연결/);
});
test('over 5000 lesson tombstones survive merge and cannot regain stale homework links',()=>{
 const db=empty();db.deleted={lessons:Array.from({length:6001},(_,i)=>'old-'+i)};
 db.deleted.lessons.push('l');
 const result=Merge.merge(db,empty()).data;
 assert.equal(result.deleted.lessons.length,6002);assert.equal(result.lessons.length,0);
 assert.deepEqual(result.assignments[0].lessonIds,['other']);assert.equal(result.practices[0].minutes,20);
});
function billed(){
 let n=0;const ctx={now:'2026-11-09T12:00:00Z',uid:()=>String(++n)},run=(s,type,payload)=>C.reduce(s,{type,payload},ctx);
 let s=run(C.empty('alice'),'pass.save',{name:'10 lessons',amount:300000,totalUnits:1000});
 s=run(s,'payment.save',{passId:s.passes[0].id,date:'2026-11-09',amount:300000,kind:'payment'});
 s=run(s,'payment.save',{passId:s.passes[0].id,date:'2026-11-09',amount:10000,kind:'refund'});
 s=run(s,'deduction.save',{passId:s.passes[0].id,date:'2026-11-09',units:200,status:'completed',lessonId:'l'});
 return {s,run};
}
test('financial cancellation is ID/version/operation bound and its retry is a no-op',()=>{
 const {s,run}=billed(),row=s.deductions[0],cmd={id:row.id,expectedVersion:row.version,lessonId:'l',operationId:'op'};
 const out=run(s,'deduction.cancelForDeletion',cmd),again=run(out,'deduction.cancelForDeletion',cmd);
 assert.deepEqual(out.payments,s.payments);assert.equal(C.totals(out).total.remainingUnits,1000);
 assert.deepEqual(again,out);assert.equal(out.history.length,s.history.length+1);
 assert.throws(()=>run(out,'entity.restore',{collection:'deductions',id:row.id,expectedVersion:out.deductions[0].version}),/복구/);
 assert.throws(()=>run(s,'deduction.cancelForDeletion',{...cmd,expectedVersion:999}),/수정/);
 assert.throws(()=>run(s,'deduction.cancelForDeletion',{...cmd,lessonId:'other'}),/연결/);
 const guards=C.deletionGuards(out);assert.throws(()=>C.verifyDeletionGuards(s,guards),/과거/);
 assert.doesNotThrow(()=>C.verifyDeletionGuards(C.empty('alice'),guards));
});
function cloud({conflict=false,change=false,foreign=false}={}){
 let payload=empty(),version=1,writes=0,owner={id:'alice'};
 const client={from:()=>{const q={kind:'read'};for(const k of ['select','eq','is','maybeSingle'])q[k]=()=>q;
 q.update=data=>{q.kind='write';q.data=data;return q;};
 q.then=resolve=>{
  if(q.kind==='read'){if(foreign)owner.id='bob';return resolve({data:{payload:structuredClone(payload),updated_at:String(version)}});}
  if(conflict&&writes++===0){if(change)payload.lessons[0].feedback='edited elsewhere';version++;return resolve({data:[]});}
  payload=q.data.payload;return resolve({data:[{user_id:'alice'}]});
 };return q;}};
 const context={client,user:owner,Merge,structuredClone,Error,Date,window:{vzipCloudSignedIn:()=>true,VzipLessonDeletionModel:P},sameVersion:q=>q,nextVersion:()=>String(++version)};
 const source=fs.readFileSync('cloud-sync.js','utf8'),start=source.indexOf('window.vzipCloudLessonDelete='),end=source.indexOf('async function unlinkCloudMedia',start);
 vm.runInNewContext(source.slice(start,end),context);
 return {run:async()=>context.window.vzipCloudLessonDelete({owner:'alice',lesson:{id:'l'},mediaIds:[],lessonSignature:await P.fingerprint(lesson())}),payload:()=>payload};
}
test('cloud lesson CAS preserves unrelated records and retries after a version conflict',async()=>{
 const x=cloud({conflict:true});await x.run();assert.equal(x.payload().lessons.length,0);
 assert.equal(x.payload().practices[0].minutes,20);assert.equal(x.payload().songs[0].id,'song');
 assert.deepEqual(x.payload().assignments[0].lessonIds,['other']);
});
test('changed server lesson or account after a CAS miss stops deletion',async()=>{
 const x=cloud({conflict:true,change:true});await assert.rejects(x.run(),/다른 기기/);assert.equal(x.payload().lessons.length,1);
 const y=cloud({foreign:true});await assert.rejects(y.run(),/계정/);assert.equal(y.payload().lessons.length,1);
});
