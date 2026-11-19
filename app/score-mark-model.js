/* 표기의 기능 (시작점 · 반복 · 컷): pure helpers, also loaded by the Node tests.
 * A placed 표기 does something only when it says what it is: the built-in 시작점 · 반복 · 컷 by their `mark`, a mark
 * from a user preset by the `role` it carries (app/score-ink-model.js, markRole). Marks without either — older ones,
 * 숨표, plain user marks — are drawings and nothing else. Everything here needs the score's conversion (measure
 * boxes, app/score-measure-model.js) and, for times, a sync with an MR file (app/score-sync-model.js).
 *
 * - roleOf(stroke)                 'start' | 'repeat' | 'cut' | ''
 * - span(page, stroke, role, count) the measures the mark stands on (whole measures, in file order)
 * - fixed(page, stroke, count)      the measures a mark placed by 마디 선택 says it covers, or null
 * - pieces(page, look, from, to)    what such a mark draws: one shape per line of music, over the measure boxes
 * - whole(rows, stroke)             a stamped mark (a drawn symbol of several strokes) as one stroke with all its points
 * - collect(items, ordOf)          the score's functional marks from the 표시한 마디 rows → {starts, repeats, cuts}
 * - runs(ords)                     consecutive measures as [{from, to}]
 * - skips(spans, cuts)             the stretches of MR time to jump over, merged, in play order
 * - skipsFor(skips, {from, loop})  the skips in force for one playback (see "Cuts and what is started on purpose")
 * - jump(skips, time, loop)        where playback has to go now, or null
 * - orderStarts(starts, page)      시작점 for the chooser: the page in view first, then by page · measure
 * - prefs / withPrefs              per score, on this device: the start last chosen and 컷 건너뛰기 on/off
 *
 * 마디 선택. A mark placed that way carries the measures it was placed on (`measures`: first and last file index
 * and how many measure boxes the conversion had). That range is what its function uses — nothing is estimated —
 * as long as the conversion still has that many boxes; after another conversion, and for every freehand mark, the
 * measures are read from where the mark lies, as described next.
 *
 * Measures. 시작점 is one place: the measure under the mark (of a long mark its first measure). 반복 and 컷 cover
 * every measure the mark overlaps — whole measures only, so a cut drawn inside a measure skips that whole measure.
 * A sliver past a barline does not count (the same 15% rule the 표시한 마디 list uses), because brackets are drawn
 * from barline to barline. A mark that reaches into the next line of music (two taps on different lines) runs from
 * the measure at its first end to the measure at its last end (a box keeps the measures it lies over). A mark never
 * leaves its page.
 *
 * Cuts. A cut measure is skipped every time it sounds: playback jumps from the start of the first cut measure of a
 * stretch to the end of its last one. Cut marks that touch or overlap are one stretch. A cut measure the sync has no
 * time for cannot be skipped.
 *
 * Cuts and what is started on purpose. What the user starts on purpose is played:
 * - a loop whose own measures lie inside a cut plays them anyway (that cut is off for the loop);
 * - 여기서 재생 (and a 시작점) on a cut measure plays the rest of that cut; cuts further on are skipped;
 * - every other cut on the way is skipped: one inside a loop is jumped over on every round, one that runs past the
 *   loop's end ends the round early, and a lead-in measure that is cut is left out. */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./score-measure-model.js') : root.VzipScoreMeasures, node ? require('./score-ink-model.js') : root.VzipScoreInk);
  if (node) module.exports = api; else root.VzipScoreMarks = api;
})(globalThis, (M, Ink) => {
'use strict';
const ROLES = ['start', 'repeat', 'cut'], ROLE_NAMES = {start:'시작점', repeat:'반복 구간', cut:'건너뛰기'};
/** A 기호 no larger than this (of the page, both ways) stands on one measure; a sliver under this share is not counted. */
const POINT = .05, SLIVER = .15, SAME = 1e-6, INSET = .004;
/** The narrowest and widest a stroke may be, of the page width (app/score-ink-model.js). */
const MIN_WIDTH = .001, MAX_WIDTH = .06;
/** A jump is made this long before a cut starts (the MR is looked at every 40 ms) and not within this of its end. */
const AHEAD = .02, EDGE = .01, MAX_SCORES = 60;
const roleOf = s => Ink.markRole(s);

const hitOf = (pg, si, mi) => { const m = pg.systems[si].measures[mi]; return {page:pg.page, system:si, measure:mi, index:m.index, number:m.number, ...(m.last ? {last:m.last} : {})}; };
/** The measures of this page a mark placed by 마디 선택 covers, or null: no stored range, a conversion with another
 * number of measure boxes (count), or none of them on this page. */
function fixed(pg, s, count) {
  const m = s?.measures;
  if (!Ink.validMeasures(m) || m[2] !== count || !pg?.systems?.length) return null;
  const out = [];
  pg.systems.forEach((sys, si) => sys.measures.forEach((x, mi) => { if (x.index >= m[0] && x.index <= m[1]) out.push(hitOf(pg, si, mi)); }));
  return out.length ? out : null;
}
/** A mark stamped from a drawn symbol is several strokes linked by `group`: all of them as one, so that the mark
 * stands where its whole drawing lies. Any other stroke is returned as it is. rows: the records of its page. */
const whole = (rows, s) => s?.group === undefined || s.measures !== undefined ? s : {...s, points:Ink.grouped(rows || [], s).flatMap(r => r.points || [])};
function span(pg, s, role, count) {
  const stored = fixed(pg, s, count);
  if (stored) return role === 'start' ? stored.slice(0, 1) : stored;
  const box = M.strokeBox(s);
  if (!box || !pg?.systems?.length) return [];
  let hits;
  if (box.w <= POINT && box.h <= POINT) { const at = M.measureAt(pg, box.x + box.w / 2, box.y + box.h / 2); hits = at ? [at] : []; }
  else { hits = M.measuresIn(pg, box); if (new Set(hits.map(h => h.system)).size > 1) hits = across(pg, s, hits); }
  return role === 'start' ? hits.slice(0, 1) : hits;
}
/** A mark drawn from one line of music into another: from the measure at one end to the measure at the other. The
 * ends are the stroke's first and last point (the two taps of a bracket, the ends of a line). A closed shape (a box)
 * has no ends: it keeps the measures it lies over. */
function across(pg, s, hits) {
  const pts = s.points;
  if (Math.hypot(pts[0][0] - pts.at(-1)[0], pts[0][1] - pts.at(-1)[1]) < 1e-4) return hits;
  let a = pts[0], z = pts.at(-1);
  let A = M.measureAt(pg, a[0], a[1]), Z = M.measureAt(pg, z[0], z[1]);
  if (!A || !Z) return hits;
  if (A.system > Z.system || A.system === Z.system && A.measure > Z.measure) { [A, Z] = [Z, A]; [a, z] = [z, a]; }
  const at = h => pg.systems[h.system].measures[h.measure], wide = m => (m.x1 - m.x0) * SLIVER;
  let first = {...A}, last = {...Z};
  if (at(first).x1 - a[0] < wide(at(first)) && first.measure < pg.systems[first.system].measures.length - 1) first.measure++;
  if (z[0] - at(last).x0 < wide(at(last)) && last.measure > 0) last.measure--;
  const out = [];
  for (let si = first.system; si <= last.system; si++) pg.systems[si].measures.forEach((m, mi) => {
    if (si === first.system && mi < first.measure || si === last.system && mi > last.measure) return;
    out.push(hitOf(pg, si, mi));
  });
  return out.length ? out : hits;
}
/** What a mark placed by 마디 선택 draws over the measures from..to (file indexes) of a page: one shape per line of
 * music, as the fields of a stroke each (tool, color, opacity, width, points). look: the preset; aspect: page height
 * / width. Every shape follows the measure box of 마디 위치 보기 — the whole system, from the top line of its top staff
 * to the bottom line of its bottom staff (voice + piano is one box), on the staff lines seen on the page when it was
 * snapped, with the same little room around:
 * - 구간 덮기 fills the box. A stroke is at most MAX_WIDTH wide, so a tall box is filled by one line that goes round
 *   its outside and then to and fro in rows that lie edge to edge (one stroke: it is see-through evenly, with no
 *   darker seams, and its sides are straight);
 * - 테두리 상자 frames the box, 밑줄 runs under the bottom staff, 구간 괄호 sits over the top staff. */
function pieces(pg, look, from, to, aspect = 1) {
  const k = aspect > 0 ? aspect : 1, pen = look.type !== 'highlighter', lo = Math.min(from, to), hi = Math.max(from, to);
  const base = {tool:pen ? 'pen' : 'highlighter', color:look.color, opacity:Ink.markOpacity(look), width:look.width};
  const pad = (pg?.staff || 0) * (pg?.snapped ? .25 : .6), out = [];
  for (const sys of pg?.systems || []) {
    const ms = sys.measures.filter(m => m.index >= lo && m.index <= hi);
    if (!ms.length) continue;
    const left = ms[0].x0, right = ms.at(-1).x1, gap = Math.min(INSET, (right - left) / 4), x0 = left + gap, x1 = right - gap;
    const top = Math.max(0, sys.top - pad), bottom = Math.min(1, sys.bottom + pad);
    let piece;
    if (look.form === 'box') piece = {...base, points:[[x0, top], [x1, top], [x1, bottom], [x0, bottom], [x0, top]]};
    else if (look.form === 'line') piece = {...base, points:[[x0, bottom], [x1, bottom]]};
    else if (look.form === 'bracket') { const h = Math.min(.046 / k, top); piece = {...base, points:[[x0, top - h], [x0, top], [x1, top], [x1, top - h]]}; }
    else {
      // Rows of equal height, each as wide as a stroke may be at most; the round ends stop at the barlines.
      const tall = Math.max(MIN_WIDTH, (bottom - top) * k), rows = Math.max(1, Math.ceil(tall / MAX_WIDTH - 1e-9)), width = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, tall / rows));
      const half = Math.min(width / 2, (x1 - x0) / 2), a = x0 + half, z = x1 - half, y = i => top + (i + .5) * (bottom - top) / rows;
      // One row is a line. More: round the outside first (so both sides are straight), then the rows between.
      const points = rows === 1 ? [[a, y(0)], [z, y(0)]] : [[a, y(0)], [a, y(rows - 1)], [z, y(rows - 1)], [z, y(0)], [a, y(0)]];
      for (let i = 1; i < rows - 1; i++) points.push(i % 2 ? [a, y(i)] : [z, y(i)], i % 2 ? [z, y(i)] : [a, y(i)]);
      piece = {...base, width, points};
    }
    out.push({...piece, points:piece.points.map(p => Ink.point(p[0], p[1]))});
  }
  return out;
}
/** The score's functional marks. items: rows of VzipScoreMeasures.summary made with roleOf / span (each {role, page,
 * measures: file indexes}); ordOf: Map file index → place in play-order numbering (VzipScoreMeasures.sequence).
 * → {starts:[{ord, page}] one per measure, repeats:[{from, to, page}], cuts:[ord…]} — all sorted by measure. */
