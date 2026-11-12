const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {boot,fakeR2,wav,R2}=require('./helpers/r2-fixture.cjs');
const SID='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',OTHER='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const owner='ui-test-user',key='u/'+owner+'/voice/'+OTHER+'/original.wav';
const cors={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type,x-client-info','access-control-allow-methods':'GET,POST,OPTIONS'};
test.afterEach(async({page})=>expect(page.__errors||[]).toEqual([]));
async function setup(page,options={}){
 const r2=await fakeR2(page),bytes=wav(1),requests=[],receipts=new Map();
 const state={mode:options.mode||'revision',n:123456,applied:0,at:'2026-11-10T00:00:00.123456Z',
  metadata:{id:'voice',name:'Defying Gravity 2026.11.10',nameMode:'auto',autoName:'Defying Gravity 2026.11.10',
   songId:'s1',song:'Defying Gravity',recordedDate:'2026-11-10',created:Date.parse('2026-11-10T00:00:00Z'),
   review:'keep memo',rating:3,durationSeconds:1,originalFilename:'original.wav',storageProvider:'r2',r2Key:key,r2Etag:'"original"',size:bytes.length,type:'audio/wav'}};
 r2.store.set(key,{bytes,type:'audio/wav',etag:'"original"'});
 const sync=()=>page.evaluate(({m,at})=>{window.__rows.voice=m;window.__upd.voice=at;},{m:state.metadata,at:state.at});
 await page.route(R2+'/v1/me',route=>route.fulfill({headers:cors,contentType:'application/json',body:JSON.stringify({user:owner,mediaMode:state.mode})}));
 await page.route(R2+'/v2/media/edit',async route=>{
  if(route.request().method()==='OPTIONS')return route.fulfill({headers:cors,status:204});
  const body=route.request().postDataJSON();requests.push(body);
  const reply=(data,status=200)=>route.fulfill({headers:cors,status,contentType:'application/json',body:JSON.stringify(data)});
  if(state.mode!=='revision')return reply({error:'not revision'},423);
  let receipt=receipts.get(body.requestId),replayed=!!receipt;
  if(!receipt){
   if(body.updatedAt!==state.at||body.key!==key)return reply({error:'newer metadata'},409);
   state.metadata={...state.metadata,...body.patch};state.at='2026-11-10T00:00:00.'+String(++state.n).padStart(6,'0')+'Z';state.applied++;
   receipt={body:JSON.stringify(body),at:state.at};receipts.set(body.requestId,receipt);await sync();
  }else if(receipt.body!==JSON.stringify(body))return reply({error:'changed request'},409);
  if(options.loseOnce){options.loseOnce=false;return route.abort('failed');}
  if(options.slowOnce){options.slowOnce=false;await new Promise(r=>setTimeout(r,17000));}
  const value={version:1,user_id:owner,session_id:SID,request_id:body.requestId,id:'voice',object_key:key,metadata:state.metadata,
   updated_at:state.at,applied_updated_at:receipt.at,replayed,superseded:state.at!==receipt.at};
  try{return await reply(value);}catch{}
 });
 await boot(page);await page.evaluate(()=>window.VZ.media.list(true));
 const enable=()=>page.evaluate(sid=>{window.vzipCloudSessionId=()=>sid;window.VZIP_SNAPSHOT_REVISION_ENABLED=true;},SID);
 await enable();await sync();
 const item=async()=>page.evaluate(async()=>{const rows=await window.VZ.media.list(true);return rows.find(r=>r.id==='voice');});
 const change=async patch=>{state.metadata={...state.metadata,...patch};state.at='2026-11-10T00:00:00.'+String(++state.n).padStart(6,'0')+'Z';await sync();};
 return {r2,state,requests,receipts,bytes,item,enable,change};
}
async function update(page,item,changes){
 return page.evaluate(async({item,changes})=>{try{return {saved:await window.VZ.media.update(item,changes)};}catch(e){return {error:e.message,code:e.code||e.status};}},{item,changes});
}
test('existing media update uses one durable server CAS and preserves the original, root and unedited notes',async({page})=>{
 const f=await setup(page),item=await f.item(),root=await page.evaluate(()=>JSON.stringify(window.VZ.db));
 expect(item.cloudEditBase).toBeTruthy();
 const out=await update(page,item,{rating:5});
 expect(out.saved.rating).toBe(5);expect(f.requests).toHaveLength(1);expect(f.requests[0].updatedAt).toBe('2026-11-10T00:00:00.123456Z');
 expect(f.requests[0].patch).toEqual({rating:5});expect(f.state.metadata.review).toBe('keep memo');
 expect(await page.evaluate(()=>window.__writes||[])).toHaveLength(0);
 expect(await page.evaluate(()=>window.vzipPendingMediaEdits())).toHaveLength(0);
 expect(await page.evaluate(()=>JSON.stringify(window.VZ.db))).toBe(root);
 expect(f.r2.store.get(key).bytes.equals(f.bytes)).toBe(true);
 expect(f.r2.calls.some(c=>c.startsWith('DELETE')||c.includes('/uploads'))).toBe(false);
});
test('changing date keeps the existing automatic title rule and all naming fields in one request',async({page})=>{
 const f=await setup(page),item=await f.item(),created=Date.parse('2026-11-09T02:00:00Z');
 const out=await update(page,item,{recordedDate:'2026-11-09',dateSource:'manual',created});
 expect(out.saved.name).toBe('Defying Gravity 2026.11.09');
 expect(f.requests[0].patch).toMatchObject({recordedDate:'2026-11-09',dateSource:'manual',created,nameMode:'auto',autoName:out.saved.name});
 expect(f.state.metadata.review).toContain('keep memo');expect(f.state.metadata.review).toContain('이전 제목:');
 expect(f.state.metadata.r2Key).toBe(key);
});
test('a stale displayed version conflicts once and keeps both the latest remote value and the pending input',async({page})=>{
 const f=await setup(page),item=await f.item();await f.change({review:'다른 기기 후기'});
 const out=await update(page,item,{review:'이 기기 후기'});expect(out.code).toBe(409);expect(f.requests).toHaveLength(1);
 expect(f.state.metadata.review).toBe('다른 기기 후기');
 const pending=await page.evaluate(()=>window.vzipPendingMediaEdits());expect(pending).toHaveLength(1);
 expect(pending[0].state).toBe('conflict');expect(pending[0].request.patch.review).toBe('이 기기 후기');
 const retry=await update(page,item,{review:'이 기기 후기'});expect(retry.code).toBe('conflict');expect(f.requests).toHaveLength(1);
 expect(await page.evaluate(()=>window.__writes||[])).toHaveLength(0);
});
test('repeating Save after response loss confirms the same operation without writing twice',async({page})=>{
 const f=await setup(page,{loseOnce:true}),item=await f.item();
 expect((await update(page,item,{review:'보존할 후기'})).error).toBeTruthy();
 expect(await page.evaluate(()=>window.vzipPendingMediaEdits())).toHaveLength(1);
 const out=await update(page,item,{review:'보존할 후기'});expect(out.saved.review).toBe('보존할 후기');
 expect(f.requests).toHaveLength(2);expect(f.requests[1]).toEqual(f.requests[0]);expect(f.state.applied).toBe(1);
 expect(await page.evaluate(()=>window.vzipPendingMediaEdits())).toHaveLength(0);
});
test('reload retains the original request and an explicit result check works without a form snapshot',async({page})=>{
 const f=await setup(page,{loseOnce:true}),item=await f.item();await update(page,item,{review:'다시 확인'});
 const before=f.requests[0];await page.reload();await expect.poll(()=>page.evaluate(()=>!!window.vzipCloudSignedIn?.())).toBe(true);await f.enable();
 const saved=await page.evaluate(()=>window.vzipCloudMediaRetryEdit('voice'));expect(saved.review).toBe('다시 확인');
 expect(f.requests[1]).toEqual(before);expect(f.state.applied).toBe(1);
});
test('a superseded reply is never applied to the form as successful and the old intent remains',async({page})=>{
 const f=await setup(page,{loseOnce:true}),item=await f.item();await update(page,item,{review:'내 입력'});
 await f.change({review:'이후 수정'});
 const out=await page.evaluate(async()=>{try{await window.vzipCloudMediaRetryEdit('voice');return {};}catch(e){return {code:e.code};}});
 expect(out.code).toBe('superseded');expect(f.state.metadata.review).toBe('이후 수정');
 const pending=await page.evaluate(()=>window.vzipPendingMediaEdits());
 expect(pending[0].request.patch.review).toBe('내 입력');expect(pending[0].state).toBe('superseded');
});
test('mode off with pending input, paused mode and a new login never fall back to direct metadata writes',async({page})=>{
 const f=await setup(page,{loseOnce:true}),item=await f.item();await update(page,item,{review:'pending'});
 await page.evaluate(()=>window.VZIP_SNAPSHOT_REVISION_ENABLED=false);
 expect((await update(page,item,{rating:5})).error).toBeTruthy();expect(await page.evaluate(()=>window.__writes||[])).toHaveLength(0);
 await f.enable();await page.evaluate(sid=>{window.vzipCloudSessionId=()=>sid;},OTHER);
 const old=await page.evaluate(async()=>{try{await window.vzipCloudMediaRetryEdit('voice');return '';}catch(e){return e.code;}});
 expect(old).toBe('previous_session');expect(f.requests).toHaveLength(1);
});
test('confirmed legacy accounts retain their current edit behavior even when the app gate is on',async({page})=>{
 const f=await setup(page,{mode:'legacy'}),item=await f.item();
 const out=await update(page,item,{rating:4});expect(out.saved.rating).toBe(4);expect(f.requests).toHaveLength(0);
 expect(await page.evaluate(()=>window.__writes||[])).toHaveLength(1);
});
test('song assignment uses its captured version, and revision mode refuses physical legacy cleanup before removal',async({page})=>{
 const f=await setup(page),item=await f.item();
 const result=await page.evaluate(async item=>window.VZ.media.assignSongSafe(item,{songId:'',song:''},{expectedSongId:'s1',expectedSong:'Defying Gravity'}),item);
 expect(result.updatedAt).toMatch(/\.\d{6}Z$/);expect(f.requests[0].patch).toMatchObject({songId:'',song:''});
 const cleanup=await page.evaluate(async item=>{try{await window.vzipCloudLegacyCleanup(item);return '';}catch(e){return e.message;}},item);
 expect(cleanup).toContain('인수');expect(await page.evaluate(()=>window.__removed)).toEqual([]);
 expect(f.r2.store.get(key).bytes.equals(f.bytes)).toBe(true);
});
test('local stale form fields do not overwrite unedited cloud notes, and local bytes are preserved',async({page})=>{
 const f=await setup(page);
 await page.evaluate(async({m,bytes})=>window.vzipStorePracticeMedia({...m,review:'old local',blob:new Blob([new Uint8Array(bytes)],{type:'audio/wav'})}),{m:f.state.metadata,bytes:[...f.bytes]});
 const item=await f.item();expect(item.review).toBe('old local');expect(item.cloudEditBase).toBeTruthy();
 const out=await update(page,item,{review:item.review,rating:5});expect(out.saved.rating).toBe(5);
 expect(f.requests[0].patch).toEqual({rating:5});expect(f.state.metadata.review).toBe('keep memo');
 const bytes=await page.evaluate(async()=>{const item=(await window.vzipReadMedia()).find(m=>m.id==='voice');return [...new Uint8Array(await window.vzipMediaBlob(item).arrayBuffer())];});
 expect(Buffer.from(bytes).equals(f.bytes)).toBe(true);
});
test('paused capability lookup does not silently use the legacy update path',async({page})=>{
 const f=await setup(page),item=await f.item();f.state.mode='paused';
 expect((await update(page,item,{rating:5})).error).toBeTruthy();expect(f.requests).toHaveLength(0);
 expect(await page.evaluate(()=>window.__writes||[])).toHaveLength(0);
});
test('quota prevents the POST and preserves original metadata',async({page})=>{
 const f=await setup(page),item=await f.item();
 await page.evaluate(()=>{window.__originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('vzip_media_edit_v1:'))throw new DOMException('quota','QuotaExceededError');return window.__originalSet.call(this,k,v);};});
 const out=await update(page,item,{review:'not sent'});expect(out.error).toContain('quota');expect(f.requests).toHaveLength(0);
 expect(f.state.metadata.review).toBe('keep memo');
});

