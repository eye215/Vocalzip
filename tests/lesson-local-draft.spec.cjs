const {test,expect}=require('@playwright/test');
const {setup,feedback,schedule,close,drafts}=require('./helpers/lesson-local-draft.cjs');
test.afterEach(async({page})=>expect(page.__draftErrors||[]).toEqual([]));

test('leaving feedback preserves separate drafts and offers explicit restoration',async({page})=>{
 await setup(page);await feedback(page);
 await page.locator('[name=feedback]').fill('초안 피드백');await page.locator('[name=memo]').fill('초안 메모');
 await close(page);await feedback(page);
 await expect(page.locator('[data-lesson-draft=feedback]')).toContainText('저장 안 된 초안이 있어요 ·');
 await expect(page.locator('[name=feedback]')).toHaveValue('확정 피드백');
 await expect(page.locator('[name=memo]')).toHaveValue('확정 메모');
 await page.locator('[data-lesson-draft=feedback] button').click();
 await expect(page.locator('[name=feedback]')).toHaveValue('초안 피드백');
 await expect(page.locator('[name=memo]')).toHaveValue('확정 메모');
 await page.locator('[data-lesson-draft=memo] button').click();
 await expect(page.locator('[name=memo]')).toHaveValue('초안 메모');
 await expect(page.locator('[name=song_song-test]')).toHaveValue('곡별 확정 피드백');
 expect((await drafts(page)).filter(r=>r.text==='초안 피드백'||r.text==='초안 메모')).toHaveLength(4);
 expect(await page.evaluate(()=>VZ.db.lessons[0].feedback)).toBe('확정 피드백');
});

test('prepMemo survives an immediate reload without being confused with other fields',async({page})=>{
 await setup(page);await schedule(page);
 await page.locator('[name=prep]').fill('새 준비 초안');await page.reload();await schedule(page);
 await expect(page.locator('[name=prep]')).toHaveValue('확정 준비');
 await page.locator('[data-lesson-draft=prepMemo] button').click();
 await expect(page.locator('[name=prep]')).toHaveValue('새 준비 초안');
 expect((await drafts(page)).every(r=>r.field==='prepMemo')).toBe(true);
});
