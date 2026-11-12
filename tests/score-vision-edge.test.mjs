import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';

const source=readFileSync(new URL('../supabase/functions/vzip-score-vision/index.ts',import.meta.url),'utf8')
  .replace(/^import \{ createClient \} from 'npm:@supabase\/supabase-js@2\.95\.0';\n/m,'');
const jpeg='data:image/jpeg;base64,'+Buffer.concat([Buffer.from([255,216]),Buffer.alloc(128,1)]).toString('base64');
function handler({enabled='true',owner=true,key='test-key',fetcher=()=>{throw Error('unexpected paid request')}}={}){
 let fn;const Deno={env:{get:name=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon',OPENAI_API_KEY:key,nemotron_nano:key,STT_ENABLED:enabled,STT_ALLOWED_USER_IDS:'owner'})[name]},serve:callback=>{fn=callback}};
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
test('only a bounded crop reaches NVIDIA and Korean text is returned',async()=>{
 let sent;
 const fetcher=async(url,options)=>{assert.match(url,/nvidia\.com/);sent=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({label:'점점 느리게(rit.)',explanation:'음악의 빠르기를 점점 늦추며 노래하세요.',confidence:'high'})}}]}),{status:200})};
 const response=await handler({fetcher})(req('POST',{mode:'notation',image:jpeg}));
 assert.equal(response.status,200);assert.equal((await response.json()).label,'점점 느리게(rit.)');
 assert.equal(sent.messages[0].content[1].image_url.url,jpeg);
 assert.match(sent.messages[0].content[0].text,/Korean/);
});
test('English NVIDIA result is rewritten in Korean before display',async()=>{
 const sent=[];
 const fetcher=async(_url,options)=>{const body=JSON.parse(options.body);sent.push(body);
  const output=sent.length===1?{label:'Tempo',explanation:'This marking indicates a tempo of 122 quarter-note beats per minute.',confidence:'high'}:
   {label:'♩=122',explanation:'4분음표를 한 박으로 하여 1분에 122박의 빠르기로 노래하세요.',confidence:'high'};
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(output)}}]}),{status:200});
 };
 const response=await handler({fetcher})(req('POST',{mode:'notation',image:jpeg}));
 assert.equal(response.status,200);assert.match((await response.json()).explanation,/4분음표/);
 assert.equal(sent.length,2);assert.match(sent[1].messages[0].content,/한국어/);
 assert.equal(sent[1].messages[1].content.includes(jpeg),false);
});
test('English output after rewrite is rejected',async()=>{
 let calls=0;
 const fetcher=async()=>{
  calls++;
  const output={label:'Tempo',explanation:'This is quarter note tempo.',confidence:'high'};
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(output)}}]}),{status:200});
 };
 const response=await handler({fetcher})(req('POST',{mode:'notation',image:jpeg}));
 assert.equal(response.status,502);assert.match((await response.json()).error,/한국어/);assert.equal(calls,2);
});
test('invalid images are rejected before a paid call',async()=>{
 let called=0;const fn=handler({fetcher:async()=>{called++;throw Error('unexpected')}});
 assert.equal((await fn(req('POST',{mode:'handwriting',image:'data:text/plain;base64,QQ=='}))).status,400);
 assert.equal(called,0);
});
