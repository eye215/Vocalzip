// 기록 탭 week strip / day line (app/record-week-model.js): pure, nothing written.
const test=require('node:test'),assert=require('node:assert/strict');
const W=require('../app/record-week-model.js');
test('weeks run Sunday–Saturday and are named after their Wednesday',()=>{
 assert.deepEqual(W.weekDays('2026-11-04'),['2026-11-01','2026-11-02','2026-11-03','2026-11-04','2026-11-05','2026-11-06','2026-11-07']);
 assert.equal(W.weekLabel('2026-11-04',2026),'11월 첫째 주');
 assert.equal(W.weekLabel('2026-11-27',2026),'11월 넷째 주');
 // Sep 27 – Oct 3: Wednesday is Sep 30 → September's fifth week; the next week is October's first.
 assert.equal(W.weekLabel('2026-10-02',2026),'9월 다섯째 주');
 assert.equal(W.weekLabel('2026-10-05',2026),'10월 첫째 주');
 assert.equal(W.weekLabel('2025-11-04',2026),'2025년 11월 첫째 주');
});
test('day title and moving by week or month',()=>{
 assert.equal(W.dayTitle('2026-11-04',2026),'11월 4일 수요일');
 assert.equal(W.dayTitle('2027-01-01',2026),'2027년 1월 1일 금요일');
 assert.equal(W.moveWeek('2026-11-04',1,'2026-11-27'),'2026-11-11');
 assert.equal(W.moveWeek('2026-11-18',1,'2026-11-27'),'2026-11-27'); // the week holding today lands on today
 assert.equal(W.moveWeek('2026-11-01',-1,'2026-11-27'),'2026-10-25');
 assert.deepEqual(W.moveMonth('2026-11',1,'2026-11-27'),{month:'2026-12',day:'2026-12-01'});
 assert.deepEqual(W.moveMonth('2026-12',-1,'2026-11-27'),{month:'2026-11',day:'2026-11-27'});
 assert.deepEqual(W.moveMonth('2026-01',-1,'2026-11-27'),{month:'2025-12',day:'2025-12-01'});
});
test('ring, lesson length, durations and the summary line',()=>{
 assert.equal(W.ring(15,30),.5);assert.equal(W.ring(45,30),1);assert.equal(W.ring(0,30),0);assert.equal(W.ring(5,null),1);
 assert.equal(W.lessonMinutes({startTime:'18:30',endTime:'19:30'}),60);
 assert.equal(W.lessonMinutes({startTime:'00:00',endTime:'01:00',importedFrom:'billing'}),0);
 assert.equal(W.lessonMinutes({startTime:'18:30'}),0);
 assert.equal(W.duration(.5),'30초');assert.equal(W.duration(22),'22분');assert.equal(W.duration(65),'1시간 5분');
 assert.equal(W.summary({voiceCheck:true,practices:3,practiceMinutes:22,recordings:1}),'보이스 체크 완료 · 연습 22분 · 녹음 1');
 assert.equal(W.summary({lessons:1,practices:2,practiceMinutes:40,recordings:2}),'레슨 1 · 연습 40분 · 녹음 2');
 assert.equal(W.summary({practices:2}),'연습 2개');
 assert.equal(W.summary({}),'');
});
