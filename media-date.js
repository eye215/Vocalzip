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
/** A recording time written in the file name as yyyy-MM-dd_HH-mm-ss (e.g. 2025-08-08_22-09-00.m4a; '_', ' ' or 'T'
 * between date and time, '-', '.' or ':' inside the time). The user names files this way on purpose, so it wins over the
 * file's own tags, which often hold the download or export time. Returns null for anything else. */
function fromName(name,now=Date.now()){
 const m=/(?:^|[^\d])((?:19|20)\d{2})-(\d{2})-(\d{2})[_ T](\d{2})[-.:](\d{2})[-.:](\d{2})(?!\d)/.exec(String(name||''));
 if(!m)return dateOnly(name,now)||monthDay(name,now);
 const [y,mo,d,h,mi,se]=m.slice(1).map(Number);if(h>23||mi>59||se>59)return null;
 const date=new Date(y,mo-1,d,h,mi,se);if(date.getFullYear()!==y||date.getMonth()!==mo-1||date.getDate()!==d)return null;
 const result=parse(date,now);return result?{...result,dateSource:'filename',dateTag:'name'}:null;
}
/** A full date without a time, like "2025-10-19 #21 2.m4a" or "2025.10.19 레슨": that day. No time is known
 * (timeless), so the caller keeps the file's own time on that day. Future dates are not trusted. */
function dateOnly(name,now=Date.now()){
 const m=/(?:^|[^\d])((?:19|20)\d{2})[-.](\d{1,2})[-.](\d{1,2})(?!\d)/.exec(String(name||''));if(!m)return null;
 const [y,mo,d]=m.slice(1).map(Number),date=new Date(y,mo-1,d,12,0,0);
 if(date.getFullYear()!==y||date.getMonth()!==mo-1||date.getDate()!==d||date.getTime()>now+86400000)return null;
 return {created:date.getTime(),recordedDate:local(date),dateSource:'filename',dateTag:'name-date',timeless:true};
}
/** A name that starts with month-day and no year, like "11-3 scale.m4a" or "11-5 #20-2.m4a": that day in the current
 * calendar year. No time is known (timeless), so the caller keeps the file's own time on that day. */
function monthDay(name,now=Date.now()){
 const m=/^\s*(\d{1,2})[-.](\d{1,2})(?=$|[\s_#(.)-])/.exec(String(name||''));if(!m)return null;
 const mo=Number(m[1]),d=Number(m[2]);if(mo<1||mo>12||d<1||d>31)return null;
 const y=new Date(now).getFullYear();
 const at=year=>new Date(year,mo-1,d,12,0,0);
 const date=at(y);if(date.getMonth()!==mo-1||date.getDate()!==d)return null;
 return {created:date.getTime(),recordedDate:local(date),dateSource:'filename',dateTag:'name-month-day',timeless:true};
}
const api={parse,pick,local,fromName};root.VzipMediaDates=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof self!=='undefined'?self:globalThis);
