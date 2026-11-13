/* VOCAL.zip 보컬 분석 (시험판): one recording → pitch curve over time + measurements.
 * Decoding happens here (the browser's audio decoder); the analysis runs in a Web Worker
 * (app/vocal-analysis.js) so the screen stays responsive. Nothing leaves the device.
 * The summary (no curve) is saved on the recording as `analysis` (changed field only). */
(() => {
'use strict';
const VZ = window.VZ, M = VZ.media, esc = VZ.esc;
const WORKER = 'app/vocal-analysis.js?v=6', MAX_BYTES = 250 * 1024 * 1024, MAX_SECONDS = 15 * 60;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = c => { const m = Math.round(c / 100); return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); };
let job = 0, stop = null; // stop: ends the screen's on-device analysis when the screen is left

/** Mono samples of a recording, decoded by the browser. */
async function decode(item, onStage, signal) {
  onStage('파일 불러오는 중…');
  const src = await M.src(item);
  let bytes;
  try { const res = await fetch(src.url, signal ? {signal} : undefined); if (!res.ok) throw Error('파일을 받지 못했어요 (' + res.status + ').'); bytes = await res.arrayBuffer(); }
  finally { if (src.revoke) URL.revokeObjectURL(src.url); }
  if (bytes.byteLength > MAX_BYTES) throw Error('파일이 너무 커요. 250MB 이하 녹음만 분석할 수 있어요.');
  onStage('소리 꺼내는 중…');
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Ctx) throw Error('이 브라우저는 오디오 분석을 지원하지 않아요.');
  // Decode straight to 8 kHz (the analyzer's rate): less memory on the phone. Older engines refuse low rates.
  let ctx = null; for (const rate of [8000, 16000, 44100]) { try { ctx = new Ctx(1, rate, rate); break; } catch {} }
  if (!ctx) throw Error('이 브라우저는 오디오 분석을 지원하지 않아요.');
  const buf = await new Promise((resolve, reject) => { const p = ctx.decodeAudioData(bytes, resolve, reject); if (p?.then) p.then(resolve, reject); });
  const n = Math.min(buf.length, Math.floor(MAX_SECONDS * buf.sampleRate)), mono = new Float32Array(n);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < n; i++) mono[i] += d[i] / buf.numberOfChannels; }
  return {samples:mono, sampleRate:buf.sampleRate, cut:buf.length > n};
}
function runWorker(samples, sampleRate, onProgress, {voiceOnly = false, signal} = {}) {
  return new Promise((resolve, reject) => {
    if(signal?.aborted){reject(new DOMException('분석 중단','AbortError'));return;}
    let w;
    try { w = new Worker(WORKER); } catch (e) { reject(e); return; }
    const cleanup=()=>{signal?.removeEventListener('abort',abort);w.terminate()};
    const abort=()=>{cleanup();reject(new DOMException('분석 중단','AbortError'))};
    signal?.addEventListener('abort',abort,{once:true});
    w.onmessage = e => { const d = e.data; if (d.progress != null) onProgress(d.progress); else { cleanup(); d.error ? reject(Error(d.error)) : resolve(d.result); } };
    w.onerror = e => { cleanup(); reject(Error(e.message || '분석 중 오류가 났어요.')); };
    w.postMessage({samples, sampleRate, voiceOnly}, [samples.buffer]);
  });
}

/** Analyze raw mono samples in the worker (used by the song finder to locate the singing). The array is transferred. */
VZ.analyzeSamples = (samples, sampleRate, onProgress = () => {}, options = {}) => runWorker(samples, sampleRate, onProgress, options);
/** The summary kept with a recording (no curve: it would make every library row heavy). */
const HISTORY_KEEP = 5; // earlier summaries kept on the recording when it is analysed again (newest last)
const summaryOf = (result, previous) => {
  const history = Array.isArray(previous?.history) ? previous.history.slice() : [];
  if(previous?.v){const {history:ignored,...saved}=previous;history.push(saved);}
  return {v:result.version,at:Date.now(),seconds:result.seconds,metrics:result.metrics,confidence:result.confidence,
    ...(history.length?{history:history.slice(-HISTORY_KEEP)}:{}),scope:{kind:'whole-recording',cut:!!result.cut}};
};
VZ.analysisSummary = summaryOf;
/** A saved result that is not analysed over: the current analyzer version with the detail rows. The same rule as
 * the server worker (worker/analysis-worker.mjs isCurrentAnalysis). */
