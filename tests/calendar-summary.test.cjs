const test=require('node:test'),assert=require('node:assert/strict');
const {summarize,ranked,duration}=require('../app/calendar-summary.js');
test('monthly summary deduplicates linked files and excludes training and lesson audio',()=>{
 const db={practices:[{id:'p',date:'2026-11-01',songId:'a',minutes:10,mediaIds:['linked']},{id:'t',date:'2026-11-01',practiceMode:'training',minutes:100,mediaIds:['train']},{id:'old',date:'2026-10-31',minutes:30,mediaIds:['old']}],lessons:[{recordings:[{id:'lesson'}]}]};
 const media=[{id:'linked',durationSeconds:600},{id:'train',durationSeconds:600},{id:'old',durationSeconds:600},{id:'lesson',durationSeconds:600},{id:'source',source:'lesson',durationSeconds:600},{id:'new',songId:'a',durationSeconds:30},{id:'new',songId:'a',durationSeconds:30},{id:'unknown',songId:'b',durationSeconds:NaN}];
 const before=JSON.stringify({db,media}),s=summarize(db,media,'2026-11',()=> '2026-11-02');
 assert.equal(s.minutes,10);assert.equal(s.count,3);assert.equal(s.unknown,2);assert.equal(s.rows.length,2);
 assert.equal(JSON.stringify({db,media}),before);
 assert.equal(summarize(db,[], '2026-12',()=> '').count,0);
});
test('rank metric switches, top five is stable, and sub-minute durations are visible',()=>{
 const summary={rows:[{id:'a',minutes:30,count:1},{id:'b',minutes:5,count:4}]};
 assert.equal(ranked(summary,'minutes')[0].id,'a');assert.equal(ranked(summary,'count')[0].id,'b');
 assert.equal(duration(.5),'30초');assert.equal(duration(90),'1시간 30분');
 const six={rows:[1,2,3,4,5,6].map(n=>({id:String(n),minutes:n,count:1}))};
 assert.deepEqual(ranked(six).map(row=>row.id),['6','5','4','3','2']);
});

test('calendar time uses actual minutes and keeps file counts without treating length as performed time',()=>{
 const db={practices:[{id:'p',date:'2026-11-09',minutes:30,manualMinutes:25,songId:'a'},
 {id:'pending',date:'2026-11-09',minutes:80,manualMinutes:80,practiceTimeSource:'unconfirmed',songId:'a'}]};
 const summary=summarize(db,[{id:'file',songId:'a',durationSeconds:36000},{id:'stage',occasion:'performance',durationSeconds:36000}],'2026-11',()=> '2026-11-09');
 assert.equal(summary.minutes,25);assert.equal(summary.count,3);assert.equal(summary.unknown,2);
});
