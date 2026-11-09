/* VOCAL.zip v1.3 — authenticated cloud sync. Never erase local records automatically. */
(()=>{'use strict';
const localStorage = window.VzipAccountScope?.storage || window.localStorage;

if(window.VZIP_DEVICE_SESSIONS_ENABLED&&!window.VzipAccountScope)return;
const root=document.querySelector('#vzip-cloud-root');if(!root)return;
const url='https://chxnbtiyuyhiywzeshis.supabase.co';
const key='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoeG5idGl5dXloaXl3emVzaGlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2MDA0ODcsImV4cCI6MjEwOTE3NjQ4N30.65LSQMuaq8MQOpFUjCSyRT4ZITtNxKF3c_xa_ZVEi_E';
const dataKey='vocal-zip_mvp_v1',mediaDb=window.VzipAccountScope?.mediaDb()||'vocalzip_media_v1';
const $=s=>document.querySelector(s);
root.insertAdjacentHTML('beforeend',`<div class="cloud-controls">
<div id="cloud-signed-out"><label class="sr-only" for="cloud-email">이메일</label><input id="cloud-email" type="email" autocomplete="email" inputmode="email" placeholder="이메일 주소"><label class="sr-only" for="cloud-password">비밀번호</label><div class="vzip-password-row"><input id="cloud-password" type="password" autocomplete="current-password" minlength="8" placeholder="비밀번호 8자 이상 입력"><button type="button" class="smallbtn" id="cloud-show-password" aria-label="비밀번호 표시">보기</button></div><div class="cloud-actions"><button class="btn" type="button" id="cloud-login">로그인</button></div><button type="button" id="cloud-reset">비밀번호를 잊으셨나요?</button><div class="vzip-auth-join"><span>처음 오셨나요?</span><button type="button" id="cloud-signup">회원가입</button></div></div>
<div id="cloud-signed-in" hidden><p id="cloud-user" class="muted"></p><p class="muted">기기와 클라우드의 기록을 항목별로 합쳐 저장해요. 어느 쪽 기록도 덮어쓰거나 지우지 않아요.</p><div class="cloud-actions"><button type="button" class="btn" id="cloud-upload">지금 동기화 (기기·클라우드 합치기)</button><button type="button" class="btn secondary" id="cloud-download">클라우드 기록 합쳐서 불러오기</button><button type="button" class="btn secondary" id="cloud-media-upload">음원 클라우드 백업</button><button type="button" class="btn secondary" id="cloud-media-download">클라우드 음원 가져오기</button><button type="button" class="smallbtn" id="cloud-logout">로그아웃</button></div></div>
<p id="cloud-status" role="status" class="muted">연결 확인 중…</p></div>`);

// Dedicated full-screen authentication view. Keep local data untouched.
const authStyle=document.createElement('style');
authStyle.textContent=`#vzip-auth-screen{position:fixed;inset:0;z-index:99999;overflow-y:auto;background:radial-gradient(ellipse at 80% 5%,#283060 0%,transparent 53%),linear-gradient(160deg,#101026,#1c183a 65%,#11152c);color:#f7f4ff;padding:env(safe-area-inset-top) 22px calc(35px + env(safe-area-inset-bottom));font-family:system-ui,-apple-system,sans-serif}#vzip-auth-screen[hidden]{display:none!important}#vzip-auth-screen .vzip-auth-wrap{max-width:430px;margin:0 auto;padding-top:max(32px,7vh)}#vzip-auth-screen .vzip-auth-logo{font-size:38px;font-weight:850;letter-spacing:-1.6px;margin-bottom:6px}#vzip-auth-screen .vzip-auth-logo span{color:#c5a2ff}#vzip-auth-screen .vzip-auth-sub{color:#b6b4d3;margin-bottom:35px;font-size:14px}#vzip-auth-screen .vzip-auth-card{background:#ffffff0b;border:1px solid #ffffff26;border-radius:25px;padding:24px 21px;box-shadow:0 16px 50px #0003}#vzip-auth-screen h2{font-size:23px;color:#fff;margin:0 0 8px}#vzip-auth-screen .vzip-auth-note{color:#b8b6d0;font-size:13px;line-height:1.65;margin:0 0 18px}#vzip-auth-screen label{color:#f5f3ff;font-size:13px}#vzip-auth-screen input{background:#0c1029;border:1px solid #ffffff35;color:#fff;border-radius:13px;min-height:50px}#vzip-auth-screen button{cursor:pointer}#vzip-auth-screen .btn{min-height:49px}#vzip-auth-screen .cloud-actions{display:grid;grid-template-columns:1fr 1fr;gap:9px}#vzip-auth-screen .cloud-actions .btn{font-size:14px;padding:10px 7px}#vzip-auth-screen .muted{color:#b6b5d1}#vzip-auth-screen #cloud-reset{color:#ddd0ff;background:#ffffff12;border:1px solid #ffffff35;border-radius:11px;padding:11px}#vzip-auth-message{color:#dcd8ff;background:#ffffff10;border-radius:12px;padding:13px;margin-top:17px;font-size:13px;line-height:1.6}body.vzip-auth-locked{overflow:hidden}body.vzip-auth-locked>.app{pointer-events:none}#vzip-auth-screen .vzip-password-row{display:grid;grid-template-columns:minmax(0,1fr) 62px;gap:8px}#vzip-auth-screen .vzip-password-row input{min-width:0}#vzip-auth-screen .vzip-password-row button{color:white;background:#ffffff20;border:1px solid #ffffff35;border-radius:10px}`;
authStyle.textContent+=`#vzip-auth-screen{background:radial-gradient(ellipse 420px 460px at 50% 26%,#211332 0%,#0B0911 80%);color:#F7F5FC;padding:max(20px,env(safe-area-inset-top)) 20px calc(32px + env(safe-area-inset-bottom));font-family:var(--font,'Pretendard',system-ui,sans-serif);letter-spacing:-.02em}#vzip-auth-screen .vzip-auth-wrap{max-width:390px;min-height:calc(100dvh - 52px);display:flex;flex-direction:column;margin:auto;padding-top:8px}#vzip-auth-screen .vzip-auth-brand{display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:48px}#vzip-auth-screen .vzip-auth-brand>i{font-size:26px;color:#BC7AFF}#vzip-auth-screen .vzip-auth-logo{margin:0;font-family:var(--font,'Pretendard',system-ui,sans-serif);font-size:36px;font-weight:850;letter-spacing:-1.6px}#vzip-auth-screen .vzip-auth-logo span{color:#C5A2FF}#vzip-auth-screen .vzip-auth-intro{padding:clamp(28px,7vh,60px) 4px 26px}#vzip-auth-screen .vzip-auth-intro>span{color:#BC7AFF;font-size:13px;font-weight:650}#vzip-auth-screen .vzip-auth-intro h2{margin:12px 0 12px;font-family:var(--font,'Pretendard',system-ui,sans-serif);font-size:clamp(30px,8vw,38px);line-height:1.25;font-weight:700;letter-spacing:-.045em;color:#F7F5FC}#vzip-auth-screen .vzip-auth-intro p{margin:0;color:#AAA3B7;font-size:14px;line-height:21px}#vzip-auth-screen .vzip-auth-card{margin-top:0;padding:24px 20px 20px;border:1px solid #352B40;border-radius:24px;background:#1B1724;box-shadow:0 16px 45px #0003}#vzip-auth-screen .vzip-auth-card h3{margin:0 0 5px;color:#F7F5FC;font-size:18px;line-height:26px}#vzip-auth-screen .vzip-auth-note{margin:0 0 22px;color:#AAA3B7;font-size:13px;line-height:19px}#vzip-auth-screen #cloud-signed-out{display:flex;flex-direction:column}#vzip-auth-screen #cloud-signed-out>label,#vzip-auth-screen .vzip-auth-password-label label{font-size:13px;font-weight:600;color:#DDD4E7}#vzip-auth-screen #cloud-email,#vzip-auth-screen #cloud-password{width:100%;min-height:52px;margin-top:8px;padding:0 15px;border:1px solid #463B51;border-radius:14px;background:#120F1B;color:#F7F5FC;font:inherit;font-size:15px;outline:none}#vzip-auth-screen input::placeholder{color:#786D84}#vzip-auth-screen input:focus{border-color:#A35AFA!important;box-shadow:0 0 0 3px #A35AFA33}#vzip-auth-screen .vzip-auth-password-label{display:flex;align-items:center;justify-content:space-between;gap:8px;margin-top:20px}#vzip-auth-screen #cloud-reset{min-height:44px;padding:0;border:0;background:transparent;color:#BC84ED;font-size:12px;font-weight:600;white-space:nowrap}#vzip-auth-screen .vzip-password-row{display:flex;gap:8px}#vzip-auth-screen .vzip-password-row input{min-width:0;flex:1}#vzip-auth-screen .vzip-password-row button{align-self:flex-end;min-width:54px;min-height:52px;border:1px solid #463B51;border-radius:14px;background:#251C30;color:#DDD4E7;font-size:13px}#vzip-auth-screen .cloud-actions{display:block;margin-top:24px}#vzip-auth-screen #cloud-login{width:100%;min-height:52px;border:0;border-radius:16px;background:linear-gradient(120deg,#9557FF,#7A32F5);color:#fff;font:700 16px var(--font,'Pretendard',system-ui,sans-serif)}#vzip-auth-screen .vzip-auth-join{display:flex;align-items:center;justify-content:center;gap:7px;margin-top:20px;color:#AAA3B7;font-size:13px}#vzip-auth-screen #cloud-signup{min-height:44px;padding:0;border:0;background:transparent;color:#C58CFF;font-size:13px;font-weight:700}#vzip-auth-screen .vzip-auth-help{margin:8px 0 0;text-align:center;color:#92879E;font-size:11px;line-height:17px}#vzip-auth-message{margin:16px 0 0;padding:10px 12px;border:1px solid #463B51;border-radius:12px;background:#251C30;color:#DDD4E7;font-size:12px;line-height:18px}#vzip-auth-screen button:focus-visible{outline:2px solid #C58CFF;outline-offset:2px}@media(max-height:720px){#vzip-auth-screen .vzip-auth-intro{padding:30px 4px 26px}#vzip-auth-screen .vzip-auth-card{margin-top:0}}`;
authStyle.textContent+=`#vzip-auth-screen .vzip-auth-card[hidden]{display:none!important}#vzip-auth-screen #cloud-email,#vzip-auth-screen #cloud-password{margin-top:0}#vzip-auth-screen #cloud-email{margin-bottom:10px}#vzip-auth-screen .vzip-password-row input{margin:0}#vzip-auth-screen .cloud-actions{margin-top:18px}#vzip-auth-screen #cloud-reset{align-self:center;margin-top:8px;min-height:40px}#vzip-auth-screen .vzip-auth-join{margin-top:12px}#vzip-auth-screen .vzip-auth-signup-fields{display:grid;gap:10px}#vzip-auth-screen .vzip-auth-signup-fields input{width:100%;min-height:52px;padding:0 15px;border:1px solid #463B51;border-radius:14px;background:#120F1B;color:#F7F5FC;font:inherit;font-size:15px;outline:none}#vzip-auth-screen .vzip-auth-submit{width:100%;min-height:52px;margin-top:18px;border:0;border-radius:16px;background:linear-gradient(120deg,#9557FF,#7A32F5);color:#fff;font:700 16px var(--font,'Pretendard',system-ui,sans-serif)}#vzip-auth-screen .vzip-auth-back{display:flex;align-items:center;gap:6px;min-height:44px;margin:-10px 0 10px;padding:0;border:0;background:transparent;color:#BC84ED;font:600 13px var(--font,'Pretendard',system-ui,sans-serif)}#vzip-auth-screen #cloud-signup-login{min-height:44px;padding:0;border:0;background:transparent;color:#C58CFF;font-size:13px;font-weight:700}#vzip-auth-screen .vzip-auth-input{width:100%;min-height:52px;padding:0 15px;border:1px solid #463B51;border-radius:14px;background:#120F1B;color:#F7F5FC;font:inherit;font-size:15px;outline:none}#vzip-auth-screen .vzip-auth-stack{display:grid;gap:10px}#vzip-auth-screen .vzip-auth-email{color:#F7F5FC;font-weight:650;overflow-wrap:anywhere}#vzip-auth-screen .vzip-auth-secondary{display:block;margin:15px auto 0;min-height:44px;border:0;background:transparent;color:#C58CFF;font:700 13px var(--font,'Pretendard',system-ui,sans-serif)}#vzip-auth-screen .vzip-auth-divider{display:flex;align-items:center;gap:12px;margin:18px 0;color:#857B91;font-size:12px}#vzip-auth-screen .vzip-auth-divider:before,#vzip-auth-screen .vzip-auth-divider:after{content:'';height:1px;flex:1;background:#463B51}#vzip-auth-screen .vzip-kakao{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:52px;border:0;border-radius:16px;background:#FEE500;color:#191919;font:700 15px var(--font,'Pretendard',system-ui,sans-serif)}#vzip-auth-screen .vzip-kakao svg{width:19px;height:19px;fill:#191919}`;
document.head.appendChild(authStyle);
const authScreen=document.createElement('div');
authScreen.id='vzip-auth-screen';
authScreen.innerHTML='<div class="vzip-auth-wrap"><div class="vzip-auth-brand"><div class="vzip-auth-logo">VOCAL<span>.zip ♫</span></div></div><div class="vzip-auth-intro"><span>나의 보컬 아카이브</span><h2>노래의 모든 순간을<br>이어가요.</h2><p>녹음과 연습 기록을 한곳에서 다시 만나세요.</p></div><div class="vzip-auth-card vzip-auth-login-card"><h3>로그인</h3><p class="vzip-auth-note">계정에 저장한 기록을 이어서 볼 수 있어요.</p><div id="vzip-auth-fields"></div><div class="vzip-auth-divider">또는</div><button type="button" class="vzip-kakao" data-kakao><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5C6.2 2.5 1.5 6.2 1.5 10.8c0 3 2 5.6 5 7.1l-.9 3.3c-.1.4.3.7.7.5l3.9-2.6c.6.1 1.2.1 1.8.1 5.8 0 10.5-3.7 10.5-8.4S17.8 2.5 12 2.5Z"/></svg>카카오로 계속하기</button></div><div class="vzip-auth-card vzip-auth-signup-card" hidden><button type="button" class="vzip-auth-back" id="cloud-back-login"><i class="ph ph-arrow-left" aria-hidden="true"></i> 로그인으로</button><h3>회원가입</h3><p class="vzip-auth-note">계정을 만들고 노래의 기록을 이어가세요.</p><div class="vzip-auth-signup-fields"><label class="sr-only" for="cloud-signup-email">이메일</label><input id="cloud-signup-email" type="email" autocomplete="email" inputmode="email" placeholder="이메일 주소"><label class="sr-only" for="cloud-signup-password">비밀번호</label><input id="cloud-signup-password" type="password" autocomplete="new-password" minlength="8" placeholder="비밀번호 8자 이상 입력"><label class="sr-only" for="cloud-signup-confirm">비밀번호 확인</label><input id="cloud-signup-confirm" type="password" autocomplete="new-password" minlength="8" placeholder="비밀번호 다시 입력"></div><button type="button" class="vzip-auth-submit" id="cloud-signup-submit">이메일로 회원가입</button><div class="vzip-auth-divider">또는</div><button type="button" class="vzip-kakao" data-kakao><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5C6.2 2.5 1.5 6.2 1.5 10.8c0 3 2 5.6 5 7.1l-.9 3.3c-.1.4.3.7.7.5l3.9-2.6c.6.1 1.2.1 1.8.1 5.8 0 10.5-3.7 10.5-8.4S17.8 2.5 12 2.5Z"/></svg>카카오로 계속하기</button><div class="vzip-auth-join"><span>이미 계정이 있으신가요?</span><button type="button" id="cloud-signup-login">로그인</button></div></div><div class="vzip-auth-card vzip-auth-verify-card" hidden><button type="button" class="vzip-auth-back" data-auth-login><i class="ph ph-arrow-left" aria-hidden="true"></i> 로그인으로</button><h3>이메일을 확인해 주세요</h3><p class="vzip-auth-note"><span class="vzip-auth-email" id="cloud-verify-email"></span> 주소로 확인 메일을 보냈어요. 메일의 링크를 누르면 가입이 완료됩니다.</p><button type="button" class="vzip-auth-submit" id="cloud-resend-signup">확인 메일 다시 보내기</button><button type="button" class="vzip-auth-secondary" id="cloud-change-email">이메일 수정하기</button></div><div class="vzip-auth-card vzip-auth-recovery-card" hidden><button type="button" class="vzip-auth-back" data-auth-login><i class="ph ph-arrow-left" aria-hidden="true"></i> 로그인으로</button><h3>비밀번호 찾기</h3><p class="vzip-auth-note">가입한 이메일로 비밀번호 재설정 링크를 보내드려요.</p><label class="sr-only" for="cloud-recovery-email">이메일</label><input class="vzip-auth-input" id="cloud-recovery-email" type="email" autocomplete="email" inputmode="email" placeholder="이메일 주소"><button type="button" class="vzip-auth-submit" id="cloud-recovery-send">재설정 메일 보내기</button></div><div class="vzip-auth-card vzip-auth-recovery-sent-card" hidden><button type="button" class="vzip-auth-back" data-auth-login><i class="ph ph-arrow-left" aria-hidden="true"></i> 로그인으로</button><h3>메일을 확인해 주세요</h3><p class="vzip-auth-note"><span class="vzip-auth-email" id="cloud-recovery-sent-email"></span> 주소로 재설정 링크를 요청했어요. 메일이 보이지 않으면 스팸함도 확인해 주세요.</p><button type="button" class="vzip-auth-submit" id="cloud-recovery-resend">다시 보내기</button></div><div class="vzip-auth-card vzip-auth-new-password-card" hidden><h3>새 비밀번호 설정</h3><p class="vzip-auth-note">새 비밀번호를 8자 이상 입력해 주세요.</p><div class="vzip-auth-stack"><label class="sr-only" for="cloud-new-password">새 비밀번호</label><input class="vzip-auth-input" id="cloud-new-password" type="password" autocomplete="new-password" placeholder="새 비밀번호 8자 이상"><label class="sr-only" for="cloud-new-password-confirm">새 비밀번호 확인</label><input class="vzip-auth-input" id="cloud-new-password-confirm" type="password" autocomplete="new-password" placeholder="새 비밀번호 다시 입력"></div><button type="button" class="vzip-auth-submit" id="cloud-new-password-submit">비밀번호 변경하기</button></div><p id="vzip-auth-message" role="status">로그인 상태를 확인하고 있어요…</p></div>';
document.body.appendChild(authScreen);
authScreen.querySelector('#vzip-auth-fields').appendChild(root.querySelector('#cloud-signed-out'));
// After moving the form into the full-screen login, query it from its actual location.
const authField=selector=>authScreen.querySelector(selector);
function showAuthView(view){if(view==='signup')authField('#cloud-signup-email').value=authField('#cloud-email').value.trim();if(view==='recovery')authField('#cloud-recovery-email').value=authField('#cloud-email').value.trim();if(view==='login'&&authField('#cloud-signup-email').value)authField('#cloud-email').value=authField('#cloud-signup-email').value.trim();authScreen.querySelectorAll('.vzip-auth-card').forEach(card=>{card.hidden=!card.classList.contains('vzip-auth-'+view+'-card')});authScreen.dataset.view=view;authScreen.scrollTop=0;say('로그인하면 다른 기기에서도 기록을 불러올 수 있어요.');}
function updateAuthScreen(){document.getElementById('vzip-boot-cover')?.remove();const signedIn=!!user&&(!window.VzipAccountScope||sessionVerified)&&!recoveryMode;authScreen.hidden=signedIn;if(signedIn){showAuthView('login');}if(window.VzipAccountScope)document.querySelectorAll('.v-app,.v-nav,.sheet-back').forEach(el=>{el.inert=!signedIn;});document.body.classList.toggle('vzip-auth-locked',!signedIn);const form=document.getElementById('cloud-signed-out');if(form)form.hidden=signedIn;}

const status=$('#cloud-status');let client,user=null,ready=false,uploadTimer=null,busy=false;
let sessionVerified=false,authGeneration=0,sessionChecking=false,activeSessionId=null,recoveryMode=false;
window.vzipCloudSessionId=()=>sessionVerified?activeSessionId:null;
function say(message){status.textContent=message;const a=document.querySelector('#vzip-auth-message');if(a){a.textContent=message;a.hidden=message==='로그인하면 다른 기기에서도 기록을 불러올 수 있어요.'}}
function localData(){try{return JSON.parse(localStorage.getItem(dataKey)||'null')}catch{return null}}
function count(data){return (data?.lessons?.length||0)+(data?.practices?.length||0)+(data?.assignments?.length||0)}
function mediaExtension(type){
 return ({'audio/mp4':'m4a','video/mp4':'mp4','video/quicktime':'mov','audio/mpeg':'mp3',
 'audio/wav':'wav','audio/x-wav':'wav','audio/aac':'aac','audio/ogg':'ogg','audio/flac':'flac',
 'audio/webm':'webm','video/webm':'webm'})[(type||'').split(';')[0].toLowerCase()]||'bin';
}
function localMedia(){return new Promise((resolve,reject)=>{const req=indexedDB.open(mediaDb,1);req.onupgradeneeded=()=>req.result.createObjectStore('recordings',{keyPath:'id'});req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('recordings','readonly'),get=tx.objectStore('recordings').getAll();get.onsuccess=()=>resolve(get.result||[]);get.onerror=()=>reject(get.error);tx.oncomplete=()=>db.close()}})}
async function remoteData(){const {data,error}=await client.from('vocal_data').select('payload,updated_at').eq('user_id',user.id).maybeSingle();if(error)throw error;return data}
window.vzipAccountImportBaseline=async()=>{
 const owner=user?.id;
 if(!owner||!sessionVerified||owner!==window.VzipAccountScope?.owner)throw Error('로그인을 확인한 뒤 이전해 주세요.');
 const row=await remoteData(),media=await window.vzipCloudMediaList();
 if(user?.id!==owner||!sessionVerified||window.VzipAccountScope.leaving)throw Error('계정이 변경되어 이전을 중단했어요.');
 return {payload:row?.payload||{},mediaIds:media.map(x=>String(x.id))};
};
/* Sync merges device and cloud records by id (data-merge.js): nothing on either side is lost;
   only records deleted on purpose (tombstones) disappear. The device copy before any local
   rewrite is kept as vzip_before_cloud_<time> (last 5). */
const Merge=window.VzipDataMerge;
let syncAgain=false,syncFailed=false;
function snapshot(data){if(!data)return;try{localStorage.setItem('vzip_before_cloud_'+Date.now(),JSON.stringify(data));const keys=[];for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(/^vzip_before_cloud_\d+$/.test(k||''))keys.push(k)}keys.sort().slice(0,-5).forEach(k=>localStorage.removeItem(k))}catch{}}
/* Conditional writes: the server copy is replaced only if nobody saved it since it was read (same
   updated_at). Otherwise it is read again and merged again, so a save from another device in between
   is never dropped. */