function collect(items, ordOf) {
  const starts = new Map(), repeats = [], cuts = new Set();
  for (const it of items || []) {
    if (!ROLES.includes(it?.role)) continue;
    const ords = (it.measures || []).map(i => ordOf.get(i)).filter(Number.isInteger).sort((a, b) => a - b);
    if (!ords.length) continue;
    if (it.role === 'start') { if (!starts.has(ords[0])) starts.set(ords[0], {ord:ords[0], page:it.page}); }
    else if (it.role === 'repeat') repeats.push({from:ords[0], to:ords.at(-1), page:it.page});
    else for (const m of ords) cuts.add(m);
  }
  return {starts:[...starts.values()].sort((a, b) => a.ord - b.ord), repeats:repeats.sort((a, b) => a.from - b.from || a.to - b.to), cuts:[...cuts].sort((a, b) => a - b)};
}
/** [3, 4, 5, 9] → [{from:3, to:5}, {from:9, to:9}]. */
function runs(ords) {
  const out = [];
  for (const m of [...new Set(ords || [])].sort((a, b) => a - b)) { const last = out.at(-1); if (last && m === last.to + 1) last.to = m; else out.push({from:m, to:m}); }
  return out;
}
/** Names of stretches for a line of text: the first `max`, then "외 N곳". */
const text = (names, max = 2) => names.slice(0, max).join(', ') + (names.length > max ? ' 외 ' + (names.length - max) + '곳' : '');

