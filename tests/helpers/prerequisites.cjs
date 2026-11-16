// What some tests need from the machine, checked in one place.
// On a developer machine a missing prerequisite SKIPS the test and says what to do. In CI (process.env.CI) it is an
// error instead, so a broken CI setup can never turn into a quiet green run with the test left out.
const fs = require('node:fs'), path = require('node:path');
const MEDIABUNNY = 'https://cdn.jsdelivr.net/npm/mediabunny@1.65.1/dist/bundles/mediabunny.min.mjs';
const inCi = () => !!process.env.CI;
const ciError = reason => Error('CI is missing a test prerequisite: ' + reason);

/** node:test files: false when everything is there, else the reason to pass as {skip}. */
exports.nodeSkip = (ok, reason) => { if (ok) return false; if (inCi()) throw ciError(reason); return reason; };

/** Playwright: skip the running test with the reason (or fail in CI). */
function missing(test, reason) { if (inCi()) throw ciError(reason); test.skip(true, reason); }

/** A generated media file. tests/fixtures is not committed: `node tests/make-audio-fixtures.cjs` writes it (needs ffmpeg). */
exports.fixture = (test, name) => {
  const file = path.join(__dirname, '..', 'fixtures', name);
  if (!fs.existsSync(file)) missing(test, 'tests/fixtures/' + name + ' is not there: run `node tests/make-audio-fixtures.cjs` first (it needs ffmpeg).');
  return file;
};

/** The pinned Mediabunny parser the import worker loads: a local copy (VZ_MEDIABUNNY, routed by the spec) or the CDN.
 * Call it after the page is open. Without the parser, imports fall back to "length unknown" and these tests cannot pass. */
exports.mediabunny = async (test, page) => {
  const local = process.env.VZ_MEDIABUNNY;
  if (local) { if (!fs.existsSync(local)) throw Error('VZ_MEDIABUNNY points to a file that is not there: ' + local); return; }
  const loaded = await page.evaluate(url => Promise.race([import(url).then(() => true, () => false), new Promise(done => setTimeout(() => done(false), 10000))]), MEDIABUNNY);
  if (!loaded) missing(test, 'the Mediabunny parser cannot be loaded from cdn.jsdelivr.net on this machine: set VZ_MEDIABUNNY to a local copy of mediabunny@1.65.1 dist/bundles/mediabunny.min.mjs (npm pack mediabunny@1.65.1).');
};
