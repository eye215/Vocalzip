const {test,expect}=require('@playwright/test'),C=require('../core.js');
const USER='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222',AUTH='sb-chxnbtiyuyhiywzeshis-auth-token';
function fixture(owner='device',name='복원할 권'){return C.reduce(C.empty(owner),{type:'pass.save',payload:{name,totalUnits:500,amount:150000}})}
async function open(page,{login=false}={}){
 if(login)await page.addInitScript(({key,id})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({access_token:'fixture-token',expires_at:4102444800,user:{id,email:'fixture@example.invalid'}}))},{key:AUTH,id:USER});
 await page.goto('/billing/');await expect(page.locator('#message')).toContainText('불러왔어요');
 await page.locator('[data-panel=transfer]').click();
}
async function seed(page,name='원래 권'){
 await page.evaluate(async name=>{const s=await VzipBillingStore.load();await VzipBillingStore.save({type:'pass.save',payload:{name,totalUnits:1000,amount:300000}},s.revision);window.dispatchEvent(new Event('billing:replaced'))},name);
}
const ledger=page=>page.evaluate(()=>VzipBillingStore.load());
const snapshot=page=>page.evaluate(()=>VzipBillingStore.status());
async function filePreview(page,data){await page.locator('#restore-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(typeof data==='string'?data:JSON.stringify(data))});await page.locator('#restore-preview').click()}
async function confirm(page,owner=false){await page.locator('#transfer-confirm').check();if(owner)await page.locator('#transfer-owner').check();await page.locator('#transfer-commit').click()}
async function mockCloud(page,initial=null){
 const cloud={row:initial,writes:0,offline:false,loseResponse:false,conflict:false};
 await page.route('https://chxnbtiyuyhiywzeshis.supabase.co/rest/v1/**',async route=>{
  if(cloud.offline)return route.abort('internetdisconnected');
  if(route.request().method()==='GET')return route.fulfill({json:cloud.row?[cloud.row]:[]});
  const body=route.request().postDataJSON();cloud.writes++;
  expect(route.request().headers().authorization).toBe('Bearer fixture-token');
  if(cloud.conflict||(cloud.row?.revision||0)!==body.p_expected_revision)return route.fulfill({status:409,json:{code:'PT409'}});
  function reorder(value){if(Array.isArray(value))return value.map(reorder);if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,reorder(value[key])]));return value}
  cloud.row={payload:reorder(body.p_payload),revision:(cloud.row?.revision||0)+1,last_request_id:body.p_request_id,updated_at:new Date().toISOString()};
  if(cloud.loseResponse){cloud.loseResponse=false;return route.abort('failed')}
  return route.fulfill({json:cloud.row});
 });return cloud;
}
test('version 1 local database upgrades without losing the ledger',async({page})=>{
 await page.goto('/billing/README.md');const original=fixture();
 await page.evaluate(async data=>{await new Promise((resolve,reject)=>{const req=indexedDB.open('vocalzip_billing_v1',1);req.onupgradeneeded=()=>req.result.createObjectStore('documents',{keyPath:'owner'});req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,tx=db.transaction('documents','readwrite');tx.objectStore('documents').put(data);tx.oncomplete=()=>{db.close();resolve()}}})},original);
 await open(page);expect(await ledger(page)).toEqual(original);expect((await snapshot(page)).meta.remoteRevision).toBe(0);
});
test('JSON restore keeps a complete recovery snapshot and supports undo after reload',async({page})=>{
 await open(page);await seed(page);const before=await ledger(page);await filePreview(page,fixture());await expect(page.locator('#transfer-status')).toContainText('검증 완료');
 await confirm(page);await expect(page.locator('#transfer-status')).toContainText('교체했어요');expect((await ledger(page)).passes[0].name).toBe('복원할 권');
 expect(await page.evaluate(()=>VzipBillingStore.recoveryData())).toEqual(before);
 await page.reload();await page.locator('[data-panel=transfer]').click();await page.locator('#recovery-preview').click();await confirm(page);await expect(page.locator('#transfer-status')).toContainText('교체했어요');
 expect((await ledger(page)).passes[0].name).toBe('원래 권');expect((await ledger(page)).revision).toBe(before.revision+2);
});
test('cross-account backup transfer requires an explicit owner acknowledgement',async({page})=>{
 await open(page,{login:true});await filePreview(page,fixture('device'));await page.locator('#transfer-confirm').check();await expect(page.locator('#transfer-commit')).toBeDisabled();
 await page.locator('#transfer-owner').check();await page.locator('#transfer-commit').click();await expect(page.locator('#transfer-status')).toContainText('교체했어요');expect((await ledger(page)).owner).toBe('user:'+USER);
});
test('corrupt backups fail before any replacement or recovery write',async({page})=>{
 await open(page);await seed(page);const before=await ledger(page),bad=fixture();bad.passes[0].amount='150000';
 await filePreview(page,bad);await expect(page.locator('#transfer-status')).toContainText('백업 오류');expect(await ledger(page)).toEqual(before);expect((await snapshot(page)).recovery).toBeNull();
});
test('quota failure rolls back both replacement and recovery',async({page})=>{
 await open(page);await seed(page);const before=await ledger(page);await filePreview(page,fixture());
 await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='recovery'){IDBObjectStore.prototype.put=put;throw new DOMException('복원 저장 공간 부족','QuotaExceededError')}return put.apply(this,args)}});
 await confirm(page);await expect(page.locator('#transfer-status')).toContainText('저장 공간 부족');expect(await ledger(page)).toEqual(before);expect((await snapshot(page)).recovery).toBeNull();
});
test('a local write after restore preview prevents stale replacement',async({page})=>{
 await open(page);await filePreview(page,fixture());await seed(page,'미리보기 후 수정');await confirm(page);
 await expect(page.locator('#transfer-status')).toContainText('다른 정산 탭');expect((await ledger(page)).passes[0].name).toBe('미리보기 후 수정');
});
test('cloud upload is explicit and a lost response is recovered without duplicate writes',async({page})=>{
 const cloud=await mockCloud(page);await open(page,{login:true});await seed(page);expect(cloud.writes).toBe(0);
 await page.locator('#cloud-preview-upload').click();await expect(page.locator('#transfer-preview')).toBeVisible();cloud.loseResponse=true;await confirm(page);
 await expect(page.locator('#transfer-status')).toContainText('연결하지 못했어요');expect(cloud.row.revision).toBe(1);expect((await snapshot(page)).meta.remoteRevision).toBe(0);
 await page.locator('#cloud-preview-upload').click();await expect(page.locator('#transfer-comparison')).toContainText('이미 같아요');await confirm(page);await expect(page.locator('#transfer-status')).toContainText('저장 확인 완료');
 expect(cloud.writes).toBe(1);const info=await snapshot(page);expect(info.meta.remoteRevision).toBe(1);expect(info.meta.syncedLocalRevision).toBe(info.state.revision);
});
test('offline cloud errors keep the local ledger and auth session unchanged',async({page})=>{
 const cloud=await mockCloud(page);cloud.offline=true;await open(page,{login:true});await seed(page);const before=await ledger(page),auth=await page.evaluate(key=>localStorage.getItem(key),AUTH);
 await page.locator('#cloud-preview-upload').click();await expect(page.locator('#transfer-status')).toContainText('연결하지 못했어요');expect(await ledger(page)).toEqual(before);expect(await page.evaluate(key=>localStorage.getItem(key),AUTH)).toBe(auth);
});
test('cloud download is reviewed, backed up and marked synchronized',async({page})=>{
 const remote=fixture('user:'+USER,'클라우드 권'),cloud=await mockCloud(page,{payload:remote,revision:4,updated_at:new Date().toISOString()});
 await open(page,{login:true});await seed(page);const before=await ledger(page);await page.locator('#cloud-preview-download').click();await expect(page.locator('#transfer-comparison')).toContainText('적용 후');
 await confirm(page);await expect(page.locator('#transfer-status')).toContainText('교체했어요');expect((await ledger(page)).passes[0].name).toBe('클라우드 권');expect(await page.evaluate(()=>VzipBillingStore.recoveryData())).toEqual(before);
 const info=await snapshot(page);expect(info.meta.remoteRevision).toBe(4);expect(info.meta.syncedLocalRevision).toBe(info.state.revision);expect(cloud.writes).toBe(0);
});
test('remote revisions changing after preview block both upload and download',async({page})=>{
 const cloud=await mockCloud(page);await open(page,{login:true});await seed(page);await page.locator('#cloud-preview-upload').click();await expect(page.locator('#transfer-preview')).toBeVisible();cloud.conflict=true;await confirm(page);
 await expect(page.locator('#transfer-status')).toContainText('다른 기기');cloud.conflict=false;cloud.row={payload:fixture('user:'+USER),revision:2};
 await page.locator('#cloud-preview-download').click();await expect(page.locator('#transfer-title')).toHaveText('클라우드 가져오기');cloud.row.revision=3;await confirm(page);
 await expect(page.locator('#transfer-status')).toContainText('미리보기 이후 클라우드');expect((await ledger(page)).passes[0].name).toBe('원래 권');
});
test('unknown remote baseline and foreign-account payloads cannot be overwritten or downloaded',async({page})=>{
 const cloud=await mockCloud(page,{payload:fixture('user:'+USER),revision:2});await open(page,{login:true});await seed(page);
 await page.locator('#cloud-preview-upload').click();await expect(page.locator('#transfer-status')).toContainText('다른 기기');expect(cloud.writes).toBe(0);
 cloud.row.payload=fixture('user:'+OTHER);await page.locator('#cloud-preview-download').click();await expect(page.locator('#transfer-status')).toContainText('소유자');expect((await ledger(page)).passes[0].name).toBe('원래 권');
});
test('an account change while the network responds cannot import data',async({page})=>{
 let release,arrived;const reached=new Promise(r=>arrived=r),hold=new Promise(r=>release=r);
 await page.route('https://chxnbtiyuyhiywzeshis.supabase.co/rest/v1/**',async route=>{arrived();await hold;await route.fulfill({json:[{payload:fixture('user:'+USER),revision:1}]})});
 await open(page,{login:true});await page.locator('#cloud-preview-download').click();await reached;
 await page.evaluate(({key,id})=>localStorage.setItem(key,JSON.stringify({access_token:'changed',user:{id}})),{key:AUTH,id:OTHER});release();
 await expect(page.locator('#transfer-status')).toContainText('계정이 변경');await expect(page.locator('#transfer-preview')).toBeHidden();
});
