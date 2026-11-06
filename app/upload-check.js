/* VOCAL.zip — 업로드 상태 진단 (read-only).
 * Compares, for the signed-in account: files on this device (IndexedDB), library rows (Supabase vocal_media, all pages)
 * and objects in R2 (Worker /v1/objects, own folder only). Nothing is changed, uploaded or deleted here; the full result
 * can be saved as JSON (a backup of the lists before any recovery). Recovery itself is a separate, approved step. */
(() => {
'use strict';
const VZ = window.VZ, esc = VZ.esc;
const mb = n => n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(2) + 'GB' : (n / 1024 ** 2).toFixed(1) + 'MB';
let last = null, running = false;

/** Device files without loading them all at once (one record at a time through a cursor). */
function localScan() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('vocalzip_media_v1', 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('recordings')) req.result.createObjectStore('recordings', {keyPath:'id'}); };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result, out = [], cur = db.transaction('recordings').objectStore('recordings').openCursor();
      cur.onsuccess = () => {
        const c = cur.result; if (!c) { db.close(); resolve(out); return; }
        const v = c.value || {};
        out.push({id:String(v.id), name:v.name || '', size:Number(v.blob?.size || v.bytes?.byteLength || v.size || 0), hasData:!!(v.blob || v.bytes), pendingUpload:!!v.pendingUpload,
          fileHash:v.fileHash || '', originalFilename:v.originalFilename || '', recordedDate:v.recordedDate || '', created:v.created || 0, importedAt:v.importedAt || 0, type:v.type || ''});
        c.continue();
      };
      cur.onerror = () => { db.close(); reject(cur.error); };
    };
  });
}

/** Pure comparison (also used by tests): counts and lists, no side effects. */
VZ.uploadCheckCompare = ({local = [], rows = [], objects = null, orphans = [], queue = null, today = VZ.today()}) => {
  const rowById = new Map(rows.map(r => [String(r.id), r])), meta = r => r.metadata || {};
  const r2Rows = rows.filter(r => meta(r).storageProvider === 'r2');
  const r2Keys = new Set(r2Rows.map(r => meta(r).r2Key).filter(Boolean));
  const localById = new Map(local.map(l => [l.id, l])), orphanById = new Map(orphans.map(o => [String(o.id), o]));
  const queueById = new Map((queue?.items || []).map(q => [String(q.id), q]));
  const day = t => { const d = new Date(t); return isNaN(d) ? '' : VZ.ymd(d); };
  const out = {
    rows:rows.length, rowsR2:r2Rows.length, rowsOldStorage:rows.filter(r => meta(r).storageProvider !== 'r2').length,
    rowsToday:rows.filter(r => day(r.updated_at) === today).length,
    local:local.length, localBytes:local.reduce((n, l) => n + l.size, 0),
    localOnly:local.filter(l => !rowById.has(l.id)), // on this device, not in the library on the server
    objects:objects ? objects.length : null, objectBytes:objects ? objects.reduce((n, o) => n + (o.size || 0), 0) : null,
    r2NoRow:[], r2NoRowRecoverable:[], r2NoRowUnknown:[], rowsNoObject:[], dupGroups:[], queue:queue ? (({items, ...rest}) => rest)(queue) : null,
    queueCounts:queue ? (queue.items || []).reduce((c, q) => (c[q.state] = (c[q.state] || 0) + 1, c), {}) : null
  };
  if (objects) {
    const byKey = new Map(objects.map(o => [o.key, o]));
    for (const o of objects) if (!String(o.mediaId).startsWith('performance-') && !r2Keys.has(o.key) && !rowById.has(String(o.mediaId))) out.r2NoRow.push(o);
    for (const o of out.r2NoRow) {
      // Recoverable only with the original details (name, date…) kept somewhere: this device, the kept-file note, or the upload queue.
      const src = localById.get(String(o.mediaId)) || orphanById.get(String(o.mediaId)) || queueById.get(String(o.mediaId));
      (src ? out.r2NoRowRecoverable : out.r2NoRowUnknown).push({...o, name:src?.name || src?.originalFilename || ''});
    }
    out.rowsNoObject = r2Rows.filter(r => !byKey.has(meta(r).r2Key)).map(r => ({id:r.id, name:meta(r).name || '', r2Key:meta(r).r2Key || ''}));
  }
  // Same content uploaded more than once (fingerprint, else original name + size).
  const groups = new Map();
  for (const r of rows) { const m = meta(r), k = m.fileHash ? 'h:' + m.fileHash : m.originalFilename && m.size ? 'n:' + m.originalFilename + '|' + m.size : ''; if (!k) continue; if (!groups.has(k)) groups.set(k, []); groups.get(k).push({id:r.id, name:m.name || '', original:m.originalFilename || ''}); }
  out.dupGroups = [...groups.values()].filter(g => g.length > 1);
  return out;
};