const wait=ms=>new Promise(r=>setTimeout(r,ms));
function sameVersion(query,at){return at==null?query.is('updated_at',null):query.eq('updated_at',at)}
// CAS tokens must advance even when the browser clock stalls or runs behind the server.
function nextVersion(at){return new Date(Math.max(Date.now(),(Date.parse(at)||0)+1)).toISOString()}
async function sync({silent=false,reload=false}={}){
 if(!user||(window.VzipAccountScope&&!sessionVerified))return;if(busy){syncAgain=true;return}
 const syncOwner=user.id,checkOwner=()=>{if(user?.id!==syncOwner||(window.VzipAccountScope&&!sessionVerified))throw Error('계정이 변경되어 동기화를 중단했어요.');};
 busy=true;let local=null,merged=null,changedLocal=false;
 try{
  for(let attempt=0;;attempt++){
   const row=await remoteData();checkOwner();
   if(row&&'payload' in row&&!Merge.valid(row.payload))throw Error('클라우드 기록 형식을 확인하지 못했어요. 동기화를 중단합니다.');
   const remote=row?.payload||null;
   // The device copy is read only now, right before it may be rewritten: an edit made while
   // waiting for the server is merged too, never overwritten.
   local=localData();
   if(!local&&!remote){say('아직 저장된 기록이 없어요.');return}
   merged=remote?(window.VzipAccountScope&&!localStorage.getItem('vzip_account_dirty')?remote:Merge.merge(local||{},remote).data):local;
   if(!Merge.valid(merged))throw Error('기록 형식을 확인하지 못했어요.');
   if(!local||!Merge.same(merged,local)){snapshot(local);localStorage.setItem(dataKey,JSON.stringify(merged));changedLocal=true;window.dispatchEvent(new CustomEvent('vzip:data-changed',{detail:{source:'cloud-merge'}}))}
   // Keep other accounts' unsynced archive data on this device; scope only the outbound payload.
   checkOwner();const payload=window.VzipArchive?window.VzipArchive.forOwner(merged,user.id):merged;
   if(remote&&Merge.same(payload,remote))break;
   const stamp=nextVersion(row?.updated_at);
   // On an empty account, ON CONFLICT DO NOTHING is essential: a second first-save
   // must not overwrite the row another session just created.
   const {data:written,error}=row&&'payload' in row
    ?await sameVersion(client.from('vocal_data').update({payload,updated_at:stamp}).eq('user_id',syncOwner),row.updated_at).select('user_id')
    :await client.from('vocal_data').upsert({user_id:syncOwner,payload,updated_at:stamp},{onConflict:'user_id',ignoreDuplicates:true}).select('user_id');
   if(error)throw error;
   if(!Array.isArray(written))throw Error('서버 저장 결과를 확인하지 못했어요. 다시 동기화해 주세요.');
   if(written.length)break;
   // A concurrent create/update won: read its copy and merge again.
   if(attempt>=4)throw Error('다른 기기에서 동시에 저장하고 있어요. 다음 저장 때 다시 합쳐요.');
   await wait(150*(attempt+1)+Math.random()*150);
  }
  checkOwner();localStorage.setItem('vzip_cloud_linked_user',user.id);ready=true;syncFailed=false;
  if(window.VzipAccountScope&&Merge.same(localData(),merged))localStorage.removeItem('vzip_account_dirty');
  say('✓ 이 기기와 클라우드 기록을 합쳐 저장했어요 · '+Merge.count(merged)+'건'+(silent?' (자동 동기화)':''));
  if(reload&&local&&changedLocal)setTimeout(()=>location.reload(),650);
 }catch(e){syncFailed=true;say('동기화 실패: '+e.message+' · 기록은 그대로 있어요.')}
 finally{busy=false;if(syncAgain){syncAgain=false;setTimeout(()=>sync({silent:true}),300)}}
}
async function upload(silent=false){return sync({silent})}
async function download(){return sync({reload:true})}
async function backupVideoAudio(item,blob,onProgress){
 const prepared=await window.vzipPrepareMedia(new File([blob],item.name+'.'+mediaExtension(item.type),{type:item.type,lastModified:item.created||Date.now()}));
 try{
  const info={...item,...prepared.metadata,id:item.id,type:prepared.file.type};
  if(item.dateSource==='manual')Object.assign(info,{created:item.created,recordedDate:item.recordedDate,dateSource:'manual'});
  return await window.vzipCloudImport(prepared.file,info,onProgress);
 }finally{await prepared.dispose()}
}
async function uploadMedia(){if(!user||busy)return;busy=true;try{const items=await localMedia();if(!items.length)return say('이 기기에 음원이 없어요.');if(!confirm(items.length+'개 파일을 비공개 클라우드 저장소에 백업할까요? 영상은 용량에 따라 시간이 걸릴 수 있어요.'))return;const remotePaths=new Map((await window.vzipCloudMediaList()).map(item=>[item.id,item.path]));let ok=0,fail=0;for(const item of items){say('음원 업로드 '+(ok+fail+1)+'/'+items.length+'…');try{item.blob=window.vzipMediaBlob(item);if(!item.blob)throw Error('원본 파일이 없어요.');if((item.type||item.blob.type).startsWith('video/')){await backupVideoAudio(item,item.blob,p=>say('음원 백업 '+p+'%'));ok++;continue}if(item.blob.size>50*1024*1024||window.VzipR2?.enabled()){await window.vzipCloudImport(new File([item.blob],item.name+'.'+mediaExtension(item.type),{type:item.type}),{...item,id:item.id},p=>say('대용량 백업 '+p+'%'));ok++;continue}const ext=mediaExtension(item.blob.type||item.type);const path=remotePaths.get(item.id)||user.id+'/'+encodeURIComponent(item.id)+'.'+ext;const {error}=await client.storage.from('vocal-recordings').upload(path,item.blob,{upsert:true,contentType:item.blob.type||item.type||'application/octet-stream'});if(error)throw error;const meta={id:item.id,name:item.name,song:item.song||'',songId:item.songId||'',created:item.created,recordedDate:item.recordedDate||'',dateSource:item.dateSource||'',originalMedia:item.originalMedia||null,audioExtraction:item.audioExtraction||null,type:item.blob.type||item.type,source:item.source||'import',durationSeconds:item.durationSeconds||0,rating:item.rating??null,review:item.review||'',path};const {error:metaError}=await client.from('vocal_media').upsert({user_id:user.id,id:item.id,metadata:meta,updated_at:new Date().toISOString()});if(metaError)throw metaError;ok++;window.dispatchEvent(new Event('vzip:cloud-media-changed'))}catch(e){fail++;say('업로드 오류: '+e.message)}}say('✓ 음원 백업 '+ok+'개 성공'+(fail?', '+fail+'개 실패':'')+'. 원본은 이 기기에 남아 있어요.')}catch(e){say('녹음 백업 실패: '+e.message)}finally{busy=false}}
async function downloadMedia(){if(!user||busy)return;busy=true;try{const {data,error}=await client.from('vocal_media').select('metadata').eq('user_id',user.id);if(error)throw error;if(!data?.length)return say('클라우드에 백업된 녹음이 없어요.');const existing=new Set((await localMedia()).map(x=>x.id));const remoteMissing=data.map(x=>x.metadata).filter(x=>!existing.has(x.id));const missing=remoteMissing.filter(x=>x.storageVersion!==2);if(!missing.length)return say(remoteMissing.length?'대용량 파일은 보관함에서 바로 스트리밍으로 재생할 수 있어요.':'이 기기에 모든 녹음이 이미 있어요.');if(!confirm(missing.length+'개 음원을 이 기기에 다운로드해 보관할까요?'))return;let ok=0,fail=0;for(const meta of missing){say('녹음 가져오는 중 '+(ok+fail+1)+'/'+missing.length);try{const {data:blob,error:err}=await client.storage.from('vocal-recordings').download(meta.path);if(err)throw err;await window.vzipStorePracticeMedia({...meta,blob});ok++}catch{fail++}}say('✓ '+ok+'개 가져오기 완료'+(fail?', '+fail+'개 실패':'')+'. 보관함을 다시 열어 확인해 주세요.')}catch(e){say('녹음 가져오기 실패: '+e.message)}finally{busy=false}}
async function autoUploadMedia(id){if(!user||!ready)return;if(window.VZ?.media?.backupLocal)return;/* the v6 app uploads device files itself (resumable queue) */try{const item=(await localMedia()).find(x=>x.id===id);if(!item)return;const blob=window.vzipMediaBlob(item);if(!blob)throw Error('원본 파일이 없어요.');if((item.type||blob.type).startsWith('video/')){await backupVideoAudio(item,blob);return}if(blob.size>50*1024*1024||window.VzipR2?.enabled()){await window.vzipCloudImport(new File([blob],item.name+'.'+mediaExtension(item.type),{type:item.type}),{...item,id:item.id});return}const ext=mediaExtension(blob.type);const existing=(await window.vzipCloudMediaList()).find(remote=>remote.id===item.id);const path=existing?.path||user.id+'/'+encodeURIComponent(item.id)+'.'+ext;const {error}=await client.storage.from('vocal-recordings').upload(path,blob,{upsert:true,contentType:blob.type||'application/octet-stream'});if(error)throw error;const {error:metaError}=await client.from('vocal_media').upsert({user_id:user.id,id:item.id,metadata:{id:item.id,name:item.name,song:item.song||'',songId:item.songId||'',created:item.created,recordedDate:item.recordedDate||'',dateSource:item.dateSource||'',originalMedia:item.originalMedia||null,audioExtraction:item.audioExtraction||null,type:blob.type,source:item.source||'import',durationSeconds:item.durationSeconds||0,rating:item.rating??null,review:item.review||'',path},updated_at:new Date().toISOString()});if(metaError)throw metaError;window.dispatchEvent(new Event('vzip:cloud-media-changed'));say('✓ 새 녹음이 이 기기와 클라우드에 저장됐어요.')}catch(e){say('녹음은 이 기기에 저장됐지만 클라우드 백업 실패: '+e.message+'. 다시 백업해 주세요.')}}
// A device-file edit sends only the fields that changed (detail.changes), onto the newest cloud row: the
// other fields keep what other devices saved. Edits already written to the cloud (cloudDone) are skipped,
// and an event that does not say what changed sends nothing.
const mediaNamePatch=(meta,changes)=>window.VzipMediaNaming?.patch(meta,changes,id=>localData()?.songs?.find(song=>song.id===id)?.title)||changes;
const EDITABLE=['name','nameMode','autoName','song','songId','created','recordedDate','dateSource','type','rating','review'];
window.addEventListener('vzip:media-updated',async e=>{const d=e.detail||{};if(!user||!d.id||d.cloudDone)return;try{const item=(await localMedia()).find(x=>x.id===d.id);if(!item)return;if(!d.changes)return;/* unknown change: never re-send the device copy's older fields */const keys=Object.keys(d.changes).filter(k=>EDITABLE.includes(k));if(!keys.length)return;const pick=Object.fromEntries(keys.map(k=>[k,d.changes[k]]));await patchMedia(item.id,meta=>({...meta,...mediaNamePatch(meta,pick)}))}catch(err){say('기기에서 수정 완료 · 클라우드 정보 반영 실패: '+err.message)}});
window.addEventListener('vzip:media-saved',e=>{if(e.detail?.id)autoUploadMedia(e.detail.id)});

