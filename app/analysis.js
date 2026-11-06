/* VOCAL.zip 보컬 분석 (시험판): one recording → pitch curve over time + measurements.
 * Decoding happens here (the browser's audio decoder); the analysis runs in a Web Worker
 * (app/vocal-analysis.js) so the screen stays responsive. Nothing leaves the device.
 * The summary (no curve) is saved on the recording as `analysis` (changed field only). */
(() => {
'use strict';
const VZ = window.VZ, M = VZ.media, esc = VZ.esc;
const WORKER = 'app/vocal-analysis.js?v=1', MAX_BYTES = 250 * 1024 * 1024, MAX_SECONDS = 15 * 60;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = c => { const m = Math.round(c / 100); return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); };
let job = 0;

/** Mono samples of a recording, decoded by the browser. */
async function decode(item, onStage) {
  onStage('파일 불러오는 중…');
  const src = await M.src(item);
  let bytes;
  try { const res = await fetch(src.url); if (!res.ok) throw Error('파일을 받지 못했어요 (' + res.status + ').'); bytes = await res.arrayBuffer(); }
  finally { if (src.revoke) URL.revokeObjectURL(src.url); }
  if (bytes.byteLength > MAX_BYTES) throw Error('파일이 너무 커요. 250MB 이하 녹음만 분석할 수 있어요.');
  onStage('소리 꺼내는 중…');
  const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  if (!Ctx) throw Error('이 브라우저는 오디오 분석을 지원하지 않아요.');
  let ctx; try { ctx = new Ctx(1, 16000, 16000); } catch { ctx = new Ctx(1, 44100, 44100); }
  const buf = await new Promise((resolve, reject) => { const p = ctx.decodeAudioData(bytes, resolve, reject); if (p?.then) p.then(resolve, reject); });
  const n = Math.min(buf.length, Math.floor(MAX_SECONDS * buf.sampleRate)), mono = new Float32Array(n);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) { const d = buf.getChannelData(ch); for (let i = 0; i < n; i++) mono[i] += d[i] / buf.numberOfChannels; }
  return {samples:mono, sampleRate:buf.sampleRate, cut:buf.length > n};
}
function runWorker(samples, sampleRate, onProgress) {
  return new Promise((resolve, reject) => {
    let w;
    try { w = new Worker(WORKER); } catch (e) { reject(e); return; }
    w.onmessage = e => { const d = e.data; if (d.progress != null) onProgress(d.progress); else { w.terminate(); d.error ? reject(Error(d.error)) : resolve(d.result); } };
    w.onerror = e => { w.terminate(); reject(Error(e.message || '분석 중 오류가 났어요.')); };
    w.postMessage({samples, sampleRate}, [samples.buffer]);
  });
}

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
const card = (icon, title, value, sub, help) => '<div class="card ana-card"><div class="ana-k"><i class="ph ph-' + icon + '"></i>' + title + '</div><div class="ana-v">' + value + '</div>' + (sub ? '<div class="small">' + sub + '</div>' : '') + (help ? '<div class="small muted">' + help + '</div>' : '') + '</div>';
function cards(r) {
  const m = r.metrics, out = [];
  const i = m.intonation;
  if (i) out.push(card('target', '음정 정확도', '평균 ±' + i.meanAbsCents + ' cent', '±20 cent 안 ' + i.within20 + '% · 지속음 ' + i.notes + '개', '반음 = 100 cent · 기준 ' + (r.confidence.tuningFrom === 'mr' ? 'MR 튜닝(' + (i.tuningCents > 0 ? '+' : '') + i.tuningCents + ')' : 'A4 440Hz')));
  const s = m.stability;
  if (s) out.push(card('wave-sine', '지속음 흔들림', '±' + s.wobbleCents + ' cent', '0.5초 넘는 음 ' + s.notes + '개', '비브라토를 뺀 흔들림 · 작을수록 안정'));
  const v = m.vibrato;
  if (v) out.push(card('waveform', '비브라토', v.rateHz ? '초당 ' + v.rateHz + '회' : '거의 없음', (v.rateHz ? '폭 ±' + v.extentCents + ' cent · ' : '') + '긴 음 ' + v.notes + '개 중 ' + v.share + '%' + (v.regularity != null ? ' · 규칙성 ' + Math.round(v.regularity * 100) + '%' : ''), '흔히 초당 5~7회 · 폭 ±20~60'));
  const g = m.range;
  if (g) out.push(card('arrows-vertical', '음역', esc(g.low) + ' ~ ' + esc(g.high), '순간 최고 ' + esc(g.peak), '0.3초 넘게 머문 음 기준'));
  const b = m.breath;
  if (b) out.push(card('wind', '프레이즈 길이', '평균 ' + b.medianPhrase + '초', '최장 ' + b.longestPhrase + '초 · ' + b.phrases + '개' + (b.medianGap != null ? ' · 숨 ' + b.medianGap + '초' : ''), '쉬지 않고 이어 부른 길이'));
  return out.join('');
}
function confidence(r) {
  const c = r.confidence;
  if (c.voiceOverMrDb == null) return '<p class="small muted">반주만 따로 들리는 구간이 없어서 목소리와 반주의 크기 차이는 재지 못했어요.</p>';
  if (c.voiceOverMrDb < 3) return '<div class="ana-note warn"><i class="ph ph-warning"></i><span>목소리가 반주보다 크게 녹음되지 않았어요. 반주를 목소리로 잘못 읽었을 수 있으니 곡선이 노래와 맞는지 들으며 확인해 주세요.</span></div>';
  const ok = c.voiceOverMrDb >= 10;
  return '<div class="ana-note ' + (ok ? 'ok' : 'warn') + '"><i class="ph ph-' + (ok ? 'check-circle' : 'warning') + '"></i><span>목소리가 반주보다 약 ' + Math.round(c.voiceOverMrDb) + 'dB 커요. ' + (ok ? '반주와 잘 구분됐어요.' : '반주가 커서 일부 구간을 목소리로 잘못 읽었을 수 있어요. 곡선이 노래와 맞는지 들으며 확인해 주세요.') + '</span></div>';
}

