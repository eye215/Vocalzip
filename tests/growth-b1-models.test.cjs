// 성장 개편 안 B, phase 1 — models only, no screen changed:
//  1. ONE take filter for "늘었나" with the 연습 녹음 포함 switch (app/growth-dataset.js verdictRule / ds.verdict);
//  2. 무엇이 달라졌나 takes a period: latest take of the period vs the latest comparable take before it
//     (app/growth-changes-model.js), verdicts of the period only (also app/ear-agreement-model.js);
//  3. tests/growth-characterization.snapshot.json does not move.
// Node only. The data are invented (tests/growth-characterization.fixture.cjs, tests/growth-b1.fixture.cjs).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const D = require('../app/growth-dataset.js');
const C = require('../app/growth-changes-model.js');
const E = require('../app/ear-agreement-model.js');
const CH = require('./growth-characterization.fixture.cjs');
const {take, SONG_TAKES, NOV, v2} = require('./growth-b1.fixture.cjs');

// The analyser's check and the app's date / owner / category, as tests/growth-dataset.test.cjs passes them.
const reliable = a => !!a?.metrics?.voicedSeconds && a.metrics.voicedSeconds >= 10 && (a.confidence?.voiceOverMrDb == null || a.confidence.voiceOverMrDb >= 3) && (a.v < 2 || Number(a.confidence?.pitchConfidence) >= .8);
const ymd = ms => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
const dateOf = m => /^\d{4}-\d{2}-\d{2}$/.test(m.recordedDate || '') ? m.recordedDate : Number(m.created) > 0 ? ymd(Number(m.created)) : '';
const build = () => D.build(CH.MEDIA, CH.DB, {reliable, dateOf});
const ids = rows => rows.map(r => r.id).sort();

test('the snapshot of every 결과 리포트 number is byte-for-byte what it was (phase 3 retook the 곡 tab entries, phase 4 renamed labels only)', () => {
  // Retaken on purpose only (see tests/growth-characterization.spec.cjs); then this hash changes with it.
  // 월별 분석 › 전체 · 곡별 (claude/monthly-by-song, merged with 성장 개편 phase 2) added only the two chip labels
  // (전체 · 곡별) to the 월별 texts; no number moved. Phase 2 itself leaves the file as it is.
  // Phase 3 (곡 tab, 2026-11-19) retook ONLY the 곡 tab's two entries (analysisTab, analysisRows: the song rows now say the
  // shared verdict's word and count the takes of the "늘었나" rule).
  // Phase 4 (연구소 · 연습 화면은 오늘, 2026-11-19) moved no number: labels were renamed to "다음 연습", the 매일 보이스 체크
  // entry line left 지난 흐름, and the 보컬 트레이닝 section of 연구소 (trainingTab) gave way to labStates · practiceNumbers.
  // `numbers` below is the file without the 곡 tab entries, without those three sections and without the label strings
  // listed here (old and new spelling alike): its hash is the one the file had BEFORE phase 4 (worked out from the file
  // at 8664d0c4, where the whole-file hash was 5f3a7388…) — so every other value is byte-for-byte what it was.
  // 오늘의 연습 (2026-11-20) retook ONLY practiceNumbers.practiceSet: the 연습 세트 line became the day's set ("6개 · 약 25분":
  // the built-in groups, what the person set up, 곡에 적용하기 and the optional 녹음); `numbers` leaves that section out, so its hash did not move.
  // 리듬 (2026-11-22, a new built-in group, on by default) made it "7개 · 약 28분": again only that line; `numbers` did not move.
  const file = fs.readFileSync(path.join(__dirname, 'growth-characterization.snapshot.json'));
  const SONG_TAB = ['analysisTab', 'analysisRows'], PHASE4_SECTIONS = ['trainingTab', 'labStates', 'practiceNumbers'];
  const PHASE4_LABELS = new Set(['다음에 연습할 것', '추천 연습', '추천·계획', '다음 연습',
    '실측 변화에 기반한 규칙형 추천입니다. AI 청취 진단이나 의학적 판단이 아니에요.', '실측 변화에 기반해 규칙으로 고른 연습이에요. AI 청취 진단이나 의학적 판단이 아니에요.',
    '매일 보이스 체크', '오늘 아직 · 30초 · 연속 3일']);
  const strip = v => Array.isArray(v) ? v.filter(x => !(typeof x === 'string' && PHASE4_LABELS.has(x))).map(strip) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, strip(x)])) : v;
  const parsed = JSON.parse(file);
  const numbers = JSON.stringify(strip(Object.fromEntries(Object.entries(parsed).map(([zone, v]) => [zone, Object.fromEntries(Object.entries(v).filter(([k]) => !SONG_TAB.includes(k) && !PHASE4_SECTIONS.includes(k)))]))), null, 1);
  assert.equal(crypto.createHash('sha256').update(numbers).digest('hex'), '9c3c42fc22c300ab86a8d79d91e7e14f41423a8e9e71c47eb2a6af72283e8c69');
  // The numbers the removed 보컬 트레이닝 section showed, as they were: the two measured exercises, 연습실 submissions,
  // 보이스 체크 records, the practice set line and the 트레이닝 recordings (newest first) — the same in both time zones.
  for (const zone of Object.keys(parsed)) assert.deepEqual(parsed[zone].practiceNumbers, {
    tips:[['음정 안정성 (롱톤) 연습', '지속음 흔들림 ±11 cent · 최근 8개 중간값 · 권장 8분'], ['음정 정확도 연습', '음정 오차 ±14.5 cent · 최근 8개 중간값 · 권장 10분']],
    roomSubmissions:1, voiceChecks:3, practiceSet:'7개 · 약 28분', trainingTakes:['vc3', 'vc2', 'vc1', 't1', 'et', 'ex', 't2']});
  for (const zone of Object.keys(parsed)) assert.equal(JSON.stringify(parsed[zone]).includes('보컬 연구소'), false);
  assert.equal(crypto.createHash('sha256').update(file).digest('hex'), '493381158365fd547a225324c2535bb8327497d4f936b842ceb79cec15168b34');
});

