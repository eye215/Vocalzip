const {test}=require('node:test'),assert=require('node:assert/strict'),M=require('../sync/snapshot-review-model.js');
const base=()=>({categories:[],songs:[],lessons:[],assignments:[],practices:[]});
const copy=x=>structuredClone(x),view=(device,cloud,pending)=>({device,cloud:cloud?{payload:cloud}:null,pending:pending?{payload:pending}:null,recoveries:[]});
function choose(plan,source){return Object.fromEntries(plan.conflicts.map(c=>[c.id,c.options.find(o=>o.sources.includes(source)).id]));}
test('all unique records and disjoint fields survive without selecting a whole snapshot',()=>{
 const a=base(),b=base();a.songs=[{id:'s',title:'Song',repertoire:{status:'ready'}}];b.songs=[{id:'s',title:'Song',show:'Show'}];b.lessons=[{id:'l',memo:'keep'}];
 const p=M.plan(view(a,b)),result=p.candidate({});assert.equal(p.conflicts.length,0);
 assert.equal(result.songs[0].show,'Show');assert.equal(result.songs[0].repertoire.status,'ready');assert.equal(result.lessons[0].memo,'keep');
});
test('same-field content needs an explicit choice even when a timestamp is newer',()=>{
 const a=base(),b=base();a.songs=[{id:'s',title:'phone',updatedAt:500}];b.songs=[{id:'s',title:'cloud',updatedAt:100}];
 const p=M.plan(view(a,b));assert.equal(p.conflicts.length,1);assert.throws(()=>p.candidate({}),e=>e.code==='incomplete');
 const chosen=p.candidate(choose(p,'클라우드'));assert.equal(chosen.songs[0].title,'cloud');assert.equal(chosen.songs[0].updatedAt,500);
 assert.equal(a.songs[0].title,'phone');assert.equal(b.songs[0].title,'cloud');
});
test('pending and historical values remain separately selectable and equal values group their sources',()=>{
 const a=base(),b=base(),c=base();for(const [x,title] of [[a,'same'],[b,'same'],[c,'pending']])x.songs=[{id:'s',title}];
 const r=view(a,b,c);r.recoveries=[{device:{...base(),songs:[{id:'s',title:'older'}]}}];
 const p=M.plan(r),field=p.conflicts[0];assert.equal(field.options.length,3);assert.deepEqual(field.options[0].sources,['이 기기','클라우드']);
 assert.equal(p.candidate(choose(p,'이전 미완료 저장')).songs[0].title,'pending');
});
test('nested ID arrays preserve sessions unique to each source and expose only their differing fields',()=>{
 const a=base(),b=base();a.performances=[{id:'show',title:'Show',sessions:[{id:'one',role:'A'}]}];b.performances=[{id:'show',title:'Show',sessions:[{id:'one',role:'B'},{id:'two',role:'A'}]}];
 const p=M.plan(view(a,b));assert.equal(p.conflicts.length,1);assert.deepEqual(p.candidate(choose(p,'클라우드')).performances[0].sessions,[{id:'one',role:'B'},{id:'two',role:'A'}]);
});
test('empty strings, false and zero are explicit choices rather than missing values',()=>{
 const a={...base(),memo:'',done:false,minutes:0},b={...base(),memo:'note',done:true,minutes:5};
 const p=M.plan(view(a,b)),result=p.candidate(choose(p,'이 기기'));assert.equal(result.memo,'');assert.equal(result.done,false);assert.equal(result.minutes,0);
});
test('tombstones remove deleted records and recording references without a restore option',()=>{
 const a=base(),b=base();a.songs=[{id:'s',title:'gone'}];a.lessons=[{id:'l',recordings:[{id:'m'},{id:'keep'}]}];b.deleted={songs:['s'],media:['m']};
 const p=M.plan(view(a,b)),result=p.candidate({});assert.deepEqual(result.songs,[]);assert.deepEqual(result.lessons[0].recordings,[{id:'keep'}]);
});
test('duplicate source IDs stop comparison and user-like field paths never become executable markup',()=>{
 const a=base(),b=base();a.songs=[{id:'x',title:'one'},{id:'x',title:'two'}];b.songs=[{id:'x',title:'cloud'}];
 assert.throws(()=>M.plan(view(a,b)),e=>e.code==='corrupt');
 const p=M.plan(view({...base(),memo:'<img onerror=evil()>'},{...base(),memo:'safe'}));
 assert.equal(p.conflicts[0].options[0].value,'<img onerror=evil()>');
});
test('foreign archive entries remain only on device and the approved own values replace the old own values',()=>{
 const current={...base(),songs:[{id:'s',title:'old',repertoire:{ownerId:'other',memo:'private'}}],performances:[{id:'foreign',ownerId:'other',memo:'private'}]};
 const approved={...base(),songs:[{id:'s',title:'approved'}],performances:[{id:'own',ownerId:'me'}]};
 const result=M.preserveLocal(current,approved,'me');assert.equal(result.songs[0].title,'approved');assert.equal(result.songs[0].repertoire.memo,'private');assert.equal(result.performances.length,2);
 assert.equal(approved.songs[0].repertoire,undefined);assert.equal(approved.performances.length,1);
});
test('foreign archive ID or repertoire collisions stop instead of destroying the existing device copy',()=>{
 const a={...base(),performances:[{id:'same',ownerId:'other'}]},b={...base(),performances:[{id:'same',ownerId:'me'}]};
 assert.throws(()=>M.preserveLocal(a,b,'me'),e=>e.code==='archiveConflict');
 const c={...base(),songs:[{id:'s',repertoire:{ownerId:'other'}}]};
 assert.throws(()=>M.preserveLocal(c,base(),'me'),e=>e.code==='archiveConflict');
 assert.throws(()=>M.preserveLocal(c,{...base(),songs:[{id:'s',repertoire:{ownerId:'me'}}]},'me'),e=>e.code==='archiveConflict');
});
test('arbitrary property keys and choices cannot change prototype properties or bypass unresolved items',()=>{
 const a=JSON.parse(JSON.stringify({...base(),memo:'a'})),b={...base(),memo:'b'};
 Object.defineProperty(a,'__proto__',{value:{polluted:true},enumerable:true});const p=M.plan(view(a,b));
 assert.throws(()=>p.candidate({'0':'__proto__'}),e=>e.code==='incomplete');
 const result=p.candidate(choose(p,'이 기기'));assert.equal({}.polluted,undefined);assert.equal(Object.hasOwn(result,'__proto__'),true);
});
