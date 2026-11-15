/* 마디 ↔ MR 맞추기 (measure ↔ accompaniment times): pure helpers, also loaded by the Node tests.
 * The user taps along with a song's MR file; every tap is an anchor "this measure starts at this second". Anchors
 * are kept in play order, because repeats and codas make a measure sound more than once.
 * A measure is named by its place among the score's measure boxes in file order (`m`, 0-based — see
 * VzipScoreMeasures.sequence), not by its printed number, which may repeat or be missing.
 *
 * - check(anchors, count)        '' when usable, else why not (times must rise, measures must exist)
 * - pack / unpack                anchors ↔ a short list of whole numbers (what is stored)
 * - entry / read                 the stored form of one sync ↔ {anchors, count, duration, offset}
 * - status(saved, track, now)    ok | stale (다시 맞춰야 해요) | none for an MR, given the score's saved syncs
 * - build(seq, anchors)          → {spans, timeOf, measureAt, rangeOf, occurrences}
 * - nextTarget(seq, last, lines) the measure the next tap stands for
 *
 * Between two anchors the measures share the time by their length in quarter notes (so a 2/4 bar among 4/4 bars
 * gets half as long). Nothing is guessed across a jump: a tap on an earlier measure (a repeat), or a far skip
 * ahead played much faster than the rest (a coda), ends the run — the measure tapped before it gets one measure's
 * time at the pace around it and what follows is unknown. Before the first and after the last anchor only one
 * measure is added the same way. */
(function (root, factory) { const api = factory(); if (typeof module === 'object' && module.exports) module.exports = api; else root.VzipScoreSyncModel = api; })(globalThis, () => {
'use strict';
const VERSION = 1, MAX_ANCHORS = 2000, MAX_SYNCS = 4, MIN_GAP = .01, LEAD = 2, STEP = .05, MAX_OFFSET = 3;
/** A run of this many measures or more that goes by this many times faster than usual is a skip, not music. */
const SKIP_MEASURES = 3, SKIP_PACE = .34, JUMP_ROOM = 1.5, SAME = 1e-6;
/** Browsers do not agree to the split second on how long a file is; a different file is off by far more. */
const LENGTH_ROOM = 3;
const whole = v => Number.isInteger(v);

/** Why these anchors cannot be used with a score of `count` measure boxes ('' when they can):
 * empty | many | shape | time (not a time, or not later than the one before) | measure (no such measure) | long. */
function check(anchors, count, {duration} = {}) {
  if (!Array.isArray(anchors) || !anchors.length) return 'empty';
  if (anchors.length > MAX_ANCHORS) return 'many';
  let last = -Infinity;
  for (const a of anchors) {
    if (!a || typeof a !== 'object') return 'shape';
    if (!Number.isFinite(a.t) || a.t < 0 || a.t < last + MIN_GAP - SAME) return 'time';
    if (!whole(a.m) || a.m < 0 || !(a.m < count)) return 'measure';
    last = a.t;
  }
  return duration > 0 && last > duration + .5 ? 'long' : '';
}
/** Anchors as whole numbers: a value ≥ 0 is the time since the anchor before in hundredths of a second, for the
 * measure after the previous one; a value < 0 comes first when the measure is another one (−(m + 1)).
 * [−1, 250, 200, 210] = measures 0, 1, 2 at 2.5 s, 4.5 s, 6.6 s. Returns null when the anchors are not valid. */
function pack(anchors) {
  if (!Array.isArray(anchors) || anchors.some(a => !a || !Number.isFinite(a.t) || a.t < 0 || !whole(a.m) || a.m < 0)) return null;
  const out = [];
  let time = 0, expect = -1;
  for (const [i, a] of anchors.entries()) {
    const at = Math.round(a.t * 100);
    if (i && at <= time) return null;
    if (a.m !== expect) out.push(-(a.m + 1));
    out.push(at - time); time = at; expect = a.m + 1;
  }
  return out;
}
function unpack(list) {
  if (!Array.isArray(list) || list.length > MAX_ANCHORS * 2 || list.some(v => !whole(v))) return null;
  const out = [];
  let time = 0, m = -1, named = false;
  for (const v of list) {
    if (v < 0) { if (named) return null; m = -v - 1; named = true; continue; }
    if (m < 0 || out.length && v <= 0) return null;
    time += v; out.push({t:time / 100, m}); m++; named = false;
  }
  return named || !out.length ? null : out;
}
/** What is stored for one MR: {v, n: measure boxes of the conversion, d: MR length (1/100 s), a: packed anchors,
 * o: 전체 앞당기기/늦추기 (1/100 s, left out when 0), at: saved time}. Null when it cannot be stored. */
function entry({anchors, count, duration, offset = 0, now = Date.now()}) {
  const a = pack(anchors);
  if (!a || check(unpack(a), count, {duration}) || !whole(count) || !(duration > 0)) return null;
  const o = Math.round(Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, Number(offset) || 0)) * 100);
  return {v:VERSION, n:count, d:Math.round(duration * 100), a, ...(o ? {o} : {}), at:now};
}
function read(stored) {
  if (!stored || typeof stored !== 'object' || stored.v !== VERSION || !whole(stored.n) || stored.n < 1 || !(stored.d > 0)) return null;
  const anchors = unpack(stored.a), offset = whole(stored.o) && Math.abs(stored.o) <= MAX_OFFSET * 100 ? stored.o / 100 : 0;
  if (!anchors || check(anchors, stored.n, {duration:stored.d / 100})) return null;
  return {anchors, count:stored.n, duration:stored.d / 100, offset, at:Number(stored.at) || 0};
}
const fileTrack = t => !!t && !t.deleted && t.kind !== 'youtube' && !!t.r2Key;
/** What the score's saved syncs (score.mrSync: {MR id: entry}) mean for `track` now.
 * - {state:'ok', data}                        made for this MR and this conversion
 * - {state:'stale', why}                      다시 맞춰야 해요 — why: 'measures' (converted again, another number of
 *                                             measures), 'length' (the MR file is not the length it was made for),
 *                                             'broken' (cannot be read), 'mr' (the MR it was made for is gone)
 * - {state:'none', other}                     nothing for this MR (other: another MR of the song has one) */
