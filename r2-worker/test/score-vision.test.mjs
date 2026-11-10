import test from 'node:test';
import assert from 'node:assert/strict';
import {scoreVisionReady,interpretScore} from '../src/score-vision.mjs';
const uid='12345678-1234-1234-1234-123456789abc';
const env={SCORE_VISION_ENABLED:'true',SCORE_VISION_ALLOWED_USER_IDS:uid,OPENAI_API_KEY:'test-key'};
const json=(x)=>x;
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const image='data:image/jpeg;base64,'+Buffer.concat([Buffer.from([255,216]),Buffer.alloc(128,1)]).toString('base64');
const request=(body)=>new Request('https://example.test/v1/scores/vision',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
test('vision is fail closed unless key and owner allowlist are configured',()=>{
 assert.equal(scoreVisionReady(env,uid),true);
 assert.equal(scoreVisionReady({...env,OPENAI_API_KEY:''},uid),false);
 assert.equal(scoreVisionReady(env,'someone-else'),false);
 assert.equal(scoreVisionReady({...env,SCORE_VISION_ENABLED:'false'},uid),false);
});
test('only cropped image and bounded result are returned; original is not stored',async()=>{
 let payload;
 const fetcher=async(_url,init)=>{
  payload=JSON.parse(init.body);
  return new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify({label:'rit.',explanation:'점점 느리게',confidence:'high'})}]}]}),{status:200});
 };
 const result=await interpretScore(request({mode:'notation',image}),env,uid,{fail,json},fetcher);
 assert.deepEqual(result,{label:'rit.',explanation:'점점 느리게',confidence:'high'});
 assert.equal(payload.store,false);
 assert.equal(payload.input[0].content[1].image_url,image);
 assert.ok(payload.max_output_tokens<=320);
});
test('handwriting response is separate from printed-score explanation',async()=>{
 const fetcher=async()=>new Response(JSON.stringify({output:[{content:[{type:'output_text',text:JSON.stringify({text:'숨 크게 쉬기',confidence:'medium'})}]}]}),{status:200});
 const result=await interpretScore(request({mode:'handwriting',image}),env,uid,{fail,json},fetcher);
 assert.deepEqual(result,{text:'숨 크게 쉬기',confidence:'medium'});
});
test('malformed or oversized images never reach the model',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('must not call');};
 await assert.rejects(()=>interpretScore(request({mode:'notation',image:'bad'}),env,uid,{fail,json},fetcher),{status:400});
 await assert.rejects(()=>interpretScore(request({mode:'notation',image:image+'A'.repeat(700000)}),env,uid,{fail,json},fetcher),{status:413});
 assert.equal(calls,0);
});
