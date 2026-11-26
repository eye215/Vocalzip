/* 오늘의 연습 — the doing screen (dark), ONE pattern for every step of a set: a top bar with the set's progress, the
 * step's name small, one big line saying what to do now, one line of why, the answer as a WORD first ("그대로 유지!")
 * with the number small, one big button, and 다시 / 건너뛰기 under it.
 * What is in a set and how its result is kept: app/daily-set-model.js. The session, its clock and its storage belong to
 * app/practice-set.js, which mounts this screen for the step in hand and gets back done / skipped with what was
 * measured:  VZ.dailySetRunner.mount(host, ctx) → {destroy()}.
 * Modes (VzipDailySet.modeOf): timed (목 풀기) · breath (호흡) · follow (the app plays a pattern, then your turn) ·
 * hold (reference note + the 연습 따라 하기 pitch reader VZ.guidedDetectPitch + hold time; a timer when the mic is not
 * available) · take (연습 전후 30초 녹음, VZ.media.capture) · free (the person's own step on the set's wall clock) ·
 * guide (따라 하기, a set of one step: a hand-reviewed video with the mic off and the clock only while it plays, then
 * 혼자 해 보기 on a timer with the tuner where the exercise has one; the metronome where its text names a beat).
 * The measuring exercises of 기본기 단계 (app/daily-measure-model.js has their numbers): hiss (“스~” 길게: the length of
 * one continuous hiss) · rhythm (“타” 따라 하기: listen to a bar, say it back on the next; the distance from the beat) ·
 * vibrato (롱톤 비브라토: 8 seconds, straight then vibrato on the cue) · scale (스케일 따라 부르기: hear it, sing it back
 * to the beat; the key rises a round at a time) · siren (사이렌: a glide up and back down). Each ends on its own result screen (word first,
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
const MIC_MODES=['hold','hiss','rhythm','vibrato','scale','siren'];

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
      /** The level (RMS) of the window read last: why a note was not heard (too quiet, or nothing at all). */
      level(){let q=0;for(let i=0;i<data.length;i++)q+=data[i]*data[i];return Math.sqrt(q/data.length);},
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
/** A frequency as a MIDI number with its fraction (사이렌 · 스케일 keep the pitch as sung, not folded). */
const midiOf=frequency=>frequency?Math.round((69+12*Math.log2(frequency/440))*100)/100:null;

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
      const tags=D.noteTags?.(e,i)||{};
      out.push(mic()?{midi:notes[i],...tags,...D.holdResult(h)}:{midi:notes[i],...tags});
      if(i>=notes.length-1)return r.complete(result());
      i++;h=D.holdStart();tried=0;phase='listen';left=LISTEN;play();
    };
    const result=()=>{
      const sung=out.reduce((n,x)=>n+(x.sung||0),0),inside=out.reduce((n,x)=>n+(x.sung||0)*(x.accuracy||0)/100,0);
      const measures=mic()&&L?.fromHold?L.fromHold(e,out):[];
      return {mode:'hold',...(mic()?{}:{timer:true}),parts:out.length,notes:out.slice(),...(mic()?{holdSeconds:Math.round(out.reduce((n,x)=>n+Math.min(need,x.held||0),0)*10)/10,
        accuracy:sung>0?Math.round(inside/sung*100):null}:{}),...(measures.length?{measures}:{})};
    };
    const paint=(cents,hint='')=>{
      setDots(r,i,out.length);text(r.q('[data-run-note]'),D.noteName(notes[i]));
      if(phase==='listen'){needle(null);meter(0);r.word('들어 보세요','wait');r.sub((i+1)+' / '+notes.length+' · '+D.noteName(notes[i])+(e.vowels?' · “'+D.syllableOf(e,i)+'”':''));return;}
      if(phase==='cheer'){needle(0);meter(1);r.word(mic()?'좋아요!':'다음 음으로 가요','exact');return;}
      if(!mic()){meter(1-left/(need+2));needle(null);r.word('“'+(D.syllableOf?.(e,i)||e.syllable)+'” 이어요','go');r.sub((i+1)+' / '+notes.length+' · '+Math.max(0,Math.ceil(left))+'초 · 마이크 없이 타이머로 해요');return;}
      const w=D.word(cents,tol);needle(cents);meter(h.held/need);r.word(w.text,w.key);
      r.sub(hint||(cents==null?'':(cents>0?'+':'')+cents+' cent · ')+h.held.toFixed(1)+' / '+need+'초');
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
        if(phase==='listen'){left-=dt;if(left<=0){phase='sing';left=need+2;r.quietFor=0;}return paint(null);}
        if(phase==='cheer'){left-=dt;if(left<=0)return next();return paint(0);}
        if(!mic()){left-=dt;if(left<=0){phase='cheer';left=CHEER;r.cue(1);}return paint(null);}
        const heard=r.mic.read(),cents=centsFrom(heard,notes[i]),hint=r.hush(heard,dt);
        D.holdTick(h,cents,dt,{tolerance:tol,need,octave:octaveFrom(heard,notes[i])});tried+=dt;
        if(h.ok){phase='cheer';left=CHEER;r.cue(1);return paint(0);}
        if(tried>=TRY_SECONDS)return next();
        paint(cents,hint);
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
    // 곡에 적용하기 says its 가사·표현 task (app/daily-set-model.js APPLY_TASKS); the song is in the name line above.
    return {wall:true,say:()=>D.applyInfo?.(st)?.name||D.shortTitle(st),
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
  /* 음정 · 음역 · 스케일 따라 부르기: the app plays the scale (the arpeggio from 음정 4단계), counts in two beats, and
   * the person sings it back alone while the screen walks the beat. The key rises a semitone a round; it stops at the
   * first top note not held comfortably above the comfortable range (M.scaleGoOn) or on 여기까지 할게요. */
  scale(r){
    const e=r.e,kind=M?M.scaleKind(areaNow('pitch')?.step||0):'scale5',keys=M?M.scaleKeys(kind,r.comfort):[],out=[],mic=()=>!!M&&(!!r.mic||(r.state==='result'&&!!r.wasMic));
    const pat=M?.SCALE_PATTERNS?.[kind]||{offsets:[0,2,4,5,7,5,4,2,0],top:4,words:'5음 스케일'},beat=M?.SCALE?.beat||.6,COUNT=2,REVIEW=1.5;
    let k=0,phase='listen',left=0,plan=[],samples=[],t0=0,clock=0,stopped=false;
    const total=()=>plan.length?plan.at(-1).at+plan.at(-1).dur:0;
    const now=()=>mic()?r.mic.ctx.currentTime-t0:clock;
    const keyName=()=>D.noteName(keys[k]);
    const strip=at=>'<ol class="dset-scale" data-run-scale aria-hidden="true">'+plan.map((n,i)=>'<li class="'+(n.top?'is-top ':'')+(i===at?'is-now':i<at?'is-done':'')+'">'+esc(D.noteName(n.midi).replace(/\d+$/,''))+'</li>').join('')+'</ol>';
    const needle=cents=>{const n=r.q('[data-run-needle]');if(n){n.style.left=(50+Math.max(-45,Math.min(45,(cents||0)*.9)))+'%';n.dataset.on=cents==null?'':'1';}};
    const setPlan=()=>{plan=M?M.scalePlan(kind,keys[k]):pat.offsets.map((o,i)=>({at:i*beat,dur:beat,midi:keys[k]+o,top:i===pat.top}));const s=r.q('[data-run-scale]');if(s)s.outerHTML=strip(-1);};
    const playPlan=()=>{for(const n of plan)r.tone(n.midi,.05+n.at,n.dur*.92);};
    const at=t=>plan.findIndex(n=>t>=n.at&&t<n.at+n.dur);
    const mark=i=>r.q('[data-run-scale]')?.querySelectorAll('li').forEach((li,j)=>{li.classList.toggle('is-now',j===i);li.classList.toggle('is-done',i>=0&&j<i);});
    const startRound=()=>{setPlan();samples=[];clock=0;phase='listen';left=total()+.4;playPlan();r.say(e.text);paint(null);};
    const paint=cents=>{
      setDots(r,k,out.length);r.host.dataset.phase=phase;
      text(r.q('[data-run-note]'),keyName()+' '+(kind==='arpeggio'?'아르페지오':'스케일'));
      if(phase==='listen'){needle(null);r.word('들어 보세요','wait');r.sub((k+1)+'번째 조 · '+keyName()+'에서 시작해요');return;}
      if(phase==='count'){needle(null);r.word(left>beat?'하나':'둘','wait');r.sub('다음 박부터 “'+e.syllable+'”로 불러요');return;}
      if(phase==='review')return;
      const i=at(now());mark(i);needle(cents);
      const n=plan[i];
      if(!n){r.word('잘했어요','exact');return;}
      r.word(n.top?'맨 위 음, 편하게 이어요':D.noteName(n.midi).replace(/\d+$/,''),n.top?'hold':'go');
      r.sub((k+1)+'번째 조'+(mic()&&cents!=null?' · '+(cents>0?'+':'')+cents+' cent':'')+(mic()?'':' · 마이크 없이 해요'));
    };
    const endRound=()=>{
      const x=mic()?{key:keys[k],...M.scaleRound(samples,plan)}:{key:keys[k],timer:true,sung:false,n:plan.length,right:0};
      out.push(x);phase='review';left=REVIEW;r.host.dataset.phase=phase;r.cue(1);mark(-1);
      if(!mic()){r.word('한 조 했어요','wait');r.sub('');return;}
      r.word(!x.sung?'소리가 들리지 않았어요':x.right===x.n?'모두 맞았어요':x.right+' / '+x.n+'음 맞았어요',x.sung&&x.right/x.n>=.8?'exact':'wait');
      r.sub(x.top?.ok?'맨 위 '+D.noteName(x.top.sung)+'을 편하게 2초 넘게 이었어요':x.sung?'맨 위 음은 편할 만큼만 이어요':'');
    };
    const goOn=()=>k<keys.length-1&&!stopped&&(!mic()||M.scaleGoOn(out,r.comfort));
    const finish=()=>{
      if(!mic())return r.complete(result());
      // The next 음정 step this exercise measures (1·2단계 are the held notes of 음 따라 부르기).
      const ms=M.scaleMeasures(out,kind),p=ms.find(m=>m.area==='pitch'),g=ms.find(m=>m.area==='range'),reached=areaNow('pitch')?.step||0;
      const at=L?.SKILLS?.find(a=>a.id==='pitch')?.steps.findIndex((x,i)=>i>=reached&&x.kind===(kind==='arpeggio'?'arpeggio':'scale5'))??-1;
      const need=at>=0?{step:at+1,say:L.SKILLS.find(a=>a.id==='pitch').steps[at].say}:null;
      r.say((kind==='arpeggio'?'아르페지오':'스케일')+'에서 맞게 부른 음');
      r.word(!p?'소리가 들리지 않았어요':p.value>=90?'아주 정확해요':p.value>=80?'잘 맞췄어요':'조금씩 맞춰 가요',p&&p.value>=80?'exact':'wait');
      r.sub(p?'':'휴대폰을 입에서 한 뼘쯤 두고 다시 해 봐요');
      r.showResult(resultHtml({big:p?String(p.value):'0',unit:'%',lines:[...(p?['맞은 음 '+p.right+' / '+p.of+' · '+p.rounds+'개 조']:[]),
        ...(g?['편하게 2초 넘게 이은 맨 위 음 · '+(g.low===g.high?D.noteName(g.high):D.noteName(g.low)+'–'+D.noteName(g.high))]:[]),
        ...(stopped?['여기까지 하기로 했어요']:out.length&&!out.at(-1).top?.ok?['맨 위 음이 힘들어진 곳에서 멈췄어요']:[]),
        ...(need?['다음 '+need.step+'단계 · '+need.say]:[])],
        note:'음 높이는 박자의 가운데에서 재요. 한 옥타브 위나 아래로 불러도 맞은 것으로 쳐요. 맨 위 음은 2초 넘게 고르게 이었을 때만 음역에 세요. '+stepNote('음정')}));
    };
    const result=()=>{const ms=mic()?M.scaleMeasures(out,kind):[];return {mode:'scale',...(mic()?{}:{timer:true}),parts:out.length,kind,...(ms.length?{measures:ms}:{})};};
    return {fast:true,say:()=>e.text,
      stage:()=>'<div class="dset-tuner"><div class="dset-target"><small>지금 조</small><strong data-run-note>'+esc(keys.length?D.noteName(keys[0]):'')+'</strong><button type="button" class="dset-chip" data-run-enough><i class="ph ph-hand" aria-hidden="true"></i>여기까지 할게요</button></div>'+
        strip(-1)+'<div class="dset-track" aria-hidden="true"><i class="dset-zone"></i><i class="dset-needle" data-run-needle></i></div><div class="dset-track-labels" aria-hidden="true"><span>낮음</span><span>맞음</span><span>높음</span></div>'+
        '<p class="dset-rule">한 조마다 반음씩 올라가요 · 맨 위 음이 힘들면 거기서 멈춰요</p></div>'+dots(keys.length,0,0),
      micWhy:'스케일의 음 높이를 재려고 소리를 들어요. 이 화면에서만 듣고, 녹음하거나 저장하지 않아요.',
      ready(){setPlan();r.word('준비되면 시작해요','wait');r.sub(pat.words+' · 최대 '+keys.length+'개 조 · 한 조에 '+Math.round(total()*2+2)+'초쯤'+(['denied','off'].includes(r.ctx.mic())?' · 마이크 없이 해요':''));},
      bind(){r.q('[data-run-enough]')?.addEventListener('click',()=>{if(r.state!=='doing')return;stopped=true;if(phase==='sing'||phase==='count'){if(phase==='sing')endRound();}finish();});},
      start(){k=0;out.length=0;stopped=false;startRound();},resume(){startRound();},
      tick(dt){
        if(phase==='listen'){left-=dt;if(left<=0){phase='count';left=COUNT*beat;r.cue(0);}return paint(null);}
        if(phase==='count'){const before=left;left-=dt;if(before>beat&&left<=beat)r.cue(0);if(left<=0){phase='sing';clock=0;if(mic()){r.mic.pitch();t0=r.mic.ctx.currentTime;}}return paint(null);}
        if(phase==='review'){left-=dt;if(left<=0){if(goOn()){k++;startRound();}else finish();}return;}
        clock+=dt;let cents=null;
        if(mic()){
          const p=r.mic.pitch(),t=p.t-t0,m=midiOf(p.hz);samples.push({t,midi:m});const i=at(t);
          // The needle forgives a voice a moment late: the nearer of this note and the one before.
          if(i>=0&&m!=null){const off=j=>Math.round(((m-plan[j].midi)*100%1200+1800)%1200-600),a=off(i),b=i>0?off(i-1):a;cents=Math.abs(b)<Math.abs(a)&&t-plan[i].at<.35?b:a;}
        }
        if(now()>=total()+.2)return endRound();
        paint(cents);
      },
      result};
  },
  /* 소리 길 · 사이렌: hear the bottom and the top note, then one glide up and back down on “우~” (up to 10 s from the
   * first sound; over after 0.8 s of silence once it has gone up). Three tries; the best counts (M.sirenMeasure). */
  siren(r){
    const e=r.e,tries=e.tries||M?.SIREN?.tries||3,hold=e.hold||M?.SIREN?.hold||10,c=r.comfort||{low:52,high:64},out=[],mic=()=>!!M&&(!!r.mic||(r.state==='result'&&!!r.wasMic));
    const lowNote=Math.min(c.high-7,c.low+1),highNote=Math.max(lowNote+7,c.high-1),WAIT=6,REVIEW=1.8,END=M?.SIREN?.end||.8;
    let k=0,phase='listen',left=0,samples=[],v0=null,wait=0,clock=0,quiet=0,lo=null,hi=null;
    const dot=m=>{const d=r.q('[data-run-glide]');if(!d)return;if(m==null){d.dataset.on='';return;}const a=lowNote-4,b=highNote+4;d.dataset.on='1';d.style.bottom=Math.round(Math.max(0,Math.min(1,(m-a)/(b-a)))*100)+'%';};
    const tryLine=(x,i)=>(i+1)+'번째 · '+(!x.voiced?'소리가 들리지 않았어요':x.value+'반음'+(x.breaks?' · 끊김 '+x.breaks+'번':' · 끊김 없이')+(x.flips?' · 뒤집힘 '+x.flips+'번':'')+(x.both?' · 올라갔다 내려옴':''));
    const paint=m=>{
      setDots(r,k,out.length);r.host.dataset.phase=phase;dot(m);
      if(phase==='listen'){r.word('들어 보세요','wait');r.sub(D.noteName(lowNote)+'에서 '+D.noteName(highNote)+'까지');return;}
      if(phase==='wait'){r.word('“'+e.syllable+'” 시작해요','go');r.sub('낮은 음에서 천천히 올라가요');return;}
      if(phase==='review')return;
      const t=mic()?(samples.length?samples.at(-1).t:0):clock;
      if(!mic()){r.word(t<hold/2?'천천히 올라가요':'천천히 내려와요','go');r.sub((k+1)+' / '+tries+'번째 · '+Math.max(0,Math.ceil(hold-t))+'초 · 마이크 없이 해요');return;}
      r.word(m==null?(quiet>.15?'이어서 내요':'…'):hi!=null&&m<hi-2?'내려오고 있어요':'올라가요',m==null?'wait':'go');
      r.sub((k+1)+' / '+tries+'번째'+(hi!=null&&lo!=null?' · '+Math.round(hi-lo)+'반음':''));
    };
    const startTry=()=>{phase='listen';left=2.8;samples=[];v0=null;wait=0;clock=0;quiet=0;lo=hi=null;r.tone(lowNote,.05,1.1);r.tone(highNote,1.35,1.1);r.say(e.text);paint(null);};
    const endTry=x=>{
      out.push(x);phase='review';left=REVIEW;r.host.dataset.phase=phase;r.cue(1);dot(null);
      r.word(!mic()?'한 번 했어요':!x.voiced?'소리가 들리지 않았어요':!x.breaks&&!x.flips?'끊김 없이 이었어요':!x.breaks?'끊기지 않았어요':'중간에 끊겼어요',mic()&&x.voiced&&!x.breaks?'exact':'wait');
      r.sub(mic()&&x.voiced?tryLine(x,out.length-1):'');
    };
    const finish=()=>{
      if(!mic())return r.complete(result());
      const m=M.sirenMeasure(out),need=areaNow('path')?.next;
      r.say('사이렌으로 끊김 없이 이은 폭');
      r.word(!m?'소리가 들리지 않았어요':!m.breaks&&!m.flips&&m.both?'끊김 없이 올라갔다 내려왔어요':!m.breaks?'끊기지 않고 이었어요':'조금씩 이어 가요',m&&!m.breaks?'exact':'wait');
      r.sub(m?'':'휴대폰을 입에서 한 뼘쯤 두고 다시 해 봐요');
      r.showResult(resultHtml({big:m?String(m.value):'0',unit:'반음',lines:[...out.map(tryLine),...(need?['다음 '+need.step+'단계 · '+need.say]:[])],
        note:'0.15초 넘게 소리가 끊기면 끊김, 음이 한 번에 크게 튀어 그대로 머물면 뒤집힘으로 세요. 크게 낸 소리나 가장 높은 한 음은 세지 않아요. '+stepNote('소리 길')}));
    };
    const result=()=>{const m=mic()?M.sirenMeasure(out):null;return {mode:'siren',...(mic()?{}:{timer:true}),parts:out.length,...(m?{measures:[m]}:{})};};
    return {fast:true,say:()=>e.text,
      stage:()=>'<div class="dset-siren"><span class="dset-glide-end dset-glide-top">'+esc(D.noteName(highNote))+'</span><div class="dset-glide" aria-hidden="true"><i class="dset-glide-dot" data-run-glide></i></div><span class="dset-glide-end dset-glide-low">'+esc(D.noteName(lowNote))+'</span>'+
        '<p class="dset-rule">끊기지 않게 천천히 · 목이 조이면 거기서 돌아와요</p></div>'+dots(tries,0,0),
      micWhy:'음 높이가 끊김 없이 이어지는지 재려고 소리를 들어요. 이 화면에서만 듣고, 녹음하거나 저장하지 않아요.',
      ready(){r.word('준비되면 시작해요','wait');r.sub(tries+'번 해요 · 한 번에 '+hold+'초까지'+(['denied','off'].includes(r.ctx.mic())?' · 마이크 없이 해요':''));},
      start(){k=0;out.length=0;startTry();},resume(){startTry();},
      tick(dt){
        if(phase==='listen'){left-=dt;if(left<=0){phase=mic()?'wait':'sing';wait=0;clock=0;r.cue(0);}return paint(null);}
        if(phase==='review'){left-=dt;if(left<=0){k++;if(k>=tries)return finish();startTry();}return;}
        if(!mic()){clock+=dt;if(clock>=hold)return endTry({value:0,breaks:0,flips:0,both:0,voiced:0,timer:true});return paint(null);}
        const p=r.mic.pitch(),m=midiOf(p.hz);
        if(phase==='wait'){wait+=dt;if(m!=null){phase='sing';v0=p.t;samples=[{t:0,midi:m}];lo=hi=m;}else if(wait>=WAIT)return endTry({value:0,breaks:0,flips:0,both:0,voiced:0});return paint(m);}
        const t=p.t-v0;if(!samples.length||t>samples.at(-1).t)samples.push({t,midi:m});
        if(m!=null){quiet=0;lo=Math.min(lo,m);hi=Math.max(hi,m);}else quiet+=dt;
        if(t>=hold||(quiet>=END&&hi-lo>=3&&t>=2))return endTry(M.sirenTry(samples));
        paint(m);
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
      if(phase==='wait'){needle(null);meter(0);r.word('“'+(D.syllableOf?.(e,i)||e.syllable)+'” 시작해요','go');r.sub('소리가 나면 8초를 세요');return;}
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
      out.push({midi:notes[i],...(e.vowels?{vowel:String(D.syllableOf(e,i)).replace(/~$/,'')}:{}),...x});phase='review';left=REVIEW;r.cue(1);
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

/* ---------- 따라 하기: a set of ONE step (app/guided-practice.js VZ.guidedStepFor, step.guide) ---------- */
const YT_STATE={ENDED:0,PLAYING:1,PAUSED:2,BUFFERING:3},WATCH=.8;
/** The YouTube IFrame API, loaded once. */
function youtube(ready){
  if(window.YT?.Player)return ready();
  const before=window.onYouTubeIframeAPIReady;
  window.onYouTubeIframeAPIReady=()=>{try{before?.();}catch{}ready();};
  if(!document.querySelector('script[data-yt-api]')){const s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.async=true;s.dataset.ytApi='';document.head.append(s);}
}
Object.assign(ENGINES,{
  /* With a hand-reviewed video the step is done one of two ways:
   *   영상 보며 하기 — the MIC IS OFF (no tuner, no recording, nothing measured). The step's clock runs only while the
   *     video really plays: pausing, buffering, a hidden page or leaving the screen stop it. Only seconds played in
   *     order are "watched" (a jump forward is not), and 80 % watched lets the step be finished. After the video the
   *     same step goes on as 혼자 해 보기: the timer, with the tuner where the exercise has one.
   *   타이머로 하기 (also 영상이 재생되지 않나요? and 맞지 않아요) — the timer; the step can be finished.
   * Without a video it is the timer. Reference notes, 음계 듣기 and the metronome never count time. What changed on the
   * step (seconds watched, 타이머로 하기) is kept in the running session (ctx.save) so leaving and coming back goes on. */
  guide(r){
    const st=r.st,g=st.guide||(st.guide={}),ctx=r.ctx;
    const seen=new Set((Array.isArray(g.seen)?g.seen:[]).filter(Number.isInteger));
    let part=g.video&&!g.timer&&!g.after?'video':'solo',player=null,loaded=false,last=null,clockOn=false,opening=false,h=D.holdStart();
    let note=g.reference?(g.reference.notes.includes(g.note)?g.note:g.reference.initial):null;
    let metro=null,metroPending=false,bpm=g.metronome?.bpm||75,beats=g.metronome?.beats||4;
    const S=()=>window.YT?.PlayerState||YT_STATE;
    const duration=()=>Number(g.duration)||0;
    const watched=()=>{const d=Math.floor(duration());return d>0?Math.min(1,seen.size/d):0;};
    const canFinish=()=>!g.video||!!g.timer||!!g.after||watched()>=WATCH;
    const keep=()=>{g.seen=[...seen].sort((a,b)=>a-b);if(note!=null)g.note=note;ctx.save?.();};
    /** The set's clock for this step: on only while the video plays (or the timer runs). */
    const clock=on=>{if(on===clockOn)return;clockOn=on;if(on)ctx.start();else ctx.pause();};
    const poll=()=>{
      if(!player||!loaded)return;
      let t;try{t=Number(player.getCurrentTime?.())||0;}catch{return;}
      if(clockOn&&last!=null&&t>=last&&t-last<2.5)for(let k=Math.floor(last);k<Math.floor(t);k++)seen.add(k);
      last=clockOn?t:null;
    };
    const dropPlayer=()=>{const p=player;player=null;loaded=false;last=null;if(p)setTimeout(()=>{try{p.destroy?.();}catch{}},0);};
    const show=()=>{
      text(r.q('[data-guide-time]'),'연습 시간 '+mmss(ctx.elapsed()));
      if(part!=='video')return;
      const d=duration();text(r.q('[data-guide-watch]'),'영상 '+mmss(seen.size)+' / '+(d?mmss(d):'—'));
      const bar=r.q('[data-guide-watchbar]');if(bar)bar.style.width=Math.round(watched()*100)+'%';
    };
    const words=()=>{
      if(part==='video'){
        const left=canFinish()?'다 봤으면 끝내도 돼요':'영상을 80% 넘게 보면 끝낼 수 있어요 · 지금 '+Math.round(watched()*100)+'%';
        if(!loaded){r.word('영상을 불러오고 있어요','wait');r.sub('영상이 재생되는 동안만 연습 시간을 세요');return;}
        if(r.state==='doing'){r.word(clockOn?'영상을 보며 따라 해요':'영상을 기다리고 있어요',clockOn?'go':'wait');r.sub(left);return;}
        r.word(seen.size?'이어서 볼 수 있어요':'준비되면 영상을 틀어요','wait');r.sub(seen.size?left:'영상이 재생되는 동안만 연습 시간을 세요');return;
      }
      if(r.state==='doing'){if(!r.mic){r.word('하고 있어요','go');r.sub(g.tuner&&!opening?'음정 바늘 없이 타이머로 해요':'');}return;}
      r.word(g.after&&!g.solo?'이제 혼자 해 봐요':ctx.elapsed()>0?'이어서 해요':'준비되면 시작해요','wait');
      r.sub(g.tuner?'시작하면 음정 바늘이 켜져요 · 이 화면에서만 듣고 녹음하지 않아요':'시작한 동안만 연습 시간을 세요');
    };
    const timeRow=line=>'<p class="dset-guide-time"><b data-guide-time>연습 시간 '+mmss(ctx.elapsed())+'</b><span>'+esc(line)+'</span></p>';
    const seg=()=>g.video?'<div class="dset-seg" role="group" aria-label="연습 방법"><button type="button" data-guide-part="video" aria-pressed="'+(part==='video')+'">영상 보며 하기</button>'+
      '<button type="button" data-guide-part="solo" aria-pressed="'+(part==='solo')+'">'+(g.after||watched()>=WATCH?'혼자 해 보기':'타이머로 하기')+'</button></div>':'';
    const feedback=()=>{
      const good=(V.db.videoFeedback||[]).some(f=>f.exerciseKey===g.key&&f.videoId===g.video.id&&f.verdict==='good');
      return '<div class="dset-guide-feedback" data-guide-feedbacks><span>이 영상이 이 연습에 맞았나요?</span><span class="dset-guide-pair"><button type="button" class="dset-chip" data-guide-feedback="good" aria-pressed="'+good+'">맞아요</button>'+
        '<button type="button" class="dset-chip" data-guide-feedback="bad" aria-pressed="false">맞지 않아요</button></span></div>';
    };
    const videoHtml=()=>'<div class="dset-video"><div id="dset-youtube"></div></div>'+
      '<p class="dset-video-meta"><span>연습 영상 · '+esc(g.video.title)+'</span><small data-guide-watch></small></p><div class="dset-holdbar dset-watchbar" aria-hidden="true"><i data-guide-watchbar></i></div>'+
      timeRow('영상이 재생되는 동안만 세요')+
      '<div class="dset-guide-note" data-guide-mic-off><p><strong>마이크 꺼짐</strong><span>영상 소리가 섞이지 않게</span></p><small>영상이 나오는 동안은 재지도, 녹음하지도 않아요.'+(g.tuner?' 영상이 끝나면 ‘혼자 해 보기’에서 음정 바늘을 켜요.':'')+'</small></div>'+
      '<p class="dset-guide-next">다음: 혼자 해 보기'+(g.tuner?' · 음정 바늘 켜짐':'')+'</p>'+feedback()+
      '<button type="button" class="dset-quiet dset-guide-fallback" data-guide-fallback>영상이 재생되지 않나요? 타이머로 연습하기</button>';
    const refHtml=()=>{
      const ref=g.reference;if(!ref)return '';
      return '<div class="dset-guide-ref"><label><span>기준음 높이</span><select data-guide-note aria-label="기준음 높이">'+ref.notes.map((n,i)=>'<option value="'+n+'"'+(n===note?' selected':'')+'>'+['낮게','보통','높게'][i]+' · '+D.noteName(n)+'</option>').join('')+'</select></label>'+
        '<span class="dset-guide-pair"><button type="button" class="dset-chip" data-guide-ref><i class="ph ph-speaker-high" aria-hidden="true"></i>기준음 듣기</button>'+
        (g.scale?'<button type="button" class="dset-chip" data-guide-scale><i class="ph ph-music-notes" aria-hidden="true"></i>음계 듣기</button>':'')+'</span>'+
        '<small>'+(g.scale?'음계는 고른 높이에서 '+esc(g.scale.names.join(' '))+' 순서로 들려줘요. ':'')+'먼저 듣고 편한 높이에서 따라 불러요. 소리를 들어도 연습 시간은 세지 않아요.</small></div>';
    };
    const tunerHtml=()=>g.tuner?'<div class="dset-tuner" data-guide-tuner><div class="dset-track" aria-hidden="true"><i class="dset-zone"></i><i class="dset-needle" data-run-needle></i></div>'+
      '<div class="dset-track-labels" aria-hidden="true"><span>낮음</span><span>맞음</span><span>높음</span></div><div class="dset-holdbar" aria-hidden="true"><i data-run-hold></i></div>'+
      '<p class="dset-rule" data-guide-hold>목표음 4초 유지 · 0.0초</p></div>':'';
    const soloHtml=()=>timeRow('시작한 동안만 세요')+(g.lines?.length?'<ol class="dset-guide-lines">'+g.lines.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ol>':'')+refHtml()+tunerHtml();
    const beatsHtml=()=>Array.from({length:beats},(_,i)=>'<i data-beat="'+i+'"></i>').join('');
    const metroHtml=()=>!metro?'':'<section class="dset-metro" aria-label="메트로놈"><div class="dset-metro-row">'+
      '<button type="button" class="dset-chip" data-bpm-step="-5" aria-label="BPM 5 낮추기">−</button><label class="dset-metro-bpm"><input type="number" data-bpm min="40" max="240" step="1" value="'+bpm+'" aria-label="메트로놈 BPM"><span>BPM</span></label>'+
      '<button type="button" class="dset-chip" data-bpm-step="5" aria-label="BPM 5 높이기">+</button><label class="dset-metro-meter">박자<select data-meter aria-label="메트로놈 박자">'+[2,3,4,6].map(n=>'<option value="'+n+'"'+(n===beats?' selected':'')+'>'+n+'박</option>').join('')+'</select></label></div>'+
      '<div class="dset-beats" aria-hidden="true">'+beatsHtml()+'</div><button type="button" class="dset-chip" data-metronome aria-pressed="'+!!metro.running+'">'+(metro.running?'메트로놈 끄기':'메트로놈 켜기')+'</button>'+
      '<p class="dset-rule">첫 박은 높은 소리로 알려줘요. 메트로놈만 켜면 연습 시간은 세지 않아요.</p><p class="dset-rule" role="status" data-metro-status></p></section>';
    if(g.metronome&&!g.nonVocal&&window.VzipMetronome)metro=window.VzipMetronome.create({Audio:window.AudioContext||window.webkitAudioContext,
      onBeat:i=>{if(!r.dead)r.host.querySelectorAll('[data-beat]').forEach(d=>d.classList.toggle('active',Number(d.dataset.beat)===i));},
      onState:on=>{if(r.dead)return;const b=r.q('[data-metronome]');if(b){b.textContent=on?'메트로놈 끄기':'메트로놈 켜기';b.setAttribute('aria-pressed',String(on));}if(!on)r.host.querySelectorAll('[data-beat]').forEach(d=>d.classList.remove('active'));}});
    const bindMetro=()=>{
      if(!metro)return;const input=r.q('[data-bpm]'),meter=r.q('[data-meter]'),status=()=>r.q('[data-metro-status]');
      const configure=()=>{const n=Number(input.value);if(!Number.isInteger(n)||n<40||n>240){text(status(),'BPM을 40~240 사이로 입력해 주세요.');input.value=bpm;return;}
        bpm=n;beats=Number(meter.value);metro.configure(bpm,beats);const box=r.q('.dset-beats');if(box)box.innerHTML=beatsHtml();text(status(),'');};
      input.onchange=configure;meter.onchange=configure;
      r.host.querySelectorAll('[data-bpm-step]').forEach(b=>b.onclick=()=>{input.value=Math.min(240,Math.max(40,bpm+Number(b.dataset.bpmStep)));configure();});
      r.q('[data-metronome]').onclick=async()=>{
        if(metro.running){metro.stop();return;}if(metroPending)return;metroPending=true;
        try{configure();r.tones?.stop();audioSession('playback');await metro.start(bpm,beats);}catch(e){if(!r.dead)text(status(),e.message);}finally{metroPending=false;}
      };
    };
    const draw=()=>{const box=r.q('[data-run-stage]');if(!box||r.dead)return;box.innerHTML=api.stage();api.bind();r.say(api.say());words();show();r.paintState();};
    const afterVideo=()=>{
      r.stopLoop();r.state=ctx.elapsed()>0?'paused':'ready';
      if(watched()>=WATCH){g.after=true;keep();dropPlayer();part='solo';draw();r.word('영상을 다 봤어요','exact');return;}
      keep();words();show();r.paintState();V.toast('영상을 80% 넘게 봐야 끝낼 수 있어요. 다시 보거나 타이머로 해요.');
    };
    const videoState=data=>{
      const s=S();poll();
      if(data===s.PLAYING){
        // Playing without being asked (the page came back, the system resumed it): it waits for the button.
        if(r.state!=='doing'){try{player.pauseVideo();}catch{}return;}
        clock(true);try{last=Number(player.getCurrentTime())||0;}catch{last=0;}
      }else{
        clock(false);last=null;
        if(data===s.ENDED)return afterVideo();
        if(data===s.PAUSED&&r.state==='doing')return r.pauseRun();
      }
      words();show();r.paintState();
    };
    const attach=()=>{
      if(part!=='video'||!g.video)return;
      youtube(()=>{
        if(r.dead||part!=='video'||player||!document.getElementById('dset-youtube')||!window.YT?.Player)return;
        let mine=null;
        mine=player=new window.YT.Player('dset-youtube',{videoId:g.video.id,playerVars:{playsinline:1,controls:0,disablekb:1,fs:0,rel:0,origin:location.origin},events:{
          onReady:e=>{if(r.dead||player!==mine)return;loaded=true;try{e.target.getIframe?.()?.setAttribute('tabindex','-1');}catch{}
            const d=Number(e.target.getDuration?.())||0;if(d>0)g.duration=d;words();show();r.paintState();},
          onStateChange:e=>{if(!r.dead&&player===mine)videoState(e.data);}}});
      });
    };
    const switchTo=next=>{
      if(next===part||r.dead)return;
      if(r.state==='doing')r.pauseRun();
      poll();clock(false);dropPlayer();
      // 타이머로 하기 lets the step be finished without the video (as its own screen did).
      if(next==='solo'&&!g.after)g.timer=true;
      part=next;keep();r.stopLoop();r.state=ctx.elapsed()>0?'paused':'ready';draw();
    };
    const openTuner=async()=>{
      if(opening||r.mic)return;opening=true;r.primary.disabled=true;audioSession('play-and-record');
      try{
        const mic=await openMic();
        if(r.dead||r.state!=='doing'||part!=='solo'){mic.close();return;}
        r.mic=mic;ctx.setMic('granted');h=D.holdStart();r.quietFor=0;
      }catch{ctx.setMic('denied');audioSession('playback');if(!r.dead)r.notice?.('마이크를 쓸 수 없어서 음정 바늘 없이 타이머로 해요.');}
      finally{opening=false;if(!r.dead){r.primary.disabled=false;words();}}
    };
    const result=()=>({mode:'guide',...(g.video&&!g.timer?{}:{timer:true})});
    const api={custom:true,say:()=>D.shortTitle(st),
      stage:()=>'<div class="dset-guide" data-guide data-part="'+part+'">'+seg()+(part==='video'?videoHtml():soloHtml())+
        '<button type="button" class="dset-chip dset-guide-finish" data-guide-finish'+(canFinish()&&r.state!=='doing'&&ctx.elapsed()>0?'':' hidden')+'><i class="ph ph-check" aria-hidden="true"></i>다 했어요</button>'+metroHtml()+'</div>',
      bind(){
        r.host.querySelectorAll('[data-guide-part]').forEach(b=>b.onclick=()=>switchTo(b.dataset.guidePart));
        r.q('[data-guide-fallback]')?.addEventListener('click',()=>switchTo('solo'));
        r.host.querySelectorAll('[data-guide-feedback]').forEach(b=>b.onclick=()=>{
          if(!g.video||r.dead)return;const verdict=b.dataset.guideFeedback;
          if(!V.guidedVideoFeedback?.(g.key,g.video.id,verdict))return V.toast('저장하지 못했어요. 다시 시도해 주세요.','error');
          if(verdict!=='bad'){b.setAttribute('aria-pressed','true');V.toast('영상 평가를 저장했어요.');return;}
          // 맞지 않아요: this video is not offered for this exercise again, and the step goes on with the timer.
          if(r.state==='doing')r.pauseRun();
          poll();clock(false);dropPlayer();g.video=null;part='solo';keep();r.stopLoop();r.state=ctx.elapsed()>0?'paused':'ready';draw();
          V.toast('이 연습에서는 해당 영상을 다시 추천하지 않을게요.');
        });
        r.q('[data-guide-finish]')?.addEventListener('click',()=>{if(!r.dead&&canFinish())r.complete(result());});
        const select=r.q('[data-guide-note]');
        if(select)select.onchange=()=>{r.tones?.stop();note=Number(select.value);h=D.holdStart();keep();};
        const listen=play=>()=>{if(r.dead||r.state==='doing'||note==null)return;metro?.stop();audioSession('playback');r.tones?.stop();play();};
        r.q('[data-guide-ref]')?.addEventListener('click',listen(()=>r.tone(note,.05,1.05)));
        r.q('[data-guide-scale]')?.addEventListener('click',listen(()=>{
          const start=g.scale.notes.reduce((a,b)=>Math.abs(b-note)<Math.abs(a-note)?b:a);
          g.scale.offsets.forEach((o,i)=>r.tone(start+o,.05+i*.42,.37));
        }));
        bindMetro();attach();
      },
      ready:words,
      primaryText(state){
        r.primary.disabled=part==='video'&&!loaded&&state!=='doing';
        // The big button is 다 했어요 while doing once the step can be finished (bright), else 잠깐 멈춤 (quiet).
        r.host.dataset.finish=state==='doing'&&canFinish()?'1':'';
        if(state==='doing')return canFinish()?'다 했어요':'잠깐 멈춤';
        if(part==='video')return !loaded?'영상 불러오는 중…':seen.size?'영상 이어 보기':'영상 재생';
        return g.after&&!g.solo?'혼자 해 보기':ctx.elapsed()>0?'계속하기':'시작하기';
      },
      pausable:()=>canFinish(),
      begin(){
        if(r.dead||r.state==='doing')return;
        if(part==='video'){
          if(!loaded||!player)return;
          audioSession('playback');
          try{if(player.getPlayerState?.()===S().ENDED)player.seekTo?.(0,true);}catch{}
          r.state='doing';r.paintState();r.startLoop();words();
          try{player.playVideo();}catch{}
          return;
        }
        r.tones?.stop();g.solo=true;
        r.state='doing';clock(true);h=D.holdStart();keep();
        const finish=r.q('[data-guide-finish]');if(finish)finish.hidden=true;
        r.paintState();r.startLoop();words();show();
        if(g.tuner&&ctx.mic()!=='off')openTuner();
      },
      press(){if(canFinish())return r.complete(result());r.pauseRun();},
      /* The runner's 잠깐 멈춤 (and a hidden page): the video pauses, the clock stops; the mic is closed by the runner. */
      pause(){
        if(part==='video'){poll();try{const s=player?.getPlayerState?.();if(s===S().PLAYING||s===S().BUFFERING)player.pauseVideo();}catch{}}
        clock(false);last=null;keep();
        const finish=r.q('[data-guide-finish]');if(finish)finish.hidden=!(canFinish()&&ctx.elapsed()>0);
      },
      hide(){metro?.stop();},
      paint:()=>{show();r.q('[data-guide-part="solo"]')&&text(r.q('[data-guide-part="solo"]'),g.after||watched()>=WATCH?'혼자 해 보기':'타이머로 하기');},
      tick(dt){
        if(part==='video'){
          poll();
          // The clock follows the player itself: buffering or a stall is not playing.
          try{if(clockOn&&player?.getPlayerState?.()!==S().PLAYING){clock(false);last=null;}}catch{}
          words();show();r.paintState();return;
        }
        show();
        if(!r.mic||note==null)return;
        const heard=r.mic.read(),cents=centsFrom(heard,note),hint=r.hush(heard,dt);
        D.holdTick(h,cents,dt,{tolerance:25,need:4});
        const w=D.word(cents,25);r.word(w.text,w.key);
        const needle=r.q('[data-run-needle]');if(needle){needle.style.left=(50+Math.max(-45,Math.min(45,(cents||0)*.9)))+'%';needle.dataset.on=cents==null?'':'1';}
        const bar=r.q('[data-run-hold]');if(bar)bar.style.width=Math.round(Math.min(1,h.held/4)*100)+'%';
        text(r.q('[data-guide-hold]'),'목표음 '+D.noteName(note)+' 4초 유지 · '+Math.min(4,h.best).toFixed(1)+'초');
        r.q('[data-guide-tuner]')?.classList.toggle('is-on',h.ok);
        r.sub(hint||(cents==null?'':(cents>0?'+':'')+cents+' cent'));
      },
      cancel(){poll();clock(false);last=null;keep();const p=player;player=null;loaded=false;try{p?.destroy?.();}catch{}try{metro?.destroy();}catch{}metro=null;},
      result};
    return api;
  }
});

/* ---------- the screen ---------- */
function mount(host,ctx){
  const s=ctx.session,st=s.steps[s.index],mode=D.modeOf(st),e=st.exercise?D.exercise(st.exercise):null;
  delete host.dataset.phase;delete host.dataset.bar;
  const r={host,ctx,st,mode,e,state:'ready',dead:false,timer:0,last:0,mic:null,tones:null,comfort:null,gate:'',
    reduced:!!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,q:sel=>host.querySelector(sel)};
  const needsRange=['hold','follow','vibrato','scale','siren'].includes(mode);
  // The exercise as it is done at the step reached (“멈” 롱톤 8초 · 높은 음, 비브라토 “오~”).
  if(r.e&&D.adapt)r.e=D.adapt(r.e,area=>areaNow(area)?.step||0);
  r.comfort=needsRange?ctx.comfort():null;
  r.say=value=>text(r.q('[data-run-say]'),value);
  r.word=(value,key)=>{const el=r.q('[data-run-word]');if(el){text(el,value);el.dataset.tone=key||'';}};
  r.sub=value=>text(r.q('[data-run-sub]'),value);
  /** 소리 안내 (2026-11-25: a measure that heard nothing just ran out): after 2 s of the singer's turn with no note
   * heard, say why — nothing reaches the mic, the voice is too quiet, or it is there but not one clear note. '' while
   * a note is heard. Call with the reading (null = none) every tick of the singing part; r.quietFor=0 when it starts. */
  r.quietFor=0;
  r.hush=(heard,dt)=>{
    if(heard){r.quietFor=0;return '';}
    r.quietFor+=dt;if(r.quietFor<2||!r.mic)return '';
    const level=r.mic.level?.()||0;
    return level<.0015?'소리가 안 들려요 · 폰 아래쪽 마이크를 막지 않았는지 봐 주세요':level<.004?'소리가 작게 들려요 · 조금 더 크게 불러 보세요':'음이 또렷하게 안 잡혀요 · “음~”처럼 한 음으로 길게 내 보세요';
  };
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

  const tl=D.timeline(s.steps,s),label=D.labelOf(st),last=ctx.lastLine?.()||'',lastSkipped=!!s.steps[s.index-1]?.skipped,task=D.applyInfo?.(st)||null;
  // Before the comfortable range is known a note exercise only says what it is; the range is asked at 시작하기.
  const waiting=()=>({say:()=>e.text,stage:()=>'',ready(){r.word('준비되면 시작해요','wait');r.sub('처음 한 번만, 편한 음 높이를 물어봐요');},result:()=>({})});
  const build=()=>{r.engine=needsRange&&!r.comfort?waiting():ENGINES[mode](r);};
  const html=()=>'<header class="dset-top"><button type="button" class="dset-x" data-run-exit aria-label="나가기 · 오늘 안에 이어서 할 수 있어요"><i class="ph ph-x" aria-hidden="true"></i></button>'+
    '<ol class="dset-bar" aria-hidden="true">'+tl.map(x=>'<li class="is-'+x.state+'"></li>').join('')+'</ol><span class="dset-count"><span data-run-count-all>'+(s.index+1)+' / '+s.steps.length+'</span></span></header>'+
    (last?'<p class="dset-last" data-run-last'+(lastSkipped?' data-skipped':'')+'><i class="ph ph-'+(lastSkipped?'skip-forward':'check')+'" aria-hidden="true"></i>'+esc(last)+'</p>':'')+
    '<p class="dset-name" data-run-name><b>'+esc(label)+'</b>'+((mode==='free'&&!task)||mode==='guide'?'':'<span>'+esc(D.shortTitle(st))+'</span>')+(st.optional?'<span>선택</span>':'')+
      (st.mic?'<span class="dset-badge"><i class="ph ph-microphone" aria-hidden="true"></i>마이크</span>':'')+'<span class="dset-badge">약 '+st.minutes+'분</span></p>'+
    '<h2 class="dset-say" id="pset-step-title" data-run-say></h2>'+
    '<p class="dset-why" data-run-why>'+esc(ctx.why?.(st)||st.why||'')+'</p>'+
    (task?'<p class="dset-task-why" data-run-task="'+esc(task.key)+'">'+esc(task.why)+'</p>':'')+
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
    redo.hidden=r.state==='ready'||mode==='take'||mode==='guide'||r.engine.wall;
    pauseB.hidden=!((r.engine.wall||r.engine.pausable?.())&&r.state==='doing');pauseB.setAttribute('aria-label','일시정지');
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
  const notice=r.notice=message=>{const el=r.q('[data-run-notice]')||Object.assign(document.createElement('p'),{className:'dset-notice'});el.dataset.runNotice='';el.setAttribute('role','status');el.textContent=message;r.q('[data-run-stage]').after(el);};
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
    r.state='paused';r.engine.pause?.();ctx.pause();r.stopLoop();r.tones?.stop();r.mic?.close();r.mic=null;
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
    if(r.engine.hide){r.engine.hide();pauseRun();return;}
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
  r.begin=begin;r.pauseRun=pauseRun;
  return r;
}
V.dailySetRunner={mount};
})();
