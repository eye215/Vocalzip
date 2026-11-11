// VOCAL.zip score conversion (OMR PoC): PDF → compressed MusicXML (.mxl) with Audiveris, on a GitHub-hosted runner.
// Jobs exist only when the owner pressed "음표로 변환". The runner proves itself to the media Worker with this
// workflow's GitHub OIDC token (audience vocalzip-omr), so no storage key or shared secret is used here.
// The original PDF is only read; results go back through the Worker. Logs show counts only (public repository).
//   node worker/omr-worker.mjs                  claim and convert up to OMR_MAX_JOBS (default 5) waiting scores
//   node worker/omr-worker.mjs --selftest a.pdf convert one local PDF and print the note count (CI check, no network)
import {execFile} from 'node:child_process';
import {mkdtemp, readdir, readFile, rm, writeFile, stat, mkdir} from 'node:fs/promises';
import {existsSync, readFileSync, appendFileSync} from 'node:fs';
import {tmpdir, homedir} from 'node:os';
import {join} from 'node:path';
import {promisify} from 'node:util';
import {inflateRawSync} from 'node:zlib';

const run = promisify(execFile);
const AUDIVERIS = '/opt/audiveris/bin/Audiveris', AUDIENCE = 'vocalzip-omr';
const ENGINE_TIMEOUT = 20 * 60 * 1000, MAX_RESULT = 20 * 1024 * 1024;
const endpoint = () => (process.env.OMR_ENDPOINT || readFileSync(new URL('../r2-config.js', import.meta.url), 'utf8').match(/VZIP_R2_ENDPOINT\s*=\s*'([^']+)'/)?.[1] || '').replace(/\/+$/, '');
const output = (k, v) => { if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, k + '=' + v + '\n'); };

async function oidc() {
  const {ACTIONS_ID_TOKEN_REQUEST_URL: url, ACTIONS_ID_TOKEN_REQUEST_TOKEN: token} = process.env;
  if (!url || !token) throw new Error('OIDC token unavailable (needs permissions: id-token: write)');
  const res = await fetch(url + '&audience=' + AUDIENCE, {headers: {authorization: 'bearer ' + token}});
  if (!res.ok) throw new Error('OIDC request failed ' + res.status);
  return (await res.json()).value;
}
async function api(path, init = {}) {
  const res = await fetch(endpoint() + path, {...init, headers: {...init.headers, authorization: 'Bearer ' + await oidc()}});
  if (!res.ok) throw Object.assign(new Error(path.split('/').slice(0, 3).join('/') + ' ' + res.status), {status: res.status});
  return res;
}

async function installAudiveris() {
  if (existsSync(AUDIVERIS)) return;
  const dir = join(homedir(), 'audiveris-deb');
  await mkdir(dir, {recursive: true});
  let deb = (await readdir(dir)).find(f => f.endsWith('.deb'));
  if (!deb) {
    const headers = {accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? {authorization: 'Bearer ' + process.env.GITHUB_TOKEN} : {})};
    const release = await (await fetch('https://api.github.com/repos/Audiveris/audiveris/releases/latest', {headers})).json();
    const asset = (release.assets || []).find(a => /ubuntu24\.04-x86_64\.deb$/.test(a.name));
    if (!asset) throw new Error('Audiveris Ubuntu 24.04 installer not found');
    const res = await fetch(asset.browser_download_url);
    if (!res.ok) throw new Error('Audiveris download failed ' + res.status);
    deb = asset.name;
    await writeFile(join(dir, deb), Buffer.from(await res.arrayBuffer()));
    console.log('Audiveris', release.tag_name);
  }
  await run('sudo', ['apt-get', 'install', '-y', '-q', join(dir, deb)], {maxBuffer: 64 * 1024 * 1024});
}

