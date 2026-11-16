/* 녹음 더보기 (2026-11-16): the ⋯ menu of one recording is built here for every screen — 전체 녹음, 곡 상세 and the other
 * recording lists, the 녹음 재생 page, 곡 확인 — so it has the same items in the same order wherever they apply:
 *   재생 · 정보 수정 · 곡 지정 · 녹음 유형 · 공유 링크 · 보컬 분석 · (screen extras) · 음원 다운로드 · 파일 삭제
 * 곡 지정 is for 곡 녹음 · 레슨 녹음, 공유 링크 for files in the cloud store, 보컬 분석 only when the recording has a song.
 * 파일 삭제 is always last, in the danger colour, and still goes through the screen's own delete (its confirmation and
 * list update are not changed here).
 * The popover opens at the button that was pressed (options.anchor), not at whatever happens to have focus; when the
 * rows fit neither under nor over that button it stays beside it instead of jumping to the top of the screen. */
(() => {
'use strict';
const VZ = window.VZ, M = VZ?.media;
if (!VZ || !M) return;
const esc = VZ.esc;

/** One song for these recordings: pick, confirm, then the caller saves. Resolves the song id ('' = 곡 미지정) or null. */
VZ.pickRecordingSong = async items => {
  const v = await VZ.pickSheet({title:'곡 지정', placeholder:'곡 제목·작품 검색', value:null,
    options:[{value:'', label:'곡 미지정', always:true}, ...VZ.songsNewest().map(s => ({value:s.id, label:s.title, sub:s.show || '', keywords:(s.aliases || []).join(' ')}))]});
  if (v == null) return null;
  const song = VZ.song(v);
  if (!await VZ.confirm('곡 지정', items.length + '개 녹음의 곡을 "' + (song ? VZ.songLabel(song) : '곡 미지정') + '"(으)로 바꿀까요?', {ok:'바꾸기'})) return null;
  return v;
};
/** Save that song on one recording (the title follows the song as everywhere: media-naming.js). */
VZ.saveRecordingSong = (m, v) => { const song = VZ.song(v); return (m.songId || '') === v ? null : M.assignSongSafe(m, {songId:v, song:song ? VZ.songLabel(song) : ''}, {expectedSongId:m.songId || '', expectedSong:m.song || ''}); };

const canAnalyze = item => M.songSearchEligible(item) && !!item.songId && !!VZ.song(item.songId);

/**
 * options: anchor — the ⋯ button; player() — the row's open player, if any; play() — start playing when none is open;
 * remove() — the screen's delete (required); changed() — after an edit made from the menu; analyze() — the screen's
 * way into 보컬 분석; assignSong() — the screen's own song flow (곡 확인); extra — [{key, icon, label, run}] before 다운로드.
 */
VZ.recordingMenu = (item, {anchor, player, play, remove, changed, analyze, assignSong, extra = []} = {}) => {
  const open = player?.() || null, playing = !!open && !open.el.paused;
  const rows = [];
  const add = (key, icon, label, run, attr = '') => rows.push({key, run, html:'<button type="button" class="vz-choice" data-act="' + key + '"' + attr + '><i class="ph ' + icon + '"></i> ' + label + '</button>'});
  if (open || play) add('play', playing ? 'ph-pause' : 'ph-play', playing ? '일시정지' : '재생', () => playing ? open.pause() : open ? open.play() : play());
  add('edit', 'ph-pencil-simple', '정보 수정', () => VZ.editMedia(item), ' data-edit');
  if (M.songSearchEligible(item)) add('song', 'ph-music-notes', '곡 지정', assignSong || (async () => {
    const v = await VZ.pickRecordingSong([item]); if (v == null) return;
    try { await VZ.saveRecordingSong(item, v); M.invalidate?.(); VZ.toast('곡을 바꿨어요: 1개'); changed?.(); }
    catch (e) { VZ.toast('곡을 바꾸지 못했어요: ' + e.message, 'error'); }
  }), ' data-song');
  rows.push({key:'type', html:VZ.recordingType.menuRow([item]).replace('data-recording-type', 'data-act="type" data-recording-type')});
  if (item.r2Key && VZ.shareSheet) add('share', 'ph-link', '공유 링크', () => VZ.shareSheet(item), ' data-share');
  if (canAnalyze(item)) add('analyze', 'ph-chart-line', '보컬 분석', analyze || (() => VZ.openAnalysisSelection([item])), ' data-analyze');
  for (const x of extra) add(x.key, x.icon, esc(x.label), x.run);
  add('download', 'ph-download-simple', '음원 다운로드', () => M.download(item).catch(e => VZ.toast('저장하지 못했어요: ' + e.message, 'error')), ' data-download');
  add('delete', 'ph-trash', '파일 삭제', remove, ' data-delete');
  const menu = VZ.menu({title:'녹음 더보기', label:M.label(item) + ' · 녹음 더보기', anchor, body:'<div class="vz-choice-list vz-media-action-sheet">' + rows.map(r => r.html).join('') + '</div>',
    onMount:(sheet, close) => {
      sheet.classList.add('vz-recording-menu');
      for (const r of rows) if (r.run) sheet.querySelector('[data-act="' + r.key + '"]').onclick = () => { close(); r.run(); };
      VZ.recordingType.bindMenuRow(sheet, close, [item], {anchor, after:changed});
    }});
  beside(menu.el, anchor);
  return menu;
};
/* VZ.menu puts a popover right under its button, or right over it. With all rows visible this one can be too tall for
 * either on a phone; it then went to the top of the screen. Keep it at the button: as low as the screen allows. */
function beside(el, anchor) {
  const r = anchor?.getBoundingClientRect?.(); if (!r || !el?.isConnected) return;
  const height = el.getBoundingClientRect().height;
  if (r.bottom + 8 + height <= innerHeight - 12 || r.top - 8 - height >= 12) return;
  el.style.top = Math.max(12, Math.min(r.bottom + 8, innerHeight - 12 - height)) + 'px';
}
})();
