/* 필기를 지적으로 가져오기 (app/score-ink-points-bulk.js): pure helpers, also loaded by the Node tests.
 *
 * GROUPING HANDWRITING INTO NOTES (clusters). Strokes are records of app/score-ink-model.js: points [[x, y, p], …]
 * with x of page width and y of page height. Distances here are all in page-width units (y × the page's aspect), so
 * they mean the same on a tall or a wide page. On an A4 page 0.01 is about 2 mm.
 *
 *  Which strokes count: pen strokes only. Left out: highlighter strokes, 스티커 메모 (tool 'note') and the strokes
 *  written on a memo (`note`), the app's own 악보 표기 (`mark`, `glyph`, `group`: they are listed on their own, see
 *  marks()), and tiny marks — a stroke whose whole size is under TINY (a tap or a speck).
 *
 *  Two strokes are one note when BOTH
 *   - their boxes are within GAP_X sideways and GAP_Y up/down of each other (overlapping boxes are 0 apart): the
 *     letters and words of one line of writing, not the next line or a note over another staff, and
 *   - they were drawn within TIME of each other (createdAt). Handwriting imported with the PDF (GoodNotes) carries
 *     only its order (createdAt milliseconds apart), so there place alone decides.
 *  A note is a chain of such pairs (union–find), so a long phrase joins word by word.
 *
 *  A note is kept when it looks like writing:
 *   - at least MIN_EXTENT either way (smaller is a tick or a dot),
 *   - at most MAX_WIDTH wide and MAX_HEIGHT high (larger is a slur, bracket or line across the music),
 *   - two strokes or more, or one stroke whose ink length is at least WIGGLE × its size (joined-up writing): a lone
 *     straight line, slur or circle (length π × size) is left out.
 *  Arrows and circles drawn with two strokes or more stay in: recognition returns no letters for them, and the review
 *  list shows them unchecked as 글자가 아니에요 (looksLikeText).
 *  Order: page, then top, then left, then the first stroke id — the same every time.
 *  LIMIT notes are sent per run (the rest are counted and said). */
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.VzipInkBulkModel = api; })(typeof self !== 'undefined' ? self : globalThis, () => {
'use strict';
const T = Object.freeze({TINY:0.003, GAP_X:0.03, GAP_Y:0.012, TIME:60000, MIN_EXTENT:0.015, MAX_WIDTH:0.7, MAX_HEIGHT:0.15, WIGGLE:3.5, LIMIT:40, CONCURRENCY:2});

/** A pen stroke of handwriting: not a highlighter, memo, stroke on a memo or 악보 표기. */
const handwriting = s => !!s && s.tool === 'pen' && Array.isArray(s.points) && s.points.length > 0 &&
  s.note === undefined && s.mark === undefined && s.glyph === undefined && s.group === undefined && s.measures === undefined;
/** Box of a stroke's points in page-width units (y × aspect), and its ink length. */
function shape(s, aspect) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, length = 0, prev = null;
  for (const p of s.points) {
    const x = p[0], y = p[1] * aspect;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    if (prev) length += Math.hypot(x - prev[0], y - prev[1]);
    prev = [x, y];
  }
  return {x0, y0, x1, y1, length};
}
const gap = (a0, a1, b0, b1) => Math.max(0, Math.max(a0, b0) - Math.min(a1, b1));
const near = (a, b) => gap(a.x0, a.x1, b.x0, b.x1) <= T.GAP_X && gap(a.y0, a.y1, b.y0, b.y1) <= T.GAP_Y && Math.abs((a.at || 0) - (b.at || 0)) <= T.TIME;
const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/** The notes of handwriting on the given strokes: [{page, rows, box:{x, y, w, h} (page fractions)}] in order.
 * aspectOf(page) → height / width of that page (or one number for every page). */
function clusters(rows, aspectOf = 1.414) {
  const aspect = typeof aspectOf === 'function' ? aspectOf : () => aspectOf;
  const pages = new Map();
  for (const s of rows || []) if (handwriting(s) && Number.isInteger(s.page)) (pages.get(s.page) || pages.set(s.page, []).get(s.page)).push(s);
  const out = [];
  for (const [page, list] of pages) {
    const a = Number(aspect(page)); if (!(a > 0)) continue;
    const items = list.map(s => ({s, at:Number(s.createdAt) || 0, ...shape(s, a)}))
      .filter(i => Math.max(i.x1 - i.x0, i.y1 - i.y0) >= T.TINY)
      .sort((p, q) => p.at - q.at || byId(p.s, q.s));
    const parent = items.map((_, i) => i), root = i => { while (parent[i] !== i) i = parent[i] = parent[parent[i]]; return i; };
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) if (near(items[i], items[j])) parent[root(i)] = root(j);
    const groups = new Map();
    items.forEach((it, i) => { const r = root(i); (groups.get(r) || groups.set(r, []).get(r)).push(it); });
    for (const g of groups.values()) {
      const x0 = Math.min(...g.map(i => i.x0)), x1 = Math.max(...g.map(i => i.x1)), y0 = Math.min(...g.map(i => i.y0)), y1 = Math.max(...g.map(i => i.y1));
      const w = x1 - x0, h = y1 - y0;
      if (Math.max(w, h) < T.MIN_EXTENT || w > T.MAX_WIDTH || h > T.MAX_HEIGHT) continue;
      if (g.length < 2 && g[0].length < T.WIGGLE * Math.max(w, h)) continue;
      const strokes = g.map(i => i.s).sort((p, q) => (Number(p.createdAt) || 0) - (Number(q.createdAt) || 0) || byId(p, q));
      out.push({page, rows:strokes, box:{x:x0, y:y0 / a, w, h:h / a}, ids:strokes.map(s => s.id)});
    }
  }
  return out.sort((p, q) => p.page - q.page || p.box.y - q.box.y || p.box.x - q.box.x || (p.ids[0] < q.ids[0] ? -1 : 1));
}