VZ.analysisCurrent = (a, version = 2) => !!a && Number(a.v) >= version && !!a.metrics && Object.prototype.hasOwnProperty.call(a.metrics, 'phrases');
/** Decode + analyze one recording and keep the summary on it (only the `analysis` field changes).
 * Used by the analysis screen and the song page's "analyze all". Returns the full result (with curve).
 * signal (AbortSignal) stops the download and the worker; nothing is saved then. */
VZ.analyzeRecording = async (item, {onStage = () => {}, onProgress = () => {}, save = true, signal} = {}) => {
  const {samples, sampleRate, cut} = await decode(item, onStage, signal);
  onStage('목소리 찾는 중… (반주와 구분)');
  const result = await runWorker(samples, sampleRate, onProgress, {signal});
  result.cut = cut; result.summary = summaryOf(result, item.analysis);
  if (save) { await M.update(item, {analysis:result.summary}, {quiet:true}); window.dispatchEvent(new CustomEvent('vzip:analysis-saved', {detail:{id:item.id, analysis:result.summary}})); }
  return result;
};
/** Whether a saved summary is trustworthy enough to chart (enough singing, voice not drowned by the MR). */
VZ.analysisReliable = a => !!a?.metrics?.voicedSeconds && a.metrics.voicedSeconds >= 10 && (a.confidence?.voiceOverMrDb == null || a.confidence.voiceOverMrDb >= 3) && (a.v < 2 || Number(a.confidence?.pitchConfidence) >= .8);
VZ.analysisComparable = (a,b) => !!a && !!b && a.v === b.v && VZ.analysisReliable(a) && VZ.analysisReliable(b);

/* ---------- drawing ---------- */
const PX_PER_S = 36, H = 200, PAD = 30;
function chart(r) {
  const pts = r.curve, secs = pts.length / r.fps, w = Math.max(320, Math.round(secs * PX_PER_S));
  const vals = pts.filter(v => v != null);
  if (!vals.length) return '';
  const lo = Math.floor((Math.min(...vals) - 150) / 100) * 100, hi = Math.ceil((Math.max(...vals) + 150) / 100) * 100;
  const y = c => PAD / 2 + (hi - c) / (hi - lo) * (H - PAD), x = t => t / secs * w;
  let grid = '';
  for (let c = lo; c <= hi; c += 100) {
    const isC = ((Math.round(c / 100) % 12) + 12) % 12 === 0;
    grid += '<line x1="0" x2="' + w + '" y1="' + y(c).toFixed(1) + '" y2="' + y(c).toFixed(1) + '" class="' + (isC ? 'g-c' : 'g') + '"/>';
  }
  let d = '', open = false;
  pts.forEach((v, i) => { if (v == null) { open = false; return; } d += (open ? 'L' : 'M') + x(i / r.fps).toFixed(1) + ' ' + y(v).toFixed(1); open = true; });
  const dots = r.notes.map(n => { const cls = Math.abs(n.dev) <= 20 ? 'ok' : Math.abs(n.dev) <= 35 ? 'warn' : 'bad'; return '<line x1="' + x(n.t).toFixed(1) + '" x2="' + x(n.t + n.dur).toFixed(1) + '" y1="' + y(n.cents).toFixed(1) + '" y2="' + y(n.cents).toFixed(1) + '" class="n ' + cls + '"><title>' + noteName(n.cents) + ' ' + (n.dev > 0 ? '+' : '') + n.dev + ' cent</title></line>'; }).join('');
  // Note names stay put on the left while the curve scrolls.
  let labels = '';
  for (let c = lo; c <= hi; c += 100) if (((Math.round(c / 100) % 12) + 12) % 12 === 0 || c === lo + 100 || c === hi - 100) labels += '<span style="top:' + (y(c) - 7).toFixed(0) + 'px">' + noteName(c) + '</span>';
  return '<div class="ana-chart"><div class="ana-labels">' + labels + '</div><div class="ana-scroll" data-scroll><svg width="' + w + '" height="' + H + '" viewBox="0 0 ' + w + ' ' + H + '" role="img" aria-label="시간에 따른 음높이 곡선">' + grid + '<path d="' + d + '" class="curve"/>' + dots + '<line class="head" data-head x1="0" x2="0" y1="0" y2="' + H + '"/></svg></div></div>' +
    '<p class="small muted ana-legend"><span><span class="k ok"></span>±20</span><span><span class="k warn"></span>±35</span><span><span class="k bad"></span>그 밖 (cent)</span><span>· 곡선을 누르면 그 위치부터 재생</span></p>';
}
const HELP_KEY = {'음정 정확도':'into', '지속음 흔들림':'wob', '비브라토':'vib', '음역':'range', '프레이즈 길이':'phr'};
const card = (icon, title, value, sub, help, extra = '') => '<div class="card ana-card"><div class="ana-k"><i class="ph ph-' + icon + '"></i>' + title + (HELP_KEY[title] && VZ.metricInfo ? VZ.metricInfo(HELP_KEY[title], title) : '') + '</div><div class="ana-v">' + value + '</div>' + (sub ? '<div class="small">' + sub + '</div>' : '') + (help ? '<div class="small muted">' + help + '</div>' : '') + extra + '</div>';
/** "Listen" buttons for where a highest note happened (seconds from the start of the recording).
 * Without a player (the sheet) the positions are still shown as text. */
