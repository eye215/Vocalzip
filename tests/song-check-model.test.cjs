// 곡 확인이 필요해 보이는 녹음 (app/song-check-model.js): a take far from its song's other takes is pointed at, with the
// song whose takes it sits with. Fake analyses only.
const test = require('node:test'), assert = require('node:assert/strict');
const C = require('../app/song-check-model.js');
// An analysis whose main range is [low, high] (MIDI notes), read as 성장 › 음역 reads it.
const a = (low, high) => ({v:2, confidence:{aiSeparated:true}, metrics:{voicedSeconds:60, range:{lowCents:(low - 2) * 100, highCents:(high + 2) * 100, main:{lowCents:low * 100, highCents:high * 100}}}});
const t = (id, songId, low, high, date = '2026-11-01') => ({id, songId, date, a:a(low, high)});
const river = [t('r1', 'river', 60, 72), t('r2', 'river', 61, 72), t('r3', 'river', 60, 71), t('r4', 'river', 60, 72)];
const home = [t('h1', 'home', 52, 64), t('h2', 'home', 53, 64), t('h3', 'home', 52, 63)];

test('a take far from its song is pointed at, with the song it sits with', () => {
  const wrong = t('x', 'river', 52, 64, '2026-11-10');   // a Home take filed under The River
  const s = C.suspects([...river, ...home, wrong]);
  assert.deepEqual(s, [{id:'x', songId:'river', date:'2026-11-10', semitones:8, dir:'low', likeSongId:'home', likeSemitones:0}]);
  assert.equal(C.reasonText(s[0]), '이 곡의 다른 녹음보다 주로 부른 음역이 8반음 낮아요');
});

test('small differences are fine; too few takes judge nothing; 맞아요 is kept', () => {
  assert.deepEqual(C.suspects([...river, t('y', 'river', 62, 74)]), []);                 // 2 semitones: same song
  assert.deepEqual(C.suspects([t('a1', 's', 60, 72), t('a2', 's', 60, 72), t('a3', 's', 70, 82)]), []);   // 3 takes only
  const far = t('z', 'river', 68, 80);
  assert.equal(C.suspects([...river, far])[0].id, 'z');
  assert.equal(C.suspects([...river, far])[0].likeSongId, null);
  assert.deepEqual(C.suspects([...river, far], {dismissed:['z']}), []);
});

test('takes without a readable main range are left out (v1, no analysis, weak separation)', () => {
  const v1 = {id:'v', songId:'river', a:{...a(40, 50), v:1}}, none = {id:'n', songId:'river', a:null};
  const weak = {id:'w', songId:'river', a:{...a(40, 50), confidence:{voiceOverMrDb:-20}}};
  assert.deepEqual(C.suspects([...river, v1, none, weak]), []);
});
