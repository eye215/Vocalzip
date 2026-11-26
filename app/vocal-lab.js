/* 성장 › 곡 › 곡 하나 — the ONE song screen (#/growth-song/<songId>; 큰 정리 2번, 2026-11-27). 곡 분석 (the former 보컬
 * 연구소, #/vocal-lab/<songId>) is mounted here: its address leads to this screen (location.replace, ?a= ?b= ?compare=
 * ?report= ?selection= ?jump= kept). In this order:
 *   기간           전체 · 이번 달 · 지난달 (?period=month|last, ?month=YYYY-MM): the 한마디 and 처음 vs 최근 of that span
 *   한마디         ONE verdict, the one 이번 달 and the 곡 list show (VZ.growthSong, app/growth-hub.js; rule
 *                 VzipGrowthDataset.verdictRule({practice}) with the shared 연습 녹음 포함 switch; model
 *                 app/growth-song-model.js), ▶처음 ▶최근 (app/growth-song-page.js draws it)
 *   처음 vs 최근   the measures of that pair (지표별로), 처음·최근 through 무엇이 달라졌나 for this song
 *                 (app/growth-changes-ui.js), 지난달 대비; a month: 월별 리포트's 이달의 변화 and 6 measures of this song
 *   녹음 타임라인  the song's recordings (date chips, player); a date opens 이 녹음 자세히 (구간·최고음·악보·원곡 비교)
 *   약한 곳        파사지오 참고 · 음높이 확인 구간 (app/weak-phrase.js) · 레슨 지적 (app/score-points.js) · 구간 A/B
 *                 (app/segment-ab-ui.js, reachable without a plan)
 *   이 곡 다음 연습 VZ.nextPractice for this song (app/next-practice.js) · AI 다른 연습 (asks first)
 *   들어 본 평가 · 두 녹음 비교  any two takes → 가리고 듣고 평가 (app/listen-verdict.js) · 측정값 나란히 보기 · 메모
 *   깊이 보기      (folded) 녹음별 변화 · 같은 날 녹음 세기 · 측정 방식별 비교 · 리포트 저장 · MR로 다시 분석 · 옛 방식
 *                 다시 분석 · AI 해석 (asks first) · 소리 길 흔적 · 정밀 리포트 · 리포트 보관함 · 분석 기준
 * Recordings are measured with the existing on-device analyzer. No demo values are shown. */
