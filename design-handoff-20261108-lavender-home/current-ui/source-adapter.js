/* Loaded after the unchanged current media/core modules and before view modules. */
(()=>{
'use strict';
const V=window.VZ,M=V.media,owner=window.__VZ_PREVIEW__.owner;
const date=d=>new Date(d+'T12:00:00Z').getTime(),blob=window.__previewSilence();
const media=[{id:'m1',name:'Defying Gravity · 2절 연습',songId:'s1',song:'Defying Gravity',recordedDate:'2026-11-07',created:date('2026-11-07'),source:'practice',occasion:'practice',durationSeconds:222,type:'audio/wav',blob,local:true,accountOwner:owner,review:'후반부 호흡을 길게 가져간 버전.'},{id:'m2',name:'호흡 연결 · 레슨 시범',songId:'s1',recordedDate:'2026-11-06',created:date('2026-11-06'),source:'lesson',occasion:'lesson',durationSeconds:495,type:'audio/wav',blob,local:true,accountOwner:owner,review:'고음 전 턱과 어깨 긴장을 풀기.'},{id:'m3',name:'On My Own · 리허설',songId:'s2',recordedDate:'2026-11-05',created:date('2026-11-05'),source:'practice',occasion:'performance',durationSeconds:246,type:'audio/wav',blob,local:true,accountOwner:owner,review:'시선과 동선 확인.'},{id:'m4',name:'Defying Gravity · 이전 연습',songId:'s1',recordedDate:'2026-10-31',created:date('2026-10-31'),source:'practice',occasion:'practice',durationSeconds:210,type:'audio/wav',blob,local:true,accountOwner:owner,review:'첫 번째 연습 버전.'}];
window.__VZ_PREVIEW__.media=media;
M.list=async()=>media.filter(x=>!(V.db.deleted?.media||[]).includes(x.id)).sort((a,b)=>b.created-a.created);M.cached=()=>media.filter(x=>!(V.db.deleted?.media||[]).includes(x.id));M.invalidate=()=>{};M.cloudError=()=>'';M.backupStatus=()=>({running:false,total:0,done:0,failed:0});M.scheduleBackup=()=>{};M.keepAwake=()=>{};
window.vzipReadMedia=async()=>media;window.vzipStorePracticeMedia=async item=>{const n=media.findIndex(x=>x.id===item.id);if(n>=0)media[n]=item;else media.push(item);};
M.saveBlob=async item=>{await window.vzipStorePracticeMedia({...item,local:true});window.dispatchEvent(new CustomEvent('vzip:media-updated'));return item;};
M.update=async(item,values)=>{const row=media.find(x=>x.id===item.id);if(row)Object.assign(row,values);window.dispatchEvent(new CustomEvent('vzip:media-updated'));};
M.remove=async item=>{const i=media.findIndex(x=>x.id===item.id);if(i>=0)media.splice(i,1);window.dispatchEvent(new CustomEvent('vzip:media-updated'));};
M.importFile=async()=>{throw Error('가져오기 화면의 항목을 확인하는 시안이에요. 실제 파일은 저장하지 않아요.');};
M.canRecord=()=>true;
M.capture=async({onTick,onLevel})=>{let state='inactive',elapsed=0,timer;return {get state(){return state},start(){state='recording';timer=setInterval(()=>{if(state==='recording'){elapsed+=.25;onTick(Math.floor(elapsed));onLevel(0);}},250)},pause(){state='paused'},resume(){state='recording'},cancel(){clearInterval(timer);state='inactive'},async stop(){clearInterval(timer);state='inactive';return {type:'audio/wav',blob:window.__previewSilence(Math.min(10,Math.max(1,elapsed))),durationSeconds:Math.max(1,elapsed),waveform:[],accountOwner:owner,releaseProtection(){}};}};};
const register=V.route;
V.route=(name,definition)=>{const def={...definition};if(['songs','library','calendar'].includes(name))def.back=false;if(name==='library'||name==='compare'||name==='song-suggest'||name==='import-hub'||name==='storage'||name==='upload-check')def.tab='library';if(name==='record')def.back=true;window.__VZ_PREVIEW__.routes||={};window.__VZ_PREVIEW__.routes[name]=def;register(name,def);};
const confirm=V.confirm;
V.confirm=(title,message,opts)=>{if(title==='나가기'&&location.hash.startsWith('#/record'))return new Promise(resolve=>{let result=false;V.sheet({title:'녹음을 중단할까요?',body:'<p class="muted">저장하지 않은 녹음은 사라져요.</p>',foot:'<div class="btn-row"><button type="button" class="btn secondary" data-close>계속 녹음</button><button type="button" class="btn" data-preview-stop>중단하기</button></div>',onMount:(el,close)=>{el.parentNode.querySelector('[data-preview-stop]').onclick=()=>{result=true;close();}},onClose:()=>resolve(result)});});return confirm(title,message,opts);};
})();