test('"늘었나" take filter: switch off = 결과 리포트 rule verdict; on = 연습실 · 트레이닝 연습 takes too', () => {
  const ds = build();
  assert.equal(D.verdictRule(), 'verdict');
  assert.equal(D.verdictRule({practice:false}), 'verdict');
  assert.equal(D.verdictRule({practice:'yes'}), 'verdict');            // only true turns it on
  assert.equal(D.verdictRule({practice:true}), 'verdictWithPractice');
  // Off: exactly what 결과 리포트 counts today (same rows, same objects, cached the same way).
  assert.equal(ds.verdict(), ds.pick('verdict'));
  assert.equal(ds.verdict({practice:false}), ds.pick('verdict'));
  assert.deepEqual(ds.verdict().filter(r => r.practiceTake), []);
  // On: the two practice takes of the fixture come in (a 연습실 submission and a 트레이닝 practice), nothing else.
  const on = ds.verdict({practice:true}), off = ds.verdict();
  assert.deepEqual(ids(on.filter(r => !off.includes(r))), ['er', 'et']);
  assert.deepEqual(['er', 'et'].map(id => ds.why(ds.row(id), D.verdictRule({practice:true}))), ['', '']);
  assert.deepEqual(['er', 'et'].map(id => ds.why(ds.row(id), D.verdictRule())), ['practice-room', 'training-practice']);
  // Today the switch ON picks what 보컬 연구소 lists (rule songList): the numbers 연구소 shows now are the "on" numbers.
  assert.deepEqual(ids(on), ids(ds.pick('songList')));
  // Still out with the switch on: deleted, no song, a song that is gone.
  assert.deepEqual(['g1', 'u1', 'f1'].map(id => ds.why(ds.row(id), D.verdictRule({practice:true}))), ['deleted', 'no-song', 'song-missing']);
  // A song's takes with the switch, through the same rule.
  assert.deepEqual(ds.takes(D.verdictRule({practice:true}), 's5').map(t => t.id).filter(id => ['er', 'et'].includes(id)).sort(), ['er', 'et']);
  assert.deepEqual(ds.takes(D.verdictRule(), 's5').map(t => t.id).filter(id => ['er', 'et'].includes(id)), []);
});