async function runCheck(host) {
  if (running) return; running = true;
  const say = t => { const p = host.querySelector('[data-uc-progress]'); if (p) p.textContent = t; };
  host.innerHTML = '<div class="card stack"><strong>진단 중…</strong><p class="small muted" style="margin:0" data-uc-progress>이 기기의 파일을 확인하는 중</p><p class="small muted" style="margin:0">읽기만 해요. 아무것도 바꾸거나 지우지 않아요.</p></div>';
  const result = {checkedAt:new Date().toISOString(), user:window.vzipCloudUserId?.() || '', errors:[]};
  try { result.local = await localScan(); } catch (e) { result.local = []; result.errors.push('기기 파일: ' + e.message); }
  say('서버의 보관함 기록을 확인하는 중');
  if (!window.vzipCloudSignedIn?.()) result.errors.push('로그인되어 있지 않아 서버 기록을 볼 수 없어요. 로그인 후 다시 진단해 주세요.');
  try { result.rows = window.vzipCloudSignedIn?.() ? await window.vzipCloudMediaRows() : []; } catch (e) { result.rows = []; result.errors.push('서버 기록: ' + e.message); }
  say('R2 저장소의 파일을 확인하는 중');
  result.objects = null;
  if (window.VzipR2?.configured?.() && window.vzipCloudSignedIn?.()) {
    try { result.objects = (await window.VzipR2.objects()).filter(o => !/\.pdf$/i.test(o.key || '')); }
    catch (e) {
      result.errors.push(e.status === 404 ? 'R2 파일 목록 기능이 아직 서버(Worker)에 배포되지 않았어요. 개수만 확인했어요.' : 'R2 목록: ' + e.message);
      try { result.r2Usage = await window.VzipR2.usage(); } catch {}
    }
  }
  result.orphans = window.vzipR2Orphans?.() || [];
  try { result.queue = JSON.parse(localStorage.getItem('vzip_upload_queue_v1') || 'null'); } catch { result.queue = null; }
  result.summary = VZ.uploadCheckCompare(result);
  last = result; running = false;
  draw(host);
}

