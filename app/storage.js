/* VOCAL.zip — 저장 공간 관리 (Media PRD step C).
 * Shows where each file lives (this device / previous cloud storage / R2), and moves files to R2
 * only when the user starts it. A moved file keeps its id, so lessons, practices and songs stay
 * linked. The old copies are removed only by a separate, confirmed action after the move. */
(() => {
'use strict';
const VZ = window.VZ, M = VZ.media, esc = VZ.esc;
const R2 = () => window.VzipR2;
let run = null; // {total, done, failed:[], current, stop}

const sizeOf = m => Number(m.size || m.savedSize || m.blob?.size || m.bytes?.byteLength || 0);
const where = m => m.storageProvider === 'r2' ? 'r2' : m.cloud ? 'supabase' : 'device';
const mb = n => n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(2) + 'GB' : (n / 1024 ** 2).toFixed(1) + 'MB';
VZ.storageGroups = list => {
  const g = {device:[], supabase:[], r2:[], legacy:[]};
  for (const m of list) { g[where(m)].push(m); if (m.storageProvider === 'r2' && m.legacyStorage) g.legacy.push(m); }
  return g;
};

/** Move one file to R2 keeping its id; verifies the stored size before switching the record over. */
async function moveOne(item, signal) {
  // The cloud copy is what other devices play (videos there are already audio-only), so it wins over a local copy.
  let blob = item.cloud ? await window.vzipCloudMediaBlob(item, signal) : M.blobOf(item), prepared = null;
  if (!blob || !blob.size) throw Error('원본 파일을 읽지 못했어요.');
  try {
    let type = item.cloud ? (blob.type && blob.type !== 'application/octet-stream' ? blob.type : M.typeOf(item)) : M.typeOf(item);
    if (type.startsWith('video/')) { // keep storing audio only, as everywhere else
      prepared = await window.vzipPrepareMedia(new File([blob], item.name || 'video', {type}), {signal});
      blob = prepared.file; type = blob.type || 'audio/mp4';
    }
    const up = await R2().upload(new File([blob], (item.name || item.id) + '.' + R2().extOf({name:''}, type), {type}), {mediaId:item.id, type, signal});
    if (up.size !== blob.size) throw Error('옮긴 파일 크기가 원본과 달라요.');
    await window.vzipCloudR2Attach(item, {key:up.key, size:up.size, type});
  } finally { await prepared?.dispose?.(); }
}

/* 앱 기록 공간 (2026-11-26, after "저장하지 못했어요" kept showing on an iPad): what this app keeps in the browser's
 * small storage (localStorage — about 5MB on iPhone/iPad Safari, separate from the recordings), key by key, and inside
 * the records themselves section by section. Read only: nothing here deletes or changes anything. */
const DB_KEY = 'vocal-zip_mvp_v1';
const SECTION = {songs:'곡', lessons:'레슨', assignments:'숙제', practices:'연습 기록', comparisonReports:'비교·듣고 고르기',
  performances:'공연', dailyGoals:'오늘의 목표', practicePlans:'연습 계획·설정', scoreAnnotations:'악보 표시', videoFeedback:'영상 피드백',
  monthlyGrowthReports:'월별 리포트', monthlyAiReports:'AI 월간 리포트', overallAiReports:'AI 전체 리포트', categories:'트레이닝 분류',
  settings:'설정', deleted:'지운 기록 목록', deletedAt:'지운 기록 시각'};
const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB';
const nameOf = key => { const k = String(key).replace(/^vzip_account_v1:[^:]*:/, ''); return k === DB_KEY ? '앱 기록 (곡·레슨·연습 등)' : k; };
VZ.appStorageHtml = () => {
  const r = VZ.storageReport?.(); if (!r) return '';
  const rows = r.rows.slice(0, 8), db = r.rows.find(x => nameOf(x.key).startsWith('앱 기록'));
  let parts = [];
  try { const data = JSON.parse(localStorage.getItem(db?.key || DB_KEY) || '{}'); parts = Object.entries(data).map(([k, v]) => ({k, bytes:(JSON.stringify(v) || '').length * 2, n:Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : null})).sort((a, b) => b.bytes - a.bytes).slice(0, 8); } catch { /* unreadable: no breakdown */ }
  const line = (title, bytes, sub = '') => '<div class="item" data-app-storage-row><span class="item-main"><span class="item-title">' + esc(title) + '</span>' + (sub ? '<span class="item-sub">' + esc(sub) + '</span>' : '') + '</span><span class="small" style="font-weight:600">' + kb(bytes) + '</span></div>';
  return '<h2 class="sec" style="margin-top:4px">앱 기록 공간</h2><div class="card stack" data-app-storage>' +
    '<p class="small muted" style="margin:0">녹음 파일과 따로, 앱이 이 기기 브라우저에 두는 기록이에요. 아이폰·아이패드 Safari에서는 보통 5MB쯤이 한도라서, 가득 차면 "저장하지 못했어요"가 떠요. 이 화면은 보기만 해요.</p>' +
    '<p style="margin:0"><strong data-app-storage-total>' + kb(r.bytes) + '</strong> <span class="small muted">사용 중</span></p>' +
    '<div class="list" data-app-storage-keys>' + rows.map(x => line(nameOf(x.key), x.bytes)).join('') + '</div>' +
    (parts.length ? '<h3 class="small" style="margin:8px 0 0">앱 기록 안에서 큰 것</h3><div class="list" data-app-storage-parts>' + parts.map(p => line(SECTION[p.k] || p.k, p.bytes, p.n != null ? p.n + '개' : '')).join('') + '</div>' : '') +
    '<p class="small muted" style="margin:0" data-device-estimate></p></div>';
};
const fillEstimate = async host => {
  const el = host?.querySelector('[data-device-estimate]'); if (!el || !navigator.storage?.estimate) return;
  try { const e = await navigator.storage.estimate(); if (el.isConnected && e?.usage != null) el.textContent = '이 기기에서 앱 전체(기기에 둔 녹음 포함) ' + mb(e.usage) + (e.quota ? ' · 브라우저가 허락한 최대 ' + mb(e.quota) : ''); } catch { /* not available */ }
};
VZ.route('storage', {title:'저장 공간 관리', back:true, tab:'keep', noAutoRefresh:true,
  render() { return VZ.appStorageHtml() + '<div data-storage><p class="muted">불러오는 중…</p></div><a class="card item" href="#/upload-check" style="margin-top:12px;text-decoration:none"><span class="avatar"><i class="ph ph-stethoscope"></i></span><span class="item-main"><span class="item-title">업로드 상태 진단</span><span class="item-sub">기기·전체 녹음·R2 파일을 맞춰 보기 (읽기 전용)</span></span><i class="ph ph-caret-right chev"></i></a>'; },
  async mount(main) {
    fillEstimate(main);
    VZ.setGuard(() => run && !run.finished ? '파일을 옮기는 중이에요. 나가면 남은 파일은 다음에 이어서 옮길 수 있어요. 나갈까요?' : '');
    await draw(main);
  },
  leave() { run?.stop?.abort(); }
});
async function draw(main = document.querySelector('[data-storage]')?.parentNode) {
  const host = main?.querySelector('[data-storage]'); if (!host) return;
  const list = await M.list(true), g = VZ.storageGroups(list), signed = !!window.vzipCloudSignedIn?.();
  const configured = !!R2()?.configured(), health = configured ? await R2().health() : {ok:false};
  const accepted = configured && health.ok && signed && await R2().ready();
  let usage = null; if (accepted) { try { usage = await R2().usage(); } catch {} }
  const row = (icon, title, items, note) => '<div class="item"><i class="ph ph-' + icon + '"></i><span class="item-main"><span class="item-title">' + title + '</span><span class="item-sub">' + items.length + '개 · ' + mb(items.reduce((s, m) => s + sizeOf(m), 0)) + (note ? ' · ' + note : '') + '</span></span></div>';
  const todo = [...g.device, ...g.supabase];
  host.innerHTML =
    '<h2 class="sec" style="margin-top:4px">파일 위치</h2><div class="list icons">' +
      row('device-mobile', '이 기기에만 있음', g.device, g.device.length ? '기기를 바꾸거나 브라우저 데이터를 지우면 사라질 수 있어요' : '') +
      row('cloud', '기존 클라우드 (Supabase)', g.supabase) +
      row('hard-drives', 'R2 저장소', g.r2, usage ? '서버 기준 ' + usage.objects + '개 · ' + mb(usage.bytes) : '') + '</div>' +
    '<h2 class="sec">R2 저장소</h2><div class="card stack">' +
      (!configured ? '<p class="small muted" style="margin:0">아직 R2가 설정되지 않았어요. 설정 전까지는 지금처럼 기존 저장소를 그대로 써요. Cloudflare에서 저장소를 만든 뒤 주소를 연결하면 여기서 옮길 수 있어요.</p>'
        : !health.ok ? '<p class="small" style="margin:0;color:var(--danger)">R2 저장소에 연결하지 못했어요: ' + esc(health.reason || '') + '</p>'
        : !signed ? '<p class="small muted" style="margin:0">로그인하면 R2로 옮길 수 있어요.</p>'
        : !accepted ? '<p class="small" style="margin:0;color:var(--danger)">' + (R2().lastCheck().reason === 'auth' ? 'R2 저장소가 이 로그인을 확인하지 못했어요. Worker에 Supabase JWT 설정(SUPABASE_JWT_SECRET)이 필요할 수 있어요.' : 'R2 저장소에 연결하지 못했어요 (' + esc(R2().lastCheck().reason) + ').') + ' 그동안 새 파일은 기존 저장소에 안전하게 저장돼요.</p>'
        : '<p class="small muted" style="margin:0">R2 연결됨. 새로 가져오는 파일은 R2에 저장돼요. 기존 파일은 아래 버튼을 눌러야 옮겨져요. 옮겨도 파일 이름·날짜·곡·레슨·연습 연결은 그대로예요.</p>' +
          (run && !run.finished ? '<p class="small" data-run style="margin:0">' + esc(runText()) + '</p><button type="button" class="btn ghost" data-stop>멈추기</button>'
            : todo.length ? '<button type="button" class="btn" data-move>남은 ' + todo.length + '개 파일 R2로 옮기기</button>' : '<p class="small" style="margin:0">✓ 모든 파일이 R2에 있어요.</p>') +
          (run?.finished ? '<p class="small" style="margin:0">' + esc(runText()) + '</p>' : '') +
          (g.legacy.length ? '<hr style="border:0;border-top:1px solid var(--line);width:100%"><p class="small muted" style="margin:0">R2로 옮긴 ' + g.legacy.length + '개 파일의 예전 클라우드 사본이 남아 있어요 (' + mb(g.legacy.reduce((s, m) => s + sizeOf(m), 0)) + '). 재생을 확인한 뒤 정리할 수 있어요. 이 기기에 저장된 사본은 지우지 않아요.</p><button type="button" class="btn ghost" data-cleanup>예전 클라우드 사본 정리…</button>' : '')) +
    '</div>';
  host.querySelector('[data-move]')?.addEventListener('click', () => start(todo));
  host.querySelector('[data-stop]')?.addEventListener('click', () => run?.stop.abort());
  host.querySelector('[data-cleanup]')?.addEventListener('click', () => cleanup(g.legacy));
}
function runText() {
  if (!run) return '';
  return (run.finished ? (run.stop.signal.aborted ? '멈춤' : '완료') + ' · ' : '옮기는 중 ' + (run.done + run.failed.length + 1) + '/' + run.total + ' · ') + '성공 ' + run.done + '개' + (run.failed.length ? ' · 실패 ' + run.failed.length + '개 (' + run.failed.slice(0, 3).map(f => f.name + ': ' + f.error).join(', ') + ')' : '');
}
async function start(items) {
  run = {total:items.length, done:0, failed:[], stop:new AbortController(), finished:false};
  await draw();
  for (const item of items) {
    if (run.stop.signal.aborted) break;
    const p = document.querySelector('[data-run]'); if (p) p.textContent = runText() + ' · ' + M.label(item);
    try { await moveOne(item, run.stop.signal); run.done++; }
    catch (e) { if (e.name === 'AbortError') break; run.failed.push({name:M.label(item), error:e.message}); }
  }
  run.finished = true; M.invalidate();
  VZ.toast('R2로 ' + run.done + '개 옮겼어요.' + (run.failed.length ? ' ' + run.failed.length + '개는 다시 시도해 주세요.' : ''), run.failed.length ? 'error' : undefined);
  await draw();
}
async function cleanup(items) {
  if (!await VZ.confirm('예전 사본 삭제', 'R2로 옮긴 ' + items.length + '개 파일의 예전 클라우드(Supabase) 사본을 삭제할까요?\n\nR2에 같은 크기로 저장된 것을 다시 확인한 파일만 지워요. 되돌릴 수 없어요.', {ok:'삭제', danger:true})) return;
  let ok = 0, failed = 0;
  for (const item of items) { try { await window.vzipCloudLegacyCleanup(item); ok++; } catch { failed++; } }
  M.invalidate();
  VZ.toast('예전 사본 ' + ok + '개를 정리했어요.' + (failed ? ' ' + failed + '개는 확인하지 못해 남겨 뒀어요.' : ''), failed ? 'error' : undefined);
  await draw();
}
})();
