/* 오늘의 연습 — today's ONE set, built for the day (pure model: no DOM, storage or network; also loaded by Node tests).
 * It evolves 오늘 연습 세트 (app/practice-set-model.js): the session, the clock, the time rules and the goal rows are
 * that model's; this file decides WHAT is in today's set and how its result is kept.
 *
 * Order of a day's set:
 *   1. 숙제 · 놓친 레슨 지적 from 다음 연습 (app/growth-next-model.js), at most NEXT_MAX in total. A homework that is
 *      already one of today's goals is that goal's step moved to the front (so finishing it checks the goal).
 *   2. One exercise from each built-in group the person keeps on, in GROUPS order (목 풀기 → 호흡 → 발성 → 음감 → 리듬; a
 *      group is added by adding it to GROUPS and its exercises to CATALOG). Inside a group the exercises left ON
 *      rotate by the date: the same day always gives the same one, and none repeats until the list is through.
 *   3. The person's own steps from 오늘 연습 세트 (today's goals and 반복 목표, what a saved 요일/기본 세트 holds). One
 *      tagged for a group (prefs.replace) takes that group's place instead.
 *   4. 곡 (the group SONG, on unless turned off in 고르기), as 오늘 연습 세트 always ended: ONE automatic step
 *      "곡에 적용하기 · <곡>" — the running monthly plan's song, else the latest practised song; left out when a goal or
 *      a homework of today's set already covers a song — and then the optional 녹음 step.
 *   Optional: a 30-second take before the first and after the last step (prefs.recording).
 *
 * WHERE THINGS ARE KEPT — no new list, only rows of lists that already sync:
 *   practicePlans  {id:'daily-set-prefs', kind:'daily-set-prefs', off, groupsOff, replace, recording, recordSongId,
 *                   phrase, comfort}                       what 오늘의 연습 고르기 holds
 *   practices      {id:'practice-set:<sessionId>', practiceSetId, practiceTimeSource:'practice-set', dailySet:{v, minutes,
 *                   items, recording}}                     ONE row per finished set: real active minutes and, per item,
 *                                                          done/skipped, seconds, hold seconds and accuracy, the
 *                                                          wobble (sd, cent) of each held note, and `measures`
 *                                                          ([{area, kind, value, unit, …}]) for 기본기 단계
 *   A finished goal step still writes that goal's single row 'goal:<goalId>' and a song section its own song row
 *   (app/practice-set-model.js save), so time is never counted twice and a song keeps its minutes.
 * Time: only seconds the runner was active on a step (or minutes typed for an own step); a recording's length never. */
