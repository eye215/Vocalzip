/* 들어 보고 남기는 평가 (listening verdicts) — the human signal the numbers miss: two takes of one song, heard by the
 * singer or the teacher, judged 더 나음 / 비슷함 overall and (optionally) on 소리 길 · 음정 · 호흡 · 소리 크기·힘 · 표현.
 * Pure (no DOM, no storage; also loaded by the Node tests). The screens are app/listen-verdict.js (the sheet) and
 * app/growth-changes-ui.js (결과 리포트 › 무엇이 달라졌나).
 *
 * WHERE IT IS KEPT: a row of the synced `comparisonReports` list with kind 'listen-verdict' — the list 보컬 연구소 already
 * keeps its saved reports in as a separate kind (design guide §16), so every row is merged by id between devices and a
 * deletion is remembered (core.js stamps updatedAt and the tombstone; data-merge.js merges the list). On a deleted
 * recording data-merge clears firstId/secondId, as for every comparison row; the verdict and its dates stay.
 *
 *   {id:'listen:…', kind:'listen-verdict', v:1, songId,
 *    firstId, secondId, firstDate, secondDate      the two takes in recording order (firstDate ≤ secondDate)
 *    firstRange, secondRange                       the section heard on each take {start, end} seconds, null = whole take
 *    overall:'first'|'same'|'second'               which take was better, or 비슷함
 *    tags:{path?, pitch?, breath?, power?, expression?}  the same three choices, only the ones given
 *    memo, judge:'me'|'teacher', teacher (a name typed for lessons — never an account), lessonId,
 *    blind, judgedDate, created}
 *
 * Words: a verdict is quoted as the person's judgement ("…다고 들었어요"); nothing here turns numbers into one. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.VzipListenVerdict = api;
})(typeof self !== 'undefined' ? self : globalThis, () => {
'use strict';
const KIND = 'listen-verdict', VERSION = 1;
const CHOICES = ['first', 'same', 'second'];
/** [key, name, hint]. Every name ends in a consonant, so its topic particle is 은. */
const TAGS = [['path', '소리 길', '편안함·연결'], ['pitch', '음정', ''], ['breath', '호흡', ''], ['power', '소리 크기·힘', ''], ['expression', '표현', '']];
const JUDGES = {me:'나', teacher:'선생님'};
const MEMO_MAX = 500, TEACHER_MAX = 40;
const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const isVerdict = x => !!x && typeof x === 'object' && x.kind === KIND;
/** Takes in recording order: day, then recording time, then id (as app/growth-metrics-model.js takeOrder). */
const order = (x, y) => String(x.date || '').localeCompare(String(y.date || '')) || (Number(x.created) || 0) - (Number(y.created) || 0) || String(x.id || '').localeCompare(String(y.id || ''));
/** The default pair of a song's takes: the earliest and the latest. takes: [{id, date, created}]. */
function defaultPair(takes) {
  const list = (takes || []).filter(t => t && t.id).slice().sort(order);
  return list.length < 2 ? null : [list[0], list.at(-1)];
}
/** The verdicts kept in db, newest judgement first, without the deleted ones. songId / lessonId narrow it. */
function list(db, {songId = null, lessonId = null} = {}) {
  const gone = new Set((db?.deleted?.comparisonReports || []).map(String));
  return (Array.isArray(db?.comparisonReports) ? db.comparisonReports : []).filter(x => isVerdict(x) && !gone.has(String(x.id)) &&
    (songId == null || x.songId === songId) && (lessonId == null || x.lessonId === lessonId))
    .sort((a, b) => String(b.judgedDate || '').localeCompare(String(a.judgedDate || '')) || (Number(b.created) || 0) - (Number(a.created) || 0));
}
const cleanRange = r => {
  if (r == null) return null;
  const start = Number(r.start), end = r.end == null ? null : Number(r.end);
  if (!Number.isFinite(start) || start < 0 || end != null && (!Number.isFinite(end) || end <= start)) throw Error('들을 구간의 시작과 끝을 확인해 주세요.');
  return start === 0 && end == null ? null : {start:Math.round(start * 10) / 10, end:end == null ? null : Math.round(end * 10) / 10};
};
/** A side the person saw (A or B, or 'same') → the choice in recording order. aIsFirst: A is the earlier take. */
const choiceOf = (side, aIsFirst) => side === 'same' ? 'same' : side === 'A' ? (aIsFirst ? 'first' : 'second') : side === 'B' ? (aIsFirst ? 'second' : 'first') : '';
/** …and back: the side a stored choice is on, for the sheet that shows A and B. */
const sideOf = (choice, aIsFirst) => choice === 'same' ? 'same' : choice === 'first' ? (aIsFirst ? 'A' : 'B') : choice === 'second' ? (aIsFirst ? 'B' : 'A') : '';
/**
 * The record to keep. input: {id?, songId, takes:[{id, date, created, range}, {…}] (any order), overall, tags, memo,
 * judge, teacher, lessonId, blind, created?}; choices are in recording order already (first/same/second).
 * Throws an Error with the words to show when something is missing — call it before VZ.change.
 */
