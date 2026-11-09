const {test,expect}=require('@playwright/test');
const stub=`
window.__writes=[];
const sessionUser=()=>localStorage.getItem('__test_user')||'A';
window.supabase={createClient:(url,key,options)=>(window.__clientOptions=options,{
 auth:{
  getUser:async()=>{if(window.__holdAuth)await new Promise(resolve=>{window.__releaseAuth=resolve;});return{data:{user:sessionUser()==='out'?null:{id:sessionUser(),email:sessionUser()+'@test.invalid'}}};},
  getSession:async()=>({data:{session:{access_token:'test-token'}}}),
  onAuthStateChange:fn=>{window.__authListeners ||= [];window.__authListeners.push(fn);window.__changeAuth=(event,session)=>window.__authListeners.forEach(f=>f(event,session));return{data:{subscription:{unsubscribe(){}}}}},
  signOut:async()=>{localStorage.setItem('__test_user','out');window.__changeAuth?.('SIGNED_OUT',null);return{error:null}},
  signInWithPassword:async()=>({error:null})
 },
 rpc:async(name,args)=>{
  if(localStorage.getItem('__rpc_error'))return{data:null,error:{message:'unavailable'}};
  const key='__sessions_'+sessionUser(),revKey=key+'_revision',sid=sessionStorage.getItem('__test_session')||'here-session';
  const rows=JSON.parse(localStorage.getItem(key)||'[]');let revision=Number(localStorage.getItem(revKey)||0);
  const save=()=>{localStorage.setItem(key,JSON.stringify(rows));localStorage.setItem(revKey,String(revision));};
  const snapshot=()=>({sessions:rows.filter(s=>!s.revoked),revision,limit:2,current_session:sid});
  const result=data=>({data,error:null});
  const live=()=>rows.find(s=>s.session_id===sid&&!s.revoked);
  if(name==='vzip_register_session'){
   window.__claims ||= [];window.__claims.push(args);
   const current=rows.find(s=>s.session_id===sid);
   if(current?.revoked)return result({status:'revoked'});
   if(current)return result({...snapshot(),status:'active'});
   if(args?.p_replace_session&&window.__changeRevisionOnReplace){window.__changeRevisionOnReplace=false;revision++;save();}
   if(args?.p_replace_session&&args.p_expected_revision!==revision)return result({...snapshot(),status:'sessions_changed'});
   if(rows.filter(s=>!s.revoked).length>=2){
    if(!args?.p_replace_session)return result({...snapshot(),status:'device_limit'});
    const victim=rows.find(s=>s.session_id===args.p_replace_session&&!s.revoked);
    if(!victim)return result({...snapshot(),status:'sessions_changed'});
    victim.revoked=true;
   }
   rows.push({session_id:sid,label:args.p_label,created_at:'2026-11-07T06:00:00Z'});revision++;save();
   return result({...snapshot(),status:'active'});
  }
  if(name==='vzip_session_is_active'){
   if(localStorage.getItem('__test_active')==='other'&&live()){live().revoked=true;revision++;save();}
   return result(!!live());
  }
  if(name==='vzip_list_sessions')return live()?result(snapshot()):{data:null,error:{message:'active session required'}};
  if(name==='vzip_revoke_sessions'){
   window.__revokes ||= [];window.__revokes.push(args);
   if(!live())return{data:null,error:{message:'active session required'}};
   if(args.p_expected_revision!==revision)return result({...snapshot(),status:'sessions_changed'});
   let count=0;
   for(const row of rows)if(!row.revoked&&(args.p_all||row.session_id===args.p_session_id)){row.revoked=true;count++;}
   if(count)revision++;save();return result({...snapshot(),status:'revoked',count});
  }
  if(name==='vzip_release_session'){if(!live())return result(false);live().revoked=true;revision++;save();return result(true);}
  return result(true);
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
async function setup(page,{owner='A',user='A',active='here',error=false,session='here-session'}={}){
 page.__errors=[];page.on('pageerror',e=>page.__errors.push(e.message));
 await page.route('**/supabase.min.js',r=>r.fulfill({contentType:'application/javascript',body:stub}));
 await page.route('**/r2-config.js*',r=>r.fulfill({contentType:'application/javascript',body:"window.VZIP_R2_ENDPOINT='';"}));
 await page.route('**/tus.min.js',r=>r.fulfill({contentType:'application/javascript',body:'window.tus={}'}));
 await page.route('**/*.supabase.co/**',r=>r.abort());
 await page.addInitScript(o=>{
  window.VZIP_DEVICE_SESSIONS_ENABLED=true;
  if(!sessionStorage.getItem('__seed_iso')){
   sessionStorage.setItem('__seed_iso','1');sessionStorage.setItem('__test_session',o.session);
   localStorage.setItem('vzip_account_scope_owner_v1',o.owner);
   localStorage.setItem('__test_user',o.user);localStorage.setItem('__test_active',o.active);
   if(!localStorage.getItem('__sessions_'+o.user)){
    const rows=['full','shared'].includes(o.active)?['other-1',...(o.active==='full'?['other-2']:[])].map((id,i)=>({session_id:id,label:['iPad','iPhone'][i],created_at:'2026-11-07T05:00:00Z'})):[];
    localStorage.setItem('__sessions_'+o.user,JSON.stringify(rows));localStorage.setItem('__sessions_'+o.user+'_revision','7');
   }
   if(o.error)localStorage.setItem('__rpc_error','1');
   localStorage.setItem('vocal-zip_mvp_v1',JSON.stringify({songs:[{id:'legacy',title:'이전 원본'}]}));
  }
 },{owner,user,active,error,session});
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
 await expect.poll(()=>page.evaluate(()=>typeof window.vzipReadMedia)).toBe('function');
 await expect.poll(()=>page.evaluate(()=>window.vzipCloudSignedIn?.()||false)).toBe(true);
 expect(await page.evaluate(async()=>({files:await vzipReadMedia(),queue:VzipAccountScope.storage.getItem('vzip_upload_queue_v1'),songs:VZ.db.songs.map(x=>x.id)}))).toEqual({files:[],queue:null,songs:['song-B']});
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')).songs[0].id)).toBe('legacy');
 await page.evaluate(()=>{localStorage.setItem('__test_user','A');window.__changeAuth('SIGNED_IN',{user:{id:'A'}});});
 await expect.poll(()=>page.evaluate(()=>window.VzipAccountScope?.owner||null).catch(e=>{if(/context.*destroyed|most likely because of a navigation/i.test(e.message))return null;throw e;})).toBe('A');
 // The account scope loads before the media scripts during a full reload (notably WebKit).
 // Wait for verified sign-in, as above for B, before reading the account media API.
 await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 await expect.poll(()=>page.evaluate(()=>typeof window.vzipReadMedia)).toBe('function');
 expect(await page.evaluate(async()=>({ids:(await vzipReadMedia()).map(x=>x.id),queue:VzipAccountScope.storage.getItem('vzip_upload_queue_v1')}))).toEqual({ids:['private-A'],queue:'A-only-queue'});
});

test('multiple logins open without displacing existing sessions',async({page})=>{
 await setup(page,{active:'shared'});
 await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('__sessions_A')).filter(s=>!s.revoked).map(s=>s.session_id))).toEqual(['other-1','here-session']);
 expect(await page.evaluate(()=>window.__clientOptions.global.headers['X-Client-Info'])).toBe('vocalzip-device-session-v2');
 await expect(page.getByRole('dialog')).toHaveCount(0);
});
test('third login selects exactly one session and approval precedes opening the app',async({page})=>{
 await setup(page,{active:'full'});
 const dialog=page.getByRole('dialog',{name:'로그인 세션 한도'});
 await expect(dialog).toBeVisible();expect(await page.evaluate(()=>vzipCloudSignedIn())).toBe(false);
 expect(await page.evaluate(()=>window.__writes)).toEqual([]);
 await expect(dialog.getByRole('button',{name:'선택한 로그인 종료하고 계속'})).toBeDisabled();
 await dialog.getByLabel('종료할 로그인').selectOption('other-2');
 await dialog.getByRole('button',{name:'선택한 로그인 종료하고 계속'}).click();
 await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 expect(await page.evaluate(()=>window.__claims.map(x=>[x.p_replace_session,x.p_expected_revision]))).toEqual([[null,null],['other-2',7]]);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('__sessions_A')).filter(s=>!s.revoked).map(s=>s.session_id))).toEqual(['other-1','here-session']);
});
test('cancel at the login limit preserves every existing session and performs no cloud writes',async({page})=>{
 await setup(page,{active:'full'});
 await Promise.all([page.waitForEvent('load'),page.getByRole('dialog',{name:'로그인 세션 한도'}).getByRole('button',{name:'취소'}).click()]);
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('vzip_account_scope_owner_v1')).catch(()=>null)).toBe('');
 await expect(page.locator('#vzip-auth-screen')).toBeVisible();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('__sessions_A')).filter(s=>!s.revoked).length)).toBe(2);
 expect(await page.evaluate(()=>window.__writes)).toEqual([]);
});
test('stale replacement approval displays a fresh list and never silently evicts another login',async({page})=>{
 await setup(page,{active:'full'});
 let dialog=page.getByRole('dialog',{name:'로그인 세션 한도'});
 await dialog.getByLabel('종료할 로그인').selectOption('other-1');
 await page.evaluate(()=>{window.__changeRevisionOnReplace=true;});
 await dialog.getByRole('button',{name:'선택한 로그인 종료하고 계속'}).click();
 await expect(dialog.getByRole('button',{name:'선택한 로그인 종료하고 계속'})).toBeDisabled();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('__sessions_A')).filter(s=>!s.revoked).length)).toBe(2);
 expect(await page.evaluate(()=>vzipCloudSignedIn())).toBe(false);
 await dialog.getByLabel('종료할 로그인').selectOption('other-2');
 await dialog.getByRole('button',{name:'선택한 로그인 종료하고 계속'}).click();
 await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 expect(await page.evaluate(()=>window.__claims.at(-1).p_expected_revision)).toBe(8);
});
test('missing server RPC fails closed with no sync or token access',async({page})=>{
 await setup(page,{error:true});
 await expect(page.locator('#vzip-auth-message')).toContainText('서버 다중 기기 로그인 설정');
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
 await expect(page.locator('#vzip-auth-message')).toContainText('이 기기의 로그인이 종료');
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

test('revoked JWT stays locked; fresh authentication waits for pending recording protection',async({page})=>{
 await setup(page);await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 await page.evaluate(()=>{
  window.__protectionHeld=true;
  VzipAccountScope.beforeLeave(()=>new Promise(resolve=>{window.__finishProtection=()=>{VzipAccountScope.storage.setItem('protected-before-reclaim','yes');resolve();};}));
  localStorage.setItem('__test_active','other');window.dispatchEvent(new Event('focus'));
 });
 await expect(page.locator('#vzip-auth-screen')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>typeof window.__finishProtection)).toBe('function');
 await page.evaluate(()=>window.__changeAuth('SIGNED_IN',{user:{id:'A',email:'A@test.invalid'}}));
 await expect(page.locator('#vzip-auth-message')).toContainText('이 로그인은 종료');
 expect(await page.evaluate(()=>vzipCloudSignedIn())).toBe(false);
 await page.evaluate(()=>{sessionStorage.setItem('__test_session','new-session');localStorage.setItem('__test_active','here');window.__changeAuth('SIGNED_IN',{user:{id:'A',email:'A@test.invalid'}});});
 await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('__sessions_A')).some(s=>s.session_id==='new-session'))).toBe(true);
 expect(await page.evaluate(()=>window.__protectionHeld)).toBe(true);
 await Promise.all([page.waitForEvent('load'),page.evaluate(()=>window.__finishProtection())]);
 await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 expect(await page.evaluate(()=>VzipAccountScope.storage.getItem('protected-before-reclaim'))).toBe('yes');
});

test('direct resumable uploads carry the same account protocol header as SDK requests',async({page})=>{
 await setup(page);await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 const headers=await page.evaluate(async()=>{
  window.tus={Upload:class{constructor(file,options){this.options=options;window.__transportHeaders=options.headers;}start(){this.options.onError(new Error('isolated transport probe'));}abort(){return Promise.resolve();}}};
  try{await vzipCloudImport(new File([new Uint8Array(1024)],'probe.wav',{type:'audio/wav'}),{id:'protocol-probe'});}catch{}
  return window.__transportHeaders;
 });
 expect(headers['X-Client-Info']).toBe('vocalzip-device-session-v2');expect(headers.authorization).toBe('Bearer test-token');
});

test('cached account content stays inert while initial authentication is unresolved',async({page})=>{
 await page.addInitScript(()=>{window.__holdAuth=true;});
 // Setup waits for the boot cover only after showUser; start setup and release auth explicitly.
 const booting=setup(page);
 await page.waitForURL('**/#/home');
 await expect.poll(()=>page.evaluate(()=>typeof window.__releaseAuth).catch(()=>null)).toBe('function');
 expect(await page.evaluate(()=>[document.querySelector('.v-app').inert,document.querySelector('.v-nav').inert])).toEqual([true,true]);
 await page.evaluate(()=>{window.__holdAuth=false;window.__releaseAuth();});
 await booting;
 await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 expect(await page.evaluate(()=>document.querySelector('.v-app').inert)).toBe(false);
});

test('device manager confirms a specific remote logout and preserves the current login',async({page})=>{
 await setup(page,{active:'shared'});await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 await page.evaluate(()=>{location.hash='/settings';});
 await page.getByRole('button',{name:'로그인 기기 관리'}).click();
 const dialog=page.getByRole('dialog',{name:'로그인 기기 관리'});
 await expect(dialog).toBeVisible();
 await dialog.getByRole('listitem').filter({hasText:'iPad'}).getByRole('button',{name:'이 로그인 로그아웃',exact:true}).click();
 expect(await page.evaluate(()=>window.__revokes||[])).toEqual([]);
 await dialog.getByRole('button',{name:'로그아웃 확인',exact:true}).click();
 await expect(dialog.getByRole('listitem')).toHaveCount(1);
 expect(await page.evaluate(()=>vzipCloudSignedIn())).toBe(true);
 expect(await page.evaluate(()=>window.__revokes)).toEqual([{p_session_id:'other-1',p_all:false,p_expected_revision:8}]);
 await dialog.getByRole('button',{name:'닫기',exact:true}).click();await expect(dialog).toHaveCount(0);
});

test('all-device logout waits for local capture protection and requires confirmation',async({page})=>{
 await setup(page,{active:'shared'});await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 await page.evaluate(()=>{VzipAccountScope.beforeLeave(()=>new Promise(resolve=>{window.__finishLogout=()=>{VzipAccountScope.storage.setItem('logout-protected','yes');resolve();};}));location.hash='/settings';});
 await page.getByRole('button',{name:'로그인 기기 관리'}).click();
 const dialog=page.getByRole('dialog',{name:'로그인 기기 관리'});
 await dialog.getByRole('button',{name:'모든 기기 로그아웃',exact:true}).click();
 expect(await page.evaluate(()=>window.__revokes||[])).toEqual([]);
 await dialog.getByRole('button',{name:'로그아웃 확인',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>typeof window.__finishLogout)).toBe('function');
 expect(await page.evaluate(()=>window.__revokes||[])).toEqual([]);
 await Promise.all([page.waitForEvent('load'),page.evaluate(()=>window.__finishLogout())]);
 await expect.poll(()=>page.evaluate(()=>localStorage.getItem('vzip_account_scope_owner_v1')).catch(()=>null)).toBe('');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('__sessions_A')).every(s=>s.revoked))).toBe(true);
 expect(await page.evaluate(()=>localStorage.getItem('vzip_account_v1:A:logout-protected'))).toBe('yes');
});

test('two independent authenticated tabs coexist and only a remotely revoked session locks',async({page,context})=>{
 await setup(page,{session:'first-session'});await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 const second=await context.newPage();
 try{
  await setup(second,{session:'second-session'});await expect(second.locator('#vzip-auth-screen')).toBeHidden();
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.locator('#vzip-auth-screen')).toBeHidden();
  expect(await second.evaluate(()=>JSON.parse(localStorage.getItem('__sessions_A')).filter(s=>!s.revoked).length)).toBe(2);
  await second.evaluate(()=>{const rows=JSON.parse(localStorage.getItem('__sessions_A'));rows.find(s=>s.session_id==='first-session').revoked=true;localStorage.setItem('__sessions_A',JSON.stringify(rows));});
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.locator('#vzip-auth-screen')).toBeVisible();
  await expect(second.locator('#vzip-auth-screen')).toBeHidden();
  expect(await second.evaluate(()=>vzipCloudSignedIn())).toBe(true);
  expect(second.__errors).toEqual([]);
 }finally{await second.close();}
});

async function billingFixture(page){
 let allowed=true;
 await page.route('**/rest/v1/rpc/vzip_session_context',route=>{
  const b=route.request().headers().authorization?.endsWith('billing-B');
  return route.fulfill({contentType:'application/json',body:JSON.stringify({user_id:b?'B':'A',allowed,required:true,playback_token:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'})});
 });
 await page.addScriptTag({url:'/billing/core.js'});
 await page.evaluate(async()=>{
  localStorage.setItem('sb-chxnbtiyuyhiywzeshis-auth-token',JSON.stringify({access_token:'billing-A',expires_at:4102444800,user:{id:'A'}}));
  VzipAccountScope.storage.setItem('vocal-zip_mvp_v1',JSON.stringify({songs:[],lessons:[{id:'lesson-A',date:'2026-11-07',status:'completed'}]}));
  const request=indexedDB.open('vocalzip_billing_v1',2);
  const db=await new Promise((resolve,reject)=>{request.onupgradeneeded=()=>{for(const name of ['documents','sync','recovery'])if(!request.result.objectStoreNames.contains(name))request.result.createObjectStore(name,{keyPath:'owner'});};request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  await new Promise((resolve,reject)=>{const tx=db.transaction('documents','readwrite');for(const [owner,rate]of[['user:A',50000],['user:B',99000]])tx.objectStore('documents').put({...VzipBilling.empty(owner),hourlyRate:rate});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
 });
 return{revoke:()=>{allowed=false;}};
}
// Require verified login and the app's own successful initial ledger load, not just a later manual store read.
async function billingReady(page,owner){
 await expect.poll(()=>page.evaluate(id=>window.VzipAccountScope?.owner===id&&
  window.VzipBillingSession?.active===true&&window.VzipBillingStore?.account?.id==='user:'+id,owner)
  .catch(e=>{if(/context.*destroyed|most likely because of a navigation/i.test(e.message))return false;throw e;})).toBe(true);
 await expect(page.locator('#message')).toContainText(/불러왔어요|받아왔어요/);
}
test('billing copies only the verified owners legacy ledger and isolates account switches',async({page})=>{
 await setup(page);await expect(page.locator('#vzip-auth-screen')).toBeHidden();await billingFixture(page);
 await page.goto('/billing/');
 await billingReady(page,'A');
 expect(await page.evaluate(async()=>({owner:VzipBillingStore.account.id,rate:(await VzipBillingStore.load()).hourlyRate,lessons:VzipBillingStore.lessons().map(l=>l.lesson_id),others:await VzipBillingStore.others(await VzipBillingStore.load())}))).toEqual({owner:'user:A',rate:50000,lessons:['lesson-A'],others:[]});
 await page.evaluate(()=>{localStorage.setItem('sb-chxnbtiyuyhiywzeshis-auth-token',JSON.stringify({access_token:'billing-B',expires_at:4102444800,user:{id:'B'}}));window.dispatchEvent(new Event('focus'));});
 await expect.poll(()=>page.evaluate(()=>VzipAccountScope?.owner).catch(()=>null)).toBe('B');
 await billingReady(page,'B');
 expect(await page.evaluate(async()=>({owner:VzipBillingStore.account.id,rate:(await VzipBillingStore.load()).hourlyRate,lessons:VzipBillingStore.lessons()}))).toEqual({owner:'user:B',rate:99000,lessons:[]});
});
test('billing locks local writes after remote revoke while retaining the existing ledger',async({page})=>{
 await setup(page);await expect(page.locator('#vzip-auth-screen')).toBeHidden();const server=await billingFixture(page);
 await page.goto('/billing/');await billingReady(page,'A');
 expect(await page.evaluate(async()=>(await VzipBillingStore.load()).hourlyRate)).toBe(50000);
 server.revoke();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.locator('#billing-session-gate')).toBeVisible();
 expect(await page.evaluate(async()=>{
  try{await VzipBillingStore.clear(0);return false;}catch(e){return e.message.includes('로그인');}
 })).toBe(true);
 expect(await page.evaluate(()=>document.querySelector('main.billing').inert)).toBe(true);
});
