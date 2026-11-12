import {test} from 'node:test';
import assert from 'node:assert/strict';
import {normalizeText,scoreTranscripts,matchTranscripts} from '../song-text-match.mjs';

test('punctuation and whitespace normalization for sung text',()=>{
 assert.equal(normalizeText('  Hello,   World! '),'hello world');
 assert.ok(scoreTranscripts('오늘 밤 너와 함께 노래할 거야','오늘밤 너와 함께 노래 할거야')>0.5);
});
test('matches own reference song without GPT',()=>{
 const refs=[{songId:'song-a',transcript:'별이 빛나는 밤에 너와 함께 춤을 추고 싶은 이 마음을'},
  {songId:'song-b',transcript:'다른 사람의 이야기를 들으며 아침 햇살을 바라봐요'}];
 assert.equal(matchTranscripts('별이 빛나는 밤에 너와 함께 춤을 추고 싶은 마음',refs).candidate,'song-a');
});
test('does not invent a match from unrelated or too short lyrics',()=>{
 const refs=[{songId:'song-a',transcript:'별이 빛나는 밤에 너와 함께 춤을 추고 싶은 이 마음을'}];
 assert.equal(matchTranscripts('완전히 다른 단어들이 계속 나오는 녹음의 이야기',refs).candidate,null);
 assert.equal(matchTranscripts('짧다',refs).candidate,null);
});
test('ambiguous near-tie remains unidentified',()=>{
 const a='여름 바다에 그대와 함께 걸어가며 사랑을 노래했어';
 const r=matchTranscripts(a,[{songId:'a',transcript:a},{songId:'b',transcript:a}]);
 assert.equal(r.candidate,null);
});
test('a song with both original lyrics and a Korean translation is matched once, through either text',()=>{
 const refs=[{songId:'moment',transcript:'This is the moment this is the day when I send all my doubts away',source:'lyrics'},
  {songId:'moment',transcript:'지금 이 순간 지금 여기 간절히 바라고 원했던 이 순간',source:'translation'},
  {songId:'other',transcript:'다른 사람의 이야기를 들으며 아침 햇살을 바라봐요',source:'lyrics'}];
 const r=matchTranscripts('지금 이 순간 지금 여기 간절히 바라고 원했던',refs);
 assert.equal(r.candidate,'moment'); // the Korean-sung take matches the translation, not "near-tie with itself"
 assert.deepEqual(r.matches.map(m=>m.songId),['moment','other']); // listed once
});
