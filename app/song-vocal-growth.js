/* VOCAL.zip 곡별 보컬 성장 (Phase 7): the measurements saved by 보컬 분석 (app/analysis.js) for every
 * recording of one song, by recording date — so a song shows how the singing changed, not just how much
 * was practised. Recordings without a measurement can be analyzed in one go (on the device, free).
 *   VZ.songVocalGrowth(host, song, media)  — card on the song page
 *   VZ.measureTable(a, b)                  — first/latest table (also used on the 녹음 비교 page)
 * Points with too little singing or a voice drowned by the MR are drawn hollow and left out of changes. */
(() => {
'use strict';
const VZ = window.VZ, M = VZ?.media;
if (!VZ || !M) return;
const esc = VZ.esc;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = c => { const m = Math.round(c / 100); return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); };
const fresh = new Map();          // analyses saved in this session, shown before the library list refreshes
const batch = {songId:'', running:false, stop:false, done:0, total:0, failed:0, current:''};
let repaint = null;
let cmpOpen = false; // the first-vs-latest panel stays open across redraws
window.addEventListener('vzip:analysis-saved', e => {
  if (!e.detail?.id) return;
  fresh.set(e.detail.id, e.detail.analysis);
  // Redraw only when the result belongs to the song on screen (background analysis runs through every song).
  if (last?.media.some(m => m.id === e.detail.id)) { clearTimeout(repaint); repaint = setTimeout(() => paint(), 300); }
});
VZ.vocalBatchRunning = () => batch.running; // the background analyzer waits for it

/* What is measured, how to read it, and which way is "better" (+1 higher, −1 lower, 0 neither). */
const METRICS = [
  {key:'into', label:'음정 오차', unit:'cent', better:-1, get:a => a.metrics.intonation?.meanAbsCents, fmt:v => '±' + v, help:'낮을수록 음을 정확히 맞춤'},
  {key:'wob', label:'지속음 흔들림', unit:'cent', better:-1, get:a => a.metrics.stability?.wobbleCents, fmt:v => '±' + v, help:'낮을수록 안정적'},
  {key:'high', label:'최고음', unit:'', better:1, get:a => a.metrics.range?.highCents == null ? null : Math.round(a.metrics.range.highCents / 100) * 100, fmt:v => noteName(v), help:'0.3초 넘게 머문 가장 높은 음', step:100},
  {key:'phr', label:'프레이즈 길이', unit:'초', better:1, get:a => a.metrics.breath?.medianPhrase, fmt:v => v + '초', help:'쉬지 않고 이어 부른 평균 길이'}
];
const VIB = {key:'vib', label:'비브라토', unit:'%', better:0, get:a => a.metrics.vibrato?.share, fmt:v => v + '%', help:'긴 음 중 비브라토를 쓴 비율'};

const analysisOf = m => fresh.get(m.id) || m.analysis || null;
const usable = m => { const a = analysisOf(m); return a?.v === 1 && a.metrics; };
function points(media) {
  return media.filter(usable).map(m => ({m, a:analysisOf(m), date:M.dateOf(m) || '', ok:VZ.analysisReliable(analysisOf(m)), guess:m.dateSource === 'file-modified'}))
    .sort((x, y) => x.date.localeCompare(y.date) || (x.m.created || 0) - (y.m.created || 0));
}
/** Change from first to latest, worded by direction. */
function change(metric, first, last) {
  const a = metric.get(first), b = metric.get(last);
  if (a == null || b == null) return '';
  const d = Math.round((b - a) * 10) / 10;
  if (metric.step ? Math.round(d / metric.step) === 0 : Math.abs(d) < 0.5) return '<span class="vg-same">비슷함</span>';
  const amount = metric.step ? Math.abs(Math.round(d / 100)) + '반음' : Math.abs(d) + (metric.unit ? ' ' + metric.unit : '');
  if (!metric.better) return '<span class="vg-same">' + (d > 0 ? '▲ ' : '▼ ') + amount + '</span>';
  const good = Math.sign(d) === metric.better;
  return '<span class="' + (good ? 'vg-good' : 'vg-bad') + '">' + (d > 0 ? '▲ ' : '▼ ') + amount + (good ? ' 좋아짐' : ' 나빠짐') + '</span>';
}
/** A small line chart of one measurement, oldest → newest; tap a point to open that recording's analysis. */
function spark(metric, pts) {
  const rows = pts.map(p => ({p, v:metric.get(p.a)})).filter(r => r.v != null);
  if (!rows.length) return '';
  const W = 300, H = 74, P = 10, vals = rows.map(r => r.v);
  let lo = Math.min(...vals), hi = Math.max(...vals); if (hi - lo < (metric.step || 2)) { lo -= (metric.step || 2) / 2; hi += (metric.step || 2) / 2; }
  const x = i => rows.length === 1 ? W / 2 : P + i * (W - 2 * P) / (rows.length - 1), y = v => P + (hi - v) / (hi - lo) * (H - 2 * P);
  const ok = rows.map((r, i) => r.p.ok ? [x(i), y(r.v)] : null).filter(Boolean);
  const line = ok.length > 1 ? '<polyline points="' + ok.map(([a, b]) => a.toFixed(1) + ',' + b.toFixed(1)).join(' ') + '" class="vg-line"/>' : '';
  const dots = rows.map((r, i) => '<a href="#/analysis/' + encodeURIComponent(r.p.m.id) + '"><circle cx="' + x(i).toFixed(1) + '" cy="' + y(r.v).toFixed(1) + '" r="5" class="vg-dot' + (r.p.ok ? '' : ' weak') + '"><title>' + esc(VZ.dateLabel(r.p.date) + (r.p.guess ? ' (날짜 추정)' : '') + ' · ' + metric.fmt(r.v) + (r.p.ok ? '' : ' · 신뢰도 낮음')) + '</title></circle></a>').join('');
  const reliable = rows.filter(r => r.p.ok), last = reliable.at(-1) || rows.at(-1);
  return '<div class="vg-chart"><div class="vg-head"><span class="vg-label">' + metric.label + '</span><span class="vg-now">' + esc(metric.fmt(last.v)) + '</span></div>' +
    '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + esc(metric.label + ' 날짜별 변화, 최근 ' + metric.fmt(last.v)) + '">' + line + dots + '</svg>' +
    '<div class="vg-foot small muted"><span>' + esc(metric.help) + '</span>' + (reliable.length > 1 ? change(metric, reliable[0].p.a, reliable.at(-1).p.a) : '') + '</div></div>';
}
/** First vs latest measurement table for two recordings (both need a saved analysis). */
VZ.measureTable = (first, second) => {
  const a = first && analysisOf(first), b = second && analysisOf(second);
  if (!a?.metrics || !b?.metrics) return '';
  const rows = [...METRICS, VIB].map(m => { const x = m.get(a), y = m.get(b); return x == null && y == null ? '' : '<tr><th>' + m.label + '</th><td>' + (x == null ? '–' : esc(m.fmt(x))) + '</td><td>' + (y == null ? '–' : esc(m.fmt(y))) + '</td><td>' + change(m, a, b) + '</td></tr>'; }).join('');
  const weak = !VZ.analysisReliable(a) || !VZ.analysisReliable(b);
  return '<table class="vg-table"><thead><tr><th></th><th>' + esc(VZ.dateLabel(M.dateOf(first))) + '</th><th>' + esc(VZ.dateLabel(M.dateOf(second))) + '</th><th>변화</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    (weak ? '<p class="small muted">한쪽 녹음은 노래가 짧거나 반주가 커서 측정 신뢰도가 낮아요.</p>' : '');
};
/** Measurement summary saved with a comparison report (numbers only). */
VZ.measureSnapshot = item => { const a = item && analysisOf(item); return a?.metrics ? {at:a.at, reliable:VZ.analysisReliable(a), metrics:a.metrics} : null; };

async function runBatch(song, todo) {
  if (batch.running || !VZ.analyzeRecording) return;
  Object.assign(batch, {songId:song.id, running:true, stop:false, done:0, failed:0, total:todo.length, current:''});
  M.keepAwake?.(true); paint();
  try {
    for (const m of todo) {
      if (batch.stop) break;
      if (fresh.has(m.id)) { batch.done++; continue; } // already done in the background
      batch.current = M.label(m); paint();
      try { await VZ.analyzeRecording(m); } catch { batch.failed++; }
      batch.done++; paint();
    }
  } finally {
    M.keepAwake?.(false); batch.running = false; batch.current = '';
    M.invalidate?.(); paint();
    VZ.toast(batch.done - batch.failed + '개 녹음을 분석했어요' + (batch.failed ? ' · ' + batch.failed + '개 실패' : '') + '.');
  }
}
let last = null; // {host, song, media} of the card on screen
function paint() { if (last && document.body.contains(last.host)) VZ.songVocalGrowth(last.host, last.song, last.media); }

VZ.songVocalGrowth = (host, song, media) => {
  if (!host) return;
  last = {host, song, media};
  const audio = media.filter(m => !M.isVideo(m) || m.cloud), pts = points(audio);
  const todo = audio.filter(m => !usable(m)), running = batch.running && batch.songId === song.id;
  if (!audio.length) { host.innerHTML = ''; return; }
  const reliable = pts.filter(p => p.ok);
  let body = '';
  if (pts.length) {
    body += '<div class="vg-grid">' + METRICS.map(m => spark(m, pts)).join('') + '</div>';
    if (reliable.length >= 2) {
      const first = reliable[0], latest = reliable.at(-1);
      body += '<details class="vg-cmp"' + (cmpOpen ? ' open' : '') + '><summary>처음 vs 최근 측정값 비교</summary>' + VZ.measureTable(first.m, latest.m) +
        '<div class="btn-row"><a class="btn sm secondary" href="#/compare?song=' + encodeURIComponent(song.id) + '&a=' + encodeURIComponent(first.m.id) + '&b=' + encodeURIComponent(latest.m.id) + '"><i class="ph ph-headphones"></i>두 녹음 들어 보기</a><button type="button" class="btn sm" data-vg-save><i class="ph ph-floppy-disk"></i>이 비교 저장</button></div></details>';
    }
    const left = pts.length - reliable.length;
    if (left) body += '<p class="small muted" style="margin:6px 0 0">녹음 ' + left + '개는 노래가 짧거나 반주가 커서 변화 계산에서 뺐어요' + (pts.some(p => !p.ok && p.a.metrics.voicedSeconds) ? ' (그래프의 빈 점)' : '') + '.</p>';
  } else body += '<p class="small muted" style="margin:4px 0 0">아직 분석한 녹음이 없어요. 녹음을 분석하면 날짜별로 음정·흔들림·최고음·프레이즈가 어떻게 변했는지 보여 드려요.</p>';
  const action = running
    ? '<div class="vg-run"><span>분석 중 ' + Math.min(batch.done + 1, batch.total) + '/' + batch.total + ' · ' + esc(batch.current) + '</span><button type="button" class="btn sm ghost" data-vg-stop>멈추기</button></div><div class="ana-bar"><span style="width:' + Math.round(batch.done / Math.max(1, batch.total) * 100) + '%"></span></div>'
    : todo.length ? (VZ.serverAnalysisOn?.() ? '<p class="small muted" style="margin:0 0 6px">서버에서 자동으로 분석하고 있어요(앱을 닫아도 계속). 바로 보려면:</p>' : VZ.autoAnalysisStatus?.().enabled ? '<p class="small muted" style="margin:0 0 6px">앱을 켜 두면 자동으로 하나씩 분석해요. 바로 보려면:</p>' : '') + '<button type="button" class="btn sm secondary block" data-vg-run' + (batch.running ? ' disabled' : '') + '><i class="ph ph-chart-line-up"></i>지금 ' + todo.length + '개 분석하기 (이 기기에서 · 무료)</button>' : '';
  host.innerHTML = '<div class="card vg"><div class="row between"><strong>보컬 측정 변화</strong><span class="small muted">분석 ' + pts.length + '/' + audio.length + '개</span></div>' + body +
    (action ? '<div style="margin-top:10px">' + action + '</div>' : '') +
    '<p class="small muted vg-note">점을 누르면 그 녹음의 음높이 곡선을 볼 수 있어요. 시험판 측정값이라 실제 녹음으로 확인 중이에요.</p></div>';
  host.querySelector('[data-vg-run]')?.addEventListener('click', async () => {
    if (todo.length > 5 && !await VZ.confirm('녹음 ' + todo.length + '개 분석', '이 기기 안에서 하나씩 분석해요. 비용은 없고, 파일 하나에 보통 10~30초 걸려요. 분석하는 동안 화면은 켜 둘게요.', {ok:'분석 시작'})) return;
    runBatch(song, todo);
  });
  host.querySelector('[data-vg-stop]')?.addEventListener('click', () => { batch.stop = true; });
  host.querySelector('.vg-cmp')?.addEventListener('toggle', e => { cmpOpen = e.target.open; });
  host.querySelector('[data-vg-save]')?.addEventListener('click', () => {
    const first = reliable[0].m, latest = reliable.at(-1).m;
    const entry = {firstId:first.id, secondId:latest.id, firstName:M.label(first), secondName:M.label(latest), firstDate:first.created, secondDate:latest.created, song:song.title, songId:song.id,
      measures:{first:VZ.measureSnapshot(first), second:VZ.measureSnapshot(latest)}};
    const ok = VZ.change(d => { d.comparisonReports ||= []; const x = d.comparisonReports.find(y => y.firstId === first.id && y.secondId === latest.id); if (x) Object.assign(x, entry); else d.comparisonReports.push({id:VZ.uid(), created:Date.now(), notes:'', goal:'', ...entry}); }, {silent:true});
    if (ok) VZ.toast('측정값 비교를 저장했어요. 녹음 비교 화면의 "저장한 비교"에서 다시 볼 수 있어요.');
  });
};
})();
