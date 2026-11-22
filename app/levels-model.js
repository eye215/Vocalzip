/* 단계 (owner's choice C, 2026-11-19) — pure model: no DOM, storage or network; also loaded by Node tests.
 * TWO things that are never mixed:
 *
 * 1. 큰 단계 (Lv 1–10 and a name) = 꾸준함 only, never skill. Points per day are DERIVED from records that already
 *    exist (POINTS below); nothing about points is stored, so deleting a record lowers them honestly. Practice minutes
 *    are not points and a recording's length is never used. The level SHOWN never drops below the highest level
 *    already reached: that one number is kept (see the rows below).
 *
 * 2. 기본기 단계 = 8 areas × 5 steps, only from what the voice-only exercises of 오늘의 연습 measured. A finished item
 *    of a set (practices row 'practice-set:<session>', dailySet.items[]) may carry
 *        measures: [{area, kind?, value, unit, …fields of that measure}]
 *    and a step's criterion (SKILLS below) is a list of conditions on those fields. A step is earned when its
 *    criterion is met on RULES.days DIFFERENT days; an earned step is a stored row and is never removed. "요즘도 유지
 *    중" (met at least once in the last RULES.keepDays days) is derived each time. For the first RULES.calibrationDays
 *    days after an area's first measurement no step is awarded (기준 맞추는 중): the screen only says what the draft
 *    table would give. An area without a measuring exercise yet is listed as 준비 중; the day an exercise starts
 *    writing measures for it, the same table applies with no change here.
 *    Guardrails: 음역 · 고음 count only notes held comfortably (RULES.comfortSeconds or longer, stable) — never a
 *    single highest or loudest note — and no step is given for volume.
 *
 * WHERE THINGS ARE KEPT — no new list, rows of practicePlans (synced, merged by id) with their own `kind`:
 *   {id:'level-state', kind:'level-state', v, level, reached:{[n]:date}, first:{[area]:date}, rangeBase?, updated}
 *        the highest 큰 단계 reached, the day each area was first measured (so the calibration window does not move
 *        when a record is deleted) and the first week's comfortable range (the 음역 baseline)
 *   {id:'skill-step:<area>:<n>', kind:'skill-step', v, area, step, earned (date), days:[{date, value, unit}×3], created}
 *        one row per earned step, with the three days that earned it
 * 선생님 지적 배지 are read from the 레슨 지적 rows (scoreAnnotations kind 'score-point' with `retired`): nothing new. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipLevels=api;})(typeof self!=='undefined'?self:globalThis,()=>{
'use strict';
const list=v=>Array.isArray(v)?v:[];
const isObj=v=>!!v&&typeof v==='object'&&!Array.isArray(v);
const isDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v);
const fin=v=>typeof v==='number'&&Number.isFinite(v);
const live=(db,key)=>{const gone=new Set(list(db?.deleted?.[key]).map(String));return list(db?.[key]).filter(x=>isObj(x)&&!gone.has(String(x.id)));};
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const dayNumber=date=>Math.round(Date.UTC(+date.slice(0,4),+date.slice(5,7)-1,+date.slice(8,10))/86400000);
const shift=(date,n)=>new Date((dayNumber(date)+n)*86400000).toISOString().slice(0,10);
const shortDay=date=>Number(date.slice(5,7))+'.'+Number(date.slice(8,10));
const round1=n=>Math.round(n*10)/10;
const median=a=>{const s=a.slice().sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const NOTE_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const noteName=n=>NOTE_NAMES[((n%12)+12)%12]+(Math.floor(n/12)-1);
const STATE_ID='level-state',STATE_KIND='level-state',STEP_KIND='skill-step',STEP_PREFIX='skill-step:';

/* ====================================================================================================
 * 1. 큰 단계 — 꾸준함
 * ==================================================================================================== */
/** Points for one day (each line at most once a day). */
const POINTS={
  set:30,          // 오늘의 연습 한 세트를 끝까지 (every item done or skipped, at least one done)
  setStarted:10,   // 오늘의 연습을 시작해서 하나 이상 했어요 (not finished)
  record:10,       // 그날 직접 남긴 연습 기록
  voiceCheck:5,    // 그날 한 보이스 체크
  recording:5,     // 그날 한 곡 녹음 (몇 개든 한 번, 길이와 무관)
  pointRun:10,     // 레슨 지적 체크 한 번
  pointKept:2,     //   + 지켰어요 하나마다
  pointKeptMax:10, //   (지켰어요 점수는 여기까지)
  dayCap:60        // 하루에 받을 수 있는 가장 많은 점수
};
/** The ten levels and their names: rename here. Level n starts at 50·n·(n−1) points. */
const LEVELS=[
  {n:1,name:'첫 소리'},
  {n:2,name:'매일 한 걸음'},
  {n:3,name:'목 푸는 습관'},
  {n:4,name:'꾸준한 숨'},
  {n:5,name:'하루의 루틴'},
  {n:6,name:'쌓이는 소리'},
  {n:7,name:'단단한 습관'},
  {n:8,name:'노래가 일상'},
  {n:9,name:'오래 부르는 사람'},
  {n:10,name:'내 소리'}
];
const levelStart=n=>50*n*(n-1);
const levelOf=points=>{let n=1;while(n<LEVELS.length&&points>=levelStart(n+1))n++;return n;};
/** What a line of a day's points says. */
const PART_WORDS={
  set:'오늘의 연습을 끝까지 했어요','set-started':'오늘의 연습을 시작했어요',record:'연습 기록을 남겼어요','voice-check':'보이스 체크를 했어요',
  recording:'곡을 녹음했어요','point-run':'레슨 지적을 체크했어요','point-kept':'레슨 지적을 지켰어요'
};
/** How points are earned, as lines for the screen and the 기준표. */
const HOW=[
  ['오늘의 연습 한 세트를 끝까지',POINTS.set+'점'],['오늘의 연습을 시작만 했을 때 (하나 이상)',POINTS.setStarted+'점'],['그날 직접 남긴 연습 기록',POINTS.record+'점'],
  ['보이스 체크',POINTS.voiceCheck+'점'],['곡 녹음 (몇 개든 하루 한 번)',POINTS.recording+'점'],
  ['레슨 지적 체크',POINTS.pointRun+'점 + 지켰어요 하나에 '+POINTS.pointKept+'점 (최대 '+POINTS.pointKeptMax+'점)']
];
const blankDay=()=>({set:0,record:false,voice:false,recording:false,run:false,kept:0});
/**
 * What happened on each day, from the records as they are now. env: {today, recordingDates: the dates (YYYY-MM-DD) of
 * the song recordings — media is not in db, so the caller passes it}. Returns Map date → {set, record, voice,
 * recording, run, kept}.
 */
