/* VOCAL.zip 성장 데이터셋 — the ONE place that decides which recordings count for growth and what a "take" is.
 * Pure (no DOM, no storage): give it the media list and the records (db), read the answer. Read-only.
 *
 *   const ds = VzipGrowthDataset.build(media, db, env)
 *   ds.rows                 one row per recording, in list order: song, date, category, analysis, reliability, take
 *   ds.pick(rule)           the rows a screen counts (list order);  ds.items(rule) the recordings themselves
 *   ds.why(row, rule)       '' when the row counts, otherwise the reason it does not (REASONS)
 *                           A recording whose id is in the deleted list (db.deleted.media) counts for no rule.
 *   ds.tally(rule)          how many rows each reason kept out
 *   ds.bySong(rule)         Map songId → rows of that song, oldest first (G.takeOrder)
 *   ds.takes(rule, songId)  that song's analysed takes, oldest first
 *   ds.forRange()           the selection for the range timeline (step 2), each take with its group
 *
 * A take is always {id, songId, a, date, created, ok} (VzipGrowthDataset.take). `ok` is the one reliability rule of the
 * growth screens: an analysis version the growth rules read (v1 or v2) that the analyser's own check trusts —
 * VZ.analysisReliable is passed in as env.reliable, never re-implemented here.
 *
 * RULES are what each screen does today, written down. They differ on purpose (see docs in each rule): this module
 * does not unify them, it only makes each difference a named option.
 *
 * env (the app passes VZ.media's own functions, tests pass simple ones):
 *   reliable(analysis) → boolean                       required
 *   dateOf(m) → 'YYYY-MM-DD' | ''                      default: VzipGrowthDataset.dateOf — the recorded date, or for a
 *                                                      recording without one the KOREA day it was made (never the
 *                                                      device's day: every growth screen dates a recording alike)
 *   owner(m) → {practice?, lesson?}                    default: the first practice / lesson that lists the recording
 *   category(m) → 'song'|'lesson'|'training'|'room'    default: m.recordingCategory, else 'song'
 *   isVideo(m) → boolean                               default: m.type starts with 'video/'
 *   song(id) → the song or undefined                   default: db.songs
 *   analysisOf(m) → analysis | null                    default: m.analysis
 *   takeOrder(a, b)                                    default: VzipGrowthMetrics.takeOrder */