// ---------- review ----------
const clean = t => String(t ?? '').trim().replace(/\s+/g, ' ');
/** Recognized text that is words (any letters), not only arrows, circles, numbers or punctuation. */
const looksLikeText = t => /\p{L}/u.test(clean(t));
/** Checked by default: words, recognition not unsure, and not a point already. */
const preselect = ({text, confidence, duplicate}) => looksLikeText(text) && confidence !== 'low' && !duplicate;
/** The measures a box covers, as {from, to} printed numbers; null when none can be read (no conversion). */
function measuresOf(hits) {
  const n = (hits || []).flatMap(h => [parseInt(h.number, 10), parseInt(h.last ?? h.number, 10)]).filter(Number.isFinite);
  return n.length ? {from:Math.min(...n), to:Math.max(...n)} : null;
}
const key = (text, m) => m ? clean(text).toLowerCase() + '|' + m.from + '|' + m.to : '';
/** A point of the song with the same words and measures is there already. points: VzipScorePointsModel.points(). */
const duplicate = (points, text, m) => !!m && !!clean(text) && (points || []).some(p => key(p.text, p.measures) === key(text, m));

/** 악보 표기 for the review list from the 표시한 마디 items of kind 'mark' (app/score-measure-model.js summary): one
 * candidate per mark, and identical marks (same name and function) on the same page on adjacent or overlapping
 * measures as one — a 반복 bracket drawn in pieces, or a 컷 laid measure by measure. Text: the name, with the
 * measures when it covers more than one (반복 (5–6마디)). Marks whose measures cannot be read are left out. */
function marks(items) {
  const list = [];
  for (const it of items || []) {
    const from = parseInt(it.from, 10), to = parseInt(it.to ?? it.from, 10);
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    const prev = list.at(-1), lo = Math.min(from, to), hi = Math.max(from, to);
    if (prev && prev.page === it.page && prev.name === it.label && prev.role === (it.role || '') && lo <= prev.to + 1 && hi >= prev.from - 1) {
      prev.from = Math.min(prev.from, lo); prev.to = Math.max(prev.to, hi); prev.count += it.count || 1; continue;
    }
    list.push({page:it.page, name:String(it.label || '표기'), role:it.role || '', from:lo, to:hi, count:it.count || 1});
  }
  return list.map(m => ({page:m.page, name:m.name, role:m.role, count:m.count, measures:{from:m.from, to:m.to},
    text:m.name + (m.from !== m.to ? ' (' + m.from + '–' + m.to + '마디)' : '')}));
}

/** Runs task(item, i) over items, at most `limit` at once; stops starting new ones once stop() is true.
 * Resolves when the started ones have finished. */
async function pool(items, limit, task, stop = () => false) {
  let next = 0;
  const worker = async () => { while (next < items.length && !stop()) { const i = next++; await task(items[i], i); } };
  await Promise.all(Array.from({length:Math.max(1, Math.min(limit, items.length))}, worker));
}
return {T, handwriting, clusters, clean, looksLikeText, preselect, measuresOf, duplicate, marks, pool};
});
