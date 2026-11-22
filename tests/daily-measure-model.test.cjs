// 기본기 단계 · 호흡 / 리듬 / 비브라토 (app/daily-measure-model.js → app/levels-model.js): what the three measuring
// exercises of 오늘의 연습 read from the mic, checked on made-up signals (generated arrays: no audio, no person), and the
// steps those numbers give in the levels table — 3 different days, 기준 맞추는 중 for 14 days, steps never taken away.
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../app/daily-measure-model.js'), L = require('../app/levels-model.js'), D = require('../app/daily-set-model.js'), VP = require('../app/voice-path-model.js');
const day = n => L.shift('2026-11-01', n - 1);
const FRAME = .005;
/** A small fixed-seed noise (the tests give the same numbers every time). */
const noise = seed => { let x = (seed * 2654435761) >>> 0 || 1; const next = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; for (let i = 0; i < 8; i++) next(); return next; };
/** Level frames every 5 ms for `seconds`: level(t) gives the RMS. */
const frames = (seconds, level) => { const out = []; for (let i = 1; i <= Math.round(seconds / FRAME); i++) { const t = i * FRAME; out.push({t, rms:level(t), d:FRAME}); } return out; };
/** A finished set on a date with one measuring item. */
const setRow = (date, measures, exercise = 'breath-hiss') => ({id:'practice-set:' + date, date, minutes:3, manualMinutes:3, practiceTimeSource:'practice-set', practiceSetId:date, created:Date.parse(date + 'T10:00:00Z'),
  dailySet:{v:1, minutes:3, items:[{id:'ex-' + exercise, kind:'exercise', exercise, state:'done', seconds:150, minutes:2.5, mic:true, measures}]}});
const db = practices => ({practices, practicePlans:[], scoreAnnotations:[], songs:[], deleted:{}});
/** The highest step a measure meets on its own (three days of it, read as the draft table does while calibrating). */
const stepOf = (area, measure) => L.skill(db([1, 2, 3].map(n => setRow(day(n), [measure]))), area, {today:day(3)}).estimate;

/* ---------- 호흡 · “스~” 길게 ---------- */
const quiet = .0008, hissLevel = .03;
test('“스~” 길게: one hiss is timed from the floor of the first half second; a dip of 0.1 s is still one hiss, a gap over 0.25 s ends it', () => {
  const r = noise(7), jitter = () => 1 + (r() - .5) * .2;
  // Quiet for 2 s (the floor), then a 22-second hiss with a 100 ms dip at 10 s.
  const dip = frames(30, t => t > 2 && t <= 24 && !(t > 10 && t <= 10.1) ? hissLevel * jitter() : quiet * jitter());
  const one = M.hissMeasure(dip, {t0:0});
  assert.ok(Math.abs(one.seconds - 22) <= .05, JSON.stringify(one));
  assert.ok(one.floor < -55 && one.floor > -68, String(one.floor));
  // The same with a 0.4 s gap: two hisses (about 8 and 13.6 s); the longest counts.
  const gap = M.hissMeasure(frames(30, t => t > 2 && t <= 24 && !(t > 10 && t <= 10.4) ? hissLevel : quiet), {t0:0});
  assert.ok(Math.abs(gap.seconds - 13.6) <= .05, JSON.stringify(gap));
  // A short noise (0.15 s) is not a hiss; nothing at all is 0.
  assert.equal(M.hissMeasure(frames(5, t => t > 2 && t <= 2.15 ? hissLevel : quiet), {t0:0}).seconds, 0);
  assert.deepEqual(M.hissMeasure(frames(5, () => quiet), {t0:0}), {seconds:0, even:null, floor:M.hissMeasure(frames(5, () => quiet), {t0:0}).floor});
  // A noisy room: the floor is the room, so the hiss has to stand above it (2.5×), not above silence.
  assert.equal(M.hissMeasure(frames(20, t => t > 2 && t <= 15 ? .009 : .006), {t0:0}).seconds, 0);
  assert.ok(Math.abs(M.hissMeasure(frames(20, t => t > 2 && t <= 15 ? .03 : .006), {t0:0}).seconds - 13) <= .05);
  // Frames missing for a while (the page was slow) are not quiet: the hiss goes on.
  const holes = frames(20, t => t > 1 && t <= 16 ? hissLevel : quiet).filter(f => !(f.t > 8 && f.t < 8.4));
  assert.ok(Math.abs(M.hissMeasure(holes, {t0:0}).seconds - 15) <= .05);
  // Live: the tracker says how long the hiss is going, and when it ended.
  const tr = M.hissStart(0), live = frames(14, t => t > 1 && t <= 12 ? hissLevel : quiet);
  M.hissFeed(tr, live.filter(f => f.t <= 6));
  assert.ok(M.hissNow(tr).hissing && Math.abs(M.hissNow(tr).seconds - 5) < .02 && !M.hissNow(tr).ended);
  M.hissFeed(tr, live.filter(f => f.t > 6));
  assert.equal(M.hissNow(tr).ended, true);
});

