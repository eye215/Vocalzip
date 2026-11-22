/* 곡 녹음 → 연습 시간: keeps the automatic practice rows of app/recording-time-model.js in step with the recordings —
 * after the recordings change (saved, imported, edited, deleted, synced) and after practice records change (time
 * entered for a song that day takes over). Each run is idempotent: nothing to change, nothing written. */
(()=>{
'use strict';
const V=window.VZ,M=V?.media,T=window.VzipRecordingTime;
if(!V||!M||!T||typeof window==='undefined')return;
/** A song's practice recording: linked to a song, kind 연습, category 곡 녹음, not a take of 오늘의 연습, with a length. */
const eligible=item=>{
  try{
    if(!item?.songId||!(Number(item.durationSeconds)>0))return false;
    if(M.occasion(item)!=='practice'||M.isPerformance?.(item)||M.recordingCategory(item)!=='song')return false;
    return !M.owner?.(item)?.practice?.practiceSetId;
  }catch{return false;}
};
let timer=0,running=false;
/** Works on the list the app already read (it never reads the recordings again itself). An empty list is "not read
 *  yet" — nothing is removed then. */
async function run(){
  if(running||window.VzipAccountScope?.leaving)return;running=true;
  try{
    const items=M.cached?.()||[];if(!items.length)return;
    const recs=items.filter(eligible).map(m=>({id:m.id,songId:m.songId,date:M.dateOf(m),seconds:Number(m.durationSeconds)}));
    const p=T.plan(V.db,recs);
    if((p.rows.length||p.remove.length)&&V.change(db=>{T.apply(db,p);},{silent:true}))V.softRender?.();
  }catch(error){console.error(error);}
  finally{running=false;}
}
const soon=(ms=2500)=>{clearTimeout(timer);timer=setTimeout(run,ms);};
V.recordingTime={run};
// After the app reads the list (any screen), and after practice records change.
const list=M.list;if(typeof list==='function')M.list=async(...args)=>{const out=await list.apply(M,args);soon();return out;};
window.addEventListener('vzip:data-changed',()=>soon());
soon(4000);
})();
