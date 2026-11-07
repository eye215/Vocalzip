const {test,expect}=require('@playwright/test');
const stub=`
window.__writes=[];
const sessionUser=()=>localStorage.getItem('__test_user')||'A';
window.supabase={createClient:()=>({
 auth:{
  getUser:async()=>({data:{user:sessionUser()==='out'?null:{id:sessionUser(),email:sessionUser()+'@test.invalid'}}}),
  getSession:async()=>({data:{session:{access_token:'test-token'}}}),
  onAuthStateChange:fn=>{window.__authListeners ||= [];window.__authListeners.push(fn);window.__changeAuth=(event,session)=>window.__authListeners.forEach(f=>f(event,session));return{data:{subscription:{unsubscribe(){}}}}},
  signOut:async()=>{localStorage.setItem('__test_user','out');window.__changeAuth?.('SIGNED_OUT',null);return{error:null}},
  signInWithPassword:async()=>({error:null})
 },
 rpc:async(name,args)=>{
  if(localStorage.getItem('__rpc_error'))return{data:null,error:{message:'unavailable'}};
  if(name==='vzip_claim_session'){
   window.__claims ||= [];window.__claims.push(args);
   if(localStorage.getItem('__test_active')==='other'&&!args?.expected_previous)return{data:{status:'confirmation_required',expected_previous:'old-session'},error:null};
   if(args?.expected_previous)localStorage.setItem('__test_active','here');
   return{data:{status:'active'},error:null};
  }
  if(name==='vzip_session_is_active')return{data:localStorage.getItem('__test_active')!=='other',error:null};
  return{data:true,error:null};
 },
 from:table=>{
  let owner=sessionUser(),write=null;
  const q={};
  for(const method of ['select','eq','is','order','range','in','upsert','insert','update','delete','maybeSingle'])q[method]=(...args)=>{
   if(method==='eq'&&args[0]==='user_id')owner=args[1];
   if(['insert','upsert','update','delete'].includes(method))write={table,method,body:args[0],owner};
   return q;
  };
  q.then=resolve=>{
   if(write){window.__writes.push(write);return resolve({data:[{user_id:owner}],error:null});}
   return resolve({data:table==='vocal_data'?{payload:{songs:[{id:'song-'+owner,title:'song-'+owner}],lessons:[],practices:[],assignments:[],categories:[]},updated_at:'2026-11-07'}:[],error:null});
  };
  return q;
 },
 storage:{from:()=>({})}
})};
`;
async function setup(page,{owner='A',user='A',active='here',error=false}={}){
 page.__errors=[];page.on('pageerror',e=>page.__errors.push(e.message));
 await page.route('**/supabase.min.js',r=>r.fulfill({contentType:'application/javascript',body:stub}));
 await page.route('**/r2-config.js*',r=>r.fulfill({contentType:'application/javascript',body:"window.VZIP_R2_ENDPOINT='';"}));
 await page.route('**/tus.min.js',r=>r.fulfill({contentType:'application/javascript',body:'window.tus={}'}));
 await page.route('**/*.supabase.co/**',r=>r.abort());
 await page.addInitScript(o=>{
  window.VZIP_SINGLE_SESSION_ENABLED=true;
  if(!sessionStorage.getItem('__seed_iso')){
   sessionStorage.setItem('__seed_iso','1');
   localStorage.setItem('vzip_account_scope_owner_v1',o.owner);
   localStorage.setItem('__test_user',o.user);localStorage.setItem('__test_active',o.active);
   if(o.error)localStorage.setItem('__rpc_error','1');
   localStorage.setItem('vocal-zip_mvp_v1',JSON.stringify({songs:[{id:'legacy',title:'이전 원본'}]}));
  }
 },{owner,user,active,error});
 await page.goto('/#/home');
 await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
}
test.afterEach(async({page})=>expect(page.__errors||[]).toEqual([]));

test('separate account namespaces and media databases survive account switch without auto-import',async({page})=>{
 await setup(page);
 await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 await page.evaluate(async()=>{
  VzipAccountScope.storage.setItem('vzip_upload_queue_v1','A-only-queue');
  await vzipStorePracticeMedia({id:'private-A',name:'A 비공개',type:'audio/wav',blob:new Blob(['A'])});
  localStorage.setItem('__test_user','B');
  window.__changeAuth('SIGNED_IN',{user:{id:'B',email:'B@test.invalid'}});
 });
 await expect.poll(()=>page.evaluate(()=>window.VzipAccountScope?.owner||null).catch(e=>{if(/context.*destroyed|most likely because of a navigation/i.test(e.message))return null;throw e;})).toBe('B');
 await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 expect(await page.evaluate(async()=>({files:await vzipReadMedia(),queue:VzipAccountScope.storage.getItem('vzip_upload_queue_v1'),songs:VZ.db.songs.map(x=>x.id)}))).toEqual({files:[],queue:null,songs:['song-B']});
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')).songs[0].id)).toBe('legacy');
 await page.evaluate(()=>{localStorage.setItem('__test_user','A');window.__changeAuth('SIGNED_IN',{user:{id:'A'}});});
 await expect.poll(()=>page.evaluate(()=>window.VzipAccountScope?.owner||null).catch(e=>{if(/context.*destroyed|most likely because of a navigation/i.test(e.message))return null;throw e;})).toBe('A');
 expect(await page.evaluate(async()=>({ids:(await vzipReadMedia()).map(x=>x.id),queue:VzipAccountScope.storage.getItem('vzip_upload_queue_v1')}))).toEqual({ids:['private-A'],queue:'A-only-queue'});
});

