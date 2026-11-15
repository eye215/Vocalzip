// A song's keys (app/song-keys.js): how a key may be written, the shift an MR needs, and where the keys are read from.
const test = require('node:test'), assert = require('node:assert/strict');
const K = require('../app/song-keys.js');
const name = v => K.parse(v)?.name ?? null;

test('keys written in the common ways are understood', () => {
  for (const [text, expected] of [
    ['C', 'C'], ['F#', 'F#/Gb'], ['F♯', 'F#/Gb'], ['Gb', 'F#/Gb'], ['G♭', 'F#/Gb'], ['F#/Gb', 'F#/Gb'], ['Db/C#', 'C#/Db'], ['F ＃', 'F#/Gb'],
    ['Am', 'Am'], ['F#m', 'F#/Gbm'], ['F#/Gbm', 'F#/Gbm'], ['Bbm', 'A#/Bbm'], ['D minor', 'Dm'], ['Dmin', 'Dm'], ['D MINOR', 'Dm'],
    ['F# major', 'F#/Gb'], ['DM', 'D'], ['Dmaj', 'D'], ['E flat major', 'D#/Eb'], ['E-flat major', 'D#/Eb'], ['F sharp minor', 'F#/Gbm'],
    ['Gb장조', 'F#/Gb'], ['A단조', 'Am'], ['C#마이너', 'C#/Dbm'], ['G 메이저', 'G'], ['올림 바 장조', 'F#/Gb'], ['내림 나 단조', 'A#/Bbm'], ['다장조', 'C'], ['가단조', 'Am'],
    ['D key', 'D'], ['D키', 'D'], ['  eb  ', 'D#/Eb'], ['bb', 'A#/Bb'], ['b', 'B'], ['Cb', 'B'], ['B#', 'C']
  ]) assert.equal(name(text), expected, text);
});
test('every choice of the score sheet reads as itself', () => {
  assert.equal(K.OPTIONS.length, 24);
  for (const option of K.OPTIONS) assert.equal(name(option), option);
});
test('anything else is not guessed: it stays a note', () => {
  for (const text of ['', null, undefined, '여자 키', '원키', 'H', 'AB', 'Bbb', 'Cm7', 'F#/G', 'A-', '-2', '2키 낮게', 'C D', '장조', '올림 바'])
    assert.equal(K.parse(text), null, String(text));
});
test('interval is the nearest way round and ignores major/minor', () => {
  assert.equal(K.interval('D', 'F'), 3);
  assert.equal(K.interval('F', 'D'), -3);
  assert.equal(K.interval('C', 'B'), -1);
  assert.equal(K.interval('C', 'F#'), 6);
  assert.equal(K.interval('C', 'G'), -5);
  assert.equal(K.interval('F# major', 'Gb장조'), 0);
  assert.equal(K.interval('Am', 'C'), 3);
  assert.equal(K.interval('올림 바 장조', 'E♭'), -3);
  assert.equal(K.interval('여자 키', 'C'), null);
  assert.equal(K.interval('C', ''), null);
});
test('a practice key written as a move is a shift by itself', () => {
  for (const [text, expected] of [['+2', 2], ['-2', -2], ['−2키', -2], ['+1key', 1], ['2키 다운', -2], ['3키 올림', 3], ['1키 업', 1], ['2키 낮게', -2], ['2키', null], ['E', null], ['', null]])
    assert.equal(K.relative(text), expected, text);
});
test("a song's keys: the song first, an older score's keys until the song's keys are saved", () => {
  const scores = [{id:'a', deleted:true, originalKey:'A'}, {id:'b', originalKey:'E', practiceKey:'F'}];
  // Only a score has keys (older data).
  assert.deepEqual(K.of({scores}), {originalKey:'E', practiceKey:'F', stageKey:'', suggested:1});
  // The song has one of them: the other still comes from the score.
  assert.deepEqual(K.of({repertoire:{practiceKey:'D'}, scores}), {originalKey:'E', practiceKey:'D', stageKey:'', suggested:-2});
  // Once the song's keys were saved, a cleared key stays cleared.
  assert.deepEqual(K.of({repertoire:{keysAt:1, originalKey:'', practiceKey:'D', stageKey:'Eb'}, scores}), {originalKey:'', practiceKey:'D', stageKey:'Eb', suggested:null});
  // Free text is returned exactly as typed; a key that is not understood gives no suggestion.
  assert.deepEqual(K.of({repertoire:{originalKey:' F# major ', practiceKey:'여자 키'}}), {originalKey:'F# major', practiceKey:'여자 키', stageKey:'', suggested:null});
  assert.equal(K.of({repertoire:{originalKey:'F# major', practiceKey:'내림 마 장조'}}).suggested, -3);
  // 연습키 as a move needs no original key; beyond what the MR player can move there is no suggestion.
  assert.equal(K.of({repertoire:{practiceKey:'-2키'}}).suggested, -2);
  assert.equal(K.of({repertoire:{originalKey:'C', practiceKey:'+8'}}).suggested, null);
  assert.deepEqual(K.of(null), {originalKey:'', practiceKey:'', stageKey:'', suggested:null});
  assert.equal(K.summary({repertoire:{originalKey:'E', practiceKey:'D', stageKey:'Eb'}}), '원키 E · 연습키 D · 공연키 Eb');
  assert.equal(K.summary({}), '');
});
test('reading never changes the song or its scores', () => {
  const song = {repertoire:{originalKey:'F# major'}, scores:[{id:'b', originalKey:'E', practiceKey:'F'}]}, before = JSON.stringify(song);
  K.of(song); K.summary(song);
  assert.equal(JSON.stringify(song), before);
});
