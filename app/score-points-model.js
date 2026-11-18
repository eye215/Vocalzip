/* 레슨 지적 체크 (points the teacher made, tied to measures, and whether a run kept them): pure helpers, also loaded by
 * the Node tests. The screens are app/score-points.js.
 *
 * WHERE IT IS KEPT: rows of the synced list scoreAnnotations, each with its own `kind`, as the 악보 표기 presets are
 * (app/score-ink-settings.js, kind 'marker-preset'). So core.js stamps updatedAt and a removed row leaves a tombstone,
 * and data-merge.js merges the list by id between devices. These rows are not strokes: VzipScoreInk.valid() is false for
 * them (no version / ownerId / r2Key / points), so the score viewer — also in older app versions — neither shows them
 * nor puts them in its device recovery copy, and its ledger only ever removes rows that carry an ownerId.
 *
 *   지적  {id:'point:<uid>', kind:'score-point', songId, scoreId?, measures:{from, to}, text, lessonId?, tag?,
 *          created, updated, retired?, stay?}
 *         measures: the measure numbers printed on the score (1-based, both included), so a point reads the same
 *         without the score's conversion. tag: one of TAGS (the listening tags). retired: when 이제 됐어요 was chosen —
 *         the point keeps its history and is left out of runs. stay: when 계속 볼래요 was chosen after 그만 볼까요?
 *         (runs before it no longer count towards the next suggestion).
 *   체크  {id:'point-run:<uid>', kind:'score-point-run', songId, scoreId?, date, at, results:{[point id]:'kept'|'missed'},
 *          mode?:'timed'|'list', recordingId?}
 *         One 부르면서 체크 run. A point left unmarked is not in results. recordingId: the take recorded in the same
 *         run (a recording, never practice time).
 *
 * Timing (부르면서 체크 with an MR matched to the score, app/score-sync-model.js): a point's measures are found among
 * the score's measure boxes by their printed number; every time that stretch sounds it gets a window — a reminder from
 * one measure before (the length of the measure before, or LEAD seconds), then the stretch itself, then ASK seconds
 * to tap 지켰어요 / 놓쳤어요. */
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.VzipScorePointsModel = api; })(typeof self !== 'undefined' ? self : globalThis, () => {
'use strict';
const LIST = 'scoreAnnotations', KIND = 'score-point', RUN = 'score-point-run', PREFIX = 'point:', RUN_PREFIX = 'point-run:';
const TEXT_MAX = 80, MEASURE_MAX = 9999, RECENT = 5, STREAK = 5, LEAD = 2, ASK = 10, RESULTS_MAX = 300;
/** The listening tags (app/listen-verdict-model.js), [key, name]. */
const TAGS = [['path', '소리 길'], ['pitch', '음정'], ['breath', '호흡'], ['power', '소리 크기·힘'], ['expression', '표현']];
const RESULTS = ['kept', 'missed'];
const OPTIONAL = ['scoreId', 'lessonId', 'tag', 'retired', 'stay'];
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const validId = s => typeof s === 'string' && s.length > 0 && s.length <= 200;
const whole = n => Number.isInteger(n) && n >= 1 && n <= MEASURE_MAX;
const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const validMeasures = m => isObj(m) && whole(m.from) && whole(m.to) && m.to >= m.from;
const isPoint = r => isObj(r) && r.kind === KIND && validId(r.id) && r.id.startsWith(PREFIX) && validId(r.songId) && validMeasures(r.measures) && typeof r.text === 'string';
const isRun = r => isObj(r) && r.kind === RUN && validId(r.id) && r.id.startsWith(RUN_PREFIX) && validId(r.songId) && isObj(r.results);
const rows = data => Array.isArray(data?.[LIST]) ? data[LIST] : [];
const time = v => Number(v) > 0 ? Number(v) : 0;

/** The measures typed or tapped, as {from, to}; an empty `to` is `from`. Throws an Error saying what to fix. */
function measures(raw) {
  const read = v => typeof v === 'string' ? (v.trim() === '' ? NaN : Number(v.trim())) : Number(v);
  const from = read(raw?.from), to = raw?.to == null || String(raw.to).trim() === '' ? from : read(raw.to);
  if (!whole(from)) throw Error('시작 마디를 1~' + MEASURE_MAX + ' 사이 숫자로 적어 주세요.');
  if (!whole(to)) throw Error('끝 마디를 1~' + MEASURE_MAX + ' 사이 숫자로 적어 주세요.');
  if (to < from) throw Error('끝 마디는 시작 마디와 같거나 뒤여야 해요.');
  return {from, to};
}
/** A complete point from loose input (what the form gives), or an Error saying what to fix. Unknown fields are left
 * out here; edit() keeps those of a stored point. */
function point(raw, {now = Date.now(), uid = ''} = {}) {
  const text = typeof raw?.text === 'string' ? raw.text.trim().replace(/\s+/g, ' ') : '';
  if (!text) throw Error('지적 내용을 적어 주세요.');
  if ([...text].length > TEXT_MAX) throw Error('지적은 ' + TEXT_MAX + '자까지 적을 수 있어요.');
  if (!validId(raw.songId)) throw Error('곡을 찾을 수 없어요.');
  const id = raw.id != null ? raw.id : PREFIX + uid;
  if (!validId(id) || !id.startsWith(PREFIX) || id === PREFIX) throw Error('지적을 확인해 주세요.');
  const out = {id, kind:KIND, songId:raw.songId, measures:measures(raw.measures), text, created:time(raw.created) || now, updated:now};
  if (raw.scoreId) { if (!validId(raw.scoreId)) throw Error('악보를 확인해 주세요.'); out.scoreId = raw.scoreId; }
  if (raw.lessonId) { if (!validId(raw.lessonId)) throw Error('레슨을 확인해 주세요.'); out.lessonId = raw.lessonId; }
  if (raw.tag) { if (!TAGS.some(t => t[0] === raw.tag)) throw Error('분류를 확인해 주세요.'); out.tag = raw.tag; }
  if (raw.retired) out.retired = time(raw.retired) || now;
  if (raw.stay) out.stay = time(raw.stay) || now;
  return out;
}
/** A stored point with `patch` applied: checked like a new one, with the fields this version does not know kept.
 * A patch with lessonId / tag / retired / stay / scoreId set to '' or null takes it away. */
function edit(old, patch, {now = Date.now()} = {}) {
  if (!isPoint(old)) throw Error('지적을 찾을 수 없어요.');
  const core = point({...old, ...patch, id:old.id, songId:old.songId, created:old.created}, {now});
  const out = {...old, ...core};
  for (const k of OPTIONAL) if (!(k in core)) delete out[k];
  return out;
}
/** A complete run row, or an Error. Results for anything but a point id, or other than kept / missed, are left out. */
function run(raw, {now = Date.now(), uid = ''} = {}) {
  if (!validId(raw?.songId)) throw Error('곡을 찾을 수 없어요.');
  if (!isDay(raw.date)) throw Error('날짜를 확인해 주세요.');
  const id = raw.id != null ? raw.id : RUN_PREFIX + uid;
  if (!validId(id) || !id.startsWith(RUN_PREFIX) || id === RUN_PREFIX) throw Error('체크 기록을 확인해 주세요.');
  const results = {};
  for (const [k, v] of Object.entries(isObj(raw.results) ? raw.results : {})) if (validId(k) && k.startsWith(PREFIX) && RESULTS.includes(v) && Object.keys(results).length < RESULTS_MAX) results[k] = v;
  const out = {id, kind:RUN, songId:raw.songId, date:raw.date, at:time(raw.at) || now, results};
  if (raw.scoreId && validId(raw.scoreId)) out.scoreId = raw.scoreId;
  if (['timed', 'list'].includes(raw.mode)) out.mode = raw.mode;
  if (raw.recordingId && validId(String(raw.recordingId))) out.recordingId = String(raw.recordingId);
  return out;
}

// ---------- reading ----------
/** Points in measure order: first measure, last measure, then when they were made. */
const order = (a, b) => a.measures.from - b.measures.from || a.measures.to - b.measures.to || time(a.created) - time(b.created) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
/** Every point of a song (retired ones too) in measure order. */
const points = (data, songId) => rows(data).filter(r => isPoint(r) && r.songId === songId).sort(order);
/** The points a run shows: those not retired. */
const active = list => list.filter(p => !p.retired);
/** A song's runs, oldest first. */
const runs = (data, songId) => rows(data).filter(r => isRun(r) && r.songId === songId).sort((a, b) => time(a.at) - time(b.at) || (a.id < b.id ? -1 : 1));
/** The last n results of a point (oldest → newest), counting only runs that marked it. */
const history = (runList, pointId, n = RECENT) => runList.map(r => r.results[pointId]).filter(v => RESULTS.includes(v)).slice(-n);
/** {recent, kept, total} over the last RECENT marked runs. */
function record(runList, pointId) { const recent = history(runList, pointId); return {recent, kept:recent.filter(v => v === 'kept').length, total:recent.length}; }
const recordText = r => r.total ? '최근 ' + r.total + '번 중 ' + r.kept + '번 지켰어요' : '아직 체크한 적이 없어요';
/** How many runs in a row, up to the latest that marked it, kept the point (runs before its `stay` do not count). */
function streak(runList, p) {
  let n = 0;
  for (let i = runList.length - 1; i >= 0; i--) {
    const r = runList[i];
    if (p.stay && time(r.at) <= p.stay) break;
    const v = r.results[p.id];
    if (!RESULTS.includes(v)) continue;
    if (v !== 'kept') break;
    n++;
  }
  return n;
}
/** 이제 몸에 붙었어요 · 그만 볼까요?: kept STREAK runs in a row and still shown. */
const suggestRetire = (runList, p) => !p.retired && streak(runList, p) >= STREAK;
/** What one run came to over the points it showed. */
function summary(list, results) {
  const out = {kept:0, missed:0, skipped:0, total:list.length};
  for (const p of list) { const v = results?.[p.id]; if (v === 'kept') out.kept++; else if (v === 'missed') out.missed++; else out.skipped++; }
  return out;
}
const summaryText = s => s.total ? '지켰어요 ' + s.kept + ' · 놓쳤어요 ' + s.missed + (s.skipped ? ' · 안 고름 ' + s.skipped : '') : '체크할 지적이 없어요';
/** "12마디", "12–14마디". */
const label = m => !m ? '' : m.from === m.to ? m.from + '마디' : m.from + '–' + m.to + '마디';
const tagName = key => TAGS.find(t => t[0] === key)?.[1] || '';
/** The lesson a new point is said to come from: the song's latest lesson that already took place (or the latest one). */
function latestLesson(lessons, songId, today) {
  const mine = (Array.isArray(lessons) ? lessons : []).filter(l => l && (l.songId === songId || (Array.isArray(l.songIds) && l.songIds.includes(songId)) || isObj(l.songFeedback) && songId in l.songFeedback) && l.status !== 'cancelled');
  mine.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.startTime || '').localeCompare(String(a.startTime || '')));
  return mine.find(l => !today || String(l.date || '') <= today) || mine[0] || null;
}

