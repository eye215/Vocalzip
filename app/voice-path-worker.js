/* VOCAL.zip 소리 길 흔적 (시험판) — the model off the main thread.
 * In: {samples: Float32Array (transferred), sampleRate, guide: {curve, fps} | null}. Out: {progress} … {result} or {error}.
 * Nothing is fetched or sent from here. */
importScripts('voice-path-model.js?v=1');
self.onmessage = e => {
  try {
    const {samples, sampleRate, guide} = e.data;
    self.postMessage({result:self.VzipVoicePath.analyze(samples, sampleRate, {guide, onProgress:p => self.postMessage({progress:p})})});
  } catch (err) { self.postMessage({error:err.message || String(err)}); }
};
