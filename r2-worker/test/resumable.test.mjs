import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {Miniflare} from 'miniflare';
import {handleUploadV2} from '../src/resumable.mjs';
const require=createRequire(import.meta.url),client=require('../../r2-resumable-upload.js');
const uid='11111111-1111-4111-8111-111111111111',bob='22222222-2222-4222-8222-222222222222';
const secret='resumable-test-secret-not-production',root='https://session.test',protocol='vocalzip-device-session-v2';
let mf,active=true,unavailable=false;
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function token(owner=uid){const text=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:owner,session_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',iss:root+'/auth/v1',exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'});return text+'.'+createHmac('sha256',secret).update(text).digest('base64url');}
before(async()=>{
 mf=new Miniflare({modules:true,scriptPath:fileURLToPath(new URL('../src/index.js',import.meta.url)),compatibilityDate:'2025-01-01',r2Buckets:['MEDIA'],
  bindings:{SUPABASE_URL:root,SUPABASE_ANON_KEY:'public-test-only',SUPABASE_JWT_SECRET:secret,SIGNING_SECRET:secret,SESSION_GUARD_ENABLED:'true',UPLOADS_V2_ENABLED:'true',ALLOWED_ORIGINS:'https://app.test'},
  outboundService:async req=>{
   if(unavailable)return new Response('{}',{status:503});
   const jwt=(req.headers.get('authorization')||'').split(' ')[1];
   const claims=JSON.parse(Buffer.from(jwt.split('.')[1],'base64url'));
   return Response.json({user_id:claims.sub,allowed:active&&req.headers.get('x-client-info')===protocol,required:true,playback_token:null});
  }});
});
after(()=>mf?.dispose());
async function call(path,{method='GET',body,headers={},owner=uid}={}){
 const h={authorization:'Bearer '+token(owner),'x-client-info':protocol,...headers};
 if(body instanceof Blob)body=new Uint8Array(await body.arrayBuffer());
 if(body instanceof Uint8Array)h['content-length']=String(body.length);
 else if(body!==undefined){body=JSON.stringify(body);h['content-type']='application/json';}
 return mf.dispatchFetch('https://media.test'+path,{method,headers:h,body});
}
const data=n=>Uint8Array.from({length:n},(_,i)=>(i*31+9)%256);
async function start(id,bytes){
 const file=new File([bytes],'test.wav',{type:'audio/wav'}),manifest=await client.inspect(file),levels=await client.tree(manifest);
 const response=await call('/v2/uploads',{method:'POST',body:{mediaId:id,contentType:file.type,size:file.size,ext:'wav',root:manifest.root}});
 assert.equal(response.status,200,await response.clone().text());const upload=await response.json();
 return {file,manifest,levels,upload:{descriptor:upload.descriptor,signature:upload.signature},partSize:upload.partSize};
}
async function part(s,n,body){
 return call('/v2/uploads/parts/'+n,{method:'PUT',body:body||s.file.slice((n-1)*client.PART_SIZE,n*client.PART_SIZE),
  headers:{'x-vzip-upload':JSON.stringify(s.upload),'x-vzip-proof':client.proof(s.levels,n-1).join(',')}});
}
async function complete(s){
 const parts=[];for(let n=1;n<=s.manifest.hashes.length;n++){const r=await part(s,n);assert.equal(r.status,200,await r.clone().text());parts.push(await r.json());}
 const response=await call('/v2/uploads/complete',{method:'POST',body:{upload:s.upload,parts}});
 assert.equal(response.status,200,await response.clone().text());return {parts,done:await response.json()};
}
test('registered active session is required before any new upload; outages fail closed',async()=>{
 assert.equal((await call('/v1/me')).status,200);
 assert.equal((await (await call('/v1/me')).json()).uploadContract,'merkle-v2');
 active=false;assert.equal((await call('/v2/uploads',{method:'POST',body:{}})).status,401);active=true;
 unavailable=true;assert.equal((await call('/v2/uploads',{method:'POST',body:{}})).status,503);unavailable=false;
});
test('two uploads with the same media ID preserve both attempts and the existing original',async()=>{
 const bucket=await mf.getR2Bucket('MEDIA'),legacy='u/'+uid+'/same-id/original.wav',old=data(29);
 await bucket.put(legacy,old);
 const a=await start('same-id',data(10)),b=await start('same-id',data(11));
 assert.notEqual(a.upload.descriptor.key,b.upload.descriptor.key);
 const one=await complete(a),two=await complete(b);
 assert.equal(one.done.size,10);assert.equal(two.done.size,11);
 assert.deepEqual(new Uint8Array(await (await bucket.get(legacy)).arrayBuffer()),old);
 assert.deepEqual(new Uint8Array(await (await bucket.get(one.done.key)).arrayBuffer()),data(10));
 assert.deepEqual(new Uint8Array(await (await bucket.get(two.done.key)).arrayBuffer()),data(11));
});
test('real Workers SHA-256 proof accepts all parts, including an odd Merkle leaf',async()=>{
 const bytes=data(2*client.PART_SIZE+19),s=await start('three-parts',bytes),out=await complete(s);
 const bucket=await mf.getR2Bucket('MEDIA'),stored=await bucket.get(out.done.key);
 assert.equal(createHash('sha256').update(Buffer.from(await stored.arrayBuffer())).digest('hex'),createHash('sha256').update(bytes).digest('hex'));
});
test('same-sized wrong bytes and wrong-position proofs cannot change a part',async()=>{
 const s=await start('wrong-proof',data(client.PART_SIZE+31));
 const wrong=new Uint8Array(await s.file.slice(0,client.PART_SIZE).arrayBuffer());wrong[3]^=255;
 assert.equal((await part(s,1,wrong)).status,422);
 const request=await call('/v2/uploads/parts/2',{method:'PUT',body:s.file.slice(client.PART_SIZE),
  headers:{'x-vzip-upload':JSON.stringify(s.upload),'x-vzip-proof':client.proof(s.levels,0).join(',')}});
 assert.equal(request.status,422);
 assert.equal((await part(s,1)).status,200);
});
test('tampered descriptor and another owner cannot read or complete the attempt',async()=>{
 const s=await start('owner-bound',data(7));
 for(const upload of [{...s.upload,signature:'wrong'}, {...s.upload,descriptor:{...s.upload.descriptor,size:8}}, {...s.upload,descriptor:{...s.upload.descriptor,root:'0'.repeat(64)}}])
  assert.equal((await call('/v2/uploads/status',{method:'POST',body:{upload}})).status,403);
 assert.notEqual((await call('/v2/uploads/status',{method:'POST',owner:bob,body:{upload:s.upload}})).status,200);
});
test('completion is replayable, refuses incomplete manifests, and cannot overwrite a completed attempt',async()=>{
 const s=await start('complete-retry',data(9));
 assert.equal((await call('/v2/uploads/complete',{method:'POST',body:{upload:s.upload,parts:[]}})).status,400);
 const out=await complete(s);
 const replay=await call('/v2/uploads/complete',{method:'POST',body:{upload:s.upload,parts:out.parts}});
 assert.equal(replay.status,200);assert.deepEqual(await replay.json(),out.done);
 assert.equal((await part(s,1)).status,409);
});
test('paused uploads still allow verification of an already completed attempt',async()=>{
 const s=await start('paused-complete',data(13)),out=await complete(s),bucket=await mf.getR2Bucket('MEDIA'),head=await bucket.head(out.done.key);
 const env={SESSION_GUARD_ENABLED:'true',UPLOADS_V2_ENABLED:'false',MEDIA:{head:async()=>head}};
 const helpers={fail:(status,message)=>{throw Object.assign(Error(message),{status});},json:body=>Response.json(body),sign:text=>Promise.resolve(createHmac('sha256',secret).update(text).digest('base64url')),equal:(a,b)=>a===b,assertSession:async()=>{}};
 const request=new Request('https://media.test/v2/uploads/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({upload:s.upload,parts:out.parts})});
 assert.deepEqual(await (await handleUploadV2(request,env,uid,helpers)).json(),out.done);
});
function fixture(){
 const map=new Map(),calls=[],contexts=[];let id={owner:uid,session:'session-a',endpoint:'https://media.test'},hook=async()=>{};
 const storage={get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};
 const options={storage,identity:()=>id,onReceipt:async(context,receipt)=>{contexts.push({context,receipt});},
  api:async(path,opts)=>{calls.push(path);const response=await call(path,opts);const value=await response.json();await hook(path,response,value);if(!response.ok)throw Object.assign(Error(value.error),{status:response.status});return value;}};
 return {map,calls,contexts,storage,options,client:client.create(options),identity:value=>{id=value;},hook:value=>{hook=value;}};
}
function argumentsFor(id,file){return {mediaId:id,type:file.type,ext:'wav',context:{kind:'library',metadata:{id,name:'원래 녹음',songId:'song-a',recordedDate:'2026-10-05',type:file.type,size:file.size}}};}
test('lost completion reply survives reload and is recovered without any source file',async()=>{
 const f=fixture(),file=new File([data(17)],'test.wav',{type:'audio/wav'}),args=argumentsFor('lost-complete',file);let lost=false;
 f.hook((path,response)=>{if(path.endsWith('/complete')&&response.ok&&!lost){lost=true;throw Error('response lost');}});
 await assert.rejects(f.client.upload(file,args),/response lost/);
 assert.equal(f.client.pending()[0].parts.length,1);f.hook(async()=>{});
 const recovered=await client.create(f.options).finish(args.mediaId);
 assert.equal(recovered.status,'complete');assert.equal(recovered.context.metadata.songId,'song-a');
 assert.equal(f.calls.filter(p=>p==='/v2/uploads').length,1);assert.equal(f.calls.filter(p=>p.includes('/parts/')).length,1);
 assert.equal(f.contexts.length,1);assert.equal(f.client.pending().length,1);
 f.client.acknowledge(args.mediaId,{storageProvider:'r2',r2Key:recovered.receipt.key,size:file.size,r2Etag:recovered.receipt.etag});assert.equal(f.map.size,0);
});
test('retry skips acknowledged parts and preserves original metadata',async()=>{
 const f=fixture(),file=new File([data(client.PART_SIZE+23)],'test.wav',{type:'audio/wav'}),args=argumentsFor('resume-parts',file);let paused=true;
 f.hook(async path=>{if(paused&&path.endsWith('/parts/2')){for(let i=0;i<2000&&!f.client.pending()[0]?.parts.some(p=>p.partNumber===1);i++)await new Promise(r=>setTimeout(r,1));throw Error('offline');}});
 await assert.rejects(f.client.upload(file,args),/offline/);assert.equal(f.client.pending()[0].parts.length,1);paused=false;
 const out=await client.create(f.options).upload(file,{...args,context:{...args.context,metadata:{...args.context.metadata,name:'다른 이름'}}});
 assert.equal(out.size,file.size);assert.equal(f.calls.filter(p=>p.endsWith('/parts/1')).length,1);
 assert.equal(f.contexts.at(-1).context.metadata.name,'원래 녹음');
});
test('a different file cannot resume even when name and size match',async()=>{
 const f=fixture(),file=new File([data(client.PART_SIZE+23)],'same.wav',{type:'audio/wav'}),args=argumentsFor('different-file',file);
 f.hook(path=>{if(path.endsWith('/parts/2'))throw Error('offline');});await assert.rejects(f.client.upload(file,args),/offline/);f.hook(async()=>{});
 const bad=new Uint8Array(await file.arrayBuffer());bad[0]^=255;const before=f.calls.length;
 await assert.rejects(client.create(f.options).upload(new File([bad],'same.wav',{type:'audio/wav'}),args),{code:'source_changed'});
 assert.equal(f.calls.slice(before).some(p=>p.includes('/parts/')),false);
});
test('local quota failure occurs before any upload is initialized',async()=>{
 const f=fixture();f.storage.setItem=()=>{throw Object.assign(Error('full'),{name:'QuotaExceededError'});};
 const file=new File([data(3)],'q.wav',{type:'audio/wav'});
 await assert.rejects(f.client.upload(file,argumentsFor('quota-before',file)),{name:'QuotaExceededError'});assert.equal(f.calls.length,0);
});
test('same account new session stops the old writer and a new client can resume',async()=>{
 const f=fixture(),file=new File([data(5)],'session.wav',{type:'audio/wav'});
 f.hook(path=>{if(path==='/v2/uploads')f.identity({owner:uid,session:'session-b',endpoint:'https://media.test'});});
 await assert.rejects(f.client.upload(file,argumentsFor('session-change',file)),{code:'identity'});
 assert.equal(f.calls.some(p=>p.includes('/parts/')),false);assert.equal(f.map.size,1);
 f.hook(async()=>{});assert.equal((await client.create(f.options).upload(file,argumentsFor('session-change',file))).size,5);
});
test('a foreign account or endpoint cannot adopt the pending upload',async()=>{
 const f=fixture(),file=new File([data(5)],'foreign.wav',{type:'audio/wav'});f.hook(()=>{throw Error('offline');});
 await assert.rejects(f.client.upload(file,argumentsFor('foreign',file)),/offline/);
 f.identity({owner:bob,session:'session-b',endpoint:'https://media.test'});assert.deepEqual(client.create(f.options).pending(),[]);
 assert.throws(()=>f.client.pending(),{code:'identity'});assert.equal(f.map.size,1);
});
test('hashing and sending never require a whole-file arrayBuffer',async()=>{
 const f=fixture(),original=new File([data(client.PART_SIZE+13)],'bounded.wav',{type:'audio/wav'}),sizes=[];
 const file={size:original.size,type:original.type,arrayBuffer:()=>{throw Error('whole file read');},slice:(a,b)=>{sizes.push(b-a);assert.ok(b-a<=client.PART_SIZE);return original.slice(a,b);}};
 await f.client.upload(file,argumentsFor('bounded-file',file));assert.ok(sizes.length>=4);assert.ok(sizes.every(n=>n<=client.PART_SIZE));
});

test('a known completion etag cannot silently change during later recovery',async()=>{
 const f=fixture(),file=new File([data(19)],'known.wav',{type:'audio/wav'}),args=argumentsFor('known-etag',file);
 const receipt=await f.client.upload(file,args),bucket=await mf.getR2Bucket('MEDIA'),head=await bucket.head(receipt.key);
 const changed=data(19);changed[0]^=255;
 await bucket.put(receipt.key,changed,{httpMetadata:head.httpMetadata,customMetadata:head.customMetadata});
 await assert.rejects(client.create(f.options).finish(args.mediaId),{code:'object_changed'});
 assert.equal(f.client.pending()[0].receipt.etag,receipt.etag);
});
