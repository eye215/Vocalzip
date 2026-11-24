/* 곡 확인이 필요해 보이는 녹음 (owner, 2026-11-24: listening found a take filed under the wrong song). Pure: no DOM,
 * storage or network; also loaded by Node tests. Nothing is decided here — it only points at takes worth a listen.
 *
 * A song is sung over the same notes each time, so the main range of its takes (the 주로 부른 음역 of the analysis, read
 * exactly as 성장 › 음역 reads it: app/growth-range-model.js read) stays close. A take whose main range sits
 * GAP_SEMITONES or more away from the song's other takes (their median, the take itself left out) is a suspect: filed
 * under the wrong song, sung in another key, or measured an octave off. When the take's range is close to another song's
 * takes, that song is offered.
 *
 * suspects(takes, {dismissed}) → [{id, songId, date, semitones, dir:'high'|'low', likeSongId|null, likeSemitones|null}]
 *   takes: [{id, songId, date, a}] (a = the take's analysis); dismissed: ids the person said are right ("맞아요").
 *   Only songs with at least MIN_TAKES readable takes are judged (fewer give no "usual" to compare with). Largest gap first. */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./growth-range-model.js') : root.VzipGrowthRange);
  if (node) module.exports = api; else root.VzipSongCheck = api;
})(typeof self !== 'undefined' ? self : globalThis, R => {
'use strict';
const GAP_SEMITONES = 5, LIKE_SEMITONES = 2, MIN_TAKES = 4;
const list = v => Array.isArray(v) ? v : [];
const median = xs => { const s = xs.slice().sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
/** The middle of a take's main range in cents, or null when the analysis gives no main range (as 성장 › 음역 reads it). */
function centerOf(a) {
  if (!R?.read) return null;
  const r = R.read(a);
  return r.why || r.mainLowCents == null || r.mainHighCents == null ? null : (r.mainLowCents + r.mainHighCents) / 2;
}
function suspects(takes, {dismissed = []} = {}) {
  const ok = new Set(list(dismissed).map(String));
  const bySong = new Map();
  for (const t of list(takes)) {
    if (!t?.id || !t.songId) continue;
    const c = centerOf(t.a); if (c == null) continue;
    if (!bySong.has(t.songId)) bySong.set(t.songId, []);
    bySong.get(t.songId).push({...t, c});
  }
  const songMedian = new Map([...bySong].filter(([, l]) => l.length >= MIN_TAKES - 1).map(([id, l]) => [id, median(l.map(x => x.c))]));
  const out = [];
  for (const [songId, l] of bySong) {
    if (l.length < MIN_TAKES) continue;
    for (const t of l) {
      if (ok.has(String(t.id))) continue;
      const others = median(l.filter(x => x !== t).map(x => x.c)), gap = (t.c - others) / 100;
      if (Math.abs(gap) < GAP_SEMITONES) continue;
      // Another song whose takes sit where this one does.
      let like = null, likeGap = Infinity;
      for (const [other, m] of songMedian) {
        if (other === songId) continue;
        const d = Math.abs(t.c - m) / 100;
        if (d <= LIKE_SEMITONES && d < likeGap) { like = other; likeGap = d; }
      }
      out.push({id:t.id, songId, date:t.date || '', semitones:Math.round(Math.abs(gap)), dir:gap > 0 ? 'high' : 'low', likeSongId:like, likeSemitones:like ? Math.round(likeGap) : null});
    }
  }
  return out.sort((x, y) => y.semitones - x.semitones || String(x.date).localeCompare(String(y.date)));
}
/** One line for a suspect: "이 곡의 다른 녹음보다 주로 부른 음역이 6반음 높아요". */
const reasonText = s => '이 곡의 다른 녹음보다 주로 부른 음역이 ' + s.semitones + '반음 ' + (s.dir === 'high' ? '높아요' : '낮아요');
return {GAP_SEMITONES, LIKE_SEMITONES, MIN_TAKES, centerOf, suspects, reasonText};
});
