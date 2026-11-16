/* Vowel-conditioned LPC envelope peaks. Never a larynx position, forward resonance score or contact estimate. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipPrecisionResonance=api;})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
const VERSION='pr-1.0.0',RULES=Object.freeze({minRate:16000,maxF0:300,minDuration:.06,preemphasis:.97,order:18,orderCheck:20,maxFormant:5000,minPeakDistance:180,maxBandwidth:300,minBandwidth:25,orderToleranceHz:160,minPeriodicity:.8});
const finite=x=>typeof x==='number'&&Number.isFinite(x),mean=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const median=a=>{if(!a.length)return null;const s=a.slice().sort((a,b)=>a-b),i=s.length>>1;return s.length%2?s[i]:(s[i-1]+s[i])/2;};
function lpc(x,order){
 const corr=new Float64Array(order+1);for(let k=0;k<=order;k++)for(let i=k;i<x.length;i++)corr[k]+=x[i]*x[i-k];
 if(corr[0]<1e-12)return null;let a=new Float64Array(order+1);a[0]=1;let error=corr[0];
 for(let i=1;i<=order;i++){
  let s=corr[i];for(let j=1;j<i;j++)s+=a[j]*corr[i-j];const reflection=-s/error;
  if(!finite(reflection)||Math.abs(reflection)>=.9999)return null;
  const next=a.slice();next[i]=reflection;for(let j=1;j<i;j++)next[j]=a[j]+reflection*a[i-j];a=next;error*=1-reflection**2;
  if(!(error>corr[0]*1e-10))return null;
 }
 return a;
}
function peaks(a,sampleRate,p){
 const hzStep=10,levels=[];for(let hz=100;hz<=Math.min(p.maxFormant,sampleRate/2-100);hz+=hzStep){let re=0,im=0;for(let k=0;k<a.length;k++){const w=2*Math.PI*hz*k/sampleRate;re+=a[k]*Math.cos(w);im-=a[k]*Math.sin(w);}levels.push({hz,db:-10*Math.log10(Math.max(1e-20,re*re+im*im))});}
 const out=[];
 for(let i=1;i<levels.length-1;i++)if(levels[i].db>levels[i-1].db&&levels[i].db>=levels[i+1].db){
  let lo=i,hi=i;while(lo>0&&levels[lo].db>levels[i].db-3)lo--;while(hi<levels.length-1&&levels[hi].db>levels[i].db-3)hi++;
  const bandwidth=levels[hi].hz-levels[lo].hz;
  if(bandwidth<p.minBandwidth||bandwidth>p.maxBandwidth)continue;
  if(out.length&&levels[i].hz-out.at(-1).hz<p.minPeakDistance){if(levels[i].db>out.at(-1).db)out.pop();else continue;}
  out.push({...levels[i],bandwidth});
 }
 return out.filter(x=>x.hz>=180).slice(0,3);
}
function estimate(samples,sampleRate,f0,{context={},rules={}}={}){
 const p={...RULES,...rules},reasons=[];
 if(context.source!=='clean')reasons.push('source-not-clean');if(!['a','e','i','o','u'].includes(context.vowel))reasons.push('known-vowel-required');
 if(sampleRate<p.minRate)reasons.push('insufficient-bandwidth');if(!(f0>0)||f0>p.maxF0)reasons.push('high-or-missing-f0');
 if(samples.length/sampleRate<p.minDuration)reasons.push('window-too-short');if(Array.from(samples).some(x=>!finite(x)||Math.abs(x)>=.999))reasons.push('invalid-or-clipped-signal');
 const held=()=>({values:null,bandwidths:null,confidence:'withheld',reasons:[...new Set(reasons)],algorithm:'preemphasis-autocorrelation-LPC-envelope-v1'});
 if(reasons.length)return held();
 const lag=Math.round(sampleRate/f0);let ac=0,aa=0,bb=0;for(let i=0;i+lag<samples.length;i++){ac+=samples[i]*samples[i+lag];aa+=samples[i]**2;bb+=samples[i+lag]**2;}
 if(!(aa*bb>0)||ac/Math.sqrt(aa*bb)<p.minPeriodicity){reasons.push('weak-periodicity');return held();}
 const center=mean(Array.from(samples)),x=Float64Array.from(samples,(v,i)=>((v-center)-p.preemphasis*((i?samples[i-1]:v)-center))*(.5-.5*Math.cos(2*Math.PI*i/(samples.length-1))));
 if(x.reduce((s,v)=>s+v*v,0)<1e-10){reasons.push('silence');return held();}
 const a=lpc(x,p.order),b=lpc(x,p.orderCheck);if(!a||!b){reasons.push('unstable-lpc');return held();}
 const one=peaks(a,sampleRate,p),two=peaks(b,sampleRate,p);
 if(one.length!==3||two.length!==3){reasons.push('insufficient-resolved-peaks');return held();}
 if(one.some((v,i)=>Math.abs(v.hz-two[i].hz)>p.orderToleranceHz)){reasons.push('order-sensitive-peaks');return held();}
 if(one[0].hz<2*f0){reasons.push('sparse-harmonic-sampling');return held();}
 return {values:one.map((v,i)=>(v.hz+two[i].hz)/2),bandwidths:one.map(v=>v.bandwidth),confidence:'medium',reasons:['uncalibrated-lpc','formants-not-anatomical-measurements'],algorithm:'preemphasis-autocorrelation-LPC-envelope-v1'};
}
function analyze(samples,sampleRate,frames,{context={},rules={}}={}){
 const rows=frames.filter(f=>finite(f.t)).map(f=>{
  const start=Math.max(0,Math.round((f.t-.04)*sampleRate)),end=Math.min(samples.length,start+Math.round(.08*sampleRate));
  const formants=f.trusted?estimate(samples.subarray(start,end),sampleRate,f.f0,{context:{...context,vowel:f.vowel||context.vowel},rules}):{values:null,confidence:'withheld',reasons:['untrusted-frame']};
  return {t:f.t,f0:f.f0,pitchMidi:f.f0>0?69+12*Math.log2(f.f0/440):null,vowel:f.vowel||context.vowel||null,formants,centroid:finite(f.centroid)?f.centroid:null,tilt:finite(f.tilt)?f.tilt:null,alpha:finite(f.alpha)?f.alpha:null};
 });
 const pitches=rows.map(f=>f.pitchMidi).filter(finite).sort((a,b)=>a-b),low=pitches[0],high=pitches.at(-1),zone=m=>high-low<3?'middle':m<low+(high-low)/3?'low':m>low+2*(high-low)/3?'high':'middle';
 const zones=['low','middle','high'].map(key=>{const r=rows.filter(f=>finite(f.pitchMidi)&&zone(f.pitchMidi)===key);return {key,frames:r.length,formantFrames:r.filter(f=>f.formants.values).length,centroid:median(r.map(f=>f.centroid).filter(finite)),tilt:median(r.map(f=>f.tilt).filter(finite)),alpha:median(r.map(f=>f.alpha).filter(finite)),f1:median(r.filter(f=>f.formants.values).map(f=>f.formants.values[0])),f2:median(r.filter(f=>f.formants.values).map(f=>f.formants.values[1]))};}).filter(z=>z.frames);
 const valid=rows.filter(r=>r.formants.values);
 return {version:VERSION,context,parameters:{...RULES,...rules},rows,zones,f1f2:valid.map(r=>({t:r.t,f1:r.formants.values[0],f2:r.formants.values[1],pitchMidi:r.pitchMidi,vowel:r.vowel})),
  metrics:{f1:median(valid.map(f=>f.formants.values[0])),f2:median(valid.map(f=>f.formants.values[1])),f3:median(valid.map(f=>f.formants.values[2])),centroid:median(rows.map(f=>f.centroid).filter(finite)),tilt:median(rows.map(f=>f.tilt).filter(finite)),alpha:median(rows.map(f=>f.alpha).filter(finite))},pitchMidi:median(pitches),rmsDb:median(frames.map(f=>f.rms).filter(finite)),limitations:['vowel-label-is-user-supplied','not-larynx-height','no-forward-resonance-score','synthetic-validation-only']};
}
function compare(a,b){
 const reasons=[],ca=a.context||{},cb=b.context||{};
 for(const k of ['owner','task','vowel','environment','loudness'])if(!ca[k]||!cb[k]||ca[k]!==cb[k])reasons.push(k+'-mismatch-or-missing');
 if(a.version!==b.version||a.version!==VERSION)reasons.push('algorithm-version-mismatch');
 if(!finite(a.pitchMidi)||!finite(b.pitchMidi)||Math.abs(a.pitchMidi-b.pitchMidi)>1)reasons.push('pitch-mismatch');
 if(!finite(a.rmsDb)||!finite(b.rmsDb)||Math.abs(a.rmsDb-b.rmsDb)>3)reasons.push('level-mismatch');
 if(reasons.length)return {state:'withheld',reasons,judgement:null,deltas:{}};
 return {state:'comparable',reasons:[],judgement:null,deltas:Object.fromEntries(Object.keys(a.metrics||{}).filter(k=>finite(a.metrics[k])&&finite(b.metrics?.[k])).map(k=>[k,b.metrics[k]-a.metrics[k]]))};
}
return {VERSION,RULES,lpc,estimate,analyze,compare};
});
