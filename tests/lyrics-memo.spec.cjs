// 가사 외우기 모드: levels, tap-to-reveal, line-by-line practice, synced progress, lyrics never changed, 320px layout.
const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const KEY='vocal-zip_mvp_v1';
const LYRICS='지금 이 순간 마법처럼\nThis is the moment, this is the day\n\n날 묶어왔던 사슬을 벗어던진다';
const TRANSLATION='바로 지금 이 순간\n모든 것이 시작되는 날';
const initial=()=>({categories:[],songs:[{id:'song1',title:'지금 이 순간',show:'지킬 앤 하이드',lyrics:LYRICS,translation:TRANSLATION,lyricNotes:'호흡 메모'},{id:'song2',title:'빈 곡',show:''}],lessons:[],practices:[],assignments:[],comparisonReports:[]});
const sdk="window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'memo-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'test-token'}}})},from:table=>{const c={};let method='select';for(const k of ['select','eq','is','order','range','limit','in','upsert','update','delete','maybeSingle'])c[k]=()=>c;for(const k of ['upsert','update'])c[k]=v=>{method=k;return c};c.then=r=>r({data:['update','upsert'].includes(method)?[{user_id:'memo-user'}]:[],error:null});return c},storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/file.wav'}})})}})};";
async function boot(page,{seed=initial()}={}){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page._memoErrors=errors;
 await page.route('**/supabase.min.js',r=>r.fulfill({contentType:'application/javascript',body:sdk}));
 await page.route('**/r2-config.js*',r=>r.fulfill({contentType:'application/javascript',body:"window.VZIP_R2_ENDPOINT='';"}));
 await page.route('**/tus.min.js',r=>r.fulfill({contentType:'application/javascript',body:'window.tus={}'}));await page.route('**/*.supabase.co/**',r=>r.abort());
 await page.addInitScript(([key,data])=>{if(!sessionStorage.getItem('memoSeed')){localStorage.setItem(key,JSON.stringify(data));sessionStorage.setItem('memoSeed','1')}},[KEY,seed]);
 await page.goto('/#/songs');await expect(page.locator('#vzip-auth-screen')).toBeHidden();
}
const db=page=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
const panel=page=>page.locator('[data-lyrics-memo]');
async function openMemo(page,id='song1'){
 await page.goto('/#/song/'+id);await page.locator('[data-tab=lyrics]').click();
 await page.locator('[data-lm-open]').click();await expect(panel(page)).toBeVisible();
}
const lineText=(page,i)=>panel(page).locator('[data-lm-row="'+i+'"] .vz-lm-text');
test.afterEach(async({page})=>expect(page._memoErrors||[]).toEqual([]));

