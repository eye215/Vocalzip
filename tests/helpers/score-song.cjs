// Fixtures for 음표 단위 악보 비교 (built here: tests/fixtures is not committed).
// - parseXml: a tiny XML parser with the element surface the MusicXML reader uses (Node has no DOMParser).
// - song(): a 32-measure melody (verse A, B, chorus C, verse A again) written as MusicXML with ties, rests, a chord,
//   lyrics and a piano part, plus its notes in beats.
// - sing(): renders a singer over an MR with tests/synth-vocal.cjs: chosen measures only, any key, rubato, onset jitter,
//   per-note detune and deliberate wrong notes. Returns the truth per score note.
'use strict';
const {render} = require('../synth-vocal.cjs');

function parseXml(src) {
  const root = {children:[], parts:[]}, stack = [root];
  const decode = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  const node = (name, attrs) => ({tagName:name, localName:name.replace(/^.*:/, ''), attrs, children:[], parts:[],
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    get textContent() { return this.parts.map(p => typeof p === 'string' ? p : p.textContent).join(''); }});
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[([\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<!DOCTYPE[^>]*>|<\/([\w:.-]+)\s*>|<([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  for (let m; (m = re.exec(src));) {
    const top = stack.at(-1);
    if (m[1] != null) top.parts.push(m[1]);
    else if (m[2]) { if (top.tagName !== m[2]) throw Error('malformed fixture: ' + m[2]); stack.pop(); }
    else if (m[3]) {
      const attrs = {}; for (const a of m[4].matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[a[1]] = decode(a[2] ?? a[3]);
      const el = node(m[3], attrs); top.children.push(el); top.parts.push(el);
      if (!m[5]) stack.push(el);
    } else if (m[6] != null) top.parts.push(decode(m[6]));
  }
  return {documentElement:root.children[0]};
}

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const STEPS = [['C', 0], ['C', 1], ['D', 0], ['D', 1], ['E', 0], ['F', 0], ['F', 1], ['G', 0], ['G', 1], ['A', 0], ['A', 1], ['B', 0]];
const SCALE = [0, 2, 4, 5, 7, 9, 11];

/** One 8-measure section: 4 + 4 measure phrases in C major around `center`, each ending on a long note and a rest. */
function section(seed, center) {
  const r = rng(seed), out = [];
  const midiOf = d => 12 * Math.floor(d / 7) + SCALE[((d % 7) + 7) % 7];
  let degree = 0; for (let d = 0; d < 80; d++) if (Math.abs(midiOf(d) - center) < Math.abs(midiOf(degree) - center)) degree = d;
  for (let phrase = 0; phrase < 2; phrase++) {
    for (let m = 0; m < 4; m++) {
      const bar = []; let left = 4;
      const last = m === 3;
      while (left > 1e-9) {
        if (last) { // phrase end: short note(s), a long note, a breath
          for (const d of r() < 0.5 ? [1, 2] : [0.5, 0.5, 2]) { degree += [-1, 1, -2, 1][Math.floor(r() * 4)]; degree = Math.max(32, Math.min(40, degree)); bar.push([midiOf(degree), d]); }
          bar.push([null, 1]); left = 0; break;
        }
        const choices = [1, 1, 0.5, 0.5, 1.5, 2].filter(d => d <= left);
        let d = choices[Math.floor(r() * choices.length)];
        if (d === 0.5 && left >= 1) { // eighths come in pairs
          degree += [-1, 1, 1, -1, 2, -2][Math.floor(r() * 6)]; bar.push([midiOf(degree), 0.5]);
          degree += [-1, 1][Math.floor(r() * 2)]; bar.push([midiOf(degree), 0.5]); left -= 1; continue;
        }
        degree += [-2, -1, -1, 0, 1, 1, 2, 3, -3][Math.floor(r() * 9)];
        degree = Math.max(7 * 4 + 4, Math.min(7 * 5 + 5, degree)); // A3 … A5 window, kept near the centre
        bar.push([midiOf(degree), d]); left -= d;
      }
      out.push(bar);
    }
  }
  return out;
}
/** The song: measures of [midi | null, beats]. A long note tied over a barline (written as two tied notes). */
function song({seed = 7} = {}) {
  const A = section(seed, 64), B = section(seed + 11, 67), C = section(seed + 23, 71);
  const measures = [...A, ...B, ...C, ...A.map(m => m.map(x => x.slice()))];
  const notes = []; let beat = 0;
  measures.forEach((bar, mi) => {
    for (const [midi, beats] of bar) { if (midi != null) notes.push({midi, beat, beats, mi, measure:String(mi + 1)}); beat += beats; }
  });
  return {measures, notes, beats:beat};
}
/** MusicXML of song(): Voice (with lyrics, one chord, a tie across measures 4→5 when possible) + a Piano part. */
function xml(s, {name = 'Voice', transpose = 0, title = 'Test'} = {}) {
  const DIV = 4;
  const pitch = m => { const [step, alter] = STEPS[((m % 12) + 12) % 12]; return '<pitch><step>' + step + '</step>' + (alter ? '<alter>' + alter + '</alter>' : '') + '<octave>' + (Math.floor(m / 12) - 1) + '</octave></pitch>'; };
  const n = (m, beats, extra = '') => m == null ? '<note><rest/><duration>' + beats * DIV + '</duration><voice>1</voice></note>'
    : '<note>' + pitch(m - transpose) + '<duration>' + Math.round(beats * DIV) + '</duration><voice>1</voice>' + extra + '</note>';
  const lyric = k => '<lyric number="1"><syllabic>single</syllabic><text>la' + k + '</text></lyric>';
  let k = 0;
  const voice = s.measures.map((bar, mi) => '<measure number="' + (mi + 1) + '">' +
    (mi === 0 ? '<attributes><divisions>' + DIV + '</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef>' +
      (transpose ? '<transpose><chromatic>' + transpose + '</chromatic></transpose>' : '') + '</attributes><direction placement="above"><sound tempo="112"/></direction>' : '') +
    bar.map(([m, beats], j) => {
      if (m == null) return n(null, beats);
      // Measure 3: its first note split into two tied halves (same pitch) — read as one note.
      if (mi === 2 && j === 0 && beats >= 1) return n(m, beats / 2, '<tie type="start"/>' + lyric(k++)).replace('</voice>', '</voice>') + n(m, beats / 2, '<tie type="stop"/>');
      // Measure 6: the first note carries a chord tone a third below (the top note is the melody).
      const chord = mi === 5 && j === 0 ? '<note><chord/>' + pitch(m - 4 - transpose) + '<duration>' + Math.round(beats * DIV) + '</duration><voice>1</voice></note>' : '';
      return n(m, beats, lyric(k++)) + chord;
    }).join('') + '</measure>').join('');
  const piano = s.measures.map((bar, mi) => '<measure number="' + (mi + 1) + '">' + (mi === 0 ? '<attributes><divisions>' + DIV + '</divisions><staves>2</staves></attributes>' : '') +
    '<note>' + pitch(48) + '<duration>16</duration><staff>2</staff></note><backup><duration>16</duration></backup><note>' + pitch(72) + '<duration>16</duration><staff>1</staff></note></measure>').join('');
  return '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><work><work-title>' + title + '</work-title></work><part-list><score-part id="P1"><part-name>' + name + '</part-name></score-part><score-part id="P2"><part-name>Piano</part-name></score-part></part-list>' +
    '<part id="P1">' + voice + '</part><part id="P2">' + piano + '</part></score-partwise>';
}

/** A singer performing measures [from, to] (1-based) of the song.
 * shift: semitones (−12 = an octave lower); mrShift: the MR's key; tempo: beats/min; rubato: ± share of the beat length
 * (slow wave); jitter: onset jitter s; wrong: {noteIndex: semitones} deliberate wrong notes; detune: ± cents random. */
function sing(s, {from = 1, to = s.measures.length, shift = 0, mrShift = shift % 12, tempo = 112, rubato = 0.06, jitter = 0.03, wrong = {}, detune = 15, seed = 3, lead = 2.5, mrDb = -12, hold = []} = {}) {
  const r = rng(seed), spb0 = 60 / tempo, notesIn = s.notes.map((n, i) => ({...n, i})).filter(n => n.mi + 1 >= from && n.mi + 1 <= to);
  const b0 = notesIn[0].beat;
  // Beat → seconds with a slow tempo wave.
  const timeOf = b => { let t = lead; const steps = Math.max(1, Math.round((b - b0) * 8)), db = (b - b0) / steps; for (let k = 0; k < steps; k++) { const x = (k + 0.5) * db; t += db * spb0 * (1 + rubato * Math.sin(2 * Math.PI * x / 14)); } return t; };
  const out = [], truth = [];
  let extra = 0;
  notesIn.forEach((n, k) => {
    const next = notesIn[k + 1];
    const on = timeOf(n.beat) + extra + (k ? (r() * 2 - 1) * jitter : 0);
    let end = timeOf(n.beat + n.beats) + extra;
    if (hold.includes(n.i)) { const add = n.beats * spb0 * 0.8; end += add; extra += add; } // a fermata the singer holds longer
    const legato = next && Math.abs(next.beat - (n.beat + n.beats)) < 1e-6;
    const dur = Math.max(0.12, end - on - (legato ? 0.02 : 0.12));
    const err = wrong[n.i] || 0, det = Math.round((r() * 2 - 1) * detune);
    out.push([on, dur, n.midi + shift + err, det, dur >= 0.9]);
    truth.push({i:n.i, err, det, t:on, dur, mi:n.mi});
  });
  const dur = out.at(-1)[0] + out.at(-1)[1] + 2;
  const audio = render({notes:out, dur, sr:16000, mrDb, mrShift, seed});
  return {...audio, truth, sung:out};
}
module.exports = {parseXml, song, xml, sing};