function ledger(db={},{today='',recordingDates=[]}={}){
  const days=new Map(),at=d=>{let x=days.get(d);if(!x)days.set(d,x=blankDay());return x;};
  const ok=d=>isDate(d)&&(!today||d<=today),practices=live(db,'practices');
  // The sets that have their own run row: the rows such a set wrote for its steps are part of it, not records of their own.
  const runs=new Set(practices.filter(p=>isObj(p.dailySet)&&p.practiceSetId).map(p=>String(p.practiceSetId)));
  for(const p of practices){
    if(!ok(p.date))continue;
    if(isObj(p.dailySet)){
      const items=list(p.dailySet.items).filter(isObj),done=items.filter(x=>x.state==='done').length;
      if(done){const whole=items.every(x=>x.state==='done'||x.state==='skipped'),x=at(p.date);x.set=Math.max(x.set,whole?POINTS.set:POINTS.setStarted);}
      continue;
    }
    if(p.practiceSetId&&runs.has(String(p.practiceSetId)))continue; // a step row of a set counted above (an older 연습 세트 without a run row is a record)
    if(isObj(p.voiceCheck)||p.practiceTimeSource==='voice-check'){at(p.date).voice=true;continue;}
    if(p.practiceTimeSource==='unconfirmed')continue;     // made by an import, not entered by the person
    if((Number(p.manualMinutes??p.minutes)||0)>0)at(p.date).record=true;
  }
  for(const r of live(db,'scoreAnnotations')){
    if(r.kind!=='score-point-run'||!ok(r.date)||!isObj(r.results))continue;
    const marks=Object.values(r.results),kept=marks.filter(v=>v==='kept').length;
    if(!marks.some(v=>v==='kept'||v==='missed'))continue;
    const x=at(r.date);x.run=true;x.kept=Math.max(x.kept,kept);
  }
  for(const d of list(recordingDates))if(ok(d))at(d).recording=true;
  return days;
}
/** One day's points: {parts:[{key, text, points}], raw, points (capped), capped}. */
function dayPoints(x){
  const parts=[],add=(key,points,text=PART_WORDS[key])=>{if(points>0)parts.push({key,text,points});};
  if(x){
    add(x.set>=POINTS.set?'set':'set-started',x.set);
    if(x.record)add('record',POINTS.record);
    if(x.voice)add('voice-check',POINTS.voiceCheck);
    if(x.recording)add('recording',POINTS.recording);
    if(x.run){add('point-run',POINTS.pointRun);add('point-kept',Math.min(POINTS.pointKeptMax,x.kept*POINTS.pointKept),'레슨 지적 '+x.kept+'개를 지켰어요');}
  }
  const raw=parts.reduce((n,p)=>n+p.points,0);
  return {parts,raw,points:Math.min(POINTS.dayCap,raw),capped:raw>POINTS.dayCap};
}
const stateRow=db=>live(db,'practicePlans').find(p=>p.id===STATE_ID&&p.kind===STATE_KIND)||null;
const reachedOf=st=>Math.min(LEVELS.length,Math.max(1,Math.floor(Number(st?.level)||1)));
/**
 * The 큰 단계 now. {level (shown: never under the reached one), name, points, derived (what the points alone give),
 * reached (stored), held (shown above the points), next (points where the next level starts, null at the top),
 * toNext, percent (of the way through the level shown), today:{date, parts, raw, points, capped}, days (with points)}.
 */
function level(db={},env={}){
  const today=isDate(env.today)?env.today:ymd(new Date()),days=ledger(db,{...env,today});
  let points=0,active=0;
  for(const x of days.values()){const p=dayPoints(x).points;points+=p;if(p)active++;}
  const derived=levelOf(points),reached=reachedOf(stateRow(db)),n=Math.max(derived,reached);
  const start=levelStart(n),next=n<LEVELS.length?levelStart(n+1):null;
  return {level:n,name:LEVELS[n-1].name,points,derived,reached,held:n>derived,start,next,toNext:next==null?null:Math.max(0,next-points),
    percent:next==null?100:Math.max(0,Math.min(100,Math.round((points-start)/(next-start)*100))),
    nextName:next==null?'':LEVELS[n].name,today:{date:today,...dayPoints(days.get(today))},days:active};
}

/* ====================================================================================================
 * 2. 기본기 단계
 *
 * ALL THRESHOLDS OF 기본기 ARE IN THIS ONE BLOCK (RULES and SKILLS).
 * THEY ARE A FIRST DRAFT, TO BE CALIBRATED: after the first two weeks of real measurements (기준 맞추는 중) the
 * numbers are to be moved so that the owner starts around step 2. Change numbers here only; the screens, the 기준표
 * and the tests of the rules read this table.
 *
 * A step: {say (the criterion in plain words), kind? (the measure's kind it reads), conds:[{field, min?, max?}] (all
 * must hold on ONE measure of that day), soon? (the exercise that will measure it, when none does yet)}.
 * Fields are whatever the measure carries; `gain` (음역) is worked out here from the first week's baseline.
 * ==================================================================================================== */
