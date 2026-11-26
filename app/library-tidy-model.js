/* 녹음 정리 (owner, 2026-11-26): recordings worth a look when tidying a large library — very short takes, takes with
 * almost no voice, and days with many takes of one song. Pure: no DOM, storage or network (tests/library-tidy-model.test.cjs).
 * It only SUGGESTS; nothing is ticked or removed here — the screen deletes only what the person ticks and confirms. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipLibraryTidy=api;})(typeof self!=='undefined'?self:globalThis,()=>{
'use strict';
const SHORT_SECONDS=5,QUIET_VOICED=2,MANY_TAKES=4;
const num=v=>Number.isFinite(Number(v))?Number(v):null;
/** items: recordings; dateOf(m) → 'YYYY-MM-DD'; songless(m) → true for a song/lesson take without a song.
 *  → {short:[m], quiet:[m], sameDay:[{songId, date, items:[m] (newest first)}], songless:n} */
function groups(items,{dateOf=m=>m.date||'',songless=()=>false}={}){
  const list=(Array.isArray(items)?items:[]).filter(m=>m&&m.id!=null);
  const newest=(a,b)=>(num(b.created)||0)-(num(a.created)||0);
  const short=list.filter(m=>{const d=num(m.durationSeconds);return d!=null&&d>0&&d<SHORT_SECONDS;}).sort(newest);
  const shortIds=new Set(short.map(m=>m.id));
  const quiet=list.filter(m=>{if(shortIds.has(m.id))return false;const v=num(m.analysis?.metrics?.voicedSeconds);return v!=null&&v<QUIET_VOICED;}).sort(newest);
  const days=new Map();
  for(const m of list){const date=dateOf(m);if(!m.songId||!date)continue;const k=m.songId+'|'+date;const g=days.get(k)||{songId:m.songId,date,items:[]};g.items.push(m);days.set(k,g);}
  const sameDay=[...days.values()].filter(g=>g.items.length>=MANY_TAKES).map(g=>({...g,items:g.items.sort(newest)}))
    .sort((a,b)=>b.items.length-a.items.length||b.date.localeCompare(a.date));
  return {short,quiet,sameDay,songless:list.filter(m=>{try{return !m.songId&&songless(m);}catch{return false;}}).length};
}
return {groups,SHORT_SECONDS,QUIET_VOICED,MANY_TAKES};
});