test('“스~” 길게: `even` is how much the loudness moves over the middle (dB), never how loud it is', () => {
  const steady = M.hissMeasure(frames(40, t => t > 1 && t <= 36 ? hissLevel * (1 + .05 * Math.sin(t * 9)) : quiet), {t0:0});
  const louder = M.hissMeasure(frames(40, t => t > 1 && t <= 36 ? hissLevel * 4 * (1 + .05 * Math.sin(t * 9)) : quiet), {t0:0});
  const swell = M.hissMeasure(frames(40, t => t > 1 && t <= 36 ? hissLevel * (1 + .7 * Math.sin(t * .8)) : quiet), {t0:0});
  assert.ok(steady.even < 1, JSON.stringify(steady));
  assert.equal(louder.even, steady.even);               // four times louder: exactly as even, not better
  assert.ok(swell.even > 3, JSON.stringify(swell));
  assert.equal(M.hissMeasure(frames(8, t => t > 1 && t <= 5 ? hissLevel : quiet), {t0:0}).even, null); // too short to say
  // Tries → one measure: the longest try, and the evenness of the longest try that has one.
  assert.deepEqual(M.breathMeasure([{seconds:31.2, even:2.4}, {seconds:18, even:1.1}]), {area:'breath', kind:'hiss', value:31.2, unit:'초', even:2.4, evenSeconds:31.2, tries:2});
  assert.deepEqual(M.breathMeasure([{seconds:0, even:null}, {seconds:12.34, even:null}]), {area:'breath', kind:'hiss', value:12.3, unit:'초', tries:2});
  assert.equal(M.breathMeasure([{seconds:0, even:null}]), null);  // nothing heard: no measure (the area is not started by silence)
  assert.equal(L.cleanMeasure(M.breathMeasure([{seconds:12, even:1}])).value, 12);
});

test('호흡 steps: 10 s → 20 s → 30 s → 30 s even → 40 s even', () => {
  const m = (value, even) => ({area:'breath', kind:'hiss', value, unit:'초', ...(even == null ? {} : {even}), tries:2});
  assert.deepEqual([m(9.9), m(10), m(22), m(31), m(31, 2.5), m(31, 3.5), m(41, 2), m(41)].map(x => stepOf('breath', x)), [0, 1, 2, 3, 4, 3, 5, 3]);
  assert.deepEqual(L.SKILLS.find(a => a.id === 'breath').by, ['breath-hiss']);
  // The same numbers from a measured signal: a 22-second hiss is step 2.
  const hiss = M.breathMeasure([M.hissMeasure(frames(30, t => t > 2 && t <= 24 && !(t > 10 && t <= 10.1) ? hissLevel : quiet), {t0:0})]);
  assert.equal(stepOf('breath', hiss), 2);
});

/* ---------- 리듬 · “타” 따라 하기 ---------- */
/**
 * Level frames of one round: a floor, the person's “타” (a sharp burst at each time in `tas`), and — without earphones —
 * every app sound coming back through the mic `rt` seconds later at `leak` (the count-in and listen clicks loud, the
 * say-it-back clicks soft).
 */
function roundFrames(tl, tas, {rt = null, leak = .02} = {}) {
  const r = noise(3), sounds = rt == null ? [] : [...tl.clicks.map(c => ({t:c.t + rt, a:c.soft ? leak * .35 : leak, d:.03})), ...tl.tas.map(t => ({t:t + rt, a:leak * 1.2, d:.08}))];
  return frames(tl.end + .5, t => {
    let level = .0005 * (1 + r() * .2);
    for (const s of sounds) if (t > s.t && t <= s.t + s.d) level = Math.max(level, s.a);
    for (const a of tas) if (t > a && t <= a + .1) level = Math.max(level, .15 * Math.exp(-(t - a) / .05));
    return level;
  });
}
const jittered = (times, ms, seed = 11) => { const r = noise(seed); return times.map(t => t + (r() * 2 - 1) * ms / 1000); };

