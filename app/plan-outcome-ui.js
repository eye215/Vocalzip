/* Outcome cards for daily practice plans; no paid AI calls, no extra audio downloads.
 * New reports (rules:2) use the growth report v2 wording (VzipGrowthMetrics); reports saved earlier keep their own
 * numbers and are shown as "이전 기준" until the person refreshes them. */
(()=>{
'use strict';
const V=window.VZ,M=V?.media,Model=window.VzipPlanOutcome;
if(!V||!M||!Model)return;
const esc=V.esc;
const G=()=>window.VzipGrowthMetrics;
const TONE={better:'good',worse:'bad',similar:'neutral',mixed:'neutral',changed:'neutral',reference:'ref',hold:'insufficient'};
const STATE={better:'좋아진 방향',worse:'아쉬운 방향',similar:'비슷함',mixed:'변화 혼재',reference:'참고',hold:'판정 보류'};
/** Plan key → name shown everywhere (same titles as the growth report; vibrato is reference only). */
function metricTitle(key){
 const id=Model.GROWTH?.[key],d=id&&G()?.METRICS.find(x=>x.id===id);
 return d?d.title:key==='vibrato'?'비브라토 규칙성 (참고)':
  ({intonation:'음정 정확도',stability:'음정 안정성',phrase:'호흡 유지'}[key]||String(key||''));
}
const advice={
 repeat:'같은 곡의 같은 구간을 짧게 나누어 다시 녹음하고, 소리가 편안한지 확인해 보세요.',
 maintain:'다른 날 같은 구간을 한 번 더 녹음해 변화가 이어지는지 확인해 보세요.',
 collect:'같은 곡을 계획 시작 전후로 더 녹음한 뒤 비교해 보세요.',
 listen:'구간 A/B 비교로 계획 전·중 녹음을 직접 들어 보고, 선생님과 함께 확인해 보세요.'
};
const holdText=reason=>G()?.holdText(reason)||'판정 보류';
const chip=state=>'<span class="growth-state '+(TONE[state]||'insufficient')+'">'+esc(STATE[state]||'판정 보류')+'</span>';
const day=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'')?Number(s.slice(5,7))+'/'+Number(s.slice(8,10)):'';
/** One compact line for a rules:2 measurement: values (or the hold reason), then what was compared. */
function lines(m,metric){
 if(m.state==='hold')return {value:holdText(m.reason),basis:''};
 if(metric==='vibrato'){
  const pct=n=>Math.round(n*100)+'%';
  return {value:'계획 전 '+pct(m.before)+' → 계획 중 '+pct(m.after),basis:'곡 전체 평균 · 성장 리포트에 없는 항목이라 판정하지 않아요'};
 }
 const x={id:m.growthMetric,state:m.state,before:m.before,after:m.after,basis:m.basis,matched:m.matched,tempo:m.tempo};
 const g=G();
 return {value:g?g.changeText(x):m.before+' → '+m.after,basis:g?g.basisText(x):''};
}
const counts=m=>'계획 전 분석 녹음 '+m.beforeCount+'개 · 계획 중 '+m.afterCount+'개'+
 (m.beforeDate&&m.afterDate&&m.state!=='hold'?' (비교: '+day(m.beforeDate)+' → '+day(m.afterDate)+')':'');
/** Short preview for the plan card (same measurement as the saved report). */
function preview(plan,m){
 const l=lines(m,plan.metric);
 return '<p class="small muted growth-plan-measure">'+chip(m.state)+' '+esc(l.value)+(l.basis?' · '+esc(l.basis):'')+'<br>'+esc(counts(m))+
  ' · 지정 구간 결과나 악보 기준 정답이 아니에요.</p>';
}
/* ---------- reports saved before rules:2 ---------- */
function legacyFmt(n,r){return n==null?'측정 없음':(r.metric==='vibrato'?Math.round(n*100)+'%':n+(r.metric==='phrase'?'초':' cent'));}
function legacyResult(r){
 const m=r.measurement||{};
 if(m.mixedVersions)return holdText('version-mixed');
 if(m.change==='insufficient'||!['better','worse','similar'].includes(m.change))return '계획 시작 전·후의 동일 곡 분석된 녹음이 부족해 수치 변화를 판단할 수 없었어요.';
 return '시작 전 '+legacyFmt(m.before,r)+' ('+(m.beforeCount??0)+'개) → 계획 중 '+legacyFmt(m.after,r)+' ('+(m.afterCount??0)+'개)';
}
function legacyView(r){
 const m=r.measurement||{},state=m.mixedVersions||!['better','worse','similar'].includes(m.change)?'hold':m.change;
 return '<p>'+chip(state)+' '+esc(metricTitle(r.metric))+'</p><p>'+esc(legacyResult(r))+'</p>'+
  '<p class="small muted">이전 기준(곡 전체 녹음 평균)으로 만든 리포트예요. ‘리포트 최신화’를 누르면 성장 리포트와 같은 기준으로 다시 정리해요.</p>';
}
function view(r){
 const m=r.measurement||{},legacy=Model.isLegacy(r);
 let body;
 if(legacy)body=legacyView(r);
 else{
  const l=lines(m,r.metric);
  body='<p>'+chip(m.state)+' '+esc(metricTitle(r.metric))+'</p><p>'+esc(l.value)+'</p>'+
   '<p class="small muted">'+esc((l.basis?l.basis+' · ':'')+counts(m))+'</p>'+
   (m.state==='hold'?'':'<p class="small muted">계획 전 마지막 녹음과 계획 기간의 마지막 녹음을 성장 리포트와 같은 기준으로 비교했어요. 지정 구간 A/B 재생 결과나 악보 정답 대비 점수가 아니에요.</p>');
 }
 return '<div class="growth-outcome-report"><p><strong>계획 실천 '+r.completedDays+'/'+r.scheduledDays+'일 · '+r.completionRate+'%</strong></p>'+body+
 '<p><strong>다음 연습 제안</strong><br>'+esc(advice[r.recommendation]||advice.collect)+'</p></div>';
}
function render(host,plan,items,action){
 if(!host?.isConnected)return;
 const reports=V.db.vocalPlanReports||[];
 const stored=reports.find(r=>r.planId===plan.id);
 const end=Model.completeDate(plan),ended=Boolean(end&&V.today()>=end);
 host.innerHTML='<section class="growth-outcome-panel"><h4>연습 결과 리포트</h4>'+
 (stored?'<p class="small muted">보관된 결과 · '+esc(stored.createdDate||'')+'</p>'+view(stored):
   ended?'<p class="small muted">계획이 종료됐어요. 실제 목표 체크와 같은 곡의 저장된 측정값으로 결과를 정리할 수 있어요.</p>':
   '<p class="small muted">'+esc(end)+' 이후에 계획 완료 리포트를 만들 수 있어요.</p>')+
 (ended?'<button type="button" class="btn sm ghost" data-save-outcome>'+(stored?'리포트 최신화':'계획 결과 보관하기')+'</button>':'')+
 (stored?'<button type="button" class="btn sm ghost" data-next-outcome>이 곡으로 다음 계획 만들기</button>':'')+
 '<p class="small muted" role="status" data-outcome-status></p></section>';
 const button=host.querySelector('[data-save-outcome]');
 if(button)button.onclick=()=>{
  const message=host.querySelector('[data-outcome-status]');
  try{
   const updated=Model.report({plan,goals:V.db.dailyGoals||[],recordings:items,dateOf:M.dateOf,
    valid:m=>[1,2].includes(m.analysis?.v)&&V.analysisReliable?.(m.analysis),asOf:V.today()});
   updated.created=Date.now();updated.createdDate=V.today();
   if(!V.change(db=>{
    db.vocalPlanReports ||= [];
    const index=db.vocalPlanReports.findIndex(r=>r.planId===plan.id);
    // Refreshing keeps any field an earlier save (or another app version) added; the new snapshot replaces the rest.
    if(index>=0)db.vocalPlanReports[index]={...db.vocalPlanReports[index],...updated};else db.vocalPlanReports.push(updated);
   },{silent:true}))throw Error('결과를 저장하지 못했어요.');
   render(host,plan,items,action);V.toast('연습 결과를 저장했어요.');
  }catch(error){if(message)message.textContent=error.message||'리포트를 저장하지 못했어요.';}
 };
 const next=host.querySelector('[data-next-outcome]');
 if(next)next.onclick=()=>action?.(plan);
}
V.planOutcomeCard=render;
V.planOutcomePreview=preview;
V.planMetricTitle=metricTitle;
})();
