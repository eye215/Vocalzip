/* 무엇이 달라졌나 — the first card of 성장 › 결과 리포트 › 전체 분석 (model: app/growth-changes-model.js).
 * Only comparable changes, each with its basis and a way to listen: 들어 본 평가 (app/listen-verdict.js), 같은 곡 같은
 * 방법, 같은 과제 (발성 정밀 측정, read-only from its device store), 음역 (처음·지금). What cannot be compared is not shown;
 * one closed list says what was left out and why. Read-only apart from the listening sheet it opens.
 * Under the card, 귀와 숫자 (app/ear-agreement-model.js): whether the numbers moved the way the verdicts heard — one
 * closed line, a table when opened, 이 평가와 숫자 under each verdict, and a small "귀와 자주 같아요" mark on a same-song
 * line whose measure went with the ear at least 3 times and never against it. Derived on the fly; nothing is stored.
 * Under each song pair and each verdict, 그 사이에 한 것 (app/growth-between-model.js): closed, what was recorded between
 * the two takes' days — lessons, practice days with the minutes the person entered, goals done, recordings of the song.
 *   VzipGrowthChangesUI.mount(host, items, opts) — host: an element inside 결과 리포트; items: the whole media list.
 * opts (성장 › 이번 달, app/growth-month.js; all optional — without them the card is what it always was):
 *   period {from, to}  지난 기간 vs 이번 기간 (app/growth-changes-model.js build period), verdicts of the period only;
 *   practice true      the 연습 녹음 포함 switch: the takes of VzipGrowthDataset.verdictRule({practice:true});
 *   songId             전체 · 곡별: that song's lines and verdicts only (같은 과제 and 음역 are not per song: left out);
 *   head false         no card heading (the screen has its own); empty: {verdicts, songs} words for an empty group.
 * 성장 › 곡 › 곡 하나 (app/vocal-lab.js) mounts it with songId and no period: that song's 처음·최근. */
