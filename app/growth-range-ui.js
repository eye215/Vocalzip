/* VOCAL.zip 전체 음역 흐름 — the section of 결과 리포트 › 전체 and the month row of 월별 분석 (성장 2단계, design guide §26).
 * Read-only: nothing is stored or changed. Every value comes from app/growth-range-model.js (VzipGrowthRange), which
 * reads the dataset's range selection (app/growth-dataset.js forRange): 곡 녹음 · 매일 보이스 체크 · 트레이닝 · 레슨 녹음.
 * Words: 자주 닿은 최고음 · 최저음 (the note a quarter of a month's recordings reach) and 관측, never 성장·향상; a month
 * without a reliable recording is drawn empty.
 * The chips choose which kinds are counted — for this visit only (all on again after a reload). */
(() => {
'use strict';
const V = window.VZ, R = window.VzipGrowthRange, D = window.VzipGrowthDataset;
if (!V || !R || !D || !V.growthDataset) return;
const e = V.esc;
const off = new Set();                                   // kinds turned off on this visit
// 달별 흐름 | 처음·지금 — remembered on this device (a convenience only; the page works without storage).
const VIEW_KEY = 'vzip_range_view', VIEWS = [['flow', '달별 흐름'], ['compare', '처음·지금']];
const store = () => { try { return window.VzipAccountScope?.storage || window.localStorage; } catch { return null; } };
let view = (() => { try { return store()?.getItem(VIEW_KEY) === 'compare' ? 'compare' : 'flow'; } catch { return 'flow'; } })();
const setView = next => { view = next === 'compare' ? 'compare' : 'flow'; try { store()?.setItem(VIEW_KEY, view); } catch {} };
const today = () => D.koreaDay(Date.now());              // the series runs to this month in Korea
const chosen = () => R.GROUPS.map(([id]) => id).filter(id => !off.has(id));
/** The model for the list in hand. all:true ignores the chips (the month row always counts every kind). */
const modelOf = (items, {all = false} = {}) => R.build(V.growthDataset(items || []).forRange(), {today:today(), groups:all ? undefined : chosen()});
const span = (a, b) => a.note === b.note ? a.note : a.note + ' ~ ' + b.note;
const longMonth = key => key.slice(0, 4) + '년 ' + Number(key.slice(5, 7)) + '월';
const longDate = s => String(s || '').replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$1.$2.$3');

function chips(model) {
  return '<div class="range-chips" role="group" aria-label="셀 녹음 종류">' + model.groups.map(g =>
    '<button type="button" class="range-chip" data-range-group="' + g.id + '" aria-pressed="' + g.on + '" aria-label="' + e(g.label + ' ' + g.counted + '개, ' + (g.on ? '세는 중' : '빼는 중')) + '">' +
    '<i class="ph ' + (g.on ? 'ph-check' : 'ph-plus') + '" aria-hidden="true"></i><span>' + e(g.label) + '</span><b>' + g.counted + '</b></button>').join('') + '</div>';
}
function stats(model) {
  const a = model.all, cell = (key, label, value) => '<div><span>' + label + '</span><strong data-range-all="' + key + '">' + e(value) + '</strong></div>';
  return '<div class="range-stats" role="group" aria-label="지금까지 자주 닿은 음역">' +
    (a.low && a.high ? cell('observed', '자주 닿은 최저음 ~ 최고음', span(a.low, a.high)) : a.high ? cell('observed', '자주 닿은 최고음', a.high.note) : a.low ? cell('observed', '자주 닿은 최저음', a.low.note) : '') +
    // A row the analyses cannot fill is left out, never estimated.
    (a.main ? cell('main', '주로 부른 음역', span(a.main.low, a.main.high)) : '') +
    (a.stable ? cell('stable', '안정 최고음', a.stable.note) : '') + '</div>' +
    '<p class="range-period" data-range-period>' + e(longDate(a.firstDate) + ' ~ ' + longDate(a.lastDate) + ' · 녹음 ' + a.n + '개 · ' + a.months + '개월') + '</p>';
}
/** The marks of one period on the note axis (y: MIDI → % from the top): observed band, main band, stable line, labels. */
function marks(m, y) {
  // The observed band needs an end to hang on: both ends → a band; one end → a short mark at that note.
  const ends = [m.high, m.low].filter(Boolean), top = ends.length ? y(Math.max(...ends.map(x => x.midi))) : null, bottom = ends.length ? y(Math.min(...ends.map(x => x.midi))) : null;
  return '<div class="range-track"><div class="range-area">' +
    (ends.length ? '<span class="range-band' + (ends.length === 2 ? '' : ' is-point') + '" style="top:' + top + '%;height:' + (bottom - top).toFixed(2) + '%"></span>' : '') +
    (m.main ? '<span class="range-main" style="top:' + y(m.main.high.midi) + '%;height:' + (y(m.main.low.midi) - y(m.main.high.midi)).toFixed(2) + '%"></span>' : '') +
    (m.stable ? '<span class="range-stable" style="top:' + y(m.stable.midi) + '%"></span>' : '') +
    (m.high ? '<span class="range-hi" style="top:' + y(m.high.midi) + '%">' + m.high.note + '</span>' : '') +
    (m.low ? '<span class="range-lo" style="top:' + y(m.low.midi) + '%">' + m.low.note + '</span>' : '') +
    '</div></div>';
}
const legend = (list, small) => '<p class="range-legend" aria-hidden="true"><span><i class="k-band"></i>자주 닿은 음역</span>' + (list.some(m => m.main) ? '<span><i class="k-main"></i>주로 부른 음역</span>' : '') +
  (list.some(m => m.stable) ? '<span><i class="k-stable"></i>안정 최고음</span>' : '') + (small ? '<span><i class="k-small"></i>녹음 3개 미만</span>' : '') + '</p>';
/** Months on x, notes on y: a light band from 자주 닿은 최저음 to 자주 닿은 최고음, the darker band where most of
 * the singing was, a line at the stable highest note. A month whose recordings share no highest or lowest note
 * (fewer than K have that end) is drawn without that end, never with a guessed one. */
function chart(model) {
  const ax = model.axis, months = model.shown;
  if (!ax) return '';
  const y = midi => ((ax.max - midi) / (ax.max - ax.min) * 100).toFixed(2);
  const first6 = months.length - 6;
  const col = (m, i) => {
    const year = m.month.endsWith('-01') || i === 0 ? ' range-year' : i === first6 ? ' range-year range-year-narrow' : '';
    const foot = '<span class="range-month' + year + '"><small>' + (year ? m.month.slice(0, 4) : '') + '</small>' + Number(m.month.slice(5, 7)) + '월</span>' +
      '<span class="range-count">' + (m.n ? m.n + '개' : '없음') + '</span>';
    if (!m.n) return '<div class="range-col is-empty" data-range-col="' + m.month + '" data-range-n="0"><div class="range-track"></div>' + foot + '</div>';
    return '<div class="range-col' + (m.enough ? '' : ' is-small') + '" data-range-col="' + m.month + '" data-range-n="' + m.n + '" data-range-high="' + (m.high?.note || '') + '" data-range-low="' + (m.low?.note || '') + '">' +
      marks(m, y) + foot + '</div>';
  };
  const label = '달별 자주 닿은 음역. ' + months.map(m => Number(m.month.slice(5, 7)) + '월 ' + (m.n ? (m.low && m.high ? span(m.low, m.high) : m.high ? '최고음 ' + m.high.note : m.low ? '최저음 ' + m.low.note : '함께 나온 음 없음') + ', 녹음 ' + m.n + '개' : '셀 수 있는 녹음 없음')).join('. ') + '. 자세한 값은 아래 달별 값 보기에 있어요.';
  return '<div class="range-chart" role="img" aria-label="' + e(label) + '" data-range-chart>' +
    '<div class="range-axis" aria-hidden="true"><div class="range-area">' + ax.ticks.map(t => '<span style="top:' + y(t.midi) + '%">' + t.note + '</span>').join('') + '</div></div>' +
    '<div class="range-plot"><div class="range-lines" aria-hidden="true">' + ax.ticks.map(t => '<span style="top:' + y(t.midi) + '%"></span>').join('') + '</div>' +
    '<div class="range-cols" style="--range-cols:' + months.length + ';--range-cols-narrow:' + Math.min(6, months.length) + '">' + months.map(col).join('') + '</div></div></div>' +
    legend(months, months.some(m => m.n && !m.enough)) + usedLine(model);
}
/** What the numbers were made from: only the recordings that passed the range rules, out of all of the chosen kinds. */
const usedLine = model => '<p class="range-used" data-range-used><i class="ph ph-seal-check" aria-hidden="true"></i><span>신뢰도 높은 녹음 <b>' + model.used.counted + '개</b>로 계산했어요 (전체 ' + model.used.total + '개 중)</span></p>';
function changeLine(model) {
  const c = model.change;
  return '<p class="range-change" data-range-change data-state="' + c.state + '"><i class="ph ' + (c.state === 'ok' ? 'ph-arrows-vertical' : 'ph-hourglass-low') + '" aria-hidden="true"></i><span>' + e(R.changeText(c)) + '</span></p>' +
    '<p class="range-note">달마다 부른 곡이 달라서 음역도 달라 보일 수 있어요. 높아지거나 낮아진 것을 실력 변화로 판정하지 않아요. 같은 곡끼리 본 변화는 위 6가지 지표의 음역 확장에 있어요.</p>';
}
/* ---------- 처음 · 지금 ---------- */
const switchHtml = () => '<div class="range-views" role="group" aria-label="음역을 보는 방법">' + VIEWS.map(([id, label]) =>
  '<button type="button" data-range-view="' + id + '" aria-pressed="' + (view === id) + '">' + label + '</button>').join('') + '</div>';
/** The earliest and the latest window side by side on one note axis, the line about the two, and the table. */
function compareHtml(model) {
  const c = model.compare;
  if (c.state !== 'ok') return '<div class="range-empty" data-range-compare-short><strong>아직 비교할 만큼 기간이 쌓이지 않았어요</strong><p>' +
    e(R.compareText(c).replace(/^아직 비교할 만큼 기간이 쌓이지 않았어요 · /, '')) + '</p><p>처음과 지금은 각각 녹음이 있는 달을 ' + c.need.months + '개(또는 녹음 ' + c.need.recordings + '개가 찰 때)까지 묶고, 두 기간이 겹치지 않아야 비교해요.</p></div>';
  const ax = c.axis, y = midi => ((ax.max - midi) / (ax.max - ax.min) * 100).toFixed(2);
  const col = (key, name, s) => '<div class="range-col" data-range-side="' + key + '" data-range-n="' + s.n + '" data-range-high="' + (s.high?.note || '') + '" data-range-low="' + (s.low?.note || '') + '">' + marks(s, y) +
    '<span class="range-month">' + name + '</span><span class="range-count" data-range-side-period>' + e(s.period) + '</span><span class="range-count" data-range-side-n>녹음 ' + s.n + '개</span></div>';
  const words = s => (s.low && s.high ? span(s.low, s.high) : s.high ? '최고음 ' + s.high.note : s.low ? '최저음 ' + s.low.note : '함께 나온 음 없음') + ', 녹음 ' + s.n + '개';
  const label = '처음과 지금의 자주 닿은 음역. 처음 ' + c.first.period + ' ' + words(c.first) + '. 지금 ' + c.now.period + ' ' + words(c.now) + '. 자세한 값은 아래 표에 있어요.';
  const cell = (row, side) => row[side] ? e(row[side]) : '<span class="range-dash" title="' + e(R.missingText(row)) + '">—</span>';
  return (ax ? '<div class="range-chart range-pair" role="img" aria-label="' + e(label) + '" data-range-compare-chart>' +
      '<div class="range-axis" aria-hidden="true"><div class="range-area">' + ax.ticks.map(t => '<span style="top:' + y(t.midi) + '%">' + t.note + '</span>').join('') + '</div></div>' +
      '<div class="range-plot"><div class="range-lines" aria-hidden="true">' + ax.ticks.map(t => '<span style="top:' + y(t.midi) + '%"></span>').join('') + '</div>' +
      '<div class="range-cols" style="--range-cols:2;--range-cols-narrow:2">' + col('first', '처음', c.first) + col('now', '지금', c.now) + '</div></div></div>' + legend([c.first, c.now], false) : '') +
    '<p class="range-used" data-range-used><i class="ph ph-seal-check" aria-hidden="true"></i><span>신뢰도 높은 녹음 가운데 처음 <b>' + c.first.n + '개</b>, 지금 <b>' + c.now.n + '개</b>로 계산했어요 (전체 ' + model.used.total + '개 중 ' + model.used.counted + '개가 신뢰도 높은 녹음)</span></p>' +
    '<p class="range-change" data-range-compare-line data-state="ok"><i class="ph ph-arrows-left-right" aria-hidden="true"></i><span>' + e(R.compareText(c)) + '</span></p>' +
    '<p class="range-note">두 기간에 부른 곡이 달라서 음역도 달라 보일 수 있어요. 높아지거나 낮아진 것을 실력 변화로 판정하지 않아요. 사이의 달은 채우지 않고 두 기간만 봐요.</p>' +
    '<table class="range-table" data-range-compare-table><caption class="range-sr">처음과 지금의 음역 값</caption><thead><tr><th scope="col"></th><th scope="col">처음</th><th scope="col">지금</th><th scope="col">차이</th></tr></thead><tbody>' +
    c.rows.map(row => '<tr data-range-compare-row="' + row.key + '"><th scope="row">' + row.label + '</th><td>' + cell(row, 'first') + '</td><td>' + cell(row, 'now') + '</td><td>' +
      (row.delta == null ? '<span class="range-dash">—</span>' : e(R.deltaText(row))) + '</td></tr>').join('') + '</tbody></table>' +
    (c.rows.some(r => r.missing) ? '<p class="range-note" data-range-compare-missing>— 는 그 기간에 여러 녹음(K개)에 함께 나온 값이 없다는 뜻이에요. 한두 녹음의 값으로 채우지 않아요.</p>' : '');
}
/** One month in words (the text form of the chart, and the 월별 분석 row). */
function monthLines(m) {
  const left = R.leftText(m?.left);
  const dropped = R.droppedText(m?.dropped), octave = R.octaveText(m?.octave);
  return (m?.n ? '<p data-range-values>' + e(R.valuesText(m)) + '</p><small data-range-sample>' + e(R.sampleText(m)) + '</small>' : '<p data-range-values>셀 수 있는 녹음이 없어요</p>') +
    (octave ? '<small data-range-octave-month>' + e(octave) + '</small>' : '') + (dropped ? '<small data-range-dropped-month>' + e(dropped) + '</small>' : '') + (left ? '<small data-range-left>' + e(left) + '</small>' : '');
}
function monthList(model) {
  return '<details class="growth-measure-help range-details" data-range-months><summary>달별 값 보기</summary><ul class="range-rows">' +
    model.months.slice().reverse().map(m => '<li data-range-row="' + m.month + '"><strong>' + longMonth(m.month) + '</strong>' + monthLines(m) + '</li>').join('') + '</ul></details>';
}
function what(model) {
  const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
  const rows = (o, words) => Object.keys(words).filter(k => o[k]).map(k => '<li>' + e(Array.isArray(words[k]) ? words[k][0] : words[k]) + ' <b>' + o[k] + '개</b></li>').join('');
  return '<details class="growth-measure-help range-details" data-range-what><summary>무엇을 셌나요</summary>' +
    '<h3>센 녹음 ' + model.all.n + '개</h3><ul data-range-counted>' + model.groups.map(g => '<li data-range-counted-group="' + g.id + '">' + e(g.label) + ' <b>' + (g.on ? g.counted + '개' : '뺌 (' + g.counted + '개)') + '</b></li>').join('') + '</ul>' +
    (sum(model.left) ? '<h3>고른 종류 가운데 뺀 녹음 ' + sum(model.left) + '개</h3><ul data-range-left-all>' + rows(model.left, R.LEFT) + '</ul>' : '') +
    (sum(model.all.octave) + sum(model.all.dropped) ? '<h3>센 녹음 가운데 한쪽 끝만 뺀 것</h3>' +
      (sum(model.all.octave) ? '<ul data-range-octave>' + rows(model.all.octave, R.OCTAVE) + '</ul>' : '') +
      (sum(model.all.dropped) ? '<ul data-range-dropped>' + rows(model.all.dropped, R.DROPPED) + '</ul>' : '') : '') +
    (sum(model.excluded) ? '<h3>처음부터 세지 않는 녹음 ' + sum(model.excluded) + '개</h3><ul data-range-excluded>' + rows(model.excluded, R.EXCLUDED) + '</ul>' : '') +
    '<h3>이렇게 봐요</h3><ul class="range-method">' +
    '<li><b>자주 닿은 최고음 · 최저음</b> 녹음마다 0.2초 이상 또렷하게 이어 부른 가장 높은 음과 낮은 음을 모으고, 그 달 녹음 넷 중 하나 이상이 닿은 음을 써요. 몇 번만 잡힌 음이나 한순간 스친 음(순간 최고음)은 쓰지 않아요.</li>' +
    '<li><b>주로 부른 음역</b> 녹음마다 노래한 시간의 10~90%가 들어 있는 음역을 구하고, 그 달 녹음들의 가운데 값을 써요.</li>' +
    '<li><b>안정 최고음</b> 0.5초 이상 흔들림 작게 유지한 가장 높은 음을 같은 방법으로 모아요. 자주 닿은 최고음보다 높게 쓰지 않아요. 안정 최저음은 분석에 없어서 보여 드리지 않아요.</li>' +
    '<li><b>신뢰도 높은 녹음만</b> 음역은 가장 높은 음과 낮은 음을 보는 것이라 반주를 목소리로 잘못 읽으면 크게 틀려요. 그래서 반주가 따로 잡히지 않았거나, 목소리가 반주보다 ' + R.RULES.separationDb + 'dB 이상 크거나, AI로 목소리를 분리해 잰 녹음만 세요.</li>' +
    '<li><b>검출 한계</b> 음높이는 ' + R.DETECTOR.minHz + '~' + R.DETECTOR.maxHz + 'Hz 안에서만 찾아요. 그 끝에 걸린 음(D#2 이하, C6 이상)은 부른 음이 아니라 찾는 범위의 끝이라 그 녹음에서 그쪽 끝만 빼요.</li>' +
    '<li><b>옥타브쯤 떨어진 음</b> 음높이를 읽다가 잠깐 한 옥타브 위아래나 반주를 잡을 때가 있어요. 그 녹음에서 주로 부른 음역보다 ' + R.RULES.octaveGapSemitones + '반음 넘게 벗어난 끝은 그렇게 잡힌 음으로 보고 그쪽 끝만 빼요.</li>' +
    '<li><b>평소와 다른 녹음</b> 주로 부른 음역이 평소' + (model.usual ? '(' + span(model.usual.low, model.usual.high) + ', 고른 종류 녹음들의 가운데 값)' : '(고른 종류 녹음들의 가운데 값)') + '보다 ' + R.RULES.unusualSemitones + '반음 넘게 낮거나 높은 녹음은 다른 목소리이거나 옥타브가 통째로 잘못 잡혔을 수 있어서 통째로 빼요. 셀 수 있는 녹음이 ' + R.RULES.unusualMinRecordings + '개보다 적으면 평소를 알 수 없어 이 규칙을 쓰지 않아요.</li>' +
    '<li><b>넷 중 하나 이상</b> 한 달의 자주 닿은 최고음은 그 달 녹음 가운데 적어도 K개가 닿은 가장 높은 음이에요(최저음·안정 최고음도 같아요). K는 ' + R.RULES.minSamples + '개와 그 끝이 남은 녹음의 ' + Math.round(R.RULES.share * 100) + '% 가운데 큰 쪽이에요. 센 녹음이 ' + R.RULES.minSamples + '개보다 적은 달은 가려낼 수 없어 그대로 보여 주고 흐리게 표시해요.</li>' +
    '<li><b>빈 달</b> 믿을 수 있는 녹음이 없는 달은 비워 두고, 앞뒤 달로 채우지 않아요.</li>' +
    '<li><b>날짜</b> 녹음 날짜가 없는 녹음은 만든 시각의 한국 날짜로 달을 정해요.</li></ul>' +
    '<div class="range-diag"><button type="button" class="btn sm secondary" data-range-diagnosis><i class="ph ph-file-arrow-down" aria-hidden="true"></i> 진단 파일 저장</button>' +
    '<p>녹음마다 달·종류와 측정 숫자(목소리 길이, 신뢰도, 반주와의 크기 차이, 음역 값), 셌는지와 뺀 이유만 담아요. 제목·곡 이름·파일 이름·날짜(일)·음성은 담지 않아요.</p></div></details>';
}
/** The section of 결과 리포트 › 전체. */
function html(items) {
  const model = modelOf(items);
  const head = '<header class="growth-panel-head"><div><h2 id="range-flow-title">전체 음역 흐름</h2>' +
    '<p class="growth-section-caption" data-range-lead>녹음에서 실제로 잡힌 음을 달마다 모았어요. ‘자주 닿은’ 음은 그 달 녹음 넷 중 하나 이상이 닿은 음이에요. 관측한 값이고 실력 판정이 아니에요.</p></div></header>';
  let body;
  if (model.none) body = '<div class="range-empty" data-range-empty="none"><strong>고른 종류가 없어요</strong><p>위에서 셀 녹음 종류를 하나 이상 골라 주세요.</p></div>';
  else if (model.empty) body = '<div class="range-empty" data-range-empty="empty"><strong>아직 음역을 셀 수 있는 녹음이 없어요</strong><p>분석한 곡 녹음·보이스 체크·트레이닝·레슨 녹음이 생기면 달마다 여기에 쌓여요.' +
    (R.leftText(model.left) ? ' ' + e(R.leftText(model.left)) + '.' : '') + '</p></div>' + what(model);
  else body = switchHtml() + stats(model) + (view === 'compare' ? compareHtml(model) : chart(model) + changeLine(model) + monthList(model)) + what(model);
  return '<section class="growth-panel range-flow" data-range-flow data-range-section data-range-view-now="' + view + '" aria-labelledby="range-flow-title">' + head + chips(model) + body + '</section>';
}
/** Chips (turn a kind on or off), the 달별 흐름 | 처음·지금 switch and the diagnosis file. */
function bind(host, items) {
  const section = host?.querySelector?.('[data-range-section]');
  if (!section) return;
  const save = section.querySelector('[data-range-diagnosis]');
  if (save) save.onclick = async () => {
    save.disabled = true;
    try {
      const data = JSON.stringify(R.diagnosis(V.growthDataset(items || []).forRange(), {generatedMonth:today().slice(0, 7)}));
      const out = new File([data], 'vocalzip-range-diagnosis.json', {type:'application/json'});
      if (navigator.canShare?.({files:[out]}) && navigator.share) { try { await navigator.share({files:[out], title:'음역 진단 파일'}); return; } catch (error) { if (error?.name === 'AbortError') return; } }
      const url = URL.createObjectURL(out), link = document.createElement('a'); link.href = url; link.download = out.name; link.hidden = true; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
      V.toast('진단 파일을 저장했어요.');
    } catch (error) { V.toast('진단 파일을 만들지 못했어요: ' + (error.message || error), 'error'); }
    finally { if (save.isConnected) save.disabled = false; }
  };
  // Draw the section again (the open lists stay open, the control that was used keeps the focus).
  const redraw = focus => {
    const open = ['[data-range-months]', '[data-range-what]'].filter(sel => section.querySelector(sel)?.open);
    const wrap = document.createElement('div'); wrap.innerHTML = html(items);
    const next = wrap.firstElementChild;
    for (const sel of open) { const d = next.querySelector(sel); if (d) d.open = true; }
    section.replaceWith(next);
    bind(host, items);
    next.querySelector(focus)?.focus({preventScroll:true});
  };
  section.querySelectorAll('[data-range-group]').forEach(button => button.onclick = () => {
    const id = button.dataset.rangeGroup;
    if (off.has(id)) off.delete(id); else off.add(id);
    redraw('[data-range-group="' + id + '"]');
  });
  section.querySelectorAll('[data-range-view]').forEach(button => button.onclick = () => {
    if (button.dataset.rangeView === view) return;
    setView(button.dataset.rangeView);
    redraw('[data-range-view="' + view + '"]');
  });
}
/** 월별 분석: that month's row (every kind counted — this view has no chips; the line says what it was made of). */
function monthHtml(items, month) {
  const m = modelOf(items, {all:true}).months.find(x => x.month === month) || null;
  return '<section class="card growth-section range-month-card" data-range-flow data-range-month="' + e(month) + '"><h2>이 달의 음역</h2>' + monthLines(m) +
    '<p class="small muted">관측한 값이고 실력 판정이 아니에요. 달별 흐름은 전체 분석의 전체 음역 흐름에서 볼 수 있어요.</p></section>';
}
window.VzipGrowthRangeUI = {html, bind, monthHtml, model:modelOf, reset:() => { off.clear(); setView('flow'); }};
})();
