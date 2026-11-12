const {test,expect}=require('@playwright/test');const path=require('node:path');
test('lesson candidate needs explicit confirmation and can link unchanged teacher homework',async({page})=>{
 await page.goto('/practice-room/lessons.js');await page.setContent('<main></main>');
 await page.evaluate(()=>{window.VZ={db:{lessons:[{id:'l',feedback:'후렴 두 줄 천천히'}],assignments:[{id:'teacher',title:'선생님 원문 숙제',status:'active',lessonId:'l'}],dailyGoals:[]},esc:s=>String(s).replace(/</g,'&lt;').replace(/"/g,'&quot;'),today:()=> '2026-11-11',uid:()=>crypto.randomUUID(),songSelect:()=>'<select name="song"><option value="">곡 없음</option></select>',change:fn=>{fn(window.VZ.db);return true},route:(_id,config)=>window.lessonRoute=config};window.vzipCloudCoach=async()=>({note:'다음 시도: 후렴 두 줄 천천히 연습'});});
 await page.addScriptTag({path:path.resolve('app/lesson-ai-model.js')});await page.addScriptTag({path:path.resolve('app/lesson-ai.js')});
 await page.evaluate(()=>{const main=document.querySelector('main');main.innerHTML=lessonRoute.render();lessonRoute.mount(main,{params:['l']});});
 await page.getByRole('button',{name:'AI 숙제 후보 받기'}).click();await expect(page.locator('textarea')).toHaveValue('후렴 두 줄 천천히 연습');expect(await page.evaluate(()=>VZ.db.dailyGoals.length)).toBe(0);
 await page.locator('[name=existing]').selectOption('teacher');await page.getByRole('button',{name:'확인하고 오늘 목표에 연결'}).click();expect(await page.evaluate(()=>VZ.db.assignments.length)).toBe(1);expect(await page.evaluate(()=>VZ.db.dailyGoals[0].title)).toBe('선생님 원문 숙제');
});
