/* 오늘의 연습 — the doing screen (dark), ONE pattern for every step of a set: a top bar with the set's progress, the
 * step's name small, one big line saying what to do now, one line of why, the answer as a WORD first ("그대로 유지!")
 * with the number small, one big button, and 다시 / 건너뛰기 under it.
 * What is in a set and how its result is kept: app/daily-set-model.js. The session, its clock and its storage belong to
 * app/practice-set.js, which mounts this screen for the step in hand and gets back done / skipped with what was
 * measured:  VZ.dailySetRunner.mount(host, ctx) → {destroy()}.
 * Modes (VzipDailySet.modeOf): timed (목 풀기) · breath (호흡) · follow (the app plays a pattern, then your turn) ·
 * hold (reference note + the 연습 따라 하기 pitch reader VZ.guidedDetectPitch + hold time; a timer when the mic is not
 * available) · take (연습 전후 30초 녹음, VZ.media.capture) · free (the person's own step on the set's wall clock).
 * The measuring exercises of 기본기 단계 (app/daily-measure-model.js has their numbers): hiss (“스~” 길게: the length of
 * one continuous hiss) · rhythm (“타” 따라 하기: listen to a bar, say it back on the next; the distance from the beat) ·
 * vibrato (롱톤 비브라토: 8 seconds, straight then vibrato on the cue). Each ends on its own result screen (word first,
 * numbers small, 다음으로) and puts its `measures` in its result; without the mic they run on a timer and measure nothing.
 * Nothing here is analysed later or uploaded: the mic is only read live on this screen, and no audio is kept. */