(() => {
'use strict';
const V = window.VZ, M = V?.media, C = window.VzipGrowthChanges, L = window.VzipListenVerdict, E = window.VzipEarAgreement, B = window.VzipGrowthBetween;
if (!V || !M || !C || !L || !V.growthDataset) return;
const e = V.esc;
const SHOWN_VERDICTS = 3, SHOWN_SONGS = 4;
let state = null;   // {host, items, opts, precision: undefined (reading) | null (no store) | results, player, serial}
const owner = () => window.vzipCloudUserId?.() || window.VzipAccountScope?.owner || 'local';
const referenceOf = songId => { const r = V.song(songId)?.vocalRange; return r && Number.isFinite(r.highMidi) ? r : null; };
const today = () => window.VzipGrowthDataset?.koreaDay?.(Date.now()) || V.today();
/** A take with its second measurement with the MR removed (analysis.mrAlt) as `alt`, when the growth `ok` rule trusts it. */
const withAlt = t => { const alt = t?.a?.mrAlt; return alt && V.growthDataset.ok?.({analysis:alt}) ? {...t, alt} : t; };
function songsOf(items, practice = false) {
  // 결과 리포트's own selection (app/growth-dataset.js rule 'verdict'): the song's recordings without 연습실 · 트레이닝 연습;
  // with the 연습 녹음 포함 switch, the one "늘었나" rule with those takes in (verdictRule({practice:true})).
  const rule = practice === true && V.growthDataset.verdictRule ? V.growthDataset.verdictRule({practice:true}) : 'verdict';
  return [...V.growthDataset(items).bySong(rule)].filter(([id]) => id && V.song(id))
    .map(([songId, rows]) => ({songId, title:V.songTitle(songId), takes:rows.filter(r => r.analysed).map(r => withAlt(r.take)), reference:referenceOf(songId)}));
}
function rangeOf(items) {
  const R = window.VzipGrowthRange;
  if (!R) return null;
  try { return {compare:R.build(V.growthDataset(items).forRange(), {today:today()}).compare, text:R.compareText}; } catch { return null; }
}
const precisionApi = () => ({compare:window.VzipPrecisionReport?.compare, labels:window.VzipPrecisionReport?.LABELS || {}, groups:window.VzipPrecisionSession?.GROUPS || []});
const hasPrecision = () => !!(window.VzipPrecisionStore && window.VzipPrecisionReport && window.VzipPrecisionSession);
/** The model, narrowed by opts (see the head of this file): a period, the practice switch, one song. */
function model(items, precision, opts = {}) {
  const song = opts.songId || '';
  const m = C.build({verdicts:L.list(V.db).filter(v => !song || v.songId === song), songs:songsOf(items, opts.practice).filter(s => !song || s.songId === song),
    precision:!song && Array.isArray(precision) ? precision : null, precisionApi:precisionApi(), range:song ? null : rangeOf(items), titleOf:V.songTitle, period:opts.period || null});
  if (song) m.excluded = m.excluded.filter(x => x.songId === song);
  return m;
}
/** The song's recordings for 그 사이에 한 것: every recording of a song not in the deleted list, with its day. */
const recordingsOf = items => V.growthDataset(items).rows.filter(r => !r.deleted && r.songId).map(r => ({id:r.id, songId:r.songId, date:r.date}));
/** 그 사이에 한 것 — closed; plain observations, never a cause. '' when the two takes have no day between them. */
function betweenHtml(ctx, kind, id, songId, from, to, ids) {
  if (!B || !ctx) return '';
  let t;
  try { t = B.lines(B.between(V.db, {songId, from, to, recordings:ctx.recordings, exclude:ids})); } catch (error) { console.error(error); return ''; }
  if (!t) return '';
  return '<details class="gc-between" data-gc-between="' + e(kind + ':' + id) + '"' + (t.empty ? ' data-empty' : '') + '><summary><span>그 사이에 한 것</span><small>' + e(t.summary) + '</small></summary>' +
    '<p class="gc-between-head">' + e(B.HEAD) + '</p><p class="gc-between-range">' + e(t.range) + '</p>' +
    (t.empty ? '<p class="gc-between-empty" data-gc-between-empty>' + e(t.empty) + '</p>'
      : '<ul class="gc-between-rows">' + t.rows.map(r => '<li data-gc-between-row="' + e(r.key) + '">' + e(r.text) + '</li>').join('') + '</ul>') + '</details>';
}
/** 귀와 숫자 for the verdicts: each take as the growth screens read it (the same `ok` rule), null when it is gone. */
function earOf(items, opts = {}) {
  if (!E) return null;
  const ds = V.growthDataset(items);
  const takeOf = id => { const row = ds.row(id); return row && !row.deleted ? withAlt(row.take) : null; };
  return E.build({verdicts:L.list(V.db).filter(v => !opts.songId || v.songId === opts.songId), takeOf, reference:referenceOf, period:opts.period || null});
}

/**
 * Under a pair left out because its two takes were measured differently: what each method means when one is AI 분리
 * 후, and the way to measure them the same way — 이 녹음도 MR 빼고 재기 (app/mr-reanalyze.js, only that take picked)
 * when the song has an MR file, else where to add one. The new result is picked up on the next draw (derived on the fly).
 */
function remeasureHtml(songId, methods = [], target = null) {
  const help = methods.includes('aiSeparated') ? '<p class="gc-remr-help" data-gc-remr-help>' + methods.map(k => e(C.METHOD_HELP[k])).join('<br>') + '</p>' : '';
  const song = V.song(songId), box = body => body ? '<div class="gc-remr" data-gc-remr-box>' + body + '</div>' : '';
  if (!target || !song || !V.mrReanalyze) return box(help);
  if (!V.mrReanalyze.has(song)) return box(help + '<p class="gc-remr-note" data-gc-remr-none>이 곡에 MR 파일을 올리면 같은 방법으로 견줄 수 있어요</p>' +
    '<a class="gc-chip" href="#/song/' + encodeURIComponent(songId) + '?tab=ar" data-gc-remr-link><i class="ph ph-music-notes-plus" aria-hidden="true"></i><span>곡의 MR 파일로 가기</span></a>');
  return box(help + '<p class="gc-remr-note">' + e(target.label + ' 녹음 하나만 곡의 MR 파일로 반주를 빼고 다시 재요. 녹음 그대로 잰 결과가 또렷하면 그 결과는 두고, 반주를 뺀 결과를 따로 남겨 견줘요.') + '</p>' +
    '<button type="button" class="gc-chip" data-gc-remr="' + e(target.id) + '" data-song="' + e(songId) + '"><i class="ph ph-music-notes-minus" aria-hidden="true"></i><span>이 녹음도 MR 빼고 재기</span></button>');
}
const chip = (attrs, label, icon = '') => '<button type="button" class="gc-chip" ' + attrs + '>' + (icon ? '<i class="ph ph-' + icon + '" aria-hidden="true"></i>' : '') + '<span>' + label + '</span></button>';
const play = (id, label) => id ? chip('data-gc-play="' + e(id) + '"', e(label) + ' 듣기', 'play') : '';
/** 이 평가와 숫자: each measure's movement for this pair next to the verdict, or why the pair is not compared. */
function earPairHtml(p) {
  if (!p) return '';
  const v = p.verdict;
  const why = r => r.why === 'heard-same' ? '평가는 비슷해요' : r.why === 'mixed' ? '숫자가 엇갈려요' : '';
  const row = r => r.move === 'hold'
    ? '<li data-gc-ear-row="' + e(r.id) + '" data-result="hold"><span class="gc-ear-name">' + e(r.name) + '</span><small>' + e((window.VzipGrowthMetrics?.HOLD_LABEL || '판정 보류') + ' · ' + r.holdText) + '</small></li>'
    : '<li data-gc-ear-row="' + e(r.id) + '" data-result="' + e(r.overall) + '"><span class="gc-ear-name">' + e(r.name) + '</span><b class="gc-ear-badge" data-result="' + e(r.overall) + '">' + e(E.RESULT[r.overall]) + '</b>' +
      '<span class="gc-ear-move">' + e(E.moveText(r, v)) + '</span><small>' + e([r.numbers, why(r)].filter(Boolean).join(' · ')) + '</small>' +
      (r.tag ? '<small class="gc-ear-tag" data-gc-ear-tag-result="' + e(r.tag.result) + '">' + e(r.tag.name + ' 평가와는 ' + E.RESULT[r.tag.result]) + '</small>' : '') + '</li>';
  return '<details class="gc-ear-detail" data-gc-ear-verdict="' + e(p.id) + '"><summary><span>이 평가와 숫자</span><small>' + e(E.pairLine(p)) + '</small></summary>' +
    (p.usable ? '<p class="gc-ear-basis">' + e(E.pairBasis(p)) + '</p><ul class="gc-ear-rows">' + p.rows.map(row).join('') + '</ul>'
      : '<p class="gc-ear-why" data-gc-ear-why="' + e(p.reason) + '">' + e(p.text) + '</p>' + (p.reason === 'method-mixed' ? remeasureHtml(p.songId, p.methods, p.remeasure) : '')) +
    '<p class="gc-ear-note">숫자가 맞거나 틀렸다는 뜻은 아니에요. 이 두 녹음에서 숫자가 어느 쪽으로 움직였는지만 적었어요.</p></details>';
}
function verdictHtml(v, ear, ctx) {
  const [l1, l2] = L.dayLabels(v.firstDate, v.secondDate);
  return '<article class="gc-line" data-gc-verdict="' + e(v.id) + '"><p class="gc-basis">' + e('같은 곡 ' + v.title + ' · ' + L.basisText(v.verdict, V.clock)) + '</p>' +
    '<p class="gc-quote"><span class="gc-who" data-judge="' + e(v.judge) + '">' + e(v.who) + '</span><q>' + e(v.overall) + '</q></p>' +
    (v.tags ? '<p class="gc-tags">' + e(v.tags) + '</p>' : '') + (v.memo ? '<p class="gc-memo">' + e(v.memo) + '</p>' : '') +
    earPairHtml(ear?.byVerdict.get(v.id)) + betweenHtml(ctx, 'verdict', v.id, v.songId, v.firstDate, v.secondDate, [v.firstId, v.secondId]) +
    '<div class="gc-actions">' + play(v.firstId, l1) + play(v.secondId, l2) + chip('data-listen-edit="' + e(v.id) + '"', '고치기', 'pencil-simple') + '</div><div class="gc-player" data-gc-player></div></article>';
}
/** The small mark on a same-song line whose measure went with the ear ≥ 3 times and never against it. */
const earMark = (ear, id) => ear?.measures.find(x => x.id === id)?.often ? '<em class="gc-ear-mark" data-gc-ear-mark><i class="ph ph-ear" aria-hidden="true"></i>귀와 자주 같아요</em>' : '';
function songHtml(s, ear, ctx) {
  const [l1, l2] = L.dayLabels(s.firstDate, s.lastDate);
  return '<article class="gc-line" data-gc-song="' + e(s.songId) + '" data-gc-method="' + e(s.method) + '"><p class="gc-basis">' + e(s.basis) + '</p>' +
    // What moved, one line each with its numbers; what stayed about the same, gathered in one line.
    '<ul class="gc-obs">' + s.changes.filter(c => !c.similar).map(c => '<li data-gc-obs="' + e(c.id) + '"><span>' + e(c.text) + '</span>' +
      (c.numbers || c.basis ? '<small>' + e([c.numbers, c.basis].filter(Boolean).join(' · ')) + '</small>' : '') + earMark(ear, c.id) + '</li>').join('') +
    (s.changes.some(c => c.similar) ? '<li data-gc-obs="similar" data-similar><span>비슷해요 · ' + e(s.changes.filter(c => c.similar).map(c => c.name).join(' · ')) + '</span></li>' : '') + '</ul>' +
    betweenHtml(ctx, 'song', s.songId, s.songId, s.firstDate, s.lastDate, [s.firstId, s.lastId]) +
    '<div class="gc-actions">' + play(s.firstId, l1) + play(s.lastId, l2) +
    chip('data-listen-open data-song="' + e(s.songId) + '" data-a="' + e(s.firstId) + '" data-b="' + e(s.lastId) + '"', '들어 보고 평가', 'ear') + '</div><div class="gc-player" data-gc-player></div></article>';
}
const taskHtml = t => '<article class="gc-line" data-gc-task="' + e(t.key) + '"><p class="gc-basis">' + e(t.basis) + '</p><ul class="gc-obs">' +
  t.changes.map(c => '<li><span>' + e(c.text) + '</span></li>').join('') + '</ul></article>';
const KIND = {song:'같은 곡', task:'같은 과제', range:'음역'};
const more = (label, rows) => rows ? '<details class="gc-more"><summary>' + label + '</summary>' + rows + '</details>' : '';
/** 귀와 숫자: closed, one summary line; opened, a count per measure, the tags it is held against and what was left out. */
function earBody(ear) {
  const n = x => '<td>' + x + '</td>';
  const table = ear.ready ? '<table class="gc-ear-table" data-gc-ear-table><thead><tr><th scope="col">숫자</th><th scope="col">같은 쪽</th><th scope="col">반대</th><th scope="col">차이 없음</th></tr></thead><tbody>' +
    ear.measures.map(x => '<tr data-gc-ear-measure="' + e(x.id) + '"' + (x.often ? ' data-often' : '') + '><th scope="row"><span>' + e(x.name) + '</span><small>' + e(x.compared ? x.text : '판정 보류라 견주지 못했어요') + '</small></th>' +
      n(x.agree) + n(x.disagree) + n(x.none) + '</tr>').join('') + '</tbody></table>' : '';
  const tags = ear.ready ? ear.measures.filter(x => x.tag?.compared) : [];
  const tagList = tags.length ? '<h3 class="gc-ear-sub">자세히 고른 항목과</h3><ul class="gc-ear-tags">' + tags.map(x => '<li data-gc-ear-tag="' + e(x.id) + '"><span>' + e(x.tag.name + ' ↔ ' + x.name) + '</span><small>' + e(x.tag.text) + '</small></li>').join('') + '</ul>' : '';
  const ex = ear.excluded;
  const exList = ex.length ? '<details class="gc-more gc-ear-excluded" data-gc-ear-excluded><summary>견줄 수 없어 뺀 평가 ' + ex.length + '개 · 왜</summary><ul>' +
    ex.map(p => { const [l1, l2] = L.dayLabels(p.verdict.firstDate, p.verdict.secondDate);
      return '<li data-gc-ear-excluded-item="' + e(p.id) + '" data-reason="' + e(p.reason) + '"><strong>' + e((V.songTitle(p.songId) || '삭제된 곡') + ' · ' + l1 + ' → ' + l2) + '</strong><span>' + e(p.text) + '</span>' + (p.reason === 'method-mixed' ? remeasureHtml(p.songId, p.methods, p.remeasure) : '') + '</li>'; }).join('') + '</ul></details>' : '';
  return '<div class="gc-ear-body"><p class="gc-ear-help">들어 본 평가에서 낫다고 고른 녹음 쪽으로 숫자도 움직였는지 세어 봤어요. 같은 방법·같은 분석 버전으로 잰 두 녹음만 견주고, 판정 보류된 숫자는 세지 않아요. 숫자가 맞거나 틀렸다는 뜻은 아니에요.</p>' +
    table + tagList + '<p class="gc-ear-note">어느 숫자를 음정·호흡·소리 길 중 어느 항목과 견줄지는 처음 정해 본 것이에요. 평가가 쌓이면 바뀔 수 있어요.</p>' + exList + '</div>';
}
function earHtml(ear) {
  if (!ear || !ear.total) return '';
  return '<section class="growth-panel gc-ear" data-growth-ear aria-label="귀와 숫자"><details class="gc-ear-box" data-gc-ear' + (state?.earOpen ? ' open' : '') + '>' +
    '<summary><span class="gc-ear-title"><i class="ph ph-ear" aria-hidden="true"></i>귀와 숫자</span><span class="gc-ear-sum" data-gc-ear-summary>' + e(ear.summary) + '</span><i class="ph ph-caret-down gc-ear-caret" aria-hidden="true"></i></summary>' +
    earBody(ear) + '</details></section>';
}
const excludedList = ex => '<ul>' + ex.map(x => '<li data-gc-excluded-item="' + e(x.kind + ':' + (x.songId || x.key || x.kind)) + '" data-reason="' + e(x.reason) + '"><strong>' + e(KIND[x.kind] + ' · ' + (x.title || '')) + '</strong><span>' + e(x.text) + '</span>' +
  (x.reason === 'method-mixed' ? remeasureHtml(x.songId, [x.other, x.method], x.remeasure) : '') + '</li>').join('') + '</ul>';
function html(m, precision, ear = null, ctx = null, opts = {}) {
  const group = (key, icon, title, body) => '<section class="gc-group" data-gc-group="' + key + '"><h3><i class="ph ph-' + icon + '" aria-hidden="true"></i>' + title + '</h3>' + body + '</section>';
  const verdictRow = v => verdictHtml(v, ear, ctx), songRow = s => songHtml(s, ear, ctx);
  const verdicts = m.verdicts.length ? m.verdicts.slice(0, SHOWN_VERDICTS).map(verdictRow).join('') + more('남긴 평가 모두 보기 (' + m.verdicts.length + ')', m.verdicts.slice(SHOWN_VERDICTS).map(verdictRow).join(''))
    : '<p class="gc-empty" data-gc-empty="verdicts">' + (opts.empty?.verdicts ? e(opts.empty.verdicts) : '아직 들어 보고 남긴 평가가 없어요. 아래 곡의 <b>들어 보고 평가</b>나 곡 분석의 두 녹음 비교에서 가리고 들어 보고 남길 수 있어요.') + '</p>';
  const songs = m.songs.length ? m.songs.slice(0, SHOWN_SONGS).map(songRow).join('') + more('곡 더 보기 (' + (m.songs.length - SHOWN_SONGS) + ')', m.songs.slice(SHOWN_SONGS).map(songRow).join(''))
    : '<p class="gc-empty" data-gc-empty="songs">' + e(opts.empty?.songs || '같은 방법으로 잰 같은 곡 녹음이 다른 날 두 개 이상 모이면 여기에 보여 드려요.') + '</p>';
  let tasks = '';
  if (m.tasks.length) tasks = m.tasks.map(taskHtml).join('');
  else if (precision === undefined && hasPrecision()) tasks = '<p class="gc-empty" data-gc-loading>발성 정밀 측정 결과를 읽는 중…</p>';
  else if (m.invite && V.precisionMeasurement && !opts.songId) tasks = '<p class="gc-empty" data-gc-invite>아직 발성 정밀 측정이 없어요. 표준 과제 8가지를 녹음해 두면 같은 과제·모음·음량끼리 비교해 드려요.</p>' +
    '<a class="gc-chip" href="#/precision-measurement" data-gc-precision-entry><i class="ph ph-microphone" aria-hidden="true"></i><span>표준 과제 녹음하기</span></a>';
  const ex = m.excluded;
  return '<section class="growth-panel gc-card" data-growth-changes-card aria-label="무엇이 달라졌나">' +
    (opts.head === false ? '' : '<header class="gc-head"><h2>무엇이 달라졌나</h2><p>같은 조건으로 잰 것끼리만 비교했어요. 숫자는 관찰이고, 더 나아졌는지는 들어 본 사람의 판단으로만 적어요.</p></header>') +
    '<div class="gc-groups">' + group('verdicts', 'ear', '들어 본 평가', verdicts) + group('songs', 'music-notes', '같은 곡 같은 방법', songs) +
    (tasks ? group('tasks', 'waveform', '같은 과제', tasks) : '') +
    (m.range ? group('range', 'arrows-vertical', '음역', '<article class="gc-line" data-gc-range><p class="gc-basis">' + e(m.range.basis) + '</p><ul class="gc-obs"><li><span>' + e(m.range.text) + '</span></li></ul></article>') : '') + '</div>' +
    (ex.length ? '<details class="gc-excluded" data-gc-excluded><summary>비교할 수 없어 뺀 것 ' + ex.length + '개 · 왜</summary>' + excludedList(ex) + '</details>' : '') +
    '</section>' + earHtml(ear);
}
function stopPlayer() { state?.player?.destroy(); if (state) state.player = null; }
function bindRemeasure(host) {
  host.querySelectorAll('[data-gc-remr]').forEach(b => b.onclick = () => {
    if (V.mrReanalyze.running()) { V.toast('다른 분석이 진행 중이에요. 끝난 뒤 다시 눌러 주세요.', 'error'); return; }
    stopPlayer();
    // alsoMr: a take trusted as recorded keeps its result and gets a second measurement with the MR removed next to it.
    V.mrReanalyze.open(V.song(b.dataset.song), {picked:[b.dataset.gcRemr], scope:'picked', alsoMr:true});
  });
}
function paint() {
  const s = state;
  if (!s?.host?.isConnected) return;
  stopPlayer();
  let m, ear = null;
  try { m = model(s.items, s.precision, s.opts); } catch (error) { console.error(error); s.host.innerHTML = ''; return; }
  try { ear = earOf(s.items, s.opts); } catch (error) { console.error(error); }   // 귀와 숫자 is extra: the card stands without it
  let ctx = null;
  try { ctx = {recordings:recordingsOf(s.items)}; } catch (error) { console.error(error); }   // so is 그 사이에 한 것
  s.host.innerHTML = html(m, s.precision, ear, ctx, s.opts);
  // A redraw (a verdict saved, the late precision read) keeps 귀와 숫자 open when it was.
  s.host.querySelector('[data-gc-ear]')?.addEventListener('toggle', ev => { s.earOpen = ev.target.open; });
  // 이 녹음도 MR 빼고 재기: the song's MR re-analysis with only this take picked. A saved result redraws 결과 리포트
  // ('vzip:analysis-saved', app/monthly-growth.js), so the pair shows up as comparable once both are MR 빼고.
  bindRemeasure(s.host);
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
  async mount(host, items, opts = {}) {
    if (!host) return;
    const serial = (state?.serial || 0) + 1;
    stopPlayer();
    state = {host, items:items || [], opts:opts || {}, precision:hasPrecision() ? undefined : null, player:null, serial};
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
  html:(items, precision = null, opts = {}) => html(model(items, precision, opts), precision, earOf(items, opts), {recordings:recordingsOf(items)}, opts),
  /** 성장 › 연구소 (app/growth-lab.js): 귀와 숫자 표 전체 and 뺀 것 목록 on their own pages — the same model, the same words,
   * every period, the 연습 녹음 포함 switch as `practice`. counts: {verdicts, usable, ready, excluded, earExcluded}. */
  lab:{
    counts(items, precision = null, opts = {}) {
      const out = {verdicts:0, usable:0, ready:false, excluded:0, earExcluded:0};
      try { const ear = earOf(items || [], opts); if (ear) Object.assign(out, {verdicts:ear.total, usable:ear.usable, ready:ear.ready, earExcluded:ear.excluded.length}); } catch (error) { console.error(error); }
      try { out.excluded = model(items || [], precision, opts).excluded.length; } catch (error) { console.error(error); }
      return out;
    },
    /** The whole 귀와 숫자 table, open. '' when 귀와 숫자 cannot be built; an empty state when there is no verdict yet. */
    earHtml(items, opts = {}) {
      let ear = null;
      try { ear = earOf(items || [], opts); } catch (error) { console.error(error); }
      if (!ear) return '';
      if (!ear.total) return '<section class="growth-panel gc-ear gc-ear-page" data-growth-ear-page><p class="gc-empty" data-gc-ear-none>아직 들어 보고 남긴 평가가 없어요. 곡 분석의 두 녹음 비교에서 가리고 들어 보고 평가를 남기면, 그 평가와 숫자가 같은 쪽으로 움직였는지 여기에서 세어 드려요.</p></section>';
      return '<section class="growth-panel gc-ear gc-ear-page" data-growth-ear-page aria-label="귀와 숫자"><p class="gc-ear-sum" data-gc-ear-summary>' + e(ear.summary) + '</p>' + earBody(ear) + '</section>';
    },
    /** 비교할 수 없어 뺀 것, every line with its reason (and 이 녹음도 MR 빼고 재기 where that helps). */
    excludedHtml(items, precision = null, opts = {}) {
      let ex = [];
      try { ex = model(items || [], precision, opts).excluded; } catch (error) { console.error(error); return ''; }
      return ex.length ? '<div class="gc-excluded gc-excluded-page" data-gc-excluded-page>' + excludedList(ex) + '</div>'
        : '<p class="gc-empty" data-gc-excluded-none>지금은 비교에서 뺀 것이 없어요.</p>';
    },
    bind:host => { if (host) bindRemeasure(host); },
    precision:readPrecision
  },
  /** Every song's takes as this card compares them ([{songId, title, takes, reference}], the 연습 녹음 포함 switch as
   * `practice`): what 성장 › 곡 hands to app/growth-song-model.js, so a song's verdict there is this card's. */
  songTakes:(items, practice = false) => songsOf(items || [], practice === true),
  /** The songs that have a 같은 곡 같은 방법 line (월별 분석 › 곡별 links to it); [] when the model cannot be built. */
  songs:(items, opts = {}) => { try { return model(items || [], null, opts).songs.map(s => s.songId); } catch (error) { console.error(error); return []; } },
  /**
   * 전체 · 곡별 for one period (opts as mount, without songId): every song with a take in it, the songs with a line first —
   * [{songId, title, state: 'compare' (a line) | 'new' (nothing before the period) | 'hold' (left out for another reason)}].
   */
  songChoices:(items, opts = {}) => {
    try {
      const m = model(items || [], null, {...opts, songId:''}), out = new Map();
      for (const s of m.songs) out.set(s.songId, {songId:s.songId, title:s.title, state:'compare'});
      for (const x of m.excluded) if (x.kind === 'song' && x.songId && !out.has(x.songId)) out.set(x.songId, {songId:x.songId, title:x.title || V.songTitle(x.songId), state:x.reason === 'no-previous' ? 'new' : 'hold'});
      return [...out.values()];
    } catch (error) { console.error(error); return []; }
  }
};
window.addEventListener('vzip:listen-verdicts', () => { if (state?.host?.isConnected) paint(); });
window.addEventListener('hashchange', stopPlayer);
window.addEventListener('pagehide', stopPlayer);
})();