test('“타” 따라 하기: a round is a count-in, then listen and say-it-back bars; the plan follows the 리듬 step', () => {
  const tl = M.roundTimeline({level:2, bpm:80});
  assert.equal(tl.beat, .75); assert.equal(tl.bar, 3);
  assert.deepEqual(tl.bars.map(b => b.kind), ['count', 'listen', 'say', 'listen', 'say', 'listen', 'say', 'listen', 'say']);
  assert.equal(tl.countIn.length, 4); assert.equal(tl.clicks.length, 4 + 8 * M.RHYTHM.pairs);
  assert.equal(tl.expect.length, M.PATTERNS[2].reduce((n, p) => n + p.length, 0));
  assert.ok(tl.expect.every(t => tl.bars.some(b => b.kind === 'say' && t >= b.from && t < b.to)));
  assert.ok(Math.abs(tl.end - (M.RHYTHM.lead + 27)) < 1e-9);
  assert.deepEqual(M.rhythmPlan(0), [{level:1, bpm:80}, {level:2, bpm:80}, {level:3, bpm:80}]);
  assert.deepEqual(M.rhythmPlan(3), [{level:2, bpm:104}, {level:3, bpm:80}, {level:3, bpm:104}]);
  assert.equal(L.FAST_BPM, M.RHYTHM.fast);
});

test('“타” 따라 하기 with earphones: the person\'s own middle offset is taken off; ±30 ms jitter passes step 2, a scattered one does not', () => {
  const tl = M.roundTimeline({level:2, bpm:80});
  // On time ±30 ms, heard 0.18 s late (output + input delay nobody knows).
  const ok = M.rhythmRound(roundFrames(tl, jittered(tl.expect, 30).map(t => t + .18)), tl);
  assert.equal(ok.method, 'median'); assert.equal(ok.hit, 100); assert.equal(ok.extra, 0);
  assert.ok(Math.abs(ok.offset - 180) <= 15, JSON.stringify(ok));
  assert.ok(ok.value <= 30, JSON.stringify(ok));
  const [measure] = M.rhythmMeasures([ok]);
  assert.deepEqual(Object.keys(measure).sort(), ['area', 'bpm', 'extra', 'hit', 'kind', 'level', 'method', 'offset', 'unit', 'value']);
  assert.equal(stepOf('rhythm', measure), 2);
  // Every “타” 90 ms early or late in turn: nothing to take off on average, and 90 ms from the beat — no step.
  const loose = M.rhythmRound(roundFrames(tl, tl.expect.map((t, i) => t + (i % 2 ? .09 : -.09))), tl);
  assert.ok(loose.value >= 85 && loose.value <= 95, JSON.stringify(loose)); assert.equal(loose.hit, 100);
  assert.equal(stepOf('rhythm', M.rhythmMeasures([loose])[0]), 0);
  // 70 ms early or late in turn: step 1 (≤ 80 ms) but not step 2 (≤ 60 ms).
  const seventy = M.rhythmRound(roundFrames(tl, tl.expect.map((t, i) => t + (i % 2 ? .07 : -.07))), tl);
  assert.ok(seventy.value > 60 && seventy.value <= 80, JSON.stringify(seventy));
  assert.equal(stepOf('rhythm', M.rhythmMeasures([seventy])[0]), 1);
  // Half the “타” missing: under 80% found, no step at all however close the rest were.
  const half = M.rhythmRound(roundFrames(tl, tl.expect.filter((_, i) => i % 2)), tl);
  assert.ok(half.hit < 80); assert.equal(stepOf('rhythm', M.rhythmMeasures([half])[0]), 0);
  // Silence: nothing to measure.
  const none = M.rhythmRound(roundFrames(tl, []), tl);
  assert.equal(none.value, null); assert.deepEqual(M.rhythmMeasures([none]), []);
});

