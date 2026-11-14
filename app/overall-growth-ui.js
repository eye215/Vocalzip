/* Lifetime dashboard: readable data hierarchy, opt-in AI and scoped practice actions. */
(()=>{
'use strict';
const V=window.VZ,Model=window.VzipOverallGrowth,G=window.VzipGrowthMetrics;
if(!V||!Model||!G)return;
const esc=V.esc;
const fmt=(n,m)=>n==null?'측정 없음':G.fmt(m.id,n);
const longDate=s=>s?String(s).replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$1.$2.$3'):'';

const COACH_FIELDS={
 '요약':['한눈에 보기','overview','ph-sparkle'],
 '좋아진 점':['좋아진 점','better','ph-trend-up'],
 '보완할 점':['다음에 살필 점','focus','ph-target'],
 '다음 연습':['다음 연습','action','ph-play-circle']
};
/* Render saved model text; never fabricate analysis claims. */
function noteHtml(text){
 const raw=String(text||'').trim();
 if(!raw)return '';
 const matches=[...raw.matchAll(/(?:^|\n)\s*(요약|좋아진 점|보완할 점|다음 연습)\s*[:：]\s*/g)];
 if(!matches.length)return '<div class="growth-ai-note">'+esc(raw).replace(/\n/g,'<br>')+'</div>';
 return '<div class="growth-ai-note growth-coach-grid">'+matches.map((m,i)=>{
  const slice=raw.slice(m.index+m[0].length,i+1<matches.length?matches[i+1].index:raw.length).trim();
  const [label,tone,icon]=COACH_FIELDS[m[1]];
  return '<article class="growth-coach-part growth-coach-'+tone+'">'+
   '<div class="growth-coach-part-heading"><i class="ph '+icon+'" aria-hidden="true"></i><strong>'+esc(label)+'</strong></div>'+
   '<p>'+esc(slice||'비교 가능한 근거가 부족해요.').replace(/\n/g,'<br>')+'</p></article>';
 }).join('')+'</div>';
}
function jumpNav(range){
 return '<nav class="growth-jumps" aria-label="성장 분석 빠른 이동">'+
  [['overview','요약'],['skills','역량'],['coach','AI 분석'],['trend','그래프'],...(range?[['range','음역']]:[]),['practice','연습']].map(([id,label])=>
   '<button type="button" data-growth-jump="'+id+'"'+(id==='range'?' data-range-flow':'')+'>'+label+'</button>').join('')+'</nav>';
}
function summaryCard(report){
 const valid=report.analysisCount>0;
 const complete=report.metrics.some(m=>m.pairedSongs>0);
 const strength=report.topStrength,watch=report.topWatch,songs=report.watchSongs;
 // A measure never shows as both: when the only worse songs belong to a measure that improved overall, name the song.
 const songName=x=>x.title||V.songTitle?.(x.songId)||'곡';
 const second=watch?['우선 확인할 항목',watch.title,'아쉬운 방향인 곡 '+watch.worsened+'곡']:
  songs?['우선 확인할 곡',songName(songs.songs[0])+(songs.songs.length>1?' 외 '+(songs.songs.length-1)+'곡':''),songs.title+' · '+(songs.songs.length>1?'이 곡들만':'이 곡만')+' 아쉬운 방향이에요']:
  ['우선 확인할 항목','보완 여부 판단 전','측정값만으로 약점을 단정하지 않아요'];
 return '<section class="growth-hero" aria-label="전체 성장 요약">'+
  '<p class="growth-eyebrow">MY VOCAL ARCHIVE</p><h2>지금까지의 목소리</h2>'+
  '<p class="growth-hero-lead">'+(valid?(complete?'같은 곡의 첫 녹음과 최근 녹음으로 변화를 살펴봤어요.':'분석된 녹음이 있어요. 같은 곡을 다른 날 다시 부르면 변화를 비교할 수 있어요.'):'분석된 곡 녹음이 쌓이면 내 목소리의 변화를 정리해 줄게요.')+'</p>'+
  '<div class="growth-kpi-grid" role="group" aria-label="전체 분석 데이터">'+
   '<div><span>곡 녹음</span><strong>'+report.recordings+'</strong><small>개</small></div>'+
   '<div><span>분석 완료</span><strong>'+report.analysisCount+'</strong><small>개</small></div>'+
   '<div><span>분석한 곡</span><strong>'+report.analyzedSongs+'</strong><small>곡</small></div>'+
   '<div><span>분석한 월</span><strong>'+report.monthCount+'</strong><small>개월</small></div></div>'+
  '<p class="growth-period-label">'+(report.firstDate?'기록 기간 '+longDate(report.firstDate)+' ~ '+longDate(report.lastDate):'아직 날짜가 있는 곡 녹음이 없어요.')+'</p>'+
  '<div class="growth-coverage"><span>수치가 있는 녹음 <strong>'+report.analysisCount+' / '+report.recordings+'</strong></span>'+
  '<div class="growth-coverage-track" role="progressbar" aria-label="분석된 녹음 비율" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+(report.recordings?Math.round(report.analysisCount/report.recordings*100):0)+'"><i style="width:'+(report.recordings?Math.round(report.analysisCount/report.recordings*100):0)+'%"></i></div></div>'+
  '<div class="growth-highlights"><div class="growth-highlight" data-growth-strength="'+(strength?.id||'none')+'"><span>좋아진 방향</span><strong>'+esc(strength?.title||'비교 기록 필요')+'</strong><small>'+(strength?'동일 곡 '+strength.pairedSongs+'곡의 첫·최근 비교':'동일 곡을 다른 날 녹음하면 확인 가능')+'</small></div>'+
  '<div class="growth-highlight" data-growth-watch="'+(watch?watch.id:songs?'song':'none')+'"><span>'+second[0]+'</span><strong>'+esc(second[1])+'</strong><small>'+esc(second[2])+'</small></div></div></section>';
}
const TONE={better:'good',worse:'bad',mixed:'neutral',similar:'neutral',changed:'neutral',reference:'ref',hold:'insufficient'};
/** Per-song evidence for one measure: what was compared, on what basis, or why it was withheld. */
function songRows(m){
 const rows=(m.rows||[]).filter(x=>x.state);
 if(!rows.length)return '';
 return '<ul class="growth-song-rows">'+rows.map(x=>{
  const text=m.id==='passaggio'?G.passaggioText(x.latest):x.state==='hold'?G.holdText(x.reason):G.changeText(x);
  const vs=m.id==='range'&&x.vsScore?' · 악보 최고음 '+x.vsScore.scoreHigh+' 대비 '+signedSemi(x.vsScore.before)+' → '+signedSemi(x.vsScore.after):'';
  const basis=G.basisText(x);
  return '<li><strong>'+esc(x.title||V.songTitle?.(x.songId)||'곡')+'</strong><span class="growth-state '+TONE[x.state]+'">'+esc(G.stateLabel(x))+'</span>'+
   '<p>'+esc(text+vs)+'</p>'+(basis?'<small>'+esc(basis)+'</small>':'')+'</li>';
 }).join('')+'</ul>';
}
const signedSemi=n=>n===0?'같은 음':(n>0?'+':'−')+Math.abs(n)+'반음';
/** One measure card (also used by the monthly view). scope: 'overall' (first vs latest) or 'monthly' (previous month). */
function metricCard(m,{scope='overall',tag='article',cls='growth-stat'}={}){
 const label=G.stateLabel(m),tone=TONE[m.state]||'insufficient';
 const holdLine=m.withheld?'<p class="growth-stat-hold"><i class="ph ph-pause-circle" aria-hidden="true"></i>판정 보류 '+m.withheld+'곡 · '+esc(G.holdText(G.mainHold(m)))+'</p>':'';
 const beforeLabel=scope==='monthly'?'지난달':'첫 녹음',afterLabel=scope==='monthly'?'이번 달':'최근 녹음';
 let number,sub,compare='';
 if(m.id==='passaggio'){
  const found=(m.rows||[]).filter(x=>x.latest?.found).length;
  number='참고용';sub=found?'흔들림이 커지는 음역대가 보인 곡 '+found+'곡':'곡별 결과는 아래에서 확인해요';
 }else if(m.id==='range'){
  number=m.compared?(m.changed?'변화 '+m.changed+'곡':'같은 음역'):'비교 전';
  sub='안정 최고음·주 가창 음역 기준 · 순간 최고음 제외';
  if(m.compared)compare='<p class="growth-stat-sub">같은 곡 '+m.compared+'곡 비교 · 변화 '+m.changed+' · 같음 '+m.similar+' · 실력 판정 아님</p>';
 }else{
  const shown=m.compared&&m.after!=null?m.after:m.current;
  number=fmt(shown,m);
  const own=scope==='monthly'?'이번 달 유효 측정 '+m.currentSongs+'개':'최근 분석 기준 · '+m.currentSongs+'곡';
  // The big number is an average of the compared songs' latest takes on the comparison basis — say which basis.
  const basis=m.basis==='phrases'?'같은 프레이즈 기준 · ':m.basis==='whole'?'녹음 전체 기준 · ':'';
  sub=m.compared&&m.after!=null?(m.id==='phrase'?'같은 프레이즈 지속시간 · '+afterLabel:m.id==='high'?'같은 고음 구간 흔들림 · '+afterLabel:basis+'비교한 '+m.compared+'곡의 '+afterLabel+' 평균'):
   m.current!=null?(m.id==='phrase'?'프레이즈 길이 중앙값 · 같은 프레이즈 비교 전':m.id==='high'?'고음 구간 흔들림 · 비교 전':own+' (변화 판정 전)'):'측정 없음';
  if(m.compared&&m.before!=null)compare='<div class="growth-stat-comparison"><div><span>'+beforeLabel+'</span><strong>'+esc(fmt(m.before,m))+'</strong></div><i class="ph ph-arrow-right" aria-hidden="true"></i><div><span>'+afterLabel+'</span><strong>'+esc(fmt(m.after,m))+'</strong></div></div>'+
   // 고음 안정성 is judged from wobble and hold time together: without the hold time "±4.6 → ±4.6 · 좋아진 방향" reads wrong.
   (m.id==='high'&&G.heldText(m.heldBefore,m.heldAfter)?'<p class="growth-stat-sub growth-stat-held" data-growth-held>'+esc(G.heldText(m.heldBefore,m.heldAfter))+' (평균) · 흔들림과 유지 시간을 함께 봐요</p>':'')+
   '<p class="growth-stat-sub">같은 곡 '+m.compared+'곡 · 좋아짐 '+m.better+' / 아쉬움 '+m.worse+' / 비슷 '+m.similar+(m.mixed?' / 혼재 '+m.mixed:'')+'</p>';
 }
 const help=V.metricInfo?V.metricInfo(m.help,m.title):'';
 return '<'+tag+' class="'+cls+' growth-stat-v2" data-growth-metric="'+m.id+'"><div class="growth-stat-top"><span>'+esc(m.title)+help+'</span><span class="growth-state '+tone+'">'+esc(label)+'</span></div>'+
  '<strong class="growth-stat-number">'+esc(number)+'</strong><p class="growth-stat-sub">'+esc(sub)+'</p>'+compare+holdLine+
  (m.id==='passaggio'?'<p class="growth-ref-note"><i class="ph ph-chalkboard-teacher" aria-hidden="true"></i>'+esc(G.PASSAGGIO_NOTE)+'</p>':'')+
  '<details class="growth-measure-help"><summary>분석 방법·곡별 근거</summary><p>'+esc(m.method)+'</p>'+songRows(m)+'</details></'+tag+'>';
}
function trends(report,selected){
 const list=report.metrics.filter(m=>Model.TREND.includes(m.id));
 const metric=list.find(m=>m.id===selected)||list[0];
 const pts=metric?.trend||[];
 const vals=pts.map(x=>x.value);
 const lo=Math.min(...vals),hi=Math.max(...vals);
 const floor=Number.isFinite(lo)?Math.min(0,lo):0;
 const span=Number.isFinite(hi)?Math.max(hi-floor,0.00001):1;
 return '<section class="growth-panel" data-overall-trend><header class="growth-panel-head"><div><p class="growth-eyebrow">TRACK YOUR VOICE</p><h2>월별 측정 흐름</h2></div>'+
  (pts.length?'<div class="growth-chart-current"><span>최근 기록</span><strong>'+esc(fmt(pts.at(-1).value,metric))+'</strong><small>'+esc(pts.at(-1).month)+'</small></div>':'')+'</header>'+
 '<div class="growth-metric-picks" role="group" aria-label="표시할 지표">'+list.map(m=>
  '<button type="button" data-overall-metric="'+m.id+'" class="'+(m.id===metric.id?'active':'')+'" aria-pressed="'+(m.id===metric.id)+'">'+esc(m.title)+'</button>').join('')+'</div>'+
 (pts.length?'<p class="small muted">달마다 녹음한 곡이 다를 수 있어요. 막대 높이는 곡 전체 측정값의 월 평균이며 실력 향상 판정이 아니에요.'+(report.excludedFromTrend?' 이전 분석(v'+(metric.trendVersion===2?1:2)+') 녹음 '+report.excludedFromTrend+'개는 분석 방식이 달라 그래프에서 뺐어요.':'')+'</p>'+
 '<div class="growth-chart" role="group" aria-label="월별 측정값" style="--growth-point-count:'+pts.length+'">'+pts.map((p,i)=>{
  const height=Math.max(8,Math.round(((p.value-floor)/span)*85)+8);
  return '<button type="button" class="growth-chart-point" data-overall-month="'+esc(p.month)+'" data-overall-value="'+esc(fmt(p.value,metric))+'" data-overall-count="'+p.songs+'" aria-label="'+esc(p.month)+' '+esc(fmt(p.value,metric))+' '+p.songs+'곡" title="'+esc(p.month)+' '+esc(fmt(p.value,metric))+'"><span class="growth-chart-track"><i style="height:'+height+'%"></i></span><small>'+esc(p.month.slice(5))+'월</small></button>';
 }).join('')+'</div><p class="small muted">그래프의 막대를 누르면 해당 월의 수치와 사용된 곡 수를 확인할 수 있어요.</p>':
 '<div class="growth-chart-empty">분석 가능한 월별 녹음이 아직 없어요.</div>')+'</section>';
}
function evidence(report){
 return '<section class="growth-panel"><div class="growth-panel-head"><div><p class="growth-eyebrow">DATA QUALITY</p><h2>분석 기준</h2></div></div>'+
  '<div class="growth-evidence-grid"><p><strong>누적 곡 녹음 '+report.recordings+'개</strong><br><small>곡이 지정되고 날짜가 있는 녹음만 포함</small></p>'+
  '<p><strong>신뢰 가능한 분석 '+report.analysisCount+'개</strong><br><small>분석 전이거나 신뢰도 부족한 녹음은 수치에서 제외</small></p>'+
  (report.v1Count?'<p><strong>이전 분석(v1) '+report.v1Count+'개</strong><br><small>결과는 그대로 볼 수 있지만 음역·호흡·고음·파사지오 지표와 v2와의 전후 비교에는 쓰지 않아요</small></p>':'')+
  (report.detailMissing?'<p><strong>다시 분석하면 좋은 녹음 '+report.detailMissing+'개</strong><br><small>프레이즈·음높이별 세부 측정이 없는 v2 분석 · 보컬 연구소에서 다시 분석할 수 있어요</small></p>':'')+'</div>'+
  '<p class="small muted">동일 곡의 서로 다른 날짜에서 측정한 첫·최근 녹음을 비교하고, 가능하면 같은 프레이즈끼리 비교해요. 최고음 하나로 실력 변화를 판단하지 않고, 신뢰도가 낮거나 데이터가 부족하면 판정을 보류해요. 곡별 가중치는 동일하며 녹음 환경, 반주, 컨디션에 따라 결과가 달라질 수 있어요.</p></section>';
}
const aiRunLabel=()=>(V.db.overallAiReports||[]).some(x=>x.id==='overall-ai:all')?'전체 코치 다시 분석':'AI 전체 종합 분석하기';
function coachCard(){
 const found=(V.db.overallAiReports||[]).find(x=>x.id==='overall-ai:all');
 return '<section class="growth-panel growth-coach" data-overall-ai><header class="growth-panel-head"><div><p class="growth-eyebrow">AI VOCAL REVIEW</p><h2>AI 전체 종합 코치</h2></div><span class="growth-state">직접 요청</span></header>'+
 (found?'<p class="small muted">마지막 저장 '+esc(found.createdDate||'')+'</p>'+noteHtml(found.note):
  '<p>현재까지의 같은 곡 성장 지표와 저장된 청취 코멘트를 함께 보고, 다음 연습 방향을 제안해요.</p>')+
 '<p class="small muted">버튼을 눌렀을 때만 음정 정확도·음정 안정성·호흡 유지의 비교 결과(판정 보류 포함)와 기존 AI 코멘트 최대 5건을 전송해요. 음역·최고음·고음·파사지오 값은 보내지 않아요. 원본 음성은 전송하지 않아요. 새로운 녹음을 AI가 직접 듣는 분석이 아닙니다.</p>'+
 '<button type="button" class="btn block" data-overall-ai-run>'+aiRunLabel()+'</button><p role="status" class="small muted" data-overall-ai-state></p></section>';
}
function recommendations(report){
 const rows=report.recommendations;
 return '<section class="growth-panel"><header class="growth-panel-head"><div><p class="growth-eyebrow">NEXT PRACTICE</p><h2>다음에 연습할 것</h2></div></header>'+
 (rows.length?rows.map((m,i)=>'<article class="growth-next-item"><span class="growth-next-index">'+String(i+1).padStart(2,'0')+'</span><div><strong>'+esc(m.title)+'</strong><p>'+esc(m.practice)+'</p><small>권장 '+m.minutes+'분 · '+(m.worsened?'변화 재확인':'기초 데이터 축적')+'</small></div>'+
 '<button type="button" class="btn sm ghost" data-overall-goal="'+m.id+'">목표 담기</button></article>').join(''):
 '<p class="small muted">분석된 곡 녹음이 생기면 이곳에 추천 연습을 보여줘요.</p>')+
 '<a class="btn block ghost" href="#/practice-room">연습실에서 시작하기</a></section>';
}
function observationEvidence(){
 const entries=(V.db.practices||[]).filter(p=>{
  const room=p?.practiceRoom,id=p.songId||room?.songId;
  return room&&!room.demo&&p.practiceMode!=='training'&&id&&V.song(id)&&String(room.aiCoach||'').trim();
 }).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,5);
 return entries.map(p=>{
  const room=p.practiceRoom,txt=String(room.aiCoach||'');
  return {song:V.songTitle(p.songId||room.songId)||'곡 미지정',date:String(p.date||room.date||'').slice(0,10),
   heard:(txt.match(/(?:^|\n)\s*들리는 특징\s*[:：]\s*([^\n]+)/)?.[1]||txt.split('\n')[0]||'').slice(0,270),
   suggested:(txt.match(/(?:^|\n)\s*다음 시도\s*[:：]\s*([^\n]+)/)?.[1]||'').slice(0,200),
   comfortConcern:room.aiConditionCheck===true||room.draft?.comfort==='불편해'||!!room.draft?.symptoms?.length};
 });
}
/** AI input: only the measures the server accepts (음정 정확도·음정 안정성·호흡 유지), each with its comparison basis;
 * withheld ones go as "unknown". Range, high-note and passaggio results are never sent. */
function aiEvidence(report){
 return {mode:'overall',month:'all',recordingCount:report.recordings,analysisCount:report.analysisCount,
  analyzedSongs:report.analyzedSongs,periodStart:report.firstDate,periodEnd:report.lastDate,
  metrics:G.aiMetrics(report.metrics),observations:observationEvidence()};
}
/** slots.range: the 전체 음역 흐름 section (app/growth-range-ui.js), placed under the monthly graph. */
function render(report,metric,slots={}){
 return '<div data-growth-anchor="overview">'+summaryCard(report)+'</div>'+jumpNav(!!slots.range)+
  '<section class="growth-section-set" data-growth-anchor="skills"><header class="growth-panel-head"><div><p class="growth-eyebrow">VOICE METRICS</p><h2>6가지 성장 지표</h2><p class="growth-section-caption">같은 곡의 처음과 최근 녹음을, 가능하면 같은 프레이즈끼리 비교해요. 최고음 하나로 판단하지 않아요.</p></div></header>'+
  // No measured song recording yet: one short note instead of six identical "측정 없음" cards.
  (report.analysisCount?'<div class="growth-stats-grid">'+report.metrics.map(m=>metricCard(m)).join('')+'</div>':
   '<div class="growth-stats-empty"><i class="ph ph-waveform" aria-hidden="true"></i><p><strong>아직 측정된 곡 녹음이 없어요</strong>곡이 지정된 녹음을 분석하면 음정 정확도·음정 안정성·음역·호흡 유지·고음 안정성이 여기에 쌓여요.</p><a class="btn sm secondary" href="#/library">전체 녹음에서 분석하기</a></div>')+'</section>'+
  '<div data-growth-anchor="coach">'+coachCard()+'</div>'+
  '<div data-growth-anchor="trend">'+trends(report,metric||'intonation')+'</div>'+
  (slots.range?'<div data-growth-anchor="range">'+slots.range+'</div>':'')+
  '<div data-growth-anchor="practice">'+recommendations(report)+'</div>'+evidence(report);
}
function bind(host,report,{rerender,ownerIdentity}={}){
 host.querySelectorAll('[data-growth-jump]').forEach(button=>button.onclick=()=>{
  const target=host.querySelector('[data-growth-anchor="'+button.dataset.growthJump+'"]');
  const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  target?.scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'});
 });
 const wireTrend=()=>{
  host.querySelectorAll('[data-overall-metric]').forEach(btn=>btn.onclick=()=>{
   const id=btn.dataset.overallMetric;
   const chart=host.querySelector('[data-overall-trend]');
   if(!chart)return;
   const wrap=document.createElement('div');wrap.innerHTML=trends(report,id);
   chart.replaceWith(wrap.firstElementChild);
   wireTrend();
  });
  bindChart(host,report);
 };
 wireTrend();
 host.querySelectorAll('[data-overall-goal]').forEach(btn=>btn.onclick=()=>{
  const m=report.metrics.find(x=>x.id===btn.dataset.overallGoal);if(!m)return;
  const date=V.today(),id='overall-growth:'+date+':'+m.id;
  if((V.db.dailyGoals||[]).some(x=>x.id===id)){V.toast('오늘 이미 추가한 목표예요.');return;}
  if(V.change(db=>{db.dailyGoals||=[];db.dailyGoals.push({id,date,title:m.practice+' ('+m.minutes+'분)',source:'personal',sourceId:'overall-growth',completed:false,
    order:db.dailyGoals.filter(x=>x.date===date).length,created:Date.now()});},{silent:true})){
   btn.disabled=true;btn.textContent='담았어요';V.toast('오늘의 연습 목표에 추가했어요.');
  }else V.toast('목표를 저장하지 못했어요.','error');
 });
 const run=host.querySelector('[data-overall-ai-run]');if(!run)return;
 run.onclick=async()=>{
  if(run.disabled)return;
  if(!window.vzipCloudSignedIn?.()||!window.vzipCloudCoach){
   V.toast('AI 분석을 이용하려면 로그인과 서버 연결이 필요해요.','error');return;
  }
  const input=aiEvidence(report);
  if(!input.analysisCount&&!input.observations.length){
   V.toast('전체 분석에 사용할 녹음이나 청취 기록이 없어요.','error');return;
  }
  const identity=ownerIdentity?.()||{owner:window.vzipCloudUserId?.(),session:window.vzipCloudSessionId?.()};
  const status=host.querySelector('[data-overall-ai-state]');run.disabled=true;run.textContent='분석 중…';
  if(status)status.textContent='기존 측정값과 청취 기록을 정리하고 있어요.';
  try{
   const output=await window.vzipCloudCoach(input);
   const now=ownerIdentity?.()||{owner:window.vzipCloudUserId?.(),session:window.vzipCloudSessionId?.()};
   if(!host.isConnected||!window.vzipCloudSignedIn?.()||identity.owner!==now.owner||identity.session!==now.session||
      output?.mode!=='overall'||output.month!=='all')throw Error('화면 또는 계정이 변경되어 결과를 저장하지 않았어요.');
   const note=String(output.note||'').trim().slice(0,1800);
   if(!note)throw Error('AI 분석 결과가 비어 있어요.');
   const ok=V.change(db=>{db.overallAiReports||=[];
    const row={id:'overall-ai:all',note,created:Date.now(),createdDate:V.today(),analysisCount:input.analysisCount};
    const at=db.overallAiReports.findIndex(x=>x.id===row.id);
    if(at<0)db.overallAiReports.push(row);else db.overallAiReports[at]=row;
   },{silent:true});
   if(!ok)throw Error('AI 분석을 저장하지 못했어요.');
   if(host.isConnected)rerender?.();
   V.toast('전체 AI 분석을 저장했어요.');
  }catch(err){if(status?.isConnected)status.textContent=err.message||'분석에 실패했어요.';V.toast('전체 AI 분석에 실패했어요. 기존 기록은 유지돼요.','error');}
  // After an error the saved result (if any) is still on screen: keep the matching label.
  finally{if(run.isConnected){run.disabled=false;run.textContent=aiRunLabel();}}
 };
}
function bindChart(host,report){
 host.querySelectorAll('[data-overall-month]').forEach(btn=>btn.onclick=()=>{
  const metric=report.metrics.find(m=>m.id===host.querySelector('[data-overall-metric].active')?.dataset.overallMetric);
  V.sheet({title:btn.dataset.overallMonth+' 측정 기록',
   body:'<div class="growth-chart-dialog"><p><strong>'+esc(metric?.title||'측정 결과')+'</strong></p>'+
    '<p class="growth-chart-value">'+esc(btn.dataset.overallValue)+'</p>'+
    '<p>분석된 곡 '+esc(btn.dataset.overallCount)+'곡의 월별 평균값이에요.</p>'+
    '<p class="small muted">해당 달의 값은 녹음한 곡 구성이 달라질 수 있어 다른 달과의 단순 비교로 성장 여부를 확정할 수 없어요.</p></div>',
   variant:'compact'});
 });
}
window.VzipOverallGrowthUI={render,bind,aiEvidence,observationEvidence,noteHtml,metricCard};
})();