/** 비브라토 thresholds: the ones of 소리 길 흔적 (app/voice-path-model.js), read from there (never copied), with the
 * same first guesses when it is not loaded. */
const VIB=(()=>{
  let T={};try{T=(typeof module==='object'&&module.exports?require('./voice-path-model.js'):globalThis.VzipVoicePath)?.THRESHOLDS||{};}catch{}
  const minHz=T.VIBRATO_MIN_HZ??4,maxHz=T.VIBRATO_MAX_HZ??8,extent=T.VIBRATO_MIN_EXTENT_CENTS??15;
  return {minHz,maxHz,extent,conds:[{field:'rate',min:minHz,max:maxHz},{field:'extent',min:extent}]};
})();
/** 리듬: the faster tempo of steps 4–5 (app/daily-measure-model.js RHYTHM.fast plays it). */
const FAST_BPM=104;
const RULES={
  days:3,            // a step needs its criterion on this many DIFFERENT days
  keepDays:14,       // 요즘도 유지 중: met at least once in the last this many days
  calibrationDays:14,// 기준 맞추는 중: no step is awarded for this many days from an area's first measurement
  baselineDays:7,    // 음역: the comfortable range of the first this many days is "my start"
  comfortSeconds:2,  // 음역 · 고음: a note counts only when held this long, stable (inside the exercise's tolerance)
  recent:5           // how many recent values a screen lists
};
const SKILLS=[
  {id:'breath',title:'호흡',unit:'초',line:'숨을 고르게, 길게 내쉬는 힘',by:['breath-hiss'],
    how:'“스~” 길게: 크게 들이쉰 뒤 소리 없는 “스~”를 한 번에 최대한 길게 내쉬어요. 마이크로 “스~”가 이어진 시간을 재고, 0.25초 넘게 끊기면 거기까지 세요.',
    // value: seconds of one continuous hiss (the longest try); even: how much its loudness moved over the middle (dB SD,
    // smaller = steadier). Being louder never helps: no step reads the level itself.
    steps:[
      {say:'“스~”를 한 번에 10초 넘게 이어요',kind:'hiss',conds:[{field:'value',min:10}]},
      {say:'“스~”를 한 번에 20초 넘게 이어요',kind:'hiss',conds:[{field:'value',min:20}]},
      {say:'“스~”를 한 번에 30초 넘게 이어요',kind:'hiss',conds:[{field:'value',min:30}]},
      {say:'“스~”를 30초 넘게, 처음부터 끝까지 고른 세기로 이어요',kind:'hiss',conds:[{field:'value',min:30},{field:'even',max:3}]},
      {say:'“스~”를 40초 넘게, 고른 세기로 이어요',kind:'hiss',conds:[{field:'value',min:40},{field:'even',max:3}]}]},
  {id:'pitch',title:'음정',unit:'개',line:'들은 음을 그대로 내고 지키는 힘',by:['ear-follow'],
    steps:[
      {say:'들은 음 5개 가운데 3개를 ±25 cent 안에서 4초씩 유지해요',kind:'hold',conds:[{field:'value',min:3},{field:'hold',min:4},{field:'tolerance',max:25}]},
      {say:'들은 음 5개를 모두 ±25 cent 안에서 4초씩 유지해요',kind:'hold',conds:[{field:'value',min:5},{field:'hold',min:4},{field:'tolerance',max:25}]},
      {say:'5음 스케일을 80% 넘게 맞게 불러요',kind:'scale5',conds:[{field:'value',min:80}],soon:'스케일 실시간 음정 연습'},
      {say:'5음 스케일을 90% 넘게 맞게 불러요',kind:'scale5',conds:[{field:'value',min:90}],soon:'스케일 실시간 음정 연습'},
      {say:'옥타브 아르페지오를 90% 넘게 맞게 불러요',kind:'arpeggio',conds:[{field:'value',min:90}],soon:'아르페지오 실시간 음정 연습'}]},
  {id:'sustain',title:'지속음',unit:'cent',line:'한 음을 흔들리지 않게 길게 잇는 힘',by:['voice-hum','voice-mum'],
    // value: how much the pitch moved during the hold (standard deviation in cent, the middle one of the held notes).
    steps:[
      {say:'한 음을 4초 동안, 흔들림 20 cent 안으로 이어요',kind:'longtone',conds:[{field:'hold',min:4},{field:'value',max:20}]},
      {say:'한 음을 6초 동안, 흔들림 20 cent 안으로 이어요',kind:'longtone',conds:[{field:'hold',min:6},{field:'value',max:20}]},
      {say:'한 음을 8초 동안, 흔들림 20 cent 안으로 이어요',kind:'longtone',conds:[{field:'hold',min:8},{field:'value',max:20}],soon:'8초 롱톤 연습'},
      {say:'한 음을 8초 동안, 흔들림 12 cent 안으로 이어요',kind:'longtone',conds:[{field:'hold',min:8},{field:'value',max:12}],soon:'8초 롱톤 연습'},
      {say:'높은 음에서도 8초 동안, 흔들림 8 cent 안으로 이어요',kind:'longtone',conds:[{field:'hold',min:8},{field:'value',max:8},{field:'highValue',max:8}],soon:'높은 음 8초 롱톤 연습'}]},
  {id:'path',title:'소리 길',sub:'연결',unit:'반음',line:'낮은 음에서 높은 음까지 끊기지 않게 잇는 힘',by:[],soon:'낮은 음에서 높은 음으로 미끄러지듯 잇는 사이렌 연습',
    // value: how far the siren went (semitones); breaks / flips: how many times the sound stopped or flipped.
    steps:[
      {say:'사이렌으로 5도(7반음)를 끊김 없이 올라가요',conds:[{field:'value',min:7},{field:'breaks',max:0}]},
      {say:'5도를 끊김 없이 올라갔다 내려와요',conds:[{field:'value',min:7},{field:'breaks',max:0},{field:'both',min:1}]},
      {say:'한 옥타브를 끊김 없이 올라갔다 내려와요',conds:[{field:'value',min:12},{field:'breaks',max:0},{field:'both',min:1}]},
      {say:'한 옥타브를 소리가 뒤집히지 않게 올라갔다 내려와요',conds:[{field:'value',min:12},{field:'breaks',max:0},{field:'flips',max:0},{field:'both',min:1}]},
      {say:'한 옥타브 반을 끊김도 뒤집힘도 없이 올라갔다 내려와요',conds:[{field:'value',min:18},{field:'breaks',max:0},{field:'flips',max:0},{field:'both',min:1}]}]},
  {id:'range',title:'음역',unit:'반음',line:'편하게 낼 수 있는 음의 폭',by:['voice-hum','voice-mum','ear-follow'],comfort:true,
    // The exercises of today stay inside the comfortable range, so for now only the start is measured: growth beyond it
    // needs the 스케일 연습 (the next exercise type, rising key by key). A wider note that IS held still counts.
    limit:'지금은 기준만 재요. 처음보다 넓어진 음역은 조를 하나씩 올려 가는 스케일 연습이 생기면 그때부터 재요.',
    note:'가장 높이 낸 한 음이나 큰 소리는 세지 않아요. 편하게 2초 넘게 유지한 음만 세요.',
    // count: how many different notes were held comfortably in one exercise; gain: semitones beyond the first week's range.
    steps:[
      {say:'편하게 2초 넘게 유지한 음이 한 번에 3개 넘게 있어요 (내 처음 음역을 정해요)',kind:'comfortable',conds:[{field:'count',min:3}]},
      {say:'처음 잰 음역보다 1반음 넓은 음을 편하게 2초 넘게 유지해요',kind:'comfortable',conds:[{field:'gain',min:1}],soon:'조를 하나씩 올려 가는 스케일 연습'},
      {say:'처음 잰 음역보다 3반음 넓은 음을 편하게 2초 넘게 유지해요',kind:'comfortable',conds:[{field:'gain',min:3}],soon:'조를 하나씩 올려 가는 스케일 연습'},
      {say:'처음 잰 음역보다 5반음 넓은 음을 편하게 2초 넘게 유지해요',kind:'comfortable',conds:[{field:'gain',min:5}],soon:'조를 하나씩 올려 가는 스케일 연습'},
      {say:'처음 잰 음역보다 6반음 넓은 음을 편하게 2초 넘게 유지해요',kind:'comfortable',conds:[{field:'gain',min:6}],soon:'조를 하나씩 올려 가는 스케일 연습'}]},
  {id:'high',title:'고음',unit:'cent',line:'편한 음역의 맨 위를 힘주지 않고 내는 힘',by:[],comfort:true,soon:'편한 음역의 맨 위 음들을 힘주지 않고 2초씩 유지하는 연습',
    note:'가장 높은 음이나 큰 소리를 세는 것이 아니에요. 목이 불편한 날은 건너뛰어도 돼요.',
    // fromTop: semitones from the top of the comfortable range (0 = the top note); value: wobble in cent; vowels: how many vowels.
    steps:[
      {say:'편한 음역 맨 위에서 3반음 아래 음을 2초, 흔들림 20 cent 안으로 유지해요',conds:[{field:'fromTop',min:-3},{field:'value',max:20}]},
      {say:'편한 음역의 맨 위 음을 2초, 흔들림 20 cent 안으로 유지해요',conds:[{field:'fromTop',min:0},{field:'value',max:20}]},
      {say:'편한 음역의 맨 위 음을 2초, 흔들림 12 cent 안으로 유지해요',conds:[{field:'fromTop',min:0},{field:'value',max:12}]},
      {say:'맨 위 음을 모음 두 가지(아·에)로, 흔들림 12 cent 안으로 유지해요',conds:[{field:'fromTop',min:0},{field:'value',max:12},{field:'vowels',min:2}]},
      {say:'맨 위 음을 모음 세 가지(아·에·이)로, 흔들림 12 cent 안으로 유지해요',conds:[{field:'fromTop',min:0},{field:'value',max:12},{field:'vowels',min:3}]}]},
  {id:'vibrato',title:'비브라토',unit:'초',line:'긴 음 끝에서 고르게 떨리는 소리',by:['voice-vibrato'],
    how:'롱톤 비브라토: 들은 음을 8초 동안 이어요. 처음 4초는 곧게, 신호가 울리면 떨어요. 두 가지 높이로 한 번씩 해요.',
    // value: seconds of vibrato in one tone; rate: times a second; extent: width in cent (half of peak-to-peak) —
    // the thresholds of 소리 길 흔적 (VIB, from app/voice-path-model.js). tail / regular / cued: 1 when shown;
    // variants: how many different pitches had a cued, regular vibrato.
    steps:[
      {say:'롱톤 끝 2초 안에 비브라토가 나타나요 (1초에 '+VIB.minHz+'~'+VIB.maxHz+'번, 폭 '+VIB.extent+' cent 넘게)',kind:'vibrato',conds:[{field:'tail',min:1},...VIB.conds]},
      {say:'비브라토를 3초 넘게 고르게 이어요',kind:'vibrato',conds:[{field:'value',min:3},{field:'regular',min:1},...VIB.conds]},
      {say:'곧게 내다가 신호에 맞춰 비브라토를 넣고 3초 넘게 이어요',kind:'vibrato',conds:[{field:'value',min:3},{field:'regular',min:1},{field:'cued',min:1},...VIB.conds]},
      {say:'두 가지 높이에서 모두 신호에 맞춰 비브라토를 넣어요',kind:'vibrato',conds:[{field:'value',min:3},{field:'regular',min:1},{field:'cued',min:1},{field:'variants',min:2},...VIB.conds]},
      {say:'모음을 바꿔도(아·오) 신호에 맞춰 비브라토를 넣어요',kind:'vibrato',conds:[{field:'value',min:3},{field:'regular',min:1},{field:'cued',min:1},{field:'vowels',min:2},...VIB.conds],soon:'모음을 바꿔 가며 하는 비브라토 연습'}]},
  {id:'rhythm',title:'리듬',unit:'ms',line:'박자에 맞춰 소리를 내는 힘',by:['rhythm-ta'],
    how:'“타” 따라 하기: 박자 소리를 들으며 한 마디를 듣고, 다음 마디에 같은 리듬을 “타”로 따라 해요. 마이크로 “타”가 박자에서 얼마나 떨어졌는지 재요.',
    // value: the middle distance of the “타” from the beat (ms); level: 1 quarter notes · 2 eighth notes with rests ·
    // 3 triplets and syncopation; bpm: the tempo; hit: % of the “타” that were heard on a beat. The device's delay is
    // measured from the count-in (no earphones) or the person's own middle offset is taken off (earphones): `method`.
    steps:[
      {say:'4분음표를 “타”로, 박자와 0.08초 안으로 맞춰요',kind:'rhythm',conds:[{field:'level',min:1},{field:'hit',min:80},{field:'value',max:80}]},
      {say:'8분음표와 쉼표를 “타”로, 박자와 0.06초 안으로 맞춰요',kind:'rhythm',conds:[{field:'level',min:2},{field:'hit',min:80},{field:'value',max:60}]},
      {say:'셋잇단음과 당김음을 “타”로, 박자와 0.04초 안으로 맞춰요',kind:'rhythm',conds:[{field:'level',min:3},{field:'hit',min:80},{field:'value',max:40}]},
      {say:'빠른 박자(1분에 '+FAST_BPM+'번)에서 8분음표와 쉼표를 0.06초 안으로 맞춰요',kind:'rhythm',conds:[{field:'level',min:2},{field:'bpm',min:FAST_BPM},{field:'hit',min:80},{field:'value',max:60}]},
      {say:'빠른 박자(1분에 '+FAST_BPM+'번)에서 셋잇단음과 당김음을 0.04초 안으로 맞춰요',kind:'rhythm',conds:[{field:'level',min:3},{field:'bpm',min:FAST_BPM},{field:'hit',min:80},{field:'value',max:40}]}]}
];
const STEPS=5;
const skillOfId=id=>SKILLS.find(a=>a.id===id)||null;
/** Guardrail on the table itself: no criterion rewards being louder (a `min` on a loudness field). */
const LOUD=/^(db|dbfs|lufs|loud|loudness|volume|level_db|peak|max)$/i;
const tableIsSafe=()=>SKILLS.every(a=>a.steps.length===STEPS&&a.steps.every(s=>s.conds.length>0&&s.conds.every(c=>!LOUD.test(c.field))));

