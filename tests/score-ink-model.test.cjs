const {test}=require('node:test'),assert=require('node:assert/strict');
const Ink=require('../app/score-ink-model.js'),Merge=require('../data-merge.js');
const owner='alice',hash='a'.repeat(64),binding={ownerId:owner,songId:'song',scoreId:'score',r2Key:'u/alice/score/original.pdf',pdfHash:hash};
const stroke=(id='line',extra={})=>({version:1,id,...binding,page:1,tool:'pen',color:'#7a32f5',width:0.004,points:[[.1,.1,.5],[.5,.3,.7]],createdAt:1,...extra});
function fixture(){
 let identity={owner,session:'session-a'},data={categories:[],songs:[{id:'song',title:'Song',scores:[{id:'score',r2Key:binding.r2Key}]}],lessons:[{id:'lesson',note:'keep'}],practices:[{id:'practice',minutes:12}],assignments:[]};
 const memory=new Map(),hooks={};
 const storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>{hooks.write?.();memory.set(k,v);}};
 const options={storage,identity:()=>identity,getData:()=>data,change:fn=>{if(hooks.failChange)return false;const next=structuredClone(data);fn(next);for(const s of next.scoreAnnotations||[])s.updatedAt=99;data=next;return true;}};
 return {memory,hooks,options,store:Ink.create(options),get data(){return data},identity:x=>identity=x,setData:x=>data=x};
}
test('normalized points, aspect-aware paths and eraser hit tests remain aligned at different zoom sizes',()=>{
 assert.deepEqual(Ink.point(-1,2,.25),[0,1,.25]);const s=stroke();
 assert.match(Ink.path(s,2),/M100.00 200.00 L500.00 600.00/);assert.equal(Ink.hit(s,[.3,.2],2),true);assert.equal(Ink.hit(s,[.8,.8],2),false);
});
test('stroke validation refuses invalid scope, positions, pages, tools and excessive input',()=>{
 for(const bad of [{ownerId:'bob'},{r2Key:'u/alice/score/../other.pdf'},{page:0},{page:2001},{points:[[2,0,.5]]},{tool:'script'},{width:.5},{points:Array(Ink.MAX_POINTS+1).fill([.2,.2,.5])}]){
  assert.equal(Ink.valid(stroke('line',bad)),false);
 }
 assert.equal(Ink.valid(stroke()),true);
});
test('private strokes save without changing PDF metadata, lesson or practice records and survive a new store',()=>{
 const f=fixture(),before=structuredClone(f.data);
 assert.equal(f.store.commit({add:[stroke()]}),true);
 assert.deepEqual(f.data.songs,before.songs);assert.deepEqual(f.data.lessons,before.lessons);assert.deepEqual(f.data.practices,before.practices);
 assert.equal(Ink.create(f.options).list(binding,1).length,1);assert.equal(f.store.list(binding,2).length,0);
});
test('different PDF hash, score, page and owner never share an overlay',()=>{
 const f=fixture();f.store.commit({add:[stroke()]});
 for(const b of [{...binding,pdfHash:'b'.repeat(64)},{...binding,scoreId:'other'},{...binding,ownerId:'bob'}])assert.deepEqual(f.store.list(b,1),[]);
 assert.deepEqual(f.store.list(binding,2),[]);
});
test('same ID can be replayed after root stamping but cannot overwrite different ink',()=>{
 const f=fixture();f.store.commit({add:[stroke()]});assert.equal(f.store.commit({add:[stroke()]}),true);
 assert.throws(()=>f.store.commit({add:[stroke('line',{color:'#ff0000'})]}),{code:'conflict'});assert.equal(f.data.scoreAnnotations[0].color,'#7a32f5');
});
test('failed root write is recovered from the durable account ledger after reload',()=>{
 const f=fixture();f.hooks.failChange=true;assert.equal(f.store.commit({add:[stroke()]}),false);assert.equal(f.data.scoreAnnotations,undefined);
 f.hooks.failChange=false;const next=Ink.create(f.options);assert.equal(next.restore(),true);assert.equal(f.data.scoreAnnotations[0].id,'line');
});
test('a quota failure leaves the existing root and recovery copy unchanged',()=>{
 const f=fixture();f.store.commit({add:[stroke()]});const raw=[...f.memory.values()][0],before=structuredClone(f.data);
 f.hooks.write=()=>{throw Object.assign(Error('full'),{name:'QuotaExceededError'});};
 assert.throws(()=>f.store.commit({add:[stroke('second')]}),{name:'QuotaExceededError'});
 assert.deepEqual(f.data,before);assert.equal([...f.memory.values()][0],raw);
});
test('two devices merge independent strokes even if song metadata was edited on the other device',()=>{
 const a=fixture(),b=fixture();a.store.commit({add:[stroke('a')]});b.store.commit({add:[stroke('b')]});b.data.songs[0].title='new title';b.data.songs[0].updatedAt=200;
 const merged=Merge.merge(a.data,b.data).data;assert.deepEqual(merged.scoreAnnotations.map(s=>s.id),['a','b']);assert.equal(merged.songs[0].title,'new title');
 assert.deepEqual(merged.lessons,a.data.lessons);assert.deepEqual(merged.practices,a.data.practices);
});
test('erase tombstones prevent resurrection from stale device data or recovery copies',()=>{
 const a=fixture(),b=fixture();a.store.commit({add:[stroke()]});b.store.commit({add:[stroke()]});a.store.commit({remove:['line']});
 const merged=Merge.merge(a.data,b.data).data;assert.deepEqual(merged.scoreAnnotations,[]);
 b.setData(merged);b.store.restore();assert.deepEqual(b.store.list(binding),[]);assert.deepEqual(JSON.parse([...b.memory.values()][0]).records,[]);
 assert.throws(()=>b.store.commit({add:[stroke()]}),{code:'binding'});
});
test('session and account changes stop old store writes; another account cannot read the ledger',()=>{
 const f=fixture();f.store.commit({add:[stroke()]});
 f.identity({owner,session:'session-b'});assert.throws(()=>f.store.list(binding),{code:'identity'});assert.throws(()=>f.store.commit({remove:['line']}),{code:'identity'});
 f.identity({owner:'bob',session:'session-b'});assert.deepEqual(Ink.create(f.options).list({...binding,ownerId:'bob'}),[]);
});
test('invalid or future journals are preserved instead of reset',()=>{
 for(const text of ['not JSON',JSON.stringify({version:2}),JSON.stringify({version:1,owner:'bob',records:[],deleted:[]})]){
  const f=fixture();f.memory.set(f.store.key,text);assert.throws(()=>f.store.restore(),{code:'corrupt'});assert.equal(f.memory.get(f.store.key),text);
 }
});
test('removed scores are not recreated by recovery and cannot receive new strokes',()=>{
 const f=fixture();f.hooks.failChange=true;f.store.commit({add:[stroke()]});f.hooks.failChange=false;f.data.songs[0].scores=[];
 f.store.restore();assert.equal(f.data.scoreAnnotations,undefined);assert.deepEqual(f.data.songs[0].scores,[]);
 assert.throws(()=>f.store.commit({add:[stroke('new')]}),{code:'binding'});
});
test('foreign originals and unsupported root formats fail without writes',()=>{
 const f=fixture();assert.throws(()=>f.store.commit({add:[stroke('other',{ownerId:'bob'})]}),{code:'binding'});
 f.data.scoreAnnotations={};assert.throws(()=>f.store.list(binding),{code:'corrupt'});assert.equal(f.memory.size,0);
});