test('takeover requires a visible confirmation and approval precedes opening the app',async({page})=>{
 await setup(page,{active:'other'});
 const dialog=page.getByRole('dialog',{name:'로그인 기기 인계'});
 await expect(dialog).toBeVisible();
 expect(await page.evaluate(()=>vzipCloudSignedIn())).toBe(false);
 expect(await page.evaluate(()=>window.__writes)).toEqual([]);
 await dialog.getByRole('button',{name:'여기서 로그인'}).click();
 await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 expect(await page.evaluate(()=>window.__claims)).toEqual([{expected_previous:null},{expected_previous:'old-session'}]);
});

test('cancel takeover leaves the existing server session untouched',async({page})=>{
 await setup(page,{active:'other'});
 await page.getByRole('dialog',{name:'로그인 기기 인계'}).getByRole('button',{name:'취소'}).click();
 await expect(page.locator('#vzip-auth-screen')).toBeVisible();
 expect(await page.evaluate(()=>localStorage.getItem('__test_active'))).toBe('other');
 expect(await page.evaluate(()=>window.__writes)).toEqual([]);
});

test('missing server RPC fails closed with no sync or token access',async({page})=>{
 await setup(page,{error:true});
 await expect(page.locator('#vzip-auth-message')).toContainText('서버 단일 로그인 설정');
 expect(await page.evaluate(async()=>[vzipCloudSignedIn(),await vzipCloudAccessToken(),window.__writes.length])).toEqual([false,null,0]);
});

