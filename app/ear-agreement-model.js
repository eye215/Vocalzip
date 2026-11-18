/* 귀와 숫자 — do the measured numbers move the way the singer or the teacher heard? Pure (no DOM, no storage; also
 * loaded by the Node tests). Derived on the fly from what is already kept: nothing is stored or changed.
 * The screens are app/growth-changes-ui.js (결과 리포트 › 무엇이 달라졌나 › 귀와 숫자, and 이 평가와 숫자 under each verdict).
 *
 * For every listening verdict (app/listen-verdict-model.js) whose two takes are both here, analysed, reliable (the
 * growth `ok` rule), measured the SAME way (녹음 그대로 / MR 빼고 / AI 분리 후, as app/growth-changes-model.js methodOf)
 * and with the SAME analysis version, each measure is compared by app/growth-metrics-model.js compareMetric (as comparePair) — the
 * report's own definitions, good directions and "비슷함" tolerances — and its movement is held against
 *   · the verdict's overall choice (first / same / second), and
 *   · the matching 자세히 tag when the verdict gave one (TAG_OF below).
 * Per measure: agree (같은 쪽) / disagree (반대) / no signal (차이 없음: the measure stayed about the same, or the person
 * heard the two as 비슷해요). A measure withheld for the pair (판정 보류) is not counted at all.
 *
 * Words: an observation about these verdicts and these songs only ("귀와 같은 쪽으로 움직였어요 N번 중 M번"), never a
 * claim that a measure is right or wrong, nor that a take is better. */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./growth-metrics-model.js') : root.VzipGrowthMetrics,
    node ? require('./growth-changes-model.js') : root.VzipGrowthChanges, node ? require('./listen-verdict-model.js') : root.VzipListenVerdict);
  if (node) module.exports = api; else root.VzipEarAgreement = api;
})(typeof self !== 'undefined' ? self : globalThis, (G, C, L) => {
'use strict';
/** Verdicts that can be compared before anything is summed up. */
const MIN_VERDICTS = 3;
/** Agreements, with no disagreement, before a measure's same-song line may carry the "귀와 자주 같아요" mark. */
const OFTEN = 3;
/**
 * The measures held against the ear, in the order they are shown. side: what the take on the measure's good side has
 * ("11월 녹음에서 지속음 흔들림이 더 작아요"). range / mainHigh have no good direction in the report (never better/worse);
 * here only "the higher note" is taken as the side, to see whether it happens to go with the ear — a FIRST GUESS.
 */
const MEASURES = [
  {id:'intonation', name:'가까운 반음과의 차이', side:'가까운 반음과의 차이가 더 작아요', similar:'가까운 반음과의 차이는 비슷해요'},
  {id:'stability', name:'지속음 흔들림', side:'지속음 흔들림이 더 작아요', similar:'지속음 흔들림은 비슷해요'},
  {id:'phrase', name:'같은 프레이즈 길이', side:'같은 프레이즈를 더 길게 이어 불렀어요', similar:'같은 프레이즈 길이는 비슷해요'},
  {id:'high', name:'고음 구간 흔들림', side:'고음 구간이 덜 흔들리거나 더 오래 머물렀어요', similar:'고음 구간 흔들림은 비슷해요'},
  {id:'range', name:'안정 최고음', side:'안정 최고음이 더 높아요', similar:'안정 최고음은 같아요'},
  {id:'mainHigh', name:'주로 부른 음역 위쪽', side:'주로 부른 음역 위쪽이 더 높아요', similar:'주로 부른 음역 위쪽은 같아요'}
];
/**
 * FIRST GUESS, not checked against real verdicts: which 자세히 tag (listen-verdict TAGS) each measure is held against.
 * 음정 ↔ the two intonation measures; 호흡 ↔ the same phrases' length; 소리 길 (편안함·연결) ↔ how the high zone holds
 * and how high the voice stays steady. 소리 크기·힘 and 표현 have no measure here. Change it freely as verdicts come in.
 */
const TAG_OF = {intonation:'pitch', stability:'pitch', phrase:'breath', high:'path', range:'path', mainHigh:'path'};
const TAG_NAME = Object.fromEntries(L.TAGS.map(([k, n]) => [k, n]));
const RESULT = {agree:'같은 쪽', disagree:'반대', none:'차이 없음'};
const byId = Object.fromEntries(MEASURES.map(m => [m.id, m]));

/** Why a verdict's pair cannot be held against the numbers; who: the take(s) it is about ("8월 녹음", "8월·11월 녹음"). */
const EXCLUDE = {
  missing:who => who + '이 지워졌거나 이 기기에 없어요',
  'no-analysis':who => who + '은 아직 분석하지 않았어요',
  unreliable:who => who + '은 측정 신뢰도가 낮아요 (목소리가 짧거나 반주가 커요)',
  'version-mixed':() => '두 녹음의 분석 버전이 달라요 · 같은 버전으로 잰 녹음끼리만 견줘요',
  'no-metric':() => '두 녹음에 함께 잰 숫자가 없어요'
};

/**
 * How one measure moved between the two takes of a pair. report: comparePair(first, second).
 * → {id, move: 'first' | 'second' | 'similar' | 'mixed' | 'hold', reason?, numbers}. 'second' = toward the later take.
 */
function movement(id, report) {
  if (id === 'mainHigh') {
    const r = report.range;
    if (!r || r.state === 'hold') return {id, move:'hold', reason:r?.reason || 'no-data'};
    if (!r.main) return {id, move:'hold', reason:'no-data'};
    const d = r.main.highDelta;
    return {id, move:d > 0 ? 'second' : d < 0 ? 'first' : 'similar', numbers:r.main.before + ' → ' + r.main.after, delta:d};
  }
  const x = report[id];
  if (!x || x.state === 'hold') return {id, move:'hold', reason:x?.reason || 'no-data'};
  if (id === 'range') return {id, move:x.delta > 0 ? 'second' : x.delta < 0 ? 'first' : 'similar', numbers:x.before + ' → ' + x.after, delta:x.delta};
  // 'changed' (the pair was measured with the MR removed): the report shows its direction as a reference; here too.
  const state = x.state === 'changed' ? x.judged : x.state;
  const numbers = id === 'high' ? x.zone + ' · ' + G.fmt('high', x.before) + ' → ' + G.fmt('high', x.after) : G.fmt(id, x.before) + ' → ' + G.fmt(id, x.after);
  if (state === 'better') return {id, move:'second', numbers, delta:x.delta};
  if (state === 'worse') return {id, move:'first', numbers, delta:x.delta};
  if (state === 'mixed') return {id, move:'mixed', numbers, delta:x.delta};
  return {id, move:'similar', numbers, delta:x.delta};
}
/** A movement held against one choice (first / same / second). */
function result(move, choice) {
  if (choice === 'same') return {result:'none', why:'heard-same'};
  if (move === 'similar' || move === 'mixed') return {result:'none', why:move};
  return {result:move === choice ? 'agree' : 'disagree', why:''};
}

/**
 * One verdict. takeOf(id) → {id, a, date, created, ok} | null (missing); reference(songId) → song.vocalRange or null.
 * → {id, songId, verdict, usable, reason?, text?, method?, version?, rows: [...]}
 */
function pair(v, {takeOf = () => null, reference = () => null} = {}) {
  const [l1, l2] = L.dayLabels(v.firstDate, v.secondDate);
  const out = (reason, sides = [], extra = {}) => ({id:v.id, songId:v.songId, verdict:v, usable:false, reason, sides,
    text:EXCLUDE[reason](sides.length === 2 ? l1 + '·' + l2 + ' 녹음' : (sides[0] === 'first' ? l1 : l2) + ' 녹음'), rows:[], ...extra});
  // Which of the two takes a reason is about: 'first', 'second' or both.
  const which = (x, y, bad) => [bad(x) && 'first', bad(y) && 'second'].filter(Boolean);
  const x = v.firstId ? takeOf(v.firstId) : null, y = v.secondId ? takeOf(v.secondId) : null;
  for (const [reason, bad] of [['missing', t => !t], ['no-analysis', t => !t.a?.metrics], ['unreliable', t => !t.ok]]) {
    const sides = which(x, y, bad);
    if (sides.length) return out(reason, sides);
  }
  const mx = C.methodOf(x.a), my = C.methodOf(y.a);
  if (mx !== my) return {...out('version-mixed'), reason:'method-mixed', methods:[mx, my],
    remeasure:C.remeasure({id:v.firstId, method:mx, label:l1}, {id:v.secondId, method:my, label:l2}),
    text:l1 + ' 녹음은 ' + C.METHOD[mx] + ', ' + l2 + ' 녹음은 ' + C.METHOD[my] + ' 잰 것이라 견주지 않아요 · 같은 방법으로 잰 녹음끼리만 견줘요'};
  if ((x.a.v ?? null) !== (y.a.v ?? null)) return out('version-mixed');
  // comparePair's rules on the verdict's own order (first = the take judged as the earlier one), never re-sorted: the
  // person picked these two takes, so the same-day rule (meant for automatic pairing) does not apply either.
  const opts = {reference:reference(v.songId), sameDay:true};
  const report = Object.fromEntries(['intonation', 'stability', 'phrase', 'high', 'range'].map(id => [id, G.compareMetric(id, x, y, opts)]));
  const rows = MEASURES.map(m => {
    const mv = movement(m.id, report), row = {...mv, name:m.name};
    if (mv.move === 'hold') return {...row, holdText:G.holdText(mv.reason)};
    const o = result(mv.move, v.overall);
    row.overall = o.result; row.why = o.why;
    const tag = TAG_OF[m.id], choice = tag && v.tags?.[tag];
    if (choice) { const t = result(mv.move, choice); row.tag = {key:tag, name:TAG_NAME[tag], choice, result:t.result, why:t.why}; }
    return row;
  });
  if (!rows.some(r => r.move !== 'hold')) { const o = out('no-metric', [], {method:mx, version:x.a.v ?? null}); return {...o, text:o.text + ' · ' + G.holdText(rows.find(r => r.reason)?.reason)}; }
  return {id:v.id, songId:v.songId, verdict:v, usable:true, method:mx, version:x.a.v ?? null, rows};
}

const count = (list, key) => ({agree:list.filter(r => r[key] === 'agree').length, disagree:list.filter(r => r[key] === 'disagree').length, none:list.filter(r => r[key] === 'none').length});
/** "귀와 같은 쪽으로 움직였어요 4번 중 3번 · 차이 없음 2번". */
function statusText(c) {
  const moved = c.agree + c.disagree;
  const head = moved ? '귀와 같은 쪽으로 움직였어요 ' + moved + '번 중 ' + c.agree + '번' : '귀와 견줄 만큼 움직인 적이 아직 없어요';
  return head + (c.none ? ' · 차이 없음 ' + c.none + '번' : '');
}

/**
 * Every verdict. verdicts: VzipListenVerdict.list(db). → {pairs (per verdict, same order), byVerdict (Map id → pair),
 * usable, total, ready, measures: [{id, name, agree, disagree, none, held, text, often, tag}], top, summary, need}.
 */
function build({verdicts = [], takeOf = () => null, reference = () => null} = {}) {
  const pairs = verdicts.map(v => pair(v, {takeOf, reference}));
  const usable = pairs.filter(p => p.usable), ready = usable.length >= MIN_VERDICTS;
  const measures = MEASURES.map(m => {
    const rows = usable.map(p => p.rows.find(r => r.id === m.id)).filter(Boolean);
    const compared = rows.filter(r => r.move !== 'hold'), c = count(compared, 'overall');
    const tagged = compared.filter(r => r.tag), tc = count(tagged.map(r => r.tag), 'result');
    return {id:m.id, name:m.name, ...c, held:rows.length - compared.length, compared:compared.length, text:statusText(c),
      often:ready && c.agree >= OFTEN && c.disagree === 0,
      tag:TAG_OF[m.id] ? {key:TAG_OF[m.id], name:TAG_NAME[TAG_OF[m.id]], ...tc, compared:tagged.length, text:tagged.length ? statusText(tc) : ''} : null};
  });
  // The measure that went with the ear most often: most agreements, then fewest disagreements, then the order above.
  const top = ready ? measures.filter(m => m.agree > m.disagree && m.agree >= 2).sort((a, b) => b.agree - a.agree || a.disagree - b.disagree)[0] || null : null;
  const summary = !ready ? '평가가 ' + MIN_VERDICTS + '개 이상 모이면 보여 드려요 (지금 ' + usable.length + '개)'
    : '평가 ' + usable.length + '개와 견줘 봤어요 · ' + (top ? '이 곡들에서는 ' + top.name + ' 숫자가 귀와 가장 자주 같은 쪽으로 움직였어요 (' + (top.agree + top.disagree) + '번 중 ' + top.agree + '번)'
      : '아직 귀와 꾸준히 같은 쪽으로 움직인 숫자는 없어요');
  return {pairs, byVerdict:new Map(pairs.map(p => [p.id, p])), usable:usable.length, total:pairs.length, ready, measures, top, summary,
    need:Math.max(0, MIN_VERDICTS - usable.length), excluded:pairs.filter(p => !p.usable)};
}

/* ---------- words for one verdict ---------- */
/** "11월 녹음에서 지속음 흔들림이 더 작아요" / "지속음 흔들림은 비슷해요" / "구간마다 다르게 변했어요". */
function moveText(row, v) {
  const m = byId[row.id];
  if (row.move === 'similar') return m.similar;
  if (row.move === 'mixed') return row.id === 'high' ? '고음 구간의 흔들림과 머문 시간이 서로 다르게 변했어요' : '구간마다 다르게 변했어요';
  const [l1, l2] = L.dayLabels(v.firstDate, v.secondDate);
  return (row.move === 'second' ? l2 : l1) + ' 녹음에서 ' + m.side;
}
/** The basis of a verdict's comparison: "MR 빼고 잰 두 녹음 · 분석 v2" (+ that the numbers cover more than was heard). */
function pairBasis(p) {
  const v = p.verdict, part = v.firstRange || v.secondRange;
  return C.METHOD[p.method] + ' 잰 두 녹음 · 분석 v' + (p.version ?? '?') + (part ? ' · 평가는 고른 구간만 들었고, 숫자는 녹음 전체(같은 프레이즈)로 잰 값이에요' : '');
}
/** The one line on a verdict's 이 평가와 숫자: "같은 쪽 2 · 반대 1 · 차이 없음 3" or why it is not compared. */
function pairLine(p) {
  if (!p.usable) return '견줄 수 없어요';
  const c = count(p.rows.filter(r => r.move !== 'hold'), 'overall');
  return ['agree', 'disagree', 'none'].map(k => RESULT[k] + ' ' + c[k]).join(' · ');
}
return {MIN_VERDICTS, OFTEN, MEASURES, TAG_OF, RESULT, EXCLUDE, movement, result, pair, build, statusText, moveText, pairBasis, pairLine};
});
