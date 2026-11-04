/* Shared by the page, service worker and Node contract tests. No media decoding. */
(function(root){
'use strict';
const PART_SIZE=24*1024*1024,MAX_SIZE=1024*1024*1024;
function validate(item){
 if(item?.storageVersion!==2||!Number.isSafeInteger(item.size)||item.size<=0||item.size>MAX_SIZE||!Array.isArray(item.parts)||!item.parts.length||item.parts.length>Math.ceil(MAX_SIZE/PART_SIZE))throw Error('잘못된 분할 파일 정보예요.');
 let total=0;const paths=new Set();
 for(const part of item.parts){
  if(typeof part.path!=='string'||!Number.isSafeInteger(part.size)||part.size<=0||part.size>PART_SIZE||paths.has(part.path))throw Error('잘못된 파일 조각이에요.');
  paths.add(part.path);total+=part.size;
 }
 if(total!==item.size)throw Error('파일 조각의 크기가 원본과 달라요.');
 return item;
}
function range(header,size){
 if(!header)return {start:0,end:size-1,status:200};
 const m=/^bytes=(\d*)-(\d*)$/.exec(header);
 if(!m||(!m[1]&&!m[2]))return null;
 let start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2]));
 let end=m[1]?(m[2]?Math.min(Number(m[2]),size-1):size-1):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start||(!m[1]&&Number(m[2])<=0))return null;
 return {start,end,status:206};
}
function response(item,request,fetchPart,report=()=>{}){
 validate(item);
 const selected=range(request.headers.get('range'),item.size);
 const headers={'Accept-Ranges':'bytes','Cache-Control':'no-store','Content-Type':/^(audio|video)\/[\w.+-]+(?:;[^\r\n]*)?$/.test(item.type||'')?item.type:'application/octet-stream','X-Content-Type-Options':'nosniff'};
 if(!selected)return new Response(null,{status:416,headers:{...headers,'Content-Range':'bytes */'+item.size}});
 const {start,end,status}=selected;headers['Content-Length']=String(end-start+1);
 if(status===206)headers['Content-Range']='bytes '+start+'-'+end+'/'+item.size;
 if(request.method==='HEAD')return new Response(null,{status,headers});
 const abort=new AbortController();let reader=null,index=0,offset=0,remaining=end-start+1,skip=0,partRemaining=0,cancelled=false;
 const selectedParts=[];
 for(const part of item.parts){const last=offset+part.size-1;if(last>=start&&offset<=end)selectedParts.push({part,start:Math.max(0,start-offset),end:Math.min(part.size-1,end-offset)});offset+=part.size}
 const stream=new ReadableStream({
  async pull(controller){
   try{
    while(!cancelled){
     if(remaining===0){await reader?.cancel();reader=null;controller.close();return}
     if(!reader){
      const next=selectedParts[index++];if(!next)throw Error('파일 조각이 누락됐어요.');
      const result=await fetchPart(next.part,next.start,next.end,abort.signal);
      if(!result.ok||!result.body)throw Error('파일 조각을 읽지 못했어요 ('+result.status+').');
      if(result.status===206){
       const expected='bytes '+next.start+'-'+next.end+'/'+next.part.size;
       if(result.headers.get('content-range')!==expected){await result.body.cancel();throw Error('잘못된 파일 구간이에요.')}
       skip=0;
      }else if(result.status===200){skip=next.start}else{await result.body.cancel();throw Error('지원하지 않는 파일 응답이에요.')}
      partRemaining=next.end-next.start+1;reader=result.body.getReader();
     }
     const value=await reader.read();if(cancelled)return;
     if(value.done){throw Error('파일 조각이 예상보다 짧아요.')}
     let data=value.value;
     if(skip){const ignored=Math.min(skip,data.byteLength);skip-=ignored;data=data.subarray(ignored)}
     const count=Math.min(data.byteLength,partRemaining,remaining);
     if(count){controller.enqueue(data.subarray(0,count));remaining-=count;partRemaining-=count}
     if(partRemaining===0){await reader.cancel();reader=null}
     if(count)return;
    }
   }catch(error){report(error);abort.abort();try{await reader?.cancel()}catch{}if(!cancelled)controller.error(error)}
  },
  async cancel(){cancelled=true;abort.abort();try{await reader?.cancel()}catch{}}
 });
 return new Response(stream,{status,headers});
}
const api={PART_SIZE,MAX_SIZE,validate,range,response};root.VzipChunks=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof self!=='undefined'?self:globalThis);
