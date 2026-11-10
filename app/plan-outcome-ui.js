/* Outcome cards for daily practice plans; no paid AI calls, no extra audio downloads. */
(()=>{
'use strict';
const V=window.VZ,M=V?.media,Model=window.VzipPlanOutcome;
if(!V||!M||!Model)return;
const esc=V.esc;
const labels={intonation:'반음 기준 음높이 편차',stability:'지속음 흔들림',phrase:'프레이즈 길이',vibrato:'비브라토 규칙성'};
const advice={
 repeat:'같은 곡의 같은 구간을 짧게 나누어 다시 녹음하고, 소리가 편안한지 확인해 보세요.',
 maintain:'다른 날 같은 구간을 한 번 더 녹음해 변화가 이어지는지 확인해 보세요.',
 collect:'같은 곡을 계획 시작 전후로 더 녹음한 뒤 비교해 보세요.'
};
function resultText(r){
 const m=r.measurement||{},delta=m.delta;
 if(m.change==='insufficient')return '계획 시작 전·후의 동일 곡 분석된 녹음이 부족해 수치 변화를 판단할 수 없어요.';
 if(m.change==='similar')return '측정된 차이가 작아 뚜렷한 변화로 판단하지 않았어요.';
 const label=delta<0?'감소':'증가';
 return (m.change==='better'?'개선 방향의 변화':'추가 확인이 필요한 변화')+' · '+(r.metric==='vibrato'?Math.round(Math.abs(delta)*100)+'%p':Math.abs(delta)+(r.metric==='phrase'?'초':' cent'))+' '+label;
}
function fmt(n,r){return n==null?'측정 없음':(r.metric==='vibrato'?Math.round(n*100)+'%':n+(r.metric==='phrase'?'초':' cent'));}
function view(r){
 const m=r.measurement;
 return '<div class="growth-outcome-report"><p><strong>계획 실천 '+r.completedDays+'/'+r.scheduledDays+'일 · '+r.completionRate+'%</strong></p>'+
 '<p>측정 항목: '+esc(labels[r.metric]||r.metric)+'</p>'+
 '<p>시작 전 '+esc(fmt(m.before,r))+' ('+m.beforeCount+'개) → 계획 중 '+esc(fmt(m.after,r))+' ('+m.afterCount+'개)</p>'+
 '<p>'+esc(resultText(r))+'</p>'+
 '<p class="small muted">이 수치는 해당 곡 전체 녹음의 평균이며, 지정 구간 A/B 재생 결과나 악보 정답 대비 점수가 아니에요. 같은 녹음 환경에서 비교하는 것이 좋아요.</p>'+
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
    valid:m=>m.analysis?.v===1&&V.analysisReliable?.(m.analysis),asOf:V.today()});
   updated.created=Date.now();updated.createdDate=V.today();
   if(!V.change(db=>{
    db.vocalPlanReports||[]=[];
    const index=db.vocalPlanReports.findIndex(r=>r.planId===plan.id);
    if(index>=0)db.vocalPlanReports[index]=updated;else db.vocalPlanReports.push(updated);
   },{silent:true}))throw Error('결과를 저장하지 못했어요.');
   render(host,plan,items,action);V.toast('연습 결과를 저장했어요.');
  }catch(error){if(message)message.textContent=error.message||'리포트를 저장하지 못했어요.';}
 };
 const next=host.querySelector('[data-next-outcome]');
 if(next)next.onclick=()=>action?.(plan);
}
V.planOutcomeCard=render;
})();
