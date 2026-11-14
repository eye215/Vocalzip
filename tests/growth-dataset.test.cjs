// app/growth-dataset.js — the one place that decides which recordings count for growth and what a take is.
// Node only (pure module). The data set is the one of tests/growth-characterization.spec.cjs, so the numbers below
// are also the list of where today's screens disagree: each rule, and how many of the 37 recordings it treats
// differently. These rules are today's behaviour written down; changing one changes a screen.
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../app/growth-dataset.js');
const G = require('../app/growth-metrics-model.js');
const {MEDIA, DB, v2} = require('./growth-characterization.fixture.cjs');
// The analyser's own check, as the app passes it (app/analysis.js VZ.analysisReliable) — given to the module, never
// written inside it.
const reliable = a => !!a?.metrics?.voicedSeconds && a.metrics.voicedSeconds >= 10 && (a.confidence?.voiceOverMrDb == null || a.confidence.voiceOverMrDb >= 3) && (a.v < 2 || Number(a.confidence?.pitchConfidence) >= .8);
// VZ.media.dateOf with the device in Korea, and VZ.media.recordingCategory, in their words.
const ymd = ms => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
const dateOf = m => /^\d{4}-\d{2}-\d{2}$/.test(m.recordedDate || '') ? m.recordedDate : Number(m.created) > 0 ? ymd(Number(m.created)) : '';
const owner = (() => { const lessons = new Map(), practices = new Map();
  for (const l of DB.lessons) for (const r of l.recordings || []) if (!lessons.has(r.id)) lessons.set(r.id, l);
  for (const p of DB.practices) for (const id of p.mediaIds || []) if (!practices.has(id)) practices.set(id, p);
  return m => lessons.get(m.id) ? {kind:'lesson', lesson:lessons.get(m.id), practice:practices.get(m.id)} : practices.get(m.id) ? {kind:'practice', practice:practices.get(m.id)} : {kind:m.source === 'lesson' ? 'lesson' : 'practice'}; })();
const category = m => ['song', 'lesson', 'training', 'room'].includes(m.recordingCategory) ? m.recordingCategory : m.source === 'practice-room' ? 'room' : owner(m).kind === 'lesson' ? 'lesson'
  : owner(m).practice?.practiceRoom ? 'room' : owner(m).practice?.practiceMode === 'training' ? 'training' : 'song';
const build = (media = MEDIA, db = DB, extra = {}) => D.build(media, db, {reliable, dateOf, owner, category, ...extra});
const ids = rows => rows.map(r => r.id).sort();

test('one row per recording, in list order, with song, date, category, analysis and reliability', () => {
  const ds = build();
  assert.equal(ds.rows.length, 37);
  assert.deepEqual(ds.rows.map(r => r.id), MEDIA.map(m => m.id));
  const a6 = ds.row('a6');
  assert.deepEqual({songId:a6.songId, hasSong:a6.hasSong, date:a6.date, category:a6.category, analysed:a6.analysed, ok:a6.ok, video:a6.video, room:a6.room, training:a6.training},
    {songId:'s1', hasSong:true, date:'2026-11-10', category:'song', analysed:true, ok:true, video:false, room:false, training:false});
  assert.equal(ds.row(MEDIA[0]), ds.rows[0]);                         // by the recording itself or by its id
  // Reliability: the analyser's check (passed in) on a version the growth rules read.
  assert.equal(ds.row('a4').ok, false);                              // pitch confidence 0.3
  assert.equal(ds.row('b5').analysed, true); assert.equal(ds.row('b5').ok, false); assert.equal(ds.row('b5').readable, false);   // v3
  assert.equal(ds.row('a0').ok, true); assert.equal(ds.row('a0').readable, true);                                                 // v1
  assert.equal(ds.row('d1').analysed, false); assert.equal(ds.row('d1').ok, false);
  assert.equal(build(MEDIA, DB, {reliable:() => false}).rows.some(r => r.ok), false);
  assert.throws(() => D.build(MEDIA, DB, {}), /reliable/);
  // Dates, categories and links.
  assert.equal(ds.row('a8').date, ''); assert.equal(ds.row('b4').date, '2026-11-09');
  assert.deepEqual(['la', 'er', 'et', 'ex', 'ey', 't1', 'vc1', 'u1'].map(id => ds.row(id).category), ['lesson', 'room', 'training', 'training', 'room', 'training', 'training', 'song']);
  assert.deepEqual(ids(ds.rows.filter(r => r.room)), ['er']); assert.deepEqual(ids(ds.rows.filter(r => r.training)), ['et', 'vc1', 'vc2', 'vc3']);
  assert.deepEqual(ids(ds.rows.filter(r => r.voiceCheck)), ['vc1', 'vc2', 'vc3']);
  assert.deepEqual(ids(ds.rows.filter(r => r.video)), ['dc', 'dv']); assert.deepEqual(ids(ds.rows.filter(r => r.deleted)), ['g1']);
  assert.deepEqual(ids(ds.rows.filter(r => r.songId && !r.hasSong)), ['f1', 'f2']);
});