(() => {
'use strict';
const V = window.VZ, M = V?.media, esc = V?.esc;
if (!V || !M) return;
const METRICS = [
  {key:'wob',label:'음정 안정성',unit:'cent',get:a=>a?.metrics?.stability?.wobbleCents,fmt:v=>'±'+v+' cent',better:-1,tolerance:.5,guide:'지속해서 낸 소리의 음높이 흔들림입니다(비브라토 제외). 낮을수록 안정적이에요. 음정 정확도와 따로 봐요.'},
  {key:'into',label:'음정 정확도',unit:'cent',get:a=>a?.metrics?.intonation?.meanAbsCents,fmt:v=>'±'+v+' cent',better:-1,tolerance:.5,guide:'가장 가까운 반음과의 평균 오차(cent)입니다. 이 값만으로는 맞는 음을 불렀는지는 판단하지 않아요(악보나 원곡과 음 단위로 맞춰 보려면 구간 분석의 음표 단위 비교·원곡 기준 비교를 쓰세요). 낮을수록 반음 칸에 정확히 맞아요.'},
  {key:'high',label:'유효 최고음',unit:'',get:a=>a?.v>=2?a?.metrics?.range?.validHigh?.cents:null,fmt:(v,a)=>a?.metrics?.range?.validHigh?.note||'—',better:0,tolerance:50,guide:'0.2초 이상 지속되고 신뢰도·연속성 조건을 충족한 음입니다. 순간 최고음은 성장 평가에 쓰지 않아요.'},
  {key:'stable',label:'안정 최고음',unit:'',get:a=>a?.v>=2?a?.metrics?.range?.stableHigh?.cents:null,fmt:(v,a)=>a?.metrics?.range?.stableHigh?.note||'—',better:0,tolerance:50,guide:'0.5초 이상 지속되고 흔들림·신뢰도 조건을 충족한 음입니다. 실력의 좋고 나쁨을 단정하지 않아요.'},
  {key:'phr',label:'프레이즈 길이',unit:'초',get:a=>a?.metrics?.breath?.medianPhrase,fmt:v=>v+'초',better:0,tolerance:.2,guide:'한 구절을 이어 부른 시간의 중앙값(참고값)입니다. 호흡 유지는 위 ‘처음 vs 최근’에서 같은 프레이즈끼리 템포를 보정해 비교해요.'},
  {key:'rating',label:'만족도',unit:'점',get:(a,m)=>m?.rating,fmt:v=>v+'/5',better:1,tolerance:.1,guide:'녹음 후 직접 기록한 만족도입니다. 높을수록 스스로 만족한 녹음이에요. 객관적 발성 점수는 아니에요.'}
];
const metricColor=(metric,previous,current)=>{
 if(previous==null||current==null)return 'neutral';
 if(!metric.better)return 'neutral';
 const difference=(current-previous)*metric.better;
 return Math.abs(difference)<=metric.tolerance?'neutral':difference>0?'good':'bad';
};
const metricChangeText=(metric,previous,current)=>{
 if(previous==null||current==null)return '비교할 이전 녹음 없음';
 const diff=current-previous,amount=Math.abs(diff).toFixed(metric.key==='rating'?0:1);
 if(Math.abs(diff)<=metric.tolerance)return '이전 녹음과 비슷해요';
 if(metric.key==='high'||metric.key==='stable')return '이전 대비 '+(diff>0?'상승 ':'하락 ')+Math.abs(Math.round(current/100)-Math.round(previous/100))+'반음 · 실력 판정 아님';
 // Each metric's own unit and wording (프레이즈 길이 is seconds: "0.8초 길어졌어요", never cent).
 if(!metric.better)return '이전보다 '+amount+(metric.unit||'')+' '+(metric.key==='phr'?(diff>0?'길어졌어요':'짧아졌어요'):(diff>0?'늘었어요':'줄었어요'))+' · 좋고 나쁨은 판단하지 않아요';
 return '이전보다 '+(diff>0?'증가 ':'감소 ')+amount+(metric.unit?' '+metric.unit:'')+' · '+(metricColor(metric,previous,current)==='good'?'좋아진 방향':'아쉬운 방향');
};
const speedStore = window.VzipAccountScope?.storage || localStorage;
const speedKey = 'vzip_vocal_lab_rates_v1';
const rates = () => { try { return JSON.parse(speedStore.getItem(speedKey)) || {}; } catch { return {}; } };
/* 같은 날 녹음: how several takes of the song on one day count in this screen's chart and growth report
 * (app/growth-metrics-model.js: 모두 · 하루 평균 · 신뢰도 높은 것 · 가장 좋은 것). Remembered on this device; 모두 is
 * the default and is what the screen always did. 결과 리포트 · 월별 · 주간 never read this choice. */
const sameDayKey = 'vzip_same_day_mode_v1';
const sameDay = () => { try { return window.VzipGrowthMetrics?.sameDayMode?.(speedStore.getItem(sameDayKey)) || 'all'; } catch { return 'all'; } };
const setSameDay = mode => { try { speedStore.setItem(sameDayKey, window.VzipGrowthMetrics.sameDayMode(mode)); } catch {} };
/* Which folds of 곡 하나 are open (이 녹음 자세히 · 자세히 녹음별 변화 · 깊이 보기): remembered on this device, so someone
 * who always reads the per-take detail does not open it again for every song. Closed until opened once. */
const foldKey = 'vzip_song_folds_v1';
const folds = () => { try { const v = JSON.parse(speedStore.getItem(foldKey)); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const setFold = (key, open) => { try { speedStore.setItem(foldKey, JSON.stringify({...folds(), [key]:!!open})); } catch {} };
/** Open now: what the person did on this visit (s.open), else what this device remembers. */
const foldOpen = (s, key) => s.open[key] ?? !!folds()[key];
/** Remembers a fold the person opened or closed. A fold drawn open sends `toggle` too: only a change from what was
 * drawn counts, so a fold opened for one visit (녹음을 골라 들어온 화면) is not remembered as the person's choice. */
function watchFold(s, d, key, after) {
  let last = d.open;
  d.addEventListener('toggle', () => { if (d.open !== last) { last = d.open; s.open[key] = d.open; setFold(key, d.open); } after?.(); });
}
const DAY_BETTER = {wob:-1, into:-1, high:1, stable:1, phr:1, rating:1};   // 가장 좋은 것: which way is the better value
const time = s => V.clock(Math.max(0,s||0));
const day = m => (M.dateOf(m)||'').slice(5).replace('-','.');
const valid = n => n == null || n === '' ? null : Number.isFinite(Number(n)) ? Number(n) : null;
const analysis = m => m.analysis?.metrics ? m.analysis : null;
// A cached older analysis.js may not define analysisComparable yet: never throw, fall back to the same rule.
const comparable = (a,b) => V.analysisComparable ? V.analysisComparable(a,b) : !!a && !!b && a.v === b.v && !!V.analysisReliable?.(a) && !!V.analysisReliable?.(b);
const selectionKey = 'vocalzip-vocal-lab-selected-media-v1';
const selectionIds = () => { try { const ids=JSON.parse(sessionStorage.getItem(selectionKey)||'[]'); return Array.isArray(ids) ? ids.map(String) : []; } catch { return []; } };
V.openAnalysisSelection = items => {
  const unique=[...new Map(items.filter(Boolean).map(m=>[String(m.id),m])).values()];
  if(!unique.length)return false;
  const songId=unique[0].songId;
  if(!songId || !V.song(songId) || !unique.every(m=>m.songId===songId)) { V.toast('같은 곡으로 지정된 녹음만 분석할 수 있어요.','error'); return false; }
  try { sessionStorage.setItem(selectionKey,JSON.stringify(unique.map(m=>m.id))); } catch { V.toast('선택한 녹음을 저장하지 못했어요.','error'); return false; }
  const songs=[...new Set(unique.map(m=>m.songId).filter(Boolean))];
  V.nav(songs.length===1 && unique.every(m=>m.songId===songs[0])
    ? '#/growth-song/'+encodeURIComponent(songs[0])+'?selection=1'
    : '#/vocal-lab?selection=1');
  return true;
};
let current = null, instance = 0;
const clean = () => { current?.player?.destroy(); if (current) { current.dead = true; stopWeak(current); try { current.heroPlayer?.destroy?.(); } catch {} V.segmentABStop?.(); } current = null; instance++; };
function waveform(m) {
  const data = Array.isArray(m.waveform) ? m.waveform : [];
  if (!data.length) return '<div class="vl-wave-empty" aria-label="저장된 파형 정보가 없어요"><i class="ph ph-waveform"></i><span>파형 정보 없음</span></div>';
  const step = Math.max(1,Math.ceil(data.length/70));
  const values = []; for(let i=0;i<data.length;i+=step) values.push(Math.max(...data.slice(i,i+step)));
  return '<div class="vl-wave" aria-label="녹음 파형">'+values.map(v=>'<span style="height:'+Math.max(12,Math.min(100,Math.round(Number(v||0)*90+10)))+'%"></span>').join('')+'</div>';
}
function plot(vals, {height=142, highlighted=-1, interactive=false}={}) {
  const rows=vals.filter(p=>valid(p.value)!=null), W=340, H=height, pad=20;
  if (!rows.length) return '<p class="vl-muted">측정된 값이 없어요.</p>';
  let lo=Math.min(...rows.map(p=>+p.value)), hi=Math.max(...rows.map(p=>+p.value));
  const spread=Math.max(hi-lo, 2); lo-=spread*.18; hi+=spread*.18;
  const x=i=>rows.length===1?W/2:pad+i*(W-pad*2)/(rows.length-1);
  const y=v=>H-pad-(v-lo)/(hi-lo)*(H-pad*2);
  const points=rows.map((p,i)=>[x(i),y(+p.value)]);
  const line=points.length>1?'<polyline points="'+points.map(p=>p.map(v=>v.toFixed(1)).join(',')).join(' ')+'"/>':'';
  const dots=points.map((p,i)=>{
    const cls='vl-dot '+(rows[i].tone||'neutral')+(i===highlighted?' active':'');
    const cx=p[0].toFixed(1),cy=p[1].toFixed(1);
    if(!interactive)return '<circle class="'+cls+'" cx="'+cx+'" cy="'+cy+'" r="'+(i===highlighted?6:4)+'"/>';
    return '<g role="button" tabindex="0" data-point="'+esc(rows[i].id)+'"'+(rows[i].day?' data-day="'+esc(rows[i].day)+'"':'')+' aria-label=""'+esc(rows[i].label+' 상세 보기')+'"><circle class="vl-hit" cx="'+cx+'" cy="'+cy+'" r="19"/><circle class="'+cls+'" cx="'+cx+'" cy="'+cy+'" r="'+(i===highlighted?6:5)+'"/></g>';
  }).join('');
  return '<svg class="vl-plot" style="height:'+H+'px" viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" role="'+(interactive?'group':'img')+'" aria-label="'+esc(rows.map(p=>p.label+' '+p.value).join(', '))+'"><line class="vl-mid" x1="0" x2="340" y1="'+H/2+'" y2="'+H/2+'"/>'+line+dots+'</svg>';
}
function sizePlots(host) {
  host.querySelectorAll('.vl-plot').forEach(svg=>{
    const width=svg.getBoundingClientRect().width, circles=[...svg.querySelectorAll('circle.vl-dot')];
    if(!width||!circles.length)return;
    const height=Number(svg.viewBox.baseVal.height)||142, pad=20;
    svg.setAttribute('viewBox','0 0 '+width+' '+height);
    circles.forEach((circle,i)=>{const cx=String(circles.length===1?width/2:pad+i*(width-pad*2)/(circles.length-1));circle.setAttribute('cx',cx);circle.parentElement?.querySelector('.vl-hit')?.setAttribute('cx',cx);});
    const line=svg.querySelector('polyline');
    if(line)line.setAttribute('points',circles.map(circle=>circle.getAttribute('cx')+','+circle.getAttribute('cy')).join(' '));
    svg.querySelector('.vl-mid')?.setAttribute('x2',String(width));
  });
}
// All comparisons use measured summaries from chronological recordings only (성장 리포트 v2,
// app/growth-metrics-model.js). The instant overview is factual; optional AI wording never replaces the evidence.
const G=window.VzipGrowthMetrics;
// Why two takes are not compared in 녹음별 변화, in the growth report's own words ("판정 보류 · reason").
const pairHoldLine=(a,b)=>G?.holdLine?G.holdLine(G.pairHold(a,b,x=>!!V.analysisReliable?.(x))):'판정 보류';
const songReference=song=>{const r=(V.song?.(song?.id)||song)?.vocalRange;return r&&Number.isFinite(r.highMidi)?r:null;};
const labTakes=s=>s.selected.map(id=>s.items.find(m=>m.id===id)).filter(m=>m&&analysis(m))
 .map(m=>({id:m.id,a:analysis(m),date:String(M.dateOf(m)||'').slice(0,10),created:m.created,ok:!!V.analysisReliable(analysis(m))}));
/* ----- 이 곡의 변화: the shared verdict. s.all is the whole media list (the 성장 screens read the same one). ----- */
/** The song's recordings the verdict counts: VzipGrowthDataset.verdictRule({practice}) — 연습 takes only with the switch on. */
const ruleItems=s=>(V.growthDataset(s.all).bySong(V.growthDataset.verdictRule({practice:s.practice})).get(s.song.id)||[]).map(r=>r.m);
const growthMedia=s=>ruleItems(s).filter(m=>analysis(m));
/** The pair's measures (app/growth-song-model.js verdict().report); null while there is no pair. */
const labReport=s=>s.v?.now?.report||null;
/** For the AI wording and G.aggregate: the pair's report with each compared measure's latest value, as songReport gives it. */
const aiReport=report=>Object.fromEntries(Object.entries(report).map(([k,x])=>[k,x.state!=='hold'&&Number.isFinite(x.after)?{...x,latest:{value:x.after}}:x]));
// One saved AI wording per song and take filter; evidenceKey says whether it was made from the takes counted now.
const labGrowthId=s=>'vocal-growth-ai:'+s.song.id+':'+(s.practice?'with-practice':'song-takes');
const savedGrowthReport=s=>(V.db.practicePlans||[]).find(x=>x.id===labGrowthId(s)&&x.period==='vocal-growth-ai'&&x.evidenceKey===growthEvidenceKey(s));
/** An AI wording saved earlier for this song from other takes (an older selection, before a new recording): still shown, said as such. */
const olderGrowthReport=s=>(V.db.practicePlans||[]).filter(x=>x?.period==='vocal-growth-ai'&&x.songId===s.song.id&&x.text&&!(V.db.deleted?.practicePlans||[]).includes(x.id)).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0))[0]||null;
function growthEvidenceKey(s){
 return growthMedia(s).map(m=>m.id+':'+(analysis(m)?.at||0)+':'+(m.rating??'')).join('|');
}
const TONE={better:'good',worse:'bad',similar:'neutral',mixed:'neutral',changed:'neutral',hold:'hold',reference:'ref'};
/** 처음 vs 최근 · 지표별로 — the measures of the ONE pair of the song's verdict (처음·최근, same method and version), 판정
 * 보류 with its reason. Its tools (옛 방식 다시 분석 and the optional AI wording of exactly these measures) are
 * growthTools, under 깊이 보기. */
function growthParts(s){
 const v=s.v?.now;
 if(!v||!G)return {report:'',tools:''};
 const media=growthMedia(s),report=v.report||null,rows=v.rows||[],ref=songReference(s.song);
 const saved=savedGrowthReport(s),older=saved?null:olderGrowthReport(s);
 const line=x=>{
  let text=x.text;
  const vs=x.id==='range'&&report?.range?.vsScore;
  if(vs)text+=' · 악보 최고음 '+vs.scoreHigh+' 대비 '+(vs.after===0?'같은 음':(vs.after>0?'+':'−')+Math.abs(vs.after)+'반음');
  return '<li class="vl-growth-row '+TONE[x.state]+'" data-growth-row="'+x.id+'"><span class="vl-growth-indicator" aria-hidden="true"></span><div><strong>'+esc(x.title)+'</strong><p>'+esc(text)+'</p>'+(x.note?'<small>'+esc(x.note)+'</small>':'')+'</div></li>';
 };
 const pick=states=>rows.filter(x=>states.includes(x.state));
 const strong=pick(['better']),weak=pick(['worse']),neutral=pick(['similar','mixed','changed']),held=pick(['hold']);
 const first=v.item&&s.all.find(m=>m.id===v.item.firstId),last=v.item&&s.all.find(m=>m.id===v.item.lastId);
 const rating=first&&last&&Number(first.rating)>0&&Number(last.rating)>0?'<p class="vl-growth-rating">내 만족도 '+first.rating+'/5 → '+last.rating+'/5 · 직접 기록한 체감이에요.</p>':'';
 const judged=!!report&&G.aiMetrics(G.aggregate([{songId:s.song.id,report:aiReport(report)}])).some(x=>x.state!=='unknown');
 // Older (v1) or detail-less results hold comparisons back: offer to re-analyse them right here, on this device.
 const stale=media.filter(m=>!G.hasDetail(analysis(m)));
 const redo=stale.length&&(!report||held.length)?'<div class="vl-growth-reanalyze"><p>이전 방식으로 분석된 녹음 <strong>'+stale.length+'개</strong>를 새 방식으로 다시 분석하면 비교할 수 있어요. 이 기기에서 분석하고, 이전 결과는 이력으로 남겨요.</p>'+
  '<button type="button" data-growth-reanalyze'+(s.reanalyzing?' disabled':'')+'><i class="ph ph-arrows-clockwise" aria-hidden="true"></i> '+(s.reanalyzing?'다시 분석하는 중…':stale.length+'개 다시 분석')+'</button><p class="vl-muted" role="status" data-growth-reanalyze-status></p></div>':'';
 const section=(heading,list,cls)=>list.length?'<div class="vl-growth-group"><h3 class="'+cls+'">'+heading+' <span>'+list.length+'</span></h3><ul>'+list.map(line).join('')+'</ul></div>':'';
 const count=v.item?(v.item.count>2?v.item.count+'개 중 처음·최근 비교':'녹음 2개 비교'):media.length+'개 분석';
 const intro=v.item?'처음('+esc(day(first||{})||'—')+')과 최근('+esc(day(last||{})||'—')+') 녹음을 지표마다 나눠 봤어요':esc((G.HOLD_LABEL||'판정 보류')+' · '+v.text);
 const reportHtml='<section class="vl-growth" data-growth-report aria-label="지표별로 보기">'+
  '<div class="vl-growth-top"><h3 class="vl-growth-title">지표별로 보기</h3><span class="vl-growth-count" data-growth-count>'+count+'</span></div>'+
  '<p class="vl-growth-intro">'+intro+' <small>같은 곡·같은 측정 방법·같은 분석 버전·다른 날의 녹음만, 가능하면 같은 프레이즈끼리 비교해요. 최고음 하나로 판단하지 않아요.'+(ref?' 악보 기준 음역 '+esc(ref.low+'–'+ref.high)+'을 함께 봐요.':'')+'</small></p>'+
  section('좋아진 부분',strong,'good')+section('아쉬운 부분',weak,'bad')+section('비슷함·변화 관찰',neutral,'neutral')+section('판정 보류',held,'hold')+rating+
  (rows.length?'<p class="vl-growth-caution">판정 보류는 신뢰도·데이터·같은 프레이즈·분석 버전 중 근거가 부족하다는 뜻이에요. 최고음의 변화는 곡의 구간·발성 방식에 따라 달라지며, 측정값만으로 실력 향상이나 악화를 단정하지 않아요.</p>':'')+
  '</section>';
 const ai=judged?'<div class="vl-growth-ai"><div class="vl-growth-ai-head"><strong>AI 해석</strong><button type="button" data-growth-ai '+(s.growthPending?'disabled':'')+'>'+(saved?'다시 생성':'AI로 종합 해석')+'</button></div>'+
    '<p class="vl-growth-ai-status" data-growth-ai-status role="status">'+(s.growthPending?'AI가 측정 기록을 해석하고 있어요…':saved?'이 비교의 AI 해석을 저장해 두었어요.':older?'예전에 저장한 해석이에요. 그때 고른 녹음 기준이라 지금 비교와 다를 수 있어요.':'음정 정확도·음정 안정성·호흡 유지의 비교 결과(판정 보류 포함)만 보내 해석해요. 음역·최고음은 보내지 않아요. 보내기 전에 먼저 물어봐요.')+'</p>'+
    (saved||older?'<div class="vl-growth-ai-text"'+(saved?'':' data-growth-ai-older')+'>'+esc((saved||older).text)+'</div>':'<div class="vl-growth-ai-text" data-growth-ai-result hidden></div>')+'</div>':
    older?'<div class="vl-growth-ai"><div class="vl-growth-ai-head"><strong>AI 해석</strong></div><p class="vl-growth-ai-status">예전에 저장한 해석이에요. 그때 고른 녹음 기준이라 지금 비교와 다를 수 있어요.</p><div class="vl-growth-ai-text" data-growth-ai-older>'+esc(older.text)+'</div></div>':
    '<p class="vl-muted" data-growth-ai-none>같은 방법·같은 버전으로 잰, 믿을 만한 녹음이 다른 날 두 개 이상 있어야 AI 해석을 요청할 수 있어요.</p>';
 return {report:reportHtml,tools:'<section class="vl-growth vl-growth-tools" data-growth-tools aria-label="다시 분석 · AI 해석">'+redo+ai+'</section>'};
}
/* ----- 기간: 전체 · 이번 달 · 지난달 (and a month a link asked for, ?month=YYYY-MM) ----- */
const nowDay=()=>window.VzipGrowthDataset?.koreaDay?.(Date.now())||V.today();
const PERIOD_CHIPS=[['all','전체'],['month','이번 달'],['last','지난달']];
/** The span of the chosen chip: null for 전체, else the month as 성장's period model words it ({kind, from, to, prev, label}). */
function periodOf(s){
 const GM=window.VzipGrowthMonth;
 if(!GM||!s.period||s.period==='all')return null;
 try{
  const now=GM.period('month',nowDay());
  if(s.period==='month')return now;
  if(s.period==='last')return GM.period('month',now.prev.to);
  if(/^\d{4}-\d{2}$/.test(s.period))return GM.period('month',s.period+'-01');
 }catch(error){console.error(error);}
 return null;
}
/** The chip a ?period= / ?month= asks for: 'all' · 'month' · 'last' · 'YYYY-MM' (a month that is neither of the two). */
function periodFromQuery(q){
 const GM=window.VzipGrowthMonth,p=q?.get('period')||'',m=q?.get('month')||'';
 if(['all','month','last'].includes(p))return p;
 if(!/^\d{4}-\d{2}$/.test(m)||!GM)return 'all';
 try{const now=GM.period('month',nowDay());return m===now.from.slice(0,7)?'month':m===now.prev.from.slice(0,7)?'last':m;}catch{return 'all';}
}
function periodHtml(s){
 const chips=PERIOD_CHIPS.concat(/^\d{4}-\d{2}$/.test(s.period)?[[s.period,s.period.slice(0,4)+'년 '+Number(s.period.slice(5,7))+'월']]:[]);
 return '<div class="gsp-period" role="group" aria-label="기간" data-gsp-periods>'+chips.map(([k,label])=>'<button type="button" data-gsp-period="'+esc(k)+'" aria-pressed="'+(s.period===k)+'">'+esc(label)+'</button>').join('')+'</div>';
}
/** 한마디 of the chosen span: 전체 is the song's verdict; a month is that month against the latest take before it
 * (VZ.growthSong.month — 지난달 대비, the rule 이번 달 uses). */
function heroData(s){
 const p=periodOf(s),dateOf=id=>{const m=id&&s.all.find(x=>x.id===id);return m?M.dateOf(m):'';};
 if(!p){
  const v=s.v?.now||window.VzipGrowthSong?.verdict({songId:s.song.id,takes:[]})||null;
  return v&&{state:v.state,word:v.word,text:v.text,firstId:v.firstId,lastId:v.lastId,firstDate:v.item?.firstDate||dateOf(v.firstId),lastDate:v.item?.lastDate||dateOf(v.lastId),label:'전체',overall:true};
 }
 let m=null;
 try{m=V.growthSong?.month(s.all,s.song.id,s.practice,{from:p.from,to:p.to})||null;}catch(error){console.error(error);}
 if(!m)return {state:'hold',word:window.VzipGrowthSong?.WORD?.hold||'판정 보류',text:p.label+'에는 그 전 녹음과 같은 방법으로 견줄 이 곡 녹음이 없어요',label:p.label};
 return {state:m.state,word:m.word,text:m.text,note:m.basis,firstId:m.firstId,lastId:m.lastId,firstDate:dateOf(m.firstId),lastDate:dateOf(m.lastId),label:p.label};
}
/** 처음 vs 최근, the part that does not depend on which take is being played: the switch, the measures of the pair
 * (지표별로), 처음·최근 through 무엇이 달라졌나 for this song and 지난달 대비 — or, for a month, 월별 리포트's 이달의 변화 and six
 * measures of this song (V.monthlyGrowthDetail, the same numbers) and 무엇이 달라졌나 for that month. Drawn again only when
 * a take, an analysis, the switch or the chip changes. */
function verdictHtml(s){
 let x=null,month=null;
 try{x=V.growthSong?.of(s.all,s.song.id,s.practice)||null;}catch(error){console.error(error);}
 s.v=x;
 const p=periodOf(s);
 const note=s.practice?'노래 연습실·트레이닝 연습 녹음도 넣어 견줘요. 끄면 결과 리포트와 같은 기준이에요.':'곡 녹음만 견줘요. 노래 연습실·트레이닝 연습 녹음은 빼요.';
 const head='<header class="vl-part-head"><h2 id="vl-changes-title">처음 vs 최근</h2><small class="vl-part-tag">이 곡은 여기서 견줘요</small></header>'+
  '<p class="vl-muted vl-part-rule" data-song-rule>'+(p?esc(p.label)+' 녹음을 그 전 마지막 녹음과 같은 방법·같은 분석 버전끼리 견줘요. 월별 리포트와 같은 기준이에요.':'처음과 최근 녹음을 같은 방법·같은 분석 버전으로 잰 것끼리 견줘요. 이번 달과 같은 기준이에요.')+'</p>'+
  '<label class="gm-switch vl-switch"><input type="checkbox" role="switch" data-song-practice'+(s.practice?' checked':'')+'><span>연습 녹음 포함</span></label>'+
  '<p class="vl-muted vl-switch-note" data-song-practice-note>'+note+'</p>'+
  (x?.effect&&!p?'<p class="vl-effect" data-song-practice-effect role="status">'+esc(x.effect)+'</p>':'');
 const changes=window.VzipGrowthChangesUI?'<div class="vl-light"><div class="gc-host" data-growth-changes></div></div>':'';
 if(p){
  let detail=null;
  try{detail=V.monthlyGrowthDetail?.(s.all,{month:p.from.slice(0,7),songId:s.song.id,practice:s.practice})||null;}catch(error){console.error(error);}
  // monthlyGrowthDetail falls back to the whole month when the song has no take in it: that is not this song's.
  const mine=detail&&detail.current.length&&detail.current.every(m=>m.songId===s.song.id);
  return head+(mine?'<div class="vl-light vl-month-detail" data-song-month-detail="'+esc(p.from.slice(0,7))+'">'+detail.html+'</div>':'<p class="vl-muted" data-song-month-none>'+esc(p.label)+'에는 이 곡 녹음이 없어요.</p>')+changes;
 }
 const v=x?.now||null;
 try{month=v?.item?V.growthSong.month(s.all,s.song.id,s.practice):null;}catch(error){console.error(error);}
 return head+growthParts(s).report+changes+
  (month?'<p class="vl-month" data-song-month data-state="'+month.state+'"><strong>지난달 대비</strong><span>'+esc(month.word+' · '+month.text)+'</span><small>'+esc(month.basis)+'</small></p>':'');
}
/** 파사지오 참고 (약한 곳): what recurs over the song's counted recordings — never one recording's value, never a verdict. */
function passHtml(s){
 if(!G)return '';
 let x=null;
 try{x=G.songReport(growthMedia(s).map(m=>V.growthDataset.take(m)),{reference:songReference(s.song)}).passaggio;}catch(error){console.error(error);}
 if(!x)return '';
 return '<ul class="vl-weak-list"><li class="vl-growth-row ref" data-growth-row="passaggio" data-weak="passaggio"><span class="vl-growth-indicator" aria-hidden="true"></span><div><strong>파사지오(전환 구간) <em>참고</em></strong><p>'+esc(G.passaggioReportText(x))+'</p><small>'+esc(G.PASSAGGIO_NOTE)+'</small></div></li></ul>';
}
/** 날짜별 처음·최근 — only with a 같은 날 녹음 세기 other than 모두 (깊이 보기): the open takes counted once per day, the
 * first day against the latest (app/growth-metrics-model.js songReport with sameDay). This screen's own comparison,
 * kept under 자세히 and labelled: 이 곡의 변화 never reads the choice, so it stays what 이번 달 shows. */
function dayReport(s){
 const mode=sameDay();
 if(mode==='all'||!G?.days||!G.SAME_DAY)return '';
 const takes=labTakes(s);
 let report=null;
 try{report=G.songReport(takes,{sameDay:mode,reference:songReference(s.song),scoreNotes:(V.song?.(s.song.id)||s.song)?.noteCompare?.takes||null,arNotes:(V.song?.(s.song.id)||s.song)?.arCompare?.takes||null});}catch(error){console.error(error);}
 if(!report)return '';
 const n=G.days(takes).filter(d=>d.reliable.length).length,label=G.SAME_DAY.find(x=>x[0]===mode)[1];
 const line=d=>{
  const x=report[d.id];
  const text=x.state==='hold'?G.holdLine(x.reason):G.changeText(x),note=G.basisText(x);
  return '<li class="vl-growth-row '+TONE[x.state]+'" data-day-row="'+d.id+'"><span class="vl-growth-indicator" aria-hidden="true"></span><div><strong>'+esc(d.title)+'</strong><p>'+esc(text)+'</p>'+(note?'<small>'+esc(note)+'</small>':'')+'</div></li>';
 };
 return '<section class="vl-day-report" data-day-report><div class="vl-growth-top"><h3 class="vl-growth-title">날짜별 처음·최근</h3><span class="vl-growth-count" data-day-count>'+(n>1?n+'일 중 처음·최근 비교':n+'일 분석')+'</span></div>'+
  '<p class="vl-muted vl-day-intro" data-day-intro>위에서 고른 녹음을 하루에 하나로 세어 처음과 최근 날을 지표마다 나눠 비교했어요 (같은 날 녹음: '+esc(label)+'). 이 화면에서만 보는 참고예요.</p>'+
  '<div class="vl-growth-group"><ul>'+G.METRICS.filter(d=>!d.reference).map(line).join('')+'</ul></div></section>';
}
/** The points of 녹음별 변화, oldest first. mode 'all': one per recording (as always). Otherwise one per DAY, by the
 * model's day rule: {m: the recording the value came from (or the day's latest reliable one for an average), value,
 * day: {date, n, count, basis, usedId, ids}}. */
function trendRows(s,metric,mode=sameDay()){
 const picked=s.selected.map(id=>s.items.find(m=>m.id===id)).filter(Boolean);
 if(mode==='all'||!G?.days)return picked
  .map(m=>({m,value:valid(metric.get(analysis(m),m))}))
  .filter(x=>x.value!=null)
  .sort((a,b)=>(M.dateOf(a.m)||'').localeCompare(M.dateOf(b.m)||'')||(Number(a.m.created)||0)-(Number(b.m.created)||0)||String(a.m.id).localeCompare(String(b.m.id)));
 const takes=picked.map(m=>({id:m.id,m,a:analysis(m),date:String(M.dateOf(m)||'').slice(0,10),created:m.created,ok:!!analysis(m)&&!!V.analysisReliable(analysis(m))}));
 const opt={get:t=>valid(metric.get(t.a,t.m)),better:DAY_BETTER[metric.key]||1,note:metric.key==='high'||metric.key==='stable',all:metric.key==='rating'};
 return G.days(takes).map(d=>{
  const r=G.dayValue(d,mode,opt);
  if(r.value==null)return null;
  return {m:(r.used||d.reliable.at(-1)||d.takes.at(-1)).m,value:r.value,day:{date:d.date,n:d.takes.length,count:r.count,basis:r.basis,usedId:r.used?.id??null,ids:d.takes.map(t=>t.id)}};
 }).filter(Boolean);
}
/** A point's value in words. A day value of a note-valued measure is named from the value itself (중앙값 for an average). */
const pointValue=(metric,x)=>x.day&&(metric.key==='high'||metric.key==='stable')?G.noteName(Math.round(x.value/100))+(x.day.basis==='median'?' (중앙값)':''):metric.fmt(x.value,analysis(x.m));
/** "11.13", or once per day with the count: "11.13 · 8개". */
const pointLabel=x=>day(x.m)+(x.day&&x.day.n>1?' · '+x.day.n+'개':'');
const DAY_BASIS={mean:'하루 평균',median:'하루 중앙값',reliable:'신뢰도 높은 것',best:'가장 좋은 것',take:'녹음 1개',unreliable:'신뢰도 높은 녹음 없음 · 판정 보류'};
/** A day with several takes: the list of that day's takes — which one the day value came from, or that it is an average. */
function dayList(s,date){
 const metric=METRICS.find(x=>x.key===s.metric)||METRICS[0],point=trendRows(s,metric).find(x=>x.day?.date===date);
 if(!point)return;
 const takes=point.day.ids.map(id=>s.items.find(m=>m.id===id)).filter(Boolean),averaged=point.day.basis==='mean'||point.day.basis==='median';
 const row=m=>{
  const a=analysis(m),v=valid(metric.get(a,m)),reliable=!!a&&!!V.analysisReliable(a),used=point.day.usedId===m.id;
  const state=metric.key!=='rating'&&!reliable?(a?'신뢰도 낮음 · 날 값에서 제외':'분석 전'):used?'이 녹음의 값을 썼어요':averaged&&v!=null?'평균에 포함':'';
  return '<button type="button" class="vl-day-take'+(used?' used':'')+'" data-day-take="'+esc(m.id)+'"><span><strong>'+esc(M.label(m)||'녹음')+'</strong><small>'+esc(state)+'</small></span><b>'+esc(v==null?'—':metric.fmt(v,a))+'</b></button>';
 };
 V.sheet({title:day(point.m)+' 녹음 '+takes.length+'개',variant:'compact',
  body:'<div class="vl-day-list" data-day-list><p class="vl-day-head"><span>'+esc(metric.label+' · '+DAY_BASIS[point.day.basis])+'</span><strong data-day-value>'+esc(pointValue(metric,point))+'</strong>'+
   (averaged?'<small>신뢰도 높은 녹음 '+point.day.count+'개'+(point.day.basis==='median'?'의 중앙값':'의 평균')+'이에요.</small>':'')+'</p>'+takes.map(row).join('')+
   '<p class="vl-day-foot">녹음을 누르면 그 녹음의 상세를 볼 수 있어요.</p></div>',
  onMount:(el,close)=>el.querySelectorAll('[data-day-take]').forEach(b=>b.onclick=()=>{const m=s.items.find(x=>x.id===b.dataset.dayTake);close();if(m&&!s.dead)observe(s,m);})});
}
function trend(s) {
 const metric=METRICS.find(x=>x.key===s.metric)||METRICS[0],measured=trendRows(s,metric);
 const mode=sameDay();
 const series=measured.map((x,i)=>({id:x.m.id,day:x.day&&x.day.n>1?x.day.date:'',value:x.value,label:pointLabel(x),tone:metric.key==='rating'||comparable(analysis(measured[i-1]?.m||{}),analysis(x.m))?metricColor(metric,measured[i-1]?.value,x.value):'neutral'}));
 const last=measured.at(-1),prev=measured.at(-2);
 const state=last&&(metric.key==='rating'||comparable(analysis(prev?.m||{}),analysis(last.m)))?metricColor(metric,prev?.value,last.value):'neutral';
 const explanation=last&&prev&&!comparable(analysis(prev.m),analysis(last.m))?pairHoldLine(analysis(prev.m),analysis(last.m)):last?metricChangeText(metric,prev?.value,last.value).replace(/이전 녹음/g,mode==='all'?'이전 녹음':'이전 날'):'분석된 값이 없어요';
 // 같은 날 녹음 세기 is chosen under 깊이 보기; what it does to this chart is said here.
 const choice='<p class="vl-muted vl-trend-basis" data-song-trend-basis>위에서 고른 녹음을 바로 앞 녹음과 견준 참고 그래프예요. 연습 녹음도 들어가고, 위 ‘처음 vs 최근’과는 기준이 달라요. 같은 날 여러 번 부른 녹음을 세는 방법은 깊이 보기에서 바꿔요.</p>'+
  (mode==='all'||!G?.SAME_DAY_NOTE?'':'<p class="vl-sameday-note" data-same-day-note><strong>'+esc(G.SAME_DAY_NOTE[mode])+'</strong> 이 선택은 이 그래프와 아래 날짜별 처음·최근에만 적용돼요. ‘처음 vs 최근’과 이번 달·결과 리포트는 모든 녹음으로 계산해요.</p>');
 return '<section class="vl-trend">'+choice+'<div class="vl-metrics" role="group" aria-label="변화 지표">'+METRICS.map(x=>'<button type="button" data-metric="'+x.key+'" aria-pressed="'+(s.metric===x.key)+'">'+x.label+'</button>').join('')+'</div>'+
  '<p class="vl-metric-guide"><strong>'+esc(metric.label)+' · '+esc(metric.better===-1?'낮을수록 좋아요':metric.better===1?'대체로 높을수록 좋아요':'높낮이만으로 판단하지 않아요')+'</strong><span>'+esc(metric.guide)+'</span></p>'+
  (last?'<p class="vl-change '+state+'" role="status">'+esc('최근 변화 · '+explanation)+'</p>':'')+
  '<p class="vl-legend"><span class="good">● 좋아진 방향</span><span class="bad">● 아쉬운 방향</span><span class="neutral">● 비슷함·판단 보류</span></p>'+
  (measured.length?'<div class="vl-plot-scroll" tabindex="0" role="region" aria-label="녹음별 변화 그래프, 좌우로 스크롤 가능"><div class="vl-plot-track" style="--vl-points:'+measured.length+'">'+plot(series,{highlighted:measured.findIndex(x=>x.day?x.day.ids.includes(s.active):x.m.id===s.active),interactive:true})+'<div class="vl-plot-dates">'+measured.map(x=>'<button type="button" data-point="'+esc(x.m.id)+'"'+(x.day&&x.day.n>1?' data-day="'+esc(x.day.date)+'"':'')+' aria-label="'+esc(pointLabel(x)+' '+metric.label+' '+pointValue(metric,x)+(x.day&&x.day.n>1?' · 그날 녹음 보기':' 상세 보기'))+'">'+esc(pointLabel(x))+'</button>').join('')+'</div></div></div>':'<p class="vl-muted">분석된 녹음이 없어요. 녹음을 선택해 분석을 시작해 주세요.</p>')+
  (measured.length?'<p class="vl-muted">'+(mode==='all'?'그래프의 점이나 날짜를 누르면 해당 녹음의 상세 팝업을 볼 수 있어요. 색상은 이전 녹음과의 비교이며 첫 점은 중립이에요.':'하루에 점 하나예요. 점이나 날짜를 누르면 그날 녹음 목록(여러 번 부른 날)이나 녹음 상세가 열려요. 색상은 이전 날과의 비교이며 첫 점은 중립이에요.')+'</p>':'')+dayReport(s)+'</section>';
}
function single(s,m) {
  const a=analysis(m);
  return '<section class="vl-single"><h3 class="vl-sub">'+esc(day(m))+' 분석 관찰</h3>'+
    (!a?'<p class="vl-muted">이 녹음의 분석 결과가 아직 없어요. 위의 구간 분석을 시작해 주세요.</p>':'<div class="vl-metric-grid">'+METRICS.filter(x=>x.key!=='rating').map(metric=>{
      const v=metric.get(a,m), count=metric.key==='wob'?a.metrics.stability?.notes:metric.key==='into'?a.metrics.intonation?.notes:null;
      return '<div class="vl-stat"><span>'+metric.label+'</span><strong>'+esc(v==null?'측정 안 됨':metric.fmt(v,a))+'</strong><div class="vl-stat-visual" aria-hidden="true"><span style="width:'+Math.min(94,Math.max(8,(Number(v)||0)/(metric.key==='high'?10000:metric.key==='phr'?12:50)*100))+'%"></span></div>'+(count?'<small>측정한 음 '+count+'개</small>':'')+'</div>';
    }).join('')+'</div>'+singleDetail(s,a))+'</section>';
}
/** One take's high-note zone and passaggio reference (v2 detail); v1 and older v2 results say why not. */
function singleDetail(s,a){
 if(!G)return '';
 const one=G.single(a,{reliable:V.analysisReliable(a),reference:songReference(s.song)}),h=one.high,p=one.passaggio;
 const high=h.state==='hold'?G.holdLine(h.reason):h.zone+' 구간 흔들림 ±'+h.wobble+' cent · 평균 유지 '+h.held+'초 (음 '+h.notes+'개'+(h.fromScore?', 악보 최고음 기준':'')+')';
 return '<ul class="vl-detail-list"><li><strong>고음 안정성</strong><span>'+esc(high)+'</span></li>'+
  '<li data-single-passaggio><strong>파사지오 <em>참고</em></strong><span>'+esc(G.passaggioText(p))+'</span><small>'+esc(G.PASSAGGIO_SINGLE+' · '+G.PASSAGGIO_NOTE)+'</small></li></ul>';
}
function observationCurve(result) {
 // Saved summaries contain no waveform: draw only actual measured pitch samples.
 const values=result?.curve||[],fps=Number(result?.fps)||0;
 if(!fps||!values.length)return '';
 const first=values.findIndex(v=>v!=null);
 if(first<0)return '';
 // Find the first continuous voiced segment long enough for meaningful pitch motion.
 let begin=first,bestStart=-1,bestLen=0;
 for(let i=0;i<values.length;){
  if(values[i]==null){i++;continue;}
  const j=i;while(i<values.length&&values[i]!=null)i++;
  if(i-j>bestLen){bestStart=j;bestLen=i-j;}
  if(bestLen>=fps*3.6)break;
 }
 if(bestStart<0||bestLen<Math.max(5,Math.round(fps*.45)))return '';
 begin=bestStart;
 const maxCount=Math.min(bestLen,Math.round(fps*3.6)),step=Math.max(1,Math.ceil(maxCount/140));
 const rows=[];
 for(let i=0;i<maxCount;i+=step){
  const v=values[begin+i];if(v==null)continue;
  rows.push({sec:i/fps,cent:((v%100)+150)%100-50});
 }
 if(rows.length<3)return '';
 const W=340,H=130,padL=36,padR=9,top=9,bottom=25;
 const x=t=>padL+t/Math.max(.5,maxCount/fps)*(W-padL-padR),y=c=>top+(50-c)/100*(H-top-bottom);
 const path=rows.map((p,i)=>(i?'L':'M')+x(p.sec).toFixed(2)+' '+y(p.cent).toFixed(2)).join(' ');
 const ticks=[-50,-25,0,25,50].map(c=>'<line x1="'+padL+'" x2="'+(W-padR)+'" y1="'+y(c)+'" y2="'+y(c)+'" stroke="#554b61" stroke-dasharray="'+(c===0?'0':'4 5')+'" opacity=".7"/><text x="'+(padL-6)+'" y="'+(y(c)+4)+'" text-anchor="end" fill="#c4b5ce" font-size="10">'+(c>0?'+':'')+c+'</text>').join('');
 const seconds=[0,1,2,3].filter(t=>t<=maxCount/fps).map(t=>'<text x="'+x(t)+'" y="'+(H-4)+'" fill="#c4b5ce" text-anchor="middle" font-size="10">'+t.toFixed(1)+'</text>').join('');
 return '<svg class="vl-observation-curve" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="실제 녹음의 지속 구간 약 '+(maxCount/fps).toFixed(1)+'초 음정 편차 그래프">'+
  ticks+'<text x="'+padL+'" y="10" font-size="10" fill="#d9c7e8">(cent)</text><path d="'+path+'" fill="none" stroke="#bb72ff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'+seconds+'<text x="'+(W-padR)+'" y="'+(H-4)+'" text-anchor="end" font-size="10" fill="#c4b5ce">(초)</text></svg>';
}
function observe(s,m) {
 const metric=METRICS.find(x=>x.key===s.metric)||METRICS[0],current=valid(metric.get(analysis(m),m));
 const ordered=trendRows(s,metric,'all'),idx=ordered.findIndex(x=>x.m.id===m.id);   // one recording against the first recording, whatever the day choice
 const first=ordered[0],baseline=first?.m.id!==m.id?first:null;
 const isComparable=metric.key==='rating'||comparable(analysis(baseline?.m||{}),analysis(m));
 const initial=isComparable?(baseline?.value??null):null,difference=initial!=null&&current!=null?current-initial:null;
 const improved=baseline&&isComparable?metricColor(metric,initial,current):'neutral';
 const safe=value=>esc(String(value??''));
 const title='분석 관찰';
 const explanation=()=>{
  if(current==null)return '이 녹음에서 해당 측정값을 확인하지 못했어요.';
  if(baseline&&!isComparable)return pairHoldLine(analysis(baseline.m),analysis(m));
  if(initial==null)return '첫 녹음의 측정값이에요. 다음 녹음과 비교하면 변화가 표시돼요.';
  if(metric.better===0)return '첫 녹음과의 변화는 확인할 수 있지만 높고 낮음만으로 좋고 나쁨을 판단하지 않아요.';
  const percent=Math.abs(initial)>0?Math.round(Math.abs(difference)/Math.abs(initial)*100):null;
  const direction=difference<0?'줄었어요':'늘었어요';
  return '첫 녹음('+metric.fmt(initial,analysis(baseline.m))+')보다 '+metric.label+' 수치가 '+(percent!=null?'약 '+percent+'% ':'')+direction+' '+(improved==='good'?'좋아진 방향이에요.':improved==='bad'?'아쉬운 방향이에요.':'비슷한 수준이에요.');
 };
 const valueLabel=current==null?'측정 안 됨':metric.fmt(current,analysis(m));
 const compare=initial!=null?'<div class="vl-observation-compare"><span>첫 녹음 대비</span><strong>'+safe(metric.fmt(initial,analysis(baseline.m)))+' → '+safe(valueLabel)+'</strong>'+(Math.abs(initial)>0?'<em class="'+improved+'">'+safe('('+(['high','stable'].includes(metric.key)?Math.abs(Math.round(current/100)-Math.round(initial/100))+'반음 ':Math.round(Math.abs(difference)/Math.abs(initial)*100)+'% ')+(difference<0?'감소':'증가')+')')+'</em>':'')+'</div>':'';
 V.sheet({title:day(m)+' · '+title,body:'<div class="vl-observation-card"><div class="vl-observation-label">♧ 분석 관찰</div><h3>'+safe(metric.key==='wob'?'지속음의 음정 흔들림(위블)':metric.label)+(V.metricInfo?V.metricInfo((metric.key==='high'||metric.key==='stable')?'range':metric.key,metric.label):'')+'</h3><div class="vl-observation-value">'+safe(valueLabel)+'</div>'+compare+
  '<div class="vl-observation-loading" data-observe-loading role="status">녹음의 실제 음정 곡선을 확인하고 있어요…</div><div data-observe-curve></div>'+
  '<p class="vl-observation-summary">'+safe(explanation())+'</p><p class="vl-observation-note">'+safe(metric.guide)+'</p>'+
  (analysis(m)&&!V.analysisReliable(analysis(m))?'<p class="vl-observation-note">음성 검출이 적거나 반주가 커서 측정 신뢰도가 낮아요.</p>':'')+'</div>',
  foot:'<button type="button" class="btn block" data-close-observe>확인</button>',
  onMount:(el,close)=>{
   el.classList.add('vl-observation-sheet');
   el.closest('.sheet-back')?.classList.add('vl-observation-overlay');
   el.querySelector('[data-close-observe]').onclick=close;
   let active=true;const stop=()=>{active=false;};
   // Closing the sheet removes it, so all delayed renders check isConnected.
   const existing=s.results.get(m.id);
   const fill=result=>{
    if(!active||!el.isConnected)return;
    const html=observationCurve(result);
    el.querySelector('[data-observe-curve]').innerHTML=html||'<p class="vl-observation-note">지속해서 노래한 구간이 충분하지 않아 곡선을 만들지 못했어요.</p>';
    el.querySelector('[data-observe-loading]').remove();
   };
   if(existing?.curve)fill(existing);
   else V.analyzeRecording(m,{save:false}).then(fill).catch(error=>{
     if(!active||!el.isConnected)return;
     const note=el.querySelector('[data-observe-loading]');if(note)note.textContent='녹음 곡선을 가져오지 못했어요: '+String(error?.message||error);
   });
  }});
}
/** Where the reported highest notes happened, so the owner can check them by ear on this player. */
function highEvidence(m) {
  const a=analysis(m),g=a?.v>=2?a.metrics?.range:null;
  if(!g||(!g.validHigh&&!g.instantaneous))return '';
  const chips=(p,label)=>(p?.times?.length?p.times:p&&Number.isFinite(p.t)?[{t:p.t}]:[]).filter(x=>Number.isFinite(x?.t)).slice(0,3)
    .map(x=>'<button type="button" class="vl-chip-play" data-seek-at="'+x.t+'" aria-label="'+esc(label+' '+time(x.t)+' 부분 듣기')+'"><i class="ph-fill ph-play"></i> '+esc(time(x.t))+'</button>').join('');
  const row=(label,p,note)=>p?'<div class="vl-high-row"><span>'+label+' <strong>'+esc(p.note)+'</strong>'+(note?' <small>'+note+'</small>':'')+'</span><span class="vl-high-times">'+chips(p,label)+'</span></div>':'';
  return '<div class="vl-high-evidence"><div class="vl-measure"><span>최고음 확인 <small>눌러서 그 부분 듣기 (1초 전부터)</small></span></div>'+
    (g.validHigh?row('유효 최고음',g.validHigh,'0.2초 이상'):'<p class="vl-muted">유효 최고음 판정 보류</p>')+
    row('순간 최고음',g.instantaneous,'평가에 쓰지 않음')+'</div>';
}
/** How this take's saved result was measured: 녹음 그대로 · MR 빼고 (which MR) · AI 분리 후. */
function methodLine(m){
  const a=analysis(m),method=a&&V.mrReanalyze?.method(a);
  if(!method)return '';
  const id=a.confidence?.mrRemoved?.trackId,track=id&&(V.db.songs||[]).flatMap(x=>x.mrTracks||[]).find(t=>String(t.id)===String(id))?.title;
  return '<p class="vl-muted vl-method" data-lab-method>측정 방식 · '+esc(method+(track?' ('+track+')':''))+'</p>';
}
/** MR로 다시 분석 (app/mr-reanalyze.js): the song's recordings measured again with its MR file removed. The date chips
 * that are on count as "고른 녹음". The lab's own recordings are updated in place, then the screen is drawn again. */
function remrRow(s){
  const n=V.mrReanalyze?.count(s.song,s.items);
  if(!n||!n.all)return '';
  return '<button type="button" class="vl-remr" data-lab-remr><i class="ph ph-music-notes-minus" aria-hidden="true"></i><span><strong>MR로 다시 분석</strong><small>'+(n.held?'판정 보류·분석 전 '+n.held+'개 · ':'')+'곡 MR을 빼고 다시 재요</small></span><i class="ph ph-caret-right" aria-hidden="true"></i></button>';
}
const openRemr=s=>s.reanalyzing?V.toast('다시 분석이 끝난 뒤 눌러 주세요.'):V.mrReanalyze?.open(s.song,{items:s.items,picked:s.selected,onSaved:m=>s.results.delete(m.id),onClose:run=>{if(run&&!s.dead){s.dirty=true;screen(s);}}});
function makeSegment(s,m) {
  const total=Math.max(0,Number(m.durationSeconds)||0), start=s.start[m.id]??0, end=Math.min(total,start+16), full=s.results.get(m.id);
  const slice=full?.curve?.map((v,i)=>({t:i/full.fps,value:v==null?null:((v%100)+150)%100-50})).filter(p=>p.t>=start&&p.t<=end&&p.value!=null)||[];
  const sampled=slice.filter((_,i)=>i%Math.max(1,Math.ceil(slice.length/25))===0);
  return (m.analysis?.v===1?'<p class="vl-muted">이전 v1 결과를 보존하고 있어요. 아래 분석 버튼으로 v2 유효·안정 최고음을 다시 확인하세요.</p>':'')+'<section class="vl-segment"><h2>구간 분석 <span>'+time(start)+'–'+time(end)+'</span></h2><div class="vl-measure"><span>지속음 흔들림 <small>전체 녹음 기준</small></span><strong>'+esc(analysis(m)?.metrics?.stability?.wobbleCents==null?'분석 전':'±'+analysis(m).metrics.stability.wobbleCents+' cent')+'</strong></div>'+methodLine(m)+highEvidence(m)+(V.vocalRangeCompare?V.vocalRangeCompare(s.song,analysis(m),{playable:true}):'')+(V.scoreNoteBlock?V.scoreNoteBlock(s.song,m):'')+(V.arNoteBlock?V.arNoteBlock(s.song,m):'')+
    '<div class="vl-ruler" aria-hidden="true"><span>−50</span><i></i><span>0</span><i></i><span>+50</span></div>'+
    (full?(sampled.length?'<div class="vl-segment-chart"><div class="vl-chart-heading">선택 구간의 음정 편차 (cent)</div>'+plot(sampled.map(x=>({value:x.value,label:time(x.t)})),{height:115})+'</div>':'<p class="vl-muted">이 구간에서 목소리를 측정하지 못했어요.</p>'):'<button type="button" class="vl-analyze" data-analyze>이 구간 그래프 보기 <i class="ph ph-arrow-right"></i></button>')+
    '<label class="vl-range-label">분석할 구간 이동<input type="range" min="0" max="'+Math.max(0,Math.floor(total-16))+'" value="'+Math.min(start,Math.max(0,Math.floor(total-16)))+'" data-start aria-label="구간 시작 위치"></label><p class="vl-muted" data-analyze-status aria-live="polite">'+(full?'파형과 수치는 실제 녹음 분석 결과예요.':'그래프는 이 녹음을 분석하면 표시돼요.')+'</p></section>';
}
const TIP_METRIC={into:'intonation',wob:'stability',phr:'phrase'};
/** 다음 연습 of this song: the ONE shared list (VZ.nextPractice, app/next-practice.js) filtered to the song, its 측정 기반
 * rows worked out from this song's takes (minus a measure 이 곡의 변화 shows as better). At most NEXT_MAX rows still to do;
 * 다음 연습 전체 보기 opens the whole list. The AI button stays here: it asks for one more exercise for THIS take and
 * segment (the whole list's AI asks for one from the week's records), and asks before anything is sent. */
const NEXT_MAX=5;
function recommendations(s) {
  // A measure 이 곡의 변화 shows as 좋아진 방향 is not recommended on the same screen: the next one is.
  const report=labReport(s);
  const improved=Object.keys(TIP_METRIC).filter(key=>report?.[TIP_METRIC[key]]?.state==='better');
  const result=V.practiceTips(s.items,{songId:s.song.id,exclude:improved});
  const skipped=result.enough?(result.skipped||[]).map(key=>G?.METRICS.find(d=>d.id===TIP_METRIC[key])?.title).filter(Boolean):[];
  const note=skipped.length?'위 ‘처음 vs 최근’에서 좋아진 방향인 항목('+skipped.join('·')+')은 추천에서 뺐어요.':'';
  let items=[];
  // This screen's own AI 다른 연습 drafts are not rows: the card under the list shows the one of the chosen take.
  try{items=V.nextPractice?V.nextPractice({songId:s.song.id,media:s.all,tips:result,tipsSongId:s.song.id}).items.filter(x=>!x.doneToday&&x.action?.ref?.kind!=='ai-exercise').slice(0,NEXT_MAX):[];}
  catch(error){console.error(error);}
  return {count:result.count,enough:!!result.enough,tips:result.enough?result.tips:[],items,note};
}
function tipCard(t,songId){return '<details '+(t.aiRef?'open ':'')+'class="vl-tip" data-tip="'+esc(t.key)+'"><summary><span><strong>'+esc(t.name)+'</strong><small>'+esc(t.metric+(t.value?' · '+(t.basis?t.basis+' ':'')+t.value:''))+'</small></span><i class="ph ph-caret-down" aria-hidden="true"></i></summary><div class="vl-tip-detail"><p>'+esc(t.reason)+'</p><ol>'+t.steps.map(step=>'<li>'+esc(step)+'</li>').join('')+'</ol><p class="vl-tip-goal">목표: '+esc(t.goal)+' · 권장 '+t.minutes+'분</p><div class="vl-tip-actions"><a href="'+esc(V.guideHref?V.guideHref(t.aiRef?'ai:'+t.aiRef:'analysis:'+t.key,songId):'#/practice-set?guide='+encodeURIComponent(t.aiRef?'ai:'+t.aiRef:'analysis:'+t.key)+'&song='+encodeURIComponent(songId))+'">따라 하기</a><button type="button" data-practice-tip="'+esc(t.key)+'">연습 기록에 담기</button></div></div></details>';}
const aiContext=s=>String(s.active)+':'+(s.start[s.active]||0);
const savedAITip=s=>s.aiTips?.get(aiContext(s))||[...(s.aiTips||new Map())].reverse().find(([key])=>key.startsWith(String(s.active)+':'))?.[1];
function recommendationList(recs,songId,aiTip=null) {
  const here='#/growth-song/'+encodeURIComponent(songId);
  const rows=recs.items.length&&V.nextPractice?.listHtml?V.nextPractice.listHtml(recs.items,{here}):'';
  const empty=recs.enough?'지금은 이 곡에서 따로 할 다음 연습이 없어요.':'이 곡의 신뢰할 수 있는 분석 녹음이 3개 이상 모이면 맞춤 연습 목록이 나와요. 현재 '+recs.count+'개예요.';
  return '<section class="vl-weak-block vl-recommend">'+
    (rows?'<div class="vl-next" data-vl-next>'+rows+'</div>':'<p class="vl-muted" data-vl-next-empty>'+esc(empty)+'</p>')+
    (rows&&!recs.enough?'<p class="vl-muted">'+esc(empty)+'</p>':'')+
    (recs.note?'<p class="vl-muted" data-tip-skipped>'+esc(recs.note)+'</p>':'')+
    '<a class="vl-next-all" href="#/next-practice" data-vl-next-all>다음 연습 전체 보기 <i class="ph ph-arrow-right" aria-hidden="true"></i></a>'+
    '<div class="vl-tip-list" data-ai-tip>'+(aiTip?tipCard(aiTip,songId):'')+'</div><div class="vl-recommend-actions"><button type="button" class="vl-repeat-practice" data-repeat-practice>이 구간 반복 듣기</button><button type="button" class="vl-repeat-practice" data-ai-exercise>다른 연습 하나 AI 추천받기</button></div><p class="vl-muted" data-ai-status role="status">이 구간 기록을 바탕으로 위 목록에 없는 연습 한 가지를 추천해요. 보내기 전에 무엇을 보내는지 먼저 보여 드려요.</p></section>';
}
/** 목표에 담기 on the 다음 연습 rows (the list's own way), then the rows again in place. */
function bindNext(s){
  const slot=s.slots?.tips;if(!slot||!V.nextPractice?.bindAdd)return;
  const shown=()=>recommendations(s).items;
  V.nextPractice.bindAdd(slot,id=>shown().find(x=>x.id===id),it=>{
    const host=slot.querySelector('[data-vl-next]');if(!host)return;
    host.innerHTML=V.nextPractice.listHtml(shown(),{here:'#/growth-song/'+encodeURIComponent(s.song.id)});
    bindNext(s);
    host.querySelector('[data-np-item="'+CSS.escape(it.id)+'"] [data-np-added]')?.setAttribute('tabindex','-1');
  });
}
/** 두 녹음 비교: any two of the song's recordings → 가리고 듣고 평가 (the listening sheet, app/listen-verdict.js),
 * 측정값 나란히 보기 (the A/B table) and a memo for the pair. A take picked here joins the chips above so it can be played. */
function comparePair(s){
  const picked=s.selected.map(id=>s.items.find(m=>m.id===id)).filter(Boolean),pool=picked.length>1?picked:s.items;
  const a=s.items.find(m=>m.id===s.compareA)||pool[0],b=s.items.find(m=>m.id===s.compareB)||pool.at(-1);
  return [a,b];
}
function comparePanel(s) {
  if(s.items.length<2)return '<p class="vl-muted" data-song-compare-empty>이 곡의 녹음이 두 개 이상이면 두 녹음을 골라 가리고 듣거나 측정값을 나란히 볼 수 있어요.</p>';
  const [a,b]=comparePair(s);
  // 들어 보고 남긴 평가 (kind listen-verdict, app/listen-verdict.js) shares the list: never read as this memo.
  const saved=(V.db.comparisonReports||[]).find(x=>x.kind!=='vocal-lab'&&x.kind!=='listen-verdict'&&x.firstId===a.id&&x.secondId===b.id);
  const options=selected=>s.items.map(m=>'<option value="'+esc(m.id)+'"'+(m.id===selected.id?' selected':'')+'>'+esc(day(m)+' · '+M.label(m)+((s.kinds?.get(m.id)||[]).length?' ('+s.kinds.get(m.id).join('·')+')':''))+'</option>').join('');
  const verdicts=window.VzipListenVerdict?.list?.(V.db,{songId:s.song.id}).length||0;
  return '<p class="vl-part-basis">이 곡의 녹음 가운데 두 개를 골라요. 가리고 들으면 어느 쪽이 나은지 귀로 먼저 정할 수 있어요.</p>'+
    '<div class="vl-compare-picks"><label>A 녹음<select data-compare-a>'+options(a)+'</select></label><label>B 녹음<select data-compare-b>'+options(b)+'</select></label></div>'+
    '<div class="vl-compare-actions"><button type="button" data-compare-first>첫 녹음 ↔ 최근 녹음</button></div>'+
    (V.listenCompare?'<button type="button" class="vl-report lc-lab-entry" data-listen-open data-song="'+esc(s.song.id)+'" data-a="'+esc(a.id)+'" data-b="'+esc(b.id)+'"><strong>가리고 듣고 평가하기</strong><span>'+(verdicts?'남긴 평가 '+verdicts+'개':'가리고 듣고 평가를 남겨요')+'</span><i class="ph ph-caret-right" aria-hidden="true"></i></button>':'')+
    '<details data-compare-panel'+(s.compareOpen?' open':'')+'><summary>측정값 나란히 보기 · 메모 <i class="ph ph-caret-down" aria-hidden="true"></i></summary><div class="vl-compare-body"><p class="vl-muted">A/B를 누르면 재생 위치를 유지한 채 해당 녹음으로 전환해요.</p><div class="vl-compare-actions"><button type="button" data-compare-switch>같은 위치에서 '+(s.active===a.id?'B':'A')+' 듣기</button></div>'+
    (V.measureTable?.(a,b)||'<p class="vl-muted">두 녹음의 측정 결과가 있으면 비교표가 나타나요.</p>')+
    '<form data-compare-form><label>달라진 점<textarea name="notes" maxlength="5000" placeholder="직접 느낀 변화를 적어주세요">'+esc(saved?.notes||'')+'</textarea></label><label>다음 연습 목표<textarea name="goal" maxlength="3000">'+esc(saved?.goal||'')+'</textarea></label><div class="vl-compare-actions"><button type="button" data-compare-ai>메모 AI 정리</button><button type="submit">비교 메모 저장</button></div><p class="vl-muted" data-compare-output aria-live="polite"></p></form></div></details>';
}
/* ---------- 약한 곳 ---------- */
const fold=(key,title,sub,body,open)=>'<details class="vl-fold" data-song-fold="'+key+'"'+(open?' open':'')+'><summary><span>'+title+'</span>'+(sub?'<small>'+sub+'</small>':'')+'<i class="ph ph-caret-down" aria-hidden="true"></i></summary><div class="vl-fold-body">'+body+'</div></details>';
/** The recordings a section can be listened to in (audio the device can open; as the plan screen picks them), newest first. */
const audible=s=>s.items.filter(m=>!M.isVideo?.(m)&&(!m.size||m.size<=60*1024*1024)).slice().reverse();
function stopWeak(s){s.weakToken=(s.weakToken||0)+1;const w=s.weakAudio;if(w){try{w.audio.pause();w.audio.removeAttribute('src');w.audio.load();}catch{}w.revoke?.();}s.weakAudio=null;}
/** 음높이 확인 구간 (app/weak-phrase.js): places in ONE recording far from the nearest semitone, to listen to — candidates, never a verdict. */
function paintPhrases(s){
  const host=s.slots.phrases,list=audible(s);
  if(!host)return;
  if(!window.VzipWeakPhrase||!list.length){host.innerHTML='<h3 class="vl-sub">음높이 확인 구간</h3><p class="vl-muted">'+(list.length?'이 기기에서는 구간 찾기를 쓸 수 없어요.':'들어 볼 수 있는 이 곡 녹음이 아직 없어요.')+'</p>';return;}
  const pickId=list.some(m=>m.id===s.weakId)?s.weakId:list[0].id;
  host.innerHTML='<h3 class="vl-sub">음높이 확인 구간</h3><p class="vl-muted">녹음 하나에서 가까운 반음과 차이가 큰 곳을 찾아 들려 드려요. 들어 볼 후보예요. 정답 판정이 아니에요.</p>'+
    '<div class="vl-weak-pick"><label class="sr-only" for="vl-weak-take">구간을 찾을 녹음</label><select id="vl-weak-take" data-weak-take>'+list.map(m=>'<option value="'+esc(m.id)+'"'+(m.id===pickId?' selected':'')+'>'+esc(day(m)+' · '+M.label(m))+'</option>').join('')+'</select>'+
    '<button type="button" data-weak-find>구간 찾기</button></div><div class="vl-weak-results" data-weak-results role="status"></div>';
  const select=host.querySelector('[data-weak-take]'),button=host.querySelector('[data-weak-find]'),out=host.querySelector('[data-weak-results]');
  const show=(item,found)=>{
    out.innerHTML='<p class="vl-muted">음높이 확인 후보 '+found.length+'개 · 듣고 실제로 연습할 곳인지 확인해 주세요.</p>'+
      found.map((seg,i)=>'<div class="vl-weak-item"><button type="button" class="vl-chip-play" data-weak-play="'+i+'" aria-label="'+esc(time(seg.start)+'부터 '+time(seg.end)+'까지 듣기')+'"><i class="ph-fill ph-play" aria-hidden="true"></i> '+esc(time(Math.floor(seg.start))+'–'+time(Math.ceil(seg.end)))+'</button>'+
        '<span>가까운 반음과 '+(seg.deviation>0?'+':'')+seg.deviation+' cent · 정답 판정 아님</span></div>').join('')+'<div class="vl-weak-player" data-weak-player></div>';
    out.querySelectorAll('[data-weak-play]').forEach(b=>b.onclick=async()=>{
      const seg=found[Number(b.dataset.weakPlay)],box=out.querySelector('[data-weak-player]');
      stopWeak(s);const token=s.weakToken;box.textContent='파일을 여는 중…';
      try{
        const src=await M.src(item);
        if(token!==s.weakToken||s.dead||!box.isConnected){if(src.revoke)URL.revokeObjectURL(src.url);return;}
        const audio=document.createElement('audio');audio.controls=true;audio.preload='metadata';audio.src=src.url;audio.setAttribute('aria-label','확인 구간 듣기');
        s.weakAudio={audio,revoke:src.revoke?()=>URL.revokeObjectURL(src.url):null};box.replaceChildren(audio);
        audio.addEventListener('loadedmetadata',()=>{audio.currentTime=Math.min(seg.start,Number.isFinite(audio.duration)?Math.max(0,audio.duration-.1):seg.start);},{once:true});
        audio.addEventListener('timeupdate',()=>{if(audio.currentTime>=seg.end)audio.pause();});
        audio.play().catch(()=>{});
      }catch(error){if(token===s.weakToken&&box.isConnected)box.textContent=error.message||'재생할 수 없어요.';}
    });
  };
  if(s.weak?.id===pickId&&s.weak.found?.length)show(list.find(m=>m.id===pickId),s.weak.found);
  select.onchange=()=>{stopWeak(s);s.weakId=select.value;out.textContent='';};
  button.onclick=async()=>{
    const item=list.find(m=>m.id===select.value);
    if(!item)return;
    stopWeak(s);const token=s.weakToken;s.weakId=item.id;button.disabled=true;out.textContent='이 기기에서 녹음을 살펴보고 있어요…';
    try{
      const result=s.results.get(item.id)?.notes?s.results.get(item.id):await V.analyzeRecording(item,{save:false,onProgress:p=>{if(token===s.weakToken&&out.isConnected)out.textContent='구간 확인 중 · '+Math.round(Math.min(1,Math.max(0,p))*100)+'%';}});
      if(token!==s.weakToken||s.dead||!out.isConnected)return;
      if(!V.analysisReliable(result.summary)){out.textContent='목소리가 짧거나 반주가 커서 구간 찾기를 보류했어요.';return;}
      const found=window.VzipWeakPhrase.candidates(result)||[];
      s.weak={id:item.id,found};
      if(!found.length){out.textContent='확인해 볼 만큼 차이가 큰 곳을 찾지 못했어요.';return;}
      show(item,found);
    }catch(error){if(token===s.weakToken&&out.isConnected)out.textContent=error.message||'녹음을 살펴보지 못했어요.';}
    finally{if(button.isConnected)button.disabled=false;}
  };
}
/** 레슨 지적 (app/score-points.js): how many points the song has and how the last checks went, with the song page's own
 * card under it (부르면서 체크 · 지적 추가). Read-only here. */
function paintPoints(s){
  const host=s.slots?.points,P=window.VzipScorePointsModel;
  if(!host)return;
  if(!P||!V.scorePoints){host.innerHTML='';return;}
  const on=P.active(P.points(V.db,s.song.id)),runs=P.runs(V.db,s.song.id);
  const rows=on.map(p=>({p,r:P.record(runs,p.id)}));
  const kept=rows.reduce((n,x)=>n+x.r.kept,0),total=rows.reduce((n,x)=>n+x.r.total,0);
  // The points missed most in the last checks first: those are the weak places.
  const shown=rows.filter(x=>x.r.total).sort((x,y)=>(y.r.total-y.r.kept)-(x.r.total-x.r.kept)).slice(0,3);
  host.innerHTML='<h3 class="vl-sub">레슨 지적</h3>'+
    '<p class="vl-muted" data-weak-points-sum>'+(on.length?'지적 '+on.length+'개 · '+(total?'최근 체크 '+total+'번 중 '+kept+'번 지켰어요':'아직 부르면서 체크한 적이 없어요'):'이 곡에 적어 둔 레슨 지적이 아직 없어요.')+'</p>'+
    (shown.length?'<ul class="vl-points">'+shown.map(({p,r})=>'<li data-weak-point="'+esc(p.id)+'"><strong>'+esc(P.label(p.measures))+'</strong><span>'+esc(p.text)+'</span><small>'+esc(P.recordText(r))+'</small></li>').join('')+'</ul>':'')+
    '<div class="vl-light vl-points-card" data-weak-points-card></div>';
  V.scorePoints.card(host.querySelector('[data-weak-points-card]'),s.song.id);
}
function playerCard(s,m) {
  const idx=s.selected.indexOf(m.id),total=Math.max(0,Number(m.durationSeconds)||0);
  const previous=s.items.find(x=>x.id===s.selected[idx-1]),next=s.items.find(x=>x.id===s.selected[idx+1]);
  const hasWave=Array.isArray(m.waveform)&&m.waveform.length>0;
  const dateLabel=M.dateOf(m)||'날짜 없음',name=M.label(m)||'제목 없는 녹음';
  const itemName=name.startsWith(dateLabel)||name===dateLabel?name:dateLabel+' · '+name;
  const readable=(value)=>value?esc(value):'';
  const hint=(item,dir)=>'<button type="button" class="vl-peek '+dir+'" data-'+(dir==='left'?'prev':'next-peek')+
    ' aria-label="'+(dir==='left'?'이전':'다음')+' 녹음'+(item?' · '+esc(M.label(item)):' 없음')+'"'+(!item?' disabled':'')+'>'+
    '<i class="ph ph-caret-'+(dir==='left'?'left':'right')+'" aria-hidden="true"></i></button>';
  return hint(previous,'left')+'<div class="vl-player" data-card data-waveform="'+(hasWave?'yes':'no')+'">'+
    '<div class="vl-player-head"><div class="vl-player-title"><span class="vl-player-eyebrow">'+esc(day(m))+' · '+(idx+1)+'번째 녹음</span><strong>'+esc(name)+'</strong></div><span class="vl-player-count">'+(idx+1)+' / '+s.selected.length+'</span></div>'+
    (hasWave?waveform(m):'<div class="vl-wave-compact"><i class="ph ph-waveform"></i><span>파형 정보 없음 · 녹음은 정상 재생할 수 있어요</span></div>')+
    '<div class="vl-seek"><span data-time>0:00</span><input type="range" min="0" max="1000" value="0" data-seek aria-label="재생 위치"><span data-duration>'+time(total)+'</span></div>'+
    '<div class="vl-controls"><button type="button" data-loop aria-label="구간 반복" aria-pressed="false"><i class="ph ph-repeat"></i></button><button type="button" data-previous aria-label="이전 녹음"'+(!previous?' disabled':'')+'><i class="ph ph-skip-back"></i></button><button type="button" class="vl-play" data-play aria-label="재생"><i class="ph-fill ph-play"></i></button><button type="button" data-next aria-label="다음 녹음"'+(!next?' disabled':'')+'><i class="ph ph-skip-forward"></i></button><button type="button" class="vl-speed" data-speed aria-label="재생 속도">1.0×</button></div>'+
    '<div class="vl-internal-player" data-player></div><p class="vl-muted vl-player-status" data-player-status role="status"></p></div>'+hint(next,'right');
}
/** The fixed frame of the screen: the sections in order (큰 정리 2번), with a slot for each part. A slot is filled by its
 * own painter, so a section that holds something typed or playing (구간 A/B, 음높이 확인 구간) is not redrawn by a tap
 * elsewhere. The top (기간 · 한마디) is the light part of app/growth-song-page.js. */
const part=(key,title,body,cls='')=>'<section class="vl-part'+(cls?' '+cls:'')+'" data-song-section="'+key+'" aria-labelledby="vl-'+key+'-title">'+(title?'<header class="vl-part-head"><h2 id="vl-'+key+'-title">'+title+'</h2></header>':'')+body+'</section>';
function frame(s){
  return '<div class="gsp gsp-top" data-gsp><div data-slot="periods"></div><div data-slot="hero"></div></div>'+
    '<section class="vl-part" data-song-section="changes" aria-labelledby="vl-changes-title"><div data-slot="verdict"></div></section>'+
    part('takes','녹음 타임라인','<div data-slot="check"></div><div data-slot="takes"></div>')+
    part('weak','약한 곳','<p class="vl-part-basis">되풀이해 흔들리는 곳, 레슨에서 들은 지적, 구간끼리 듣기를 한자리에 모았어요. 숫자는 참고예요.</p>'+
      '<div data-slot="pass"></div><div class="vl-weak-block" data-slot="phrases" data-weak="phrases"></div><div class="vl-weak-block" data-slot="points" data-weak="points"></div>'+
      '<details class="vl-fold" data-song-fold="ab" data-weak="ab"><summary><span>구간 A/B</span><small>두 녹음의 같은 구간을 맞춰 번갈아 들어요</small><i class="ph ph-caret-down" aria-hidden="true"></i></summary><div class="vl-fold-body vl-light" data-ab-host></div></details>')+
    part('next','이 곡 다음 연습','<div data-slot="tips"></div>')+
    part('compare','들어 본 평가 · 두 녹음 비교','<div class="vl-heard" data-slot="heard"></div><div data-slot="compare"></div>','vl-compare')+
    '<details class="vl-part vl-deep" data-song-section="deep"'+(foldOpen(s,'deep')||s.open.trend?' open':'')+'><summary><h2>깊이 보기</h2><small>녹음별 변화 · 같은 날 세기 · 측정 방식 · 리포트 저장 · 다시 분석 · AI 해석</small><i class="ph ph-caret-down" aria-hidden="true"></i></summary>'+
      '<div data-slot="trend"></div><div data-slot="tools"></div><div data-slot="measure"></div><div data-slot="deep"></div></details>'+
    '<p class="vl-muted vl-disclaimer" data-song-disclaimer>수치는 음성 측정에 기반한 참고 정보예요. 분석하지 않은 녹음에는 결과를 만들어 넣지 않아요.</p>';
}
function bindFrame(s){
  const host=s.host;
  watchFold(s,host.querySelector('[data-song-section="deep"]'),'deep',()=>{if(host.querySelector('[data-song-section="deep"]')?.open)sizePlots(host);});
  // 구간 A/B (app/segment-ab-ui.js) straight from the song: the panel a 집중 연습 계획 opens, without a plan.
  const ab=host.querySelector('[data-song-fold="ab"]'),abHost=ab.querySelector('[data-ab-host]');
  ab.addEventListener('toggle',()=>{
    if(!ab.open){V.segmentABStop?.();abHost.replaceChildren();return;}
    if(abHost.childElementCount)return;
    if(!V.segmentABPanel||s.items.length<2){abHost.innerHTML='<p class="vl-ab-empty" data-ab-empty>'+(V.segmentABPanel?'이 곡의 녹음이 두 개 이상이면 같은 구간을 맞춰 들어 볼 수 있어요.':'이 기기에서는 구간 A/B를 쓸 수 없어요.')+'</p>';return;}
    V.segmentABPanel(abHost,{songId:s.song.id},s.items);
  });
  // 곡 확인이 필요해 보이는 녹음 of this song (app/song-check.js).
  const parts=V.growthSongParts;
  if(parts&&s.slots.check){
    s.slots.check.innerHTML=parts.checkHtml(s.song,s.all);
    const check=s.slots.check.querySelector('[data-gsp-check]');
    if(check)V.songCheck.wire(check,s.all,()=>{if(location.hash.startsWith('#/growth-song/'))V.render?.();});
  }
}
/** The light player under 한마디 (▶처음 ▶최근): one at a time with the timeline's player. */
function stopHero(s){try{s.heroPlayer?.destroy?.();}catch{}s.heroPlayer=null;s.host.querySelector('[data-gsp-player]')?.replaceChildren();}
function paintHero(s){
  const parts=V.growthSongParts;
  s.slots.periods.innerHTML=periodHtml(s);
  if(!parts){s.slots.hero.innerHTML='';return;}
  stopHero(s);
  const takes=s.items.map(m=>({m,date:M.dateOf(m),analysed:!!analysis(m)}));
  s.slots.hero.innerHTML=parts.heroHtml(s.song,heroData(s),takes);
  s.slots.hero.querySelectorAll('[data-gsp-play]').forEach(b=>b.onclick=()=>{
    const item=s.all.find(m=>String(m.id)===b.dataset.gspPlay),box=s.slots.hero.querySelector('[data-gsp-player]');
    stopHero(s);
    if(!item||!box){V.toast('녹음을 찾을 수 없어요. 지워졌거나 다른 기기에만 있어요.','error');return;}
    try{s.player?.el?.pause();}catch{}
    s.heroPlayer=M.player(box,item,{});s.heroPlayer.play?.();
  });
  s.slots.periods.querySelectorAll('[data-gsp-period]').forEach(b=>b.onclick=()=>{
    if(b.dataset.gspPeriod===s.period)return;
    s.period=b.dataset.gspPeriod;
    paintVerdict(s);
    s.slots.periods.querySelector('[data-gsp-period="'+CSS.escape(s.period)+'"]')?.focus({preventScroll:true});
  });
}
/** 기간 · 한마디, 처음 vs 최근, 파사지오 참고, 들어 본 평가 and the tools of 깊이 보기 that read the verdict (다시 분석 ·
 * AI 해석): drawn when a take, an analysis, the switch or the chip changed (s.dirty). */
function paintVerdict(s){
  const box=s.slots.verdict;
  box.innerHTML=verdictHtml(s);
  paintHero(s);
  const p=periodOf(s);
  s.slots.measure.innerHTML=growthParts(s).tools;
  s.slots.pass.innerHTML=passHtml(s);
  if(V.growthSongParts)s.slots.heard.innerHTML=V.growthSongParts.heardHtml(s.song,s.v?.now?.state||'');
  const gc=box.querySelector('[data-growth-changes]');
  if(gc)window.VzipGrowthChangesUI.mount(gc,s.all,{songId:s.song.id,practice:s.practice,head:false,...(p?{period:{from:p.from,to:p.to}}:{}),
    empty:{verdicts:'이 곡에 남긴 들어 본 평가가 아직 없어요. 아래 ‘두 녹음 비교’에서 가리고 듣고 남길 수 있어요.',songs:p?p.label+'에 그 전 녹음과 견줄 이 곡 녹음이 없어요.':'같은 방법으로 잰 이 곡 녹음이 다른 날 두 개 이상 모이면 처음과 최근을 견줘 보여 드려요.'}});
  const sw=box.querySelector('[data-song-practice]');
  sw.onchange=()=>{s.practice=sw.checked;V.growthSong?.setPractice(s.practice);s.dirty=true;screen(s);s.slots.verdict.querySelector('[data-song-practice]')?.focus({preventScroll:true});};
  const tools=s.slots.measure;
  const redoButton=tools.querySelector('[data-growth-reanalyze]');
  if(redoButton)redoButton.onclick=async()=>{
    if(s.reanalyzing)return;
    const todo=growthMedia(s).filter(m=>!G.hasDetail(analysis(m)));
    if(!todo.length)return;
    s.reanalyzing=true;redoButton.disabled=true;
    const status=tools.querySelector('[data-growth-reanalyze-status]');
    let done=0,failed=0;
    for(const m of todo){
      if(s.dead)break;
      const note=s.slots.measure.querySelector('[data-growth-reanalyze-status]')||status;
      if(note?.isConnected)note.textContent=(done+failed+1)+'/'+todo.length+' 분석 중 · '+M.label(m);
      try{const r=await V.analyzeRecording(m,{save:true});m.analysis=r.summary;done++;}
      catch(e){failed++;}
    }
    s.reanalyzing=false;
    if(s.dead)return;
    V.toast(failed?'다시 분석 '+done+'개 완료 · '+failed+'개는 분석하지 못했어요':'다시 분석 '+done+'개를 마쳤어요',failed?'error':undefined);
    s.dirty=true;screen(s);
  };
  const growthButton=tools.querySelector('[data-growth-ai]');
  if(growthButton){
    growthButton.onclick=async()=>{
      if(s.growthPending)return;
      const key=growthEvidenceKey(s),id=labGrowthId(s);
      const pairReport=labReport(s);
      const status=tools.querySelector('[data-growth-ai-status]'),output=tools.querySelector('[data-growth-ai-result]')||tools.querySelector('.vl-growth-ai-text');
      if(!pairReport){status.textContent='비교할 신뢰도 높은 측정값이 부족해요.';return;}
      if(typeof window.vzipCloudCoach!=='function'){status.textContent='AI 연결을 사용할 수 없어요. 위의 측정 기반 변화 요약은 계속 볼 수 있어요.';return;}
      // Asked first (큰 정리 2번): nothing is sent before 보내기, and nothing after 취소.
      s.growthPending=true;growthButton.disabled=true;
      const ok=await V.confirm('AI 해석 받기','이 곡의 처음·최근 비교 결과 중 음정 정확도·음정 안정성·호흡 유지(판정 보류 포함)와 녹음·분석 개수, 기간(첫 녹음일·마지막 녹음일)만 서버(AI)로 보내 해석을 받아요.\n음역·최고음·고음·파사지오 값과 녹음 파일은 보내지 않아요. 측정값만으로 실력 향상을 단정하지 않아요.',{ok:'보내기'});
      if(!ok||s.dead||!host0(s)||growthEvidenceKey(s)!==key||labGrowthId(s)!==id){s.growthPending=false;if(growthButton.isConnected)growthButton.disabled=false;return;}
      status.textContent='AI가 녹음별 측정 변화를 정리하고 있어요…';
      try{
        // Server "overall" mode: a validated four-line report (요약/좋아진 점/보완할 점/다음 연습) built only from the
        // separated measures of ONE song (음정 정확도·음정 안정성·호흡 유지; withheld ones as "unknown"). Range,
        // highest notes, high-note zone and passaggio are never sent. No audio is sent.
        const measured=G.aiMetrics(G.aggregate([{songId:s.song.id,report:aiReport(pairReport)}]));
        if(!measured.some(x=>x.state!=='unknown'))throw Error('AI가 해석할 비교 가능한 음정·안정성·호흡 측정값이 부족해요.');
        const records=growthMedia(s).slice().sort((x,y)=>(M.dateOf(x)||'').localeCompare(M.dateOf(y)||''));
        const response=await window.vzipCloudCoach({
          mode:'overall',recordingCount:records.length,analysisCount:records.filter(m=>V.analysisReliable(analysis(m))).length,analyzedSongs:1,
          periodStart:M.dateOf(records[0])||'',periodEnd:M.dateOf(records.at(-1))||'',metrics:measured,observations:[]
        });
        if(s.dead||!host0(s)||growthEvidenceKey(s)!==key||labGrowthId(s)!==id)return;
        if(response?.mode!=='overall')throw Error('AI 결과 형식이 달라요. 다시 생성해 주세요.');
        const textResult=String(response.note||'').trim();
        if(!textResult)throw Error('AI 해석이 비어 있어요. 다시 생성해 주세요.');
        const report={id,period:'vocal-growth-ai',songId:s.song.id,mediaIds:records.map(m=>m.id),evidenceKey:key,text:textResult.slice(0,5000),updatedAt:Date.now()};
        const stored=V.change(db=>{db.practicePlans||=[];const existing=db.practicePlans.find(p=>p.id===id);if(existing)Object.assign(existing,report);else db.practicePlans.push(report);},{silent:true});
        if(!stored)throw Error('AI 리포트 저장에 실패했어요.');
        if(output?.isConnected){output.hidden=false;output.removeAttribute('data-growth-ai-older');output.textContent=report.text;}
        if(status.isConnected)status.textContent='AI 종합 리포트를 저장했어요. 다시 열어도 확인할 수 있어요.';
        growthButton.textContent='다시 생성';
      }catch(e){if(!s.dead&&status.isConnected)status.textContent='AI 해석 생성 실패: '+String(e?.message||e)+' · 위 측정 기반 요약은 그대로 볼 수 있어요.';}
      finally{s.growthPending=false;if(growthButton.isConnected)growthButton.disabled=false;}
    };
  }
}
const host0=s=>s.host.isConnected;
/** 녹음 타임라인: the song's recordings as date chips (which takes are open; 처음 · 최근 of the verdict marked, analysed ones
 * filled), the player of the active one, its rating, then 이 녹음 자세히 (구간 분석, 최고음, 악보·원곡과 비교), opened when
 * a date is tapped. */
function takesHtml(s,m){
  const v=s.v?.now,mark=id=>id===v?.firstId?'처음':id===v?.lastId?'최근':'';
  const chips='<div class="vl-select"><span>날짜를 누르면 그 녹음을 듣고 ‘이 녹음 자세히’가 펼쳐져요 · 채운 점은 분석한 녹음</span><div class="vl-dates" role="group" aria-label="녹음 타임라인" data-song-timeline>'+s.items.map(x=>'<button type="button" data-date="'+esc(x.id)+'" aria-pressed="'+s.selected.includes(x.id)+'"'+(analysis(x)?' data-analysed':'')+(mark(x.id)?' data-pair="'+mark(x.id)+'"':'')+'><i class="vl-dot-mark" aria-hidden="true"></i>'+esc(day(x)||'날짜 없음')+(s.items.filter(y=>day(y)===day(x)).length>1?' · '+(s.items.filter(y=>day(y)===day(x)).findIndex(y=>y.id===x.id)+1):'')+
      // 연습: a 연습실·트레이닝 연습 recording (counted only with 연습 녹음 포함). 영상: a video.
      (s.kinds?.get(x.id)||[]).map(k=>' <small class="vl-kind" data-lab-kind>'+k+'</small>').join('')+'</button>').join('')+'</div></div>';
  if(!m)return chips+'<div class="vl-empty">'+(s.items.length?'날짜를 선택해 주세요<br><small>선택한 녹음의 플레이어와 분석이 여기에 나타나요.</small>':'이 곡에 연결된 녹음이 없어요<br><a href="#/record?song='+encodeURIComponent(s.song.id)+'">녹음하러 가기</a>')+'</div>';
  const many=s.selected.length>1;
  return chips+'<div class="vl-carousel" data-carousel aria-label="선택한 녹음 플레이어, 좌우로 넘기기">'+playerCard(s,m)+'</div>'+
    (many?'<div class="vl-swipe-guide" aria-hidden="true"><i class="ph ph-arrow-left"></i><span>이전 녹음</span><span class="vl-swipe-track"><b style="width:'+(((s.selected.indexOf(s.active)+1)/s.selected.length)*100)+'%"></b></span><span>최근 녹음</span><i class="ph ph-arrow-right"></i></div>':'')+
    '<section class="vl-rating"><span>내 만족도 · '+esc(day(m))+'</span><div class="vl-stars" role="group" aria-label="만족도">'+[1,2,3,4,5].map(n=>'<button type="button" data-rating="'+n+'" aria-pressed="'+(n<=Number(m.rating||0))+'" aria-label="'+n+'점">★</button>').join('')+'</div><b>'+(m.rating?m.rating+'/5':'—')+'</b></section>'+
    fold('take','이 녹음 자세히','구간 분석 · 최고음 확인 · 악보·원곡과 비교',makeSegment(s,m)+(many?'':single(s,m)),foldOpen(s,'take'));
}
/** 깊이 보기 › 녹음별 변화 (this screen's own per-take numbers, labelled as such) and 같은 날 녹음 세기. */
function trendHtml(s,m){
  const mode=sameDay(),many=!!m&&s.selected.length>1;
  return (many?fold('trend','녹음별 변화','고른 녹음을 바로 앞 녹음과 견준 참고 그래프',trend(s),foldOpen(s,'trend')):'')+
    (G?.SAME_DAY?'<div class="vl-deep-block"><label class="vl-sameday"><span>같은 날 녹음 세기</span><select data-same-day aria-label="같은 날 여러 번 부른 녹음을 세는 방법">'+G.SAME_DAY.map(([id,label])=>'<option value="'+id+'"'+(id===mode?' selected':'')+'>'+label+'</option>').join('')+'</select></label>'+
      '<p class="vl-muted" data-same-day-scope>하루에 여러 번 부른 날을 ‘녹음별 변화’의 그래프와 날짜별 처음·최근에서 어떻게 셀지 정해요. ‘처음 vs 최근’ 판정은 바뀌지 않아요.</p></div>':'');
}
/** 깊이 보기 › 측정 방식별 비교 · 리포트 저장 · MR로 다시 분석, each on its own existing screen or sheet. */
const deepLink=(key,href,title,sub,attr='')=>'<a class="vl-report" data-song-deep="'+key+'"'+attr+' href="'+href+'"><strong>'+title+'</strong><span>'+sub+'</span><i class="ph ph-caret-right" aria-hidden="true"></i></a>';
function toolsHtml(s,m){
  const mr=V.mrReanalyze?.count(s.song,s.items);
  // 측정 방식별 비교 (app/analysis.js analysisCompare): this take measured on the device beside the saved result.
  return (m&&analysis(m)?deepLink('method','#/analysis/'+encodeURIComponent(m.id),'측정 방식별 비교','이 녹음 · 녹음 그대로 · MR 빼고 · AI 분리 결과를 나란히 봐요'):'')+
    (m?'<div class="vl-save"><span>지금 고른 녹음과 분석을 보관함에 남겨요</span><button type="button" data-save-report>리포트 저장</button></div>':'')+
    (remrRow(s)||(V.mrReanalyze&&!mr?deepLink('mr-add','#/song/'+encodeURIComponent(s.song.id)+'?tab=ar','MR로 다시 분석','곡에 MR 파일을 올리면 반주를 빼고 다시 잴 수 있어요'):''));
}
/** 깊이 보기 › every other deeper tool of this song. */
function deepHtml(s,m){
  const reports=(V.db.comparisonReports||[]).filter(r=>r.kind!=='listen-verdict'&&!(V.db.deleted?.comparisonReports||[]).includes(r.id)).length;
  return (V.voicePathLink?V.voicePathLink(s.song,m):'')+
    // data-precision-lab-entry: app/precision-report-ui.js adds its own link to this screen unless one is here already.
    (window.VzipPrecisionReport?deepLink('precision','#/precision-report','발성 정밀 리포트','표준 과제로 잰 결과를 과제별로 비교해요',' data-precision-lab-entry'):'')+
    deepLink('reports','#/lab-reports','리포트 보관함',reports?'저장한 리포트 '+reports+'개':'저장한 리포트가 아직 없어요')+
    deepLink('basis','#/growth-basis','분석 기준','어떤 녹음을 세고, 무엇을 왜 비교에서 뺐는지 봐요')+
    deepLink('library','#/library','녹음을 직접 골라 분석','전체 녹음에서 선택한 뒤 분석을 눌러요')+
    deepLink('song','#/song/'+encodeURIComponent(s.song.id),'곡 상세','악보 · MR · 레슨 지적 · 녹음 목록');
}
/** 두 녹음 비교: the two selects, 첫 녹음 ↔ 최근 녹음, the A/B switch on the player above, the table and the memo. */
function bindCompare(s){
  const box=s.slots.compare,selA=box.querySelector('[data-compare-a]'),selB=box.querySelector('[data-compare-b]');
  if(!selA||!selB)return;
  // A take picked here joins the chips (in date order), so the player can switch to it.
  const include=id=>{if(id&&!s.selected.includes(id))s.selected=s.items.filter(x=>s.selected.includes(x.id)||x.id===id).map(x=>x.id);if(!s.active)s.active=id;};
  const cmp=box.querySelector('[data-compare-panel]');
  cmp.ontoggle=()=>{s.compareOpen=cmp.open};
  const switchTo=id=>{if(id===s.active)return;const el=s.player?.el,position=el?.currentTime||0,wasPlaying=!!el&&!el.paused;include(id);s.compareOpen=true;s.active=id;screen(s);s.player?.load().then(()=>{s.player.seek(position);if(wasPlaying)s.player.play()}).catch(()=>{});};
  selA.onchange=e=>{s.compareA=e.target.value;s.compareB=selB.value;include(s.compareA);screen(s)};
  selB.onchange=e=>{s.compareB=e.target.value;s.compareA=selA.value;include(s.compareB);screen(s)};
  box.querySelector('[data-compare-first]').onclick=()=>{s.compareA=s.items[0].id;s.compareB=s.items.at(-1).id;include(s.compareA);include(s.compareB);screen(s)};
  cmp.querySelector('[data-compare-switch]').onclick=()=>{const a=selA.value,b=selB.value;include(a);include(b);switchTo(s.active===a?b:a)};
  const form=cmp.querySelector('[data-compare-form]'),output=cmp.querySelector('[data-compare-output]');
  // 05-A: 달라진 점·다음 목표 are kept on this device per pair of recordings until saved.
  const draft=V.fieldDraft?.wire(form,'compare:'+selA.value+':'+selB.value,[{name:'notes',saved:form.elements.notes.defaultValue},{name:'goal',saved:form.elements.goal.defaultValue}]);
  form.onsubmit=e=>{e.preventDefault();const a=s.items.find(x=>x.id===selA.value),b=s.items.find(x=>x.id===selB.value);if(!a||!b||a.id===b.id){output.textContent='서로 다른 녹음 두 개를 선택해 주세요.';return}const entry={firstId:a.id,secondId:b.id,firstName:M.label(a),secondName:M.label(b),firstDate:a.created,secondDate:b.created,song:s.song.title,songId:s.song.id,measures:{first:V.measureSnapshot?.(a)||null,second:V.measureSnapshot?.(b)||null},notes:form.elements.notes.value,goal:form.elements.goal.value,firstRating:a.rating??null,secondRating:b.rating??null,firstReview:a.review||'',secondReview:b.review||''};if(V.change(d=>{d.comparisonReports||=[];const old=d.comparisonReports.find(x=>x.kind!=='vocal-lab'&&x.firstId===a.id&&x.secondId===b.id);if(old)Object.assign(old,entry);else d.comparisonReports.push({id:V.uid(),created:Date.now(),...entry})},{silent:true})){draft?.clear();V.toast('비교 메모를 저장했어요.');}};
  cmp.querySelector('[data-compare-ai]').onclick=async e=>{const notes=form.elements.notes.value.trim(),btn=e.currentTarget;if(notes.length<10){output.textContent='정리할 메모를 10자 이상 작성해 주세요.';return}const token=await window.vzipCloudAccessToken?.();if(!token){output.textContent='로그인 후 사용할 수 있어요.';return}btn.disabled=true;output.textContent='메모를 정리하는 중…';try{const res=await fetch('https://chxnbtiyuyhiywzeshis.supabase.co/functions/v1/vocal-ai',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,apikey:V.anonKey},body:JSON.stringify({mode:'comparison',notes})});const json=await res.json();if(!res.ok)throw Error(json.error||'AI 정리 실패');output.textContent=json.analysis+'\n\n※ 작성한 메모를 정리한 결과예요.'}catch(err){output.textContent='AI 정리 실패: '+err.message}finally{btn.disabled=false}};
}
function screen(s) {
  const host=s.host, m=s.items.find(x=>x.id===s.active);
  const scrollTop=document.scrollingElement?.scrollTop??0;
  s.player?.destroy(); s.player=null;
  s.plotObserver?.disconnect(); s.plotObserver=null;
  if(!s.slots){
    host.innerHTML=frame(s);
    s.slots=Object.fromEntries([...host.querySelectorAll('[data-slot]')].map(el=>[el.dataset.slot,el]));
    s.dirty=true;bindFrame(s);paintPhrases(s);paintPoints(s);
  }
  if(s.dirty){s.dirty=false;paintVerdict(s);}
  const recs=m?recommendations(s):null;
  // T: the recordings part. Its player, chips and folds are looked up in it only — 이 곡의 변화 above can hold a player
  // of its own (처음·최근 듣기) with the same control names.
  const T=s.slots.takes;
  T.innerHTML=takesHtml(s,m);
  s.slots.tips.innerHTML=m?recommendationList(recs,s.song.id,savedAITip(s)):'';
  s.slots.compare.innerHTML=comparePanel(s);
  s.slots.trend.innerHTML=trendHtml(s,m);
  s.slots.tools.innerHTML=toolsHtml(s,m);
  s.slots.deep.innerHTML=deepHtml(s,m);
  sizePlots(host);
  // The trend chart scrolls sideways: show the active (or newest) point, not the oldest.
  const centrePlot=()=>{
    const plotScroll=host.querySelector('.vl-plot-scroll');
    if(!plotScroll)return;
    const dot=plotScroll.querySelector('.vl-plot-dates [data-point="'+CSS.escape(String(s.active))+'"]')||plotScroll.querySelector('.vl-plot-dates [data-point]:last-child');
    if(dot){const box=dot.getBoundingClientRect();plotScroll.scrollLeft=Math.max(0,box.left+box.width/2-plotScroll.getBoundingClientRect().left+plotScroll.scrollLeft-plotScroll.clientWidth/2);}
  };
  centrePlot();
  if(window.ResizeObserver){s.plotObserver=new ResizeObserver(()=>sizePlots(host));host.querySelectorAll('.vl-plot').forEach(svg=>s.plotObserver.observe(svg));}
  if(document.scrollingElement)document.scrollingElement.scrollTop=scrollTop;
  // The folds stay as the person left them through a redraw; a chart is measured once its fold is open.
  [T,s.slots.trend].forEach(box=>box.querySelectorAll('[data-song-fold]').forEach(d=>watchFold(s,d,d.dataset.songFold,()=>{if(d.open&&d.isConnected){sizePlots(host);centrePlot();}})));
  // A date of the timeline: tapped, that take plays and 이 녹음 자세히 opens for this visit (it joins the chosen takes the
  // player steps through and 녹음별 변화 draws). Tapped again while it is the one playing, it leaves the chosen takes.
  T.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.date;
    if(id===s.active){s.selected=s.selected.filter(x=>x!==id);s.active=s.selected.at(-1)||null;screen(s);return;}
    if(!s.selected.includes(id))s.selected=s.items.filter(x=>s.selected.includes(x.id)||x.id===id).map(x=>x.id);
    s.active=id;s.open.take=true;
    screen(s);
    if(!s.dead){stopHero(s);s.player?.play?.();}
  });
  host.querySelector('[data-lab-remr]')?.addEventListener('click',()=>openRemr(s));
  const dayChoice=host.querySelector('[data-same-day]');
  if(dayChoice)dayChoice.onchange=()=>{setSameDay(dayChoice.value);screen(s);if(!s.dead)s.host.querySelector('[data-same-day]')?.focus({preventScroll:true});};
  bindCompare(s);
  if(!m)return;
  const dateStrip=T.querySelector('.vl-dates'), activeDate=T.querySelector('[data-date="'+CSS.escape(m.id)+'"]');
  if(activeDate){const strip=dateStrip.getBoundingClientRect(), chip=activeDate.getBoundingClientRect();if(chip.left<strip.left)dateStrip.scrollLeft+=chip.left-strip.left;else if(chip.right>strip.right)dateStrip.scrollLeft+=chip.right-strip.right;}
  const carrier=T.querySelector('[data-carousel]'), player=M.player(T.querySelector('[data-player]'),m,{prefetch:true}); s.player=player;
  const el=player.el, play=T.querySelector('[data-play]'), seek=T.querySelector('[data-seek]'), status=T.querySelector('[data-player-status]');
  const paint=()=>{const d=el.duration||Number(m.durationSeconds)||0;const timeEl=T.querySelector('[data-time]'),durationEl=T.querySelector('[data-duration]');if(!timeEl||!durationEl)return;/* the lab was redrawn (selection changed) while this player's audio was still reporting */seek.value=d?Math.round(el.currentTime/d*1000):0;timeEl.textContent=time(el.currentTime);durationEl.textContent=time(d);const running=!el.paused;play.setAttribute('aria-label',running?'일시정지':'재생');play.innerHTML='<i class="ph-fill ph-'+(running?'pause':'play')+'"></i>';status.textContent=T.querySelector('[data-player] [data-msg]')?.textContent||'';};
  el.addEventListener('timeupdate',()=>{if(s.loop&&el.currentTime>=Math.min(el.duration||Infinity,(s.start[m.id]||0)+16))el.currentTime=s.start[m.id]||0;paint();}); el.addEventListener('play',()=>{if(s.heroPlayer)stopHero(s);paint();});el.addEventListener('pause',paint);el.addEventListener('loadedmetadata',paint); el.addEventListener('error',paint);paint();
  V.vocalRangeBind?.(T,s.song,()=>{if(!s.dead)screen(s);});
  V.scoreNoteBind?.(T,{song:s.song,item:m,player,full:()=>s.results.get(m.id),keep:full=>{if(!s.dead)s.results.set(m.id,full);}});
  V.arNoteBind?.(T,{song:s.song,item:m,player,full:()=>s.results.get(m.id),keep:full=>{if(!s.dead)s.results.set(m.id,full);}});
  T.querySelectorAll('[data-seek-at]').forEach(b=>b.onclick=()=>{
    if(V.analysisPlayAt)V.analysisPlayAt(player,b.dataset.seekAt);
    else{player.seek(Math.max(0,Number(b.dataset.seekAt)-1));if(el.paused)player.play();}
  });
  play.onclick=()=>el.paused?player.play():player.pause();seek.oninput=()=>player.seek(Number(seek.value)/1000*(el.duration||m.durationSeconds||0));
  const move=step=>{const n=s.selected.indexOf(s.active)+step;if(n<0||n>=s.selected.length)return;s.carouselDirection=step;s.active=s.selected[n];screen(s);};
  T.querySelector('[data-previous]').onclick=()=>move(-1);T.querySelector('[data-next]').onclick=()=>move(1);
  T.querySelector('[data-prev]')?.addEventListener('click',()=>move(-1));T.querySelector('[data-next-peek]')?.addEventListener('click',()=>move(1));
  // Date tabs run oldest → newest. Swipe finger left to advance to a newer recording.
  // Keep page's vertical scrolling and playback sliders completely native.
  const card=carrier.querySelector('[data-card]'), reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
  const activeIndex=s.selected.indexOf(s.active);
  const hasNeighbor=step=>activeIndex+step>=0&&activeIndex+step<s.selected.length;
  const snap=()=>{
    card.style.transition=reduced?'none':'transform .28s cubic-bezier(.2,.85,.2,1), opacity .28s ease';
    card.style.transform='translate3d(0,0,0) scale(1)';
    card.style.opacity='1';
    carrier.classList.remove('vl-swiping');
  };
  let gesture=null,changing=false,swipedAt=0;
  carrier.addEventListener('pointerdown',e=>{
    if(!e.isPrimary||e.button!==0||changing||s.selected.length<2)return;
    if(e.target.closest('button,input,select,textarea,a,[data-player]'))return;
    gesture={id:e.pointerId,x:e.clientX,y:e.clientY,dx:0,started:performance.now(),horizontal:false};
  });
  carrier.addEventListener('pointermove',e=>{
    const g=gesture;if(!g||e.pointerId!==g.id||changing)return;
    const dx=e.clientX-g.x,dy=e.clientY-g.y;
    if(!g.horizontal){
      if(Math.abs(dy)>10&&Math.abs(dy)>Math.abs(dx)){gesture=null;return;}
      if(Math.abs(dx)<9||Math.abs(dx)<Math.abs(dy)*1.2)return;
      g.horizontal=true;carrier.classList.add('vl-swiping');
      try{carrier.setPointerCapture(e.pointerId)}catch{}
    }
    const step=dx<0?1:-1;
    g.dx=hasNeighbor(step)?dx:Math.sign(dx)*Math.min(26,Math.abs(dx)*.2);
    card.style.transition='none';
    card.style.transform='translate3d('+g.dx+'px,0,0) scale('+(1-Math.min(.023,Math.abs(g.dx)/700))+')';
    card.style.opacity=String(1-Math.min(.17,Math.abs(g.dx)/950));
  });
  const finish=e=>{
    const g=gesture;if(!g||e.pointerId!==g.id)return;gesture=null;
    if(!g.horizontal)return;
    swipedAt=performance.now();
    try{carrier.releasePointerCapture(e.pointerId)}catch{}
    const step=g.dx<0?1:-1;
    const elapsed=Math.max(40,performance.now()-g.started);
    const shouldMove=hasNeighbor(step)&&(Math.abs(g.dx)>Math.min(82,carrier.clientWidth*.22)||(Math.abs(g.dx)>28&&Math.abs(g.dx)/elapsed>.55));
    if(!shouldMove){snap();return;}
    changing=true;carrier.classList.remove('vl-swiping');
    if(!reduced&&card.animate){
      const animation=card.animate([{transform:'translate3d('+g.dx+'px,0,0)',opacity:1},{transform:'translate3d('+(step===1?-110:110)+'px,0,0) scale(.96)',opacity:0}],{duration:155,easing:'ease-in',fill:'forwards'});
      animation.finished.catch(()=>{}).then(()=>{if(!carrier.isConnected)return;s.carouselDirection=step;move(step);});
    }else {s.carouselDirection=step;move(step);}
  };
  carrier.addEventListener('pointerup',finish);
  // The peek arrows look 18px wide: a tap within 44px of either edge (not on a control) also moves to that take.
  carrier.addEventListener('click',e=>{
    if(changing||performance.now()-swipedAt<400||e.target.closest('button,input,select,textarea,a,[data-player]'))return;
    const box=carrier.getBoundingClientRect(),step=e.clientX-box.left<=44?-1:box.right-e.clientX<=44?1:0;
    if(step&&hasNeighbor(step))move(step);
  });
  carrier.addEventListener('pointercancel',e=>{if(gesture?.id!==e.pointerId)return;gesture=null;snap();});
  const enter=s.carouselDirection||0;s.carouselDirection=0;
  if(enter&&!reduced&&card.animate){
    card.animate([{transform:'translate3d('+(enter===1?46:-46)+'px,0,0) scale(.975)',opacity:.6},{transform:'translate3d(0,0,0) scale(1)',opacity:1}],{duration:300,easing:'cubic-bezier(.18,1,.2,1)'});
  }
  carrier.tabIndex=0;carrier.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();move(e.key==='ArrowLeft'?-1:1);}};
  const savedRate=Number(rates()[m.id])||1;player.setRate(savedRate);T.querySelector('[data-speed]').textContent=savedRate.toFixed(1)+'×';
  T.querySelector('[data-speed]').onclick=()=>V.collectionChoice('이 녹음의 배속',[[.5,'0.5×'],[.75,'0.75×'],[1,'1.0×'],[1.25,'1.25×'],[1.5,'1.5×']].map(([v,l])=>[String(v),l]),String(player.el.playbackRate),value=>{const rate=Number(value);player.setRate(rate);T.querySelector('[data-speed]').textContent=rate.toFixed(rate%1?2:1).replace(/0×$/,'×');try{speedStore.setItem(speedKey,JSON.stringify({...rates(),[m.id]:rate}));}catch{V.toast('배속을 저장하지 못했어요.','error');}});
  T.querySelector('[data-loop]').onclick=e=>{s.loop=!s.loop;e.currentTarget.setAttribute('aria-pressed',String(s.loop));if(s.loop)player.seek(s.start[m.id]||0);};
  T.querySelector('[data-start]').onchange=e=>{s.start[m.id]=Number(e.target.value);const pos=el.currentTime;screen(s);s.player.seek(pos);};
  T.querySelector('[data-analyze]')?.addEventListener('click',async e=>{
    const btn=e.currentTarget;btn.disabled=true;status.textContent='녹음을 분석하고 있어요…';
    try{const full=await V.analyzeRecording(m,{onStage:t=>{if(!s.dead)status.textContent=t;}});if(s.dead||s.active!==m.id)return;s.results.set(m.id,full);m.analysis=full.summary;s.dirty=true;screen(s);}
    catch(err){if(!s.dead){btn.disabled=false;status.textContent='분석하지 못했어요: '+err.message;}}
  });
  s.slots.trend.querySelectorAll('[data-metric]').forEach(b=>b.onclick=()=>{s.metric=b.dataset.metric;screen(s);});
  s.slots.trend.querySelectorAll('[data-point]').forEach(b=>{
    const open=()=>{if(b.dataset.day){dayList(s,b.dataset.day);return;}const chosen=s.items.find(x=>x.id===b.dataset.point);if(chosen)observe(s,chosen);};
    b.addEventListener('click',open);
    b.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
  });
  T.querySelectorAll('[data-rating]').forEach(b=>b.onclick=async()=>{const score=Number(b.dataset.rating);try{await M.update(m,{rating:score});m.rating=score;T.querySelectorAll('[data-rating]').forEach(star=>star.setAttribute('aria-pressed',String(Number(star.dataset.rating)<=score)));T.querySelector('.vl-rating b').textContent=score+'/5';}catch(err){V.toast('만족도를 저장하지 못했어요: '+err.message,'error');}});
  host.querySelector('[data-repeat-practice]').onclick=()=>{s.loop=true;T.querySelector('[data-loop]').setAttribute('aria-pressed','true');player.seek(s.start[m.id]||0);player.play();};
  bindNext(s);
  host.querySelectorAll('[data-practice-tip]').forEach(button=>button.onclick=()=>{
    const tip=[savedAITip(s)].filter(Boolean).find(x=>x.key===button.dataset.practiceTip);
    if(!tip)return;
    V.practiceSheet({songId:s.song.id,mediaIds:[m.id],preset:{minutes:tip.minutes,memo:'[추천 연습] '+tip.name+' — '+tip.steps.join(' / ')}});
  });
  if(savedAITip(s))host.querySelector('[data-ai-status]').textContent='저장된 AI 추천 결과예요. 연습 기록에 담기 전에도 보관돼요.';
  const aiButton=host.querySelector('[data-ai-exercise]');
  aiButton.disabled=!!s.aiPending;
  aiButton.onclick=async()=>{
    if(s.aiPending)return;const context=aiContext(s),status=host.querySelector('[data-ai-status]');
    // Asked first: nothing is sent before 보내기 (as 다음 연습's "AI에게 하나 더 받기").
    s.aiPending=true;aiButton.disabled=true;
    const ok=await V.confirm('다른 연습 하나 AI 추천받기','이 곡 제목, 지금 고른 녹음의 날짜·측정값·메모와 구간 위치, 마지막 연습 기록의 메모·컨디션, 위 다음 연습 목록을 NVIDIA에 보내 겹치지 않는 연습 한 가지를 만들어요.\n녹음 파일은 보내지 않아요. 녹음을 청취하지 않으며 수치만으로 소리나 실력 향상을 단정하지 않아요.',{ok:'보내기'});
    if(!ok||s.dead||!host.isConnected||aiContext(s)!==context){s.aiPending=false;if(!s.dead&&host.isConnected){const button=host.querySelector('[data-ai-exercise]');if(button)button.disabled=false;}return;}
    status.textContent='겹치지 않는 연습 한 가지를 찾고 있어요…';
    try{
      const last=(V.db.practices||[]).filter(p=>!p.songId||p.songId===s.song.id).sort((a,b)=>String(a.date).localeCompare(String(b.date))||(a.created||0)-(b.created||0)).at(-1);
      const shown=recs.items.map(x=>({title:x.title,source:x.source}));
      const excluded=[...new Set(recs.items.map(x=>x.action?.kind==='practice-tip'?x.action.tipKey:'').filter(Boolean))];
      const result=await window.vzipCloudCoach({mode:'inline-exercise',excluded,task:'보컬 연구소의 기존 추천과 겹치지 않는 추가 연습 한 가지',summary:'기존 추천: '+shown.map(t=>t.title).join(', '),song:s.song.title,comfort:last?.practiceRoom?.draft?.comfort||'',symptoms:last?.practiceRoom?.draft?.symptoms||[],mood:last?.practiceRoom?.mood||'',memo:last?.practiceRoom?.draft?.memo||last?.memo||'',answers:[JSON.stringify({displayed:shown,recording:{date:M.dateOf(m),review:m.review||'',metrics:analysis(m)?.metrics||null},segmentStart:s.start[m.id]||0})]});
      if(s.dead||!host.isConnected||aiContext(s)!==context)return;
      const x=result.exercise;if(!x||!Array.isArray(x.steps)||!x.name)throw Error('추천 형식을 확인하지 못했어요. 다시 요청해 주세요.');
      const id=V.uid(),tip={key:'ai-'+id,aiRef:id,name:x.name,reason:x.reason,steps:x.steps,goal:x.goal,minutes:x.minutes,metric:'AI 추가 추천',value:time(s.start[m.id]||0)+' 구간',family:x.family,nonVocal:x.family==='interpretation'};
      if(!V.change(d=>{d.practicePlans||=[];d.practicePlans.push({id,period:'ai-exercise',date:V.today(),songId:s.song.id,mediaId:m.id,segmentStart:s.start[m.id]||0,tip,created:Date.now()});},{silent:true}))throw Error('추천을 저장하지 못했어요.');
      s.aiTips||=new Map();s.aiTips.set(context,tip);
      const slot=host.querySelector('[data-ai-tip]');slot.innerHTML=tipCard(tip,s.song.id);
      slot.querySelector('[data-practice-tip]').onclick=()=>V.practiceSheet({songId:s.song.id,mediaIds:[m.id],preset:{minutes:tip.minutes,memo:'[추천 연습] '+tip.name+' — '+tip.steps.join(' / ')}});
      status.textContent='AI 추천 결과를 저장했어요. 연습 기록에 담기 전에도 다시 볼 수 있어요.';
    }catch(e){if(!s.dead&&host.isConnected)status.textContent=e.message||'추천을 가져오지 못했어요.';}
    finally{s.aiPending=false;if(!s.dead&&host.isConnected){const button=host.querySelector('[data-ai-exercise]');if(button)button.disabled=false;}}
  };
  host.querySelector('[data-save-report]').onclick=()=>{
    const selected=s.selected.map(id=>s.items.find(x=>x.id===id)).filter(Boolean);
    const record={kind:'vocal-lab',songId:s.song.id,song:s.song.title,mediaIds:selected.map(x=>x.id),activeId:m.id,metric:s.metric,snapshots:selected.map(x=>({id:x.id,date:M.dateOf(x),name:M.label(x),rating:x.rating??null,analysis:analysis(x)}))};
    if(V.change(d=>{d.comparisonReports||=[];d.comparisonReports.push({id:V.uid(),created:Date.now(),...record});},{silent:true}))V.toast('리포트를 전체 녹음에 저장했어요.');
  };
}
V.route('vocal-lab',{title:'곡 분석',back:true,tab:'growth',noAutoRefresh:true,
  actions:()=>'<button type="button" class="icon-btn" data-lab-more aria-label="더보기"><i class="ph ph-dots-three-outline"></i></button>',
  render:()=>'<div class="vl" data-lab><p class="vl-muted">녹음을 불러오는 중…</p></div>',
  async mount(main,r){
    clean();const id=++instance, song=V.song(r.params[0]),host=main.querySelector('[data-lab]');
    // 큰 정리 2번: a song's 곡 분석 is the song screen now. Its address leads there (one history entry, replaced), with
    // everything it was asked for (?a= ?b= ?compare= ?report= ?selection= ?jump=).
    if(song){const q=r.query?.toString()||'';location.replace('#/growth-song/'+encodeURIComponent(song.id)+(q?'?'+q:''));return;}
    if(!song && r.query.get('selection')==='1'){
      const ids=selectionIds(), all=await M.list().catch(()=>M.cached());
      if(id!==instance||!host.isConnected)return;
      const byId=new Map(all.map(m=>[String(m.id),m]));
      const selected=ids.map(key=>byId.get(key)).filter(Boolean);
      const groups=new Map();
      selected.forEach(m=>{const key=m.songId||'';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(m);});
      host.innerHTML='<div class="vl-song"><i class="ph ph-waveform"></i><strong>선택한 녹음 '+selected.length+'개</strong></div>'+
        (selected.length?[...groups].map(([songId,files])=>{
          const known=songId&&V.song(songId), label=known?.title||'곡 미지정';
          return '<div class="vl-section"><h2>'+esc(label)+' · '+files.length+'개</h2>'+
            (known?'<a class="vl-report" href="#/growth-song/'+encodeURIComponent(songId)+'?selection=1"><strong>선택한 녹음 모두 분석</strong><i class="ph ph-caret-right"></i></a>':'<p class="vl-muted">곡을 지정하면 여러 녹음의 변화를 함께 볼 수 있어요.</p>')+
            files.map(m=>'<a class="vl-report" href="'+(known?'#/growth-song/'+encodeURIComponent(songId)+'?selection=1':'#/analysis/'+encodeURIComponent(m.id))+'"><span>'+esc(M.label(m))+'</span><span>'+esc(day(m))+'</span></a>').join('')+'</div>';
        }).join(''):'<p class="vl-muted">선택한 녹음을 찾지 못했어요. 전체 녹음에서 다시 선택해 주세요.</p>');
      return;
    }
    if(!song){
      // 성장 통합 (#385): choosing a song is the 보컬 분석 tab now. replace(), so 뒤로 does not come back here.
      if(V.growthHub){location.replace('#/vocal-analysis');return;}
      const songs=V.songsNewest();
      host.innerHTML=songs.length?'<div class="vl-song"><i class="ph ph-waveform"></i><strong>곡 분석</strong></div><p class="vl-muted">분석할 곡을 선택해 주세요.</p>'+songs.map(x=>'<a class="vl-report" href="#/growth-song/'+encodeURIComponent(x.id)+'"><strong>'+esc(x.title)+'</strong><i class="ph ph-caret-right"></i></a>').join(''):V.empty('music-notes','먼저 곡을 추가해 주세요.');
      return;
    }
  },leave:clean
});
const labMenu=song=>V.menu({title:'곡 분석',body:'<div class="vz-choice-list"><a class="vz-choice" href="#/lab-reports">리포트 보관함 <i class="ph ph-caret-right"></i></a><a class="vz-choice" href="#/song/'+encodeURIComponent(song.id)+'">곡 상세 <i class="ph ph-caret-right"></i></a>'+
  (V.mrReanalyze?.count(song,[])?'<button type="button" class="vz-choice" data-lab-remr-menu>MR로 다시 분석 <i class="ph ph-caret-right"></i></button>':'')+'</div>',
  onMount:(el,close)=>el.querySelector('[data-lab-remr-menu]')?.addEventListener('click',()=>{close();if(current&&!current.dead&&current.song.id===song.id)openRemr(current);})});