/* Each >50MiB original is stored as independent <=24MiB objects, one metadata row. */
let mediaImportActive=false;
const mediaPageId=crypto.randomUUID();
const pendingKey='vzip_pending_media_parts_v1';
function pendingUploads(){try{return JSON.parse(localStorage.getItem(pendingKey)||'[]')}catch{return []}}
function journal(entry){
 const entries=pendingUploads().filter(x=>x.id!==entry.id);entries.push(entry);
 localStorage.setItem(pendingKey,JSON.stringify(entries));
}
function forget(id){localStorage.setItem(pendingKey,JSON.stringify(pendingUploads().filter(x=>x.id!==id)))}
async function cleanupPending(owner){
 for(const entry of pendingUploads().filter(x=>x.owner===owner)){
  if(!navigator.locks?.request&&entry.page!==mediaPageId)continue;
  const {data,error}=await client.from('vocal_media').select('metadata').eq('user_id',owner).eq('id',entry.id).maybeSingle();
  if(error||user?.id!==owner)continue;
  // A committed row wins after a lost response or a page close during commit.
  if(data?.metadata){forget(entry.id);continue}
  const {error:removeError}=await client.storage.from('vocal-recordings').remove(entry.paths);
  if(!removeError)forget(entry.id);
 }
}
/* Durable, account-bound receipts. Only a completed upload may create a recovery entry. */
function mediaRecovery(){
 if(!window.VzipMediaUploadRecovery)throw Error('업로드 복구 모듈을 불러오지 못했어요. 새로고침해 주세요.');
 const identity=()=>!user||(window.VzipAccountScope&&(!sessionVerified||window.VzipAccountScope.leaving||window.VzipAccountScope.owner!==user.id))?null:
  {owner:user.id,session:window.VzipAccountScope?activeSessionId:'legacy'};
 const account=identity();if(!account)throw Error('로그인이 필요해요.');
 const owner=account.owner;
 return window.VzipMediaUploadRecovery.create({storage:localStorage,identity,
  loadRow:async id=>{const {data,error}=await client.from('vocal_media').select('metadata').eq('user_id',owner).eq('id',id).maybeSingle();if(error)throw error;return data?.metadata||null;},
  insertRow:async(id,metadata)=>{const {error}=await client.from('vocal_media').upsert({id,user_id:owner,metadata,updated_at:new Date().toISOString()},{ignoreDuplicates:true});if(error)throw error;},
  stat:key=>window.VzipR2.stat(key),
  deletedIds:async()=>[...await deletedMediaIds(true),...(Array.isArray(localData()?.deleted?.media)?localData().deleted.media:[])]
 });
}
/** Ids of files deleted on any device (vocal_data.payload.deleted.media), read as a single JSON path. */
async function deletedMediaIds(strict=false){const {data,error}=await client.from('vocal_data').select('ids:payload->deleted->media').eq('user_id',user.id).maybeSingle();if(error)throw error;if(strict&&data?.ids!=null&&!Array.isArray(data.ids))throw Object.assign(Error('삭제 기록을 확인하지 못했어요.'),{code:'deleted_unavailable'});return Array.isArray(data?.ids)?data.ids:[]}
async function importMedia(file,info={},onProgress,options={}){
 if(!client||!user)throw Error('클라우드 로그인이 필요해요. 설정에서 로그인해 주세요.');
 if(info.id){
  // Only the deleted-file list is read (not the whole record payload): this runs for every file of a bulk upload.
  const account=user.id,deletedIds=await deletedMediaIds();
  if(user?.id!==account)throw Error('로그인 계정이 변경됐어요.');
  if(deletedIds.includes(info.id))throw Error('삭제한 파일은 자동 백업하지 않아요. 다시 가져오려면 새 파일로 등록해 주세요.');
 }
 if(!file||file.size<=0)throw Error('빈 파일은 업로드할 수 없어요.');
 if((window.vzipMediaType?.(file)||file.type||'').startsWith('video/'))throw Error('영상은 음원으로 추출한 뒤 저장해 주세요.');
 if(file.size>VzipChunks.MAX_SIZE)throw Error('파일당 최대 1GB까지 업로드할 수 있어요.');
 if(mediaImportActive)throw Error('다른 파일을 업로드하고 있어요. 완료하거나 취소한 뒤 다시 선택해 주세요.');
 const owner=user.id,controller=new AbortController(),signal=controller.signal;
 const cancel=()=>controller.abort(),authChanged=()=>{if(user?.id!==owner||(window.VzipAccountScope&&!sessionVerified))controller.abort()};
 const aborted=()=>{if(signal.aborted)throw new DOMException('업로드를 취소했어요.','AbortError');if(user?.id!==owner||(window.VzipAccountScope&&!sessionVerified))throw Error('로그인이 변경되었어요. 다시 로그인해 주세요.')};
 if(options.signal?.aborted)cancel();options.signal?.addEventListener('abort',cancel);
 window.addEventListener('vzip:auth-changed',authChanged);
 mediaImportActive=true;let id,committing=false,committed=false,r2=null,recovery=null;
 try{
  aborted();
  await cleanupPending(owner);aborted();
  const type=window.vzipMediaType?.(file)||file.type||info.type||'application/octet-stream';
  id=info.id||crypto.randomUUID();
  if(!/^[a-z0-9_-]{1,200}$/i.test(id))throw Error('잘못된 파일 ID예요.');
  recovery=mediaRecovery();
  if(recovery.pending().some(entry=>entry.id===id)){
   const restored=await recovery.recover(id);aborted();window.VzipR2?.acknowledgeTransfer?.(id,restored);
   onProgress?.(100);window.dispatchEvent(new Event('vzip:cloud-media-changed'));
   return restored;
  }
  if(info.id){
   const {data:existing,error:lookupError}=await client.from('vocal_media').select('metadata').eq('user_id',owner).eq('id',id).maybeSingle();
   if(lookupError)throw lookupError;aborted();
   if(existing?.metadata){onProgress?.(100);return {...existing.metadata,id}}
  }
  const baseMetadata={id,name:info.name||file.name.replace(/\.[^.]+$/,''),nameMode:info.nameMode,autoName:info.autoName,song:info.song||'',songId:info.songId||'',
   created:info.created||file.lastModified||Date.now(),dateTag:info.dateTag||'',recordedDate:info.recordedDate||'',dateSource:info.dateSource||'file-modified',originalMedia:info.originalMedia||null,audioExtraction:info.audioExtraction||null,type,durationSeconds:Number(info.durationSeconds)||0,
   source:info.source||'import',size:file.size,
   // Import facts from the import hub (source, original name, fingerprint) stay with the file.
   ...Object.fromEntries(['sourceType','originalFilename','fileHash','importedAt','recordedAtSource','occasion'].filter(k=>info[k]!=null&&info[k]!=='').map(k=>[k,info[k]]))};
  const ext=(file.name.split('.').pop()||'bin').toLowerCase().replace(/[^a-z0-9]/g,'');
  // R2 (when the owner has set it up, r2-config.js) replaces the Supabase upload; the record stays in vocal_media.
  if(await window.VzipR2?.ready?.()||window.VzipR2?.hasPendingTransfer?.(id)){
   r2=await window.VzipR2.upload(file,{mediaId:id,type,signal,onProgress:p=>onProgress?.(Math.min(99,p)),
    recoveryContext:{kind:'library',metadata:baseMetadata},
    onReceipt:(context,receipt)=>recovery.remember({...context.metadata,storageProvider:'r2',r2Key:receipt.key,r2Etag:receipt.etag},receipt)
   });aborted();
  }
  const multipart=!r2&&file.size>50*1024*1024;
  const parts=multipart?Array.from({length:Math.ceil(file.size/VzipChunks.PART_SIZE)},(_,index)=>({
   path:owner+'/'+id+'/part-'+String(index).padStart(4,'0'),
   size:Math.min(VzipChunks.PART_SIZE,file.size-index*VzipChunks.PART_SIZE)
  })):[{path:owner+'/'+id+'.'+ext,size:file.size}];
  if(!r2)journal({id,owner,page:mediaPageId,paths:parts.map(x=>x.path),created:Date.now()});
  if(!r2&&!window.tus?.Upload)throw Error('업로드 모듈을 불러오지 못했어요. 새로고침해 주세요.');
  let offset=0;
  for(const part of r2?[]:parts){
  const {data:session,error:sessionError}=await client.auth.getSession();aborted();
  if(sessionError||!session?.session?.access_token)throw Error('로그인이 만료됐어요. 다시 로그인해 주세요.');
   aborted();
   const path=part.path,piece=multipart?file.slice(offset,offset+part.size,type):file;
  await new Promise((resolve,reject)=>{
   let upload=null,settled=false;
   const finish=(error)=>{
    if(settled)return;settled=true;signal?.removeEventListener('abort',cancel);
    upload=null;error?reject(error):resolve();
   };
   const cancel=()=>{
    if(settled)return;
    const task=upload;
    // Do not retain this File while automatic retries are pending after cancellation.
    try{Promise.resolve(task?.abort(false)).catch(()=>{})}catch{}
    finish(new DOMException('업로드를 취소했어요.','AbortError'));
   };
   signal?.addEventListener('abort',cancel,{once:true});
   if(signal?.aborted){cancel();return}
   try{
    upload=new window.tus.Upload(piece,{
     endpoint:'https://chxnbtiyuyhiywzeshis.storage.supabase.co/storage/v1/upload/resumable',
     headers:{authorization:'Bearer '+session.session.access_token,apikey:key,...(window.VzipAccountScope?{'X-Client-Info':'vocalzip-device-session-v2'}:{})},
     uploadDataDuringCreation:false,removeFingerprintOnSuccess:true,
     chunkSize:6*1024*1024,retryDelays:[0,1000,3000,5000,10000],
     storeFingerprintForResuming:false,
     metadata:{bucketName:'vocal-recordings',objectName:path,contentType:type,cacheControl:'3600'},
     onError:error=>finish(error),onSuccess:()=>finish(),
     onProgress:(sent,total)=>{if(!settled&&total>0)onProgress?.(Math.min(99,Math.round((offset+(sent/total)*part.size)/file.size*100)))}
    });
    upload.start();
   }catch(error){finish(error)}
  });
   offset+=part.size;
  }
  aborted();
  let metadata={...baseMetadata,
   ...(r2?{storageProvider:'r2',r2Key:r2.key}:multipart?{storageVersion:2,parts}:{path:parts[0].path})};
  if(r2){metadata.r2Etag=r2.etag;metadata=recovery.remember(metadata,{key:r2.key,size:r2.size,etag:r2.etag}).metadata;}
  options.onCommit?.();committing=true;
  const {error}=await client.from('vocal_media').upsert({id,user_id:owner,metadata,updated_at:new Date().toISOString()},r2?{ignoreDuplicates:true}:undefined);
  // Success means the row is really there: a lost reply may hide a write that went through, and a reported success is checked.
  const {data:check,error:checkError}=await client.from('vocal_media').select('id,metadata').eq('user_id',owner).eq('id',id).maybeSingle();
  if(checkError||!check){
   // Never delete the uploaded file here: it is kept and noted so it can be linked again later without uploading.
   if(r2)orphan({owner,id,key:r2.key,size:file.size,name:metadata.name,fileHash:metadata.fileHash||'',reason:(error||checkError)?.message||'row missing'});
   committing=false;r2=null;
   throw Error('보관함 연결을 확인하지 못했어요'+(error?': '+error.message:'')+'. 올린 파일은 지우지 않았어요.');
  }
  const confirmed=r2?recovery.acknowledge(id,check.metadata):metadata;
  committed=true;if(!r2)forget(id);else window.VzipR2?.acknowledgeTransfer?.(id,confirmed);
  if(user?.id!==owner)throw Error('로그인이 변경되어 현재 화면에 파일을 연결하지 않았어요. 원래 계정의 보관함에서 확인해 주세요.');
  onProgress?.(100);window.dispatchEvent(new Event('vzip:cloud-media-changed'));
  return confirmed;
 }catch(error){
  // Keep the journal if commit outcome is uncertain; next upload checks the row first.
  if(id&&!committing&&!committed&&user?.id===owner){
   try{await cleanupPending(owner)}catch{}
  }
  if(r2&&!committing&&!committed)orphan({owner,id,key:r2.key,size:file.size,name:info.name||file.name,fileHash:info.fileHash||'',reason:error?.message||'stopped'});
  throw error;
 }finally{
  options.signal?.removeEventListener('abort',cancel);window.removeEventListener('vzip:auth-changed',authChanged);
  mediaImportActive=false;
 }
};
/** Files that reached R2 but whose library row could not be confirmed: kept (never deleted) for re-linking. */
function orphan(entry){try{const k='vzip_r2_orphans_v1',all=JSON.parse(localStorage.getItem(k)||'[]').filter(x=>x.id!==entry.id);all.push({...entry,owner:entry.owner||user?.id||'',at:Date.now()});localStorage.setItem(k,JSON.stringify(all.slice(-5000)))}catch{}}
window.vzipR2Orphans=()=>{try{return JSON.parse(localStorage.getItem('vzip_r2_orphans_v1')||'[]')}catch{return []}};
function mediaUploadLock(work){
 if(navigator.locks?.request)return navigator.locks.request('vzip-cloud-media-upload',{ifAvailable:true},lock=>{
  if(!lock)throw Error('다른 파일을 업로드하고 있어요. 다른 탭의 업로드를 완료하거나 취소한 뒤 다시 선택해 주세요.');
  return work();
 });
 return work();
}
let activeReceiptRecovery=null,activeReceiptRecoveryScope=null,activeReceiptRecoveryOwner=null,activeReceiptRecoverySession='';
function waitForReceiptRecovery(signal){
 if(signal?.aborted)return Promise.reject(new DOMException('업로드를 취소했어요.','AbortError'));
 const pending=activeReceiptRecovery;if(!pending)return Promise.resolve();
 return new Promise((resolve,reject)=>{
  let settled=false;
  const finish=error=>{if(settled)return;settled=true;signal?.removeEventListener('abort',cancel);error?reject(error):resolve();};
  const cancel=()=>finish(new DOMException('업로드를 취소했어요.','AbortError'));
  signal?.addEventListener('abort',cancel,{once:true});
  if(signal?.aborted){cancel();return;}
  pending.then(()=>finish(),()=>finish());
 });
}
window.vzipCloudImport=(...args)=>{
 const owner=user?.id,session=window.vzipCloudSessionId?.()||'';
 return waitForReceiptRecovery(args[3]?.signal).then(()=>mediaUploadLock(()=>{
  if(user?.id!==owner||(window.vzipCloudSessionId?.()||'')!==session)throw Error('로그인이 변경되어 대기하던 업로드를 중단했어요. 원래 계정에서 다시 선택해 주세요.');
  return importMedia(...args);
 }));
};
/** Retry known completed uploads without reading or uploading the source file again. */
window.vzipRecoverMediaUploads=(id)=>{
 const account=user?.id,session=window.vzipCloudSessionId?.()||'';
 const current=()=>{if(user?.id!==account||(window.vzipCloudSessionId?.()||'')!==session)throw Error('로그인이 변경되어 복구를 중단했어요.');};
 if(activeReceiptRecovery){
  if(activeReceiptRecoveryOwner!==account||activeReceiptRecoverySession!==session)return Promise.reject(Error('로그인이 변경되어 이전 계정의 복구 결과를 연결하지 않았어요.'));
  if(activeReceiptRecoveryScope!==null&&activeReceiptRecoveryScope!==(id||null))return Promise.reject(Error('다른 파일을 복구하고 있어요. 잠시 후 다시 시도해 주세요.'));
  return activeReceiptRecovery.then(rows=>id?rows.filter(row=>row.id===id):rows);
 }
 const operation=mediaUploadLock(async()=>{
 current();
 if(mediaImportActive)throw Error('다른 파일을 업로드하고 있어요.');
 const recovery=mediaRecovery();
 mediaImportActive=true;const result=[];
 try{
  const transfers=await window.VzipR2?.recoverLibraryTransfers?.(id,(context,receipt)=>recovery.remember({...context.metadata,storageProvider:'r2',r2Key:receipt.key,r2Etag:receipt.etag},receipt))||[];
  result.push(...transfers.filter(entry=>entry.status!=='complete'));
  const entries=recovery.pending().filter(entry=>!id||entry.id===id);
  for(const entry of entries){
   try{const metadata=await recovery.recover(entry.id);window.VzipR2?.acknowledgeTransfer?.(entry.id,metadata);result.push({id:entry.id,status:'restored',metadata});}
   catch(error){if(error.code==='identity')throw error;result.push({id:entry.id,status:'pending',code:error.code||'unavailable'});}
  }
  current();
  if(result.some(entry=>entry.status==='restored'))window.dispatchEvent(new Event('vzip:cloud-media-changed'));
  return result;
 }finally{mediaImportActive=false;}
 });
 activeReceiptRecovery=operation;activeReceiptRecoveryScope=id||null;activeReceiptRecoveryOwner=account;activeReceiptRecoverySession=session;
 operation.finally(()=>{if(activeReceiptRecovery===operation){activeReceiptRecovery=null;activeReceiptRecoveryScope=null;activeReceiptRecoveryOwner=null;activeReceiptRecoverySession='';}}).catch(()=>{});
 return operation;
};
let receiptRecoveryTimer=null;
function scheduleReceiptRecovery(){
 clearTimeout(receiptRecoveryTimer);
 if(!window.vzipCloudSignedIn?.())return;
 receiptRecoveryTimer=setTimeout(()=>window.vzipRecoverMediaUploads().catch(()=>{}),1500);
}
window.addEventListener('vzip:auth-changed',scheduleReceiptRecovery);
window.addEventListener('online',scheduleReceiptRecovery);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')scheduleReceiptRecovery();});

