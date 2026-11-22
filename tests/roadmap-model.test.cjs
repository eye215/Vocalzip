// 내 로드맵 (app/roadmap-model.js): what to fix, from the recordings' analysis tips and the 기본기 records. Node only;
// invented data, no person's recordings.
const test = require('node:test'), assert = require('node:assert/strict');
const R = require('../app/roadmap-model.js'), L = require('../app/levels-model.js');
const TODAY = '2026-11-20', day = n => L.shift('2026-11-01', n - 1);
const db = (practices = []) => ({practices, practicePlans:[], deleted:{}});
const tip = (key, metric, value, score) => ({key, metric, value, basis:'최근 6개 중간값', goal:'목표 ' + key, score});

test('the recordings first: the tips past their line, strongest first, at most two, each with its 기본기 exercise', () => {
  const tips = {enough:true, count:6, range:'C3~A4', measured:['into', 'wob', 'vib', 'phr'], tips:[tip('phr', '프레이즈 길이', '2.8초', .9), tip('into', '음정 오차', '±18 cent', .7), tip('wob', '지속음 흔들림', '±9 cent', .5)]};
  const r = R.build({db:db(), today:TODAY, tips});
  assert.deepEqual(r.basis, {enough:true, count:6, range:'C3~A4'});
  assert.deepEqual(r.focus.map(f => [f.area, f.from, f.exercise, f.step]), [['breath', 'recording', 'breath-hiss', 1], ['pitch', 'recording', 'ear-follow', 1]]);
  assert.equal(r.focus[0].why, '최근 녹음에서 프레이즈 길이 2.8초 (최근 6개 중간값)');
  assert.equal(r.focus[0].goal, '목표 phr');
  // Every area said: past the line, fine lately, or not known from recordings.
  const state = Object.fromEntries(r.areas.map(a => [a.id, a.state]));
  assert.deepEqual(state, {breath:'fix', pitch:'fix', sustain:'fix', path:'unknown', range:'unknown', high:'unknown', vibrato:'ok', rhythm:'unknown'});
  assert.match(r.areas.find(a => a.id === 'vibrato').line, /^최근 녹음에서 괜찮아요/);
  assert.equal(R.summary(r), '손볼 곳 · 호흡 · 음정');
});

test('an exercise turned off is passed over; the step decides which exercise (음정 3단계 → 스케일)', () => {
  const tips = {enough:true, count:5, measured:['into'], tips:[tip('into', '음정 오차', '±18 cent', .7)]};
  const steps = db();steps.practicePlans = [1, 2].map(step => ({id:'skill-step:pitch:' + step, kind:'skill-step', v:1, area:'pitch', step, earned:day(1), days:[], created:1}));
  assert.equal(R.build({db:steps, today:TODAY, tips}).focus[0].exercise, 'ear-scale');
  const off = R.build({db:steps, today:TODAY, tips, isOn:id => id !== 'ear-scale'});
  assert.notEqual(off.focus[0]?.area, 'pitch');
});

test('too few recordings, or nothing past its line: the 기본기 focus (an area not measured yet first)', () => {
  const none = R.build({db:db(), today:TODAY, tips:{enough:false, count:2, tips:[]}});
  assert.deepEqual(none.focus.map(f => [f.area, f.from, f.exercise]), [['breath', 'skill', 'breath-hiss']]);
  assert.equal(none.focus[0].why, '호흡을 아직 재지 않았어요');
  assert.match(none.areas.find(a => a.id === 'pitch').line, /^녹음이 3개 넘게 분석되면 알 수 있어요/);
  assert.equal(R.summary(none), '기본기 · 호흡');
  const fine = R.build({db:db(), today:TODAY, tips:{enough:true, count:8, measured:['into', 'wob', 'vib', 'phr'], tips:[]}});
  assert.equal(fine.focus[0].from, 'skill');
  assert.deepEqual(fine.areas.filter(a => a.state === 'ok').map(a => a.id), ['breath', 'pitch', 'sustain', 'vibrato']);
  assert.deepEqual(R.build({db:db(), today:TODAY, tips:null}).basis, {enough:false, count:0, range:''});
});
