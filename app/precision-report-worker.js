/* Optional modules are loaded by the feature worker, never by the existing pitch worker. */
let initialized=false;
self.onmessage=({data})=>{
 try{
  if(!initialized){importScripts('vocal-analysis.js?v=7','precision-acoustics.js?v=1','precision-transitions.js?v=1','precision-resonance.js?v=1');initialized=true;}
  if(data.trials){self.postMessage({result:self.VzipPrecisionTransitions.repeated(data.trials)});return;}
  const {samples,sampleRate,options}=data,result=self.VzipPrecisionAcoustics.analyze(samples,sampleRate,{...options,onProgress:progress=>self.postMessage({progress:progress*.75})});
  result.transitions=self.VzipPrecisionTransitions.detect(result.frames,{context:result.context});
  result.resonance=self.VzipPrecisionResonance.analyze(samples,sampleRate,result.frames,{context:result.context});
  self.postMessage({result});
 }catch(err){self.postMessage({error:String(err.message||err)});}
};
