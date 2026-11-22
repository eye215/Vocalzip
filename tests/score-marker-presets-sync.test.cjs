/* 악보 표기 presets follow the account (app/score-ink-settings.js): rows of the synced scoreAnnotations list, merged by
 * data-merge.js like any other row. Each "device" here has its own localStorage and its own copy of the app record;
 * change() stamps rows the way app/core.js does (updatedAt on a changed row, a tombstone for a removed one). */
const {test}=require('node:test'),assert=require('node:assert/strict');
const Settings=require('../app/score-ink-settings.js'),Ink=require('../app/score-ink-model.js'),{merge}=require('../data-merge.js');
const {create,MARKERS,MARK_USER_MAX,ROW_PREFIX}=Settings;
let clock=1e12;
const base=()=>({categories:[],songs:[],lessons:[],assignments:[],practices:[],scoreAnnotations:[]});
function stamp(before,after){
 const now=++clock,old=new Map(before.map(r=>[r.id,JSON.stringify(r)])),ids=new Set();
 for(const r of after.scoreAnnotations){ids.add(r.id);if(old.get(r.id)!==JSON.stringify(r))r.updatedAt=now;}
 const removed=[...old.keys()].filter(id=>!ids.has(id));
 if(removed.length){after.deleted||={};after.deleted.scoreAnnotations=[...new Set([...(after.deleted.scoreAnnotations||[]),...removed])];}
}
function device(session,record=base()){
 const memory=new Map(),d={db:record,saves:0,fail:false};
 const storage={getItem:k=>memory.has(k)?memory.get(k):null,setItem:(k,v)=>memory.set(k,v)};
 const change=fn=>{if(d.fail)return false;const next=JSON.parse(JSON.stringify(d.db)),before=next.scoreAnnotations.map(r=>({...r}));fn(next);stamp(before,next);d.db=next;d.saves++;return true;};
 d.memory=memory;d.options={storage,identity:()=>({owner:'alice',session}),getData:()=>d.db,change};
 d.api=()=>create(d.options);d.local=()=>create({storage,identity:()=>({owner:'alice',session})}); // an older version: device entry only
 d.entry=()=>JSON.parse(memory.get('vzip_score_ink_settings_v1:alice')||'null');
 return d;
}
/** Device ↔ cloud the way cloud-sync.js does it: the device record merged with the other one. */
const pull=(to,from)=>{to.db=merge(to.db,from.db).data;};
const mine=(id,extra={})=>({id,name:'강세',color:'#B42318',width:.005,type:'pen',form:'symbol',shape:'star',...extra});
const names=d=>d.api().read().markers.map(m=>m.name);
const rows=d=>d.db.scoreAnnotations.filter(r=>r.kind==='marker-preset');

test('a preset made on one device reaches the other after a sync; it is a row older clients skip',()=>{
 const a=device('ipad'),b=device('iphone');
 a.api().write('marker',mine('m-1'));
 assert.deepEqual(names(b),['숨표','반복','컷','시작점']);
 pull(b,a);assert.deepEqual(names(b),['숨표','반복','컷','시작점','강세']);
 const [row]=rows(b);
 assert.deepEqual({...row,updatedAt:0,createdAt:0},{id:'marker-preset:m-1',kind:'marker-preset',ownerId:'alice',preset:'m-1',createdAt:0,updatedAt:0,
  look:{name:'강세',color:'#b42318',width:.005,type:'pen',form:'symbol',shape:'star'}});
 assert.equal(Ink.valid(row),false); // never drawn, listed, erased or exported as a stroke
 // The device entry keeps a copy older versions read.
 assert.deepEqual(a.local().read().markers.map(m=>m.name),['숨표','반복','컷','시작점','강세']);
 // Another account sees none of it.
 assert.deepEqual(create({...b.options,identity:()=>({owner:'bob',session:'x'})}).read().markers.length,4);
});

