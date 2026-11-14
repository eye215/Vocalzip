// 05-A 1단계: 레슨 피드백·준비 메모를 쓰는 중에는 이 기기에 자동으로 임시 저장돼요 (서버로 보내지 않음).
// Closing the sheet or reloading brings the unsaved text back with a notice; "저장된 내용으로 되돌리기" keeps the
// draft as a previous copy; saving clears it; another account never sees it.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const KEY = 'vocal-zip_mvp_v1';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const seed = {categories:[], assignments:[], practices:[], comparisonReports:[], songs:[{id:'s1', title:'This Is Me'}],
  lessons:[{id:'L1', date:'2026-11-10', startTime:'15:00', teacher:'김선생', songIds:['s1'], songId:'s1', status:'done', feedback:'저장된 피드백', memo:'', songFeedback:{}, recordings:[], prepMemo:'', created:1}]};

async function boot(page) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(seed)]);
}
const open = async page => {
  await page.goto('/#/lesson/L1');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.locator('[data-fb],[data-fb2]').first().click();
  return page.locator('#fb-form');
};
const lesson = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)).lessons[0], KEY);
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));

test('typed feedback survives a reload, can go back to the saved text (kept as a copy), and saving clears the draft', async ({page}) => {
  await boot(page);
  let form = await open(page);
  await expect(form.locator('[data-field-draft-restored]')).toHaveCount(0);
  await form.locator('[name=feedback]').fill('저장된 피드백\n후렴 호흡 길게');
  await form.locator('[name=song_s1]').fill('2절 고음 힘 빼기');
  await expect(form.locator('[data-field-draft-status]')).toContainText('이 기기에만 임시 저장됨');
  // The app is closed without saving.
  await page.reload();
  form = await open(page);
  await expect(form.locator('[data-field-draft-restored]')).toContainText('저장하지 않은 입력을 이어서 보여 드려요');
  await expect(form.locator('[name=feedback]')).toHaveValue('저장된 피드백\n후렴 호흡 길게');
  await expect(form.locator('[name=song_s1]')).toHaveValue('2절 고음 힘 빼기');
  expect((await lesson(page)).feedback).toBe('저장된 피드백'); // nothing saved behind the person's back
  if (process.env.VZ_SHOTS) await page.screenshot({path:process.env.VZ_SHOTS + '/field-draft.png'});

  // Back to the saved text: the draft is kept as the previous copy, not deleted.
  await form.locator('[data-field-draft-revert]').click();
  await expect(form.locator('[name=feedback]')).toHaveValue('저장된 피드백');
  await expect(form.locator('[data-field-draft-restored]')).toHaveCount(0);
  const prev = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('vzip_field_draft_v1:') && k.endsWith(':prev')).length);
  expect(prev).toBe(2);

  // Type again and save: the lesson changes and the draft is gone.
  await form.locator('[name=memo]').fill('다음엔 녹음해 가기');
  await page.locator('button[form=fb-form]').click();
  await expect.poll(async () => (await lesson(page)).memo).toBe('다음엔 녹음해 가기');
  const left = await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('vzip_field_draft_v1:') && !k.endsWith(':prev')).length);
  expect(left).toBe(0);
  form = await open(page);
  await expect(form.locator('[data-field-draft-restored]')).toHaveCount(0);
});

test('a draft whose saved text changed meanwhile says so; another account never sees it', async ({page}) => {
  await boot(page);
  let form = await open(page);
  await form.locator('[name=feedback]').fill('이 기기에서 쓰던 글');
  // Another device saved new feedback in the meantime.
  await page.evaluate(k => { const d = JSON.parse(localStorage.getItem(k)); d.lessons[0].feedback = '다른 기기에서 저장'; localStorage.setItem(k, JSON.stringify(d)); }, KEY);
  await page.reload();
  form = await open(page);
  await expect(form.locator('[data-field-draft-restored]')).toContainText('그사이 저장된 내용이 바뀌었어요');
  await expect(form.locator('[name=feedback]')).toHaveValue('이 기기에서 쓰던 글');
  // Same device, another account: the draft is not shown.
  await page.evaluate(() => { window.vzipCloudUserId = () => 'someone-else'; VZ.closeSheets?.(); });
  await page.locator('[data-fb],[data-fb2]').first().click();
  await expect(page.locator('#fb-form [data-field-draft-restored]')).toHaveCount(0);
  await expect(page.locator('#fb-form [name=feedback]')).toHaveValue('다른 기기에서 저장');
});

test('the lesson preparation memo is kept the same way', async ({page}) => {
  await boot(page);
  await page.goto('/#/lesson/L1');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.locator('[data-edit-lesson]').click();
  await page.locator('#lesson-form [name=prep]').fill('질문: 믹스보이스');
  await page.reload();
  await page.locator('[data-edit-lesson]').click();
  await expect(page.locator('#lesson-form [name=prep]')).toHaveValue('질문: 믹스보이스');
  await expect(page.locator('#lesson-form [data-field-draft-restored]')).toBeVisible();
});

test('a practice memo being written is kept the same way and cleared once the practice is saved', async ({page}) => {
  await boot(page);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(() => VZ.practiceSheet({songId:'s1'}));
  await page.locator('#practice-log [name=memo]').fill('후렴 고음 연결 좋아짐');
  await page.reload();
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(() => VZ.practiceSheet({songId:'s1'}));
  await expect(page.locator('#practice-log [name=memo]')).toHaveValue('후렴 고음 연결 좋아짐');
  await expect(page.locator('#practice-log [data-field-draft-restored]')).toBeVisible();
  await page.locator('button[form=practice-log]').click();
  await expect.poll(() => page.evaluate(k => JSON.parse(localStorage.getItem(k)).practices.map(p => p.memo), KEY)).toEqual(['후렴 고음 연결 좋아짐']);
  expect(await page.evaluate(() => Object.keys(localStorage).filter(k => k.startsWith('vzip_field_draft_v1:') && !k.endsWith(':prev')).length)).toBe(0);
});