function draw(host) {
  if (!last) {
    host.innerHTML = '<div class="card stack"><strong>업로드 상태 진단</strong><p class="small" style="margin:0">이 기기에 남은 파일, 서버의 보관함 기록, R2 저장소의 파일을 서로 맞춰 봐요. 어떤 파일이 서버에 저장됐고, 어떤 파일이 빠졌는지 알려 드려요.</p>' +
      '<p class="small muted" style="margin:0">읽기만 해요. 업로드·복구·삭제는 하지 않아요. 결과는 JSON 파일로 저장해 둘 수 있어요 (복구 전 백업).</p><button type="button" class="btn block" data-uc-run>진단 시작</button></div>';
    host.querySelector('[data-uc-run]').onclick = () => runCheck(host);
    return;
  }
  const s = last.summary, n = v => v == null ? '확인 불가' : v.toLocaleString('ko-KR');
  const row = (label, value, note = '') => '<div class="uc-row"><span>' + esc(label) + (note ? '<small>' + esc(note) + '</small>' : '') + '</span><b>' + value + '</b></div>';
  const list = (title, items, fmt) => items.length ? '<details class="up-list"><summary>' + esc(title) + ' ' + items.length + '개</summary><div class="list">' + items.slice(0, 200).map(x => '<div class="item small">' + esc(fmt(x)) + '</div>').join('') + (items.length > 200 ? '<div class="item small muted">200개까지만 보여요. 전체는 JSON에 있어요.</div>' : '') + '</div></details>' : '';
  const q = s.queueCounts;
  host.innerHTML = '<div class="card stack uc"><div class="row between"><strong>진단 결과</strong><span class="small muted">' + esc(new Date(last.checkedAt).toLocaleString('ko-KR')) + '</span></div>' +
    (last.errors.length ? '<div class="small" style="color:var(--warn)">' + last.errors.map(e => '· ' + esc(e)).join('<br>') + '</div>' : '') +
    '<h3 class="cal-group" style="margin:4px 0 0">서버 (보관함에 보이는 파일)</h3>' +
    row('보관함 기록 전체', n(s.rows)) + row('· R2에 저장된 기록', n(s.rowsR2)) + row('· 예전 저장소(Supabase) 기록', n(s.rowsOldStorage)) + row('· 오늘 등록·수정된 기록', n(s.rowsToday)) +
    '<h3 class="cal-group" style="margin:4px 0 0">R2 저장소</h3>' +
    row('R2 파일', s.objects == null ? (last.r2Usage ? n(last.r2Usage.objects) + ' (개수만)' : '확인 불가') : n(s.objects) + ' · ' + mb(s.objectBytes)) +
    row('R2에는 있는데 보관함 기록이 없는 파일', s.objects == null ? '확인 불가' : n(s.r2NoRow.length), '저장은 됐지만 보관함에 연결되지 않은 파일') +
    row('· 원래 정보(이름·날짜)가 남아 있어 복구 가능', s.objects == null ? '—' : n(s.r2NoRowRecoverable.length)) +
    row('· 원래 정보가 없어 따로 분류', s.objects == null ? '—' : n(s.r2NoRowUnknown.length)) +
    row('보관함 기록은 있는데 R2 파일이 없음', s.objects == null ? '확인 불가' : n(s.rowsNoObject.length), '재생이 안 되는 기록') +
    '<h3 class="cal-group" style="margin:4px 0 0">이 기기</h3>' +
    row('이 기기에 저장된 파일', n(s.local) + ' · ' + mb(s.localBytes)) + row('· 아직 서버에 없는 파일', n(s.localOnly.length), '이 기기에만 있어요. 업로드하면 올라가요.') +
    (q ? '<h3 class="cal-group" style="margin:4px 0 0">마지막 대량 업로드 기록</h3>' + row('전체', n(Object.values(q).reduce((a, b) => a + b, 0))) + Object.entries({done:'완료', failed:'실패', waiting:'대기', uploading:'업로드 중이었음', dup:'중복 제외'}).filter(([k]) => q[k]).map(([k, t]) => row('· ' + t, n(q[k]))).join('') : '') +
    row('같은 파일이 여러 번 올라간 묶음', n(s.dupGroups.length)) +
    '<p class="small muted" style="margin:0">여기서는 아무것도 바꾸지 않았어요. 복구가 필요하면 결과 파일을 보내 주세요. 복구할 대상과 방법을 먼저 알려 드리고 승인받은 뒤 진행해요.</p>' +
    '<div class="btn-row"><button type="button" class="btn" data-uc-save>결과 저장 (JSON)</button><button type="button" class="btn secondary" data-uc-run>다시 진단</button></div></div>' +
    list('R2에만 있고 복구 가능한 파일', s.r2NoRowRecoverable, o => (o.name || o.mediaId) + ' · ' + mb(o.size)) +
    list('R2에만 있고 원래 정보가 없는 파일', s.r2NoRowUnknown, o => o.key + ' · ' + mb(o.size)) +
    list('R2 파일이 없는 보관함 기록', s.rowsNoObject, r => r.name || r.id) +
    list('이 기기에만 있는 파일', s.localOnly, l => (l.name || l.originalFilename || l.id) + ' · ' + mb(l.size) + (l.hasData ? '' : ' · 파일 데이터 없음')) +
    list('같은 파일 묶음', s.dupGroups, g => g.map(x => x.name || x.original || x.id).join(' / '));
  host.querySelector('[data-uc-run]').onclick = () => runCheck(host);
  host.querySelector('[data-uc-save]').onclick = () => {
    const data = {app:'VOCAL.zip', kind:'upload-check', ...last};
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type:'application/json'})); a.download = 'vocalzip-upload-check-' + VZ.today() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };
}

VZ.route('upload-check', {title:'업로드 상태 진단', back:true, tab:'home', noAutoRefresh:true,
  render() { return '<div data-uc></div>'; },
  mount(main) { draw(main.querySelector('[data-uc]')); }});
})();
