/* VOCAL.zip — 레슨비 정산의 수강 내역을 레슨 기록으로 올리기.
 * Reads the billing ledger (IndexedDB vocalzip_billing_v1) without changing it, and adds app lessons
 * only after the user confirms. Each added lesson keeps billingDeductionId, so it is never added twice
 * and billing does not ask to deduct it again. Times are 00:00–01:00 (1회) or 00:00–02:00 (2회). */
(() => {
'use strict';
const VZ = window.VZ, esc = VZ.esc;
const AUTH_KEY = 'sb-chxnbtiyuyhiywzeshis-auth-token';
const pad = n => String(n).padStart(2, '0');
function owner() {
  try { const data = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'), user = (data?.currentSession || data)?.user; return user?.id ? 'user:' + user.id : 'device'; } catch { return 'device'; }
}
/** The billing ledger for this account, or null when billing was never used here. */
async function ledger() {
  if (!window.indexedDB) return null;
  if (indexedDB.databases) { try { if (!(await indexedDB.databases()).some(d => d.name === 'vocalzip_billing_v1')) return null; } catch {} }
  const db = await new Promise((res, rej) => { const r = indexedDB.open('vocalzip_billing_v1'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(Error('blocked')); });
  try {
    if (!db.objectStoreNames.contains('documents')) return null;
    return await new Promise((res, rej) => { const q = db.transaction('documents', 'readonly').objectStore('documents').get(owner()); q.onsuccess = () => res(q.result || null); q.onerror = () => rej(q.error); });
  } finally { db.close(); }
}
const endTime = units => { const minutes = Math.max(60, Math.round((Number(units) || 0) / 100 * 60)), m = Math.min(minutes, 23 * 60 + 59); return pad(Math.floor(m / 60)) + ':' + pad(m % 60); };
const statusOf = s => ({completed:'done', free:'done', unconfirmed:'done', scheduled:'scheduled', cancelled:'cancelled', noshow:'cancelled'})[s] || 'done';
/** Deductions that are not yet in the app's lessons. */
VZ.billingLessonCandidates = async () => {
  const doc = await ledger().catch(() => null); if (!doc) return {add:[], sameDay:[]};
  const lessons = VZ.db.lessons, ids = new Set(lessons.map(l => l.id)), linked = new Set(lessons.map(l => l.billingDeductionId).filter(Boolean));
  const passes = new Map((doc.passes || []).map(p => [p.id, p]));
  const add = [], sameDay = [];
  for (const d of doc.deductions || []) {
    if (d.voidedAt || !/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) continue;
    if ((d.lessonId && ids.has(d.lessonId)) || linked.has(d.id)) continue; // already a lesson in the app
    const row = {deduction:d, pass:passes.get(d.passId), start:'00:00', end:endTime(d.units), status:statusOf(d.status)};
    // A lesson already on that day may be this same lesson: leave it to the user (not added automatically).
    (lessons.some(l => l.date === d.date && !l.billingDeductionId) ? sameDay : add).push(row);
  }
  const byDate = (a, b) => a.deduction.date.localeCompare(b.deduction.date);
  return {add:add.sort(byDate), sameDay:sameDay.sort(byDate)};
};
function lessonFrom({deduction:d, pass, start, end, status}) {
  const memo = [d.status === 'noshow' ? '당일 취소' : '', d.memo || ''].filter(Boolean).join(' · ');
  return {id:VZ.uid(), date:d.date, startTime:start, endTime:end, place:'', teacher:pass?.teacher || '', songIds:[], songId:'', prepMemo:'', status,
    feedback:'', memo, recordings:[], created:Date.now(), billingDeductionId:d.id, importedFrom:'billing'};
}
const hoursText = row => (Number(row.deduction.units) || 0) / 100 + '회';
VZ.billingLessonSheet = async () => {
  const {add, sameDay} = await VZ.billingLessonCandidates();
  const line = (r, i, checked) => '<label class="item"><input type="checkbox" data-pick="' + i + '"' + (checked ? ' checked' : '') + ' style="width:22px;height:22px;accent-color:var(--accent)"><span class="item-main"><span class="item-title">' + esc(VZ.dateLabel(r.deduction.date, true)) + ' · ' + r.start + '–' + r.end + '</span><span class="item-sub">' + esc([hoursText(r), {done:'완료', cancelled:'취소', scheduled:'예정'}[r.status], r.pass?.name, r.deduction.memo].filter(Boolean).join(' · ')) + '</span></span></label>';
  const rows = [...add, ...sameDay];
  if (!rows.length) { VZ.toast('정산 수강 내역은 모두 레슨 기록에 있어요.'); return; }
  VZ.sheet({title:'정산 수강 내역을 레슨 기록에 추가', body:
    '<p class="small muted" style="margin-top:0">레슨비 정산에 있는 수강 내역이에요. 체크한 것만 레슨 기록에 추가해요. 시간은 1회는 00:00–01:00, 2회는 00:00–02:00으로 넣어요. 정산 기록은 바꾸지 않아요.</p>' +
    (add.length ? '<div class="list">' + add.map((r, i) => line(r, i, true)).join('') + '</div>' : '') +
    (sameDay.length ? '<h3 class="cal-group" style="margin-top:14px">같은 날 레슨이 이미 있어요 (' + sameDay.length + ')</h3><p class="small muted" style="margin:4px">같은 레슨일 수 있어 기본으로 빼 뒀어요. 따로 받은 레슨이면 체크해 주세요.</p><div class="list">' + sameDay.map((r, i) => line(r, add.length + i, false)).join('') + '</div>' : ''),
    foot:'<button type="button" class="btn block" data-go>선택한 레슨 추가</button>',
    onMount:(el, close) => {
      const go = el.parentNode.querySelector('[data-go]');
      const count = () => { const n = el.querySelectorAll('[data-pick]:checked').length; go.textContent = '선택한 ' + n + '개 레슨 추가'; go.disabled = !n; };
      el.querySelectorAll('[data-pick]').forEach(c => c.onchange = count); count();
      go.onclick = () => {
        const picked = [...el.querySelectorAll('[data-pick]:checked')].map(c => rows[Number(c.dataset.pick)]);
        const fresh = picked.filter(r => !VZ.db.lessons.some(l => l.billingDeductionId === r.deduction.id));
        if (VZ.change(d => { for (const r of fresh) d.lessons.push(lessonFrom(r)); })) { close(); VZ.toast('레슨 기록에 ' + fresh.length + '개를 추가했어요.'); }
      };
    }});
};
/* 레슨 화면 위쪽 안내: 정산에만 있는 수강 내역이 있을 때만 */
VZ.billingLessonBanner = async host => {
  if (!host) return;
  const {add, sameDay} = await VZ.billingLessonCandidates().catch(() => ({add:[], sameDay:[]}));
  const n = add.length + sameDay.length;
  if (!host.isConnected || !n) { host.innerHTML = ''; return; }
  host.innerHTML = '<div class="card row" style="gap:10px;margin-bottom:12px"><i class="ph ph-receipt" style="font-size:22px;color:var(--accent)"></i><span class="grow small">레슨비 정산에만 있는 수강 내역 <strong>' + n + '개</strong>를 레슨 기록에 올릴 수 있어요.</span><button type="button" class="btn sm" data-billing-lessons>보기</button></div>';
  host.querySelector('[data-billing-lessons]').onclick = () => VZ.billingLessonSheet();
};
/* 레슨을 완료로 저장하면 레슨비 정산이 뒤에서 열려 자동 차감해요 (정산 화면의 자동 차감 설정을 따라요). */
let syncTimer = null, frame = null;
VZ.billingAutoSync = () => {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(() => {
    if (frame) return;
    frame = document.createElement('iframe');
    frame.hidden = true; frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1; frame.title = '레슨비 정산 자동 차감';
    const done = () => { window.removeEventListener('message', onMessage); clearTimeout(timer); frame?.remove(); frame = null; };
    const onMessage = e => {
      if (e.origin !== location.origin || e.data?.type !== 'vzip-billing-auto' || e.source !== frame?.contentWindow) return;
      if (e.data.deducted) VZ.toast('레슨비 정산에서 ' + e.data.deducted + '회 차감했어요.');
      done();
    };
    const timer = setTimeout(done, 20000);
    window.addEventListener('message', onMessage);
    frame.src = 'billing/?auto=1';
    document.body.append(frame);
  }, 1200);
};
window.addEventListener('vzip:data-changed', () => {
  const now = Date.now(), today = VZ.today();
  // Only right after a lesson was saved as completed (explicit status, not one imported from billing).
  if (VZ.db.lessons.some(l => l.status === 'done' && !l.billingDeductionId && (l.date || '') <= today && now - (Number(l.updatedAt) || Number(l.created) || 0) < 15000)) VZ.billingAutoSync();
});
})();
