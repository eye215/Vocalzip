// Fake data for 단계 (tests/levels.spec.cjs): finished 오늘의 연습 rows with the measures the runner writes, and the
// app booted on a fixed clock with a fake mic and pitch (as tests/daily-set.spec.cjs). No live account, media or network.
const {expect} = require('@playwright/test');
const KEY = 'vocal-zip_mvp_v1', TODAY = '2026-11-20', NOW = '2026-11-20T03:00:00.000Z';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle','in','limit'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const day = n => new Date(Date.UTC(2026, 10, n)).toISOString().slice(0, 10); // November 2026, the n-th
/** 고르기 with 목·어깨 풀기 and 음 따라 부르기 only (호흡 · 발성 · 리듬 · 곡 rest): a set of two steps, one that listens. */
const ONLY_EAR = {id:'daily-set-prefs', kind:'daily-set-prefs', v:1, off:{'loosen-liptrill':true, 'loosen-hum':true, 'loosen-siren':true, 'ear-scale':true}, groupsOff:{breath:true, voice:true, rhythm:true, song:true, 'voice-check':true}, replace:{}};
/**
 * One finished set as app/daily-set-model.js saves it. opts: pitch (notes held of 5; null = no 음정 measure),
 * sd (wobble in cent; null = no 지속음 measure), hold, range ([low, high]; null = none), state of the items, left (an
 * item not done: the set was stopped part-way).
 */
function setRow(date, {pitch = 4, sd = 14, hold = 6, range = [57, 64], state = 'done', left = false, id = date} = {}) {
  const measures = (...m) => { const list = m.filter(Boolean); return list.length ? {measures:list} : {}; };
  const items = [
    {id:'ex-loosen-neck', kind:'exercise', exercise:'loosen-neck', group:'loosen', title:'목·어깨 풀기', state, seconds:165, minutes:2.75, mode:'timed', parts:3},
    {id:'ex-voice-mum', kind:'exercise', exercise:'voice-mum', group:'voice', title:'“멈” 롱톤', state, seconds:40, minutes:.667, mode:'hold', mic:true,
      ...measures(sd == null ? null : {area:'sustain', kind:'longtone', value:sd, unit:'cent', hold, count:3, of:3},
        range ? {area:'range', kind:'comfortable', value:range[1] - range[0], unit:'반음', low:range[0], high:range[1], seconds:2, count:3} : null)},
    {id:'ex-ear-follow', kind:'exercise', exercise:'ear-follow', group:'ear', title:'음 따라 부르기', state:left ? 'left' : state, seconds:left ? 0 : 35, minutes:left ? 0 : .583, mode:'hold', mic:true,
      ...(left ? {} : measures(pitch == null ? null : {area:'pitch', kind:'hold', value:pitch, of:5, unit:'개', hold:4, tolerance:25}))}
  ];
  const minutes = Math.round(items.reduce((n, x) => n + x.minutes, 0) * 1000) / 1000;
  return {id:'practice-set:' + id, date, minutes, manualMinutes:minutes, practiceTimeSource:'practice-set', practiceMode:'training', songId:'', categoryLabel:'오늘의 연습', detail:'오늘의 연습',
    technique:[], memo:'[오늘의 연습]', mediaIds:[], completed:[], assignmentReps:{}, assignmentNotes:{}, practiceSetId:id, dailySet:{v:1, minutes, items}, created:Date.parse(date + 'T10:00:00Z')};
}
const seed = (extra = {}) => ({categories:[], songs:[{id:'s1', title:'This Is the Moment'}, {id:'s2', title:'지금 이 순간'}], lessons:[], assignments:[], practices:[], performances:[], comparisonReports:[], dailyGoals:[],
  practicePlans:[], scoreAnnotations:[], settings:{voiceCheck:{voiceType:'alto', refNote:60, highNote:69, tones:true}}, ...extra});
