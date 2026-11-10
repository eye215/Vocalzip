const {test,expect}=require('@playwright/test');
const room={id:'recommend-session-1234',task:'tone',title:'기준음 따라 부르기',date:'2026-11-11T01:00:00Z',songId:'',seconds:20,analysis:{status:'review',summary:'기초 비교 기록'},recommendation:'review',draft:{difficulty:'조금 도전적',comfort:'편안해',symptoms:[],memo:'',answers:[]},demo:false,audioIds:[],variant:'normal',aiNextTask:'melody',aiCoach:'들리는 특징: 끝 음이 흔들려요.\n다음 시도: 짧은 선율을 나누어 확인해요.'};
test('result and today share recommendation, and start does not save a goal',async({page})=>{
 await page.addInitScript(r=>localStorage.setItem('vocalzip-practice-room-v1',JSON.stringify({history:[r],goals:[],drafts:{}})),room);
 await page.goto('/practice-room/index.html?result='+room.id);
 await expect(page.locator('.recommendation')).toContainText('짧은 선율을 나누어 확인해요.');
 await expect(page.locator('.recommendation')).toContainText('약 8분');
 await page.locator('[data-nav="home"]').first().click();
 await expect(page.locator('.hero')).toContainText('짧은 선율 따라 부르기');
 await page.locator('[data-action="recommended"]').click();
 await expect(page.locator('#submit')).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vocalzip-practice-room-v1')).goals)).toEqual([]);
});
test('pain blocks vocal recommendation across result and home',async({page})=>{
 await page.addInitScript(r=>localStorage.setItem('vocalzip-practice-room-v1',JSON.stringify({history:[r],goals:[],drafts:{}})),{...room,draft:{...room.draft,memo:'목이 아파요'}});
 await page.goto('/practice-room/index.html?result='+room.id);
 await expect(page.locator('.recommendation')).toContainText('노래 연습을 멈추고');
 await page.locator('[data-nav="home"]').first().click();
 await expect(page.locator('.hero')).toContainText('가사의 상대와 목적 정하기');
});
