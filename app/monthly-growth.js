/* VOCAL.zip — whole-library monthly vocal growth. No invented metrics or model-generated diagnoses. */
(() => {
'use strict';
const V = window.VZ, M = V?.media;
if (!V || !M) return;
const e = V.esc;
const definitions = [
 {id:'intonation', title:'음정 오차', path:['intonation','meanAbsCents'], unit:'cent', direction:-1, practice:'기준음을 듣고 짧은 구간을 천천히 따라 부르기', minutes:10},
 {id:'stability', title:'지속음 흔들림', path:['stability','wobbleCents'], unit:'cent', direction:-1, practice:'편안한 음역에서 5초 지속음을 녹음하며 일정하게 유지하기', minutes:8},
 {id:'phrase', title:'프레이즈 길이', path:['breath','medianPhrase'], unit:'초', direction:1, practice:'한 프레이즈를 무리 없는 호흡으로 끊김 없이 연결하기', minutes:8},
 {id:'vibrato', title:'비브라토 규칙성', path:['vibrato','regularity'], unit:'%', direction:1, practice:'편안한 지속음에서 힘을 빼고 자연스러운 진동을 관찰하기', minutes:5}
];
const val = (a,d) => { let v=a?.metrics; for(const k of d.path) v=v?.[k]; return typeof v==='number' && Number.isFinite(v) ? (d.id==='vibrato' ? v*100:v) : null; };
const ym = s => /^\d{4}-\d{2}/.test(String(s||'')) ? String(s).slice(0,7) : '';
const avg = xs => xs.length ? xs.reduce((a,b)=>a+b,0)/xs.length : null;
const format = (n,d) => n==null?'측정 없음': (Math.round(n*10)/10).toLocaleString('ko-KR')+(d.unit?' '+d.unit:'');
let request = 0;
function group(items) {
 const months = new Map();
 for(const m of items){
  const date=ym(M.dateOf(m));if(!date)continue;
  const slot=months.get(date)||[];slot.push(m);months.set(date,slot);
 }
 return months;
}
const valid = m => m.analysis?.v===1 && V.analysisReliable?.(m.analysis);
function measure(items,d){ const vals=items.filter(valid).map(m=>val(m.analysis,d)).filter(v=>v!=null); return {value:avg(vals),count:vals.length}; }
function comparable(current,previous,d) {
 // Avoid attributing changing repertoire to improvements: compare only songs present in BOTH months.
 const songs=new Set(current.filter(m=>m.songId&&valid(m)).map(m=>m.songId));
 const shared=[...songs].filter(id=>previous.some(m=>m.songId===id&&valid(m)));
 const pairs=shared.map(id=>({before:measure(previous.filter(m=>m.songId===id),d),after:measure(current.filter(m=>m.songId===id),d)}))
  .filter(p=>p.before.value!=null&&p.after.value!=null);
 if(!pairs.length)return null;
 // Each shared song carries equal weight; repeated takes do not dominate the month.
 const before=avg(pairs.map(p=>p.before.value)),after=avg(pairs.map(p=>p.after.value));
 const delta=after-before, relative=Math.abs(delta)/Math.max(Math.abs(before),1);
 const state=relative<0.05?'similar':Math.sign(delta)===d.direction?'better':'worse';
 return {before,after,delta,state,songs:pairs.length};
}
function narrative(rows, month, previous) {
 const gains=rows.filter(r=>r.c?.state==='better'), losses=rows.filter(r=>r.c?.state==='worse');
 let header='비교 가능한 동일 곡의 녹음이 부족해 아직 좋아진 점과 나빠진 점을 판단할 수 없어요.';
 if(gains.length||losses.length)header=[gains.length?'좋아진 항목: '+gains.map(x=>x.d.title).join(', '):'뚜렷한 개선 항목은 없어요',losses.length?'보완이 필요한 항목: '+losses.map(x=>x.d.title).join(', '):'뚜렷한 악화 항목은 없어요'].join(' · ');
 else if(rows.some(r=>r.c))header='비교 가능한 지표에서 큰 변화가 확인되지 않았어요.';
 return '<section class="card growth-section"><h2>이달의 변화</h2><p>'+e(header)+'</p><p class="small muted">'+e(previous?previous+' 대비 · 같은 곡을 부른 녹음만 변화 판단에 사용':'전월 기록이 없어 변화 비교는 제공하지 않아요')+'</p></section>';
}
function rowsHtml(rows) {
 return '<div class="growth-metrics">'+rows.map(({d,current,c})=>{
  const label=c?(c.state==='better'?'개선':c.state==='worse'?'보완 필요':'비슷함'):'비교 불가';
  const tone=c?.state==='better'?'good':c?.state==='worse'?'bad':'';
  return '<article class="card growth-metric"><div class="growth-metric-head"><strong>'+e(d.title)+'</strong><span class="growth-state '+tone+'">'+label+'</span></div><strong class="growth-number">'+e(format(current.value,d))+'</strong><p class="small muted">이번 달 유효 측정 '+current.count+'개</p>'+(c?'<p class="small">동일 곡 '+c.songs+'곡 비교 · 이전 '+e(format(c.before,d))+' → 이번 '+e(format(c.after,d))+'</p>':'<p class="small muted">동일 곡의 전월 유효 측정이 필요해요.</p>')+'</article>';
 }).join('')+'</div>';
}
function prescriptions(rows){
 const ranked=rows.filter(r=>r.c?.state==='worse').concat(rows.filter(r=>r.c?.state==='similar')).concat(rows.filter(r=>!r.c&&r.current.value!=null));
 const chosen=ranked.slice(0,3);
 return '<section class="card growth-section"><h2>추천 연습</h2>'+(chosen.length?'<p class="small muted">실측 변화에 기반한 규칙형 추천입니다. AI 청취 진단이나 의학적 판단이 아니에요.</p>'+chosen.map((r,i)=>'<div class="growth-task"><span class="growth-task-number">'+(i+1)+'</span><div><strong>'+e(r.d.title)+'</strong><p>'+e(r.d.practice)+'</p><p class="small muted">권장 '+r.d.minutes+'분 · '+(r.c?.state==='worse'?'전월 대비 악화된 지표':r.c?'유지·강화':'비교 데이터 부족')+'</p><button type="button" class="btn sm ghost" data-growth-goal="'+r.d.id+'">오늘의 목표에 추가</button></div></div>').join('')+'<a class="btn block" href="#/practice-room">노래 연습실에서 연습하기</a>':'<p>분석된 녹음이 쌓이면 우선 연습 과제를 제안할게요.</p>')+'</section>';
}

const previousMonth = k => { const [y,m]=k.split('-').map(Number);return (m===1?y-1:y)+'-'+String(m===1?12:m-1).padStart(2,'0'); };
function monthlyRows(key, months){
 const current=months.get(key)||[],previous=months.get(previousMonth(key))||[];
 return definitions.map(d=>({d,current:measure(current,d),c:comparable(current,previous,d)}));
}
function archiveMonths(months){
 const today=ym(V.today()),stored=new Set((V.db.monthlyGrowthReports||[]).map(r=>r.month));
 const pending=[...months.keys()].filter(k=>k<today&&!stored.has(k)&&months.get(k).some(valid));
 if(!pending.length)return;
 const reports=pending.map(month=>{
  const rows=monthlyRows(month,months),items=months.get(month);
  return {id:'monthly-growth:'+month,month,created:Date.now(),recordingCount:items.length,
   analysisCount:items.filter(valid).length,
   metrics:rows.map(({d,current,c})=>({key:d.id,title:d.title,value:current.value,count:current.count,comparison:c})),
   recommendations:rows.filter(r=>r.c?.state==='worse').concat(rows.filter(r=>r.c?.state==='similar'))
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
  return '<button type="button" class="growth-month" data-month="'+key+'"><strong>'+e(key.replace('-','년 ')+'월')+'</strong><span class="small muted">녹음 '+ms.length+'개 · 분석 가능 '+eligible+'개</span></button>';
 }).join('')+'</div></section>';
}
async function mount(host){
 const my=++request;
 try {
  const items=await M.list();if(my!==request||!host.isConnected)return;
  const months=group(items); archiveMonths(months);
  const keys=[...new Set([...months.keys(),...(V.db.monthlyGrowthReports||[]).map(r=>r.month)])].sort().reverse();
  const currentKey=ym(V.today());
  let selected=keys.includes(currentKey)?currentKey:keys[0];
  const render=()=>{
   if(!keys.length){host.innerHTML='<div class="empty"><p>아직 날짜가 있는 녹음이 없어요.</p></div>';return;}
   const prev=previousMonth(selected);
   const current=months.get(selected)||[],previous=months.get(prev)||[];
   const rows=monthlyRows(selected,months);
   const validCount=current.filter(valid).length;
   host.innerHTML='<header class="growth-intro"><p class="small muted">모든 곡의 녹음 데이터를 한곳에서</p><h2>내 목소리의 변화</h2><label class="field"><span>분석 월</span><select data-growth-select>'+keys.map(k=>'<option value="'+k+'" '+(k===selected?'selected':'')+'>'+e(k.replace('-','년 ')+'월')+'</option>').join('')+'</select></label><p class="small muted">녹음 '+current.length+'개 · 신뢰 가능한 보컬 분석 '+validCount+'개 · 분석하지 않은 녹음은 계산에서 제외</p></header>'+
   archiveCard(selected)+narrative(rows,selected,previous.length?prev:'')+rowsHtml(rows)+prescriptions(rows)+history(months)+
   '<p class="small muted growth-disclaimer">곡·녹음 환경·반주에 따라 수치가 달라질 수 있습니다. 전월과 동일한 곡이 없으면 성장/악화로 판정하지 않습니다. 호흡 지지, 발성 건강, 감정 표현은 이 측정만으로 판단하지 않습니다. 지난달 리포트는 다음 앱 접속 시 저장됩니다. 서버 예약 자동 생성 및 AI 청취 코멘트 통합은 후속 개발 항목입니다.</p>';
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
V.route('growth',{title:'보컬 성장',tab:'growth',noAutoRefresh:true,
 render:()=>'<div data-growth class="growth-page"><div class="empty compact">분석 기록을 불러오는 중…</div></div>',
 mount(main){mount(main.querySelector('[data-growth]'));},
 leave(){request++;}
});
window.addEventListener('vzip:analysis-saved',()=>{if(location.hash==='#/growth'){const host=document.querySelector('[data-growth]');if(host)mount(host);}});
})();