(()=>{
'use strict';
const V=window.VZ,D=window.VzipDailySet,L=window.VzipLevels,M=window.VzipDailyMeasure;
if(!V||!D||typeof document==='undefined')return;
const esc=V.esc;
const hz=midi=>440*2**((midi-69)/12);
const audioSession=type=>{try{if(navigator.audioSession)navigator.audioSession.type=type;}catch{}};
const mmss=sec=>{sec=Math.max(0,Math.floor(sec));return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');};
const countdown=left=>(left<0?'+':'')+mmss(Math.abs(left<0?Math.floor(-left):Math.ceil(left)));
const text=(node,value)=>{if(node&&node.textContent!==value)node.textContent=value;};
const TRY_SECONDS=20,LISTEN=1.2,CHEER=.9;
/** The modes that listen through the mic (asked once, a timer without it). */
const MIC_MODES=['hold','hiss','rhythm','vibrato'];

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
    /** A short sound at an absolute time of this context (the clicks and “타” of 리듬). */
    at(time,freq,dur,level=.14,type='sine'){
      try{
        const o=ctx.createOscillator(),g=ctx.createGain();o.type=type;o.frequency.value=freq;
        g.gain.setValueAtTime(0,time);g.gain.linearRampToValueAtTime(level,time+.004);g.gain.linearRampToValueAtTime(0,time+dur);
        o.connect(g).connect(ctx.destination);sources.add(o);o.onended=()=>{sources.delete(o);try{o.disconnect();g.disconnect();}catch{}};o.start(time);o.stop(time+dur+.02);
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
    const data=new Float32Array(analyser.fftSize),grab=()=>{analyser.getFloatTimeDomainData(data);return ctx.currentTime;};
    let lastIdx=null;
    return {ctx,
      read(){grab();return V.guidedDetectPitch(data,ctx.sampleRate);},
      /** The pitch of the last ~43 ms with its time on this context's clock: {t, hz|null} (비브라토 needs a short window). */
      pitch(){const end=grab(),sr=ctx.sampleRate,n=Math.min(data.length,2048);return {t:end-n/2/sr,hz:V.guidedDetectPitch(data.subarray(data.length-n),sr)||null};},
      /** The level of every 5 ms since the last call: [{t (its end, s), rms, d}] (호흡 · 리듬). */
      frames(){
        const end=grab(),sr=ctx.sampleRate,N=data.length,hop=Math.max(1,Math.round(sr*(M?.RHYTHM.frame||.005))),endIdx=Math.round(end*sr),startIdx=endIdx-N,out=[];
        let e=Math.ceil((startIdx+hop)/hop)*hop;if(lastIdx!=null)e=Math.max(e,lastIdx+hop);
        for(;e<=endIdx;e+=hop){let q=0;const a=e-hop-startIdx;for(let i=a;i<a+hop;i++)q+=data[i]*data[i];out.push({t:e/sr,rms:Math.sqrt(q/hop),d:hop/sr});lastIdx=e;}
        return out;
      },
      close(){stream.getTracks().forEach(t=>t.stop());try{source.disconnect();analyser.disconnect();}catch{}try{ctx.close().catch(()=>{});}catch{}}};
  }catch(error){stream?.getTracks().forEach(t=>t.stop());try{ctx?.close().catch(()=>{});}catch{}throw error;}
}
/** Cents from the target, folded to the nearest octave: the same note an octave apart counts as that note. */
const centsFrom=(frequency,midi)=>{if(!frequency)return null;const c=1200*Math.log2(frequency/hz(midi));return Math.round(((c+600)%1200+1200)%1200-600);};
/** Which octave the note was really sung in (0 = as played, −1 = an octave under): kept with a held note, so 음역 in
 * 기본기 단계 counts the note that was sung, not the folded one. */
const octaveFrom=(frequency,midi)=>frequency?Math.round(Math.log2(frequency/hz(midi))):0;

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
  /* 호흡: in for `inhale`, out on "스~" for a longer count each round. Paced, not measured: the measured “스~” is the
   * hiss mode below (“스~” 길게). */
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
   * same notes run on a timer and nothing is measured (result.timer).
   * With the mic each note keeps {ok, held, accuracy, cents, sd (how much the pitch moved during the hold, cent),
   * octave?}, and the step's result carries `measures` for 기본기 단계 (VzipLevels.fromHold: 음정 · 지속음 · 음역). */
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
      const measures=mic()&&L?.fromHold?L.fromHold(e,out):[];
      return {mode:'hold',...(mic()?{}:{timer:true}),parts:out.length,notes:out.slice(),...(mic()?{holdSeconds:Math.round(out.reduce((n,x)=>n+Math.min(need,x.held||0),0)*10)/10,
        accuracy:sung>0?Math.round(inside/sung*100):null}:{}),...(measures.length?{measures}:{})};
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
        '<div class="dset-holdbar" aria-hidden="true"><i data-run-hold></i></div>'+
        // A stated rule, not a silent one: the reading is folded to the nearest octave (centsFrom).
        '<p class="dset-rule" data-run-rule'+(['denied','off'].includes(r.ctx.mic())?' hidden':'')+'>한 옥타브 위나 아래로 불러도 맞은 것으로 쳐요</p></div>'+dots(notes.length,0,0),
      ready(){r.word('준비되면 시작해요','wait');r.sub('음 '+notes.length+'개 · 한 음에 '+need+'초씩'+(r.ctx.mic()==='denied'||r.ctx.mic()==='off'?' · 마이크 없이 타이머로 해요':''));},
      bind(){r.q('[data-run-again]')?.addEventListener('click',()=>{if(r.state==='doing'||r.state==='ready'){r.audio('playback');r.tone(notes[i],.05,LISTEN-.1);}});},
      start(){i=0;out.length=0;h=D.holdStart();tried=0;phase='listen';left=LISTEN;const rule=r.q('[data-run-rule]');if(rule)rule.hidden=!mic();play();paint(null);},
      resume(){h=D.holdStart();tried=0;phase='listen';left=LISTEN;play();paint(null);},
      tick(dt){
        if(phase==='listen'){left-=dt;if(left<=0){phase='sing';left=need+2;}return paint(null);}
        if(phase==='cheer'){left-=dt;if(left<=0)return next();return paint(0);}
        if(!mic()){left-=dt;if(left<=0){phase='cheer';left=CHEER;r.cue(1);}return paint(null);}
        const heard=r.mic.read(),cents=centsFrom(heard,notes[i]);
        D.holdTick(h,cents,dt,{tolerance:tol,need,octave:octaveFrom(heard,notes[i])});tried+=dt;
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

/* ---------- the measuring exercises of 기본기 단계: 호흡 · 리듬 · 비브라토 ---------- */
/** The result screen of a measuring exercise: a big number with its unit, small lines, one plain note. */
function resultHtml({big='',unit='',lines=[],note=''}){
  return '<div class="dset-result" data-run-result><strong class="dset-result-big" data-result-big>'+esc(big)+(unit?'<small>'+esc(unit)+'</small>':'')+'</strong>'+
    (lines.length?'<ul class="dset-result-lines" data-result-lines>'+lines.map(l=>'<li>'+esc(l)+'</li>').join('')+'</ul>':'')+
    (note?'<p class="dset-rule" data-result-note>'+esc(note)+'</p>':'')+'</div>';
}
/** The 기본기 area as it is now (its step and the next criterion), or null. */
const areaNow=id=>{try{return L?.skill?.(V.db,id,{today:V.today()})||null;}catch{return null;}};
/** The number the next step of an area asks of `field` (e.g. the seconds of 호흡), or null. */
function nextNeed(id,field){
  const a=areaNow(id),step=a?.next&&L.SKILLS.find(x=>x.id===id)?.steps[a.next.step-1],c=step?.conds.find(x=>x.field===field);
  return c?{step:a.next.step,min:c.min,max:c.max,say:step.say}:null;
}
const secText=n=>(Math.round(n*10)/10).toFixed(1);
const stepNote=area=>'기준을 서로 다른 '+(L?.RULES?.days||3)+'일에 채우면 '+area+' 단계가 올라가요.';

Object.assign(ENGINES,{
  /* 호흡 · “스~” 길게: a quiet half second (the floor), a deep breath in, then one “스~” as long as possible; a gap
   * longer than 0.25 s ends it. Two tries; the longest counts. */
  hiss(r){
    const e=r.e,tries=e.tries||2,inhale=e.inhale||3,out=[],mic=()=>!!M&&(!!r.mic||(r.state==='result'&&!!r.wasMic)),need=nextNeed('breath','value');
    const QUIET=.6,WAIT=8,REST=2.2,TIMER=20;
    let k=0,phase='quiet',left=QUIET,wait=0,tr=null,live=0;
    const best=()=>out.reduce((n,x)=>Math.max(n,x.seconds||0),0);
    const orb=(size,ph)=>{const o=r.q('[data-run-orb]');if(o){o.style.transform=r.reduced?'':'scale('+size.toFixed(3)+')';o.dataset.phase=ph;}};
    const barTo=part=>{const b=r.q('[data-run-breath]');if(b)b.style.width=Math.round(Math.max(0,Math.min(1,part))*100)+'%';};
    const paint=()=>{
      setDots(r,k,out.length);r.host.dataset.phase=phase;
      if(phase==='quiet'){orb(.55,'in');text(r.q('[data-run-count]'),'…');barTo(0);r.word('잠깐 조용히 해 주세요','wait');r.sub((k+1)+' / '+tries+'번째 · 방 소리를 맞추고 있어요');return;}
      if(phase==='in'){const part=1-left/inhale;orb(.55+.45*part,'in');text(r.q('[data-run-count]'),String(Math.max(0,Math.ceil(left))));barTo(0);r.word('크게 들이쉬어요','wait');r.sub((k+1)+' / '+tries+'번째');return;}
      if(phase==='go'){orb(1,'out');text(r.q('[data-run-count]'),'0.0');barTo(0);r.word('“스~” 시작!','go');r.sub(need?'다음 단계 기준 '+need.min+'초':'한 번에 최대한 길게');return;}
      if(phase==='hiss'||phase==='out'){
        const sec=phase==='out'?TIMER-left:live,goal=need?.min||30;
        orb(Math.max(.55,1-.45*Math.min(1,sec/Math.max(goal,1))),'out');text(r.q('[data-run-count]'),phase==='out'?String(Math.max(0,Math.ceil(left))):secText(sec));barTo(sec/goal);
        if(phase==='out'){r.word('“스~” 고르게 내쉬어요','go');r.sub((k+1)+' / '+tries+'번째 · 마이크 없이 타이머로 해요');return;}
        r.word(need&&sec>=need.min?'기준을 넘었어요, 계속!':'좋아요, 그대로 이어요',need&&sec>=need.min?'exact':'go');
        r.sub((need?'다음 단계 기준 '+need.min+'초':'한 번에 최대한 길게')+(out.length?' · 가장 긴 스 '+secText(best())+'초':''));return;
      }
      if(phase==='rest'){orb(.55,'rest');barTo(0);}
    };
    const startTry=()=>{
      left=QUIET;wait=0;live=0;
      if(mic()){r.mic.frames();tr=M.hissStart(r.mic.ctx.currentTime);phase='quiet';}else{phase='in';left=inhale;}
      r.say(e.text);paint();
    };
    const finish=()=>{
      if(!mic())return r.complete(result());
      const m=M.breathMeasure(out),b=best(),even=m&&m.even!=null?m.even:null,met=need&&b>=need.min;
      r.word(b>0?(met?'다음 단계 기준을 채웠어요':'“스~”를 '+secText(b)+'초 이었어요'):'“스~”가 들리지 않았어요',b>0?(met?'exact':'hold'):'wait');
      r.sub(b>0?'':'휴대폰을 입에서 한 뼘쯤 두고 다시 해 봐요');
      r.say('“스~”를 한 번에 가장 길게 이은 시간');
      r.showResult(resultHtml({big:secText(b),unit:'초',lines:[...out.map((x,i)=>(i+1)+'번째 · '+(x.seconds>0?secText(x.seconds)+'초':'들리지 않았어요')),
        ...(even!=null?['세기 흔들림 '+even+' dB (작을수록 고르게 내쉰 거예요)']:[]),...(need?['다음 '+need.step+'단계 · '+need.say]:[])],
        note:'소리가 0.25초 넘게 끊기면 거기까지 세요. '+stepNote('호흡')}));
    };
    const endTry=res=>{
      out.push(res);phase='rest';left=REST;r.cue(1);
      r.word(res.seconds>0?secText(res.seconds)+'초 이었어요':'“스~”가 들리지 않았어요',res.seconds>0?'hold':'wait');
      r.sub(k<tries-1?'편하게 숨을 쉬고 한 번 더 해요':'');paint();
    };
    const result=()=>{const m=mic()?M.breathMeasure(out):null;return {mode:'hiss',...(mic()?{}:{timer:true}),parts:out.length,...(m?{longestOut:m.value,measures:[m]}:{})};};
    return {fast:true,say:()=>e.text,
      stage:()=>'<div class="dset-breath"><div class="dset-orb-box"><i class="dset-orb" data-run-orb data-phase="in" aria-hidden="true"></i><strong data-run-count></strong></div><div class="dset-breath-bar" aria-hidden="true"><i data-run-breath></i></div></div>'+dots(tries,0,0),
      micWhy:'“스~”가 얼마나 길게 이어지는지 재려고 소리를 들어요. 이 화면에서만 듣고, 녹음하거나 저장하지 않아요.',
      ready(){text(r.q('[data-run-count]'),String(inhale));r.word('준비되면 시작해요','wait');r.sub(tries+'번 해요'+(need?' · 다음 단계 기준 '+need.min+'초':'')+(['denied','off'].includes(r.ctx.mic())?' · 마이크 없이 타이머로 해요':''));},
      start(){k=0;out.length=0;startTry();},resume(){startTry();},
      tick(dt){
        if(phase==='rest'){left-=dt;if(left<=0){k++;if(k>=tries)return finish();startTry();}return;}
        if(!mic()){
          left-=dt;
          if(left<=0){if(phase==='in'){phase='out';left=TIMER;r.cue(1);}else{out.push({seconds:0,timer:true});phase='rest';left=REST;r.word('편하게 쉬어요','wait');r.sub('');}}
          return paint();
        }
        M.hissFeed(tr,r.mic.frames());const now=M.hissNow(tr);live=now.seconds;
        if(phase==='quiet'){left-=dt;if(left<=0){phase='in';left=inhale;r.cue(0);}}
        else if(phase==='in'){left-=dt;if(now.hissing)phase='hiss';else if(left<=0){phase='go';wait=0;r.cue(1);}}
        else if(phase==='go'){wait+=dt;if(now.hissing)phase='hiss';else if(wait>=WAIT)return endTry(M.hissResult(tr));}
        if(phase==='hiss'&&now.ended)return endTry(M.hissResult(tr));
        paint();
      },
      result};
  },
  /* 리듬 · “타” 따라 하기: a count-in, then a bar of “타” to listen to and a bar to say it back, four times a round;
   * the rounds follow the 리듬 step reached (M.rhythmPlan). The sounds are scheduled on the sound context, the level
   * frames come from the mic context: both are read at the same moment when a round starts. */
  rhythm(r){
    const plan=M?M.rhythmPlan(areaNow('rhythm')?.step||0):[{level:1,bpm:80}],out=[],mic=()=>!!M&&(!!r.mic||(r.state==='result'&&!!r.wasMic));
    let k=0,phase='round',left=0,tl=null,t0=0,clock=0,frames=[],pair=-2,told=-1,feedback=null;
    const timeline=x=>M?M.roundTimeline(x):{level:x.level,bpm:x.bpm,beat:.75,bar:3,clicks:[],tas:[],expect:[],bars:[],end:27};
    const pos=()=>mic()?r.mic.ctx.currentTime-t0:clock;
    const grid=b=>{
      const g=r.q('[data-run-grid]');if(!g)return;
      const p=b&&b.pair>=0?M.PATTERNS[tl.level][b.pair%M.PATTERNS[tl.level].length]:[];
      g.querySelectorAll('.dset-note').forEach(n=>n.remove());
      for(const x of p){const n=document.createElement('i');n.className='dset-note';n.style.left=(x/4*100)+'%';n.dataset.at=String(x);g.append(n);}
    };
    const paint=()=>{
      setDots(r,k,out.length);
      if(phase==='gap')return;
      const t=pos(),b=tl.bars.find(x=>t>=x.from&&t<x.to)||null,label=r.q('[data-run-bar]');
      if(b&&b.pair!==pair){pair=b.pair;grid(b);}
      r.host.dataset.bar=b?b.kind:'wait';
      if(label)text(label,b?b.kind==='count'?'넷을 세요':b.kind==='listen'?'들어요':'따라 해요':'준비');
      const head=r.q('[data-run-head]');if(head)head.style.left=(b?Math.max(0,Math.min(1,(t-b.from)/tl.bar))*100:0)+'%';
      if(b){const beat=(t-b.from)/tl.beat;r.q('[data-run-grid]')?.querySelectorAll('.dset-note').forEach(n=>n.classList.toggle('is-on',Number(n.dataset.at)<=beat+.02));}
      if(feedback&&b?.kind!=='say'){r.word(feedback.word,feedback.key);r.sub(feedback.sub);}
      else r.word(!b||b.kind==='count'?'박자를 들어요':b.kind==='listen'?'들어 보세요':'“타”로 따라 해요',b?.kind==='say'?'go':'wait');
      if(!feedback||b?.kind==='say')r.sub(M.LEVEL_WORDS?.[tl.level]+' · 1분에 '+tl.bpm+'박 · '+(k+1)+' / '+plan.length+'라운드'+(mic()?'':' · 마이크 없이 해요'));
    };
    const startRound=()=>{
      tl=timeline(plan[k]);frames=[];clock=0;pair=-2;told=-1;feedback=null;phase='round';
      const T=r.tones,lead=.15;
      if(mic()){r.mic.frames();t0=r.mic.ctx.currentTime+lead;}
      if(T){const base=T.ctx.currentTime+lead;
        for(const c of tl.clicks)T.at(base+c.t,c.accent?1760:1320,.03,c.soft?.05:c.accent?.2:.12,'square');
        for(const t of tl.tas)T.at(base+t,392,.09,.24,'triangle');}
      r.say(r.e.text);paint();
    };
    /** After each say-it-back bar: how the “타” of the bars so far landed, as a word. */
    const tell=b=>{
      if(!mic())return;
      const part={...tl,expect:tl.expect.filter(t=>t<b.to),bars:tl.bars.filter(x=>x.to<=b.to+1e-9)},x=M.rhythmRound(frames,part);
      feedback=x.value==null?{word:'“타”가 잘 안 들려요',key:'wait',sub:'조금 더 또렷하게 “타”'}:
        {word:x.value<=40?'딱 맞아요':x.value<=80?'잘 맞아요':'조금 흔들려요',key:x.value<=80?'exact':'go',sub:'박자와 '+x.value+' ms · '+x.matched+' / '+x.n+'개'};
    };
    const methodNote=()=>{
      const ok=out.filter(x=>x&&x.value!=null),echo=ok.find(x=>x.method==='echo'),med=ok.find(x=>x.method==='median');
      if(echo)return '이어폰 없이 했어요. 박자 소리가 마이크로 돌아오는 시간('+(echo.rt||echo.offset)+' ms)을 재서 뺐어요. 늘 늦거나 빠른 것도 그대로 재요.';
      if(med)return '기기에서 소리가 늦게 나는 정도를 알 수 없어서, 내 “타”의 평균 위치(박자보다 '+med.offset+' ms)를 기준으로 고르기만 쟀어요.';
      return '';
    };
    const finish=()=>{
      if(!mic())return r.complete(result());
      const ok=out.filter(x=>x&&x.value!=null),passed=ok.some(x=>x.value<=80&&x.hit>=80),hard=ok.slice().sort((a,b)=>b.level-a.level||a.value-b.value)[0];
      r.say(hard?M.LEVEL_WORDS[hard.level]+'에서 “타”가 박자와 떨어진 정도':'“타”가 박자와 떨어진 정도');
      r.word(!ok.length?'“타”가 잘 안 들렸어요':passed?'박자에 맞췄어요':'조금씩 맞춰 가요',!ok.length?'wait':passed?'exact':'hold');
      r.sub(hard?'':'휴대폰을 앞에 두고 또렷하게 “타”');
      const need=nextNeed('rhythm','value');
      r.showResult(resultHtml({big:hard?String(hard.value):'–',unit:hard?'ms':'',
        lines:[...out.map(x=>M.LEVEL_WORDS[x.level]+' · '+x.bpm+'박 · '+(x.value!=null?'박자와 '+x.value+' ms · '+x.matched+' / '+x.n+'개':'“타”가 잘 안 들렸어요')),...(need?['다음 '+need.step+'단계 · '+need.say]:[])],
        note:[methodNote(),stepNote('리듬')].filter(Boolean).join(' ')}));
    };
    const result=()=>{const ms=mic()?M.rhythmMeasures(out):[];return {mode:'rhythm',...(mic()?{}:{timer:true}),parts:out.length,...(ms.length?{measures:ms}:{})};};
    return {fast:true,say:()=>r.e.text,
      stage:()=>'<div class="dset-rhythm"><p class="dset-rhythm-bar" data-run-bar>준비</p><div class="dset-grid" data-run-grid aria-hidden="true">'+
        [0,1,2,3].map(b=>'<b class="dset-beatline" style="left:'+(b*25)+'%"></b>').join('')+'<span class="dset-head" data-run-head></span></div>'+
        '<p class="dset-rule">이어폰을 끼면 더 정확해요 · 처음 네 번은 듣기만 해요</p></div>'+dots(plan.length,0,0),
      micWhy:'“타”가 박자에 맞는지 재려고 소리를 들어요. 이 화면에서만 듣고, 녹음하거나 저장하지 않아요.',
      ready(){r.word('준비되면 시작해요','wait');r.sub(plan.length+'라운드 · '+plan.map(x=>M?.LEVEL_WORDS?.[x.level]||'').join(' → ')+(['denied','off'].includes(r.ctx.mic())?' · 마이크 없이 해요':''));},
      start(){k=0;out.length=0;startRound();},resume(){startRound();},
      tick(dt){
        if(phase==='gap'){left-=dt;if(left<=0){k++;if(k>=plan.length)return finish();startRound();}return;}
        clock+=dt;
        if(mic())for(const f of r.mic.frames())frames.push({t:f.t-t0,rms:f.rms});
        const t=pos(),done=tl.bars.filter(b=>b.kind==='say'&&t>=b.to+.35&&b.pair>told);
        for(const b of done){told=b.pair;tell(b);}
        if(t>=tl.end+.4){
          const x=mic()?M.rhythmRound(frames,tl):{level:tl.level,bpm:tl.bpm,value:null,timer:true};
          out.push(x);phase='gap';left=1.6;r.cue(1);
          r.word(x.value==null?(mic()?'“타”가 잘 안 들렸어요':'한 라운드 했어요'):x.value<=80&&x.hit>=80?'잘 맞췄어요':'조금씩 맞춰 가요',x.value!=null&&x.value<=80?'exact':'wait');
          r.sub(x.value!=null?'박자와 '+x.value+' ms · '+x.matched+' / '+x.n+'개':'');setDots(r,k+1,out.length);return;
        }
        paint();
      },
      result};
  },
  /* 비브라토 · 롱톤: hear the note, then 8 seconds from the moment the voice starts — straight, and on the cue at 4 s
   * the vibrato. Two pitches. The pitch is read every tick from a short window (M.vibratoRound needs ≥ 9 Hz). */
  vibrato(r){
    const e=r.e,notes=D.notesFor(e,r.comfort,r.ctx.session.date),hold=e.hold||8,cue=e.cue||4,out=[],mic=()=>!!M&&(!!r.mic||(r.state==='result'&&!!r.wasMic));
    const WAIT=6,REVIEW=1.8;
    let i=0,phase='listen',left=LISTEN,samples=[],v0=null,wait=0,clock=0,cued=false;
    const play=()=>r.tone(notes[i],.05,LISTEN-.1);
    const needle=cents=>{const n=r.q('[data-run-needle]');if(n){n.style.left=(50+Math.max(-45,Math.min(45,(cents||0)*.9)))+'%';n.dataset.on=cents==null?'':'1';}};
    const meter=part=>{const m=r.q('[data-run-hold]');if(m)m.style.width=Math.round(Math.max(0,Math.min(1,part))*100)+'%';};
    const roundWord=x=>!x.voiced?'소리가 들리지 않았어요':x.cued?'신호에 맞춰 떨었어요':x.regular&&x.seconds>=3?'고르게 떨었어요':x.tail?'끝에 비브라토가 나왔어요':x.seconds>0?'떨림이 조금 보였어요':'곧게 이었어요';
    const roundLine=x=>D.noteName(x.midi)+' · '+(!x.voiced?'소리가 들리지 않았어요':x.seconds>0&&x.rate!=null?'비브라토 '+x.seconds+'초 · 1초에 '+x.rate+'번 · 폭 '+x.extent+' cent'+(x.cued?' · 신호에 맞춤':''):'비브라토가 보이지 않았어요');
    const paint=cents=>{
      setDots(r,i,out.length);text(r.q('[data-run-note]'),D.noteName(notes[i]));r.host.dataset.phase=phase;
      if(phase==='listen'){needle(null);meter(0);r.word('들어 보세요','wait');r.sub((i+1)+' / '+notes.length+' · '+D.noteName(notes[i]));return;}
      if(phase==='wait'){needle(null);meter(0);r.word('“'+e.syllable+'” 시작해요','go');r.sub('소리가 나면 8초를 세요');return;}
      if(phase==='review')return;
      const t=mic()?samples.length?samples.at(-1).t:0:clock,after=t>=cue;
      meter(t/hold);needle(cents);
      if(!mic()){r.word(after?'이제 떨어요':'곧게 이어요','go');r.sub((i+1)+' / '+notes.length+' · '+Math.max(0,Math.ceil(hold-t))+'초 · 마이크 없이 타이머로 해요');return;}
      const w=M.vibratoWindows(samples,{from:Math.max(0,t-1),to:t}).at(-1)||null,word=t<1?{key:cents==null?'wait':'exact',text:cents==null?'소리를 내 보세요':'곧게 이어요'}:M.vibratoWord(w,{afterCue:after});
      r.word(word.text,word.key);
      r.sub((after?'떨기':'곧게')+' · '+secText(Math.min(t,hold))+' / '+hold+'초'+(w&&w.voiced&&w.vib?' · 1초에 '+w.hz+'번 · 폭 '+Math.round(w.amp)+' cent':''));
    };
    const next=()=>{
      if(i>=notes.length-1)return finish();
      i++;phase='listen';left=LISTEN;samples=[];v0=null;wait=0;clock=0;cued=false;play();paint(null);
    };
    const endRound=x=>{
      out.push({midi:notes[i],...x});phase='review';left=REVIEW;r.cue(1);
      r.word(mic()?roundWord(x):'다음 음으로 가요',mic()&&(x.cued||x.tail||x.seconds>0)?'exact':'wait');r.sub(mic()?roundLine(out.at(-1)):'');
    };
    const finish=()=>{
      if(!mic())return r.complete(result());
      const m=M.vibratoMeasure(out),word=!m?'소리가 들리지 않았어요':m.variants>=2?'두 높이 모두 신호에 맞췄어요':roundWord(out.find(x=>x.seconds===m.value&&x.cued===m.cued)||out[0]);
      r.say('비브라토가 고르게 이어진 시간');
      r.word(word,m&&(m.cued||m.tail||m.value>0)?'exact':'wait');
      r.sub(m&&m.value>0?'':'곧게 낸 소리도 좋은 연습이에요');
      const need=areaNow('vibrato')?.next;
      r.showResult(resultHtml({big:m?String(m.value):'0',unit:'초',lines:[...out.map(roundLine),...(need?['다음 '+need.step+'단계 · '+need.say]:[])],
        note:'1초에 '+M.VIBRATO.minHz+'~'+M.VIBRATO.maxHz+'번, 폭 '+M.VIBRATO.extent+' cent 넘게 고르게 떨릴 때만 비브라토로 세요. '+stepNote('비브라토')}));
    };
    const result=()=>{const m=mic()?M.vibratoMeasure(out):null;return {mode:'vibrato',...(mic()?{}:{timer:true}),parts:out.length,...(m?{measures:[m]}:{})};};
    return {fast:true,say:()=>e.text,
      stage:()=>'<div class="dset-tuner"><div class="dset-target"><small>지금 음</small><strong data-run-note>'+esc(D.noteName(notes[0]))+'</strong><button type="button" class="dset-chip" data-run-again><i class="ph ph-speaker-high" aria-hidden="true"></i>음 다시 듣기</button></div>'+
        '<div class="dset-track" aria-hidden="true"><i class="dset-zone"></i><i class="dset-needle" data-run-needle></i></div>'+
        '<div class="dset-holdbar dset-vibbar" aria-hidden="true"><i data-run-hold></i><b class="dset-cue" style="left:'+(cue/hold*100)+'%"></b></div>'+
        '<div class="dset-track-labels" aria-hidden="true"><span>곧게 '+cue+'초</span><span>신호 뒤 떨기</span></div></div>'+dots(notes.length,0,0),
      micWhy:'떨림의 빠르기와 폭을 재려고 소리를 들어요. 이 화면에서만 듣고, 녹음하거나 저장하지 않아요.',
      ready(){r.word('준비되면 시작해요','wait');r.sub('음 '+notes.length+'개 · 한 음에 '+hold+'초 · '+cue+'초에 신호'+(['denied','off'].includes(r.ctx.mic())?' · 마이크 없이 타이머로 해요':''));},
      bind(){r.q('[data-run-again]')?.addEventListener('click',()=>{if(r.state==='doing'||r.state==='ready'){r.audio('playback');r.tone(notes[i],.05,LISTEN-.1);}});},
      start(){i=0;out.length=0;phase='listen';left=LISTEN;samples=[];v0=null;wait=0;clock=0;cued=false;play();paint(null);},
      resume(){phase='listen';left=LISTEN;samples=[];v0=null;wait=0;clock=0;cued=false;play();paint(null);},
      tick(dt){
        if(phase==='listen'){left-=dt;if(left<=0){phase=mic()?'wait':'sing';wait=0;clock=0;}return paint(null);}
        if(phase==='review'){left-=dt;if(left<=0)return next();return;}
        if(!mic()){
          clock+=dt;if(clock>=cue&&!cued){cued=true;r.cue(1);}
          if(clock>=hold)return endRound({seconds:0,voiced:0,timer:true});
          return paint(null);
        }
        const p=r.mic.pitch(),cents=p.hz?centsFrom(p.hz,notes[i]):null;
        if(phase==='wait'){
          wait+=dt;
          if(cents!=null){phase='sing';v0=p.t;samples=[{t:0,cents}];}
          else if(wait>=WAIT)return endRound({seconds:0,rate:null,extent:null,regularity:null,regular:0,tail:0,straight:0,cued:0,voiced:0});
          return paint(cents);
        }
        const t=p.t-v0;
        if(t>samples.at(-1).t)samples.push({t,cents});
        if(t>=cue&&!cued){cued=true;r.cue(1);}
        if(t>=hold)return endRound(M.vibratoRound(samples,{hold,cue}));
        paint(cents);
      },
      result};
  }
});

/* ---------- the screen ---------- */
function mount(host,ctx){
  const s=ctx.session,st=s.steps[s.index],mode=D.modeOf(st),e=st.exercise?D.exercise(st.exercise):null;
  delete host.dataset.phase;delete host.dataset.bar;
  const r={host,ctx,st,mode,e,state:'ready',dead:false,timer:0,last:0,mic:null,tones:null,comfort:null,gate:'',
    reduced:!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,q:sel=>host.querySelector(sel)};
  const needsRange=mode==='hold'||mode==='follow'||mode==='vibrato';
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
  },r.engine?.fast?40:100);};
  r.stopLoop=()=>{clearInterval(r.timer);r.timer=0;};
  const release=()=>{r.stopLoop();r.mic?.close();r.mic=null;r.tones?.close();r.tones=null;r.engine?.cancel?.();audioSession('auto');
    document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',hidden);};
  r.complete=result=>{if(r.dead)return;r.dead=true;release();ctx.finish('done',result);};
  /** A measuring exercise is over: its result on screen (the clock stopped, the mic closed), then 다음으로. */
  r.showResult=html=>{
    if(r.dead)return;r.stopLoop();r.tones?.stop();r.wasMic=!!r.mic;r.mic?.close();r.mic=null;ctx.pause();
    r.state='result';r.q('[data-run-stage]').innerHTML=html;r.paintState();
  };

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
    const label=r.gate?'':r.state==='result'?'다음으로':r.engine.primaryText?.(r.state)||(r.state==='doing'?'잠깐 멈춤':r.state==='paused'?'계속하기':'시작하기');
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
    r.q('[data-run-stage]').innerHTML='<div class="dset-ask" data-run-ask="mic"><p>'+esc(r.engine.micWhy||'음이 맞는지 바로 알려 드리려고 소리를 들어요. 이 화면에서만 듣고, 녹음하거나 저장하지 않아요.')+'</p>'+
      '<button type="button" class="dset-chip" data-mic-off>마이크 없이 타이머로 하기</button></div>';
    r.word('','');r.sub('');text(r.primary,'마이크 켜기');
    r.q('[data-mic-off]').onclick=()=>{ctx.setMic('off');r.gate='';delete host.dataset.gate;drawStage();begin();};
    r.gateDone=async()=>{
      r.primary.disabled=true;
      const ok=await connectMic();
      if(r.dead)return;
      r.primary.disabled=false;r.gate='';delete host.dataset.gate;drawStage();
      if(!ok)notice(noMicText());
      begin();
    };
  }
  const noMicText=()=>mode==='hold'?'마이크를 쓸 수 없어서 타이머로 진행해요. 기기 설정에서 마이크를 허용하면 음정을 바로 알려 드려요.':
    '마이크를 쓸 수 없어서 타이머로 진행해요. 이번에는 재지 않아요. 기기 설정에서 마이크를 허용하면 기본기 단계를 잴 수 있어요.';
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
    if(MIC_MODES.includes(mode)&&st.mic){
      const known=ctx.mic();
      if(!known)return askMic();
      if(known==='granted'&&!r.mic){
        r.primary.disabled=true;const ok=await connectMic();if(r.dead)return;r.primary.disabled=false;
        if(!ok)notice(noMicText());
      }else if(known!=='granted'&&!r.q('[data-run-notice]'))notice(mode==='hold'?'마이크 없이 타이머로 진행해요.':'마이크 없이 타이머로 진행해요. 이번에는 재지 않아요.');
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
    if(r.state==='result')return r.complete(r.engine.result());
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
