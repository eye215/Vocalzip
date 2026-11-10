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
