/* 매일 보이스 체크: the fixed 30-second protocol, condition metrics derived from the on-device analyzer's pitch curve,
 * the personal baseline (median of the last 14 checks) and gentle flags. Pure functions: no DOM, no storage.
 * Never a medical judgement: flags only compare the user with their own recent checks. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipVoiceCheckModel=api;})(globalThis,()=>{
'use strict';
const NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const noteName=midi=>NAMES[((midi%12)+12)%12]+(Math.floor(midi/12)-1);
/* Protocol v1 (seconds from the start of the recording). Cue windows may hold the reference tone (heard through
 * the speaker and therefore recorded too), so metrics are read only from the singing windows. */
const PROTOCOL={id:'vc30-v1',seconds:30,parts:[
 {key:'cue1',kind:'cue',start:0,end:1.5,note:'ref',label:'기준음 듣기'},
 {key:'sustain',kind:'sustain',start:1.5,end:7.5,label:'기준음에서 편안하게 “아—”'},
 {key:'cue2',kind:'cue',start:7.5,end:9,note:'ref',label:'음계 시작음 듣기'},
 {key:'scale',kind:'scale',start:9,end:20.25,step:1.25,offsets:[0,2,4,5,7,5,4,2,0],syllables:['도','레','미','파','솔','파','미','레','도'],label:'5음 음계 위·아래'},
 {key:'cue3',kind:'cue',start:20.25,end:21.75,note:'high',label:'고음 듣기'},
 {key:'high',kind:'high',start:21.75,end:28.75,label:'편한 고음을 편한 만큼 길게'},
 {key:'end',kind:'end',start:28.75,end:30,label:'마무리'}
]};
const part=key=>PROTOCOL.parts.find(p=>p.key===key);
/* Comfortable reference note by voice type (MIDI). The user can change both notes once; they are remembered. */
const VOICE_TYPES=[
 {key:'soprano',label:'소프라노',ref:67},{key:'mezzo',label:'메조',ref:64},{key:'alto',label:'알토',ref:60},
 {key:'tenor',label:'테너',ref:57},{key:'baritone',label:'바리톤',ref:53},{key:'bass',label:'베이스',ref:50}
];
const HIGH_OFFSET=9;
function defaults(voiceType){
 const t=VOICE_TYPES.find(v=>v.key===voiceType);
 return t?{voiceType:t.key,refNote:t.ref,highNote:t.ref+HIGH_OFFSET}:null;
}
function settings(raw){
 const s=raw&&typeof raw==='object'?raw:{},base=defaults(s.voiceType);
 const ok=n=>Number.isInteger(n)&&n>=40&&n<=84;
 if(!base&&!ok(s.refNote))return null;
 const refNote=ok(s.refNote)?s.refNote:base.refNote,highNote=ok(s.highNote)&&s.highNote>refNote?s.highNote:refNote+HIGH_OFFSET;
 return {voiceType:base?.voiceType||'',refNote,highNote,tones:s.tones!==false};
}
const median=a=>{const s=a.filter(Number.isFinite).sort((x,y)=>x-y);if(!s.length)return null;const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const round=(x,d=1)=>Number.isFinite(x)?Math.round(x*10**d)/10**d:null;
const wrap=c=>((c%100)+150)%100-50; // deviation from the nearest equal-tempered note (A4 = 440 Hz), −50…50 cents
const fold=d=>d-1200*Math.round(d/1200); // an octave slip of the tracker is not a pitch error
/* Pitch-continuous runs in [from,to) of a 20 fps curve: voiced points, gaps of ≤ 3 points (150 ms) bridged, a jump over 120
 * cents (a new note or an octave slip) starts a new run. */
function runs(curve,fps,from,to){
 const a=Math.max(0,Math.floor(from*fps)),b=Math.min(curve.length,Math.ceil(to*fps)),out=[];
 let cur=null,gap=0;
 for(let i=a;i<b;i++){
  const v=curve[i];
  if(v==null){if(cur&&++gap>3){out.push(cur);cur=null;}continue;}
  if(cur&&Math.abs(v-cur.values[cur.values.length-1])>120){out.push(cur);cur=null;}
  if(!cur)cur={start:i,end:i,values:[]};
  cur.values.push(v);cur.end=i;gap=0;
 }
 if(cur)out.push(cur);
 return out.map(r=>({...r,seconds:(r.end-r.start+1)/fps}));
}
/* Wobble: spread around the note's centre after a 200 ms moving average, which removes vibrato (≈5–7 Hz) and keeps
 * the slower unsteadiness. Same idea as the analyzer's 지속음 흔들림 (app/vocal-analysis.js). */
function wobble(values,fps){
 const w=Math.max(2,Math.round(.2*fps)),sm=values.map((_,i)=>{const lo=Math.max(0,i-Math.floor(w/2)),hi=Math.min(values.length,lo+w);return mean(values.slice(lo,hi));});
 const c=median(sm);return Math.sqrt(mean(sm.map(v=>(v-c)**2)));
}
function held(curve,fps,p,target,{late=.8}={}){
 const longest=runs(curve,fps,p.start+.2,p.end+late).sort((x,y)=>y.values.length-x.values.length)[0];
 if(!longest||longest.seconds<.5)return null;
 const trim=longest.seconds>=1.4?Math.round(.3*fps):0,core=trim?longest.values.slice(trim,-trim):longest.values;
 const centre=median(core);
 return {hold:round(longest.seconds),wobble:round(wobble(core,fps)),dev:round(fold(centre-target*100),0),at:round(longest.start/fps)};
}
function scaleOf(curve,fps,p,ref){
 const a=Math.floor((p.start+.1)*fps),b=Math.min(curve.length,Math.ceil((p.end+.8)*fps)),stable=[];
 for(let i=a+1;i<b-1;i++){const v=curve[i],u=curve[i-1],w=curve[i+1];if(v!=null&&u!=null&&w!=null&&Math.abs(v-u)<=30&&Math.abs(w-v)<=30)stable.push(v);}
 if(stable.length<2*fps)return null;
 const classes=new Set(p.offsets.map(o=>((ref+o)%12+12)%12)),pc=v=>((Math.round(v/100)%12)+12)%12,devs=stable.map(wrap);
 const per=new Map();for(const v of stable)if(classes.has(pc(v)))per.set(pc(v),(per.get(pc(v))||0)+1);
 return {cents:round(mean(devs.map(Math.abs))),bias:round(median(devs),0),match:Math.round(stable.filter(v=>classes.has(pc(v))).length/stable.length*100),
  notes:[...per.values()].filter(n=>n>=.25*fps).length,of:classes.size};
}
/** Condition metrics of one check from the analyzer result ({curve, fps}). Returns null without a pitch curve. */
function derive(result,{refNote,highNote}){
 const curve=Array.isArray(result?.curve)?result.curve:null,fps=Number(result?.fps)||20;
 if(!curve||!Number.isInteger(refNote)||!Number.isInteger(highNote))return null;
 const sustain=held(curve,fps,part('sustain'),refNote),scale=scaleOf(curve,fps,part('scale'),refNote),high=held(curve,fps,part('high'),highNote,{late:1.2});
 let voiced=0,total=0;
 for(const k of ['sustain','scale','high']){const p=part(k);for(let i=Math.floor(p.start*fps);i<Math.min(curve.length,Math.ceil(p.end*fps));i++){total++;if(curve[i]!=null)voiced++;}}
 // Frames past the end of a short recording count as silence.
 for(const k of ['sustain','scale','high']){const p=part(k);total+=Math.max(0,Math.ceil(p.end*fps)-Math.max(curve.length,Math.floor(p.start*fps)));}
 const voicedPct=total?Math.round(voiced/total*100):0;
 return {
  sustainWobble:sustain?.wobble??null,sustainHold:sustain?.hold??null,sustainDev:sustain?.dev??null,
  scaleCents:scale?.cents??null,scaleBias:scale?.bias??null,scaleMatch:scale?.match??null,scaleNotes:scale?.notes??null,
  highHold:high?.hold??null,highWobble:high?.wobble??null,highDev:high?.dev??null,
  voicedPct,reliable:voicedPct>=40&&!!sustain&&sustain.hold>=1.5
 };
}
/* Charted and compared measures. lower: smaller is steadier. */
const METRICS=[
 {key:'sustainWobble',label:'지속음 흔들림',better:'lower',unit:'cent',fmt:v=>'±'+v+' cent',help:'기준음 “아—”의 흔들림 · 작을수록 안정'},
 {key:'scaleCents',label:'음계 음정',better:'lower',unit:'cent',fmt:v=>'±'+v+' cent',help:'음계에서 가장 가까운 음과의 평균 차이'},
 {key:'highHold',label:'고음 유지',better:'higher',unit:'초',fmt:v=>v+'초',help:'편한 고음을 끊김 없이 낸 시간'},
 {key:'highWobble',label:'고음 흔들림',better:'lower',unit:'cent',fmt:v=>'±'+v+' cent',help:'고음의 흔들림 · 작을수록 안정'},
 {key:'selfRating',label:'목 상태',better:'higher',unit:'점',fmt:v=>v+'점',help:'직접 고른 목 상태 (1–5)'}
];
const TAGS=[['tired','피곤'],['hoarse','쉰 소리'],['good','좋음']];
/** Checks stored on practice records (practice.voiceCheck), oldest first. */
function checks(practices,deleted=[]){
 const gone=new Set((deleted||[]).map(String));
 return (Array.isArray(practices)?practices:[]).filter(p=>p&&p.voiceCheck&&typeof p.voiceCheck==='object'&&!gone.has(String(p.id))&&/^\d{4}-\d{2}-\d{2}$/.test(String(p.date||'')))
  .map(p=>({id:p.id,date:p.date,at:Number(p.voiceCheck.at)||Number(p.created)||0,...p.voiceCheck}))
  .sort((a,b)=>a.date.localeCompare(b.date)||a.at-b.at);
}
const valueOf=(c,key)=>key==='selfRating'?(Number.isInteger(c.selfRating)?c.selfRating:null):(c.metrics&&c.metrics.reliable!==false&&Number.isFinite(c.metrics[key])?c.metrics[key]:null);
/** Personal baseline: per measure, the median of the last 14 earlier checks that have it. */
function baseline(list,beforeIndex=list.length,size=14){
 const earlier=list.slice(0,Math.max(0,beforeIndex)).filter(c=>c.metrics?.reliable!==false).slice(-size),out={count:earlier.length};
 for(const m of METRICS){const vals=earlier.map(c=>valueOf(c,m.key)).filter(v=>v!=null);out[m.key]=vals.length>=3?round(median(vals)):null;}
 return out;
}
const MIN_BASELINE=3;
/** Gentle flags for one check against the baseline. Never a diagnosis; suggests rest or a teacher, nothing more. */
function flags(check,base,recent=[]){
 const out=[],m=check?.metrics,t=key=>valueOf(check,key),b=key=>base?.[key];
 if(m&&m.reliable===false)out.push({key:'quality',tone:'info',text:'소리를 충분히 듣지 못했어요 — 조용한 곳에서 기준음을 듣고 다시 해 보세요. 이번 결과는 평소 기준에 넣지 않아요.'});
 const ready=m&&m.reliable!==false&&(base?.count||0)>=MIN_BASELINE;
 let drops=0;
 if(ready){
  const grew=(key,ratio,min)=>t(key)!=null&&b(key)!=null&&t(key)>=Math.max(b(key)*ratio,b(key)+min);
  if(grew('sustainWobble',1.5,5)){drops++;out.push({key:'wobble',tone:'warn',text:'평소보다 흔들림이 커요 — 무리하지 마세요.'});}
  if(grew('highWobble',1.5,6)){drops++;out.push({key:'highWobble',tone:'warn',text:'고음이 평소보다 흔들려요 — 오늘 고음은 가볍게만 내 보세요.'});}
  if(t('scaleCents')!=null&&b('scaleCents')!=null&&t('scaleCents')>=b('scaleCents')+8){drops++;out.push({key:'scale',tone:'warn',text:'음계 음정이 평소보다 흔들렸어요 — 기준음을 듣고 천천히 맞춰 보세요.'});}
  if(t('highHold')!=null&&b('highHold')!=null&&t('highHold')<=b('highHold')*.6&&b('highHold')-t('highHold')>=1.5){drops++;out.push({key:'highHold',tone:'warn',text:'고음 유지가 평소보다 짧아요 — 높은 음은 무리하지 마세요.'});}
 }
 const rating=Number.isInteger(check?.selfRating)?check.selfRating:null,tags=Array.isArray(check?.tags)?check.tags:[];
 const lowStreak=rating!=null&&rating<=2&&recent.length>=2&&recent.slice(-2).every(c=>Number.isInteger(c.selfRating)&&c.selfRating<=2);
 let advice=null;
 if(lowStreak)advice='목 상태가 며칠째 좋지 않다고 기록했어요. 오늘은 쉬고, 이런 날이 이어지면 선생님이나 전문가와 상의해 보세요.';
 else if(drops>=2)advice='여러 지표가 평소보다 낮아요. 오늘은 짧게 하거나 쉬어 가요. 이런 날이 이어지면 선생님과 상의해 보세요.';
 else if(rating!=null&&rating<=2)advice='목 상태가 좋지 않다고 기록했어요. 오늘은 무리하지 말고 쉬어 가는 것도 좋아요.';
 else if(tags.includes('hoarse'))advice='쉰 소리가 난다면 오늘은 큰 소리와 고음을 줄이고 목을 쉬게 해 주세요.';
 const level=advice&&(lowStreak||drops>=2||(rating!=null&&rating<=2))?'rest':out.some(f=>f.tone==='warn')||advice?'notice':ready?'ok':'building';
 return {level,flags:out,advice,ready:!!ready,needed:Math.max(0,MIN_BASELINE-(base?.count||0))};
}
const ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const parse=s=>{const [y,m,d]=String(s).split('-').map(Number);return new Date(y,m-1,d);};
/** Consecutive days with a check, ending today (or yesterday while today's is still to do). */
function streak(list,today){
 const days=new Set(list.map(c=>c.date));let d=parse(today);
 if(!days.has(today))d.setDate(d.getDate()-1);
 let n=0;while(days.has(ymd(d))){n++;d.setDate(d.getDate()-1);}
 return n;
}
/** Points of one measure for the last `days` days (x: 0 = oldest day, days-1 = today). */
function trend(list,key,today,days=30){
 const end=parse(today),start=new Date(end);start.setDate(start.getDate()-(days-1));
 return list.map(c=>({c,v:valueOf(c,key),x:Math.round((parse(c.date)-start)/86400000)})).filter(p=>p.v!=null&&p.x>=0&&p.x<days)
  .map(p=>({date:p.c.date,id:p.c.id,v:p.v,x:p.x}));
}
return {PROTOCOL,VOICE_TYPES,HIGH_OFFSET,METRICS,TAGS,MIN_BASELINE,noteName,defaults,settings,derive,checks,baseline,flags,streak,trend,valueOf,_internal:{runs,wobble,median}};
});
