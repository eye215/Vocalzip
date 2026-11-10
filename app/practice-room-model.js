/* Only practice duration and explicitly chosen next goals cross the room boundary. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VocalzipPracticeRoomModel=api;})(globalThis,()=>{
'use strict';
const names={tone:'기준음 따라 부르기',melody:'짧은 선율 따라 부르기',rhythm:'단순 리듬 따라 하기',connect:'두 구절 연결하기',reflection:'가사의 상대와 목적 정하기',expressive:'표현을 담은 한 구절 제출',basics:'편한 소리로 한 구절 남기기',performance:'공연 연습 녹음과 회고'};
function validate(input){
 if(!input||!names[input.task]||typeof input.id!=='string'||!/^[a-zA-Z0-9-]{8,80}$/.test(input.id))throw Error('과제 정보를 확인할 수 없어요.');
 if(!Number.isFinite(input.seconds)||input.seconds<0||input.seconds>21600)throw Error('연습 시간을 확인할 수 없어요.');
 return input;
}
function record(db,input,date){
 const s=validate(input);if(s.demo)return false;
 db.practices||=[];const id='practice-room:'+s.id;if(db.practices.some(p=>p.id===id))return false;
 if(s.seconds<1)return false;
 const seconds=Math.floor(s.seconds),minutes=seconds/60;
 db.practices.push({id,date,minutes,manualMinutes:minutes,practiceRoomSeconds:seconds,practiceTimeSource:'manual',practiceMode:'training',songId:'',categoryLabel:'노래 연습실',detail:names[s.task],memo:'[노래 연습실] '+names[s.task],created:Date.now()});return true;
}
function goal(db,input,date){
 const s=validate(input);if(s.demo)return false;
 const task=input.nextTask;if(!names[task])throw Error('다음 과제를 확인할 수 없어요.');
 const id='practice-room:'+s.id+':next';db.dailyGoals||=[];if(db.dailyGoals.some(g=>g.id===id))return false;
 db.dailyGoals.push({id,date,title:names[task]+(input.short?' · 짧은 구간 복습':''),source:'personal',sourceId:'practice-room:'+s.id,completed:false,order:db.dailyGoals.filter(g=>g.date===date).length,created:Date.now()});return true;
}
return {record,goal,validate};
});
