/* 녹음 분류 직접 지정 (2026-11-12): next to 곡 지정, a recording or a selection can be marked 레슨 녹음 or 트레이닝,
 * or put back to 곡 녹음, from 보관함 / 곡 상세 / 곡 확인 menus. (app/recording-kind.js only suggests; this applies.)
 * 레슨 녹음 also offers to link the file to that day's lesson when exactly one lesson is on its date; nothing is linked
 * without that confirmation. Song links, files and dates are not changed here. */
(() => {
'use strict';
const VZ = window.VZ, M = VZ?.media;
if (!VZ || !M) return;
const KINDS = {lesson:['레슨 녹음으로 지정', 'ph-chalkboard-teacher', '레슨 녹음'], training:['트레이닝으로 지정', 'ph-barbell', '트레이닝'], song:['곡 녹음으로 지정', 'ph-music-notes-simple', '곡 녹음']};

/** Menu buttons for these recordings: only kinds that would change something. 곡 녹음 appears only to undo. */
VZ.recordingKindButtons = items => {
  const now = items.map(m => M.recordingCategory(m));
  return ['lesson', 'training', 'song'].filter(k => now.some(c => c !== k) && (k !== 'song' || now.some(c => c === 'lesson' || c === 'training')))
    .map(k => '<button type="button" class="vz-choice" data-kind="' + k + '"><i class="ph ' + KINDS[k][1] + '"></i> ' + KINDS[k][0] + '</button>').join('');
};
/** Wire [data-kind] buttons in a menu: close it, apply, then after(). */
VZ.bindRecordingKind = (sheet, close, items, after) => sheet.querySelectorAll('[data-kind]').forEach(b => b.onclick = async () => {
  close(); await VZ.setRecordingKind(items, b.dataset.kind); after?.();
});

const cancelled = l => l.status === 'cancelled' || l.status === 'canceled';
const linked = id => (VZ.db.lessons || []).some(l => (l.recordings || []).some(r => r.id === id));

VZ.setRecordingKind = async (items, kind) => {
  if (!KINDS[kind] || !items.length) return;
  let ok = 0, failed = 0;
  for (const m of items) {
    if (M.recordingCategory(m) === kind && (kind !== 'lesson' || m.occasion === 'lesson' || m.occasion === 'performance')) { ok++; continue; }
    // Keep the 레슨/연습 label shown in lists in step with the purpose; a 공연 label chosen by the user stays.
    const changes = {recordingCategory:kind};
    if (kind === 'lesson' && m.occasion !== 'performance') changes.occasion = 'lesson';
    if (kind !== 'lesson' && m.occasion === 'lesson') changes.occasion = 'practice';
    try { await M.update(m, changes, {quiet:true}); Object.assign(m, changes); ok++; window.dispatchEvent(new CustomEvent('vzip:media-updated', {detail:{id:m.id, changes}})); }
    catch { failed++; }
  }
  M.invalidate?.();
  VZ.toast(KINDS[kind][2] + '(으)로 지정했어요: ' + ok + '개' + (failed ? ' · ' + failed + '개는 바꾸지 못했어요' : ''), failed ? 'error' : undefined);
  if (kind !== 'lesson') return;
  const links = items.filter(m => !linked(m.id)).map(m => ({m, lessons:(VZ.db.lessons || []).filter(l => l.date === M.dateOf(m) && !cancelled(l))})).filter(x => x.lessons.length === 1);
  if (!links.length) return;
  const lessons = [...new Map(links.map(x => [x.lessons[0].id, x.lessons[0]])).values()];
  const what = lessons.length === 1 ? VZ.dateLabel(lessons[0].date) + (lessons[0].startTime ? ' ' + lessons[0].startTime : '') + ' 레슨' : '각 날짜의 레슨 ' + lessons.length + '개';
  if (!await VZ.confirm('레슨에 연결', links.length + '개 녹음을 같은 날 ' + what + '에 연결할까요? 레슨 화면에서 바로 들을 수 있어요.', {ok:'연결'})) return;
  if (VZ.change(d => { for (const {m, lessons:[lesson]} of links) { const l = d.lessons.find(x => x.id === lesson.id); if (l && !(l.recordings || []).some(r => r.id === m.id)) { l.recordings ||= []; l.recordings.push({id:m.id, note:''}); } } }))
    VZ.toast('레슨에 ' + links.length + '개 녹음을 연결했어요.');
};
})();