/** All of the user's rows, page by page (the server returns at most 1,000 rows per request). */
async function allRows(columns){
 const owner=user?.id;if(!owner)return [];const out=[];
 const page=from=>client.from('vocal_media').select(columns).eq('user_id',owner).order('updated_at',{ascending:false}).order('id').range(from,from+999);
 // The first two pages are asked for together (one wait instead of two for 1,000–2,000 files); then one by one.
 const first=await Promise.all([page(0),page(1000)]);
 for(const [i,{data,error}] of first.entries()){
  if(error)throw error;if(user?.id!==owner)throw Error('로그인이 변경됐어요.');
  out.push(...(data||[]));if(!data||data.length<1000)return out;
  if(i===0)continue;
 }
 for(let from=2000;;from+=1000){
  const {data,error}=await page(from);
  if(error)throw error;if(user?.id!==owner)throw Error('로그인이 변경됐어요.');
  out.push(...(data||[]));if(!data||data.length<1000)return out;
 }
}
/* The library list is kept on this device (IndexedDB) per account. Later reads ask only for id + updated_at (small) and
 * fetch full rows just for files that are new or changed (every write here sets updated_at); a day-old copy is refreshed
 * in full. Reads that overlap share one request. Nothing on the server is changed by reading. */
const LIST_DB='vocalzip_cache_v1',FULL_AFTER=24*3600*1000;
function listDb(){return new Promise((resolve,reject)=>{const r=indexedDB.open(LIST_DB,1);r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('lists'))r.result.createObjectStore('lists',{keyPath:'owner'})};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
async function listCache(owner,entry){try{const db=await listDb();try{return await new Promise(resolve=>{const t=db.transaction('lists',entry?'readwrite':'readonly'),st=t.objectStore('lists'),q=entry?st.put(entry):st.get(owner);let out=null;q.onsuccess=()=>{out=entry?true:q.result||null};t.oncomplete=()=>resolve(out);t.onerror=t.onabort=()=>resolve(null)})}finally{db.close()}}catch{return null}}
const asItems=rows=>rows.map(x=>({...x.metadata,id:x.id,cloud:true}));
let listing=null;
async function readList(owner){
 const cached=await listCache(owner);let rows;
 if(!cached||Date.now()-cached.at>FULL_AFTER)rows=await allRows('id,metadata,updated_at');
 else{
  const index=await allRows('id,updated_at'),have=new Map(cached.rows.map(r=>[r.id,r])),fresh=new Map();
  for(const r of index)if(r.metadata!==undefined)fresh.set(r.id,r);
  const need=index.filter(r=>!fresh.has(r.id)&&(!have.has(r.id)||have.get(r.id).updated_at!==r.updated_at)).map(r=>r.id);
  for(let i=0;i<need.length;i+=200){
   const {data,error}=await client.from('vocal_media').select('id,metadata,updated_at').eq('user_id',owner).in('id',need.slice(i,i+200));
   if(error)throw error;for(const r of data||[])fresh.set(r.id,r);
  }
  rows=index.map(r=>fresh.get(r.id)||have.get(r.id)).filter(r=>r&&r.metadata);
 }
 if(user?.id!==owner)throw Error('로그인이 변경됐어요.');
 listCache(owner,{owner,at:cached&&Date.now()-cached.at<=FULL_AFTER?cached.at:Date.now(),rows});
 return rows;
}
window.vzipCloudMediaList=async()=>{
 const owner=user?.id;if(!owner)return [];
 if(listing?.owner===owner)return listing.promise;
 const promise=readList(owner).then(asItems);listing={owner,promise};
 try{return await promise}finally{if(listing?.promise===promise)listing=null}
};
/** The last list kept on this device (no network), for showing the library at once. */
window.vzipCloudMediaCached=async()=>{const owner=user?.id;if(!owner)return null;const c=await listCache(owner);return c?asItems(c.rows):null};
/** Read-only rows with server times, for the upload check (설정 → 저장 공간 관리 → 업로드 상태 진단). */
window.vzipCloudMediaRows=async()=>allRows('id,metadata,updated_at');
window.vzipCloudUserId=()=>user?.id||'';
window.vzipCloudMediaUrl=async item=>{
 if(!user)throw Error('로그인이 필요해요.');
 const owner=user.id;
 const sign=async path=>{
  if(!path.startsWith(owner+'/')||path.includes('..'))throw Error('다른 계정의 파일은 재생할 수 없어요.');
  const {data,error}=await client.storage.from('vocal-recordings').createSignedUrl(path,3600);
  if(error)throw error;if(user?.id!==owner)throw Error('로그인이 변경되었어요.');
  return data.signedUrl;
 };
 if(item?.storageProvider==='r2'){if(!window.VzipR2?.configured())throw Error('R2 저장소 주소가 설정되지 않았어요.');return window.VzipR2.url(item.r2Key)}
 if(item?.storageVersion===2)return window.vzipChunkMediaURL(item,sign);
 if(!item?.path)throw Error('클라우드 파일 경로가 없어요.');
 return sign(item.path);
};
/** Change one library row safely: mutate() gets the newest server copy and returns the next one
 * (or null for no change). The write only lands if the row was not saved in between; otherwise it
 * is read and applied again. Returns the saved metadata, or null when the row does not exist. */
async function patchMedia(id,mutate,owner=user?.id){
 if(!owner)throw Error('로그인이 필요해요.');
 for(let attempt=0;attempt<5;attempt++){
  const {data:row,error}=await client.from('vocal_media').select('metadata,updated_at').eq('user_id',owner).eq('id',id).maybeSingle();
  if(error)throw error;if(!row?.metadata)return null;
  const next=mutate({...row.metadata});
  if(!next||JSON.stringify(next)===JSON.stringify(row.metadata))return row.metadata;
  const {data,error:writeError}=await sameVersion(client.from('vocal_media').update({metadata:next,updated_at:nextVersion(row.updated_at)}).eq('user_id',owner).eq('id',id),row.updated_at).select('id');
  if(writeError)throw writeError;
  if(Array.isArray(data)&&data.length){window.dispatchEvent(new Event('vzip:cloud-media-changed'));return next}
  await wait(120*(attempt+1)+Math.random()*120);
 }
 throw Error('다른 기기에서 같은 파일을 동시에 수정하고 있어요. 잠시 후 다시 시도해 주세요.');
}
window.vzipCloudMediaPatch=patchMedia;
/** Save only `changes` onto the newest cloud copy; `item` may be an older snapshot and is not written back. */
/** Song-only optimistic update. Fetch current cloud metadata, preserve unrelated fields,
 * and refuse stale writes via updated_at. Never overwrite a newer device's review/date. */
window.vzipCloudMediaAssignSong=async(item,changes,{expectedSongId='',expectedSong='',expectedUpdatedAt=null}={})=>{
 if(!user)throw Error('로그인이 필요해요.');
 const owner=user.id;
 const table=()=>client.from('vocal_media');
 const {data:row,error:readError}=await table().select('metadata,updated_at').eq('id',item.id).eq('user_id',owner).maybeSingle();
 if(readError)throw readError;
 if(!row?.metadata)throw Error('원본 클라우드 기록을 찾지 못했어요.');
 const current=row.metadata;
 if((current.songId||'')!==expectedSongId||(current.song||'')!==expectedSong)
  throw Error('다른 기기에서 곡이 변경됐어요. 새로고침 후 확인해 주세요.');
 if(expectedUpdatedAt&&row.updated_at!==expectedUpdatedAt)
  throw Error('곡 지정 후 다른 기기에서 기록을 수정했어요. 자동 되돌리기를 중단합니다.');
 if(!row.updated_at)throw Error('수정 버전을 확인할 수 없어요.');
 if(user?.id!==owner)throw Error('로그인 계정이 변경됐어요.');
 const updatedAt=new Date(Math.max(Date.now(),Date.parse(row.updated_at)+1)).toISOString();
 const metadata={...current,...mediaNamePatch(current,{songId:String(changes.songId||''),song:String(changes.song||'')})};
 const {data:written,error}=await table().update({metadata,updated_at:updatedAt})
  .eq('id',item.id).eq('user_id',owner).eq('updated_at',row.updated_at).select('id').maybeSingle();
 if(error)throw error;
 if(!written||user?.id!==owner)throw Error('다른 기기의 수정과 충돌했어요. 기록을 새로고침해 주세요.');
 window.dispatchEvent(new Event('vzip:cloud-media-changed'));
 return {updatedAt,metadata};
};
window.vzipCloudMediaUpdate=async(item,changes)=>{if(!user)throw Error('로그인이 필요해요.');const clean={...changes};for(const k of ['id','cloud','local','blob','bytes'])delete clean[k];if(clean.name===item.name)delete clean.name;const saved=await patchMedia(item.id,meta=>({...meta,...mediaNamePatch(meta,clean)}));if(!saved)throw Error('클라우드에서 이 파일 정보를 찾지 못했어요.');return saved};
async function unlinkCloudMedia(owner,id){
 for(let attempt=0;attempt<5;attempt++){
  if(user?.id!==owner)throw Error('로그인 계정이 변경됐어요.');
  const {data:row,error}=await client.from('vocal_data').select('payload,updated_at').eq('user_id',owner).maybeSingle();
  if(error)throw error;
  if(!row){
   const payload=Merge.deleteMedia({categories:[],songs:[],lessons:[],assignments:[],practices:[]},id);
   const {error:createError}=await client.from('vocal_data').insert({user_id:owner,payload,updated_at:new Date().toISOString()});
   if(createError?.code==='23505')continue;
   if(createError)throw createError;
   return;
  }
  if(!Merge.valid(row.payload))throw Error('클라우드 기록 형식을 확인하지 못했어요.');
  const payload=Merge.deleteMedia(structuredClone(row.payload),id);
  const {data:written,error:writeError}=await sameVersion(client.from('vocal_data').update({payload,updated_at:nextVersion(row.updated_at)}).eq('user_id',owner),row.updated_at).select('user_id');
  if(writeError)throw writeError;
  if(written?.length)return;
 }
 throw Error('기록이 다른 기기에서 수정 중이에요. 삭제를 다시 시도해 주세요.');
}
async function deleteCloudMedia(item){
 if(!user)throw Error('로그인이 필요해요.');
 const owner=user.id;
 const {data:row,error:readError}=await client.from('vocal_media').select('metadata,updated_at').eq('id',item.id).eq('user_id',owner).maybeSingle();
 if(readError)throw readError;
 if(user?.id!==owner)throw Error('로그인 계정이 변경됐어요.');
 // Only server-owned metadata determines which objects are deleted, never a stale UI path.
 const current=row?.metadata||{};
 const old=current.storageProvider==='r2'?(current.legacyStorage||{}):current;
 const paths=old.storageVersion===2?VzipChunks.validate(old).parts.map(x=>x.path):(old.path?[old.path]:[]);
 if(paths.some(path=>!path.startsWith(owner+'/')||path.includes('..')))throw Error('다른 계정의 파일은 삭제할 수 없어요.');
 if(current.storageProvider==='r2'&&current.r2Key){
  if(!current.r2Key.startsWith('u/'+owner+'/')||current.r2Key.includes('..'))throw Error('다른 계정의 파일은 삭제할 수 없어요.');
  await window.VzipR2.remove(current.r2Key);
 }
 if(paths.length){const {error}=await client.storage.from('vocal-recordings').remove(paths);if(error)throw error}
 if(user?.id!==owner)throw Error('로그인이 변경되었어요.');
 // Keep the media row until all cleanup succeeds: partial failures can be retried.
 await unlinkCloudMedia(owner,item.id);
 const {error:textError}=await client.from('vocal_song_texts').update({deleted_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('user_id',owner).eq('kind','recognition').eq('record_id',item.id);
 if(textError)throw textError;
 if(user?.id!==owner)throw Error('로그인이 변경되었어요.');
 if(row){
  const {data:removed,error}=await sameVersion(client.from('vocal_media').delete().eq('id',item.id).eq('user_id',owner),row.updated_at).select('id');
  if(error)throw error;
  if(!removed?.length)throw Error('다른 기기에서 파일 정보가 변경됐어요. 삭제를 다시 시도해 주세요.');
 }
 const cached=await listCache(owner);if(cached)await listCache(owner,{...cached,rows:cached.rows.filter(r=>r.id!==item.id)});
 window.dispatchEvent(new Event('vzip:cloud-media-changed'));
}
window.vzipCloudMediaDelete=item=>{
 if(navigator.locks?.request)return navigator.locks.request('vzip-cloud-media-upload',{ifAvailable:true},lock=>{
  if(!lock)throw Error('다른 탭의 업로드가 끝난 뒤 삭제해 주세요.');
  return deleteCloudMedia(item);
 });
 return deleteCloudMedia(item);
};
/* ---------- R2 move (storage screen) ---------- */
/** The original bytes of a cloud file (Supabase, single or multi-part). */
window.vzipCloudMediaBlob=async(item,signal)=>{const res=await fetch(await window.vzipCloudMediaUrl(item),{signal});if(!res.ok)throw Error('클라우드 파일을 받지 못했어요 ('+res.status+').');return res.blob()};
/** Point a record at its R2 copy (same id, so every link stays). The previous cloud location is kept
 * in legacyStorage until the user removes it from the storage screen. */
window.vzipCloudR2Attach=async(item,{key,size,type})=>{
 if(!user)throw Error('로그인이 필요해요.');
 const owner=user.id;if(!String(key).startsWith('u/'+owner+'/'))throw Error('다른 계정의 저장 위치예요.');
 const build=prev=>{
  const base={...(prev||item)};
  for(const k of ['blob','bytes','local','cloud','path','parts','storageVersion','storageProvider','r2Key','legacyStorage'])delete base[k];
  const legacy=prev&&prev.storageProvider!=='r2'&&(prev.path||prev.storageVersion===2)?{path:prev.path,storageVersion:prev.storageVersion,parts:prev.parts,size:prev.size}:prev?.legacyStorage;
  return {...base,id:item.id,type:type||base.type,size,storageProvider:'r2',r2Key:key,movedToR2At:Date.now(),...(legacy?{legacyStorage:Object.fromEntries(Object.entries(legacy).filter(([,v])=>v!==undefined))}:{})};
 };
 // An existing row keeps every field other devices saved; only the storage fields change.
 const saved=await patchMedia(item.id,build,owner);if(saved)return saved;
 const metadata=build(null);
 const {error}=await client.from('vocal_media').upsert({id:item.id,user_id:owner,metadata,updated_at:new Date().toISOString()});
 if(error)throw error;window.dispatchEvent(new Event('vzip:cloud-media-changed'));return metadata;
};
/** Remove the old Supabase copy of a file that now lives in R2, after re-checking the R2 copy's size. */
window.vzipCloudLegacyCleanup=async item=>{
 if(!user)throw Error('로그인이 필요해요.');
 const owner=user.id;
 const {data:row,error:readError}=await client.from('vocal_media').select('metadata').eq('user_id',owner).eq('id',item.id).maybeSingle();
 if(readError)throw readError;const meta=row?.metadata;
 if(meta?.storageProvider!=='r2'||!meta.legacyStorage)return;
 const stat=await window.VzipR2.stat(meta.r2Key);
 if(!stat||stat.size!==meta.size)throw Error('R2 사본을 확인하지 못했어요.');
 const old=meta.legacyStorage,paths=old.storageVersion===2?VzipChunks.validate(old).parts.map(x=>x.path):(old.path?[old.path]:[]);
 if(paths.some(path=>!path.startsWith(owner+'/')||path.includes('..')))throw Error('다른 계정의 파일은 삭제할 수 없어요.');
 if(paths.length){const {error}=await client.storage.from('vocal-recordings').remove(paths);if(error)throw error}
 await patchMedia(item.id,m=>{if(!m.legacyStorage)return null;const next={...m};delete next.legacyStorage;return next},owner);
};
// Private account-scoped lyrics / paid STT cache. RLS enforces auth.uid() on each row.
const songTextTable=()=>{if(!client||!user)throw Error('Supabase 로그인이 필요해요.');return client.from('vocal_song_texts')};
window.vzipCloudSongTextList=async()=>{
 const owner=user?.id;if(!owner)throw Error('로그인 정보가 없어요.');
 const result=[];
 // PostgREST has a default 1,000-row response cap; page through all prior STT
 // results or a paid transcript could be falsely considered missing.
 for(let offset=0;offset<100000;offset+=1000){
  const {data,error}=await songTextTable().select('kind,record_id,transcript,source,updated_at,deleted_at')
   .eq('user_id',owner).order('kind').order('record_id').range(offset,offset+999);
  if(error)throw Error('기준 가사 클라우드 조회 실패: '+error.message);
  result.push(...(data||[]));
  if(!data||data.length<1000)break;
  if(user?.id!==owner)throw Error('계정 변경으로 기록 조회를 중단했어요.');
 }
 return result;
};
window.vzipCloudSongTextSave=async({kind,recordId,transcript,source='manual',onlyIfMissing=false})=>{
 const owner=user?.id;
 if(!owner||!['reference','recognition'].includes(kind)||typeof recordId!=='string'||!recordId||recordId.length>128||
  typeof transcript!=='string'||!transcript.trim()||transcript.length>1600||!['manual','stt','legacy'].includes(source))
  throw Error('기준 가사 저장 정보가 올바르지 않아요.');
 const row={user_id:owner,kind,record_id:recordId,transcript,source,deleted_at:null,updated_at:new Date().toISOString()};
 const {error}=await songTextTable().upsert(row,{onConflict:'user_id,kind,record_id',ignoreDuplicates:onlyIfMissing});
 if(error)throw Error('기준 가사 클라우드 저장 실패: '+error.message);
};
window.vzipCloudSongTextDelete=async(kind,recordId)=>{
 const owner=user?.id;if(!owner||!['reference','recognition'].includes(kind)||!recordId)throw Error('로그인이 필요해요.');
 // Tombstone keeps the key so offline old devices cannot resurrect deleted lyrics.
 const {error}=await songTextTable().update({deleted_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('user_id',owner).eq('kind',kind).eq('record_id',recordId);
 if(error)throw Error('기준 가사 클라우드 삭제 실패: '+error.message);
};
/* ---------- server analysis (worker/analysis-worker.mjs) ---------- */
/** Queue this account's recordings that still need work; null when the server queue is not installed. */
window.vzipAnalysisEnqueue=async()=>{if(!client?.rpc||!user)return null;const {data,error}=await client.rpc('vzip_enqueue_my_media');return error?null:Number(data)||0};
/** Own jobs (RLS): kind, status and, for songs needing a look, the top 3. */
window.vzipAnalysisJobs=async()=>{
 if(!client||!user)return null;const owner=user.id,rows=[];
 for(let from=0;from<50000;from+=1000){
  const {data,error}=await client.from('vocal_analysis_jobs').select('media_id,kind,status,updated_at').eq('user_id',owner).order('id').range(from,from+999);
  if(error)return null;rows.push(...(data||[]));if(!data||data.length<1000)break;
 }
 const {data:review}=await client.from('vocal_analysis_jobs').select('media_id,result').eq('user_id',owner).eq('kind','song').eq('status','review').limit(2000);
 return {rows,review:review||[]};
};
/** Live changes to own recordings and jobs while the app is open; returns a stop function. */
window.vzipAnalysisLive=(onMedia,onJobs)=>{
 if(!client||!user||!client.channel)return()=>{};
 const ch=client.channel('vzip-analysis-'+user.id)
  .on('postgres_changes',{event:'*',schema:'public',table:'vocal_media',filter:'user_id=eq.'+user.id},()=>onMedia())
  .on('postgres_changes',{event:'*',schema:'public',table:'vocal_analysis_jobs',filter:'user_id=eq.'+user.id},()=>onJobs())
  .subscribe();
 return()=>{try{client.removeChannel(ch)}catch{}};
};
/** Paid STT calls so far for this account ({total, today}); null when signed out or the usage function is missing. */
window.vzipSttUsage=async()=>{if(!client||!user)return null;const {data,error}=await client.rpc('vzip_song_stt_usage');if(error)return null;const row=Array.isArray(data)?data[0]:data;return {total:Number(row?.used_total)||0,today:Number(row?.used_today)||0}};
window.vzipCloudAccessToken=async()=>{if(!client||!user||(window.VzipAccountScope&&!sessionVerified))return null;const owner=user.id;const {data}=await client.auth.getSession();if(user?.id!==owner||(window.VzipAccountScope&&!sessionVerified))return null;return data.session?.access_token||null};window.vzipCloudSignedIn=()=>!!user&&(!window.VzipAccountScope||sessionVerified);
let streamOwner=null;
function showUser(){
 if(window.VzipAccountScope){void enterAccount().catch(e=>{sessionVerified=false;ready=false;updateAuthScreen();say('로그인 보호 확인 실패: '+e.message)});return;}
 paintUser();
}
function paintUser(){if(streamOwner&&streamOwner!==user?.id)window.vzipRevokeChunkMedia?.();streamOwner=user?.id||null;window.dispatchEvent(new Event('vzip:auth-changed'));const logged=window.vzipCloudSignedIn();$('#cloud-signed-in').hidden=!logged;updateAuthScreen();if(logged){$('#cloud-user').textContent=user.email||'로그인됨';ready=localStorage.getItem('vzip_cloud_linked_user')===user.id;say(ready?'연결됨 · 기록을 수정하면 자동으로 서버에 저장돼요.':'로그인 완료! 이 기기와 클라우드 기록을 합치는 중…');sync({silent:true})}else{ready=false;say('로그인하면 다른 기기에서도 기록을 불러올 수 있어요.')}}
function deviceLabel(){
 const ua=navigator.userAgent,installed=matchMedia('(display-mode: standalone)').matches||navigator.standalone;
 const device=/iPad/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1)?'iPad':/iPhone/.test(ua)?'iPhone':/Android/.test(ua)?'Android':'컴퓨터';
 return device+' · '+(installed?'설치형 웹앱':/Firefox/.test(ua)?'Firefox':/Edg/.test(ua)?'Edge':/Chrome|CriOS/.test(ua)?'Chrome':'Safari/브라우저');
}
async function endThisSession(all=false,revision=null){
 const generation=authGeneration;
 sessionVerified=false;ready=false;clearTimeout(uploadTimer);updateAuthScreen();
 window.vzipRevokeChunkMedia?.();window.dispatchEvent(new Event('vzip:auth-changed'));
 // Freeze first and persist all pending captures before revoking this login.
 await window.VzipAccountScope.lock();
 if(generation!==authGeneration)throw Error('로그인이 변경됐어요. 다시 확인해 주세요.');
 const {data,error}=all
  ?await client.rpc('vzip_revoke_sessions',{p_session_id:null,p_all:true,p_expected_revision:revision})
  :await client.rpc('vzip_release_session');
 if(error)throw Error('로그아웃을 확인하지 못했어요. 녹음은 보존됩니다. 다시 로그인해 확인해 주세요. '+error.message);
 if(all&&data?.status==='sessions_changed'){say('로그인 목록이 바뀌었어요. 보존한 자료를 다시 확인합니다.');location.reload();return data;}
 if(generation!==authGeneration)return null;
 const {error:signOutError}=await client.auth.signOut({scope:'local'});
 if(signOutError)throw Error('서버 접근은 차단됐어요. 이 기기 로그인 정리에 실패했으니 다시 확인해 주세요.');
 localStorage.removeItem('vzip_cloud_linked_user');user=null;showUser();
 return data;
}
async function openSessionManager(){
 const generation=authGeneration,owner=user?.id;
 const current=()=>generation===authGeneration&&user?.id===owner&&sessionVerified;
 const refresh=async()=>{const {data,error}=await client.rpc('vzip_list_sessions');if(error)throw Error(error.message);if(!current())throw Error('로그인이 변경됐어요.');return data;};
 try{
  if(!current())return;
  const snapshot=await refresh();
  await window.VzipDeviceSessions.manage(snapshot,{
   isCurrent:current,refresh,
   revoke:async(id,revision)=>{
    if(!current())throw Error('로그인이 변경됐어요.');
    if(!id||id===snapshot.current_session)return endThisSession(!id,revision);
    const {data,error}=await client.rpc('vzip_revoke_sessions',{p_session_id:id,p_all:false,p_expected_revision:revision});
    if(error)throw Error(error.message);if(!current())throw Error('로그인이 변경됐어요.');return data;
   }
  });
 }catch(e){say('로그인 기기 확인 실패: '+e.message);}
}
async function enterAccount(){
 window.VzipDeviceSessions?.close();
 const generation=++authGeneration,candidate=user,owner=candidate?.id||'',scope=window.VzipAccountScope;
 sessionVerified=false;ready=false;clearTimeout(uploadTimer);updateAuthScreen();
 if(scope.owner!==owner){
  user=null;window.vzipRevokeChunkMedia?.();window.dispatchEvent(new Event('vzip:auth-changed'));
  await scope.switchTo(owner);return;
 }
 if(!candidate){paintUser();return;}
 const current=()=>generation===authGeneration&&user?.id===owner;
 say('이 계정의 로그인 세션을 확인하고 있어요…');
 let {data,error}=await client.rpc('vzip_register_session',{p_label:deviceLabel(),p_replace_session:null,p_expected_revision:null});
 for(let attempt=0;current()&&!error&&['device_limit','sessions_changed'].includes(data?.status);attempt++){
  if(attempt>=3)throw Error('로그인 목록이 계속 바뀌고 있어요. 다시 로그인해 주세요.');
  if(!window.VzipDeviceSessions)throw Error('로그인 기기 관리 화면을 불러오지 못했어요.');
  const selected=await window.VzipDeviceSessions.chooseReplacement(data);
  if(!current())return;
  if(!selected){
   user=null;await client.auth.signOut({scope:'local'});
   if(generation===authGeneration){paintUser();say('로그인을 취소했어요. 기존 기기들의 로그인은 유지됩니다.');}
   return;
  }
  ({data,error}=await client.rpc('vzip_register_session',{p_label:deviceLabel(),p_replace_session:selected.session_id,p_expected_revision:selected.revision}));
 }
 if(!current())return;
 if(error)throw Error('서버 다중 기기 로그인 설정을 확인할 수 없어요. '+error.message);
 if(data?.status==='revoked')throw Error('이 로그인은 종료됐어요. 다시 인증해 주세요.');
 if(data?.status!=='active')throw Error('로그인 세션 상태를 확인하지 못했어요. 다시 로그인해 주세요.');
 if(scope.leaving){await scope.lock();if(current())location.reload();return;}
 if(activeSessionId&&activeSessionId!==data.current_session)window.vzipRevokeChunkMedia?.();
 activeSessionId=data.current_session;sessionVerified=true;
 if(new URL(location.href).searchParams.get('return')==='billing'){
  await sync({silent:true});
  if(current())location.replace(new URL('billing/',location.href).href);
  return;
 }
 paintUser();
 let manager=document.getElementById('vzip-device-manage');
 if(!manager){manager=document.createElement('button');manager.id='vzip-device-manage';manager.className='btn ghost';manager.textContent='로그인 기기 관리';manager.onclick=openSessionManager;document.getElementById('cloud-signed-in').appendChild(manager);}
 let button=document.getElementById('vzip-legacy-import');
 if(!button&&scope.canImportLegacy()){
  button=document.createElement('button');button.id='vzip-legacy-import';button.className='btn ghost';button.textContent='이 기기의 이전 자료 확인·가져오기';
  button.onclick=async()=>{
   if(!window.vzipCloudSignedIn())return;
   const approved=await window.VZ.confirm('이전 자료 소유 계정 확인','이 기기의 이전 녹음과 기록이 현재 로그인 계정의 자료인가요? 확인한 경우에만 복사합니다. 이전 원본은 지우지 않고, 같은 ID의 현재 자료는 덮어쓰지 않습니다.',{ok:'내 자료를 이 계정으로 복사'});
   if(!approved||user?.id!==scope.owner||!sessionVerified)return;
   button.disabled=true;
   try{const result=await scope.importLegacy();window.VZ.toast('기록 '+result.records+'건·파일 '+result.files+'개 복사, 충돌/기존 항목 '+result.conflicts+'건 보존');window.VZ.media.invalidate();await sync({silent:true});}
   catch(e){window.VZ.toast(e.message,'error');}finally{button.disabled=false;}
  };
  root.appendChild(button);
 }
}
async function checkActiveSession(){
 if(!window.VzipAccountScope||!sessionVerified||!user||sessionChecking)return;
 const generation=authGeneration;sessionChecking=true;
 try{
  const {data,error}=await client.rpc('vzip_session_is_active');
  if(generation!==authGeneration)return;
  if(error){say('연결이 불안정해요. 녹음은 이 기기에 임시 보존됩니다.');return;}
  if(data!==true){
   sessionVerified=false;ready=false;clearTimeout(uploadTimer);
   updateAuthScreen();window.vzipRevokeChunkMedia?.();window.dispatchEvent(new Event('vzip:auth-changed'));
   await window.VzipAccountScope.lock();
   if(generation!==authGeneration)return;
   window.VzipDeviceSessions?.close();
   say('이 기기의 로그인이 종료됐어요. 미전송 녹음은 이 계정의 기기 저장 공간에 보존됐습니다. 다시 인증해 주세요.');
  }
 }finally{sessionChecking=false;}
}
if(window.VzipAccountScope){
 setInterval(()=>checkActiveSession().catch(()=>{}),20000);
 window.addEventListener('focus',()=>checkActiveSession().catch(()=>{}));
}

async function boot(){if(!window.supabase?.createClient){say('서버 연결 라이브러리를 불러오지 못했어요. 새로고침해 주세요.');return}client=window.supabase.createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true},...(window.VzipAccountScope?{global:{headers:{'X-Client-Info':'vocalzip-device-session-v2'}}}:{})});const {data}=await client.auth.getUser();user=data?.user||null;showUser();client.auth.onAuthStateChange((event,session)=>{if(event==='PASSWORD_RECOVERY'){recoveryMode=true;showAuthView('new-password');}user=session?.user||null;showUser();if(event==='PASSWORD_RECOVERY')updateAuthScreen()});const credentials=()=>({email:$('#cloud-email').value.trim(),password:$('#cloud-password').value});
$('#cloud-show-password').onclick=()=>{const el=$('#cloud-password');el.type=el.type==='password'?'text':'password';$('#cloud-show-password').textContent=el.type==='password'?'보기':'숨기기'};
$('#cloud-login').onclick=async()=>{const {email,password}=credentials();if(!email||!password)return say('이메일과 비밀번호를 입력해 주세요.');say('로그인 중…');const {error}=await client.auth.signInWithPassword({email,password});say(error?'로그인 실패: '+(error.message==='Invalid login credentials'?'이메일 또는 비밀번호가 맞지 않아요. 기존 이메일 링크 계정이면 비밀번호 재설정을 눌러 주세요.':error.message):'✓ 로그인 완료!')};
$('#cloud-signup').onclick=()=>showAuthView('signup');
$('#cloud-back-login').onclick=$('#cloud-signup-login').onclick=()=>showAuthView('login');
authScreen.querySelectorAll('[data-auth-login]').forEach(button=>button.onclick=()=>showAuthView('login'));
$('#cloud-change-email').onclick=()=>showAuthView('signup');
const authRedirect=()=>location.origin+location.pathname;
authScreen.querySelectorAll('[data-kakao]').forEach(button=>button.onclick=async()=>{say('카카오 로그인으로 이동 중…');const {error}=await client.auth.signInWithOAuth({provider:'kakao',options:{redirectTo:authRedirect()}});if(error)say('카카오 로그인 실패: '+error.message)});
$('#cloud-signup-submit').onclick=async()=>{const email=$('#cloud-signup-email').value.trim(),password=$('#cloud-signup-password').value,confirmPassword=$('#cloud-signup-confirm').value;if(!email||!$('#cloud-signup-email').checkValidity())return say('올바른 이메일 주소를 입력해 주세요.');if(password.length<8)return say('비밀번호를 8자 이상 입력해 주세요.');if(password!==confirmPassword)return say('비밀번호가 일치하지 않아요.');say('계정 생성 중…');const {data,error}=await client.auth.signUp({email,password,options:{emailRedirectTo:authRedirect()}});if(error)return say('가입 실패: '+error.message);if(data.session)return say('✓ 가입 및 로그인 완료!');$('#cloud-verify-email').textContent=email;showAuthView('verify');say('확인 메일을 보냈어요. 메일의 링크로 가입을 완료해 주세요.')};
$('#cloud-resend-signup').onclick=async()=>{const email=$('#cloud-verify-email').textContent;say('확인 메일 재발송 중…');const {error}=await client.auth.resend({type:'signup',email,options:{emailRedirectTo:authRedirect()}});say(error?'재발송 실패: '+error.message:'확인 메일을 다시 보냈어요.')};
$('#cloud-reset').onclick=()=>showAuthView('recovery');
const sendRecovery=async()=>{const field=$('#cloud-recovery-email'),email=field.value.trim();if(!email||!field.checkValidity())return say('올바른 이메일 주소를 입력해 주세요.');say('비밀번호 재설정 메일 요청 중…');const {error}=await client.auth.resetPasswordForEmail(email,{redirectTo:authRedirect()});if(error)return say('재설정 메일 발송 실패: '+error.message);$('#cloud-recovery-sent-email').textContent=email;showAuthView('recovery-sent');say('재설정 메일을 확인해 주세요.')};
$('#cloud-recovery-send').onclick=sendRecovery;
$('#cloud-recovery-resend').onclick=async()=>{$('#cloud-recovery-email').value=$('#cloud-recovery-sent-email').textContent;await sendRecovery()};
$('#cloud-new-password-submit').onclick=async()=>{const password=$('#cloud-new-password').value,confirm=$('#cloud-new-password-confirm').value;if(password.length<8)return say('비밀번호를 8자 이상 입력해 주세요.');if(password!==confirm)return say('비밀번호가 일치하지 않아요.');say('비밀번호 변경 중…');const {error}=await client.auth.updateUser({password});if(error)return say('비밀번호 변경 실패: '+error.message);recoveryMode=false;$('#cloud-new-password').value='';$('#cloud-new-password-confirm').value='';showAuthView('login');updateAuthScreen();say('✓ 새 비밀번호로 변경했어요.')};
$('#cloud-logout').onclick=async()=>{if(window.VzipAccountScope){try{await endThisSession();}catch(e){say(e.message);}return;}await client.auth.signOut({scope:'local'});localStorage.removeItem('vzip_cloud_linked_user');user=null;showUser()};$('#cloud-upload').onclick=()=>sync();$('#cloud-download').onclick=download;$('#cloud-media-upload').onclick=uploadMedia;$('#cloud-media-download').onclick=downloadMedia;window.addEventListener('vzip:data-changed',e=>{if(!ready||!user||e.detail?.source==='cloud-merge')return;clearTimeout(uploadTimer);uploadTimer=setTimeout(()=>{uploadTimer=null;upload(true)},900)});
 /* A change saved just before the app goes to the background is sent at once (iOS may suspend the page before the
  * 0.9 s wait ends); a save that failed offline is sent again when the network or the app comes back. */
 const flush=()=>{if(!ready||!user)return;if(uploadTimer){clearTimeout(uploadTimer);uploadTimer=null;upload(true)}};
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flush();else if(syncFailed&&ready&&user)upload(true)});
 window.addEventListener('pagehide',flush);
 window.addEventListener('online',()=>{if(ready&&user&&(syncFailed||uploadTimer)){clearTimeout(uploadTimer);uploadTimer=null;upload(true)}});}
boot().catch(e=>{say('연결 오류: '+e.message);document.getElementById('vzip-boot-cover')?.remove()});
})();