function status(saved, track, {count, tracks = [], duration} = {}) {
  const map = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  const own = fileTrack(track) && Object.prototype.hasOwnProperty.call(map, track.id) ? map[track.id] : null;
  if (own) {
    const data = read(own);
    if (!data) return {state:'stale', why:'broken'};
    if (data.count !== count) return {state:'stale', why:'measures'};
    if (duration > 0 && Math.abs(duration - data.duration) > LENGTH_ROOM) return {state:'stale', why:'length'};
    return {state:'ok', data};
  }
  const ids = Object.keys(map);
  if (ids.some(id => !tracks.some(t => t && t.id === id && fileTrack(t)))) return {state:'stale', why:'mr'};
  return {state:'none', other:ids.length > 0};
}
/** The map to store after saving `stored` for MR `id`: syncs of MRs that no longer exist are dropped, and at most
 * MAX_SYNCS are kept. Returns {map, over}: `over` names the oldest other sync when one more has to go (ask first). */
function withEntry(saved, id, stored, tracks = []) {
  const map = {};
  for (const [k, v] of Object.entries(saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {})) if (k !== id && tracks.some(t => t && t.id === k && fileTrack(t))) map[k] = v;
  const others = Object.keys(map).sort((a, b) => (Number(map[a]?.at) || 0) - (Number(map[b]?.at) || 0));
  const over = others.length >= MAX_SYNCS ? others[0] : '';
  map[id] = stored;
  return {map, over};
}

/** Times of the measures. seq: VzipScoreMeasures.sequence(layout) ({beats} per measure box); anchors: [{t, m}] in
 * play order; offset: seconds added to every time (전체 앞당기기 is negative). Null when the anchors do not fit.
 * - spans: [{m, t0, t1, occurrence, soft}] in play order (soft: its end is an estimate, not a tap)
 * - timeOf(m, occurrence = 0): when that measure starts the nth time it sounds, or null
 * - occurrences(m): how many times it sounds
 * - measureAt(t): the span sounding at t, or null (before the start, after the end, inside an unknown stretch)
 * - rangeOf(from, to, occurrence = 0): {start, end, lead, from, to, complete, occurrence, occurrences} for the run
 *   from → to as it sounds from that occurrence of `from`; it stops early at a jump (complete: false). `lead` is the
 *   length of the measure sounding just before, or null when that is not known. Null when `from` has no time. */