test('with a period the pair is the latest take of the period vs the latest comparable take before it', () => {
  const r = C.songChange({songId:'s1', title:'연습곡 하나', takes:SONG_TAKES, period:NOV});
  assert.ok(r.item, JSON.stringify(r.excluded));
  assert.deepEqual([r.item.firstId, r.item.lastId], ['oct2', 'nov2']);
  assert.deepEqual(r.item.period, NOV);
  assert.equal(r.item.count, 2);
  assert.equal(r.item.basis, '같은 곡 연습곡 하나 · 녹음 그대로 잰 녹음 · 지난 기간 마지막 녹음과 이번 기간 녹음 2개 중 마지막 녹음 · 10월 → 11월');
  assert.equal(r.item.changes.find(c => c.id === 'intonation').numbers, '±26 cent → ±12 cent');
  // Without a period: 처음·최근, as before (August vs the latest).
  const all = C.songChange({songId:'s1', title:'연습곡 하나', takes:SONG_TAKES});
  assert.deepEqual([all.item.firstId, all.item.lastId, all.item.count], ['aug', 'nov2', 5]);
  assert.equal(all.item.period, undefined);
  assert.equal(all.item.basis, '같은 곡 연습곡 하나 · 녹음 그대로 잰 녹음 5개 중 처음·최근 · 8월 → 11월');
  assert.deepEqual(C.songChange({songId:'s1', title:'연습곡 하나', takes:SONG_TAKES, period:null}), all);
  // A period without a start is no period.
  assert.deepEqual(C.songChange({songId:'s1', title:'연습곡 하나', takes:SONG_TAKES, period:{to:'2026-11-30'}}), all);
  // October against what came before it; the `to` end is inclusive and may be left open.
  const oct = C.songChange({songId:'s1', title:'T', takes:SONG_TAKES, period:{from:'2026-10-01', to:'2026-10-31'}});
  assert.deepEqual([oct.item.firstId, oct.item.lastId], ['aug', 'oct2']);
  const open = C.songChange({songId:'s1', title:'T', takes:SONG_TAKES, period:{from:'2026-11-15'}});
  assert.deepEqual([open.item.firstId, open.item.lastId], ['nov1', 'nov2']);
});

test('period: nothing in it → not listed; nothing before it → left out with the reason; unreliable → confidence', () => {
  assert.equal(C.songChange({songId:'s1', takes:SONG_TAKES, period:{from:'2026-12-01', to:'2026-12-31'}}), null);
  const first = C.songChange({songId:'s1', title:'T', takes:SONG_TAKES, period:{from:'2026-08-01', to:'2026-08-31'}});
  assert.equal(first.excluded.reason, 'no-previous');
  assert.equal(first.excluded.text, C.NO_PREVIOUS);
  assert.deepEqual(first.excluded.period, {from:'2026-08-01', to:'2026-08-31'});
  const shaky = SONG_TAKES.map(t => t.date >= NOV.from ? {...t, ok:false} : t);
  assert.equal(C.songChange({songId:'s1', takes:shaky, period:NOV}).excluded.reason, 'confidence');
  // The previous period's takes are unreliable: those before them still count as "before the period".
  const prevShaky = SONG_TAKES.map(t => t.date.startsWith('2026-10') ? {...t, ok:false} : t);
  assert.equal(C.songChange({songId:'s1', takes:prevShaky, period:NOV}).item.firstId, 'aug');
});

test('period: same method and version — an earlier take measured the same way, or the mrAlt measurement, else left out', () => {
  // The latest October take was measured with the MR removed: the latest one measured as recorded is used instead.
  const takes = SONG_TAKES.map(t => t.id === 'oct2' ? {...t, a:v2({into:26, mr:true})} : t);
  assert.equal(C.songChange({songId:'s1', takes, period:NOV}).item.firstId, 'oct1');
  // Another analysis version just before the period: the latest of the same version.
  const ver = SONG_TAKES.map(t => t.id === 'oct2' ? {...t, a:{...t.a, v:1}} : t);
  assert.equal(C.songChange({songId:'s1', takes:ver, period:NOV}).item.firstId, 'oct1');
  // Before the period only MR-removed takes; the latest of the period as recorded with a trusted mrAlt: paired through it.
  const ALT = v2({into:14, mr:true});
  const viaAlt = [take('o', '2026-10-20', v2({into:30, mr:true})), take('n', '2026-11-10', {...v2({into:20}), mrAlt:ALT}, {alt:ALT})];
  const r = C.songChange({songId:'s1', title:'T', takes:viaAlt, period:NOV});
  assert.equal(r.item?.viaAlt, 'second');
  assert.equal(r.item.method, 'mrRemoved');
  assert.match(r.item.basis, /\(MR 빼고 따로 잰 결과로 견줌\)/);
  // Without mrAlt: method-mixed, naming the take just before the period.
  const mixed = C.songChange({songId:'s1', title:'T', takes:[viaAlt[0], take('n', '2026-11-10', v2({into:20}))], period:NOV});
  assert.equal(mixed.excluded.reason, 'method-mixed');
  assert.deepEqual(mixed.excluded.remeasure, {id:'n', method:'asRecorded', label:'11월'});
});