/* ---------- measures ---------- */
/** A measure as kept in a set's item, or null when it cannot be used. The guardrails are here. */
function cleanMeasure(m){
  if(!isObj(m)||typeof m.area!=='string'||!m.area||m.area.length>40||!fin(m.value))return null;
  // No step for volume: a loudness reading is never a measure.
  if(LOUD.test(String(m.unit||''))||LOUD.test(String(m.kind||'')))return null;
  // 음역 · 고음: only notes held comfortably (RULES.comfortSeconds or longer); a single highest or loudest note never counts.
  if(skillOfId(m.area)?.comfort&&!(m.peak!==true&&fin(m.seconds)&&m.seconds>=RULES.comfortSeconds))return null;
  return {...m};
}
/**
 * What a hold step of 오늘의 연습 measured (app/daily-set-run.js calls it with the exercise and its notes:
 * [{midi, ok, held, sd, octave?}]). The exercise says which areas it measures (CATALOG `measure`).
 *   음정   how many of the notes were held inside the tolerance for the whole hold
 *   지속음  the wobble of the held notes (their middle value), with the hold's length
 *   음역   the lowest and highest note held comfortably (as sung: an octave under or over counts as that octave)
 */
function fromHold(exercise,notes){
  const e=exercise||{},areas=list(e.measure),all=list(notes).filter(n=>isObj(n)&&Number.isInteger(n.midi)&&fin(n.held)),out=[];
  if(!all.length||!areas.length)return out;
  const ok=all.filter(n=>n.ok===true);
  if(areas.includes('pitch'))out.push({area:'pitch',kind:'hold',value:ok.length,of:all.length,unit:'개',hold:Number(e.hold)||0,tolerance:Number(e.tolerance)||0});
  if(areas.includes('sustain')){
    const sds=ok.map(n=>n.sd).filter(fin);
    if(sds.length)out.push({area:'sustain',kind:'longtone',value:round1(median(sds)),unit:'cent',hold:Number(e.hold)||0,count:sds.length,of:all.length});
  }
  if(areas.includes('range')){
    const held=all.filter(n=>n.held>=RULES.comfortSeconds).map(n=>n.midi+12*(Number.isInteger(n.octave)?n.octave:0));
    if(held.length){const low=Math.min(...held),high=Math.max(...held);out.push({area:'range',kind:'comfortable',value:high-low,unit:'반음',low,high,seconds:RULES.comfortSeconds,count:new Set(held).size});}
  }
  return out;
}
/** Every usable measure of the finished items of the sets up to `today`, oldest first: {…measure, date, at}. */
function measurements(db={},{today=''}={}){
  const out=[];
  for(const p of live(db,'practices')){
    if(!isObj(p.dailySet)||!isDate(p.date)||(today&&p.date>today))continue;
    for(const item of list(p.dailySet.items)){
      if(!isObj(item)||item.state!=='done')continue;
      for(const raw of list(item.measures)){const m=cleanMeasure(raw);if(m)out.push({...m,date:p.date,at:Number(p.created)||0,exercise:String(item.exercise||'')});}
    }
  }
  return out.sort((a,b)=>a.date.localeCompare(b.date)||a.at-b.at);
}
const validBase=b=>isObj(b)&&Number.isInteger(b.low)&&Number.isInteger(b.high)&&b.high>=b.low;
/** Everything the skill questions need, worked out once. */
function context(db={},env={}){
  const today=isDate(env.today)?env.today:ymd(new Date()),st=stateRow(db),byArea=new Map(),earned=new Map();
  for(const m of measurements(db,{today})){if(!byArea.has(m.area))byArea.set(m.area,[]);byArea.get(m.area).push(m);}
  for(const r of live(db,'practicePlans')){
    if(r.kind!==STEP_KIND||!skillOfId(r.area)||!Number.isInteger(r.step)||r.step<1||r.step>STEPS)continue;
    if(!earned.has(r.area))earned.set(r.area,new Map());
    earned.get(r.area).set(r.step,r);
  }
  /** The day an area was first measured: the stored day when it is earlier (a deleted record does not move it). */
  const first=id=>{const kept=st?.first?.[id],seen=byArea.get(id)?.[0]?.date||'';return isDate(kept)&&(!seen||kept<=seen)?kept:seen;};
  /** 음역 baseline: the comfortable range of the first week ({low, high, from, to, closed}); null before any measure. */
  const base=(()=>{
    if(validBase(st?.rangeBase))return {...st.rangeBase,closed:true};
    const from=first('range');if(!from)return null;
    const to=shift(from,RULES.baselineDays-1),week=(byArea.get('range')||[]).filter(m=>m.date<=to&&Number.isInteger(m.low)&&Number.isInteger(m.high));
    return week.length?{low:Math.min(...week.map(m=>m.low)),high:Math.max(...week.map(m=>m.high)),from,to,closed:today>to}:null;
  })();
  /** A measure with the fields worked out here (음역: `gain`, semitones beyond the first week's range). */
  const fields=m=>m.area==='range'&&Number.isInteger(m.low)&&Number.isInteger(m.high)?
    {...m,gain:base&&base.closed&&m.date>(base.to||'')?Math.max(0,m.high-base.high)+Math.max(0,base.low-m.low):0}:m;
  const meets=(step,m)=>(!step.kind||step.kind===m.kind)&&step.conds.every(c=>{const v=m[c.field];return fin(v)&&(c.min==null||v>=c.min)&&(c.max==null||v<=c.max);});
  /** The different days on which step n of an area was met, oldest first: [{date, value, unit}]. */
  const daysMet=(a,n)=>{
    const step=a.steps[n-1],seen=new Map();if(!step)return [];
    for(const raw of byArea.get(a.id)||[]){const m=fields(raw);if(!seen.has(m.date)&&meets(step,m))seen.set(m.date,{date:m.date,value:m.value,unit:String(m.unit||a.unit||'')});}
    return [...seen.values()];
  };
  const stepOf=id=>Math.max(0,...(earned.get(id)?.keys()||[]));
  return {today,state:st,byArea,earned,first,base,fields,meets,daysMet,stepOf};
}
const RHYTHM_WORDS={1:'4분음표',2:'8분음표·쉼표',3:'셋잇단·당김음'};
/** A measure in plain words. */
function valueText(a,m){
  if(m.area==='pitch'&&m.kind==='hold'&&fin(m.of))return m.of+'개 중 '+m.value+'개 유지';
  if(m.area==='sustain')return '흔들림 '+m.value+' cent'+(m.hold?' · '+m.hold+'초':'');
  if(m.area==='range'&&Number.isInteger(m.low)&&Number.isInteger(m.high))return noteName(m.low)+'–'+noteName(m.high)+' · '+m.count+'개 음'+(m.gain>0?' · 처음보다 +'+m.gain+'반음':'');
  if(m.area==='breath'&&m.kind==='hiss')return '가장 긴 스 '+m.value+'초'+(fin(m.even)?' · 세기 흔들림 '+m.even+' dB':'');
  if(m.area==='rhythm'&&m.kind==='rhythm')return (RHYTHM_WORDS[m.level]||'리듬')+(fin(m.bpm)?' '+m.bpm+'박':'')+' · 박자와 '+m.value+' ms'+(fin(m.hit)?' · '+m.hit+'% 맞춤':'');
  if(m.area==='vibrato'&&m.kind==='vibrato')return m.value>0&&fin(m.rate)?'비브라토 '+m.value+'초 · 1초에 '+m.rate+'번 · 폭 '+m.extent+' cent'+(m.cued?' · 신호에 맞춤':''):'비브라토가 아직 안 보였어요';
  return m.value+(m.unit||a.unit?' '+(m.unit||a.unit):'');
}
/**
 * One area. {id, title, sub, line, unit, note, limit (what cannot be measured yet, said plainly), by (exercise ids that measure it now), soon,
 *   state: 'soon' (no measuring exercise yet) | 'ready' (can be measured, not yet) | 'calibrating' | 'step',
 *   first, day (n일째), daysLeft (of 기준 맞추는 중), estimate (what the draft table gives on the records so far),
 *   step (earned, 0–5), keeping (요즘도 유지 중; null without a step), earned:[{step, date, days}],
 *   next: {step, say, soon, count (different days met, at most RULES.days), need, days, due (met, awarded at the next
 *          finished set)} | null,
 *   recent:[{date, text}], steps:[{step, say, soon, state:'earned'|'next'|'later', date}], measured (days)}
 */