test('levels hide words progressively, taps reveal temporarily, and the lyric text is never changed',async({page})=>{
 await boot(page);await page.goto('/#/song/song1');await page.locator('[data-tab=lyrics]').click();
 await expect(page.locator('.vz-lyric-list > :first-child')).toHaveAttribute('data-lm-open','');
 await expect(page.locator('[data-lm-open]')).toContainText('전체 보기');
 await page.locator('[data-lm-open]').click();
 await expect(lineText(page,0)).toHaveText('지금 이 순간 마법처럼');
 await expect(lineText(page,1)).toHaveText('This is the moment, this is the day');
 await expect(panel(page).locator('.vz-lm-gap')).toHaveCount(1);

 await panel(page).getByRole('button',{name:'단어 일부 가리기'}).click();
 await expect(lineText(page,0)).toHaveText('지금 이 마법처럼');
 await expect(lineText(page,0).locator('[data-lm-word]')).toHaveCount(1);
 await panel(page).getByRole('button',{name:'단어 절반 가리기'}).click();
 await expect(lineText(page,0).locator('[data-lm-word]')).toHaveCount(2);
 await expect(lineText(page,0)).not.toContainText('마법처럼');

 await panel(page).getByRole('button',{name:'첫 글자만'}).click();
 await expect(lineText(page,0)).toHaveText('지 이 순 마');
 await expect(lineText(page,1)).toHaveText('T i t m, t i t d');
 // Tap one word: it shows the stored word; tap again hides it.
 await expect(lineText(page,0).locator('[data-lm-word]')).toHaveCount(3); // 이 is a one-syllable word: nothing to hide
 const word=lineText(page,0).locator('[data-lm-word]').nth(2);
 await word.click();await expect(lineText(page,0).locator('.vz-lm-word.is-open')).toHaveText('마법처럼');
 await lineText(page,0).locator('.vz-lm-word.is-open').click();await expect(lineText(page,0)).toHaveText('지 이 순 마');
 // Tap the line number: the whole line shows, then hides again by itself.
 await panel(page).getByRole('button',{name:'2번째 줄 보기'}).click();
 await expect(lineText(page,1)).toHaveText('This is the moment, this is the day');
 await expect(lineText(page,1)).toHaveText('T i t m, t i t d',{timeout:7000});

 await panel(page).getByRole('button',{name:'모두 가리기'}).click();
 await expect(panel(page).locator('.vz-lm-bar')).toHaveCount(3);
 await expect(panel(page).locator('[data-lm-lines]')).not.toContainText('순간');
 await panel(page).locator('.vz-lm-bar').first().click();
 await expect(lineText(page,0)).toHaveText('지금 이 순간 마법처럼');

 // The translation is practised the same way.
 await panel(page).locator('[data-lm-source=translation]').click();
 await expect(panel(page).locator('.vz-lm-bar')).toHaveCount(2);
 await panel(page).getByRole('button',{name:'첫 글자만'}).click();
 await expect(lineText(page,0)).toHaveText('바 지 이 순');

 const saved=(await db(page)).songs[0];
 expect([saved.lyrics,saved.translation,saved.lyricNotes]).toEqual([LYRICS,TRANSLATION,'호흡 메모']);
 expect(saved.lyricsMemo).toMatchObject({level:'initial',source:'translation',hard:[],known:[]});
 expect(saved.lyricsMemo.updatedAt).toBeGreaterThan(0);
 await panel(page).getByRole('button',{name:'외우기 닫기'}).click();
 await expect(page.locator('[data-lyric=lyrics]')).toBeVisible();
 await expect(page.locator('[data-lm-open]')).toContainText('첫 글자만');
});

test('line-by-line practice marks 외움/헷갈림, filters hard lines, and progress survives reload',async({page})=>{
 await boot(page);await openMemo(page);
 await panel(page).locator('[data-lm-view=line]').click();
 await expect(panel(page).locator('[data-lm-count]')).toHaveText('1 / 3줄');
 await expect(panel(page).locator('[data-lm-current]')).toContainText('지금 이 순간 마법처럼');
 await panel(page).getByRole('button',{name:'외움'}).click();
 await expect(panel(page).getByRole('button',{name:'외움'})).toHaveAttribute('aria-pressed','true');
 await panel(page).getByRole('button',{name:'다음 줄'}).click();
 await expect(panel(page).locator('[data-lm-count]')).toHaveText('2 / 3줄');
 await panel(page).getByRole('button',{name:'헷갈림'}).click();
 await panel(page).getByRole('button',{name:'다음 줄'}).click();
 // The blank line is skipped: line 3 of practice is raw line index 3.
 await expect(panel(page).locator('[data-lm-current]')).toHaveAttribute('data-lm-current','3');
 await panel(page).getByRole('button',{name:'헷갈림'}).click();
 await panel(page).getByRole('button',{name:'헷갈림'}).click(); // toggles off again
 await expect(panel(page).getByRole('button',{name:'헷갈림'})).toHaveAttribute('aria-pressed','false');
 await panel(page).getByRole('button',{name:'첫 글자만'}).click();
 await expect(panel(page).locator('[data-lm-current] .vz-lm-text')).toHaveText('날 묶 사 벗');
 await panel(page).locator('[data-lm-current] ~ .vz-lm-nav').getByRole('button',{name:'보기'}).click();
 await expect(panel(page).locator('[data-lm-current] .vz-lm-text')).toHaveText('날 묶어왔던 사슬을 벗어던진다');
 await expect(panel(page).getByRole('button',{name:'처음으로'})).toBeVisible();
 await panel(page).locator('[data-lm-hard-only]').click();
 await expect(panel(page).locator('[data-lm-count]')).toHaveText('1 / 1줄');
 await expect(panel(page).locator('[data-lm-current]')).toHaveAttribute('data-lm-current','1');
 await expect(panel(page).locator('[data-lm-progress]')).toHaveText('전체 3줄 · 외움 1 · 헷갈림 1');

 let saved=(await db(page)).songs[0];
 expect(saved.lyricsMemo).toMatchObject({level:'initial',source:'lyrics',hard:[1],known:[0],translationHard:[],translationKnown:[]});
 expect(saved.lyrics).toBe(LYRICS);expect(saved.translation).toBe(TRANSLATION);

 await page.reload();await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 await page.locator('[data-tab=lyrics]').click();
 await expect(page.locator('[data-lm-open]')).toContainText('첫 글자만 · 외움 1줄 · 헷갈림 1줄');
 await page.locator('[data-lm-open]').click();
 await expect(panel(page).getByRole('button',{name:'첫 글자만'})).toHaveAttribute('aria-pressed','true');
 await expect(panel(page).locator('[data-lm-row="1"]')).toHaveClass(/is-hard/);
 await expect(panel(page).locator('[data-lm-row="0"]')).toHaveClass(/is-known/);
 saved=(await db(page)).songs[0];expect(saved.lyrics).toBe(LYRICS);
});

