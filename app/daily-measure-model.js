/* 오늘의 연습 — what the three measuring exercises of 호흡 · 리듬 · 비브라토 read from the mic, as numbers for 기본기 단계
 * — and of 음정 · 음역 (스케일) and 소리 길 (사이렌) — (pure model: no DOM, storage or network; also loaded by Node tests). The doing screen (app/daily-set-run.js) reads
 * the mic live on the device and hands this model plain numbers; no audio is kept or sent anywhere. The step table
 * these numbers are compared with is app/levels-model.js (SKILLS · breath / rhythm / vibrato).
 *
 *   “스~” 길게 (hiss)      level frames {t, rms[, d]} → the longest continuous hiss: the noise floor is taken from the
 *                         first HISS.calibrate seconds; a frame counts when its level is HISS.ratio × the floor or more;
 *                         a gap longer than HISS.gap ends the hiss. `even` = how much the loudness moves over the
 *                         middle of it (dB, smaller = steadier; being louder never helps).
 *   “타” 따라 하기 (rhythm) the app plays a count-in, then a bar of “타” to listen to and a bar to say it back, four times
 *                         per round. Onsets come from the level frames (a fast rise above the floor). The output and
 *                         input delay of the device is handled honestly, and the run says which way was used:
 *                           'echo'   the count-in clicks were heard by the mic (no earphones): their round trip is
 *                                    measured and taken off, so a steady lateness still counts against the beat;
 *                           'median' nothing came back (earphones): the person's own middle offset is taken off and
 *                                    only the spread around it is scored.
 *                         Around each click that leaks into the mic the onset threshold is raised (RHYTHM.guard), so
 *                         the click itself is never taken for a “타”.
 *   비브라토 (vibrato)     a pitch track {t, cents|null} of an 8-second long tone; 1-second windows are tested like the
 *                         sustained notes of 소리 길 흔적 (app/voice-path-model.js, its VIBRATO_* thresholds are read
 *                         from there and not copied): rate 4–8 Hz, extent ≥ 15 cent, regularity ≥ 0.4.
 *   스케일 (scale)       the app plays a 5-note scale (도레미파솔파미레도), or once 음정 4단계 is earned the octave
 *                         arpeggio (도미솔도'솔미도), then the person sings it back alone to the beat shown on screen.
 *                         Each note is read in the middle of its beat (SCALE.skip of it left out: the voice is a little
 *                         late); right = the middle reading within SCALE.tolerance cent (an octave apart counts).
 *                         The top note lasts SCALE.top seconds: held steadily for RULES.comfortSeconds (2 s) it is a
 *                         comfortable note for 음역. The key rises a semitone a round and stops where the top is no
 *                         longer held comfortably (never pushed past the comfortable range for a high note).
 *   사이렌 (siren)        a pitch track {t, midi|null} of one glide up and back down on “우~”: how far it went
 *                         (semitones), the breaks (silence longer than SIREN.gap inside it) and the flips (a sudden
 *                         jump of SIREN.flip semitones or more that stays — a register break; a one-reading spike of
 *                         the pitch reader is smoothed away first), and whether it came back down.
 * EVERY number below is a first guess, to be checked on a real iPhone. */
