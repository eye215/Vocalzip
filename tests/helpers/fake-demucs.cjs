// Stand-in for `python -m demucs --two-stems vocals -n htdemucs -d cpu -o <out> <input>` in the separation worker
// tests: writes <out>/htdemucs/<input name>/vocals.wav from FAKE_VOCALS (a known clean voice), or fails with FAKE_FAIL.
const fs = require('node:fs'), path = require('node:path');
const args = process.argv.slice(2), out = args[args.indexOf('-o') + 1], input = args.at(-1);
if (process.env.FAKE_FAIL === '1' || !out || !input || !fs.existsSync(input)) process.exit(3);
const dir = path.join(out, args[args.indexOf('-n') + 1] || 'htdemucs', path.basename(input).replace(/\.[^.]+$/, ''));
fs.mkdirSync(dir, {recursive:true});
fs.copyFileSync(process.env.FAKE_VOCALS, path.join(dir, 'vocals.wav'));
fs.copyFileSync(input, path.join(dir, 'no_vocals.wav'));
