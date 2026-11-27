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
/** 다음 연습: the first three of the ONE list (VZ.nextPractice, app/next-practice.js) and 다음 연습 전체 보기; this month's
 * own rule-based picks (from its measurements, with their 오늘의 목표에 추가) folded under it. */
function prescriptions(rows){
 const judged=rows.filter(r=>r.d.judged&&r.d.practice);
 const ranked=judged.filter(r=>r.c?.state==='worse').concat(judged.filter(r=>r.c&&r.c.state!=='worse')).concat(judged.filter(r=>!r.c&&r.current.value!=null));
 const chosen=ranked.slice(0,3);
 return '<section class="card growth-section"><h2>다음 연습</h2>'+(V.nextPractice?.topHtml?.({limit:3})||'')+(chosen.length?'<details class="growth-own-picks" data-growth-own-picks><summary>이 달 측정으로 고른 연습 '+chosen.length+'개</summary><p class="small muted">실측 변화에 기반해 규칙으로 고른 연습이에요. AI 청취 진단이나 의학적 판단이 아니에요.</p>'+chosen.map((r,i)=>'<div class="growth-task"><span class="growth-task-number">'+(i+1)+'</span><div><strong>'+e(r.d.title)+'</strong><p>'+e(r.d.practice)+'</p><p class="small muted">권장 '+r.d.minutes+'분 · '+(r.c?.state==='worse'?'전월 대비 악화된 지표':r.c?'유지·강화':'비교 데이터 부족')+'</p><button type="button" class="btn sm ghost" data-growth-goal="'+r.d.id+'">오늘의 목표에 추가</button></div></div>').join('')+'</details>':'<p>분석된 녹음이 쌓이면 우선 연습 과제를 제안할게요.</p>')+'</section>';
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
/** 오늘의 연습's 녹음 step comments (app/daily-set-model.js coachNotes) under the same rule: only a comment tied to a
 * song that exists counts as evidence about a song; a set step without one (training only) is left out. */
function setListeningEntries(month){
 let notes=[];try{notes=window.VzipDailySet?.coachNotes?.(V.db)||[];}catch(error){console.error(error);}
 return notes.filter(n=>ym(n.date)===month&&n.songId&&!!V.song(n.songId))
  .map(n=>({date:n.date.slice(0,10),at:n.at,title:V.songTitle(n.songId)||'곡 미지정',note:n.note,check:false,set:true}));
}
function listeningEvidence(month){
 const room=(V.db.practices||[]).filter(p=>songListeningEntry(p,month)).map(p=>{const v=p.practiceRoom;
  return {date:String(p.date||v.date||'').slice(0,10),at:Number(p.created)||0,title:V.songTitle(p.songId||v.songId)||v.title||'곡 미지정',note:String(v.aiCoach||''),check:!!v.aiConditionCheck,set:false};});
 // Newest first across the 노래 연습실 and 오늘의 연습, the same limit of 5.
 const entries=[...room,...setListeningEntries(month)].sort((a,b)=>b.date.localeCompare(a.date)||b.at-a.at);
 if(!entries.length)return '<section class="card growth-section"><h2>AI 청취 관찰</h2><p>이달에 저장된 AI 청취 코멘트가 아직 없어요.</p><p class="small muted">곡으로 지정된 연습실 녹음이나 오늘의 연습 녹음에 AI 코멘트를 요청하면 여기에도 연결돼요. 트레이닝 과제의 코멘트는 제외해요.</p></section>';
 const quotes=entries.slice(0,5).map(x=>{
  const note=x.note;
  const audible=note.match(/(?:^|\n)\s*들리는 특징\s*[:：]\s*([^\n]+)/)?.[1]||note.split('\n')[0];
  const follow=note.match(/(?:^|\n)\s*다음 시도\s*[:：]\s*([^\n]+)/)?.[1]||'';
  const safe=String(audible||'').slice(0,250),next=String(follow||'').slice(0,200);
  return '<article class="growth-listening"'+(x.set?' data-listening-set':'')+'><strong>'+e(x.title)+'</strong><span class="small muted">'+e(x.date)+(x.set?' · 오늘의 연습':'')+'</span>'+
   '<p>'+e(safe)+'</p>'+(next?'<p class="small muted">AI 제안: '+e(next)+'</p>':'')+
   (x.check?'<p class="small muted">소리 변화에 대한 컨디션 확인 권고가 있었어요. 녹음만으로 건강 상태를 판정한 것은 아니에요.</p>':'')+
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
/** What 보내기 sends, said before anything is sent: the card's own words with this month's counts. */
function monthlySendText(x){
 const names=(x.metrics||[]).map(m=>G.METRICS.find(d=>d.id===m.key)?.title||m.key).join('·')||'음정 정확도·음정 안정성·호흡 유지';
 return '버튼을 누를 때만 아래 측정 요약과 기존 AI 청취 텍스트가 AI 서버로 전송돼요.\n· '+x.month.replace('-','년 ')+'월 측정 요약 — 곡 녹음 '+x.recordingCount+'개, 분석 가능 '+x.analysisCount+'개, '+names+'의 지난달 비교 결과(판정 보류 포함)\n'+
  '· 저장된 AI 청취 코멘트 '+(x.observations||[]).length+'건 (곡 이름·날짜·들린 특징·다음 시도, 최대 5건)\n'+
  '원본 음원은 보내지 않으며, 음역·최고음 값도 보내지 않아요. AI 의견은 참고용이에요.';
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
/** The report of one period into host (성장 › 나, app/growth-month.js; 큰 정리 3번): kind 'month' (month 'YYYY-MM', this
 * month by default) or 'all'. What #/growth-flow showed for that period, with its renderers and numbers; the period is
 * chosen above it (나's 주 · 월 · 전체 and ‹ ›). onMonth(key): 지난 기록's month buttons. */
async function mount(host,{kind='month',month='',onMonth=null}={}){
 const my=++request;
 try {
  const items=await M.list();if(my!==request||!host.isConnected)return;
  const songItems=V.growthModel(items).songItems;
  const months=group(songItems); archiveMonths(months);
  const currentKey=ym(V.today());
  let selected=/^\d{4}-\d{2}$/.test(month)?month:currentKey;
  const mode=kind==='all'?'overall':'monthly';
  // 월별 › 곡별: the last song chosen (its screen opens at this month).
  let songPick=readSongPick();
  if(songPick&&!V.song(songPick))songPick='';
  // After archiveMonths (it may save a past month's report): the model is asked for again, never taken from before.
  const overall=V.growthModel(items).overall;
  const overallUi=window.VzipOverallGrowthUI;
  // 전체 음역 흐름 (app/growth-range-ui.js): its own selection of the whole list (곡·보이스 체크·트레이닝·레슨 녹음).
  const rangeUi=window.VzipGrowthRangeUI;
  // The page head, the period tabs and the month picker of #/growth-flow are 나's period switch and ‹ › now.
  let renderSerial=0;
  const render=()=>{
   renderSerial++;
   const visibleSerial=renderSerial;
   if(mode==='overall'&&overall&&overallUi){
    // 무엇이 달라졌나 for 전체 is 나's 달라진 것 › 곡마다 자세히, above this report.
    host.innerHTML='<div data-overall-body>'+overallUi.render(overall,undefined,{range:rangeUi?.html(items)||''})+'</div>'+
      '<p class="small muted growth-disclaimer">표시되는 수치는 음성 측정에 기반한 참고 정보이며 발성 건강, 감정 표현 또는 악보 대비 정확성을 평가하지 않아요. 전·후 비교는 서로 다른 날 부른 동일 곡을 사용합니다.</p>';
    overallUi.bind(host.querySelector('[data-overall-body]'),overall,{rerender:render});
    rangeUi?.bind(host,items);
    return;
   }
   const prev=previousMonth(selected);
   const current=months.get(selected)||[],previous=months.get(prev)||[];
   // 곡별 (큰 정리 2번): one song's month is the song screen at that month's chip (#/growth-song/<id>?month=), with the same
   // numbers (V.monthlyGrowthDetail); this report is always the whole month.
   const rows=monthlyRows(selected,months);
   const validCount=current.filter(valid).length;
   const scope='<div class="growth-song-scope" role="group" aria-label="월별 분석 범위">'+
     '<button type="button" data-mbs-scope="all" aria-pressed="true">전체</button>'+
     '<button type="button" data-mbs-scope="song" aria-pressed="false" aria-haspopup="dialog"><span>곡별</span><i class="ph ph-caret-down" aria-hidden="true"></i></button></div>';
   const tiles='<div class="growth-month-overview"><div><span>곡 녹음</span><strong>'+current.length+'</strong><small>개</small></div>'+
     '<div><span>분석 가능한 녹음</span><strong>'+validCount+'</strong><small>개</small></div>'+
     '<div><span>같은 곡 비교</span><strong>'+rows.filter(r=>r.c).length+'</strong><small>항목</small></div></div>';
   host.innerHTML=scope+tiles+
   '<nav class="growth-jumps growth-month-jumps" aria-label="월별 성장 빠른 이동">'+
     '<button type="button" data-monthly-jump="results">변화</button>'+
     '<button type="button" data-monthly-jump="ai">AI 코치</button>'+
     '<button type="button" data-monthly-jump="practice">다음 연습</button>'+
     '<button type="button" data-monthly-jump="history">지난 기록</button></nav>'+
   '<div class="growth-month-group" data-month-section="results">'+narrative(rows,selected,previous.length?prev:'')+
     '<div class="growth-month-section-title"><h3>6가지 성장 지표</h3><small>지난달과 같은 곡만 비교 · 근거가 부족하면 판정 보류</small></div>'+rowsHtml(rows)+
     (rangeUi?.monthHtml(items,selected)||'')+'</div>'+
   '<div data-month-section="ai">'+monthlyAiCard(selected)+'</div>'+
   '<div class="growth-month-group" data-month-section="practice">'+prescriptions(rows)+'<div data-monthly-plans></div></div>'+
   '<details class="growth-secondary"><summary><span><i class="ph ph-waveform" aria-hidden="true"></i> AI 청취 기록</span><small>저장된 청취 의견</small></summary>'+listeningEvidence(selected)+'</details>'+
   '<details class="growth-secondary" data-month-section="history"><summary><span><i class="ph ph-clock-counter-clockwise" aria-hidden="true"></i> 지난 기록·보관 리포트</span><small>월별 기록과 보관 결과</small></summary>'+
     archiveCard(selected)+history(months)+'</details>'+
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
    // Asked first (큰 정리 3번): what is sent is said, and nothing goes out before 보내기 or after 취소.
    monthlyAiBusy=true;aiButton.disabled=true;
    const ok=await V.confirm('AI 월간 종합 받기',monthlySendText(evidence),{ok:'보내기'});
    monthlyAiBusy=false;aiButton.disabled=false;
    // The report can be drawn again while the question is open (a sync or the recordings arriving, even into a new
    // host): 보내기 still sends for the month that was asked about. Only leaving 성장's 월 report drops it.
    const stillHere=()=>host.isConnected||!!document.querySelector('[data-gm-report="month"]');
    if(!ok||!stillHere())return;
    const month=selected,owner=window.vzipCloudUserId?.(),origin=window.vzipCloudSessionId?.();
    const state=host.querySelector('[data-monthly-ai-state]');
    monthlyAiBusy=true;aiButton.disabled=true;aiButton.textContent='AI 분석 중…';
    if(state)state.textContent='요약 데이터를 분석하고 있어요. 화면을 닫으면 완료 결과가 저장되지 않을 수 있어요.';
    try{
      const response=await window.vzipCloudCoach(evidence);
      // ‹ › to another period while it runs (a new report in the same host) keeps the result for its own month; leaving
      // 성장 (host gone) or another account does not.
      if(!stillHere()||!window.vzipCloudSignedIn?.()||owner!==window.vzipCloudUserId?.()||
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
      if(my===request&&visibleSerial===renderSerial&&selected===month)render();
      else if(my!==request||!host.isConnected)V.softRender?.(); // drawn again meanwhile: draw once more with the saved report
      V.toast('월간 AI 리포트를 저장했어요.');
    }catch(err){if(state?.isConnected)state.textContent=err.message||'AI 리포트 생성에 실패했어요.';V.toast('월간 분석에 실패했어요. 기존 기록은 유지돼요.','error');}
    finally{monthlyAiBusy=false;if(aiButton.isConnected){aiButton.disabled=false;aiButton.textContent='AI 월간 종합 분석하기';}}
   };

   host.querySelectorAll('[data-monthly-jump]').forEach(button=>button.onclick=()=>{
    const target=host.querySelector('[data-month-section="'+button.dataset.monthlyJump+'"]');
    if(button.dataset.monthlyJump==='history'&&target?.tagName==='DETAILS')target.open=true;
    const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    target?.scrollIntoView({behavior:reduced?'auto':'smooth',block:'start'});
   });
   host.querySelector('[data-mbs-scope="song"]').onclick=()=>{
    const list=monthSongs(selected,months);
    if(!list.length){V.toast('이 달에는 곡 녹음이 없어요.');return;}
    // The chosen song opens on its own screen at this month (kept on this device as the last choice).
    chooseSong(list,songPick,id=>{songPick=id;saveSongPick(id);V.nav('#/growth-song/'+encodeURIComponent(id)+'?month='+selected);});
   };
   V.monthlyPracticePlans?.(host.querySelector('[data-monthly-plans]'),selected,songItems,rows);
   V.nextPractice?.bindTop?.(host.querySelector('[data-month-section="practice"]'));
   host.querySelectorAll('[data-growth-goal]').forEach(b=>b.onclick=()=>{
    const d=definitions.find(x=>x.id===b.dataset.growthGoal);
    if(!d)return;
    if(saveGrowthGoal(d,selected)){b.disabled=true;b.textContent='추가됨';V.toast('오늘의 목표에 추가했어요.');}
    else V.toast('이미 오늘의 목표에 있어요.');
   });
   // 지난 기록's months: that month in 나 (its ‹ › and address follow).
   host.querySelectorAll('[data-month]').forEach(b=>b.onclick=()=>{if(onMonth)onMonth(b.dataset.month);else{selected=b.dataset.month;render();}window.scrollTo({top:0,behavior:'smooth'});});
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

/* ---------- the report of 성장 › 나 (큰 정리 3번) ---------- */
V.growthReport={mount,leave:()=>{request++;}};
/** 지난 흐름 (#/growth-flow?period=week|month|all, with week= / month= / gc=) was its own screen: it is 성장 › 나 with that
 * period chosen now. The address leads there (replaced, one history entry). */
V.route('growth-flow',{title:'성장',tab:'growth',noAutoRefresh:true,
 render:()=>'',
 mount(main,r){
  const q=r?.query,period=q?.get('period');
  const kind=period==='week'||period==='month'?period:'all';
  // 전체 showed 무엇이 달라졌나 on top: it opens with 곡마다 자세히 (that card) open.
  const extra=kind==='week'&&q?.get('week')?'&week='+encodeURIComponent(q.get('week')):kind==='month'&&q?.get('month')?'&month='+encodeURIComponent(q.get('month')):kind==='all'?(q?.get('gc')?'&gc='+encodeURIComponent(q.get('gc')):'&changes=1'):'';
  location.replace('#/vocal-growth?period='+kind+extra);
 }
});

})();