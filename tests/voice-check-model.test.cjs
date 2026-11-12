// 매일 보이스 체크: metric derivation from synthetic checks (stable / wobbly / flat scale / short high note), baseline,
// gentle flags and streak. Runs the real on-device analyzer (app/vocal-analysis.js) on tests/synth-vocal.cjs audio.
const test=require('node:test'),assert=require('node:assert/strict');
const {synth}=require('./synth-vocal.cjs'),VA=require('../app/vocal-analysis.js'),VC=require('../app/voice-check-model.js');

const part=k=>VC.PROTOCOL.parts.find(p=>p.key===k);
/** Notes a singer following the protocol would sing (timed like the on-screen guide). */
function checkNotes(ref,high,{scaleDetune=0,highDur=6,vib=true,late=0}={}){
 const s=part('scale'),out=[[part('sustain').start+.1+late,5.8,ref,0,vib]];
 s.offsets.forEach((o,i)=>out.push([s.start+late+i*s.step+.05,s.step-.15,ref+o,scaleDetune,false]));
 out.push([part('high').start+.1+late,highDur,high,0,vib]);
 return out;
}
function run(ref,{notes={},cue=false,...options}={}){
 const a=synth({sr:16000,withMr:false,dur:30,notes:checkNotes(ref,ref+VC.HIGH_OFFSET,notes),...options});
 if(cue)for(const k of ['cue1','cue2','cue3']){ // the reference tone leaks into the recording through the speaker
  const p=part(k),f=440*2**(((k==='cue3'?ref+VC.HIGH_OFFSET:ref)-69)/12);
  for(let i=Math.floor((p.start+.1)*a.sr);i<Math.floor((p.start+1.1)*a.sr);i++)a.samples[i]+=.08*Math.sin(2*Math.PI*f*i/a.sr);
 }
 return VC.derive(VA.analyze(a.samples,a.sr),{refNote:ref,highNote:ref+VC.HIGH_OFFSET});
}
const stable=run(64),wobbly=run(64,{drift:[{cents:30,rate:2.1},{cents:18,rate:3.3}]}),flat=run(64,{notes:{scaleDetune:-30}});

test('a steady check: small wobble, accurate scale, the high note held for its length, vibrato not counted as wobble',()=>{
 assert.ok(stable.reliable);
 assert.ok(stable.sustainWobble<6,'sustain wobble '+stable.sustainWobble);
 assert.ok(stable.highWobble<6,'high wobble '+stable.highWobble);
 assert.ok(stable.scaleCents<6,'scale '+stable.scaleCents);
 assert.equal(stable.scaleMatch,100);assert.equal(stable.scaleNotes,5);
 assert.ok(Math.abs(stable.sustainDev)<=10&&Math.abs(stable.highDev)<=10);
 assert.ok(stable.sustainHold>=5&&stable.highHold>=5,'holds '+stable.sustainHold+' / '+stable.highHold);
 assert.ok(stable.voicedPct>=85,'voiced '+stable.voicedPct);
});
test('a wobbly check reads clearly larger wobble on both sustained notes without shortening the hold',()=>{
 assert.ok(wobbly.sustainWobble>=12&&wobbly.sustainWobble>=3*stable.sustainWobble,'sustain '+wobbly.sustainWobble);
 assert.ok(wobbly.highWobble>=12,'high '+wobbly.highWobble);
 assert.ok(wobbly.highHold>=5);
});
test('a scale sung 30 cents flat shows the intonation error and its direction; sustained notes are unaffected',()=>{
 assert.ok(flat.scaleCents>=25&&flat.scaleCents<=35,'scale '+flat.scaleCents);
 assert.ok(flat.scaleBias<=-25,'bias '+flat.scaleBias);
 assert.ok(flat.sustainWobble<6);
});
test('a short high note, a low voice, a late singer and a leaking reference tone are all measured from the singing',()=>{
 const short=run(64,{notes:{highDur:2}});
 assert.ok(short.highHold>=1.5&&short.highHold<=2.3,'short hold '+short.highHold);
 const low=run(50);
 assert.ok(low.reliable&&low.sustainWobble<6&&low.scaleCents<6&&Math.abs(low.sustainDev)<=10,'low voice '+JSON.stringify(low));
 const late=run(64,{notes:{late:.5}});
 assert.ok(late.sustainHold>=5&&late.highHold>=5&&late.scaleCents<6,'late '+JSON.stringify(late));
 const cue=run(64,{cue:true});
 assert.ok(cue.sustainWobble<6&&cue.scaleCents<6&&cue.highHold>=5,'with cue '+JSON.stringify(cue));
});
test('silence is not a check: unreliable, no metrics invented',()=>{
 const quiet=VC.derive(VA.analyze(new Float32Array(16000*30),16000),{refNote:64,highNote:73});
 assert.equal(quiet.reliable,false);assert.equal(quiet.sustainWobble,null);assert.equal(quiet.scaleCents,null);assert.equal(quiet.voicedPct,0);
 assert.equal(VC.derive({},{refNote:64,highNote:73}),null);
});