test('edits and deletions propagate; a deletion stays deleted and placed marks are not touched',()=>{
 const a=device('ipad'),b=device('iphone');
 a.api().write('marker',mine('m-1'));a.api().write('marker',mine('m-2',{name:'쉼'}));pull(b,a);
 const mark={version:1,id:'s1',ownerId:'alice',songId:'song',scoreId:'score',r2Key:'u/alice/score/a.pdf',pdfHash:'a'.repeat(64),page:1,tool:'pen',color:'#b42318',width:.005,points:[[.5,.5,.5]],createdAt:1,mark:'m-1'};
 b.db.scoreAnnotations.push(mark);
 b.api().write('marker',{id:'m-1',name:'강세 2',color:'#067647'});pull(a,b);
 assert.deepEqual(a.api().read().markers.slice(4).map(m=>[m.name,m.color]),[['강세 2','#067647'],['쉼','#b42318']]);
 // The newer edit wins whichever record is merged first.
 a.api().write('marker',{id:'m-1',name:'강세 3'});
 assert.equal(merge(b.db,a.db).data.scoreAnnotations.find(r=>r.id==='marker-preset:m-1').look.name,'강세 3');
 pull(b,a);assert.equal(b.api().read().markers[4].name,'강세 3');
 // Deleted on the iPhone: gone on the iPad after a sync, even though the iPad still has it.
 b.api().write('marker',{id:'m-1'},{remove:true});pull(a,b);pull(b,a);
 assert.deepEqual(names(a),['숨표','반복','컷','시작점','쉼']);assert.deepEqual(names(b),names(a));
 assert.ok(a.db.deleted.scoreAnnotations.includes('marker-preset:m-1'));
 assert.deepEqual(a.db.scoreAnnotations.filter(r=>r.mark==='m-1').map(r=>r.id),['s1']);
 // A sheet left open on the deleted preset cannot bring it back.
 assert.throws(()=>a.api().write('marker',mine('m-1')),/지운 표기/);
});

test('a built-in change and 기본값으로 되돌리기 both sync; the built-in row is kept so it can change again',()=>{
 const a=device('ipad'),b=device('iphone');
 a.api().write('marker',{id:'breath',color:'#B42318',shape:'comma'});pull(b,a);
 let breath=b.api().read().markers[0];assert.deepEqual([breath.color,breath.shape,breath.changed],['#b42318','comma',true]);
 a.api().write('marker',{id:'breath'},{reset:true});pull(b,a);
 breath=b.api().read().markers[0];assert.deepEqual([breath.color,breath.shape,breath.changed],['#7a32f5','v',false]);
 assert.equal(rows(b).find(r=>r.preset==='breath').look,null);assert.equal(b.db.deleted?.scoreAnnotations,undefined);
 b.api().write('marker',{id:'breath',color:'#067647'});pull(a,b);assert.equal(a.api().read().markers[0].color,'#067647');
 // 컷 turned to 따라 긋기 keeps "off" across devices.
 a.api().write('marker',{id:'cut',pick:''});pull(b,a);assert.equal(b.api().read().markers[2].pick,undefined);
});

test('migration copies the presets kept on a device once, and never over a newer synced one',()=>{
 const a=device('ipad'),b=device('iphone');
 // Both devices had presets from an older version (device entry only, no times).
 a.local().write('marker',mine('m-a',{name:'아이패드'}));a.local().write('marker',{id:'start',color:'#B42318'});
 b.local().write('marker',mine('m-b',{name:'아이폰'}));b.local().write('marker',{id:'start',color:'#067647'});b.local().write('marker',{id:'repeat',form:'box'});
 for(const d of [a,b]){const e=d.entry();delete e.markersAt;d.memory.set('vzip_score_ink_settings_v1:alice',JSON.stringify(e));}
 const entryB=b.memory.get('vzip_score_ink_settings_v1:alice');
 // Before migrate() runs, the presets still show.
 assert.deepEqual(names(a),['숨표','반복','컷','시작점','아이패드']);
 assert.equal(a.api().migrate(),true);assert.equal(a.saves,1);assert.equal(a.api().migrate(),true);assert.equal(a.saves,1);
 pull(b,a);
 assert.equal(b.api().migrate(),true);
 const list=b.api().read().markers;
 assert.deepEqual(list.map(m=>m.name),['숨표','반복','컷','시작점','아이패드','아이폰']);
 assert.equal(list.find(m=>m.id==='start').color,'#b42318'); // the synced 시작점 (iPad) stays: the iPhone's copy has no time
 assert.equal(list.find(m=>m.id==='repeat').form,'box'); // nothing synced for 반복: copied
 assert.equal(b.memory.get('vzip_score_ink_settings_v1:alice'),entryB); // the device entry is left as it was
 // Once: a preset added later by an older version on this device is not copied again.
 b.local().write('marker',mine('m-late',{name:'나중'}));b.api().migrate();assert.equal(names(b).includes('나중'),false);
});

