/* VOCAL.zip 전체 음역 흐름 — the section of 결과 리포트 › 전체 and the month row of 월별 분석 (성장 2단계, design guide §26).
 * Read-only: nothing is stored or changed. Every value comes from app/growth-range-model.js (VzipGrowthRange), which
 * reads the dataset's range selection (app/growth-dataset.js forRange): 곡 녹음 · 매일 보이스 체크 · 트레이닝 · 레슨 녹음.
 * Words: 관측 (what was sung), never 성장·향상; a month without a reliable recording is drawn empty.
 * The chips choose which kinds are counted — for this visit only (all on again after a reload). */
(() => {
'use strict';
const V = window.VZ, R = window.VzipGrowthRange, D = window.VzipGrowthDataset;
if (!V || !R || !D || !V.growthDataset) return;
const e = V.esc;
const off = new Set();                                   // kinds turned off on this visit
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
  return '<div class="range-stats" role="group" aria-label="지금까지 관측한 음역">' +
    (a.low ? cell('observed', '관측 최저음 ~ 최고음', span(a.low, a.high)) : cell('observed', '관측 최고음', a.high.note)) +
    // A row the analyses cannot fill is left out, never estimated.
    (a.main ? cell('main', '주로 부른 음역', span(a.main.low, a.main.high)) : '') +
    (a.stable ? cell('stable', '안정 최고음', a.stable.note) : '') + '</div>' +
    '<p class="range-period" data-range-period>' + e(longDate(a.firstDate) + ' ~ ' + longDate(a.lastDate) + ' · 녹음 ' + a.n + '개 · ' + a.months + '개월') + '</p>';
}
/** Months on x, notes on y: a light band from the lowest to the highest observed note, the darker band where most of
 * the singing was, a line at the stable highest note, a ring for a note only one recording reached. */
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
    const top = y(m.high.midi), bottom = m.low ? y(m.low.midi) : top;
    const lone = [m.high.lone, m.low?.lone].filter(Boolean).map(x => '<span class="range-lone" style="top:' + y(x.midi) + '%" data-range-lone="' + x.note + '"></span>').join('');
    return '<div class="range-col' + (m.enough ? '' : ' is-small') + '" data-range-col="' + m.month + '" data-range-n="' + m.n + '" data-range-high="' + m.high.note + '" data-range-low="' + (m.low?.note || '') + '">' +
      '<div class="range-track"><div class="range-area">' +
      '<span class="range-band' + (m.low ? '' : ' is-point') + '" style="top:' + top + '%;height:' + (bottom - top).toFixed(2) + '%"></span>' +
      (m.main ? '<span class="range-main" style="top:' + y(m.main.high.midi) + '%;height:' + (y(m.main.low.midi) - y(m.main.high.midi)).toFixed(2) + '%"></span>' : '') +
      (m.stable ? '<span class="range-stable" style="top:' + y(m.stable.midi) + '%"></span>' : '') + lone +
      '<span class="range-hi" style="top:' + top + '%">' + m.high.note + '</span>' +
      (m.low ? '<span class="range-lo" style="top:' + bottom + '%">' + m.low.note + '</span>' : '') +
      '</div></div>' + foot + '</div>';
  };
  const label = '달별 관측 음역. ' + months.map(m => Number(m.month.slice(5, 7)) + '월 ' + (m.n ? (m.low ? span(m.low, m.high) : '최고음 ' + m.high.note) + ', 녹음 ' + m.n + '개' : '셀 수 있는 녹음 없음')).join('. ') + '. 자세한 값은 아래 달별 값 보기에 있어요.';
  const any = key => months.some(m => key === 'lone' ? m.high?.lone || m.low?.lone : m[key]);
  return '<div class="range-chart" role="img" aria-label="' + e(label) + '" data-range-chart>' +
    '<div class="range-axis" aria-hidden="true"><div class="range-area">' + ax.ticks.map(t => '<span style="top:' + y(t.midi) + '%">' + t.note + '</span>').join('') + '</div></div>' +
    '<div class="range-plot"><div class="range-lines" aria-hidden="true">' + ax.ticks.map(t => '<span style="top:' + y(t.midi) + '%"></span>').join('') + '</div>' +
    '<div class="range-cols" style="--range-cols:' + months.length + ';--range-cols-narrow:' + Math.min(6, months.length) + '">' + months.map(col).join('') + '</div></div></div>' +
    '<p class="range-legend" aria-hidden="true"><span><i class="k-band"></i>관측 음역</span>' + (any('main') ? '<span><i class="k-main"></i>주로 부른 음역</span>' : '') +
    (any('stable') ? '<span><i class="k-stable"></i>안정 최고음</span>' : '') + (any('lone') ? '<span><i class="k-lone"></i>한 녹음에서만 나온 음</span>' : '') +
    (months.some(m => m.n && !m.enough) ? '<span><i class="k-small"></i>녹음 3개 미만</span>' : '') + '</p>';
}
function changeLine(model) {
  const c = model.change;
  return '<p class="range-change" data-range-change data-state="' + c.state + '"><i class="ph ' + (c.state === 'ok' ? 'ph-arrows-vertical' : 'ph-hourglass-low') + '" aria-hidden="true"></i><span>' + e(R.changeText(c)) + '</span></p>' +
    '<p class="range-note">달마다 부른 곡이 달라서 음역도 달라 보일 수 있어요. 높아지거나 낮아진 것을 실력 변화로 판정하지 않아요. 같은 곡끼리 본 변화는 위 6가지 지표의 음역 확장에 있어요.</p>';
}
/** One month in words (the text form of the chart, and the 월별 분석 row). */
function monthLines(m) {
  const left = R.leftText(m?.left);
  return (m?.n ? '<p data-range-values>' + e(R.valuesText(m)) + '</p><small data-range-sample>' + e(R.sampleText(m)) + '</small>' : '<p data-range-values>셀 수 있는 녹음이 없어요</p>') +
    (left ? '<small data-range-left>' + e(left) + '</small>' : '');
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
    (sum(model.excluded) ? '<h3>처음부터 세지 않는 녹음 ' + sum(model.excluded) + '개</h3><ul data-range-excluded>' + rows(model.excluded, R.EXCLUDED) + '</ul>' : '') +
    '<h3>이렇게 봐요</h3><ul class="range-method">' +
    '<li><b>관측 최고음 · 최저음</b> 0.2초 이상 또렷하게 이어 부른 음 가운데 가장 높은 음과 낮은 음이에요. 한순간 스친 음(순간 최고음)은 쓰지 않아요.</li>' +
    '<li><b>주로 부른 음역</b> 녹음마다 노래한 시간의 10~90%가 들어 있는 음역을 구하고, 그 달 녹음들의 가운데 값을 써요.</li>' +
    '<li><b>안정 최고음</b> 0.5초 이상 흔들림 작게 유지한 가장 높은 음이에요. 안정 최저음은 분석에 없어서 보여 드리지 않아요.</li>' +
    '<li><b>한 녹음에서만 나온 음</b> 녹음이 ' + R.RULES.minSamples + '개 이상인 달에 한 녹음만 다른 녹음보다 ' + R.RULES.loneGap + '반음 이상 높거나 낮으면, 그 음은 띠에 넣지 않고 동그라미로 따로 표시해요. 녹음이 1~2개인 달은 가려낼 수 없어 그대로 보여 주고 흐리게 표시해요.</li>' +
    '<li><b>빈 달</b> 믿을 수 있는 녹음이 없는 달은 비워 두고, 앞뒤 달로 채우지 않아요.</li>' +
    '<li><b>날짜</b> 녹음 날짜가 없는 녹음은 만든 시각의 한국 날짜로 달을 정해요.</li></ul></details>';
}
/** The section of 결과 리포트 › 전체. */
function html(items) {
  const model = modelOf(items);
  const head = '<header class="growth-panel-head"><div><h2 id="range-flow-title">전체 음역 흐름</h2>' +
    '<p class="growth-section-caption">녹음에서 실제로 잡힌 음을 달마다 모았어요. 관측한 값이고 실력 판정이 아니에요.</p></div></header>';
  let body;
  if (model.none) body = '<div class="range-empty" data-range-empty="none"><strong>고른 종류가 없어요</strong><p>위에서 셀 녹음 종류를 하나 이상 골라 주세요.</p></div>';
  else if (model.empty) body = '<div class="range-empty" data-range-empty="empty"><strong>아직 음역을 셀 수 있는 녹음이 없어요</strong><p>분석한 곡 녹음·보이스 체크·트레이닝·레슨 녹음이 생기면 달마다 여기에 쌓여요.' +
    (R.leftText(model.left) ? ' ' + e(R.leftText(model.left)) + '.' : '') + '</p></div>' + what(model);
  else body = stats(model) + chart(model) + changeLine(model) + monthList(model) + what(model);
  return '<section class="growth-panel range-flow" data-range-flow data-range-section aria-labelledby="range-flow-title">' + head + chips(model) + body + '</section>';
}
/** Chips: turn a kind on or off and draw the section again (the open lists stay open, the chip keeps the focus). */
function bind(host, items) {
  const section = host?.querySelector?.('[data-range-section]');
  if (!section) return;
  section.querySelectorAll('[data-range-group]').forEach(button => button.onclick = () => {
    const id = button.dataset.rangeGroup;
    if (off.has(id)) off.delete(id); else off.add(id);
    const open = ['[data-range-months]', '[data-range-what]'].filter(sel => section.querySelector(sel)?.open);
    const wrap = document.createElement('div'); wrap.innerHTML = html(items);
    const next = wrap.firstElementChild;
    for (const sel of open) { const d = next.querySelector(sel); if (d) d.open = true; }
    section.replaceWith(next);
    bind(host, items);
    next.querySelector('[data-range-group="' + id + '"]')?.focus({preventScroll:true});
  });
}
/** 월별 분석: that month's row (every kind counted — this view has no chips; the line says what it was made of). */
function monthHtml(items, month) {
  const m = modelOf(items, {all:true}).months.find(x => x.month === month) || null;
  return '<section class="card growth-section range-month-card" data-range-flow data-range-month="' + e(month) + '"><h2>이 달의 음역</h2>' + monthLines(m) +
    '<p class="small muted">관측한 값이고 실력 판정이 아니에요. 달별 흐름은 전체 분석의 전체 음역 흐름에서 볼 수 있어요.</p></section>';
}
window.VzipGrowthRangeUI = {html, bind, monthHtml, model:modelOf, reset:() => off.clear()};
})();