/** Converts one PDF; returns {mxl: Buffer, movements} or throws {code}. */
export async function convert(pdfPath, work) {
  const out = join(work, 'out');
  await mkdir(out, {recursive: true});
  try {
    await run(AUDIVERIS, ['-batch', '-export', '-output', out, '--', pdfPath],
      {timeout: ENGINE_TIMEOUT, maxBuffer: 64 * 1024 * 1024, env: {...process.env, JAVA_TOOL_OPTIONS: '-Djava.awt.headless=true'}});
  } catch (e) {
    if (e.killed || e.signal === 'SIGTERM') throw Object.assign(new Error('engine timeout'), {code: 'timeout'});
    // Audiveris can exit non-zero after exporting some sheets; the files decide.
  }
  const files = [];
  const walk = async dir => { for (const d of await readdir(dir, {withFileTypes: true})) d.isDirectory() ? await walk(join(dir, d.name)) : d.name.endsWith('.mxl') && files.push(join(dir, d.name)); };
  await walk(out);
  files.sort((a, b) => a.localeCompare(b, 'en', {numeric: true}));
  if (!files.length) throw Object.assign(new Error('no music found'), {code: 'no-music'});
  const mxl = await readFile(files[0]);
  if (mxl.length > MAX_RESULT) throw Object.assign(new Error('result too large'), {code: 'too-large'});
  return {mxl, movements: files.length};
}

/** Count <note> elements (excluding rests) in the main score part of an .mxl (zip) file. */
export function countNotes(mxl) {
  const xml = zipEntries(mxl).find(e => /\.(xml|musicxml)$/i.test(e.name) && !/^META-INF\//.test(e.name))?.text || '';
  const notes = xml.match(/<note[\s>][\s\S]*?<\/note>/g) || [];
  const pitched = notes.filter(n => !/<rest[\s/>]/.test(n));
  return {notes: pitched.length, steps: [...new Set(pitched.map(n => n.match(/<step>([A-G])<\/step>/)?.[1]).filter(Boolean))].sort()};
}
function zipEntries(buf) {
  // Central directory: local headers written with data descriptors (Java's ZipOutputStream) carry no sizes.
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { end = i; break; }
  if (end < 0) return [];
  const out = [], count = buf.readUInt16LE(end + 10);
  for (let i = buf.readUInt32LE(end + 16), n = 0; n < count && buf.readUInt32LE(i) === 0x02014b50; n++) {
    const method = buf.readUInt16LE(i + 10), size = buf.readUInt32LE(i + 20), nameLen = buf.readUInt16LE(i + 28);
    const name = buf.subarray(i + 46, i + 46 + nameLen).toString('utf8'), local = buf.readUInt32LE(i + 42);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28), data = buf.subarray(start, start + size);
    out.push({name, text: (method === 8 ? inflateRawSync(data) : data).toString('utf8')});
    i += 46 + nameLen + buf.readUInt16LE(i + 30) + buf.readUInt16LE(i + 32);
  }
  return out;
}

async function main() {
  if (process.argv[2] === '--selftest') {
    await installAudiveris();
    const work = await mkdtemp(join(tmpdir(), 'omr-'));
    const {mxl, movements} = await convert(process.argv[3], work);
    const result = countNotes(mxl);
    console.log(JSON.stringify({bytes: mxl.length, movements, ...result}));
    return;
  }
  if (!endpoint()) { console.log('No media Worker address; nothing to do.'); return; }
  const max = Math.max(1, Math.min(20, Number(process.env.OMR_MAX_JOBS) || 5));
  let done = 0, failed = 0;
  for (let n = 0; n < max; n++) {
    const {job} = await (await api('/v1/omr-runner/next', {method: 'POST'})).json();
    if (!job) break;
    const work = await mkdtemp(join(tmpdir(), 'omr-'));
    try {
      await installAudiveris();
      const pdf = join(work, 'score.pdf');
      await writeFile(pdf, Buffer.from(await (await api('/v1/omr-runner/' + job.id + '/source')).arrayBuffer()));
      if ((await stat(pdf)).size !== job.size) throw Object.assign(new Error('incomplete download'), {code: 'unreadable'});
      const {mxl, movements} = await convert(pdf, work);
      await api('/v1/omr-runner/' + job.id + '/result', {method: 'PUT', body: mxl,
        headers: {'content-type': 'application/vnd.recordare.musicxml', 'content-length': String(mxl.length), 'x-omr-movements': String(movements)}});
      done++;
    } catch (e) {
      failed++;
      console.log('conversion failed:', e.code || 'engine');
      await api('/v1/omr-runner/' + job.id + '/fail', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({code: e.code || 'engine'})}).catch(() => {});
    } finally { await rm(work, {recursive: true, force: true}); }
  }
  console.log('converted', done, 'failed', failed);
  output('processed', done + failed);
}
if (import.meta.url === 'file://' + process.argv[1]) main().catch(e => { console.error(e.message); process.exit(1); });