const clock = t => VZ.clock ? VZ.clock(t) : Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
VZ.analysisMoments = (point, label, playable) => {
  const times = (point?.times?.length ? point.times : point && Number.isFinite(point.t) ? [{t:point.t}] : []).filter(x => Number.isFinite(x?.t));
  if (!times.length) return '';
  return '<div class="ana-evidence">' + times.map(x => playable
    ? '<button type="button" class="chip ana-play-at" data-seek-at="' + x.t + '" aria-label="' + esc(label + ' ' + clock(x.t) + ' 부분 듣기') + '"><i class="ph-fill ph-play"></i> ' + clock(x.t) + '</button>'
    : '<span class="small muted">' + clock(x.t) + '</span>').join('') + '</div>';
};
/** Play a recording from a little before a moment, so the note is heard in context. play() stays inside
 * the tap (iPhone Safari); when the file is not loaded yet the seek waits for its metadata. */
VZ.analysisPrerollSeconds = 1;
VZ.analysisPlayAt = (player, t) => {
  const el = player?.el; if (!el || !Number.isFinite(Number(t))) return;
  const at = Math.max(0, Number(t) - VZ.analysisPrerollSeconds), go = () => { try { el.currentTime = at; } catch {} };
  if (el.readyState >= 1) go(); else el.addEventListener('loadedmetadata', go, {once:true});
  if (el.paused) player.play();
};
function cards(r, playable = false) {
  const m = r.metrics, out = [];
  const i = m.intonation;
  if (i) out.push(card('target', '음정 정확도', '평균 ±' + i.meanAbsCents + ' cent', '±20 cent 안 ' + i.within20 + '% · 지속음 ' + i.notes + '개', '반음 = 100 cent · 기준 ' + (r.confidence.tuningFrom === 'mr' ? 'MR 튜닝(' + (i.tuningCents > 0 ? '+' : '') + i.tuningCents + ')' : 'A4 440Hz')));
  const s = m.stability;
  if (s) out.push(card('wave-sine', '지속음 흔들림', '±' + s.wobbleCents + ' cent', '0.5초 넘는 음 ' + s.notes + '개', '비브라토를 뺀 흔들림 · 작을수록 안정'));
  const v = m.vibrato;
  if (v) out.push(card('waveform', '비브라토', v.rateHz ? '초당 ' + v.rateHz + '회' : '거의 없음', (v.rateHz ? '폭 ±' + v.extentCents + ' cent · ' : '') + '긴 음 ' + v.notes + '개 중 ' + v.share + '%' + (v.regularity != null ? ' · 규칙성 ' + Math.round(v.regularity * 100) + '%' : ''), '흔히 초당 5~7회 · 폭 ±20~60'));
  const g = m.range;
  if (g) {
    out.push(card('arrows-vertical','음역',g.validHigh ? '유효 최고 '+esc(g.validHigh.note) : '유효 최고 판정 보류',
      '안정 최고 '+esc(g.stableHigh?.note||'판정 보류')+' · 주 가창 '+esc(g.main?.low||'—')+' ~ '+esc(g.main?.high||'—'),
      '유효 0.2초 이상 · 안정 0.5초 이상과 흔들림 조건 · 신뢰도 함께 확인',
      g.validHigh ? '<div class="small" style="margin-top:6px">유효 최고 '+esc(g.validHigh.note)+' 위치 · 눌러서 직접 들어 보세요</div>'+VZ.analysisMoments(g.validHigh,'유효 최고음',playable) : ''));
    out.push(card('waveform','순간 검출 최고',esc(g.instantaneous?.note||'—'),'한 순간(10ms)의 최고값이라 미끄러짐·오검출이 포함될 수 있어요.','실력 평가와 성장 비교에는 사용하지 않아요.',
      VZ.analysisMoments(g.instantaneous,'순간 최고음',playable)));
  }
  const b = m.breath;
  if (b) out.push(card('wind', '프레이즈 길이', '평균 ' + b.medianPhrase + '초', '최장 ' + b.longestPhrase + '초 · ' + b.phrases + '개' + (b.medianGap != null ? ' · 숨 ' + b.medianGap + '초' : ''), '쉬지 않고 이어 부른 길이'));
  return out.join('');
}
function confidence(r) {
  const c = r.confidence;
  if (c.pitchConfidence < .8) return '<div class="ana-note warn"><span>피치 신뢰도가 낮아 성장 판정을 보류해요. 원본을 들으며 확인해 주세요.</span></div>';
  if (c.voiceOverMrDb == null) return '<p class="small muted">반주만 따로 들리는 구간이 없어서 목소리와 반주의 크기 차이는 재지 못했어요.</p>';
  if (c.voiceOverMrDb < 3) return '<div class="ana-note warn"><i class="ph ph-warning"></i><span>목소리가 반주보다 크게 녹음되지 않았어요. 반주를 목소리로 잘못 읽었을 수 있으니 곡선이 노래와 맞는지 들으며 확인해 주세요.</span></div>';
  const ok = c.voiceOverMrDb >= 10;
  return '<div class="ana-note ' + (ok ? 'ok' : 'warn') + '"><i class="ph ph-' + (ok ? 'check-circle' : 'warning') + '"></i><span>목소리가 반주보다 약 ' + Math.round(c.voiceOverMrDb) + 'dB 커요. ' + (ok ? '크기 차이만으로 보컬 분리가 확인되지는 않아요.' : '반주가 커서 일부 구간을 목소리로 잘못 읽었을 수 있어요. 곡선이 노래와 맞는지 들으며 확인해 주세요.') + '</span></div>';
}

