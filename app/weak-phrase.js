/* VOCAL.zip: explicit on-device phrase review from actual analyzed notes.
 * A pitch's distance to the nearest semitone is NOT a score against the song's melody.
 * These are listening/review candidates only, never automatic vocal defect diagnoses. */
(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VzipWeakPhrase=api;
})(typeof self!=='undefined'?self:globalThis,()=> {
 'use strict';
 const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
 const round=n=>Math.round(n*10)/10;
 function candidates(result,limit=5){
  if(!result?.notes?.length||!Number.isFinite(result.seconds)||result.seconds<=0)return [];
  // The global analysis confidence check is performed by the caller as well.
  // A phrase must be long enough to listen to, and only nontrivial tuning deviations
  // are presented. No score against a written note or backing track is inferred.
  const notes=result.notes.filter(n=>n&&Number.isFinite(n.t)&&Number.isFinite(n.dur)&&
   Number.isFinite(n.dev)&&n.t>=0&&n.dur>=0.35&&n.dur<=15&&Math.abs(n.dev)>=25&&
   n.t+n.dur<=result.seconds+0.3);
  const scored=notes.map(n=>({
   start:round(clamp(n.t-1.5,0,Math.max(0,result.seconds-1))),
   end:round(clamp(n.t+n.dur+2,0,result.seconds)),
   score:Math.abs(n.dev)*Math.min(n.dur,3),
   deviation:round(n.dev), duration:round(n.dur), time:round(n.t)
  })).filter(n=>n.end-n.start>=1.5).sort((a,b)=>b.score-a.score);
  const chosen=[];
  for(const row of scored){
   // Avoid several cards that point to the same sustained phrase.
   if(chosen.some(x=>Math.max(row.start,x.start)<Math.min(row.end,x.end)))continue;
   chosen.push(row);
   if(chosen.length>=clamp(Number(limit)||5,1,8))break;
  }
  return chosen.sort((a,b)=>a.start-b.start);
 }
 return {candidates};
});
