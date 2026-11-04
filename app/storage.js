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

VZ.route('storage', {title:'저장 공간 관리', back:true, tab:'home', noAutoRefresh:true,
  render() { return '<div data-storage><p class="muted">불러오는 중…</p></div>'; },
  async mount(main) {
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
    '<h2 class="sec" style="margin-top:4px">파일 위치</h2><div class="list">' +
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
  if (!confirm('R2로 옮긴 ' + items.length + '개 파일의 예전 클라우드(Supabase) 사본을 삭제할까요?\n\nR2에 같은 크기로 저장된 것을 다시 확인한 파일만 지워요. 되돌릴 수 없어요.')) return;
  let ok = 0, failed = 0;
  for (const item of items) { try { await window.vzipCloudLegacyCleanup(item); ok++; } catch { failed++; } }
  M.invalidate();
  VZ.toast('예전 사본 ' + ok + '개를 정리했어요.' + (failed ? ' ' + failed + '개는 확인하지 못해 남겨 뒀어요.' : ''), failed ? 'error' : undefined);
  await draw();
}
})();
