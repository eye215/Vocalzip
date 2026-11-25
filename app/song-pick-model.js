/* 오늘 부를 곡 (owner, 2026-11-25: "부를 노래 골라 주는 것도 있었으면") — which of MY songs to sing today, each with the
 * reason in plain words. Pure: no DOM, storage or network; also loaded by Node tests (tests/song-pick-model.test.cjs).
 *
 * Reasons, strongest first (a song takes its strongest one; a second one is kept as a short extra):
 *   공연   a 공연 being prepared (performances, status 'preparing') with a date in the next 30 days that links the song
 *          (songLinks) — "공연 D-3"
 *   레슨   a scheduled lesson in the next 14 days with the song — "오늘 레슨 곡" / "레슨 D-2"
 *   숙제   open homework (in its period, not done) on the song — "숙제 · <title>"
 *   오래   last sung (practice row, recording, finished lesson) 14 days ago or more — "18일 동안 안 불렀어요"
 *   처음   never sung — "아직 안 불러 봤어요"
 *   그 밖   sung 1–13 days ago — "5일 전에 불렀어요" (the one sung longest ago first), so there is always a pick
 * Songs marked 보류 (repertoire.status 'paused') and deleted songs are left out. A song already sung today goes last with
 * "오늘 불렀어요" (doneToday) — shown only when there is nothing else. Nothing is written anywhere. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipSongPick=api;})(typeof self!=='undefined'?self:globalThis,()=>{
'use strict';
const DAY=86400000,PERF_DAYS=30,LESSON_DAYS=14,STALE_DAYS=14;
const list=v=>Array.isArray(v)?v:[];
const isDay=v=>/^\d{4}-\d{2}-\d{2}$/.test(String(v||''));
const days=(from,to)=>isDay(from)&&isDay(to)?Math.round((Date.parse(to+'T12:00:00Z')-Date.parse(from+'T12:00:00Z'))/DAY):NaN;
const live=(db,key)=>{const gone=new Set(list(db?.deleted?.[key]).map(String));return list(db?.[key]).filter(x=>x&&!gone.has(String(x.id)));};
const lessonSongs=l=>[...new Set([...list(l.songIds),l.songId].filter(Boolean))];

/** media: [{songId, date}] (recordings as read on this device). → [{songId, title, kind, reason, extra, score, doneToday}] */
function pick(db,{today,media=[],limit=3}={}){
  if(!isDay(today))return [];
  const songs=live(db,'songs').filter(s=>s.repertoire?.status!=='paused');
  if(!songs.length)return [];
  const ids=new Set(songs.map(s=>s.id)),why=new Map();
  const add=(id,kind,score,reason)=>{if(!ids.has(id))return;const r=why.get(id)||[];if(!r.some(x=>x.kind===kind))r.push({kind,score,reason});why.set(id,r);};
  // 공연
  for(const p of live(db,'performances')){
    if((p.status||'preparing')!=='preparing')continue;
    const dates=[...list(p.sessions).filter(s=>s&&isDay(s.date)&&s.date>=today&&!['cancelled','completed'].includes(s.status)).map(s=>s.date),...(isDay(p.start)&&p.start>=today?[p.start]:[])].sort();
    const d=days(today,dates[0]);
    if(!(d>=0&&d<=PERF_DAYS))continue;
    for(const link of list(p.songLinks))add(link?.songId,'stage',100-d,d===0?'오늘 공연 곡':'공연 D-'+d);
  }
  // 레슨: the next scheduled lesson(s) within LESSON_DAYS
  for(const l of live(db,'lessons')){
    if((l.status||'done')!=='scheduled')continue;
    const d=days(today,l.date);
    if(!(d>=0&&d<=LESSON_DAYS))continue;
    for(const id of lessonSongs(l))add(id,'lesson',80-d,d===0?'오늘 레슨 곡':d===1?'내일 레슨 곡':'레슨 D-'+d);
  }
  // 숙제
  const lessonOf=new Map(live(db,'lessons').map(l=>[l.id,l]));
  for(const t of live(db,'assignments')){
    if(t.status==='done')continue;
    if(isDay(t.startDate)&&today<t.startDate)continue;
    if(isDay(t.dueDate)&&today>t.dueDate)continue;
    const songId=t.songId||[...list(t.lessonIds),t.lessonId].map(id=>lessonOf.get(id)?.songId).find(Boolean);
    add(songId,'homework',70,'숙제 · '+String(t.title||'').trim());
  }
  // When each song was last sung (up to today): practice rows, recordings, finished lessons.
  const last=new Map(),bump=(id,date)=>{if(ids.has(id)&&isDay(date)&&date<=today&&!(last.get(id)>=date))last.set(id,date);};
  const gonePractice=new Set(list(db?.deleted?.practices).map(String));
  for(const p of list(db?.practices))if(p&&!gonePractice.has(String(p.id))&&p.practiceMode!=='training')bump(p.songId,p.date);
  for(const m of list(media))bump(m?.songId,m?.date);
  for(const l of live(db,'lessons'))if((l.status||'done')==='done')for(const id of lessonSongs(l))bump(id,l.date);
  for(const s of songs){
    const at=last.get(s.id);
    if(!at){add(s.id,'new',25,'아직 안 불러 봤어요');continue;}
    const d=days(at,today);
    if(d>=STALE_DAYS)add(s.id,'stale',30+Math.min(d,90)/3,d+'일 동안 안 불렀어요');
    else if(d>0)add(s.id,'gap',d,d===1?'어제 불렀어요':d+'일 전에 불렀어요');   // the one sung longest ago comes first
  }
  const out=[];
  for(const s of songs){
    const r=(why.get(s.id)||[]).sort((a,b)=>b.score-a.score);
    const doneToday=last.get(s.id)===today;
    if(!r.length&&!doneToday)continue;
    const top=r[0]||{kind:'today',score:0,reason:'오늘 불렀어요'};
    out.push({songId:s.id,title:String(s.title||'곡'),kind:top.kind,reason:top.reason,extra:doneToday&&r.length?'오늘 불렀어요':r[1]?.reason||'',score:top.score,doneToday});
  }
  // Not sung today first, by score (ties keep the songs' order).
  out.sort((a,b)=>(a.doneToday-b.doneToday)||(b.score-a.score));
  const fresh=out.filter(x=>!x.doneToday);
  return (fresh.length?fresh:out).slice(0,limit);
}
/** 랜덤: one of my songs at random (보류 and deleted left out; one not sung today when there is one). rand: () => [0,1). */
function random(db,{today,media=[],rand=Math.random}={}){
  const songs=live(db,'songs').filter(s=>s.repertoire?.status!=='paused');
  if(!songs.length)return null;
  const sungToday=new Set([...list(db?.practices).filter(p=>p&&p.date===today&&p.practiceMode!=='training').map(p=>p.songId),...list(media).filter(m=>m?.date===today).map(m=>m.songId)]);
  const pool=songs.filter(s=>!sungToday.has(s.id)),from=pool.length?pool:songs;
  const s=from[Math.min(from.length-1,Math.floor(rand()*from.length))];
  return {songId:s.id,title:String(s.title||'곡')};
}
return {pick,random,PERF_DAYS,LESSON_DAYS,STALE_DAYS};
});
