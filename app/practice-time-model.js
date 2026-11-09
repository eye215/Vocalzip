/* Actual practice time only. Legacy records are read without rewriting them. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipPracticeTime=api;})(globalThis,()=>{
'use strict';
function number(value){
 if(!['number','string'].includes(typeof value)||typeof value==='string'&&!value.trim())return null;
 const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;
}
function actualMinutes(record){
 if(!record||record.practiceTimeSource==='unconfirmed')return 0;
 return number(record.manualMinutes)??number(record.minutes)??0;
}
function records(input){
 const out=[],positions=new Map();
 for(const p of Array.isArray(input)?input:[]){
  if(!p||typeof p!=='object'||Array.isArray(p))continue;
  if(p.id==null||p.id===''){out.push(p);continue;}
  const key=String(p.id);
  if(!positions.has(key)){positions.set(key,out.length);out.push(p);}
  else{const index=positions.get(key);if((number(p.updatedAt)||0)>(number(out[index].updatedAt)||0))out[index]=p;}
 }
 return out;
}
function entries(input){
 return records(input).map(p=>({date:p.date,minutes:actualMinutes(p),songId:p.practiceMode==='training'?'':p.songId||'',training:p.practiceMode==='training',kind:'practice',ref:p})).filter(e=>e.minutes>0);
}
return {number,actualMinutes,records,entries};
});
