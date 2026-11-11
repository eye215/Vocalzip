/* Small Web Audio clock. Playback is opt-in and all scheduled sounds are cancellable. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipMetronome=api;})(globalThis,()=>{
'use strict';
const valid=n=>Number.isInteger(n)&&n>=40&&n<=240;
function settings(text){
 const range=String(text).match(/(\d{2,3})\s*[~〜–-]\s*(\d{2,3})\s*BPM/i),single=String(text).match(/(\d{2,3})\s*BPM|BPM\s*(\d{2,3})/i);
 const bpm=range?Math.round((Number(range[1])+Number(range[2]))/2):single?Number(single[1]||single[2]):75;
 return {bpm:valid(bpm)?bpm:75,beats:4};
}
function create({Audio,onBeat=()=>{},onState=()=>{}}){
 let ctx=null,clock=null,enabled=false,epoch=0,tempo=75,meter=4,next=0,beat=0;
 const sources=new Set(),timers=new Set();
 function discard(){clearInterval(clock);clock=null;for(const t of timers)clearTimeout(t);timers.clear();for(const source of sources){try{source.stop()}catch{}try{source.disconnect()}catch{}}sources.clear();}
 function stop(){epoch++;enabled=false;discard();onState(false);}
 function schedule(){
  if(!enabled||ctx.state!=='running'){if(enabled)stop();return;}
  if(next<ctx.currentTime-.1)next=ctx.currentTime+.03;
  while(next<ctx.currentTime+.12){
   const source=ctx.createOscillator(),gain=ctx.createGain(),time=next,index=beat;
   source.frequency.value=index===0?1200:800;source.type='sine';gain.gain.setValueAtTime(.16,time);gain.gain.exponentialRampToValueAtTime(.001,time+.04);source.connect(gain).connect(ctx.destination);sources.add(source);
   source.onended=()=>{sources.delete(source);source.disconnect();gain.disconnect();};source.start(time);source.stop(time+.045);
   const version=epoch;const t=setTimeout(()=>{timers.delete(t);if(enabled&&version===epoch)onBeat(index,meter);},Math.max(0,(time-ctx.currentTime)*1000));timers.add(t);
   beat=(beat+1)%meter;next+=60/tempo;
  }
 }
 function configure(bpm,beats){
  if(!valid(bpm)||![2,3,4,6].includes(beats))throw Error('BPM은 40~240, 박자는 2·3·4·6박 중에서 선택해 주세요.');
  tempo=bpm;meter=beats;if(enabled){discard();epoch++;beat=0;next=ctx.currentTime+.03;schedule();clock=setInterval(schedule,25);}
 }
 async function start(bpm,beats){
  stop();configure(bpm,beats);const version=epoch;
  try{if(!Audio)throw Error('이 기기에서는 메트로놈 소리를 재생할 수 없어요.');ctx||=new Audio();await ctx.resume();if(version!==epoch)return false;if(ctx.state!=='running')throw Error('소리 재생을 시작하지 못했어요.');enabled=true;beat=0;next=ctx.currentTime+.03;schedule();clock=setInterval(schedule,25);onState(true);return true;}catch(e){if(version===epoch)stop();throw e;}
 }
 function destroy(){stop();try{ctx?.close()?.catch?.(()=>{});}catch{}ctx=null;}
 return {start,stop,configure,destroy,get running(){return enabled;}};
}
return {settings,create};
});