V.route('growth-song',{title:'곡',back:true,tab:'growth',noAutoRefresh:true,
  actions:r=>V.song(r?.params?.[0])?'<button type="button" class="icon-btn" data-lab-more aria-label="더보기"><i class="ph ph-dots-three-outline"></i></button>':'',
  render:()=>'<div class="vl" data-lab><p class="vl-muted" role="status">녹음을 불러오는 중…</p></div>',
  async mount(main,r){
    clean();const id=++instance, song=V.song(r.params[0]),host=main.querySelector('[data-lab]');
    if(!song){location.replace('#/vocal-analysis');return;}
    const more=document.querySelector('[data-lab-more]');if(more)more.onclick=()=>labMenu(song);
    // Which of the song's recordings are listed is the dataset's rule 'songList' (app/growth-dataset.js): videos too,
    // 연습실·트레이닝 연습 recordings too (labelled 연습). Whether those count for 이 곡의 변화 is the 연습 녹음 포함 switch.
    const all=await M.list().catch(()=>M.cached());
    const lab=V.growthDataset(all);
    const kinds=new Map(),items=lab.pick('songList').filter(row=>row.songId===song.id).map(row=>{kinds.set(row.m.id,[row.practiceTake?'연습':'',row.video?'영상':''].filter(Boolean));return row.m;}).sort((a,b)=>(M.dateOf(a)||'').localeCompare(M.dateOf(b)||'')||(Number(a.created)||0)-(Number(b.created)||0)||String(a.id).localeCompare(String(b.id)));
    if(id!==instance||!host.isConnected)return;
    const report=(V.db.comparisonReports||[]).find(x=>x.kind==='vocal-lab'&&x.id===r.query.get('report')&&x.songId===song.id);
    const pair=[r.query.get('a'),r.query.get('b')].filter(key=>items.some(m=>String(m.id)===key));
    // ?a=<take> alone (no b, no compare): that take is opened on the timeline, among the usual ones.
    const one=pair.length===1&&!r.query.get('b')&&r.query.get('compare')!=='1'&&r.query.get('selection')!=='1'&&!report?items.find(m=>String(m.id)===pair[0])?.id:null;
    const selected=r.query.get('selection')==='1' ? selectionIds().filter(key=>items.some(m=>String(m.id)===key)) : pair.length&&!one ? items.filter(m=>pair.includes(String(m.id))).map(m=>m.id) : report?.mediaIds?.filter(key=>items.some(m=>m.id===key))||[];
    // Opened without a selection (곡 상세의 "분석과 비교 보기", a stale link): the newest analysed takes, up to 5 —
    // or just the newest take when none is analysed yet — so the player and report are there right away.
    if(!selected.length){const analysed=items.filter(m=>analysis(m)).slice(-5);selected.push(...(analysed.length?analysed:items.slice(-1)).map(m=>m.id));}
    if(one&&!selected.includes(one))selected.push(one);
    // Navigation always follows the date tabs: oldest on the left, newest on the right.
    selected.sort((a,b)=>items.findIndex(x=>x.id===a)-items.findIndex(x=>x.id===b));
    const aiTips=new Map();
    const savedPlans=(V.db.practicePlans||[]).filter(p=>p.period==='ai-exercise'&&p.songId===song.id&&p.tip&&items.some(m=>m.id===p.mediaId)&&!(V.db.deleted?.practicePlans||[]).includes(p.id)).slice().sort((a,b)=>(a.created||0)-(b.created||0));
    for(const plan of savedPlans)aiTips.set(String(plan.mediaId)+':'+(plan.segmentStart||0),plan.tip);
    // 연습 녹음 포함 is the one device setting of 성장 (VZ.growthSong, app/growth-hub.js): flipped in 이번 달, it is flipped here.
    const chosen=r.query.get('selection')==='1'||!!report;
    current={all,practice:!!V.growthSong?.practice(),period:periodFromQuery(r.query),heroPlayer:null,open:chosen?{trend:true}:one?{take:true}:{},slots:null,dirty:true,host,song,items,kinds,aiTips,selected,active:one||(selected.includes(report?.activeId)?report.activeId:selected.at(-1)||null),metric:report?.metric||'wob',results:new Map(),start:{},loop:false,dead:false,player:null,compareOpen:r.query.get('compare')==='1',compareA:r.query.get('a'),compareB:r.query.get('b')};
    screen(current);
    // 비교 메모·보관함 links (?compare=1) open at 두 녹음 비교.
    if(current.compareOpen)host.querySelector('[data-song-section="compare"]')?.scrollIntoView({block:'start'});
    // ?a=<take>: at the timeline, that take open.
    if(one)setTimeout(()=>{if(live()===current)host.querySelector('[data-song-section="takes"]')?.scrollIntoView({block:'start'});},400);
    // ?jump=<section> (성장 › 곡 하나 › 구간별로 보기): open at that part of the screen.
    // The parts above it are painted by then (their slots fill in after the frame), so the place does not move after.
    const jump=r.query.get('jump');if(jump)setTimeout(()=>{if(live()===current)host.querySelector('[data-song-section="'+jump+'"]')?.scrollIntoView({block:'start'});},400);
  },leave:clean
});
/** The screen that is open now (not left, not replaced). */
const live=()=>current&&!current.dead&&current.slots&&current.host.isConnected?current:null;
// An analysis saved while the screen is open — here, or by a sheet over it (이 녹음도 MR 빼고 재기): the take gets the new
// result and 이 곡의 변화 is worked out again. The player and anything being typed stay as they are.
window.addEventListener('vzip:analysis-saved',e=>{
  const s=live(),m=s&&s.all.find(x=>x.id===e.detail?.id);
  if(!m)return;
  if(e.detail.analysis)m.analysis=e.detail.analysis;
  s.dirty=true;
  setTimeout(()=>{if(live()===s&&s.dirty&&!s.reanalyzing){s.dirty=false;paintVerdict(s);}},0);
});
// A 레슨 지적 added, retired or checked meanwhile.
for(const name of ['vzip:score-points','vzip:data-changed'])window.addEventListener(name,()=>{const s=live();if(s)paintPoints(s);});
// Older comparison memos carry no songId: they open through 비교, which finds the song from the two recordings.
V.route('lab-reports',{title:'리포트 보관함',back:true,tab:'growth',render(){
  // 들어 보고 남긴 평가 are not reports of this list (they are shown in 결과 리포트 › 무엇이 달라졌나).
  const reports=(V.db.comparisonReports||[]).filter(x=>x.kind!=='listen-verdict').sort((a,b)=>(b.created||0)-(a.created||0));
  return '<div class="vl vl-reports">'+(reports.length?reports.map(x=>'<a class="vl-report" href="'+(x.kind!=='vocal-lab'&&!x.songId?'#/compare?a='+encodeURIComponent(x.firstId)+'&b='+encodeURIComponent(x.secondId):'#/growth-song/'+encodeURIComponent(x.songId||'')+'?'+(x.kind==='vocal-lab'?'report='+encodeURIComponent(x.id):'a='+encodeURIComponent(x.firstId)+'&b='+encodeURIComponent(x.secondId)+'&compare=1'))+'"><strong>'+esc(x.song||'삭제된 곡')+'</strong><span>'+esc(new Date(x.created).toLocaleDateString('ko-KR'))+' · '+(x.kind==='vocal-lab'?'녹음 '+(x.mediaIds||[]).length+'개':'비교 메모')+'</span><i class="ph ph-caret-right"></i></a>').join(''):'<div class="vl-empty">저장한 리포트가 없어요.<br><small>곡 분석의 깊이 보기에서 리포트를 저장하면 여기에 모여요.</small></div>')+'</div>';
}});
})();
