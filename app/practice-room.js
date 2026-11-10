/* Isolated practice workspace. The parent owns only confirmed time and next goals. */
(()=>{
'use strict';
const V=window.VZ,M=window.VocalzipPracticeRoomModel;if(!V||!M)return;
let frame=null,locked=false;
const assert=source=>{if(locked||window.VzipAccountScope?.leaving||!frame?.isConnected||source!==frame.contentWindow)throw Error('연습실을 다시 열어주세요.');};
window.VocalzipPracticeRoom={
 saveSubmission(input,source){assert(source);if(input.demo)return {ok:true,skipped:true};let changed=false;const ok=V.change(db=>{changed=M.record(db,input,V.today());},{silent:true});return {ok,changed};},
 saveGoal(input,source){assert(source);if(input.demo)return {ok:true,skipped:true};let changed=false;const ok=V.change(db=>{changed=M.goal(db,input,V.today());},{silent:true});return {ok,changed};},
 openGoals(source){assert(source);V.nav('#/home');},
 context(source){assert(source);return {totalSeconds:Math.round(V.timeEntries().reduce((n,p)=>n+p.minutes*60,0)),goals:(V.db.dailyGoals||[]).filter(g=>g.date===V.today()).map(g=>({title:g.title,completed:g.completed}))};}
};
window.VzipAccountScope?.beforeLeave(()=>{locked=true;frame?.contentWindow?.postMessage({type:'vocalzip:room-lock'},location.origin);});
V.route('practice-room',{title:'노래 연습실',back:true,tab:'home',noSettings:true,noAutoRefresh:true,
 render:()=>'<iframe class="vzip-practice-room-frame" title="노래 연습실 · 과제와 제출" src="practice-room/index.html?v=1" allow="microphone"></iframe>',
 mount(host){frame=host.querySelector('iframe');V.setGuard(()=>{try{return frame?.contentWindow?.VocalzipRoomBusy?.()?'진행 중인 연습이 있어요. 제출 전 녹음은 화면을 나가면 사라져요. 나갈까요?':'';}catch{return '';}});},
 leave(){frame?.contentWindow?.postMessage({type:'vocalzip:room-lock'},location.origin);frame=null;V.setGuard(null);}
});
})();