function make(input, {now = Date.now(), today = ''} = {}) {
  const i = input || {};
  if (!i.songId) throw Error('곡이 정해지지 않았어요.');
  const takes = (i.takes || []).filter(Boolean);
  if (takes.length !== 2 || !takes[0].id || !takes[1].id) throw Error('녹음 두 개를 골라 주세요.');
  if (takes[0].id === takes[1].id) throw Error('서로 다른 녹음 두 개를 골라 주세요.');
  const [first, second] = takes.slice().sort(order);
  if (!CHOICES.includes(i.overall)) throw Error('전체로 어느 쪽이 나은지 골라 주세요.');
  const tags = {};
  for (const [key] of TAGS) { const c = i.tags?.[key]; if (c == null || c === '') continue; if (!CHOICES.includes(c)) throw Error('자세히 고른 항목을 확인해 주세요.'); tags[key] = c; }
  const judge = i.judge === 'teacher' ? 'teacher' : 'me';
  const memo = String(i.memo || '').trim();
  if (memo.length > MEMO_MAX) throw Error('메모는 ' + MEMO_MAX + '자까지 쓸 수 있어요.');
  const teacher = judge === 'teacher' ? String(i.teacher || '').trim().slice(0, TEACHER_MAX) : '';
  return {id:i.id || 'listen:' + String(now.toString(36)) + Math.random().toString(36).slice(2, 8), kind:KIND, v:VERSION, songId:String(i.songId),
    firstId:String(first.id), secondId:String(second.id), firstDate:isDay(first.date) ? first.date : '', secondDate:isDay(second.date) ? second.date : '',
    firstRange:cleanRange(first.range), secondRange:cleanRange(second.range),
    overall:i.overall, tags, memo, judge, teacher, lessonId:i.lessonId ? String(i.lessonId) : '', blind:i.blind !== false,
    judgedDate:isDay(i.judgedDate) ? i.judgedDate : isDay(today) ? today : '', created:Number(i.created) || now};
}

/* ---------- words ---------- */
const MONTH = d => Number(d.slice(5, 7)) + '월';
const DAY = d => MONTH(d) + ' ' + Number(d.slice(8, 10)) + '일';
/** How to name the two days next to each other: "8월" / "11월", the days when the month is the same, the year when
 * the years differ ("2025년 8월" / "2026년 11월"). */
