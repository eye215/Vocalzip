/* 곡 분석 — the ONE song screen (#/growth-song/<songId>; 성장 › 곡, 곡 상세's 성장 보기 · 분석·비교 보기). The former
 * 보컬 연구소 address (#/vocal-lab/<songId>) and old #/recording/<id> · #/compare links lead here (location.replace,
 * ?a= ?b= ?compare= ?report= ?selection= ?jump= kept; ?tab= flow|takes|weak|next opens that tab). Light, in tabs:
 *   머리           작품 · 제목 · ONE verdict (VZ.growthSong, app/growth-hub.js; model app/growth-song-model.js), 녹음 n ·
 *                 분석 n, ▶ 처음 vs 최근 듣기 · 듣고 고르기 (app/growth-song-page.js draws it)
 *   흐름           기간 (전체 · 이번 달 · 지난달, ?period= ?month=) · 처음 vs 최근 (▶처음 ▶최근, the measures of that pair,
 *                 지난달 대비, 연습 녹음도 넣기; a month: 월별 리포트's 이달의 변화) · 지표 흐름 (six measures, the chosen one's
 *                 line) · 들어 본 평가 · 자세히 보기 (기준, 지표별 자세히, 무엇이 달라졌나 app/growth-changes-ui.js, AI 해석)
 *   녹음별          the song's recordings (date pills, player, 내 만족도) · 이 녹음 분석 (처음 녹음과 비교 · 구간 자세히 =
 *                 이 녹음 자세히: 구간·최고음·악보·원곡 비교) · 두 녹음 비교 (가리고 듣고 평가, 측정값 나란히, 메모) ·
 *                 깊이 보기 (녹음별 변화 · 같은 날 녹음 세기 · 측정 방식별 비교 · 리포트 저장 · MR로 다시 분석 · 소리 길 흔적 ·
 *                 정밀 리포트 · 리포트 보관함 · 분석 기준 · 곡 상세)
 *   약한 곳         약한 곳 (아쉬운 쪽으로 움직인 지표 · 파사지오 참고) · 음높이 확인 구간 (app/weak-phrase.js) · 레슨 지적
 *                 (app/score-points.js) · 구간 A/B (app/segment-ab-ui.js, reachable without a plan)
 *   다음 연습        VZ.nextPractice for this song (app/next-practice.js) · 약한 구간 반복 듣기 · AI 추천 하나 더 (asks first)
 * Under two analysed takes: one card (녹음 n개 분석하기) and a row card instead of the tabs' empty boxes.
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
/** The words of a compared measure in the 처음 vs 최근 rows (purple only; the arrow says the way it moved). */
const PAIR_NAME={intonation:'음정 정확도',stability:'음정 안정성',range:'안정 최고음',phrase:'호흡 유지',high:'고음 안정성'};
const PAIR_WORD={better:['좋아짐','↗'],worse:['아쉬움','↘'],similar:['비슷함','→'],mixed:['엇갈림','↕'],changed:['달라짐','↕']};
/** One row of 처음 vs 최근: 이름 · 처음 → 최근 · 좋아짐 ↗ / 비슷함 → / 아쉬움 ↘ (판정 보류 with its reason). */
function pairRow(x,report){
 const r=report?.[x.id],hold=x.state==='hold'||!r;
 let before='',after='',word=PAIR_WORD[x.state]||['',''];
 if(!hold){
  if(x.id==='range'){before=r.before;after=r.after;word=r.delta>0?['높아짐','↗']:r.delta<0?['낮아짐','↘']:['같음','→'];}
  else{before=G.fmt(x.id,r.before);after=G.fmt(x.id,r.after);}
 }
 const name=PAIR_NAME[x.id]||x.title;
 return '<li class="sa-pair-row '+TONE[x.state]+'" data-growth-row="'+x.id+'" data-state="'+esc(x.state)+'"><span class="sa-pair-name">'+esc(name)+'</span>'+
  (hold?'<span class="sa-pair-vals"><b>판정 보류</b></span><small class="sa-pair-why">'+esc(x.text)+'</small>':
   '<span class="sa-pair-vals"><s>'+esc(before)+'</s><i aria-hidden="true">→</i><b>'+esc(after)+'</b></span><span class="sa-pair-state">'+esc(word[0])+' <i aria-hidden="true">'+word[1]+'</i></span>')+'</li>';
}
/** 처음 vs 최근 — the measures of the ONE pair of the song's verdict (처음·최근, same method and version), 판정 보류
 * with its reason: `rows` (the card), `detail` (자세히: each measure's line and basis, 내 만족도, the caution), `redo`
 * (옛 방식 다시 분석, when that is what holds them back) and `ai` (the optional AI wording of exactly these measures). */
