/* Acoustic change candidates, never M1/M2 or TA/CT classification. Pure frame consumer; no storage or I/O. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipPrecisionTransitions=api;})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
const VERSION='pt-1.0.0',RULES=Object.freeze({windowSeconds:.3,minFrames:4,minFamilies:2,minMetrics:3,minPitchMotionCents:25,maxLevelChangeDb:3,refractorySeconds:.8,repeatToleranceSemitones:1,minRepeatTrials:3,minRepeatShare:.5});
const FEATURES=Object.freeze({h1h2:{threshold:4,family:'spectral',unit:'dB (uncorrected)'},tilt:{threshold:3,family:'spectral',unit:'dB/octave'},centroid:{threshold:400,family:'spectral',unit:'Hz'},hnr:{threshold:4,family:'periodic',unit:'dB'},cpp:{threshold:.04,family:'periodic',unit:'log-amplitude cepstral units'}});
const finite=x=>typeof x==='number'&&Number.isFinite(x),median=a=>{if(!a.length)return null;const s=a.slice().sort((a,b)=>a-b),i=s.length>>1;return s.length%2?s[i]:(s[i-1]+s[i])/2;};
const midi=hz=>69+12*Math.log2(hz/440),note=hz=>{const m=Math.round(midi(hz));return ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'][(m%12+12)%12]+(Math.floor(m/12)-1);};
function detect(frames,{context={},rules={}}={}){
 const p={...RULES,...rules};if(!Array.isArray(frames))throw Error('frames required');
 if(frames.some((f,i)=>!finite(f.t)||(i&&f.t<=frames[i-1].t)))throw Error('time-ordered frames required');
 const limitations=['acoustic-candidates-only','thresholds-not-clinically-calibrated'];if(!context.vowel)limitations.push('vowel-not-controlled');
 if(context.source!=='clean')return {version:VERSION,candidates:[],rejected:[],state:'withheld',limitations:[...limitations,'source-not-clean'],parameters:p};
 const candidates=[],rejected=[];
 for(let i=p.minFrames;i<frames.length-p.minFrames;i++){
  const t=frames[i].t,left=frames.slice(Math.max(0,i-30),i).filter(f=>f.t>=t-p.windowSeconds&&f.trusted&&f.f0>0),right=frames.slice(i,i+30).filter(f=>f.t<=t+p.windowSeconds&&f.trusted&&f.f0>0);
  if(left.length<p.minFrames||right.length<p.minFrames)continue;
  if(t-left[0].t>p.windowSeconds+.06||right.at(-1).t-t>p.windowSeconds+.06)continue;
  const values=(a,key)=>a.map(f=>f[key]).filter(finite),changes=[];
  for(const [key,spec] of Object.entries(FEATURES)){
   const a=values(left,key),b=values(right,key);if(a.length<p.minFrames||b.length<p.minFrames)continue;
   const before=median(a),after=median(b),noise=median(a.map(x=>Math.abs(x-before)))+median(b.map(x=>Math.abs(x-after))),delta=after-before;
   // Windowed robust change-point score: absolute effect must exceed both an interpretable floor and local MAD.
   if(Math.abs(delta)>=Math.max(spec.threshold,3*noise))changes.push({metric:key,before,after,delta,unit:spec.unit,family:spec.family,threshold:Math.max(spec.threshold,3*noise),effect:Math.abs(delta)/spec.threshold});
  }
  if(changes.length<p.minMetrics||new Set(changes.map(c=>c.family)).size<p.minFamilies)continue;
  const pitchBefore=median(values(left,'f0')),pitchAfter=median(values(right,'f0')),pitchDelta=1200*Math.log2(pitchAfter/pitchBefore),levelBefore=median(values(left,'rms')),levelAfter=median(values(right,'rms'));
  const vowels=new Set([...left,...right].map(f=>f.vowel||context.vowel).filter(Boolean));
  const why=[];if(vowels.size>1)why.push('vowel-change');if(!finite(levelBefore)||!finite(levelAfter)||Math.abs(levelAfter-levelBefore)>p.maxLevelChangeDb)why.push('level-change');
  if(Math.abs(pitchDelta)<p.minPitchMotionCents)why.push('insufficient-pitch-motion');
  if(why.length){rejected.push({t,reasons:why});continue;}
  const hz=frames[i].f0,pitches=[...left,...right].map(f=>f.f0),strength=changes.reduce((n,c)=>n+c.effect,0)/changes.length;
  const event={t,start:left[0].t,end:right.at(-1).t,pitchHz:hz,pitchNote:note(hz),range:{lowHz:Math.min(...pitches),highHz:Math.max(...pitches),lowNote:note(Math.min(...pitches)),highNote:note(Math.max(...pitches))},direction:pitchDelta>0?'ascending':'descending',pitchDeltaCents:pitchDelta,changes,strength,
   confidence:context.vowel?'medium':'low',limitations:limitations.slice(),physiologicalClassification:null};
  const last=candidates.at(-1);if(last&&t-last.t<p.refractorySeconds){if(strength>last.strength)candidates[candidates.length-1]=event;}else candidates.push(event);
 }
 return {version:VERSION,state:candidates.length?'reference':'no-candidates',candidates,rejected,parameters:p,limitations};
}
function repeated(trials,{rules={}}={}){
 const p={...RULES,...rules},rows=trials.map(t=>({id:String(t.id),context:t.context||{},result:detect(t.frames,{context:t.context,rules}),measurable:t.frames.filter(f=>f.trusted&&f.f0>0).length>=p.minFrames*2}));
 const out={version:VERSION,ascending:[],descending:[],excludedTrials:rows.filter(r=>!r.measurable||r.result.state==='withheld').map(r=>r.id),limitations:['recurrence-is-not-physiological-validation']};
 for(const direction of ['ascending','descending']){
  const task=direction==='ascending'?'siren-up':'siren-down',valid=rows.filter(r=>r.measurable&&r.result.state!=='withheld'&&r.context.task===task),clusters=[];
  for(const row of valid)for(const c of row.result.candidates.filter(c=>c.direction===direction)){
   const m=midi(c.pitchHz);let group=clusters.find(g=>Math.abs(m-median(g.midis))<=p.repeatToleranceSemitones);if(!group){group={midis:[],observations:new Map()};clusters.push(group);}
   if(!group.observations.has(row.id)){group.midis.push(m);group.observations.set(row.id,c);}
  }
  out[direction]=clusters.map(g=>({pitchMidi:median(g.midis),pitchNote:note(440*2**((median(g.midis)-69)/12)),observed:g.observations.size,measuredTrials:valid.length,reproducible:valid.length>=p.minRepeatTrials&&g.observations.size/valid.length>=p.minRepeatShare,
   confidence:valid.length>=p.minRepeatTrials?'medium':'low',events:[...g.observations].map(([trial,event])=>({trial,...event}))}));
 }
 return out;
}
return {VERSION,RULES,FEATURES,detect,repeated};
});
