/* VOCAL.zip: practice records made automatically when a file was imported (importedFrom, exactly that one file)
 * follow the file. Its day or song changed → the record moves with it (calendar, growth, song page agree).
 * Its kind became 공연·레슨 → the user is asked whether to take the record out of practice time (removed only on OK).
 * Records the user made or that hold several files are never touched. Files edited before this existed are lined
 * up once after start; the question is asked once per file. */
(() => {
'use strict';
const VZ = window.VZ, M = VZ?.media;
if (!VZ || !M) return;
const ASKED = 'vzip_follow_asked_v1';
const auto = (d, id) => (d.practices || []).filter(p => p.importedFrom && (p.mediaIds || []).length === 1 && p.mediaIds[0] === id);
const asked = () => { try { return new Set(JSON.parse(localStorage.getItem(ASKED) || '[]')); } catch { return new Set(); } };
const remember = ids => { try { const s = asked(); ids.forEach(i => s.add(i)); localStorage.setItem(ASKED, JSON.stringify([...s].slice(-2000))); } catch {} };

/** Move/re-song the auto records of these files; returns the files whose kind is no longer 연습. */
function follow(files) {
  const moves = [], notPractice = [];
  for (const f of files) {
    for (const p of auto(VZ.db, f.id)) {
      const date = f.date && f.date !== p.date ? f.date : null;
      const song = f.songId != null && f.songId !== (p.songId || '') ? f.songId : null;
      if (date || song != null) moves.push({id:p.id, date, song});
      if (f.occasion && f.occasion !== 'practice') notPractice.push(f.id);
    }
  }
  if (moves.length) VZ.change(d => { for (const m of moves) { const p = d.practices.find(x => x.id === m.id); if (!p) continue; if (m.date) p.date = m.date; if (m.song != null) { p.songId = m.song; p.confirmedSongId = m.song; } } }, {silent:true});
  return notPractice;
}
let pending = [];
async function askRemove(ids) {
  const fresh = [...new Set(ids)].filter(id => !asked().has(id) && auto(VZ.db, id).length);
  if (!fresh.length) return;
  remember(fresh);
  const records = fresh.flatMap(id => auto(VZ.db, id)), minutes = records.reduce((a, p) => a + VZ.practiceMinutes(p), 0);
  const ok = await VZ.confirm('연습 기록도 정리할까요?', '공연·레슨으로 바꾼 녹음 ' + fresh.length + '개에, 파일을 가져올 때 자동으로 만든 연습 기록 ' + records.length + '개(' + VZ.minutes(minutes) + ')가 남아 있어요.\n\n연습 시간에서 빼고 이 자동 기록만 지울까요? 녹음 파일은 그대로예요.', {ok:'연습 기록 지우기'});
  if (!ok) return;
  const gone = new Set(records.map(p => p.id));
  if (VZ.change(d => { d.practices = d.practices.filter(p => !gone.has(p.id)); }, {silent:true})) VZ.toast('자동 연습 기록 ' + gone.size + '개를 정리했어요.');
  VZ.softRender?.();
}
const askSoon = ids => { pending.push(...ids); clearTimeout(askSoon.t); askSoon.t = setTimeout(() => { const ids = pending; pending = []; askRemove(ids); }, 600); };

// Any edit of a file (info sheet, 선택 모드, AI song, date fix) carries its changes.
window.addEventListener('vzip:media-updated', e => {
  const {id, changes} = e.detail || {}; if (!id || !changes || !auto(VZ.db, id).length) return;
  const date = changes.recordedDate || (changes.created ? VZ.ymd(new Date(changes.created)) : null);
  const not = follow([{id, date, songId:'songId' in changes ? changes.songId || '' : null, occasion:changes.occasion}]);
  if (not.length) askSoon(not);
  VZ.softRender?.();
});
// Files changed before this existed: line them up once the list is loaded.
setTimeout(async () => {
  if (!VZ.db.practices?.some(p => p.importedFrom && (p.mediaIds || []).length === 1)) return;
  const media = await M.list().catch(() => null); if (!media) return;
  const byId = new Map(media.map(m => [m.id, m]));
  const files = [...new Set(VZ.db.practices.filter(p => p.importedFrom && (p.mediaIds || []).length === 1).map(p => p.mediaIds[0]))]
    .map(id => byId.get(id)).filter(Boolean).map(m => ({id:m.id, date:M.dateOf(m) || null, songId:m.songId ? m.songId : null, occasion:M.occasion(m)}));
  const not = follow(files);
  if (not.length) askSoon(not);
  VZ.softRender?.();
}, 2500);
})();
