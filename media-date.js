/* Calendar dates retain explicit recording offsets; incomplete dates never become January 1. */
((root)=>{
'use strict';
const local=date=>date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
function parse(value,now=Date.now()){
 if(Array.isArray(value)){for(const item of value){const result=parse(item,now);if(result)return result}return null}
 if(value instanceof Date){const time=value.getTime();if(!Number.isFinite(time)||value.getFullYear()<1970||value.getFullYear()>new Date(now).getFullYear()+1)return null;return {created:time,recordedDate:local(value)}}
 if(typeof value!=='string'||!/\d{4}[-:]\d{2}[-:]\d{2}/.test(value))return null;
 const normalized=value.trim().replace(/^(\d{4}):(\d{2}):(\d{2})/,'$1-$2-$3').replace(' ','T').replace(/\s+([+-]\d)/,'$1').replace(/([+-]\d{2})(\d{2})$/,'$1:$2');
 const match=/^(\d{4}-\d{2}-\d{2})(?:T|$)/.exec(normalized);if(!match)return null;
 const check=new Date(match[1]+'T12:00:00');if(local(check)!==match[1])return null;
 const date=new Date(normalized.length===10?normalized+'T12:00:00':normalized);
 const result=parse(date,now);if(!result)return null;
 if(normalized.length===10||/[+-]\d{2}:\d{2}$/.test(normalized))result.recordedDate=match[1];
 return result;
}
function pick(tags={},lastModified,now=Date.now()){
 const raw=tags.raw||{};
 for(const key of ['com.apple.quicktime.creationdate','creation_time','recorded_date','TDRC','ICRD','©day','DATE']){
  const result=parse(raw[key],now);if(result)return {...result,dateSource:'metadata',dateTag:key};
 }
 const created=parse(tags.creationTime,now);if(created)return {...created,dateSource:'metadata',dateTag:'creationTime'};
 const incomplete=Object.entries(raw).some(([key,value])=>/date|TDRC|year|©day/i.test(key)&&(Array.isArray(value)?value:[value]).some(item=>typeof item==='string'&&/^\d{4}(?:-\d{2})?$/.test(item)));
 const dated=!incomplete&&parse(tags.date,now);if(dated)return {...dated,dateSource:'metadata',dateTag:'date'};
 const modified=typeof lastModified==='number'&&lastModified>0&&parse(new Date(lastModified),now);
 return {...(modified||parse(new Date(now),now)),dateSource:modified?'file-modified':'upload-time',dateTag:modified?'lastModified':'uploadedAt'};
}
const api={parse,pick,local};root.VzipMediaDates=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof self!=='undefined'?self:globalThis);