test('“타” 따라 하기 without earphones: the clicks coming back are measured in the count-in, taken off, and never taken for a “타”', () => {
  const tl = M.roundTimeline({level:1, bpm:80}), rt = .07;
  // Silent person, loud clicks in the mic: the round trip is found and no click becomes a “타”.
  const silent = M.rhythmRound(roundFrames(tl, [], {rt}), tl);
  assert.equal(silent.method, 'echo'); assert.ok(Math.abs(silent.rt - 70) <= 6, JSON.stringify(silent));
  assert.equal(silent.value, null); assert.equal(silent.matched, 0);
  // On the beat (as the person hears it: the click's round trip later) ±20 ms: close, everything found.
  const onBeat = M.rhythmRound(roundFrames(tl, jittered(tl.expect, 20).map(t => t + rt), {rt}), tl);
  assert.equal(onBeat.method, 'echo'); assert.equal(onBeat.hit, 100);
  assert.ok(onBeat.value <= 25, JSON.stringify(onBeat));
  // Always 0.1 s late: with the round trip measured, the lateness is NOT forgiven (it is what “박자와 n ms” says).
  const late = M.rhythmRound(roundFrames(tl, tl.expect.map(t => t + rt + .1), {rt}), tl);
  assert.ok(late.value >= 90 && late.value <= 110, JSON.stringify(late)); assert.ok(late.late >= 90);
  assert.equal(stepOf('rhythm', M.rhythmMeasures([late])[0]), 0);
  // Guard on the clicks: the soft click under each beat is not what is matched (a “타” 50 ms late reads ~50 ms, not 0).
  const fifty = M.rhythmRound(roundFrames(tl, tl.expect.map(t => t + rt + .05), {rt}), tl);
  assert.ok(fifty.value >= 40 && fifty.value <= 60, JSON.stringify(fifty));
  // Echoes that do not agree (a noisy room) are not a round trip: the earphones rule is used instead.
  const r = noise(9), messy = M.roundTimeline({level:1, bpm:80});
  const fr = frames(messy.end, t => messy.countIn.some((c, i) => t > c + .05 + i * .03 && t <= c + .08 + i * .03) ? .02 * (1 + r() * .1) : .0005);
  assert.equal(M.echoOf(fr, messy.countIn, {floorDb:M.floorOf(fr, .5)}), null);
});

test('리듬 steps: quarters ≤ 80 ms → eighths with rests ≤ 60 → triplets and syncopation ≤ 40 → the same at the faster tempo', () => {
  const m = (level, value, bpm = 80, hit = 100) => ({area:'rhythm', kind:'rhythm', value, unit:'ms', level, bpm, hit, extra:0, offset:0, method:'median'});
  assert.deepEqual([m(1, 81), m(1, 80), m(1, 50), m(2, 60), m(2, 61), m(3, 40), m(3, 41), m(2, 55, 104), m(3, 38, 104), m(3, 38, 104, 79)].map(x => stepOf('rhythm', x)),
    [0, 1, 1, 2, 1, 3, 2, 2, 5, 0]);
  // Step 4 needs step 3 first (a step only after the one under it): eighths fast alone stay at 2.
  assert.deepEqual(L.SKILLS.find(a => a.id === 'rhythm').by, ['rhythm-ta']);
});

/* ---------- 비브라토 · 8초 롱톤 ---------- */
/** A pitch track (cents from the note) every 40 ms over 8 s: straight (a little drift and wobble) until `from`, then the shape. */
const track = (shape, {from = 4, rate = 25, gaps = null} = {}) => {
  const r = noise(21), out = [];
  for (let t = 0; t <= 8 + 1e-9; t += 1 / rate) out.push({t:Math.round(t * 1000) / 1000, cents:gaps && gaps(t) ? null : (t < from ? 3 * Math.sin(t * 2.1) + (r() - .5) * 2 : shape(t))});
  return out;
};
const sine = (hz, cents) => t => cents * Math.sin(2 * Math.PI * hz * t);