function build(seq, anchors, {offset = 0} = {}) {
  const count = seq?.length || 0;
  if (!count || check(anchors, count)) return null;
  const beats = m => seq[m].beats > 0 ? seq[m].beats : 4;
  const A = anchors.map(a => ({t:a.t + offset, m:a.m}));
  const pairs = A.slice(0, -1).map((a, i) => {
    const b = A[i + 1];
    if (b.m <= a.m) return {jump:true};
    let sum = 0; for (let m = a.m; m < b.m; m++) sum += beats(m);
    return {jump:false, pace:(b.t - a.t) / sum, far:b.m - a.m >= SKIP_MEASURES};
  });
  const paces = pairs.filter(p => !p.jump).map(p => p.pace).sort((x, y) => x - y), usual = paces.length ? paces[Math.floor(paces.length / 2)] : NaN;
  for (const p of pairs) if (!p.jump && p.far && p.pace < usual * SKIP_PACE) p.jump = true;
  /** Seconds per quarter note around anchor i: the run before it, else the run after it. */
  const paceAt = i => {
    for (let k = i - 1; k >= 0; k--) if (!pairs[k].jump) return pairs[k].pace;
    for (let k = i; k < pairs.length; k++) if (!pairs[k].jump) return pairs[k].pace;
    return NaN;
  };
  const spans = [];
  const first = A[0], lead = paceAt(0) * (first.m > 0 ? beats(first.m - 1) : NaN);
  if (lead > 0 && first.t - lead >= -lead / 4) spans.push({m:first.m - 1, t0:Math.max(0, first.t - lead), t1:first.t, soft:true});
  pairs.forEach((p, i) => {
    const a = A[i], b = A[i + 1];
    if (!p.jump) { let t = a.t; for (let m = a.m; m < b.m; m++) { const t1 = m === b.m - 1 ? b.t : t + p.pace * beats(m); spans.push({m, t0:t, t1}); t = t1; } return; }
    const own = paceAt(i) * beats(a.m), cut = own > 0 && b.t - a.t > own * JUMP_ROOM;
    spans.push({m:a.m, t0:a.t, t1:cut ? a.t + own : b.t, ...(cut ? {soft:true} : {})});
  });
  const last = A.at(-1), tail = paceAt(A.length - 1) * beats(last.m);
  spans.push({m:last.m, t0:last.t, t1:tail > 0 ? last.t + tail : last.t, soft:true});
  const at = new Map();
  spans.forEach((s, i) => { const list = at.get(s.m) || at.set(s.m, []).get(s.m); s.occurrence = list.length; list.push(i); });
  const occurrences = m => at.get(m)?.length || 0;
  const timeOf = (m, occurrence = 0) => { const i = at.get(m)?.[occurrence]; return i == null ? null : spans[i].t0; };
  const measureAt = t => {
    if (!Number.isFinite(t)) return null;
    let lo = 0, hi = spans.length - 1;
    while (lo <= hi) { const mid = (lo + hi) >> 1, s = spans[mid]; if (t < s.t0) hi = mid - 1; else if (t >= s.t1) lo = mid + 1; else return s; }
    return null;
  };
  const rangeOf = (from, to = from, occurrence = 0) => {
    const i = at.get(from)?.[occurrence];
    if (i == null) return null;
    let j = i;
    while (spans[j].m < to && spans[j + 1] && spans[j + 1].m === spans[j].m + 1 && Math.abs(spans[j + 1].t0 - spans[j].t1) < SAME) j++;
    const start = spans[i].t0, end = spans[j].t1, before = spans[i - 1];
    if (!(end > start)) return null;
    return {start, end, lead:before && Math.abs(before.t1 - start) < SAME && before.t1 > before.t0 ? before.t1 - before.t0 : null,
      from, to:spans[j].m, complete:spans[j].m >= to, occurrence, occurrences:occurrences(from)};
  };
  return {spans, timeOf, occurrences, measureAt, rangeOf};
}
/** Where a loop over `range` starts: one measure earlier (2 s when that measure's length is not known), or on it. */
const loopStart = (range, withLead = true) => withLead ? Math.max(0, range.start - (range.lead > 0 ? range.lead : LEAD)) : range.start;
/** The measure the next tap stands for after `last` (−1: nothing tapped yet): the next one, or with `lines` the
 * first measure of the next line. Null at the end of the score. */
function nextTarget(seq, last, lines = false) {
  for (let m = Math.max(0, last + 1); m < (seq?.length || 0); m++) if (!lines || seq[m].first || last < 0) return m;
  return null;
}
/** "12마디", "12–14마디"; a multi-rest box shows its own span. */
function label(seq, from, to = from) {
  const a = seq?.[from], z = seq?.[to];
  if (!a) return '';
  const end = z ? z.last || z.number : a.last || a.number;
  return String(a.number) === String(end) ? a.number + '마디' : a.number + '–' + end + '마디';
}
return {VERSION, MAX_ANCHORS, MAX_SYNCS, MIN_GAP, LEAD, STEP, MAX_OFFSET, LENGTH_ROOM, check, pack, unpack, entry, read, status, withEntry, build, loopStart, nextTarget, label, fileTrack};
});
