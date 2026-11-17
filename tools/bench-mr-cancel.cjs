// Manual, synthetic-only benchmark. The measured section excludes audio generation and file/network decoding.
const path = require('node:path'), crypto = require('node:crypto');
const C = require(process.argv[2] ? path.resolve(process.argv[2]) : '../app/mr-cancel.js');
const Y = require('../tests/helpers/mr-synth.cjs');
const seconds = Number(process.argv[3] || 180);
if (!Number.isFinite(seconds) || seconds < 10 || seconds > 900) throw Error('Choose 10–900 seconds');
const mr = Y.mr(seconds + 60), take = Y.record(Y.vocal(seconds).x, mr, {offset:7, db:8}).x;
const started = performance.now(), out = C.cancel(take, mr), ms = performance.now() - started;
console.log(JSON.stringify({seconds, ms, ok:out.ok, report:out.report,
  voiceSha256:out.voice ? crypto.createHash('sha256').update(Buffer.from(out.voice.buffer)).digest('hex') : null,
  peakProcessMiB:process.resourceUsage().maxRSS / 1024, arrayBufferMiB:process.memoryUsage().arrayBuffers / 1048576}, null, 2));
