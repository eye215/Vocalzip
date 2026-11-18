/* 무엇이 달라졌나 — the top of 성장 › 결과 리포트: only changes that are comparable, each with its basis and a way to
 * listen. Pure (no DOM, no storage; also loaded by the Node tests). The card is app/growth-changes-ui.js.
 *
 *   1. 들어 본 평가     the listening verdicts (app/listen-verdict-model.js), newest first, quoted as the person's judgement.
 *   2. 같은 곡 같은 방법  per song, the first and the latest reliable take MEASURED THE SAME WAY — both 녹음 그대로, both MR
 *                      빼고 (analysis.confidence.mrRemoved) or both AI 분리 (confidence.aiSeparated), the way
 *                      app/overall-growth-model.js methodOf reads it — and of the same analysis version, on different days.
 *                      The method is the one of the song's latest reliable take; earlier takes measured another way are
 *                      never paired with it (the song is listed under 비교할 수 없어 뺀 것 with the two methods). The pair
 *                      is compared by app/growth-metrics-model.js comparePair (the 결과 리포트 rules, 판정 보류 included).
 *   3. 같은 과제        발성 정밀 측정 results (app/precision-session-model.js tasks): per task · vowel · loudness, the latest
 *                      result and the earliest result of an earlier day that app/precision-report-model.js compare calls
 *                      comparable. Without any result: an invitation instead.
 *   4. 음역            처음·지금 of app/growth-range-model.js, only when both windows hold enough recordings.
 * Numbers are observations ("흔들림이 줄었어요"), never a verdict on skill. */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./growth-metrics-model.js') : root.VzipGrowthMetrics,
    node ? require('./overall-growth-model.js') : root.VzipOverallGrowth, node ? require('./listen-verdict-model.js') : root.VzipListenVerdict);
  if (node) module.exports = api; else root.VzipGrowthChanges = api;
})(typeof self !== 'undefined' ? self : globalThis, (G, O, L) => {
'use strict';
const methodOf = a => O?.methodOf ? O.methodOf(a) : a?.confidence?.aiSeparated ? 'aiSeparated' : a?.confidence?.mrRemoved ? 'mrRemoved' : 'asRecorded';
/** How a take was measured, as said after it: "MR 빼고 잰 녹음". */
const METHOD = {asRecorded:'녹음 그대로', mrRemoved:'MR 빼고', aiSeparated:'AI 분리 후'};
const measured = m => METHOD[m] + ' 잰';
const ARROW = ' → ';

/* ---------- 2. 같은 곡 같은 방법 ---------- */
/** One measure's change in plain words. [decreased, increased, similar] per measure; range is said as notes. */
const OBS = {
  intonation:['가까운 반음과의 차이가 줄었어요', '가까운 반음과의 차이가 커졌어요', '가까운 반음과의 차이는 비슷해요'],
  stability:['지속음 흔들림이 줄었어요', '지속음 흔들림이 커졌어요', '지속음 흔들림은 비슷해요'],
  phrase:['같은 프레이즈를 더 짧게 이어 불렀어요', '같은 프레이즈를 더 길게 이어 불렀어요', '같은 프레이즈 길이는 비슷해요'],
  high:['고음 구간 흔들림이 줄었어요', '고음 구간 흔들림이 커졌어요', '고음 구간 흔들림은 비슷해요']
};
const SHOWN = ['intonation', 'stability', 'phrase', 'high', 'range'];
/** What each measure is called in a "비슷해요" line that gathers the unchanged ones. */
const NAME = {intonation:'가까운 반음과의 차이', stability:'지속음 흔들림', phrase:'같은 프레이즈 길이', high:'고음 구간 흔들림', range:'안정 최고음'};
function observation(x) {
  if (x.id === 'range') return {id:'range', name:NAME.range, text:x.delta ? '안정 최고음 ' + x.before + ARROW + x.after : '안정 최고음은 같아요 (' + x.after + ')', numbers:x.delta ? '' : x.after, similar:!x.delta};
  const words = OBS[x.id];
  if (!words) return null;
  const numbers = x.id === 'high' ? x.zone + ' · ' + G.fmt('high', x.before) + ARROW + G.fmt('high', x.after) : G.fmt(x.id, x.before) + ARROW + G.fmt(x.id, x.after);
  if (x.state === 'mixed') return {id:x.id, name:NAME[x.id], text:x.id === 'high' ? '고음 구간의 흔들림과 유지 시간이 서로 다르게 변했어요' : '구간마다 다르게 변했어요', numbers, similar:false};
  const similar = x.state === 'similar' || (x.state === 'changed' && x.judged === 'similar') || !x.delta;
  // 'changed' (one side measured with the MR removed or after AI separation): the direction is shown as a reference only.
  return {id:x.id, name:NAME[x.id], text:(similar ? words[2] : words[x.delta < 0 ? 0 : 1]) + (x.state === 'changed' ? ' (참고)' : ''), numbers, similar,
    basis:x.basis === 'phrases' && x.matched ? '같은 프레이즈 ' + x.matched + '개' : x.basis === 'whole' ? '녹음 전체' : ''};
}
/**
 * One song. takes: the song's analysed takes [{id, a, date, created, ok}] (app/growth-dataset.js take shape, verdict rule).
 * → {item} with the pair and its observations, or {excluded} with the reason. null when nothing was measured.
 */
function songChange({songId, title = '', takes = [], reference = null}) {
  const measuredTakes = takes.filter(t => t?.a?.metrics);
  if (!measuredTakes.length) return null;
  const list = measuredTakes.filter(t => t.ok && t.date).slice().sort(G.takeOrder);
  const out = reason => ({excluded:{kind:'song', songId, title, ...reason}});
  if (!list.length) return out({reason:'confidence', text:G.holdText('confidence')});
  const last = list.at(-1), method = methodOf(last.a);
  const earlier = list.filter(t => t.date < last.date), same = earlier.filter(t => methodOf(t.a) === method);
  if (!earlier.length) return out({reason:list.length > 1 ? 'same-day' : 'no-pair', text:G.holdText(list.length > 1 ? 'same-day' : 'no-pair')});
  if (!same.length) {
    const other = methodOf(earlier[0].a);
    return out({reason:'method-mixed', method, other,
      text:'최근 녹음은 ' + METHOD[method] + ', 그 전 녹음은 ' + METHOD[other] + ' 잰 것이라 비교하지 않아요 · 같은 방법으로 잰 녹음끼리만 비교해요'});
  }
  const first = same.find(t => t.a.v === last.a.v);
  if (!first) return out({reason:'version-mixed', text:G.holdText('version-mixed')});
  const report = G.comparePair(first, last, {reference});
  const changes = SHOWN.map(id => report[id]).filter(x => x && x.state !== 'hold').map(observation).filter(Boolean);
  if (!changes.length) {
    const held = SHOWN.map(id => report[id]).find(x => x?.state === 'hold');
    return out({reason:'held', text:G.holdText(held?.reason)});
  }
  const count = list.filter(t => methodOf(t.a) === method && t.a.v === last.a.v).length;
  const [from, to] = L.dayLabels(first.date, last.date);
  return {item:{kind:'song', songId, title, method, count, firstId:first.id, lastId:last.id, firstDate:first.date, lastDate:last.date, changes,
    basis:'같은 곡 ' + title + ' · ' + measured(method) + ' 녹음 ' + (count > 2 ? count + '개 중 처음·최근' : '2개') + ' · ' + from + ARROW + to}};
}

/* ---------- 3. 같은 과제 (발성 정밀 측정) ---------- */
const PRECISION_REASON = {
  'version-mismatch':'분석 버전이 달라요', 'task-mismatch-or-missing':'과제가 달라요', 'vowel-mismatch-or-missing':'모음이 달라요',
  'environment-mismatch-or-missing':'녹음 환경이 달라요', 'loudness-mismatch-or-missing':'음량 단계가 달라요', 'owner-mismatch-or-missing':'다른 계정의 결과예요',
  'source-not-clean':'반주 없는 목소리인지 확인되지 않았어요', 'parameters-mismatch':'측정 설정이 달라요', 'scope-mismatch':'잰 구간 길이가 달라요',
  'pitch-mismatch-or-missing':'부른 음높이가 반음 넘게 달라요', 'level-mismatch-or-missing':'소리 크기가 달라요'
};
// The order in which a task's measured changes are shown (at most two per task).
const PRECISION_ORDER = ['stability', 'sustainDuration', 'drift', 'loudnessConsistency', 'hnr', 'cpp', 'jitter', 'shimmer', 'tilt', 'centroid', 'rolloff', 'alpha', 'h1h2'];   // f0 and rms are what makes two results comparable, not a change
const NAMES = {a:'아', e:'에', i:'이', o:'오', u:'우', soft:'여리게', normal:'보통', loud:'조금 강하게'};
const pdate = r => /^\d{4}-\d{2}-\d{2}$/.test(r?.recordedDate || '') ? r.recordedDate : String(r?.analyzedAt || '').slice(0, 10);
const round = v => Number(Number(v).toPrecision(3));
/**
 * results: 발성 정밀 측정 result objects (record.result). compare: VzipPrecisionReport.compare; labels: its LABELS;
 * groups: VzipPrecisionSession.GROUPS (task titles). → {items, excluded}.
 */
function taskChanges(results, {compare, labels = {}, groups = []} = {}) {
  const items = [], excluded = [];
  if (typeof compare !== 'function') return {items, excluded};
  const byKey = new Map();
  for (const r of results || []) {
    const c = r?.context;
    if (!c?.task || c.task === 'song' || c.task === 'unknown' || !r.metrics || !pdate(r)) continue;
    const key = [c.task, c.vowel || '', c.loudness || ''].join('|'), rows = byKey.get(key) || [];
    rows.push(r); byKey.set(key, rows);
  }
  for (const [key, rows] of byKey) {
    const [task, vowel, loudness] = key.split('|'), g = groups.find(x => x.task === task);
    const title = (g?.title || task) + (task === 'vowel' && NAMES[vowel] ? ' · ' + NAMES[vowel] : '') + (task === 'level' && NAMES[loudness] ? ' · ' + NAMES[loudness] : '');
    const sorted = rows.slice().sort((x, y) => pdate(x).localeCompare(pdate(y)) || String(x.analyzedAt || '').localeCompare(String(y.analyzedAt || '')));
    const last = sorted.at(-1), earlier = sorted.filter(r => pdate(r) < pdate(last));
    if (!earlier.length) { excluded.push({kind:'task', key, title, reason:'one-day', text:'다른 날 잰 같은 과제가 아직 없어요'}); continue; }
    const first = earlier.find(r => compare(r, last).state === 'comparable');
    if (!first) {
      const why = [...new Set(compare(earlier[0], last).reasons || [])].map(x => PRECISION_REASON[x]).filter(Boolean);
      excluded.push({kind:'task', key, title, reason:'withheld', text:(why.length ? why.slice(0, 2).join(' · ') : '조건이 같은지 확인할 수 없어요') + ' · 조건이 같은 측정끼리만 비교해요'});
      continue;
    }
    const pair = compare(first, last);
    const changes = PRECISION_ORDER.map(k => [k, pair.metrics?.[k]]).filter(([, m]) => m && m.state === 'measured' && Number.isFinite(m.delta)).slice(0, 2)
      .map(([k, m]) => ({key:k, label:labels[k] || k, text:(labels[k] || k) + ' ' + round(m.before) + ARROW + round(m.after) + (m.unit ? ' ' + m.unit : '')}));
    if (!changes.length) { excluded.push({kind:'task', key, title, reason:'no-metric', text:'두 측정에 함께 잰 값이 없어요'}); continue; }
    const [from, to] = L.dayLabels(pdate(first), pdate(last));
    items.push({kind:'task', key, title, firstDate:pdate(first), lastDate:pdate(last), changes,
      basis:'같은 과제 ' + title + ' · 같은 모음·음량·환경 · ' + from + ARROW + to});
  }
  return {items, excluded};
}

/* ---------- 4. 음역 ---------- */
/** compare: VzipGrowthRange.build(…).compare; text: VzipGrowthRange.compareText. Shown only with both windows enough. */
function rangeChange(compare, text = () => '') {
  if (!compare || compare.state === 'none') return {item:null, excluded:null};
  const ok = compare.state === 'ok' && compare.first?.enough && compare.now?.enough;
  if (ok) return {item:{kind:'range', text:text(compare),
    basis:'음역 처음·지금 · 처음 ' + compare.first.period + ' 녹음 ' + compare.first.n + '개 · 지금 ' + compare.now.period + ' 녹음 ' + compare.now.n + '개'}, excluded:null};
  return {item:null, excluded:{kind:'range', title:'음역 처음·지금', reason:compare.state === 'ok' ? 'small' : 'short',
    text:compare.state === 'ok' ? '한쪽 기간의 녹음이 3개보다 적어요' : text(compare)}};
}

/* ---------- the card ---------- */
/**
 * verdicts: VzipListenVerdict.list(db); songs: [{songId, title, takes, reference}]; precision: null (not read) or the
 * result objects; range: {compare, text}. → {verdicts, songs, tasks, invite, range, excluded}.
 */
function build({verdicts = [], songs = [], precision = null, precisionApi = {}, range = null, titleOf = () => ''} = {}) {
  const excluded = [];
  const songItems = [];
  for (const s of songs) { const r = songChange(s); if (!r) continue; if (r.item) songItems.push(r.item); else excluded.push(r.excluded); }
  // Most recently sung first.
  songItems.sort((a, b) => b.lastDate.localeCompare(a.lastDate) || a.title.localeCompare(b.title));
  const t = Array.isArray(precision) ? taskChanges(precision, precisionApi) : {items:[], excluded:[]};
  excluded.push(...t.excluded);
  const r = range ? rangeChange(range.compare, range.text) : {item:null, excluded:null};
  if (r.excluded) excluded.push(r.excluded);
  const verdictItems = verdicts.map(v => ({kind:'verdict', id:v.id, songId:v.songId, title:titleOf(v.songId) || '삭제된 곡', who:L.who(v), judge:v.judge,
    overall:L.overallText(v), tags:L.tagsText(v), memo:v.memo || '', firstId:v.firstId || '', secondId:v.secondId || '', firstDate:v.firstDate, secondDate:v.secondDate, verdict:v}));
  return {verdicts:verdictItems, songs:songItems, tasks:t.items, invite:Array.isArray(precision) && !precision.length, range:r.item, excluded};
}
return {METHOD, OBS, NAME, PRECISION_REASON, methodOf, observation, songChange, taskChanges, rangeChange, build};
});
