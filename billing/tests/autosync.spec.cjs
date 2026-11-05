// Automatic cloud sync of the billing ledger: one-sided changes copy by themselves, conflicts wait for the user.
const {test,expect}=require('@playwright/test'),C=require('../core.js');
const USER='11111111-1111-4111-8111-111111111111',AUTH='sb-chxnbtiyuyhiywzeshis-auth-token';
const remotePass=(name,rev=1)=>{let s=C.reduce(C.empty('user:'+USER),{type:'pass.save',payload:{name,totalUnits:1000,amount:300000}});return s};
async function mockCloud(page,initial=null){
 const cloud={row:initial,writes:0,reads:0};
 await page.route('https://chxnbtiyuyhiywzeshis.supabase.co/rest/v1/**',async route=>{
  if(route.request().method()==='GET'){cloud.reads++;return route.fulfill({json:cloud.row?[cloud.row]:[]})}
  const body=route.request().postDataJSON();cloud.writes++;
  if((cloud.row?.revision||0)!==body.p_expected_revision)return route.fulfill({status:409,json:{code:'PT409'}});
  cloud.row={payload:body.p_payload,revision:(cloud.row?.revision||0)+1,last_request_id:body.p_request_id,updated_at:new Date().toISOString()};
  return route.fulfill({json:cloud.row});
 });return cloud;
}
async function open(page){
 await page.addInitScript(({key,id})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({access_token:'fixture-token',expires_at:4102444800,user:{id,email:'fixture@example.invalid'}}))},{key:AUTH,id:USER});
 await page.goto('/billing/');await expect(page.locator('#message')).toContainText(/불러왔어요|받아왔어요/);
}
async function addPass(page,name){
 await page.locator('[data-panel="passes"]').click();await page.locator('[data-open-form="pass"]').click();
 await page.locator('#pass-name').fill(name);await page.locator('#pass-totalUnits').fill('10');await page.locator('#pass-amount').fill('300000');
 await page.locator('#pass-form [type=submit]').click();await expect(page.locator('#message')).toContainText('저장했어요');
}
const ledger=page=>page.evaluate(()=>VzipBillingStore.status());
test('a save is sent to the cloud by itself and marked as in sync',async({page})=>{
 const cloud=await mockCloud(page);await open(page);
 await expect(page.locator('#sync-line')).toContainText('다른 기기와 자동으로 맞춰져요');
 expect(cloud.writes).toBe(0); // nothing to send for an empty ledger
 await addPass(page,'자동 저장 권');
 await expect.poll(()=>cloud.writes).toBe(1);
 expect(cloud.row.payload.passes[0].name).toBe('자동 저장 권');
 await expect.poll(async()=>{const s=await ledger(page);return s.meta.syncedLocalRevision===s.state.revision&&s.meta.remoteRevision===1}).toBe(true);
});
test('another device gets the cloud ledger by itself when it has no changes of its own',async({page})=>{
 const cloud=await mockCloud(page,{payload:remotePass('다른 기기 권'),revision:3,updated_at:new Date().toISOString()});
 await open(page);
 await expect.poll(async()=>(await ledger(page)).state.passes.map(p=>p.name)).toEqual(['다른 기기 권']);
 const s=await ledger(page);expect(s.meta.remoteRevision).toBe(3);expect(s.meta.syncedLocalRevision).toBe(s.state.revision);expect(cloud.writes).toBe(0);
 await page.locator('[data-panel="passes"]').click();await expect(page.locator('#pass-list')).toContainText('다른 기기 권');
});
test('when both sides changed nothing is overwritten until the user picks; merging keeps both and sends it',async({page})=>{
 const cloud=await mockCloud(page);await open(page);await addPass(page,'이 기기 권');await expect.poll(()=>cloud.writes).toBe(1);
 // Another device saves meanwhile, and this device saves too.
 const other=JSON.parse(JSON.stringify(cloud.row.payload));const extra=C.reduce(other,{type:'pass.save',payload:{name:'다른 기기 권',totalUnits:500,amount:150000}});
 cloud.row={payload:extra,revision:2,updated_at:new Date().toISOString()};
 await addPass(page,'또 이 기기 권');
 const box=page.locator('#sync-conflict');await expect(box).toContainText('다른 기기에서도 정산을 고쳤어요');
 expect(cloud.row.revision).toBe(2); // not overwritten
 await box.getByRole('button',{name:'두 기록 합치기'}).click();await page.locator('.bd-sheet [data-ok]').click();
 await expect(page.locator('#message')).toContainText('맞췄어요');
 await expect.poll(()=>cloud.row.revision).toBe(3);
 expect(cloud.row.payload.passes.map(p=>p.name).sort()).toEqual(['다른 기기 권','또 이 기기 권','이 기기 권']);
 expect((await ledger(page)).state.passes.map(p=>p.name).sort()).toEqual(['다른 기기 권','또 이 기기 권','이 기기 권']);
 expect(await page.evaluate(()=>VzipBillingStore.recoveryData().then(r=>r.passes.length))).toBe(2); // the pre-merge ledger is restorable
});
test('the cloud copy can be taken instead after a conflict, and auto sync can be turned off',async({page})=>{
 const cloud=await mockCloud(page);await open(page);await addPass(page,'이 기기 권');await expect.poll(()=>cloud.writes).toBe(1);
 cloud.row={payload:remotePass('클라우드 권'),revision:5,updated_at:new Date().toISOString()};
 await addPass(page,'충돌 권');
 const box=page.locator('#sync-conflict');await expect(box).toBeVisible();
 await box.getByRole('button',{name:'클라우드 기록 쓰기'}).click();await page.locator('.bd-sheet [data-ok]').click();
 await expect.poll(async()=>(await ledger(page)).state.passes.map(p=>p.name)).toEqual(['클라우드 권']);
 // Off: saves stay on this device.
 await page.locator('[data-panel=transfer]').click();await page.locator('#auto-sync').uncheck();
 await expect(page.locator('#sync-line')).toContainText('자동 동기화 꺼짐');
 const writes=cloud.writes;await addPass(page,'꺼진 뒤 권');await page.waitForTimeout(2500);expect(cloud.writes).toBe(writes);
});
