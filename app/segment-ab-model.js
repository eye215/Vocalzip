/* Compare a user-confirmed segment in two takes of the same song.
   No automatic lyrical alignment or adjudication against score notes.
   section / mapPosition: the same chosen section in two takes, for listening (app/listen-verdict.js): a section is
   start/end seconds on ONE take (each take has its own, typed by the person); flipping A↔B keeps the same relative
   position inside the two sections. */
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
/** A section of one take: {start, end} in seconds (0.1 s), or null when it is not one. end null = to the end of the
 * take. duration (seconds, optional): the end may not pass it (a second of slack, as the A/B panel allows). */
function section(start,end,duration){
 const d=Number(duration)>0?Number(duration):null;
 const s=start===''||start==null?0:Number(start);
 let e=end===''||end==null?d:Number(end);
 if(!Number.isFinite(s)||s<0)return null;
 if(e==null)return {start:round(s),end:null};
 if(!Number.isFinite(e)||e<=s)return null;
 if(d&&(s>=d||e>d+1))return null;
 if(d&&e>d)e=d;
 return {start:round(s),end:round(e)};
}
/** Whole take: the section covers it from 0 to its end (or no end is known). */
const whole=(sec,duration)=>!!sec&&sec.start===0&&(sec.end==null||Number(duration)>0&&Math.abs(sec.end-Number(duration))<.1);
/** Position t of one section → the same relative position in the other. A section without an end uses length
 * (seconds, the player's duration) when given; t outside the section is clamped to it. */
function mapPosition(t,from,to,{fromLength=null,toLength=null}={}){
 const fe=from.end??fromLength,te=to.end??toLength;
 if(!Number.isFinite(fe)||!Number.isFinite(te)||fe<=from.start||te<=to.start)return Math.max(to.start,(Number(t)||0)-from.start+to.start);
 const rel=Math.min(1,Math.max(0,((Number(t)||0)-from.start)/(fe-from.start)));
 return Math.round((to.start+rel*(te-to.start))*1000)/1000;
}
return {measure,compare,section,whole,mapPosition};
});
