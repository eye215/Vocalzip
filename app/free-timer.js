/* 타이머만 켜기 (오늘 연습 한 장, 2026-11-26): a free practice clock started from the 오늘 연습 card with no questions.
 * The clock is 오늘의 연습's own (app/practice-set-model.js): a one-step session counted by the wall clock (P.tick), so
 * another app, a locked phone or a reload loses nothing, and a stretch away of more than three hours (P.LONG_GAP_MS) is
 * never counted by itself — the card asks how to count it (P.resolveAway). While it runs, the session lives in this
 * device's account-scoped storage like the set's running session (a UI draft); nothing reaches the synced records until
 * 멈추기, which saves at once, with no question, ONE practice record of the real minutes — written by the same code as
 * 연습 기록 시트 (VZ.writePractice) — rounded as the set rounds (whole minutes); under a minute nothing is saved.
 * The small pill on every screen is app/practice-set-mini.js (it reads V.freeTimer). Only one clock at a time: it does
 * not start while today's set is in hand (that clock would count the same minutes), and the set does not start while
 * this one runs (app/practice-set.js). */
(()=>{
'use strict';
const V=window.VZ,P=window.VzipPracticeSet;
if(!V||!P||typeof document==='undefined')return;
const owner=()=>window.vzipCloudUserId?.()||window.VzipAccountScope?.owner||'local';
const store=()=>window.VzipAccountScope?.storage||window.localStorage;
const KEY=()=>'vzip_free_timer_live:'+owner();
const MIN_SECONDS=60;
let session=null,loadedFor='',timer=null,note=null;
const watchers=new Set();
const changed=()=>{for(const fn of watchers){try{fn();}catch(e){console.error(e);}}};
function persist(){try{if(session)store().setItem(KEY(),JSON.stringify(session));else store().removeItem(KEY());}catch{}}
function load(){
  if(loadedFor===owner())return session;
  loadedFor=owner();session=null;
  try{session=P.restore(JSON.parse(store().getItem(KEY())||'null'));}catch{session=null;}
  // Reloaded (or reopened by iOS) while running: the time away is counted once, from the stored moment.
  if(session?.running){P.tick(session,Date.now(),{away:true});persist();}
  if(session?.running)ensure();
  return session;
}
/** One redraw a second while it runs. Only draws: the time itself is the stored moment plus the wall clock. */
function ensure(){
  if(timer)return;
  timer=setInterval(()=>{
    if(!session?.running){clearInterval(timer);timer=null;changed();return;}
    if(document.hidden)return;
    P.tick(session,Date.now());
    if(!session.running)persist(); // a long gap stopped it: kept until the singer says how to count it
    changed();
  },1000);
}
document.addEventListener('visibilitychange',()=>{
  if(!session?.running||loadedFor!==owner())return;
  P.tick(session,Date.now(),{away:true});persist();if(!document.hidden)changed();
});
window.addEventListener('pagehide',()=>{if(session?.running){P.tick(session,Date.now());persist();}});
window.addEventListener('pageshow',e=>{if(e.persisted&&session?.running){P.tick(session,Date.now(),{away:true});persist();changed();}});
// Signing out stops counting (time in a signed-out app is not practice); the kept session stays with its account.
window.VzipAccountScope?.beforeLeave?.(()=>{if(session?.running){P.pause(session,Date.now());persist();}session=null;loadedFor='';note=null;changed();});
const seconds=s=>Math.round(Number(s.steps[0].elapsed)||0);
const minutesOf=sec=>Math.min(600,Math.round(sec/60));
/** The set in hand (started, not saved): its clock would count the same minutes. */
const setBusy=()=>{try{const e=V.practiceSetEntry?.();return e?.state==='live'||e?.state==='summary';}catch{return false;}};
V.freeTimer={
  /** null when off; else {running, away, seconds, text ('15:02'), date, awaySeconds}. Reading it writes nothing. */
  state(){
    const s=load();if(!s)return null;
    const sec=Math.round(P.elapsedNow(s,Date.now())),away=P.awayInfo(s);
    return {running:!!s.running,away:!!away,seconds:sec,text:V.clock(sec),date:s.date,awaySeconds:away?Math.round(away.seconds):0};
  },
  running(){return !!load();},
  /** Can it start now? '' when yes, else why not (said inline on the card). */
  blocked(){return load()?'':setBusy()?'오늘의 연습이 진행 중이에요. 그 연습을 마치거나 저장한 뒤에 켤 수 있어요.':'';},
  start(){
    if(load())return true;
    const why=V.freeTimer.blocked();if(why)throw Error(why);
    const now=Date.now();
    session=P.start([{id:'free',kind:'free',title:'연습',minutes:600}],{id:V.uid(),date:V.today(),now});
    P.play(session,now);loadedFor=owner();note=null;
    persist();ensure();changed();return true;
  },
  /** 멈추기: saved at once as one practice record. {saved:true, minutes, id, date} | {saved:false, short:true, seconds}. */
  stop(){
    const s=load();if(!s)return null;
    if(P.awayInfo(s))throw Error('자리를 비운 시간을 어떻게 셀지 먼저 골라 주세요.');
    P.pause(s,Date.now());
    const sec=seconds(s),date=s.date;
    if(sec<MIN_SECONDS){session=null;persist();note={short:true,seconds:sec,at:Date.now()};changed();return {saved:false,short:true,seconds:sec};}
    const minutes=minutesOf(sec),id=V.uid(),created=Date.now();
    const write=db=>{V.writePractice(db,{date,minutes,mode:'training'},null,{id,created});};
    if(!V.change(write,{silent:true})){
      // Not saved: the clock goes on from where it was, so no time is lost; the singer can stop again.
      P.play(s,Date.now());persist();ensure();changed();
      throw Error('연습 기록을 저장하지 못했어요. 타이머는 계속 돌아가요. 다시 멈춰 주세요.');
    }
    session=null;persist();note={saved:true,minutes,id,date,at:Date.now()};changed();
    return {saved:true,minutes,id,date};
  },
  /** A stretch away of more than three hours: 'all' counts it, 'none' leaves it out; then it saves as 멈추기 does. */
  resolveAway(choice){
    const s=load();if(!s||!P.awayInfo(s))return null;
    P.resolveAway(s,choice==='all'?'all':'none');persist();
    return V.freeTimer.stop();
  },
  /** The last stop's result for a short note on the card ({short, seconds} or {saved, minutes}); kept a minute. */
  note(){return note&&Date.now()-note.at<60000?note:null;},
  watch(fn){watchers.add(fn);return ()=>watchers.delete(fn);}
};
load();
})();