test('migration: a newer device copy wins, a preset deleted elsewhere stays deleted, the limit holds, a failed save retries',()=>{
 const a=device('ipad'),b=device('iphone');
 a.api().write('marker',mine('m-1',{name:'원래'}));a.api().write('marker',mine('m-2',{name:'지움'}));a.api().write('marker',{id:'m-2'},{remove:true});
 const syncedAt=rows(a).find(r=>r.preset==='m-1').updatedAt;
 b.memory.set('vzip_score_ink_settings_v1:alice',JSON.stringify({version:1,owner:'alice',markersAt:syncedAt+5,
  markers:{builtin:{},user:[{...mine('m-1'),name:'더 새것'},{...mine('m-2'),name:'지움'}]}}));
 b.db=JSON.parse(JSON.stringify(a.db));
 b.fail=true;assert.equal(b.api().migrate(),false);assert.equal(b.memory.has(b.api().movedKey),false);
 b.fail=false;assert.equal(b.api().migrate(),true);
 assert.deepEqual(names(b).slice(4),['더 새것']);assert.ok(rows(b).find(r=>r.preset==='m-1').updatedAt>syncedAt);
 // At most MARK_USER_MAX user presets after a copy.
 const c=device('mac');for(let n=0;n<MARK_USER_MAX;n++)c.api().write('marker',mine('m-c'+n));
 const d=device('old');d.local().write('marker',mine('m-d',{name:'넘침'}));d.db=JSON.parse(JSON.stringify(c.db));d.api().migrate();
 assert.equal(rows(d).filter(r=>!MARKERS.some(m=>m.id===r.preset)).length,MARK_USER_MAX);assert.equal(names(d).includes('넘침'),false);
});

test('pen, highlighter, eraser and pen-only settings stay on the device',()=>{
 const a=device('ipad'),b=device('iphone');
 a.api().write('pen',{color:'#123456',width:.012},{custom:true,recent:true});a.api().write('input',{penOnly:true});a.api().write('eraser',{size:.03});
 assert.equal(a.saves,0);assert.deepEqual(a.db,base());
 pull(b,a);const there=b.api().read();
 assert.deepEqual([there.pen.color,there.pen.custom,there.penOnly,there.eraser.size],['#101828',[],false,.018]);
 // A marker write keeps the device settings, and a tool write keeps the synced presets.
 a.api().write('marker',mine('m-1'));assert.equal(a.api().read().pen.color,'#123456');
 a.api().write('pen',{color:'#abcdef'});assert.equal(a.api().read().markers[4].id,'m-1');assert.equal(rows(a).length,1);
});

test('ten presets with drawings stay small in the synced record',()=>{
 const a=device('ipad'),art=[];
 // The most a drawing keeps (12 strokes, 400 points, every coordinate three digits) and a hand-drawn accent of 3 strokes.
 const most={a:1,s:Array.from({length:12},(_,k)=>Array.from({length:k<4?68:66},(_,i)=>100+(i*389+k*97)%900))};
 const wiggle=(n,phase)=>Array.from({length:n},(_,i)=>[i/(n-1)*100,50+40*Math.sin(i/3+phase)+((i*37)%11)]);
 const usual=Ink.artFrom([wiggle(60,0),wiggle(40,2),[[10,10],[90,90]]]);
 assert.ok(Ink.validArt(most));assert.equal(most.s.reduce((n,l)=>n+l.length/2,0),400);
 for(let n=0;n<10;n++)a.api().write('marker',mine('m-'+n,{name:'그림 '+n,form:'draw',art:n<2?most:usual,size:'m'}));
 const size=r=>Buffer.byteLength(JSON.stringify(r)),bytes=size(rows(a)),one=size(rows(a)[0]),typical=size(rows(a)[5]);
 console.log('synced presets: 10 drawings (2 at the limit, 8 usual)',bytes,'bytes; at the limit',one,'bytes; usual',typical,'bytes');
 assert.ok(one<4000,'largest '+one);assert.ok(typical<1500,'usual '+typical);assert.ok(bytes<20000,'all '+bytes);
 assert.ok(rows(a)[0].look.art.s.flat().every(Number.isInteger)); // whole numbers on a 0–1000 grid
});