test('a take is {id, songId, a, date, created, ok}; a song\'s takes come oldest first by G.takeOrder', () => {
  const ds = build(), a6 = MEDIA.find(m => m.id === 'a6');
  assert.deepEqual(ds.row('a6').take, {id:'a6', songId:'s1', a:a6.analysis, date:'2026-11-10', created:a6.created, ok:true});
  assert.deepEqual(D.take({id:'x', created:5}, null, '', 1), {id:'x', songId:'', a:null, date:'', created:5, ok:true});
  assert.equal(ds.row('a6').take, ds.row('a6').take);                // built once
  const s1 = ds.takes('verdict', 's1');
  // No date first, then by day; the two takes of 10/02 by the time they were saved.
  assert.deepEqual(s1.map(t => t.id), ['a8', 'a0', 'a1', 'a2', 'a3', 'a4', 'la', 'a5', 'a6', 'a7']);
  assert.deepEqual(s1.map(t => t.id), s1.slice().sort(G.takeOrder).map(t => t.id));
  assert.deepEqual([...ds.bySong('verdict').keys()].sort(), ['s1', 's2', 's3', 's4', 's5']);
  assert.deepEqual(ds.bySong('verdict').get('s4').map(r => r.id), ['d1', 'dv', 'dc', 'd2']);   // unanalysed rows are rows too
  assert.deepEqual(ds.takes('verdict', 's4').map(t => t.id), ['dv', 'dc']);                     // …but not takes
  assert.deepEqual(ds.takes('verdict', 'nobody'), []);
});

