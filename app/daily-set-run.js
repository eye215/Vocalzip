/* 오늘의 연습 — the doing screen (dark), ONE pattern for every step of a set: a top bar with the set's progress, the
 * step's name small, one big line saying what to do now, one line of why, the answer as a WORD first ("그대로 유지!")
 * with the number small, one big button, and 다시 / 건너뛰기 under it.
 * What is in a set and how its result is kept: app/daily-set-model.js. The session, its clock and its storage belong to
 * app/practice-set.js, which mounts this screen for the step in hand and gets back done / skipped with what was
 * measured:  VZ.dailySetRunner.mount(host, ctx) → {destroy()}.
 * Modes (VzipDailySet.modeOf): timed (목 풀기) · breath (호흡) · follow (the app plays a pattern, then your turn) ·
 * hold (reference note + the 연습 따라 하기 pitch reader VZ.guidedDetectPitch + hold time; a timer when the mic is not
 * available) · take (연습 전후 30초 녹음, VZ.media.capture) · free (the person's own step on the set's wall clock).
 * Nothing here is analysed later or uploaded: the mic of a hold step is only read on this screen. */
(()=>{
'use strict';
const V=window.VZ,D=window.VzipDailySet;
if(!V||!D||typeof document==='undefined')return;
const esc=V.esc;
const hz=midi=>440*2**((midi-69)/12);
const audioSession=type=>{try{if(navigator.audioSession)navigator.audioSession.type=type;}catch{}};
const mmss=sec=>{sec=Math.max(0,Math.floor(sec));return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');};
const countdown=left=>(left<0?'+':'')+mmss(Math.abs(left<0?Math.floor(-left):Math.ceil(left)));
const text=(node,value)=>{if(node&&node.textContent!==value)node.textContent=value;};
const TRY_SECONDS=20,LISTEN=1.2,CHEER=.9;

/* ---------- sound: reference notes and small cues (created inside the tap, for iPhone Safari) ---------- */
function tones(){
  const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return null;
  let ctx;try{ctx=new Audio();}catch{return null;}
  const sources=new Set();
  return {ctx,
    play(midi,delay,dur,level=.16){
      try{
        const at=ctx.currentTime+delay,o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=hz(midi);
        g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(level,at+.03);g.gain.setValueAtTime(level,Math.max(at+.03,at+dur-.08));g.gain.linearRampToValueAtTime(0,at+dur);
        o.connect(g).connect(ctx.destination);sources.add(o);o.onended=()=>{sources.delete(o);try{o.disconnect();g.disconnect();}catch{}};o.start(at);o.stop(at+dur+.02);
      }catch{}
    },
    stop(){for(const o of sources){try{o.stop();}catch{}}sources.clear();},
    close(){this.stop();try{ctx.close().catch(()=>{});}catch{}}
  };
}
/* ---------- mic: the pitch reader of 연습 따라 하기 ---------- */
async function openMic(){
  const md=navigator.mediaDevices;
  if(!md?.getUserMedia||!V.guidedDetectPitch)throw Object.assign(Error('이 브라우저에서는 마이크를 쓸 수 없어요.'),{name:'NotSupportedError'});
  let stream,ctx;
  try{
    try{stream=await md.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});}
    catch(error){if(error.name!=='OverconstrainedError'&&error.name!=='TypeError')throw error;stream=await md.getUserMedia({audio:true});}
    const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)throw Error('소리를 읽을 수 없어요.');
    ctx=new Audio();await ctx.resume();
    const source=ctx.createMediaStreamSource(stream),analyser=ctx.createAnalyser();analyser.fftSize=4096;source.connect(analyser);
    const data=new Float32Array(analyser.fftSize);
    return {read(){analyser.getFloatTimeDomainData(data);return V.guidedDetectPitch(data,ctx.sampleRate);},
      close(){stream.getTracks().forEach(t=>t.stop());try{source.disconnect();analyser.disconnect();}catch{}try{ctx.close().catch(()=>{});}catch{}}};
  }catch(error){stream?.getTracks().forEach(t=>t.stop());try{ctx?.close().catch(()=>{});}catch{}throw error;}
}
/** Cents from the target, folded to the nearest octave: the same note an octave apart counts as that note. */
const centsFrom=(frequency,midi)=>{if(!frequency)return null;const c=1200*Math.log2(frequency/hz(midi));return Math.round(((c+600)%1200+1200)%1200-600);};

