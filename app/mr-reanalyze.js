/* VOCAL.zip — 이 곡 녹음을 MR로 다시 분석 (여러 개 한꺼번에).
 * A song's MR file added or replaced later is not picked up by itself: the server measures a recording once, and the
 * device measures a recording when its 보컬 분석 is opened. This runs that same single analysis over the song's
 * recordings, one at a time, on this device:
 *   measure  VZ.analyzeRecording(item, {save:false})   (app/analysis.js: as recorded first, then with the song's MR
 *            file subtracted when the take cannot be trusted; with several MR files the worker keeps the one that
 *            removes the most)
 *   save     VZ.analysisSummary(result, saved) → VZ.media.update → 'vzip:analysis-saved'   (what the analysis
 *            screen's own save does: the previous result goes to the summary's history)
 * Nothing here decodes audio or measures by itself. Nothing starts before the person confirms.
 * Replacement rule: a new result replaces the saved one only when it can be trusted (VZ.analysisReliable). A saved
 * AI-separated result is replaced only by a trusted result measured with the MR removed (the person asked for this
 * run). A result that cannot be trusted never replaces a saved one; it is kept only where nothing current was saved.
 * alsoMr (성장's 이 녹음도 MR 빼고 재기, one take): a take trusted as recorded keeps its result; a trusted measurement with
 * the MR removed (VZ.analyzeRecording alsoMr → result.mrAlt) is kept next to it as analysis.mrAlt, nothing else changed. */
