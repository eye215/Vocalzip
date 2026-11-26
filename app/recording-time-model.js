/* 곡 녹음 → 연습 시간 (owner's choice, 2026-11-22): a song's practice recordings count as that day's practice time for
 * the song, unless time for that song on that day was entered (typed, or timed on a screen) — then only that counts.
 * Pure: no DOM, storage or network; also loaded by Node tests. app/recording-time.js runs it when the recordings change.
 *
 * Which recordings: linked to a song, kind 연습 (not 레슨 · 공연), category 곡 녹음 (not 연습실 · 트레이닝), not a take of
 * 오늘의 연습, with a length and a day — the caller passes them as [{id, songId, date, seconds}].
 *
 * plan(db, recordings) → {rows:[practice rows to put (by id)], remove:[ids]} — nothing else is touched:
 *   per song and day (a "group"),
 *   · time entered for it (a practice row with that song and day, minutes > 0, kept by the person or a screen):
 *       the group adds nothing; an automatic row of it goes; an imported row it counted goes back to 시간 미입력
 *   · otherwise: an imported row of these recordings (시간 미입력) counts its own recordings' length
 *       (practiceTimeSource 'recording', fromUnconfirmed); the recordings no row holds make ONE automatic row
 *       'rec-time:<day>:<song>' with their total length (rounded up to the minute).
 *   An automatic row whose recordings are all gone goes. A row the person edited (its source is no longer
 *   'recording') is theirs and is never touched again; one they deleted is not made again.
 *   A recording that time entered on its day lists (mediaIds) — for another song or for 트레이닝, e.g. 녹음 길이로
 *   채우기 in a 트레이닝 record, or a 목표 수행 기록 with its time — is that time already: it adds nothing on its own. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipRecordingTime=api;})(typeof self!=='undefined'?self:globalThis,()=>{
'use strict';
const list=v=>Array.isArray(v)?v:[];
const PREFIX='rec-time:',SOURCE='recording';
const minutesOf=seconds=>Math.min(600,Math.max(1,Math.ceil((Number(seconds)||0)/60)));
const live=db=>{const gone=new Set(list(db?.deleted?.practices).map(String));return list(db?.practices).filter(p=>p&&typeof p==='object'&&!gone.has(String(p.id)));};
const entered=p=>!['unconfirmed',SOURCE].includes(p.practiceTimeSource)&&(Number(p.manualMinutes??p.minutes)||0)>0;
const autoId=(date,songId)=>PREFIX+date+':'+songId;
function plan(db={},recordings=[],{now=Date.now()}={}){
  const ps=live(db),rows=[],remove=new Set(),byId=new Map(ps.map(p=>[p.id,p])),deleted=new Set(list(db?.deleted?.practices).map(String));
  const groups=new Map();
  // day|recording listed by time entered that day (any song or 트레이닝): counted there, not again here.
  const taken=new Set();for(const p of ps)if(entered(p))for(const m of list(p.mediaIds))taken.add(p.date+'|'+m);
  for(const r of list(recordings)){
    if(!r||!r.id||!r.songId||!/^\d{4}-\d{2}-\d{2}$/.test(r.date||'')||!(Number(r.seconds)>0))continue;
    const k=r.date+'|'+r.songId;if(!groups.has(k))groups.set(k,{date:r.date,songId:r.songId,recs:[]});groups.get(k).recs.push(r);
  }
  const seen=new Set();
  for(const g of groups.values()){
    const mine=ps.filter(p=>p.date===g.date&&p.songId===g.songId&&p.practiceMode!=='training');
    const id=autoId(g.date,g.songId),auto=byId.get(id);seen.add(id);
    if(deleted.has(id))continue; // the person deleted that day's automatic row: it stays deleted
    const revert=p=>p.fromUnconfirmed&&p.practiceTimeSource===SOURCE?{...p,practiceTimeSource:'unconfirmed',minutes:0,manualMinutes:0,fromUnconfirmed:undefined,updatedAt:now}:null;
    if(mine.some(entered)){
      if(auto&&auto.practiceTimeSource===SOURCE)remove.add(id);
      for(const p of mine){const r=revert(p);if(r){delete r.fromUnconfirmed;rows.push(r);}}
      continue;
    }
    const secs=new Map(g.recs.map(r=>[r.id,Number(r.seconds)])),held=new Set();
    // An imported row (시간 미입력, or counted before) counts its own recordings of this group.
    for(const p of mine){
      if(p.id===id)continue;
      if(!(p.practiceTimeSource==='unconfirmed'||(p.fromUnconfirmed&&p.practiceTimeSource===SOURCE)))continue;
      const ids=list(p.mediaIds).filter(m=>secs.has(m)&&!taken.has(g.date+'|'+m));ids.forEach(m=>held.add(m));
      if(!ids.length){const r=list(p.mediaIds).some(m=>taken.has(g.date+'|'+m))&&revert(p);if(r){delete r.fromUnconfirmed;rows.push(r);}continue;}
      const minutes=minutesOf(ids.reduce((n,m)=>n+secs.get(m),0));
      if(p.practiceTimeSource!==SOURCE||Number(p.minutes)!==minutes)rows.push({...p,practiceTimeSource:SOURCE,fromUnconfirmed:true,minutes,manualMinutes:minutes,updatedAt:now});
    }
    for(const p of mine)for(const m of list(p.mediaIds))if(p.id!==id)held.add(m);
    for(const r of g.recs)if(taken.has(g.date+'|'+r.id))held.add(r.id);
    const free=g.recs.filter(r=>!held.has(r.id));
    if(!free.length){if(auto&&auto.practiceTimeSource===SOURCE)remove.add(id);continue;}
    if(auto&&auto.practiceTimeSource!==SOURCE)continue; // edited by the person: theirs
    const minutes=minutesOf(free.reduce((n,r)=>n+Number(r.seconds),0)),mediaIds=free.map(r=>r.id).sort();
    if(auto&&Number(auto.minutes)===minutes&&JSON.stringify(list(auto.mediaIds).slice().sort())===JSON.stringify(mediaIds))continue;
    rows.push({...(auto||{created:now}),id,date:g.date,songId:g.songId,minutes,manualMinutes:minutes,practiceTimeSource:SOURCE,practiceMode:'song',
      mediaIds,technique:auto?.technique||[],memo:auto?.memo||'',categoryLabel:'곡 녹음',updatedAt:now});
  }
  // Automatic rows whose recordings are all gone.
  for(const p of ps)if(String(p.id).startsWith(PREFIX)&&p.practiceTimeSource===SOURCE&&!seen.has(p.id))remove.add(p.id);
  return {rows,remove:[...remove]};
}
/** Apply a plan to db (inside VZ.change): rows replace by id or are added; removed ids leave the list. */
function apply(db,{rows=[],remove=[]}={}){
  db.practices||=[];
  const gone=new Set(remove);
  db.practices=db.practices.filter(p=>!gone.has(p?.id));
  for(const r of rows){const at=db.practices.findIndex(p=>p?.id===r.id);if(at<0)db.practices.push(r);else db.practices[at]=r;}
  return rows.length+gone.size;
}
return {PREFIX,SOURCE,minutesOf,plan,apply};
});
