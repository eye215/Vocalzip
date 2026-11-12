const test=require('node:test'),assert=require('node:assert/strict');
const L=require('../app/lyrics-memo-model.js');

test('levels go from 전체 보기 to 모두 가리기 and unknown levels fall back to full',()=>{
 assert.deepEqual(L.LEVEL_IDS,['full','third','half','initial','hidden']);
 assert.equal(L.level('nope'),'full');assert.equal(L.levelInfo('initial').label,'첫 글자만');
});
test('tokenizer keeps the exact line, splits punctuation and keeps apostrophes/hyphens inside words',()=>{
 const line='(Oh) I don\'t know—사랑해! heart-break  …';
 const tokens=L.tokenizeLine(line);
 assert.equal(tokens.map(t=>t.text).join(''),line);
 assert.deepEqual(tokens.filter(t=>t.type==='word').map(t=>t.text),['Oh','I','don\'t','know','사랑해','heart-break']);
 assert.deepEqual(tokens.filter(t=>t.type==='punct').map(t=>t.text),['(',')','—','!','…']);
});
test('Korean: partial levels hide every 3rd / 2nd word; 첫 글자만 keeps the first syllable',()=>{
 const t='지금 이 순간 마법처럼 날 묶어왔던';
 assert.equal(L.maskText(t,'full'),t);
 assert.equal(L.maskText(t,'third'),'지금 이 ○○ 마법처럼 날 ○○○○');
 assert.equal(L.maskText(t,'half'),'지금 ○ 순간 ○○○○ 날 ○○○○');
 assert.equal(L.maskText(t,'initial'),'지○ 이 순○ 마○○○ 날 묶○○○');
 assert.equal(L.maskText(t,'hidden'),'○○ ○ ○○ ○○○○ ○ ○○○○');
});
test('English: first letter only, punctuation stays visible until 모두 가리기',()=>{
 const t='This is the moment, this is the day!';
 assert.equal(L.maskText(t,'initial'),'T___ i_ t__ m_____, t___ i_ t__ d__!');
 assert.equal(L.maskText(t,'third'),'This is ___ moment, this __ the day!');
 assert.equal(L.maskText(t,'half'),'This __ the ______, this __ the ___!');
 assert.equal(L.maskText(t,'hidden'),'____ __ ___ _______ ____ __ ___ ____');
});
test('mixed Korean/English lines, empty lines and word counting across lines are deterministic',()=>{
 const t='Oh 사랑해 baby\n\n\n날 떠나지 마, don\'t go';
 const a=L.maskText(t,'half'),b=L.maskText(t,'half');
 assert.equal(a,b);
 assert.equal(a,'Oh ○○○ baby\n\n\n○ 떠나지 ○, don\'t __');
 assert.equal(L.maskText(t,'initial'),'O_ 사○○ b___\n\n\n날 떠○○ 마, d____ g_');
 const lines=L.build(t,'half');
 assert.deepEqual(lines.map(l=>[l.index,l.number,l.empty,l.words]),[[0,1,false,3],[1,0,true,0],[2,0,true,0],[3,2,false,5]]);
 assert.deepEqual(L.practiceLines(t),[0,3]);
 assert.equal(L.maskText('','hidden'),'');assert.equal(L.maskText(null,'third'),'');
 assert.equal(L.maskText('  \n…!','half'),'  \n…!');
});
test('the 다른 단어 offset moves the gaps without touching the text; CRLF lines split cleanly',()=>{
 const t='one two three four five six';
 assert.equal(L.maskText(t,'third',{offset:0}),'one two _____ four five ___');
 assert.equal(L.maskText(t,'third',{offset:1}),'one ___ three four ____ six');
 assert.equal(L.maskText(t,'third',{offset:2}),'___ two three ____ five six');
 assert.equal(L.maskText('a b\r\nc d','half'),'a _\nc _');
 // Every word token keeps its original text, so revealing shows exactly the stored lyric.
 const built=L.build('사랑해, 정말!','initial');
 assert.equal(built[0].tokens.map(x=>x.text).join(''),'사랑해, 정말!');
 assert.deepEqual(built[0].tokens.filter(x=>x.type==='word').map(x=>[x.shown,x.rest,x.wide,x.narrow]),[['사','랑해',2,0],['정','말',1,0]]);
});
test('combining marks stay with their first letter',()=>{
 const t='Café été';
 assert.equal(L.maskText(t,'initial'),'C____ é___');
});
test('progress marks: hard/known per source, pruned to real lines, never touching lyrics',()=>{
 const song={id:'s',lyrics:'첫 줄\n\n셋째 줄',translation:'one\ntwo'};
 let memo=L.normalize({level:'initial',hard:[0,1,7,'x'],known:[2,0],translationHard:[1]},song);
 assert.deepEqual([memo.level,memo.source,memo.hard,memo.known,memo.translationHard,memo.translationKnown],['initial','lyrics',[0],[2],[1],[]]);
 memo=L.setMark(memo,'lyrics',2,'hard');assert.deepEqual([memo.hard,memo.known],[[0,2],[]]);
 memo=L.setMark(memo,'translation',0,'known');assert.deepEqual(L.marks(memo,'translation'),{hard:[1],known:[0]});
 memo=L.setMark(memo,'lyrics',0,'');assert.deepEqual(memo.hard,[2]);
 assert.equal(L.markOf(memo,'lyrics',2),'hard');assert.equal(L.markOf(memo,'translation',0),'known');
 assert.equal(song.lyrics,'첫 줄\n\n셋째 줄');
 assert.deepEqual(L.normalize(null),{level:'full',source:'lyrics',updatedAt:0,hard:[],known:[],translationHard:[],translationKnown:[]});
});