test('legacy copy preserves source bytes and IDs and never overwrites current data',async({page})=>{
 await setup(page);
 await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 const report=await page.evaluate(async()=>{
  const request=indexedDB.open('vocalzip_media_v1',1);
  const db=await new Promise((resolve,reject)=>{request.onupgradeneeded=()=>request.result.createObjectStore('recordings',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  await new Promise((resolve,reject)=>{const t=db.transaction('recordings','readwrite');t.objectStore('recordings').put({id:'old-file',bytes:new TextEncoder().encode('original').buffer,name:'old',type:'audio/wav'});t.oncomplete=resolve;t.onerror=()=>reject(t.error);});db.close();
  const current=JSON.parse(VzipAccountScope.storage.getItem('vocal-zip_mvp_v1'));current.songs.push({id:'legacy',title:'현재 계정이 수정한 제목'});VzipAccountScope.storage.setItem('vocal-zip_mvp_v1',JSON.stringify(current));
  const before=localStorage.getItem('vocal-zip_mvp_v1');
  const first=await VzipAccountScope.importLegacy(), second=await VzipAccountScope.importLegacy();
  const files=await vzipReadMedia();
  const bytes=await vzipMediaBlob(files.find(x=>x.id==='old-file')).text();
  return{first,second,sourceUnchanged:before===localStorage.getItem('vocal-zip_mvp_v1'),ids:files.map(x=>x.id),bytes,legacyClaim:localStorage.getItem('vzip_legacy_claim_owner_v1'),currentTitle:JSON.parse(VzipAccountScope.storage.getItem('vocal-zip_mvp_v1')).songs.find(x=>x.id==='legacy').title};
 });
 expect(report.sourceUnchanged).toBe(true);expect(report.ids).toContain('old-file');expect(report.bytes).toBe('original');expect(report.legacyClaim).toBe('A');
 expect(report.currentTitle).toBe('현재 계정이 수정한 제목');expect(report.first.conflicts).toBeGreaterThan(0);
 expect(report.first.files).toBe(1);expect(report.second.files).toBe(0);
 await page.evaluate(()=>{localStorage.setItem('__test_user','B');window.__changeAuth('SIGNED_IN',{user:{id:'B'}});});
 await expect.poll(()=>page.evaluate(()=>window.VzipAccountScope?.owner||null).catch(e=>{if(/context.*destroyed|most likely because of a navigation/i.test(e.message))return null;throw e;})).toBe('B');
 expect(await page.evaluate(()=>VzipAccountScope.canImportLegacy())).toBe(false);
});

test('account-switch protection finishes an active capture before leaving the original account',async({page,browserName})=>{
 test.skip(browserName==='webkit','Linux WebKit does not support the fake MediaRecorder device');
 await setup(page);
 await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 const result=await page.evaluate(async()=>{
  const capture=await VZ.media.capture({});
  capture.start();
  await new Promise(r=>setTimeout(r,1300));
  // lock uses the same protection path as takeover/account switch, without navigating away.
  await VzipAccountScope.lock();
  const files=await vzipReadMedia(), recovered=files.find(x=>x.recovered);
  return{state:capture.state,id:recovered?.id,owner:recovered?.accountOwner,size:recovered?.blob?.size||recovered?.bytes?.byteLength||0};
 });
 expect(result.state).toBe('inactive');expect(result.owner).toBe('A');expect(result.size).toBeGreaterThan(0);
});

test('a stopped recording preview is also preserved before account switch',async({page,browserName})=>{
 test.skip(browserName==='webkit','Linux WebKit does not support the fake MediaRecorder device');
 await setup(page);
 await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 const result=await page.evaluate(async()=>{
  const capture=await VZ.media.capture({});capture.start();await new Promise(r=>setTimeout(r,1100));await capture.stop();
  await VzipAccountScope.lock();
  return(await vzipReadMedia()).some(x=>x.recovered);
 });
 expect(result).toBe(true);
});

test('server-revoked session locks controls and token access without reclaiming automatically',async({page})=>{
 await setup(page);await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 await page.evaluate(()=>{localStorage.setItem('__test_active','other');window.dispatchEvent(new Event('focus'));});
 await expect(page.locator('#vzip-auth-message')).toContainText('다른 기기로 로그인이 인계');
 await expect(page.locator('#vzip-auth-screen')).toBeVisible();
 expect(await page.evaluate(async()=>({signed:vzipCloudSignedIn(),token:await vzipCloudAccessToken(),inert:document.querySelector('.v-app').inert,active:localStorage.getItem('__test_active')}))).toEqual({signed:false,token:null,inert:true,active:'other'});
});

test('legacy import skips IDs already in cloud and cloud tombstones even without a local mirror',async({page})=>{
 await setup(page);await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 const result=await page.evaluate(async()=>{
  VzipAccountScope.storage.setItem('vocal-zip_mvp_v1',JSON.stringify({songs:[]}));
  localStorage.setItem('vocal-zip_mvp_v1',JSON.stringify({songs:[{id:'legacy',title:'이전 제목'},{id:'gone',title:'삭제됐던 곡'}]}));
  window.vzipAccountImportBaseline=async()=>({payload:{songs:[{id:'legacy',title:'서버 최신 제목'}],deleted:{songs:['gone']}},mediaIds:['cloud-file']});
  const request=indexedDB.open('vocalzip_media_v1',1);
  const db=await new Promise((resolve,reject)=>{request.onupgradeneeded=()=>request.result.createObjectStore('recordings',{keyPath:'id'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  await new Promise((resolve,reject)=>{const tx=db.transaction('recordings','readwrite');tx.objectStore('recordings').put({id:'cloud-file',name:'과거 사본',bytes:new Uint8Array([1,2,3]).buffer,type:'audio/wav'});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  const before=localStorage.getItem('vocal-zip_mvp_v1'),summary=await VzipAccountScope.importLegacy();
  return{summary,songs:JSON.parse(VzipAccountScope.storage.getItem('vocal-zip_mvp_v1')).songs,files:(await vzipReadMedia()).map(x=>x.id),source:localStorage.getItem('vocal-zip_mvp_v1')===before};
 });
 expect(result.summary.records).toBe(0);expect(result.summary.files).toBe(0);expect(result.summary.conflicts).toBe(2);expect(result.songs).toEqual([]);expect(result.files).toEqual([]);expect(result.source).toBe(true);
});

test('reclaiming a session waits for in-flight recording protection before reloading',async({page})=>{
 await setup(page);await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 await page.evaluate(()=>{
  window.__protectionHeld=true;
  VzipAccountScope.beforeLeave(()=>new Promise(resolve=>{window.__finishProtection=()=>{VzipAccountScope.storage.setItem('protected-before-reclaim','yes');resolve();};}));
  localStorage.setItem('__test_active','other');window.dispatchEvent(new Event('focus'));
 });
 await expect(page.locator('#vzip-auth-screen')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>typeof window.__finishProtection)).toBe('function');
 await page.evaluate(()=>window.__changeAuth('SIGNED_IN',{user:{id:'A',email:'A@test.invalid'}}));
 await page.getByRole('dialog',{name:'로그인 기기 인계'}).getByRole('button',{name:'여기서 로그인'}).click();
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('__test_active'))).toBe('here');
 expect(await page.evaluate(()=>window.__protectionHeld)).toBe(true);
 await Promise.all([page.waitForEvent('load'),page.evaluate(()=>window.__finishProtection())]);
 await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 expect(await page.evaluate(()=>VzipAccountScope.storage.getItem('protected-before-reclaim'))).toBe('yes');
});
