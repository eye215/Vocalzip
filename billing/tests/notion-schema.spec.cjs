const {test,expect}=require('@playwright/test');
require('../../tests/legacy-session-mode.cjs')(test);
test('Notion CSV preserves explicit zero/double deductions and notes through save/reload',async({page})=>{
 await page.goto('/billing/');await expect(page.locator('#message')).toContainText('불러왔어요');
 await page.evaluate(async()=>{const s=await VzipBillingStore.load();await VzipBillingStore.save({type:'pass.save',payload:{name:'가져오기 검증용',totalUnits:1000,amount:500000}},s.revision)});
 await page.locator('#reload').click();await expect(page.locator('#message')).toContainText('다시 불러왔어요');await page.locator('[data-panel=imports]').click();await page.locator('#import-kind').selectOption('deduction');
 const csv='수강생,레슨날짜,상태,레슨횟수 차감,비고,결제\n테스트 학생,2026-10-01,완료,0,무료 기록,결제 A\n테스트 학생,2026-10-01,완료,2,연속 기록,"결제 A, 결제 B"\n테스트 학생,2026-10-02,완료,,확인 필요,결제 B';
 await page.locator('#import-file').setInputFiles({name:'notion-example.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
 await expect(page.locator('#preview-import')).toBeEnabled();await page.locator('#preview-import').click();await expect(page.locator('#import-summary')).toContainText('선택 2행 · 오류 1행');
 await expect(page.getByLabel('2행 차감 횟수',{exact:true})).toHaveValue('0');await expect(page.getByLabel('3행 차감 횟수',{exact:true})).toHaveValue('2');
 await page.locator('#confirm-attendance').check();await page.locator('#commit-import').click();await expect(page.locator('#message')).toContainText('일괄 등록 완료');
 await page.reload();await expect(page.locator('#message')).toContainText('불러왔어요');
 const result=await page.evaluate(async()=>{const state=await VzipBillingStore.load();return {deductions:state.deductions,total:VzipBilling.totals(state).total}});
 expect(result.deductions.map(r=>r.units)).toEqual([0,200]);expect(result.deductions.map(r=>r.memo)).toEqual(['무료 기록','연속 기록']);expect(result.total.usedUnits).toBe(200);
});

test('Corrected deductions in a fresh CSV export start unselected when matching an existing lesson',async({page})=>{
 await page.goto('/billing/');await expect(page.locator('#message')).toContainText('불러왔어요');
 await page.evaluate(async()=>{let s=await VzipBillingStore.load();s=await VzipBillingStore.save({type:'pass.save',payload:{name:'검증용',totalUnits:1000,amount:500000}},s.revision);await VzipBillingStore.save({type:'deduction.save',payload:{passId:s.passes[0].id,date:'2026-10-01',status:'completed',units:100,student:'테스트 학생',memo:'기존 수강'}},s.revision)});
 await page.locator('#reload').click();await expect(page.locator('#message')).toContainText('다시 불러왔어요');await page.locator('[data-panel=imports]').click();await page.locator('#import-kind').selectOption('deduction');
 await page.locator('#import-file').setInputFiles({name:'new-export.csv',mimeType:'text/csv',buffer:Buffer.from('수강생,레슨날짜,상태,레슨횟수 차감,비고\n테스트 학생,2026-10-01,완료,2,기존 수강')});
 await expect(page.locator('#preview-import')).toBeEnabled();await page.locator('#preview-import').click();await expect(page.locator('#import-summary')).toContainText('선택 0행');await expect(page.locator('#preview-rows')).toContainText('차감값이 다른 기존 수강 후보');
 await expect(page.locator('#commit-import')).toBeDisabled();expect(await page.evaluate(async()=>{const s=await VzipBillingStore.load();return s.deductions.map(r=>r.units)})).toEqual([100]);
});
