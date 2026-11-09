const {test,expect}=require('@playwright/test');
require('../../tests/legacy-session-mode.cjs')(test);
const KEY='vocal-zip_mvp_v1';
async function setup(page){
 await page.addInitScript(()=>{
  if(!localStorage.getItem('settlement-fixture')){
   localStorage.setItem('settlement-fixture','1');
   localStorage.setItem('vocal-zip_mvp_v1',JSON.stringify({lessons:[],songs:[{id:'keep-song'}],practices:[{id:'keep-practice',minutes:12}]}));
   localStorage.setItem('vzip_billing_auto_deduct_v1',JSON.stringify({device:{on:false,since:Date.now(),grace:1}}));
  }
 });
 await page.goto('/billing/');await expect(page.locator('#message')).toContainText('불러왔어요');
 const fixture=await page.evaluate(async()=>{
  const S=VzipBillingStore;let state=await S.load();
  const save=async(type,payload)=>state=await S.save({type,payload},state.revision);
  const date=new Date().toISOString().slice(0,10);
  await save('pass.save',{name:'보존할 10회권',totalUnits:1000,amount:300000});
  const passId=state.passes[0].id;
  await save('payment.save',{passId,date,kind:'payment',amount:300000});
  await save('payment.save',{passId,date,kind:'refund',amount:10000});
  await save('deduction.save',{passId,date,status:'completed',units:200,memo:'가져온 수강'});
  const deductionId=state.deductions[0].id;
  await save('deduction.save',{passId,date,status:'completed',units:100,lessonId:'neighbour',memo:'같은 날짜 별도 레슨'});
  const data=JSON.parse(localStorage.getItem('vocal-zip_mvp_v1'));
  data.lessons=[{id:'imported',date,status:'cancelled',billingDeductionId:deductionId,feedback:'보존할 피드백'},
   {id:'neighbour',date,status:'done',feedback:'다른 수업'}];
  localStorage.setItem('vocal-zip_mvp_v1',JSON.stringify(data));
  return {deductionId,passId,date};
 });
 await page.reload();await expect(page.locator('#message')).toContainText('불러왔어요');
 return fixture;
}
const ledger=page=>page.evaluate(()=>VzipBillingStore.load());
const attendance=page=>page.locator('[data-panel="attendance"]').click();
test('Settlement safety restores an imported charge once and preserves payments and same-date lessons',async({page})=>{
 await setup(page);const before=await ledger(page),app=await page.evaluate(key=>localStorage.getItem(key),KEY);
 await attendance(page);await page.locator('#pending-lessons').getByRole('button',{name:'차감 취소(복구)'}).click();
 await page.locator('.bd-sheet [data-ok]').click();
 await expect(page.locator('#message')).toContainText('차감을 취소했어요');
 const after=await ledger(page);
 expect(after.payments).toEqual(before.payments);
 expect(after.deductions.filter(d=>!d.voidedAt).map(d=>d.lessonId)).toEqual(['neighbour']);
 expect(after.deductions.filter(d=>!d.voidedAt).reduce((n,d)=>n+d.units,0)).toBe(100);
 expect(after.history.filter(h=>h.action==='entity.void')).toHaveLength(1);
 expect(await page.evaluate(key=>localStorage.getItem(key),KEY)).toBe(app);
 await page.reload();await expect(page.locator('#message')).toContainText('불러왔어요');await attendance(page);
 await expect(page.locator('#pending-lessons').getByRole('button',{name:'차감 취소(복구)'})).toHaveCount(0);
 expect(await ledger(page)).toEqual(after);
});
test('Settlement safety retains every ledger value when the lesson changes during cancellation confirmation',async({page})=>{
 await setup(page);const before=await ledger(page);
 await attendance(page);await page.locator('#pending-lessons').getByRole('button',{name:'차감 취소(복구)'}).click();
 await expect(page.locator('.bd-sheet')).toBeVisible();
 await page.evaluate(key=>{const d=JSON.parse(localStorage.getItem(key));d.lessons[0].status='done';localStorage.setItem(key,JSON.stringify(d));},KEY);
 await page.locator('.bd-sheet [data-ok]').click();
 await expect(page.locator('#message')).toContainText('레슨이 변경되거나 삭제됐어요');
 expect(await ledger(page)).toEqual(before);
});
test('Settlement safety aborts a queued charge if its lesson was deleted before the transaction commits',async({page})=>{
 const fixture=await setup(page);
 const result=await page.evaluate(async({key,passId,date})=>{
  const S=VzipBillingStore,d=JSON.parse(localStorage.getItem(key));d.lessons.push({id:'queued',date,status:'done'});
  localStorage.setItem(key,JSON.stringify(d));
  const before=await S.load(),lesson=S.lessons().find(l=>l.lesson_id==='queued');
  const request=S.save(VzipBillingPending.deductionFor(lesson,passId),before.revision);
  d.lessons=d.lessons.filter(l=>l.id!=='queued');localStorage.setItem(key,JSON.stringify(d));
  let error='';try{await request}catch(e){error=e.message}
  return {error,before,after:await S.load()};
 },{key:KEY,...fixture});
 expect(result.error).toContain('레슨이 변경되거나 삭제됐어요');
 expect(result.after).toEqual(result.before);
});
async function explicitFrame(page,query){
 await page.route('**/__settlement-parent',r=>r.fulfill({contentType:'text/html; charset=utf-8',body:'<!doctype html><meta charset="utf-8"><title>Settlement fixture</title>'}));
 await page.goto('/__settlement-parent');
 await page.evaluate(query=>{
  window.__settlementReports=[];const frame=document.createElement('iframe');frame.id='billing-fixture';
  window.addEventListener('message',e=>{if(e.origin===location.origin&&e.source===frame.contentWindow&&e.data?.type==='vzip-billing-auto')window.__settlementReports.push(e.data)});
  frame.src='/billing/?auto=1'+query;document.body.append(frame);
 },query);
 await expect.poll(()=>page.evaluate(()=>window.__settlementReports.length),{timeout:20000}).toBe(1);
 const report=await page.evaluate(()=>window.__settlementReports[0]);
 const frame=page.frames().find(f=>f.url().includes('/billing/?auto=1'));
 return {report,state:await frame.evaluate(()=>VzipBillingStore.load())};
}
async function addUnrelatedAutoCandidate(page,date){
 await page.evaluate(({key,date})=>{
  const d=JSON.parse(localStorage.getItem(key)),yesterday=new Date(date+'T12:00:00Z');yesterday.setUTCDate(yesterday.getUTCDate()-1);
  d.lessons.push({id:'unrelated',date:yesterday.toISOString().slice(0,10),status:'done',updatedAt:Date.now()});
  d.lessons.push({id:'blocked',date,status:'cancelled'});
  localStorage.setItem(key,JSON.stringify(d));
  localStorage.setItem('vzip_billing_auto_deduct_v1',JSON.stringify({device:{on:true,since:Date.now()-60000,grace:1}}));
 },{key:KEY,date});
}
test('Settlement safety explicit cancellation and retry never auto-charge an unrelated completed lesson',async({page})=>{
 const f=await setup(page);await addUnrelatedAutoCandidate(page,f.date);const before=await ledger(page);
 const first=await explicitFrame(page,'&do=void&deduction='+encodeURIComponent(f.deductionId));
 expect(first.report).toMatchObject({deducted:0,action:{ok:true}});
 expect(first.state.deductions).toHaveLength(2);
 expect(first.state.deductions.find(d=>d.id===f.deductionId).voidedAt).toBeTruthy();
 expect(first.state.payments).toEqual(before.payments);
 const retry=await explicitFrame(page,'&do=void&deduction='+encodeURIComponent(f.deductionId));
 expect(retry.report).toMatchObject({deducted:0,action:{ok:true}});
 expect(retry.state).toEqual(first.state);
});
test('Settlement safety refused explicit charge cannot trigger unrelated automatic charges',async({page})=>{
 const f=await setup(page);await addUnrelatedAutoCandidate(page,f.date);const before=await ledger(page);
 const {report,state}=await explicitFrame(page,'&do=deduct&lesson=blocked');
 expect(report).toMatchObject({deducted:0,action:{ok:false}});
 expect(report.action.message).toContain('완료로 확인된 레슨만');
 expect(state).toEqual(before);
});

