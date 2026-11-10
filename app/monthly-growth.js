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
  // 성장 분석은 곡으로 확인된 녹음만 사용한다. 트레이닝/연습실 과제는
  // 같은 곡에 연결된 별도 레슨/곡 녹음이 아닌 한 포함하지 않는다.
  if(!m.songId||!V.song(m.songId))continue;
  const practice=M.owner?.(m)?.practice;
  if(practice?.practiceRoom||practice?.practiceMode==='training')continue;
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

function listeningEvidence(month){
 const entries=(V.db.practices||[]).filter(p=>p.practiceRoom&&!p.practiceRoom.demo&&
  ym(p.date||p.practiceRoom.date)===month&&String(p.practiceRoom.aiCoach||'').trim())
  .sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
 if(!entries.length)return '<section class="card growth-section"><h2>AI 청취 관찰</h2><p>이달에 저장된 AI 청취 코멘트가 아직 없어요.</p><p class="small muted">노래 연습실에서 녹음을 제출하고 직접 AI 코멘트를 요청하면 여기에도 연결돼요.</p></section>';
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
 const observations=(V.db.practices||[]).filter(p=>p.practiceRoom&&!p.practiceRoom.demo&&
  ym(p.date||p.practiceRoom.date)===month&&String(p.practiceRoom.aiCoach||'').trim())
  .slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,5)
  .map(p=>{
   const v=p.practiceRoom,txt=String(v.aiCoach||'');
   return {song:V.songTitle(p.songId||v.songId)||'곡 미지정',date:String(p.date||v.date||'').slice(0,10),
    heard:(txt.match(/(?:^|\n)\s*들리는 특징\s*[:：]\s*([^\n]+)/)?.[1]||txt.split('\n')[0]||'').slice(0,270),
    suggested:(txt.match(/(?:^|\n)\s*다음 시도\s*[:：]\s*([^\n]+)/)?.[1]||'').slice(0,200),
    comfortConcern:v.aiConditionCheck===true||Array.isArray(v.draft?.symptoms)&&v.draft.symptoms.length>0||v.draft?.comfort==='불편해'
   };
  });
 const metrics=rows.map(({d,current,c})=>({key:d.id,title:d.title,value:current.value,count:current.count,
    state:c?.state||'unknown',sharedSongs:c?.songs||0}));
 return {mode:'monthly',month,recordingCount:items.length,
    analysisCount:items.filter(valid).length,metrics,observations};
}
function monthlyAiCard(month){
 const found=(V.db.monthlyAiReports||[]).find(x=>x.id==='monthly-ai:'+month);
 return '<section class="card growth-section" data-monthly-ai><h2>AI 월간 종합 코치</h2>'+
  (found?'<p class="small muted">저장된 AI 분석 · '+e(String(found.createdDate||'').slice(0,10))+'</p>'+
    '<div class="growth-ai-note">'+e(found.note||'').replace(/\n/g,'<br>')+'</div>':
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
   host.innerHTML='<header class="growth-intro"><p class="small muted">곡으로 지정된 녹음 데이터를 한곳에서</p><h2>내 목소리의 변화</h2><label class="field"><span>분석 월</span><select data-growth-select>'+keys.map(k=>'<option value="'+k+'" '+(k===selected?'selected':'')+'>'+e(k.replace('-','년 ')+'월')+'</option>').join('')+'</select></label><p class="small muted">곡 녹음 '+current.length+'개 · 신뢰 가능한 보컬 분석 '+validCount+'개 · 분석하지 않은 녹음은 계산에서 제외</p></header>'+
   archiveCard(selected)+narrative(rows,selected,previous.length?prev:'')+rowsHtml(rows)+listeningEvidence(selected)+monthlyAiCard(selected)+prescriptions(rows)+'<div data-monthly-plans></div>'+history(months)+
   '<p class="small muted growth-disclaimer">곡·녹음 환경·반주에 따라 수치가 달라질 수 있습니다. 전월과 동일한 곡이 없으면 성장/악화로 판정하지 않습니다. 호흡 지지, 발성 건강, 감정 표현은 이 측정만으로 판단하지 않습니다. 지난달 리포트는 다음 앱 접속 시 저장됩니다. 서버 예약 자동 생성과 AI 코멘트 기반 맞춤 추천 생성은 후속 개발 항목입니다.</p>';

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
      if(!host.isConnected||!window.vzipCloudSignedIn?.()||owner!==window.vzipCloudUserId?.()||
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
      const card=host.querySelector('[data-monthly-ai]');
      if(card)card.outerHTML=monthlyAiCard(month);
      const btn=host.querySelector('[data-monthly-ai-run]');
      if(btn)btn.onclick=()=>{selected=month;render();host.querySelector('[data-monthly-ai-run]')?.click();};
      V.toast('월간 AI 리포트를 저장했어요.');
    }catch(err){if(state)state.textContent=err.message||'AI 리포트 생성에 실패했어요.';V.toast('월간 분석에 실패했어요. 기존 기록은 유지돼요.','error');}
    finally{monthlyAiBusy=false;if(aiButton.isConnected){aiButton.disabled=false;aiButton.textContent='AI 월간 종합 분석하기';}}
   };

   V.monthlyPracticePlans?.(host.querySelector('[data-monthly-plans]'),selected,items,rows);
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
V.route('vocal-growth',{title:'보컬 성장',tab:'growth',noAutoRefresh:true,
 render:()=>'<div data-growth class="growth-page"><div class="empty compact">분석 기록을 불러오는 중…</div></div>',
 mount(main){mount(main.querySelector('[data-growth]'));},
 leave(){request++;}
});
window.addEventListener('vzip:analysis-saved',()=>{if(location.hash==='#/vocal-growth'){const host=document.querySelector('[data-growth]');if(host)mount(host);}});
})();