(function(root,factory){
  const node=typeof module==='object'&&module.exports;
  const vp=()=>{try{return node?require('./voice-path-model.js'):root.VzipVoicePath;}catch{return null;}};
  const api=factory(vp);
  if(node)module.exports=api;else root.VzipDailyMeasure=api;
})(typeof self!=='undefined'?self:globalThis,vp=>{
'use strict';
const list=v=>Array.isArray(v)?v:[];
const fin=v=>typeof v==='number'&&Number.isFinite(v);
const round1=n=>Math.round(n*10)/10;
const round2=n=>Math.round(n*100)/100;
const median=a=>{if(!a.length)return null;const s=a.slice().sort((x,y)=>x-y),m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};
const mean=a=>a.length?a.reduce((n,x)=>n+x,0)/a.length:0;
const sd=a=>{if(a.length<2)return 0;const m=mean(a);return Math.sqrt(a.reduce((n,x)=>n+(x-m)**2,0)/a.length);};
const db=rms=>20*Math.log10(Math.max(1e-7,rms));

/* ====================================================================================================
 * 호흡 · “스~” 길게
 * ==================================================================================================== */
const HISS={
  calibrate:.5,   // s: the noise floor is the middle level of this first stretch (the person is asked to be quiet)
  ratio:2.5,      // a hiss frame is this many times the floor (≈ +8 dB) …
  floorMin:.0015, // … and never under this level (a very quiet room)
  gap:.25,        // s: a quieter stretch longer than this ends the hiss
  start:.2,       // s: a hiss starts once it has gone on this long (a short noise is not a start)
  missing:.1,     // s: frames missing for longer than this (the page was slow) are not taken as quiet
  cap:90,         // s: one hiss is never longer than this
  evenWindow:.5,  // s: `even` = SD (dB) of the mean level of these windows …
  evenFrom:.2,evenTo:.8, // … over the middle of the hiss
  evenMinSeconds:6 // a hiss shorter than this has no `even`
};
/** A fresh tracker for one try; t0 = the time (s) the try started (its first HISS.calibrate seconds set the floor). */
const hissStart=(t0=0)=>({t0,cal:[],floor:null,thr:null,seg:null,lastT:null,runs:[],ended:false});
function closeSeg(tr){
  const s=tr.seg;tr.seg=null;if(!s)return;
  const seconds=s.last-s.from;
  if(seconds>=HISS.start){tr.runs.push({from:s.from,to:s.last,seconds,frames:s.frames});tr.ended=true;}
}
/** Feed level frames [{t (end of the frame, s), rms, d? (its length, s)}] in time order. Returns the tracker. */
function hissFeed(tr,frames){
  for(const f of list(frames)){
    if(!f||!fin(f.t)||!fin(f.rms))continue;
    if(tr.lastT!=null&&f.t<=tr.lastT)continue;
    const missing=tr.lastT!=null&&f.t-tr.lastT>HISS.missing;tr.lastT=f.t;
    if(f.t<tr.t0+HISS.calibrate){tr.cal.push(f.rms);continue;}
    if(tr.floor==null){tr.floor=median(tr.cal)||0;tr.thr=Math.max(tr.floor*HISS.ratio,HISS.floorMin);}
    const loud=f.rms>=tr.thr,s=tr.seg;
    if(loud){
      if(s&&(f.t-s.last<=HISS.gap||missing)){s.last=f.t;s.frames.push({t:f.t,rms:f.rms});}
      else{closeSeg(tr);tr.seg={from:f.t-(fin(f.d)?f.d:0),last:f.t,frames:[{t:f.t,rms:f.rms}]};}
      if(tr.seg.last-tr.seg.from>=HISS.cap)closeSeg(tr);
    }else if(s&&f.t-s.last>HISS.gap)closeSeg(tr);
  }
  return tr;
}
/** How much the loudness moves over the middle of a hiss (dB SD of HISS.evenWindow means), null when too short. */
function evenOf(run){
  if(!run||run.seconds<HISS.evenMinSeconds)return null;
  const a=run.from+run.seconds*HISS.evenFrom,b=run.from+run.seconds*HISS.evenTo,bins=new Map();
  for(const f of run.frames){if(f.t<a||f.t>b)continue;const k=Math.floor((f.t-a)/HISS.evenWindow);if(!bins.has(k))bins.set(k,[]);bins.get(k).push(f.rms*f.rms);}
  const levels=[...bins.values()].filter(x=>x.length).map(x=>db(Math.sqrt(mean(x))));
  return levels.length>=3?round1(sd(levels)):null;
}
/** Live: seconds of the hiss going on now (0 when none) and whether a hiss has ended. */
const hissNow=tr=>({seconds:tr.seg&&tr.seg.last-tr.seg.from>=HISS.start?tr.seg.last-tr.seg.from:0,hissing:!!tr.seg&&tr.seg.last-tr.seg.from>=HISS.start,ended:tr.ended,floor:tr.floor});
/** The result of a try: {seconds (the longest hiss), even (dB | null), floor}. Closes what is still going on. */
function hissResult(tr){
  closeSeg(tr);
  const best=tr.runs.reduce((b,r)=>!b||r.seconds>b.seconds?r:b,null);
  return {seconds:best?round1(best.seconds):0,even:evenOf(best),floor:tr.floor==null?null:Math.round(db(tr.floor)*10)/10};
}
/** A whole stretch of frames at once (the tests): the tracker fed and closed. */
const hissMeasure=(frames,{t0=list(frames)[0]?.t??0}={})=>hissResult(hissFeed(hissStart(t0),frames));
/** The 기본기 measure of the tries of one exercise: [{seconds, even}] → {area:'breath', …} | null (nothing heard). */
function breathMeasure(tries){
  const ok=list(tries).filter(x=>x&&fin(x.seconds)&&x.seconds>0);
  if(!ok.length)return null;
  // The longest try; `even` of the longest try that has one (a later, even shorter try does not lower the longest).
  const best=ok.reduce((b,x)=>x.seconds>b.seconds?x:b),even=ok.filter(x=>fin(x.even)).sort((a,b)=>b.seconds-a.seconds)[0];
  return {area:'breath',kind:'hiss',value:round1(best.seconds),unit:'초',...(even?{even:even.even,evenSeconds:round1(even.seconds)}:{}),tries:list(tries).length};
}

/* ====================================================================================================
 * 리듬 · “타” 따라 하기
 * ==================================================================================================== */
const RHYTHM={
  bpm:80,fast:104,  // the tempo of a round; steps 4–5 ask for the faster one
  pairs:4,          // listen bar + say-it-back bar, this many times in a round
  lead:.6,          // s of quiet before the count-in (the first .5 s set the floor)
  frame:.005,       // s: one level frame
  above:12,         // dB over the floor for an onset …
  rise:6,           // … rising by this much over the lowest level of the last `look` seconds
  look:.08,
  refractory:.1,    // s: the next onset comes no sooner
  guard:[-.02,.12], // s around a click's measured arrival in the mic where the threshold is raised …
  guardOver:6,      // … to this many dB over the loudest the click itself came back
  echoWindow:.3,    // s after a count-in click where its echo is looked for
  echoSpread:.03,   // s: the echoes agree this well, or they are not echoes
  search:[-.12,.4], // s: the offsets tried when nothing came back (earphones, Bluetooth up to ~0.3 s)
  match:.15,        // s: an onset belongs to a beat within this (and within 0.45 × the shortest gap)
  minMatched:3      // fewer matched onsets: no measure
};
/** The patterns of a level, in beats of a 4-beat bar (one per pair). 1 quarter notes · 2 eighths with rests ·
 * 3 triplets and syncopation. */
const PATTERNS={
  1:[[0,1,2,3],[0,1,2,3],[0,1,2,3],[0,1,2,3]],
  2:[[0,.5,1,2,3],[0,1,1.5,2,3],[0,1,2,2.5,3],[0,.5,1,2,2.5]],
  3:[[0,1/3,2/3,1,2,3],[0,1,1.5,2.5,3],[0,1,2,2+1/3,2+2/3],[.5,1.5,2,3]]
};
const LEVEL_WORDS={1:'4분음표',2:'8분음표와 쉼표',3:'셋잇단음과 당김음'};
/** The rounds of today's 리듬 exercise for the step reached: the slow levels first; from step 3 on, the faster tempo. */
const rhythmPlan=(step=0)=>step>=3?[{level:2,bpm:RHYTHM.fast},{level:3,bpm:RHYTHM.bpm},{level:3,bpm:RHYTHM.fast}]:[{level:1,bpm:RHYTHM.bpm},{level:2,bpm:RHYTHM.bpm},{level:3,bpm:RHYTHM.bpm}];
/**
 * The timeline of one round, in seconds from its start: {beat, bar, floorTo, countIn:[t…], clicks:[{t, accent, soft}],
 * tas:[t…] (the “타” played to listen to), expect:[t…] (where the person says “타”), bars:[{kind:'count'|'listen'|'say',
 * from, to, pair}], end}.
 */
function roundTimeline({level=1,bpm=RHYTHM.bpm}={}){
  const beat=60/bpm,bar=4*beat,start=RHYTHM.lead,clicks=[],tas=[],expect=[],bars=[],countIn=[];
  const pats=PATTERNS[level]||PATTERNS[1];
  for(let b=0;b<4;b++){const t=start+b*beat;countIn.push(t);clicks.push({t,accent:b===0,soft:false});}
  bars.push({kind:'count',from:start,to:start+bar,pair:-1});
  for(let k=0;k<RHYTHM.pairs;k++){
    const listen=start+(1+2*k)*bar,say=listen+bar,p=pats[k%pats.length];
    bars.push({kind:'listen',from:listen,to:say,pair:k},{kind:'say',from:say,to:say+bar,pair:k});
    for(let b=0;b<4;b++){clicks.push({t:listen+b*beat,accent:b===0,soft:false});clicks.push({t:say+b*beat,accent:b===0,soft:true});}
    for(const x of p){tas.push(listen+x*beat);expect.push(say+x*beat);}
  }
  return {level,bpm,beat,bar,floorTo:Math.min(.5,start),countIn,clicks,tas,expect,bars,end:start+(1+2*RHYTHM.pairs)*bar};
}
/** The middle level (dB) of the frames before `to` (s): the floor of a round. */
const floorOf=(frames,to)=>{const q=list(frames).filter(f=>f.t<=to).map(f=>f.rms);return q.length?db(median(q)):-90;};
/**
 * Onsets (s) in level frames [{t, rms}] (time order): the level is RHYTHM.above dB over the floor and has risen
 * RHYTHM.rise dB over the lowest of the last RHYTHM.look s; then nothing for RHYTHM.refractory s.
 * guard: [{from, to, db}] stretches where the level must also be `db` or more (a click coming back through the mic).
 */
function onsets(frames,{floorDb=-90,guard=[]}={}){
  const fs=list(frames).filter(f=>f&&fin(f.t)&&fin(f.rms)),out=[],base=floorDb+RHYTHM.above;let last=-Infinity,lo=0;
  for(let i=0;i<fs.length;i++){
    const t=fs[i].t,level=db(fs[i].rms);
    while(lo<i&&fs[lo].t<t-RHYTHM.look)lo++;
    let min=Infinity;for(let j=lo;j<i;j++)min=Math.min(min,db(fs[j].rms));
    if(min===Infinity)continue;
    let need=base;for(const g of guard)if(t>=g.from&&t<=g.to)need=Math.max(need,g.db);
    if(level>=need&&level-min>=RHYTHM.rise&&t-last>=RHYTHM.refractory){out.push(t);last=t;}
  }
  return out;
}
/**
 * The count-in clicks heard back through the mic (no earphones): {rt (s, the round trip), leakDb (the loudest the click
 * came back)} when at least 3 of them came back at the same delay, else null.
 */
function echoOf(frames,clicks,{floorDb=-90}={}){
  const fs=list(frames),found=[];
  for(const c of list(clicks)){
    const near=fs.filter(f=>f.t>=c-RHYTHM.look-.01&&f.t<=c+RHYTHM.echoWindow),hit=onsets(near,{floorDb}).find(t=>t>=c);
    if(hit!=null)found.push(hit-c);
  }
  if(found.length<3)return null;
  const rt=median(found);
  if(Math.max(...found)-Math.min(...found)>RHYTHM.echoSpread)return null;
  let peak=-Infinity;
  for(const c of list(clicks))for(const f of fs)if(f.t>=c+rt-.01&&f.t<=c+rt+.1)peak=Math.max(peak,db(f.rms));
  return {rt,leakDb:peak};
}
/** Where a click's echo is to be ignored, from its scheduled times and the measured round trip. */
const clickGuard=(clicks,echo)=>echo?list(clicks).map(t=>({from:t+echo.rt+RHYTHM.guard[0],to:t+echo.rt+RHYTHM.guard[1],db:echo.leakDb+RHYTHM.guardOver})):[];
/** One-to-one matching of onsets to expected times shifted by `shift`, nearest first, within `win`. */
function pairUp(expect,heard,shift,win){
  const cand=[];
  expect.forEach((e,i)=>heard.forEach((h,j)=>{const d=h-(e+shift);if(Math.abs(d)<=win)cand.push({i,j,d});}));
  cand.sort((a,b)=>Math.abs(a.d)-Math.abs(b.d));
  const ui=new Set(),uj=new Set(),out=[];
  for(const c of cand){if(ui.has(c.i)||uj.has(c.j))continue;ui.add(c.i);uj.add(c.j);out.push(c);}
  return out;
}
/**
 * How close the onsets came to the expected times. expect, heard: seconds on the same clock; windows: [[from, to]] the
 * say-it-back bars (onsets outside are not looked at); echo: {rt} when the round trip was measured.
 * Returns {value (ms: the middle distance from the beat), hit (% of expected “타” found), extra (onsets that belong to
 * no beat), offset (ms taken off), method ('echo' | 'median'), matched, n} — value null when fewer than RHYTHM.minMatched.
 */
function rhythmScore(expect,heard,{windows=null,echo=null}={}){
  const ex=list(expect).filter(fin).slice().sort((a,b)=>a-b);
  const gaps=ex.slice(1).map((t,i)=>t-ex[i]).filter(g=>g>1e-6),minGap=gaps.length?Math.min(...gaps):1;
  const win=Math.min(RHYTHM.match,.45*minGap);
  const pad=Math.max(win,echo?echo.rt+win:RHYTHM.search[1]+win);
  const inside=t=>!windows||windows.some(([a,b])=>t>=a-win&&t<=b+pad);
  const hs=list(heard).filter(fin).filter(inside);
  let shift,method;
  if(echo&&fin(echo.rt)){shift=echo.rt;method='echo';}
  else{
    // The offset that lets the most onsets land on a beat (then the smallest distances): the person's own lag.
    let best=null;
    for(let o=RHYTHM.search[0];o<=RHYTHM.search[1]+1e-9;o+=.005){
      const p=pairUp(ex,hs,o,win),cost=p.reduce((n,c)=>n+Math.abs(c.d),0);
      if(!best||p.length>best.n||(p.length===best.n&&cost<best.cost))best={o,n:p.length,cost};
    }
    shift=best?best.o:0;method='median';
  }
  let pairs=pairUp(ex,hs,shift,win);
  if(method==='median'&&pairs.length){shift+=median(pairs.map(c=>c.d));pairs=pairUp(ex,hs,shift,win);}
  const matched=pairs.length,errors=pairs.map(c=>Math.abs(c.d)*1000);
  const value=matched>=RHYTHM.minMatched?Math.round(median(errors)):null;
  const late=method==='echo'&&matched?Math.round(median(pairs.map(c=>c.d))*1000):null;
  return {value,hit:ex.length?Math.round(matched/ex.length*100):0,extra:hs.length-matched,offset:Math.round(shift*1000),method,matched,n:ex.length,...(late!=null?{late}:{})};
}
/** One round from its level frames: the floor, the echo of the count-in, the onsets (guarded) and the score. frames: on
 * the round's own clock (0 = the round's start). */
function rhythmRound(frames,round){
  const tl=round&&round.expect?round:roundTimeline(round),floorDb=floorOf(frames,tl.floorTo);
  const echo=echoOf(frames,tl.countIn,{floorDb});
  // Every sound the app makes is guarded (the clicks and the “타” to listen to), so none of them is taken for the person.
  const heard=onsets(frames,{floorDb,guard:clickGuard([...tl.clicks.map(c=>c.t),...tl.tas],echo)});
  const windows=tl.bars.filter(b=>b.kind==='say').map(b=>[b.from,b.to]);
  return {level:tl.level,bpm:tl.bpm,floor:Math.round(floorDb),...rhythmScore(tl.expect,heard,{windows,echo}),...(echo?{rt:Math.round(echo.rt*1000)}:{})};
}
/** The 기본기 measures of the rounds: one per round that heard enough. */
const rhythmMeasures=rounds=>list(rounds).filter(r=>r&&fin(r.value)).map(r=>({area:'rhythm',kind:'rhythm',value:r.value,unit:'ms',level:r.level,bpm:r.bpm,hit:r.hit,extra:r.extra,
  offset:r.offset,method:r.method,...(fin(r.late)?{late:r.late}:{})}));

/* ====================================================================================================
 * 비브라토 · 8초 롱톤
 * ==================================================================================================== */
/** The thresholds of 소리 길 흔적 (app/voice-path-model.js), read from there; the same first guesses if it is not loaded. */
const VIBRATO=(()=>{
  const T=vp()?.THRESHOLDS||{};
  return Object.freeze({minHz:T.VIBRATO_MIN_HZ??4,maxHz:T.VIBRATO_MAX_HZ??8,scan:T.VIBRATO_SCAN_HZ||[3,9],extent:T.VIBRATO_MIN_EXTENT_CENTS??15,regularity:T.VIBRATO_MIN_REGULARITY??.4,
    source:T.VIBRATO_MIN_HZ!=null?'voice-path':'fallback'});
})();
const VIB={
  hold:8,cue:4,     // s: the long tone and the moment the cue says “이제 떨어요”
  window:1,step:.25,// s: the analysis windows
  voiced:.8,        // share of a window that must have a pitch
  minPoints:8,
  rateSd:.6,        // Hz: “고르게” = the rate of the windows moves this little …
  extentCv:.35,     // … and the width this little (coefficient of variation)
  regularSeconds:2.5,// … over at least this long
  straightFrom:.5,  // s: the straight part is read from here to the cue
  cueLate:1.5       // s: vibrato that starts within this after the cue answers it
};
/** The strongest pitch modulation of one window (least squares on the real times, so uneven sampling is fine). */
function windowFit(pts){
  const n=pts.length,mt=mean(pts.map(p=>p.t)),mc=mean(pts.map(p=>p.c));
  let sxx=0,sxy=0;for(const p of pts){sxx+=(p.t-mt)**2;sxy+=(p.t-mt)*(p.c-mc);}
  const slope=sxx?sxy/sxx:0,res=pts.map(p=>({t:p.t,r:p.c-mc-slope*(p.t-mt)})),v=mean(res.map(x=>x.r*x.r));
  let best={hz:0,amp:0};
  for(let hz=VIBRATO.scan[0];hz<=VIBRATO.scan[1]+1e-9;hz+=.1){
    const w=2*Math.PI*hz;let cc=0,ss=0,cs=0,rc=0,rs=0;
    for(const x of res){const c=Math.cos(w*x.t),s=Math.sin(w*x.t);cc+=c*c;ss+=s*s;cs+=c*s;rc+=x.r*c;rs+=x.r*s;}
    const det=cc*ss-cs*cs;if(Math.abs(det)<1e-9)continue;
    const a=(rc*ss-rs*cs)/det,b=(rs*cc-rc*cs)/det,amp=Math.hypot(a,b);
    if(amp>best.amp)best={hz:Math.round(hz*10)/10,amp};
  }
  const reg=v>0?Math.min(1,best.amp*best.amp/2/v):0;
  return {hz:best.hz,amp:best.amp,reg,n,
    vib:best.hz>=VIBRATO.minHz-1e-9&&best.hz<=VIBRATO.maxHz+1e-9&&best.amp>=VIBRATO.extent&&reg>=VIBRATO.regularity};
}
/** 1-second windows every 0.25 s over [from, to] of a pitch track [{t, cents|null}]. */
function vibratoWindows(samples,{from=0,to=VIB.hold}={}){
  const s=list(samples).filter(x=>x&&fin(x.t)).sort((a,b)=>a.t-b.t),out=[];
  for(let a=from;a+VIB.window<=to+1e-9;a+=VIB.step){
    const all=s.filter(x=>x.t>=a&&x.t<a+VIB.window),pts=all.filter(x=>fin(x.cents)).map(x=>({t:x.t,c:x.cents}));
    const start=Math.round(a*1000)/1000,end=Math.round((a+VIB.window)*1000)/1000;
    if(pts.length<VIB.minPoints||pts.length<all.length*VIB.voiced){out.push({start,end,voiced:false,vib:false});continue;}
    out.push({start,end,voiced:true,...windowFit(pts)});
  }
  return out;
}
/**
 * One long tone. samples on the tone's clock (0 = the voice started); hold, cue in seconds. Returns {seconds (the longest
 * stretch of vibrato), rate (Hz), extent (cent, half of peak-to-peak), regularity, regular, tail (vibrato in the last 2 s),
 * straight (no vibrato before the cue), cued (straight, then vibrato that starts on the cue), voiced (windows with a pitch)}.
 */
function vibratoRound(samples,{hold=VIB.hold,cue=VIB.cue}={}){
  const ws=vibratoWindows(samples,{from:0,to:hold}),runs=[];let cur=null;
  for(const w of ws){
    if(w.vib){if(cur&&Math.abs(w.start-cur.at.at(-1).start-VIB.step)<1e-6)cur.at.push(w);else runs.push(cur={at:[w]});}
  }
  const span=r=>r.at.at(-1).end-r.at[0].start,run=runs.reduce((b,r)=>!b||span(r)>span(b)?r:b,null);
  const voiced=ws.filter(w=>w.voiced).length;
  const before=ws.filter(w=>w.start>=VIB.straightFrom-1e-9&&w.end<=cue+1e-9),straight=before.filter(w=>w.voiced).length>=Math.max(1,Math.ceil(before.length*.6))&&!before.some(w=>w.vib);
  const tail=ws.some(w=>w.vib&&w.start>=hold-2-1e-9);
  if(!run)return {seconds:0,rate:null,extent:null,regularity:null,regular:0,tail:0,straight:straight?1:0,cued:0,voiced};
  // A window is flagged once about half of it holds vibrato: an edge inside the tone (not at its start or end) is moved
  // in by half a window, so the seconds are those of the vibrato itself.
  const first=run.at[0],last=run.at.at(-1),inner=(first.start>1e-6?1:0)+(last.end<hold-1e-6?1:0);
  const rates=run.at.map(w=>w.hz),amps=run.at.map(w=>w.amp),seconds=Math.max(0,span(run)-inner*VIB.window/2);
  const regular=seconds>=VIB.regularSeconds-1e-9&&sd(rates)<=VIB.rateSd&&(mean(amps)?sd(amps)/mean(amps):1)<=VIB.extentCv;
  const startAt=first.start+(first.start>1e-6?VIB.window/2:0),cued=straight&&startAt>=cue-VIB.step-1e-9&&startAt<=cue+VIB.cueLate+1e-9;
  return {seconds:round1(seconds),rate:round1(median(rates)),extent:Math.round(median(amps)),regularity:round2(median(run.at.map(w=>w.reg))),
    regular:regular?1:0,tail:tail?1:0,straight:straight?1:0,cued:cued?1:0,voiced};
}
/** The 기본기 measure of the rounds of one exercise ([{midi, vowel?, …vibratoRound}]): the best round, and how many
 * different pitches (`variants`) and vowels (`vowels`, once 4단계 is earned the rounds change vowel) had a cued,
 * regular vibrato of 3 s or more. null when nothing was sung. */
function vibratoMeasure(rounds){
  const rs=list(rounds).filter(r=>r&&r.voiced>0);
  if(!rs.length)return null;
  const score=r=>r.cued*8+r.regular*4+r.tail*2+r.seconds/10,best=rs.reduce((b,r)=>score(r)>score(b)?r:b);
  const good=rs.filter(r=>r.cued&&r.regular&&r.seconds>=3),variants=new Set(good.map(r=>r.midi)).size,vowels=new Set(good.map(r=>r.vowel).filter(Boolean)).size;
  return {area:'vibrato',kind:'vibrato',value:best.seconds,unit:'초',...(fin(best.rate)?{rate:best.rate,extent:best.extent,regularity:best.regularity}:{}),
    regular:best.regular,tail:best.tail,straight:best.straight,cued:best.cued,variants,...(vowels?{vowels}:{}),of:list(rounds).length,hold:VIB.hold};
}
/** The word shown first for a vibrato window going on now (null = no window yet). */
function vibratoWord(w,{afterCue=false}={}){
  if(!w||!w.voiced)return {key:'wait',text:'소리를 내 보세요'};
  if(!afterCue)return w.vib?{key:'hold',text:'아직은 곧게 내요'}:{key:'exact',text:'곧게 잘 잇고 있어요'};
  if(w.vib)return {key:'exact',text:'떨림이 보여요'};
  return {key:'go',text:'천천히 떨어 봐요'};
}

/* ====================================================================================================
 * 음정 · 음역 · 스케일 (scale, arpeggio)
 * ==================================================================================================== */
const SCALE={
  beat:.6,          // seconds per note (the top note: `top`)
  top:2.8,          // the top note's length: room for a 2-second steady hold after a late start
  skip:.3,          // the first part of a note left out of its reading (the voice arrives a little late)
  tolerance:50,     // cent: a quick note within a quarter tone is right
  topTolerance:35,  // cent: the top note's steady hold
  topSd:25,         // cent: the most the top note may wobble and still count as comfortable
  minVoiced:.4,     // a note needs a pitch in this share of its reading
  rounds:10,        // the most keys in one go
  below:3,          // the first key's top note: this many semitones under the top of the comfortable range
  above:6           // the highest key's top: this many semitones over it (stops earlier at the first strained top)
};
const SCALE_PATTERNS={scale5:{offsets:[0,2,4,5,7,5,4,2,0],top:4,words:'5음 스케일'},arpeggio:{offsets:[0,4,7,12,7,4,0],top:3,words:'옥타브 아르페지오'}};
/** Which pattern from the 음정 step reached: the arpeggio once 4단계 is earned (5단계 asks for it). */
const scaleKind=(step=0)=>step>=4?'arpeggio':'scale5';
/** One round's notes: [{at, dur, midi, top}] in seconds from the start of singing. */
function scalePlan(kind,base){
  const pat=SCALE_PATTERNS[kind]||SCALE_PATTERNS.scale5,out=[];let at=0;
  pat.offsets.forEach((o,i)=>{const top=i===pat.top,dur=top?SCALE.top:SCALE.beat;out.push({at:round2(at),dur,midi:base+o,top});at+=dur;});
  return out;
}
/** The keys to try (the 도 of each round), lowest first: from the top note `below` under the comfortable top to
 *  `above` over it, never starting under the comfortable bottom. */
function scaleKeys(kind,comfort){
  const pat=SCALE_PATTERNS[kind]||SCALE_PATTERNS.scale5,span=pat.offsets[pat.top],c=comfort||{};
  if(!Number.isInteger(c.low)||!Number.isInteger(c.high))return [];
  const first=Math.max(c.low,c.high-SCALE.below-span),last=Math.max(first,c.high+SCALE.above-span),out=[];
  for(let k=first;k<=last&&out.length<SCALE.rounds;k++)out.push(k);
  return out;
}
const fold=c=>((c+600)%1200+1200)%1200-600;
/** One round read from a pitch track [{t (s from the start of singing), midi (a float, null = no pitch)}]:
 *  {notes:[{midi, ok, cents, voiced, top?, held?, sd?, sung?}], right, n, top:{midi, ok, held, sd, sung}|null}. */
function scaleRound(samples,plan){
  const pts=list(samples).filter(p=>p&&fin(p.t)),notes=[];let topNote=null;
  for(const n of list(plan)){
    if(n.top){
      // The longest run inside topTolerance (a slip under 0.25 s forgiven) and the octave it was sung in.
      const ins=pts.filter(p=>p.t>=n.at&&p.t<n.at+n.dur+.2);let best=null,cur=null,lastIn=null;
      for(const p of ins){
        const c=fin(p.midi)?(p.midi-n.midi)*100:null,inside=c!=null&&Math.abs(fold(c))<=SCALE.topTolerance;
        if(inside){if(!cur||p.t-lastIn>.25)cur={from:p.t,to:p.t,cs:[],oct:[]};cur.to=p.t;cur.cs.push(fold(c));cur.oct.push(Math.round((p.midi-n.midi)/12));lastIn=p.t;
          if(!best||cur.to-cur.from>best.to-best.from)best=cur;}
      }
      // The wobble of the whole run: every reading in it, the forgiven slips too (so a wide wobble is not hidden).
      const inRun=best?ins.filter(p=>p.t>=best.from&&p.t<=best.to&&fin(p.midi)).map(p=>fold((p.midi-n.midi)*100)):[];
      const held=best?round2(best.to-best.from):0,s=inRun.length>1?round1(sd(inRun)):null,oct=best?Math.round(median(best.oct)):0;
      const ok=held>=2-1e-9&&s!=null&&s<=SCALE.topSd;
      topNote={midi:n.midi,ok,held,sd:s,sung:n.midi+12*oct};
      const voiced=ins.filter(p=>fin(p.midi)).length;
      notes.push({midi:n.midi,top:true,ok:held>=.6,held,...(s!=null?{sd:s}:{}),cents:best?Math.round(median(best.cs)):null,voiced:ins.length?round2(voiced/ins.length):0});
      continue;
    }
    const from=n.at+n.dur*SCALE.skip,to=n.at+n.dur,ins=pts.filter(p=>p.t>=from&&p.t<to),cs=ins.filter(p=>fin(p.midi)).map(p=>fold((p.midi-n.midi)*100));
    const voiced=ins.length?cs.length/ins.length:0,mid=cs.length?median(cs):null;
    notes.push({midi:n.midi,ok:voiced>=SCALE.minVoiced&&mid!=null&&Math.abs(mid)<=SCALE.tolerance,cents:mid==null?null:Math.round(mid),voiced:round2(voiced)});
  }
  return {notes,right:notes.filter(x=>x.ok).length,n:notes.length,top:topNote,sung:notes.some(x=>x.voiced>0)};
}
/** Whether to go on to the next key after these rounds: not after a top that was not held comfortably above the
 *  comfortable range, nor after two such tops in a row. */
function scaleGoOn(rounds,comfort){
  const rs=list(rounds),last=rs.at(-1);if(!last)return true;
  if(!last.top?.ok&&(last.top?.midi>=(comfort?.high??Infinity)))return false;
  const prev=rs.at(-2);return !(prev&&!last.top?.ok&&!prev.top?.ok);
}
/** The 기본기 measures of the rounds of one exercise: 음정 (% of the notes sung right, kind scale5 | arpeggio) and
 *  음역 (the top notes held comfortably — 2 s, steady, in the octave sung). [] when nothing was sung. */
function scaleMeasures(rounds,kind){
  const rs=list(rounds).filter(r=>r&&r.sung);if(!rs.length)return [];
  const n=rs.reduce((a,r)=>a+r.n,0),right=rs.reduce((a,r)=>a+r.right,0),out=[];
  out.push({area:'pitch',kind:kind==='arpeggio'?'arpeggio':'scale5',value:n?Math.round(right/n*100):0,unit:'%',right,of:n,rounds:rs.length});
  const tops=rs.map(r=>r.top).filter(t=>t&&t.ok).map(t=>t.sung);
  if(tops.length){const low=Math.min(...tops),high=Math.max(...tops);out.push({area:'range',kind:'comfortable',value:high-low,unit:'반음',low,high,seconds:2,count:new Set(tops).size,from:'scale'});}
  return out;
}

/* ====================================================================================================
 * 소리 길 · 사이렌
 * ==================================================================================================== */
const SIREN={
  hold:10,      // seconds of one glide at most (from the first sound)
  tries:3,
  gap:.15,      // a silence longer than this inside the glide is a break
  flip:4,       // semitones in one step that stay: a flip (a glide moves well under a semitone per reading)
  stay:2,       // …stays: the next readings within this many semitones of the new pitch
  end:.8,       // the glide is over after this much silence, once it has gone up
  back:.7       // came back down: fell at least this share of the way it went up
};
/** A 3-point median of the voiced readings in a row (a single wrong reading of the pitch reader goes). */
function smooth(pts){
  return pts.map((p,i)=>{
    if(!fin(p.midi))return p;
    const a=pts[i-1],b=pts[i+1];
    if(a&&b&&fin(a.midi)&&fin(b.midi)&&p.t-a.t<=.1&&b.t-p.t<=.1)return {t:p.t,midi:median([a.midi,p.midi,b.midi])};
    return p;
  });
}
/** One glide read from a pitch track [{t, midi|null}]: {value (semitones from its lowest to its highest), low, high,
 *  breaks, flips, both (1 = went up and came back down), voiced (seconds with a pitch)}. */
function sirenTry(samples){
  const raw=list(samples).filter(p=>p&&fin(p.t)).sort((a,b)=>a.t-b.t),first=raw.findIndex(p=>fin(p.midi));
  let last=-1;for(let i=raw.length-1;i>=0;i--)if(fin(raw[i].midi)){last=i;break;}
  if(first<0)return {value:0,low:null,high:null,breaks:0,flips:0,both:0,voiced:0};
  const pts=smooth(raw.slice(first,last+1)),v=pts.filter(p=>fin(p.midi));
  let breaks=0,flips=0,voiced=0;
  for(let i=1;i<v.length;i++){
    const dt=v[i].t-v[i-1].t;
    if(dt>SIREN.gap+1e-9){breaks++;continue;}
    voiced+=dt;
    const jump=v[i].midi-v[i-1].midi;
    if(Math.abs(jump)>=SIREN.flip){
      const after=v.slice(i,i+4);
      if(after.length>=3&&after.every(p=>Math.abs(p.midi-v[i].midi)<=SIREN.stay))flips++;
    }
  }
  const ms=v.map(p=>p.midi),low=Math.min(...ms),high=Math.max(...ms),peak=ms.indexOf(high),span=high-low;
  const rose=high-Math.min(...ms.slice(0,peak+1)),fell=high-Math.min(...ms.slice(peak));
  const both=span>=3&&rose>=span*SIREN.back&&fell>=span*SIREN.back?1:0;
  return {value:round1(span),low:round1(low),high:round1(high),breaks,flips,both,voiced:round1(voiced)};
}
/** The 기본기 measure of the glides of one exercise: the best one (no break, then no flip, then up and down, then the
 *  widest). null when nothing was sung. */
function sirenMeasure(tries){
  const ts=list(tries).filter(t=>t&&t.voiced>0);if(!ts.length)return null;
  const score=t=>(t.breaks?0:4000)+(t.flips?0:2000)+(t.both?1000:0)+t.value,best=ts.reduce((b,t)=>score(t)>score(b)?t:b);
  return {area:'path',kind:'siren',value:best.value,unit:'반음',breaks:best.breaks,flips:best.flips,both:best.both,low:best.low,high:best.high,tries:list(tries).length};
}

/* ---------- words for the set's summary (app/practice-set.js) ---------- */
/** What a finished measuring step says on the next step and the summary ('' for any other step). */
function resultWords(r){
  if(!r||!['hiss','rhythm','vibrato','scale','siren'].includes(r.mode))return '';
  if(r.timer)return '타이머로 했어요';
  const ms=list(r.measures);
  if(r.mode==='hiss'){const m=ms.find(x=>x.area==='breath');return m?'가장 긴 스 '+m.value+'초':'“스~”가 들리지 않았어요';}
  if(r.mode==='rhythm'){const m=ms.filter(x=>x.area==='rhythm');return m.length?'박자와 '+m.map(x=>x.value).join(' · ')+' ms':'“타”가 잘 안 들렸어요';}
  if(r.mode==='scale'){const m=ms.find(x=>x.area==='pitch');return m?(m.kind==='arpeggio'?'아르페지오':'스케일')+' '+m.value+'% 맞춤':'소리가 들리지 않았어요';}
  if(r.mode==='siren'){const m=ms.find(x=>x.area==='path');return m?'사이렌 '+m.value+'반음'+(m.breaks?' · 끊김 '+m.breaks+'번':' · 끊김 없이'):'소리가 들리지 않았어요';}
  const m=ms.find(x=>x.area==='vibrato');
  return m?(m.value>0&&fin(m.rate)?'비브라토 '+m.value+'초 · 1초에 '+m.rate+'번':'비브라토가 아직 안 보였어요'):'소리가 들리지 않았어요';
}

return {HISS,RHYTHM,PATTERNS,LEVEL_WORDS,VIBRATO,VIB,
  hissStart,hissFeed,hissNow,hissResult,hissMeasure,breathMeasure,
  rhythmPlan,roundTimeline,floorOf,onsets,echoOf,clickGuard,rhythmScore,rhythmRound,rhythmMeasures,
  vibratoWindows,vibratoRound,vibratoMeasure,vibratoWord,
  SCALE,SCALE_PATTERNS,scaleKind,scalePlan,scaleKeys,scaleRound,scaleGoOn,scaleMeasures,
  SIREN,sirenTry,sirenMeasure,resultWords,median};
});
