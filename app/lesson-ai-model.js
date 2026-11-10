(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipLessonAI=api;})(globalThis,()=>{
'use strict';
const norm=s=>String(s||'').trim().replace(/\s+/g,' ');
function context(db,id){const l=(db.lessons||[]).find(x=>x.id===id&&!(db.deleted?.lessons||[]).includes(id));if(!l)throw Error('레슨을 찾을 수 없어요.');return {id:l.id,feedback:String(l.feedback||''),songFeedback:l.songFeedback||{},memo:String(l.memo||''),homework:(db.assignments||[]).filter(t=>!(db.deleted?.assignments||[]).includes(t.id)).filter(t=>(t.lessonIds||[t.lessonId]).includes(id)).map(t=>({id:t.id,title:t.title,status:t.status,songId:t.songId||''}))};}
function candidate(result){const title=String(result.note||'').match(/다음 시도\s*[:：]\s*([^\n]+)/)?.[1]?.trim();if(!title)throw Error('숙제 후보가 비어 있어요.');return title.slice(0,500);}
function apply(db,{lessonId,snapshot,title,existingId='',songId='',date,id,goalId}){
 if(JSON.stringify(context(db,lessonId))!==snapshot)throw Error('레슨 피드백이나 숙제가 변경됐어요. 다시 확인해주세요.');
 title=norm(title);if(!title||title.length>500)throw Error('숙제 내용을 확인해 주세요.');
 const existing=(db.assignments||[]).filter(t=>!(db.deleted?.assignments||[]).includes(t.id)).find(t=>existingId?t.id===existingId:norm(t.title)===title&&String(t.songId||'')===songId);
 if(existingId&&!existing)throw Error('연결할 숙제를 찾을 수 없어요.');
 if(existing?.status==='done')throw Error('완료한 숙제예요. 새 목표로 추가하려면 내용을 직접 확인해주세요.');
 const assignment=existing||{id,title,lessonId,lessonIds:[lessonId],songId,status:'active',startDate:date,created:Date.now(),source:'ai-candidate',aiSourceLessonId:lessonId};
 const old=(db.dailyGoals||[]).find(g=>g.date===date&&g.source==='homework'&&g.sourceId===assignment.id);
 if(!existing){db.assignments||=[];db.assignments.push(assignment);}
 if(!old){db.dailyGoals||=[];db.dailyGoals.push({id:goalId,date,title:assignment.title,source:'homework',sourceId:assignment.id,songId:assignment.songId||'',completed:false,created:Date.now()});}
 return {assignmentId:assignment.id,existing:!!existing,duplicate:!!old};
}
return {context,candidate,apply};
});
