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
  if(window.VzipAccountScope)return window.vzipCloudSignedIn?.()?'user:'+window.VzipAccountScope.owner:'';
  // Same rule as 레슨비 정산 (billing/store.js): the session's account, else the account the app remembers, else this device.
  try { const data = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'), user = (data?.currentSession || data)?.user; if (user?.id) return 'user:' + user.id; const linked = localStorage.getItem('vzip_cloud_linked_user'); return linked ? 'user:' + linked : 'device'; } catch { return 'device'; }
}
/** The billing ledger for this account, or null when billing was never used here. */
async function ledger() {
  if(!window.indexedDB)return null;
  const account=owner(),scope=window.VzipAccountScope;
  if(scope&&(!account||scope.leaving))return null;
  async function read(name){
    if(indexedDB.databases){try{if(!(await indexedDB.databases()).some(d=>d.name===name))return null;}catch{}}
    const db=await new Promise((res,rej)=>{const r=indexedDB.open(name);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);r.onblocked=()=>rej(Error('blocked'));});
    try{
      if(!db.objectStoreNames.contains('documents'))return null;
      return await new Promise((res,rej)=>{const q=db.transaction('documents').objectStore('documents').get(account);q.onsuccess=()=>res(q.result||null);q.onerror=()=>rej(q.error);});
    }finally{db.close();}
  }
  const document=scope?await read(scope.billingDb())||await read('vocalzip_billing_v1'):await read('vocalzip_billing_v1');
  if(scope&&(!window.vzipCloudSignedIn?.()||scope.leaving||owner()!==account))return null;
  return document?.owner===account?document:null;
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
function lessonFrom({deduction:d, pass, start, end, status}, id = VZ.uid()) {
  const memo = [d.status === 'noshow' ? '당일 취소' : '', d.memo || ''].filter(Boolean).join(' · ');
  return {id, date:d.date, startTime:start, endTime:end, place:'', teacher:pass?.teacher || '', songIds:[], songId:'', prepMemo:'', status,
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
/* 정산의 수강 내역 → 레슨 기록·캘린더 (자동). Every attendance record in the ledger becomes a lesson on its date
 * (00:00–01:00 for 1회, 00:00–02:00 for 2회). A lesson the app already has on that day is linked instead of doubled.
 * The lesson id comes from the record ('bill-<id>'), so two devices make the same lesson and the cloud merge keeps one;
 * a lesson the user deleted is not brought back. The billing ledger itself is never changed here. */
const billLessonId = d => 'bill-' + d.id;
let importing = null;
VZ.billingImportLessons = () => importing ||= (async () => {
  try {
    const doc = await ledger().catch(() => null); if (!doc) return 0;
    const lessons = VZ.db.lessons, ids = new Set(lessons.map(l => l.id)), linked = new Set(lessons.map(l => l.billingDeductionId).filter(Boolean));
    const gone = new Set((VZ.db.deleted?.lessons || []).map(String));
    const suppressed = new Set(VZ.db.deleted?.billingLessonLinks || []);
    const active = (doc.deductions || []).filter(d => !suppressed.has(d.id) && !d.voidedAt && /^\d{4}-\d{2}-\d{2}$/.test(d.date || '')).sort((a, b) => a.date.localeCompare(b.date));
    const claimed = new Set(active.map(d => d.lessonId).filter(Boolean)); // app lessons a record already points at
    const passes = new Map((doc.passes || []).map(p => [p.id, p]));
    const add = [], link = [], taken = new Set();
    // A lesson made from a record that is no longer in the ledger (deleted, or the ledger was rebuilt) is re-linked to a
    // record of the same day instead of getting a second copy on the calendar.
    const known = new Set((doc.deductions || []).map(d => d.id));
    const stale = l => l.importedFrom === 'billing' && l.billingDeductionId && !known.has(l.billingDeductionId);
    for (const d of active) {
      if ((d.lessonId && (ids.has(d.lessonId) || gone.has(String(d.lessonId)))) || linked.has(d.id) || ids.has(billLessonId(d)) || gone.has(billLessonId(d))) continue;
      const same = lessons.find(l => l.date === d.date && (!l.billingDeductionId || stale(l)) && !claimed.has(l.id) && !taken.has(l.id));
      if (same) { taken.add(same.id); link.push([same.id, d.id]); } else add.push(d);
    }
    if (!add.length && !link.length) return 0;
    const ok = VZ.change(db => {
      for (const [id, dId] of link) { const l = db.lessons.find(x => x.id === id); if (l && (!l.billingDeductionId || stale(l))) l.billingDeductionId = dId; }
      for (const d of add) if (!db.lessons.some(l => l.id === billLessonId(d))) db.lessons.push(lessonFrom({deduction:d, pass:passes.get(d.passId), start:'00:00', end:endTime(d.units), status:statusOf(d.status)}, billLessonId(d)));
    }, {silent:true});
    if (!ok) return 0;
    if (/^#\/(home|calendar|lessons?|song)/.test(location.hash)) VZ.render();
    if (add.length) VZ.toast('레슨비 정산의 수강 ' + add.length + '건을 레슨 기록·캘린더에 넣었어요.');
    return add.length;
  } finally { importing = null; }
})();
const importSoon = (ms = 2500) => setTimeout(() => VZ.billingImportLessons().catch(() => {}), ms);
importSoon(); // after start-up (and the cloud merge that follows sign-in)
window.addEventListener('vzip:auth-changed', () => importSoon(3000));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') importSoon(800); });
window.addEventListener('pageshow', e => { if (e.persisted) importSoon(800); }); // back from 레슨비 정산
/* 레슨 화면 위쪽 안내: 정산에만 있는 수강 내역이 있을 때만 */
VZ.billingLessonBanner = async host => {
  if (!host) return;
  const {add, sameDay} = await VZ.billingLessonCandidates().catch(() => ({add:[], sameDay:[]}));
  const n = add.length + sameDay.length;
  if (!host.isConnected || !n) { host.innerHTML = ''; return; }
  host.innerHTML = '<div class="card row" style="gap:10px;margin-bottom:12px"><i class="ph ph-receipt" style="font-size:22px;color:var(--accent)"></i><span class="grow small">레슨비 정산에만 있는 수강 내역 <strong>' + n + '개</strong>를 레슨 기록에 올릴 수 있어요.</span><button type="button" class="btn sm" data-billing-lessons>보기</button></div>';
  host.querySelector('[data-billing-lessons]').onclick = () => VZ.billingLessonSheet();
};
/* Changes to the billing ledger are made only by 레슨비 정산 itself: the app opens it in a hidden frame
 * (billing/?auto=1, optionally with do=deduct|void) and it reports back. One frame at a time. */
let queue = Promise.resolve();
function runBilling(query = '') {
  if(window.VzipAccountScope&&!window.vzipCloudSignedIn?.())return Promise.resolve({deducted:0,error:'not-authenticated'});
  const run = () => new Promise(resolve => {
    const frame = document.createElement('iframe');
    frame.hidden = true; frame.setAttribute('aria-hidden', 'true'); frame.tabIndex = -1; frame.title = '레슨비 정산';
    const done = data => { window.removeEventListener('message', onMessage); clearTimeout(timer); frame.remove(); resolve(data); };
    const onMessage = e => { if (e.origin === location.origin && e.data?.type === 'vzip-billing-auto' && e.source === frame.contentWindow) done(e.data); };
    const timer = setTimeout(() => done({deducted:0, error:'timeout'}), 20000);
    window.addEventListener('message', onMessage);
    frame.src = 'billing/?auto=1' + query;
    document.body.append(frame);
  });
  const p = queue.then(run, run); queue = p.catch(() => {});
  return p;
}
// Lesson screens show the ledger's state: redraw them after billing changed.
const changed = () => { if (/^#\/lessons?(\/|$)/.test(location.hash)) VZ.render(); };
/* 레슨을 완료로 저장하면 레슨비 정산이 뒤에서 열려 자동 차감해요 (정산 화면의 자동 차감 설정을 따라요). */
let syncTimer = null, syncing = false;
VZ.billingAutoSync = () => {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    if (syncing) return; syncing = true;
    try {
      const r = await runBilling();
      if (r.deducted) { VZ.toast('레슨비 정산에서 ' + r.deducted + '회 차감했어요.'); changed(); }
      else if (r.waiting) VZ.toast('남은 횟수가 있는 레슨권이 없어요. 레슨비 정산의 정산 대기에 남겨 뒀어요.');
    } finally { syncing = false; }
  }, 1200);
};
/** Ask 레슨비 정산 to deduct this lesson now, or to cancel its deduction. Resolves to {ok, message}. */
VZ.billingLessonAction = async (kind, id) => {
  const r = await runBilling(kind === 'deduct' ? '&do=deduct&lesson=' + encodeURIComponent(id) : '&do=void&deduction=' + encodeURIComponent(id));
  changed();
  return r.action || {ok:false, message:r.error === 'timeout' ? '레슨비 정산이 응답하지 않아요. 잠시 후 다시 시도해 주세요.' : '레슨비 정산을 열지 못했어요.'};
};

/* ---------- 레슨별 정산 상태 ---------- */
/** {kind:'deducted', deduction, pass} · {kind:'pending'} · {kind:'sameDay'} · null (nothing to show).
 * pending = completed (or past) lesson with no attendance record; sameDay = another record on that date. */
VZ.billingStatusOf = (doc, l) => {
  if (!doc || !l) return null;
  const rows = (doc.deductions || []).filter(d => !d.voidedAt);
  const d = rows.find(x => (x.lessonId && x.lessonId === l.id) || (l.billingDeductionId && x.id === l.billingDeductionId));
  if (d) return {kind:'deducted', deduction:d, pass:(doc.passes || []).find(p => p.id === d.passId)};
  if (VZ.lessonStatus(l) !== 'done' || !l.date || l.date > VZ.today()) return null;
  return rows.some(x => x.date === l.date) ? {kind:'sameDay'} : {kind:'pending'};
};
VZ.billingLedger = () => ledger().catch(() => null);
// Deletion must distinguish a failed ledger read from an account that never had a ledger.
VZ.billingDeletionLedger = () => ledger();
VZ.billingCancelForDeletion = async job => {
 const l=VZ.db.lessons.find(x=>x.id===job.lesson.id);
 if(!l)throw Error('삭제할 레슨이 변경됐어요.');
 const guard={id:l.id,date:l.date||'',status:({done:'completed',scheduled:'scheduled',cancelled:'cancelled'})[l.status]||'unconfirmed',
  start:l.startTime||'',end:l.endTime||'',billingId:l.billingDeductionId||'',touched:Math.max(Number(l.created)||0,Number(l.updatedAt)||0)};
 const query='&do=delete-cancel&lesson='+encodeURIComponent(l.id)+'&deduction='+encodeURIComponent(job.deduction.id)+
  '&version='+job.deduction.version+'&operation='+encodeURIComponent(job.id)+'&guard='+encodeURIComponent(JSON.stringify(guard));
 const result=await runBilling(query);
 if(!result.action?.ok||result.action.operationId!==job.id)throw Error(result.action?.message||'정산 응답을 확인하지 못했어요. 삭제를 다시 시도해 주세요.');
 return result.action;
};
const units = d => (Number(d.units) || 0) / 100 + '회';
const badge = st => st.kind === 'deducted'
  ? '<span class="badge" data-billing-badge><i class="ph ph-receipt"></i>' + (st.deduction.status === 'noshow' ? '당일 취소 ' : '정산 ') + units(st.deduction) + '</span>'
  : st.kind === 'pending' ? '<span class="badge warn" data-billing-badge><i class="ph ph-receipt"></i>정산 대기</span>' : '';
/** Sessions left over all active passes (100 = 1회), or null when there is no pass. Same math as billing's passBalance. */
VZ.billingRemaining = doc => {
  const live = rows => (rows || []).filter(r => !r.voidedAt), passes = live(doc?.passes);
  if (!passes.length) return null;
  if (doc.hourlyRate > 0) { // 시간당 단가: 결제 금액 ÷ 단가 − 수강 (정산 현황의 '남은 레슨'과 같은 계산)
    const ids = new Set(passes.map(p => p.id)), pay = live(doc.payments).filter(r => ids.has(r.passId));
    const net = pay.reduce((n, r) => n + (r.kind === 'refund' ? -1 : r.kind === 'payment' ? 1 : 0) * (Number(r.amount) || 0), 0);
    const used = live(doc.deductions).filter(r => ids.has(r.passId)).reduce((n, r) => n + (Number(r.units) || 0), 0);
    return Math.round(net * 100 / doc.hourlyRate) - used;
  }
  const ids = new Set(passes.map(p => p.id)), sum = (rows, key) => live(rows).filter(r => ids.has(r.passId)).reduce((n, r) => n + (Number(r[key]) || 0), 0);
  return passes.reduce((n, p) => n + (Number(p.totalUnits) || 0), 0) + sum(doc.adjustments, 'unitsDelta') - sum(doc.deductions, 'units');
};
/** "레슨권 남은 N회" on the home lesson card (warns at 1회 or less). */
VZ.billingLeftChip = async host => {
  if (!host) return;
  const left = VZ.billingRemaining(await VZ.billingLedger());
  if (left === null || !host.isConnected) return;
  const n = Math.round(left) / 100;
  host.innerHTML = '<span class="dday" style="' + (left <= 100 ? 'background:var(--warn-soft);color:var(--warn)' : '') + '"><i class="ph ph-receipt"></i> ' + (left <= 0 ? '결제한 횟수를 다 썼어요' : '남은 레슨 ' + n + '회' + (left <= 100 ? ' · 곧 소진' : '')) + '</span>';
};
/** Adds a small 정산 badge to each lesson row under host (lesson list). */
VZ.billingDecorateLessons = async host => {
  if (!host) return;
  const doc = await VZ.billingLedger(); if (!doc || !host.isConnected) return;
  for (const a of host.querySelectorAll('a.item[href^="#/lesson/"]')) {
    const l = VZ.db.lessons.find(x => x.id === decodeURIComponent(a.getAttribute('href').slice(9)));
    const st = VZ.billingStatusOf(doc, l), title = a.querySelector('.item-title');
    if (st && title && !title.querySelector('[data-billing-badge]')) title.insertAdjacentHTML('beforeend', ' ' + badge(st));
  }
};
/** The 레슨비 정산 line on a lesson's page, with deduct / cancel. */
VZ.billingLessonCard = async (host, l) => {
  if (!host) return;
  const doc = await VZ.billingLedger();
  if (!host.isConnected) return;
  const st = VZ.billingStatusOf(doc, l);
  if (!st) { host.innerHTML = ''; return; }
  const text = st.kind === 'deducted'
    ? '레슨비 정산 <strong>' + units(st.deduction) + ' 차감됨</strong>' + (st.pass?.name ? '<span class="muted" style="display:block">' + esc(st.pass.name) + '</span>' : '')
    : st.kind === 'pending' ? '레슨비 정산에 <strong>아직 차감하지 않았어요</strong>'
    : '같은 날 다른 정산 기록이 있어 <strong>자동 차감하지 않았어요</strong>';
  const btn = st.kind === 'deducted' ? '<button type="button" class="btn sm ghost" data-billing-do="void">차감 취소</button>'
    : '<button type="button" class="btn sm" data-billing-do="deduct">' + (st.kind === 'sameDay' ? '그래도 차감' : '지금 차감') + '</button>';
  host.innerHTML = '<div class="row" style="gap:8px;padding-top:10px;border-top:1px solid var(--line)"><i class="ph ph-receipt" style="font-size:20px;color:var(--accent)"></i><span class="grow small">' + text + '</span>' + btn + '<a class="icon-btn" href="billing/" aria-label="레슨비 정산 열기"><i class="ph ph-arrow-square-out"></i></a></div>';
  host.querySelector('[data-billing-do]').onclick = async e => {
    const kind = e.currentTarget.dataset.billingDo, b = e.currentTarget;
    const ok = kind === 'void'
      ? await VZ.confirm('차감 취소', '레슨비 정산에서 이 레슨의 ' + units(st.deduction) + ' 차감을 취소할까요? 횟수가 레슨권에 돌아가고, 정산의 삭제 내역에서 다시 복구할 수 있어요. 레슨 기록은 그대로예요.', {ok:'차감 취소', danger:true})
      : await VZ.confirm('레슨비 차감', (st.kind === 'sameDay' ? '같은 날 정산 기록이 이미 있어요. 따로 받은 레슨일 때만 차감해 주세요. ' : '') + '남은 횟수가 있는 가장 오래된 레슨권에서 레슨 시간만큼 차감할까요? (1시간 = 1회)', {ok:'차감'});
    if (!ok) return;
    b.disabled = true; b.textContent = '처리 중…';
    const r = await VZ.billingLessonAction(kind, kind === 'void' ? st.deduction.id : l.id);
    VZ.toast(r.message);
    if (host.isConnected) VZ.billingLessonCard(host, l);
  };
};
window.addEventListener('vzip:data-changed', () => {
  const now = Date.now(), today = VZ.today();
  // Only right after a lesson was saved as completed (explicit status, not one imported from billing).
  if (VZ.db.lessons.some(l => l.status === 'done' && !l.billingDeductionId && (l.date || '') <= today && now - (Number(l.updatedAt) || Number(l.created) || 0) < 15000)) VZ.billingAutoSync();
});
})();
