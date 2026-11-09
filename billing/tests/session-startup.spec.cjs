const {test,expect}=require('@playwright/test');
const USER='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
const AUTH='sb-chxnbtiyuyhiywzeshis-auth-token';
async function fixture(page){
 await page.route('**/__billing-fixture',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Billing fixture</title>'}));
 await page.goto('/__billing-fixture');await page.addScriptTag({url:'/billing/core.js'});
 await page.evaluate(async({USER,OTHER,AUTH})=>{
  localStorage.setItem(AUTH,JSON.stringify({access_token:'billing-fixture-token',expires_at:4102444800,user:{id:USER,email:'fixture@example.invalid'}}));
  localStorage.setItem('vzip_account_scope_owner_v1',USER);
  localStorage.setItem('vzip_account_v1:'+USER+':vzip_billing_autosync_v1',JSON.stringify({['user:'+USER]:false}));
  const r=indexedDB.open('vocalzip_billing_v1',2);
  const db=await new Promise((resolve,reject)=>{r.onupgradeneeded=()=>{for(const name of ['documents','sync','recovery'])if(!r.result.objectStoreNames.contains(name))r.result.createObjectStore(name,{keyPath:'owner'});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise((resolve,reject)=>{
   const tx=db.transaction('documents','readwrite');
   for(const [id,rate]of[[USER,50000],[OTHER,99000]])tx.objectStore('documents').put({...VzipBilling.empty('user:'+id),hourlyRate:rate});
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
  });db.close();
 },{USER,OTHER,AUTH});
 await page.addInitScript(()=>{
  window.__billingOpens=[];const open=indexedDB.open.bind(indexedDB);
  indexedDB.open=(...args)=>{window.__billingOpens.push(args[0]);return open(...args);};
 });
 await page.route('**/rest/v1/**',route=>route.fulfill({json:[]}));
}
const approved=()=>({user_id:USER,allowed:true,required:true,playback_token:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'});
async function ready(page){
 await expect(page.locator('#billing-session-gate')).toBeHidden();
 await expect(page.locator('#message')).toContainText('정산 데이터를 불러왔어요.');
 await expect(page.locator('#rate-current')).toHaveText('50,000원');
 expect(await page.evaluate(()=>({active:VzipBillingSession.active,inert:document.querySelector('main.billing').inert,owner:VzipBillingStore.account.id}))).toEqual({active:true,inert:false,owner:'user:'+USER});
}
test('billing waits for verified login before its initial ledger load and preserves both owners',async({page})=>{
 await fixture(page);let release,seen;
 const held=new Promise(r=>{release=r}),started=new Promise(r=>{seen=r});
 await page.route('**/rest/v1/rpc/vzip_session_context',async route=>{seen();await held;await route.fulfill({json:approved()});});
 try{
  await page.goto('/billing/');await started;
  await expect(page.locator('#billing-session-gate')).toBeVisible();
  expect(await page.evaluate(()=>document.querySelector('main.billing').inert)).toBe(true);
  expect(await page.evaluate(()=>window.__billingOpens)).toEqual([]);
  await expect(page.locator('#message')).not.toContainText('불러오기 실패');
 }finally{release();}
 await ready(page);
 const rows=await page.evaluate(async()=>{
  const current=await VzipBillingStore.load();
  const r=indexedDB.open('vocalzip_billing_v1',2),db=await new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  try{return {current,legacy:await new Promise((resolve,reject)=>{const q=db.transaction('documents').objectStore('documents').getAll();q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);})};}finally{db.close();}
 });
 expect(rows.current.owner).toBe('user:'+USER);expect(rows.current.hourlyRate).toBe(50000);
 expect(rows.legacy.map(x=>[x.owner,x.hourlyRate]).sort()).toEqual([['user:'+USER,50000],['user:'+OTHER,99000]].sort());
 await page.reload();await ready(page);
});
test('billing finishes its pending initial load after login verification is retried',async({page})=>{
 await fixture(page);let calls=0;
 await page.route('**/rest/v1/rpc/vzip_session_context',route=>++calls===1?route.fulfill({status:503,json:{message:'temporary verification outage'}}):route.fulfill({json:approved()}));
 await page.goto('/billing/');
 await expect(page.locator('#billing-session-gate [data-status]')).toContainText('이 로그인의 정산 접근이 종료됐거나 아직 등록되지 않았어요.');
 expect(await page.evaluate(()=>window.__billingOpens)).toEqual([]);
 await expect(page.locator('#message')).not.toContainText('불러오기 실패');
 await page.locator('#billing-session-gate button').click();await ready(page);
 expect(calls).toBe(2);
});
