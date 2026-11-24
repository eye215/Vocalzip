/* 휴대폰으로 녹음 알림 (owner, 2026-11-23: "워치·잠금화면 알림"): this device can receive the 휴대폰으로 녹음 requests of the
 * account's other devices as notifications — with the app closed, on the lock screen and on a paired watch.
 *   설정 › 알림 › 휴대폰으로 녹음 알림  turns it on or off for THIS device (the browser asks for permission once).
 *     Shown only when the server is set up (window.vzipCloudPush.status(): the edge function vzip-push-handoff and its
 *     keys); on an iPhone/iPad only in the app added to the home screen (Apple allows web notifications only there).
 *   app/record-handoff.js send() also asks the server to notify; the phone's 녹음 시작 line and the at-once message stay
 *     as they are, so nothing depends on notifications.
 *   share-worker.js shows the notification and opens #/record?song=… when it is tapped.
 * Kept: the push endpoint for this account (Supabase, vzip_push_subscriptions); on this device, whether it is on. */
(() => {
'use strict';
const V = window.VZ;
if (!V || typeof document === 'undefined') return;
const esc = V.esc, ON_KEY = 'vzip_push_handoff_on';
// On since 2026-11-24 (docs/push-handoff-setup.md, step 4: table, function and keys set up). The 설정 row still shows
// only when the server answers with its public key (status().available), so a missing key keeps it hidden.
// window.VZIP_PUSH_READY = false turns it off on a page (tests).
const SERVER_READY = true;
// Only from the sites the function answers (its ORIGINS, supabase/functions/vzip-push-handoff): elsewhere (a test
// server, a preview) the browser refuses the answer and logs an access-control error on every 설정 visit.
const ORIGINS = ['https://vocalzip.yullul.com', 'https://eye215.github.io', 'http://localhost:3000'];
const ready = () => window.VZIP_PUSH_READY ?? (SERVER_READY && ORIGINS.includes(location.origin));
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const apple = () => /iPhone|iPad/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const standalone = () => navigator.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches;
const isOn = () => { try { return localStorage.getItem(ON_KEY) === '1'; } catch { return false; } };
const setOn = on => { try { if (on) localStorage.setItem(ON_KEY, '1'); else localStorage.removeItem(ON_KEY); } catch {} };
const keyBytes = b64 => { const s = (b64 + '='.repeat((4 - b64.length % 4) % 4)).replace(/-/g, '+').replace(/_/g, '/'), raw = atob(s); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
const deviceId = () => V.recordHandoff?.deviceId?.() || (() => { try { let id = localStorage.getItem('vzip_device_id'); if (!id) { id = V.uid(); localStorage.setItem('vzip_device_id', id); } return id; } catch { return 'here'; } })();
const deviceName = () => V.recordHandoff?.deviceName?.() || '';
let status = null;   // {available, publicKey} once asked

async function registration() { return navigator.serviceWorker.ready; }
async function enable() {
  if (!status?.available) throw Error('알림 서버가 아직 준비되지 않았어요.');
  // The permission question comes first, straight from the tap (iOS asks only then).
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw Error(permission === 'denied' ? '알림이 꺼져 있어요. 기기 설정에서 VOCAL.zip 알림을 허용해 주세요.' : '알림을 허용하지 않았어요.');
  const reg = await registration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) sub = await reg.pushManager.subscribe({userVisibleOnly:true, applicationServerKey:keyBytes(status.publicKey)});
  await window.vzipCloudPush.register(sub.toJSON(), deviceId(), deviceName());
  setOn(true);
}
async function disable() {
  setOn(false);
  try {
    const sub = await (await registration()).pushManager.getSubscription();
    if (sub) { await window.vzipCloudPush?.unregister(sub.endpoint); await sub.unsubscribe().catch(() => {}); }
  } catch {}
}
/** The row of 설정 (empty until the server says it is set up). */
function rowHtml() {
  const blocked = !supported() ? '이 브라우저는 알림을 받을 수 없어요.' : apple() && !standalone() ? '홈 화면에 추가한 VOCAL.zip 앱에서 켤 수 있어요.' : '';
  const on = isOn() && !blocked && Notification.permission === 'granted';
  const sub = blocked || (on ? '켜짐 · 다른 기기에서 고른 곡이 알림으로 와요' : '꺼짐 · 켜면 앱을 닫아 두어도 알림(워치 포함)으로 와요');
  return '<div class="item vz-push-row" data-push-row><i class="ph ph-bell-ringing" aria-hidden="true"></i><span class="item-main"><span class="item-title">휴대폰으로 녹음 알림</span><span class="item-sub" data-push-sub>' + esc(sub) + '</span></span>' +
    (blocked ? '' : '<button type="button" class="switch" role="switch" aria-checked="' + on + '" aria-label="휴대폰으로 녹음 알림" data-push-toggle><span></span></button>') + '</div>';
}
/** The 알림 section of 설정. Always there (owner, 2026-11-24: "이게 어딨음?"): with the switch once the server answers with
 * its key, otherwise one line saying why it cannot be turned on yet (signed out · the server did not answer). */
const waitRow = (sub) => '<div class="item vz-push-row" data-push-row data-push-unavailable><i class="ph ph-bell-ringing" aria-hidden="true"></i><span class="item-main"><span class="item-title">휴대폰으로 녹음 알림</span><span class="item-sub" data-push-sub>' + esc(sub) + '</span></span></div>';
const sleep = ms => new Promise(r => setTimeout(r, ms));
let mounting = 0;
async function mountSettings(host) {
  if (!window.vzipCloudPush || !ready()) return;
  const run = ++mounting;
  // 설정 may still be drawing: wait for its 공유·점검 section (the 알림 section goes just before it).
  for (let i = 0; !host?.isConnected && i < 30; i++) { await sleep(100); host = document.querySelector('[data-settings-group="more"]'); }
  if (!host?.isConnected || run !== mounting || host.parentNode.querySelector('[data-settings-group="notify"]')) return;
  host.insertAdjacentHTML('beforebegin', '<section class="vz-settings-section" data-settings-group="notify"><h2>알림</h2><div class="list icons vz-settings-list" data-push-host>' + waitRow('확인하는 중…') + '</div></section>');
  const box = host.parentNode.querySelector('[data-push-host]');
  // Signing in can finish a moment after the app opens: ask again for a few seconds before saying "로그인".
  for (let i = 0; i < 6; i++) {
    status = await window.vzipCloudPush.status().catch(() => null);
    if (status?.available || status?.why !== 'signed-out') break;
    await sleep(500);
  }
  if (!box.isConnected || run !== mounting) return;
  if (status?.available) { box.innerHTML = rowHtml(); wire(box); return; }
  box.innerHTML = waitRow(status?.why === 'signed-out' ? '로그인하면 켤 수 있어요.' : '알림 서버에 연결하지 못했어요. 잠시 뒤 설정을 다시 열어 보세요.');
}
function wire(box) {
  const t = box?.querySelector('[data-push-toggle]'); if (!t) return;
  t.onclick = async () => {
    const want = t.getAttribute('aria-checked') !== 'true';
    t.disabled = true;
    try { if (want) { await enable(); V.toast('이 기기에서 알림을 받아요.'); } else { await disable(); V.toast('이 기기에서 알림을 껐어요.'); } }
    catch (error) { setOn(false); V.toast(error.message || '알림을 켜지 못했어요.', 'error'); }
    box.innerHTML = rowHtml(); wire(box);
  };
}
// 설정 opens: its 공유·점검 section is the place; the 알림 section goes just before it.
const onSettings = () => { if (/^#\/settings/.test(location.hash)) setTimeout(() => mountSettings(document.querySelector('[data-settings-group="more"]')), 0); };
window.addEventListener('hashchange', onSettings);
onSettings();
// The worker asks an open window to go to the tapped notification's address (when it cannot navigate itself).
navigator.serviceWorker?.addEventListener?.('message', e => { if (e.data?.type === 'vzip-open' && typeof e.data.url === 'string' && e.data.url.startsWith(location.origin)) location.href = e.data.url; });
V.pushHandoff = {ready, supported, standalone, isOn, enable, disable, mountSettings, rowHtml, status:() => status};
})();
