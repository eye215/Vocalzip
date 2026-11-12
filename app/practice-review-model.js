/* Text evidence only. Never infer audible changes from numeric measurements. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipPracticeReview=api;})(globalThis,()=>{
'use strict';
const live=(db,key)=>(db[key]||[]).filter(x=>!(db.deleted?.[key]||[]).includes(x.id));
function context(db,{today,start,songId='',media=[],entries=[]}){
 const practices=live(db,'practices').filter(p=>p.date>=start&&p.date<=today&&(!songId||p.songId===songId));
 const goals=live(db,'dailyGoals').filter(g=>g.date>=start&&g.date<=today&&(!songId||g.songId===songId));
 const files=media.filter(m=>m.songId===songId&&!(db.deleted?.media||[]).includes(m.id)).slice().sort((a,b)=>String(a.recordedDate||a.created||'').localeCompare(String(b.recordedDate||b.created||'')));
 const sample=m=>m?{id:m.id,date:m.recordedDate||m.created,review:String(m.review||'').slice(0,700),rating:m.rating??null,measurements:m.analysis?.metrics?{stability:m.analysis.metrics.stability,intonation:m.analysis.metrics.intonation,breath:m.analysis.metrics.breath}:null}:null;
 const pair=songId&&files.length>=2?[sample(files[0]),sample(files.at(-1))]:[];
 const seconds=entries.filter(e=>e.date>=start&&e.date<=today&&(!songId||e.ref?.songId===songId)).reduce((n,e)=>n+(Number(e.minutes)||0)*60,0);
 const history=live(db,'practicePlans').filter(p=>p.period==='ai-review'&&p.date>=start&&p.date<=today&&(!songId||p.songId===songId));
 const homework=live(db,'assignments').filter(t=>t.status!=='done'&&(!t.startDate||t.startDate<=today)&&(!t.dueDate||t.dueDate>=today)).sort((a,b)=>String(a.dueDate||'9999').localeCompare(String(b.dueDate||'9999'))).slice(0,10).map(t=>({id:t.id,title:t.title,songId:t.songId||'',dueDate:t.dueDate||''}));
 const performances=live(db,'performances').filter(p=>(p.status||'preparing')==='preparing').map(p=>({title:p.title,songs:p.songLinks||[],dates:(p.sessions||[]).filter(x=>x.date>=today&&!['cancelled','completed'].includes(x.status)).map(x=>x.date),start:p.start})).filter(p=>p.dates.length||p.start>=today).slice(0,3);
 return {homework,performances,period:{start,end:today},song:live(db,'songs').find(s=>s.id===songId)?.title||'',songId,pair,actualMinutes:Math.round(seconds/60),
  goals:goals.map(g=>({title:g.title,completed:g.completed===true})),
  reports:live(db,'comparisonReports').filter(r=>songId&&r.songId===songId).slice(-3).map(r=>({notes:r.notes,goal:r.goal})),
  practice:practices.slice(-10).map(p=>({date:p.date,memo:p.memo,report:p.practiceRoom?.draft,aiObservation:p.practiceRoom?.aiCoach||''})),
  skipped:history.filter(p=>p.status==='skipped').map(p=>p.proposal?.action||''),
  caution:practices.some(p=>/목.{0,5}(아프|아파|통증|쉬었|잠겼)|쉰\s*(소리|목소리)/.test(p.practiceRoom?.draft?.memo||p.memo||'')||p.practiceRoom?.draft?.symptoms?.length||['불편해','조금 힘들어'].includes(p.practiceRoom?.draft?.comfort))};
}
function todayItems(evidence,draft){
 if(evidence.caution)return [{kind:"ai",...draft}];
 const homework=evidence.homework.slice(0,2).map(t=>({kind:"homework",assignmentId:t.id,action:t.title,songId:t.songId,reason:t.dueDate?"등록한 숙제 · "+t.dueDate+"까지":"남아 있는 숙제를 먼저 확인해요.",minutes:5,days:1}));
 return [...homework,...(homework.some(t=>t.action===draft.action)?[]:[{kind:"ai",...draft}])].slice(0,3);
}
function proposal(result,evidence){
 const note=String(result.note||'');const line=label=>note.match(new RegExp('(?:'+label+')\\s*[:：]\\s*([^\\n]+)'))?.[1]||'';
 const reason=line('기록한 특징|들리는 특징')||'작성한 연습 기록을 참고했어요.';
 const action=evidence.caution?'소리 내는 연습을 쉬고 가사·회고 정리하기':line('다음 시도');
 if(!action)throw Error('다음 연습 제안이 비어 있어요. 다시 요청해 주세요.');
 return {reason,action,minutes:evidence.caution?5:5,days:3,songId:evidence.songId,section:'직접 정할 한 구절',note};
}
return {context,proposal,todayItems};
});
