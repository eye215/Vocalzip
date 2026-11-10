/* Isolated practice workspace. The parent owns synced records and R2 media. */
(()=>{
'use strict';
const V=window.VZ,M=window.VocalzipPracticeRoomModel;if(!V||!M)return;
let frame=null,locked=false;
const assert=source=>{if(locked||window.VzipAccountScope?.leaving||!frame?.isConnected||source!==frame.contentWindow)throw Error('연습실을 다시 열어주세요.');};
window.VocalzipPracticeRoom={
 saveSubmission(input,source){assert(source);if(input.demo)return {ok:true,skipped:true};let changed=false;const date=input.room?.date&&Number.isFinite(Date.parse(input.room.date))?V.ymd(new Date(input.room.date)):V.today();const ok=V.change(db=>{changed=M.record(db,input,date);},{silent:true});return {ok,changed};},
 history(source){assert(source);return (V.db.practices||[]).filter(p=>p.practiceRoom).map(p=>p.practiceRoom);},
 cloudReady(source){assert(source);return !!window.vzipCloudSignedIn?.()&&!!window.VzipR2?.configured?.();},
 async uploadAudio(input,blob,source){assert(source);if(!window.vzipCloudSignedIn?.())throw Error('클라우드 로그인이 필요해요.');if(!await window.VzipR2?.ready?.())throw Error('R2 저장소 연결을 확인하지 못했어요.');assert(source);
  if(!/^[a-zA-Z0-9-]{8,80}-[01]$/.test(input.id)||!blob||blob.size<1||blob.size>25*1024*1024)throw Error('녹음 파일을 확인해 주세요.');
  const type=(blob.type||'audio/webm').split(';')[0],ext=type.includes('wav')?'wav':type.includes('mpeg')?'mp3':type.includes('mp4')||type.includes('aac')?'m4a':type.includes('ogg')?'ogg':'webm';
  const media=await window.vzipCloudImport(new File([blob],input.id+'.'+ext,{type}),{id:input.id,name:String(input.name||'연습실 녹음').slice(0,100),type,source:'practice',durationSeconds:Number(input.duration)||0,created:Date.now(),recordedDate:V.today()},undefined,{requireR2:true});
  assert(source);if(media.storageProvider!=='r2'||!media.r2Key)throw Error('R2 저장을 확인하지 못했어요.');return {id:media.id,cloud:true};
 },
 async audioUrl(id,source){assert(source);if(!/^[a-zA-Z0-9-]{8,80}-[01]$/.test(id))throw Error('녹음 ID를 확인해 주세요.');const media=(await window.vzipCloudMediaList()).find(m=>m.id===id&&m.storageProvider==='r2');assert(source);if(!media)throw Error('클라우드 녹음을 찾지 못했어요.');return window.vzipCloudMediaUrl(media);},
 saveGoal(input,source){assert(source);if(input.demo)return {ok:true,skipped:true};let changed=false;const ok=V.change(db=>{changed=M.goal(db,input,V.today());},{silent:true});return {ok,changed};},
 openGoals(source){assert(source);V.nav('#/home');},
 context(source){assert(source);return {totalSeconds:Math.round(V.timeEntries().reduce((n,p)=>n+p.minutes*60,0)),goals:(V.db.dailyGoals||[]).filter(g=>g.date===V.today()).map(g=>({title:g.title,completed:g.completed}))};}
};
window.VzipAccountScope?.beforeLeave(()=>{locked=true;frame?.contentWindow?.postMessage({type:'vocalzip:room-lock'},location.origin);});
for(const event of ['vzip:auth-changed','vzip:data-changed'])window.addEventListener(event,()=>{if(frame?.isConnected&&!locked)frame.contentWindow?.postMessage({type:'vocalzip:room-refresh'},location.origin);});
V.route('practice-room',{title:'노래 연습실',back:true,tab:'home',noSettings:true,noAutoRefresh:true,
 render:()=>'<iframe class="vzip-practice-room-frame" title="노래 연습실 · 과제와 제출" src="practice-room/index.html?v=5" allow="microphone"></iframe>',
 mount(host){frame=host.querySelector('iframe');V.setGuard(()=>{try{return frame?.contentWindow?.VocalzipRoomBusy?.()?'진행 중인 연습이 있어요. 제출 전 녹음은 화면을 나가면 사라져요. 나갈까요?':'';}catch{return '';}});},
 leave(){frame?.contentWindow?.postMessage({type:'vocalzip:room-lock'},location.origin);frame=null;V.setGuard(null);}
});
})();
