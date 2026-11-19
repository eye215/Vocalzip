// 성장 개편 안 B, phase 3 — 곡 하나의 판정 (app/growth-song-model.js): ONE verdict per song, made from the pair 무엇이 달라졌나
// picks (app/growth-changes-model.js songChange, no period) and the 결과 리포트 measure rules (comparePair), for the takes
// of VzipGrowthDataset.verdictRule({practice}). Node only; invented data (tests/growth-b1.fixture.cjs).
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../app/growth-song-model.js');
const C = require('../app/growth-changes-model.js');
const G = require('../app/growth-metrics-model.js');
const {take, SONG_TAKES, NOV, v2} = require('./growth-b1.fixture.cjs');
const song = (takes, extra = {}) => ({songId:'s1', title:'연습곡 하나', takes, ...extra});

test('the pair and the lines are 무엇이 달라졌나\'s (처음·최근, no period) — the word comes from the same pair', () => {
  const v = S.verdict(song(SONG_TAKES)), c = C.songChange(song(SONG_TAKES));
  assert.deepEqual([v.firstId, v.lastId], [c.item.firstId, c.item.lastId]);
  assert.deepEqual([v.firstId, v.lastId], ['aug', 'nov2']);
  assert.equal(v.item.basis, c.item.basis);
  assert.deepEqual(v.item.changes, c.item.changes);
  assert.equal(v.state, 'better');
  assert.equal(v.word, '좋아진 방향');
  assert.equal(v.text, '좋아진 지표: 음정 정확도');
  assert.equal(v.takes, 5);
  // The measures are the 결과 리포트 rules for exactly that pair.
  const report = G.comparePair(SONG_TAKES[0], SONG_TAKES[4]);
  assert.deepEqual(v.rows.map(r => [r.id, r.state]), ['intonation', 'stability', 'range', 'phrase', 'high'].map(id => [id, report[id].state]));
  assert.equal(v.rows[0].text, G.changeText(report.intonation));
  assert.equal(v.rows.find(r => r.id === 'passaggio'), undefined);            // 파사지오 is a reference under 약한 곳, never a row of the verdict
});

test('the words: 아쉬운 방향 · 엇갈림 · 비슷함 · 판정 보류 · 녹음 하나 · 분석 전', () => {
  const a = take('a', '2026-10-01', v2({into:12, wob:10})), worse = take('b', '2026-11-01', v2({into:30, wob:10}));
  assert.deepEqual([S.verdict(song([a, worse])).state, S.verdict(song([a, worse])).word], ['worse', '아쉬운 방향']);
  const mixed = S.verdict(song([take('a', '2026-10-01', v2({into:30, wob:10})), take('b', '2026-11-01', v2({into:12, wob:30}))]));
  assert.deepEqual([mixed.state, mixed.word], ['mixed', '엇갈림']);
  assert.match(mixed.text, /^좋아진 지표: 음정 정확도 · 아쉬운 지표: 음정 안정성$/);
  const same = S.verdict(song([a, take('b', '2026-11-01', v2({into:12, wob:10}))]));
  assert.deepEqual([same.state, same.word, same.text], ['similar', '비슷함', '처음과 최근이 비슷해요']);
  // One analysed take: 녹음 하나, with what to do next.
  const one = S.verdict(song([a]));
  assert.deepEqual([one.state, one.word, one.rows.length], ['one', '녹음 하나', 0]);
  assert.equal(one.text, '다른 날 한 번 더 녹음하면 처음과 견줄 수 있어요');
  // Two takes of one day, or takes measured two ways: 판정 보류 with the reason 무엇이 달라졌나 gives.
  const sameDay = S.verdict(song([a, take('b', '2026-10-01', v2({into:20}))]));
  assert.deepEqual([sameDay.state, sameDay.reason], ['hold', 'same-day']);
  const mrTake = take('b', '2026-11-01', v2({into:12, mr:true}));
  const methods = S.verdict(song([a, mrTake]));
  assert.deepEqual([methods.state, methods.word, methods.reason], ['hold', '판정 보류', 'method-mixed']);
  assert.equal(methods.text, C.songChange(song([a, mrTake])).excluded.text);
  // Unreliable only: 판정 보류, not 녹음 하나.
  assert.equal(S.verdict(song([take('a', '2026-10-01', v2({into:12}), {ok:false})])).state, 'hold');
  // Nothing analysed.
  assert.deepEqual([S.verdict(song([])).state, S.verdict(song([{id:'x', date:'2026-10-01', a:null}])).word], ['none', '분석 전']);
});

test('a second measurement with the MR removed stands in, as it does in 무엇이 달라졌나', () => {
  const first = take('a', '2026-10-01', v2({into:30}), {alt:v2({into:28, mr:true})}), last = take('b', '2026-11-01', v2({into:12, mr:true}));
  const v = S.verdict(song([first, last]));
  assert.equal(v.item.viaAlt, 'first');
  assert.equal(v.state, 'better');
  assert.equal(v.report.intonation.before, G.comparePair({...first, a:first.alt}, last).intonation.before);
});

test('지난달 대비: the latest take of the period against the latest before it; null when there is no such pair', () => {
  const m = S.month(song(SONG_TAKES, {period:NOV}));
  assert.deepEqual([m.firstId, m.lastId, m.state, m.word], ['oct2', 'nov2', 'better', '좋아진 방향']);
  assert.equal(m.text, '가까운 반음과의 차이가 줄었어요');
  assert.equal(m.basis, C.songChange(song(SONG_TAKES, {period:NOV})).item.basis);
  assert.equal(S.month(song(SONG_TAKES.slice(0, 3), {period:NOV})), null);          // nothing sung in November
  assert.equal(S.month(song(SONG_TAKES.slice(3), {period:NOV})), null);             // nothing before November
  assert.equal(S.month(song(SONG_TAKES)), null);                                    // no period given
});

test('연습 녹음 포함: one line only when the switch changes the word', () => {
  const off = S.verdict(song(SONG_TAKES.slice(0, 1))), on = S.verdict(song(SONG_TAKES));
  assert.equal(S.effect(off, on, false), '연습 녹음을 넣으면 ‘좋아진 방향’으로 바뀌어요.');
  assert.equal(S.effect(off, on, true), '연습 녹음을 넣어서 ‘녹음 하나’에서 ‘좋아진 방향’으로 바뀌었어요.');
  assert.equal(S.effect(on, off, false), '연습 녹음을 넣으면 ‘녹음 하나’로 바뀌어요.');
  assert.equal(S.effect(on, {...on, word:'판정 보류', state:'hold'}, false), '연습 녹음을 넣으면 ‘판정 보류’로 바뀌어요.');
  assert.equal(S.effect(on, S.verdict(song(SONG_TAKES.slice(0, 5))), false), '');   // same word: nothing is said
  assert.equal(S.effect(null, on, false), '');
});
