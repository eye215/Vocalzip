/* 아이패드에서 곡을 틀고 아이폰으로 녹음 (owner's ask, 2026-11-22): on a song, 아이폰으로 녹음 hands the recording to
 * the person's phone. The phone shows one big line — "아이패드에서 고른 곡 · <곡> · 녹음 시작" — that opens the recorder
 * with that song (the mic still needs one tap there: iOS asks for it). How it gets there:
 *   · at once, when the phone has the app open: a message between the account's own devices
 *     (window.vzipCloudDeviceSend / vzipCloudDeviceListen in cloud-sync.js — Realtime broadcast, nothing stored);
 *   · or when the app is opened on the phone within HANDOFF_MINUTES: the request is kept as ONE practicePlans row
 *     {id:'record-handoff', kind:'record-handoff', songId, at, from, fromName} that syncs like other plans.
 * A device never offers its own request back to itself; once used or closed it is not offered again on that device. */
(()=>{
'use strict';
const V=window.VZ;
if(!V||typeof document==='undefined')return;
const esc=V.esc,ROW='record-handoff',HANDOFF_MINUTES=10,SEEN='vzip_handoff_seen_v1';
const ua=()=>navigator.userAgent||'',isPhone=()=>/iPhone|Android.+Mobile/.test(ua());
// iPadOS reports a Mac: a touch screen tells them apart.
const isTablet=()=>/iPad/.test(ua())||(/Macintosh/.test(ua())&&navigator.maxTouchPoints>1);
const deviceName=()=>isPhone()?'아이폰':isTablet()?'아이패드':'다른 기기';
function deviceId(){try{let id=localStorage.getItem('vzip_device_id');if(!id){id=V.uid();localStorage.setItem('vzip_device_id',id);}return id;}catch{return 'here';}}
const seen=()=>{try{return Number(localStorage.getItem(SEEN))||0;}catch{return 0;}};
const markSeen=at=>{try{localStorage.setItem(SEEN,String(at));}catch{}};
const fresh=r=>r&&r.songId&&V.song(r.songId)&&r.from!==deviceId()&&Date.now()-Number(r.at)<HANDOFF_MINUTES*60000&&Number(r.at)>seen();

/** The song page button (not on a phone: the phone is the one that records). */
V.recordHandoffButton=songId=>isPhone()?'':'<button type="button" class="icon-btn" data-record-handoff="'+esc(songId)+'" aria-label="아이폰으로 녹음"><i class="ph ph-device-mobile"></i></button>';
async function send(songId){
  const s=V.song(songId);if(!s)return;
  const r={id:ROW,kind:ROW,v:1,songId,at:Date.now(),from:deviceId(),fromName:deviceName()};
  const kept=V.change(db=>{db.practicePlans||=[];const i=db.practicePlans.findIndex(p=>p?.id===ROW);if(i<0)db.practicePlans.push(r);else db.practicePlans[i]=r;},{silent:true});
  const now=await window.vzipCloudDeviceSend?.({songId,at:r.at,from:r.from,fromName:r.fromName}).catch(()=>false);
  V.sheet({title:'아이폰으로 녹음',
    body:'<div class="rh-sheet" data-rh-sheet><p><b>'+esc(s.title)+'</b></p><p>'+(now?'아이폰에 앱이 열려 있으면 지금 ‘녹음 시작’이 떠요.':'아이폰에서 앱을 열면 맨 위에 ‘녹음 시작’이 떠요.')+
      ' '+HANDOFF_MINUTES+'분 안에 열어 주세요. 녹음은 이 곡에 저장되고 여기서도 보여요.</p>'+(kept?'':'<p class="muted">저장하지 못했어요. 아이폰 앱이 열려 있을 때만 바로 떠요.</p>')+
      '<p class="muted">아이폰 녹음은 이어폰 없이, 아이패드 스피커 소리와 함께 녹음돼요.</p></div>',
    foot:'<button type="button" class="btn block" data-close>확인</button>'});
}
document.addEventListener('click',e=>{const b=e.target.closest?.('[data-record-handoff]');if(b){e.preventDefault();send(b.dataset.recordHandoff);}});

/* ---------- the phone: one line at the top ---------- */
let shown=null;
function hide(){shown?.remove();shown=null;}
function offer(r){
  if(!fresh(r)||(shown&&shown.dataset.at===String(r.at)))return;
  hide();
  const el=document.createElement('div');el.className='rh-bar';el.dataset.recordHandoffBar='';el.dataset.at=String(r.at);el.setAttribute('role','status');
  el.innerHTML='<a class="rh-go" href="#/record?song='+encodeURIComponent(r.songId)+'" data-rh-go><i class="ph-fill ph-microphone" aria-hidden="true"></i><span><small>'+esc(r.fromName||'다른 기기')+'에서 고른 곡</small><strong>'+esc(V.song(r.songId).title)+'</strong></span><b>녹음 시작</b></a>'+
    '<button type="button" class="rh-x" data-rh-close aria-label="닫기"><i class="ph ph-x" aria-hidden="true"></i></button>';
  el.querySelector('[data-rh-go]').addEventListener('click',()=>{markSeen(r.at);hide();});
  el.querySelector('[data-rh-close]').addEventListener('click',()=>{markSeen(r.at);hide();});
  document.body.appendChild(el);shown=el;
}
const kept=()=>(V.db?.practicePlans||[]).find(p=>p?.id===ROW&&p.kind===ROW&&!(V.db.deleted?.practicePlans||[]).includes(p.id));
const check=()=>{const r=kept();if(r&&fresh(r))offer(r);else if(shown&&!(r&&String(r.at)===shown.dataset.at))hide();};
window.vzipCloudDeviceListen?.(payload=>offer(payload||{}));
window.addEventListener('vzip:data-changed',()=>setTimeout(check,0));
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')check();});
window.addEventListener('hashchange',()=>{if(shown&&/^#\/record/.test(location.hash))hide();});
setTimeout(check,1500);
V.recordHandoff={send,offer,check,HANDOFF_MINUTES};
})();