/** The stretches of MR time to jump over. spans: the sync's measures in play order ({m, t0, t1}); cuts: measures.
 * → [{start, end, from, to}] (from/to: first and last measure of the stretch), in play order, merged where they touch. */
function skips(spans, cuts) {
  const set = cuts instanceof Set ? cuts : new Set(cuts || []), out = [];
  for (const s of spans || []) {
    if (!set.has(s.m) || !(s.t1 > s.t0)) continue;
    const last = out.at(-1);
    if (last && Math.abs(last.end - s.t0) < SAME) { last.end = s.t1; last.to = s.m; } else out.push({start:s.t0, end:s.t1, from:s.m, to:s.m});
  }
  return out;
}
/** The skips in force for one playback. from: the second it was started at on purpose (여기서 재생, a 시작점), or null
 * for the whole MR; loop: {start, end} of the loop's own measures (without its lead-in), or null. */
function skipsFor(list, {from = null, loop = null} = {}) {
  return (list || []).filter(k => !(loop && k.start <= loop.start + SAME && k.end >= loop.end - SAME) && !(from != null && from >= k.start - SAME && from < k.end - SAME));
}
/** Where playback at second `time` has to go now, or null to play on. loop: {from, end} (where a round starts,
 * lead-in included, and where it ends): a skip that reaches the end of the round goes back to its start. */
