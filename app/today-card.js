/* 오늘 연습 — ONE list on home for today's goals and today's practice records (pure: no DOM, storage or network; also
 * loaded by Node tests). The view is design-system/today-card-html.js; home wires it (design-system/student-home-app.js).
 *
 * A goal is "what I meant to do", a practice record "what I did" (owner, 2026-11-26). So:
 *   계획 rows  = today's goals (homework, routine and personal goals), each with the minutes of the records linked to it.
 *   추가 rows  = today's practice records linked to no goal. They are never turned into goals, so "계획 n/m" and the
 *                homework / routine counts stay what was planned.
 * A record belongs to a goal when it is that goal's own row 'goal:<goalId>' (app/goal-routines.js perform), when it
 * names the goal in goalId (the field the goal row already carries; link() writes it on an existing record), or — for
 * a homework goal — when it is a practice of that homework (completed / guidedExerciseKey, the rule of
 * VzipGoalRoutines.otherMinutes). Linking never adds a row or minutes: the record's own minutes move under the goal.
 * The rows of one 오늘의 연습 run (practiceSetId) are one 추가 row — except 따라 하기 (a set of one step), whose run row
 * belongs to the goal made from it. Every 분 comes from the records (VzipPracticeTime). */
(function(root,factory){
  const api=factory();
  root.VzipTodayCard=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='object'?window:globalThis,function(){
'use strict';
const node=typeof module==='object'&&module.exports;
const Time=node?require('./practice-time-model.js'):globalThis.VzipPracticeTime;
const Home=()=>node?require('./student-home-model.js'):globalThis.VzipStudentHomeModel;
const Routines=()=>node?require('./goal-routines.js'):globalThis.VzipGoalRoutines;
const list=v=>Array.isArray(v)?v:[];
const pad=n=>String(n).padStart(2,'0');
const isDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v);
const shift=(date,n)=>{const [y,m,d]=date.split('-').map(Number),at=new Date(y,m-1,d,12);at.setDate(at.getDate()+n);return at.getFullYear()+'-'+pad(at.getMonth()+1)+'-'+pad(at.getDate());};
/** Sources that are not "something I chose to practise": they never make a repeat hint. */
const NOT_CHOSEN=new Set(['goal','practice-set','voice-check','recording','unconfirmed']);
const CATEGORIES=['호흡','발성','음감','리듬','가사'];
function records(db,date){
  const gone=new Set(list(db?.deleted?.practices).map(String));
  return Time.records(db?.practices).filter(p=>p&&p.date===date&&!gone.has(String(p.id))&&!p.deleted);
}
function goalsOn(db,date){
  const gone=new Set(list(db?.deleted?.dailyGoals).map(String));
  return list(db?.dailyGoals).filter(g=>g&&g.date===date&&!gone.has(String(g.id)));
}
/** The goal a record belongs to among `goals` ('' for none). */
function goalOf(p,goals){
  const ids=new Set(goals.map(g=>g.id)),id=String(p.id||'');
  if(id.startsWith('goal:')&&ids.has(id.slice(5)))return id.slice(5);
  if(p.goalId&&ids.has(p.goalId))return p.goalId;
  if(p.dailySet||p.practiceSetId){
    // 따라 하기 (a set of ONE step 'guide:<key>', app/daily-set-model.js) done is a practice of the goal made from it — the
    // goal its save checked: a homework goal by the assignment, a recommendation by the exercise's key.
    const items=list(p.dailySet?.items),one=items.length===1?items[0]:null;
    if(!one||!String(one.id||'').startsWith('guide:')||one.state!=='done')return '';
    const key=String(one.id).slice(6),g=goals.find(g=>g.sourceId&&(g.source==='homework'?list(p.completed).includes(g.sourceId):g.sourceId===key));
    return g?g.id:'';
  }
  const hw=goals.find(g=>g.source==='homework'&&g.sourceId&&(list(p.completed).includes(g.sourceId)||p.guidedExerciseKey===g.sourceId));
  return hw?hw.id:'';
}
const clock=ms=>{const d=new Date(Number(ms));return Number.isFinite(d.getTime())&&Number(ms)>0?pad(d.getHours())+':'+pad(d.getMinutes()):'';};
/** What a record was: its 분류 and its song, as far as they are known. */
function describe(p,songTitle){
  const song=p.songId?songTitle(p.songId)||'':'';
  const cat=[p.categoryLabel,p.detail].map(x=>String(x||'').trim()).filter(Boolean).filter((x,i,a)=>a.indexOf(x)===i)[0]||'';
  return {song,cat};
}
/** A record that can be edited in place (곡·분류·메모) and linked: one the person wrote, not a screen's own row. */
const own=p=>p.practiceTimeSource==='manual'&&!p.dailySet&&!p.practiceSetId&&!String(p.id||'').startsWith('goal:');
function plainTitle(p,songTitle){
  const {song,cat}=describe(p,songTitle);
  return [cat,song].filter(Boolean).join(' · ');
}
/**
 * Today's one list. options: {today, songTitle(id)}. Returns
 *   plan  [{id, title, done, source, tag, minutes, routine}]          (goal order, as home always showed it)
 *   extra [{id, title, minutes, editable, linkable, undecided, songId, category, memo, kind:'record'|'set'}]
 *   counts {planDone, planTotal, extra}
 *   open  [{id, minutes, label}]  today's unlinked records a goal can take ('오늘 기록 연결' chips)
 */
function build(db={},{today,songTitle=()=>''}={}){
  if(!isDate(today))throw Error('오늘 날짜를 확인해 주세요.');
  const H=Home(),R=Routines();
  const goals=H.build(db,{today}).goals,rows=records(db,today);
  const byGoal=new Map(goals.map(g=>[g.id,0])),extra=[],sets=new Map();
  for(const p of rows){
    const minutes=Time.actualMinutes(p);
    const g=goalOf(p,goals);
    if(g){byGoal.set(g,(byGoal.get(g)||0)+minutes);continue;}
    if(!(minutes>0))continue;
    if(p.dailySet||p.practiceSetId){
      const key=String(p.practiceSetId||p.id);
      if(!sets.has(key)){sets.set(key,{id:'set:'+key,kind:'set',title:'오늘의 연습',minutes:0,editable:false,linkable:false,undecided:false,created:Number(p.created)||0});extra.push(sets.get(key));}
      sets.get(key).minutes+=minutes;continue;
    }
    const {song,cat}=describe(p,songTitle),title=plainTitle(p,songTitle);
    extra.push({id:String(p.id),kind:'record',title:title||'연습 · '+(clock(p.created)||clock(p.updatedAt)||'시간 모름')+' · 아직 안 정함',
      minutes,editable:own(p),linkable:!String(p.id).startsWith('goal:'),undecided:!title,songId:song?p.songId:'',category:String(p.categoryLabel||'').trim(),memo:String(p.memo||''),created:Number(p.created)||0});
  }
  const routines=R.routines(db).map(r=>r.id);
  const plan=goals.map(g=>{
    const rid=R.routineOf(g),info=rid&&routines.includes(rid)?R.progress(db,rid,today):null;
    const tag=info?(g.source==='homework'?'숙제 반복 ':'반복 ')+info.done+'/'+info.total:g.source==='homework'?'숙제':'계획';
    return {id:g.id,title:String(g.title||'목표'),done:g.completed===true,source:g.source||'personal',tag,minutes:Math.round(byGoal.get(g.id)||0),routine:!!info};
  });
  for(const x of extra)x.minutes=Math.round(x.minutes);
  return {today,plan,extra,counts:{planDone:plan.filter(x=>x.done).length,planTotal:plan.length,extra:extra.length},
    open:extra.filter(x=>x.linkable).map(x=>({id:x.id,minutes:x.minutes,label:x.undecided?'연습 '+x.minutes+'분':x.title+' '+x.minutes+'분'}))};
}
/** Link today's unlinked record to a goal: the goal is checked and the record names it (goalId). No row is added and
 * no minutes change, so the time is counted once. A homework goal also gets the record as one practice of that
 * homework ("N회", as a goal's own row does); the homework itself is never marked done. Call inside VZ.change. */
function link(db,{goalId,practiceId}){
  const goal=list(db.dailyGoals).find(g=>g&&g.id===goalId);
  if(!goal)throw Error('이 계획이 바뀌었어요. 화면을 새로 열어 주세요.');
  const p=list(db.practices).find(x=>x&&x.id===practiceId);
  if(!p||p.date!==goal.date)throw Error('연결할 기록을 찾지 못했어요.');
  if(String(p.id).startsWith('goal:')||p.dailySet||p.practiceSetId)throw Error('이 기록은 연결할 수 없어요.');
  const goals=goalsOn(db,goal.date),now=goalOf(p,goals);
  if(now&&now!==goalId)throw Error('이미 다른 계획에 연결된 기록이에요.');
  if(!Home().setGoal(db,goalId,true))throw Error('이 계획이 바뀌었어요. 화면을 새로 열어 주세요.');
  p.goalId=goalId;
  if(goal.source==='homework'&&goal.sourceId){
    const id=String(goal.sourceId);
    if(!list(p.completed).includes(id)){p.completed=[...list(p.completed),id];p.assignmentReps={...(p.assignmentReps||{}),[id]:1};}
  }
  return true;
}
/** "을" or "를" after a name: Hangul by its last sound; other words by their last letter, as they are usually read. */
function object(word){
  const t=String(word||'').trim(),c=t.charCodeAt(t.length-1);
  if(c>=0xAC00&&c<=0xD7A3)return (c-0xAC00)%28?'을':'를';
  if(/[0-9]$/.test(t))return /[013678]$/.test(t)?'을':'를';
  return /[aeiouyw]$/i.test(t)?'를':'을';
}
/**
 * The same unplanned song or 분류 as 추가 on three different days of the last seven: ONE suggestion to make it a
 * routine. Only records the person chose (no screen's own rows), linked to no goal of their day. Skipped when today's
 * goals or a running routine already have that title. Returns {key, label, title, days, text} or null.
 */
function repeatHint(db={},{today,songTitle=()=>'',days=7,min=3}={}){
  if(!isDate(today))return null;
  const R=Routines(),seen=new Map();
  for(let i=0;i<days;i++){
    const date=shift(today,-i),goals=goalsOn(db,date);
    for(const p of records(db,date)){
      if(NOT_CHOSEN.has(p.practiceTimeSource)||p.dailySet||p.practiceSetId||!(Time.actualMinutes(p)>0)||goalOf(p,goals))continue;
      const {song,cat}=describe(p,songTitle),key=song?'song:'+p.songId:cat?'cat:'+cat:'';
      if(!key)continue;
      const x=seen.get(key)||{key,label:song||cat,dates:new Set(),last:''};
      x.dates.add(date);if(date>x.last)x.last=date;seen.set(key,x);
    }
  }
  const titles=new Set([...goalsOn(db,today).map(g=>String(g.title||'').trim()),...R.routines(db).filter(r=>R.active(r,today)).map(r=>String(r.title||'').trim())]);
  const best=[...seen.values()].map(x=>({...x,title:x.label+' 연습'})).filter(x=>x.dates.size>=min&&!titles.has(x.title)&&!titles.has(x.label))
    .sort((a,b)=>b.dates.size-a.dates.size||b.last.localeCompare(a.last))[0];
  return best?{key:best.key,label:best.label,title:best.title,days:best.dates.size,text:'요즘 ‘'+best.label+'’'+object(best.label)+' 자주 하네요'}:null;
}
return {CATEGORIES,build,link,repeatHint,goalOf,object,own};
});
