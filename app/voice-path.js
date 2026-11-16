/* VOCAL.zip 소리 길 흔적 (시험판) — two takes of a song side by side: audible traces measured on this device.
 *
 *   #/voice-path                 pick a song
 *   #/voice-path/<songId>        pick 기준 · 비교, measure, read the rows (optional ?a=<id>&b=<id>)
 *
 * Entered from 성장 › 보컬 분석 (app/growth-hub.js) and from a recording in 보컬 연구소 (VZ.voicePathLink).
 * Model: app/voice-path-model.js (runs in app/voice-path-worker.js). Pitch guide: the app's own analysis
 * (VZ.analyzeSamples), called as it is. Nothing is uploaded; no stored analysis is changed; results live in memory
 * for this session only. Stored: the 기준 녹음 mark on the song record (songs[].voicePathBaseIds, through VZ.change,
 * so it syncs with the song) and, on this device only, the "목소리만" tick per recording.
 * The screen never says whether the 길 was found: 비슷함 / 다름 and the direction in words, nothing more. */
(() => {
'use strict';
const V = window.VZ, M = V?.media, P = window.VzipVoicePath;
if (!V || !M || !P) return;
const esc = V.esc;
const WORKER = 'app/voice-path-worker.js?v=1';
const MAX_BYTES = 250 * 1024 * 1024;     // the same limit as the app's analysis
const MAX_SECONDS = 10 * 60;             // longer takes are read up to here (memory on a phone)
const MAX_BASE_MARKS = 20;               // 기준 녹음 marks kept per song
const MAX_TIMES = 12;                    // break / flip times shown before "더 보기"
const NOTE = '소리의 길은 선생님 귀로 판단해요. 이 화면은 다시 들어볼 곳을 찾는 참고예요.';
const store = window.VzipAccountScope?.storage || localStorage, CLEAN_KEY = 'vzip_voice_path_clean_v1';
const ticks = () => { try { const v = JSON.parse(store.getItem(CLEAN_KEY)); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };
const setTick = (id, value) => { try { const all = ticks(); all[id] = value; store.setItem(CLEAN_KEY, JSON.stringify(all)); return true; } catch { return false; } };
const results = new Map();               // recording id → {result, guide}; this session only
const day = m => (M.dateOf(m) || '').replace(/-/g, '.');
const analysisOf = m => m?.analysis?.metrics ? m.analysis : null;
const reliable = m => !!analysisOf(m) && !!V.analysisReliable?.(m.analysis);
const cleanOf = m => { const t = ticks()[m.id]; return P.cleanOf({analysis:analysisOf(m), ticked:typeof t === 'boolean' ? t : null}); };
const marksOf = song => Array.isArray(V.song(song.id)?.voicePathBaseIds) ? V.song(song.id).voicePathBaseIds.map(String) : [];
let current = null, serial = 0;
function stop() { current?.abort?.abort(); }
function leave() { stop(); current?.players?.forEach(p => p.destroy?.()); if (current) current.dead = true; current = null; serial++; }

/** Link shown under a recording in 보컬 연구소 (dark screen; its own list-row style). */
V.voicePathLink = (song, item) => !song?.id ? '' : '<section class="vl-section"><a class="vl-report" data-voice-path-link href="#/voice-path/' + encodeURIComponent(song.id) + (item?.id ? '?b=' + encodeURIComponent(item.id) : '') +
  '"><strong>소리 길 흔적 · 시험판</strong><span>이 녹음을 다른 녹음과 나란히 봐요</span><i class="ph ph-caret-right" aria-hidden="true"></i></a></section>';

/* ---------- measuring one take ---------- */
async function decode(item, signal) {
  const src = await M.src(item);
  let bytes;
  try { const res = await fetch(src.url, signal ? {signal} : undefined); if (!res.ok) throw Error('파일을 받지 못했어요 (' + res.status + ').'); bytes = await res.arrayBuffer(); }
  finally { if (src.revoke) URL.revokeObjectURL(src.url); }
  if (bytes.byteLength > MAX_BYTES) throw Error('파일이 너무 커요. 250MB 이하 녹음만 잴 수 있어요.');
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  let ctx = null; for (const rate of [P.THRESHOLDS.SR, 22050, 44100]) { try { ctx = new Ctx(1, rate, rate); break; } catch {} }
  if (!ctx) throw Error('이 브라우저는 소리를 꺼내 읽지 못해요.');
  return {ctx, bytes};
}
async function samplesOf(item, signal, onStage) {
  onStage('파일 불러오는 중…', 0.02);
  const {ctx, bytes} = await decode(item, signal);
  onStage('소리 꺼내는 중…', 0.1);
  const buf = await new Promise((resolve, reject) => { const p = ctx.decodeAudioData(bytes, resolve, reject); if (p?.then) p.then(resolve, reject); });
  if (signal?.aborted) throw new DOMException('그만둠', 'AbortError');
  const n = Math.min(buf.length, Math.floor(MAX_SECONDS * buf.sampleRate)), mono = new Float32Array(n);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < n; i++) mono[i] += d[i] / buf.numberOfChannels; }
  return {samples:P.resample(mono, buf.sampleRate, P.THRESHOLDS.SR), cut:buf.length > n};
}
function runModel(s, samples, guide, onProgress) {
  return new Promise((resolve, reject) => {
    const signal = s.abort.signal;
    let w;
    try { w = new Worker(WORKER); } catch (e) { reject(e); return; }
    s.worker = w;
    const done = () => { signal.removeEventListener('abort', quit); w.terminate(); if (s.worker === w) s.worker = null; };
    const quit = () => { done(); reject(new DOMException('그만둠', 'AbortError')); };   // 그만하기 or leaving the screen
    signal.addEventListener('abort', quit, {once:true});
    w.onmessage = e => { const d = e.data; if (d.progress != null) onProgress(d.progress); else { done(); d.error ? reject(Error(d.error)) : resolve(d.result); } };
    w.onerror = e => { done(); reject(Error(e.message || '재는 중 오류가 났어요.')); };
    w.postMessage({samples, sampleRate:P.THRESHOLDS.SR, guide}, [samples.buffer]);
  });
}
/** Decode → the app's pitch analysis as a guide → the model. One take at a time; the samples are handed over, not kept. */
async function measure(s, item, onStage) {
  const signal = s.abort.signal, started = performance.now();
  const {samples, cut} = await samplesOf(item, signal, onStage);
  let guide = null, guideInfo = null;
  if (V.analyzeSamples) {
    onStage('음높이 찾는 중…', 0.25);
    const g = await V.analyzeSamples(samples.slice(), P.THRESHOLDS.SR, p => onStage('음높이 찾는 중…', 0.25 + p * 0.45), {signal});
    if (g?.curve && g.fps) { guide = {curve:g.curve, fps:g.fps}; guideInfo = {version:g.version, confidence:g.confidence, voicedSeconds:g.metrics?.voicedSeconds ?? null}; }
  }
  if (signal.aborted) throw new DOMException('그만둠', 'AbortError');
  onStage('흔적 재는 중…', 0.7);
  const result = await runModel(s, samples, guide, p => onStage('흔적 재는 중…', 0.7 + p * 0.3));
  return {result, guide:guideInfo, cut, ms:Math.round(performance.now() - started)};
}

/* ---------- drawing ---------- */
const clock = t => V.clock(Math.max(0, Number(t) || 0));
const noteBanner = () => '<p class="vp-note" data-vp-note><i class="ph ph-ear" aria-hidden="true"></i><span>' + NOTE + '</span></p>';
const trial = '<span class="vp-trial">시험판</span>';
const CLEAN_ROWS = '울림·숨소리·시작';
function takeMeta(m) {
  const a = analysisOf(m), c = cleanOf(m);
  const state = !a ? '분석 전' : reliable(m) ? '' : '신뢰도 낮음';
  return [day(m) || '날짜 없음', m.durationSeconds ? clock(m.durationSeconds) : '', state].filter(Boolean).join(' · ') + '\n' + P.CLEAN_TEXT[c.why];
}
function slot(s, role) {
  const id = s[role], m = s.items.find(x => x.id === id), marks = marksOf(s.song), other = s[role === 'a' ? 'b' : 'a'];
  const label = role === 'a' ? '기준' : '비교';
  const options = s.items.map(x => '<option value="' + esc(x.id) + '"' + (x.id === id ? ' selected' : '') + (x.id === other ? ' disabled' : '') + '>' +
    esc([day(x), M.label(x), marks.includes(String(x.id)) ? '기준 녹음' : '', analysisOf(x) ? (reliable(x) ? '' : '신뢰도 낮음') : '분석 전'].filter(Boolean).join(' · ')) + '</option>').join('');
  if (!m) return '';
  const [meta, why] = takeMeta(m).split('\n'), c = cleanOf(m), marked = marks.includes(String(m.id));
  return '<div class="vp-slot" data-vp-slot="' + role + '"><label class="vp-field"><span>' + label + ' 녹음</span><select data-vp-pick="' + role + '" aria-label="' + label + ' 녹음 고르기"' + (s.running ? ' disabled' : '') + '>' + options + '</select></label>' +
    '<p class="vp-meta" data-vp-meta>' + esc(meta) + '</p>' +
    '<label class="vp-check"><input type="checkbox" data-vp-clean="' + role + '"' + (c.clean ? ' checked' : '') + (s.running ? ' disabled' : '') + '><span>이 녹음은 목소리만 들어가 있어요</span></label>' +
    '<p class="vp-why" data-vp-why>' + esc(why) + (c.clean ? '' : ' · ' + esc(P.UNCLEAN_NOTE)) + '</p>' +
    '<button type="button" class="vp-mark-base" data-vp-base="' + role + '" aria-pressed="' + marked + '"><i class="ph' + (marked ? '-fill' : '') + ' ph-bookmark-simple" aria-hidden="true"></i>' + (marked ? '이 곡의 기준 녹음이에요' : '이 곡의 기준 녹음으로 표시') + '</button></div>';
}
function picker(s) {
  const both = s.items.length >= 2 && s.a && s.b;
  const ready = both && results.has(s.a) && results.has(s.b);
  return '<section class="vp-card vp-picker" data-vp-picker aria-label="녹음 고르기"><h2>녹음 두 개 고르기</h2>' +
    (s.items.length < 2 ? '<p class="vp-muted" data-vp-need>이 곡의 녹음이 두 개 있어야 나란히 볼 수 있어요. 지금 ' + s.items.length + '개예요.</p>' :
      (s.defaulted ? '<p class="vp-muted" data-vp-default>' + esc(s.defaulted) + '</p>' : '') + slot(s, 'a') + slot(s, 'b') +
      (s.running ? '<div class="vp-progress" data-vp-progress><p data-vp-stage role="status">' + esc(s.stage || '준비 중…') + '</p><div class="vp-bar" role="progressbar" aria-label="재는 중" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round((s.progress || 0) * 100) + '"><span data-vp-bar style="width:' + Math.round((s.progress || 0) * 100) + '%"></span></div>' +
          '<button type="button" class="btn secondary block" data-vp-cancel>그만하기</button><p class="vp-muted">이 기기 안에서만 재요. 파일이 밖으로 나가지 않아요.</p></div>'
        : '<button type="button" class="btn block vp-run" data-vp-run>' + (ready ? '다시 재기' : '흔적 재기') + '</button>' +
          '<p class="vp-muted" data-vp-status role="status">' + esc(s.status || '이 기기 안에서만 재요. 3분짜리 녹음 하나에 보통 몇 초에서 수십 초 걸려요.') + '</p>')) +
    '</section>';
}
function timesHtml(role, label, list, kindLabel) {
  if (!list.length) return '';
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
function rowsHtml(s, A, B) {
  const rows = P.compare(A, B), groups = [...new Set(rows.map(r => r.group))];
  const times = id => id === 'breaks' ? timesHtml('a', '기준', A.transitions.breaks, '끊김') + timesHtml('b', '비교', B.transitions.breaks, '끊김')
    : id === 'flips' ? timesHtml('a', '기준', A.transitions.flips, '뒤집힘') + timesHtml('b', '비교', B.transitions.flips, '뒤집힘') : '';
  return groups.map(g => '<section class="vp-card vp-group" data-vp-group="' + esc(g) + '"><h2>' + esc(g) + '</h2><p class="vp-muted">' + esc(GROUP_NOTE[g] || '') + '</p><ul>' +
    rows.filter(r => r.group === g).map(r => '<li class="vp-row" data-vp-row="' + r.id + '" data-state="' + r.state + '"><div class="vp-row-head"><strong>' + esc(r.title) + '</strong><span class="vp-mark" data-vp-mark="' + r.state + '">' + esc(r.marker) + '</span></div>' +
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
    if (!x.enough) return '<div class="vp-zone" data-vp-zone="' + k + '" data-enough="false"><strong>' + P.ZONE_LABEL[k] + '</strong><span class="vp-mark" data-vp-mark="hold">표본 부족</span><p class="vp-muted">소리 ' + val(x.seconds, '초') + ' · ' + P.THRESHOLDS.MIN_ZONE_SECONDS + '초보다 적어 비교하지 않아요.</p></div>';
    return '<div class="vp-zone" data-vp-zone="' + k + '" data-enough="true"><strong>' + P.ZONE_LABEL[k] + (name(k) ? ' <small>' + esc(name(k)) + '</small>' : '') + '</strong><dl>' +
      cell('소리', val(x.seconds, '초')) + cell('끊김', x.breaks + '곳') + cell('뒤집힘', x.flips + '곳') + cell('긴 음 흔들림', x.sustain.notes ? '±' + val(x.sustain.pitchSdCents, ' cent') : '—') +
      (R.resonance ? cell('2–4 kHz', val(x.ratioDb, ' dB')) + cell('중심', val(x.centroidHz, ' Hz', 0)) + cell('배음 대 잡음', val(x.hnrDb, ' dB')) : '') + '</dl></div>';
  }).join('') + '</div>';
}
function takeCard(s, role, label) {
  const m = s.items.find(x => x.id === s[role]), c = cleanOf(m), r = results.get(m.id);
  return '<section class="vp-card vp-take" data-vp-take="' + role + '"><div class="vp-take-head"><span class="vp-role">' + label + '</span><strong>' + esc(M.label(m)) + '</strong></div>' +
    '<p class="vp-meta">' + esc([day(m), '목소리 ' + Math.round(r.result.voicedSeconds) + '초', r.cut ? '앞 ' + MAX_SECONDS / 60 + '분만 쟀어요' : ''].filter(Boolean).join(' · ')) + '</p>' +
    (c.clean ? '' : '<p class="vp-unclean" data-vp-unclean><i class="ph ph-info" aria-hidden="true"></i><span>' + esc(P.UNCLEAN_NOTE) + '</span></p>') +
    '<div data-vp-player="' + role + '"></div><p class="vp-muted" data-vp-playing="' + role + '" role="status"></p></section>';
}
function resultsHtml(s) {
  const ma = s.items.find(x => x.id === s.a), mb = s.items.find(x => x.id === s.b);
  if (!ma || !mb || !results.has(ma.id) || !results.has(mb.id)) return '';
  const ca = cleanOf(ma), cb = cleanOf(mb), A = P.gate(results.get(ma.id).result, ca.clean), B = P.gate(results.get(mb.id).result, cb.clean);
  const none = [A.voicedSeconds ? '' : '기준', B.voicedSeconds ? '' : '비교'].filter(Boolean);
  return '<div class="vp-results" data-vp-results><div class="vp-takes">' + takeCard(s, 'a', '기준') + takeCard(s, 'b', '비교') + '</div>' +
    (none.length ? '<p class="vp-unclean" data-vp-novoice><i class="ph ph-microphone-slash" aria-hidden="true"></i><span>' + none.join('·') + ' 녹음에서 목소리를 찾지 못했어요. 반주만 있거나 목소리가 작게 녹음됐을 수 있어요.</span></p>' : '') +
    (!ca.clean || !cb.clean ? '<p class="vp-unclean" data-vp-unclean-all><i class="ph ph-info" aria-hidden="true"></i><span>' + esc(P.UNCLEAN_NOTE) + '. 음높이로 재는 전환·이어짐만 보여 드려요. 목소리만 들어 있는 녹음이라면 위에서 표시해 주세요.</span></p>' : '') +
    rowsHtml(s, A, B) +
    '<section class="vp-card" data-vp-zone-card><details><summary>음역별로 보기 <i class="ph ph-caret-down" aria-hidden="true"></i></summary><p class="vp-muted">녹음마다 부른 음의 범위를 셋으로 나눠 봤어요. 소리가 ' + P.THRESHOLDS.MIN_ZONE_SECONDS + '초보다 적은 구간은 표본 부족으로 두고 비교하지 않아요.</p>' + zonesHtml('기준', A) + zonesHtml('비교', B) + '</details></section>' +
    '<section class="vp-card vp-diag"><button type="button" class="btn sm secondary" data-vp-diagnosis><i class="ph ph-file-arrow-down" aria-hidden="true"></i> 진단 파일 저장</button>' +
    '<p class="vp-muted">두 녹음의 측정 숫자(구간별·반음별 값, 잰 소리의 길이, 반주 여부와 그 이유, 분석 버전과 신뢰도, 녹음 길이, 쓴 기준값)와 녹음한 달만 담아요. 제목·곡 이름·파일 이름·날짜(일)·음성은 담지 않아요.</p></section>' +
    '<p class="vp-muted vp-foot">시험판이에요. 여기 쓰인 기준값은 첫 어림값이고, 선생님이 듣는 것과 맞는지는 아직 확인하지 않았어요. 점수나 판정이 아니에요.</p></div>';
}
function draw(s) {
  if (s.dead) return;
  s.players?.forEach(p => p.destroy?.()); s.players = new Map();
  const keep = document.scrollingElement?.scrollTop ?? 0;
  s.host.innerHTML = noteBanner() + '<div class="vp-song"><strong>' + esc(s.song.title) + '</strong>' + trial + '</div><div class="vp-cols">' + picker(s) + resultsHtml(s) + '</div>';
  if (document.scrollingElement) document.scrollingElement.scrollTop = keep;
  bind(s);
}
function paintProgress(s) {
  const stage = s.host.querySelector('[data-vp-stage]'), bar = s.host.querySelector('[data-vp-bar]');
  if (stage) stage.textContent = s.stage || '';
  if (bar) { const pct = Math.round((s.progress || 0) * 100); bar.style.width = pct + '%'; bar.parentElement.setAttribute('aria-valuenow', String(pct)); }
}
async function run(s) {
  if (s.running) return;
  const todo = [['기준', s.a], ['비교', s.b]].filter(([, id], i, all) => id && all.findIndex(x => x[1] === id) === i);
  s.running = true; s.status = ''; s.progress = 0; s.stage = '준비 중…';
  s.abort = new AbortController();
  draw(s);
  const timing = [];
  try {
    for (const [i, [label, id]] of todo.entries()) {
      const item = s.items.find(x => x.id === id);
      const out = await measure(s, item, (text, p) => { if (s.dead) return; s.stage = label + ' 녹음 (' + (i + 1) + '/' + todo.length + ') · ' + text; s.progress = (i + p) / todo.length; paintProgress(s); });
      if (s.dead) return;
      results.set(id, out); timing.push(out.ms);
    }
    s.status = '다 쟀어요.';
    s.lastTiming = timing;
  } catch (error) {
    if (s.dead) return;
    s.status = error?.name === 'AbortError' ? '그만뒀어요. 다시 재려면 흔적 재기를 눌러 주세요.' : '재지 못했어요: ' + String(error?.message || error);
  } finally { if (!s.dead) { s.running = false; s.abort = null; s.worker = null; draw(s); } }
}
function bind(s) {
  const host = s.host, q = sel => host.querySelector(sel);
  host.querySelectorAll('[data-vp-pick]').forEach(sel => sel.onchange = () => { s[sel.dataset.vpPick] = sel.value; s.defaulted = ''; s.status = ''; draw(s); host.querySelector('[data-vp-pick="' + sel.dataset.vpPick + '"]')?.focus({preventScroll:true}); });
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
  const runButton = q('[data-vp-run]'); if (runButton) runButton.onclick = () => run(s);
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
/** Numbers only: see P.diagnosis. Dates are cut to the month before they reach the file. */
function diagnosisOf(s) {
  const take = (role, id) => { const m = s.items.find(x => x.id === id), r = results.get(id); return {role, date:P.monthOf(M.dateOf(m)), result:r.result, clean:cleanOf(m), stored:analysisOf(m), reliable:reliable(m), guide:r.guide}; };
  const out = P.diagnosis([take('base', s.a), take('comp', s.b)], {generatedMonth:V.today().slice(0, 7)});
  out.takes.forEach((t, i) => { const r = results.get(i ? s.b : s.a); t.readUpToSeconds = r.cut ? MAX_SECONDS : null; t.computeMs = r.ms ?? null; });
  return out;
}
V.voicePathDiagnosis = () => current && results.has(current.a) && results.has(current.b) ? diagnosisOf(current) : null;   // for tests

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
V.route('voice-path', {title:'소리 길 흔적', back:true, tab:'growth', noAutoRefresh:true,
  render:() => '<div class="vp" data-vp><p class="vp-muted" role="status">녹음을 불러오는 중…</p></div>',
  async mount(main, r) {
    leave(); const my = ++serial, host = main.querySelector('[data-vp]'), song = V.song(r.params[0]);
    if (!song) { await songList(host, my); return; }
    const items = await takesOf(song);
    if (my !== serial || !host.isConnected) return;
    const d = defaults(song, items, r.query);
    current = {host, song, items, a:d.a, b:d.b, defaulted:d.why, running:false, dead:false, players:new Map()};
    draw(current);
  },
  leave
});
})();
