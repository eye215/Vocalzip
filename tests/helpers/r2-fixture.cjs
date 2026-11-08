const {expect}=require('@playwright/test');
const KEY = 'vocal-zip_mvp_v1', R2 = 'https://r2.vocalzip.test';
const stub = `window.__vdStub=()=>{const c={q:{}};let upd=null,ins=null;for(const m of ['select','order','range','delete'])c[m]=()=>c;c.select=cols=>{c.cols=cols;return c};c.eq=(k,v)=>{c.q[k]=v;return c};c.is=c.eq;c.maybeSingle=()=>c;c.single=()=>c;c.update=r=>{upd=r;return c};c.insert=r=>{ins=r;return c};c.upsert=r=>{window.__vdRow={payload:r.payload,updated_at:r.updated_at};return c};c.then=r=>{const row=window.__vdRow||null;if(c.cols==='ids:payload->deleted->media')return r({data:row?{ids:row.payload?.deleted?.media??null}:null,error:null});if(ins){if(row)return r({data:null,error:{code:'23505',message:'duplicate'}});window.__vdRow={payload:ins.payload,updated_at:ins.updated_at};return r({data:null,error:null})}if(upd){if(!row||('updated_at' in c.q&&c.q.updated_at!==row.updated_at))return r({data:[],error:null});window.__vdRow={payload:upd.payload,updated_at:upd.updated_at};return r({data:[{user_id:'ui-test-user'}],error:null})}return r({data:row?JSON.parse(JSON.stringify(row)):null,error:null})};return c};window.__up=[];window.__removed=[];window.__rows=window.__rows||{};window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:fn=>{(window.__authHandlers||=[]).push(fn);return {data:{subscription:{unsubscribe(){}}}}},getSession:async()=>({data:{session:{access_token:'tok'}}})},
 storage:{from:()=>({createSignedUrl:async p=>({data:{signedUrl:'/legacy/'+p},error:null}),upload:async()=>({error:null}),remove:async p=>{window.__removed.push(...p);return {error:null}}})},
 from:t=>{if(t==='vocal_data')return window.__vdStub();const c={q:{}};for(const m of ['order'])c[m]=()=>c;c.delete=()=>{c.del=true;return c};c.range=(a,b)=>{c.r=[a,b];return c};c.select=cols=>{c.cols=cols||'*';return c};c.in=(k,v)=>{c.ins=v;return c};window.__upd=window.__upd||{};c.eq=(k,v)=>{c.q[k]=v;return c};c.is=(k,v)=>{c.q[k]=v;return c};
  c.upsert=(row,options)=>{window.__up.push(row);window.__beforeInsert?.(row);if(window.__failUpsert){c.err={message:'insert denied'};return c}const r=Array.isArray(row)?row:[row];for(const x of r)if(x&&x.metadata&&(!options?.ignoreDuplicates||!window.__rows[x.id])){window.__rows[x.id]=x.metadata;window.__upd[x.id]=x.updated_at||new Date().toISOString()}return c};
  c.update=row=>{c.pendingUpdate=row;return c};
  c.maybeSingle=()=>c;c.single=()=>c;
  c.then=r=>{if(c.err)return r({data:null,error:c.err});if(c.del&&c.q.id){const now=window.__upd[c.q.id]||null;if('updated_at' in c.q&&c.q.updated_at!==now)return r({data:[],error:null});const had=c.q.id in window.__rows;delete window.__rows[c.q.id];return r({data:had?[{id:c.q.id}]:[],error:null})}if(c.pendingUpdate&&c.q.id){window.__beforeWrite?.(c.q.id);const now=window.__upd[c.q.id]||null;if('updated_at' in c.q&&c.q.updated_at!==now){(window.__conflicts||=[]).push(c.q.id);return r({data:[],error:null})}window.__rows[c.q.id]=c.pendingUpdate.metadata;window.__upd[c.q.id]=c.pendingUpdate.updated_at;(window.__writes||=[]).push({id:c.q.id,metadata:c.pendingUpdate.metadata});return r({data:[{id:c.q.id}],error:null})}
   if(c.q.id&&window.__failReadAfterInsert&&window.__rows[c.q.id])return r({data:null,error:{message:'verification offline'}});
   if(c.q.id)return r({data:window.__rows[c.q.id]?{metadata:window.__rows[c.q.id],updated_at:window.__upd[c.q.id]||null}:null,error:null});
   // Like the server: at most 1,000 rows per request, pages by range.
   let all=Object.entries(window.__rows).map(([id,metadata])=>({id,metadata,updated_at:window.__upd[id]||'2026-11-05T09:00:00Z'}));
   if(c.ins)all=all.filter(x=>c.ins.includes(x.id));
   (window.__sel||=[]).push(String(c.cols||'*')+(c.ins?' in:'+c.ins.length:''));
   if(c.cols&&!/metadata/.test(c.cols))all=all.map(x=>({id:x.id,updated_at:x.updated_at}));
   const [a,b]=c.r||[0,999];return r({data:all.slice(a,Math.min(b+1,a+1000)),error:null})};return c}})};`;

