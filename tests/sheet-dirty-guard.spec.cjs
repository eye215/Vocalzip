// Closing a sheet with edited fields asks once (X, backdrop, Escape, back); save paths and untouched sheets do not ask.
const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const stub="window.__up=[];window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},\n storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},\n from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=(...a)=>{if(m==='upsert')window.__up.push(a[0]);return c};c.then=r=>r({data:[],error:null});return c}})};";
const KEY='vocal-zip_mvp_v1';
const seed=()=>({categories:[],songs:[{id:'s1',title:'지금 이 순간',lyrics:'원래 가사'},{id:'s2',title:'대성당들의 시대'}],
 lessons:[{id:'l1',date:'2026-11-02',startTime:'18:00',endTime:'19:00',status:'done',songIds:['s1'],songId:'s1',feedback:'원래 피드백',memo:'',recordings:[]}],
 assignments:[{id:'a1',title:'원래 숙제',status:'active',startDate:'2026-11-01',dueDate:'2026-11-30'}],practices:[],comparisonReports:[]});
async function boot(page,hash='#/lesson/l1'){
 await page.route('**/supabase.min.js',r=>r.fulfill({contentType:'application/javascript',body:stub}));
 await page.route('**/tus.min.js',r=>r.fulfill({contentType:'application/javascript',body:'window.tus={}'}));
 await page.route('**/*.supabase.co/**',r=>r.abort());
 await page.addInitScript(([k,s])=>{if(!sessionStorage.getItem('seed')){localStorage.setItem(k,JSON.stringify(s));sessionStorage.setItem('seed','1')}},[KEY,seed()]);
 await page.goto('/#/calendar');await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
 await page.goto('/'+hash);
}
const db=page=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
const ask=page=>page.getByRole('dialog',{name:'작성 중인 내용이 있어요',exact:true});
const shot=process.env.VZ_SHOT_DIR;

test('lesson feedback: X asks once, 계속 작성 keeps the text, 닫기 discards, saving never asks',async({page})=>{
 await boot(page);await page.locator('[data-fb]').click();
 const sheet=page.getByRole('dialog',{name:'레슨 피드백',exact:true}),field=sheet.locator('textarea[name=feedback]');
 // Untouched: closes at once.
 await sheet.getByRole('button',{name:'돌아가기'}).click();await expect(sheet).toHaveCount(0);await expect(ask(page)).toHaveCount(0);
 await page.locator('[data-fb]').click();await field.fill('새로 길게 적은 피드백');
 if(shot){await page.setViewportSize({width:375,height:812});await page.screenshot({path:shot+'/A-feedback-edited.png'});}
 await sheet.getByRole('button',{name:'돌아가기'}).click();
 await expect(ask(page)).toBeVisible();await expect(sheet).toBeVisible();
 if(shot)await page.screenshot({path:shot+'/A-feedback-ask.png'});
 await ask(page).getByRole('button',{name:'계속 작성',exact:true}).click();
 await expect(ask(page)).toHaveCount(0);await expect(field).toHaveValue('새로 길게 적은 피드백');
 // Backdrop and Escape ask too.
 await page.locator('.sheet-back.sheet-page').dispatchEvent('click');
 await expect(ask(page)).toBeVisible();await ask(page).getByRole('button',{name:'계속 작성',exact:true}).click();
 await field.focus();await page.keyboard.press('Escape');await expect(ask(page)).toBeVisible();
 await ask(page).getByRole('button',{name:'닫기',exact:true}).click();
 await expect(sheet).toHaveCount(0);expect((await db(page)).lessons[0].feedback).toBe('원래 피드백');
 // Typed and put back: nothing changed, no question.
 await page.locator('[data-fb]').click();await field.fill('잠깐');await field.fill('원래 피드백');
 await sheet.getByRole('button',{name:'돌아가기'}).click();await expect(sheet).toHaveCount(0);await expect(ask(page)).toHaveCount(0);
 // Save path.
 await page.locator('[data-fb]').click();await field.fill('저장할 피드백');
 await page.getByRole('button',{name:'피드백 저장'}).click();
 await expect(sheet).toHaveCount(0);await expect(ask(page)).toHaveCount(0);expect((await db(page)).lessons[0].feedback).toBe('저장할 피드백');
});

test('browser back with an edited homework sheet stays, asks once, then leaves on 닫기',async({page})=>{
 await boot(page,'#/homework');await page.locator('[data-task="a1"]').first().click();
 const sheet=page.getByRole('dialog',{name:'숙제',exact:true});await sheet.locator('textarea[name=title]').fill('고친 숙제 내용');
 await page.goBack();
 await expect(ask(page)).toBeVisible();await expect(sheet).toBeVisible();expect(await page.evaluate(()=>location.hash)).toBe('#/homework');
 await expect(page.getByRole('dialog',{name:'작성 중인 내용이 있어요'})).toHaveCount(1);
 await ask(page).getByRole('button',{name:'계속 작성',exact:true}).click();
 await expect(sheet.locator('textarea[name=title]')).toHaveValue('고친 숙제 내용');
 await page.goBack();await ask(page).getByRole('button',{name:'닫기',exact:true}).click();
 await expect(sheet).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>location.hash)).toBe('#/calendar');
 expect((await db(page)).assignments[0].title).toBe('원래 숙제');
 // The refused back did not rewrite history: forward returns to the homework list.
 await page.goForward();await expect.poll(()=>page.evaluate(()=>location.hash)).toBe('#/homework');
 // Untouched sheet: back just leaves.
 await page.locator('[data-task="a1"]').first().click();await expect(sheet).toBeVisible();
 await page.goBack();await expect(sheet).toHaveCount(0);await expect(ask(page)).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>location.hash)).toBe('#/calendar');
});

