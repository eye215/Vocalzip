/* Compare a user-confirmed segment in two takes of the same song.
   No automatic lyrical alignment or adjudication against score notes. */
(function(root,factory){
'use strict';
const api=factory();
if(typeof module==='object'&&module.exports)module.exports=api;
else root.VzipSegmentAB=api;
})(typeof self!=='undefined'?self:globalThis,()=>{
'use strict';
const round=n=>Math.round(n*10)/10;
function measure(result,start,end){
 if(!result||!Array.isArray(result.notes)||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return null;
 const rows=result.notes.filter(n=>Number.isFinite(n.t)&&Number.isFinite(n.dur)&&n.dur>=0.35&&
 Number.isFinite(n.dev)&&n.t>=start&&n.t+n.dur<=end);
 const seconds=rows.reduce((n,r)=>n+r.dur,0);
 if(rows.length<2||seconds<1.5)return null;
 const meanAbs=rows.reduce((n,r)=>n+Math.abs(r.dev)*r.dur,0)/seconds;
 return {meanAbsCents:round(meanAbs),notes:rows.length,voicedSeconds:round(seconds)};
}
function compare(before,after,startA,endA,startB,endB){
 const a=measure(before,startA,endA),b=measure(after,startB,endB);
 if(!a||!b)return {status:'insufficient',a,b};
 const delta=round(b.meanAbsCents-a.meanAbsCents);
 return {status:'ok',a,b,delta,trend:Math.abs(delta)<3?'similar':delta<0?'lower':'higher'};
}
return {measure,compare};
});