function areaOf(c,a){
  const ms=c.byArea.get(a.id)||[],first=c.first(a.id),step=c.stepOf(a.id),rows=c.earned.get(a.id)||new Map();
  const day=first?dayNumber(c.today)-dayNumber(first)+1:0,calibrating=!!first&&step===0&&day<=RULES.calibrationDays;
  // "재는 연습 준비 중" for a step: its own exercise is still to come (and it was never met), or the area has none at all yet.
  const soonOf=(s,n)=>s.soon?(c.daysMet(a,n).length?'':s.soon):(!a.by.length&&!ms.length?a.soon||'':'');
  const dates=[...new Set(ms.map(m=>m.date))];
  // What the draft table gives so far: the highest step met on three different days (on every measured day while there are fewer).
  let estimate=0;
  for(let n=1;n<=STEPS;n++){if(c.daysMet(a,n).length>=Math.min(RULES.days,Math.max(1,dates.length))&&dates.length)estimate=n;else break;}
  const nextStep=step<STEPS?a.steps[step]:null,met=nextStep?c.daysMet(a,step+1):[];
  const next=nextStep?{step:step+1,say:nextStep.say,soon:soonOf(nextStep,step+1),count:Math.min(RULES.days,met.length),need:RULES.days,
    days:met.slice(0,RULES.days),due:!calibrating&&!!first&&met.length>=RULES.days}:null;
  const since=shift(c.today,-(RULES.keepDays-1));
  const keeping=step?ms.some(m=>m.date>=since&&c.meets(a.steps[step-1],c.fields(m))):null;
  // Recent values, newest first: the last measure of each kind on each day.
  const seen=new Set(),recent=[];
  for(const raw of ms.slice().reverse()){const key=raw.date+'|'+(raw.kind||'');if(seen.has(key))continue;seen.add(key);recent.push({date:raw.date,text:valueText(a,c.fields(raw)),value:raw.value});if(recent.length>=RULES.recent)break;}
  return {id:a.id,title:a.title,sub:a.sub||'',line:a.line,how:a.how||'',unit:a.unit,note:a.note||'',limit:a.limit||'',by:a.by.slice(),soon:a.soon||'',
    state:step?'step':first?(calibrating?'calibrating':'step'):a.by.length?'ready':'soon',
    first,day,daysLeft:calibrating?RULES.calibrationDays-day+1:0,estimate,step,keeping,measured:dates.length,
    earned:[...rows.values()].sort((x,y)=>x.step-y.step).map(r=>({step:r.step,date:isDate(r.earned)?r.earned:'',days:list(r.days)})),
    next,recent,
    steps:a.steps.map((s,i)=>({step:i+1,say:s.say,soon:soonOf(s,i+1),state:i<step?'earned':i===step?'next':'later',date:isDate(rows.get(i+1)?.earned)?rows.get(i+1).earned:''})),
    base:a.id==='range'&&c.base?{low:c.base.low,high:c.base.high,closed:!!c.base.closed}:null};
}
/** All eight areas, in the table's order. */
function skills(db={},env={}){const c=context(db,env);return SKILLS.map(a=>areaOf(c,a));}
function skill(db={},id,env={}){const a=skillOfId(id);return a?areaOf(context(db,env),a):null;}
/**
 * The steps that can be awarded now: [{area, title, step, earned, days}]. None while an area is in 기준 맞추는 중; a
 * step only after the one under it. Days measured during 기준 맞추는 중 count, so awarding starts by itself when the
 * window ends.
 */
