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
/* 스티커 메모: one more record in the same list. */
const memo=(id='memo',extra={})=>({version:1,id,...binding,page:1,tool:'note',color:'#fbe88c',rect:[.1,.1,.235,.18],mode:'pen',createdAt:1,...extra});
test('a memo is a valid record; a bad rect, colour, mode, text or link key is refused and stroke rules are unchanged',()=>{
 assert.equal(Ink.valid(memo()),true);assert.equal(Ink.valid(memo('m',{mode:'text',text:'가'.repeat(Ink.NOTE_TEXT_MAX),note:'m'})),true);
 assert.equal(Ink.valid(stroke('on',{note:'memo'})),true);assert.equal(Ink.valid(stroke()),true);
 for(const bad of [{rect:[.1,.1,.2]},{rect:[.9,.1,.235,.18]},{rect:[.1,.9,.235,.18]},{rect:[-.01,.1,.2,.2]},{rect:[.1,.1,0,.2]},{rect:[.1,.1,.2,NaN]},{rect:'x'},{rect:undefined},
  {color:'yellow'},{color:'#ff'},{mode:'draw'},{mode:undefined},{text:1},{text:'x'.repeat(Ink.NOTE_TEXT_MAX+1)},{note:''},{note:{}},{page:0},{ownerId:'mallory'},{pdfHash:'bad'}])
  assert.equal(Ink.valid(memo('bad',bad)),false,JSON.stringify(bad));
 // A memo needs no width/points; a stroke still does, and a stroke cannot borrow the memo shape.
 for(const bad of [{width:undefined},{points:undefined},{note:''},{tool:'note'},{tool:'marker'}])assert.equal(Ink.valid(stroke('bad',bad)),false,JSON.stringify(bad));
 assert.equal(Ink.same(memo(),memo()),true);for(const change of [{text:'a'},{rect:[.1,.1,.2,.18]},{mode:'text'},{note:'k'},{color:'#fbcfe0'}])assert.equal(Ink.same(memo(),memo('memo',change)),false);
 assert.equal(Ink.same(stroke(),stroke('line',{note:'memo'})),false);assert.equal(Ink.opacity(memo()),1);
});
test('the eraser and the stroke selection never take a memo; a memo is found by its rect and its strokes by its key',()=>{
 const m=memo(),on=stroke('on',{note:'memo',points:[[.15,.15,.5],[.2,.2,.5]]}),off=stroke('off',{points:[[.6,.6,.5],[.7,.7,.5]]});
 assert.equal(Ink.hit(m,[.15,.15]),false);assert.deepEqual(Ink.inRect([m,on,off],{x:0,y:0,w:1,h:1}).map(s=>s.id),['on','off']);
 assert.equal(Ink.noteAt([m,on,off],[.2,.2]).id,'memo');assert.equal(Ink.noteAt([m,on,off],[.6,.6]),undefined);
 assert.equal(Ink.noteAt([m,memo('top',{rect:[.15,.15,.2,.2]})],[.2,.2]).id,'top');
 assert.deepEqual(Ink.linked([m,on,off],m).map(s=>s.id),['on']);
 // A moved copy keeps the key; a memo without `note` is linked by its id (the importer's shape).
 assert.deepEqual(Ink.linked([memo('copy',{note:'memo'}),on],memo('copy',{note:'memo'})).map(s=>s.id),['on']);
 // Two copies with one key (edited on two devices): neither takes the handwriting with it. Other pages are left alone.
 assert.deepEqual(Ink.linked([m,memo('twin',{note:'memo'}),on],m),[]);assert.deepEqual(Ink.linked([m,stroke('p2',{note:'memo',page:2})],m),[]);
});
test('a memo moves with the strokes written on it, stays inside the page and keeps its size; resizing has a smallest size',()=>{
 const m=memo(),on=stroke('on',{note:'memo',points:[[.15,.15,.5],[.2,.2,.5]]}),[a,b]=Ink.transform([m,on],{dx:.2,dy:.3},1.3);
 assert.deepEqual(a.rect,[.3,.4,.235,.18]);assert.deepEqual(b.points,[[.35,.45,.5],[.4,.5,.5]]);assert.equal(b.note,'memo');assert.ok(Ink.valid(a)&&Ink.valid(b));
 const [edge,carried]=Ink.transform([m,on],{dx:5,dy:5},1.3);
 assert.deepEqual(edge.rect,[.765,.82,.235,.18]);assert.ok(Math.abs(carried.points[0][0]-edge.rect[0]-.05)<1e-9);assert.ok(Ink.valid(edge));
 const box=Ink.bounds([m],1.3);assert.deepEqual([box.x,box.y,+box.w.toFixed(9),+box.h.toFixed(9)],[.1,.1,.235,.18]);
 assert.deepEqual(Ink.noteRect(.5,.5,.01,.01,2),[.5,.5,Ink.NOTE_SMALLEST,Ink.NOTE_SMALLEST/2]);
 assert.deepEqual(Ink.noteRect(.95,.95,.235,.18,1.3),[.765,.82,.235,.18]);assert.deepEqual(Ink.noteRect(-1,-1,3,3,1),[0,0,1,1]);
 for(const r of [Ink.noteRect(.5,.5,.01,.01,2),Ink.noteRect(.99999,.99999,.3,.3,1.41),Ink.noteRect(.123456789,.2,.333333333,.4444444,1.3)])assert.ok(Ink.valid(memo('r',{rect:r})),JSON.stringify(r));
});
test('memo text wraps at spaces where it can and anywhere otherwise, and stops at the line limit',()=>{
 const measure=t=>t.length;
 assert.deepEqual(Ink.noteLines('hello world this is\n가나다라마바사',5,measure),['hello','world','this','is','가나다라마','바사']);
 assert.deepEqual(Ink.noteLines('a\n\nb',5,measure),['a','','b']);assert.deepEqual(Ink.noteLines('',5,measure),['']);
 assert.equal(Ink.noteLines('x'.repeat(1000),5,measure,3).length,3);
 const layout=Ink.noteLayout(memo('t',{mode:'text',text:'가나다'}),1000,1300,{measureText:t=>({width:t.length*100})});
 assert.deepEqual([layout.x,layout.y,layout.w,layout.h],[100,130,235,234]);assert.equal(layout.lines.length,1);assert.equal(layout.lines[0].text,'가나다');
 assert.deepEqual(Ink.noteLayout(memo(),1000,1300,null).lines,[]);
});
test('memos are saved, listed, synced, tombstoned and restored like strokes; an edit is a new record',()=>{
 const a=fixture(),b=fixture(),m=memo(),on=stroke('on',{note:'memo',createdAt:2});
 assert.equal(a.store.commit({add:[m,on]}),true);
 assert.deepEqual(a.store.list(binding,1).map(s=>s.id),['memo','on']);assert.deepEqual(a.store.list(binding,1)[0].rect,m.rect);
 assert.deepEqual(JSON.parse([...a.memory.values()][0]).records.map(s=>s.tool),['note','pen']);
 assert.throws(()=>a.store.commit({add:[memo('memo',{text:'changed'})]}),{code:'conflict'}); // never overwritten in place
 assert.throws(()=>a.store.commit({add:[memo('bad',{rect:[.9,.9,.5,.5]})]}),{code:'binding'});
 const edited=memo('memo-2',{note:'memo',mode:'text',text:'숨'});a.store.commit({add:[edited],remove:['memo']});
 b.store.commit({add:[stroke('b')]});
 const merged=Merge.merge(a.data,b.data).data;
 assert.deepEqual(merged.scoreAnnotations.map(s=>s.id).sort(),['b','memo-2','on']);assert.ok(merged.deleted.scoreAnnotations.includes('memo'));
 assert.deepEqual(merged.scoreAnnotations.find(s=>s.id==='memo-2').rect,m.rect);assert.equal(merged.scoreAnnotations.find(s=>s.id==='memo-2').text,'숨');
 b.setData(merged);assert.equal(b.store.restore(),true);
 assert.deepEqual(b.store.list(binding).map(s=>s.id).sort(),['b','memo-2','on']);
 assert.deepEqual(Ink.linked(b.store.list(binding),b.store.list(binding).find(Ink.isNote)).map(s=>s.id),['on']);
 // A reopened device restores the memo from its recovery copy when the shared save had failed.
 const c=fixture();c.hooks.failChange=true;assert.equal(c.store.commit({add:[m]}),false);c.hooks.failChange=false;
 assert.equal(Ink.create(c.options).restore(),true);assert.deepEqual(c.data.scoreAnnotations.map(s=>s.tool),['note']);
});
