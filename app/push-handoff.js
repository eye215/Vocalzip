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
/** Put the 알림 section into 설정 once the server answers that it is set up. */
async function mountSettings(host) {
  if (!host) return;
  if (!window.vzipCloudPush) return;
  status = await window.vzipCloudPush.status().catch(() => null);
  if (!status?.available || !host.isConnected || host.querySelector('[data-push-row]')) return;
  host.insertAdjacentHTML('beforebegin', '<section class="vz-settings-section" data-settings-group="notify"><h2>알림</h2><div class="list icons vz-settings-list" data-push-host>' + rowHtml() + '</div></section>');
  wire(host.parentNode.querySelector('[data-push-host]'));
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
window.addEventListener('hashchange', () => { if (/^#\/settings/.test(location.hash)) setTimeout(() => mountSettings(document.querySelector('[data-settings-group="more"]')), 0); });
if (/^#\/settings/.test(location.hash)) setTimeout(() => mountSettings(document.querySelector('[data-settings-group="more"]')), 300);
// The worker asks an open window to go to the tapped notification's address (when it cannot navigate itself).
navigator.serviceWorker?.addEventListener?.('message', e => { if (e.data?.type === 'vzip-open' && typeof e.data.url === 'string' && e.data.url.startsWith(location.origin)) location.href = e.data.url; });
V.pushHandoff = {supported, standalone, isOn, enable, disable, mountSettings, rowHtml, status:() => status};
})();
