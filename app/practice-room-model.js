/* Practice duration and reflection share the existing synced practice record. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VocalzipPracticeRoomModel=api;})(globalThis,()=>{
'use strict';
const names={orientation:'나의 시작점 적기',tone:'기준음 따라 부르기',melody:'짧은 선율 따라 부르기',rhythm:'단순 리듬 따라 하기',connect:'두 구절 연결하기',reflection:'가사의 상대와 목적 정하기',delivery:'가사를 말로 전하기',expressive:'표현을 담은 한 구절 제출',scene:'상황 속 한 구절 부르기',basics:'편한 소리로 한 구절 남기기',performance:'공연 연습 녹음과 회고'};
const stages={orientation:'starting-point',basics:'comfortable-voice',tone:'pitch-rhythm',melody:'pitch-rhythm',rhythm:'pitch-rhythm',delivery:'lyric-delivery',expressive:'musical-expression',reflection:'interpretation',scene:'scene-work',connect:'full-song',performance:'first-performance'};
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
  summary:String(s.room.summary||''),aiConditionCheck:!!s.room.aiConditionCheck,draft:{difficulty:String(s.room.draft?.difficulty||''),comfort:String(s.room.draft?.comfort||''),symptoms:Array.isArray(s.room.draft?.symptoms)?s.room.draft.symptoms.filter(v=>['통증','쉰 소리','목 잠김'].includes(v)).slice(0,3):[],memo:String(s.room.draft?.memo||'').slice(0,4000),answers:(s.room.draft?.answers||[]).slice(0,4).map(a=>String(a).slice(0,2000))},
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
 db.dailyGoals.push({id,date,title,source:'personal',sourceId:'practice-room:'+s.id,completed:false,order:db.dailyGoals.filter(g=>g.date===date).length,created:Date.now()});return true;
}
return {record,goal,validate,stages};
});
