const {test,expect}=require('@playwright/test');const path=require('node:path');
test('weekly draft stays separate from goals until explicit save',async({page})=>{
 await page.goto('/practice-room/lessons.js');await page.setContent('<main></main>');
 await page.evaluate(()=>{window.VZ={db:{practicePlans:[],dailyGoals:[]},esc:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),today:()=> '2026-11-11',uid:()=> 'new-goal',media:{list:async()=>[],cached:()=>[]},timeEntries:()=>[],change:fn=>{fn(window.VZ.db);return true},route:(_id,config)=>window.reviewRoute=config};window.VzipStudentHomeModel={build:()=>({week:{start:'2026-11-09'}})};window.vzipCloudCoach=async()=>({note:'기록한 특징: 연습 시간이 적었어요.\n다음 시도: 가사의 목적을 정리해요.'});});
 await page.addScriptTag({path:path.resolve('app/practice-review-model.js')});await page.addScriptTag({path:path.resolve('app/practice-review.js')});
 await page.evaluate(()=>{const main=document.querySelector('main');main.innerHTML=reviewRoute.render();return reviewRoute.mount(main,{query:new URLSearchParams()});});
 await page.getByRole('button',{name:'기록으로 AI 추천받기'}).click();await expect(page.locator('[name="action"]')).toHaveValue('가사의 목적을 정리해요.');expect(await page.evaluate(()=>VZ.db.dailyGoals.length)).toBe(0);
 await page.locator('[name="section"]').fill('후렴 첫 두 줄');await page.getByRole('button',{name:'오늘 목표에 담기',exact:true}).click();await expect(page.locator('[data-status]')).toContainText('오늘 목표에 담았어요');expect(await page.evaluate(()=>VZ.db.dailyGoals[0].recommendation.section)).toBe('후렴 첫 두 줄');
});

test('today recommendation considers homework and preserves it',async({page})=>{
 await page.goto('/practice-room/lessons.js');await page.setContent('<main></main>');
 await page.evaluate(()=>{window.VZ={db:{practicePlans:[],dailyGoals:[],assignments:[{id:"teacher",title:"선생님 원문 숙제",status:"active"}]},esc:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;'),today:()=> '2026-11-11',uid:()=> 'new-goal',media:{list:async()=>[],cached:()=>[]},timeEntries:()=>[],change:fn=>{fn(window.VZ.db);return true},route:(_id,config)=>window.reviewRoute=config};window.VzipStudentHomeModel={build:()=>({week:{start:'2026-11-09'}})};window.vzipCloudCoach=async()=>({note:'기록한 특징: 연습 시간이 적었어요.\n다음 시도: 가사의 목적을 정리해요.'});});
 await page.addScriptTag({path:path.resolve('app/practice-review-model.js')});await page.addScriptTag({path:path.resolve('app/practice-review.js')});
 await page.evaluate(()=>{const main=document.querySelector('main');main.innerHTML=reviewRoute.render();return reviewRoute.mount(main,{query:new URLSearchParams("mode=today")});});
 await page.getByRole('button',{name:'기록으로 AI 추천받기'}).click();await expect(page.locator('[name="action"]')).toHaveValue('가사의 목적을 정리해요.');expect(await page.evaluate(()=>VZ.db.dailyGoals.length)).toBe(0);
 await expect(page.locator('[data-homework-pick]')).toHaveCount(1);expect(await page.evaluate(()=>VZ.db.assignments[0].title)).toBe('선생님 원문 숙제');
 await page.locator('[name="section"]').fill('후렴 첫 두 줄');await page.getByRole('button',{name:'오늘 목표에 담기',exact:true}).click();await expect(page.locator('[data-status]')).toContainText('오늘 목표에 담았어요');expect(await page.evaluate(()=>VZ.db.dailyGoals[0].recommendation.section)).toBe('후렴 첫 두 줄');await page.locator('[data-homework-pick]').click();expect(await page.evaluate(()=>VZ.db.dailyGoals[1].sourceId)).toBe('teacher');
});
