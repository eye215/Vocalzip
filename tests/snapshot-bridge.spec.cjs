const {test,expect}=require('@playwright/test');
const U='11111111-1111-4111-8111-111111111111',S='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',G='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const jwt='test.'+Buffer.from(JSON.stringify({sub:U,session_id:S,role:'authenticated'})).toString('base64url')+'.signature';
async function boot(page,{media=false}={}){
 const remote={row:null,receipts:new Map(),requests:[],commits:0,block:false,lose:false};
 const seed={categories:[],songs:[{id:'song',title:'original'}],lessons:[],assignments:[],practices:[]};
 const stub=`window.__legacySnapshotWrites=[];window.supabase={createClient:()=>({
 auth:{getUser:async()=>({data:{user:{id:'${U}',email:'synthetic@example.invalid'}}}),getSession:async()=>({data:{session:{access_token:'${jwt}'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})},
 rpc:async name=>({data:name==='vzip_register_session'||name==='vzip_list_sessions'?{status:'active',current_session:'${S}',sessions:[{session_id:'${S}',label:'synthetic'}],revision:1,limit:2}:true,error:null}),
 from:table=>{let write=null,single=false;const filters={},q={};for(const m of ['select','order','range','in'])q[m]=()=>q;for(const m of ['eq','is'])q[m]=(k,v)=>{filters[k]=v;return q;};q.maybeSingle=()=>{single=true;return q;};for(const m of ['upsert','insert','update','delete'])q[m]=body=>{write={table,method:m,body};return q;};q.then=resolve=>{if(table==='vocal_media'){const rows=window.__fixtureMedia||(window.__fixtureMedia=JSON.parse(sessionStorage.getItem('snapshot-test-media')||'{}'));if(write?.method==='delete'){const row=rows[filters.id];if(row?.updated_at===filters.updated_at){delete rows[filters.id];sessionStorage.setItem('snapshot-test-media',JSON.stringify(rows));return resolve({data:[{id:filters.id}],error:null});}return resolve({data:[],error:null});}return resolve({data:single?(rows[filters.id]||null):Object.entries(rows).map(([id,r])=>({id,...r})),error:null});}if(write){if(table==='vocal_data')window.__legacySnapshotWrites.push(write);return resolve({data:[{user_id:'${U}'}],error:null});}return resolve({data:table==='vocal_data'?{payload:window.VZ?.db||window.__seed,updated_at:'2026-11-10T00:00:00Z'}:[],error:null});};return q;},storage:{from:()=>({})}
 })};`;
 page.__errors=[];page.on('pageerror',e=>page.__errors.push(e.message));
 await page.route('**/supabase.min.js',r=>r.fulfill({contentType:'application/javascript',body:stub}));
 await page.route('**/tus.min.js',r=>r.fulfill({contentType:'application/javascript',body:'window.tus={}'}));
 await page.route('**/r2-config.js*',r=>r.fulfill({contentType:'application/javascript',body:media?"window.VZIP_R2_ENDPOINT='https://delete-fixture.invalid';":"window.VZIP_R2_ENDPOINT='';"}));
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
   await remote.onSaved?.(q);
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

async function deletionFixture(page){
 const deleted=[];let remote;
 await page.route('https://delete-fixture.invalid/**',async route=>{
  const req=route.request(),url=new URL(req.url()),headers={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,DELETE,OPTIONS','access-control-allow-headers':'authorization,x-client-info,content-type'};
  if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(req.method()==='DELETE'){
   expect(remote.row.payload.deleted.media).toContain('chosen');
   deleted.push(decodeURIComponent(url.pathname.slice('/v1/media/'.length)));
   return route.fulfill({headers,json:{ok:true}});
  }
  return route.fulfill({headers,json:{}});
 });
 remote=await boot(page,{media:true});
 await page.evaluate(async owner=>{
  VZ.media.holdBackup(true);
  window.__fixtureMedia={};
  for(const id of ['chosen','other']){
   window.__fixtureMedia[id]={metadata:{id,name:id,storageProvider:'r2',r2Key:'u/'+owner+'/'+id+'/original.wav',type:'audio/wav',review:'keep '+id},updated_at:'2026-11-10T00:00:00Z'};
   await window.vzipStorePracticeMedia({id,name:id,created:Date.now(),type:'audio/wav',source:'practice',blob:new Blob([new Uint8Array(id==='chosen'?[1,2,3]:[9,8,7])],{type:'audio/wav'})});
  }
  sessionStorage.setItem('snapshot-test-media',JSON.stringify(window.__fixtureMedia));
  VZ.change(d=>{d.lessons.push({id:'lesson-files',date:'2026-11-10',memo:'keep lesson notes',recordings:[{id:'chosen'},{id:'other'}]});d.practices.push({id:'practice-files',date:'2026-11-10',manualMinutes:12,minutes:12,mediaIds:['chosen','other']});},{silent:true});
 },U);
 await sync(page);await expect.poll(()=>page.evaluate(()=>!VzipAccountScope.storage.getItem('vzip_account_dirty'))).toBe(true);
 expect(remote.row.payload.lessons.some(l=>l.id==='lesson-files')).toBe(true);
 return {remote,deleted};
}
test('Revision media deletion confirms server links before R2 cleanup and local-byte acknowledgement',async({page})=>{
 const {remote,deleted}=await deletionFixture(page);
 await page.evaluate(()=>VZ.media.remove({id:'chosen',cloud:true}));
 expect(deleted).toEqual(['u/'+U+'/chosen/original.wav']);
 expect(remote.row.payload.lessons.find(l=>l.id==='lesson-files')).toMatchObject({memo:'keep lesson notes',recordings:[{id:'other'}]});
 expect(remote.row.payload.practices.find(p=>p.id==='practice-files')).toMatchObject({manualMinutes:12,mediaIds:['other']});
 const result=await page.evaluate(async()=>({pending:window.vzipPendingMediaDeletes(),local:(await window.vzipReadMedia()).map(x=>x.id),metadata:window.__fixtureMedia,legacy:window.__legacySnapshotWrites}));
 expect(result.pending).toEqual([]);expect(result.local).toContain('other');expect(result.local).not.toContain('chosen');expect(result.metadata.other.metadata.review).toBe('keep other');expect(result.metadata.chosen).toBeUndefined();expect(result.legacy).toEqual([]);
});
test('Lost media-delete root reply preserves local bytes and resumes after reload in the same login',async({page})=>{
 const {remote,deleted}=await deletionFixture(page);remote.lose=true;
 const error=await page.evaluate(async()=>{try{await VZ.media.remove({id:'chosen',cloud:true});return null;}catch(e){return e.message;}});expect(error).toBeTruthy();
 expect(deleted).toEqual([]);expect(await page.evaluate(async()=>(await vzipReadMedia()).some(x=>x.id==='chosen'))).toBe(true);
 const pending=(await state(page)).pending;expect(pending.context.kind).toBe('media-delete');const original=remote.requests.find(r=>r.p_request_id===pending.id);
 remote.block=false;await page.reload();
 await expect.poll(()=>page.evaluate(()=>window.vzipPendingMediaDeletes().length),{timeout:20000}).toBe(0);
 expect(deleted).toEqual(['u/'+U+'/chosen/original.wav']);expect(remote.requests.filter(r=>r.p_request_id===pending.id)).toEqual([original,original]);
 expect(await page.evaluate(async()=>(await vzipReadMedia()).some(x=>x.id==='chosen'))).toBe(false);
 expect(await page.evaluate(async()=>(await vzipReadMedia()).some(x=>x.id==='other'))).toBe(true);
});
test('Media metadata changed during root save stays recoverable without deleting either local file',async({page})=>{
 const {remote,deleted}=await deletionFixture(page);
 remote.onSaved=()=>page.evaluate(()=>{window.__fixtureMedia.chosen.metadata.review='new other-device memo';window.__fixtureMedia.chosen.updated_at='2026-11-10T00:00:01Z';sessionStorage.setItem('snapshot-test-media',JSON.stringify(window.__fixtureMedia));});
 const error=await page.evaluate(async()=>{try{await VZ.media.remove({id:'chosen',cloud:true});return null;}catch(e){return e.code;}});expect(error).toBe('mediaChanged');
 expect(deleted).toEqual([]);expect(await page.evaluate(()=>window.__fixtureMedia.chosen.metadata.review)).toBe('new other-device memo');
 expect(await page.evaluate(async()=>(await vzipReadMedia()).map(x=>x.id))).toEqual(expect.arrayContaining(['chosen','other']));
 expect(await page.evaluate(()=>window.vzipPendingMediaDeletes()[0].phase)).toBe('root-confirmed');
});

test('Account handoff after cloud cleanup cannot delete a same-ID file from the next local account',async({page})=>{
 const {deleted}=await deletionFixture(page);
 const result=await page.evaluate(async()=>{
  const foreign='22222222-2222-4222-8222-222222222222',name='foreign-delete-fixture';
  const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore('recordings',{keyPath:'id'});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  await new Promise((resolve,reject)=>{const t=db.transaction('recordings','readwrite');t.objectStore('recordings').put({id:'chosen',accountOwner:foreign,bytes:new Uint8Array([99]).buffer});t.oncomplete=resolve;t.onerror=()=>reject(t.error);});
  const scope=window.VzipAccountScope,remove=window.vzipCloudMediaDelete;
  window.vzipCloudMediaDelete=async item=>{const out=await remove(item);window.VzipAccountScope={...scope,owner:foreign,mediaDb:()=>name};return out;};
  let error;try{await VZ.media.remove({id:'chosen',cloud:true,accountOwner:scope.owner});}catch(e){error=e.message;}
  window.VzipAccountScope=scope;window.vzipCloudMediaDelete=remove;VZ.media.holdBackup(true);
  const found=await new Promise((resolve,reject)=>{const t=db.transaction('recordings','readonly'),r=t.objectStore('recordings').get('chosen');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();
  return {error,foreignBytes:[...new Uint8Array(found.bytes)],originalLocal:(await vzipReadMedia()).map(x=>x.id),phase:window.vzipPendingMediaDeletes()[0]?.phase};
 });
 expect(result.error).toContain('계정');expect(result.foreignBytes).toEqual([99]);expect(result.originalLocal).toContain('chosen');expect(result.phase).toBe('cloud-complete');
 expect(deleted).toEqual(['u/'+U+'/chosen/original.wav']);
});