test('browsers without the Navigation API: back still stays and asks',async({page})=>{
 await page.addInitScript(()=>{try{Object.defineProperty(window,'navigation',{value:undefined,configurable:true})}catch{}});
 await boot(page,'#/homework');expect(await page.evaluate(()=>window.navigation)).toBeUndefined();
 await page.locator('[data-task="a1"]').first().click();
 const sheet=page.getByRole('dialog',{name:'숙제',exact:true});await sheet.locator('textarea[name=title]').fill('고친 숙제 내용');
 await page.evaluate(()=>{location.hash='#/lessons'});
 await expect(ask(page)).toBeVisible();await expect(sheet).toBeVisible();expect(await page.evaluate(()=>location.hash)).toBe('#/homework');
 await ask(page).getByRole('button',{name:'닫기',exact:true}).click();
 await expect(sheet).toHaveCount(0);await expect.poll(()=>page.evaluate(()=>location.hash)).toBe('#/lessons');
 await expect(page.locator('#top h1')).toHaveText('레슨');
});

test('lesson schedule: a status or song change counts as an edit; a stacked sheet closes on its own',async({page})=>{
 await boot(page);await page.locator('[data-edit-lesson]').click();
 const sheet=page.getByRole('dialog',{name:'레슨 일정 수정',exact:true});
 await sheet.locator('[data-st=cancelled]').click();
 await sheet.getByRole('button',{name:'돌아가기'}).click();await expect(ask(page)).toBeVisible();
 await ask(page).getByRole('button',{name:'닫기',exact:true}).click();await expect(sheet).toHaveCount(0);
 expect((await db(page)).lessons[0].status).toBe('done');
 // New-song sheet opened from the lesson sheet: closing the untouched top sheet does not ask and keeps the lesson sheet.
 await page.locator('[data-edit-lesson]').click();await sheet.locator('textarea[name=prep]').fill('준비 메모');
 await sheet.locator('[data-lesson-song]').selectOption('__new');
 const song=page.getByRole('dialog',{name:'곡 추가',exact:true});await expect(song).toBeVisible();
 await song.getByRole('button',{name:'돌아가기'}).click();await expect(song).toHaveCount(0);await expect(ask(page)).toHaveCount(0);
 await expect(sheet.locator('textarea[name=prep]')).toHaveValue('준비 메모');
 await page.getByRole('button',{name:'저장',exact:true}).click();await expect(sheet).toHaveCount(0);
 expect((await db(page)).lessons[0].prepMemo).toBe('준비 메모');
});

test('lyrics and song info are protected; a menu closes as before',async({page})=>{
 await boot(page,'#/song/s1');await page.locator('[data-tab=lyrics]').click();await page.locator('[data-lyric=lyrics]').click();
 const lyric=page.getByRole('dialog',{name:'가사 원문',exact:true}),text='가사 '.repeat(4000);
 await lyric.locator('textarea').fill(text);
 await lyric.getByRole('button',{name:'돌아가기'}).click();await expect(ask(page)).toBeVisible();
 await ask(page).getByRole('button',{name:'계속 작성',exact:true}).click();await expect(lyric.locator('textarea')).toHaveValue(text);
 await lyric.getByRole('button',{name:'저장',exact:true}).click();await expect(lyric).toHaveCount(0);
 expect((await db(page)).songs[0].lyrics).toBe(text.trim());
 // 곡 수정
 await page.evaluate(()=>VZ.songSheet(VZ.song('s1')));
 const song=page.getByRole('dialog',{name:'곡 수정',exact:true});await song.locator('input[name=title]').fill('바꾼 제목');
 await song.getByRole('button',{name:'돌아가기'}).click();await expect(ask(page)).toBeVisible();
 await ask(page).getByRole('button',{name:'닫기',exact:true}).click();await expect(song).toHaveCount(0);
 expect((await db(page)).songs[0].title).toBe('지금 이 순간');
 // A menu (no form) is not affected.
 await page.evaluate(()=>VZ.menu({title:'메뉴',body:'<input type="text" aria-label="메모">'}));
 const menu=page.getByRole('dialog',{name:'메뉴',exact:true});await menu.locator('input').fill('x');
 await page.keyboard.press('Escape');await expect(menu).toHaveCount(0);await expect(ask(page)).toHaveCount(0);
});