test('투명도 travels with the preset row; a field this version does not know does not lose the preset',()=>{
 const a=device('ipad'),b=device('iphone');
 a.api().write('marker',mine('m-1',{type:'highlighter',form:'cover',opacity:.3}));a.api().write('marker',{id:'cut',opacity:.8});pull(b,a);
 assert.equal(rows(b).find(r=>r.preset==='m-1').look.opacity,.3);assert.deepEqual(rows(b).find(r=>r.preset==='cut').look.opacity,.8);
 const list=b.api().read().markers;assert.equal(list.find(m=>m.id==='m-1').opacity,.3);assert.deepEqual([list[2].opacity,list[2].changed],[.8,true]);
 // The device copy (what older versions read) has it too.
 assert.equal(a.local().read().markers.find(m=>m.id==='m-1').opacity,.3);
 b.api().write('marker',{id:'cut'},{reset:true});pull(a,b);assert.deepEqual([a.api().read().markers[2].opacity,a.api().read().markers[2].changed],[undefined,false]);
 // A row from a newer version, with a field unknown here: the preset still reads, without that field.
 const row=a.db.scoreAnnotations.find(r=>r.preset==='m-1');row.look={...row.look,glow:2};
 assert.deepEqual(a.api().read().markers.find(m=>m.id==='m-1'),{name:'강세',color:'#b42318',width:.005,type:'highlighter',form:'cover',opacity:.3,id:'m-1',builtin:false});
});

test('크기 travels with the preset row, for a user 기호 and a built-in one',()=>{
 const a=device('ipad'),b=device('iphone');
 a.api().write('marker',mine('m-1',{size:2}));a.api().write('marker',{id:'breath',size:.5});pull(b,a);
 assert.equal(rows(b).find(r=>r.preset==='m-1').look.size,2);assert.equal(rows(b).find(r=>r.preset==='breath').look.size,.5);
 const list=b.api().read().markers;assert.equal(list.find(m=>m.id==='m-1').size,2);assert.deepEqual([list[0].size,list[0].changed],[.5,true]);
 assert.equal(a.local().read().markers.find(m=>m.id==='m-1').size,2);
});

test('부르면서 체크에 넣기: off at first, set per preset (built-in ones too), kept beside the look and through older versions',()=>{
 const a=device('ipad'),b=device('iphone');
 assert.deepEqual(a.api().read().markers.map(m=>!!m.check),[false,false,false,false]);
 // A built-in preset as at first: its row has no look, only the option.
 a.api().write('marker',{id:'breath',check:true});
 const row=rows(a).find(r=>r.preset==='breath');
 assert.equal(row.look,null);assert.equal(row.check,true);assert.equal(Ink.valid(row),false);
 assert.deepEqual(a.api().read().markers.map(m=>!!m.check),[true,false,false,false]);
 assert.equal(a.api().read().markers[0].changed,false); // not a change of its look
 // A user preset with it; a later edit that does not say keeps it; saying false turns it off (the field goes).
 a.api().write('marker',mine('m-1',{check:true}));a.api().write('marker',{id:'m-1',name:'강세 2'});
 assert.equal(a.api().read().markers[4].check,true);
 assert.equal('check' in rows(a).find(r=>r.preset==='m-1').look,false);
 pull(b,a);assert.deepEqual(b.api().read().markers.map(m=>!!m.check),[true,false,false,false,true]);
 b.api().write('marker',{id:'m-1',check:false});pull(a,b);
 assert.equal('check' in rows(a).find(r=>r.preset==='m-1'),false);assert.equal(a.api().read().markers[4].check,undefined);
 // 기본값으로 되돌리기 puts the look back and leaves the option.
 a.api().write('marker',{id:'breath',color:'#067647'});a.api().write('marker',{id:'breath'},{reset:true});
 assert.equal(a.api().read().markers[0].check,true);assert.equal(rows(a).find(r=>r.preset==='breath').look,null);
 // An older version writes the row by spreading the old one: the option survives its save.
 const old=rows(a).find(r=>r.preset==='breath');
 a.db.scoreAnnotations=a.db.scoreAnnotations.map(r=>r===old?{...old,look:{name:'숨표',color:'#b42318',width:.006,type:'pen',form:'symbol',shape:'v'}}:r);
 assert.equal(a.api().read().markers[0].check,true);assert.equal(a.api().read().markers[0].color,'#b42318');
 // The device entry (what older versions and the unsynced settings read) lists the presets with it.
 assert.deepEqual(a.entry().markers.check,['breath']);
 assert.equal(a.local().read().markers[0].check,true);
});

test('부르면서 체크에 넣기 on a device before sync is copied up with the presets',()=>{
 const a=device('ipad');
 a.local().write('marker',{id:'cut',check:true});a.local().write('marker',mine('m-1',{check:true}));
 assert.deepEqual(a.local().read().markers.filter(m=>m.check).map(m=>m.id),['cut','m-1']);
 assert.equal(a.api().migrate(),true);
 assert.deepEqual(rows(a).filter(r=>r.check).map(r=>r.preset).sort(),['cut','m-1']);
 assert.equal(rows(a).find(r=>r.preset==='cut').look,null);
 assert.deepEqual(a.api().read().markers.filter(m=>m.check).map(m=>m.id),['cut','m-1']);
});