function dayLabels(a, b) {
  if (!isDay(a) || !isDay(b)) return [isDay(a) ? DAY(a) : '날짜 미상', isDay(b) ? DAY(b) : '날짜 미상'];
  if (a.slice(0, 4) !== b.slice(0, 4)) return [a.slice(0, 4) + '년 ' + MONTH(a), b.slice(0, 4) + '년 ' + MONTH(b)];
  if (a.slice(0, 7) !== b.slice(0, 7)) return [MONTH(a), MONTH(b)];
  if (a !== b) return [DAY(a), DAY(b)];
  return [DAY(a) + ' 처음', DAY(b) + ' 나중'];   // both end in a consonant: 이 / 은 fit
}
/** Who judged: "나", "선생님", "선생님 김지은". */
const who = v => v?.judge === 'teacher' ? '선생님' + (v.teacher ? ' ' + v.teacher : '') : '나';
/** "11월 녹음이 8월 녹음보다 낫다고 들었어요" — the person's judgement, quoted as such. */
function overallText(v) {
  const [l1, l2] = dayLabels(v.firstDate, v.secondDate);
  if (v.overall === 'same') return l1 + ' 녹음과 ' + l2 + ' 녹음이 비슷하다고 들었어요';
  const [better, worse] = v.overall === 'second' ? [l2, l1] : [l1, l2];
  return better + ' 녹음이 ' + worse + ' 녹음보다 낫다고 들었어요';
}
/** "소리 길·호흡은 11월이 나아요 · 음정은 비슷해요" — the tags given, grouped by choice. '' without tags. */
function tagsText(v) {
  const [l1, l2] = dayLabels(v.firstDate, v.secondDate), names = c => TAGS.filter(([k]) => v.tags?.[k] === c).map(([, n]) => n).join('·');
  return [['second', l2 + '이 나아요'], ['first', l1 + '이 나아요'], ['same', '비슷해요']].filter(([c]) => names(c)).map(([c, end]) => names(c) + '은 ' + end).join(' · ');
}
/** The whole line: "선생님 김지은: 11월 녹음이 8월 녹음보다 낫다고 들었어요 · 소리 길은 11월이 나아요". */
const line = v => who(v) + ': ' + overallText(v) + (tagsText(v) ? ' · ' + tagsText(v) : '');
/** The basis: "들어 본 평가 · 8월 → 11월 · 블라인드 · 구간 0:30–1:10 / 0:28–1:05". */
function basisText(v, clock = s => s + '초') {
  const [l1, l2] = dayLabels(v.firstDate, v.secondDate);
  const range = r => r ? clock(r.start) + '–' + (r.end == null ? '끝' : clock(r.end)) : '전체';
  const ranges = v.firstRange || v.secondRange ? ' · 구간 ' + range(v.firstRange) + ' / ' + range(v.secondRange) : '';
  return '들어 본 평가 · ' + l1 + ' → ' + l2 + (v.blind ? ' · 가리고 들음' : '') + ranges;
}
/** 들어 본 평가 모아 보기 (owner, 2026-11-24: 듣고 고르기 결과 모아 보기). Counts the verdicts by which take was heard
 * better: the later one (요즘), 비슷함, or the earlier one (예전). A verdict on two takes of one day counts by recording order. */
function tally(verdicts) {
  const t = {later:0, same:0, earlier:0, n:0};
  for (const v of verdicts || []) {
    if (!isVerdict(v) || !CHOICES.includes(v.overall)) continue;
    t.n++; t[v.overall === 'second' ? 'later' : v.overall === 'first' ? 'earlier' : 'same']++;
  }
  return t;
}
/** "요즘 쪽 5 · 비슷 2 · 예전 쪽 1" ('' with none). */
const tallyText = t => t?.n ? [['later', '요즘 쪽'], ['same', '비슷'], ['earlier', '예전 쪽']].filter(([k]) => t[k]).map(([k, w]) => w + ' ' + t[k]).join(' · ') : '';
/** Which way the ear leans: 'better' (요즘 쪽이 더 많음), 'worse', 'similar' (요즘·예전이 같은 수, or only 비슷함), null with none. */
const earOf = t => !t?.n ? null : t.later > t.earlier ? 'better' : t.earlier > t.later ? 'worse' : 'similar';
const EAR_TEXT = {better:'들어 보면 요즘 녹음이 낫다는 쪽이 많아요', worse:'들어 보면 예전 녹음이 낫다는 쪽이 많아요', similar:'들어 보면 요즘과 예전이 엇비슷해요'};
/** The ear next to the measured direction (app/growth-song-model.js state: better · worse · similar; mixed · hold · one ·
 * none say nothing). Both are quoted as they are; neither overrides the other. '' when there is nothing to set side by side. */
function agreeText(t, state) {
  const ear = earOf(t);
  if (!ear || !['better', 'worse', 'similar'].includes(state)) return '';
  return ear === state ? '측정 숫자도 같은 쪽이에요' : '측정 숫자는 ' + ({better:'좋아진 방향', worse:'아쉬운 방향', similar:'비슷함'})[state] + '이에요 · 귀와 숫자가 달라요';
}
return {KIND, VERSION, CHOICES, TAGS, JUDGES, MEMO_MAX, TEACHER_MAX, isVerdict, order, defaultPair, list, make, choiceOf, sideOf,
  dayLabels, who, overallText, tagsText, line, basisText, tally, tallyText, earOf, EAR_TEXT, agreeText};
});