test('비브라토: a 5.5 Hz ±30 cent modulation after the cue is vibrato — on cue, regular, about 4 seconds', () => {
  const x = M.vibratoRound(track(sine(5.5, 30)));
  assert.deepEqual([x.rate, x.extent, x.regular, x.tail, x.straight, x.cued], [5.5, 30, 1, 1, 1, 1], JSON.stringify(x));
  assert.ok(Math.abs(x.seconds - 4) <= .25, JSON.stringify(x));
  assert.ok(x.regularity >= M.VIBRATO.regularity);
  // The thresholds are those of 소리 길 흔적, read from there.
  assert.equal(M.VIBRATO.source, 'voice-path');
  assert.deepEqual([M.VIBRATO.minHz, M.VIBRATO.maxHz, M.VIBRATO.extent, M.VIBRATO.regularity],
    [VP.THRESHOLDS.VIBRATO_MIN_HZ, VP.THRESHOLDS.VIBRATO_MAX_HZ, VP.THRESHOLDS.VIBRATO_MIN_EXTENT_CENTS, VP.THRESHOLDS.VIBRATO_MIN_REGULARITY]);
  assert.deepEqual(L.SKILLS.find(a => a.id === 'vibrato').steps[0].conds.slice(1), [{field:'rate', min:VP.THRESHOLDS.VIBRATO_MIN_HZ, max:VP.THRESHOLDS.VIBRATO_MAX_HZ}, {field:'extent', min:VP.THRESHOLDS.VIBRATO_MIN_EXTENT_CENTS}]);
  // Uneven sampling (the page ticks irregularly) reads the same.
  const uneven = M.vibratoRound(track(sine(5.5, 30)).filter((_, i) => i % 5 !== 2));
  assert.deepEqual([uneven.rate, uneven.cued, uneven.regular], [5.5, 1, 1]);
});

test('비브라토: what is not vibrato — straight, too slow, too narrow, too fast, irregular, early, silent', () => {
  const straight = M.vibratoRound(track(() => 2 * Math.sin(1.3)));
  assert.deepEqual([straight.seconds, straight.straight, straight.tail, straight.cued], [0, 1, 0, 0]);
  assert.equal(M.vibratoRound(track(sine(3, 40))).seconds, 0);    // a slow wave (3 Hz)
  assert.equal(M.vibratoRound(track(sine(5.5, 10))).seconds, 0);  // ±10 cent: under 15
  assert.equal(M.vibratoRound(track(sine(9.5, 40))).seconds, 0);  // a fast flutter
  // A rate that wanders 4.5 ↔ 7.5 Hz: seen, but not "고르게".
  const wander = M.vibratoRound(track(t => 30 * Math.sin(2 * Math.PI * (6 * t + .55 * Math.sin(2 * Math.PI * .5 * t) * 2))));
  assert.equal(wander.regular, 0, JSON.stringify(wander));
  // Vibrato from the start: there is vibrato, but it did not wait for the cue.
  const early = M.vibratoRound(track(sine(5.5, 30), {from:0}));
  assert.deepEqual([early.straight, early.cued, early.regular, early.tail], [0, 0, 1, 1]);
  assert.equal(early.seconds, 8);
  // Only the last 2 s: it appeared at the end (step 1), not 3 s long.
  const end = M.vibratoRound(track(sine(5.5, 30), {from:6}));
  assert.equal(end.tail, 1); assert.ok(end.seconds < 3);
  // Silence: no windows with a pitch.
  const silent = M.vibratoRound(track(sine(5.5, 30), {gaps:() => true}));
  assert.equal(silent.voiced, 0); assert.equal(M.vibratoMeasure([{midi:60, ...silent}]), null);
});

test('비브라토 steps: appears at the end → 3 s regular → on the cue → at two pitches; step 5 (vowels) is 준비 중', () => {
  const round = (midi, shape, from) => ({midi, ...M.vibratoRound(track(shape, {from}))});
  const endOnly = M.vibratoMeasure([round(60, sine(5.5, 30), 6), round(64, () => 0, 4)]);
  const early = M.vibratoMeasure([round(60, sine(5.5, 30), 0), round(64, sine(5.5, 30), 0)]);
  const oneCued = M.vibratoMeasure([round(60, sine(5.5, 30), 4), round(64, sine(5.5, 8), 4)]);
  const twoCued = M.vibratoMeasure([round(60, sine(5.5, 30), 4), round(64, sine(6, 25), 4)]);
  assert.deepEqual([endOnly, early, oneCued, twoCued].map(m => stepOf('vibrato', m)), [1, 2, 3, 4]);
  assert.deepEqual([oneCued.variants, twoCued.variants, twoCued.of, twoCued.hold], [1, 2, 2, 8]);
  assert.deepEqual(Object.keys(twoCued).sort(), ['area', 'cued', 'extent', 'hold', 'kind', 'of', 'rate', 'regular', 'regularity', 'straight', 'tail', 'unit', 'value', 'variants']);
  const a = L.skill(db([]), 'vibrato', {today:day(1)});
  assert.deepEqual([a.state, a.by, a.steps.map(s => !!s.soon)], ['ready', ['voice-vibrato'], [false, false, false, false, true]]);
  // The exercise behind it: two pitches, 8 s, the cue at 4 s.
  assert.deepEqual(D.exercise('voice-vibrato').measure, ['vibrato']);
});

