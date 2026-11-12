// Lesson / training suggestions for unsorted recordings (app/recording-kind.js): free signals only, suggestion only.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const K = require('../app/recording-kind.js');

const at = (date, hh, mm) => new Date(date + 'T' + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + ':00').getTime();
const dateOf = item => { if (!item.created) return ''; const d = new Date(item.created); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const lessons = [{id:'l1', date:'2026-11-05', startTime:'19:00', endTime:'20:00', status:'done'},
  {id:'l2', date:'2026-11-07', status:'done'},
  {id:'l3', date:'2026-11-09', startTime:'15:00', status:'cancelled'}];

test('a recording made during a lesson on the calendar is suggested as a lesson recording', () => {
  const g = K.guess({id:'a', name:'새 녹음 12', created:at('2026-11-05', 19, 20), durationSeconds:3000}, {lessons, dateOf});
  assert.equal(g.kind, 'lesson');
  assert.match(g.why, /11월 5일 19:00 레슨 시간에 녹음/);
});
test('same day but hours away from the lesson, a short take on a lesson day, or a cancelled lesson: no lesson suggestion', () => {
  assert.equal(K.guess({id:'b', name:'새 녹음', created:at('2026-11-05', 9, 0), durationSeconds:3000}, {lessons, dateOf}), null);
  assert.equal(K.guess({id:'c', name:'새 녹음', created:at('2026-11-07', 10, 0), durationSeconds:120}, {lessons, dateOf}), null);
  assert.equal(K.guess({id:'d', name:'새 녹음', created:at('2026-11-09', 15, 10), durationSeconds:3000}, {lessons, dateOf}), null);
});
test('a long recording on a lesson day without lesson times is suggested with its length', () => {
  const g = K.guess({id:'e', name:'음성 메모', created:at('2026-11-07', 14, 0), durationSeconds:40 * 60}, {lessons, dateOf});
  assert.deepEqual([g.kind, g.why], ['lesson', '11월 7일 레슨 날 녹음 · 40분']);
});
test('file names and coaching talk point to lessons; exercise names and syllables point to training', () => {
  assert.equal(K.guess({id:'f', name:'보컬레슨_1105.m4a'}, {dateOf}).kind, 'lesson');
  assert.equal(K.guess({id:'g', name:'새 녹음'}, {dateOf, transcript:'자 다시 한번 더 해볼게요 호흡 먼저 잡고 좋아요 그 느낌'}).kind, 'lesson');
  assert.equal(K.guess({id:'h', name:'립트릴 스케일.m4a'}, {dateOf}).kind, 'training');
  assert.equal(K.guess({id:'i', name:'새 녹음'}, {dateOf, transcript:'아 아 아 아아아 오 오 마 메 미 모 무'}).kind, 'training');
});
test('sung lyrics are not mistaken for training or coaching, and the user\'s own choice always wins', () => {
  assert.equal(K.guess({id:'j', name:'새 녹음'}, {dateOf, transcript:'지금 이 순간 지금 여기 간절히 바라고 원했던 이 순간 나만의 꿈이'}), null);
  assert.equal(K.trainingLike('There is a moment when the world stands still and every dream'), false);
  assert.equal(K.trainingLike('아 아 아'), false, 'too short to tell');
  assert.equal(K.guess({id:'k', name:'보컬레슨', recordingCategory:'song'}, {dateOf}), null);
  assert.equal(K.guess({id:'l', name:'보컬레슨'}, {dateOf, current:'lesson'}), null, 'already in the lesson tab');
});