/* ---------- engines: what happens inside one step ---------- */
const dots=(n,at,done)=>'<ol class="dset-dots" data-run-dots aria-hidden="true">'+Array.from({length:n},(_,i)=>'<li class="'+(i<done?'is-done':i===at?'is-now':'')+'"></li>').join('')+'</ol>';
const ring='<div class="dset-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="dset-ring-bg" cx="60" cy="60" r="52"/><circle class="dset-ring-fg" data-run-ring cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/></svg><strong data-run-count></strong></div>';
function setRing(r,part){const c=r.q('[data-run-ring]');if(c)c.style.strokeDashoffset=String(Math.max(0,Math.min(100,100-part*100)));}
function setDots(r,at,done){r.host.querySelectorAll('[data-run-dots] li').forEach((li,i)=>{li.className=i<done?'is-done':i===at?'is-now':'';});}

const ENGINES={
  /* 목 풀기: a line to follow and a countdown, step by step. */
  timed(r){
    const steps=r.e.steps;let i=0,left=steps[0].seconds,done=0;
    const paint=()=>{text(r.q('[data-run-count]'),String(Math.max(0,Math.ceil(left))));setRing(r,1-left/steps[i].seconds);setDots(r,i,done);
      r.sub((i+1)+' / '+steps.length+' · '+Math.max(0,Math.ceil(left))+'초 남았어요');};
    return {say:()=>steps[i].text,stage:()=>ring+dots(steps.length,0,0),
      ready(){text(r.q('[data-run-count]'),String(steps[0].seconds));r.word('준비되면 시작해요','wait');r.sub(steps.length+'가지를 차례로 해요');},
      start(){i=0;left=steps[0].seconds;done=0;r.say(steps[0].text);r.word('천천히 따라 해요','go');paint();},
      tick(dt){
        left-=dt;
        if(left<=0){done++;i++;
          if(i>=steps.length){i=steps.length-1;left=0;paint();return r.complete({mode:'timed',parts:done});}
          left=steps[i].seconds;r.say(steps[i].text);r.cue();
        }
        paint();
      },
      result:()=>({mode:'timed',parts:done})};
  },
  /* 호흡: in for `inhale`, out on "스~" for a longer count each round. Not measured yet — a measured version reads
   * the mic during the out-breath and reports through `measure` (CATALOG) and result.longestOut. */
  breath(r){
    const e=r.e,outs=e.outs;let k=0,phase='in',left=e.inhale,done=0,longest=0;
    const length=()=>phase==='in'?e.inhale:phase==='out'?outs[k]:e.rest;
    const line=()=>phase==='in'?'코로 천천히 들이쉬어요':phase==='out'?'“'+e.sound+'” 고르게 내쉬어요':'편하게 쉬어요';
    const paint=()=>{
      const part=1-left/length(),size=phase==='in'?.55+.45*part:phase==='out'?1-.45*part:.55,orb=r.q('[data-run-orb]');
      if(orb){orb.style.transform=r.reduced?'':'scale('+size.toFixed(3)+')';orb.dataset.phase=phase;}
      const bar=r.q('[data-run-breath]');if(bar)bar.style.width=Math.round((phase==='in'?part:phase==='out'?1-part:0)*100)+'%';
      text(r.q('[data-run-count]'),String(Math.max(0,Math.ceil(left))));
      r.word(phase==='in'?'들이쉬기':phase==='out'?'내쉬기':'쉬기',phase==='out'?'go':'wait');
      r.sub((k+1)+' / '+outs.length+'번째 · 이번에는 '+outs[k]+'초 내쉬어요');
    };
    return {say:line,stage:()=>'<div class="dset-breath"><div class="dset-orb-box"><i class="dset-orb" data-run-orb data-phase="in" aria-hidden="true"></i><strong data-run-count></strong></div><div class="dset-breath-bar" aria-hidden="true"><i data-run-breath></i></div></div>',
      ready(){text(r.q('[data-run-count]'),String(e.inhale));r.word('준비되면 시작해요','wait');r.sub(e.inhale+'초 들이쉬고 '+outs[0]+'초부터 '+outs.at(-1)+'초까지 늘려 가요');},
      start(){k=0;phase='in';left=e.inhale;done=0;longest=0;r.say(line());paint();},
      tick(dt){
        left-=dt;
        if(left<=0){
          if(phase==='in')phase='out';
          else if(phase==='out'){done++;longest=Math.max(longest,outs[k]);if(k>=outs.length-1){left=0;paint();return r.complete({mode:'breath',rounds:done,longestOut:longest});}phase='rest';}
          else{phase='in';k++;}
          left=length();r.say(line());r.cue(phase==='out'?1:0);
        }
        paint();
      },
      result:()=>({mode:'breath',rounds:done,...(longest?{longestOut:longest}:{})})};
  },
  /* 립트릴 5음: the app plays the pattern, then it is your turn; the key moves a semitone each time. */
  follow(r){
    const e=r.e,base=Math.min(D.baseNote(r.comfort),r.comfort.high-7),listen=e.pattern.length*e.beat+.3;let k=0,phase='listen',left=listen,done=0;
    const play=()=>{e.pattern.forEach((o,i)=>r.tone(base+e.keys[k]+o,.05+i*e.beat,e.beat*.9));};
    const paint=()=>{
      text(r.q('[data-run-count]'),phase==='listen'?'♪':String(Math.max(0,Math.ceil(left))));setRing(r,1-left/(phase==='listen'?listen:e.sing));setDots(r,k,done);
      r.word(phase==='listen'?'들어 보세요':'따라 해요',phase==='listen'?'wait':'go');
      r.sub((k+1)+' / '+e.keys.length+' · '+D.noteName(base+e.keys[k])+'에서 시작해요');
    };
    return {say:()=>e.text,stage:()=>ring+dots(e.keys.length,0,0),
      ready(){text(r.q('[data-run-count]'),'♪');r.word('준비되면 시작해요','wait');r.sub('한 번 들려 드리고, 이어서 따라 해요');},
      start(){k=0;done=0;phase='listen';left=listen;play();paint();},
      resume(){phase='listen';left=listen;play();paint();},
      tick(dt){
        left-=dt;
        if(left<=0){
          if(phase==='listen'){phase='sing';left=e.sing;}
          else{done++;if(k>=e.keys.length-1){left=0;paint();return r.complete({mode:'follow',parts:done});}k++;phase='listen';left=listen;play();}
        }
        paint();
      },
      result:()=>({mode:'follow',parts:done})};
  },
  /* 발성 롱톤 · 음 따라 부르기: hear a note, then hold it inside the tolerance for `hold` seconds. Without a mic the
   * same notes run on a timer and nothing is measured (result.timer). */
  hold(r){
    const e=r.e,notes=D.notesFor(e,r.comfort,r.ctx.session.date),need=e.hold,tol=e.tolerance,out=[];
    let i=0,phase='listen',left=LISTEN,h=D.holdStart(),tried=0;
    const mic=()=>!!r.mic;
    const play=()=>r.tone(notes[i],.05,LISTEN-.1);
    const needle=cents=>{const n=r.q('[data-run-needle]');if(n){n.style.left=(50+Math.max(-45,Math.min(45,(cents||0)*.9)))+'%';n.dataset.on=cents==null?'':'1';}};
    const meter=part=>{const m=r.q('[data-run-hold]');if(m)m.style.width=Math.round(Math.max(0,Math.min(1,part))*100)+'%';};
    const next=()=>{
      out.push(mic()?{midi:notes[i],...D.holdResult(h)}:{midi:notes[i]});
      if(i>=notes.length-1)return r.complete(result());
      i++;h=D.holdStart();tried=0;phase='listen';left=LISTEN;play();
    };
    const result=()=>{
      const sung=out.reduce((n,x)=>n+(x.sung||0),0),inside=out.reduce((n,x)=>n+(x.sung||0)*(x.accuracy||0)/100,0);
      return {mode:'hold',...(mic()?{}:{timer:true}),parts:out.length,notes:out.slice(),...(mic()?{holdSeconds:Math.round(out.reduce((n,x)=>n+Math.min(need,x.held||0),0)*10)/10,
        accuracy:sung>0?Math.round(inside/sung*100):null}:{})};
    };
    const paint=cents=>{
      setDots(r,i,out.length);text(r.q('[data-run-note]'),D.noteName(notes[i]));
      if(phase==='listen'){needle(null);meter(0);r.word('들어 보세요','wait');r.sub((i+1)+' / '+notes.length+' · '+D.noteName(notes[i]));return;}
      if(phase==='cheer'){needle(0);meter(1);r.word(mic()?'좋아요!':'다음 음으로 가요','exact');return;}
      if(!mic()){meter(1-left/(need+2));needle(null);r.word('“'+e.syllable+'” 이어요','go');r.sub((i+1)+' / '+notes.length+' · '+Math.max(0,Math.ceil(left))+'초 · 마이크 없이 타이머로 해요');return;}
      const w=D.word(cents,tol);needle(cents);meter(h.held/need);r.word(w.text,w.key);
      r.sub((cents==null?'':(cents>0?'+':'')+cents+' cent · ')+h.held.toFixed(1)+' / '+need+'초');
    };
    return {say:()=>e.text,
      stage:()=>'<div class="dset-tuner"><div class="dset-target"><small>지금 음</small><strong data-run-note>'+esc(D.noteName(notes[0]))+'</strong><button type="button" class="dset-chip" data-run-again><i class="ph ph-speaker-high" aria-hidden="true"></i>음 다시 듣기</button></div>'+
        '<div class="dset-track" aria-hidden="true"><i class="dset-zone"></i><i class="dset-needle" data-run-needle></i></div><div class="dset-track-labels" aria-hidden="true"><span>낮음</span><span>맞음</span><span>높음</span></div>'+
        '<div class="dset-holdbar" aria-hidden="true"><i data-run-hold></i></div></div>'+dots(notes.length,0,0),
      ready(){r.word('준비되면 시작해요','wait');r.sub('음 '+notes.length+'개 · 한 음에 '+need+'초씩'+(r.ctx.mic()==='denied'||r.ctx.mic()==='off'?' · 마이크 없이 타이머로 해요':''));},
      bind(){r.q('[data-run-again]')?.addEventListener('click',()=>{if(r.state==='doing'||r.state==='ready'){r.audio('playback');r.tone(notes[i],.05,LISTEN-.1);}});},
      start(){i=0;out.length=0;h=D.holdStart();tried=0;phase='listen';left=LISTEN;play();paint(null);},
      resume(){h=D.holdStart();tried=0;phase='listen';left=LISTEN;play();paint(null);},
      tick(dt){
        if(phase==='listen'){left-=dt;if(left<=0){phase='sing';left=need+2;}return paint(null);}
        if(phase==='cheer'){left-=dt;if(left<=0)return next();return paint(0);}
        if(!mic()){left-=dt;if(left<=0){phase='cheer';left=CHEER;r.cue(1);}return paint(null);}
        const cents=centsFrom(r.mic.read(),notes[i]);
        D.holdTick(h,cents,dt,{tolerance:tol,need});tried+=dt;
        if(h.ok){phase='cheer';left=CHEER;r.cue(1);return paint(0);}
        if(tried>=TRY_SECONDS)return next();
        paint(cents);
      },
      result};
  },
  /* 연습 전후 30초 녹음: the ordinary recorder engine; saved by the set screen as a practice recording. */
  take(r){
    const st=r.st,song=V.song?.(st.songId),limit=D.TAKE_SECONDS;let capture=null,saving=false;
    const level=v=>{const el=r.q('[data-run-level]');if(el)el.style.width=Math.round(Math.min(1,v*1.6)*100)+'%';};
    const finish=async()=>{
      if(!capture||saving)return;saving=true;const c=capture;capture=null;r.stopLoop();
      r.word('녹음을 저장하는 중이에요','wait');r.primary.disabled=true;
      try{const res=await c.stop();const id=await r.ctx.saveTake(st,res);if(r.dead)return;st.mediaIds=[id];r.complete({mode:'take',seconds:res.durationSeconds});}
      catch(error){saving=false;if(r.dead)return;r.primary.disabled=false;r.state='ready';r.paintState();r.word('녹음을 저장하지 못했어요','low');r.sub(String(error.message||'다시 해 보거나 건너뛰어 주세요.'));}
    };
    return {custom:true,say:()=>(song?song.title+' ':'')+'한 구절을 '+limit+'초 안으로 불러요',
      stage:()=>'<div class="dset-take"><strong class="dset-take-time" data-run-count>0:'+limit+'</strong><div class="dset-holdbar" aria-hidden="true"><i data-run-level></i></div></div>',
      ready(){r.word(st.slot==='after'?'처음과 같은 구절을 불러요':'준비되면 녹음해요','wait');r.sub((st.phrase?'부를 곳 · '+st.phrase+' · ':'')+'녹음 길이는 연습 시간에 더하지 않아요');},
      primaryText:state=>state==='doing'?'녹음 끝내기':'녹음 시작',
      async begin(){
        r.primary.disabled=true;r.audio('play-and-record');
        try{capture=await V.media.capture({onLevel:level});}
        catch(error){
          r.primary.disabled=false;if(r.dead)return;
          if(error.code==='denied')r.ctx.setMic('denied');
          r.audio('auto');r.word(error.code==='denied'?'마이크를 쓸 수 없어요':'녹음을 시작하지 못했어요','low');r.sub((error.message||'')+' 건너뛰고 연습을 이어 갈 수 있어요.');return;
        }
        if(r.dead||r.state!=='ready'){capture.cancel();capture=null;return;}
        r.primary.disabled=false;capture.start();r.state='doing';r.paintState();r.word('녹음하고 있어요','go');r.startLoop();
      },
      press(){if(capture&&capture.seconds()>=1)finish();},
      tick(){if(!capture)return;const sec=capture.seconds();text(r.q('[data-run-count]'),mmss(Math.max(0,limit-sec)));r.sub('최대 '+limit+'초 · 다 부르면 끝내기를 눌러요');if(sec>=limit)finish();},
      cancel(){if(capture){const c=capture;capture=null;try{c.cancel();}catch{}}},
      result:()=>({mode:'take'})};
  },
  /* The person's own step (a goal, a song section, a homework): the set's wall clock against the planned minutes. */
  free(r){
    const st=r.st;
    const paint=()=>{
      const target=st.minutes*60,sec=r.ctx.elapsed(),left=target-sec,over=left<0;
      text(r.q('[data-clock]'),countdown(left));
      text(r.q('[data-clock-sub]'),over?'목표 '+st.minutes+'분 지남 · 연습 '+mmss(sec):'남음 · 목표 '+st.minutes+'분');
      r.q('.dset-clock')?.classList.toggle('is-over',over);setRing(r,Math.min(1,sec/Math.max(1,target)));
    };
    return {wall:true,say:()=>D.shortTitle(st),
      stage:()=>'<div class="dset-ring dset-clock" role="timer" aria-label="단계 타이머"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="dset-ring-bg" cx="60" cy="60" r="52"/><circle class="dset-ring-fg" data-run-ring cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="100" stroke-dashoffset="100"/></svg><strong data-clock>0:00</strong></div>'+
        '<p class="dset-clock-sub" data-clock-sub></p><div class="dset-helper" data-run-helper>'+(r.ctx.helper?.(st)||'')+'</div>',
      bind(){r.ctx.bindHelper?.(r.host,st);},
      ready(){paint();r.word(r.ctx.elapsed()>0?'이어서 해요':'준비되면 시작해요','wait');r.sub('');},
      start(){r.word('하고 있어요','go');paint();},resume(){r.word('하고 있어요','go');paint();},
      primaryText:state=>state==='doing'?'다 했어요':state==='paused'?'계속하기':'시작하기',
      tick:paint,paint,result:()=>({mode:'free'})};
  }
};

