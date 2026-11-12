/* A song's recordings, measured with the existing on-device analyzer. No demo values are shown. */
(() => {
'use strict';
const V = window.VZ, M = V?.media, esc = V?.esc;
if (!V || !M) return;
const METRICS = [
  {key:'wob',label:'지속음 흔들림',unit:'cent',get:a=>a?.metrics?.stability?.wobbleCents,fmt:v=>'±'+v+' cent',better:-1,tolerance:.5,guide:'지속해서 낸 소리의 음높이 흔들림입니다. 낮을수록 안정적이에요. 같은 조건의 녹음끼리 비교하세요.'},
  {key:'into',label:'음정 오차',unit:'cent',get:a=>a?.metrics?.intonation?.meanAbsCents,fmt:v=>'±'+v+' cent',better:-1,tolerance:.5,guide:'가장 가까운 반음과의 평균 편차입니다. 악보의 정답 음정과 비교한 정확도는 아니에요. 같은 곡·구간에서 비교하는 것이 좋아요.'},
  {key:'high',label:'유효 최고음',unit:'',get:a=>a?.v>=2?a?.metrics?.range?.validHigh?.cents:null,fmt:(v,a)=>a?.metrics?.range?.validHigh?.note||'—',better:0,tolerance:50,guide:'0.2초 이상 지속되고 신뢰도·연속성 조건을 충족한 음입니다. 순간 최고음은 성장 평가에 쓰지 않아요.'},
  {key:'stable',label:'안정 최고음',unit:'',get:a=>a?.v>=2?a?.metrics?.range?.stableHigh?.cents:null,fmt:(v,a)=>a?.metrics?.range?.stableHigh?.note||'—',better:0,tolerance:50,guide:'0.5초 이상 지속되고 흔들림·신뢰도 조건을 충족한 음입니다. 실력의 좋고 나쁨을 단정하지 않아요.'},
  {key:'phr',label:'프레이즈 길이',unit:'초',get:a=>a?.metrics?.breath?.medianPhrase,fmt:v=>v+'초',better:1,tolerance:.2,guide:'한 구절을 이어 부른 시간의 중앙값입니다. 같은 구절과 템포라면 길어진 것이 긍정적일 수 있지만, 무조건 길수록 좋은 것은 아니에요.'},
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
 if(!metric.better)return '이전 대비 '+(diff>0?'상승 ':'하락 ')+amount+' cent · 좋고 나쁨은 판단하지 않아요';
 return '이전보다 '+(diff>0?'증가 ':'감소 ')+amount+(metric.unit?' '+metric.unit:'')+' · '+(metricColor(metric,previous,current)==='good'?'좋아진 방향':'아쉬운 방향');
};
const speedStore = window.VzipAccountScope?.storage || localStorage;
const speedKey = 'vzip_vocal_lab_rates_v1';
const rates = () => { try { return JSON.parse(speedStore.getItem(speedKey)) || {}; } catch { return {}; } };
const time = s => V.clock(Math.max(0,s||0));
const day = m => (M.dateOf(m)||'').slice(5).replace('-','.');
const valid = n => n == null || n === '' ? null : Number.isFinite(Number(n)) ? Number(n) : null;
const analysis = m => m.analysis?.metrics ? m.analysis : null;
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
    ? '#/vocal-lab/'+encodeURIComponent(songs[0])+'?selection=1'
    : '#/vocal-lab?selection=1');
  return true;
};
let current = null, instance = 0;
const clean = () => { current?.player?.destroy(); if (current) current.dead = true; current = null; instance++; };
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
    return '<g role="button" tabindex="0" data-point="'+esc(rows[i].id)+'" aria-label="'+esc(rows[i].label+' 상세 보기')+'"><circle class="vl-hit" cx="'+cx+'" cy="'+cy+'" r="19"/><circle class="'+cls+'" cx="'+cx+'" cy="'+cy+'" r="'+(i===highlighted?6:5)+'"/></g>';
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
// All comparisons use measured summaries from chronological recordings only.
// The instant overview is factual; optional AI wording never replaces the evidence.
const growthMetric=(metric,s)=>{
 const rows=trendRows(s,metric).filter(x=>V.analysisReliable(analysis(x.m)));
 if(rows.length<2)return null;
 const first=rows[0],last=rows.at(-1),delta=last.value-first.value;
 if(!V.analysisComparable(analysis(first.m),analysis(last.m)))return null;
 const tolerance=metric.tolerance??.5;
 const tone=metricColor(metric,first.value,last.value);
 return {metric,first,last,delta,tone,count:rows.length,
  formatted:metric.fmt(first.value,analysis(first.m))+' → '+metric.fmt(last.value,analysis(last.m)),
  changed:Math.abs(delta)>tolerance};
};
const labGrowthId=s=>'vocal-growth-ai:'+s.song.id+':'+s.selected.slice().sort().join(',');
const savedGrowthReport=s=>(V.db.practicePlans||[]).find(x=>x.id===labGrowthId(s)&&x.period==='vocal-growth-ai'&&x.evidenceKey===growthEvidenceKey(s));
function growthEvidenceKey(s){
 return s.selected.map(id=>{
  const m=s.items.find(x=>x.id===id),a=m&&analysis(m);
  return id+':'+(a?.at||0)+':'+(m?.rating??'');
 }).join('|');
}
function growthReport(s){
 const data=METRICS.map(metric=>growthMetric(metric,s)).filter(Boolean);
 const analyzed=s.selected.map(id=>s.items.find(m=>m.id===id)).filter(m=>m&&V.analysisReliable(analysis(m)));
 const saved=savedGrowthReport(s);
 const badge=(tone)=>tone==='good'?'좋아진 방향':tone==='bad'?'주의할 변화':'참고할 변화';
 const describe=x=>{
   const metric=x.metric,delta=x.delta,amount=Math.abs(delta).toFixed(metric.key==='rating'?0:1);
   if(metric.key==='high'||metric.key==='stable'){
     const from=metric.fmt(x.first.value,analysis(x.first.m)),to=metric.fmt(x.last.value,analysis(x.last.m));
     return metric.label+' '+from+' → '+to+(x.changed?' ('+(delta>0?'상승':'하락')+' 약 '+Math.abs(Math.round(x.last.value/100)-Math.round(x.first.value/100))+'반음)':' (비슷함)')+' · 도달한 최고음이 곧 안정된 가창 음역이라는 뜻은 아니에요.';
   }
   if(metric.key==='phr')return '프레이즈 '+x.formatted+(x.changed?' · '+(delta>0?'길어짐':'짧아짐'):' · 큰 변화 없음')+' (곡 구성·템포에 따라 달라질 수 있어요).';
   if(metric.key==='rating')return '내 만족도 '+x.formatted+' · 직접 기록한 체감 평가예요.';
   return metric.label+' '+x.formatted+(x.changed?' · '+(delta>0?'증가':'감소')+' '+amount+' '+metric.unit:' · 비슷한 수준');
 };
 const strong=data.filter(x=>x.tone==='good'&&x.changed);
 const weak=data.filter(x=>x.tone==='bad'&&x.changed);
 const neutral=data.filter(x=>x.tone==='neutral'||!x.changed);
 const title=data.length>=2?'처음과 최근 측정값을 비교했어요':'비교할 분석 기록이 더 필요해요';
 const row=x=>'<li class="vl-growth-row '+x.tone+'"><span class="vl-growth-indicator" aria-hidden="true"></span><div><strong>'+esc(x.metric.label)+'</strong><p>'+esc(describe(x))+'</p></div></li>';
 const section=(heading,rows,cls)=>rows.length?'<div class="vl-growth-group"><h3 class="'+cls+'">'+heading+' <span>'+rows.length+'</span></h3><ul>'+rows.map(row).join('')+'</ul></div>':'';
 return '<section class="vl-section vl-growth" data-growth-report aria-label="AI 종합 성장 리포트"><div class="vl-divider"></div>'+
  '<div class="vl-growth-top"><div><span class="vl-growth-kicker"><i class="ph ph-sparkle" aria-hidden="true"></i> 성장 분석</span><h2>AI 종합 리포트</h2></div><span class="vl-growth-count">'+analyzed.length+'개 분석 기준</span></div>'+
  '<p class="vl-growth-intro">'+esc(title)+' <small>같은 곡·같은 분석 버전의 녹음을 비교해요. 동일 구간을 지정한 A/B 비교를 우선 확인하세요.</small></p>'+
  (data.length?section('좋아진 부분',strong,'good')+section('아쉬워진 부분',weak,'bad')+section('음역·참고 지표',neutral,'neutral')+
    '<p class="vl-growth-caution">최고음의 상승·하락은 곡의 구간·발성 방식에 따라 달라지며, 음성 측정값만으로 실력 향상이나 악화를 단정하지 않아요.</p>'+
    '<div class="vl-growth-ai"><div class="vl-growth-ai-head"><strong>AI 해석</strong><button type="button" data-growth-ai '+(s.growthPending?'disabled':'')+'>'+(saved?'다시 생성':'AI로 종합 해석')+'</button></div>'+
    '<p class="vl-growth-ai-status" data-growth-ai-status role="status">'+(s.growthPending?'AI가 측정 기록을 해석하고 있어요…':saved?'선택한 녹음의 AI 해석을 저장해 두었어요.':'측정값을 바탕으로 좋아진 점·아쉬운 점과 다음 연습 방향을 종합해요.')+'</p>'+
    (saved?'<div class="vl-growth-ai-text">'+esc(saved.text)+'</div>':'<div class="vl-growth-ai-text" data-growth-ai-result hidden></div>')+'</div>':
    '<p class="vl-muted">분석 신뢰도가 충분한 녹음이 두 개 이상 있어야 비교할 수 있어요. 선택한 녹음들의 분석을 먼저 완료해 주세요.</p>')+
    '</section>';
}
function trendRows(s,metric){
 return s.selected.map(id=>s.items.find(m=>m.id===id)).filter(Boolean)
  .map(m=>({m,value:valid(metric.get(analysis(m),m))}))
  .filter(x=>x.value!=null)
  .sort((a,b)=>(M.dateOf(a.m)||'').localeCompare(M.dateOf(b.m)||'')||(Number(a.m.created)||0)-(Number(b.m.created)||0)||String(a.m.id).localeCompare(String(b.m.id)));
}
function trend(s) {
 const metric=METRICS.find(x=>x.key===s.metric)||METRICS[0],measured=trendRows(s,metric);
 const series=measured.map((x,i)=>({id:x.m.id,value:x.value,label:day(x.m),tone:metric.key==='rating'||V.analysisComparable(analysis(measured[i-1]?.m||{}),analysis(x.m))?metricColor(metric,measured[i-1]?.value,x.value):'neutral'}));
 const last=measured.at(-1),prev=measured.at(-2);
 const state=last&&(metric.key==='rating'||V.analysisComparable(analysis(prev?.m||{}),analysis(last.m)))?metricColor(metric,prev?.value,last.value):'neutral';
 const explanation=last&&prev&&!V.analysisComparable(analysis(prev.m),analysis(last.m))?'판정 보류 · 신뢰도/분석 버전 확인':last?metricChangeText(metric,prev?.value,last.value):'분석된 값이 없어요';
 return '<section class="vl-section vl-trend"><div class="vl-divider"></div><h2>녹음별 변화</h2><div class="vl-metrics" role="group" aria-label="변화 지표">'+METRICS.map(x=>'<button type="button" data-metric="'+x.key+'" aria-pressed="'+(s.metric===x.key)+'">'+x.label+'</button>').join('')+'</div>'+
  '<p class="vl-metric-guide"><strong>'+esc(metric.label)+' · '+esc(metric.better===-1?'낮을수록 좋아요':metric.better===1?'대체로 높을수록 좋아요':'높낮이만으로 판단하지 않아요')+'</strong><span>'+esc(metric.guide)+'</span></p>'+
  (last?'<p class="vl-change '+state+'" role="status">'+esc('최근 변화 · '+explanation)+'</p>':'')+
  '<p class="vl-legend"><span class="good">● 좋아진 방향</span><span class="bad">● 아쉬운 방향</span><span class="neutral">● 비슷함·판단 보류</span></p>'+
  (measured.length?'<div class="vl-plot-scroll" tabindex="0" role="region" aria-label="녹음별 변화 그래프, 좌우로 스크롤 가능"><div class="vl-plot-track" style="--vl-points:'+measured.length+'">'+plot(series,{highlighted:measured.findIndex(x=>x.m.id===s.active),interactive:true})+'<div class="vl-plot-dates">'+measured.map(x=>'<button type="button" data-point="'+esc(x.m.id)+'" aria-label="'+esc(day(x.m)+' '+metric.label+' '+metric.fmt(x.value,analysis(x.m))+' 상세 보기')+'">'+esc(day(x.m))+'</button>').join('')+'</div></div></div>':'<p class="vl-muted">분석된 녹음이 없어요. 녹음을 선택해 분석을 시작해 주세요.</p>')+
  (measured.length?'<p class="vl-muted">그래프의 점이나 날짜를 누르면 해당 녹음의 상세 팝업을 볼 수 있어요. 색상은 이전 녹음과의 비교이며 첫 점은 중립이에요.</p>':'')+'</section>';
}
function single(s,m) {
  const a=analysis(m);
  return '<section class="vl-section vl-single"><div class="vl-divider"></div><h2>'+esc(day(m))+' 분석 관찰</h2>'+
    (!a?'<p class="vl-muted">이 녹음의 분석 결과가 아직 없어요. 위의 구간 분석을 시작해 주세요.</p>':'<div class="vl-metric-grid">'+METRICS.filter(x=>x.key!=='rating').map(metric=>{
      const v=metric.get(a,m), count=metric.key==='wob'?a.metrics.stability?.notes:metric.key==='into'?a.metrics.intonation?.notes:null;
      return '<div class="vl-stat"><span>'+metric.label+'</span><strong>'+esc(v==null?'측정 안 됨':metric.fmt(v,a))+'</strong><div class="vl-stat-visual" aria-hidden="true"><span style="width:'+Math.min(94,Math.max(8,(Number(v)||0)/(metric.key==='high'?10000:metric.key==='phr'?12:50)*100))+'%"></span></div>'+(count?'<small>측정한 음 '+count+'개</small>':'')+'</div>';
    }).join('')+'</div>')+'</section>';
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
 const ordered=trendRows(s,metric),idx=ordered.findIndex(x=>x.m.id===m.id);
 const first=ordered[0],baseline=first?.m.id!==m.id?first:null;
 const comparable=metric.key==='rating'||V.analysisComparable(analysis(baseline?.m||{}),analysis(m));
 const initial=comparable?(baseline?.value??null):null,difference=initial!=null&&current!=null?current-initial:null;
 const improved=baseline&&comparable?metricColor(metric,initial,current):'neutral';
 const safe=value=>esc(String(value??''));
 const title='분석 관찰';
 const explanation=()=>{
  if(current==null)return '이 녹음에서 해당 측정값을 확인하지 못했어요.';
  if(baseline&&!comparable)return '판정 보류 · 신뢰도와 분석 버전을 확인해 주세요.';
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
     el.querySelector('[data-observe-loading]').textContent='녹음 곡선을 가져오지 못했어요: '+String(error?.message||error);
   });
  }});
}
function makeSegment(s,m) {
  const total=Math.max(0,Number(m.durationSeconds)||0), start=s.start[m.id]??0, end=Math.min(total,start+16), full=s.results.get(m.id);
  const slice=full?.curve?.map((v,i)=>({t:i/full.fps,value:v==null?null:((v%100)+150)%100-50})).filter(p=>p.t>=start&&p.t<=end&&p.value!=null)||[];
  const sampled=slice.filter((_,i)=>i%Math.max(1,Math.ceil(slice.length/25))===0);
  return (m.analysis?.v===1?'<p class="vl-muted">이전 v1 결과를 보존하고 있어요. 아래 분석 버튼으로 v2 유효·안정 최고음을 다시 확인하세요.</p>':'')+'<section class="vl-section vl-segment"><h2>구간 분석 <span>'+time(start)+'–'+time(end)+'</span></h2><div class="vl-measure"><span>지속음 흔들림 <small>전체 녹음 기준</small></span><strong>'+esc(analysis(m)?.metrics?.stability?.wobbleCents==null?'분석 전':'±'+analysis(m).metrics.stability.wobbleCents+' cent')+'</strong></div>'+
    '<div class="vl-ruler" aria-hidden="true"><span>−50</span><i></i><span>0</span><i></i><span>+50</span></div>'+
    (full?(sampled.length?'<div class="vl-segment-chart"><div class="vl-chart-heading">선택 구간의 음정 편차 (cent)</div>'+plot(sampled.map(x=>({value:x.value,label:time(x.t)})),{height:115})+'</div>':'<p class="vl-muted">이 구간에서 목소리를 측정하지 못했어요.</p>'):'<button type="button" class="vl-analyze" data-analyze>이 구간 그래프 보기 <i class="ph ph-arrow-right"></i></button>')+
    '<label class="vl-range-label">분석할 구간 이동<input type="range" min="0" max="'+Math.max(0,Math.floor(total-16))+'" value="'+Math.min(start,Math.max(0,Math.floor(total-16)))+'" data-start aria-label="구간 시작 위치"></label><p class="vl-muted" data-analyze-status aria-live="polite">'+(full?'파형과 수치는 실제 녹음 분석 결과예요.':'그래프는 이 녹음을 분석하면 표시돼요.')+'</p></section>';
}
function recommendations(s) {
  const result=V.practiceTips(s.items,{songId:s.song.id});
  if (!result.enough) return {count:result.count, tips:[]};
  const tips=result.tips.length?result.tips.slice(0,2):[{
    key:'maintain', name:'롱톤 유지 연습', metric:'유지 연습', value:'',
    reason:'최근 측정값이 고르게 안정적이에요.', goal:'편안한 음역에서 일정한 소리 유지', minutes:5,
    steps:['편한 음역에서 롱톤 5초씩 5회','같은 세기와 편안한 호흡으로 유지']
  }];
  return {count:result.count,tips};
}
function tipCard(t,songId){return '<details '+(t.aiRef?'open ':'')+'class="vl-tip" data-tip="'+esc(t.key)+'"><summary><span><strong>'+esc(t.name)+'</strong><small>'+esc(t.metric+(t.value?' · '+t.value:''))+'</small></span><i class="ph ph-caret-down" aria-hidden="true"></i></summary><div class="vl-tip-detail"><p>'+esc(t.reason)+'</p><ol>'+t.steps.map(step=>'<li>'+esc(step)+'</li>').join('')+'</ol><p class="vl-tip-goal">목표: '+esc(t.goal)+' · 권장 '+t.minutes+'분</p><div class="vl-tip-actions"><a href="#/guided-practice/'+(t.aiRef?'ai:'+esc(t.aiRef):'analysis:'+esc(t.key))+'?song='+encodeURIComponent(songId)+'">따라 하기</a><button type="button" data-practice-tip="'+esc(t.key)+'">연습 기록에 담기</button></div></div></details>';}
const aiContext=s=>String(s.active)+':'+(s.start[s.active]||0);
const savedAITip=s=>s.aiTips?.get(aiContext(s))||[...(s.aiTips||new Map())].reverse().find(([key])=>key.startsWith(String(s.active)+':'))?.[1];
function recommendationList(recs,songId,aiTip=null) {
  const items=recs.tips.map(t=>tipCard(t,songId)).join('');
  return '<section class="vl-section vl-recommend"><h2>추천 연습</h2>'+
    (items?'<div class="vl-tip-list">'+items+'</div>':'<p class="vl-muted">이 곡의 신뢰할 수 있는 분석 녹음이 3개 이상 모이면 맞춤 연습 목록이 나와요. 현재 '+recs.count+'개예요.</p>')+
    '<div class="vl-tip-list" data-ai-tip>'+(aiTip?tipCard(aiTip,songId):'')+'</div><button type="button" class="vl-repeat-practice" data-repeat-practice>이 구간 반복 듣기</button><button type="button" class="vl-repeat-practice" data-ai-exercise>다른 연습 하나 AI 추천받기</button><p class="vl-muted" data-ai-status role="status">기록을 바탕으로 기존 목록에 없는 연습 한 가지를 추천해요.</p></section>';
}
function comparePanel(s) {
  if(s.selected.length<2)return '';
  const picked=s.selected.map(id=>s.items.find(m=>m.id===id)).filter(Boolean);
  const first=picked[0], last=picked.at(-1);
  const a=s.items.find(m=>m.id===s.compareA)||first, b=s.items.find(m=>m.id===s.compareB)||last;
  const saved=(V.db.comparisonReports||[]).find(x=>x.kind!=='vocal-lab'&&x.firstId===a.id&&x.secondId===b.id);
  const options=selected=>picked.map(m=>'<option value="'+esc(m.id)+'"'+(m.id===selected.id?' selected':'')+'>'+esc(day(m)+' · '+M.label(m))+'</option>').join('');
  return '<section class="vl-section vl-compare"><details data-compare-panel'+(s.compareOpen?' open':'')+'><summary>두 녹음 자세히 비교 <i class="ph ph-caret-down" aria-hidden="true"></i></summary><div class="vl-compare-body"><p class="vl-muted">A/B를 누르면 재생 위치를 유지한 채 해당 녹음으로 전환해요.</p><div class="vl-compare-picks"><label>A 녹음<select data-compare-a>'+options(a)+'</select></label><label>B 녹음<select data-compare-b>'+options(b)+'</select></label></div><div class="vl-compare-actions"><button type="button" data-compare-switch>같은 위치에서 '+(s.active===a.id?'B':'A')+' 듣기</button><button type="button" data-compare-first>첫 녹음 ↔ 최근 녹음</button></div>'+
    (V.measureTable?.(a,b)||'<p class="vl-muted">두 녹음의 측정 결과가 있으면 비교표가 나타나요.</p>')+
    '<form data-compare-form><label>달라진 점<textarea name="notes" maxlength="5000" placeholder="직접 느낀 변화를 적어주세요">'+esc(saved?.notes||'')+'</textarea></label><label>다음 연습 목표<textarea name="goal" maxlength="3000">'+esc(saved?.goal||'')+'</textarea></label><div class="vl-compare-actions"><button type="button" data-compare-ai>메모 AI 정리</button><button type="submit">비교 메모 저장</button></div><p class="vl-muted" data-compare-output aria-live="polite"></p></form></div></details></section>';
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
function screen(s) {
  const host=s.host, m=s.items.find(x=>x.id===s.active);
  const scrollTop=document.scrollingElement?.scrollTop??0;
  const recs=m?recommendations(s):null;
  s.player?.destroy(); s.player=null;
  s.plotObserver?.disconnect(); s.plotObserver=null;
  host.innerHTML='<div class="vl-song"><i class="ph ph-waveform" aria-hidden="true"></i><strong>'+esc(s.song.title)+'</strong></div><div class="vl-select"><span>녹음 날짜</span><div class="vl-dates" role="group" aria-label="분석할 녹음 날짜">'+s.items.map((x,i)=>'<button type="button" data-date="'+esc(x.id)+'" aria-pressed="'+s.selected.includes(x.id)+'">'+esc(day(x)||'날짜 없음')+(s.items.filter(y=>day(y)===day(x)).length>1?' · '+(s.items.filter(y=>day(y)===day(x)).findIndex(y=>y.id===x.id)+1):'')+'</button>').join('')+'</div></div>'+
    (!m?'<div class="vl-empty">'+(s.items.length?'날짜를 선택해 주세요<br><small>선택한 녹음의 플레이어와 분석이 여기에 나타나요.</small>':'이 곡에 연결된 녹음이 없어요<br><a href="#/record?song='+encodeURIComponent(s.song.id)+'">녹음하러 가기</a>')+'</div>':'<div class="vl-carousel" data-carousel aria-label="선택한 녹음 플레이어, 좌우로 넘기기">'+playerCard(s,m)+'</div>'+(s.selected.length>1?'<div class="vl-swipe-guide" aria-hidden="true"><i class="ph ph-arrow-left"></i><span>이전 녹음</span><span class="vl-swipe-track"><b style="width:'+(((s.selected.indexOf(s.active)+1)/s.selected.length)*100)+'%"></b></span><span>최근 녹음</span><i class="ph ph-arrow-right"></i></div>':'')+makeSegment(s,m)+(s.selected.length>1?trend(s)+growthReport(s):single(s,m))+
      '<section class="vl-section vl-rating"><span>내 만족도 · '+esc(day(m))+'</span><div class="vl-stars" role="group" aria-label="만족도">'+[1,2,3,4,5].map(n=>'<button type="button" data-rating="'+n+'" aria-pressed="'+(n<=Number(m.rating||0))+'" aria-label="'+n+'점">★</button>').join('')+'</div><b>'+(m.rating?m.rating+'/5':'—')+'</b></section>'+
      comparePanel(s)+recommendationList(recs,s.song.id,savedAITip(s))+
      '<div class="vl-save"><span>이 분석을 남겨둘까요?</span><button type="button" data-save-report>리포트 저장</button></div>');
  sizePlots(host);
  if(window.ResizeObserver){s.plotObserver=new ResizeObserver(()=>sizePlots(host));host.querySelectorAll('.vl-plot').forEach(svg=>s.plotObserver.observe(svg));}
  if(document.scrollingElement)document.scrollingElement.scrollTop=scrollTop;
  host.querySelectorAll('[data-date]').forEach(b=>b.onclick=()=>{
    const id=b.dataset.date;
    if(s.selected.includes(id))s.selected=s.selected.filter(x=>x!==id); else s.selected=s.items.filter(x=>s.selected.includes(x.id)||x.id===id).map(x=>x.id);
    if(!s.selected.includes(s.active))s.active=s.selected.at(-1)||null;
    if(!s.active)s.active=id===s.active?null:s.selected.at(-1)||null;
    if(s.selected.includes(id))s.active=id;
    screen(s);
  });
  if(!m)return;
  const dateStrip=host.querySelector('.vl-dates'), activeDate=host.querySelector('[data-date="'+CSS.escape(m.id)+'"]');
  if(activeDate){const strip=dateStrip.getBoundingClientRect(), chip=activeDate.getBoundingClientRect();if(chip.left<strip.left)dateStrip.scrollLeft+=chip.left-strip.left;else if(chip.right>strip.right)dateStrip.scrollLeft+=chip.right-strip.right;}
  const carrier=host.querySelector('[data-carousel]'), player=M.player(host.querySelector('[data-player]'),m,{prefetch:true}); s.player=player;
  const el=player.el, play=host.querySelector('[data-play]'), seek=host.querySelector('[data-seek]'), status=host.querySelector('[data-player-status]');
  const paint=()=>{const d=el.duration||Number(m.durationSeconds)||0;seek.value=d?Math.round(el.currentTime/d*1000):0;host.querySelector('[data-time]').textContent=time(el.currentTime);host.querySelector('[data-duration]').textContent=time(d);const running=!el.paused;play.setAttribute('aria-label',running?'일시정지':'재생');play.innerHTML='<i class="ph-fill ph-'+(running?'pause':'play')+'"></i>';status.textContent=host.querySelector('[data-player] [data-msg]')?.textContent||'';};
  el.addEventListener('timeupdate',()=>{if(s.loop&&el.currentTime>=Math.min(el.duration||Infinity,(s.start[m.id]||0)+16))el.currentTime=s.start[m.id]||0;paint();}); el.addEventListener('play',paint);el.addEventListener('pause',paint);el.addEventListener('loadedmetadata',paint); el.addEventListener('error',paint);paint();
  play.onclick=()=>el.paused?player.play():player.pause();seek.oninput=()=>player.seek(Number(seek.value)/1000*(el.duration||m.durationSeconds||0));
  const move=step=>{const n=s.selected.indexOf(s.active)+step;if(n<0||n>=s.selected.length)return;s.carouselDirection=step;s.active=s.selected[n];screen(s);};
  host.querySelector('[data-previous]').onclick=()=>move(-1);host.querySelector('[data-next]').onclick=()=>move(1);
  host.querySelector('[data-prev]')?.addEventListener('click',()=>move(-1));host.querySelector('[data-next-peek]')?.addEventListener('click',()=>move(1));
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
  let gesture=null,changing=false;
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
  carrier.addEventListener('pointercancel',e=>{if(gesture?.id!==e.pointerId)return;gesture=null;snap();});
  const enter=s.carouselDirection||0;s.carouselDirection=0;
  if(enter&&!reduced&&card.animate){
    card.animate([{transform:'translate3d('+(enter===1?46:-46)+'px,0,0) scale(.975)',opacity:.6},{transform:'translate3d(0,0,0) scale(1)',opacity:1}],{duration:300,easing:'cubic-bezier(.18,1,.2,1)'});
  }
  carrier.tabIndex=0;carrier.onkeydown=e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();move(e.key==='ArrowLeft'?-1:1);}};
  const savedRate=Number(rates()[m.id])||1;player.setRate(savedRate);host.querySelector('[data-speed]').textContent=savedRate.toFixed(1)+'×';
  host.querySelector('[data-speed]').onclick=()=>V.collectionChoice('이 녹음의 배속',[[.5,'0.5×'],[.75,'0.75×'],[1,'1.0×'],[1.25,'1.25×'],[1.5,'1.5×']].map(([v,l])=>[String(v),l]),String(player.el.playbackRate),value=>{const rate=Number(value);player.setRate(rate);host.querySelector('[data-speed]').textContent=rate.toFixed(rate%1?2:1).replace(/0×$/,'×');try{speedStore.setItem(speedKey,JSON.stringify({...rates(),[m.id]:rate}));}catch{V.toast('배속을 저장하지 못했어요.','error');}});
  host.querySelector('[data-loop]').onclick=e=>{s.loop=!s.loop;e.currentTarget.setAttribute('aria-pressed',String(s.loop));if(s.loop)player.seek(s.start[m.id]||0);};
  host.querySelector('[data-start]').onchange=e=>{s.start[m.id]=Number(e.target.value);const pos=el.currentTime;screen(s);s.player.seek(pos);};
  host.querySelector('[data-analyze]')?.addEventListener('click',async e=>{
    const btn=e.currentTarget;btn.disabled=true;status.textContent='녹음을 분석하고 있어요…';
    try{const full=await V.analyzeRecording(m,{onStage:t=>{if(!s.dead)status.textContent=t;}});if(s.dead||s.active!==m.id)return;s.results.set(m.id,full);m.analysis=full.summary;screen(s);}
    catch(err){if(!s.dead){btn.disabled=false;status.textContent='분석하지 못했어요: '+err.message;}}
  });
  host.querySelectorAll('[data-metric]').forEach(b=>b.onclick=()=>{s.metric=b.dataset.metric;screen(s);});
  host.querySelectorAll('[data-point]').forEach(b=>{
    const open=()=>{const chosen=s.items.find(x=>x.id===b.dataset.point);if(chosen)observe(s,chosen);};
    b.addEventListener('click',open);
    b.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});
  });
  const growthButton=host.querySelector('[data-growth-ai]');
  if(growthButton){
    growthButton.onclick=async()=>{
      if(s.growthPending)return;
      const key=growthEvidenceKey(s),id=labGrowthId(s);
      const metrics=METRICS.map(metric=>growthMetric(metric,s)).filter(Boolean);
      const status=host.querySelector('[data-growth-ai-status]'),output=host.querySelector('[data-growth-ai-result]')||host.querySelector('.vl-growth-ai-text');
      if(!metrics.length){status.textContent='비교할 신뢰도 높은 측정값이 부족해요.';return;}
      if(typeof window.vzipCloudCoach!=='function'){status.textContent='AI 연결을 사용할 수 없어요. 위의 측정 기반 변화 요약은 계속 볼 수 있어요.';return;}
      s.growthPending=true;growthButton.disabled=true;status.textContent='AI가 녹음별 측정 변화를 정리하고 있어요…';
      try{
        // Server "overall" mode: a validated four-line report (요약/좋아진 점/보완할 점/다음 연습) built only from
        // these measured first→last changes of ONE song. The old free-text mode cut the request to 80 characters and
        // answered with a three-line practice tip, which was rejected as too short. No audio is sent.
        const serverKey={wob:'stability',into:'intonation',phr:'phrase'};
        const measured=metrics.filter(x=>serverKey[x.metric.key]).map(x=>{
          const state=!x.changed?'similar':x.tone==='good'?'better':x.tone==='bad'?'worse':'similar';
          return {key:serverKey[x.metric.key],title:(x.metric.label+' '+x.formatted).slice(0,32),value:x.last.value,count:x.count,
            state,sharedSongs:1,improvedSongs:state==='better'?1:0,worsenedSongs:state==='worse'?1:0};
        });
        if(!measured.length)throw Error('AI가 해석할 음정·지속음·프레이즈 측정값이 부족해요.');
        const records=s.selected.map(id=>s.items.find(m=>m.id===id)).filter(Boolean);
        const response=await window.vzipCloudCoach({
          mode:'overall',recordingCount:records.length,analysisCount:records.filter(m=>V.analysisReliable(analysis(m))).length,analyzedSongs:1,
          periodStart:M.dateOf(records[0])||'',periodEnd:M.dateOf(records.at(-1))||'',metrics:measured,observations:[]
        });
        if(s.dead||!host.isConnected||growthEvidenceKey(s)!==key||labGrowthId(s)!==id)return;
        if(response?.mode!=='overall')throw Error('AI 결과 형식이 달라요. 다시 생성해 주세요.');
        const textResult=String(response.note||'').trim();
        if(!textResult)throw Error('AI 해석이 비어 있어요. 다시 생성해 주세요.');
        const report={id,period:'vocal-growth-ai',songId:s.song.id,mediaIds:s.selected.slice(),evidenceKey:key,text:textResult.slice(0,5000),updatedAt:Date.now()};
        const stored=V.change(db=>{db.practicePlans||=[];const existing=db.practicePlans.find(p=>p.id===id);if(existing)Object.assign(existing,report);else db.practicePlans.push(report);},{silent:true});
        if(!stored)throw Error('AI 리포트 저장에 실패했어요.');
        if(output){output.hidden=false;output.textContent=report.text;}
        status.textContent='AI 종합 리포트를 저장했어요. 다시 열어도 확인할 수 있어요.';
        growthButton.textContent='다시 생성';
      }catch(e){if(!s.dead&&host.isConnected)status.textContent='AI 해석 생성 실패: '+String(e?.message||e)+' · 위 측정 기반 요약은 그대로 볼 수 있어요.';}
      finally{s.growthPending=false;if(growthButton.isConnected)growthButton.disabled=false;}
    };
  }
  const cmp=host.querySelector('[data-compare-panel]');
  if(cmp){
    cmp.ontoggle=()=>{s.compareOpen=cmp.open};
    const switchTo=id=>{if(id===s.active)return;const position=el.currentTime, wasPlaying=!el.paused;s.compareOpen=true;s.active=id;screen(s);s.player?.load().then(()=>{s.player.seek(position);if(wasPlaying)s.player.play()}).catch(()=>{});};
    cmp.querySelector('[data-compare-a]').onchange=e=>{s.compareA=e.target.value;s.compareOpen=true;screen(s)};
    cmp.querySelector('[data-compare-b]').onchange=e=>{s.compareB=e.target.value;s.compareOpen=true;screen(s)};
    cmp.querySelector('[data-compare-first]').onclick=()=>{s.compareA=s.selected[0];s.compareB=s.selected.at(-1);s.compareOpen=true;screen(s)};
    cmp.querySelector('[data-compare-switch]').onclick=()=>{const a=cmp.querySelector('[data-compare-a]').value,b=cmp.querySelector('[data-compare-b]').value;switchTo(s.active===a?b:a)};
    const form=cmp.querySelector('[data-compare-form]'),output=cmp.querySelector('[data-compare-output]');
    form.onsubmit=e=>{e.preventDefault();const a=s.items.find(x=>x.id===cmp.querySelector('[data-compare-a]').value),b=s.items.find(x=>x.id===cmp.querySelector('[data-compare-b]').value);if(!a||!b||a.id===b.id){output.textContent='서로 다른 녹음 두 개를 선택해 주세요.';return}const entry={firstId:a.id,secondId:b.id,firstName:M.label(a),secondName:M.label(b),firstDate:a.created,secondDate:b.created,song:s.song.title,songId:s.song.id,measures:{first:V.measureSnapshot?.(a)||null,second:V.measureSnapshot?.(b)||null},notes:form.elements.notes.value,goal:form.elements.goal.value,firstRating:a.rating??null,secondRating:b.rating??null,firstReview:a.review||'',secondReview:b.review||''};if(V.change(d=>{d.comparisonReports||=[];const old=d.comparisonReports.find(x=>x.kind!=='vocal-lab'&&x.firstId===a.id&&x.secondId===b.id);if(old)Object.assign(old,entry);else d.comparisonReports.push({id:V.uid(),created:Date.now(),...entry})},{silent:true}))V.toast('비교 메모를 저장했어요.');};
    cmp.querySelector('[data-compare-ai]').onclick=async e=>{const notes=form.elements.notes.value.trim(),btn=e.currentTarget;if(notes.length<10){output.textContent='정리할 메모를 10자 이상 작성해 주세요.';return}const token=await window.vzipCloudAccessToken?.();if(!token){output.textContent='로그인 후 사용할 수 있어요.';return}btn.disabled=true;output.textContent='메모를 정리하는 중…';try{const res=await fetch('https://chxnbtiyuyhiywzeshis.supabase.co/functions/v1/vocal-ai',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,apikey:V.anonKey},body:JSON.stringify({mode:'comparison',notes})});const json=await res.json();if(!res.ok)throw Error(json.error||'AI 정리 실패');output.textContent=json.analysis+'\n\n※ 작성한 메모를 정리한 결과예요.'}catch(err){output.textContent='AI 정리 실패: '+err.message}finally{btn.disabled=false}};
  }
  host.querySelectorAll('[data-rating]').forEach(b=>b.onclick=async()=>{const score=Number(b.dataset.rating);try{await M.update(m,{rating:score});m.rating=score;host.querySelectorAll('[data-rating]').forEach(star=>star.setAttribute('aria-pressed',String(Number(star.dataset.rating)<=score)));host.querySelector('.vl-rating b').textContent=score+'/5';}catch(err){V.toast('만족도를 저장하지 못했어요: '+err.message,'error');}});
  host.querySelector('[data-repeat-practice]').onclick=()=>{s.loop=true;host.querySelector('[data-loop]').setAttribute('aria-pressed','true');player.seek(s.start[m.id]||0);player.play();};
  host.querySelectorAll('[data-practice-tip]').forEach(button=>button.onclick=()=>{
    const tip=[...recs.tips,savedAITip(s)].filter(Boolean).find(x=>x.key===button.dataset.practiceTip);
    if(!tip)return;
    V.practiceSheet({songId:s.song.id,mediaIds:[m.id],preset:{minutes:tip.minutes,memo:'[추천 연습] '+tip.name+' — '+tip.steps.join(' / ')}});
  });
  if(savedAITip(s))host.querySelector('[data-ai-status]').textContent='저장된 AI 추천 결과예요. 연습 기록에 담기 전에도 보관돼요.';
  const aiButton=host.querySelector('[data-ai-exercise]');
  aiButton.disabled=!!s.aiPending;
  aiButton.onclick=async()=>{
    if(s.aiPending)return;const context=aiContext(s),status=host.querySelector('[data-ai-status]');s.aiPending=true;aiButton.disabled=true;status.textContent='겹치지 않는 연습 한 가지를 찾고 있어요…';
    try{
      const last=(V.db.practices||[]).filter(p=>!p.songId||p.songId===s.song.id).sort((a,b)=>String(a.date).localeCompare(String(b.date))||(a.created||0)-(b.created||0)).at(-1);
      const result=await window.vzipCloudCoach({mode:'inline-exercise',excluded:recs.tips.map(t=>t.key),task:'보컬 연구소의 기존 추천과 겹치지 않는 추가 연습 한 가지',summary:'기존 추천: '+recs.tips.map(t=>t.name).join(', '),song:s.song.title,comfort:last?.practiceRoom?.draft?.comfort||'',symptoms:last?.practiceRoom?.draft?.symptoms||[],mood:last?.practiceRoom?.mood||'',memo:last?.practiceRoom?.draft?.memo||last?.memo||'',answers:[JSON.stringify({displayed:recs.tips,recording:{date:M.dateOf(m),review:m.review||'',metrics:analysis(m)?.metrics||null},segmentStart:s.start[m.id]||0})]});
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
    if(V.change(d=>{d.comparisonReports||=[];d.comparisonReports.push({id:V.uid(),created:Date.now(),...record});},{silent:true}))V.toast('리포트를 보관함에 저장했어요.');
  };
}
V.route('vocal-lab',{title:'보컬 연구소',back:true,tab:'songs',noAutoRefresh:true,
  actions:()=>'<button type="button" class="icon-btn" data-lab-more aria-label="더보기"><i class="ph ph-dots-three-outline"></i></button>',
  render:()=>'<div class="vl" data-lab><p class="vl-muted">녹음을 불러오는 중…</p></div>',
  async mount(main,r){
    clean();const id=++instance, song=V.song(r.params[0]),host=main.querySelector('[data-lab]');
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
            (known?'<a class="vl-report" href="#/vocal-lab/'+encodeURIComponent(songId)+'?selection=1"><strong>선택한 녹음 모두 분석</strong><i class="ph ph-caret-right"></i></a>':'<p class="vl-muted">곡을 지정하면 여러 녹음의 변화를 함께 볼 수 있어요.</p>')+
            files.map(m=>'<a class="vl-report" href="'+(known?'#/vocal-lab/'+encodeURIComponent(songId)+'?selection=1':'#/analysis/'+encodeURIComponent(m.id))+'"><span>'+esc(M.label(m))+'</span><span>'+esc(day(m))+'</span></a>').join('')+'</div>';
        }).join(''):'<p class="vl-muted">선택한 녹음을 찾지 못했어요. 보관함에서 다시 선택해 주세요.</p>');
      return;
    }
    if(!song){
      const songs=V.songsNewest();
      host.innerHTML=songs.length?'<div class="vl-song"><i class="ph ph-waveform"></i><strong>보컬 연구소</strong></div><p class="vl-muted">분석할 곡을 선택해 주세요.</p>'+songs.map(x=>'<a class="vl-report" href="#/vocal-lab/'+encodeURIComponent(x.id)+'"><strong>'+esc(x.title)+'</strong><i class="ph ph-caret-right"></i></a>').join(''):V.empty('music-notes','먼저 곡을 추가해 주세요.');
      return;
    }
    document.querySelector('[data-lab-more]').onclick=()=>V.menu({title:'보컬 연구소',body:'<div class="vz-choice-list"><a class="vz-choice" href="#/lab-reports">리포트 보관함 <i class="ph ph-caret-right"></i></a><a class="vz-choice" href="#/song/'+encodeURIComponent(song.id)+'">곡 상세 <i class="ph ph-caret-right"></i></a></div>'});
    const requested=r.query.get('selection')==='1' ? new Set(selectionIds()) : null;
    const items=(await M.list().catch(()=>M.cached())).filter(m=>m.songId===song.id && (!M.isVideo(m) || requested?.has(String(m.id)))).sort((a,b)=>(M.dateOf(a)||'').localeCompare(M.dateOf(b)||'')||(a.created||0)-(b.created||0));
    if(id!==instance||!host.isConnected)return;
    const report=(V.db.comparisonReports||[]).find(x=>x.kind==='vocal-lab'&&x.id===r.query.get('report')&&x.songId===song.id);
    const pair=[r.query.get('a'),r.query.get('b')].filter(key=>items.some(m=>String(m.id)===key));
    const selected=r.query.get('selection')==='1' ? selectionIds().filter(key=>items.some(m=>String(m.id)===key)) : pair.length ? items.filter(m=>pair.includes(String(m.id))).map(m=>m.id) : report?.mediaIds?.filter(key=>items.some(m=>m.id===key))||[];
    // Navigation always follows the date tabs: oldest on the left, newest on the right.
    selected.sort((a,b)=>items.findIndex(x=>x.id===a)-items.findIndex(x=>x.id===b));
    const aiTips=new Map();
    const savedPlans=(V.db.practicePlans||[]).filter(p=>p.period==='ai-exercise'&&p.songId===song.id&&p.tip&&items.some(m=>m.id===p.mediaId)&&!(V.db.deleted?.practicePlans||[]).includes(p.id)).slice().sort((a,b)=>(a.created||0)-(b.created||0));
    for(const plan of savedPlans)aiTips.set(String(plan.mediaId)+':'+(plan.segmentStart||0),plan.tip);
    current={host,song,items,aiTips,selected,active:selected.includes(report?.activeId)?report.activeId:selected.at(-1)||null,metric:report?.metric||'wob',results:new Map(),start:{},loop:false,dead:false,player:null,compareOpen:r.query.get('compare')==='1',compareA:r.query.get('a'),compareB:r.query.get('b')};
    screen(current);
  },leave:clean
});
V.route('lab-reports',{title:'리포트 보관함',back:true,tab:'songs',render(){
  const reports=(V.db.comparisonReports||[]).sort((a,b)=>(b.created||0)-(a.created||0));
  return '<div class="vl vl-reports">'+(reports.length?reports.map(x=>'<a class="vl-report" href="#/vocal-lab/'+encodeURIComponent(x.songId||'')+'?'+(x.kind==='vocal-lab'?'report='+encodeURIComponent(x.id):'a='+encodeURIComponent(x.firstId)+'&b='+encodeURIComponent(x.secondId)+'&compare=1')+'"><strong>'+esc(x.song||'삭제된 곡')+'</strong><span>'+esc(new Date(x.created).toLocaleDateString('ko-KR'))+' · '+(x.kind==='vocal-lab'?'녹음 '+(x.mediaIds||[]).length+'개':'비교 메모')+'</span><i class="ph ph-caret-right"></i></a>').join(''):'<div class="vl-empty">저장한 리포트가 없어요.<br><small>보컬 연구소에서 리포트를 저장하면 여기에 모여요.</small></div>')+'</div>';
}});
})();
