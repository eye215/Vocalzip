const {test,expect}=require('@playwright/test'),C=require('../core.js');
require('../../tests/legacy-session-mode.cjs')(test);
const USER='11111111-1111-4111-8111-111111111111',AUTH='sb-chxnbtiyuyhiywzeshis-auth-token';
function fixture(owner='device'){
 const run=(state,type,payload)=>C.reduce(state,{type,payload});
 let s=run(C.empty(owner),'hourly-rate.save',{hourlyRate:50000});
 s=run(s,'pass.save',{name:'기존 레슨권',totalUnits:1000,amount:300000});const passId=s.passes[0].id;
 s=run(s,'payment.save',{passId,date:'2026-11-04',amount:200000});
 return run(s,'deduction.save',{passId,date:'2026-11-05',status:'completed',units:200});
}
async function open(page,login=false){
 if(login)await page.addInitScript(({key,id})=>localStorage.setItem(key,JSON.stringify({access_token:'hourly-fixture',expires_at:4102444800,user:{id}})),{key:AUTH,id:USER});
 await page.goto('/billing/');await expect(page.locator('#message')).toContainText('불러왔어요');await page.locator('[data-panel=transfer]').click();
}
async function confirm(page){await page.locator('#transfer-confirm').check();await page.locator('#transfer-commit').click()}
async function seed(page,data){await page.evaluate(async data=>{const current=await VzipBillingStore.load();await VzipBillingStore.replace(data,current.revision);window.dispatchEvent(new Event('billing:replaced'))},data)}
const ledger=page=>page.evaluate(()=>VzipBillingStore.load());
test('Hourly JSON restore previews actual hours and can recover the previous rate',async({page})=>{
 await open(page);await page.evaluate(async()=>{const s=await VzipBillingStore.load();await VzipBillingStore.save({type:'hourly-rate.save',payload:{hourlyRate:30000}},s.revision)});
 await page.locator('#restore-file').setInputFiles({name:'hourly.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture()))});await page.locator('#restore-preview').click();
 await expect(page.locator('#transfer-comparison')).toContainText('잔여 2시간');await expect(page.locator('#transfer-comparison')).toContainText('미납 0원');
 await confirm(page);await expect(page.locator('#transfer-status')).toContainText('교체했어요');expect((await ledger(page)).hourlyRate).toBe(50000);
 await page.locator('#recovery-preview').click();await confirm(page);await expect(page.locator('#transfer-status')).toContainText('교체했어요');expect((await ledger(page)).hourlyRate).toBe(30000);
});
test('Downloaded hourly JSON retains the price and settings audit on reload and restore',async({page})=>{
 await open(page);await seed(page,fixture());const waiting=page.waitForEvent('download');await page.locator('#export').click();const download=await waiting;
 const stream=await download.createReadStream(),chunks=[];for await(const chunk of stream)chunks.push(chunk);const bytes=Buffer.concat(chunks),data=JSON.parse(bytes.toString());
 expect(data.hourlyRate).toBe(50000);expect(data.history.some(row=>row.collection==='settings')).toBe(true);
 await page.reload();await page.locator('[data-panel=transfer]').click();await page.locator('#restore-file').setInputFiles({name:'roundtrip.json',mimeType:'application/json',buffer:bytes});await page.locator('#restore-preview').click();await confirm(page);
 await expect(page.locator('#transfer-status')).toContainText('교체했어요');expect((await ledger(page)).history).toEqual(data.history);
});
test('Hourly ledger uploads through the existing cloud RPC without schema rejection',async({page})=>{
 let written;
 await page.route('https://chxnbtiyuyhiywzeshis.supabase.co/rest/v1/**',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:[]});
  const body=route.request().postDataJSON();written=body.p_payload;return route.fulfill({json:{payload:written,revision:1,last_request_id:body.p_request_id}});
 });
 await open(page,true);await seed(page,fixture('user:'+USER));await page.locator('#cloud-preview-upload').click();await expect(page.locator('#transfer-comparison')).toContainText('잔여 2시간');
 await confirm(page);await expect(page.locator('#transfer-status')).toContainText('저장 확인 완료');expect(written.hourlyRate).toBe(50000);expect(written.history[0].collection).toBe('settings');
});
test('Hourly cloud download preserves the price and preview totals after refresh',async({page})=>{
 const data=fixture('user:'+USER);await page.route('https://chxnbtiyuyhiywzeshis.supabase.co/rest/v1/**',route=>route.fulfill({json:[{payload:data,revision:3}]}));
 await open(page,true);await page.locator('#cloud-preview-download').click();await expect(page.locator('#transfer-comparison')).toContainText('잔여 2시간');await confirm(page);await expect(page.locator('#transfer-status')).toContainText('교체했어요');
 await page.reload();await expect(page.locator('#message')).toContainText('불러왔어요');const state=await ledger(page);expect(state.hourlyRate).toBe(50000);expect(state.history).toEqual(data.history);
});