(() => {
'use strict';
const V = window.VZ, M = V?.media;
if (!V || !M) return;
const esc = V.esc;
const MAX_BYTES = 250 * 1024 * 1024;           // app/analysis.js refuses larger files
const RATE_KEY = 'vzip_mr_reanalyze_rate_v1';  // how long the last run really took on this device (per-device hint)
/* Measured 2026-11-16 in Chromium on a development computer, files on the same machine (no download): a recording
 * with a 4-minute MR took about 1.6 s + 0.018 s per second of recording (1 min: 2.7 s, 3 min: 4.9 s, 4 min: 6.0 s);
 * the 20-second test signal below took benchMs there. This device is compared against that with the same signal. */
const REF = {base:1.6, perSecond:0.018, benchMs:210};
const reliable = a => !!a?.metrics && !!V.analysisReliable?.(a);
const savedOf = m => m?.analysis?.v ? m.analysis : null;
/** The song's MR files the single analysis uses: uploaded files only, the first three (app/analysis.js mrFilesOf). */
const mrFiles = song => window.VzipR2?.enabled?.() ? (V.song(song?.id)?.mrTracks || []).filter(t => t && !t.deleted && t.kind === 'file' && t.r2Key).slice(0, 3) : [];
const mrTitle = t => t.title || t.fileName || 'MR 파일';
/** 녹음 그대로 / MR 빼고 / AI 분리 후 — how a saved result was measured (the words of the analysis screen's 측정 방식). */
const method = a => !a ? '' : a.confidence?.aiSeparated ? 'AI 분리 후' : a.confidence?.mrRemoved ? 'MR 빼고' : '녹음 그대로';
const durationOf = m => Math.min(900, Number(m.durationSeconds) || Number(m.analysis?.seconds) || 0);

/** Why a recording is left out of every scope, '' when it can be measured. */
function skipWhy(m, tracks) {
  if (!M.blobOf?.(m) && !m.cloud) return '파일이 없어요';
  if (M.isVideo?.(m) && !m.cloud) return '이 기기에만 있는 영상은 분석이 읽지 못해요';
  if ((Number(m.size) || 0) > MAX_BYTES) return '250MB가 넘는 파일이에요';
  const a = savedOf(m), used = a?.confidence?.mrRemoved?.trackId;
  // Already measured with this MR by the current analyzer — unless an MR file was added after that result.
  if (used && V.analysisCurrent?.(a) && tracks.some(t => String(t.id) === String(used)) && !tracks.some(t => Number(t.created) > Number(a.at || 0)))
    return '이미 이 MR로 쟀어요';
  return '';
}
/** What a run would do for this song: {tracks, skipped:[{m, why}], scopes:{held, all, picked}}. */
function plan(song, items, pickedIds = []) {
  const tracks = mrFiles(song), skipped = [], all = [];
  for (const m of items) { const why = skipWhy(m, tracks); if (why) skipped.push({m, why}); else all.push(m); }
  const picked = new Set(pickedIds.map(String));
  return {tracks, skipped, scopes:{held:all.filter(m => !reliable(savedOf(m))), all, picked:all.filter(m => picked.has(String(m.id)))},
    pickedSkipped:skipped.filter(x => picked.has(String(x.m.id))).length, hasPicked:picked.size > 0};
}
/** The song's recordings as 보컬 연구소 lists them (dataset rule 'songList'), oldest first. */
async function songItems(song) {
  const list = await M.list().catch(() => M.cached());
  const rows = V.growthDataset ? V.growthDataset(list).pick('songList').filter(r => r.songId === song.id).map(r => r.m) : list.filter(m => m.songId === song.id);
  return rows.sort((a, b) => (M.dateOf(a) || '').localeCompare(M.dateOf(b) || '') || (Number(a.created) || 0) - (Number(b.created) || 0) || String(a.id).localeCompare(String(b.id)));
}

/** The second measurement kept next to a result as recorded (analysis.mrAlt). */
const altOf = r => ({v:r.version, at:Date.now(), seconds:r.seconds, metrics:r.metrics, confidence:r.confidence});
/** What happens to the saved result once a recording was measured. `mr` says how far the MR step got; mr.also: the run
 * asked for a measurement with the MR removed next to a result trusted as recorded. */
function decide(before, result, mr = {}) {
  if (!result?.metrics?.voicedSeconds) return {kind:'failed', save:false, text:'목소리를 찾지 못했어요'};
  const good = reliable({v:result.version, metrics:result.metrics, confidence:result.confidence}), used = !!result.confidence?.mrRemoved;
  const ai = !!before?.confidence?.aiSeparated, savedGood = reliable(before), none = !before?.v;
  if (used && good) return {kind:'mr', save:true, text:'MR을 빼고 다시 쟀어요' + (ai ? ' · AI 분리 결과를 바꿨어요' : none ? '' : savedGood ? ' · 저장된 결과를 바꿨어요' : ' · 판정 보류였던 결과를 바꿨어요')};
  // Trusted as recorded, before and now: the saved result stays; the MR-removed measurement is kept next to it.
  if (good && mr.also && savedGood && !ai && !before.confidence?.mrRemoved) return result.mrAlt
    ? {kind:'alt', save:true, alt:altOf(result.mrAlt), text:'MR 빼고 잰 결과를 따로 저장했어요 · 원래 결과는 그대로예요'}
    : {kind:'noalt', save:false, text:'MR을 빼고 재도 믿을 만큼 읽히지 않아 견줄 수 없어요 · 원래 결과는 그대로예요'};
  if (good) return savedGood || ai
    ? {kind:'fine', save:false, text:'녹음 그대로도 믿을 수 있게 재져서 MR을 빼지 않았어요 · 저장된 결과 그대로'}
    : {kind:'plain', save:true, text:'녹음 그대로 재도 믿을 수 있어요 · ' + (none ? '그 결과를 저장했어요' : '판정 보류였던 결과를 바꿨어요') + ' (MR 안 뺌)'};
  // Not trustworthy: it never replaces a saved result that is (or an AI-separated one). Where nothing current was
  // saved it is kept, as opening the recording's 보컬 분석 would keep it.
  const save = none || (!savedGood && !ai && !V.analysisCurrent?.(before, result.version));
  const tail = save ? (none ? ' · 처음 잰 결과로 저장했어요 (판정 보류)' : ' · 새 방식의 결과로 저장했어요 (판정 보류)') : ' · 저장된 결과 그대로';
  if (used) return {kind:'held', save, text:'MR을 빼도 판정 보류예요' + tail};
  if (!mr.tried) return {kind:'failed', save:false, text:'곡에 쓸 수 있는 MR 파일이 없어요'};
  if (!mr.loaded) return {kind:'failed', save:false, text:'MR 파일을 불러오지 못했어요'};
  return {kind:'nomatch', save, text:'MR과 맞지 않아요' + tail};
}

/* ---------- time ---------- */
let speed;  // this device against the reference (1 = the same), measured once per visit; null when it cannot be measured
async function deviceSpeed() {
  if (speed !== undefined) return speed;
  try {
    const rate = 8000, n = rate * 20, x = new Float32Array(n); let phase = 0;
    for (let i = 0; i < n; i++) { phase += 2 * Math.PI * 220 * 2 ** ((Math.floor(i / 4000) % 5) / 12) / rate; let v = 0; for (let h = 1; h <= 6; h++) v += Math.sin(phase * h) / h; x[i] = v * 0.2; }
    const t = performance.now(); await V.analyzeSamples(x, rate);
    speed = Math.max(0.3, Math.min(10, (performance.now() - t) / REF.benchMs));
  } catch { speed = null; }
  return speed;
}
const lastRate = () => { try { const r = JSON.parse(localStorage.getItem(RATE_KEY) || 'null'); return r && r.factor > 0 && r.factor < 100 ? r : null; } catch { return null; } };
/** Reference seconds for these recordings (a recording of unknown length counts as the average, or 3 minutes). */
function referenceSeconds(list) {
  const known = list.map(durationOf).filter(Boolean), usual = known.length ? known.reduce((s, v) => s + v, 0) / known.length : 180;
  return list.reduce((s, m) => s + REF.base + REF.perSecond * (durationOf(m) || usual), 0);
}
const minutes = s => s < 50 ? '1분 안쪽' : '약 ' + Math.max(1, Math.round(s / 60)) + '분';
/** "약 2~4분" with what it is based on. */
function estimate(list, measured) {
  if (!list.length) return {text:'—', note:''};
  const ref = referenceSeconds(list), last = lastRate();
  if (last) return {text:minutes(ref * last.factor), note:'지난번 이 기기에서 실제로 걸린 시간을 기준으로 했어요.'};
  if (measured === undefined) return {text:'재는 중…', note:'이 기기의 속도를 짧게 재 보고 있어요.'};
  if (measured === null) return {text:'녹음 1개에 몇 초~수십 초', note:'이 기기의 속도를 재지 못해 대략만 알려 드려요.'};
  // Low: computing only. High: twice that plus a few seconds per recording for downloading the recording and the MR.
  const low = ref * measured, high = low * 2 + list.length * 3, a = Math.max(1, Math.round(low / 60)), b = Math.max(1, Math.round(high / 60));
  return {text:high < 50 ? '1분 안쪽' : a === b ? '약 ' + a + '분' : '약 ' + a + '~' + b + '분', note:'이 기기에서 방금 짧게 재 본 속도 기준이에요. 파일을 내려받는 시간에 따라 달라져요.'};
}

/* ---------- the run ---------- */
let active = null;  // the one run in progress
/** One recording through the single analysis and its save. null when the run was stopped meanwhile. */
async function measureOne(m, signal, onStage, onProgress, mrCache, alsoMr = false) {
  const mr = {tried:false, loaded:false};
  // The single analysis says where it is in words: "곡 MR 불러오는 중…" then "반주(MR) 빼는 중…" once an MR file was read.
  const stage = text => { if (/MR 불러오는/.test(text)) mr.tried = true; if (/빼는 중/.test(text)) mr.loaded = true; onStage(text); };
  let result;
  try { result = await V.analyzeRecording(m, {save:false, signal, onStage:stage, onProgress, mrCache, ...(alsoMr ? {alsoMr:true} : {})}); }
  catch (e) { return e?.name === 'AbortError' || signal.aborted ? null : {m, kind:'failed', save:false, text:String(e?.message || e || '분석하지 못했어요')}; }
  if (signal.aborted) return null;
  // The result saved right now (the server may have saved one while this was measured), as the analysis screen reads it.
  const before = ((await M.list().catch(() => [])).find(x => x.id === m.id) || m).analysis;
  const outcome = decide(before, result, {...mr, also:alsoMr});
  if (outcome.save) {
    // 'alt': the saved result exactly as it was (no history entry), with the second measurement next to it.
    const summary = outcome.kind === 'alt' ? {...before, mrAlt:outcome.alt} : V.analysisSummary(result, before);
    try { await M.update(m, {analysis:summary}, {quiet:true}); }
    catch (e) { return {m, kind:'failed', save:false, text:'결과를 저장하지 못했어요: ' + String(e?.message || e)}; }
    window.dispatchEvent(new CustomEvent('vzip:analysis-saved', {detail:{id:m.id, analysis:summary}}));
    m.analysis = summary;
  }
  return {m, ...outcome};
}
async function runAll(run, paint) {
  const mrCache = new Map();
  M.keepAwake?.(true);
  const release = window.VzipAccountScope?.beforeLeave?.(() => run.ctl.abort()), auth = () => run.ctl.abort();
  window.addEventListener('vzip:auth-changed', auth);
  try {
    for (const m of run.list) {
      if (run.ctl.signal.aborted) break;
      Object.assign(run, {current:m, stage:'파일 불러오는 중…', part:0, phase:0}); paint();
      const row = await measureOne(m, run.ctl.signal, text => { if (/MR 불러오는/.test(text)) { run.phase = 1; run.part = 0; } run.stage = text; paint(); }, p => { run.part = p; paint(true); }, mrCache, run.alsoMr);
      if (!row) break;
      run.rows.push(row); run.done++; run.refDone += REF.base + REF.perSecond * (durationOf(m) || 180);
      if (row.save) run.onSaved?.(m);
    }
  } finally {
    mrCache.clear();
    window.removeEventListener('vzip:auth-changed', auth); release?.();
    M.keepAwake?.(false);
    run.running = false; run.current = null; run.stopped = run.done < run.list.length;
    run.seconds = (performance.now() - run.started) / 1000;
    // What it really took here, for the next estimate (only a run that measured a few recordings says something).
    if (run.done >= 2 && run.refDone > 0) { try { localStorage.setItem(RATE_KEY, JSON.stringify({factor:run.seconds / run.refDone, at:Date.now()})); } catch {} }
    if (run.rows.some(r => r.save)) M.invalidate?.();
    if (active === run) active = null;
    paint();
  }
}
/* The summary's four counts: a saved result (다시 잰 것) · left as it was because the MR is not in the take · left as it
 * was for another reason (the row says which) · failed. */
const GROUP = {held:'kept', fine:'kept', noalt:'kept', nomatch:'nomatch', failed:'failed'};
const tally = rows => rows.reduce((t, r) => { t[r.save ? 'again' : GROUP[r.kind]]++; return t; }, {again:0, nomatch:0, kept:0, failed:0});
/** How far the run is, 0–100: finished recordings plus the one being measured (as recorded first, then with the MR removed). */
const percent = run => Math.round((run.done + (run.phase * 0.5 + Math.min(1, run.part || 0) * 0.5) * 0.95) / run.list.length * 100);
/** "40개 중 40개를 마쳤어요" — or, read after 멈춤 / leaving the screen, "멈췄어요 · 40개 중 12개를 마쳤어요". */
const doneLine = run => (run.done < run.list.length ? '멈췄어요 · ' : '') + run.list.length + '개 중 ' + run.done + '개를 마쳤어요';

/* ---------- screen ---------- */
const rowHtml = (m, text, tone = '') => '<li' + (tone ? ' data-tone="' + tone + '"' : '') + ' data-remr-row="' + esc(m.id) + '"><b>' + esc(M.label(m)) + '</b><span>' + esc([V.dateLabel?.(M.dateOf(m)) || '', text].filter(Boolean).join(' · ')) + '</span></li>';
const tone = r => r.kind === 'failed' ? 'bad' : r.kind === 'mr' || r.kind === 'plain' || r.kind === 'alt' ? 'ok' : '';
function confirmHtml(p, scope, eta) {
  const list = p.scopes[scope], unmeasured = p.scopes.held.filter(m => !savedOf(m)).length;
  const ai = list.filter(m => savedOf(m)?.confidence?.aiSeparated).length;
  const which = p.tracks.length === 1 ? esc(mrTitle(p.tracks[0])) : 'MR 파일 ' + p.tracks.length + '개 중 하나';
  const option = (id, label, n, small) => '<label><input type="radio" name="vz-remr-scope" value="' + id + '"' + (scope === id ? ' checked' : '') + (n ? '' : ' disabled') + '><span><b>' + label + ' · ' + n + '개</b>' + (small ? '<small>' + small + '</small>' : '') + '</span></label>';
  return '<p class="vz-remr-lead">곡에 올려 둔 MR 파일로 반주를 빼고 이 곡 녹음을 다시 재요. 녹음 하나의 보컬 분석을 열 때와 같은 방식이에요.</p>' +
    '<div class="vz-remr-card"><dl class="vz-remr-stats">' +
      '<div><dt>다시 잴 녹음</dt><dd data-remr-count>' + list.length + '개</dd></div>' +
      '<div><dt>쓰는 MR</dt><dd data-remr-track>' + which + '</dd></div>' +
      '<div><dt>예상 시간</dt><dd data-remr-eta>' + esc(eta.text) + '</dd></div></dl>' +
      (p.tracks.length > 1 ? '<p class="vz-remr-note" data-remr-tracks>' + esc(p.tracks.map(mrTitle).join(' · ')) + ' 중에서 녹음마다 반주가 가장 많이 빠지는 것을 골라요.</p>' : '') +
      (eta.note ? '<p class="vz-remr-note" data-remr-eta-note>' + esc(eta.note) + '</p>' : '') + '</div>' +
    '<fieldset class="vz-remr-scope"><legend>다시 잴 범위</legend>' +
      option('held', '판정 보류인 녹음만', p.scopes.held.length, unmeasured ? '아직 분석하지 않은 녹음 ' + unmeasured + '개 포함' : '') +
      option('all', '모든 녹음', p.scopes.all.length, '') +
      (p.hasPicked ? option('picked', '고른 녹음만', p.scopes.picked.length, p.pickedSkipped ? '고른 녹음 중 ' + p.pickedSkipped + '개는 건너뛰어요' : '') : '') + '</fieldset>' +
    '<ul class="vz-remr-facts">' +
      '<li>이 기기에서 분석해요. 녹음과 MR 파일은 그대로이고 밖으로 보내지 않아요.</li>' +
      '<li>끝날 때까지 이 화면을 켜 두세요. 다른 화면으로 가면 멈춰요. 언제든 멈출 수 있고, 그때까지 잰 결과는 남아요.</li>' +
      '<li>새 결과가 믿을 수 있을 때만 저장된 결과를 바꿔요. 이전 결과는 이력에 남아요.</li>' +
      (ai ? '<li data-remr-ai>AI 분리로 잰 결과도 이 MR로 잰 결과로 바뀌어요. 이전 결과는 이력에 남아요.</li>' : '') +
      '<li>녹음 그대로도 믿을 수 있게 재지는 녹음은 MR을 빼지 않아요.</li></ul>' +
    (p.skipped.length ? '<details class="vz-remr-skipped" data-remr-skipped><summary>건너뛰는 녹음 ' + p.skipped.length + '개</summary><ul class="vz-remr-rows">' + p.skipped.map(x => rowHtml(x.m, x.why)).join('') + '</ul></details>' : '');
}
function runningHtml(run) {
  const at = Math.min(run.list.length, run.done + 1), elapsed = (performance.now() - run.started) / 1000;
  const left = run.done ? minutes(elapsed / run.refDone * Math.max(0, referenceSeconds(run.list) - run.refDone)) : '';
  return '<div class="vz-remr-card" aria-live="polite"><p class="vz-remr-progress" data-remr-progress role="status">' + at + ' / ' + run.list.length + ' · ' + esc((run.stage || '준비 중…').replace(/\s*\([^)]*\)\s*$/, '')) + '</p>' +
    '<div class="vz-remr-bar" data-remr-bar style="--p:' + percent(run) + '%"></div>' +
    '<p class="vz-remr-note" data-remr-now>' + esc(run.current ? M.label(run.current) : '') + (left ? ' · 남은 시간 ' + left : '') + '</p></div>' +
    '<p class="vz-remr-note">화면을 켜 두세요. 한 번에 녹음 하나씩 재요.</p>' +
    (run.rows.length ? '<ul class="vz-remr-rows" data-remr-results>' + run.rows.slice().reverse().map(r => rowHtml(r.m, r.text, tone(r))).join('') + '</ul>' : '');
}
function summaryHtml(run) {
  const t = tally(run.rows), stat = (label, n, key) => '<div><dt>' + label + '</dt><dd data-remr-total="' + key + '">' + n + '개</dd></div>';
  return '<p class="vz-remr-done" data-remr-done role="status">' + esc(doneLine(run)) + '</p>' +
    '<div class="vz-remr-card"><dl class="vz-remr-stats">' + stat('다시 잰 것', t.again, 'again') + stat('MR과 맞지 않아 그대로 둔 것', t.nomatch, 'nomatch') +
      (t.kept ? stat('그 밖에 그대로 둔 것', t.kept, 'kept') : '') + stat('실패', t.failed, 'failed') + '</dl></div>' +
    (run.stopped ? '<p class="vz-remr-note">남은 녹음은 MR로 다시 분석을 다시 누르면 이어서 잴 수 있어요. 이미 이 MR로 잰 녹음은 건너뛰어요.</p>' : '') +
    (run.rows.length ? '<ul class="vz-remr-rows" data-remr-results>' + run.rows.map(r => rowHtml(r.m, r.text, tone(r))).join('') + '</ul>' : '') +
    '<p class="vz-remr-note">성장 화면과 곡 분석은 새 결과로 다시 계산돼요.</p>';
}

/** Opens the confirm page. items: the song's recordings when the caller already has them (보컬 연구소 passes its own,
 * so they are updated in place); picked: ids ticked there; scope: the range first chosen ('picked' for one take a
 * growth screen asks about), else the usual default; alsoMr: keep a measurement with the MR removed next to a result
 * trusted as recorded (see decide); onSaved(m) after each saved result; onClose(run) at the end. */
function open(song, {items, picked = [], scope:asked, alsoMr = false, onSaved, onClose} = {}) {
  song = V.song(song?.id) || song;
  if (!song) return;
  let run = null, closed = false, p = null, scope = 'held', measured;
  V.sheet({title:'MR로 다시 분석', variant:'page', confirmClose:false,
    body:'<div class="vz-remr" data-remr data-remr-view="loading"><p class="vz-remr-note" role="status">이 곡의 녹음을 확인하는 중…</p></div>',
    foot:'<div data-remr-foot></div>',
    onClose:() => {
      closed = true;
      if (run?.running) run.ctl.abort();
      // After the sheet's own "취소했어요": what was really done.
      if (run) setTimeout(() => V.toast(run.done ? 'MR로 다시 분석 · ' + doneLine(run) : 'MR로 다시 분석을 멈췄어요. 잰 녹음이 없어요.'), 0);
      onClose?.(run);
    },
    onMount:async (el, close) => {
      const host = el.querySelector('[data-remr]'), foot = el.querySelector('[data-remr-foot]');
      const view = (name, html, footer) => { host.dataset.remrView = name; host.innerHTML = html; foot.innerHTML = footer; };
      const ask = () => {
        const list = p.scopes[scope];
        view('confirm', confirmHtml(p, scope, estimate(list, measured)),
          '<button type="button" class="btn block" data-remr-start' + (list.length ? '' : ' disabled') + '>' + (list.length ? list.length + '개 다시 분석 시작' : '다시 잴 녹음이 없어요') + '</button>');
        host.querySelectorAll('[name="vz-remr-scope"]').forEach(input => input.onchange = () => { scope = input.value; ask(); host.querySelector('[name="vz-remr-scope"]:checked')?.focus({preventScroll:true}); });
        foot.querySelector('[data-remr-start]').onclick = start;
      };
      const paint = light => {
        if (closed || !host.isConnected) return;
        if (!run.running) { summary(); return; }
        // Analysis progress arrives many times a second: only the bar moves then.
        if (light) { host.querySelector('[data-remr-bar]')?.style.setProperty('--p', percent(run) + '%'); return; }
        host.innerHTML = runningHtml(run);
      };
      const summary = () => {
        view('summary', summaryHtml(run), '<button type="button" class="btn block" data-remr-close>닫기</button>');
        const done = foot.querySelector('[data-remr-close]'); done.onclick = close; done.focus({preventScroll:true});
      };
      function start() {
        const list = p.scopes[scope];
        if (!list.length || run) return;
        if (active || V.vocalBatchRunning?.()) { V.toast('다른 분석이 진행 중이에요. 끝난 뒤 다시 눌러 주세요.', 'error'); return; }
        run = active = {list, rows:[], done:0, refDone:0, running:true, stopped:false, ctl:new AbortController(), started:performance.now(), stage:'', part:0, phase:0, onSaved, alsoMr};
        view('running', runningHtml(run), '<button type="button" class="btn secondary block" data-remr-stop><i class="ph ph-stop" aria-hidden="true"></i>멈춤</button>');
        const stop = foot.querySelector('[data-remr-stop]'); stop.onclick = () => { stop.disabled = true; run.ctl.abort(); }; stop.focus({preventScroll:true});
        runAll(run, paint);
      }
      try { items = items || await songItems(song); } catch { items = []; }
      if (closed) return;
      p = plan(song, items, picked);
      if (!p.tracks.length) { view('empty', '<p class="vz-remr-note" data-remr-empty>이 곡에 올려 둔 MR 파일이 없어요. 곡 › 레퍼런스에서 MR 파일을 올리면 반주를 빼고 다시 잴 수 있어요. 유튜브 MR은 쓸 수 없어요.</p>', '<button type="button" class="btn block" data-remr-close>닫기</button>'); foot.querySelector('[data-remr-close]').onclick = close; return; }
      // 판정 보류인 녹음만 is the default; with none of those, the first scope that has recordings.
      // A caller asking for 고른 녹음만 gets it even when it is empty (the take is skipped and the row says why).
      scope = asked && p.scopes[asked] && (asked !== 'picked' || p.hasPicked) ? asked
        : p.scopes.held.length ? 'held' : p.hasPicked && p.scopes.picked.length ? 'picked' : p.scopes.all.length ? 'all' : 'held';
      ask();
      if (!lastRate()) { await deviceSpeed().then(s => { measured = s; }); if (!closed && !run && host.dataset.remrView === 'confirm') { const eta = estimate(p.scopes[scope], measured); host.querySelector('[data-remr-eta]').textContent = eta.text; const note = host.querySelector('[data-remr-eta-note]'); if (note) note.textContent = eta.note; } }
    }});
}

/** 곡 › 레퍼런스 › MR: one quiet line (recordings are not measured again by themselves) with the button; right after
 * an MR file was added it asks. Nothing is shown without an MR file or without recordings. */
async function prompt(host, song, {added = false, onDone} = {}) {
  if (!host) return;
  host.innerHTML = '';
  if (!mrFiles(song).length) return;
  let items; try { items = await songItems(song); } catch { return; }
  if (!host.isConnected || !items.length) return;
  const p = plan(song, items), n = p.scopes.held.length || p.scopes.all.length;
  host.innerHTML = '<div class="vz-remr-prompt" data-remr-prompt>' + (added && n ? '<strong data-remr-ask>이 곡 녹음 ' + n + '개를 이 MR로 다시 분석할까요?</strong>' : '') +
    '<p>MR을 올리거나 바꿔도 이미 있는 녹음은 자동으로 다시 재지 않아요.' + (n ? '' : ' 지금은 다시 잴 녹음이 없어요.') + '</p>' +
    (n ? '<button type="button" data-remr-open><i class="ph ph-music-notes-minus" aria-hidden="true"></i>MR로 다시 분석</button>' : '') + '</div>';
  const button = host.querySelector('[data-remr-open]');
  if (button) button.onclick = () => open(song, {items, onClose:run => { if (run) onDone?.(run); }});
}
/** For 보컬 연구소: how many of these recordings a run could measure ({held, all}), null without an MR file. */
const count = (song, items) => { if (!mrFiles(song).length) return null; const p = plan(song, items); return {held:p.scopes.held.length, all:p.scopes.all.length}; };
/** Whether the song has an MR file a run can use (the growth screens offer the run, or say to add one). */
const has = song => mrFiles(song).length > 0;
V.mrReanalyze = {open, prompt, plan, decide, count, method, has, running:() => !!active};
})();
