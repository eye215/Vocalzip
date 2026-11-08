/* VOCAL.zip 자동 보컬 분석: while the app is open and idle, recordings that have no measurement yet are
 * analyzed one at a time in the background (on the device, free) — new recordings included — so the
 * song pages' "보컬 측정 변화" fill in by themselves.
 * Never runs while something else needs the phone: the app hidden, playback, recording, uploads, the AI
 * song finder, the import hub or an analysis screen. It can be switched off in 설정.
 * Cloud files are downloaded to be analyzed (a few MB each); files over 60 MB are skipped. */
(() => {
'use strict';
const VZ = window.VZ, M = VZ?.media;
if (!VZ || !M) return;
const KEY = 'vzip_auto_analysis_v1', FAIL_KEY = 'vzip_auto_analysis_failed_v1';
const START_DELAY = window.__vzipAutoAnalysisDelay ?? 8000, GAP = window.__vzipAutoAnalysisDelay ?? 3000, MAX_BYTES = 60 * 1024 * 1024, MAX_TRIES = 2;
const BUSY_ROUTES = /^#\/(record|song-suggest|import-hub|analysis|upload-check|storage)\b/;
const state = {running:false, current:'', left:null, done:0, timer:null, stop:false};
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || 'null') ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const enabled = () => read(KEY, {on:true}).on !== false;
const failures = () => read(FAIL_KEY, {});
const done = new Set(); // analyzed this session (the list refreshes later)
window.addEventListener('vzip:analysis-saved', e => { if (e.detail?.id) done.add(e.detail.id); });

const needs = m => !m.analysis?.v && !done.has(m.id) && (failures()[m.id] || 0) < MAX_TRIES &&
  !(M.isVideo(m) && !m.cloud) && !((Number(m.size) || 0) > MAX_BYTES);
/** Recordings of a song first (they feed the growth charts), newest first. */
const order = list => list.filter(needs).sort((a, b) => (!!b.songId - !!a.songId) || (M.dateOf(b) || '').localeCompare(M.dateOf(a) || '') || (b.created || 0) - (a.created || 0));
function idle() {
  if (!enabled() || document.visibilityState !== 'visible' || !VZ.analyzeRecording) return false;
  if (navigator.webdriver && !window.__vzipAutoAnalysis) return false; // automated UI tests opt in explicitly
  if (VZ.serverAnalysisOn?.()) return false; // the server worker analyzes uploads (app/server-analysis.js)
  if (VZ.isBusy?.() || M.playing?.() || M.backupStatus?.().running || VZ.vocalBatchRunning?.()) return false;
  if (BUSY_ROUTES.test(location.hash) || document.querySelector('.sheet-back')) return false;
  return true;
}
function schedule(delay = GAP) { clearTimeout(state.timer); if (enabled()) state.timer = setTimeout(step, delay); }
async function step() {
  if (state.running) return;
  if (!idle()) { schedule(10000); return; }
  let list; try { list = order(await M.list()); } catch { schedule(30000); return; }
  state.left = list.length; paint();
  if (!list.length) return; // all measured; new files restart it (media events below)
  const item = list[0];
  state.running = true; state.current = M.label(item); paint();
  try { await VZ.analyzeRecording(item); state.done++; }
  catch { const f = failures(); f[item.id] = (f[item.id] || 0) + 1; write(FAIL_KEY, f); }
  // Only a fresh pass that finds nothing may say "all done": files may have arrived meanwhile.
  finally { state.running = false; state.current = ''; state.left = list.length > 1 ? list.length - 1 : null; paint(); }
  schedule(GAP);
}
// Start a little after opening; new or changed files, coming back to the app, or leaving a busy screen resume it.
const kick = () => schedule(START_DELAY);
// A file change makes the remaining count unknown until the next pass (no stale "all done").
['vzip:cloud-media-changed', 'vzip:media-saved', 'vzip:auth-changed'].forEach(n => window.addEventListener(n, () => { state.left = null; paint(); if (!state.running) schedule(START_DELAY); }));
window.addEventListener('hashchange', () => { if (!state.running) schedule(START_DELAY); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && !state.running) schedule(START_DELAY); });
if (document.readyState === 'complete') kick(); else window.addEventListener('load', kick);

/* ---------- status (settings card) ---------- */
let host = null;
function paint() {
  if (!host || !document.body.contains(host)) return;
  const on = enabled();
  const line = !on ? '꺼져 있어요.' : state.running ? '분석 중: ' + VZ.esc(state.current) + (state.left ? ' · 남은 ' + state.left + '개' : '')
    : state.left === 0 ? '모든 녹음을 분석했어요.' + (state.done ? ' (이번에 ' + state.done + '개)' : '') : state.left ? '남은 ' + state.left + '개 · 앱을 켜 두면 하나씩 분석해요.' : '앱을 켜 두면 아직 분석 안 된 녹음을 하나씩 분석해요.';
  host.innerHTML = '<div class="item"><i class="ph ph-chart-line-up"></i><span class="item-main"><span class="item-title">자동 보컬 분석</span><span class="item-sub" data-auto-line>' + line + '</span></span>' +
    '<button type="button" class="switch" role="switch" aria-checked="' + on + '" aria-label="자동 보컬 분석" data-auto-toggle><span></span></button></div>' +
    '<p class="small muted" style="margin:0;padding:0 16px 12px">이 기기 안에서 분석해서 비용은 없어요. 재생·녹음·업로드 중이나 앱을 내리면 멈춰요. 클라우드 파일은 분석하려고 내려받아요(파일당 몇 MB).</p>';
  host.querySelector('[data-auto-toggle]').onclick = () => { write(KEY, {on:!on}); if (!on) schedule(1000); else clearTimeout(state.timer); paint(); };
}
VZ.autoAnalysisSettings = el => { host = el; paint(); if (enabled() && !state.running && state.left == null) schedule(1000); };
VZ.autoAnalysisStatus = () => ({...state, enabled:enabled()});
})();
