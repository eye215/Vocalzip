/* 연습 따라 하기 — no longer a screen of its own (2026-11-26): '따라 하기' everywhere opens 오늘의 연습 with a set of
 * ONE step (VZ.guideHref → #/practice-set?guide=<key>; app/practice-set.js starts it, app/daily-set-run.js runs it in
 * mode 'guide': a hand-reviewed video with the mic off, a timer, the tuner and the metronome where the exercise has them).
 * #/guided-practice/<key> stays as a redirect so old links keep working.
 * Kept here: what an exercise is (VZ.guidedStepFor: 숙제 · 분석 추천 · AI 초안), the hand-reviewed videos (a video
 * rated 'bad' for an exercise is not offered for it again: db.videoFeedback, VZ.guidedVideoFeedback), the pitch reader
 * VZ.guidedDetectPitch (also the mic of 오늘의 연습), VZ.guidedScaleFromText, VZ.guidedCategory and
 * VZ.guidedRecommendations. */
(() => {
'use strict';
const V=window.VZ,M=V?.media;
if(!V||!M)return;
const VIDEOS={
  wob:{id:'Kl85hKuMP5Y',title:'긴 음 유지 연습 · Singgeek'},
  into:{id:'00vt7RAvG70',title:'기준음 맞추기 · Berklee Online'}
};
const videoFor=c=>{
  let video=VIDEOS[c.tipKey];
  if(c.kind==='homework'){
    if(/롱톤|지속음|긴 음/.test(c.title))video=VIDEOS.wob;
    else if(/기준음|피아노.*음정/.test(c.title))video=VIDEOS.into;
  }
  return video && !(V.db.videoFeedback||[]).some(f=>f.exerciseKey===c.key&&f.videoId===video.id&&f.verdict==='bad')?video:null;
};
/** Where '따라 하기' goes: a set of one step in 오늘의 연습. */
V.guideHref=(key,songId='')=>'#/practice-set?guide='+encodeURIComponent(key)+(songId?'&song='+encodeURIComponent(songId):'');
V.guidedRecommendations=async({date=V.today(),songId='',media=null}={})=>{
  const homework=V.db.assignments.filter(t=>V.taskInPeriod?.(t,date)&&(!songId||!V.taskSongId(t)||V.taskSongId(t)===songId))
    .sort((a,b)=>Number(!!V.taskLessons(b).length)-Number(!!V.taskLessons(a).length)||(a.dueDate||'9999').localeCompare(b.dueDate||'9999')||(b.created||0)-(a.created||0))
    .map(t=>({kind:'homework',key:'homework:'+t.id,label:V.taskLessons(t).length?'레슨 숙제':'숙제',title:t.title,subtitle:(t.dueDate?V.dateLabel(t.dueDate)+'까지':'오늘 할 숙제'),songId:V.taskSongId(t)||'',assignmentId:t.id,steps:[t.title],minutes:5}));
  const files=media||await M.list().catch(()=>M.cached?.()||[]), result=V.practiceTips(files,{songId});
  const tips=(result.tips||[]).filter(t=>t.frequency>=2).sort((a,b)=>b.frequency-a.frequency||b.score-a.score)
    .map(t=>({kind:'analysis',key:'analysis:'+t.key,tipKey:t.key,title:t.name,subtitle:'최근 녹음 '+t.frequency+'회 · '+t.metric+' '+t.value,songId,steps:t.steps,minutes:t.minutes,goal:t.goal,range:t.range||''}));
  const duplicate=t=>homework.some(h=>t.tipKey==='wob'?/롱톤|지속음|긴 음/.test(h.title):t.tipKey==='into'?/음정|기준음/.test(h.title):false);
  const room=(window.VocalzipPracticeRoomModel?.recommendations(V.db,date,songId)||[]).map(c=>({...c,kind:'room',label:c.source==='ai'?'AI 추천':'연습 결과',title:c.action,subtitle:c.reason+' → '+(c.source==='ai'?c.body:c.section)+' · 약 '+c.minutes+'분',steps:[c.action],href:'#/practice-room?result='+encodeURIComponent(c.sourceId)}));
  const safe=room.some(c=>c.vocal===false);
  return [...(safe?[]:homework.slice(0,2)),...room,...(safe?[]:homework.slice(2)),...(safe?[]:tips).filter(t=>!duplicate(t))].slice(0,3).map(c=>({...c,video:videoFor(c)}));
};

const noteOffsets={C:0,D:2,E:4,F:5,G:7,A:9,B:11};
function referenceChoices(title){
  const match=String(title||'').match(/([A-G])([#♯b♭]?)(-?\d)\s*[~〜–—-]\s*([A-G])([#♯b♭]?)(-?\d)/i);
  if(!match)return null;
  const midi=(name,accidental,octave)=>12*(Number(octave)+1)+noteOffsets[name.toUpperCase()]+(['#','♯'].includes(accidental)?1:['b','♭'].includes(accidental)?-1:0);
  const low=midi(match[1],match[2],match[3]),high=midi(match[4],match[5],match[6]);
  if(low<36||high>96||low>=high)return null;
  const notes=[low,Math.min(high,low+12),Math.min(high,low+24)].filter((n,i,a)=>a.indexOf(n)===i);
  return {notes,initial:notes[Math.min(1,notes.length-1)],low,high};
}
function scaleFromText(text,range){
  const melody=String(text||'').match(/(?:도|레|미|파|솔|라|시){3,}/)?.[0];
  if(!melody||!range)return null;
  const names=melody.match(/도|레|미|파|솔|라|시/g),syllables=['도','레','미','파','솔','라','시'],intervals=[0,2,4,5,7,9,11];
  let octave=0,previous=null;
  const offsets=names.map(name=>{
    const index=syllables.indexOf(name);
    if(previous!==null){if(previous-index>=4)octave++;else if(index-previous>=4)octave--}
    previous=index;return intervals[index]+octave*12;
  });
  const min=range.low-Math.min(...offsets),max=range.high-Math.max(...offsets);
  if(min>max)return null;
  const starts=[min,Math.min(max,min+12),Math.min(max,min+24)].filter((n,i,a)=>a.indexOf(n)===i);
  return {names,offsets,notes:starts,initial:starts[Math.min(1,starts.length-1)]};
}
V.guidedScaleFromText=scaleFromText;
// YIN-style normalized difference: use the first strong period, not the loudest harmonic.
// The quietest frame read (RMS of the raw signal): the mic is opened without automatic gain, so an iPhone held at
// arm's length gives about −45…−35 dBFS for a sung note. The old −38 dBFS (.012) read that as silence, and a hold
// restarted after 0.3 s of "silence" — the phone had to be right at the mouth (owner, 2026-11-25). −48 dBFS keeps
// a quiet room out; noise without a clear period is still refused by the YIN threshold below.
const MIN_RMS=.004;
function detectPitch(frame,sampleRate,minRms=MIN_RMS){
  const length=frame.length,half=Math.floor(length/2),minLag=Math.max(2,Math.floor(sampleRate/1000)),maxLag=Math.min(half-1,Math.ceil(sampleRate/95));
  let power=0;for(let i=0;i<length;i++)power+=frame[i]*frame[i];
  if(Math.sqrt(power/length)<minRms)return null;
  const difference=new Float32Array(maxLag+1),normalized=new Float32Array(maxLag+1);
  for(let lag=1;lag<=maxLag;lag++){
    let sum=0;for(let i=0;i<half;i++){const delta=frame[i]-frame[i+lag];sum+=delta*delta}
    difference[lag]=sum;
  }
  let running=0;
  for(let lag=1;lag<=maxLag;lag++){
    running+=difference[lag];normalized[lag]=running?difference[lag]*lag/running:1;
  }
  for(let lag=minLag;lag<maxLag;lag++){
    if(normalized[lag]>=.18)continue;
    while(lag+1<maxLag&&normalized[lag+1]<normalized[lag])lag++;
    const a=normalized[lag-1],b=normalized[lag],c=normalized[lag+1];
    const offset=(a-2*b+c)?Math.max(-1,Math.min(1,(a-c)/(2*(a-2*b+c)))):0;
    return sampleRate/(lag+offset);
  }
  return null;
}
V.guidedDetectPitch=detectPitch;
/** Save 이 영상이 이 연습에 맞았나요? for one exercise and video (db.videoFeedback, one row per exercise and video). */
V.guidedVideoFeedback=(key,videoId,verdict)=>!!V.change(d=>{d.videoFeedback||=[];const id=key+':'+videoId,entry=d.videoFeedback.find(x=>x.id===id);if(entry)entry.verdict=verdict;else d.videoFeedback.push({id,exerciseKey:key,videoId,verdict,created:Date.now()});},{silent:true});
V.guidedCategory=(d,c)=>{
  d.categories||=[];
  const title=String(c.title||'').trim();
  const named=d.categories.filter(x=>x.name&&title.includes(x.name)).sort((a,b)=>b.name.length-a.name.length)[0];
  const name=named?.name||(c.tipKey==='phr'||/호흡|브레스|숨쉬|숨 쉬|프레이즈/.test(title)?'호흡':
    /발성|음정|기준음|롱톤|지속음|비브라토|공명|고음|저음|성구|립트릴|허밍/.test(title)||['into','wob','vib'].includes(c.tipKey)?'발성':
    /발음|딕션|조음/.test(title)?'발음':/감정|표현|연기/.test(title)?'표현':/리듬|박자|템포/.test(title)?'리듬':'보컬 트레이닝');
  let category=named||d.categories.find(x=>x.name===name);
  if(!category){category={id:V.uid(),name,items:[]};d.categories.push(category)}
  category.items||=[];if(title&&!category.items.includes(title))category.items.push(title);
  return {categoryId:category.id,categoryLabel:category.name,detail:title};
};
/** The exercise a 따라 하기 key names: a homework, an AI 초안 of a song, or an analysis recommendation. null when gone. */
async function itemFor(key,songId=''){
  if(key?.startsWith('homework:')){const t=(V.db.assignments||[]).find(x=>'homework:'+x.id===key);return t?{kind:'homework',key,title:t.title,subtitle:'레슨 숙제',songId:V.taskSongId(t)||'',assignmentId:t.id,steps:[t.title],minutes:5}:null;}
  if(key?.startsWith('ai:')){const plan=(V.db.practicePlans||[]).find(x=>x.period==='ai-exercise'&&'ai:'+x.id===key&&x.songId===songId&&!(V.db.deleted?.practicePlans||[]).includes(x.id));const t=plan?.tip;return t?{kind:'ai',key,title:t.name,subtitle:t.reason,songId,steps:t.steps,minutes:t.minutes,goal:t.goal,nonVocal:!!t.nonVocal}:null;}
  if(key?.startsWith('analysis:')){
    const media=await M.list().catch(()=>M.cached?.()||[]),tip=V.practiceTips(media,{songId}).tips.find(t=>'analysis:'+t.key===key);
    if(tip)return {kind:'analysis',key,tipKey:tip.key,title:tip.name,subtitle:'최근 녹음 '+tip.frequency+'회 · '+tip.metric+' '+tip.value,songId,steps:tip.steps,minutes:tip.minutes,goal:tip.goal,range:tip.range||''};
    if(key==='analysis:maintain')return {kind:'analysis',key,tipKey:'maintain',title:'롱톤 유지 연습',subtitle:'편안한 음역에서 일정한 소리 유지',songId,steps:['편한 음역에서 롱톤 5초씩 5회','같은 세기와 편안한 호흡으로 유지'],minutes:5};
  }
  return null;
}
/**
 * The one step of a 따라 하기 set (kept only in the running session on this device; the run row keeps what every set
 * step keeps). kind 'next' as 숙제 · 다음 연습 steps of 오늘의 연습: a homework step carries assignmentId, so the saved
 * set counts one practice of it ('N회') and never marks it done. step.guide is what the doing screen needs:
 *   key, lines (what to do, up to 4), video {id,title} | null (videoFor: hand reviewed, not rated 'bad' for it),
 *   reference {notes,initial} (기준음: the range of the recordings, else one written in the text), scale (음계 듣기 of
 *   음정 정확도), tuner (음정 정확도 with a range, as its third part had), metronome {bpm,beats} (the text names a beat).
 */
function stepOf(c){
  const lines=(Array.isArray(c.steps)?c.steps:[]).map(x=>String(x||'').trim()).filter(Boolean).slice(0,4);
  const range=referenceChoices(c.range),text=[c.title,...lines].join(' ');
  const reference=range||referenceChoices(c.title)||lines.map(referenceChoices).find(Boolean)||null;
  const scaleLine=c.tipKey==='into'&&range?lines.find(t=>scaleFromText(t,range)):'',scale=scaleLine?scaleFromText(scaleLine,range):null;
  const tuner=c.tipKey==='into'&&!!range;
  const metro=!c.nonVocal&&window.VzipMetronome&&/메트로놈|metronome|BPM|리듬|박자|템포/i.test(text)?window.VzipMetronome.settings(text):null;
  return {kind:'next',source:c.kind==='homework'?'homework':c.kind==='ai'?'ai':'practice-tip',id:'guide:'+c.key,title:String(c.title||'따라 하기'),
    why:String(c.subtitle||''),minutes:Math.min(120,Math.max(1,Math.round(Number(c.minutes)||5))),
    ...(c.assignmentId?{assignmentId:c.assignmentId}:{}),...(c.songId?{songId:c.songId}:{}),...(tuner?{mic:true}:{}),
    guide:{key:c.key,lines:lines.length===1&&lines[0]===String(c.title).trim()?[]:lines,video:c.video?{id:c.video.id,title:c.video.title}:null,
      reference:reference?{notes:reference.notes.slice(),initial:reference.initial}:null,
      scale:scale?{names:scale.names.slice(),offsets:scale.offsets.slice(),notes:scale.notes.slice(),initial:scale.initial}:null,
      tuner,metronome:metro?{bpm:metro.bpm,beats:metro.beats}:null,nonVocal:!!c.nonVocal,range:String(c.range||'')}};
}
/** The step for a 따라 하기 key (null when the exercise is gone). */
V.guidedStepFor=async(key,{songId=''}={})=>{
  const c=await itemFor(String(key||''),songId);
  if(!c)return null;
  c.video=videoFor(c);
  return stepOf(c);
};
// Old links (#/guided-practice/<key>?song=…) open the same set of one step.
V.route('guided-practice',{title:'연습 따라 하기',back:true,tab:'home',noSettings:true,noAutoRefresh:true,
  render:()=>'<p class="pset-help">오늘의 연습으로 여는 중이에요…</p>',
  mount(host,r){const key=r.params[0]||'';location.replace(key?V.guideHref(key,r.query.get('song')||''):'#/next-practice');}});
})();