(function(root,factory){
'use strict';
const node=typeof module==='object'&&module.exports;
const api=factory(()=>root.VzipGrowthMetrics||(node?require('./growth-metrics-model.js'):null));
if(node)module.exports=api;
else{
 root.VzipGrowthDataset=api;
 /* The app's entry: VZ.growthDataset(items) with VZ.media's own date, owner, category and video rules.
  * One build per list for the task in hand (a screen being drawn): dropped at the end of the task and on every
  * change, so an answer is never older than the list and the records it was built from. */
 const V=root.VZ;
 if(V){
  const env=()=>{const M=V.media||{};return {reliable:a=>!!V.analysisReliable?.(a),dateOf:api.dateOf,owner:M.owner,
   category:M.recordingCategory&&(m=>M.recordingCategory(m)||'song'),isVideo:M.isVideo,song:V.song};};
  let last=null;
  const drop=()=>{last=null;};
  for(const name of ['vzip:data-changed','vzip:analysis-saved','vzip:v6-media'])root.addEventListener?.(name,drop);
  V.growthDataset=(items,extra)=>{
   if(extra)return api.build(items,V.db,{...env(),...extra});
   if(last?.items===items&&last.db===V.db)return last.ds;
   last={items,db:V.db,ds:api.build(items,V.db,env())};
   queueMicrotask(drop);
   return last.ds;
  };
  /** One recording's reliability and take, by the same rules as the rows. */
  V.growthDataset.ok=m=>api.reliable(m?.analysis,env().reliable);
  V.growthDataset.take=m=>api.take(m,m.analysis,api.dateOf(m),api.reliable(m?.analysis,env().reliable));
  /** The day of a recording on every growth screen (recorded date, else the Korea day it was made). */
  V.growthDataset.dateOf=api.dateOf;
 }
}
})(typeof self!=='undefined'?self:globalThis,metrics=>{
'use strict';
const VERSIONS=[1,2];                       // the analysis versions the growth rules read
const isDay=s=>/^\d{4}-\d{2}-\d{2}/.test(String(s||''));
/** 'YYYY-MM-DD' of a date string, '' when it is not one. */
const day=s=>isDay(s)?String(s).slice(0,10):'';
/** Calendar day in Korea (UTC+9, no DST) of a millisecond timestamp; '' when there is none. */
const KST=9*3600000;
const koreaDay=ms=>{const n=Number(ms);return ms!=null&&ms!==''&&Number.isFinite(n)&&n>0?new Date(n+KST).toISOString().slice(0,10):'';};
/** A recording's day: the date it was recorded on when it has one, otherwise the Korea day of its `created` time —
 * the same on every device, wherever it is (as 주간 요약 always did). '' when it has neither. */
const dateOf=m=>/^\d{4}-\d{2}-\d{2}$/.test(m?.recordedDate||'')?m.recordedDate:koreaDay(m?.created);
/** The reliability of a take: a version the growth rules read, trusted by the analyser's own check (passed in). */
const reliable=(a,check)=>VERSIONS.includes(a?.v)&&!!check?.(a);
/** The one shape of a take. `ok` is given by the caller only where a screen has its own rule (the A/B table). */
const take=(m,a,date,ok)=>({id:m.id,songId:m.songId||'',a,date,created:m.created,ok:!!ok});

/* Why a recording does not count. The words are for people reading a report or a test, not for the screen. */
const REASONS={
 'no-song':'곡이 지정되지 않은 녹음',
 'song-missing':'지정된 곡이 삭제됐거나 없는 녹음',
 'practice-room':'노래 연습실 제출 녹음',
 'training-practice':'트레이닝 연습 기록에 연결된 녹음',
 'video':'영상',
 'deleted':'삭제 목록에 있는 녹음',
 'no-analysis':'분석 결과가 없는 녹음',
 'unreliable':'측정 신뢰도가 낮은 분석',
 'no-date':'날짜가 없는 녹음',
 'unassigned':'곡·레슨·트레이닝·보이스 체크 어디에도 속하지 않는 녹음'
};
/* What each screen counts TODAY. Options: room / training (recordings linked to a 연습실 submission / a 트레이닝
 * practice), video (true | false | 'cloud' = only videos kept in the cloud), unknownSong (the song need not exist),
 * unassigned (a recording without a song is not turned away). */
const RULES={
 // 판정 지표 — 전체 분석 · 월별 분석 · 주간 요약의 성장 · 계획 결과: the song's recordings without 연습실 submissions
 // and 트레이닝 practices. Videos count. A recording tagged 트레이닝/연습실 by hand, or a lesson recording, counts
 // as long as it has a song (only the linked practice record is looked at).
 verdict:{room:false,training:false,video:true},
 // 보컬 분석 탭의 곡 행 and the recordings 보컬 연구소 lists for a song: every recording of the song — 연습실
 // submissions and 트레이닝 practices too (row.practiceTake: shown with a 연습 label, because the verdict screens
 // leave them out) and videos (as the verdict screens count them; shown with a 영상 label).
 songList:{room:true,training:true,video:true},
 // 곡별 "보컬 측정 변화" 카드: every recording handed in for the song; videos only when they are in the cloud.
 songCard:{room:true,training:true,video:'cloud',unknownSong:true,unassigned:true}
};
const ruleOf=rule=>typeof rule==='string'?RULES[rule]:rule;
function decide(r,rule){
 if(r.deleted)return 'deleted';               // every rule: a recording in the deleted list is gone, whatever the media list says
 if(!r.songId&&!rule.unassigned)return 'no-song';
 if(r.songId&&!rule.unknownSong&&!r.hasSong)return 'song-missing';
 if(!rule.room&&r.room)return 'practice-room';
 if(!rule.training&&r.training)return 'training-practice';
 if(r.video&&(rule.video===false||(rule.video==='cloud'&&!r.cloud)))return 'video';
 return '';
}
/** The first practice / lesson that lists the recording (as VZ.media.owner does), for use without the app. */
function ownerIndex(db){
 const lessons=new Map(),practices=new Map();
 for(const l of db?.lessons||[])for(const r of l?.recordings||[])if(r&&!lessons.has(r.id))lessons.set(r.id,l);
 for(const p of db?.practices||[])for(const id of p?.mediaIds||[])if(!practices.has(id))practices.set(id,p);
 return m=>{const lesson=lessons.get(m.id),practice=practices.get(m.id);return lesson?{kind:'lesson',lesson,practice}:practice?{kind:'practice',practice}:{kind:m.source==='lesson'?'lesson':'practice'};};
}
const CATEGORIES=['song','lesson','training','room'];

function build(media,db={},env={}){
 if(typeof env.reliable!=='function')throw Error('분석 신뢰도 함수(reliable)가 필요해요.');
 const G=metrics();
 const order=env.takeOrder||G?.takeOrder;
 if(typeof order!=='function')throw Error('녹음 순서 기준(takeOrder)을 불러오지 못했어요.');
 const dayOf=env.dateOf||dateOf,owner=env.owner||ownerIndex(db),isVideo=env.isVideo||(m=>String(m?.type||'').startsWith('video/'));
 const category=env.category||(m=>CATEGORIES.includes(m?.recordingCategory)?m.recordingCategory:'song');
 const analysisOf=env.analysisOf||(m=>m?.analysis),findSong=env.song||(id=>(db?.songs||[]).find(s=>s.id===id));
 const songs=new Map(),hasSong=id=>{let x=songs.get(id);if(x===undefined)songs.set(id,x=!!findSong(id));return x;};
 const gone=new Set(db?.deleted?.media||[]);
 /* One row per recording. What every screen asks is read once here; the rest is worked out on first use. */
 class Row{
  constructor(m,index){
   this.m=m;this.id=m.id;this.index=index;this.songId=m.songId||'';
   this.hasSong=!!this.songId&&hasSong(this.songId);
   const practice=owner(m)?.practice;
   this.practice=practice||null;
   this.room=!!practice?.practiceRoom;                 // a 노래 연습실 submission
   this.training=practice?.practiceMode==='training';  // a 트레이닝 practice (보이스 체크 included)
   this.date=day(dayOf(m));
   this.a=analysisOf(m)||null;
   this.analysed=!!this.a?.metrics;
  }
  /** Reliable enough to compare (the take's `ok`). */
  get ok(){return this._ok??=reliable(this.a,env.reliable);}
  /** An analysis the growth rules can read: measured, version 1 or 2. */
  get readable(){return this.analysed&&VERSIONS.includes(this.a.v);}
  get take(){return this._take??=take(this.m,this.a,this.date,this.ok);}
  get category(){return this._category??=category(this.m)||'song';}
  get video(){return this._video??=!!isVideo(this.m);}
  /** A 노래 연습실 submission or the recording of a 트레이닝 practice: 보컬 분석 lists it (marked 연습), the verdict
   * screens (결과 리포트 · 주간 요약 · 계획 결과) do not count it. */
  get practiceTake(){return this.room||this.training;}
  get cloud(){return !!this.m.cloud;}
  /** A 매일 보이스 체크 recording: marked on the file, or the file of a voice-check practice. */
  get voiceCheck(){return !!this.m.voiceCheck||this.m.origin==='voice-check'||(!!this.practice?.voiceCheck&&this.practice.voiceCheck.mediaId===this.id);}
  /** Its id is in the deleted list although the media list still has it. */
  get deleted(){return gone.has(this.id);}
 }
 const rows=(media||[]).map((m,i)=>new Row(m,i)),byMedia=new Map(rows.map(r=>[r.m,r]));
 const sorted=list=>list.slice().sort((x,y)=>order(x.take,y.take));
 const picked=new Map(),grouped=new Map();
 const ds={
  rows,VERSIONS,
  /** The row of a recording of this list (by the object, or by id). */
  row:m=>byMedia.get(m)||rows.find(r=>r.id===(m?.id??m))||null,
  why:(row,rule)=>decide(row,ruleOf(rule)),
  pick(rule){
   const key=typeof rule==='string'?rule:JSON.stringify(rule);
   let out=picked.get(key);
   if(!out){const r=ruleOf(rule);picked.set(key,out=rows.filter(row=>!decide(row,r)));}
   return out;
  },
  items:rule=>ds.pick(rule).map(r=>r.m),
  tally(rule){const r=ruleOf(rule),out={included:0};for(const row of rows){const why=decide(row,r)||'included';out[why]=(out[why]||0)+1;}return out;},
  bySong(rule){
   const key=typeof rule==='string'?rule:JSON.stringify(rule);
   let out=grouped.get(key);
   if(!out){
    out=new Map();
    for(const row of ds.pick(rule)){const list=out.get(row.songId)||[];list.push(row);out.set(row.songId,list);}
    for(const [id,list] of out)out.set(id,sorted(list));
    grouped.set(key,out);
   }
   return out;
  },
  takes:(rule,songId)=>(ds.bySong(rule).get(songId)||[]).filter(r=>r.analysed).map(r=>r.take),
  /** 음역 변화 (step 2): reliable, dated analyses of song recordings, 매일 보이스 체크, 트레이닝 and lesson recordings.
   * Files that belong nowhere (no song, not a lesson, training or voice check), 연습실 submissions and recordings in
   * the deleted list stay out. Oldest first; each take carries its group. `left` names the recordings that do belong
   * to a group but are not takes (not analysed, unreliable, no date), with their group and day, so a month can say
   * how many it left out and why. */
  forRange(){
   const takes=[],left=[],counts={song:0,'voice-check':0,training:0,lesson:0},excluded={};
   const out=why=>{excluded[why]=(excluded[why]||0)+1;};
   for(const r of rows){
    if(r.deleted){out('deleted');continue;}
    const kind=r.category;
    const group=r.voiceCheck?'voice-check':kind==='lesson'?'lesson':kind==='training'||r.training?'training':r.room||kind==='room'?'':r.songId&&r.hasSong?'song':'';
    if(!group){out(r.room||kind==='room'?'practice-room':r.songId?'song-missing':'unassigned');continue;}
    const why=!r.analysed?'no-analysis':!r.ok?'unreliable':!r.date?'no-date':'';
    if(why){out(why);left.push({id:r.id,group,date:r.date,why});continue;}
    counts[group]++;takes.push({...r.take,group});
   }
   return {takes:takes.sort(order),counts,excluded,left};
  }
 };
 return ds;
}
return {VERSION:2,VERSIONS,RULES,REASONS,build,take,reliable,day,decide,dateOf,koreaDay};
});