test('explicit PDF deletion atomically removes its ink and recovery vectors while preserving other records',()=>{
 const f=fixture();f.store.commit({add:[stroke()]});const oldLessons=structuredClone(f.data.lessons),oldPractices=structuredClone(f.data.practices);
 assert.equal(f.store.removeScore(binding),true);assert.deepEqual(f.data.songs[0].scores,[]);assert.deepEqual(f.data.scoreAnnotations,[]);
 assert.deepEqual(JSON.parse([...f.memory.values()][0]).records,[]);assert.ok(f.data.deleted.scoreAnnotations.includes('line'));
 assert.deepEqual(f.data.lessons,oldLessons);assert.deepEqual(f.data.practices,oldPractices);
});

test('opacity remains backward compatible and is included in immutable stroke identity',()=>{
 const f=fixture(),old=stroke('old',{tool:'highlighter'});assert.equal(Ink.opacity(old),.28);assert.equal(Ink.opacity(stroke()),1);
 f.store.commit({add:[old,stroke('new',{opacity:.4})]});assert.equal(Ink.opacity(f.store.list(binding).find(s=>s.id==='new')),.4);
 assert.throws(()=>f.store.commit({add:[stroke('new',{opacity:.8})]}),{code:'conflict'});
 for(const opacity of [0,1.1,-1,NaN,'0.5'])assert.equal(Ink.valid(stroke('bad',{opacity})),false);
 assert.equal(Ink.valid(stroke('good',{opacity:.05})),true);
});