function awardable(db={},env={}){
  const c=context(db,env),out=[];
  for(const a of SKILLS){
    const first=c.first(a.id);if(!first)continue;
    const opens=shift(first,RULES.calibrationDays);if(c.today<opens)continue;
    for(let n=c.stepOf(a.id)+1;n<=STEPS;n++){
      const days=c.daysMet(a,n);if(days.length<RULES.days)break;
      const three=days.slice(0,RULES.days),last=three.at(-1).date;
      out.push({area:a.id,title:a.title,step:n,earned:last<opens?opens:last,days:three});
    }
  }
  return out;
}
/** Write the steps that can be awarded now (call inside VZ.change). Returns the new ones. A stored row is never changed. */
function award(db,env={},{now=Date.now()}={}){
  const fresh=awardable(db,env);if(!fresh.length)return [];
  db.practicePlans||=[];
  const out=[];
  for(const x of fresh){
    const id=STEP_PREFIX+x.area+':'+x.step;if(db.practicePlans.some(p=>p&&p.id===id))continue;
    db.practicePlans.push({id,kind:STEP_KIND,v:1,area:x.area,step:x.step,earned:x.earned,days:x.days,created:now});out.push(x);
  }
  return out;
}

/* ---------- the kept state ---------- */
/** The level-state row as it should be now, and whether that differs from what is stored. */
function nextState(db={},env={}){
  const c=context(db,env),old=c.state,lv=level(db,env),was=reachedOf(old),now=Math.max(was,lv.derived);
  const reached={...(isObj(old?.reached)?old.reached:{})},first={...(isObj(old?.first)?old.first:{})};
  for(let n=was+1;n<=now;n++)reached[n]=c.today;
  for(const a of SKILLS){const d=c.first(a.id);if(d&&first[a.id]!==d)first[a.id]=d;}
  const base=validBase(old?.rangeBase)?old.rangeBase:c.base?.closed?{low:c.base.low,high:c.base.high,from:c.base.from,to:c.base.to}:null;
  const row={...(old||{}),id:STATE_ID,kind:STATE_KIND,v:1,level:now,reached,first,...(base?{rangeBase:base}:{})};
  return {row,changed:keptText(old)!==keptText(row),level:now,raised:now>was};
}
const sorted=o=>Object.entries(isObj(o)?o:{}).sort(([a],[b])=>a.localeCompare(b));
/** What the state row holds, as text (a missing row holds nothing: level 1). */
const keptText=r=>JSON.stringify([reachedOf(r),sorted(r?.reached),sorted(r?.first),validBase(r?.rangeBase)?[r.rangeBase.low,r.rangeBase.high]:null]);
/** Keep the reached level, the first-measured days and the 음역 baseline (call inside VZ.change). Returns true when written. */
function keep(db,env={},{now=Date.now()}={}){
  const next=nextState(db,env);if(!next.changed)return false;
  db.practicePlans||=[];
  const at=db.practicePlans.findIndex(p=>p&&p.id===STATE_ID),row={...next.row,updated:now};
  if(at<0)db.practicePlans.push(row);else db.practicePlans[at]=row;
  return true;
}

