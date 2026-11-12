#!/usr/bin/env node
// Ground-truth benchmark for the on-device pitch analyzer on generated recordings (tests/pitch-truth.cjs).
// Usage: node tools/pitch-bench.cjs [label=path/to/vocal-analysis.js …]   (default: the working tree)
// e.g.  git show origin/main:app/vocal-analysis.js > /tmp/va-main.js && node tools/pitch-bench.cjs main=/tmp/va-main.js new=app/vocal-analysis.js
'use strict';
const path = require('node:path');
const {scenarios, score} = require('../tests/pitch-truth.cjs');
const {synth} = require('../tests/synth-vocal.cjs');
const args = process.argv.slice(2), list = args.length ? args : ['current=' + path.join(__dirname, '../app/vocal-analysis.js')];
const analyzers = list.map(a => { const [label, file] = a.includes('=') ? a.split('=') : [path.basename(a), a]; return [label, require(path.resolve(file))]; });
const highs = r => { const g = r.metrics.range; if (!g) return '—'; return [g.instantaneous?.note || g.peak || '—', g.validHigh ? g.validHigh.note : g.validHigh === null ? '보류' : g.high || '—', g.stableHigh ? g.stableHigh.note : g.stableHigh === null ? '보류' : '—'].join('/'); };
const rows = scenarios();
// The existing song-like fixture (voice over piano chords, bass, hi-hat): truth from its note list.
for (const [name, opt] of [['synth song, MR −12 dB', {sr:16000}], ['synth song, MR 0 dB', {sr:16000, mrDb:0}]]) {
  const s = synth(opt);
  rows.push([name, {samples:s.samples, sr:s.sr, notes:s.notes.map(([t, d, midi, det, vib]) => ({t, d, midi, cents:det, vib:vib ? {rate:5.5, cents:40} : null}))}, 'C5']);
}
console.log('| scenario | ' + analyzers.map(([l]) => l + ' acc% / oct% / FA% · inst/valid/stable').join(' | ') + ' |');
console.log('|---|' + analyzers.map(() => '---|').join(''));
for (const [name, rec, expected] of rows) {
  const cells = analyzers.map(([, A]) => { const t0 = Date.now(), r = A.analyze(rec.samples, rec.sr), s = score(rec, r); return s.accuracy + ' / ' + s.octaveErrors + ' / ' + (s.falseAlarm ?? '—') + ' · ' + highs(r) + ' (' + (Date.now() - t0) + 'ms)'; });
  console.log('| ' + name + ' (expect ' + expected + ') | ' + cells.join(' | ') + ' |');
}