const day=n=>{const d=new Date(2026,10,12);d.setDate(d.getDate()-n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
const rec=(n,metrics,extra={})=>({id:'voice-check:'+n,date:day(n),created:1000-n,voiceCheck:{v:1,protocol:'vc30-v1',refNote:64,highNote:73,at:1000-n,metrics:{reliable:true,...metrics},...extra}});
const steady={sustainWobble:4,scaleCents:6,highHold:6,highWobble:5};
test('baseline is the median of the last 14 earlier reliable checks; fewer than 3 values is no baseline',()=>{
 const list=VC.checks([...Array.from({length:20},(_,i)=>rec(i+1,{...steady,sustainWobble:i<14?4:40},{selfRating:4})),rec(30,{...steady},{}),{id:'other',date:day(1),minutes:5}]);
 assert.equal(list.length,21);assert.equal(list[0].date,day(30));
 const base=VC.baseline(list);
 assert.equal(base.count,14);assert.equal(base.sustainWobble,4);assert.equal(base.selfRating,4);
 assert.equal(VC.baseline(list.slice(0,2)).sustainWobble,null);
 const unreliable=VC.checks([rec(3,steady),rec(2,steady),rec(1,{...steady,reliable:false,sustainWobble:90})]);
 assert.equal(VC.baseline(unreliable).count,2);
 assert.deepEqual(VC.checks([rec(1,steady)],['voice-check:1']),[]);
});
test('flags: larger wobble is a gentle warning, several drops or a low self-rating suggest rest, never a diagnosis',()=>{
 const base={count:5,sustainWobble:4,scaleCents:6,highHold:6,highWobble:5,selfRating:4};
 const ok=VC.flags({metrics:{reliable:true,...steady},selfRating:4},base);
 assert.equal(ok.level,'ok');assert.deepEqual(ok.flags,[]);assert.equal(ok.advice,null);
 const wob=VC.flags({metrics:{reliable:true,...steady,sustainWobble:12},selfRating:4},base);
 assert.equal(wob.level,'notice');assert.equal(wob.flags[0].text,'평소보다 흔들림이 커요 — 무리하지 마세요.');
 assert.equal(VC.flags({metrics:{reliable:true,...steady,sustainWobble:7}},base).flags.length,0,'small change is not flagged');
 const drop=VC.flags({metrics:{reliable:true,sustainWobble:12,scaleCents:16,highHold:2,highWobble:5},selfRating:3},base);
 assert.equal(drop.level,'rest');assert.equal(drop.flags.length,3);assert.match(drop.advice,/선생님/);
 const tired=VC.flags({metrics:{reliable:true,...steady},selfRating:2},base);
 assert.equal(tired.level,'rest');assert.match(tired.advice,/쉬어/);
 const streak=VC.flags({metrics:{reliable:true,...steady},selfRating:1},base,[{selfRating:2},{selfRating:1}]);
 assert.match(streak.advice,/선생님이나 전문가/);
 assert.match(VC.flags({metrics:{reliable:true,...steady},selfRating:4,tags:['hoarse']},base).advice,/쉰 소리/);
 const building=VC.flags({metrics:{reliable:true,...steady,sustainWobble:40}},{count:2});
 assert.equal(building.level,'building');assert.equal(building.needed,1);assert.deepEqual(building.flags,[]);
 assert.equal(VC.flags({metrics:{reliable:false}},base).flags[0].key,'quality');
 for(const f of [...wob.flags,...drop.flags])assert.doesNotMatch(f.text,/진단|질환|병|결절/);
});
test('streak counts consecutive days to today, or to yesterday before today\'s check; trend keeps the last 30 days',()=>{
 const list=VC.checks([rec(1,steady),rec(2,steady),rec(3,steady),rec(5,steady),rec(40,steady)]);
 assert.equal(VC.streak(list,day(0)),3);
 assert.equal(VC.streak(VC.checks([rec(0,steady),rec(1,steady)]),day(0)),2);
 assert.equal(VC.streak(list,day(-2)),0);
 const t=VC.trend(list,'sustainWobble',day(0));
 assert.deepEqual(t.map(p=>p.x),[24,26,27,28]);
});
test('settings: a voice type gives the reference and high notes; explicit notes win; nothing chosen is no setup',()=>{
 assert.equal(VC.settings(null),null);
 assert.deepEqual(VC.settings({voiceType:'tenor'}),{voiceType:'tenor',refNote:57,highNote:66,tones:true});
 assert.deepEqual(VC.settings({voiceType:'tenor',refNote:59,highNote:55,tones:false}),{voiceType:'tenor',refNote:59,highNote:68,tones:false});
 assert.equal(VC.noteName(64),'E4');
});