/* ====================================================================================================
 * 3. 선생님 지적 배지
 * ==================================================================================================== */
/** 레슨 지적 retired as 이제 됐어요 / 몸에 붙었어요, newest first: [{id, text, songId, song, date}]. */
function badges(db={}){
  const songs=new Map(live(db,'songs').map(s=>[s.id,String(s.title||'')]));
  return live(db,'scoreAnnotations').filter(r=>r.kind==='score-point'&&Number(r.retired)>0&&typeof r.text==='string'&&r.text.trim())
    .sort((a,b)=>Number(b.retired)-Number(a.retired))
    .map(r=>({id:r.id,text:r.text.trim(),songId:r.songId||'',song:songs.get(r.songId)||'',date:ymd(new Date(Number(r.retired)))}));
}

/* ====================================================================================================
 * 4. 기준표 (plain text, for the teacher and for calibration: numbers only, no ids, no names)
 * ==================================================================================================== */
function sheetText(db={},env={}){
  const lv=level(db,env),areas=skills(db,env),L=[];
  L.push('VOCAL.zip 단계 기준표 (첫 초안 · 기준을 맞춰 가는 중)',lv.today.date+' 기준','');
  L.push('■ 큰 단계 — 꾸준함만 봐요 (실력과 무관)');
  L.push('지금: Lv '+lv.level+' · '+lv.name+' · '+lv.points+'점'+(lv.next==null?'':' · 다음 단계까지 '+lv.toNext+'점'));
  L.push('오늘: '+lv.today.points+'점'+(lv.today.parts.length?' ('+lv.today.parts.map(p=>p.text+' +'+p.points).join(', ')+')':''));
  L.push('점수:');
  for(const [what,points] of HOW)L.push('  - '+what+': '+points);
  L.push('  - 하루 최대 '+POINTS.dayCap+'점. 연습 시간과 녹음 길이는 점수가 아니에요.');
  L.push('단계가 시작되는 점수: '+LEVELS.map(x=>'Lv'+x.n+' '+levelStart(x.n)).join(' · '));
  L.push('이름: '+LEVELS.map(x=>'Lv'+x.n+' '+x.name).join(' · '),'');
  L.push('■ 기본기 단계 — 오늘의 연습에서 목소리만으로 하는 연습으로 재요');
  L.push('규칙: 기준을 서로 다른 '+RULES.days+'일에 채우면 그 단계가 돼요. 한 번 된 단계는 내려가지 않아요.');
  L.push('      최근 '+RULES.keepDays+'일 안에 한 번 더 채우면 "요즘도 유지 중"이에요. 처음 재고 '+RULES.calibrationDays+'일 동안은 기준 맞추는 중이라 단계를 정하지 않아요.');
  L.push('      음역·고음은 편하게 '+RULES.comfortSeconds+'초 넘게 유지한 음만 세요 (가장 높은 한 음, 큰 소리는 세지 않아요). 소리 크기로 주는 단계는 없어요.','');
  for(const a of areas){
    const now=a.state==='soon'?'재는 연습을 준비 중':a.state==='ready'?'아직 재지 않았어요':a.state==='calibrating'?'기준 맞추는 중 · '+a.day+'일째'+(a.estimate?' · 지금 기록으로는 '+a.estimate+'단계쯤':''):
      (a.step?a.step+'단계'+(a.keeping?' · 요즘도 유지 중':''):'아직 1단계 전');
    L.push('['+a.title+(a.sub?'('+a.sub+')':'')+'] '+now);
    for(const s of a.steps)L.push('  '+s.step+'단계: '+s.say+(s.state==='earned'?'  ✓'+(s.date?' '+s.date:''):'')+(s.soon?'  (재는 연습 준비 중)':''));
    if(a.next&&a.state!=='soon'&&!a.next.soon)L.push('  다음 '+a.next.step+'단계: '+RULES.days+'번 중 '+a.next.count+'번 했어요');
    if(a.limit)L.push('  '+a.limit);
    if(a.base)L.push('  처음 음역: '+noteName(a.base.low)+'–'+noteName(a.base.high)+(a.base.closed?'':' (첫 주, 재는 중)'));
    if(a.recent.length)L.push('  내 기록: '+a.recent.map(r=>shortDay(r.date)+' '+r.text).join(' / '));
    L.push('');
  }
  L.push('선생님 지적 배지: '+badges(db).length+'개');
  return L.join('\n');
}

return {POINTS,LEVELS,HOW,PART_WORDS,RULES,SKILLS,STEPS,VIB,FAST_BPM,STATE_ID,STATE_KIND,STEP_KIND,STEP_PREFIX,
  levelStart,levelOf,ledger,dayPoints,level,stateRow,nextState,keep,
  tableIsSafe,cleanMeasure,fromHold,measurements,skills,skill,awardable,award,valueText,
  badges,sheetText,noteName,shift,dayNumber};
});