/** Reuse the existing whole-recording pitch graph in the vocal-lab point popup.
 * The saved measurement summary has no time-series curve, so regenerate it locally on demand,
 * without overwriting the previous analysis or making a paid STT request. */
VZ.openRecordingAnalysisSheet = item => {
  if(!item)return;
  let alive=true;
  VZ.sheet({
    title:(VZ.dateLabel(M.dateOf(item))||'날짜 없음')+' · 녹음 전체 그래프',
    variant:'page',
    body:'<div class="ana-sheet-detail"><p class="small muted">'+esc(M.label(item))+'</p><p data-ana-sheet-status role="status">전체 녹음의 음높이 곡선을 불러오는 중…</p><div data-ana-sheet-output></div></div>',
    onClose:()=>{alive=false;},
    onMount:async el=>{
      const status=el.querySelector('[data-ana-sheet-status]'),out=el.querySelector('[data-ana-sheet-output]');
      try{
        // Reuse the same renderer that powers #/analysis/:id and keep its result scoped to this sheet.
        const result=await VZ.analyzeRecording(item,{save:false,onStage:text=>{if(alive&&el.isConnected)status.textContent=text;}});
        if(!alive||!el.isConnected)return;
        if(!result.metrics?.voicedSeconds){
          status.textContent='이 녹음에서는 분석할 목소리가 충분히 검출되지 않았어요.';
          return;
        }
        status.textContent='녹음 전체 · '+VZ.clock(result.seconds||item.durationSeconds||0);
        out.innerHTML=chart(result)+confidence(result)+(result.cut?'<p class="small muted">앞 15분만 분석했어요.</p>':'')+
          '<div class="ana-grid">'+cards(result)+'</div>'+
          '<p class="small muted">그래프는 기존 보컬 분석 화면과 같은 방식으로 이 기기에서 계산했어요. 저장된 녹음이나 측정 결과는 변경하지 않았어요.</p>';
      }catch(error){if(alive&&el.isConnected)status.textContent='전체 그래프를 불러오지 못했어요: '+String(error?.message||error);}
    }
  });
};
/* ---------- view ---------- */
VZ.route('analysis', {title:'보컬 분석', back:true, tab:'growth', noAutoRefresh:true,
  render() { return '<div data-ana><div class="empty compact"><span class="muted">불러오는 중…</span></div></div>'; },
  async mount(main, r) {
    const id = r.params[0], my = ++job, host = main.querySelector('[data-ana]');
    stop?.abort(); const ctl = stop = typeof AbortController === 'function' ? new AbortController() : null;
    const alive = () => my === job && document.body.contains(host);
    const allItems = await M.list().catch(() => []), item = allItems.find(m => m.id === id);
    if (!alive()) return;
    if (!item) { host.innerHTML = '<div class="empty"><i class="ph ph-question"></i><p>녹음을 찾지 못했어요.</p></div>'; return; }
    const song = VZ.songTitle(item.songId);
    const selectedIds = (r.query.get('selected') || '').split(',').filter(Boolean);
    const allowed = new Set(selectedIds);
    const chosen = allItems.filter(m => allowed.has(String(m.id)) && m.songId === item.songId);
    const chosenParam = chosen.map(m => m.id).join(',');
    const selector = chosen.length > 1 ? '<div class="vz-analysis-selected"><div class="small muted">선택한 녹음 ' + chosen.length + '개</div><div class="vz-analysis-selected-scroll">' + chosen.map(m => '<a href="#/analysis/' + encodeURIComponent(m.id) + '?selected=' + encodeURIComponent(chosenParam) + '" aria-current="' + (m.id === id ? 'true' : 'false') + '">' + esc(M.label(m)) + '</a>').join('') + '</div></div>' : '';
    host.innerHTML = selector + '<div class="card"><div class="item-title">' + esc(M.label(item)) + '</div><div class="small muted">' + esc([VZ.dateLabel(M.dateOf(item)), song].filter(Boolean).join(' · ')) + '</div><div data-p style="margin-top:10px"></div></div>' +
      '<div data-out><div class="card"><p data-stage>준비 중…</p><div class="ana-bar"><span data-bar style="width:0%"></span></div><p class="small muted">이 기기 안에서 분석해요. 파일이 밖으로 나가지 않아요. 5분짜리 곡은 보통 10~30초 걸려요.</p></div></div>';
    const player = M.player(host.querySelector('[data-p]'), item, {prefetch:true});
    const out = host.querySelector('[data-out]'), stage = t => { const s = out.querySelector('[data-stage]'); if (s) s.textContent = t; }, bar = p => { const b = out.querySelector('[data-bar]'); if (b) b.style.width = Math.round(p * 100) + '%'; };
    let result;
    try {
      result = await VZ.analyzeRecording(item, {onStage:stage, onProgress:p => { if (alive()) bar(p); }, save:false, signal:ctl?.signal});
    } catch (e) {
      if (alive()) out.innerHTML = '<div class="ana-note warn"><i class="ph ph-warning"></i><span>분석하지 못했어요: ' + esc(e.message) + '</span></div>';
      return;
    }
    if (!alive()) return;
    if (!result.metrics.voicedSeconds) {
      out.innerHTML = '<div class="empty"><i class="ph ph-microphone-slash"></i><p>목소리를 찾지 못했어요.</p><p class="small muted">반주만 있거나, 목소리가 반주보다 작게 녹음된 파일일 수 있어요.</p></div>';
      return;
    }
    out.innerHTML = chart(result) + confidence(result) + (result.cut ? '<p class="small muted">앞 15분만 분석했어요.</p>' : '') +
      '<div class="ana-grid">' + cards(result, true) + '</div>' +
      '<p class="small muted" style="margin-top:12px">시험판이에요. 점수가 아니라 측정값이고, 같은 곡의 이전 녹음과 비교할 때 가장 의미 있어요. 음정 정확도는 맞는 음을 불렀는지가 아니라 낸 음이 반음 칸에 얼마나 정확히 맞았는지예요. 음원만으로 발성의 질이나 호흡법은 판단하지 않아요.</p><p class="small muted" data-saved></p>';
    // Playhead follows playback; tapping the curve seeks there.
    const scroll = out.querySelector('[data-scroll]'), head = out.querySelector('[data-head]'), svg = scroll?.querySelector('svg');
    if (svg) {
      const secs = result.curve.length / result.fps, w = +svg.getAttribute('width');
      const paint = () => { const x = (player.el.currentTime || 0) / secs * w; head.setAttribute('x1', x); head.setAttribute('x2', x); if (!player.el.paused && (x < scroll.scrollLeft || x > scroll.scrollLeft + scroll.clientWidth - 40)) scroll.scrollLeft = x - 40; };
      player.el.addEventListener('timeupdate', paint);
      // Start where the singing starts (intros are often long).
      const first = result.curve.findIndex(v => v != null); if (first > 0) scroll.scrollLeft = Math.max(0, first / result.fps / secs * w - 20);
      svg.addEventListener('click', e => { const box = svg.getBoundingClientRect(), t = (e.clientX - box.left) / box.width * secs; player.el.currentTime = Math.max(0, t); paint(); if (player.el.paused) player.play(); });
    }
    // Evidence: play the recording from just before the reported highest note.
    out.addEventListener('click', e => {
      const b = e.target.closest('[data-seek-at]'); if (b) VZ.analysisPlayAt(player, b.dataset.seekAt);
    });
    // Keep the summary with the recording (only this field changes; other devices' edits stay) — but never over a
    // current saved result (the server's included): that one changes only when the person asks for it.
    const note = out.querySelector('[data-saved]');
    const keep = async previous => {
      const summary = summaryOf(result, previous);
      try { await M.update(item, {analysis:summary}, {quiet:true}); window.dispatchEvent(new CustomEvent('vzip:analysis-saved', {detail:{id:item.id, analysis:summary}})); if (alive()) note.textContent = '분석 v' + result.version + '를 저장했어요.' + (previous?.v ? ' 이전 결과는 분석 이력에 보존했어요.' : ''); return true; }
      catch (e) { if (alive()) note.textContent = '결과를 저장하지 못했어요: ' + e.message; return false; }
    };
    // The result saved right now (the server may have saved one while this screen was analysing).
    const saved = async () => ((await M.list().catch(() => [])).find(m => m.id === id) || item).analysis;
    const before = await saved();
    if (!alive()) return;
    if (!VZ.analysisCurrent(before, result.version)) { await keep(before); return; }
    note.textContent = '저장된 분석 결과는 그대로 두었어요. 위 그래프와 값은 이 기기에서 방금 계산해 보여 드린 거예요.';
    note.insertAdjacentHTML('afterend', '<div data-ana-redo><button type="button" class="btn sm ghost" data-ana-reanalyze><i class="ph ph-arrows-clockwise" aria-hidden="true"></i> 다시 분석해서 저장</button>' +
      '<p class="small muted" style="margin-top:6px">누르면 저장된 결과를 이 기기의 결과로 바꿔요. 이전 결과는 이력으로 남겨요.</p></div>');
    const redo = out.querySelector('[data-ana-reanalyze]');
    redo.onclick = async () => {
      redo.disabled = true;
      if (await keep(await saved())) out.querySelector('[data-ana-redo]')?.remove(); else redo.disabled = false;
    };
  },
  leave() { job++; stop?.abort(); stop = null; }
});
})();