/* ---------- the screen ---------- */
function mount(host,ctx){
  const s=ctx.session,st=s.steps[s.index],mode=D.modeOf(st),e=st.exercise?D.exercise(st.exercise):null;
  const r={host,ctx,st,mode,e,state:'ready',dead:false,timer:0,last:0,mic:null,tones:null,comfort:null,gate:'',
    reduced:!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,q:sel=>host.querySelector(sel)};
  const needsRange=mode==='hold'||mode==='follow';
  r.comfort=needsRange?ctx.comfort():null;
  r.say=value=>text(r.q('[data-run-say]'),value);
  r.word=(value,key)=>{const el=r.q('[data-run-word]');if(el){text(el,value);el.dataset.tone=key||'';}};
  r.sub=value=>text(r.q('[data-run-sub]'),value);
  r.audio=audioSession;
  r.tone=(midi,delay,dur)=>{r.tones||=tones();const t=r.tones;if(!t)return;if(t.ctx.state==='running')t.play(midi,delay,dur);else t.ctx.resume?.().then(()=>{if(r.tones===t&&!r.dead)t.play(midi,delay,dur);}).catch(()=>{});};
  r.cue=(high=0)=>{try{navigator.vibrate?.(60);}catch{}if(r.tones?.ctx.state==='running')r.tones.play(high?84:79,0,.12,.07);};
  r.startLoop=()=>{clearInterval(r.timer);r.last=Date.now();r.timer=setInterval(()=>{
    if(r.dead||!host.isConnected){r.destroy();return;}
    const now=Date.now(),dt=Math.min(.5,Math.max(0,(now-r.last)/1000));r.last=now;
    if(r.state==='doing')r.engine.tick(dt);
  },100);};
  r.stopLoop=()=>{clearInterval(r.timer);r.timer=0;};
  const release=()=>{r.stopLoop();r.mic?.close();r.mic=null;r.tones?.close();r.tones=null;r.engine?.cancel?.();audioSession('auto');
    document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',hidden);};
  r.complete=result=>{if(r.dead)return;r.dead=true;release();ctx.finish('done',result);};

  const tl=D.timeline(s.steps,s),label=D.labelOf(st),last=ctx.lastLine?.()||'',lastSkipped=!!s.steps[s.index-1]?.skipped;
  // Before the comfortable range is known a note exercise only says what it is; the range is asked at 시작하기.
  const waiting=()=>({say:()=>e.text,stage:()=>'',ready(){r.word('준비되면 시작해요','wait');r.sub('처음 한 번만, 편한 음 높이를 물어봐요');},result:()=>({})});
  const build=()=>{r.engine=needsRange&&!r.comfort?waiting():ENGINES[mode](r);};
  const html=()=>'<header class="dset-top"><button type="button" class="dset-x" data-run-exit aria-label="나가기 · 오늘 안에 이어서 할 수 있어요"><i class="ph ph-x" aria-hidden="true"></i></button>'+
    '<ol class="dset-bar" aria-hidden="true">'+tl.map(x=>'<li class="is-'+x.state+'"></li>').join('')+'</ol><span class="dset-count"><span data-run-count-all>'+(s.index+1)+' / '+s.steps.length+'</span></span></header>'+
    (last?'<p class="dset-last" data-run-last'+(lastSkipped?' data-skipped':'')+'><i class="ph ph-'+(lastSkipped?'skip-forward':'check')+'" aria-hidden="true"></i>'+esc(last)+'</p>':'')+
    '<p class="dset-name" data-run-name><b>'+esc(label)+'</b>'+(mode==='free'?'':'<span>'+esc(D.shortTitle(st))+'</span>')+(st.optional?'<span>선택</span>':'')+
      (st.mic?'<span class="dset-badge"><i class="ph ph-microphone" aria-hidden="true"></i>마이크</span>':'')+'<span class="dset-badge">약 '+st.minutes+'분</span></p>'+
    '<h2 class="dset-say" id="pset-step-title" data-run-say></h2>'+
    '<p class="dset-why" data-run-why>'+esc(ctx.why?.(st)||st.why||'')+'</p>'+
    '<div class="dset-stage" data-run-stage></div>'+
    '<p class="dset-word" data-run-word role="status" aria-live="polite"></p><p class="dset-sub" data-run-sub></p>'+
    (ctx.note?.(st)||'')+
    '<div class="dset-actions"><button type="button" class="dset-primary" data-run-primary></button>'+
      '<div class="dset-second"><button type="button" data-run-redo>다시</button><button type="button" data-run-pause hidden>잠깐 멈춤</button><button type="button" data-run-skip>건너뛰기</button></div>'+
      '<button type="button" class="dset-quiet" data-run-stop>여기까지 하고 마치기</button></div>';
  const drawStage=()=>{r.q('[data-run-stage]').innerHTML=r.engine.stage();r.say(r.engine.say());r.engine.bind?.();r.engine.ready?.();};

  r.paintState=()=>{
    host.dataset.state=r.state;host.dataset.mode=mode;
    const p=r.primary,redo=r.q('[data-run-redo]'),pauseB=r.q('[data-run-pause]');
    const label=r.gate?'':r.engine.primaryText?.(r.state)||(r.state==='doing'?'잠깐 멈춤':r.state==='paused'?'계속하기':'시작하기');
    if(!r.gate)text(p,label);
    // 다시: once something was started. The person's own step pauses with a small button (its big one is 다 했어요).
    redo.hidden=r.state==='ready'||mode==='take'||r.engine.wall;
    pauseB.hidden=!(r.engine.wall&&r.state==='doing');pauseB.setAttribute('aria-label','일시정지');
  };

  /* Gates before the first start of a step: the comfortable range (once ever) and the mic (once, with why). */
  function askRange(){
    r.gate='range';host.dataset.gate='range';
    const types=window.VzipVoiceCheckModel?.VOICE_TYPES||[{key:'low',label:'낮은 목소리',ref:53},{key:'mid',label:'중간 목소리',ref:60},{key:'high',label:'높은 목소리',ref:65}];
    let chosen=null;
    r.say('편한 음 높이를 한 번만 알려 주세요');
    r.q('[data-run-stage]').innerHTML='<div class="dset-ask" data-run-ask="range" role="group" aria-label="편한 음 높이">'+types.map(t=>'<button type="button" class="dset-choice" data-range="'+t.ref+'" aria-pressed="false"><strong>'+esc(t.label)+'</strong><small>'+esc(D.noteName(t.ref))+' 근처</small></button>').join('')+'</div>';
    r.word('눌러서 들어 보세요','wait');r.sub('말할 때처럼 편하게 낼 수 있는 높이를 골라요. 녹음이 쌓이면 잰 음역으로 바뀌어요.');
    text(r.primary,'이 높이로 할게요');r.primary.disabled=true;
    host.querySelectorAll('[data-range]').forEach(b=>b.onclick=()=>{
      chosen=Number(b.dataset.range);host.querySelectorAll('[data-range]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
      audioSession('playback');r.tones?.stop();r.tone(chosen,.05,.9);r.primary.disabled=false;
    });
    r.gateDone=()=>{
      if(chosen==null)return;
      const c=ctx.saveComfort({low:chosen-2,high:chosen+7});if(!c)return;
      r.comfort=c;r.gate='';delete host.dataset.gate;build();drawStage();begin();
    };
  }
  function askMic(){
    r.gate='mic';host.dataset.gate='mic';
    r.say('마이크를 켜도 될까요?');
    r.q('[data-run-stage]').innerHTML='<div class="dset-ask" data-run-ask="mic"><p>음이 맞는지 바로 알려 드리려고 소리를 들어요. 이 화면에서만 듣고, 녹음하거나 저장하지 않아요.</p>'+
      '<button type="button" class="dset-chip" data-mic-off>마이크 없이 타이머로 하기</button></div>';
    r.word('','');r.sub('');text(r.primary,'마이크 켜기');
    r.q('[data-mic-off]').onclick=()=>{ctx.setMic('off');r.gate='';delete host.dataset.gate;drawStage();begin();};
    r.gateDone=async()=>{
      r.primary.disabled=true;
      const ok=await connectMic();
      if(r.dead)return;
      r.primary.disabled=false;r.gate='';delete host.dataset.gate;drawStage();
      if(!ok)notice('마이크를 쓸 수 없어서 타이머로 진행해요. 기기 설정에서 마이크를 허용하면 음정을 바로 알려 드려요.');
      begin();
    };
  }
  const notice=message=>{const el=r.q('[data-run-notice]')||Object.assign(document.createElement('p'),{className:'dset-notice'});el.dataset.runNotice='';el.setAttribute('role','status');el.textContent=message;r.q('[data-run-stage]').after(el);};
  async function connectMic(){
    audioSession('play-and-record');
    try{const mic=await openMic();if(r.dead){mic.close();return false;}r.mic=mic;ctx.setMic('granted');return true;}
    catch(error){ctx.setMic('denied');audioSession('playback');return false;}
  }
  async function begin(){
    if(r.dead||r.state==='doing')return;
    if(r.engine.custom)return r.engine.begin();
    if(needsRange&&!r.comfort)return askRange();
    if(mode==='hold'&&st.mic){
      const known=ctx.mic();
      if(!known)return askMic();
      if(known==='granted'&&!r.mic){
        r.primary.disabled=true;const ok=await connectMic();if(r.dead)return;r.primary.disabled=false;
        if(!ok)notice('마이크를 쓸 수 없어서 타이머로 진행해요. 기기 설정에서 마이크를 허용하면 음정을 바로 알려 드려요.');
      }else if(known!=='granted'&&!r.q('[data-run-notice]'))notice('마이크 없이 타이머로 진행해요.');
    }
    if(!r.mic)audioSession('playback');
    // The cue and reference sounds are unlocked inside this tap.
    r.tones||=tones();try{await Promise.race([r.tones?.ctx.resume?.(),new Promise(done=>setTimeout(done,250))]);}catch{}
    if(r.dead)return;
    const again=r.state==='paused';
    r.state='doing';ctx.start();
    if(again&&r.engine.resume)r.engine.resume();else if(!again)r.engine.start();
    r.paintState();r.startLoop();
  }
  function pauseRun(){
    if(r.state!=='doing')return;
    r.state='paused';ctx.pause();r.stopLoop();r.tones?.stop();r.mic?.close();r.mic=null;
    r.engine.paint?.();r.paintState();r.word('잠깐 멈췄어요','wait');
  }
  r.destroy=()=>{
    if(r.dead)return;r.dead=true;
    const active=r.state==='doing';release();
    // Away from the screen, an exercise cannot go on: its clock stops. The person's own step keeps the set's wall clock.
    if(active&&!r.engine.wall&&!r.engine.custom)ctx.pause();
  };
  function hidden(ev){
    if(r.dead||(ev.type==='visibilitychange'&&!document.hidden))return;
    if(r.engine.custom){if(r.state==='doing'){r.engine.cancel();r.stopLoop();r.state='ready';r.paintState();r.engine.ready();r.word('화면을 벗어나서 녹음을 멈췄어요','low');}return;}
    if(!r.engine.wall)pauseRun();
  }

  build();host.innerHTML=html();r.primary=r.q('[data-run-primary]');
  drawStage();
  // A person's own step that is still running (the set's wall clock went on elsewhere) comes back running.
  // Paused with time on it (the pause button, or an answer about a long stretch away): it waits to be carried on.
  if(r.engine.wall&&s.running){r.state='doing';r.engine.resume();r.startLoop();}
  else if(r.engine.wall&&st.elapsed>0)r.state='paused';
  r.paintState();
  r.primary.onclick=()=>{
    if(r.gate)return r.gateDone();
    if(r.engine.custom)return r.state==='doing'?r.engine.press():begin();
    if(r.engine.wall&&r.state==='doing')return r.complete(r.engine.result());
    if(r.state==='doing')return pauseRun();
    begin();
  };
  r.q('[data-run-pause]').onclick=()=>pauseRun();
  r.q('[data-run-redo]').onclick=()=>{if(r.dead)return;const was=r.state;r.stopLoop();r.tones?.stop();r.mic?.close();r.mic=null;if(was==='doing')ctx.pause();r.state='ready';build();drawStage();r.paintState();ctx.redo?.();};
  r.q('[data-run-skip]').onclick=()=>{if(r.dead)return;const result=r.engine.result?.()||{};r.dead=true;release();ctx.finish('skipped',result);};
  r.q('[data-run-stop]').onclick=()=>{if(r.dead)return;r.dead=true;release();ctx.stop();};
  r.q('[data-run-exit]').onclick=()=>ctx.exit();
  document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',hidden);
  r.begin=begin;
  return r;
}
V.dailySetRunner={mount};
})();
