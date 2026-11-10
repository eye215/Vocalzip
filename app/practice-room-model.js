/* Practice duration and reflection share the existing synced practice record. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VocalzipPracticeRoomModel=api;})(globalThis,()=>{
'use strict';
const names={orientation:'나의 시작점 적기',tone:'기준음 따라 부르기',melody:'짧은 선율 따라 부르기',rhythm:'단순 리듬 따라 하기',connect:'두 구절 연결하기',reflection:'가사의 상대와 목적 정하기',delivery:'가사를 말로 전하기',expressive:'표현을 담은 한 구절 제출',scene:'상황 속 한 구절 부르기',basics:'편한 소리로 한 구절 남기기',performance:'공연 연습 녹음과 회고'};
const stages={orientation:'starting-point',basics:'comfortable-voice',tone:'pitch-rhythm',melody:'pitch-rhythm',rhythm:'pitch-rhythm',delivery:'lyric-delivery',expressive:'musical-expression',reflection:'interpretation',scene:'scene-work',connect:'full-song',performance:'first-performance'};
function conditionFor(r){const symptoms=Array.isArray(r.draft?.symptoms)?r.draft.symptoms:[];if(/목.{0,5}(아프|아파|통증|쉬었|쉼|잠겼)|쉰\s*(소리|목소리)/.test(String(r.draft?.memo||''))||symptoms.length||r.draft?.comfort==='불편해'||r.mood==='연습 쉬기'||r.recommendation==='rest')return 'rest';if(r.draft?.comfort==='조금 힘들어'||r.mood==='조금 피곤해'||r.aiConditionCheck||r.recommendation==='check')return 'check';return 'continue';}
function chooseRecommendation(r){const condition=conditionFor(r);if(condition==='rest')return {title:'오늘은 노래 연습을 멈추고 쉬어요.',body:'직접 남긴 불편함이나 목 상태를 우선했어요. 쉰 소리나 통증이 계속되면 이비인후과에서 확인받으세요.',label:'가사·회고 목표 저장',task:'reflection',variant:'normal',vocal:false};if(condition==='check')return {title:'컨디션을 먼저 확인해요.',body:r.aiConditionCheck?'녹음에서 소리 변화가 들리지만 목의 실제 상태는 알 수 없어요. 통증·쉼·불편함을 확인하고 오늘은 소리 내는 연습을 쉬세요.':'조금 힘들거나 피곤했다고 남겼어요. 오늘은 소리 내는 연습보다 회고를 추천해요.',label:'가사·회고 목표 저장',task:'reflection',variant:'normal',vocal:false};if(r.recommendation==='uncertain'||r.analysis?.unit==='cent'&&r.analysis.metric>=600)return {title:'평가를 보류하고, 다시 확인해요.',body:'이번 제출은 실패로 처리하지 않아요. 조용한 환경에서 같은 구간을 짧게 녹음해보세요.',label:'같은 과제 다시 확인',task:r.task,variant:r.variant};const allowedNext={orientation:['basics','reflection'],basics:['basics','tone','melody','reflection'],tone:['tone','melody','rhythm','reflection'],melody:['tone','melody','rhythm','connect','reflection'],rhythm:['rhythm','melody','reflection'],connect:['connect','melody','expressive','reflection'],delivery:['delivery','expressive','reflection'],expressive:['expressive','delivery','scene','reflection'],scene:['scene','expressive','connect','reflection'],reflection:['reflection','delivery','expressive'],performance:['scene','connect','reflection']};
  if(allowedNext[r.task]?.includes(r.aiNextTask)&&names[r.aiNextTask]){const next=r.aiNextTask,reason=String(r.aiCoach||'').match(/다음 시도\s*[:：]\s*([^\n]{1,100})/)?.[1];return {title:next==='reflection'?'가사를 정리하며 다음 표현을 생각해요.':`${names[next]}부터 해봐요.`,body:reason||'녹음에서 들린 특징과 내 체감 난도를 참고해 골랐어요. 편한 범위에서 짧게 시도해요.',label:'AI 추천 목표 저장',task:next,variant:next!=='reflection'&&r.draft.difficulty==='너무 어려워'?'short':'normal',vocal:next!=='reflection'};}
  const nextStage={orientation:'basics',basics:'tone',delivery:'expressive',expressive:'reflection',reflection:'scene',scene:'connect'}[r.task];if(r.recommendation==='reflection'&&nextStage)return {title:'다음 단계에서 한 가지를 이어가요.',body:r.draft.memo?`내가 남긴 다음 연습: ${r.draft.memo}`:'이번 기록을 참고해 다음 과제를 직접 해보세요.',label:'다음 과제 목표 저장',task:nextStage,variant:'normal'};if(r.recommendation==='reflection')return {title:'회고에서 고른 한 가지를 적용해요.',body:r.draft.memo?`내가 남긴 다음 연습: ${r.draft.memo}`:'다음 연습에서 바꿀 점 하나를 정해보세요.',label:'한 구절 연습하기',task:'expressive',variant:'normal'};if(r.recommendation==='advance')return {title:r.task==='tone'?'다른 음을 연결해볼까요?':'새로운 선율에서 한 번 더 확인해요.',body:'한 번의 수행으로 숙달을 확정하지 않아요. 다른 구절에서도 같은 기술을 사용할 수 있는지 확인해요.',label:'다음 응용 과제 선택',task:r.task==='tone'?'melody':r.task==='melody'?'connect':r.task==='rhythm'?'melody':'melody',variant:'normal'};return {title:r.task==='tone'?'한 음을 다시 듣고, 짧게 확인해요.':'구간을 줄여, 다시 연결해봐요.',body:r.draft.difficulty==='너무 어려워'?'체감 난도를 반영해 과제를 작게 나눴어요. 전체를 반복하지 않고 짧은 구간부터 확인해요.':'기준 소리를 다시 듣고 짧은 부분만 연습해요. 연결이 어려우면 각각 부른 뒤 이어보세요.',label:r.task==='tone'?'기준음 복습 목표 저장':'짧은 구간 복습 목표 저장',task:r.task,variant:'short'};}

const durations={orientation:5,basics:5,tone:5,melody:8,rhythm:5,connect:10,reflection:8,delivery:8,expressive:10,scene:10,performance:15};
function recommend(r){
 if(!r||r.demo||!names[r.task])return null;
 const c=chooseRecommendation({...r,draft:r.draft||{}});
 const ai=conditionFor(r)==='continue'&&c.task===r.aiNextTask&&!!r.aiCoach;
 return {...c,key:'room:'+r.id,sourceId:r.id,songId:r.songId||'',source:ai?'ai':'rules',
  reason:ai?(String(r.aiCoach).match(/(?:들리는 특징|기록한 특징)\s*[:：]\s*([^\n]{1,160})/)?.[1]||c.body):c.body,action:names[c.task],minutes:c.variant==='short'?Math.min(5,durations[c.task]):durations[c.task],
  days:1,section:c.variant==='short'?'짧은 구간':'한 구절',vocal:c.vocal!==false&&c.task!=='reflection'};
}
function recommendations(db,date,songId=''){
 const deleted=db.deleted?.practices||[];
 const rooms=(db.practices||[]).filter(p=>!deleted.includes(p.id)&&p.date<=date).map(p=>p.practiceRoom)
  .filter(r=>r&&!r.demo&&(!songId||r.songId===songId)).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 // Only the most recent submission is actionable; older proposals remain in its history.
 const r=rooms[0];return r?[recommend(r)].filter(Boolean):[];
}

function validate(input){
 if(!input||!names[input.task]||typeof input.id!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(input.id))throw Error('과제 정보를 확인할 수 없어요.');
 if(!Number.isFinite(input.seconds)||input.seconds<0||input.seconds>21600)throw Error('연습 시간을 확인할 수 없어요.');
 if(input.room?.chapterId!=null&&input.room.chapterId!==stages[input.task])throw Error('과제와 로드맵 단계를 확인할 수 없어요.');
 return input;
}
function record(db,input,date){
 const s=validate(input);if(s.demo)return false;
 db.practices||=[];const id='practice-room:'+s.id;
 const existing=db.practices.find(p=>p.id===id);
 const room=s.room&&typeof s.room==='object'?{
  id:s.id,task:s.task,chapterId:stages[s.task],title:names[s.task],songId:String(s.room.songId||'').slice(0,80),date:String(s.room.date||new Date().toISOString()),
  analysis:s.room.analysis||{status:'reflection',summary:''},recommendation:String(s.room.recommendation||'reflection'),mood:String(s.room.mood||'').slice(0,60),
  summary:String(s.room.summary||''),aiCoach:String(s.room.aiCoach||'').slice(0,1100),aiConditionCheck:!!s.room.aiConditionCheck,aiNextTask:names[s.room.aiNextTask]?s.room.aiNextTask:'',draft:{difficulty:String(s.room.draft?.difficulty||''),comfort:String(s.room.draft?.comfort||''),symptoms:Array.isArray(s.room.draft?.symptoms)?s.room.draft.symptoms.filter(v=>['통증','쉰 소리','목 잠김'].includes(v)).slice(0,3):[],memo:String(s.room.draft?.memo||'').slice(0,4000),answers:(s.room.draft?.answers||[]).slice(0,4).map(a=>String(a).slice(0,2000))},
  demo:false,audioIds:(s.room.audioIds||[]).slice(0,2).map(a=>({id:String(a.id),name:String(a.name||'녹음'),duration:Number(a.duration)||0,cloud:!!a.cloud})),
  seconds:Math.floor(s.seconds),variant:s.room.variant==='short'?'short':'normal'
 }:null;
 if(existing){if(!room||JSON.stringify(existing.practiceRoom)===JSON.stringify(room))return false;existing.practiceRoom=room;existing.songId=room.songId;existing.practiceMode=room.songId?'song':'training';existing.mediaIds=room.audioIds.filter(a=>a.cloud).map(a=>a.id);return true;}
 const seconds=Math.floor(s.seconds),minutes=seconds/60;
 db.practices.push({id,date,minutes,manualMinutes:minutes,practiceRoomSeconds:seconds,practiceTimeSource:'manual',practiceMode:room?.songId?'song':'training',songId:room?.songId||'',categoryLabel:'노래 연습실',detail:names[s.task],memo:'[노래 연습실] '+names[s.task],created:Date.now(),...(room?{practiceRoom:room,mediaIds:room.audioIds.filter(a=>a.cloud).map(a=>a.id)}:{})});return true;
}
function goal(db,input,date){
 const s=validate(input);if(s.demo)return false;
 const task=input.nextTask;if(!names[task])throw Error('다음 과제를 확인할 수 없어요.');
 const id='practice-room:'+s.id+':next',title=names[task]+(input.short?' · 짧은 구간 복습':'');
 db.dailyGoals||=[];
 const sameTitle=value=>String(value||'').trim().replace(/\s+/g,' ')===title;
 if(db.dailyGoals.some(g=>g.id===id||g.date===date&&sameTitle(g.title)))return false;
 const room=db.practices?.find(p=>p.id==='practice-room:'+s.id)?.practiceRoom;
 const proposal=room?recommend(room):null;
 if(proposal&&proposal.task!==task)throw Error('추천이 변경됐어요. 다시 확인해 주세요.');
 db.dailyGoals.push({id,date,title,...(proposal?{songId:proposal.songId,recommendation:proposal}:{}),source:'personal',sourceId:'practice-room:'+s.id,completed:false,order:db.dailyGoals.filter(g=>g.date===date).length,created:Date.now()});return true;
}
return {record,goal,validate,stages,recommend,recommendations,conditionFor};
});
