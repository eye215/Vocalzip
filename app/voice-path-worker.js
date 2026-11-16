/* VOCAL.zip 소리 길 흔적 (시험판) — everything heavy, off the main thread. Nothing is fetched or sent from here.
 *
 * One take:
 *   {start:{rate, keep8k}}             begin; keep8k: also keep an 8 kHz copy (needed to take the song's MR out)
 *   {block:[Float32Array per channel]}  30 s of decoded sound (transferred) → {progress:seconds measured}
 *   {end:{mrs:[{key, samples}]}}        finish. mrs: the song's MR files at 8 kHz mono (transferred), may be empty
 *        → {stage:'cancel'} · {stage:'voice', progress} … → {done:{mixed, removed, tries, stages}}
 *      mixed: the reading of the take as recorded. removed: {result, report, key} when one of the MRs could be taken
 *      out (app/mr-cancel.js, called as it is; the one that removes the most) and the voice that was left was read.
 * An MR file:
 *   {mono:{channels, rate}}             → {mono:Float32Array at 8 kHz} (transferred)
 * Any failure → {error}. Buffers are dropped as soon as the next step has what it needs. */
importScripts('voice-path-model.js?v=4');
const P = self.VzipVoicePath, SR = P.THRESHOLDS.SR, MR_RATE = 8000;
let job = null;
const mix = channels => {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length, out = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) out[i] += c[i];
  for (let i = 0; i < n; i++) out[i] /= channels.length;
  return out;
};
self.onmessage = e => {
  const d = e.data;
  try {
    if (d.mono) { const x = P.resample(mix(d.mono.channels), d.mono.rate, MR_RATE); self.postMessage({mono:x}, [x.buffer]); return; }
    if (d.start) { job = {rate:d.start.rate, stream:P.createStream(), halver:d.start.keep8k ? P.createHalver() : null, low:[], ms:{resample:0, model:0, cancel:0, voice:0}}; return; }
    if (d.block) {
      let t = performance.now();
      const x = P.resample(mix(d.block), job.rate, SR);
      if (job.halver) job.low.push(job.halver.push(x));
      job.ms.resample += performance.now() - t; t = performance.now();
      job.stream.push(x);
      job.ms.model += performance.now() - t;
      self.postMessage({progress:job.stream.seconds});
      return;
    }
    if (d.end) {
      let t = performance.now();
      const mixed = job.stream.finish(); job.stream = null;
      job.ms.model += performance.now() - t;
      const tries = []; let best = null;
      if (job.halver && d.end.mrs && d.end.mrs.length) {
        self.postMessage({stage:'cancel'});
        t = performance.now();
        job.low.push(job.halver.finish());
        const n = job.low.reduce((s, x) => s + x.length, 0), rec = new Float32Array(n); let o = 0;
        for (const x of job.low) { rec.set(x, o); o += x.length; }
        job.low = null; job.halver = null;
        if (!self.VzipMrCancel) importScripts('mr-cancel.js?v=2');
        for (const [i, mr] of d.end.mrs.entries()) {
          let out; try { out = self.VzipMrCancel.cancel(rec, mr.samples, {onProgress:p => self.postMessage({stage:'cancel', progress:(i + p) / d.end.mrs.length})}); } catch (err) { out = {ok:false, reason:'error'}; }
          mr.samples = null;                                          // this MR copy is not needed again
          const removedDb = out.ok ? out.report.removedDb : out.removedDb ?? null, ok = !!out.ok && removedDb >= P.THRESHOLDS.MR_MIN_REMOVED_DB;
          tries.push({key:mr.key, ok, reason:ok ? '' : out.ok ? 'little' : out.reason || 'no-match', removedDb});
          if (ok && (!best || removedDb > best.report.removedDb)) best = {voice:out.voice, report:out.report, key:mr.key};
        }
        job.ms.cancel = performance.now() - t;
      }
      let removed = null;
      if (best) {
        t = performance.now();
        const result = P.analyze(best.voice, MR_RATE, {onProgress:p => self.postMessage({stage:'voice', progress:p})});
        best.voice = null;
        job.ms.voice = performance.now() - t;
        removed = {result, key:best.key, report:{removedDb:best.report.removedDb, offsetSeconds:best.report.offsetSeconds, speed:best.report.speed, score:best.report.score}};
      }
      const stages = Object.fromEntries(Object.entries(job.ms).map(([k, v]) => [k, Math.round(v)]));
      job = null;
      self.postMessage({done:{mixed, removed, tries, stages}});
    }
  } catch (err) { self.postMessage({error:err.message || String(err)}); }
};
