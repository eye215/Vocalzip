/* 녹음 유형 (2026-11-16): the one classification of a recording the user sees — 곡 녹음 · 레슨 녹음 · 트레이닝 · 연습실 —
 * written with the same words in the 전체 녹음 tabs, the rows, 정보 수정, 가져오기, 곡 확인 and the ⋯ menus.
 * 공연 is a tag on a recording, not a fifth type. Nothing new is stored:
 *   유형 = VZ.media.recordingCategory(item) — `recordingCategory` when the user chose one, else where the file came
 *          from or is linked (practice room, lesson, training practice), else 곡 녹음.
 *   공연 = `occasion` 'performance'.
 * Choosing a type writes `recordingCategory` and keeps `occasion` (read by the calendar, practice time and the export)
 * in step: 레슨 녹음 ↔ 'lesson', any other type ↔ 'practice'; a 공연 tag stays until the user takes it off.
 * 레슨 녹음 also offers to link the file to that day's lesson when exactly one lesson is on its date; nothing is linked
 * without that confirmation. Song links, files, titles and dates are not changed here.
 * (app/recording-kind.js only suggests a type; this applies it.) */
(() => {
'use strict';
const VZ = window.VZ, M = VZ?.media;
if (!VZ || !M) return;
const ICONS = {song:'ph-music-notes-simple', lesson:'ph-chalkboard-teacher', training:'ph-barbell', room:'ph-microphone-stage'};
const name = kind => M.recordingTypeName(kind);
const T = VZ.recordingType = {};

/** Types the user can give these recordings. 연습실 is made by 노래 연습실 only: it is listed while one of them is one. */
T.kinds = items => ['song', 'lesson', 'training', 'room'].filter(k => k !== 'room' || items.some(m => M.recordingCategory(m) === 'room'));
/** The one type all of them have ('' when they differ), and whether all carry the 공연 tag. */
T.shared = items => { const kinds = new Set(items.map(m => M.recordingCategory(m))); return {kind:kinds.size === 1 ? [...kinds][0] : '', performance:items.length > 0 && items.every(M.isPerformance)}; };

const occasionFor = (item, kind, performance) => performance ? 'performance' : kind === 'lesson' ? 'lesson' : item.occasion === 'lesson' || item.occasion === 'performance' ? 'practice' : item.occasion;
/** Stored fields to write so that this recording reads as `kind` (with or without the 공연 tag). {} when nothing was
 * changed — an edit of something else never touches the type. A type the user picks is written as their choice; a
 * tag-only change writes `recordingCategory` only when the type would otherwise move. */
T.changes = (item, kind, performance = M.isPerformance(item)) => {
  const chosen = kind !== M.recordingCategory(item);
  if (!chosen && performance === M.isPerformance(item)) return {};
  const out = {}, occasion = occasionFor(item, kind, performance);
  if (occasion !== item.occasion) out.occasion = occasion;
  if (chosen || M.recordingCategory({...item, ...out}) !== kind) out.recordingCategory = kind;
  return out;
};

/** 가져오기: a new file carries only `occasion` to the cloud, so these are the types it can be given there —
 * [occasion, words]. 트레이닝 is chosen after the import (⋯ › 녹음 유형, or the suggestion in 곡 확인). */
T.importChoices = () => [['practice', name('song')], ['lesson', name('lesson')], ['performance', name('song') + ' · 공연']];

const cancelled = l => l.status === 'cancelled' || l.status === 'canceled';
const linked = id => (VZ.db.lessons || []).some(l => (l.recordings || []).some(r => r.id === id));
/** 레슨 녹음: offer to link each file to the one lesson on its day. Asks first; resolves true when linked. */
T.offerLessonLink = async items => {
  const links = items.filter(m => !linked(m.id)).map(m => ({m, lessons:(VZ.db.lessons || []).filter(l => l.date === M.dateOf(m) && !cancelled(l))})).filter(x => x.lessons.length === 1);
  if (!links.length) return false;
  const lessons = [...new Map(links.map(x => [x.lessons[0].id, x.lessons[0]])).values()];
  const what = lessons.length === 1 ? VZ.dateLabel(lessons[0].date) + (lessons[0].startTime ? ' ' + lessons[0].startTime : '') + ' 레슨' : '각 날짜의 레슨 ' + lessons.length + '개';
  if (!await VZ.confirm('레슨에 연결', links.length + '개 녹음을 같은 날 ' + what + '에 연결할까요? 레슨 화면에서 바로 들을 수 있어요.', {ok:'연결'})) return false;
  if (!VZ.change(d => { for (const {m, lessons:[lesson]} of links) { const l = d.lessons.find(x => x.id === lesson.id); if (l && !(l.recordings || []).some(r => r.id === m.id)) { l.recordings ||= []; l.recordings.push({id:m.id, note:''}); } } })) return false;
  VZ.toast('레슨에 ' + links.length + '개 녹음을 연결했어요.');
  return true;
};

const save = async (items, changesOf) => {
  let ok = 0, failed = 0;
  for (const m of items) {
    const changes = changesOf(m);
    if (!Object.keys(changes).length) { ok++; continue; }
    try { await M.update(m, changes, {quiet:true}); Object.assign(m, changes); ok++; window.dispatchEvent(new CustomEvent('vzip:media-updated', {detail:{id:m.id, changes}})); }
    catch { failed++; }
  }
  M.invalidate?.();
  return {ok, failed};
};
/** Give these recordings a type. 레슨 녹음 then offers the lesson link. */
VZ.setRecordingKind = T.set = async (items, kind) => {
  if (!ICONS[kind] || !items.length) return;
  const {ok, failed} = await save(items, m => {
    const changes = T.changes(m, kind);
    // Already 레슨 녹음 by its link or source, but the label kept for the calendar says otherwise: bring it along.
    return !Object.keys(changes).length && kind === 'lesson' && m.occasion !== 'lesson' && m.occasion !== 'performance' ? {recordingCategory:kind, occasion:'lesson'} : changes;
  });
  VZ.toast('녹음 유형을 ' + name(kind) + '(으)로 바꿨어요: ' + ok + '개' + (failed ? ' · ' + failed + '개는 바꾸지 못했어요' : ''), failed ? 'error' : undefined);
  if (kind === 'lesson') await T.offerLessonLink(items);
};
/** Put the 공연 tag on these recordings, or take it off. Their type stays. */
T.setPerformance = async (items, on) => {
  if (!items.length) return;
  const {ok, failed} = await save(items, m => T.changes(m, M.recordingCategory(m), on));
  VZ.toast((on ? '공연 녹음으로 표시했어요: ' : '공연 표시를 뺐어요: ') + ok + '개' + (failed ? ' · ' + failed + '개는 바꾸지 못했어요' : ''), failed ? 'error' : undefined);
};

/** The 녹음 유형 row of a ⋯ menu: the current type on the right, opens the choices. */
T.menuRow = items => { const {kind, performance} = T.shared(items); return '<button type="button" class="vz-choice" data-recording-type><i class="ph ph-tag"></i> 녹음 유형<span class="vz-choice-value">' + (kind ? name(kind) + (performance ? ' · 공연' : '') : '여러 유형') + '</span></button>'; };
T.bindMenuRow = (sheet, close, items, {anchor, after} = {}) => { const row = sheet.querySelector('[data-recording-type]'); if (row) row.onclick = () => { close(); T.choose(items, {anchor, after}); }; };
/** The choices, in the same dark popover at the same button: the types (✓ on the current one) and the 공연 tag. */
T.choose = (items, {anchor, after} = {}) => {
  const {kind, performance} = T.shared(items), check = '<i class="ph ph-check" aria-hidden="true"></i>';
  VZ.menu({title:'녹음 유형', anchor, body:'<div class="vz-choice-list vz-recording-type-menu" role="group" aria-label="녹음 유형">' +
    T.kinds(items).map(k => '<button type="button" class="vz-choice" data-kind="' + k + '" aria-pressed="' + (k === kind) + '"><i class="ph ' + ICONS[k] + '"></i> ' + name(k) + (k === kind ? check : '') + '</button>').join('') +
    '<button type="button" class="vz-choice" data-performance aria-pressed="' + performance + '"><i class="ph ph-star"></i> 공연 녹음' + (performance ? check : '') + '</button></div>',
    onMount:(sheet, close) => {
      sheet.querySelectorAll('[data-kind]').forEach(b => b.onclick = async () => { close(); if (b.dataset.kind !== kind) { await T.set(items, b.dataset.kind); after?.(); } });
      sheet.querySelector('[data-performance]').onclick = async () => { close(); await T.setPerformance(items, !performance); after?.(); };
    }});
};
})();