/* ---------- the rules of 단계, with these numbers ---------- */
test('3 different days, 기준 맞추는 중 for 14 days, steps never taken away — for the new areas too', () => {
  const hiss = s => M.breathMeasure([{seconds:s, even:null}]);
  // 22 s on the 1st, 2nd (twice) and 5th: three different days are needed, the same day twice counts once.
  const rows = [setRow(day(1), [hiss(22)]), {...setRow(day(2), [hiss(21)]), id:'practice-set:a'}, {...setRow(day(2), [hiss(23)]), id:'practice-set:b'}];
  let data = db(rows);
  assert.equal(L.skill(data, 'breath', {today:day(2)}).state, 'calibrating');
  assert.deepEqual(L.award(data, {today:day(20)}), []);                       // only two different days
  data = db([...rows, setRow(day(5), [hiss(24)])]);
  assert.deepEqual(L.award(data, {today:day(14)}), []);                       // still 기준 맞추는 중 (day 14 of 14)
  const won = L.award(data, {today:day(15)});
  assert.deepEqual(won.map(x => [x.area, x.step, x.earned, x.days.map(d => d.date)]), [['breath', 1, day(15), [day(1), day(2), day(5)]], ['breath', 2, day(15), [day(1), day(2), day(5)]]]);
  assert.deepEqual(data.practicePlans.map(p => p.id), ['skill-step:breath:1', 'skill-step:breath:2']);
  // Later days that fall short take nothing away; "요즘도 유지 중" follows the last 14 days.
  for (let n = 16; n <= 40; n++) data.practices.push(setRow(day(n), [hiss(6)]));
  const later = L.skill(data, 'breath', {today:day(40)});
  assert.deepEqual([later.step, later.keeping], [2, false]);
  assert.deepEqual(L.award(data, {today:day(40)}), []);
  assert.equal(L.skill(data, 'breath', {today:day(40)}).recent[0].text, '가장 긴 스 6초');
});

test('the words of a finished step (next step\'s line and the summary)', () => {
  assert.equal(M.resultWords({mode:'hiss', measures:[M.breathMeasure([{seconds:12.34, even:null}])]}), '가장 긴 스 12.3초');
  assert.equal(M.resultWords({mode:'hiss', timer:true}), '타이머로 했어요');
  assert.equal(M.resultWords({mode:'rhythm', measures:[{area:'rhythm', value:45}, {area:'rhythm', value:58}]}), '박자와 45 · 58 ms');
  assert.equal(M.resultWords({mode:'rhythm'}), '“타”가 잘 안 들렸어요');
  assert.equal(M.resultWords({mode:'vibrato', measures:[{area:'vibrato', value:3.8, rate:5.5}]}), '비브라토 3.8초 · 1초에 5.5번');
  assert.equal(M.resultWords({mode:'vibrato', measures:[{area:'vibrato', value:0}]}), '비브라토가 아직 안 보였어요');
  assert.equal(M.resultWords({mode:'hold'}), '');
  // In the 단계 lists.
  const v = L.skill(db([setRow(day(1), [{area:'vibrato', kind:'vibrato', value:3.8, unit:'초', rate:5.5, extent:28, regular:1, tail:1, cued:1, variants:1}], 'voice-vibrato'),
    setRow(day(2), [{area:'rhythm', kind:'rhythm', value:45, unit:'ms', level:2, bpm:80, hit:95}], 'rhythm-ta')]), 'vibrato', {today:day(2)});
  assert.equal(v.recent[0].text, '비브라토 3.8초 · 1초에 5.5번 · 폭 28 cent · 신호에 맞춤');
  const r = L.skill(db([setRow(day(2), [{area:'rhythm', kind:'rhythm', value:45, unit:'ms', level:2, bpm:80, hit:95}], 'rhythm-ta')]), 'rhythm', {today:day(2)});
  assert.equal(r.recent[0].text, '8분음표·쉼표 80박 · 박자와 45 ms · 95% 맞춤');
});
