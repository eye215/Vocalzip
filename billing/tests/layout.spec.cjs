// Phone layout of the billing screen: every tab reachable, hours left first, rate as a one-line card,
// and one action to deduct all completed app lessons.
const {test,expect}=require('@playwright/test');
require('../../tests/legacy-session-mode.cjs')(test);
const lessons=['2026-10-01','2026-10-04','2026-10-07'].map((date,i)=>({id:'L'+i,date,status:'done'}));
async function open(page){
 await page.addInitScript(d=>{if(!localStorage.getItem('vocal-zip_mvp_v1'))localStorage.setItem('vocal-zip_mvp_v1',JSON.stringify(d))},{lessons,practices:[],songs:[]});
 page.on('dialog',d=>d.accept());
 await page.goto('/billing/');await expect(page.locator('#message')).toContainText('불러왔어요');
}
const tab=(page,name)=>page.locator('[data-panel="'+name+'"]').click();
test('every tab is on screen without sideways scrolling, and backup lives in 백업·동기화',async({page})=>{
 await open(page);
 for(const b of await page.locator('nav [data-panel]').all())await expect(b).toBeInViewport();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await expect(page.locator('header #export')).toHaveCount(0);
 await tab(page,'transfer');await expect(page.locator('#transfer #export')).toBeVisible();
 await expect(page.locator('#transfer .notice')).toContainText('정산 기록은 어디에 저장되나요?');
});
test('dashboard leads with hours left; the hourly rate folds into one line once saved',async({page})=>{
 await open(page);
 await expect(page.locator('#rate-box')).toHaveAttribute('open','');
 await page.locator('#hourly-rate-form [name=hourlyRate]').fill('50000');await page.locator('#hourly-rate-form [type=submit]').click();
 await expect(page.locator('#message')).toContainText('시간당 단가를 저장했어요');
 await expect(page.locator('#rate-box')).not.toHaveAttribute('open','');
 await expect(page.locator('#rate-current')).toHaveText('50,000원');
 await expect(page.locator('#hourly-summary .metric').first()).toHaveClass(/hero/);
 await expect(page.locator('#hourly-summary .metric').first()).toContainText('남은 레슨');
});
test('all completed app lessons can be deducted at once (1 hour each) after confirming',async({page})=>{
 await open(page);
 await tab(page,'passes');await page.locator('[data-open-form="pass"]').click();await page.locator('#pass-name').fill('10회권');await page.locator('#pass-totalUnits').fill('10');await page.locator('#pass-amount').fill('500000');
 await page.locator('#pass-form [type=submit]').click();await expect(page.locator('#message')).toContainText('저장했어요');
 await tab(page,'attendance');
 const pending=page.locator('#pending-lessons');
 await pending.getByRole('button',{name:'완료 레슨 3건 모두 1시간 차감'}).click();
 const sheet=page.locator('.bd-sheet');await expect(sheet).toContainText('3시간이 차감돼요');await sheet.locator('[data-ok]').click();
 await expect(pending).toContainText('정산할 앱 레슨이 없어요',{timeout:15000});
 const state=await page.evaluate(()=>VzipBillingStore.load());
 expect(state.deductions.filter(d=>!d.voidedAt).map(d=>[d.lessonId,d.units]).sort()).toEqual([['L0',100],['L1',100],['L2',100]]);
});
test('lessons completed in the app after auto-deduction is on are deducted by their length; older ones wait',async({page})=>{
 const now=Date.now(),ymd=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),yesterday=ymd(new Date(now-864e5)),before=ymd(new Date(now-2*864e5));
 await page.addInitScript(([y,b,n])=>{if(localStorage.getItem('vocal-zip_mvp_v1'))return;
  localStorage.setItem('vzip_billing_auto_deduct_v1',JSON.stringify({device:{on:true,since:n-60000}}));
  localStorage.setItem('vocal-zip_mvp_v1',JSON.stringify({practices:[],songs:[],lessons:[
   {id:'new2h',date:y,status:'done',startTime:'19:00',endTime:'21:00',created:n},{id:'old',date:b,status:'done',created:n-864e5*30,updatedAt:n-864e5*30}]}))},[yesterday,before,now]);
 page.on('dialog',d=>d.accept());
 await page.goto('/billing/');await expect(page.locator('#message')).toContainText('불러왔어요');
 // No pass yet: nothing can be deducted.
 expect((await page.evaluate(()=>VzipBillingStore.load())).deductions).toHaveLength(0);
 await tab(page,'passes');await page.locator('[data-open-form="pass"]').click();await page.locator('#pass-name').fill('10회권');await page.locator('#pass-totalUnits').fill('10');await page.locator('#pass-amount').fill('500000');
 await page.locator('#pass-form [type=submit]').click();await expect(page.locator('#message')).toContainText('저장했어요');
 await page.reload();await expect(page.locator('#message')).toContainText('자동으로 차감했어요');
 const rows=(await page.evaluate(()=>VzipBillingStore.load())).deductions.map(d=>[d.lessonId,d.units,d.status]);
 expect(rows).toEqual([['new2h',200,'completed']]);
 await tab(page,'attendance');
 await expect(page.locator('#pending-lessons')).toContainText(new Date(now-2*864e5).getFullYear()+'/'); // the older lesson still waits
 await expect(page.locator('#auto-deduct')).toBeChecked();
});
