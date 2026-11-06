import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import worker from '../src/index.js';
const uid='11111111-1111-4111-8111-111111111111',secret='fake-local-test-secret';
function token(){
 const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const body=enc({alg:'HS256'})+'.'+enc({sub:uid,role:'authenticated',aud:'authenticated',iss:'https://demo.supabase.co/auth/v1',exp:Math.floor(Date.now()/1000)+300});
 return body+'.'+createHmac('sha256',secret).update(body).digest('base64url');
}
function fixture(overrides={}){
 let reads=0,transforms=0,options;
 const env={SUPABASE_URL:'https://demo.supabase.co',SUPABASE_JWT_SECRET:secret,
  STT_CLIP_ENABLED:'true',STT_CLIP_ALLOWED_USER_IDS:uid,
  MEDIA:{get:async()=>{reads++;return {body:new Blob(['fake source']).stream(),size:11}}},
  MEDIA_TRANSFORM:{input:()=>({output:o=>{transforms++;options=o;return {response:async()=>new Response('fake clip')}}})},...overrides};
 return {call:(key='u/'+uid+'/m/original.m4a',query='')=>worker.fetch(new Request('https://local.test/v1/clip/'+key+query,{headers:{Authorization:'Bearer '+token()}}),env,{}),counts:()=>({reads,transforms}),options:()=>options};
}
test('normal M4A succeeds and requests exactly a 30 second transform',async()=>{
 const f=fixture(),res=await f.call();assert.equal(res.status,200);assert.equal(await res.text(),'fake clip');
 assert.deepEqual(f.options(),{mode:'audio',time:'20s',duration:'30s',format:'m4a'});
});
test('disabled or non-allowlisted users never read R2 or transform',async()=>{
 for(const [env,status] of [[{STT_CLIP_ENABLED:undefined},503],[{STT_CLIP_ALLOWED_USER_IDS:''},403]]){
  const f=fixture(env);assert.equal((await f.call()).status,status);assert.deepEqual(f.counts(),{reads:0,transforms:0});
 }
});
test('foreign keys, invalid intervals and unsupported types never transform',async()=>{
 for(const [key,query,status] of [['u/other/m/original.m4a','',403],['u/'+uid+'/m/original.wav','',415],['u/'+uid+'/m/original.m4a','?duration=31',400]]){
  const f=fixture();assert.equal((await f.call(key,query)).status,status);assert.equal(f.counts().transforms,0);
 }
});
