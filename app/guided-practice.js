/* Guided practice: lesson homework first, then recurrent reliable measurements.
 * Videos are hand reviewed against the specific exercise; missing/rejected videos use a timer. */
(() => {
'use strict';
const V=window.VZ,M=V?.media,esc=V?.esc;
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
const path=c=>c.href||'#/guided-practice/'+encodeURIComponent(c.key)+(c.songId?'?song='+encodeURIComponent(c.songId):'');
V.guidedRecommendations=async({date=V.today(),songId='',media=null}={})=>{
  const homework=V.db.assignments.filter(t=>V.taskInPeriod?.(t,date)&&(!songId||!V.taskSongId(t)||V.taskSongId(t)===songId))
    .sort((a,b)=>Number(!!V.taskLessons(b).length)-Number(!!V.taskLessons(a).length)||(a.dueDate||'9999').localeCompare(b.dueDate||'9999')||(b.created||0)-(a.created||0))
    .map(t=>({kind:'homework',key:'homework:'+t.id,label:V.taskLessons(t).length?'레슨 숙제':'숙제',title:t.title,subtitle:(t.dueDate?V.dateLabel(t.dueDate)+'까지':'오늘 할 숙제'),songId:V.taskSongId(t)||'',assignmentId:t.id,steps:[t.title],minutes:5}));
  const files=media||await M.list().catch(()=>M.cached?.()||[]), result=V.practiceTips(files,{songId});
  const tips=(result.tips||[]).filter(t=>t.frequency>=2).sort((a,b)=>b.frequency-a.frequency||b.score-a.score)
    .map(t=>({kind:'analysis',key:'analysis:'+t.key,tipKey:t.key,title:t.name,subtitle:'최근 녹음 '+t.frequency+'회 · '+t.metric+' '+t.value,songId,steps:t.steps,minutes:t.minutes,goal:t.goal}));
  const duplicate=t=>homework.some(h=>t.tipKey==='wob'?/롱톤|지속음|긴 음/.test(h.title):t.tipKey==='into'?/음정|기준음/.test(h.title):false);
  const room=(window.VocalzipPracticeRoomModel?.recommendations(V.db,date,songId)||[]).map(c=>({...c,kind:'room',label:c.source==='ai'?'AI 추천':'연습 결과',title:c.action,subtitle:c.reason+' → '+(c.source==='ai'?c.body:c.section)+' · 약 '+c.minutes+'분',steps:[c.action],href:'#/practice-room?result='+encodeURIComponent(c.sourceId)}));
  const safe=room.some(c=>c.vocal===false);
  return [...(safe?[]:homework.slice(0,2)),...room,...(safe?[]:homework.slice(2)),...(safe?[]:tips).filter(t=>!duplicate(t))].slice(0,3).map(c=>({...c,video:videoFor(c)}));
};
V.guidedRecommendationCards=(rows,{selectable=false,showStart=true}={})=>'<div class="gp-recommendations"><h3>추천 연습 <small>최대 3개</small></h3>'+rows.map(c=>
  '<div class="gp-rec" data-guided-key="'+esc(c.key)+'">'+(selectable?'<label class="gp-rec-select"><input type="checkbox" name="guided-recommendation" value="'+esc(c.key)+'" aria-label="'+esc(c.title)+' 목표에 담기"><span class="gp-rec-check" aria-hidden="true"></span><span class="gp-rec-copy"><strong>'+esc((c.label|| (c.kind==='homework'?'숙제':'분석 추천'))+' · '+c.title)+'</strong><small>'+esc(c.subtitle+(c.kind==='room'?'':' · '+(c.video?'영상 포함':'타이머 안내')))+'</small></span></label>':'<div class="gp-rec-copy"><strong>'+esc((c.label||(c.kind==='homework'?'숙제':'분석 추천'))+' · '+c.title)+'</strong><small>'+esc(c.subtitle+(c.kind==='room'?'':' · '+(c.video?'영상 포함':'타이머 안내')))+'</small></div>')+
    (showStart?'<a href="'+esc(path(c))+'" aria-label="'+esc(c.title)+' 따라 하기">따라 하기 <i class="ph ph-arrow-up-right"></i></a>':'')+'</div>').join('')+'</div>';

let live=null;
const noteOffsets={C:0,D:2,E:4,F:5,G:7,A:9,B:11},noteNames=['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function referenceChoices(title){
  const match=String(title||'').match(/([A-G])([#♯b♭]?)(-?\d)\s*[~〜–—-]\s*([A-G])([#♯b♭]?)(-?\d)/i);
  if(!match)return null;
  const midi=(name,accidental,octave)=>12*(Number(octave)+1)+noteOffsets[name.toUpperCase()]+(['#','♯'].includes(accidental)?1:['b','♭'].includes(accidental)?-1:0);
  const low=midi(match[1],match[2],match[3]),high=midi(match[4],match[5],match[6]);
  if(low<36||high>96||low>=high)return null;
  const notes=[low,Math.min(high,low+12),Math.min(high,low+24)].filter((n,i,a)=>a.indexOf(n)===i);
  return {notes,initial:notes[Math.min(1,notes.length-1)]};
}
const noteLabel=n=>noteNames[n%12]+(Math.floor(n/12)-1);
function stopReference(s){
  if(!s?.referenceSource)return;
  const source=s.referenceSource;s.referenceSource=null;
  try{source.stop()}catch{}
  try{source.disconnect()}catch{}
  const button=s.host.querySelector('[data-gp-reference]');if(button)button.textContent='기준음 듣기';
}
async function playReference(s){
  if(s.running)return;
  if(s.referenceSource){stopReference(s);return}
  try{
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw Error('오디오 재생을 지원하지 않아요.');
    try{if(navigator.audioSession)navigator.audioSession.type='playback'}catch{}
    const ctx=s.referenceContext||new Audio();s.referenceContext=ctx;await ctx.resume();
    if(ctx.state!=='running'||live!==s||!s.host.isConnected||!s.steps[s.index]?.reference)return;
    const source=ctx.createOscillator(),gain=ctx.createGain(),now=ctx.currentTime;
    source.type='sine';source.frequency.value=440*Math.pow(2,(s.referenceNote-69)/12);
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(.16,now+.035);
    gain.gain.setValueAtTime(.16,now+.85);gain.gain.linearRampToValueAtTime(0,now+1.1);
    source.connect(gain).connect(ctx.destination);s.referenceSource=source;
    source.onended=()=>{if(s.referenceSource===source){s.referenceSource=null;const button=s.host.querySelector('[data-gp-reference]');if(button)button.textContent='기준음 듣기'}source.disconnect();gain.disconnect()};
    source.start(now);source.stop(now+1.12);
    const button=s.host.querySelector('[data-gp-reference]');if(button)button.textContent='소리 정지';
  }catch{V.toast('기준음을 재생할 수 없어요. 기기 소리 설정을 확인해 주세요.','error')}
}
function pauseForInterruption(){
  const s=live;if(!s)return;
  stopReference(s);
  if(s.running){const now=Date.now();if(!s.steps[s.index]?.video||s.videoPlaying)s.elapsed+=Math.min(2,Math.max(0,(now-s.last)/1000));}
  if(s.videoPlaying&&s.player){const now=s.player.getCurrentTime?.()||0;if(now>=s.lastVideoTime&&now-s.lastVideoTime<2.5)s.watched=Math.min(s.videoDuration,s.watched+now-s.lastVideoTime);}
  s.running=false;s.videoPlaying=false;clearInterval(s.clock);clearInterval(s.watchClock);s.clock=null;s.watchClock=null;s.lastVideoTime=0;
  try{s.player?.pauseVideo?.()}catch{}
  const start=s.host.querySelector('[data-gp-start]');if(start&&!s.ended){start.disabled=!!s.steps[s.index]?.video&&!s.playerReady;start.textContent=s.steps[s.index]?.video?'영상 이어 듣기':s.elapsed?'다시 시작':'연습 시작';}
  const reference=s.host.querySelector('[data-gp-reference]');if(reference)reference.disabled=false;
  updateProgress(s);
}
function clear(){if(!live)return;pauseForInterruption();const s=live;live=null;try{s.player?.destroy()}catch{}try{s.referenceContext?.close()}catch{}}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')pauseForInterruption()});
window.addEventListener('pagehide',pauseForInterruption);
function seconds(n){return Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0')}
function stepList(c){
  const steps=c.steps.slice(0,4).map((text,i)=>({title:text,duration:Math.max(45,Math.round(c.minutes*60/Math.max(1,c.steps.length))),video:i===0?c.video:null,reference:referenceChoices(text)}));
  if(c.tipKey==='wob'&&steps.length===3)steps.push({title:'다시 불러보고 처음과 비교하기',duration:60,video:null});
  return steps;
}
function saveFeedback(c,video,verdict){
  if(!V.change(d=>{d.videoFeedback||=[];const id=c.key+':'+video.id,entry=d.videoFeedback.find(x=>x.id===id);if(entry)entry.verdict=verdict;else d.videoFeedback.push({id,exerciseKey:c.key,videoId:video.id,verdict,created:Date.now()});},{silent:true}))return false;
  return true;
}
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
function updateProgress(s){
  if(!s.host.isConnected||s.finished)return;
  const step=s.steps[s.index],total=s.steps.reduce((n,x)=>n+x.duration,0),before=s.steps.slice(0,s.index).reduce((n,x)=>n+x.duration,0);
  const part=step.video?Math.min(1,s.watched/(s.videoDuration||step.duration)):Math.min(1,s.elapsed/step.duration);
  const value=Math.min(99,Math.round((before+step.duration*part)/total*100));
  const valueEl=s.host.querySelector('.gp-progress strong'),bar=s.host.querySelector('.gp-screen>.gp-meter i');
  if(valueEl)valueEl.textContent=value+'%';if(bar)bar.style.width=value+'%';
  const videoBar=s.host.querySelector('.gp-video .gp-meter i');if(videoBar)videoBar.style.width=Math.round(part*100)+'%';
  const videoLabel=s.host.querySelector('.gp-video small');if(videoLabel)videoLabel.textContent='영상 '+seconds(s.watched)+' / '+seconds(s.videoDuration||step.duration);
}
function saveSession(s){
  if(s.saved)return true;
  const c=s.c,date=V.today(),minutes=Number((s.completedSeconds/60).toFixed(3)),id='guided:'+c.key+':'+s.startedAt;
  const ok=V.change(d=>{
    if(!d.practices.some(p=>p.id===id)){
      const category=V.guidedCategory(d,c);
      d.practices.push({id,date,minutes,manualMinutes:minutes,guidedSeconds:Math.round(s.completedSeconds),practiceTimeSource:'guided',practiceMode:c.songId?'song':'training',songId:c.songId,...category,technique:[{name:c.title,minutes}],memo:'[따라 하기] '+c.title,completed:c.assignmentId?[c.assignmentId]:[],assignmentReps:c.assignmentId?{[c.assignmentId]:1}:{},assignmentNotes:{},guidedExerciseKey:c.key,created:Date.now()});
    }
    if(c.assignmentId){const task=d.assignments.find(t=>t.id===c.assignmentId);if(task&&task.status!=='done'){task.status='done';task.doneAt=Date.now()}}
    for(const goal of d.dailyGoals||[])if(goal.date===date&&goal.sourceId===(c.assignmentId||c.key)&&!goal.completed)goal.completed=true;
  },{silent:true});
  s.saved=ok;return ok;
}
function paint(s){
  if(!s.host.isConnected)return;
  stopReference(s);
  clearInterval(s.watchClock);s.watchClock=null;try{s.player?.destroy()}catch{}s.player=null;s.playerReady=false;s.videoPlaying=false;
  const c=s.c,step=s.steps[Math.min(s.index,s.steps.length-1)],target=s.steps.reduce((n,x)=>n+x.duration,0),before=s.steps.slice(0,s.index).reduce((n,x)=>n+x.duration,0);
  if(step.reference&&!step.reference.notes.includes(s.referenceNote))s.referenceNote=step.reference.initial;
  const current=step.video?Math.min(step.duration,s.watched/(s.videoDuration||step.duration)*step.duration):Math.min(step.duration,s.elapsed);
  const progress=s.finished?100:Math.min(99,Math.round((before+current)/target*100));
  s.host.innerHTML='<div class="gp-screen"><p class="gp-eyebrow">'+esc(c.kind==='homework'?'레슨 숙제':'분석 추천 연습')+'</p><h2>'+esc(c.title)+'</h2><p class="gp-reason">'+esc(c.subtitle)+'</p>'+
    '<div class="gp-progress"><span>'+(s.finished?'연습 완료':(s.index+1)+' / '+s.steps.length+' 단계')+'</span><strong>'+progress+'%</strong></div><div class="gp-meter"><i style="width:'+progress+'%"></i></div>'+
    (s.finished?'<div class="gp-done"><i class="ph ph-check-circle"></i><h3>모든 단계를 마쳤어요</h3><p>실제 연습 '+seconds(s.completedSeconds)+' · '+(s.saved?'연습 기록과 목표를 저장했어요.':'저장하지 못했어요. 다시 시도해 주세요.')+'</p></div><div class="gp-actions"><button type="button" class="gp-primary" '+(s.saved?'data-gp-record':'data-gp-retry')+'>'+(s.saved?'연습 기록 보기':'다시 저장')+'</button></div>':
    '<div class="gp-steps">'+s.steps.map((x,i)=>'<span class="'+(i===s.index?'active':i<s.index?'done':'')+'">'+(i<s.index?'✓':i+1)+'</span>').join('')+'</div>'+
    (step.video?'<div class="gp-video"><div id="gp-youtube"></div><p>연습 영상 · '+esc(step.video.title)+'</p><small>영상 '+seconds(s.watched)+' / '+seconds(s.videoDuration||step.duration)+'</small><div class="gp-meter"><i style="width:'+Math.min(100,Math.round(s.watched/(s.videoDuration||step.duration)*100))+'%"></i></div></div>':'<div class="gp-timer'+(step.reference?' has-reference':'')+'"><i class="ph ph-timer"></i><strong>'+seconds(s.elapsed)+'</strong><span>영상 없이 안내에 맞춰 연습해요</span>'+(step.reference?'<div class="gp-reference"><label>기준음 높이<select data-gp-note aria-label="기준음 높이">'+step.reference.notes.map((n,i)=>'<option value="'+n+'"'+(n===s.referenceNote?' selected':'')+'>'+['낮게','보통','높게'][i]+' · '+noteLabel(n)+'</option>').join('')+'</select></label><button type="button" data-gp-reference>기준음 듣기</button><small>먼저 듣고 편한 높이에서 따라 불러요. 소리를 들어도 타이머는 시작되지 않아요.</small></div>':'')+'</div>')+
    '<div class="gp-instruction"><small>STEP '+String(s.index+1).padStart(2,'0')+'</small><h3>'+esc(step.title)+'</h3><p>편한 음역에서 무리하지 말고 반복해 주세요.</p></div>'+
    (step.video?'<div class="gp-feedback"><span>이 영상이 이 연습에 맞았나요?</span><button type="button" data-gp-feedback="good" aria-pressed="'+(V.db.videoFeedback||[]).some(f=>f.exerciseKey===c.key&&f.videoId===step.video.id&&f.verdict==='good')+'">맞아요</button><button type="button" data-gp-feedback="bad" aria-pressed="false">맞지 않아요</button></div>':'')+
    '<div class="gp-actions"><button type="button" class="gp-primary" data-gp-start '+(step.video?'disabled':'')+(s.ended?' hidden':'')+'>'+(step.video?'영상 불러오는 중…':s.running?'연습 종료':'연습 시작')+'</button>'+
    '<button type="button" class="gp-secondary" data-gp-next '+(!s.ended?'hidden disabled':'')+'>'+(s.index===s.steps.length-1?'연습 끝내기':'다음 단계')+'</button></div>'+
    (step.video?'<button type="button" class="gp-fallback" data-gp-no-video>영상이 재생되지 않나요? 타이머로 연습하기</button>':''))+'</div>';
  s.host.querySelector('[data-gp-start]')?.addEventListener('click',e=>{const b=e.currentTarget;
    if(!step.video&&s.running){clearInterval(s.clock);s.running=false;s.ended=s.elapsed>=3;b.textContent='다시 시작';const reference=s.host.querySelector('[data-gp-reference]');if(reference)reference.disabled=false;const next=s.host.querySelector('[data-gp-next]');next.disabled=!s.ended;next.hidden=!s.ended;if(s.ended)b.hidden=true;else V.toast('최소 3초 연습한 뒤 종료해 주세요.');return}
    if(step.video&&!s.playerReady)return;
    if(step.video){if(s.player?.getPlayerState?.()===YT.PlayerState.ENDED){s.player.seekTo(0,true);s.watched=0;s.lastVideoTime=0;}s.player.playVideo();}
    stopReference(s);s.running=true;s.ended=false;s.last=Date.now();b.textContent=step.video?'영상 재생 중':'연습 종료';if(step.video)b.disabled=true;const reference=s.host.querySelector('[data-gp-reference]');if(reference)reference.disabled=true;
    s.clock=setInterval(()=>{if(!s.host.isConnected){clear();return}const now=Date.now();if(!step.video||s.videoPlaying)s.elapsed+=Math.min(2,(now-s.last)/1000);s.last=now;const label=s.host.querySelector('.gp-timer strong');if(label)label.textContent=seconds(s.elapsed);updateProgress(s)},1000)
  });
  s.host.querySelector('[data-gp-note]')?.addEventListener('change',e=>{stopReference(s);s.referenceNote=Number(e.target.value)});
  s.host.querySelector('[data-gp-reference]')?.addEventListener('click',()=>playReference(s));
  s.host.querySelector('[data-gp-next]')?.addEventListener('click',()=>{if(!s.ended)return;s.completedSeconds+=s.elapsed;s.elapsed=0;s.watched=0;s.videoDuration=0;s.ended=false;s.index++;s.finished=s.index>=s.steps.length;if(s.finished)saveSession(s);paint(s)});
  s.host.querySelector('[data-gp-no-video]')?.addEventListener('click',()=>{try{s.player?.destroy()}catch{}s.player=null;step.video=null;s.watched=0;paint(s)});
  s.host.querySelectorAll('[data-gp-feedback]').forEach(b=>b.onclick=()=>{if(!saveFeedback(c,step.video,b.dataset.gpFeedback))return;if(b.dataset.gpFeedback==='bad'){try{s.player?.destroy()}catch{}s.player=null;step.video=null;s.watched=0;paint(s);V.toast('이 연습에서는 해당 영상을 다시 추천하지 않을게요.')}else{b.setAttribute('aria-pressed','true');V.toast('영상 평가를 저장했어요.')}});
  s.host.querySelector('[data-gp-retry]')?.addEventListener('click',()=>{saveSession(s);paint(s)});
  s.host.querySelector('[data-gp-record]')?.addEventListener('click',()=>V.nav('#/practices'));
  if(step.video&&!s.finished)attachPlayer(s,step.video);
}
function attachPlayer(s,video){
  const mount=()=>{if(!live||live!==s||!s.host.isConnected||!s.host.querySelector('#gp-youtube')||!window.YT?.Player)return;
    s.player=new YT.Player('gp-youtube',{videoId:video.id,playerVars:{playsinline:1,controls:0,disablekb:1,fs:0,rel:0,origin:location.origin},events:{onReady:e=>{if(live!==s||!s.host.isConnected||s.steps[s.index]?.video?.id!==video.id)return;s.playerReady=true;e.target.getIframe?.()?.setAttribute('tabindex','-1');s.videoDuration=e.target.getDuration()||s.steps[s.index].duration;s.steps[s.index].duration=s.videoDuration;const start=s.host.querySelector('[data-gp-start]');if(start){start.disabled=false;start.textContent='영상 재생';}updateProgress(s)},onStateChange:e=>{if(live!==s||!s.host.isConnected||s.steps[s.index]?.video?.id!==video.id)return;if(e.data===YT.PlayerState.PLAYING){s.videoPlaying=true;s.last=Date.now();clearInterval(s.watchClock);s.watchClock=setInterval(()=>{if(!s.host.isConnected){clearInterval(s.watchClock);return}const duration=e.target.getDuration(),now=e.target.getCurrentTime();if(duration>0){s.videoDuration=duration;s.steps[s.index].duration=duration}
      if(now>=s.lastVideoTime&&now-s.lastVideoTime<2.5)s.watched=Math.min(s.videoDuration,s.watched+Math.max(0,now-s.lastVideoTime));s.lastVideoTime=now;
      updateProgress(s);
    },1000)}else{const now=e.target.getCurrentTime();if(s.videoPlaying&&now>=s.lastVideoTime&&now-s.lastVideoTime<2.5)s.watched=Math.min(s.videoDuration,s.watched+now-s.lastVideoTime);s.videoPlaying=false;clearInterval(s.watchClock);s.lastVideoTime=0;
      if(e.data===YT.PlayerState.ENDED&&s.running){clearInterval(s.clock);s.running=false;const start=s.host.querySelector('[data-gp-start]'),next=s.host.querySelector('[data-gp-next]');s.ended=s.videoDuration>0&&s.watched/s.videoDuration>=.8&&s.elapsed>=3;if(start){start.hidden=s.ended;start.disabled=false;start.textContent='영상 다시 듣기';}if(next){next.hidden=!s.ended;next.disabled=!s.ended;}if(!s.ended)V.toast('영상을 끝까지 재생한 뒤 다음 단계로 이동할 수 있어요.');}
      else if(e.data===YT.PlayerState.PAUSED&&s.running){clearInterval(s.clock);s.running=false;const start=s.host.querySelector('[data-gp-start]');if(start){start.disabled=false;start.textContent='영상 이어 듣기';}}
      updateProgress(s)}}}});
  };
  if(window.YT?.Player){mount();return}
  window.onYouTubeIframeAPIReady=mount;
  if(!document.querySelector('script[data-gp-youtube]')){const script=document.createElement('script');script.src='https://www.youtube.com/iframe_api';script.async=true;script.dataset.gpYoutube='';document.head.append(script)}
}
V.route('guided-practice',{title:'연습 따라 하기',back:true,tab:'home',noSettings:true,noAutoRefresh:true,
  render:()=>'<div class="gp-loading">연습 내용을 불러오는 중…</div>',
  async mount(host,r){clear();const key=r.params[0],songId=r.query.get('song')||'';
    let c;if(key?.startsWith('homework:')){const t=V.db.assignments.find(x=>'homework:'+x.id===key);if(t)c={kind:'homework',key,title:t.title,subtitle:'레슨 숙제',songId:V.taskSongId(t)||'',assignmentId:t.id,steps:[t.title],minutes:5};}
    else if(key?.startsWith('analysis:')){
      const media=await M.list().catch(()=>M.cached?.()||[]),tip=V.practiceTips(media,{songId}).tips.find(t=>'analysis:'+t.key===key);
      if(tip)c={kind:'analysis',key,tipKey:tip.key,title:tip.name,subtitle:'최근 녹음 '+tip.frequency+'회 · '+tip.metric+' '+tip.value,songId,steps:tip.steps,minutes:tip.minutes,goal:tip.goal};
      else if(key==='analysis:maintain')c={kind:'analysis',key,tipKey:'maintain',title:'롱톤 유지 연습',subtitle:'편안한 음역에서 일정한 소리 유지',songId,steps:['편한 음역에서 롱톤 5초씩 5회','같은 세기와 편안한 호흡으로 유지'],minutes:5};
    }
    if(!host.isConnected)return;if(!c){host.innerHTML='<p>연습을 찾을 수 없어요. 추천 목록에서 다시 선택해 주세요.</p>';return}
    c.video=videoFor(c);const s={c,host,index:0,steps:stepList(c),running:false,ended:false,finished:false,saved:false,elapsed:0,completedSeconds:0,watched:0,videoDuration:0,startedAt:Date.now(),clock:null,watchClock:null,player:null,lastVideoTime:0};live=s;paint(s);
  },leave:clear});
})();
