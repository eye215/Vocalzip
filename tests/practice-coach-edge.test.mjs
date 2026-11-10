import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync('supabase/functions/vzip-nvidia-coach/index.ts','utf8').replace(/^import .*createClient.*\n/m,'');
function handler(calls,{owner=true,note='들리는 특징: 짧게 들려요.\n먼저 확인: 편안함을 확인해요.\n다음 시도: 선율을 나누어 연습해요.\nNEXT_TASK: melody'}={}){
 let fn;const Deno={env:{get:n=>({SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'anon',nemotron_ultra:'test',Gemini_key:'test',STT_ALLOWED_USER_IDS:'owner'})[n]},serve:f=>fn=f};
 const createClient=()=>({auth:{getUser:async()=>({data:{user:{id:'owner'}}})},rpc:async()=>({data:owner})});
 const fetch=async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return Response.json(url.includes('googleapis')?{candidates:[{content:{parts:[{text:'짧은 구절이 들려요.\nAUDIO_CHECK: no'}]}}]}:{choices:[{message:{content:note}}]});};
 new Function('Deno','createClient','fetch',stripTypeScriptTypes(source))(Deno,createClient,fetch);return fn;
}
const req=input=>new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer test',Origin:'https://vocalzip.yullul.com'},body:JSON.stringify({task:'회고',summary:'기록됨',...input})});
test('text-only recommendation calls Nemotron once and sends no audio to Gemini',async()=>{
 const calls=[],res=await handler(calls)(req({mode:'text',answers:['후렴을 연습하고 싶어요.']}));
 assert.equal(res.status,200);const data=await res.json();assert.equal(calls.length,1);assert.match(calls[0].url,/nvidia/);assert.equal(data.models.length,1);assert.equal(data.nextTask,'melody');
 assert.deepEqual(JSON.parse(calls[0].body.messages[1].content).practice.answers,['후렴을 연습하고 싶어요.']);
});
test('audio recommendation uses Gemini observation followed by Nemotron',async()=>{
 const calls=[],res=await handler(calls)(req({audio:{mime:'audio/wav',data:'YQ=='}}));assert.equal(res.status,200);assert.equal(calls.length,2);assert.match(calls[0].url,/googleapis/);assert.match(calls[1].url,/nvidia/);
});
test('symptoms override an unsafe model suggestion',async()=>{
 const calls=[],data=await (await handler(calls)(req({mode:'text',symptoms:['통증']}))).json();assert.equal(data.nextTask,'reflection');assert.match(data.note,/노래를 멈추고/);
});
test('owner gate and malformed audio reject before model calls',async()=>{
 const calls=[];assert.equal((await handler(calls,{owner:false})(req({mode:'text'}))).status,403);assert.equal((await handler(calls)(req({audio:{mime:'text/plain',data:'YQ=='}}))).status,400);assert.equal(calls.length,0);
});
