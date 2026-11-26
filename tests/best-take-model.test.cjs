// 베스트 테이크 후보 (app/best-take-model.js): the takes of one song that measured best, with why. Node only; invented data.
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../app/best-take-model.js');
const take = (id, into, wob, phrase, created = 1, extra = {}) => ({id, created, analysis:{v:2, metrics:{intonation:{meanAbsCents:into}, stability:{wobbleCents:wob}, breath:{medianPhrase:phrase}}}, ...extra});

test('ranked on every measure it has; the best take first with what it does best', () => {
  const out = B.pick([take('a', 20, 10, 3), take('b', 12, 8, 4), take('c', 15, 6, 5), take('d', 30, 20, 2)]);
  assert.deepEqual(out.map(x => x.take.id), ['c', 'b', 'a']);
  assert.deepEqual(out[0].reasons, ['소리가 가장 덜 흔들려요', '프레이즈를 가장 길게 이어요']);
  assert.deepEqual(out[1].reasons, ['음정이 가장 정확해요']);
  assert.equal(out[0].values, '음정 오차 ±15 cent · 흔들림 ±6 cent · 프레이즈 5초');
});

test('unreliable or unmeasured takes stay out; fewer than two takes give no suggestion; ties go to the newer take', () => {
  const unsure = take('x', 1, 1, 9, 9, {unsure:true});
  assert.deepEqual(B.pick([take('a', 20, 10, 3), unsure, {id:'none', analysis:null}], {reliable:m => !m.unsure}), []);
  const tie = B.pick([take('old', 10, 10, 3, 1), take('new', 10, 10, 3, 5)]);
  assert.deepEqual(tie.map(x => x.take.id), ['new', 'old']);
  // A take without stability or phrase values is ranked on what it has.
  const part = B.pick([{id:'p', created:1, analysis:{metrics:{intonation:{meanAbsCents:5}}}}, take('q', 9, 4, 4)]);
  assert.equal(part[0].take.id, 'p');
});
