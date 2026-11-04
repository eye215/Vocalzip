/* VOCAL.zip v6 boot: service worker, share inbox, first render, offline fallback for the login gate. */
(() => {
'use strict';
const VZ = window.VZ;
if ('serviceWorker' in navigator) navigator.serviceWorker.register(new URL('share-worker.js', location.href), {scope:new URL('./', location.href).pathname}).catch(() => {});
if (!location.hash) history.replaceState(null, '', location.pathname + location.search + '#/home');
VZ.render();
VZ.receiveShared?.();
// If the auth library never loads, do not leave the user behind a permanent cover.
setTimeout(() => {
  const cover = document.getElementById('vzip-boot-cover');
  if (cover && !window.supabase?.createClient) { cover.remove(); VZ.toast('클라우드에 연결하지 못했어요. 이 기기의 기록으로 계속 사용할 수 있어요.', 'error'); }
}, 8000);
window.addEventListener('vzip:auth-changed', () => { VZ.media.invalidate(); });
})();
