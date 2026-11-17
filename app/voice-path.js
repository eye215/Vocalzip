/* VOCAL.zip 소리 길 흔적 (시험판) — two takes of a song side by side: audible traces measured on this device.
 *
 *   #/voice-path                 pick a song
 *   #/voice-path/<songId>        pick 기준 · 비교, measure, read the rows (optional ?a=<id>&b=<id>)
 *
 * Entered from 성장 › 보컬 분석 (app/growth-hub.js) and from a recording in 보컬 연구소 (VZ.voicePathLink).
 * Model: app/voice-path-model.js, run in app/voice-path-worker.js. Nothing is uploaded; no stored analysis is changed.
 *
 * What is measured for a take, in this order:
 *   1. the song has MR files (songs[].mrTracks, kind 'file') → the MR is taken out of the take with the app's own
 *      app/mr-cancel.js and the voice that is left is measured (all traces);
 *   2. otherwise the file as recorded: all traces when it is voice only (stored analysis heard no accompaniment, or
 *      the person ticked it), the pitch-based ones when the voice is clearly on top in this reading, and nothing at
 *      all when it is not (the take is refused, and no comparison is made).
 * The whole recording is always measured: the decoded sound is handed to the worker 30 s at a time and never copied
 * whole on this thread.
 *
 * Kept on this device only (own small IndexedDB store, not the synced records and not the media store): each take's
 * result with the model version and which MR files it was measured against — at most CACHE_CAP takes, oldest dropped.
 * Stored with the song (VZ.change, syncs): the 기준 녹음 mark (songs[].voicePathBaseIds). In device storage: the
 * "목소리만" tick and the MR to take out ("이 녹음에서 뺄 MR": an MR track id or 'none'; 자동 is no entry), per recording.
 * The screen never says whether the 길 was found: 비슷함 / 다름 and the direction in words, nothing more. */
