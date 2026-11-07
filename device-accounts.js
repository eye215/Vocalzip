/* VOCAL.zip: which account this device's own records and recordings belong to (account switch protection).
 *
 * Logging out keeps everything on the device (nothing is erased). Without this module the next account to log in
 * on the same browser silently merged those records into its own cloud copy and uploaded the recordings into its
 * own storage. Now:
 *  - vzip_device_owner_v1 (localStorage) remembers the account the device data belongs to. It survives logout.
 *  - When a different account logs in, cloud-sync.js holds every merge and upload until the person chooses.
 *  - "Keep separately" moves the device records of the previous account into a per-account archive
 *    (IndexedDB vzip_device_accounts_v1, added; the existing stores keep their format) and remembers which
 *    recordings were that account's. They stay on the device but are not shown to, synced or uploaded for the
 *    other account. The archive comes back when that account logs in here again.
 * Nothing is deleted: an archive entry is removed only after its records were written back to the device.
 * Recording records (vocalzip_media_v1/recordings) are never rewritten; ownership is kept here by id. */
(() => {
'use strict';
const OWNER_KEY = 'vzip_device_owner_v1', LINKED_KEY = 'vzip_cloud_linked_user', DATA_KEY = 'vocal-zip_mvp_v1';
const DB = 'vzip_device_accounts_v1', STORE = 'archives';
const COLLECTIONS = ['songs', 'lessons', 'assignments', 'practices', 'comparisonReports', 'performances'];

const readJSON = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
/** {id, email, since} of the account the device data belongs to, or null when unknown (never signed in here).
 * Devices from before this module: the account the app was last linked to counts as the owner. */
function owner() {
  const o = readJSON(OWNER_KEY);
  if (o && typeof o.id === 'string' && o.id) return {id:o.id, email:String(o.email || ''), since:Number(o.since) || 0};
  const linked = localStorage.getItem(LINKED_KEY);
  return linked ? {id:linked, email:'', since:0} : null;
}
/** Record that the device data now belongs to this account. `since` moves only when the device changes from one
 * known account to another (snapshots older than that are the other account's); a first owner keeps everything. */
function claim(user) {
  if (!user?.id) return;
  const o = owner(), since = !o ? 0 : o.id === user.id ? o.since : Date.now();
  try { localStorage.setItem(OWNER_KEY, JSON.stringify({id:user.id, email:mask(user.email), since})); } catch {}
}
/** "ab***@example.com": enough for the owner to recognize their account, not a full address shown to others. */
function mask(email) {
  const [name, host] = String(email || '').split('@');
  return host ? name.slice(0, 2) + '***@' + host : '';
}
/** The device data belongs to another account than the one now signed in. */
const conflict = user => { const o = owner(); return !!(user?.id && o && o.id !== user.id); };
const hasRecords = data => COLLECTIONS.some(k => Array.isArray(data?.[k]) && data[k].length);

/* ---------- IndexedDB ---------- */
function open(name, version, upgrade) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(Error('다른 VOCAL.zip 탭을 닫고 다시 시도해 주세요.'));
  });
}
const archives = () => open(DB, 1, db => { if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, {keyPath:'owner'}); });
async function run(mode, action) {
  const db = await archives();
  try {
    return await new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode), r = action(t.objectStore(STORE));
      let result; r.onsuccess = () => { result = r.result; }; r.onerror = () => reject(r.error);
      t.oncomplete = () => resolve(result); t.onabort = t.onerror = () => reject(t.error || Error('기기 기록 보관이 중단됐어요.'));
    });
  } finally { db.close(); }
}
const getArchive = id => run('readonly', s => s.get(id)).then(x => x || null);
const allArchives = () => run('readonly', s => s.getAll()).then(x => x || []);
/** Ids of every recording kept on this device (keys only, no file is read). */
async function deviceMediaIds() {
  const db = await open('vocalzip_media_v1', 1, d => { if (!d.objectStoreNames.contains('recordings')) d.createObjectStore('recordings', {keyPath:'id'}); });
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction('recordings', 'readonly').objectStore('recordings').getAllKeys();
      r.onsuccess = () => resolve((r.result || []).map(String)); r.onerror = () => reject(r.error);
    });
  } finally { db.close(); }
}
/** Recordings on this device that belong to an archived account other than `current` (shown, synced and uploaded for nobody else). */
async function hiddenMediaIds(current = owner()?.id) {
  const out = new Set();
  try { for (const a of await allArchives()) if (a.owner !== current) for (const id of a.mediaIds || []) out.add(String(id)); } catch {}
  return out;
}
/** What the device holds for the current owner: records, and recordings not kept for another account. */
async function deviceSummary() {
  const data = readJSON(DATA_KEY), hidden = await hiddenMediaIds();
  let media = [];
  try { media = (await deviceMediaIds()).filter(id => !hidden.has(id)); } catch {}
  return {records:COLLECTIONS.reduce((n, k) => n + (Array.isArray(data?.[k]) ? data[k].length : 0), 0), media:media.length, mediaIds:media, data};
}
async function archiveInfo(id) {
  try { const a = await getArchive(id); return a ? {records:COLLECTIONS.reduce((n, k) => n + (a.data?.[k]?.length || 0), 0), media:(a.mediaIds || []).length, at:a.at} : null; }
  catch { return null; }
}

/** Keep the device records and recordings of the current owner for that account, and give the device to `user`:
 * their archive (if this device kept one) comes back, otherwise the device starts empty and the cloud copy is loaded
 * by the next sync. Order matters: archive written and read back → device records replaced → that user's archive removed. */
async function switchTo(user) {
  const prev = owner();
  if (!user?.id) throw Error('로그인한 계정을 확인하지 못했어요.');
  const here = await deviceSummary();
  if (prev && prev.id !== user.id && (here.records || here.media)) {
    const old = await getArchive(prev.id);
    // An older archive of the same account (should not happen) is merged, never replaced.
    const merge = window.VzipDataMerge;
    const data = old?.data && here.data ? (merge ? merge.merge(here.data, old.data).data : here.data) : here.data || old?.data || null;
    const entry = {owner:prev.id, email:prev.email, at:Date.now(), data, mediaIds:[...new Set([...(old?.mediaIds || []), ...here.mediaIds])]};
    await run('readwrite', s => s.put(entry));
    const check = await getArchive(prev.id);
    if (!check || check.mediaIds.length !== entry.mediaIds.length || JSON.stringify(check.data) !== JSON.stringify(entry.data)) throw Error('기기 기록을 보관하지 못했어요. 아무것도 바뀌지 않았어요.');
  }
  const mine = await getArchive(user.id);
  if (mine?.data) localStorage.setItem(DATA_KEY, JSON.stringify(mine.data));
  else localStorage.removeItem(DATA_KEY);
  claim(user);
  if (mine) await run('readwrite', s => s.delete(user.id)).catch(() => {});
  window.dispatchEvent(new CustomEvent('vzip:data-changed', {detail:{source:'cloud-merge'}}));
  return {restored:!!mine};
}

window.VzipDeviceAccounts = {owner, claim, conflict, hasRecords, hiddenMediaIds, deviceSummary, archiveInfo, switchTo, mask, OWNER_KEY};
})();
