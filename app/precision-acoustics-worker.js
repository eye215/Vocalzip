/* Terminate this worker to cancel; failed/cancelled runs have no storage side effects. */
importScripts('vocal-analysis.js?v=7','precision-acoustics.js?v=1');
self.onmessage=({data})=>{
 try{const result=self.VzipPrecisionAcoustics.analyze(data.samples,data.sampleRate,{...data.options,onProgress:progress=>self.postMessage({progress})});self.postMessage({result});}
 catch(error){self.postMessage({error:String(error.message||error)});}
};
