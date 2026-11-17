// Deterministic clock drift and a short room response. No user audio or identifiers.
const Y=require('./mr-synth.cjs');
function driftRecording(voice,mr,{offset=5,drift=50,period=17,db=-6,gap=null}={}){
 const heard=new Float32Array(voice.length),room=new Float32Array(voice.length);
 for(let n=0;n<heard.length;n++){
  const t=n/Y.SR,p=offset*Y.SR+n+drift*Math.sin(2*Math.PI*t/period),i=Math.floor(p),f=p-i;
  if(i>=0&&i+1<mr.length&&(!gap||t<gap[0]||t>=gap[1]))heard[n]=mr[i]*(1-f)+mr[i+1]*f;
 }
 for(let n=0;n<room.length;n++)for(const[d,g]of[[0,1],[40,.35],[100,.15],[230,.08]])if(n>=d)room[n]+=heard[n-d]*g;
 const gain=Y.rms(voice)/Y.rms(room)*10**(db/20),mrPart=Float32Array.from(room,x=>x*gain);
 return {x:Float32Array.from(voice,(x,i)=>x+mrPart[i]),mrPart};
}
module.exports={driftRecording};