test('rule "verdict" (전체 · 월별 · 주간 성장 · 계획 결과): 25 of 37 recordings, each exclusion with its reason', () => {
  const ds = build();
  assert.deepEqual(ds.tally('verdict'), {included:25, deleted:1, 'no-song':7, 'song-missing':2, 'practice-room':1, 'training-practice':1});
  assert.deepEqual(ids(ds.pick('verdict')), ['a0', 'a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'b1', 'b2', 'b3', 'b4', 'b5', 'c1', 'c2', 'd1', 'd2', 'dc', 'dv', 'e1', 'e2', 'ex', 'ey', 'la']);
  assert.deepEqual(ds.items('verdict').map(m => m.id), MEDIA.filter(m => ds.pick('verdict').some(r => r.m === m)).map(m => m.id));   // list order kept
  assert.deepEqual(['er', 'et', 'f1', 'u1', 'vc1', 'a1'].map(id => ds.why(ds.row(id), 'verdict')), ['practice-room', 'training-practice', 'song-missing', 'no-song', 'no-song', '']);
  for (const why of Object.keys(ds.tally('verdict'))) if (why !== 'included') assert.ok(D.REASONS[why], why);
  // What this rule lets through on purpose today (only the linked practice record is looked at):
  assert.deepEqual(['ex', 'ey', 'la', 'dv', 'dc', 'a8', 'b5'].map(id => ds.why(ds.row(id), 'verdict')), Array(7).fill(''));
});

test('where the screens differ today, counted on this data set', () => {
  const ds = build(), only = (a, b) => ids(ds.pick(a).filter(r => !ds.pick(b).includes(r)));
  // 1) 연습실 submissions and 트레이닝 practices of a song: out of the verdict screens, in the 보컬 분석 rows and the song card.
  assert.deepEqual(only('songList', 'verdict'), ['er', 'et']);
  // 2) Videos: in the verdict screens, out of the 보컬 분석 rows; the song card keeps the one in the cloud.
  assert.deepEqual(only('verdict', 'songList'), ['dc', 'dv']);
  assert.deepEqual(ids(ds.pick('songList').filter(r => r.video)), []);
  assert.deepEqual(ids(ds.pick('songCard').filter(r => r.video)), ['dc']);
  assert.deepEqual(ds.tally('songList'), {included:25, deleted:1, 'no-song':7, 'song-missing':2, video:2});
  // 3) The song card takes whatever recordings it is handed: a deleted song's too (f1, f2) and ones without a song.
  assert.deepEqual(ds.tally('songCard'), {included:35, deleted:1, video:1});
  // 4) A recording in the deleted list (g1) — no longer a difference (step 2, part B): 주간 요약 always left it out,
  //    now every rule does, with the reason 'deleted' before any other.
  assert.equal(ds.row('g1').deleted, true);
  for (const rule of ['verdict', 'songList', 'songCard']) { assert.equal(ds.why(ds.row('g1'), rule), 'deleted', rule); assert.equal(ds.pick(rule).some(r => r.id === 'g1'), false, rule); }
  assert.deepEqual(ds.takes('verdict', 's2').map(t => t.id), ['b1', 'b2', 'b5', 'b4', 'b3']);
  const kept = build(MEDIA, {...DB, deleted:{}});
  assert.equal(kept.why(kept.row('g1'), 'verdict'), '');                                  // not in the list: an ordinary take
  // 5) No date at all (a8): a row and a take everywhere, but 전체·월별 need a day and the song card puts it first.
  assert.equal(ds.row('a8').take.date, '');
  // 6) A later analysis version (b5): analysed but never reliable; the song card does not draw it as a point.
  assert.deepEqual(ids(ds.pick('verdict').filter(r => r.analysed && !r.readable)), ['b5']);
  // 7) Tagged 트레이닝/연습실 by hand, or a lesson recording, with a song and no such practice (ex, ey, la): song takes.
  assert.deepEqual(ids(ds.pick('verdict').filter(r => r.category !== 'song')), ['ex', 'ey', 'la']);
});

test('forRange (step 2, selection only): song + 보이스 체크 + 트레이닝 + lesson, reliable and dated, each with its group', () => {
  const ds = build(), r = ds.forRange();
  assert.deepEqual(r.counts, {song:17, 'voice-check':3, training:4, lesson:2});
  assert.equal(r.takes.length, 26);
  assert.deepEqual(r.takes.map(t => t.id), r.takes.slice().sort(G.takeOrder).map(t => t.id));          // oldest first
  const group = id => r.takes.find(t => t.id === id)?.group;
  assert.deepEqual(['a6', 'dv', 'vc2', 't1', 'et', 'ex', 'la', 'l2'].map(group), ['song', 'song', 'voice-check', 'training', 'training', 'training', 'lesson', 'lesson']);
  for (const t of r.takes) { assert.equal(t.ok, true); assert.match(t.date, /^\d{4}-\d{2}-\d{2}$/); assert.deepEqual(Object.keys(t), ['id', 'songId', 'a', 'date', 'created', 'ok', 'group']); }
  // Out, with the reason: the imported file without a song, 연습실 recordings, the deleted song's, the deleted-list
  // one, unanalysed, unreliable (low confidence, v3) and the one without a date.
  assert.deepEqual(r.excluded, {unassigned:1, 'practice-room':2, 'song-missing':2, deleted:1, 'no-analysis':2, unreliable:2, 'no-date':1});
  for (const id of ['u1', 'er', 'ey', 'f1', 'f2', 'g1', 'd1', 'd2', 'a4', 'b5', 'a8']) assert.equal(group(id), undefined, id);
  for (const why of Object.keys(r.excluded)) assert.ok(D.REASONS[why], why);
  assert.equal(r.takes.length + Object.values(r.excluded).reduce((a, b) => a + b, 0), 37);               // every recording is accounted for
  // A voice check is known by its mark on the file, by its origin, or by the practice that owns the file.
  const bare = {id:'vx', songId:'', recordedDate:'2026-11-12', created:1, type:'audio/mp4', analysis:v2({into:10})};
  const linked = build([bare], {songs:[], practices:[{id:'voice-check:vx', practiceMode:'training', mediaIds:['vx'], voiceCheck:{mediaId:'vx'}}]}, {owner:undefined, category:undefined});
  assert.deepEqual(linked.forRange().counts, {song:0, 'voice-check':1, training:0, lesson:0});
  assert.equal(build([{...bare, origin:'voice-check'}], {songs:[]}, {owner:undefined, category:undefined}).forRange().takes[0].group, 'voice-check');
  assert.deepEqual(build([bare], {songs:[]}, {owner:undefined, category:undefined}).forRange().excluded, {unassigned:1});
});

test('pure and never stale: nothing is changed, and a new build reads the records as they are now', () => {
  const media = JSON.parse(JSON.stringify(MEDIA)), db = JSON.parse(JSON.stringify(DB)), before = JSON.stringify([media, db]);
  const ds = D.build(media, db, {reliable});                           // the module's own defaults (no app functions)
  ds.pick('verdict'); ds.bySong('songList'); ds.forRange(); ds.rows.forEach(r => [r.ok, r.take, r.category, r.video, r.voiceCheck, r.deleted]);
  assert.equal(JSON.stringify([media, db]), before);
  assert.equal(ds.pick('verdict'), ds.pick('verdict'));               // one pass per rule
  assert.deepEqual(ds.tally('verdict'), {included:25, deleted:1, 'no-song':7, 'song-missing':2, 'practice-room':1, 'training-practice':1});   // same answer with the defaults
  // The same list and the same db object after a song was added in place: a new build sees it (no identity cache here).
  db.songs.push({id:'s6', title:'돌아온 곡'});
  assert.equal(D.build(media, db, {reliable}).tally('verdict').included, 27);
  assert.equal(ds.tally('verdict').included, 25);                     // the old answer stays what it was built from
  // A rule can be given as options too.
  assert.deepEqual(ids(ds.pick({room:true, training:true, video:true})), ids(ds.pick('verdict')).concat(['er', 'et']).sort());
});

test('a recording without a recorded date is dated by the Korea day it was made, on every device (step 2, part B)', () => {
  // 2026-11-08 16:30 UTC is Monday 01:30 in Korea: the 9th, whatever the device's time zone is.
  const made = Date.parse('2026-11-08T16:30:00Z');
  assert.equal(D.dateOf({created:made}), '2026-11-09');
  assert.equal(D.koreaDay(Date.parse('2026-10-31T14:59:59Z')), '2026-10-31');           // 23:59 in Korea
  assert.equal(D.koreaDay(Date.parse('2026-10-31T15:00:00Z')), '2026-11-01');           // 00:00 in Korea: the next month
  assert.equal(D.dateOf({recordedDate:'2026-10-02', created:made}), '2026-10-02');      // the recorded date always wins
  assert.equal(D.dateOf({recordedDate:'', created:0}), ''); assert.equal(D.dateOf({}), ''); assert.equal(D.dateOf(null), '');
  assert.equal(D.dateOf({recordedDate:'어제', created:made}), '2026-11-09');
  // The module's own default (no app functions): the same rule, so b4 has its Korea day and a8 has none.
  const ds = D.build(MEDIA, DB, {reliable});
  assert.equal(ds.row('b4').date, '2026-11-09'); assert.equal(ds.row('a8').date, ''); assert.equal(ds.row('a6').date, '2026-11-10');
  // The answer does not depend on the process time zone.
  const tz = process.env.TZ;
  try { for (const zone of ['UTC', 'America/Los_Angeles', 'Asia/Seoul']) { process.env.TZ = zone; assert.equal(D.dateOf({created:made}), '2026-11-09', zone); } }
  finally { if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz; }
});