(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const req=(path,name)=>node?require(path):root[name];
  const api=factory({set:()=>req('./practice-set-model.js','VzipPracticeSet'),next:()=>req('./growth-next-model.js','VzipGrowthNext'),
    routines:()=>req('./goal-routines.js','VzipGoalRoutines')});
  if(node)module.exports=api;else root.VzipDailySet=api;
})(typeof self!=='undefined'?self:globalThis,dep=>{
'use strict';
const list=v=>Array.isArray(v)?v:[];
const isDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v);
const live=(db,key)=>{const gone=new Set(list(db?.deleted?.[key]).map(String));return list(db?.[key]).filter(x=>x&&typeof x==='object'&&!gone.has(String(x.id)));};
const dayNumber=date=>Math.round(Date.UTC(+date.slice(0,4),+date.slice(5,7)-1,+date.slice(8,10))/86400000);
const round3=n=>Math.round(n*1000)/1000;
const NEXT_MAX=2,NEXT_MINUTES=3,TAKE_SECONDS=30,MAX_STEPS=12;
const PREFS_ID='daily-set-prefs',PREFS_KIND='daily-set-prefs';

/** Built-in groups, in the order of a set. A group is one more line here plus its exercises below (리듬 came that way). */
const GROUPS=[
  {id:'loosen',title:'목 풀기',line:'몸과 목의 힘을 풀어요'},
  {id:'breath',title:'호흡',line:'숨을 고르게 길게 써요'},
  {id:'voice',title:'발성',line:'편한 소리를 길게 이어요'},
  {id:'ear',title:'음감',line:'들은 음을 그대로 내요'},
  {id:'rhythm',title:'리듬',line:'박자에 맞춰 소리를 내요'}
];
/** Built-in exercises as data: {id, group, title, why (one line), minutes (planned), mic, mode, …mode fields}.
 * mode 'timed'  steps:[{text, seconds}]                         a line to follow and a countdown
 *      'breath' inhale, outs:[seconds…], rest, sound           paced breathing; `measure` is the hook for the measured
 *                                                              "스" length of a later version (null = not measured)
 *      'follow' pattern (semitones from 도), keys, beat, sing   the app plays the pattern, then it is your turn
 *      'hold'   offsets | count (notes from the comfortable range), hold (s), tolerance (cent), syllable
 *                                                              the app plays a note; hold it inside the tolerance
 *               measure:[area…]                                the 기본기 areas its result is a measure of
 *                                                              (app/levels-model.js fromHold; needs the mic)
 * The measuring exercises of 호흡 · 리듬 · 비브라토 (the numbers: app/daily-measure-model.js; needs the mic, a timer
 * without it, then nothing is measured):
 *      'hiss'    tries, inhale                                  one “스~” as long as possible, its length and evenness
 *      'rhythm'  (rounds from the 리듬 step reached)            listen to a bar of “타”, say it back on the next bar
 *      'vibrato' offsets, hold, cue, syllable                   an 8-second tone: straight, then vibrato on the cue
 *      'scale'   syllable                                       a scale (or the arpeggio from 음정 4단계) sung back to the
 *                                                              beat, the key rising a semitone a round (음정 · 음역)
 *      'siren'   tries, hold, syllable                          a glide up and back down (소리 길)
 * 'hold' with tops:[semitones from the top of the comfortable range…] and vowels:[…] is 고음 (맨 위 음 유지).
 * adapt: 'sustain' | 'vibrato' — the exercise grows with the area's step (adapt() below). */
const CATALOG=[
  {id:'loosen-neck',group:'loosen',title:'목·어깨 풀기',why:'목과 어깨 힘이 풀리면 소리가 훨씬 편하게 나와요',minutes:3,mic:false,mode:'timed',
    steps:[{text:'어깨를 귀까지 올렸다가 툭 떨어뜨려요',seconds:55},{text:'고개를 천천히 좌우로 기울여요',seconds:55},{text:'입을 크게 벌려 하품하듯 목 안을 열어요',seconds:55}]},
  {id:'loosen-liptrill',group:'loosen',title:'립트릴',why:'입술을 떨면 목에 힘을 주지 않고 숨을 흘려보낼 수 있어요',minutes:3,mic:false,mode:'timed',
    steps:[{text:'입술을 가볍게 붙이고 “부르르” 떨어요',seconds:55},{text:'떨면서 낮은 음에서 높은 음으로 천천히 올라가요',seconds:55},{text:'높은 음에서 낮은 음으로 미끄러지듯 내려와요',seconds:55}]},
  {id:'loosen-siren',group:'loosen',title:'사이렌',why:'낮은 음에서 높은 음까지 미끄러지듯 이으면 소리 길이 부드럽게 열려요',minutes:3,mic:true,mode:'siren',
    tries:3,hold:10,syllable:'우~',text:'“우~”로 낮은 음에서 높은 음까지 미끄러지듯 올라갔다 내려와요',measure:['path']},
  {id:'loosen-hum',group:'loosen',title:'허밍',why:'작은 허밍은 목을 부드럽게 깨워 줘요',minutes:3,mic:false,mode:'timed',
    steps:[{text:'입을 다물고 편한 음으로 “음~” 해요',seconds:55},{text:'코와 입술이 간질간질 울리는지 느껴 봐요',seconds:55},{text:'“음~”으로 아는 노래 한 줄을 흥얼거려요',seconds:55}]},
  {id:'breath-s',group:'breath',title:'“스~” 길게 내쉬기',why:'숨을 고르게 오래 내쉴수록 긴 소절이 편해져요',minutes:3,mic:false,mode:'breath',
    inhale:4,outs:[8,8,10,10,12,12,14,14,16],rest:2,sound:'스~',measure:null},
  {id:'breath-pulse',group:'breath',title:'“스, 스, 스” 끊어 내쉬기',why:'배로 숨을 끊어 쓰는 힘이 리듬 있는 노래를 받쳐 줘요',minutes:3,mic:false,mode:'timed',
    steps:[{text:'4초 들이쉬고 “스, 스, 스” 짧게 세 번 내쉬어요',seconds:50},{text:'배가 톡톡 들어가는지 손을 대고 느껴 봐요',seconds:50},{text:'“스, 스, 스, 스~” 마지막은 길게 내쉬어요',seconds:50}]},
  {id:'voice-liptrill5',group:'voice',title:'립트릴 5음',why:'입술을 떨며 음을 오르내리면 목에 힘이 덜 들어가요',minutes:3,mic:false,mode:'follow',
    pattern:[0,2,4,5,7,5,4,2,0],keys:[0,1,2,3,4,5,4,3,2,1,0],beat:.42,sing:8,text:'들은 다섯 음을 립트릴로 따라 해요'},
  {id:'voice-hum',group:'voice',title:'허밍 롱톤',why:'입을 다문 소리는 음을 맞추는 데만 집중하기 좋아요',minutes:3,mic:true,mode:'hold',
    offsets:[0,2,4,2,0],hold:4,tolerance:25,syllable:'음~',text:'들린 음을 “음~”으로 4초 동안 이어요',measure:['sustain','range']},
  {id:'voice-mum',group:'voice',title:'“멈” 롱톤',why:'“ㅁ”으로 시작하면 소리가 앞으로 모여서 편해져요',minutes:3,mic:true,mode:'hold',
    offsets:[0,3,5],hold:6,tolerance:25,syllable:'멈~',text:'들린 음을 “멈~”으로 6초 동안 이어요',measure:['sustain','range'],adapt:'sustain'},
  {id:'ear-follow',group:'ear',title:'음 따라 부르기',why:'듣고 바로 같은 음을 내는 힘이 음정의 바탕이에요',minutes:3,mic:true,mode:'hold',
    count:5,hold:4,tolerance:25,syllable:'아~',text:'들린 음을 “아~”로 4초 동안 이어요',measure:['pitch','range']},
  {id:'breath-hiss',group:'breath',title:'“스~” 길게',why:'한 번에 길고 고르게 내쉬는 숨이 긴 소절을 받쳐 줘요',minutes:2,mic:true,mode:'hiss',
    tries:2,inhale:3,text:'크게 들이쉬고 “스~”를 한 번에 최대한 길게 내쉬어요',measure:['breath']},
  {id:'voice-vibrato',group:'voice',title:'롱톤 비브라토',why:'곧게 내다가 원할 때 떨 수 있으면 긴 음 끝이 자연스러워져요',minutes:3,mic:true,mode:'vibrato',
    offsets:[0,4],hold:8,cue:4,syllable:'아~',text:'들린 음을 8초 동안 이어요. 처음엔 곧게, 신호가 울리면 떨어요',measure:['vibrato'],adapt:'vibrato'},
  {id:'voice-high',group:'voice',title:'맨 위 음 유지',why:'편한 음역 맨 위를 힘주지 않고 내는 연습이 고음을 편하게 해 줘요',minutes:2,mic:true,mode:'hold',
    tops:[-3,-1,0,0,0],vowels:['아~','아~','아~','에~','이~'],hold:2,tolerance:25,syllable:'아~',text:'들린 음을 힘주지 않고 2초 동안 이어요. 목이 불편하면 건너뛰어요',measure:['high','range']},
  {id:'ear-scale',group:'ear',title:'스케일 따라 부르기',why:'음을 차례로 정확히 짚는 힘이 멜로디를 바르게 만들어요',minutes:3,mic:true,mode:'scale',
    syllable:'아',text:'들은 스케일을 화면의 박자에 맞춰 “아”로 따라 불러요',measure:['pitch','range']},
  {id:'rhythm-ta',group:'rhythm',title:'“타” 따라 하기',why:'박자를 듣고 제때 소리 내는 힘이 노래의 리듬을 살려요',minutes:3,mic:true,mode:'rhythm',
    text:'한 마디를 듣고, 다음 마디에 같은 리듬을 “타”로 따라 해요',measure:['rhythm']}
];
/** 곡: not a rotation of exercises but the automatic end of a set (곡에 적용하기, then the optional 녹음). */
const SONG={id:'song',title:'곡',line:'오늘 연습을 곡에 적용하고, 원하면 녹음해요'};
const groupIds=()=>GROUPS.map(g=>g.id);
const groupOf=id=>GROUPS.find(g=>g.id===id)||(id===SONG.id?SONG:null);
const exercise=id=>CATALOG.find(e=>e.id===id)||null;
const exercisesOf=group=>CATALOG.filter(e=>e.group===group);

/* ---------- 고르기 (prefs) ---------- */
const validComfort=c=>c&&Number.isInteger(c.low)&&Number.isInteger(c.high)&&c.low>=36&&c.high<=88&&c.high-c.low>=4?{low:c.low,high:c.high}:null;
function cleanPrefs(raw){
  const row=raw&&typeof raw==='object'?raw:{},off={},groupsOff={},replace={};
  for(const e of CATALOG)if(row.off?.[e.id]===true)off[e.id]=true;
  for(const g of [...GROUPS,SONG])if(row.groupsOff?.[g.id]===true)groupsOff[g.id]=true;
  // A group always keeps one exercise on (a whole group is turned off with groupsOff).
  for(const g of GROUPS){const ex=exercisesOf(g.id);if(ex.length&&ex.every(e=>off[e.id]))delete off[ex[0].id];}
  for(const [key,group] of Object.entries(row.replace&&typeof row.replace==='object'?row.replace:{}))if(groupIds().includes(group)&&key.length<=200)replace[key]=group;
  return {off,groupsOff,replace,recording:row.recording===true,recordSongId:String(row.recordSongId||''),phrase:String(row.phrase||'').trim().slice(0,80),comfort:validComfort(row.comfort)};
}
/** What 고르기 holds (defaults: everything on, no recording). */
const prefs=db=>cleanPrefs(live(db,'practicePlans').find(p=>p.id===PREFS_ID&&p.kind===PREFS_KIND));
/** Turn one exercise on or off. Throws when it would leave its group (still on) with none. */
function setExercise(pf,id,on){
  const e=exercise(id);if(!e)throw Error('연습을 찾지 못했어요.');
  const off={...pf.off};
  if(on)delete off[id];else{
    if(exercisesOf(e.group).every(x=>x.id===id||off[x.id]))throw Error('그룹마다 하나는 켜 두어야 해요. 그룹을 통째로 쉬려면 그룹 스위치를 꺼 주세요.');
    off[id]=true;
  }
  return {...pf,off};
}
function setGroup(pf,group,on){
  if(!groupOf(group))throw Error('그룹을 찾지 못했어요.');
  const groupsOff={...pf.groupsOff};if(on)delete groupsOff[group];else groupsOff[group]=true;
  return {...pf,groupsOff};
}
/** Write 고르기 (call inside VZ.change). `next` is a whole prefs object; {} is 처음대로. */
function savePrefs(db,next){
  const clean=cleanPrefs(next);
  db.practicePlans||=[];
  const at=db.practicePlans.findIndex(p=>p&&p.id===PREFS_ID),row={...(at<0?{}:db.practicePlans[at]),id:PREFS_ID,kind:PREFS_KIND,v:1,...clean};
  if(at<0)db.practicePlans.push(row);else db.practicePlans[at]=row;
  return clean;
}
/** 처음대로: everything on again. The comfortable range, the recording choice and tags are the person's own answers and stay. */
const resetPrefs=pf=>({...pf,off:{},groupsOff:{}});
/** The exercises of a group that are in rotation. */
const rotation=(pf,group)=>exercisesOf(group).filter(e=>!pf.off[e.id]);
/** The exercise of a group on a date: the ON list, one step per day. */
function pick(pf,group,date){
  const on=rotation(pf,group);
  return on.length?on[((dayNumber(date)%on.length)+on.length)%on.length]:null;
}

/* ---------- today's set ---------- */
/** A stable name for one of the person's own steps (what a 그룹 대신 tag is kept under), '' when it has none. */
function ownKey(db,step){
  if(step.planId)return 'plan:'+step.planId;
  if(step.added&&step.songId)return 'song:'+step.songId+':'+(step.segmentStart??'')+'-'+(step.segmentEnd??'');
  if(step.goalId){
    const goal=live(db,'dailyGoals').find(g=>g.id===step.goalId),routine=goal&&dep.routines()?.routineOf?.(goal);
    if(routine)return 'routine:'+routine;
  }
  return '';
}
const exerciseStep=e=>({kind:'exercise',id:'ex-'+e.id,exercise:e.id,group:e.group,title:e.title,why:e.why,minutes:e.minutes,mic:!!e.mic});
/** 숙제 and 놓친 레슨 지적 for today: one of each first, then more of either, NEXT_MAX in all. */
function nextItems(db,today){
  const N=dep.next();if(!N)return [];
  let homework=[],points=[];
  try{homework=N.fromHomework(db,{today});}catch{}
  try{points=N.fromLessonPoints(db,{today});}catch{}
  const out=[homework[0],points[0]].filter(Boolean);
  for(const x of [...homework.slice(1),...points.slice(1)])if(out.length<NEXT_MAX)out.push(x);
  return out.slice(0,NEXT_MAX);
}
const APPLY='곡에 적용하기 · ';
/** The automatic song step of 오늘 연습 세트 (not a section the person added). */
const autoSong=s=>s.kind==='song'&&!s.added;
/** The person's own steps of 오늘 연습 세트 that stay in 오늘의 연습: everything, with two rules. The automatic warm-up
 * gives way to the built-in groups (it stays when 목 풀기·호흡·발성 all rest). The automatic song step is named
 * "곡에 적용하기 · <곡>"; it and the 녹음 step leave when 곡 is turned off in 고르기. */
function ownSteps(set,pf){
  const warm=['loosen','breath','voice'].some(g=>!pf.groupsOff[g]);
  return set.steps.filter(s=>{
    if(s.kind==='warmup'&&!s.first)return !warm;
    if(pf.groupsOff[SONG.id]&&(s.kind==='record'||autoSong(s)))return false;
    return true;
  }).map(applyStep);
}
const applyStep=s=>autoSong(s)&&String(s.title).startsWith('곡 구간 · ')?{...s,apply:true,title:APPLY+String(s.title).slice(7)}:s;
/**
 * Today's set. options: {today, recentSongId?, template?}. Returns {steps, own (the person's steps, as the set editor
 * lists them), base (오늘 연습 세트 defaults, for the editor), template, prefs, minutes}.
 * options.own: the person's steps as edited on the set screen (then they are used instead of today's defaults).
 */
function build(db={},options={}){
  const P=dep.set(),{today}=options;
  if(!isDate(today))throw Error('오늘 날짜를 확인해 주세요.');
  const pf=prefs(db),set=P.build(db,options);
  let own=Array.isArray(options.own)?options.own.map(s=>({...s})):ownSteps(set,pf);
  const lead=[];
  for(const x of nextItems(db,today)){
    if(x.source==='homework'){
      const id=x.action.assignmentId,at=own.findIndex(s=>s.assignmentId===id);
      if(at>=0)lead.push({...own.splice(at,1)[0],lead:true,why:x.why});
      else lead.push({kind:'next',source:'homework',id:'next-hw-'+id,assignmentId:id,title:x.title,why:x.why,minutes:NEXT_MINUTES,...(x.songId?{songId:x.songId}:{})});
    }else{
      const a=x.action;
      lead.push({kind:'next',source:'lesson-point',id:'next-lp-'+a.pointId,pointId:a.pointId,title:x.title,why:x.why,minutes:NEXT_MINUTES,...(a.songId?{songId:a.songId}:{}),...(a.href?{href:a.href}:{})});
    }
  }
  // A homework of today's set that is about a song already covers "곡에 적용하기"; a 녹음 step left without its song goes too.
  if(lead.some(s=>s.source==='homework'&&s.songId)){
    own=own.filter(s=>!autoSong(s));
    const songs=new Set([...lead,...own.filter(s=>s.kind!=='record')].map(s=>s.songId).filter(Boolean));
    own=own.filter(s=>s.kind!=='record'||songs.has(s.songId));
  }
  const groups=[];
  for(const g of GROUPS){
    if(pf.groupsOff[g.id])continue;
    const tagged=own.filter(s=>pf.replace[ownKey(db,s)]===g.id);
    if(tagged.length){own=own.filter(s=>!tagged.includes(s));groups.push(...tagged.map(s=>({...s,group:g.id,replaces:g.id})));continue;}
    const e=pick(pf,g.id,today);
    if(e)groups.push(exerciseStep(e));
  }
  const takes=pf.recording?[{kind:'take',id:'take-before',slot:'before',title:'연습 전 30초 녹음',minutes:1,mic:true,optional:true,songId:pf.recordSongId,phrase:pf.phrase},
    {kind:'take',id:'take-after',slot:'after',title:'연습 후 30초 녹음',minutes:1,mic:true,optional:true,songId:pf.recordSongId,phrase:pf.phrase}]:[];
  const room=MAX_STEPS-takes.length,fixed=[...lead,...groups].slice(0,room);
  const body=P.normalize([...fixed,...own.slice(0,Math.max(0,room-fixed.length))]);
  const steps=takes.length?[...P.normalize([takes[0]]),...body,...P.normalize([takes[1]])]:body;
  return {steps,own:body.filter(isOwn),base:set.base,template:set.template,prefs:pf,minutes:totalMinutes(steps)};
}
/** A step the person manages on the set screen (minutes, remove, order) — not one 고르기 or 다음 연습 puts in. */
const isOwn=s=>!['exercise','next','take'].includes(s.kind);
const totalMinutes=steps=>list(steps).reduce((n,s)=>n+(Number(s.minutes)||0),0);
/** How a step is run: its exercise's mode, 'take' for the 30-second recording, 'free' (a plain timer) otherwise. */
const modeOf=s=>s.kind==='exercise'?exercise(s.exercise)?.mode||'free':s.kind==='take'?'take':'free';
const SOURCE={homework:'숙제',personal:'개인',recommendation:'추천','lesson-point':'레슨 지적'};
const KIND={warmup:'웜업',goal:'오늘의 목표',song:'곡 구간',record:'녹음',take:'녹음'};
/** The small word in front of a step: its group, where it came from, or its kind. */
function labelOf(s){
  if(s.kind==='exercise'||s.replaces)return groupOf(s.group)?.title||'연습';
  if(s.apply)return SONG.title;
  if(s.kind==='next')return SOURCE[s.source]||'다음 연습';
  if(s.first)return '시작 체크';
  if(s.kind==='goal')return s.routine?(s.source==='homework'?'숙제 · 매일 반복':'매일 반복'):SOURCE[s.source]||'목표';
  return KIND[s.kind]||'연습';
}
/** "곡 구간 · X" reads as "X" next to its label. */
const shortTitle=s=>{const k=KIND[s.kind];return k&&String(s.title).startsWith(k+' · ')?String(s.title).slice(k.length+3):String(s.title);};
/**
 * The vertical timeline of a set. steps: a built set's steps, or a session's (then `session` gives the states):
 * state 'done' | 'skipped' | 'next' (the one to do now) | 'left'.
 */
function timeline(steps,session=null){
  const run=!!session&&session.phase!=='summary';
  return list(steps).map((s,i)=>({id:s.id,title:shortTitle(s),label:labelOf(s),minutes:Number(s.minutes)||0,mic:!!s.mic,optional:!!s.optional,
    state:!session?(i===0?'next':'left'):s.skipped?'skipped':s.done?'done':run&&i===session.index?'next':'left'}));
}
const progress=session=>{const n=session.steps.filter(s=>s.done||s.skipped).length;return {done:n,total:session.steps.length};};

/* ---------- running ---------- */
/**
 * Close the current step and move on (or to the summary after the last one). state 'done' | 'skipped'; result: what
 * the runner measured ({parts, holdSeconds, accuracy, notes, rounds…}). The clock stops: the next step starts it again.
 */
function finishItem(s,{state='done',result=null,now=Date.now()}={}){
  const P=dep.set(),st=s.steps[s.index];
  P.pause(s,now);
  st.result={...(st.result||{}),...(result||{}),state:state==='skipped'?'skipped':'done'};
  if(s.index===s.steps.length-1)P.end(s,now);else P.go(s,s.index+1,now);
  st.done=state!=='skipped';st.skipped=state==='skipped';
  return s;
}

/** Stop here and go to the summary: the clock stops and the step in hand is NOT marked done. */
function stop(s,now=Date.now()){dep.set().pause(s,now);s.phase='summary';delete s.overAway;return s;}

/* ---------- words and measures for the runner ---------- */
/** The word shown first for a pitch reading (cents from the target; null = no voice yet). */
function word(cents,tolerance=25){
  if(cents==null||!Number.isFinite(cents))return {key:'wait',text:'소리를 내 보세요'};
  const a=Math.abs(cents);
  if(a<=tolerance*.4)return {key:'exact',text:'딱 맞아요'};
  if(a<=tolerance)return {key:'hold',text:'그대로 유지!'};
  if(a<=100)return {key:cents>0?'high':'low',text:cents>0?'조금 높아요':'조금 낮아요'};
  return {key:cents>0?'high':'low',text:cents>0?'많이 높아요':'많이 낮아요'};
}
const GRACE=.3;
/** A fresh hold meter for one note. */
const holdStart=()=>({held:0,best:0,sung:0,inside:0,gap:0,sum:0,ok:false,run:{t:0,c:0,q:0,o:0},sd:null,octave:0});
/**
 * Add one reading to a hold meter: dt seconds at `cents` from the target (null = silence). Inside the tolerance the
 * held time grows; a slip shorter than GRACE seconds is forgiven, a longer one starts the hold again.
 * `need` seconds in one go sets ok. accuracy = time inside the tolerance / time sung.
 * For 기본기 단계 the meter also keeps, for the longest hold, how much the pitch moved in it (sd: the standard
 * deviation of its readings in cent, a forgiven slip included) and the octave it was sung in (`octave`: 0 = as
 * played, −1 = an octave under — the reading itself is folded to the nearest octave).
 */
function holdTick(h,cents,dt,{tolerance=25,need=4,octave=0}={}){
  const voiced=cents!=null&&Number.isFinite(cents),inside=voiced&&Math.abs(cents)<=tolerance,run=h.run||(h.run={t:0,c:0,q:0,o:0});
  if(voiced){h.sung+=dt;h.sum+=cents*dt;}
  if(inside){h.inside+=dt;h.held+=dt;h.gap=0;}
  else{h.gap+=dt;if(h.gap>GRACE){h.held=0;run.t=run.c=run.q=run.o=0;}}
  if(voiced&&(inside||h.held>0)){run.t+=dt;run.c+=cents*dt;run.q+=cents*cents*dt;run.o+=(Number(octave)||0)*dt;}
  if(h.held>0&&h.held>=h.best&&run.t>0){const mean=run.c/run.t;h.sd=Math.sqrt(Math.max(0,run.q/run.t-mean*mean));h.octave=Math.round(run.o/run.t);}
  h.best=Math.max(h.best,h.held);
  if(h.held>=need)h.ok=true;
  return h;
}
const holdResult=h=>({ok:h.ok,held:round3(Math.min(h.best,600)),sung:round3(h.sung),accuracy:h.sung>0?Math.round(h.inside/h.sung*100):null,cents:h.sung>0?Math.round(h.sum/h.sung):null,
  ...(h.best>0&&Number.isFinite(h.sd)?{sd:Math.round(h.sd*10)/10}:{}),...(h.best>0&&h.octave?{octave:h.octave}:{})});
/** Where the comfortable range comes from, in this order: measured (the usual range of the recordings) → the 보이스
 * 체크 reference notes → the answer given once in a set. null: ask. Each: {low, high} (MIDI). */
function comfort({measured=null,voiceCheck=null,asked=null}={}){
  const m=validComfort(measured);if(m)return {...m,source:'measured'};
  if(voiceCheck&&Number.isInteger(voiceCheck.refNote)){
    const high=Number.isInteger(voiceCheck.highNote)?voiceCheck.highNote:voiceCheck.refNote+7;
    const v=validComfort({low:voiceCheck.refNote-2,high:Math.max(voiceCheck.refNote+5,Math.min(high,voiceCheck.refNote+9))});
    if(v)return {...v,source:'voice-check'};
  }
  const a=validComfort(asked);
  return a?{...a,source:'asked'}:null;
}
/** The note a 발성 exercise starts from: a little under the middle of the comfortable range. */
const baseNote=c=>Math.round(c.low+(c.high-c.low)*.35);
/** Small deterministic generator for a day's notes. */
function seeded(seed){let x=(seed*2654435761)>>>0||1;return ()=>{x^=x<<13;x>>>=0;x^=x>>>17;x^=x<<5;x>>>=0;return x/4294967296;};}
/** The target notes (MIDI) of a hold exercise on a date. */
function notesFor(e,c,date){
  if(!e||!['hold','vibrato'].includes(e.mode)||!c)return [];
  if(Array.isArray(e.tops))return e.tops.map(t=>Math.max(c.low,c.high+t));
  if(Array.isArray(e.offsets)){const base=Math.min(baseNote(c),c.high-Math.max(...e.offsets));return [...e.offsets.map(o=>Math.max(c.low,base)+o),...(Number.isInteger(e.highNote)?[Math.max(c.low,c.high+e.highNote)]:[])];}
  const low=c.low+1,high=Math.max(low+3,c.high-2),rand=seeded(dayNumber(date)+e.id.length),out=[];
  while(out.length<(e.count||5)){
    const n=low+Math.floor(rand()*(high-low+1));
    if(out.length&&(n===out.at(-1)||Math.abs(n-out.at(-1))>7))continue;
    out.push(n);
  }
  return out;
}
/** What a hold exercise's note i carries into its result: fromTop / vowel (고음), top (the 4단계 high note of 롱톤). */
function noteTags(e,i){
  if(!e)return {};
  if(Array.isArray(e.tops))return {fromTop:e.tops[i],...(e.vowels?.[i]?{vowel:String(e.vowels[i]).replace(/~$/,'')}:{})};
  if(Number.isInteger(e.highNote)&&Array.isArray(e.offsets)&&i===e.offsets.length)return {top:true};
  return {};
}
/** The syllable of note / round i. */
const syllableOf=(e,i)=>e?.vowels?.[i]||e?.syllable||'';
/**
 * An exercise as it is done at the step reached in its area (stepOf(area) → 0–5): the same id, so rotation, 고르기 and
 * the run row do not change — only what is asked grows.
 *   'sustain' (“멈” 롱톤)  6 s; 8 s once 지속음 2단계 is earned (3·4단계 ask for 8 s); and from 4단계 a last note
 *                          2 semitones under the top of the comfortable range (5단계: 높은 음에서도)
 *   'vibrato'              from 비브라토 4단계 the second round is sung on “오~” (5단계: 모음을 바꿔도)
 */
function adapt(e,stepOf){
  if(!e||!e.adapt)return e;
  const step=Number(typeof stepOf==='function'?stepOf(e.adapt==='sustain'?'sustain':'vibrato'):0)||0;
  if(e.adapt==='sustain'){
    const hold=step>=2?8:e.hold,high=step>=4;
    if(hold===e.hold&&!high)return e;
    return {...e,hold,...(high?{highNote:-2}:{}),text:'들린 음을 “'+e.syllable+'”으로 '+hold+'초 동안 이어요'+(high?'. 마지막은 높은 음이에요':'')};
  }
  if(e.adapt==='vibrato'&&step>=4)return {...e,vowels:['아~','오~'],text:'들린 음을 8초 동안 이어요. 처음엔 곧게, 신호가 울리면 떨어요. 두 번째는 “오~”로 해요'};
  return e;
}
const NOTE_NAMES=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const noteName=n=>NOTE_NAMES[((n%12)+12)%12]+(Math.floor(n/12)-1);

/* ---------- result ---------- */
const rowId=s=>'practice-set:'+s.id;
/** A step that keeps its own practice row (a finished goal, a song section): app/practice-set-model.js writes it. */
const ownRow=(st,done)=>!!(st.goalId&&done)||(['song','record'].includes(st.kind)&&!!st.songId);
/** What a step measured for 기본기 단계 (app/levels-model.js), as the run row keeps it: [{area, kind?, value, unit, …}].
 * Generic on purpose: an exercise added later only has to put its measures in its result. */
const measuresOf=r=>list(r?.measures).filter(m=>m&&typeof m==='object'&&typeof m.area==='string'&&Number.isFinite(m.value)).slice(0,12).map(m=>({...m}));
/** One item of the run row. */
function itemOf(st,minutes){
  const r=st.result||{};
  return {id:st.id,kind:st.kind,...(st.exercise?{exercise:st.exercise}:{}),...(st.group?{group:st.group}:{}),...(st.source?{source:st.source}:{}),
    ...(st.assignmentId?{assignmentId:st.assignmentId}:{}),...(st.pointId?{pointId:st.pointId}:{}),...(st.goalId?{goalId:st.goalId}:{}),
    title:st.title,state:st.skipped?'skipped':st.done?'done':'left',seconds:Math.round(Number(st.elapsed)||0),minutes,
    ...(r.mode?{mode:r.mode}:{}),...(r.timer?{timer:true}:{}),...(r.parts!=null?{parts:r.parts}:{}),...(r.holdSeconds!=null?{holdSeconds:r.holdSeconds}:{}),
    ...(r.accuracy!=null?{accuracy:r.accuracy}:{}),...(Array.isArray(r.notes)?{notes:r.notes}:{}),...(r.rounds!=null?{rounds:r.rounds}:{}),
    ...(r.longestOut!=null?{longestOut:r.longestOut}:{}),...(measuresOf(r).length?{measures:measuresOf(r)}:{}),...(st.mic?{mic:true}:{}),...(st.apply?{apply:true}:{})};
}
/** Summary lines of a session: every step with its state and seconds (minutes rounded, as typed fields start). */
function summary(s){
  return s.steps.map(st=>({id:st.id,kind:st.kind,title:shortTitle(st),label:labelOf(st),goalId:st.goalId||'',state:st.skipped?'skipped':st.done?'done':'left',
    done:st.done===true,seconds:Math.round(Number(st.elapsed)||0),minutes:Math.min(600,Math.round((Number(st.elapsed)||0)/60)),measured:!isOwn(st),
    mediaIds:list(st.mediaIds).slice(),result:st.result||null}));
}
/**
 * Save a finished (or stopped) set into db (call inside VZ.change). rows: [{id, minutes?, done?}] for the person's own
 * steps as edited on the summary. Idempotent per session: saving again replaces the same rows.
 * Returns {minutes (whole set), goals (checked), rows (written), runId}.
 */
function save(db,s,rows,{now=Date.now(),category=null}={}){
  const P=dep.set();
  if(!s||!Array.isArray(s.steps))throw Error('오늘의 연습을 찾지 못했어요.');
  const edits=new Map(list(rows).map(r=>[r.id,r]));
  for(const r of edits.values())if(r.minutes!=null){const n=Number(r.minutes);if(!(Number.isFinite(n)&&n>=0&&n<=600))throw Error('연습 시간은 0~600분으로 적어 주세요.');}
  const doneOf=st=>(edits.get(st.id)?.done??st.done)===true;
  const mine=s.steps.filter(st=>ownRow(st,doneOf(st))),rest=s.steps.filter(st=>!mine.includes(st));
  const part=mine.length?P.save(db,{...s,steps:mine},mine.map(st=>({id:st.id,minutes:edits.get(st.id)?.minutes??Math.round(st.elapsed/60),done:doneOf(st)})),{now,category}):{minutes:0,goals:0,rows:0};
  db.practices||=[];
  const id=rowId(s),at=db.practices.findIndex(p=>p&&p.id===id),old=at<0?null:db.practices[at];
  // Every step is listed; one whose minutes live in its own row (a finished goal, a song section) names that row
  // and adds nothing to this row's time.
  const items=s.steps.map(st=>{
    const e=edits.get(st.id);
    if(mine.includes(st))return {...itemOf({...st,done:doneOf(st)},Number(e?.minutes??Math.round(st.elapsed/60))),row:st.goalId&&doneOf(st)?'goal:'+st.goalId:P.rowId(s,st)};
    return itemOf(st,round3(e?.minutes!=null&&isOwn(st)?Number(e.minutes):(Number(st.elapsed)||0)/60));
  });
  const minutes=round3(items.reduce((n,x)=>n+(x.row?0:x.minutes),0)),media=[...new Set(rest.flatMap(st=>list(st.mediaIds).map(String)))];
  const homework=[...new Set(rest.filter(st=>st.assignmentId&&st.done&&!st.skipped).map(st=>st.assignmentId))];
  const takes=Object.fromEntries(rest.filter(st=>st.kind==='take'&&list(st.mediaIds).length).map(st=>[st.slot,String(st.mediaIds.at(-1))]));
  const did=items.filter(x=>x.state==='done').length,whole=round3(minutes+part.minutes);
  if(!(minutes>0||media.length||did||old))return {minutes:part.minutes,goals:part.goals,rows:part.rows,runId:''};
  const take=rest.find(st=>st.kind==='take');
  const row={...old,id,date:s.date,minutes,manualMinutes:minutes,practiceTimeSource:'practice-set',practiceMode:'training',songId:'',
    categoryLabel:'오늘의 연습',detail:'오늘의 연습',technique:items.filter(x=>!x.row&&x.minutes>0).map(x=>({name:x.title,minutes:x.minutes})),
    memo:'[오늘의 연습] '+items.length+'개 중 '+did+'개',mediaIds:media,completed:homework,assignmentReps:Object.fromEntries(homework.map(h=>[h,1])),
    assignmentNotes:old?.assignmentNotes||{},practiceSetId:s.id,
    dailySet:{v:1,minutes:whole,items,...(Object.keys(takes).length?{recording:{songId:take?.songId||'',phrase:take?.phrase||'',beforeId:takes.before||'',afterId:takes.after||''}}:{})},
    created:old?.created||now};
  if(at<0)db.practices.push(row);else db.practices[at]=row;
  return {minutes:whole,goals:part.goals,rows:part.rows+1,runId:id};
}
/** The sets finished on a date (newest last): the run rows. */
const runsOn=(db,date)=>live(db,'practices').filter(p=>p.dailySet&&p.date===date).sort((a,b)=>(Number(a.created)||0)-(Number(b.created)||0));

return {GROUPS,SONG,CATALOG,NEXT_MAX,NEXT_MINUTES,TAKE_SECONDS,MAX_STEPS,PREFS_ID,PREFS_KIND,groupOf,exercise,exercisesOf,
  prefs,cleanPrefs,setExercise,setGroup,savePrefs,resetPrefs,rotation,pick,dayNumber,
  ownKey,nextItems,ownSteps,build,isOwn,totalMinutes,modeOf,labelOf,shortTitle,timeline,progress,finishItem,stop,
  word,holdStart,holdTick,holdResult,comfort,baseNote,notesFor,noteTags,syllableOf,adapt,noteName,
  rowId,measuresOf,summary,save,runsOn};
});
