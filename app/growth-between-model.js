/* 그 사이에 한 것 — under each pair of 무엇이 달라졌나 (app/growth-changes-ui.js): what was recorded between the two
 * takes' days, from the day after the earlier take to the later take's day (both inclusive of that range). Plain
 * observations only: nothing here says what caused a change ("무엇 때문에 달라졌는지는 알 수 없어요").
 * Pure (no DOM, no storage; also loaded by the Node tests). Read-only: nothing is written or moved.
 *
 *   레슨        db.lessons in the window, not cancelled; their dates, and a short tag the lesson screen shows
 *               (categoryLabel · detail, app/views-lessons.js) or else a short first line of its feedback.
 *   연습        db.practices (VzipPracticeTime.records: one row per id): the days with a practice record, and the minutes
 *               the person entered (VzipPracticeTime.entries / actualMinutes) — never a recording's length. Split into
 *               this song and other practice (트레이닝 counts as other).
 *   숙제·목표    completed db.dailyGoals of those days, and homework sessions (a practice row linked to db.assignments
 *               without a goal, so a goal's own practice row is not counted twice): counts by title, top 3.
 *   녹음        the song's recordings of those days (count only), the pair's own two takes left out.
 * A row whose id is in db.deleted[list] is gone here, as on every growth screen (app/growth-hub.js, practice-review). */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const api = factory(node ? require('./practice-time-model.js') : root.VzipPracticeTime);
  if (node) module.exports = api; else root.VzipGrowthBetween = api;
})(typeof self !== 'undefined' ? self : globalThis, Time => {
'use strict';
const HEAD = '이 사이에 기록된 것 · 무엇 때문에 달라졌는지는 알 수 없어요';
const EMPTY = '이 사이에 기록된 레슨·연습이 없어요';
const SHORT = 24;   // a tag or feedback line longer than this is not quoted (the line stays short)
const TOP = 3;
const isDay = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const gone = (db, list) => new Set((Array.isArray(db?.deleted?.[list]) ? db.deleted[list] : []).map(String));
const live = (db, list, rows = db?.[list]) => { const dead = gone(db, list); return (Array.isArray(rows) ? rows : []).filter(x => x && typeof x === 'object' && !dead.has(String(x.id))); };
const songOf = p => p.practiceMode === 'training' ? '' : p.songId || '';
const lessonSongs = l => [...new Set([...(Array.isArray(l.songIds) ? l.songIds : []), l.songId].filter(Boolean))];
const oneLine = v => String(v ?? '').split('\n').map(s => s.trim()).find(Boolean) || '';
const short = v => { const t = String(v ?? '').trim().replace(/\s+/g, ' '); return t && t.length <= SHORT ? t : ''; };
const dayText = (d, year) => (year ? d.slice(0, 4) + '년 ' : '') + Number(d.slice(5, 7)) + '월 ' + Number(d.slice(8, 10)) + '일';
/** "2시간 10분", "45분", "0분". */
function minutesText(n) {
  const m = Math.round(Math.max(0, Number(n) || 0)), h = Math.floor(m / 60);
  return h ? h + '시간' + (m % 60 ? ' ' + (m % 60) + '분' : '') : m + '분';
}
/** A lesson's short words: its tag, else the first line of its feedback for this song or overall — only when short. */
function lessonLabel(l, songId) {
  const tag = short([l.categoryLabel, l.detail].map(x => String(x ?? '').trim()).filter(Boolean).join(' · '));
  if (tag) return tag;
  return short(oneLine(songId ? l.songFeedback?.[songId] : '')) || short(oneLine(l.feedback));
}

/**
 * db: the app data (lessons, practices, dailyGoals, assignments, deleted). songId: the pair's song. from / to: the two
 * takes' days (either order). recordings: [{id, songId, date}] of the media list (the screen leaves out deleted ones;
 * db.deleted.media is checked again). exclude: the pair's take ids.
 * → null when the window has no day (a date missing, or the same day); else
 *   {from, to, empty, lessons:[{id, date, label, thisSong}], practice:{days, minutes, song:{days, minutes},
 *    other:{days, minutes}}, done:{count, top:[{title, count}], more}, recordings}.
 */
function between(db, {songId = '', from = '', to = '', recordings = [], exclude = []} = {}) {
  if (!isDay(from) || !isDay(to) || from === to) return null;
  if (from > to) [from, to] = [to, from];
  const inside = d => isDay(d) && d > from && d <= to;
  const lessons = live(db, 'lessons').filter(l => inside(l.date) && (l.status || 'done') !== 'cancelled')
    .sort((a, b) => a.date.localeCompare(b.date) || String(a.startTime || '').localeCompare(String(b.startTime || '')))
    .map(l => ({id:String(l.id ?? ''), date:l.date, label:lessonLabel(l, songId), thisSong:!!songId && lessonSongs(l).includes(songId)}));
  // Practice: one row per id (the newer one), not deleted, not a demo of 노래 연습실.
  const rows = Time.records(live(db, 'practices')).filter(p => inside(p.date) && !p.practiceRoom?.demo);
  const part = list => ({days:new Set(list.map(p => p.date)).size,
    minutes:Time.entries(list).reduce((n, e) => n + e.minutes, 0)});
  const mine = rows.filter(p => songId && songOf(p) === songId), others = rows.filter(p => !songId || songOf(p) !== songId);
  const practice = {...part(rows), song:part(mine), other:part(others)};
  // 숙제·목표 done: completed daily goals, and homework sessions not made by a goal.
  const counts = new Map(), add = title => { const t = String(title ?? '').trim().replace(/\s+/g, ' '); if (t) counts.set(t, (counts.get(t) || 0) + 1); };
  for (const g of live(db, 'dailyGoals')) if (g.completed === true && inside(g.date)) add(g.title);
  const tasks = new Map(live(db, 'assignments').map(t => [String(t.id), t]));
  for (const p of rows) if (!p.goalId && Array.isArray(p.completed)) for (const id of new Set(p.completed)) { const t = tasks.get(String(id)); if (t) add(t.title); }
  const ranked = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([title, count]) => ({title, count}));
  const done = {count:ranked.reduce((n, x) => n + x.count, 0), top:ranked.slice(0, TOP), more:Math.max(0, ranked.length - TOP)};
  const skip = new Set([...exclude, ...gone(db, 'media')].map(String));
  const takes = new Set((Array.isArray(recordings) ? recordings : []).filter(m => m && songId && m.songId === songId && inside(m.date) && !skip.has(String(m.id))).map(m => String(m.id))).size;
  return {from, to, lessons, practice, done, recordings:takes, empty:!lessons.length && !rows.length && !done.count && !takes};
}

/** The words of the line: {summary, range, rows:[{key, text}], empty}. */
function lines(r) {
  if (!r) return null;
  const year = r.from.slice(0, 4) !== r.to.slice(0, 4);
  const range = dayText(r.from, year) + ' 다음 날부터 ' + dayText(r.to, year) + '까지';
  if (r.empty) return {summary:'기록 없음', range, rows:[], empty:EMPTY};
  const out = [], sum = [];
  if (r.lessons.length) {
    sum.push('레슨 ' + r.lessons.length + '번');
    out.push({key:'lessons', text:'레슨 ' + r.lessons.length + '번 · ' + r.lessons.map(l => dayText(l.date) + (l.label ? ' (' + l.label + ')' : '')).join(', ')});
  }
  const p = r.practice;
  if (p.days) {
    sum.push('연습 ' + p.days + '일');
    const side = (name, x) => name + ' ' + x.days + '일' + (x.minutes ? ' · ' + minutesText(x.minutes) : '');
    out.push({key:'practice', text:'연습 기록 ' + p.days + '일 · ' + (p.minutes ? '적은 시간 ' + minutesText(p.minutes) : '적은 시간 없음') +
      (p.song.days || p.other.days ? ' (' + [p.song.days ? side('이 곡', p.song) : '', p.other.days ? side('다른 연습', p.other) : ''].filter(Boolean).join(', ') + ')' : '')});
  }
  if (r.done.count) {
    sum.push('숙제·목표 ' + r.done.count + '번');
    out.push({key:'done', text:'한 숙제·목표 ' + r.done.count + '번 · ' + r.done.top.map(x => x.title + ' ' + x.count + '번').join(', ') + (r.done.more ? ' 외 ' + r.done.more + '가지' : '')});
  }
  if (r.recordings) { sum.push('녹음 ' + r.recordings + '개'); out.push({key:'recordings', text:'이 곡 녹음 ' + r.recordings + '개 (비교한 두 녹음 빼고)'}); }
  if (!r.lessons.length && !p.days) out.unshift({key:'none', text:EMPTY});
  return {summary:sum.join(' · '), range, rows:out, empty:''};
}
return {HEAD, EMPTY, between, lines, minutesText, lessonLabel};
});
