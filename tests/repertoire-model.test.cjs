const test=require('node:test'),assert=require('node:assert/strict');
const A=require('../app/repertoire-model.js'),Merge=require('../data-merge.js');
const base=()=>({categories:[],songs:[{id:'s1',title:'원곡',lyrics:'기존 가사'}],lessons:[{id:'l1',feedback:'유지'}],practices:[{id:'p1',minutes:30}],assignments:[],comparisonReports:[],performances:[]});
test('repertoire validates self ratings without replacing existing song fields',()=>{
 const d=base();d.songs[0].repertoire=A.repertoire({status:'ready',skills:{lyrics:5,overall:4},originalKey:'Db'}, {}, 'a');
 assert.equal(d.songs[0].id,'s1');assert.equal(d.songs[0].lyrics,'기존 가사');assert.equal(A.proficiency(d.songs[0]),4.5);
 assert.throws(()=>A.repertoire({skills:{overall:6}}, {},'a'));assert.throws(()=>A.repertoire({status:'bad'}, {},'a'));
});
test('performance validation preserves sessions links and assets through edit',()=>{
 const p=A.performance({id:'show',title:'작품',start:'2026-11-06'}, {},'a');p.sessions.push({id:'session'});
 const next=A.performance({title:'수정',start:'2026-11-06'},p,'a');
 assert.equal(next.sessions[0].id,'session');assert.throws(()=>A.performance({title:'x',start:'2026-02-30'}, {},'a'));assert.throws(()=>A.performance({title:'x',start:'2026-11-06'},p,'b'));
});
test('same production allows distinct sessions but rejects duplicate slot edits',()=>{
 const s=A.session({id:'one',date:'2026-11-06',time:'14:00',number:'1',appeared:true});
 const second=A.session({id:'two',date:s.date,time:'19:00',number:'2'},[s]);assert.equal(second.appeared,false);
 assert.throws(()=>A.session({...s,id:'three'},[s]));assert.equal(A.session({...s,memo:'edit'},[s]).memo,'edit');
});
test('deleting song preserves performance history snapshot and all lesson/practice data',()=>{
 const d=base();d.performances=[{id:'p',songLinks:[{id:'link',songId:'s1',title:'원곡',show:'작품'}]}];d.songs=[];
 A.reconcile(d);assert.equal(d.performances[0].songLinks[0].songId,'');assert.equal(d.performances[0].songLinks[0].title,'원곡');assert.equal(d.lessons[0].feedback,'유지');assert.equal(d.practices[0].minutes,30);
});
test('confirmed media deletion clears representative reference without deleting song or reports',()=>{
 const d=base();d.songs[0].repertoire={takeId:'m1',originalKey:'C'};Merge.deleteMedia(d,'m1');
 assert.equal(d.songs[0].repertoire.takeId,'');assert.equal(d.songs[0].repertoire.originalKey,'C');assert.equal(d.songs.length,1);
});
test('performance rows merge by ID and tombstones prevent resurrection on another device',()=>{
 const a=base(),b=base();a.performances=[{id:'a',title:'A',updatedAt:1,songLinks:[]}];b.performances=[{id:'b',title:'B',updatedAt:2,songLinks:[]}];
 const merged=Merge.merge(a,b).data;assert.equal(merged.performances.length,2);
 const deleted={...a,performances:[],deleted:{performances:['a'],songs:['s1']}};
 b.performances.push({id:'a',title:'old',songLinks:[{songId:'s1',title:'원곡'}]});assert.equal(Merge.merge(deleted,b).data.performances.some(p=>p.id==='a'),false);
});
test('same song may be linked to several shows; deletion unlinks both after remote merge',()=>{
 const a=base(),b=base();b.performances=[{id:'a',songLinks:[{songId:'s1',title:'원곡'}]},{id:'b',songLinks:[{songId:'s1',title:'원곡'}]}];
 a.songs=[];a.deleted={songs:['s1']};const result=Merge.merge(a,b).data;assert.ok(result.performances.every(p=>p.songLinks[0].songId===''));assert.equal(result.performances.length,2);
});
test('cloud projection never includes another account repertoire or archive',()=>{
 const d=base();d.songs[0].repertoire={ownerId:'a',memo:'private'};d.performances=[{id:'a',ownerId:'a'},{id:'b',ownerId:'b'}];
 const out=A.forOwner(d,'b');assert.deepEqual(out.performances,[{id:'b',ownerId:'b'}]);assert.equal(out.songs[0].repertoire,undefined);assert.equal(d.songs[0].repertoire.memo,'private');assert.equal(out.songs[0].lyrics,'기존 가사');
});
test('statistics count only appeared unique sessions and exclude cancelled shows',()=>{
 const p={id:'a',status:'completed',role:'배역',songLinks:[{songId:'s1'}],sessions:[{id:'s',date:'2026-11-06',appeared:true},{id:'s',date:'2026-11-06',appeared:true},{id:'t',date:'2026-11-07',appeared:false}]};
 assert.deepEqual(A.stats([p,{...p,id:'b',status:'cancelled'}]),{productions:1,sessions:1,roles:1,songs:1,years:{2026:1}});
});
