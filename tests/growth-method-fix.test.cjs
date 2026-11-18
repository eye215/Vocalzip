// A take measured as recorded with a second, trusted measurement with the MR removed kept next to it (analysis.mrAlt,
// given to the models as take.alt): it pairs with an MR-removed take through that measurement, for that pair only.
// Without it, or with another analysis version, the pair stays left out (method-mixed).
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../app/growth-changes-model.js');
const E = require('../app/ear-agreement-model.js');
const {v2} = require('./growth-characterization.fixture.cjs');

const take = (id, date, a, alt) => ({id, songId:'s1', a, date, created:Date.parse(date + 'T20:00:00+09:00'), ok:true, ...(alt ? {alt} : {})});
const ALT = {...v2({into:24, wob:20, mr:true})};
const AUG = take('aug', '2025-08-14', {...v2({into:30, wob:20}), mrAlt:ALT}, ALT);
const RAW = take('aug', '2025-08-14', v2({into:30, wob:20}));
const NOV = take('nov', '2026-11-10', v2({into:12, wob:20, mr:true}));
const verdict = (first, second) => ({id:'v', kind:'listen-verdict', v:1, songId:'s1', firstId:first.id, secondId:second.id, firstDate:first.date, secondDate:second.date,
  firstRange:null, secondRange:null, overall:'second', tags:{}, memo:'', judge:'me', teacher:'', lessonId:'', blind:true, judgedDate:'2026-11-18', created:1});

test('같은 곡 같은 방법: an as-recorded take with mrAlt pairs with an MR-removed take; without it, it is left out', () => {
  const r = C.songChange({songId:'s1', title:'Defying Gravity', takes:[AUG, NOV]});
  assert.ok(r.item, JSON.stringify(r.excluded));
  assert.equal(r.item.method, 'mrRemoved');
  assert.equal(r.item.viaAlt, 'first');
  assert.equal(r.item.basis, '같은 곡 Defying Gravity · MR 빼고 잰 녹음 2개 (MR 빼고 따로 잰 결과로 견줌) · 2025년 8월 → 2026년 11월');
  // Measured with mrAlt (24 → 12), not with the as-recorded result (30 → 12).
  assert.equal(r.item.changes.find(c => c.id === 'intonation').numbers, '±24 cent → ±12 cent');
  const raw = C.songChange({songId:'s1', title:'Defying Gravity', takes:[RAW, NOV]});
  assert.equal(raw.excluded?.reason, 'method-mixed');
  assert.deepEqual(raw.excluded.remeasure, {id:'aug', method:'asRecorded', label:'2025년 8월'});
  // Another analysis version: not used.
  const old = take('aug', '2025-08-14', RAW.a, {...ALT, v:1});
  assert.equal(C.songChange({songId:'s1', title:'Defying Gravity', takes:[old, NOV]}).excluded?.reason, 'method-mixed');
  // The other way round: the latest take as recorded with mrAlt, the earlier one MR 빼고.
  const late = take('late', '2026-11-12', {...v2({into:20}), mrAlt:ALT}, ALT), mr = take('mr', '2026-09-01', v2({into:26, mr:true}));
  const back = C.songChange({songId:'s1', title:'T', takes:[mr, late]});
  assert.equal(back.item?.viaAlt, 'second');
  assert.equal(back.item.method, 'mrRemoved');
});

test('귀와 숫자: the verdict pair is compared through mrAlt and says so; without it, still method-mixed', () => {
  const p = E.pair(verdict(AUG, NOV), {takeOf:id => [AUG, NOV].find(t => t.id === id)});
  assert.equal(p.usable, true);
  assert.equal(p.method, 'mrRemoved');
  assert.equal(p.viaAlt, 'first');
  assert.equal(E.pairBasis(p), 'MR 빼고 잰 두 녹음 (MR 빼고 따로 잰 결과로 견줌) · 분석 v2');
  assert.equal(p.rows.find(r => r.id === 'intonation').move, 'second');
  const q = E.pair(verdict(RAW, NOV), {takeOf:id => [RAW, NOV].find(t => t.id === id)});
  assert.equal(q.usable, false);
  assert.equal(q.reason, 'method-mixed');
  assert.equal(q.remeasure.id, 'aug');
});
