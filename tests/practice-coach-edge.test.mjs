import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {stripTypeScriptTypes} from 'node:module';
const source=readFileSync('supabase/functions/vzip-nvidia-coach/index.ts','utf8').replace(/^import .*createClient.*\n/m,'').replace(/^import .*exercise.ts.*\n/m,'');
const exerciseSource=readFileSync('supabase/functions/vzip-nvidia-coach/exercise.ts','utf8').replace(/export /g,'');
function handler(calls,{owner=true,note='들리는 특징: 짧게 들려요.\n먼저 확인: 편안함을 확인해요.\n다음 시도: 선율을 나누어 연습해요.\nNEXT_TASK: melody'}={}){
 let fn;const Deno={env:{get:n=>({SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'anon',nemotron_ultra:'test',Gemini_key:'test',STT_ALLOWED_USER_IDS:'owner'})[n]},serve:f=>fn=f};
 const createClient=()=>({auth:{getUser:async()=>({data:{user:{id:'owner'}}})},rpc:async()=>({data:owner})});
 const fetch=async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});return Response.json(url.includes('googleapis')?{candidates:[{content:{parts:[{text:'짧은 구절이 들려요.\nAUDIO_CHECK: no'}]}}]}:{choices:[{message:{content:note}}]});};
 new Function('Deno','createClient','fetch',stripTypeScriptTypes(exerciseSource+'\n'+source))(Deno,createClient,fetch);return fn;
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
const extra={family:'diction',name:'가사 자음 또렷하게 읽기',reason:'기존 연습과 다른 전달 연습이에요.',steps:['가사 한 줄을 천천히 읽어요.','또렷하게 전할 단어 하나를 골라 적어요.'],goal:'가사 한 줄의 핵심 단어 정하기',minutes:4};
test('inline exercise returns a different structured card with one Nemotron call',async()=>{const calls=[],r=await handler(calls,{note:JSON.stringify(extra)})(req({mode:'inline-exercise',excluded:['wob','phr']}));assert.equal(r.status,200);assert.deepEqual((await r.json()).exercise,extra);assert.equal(calls.length,1);assert.match(calls[0].url,/nvidia/);});
test('inline rejects repeated family and renamed copies instead of appending a duplicate',async()=>{for(const x of [{...extra,family:'wob'},{...extra,name:'새 롱톤 연습'},{...extra,steps:['호흡 연습을 해요.','다시 반복해요.']}]){const r=await handler([],{note:JSON.stringify(x)})(req({mode:'inline-exercise',excluded:['wob','phr']}));assert.equal(r.status,502);}});
test('inline pain report overrides vocal model output with non-vocal reflection',async()=>{const r=await handler([],{note:JSON.stringify(extra)})(req({mode:'inline-exercise',excluded:['wob','phr'],symptoms:['통증']}));assert.equal(r.status,200);assert.equal((await r.json()).exercise.family,'interpretation');});
