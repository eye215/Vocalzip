const test=require('node:test'),assert=require('node:assert/strict'),M=require('../app/practice-review-model.js');
test('weekly evidence uses actual time, excludes future and deleted records, distinguishes skips',()=>{
 const db={practices:[{id:'a',date:'2026-11-10',memo:'목이 아파요'},{id:'b',date:'2026-11-12'}],dailyGoals:[{date:'2026-11-10',title:'미완료',completed:false}],practicePlans:[{period:'ai-review',date:'2026-11-10',status:'skipped',proposal:{action:'구절 정리'}}]};
 const x=M.context(db,{today:'2026-11-11',start:'2026-11-09',entries:[{date:'2026-11-10',minutes:12},{date:'2026-11-12',minutes:100}]});assert.equal(x.actualMinutes,12);assert.equal(x.practice.length,1);assert.deepEqual(x.skipped,['구절 정리']);assert.equal(x.caution,true);
});
test('song comparison requires two same-song recordings and preserves written evidence',()=>{
 const db={songs:[{id:'s',title:'곡'}]};const x=M.context(db,{today:'2026-11-11',start:'2026-11-09',songId:'s',media:[{id:'1',songId:'s',recordedDate:'2026-11-09',review:'처음'},{id:'2',songId:'s',recordedDate:'2026-11-10',review:'최근'},{id:'3',songId:'other'}]});assert.deepEqual(x.pair.map(p=>p.review),['처음','최근']);assert.equal(x.song,'곡');
});
test('symptoms override model action and empty proposals reject',()=>{
 assert.equal(M.proposal({note:'다음 시도: 고음 반복'}, {caution:true,songId:'s'}).action,'소리 내는 연습을 쉬고 가사·회고 정리하기');assert.throws(()=>M.proposal({note:''},{caution:false}));
});
test('today combines active homework and upcoming performances, excluding deleted and completed items',()=>{
 const db={assignments:[{id:'a',title:'숙제',dueDate:'2026-11-12'},{id:'b',status:'done'},{id:'c',startDate:'2026-11-12'},{id:'d'}],deleted:{assignments:['d']},performances:[{title:'다가오는 공연',start:'2026-11-20'},{title:'취소',status:'cancelled',start:'2026-11-20'}]};
 const e=M.context(db,{today:'2026-11-11',start:'2026-11-09'});assert.equal(e.homework.length,1);assert.equal(e.performances.length,1);const items=M.todayItems(e,{action:'가사 정리',minutes:5});assert.equal(items.length,2);assert.equal(items[0].action,'숙제');assert.equal(items[1].action,'가사 정리');
});
test('today limits proposals to three and discomfort keeps only non-vocal AI proposal',()=>{
 const e={homework:[1,2,3,4].map(id=>({id,title:'숙제'+id})),caution:false};assert.equal(M.todayItems(e,{action:'추가 연습'}).length,3);assert.deepEqual(M.todayItems({...e,caution:true},{action:'소리 없는 회고'}).map(x=>x.action),['소리 없는 회고']);
});