test('a song without lyrics shows a disabled entry; editing lyrics enables it',async({page})=>{
 await boot(page);await page.goto('/#/song/song2');await page.locator('[data-tab=lyrics]').click();
 await expect(page.locator('[data-lm-open]')).toBeDisabled();
 await page.locator('[data-lyric=lyrics]').click();
 await page.getByRole('textbox',{name:'가사 원문'}).fill('Hello world');
 await page.getByRole('dialog',{name:'가사 원문'}).getByRole('button',{name:'저장'}).click();
 await expect(page.locator('[data-lm-open]')).toBeEnabled();
 await page.locator('[data-lm-open]').click();
 await expect(panel(page).locator('[data-lm-source]')).toHaveCount(0);
 await expect(panel(page)).toContainText('원문');
 expect((await db(page)).songs[1].lyricsMemo).toBeUndefined();
});

for(const width of [320,390]) test('외우기 panel fits '+width+'px with 44px targets and a stage option',async({page})=>{
 await page.setViewportSize({width,height:740});
 const seed=initial();seed.songs[0].lyrics+='\nSupercalifragilisticexpialidocious-extraordinarily-long-word, 그리고아주아주아주긴한국어단어를계속이어서적어도줄바꿈이되는지';
 await boot(page,{seed});await openMemo(page);
 for(const level of ['전체 보기','단어 절반 가리기','첫 글자만','모두 가리기']){
  await panel(page).getByRole('button',{name:level}).click();
  for(const view of ['all','line']){
   await panel(page).locator('[data-lm-view='+view+']').click();
   const r=await page.evaluate(()=>{
    const host=document.querySelector('[data-lyrics-memo]'),box=host.getBoundingClientRect();
    const small=[...host.querySelectorAll('button')].filter(b=>b.offsetParent).map(b=>b.getBoundingClientRect()).filter(b=>b.width<43.5||b.height<43.5).length;
    const outside=[...host.querySelectorAll('*')].filter(e=>e.getClientRects().length).some(e=>{const b=e.getBoundingClientRect();return b.right>box.right+0.5||b.left<box.left-0.5});
    return {page:document.documentElement.scrollWidth<=innerWidth,small,outside};
   });
   expect(r,level+' '+view).toEqual({page:true,small:0,outside:false});
  }
 }
 await panel(page).getByRole('button',{name:'어두운 무대 화면'}).click();
 await expect(panel(page)).toHaveClass(/is-stage/);
 expect(await panel(page).evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(21, 17, 31)');
});
