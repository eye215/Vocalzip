/* VOCAL.zip — whole-library monthly vocal growth. No invented metrics or model-generated diagnoses. */
(() => {
'use strict';
const V = window.VZ, M = V?.media;
if (!V || !M) return;
const e = V.esc;
const G = window.VzipGrowthMetrics;
if (!G || !V.growthDataset) return;
// 성장 리포트 v2: the six separated measures (app/growth-metrics-model.js). ids intonation/stability/phrase stay the
// practice-plan keys; range/high/passaggio are shown but never planned (range neutral, passaggio reference only).
const definitions = G.METRICS;
const ym = s => /^\d{4}-\d{2}/.test(String(s||'')) ? String(s).slice(0,7) : '';
const avg = xs => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
let request = 0;
/* Which recordings count, whether an analysis is reliable and what a take is are decided in ONE place,
 * app/growth-dataset.js. This screen reads rule 'verdict': the song's recordings, without 노래 연습실 submissions and
 * 트레이닝 practices. */
const songRowsOf = items => V.growthDataset(items).pick('verdict');
// A recording's day is the dataset's too: its recorded date, else the Korea day it was made (not the device's day).
const dayOf = V.growthDataset.dateOf;
function group(items) {
 const months = new Map();
 for(const m of items){
  const date=ym(dayOf(m));if(!date)continue;
  const slot=months.get(date)||[];slot.push(m);months.set(date,slot);
 }
 return months;
}
const valid = V.growthDataset.ok, takeOf = V.growthDataset.take;
const referenceOf = songId => { const r = V.song(songId)?.vocalRange; return r && Number.isFinite(r.highMidi) ? r : null; };
/** 성장 통합 (#385): ONE model pass for 결과 리포트 and the 보컬 분석 tab (app/growth-hub.js), so switching tabs
 * never runs the per-song reports again. The result is never older than what it was built from: the song takes are
 * picked from the list on every call, and the stored model is reused only when every input it read is still the
 * same — each take (the recording, its song, its analysis, its date) and each song's title and confirmed range.
 * A recording added, analysed, moved to another song, or a song added or changed therefore gives a new model, with
 * or without a change event and also when the list is the same array as before. */
let shared=null;
for(const name of ['vzip:data-changed','vzip:analysis-saved','vzip:v6-media'])window.addEventListener(name,()=>{shared=null;});
function modelInputs(rows){
 const key=[],songs=new Set();
 for(const r of rows){key.push(r.m,r.songId,r.a,r.date,r.m.created);songs.add(r.songId);}
 for(const id of songs)key.push(id,V.songTitle(id),JSON.stringify(referenceOf(id)));
 return key;
}
V.growthModel=items=>{
 const rows=songRowsOf(items),key=modelInputs(rows);
 if(shared&&shared.key.length===key.length&&key.every((x,i)=>Object.is(x,shared.key[i])))return shared;
 const songItems=rows.map(r=>r.m);
 let overall;
 return shared={items,songItems,key,get overall(){
  return overall??=window.VzipOverallGrowth?.calculate(songItems,{getDate:dayOf,valid,reference:referenceOf,title:id=>V.songTitle(id)})||null;
 }};
};
/** This month's own values (no comparison): mean over reliable takes, one value per take. */
function measure(items,d){
 const vals=items.filter(valid).map(m=>{
  if(d.id==='phrase')return m.analysis.metrics?.breath?.medianPhrase;
  if(d.id==='high')return G.single(m.analysis,{reference:referenceOf(m.songId)}).high?.wobble;
  return G.value(m.analysis,d.id);
 }).filter(v=>typeof v==='number'&&Number.isFinite(v));
 return {value:avg(vals),count:vals.length};
}
/** Songs sung in BOTH months, latest comparable take of each month (same analysis version), equal song weight. */
function monthlyAggregates(current,previous){
 const songs=[...new Set(current.filter(m=>m.songId&&m.analysis?.metrics).map(m=>m.songId))];
 const reports=songs.map(songId=>({songId,title:V.songTitle(songId)||'',report:G.periodReport(previous.filter(m=>m.songId===songId).map(takeOf),current.filter(m=>m.songId===songId).map(takeOf),{reference:referenceOf(songId)})}));
 return G.aggregate(reports);
}
function narrative(rows, month, previous, song='') {
 const gains=rows.filter(r=>r.c?.state==='better'), losses=rows.filter(r=>r.c?.state==='worse');
 let header='비교 가능한 동일 곡의 녹음이 부족해 아직 좋아진 점과 나빠진 점을 판단할 수 없어요.';
 if(gains.length||losses.length)header=[gains.length?'좋아진 항목: '+gains.map(x=>x.d.title).join(', '):'뚜렷한 개선 항목은 없어요',losses.length?'보완이 필요한 항목: '+losses.map(x=>x.d.title).join(', '):'뚜렷한 악화 항목은 없어요'].join(' · ');
 else if(rows.some(r=>r.c))header='비교 가능한 지표에서 큰 변화가 확인되지 않았어요.';
 // song: 월별 분석 › 곡별 (one song's month, its own wording).
 const basis=song?(previous?previous+' 대비 · 이 곡의 녹음만 · 같은 분석 버전끼리 비교':'지난달과 비교할 녹음이 없어요. 이번 달 값만 보여 드려요.'):
  previous?previous+' 대비 · 같은 곡을 부른 녹음만 변화 판단에 사용':'전월 기록이 없어 변화 비교는 제공하지 않아요';
 return '<section class="card growth-section"><h2>이달의 변화'+(song?' · '+e(song):'')+'</h2><p>'+e(header)+'</p><p class="small muted" data-mbs-basis>'+e(basis)+'</p></section>';
}
function rowsHtml(rows) {
 const card=window.VzipOverallGrowthUI?.metricCard;
 return '<div class="growth-metrics">'+rows.map(({agg})=>card?card(agg,{scope:'monthly',cls:'card growth-metric'}):'').join('')+'</div>';
}
function prescriptions(rows){
 const judged=rows.filter(r=>r.d.judged&&r.d.practice);
 const ranked=judged.filter(r=>r.c?.state==='worse').concat(judged.filter(r=>r.c&&r.c.state!=='worse')).concat(judged.filter(r=>!r.c&&r.current.value!=null));
 const chosen=ranked.slice(0,3);
 return '<section class="card growth-section"><h2>추천 연습</h2>'+(chosen.length?'<p class="small muted">실측 변화에 기반한 규칙형 추천입니다. AI 청취 진단이나 의학적 판단이 아니에요.</p>'+chosen.map((r,i)=>'<div class="growth-task"><span class="growth-task-number">'+(i+1)+'</span><div><strong>'+e(r.d.title)+'</strong><p>'+e(r.d.practice)+'</p><p class="small muted">권장 '+r.d.minutes+'분 · '+(r.c?.state==='worse'?'전월 대비 악화된 지표':r.c?'유지·강화':'비교 데이터 부족')+'</p><button type="button" class="btn sm ghost" data-growth-goal="'+r.d.id+'">오늘의 목표에 추가</button></div></div>').join('')+'<a class="btn block" href="#/practice-room">노래 연습실에서 연습하기</a>':'<p>분석된 녹음이 쌓이면 우선 연습 과제를 제안할게요.</p>')+'</section>';
}

const previousMonth = k => { const [y,m]=k.split('-').map(Number);return (m===1?y-1:y)+'-'+String(m===1?12:m-1).padStart(2,'0'); };
/** songId: one song's month only (월별 분석 › 곡별) — the same rules, its own takes; '' for the whole month. */
function monthlyRows(key, months, songId=''){
 const only=list=>songId?list.filter(m=>m.songId===songId):list;
 const current=only(months.get(key)||[]),previous=only(months.get(previousMonth(key))||[]);
 const aggs=monthlyAggregates(current,previous);
 return definitions.map(d=>{
  const agg={...aggs.find(x=>x.id===d.id)};
  const current_=measure(current,d);
  agg.current=current_.value;agg.currentSongs=current_.count;
  // The AI still sees this month's own values (state unknown) when no song can be compared with last month.
  if(agg.latestValue==null)agg.latestValue=current_.value==null?null:Math.round(current_.value*10)/10;
  agg.measured=Math.max(agg.measured||0,current_.count);
  const c=agg.compared&&!d.reference?{before:agg.before,after:agg.after,delta:agg.before==null||agg.after==null?null:agg.after-agg.before,state:agg.state,songs:agg.compared}:null;
  return {d,agg,current:current_,c};
 });
}
/* 월별 분석 › 곡별: the songs sung this month, most takes first, and whether each can be compared with last month.
 * The last choice is a per-device convenience (localStorage); nothing is saved to the library. */
const SONG_KEY='vzip:monthly-growth-song';
const readSongPick=()=>{try{return localStorage.getItem(SONG_KEY)||'';}catch{return '';}};
const saveSongPick=id=>{try{if(id)localStorage.setItem(SONG_KEY,id);else localStorage.removeItem(SONG_KEY);}catch{}};
const SONG_STATUS={compare:'지난달과 비교 가능',only:'이번 달만',hold:'판정 보류'};
const songTitleOf=id=>V.songTitle(id)||'곡 미지정';
function monthSongs(key,months){
 const current=months.get(key)||[],previous=months.get(previousMonth(key))||[];
 return [...new Set(current.map(m=>m.songId).filter(Boolean))].map(songId=>{
  const takes=current.filter(m=>m.songId===songId).length;
  const status=!previous.some(m=>m.songId===songId)?'only':monthlyRows(key,months,songId).some(r=>r.c)?'compare':'hold';
  return {songId,title:songTitleOf(songId),takes,status};
 }).sort((a,b)=>b.takes-a.takes||a.title.localeCompare(b.title,'ko'));
}
/** The 곡별로 보기 menu. list: [{songId, title, line (html), status}]; done(songId) after a choice. Also used by
 * 성장 › 이번 달 › 달라진 것 (app/growth-month.js), with its own lines. */
function songMenu(list,picked,done){
 V.menu({title:'곡별로 보기',body:'<div class="vz-choice-list growth-song-choices">'+list.map(s=>
  '<button type="button" class="vz-choice" data-mbs-song="'+e(s.songId)+'" aria-pressed="'+(s.songId===picked)+'"><span class="growth-song-choice"><strong>'+e(s.title)+'</strong>'+
  '<small>'+s.line+'</small></span>'+(s.songId===picked?'<i class="ph ph-check" aria-hidden="true"></i>':'')+'</button>').join('')+'</div>',
  onMount:(el,close)=>el.querySelectorAll('[data-mbs-song]').forEach(b=>b.onclick=()=>{close();done(b.dataset.mbsSong);})});
}
V.growthSongMenu=songMenu;
function chooseSong(list,picked,done){
 songMenu(list.map(s=>({...s,line:'이번 달 '+s.takes+'개 · <span data-mbs-status="'+s.status+'">'+SONG_STATUS[s.status]+'</span>'})),picked,done);
}
/** 무엇이 달라졌나 opened for one song (#/growth-flow?period=all&gc=<songId>): open and scroll to that song's line. */
function focusChange(host,songId){
 if(/[?&]gc=/.test(location.hash))try{window.history.replaceState(null,'','#/growth-flow?period=all');}catch{}
 const line=[...host.querySelectorAll('[data-gc-song]')].find(x=>x.dataset.gcSong===songId);
 if(!line)return;
 const more=line.closest('details');if(more)more.open=true;
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 line.scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'});
}
function archiveMonths(months){
 const today=ym(V.today()),stored=new Set((V.db.monthlyGrowthReports||[]).map(r=>r.month));
 const pending=[...months.keys()].filter(k=>k<today&&!stored.has(k)&&months.get(k).some(valid));
 if(!pending.length)return;
 const reports=pending.map(month=>{
  const rows=monthlyRows(month,months),items=months.get(month);
  return {id:'monthly-growth:'+month,month,created:Date.now(),recordingCount:items.length,
   analysisCount:items.filter(valid).length,
   metrics:rows.map(({d,current,c,agg})=>({key:d.id,title:d.title,value:current.value,count:current.count,comparison:c,withheld:agg.withheld||0})),
   growthModel:2,
   recommendations:rows.filter(r=>r.d.judged&&r.c?.state==='worse').concat(rows.filter(r=>r.d.judged&&r.c?.state==='similar'))
    .slice(0,3).map(({d})=>({key:d.id,title:d.title,practice:d.practice,minutes:d.minutes}))};
 });
 V.change(db=>{db.monthlyGrowthReports||=[];for(const report of reports)
  if(!db.monthlyGrowthReports.some(r=>r.id===report.id))db.monthlyGrowthReports.push(report);
 },{silent:true});
}
function saveGrowthGoal(d,month){
 const date=V.today(),id='monthly-growth:'+month+':'+d.id+':'+date;
 if((V.db.dailyGoals||[]).some(g=>g.id===id))return false;
 return V.change(db=>{db.dailyGoals.push({id,date,title:d.practice+' ('+d.minutes+'분)',source:'personal',
  sourceId:'monthly-growth:'+month,completed:false,order:db.dailyGoals.filter(g=>g.date===date).length,created:Date.now()});},{silent:true});
}

/** Stored listening notes from training-only practice-room tasks must not be
 * represented as evidence about an individual song's vocal progress. */
function songListeningEntry(p,month){
 if(!p?.practiceRoom||p.practiceRoom.demo)return false;
 const songId=p.songId||p.practiceRoom.songId;
 return !!songId&&!!V.song(songId)&&p.practiceMode!=='training'&&
   ym(p.date||p.practiceRoom.date)===month&&
   !!String(p.practiceRoom.aiCoach||'').trim();
}
function listeningEvidence(month){
 const entries=(V.db.practices||[]).filter(p=>songListeningEntry(p,month))
  .sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
 if(!entries.length)return '<section class="card growth-section"><h2>AI 청취 관찰</h2><p>이달에 저장된 AI 청취 코멘트가 아직 없어요.</p><p class="small muted">곡으로 지정된 연습실 녹음에 AI 코멘트를 요청하면 여기에도 연결돼요. 트레이닝 과제의 코멘트는 제외해요.</p></section>';
 const quotes=entries.slice(0,5).map(p=>{
  const v=p.practiceRoom,note=String(v.aiCoach||'');
  const audible=note.match(/(?:^|\n)\s*들리는 특징\s*[:：]\s*([^\n]+)/)?.[1]||note.split('\n')[0];
  const follow=note.match(/(?:^|\n)\s*다음 시도\s*[:：]\s*([^\n]+)/)?.[1]||'';
  const safe=String(audible||'').slice(0,250),next=String(follow||'').slice(0,200);
  const title=V.songTitle(p.songId||v.songId)||v.title||'곡 미지정';
  const date=String(p.date||v.date||'').slice(0,10);
  return '<article class="growth-listening"><strong>'+e(title)+'</strong><span class="small muted">'+e(date)+'</span>'+
   '<p>'+e(safe)+'</p>'+(next?'<p class="small muted">AI 제안: '+e(next)+'</p>':'')+
   (v.aiConditionCheck?'<p class="small muted">소리 변화에 대한 컨디션 확인 권고가 있었어요. 녹음만으로 건강 상태를 판정한 것은 아니에요.</p>':'')+
   '</article>';
 }).join('');
 return '<section class="card growth-section"><h2>AI 청취 관찰</h2><p class="small muted">직접 요청해 저장한 AI 청취 코멘트 '+entries.length+'건 · 최근 최대 5건 표시</p>'+
 quotes+'<p class="small muted">청취 코멘트는 참고 의견입니다. 월별 개선·악화 판정은 위의 동일 곡 정량 비교만 사용합니다. AI가 듣지 않은 녹음의 특징은 추정하지 않아요.</p></section>';
}


let monthlyAiBusy=false;
function monthlyAiEvidence(month,rows,items){
 const observations=(V.db.practices||[]).filter(p=>songListeningEntry(p,month))
  .slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,5)
  .map(p=>{
   const v=p.practiceRoom,txt=String(v.aiCoach||'');
   return {song:V.songTitle(p.songId||v.songId)||'곡 미지정',date:String(p.date||v.date||'').slice(0,10),
    heard:(txt.match(/(?:^|\n)\s*들리는 특징\s*[:：]\s*([^\n]+)/)?.[1]||txt.split('\n')[0]||'').slice(0,270),
    suggested:(txt.match(/(?:^|\n)\s*다음 시도\s*[:：]\s*([^\n]+)/)?.[1]||'').slice(0,200),
    comfortConcern:v.aiConditionCheck===true||Array.isArray(v.draft?.symptoms)&&v.draft.symptoms.length>0||v.draft?.comfort==='불편해'
   };
  });
 // Only the measures the server accepts, with their comparison basis; withheld → unknown; no range/high notes.
 const metrics=G.aiMetrics(rows.map(r=>r.agg));
 return {mode:'monthly',month,recordingCount:items.length,
    analysisCount:items.filter(valid).length,metrics,observations};
}
function monthlyAiCard(month){
 const found=(V.db.monthlyAiReports||[]).find(x=>x.id==='monthly-ai:'+month);
 return '<section class="card growth-section" data-monthly-ai><h2>AI 월간 종합 코치</h2>'+
  (found?'<p class="small muted">저장된 AI 분석 · '+e(String(found.createdDate||'').slice(0,10))+'</p>'+
    (window.VzipOverallGrowthUI?.noteHtml?.(found.note)||'<div class="growth-ai-note">'+e(found.note||'').replace(/\n/g,'<br>')+'</div>'):
    '<p>이달의 측정 결과와 이미 저장된 AI 청취 코멘트를 종합해 개선점과 다음 연습을 제안해요.</p>')+
  '<p class="small muted">버튼을 누를 때만 측정 요약과 기존 AI 청취 텍스트가 서버로 전송돼요. 원본 음원은 보내지 않으며 AI API 호출이 발생합니다. AI 의견은 참고용이며 녹음 상태가 달라지면 결과도 달라질 수 있어요.</p>'+
  '<button type="button" class="btn ghost" data-monthly-ai-run>'+ (found?'분석 다시 생성':'AI 월간 종합 분석하기')+'</button>'+
  '<p class="small muted" role="status" data-monthly-ai-state></p></section>';
}

function archiveCard(month){
 const report=(V.db.monthlyGrowthReports||[]).find(r=>r.month===month);
 if(!report)return '';
 const improved=report.metrics.filter(x=>x.comparison?.state==='better').map(x=>x.title);
 const worsened=report.metrics.filter(x=>x.comparison?.state==='worse').map(x=>x.title);
 return '<section class="card growth-section"><h2>보관된 월간 리포트</h2><p class="small muted">분석 '+report.analysisCount+'개를 바탕으로 '+e(month)+'에 대한 결과를 보관했어요.</p>'+
 '<p>개선: '+e(improved.join(', ')||'판정 불가')+'</p><p>보완: '+e(worsened.join(', ')||'판정 불가')+'</p>'+
 '<p class="small muted">아래 수치는 새로 추가된 녹음까지 포함한 최신 집계일 수 있어요.</p></section>';
}

function history(months){
 const ordered=[...months.keys()].sort();
 return '<section class="card growth-section"><h2>월별 기록</h2><div class="growth-months">'+ordered.map(key=>{
  const ms=months.get(key),eligible=ms.filter(valid).length;
  return '<button type="button" class="growth-month" data-month="'+key+'"><strong>'+e(key.replace('-','년 ')+'월')+'</strong><span class="small muted">곡 녹음 '+ms.length+'개 · 분석 가능 '+eligible+'개</span></button>';
 }).join('')+'</div></section>';
}
async function mount(host){
 const my=++request;
 try {
  const items=await M.list();if(my!==request||!host.isConnected)return;
  const songItems=V.growthModel(items).songItems;
  const months=group(songItems); archiveMonths(months);
  const keys=[...new Set([ym(V.today()),...months.keys(),...(V.db.monthlyGrowthReports||[]).map(r=>r.month),...(V.db.practicePlans||[]).filter(p=>p.kind==='monthly-vocal').map(p=>ym(p.sourceMonth||p.startDate))].filter(Boolean))].sort().reverse();
  const currentKey=ym(V.today());
  let selected=keys.includes(currentKey)?currentKey:keys[0];
  // 지난 흐름 (#/growth-flow): ?period=month is 월별 분석, anything else 전체 분석 (?period=week is 주간 요약's).
  const query=new URLSearchParams(location.hash.split('?')[1]||'');
  let mode=query.get('period')==='month'?'monthly':'overall';
  // 월별 분석 › 곡별: the chosen song (kept while months change); gc: 무엇이 달라졌나 opened for one song.
  let songPick=readSongPick(),focusSong=query.get('gc')||'';
  if(songPick&&!V.song(songPick))songPick='';
  // After archiveMonths (it may save a past month's report): the model is asked for again, never taken from before.
  const overall=V.growthModel(items).overall;
  const overallUi=window.VzipOverallGrowthUI;
  // 전체 음역 흐름 (app/growth-range-ui.js): its own selection of the whole list (곡·보이스 체크·트레이닝·레슨 녹음).
  const rangeUi=window.VzipGrowthRangeUI;
  const pageHead='<header class="growth-page-header"><div><p class="growth-eyebrow">VOCAL.zip · GROWTH</p><h2>보컬 성장</h2><p>녹음에서 확인한 변화와 다음 연습을 한곳에서</p></div></header>'+(V.voiceCheck?.entryHtml?.()||'');
  // The period control of 결과 리포트 (design guide §26): smaller than the 성장 tabs above and inside the content.
  const tabs=()=>'<div class="growth-view-tabs growth-range" role="group" aria-label="성장 분석 범위"><span class="growth-range-label" aria-hidden="true">기간</span>'+
   '<button type="button" data-growth-mode="overall" aria-pressed="'+(mode==='overall')+'" class="'+(mode==='overall'?'active':'')+'">전체 분석</button>'+
   '<button type="button" data-growth-mode="monthly" aria-pressed="'+(mode==='monthly')+'" class="'+(mode==='monthly'?'active':'')+'">월별 분석</button>'+
   (window.VzipWeeklySummary?'<a class="growth-weekly-tab" href="#/growth-flow?period=week" data-growth-replace data-growth-period="week">주간 요약</a>':'')+'</div>';
  const bindTabs=()=>host.querySelectorAll('[data-growth-mode]').forEach(btn=>btn.onclick=()=>{
   if(btn.dataset.growthMode===mode)return;
   mode=btn.dataset.growthMode;
   // The address follows the period (no new history entry), so a reload or 뒤로 from a screen opened here keeps it.
   // window.history: this file has its own history() (the 월별 기록 card). The period is also this device's 성장 period.
   try{window.history.replaceState(null,'',mode==='monthly'?'#/growth-flow?period=month':'#/growth-flow?period=all');}catch{}
   V.growthPeriod?.set(mode==='monthly'?'month':'all');
   render();
  });
  let renderSerial=0;
  const render=()=>{
   renderSerial++;
   const visibleSerial=renderSerial;
   if(mode==='overall'&&overall&&overallUi){
    // 무엇이 달라졌나 (app/growth-changes-ui.js): only comparable changes, above the existing report (whose numbers it leaves alone).
    host.innerHTML=pageHead+tabs()+(window.VzipGrowthChangesUI?'<div class="gc-host" data-growth-changes></div>':'')+'<div data-overall-body>'+overallUi.render(overall,undefined,{range:rangeUi?.html(items)||''})+'</div>'+
      '<p class="small muted growth-disclaimer">표시되는 수치는 음성 측정에 기반한 참고 정보이며 발성 건강, 감정 표현 또는 악보 대비 정확성을 평가하지 않아요. 전·후 비교는 서로 다른 날 부른 동일 곡을 사용합니다.</p>';
    bindTabs();
    overallUi.bind(host.querySelector('[data-overall-body]'),overall,{rerender:render});
    rangeUi?.bind(host,items);
    const changes=window.VzipGrowthChangesUI?.mount(host.querySelector('[data-growth-changes]'),items);
    if(focusSong){const id=focusSong;focusSong='';Promise.resolve(changes).then(()=>{if(host.isConnected)focusChange(host,id);});}
    return;
   }
   if(!keys.length){host.innerHTML=pageHead+tabs()+'<div class="empty"><p>아직 날짜가 있는 녹음이 없어요.</p></div>';bindTabs();return;}
   const prev=previousMonth(selected);
   const current=months.get(selected)||[],previous=months.get(prev)||[];
   // 곡별: only when the chosen song has takes this month; otherwise 전체 with a short note (the choice is kept).
   const songOn=!!songPick&&current.some(m=>m.songId===songPick);
   const own=songOn?current.filter(m=>m.songId===songPick):current;
   const rows=monthlyRows(selected,months,songOn?songPick:'');
   const validCount=own.filter(valid).length;
   const songName=songOn?songTitleOf(songPick):'';
   const hadPrevious=songOn?previous.some(m=>m.songId===songPick):previous.length>0;
   const changeIds=songOn?(window.VzipGrowthChangesUI?.songs?.(items)||[]):[];
   const scope='<div class="growth-song-scope" role="group" aria-label="월별 분석 범위">'+
     '<button type="button" data-mbs-scope="all" aria-pressed="'+!songOn+'">전체</button>'+
     '<button type="button" data-mbs-scope="song" aria-pressed="'+songOn+'" aria-haspopup="dialog"><span>'+(songOn?e(songName):'곡별')+'</span><i class="ph ph-caret-down" aria-hidden="true"></i></button></div>'+
     (songPick&&!songOn?'<p class="small muted growth-song-note" data-mbs-fallback>'+e(songTitleOf(songPick))+' 녹음이 이 달에는 없어 전체를 보여 드려요.</p>':'');
   const tiles=songOn?
     '<div class="growth-month-overview" data-mbs-tiles><div><span>이 곡 녹음</span><strong>'+own.length+'</strong><small>개</small></div>'+
     '<div><span>분석 가능</span><strong>'+validCount+'</strong><small>개</small></div>'+
     '<div><span>지난달 대비 비교</span><strong>'+rows.filter(r=>r.c).length+'</strong><small>항목</small></div></div>':
     '<div class="growth-month-overview"><div><span>곡 녹음</span><strong>'+current.length+'</strong><small>개</small></div>'+
     '<div><span>분석 가능한 녹음</span><strong>'+validCount+'</strong><small>개</small></div>'+
     '<div><span>같은 곡 비교</span><strong>'+rows.filter(r=>r.c).length+'</strong><small>항목</small></div></div>';
   const songLinks=songOn?'<div class="growth-song-links"><a class="btn sm ghost" href="#/vocal-lab/'+encodeURIComponent(songPick)+'" data-mbs-link="lab"><i class="ph ph-waveform" aria-hidden="true"></i>이 곡 자세히</a>'+
     (changeIds.includes(songPick)?'<a class="btn sm ghost" href="#/growth-flow?period=all&amp;gc='+encodeURIComponent(songPick)+'" data-growth-replace data-mbs-link="changes"><i class="ph ph-arrows-left-right" aria-hidden="true"></i>무엇이 달라졌나</a>':'')+'</div>'+
     '<p class="small muted growth-song-note" data-mbs-only>곡별 보기는 변화만 보여요. AI 코치·추천·계획·지난 기록은 전체에서 볼 수 있어요.</p>':'';
   host.innerHTML=pageHead+tabs()+
   '<header class="growth-intro"><div><p class="growth-eyebrow">MONTHLY REVIEW</p><h2>이번 달의 변화</h2></div>'+
    '<label class="field"><span>분석 월</span><select data-growth-select>'+keys.map(k=>'<option value="'+k+'" '+(k===selected?'selected':'')+'>'+e(k.replace('-','년 ')+'월')+'</option>').join('')+'</select></label></header>'+
   scope+tiles+(songOn?songLinks+
   '<div class="growth-month-group" data-month-section="results">'+narrative(rows,selected,hadPrevious?prev:'',songName)+
     '<div class="growth-month-section-title"><h3>6가지 성장 지표</h3><small>이 곡의 지난달 녹음과만 비교 · 근거가 부족하면 판정 보류</small></div>'+rowsHtml(rows)+'</div>':
   '<nav class="growth-jumps growth-month-jumps" aria-label="월별 성장 빠른 이동">'+
     '<button type="button" data-monthly-jump="results">변화</button>'+
     '<button type="button" data-monthly-jump="ai">AI 코치</button>'+
     '<button type="button" data-monthly-jump="practice">추천·계획</button>'+
     '<button type="button" data-monthly-jump="history">지난 기록</button></nav>'+
   '<div class="growth-month-group" data-month-section="results">'+narrative(rows,selected,previous.length?prev:'')+
     '<div class="growth-month-section-title"><h3>6가지 성장 지표</h3><small>지난달과 같은 곡만 비교 · 근거가 부족하면 판정 보류</small></div>'+rowsHtml(rows)+
     (rangeUi?.monthHtml(items,selected)||'')+'</div>'+
   '<div data-month-section="ai">'+monthlyAiCard(selected)+'</div>'+
   '<div class="growth-month-group" data-month-section="practice">'+prescriptions(rows)+'<div data-monthly-plans></div></div>'+
   '<details class="growth-secondary"><summary><span><i class="ph ph-waveform" aria-hidden="true"></i> AI 청취 기록</span><small>저장된 청취 의견</small></summary>'+listeningEvidence(selected)+'</details>'+
   '<details class="growth-secondary" data-month-section="history"><summary><span><i class="ph ph-clock-counter-clockwise" aria-hidden="true"></i> 지난 기록·보관 리포트</span><small>월별 기록과 보관 결과</small></summary>'+
     archiveCard(selected)+history(months)+'</details>')+
   '<p class="small muted growth-disclaimer">곡·녹음 환경·반주에 따라 수치가 달라질 수 있어요. 동일 곡의 전월 기록만 개선·악화로 비교하고, 최고음 하나로 실력 변화를 판단하지 않아요. 파사지오는 음정 데이터만으로 판별할 수 없어 참고로만 보여 줘요. 호흡 지지·발성 건강·감정 표현은 이 수치로 판단하지 않아요. AI 분석은 버튼을 누를 때만 실행해요.</p>';

   const aiButton=host.querySelector('[data-monthly-ai-run]');
   if(aiButton)aiButton.onclick=async()=>{
    if(monthlyAiBusy)return;
    if(!window.vzipCloudSignedIn?.()||!window.vzipCloudCoach){
      V.toast('AI 분석을 이용하려면 로그인과 서버 연결이 필요해요.','error');return;
    }
    const evidence=monthlyAiEvidence(selected,rows,current);
    if(!evidence.analysisCount&&!evidence.observations.length){
      V.toast('이달에 분석 가능한 녹음이나 청취 코멘트가 없어요.','error');return;
    }
    const month=selected,owner=window.vzipCloudUserId?.(),origin=window.vzipCloudSessionId?.();
    const state=host.querySelector('[data-monthly-ai-state]');
    monthlyAiBusy=true;aiButton.disabled=true;aiButton.textContent='AI 분석 중…';
    if(state)state.textContent='요약 데이터를 분석하고 있어요. 화면을 닫으면 완료 결과가 저장되지 않을 수 있어요.';
    try{
      const response=await window.vzipCloudCoach(evidence);
      if(!host.isConnected||my!==request||!window.vzipCloudSignedIn?.()||owner!==window.vzipCloudUserId?.()||
          origin!==window.vzipCloudSessionId?.()||response?.mode!=='monthly'||response.month!==month)
        throw Error('화면이나 계정이 변경되어 결과를 저장하지 않았어요.');
      const note=String(response.note||'').trim().slice(0,1800);
      if(!note)throw Error('AI 분석 결과가 비어 있어요.');
      const ok=V.change(db=>{
        db.monthlyAiReports||=[];
        const id='monthly-ai:'+month,at=db.monthlyAiReports.findIndex(x=>x.id===id);
        const row={id,month,note,created:Date.now(),createdDate:V.today(),
          analysisCount:evidence.analysisCount,observationsCount:evidence.observations.length};
        if(at===-1)db.monthlyAiReports.push(row);else db.monthlyAiReports[at]=row;
      },{silent:true});
      if(!ok)throw Error('AI 리포트 저장에 실패했어요.');
      // A different month can be selected while the model is generating.
      // Never replace the currently displayed month's card with the old result.
      if(visibleSerial===renderSerial&&selected===month)render();
      V.toast('월간 AI 리포트를 저장했어요.');
    }catch(err){if(state?.isConnected)state.textContent=err.message||'AI 리포트 생성에 실패했어요.';V.toast('월간 분석에 실패했어요. 기존 기록은 유지돼요.','error');}
    finally{monthlyAiBusy=false;if(aiButton.isConnected){aiButton.disabled=false;aiButton.textContent='AI 월간 종합 분석하기';}}
   };

   bindTabs();
   host.querySelectorAll('[data-monthly-jump]').forEach(button=>button.onclick=()=>{
    const target=host.querySelector('[data-month-section="'+button.dataset.monthlyJump+'"]');
    if(button.dataset.monthlyJump==='history'&&target?.tagName==='DETAILS')target.open=true;
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target?.scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'});
   });
   host.querySelector('[data-mbs-scope="all"]').onclick=()=>{if(!songPick)return;songPick='';saveSongPick('');render();};
   host.querySelector('[data-mbs-scope="song"]').onclick=()=>{
    const list=monthSongs(selected,months);
    if(!list.length){V.toast('이 달에는 곡 녹음이 없어요.');return;}
    chooseSong(list,songOn?songPick:'',id=>{songPick=id;saveSongPick(id);if(host.isConnected)render();});
   };
   if(!songOn)V.monthlyPracticePlans?.(host.querySelector('[data-monthly-plans]'),selected,songItems,rows);
   host.querySelectorAll('[data-growth-goal]').forEach(b=>b.onclick=()=>{
    const d=definitions.find(x=>x.id===b.dataset.growthGoal);
    if(!d)return;
    if(saveGrowthGoal(d,selected)){b.disabled=true;b.textContent='추가됨';V.toast('오늘의 목표에 추가했어요.');}
    else V.toast('이미 오늘의 목표에 있어요.');
   });
   host.querySelector('[data-growth-select]').onchange=ev=>{selected=ev.target.value;render();};
   host.querySelectorAll('[data-month]').forEach(b=>b.onclick=()=>{selected=b.dataset.month;render();window.scrollTo({top:0,behavior:'smooth'});});
  };
  render();
 }catch(err){if(my===request)host.innerHTML='<div class="empty"><p>녹음 목록을 불러오지 못했어요.</p><p class="small muted">'+e(err.message)+'</p></div>';}
}
/* ---------- shared with 성장 › 이번 달 (app/growth-month.js) ---------- */
/** The takes the "늘었나" numbers count: rule 'verdict' (the model 결과 리포트 has always used), or with the 연습 녹음
 * 포함 switch verdictRule({practice:true}) (app/growth-dataset.js). */
const songItemsFor=(items,practice)=>practice===true?V.growthDataset(items).verdict({practice:true}).map(r=>r.m):V.growthModel(items).songItems;
/** 전체 분석's report for these takes (one song's only with songId): switch off and every song is the shared
 * V.growthModel one (the same numbers as 결과 리포트). */
V.growthOverallFor=(items,{practice=false,songId=''}={})=>practice!==true&&!songId?V.growthModel(items).overall:
 window.VzipOverallGrowth?.calculate(songItemsFor(items,practice).filter(m=>!songId||m.songId===songId),{getDate:dayOf,valid,reference:referenceOf,title:id=>V.songTitle(id)})||null;
/** 이달의 변화 and the six measure cards of one month (월별 분석's own rules), optionally for one song or with the
 * practice switch. Switch off and no song: exactly what 월별 분석 shows for that month. */
V.monthlyGrowthDetail=(items,{month,songId='',practice=false}={})=>{
 const months=group(songItemsFor(items,practice)),key=month||ym(V.today());
 const current=months.get(key)||[],previous=months.get(previousMonth(key))||[];
 const songOn=!!songId&&current.some(m=>m.songId===songId);
 const rows=monthlyRows(key,months,songOn?songId:'');
 const had=songOn?previous.some(m=>m.songId===songId):previous.length>0;
 return {rows,current:songOn?current.filter(m=>m.songId===songId):current,html:narrative(rows,key,had?previousMonth(key):'',songOn?songTitleOf(songId):'')+
  '<div class="growth-month-section-title"><h3>6가지 성장 지표</h3><small>'+(songOn?'이 곡의 지난달 녹음과만 비교':'지난달과 같은 곡만 비교')+' · 근거가 부족하면 판정 보류</small></div>'+rowsHtml(rows)};
};

/* ---------- 지난 흐름 (#/growth-flow) ---------- */
// 성장 개편 안 B (phase 2): 결과 리포트's 전체 분석 · 월별 분석 · 주간 요약, unchanged, as the sub-page "지난 흐름 보기" of
// 성장 › 이번 달 (app/growth-month.js). ?period=all | month | week; the period row inside switches between them in
// place (one history entry). 주간 has no AI coach: the coach server takes a month or the whole record only.
V.route('growth-flow',{title:'지난 흐름',back:true,tab:'growth',noAutoRefresh:true,
 render:r=>r?.query?.get('period')==='week'&&V.weeklySummary?
  '<p class="growth-flow-note" data-flow-week-ai><i class="ph ph-info" aria-hidden="true"></i><span>주간 AI 코치는 아직 없어요. AI 코치는 월별·전체에서 쓸 수 있어요.</span></p><div class="ws-page" data-weekly-summary></div>':
  '<div data-growth class="growth-page"><div class="empty compact">분석 기록을 불러오는 중…</div></div>',
 mount(main,r){
  const period=r?.query?.get('period');
  const weekly=main.querySelector('[data-weekly-summary]');
  if(weekly){V.growthPeriod?.set('week');V.weeklySummary.mount(weekly,r.query);return;}
  V.growthPeriod?.set(period==='month'?'month':'all');
  mount(main.querySelector('[data-growth]'));
 },
 leave(){request++;V.weeklySummary?.leave?.();}
});
window.addEventListener('vzip:analysis-saved',()=>{if(document.body.dataset.vzRoute==='growth-flow'){const host=document.querySelector('[data-growth]');if(host)mount(host);}});
})();