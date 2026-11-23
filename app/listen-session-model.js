/* 듣고 고르기 — a listening session over the person's own takes (owner, 2026-11-23: "그동안 했던 거 듣고 평가 … 틀어 놓으면
 * 다음 노래 계속 나와서 안 끊기게"; 평가: 두 녹음 중 고르기). Pure: no DOM, storage or network; also loaded by Node tests.
 * The player is app/listen-session.js; a choice is kept as a 들어 본 평가 row (app/listen-verdict-model.js make).
 *
 * takes: [{id, songId, date, created, seconds}] — one song's takes are the recordings that sing it (not 트레이닝 ·
 * 연습실), with a day; the caller picks them.
 *
 * pairs(takes, {songId?, verdicts, random, perSong}) → [{key, songId, a, b, aIsFirst}]
 *   For each song with two or more takes, up to perSong pairs of "예전 vs 요즘": the latest take against an older one —
 *   one at least GAP_DAYS earlier when there is one (the earliest is not always the one: the older takes are spread),
 *   never a pair that already has a 들어 본 평가, never the same pair twice. A and B are in random order (blind:
 *   the days are shown only after choosing). Songs take turns (round robin), so a long session moves between songs.
 * queue(takes, {songId?, random}) → [{key, songId, take}] — 그냥 이어 듣기: newest first, every take once.
 * section(take, clip) → {start, end|null} — 앞 1분: the first CLIP_SECONDS, or the whole take (end null). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VzipListenSession = api;
})(typeof self !== 'undefined' ? self : globalThis, () => {
'use strict';
const GAP_DAYS = 14, PER_SONG = 3, CLIP_SECONDS = 60;
const list = v => Array.isArray(v) ? v : [];
const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const days = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
const order = (x, y) => String(x.date).localeCompare(String(y.date)) || (Number(x.created) || 0) - (Number(y.created) || 0) || String(x.id).localeCompare(String(y.id));
const pairKey = (x, y) => [String(x), String(y)].sort().join('|');
const clean = takes => list(takes).filter(t => t && t.id && t.songId && isDay(t.date));
function bySong(takes, songId) {
  const out = new Map();
  for (const t of clean(takes)) {
    if (songId && t.songId !== songId) continue;
    if (!out.has(t.songId)) out.set(t.songId, []);
    out.get(t.songId).push(t);
  }
  for (const l of out.values()) l.sort(order);
  return out;
}
/** Older takes to set against the latest, spread out: the earliest first, then the middle ones, nearest-to-even. */
function spread(older, n) {
  if (older.length <= n) return older.slice();
  const out = [];
  for (let i = 0; i < n; i++) out.push(older[Math.round(i * (older.length - 1) / Math.max(1, n - 1))]);
  return [...new Map(out.map(t => [t.id, t])).values()];
}
function pairs(takes, {songId = null, verdicts = [], random = Math.random, perSong = PER_SONG} = {}) {
  const judged = new Set(list(verdicts).filter(v => v && v.firstId && v.secondId).map(v => pairKey(v.firstId, v.secondId)));
  const perList = [];
  for (const [sid, l] of bySong(takes, songId)) {
    if (l.length < 2) continue;
    const latest = l.at(-1), rest = l.slice(0, -1);
    const far = rest.filter(t => days(t.date, latest.date) >= GAP_DAYS);
    const pool = (far.length ? far : rest).filter(t => !judged.has(pairKey(t.id, latest.id)));
    // When the latest is already judged against every older take, the one before it stands in as "요즘".
    let chosen = spread(pool, perSong).map(t => [t, latest]);
    if (!chosen.length && l.length >= 3) {
      const prev = l.at(-2), older = l.slice(0, -2).filter(t => !judged.has(pairKey(t.id, prev.id)));
      chosen = spread(older, perSong).map(t => [t, prev]);
    }
    perList.push(chosen.map(([old, now]) => {
      const aIsFirst = random() < 0.5;
      return {key:pairKey(old.id, now.id), songId:sid, a:aIsFirst ? old : now, b:aIsFirst ? now : old, aIsFirst};
    }));
  }
  const out = [];
  for (let i = 0; perList.some(l => i < l.length); i++) for (const l of perList) if (i < l.length) out.push(l[i]);
  return out;
}
function queue(takes, {songId = null} = {}) {
  return clean(takes).filter(t => !songId || t.songId === songId).sort((x, y) => -order(x, y)).map(t => ({key:t.id, songId:t.songId, take:t}));
}
function section(take, clip) {
  const len = Number(take?.seconds) || 0;
  return clip && (!len || len > CLIP_SECONDS + 5) ? {start:0, end:CLIP_SECONDS} : {start:0, end:null};
}
return {GAP_DAYS, PER_SONG, CLIP_SECONDS, pairKey, pairs, queue, section};
});
