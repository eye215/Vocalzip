/* VOCAL.zip server analysis in the app: recordings get vocal measurements and cached song candidates from the server worker
 * (worker/analysis-worker.mjs on GitHub Actions) after upload, with the app closed. Here the app
 *  · queues this account's existing recordings once per session (new uploads are queued by the database),
 *  · shows progress in 보관함 (measured / waiting / needs a look / failed),
 *  · refreshes every screen as soon as the server saves a result (Supabase Realtime; a 60 s check as backup),
 *  · leaves the work to the server: the browser's own background analysis pauses while the server queue exists.
 * Nothing is shown when the queue is not installed in Supabase yet (the app then works as before). */
(() => {
'use strict';
const VZ = window.VZ, M = VZ?.media;
if (!VZ || !M) return;
const esc = VZ.esc;
const state = {on:false, owner:'', jobs:null, review:new Map(), stop:null, poll:null, refresh:null, loading:false};
VZ.serverAnalysisOn = () => state.on;
VZ.serverReview = id => state.review.get(id) || null; // {top3, transcript} for a recording that needs a look

async function load() {
  if (state.loading) return; state.loading = true;
  try {
    const r = await window.vzipAnalysisJobs?.();
    if (!r) return;
    state.jobs = r.rows;
    state.review = new Map(r.review.filter(x => x.result?.top3?.length).map(x => [x.media_id, {top3:x.result.top3, transcript:x.result.transcript || ''}]));
    paint();
  } finally { state.loading = false; }
}
// A saved result anywhere (measurement or job result) → every screen reads the fresh list.
function mediaChanged() {
  clearTimeout(state.refresh);
  state.refresh = setTimeout(() => { M.invalidate(); window.dispatchEvent(new Event('vzip:cloud-media-changed')); }, 800);
}
async function start() {
  const owner = window.vzipCloudUserId?.() || '';
  if (owner === state.owner && state.on) return; // not found before (SQL not run yet): look again
  state.stop?.(); clearInterval(state.poll); Object.assign(state, {owner, on:false, jobs:null, review:new Map(), stop:null});
  if (!owner) { paint(); return; }
  let queued = null; try { queued = await window.vzipAnalysisEnqueue?.(); } catch {}
  if (queued == null || owner !== (window.vzipCloudUserId?.() || '')) { paint(); return; } // queue not installed: app works as before
  state.on = true;
  state.stop = window.vzipAnalysisLive?.(mediaChanged, () => load()) || null;
  state.poll = setInterval(() => { if (document.visibilityState === 'visible') { load(); mediaChanged(); } }, 60000);
  await load();
}
window.addEventListener('vzip:auth-changed', () => { start().catch(() => {}); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.on) { load(); mediaChanged(); } });
if (window.vzipCloudSignedIn?.()) start().catch(() => {});

/* ---------- 보관함 card ---------- */
let host = null;
function counts() {
  const c = {vocal:{done:0, wait:0, fail:0, total:0}, song:{auto:0, review:0, wait:0, fail:0, total:0}};
  for (const j of state.jobs || []) {
    const k = c[j.kind]; if (!k) continue; k.total++;
    if (j.status === 'failed') k.fail++;
    else if (j.status === 'queued' || j.status === 'running') k.wait++;
    else if (j.kind === 'vocal') k.done++;
    else if (j.status === 'review') k.review++;
    else if (j.status === 'done') k.auto++;
  }
  return c;
}
function paint() {
  if (!host || !document.body.contains(host)) return;
  if (!state.on || !state.jobs) { host.innerHTML = ''; return; }
  const c = counts(), v = c.vocal, s = c.song;
  if (!v.total && !s.total) { host.innerHTML = ''; return; }
  const running = v.wait + s.wait;
  host.innerHTML = '<div class="card srv"><div class="row between"><strong><i class="ph ph-cloud-check"></i> 서버 분석</strong><span class="small muted">' + (running ? '진행 중 · 앱을 닫아도 계속돼요' : s.review ? '처리 완료 · 곡 확인 대기 ' + s.review + '개' : '모두 처리됨') + '</span></div>' +
    '<div class="srv-grid">' +
      '<div><b>' + v.done + '<small>/' + v.total + '</small></b><span>보컬 측정 완료</span></div>' +
      '<div><b>' + s.auto + '</b><span>이전 자동 지정</span></div>' +
      '<div><b>' + running + '</b><span>대기·분석 중</span></div>' +
      (s.review ? '<a href="#/song-suggest"><b>' + s.review + '</b><span>곡 확인 필요 ›</span></a>' : '<div><b>0</b><span>곡 확인 필요</span></div>') +
    '</div>' +
    (v.fail + s.fail ? '<p class="small" style="margin:8px 0 0;color:var(--danger)">분석 실패 ' + (v.fail + s.fail) + '건 · 원본은 그대로예요. 파일 형식을 읽지 못했거나 서버 설정이 필요할 수 있어요.</p>' : '') +
    (running ? '<p class="small muted" style="margin:8px 0 0">서버에서 보컬 측정을 진행하고 결과를 자동으로 저장해요. 곡 후보는 확인 후 직접 지정해 주세요.</p>' : '') +
    // Only cached transcripts can be matched again; new speech recognition needs a user request.
    (s.review && !running ? '<p class="small muted" style="margin:8px 0 0">녹음에서 이미 인식한 가사는 내 곡의 가사를 입력하거나 고치면 다시 비교해요. 음성 인식 기록이 없는 녹음은 ‘AI 곡 추천’에서 비용을 확인하고 분석을 요청해 주세요. 곡 후보는 확인 후 직접 지정해 주세요.</p>' : '') + '</div>';
}
VZ.serverAnalysisCard = el => { host = el; paint(); if (state.on) load(); };
})();