(() => {
'use strict';
const V = window.VZ, M = V?.media, P = window.VzipVoicePath;
if (!V || !M || !P) return;
const esc = V.esc, T = P.THRESHOLDS, L = window.VzipAudioFile;
const PAGE_REVISION = 9, WORKER = 'app/voice-path-worker.js?v=9';
const MAX_BYTES = 250 * 1024 * 1024;     // the same limit as the app's analysis; a larger file is refused, never cut
const BLOCK_SECONDS = 30;                // decoded sound handed to the worker at a time
const CACHE_CAP = 60;                    // takes kept on the device
const MAX_BASE_MARKS = 20;               // 기준 녹음 marks kept per song
const MAX_TIMES = 12;                    // break / flip times shown before "더 보기"
const MAX_MRS = 3;                       // MR files tried per take (as the app's analysis does)
const NOTE = '소리의 길은 선생님 귀로 판단해요. 이 화면은 다시 들어볼 곳을 찾는 참고예요.';
const scope = window.VzipAccountScope, store = scope?.storage || localStorage, CLEAN_KEY = 'vzip_voice_path_clean_v1';
const ticks = () => { try { const v = JSON.parse(store.getItem(CLEAN_KEY)); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const setTick = (id, value) => { try { const all = ticks(); all[id] = value; store.setItem(CLEAN_KEY, JSON.stringify(all)); return true; } catch { return false; } };
const MR_KEY = 'vzip_voice_path_mr_v1';
const mrChoices = () => { try { const v = JSON.parse(store.getItem(MR_KEY)); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
/** Remember a recording's MR choice ('auto' removes the entry). */
const setMrChoice = (id, value) => { try { const all = mrChoices(); if (value === 'auto') delete all[id]; else all[id] = String(value); store.setItem(MR_KEY, JSON.stringify(all)); return true; } catch { return false; } };
const day = m => (M.dateOf(m) || '').replace(/-/g, '.');
const clock = t => V.clock(Math.max(0, Number(t) || 0));
const analysisOf = m => m?.analysis?.metrics ? m.analysis : null;
const reliable = m => !!analysisOf(m) && !!V.analysisReliable?.(m.analysis);
const cleanOf = m => { const t = ticks()[m.id]; return P.cleanOf({analysis:analysisOf(m), ticked:typeof t === 'boolean' ? t : null}); };
const marksOf = song => Array.isArray(V.song(song.id)?.voicePathBaseIds) ? V.song(song.id).voicePathBaseIds.map(String) : [];
let current = null, serial = 0;
function leave() { current?.abort?.abort(); current?.players?.forEach(p => p.destroy?.()); if (current) current.dead = true; current = null; serial++; }

/** Link shown under a recording in 보컬 연구소 (dark screen; its own list-row style). */
V.voicePathLink = (song, item) => !song?.id ? '' : '<section class="vl-section"><a class="vl-report" data-voice-path-link href="#/voice-path/' + encodeURIComponent(song.id) + (item?.id ? '?b=' + encodeURIComponent(item.id) : '') +
  '"><strong>소리 길 흔적 · 시험판</strong><span>이 녹음을 다른 녹음과 나란히 봐요</span><i class="ph ph-caret-right" aria-hidden="true"></i></a></section>';

/* ---------- results kept on this device ---------- */
const results = new Map();               // recording id → record (this session; filled from the device store)
const DB_NAME = 'vocalzip_voice_path_v1' + (scope ? '_account_' + encodeURIComponent(scope.owner || 'unclaimed') : '');
const withStore = (mode, work) => new Promise((resolve, reject) => {
  let open; try { open = indexedDB.open(DB_NAME, 1); } catch (e) { reject(e); return; }
  open.onupgradeneeded = () => open.result.createObjectStore('takes', {keyPath:'id'});
  open.onerror = () => reject(open.error);
  open.onsuccess = () => {
    const db = open.result; let out;
    try { const tx = db.transaction('takes', mode); work(tx.objectStore('takes'), v => { out = v; }); tx.oncomplete = () => { db.close(); resolve(out); }; tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); }; }
    catch (e) { db.close(); reject(e); }
  };
});
const cache = {
  CAP:CACHE_CAP,
  /** Every kept record of this model version; older versions are dropped. */
  async load() {
    try {
      const all = await withStore('readonly', (s, done) => { const q = s.getAll(); q.onsuccess = () => done(q.result || []); });
      const stale = all.filter(r => r.model !== P.VERSION);
      if (stale.length) await withStore('readwrite', s => stale.forEach(r => s.delete(r.id)));
      for (const r of all) if (r.model === P.VERSION && !results.has(r.id)) results.set(r.id, {...r, fromDevice:true});
    } catch {}                                                        // no device store: this session only
  },
  /** Keep one record; then drop the oldest beyond the cap. */
  async put(rec) {
    try {
      await withStore('readwrite', s => s.put(rec));
      const all = await withStore('readonly', (s, done) => { const q = s.getAll(); q.onsuccess = () => done((q.result || []).map(r => [r.id, r.at])); });
      const extra = all.sort((a, b) => b[1] - a[1]).slice(CACHE_CAP);
      if (extra.length) await withStore('readwrite', s => extra.forEach(([id]) => s.delete(id)));
      for (const [id] of extra) results.delete(id);
    } catch {}
  },
  async ids() { try { return await withStore('readonly', (s, done) => { const q = s.getAllKeys(); q.onsuccess = () => done(q.result || []); }); } catch { return []; } }
};
V.voicePathCache = cache;                                              // for tests

/* ---------- the song's MR files ---------- */
/** File MRs of the song, as the app's analysis picks them (uploaded files only; a YouTube MR has no file). */
const mrFilesOf = song => window.VzipR2?.enabled?.() ? (V.song(song.id)?.mrTracks || []).filter(t => t && !t.deleted && t.kind === 'file' && t.r2Key) : [];
const mrKey = t => String(t.id) + ':' + t.r2Key + ':' + (t.size || 0);  // changes when the file behind an MR is replaced
/** The take's own MR choice: 'auto', 'none' or a track id of the song. A remembered file the song no longer has
 * counts as 자동 (settleChoices forgets it and says so in the slot). */
function choiceOf(s, id) {
  const c = mrChoices()[id], files = mrFilesOf(s.song);
  return c === 'none' ? 'none' : c != null && files.some(t => String(t.id) === String(c)) ? String(c) : 'auto';
}
const modeOf = choice => choice === 'auto' || choice === 'none' ? choice : 'chosen';
/** Which MRs a take is measured against now: its chosen one, none, or the first MAX_MRS. sig '' = none. The sig is the
 * cache key of the take's result, so it changes with that take's own choice only. */
function mrPlan(s, id) {
  const files = mrFilesOf(s.song), choice = choiceOf(s, id), pick = choice === 'none' ? [] : choice !== 'auto' ? files.filter(t => String(t.id) === choice) : files.slice(0, MAX_MRS);
  return {files, choice, pick, sig:pick.length ? 'cancel-v6|' + pick.map(mrKey).join('|') : ''};
}
/** A remembered MR file that is gone from the song: back to 자동 (forgotten), said in that slot for the rest of this
 * session or until another MR is picked there. Only while the song's MR files can be read (without them nothing can be told). */
const mrGone = new Set();                // recording ids
function settleChoices(s) {
  const files = mrFilesOf(s.song); if (!files.length) return;
  for (const id of [s.a, s.b]) {
    const c = mrChoices()[id];
    if (c != null && c !== 'none' && !files.some(t => String(t.id) === String(c))) { setMrChoice(id, 'auto'); mrGone.add(id); }
  }
}
const mrSamples = new Map();             // mrKey → Promise<{samples:8 kHz mono,input}> (this session, memory only)
// Capture dimensions before decodeAudioData detaches the bytes. No file names, ids, URLs or audio go in diagnostics.
const inputOf = (bytes, buf) => ({bytes, sampleRate:buf.sampleRate, channels:buf.numberOfChannels, frames:buf.length, seconds:buf.length / buf.sampleRate});
const decoder = rates => { const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext; for (const rate of rates) { try { return new Ctx(1, rate, rate); } catch {} } throw Error('이 브라우저는 소리를 꺼내 읽지 못해요.'); };
const decode = (ctx, bytes) => new Promise((resolve, reject) => { const p = ctx.decodeAudioData(bytes, resolve, reject); if (p?.then) p.then(resolve, reject); });
const aborted = () => new DOMException('그만둠', 'AbortError');
function loadMr(track, signal, onEvent = () => {}, onRetry = () => {}) {
  const key = mrKey(track);
  if (!mrSamples.has(key)) {
    const job = (async () => {
      const bytes = await L.read({source:async ({signal,attempt}) => ({url:await window.VzipR2.url(track.r2Key,{signal,refresh:attempt>1})}), signal, onEvent, onRetry, maxBytes:MAX_BYTES});
      const byteLength = bytes.byteLength;
      const buf = await L.task(() => decode(decoder([8000, 16000, 44100]), bytes), {signal,stage:'decode'});
      const input = inputOf(byteLength, buf);
      const channels = []; for (let ch = 0; ch < buf.numberOfChannels; ch++) channels.push(buf.getChannelData(ch).slice());
      const samples = await L.task(signal => new Promise((resolve, reject) => {
        const w = new Worker(WORKER), end = () => { signal.removeEventListener('abort', quit); w.terminate(); }, quit = () => { end(); reject(aborted()); };
        signal.addEventListener('abort', quit, {once:true});
        w.onmessage = e => { end(); e.data.error ? reject(Error(e.data.error)) : resolve(e.data.mono); };
        w.onerror = e => { end(); reject(Error(e.message || 'MR을 읽지 못했어요.')); };
        w.postMessage({mono:{channels, rate:buf.sampleRate}}, channels.map(c => c.buffer));
      }), {signal,stage:'mr-mono'});
      return {samples, input};
    })();
    job.catch(() => mrSamples.delete(key));                           // a failed or stopped load is tried again next time
    mrSamples.set(key, job);
  }
  return mrSamples.get(key);
}

/* ---------- measuring one take ---------- */
/** The file's bytes: a source already on the device first (no network), else the cloud link, read with progress. */
async function fileOf(item, signal, onProgress, onEvent, onRetry) {
  return L.read({source:L.recordingSource(M,item),signal,onProgress,onEvent,onRetry,maxBytes:MAX_BYTES});
}
/** Hand the decoded sound to the worker 30 s at a time (each piece is copied once and transferred), then finish. */
function measureIn(s, buf, mrs, onStage) {
  return new Promise((resolve, reject) => {
    const signal = s.abort.signal, rate = buf.sampleRate, step = Math.round(BLOCK_SECONDS * rate), seconds = buf.length / rate;
    let w; try { w = new Worker(WORKER); } catch (e) { reject(e); return; }
    let channels = []; for (let ch = 0; ch < buf.numberOfChannels; ch++) channels.push(buf.getChannelData(ch));
    let at = 0;
    const end = () => { signal.removeEventListener('abort', quit); w.terminate(); channels = null; }, quit = () => { end(); reject(aborted()); };   // 그만하기 or leaving the screen: the worker is ended
    signal.addEventListener('abort', quit, {once:true});
    const next = () => {
      if (at >= buf.length) { channels = null; w.postMessage({end:{mrs}}, mrs.map(m => m.samples.buffer)); return; }
      const piece = channels.map(c => c.slice(at, at + step)); at += step;
      w.postMessage({block:piece}, piece.map(p => p.buffer));
    };
    w.onmessage = e => {
      const d = e.data;
      if (d.error) { end(); reject(Error(d.error)); }
      else if (d.done) { end(); resolve(d.done); }
      else if (d.stage) onStage(d.stage, d.progress ?? null, null);
      else if (d.progress != null) { onStage('model', Math.min(1, d.progress / seconds), d.progress); next(); }
    };
    w.onerror = e => { end(); reject(Error(e.message || '재는 중 오류가 났어요.')); };
    w.postMessage({start:{rate, keep8k:mrs.length > 0}});
    next();
  });
}
/** One take: bytes (may already be on their way) → decode → worker. Returns the record that is kept. */
async function measure(s, item, bytesPromise, plan, onStage) {
  const signal = s.abort.signal, t0 = performance.now(), ms = {};
  const bytes = await bytesPromise; ms.fetch = bytesPromise.ms;
  const byteLength = bytes.byteLength;
  if (signal.aborted) throw aborted();
  onStage('decode', null);
  let t = performance.now();
  let buf = await L.task(() => decode(decoder([T.SR, 22050, 44100]), bytes), {signal,stage:'decode'});
  ms.decode = Math.round(performance.now() - t);
  if (signal.aborted) throw aborted();
  const input = inputOf(byteLength, buf), seconds = input.seconds, tries = [], mrs = [], mrInputs = new Map();
  if (plan.pick.length) {
    onStage('mr', null); t = performance.now();
    for (const track of plan.pick) {
      try {
        const loaded = await loadMr(track, signal, e => s.fileLoads.push({role:item.id===s.a?'base':'comp',kind:'mr',...e}), () => onStage('mrRetry',null));
        const key = mrKey(track); mrInputs.set(key, loaded.input); mrs.push({key, samples:loaded.samples.slice()});
      }
      catch (error) { if (error?.name === 'AbortError') throw error; tries.push({key:mrKey(track), ok:false, reason:'load', removedDb:null, ...(error?.diagnostic?{loadFailure:error.diagnostic}:{})}); }
    }
    ms.mrLoad = Math.round(performance.now() - t);
  }
  onStage('model', 0, 0);
  const out = await measureIn(s, buf, mrs, onStage);
  buf = null;
  Object.assign(ms, out.stages, {total:Math.round(performance.now() - t0)});
  return {id:item.id, model:P.VERSION, at:Date.now(), seconds:Math.round(seconds * 10) / 10, mrSig:plan.sig, mixed:out.mixed, removed:out.removed,
    input, runtime:{pageRevision:PAGE_REVISION, ...out.runtime}, tries:[...tries, ...out.tries.map(x => ({...x, input:mrInputs.get(x.key)}))], stages:ms};
}

/* ---------- what a take shows ---------- */
// The words app/mr-reanalyze.js uses for the same outcomes, where it has them.
const MR_REASON = {
  'no-match':'MR과 맞지 않아요',
  short:'녹음이나 MR이 너무 짧아요',
  little:'MR을 빼도 소리가 거의 줄지 않았어요',
  load:'MR 파일을 불러오지 못했어요',
  error:'MR을 빼는 중 오류가 났어요'
};
/** The record of a take if it was measured with this model against the MR files the song has now. */
const recordOf = (s, id) => { const r = results.get(id); return r && r.model === P.VERSION && r.mrSig === mrPlan(s, id).sig ? r : null; };
/** Everything the screen says about one side. state: 'none' | 'ready'. */
function viewOf(s, role) {
  const m = s.items.find(x => x.id === s[role]); if (!m) return null;
  const rec = recordOf(s, m.id), stored = cleanOf(m), plan = mrPlan(s, m.id), files = plan.files, mode = files.length ? modeOf(plan.choice) : null;
  if (!rec) return {m, state:'none', stored, files, plan, mode};
  const track = rec.removed ? files.find(t => mrKey(t) === rec.removed.key) : null;
  if (rec.removed) return {m, rec, state:'ready', source:'mr-removed', result:rec.removed.result, shown:rec.removed.result, clean:{clean:true, why:'song-mr-removed'}, ok:{ok:true, why:'song-mr-removed'}, track, stored, files, plan, mode};
  const ok = P.measurable(rec.mixed, stored.clean);
  return {m, rec, state:'ready', source:stored.clean ? 'clean' : 'mixed', result:rec.mixed, shown:P.gate(rec.mixed, stored.clean), clean:stored, ok, stored, files, plan, mode};
}

/* ---------- drawing ---------- */
const noteBanner = () => '<p class="vp-note" data-vp-note><i class="ph ph-ear" aria-hidden="true"></i><span>' + NOTE + '</span></p>';
const trial = '<span class="vp-trial">시험판</span>';
const STAGE = {wait:'차례를 기다리는 중', file:'파일 받는 중', fileRetry:'파일 연결을 다시 시도하는 중', decode:'소리 읽는 중', mr:'곡 MR 불러오는 중', mrRetry:'MR 연결을 다시 시도하는 중', model:'재는 중', cancel:'곡 MR 빼는 중', voice:'목소리 재는 중'};
const stageText = j => STAGE[j.stage] + (j.pct != null ? ' ' + Math.round(j.pct * 100) + '%' : '') + (j.stage === 'model' && j.at != null && j.of ? ' · ' + clock(j.at) + ' / ' + clock(j.of) : '');
function progressHtml(s, role) {
  const j = s.jobs?.[s[role]]; if (!j) return '';
  const pct = j.pct == null ? null : Math.round(j.pct * 100);
  return '<div class="vp-progress" data-vp-progress="' + role + '"><p data-vp-stage role="status">' + esc(stageText(j)) + '</p><div class="vp-bar' + (pct == null ? ' busy' : '') + '" role="progressbar" aria-label="' + (role === 'a' ? '기준' : '비교') + ' 녹음 재는 중" aria-valuemin="0" aria-valuemax="100"' + (pct == null ? '' : ' aria-valuenow="' + pct + '"') + '><span data-vp-bar style="width:' + (pct == null ? 100 : pct) + '%"></span></div></div>';
}
function paintProgress(s, role) {
  const box = s.host.querySelector('[data-vp-progress="' + role + '"]'), j = s.jobs?.[s[role]];
  if (!box || !j) return;
  const pct = j.pct == null ? null : Math.round(j.pct * 100), bar = box.querySelector('.vp-bar');
  box.querySelector('[data-vp-stage]').textContent = stageText(j);
  bar.classList.toggle('busy', pct == null); box.querySelector('[data-vp-bar]').style.width = (pct == null ? 100 : pct) + '%';
  if (pct == null) bar.removeAttribute('aria-valuenow'); else bar.setAttribute('aria-valuenow', String(pct));
}
function slot(s, role) {
  const id = s[role], m = s.items.find(x => x.id === id), marks = marksOf(s.song), other = s[role === 'a' ? 'b' : 'a'];
  if (!m) return '';
  const label = role === 'a' ? '기준' : '비교', a = analysisOf(m), c = cleanOf(m), marked = marks.includes(String(m.id)), rec = recordOf(s, m.id);
  const options = s.items.map(x => '<option value="' + esc(x.id) + '"' + (x.id === id ? ' selected' : '') + (x.id === other ? ' disabled' : '') + '>' +
    esc([day(x), M.label(x), marks.includes(String(x.id)) ? '기준 녹음' : '', analysisOf(x) ? (reliable(x) ? '' : '신뢰도 낮음') : '분석 전', recordOf(s, x.id) ? '잰 녹음' : ''].filter(Boolean).join(' · ')) + '</option>').join('');
  const meta = [day(m) || '날짜 없음', m.durationSeconds ? clock(m.durationSeconds) : '', !a ? '분석 전' : reliable(m) ? '' : '신뢰도 낮음'].filter(Boolean).join(' · ');
  return '<div class="vp-slot" data-vp-slot="' + role + '"><label class="vp-field"><span>' + label + ' 녹음</span><select data-vp-pick="' + role + '" aria-label="' + label + ' 녹음 고르기"' + (s.running ? ' disabled' : '') + '>' + options + '</select></label>' +
    '<p class="vp-meta" data-vp-meta>' + esc(meta) + (rec && !s.jobs?.[id] ? ' · <span data-vp-kept>이 기기에 잰 결과가 있어요</span>' : '') + '</p>' +
    '<label class="vp-check"><input type="checkbox" data-vp-clean="' + role + '"' + (c.clean ? ' checked' : '') + (s.running ? ' disabled' : '') + '><span>이 녹음은 목소리만 들어가 있어요</span></label>' +
    '<p class="vp-why" data-vp-why>' + esc(P.CLEAN_TEXT[c.why]) + (c.clean ? '' : mrPlan(s, m.id).pick.length ? ' · 곡 MR이 빠지면 이 표시와 상관없이 울림·숨소리까지 재요' : ' · ' + esc(P.UNCLEAN_NOTE)) + '</p>' +
    mrChoice(s, role, m.id) +
    '<button type="button" class="vp-mark-base" data-vp-base="' + role + '" aria-pressed="' + marked + '"><i class="ph' + (marked ? '-fill' : '') + ' ph-bookmark-simple" aria-hidden="true"></i>' + (marked ? '이 곡의 기준 녹음이에요' : '이 곡의 기준 녹음으로 표시') + '</button>' +
    progressHtml(s, role) + '</div>';
}
/** "이 녹음에서 뺄 MR" in a take's slot: 자동, each MR file of the song, or 빼지 않기 (nothing when the song has none). */
function mrChoice(s, role, id) {
  const {files, choice} = mrPlan(s, id); if (!files.length) return '';
  const label = role === 'a' ? '기준' : '비교';
  const opt = (value, text) => '<option value="' + esc(value) + '"' + (value === choice ? ' selected' : '') + '>' + esc(text) + '</option>';
  return '<div class="vp-mr" data-vp-mr="' + role + '"><label class="vp-field"><span>이 녹음에서 뺄 MR</span><select data-vp-mr-pick="' + role + '" aria-label="' + label + ' 녹음에서 뺄 MR 고르기"' + (s.running ? ' disabled' : '') + '>' +
    opt('auto', '자동 · 가장 많이 빠지는 MR') + files.map(t => opt(String(t.id), t.title || '곡 MR')).join('') + opt('none', '빼지 않기') + '</select></label>' +
    (mrGone.has(id) ? '<p class="vp-muted" data-vp-mr-gone role="status">이 녹음에 골라 둔 MR 파일이 곡에 없어서 자동으로 바꿨어요.</p>' : '') + '</div>';
}
const mrHelp = s => mrFilesOf(s.song).length ? '<p class="vp-muted" data-vp-mr-help>녹음마다 뺄 MR을 따로 골라요. 이 곡에 올린 MR 파일을 녹음에서 빼고 목소리만 재요. 녹음할 때 MR의 키나 빠르기를 바꿨다면 빠지지 않아요.</p>' : '';
function picker(s) {
  const ids = [s.a, s.b].filter(Boolean), missing = ids.filter(id => !recordOf(s, id));
  const status = '<p class="vp-muted" data-vp-status role="status">' + esc(s.status || (missing.length ? '이 기기 안에서만 재요. 한 번 잰 녹음은 이 기기에 남겨 두어 다음에는 바로 보여요.' : '이 기기에 남겨 둔 결과예요. 다시 재기를 누르면 처음부터 새로 재요.')) + '</p>';
  const attention = !!s.status && missing.length > 0;
  return '<section class="vp-card vp-picker" data-vp-picker aria-label="녹음 고르기"><h2>녹음 두 개 고르기</h2>' +
    (s.items.length < 2 ? '<p class="vp-muted" data-vp-need>이 곡의 녹음이 두 개 있어야 나란히 볼 수 있어요. 지금 ' + s.items.length + '개예요.</p>' :
      (s.defaulted ? '<p class="vp-muted" data-vp-default>' + esc(s.defaulted) + '</p>' : '') + slot(s, 'a') + slot(s, 'b') + mrHelp(s) +
      (s.running ? '<button type="button" class="btn secondary block" data-vp-cancel>그만하기</button><p class="vp-muted">이 기기 안에서만 재요. 파일이 밖으로 나가지 않아요.</p>'
        : (attention ? status : '') + '<button type="button" class="btn block vp-run" data-vp-run="' + (missing.length ? 'missing' : 'again') + '">' + (missing.length ? '흔적 재기' : '다시 재기') + '</button>' + (attention ? '' : status))) +
    '</section>';
}
function timesHtml(role, label, list, kindLabel) {
  if (!list || !list.length) return '';
  const chip = x => '<button type="button" class="vp-time" data-vp-play="' + role + '" data-t="' + x.t + '" aria-label="' + esc(label + ' 녹음 ' + clock(x.t) + ' ' + kindLabel + ' 부분 듣기') + '"><i class="ph-fill ph-play" aria-hidden="true"></i>' + esc(clock(x.t)) + '</button>';
  const first = list.slice(0, MAX_TIMES).map(chip).join(''), rest = list.slice(MAX_TIMES);
  return '<div class="vp-times" data-vp-times="' + role + '"><span>' + label + '</span><div>' + first + (rest.length ? '<details><summary>' + rest.length + '곳 더 보기</summary><div>' + rest.map(chip).join('') + '</div></details>' : '') + '</div></div>';
}
const GROUP_NOTE = {
  '전환':'한 구절 안에서 소리가 잠깐 끊기거나(0.04~0.15초) 음이 갑자기 뒤집혔다 돌아온 곳이에요. 자음 때문에 끊긴 곳도 함께 세요. 같은 곡의 두 녹음 사이 차이로만 봐 주세요. 시간을 누르면 그 부분을 들을 수 있어요.',
  '이어짐':'0.6초 넘게 이어 낸 음에서 잰 값이에요. 음높이 흔들림은 비브라토를 뺀 값이에요.',
  '울림':'소리에서 2–4 kHz 쪽이 차지하는 크기와, 그 값이 낮은 음·가운데 음·높은 음 사이에서 얼마나 달라지는지예요.',
  '숨소리':'목소리의 배음에 견준 잡음의 크기예요. 숫자가 클수록 잡음이 적어요.',
  '시작':'구절을 시작할 때 소리가 아주 빨리 켜지면서 음이 위로 튀었는지를 세요.'
};
/** Rows: a comparison when both takes can be measured; else one take's own values with nothing said about the other. */
function rowsHtml(A, B, running) {
  const usable = v => v?.state === 'ready' && v.ok.ok, a = usable(A) ? A.shown : null, b = usable(B) ? B.shown : null;
  if (!a && !b) return '';
  const why = v => v?.state === 'ready' ? ['잴 수 없음', '한쪽 녹음을 잴 수 없어 나란히 보지 않아요', '잴 수 없어요'] : running ? ['재는 중', '다른 녹음을 다 재면 나란히 보여 드려요', '재는 중…'] : ['아직 못 잼', '한쪽 녹음을 아직 재지 못해 나란히 보지 않아요', '아직 재지 못했어요'];
  const one = (side, v) => { const [marker, line, other] = why(v); return P.alone(side === 'base' ? a : b, side, {marker, line, other}); };
  const rows = a && b ? P.compare(a, b) : a ? one('base', B) : one('comp', A), groups = [...new Set(rows.map(r => r.group))];
  const times = id => { const key = id === 'breaks' ? ['breaks', '끊김'] : id === 'flips' ? ['flips', '뒤집힘'] : null; return key ? timesHtml('a', '기준', a?.transitions[key[0]], key[1]) + timesHtml('b', '비교', b?.transitions[key[0]], key[1]) : ''; };
  return groups.map(g => '<section class="vp-card vp-group" data-vp-group="' + esc(g) + '"><h2>' + esc(g) + '</h2><p class="vp-muted">' + esc(GROUP_NOTE[g] || '') + '</p><ul>' +
    rows.filter(r => r.group === g).map(r => '<li class="vp-row" data-vp-row="' + r.id + '" data-state="' + r.state + '"><div class="vp-row-head"><strong>' + esc(r.title) + '</strong><span class="vp-mark" data-vp-mark="' + (r.state === 'alone' ? 'hold' : r.state) + '">' + esc(r.marker) + '</span></div>' +
      '<dl class="vp-vals"><div><dt>기준</dt><dd>' + esc(r.base) + '</dd></div><div><dt>비교</dt><dd>' + esc(r.comp) + '</dd></div></dl>' +
      '<p class="vp-line" data-vp-line>' + esc(r.line) + '</p>' + times(r.id) + '</li>').join('') + '</ul></section>').join('');
}
function zonesHtml(label, R) {
  const z = R.zones, r = R.range;
  const name = k => !r ? '' : !r.split ? r.lowNote + '–' + r.highNote : k === 'low' ? r.lowNote + '–' + P.noteName(r.bounds[0]) : k === 'mid' ? P.noteName(r.bounds[0]) + '–' + P.noteName(r.bounds[1]) : P.noteName(r.bounds[1]) + '–' + r.highNote;
  const cell = (k, v) => '<div><dt>' + k + '</dt><dd>' + esc(v) + '</dd></div>';
  const val = (v, unit, d = 1) => v == null ? '—' : (Math.round(v * 10 ** d) / 10 ** d) + unit;
  return '<div class="vp-zones" data-vp-zones><h3>' + label + '</h3>' + ['low', 'mid', 'high'].map(k => {
    const x = z[k];
    if (!x.enough) return '<div class="vp-zone" data-vp-zone="' + k + '" data-enough="false"><strong>' + P.ZONE_LABEL[k] + '</strong><span class="vp-mark" data-vp-mark="hold">표본 부족</span><p class="vp-muted">소리 ' + val(x.seconds, '초') + ' · ' + T.MIN_ZONE_SECONDS + '초보다 적어 비교하지 않아요.</p></div>';
    return '<div class="vp-zone" data-vp-zone="' + k + '" data-enough="true"><strong>' + P.ZONE_LABEL[k] + (name(k) ? ' <small>' + esc(name(k)) + '</small>' : '') + '</strong><dl>' +
      cell('소리', val(x.seconds, '초')) + cell('끊김', x.breaks + '곳') + cell('뒤집힘', x.flips + '곳') + cell('긴 음 흔들림', x.sustain.notes ? '±' + val(x.sustain.pitchSdCents, ' cent') : '—') +
      (R.resonance ? cell('2–4 kHz', val(x.ratioDb, ' dB')) + cell('중심', val(x.centroidHz, ' Hz', 0)) + cell('배음 대 잡음', val(x.hnrDb, ' dB')) : '') + '</dl></div>';
  }).join('') + '</div>';
}
const info = (attr, icon, text) => '<p class="vp-unclean" ' + attr + '><i class="ph ph-' + icon + '" aria-hidden="true"></i><span>' + text + '</span></p>';
/** What the stored analysis of a take was measured on, when that is not what this screen reads. */
function storedNote(v) {
  const c = analysisOf(v.m)?.confidence;
  if (!c?.aiSeparated && !c?.mrRemoved) return '';
  const how = c.aiSeparated ? '서버에서 AI로 목소리만 분리해' : '곡 MR을 빼고';
  return '<p class="vp-muted" data-vp-stored-note>이 녹음에 저장된 분석 수치는 ' + how + ' 잰 값이에요. 이 화면은 ' + (v.source === 'mr-removed' ? '원본 파일에서 곡 MR을 직접 빼고 읽어요.' : '반주가 섞인 원본 파일을 그대로 읽어요.') + '</p>';
}
/** Saved summaries remain useful even when a fresh reading of the original mix is held. Never replace traces. */
function savedComparison(s) {
  const items=[s.items.find(m=>m.id===s.a),s.items.find(m=>m.id===s.b)];
  if(!items.some(reliable))return '';
  const analyses=items.map(analysisOf),method=a=>!a?'저장된 분석 없음':a.confidence?.aiSeparated?'AI 분리 후 측정(참고)':a.confidence?.mrRemoved?'MR 제거 후 측정(참고)':'녹음 그대로 측정';
  const number=(n,unit)=>Number.isFinite(n)?Math.round(n*10)/10+unit:'—';
  const defs=[['목소리 구간',a=>number(a.metrics.voicedSeconds,'초')],['음정 평균 오차',a=>number(a.metrics.intonation?.meanAbsCents,' cent')],
    ['지속음 흔들림 · 참고',a=>number(a.metrics.stability?.wobbleCents,' cent')],['비브라토 비율 · 참고',a=>number(a.metrics.vibrato?.share,'%')],
    ['유효 최고음',a=>a.metrics.range?.validHigh?.note||'—'],['안정 최고음',a=>a.metrics.range?.stableHigh?.note||'—']];
  const rows=defs.filter(([,get])=>analyses.some((a,i)=>reliable(items[i])&&get(a)!=='—')).map(([label,get])=>'<tr><th scope="row">'+esc(label)+'</th>'+analyses.map((a,i)=>'<td>'+esc(reliable(items[i])?get(a):'판정 보류')+'</td>').join('')+'</tr>').join('');
  return '<section class="vp-card vp-saved" data-vp-saved-comparison><h2>저장된 보컬 분석</h2><p class="vp-muted">이미 저장된 측정값을 나란히 보여 드려요. 위에서 새로 읽은 원본 음원의 소리 길 결과와는 측정 방식이 다를 수 있어요.</p>'+
    '<table><thead><tr><th scope="col">측정값</th>'+analyses.map((a,i)=>'<th scope="col">'+(i?'비교':'기준')+'<small>'+esc(method(a))+'</small></th>').join('')+'</tr></thead><tbody>'+rows+'</tbody></table>'+
    '<p class="vp-muted">측정 방식이 다른 값의 차이는 실력 변화로 판단하지 않아요. 끊김·울림·숨소리는 원본 재측정의 보류 상태를 유지해요.</p></section>';
}
function takeCard(s, role, label, v) {
  const m = v.m, head = '<section class="vp-card vp-take" data-vp-take="' + role + '" data-vp-source="' + (v.source || 'none') + '"><div class="vp-take-head"><span class="vp-role">' + label + '</span><strong>' + esc(M.label(m)) + '</strong></div>';
  if (v.state !== 'ready') return head + '<p class="vp-meta">' + esc(day(m)) + '</p>' + (s.jobs?.[m.id] ? '<p class="vp-muted" data-vp-pending>재는 중이에요. 끝나는 대로 여기에 보여 드려요.</p>' : '<p class="vp-muted" data-vp-pending>아직 재지 않았어요.</p>') + '</section>';
  const r = v.result, failed = v.rec.tries.filter(t => !t.ok);
  const mrNote = v.source === 'mr-removed' ? info('data-vp-mr-note', 'music-notes-minus', '<b>반주 줄임: 곡 MR을 빼고 잰 소리</b> · 곡 MR(' + esc(v.track?.title || '곡 MR') + ')을 녹음에 맞춰 반주를 줄였어요.' +
      (v.mode === 'auto' && v.plan.pick.length > 1 ? ' 자동으로 가장 많이 빠지는 MR을 골랐어요.' : '') + ' 반주가 조금 남아 있을 수 있어요.')
    : v.mode === 'none' ? '<p class="vp-muted" data-vp-mr-none>MR을 빼지 않고 쟀어요.</p>'
    : failed.length ? info('data-vp-mr-failed', 'info', '곡 MR을 빼지 못했어요: ' + esc([...new Set(failed.map(t => MR_REASON[t.reason] || MR_REASON['no-match']))].join(', ')) + (failed.some(t=>t.reason==='load') ? '. 파일 연결을 확인한 뒤 다시 재기를 눌러 주세요.' : '. 같은 MR이어도 시작점이나 녹음된 소리가 달라 정렬이 실패할 수 있어요.') + ' 녹음 파일을 그대로 읽었어요.') : '';
  const state = !v.ok.ok ? info('data-vp-refused', 'prohibit', esc(P.refusedText(v.result,v.ok.why)))
    : v.source === 'mixed' ? info('data-vp-unclean', 'info', esc(P.UNCLEAN_NOTE) + '. 끊김·뒤집힘에도 반주를 잘못 읽은 곳이 섞일 수 있어요.') : '';
  const segment=!v.ok.ok&&V.precisionAnalyze&&!(m.durationSeconds>600)&&!(m.size>25*1024*1024)
    ? '<a class="btn secondary" data-vp-precision href="#/precision-report?media='+encodeURIComponent(m.id)+'&amp;start=0&amp;end='+Math.min(60,Number(m.durationSeconds)||60)+'">구간을 골라 정밀 분석</a>' : '';
  return head + '<p class="vp-meta">' + esc([day(m), v.ok.ok ? '목소리 ' + Math.round(r.voicedSeconds) + '초' : '', '녹음 ' + clock(v.rec.seconds) + ' 전체를 쟀어요'].filter(Boolean).join(' · ')) + '</p>' + mrNote + state + storedNote(v) + segment +
    '<div data-vp-player="' + role + '"></div><p class="vp-muted" data-vp-playing="' + role + '" role="status"></p></section>';
}
function resultsHtml(s) {
  const A = viewOf(s, 'a'), B = viewOf(s, 'b');
  if (!A || !B || (A.state !== 'ready' && B.state !== 'ready')) return '';
  const both = A.state === 'ready' && B.state === 'ready', shown = [A, B].filter(v => v.state === 'ready' && v.ok.ok);
  return '<div class="vp-results" data-vp-results data-vp-complete="' + both + '"><div class="vp-takes">' + takeCard(s, 'a', '기준', A) + takeCard(s, 'b', '비교', B) + '</div>' +
    (!s.running && (!A.ok?.ok || !B.ok?.ok) ? savedComparison(s) : '') + rowsHtml(A, B, s.running) +
    (shown.length ? '<section class="vp-card" data-vp-zone-card><details><summary>음역별로 보기 <i class="ph ph-caret-down" aria-hidden="true"></i></summary><p class="vp-muted">녹음마다 부른 음의 범위를 셋으로 나눠 봤어요. 소리가 ' + T.MIN_ZONE_SECONDS + '초보다 적은 구간은 표본 부족으로 두고 비교하지 않아요.</p>' +
      (A.state === 'ready' && A.ok.ok ? zonesHtml('기준', A.shown) : '') + (B.state === 'ready' && B.ok.ok ? zonesHtml('비교', B.shown) : '') + '</details></section>' : '') +
    (both ? '<section class="vp-card vp-diag"><button type="button" class="btn sm secondary" data-vp-diagnosis><i class="ph ph-file-arrow-down" aria-hidden="true"></i> 진단 파일 저장</button>' +
      '<p class="vp-muted">두 녹음의 측정 숫자(구간별·반음별 값, 잰 소리의 길이, 반주 여부와 그 이유, 곡 MR을 뺀 결과, 분석 버전과 신뢰도, 녹음 길이, 단계별로 걸린 시간, 쓴 기준값)와 녹음한 달만 담아요. 제목·곡 이름·파일 이름·날짜(일)·음성은 담지 않아요.</p></section>' : '') +
    '<p class="vp-muted vp-foot">시험판이에요. 여기 쓰인 기준값은 첫 어림값이고, 선생님이 듣는 것과 맞는지는 아직 확인하지 않았어요. 점수나 판정이 아니에요.</p></div>';
}
function draw(s) {
  if (s.dead) return;
  s.players?.forEach(p => p.destroy?.()); s.players = new Map();
  settleChoices(s);
  const keep = document.scrollingElement?.scrollTop ?? 0;
  const failedLoad = !s.running && s.fileLoads?.length && !(viewOf(s,'a')?.state==='ready'&&viewOf(s,'b')?.state==='ready')
    ? '<section class="vp-card vp-diag"><button type="button" class="btn sm secondary" data-vp-diagnosis><i class="ph ph-file-arrow-down" aria-hidden="true"></i> 진단 파일 저장</button><p class="vp-muted">파일을 불러오지 못한 단계와 연결 상태를 담아요. 음성과 파일 주소는 담지 않아요.</p></section>' : '';
  s.host.innerHTML = noteBanner() + '<div class="vp-song"><strong>' + esc(s.song.title) + '</strong>' + trial + '</div><div class="vp-cols">' + picker(s) + resultsHtml(s) + '</div>' + failedLoad;
  if (document.scrollingElement) document.scrollingElement.scrollTop = keep;
  bind(s);
}
/** Measure what is missing (or, with force, both again — the earlier result of a take stays until its new one is
 * done). The second file is fetched while the first is measured; decoding and measuring go one take at a time, and
 * each take is shown as soon as it is done. */
async function run(s, force) {
  if (s.running) return;
  const todo = [...new Set([s.a, s.b].filter(Boolean))].filter(id => force || !recordOf(s, id));
  if (!todo.length) return;
  s.running = true; s.status = ''; s.abort = new AbortController(); s.jobs = {}; s.fileLoads = [];
  const roleOf = id => id === s.a ? 'a' : 'b';
  const stage = (id, name, pct, at) => { if (s.dead) return; const j = s.jobs[id]; if (!j) return; j.stage = name; j.pct = pct; j.at = at ?? null; paintProgress(s, roleOf(id)); };
  const files = new Map();
  for (const id of todo) {
    const item = s.items.find(x => x.id === id), t0 = performance.now();
    s.jobs[id] = {stage:'file', pct:null, at:null, of:Number(item.durationSeconds) || 0};
    const p = fileOf(item, s.abort.signal, pct => { if (['file','fileRetry'].includes(s.jobs[id]?.stage)) stage(id, 'file', pct); }, e => s.fileLoads.push({role:id===s.a?'base':'comp',kind:'recording',...e}), () => stage(id,'fileRetry',null)).then(bytes => { p.ms = Math.round(performance.now() - t0); if (s.jobs[id]?.stage === 'file' && id !== todo[0]) stage(id, 'wait', null); return bytes; });
    p.catch(() => {}); files.set(id, p);
  }
  draw(s);
  let measuring = todo[0];
  try {
    for (const id of todo) {
      measuring = id;
      const item = s.items.find(x => x.id === id);
      const rec = await measure(s, item, files.get(id), mrPlan(s, id), (name, pct, at) => stage(id, name, pct, at));
      if (s.dead) return;
      results.set(id, rec); delete s.jobs[id];
      cache.put(rec);                                                 // kept on this device; not awaited
      draw(s);                                                        // this take is shown while the next one is measured
    }
    s.status = '다 쟀어요.';
  } catch (error) {
    if (s.dead) return;
    if(error?.diagnostic && !s.fileLoads.some(e=>e.code===error.diagnostic.code&&e.stage===error.diagnostic.stage&&e.attempt===error.diagnostic.attempt))
      s.fileLoads.push({role:measuring===s.a?'base':'comp',kind:'recording',...error.diagnostic});
    s.abort.abort();                                                  // stop the other download too
    s.status = error?.name === 'AbortError' ? '그만뒀어요. 다시 재려면 흔적 재기를 눌러 주세요.' : '재지 못했어요: ' + String(error?.message || error);
  } finally { if (!s.dead) { s.running = false; s.abort = null; s.jobs = {}; draw(s); } }
}
function bind(s) {
  const host = s.host, q = sel => host.querySelector(sel);
  host.querySelectorAll('[data-vp-pick]').forEach(sel => sel.onchange = () => { s[sel.dataset.vpPick] = sel.value; s.defaulted = ''; s.status = ''; s.fileLoads = []; draw(s); host.querySelector('[data-vp-pick="' + sel.dataset.vpPick + '"]')?.focus({preventScroll:true}); });
  host.querySelectorAll('[data-vp-mr-pick]').forEach(sel => sel.onchange = () => {
    const role = sel.dataset.vpMrPick, id = s[role];
    if (!setMrChoice(id, sel.value)) V.toast('고른 MR을 저장하지 못했어요.', 'error');
    mrGone.delete(id); s.status = ''; s.fileLoads = []; draw(s); host.querySelector('[data-vp-mr-pick="' + role + '"]')?.focus({preventScroll:true});
  });
  host.querySelectorAll('[data-vp-clean]').forEach(box => box.onchange = () => {
    const id = s[box.dataset.vpClean];
    if (!setTick(id, box.checked)) V.toast('표시를 저장하지 못했어요.', 'error');
    draw(s); host.querySelector('[data-vp-clean="' + box.dataset.vpClean + '"]')?.focus({preventScroll:true});
  });
  host.querySelectorAll('[data-vp-base]').forEach(button => button.onclick = () => {
    const id = String(s[button.dataset.vpBase]), songId = s.song.id;
    if (!V.song(songId) || !s.items.some(x => String(x.id) === id)) { V.toast('곡이나 녹음을 찾지 못했어요.', 'error'); return; }
    const on = !marksOf(s.song).includes(id);
    const ok = V.change(db => {
      const song = (db.songs || []).find(x => x.id === songId); if (!song) return;
      const list = (Array.isArray(song.voicePathBaseIds) ? song.voicePathBaseIds.map(String) : []).filter(x => x !== id);
      if (on) list.push(id);
      if (list.length) song.voicePathBaseIds = list.slice(-MAX_BASE_MARKS); else delete song.voicePathBaseIds;
    }, {silent:true});
    if (!ok) return;
    V.toast(on ? '이 곡의 기준 녹음으로 표시했어요.' : '기준 녹음 표시를 지웠어요.');
    draw(s); host.querySelector('[data-vp-base="' + button.dataset.vpBase + '"]')?.focus({preventScroll:true});
  });
  const runButton = q('[data-vp-run]'); if (runButton) runButton.onclick = () => run(s, runButton.dataset.vpRun === 'again');
  const cancel = q('[data-vp-cancel]'); if (cancel) cancel.onclick = () => { cancel.disabled = true; s.abort?.abort(); };
  for (const role of ['a', 'b']) {
    const box = q('[data-vp-player="' + role + '"]'), m = s.items.find(x => x.id === s[role]);
    if (box && m) { const player = M.player(box, m, {prefetch:true}); s.players.set(role, player); box._player = player; }
  }
  host.querySelectorAll('[data-vp-play]').forEach(button => button.onclick = () => {
    const role = button.dataset.vpPlay, player = s.players.get(role); if (!player) return;
    if (V.analysisPlayAt) V.analysisPlayAt(player, button.dataset.t); else { player.seek(Math.max(0, Number(button.dataset.t) - 1)); if (player.el.paused) player.play(); }
    host.querySelectorAll('[data-vp-playing]').forEach(p => { p.textContent = p.dataset.vpPlaying === role ? clock(Math.max(0, Number(button.dataset.t) - (V.analysisPrerollSeconds ?? 1))) + '부터 들려 드려요 (끊기거나 뒤집힌 곳 ' + clock(button.dataset.t) + ')' : ''; });
    host.querySelectorAll('[data-vp-play][aria-current]').forEach(b => b.removeAttribute('aria-current')); button.setAttribute('aria-current', 'true');
  });
  const diag = q('[data-vp-diagnosis]');
  if (diag) diag.onclick = async () => {
    diag.disabled = true;
    try {
      const data = JSON.stringify(diagnosisOf(s));
      const out = new File([data], 'vocalzip-voice-path-diagnosis.json', {type:'application/json'});
      if (navigator.canShare?.({files:[out]}) && navigator.share) { try { await navigator.share({files:[out], title:'소리 길 흔적 진단 파일'}); return; } catch (error) { if (error?.name === 'AbortError') return; } }
      const url = URL.createObjectURL(out), link = document.createElement('a'); link.href = url; link.download = out.name; link.hidden = true; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      V.toast('진단 파일을 저장했어요.');
    } catch (error) { V.toast('진단 파일을 만들지 못했어요: ' + (error.message || error), 'error'); }
    finally { if (diag.isConnected) diag.disabled = false; }
  };
}
/** Numbers only: see P.diagnosis. Dates are cut to the month and MR track ids are left out before they reach the file. */
function diagnosisOf(s) {
  const take = (role, key) => { const v = viewOf(s, key);
    if(v?.state!=='ready')return null;
    return {role, date:P.monthOf(M.dateOf(v.m)), result:v.result, clean:v.clean, source:v.source, measurable:v.ok, stored:analysisOf(v.m), reliable:reliable(v.m),
      mr:v.rec.removed?.report || null, mrTries:v.rec.tries, mrMode:v.mode, input:v.rec.input, runtime:v.rec.runtime,
      mixed:v.source === 'mr-removed' ? v.rec.mixed : null, stagesMs:v.rec.stages, fromDeviceCache:!!v.rec.fromDevice}; };
  return P.diagnosis([take('base', 'a'), take('comp', 'b')].filter(Boolean), {generatedMonth:V.today().slice(0, 7),fileLoads:s.fileLoads || []});
}
V.voicePathDiagnosis = () => current && (viewOf(current,'a')?.state==='ready' || viewOf(current,'b')?.state==='ready' || current.fileLoads?.length) ? diagnosisOf(current) : null;

/* ---------- routes ---------- */
/** The song's recordings as 보컬 연구소 lists them (dataset rule 'songList'), oldest first. */
async function takesOf(song) {
  const all = await M.list().catch(() => M.cached());
  const rows = V.growthDataset ? V.growthDataset(all).pick('songList').filter(r => r.songId === song.id).map(r => r.m) : all.filter(m => m.songId === song.id);
  return rows.sort((a, b) => (M.dateOf(a) || '').localeCompare(M.dateOf(b) || '') || (Number(a.created) || 0) - (Number(b.created) || 0) || String(a.id).localeCompare(String(b.id)));
}
/** 기준: the earliest take marked 기준 녹음, else the earliest reliable take. 비교: the latest reliable take. */
function defaults(song, items, query) {
  const has = id => id && items.some(m => String(m.id) === String(id)), find = id => items.find(m => String(m.id) === String(id))?.id;
  const marks = marksOf(song), good = items.filter(reliable), pool = good.length >= 2 ? good : items;
  let b = has(query.get('b')) ? find(query.get('b')) : null, a = has(query.get('a')) ? find(query.get('a')) : null, why = '';
  if (!a) { const marked = items.find(m => marks.includes(String(m.id)) && m.id !== b); a = (marked || pool.find(m => m.id !== b) || items.find(m => m.id !== b))?.id || null; why = marked ? '기준 녹음으로 표시한 녹음을 기준으로 골랐어요.' : ''; }
  if (!b) b = ([...pool].reverse().find(m => m.id !== a) || [...items].reverse().find(m => m.id !== a))?.id || null;
  if (!why && !query.get('a') && !query.get('b') && items.length >= 2) why = good.length >= 2 ? '분석 신뢰도가 충분한 녹음 가운데 가장 이른 것과 가장 최근 것을 골랐어요.' : '신뢰도가 충분한 분석이 두 개 없어서, 가장 이른 녹음과 가장 최근 녹음을 골랐어요.';
  return {a, b, why};
}
async function songList(host, my) {
  const songs = V.songsNewest(), all = await M.list().catch(() => M.cached());
  if (my !== serial || !host.isConnected) return;
  const ds = V.growthDataset ? V.growthDataset(all) : null, count = new Map();
  if (ds) for (const r of ds.pick('songList')) count.set(r.songId, (count.get(r.songId) || 0) + 1); else for (const m of all) if (m.songId) count.set(m.songId, (count.get(m.songId) || 0) + 1);
  const withTakes = songs.filter(x => (count.get(x.id) || 0) >= 1);
  host.innerHTML = noteBanner() + '<div class="vp-song"><strong>곡 고르기</strong>' + trial + '</div>' +
    (withTakes.length ? '<div class="list icons vp-songs" data-vp-songs>' + withTakes.map(x => '<a class="item" href="#/voice-path/' + encodeURIComponent(x.id) + '" data-vp-song="' + esc(x.id) + '"><i class="ph ph-path" aria-hidden="true"></i><span class="item-main"><span class="item-title">' + esc(x.title) + '</span><span class="item-sub">녹음 ' + count.get(x.id) + '개' + (count.get(x.id) < 2 ? ' · 두 개가 있어야 나란히 볼 수 있어요' : '') + '</span></span><i class="ph ph-caret-right chev" aria-hidden="true"></i></a>').join('') + '</div>'
      : '<div class="vp-card"><p class="vp-muted">곡에 연결된 녹음이 아직 없어요. 곡을 지정해 녹음하면 여기에서 고를 수 있어요.</p></div>') +
    '<p class="vp-muted vp-foot">같은 곡을 다른 때 부른 두 녹음을 골라, 귀로 들리는 흔적(끊김·뒤집힘·긴 음의 흔들림·울림·숨소리·시작)을 나란히 봐요. 모두 이 기기 안에서만 재요.</p>';
}
let loaded = null;
V.route('voice-path', {title:'소리 길 흔적', back:true, tab:'growth', noAutoRefresh:true,
  render:() => '<div class="vp" data-vp><p class="vp-muted" role="status">녹음을 불러오는 중…</p></div>',
  async mount(main, r) {
    leave(); const my = ++serial, host = main.querySelector('[data-vp]'), song = V.song(r.params[0]);
    if (!song) { await songList(host, my); return; }
    const [items] = await Promise.all([takesOf(song), loaded ||= cache.load()]);
    if (my !== serial || !host.isConnected) return;
    const d = defaults(song, items, r.query);
    current = {host, song, items, a:d.a, b:d.b, defaulted:d.why, running:false, dead:false, jobs:{}, players:new Map()};
    draw(current);
  },
  leave
});
})();
