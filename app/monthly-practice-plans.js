/* Monthly growth → editable, user-confirmed song practice plan.
 * Not an AI-localized timestamp: segments are entered by the singer. */
(()=>{
'use strict';
const V=window.VZ, M=V?.media;if(!V||!M)return;
const E=V.esc;
const pad=n=>String(n).padStart(2,'0');
const dayShift=(date,offset)=>{
 const [y,m,d]=date.split('-').map(Number),at=new Date(y,m-1,d,12);
 at.setDate(at.getDate()+offset);
 return at.getFullYear()+'-'+pad(at.getMonth()+1)+'-'+pad(at.getDate());
};
const fmt=seconds=>Math.floor(seconds/60)+':'+pad(seconds%60);
const options=[{key:'intonation',label:'음정 정확도'},{key:'stability',label:'지속음 안정성'},
 {key:'phrase',label:'프레이즈 연결'},{key:'vibrato',label:'비브라토 규칙성'}];
const plans=()=> (V.db.practicePlans||[]).filter(x=>x?.kind==='monthly-vocal'&&!x.archived);
function entries(plan){return (V.db.dailyGoals||[]).filter(g=>g.sourceId===plan.id).sort((a,b)=>a.date.localeCompare(b.date));}
function status(plan){
 const goals=entries(plan);
 return {done:goals.filter(g=>g.completed).length,total:goals.length};
}
function form(month,items,rows){
 const ids=[...new Set(items.filter(m=>m.songId&&V.song(m.songId)).map(m=>m.songId))];
 const songList=ids.map(id=>V.song(id)).filter(Boolean);
 const prioritized=rows.filter(r=>r.c?.state==='worse').map(r=>r.d.id);
 return '<form data-plan-form class="growth-plan-form"><label class="field"><span>집중할 항목</span><select name="metric">'+
  options.map(o=>'<option value="'+o.key+'" '+(prioritized[0]===o.key?'selected':'')+'>'+o.label+'</option>').join('')+'</select></label>'+
  '<label class="field"><span>연습할 곡</span><select name="song" required><option value="">곡 선택</option>'+
  songList.map(x=>'<option value="'+E(x.id)+'">'+E(x.title)+'</option>').join('')+'</select></label>'+
  '<div class="growth-plan-grid"><label class="field"><span>구간 시작 (초)</span><input name="start" type="number" min="0" max="7200" value="0" required></label>'+
  '<label class="field"><span>구간 종료 (초)</span><input name="end" type="number" min="1" max="7200" value="30" required></label>'+
  '<label class="field"><span>하루 연습 (분)</span><input name="minutes" type="number" min="3" max="60" value="10" required></label>'+
  '<label class="field"><span>연습 일수</span><input name="days" type="number" min="1" max="14" value="5" required></label></div>'+
  '<p class="small muted">AI가 곡의 특정 초를 알아낸 것은 아니에요. 직접 녹음을 듣고 연습할 구간을 지정하세요. 생성 전에는 목표가 저장되지 않아요.</p>'+
  '<button class="btn block" type="submit">이 계획을 오늘부터 등록</button><p class="small muted" data-plan-message role="status"></p></form>';
}
const measurePaths={intonation:['intonation','meanAbsCents'],stability:['stability','wobbleCents'],
 phrase:['breath','medianPhrase'],vibrato:['vibrato','regularity']};
function compareSongTakes(plan,items){
 const path=measurePaths[plan.metric],song=items.filter(m=>m.songId===plan.songId&&m.analysis?.metrics&&V.analysisReliable?.(m.analysis));
 const value=m=>{let n=m.analysis.metrics;for(const key of path)n=n?.[key];return Number.isFinite(n)?n:null;};
 const before=song.filter(m=>(M.dateOf(m)||'')<plan.startDate).map(value).filter(n=>n!=null);
 const after=song.filter(m=>(M.dateOf(m)||'')>=plan.startDate).map(value).filter(n=>n!=null);
 if(!before.length||!after.length)return '<p class="small muted">성장 재측정 대기 · 계획 시작 전후 동일 곡의 분석된 녹음이 필요해요.</p>';
 const a=before.reduce((x,y)=>x+y,0)/before.length,b=after.reduce((x,y)=>x+y,0)/after.length,
    change=b-a,good=plan.metric==='intonation'||plan.metric==='stability'?change<0:change>0,
    formatted=n=>(plan.metric==='vibrato'?Math.round(n*100):Math.round(n*10)/10);
 return '<p class="small muted">녹음 변화 참고: '+formatted(a)+' → '+formatted(b)+(plan.metric==='vibrato'?'%':'')+
  ' ('+(Math.abs(change)<0.001?'변화 미미':good?'개선 방향':'변화 확인 필요')+') · 계획 전 '+before.length+'개 / 이후 '+after.length+
  '개. 전체 녹음 기준이므로 지정 구간의 향상을 입증하지는 않아요.</p>';
}

function card(plan,items){
 const {done,total}=status(plan),name=V.songTitle(plan.songId)||'삭제된 곡';
 const last=entries(plan).at(-1)?.date||plan.startDate;
 return '<article class="growth-plan-item"><div class="row between"><strong>'+E(name)+'</strong><span class="small muted">'+done+'/'+total+'회 완료</span></div>'+
 '<p>'+E(options.find(x=>x.key===plan.metric)?.label||'보컬 연습')+' · '+
 fmt(plan.segmentStart)+'–'+fmt(plan.segmentEnd)+' · '+plan.minutes+'분 × '+plan.days+'일</p>'+
 '<p class="small muted">'+E(plan.startDate)+' ~ '+E(last)+' · 홈의 오늘 목표에서 완료 체크</p>'+compareSongTakes(plan,items)+
 '<div class="row"><a class="btn sm ghost" href="#/song/'+encodeURIComponent(plan.songId)+'">곡 상세 보기</a>'+
 '<button type="button" class="btn sm ghost" data-archive-plan="'+E(plan.id)+'">계획 종료</button></div></article>';
}
function create(form,month){
 const metric=form.elements.metric.value,songId=form.elements.song.value,
 start=Number(form.elements.start.value),end=Number(form.elements.end.value),
 minutes=Number(form.elements.minutes.value),days=Number(form.elements.days.value);
 if(!options.some(o=>o.key===metric)||!V.song(songId))throw Error('등록된 곡과 연습 항목을 선택해 주세요.');
 if(![start,end,minutes,days].every(Number.isInteger)||start<0||end>7200||end<=start||
    minutes<3||minutes>60||days<1||days>14)throw Error('구간·시간·일수를 확인해 주세요.');
 const today=V.today(),id='monthly-plan:'+V.uid(),title=V.songTitle(songId);
 const segment=fmt(start)+'–'+fmt(end);
 const label=title+' · '+(options.find(o=>o.key===metric)?.label||'연습')+' ('+segment+', '+minutes+'분)';
 const ok=V.change(db=>{
  db.practicePlans||=[];db.dailyGoals||=[];
  db.practicePlans.push({id,kind:'monthly-vocal',sourceMonth:month,songId,metric,
   segmentStart:start,segmentEnd:end,minutes,days,startDate:today,created:Date.now(),archived:false});
  for(let i=0;i<days;i++){
   const date=dayShift(today,i);
   db.dailyGoals.push({id:id+':'+date,date,title:label,source:'personal',sourceId:id,
    completed:false,order:db.dailyGoals.filter(g=>g.date===date).length,created:Date.now()});
  }
 },{silent:true});
 if(!ok)throw Error('계획을 저장하지 못했어요.');
 return id;
}
function render(host,month,items,rows){
 if(!host?.isConnected)return;
 const mine=plans().sort((a,b)=>(b.created||0)-(a.created||0));
 host.innerHTML='<section class="card growth-section"><h2>곡별 집중 연습 계획</h2>'+
 '<p class="small muted">월간 추천을 실제 곡과 직접 선택한 구간에 연결해요. 하루 목표 완료로 진행률을 추적합니다.</p>'+
 (mine.length?'<div class="growth-plan-list">'+mine.map(plan=>card(plan,items)).join('')+'</div>':'<p>등록한 집중 연습 계획이 없어요.</p>')+
 '<details class="growth-plan-expand"><summary>새 연습 계획 만들기</summary>'+form(month,items,rows)+'</details></section>';
 const formEl=host.querySelector('[data-plan-form]');
 formEl.onsubmit=event=>{
  event.preventDefault();
  const statusEl=formEl.querySelector('[data-plan-message]');
  try{create(formEl,month);V.toast('계획을 저장했어요. 홈의 오늘 목표에서 확인해 주세요.');render(host,month,items,rows);}
  catch(error){statusEl.textContent=error.message||'계획을 저장하지 못했어요.';}
 };
 host.querySelectorAll('[data-archive-plan]').forEach(btn=>btn.onclick=async()=>{
  const id=btn.dataset.archivePlan;
  if(!await V.confirm('계획 종료','남은 날짜의 목표를 제거하고 이 계획을 종료할까요?'))return;
  const today=V.today();
  const ok=V.change(db=>{
   const p=db.practicePlans.find(p=>p.id===id&&p.kind==='monthly-vocal');if(!p)return;
   p.archived=true;p.archivedAt=Date.now();
   db.dailyGoals=db.dailyGoals.filter(g=>g.sourceId!==id||g.completed===true||g.date<today);
  },{silent:true});
  if(ok){V.toast('계획을 종료했어요. 완료한 목표는 남겨뒀어요.');render(host,month,items,rows);}
 });
}
V.monthlyPracticePlans=render;
})();