async function deleteImported(page){
 await attendance(page);
 await page.locator('#deduction-list tbody tr').filter({hasText:'가져온 수강'}).getByRole('button',{name:'삭제',exact:true}).click();
 return page.locator('.bd-sheet');
}
test('Reverse deletion starts unchecked, cancels only the selected charge and preserves lesson, media links and payments',async({page})=>{
 await setup(page);const before=await ledger(page),app=await page.evaluate(key=>localStorage.getItem(key),KEY);
 const sheet=await deleteImported(page);
 await expect(sheet.getByRole('checkbox')).not.toBeChecked();
 await expect(sheet).toContainText('2회 차감 취소');
 await expect(sheet).toContainText('잔여 7회 → 9회');
 await expect(sheet).toContainText('사용 금액 90,000원 → 30,000원');
 await sheet.locator('[data-ok]').click();
 await expect(page.locator('#message')).toContainText('영구 삭제했어요');
 const after=await ledger(page);
 expect(after.payments).toEqual(before.payments);
 expect(after.deductions.find(d=>d.lessonId==='neighbour')).toEqual(before.deductions.find(d=>d.lessonId==='neighbour'));
 expect(after.deductions.find(d=>d.id===before.deductions[0].id).deletionOperationId).toBeTruthy();
 expect(await page.evaluate(key=>localStorage.getItem(key),KEY)).toBe(app);
 await page.reload();await attendance(page);await page.locator('#show-deleted').check();
 await expect(page.locator('#deduction-list tbody tr').filter({hasText:'가져온 수강'}).getByRole('button',{name:'복구',exact:true})).toHaveCount(0);
});
test('Reverse deletion cancellation and Escape preserve both records and allow keyboard choice focus',async({page})=>{
 await setup(page);const before=await ledger(page),sheet=await deleteImported(page);
 await page.keyboard.press('Shift+Tab');await expect(sheet.getByRole('checkbox')).toBeFocused();
 await page.keyboard.press('Space');await expect(sheet.getByRole('checkbox')).toBeChecked();
 await page.keyboard.press('Escape');await expect(sheet).toHaveCount(0);expect(await ledger(page)).toEqual(before);
});
test('Reverse deletion hands off exact IDs without cancelling before final lesson confirmation',async({page})=>{
 const fixture=await setup(page),before=await ledger(page),sheet=await deleteImported(page);
 // The main app consumes the intent immediately; inspect its initial hash rather than racing replaceState.
 await page.addInitScript(()=>{window.__settlementNavigationHash=location.hash;});
 await sheet.getByRole('checkbox').check();await sheet.locator('[data-ok]').click();
 await expect(page).toHaveURL(/#\/lesson\/imported(?:\?|$)/);
 await expect.poll(()=>page.evaluate(()=>window.__settlementNavigationHash)).toBe('#/lesson/imported?settlementDelete='+fixture.deductionId+'&version=1');
 await page.goto('/billing/');await expect(page.locator('#message')).toContainText('불러왔어요');
 expect(await ledger(page)).toEqual(before);
});
test('Reverse deletion never chooses between conflicting lesson references on the same date',async({page})=>{
 const fixture=await setup(page);
 await page.evaluate(({key,deductionId})=>{
  const app=JSON.parse(localStorage.getItem(key));app.lessons[1].billingDeductionId=deductionId;localStorage.setItem(key,JSON.stringify(app));
 },{key:KEY,...fixture});
 const sheet=await deleteImported(page);
 await expect(sheet.getByRole('checkbox')).toHaveCount(0);await expect(sheet).toContainText('연결 레슨이 여러 개');
 await sheet.locator('[data-cancel]').click();
});
