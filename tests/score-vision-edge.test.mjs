import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

const source=readFileSync(new URL('../supabase/functions/vzip-score-vision/index.ts',import.meta.url),'utf8')
  .replace(/^import \{ createClient \} from 'npm:@supabase\/supabase-js@2\.95\.0';\n/m,'');
const jpeg='data:image/jpeg;base64,'+Buffer.concat([Buffer.from([255,216]),Buffer.alloc(128,1)]).toString('base64');
function handler({enabled='true',owner=true,key='test-key',fetcher=()=>{throw Error('unexpected paid request')}}={}){
 let fn;const Deno={env:{get:name=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon',OPENAI_API_KEY:key,STT_ENABLED:enabled,STT_ALLOWED_USER_IDS:'owner'})[name]},serve:callback=>{fn=callback}};
 const createClient=()=>({auth:{getUser:async()=>({data:{user:{id:'owner'}}})},rpc:async()=>({data:owner,error:null})});
 new Function('Deno','createClient','fetch','Request','Response','Blob','AbortSignal','atob','console',stripTypeScriptTypes(source))
  (Deno,createClient,fetcher,Request,Response,Blob,AbortSignal,atob,console);
 return fn;
}
const req=(method,body)=>new Request('https://example.supabase.co/functions/v1/vzip-score-vision',{method,headers:{Origin:'https://vocalzip.yullul.com',Authorization:'Bearer owner-token','Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});

test('existing STT key and owner policy gate readiness',async()=>{
 assert.equal((await handler()(req('GET'))).status,200);
 assert.equal((await handler({key:''})(req('GET'))).status,503);
 assert.equal((await handler({owner:false})(req('GET'))).status,403);
});
test('only a bounded crop reaches OpenAI with structured output and no storage',async()=>{
 let sent;
 const fetcher=async(_url,options)=>{sent=JSON.parse(options.body);return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify({label:'rit.',explanation:'점점 느리게',confidence:'high'})}]}]}),{status:200})};
 const response=await handler({fetcher})(req('POST',{mode:'notation',image:jpeg}));
 assert.equal(response.status,200);assert.equal((await response.json()).label,'rit.');
 assert.equal(sent.store,false);assert.equal(sent.text.format.type,'json_schema');assert.equal(sent.text.format.strict,true);
 assert.equal(sent.input[0].content[1].image_url,jpeg);
});
test('invalid images are rejected before a paid call',async()=>{
 let called=0;const fn=handler({fetcher:async()=>{called++;throw Error('unexpected')}});
 assert.equal((await fn(req('POST',{mode:'handwriting',image:'data:text/plain;base64,QQ=='}))).status,400);
 assert.equal(called,0);
});