function wav(seconds = 2, sr = 8000) {
  const n = sr * seconds, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 7) * 5000), 44 + i * 2);
  return b;
}
async function fakeR2(page, reject = {}) {
  const store = new Map(), uploads = new Map(), calls = [];
  await page.route(R2 + '/**', async route => {
    const req = route.request(), url = new URL(req.url()), p = url.pathname, method = req.method();
    calls.push(method + ' ' + p);
    const json = (body, status = 200) => route.fulfill({status, contentType:'application/json', headers:{'access-control-allow-origin':'*'}, body:JSON.stringify(body)});
    if (method === 'OPTIONS') return route.fulfill({status:204, headers:{'access-control-allow-origin':'*', 'access-control-allow-headers':'authorization, content-type, range, x-client-info, x-vzip-upload, x-vzip-proof', 'access-control-allow-methods':'GET, HEAD, POST, PUT, DELETE'}});
    if (p === '/health') return json({ok:true, bucket:true});
    if ((reject.auth || req.headers().authorization !== 'Bearer tok') && !url.searchParams.has('sig')) return json({error:'sign in required'}, 401);
    if (p === '/v1/me') return json({user:'ui-test-user',...(reject.resumable?{uploadContract:'merkle-v2'}:{})});
    if(reject.resumable&&p==='/v2/uploads'&&method==='POST'){
      const b=req.postDataJSON(),attempt=require('node:crypto').randomUUID(),id='v2-'+attempt;
      const descriptor={version:2,owner:'ui-test-user',mediaId:b.mediaId,key:'u/ui-test-user/'+b.mediaId+'/'+attempt+'/original.'+b.ext,uploadId:id,size:b.size,type:b.contentType,ext:b.ext,root:b.root,attempt};
      const ticket={descriptor,signature:'fixture-signed-upload'};
      uploads.set(id,{key:descriptor.key,type:b.contentType,parts:new Map(),ticket});
      return json({...ticket,partSize:8*1024*1024});
    }
    const v2part=p.match(/^\/v2\/uploads\/parts\/(\d+)$/);
    if(reject.resumable&&v2part){
      const ticket=JSON.parse(req.headers()['x-vzip-upload']||'null'),u=uploads.get(ticket?.descriptor?.uploadId),n=Number(v2part[1]);
      if(!u||JSON.stringify(u.ticket)!==JSON.stringify(ticket))return json({error:'invalid ticket'},403);
      if(store.has(u.key))return json({error:'complete'},409);
      if(reject.failPart===n){for(let i=0;i<1000&&!u.parts.has(1);i++)await new Promise(r=>setTimeout(r,1));return json({error:'offline'},503);}
      const bytes=req.postDataBuffer(),sha=value=>require('node:crypto').createHash('sha256').update(value).digest();
      if(!bytes)return json({error:'missing bytes'},400);
      const leaf=Buffer.alloc(41);leaf[0]=0;leaf.writeUInt32BE(n-1,1);leaf.writeUInt32BE(bytes.length,5);sha(bytes).copy(leaf,9);
      let digest=sha(leaf),position=n-1;
      for(const h of (req.headers()['x-vzip-proof']||'').split(',').filter(Boolean)){const sibling=Buffer.from(h,'hex');digest=sha(Buffer.concat([Buffer.from([1]),...(position%2?[sibling,digest]:[digest,sibling])]));position=Math.floor(position/2);}
      if(digest.toString('hex')!==u.ticket.descriptor.root)return json({error:'wrong original'},422);
      u.parts.set(n,bytes);return json({partNumber:n,etag:sha(bytes).toString('hex')});
    }
    if(reject.resumable&&(p==='/v2/uploads/status'||p==='/v2/uploads/complete')){
      const b=req.postDataJSON(),u=uploads.get(b.upload?.descriptor?.uploadId);
      if(!u||JSON.stringify(u.ticket)!==JSON.stringify(b.upload))return json({error:'invalid ticket'},403);
      let object=store.get(u.key);
      if(!object&&p.endsWith('/complete')){
        if(b.parts?.length!==Math.ceil(u.ticket.descriptor.size/(8*1024*1024))||b.parts.some((x,i)=>x.partNumber!==i+1||!u.parts.has(x.partNumber)))return json({error:'invalid parts'},400);
        const bytes=Buffer.concat([...u.parts.entries()].sort((a,b)=>a[0]-b[0]).map(x=>x[1]));
        if(bytes.length!==u.ticket.descriptor.size)return json({error:'wrong size'},422);
        const etag='"'+require('node:crypto').createHash('sha256').update(bytes).digest('hex')+'"';
        object={bytes,type:u.type,etag,root:u.ticket.descriptor.root};store.set(u.key,object);
        if(reject.loseComplete){reject.loseComplete=false;return route.abort('connectionfailed');}
      }
      return json(object?{status:'complete',key:u.key,size:object.bytes.length,etag:object.etag,root:object.root}:{status:'pending'});
    }
    if (p === '/v1/uploads' && method === 'POST') {
      const b = req.postDataJSON(), key = 'u/ui-test-user/' + b.mediaId + '/original.' + b.ext, id = 'up' + uploads.size;
      uploads.set(id, {key, type:b.contentType, parts:new Map()});
      return json({key, uploadId:id, partSize:8 * 1024 * 1024});
    }
    let m;
    if ((m = p.match(/^\/v1\/uploads\/([^/]+)\/parts\/(\d+)$/))) { uploads.get(m[1]).parts.set(Number(m[2]), req.postDataBuffer()); return json({partNumber:Number(m[2]), etag:'e' + m[2]}); }
    if ((m = p.match(/^\/v1\/uploads\/([^/]+)\/complete$/))) {
      const u = uploads.get(m[1]), bytes = Buffer.concat([...u.parts.entries()].sort((a, b) => a[0] - b[0]).map(x => x[1]));
      const etag='"'+require('node:crypto').createHash('sha256').update(bytes).digest('hex')+'"';
      store.set(u.key, {bytes, type:u.type, etag}); return json({key:u.key, size:bytes.length, etag});
    }
    if (p === '/v1/sign') { const b = req.postDataJSON(), exp = Math.floor(Date.now() / 1000) + 3 * 3600;
      if (Array.isArray(b.keys)) { calls.push('BATCH ' + b.keys.length); return json({urls:Object.fromEntries(b.keys.map(k => [k, R2 + '/v1/media/' + k + '?exp=' + exp + '&sig=s'])), expires:exp}); }
      return json({url:R2 + '/v1/media/' + b.key + '?exp=' + exp + '&sig=s', expires:exp}); }
    if (p.startsWith('/v1/media/')) {
      if(method==='GET')await reject.beforeRead?.(req);
      if(reject.requireProtocol&&req.headers()['x-client-info']!=='vocalzip-device-session-v2')return json({error:'protocol required'},401);
      const key = decodeURIComponent(p.slice(10)), o = store.get(key);
      if (method === 'DELETE') { store.delete(key); return json({ok:true}); }
      if (!o) return json({error:'file not found'}, 404);
      const range = (req.headers().range || '').match(/^bytes=(\d+)-(\d+)$/);
      if (range) return route.fulfill({status:206, contentType:o.type, headers:{'access-control-allow-origin':'*', 'access-control-expose-headers':'content-range, content-length, etag', etag:o.etag, 'content-range':'bytes ' + range[1] + '-' + range[2] + '/' + o.bytes.length}, body:o.bytes.subarray(Number(range[1]), Number(range[2]) + 1)});
      return route.fulfill({status:200, contentType:o.type, headers:{'access-control-allow-origin':'*', 'accept-ranges':'bytes', etag:o.etag}, body:o.bytes});
    }
    if (p === '/v1/usage') return json({objects:store.size, bytes:[...store.values()].reduce((s, o) => s + o.bytes.length, 0)});
    if (p === '/v1/objects' && !reject.list) return json({objects:[...store.entries()].map(([key, o]) => ({key, size:o.bytes.length, uploaded:'2026-11-05T10:00:00.000Z', mediaId:key.split('/')[2]})), cursor:null});
    return json({error:'not found'}, 404);
  });
  return {store, calls, reject};
}
async function boot(page, {endpoint = R2} = {}) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:'window.VZIP_R2_ENDPOINT=' + JSON.stringify(endpoint) + ';'}));
  if (process.env.VZ_MEDIABUNNY) await page.context().route('**/mediabunny@1.65.1/dist/bundles/mediabunny.min.mjs', r => r.fulfill({path:process.env.VZ_MEDIABUNNY, contentType:'text/javascript'}));
  page.on('dialog', d => d.accept());
  await page.addInitScript(([k]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, JSON.stringify({categories:[], songs:[{id:'s1', title:'Defying Gravity'}], lessons:[], assignments:[], practices:[], comparisonReports:[]})); sessionStorage.setItem('seeded', '1'); } }, [KEY]);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => !!window.vzipCloudSignedIn?.())).toBe(true);
}

module.exports={KEY,R2,stub,boot,fakeR2,wav};