/** Fake mic, fake pitch (window.__sing Hz, 0 = silence) and silent reference notes. */
function installAudio() {
  window.__mic = {opened:0, stopped:0}; window.__sing = 0;
  const fakeMic = async () => { window.__mic.opened++; return {getTracks:() => [{stop() { window.__mic.stopped++; }}]}; };
  Object.defineProperty(MediaDevices.prototype, 'getUserMedia', {value:fakeMic, configurable:true, writable:true});
  Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {value:fakeMic, configurable:true, writable:true});
  window.AudioContext = window.webkitAudioContext = class {
    sampleRate = 48000; currentTime = 0; destination = {}; state = 'running';
    resume() { return Promise.resolve(); } close() { return Promise.resolve(); }
    createMediaStreamSource() { return {connect() {}, disconnect() {}}; }
    createAnalyser() { return {fftSize:4096, connect() {}, disconnect() {}, getFloatTimeDomainData(data) { const f = window.__sing; for (let i = 0; i < data.length; i++) data[i] = f ? .2 * Math.sin(2 * Math.PI * f * i / 48000) : 0; }}; }
    createGain() { return {gain:{setValueAtTime() {}, linearRampToValueAtTime() {}}, connect() {}, disconnect() {}}; }
    createOscillator() { const o = {frequency:{value:0}, connect(g) { return g; }, start() {}, stop() {}, disconnect() {}}; return o; }
  };
  try { Object.defineProperty(navigator, 'wakeLock', {configurable:true, value:{request:async () => ({release:async () => {}, addEventListener() {}})}}); } catch {}
}
async function boot(page, value = seed(), {time = NOW, hash = '#/home'} = {}) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.clock.install({time:new Date(time)});
  await page.addInitScript(installAudio);
  await page.addInitScript(([key, value]) => { if (!sessionStorage.getItem('lv-seeded')) { localStorage.setItem(key, value); sessionStorage.setItem('lv-seeded', '1'); } }, [KEY, JSON.stringify(value)]);
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.goto('/' + hash);
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => !!window.VZ?.db && typeof window.VZ?.change === 'function' && !!window.VZ.levels && !!window.VZ.dailySet)).toBe(true);
}
/** A record with every state on the 단계 page: 음정 measured from the 1st (past 기준 맞추는 중, step 1 earned), 지속음 from
 * the 12th (9일째), 음역 not measured yet, the other five without an exercise; two badges; points from sets, records,
 * 보이스 체크 and a 레슨 지적 체크 today. */
function rich() {
  const practices = [];
  for (let n = 1; n <= 20; n++) {
    if ([5, 9, 13].includes(n)) continue;
    practices.push(setRow(day(n), {pitch:n % 4 === 0 ? 5 : n % 3 === 0 ? 3 : 4, sd:n >= 12 ? (n % 2 ? 16 : 11) : null, hold:6, range:null, left:n !== 20 && n % 7 === 0}));
  }
  for (const n of [2, 6, 11, 17, 20]) practices.push({id:'voice-check:v' + n, date:day(n), minutes:.5, manualMinutes:.5, practiceTimeSource:'voice-check', practiceMode:'training', songId:'', voiceCheck:{v:1}, created:1});
  for (const n of [3, 8, 15, 20]) practices.push({id:'m' + n, date:day(n), minutes:25, manualMinutes:25, practiceTimeSource:'manual', practiceMode:'song', songId:'s1', created:2});
  return seed({practices,
    practicePlans:[{id:'skill-step:pitch:1', kind:'skill-step', v:1, area:'pitch', step:1, earned:day(15), days:[{date:day(1), value:4, unit:'개'}, {date:day(2), value:4, unit:'개'}, {date:day(3), value:3, unit:'개'}], created:1}],
    scoreAnnotations:[
      {id:'point:a', kind:'score-point', songId:'s1', measures:{from:12, to:14}, text:'12마디 숨 미리 마시기', created:1, updated:1, retired:Date.parse('2026-11-14T03:00:00Z')},
      {id:'point:b', kind:'score-point', songId:'s2', measures:{from:30, to:32}, text:'고음에서 턱 내리기', created:1, updated:1, retired:Date.parse('2026-11-18T03:00:00Z')},
      {id:'point:c', kind:'score-point', songId:'s1', measures:{from:40, to:41}, text:'아직 보는 지적', created:1, updated:1},
      {id:'point-run:r1', kind:'score-point-run', songId:'s1', date:day(20), at:1, results:{'point:a':'kept', 'point:c':'kept', 'point:d':'missed'}}]});
}
module.exports = {KEY, TODAY, NOW, day, ONLY_EAR, setRow, seed, rich, boot};
