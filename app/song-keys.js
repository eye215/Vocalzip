/* A song's keys (원키 · 연습키): one place that reads them and understands how a key is written.
 * Stored on the song: songs[].repertoire.originalKey / practiceKey (text, kept exactly as typed).
 * Older data kept them on a score (songs[].scores[].originalKey / practiceKey): those are still read until the keys are
 * first saved on the song (repertoire.keysAt), and are never changed or removed.
 * Understood by parse(): C, F#, F♯, Gb, G♭, F#/Gb, Am, F#m, "F# major", "Bb minor", "E flat major", "F sharp",
 * "Gb장조", "A단조", "C#마이너", "올림 바 장조", "내림 나 단조", "다장조", with an optional "key" / "키" after it.
 * relative(): "+2", "-2", "−2키", "2키 다운", "3키 올림" (연습키 written as a move from the original key).
 * Anything else stays as a note: it is shown as typed and not used for the MR key suggestion. */
(function (root, factory) { const api = factory(); root.VzipSongKeys = api; if (typeof module === 'object' && module.exports) module.exports = api; })(globalThis, () => {
'use strict';
const NAMES = ['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'];
/** The choices of the score sheet: every key, major then minor ("Am"). */
const OPTIONS = NAMES.flatMap(k => [k, k + 'm']);
const LETTER = {C:0, D:2, E:4, F:5, G:7, A:9, B:11}, KOREAN = {다:0, 라:2, 마:4, 바:5, 사:7, 가:9, 나:11};
const text = v => String(v ?? '').normalize('NFKC').replace(/[♯]/g, '#').replace(/[♭]/g, 'b').replace(/[−–—]/g, '-').trim();
const made = (pc, minor) => { pc = ((pc % 12) + 12) % 12; return {pc, minor, name:NAMES[pc] + (minor ? 'm' : '')}; };
const MODE = '(minor|Minor|MINOR|min|Min|MIN|major|Major|MAJOR|maj|Maj|MAJ|m|M|단조|장조|마이너|메이저)';
const LATIN = new RegExp('^([A-Ga-g])(#|b)?(?:/([A-Ga-g])(#|b)?)?\\s*' + MODE + '?\\s*(?:[Kk]ey|KEY|키)?$');
const HANGUL = /^(올림|내림)?\s*([다라마바사가나])\s*(장조|단조)$/;
/** {pc 0–11, minor, name ("F#/Gb", "Am")} for a key written in one of the supported ways, else null. */
function parse(value) {
  let t = text(value);
  if (!t) return null;
  let m = t.match(HANGUL);
  if (m) return made(KOREAN[m[2]] + (m[1] === '올림' ? 1 : m[1] === '내림' ? -1 : 0), m[3] === '단조');
  // "F sharp", "E-flat", "F #", "F# / Gb" → "F#", "Eb", "F#", "F#/Gb"
  t = t.replace(/^([A-Ga-g])[\s-]*(?:sharp|샵|샾)/i, '$1#').replace(/^([A-Ga-g])[\s-]*(?:flat|플랫)/i, '$1b').replace(/^([A-Ga-g])\s+#/, '$1#').replace(/\s*\/\s*/, '/');
  m = t.match(LATIN);
  if (!m) return null;
  const step = sign => sign === '#' ? 1 : sign === 'b' ? -1 : 0, pc = LETTER[m[1].toUpperCase()] + step(m[2]);
  // "F#/Gb": both names must be the same note.
  if (m[3] && ((LETTER[m[3].toUpperCase()] + step(m[4]) - pc) % 12 + 12) % 12) return null;
  return made(pc, m[5] === 'm' || /^(min|minor|단조|마이너)$/i.test(m[5] || ''));
}
/** Semitones for a 연습키 written as a move ("-2", "+1키", "2키 다운"), else null. */
function relative(value) {
  const t = text(value).replace(/\s+/g, '');
  let m = t.match(/^([+-])(\d{1,2})(?:키|key)?$/i);
  if (m) return (m[1] === '-' ? -1 : 1) * Number(m[2]);
  m = t.match(/^(\d{1,2})(?:키|key)?(업|올림|올려|높게|up|다운|내림|내려|낮게|down)$/i);
  return m ? (/^(업|올림|올려|높게|up)$/i.test(m[2]) ? 1 : -1) * Number(m[1]) : null;
}
/** Semitones from one key to another, the nearest way round (−5…+6); null when either is not understood. */
function interval(from, to) {
  const a = parse(from), b = parse(to);
  if (!a || !b) return null;
  const d = ((b.pc - a.pc) % 12 + 12) % 12;
  return d > 6 ? d - 12 : d;
}
/** The song's keys as typed: from the song, or (older data, until the song's keys are first saved) its first score that has one. */
function of(song) {
  const r = song?.repertoire || {}, scores = (song?.scores || []).filter(s => s && !s.deleted);
  const pick = field => {
    const own = String(r[field] ?? '').trim();
    if (own || r.keysAt) return own;
    return String(scores.find(s => String(s[field] ?? '').trim())?.[field] ?? '').trim();
  };
  const originalKey = pick('originalKey'), practiceKey = pick('practiceKey');
  const move = relative(practiceKey);
  return {originalKey, practiceKey, stageKey:String(r.stageKey ?? '').trim(),
    // How far to move an original-key MR to reach the practice key (the MR player moves up to 6 semitones either way).
    suggested:move != null ? (Math.abs(move) <= 6 ? move : null) : practiceKey && originalKey ? interval(originalKey, practiceKey) : null};
}
/** "원키 E · 연습키 D · 공연키 Eb" for the keys that are filled in. */
const summary = (song, {practice = '연습키'} = {}) => { const k = of(song); return [k.originalKey && '원키 ' + k.originalKey, k.practiceKey && practice + ' ' + k.practiceKey, k.stageKey && '공연키 ' + k.stageKey].filter(Boolean).join(' · '); };
return {NAMES, OPTIONS, parse, relative, interval, of, summary};
});