test('ambiguous metadata input blocks deletion before any original or root is removed',async({page})=>{
 const f=await setup(page,{loseOnce:true}),item=await f.item();await update(page,item,{review:'pending delete protection'});
 const out=await page.evaluate(async item=>{try{await window.vzipCloudMediaDelete(item);return '';}catch(e){return e.message;}},item);
 expect(out).toContain('미완료 파일 수정');expect(f.r2.calls.some(c=>c.startsWith('DELETE'))).toBe(false);
 expect(await page.evaluate(()=>window.__removed)).toEqual([]);expect(f.r2.store.get(key).bytes.equals(f.bytes)).toBe(true);
 expect(await page.evaluate(()=>window.vzipPendingMediaEdits())).toHaveLength(1);
});

test('a library above 2000 files retains the first displayed recording version instead of evicting it during listing',async({page})=>{
 const f=await setup(page);
 await page.evaluate(({base,at})=>{
  for(let i=0;i<2105;i++){const id='extra-'+i;window.__rows[id]={...base,id,r2Key:base.r2Key.replace('/voice/','/'+id+'/')};window.__upd[id]=at;}
 },{base:f.state.metadata,at:f.state.at});
 const item=await f.item();expect(item.cloudEditBase).toBeTruthy();
 const out=await update(page,item,{rating:5});expect(out.saved.rating).toBe(5);expect(f.requests).toHaveLength(1);
 expect(await page.evaluate(()=>Object.keys(window.__rows).length)).toBe(2106);
});
