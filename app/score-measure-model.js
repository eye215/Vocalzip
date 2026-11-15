/* 마디 위치 (measure positions on the score PDF): pure helpers, also loaded by the Node tests.
 * The converted score (.mxl from Audiveris, see app/score-omr.js) carries the printed layout of every system, so
 * a place on a PDF page can be told as "page 3, measure 26". Nothing is stored: positions are read from the file
 * each time, so a new conversion simply replaces them.
 *
 * - layout(doc)            the file's layout in its own units (tenths of a staff space), or null when it has none
 * - fits(layout, pages)    whether its pages are the PDF's pages one to one
 * - page(layout, n, aspect) one page in page fractions (0–1): systems (top/bottom = first/last staff line),
 *                          staves, measures {index, number, x0, x1}
 * - measureAt / measuresIn  which measure a point / a box belongs to (bands halfway between systems)
 * - findStaves(image)      the five-line staves seen in a rendered page (cheap row scan), in page fractions
 * - snap(page, staves)     the same page laid onto the staves actually seen; unchanged when they do not match
 * - summary(pages, rows)   what the user put where: marks, memos, highlighter and pen writing by measure
 *
 * Units. Audiveris measures everything from the top-left of the page image it read, in tenths of that page's own
 * staff space; <page-layout> describes the first page as that image plus a fixed 80-tenth margin on every side
 * (PartwiseBuilder). So for an Audiveris file the PDF page is the area inside the margins, and each later page gets
 * its own width from its systems (left margin + measure widths + right margin). Any other MusicXML is read the
 * standard way (whole page, positions after the page margins). A staff is four spaces: 40 tenths. */
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.VzipScoreMeasures = api; })(globalThis, () => {
'use strict';
const STAFF = 40, GUESS_STAFF_GAP = 80, GUESS_SYSTEM_GAP = 100, GUESS_TOP = 70;
const local = el => String(el.localName || el.tagName || '').replace(/^.*:/, '');
const kids = (el, name) => el ? [...el.children].filter(c => !name || local(c) === name) : [];
const first = (el, name) => kids(el, name)[0] || null;
const text = (el, name) => { const x = name ? first(el, name) : el; return x ? String(x.textContent || '').trim() : ''; };
const num = (el, name) => { const t = text(el, name); return t === '' || !Number.isFinite(Number(t)) ? NaN : Number(t); };
const known = (...values) => values.find(v => Number.isFinite(v));
const clamp = v => Math.max(0, Math.min(1, v));
const median = (list, upper = false) => { const s = [...list].sort((a, b) => a - b); return s.length ? (upper || s.length % 2 ? s[Math.floor(s.length / 2)] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };

// ---------- the file's layout ----------
/** Every part as its measures in order (partwise: part>measure, timewise: measure>part). */
function streams(root) {
  const parts = [];
  if (local(root) === 'score-partwise') {
    for (const part of kids(root, 'part')) parts.push(kids(part, 'measure').map(m => ({el:m, number:m.getAttribute('number'), width:Number(m.getAttribute('width'))})));
  } else {
    const at = new Map();
    for (const m of kids(root, 'measure')) for (const part of kids(m, 'part')) {
      const id = part.getAttribute('id') || '';
      if (!at.has(id)) { at.set(id, parts.length); parts.push([]); }
      parts[at.get(id)].push({el:part, number:m.getAttribute('number'), width:Number(m.getAttribute('width'))});
    }
  }
  return parts;
}
/** The printed layout of a parsed MusicXML document (DOMParser in the app; the tests pass a tree with the same small
 * surface), or null when the file cannot place its systems on a page: no page size, or no system layout at all. */
function layout(doc) {
  const root = doc?.documentElement || doc;
  if (!root || doc.querySelector?.('parsererror') || !['score-partwise', 'score-timewise'].includes(local(root))) return null;
  const defaults = first(root, 'defaults'), pl = first(defaults, 'page-layout');
  const pageWidth = num(pl, 'page-width'), pageHeight = num(pl, 'page-height');
  if (!(pageWidth > 0 && pageHeight > 0)) return null;
  const pm = kids(pl, 'page-margins').find(m => m.getAttribute('type') !== 'even') || null;
  const margin = side => Math.max(0, known(num(pm, side + '-margin'), 0));
  const page = {width:pageWidth, height:pageHeight, left:margin('left'), right:margin('right'), top:margin('top'), bottom:margin('bottom')};
  const audiveris = kids(first(first(root, 'identification'), 'encoding'), 'software').some(s => /audiveris/i.test(text(s)));
  // Audiveris names the PDF page of every page it read (source-sheet-N); a skipped page shows as a gap.
  const sheets = kids(first(first(root, 'identification'), 'miscellaneous'), 'miscellaneous-field').map(f => /^source-sheet-(\d+)$/.exec(f.getAttribute('name') || '')?.[1]).filter(Boolean).map(Number).sort((a, b) => a - b);
  const dsl = first(defaults, 'system-layout'), dsm = first(dsl, 'system-margins');
  const base = {lm:num(dsm, 'left-margin'), rm:num(dsm, 'right-margin'), sd:num(dsl, 'system-distance'), tsd:num(dsl, 'top-system-distance'), staff:num(first(defaults, 'staff-layout'), 'staff-distance')};
  const parts = streams(root), count = Math.max(0, ...parts.map(p => p.length));
  if (!count) return null;

  const staves = parts.map(() => 1), lastGap = new Map(), systems = [];
  let pageNo = 0, laidOut = false, swallow = null, last = {lm:base.lm, rm:base.rm, sd:base.sd};
  for (let i = 0; i < count; i++) {
    const cells = parts.map(p => p[i] || null), prints = cells.map(c => c ? kids(c.el, 'print') : []);
    const flag = name => prints.some(list => list.some(p => p.getAttribute(name) === 'yes'));
    const newPage = i === 0 || flag('new-page'), start = newPage || flag('new-system');
    const hidden = cells.map(() => false);
    let rest = 0;
    cells.forEach((c, k) => { for (const a of c ? kids(c.el, 'attributes') : []) {
      const s = num(a, 'staves'); if (s >= 1) staves[k] = Math.round(s);
      if (kids(a, 'staff-details').some(d => d.getAttribute('print-object') === 'no')) hidden[k] = true;
      for (const style of kids(a, 'measure-style')) { const r = num(style, 'multiple-rest'); if (r >= 2) rest = Math.max(rest, Math.round(r)); }
    } });
    if (start) {
      if (newPage) pageNo++;
      const anyWidth = cells.some(c => c?.width > 0);
      let visible = cells.map((c, k) => !!c && !hidden[k] && (!anyWidth || c.width > 0));
      if (!visible.some(Boolean)) visible = cells.map(c => !!c);
      // The system layout sits in the topmost visible part (a hidden part carries none).
      const order = [...visible.keys()].sort((a, b) => visible[b] - visible[a] || a - b);
      let sl = null; for (const k of order) { for (const p of prints[k]) sl ||= first(p, 'system-layout'); if (sl) break; }
      const sm = first(sl, 'system-margins');
      if (sl) laidOut = true;
      const sys = {page:pageNo, first:newPage, lm:known(num(sm, 'left-margin'), last.lm, 0), rm:known(num(sm, 'right-margin'), last.rm, 0),
        tsd:num(sl, 'top-system-distance'), sd:num(sl, 'system-distance'), gaps:[], measures:[], approximate:false};
      if (!Number.isFinite(known(num(sm, 'left-margin'), last.lm))) sys.approximate = true;
      last.lm = sys.lm; last.rm = sys.rm;
      let top = true;
      cells.forEach((c, k) => { if (!visible[k]) return;
        for (let j = 1; j <= staves[k]; j++) {
          if (top) { top = false; sys.gaps.push(0); continue; }
          const own = prints[k].flatMap(p => kids(p, 'staff-layout')).find(s => Number(s.getAttribute('number') || 1) === j);
          let gap = known(num(own, 'staff-distance'), lastGap.get(k + ':' + j), base.staff);
          if (!(gap >= 0)) { gap = GUESS_STAFF_GAP; sys.approximate = true; }
          lastGap.set(k + ':' + j, gap); sys.gaps.push(gap);
        }
      });
      systems.push(sys); swallow = null;
    }
    const sys = systems.at(-1), head = cells.find(c => c && c.number != null) || cells.find(Boolean);
    const number = head?.number == null ? String(i + 1) : String(head.number);
    // A multi-measure rest is one box: measures the file still lists after it (numbered on by one) belong to it.
    if (swallow && swallow.left > 0 && !cells.some(c => c?.width > 0) && Number(number) === Number(swallow.measure.last || swallow.measure.number) + 1) {
      swallow.measure.last = number; swallow.left--; continue;
    }
    const visibleWidth = cells.map(c => c?.width).find(w => w > 0);
    const measure = {index:i, number, width:visibleWidth > 0 ? visibleWidth : NaN, ...(rest ? {rest} : {})};
    sys.measures.push(measure);
    swallow = rest ? {measure, left:rest - 1} : null;
  }
  if (!laidOut) return null;
  // A multi-rest the file numbers through (next measure = number + count) also shows its last number.
  const flat = systems.flatMap(s => s.measures);
  flat.forEach((m, i) => { if (m.rest && !m.last && Number.isFinite(Number(m.number)) && Number(flat[i + 1]?.number) === Number(m.number) + m.rest) m.last = String(Number(m.number) + m.rest - 1); });

  const pages = [];
  for (const sys of systems) (pages[sys.page - 1] ||= {systems:[]}).systems.push(sys);
  let lastSd = base.sd;
  for (const p of pages) {
    let y = 0;
    p.systems.forEach((sys, i) => {
      if (i === 0) { let d = known(sys.tsd, base.tsd); if (!(d >= 0)) { d = GUESS_TOP; sys.approximate = true; } y = (audiveris ? 0 : page.top) + d; }
      else { let d = known(sys.sd, lastSd); if (!(d >= 0)) { d = GUESS_SYSTEM_GAP; sys.approximate = true; } lastSd = d; y += d; }
      sys.staves = sys.gaps.map(gap => { y += gap; const line = [y, y + STAFF]; y += STAFF; return line; });
      sys.widths = sys.measures.length > 0 && sys.measures.every(m => m.width > 0) ? sys.measures.reduce((n, m) => n + m.width, 0) : 0;
    });
    // An Audiveris page has its own unit, so its width is what its systems add up to; the first page is declared.
    const spans = p.systems.filter(s => s.widths > 0).map(s => s.lm + s.widths + s.rm);
    p.span = spans.length ? median(spans, true) : NaN;
  }
  return {audiveris, page, pages, sheets, measures:flat.length};
}
/** Whether the layout's pages are the PDF's pages one to one (same count, no page skipped by the conversion). */
const fits = (lay, pdfPages) => !!lay && lay.pages.length === pdfPages && lay.pages.every(p => p?.systems?.length) && (!lay.sheets.length || lay.sheets.length === pdfPages && lay.sheets.every((n, i) => n === i + 1));
const parse = xml => new DOMParser().parseFromString(xml, 'application/xml');
/** Parse helper for the app (DOMParser) — the tests pass their own parser. */
const read = (xml, parser = parse) => layout(parser(xml));

// ---------- one page in page fractions ----------
/** Page n (1-based) of a layout as fractions of the PDF page; aspect = that PDF page's height / width. */
function page(lay, n, aspect) {
  const src = lay?.pages?.[n - 1];
  if (!src) return null;
  const d = lay.page, inner = {width:d.width - d.left - d.right, height:d.height - d.top - d.bottom};
  let width, height, x0;
  if (lay.audiveris && inner.width > 0 && inner.height > 0) {
    width = n === 1 || !(src.span > 0) ? inner.width : src.span;
    height = aspect > 0 ? width * aspect : width * inner.height / inner.width;
    x0 = 0;
  } else { width = d.width; height = d.height; x0 = d.left; }
  const right0 = lay.audiveris ? width : width - d.right;
  let approximate = false;
  const systems = src.systems.map(sys => {
    let left = x0 + sys.lm, right = right0 - sys.rm, rough = sys.approximate;
    if (!(right - left > width * .2)) { left = x0; right = right0; rough = true; }
    const full = sys.widths > 0, total = full ? sys.widths : sys.measures.length;
    if (!full) rough = true; // widths missing: the measures share the system equally
    let at = left;
    const measures = sys.measures.map(m => {
      const from = at; at += (full ? m.width : 1) * (right - left) / total;
      return {index:m.index, number:m.number, ...(m.last ? {last:m.last} : {}), x0:clamp(from / width), x1:clamp(at / width)};
    });
    if (rough) approximate = true;
    return {top:clamp(sys.staves[0][0] / height), bottom:clamp(sys.staves.at(-1)[1] / height), left:clamp(left / width), right:clamp(right / width),
      staves:sys.staves.map(s => [clamp(s[0] / height), clamp(s[1] / height)]), measures, approximate:rough};
  });
  return {page:n, systems, staff:STAFF / height, approximate, snapped:false};
}
/** Every page; aspects: PDF page height / width per page (array, or one number for all). */
function geometry(lay, aspects) {
  if (!lay) return null;
  const pages = lay.pages.map((_, i) => page(lay, i + 1, Array.isArray(aspects) ? aspects[i] : aspects));
  return {pages, approximate:pages.some(p => p.approximate), measures:lay.measures};
}

// ---------- which measure ----------
/** Vertical band of every system: halfway to its neighbours, the page edge for the first and last. */
function bands(pg) {
  const s = pg?.systems || [];
  return s.map((sys, i) => [i ? (s[i - 1].bottom + sys.top) / 2 : 0, i < s.length - 1 ? (sys.bottom + s[i + 1].top) / 2 : 1]);
}
const hit = (pg, si, mi) => { const m = pg.systems[si].measures[mi]; return {page:pg.page, system:si, measure:mi, index:m.index, number:m.number, ...(m.last ? {last:m.last} : {})}; };
/** The measure a point (page fractions) belongs to; left/right of a system counts as its first/last measure. */
function measureAt(pg, x, y) {
  const s = pg?.systems || [];
  if (!s.length || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  const band = bands(pg);
  let si = band.findIndex(b => y >= b[0] && y < b[1]); if (si < 0) si = y < band[0][0] ? 0 : s.length - 1;
  const ms = s[si].measures; if (!ms.length) return null;
  let mi = ms.findIndex(m => x >= m.x0 && x < m.x1); if (mi < 0) mi = x < ms[0].x0 ? 0 : ms.length - 1;
  return hit(pg, si, mi);
}
/** Every measure a box {x, y, w, h} overlaps, in order. A sliver past a barline (under 15% of the measure and of
 * the box) does not count, nor does a system the box only reaches into (under 30% of the box in its band and under
 * half of its staves); the measure under the box centre always counts. */
function measuresIn(pg, box) {
  const s = pg?.systems || [];
  if (!s.length || !box) return [];
  const x0 = Math.min(box.x, box.x + box.w), x1 = Math.max(box.x, box.x + box.w), y0 = Math.min(box.y, box.y + box.h), y1 = Math.max(box.y, box.y + box.h);
  const centre = measureAt(pg, (x0 + x1) / 2, (y0 + y1) / 2), out = [];
  bands(pg).forEach((b, si) => {
    const over = Math.min(y1, b[1]) - Math.max(y0, b[0]), body = Math.min(y1, s[si].bottom) - Math.max(y0, s[si].top);
    if (!(centre?.system === si || over > 0 && over >= (y1 - y0) * .3 || body > 0 && body >= (s[si].bottom - s[si].top) * .5)) return;
    s[si].measures.forEach((m, mi) => {
      const share = Math.min(x1, m.x1) - Math.max(x0, m.x0);
      if (centre?.system === si && centre.measure === mi || share > 0 && share >= Math.min(x1 - x0, m.x1 - m.x0) * .15) out.push(hit(pg, si, mi));
    });
  });
  return out;
}

// ---------- staves seen in the rendered page ----------
/** Five-line staves in a rendered page ({data: RGBA bytes, width, height}), as page fractions {top, bottom, x0, x1}.
 * A staff line is a row that is dark across much of the page; five evenly spaced ones are a staff. Returns [] when
 * the picture is too small to tell the lines apart. */
function findStaves(image) {
  const {data, width:W, height:H} = image || {};
  if (!data || !(W > 40 && H > 40) || data.length < W * H * 4) return [];
  const dark = i => data[i + 3] > 40 && data[i] + data[i + 1] + data[i + 2] < 600;
  const counts = new Uint32Array(H);
  for (let y = 0; y < H; y++) { let n = 0; for (let x = 0, i = y * W * 4; x < W; x++, i += 4) if (dark(i)) n++; counts[y] = n; }
  // Staff lines are the longest dark rows of the page; rows of beams and thick note heads stay well under them.
  const need = Math.max(W * .3, [...counts].sort((a, b) => b - a)[4] * .7), rows = [];
  for (let y = 0; y < H; y++) if (counts[y] >= need) rows.push(y);
  const lines = [];
  for (const y of rows) { const l = lines.at(-1); if (l && y - l.to <= 1) l.to = y; else lines.push({from:y, to:y}); }
  const gapMax = Math.max(4, W * .006);
  for (const l of lines) {
    l.y = (l.from + l.to) / 2;
    // The line's ends: its longest run of ink at least half as dark as the line itself (so a faint antialiased end
    // pixel counts only when the line covers most of it), bridging small gaps.
    const ink = new Float32Array(W); let sum = 0, n = 0;
    for (let x = 0; x < W; x++) {
      let v = 0; for (let y = l.from; y <= l.to; y++) { const i = (y * W + x) * 4; if (data[i + 3] > 40) v = Math.max(v, 765 - data[i] - data[i + 1] - data[i + 2]); }
      ink[x] = v; if (v > 165) { sum += v; n++; }
    }
    const half = n ? sum / n / 2 : 765;
    let best = 0, start = -1, prev = -1; l.x0 = 0; l.x1 = W - 1;
    const close = () => { if (start >= 0 && prev - start > best) { best = prev - start; l.x0 = start; l.x1 = prev; } };
    for (let x = 0; x < W; x++) {
      if (ink[x] < half) continue;
      if (start < 0 || x - prev > gapMax) { close(); start = x; }
      prev = x;
    }
    close();
  }
  const out = [];
  for (let i = 0; i + 4 < lines.length;) {
    const g = lines.slice(i, i + 5), steps = g.slice(1).map((l, k) => l.y - g[k].y), lo = Math.min(...steps), hi = Math.max(...steps);
    if (lo >= 2 && hi - lo <= Math.max(2, (lo + hi) * .225) && hi <= H * .012) {
      out.push({top:g[0].y / H, bottom:g[4].y / H, x0:median(g.map(l => l.x0)) / W, x1:(median(g.map(l => l.x1)) + 1) / W}); i += 5;
    } else i++;
  }
  return out;
}
/** The page laid onto the staves seen in its picture: one scale and shift down the page is tried for every pairing,
 * and kept only when at least three quarters of the file's staves land on a seen staff. Matched systems then take the
 * seen staff lines (top, bottom, left, right); the rest follow the same scale and shift. Otherwise the page is
 * returned as it was. */
function snap(pg, found) {
  const P = []; (pg?.systems || []).forEach((sys, si) => sys.staves.forEach((st, j) => P.push({si, j, top:st[0], bottom:st[1]})));
  const F = (found || []).filter(f => f && f.bottom > f.top && f.x1 > f.x0).sort((a, b) => a.top - b.top).slice(0, 48);
  if (!P.length || !F.length) return pg;
  const span = P.at(-1).top - P[0].top, tries = F.map(f => ({a:1, b:f.top - P[0].top}));
  if (span > 0) for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) { const a = (F[j].top - F[i].top) / span; if (a >= .75 && a <= 1.3) tries.push({a, b:F[i].top - a * P[0].top}); }
  let best = null;
  for (const t of tries) {
    if (Math.abs(t.b) > (P.length < 3 ? .05 : .2)) continue;
    const used = new Set(), pairs = []; let miss = 0;
    for (const p of P) {
      const y = t.a * p.top + t.b, tol = t.a * (p.bottom - p.top) * .6;
      let k = -1; F.forEach((f, i) => { if (!used.has(i) && Math.abs(f.top - y) <= tol && (k < 0 || Math.abs(f.top - y) < Math.abs(F[k].top - y))) k = i; });
      if (k >= 0) { used.add(k); pairs.push([p, F[k]]); miss += Math.abs(F[k].top - y); }
    }
    const cost = miss + (Math.abs(t.a - 1) + Math.abs(t.b)) * 1e-3;
    if (!best || pairs.length > best.pairs.length || pairs.length === best.pairs.length && cost < best.cost) best = {...t, pairs, cost};
  }
  if (!best || best.pairs.length < (P.length <= 2 ? P.length : Math.ceil(P.length * .75))) return pg;
  // Least squares over the matched staff lines for the staves that were not seen.
  let {a, b} = best;
  const pts = best.pairs.flatMap(([p, f]) => [[p.top, f.top], [p.bottom, f.bottom]]);
  if (best.pairs.length >= 2) {
    const n = pts.length, sx = pts.reduce((s, q) => s + q[0], 0), sy = pts.reduce((s, q) => s + q[1], 0), sxx = pts.reduce((s, q) => s + q[0] * q[0], 0), sxy = pts.reduce((s, q) => s + q[0] * q[1], 0), den = n * sxx - sx * sx;
    if (den > 1e-9) { const a2 = (n * sxy - sx * sy) / den; if (a2 >= .75 && a2 <= 1.3) { a = a2; b = (sy - a * sx) / n; } }
  }
  const seen = new Map(best.pairs.map(([p, f]) => [p.si + ':' + p.j, f]));
  const sides = pg.systems.map((sys, si) => { const fs = sys.staves.map((_, j) => seen.get(si + ':' + j)).filter(Boolean); return fs.length ? [median(fs.map(f => f.x0)), median(fs.map(f => f.x1))] : null; });
  const wide = pg.systems.map((sys, si) => sides[si] && sys.right > sys.left ? (sides[si][1] - sides[si][0]) / (sys.right - sys.left) : NaN).filter(Number.isFinite);
  const ax = wide.length && median(wide) >= .75 && median(wide) <= 1.3 ? median(wide) : 1, bx = wide.length ? median(pg.systems.map((sys, si) => sides[si] ? sides[si][0] - ax * sys.left : NaN).filter(Number.isFinite)) : 0;
  const systems = pg.systems.map((sys, si) => {
    const staves = sys.staves.map((st, j) => { const f = seen.get(si + ':' + j); return f ? [f.top, f.bottom] : [clamp(a * st[0] + b), clamp(a * st[1] + b)]; });
    let left = clamp(ax * sys.left + bx), right = clamp(ax * sys.right + bx);
    if (sides[si] && Math.abs(sides[si][1] - sides[si][0] - (right - left)) <= .03) [left, right] = sides[si];
    const k = sys.right > sys.left ? (right - left) / (sys.right - sys.left) : 1;
    return {...sys, top:staves[0][0], bottom:staves.at(-1)[1], left, right, staves,
      measures:sys.measures.map(m => ({...m, x0:clamp(left + (m.x0 - sys.left) * k), x1:clamp(left + (m.x1 - sys.left) * k)}))};
  });
  return {...pg, systems, staff:pg.staff * a, snapped:true};
}

// ---------- what the user put where ----------
const numberText = (from, to) => from === to || to == null ? from + '마디' : from + '–' + to + '마디';
/** Box of a stroke's points, in page fractions. */
function strokeBox(s) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of s.points || []) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  return x1 >= x0 ? {x:x0, y:y0, w:x1 - x0, h:y1 - y0} : null;
}
const POINT_MARK = .05, NEAR = .012, PREVIEW = 40;
/** What is on the score by page and measure. pageOf(n) gives that page's geometry (null: that page is left out);
 * rows are the score's ink records; markName(id) names a 표기 preset.
 * - 표기 (records with `mark`, or a glyph): one row each; a small one sits in the measure under its centre, a long
 *   one covers every measure it overlaps. Equal marks over the same measures are counted in one row.
 * - 스티커 메모: the measure under its centre, with the start of its text. Writing on a memo belongs to the memo.
 * - 형광펜 / 펜 필기: strokes that touch or lie close together are one piece of writing, listed once over the
 *   measures it overlaps.
 * Returns {items:[{page, kind, label, where, detail, count, from, to, measures:[index…]}], measures: distinct
 * measures that carry something}. */
function summary(pageOf, rows, {markName = () => ''} = {}) {
  const byPage = new Map();
  for (const s of rows || []) if (s && Number.isInteger(s.page)) (byPage.get(s.page) || byPage.set(s.page, []).get(s.page)).push(s);
  const items = [], marked = new Set();
  for (const n of [...byPage.keys()].sort((a, b) => a - b)) {
    const pg = pageOf(n); if (!pg?.systems?.length) continue;
    const list = byPage.get(n), memos = list.filter(s => s.tool === 'note' && Array.isArray(s.rect)), memoKeys = new Set(memos.map(s => s.note || s.id));
    const found = [];
    const add = (kind, label, hits, detail = '') => {
      if (!hits.length) return;
      const same = found.find(f => f.kind === kind && f.label === label && !detail && !f.detail && f.measures.join() === hits.map(h => h.index).join());
      if (same) { same.count++; return; }
      const a = hits[0], z = hits.at(-1);
      found.push({page:n, kind, label, detail, count:1, from:a.number, to:z.last || z.number, where:numberText(a.number, hits.length > 1 || z.last ? z.last || z.number : a.number), measures:hits.map(h => h.index), order:a.index});
    };
    for (const s of memos) {
      const at = measureAt(pg, s.rect[0] + s.rect[2] / 2, s.rect[1] + s.rect[3] / 2), line = String(s.text || '').trim().split('\n').find(t => t.trim())?.trim() || '';
      if (at) add('memo', '스티커 메모', [at], line ? (line.length > PREVIEW ? line.slice(0, PREVIEW) + '…' : line) : s.mode === 'pen' ? '손글씨' : '빈 메모');
    }
    const loose = {pen:[], highlighter:[]};
    for (const s of list) {
      if (s.tool === 'note' || s.note && memoKeys.has(s.note)) continue;
      const box = strokeBox(s); if (!box) continue;
      if (s.mark !== undefined || s.glyph !== undefined) {
        const small = box.w <= POINT_MARK && box.h <= POINT_MARK, at = small ? measureAt(pg, box.x + box.w / 2, box.y + box.h / 2) : null;
        add('mark', (s.mark !== undefined && markName(s.mark)) || '표기', small ? (at ? [at] : []) : measuresIn(pg, box));
      } else if (loose[s.tool]) loose[s.tool].push(box);
    }
    for (const [tool, boxes] of Object.entries(loose)) {
      // Strokes whose boxes come within NEAR of each other are one piece of writing.
      const group = boxes.map((_, i) => i), root = i => { while (group[i] !== i) i = group[i] = group[group[i]]; return i; };
      if (boxes.length <= 1500) for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
        const p = boxes[i], q = boxes[j];
        if (p.x - NEAR <= q.x + q.w && q.x - NEAR <= p.x + p.w && p.y - NEAR <= q.y + q.h && q.y - NEAR <= p.y + p.h) group[root(i)] = root(j);
      }
      const joined = new Map();
      boxes.forEach((p, i) => { const r = root(i), u = joined.get(r); if (!u) joined.set(r, {x:p.x, y:p.y, x1:p.x + p.w, y1:p.y + p.h}); else { u.x = Math.min(u.x, p.x); u.y = Math.min(u.y, p.y); u.x1 = Math.max(u.x1, p.x + p.w); u.y1 = Math.max(u.y1, p.y + p.h); } });
      for (const u of joined.values()) add(tool, tool === 'pen' ? '펜 필기' : '형광펜', measuresIn(pg, {x:u.x, y:u.y, w:u.x1 - u.x, h:u.y1 - u.y}));
    }
    const rank = {mark:0, memo:1, highlighter:2, pen:3};
    found.sort((a, b) => a.order - b.order || rank[a.kind] - rank[b.kind] || a.label.localeCompare(b.label, 'ko'));
    for (const f of found) { delete f.order; f.measures.forEach(i => marked.add(i)); items.push(f); }
  }
  return {items, measures:marked.size};
}
return {STAFF, layout, read, fits, page, geometry, bands, measureAt, measuresIn, findStaves, snap, summary, strokeBox};
});
