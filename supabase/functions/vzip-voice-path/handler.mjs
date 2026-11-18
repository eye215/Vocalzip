// Only the authenticated owner's existing source can be queued. No audio in the request or response.
export function createHandler({authenticate,load,save,contract,uuid=()=>crypto.randomUUID(),now=()=>Date.now()}={}){
 const origins=['https://vocalzip.yullul.com','https://eye215.github.io'];
 return async req=>{
  const origin=req.headers.get('origin'),headers={'content-type':'application/json','cache-control':'no-store','access-control-allow-headers':'authorization,apikey,content-type','access-control-allow-methods':'POST,OPTIONS',...(origins.includes(origin)?{'access-control-allow-origin':origin,vary:'Origin'}:{})},reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
  if(origin&&!origins.includes(origin))return reply(403,{error:'허용되지 않은 사이트예요.'});if(req.method==='OPTIONS')return new Response(null,{status:204,headers});if(req.method!=='POST')return reply(405,{error:'POST required'});
  const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];if(!token)return reply(401,{error:'로그인이 필요해요.'});
  const user=await authenticate(token).catch(()=>null);if(!user?.allowed||!user.id)return reply(403,{error:'소유자 계정과 활성 세션을 확인해 주세요.'});
  try{
   if(Number(req.headers.get('content-length')||0)>2048)return reply(413,{error:'요청이 너무 커요.'});
   const reader=req.body?.getReader();if(!reader)return reply(400,{error:'요청이 없어요.'});let bytes=0,text='';const decoder=new TextDecoder();
   try{while(true){const {value,done}=await reader.read();if(done)break;bytes+=value.length;if(bytes>2048){await reader.cancel();return reply(413,{error:'요청이 너무 커요.'});}text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}finally{reader.releaseLock();}
   const body=JSON.parse(text);if(!body||Object.keys(body).some(k=>!['mediaId','source','retry'].includes(k))||typeof body.mediaId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(body.mediaId)||body.retry!=null&&typeof body.retry!=='boolean')return reply(400,{error:'요청 형식을 확인해 주세요.'});
   for(let attempt=0;attempt<3;attempt++){
    const row=await load(user.id,body.mediaId);if(!row?.metadata||!contract.same(body.source,contract.source(row.metadata))||!String(body.source?.key).startsWith('u/'+user.id+'/'))return reply(404,{error:'선택한 원본이 변경됐거나 접근할 수 없어요.'});
    const q=contract.request(row.metadata,uuid(),now(),{retry:body.retry===true});
    if(!q){const current=contract.current(row.metadata);return reply(200,{state:current?.state||'unavailable',queued:false});}
    if(await save(user.id,body.mediaId,row,q))return reply(202,{state:'queued',queued:true});
   }
   return reply(409,{error:'다른 수정이 있어요. 최신 목록으로 다시 확인해 주세요.'});
  }catch{return reply(503,{error:'서버 분리를 요청하지 못했어요. 원본과 기존 결과는 그대로예요.'});}
 };
}