const verdict = (id, judgedDate, firstDate, secondDate) => ({id, kind:'listen-verdict', v:1, songId:'s1', firstId:'oct2', secondId:'nov2', firstDate, secondDate,
  firstRange:null, secondRange:null, overall:'second', tags:{}, memo:'', judge:'me', teacher:'', lessonId:'', blind:true, judgedDate, created:1});
const VERDICTS = [verdict('made-now', '2026-11-18', '2026-08-10', '2026-08-20'), verdict('take-now', '2026-12-02', '2026-10-25', '2026-11-15'),
  verdict('old', '2026-09-01', '2026-08-10', '2026-08-30')];

test('a period lists only its verdicts (made in it, or its later take from it); 귀와 숫자 too', () => {
  assert.deepEqual(VERDICTS.map(v => C.verdictInPeriod(v, NOV)), [true, true, false]);
  assert.deepEqual(VERDICTS.map(v => C.verdictInPeriod(v, null)), [true, true, true]);
  const m = C.build({verdicts:VERDICTS, songs:[{songId:'s1', title:'T', takes:SONG_TAKES}], titleOf:() => 'T', period:NOV});
  assert.deepEqual(m.verdicts.map(v => v.id), ['made-now', 'take-now']);
  assert.deepEqual(m.songs.map(s => [s.firstId, s.lastId]), [['oct2', 'nov2']]);
  assert.deepEqual(m.period, NOV);
  const all = C.build({verdicts:VERDICTS, songs:[{songId:'s1', title:'T', takes:SONG_TAKES}], titleOf:() => 'T'});
  assert.deepEqual(all.verdicts.map(v => v.id), ['made-now', 'take-now', 'old']);
  assert.deepEqual(all.songs.map(s => [s.firstId, s.lastId]), [['aug', 'nov2']]);
  assert.equal('period' in all, false);
  const byId = new Map(SONG_TAKES.map(t => [t.id, t]));
  assert.equal(E.build({verdicts:VERDICTS, takeOf:id => byId.get(id) || null, period:NOV}).total, 2);
  assert.equal(E.build({verdicts:VERDICTS, takeOf:id => byId.get(id) || null}).total, 3);
});

test('a period on 같은 과제: the latest result of the period vs the latest comparable result before it', () => {
  const res = (date, v) => ({recordedDate:date, analyzedAt:date + 'T10:00:00Z', context:{task:'sustain', vowel:'a', loudness:'normal'}, metrics:{stability:v}});
  const results = [res('2026-09-01', 9), res('2026-10-20', 7), res('2026-11-05', 6), res('2026-11-12', 5)];
  const compare = (a, b) => ({state:'comparable', metrics:{stability:{state:'measured', before:a.metrics.stability, after:b.metrics.stability, delta:b.metrics.stability - a.metrics.stability}}});
  const api = {compare, labels:{stability:'흔들림'}, groups:[{task:'sustain', title:'편안한 아'}]};
  const p = C.taskChanges(results, api, NOV);
  assert.deepEqual(p.items.map(x => [x.firstDate, x.lastDate]), [['2026-10-20', '2026-11-12']]);
  assert.deepEqual(C.taskChanges(results, api).items.map(x => [x.firstDate, x.lastDate]), [['2026-09-01', '2026-11-12']]);
  assert.deepEqual(C.taskChanges(results, api, {from:'2026-12-01'}), {items:[], excluded:[]});
  assert.equal(C.taskChanges(results, api, {from:'2026-09-01', to:'2026-09-30'}).excluded[0].reason, 'no-previous');
});