// ---------- timing with an MR matched to the score ----------
const printed = v => { const n = parseInt(String(v ?? ''), 10); return Number.isFinite(n) ? n : NaN; };
/** The first measure box (its place in play order, `ord`) at or after `after` that carries printed number n — a
 * multi-rest box covers its whole span. -1 when none does. seq: VzipScoreMeasures.sequence(layout). */
function ordOf(seq, n, after = 0) {
  for (let i = Math.max(0, after); i < (seq?.length || 0); i++) {
    const a = printed(seq[i].number), z = seq[i].last != null ? printed(seq[i].last) : a;
    if (Number.isFinite(a) && a <= n && n <= (Number.isFinite(z) ? z : a)) return i;
  }
  return -1;
}
/** The windows of the points along the MR: [{id, start, end, lead, occurrence}] by start. built: the sync's
 * VzipScoreSyncModel.build(seq, anchors) (rangeOf, occurrences). A point whose measures the score does not have, or
 * that never sounds, has none. */
function timeline(list, seq, built) {
  if (!built || !Array.isArray(seq) || !seq.length) return [];
  const out = [];
  for (const p of list) {
    const f = ordOf(seq, p.measures.from);
    if (f < 0) continue;
    let t = ordOf(seq, p.measures.to, f); if (t < 0) t = f;
    const n = built.occurrences(f) || 0;
    for (let k = 0; k < n; k++) {
      const r = built.rangeOf(f, t, k);
      if (r && r.end > r.start) out.push({id:p.id, start:r.start, end:r.end, lead:r.lead > 0 ? r.lead : LEAD, occurrence:k});
    }
  }
  return out.sort((a, b) => a.start - b.start || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
/** What is due at second t: soon (a measure before), now (sounding), ask (just ended — unanswered first, then the
 * latest), next (the next window to come). A point already soon or sounding is not asked about. */
function cue(line, t, answered = {}) {
  if (!Number.isFinite(t)) return {soon:[], now:[], ask:[], next:null};
  const now = line.filter(e => t >= e.start && t < e.end), soon = line.filter(e => t >= e.start - e.lead && t < e.start && !now.some(x => x.id === e.id));
  const busy = new Set([...now, ...soon].map(e => e.id)), seen = new Set();
  const ask = line.filter(e => t >= e.end && t < e.end + ASK && !busy.has(e.id))
    .sort((a, b) => (answered[a.id] ? 1 : 0) - (answered[b.id] ? 1 : 0) || b.end - a.end)
    .filter(e => !seen.has(e.id) && seen.add(e.id));
  return {soon, now, ask, next:line.find(e => e.start > t) || null};
}
return {LIST, KIND, RUN, PREFIX, RUN_PREFIX, TEXT_MAX, MEASURE_MAX, RECENT, STREAK, LEAD, ASK, TAGS, RESULTS,
  isPoint, isRun, measures, point, edit, run, points, active, runs, history, record, recordText, streak, suggestRetire,
  summary, summaryText, label, tagName, latestLesson, ordOf, timeline, cue};
});