/* ---------- view ---------- */
VZ.route('analysis', {title:'보컬 분석', back:true, tab:'growth', noAutoRefresh:true,
  render() { return '<div data-ana><div class="empty compact"><span class="muted">불러오는 중…</span></div></div>'; },
  async mount(main, r) {
    const id = r.params[0], my = ++job, host = main.querySelector('[data-ana]');
    const alive = () => my === job && document.body.contains(host);
    const item = (await M.list().catch(() => [])).find(m => m.id === id);
    if (!alive()) return;
    if (!item) { host.innerHTML = '<div class="empty"><i class="ph ph-question"></i><p>녹음을 찾지 못했어요.</p></div>'; return; }
    const song = VZ.songTitle(item.songId);
    host.innerHTML = '<div class="card"><div class="item-title">' + esc(M.label(item)) + '</div><div class="small muted">' + esc([VZ.dateLabel(M.dateOf(item)), song].filter(Boolean).join(' · ')) + '</div><div data-p style="margin-top:10px"></div></div>' +
      '<div data-out><div class="card"><p data-stage>준비 중…</p><div class="ana-bar"><span data-bar style="width:0%"></span></div><p class="small muted">이 기기 안에서 분석해요. 파일이 밖으로 나가지 않아요. 5분짜리 곡은 보통 10~30초 걸려요.</p></div></div>';
    const player = M.player(host.querySelector('[data-p]'), item, {prefetch:true});
    const out = host.querySelector('[data-out]'), stage = t => { const s = out.querySelector('[data-stage]'); if (s) s.textContent = t; }, bar = p => { const b = out.querySelector('[data-bar]'); if (b) b.style.width = Math.round(p * 100) + '%'; };
    let result;
    try {
      const {samples, sampleRate, cut} = await decode(item, stage);
      if (!alive()) return;
      stage('목소리 찾는 중… (반주와 구분)');
      result = await runWorker(samples, sampleRate, p => { if (alive()) bar(p); });
      result.cut = cut;
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
      '<div class="ana-grid">' + cards(result) + '</div>' +
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
    // Keep the summary with the recording (only this field changes; other devices' edits stay).
    const summary = {v:result.version, at:Date.now(), seconds:result.seconds, metrics:result.metrics, confidence:result.confidence};
    try { await M.update(item, {analysis:summary}, {quiet:true}); if (alive()) out.querySelector('[data-saved]').textContent = '분석 결과를 이 녹음에 저장했어요.'; }
    catch (e) { if (alive()) out.querySelector('[data-saved]').textContent = '결과를 저장하지 못했어요: ' + e.message; }
  },
  leave() { job++; }
});
})();
