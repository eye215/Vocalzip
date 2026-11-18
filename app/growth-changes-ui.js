/* 무엇이 달라졌나 — the first card of 성장 › 결과 리포트 › 전체 분석 (model: app/growth-changes-model.js).
 * Only comparable changes, each with its basis and a way to listen: 들어 본 평가 (app/listen-verdict.js), 같은 곡 같은
 * 방법, 같은 과제 (발성 정밀 측정, read-only from its device store), 음역 (처음·지금). What cannot be compared is not shown;
 * one closed list says what was left out and why. Read-only apart from the listening sheet it opens.
 *   VzipGrowthChangesUI.mount(host, items) — host: an element inside 결과 리포트; items: the whole media list. */
(() => {
'use strict';
const V = window.VZ, M = V?.media, C = window.VzipGrowthChanges, L = window.VzipListenVerdict;
if (!V || !M || !C || !L || !V.growthDataset) return;
const e = V.esc;
const SHOWN_VERDICTS = 3, SHOWN_SONGS = 4;
let state = null;   // {host, items, precision: undefined (reading) | null (no store) | results, player, serial}
const owner = () => window.vzipCloudUserId?.() || window.VzipAccountScope?.owner || 'local';
const referenceOf = songId => { const r = V.song(songId)?.vocalRange; return r && Number.isFinite(r.highMidi) ? r : null; };
const today = () => window.VzipGrowthDataset?.koreaDay?.(Date.now()) || V.today();
function songsOf(items) {
  // 결과 리포트's own selection (app/growth-dataset.js rule 'verdict'): the song's recordings without 연습실 · 트레이닝 연습.
  return [...V.growthDataset(items).bySong('verdict')].filter(([id]) => id && V.song(id))
    .map(([songId, rows]) => ({songId, title:V.songTitle(songId), takes:rows.filter(r => r.analysed).map(r => r.take), reference:referenceOf(songId)}));
}
function rangeOf(items) {
  const R = window.VzipGrowthRange;
  if (!R) return null;
  try { return {compare:R.build(V.growthDataset(items).forRange(), {today:today()}).compare, text:R.compareText}; } catch { return null; }
}
const precisionApi = () => ({compare:window.VzipPrecisionReport?.compare, labels:window.VzipPrecisionReport?.LABELS || {}, groups:window.VzipPrecisionSession?.GROUPS || []});
const hasPrecision = () => !!(window.VzipPrecisionStore && window.VzipPrecisionReport && window.VzipPrecisionSession);
const model = (items, precision) => C.build({verdicts:L.list(V.db), songs:songsOf(items), precision:Array.isArray(precision) ? precision : null,
  precisionApi:precisionApi(), range:rangeOf(items), titleOf:V.songTitle});

const chip = (attrs, label, icon = '') => '<button type="button" class="gc-chip" ' + attrs + '>' + (icon ? '<i class="ph ph-' + icon + '" aria-hidden="true"></i>' : '') + '<span>' + label + '</span></button>';
const play = (id, label) => id ? chip('data-gc-play="' + e(id) + '"', e(label) + ' 듣기', 'play') : '';
function verdictHtml(v) {
  const [l1, l2] = L.dayLabels(v.firstDate, v.secondDate);
  return '<article class="gc-line" data-gc-verdict="' + e(v.id) + '"><p class="gc-basis">' + e('같은 곡 ' + v.title + ' · ' + L.basisText(v.verdict, V.clock)) + '</p>' +
    '<p class="gc-quote"><span class="gc-who" data-judge="' + e(v.judge) + '">' + e(v.who) + '</span><q>' + e(v.overall) + '</q></p>' +
    (v.tags ? '<p class="gc-tags">' + e(v.tags) + '</p>' : '') + (v.memo ? '<p class="gc-memo">' + e(v.memo) + '</p>' : '') +
    '<div class="gc-actions">' + play(v.firstId, l1) + play(v.secondId, l2) + chip('data-listen-edit="' + e(v.id) + '"', '고치기', 'pencil-simple') + '</div><div class="gc-player" data-gc-player></div></article>';
}
function songHtml(s) {
  const [l1, l2] = L.dayLabels(s.firstDate, s.lastDate);
  return '<article class="gc-line" data-gc-song="' + e(s.songId) + '" data-gc-method="' + e(s.method) + '"><p class="gc-basis">' + e(s.basis) + '</p>' +
    // What moved, one line each with its numbers; what stayed about the same, gathered in one line.
    '<ul class="gc-obs">' + s.changes.filter(c => !c.similar).map(c => '<li data-gc-obs="' + e(c.id) + '"><span>' + e(c.text) + '</span>' +
      (c.numbers || c.basis ? '<small>' + e([c.numbers, c.basis].filter(Boolean).join(' · ')) + '</small>' : '') + '</li>').join('') +
    (s.changes.some(c => c.similar) ? '<li data-gc-obs="similar" data-similar><span>비슷해요 · ' + e(s.changes.filter(c => c.similar).map(c => c.name).join(' · ')) + '</span></li>' : '') + '</ul>' +
    '<div class="gc-actions">' + play(s.firstId, l1) + play(s.lastId, l2) +
    chip('data-listen-open data-song="' + e(s.songId) + '" data-a="' + e(s.firstId) + '" data-b="' + e(s.lastId) + '"', '들어 보고 평가', 'ear') + '</div><div class="gc-player" data-gc-player></div></article>';
}
const taskHtml = t => '<article class="gc-line" data-gc-task="' + e(t.key) + '"><p class="gc-basis">' + e(t.basis) + '</p><ul class="gc-obs">' +
  t.changes.map(c => '<li><span>' + e(c.text) + '</span></li>').join('') + '</ul></article>';
const KIND = {song:'같은 곡', task:'같은 과제', range:'음역'};
const more = (label, rows) => rows ? '<details class="gc-more"><summary>' + label + '</summary>' + rows + '</details>' : '';
function html(m, precision) {
  const group = (key, icon, title, body) => '<section class="gc-group" data-gc-group="' + key + '"><h3><i class="ph ph-' + icon + '" aria-hidden="true"></i>' + title + '</h3>' + body + '</section>';
  const verdicts = m.verdicts.length ? m.verdicts.slice(0, SHOWN_VERDICTS).map(verdictHtml).join('') + more('남긴 평가 모두 보기 (' + m.verdicts.length + ')', m.verdicts.slice(SHOWN_VERDICTS).map(verdictHtml).join(''))
    : '<p class="gc-empty" data-gc-empty="verdicts">아직 들어 보고 남긴 평가가 없어요. 아래 곡의 <b>들어 보고 평가</b>나 보컬 연구소에서 두 녹음을 가리고 들어 보고 남길 수 있어요.</p>';
  const songs = m.songs.length ? m.songs.slice(0, SHOWN_SONGS).map(songHtml).join('') + more('곡 더 보기 (' + (m.songs.length - SHOWN_SONGS) + ')', m.songs.slice(SHOWN_SONGS).map(songHtml).join(''))
    : '<p class="gc-empty" data-gc-empty="songs">같은 방법으로 잰 같은 곡 녹음이 다른 날 두 개 이상 모이면 여기에 보여 드려요.</p>';
  let tasks = '';
  if (m.tasks.length) tasks = m.tasks.map(taskHtml).join('');
  else if (precision === undefined && hasPrecision()) tasks = '<p class="gc-empty" data-gc-loading>발성 정밀 측정 결과를 읽는 중…</p>';
  else if (m.invite && V.precisionMeasurement) tasks = '<p class="gc-empty" data-gc-invite>아직 발성 정밀 측정이 없어요. 표준 과제 8가지를 녹음해 두면 같은 과제·모음·음량끼리 비교해 드려요.</p>' +
    '<a class="gc-chip" href="#/precision-measurement" data-gc-precision-entry><i class="ph ph-microphone" aria-hidden="true"></i><span>표준 과제 녹음하기</span></a>';
  const ex = m.excluded;
  return '<section class="growth-panel gc-card" data-growth-changes-card aria-label="무엇이 달라졌나">' +
    '<header class="gc-head"><h2>무엇이 달라졌나</h2><p>같은 조건으로 잰 것끼리만 비교했어요. 숫자는 관찰이고, 더 나아졌는지는 들어 본 사람의 판단으로만 적어요.</p></header>' +
    '<div class="gc-groups">' + group('verdicts', 'ear', '들어 본 평가', verdicts) + group('songs', 'music-notes', '같은 곡 같은 방법', songs) +
    (tasks ? group('tasks', 'waveform', '같은 과제', tasks) : '') +
    (m.range ? group('range', 'arrows-vertical', '음역', '<article class="gc-line" data-gc-range><p class="gc-basis">' + e(m.range.basis) + '</p><ul class="gc-obs"><li><span>' + e(m.range.text) + '</span></li></ul></article>') : '') + '</div>' +
    (ex.length ? '<details class="gc-excluded" data-gc-excluded><summary>비교할 수 없어 뺀 것 ' + ex.length + '개 · 왜</summary><ul>' +
      ex.map(x => '<li data-gc-excluded-item="' + e(x.kind + ':' + (x.songId || x.key || x.kind)) + '" data-reason="' + e(x.reason) + '"><strong>' + e(KIND[x.kind] + ' · ' + (x.title || '')) + '</strong><span>' + e(x.text) + '</span></li>').join('') + '</ul></details>' : '') +
    '</section>';
}
function stopPlayer() { state?.player?.destroy(); if (state) state.player = null; }
function paint() {
  const s = state;
  if (!s?.host?.isConnected) return;
  stopPlayer();
  let m;
  try { m = model(s.items, s.precision); } catch (error) { console.error(error); s.host.innerHTML = ''; return; }
  s.host.innerHTML = html(m, s.precision);
  s.host.querySelectorAll('[data-gc-play]').forEach(b => b.onclick = () => {
    const item = s.items.find(x => x.id === b.dataset.gcPlay);
    if (!item) { V.toast('녹음을 찾을 수 없어요. 지워졌거나 다른 기기에만 있어요.', 'error'); return; }
    stopPlayer();
    s.host.querySelectorAll('[data-gc-player]').forEach(h => h.replaceChildren());
    s.player = M.player(b.closest('.gc-line').querySelector('[data-gc-player]'), item, {});
    s.player.play();
  });
}
/** The 발성 정밀 측정 results of this account (its own device store, read-only), or null when there is none. */
async function readPrecision() {
  if (!hasPrecision()) return null;
  try { return (await window.VzipPrecisionStore.list(owner())).map(r => r.result).filter(Boolean); } catch { return null; }
}
window.VzipGrowthChangesUI = {
  /** Drawn once the device store has answered (it is quick); a slow store is waited for 600 ms, then the card shows
   * "읽는 중" for that group and is drawn again when the answer comes — never redrawn under a finger otherwise. */
  async mount(host, items) {
    if (!host) return;
    const serial = (state?.serial || 0) + 1;
    stopPlayer();
    state = {host, items:items || [], precision:hasPrecision() ? undefined : null, player:null, serial};
    const read = readPrecision();
    const first = await Promise.race([read, new Promise(r => setTimeout(() => r(undefined), 600))]);
    if (state?.serial !== serial) return;
    state.precision = first === undefined && hasPrecision() ? undefined : first ?? null;
    paint();
    if (first !== undefined || !hasPrecision()) return;
    const late = await read;
    if (state?.serial !== serial) return;
    state.precision = late;
    paint();
  },
  html:(items, precision = null) => html(model(items, precision), precision)
};
window.addEventListener('vzip:listen-verdicts', () => { if (state?.host?.isConnected) paint(); });
window.addEventListener('hashchange', stopPlayer);
window.addEventListener('pagehide', stopPlayer);
})();