function jump(list, time, loop = null) {
  let at = time, moved = false;
  for (let i = 0; i < 3; i++) {
    const k = (list || []).find(x => at >= x.start - AHEAD && at < x.end - EDGE);
    if (!k) break;
    at = k.end; moved = true;
    if (loop && at >= loop.end - EDGE) at = loop.from;
  }
  return moved && Math.abs(at - time) > SAME ? at : null;
}
/** 시작점 for the chooser: the ones on the page in view first, then the rest, each by measure. */
const orderStarts = (starts, page) => [...(starts || [])].sort((a, b) => (a.page === page ? 0 : 1) - (b.page === page ? 0 : 1) || a.ord - b.ord);

/** What is remembered for a score on this device, from the stored text: {start: measure or null, cut: on/off}.
 * 컷 건너뛰기 is on until it is turned off. */
function prefs(stored, scoreId) {
  let all = null; try { all = JSON.parse(stored || 'null'); } catch {}
  const p = all && typeof all === 'object' && !Array.isArray(all) ? all[scoreId] : null;
  return {start:Number.isInteger(p?.s) && p.s >= 0 ? p.s : null, cut:p?.c !== 0};
}
/** The text to store after a change ({start} and/or {cut}); the scores used longest ago go once there are many. */
function withPrefs(stored, scoreId, patch, now = Date.now()) {
  let all = null; try { all = JSON.parse(stored || 'null'); } catch {}
  if (!all || typeof all !== 'object' || Array.isArray(all)) all = {};
  const old = prefs(stored, scoreId), next = {...old, ...patch};
  all[scoreId] = {...(Number.isInteger(next.start) && next.start >= 0 ? {s:next.start} : {}), ...(next.cut === false ? {c:0} : {}), at:now};
  const ids = Object.keys(all).sort((a, b) => (Number(all[b]?.at) || 0) - (Number(all[a]?.at) || 0));
  for (const id of ids.slice(MAX_SCORES)) delete all[id];
  return JSON.stringify(all);
}
return {ROLES, ROLE_NAMES, AHEAD, EDGE, MAX_SCORES, roleOf, span, fixed, pieces, whole, collect, runs, text, skips, skipsFor, jump, orderStarts, prefs, withPrefs};
});