test('rectangle selection uses segment intersection and thickness, not only bounding boxes',()=>{
 const diagonal=stroke('a',{points:[[.1,.1,.3],[.9,.9,.8]]});
 assert.equal(Ink.inRect([diagonal],{x:.45,y:.45,w:.1,h:.1},2).length,1);
 assert.equal(Ink.inRect([diagonal],{x:.1,y:.8,w:.1,h:.1},2).length,0);
 assert.equal(Ink.inRect([diagonal],{x:.55,y:.55,w:-.1,h:-.1},2).length,1);
 assert.equal(Ink.inRect([stroke('dot',{points:[[.2,.2,.5]],width:.04})],{x:.21,y:.2,w:.01,h:.01},2).length,1);
});
test('group transforms preserve pressure, opacity, scope and inputs while translating and scaling uniformly',()=>{
 const rows=[stroke('a',{opacity:.6}),stroke('b',{tool:'highlighter',width:.02,points:[[.2,.4,.2],[.6,.5,.9]]})],before=structuredClone(rows),b=Ink.bounds(rows,2);
 const moved=Ink.transform(rows,{dx:.1,dy:.2},2);
 assert.deepEqual(rows,before);
 rows.forEach((s,i)=>{assert.equal(moved[i].ownerId,s.ownerId);assert.equal(moved[i].r2Key,s.r2Key);assert.equal(moved[i].opacity,s.opacity);assert.equal(moved[i].width,s.width);assert.equal(moved[i].points[0][2],s.points[0][2]);assert.ok(Math.abs(moved[i].points[0][0]-s.points[0][0]-.1)<.00001);});
 const scaled=Ink.transform(rows,{scale:1.5},2),bb=Ink.bounds(scaled,2);
 assert.ok(Math.abs(bb.w/b.w-1.5)<.0001);assert.ok(Math.abs(bb.h/b.h-1.5)<.0001);
 scaled.forEach((s,i)=>assert.ok(Math.abs(s.width/rows[i].width-1.5)<.0001));
});
test('transform bounds prevent leaving the page or invalid thickness, including dots and page edges',()=>{
 for(const rows of [[stroke()], [stroke('dot',{points:[[0,1,.5]]})], [stroke('wide',{width:.06,points:[[.05,.05,.5],[.95,.95,.5]]})]]){
  for(const options of [{dx:100,dy:-100},{scale:.00001},{scale:100}]){
   const result=Ink.transform(rows,options,1.333),b=Ink.bounds(result,1.333);
   assert.ok(result.every(Ink.valid));assert.ok(b.x>=-.00001&&b.y>=-.00001);assert.ok(b.x+b.w<=1.00001&&b.y+b.h<=1.00001);
  }
 }
 assert.throws(()=>Ink.transform([stroke()],{scale:NaN}),{code:'geometry'});
});
test('transformed immutable replacements recover atomically after root failure and keep unrelated records',()=>{
 const f=fixture(),original=stroke(),other=stroke('other',{page:2});f.store.commit({add:[original,other]});
 const replacement={...Ink.transform([original],{dx:.1},2)[0],id:'replacement'};
 f.hooks.failChange=true;assert.equal(f.store.commit({add:[replacement],remove:[original.id]}),false);
 assert.deepEqual(f.store.list(binding,1).map(s=>s.id),['replacement']);
 f.hooks.failChange=false;assert.equal(Ink.create(f.options).restore(),true);
 assert.deepEqual(f.store.list(binding).map(s=>s.id).sort(),['other','replacement']);
 assert.equal(f.data.lessons[0].note,'keep');assert.equal(f.data.practices[0].minutes,12);
});
