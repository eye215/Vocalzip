const {test,expect}=require('@playwright/test');
const U='11111111-1111-4111-8111-111111111111',S='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',G='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const jwt='test.'+Buffer.from(JSON.stringify({sub:U,session_id:S,role:'authenticated'})).toString('base64url')+'.signature';
async function boot(page){
 const remote={row:null,receipts:new Map(),requests:[],commits:0,block:false,lose:false};
 const seed={categories:[],songs:[{id:'song',title:'original'}],lessons:[],assignments:[],practices:[]};
 const stub=`window.__legacySnapshotWrites=[];window.supabase={createClient:()=>({
 auth:{getUser:async()=>({data:{user:{id:'${U}',email:'synthetic@example.invalid'}}}),getSession:async()=>({data:{session:{access_token:'${jwt}'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
 rpc:async name=>({data:name==='vzip_register_session'||name==='vzip_list_sessions'?{status:'active',current_session:'${S}',sessions:[{session_id:'${S}',label:'synthetic'}],revision:1,limit:2}:true,error:null}),
 from:table=>{let write=null;const q={};for(const m of ['select','eq','is','order','range','in','maybeSingle'])q[m]=()=>q;for(const m of ['upsert','insert','update','delete'])q[m]=body=>{write={table,method:m,body};return q;};q.then=resolve=>{if(write){window.__legacySnapshotWrites.push(write);return resolve({data:[{user_id:'${U}'}],error:null});}return resolve({data:table==='vocal_data'?{payload:window.VZ?.db||window.__seed,updated_at:'2026-11-10T00:00:00Z'}:[],error:null});};return q;},storage:{from:()=>({})}
 })};`;
 page.__errors=[];page.on('pageerror',e=>page.__errors.push(e.message));
 await page.route('**/supabase.min.js',r=>r.fulfill({contentType:'application/javascript',body:stub}));
 await page.route('**/tus.min.js',r=>r.fulfill({contentType:'application/javascript',body:'window.tus={}'}));
 await page.route('**/r2-config.js*',r=>r.fulfill({contentType:'application/javascript',body:"window.VZIP_R2_ENDPOINT='';"}));
 await page.route('https://chxnbtiyuyhiywzeshis.supabase.co/rest/v1/**',async route=>{
  const req=route.request(),url=new URL(req.url());expect(req.headers()['x-client-info']).toBe('vocalzip-device-session-v2');
  if(req.method()==='GET'&&url.pathname.endsWith('/vocal_data')){
   if(!remote.row)remote.row={user_id:U,payload:await page.evaluate(()=>JSON.parse(VzipAccountScope.storage.getItem('vocal-zip_mvp_v1'))),revision:'1',generation:G,updated_at:'2026-11-10T00:00:00.000001Z'};
   return route.fulfill({json:remote.row?[remote.row]:[]});
  }
  if(!url.pathname.endsWith('/rpc/vzip_save_snapshot'))return route.fulfill({status:404,json:{}});
  const q=req.postDataJSON();remote.requests.push(q);if(remote.block)return route.fulfill({status:403,json:{}});
  let receipt=remote.receipts.get(q.p_request_id);
  if(!receipt){
   if(q.p_expected_revision!==remote.row.revision||q.p_expected_generation!==remote.row.generation)return route.fulfill({json:{status:'conflict',revision:remote.row.revision,generation:G}});
   remote.commits++;remote.row={...remote.row,payload:q.p_payload,revision:String(BigInt(remote.row.revision)+1n),updated_at:'2026-11-10T00:00:01.000001Z'};
   receipt={status:'saved',revision:remote.row.revision,generation:G,updated_at:remote.row.updated_at};remote.receipts.set(q.p_request_id,receipt);
   if(remote.lose){remote.lose=false;remote.block=true;return route.abort('connectionfailed');}
  }
  return route.fulfill({json:receipt});
 });
 await page.addInitScript(({owner,seed})=>{
  window.VZIP_SNAPSHOT_REVISION_ENABLED=true;window.VZIP_DEVICE_SESSIONS_ENABLED=true;window.VZIP_ONE_ACCOUNT_PER_BROWSER=false;
  localStorage.setItem('vzip_account_scope_owner_v1',owner);window.__seed=seed;
  if(!sessionStorage.getItem('snapshot-seeded')){
   sessionStorage.setItem('snapshot-seeded','1');localStorage.setItem('vzip_account_v1:'+owner+':vocal-zip_mvp_v1',JSON.stringify(seed));
  }
 },{owner:U,seed});
 await page.goto('/#/home');await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 await expect.poll(()=>page.evaluate(()=>!!VzipAccountScope.storage.getItem('vzip_snapshot_transport_v1:'+VzipAccountScope.owner))).toBe(true);
 await expect.poll(()=>page.evaluate(()=>!VzipAccountScope.storage.getItem('vzip_account_dirty'))).toBe(true);
 return remote;
}
const state=page=>page.evaluate(()=>JSON.parse(VzipAccountScope.storage.getItem('vzip_snapshot_transport_v1:'+VzipAccountScope.owner)));
const sync=page=>page.evaluate(()=>document.getElementById('cloud-upload').onclick());
test.afterEach(async({page})=>expect(page.__errors||[]).toEqual([]));
test('Snapshot bridge on mobile replays a lost acknowledgement without a legacy write or duplicate commit',async({page})=>{
 const remote=await boot(page);remote.lose=true;
 await page.evaluate(()=>VZ.change(d=>{d.practices.push({id:'offline',date:'2026-11-10',manualMinutes:12,minutes:12});},{silent:true}));
 await sync(page);await expect.poll(async()=>!!(await state(page)).pending).toBe(true);
 const id=(await state(page)).pending.id;expect(remote.commits).toBe(1);remote.block=false;
 await sync(page);await expect.poll(async()=>(await state(page)).pending).toBe(null);
 expect(remote.commits).toBe(1);expect(new Set(remote.requests.map(r=>r.p_request_id))).toEqual(new Set([id]));
 expect(await page.evaluate(()=>window.__legacySnapshotWrites)).toEqual([]);
 expect(remote.row.payload.practices.some(p=>p.id==='offline')).toBe(true);
});
test('Snapshot bridge preserves both same-field edits on a concurrent remote save',async({page})=>{
 const remote=await boot(page);
 await page.evaluate(()=>VZ.change(d=>{d.songs[0].title='phone input';},{silent:true}));
 remote.row.payload.songs[0].title='tablet input';remote.row.revision='2';
 await sync(page);
 expect(await page.evaluate(()=>VZ.db.songs[0].title)).toBe('phone input');expect(remote.row.payload.songs[0].title).toBe('tablet input');
 expect((await state(page)).conflict.kind).toBe('conflict');expect(remote.commits).toBe(0);
 expect(await page.evaluate(()=>window.__legacySnapshotWrites)).toEqual([]);
});
test('Snapshot bridge deletion scrubs a pending lesson before local completion while retaining unrelated practice',async({page})=>{
 const remote=await boot(page);remote.block=true;
 await page.evaluate(()=>VZ.change(d=>{d.lessons.push({id:'private',date:'2026-11-10',feedback:'erase pending text'});d.practices.push({id:'keep',date:'2026-11-10',minutes:12,manualMinutes:12});},{silent:true}));
 await sync(page);await expect.poll(async()=>!!(await state(page)).pending).toBe(true);
 await page.evaluate(()=>window.vzipSnapshotDeleteLocalLesson('private',()=>VZ.change(d=>VzipDataMerge.deleteLesson(d,'private'),{silent:true})));
 const journal=await state(page);expect(JSON.stringify(journal)).not.toContain('erase pending text');expect(journal.conflict.kind).toBe('deleted');
 expect(journal.pending.payload.practices.some(p=>p.id==='keep')).toBe(true);
 const calls=remote.requests.length;await sync(page);expect(remote.requests.length).toBe(calls);
 expect(await page.evaluate(()=>VZ.db.lessons.some(l=>l.id==='private'))).toBe(false);
});