function growthParts(s){
 const v=s.v?.now;
 if(!v||!G)return {rows:'',detail:'',redo:'',ai:''};
 const media=growthMedia(s),report=v.report||null,rows=v.rows||[],ref=songReference(s.song);
 const saved=savedGrowthReport(s),older=saved?null:olderGrowthReport(s);
 const line=x=>{
  let text=x.text;
  const vs=x.id==='range'&&report?.range?.vsScore;
  if(vs)text+=' · 악보 최고음 '+vs.scoreHigh+' 대비 '+(vs.after===0?'같은 음':(vs.after>0?'+':'−')+Math.abs(vs.after)+'반음');
  return '<li class="vl-growth-row '+TONE[x.state]+'" data-growth-detail="'+x.id+'"><span class="vl-growth-indicator" aria-hidden="true"></span><div><strong>'+esc(x.title)+'</strong><p>'+esc(text)+'</p>'+(x.note?'<small>'+esc(x.note)+'</small>':'')+'</div></li>';
 };
 const pick=states=>rows.filter(x=>states.includes(x.state));
 const strong=pick(['better']),weak=pick(['worse']),neutral=pick(['similar','mixed','changed']),held=pick(['hold']);
 const first=v.item&&s.all.find(m=>m.id===v.item.firstId),last=v.item&&s.all.find(m=>m.id===v.item.lastId);
 const rating=first&&last&&Number(first.rating)>0&&Number(last.rating)>0?'<p class="vl-growth-rating">내 만족도 '+first.rating+'/5 → '+last.rating+'/5 · 직접 기록한 체감이에요.</p>':'';
 const judged=!!report&&G.aiMetrics(G.aggregate([{songId:s.song.id,report:aiReport(report)}])).some(x=>x.state!=='unknown');
 // Older (v1) or detail-less results hold comparisons back: offer to re-analyse them right here, on this device.
 const stale=media.filter(m=>!G.hasDetail(analysis(m)));
 const redo=stale.length&&(!report||held.length)?'<div class="vl-growth-reanalyze" data-growth-tools><p>이전 방식으로 분석된 녹음 <strong>'+stale.length+'개</strong>를 새 방식으로 다시 분석하면 비교할 수 있어요. 이 기기에서 분석하고, 이전 결과는 이력으로 남겨요.</p>'+
  '<button type="button" class="sa-btn" data-growth-reanalyze'+(s.reanalyzing?' disabled':'')+'><i class="ph ph-arrows-clockwise" aria-hidden="true"></i> '+(s.reanalyzing?'다시 분석하는 중…':stale.length+'개 다시 분석')+'</button><p class="vl-muted" role="status" data-growth-reanalyze-status></p></div>':'';
 const section=(heading,list,cls)=>list.length?'<div class="vl-growth-group"><h4 class="'+cls+'">'+heading+' <span>'+list.length+'</span></h4><ul>'+list.map(line).join('')+'</ul></div>':'';
 const count=v.item?(v.item.count>2?v.item.count+'개 중 처음·최근 비교':'녹음 2개 비교'):media.length+'개 분석';
 const intro=v.item?'처음('+esc(day(first||{})||'—')+')과 최근('+esc(day(last||{})||'—')+') 녹음을 지표마다 나눠 봤어요':esc((G.HOLD_LABEL||'판정 보류')+' · '+v.text);
 const rowsHtml=v.item&&rows.length?'<ul class="sa-pair-rows" data-growth-report aria-label="지표별로 보기">'+rows.map(x=>pairRow(x,report)).join('')+'</ul>':'';
 const detail='<section class="vl-growth" data-growth-detail-report aria-label="지표별 자세히">'+
  '<div class="vl-growth-top"><h4 class="vl-growth-title">지표별 자세히</h4><span class="vl-growth-count" data-growth-count>'+count+'</span></div>'+
  '<p class="vl-growth-intro">'+intro+' <small>같은 곡·같은 측정 방법·같은 분석 버전·다른 날의 녹음만, 가능하면 같은 프레이즈끼리 비교해요. 최고음 하나로 판단하지 않아요.'+(ref?' 악보 기준 음역 '+esc(ref.low+'–'+ref.high)+'을 함께 봐요.':'')+'</small></p>'+
  section('좋아진 부분',strong,'good')+section('아쉬운 부분',weak,'bad')+section('비슷함·변화 관찰',neutral,'neutral')+section('판정 보류',held,'hold')+rating+
  (rows.length?'<p class="vl-growth-caution">판정 보류는 신뢰도·데이터·같은 프레이즈·분석 버전 중 근거가 부족하다는 뜻이에요. 최고음의 변화는 곡의 구간·발성 방식에 따라 달라지며, 측정값만으로 실력 향상이나 악화를 단정하지 않아요.</p>':'')+
  '</section>';
 const ai=judged?'<div class="vl-growth-ai"><div class="vl-growth-ai-head"><strong>AI 해석</strong><button type="button" class="sa-btn" data-growth-ai '+(s.growthPending?'disabled':'')+'>'+(saved?'다시 생성':'AI로 종합 해석')+'</button></div>'+
    '<p class="vl-growth-ai-status" data-growth-ai-status role="status">'+(s.growthPending?'AI가 측정 기록을 해석하고 있어요…':saved?'이 비교의 AI 해석을 저장해 두었어요.':older?'예전에 저장한 해석이에요. 그때 고른 녹음 기준이라 지금 비교와 다를 수 있어요.':'음정 정확도·음정 안정성·호흡 유지의 비교 결과(판정 보류 포함)만 보내 해석해요. 음역·최고음은 보내지 않아요. 보내기 전에 먼저 물어봐요.')+'</p>'+
    (saved||older?'<div class="vl-growth-ai-text"'+(saved?'':' data-growth-ai-older')+'>'+esc((saved||older).text)+'</div>':'<div class="vl-growth-ai-text" data-growth-ai-result hidden></div>')+'</div>':
    older?'<div class="vl-growth-ai"><div class="vl-growth-ai-head"><strong>AI 해석</strong></div><p class="vl-growth-ai-status">예전에 저장한 해석이에요. 그때 고른 녹음 기준이라 지금 비교와 다를 수 있어요.</p><div class="vl-growth-ai-text" data-growth-ai-older>'+esc(older.text)+'</div></div>':
    '<p class="vl-muted" data-growth-ai-none>같은 방법·같은 버전으로 잰, 믿을 만한 녹음이 다른 날 두 개 이상 있어야 AI 해석을 요청할 수 있어요.</p>';
 return {rows:rowsHtml,detail,redo,ai};
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
/** The verdict of the song now (전체, with the 연습 녹음 포함 switch): worked out once per drawing of 처음 vs 최근. */
function verdictOf(s){
 let x=null;
 try{x=V.growthSong?.of(s.all,s.song.id,s.practice)||null;}catch(error){console.error(error);}
 s.v=x;
 return x;
}
/** 처음 vs 최근 (흐름): ▶처음 ▶최근 of the chosen span, the measures of the pair (이름 · 처음 → 최근 · 좋아짐 ↗), 다시 분석
 * when old results hold them back, 지난달 대비, and the 연습 녹음도 넣기 switch — or, for a month, 월별 리포트's 이달의 변화
 * and six measures of this song (V.monthlyGrowthDetail, the same numbers). Drawn again only when a take, an analysis,
 * the switch or the chip changes. */
function verdictHtml(s){
 const x=s.v,p=periodOf(s),h=s.hero;
 let month=null;
 const note=s.practice?'노래 연습실·트레이닝 연습 녹음도 넣어 견줘요. 끄면 결과 리포트와 같은 기준이에요.':'곡 녹음만 견줘요. 노래 연습실·트레이닝 연습 녹음은 빼요.';
 const head='<header class="sa-card-head"><h2 id="vl-changes-title">처음 vs 최근</h2><small>같은 방법으로 잰 것만</small></header>';
 const take=(id,label,date,cls)=>'<button type="button" class="sa-take '+cls+'" data-gsp-play="'+esc(id)+'" aria-label="'+esc(label+' 녹음 듣기 · '+V.growthSongParts.dayLabel(date))+'"><span class="sa-take-play" aria-hidden="true"><i class="ph-fill ph-play"></i></span><span class="sa-take-text"><small>'+label+'</small><b>'+esc(V.growthSongParts.dayLabel(date))+'</b></span></button>';
 const takes=h?.firstId&&h?.lastId&&V.growthSongParts?'<div class="sa-pair-takes">'+take(h.firstId,'처음',h.firstDate,'is-first')+take(h.lastId,'최근',h.lastDate,'is-last')+'</div><div class="gsp-player sa-pair-player" data-gsp-player></div>':'';
 const sw='<label class="sa-switch"><span>연습 녹음도 넣기</span><input type="checkbox" role="switch" data-song-practice'+(s.practice?' checked':'')+'></label>'+
  '<p class="vl-muted sa-switch-note" data-song-practice-note>'+note+'</p>'+
  (x?.effect&&!p?'<p class="vl-effect" data-song-practice-effect role="status">'+esc(x.effect)+'</p>':'');
 if(p){
  let detail=null;
  try{detail=V.monthlyGrowthDetail?.(s.all,{month:p.from.slice(0,7),songId:s.song.id,practice:s.practice})||null;}catch(error){console.error(error);}
  // monthlyGrowthDetail falls back to the whole month when the song has no take in it: that is not this song's.
  const mine=detail&&detail.current.length&&detail.current.every(m=>m.songId===s.song.id);
  return head+takes+(mine?'<div class="vl-month-detail" data-song-month-detail="'+esc(p.from.slice(0,7))+'">'+detail.html+'</div>':'<p class="sa-note" data-song-month-none>'+esc(p.label)+'에는 이 곡 녹음이 없어요.</p>')+sw;
 }
 const v=x?.now||null,parts=growthParts(s);
 try{month=v?.item?V.growthSong.month(s.all,s.song.id,s.practice):null;}catch(error){console.error(error);}
 return head+takes+(parts.rows||(v?'<p class="sa-note" data-growth-none>'+esc(v.text)+'</p>':''))+parts.redo+
  (month?'<p class="vl-month" data-song-month data-state="'+month.state+'"><strong>지난달 대비</strong><span>'+esc(month.word+' · '+month.text)+'</span><small>'+esc(month.basis)+'</small></p>':'')+sw;
}
/** 처음 vs 최근 › 자세히 (folded): the rule, each measure's line with its basis, 처음·최근 through 무엇이 달라졌나 for this
 * song (app/growth-changes-ui.js), and the AI wording of these measures (asks first). */
function detailHtml(s){
 const p=periodOf(s),parts=p?{detail:'',ai:''}:growthParts(s);
 return '<p class="vl-muted vl-part-rule" data-song-rule>'+(p?esc(p.label)+' 녹음을 그 전 마지막 녹음과 같은 방법·같은 분석 버전끼리 견줘요. 월별 리포트와 같은 기준이에요.':'처음과 최근 녹음을 같은 방법·같은 분석 버전으로 잰 것끼리 견줘요. 이번 달과 같은 기준이에요.')+'</p>'+
  parts.detail+(window.VzipGrowthChangesUI?'<div class="gc-host sa-gc" data-growth-changes></div>':'')+(parts.ai?'<div class="vl-growth-tools" data-growth-ai-box>'+parts.ai+'</div>':'');
}
/* ----- 지표 흐름: the six measures of the song's counted takes, and the chosen one's line ----- */
const FLOW_ORDER=['intonation','stability','phrase','high','range','passaggio'];
const FLOW_NAME={intonation:'음정 정확도',stability:'음정 안정성',phrase:'호흡 유지',high:'고음 안정성',range:'음역',passaggio:'파사지오'};
const FLOW_ARROW={better:'↗',worse:'↘',similar:'→',mixed:'↕',changed:'↕'};
const FLOW_WORD={better:'좋아짐',worse:'아쉬움',similar:'비슷함',mixed:'엇갈림',changed:'달라짐'};
/** The value of one measure in one take, as 성장 › 나's 지표 6가지 reads it (app/growth-month.js). */
function flowValue(s,a,id){
 if(id==='passaggio'||!a)return null;
 if(id==='high'){try{const w=G.single(a,{reference:songReference(s.song)}).high?.wobble;return Number.isFinite(w)?w:null;}catch{return null;}}
 const x=G.value?.(a,id);
 return Number.isFinite(x)?x:null;
}
const flowText=(id,v)=>v==null||!Number.isFinite(Number(v))?'—':id==='range'?G.noteName(G.midiOf(v)):G.fmt(id,v);
/** The counted takes of the song (the verdict's, reliable ones), oldest first, each measure's points. */
function flowSeries(s){
 const ok=V.growthDataset?.ok||(m=>!!V.analysisReliable?.(analysis(m)));
 const takes=growthMedia(s).filter(m=>{try{return ok(m);}catch{return false;}}).map(m=>({m,date:String(M.dateOf(m)||'').slice(0,10)})).filter(x=>x.date)
  .sort((a,b)=>a.date.localeCompare(b.date)||(Number(a.m.created)||0)-(Number(b.m.created)||0));
 const out={};
 for(const id of FLOW_ORDER)out[id]=takes.map(t=>({date:t.date,value:flowValue(s,analysis(t.m),id),m:t.m})).filter(x=>x.value!=null);
 return out;
}
function flowSvg(s,id,pts,direction){
 const W=318,H=138,top=14,bottom=118,vals=pts.map(p=>p.value);
 let lo=Math.min(...vals),hi=Math.max(...vals);
 if(hi-lo<1e-6){lo-=1;hi+=1;}
 const pad=(hi-lo)*.12;lo-=pad;hi+=pad;
 const up=direction===-1?v=>(v-lo)/(hi-lo):v=>(hi-v)/(hi-lo);   // smaller is better: drawn higher
 const x=i=>i/(pts.length-1)*(W-12),y=v=>top+up(v)*(bottom-top);
 const line=pts.map((p,i)=>x(i).toFixed(1)+','+y(p.value).toFixed(1)).join(' '),end=pts.length-1,ex=x(end),ey=y(pts[end].value);
 const md=d=>Number(d.slice(5,7))+'/'+Number(d.slice(8,10));
 const dir=direction?'위가 좋아요':id==='range'?'위가 높은 음':'';
 return '<div class="sa-flow" data-sa-flow-graph="'+id+'"><svg class="sa-flow-svg" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(FLOW_NAME[id]+' 흐름, 녹음 '+pts.length+'개')+'" focusable="false">'+
  '<defs><linearGradient id="saFlowL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#C9AEFB"/><stop offset=".6" stop-color="#7A32F5"/><stop offset="1" stop-color="#5B1FC2"/></linearGradient>'+
  '<linearGradient id="saFlowA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8B45FF" stop-opacity=".3"/><stop offset="1" stop-color="#8B45FF" stop-opacity="0"/></linearGradient></defs>'+
  [.25,.5,.75].map(f=>'<line x1="0" x2="'+W+'" y1="'+(top+f*(bottom-top)).toFixed(1)+'" y2="'+(top+f*(bottom-top)).toFixed(1)+'" stroke="#F3EEFC"/>').join('')+
  (dir?'<text x="0" y="9" font-size="9" fill="#98A2B3">'+dir+'</text>':'')+
  '<polygon points="0,'+bottom+' '+line+' '+ex.toFixed(1)+','+bottom+'" fill="url(#saFlowA)"/>'+
  '<polyline points="'+line+'" fill="none" stroke="url(#saFlowL)" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>'+
  '<circle cx="'+ex.toFixed(1)+'" cy="'+ey.toFixed(1)+'" r="11" fill="#7A32F5" opacity=".12" data-sa-flow-glow/><circle cx="'+ex.toFixed(1)+'" cy="'+ey.toFixed(1)+'" r="5" fill="#5B1FC2" stroke="#fff" stroke-width="2"/>'+
  '<text x="0" y="'+(H-4)+'" font-size="10" fill="#7D8597">'+md(pts[0].date)+'</text><text x="'+W+'" y="'+(H-4)+'" font-size="10" fill="#7D8597" text-anchor="end">'+md(pts[end].date)+'</text></svg>'+
  (V.growthSongParts?.stars?V.growthSongParts.stars([['-16px','-18px',9,2.4,0],['6px','-24px',6,2.1,.9]],'sa-flow-stars').replace('class="gsp-stars sa-flow-stars"','class="gsp-stars sa-flow-stars" style="left:'+(ex/W*100).toFixed(2)+'%;top:'+(ey/H*100).toFixed(2)+'%"'):'')+'</div>';
}
/** 지표 흐름 (흐름): six tiles (the latest value, ↗ → ↘ of the pair) and the chosen measure's line with 처음 · 평균 · 최고 ·
 * 녹음 n개 — the numbers 처음 vs 최근 and 지표별 자세히 already have, over every counted take of the song. */
function metricsHtml(s){
 if(!G)return '';
 const report=labReport(s),series=flowSeries(s),sel=FLOW_ORDER.includes(s.flowMetric)?s.flowMetric:'intonation';
 const d=id=>G.METRICS.find(x=>x.id===id)||{};
 const latest=id=>{
  if(id==='passaggio')return '참고';
  if(id==='range'){const last=series.range.at(-1);if(!last)return '—';try{const main=G.single(analysis(last.m),{reference:songReference(s.song)}).range?.main;if(main?.low&&main?.high)return main.low+'–'+main.high;}catch{}return flowText('range',last.value);}
  // A measure 처음 vs 최근 compared: its latest value there (the same number as the row above); else the latest take's.
  const r=report?.[id];
  return flowText(id,r&&r.state!=='hold'&&Number.isFinite(r.after)?r.after:series[id].at(-1)?.value);
 };
 const state=id=>{const r=report?.[id];return r&&r.state!=='hold'&&id!=='passaggio'?(id==='range'?(r.delta>0?'better':r.delta<0?'worse':'similar'):r.state):'';};
 const tiles='<div class="sa-tiles" role="group" aria-label="지표 고르기">'+FLOW_ORDER.map(id=>{
  const st=state(id),arrow=FLOW_ARROW[st]||'';
  return '<button type="button" class="sa-tile" data-sa-metric="'+id+'" aria-pressed="'+(id===sel)+'"><span>'+FLOW_NAME[id]+'</span><b>'+esc(latest(id))+(arrow?' <small>'+arrow+'</small>':'')+'</b></button>';
 }).join('')+'</div>';
 const pts=series[sel]||[],dir=d(sel).direction||0,st=state(sel);
 const headWord=sel==='passaggio'?'참고':st?(sel==='range'?(st==='better'?'높아짐':st==='worse'?'낮아짐':'같음'):FLOW_WORD[st]):'';
 const head='<p class="sa-flow-head" data-sa-flow-head><strong>'+FLOW_NAME[sel]+'</strong> <span>'+esc(sel==='passaggio'?'':latest(sel))+(headWord?' '+headWord:'')+'</span></p>';
 let body;
 if(sel==='passaggio'){
  let x=null;try{x=G.songReport(growthMedia(s).map(m=>V.growthDataset.take(m)),{reference:songReference(s.song)}).passaggio;}catch(error){console.error(error);}
  body='<p class="sa-note">'+esc((x?G.passaggioReportText(x)+' · ':'')+G.PASSAGGIO_NOTE)+'</p>';
 }else if(pts.length<2)body='<p class="sa-note" data-sa-flow-empty>'+(pts.length?'믿을 만한 녹음이 하나 더 쌓이면 흐름을 그려요.':'이 지표를 잰 녹음이 아직 없어요.')+'</p>';
 else body=flowSvg(s,sel,pts,dir);
 const sts=window.VzipGrowthMe?.stats?.(pts.map(p=>p.value),dir),val=v=>esc(flowText(sel,sel==='range'?Math.round(v/100)*100:v).replace(/ cent$/,''));
 const stats=sts?.count&&sel!=='passaggio'?'<p class="sa-flow-stats" data-sa-flow-stats><span>처음 <b>'+val(sts.first)+'</b></span><span>평균 <b>'+val(sts.avg)+'</b></span><span>'+(dir?'최고':'가장 높음')+' <b>'+val(sts.best)+'</b></span><span>녹음 '+sts.count+'개</span></p>':'';
 return '<header class="sa-card-head"><h2>지표 흐름</h2><small>믿을 만한 녹음 전체</small></header>'+tiles+head+body+stats;
}
/** 약한 곳 (약한 곳 탭): the measures of the pair that went the other way (최근) and 파사지오 (참고) — what recurs over
 * the song's counted recordings, never one recording's value, never a verdict. */
function weakHtml(s){
 if(!G)return '';
 const report=labReport(s),rows=(s.v?.now?.rows||[]).filter(x=>x.state==='worse');
 let pass=null;
 try{pass=G.songReport(growthMedia(s).map(m=>V.growthDataset.take(m)),{reference:songReference(s.song)}).passaggio;}catch(error){console.error(error);}
 const item=(attr,title,line,chip,note='')=>'<li class="sa-weak-item"'+attr+'><span class="sa-weak-dot" aria-hidden="true"></span><div><p class="sa-weak-title"><strong>'+esc(title)+'</strong> <em class="sa-chip">'+chip+'</em></p><p class="sa-weak-line">'+esc(line)+'</p>'+(note?'<small>'+esc(note)+'</small>':'')+'</div></li>';
 const list=rows.map(x=>{const r=report?.[x.id];return item(' data-weak-row="'+x.id+'"',PAIR_NAME[x.id]||x.title,r?G.changeText(r):x.text,'최근','처음보다 최근 녹음에서 아쉬운 쪽으로 움직였어요');}).join('')+
  (pass?item(' data-growth-row="passaggio" data-weak="passaggio"','파사지오(전환 구간)',G.passaggioReportText(pass),'참고',G.PASSAGGIO_NOTE):'');
 return list?'<ul class="sa-weak-list">'+list+'</ul>':'<p class="sa-note" data-weak-none>되풀이해 흔들리는 곳은 보이지 않아요. 녹음이 더 쌓이면 다시 살펴봐요.</p>';
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
/** 이 녹음 분석 (녹음별): six small results of the take (the measures 성장 reads, G.single), 처음 녹음과 비교 and 구간 자세히
 * (이 녹음 자세히: 구간 분석 · 최고음 확인 · 악보·원곡과 비교 · 고음 안정성 · 파사지오, folded under them). */
function analysisCard(s,m){
  const a=analysis(m);
  let one=null;
  try{one=a&&G?G.single(a,{reliable:V.analysisReliable(a),reference:songReference(s.song)}):null;}catch(error){console.error(error);}
  const val=(id,x)=>!x||x.state==='hold'?'—':id==='range'?(x.main?x.main.low+'–'+x.main.high:x.stable||'—'):id==='high'?'±'+x.wobble:id==='top'?x:G.fmt(id,x.value).replace(/ cent$/,id==='intonation'?' cent':'');
  const top=a?.v>=2?(a.metrics?.range?.validHigh?.note||a.metrics?.range?.stableHigh?.note||null):null;
  const tiles=[['intonation','음정',one?.intonation],['stability','안정성',one?.stability],['top','최고음',top],['range','음역',one?.range],['phrase','호흡',one?.phrase],['high','고음',one?.high]];
  const first=s.items[0],self=first&&first.id===m.id;
  const open=foldOpen(s,'take');
  return '<section class="sa-card sa-ana" data-sa-analysis><header class="sa-card-head"><h2>이 녹음 분석</h2>'+(a&&!V.analysisReliable(a)?'<small>신뢰도 낮음 · 참고</small>':'')+'</header>'+
    (a?'<div class="sa-mini-tiles">'+tiles.map(([id,label,x])=>'<div class="sa-mini" data-sa-take-metric="'+id+'"><span>'+label+'</span><b>'+esc(val(id,x))+'</b></div>').join('')+'</div>'
      :'<p class="sa-note" data-sa-take-none>이 녹음은 아직 분석 전이에요. 구간 자세히에서 분석할 수 있어요.</p>')+
    '<div class="sa-btns sa-btns-2"><button type="button" class="sa-btn" data-sa-compare-first'+(s.items.length<2?' disabled':'')+'>'+(self?'최근 녹음과 비교':'처음 녹음과 비교')+'</button>'+
    '<button type="button" class="sa-btn" data-sa-take-detail aria-expanded="'+open+'" aria-controls="sa-take-detail">구간 자세히</button></div>'+
    '<details class="sa-take-detail" id="sa-take-detail" data-song-fold="take"'+(open?' open':'')+'><summary>이 녹음 자세히</summary><div class="vl-fold-body">'+makeSegment(s,m)+(a?singleDetail(s,a):'')+'</div></details></section>';
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
 const ticks=[-50,-25,0,25,50].map(c=>'<line x1="'+padL+'" x2="'+(W-padR)+'" y1="'+y(c)+'" y2="'+y(c)+'" stroke="#E4DCF3" stroke-dasharray="'+(c===0?'0':'4 5')+'" opacity=".7"/><text x="'+(padL-6)+'" y="'+(y(c)+4)+'" text-anchor="end" fill="#7D8597" font-size="10">'+(c>0?'+':'')+c+'</text>').join('');
 const seconds=[0,1,2,3].filter(t=>t<=maxCount/fps).map(t=>'<text x="'+x(t)+'" y="'+(H-4)+'" fill="#7D8597" text-anchor="middle" font-size="10">'+t.toFixed(1)+'</text>').join('');
 return '<svg class="vl-observation-curve" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="실제 녹음의 지속 구간 약 '+(maxCount/fps).toFixed(1)+'초 음정 편차 그래프">'+
  ticks+'<text x="'+padL+'" y="10" font-size="10" fill="#7D8597">(cent)</text><path d="'+path+'" fill="none" stroke="#7A32F5" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>'+seconds+'<text x="'+(W-padR)+'" y="'+(H-4)+'" text-anchor="end" font-size="10" fill="#7D8597">(초)</text></svg>';
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
 V.sheet({title:day(m)+' · '+title,body:'<div class="vl-observation-card"><div class="vl-observation-label">분석 관찰</div><h3>'+safe(metric.key==='wob'?'지속음의 음정 흔들림(위블)':metric.label)+(V.metricInfo?V.metricInfo((metric.key==='high'||metric.key==='stable')?'range':metric.key,metric.label):'')+'</h3><div class="vl-observation-value">'+safe(valueLabel)+'</div>'+compare+
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
  const empty=recs.enough?'지금은 이 곡에서 따로 할 다음 연습이 없어요.':'이 곡의 믿을 만한 분석 녹음이 3개 이상 모이면 맞춤 연습이 나와요. 지금 '+recs.count+'개예요.';
  return '<section class="sa-card vl-recommend" data-sa-next-card><header class="sa-card-head"><h2 id="vl-next-title">이 곡 다음 연습</h2><small data-vl-next-count>'+(recs.items.length?recs.items.length+'개':'')+'</small></header>'+
    (rows?'<div class="vl-next" data-vl-next>'+rows+'</div>':'<p class="sa-note" data-vl-next-empty>'+esc(empty)+'</p>')+
    (rows&&!recs.enough?'<p class="vl-muted">'+esc(empty)+'</p>':'')+
    (recs.note?'<p class="vl-muted" data-tip-skipped>'+esc(recs.note)+'</p>':'')+'</section>'+
    '<div class="vl-recommend-actions"><button type="button" class="sa-btn sa-btn-pill" data-repeat-practice><i class="ph-fill ph-play" aria-hidden="true"></i>약한 구간 반복 듣기</button><button type="button" class="sa-text-btn" data-ai-exercise>AI 추천 하나 더</button></div>'+
    '<p class="vl-muted sa-ai-status" data-ai-status role="status">지금 고른 녹음의 구간 기록으로 위 목록에 없는 연습 하나를 추천해요. 보내기 전에 무엇을 보내는지 먼저 보여 드려요.</p>'+
    '<div class="vl-tip-list" data-ai-tip>'+(aiTip?tipCard(aiTip,songId):'')+'</div>'+
    '<a class="sa-row-card" href="#/next-practice" data-vl-next-all><span><strong>다음 연습 전체 보기</strong><small>모든 곡 · 기본기</small></span><i class="ph ph-caret-right" aria-hidden="true"></i></a>';
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
  const head='<header class="sa-card-head"><h2>음높이 확인 구간</h2></header>';
  if(!window.VzipWeakPhrase||!list.length){host.innerHTML=head+'<p class="sa-note">'+(list.length?'이 기기에서는 구간 찾기를 쓸 수 없어요.':'들어 볼 수 있는 이 곡 녹음이 없어요.')+'</p>';return;}
  const pickId=list.some(m=>m.id===s.weakId)?s.weakId:list[0].id;
  host.innerHTML=head+'<p class="vl-muted sa-card-lead">녹음 하나에서 가까운 반음과 차이가 큰 곳을 찾아 들려 드려요. 들어 볼 후보예요.</p>'+
    '<div class="vl-weak-pick"><label class="sr-only" for="vl-weak-take">구간을 찾을 녹음</label><select id="vl-weak-take" data-weak-take>'+list.map(m=>'<option value="'+esc(m.id)+'"'+(m.id===pickId?' selected':'')+'>'+esc(day(m)+' · '+M.label(m))+'</option>').join('')+'</select>'+
    '<button type="button" class="sa-btn" data-weak-find>구간 찾기</button></div><div class="vl-weak-results" data-weak-results role="status"></div>';
  const select=host.querySelector('[data-weak-take]'),button=host.querySelector('[data-weak-find]'),out=host.querySelector('[data-weak-results]');
  const show=(item,found)=>{
    out.innerHTML='<p class="vl-muted">음높이 확인 후보 '+found.length+'개 · 듣고 실제로 연습할 곳인지 확인해 주세요.</p>'+
      found.map((seg,i)=>'<div class="vl-weak-item"><button type="button" class="sa-round-play" data-weak-play="'+i+'" aria-label="'+esc(time(seg.start)+'부터 '+time(seg.end)+'까지 듣기')+'"><i class="ph-fill ph-play" aria-hidden="true"></i></button>'+
        '<b>'+esc(time(Math.floor(seg.start))+'–'+time(Math.ceil(seg.end)))+'</b><span>가까운 반음과 '+(seg.deviation>0?'+':'')+seg.deviation+' cent · 정답 판정 아님</span></div>').join('')+'<div class="vl-weak-player" data-weak-player></div>';
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
/** 레슨 지적 (app/score-points.js) of this song: each point that is still checked (마디 · 내용 · 지켰어요 k/n, the most
 * missed first), 체크 시작 (부르면서 체크, as the song page starts it) and + 지적 추가. A row opens that point to edit. */
function paintPoints(s){
  const host=s.slots?.points,P=window.VzipScorePointsModel,SP=V.scorePoints;
  if(!host)return;
  if(!P||!SP){host.innerHTML='';return;}
  const on=P.active(P.points(V.db,s.song.id)),runs=P.runs(V.db,s.song.id);
  const rows=on.map(p=>({p,r:P.record(runs,p.id)}));
  const kept=rows.reduce((n,x)=>n+x.r.kept,0),total=rows.reduce((n,x)=>n+x.r.total,0);
  // The points missed most in the last checks first: those are the weak places.
  const shown=rows.slice().sort((x,y)=>(y.r.total-y.r.kept)-(x.r.total-x.r.kept)||y.r.total-x.r.total);
  host.innerHTML='<header class="sa-card-head"><h2>레슨 지적</h2><small data-weak-points-sum>'+(on.length?'지적 '+on.length+'개 · '+(total?'최근 체크 '+total+'번 중 '+kept+'번 지켰어요':'아직 체크 전'):'적어 둔 지적 없음')+'</small></header>'+
    (shown.length?'<ul class="sa-points">'+shown.map(({p,r})=>'<li data-weak-point="'+esc(p.id)+'"><button type="button" class="sa-point" data-sa-point-edit="'+esc(p.id)+'" aria-label="'+esc(P.label(p.measures)+' '+p.text+' · '+P.recordText(r)+' · 고치기')+'"><span class="sa-point-where">'+esc(P.label(p.measures))+'</span><span class="sa-point-text">'+esc(p.text)+'</span>'+
      '<b'+(r.total?'':' class="is-none"')+' title="'+esc(P.recordText(r))+'">'+(r.total?'지켰어요 '+r.kept+'/'+r.total:'아직')+'</b></button></li>').join('')+'</ul>'
      :'<p class="sa-note">레슨에서 들은 지적을 마디에 적어 두면 부를 때 체크할 수 있어요.</p>')+
    '<div class="sa-btns">'+(on.length?'<button type="button" class="sa-btn" data-pts-start>체크 시작</button>':'')+'<button type="button" class="sa-btn" data-pts-add>+ 지적 추가</button>'+
    '<button type="button" class="sa-text-btn" data-pts-manage>전체 보기</button></div>';
  host.querySelector('[data-pts-start]')?.addEventListener('click',()=>(SP.begin||SP.start)(s.song.id));
  host.querySelector('[data-pts-add]').onclick=()=>SP.editor(s.song.id);
  host.querySelector('[data-pts-manage]').onclick=()=>SP.manage(s.song.id);
  host.querySelectorAll('[data-sa-point-edit]').forEach(b=>b.onclick=()=>{const p=on.find(x=>x.id===b.dataset.saPointEdit);if(p)SP.editor(s.song.id,{point:p});});
}
/** The player card of 녹음별: 날짜 · 종류, n개 중 k번째, the title, the waveform with the position, ‹ ▶ › (and 구간 반복,
 * 배속), 내 만족도. ‹ › step through the takes that are open (the date pills pressed), as a swipe does. */
function playerCard(s,m) {
  const idx=s.selected.indexOf(m.id),total=Math.max(0,Number(m.durationSeconds)||0);
  const previous=s.items.find(x=>x.id===s.selected[idx-1]),next=s.items.find(x=>x.id===s.selected[idx+1]);
  const hasWave=Array.isArray(m.waveform)&&m.waveform.length>0;
  const name=M.label(m)||'제목 없는 녹음',kind=(s.kinds?.get(m.id)||[]).includes('연습')?'연습 녹음':(s.kinds?.get(m.id)||[]).includes('영상')?'영상':'곡 녹음';
  const when=M.dateOf(m)?V.growthSongParts?.dayLabel?.(M.dateOf(m))||day(m):'날짜 없음';
  return '<div class="vl-player sa-card" data-card data-waveform="'+(hasWave?'yes':'no')+'">'+
    '<div class="vl-player-head"><span class="vl-player-eyebrow">'+esc(when)+' · '+kind+'</span><span class="vl-player-count" data-sa-take-pos>'+s.selected.length+'개 중 '+(idx+1)+'번째</span></div>'+
    '<div class="vl-player-title"><strong>'+esc(name)+'</strong></div>'+
    (hasWave?waveform(m):'<div class="vl-wave-compact"><i class="ph ph-waveform" aria-hidden="true"></i><span>파형 정보 없음 · 녹음은 정상 재생할 수 있어요</span></div>')+
    '<div class="vl-seek"><input type="range" min="0" max="1000" value="0" data-seek aria-label="재생 위치"><span class="vl-seek-times"><span data-time>0:00</span><span data-duration>'+time(total)+'</span></span></div>'+
    '<div class="vl-controls"><button type="button" class="vl-side" data-loop aria-label="구간 반복" aria-pressed="false"><i class="ph ph-repeat"></i></button><button type="button" data-previous aria-label="이전 녹음'+(previous?' · '+esc(M.label(previous)):'')+'"'+(!previous?' disabled':'')+'><i class="ph ph-caret-left"></i></button><button type="button" class="vl-play" data-play aria-label="재생"><i class="ph-fill ph-play"></i></button><button type="button" data-next aria-label="다음 녹음'+(next?' · '+esc(M.label(next)):'')+'"'+(!next?' disabled':'')+'><i class="ph ph-caret-right"></i></button><button type="button" class="vl-side vl-speed" data-speed aria-label="재생 속도">1.0×</button></div>'+
    '<div class="vl-internal-player" data-player></div><p class="vl-muted vl-player-status" data-player-status role="status"></p>'+
    '<section class="vl-rating"><span>내 만족도 <b>'+(m.rating?m.rating+'/5':'')+'</b></span><div class="vl-stars" role="group" aria-label="내 만족도 · '+esc(day(m))+'">'+[1,2,3,4,5].map(n=>'<button type="button" data-rating="'+n+'" aria-pressed="'+(n<=Number(m.rating||0))+'" aria-label="'+n+'점"><i class="ph-fill ph-star" aria-hidden="true"></i></button>').join('')+'</div></section></div>';
}
/* ----- The frame: 머리 (hero), the tabs 흐름 · 녹음별 · 약한 곳 · 다음 연습, and a slot for each part. A slot is filled by its
 * own painter, so a part that holds something typed or playing (구간 A/B, 음높이 확인 구간) is not redrawn by a tap
 * elsewhere. Every panel is in the page; only the chosen one is shown. ----- */
const TABS=[['flow','흐름'],['takes','녹음별'],['weak','약한 곳'],['next','다음 연습']];
const TAB_OF={changes:'flow',flow:'flow',takes:'takes',compare:'takes',deep:'takes',weak:'weak',next:'next'};
let lastTab='flow';   // the tab chosen last, kept while the app is open
function frame(s){
  const tab=(k,label)=>'<button type="button" role="tab" class="sa-tab" id="sa-tab-'+k+'" data-sa-tab="'+k+'" aria-controls="sa-panel-'+k+'" aria-selected="false" tabindex="-1">'+label+'</button>';
  const panel=(k,body)=>'<div class="sa-panel" role="tabpanel" id="sa-panel-'+k+'" data-sa-panel="'+k+'" aria-labelledby="sa-tab-'+k+'" hidden>'+body+'</div>';
  return '<div class="gsp gsp-top" data-gsp><div data-slot="hero"></div></div>'+
    '<div class="sa-tabs" role="tablist" aria-label="곡 분석 보기" data-sa-tabs>'+TABS.map(([k,l])=>tab(k,l)).join('')+'</div>'+
    panel('flow','<div class="sa-stack" data-slot="intro"></div><div class="sa-stack" data-sa-full><div data-slot="periods"></div>'+
      '<section class="sa-card" data-song-section="changes" aria-labelledby="vl-changes-title"><div data-slot="verdict"></div></section>'+
      '<section class="sa-card" data-sa-metrics data-slot="metrics"></section>'+
      '<div data-slot="heard"></div>'+
      '<details class="sa-card sa-fold" data-song-fold="detail"'+(foldOpen(s,'detail')?' open':'')+'><summary><span><strong>자세히 보기</strong><small>기준 · 지표별 자세히 · 무엇이 달라졌나 · AI 해석</small></span><i class="ph ph-caret-down" aria-hidden="true"></i></summary><div class="sa-fold-body" data-slot="detail"></div></details></div>')+
    panel('takes','<div class="sa-stack" data-song-section="takes" aria-label="녹음별"><div data-slot="check"></div><div class="sa-stack" data-slot="takes"></div></div>'+
      '<section class="sa-card vl-compare" data-song-section="compare" aria-labelledby="vl-compare-title"><header class="sa-card-head"><h2 id="vl-compare-title">두 녹음 비교</h2><small>들어 본 평가 · 측정값 · 메모</small></header><div data-slot="compare"></div></section>'+
      '<details class="sa-card sa-fold vl-deep" data-song-section="deep"'+(foldOpen(s,'deep')||s.open.trend?' open':'')+'><summary><span><h2>깊이 보기</h2><small>녹음별 변화 · 같은 날 세기 · 측정 방식 · 리포트 저장 · 다시 분석</small></span><i class="ph ph-caret-down" aria-hidden="true"></i></summary>'+
      '<div class="sa-fold-body"><div data-slot="trend"></div><div data-slot="tools"></div><div data-slot="deep"></div></div></details>')+
    panel('weak','<div class="sa-stack" data-song-section="weak" aria-label="약한 곳"><section class="sa-card" data-sa-weak><header class="sa-card-head"><h2 id="vl-weak-title">약한 곳</h2><small>숫자는 참고예요</small></header><div data-slot="pass"></div></section>'+
      '<section class="sa-card" data-slot="phrases" data-weak="phrases"></section><section class="sa-card" data-slot="points" data-weak="points"></section>'+
      '<details class="sa-card sa-fold sa-ab" data-song-fold="ab" data-weak="ab"><summary><span><strong>구간 A/B</strong><small>두 녹음의 같은 구간을 맞춰 번갈아 들어요</small></span><i class="ph ph-caret-right" aria-hidden="true"></i></summary><div class="sa-fold-body" data-ab-host></div></details></div>')+
    panel('next','<div class="sa-stack" data-song-section="next" aria-label="다음 연습" data-slot="tips"></div>')+
    '<p class="vl-muted vl-disclaimer" data-song-disclaimer>수치는 음성 측정에 기반한 참고 정보예요. 분석하지 않은 녹음에는 결과를 만들어 넣지 않아요.</p>';
}
/** Shows one tab's panel. url: the address says it (?tab=), without a new history entry. */
function setTab(s,tab,{url=true,focus=false}={}){
  if(!TABS.some(([k])=>k===tab))tab='flow';
  s.tab=tab;lastTab=tab;
  if(tab!=='flow')s.explored=true;   // a tab other than 흐름 (asked for, or chosen last) keeps the tabs in view
  const host=s.host;
  host.querySelectorAll('[data-sa-tab]').forEach(b=>{const on=b.dataset.saTab===tab;b.setAttribute('aria-selected',String(on));b.tabIndex=on?0:-1;if(on&&focus)b.focus({preventScroll:true});});
  host.querySelectorAll('[data-sa-panel]').forEach(p=>{p.hidden=p.dataset.saPanel!==tab;});
  paintEmpty(s);
  if(url){try{const h=location.hash,[path,q='']=h.split('?'),qs=new URLSearchParams(q);if(tab==='flow')qs.delete('tab');else qs.set('tab',tab);const next=path+(qs.toString()?'?'+qs:'');if(next!==h)history.replaceState(history.state,'',next);}catch{}}
  // A chart drawn in a hidden panel is measured once it shows.
  if(tab==='takes'&&s.slots){sizePlots(host);centreTimeline(s);centreTrend(s);}
}
/** Under two analysed takes the tabs would be boxes of 아직 없어요: ONE card says it (흐름), with the ways in; the tabs
 * show once one of those is opened. */
function paintEmpty(s){
  const host=s.host,empty=!!s.empty;
  const bar=host.querySelector('[data-sa-tabs]');
  if(bar)bar.hidden=empty&&!s.explored;
  host.querySelector('[data-sa-full]').hidden=empty;
  const intro=s.slots.intro;
  if(!empty){intro.innerHTML='';return;}
  const todo=toAnalyse(s),n=s.items.length,points=window.VzipScorePointsModel?window.VzipScorePointsModel.active(window.VzipScorePointsModel.points(V.db,s.song.id)).length:0;
  intro.innerHTML='<section class="sa-card sa-empty" data-sa-empty><span class="sa-empty-icon" aria-hidden="true"><i class="ph ph-waveform"></i></span><h2>녹음을 분석하면 여기 보여요</h2>'+
    '<p>처음과 최근 비교, 지표 흐름, 약한 곳이<br>분석한 녹음이 2개 이상이면 나와요.</p>'+
    (todo.length?'<button type="button" class="sa-btn" data-sa-analyse'+(s.reanalyzing?' disabled':'')+'>녹음 '+todo.length+'개 분석하기</button>'
      :n?'<a class="sa-btn" href="#/record?song='+encodeURIComponent(s.song.id)+'">다른 날 한 번 더 녹음하기</a>':'<a class="sa-btn" href="#/record?song='+encodeURIComponent(s.song.id)+'">녹음하러 가기</a>')+
    '<p class="vl-muted" role="status" data-sa-analyse-status></p></section>'+
    '<nav class="sa-card sa-rows" aria-label="이 곡의 다른 곳">'+
    (n?'<button type="button" class="sa-row" data-sa-go="takes"><span><strong>녹음 '+n+'개</strong><small>들어 보기</small></span><i class="ph ph-caret-right" aria-hidden="true"></i></button>':'')+
    (V.listenSession&&n>=2?'<a class="sa-row" href="#/listen?song='+encodeURIComponent(s.song.id)+'" data-sa-listen><span><strong>듣고 고르기</strong><small>두 녹음 중 더 나은 쪽</small></span><i class="ph ph-caret-right" aria-hidden="true"></i></a>':'')+
    '<button type="button" class="sa-row" data-sa-go="weak"><span><strong>레슨 지적</strong><small>이 곡 지적 '+points+'개</small></span><i class="ph ph-caret-right" aria-hidden="true"></i></button></nav>';
  intro.querySelector('[data-sa-analyse]')?.addEventListener('click',()=>analyseMany(s));
  intro.querySelectorAll('[data-sa-go]').forEach(b=>b.onclick=()=>{s.explored=true;setTab(s,b.dataset.saGo,{focus:true});});
}
/** The takes this screen can analyse now (audio the device can open, not analysed yet), oldest first. */
const toAnalyse=s=>audible(s).filter(m=>!analysis(m)).reverse();
/** 녹음 n개 분석하기: the existing on-device analysis of each take, saved as it always is, one after another. */
async function analyseMany(s){
  if(s.reanalyzing)return;
  const todo=toAnalyse(s);
  if(!todo.length)return;
  if(todo.length>5&&!await V.confirm('녹음 '+todo.length+'개 분석','이 기기 안에서 하나씩 분석해요. 비용은 없고, 파일 하나에 보통 10~30초 걸려요.',{ok:'분석 시작'}))return;
  if(s.dead)return;
  s.reanalyzing=true;
  s.host.querySelectorAll('[data-sa-analyse]').forEach(b=>b.disabled=true);
  let done=0,failed=0;
  for(const m of todo){
    if(s.dead)break;
    const note=s.host.querySelector('[data-sa-analyse-status]');
    if(note)note.textContent=(done+failed+1)+'/'+todo.length+' 분석 중 · '+M.label(m);
    try{const r=await V.analyzeRecording(m,{save:true});m.analysis=r.summary;done++;}
    catch{failed++;}
  }
  s.reanalyzing=false;
  if(s.dead)return;
  V.toast(failed?'분석 '+done+'개 완료 · '+failed+'개는 분석하지 못했어요':'녹음 '+done+'개를 분석했어요',failed?'error':undefined);
  s.dirty=true;screen(s);
}
function bindFrame(s){
  const host=s.host;
  watchFold(s,host.querySelector('[data-song-section="deep"]'),'deep',()=>{if(host.querySelector('[data-song-section="deep"]')?.open)sizePlots(host);});
  watchFold(s,host.querySelector('[data-song-fold="detail"]'),'detail');
  // The tabs: a tap, or ← → between them.
  const tabs=[...host.querySelectorAll('[data-sa-tab]')];
  tabs.forEach((b,i)=>{
    b.onclick=()=>setTab(s,b.dataset.saTab);
    b.onkeydown=e=>{if(e.key!=='ArrowLeft'&&e.key!=='ArrowRight')return;e.preventDefault();const t=tabs[(i+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length];setTab(s,t.dataset.saTab,{focus:true});};
  });
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
/** 처음 · 최근 of 처음 vs 최근 (and the hero's 처음 vs 최근 듣기): one player at a time with the timeline's player. */
function stopHero(s){try{s.heroPlayer?.destroy?.();}catch{}s.heroPlayer=null;s.host.querySelector('[data-gsp-player]')?.replaceChildren();s.host.querySelectorAll('[data-gsp-play]').forEach(b=>b.removeAttribute('data-playing'));}
/** Plays one take of the pair under the two take cards; then: the take to play once it ends (처음 → 최근). */
function playPair(s,id,then){
  const box=s.host.querySelector('[data-gsp-player]');
  stopHero(s);
  const item=s.all.find(m=>String(m.id)===String(id));
  if(!item||!box){V.toast('녹음을 찾을 수 없어요. 지워졌거나 다른 기기에만 있어요.','error');return;}
  try{s.player?.el?.pause();}catch{}
  s.heroPlayer=M.player(box,item,{});
  s.host.querySelectorAll('[data-gsp-play]').forEach(b=>{if(b.dataset.gspPlay===String(id))b.setAttribute('data-playing','');});
  if(then){const p=s.heroPlayer;p.el?.addEventListener('ended',()=>{if(!s.dead&&s.heroPlayer===p)playPair(s,then);},{once:true});}
  s.heroPlayer.play?.();
}
function periodHtml(s){
 const chips=PERIOD_CHIPS.concat(/^\d{4}-\d{2}$/.test(s.period)?[[s.period,s.period.slice(0,4)+'년 '+Number(s.period.slice(5,7))+'월']]:[]);
 return '<div class="gsp-period" role="group" aria-label="기간" data-gsp-periods>'+chips.map(([k,label])=>'<button type="button" data-gsp-period="'+esc(k)+'" aria-pressed="'+(s.period===k)+'">'+esc(label)+'</button>').join('')+'</div>';
}
function paintHero(s){
  const parts=V.growthSongParts;
  s.slots.periods.innerHTML=periodHtml(s);
  if(!parts){s.slots.hero.innerHTML='';return;}
  const takes=s.items.map(m=>({m,date:M.dateOf(m),analysed:!!analysis(m)}));
  s.slots.hero.innerHTML=parts.heroHtml(s.song,s.hero,takes,{empty:s.empty,toAnalyse:toAnalyse(s).length});
  s.slots.hero.querySelector('[data-gsp-pair]')?.addEventListener('click',e=>{
    const b=e.currentTarget;
    setTab(s,'flow');
    playPair(s,b.dataset.first,b.dataset.last);
    s.host.querySelector('[data-song-section="changes"]')?.scrollIntoView({block:'nearest'});
  });
  s.slots.hero.querySelector('[data-sa-analyse]')?.addEventListener('click',()=>analyseMany(s));
  s.slots.periods.querySelectorAll('[data-gsp-period]').forEach(b=>b.onclick=()=>{
    if(b.dataset.gspPeriod===s.period)return;
    s.period=b.dataset.gspPeriod;
    paintVerdict(s);
    s.slots.periods.querySelector('[data-gsp-period="'+CSS.escape(s.period)+'"]')?.focus({preventScroll:true});
  });
}
/** The chosen tile of 지표 흐름. */
function paintMetrics(s){
  s.slots.metrics.innerHTML=metricsHtml(s);
  s.slots.metrics.querySelectorAll('[data-sa-metric]').forEach(b=>b.onclick=()=>{s.flowMetric=b.dataset.saMetric;paintMetrics(s);s.slots.metrics.querySelector('[data-sa-metric="'+CSS.escape(s.flowMetric)+'"]')?.focus({preventScroll:true});});
}
/** 기간 · 한마디, 처음 vs 최근, 파사지오 참고, 들어 본 평가 and the tools of 깊이 보기 that read the verdict (다시 분석 ·
 * AI 해석): drawn when a take, an analysis, the switch or the chip changed (s.dirty). */
function paintVerdict(s){
  verdictOf(s);
  s.hero=heroData(s);
  const box=s.slots.verdict;
  stopHero(s);
  box.innerHTML=verdictHtml(s);
  paintHero(s);
  const p=periodOf(s);
  s.slots.detail.innerHTML=detailHtml(s);
  paintMetrics(s);
  s.slots.pass.innerHTML=weakHtml(s);
  if(V.growthSongParts)s.slots.heard.innerHTML=V.growthSongParts.heardHtml(s.song,s.v?.now?.state||'');
  box.querySelectorAll('[data-gsp-play]').forEach(b=>b.onclick=()=>{if(b.hasAttribute('data-playing')){stopHero(s);return;}playPair(s,b.dataset.gspPlay);});
  const gc=s.slots.detail.querySelector('[data-growth-changes]');
  if(gc)window.VzipGrowthChangesUI.mount(gc,s.all,{songId:s.song.id,practice:s.practice,head:false,...(p?{period:{from:p.from,to:p.to}}:{}),
    empty:{verdicts:'이 곡에 남긴 들어 본 평가가 아직 없어요. 녹음별 › 두 녹음 비교에서 가리고 듣고 남길 수 있어요.',songs:p?p.label+'에 그 전 녹음과 견줄 이 곡 녹음이 없어요.':'같은 방법으로 잰 이 곡 녹음이 다른 날 두 개 이상 모이면 처음과 최근을 견줘 보여 드려요.'}});
  const sw=box.querySelector('[data-song-practice]');
  sw.onchange=()=>{s.practice=sw.checked;V.growthSong?.setPractice(s.practice);s.dirty=true;screen(s);s.slots.verdict.querySelector('[data-song-practice]')?.focus({preventScroll:true});};
  const tools=s.host;
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
      const note=s.host.querySelector('[data-growth-reanalyze-status]')||status;
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
/** 녹음별: the song's recordings as date pills (the one playing filled; the others that are open light; 처음 · 최근 of the
 * verdict marked; a dot for the analysed ones), the player card of the active one with 내 만족도, then 이 녹음 분석 with
 * 처음 녹음과 비교 and 구간 자세히 (이 녹음 자세히, opened when a date is tapped). */
function takesHtml(s,m){
  const v=s.v?.now,mark=id=>id===v?.firstId?'처음':id===v?.lastId?'최근':'';
  const chips='<div class="vl-select"><div class="vl-dates" role="group" aria-label="녹음 타임라인 · 누르면 그 녹음을 들어요" data-song-timeline>'+s.items.map(x=>'<button type="button" data-date="'+esc(x.id)+'" aria-pressed="'+s.selected.includes(x.id)+'"'+(x.id===s.active?' data-active':'')+(analysis(x)?' data-analysed':'')+(mark(x.id)?' data-pair="'+mark(x.id)+'"':'')+'><i class="vl-dot-mark" aria-hidden="true"></i>'+esc(day(x)||'날짜 없음')+(s.items.filter(y=>day(y)===day(x)).length>1?' · '+(s.items.filter(y=>day(y)===day(x)).findIndex(y=>y.id===x.id)+1):'')+
      // 연습: a 연습실·트레이닝 연습 recording (counted only with 연습 녹음 포함). 영상: a video.
      (s.kinds?.get(x.id)||[]).map(k=>' <small class="vl-kind" data-lab-kind>'+k+'</small>').join('')+'</button>').join('')+'</div></div>';
  if(!m)return chips+'<div class="vl-empty sa-card">'+(s.items.length?'날짜를 골라 주세요<br><small>고른 녹음의 플레이어와 분석이 여기에 나와요.</small>':'이 곡에 연결된 녹음이 없어요<br><a href="#/record?song='+encodeURIComponent(s.song.id)+'">녹음하러 가기</a>')+'</div>';
  return chips+'<div class="vl-carousel" data-carousel aria-label="고른 녹음 플레이어, 좌우로 넘기기">'+playerCard(s,m)+'</div>'+analysisCard(s,m);
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
/** The trend chart scrolls sideways: show the active (or newest) point, not the oldest. */
function centreTrend(s){
  const plotScroll=s.host.querySelector('.vl-plot-scroll');
  if(!plotScroll||!plotScroll.clientWidth)return;
  const dot=plotScroll.querySelector('.vl-plot-dates [data-point="'+CSS.escape(String(s.active))+'"]')||plotScroll.querySelector('.vl-plot-dates [data-point]:last-child');
  if(dot){const box=dot.getBoundingClientRect();plotScroll.scrollLeft=Math.max(0,box.left+box.width/2-plotScroll.getBoundingClientRect().left+plotScroll.scrollLeft-plotScroll.clientWidth/2);}
}
/** The date pills scroll sideways: the one playing in view (measured only while 녹음별 shows). */
function centreTimeline(s){
  const T=s.slots?.takes,strip=T?.querySelector('.vl-dates'),chip=s.active&&T?.querySelector('[data-date="'+CSS.escape(String(s.active))+'"]');
  if(!strip||!chip||!strip.clientWidth)return;
  const a=strip.getBoundingClientRect(),c=chip.getBoundingClientRect();
  if(c.left<a.left)strip.scrollLeft+=c.left-a.left-8;else if(c.right>a.right)strip.scrollLeft+=c.right-a.right+8;
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
  // Fewer than two analysed takes: one card instead of the tabs' empty boxes (paintEmpty).
  const empty=s.items.filter(x=>analysis(x)).length<2;
  if(empty!==s.empty){s.empty=empty;s.dirty=true;}
  if(s.dirty){s.dirty=false;paintVerdict(s);}
  if(!s.tabShown){s.tabShown=true;setTab(s,s.tab,{url:false});}else paintEmpty(s);
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
  const centrePlot=()=>centreTrend(s);
  centrePlot();
  centreTimeline(s);
  if(window.ResizeObserver){s.plotObserver=new ResizeObserver(()=>sizePlots(host));host.querySelectorAll('.vl-plot').forEach(svg=>s.plotObserver.observe(svg));}
  if(document.scrollingElement)document.scrollingElement.scrollTop=scrollTop;
  // The folds stay as the person left them through a redraw; a chart is measured once its fold is open.
  [T,s.slots.trend].forEach(box=>box.querySelectorAll('[data-song-fold]').forEach(d=>watchFold(s,d,d.dataset.songFold,()=>{
    if(d.dataset.songFold==='take')T.querySelector('[data-sa-take-detail]')?.setAttribute('aria-expanded',String(d.open));
    if(d.open&&d.isConnected){sizePlots(host);centrePlot();}})));
  // 구간 자세히 opens and closes 이 녹음 자세히 (its own summary is not shown: the button is the way in).
  T.querySelector('[data-sa-take-detail]')?.addEventListener('click',()=>{const d=T.querySelector('[data-song-fold="take"]');if(!d)return;d.open=!d.open;if(d.open)setTimeout(()=>{if(d.isConnected)d.scrollIntoView({block:'nearest',behavior:'smooth'});},0);});
  // 처음 녹음과 비교: this take beside the song's first recording (the latest, when this is the first) in 두 녹음 비교, its
  // 측정값 나란히 보기 open.
  T.querySelector('[data-sa-compare-first]')?.addEventListener('click',()=>{
    const first=s.items[0],isFirst=first?.id===s.active,other=isFirst?s.items.at(-1):first;
    if(!other||other.id===s.active)return;
    s.compareA=isFirst?s.active:first.id;s.compareB=isFirst?other.id:s.active;s.compareOpen=true;
    if(!s.selected.includes(other.id))s.selected=s.items.filter(x=>s.selected.includes(x.id)||x.id===other.id).map(x=>x.id);
    screen(s);
    if(!s.dead)s.host.querySelector('[data-song-section="compare"]')?.scrollIntoView({block:'start',behavior:'smooth'});
  });
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
  // 약한 구간 반복 듣기: the take's chosen section (구간 자세히) on repeat, in the player of 녹음별.
  host.querySelector('[data-repeat-practice]').onclick=()=>{s.loop=true;T.querySelector('[data-loop]').setAttribute('aria-pressed','true');setTab(s,'takes');player.seek(s.start[m.id]||0);player.play();T.querySelector('[data-carousel]')?.scrollIntoView({block:'nearest'});};
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
V.route('growth-song',{title:'곡 분석',back:true,tab:'growth',noAutoRefresh:true,
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
    // The tab: ?tab= in the address, else the one a link asks for (?compare=1 · ?a= · ?selection= · ?report= → 녹음별,
    // a pair ?a=&b= · ?jump=<section> → that section's tab), else the one chosen last while the app is open.
    const jump=r.query.get('jump'),compareOpen=r.query.get('compare')==='1';
    const asked=r.query.get('tab'),tab=TABS.some(([k])=>k===asked)?asked:compareOpen||one||chosen||pair.length===2?'takes':TAB_OF[jump]||lastTab;
    current={all,practice:!!V.growthSong?.practice(),period:periodFromQuery(r.query),heroPlayer:null,open:chosen?{trend:true}:one?{take:true}:{},slots:null,dirty:true,host,song,items,kinds,aiTips,selected,active:one||(selected.includes(report?.activeId)?report.activeId:selected.at(-1)||null),metric:report?.metric||'wob',flowMetric:'intonation',tab,explored:!!asked||compareOpen||!!one||chosen||!!jump||pair.length===2,results:new Map(),start:{},loop:false,dead:false,player:null,compareOpen,compareA:r.query.get('a'),compareB:r.query.get('b')};
    screen(current);
    // 비교 메모·보관함 links (?compare=1) open at 두 녹음 비교.
    if(current.compareOpen)host.querySelector('[data-song-section="compare"]')?.scrollIntoView({block:'start'});
    // ?a=<take>: at the timeline, that take open.
    if(one)setTimeout(()=>{if(live()===current)host.querySelector('[data-song-section="takes"]')?.scrollIntoView({block:'start'});},400);
    // ?jump=<section> (성장 › 곡 하나 › 구간별로 보기): open at that part of the screen, in its tab.
    if(jump)setTimeout(()=>{if(live()===current)host.querySelector('[data-song-section="'+jump+'"]')?.scrollIntoView({block:'start'});},400);
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
