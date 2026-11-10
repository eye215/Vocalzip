/* Owner-only, opt-in score region interpretation. Cropped images are never stored. */
export function scoreVisionReady(env,uid){
 const ids=String(env.SCORE_VISION_ALLOWED_USER_IDS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);
 return env.SCORE_VISION_ENABLED==='true'&&!!env.OPENAI_API_KEY&&ids.includes(String(uid).toLowerCase());
}
export async function interpretScore(request,env,uid,{fail,json},fetcher=fetch){
 if(!scoreVisionReady(env,uid))fail(503,'score vision is not available');
 const length=Number(request.headers.get('content-length')||0);
 if(length>700000)fail(413,'selected image is too large');
 const raw=await request.text();
 if(raw.length>700000)fail(413,'selected image is too large');
 let body;try{body=JSON.parse(raw);}catch{fail(400,'invalid JSON');}
 if(!['notation','handwriting'].includes(body?.mode))fail(400,'invalid mode');
 const image=body.image;
 if(typeof image!=='string'||image.length>600000||!/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/.test(image))fail(400,'invalid image');
 const encoded=image.slice(image.indexOf(',')+1);
 let bytes;try{bytes=atob(encoded);}catch{fail(400,'invalid image');}
 if(bytes.length<100||bytes.length>450000)fail(413,'selected image is too large');
 const jpeg=image.startsWith('data:image/jpeg');
 if(jpeg ? bytes.charCodeAt(0)!==255||bytes.charCodeAt(1)!==216 : bytes.slice(0,4)!=='\x89PNG')fail(400,'invalid image');
 const notation=body.mode==='notation';
 const instructions=notation
  ?'You explain only the music notation visibly present in the user-selected score crop. Reply in Korean. Identify the exact marking and give a short practical meaning for a singer. Do not infer notes or symbols outside the crop. If it is unclear, set confidence to low and say it cannot be identified. Respond ONLY as JSON with keys label, explanation, confidence (high, medium, low).'
  :'Recognize only the handwritten Korean or other text in this image. The original printed score has been excluded by the client. Do not invent missing words. Reply ONLY as JSON with keys text and confidence (high, medium, low). If illegible, text must be empty.';
 let response;
 try{response=await fetcher('https://api.openai.com/v1/responses',{
  method:'POST',headers:{authorization:'Bearer '+env.OPENAI_API_KEY,'content-type':'application/json'},
  body:JSON.stringify({model:env.SCORE_VISION_MODEL||'gpt-4.1-mini',store:false,max_output_tokens:320,
   input:[{role:'user',content:[{type:'input_text',text:instructions},{type:'input_image',image_url:image,detail:'high'}]}]}),
  signal:AbortSignal.timeout(20000)
 });}catch{fail(502,'image recognition is temporarily unavailable');}
 if(!response.ok)fail(502,'image recognition is temporarily unavailable');
 let result;try{result=await response.json();}catch{fail(502,'invalid recognition response');}
 const answer=(result.output||[]).flatMap(x=>x.content||[]).filter(x=>x.type==='output_text').map(x=>x.text).join('').trim();
 let parsed;try{parsed=JSON.parse(answer);}catch{fail(502,'invalid recognition response');}
 const confidence=['high','medium','low'].includes(parsed?.confidence)?parsed.confidence:'low';
 if(notation){
  const label=String(parsed.label||'').trim().slice(0,80),explanation=String(parsed.explanation||'').trim().slice(0,600);
  if(!explanation)fail(502,'invalid recognition response');
  return json({label,explanation,confidence});
 }
 return json({text:String(parsed.text||'').trim().slice(0,1200),confidence});
}
