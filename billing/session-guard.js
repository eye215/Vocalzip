/* Billing uses the app's authenticated session and account-local bridge. */
(()=>{
'use strict';
if(!window.VZIP_DEVICE_SESSIONS_ENABLED)return;
const scope=window.VzipAccountScope,AUTH='sb-chxnbtiyuyhiywzeshis-auth-token';
const endpoint='https://chxnbtiyuyhiywzeshis.supabase.co',key='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoeG5idGl5dXloaXl3emVzaGlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2MDA0ODcsImV4cCI6MjEwOTE3NjQ4N30.65LSQMuaq8MQOpFUjCSyRT4ZITtNxKF3c_xa_ZVEi_E';
let active=false,checking=false,verifiedOwner='',settle;
const ready=new Promise(resolve=>{settle=resolve;});
const gate=document.createElement('section');gate.id='billing-session-gate';gate.setAttribute('role','status');
gate.innerHTML='<h1>로그인 확인</h1><p data-status>정산 접근 권한을 확인하고 있어요…</p><a href="../index.html?return=billing" target="_blank" rel="noopener">VOCAL.zip에서 로그인하기</a><button type="button">로그인 다시 확인</button>';
document.body.appendChild(gate);
const message=gate.querySelector('[data-status]'),main=document.querySelector('main.billing');
function lock(text){active=false;main.inert=true;document.documentElement.classList.add('billing-session-locked');message.textContent=text;gate.hidden=false;}
function raw(){try{const value=JSON.parse(window.localStorage.getItem(AUTH)||'null');return value?.currentSession||value;}catch{return null;}}
const gateApi=window.VzipBillingSession={
 ready,
 get active(){return active;},
 get owner(){return verifiedOwner;},
 assert(){const current=raw()?.user?.id;if(!active||scope.leaving||!current||current!==verifiedOwner||current!==scope.owner)throw Error('정산 로그인을 다시 확인해 주세요. 입력 자료는 지우지 않았어요.');}
};
async function check(){
 if(checking)return;checking=true;
 try{
  const session=raw(),owner=session?.user?.id;
  if(!scope||!session?.access_token||!owner){lock('VOCAL.zip에서 로그인한 뒤 다시 확인해 주세요.');return;}
  if(scope.owner!==owner){lock('계정의 저장 공간을 전환하고 있어요…');await scope.switchTo(owner);return;}
  const response=await fetch(endpoint+'/rest/v1/rpc/vzip_session_context',{
   method:'POST',headers:{apikey:key,Authorization:'Bearer '+session.access_token,'Content-Type':'application/json','X-Client-Info':'vocalzip-device-session-v2'},
   body:'{}',signal:AbortSignal.timeout(10000),cache:'no-store'
  });
  const data=await response.json();
  if(!response.ok||data?.user_id!==owner||data?.allowed!==true||!data.playback_token){
   lock('이 로그인의 정산 접근이 종료됐거나 아직 등록되지 않았어요. VOCAL.zip에서 확인해 주세요.');return;
  }
  if(raw()?.access_token!==session.access_token||scope.leaving)return;
  verifiedOwner=owner;active=true;main.inert=false;gate.hidden=true;document.documentElement.classList.remove('billing-session-locked');settle(true);
 }catch{lock('로그인을 확인하지 못했어요. 기기 자료와 입력은 그대로 두었습니다. 연결 후 다시 확인해 주세요.');}
 finally{checking=false;}
}
gate.querySelector('button').onclick=()=>{void check();};
main.inert=true;
void check();setInterval(()=>{void check();},20000);
window.addEventListener('focus',()=>{void check();});
window.addEventListener('storage',e=>{if(e.key===AUTH||e.key===null){lock('로그인이 바뀌었어요. 계정을 다시 확인하고 있어요…');void check();}});
})();
