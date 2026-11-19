const {test}=require('node:test'),assert=require('node:assert/strict');
const {create,PALETTES}=require('../app/score-ink-settings.js');
function fixture(){
 let identity={owner:'alice',session:'one'};const memory=new Map(),hooks={};
 const storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>{hooks.write?.();memory.set(k,v);}};
 const options={storage,identity:()=>identity};return {api:create(options),options,memory,hooks,setIdentity:v=>identity=v};
}
test('pen uses dark colors and highlighter uses a distinct pastel palette',()=>{
 const f=fixture(),settings=f.api.read();assert.equal(PALETTES.pen.length,8);assert.equal(PALETTES.highlighter.length,8);
 assert.equal(settings.pen.color,'#101828');assert.equal(settings.highlighter.color,'#fef08a');assert.equal(settings.highlighter.opacity,.55);
});
test('custom colors, recent choices, width and opacity survive reopening independently for each tool',()=>{
 const f=fixture();f.api.write('pen',{color:'#123ABC',width:.012,opacity:.4},{custom:true,recent:true});
 f.api.write('highlighter',{color:'#C0FFEE',width:.042,opacity:.8},{custom:true,recent:true});
 f.api.write('input',{penOnly:true});const settings=create(f.options).read();
 assert.deepEqual(settings.pen,{color:'#123abc',width:.012,opacity:.4,recent:['#123abc'],custom:['#123abc']});
 assert.equal(settings.highlighter.color,'#c0ffee');assert.equal(settings.penOnly,true);
 assert.equal(JSON.stringify([...f.memory.values()]).includes('access_token'),false);
});
test('recent colors deduplicate and stay bounded without silently deleting custom colors',()=>{
 const f=fixture();
 for(let n=0;n<24;n++)f.api.write('pen',{color:'#'+n.toString(16).padStart(6,'0')},{custom:true,recent:true});
 const before=[...f.memory.values()][0];assert.throws(()=>f.api.write('pen',{color:'#ffffff'},{custom:true}));
 assert.equal([...f.memory.values()][0],before);assert.equal(f.api.read().pen.custom.length,24);assert.equal(f.api.read().pen.recent.length,8);
 f.api.write('pen',{color:'#000001'},{custom:true,recent:true});assert.equal(f.api.read().pen.custom.length,24);assert.equal(f.api.read().pen.recent[0],'#000001');
 f.api.write('pen',{},{removeCustom:true});assert.equal(f.api.read().pen.custom.includes('#000001'),false);
});
test('invalid color/width/opacity and quota errors preserve the prior preferences',()=>{
 const f=fixture();f.api.write('pen',{color:'#123456'});const before=[...f.memory.values()][0];
 for(const patch of [{color:'url(bad)'},{color:'#fff'},{width:0},{width:.5},{opacity:0},{opacity:2}])assert.throws(()=>f.api.write('pen',patch));
 assert.equal([...f.memory.values()][0],before);
 f.hooks.write=()=>{throw Error('full');};assert.throws(()=>f.api.write('pen',{color:'#abcdef'}));assert.equal([...f.memory.values()][0],before);
});
test('another account never reads these preferences and an old login cannot write after handoff',()=>{
 const f=fixture();f.api.write('pen',{color:'#123456'});
 f.setIdentity({owner:'alice',session:'two'});assert.throws(()=>f.api.write('pen',{color:'#abcdef'}));
 f.setIdentity({owner:'bob',session:'two'});assert.equal(create(f.options).read().pen.color,'#101828');assert.equal(f.memory.size,1);
});
test('malformed and future preferences fall back without rewriting raw storage or note data',()=>{
 const f=fixture();
 for(const text of ['bad JSON',JSON.stringify({version:2,owner:'alice'}),JSON.stringify({version:1,owner:'alice',pen:{color:'bad',custom:['#123456',{}]}})]){
  f.memory.set(f.api.key,text);assert.match(f.api.read().pen.color,/^#[0-9a-f]{6}$/);assert.equal(f.memory.get(f.api.key),text);
 }
});

test('tablet pen-only default applies only until the user chooses an input preference',()=>{
 const f=fixture(),tablet=create({...f.options,defaultPenOnly:true});assert.equal(tablet.read().penOnly,true);
 tablet.write('input',{penOnly:false});assert.equal(create({...f.options,defaultPenOnly:true}).read().penOnly,false);
});
test('the last way of writing a memo (글자/펜) and its colour are remembered; bad values keep the earlier choice',()=>{
 const f=fixture();assert.deepEqual(f.api.read().memo,{mode:'text',color:'#fbe88c'});
 f.api.write('memo',{mode:'pen',color:'#FBCFE0'});assert.deepEqual(create(f.options).read().memo,{mode:'pen',color:'#fbcfe0'});
 for(const patch of [{mode:'draw'},{color:'pink'},{color:'#fff'}])assert.throws(()=>f.api.write('memo',patch));
 assert.deepEqual(f.api.read().memo,{mode:'pen',color:'#fbcfe0'});
 // Other tools keep their own settings, and settings saved before memos existed still read.
 f.api.write('pen',{color:'#123456'});assert.equal(f.api.read().memo.mode,'pen');assert.equal(f.api.read().pen.color,'#123456');
 const key=[...f.memory.keys()][0],old=JSON.parse(f.memory.get(key));delete old.memo;f.memory.set(key,JSON.stringify(old));
 assert.deepEqual(f.api.read().memo,{mode:'text',color:'#fbe88c'});assert.equal(f.api.read().pen.color,'#123456');
});
/* 악보 표기 presets. */
const {MARKERS,MARK_USER_MAX}=require('../app/score-ink-settings.js');
const mine=(id,extra={})=>({id,name:'강세',color:'#B42318',width:.005,type:'pen',form:'symbol',shape:'star',...extra});
test('the four built-in markers start as they always were, and settings saved before markers still read',()=>{
 const f=fixture();
 assert.deepEqual(f.api.read().markers.map(m=>[m.id,m.name,m.color,m.width,m.type,m.form,m.shape,m.builtin,m.changed]),[
  ['breath','숨표','#7a32f5',.006,'pen','symbol','v',true,false],['repeat','반복','#7a32f5',.006,'pen','bracket',undefined,true,false],
  ['cut','컷','#7a32f5',.04,'highlighter','cover',undefined,true,false],['start','시작점','#7a32f5',.006,'pen','symbol','circle',true,false]]);
 f.api.write('pen',{color:'#123456'});const key=[...f.memory.keys()][0],old=JSON.parse(f.memory.get(key));delete old.markers;f.memory.set(key,JSON.stringify(old));
 assert.equal(f.api.read().markers.length,4);assert.equal(f.api.read().pen.color,'#123456');
});
test('a built-in marker can be changed and put back but not removed; only what differs from the default is stored',()=>{
 const f=fixture();
 f.api.write('marker',{id:'start',color:'#B42318',width:.012,type:'highlighter',shape:'star'});
 let start=create(f.options).read().markers.find(m=>m.id==='start');
 assert.deepEqual(start,{name:'시작점',color:'#b42318',width:.012,type:'highlighter',form:'symbol',shape:'star',id:'start',builtin:true,changed:true});
 const stored=JSON.parse([...f.memory.values()][0]).markers;assert.deepEqual(Object.keys(stored.builtin),['start']);assert.deepEqual(stored.user,[]);
 f.api.write('marker',{id:'repeat',form:'box'});assert.equal(f.api.read().markers.find(m=>m.id==='repeat').form,'box');
 assert.throws(()=>f.api.write('marker',{id:'start'},{remove:true}),/지울 수 없어요/);
 f.api.write('marker',{id:'start'},{reset:true});start=f.api.read().markers.find(m=>m.id==='start');
 assert.deepEqual([start.color,start.shape,start.changed],['#7a32f5','circle',false]);assert.equal(f.api.read().markers.find(m=>m.id==='repeat').changed,true);
 // Other tools are untouched by marker writes, and the other way round.
 f.api.write('pen',{color:'#abcdef'});assert.equal(f.api.read().markers.find(m=>m.id==='repeat').form,'box');assert.equal(f.api.read().pen.color,'#abcdef');
});
test('user markers are added, changed and removed; bad input and the limit keep what was there',()=>{
 const f=fixture();
 f.api.write('marker',mine('m-1'));f.api.write('marker',mine('m-2',{name:'  셈  여림 ',shape:'text',text:' mf '}));
 assert.deepEqual(create(f.options).read().markers.slice(4),[{name:'강세',color:'#b42318',width:.005,type:'pen',form:'symbol',shape:'star',id:'m-1',builtin:false},
  {name:'셈 여림',color:'#b42318',width:.005,type:'pen',form:'symbol',shape:'text',text:'mf',id:'m-2',builtin:false}]);
 f.api.write('marker',{id:'m-2',form:'wave',type:'highlighter'});
 assert.deepEqual(f.api.read().markers[5],{name:'셈 여림',color:'#b42318',width:.005,type:'highlighter',form:'wave',id:'m-2',builtin:false}); // a line has no symbol
 const before=[...f.memory.values()][0];
 for(const bad of [{name:''},{name:'가'.repeat(13)},{color:'red'},{width:0},{width:.07},{type:'brush'},{form:'blob'},{form:'symbol',shape:'heart'},{form:'symbol',shape:'text',text:''},{form:'symbol',shape:'text',text:'12345'},{form:'symbol',shape:'text',text:'a b'}])
  assert.throws(()=>f.api.write('marker',{id:'m-1',...bad}),undefined,JSON.stringify(bad));
 assert.throws(()=>f.api.write('marker',mine('bad id')));assert.throws(()=>f.api.write('marker',{id:'m-1'},{reset:true}));assert.throws(()=>f.api.write('marker',{id:'none'},{remove:true}));
 assert.equal([...f.memory.values()][0],before);
 f.api.write('marker',{id:'m-1'},{remove:true});assert.deepEqual(f.api.read().markers.map(m=>m.id),['breath','repeat','cut','start','m-2']);
 for(let n=0;n<MARK_USER_MAX-1;n++)f.api.write('marker',mine('m-x'+n));
 assert.throws(()=>f.api.write('marker',mine('m-over')),/20개까지/);assert.equal(f.api.read().markers.length,MARKERS.length+MARK_USER_MAX);
 assert.ok([...f.memory.values()][0].length<16000); // inside what an older build reads back
});
test('damaged stored markers fall back one by one; another account sees only the defaults',()=>{
 const f=fixture();f.api.write('marker',mine('m-1'));
 const key=[...f.memory.keys()][0],data=JSON.parse(f.memory.get(key));
 data.markers={builtin:{start:{color:'nope'},cut:{width:.02},ghost:{name:'x'}},user:[{id:'breath',name:'가짜'},{id:'m-1',name:'강세'},mine('m-2'),mine('m-2'),'x',null]};
 const text=JSON.stringify(data);f.memory.set(key,text);
 const list=f.api.read().markers;assert.deepEqual(list.map(m=>m.id),['breath','repeat','cut','start','m-2']);
 assert.deepEqual([list[3].color,list[3].changed,list[2].width,list[2].changed],['#7a32f5',false,.02,true]);assert.equal(f.memory.get(key),text);
 f.setIdentity({owner:'bob',session:'two'});assert.deepEqual(create(f.options).read().markers.map(m=>[m.id,m.changed]),[['breath',false],['repeat',false],['cut',false],['start',false]]);
});

test('a preset\'s 투명도: optional, two decimals; without it marks have what they always had',()=>{
 const Settings=require('../app/score-ink-settings.js'),Ink=require('../app/score-ink-model.js');
 const cover={name:'덮기',color:'#7a32f5',width:.04,type:'highlighter',form:'cover'};
 assert.equal('opacity' in Settings.marker(cover),false);assert.equal(Settings.marker({...cover,opacity:null}).opacity,undefined);
 assert.equal(Settings.marker({...cover,opacity:.333}).opacity,.33);assert.equal(Settings.marker({...cover,opacity:.05}).opacity,.05);assert.equal(Settings.marker({...cover,opacity:1}).opacity,1);
 // The usual 투명도 of its type is not stored (a preset saved untouched is as before).
 assert.equal('opacity' in Settings.marker({...cover,opacity:.25}),false);assert.equal('opacity' in Settings.marker({...cover,type:'pen',opacity:1}),false);
 for(const opacity of [0,.04,1.01,-1,NaN,Infinity,'0.5'])assert.throws(()=>Settings.marker({...cover,opacity}),/투명도/,String(opacity));
 // The defaults are what placed marks got before: a highlighter's MARK_OPACITY (.25), a pen's 1.
 assert.equal(Ink.MARK_OPACITY,.25);assert.equal(Settings.markerOpacity(cover),.25);assert.equal(Settings.markerOpacity(mine('x')),1);
 assert.equal(Settings.markerOpacity(MARKERS.find(m=>m.id==='cut')),.25);assert.equal(Settings.markerOpacity(MARKERS.find(m=>m.id==='breath')),1);
 // Placed marks take the preset's 투명도 (every shape and every stroke of a drawing), or the default.
 assert.equal(Ink.markStroke(cover,[.1,.1,.5],[.3,.1,.5]).opacity,.25);assert.equal(Ink.markStroke({...cover,opacity:.3},[.1,.1,.5],[.3,.1,.5]).opacity,.3);
 assert.equal(Ink.markStroke({...mine('x'),opacity:.6},[.1,.1,.5],null).opacity,.6);assert.equal(Ink.markStroke(mine('x'),[.1,.1,.5],null).opacity,1);
 const art=Ink.artFrom([[[100,100],[900,900]],[[100,900],[900,100]]]);
 assert.deepEqual(Ink.markStamp({...cover,form:'draw',art,opacity:.4},[.5,.5,.5]).map(s=>s.opacity),[.4,.4]);
 assert.ok(Ink.valid({version:1,id:'s',ownerId:'alice',songId:'song',scoreId:'score',r2Key:'u/alice/score/a.pdf',pdfHash:'a'.repeat(64),page:1,createdAt:1,...Ink.markStroke({...cover,opacity:.3},[.1,.1,.5],[.3,.1,.5])}));
});
test('투명도 of a built-in preset: the default is not a change, another value is and 되돌리기 clears it; a user preset keeps its own',()=>{
 const f=fixture(),cut=()=>create(f.options).read().markers.find(m=>m.id==='cut');
 f.api.write('marker',{id:'cut',opacity:.25});assert.equal(cut().changed,false);
 f.api.write('marker',{id:'cut',opacity:.8});assert.deepEqual([cut().opacity,cut().changed],[.8,true]);
 assert.equal(JSON.parse([...f.memory.values()][0]).markers.builtin.cut.opacity,.8);
 f.api.write('marker',{id:'cut'},{reset:true});assert.deepEqual([cut().opacity,cut().changed],[undefined,false]);
 // A pen preset at 100% is as it was; at 40% it is changed.
 f.api.write('marker',{id:'breath',opacity:1});assert.equal(f.api.read().markers[0].changed,false);
 f.api.write('marker',{id:'breath',opacity:.4});assert.equal(f.api.read().markers[0].changed,true);
 f.api.write('marker',mine('m-1',{type:'highlighter',opacity:.3}));assert.equal(create(f.options).read().markers.find(m=>m.id==='m-1').opacity,.3);
 assert.throws(()=>f.api.write('marker',{id:'m-1',opacity:0}),/투명도/);assert.equal(f.api.read().markers.find(m=>m.id==='m-1').opacity,.3);
});

test('크기 of a 기호 and a drawing: a factor of the usual size; the old s/m/l still read and older presets are unchanged',()=>{
 const Settings=require('../app/score-ink-settings.js'),Ink=require('../app/score-ink-model.js');
 const star=mine('x',{shape:'star'}),art=Ink.artFrom([[[100,100],[900,900]],[[100,900],[900,100]]]),draw={...star,form:'draw',art};delete draw.shape;
 assert.equal('size' in Settings.marker(star),false);assert.equal('size' in Settings.marker({...star,size:1}),false);
 assert.equal(Settings.marker({...star,size:2}).size,2);assert.equal(Settings.marker({...star,size:1.26}).size,1.3);
 assert.equal(Settings.marker({...star,size:9}).size,2.5);assert.equal(Settings.marker({...star,size:.1}).size,.5);
 assert.equal(Settings.marker({...star,size:'l'}).size,1.6);assert.equal('size' in Settings.marker({...star,size:'huge'}),false);
 // A drawing keeps the letters older versions know when it is on one of their steps.
 assert.deepEqual([.6,1,1.6,1.3,'s',undefined].map(size=>Settings.marker({...draw,size}).size),['s','m','l',1.3,'s','m']);
 // Placed: a star at 200% is twice as large around the same point; 글자 and 점 grow too; lines do not.
 const box=look=>{const p=Ink.markStroke(look,[.5,.5,.5],null).points,xs=p.map(q=>q[0]),ys=p.map(q=>q[1]);return [Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)];};
 const [w1,h1]=box(star),[w2,h2]=box({...star,size:2});assert.ok(Math.abs(w2/w1-2)<.01&&Math.abs(h2/h1-2)<.01,[w1,w2,h1,h2].join());
 assert.equal(Ink.markStroke({...star,shape:'text',text:'mf',size:2},[.5,.5,.5],null).size,.08);
 assert.equal(Ink.markStroke({...star,shape:'dot',size:2},[.5,.5,.5],null).width,.04);
 const line={...star,form:'line'};delete line.shape;assert.deepEqual(Ink.markStroke({...line,size:2},[.1,.1,.5],[.3,.1,.5]),Ink.markStroke(line,[.1,.1,.5],[.3,.1,.5]));
 // Without a size every built-in draws exactly as before (their points are the usual ones).
 for(const m of MARKERS)assert.deepEqual(Ink.markStroke(m,[.5,.5,.5],[.6,.5,.5]),Ink.markStroke({...m,size:1},[.5,.5,.5],[.6,.5,.5]));
 assert.deepEqual(Ink.markStroke(MARKERS[0],[.5,.5,.5],null).points.map(p=>p.slice(0,2)),[[.484,.483],[.5,.517],[.516,.483]]);
 const long=look=>{const all=Ink.markStamp(look,[.5,.5,.5]).flatMap(s=>s.points);return Math.max(...all.map(p=>p[0]))-Math.min(...all.map(p=>p[0]));};
 assert.ok(Math.abs(long({...draw,size:'l'})-.08)<1e-3);assert.ok(Math.abs(long({...draw,size:1.3})-.065)<1e-3);assert.ok(Math.abs(long({...draw,size:'m'})-.05)<1e-3);
 // A built-in at its usual size is unchanged; at 200% changed; 되돌리기 clears it. Stored and read back.
 const f=fixture();f.api.write('marker',{id:'start',size:1});assert.equal(f.api.read().markers[3].changed,false);
 f.api.write('marker',{id:'start',size:2});assert.deepEqual([create(f.options).read().markers[3].size,f.api.read().markers[3].changed],[2,true]);
 f.api.write('marker',{id:'start'},{reset:true});assert.deepEqual([f.api.read().markers[3].size,f.api.read().markers[3].changed],[undefined,false]);
 f.api.write('marker',mine('m-1',{size:2.2}));assert.equal(create(f.options).read().markers.find(m=>m.id==='m-1').size,2.2);
});
