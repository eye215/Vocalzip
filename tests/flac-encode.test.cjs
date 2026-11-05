// Pure-JS FLAC encoder: ffmpeg must decode its output back to the exact original PCM.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), {execFileSync} = require('node:child_process');
const {encodeWav, verify} = require('../flac-encode.js');
const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], {stdio:'ignore'}); return true; } catch { return false; } })();
function wav({rate = 44100, channels = 2, bits = 16, frames = 10000, fn}) {
  const align = channels * bits / 8, b = Buffer.alloc(44 + frames * align);
  b.write('RIFF', 0); b.writeUInt32LE(36 + frames * align, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(channels, 22); b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * align, 28); b.writeUInt16LE(align, 32); b.writeUInt16LE(bits, 34); b.write('data', 36); b.writeUInt32LE(frames * align, 40);
  const max = 2 ** (bits - 1) - 1, min = -(2 ** (bits - 1));
  for (let i = 0; i < frames; i++) for (let c = 0; c < channels; c++) { const v = Math.max(min, Math.min(max, Math.round(fn(i, c) * max))); const at = 44 + i * align + c * bits / 8; if (bits === 16) b.writeInt16LE(v, at); else b.writeIntLE(v, at, 3); }
  return b;
}
const asFile = buf => ({size:buf.length, slice:(s, e) => ({arrayBuffer:async () => { const x = buf.subarray(s, e); return x.buffer.slice(x.byteOffset, x.byteOffset + x.length); }})});
let seed = 1; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
const cases = [
  {name:'16-bit stereo music-like', bits:16, channels:2, frames:44100 * 2 + 123, fn:(i, c) => 0.6 * Math.sin(i / (17 + c)) + 0.05 * (rnd() - 0.5)},
  {name:'16-bit mono full-scale noise (verbatim path)', bits:16, channels:1, frames:20000, fn:() => rnd() * 2 - 1},
  {name:'16-bit silence then clip (constant + extremes)', bits:16, channels:2, frames:9000, fn:i => i < 5000 ? 0 : (i % 2 ? 1 : -1)},
  {name:'24-bit stereo 48 kHz', bits:24, channels:2, rate:48000, frames:48000 + 7, fn:(i, c) => 0.8 * Math.sin(i / (40 + 9 * c)) + 0.001 * (rnd() - 0.5)},
  {name:'24-bit 6 channels odd rate', bits:24, channels:6, rate:37800, frames:5000, fn:(i, c) => Math.sin(i / (5 + c)) * 0.3}
];
for (const c of cases) test(c.name, {skip:!hasFfmpeg && 'ffmpeg not installed'}, async () => {
  const src = wav(c), {blob, info} = await encodeWav(asFile(src), {date:'2026-03-05'});
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flac-')), f = path.join(dir, 'x.flac');
  fs.writeFileSync(f, Buffer.from(await blob.arrayBuffer()));
  const fmt = c.bits === 16 ? 's16le' : 's32le';
  const pcm = execFileSync('ffmpeg', ['-v', 'error', '-i', f, '-f', fmt, '-acodec', c.bits === 16 ? 'pcm_s16le' : 'pcm_s32le', '-'], {maxBuffer:1 << 28});
  const tags = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format_tags=DATE', '-of', 'default=nw=1:nk=1', f]).toString().trim();
  fs.rmSync(dir, {recursive:true, force:true});
  assert.equal(info.frames, c.frames);
  if (c.bits === 16) assert.ok(pcm.equals(src.subarray(44)), 'decoded PCM differs');
  else { for (let i = 0; i < c.frames * c.channels; i++) assert.equal(pcm.readInt32LE(i * 4) >> 8, src.readIntLE(44 + i * 3, 3)); }
  assert.equal(tags, '2026-03-05');
  if (!c.name.includes('noise')) assert.ok(blob.size < src.length, 'FLAC should be smaller');
});

test('verify() accepts every encoded case and rejects any changed byte or sample', async () => {
  for (const c of cases) {
    const src = wav(c), file = asFile(src), {blob, info} = await encodeWav(file, {});
    assert.deepEqual(await verify(blob, file, info), {frames:c.frames});
    // A flipped bit inside the audio data must be caught (CRC or sample comparison).
    const bytes = new Uint8Array(await blob.arrayBuffer()); bytes[Math.floor(bytes.length * 0.6)] ^= 0x10;
    await assert.rejects(verify(new Blob([bytes]), file, info));
    // A different original must not pass either.
    const other = Buffer.from(src); other.writeInt16LE((other.readInt16LE(44 + 200) + 1) & 0x7fff, 44 + 200);
    await assert.rejects(verify(blob, asFile(other), info));
  }
});
