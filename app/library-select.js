/* 보관함: 상단 전체 선택·선택 수·일괄 작업, 행별 선택·더보기. */
(() => {
'use strict';
const VZ = window.VZ, M = VZ?.media;
if (!VZ || !M) return;
VZ.librarySelect = (main, {list, all = list, done}) => {
  const host = main.querySelector('[data-l]'), start = main.querySelector('[data-select-mode]'),
    left = main.querySelector('.lib-selection-left'), cancel = main.querySelector('[data-lib-select-cancel]'),
    meta = main.querySelector('.lib-selection-meta'), allButton = main.querySelector('[data-lib-select-all]'),
    count = main.querySelector('[data-lib-selected-count]'), total = main.querySelector('[data-lib-total-count]'), bulk = main.querySelector('[data-lib-bulk-more]');
  if (!host || !allButton || !count || !bulk) return;
  const picked = new Map();
  let busy = false, selecting = false;
  // Id sets are built once per drawn list (not once per ticked row): 2,000 ticked rows stay instant.
  const idSet = () => { let of = null, ids = null; return items => { if (items !== of) { of = items; ids = new Set(items.map(m => String(m.id))); } return ids; }; };
  const shownIds = idSet(), allIds = idSet();
  /** Ticked rows the filters show now: every bulk action works on these. A row hidden by a search or filter keeps
   * its tick and comes back with it; only a recording that no longer exists loses it. */
  const activeChosen = () => { const ids = shownIds(list()); return [...picked.values()].filter(m => ids.has(String(m.id))); };
  const activeCount = () => { const ids = shownIds(list()); let n = 0; for (const id of picked.keys()) if (ids.has(id)) n++; return n; };
  const clearOffscreen = () => { const ids = allIds(all()); for (const id of picked.keys()) if (!ids.has(id)) picked.delete(id); };
  const mark = root => root.querySelectorAll('[data-media].lib-record').forEach(row => {
    const button = row.querySelector('[data-lib-pick]'); if (!button) return;
    const yes = picked.has(row.dataset.media), span = button.querySelector('span');
    button.setAttribute('aria-pressed', String(yes));
    if (span && span.textContent !== (yes ? '✓' : '')) span.textContent = yes ? '✓' : '';
  });
  const paint = () => {
    main.classList.toggle('lib-selection-active', selecting);
    start.hidden = selecting; total.hidden = selecting; cancel.hidden = !selecting; left.hidden = !selecting; meta.hidden = !selecting;
    clearOffscreen();
    const visible = list(), all = visible.length > 0 && visible.every(m => picked.has(String(m.id)));
    total.textContent = '총 ' + visible.length + '개';
    allButton.setAttribute('aria-pressed', String(all));
    const box = allButton.querySelector('.lib-check'); if (box && box.textContent !== (all ? '✓' : '')) box.textContent = all ? '✓' : '';
    const n = activeCount();
    count.textContent = n + '개 선택'; bulk.disabled = !n || busy; mark(host);
  };
  const watch = new MutationObserver(() => paint());
  watch.observe(host, {childList:true, subtree:true});
  addEventListener('hashchange', () => watch.disconnect(), {once:true});
  start.onclick = () => { selecting = true; paint(); };
  cancel.onclick = () => { selecting = false; picked.clear(); paint(); };
  allButton.onclick = () => {
    const current = list();
    if (current.length && current.every(m => picked.has(String(m.id)))) current.forEach(m => picked.delete(String(m.id)));
    else current.forEach(m => picked.set(String(m.id),m));
    paint();
  };
  const canAnalyze = items => items.length > 0 && items.every(m=>M.songSearchEligible(m)) && !!items[0].songId && !!VZ.song(items[0].songId) && items.every(m => m.songId === items[0].songId);
  const analyze = items => { if (canAnalyze(items)) VZ.openAnalysisSelection(items); };
  const singleMenu = (item, row) => VZ.menu({title:'녹음 더보기', body:
    '<div class="vz-choice-list vz-media-action-sheet">' +
    '<button type="button" class="vz-choice" data-edit><i class="ph ph-pencil-simple"></i> 정보 수정</button>' +
    '<button type="button" class="vz-choice" data-download><i class="ph ph-download-simple"></i> 음원 다운로드</button>' +
    (VZ.recordingKindButtons?.([item]) || '') +
    (canAnalyze([item]) ? '<button type="button" class="vz-choice" data-analyze><i class="ph ph-chart-line"></i> 보컬 분석</button>' : '<p class="small muted" style="margin:8px 12px">곡을 지정하면 보컬 분석을 할 수 있어요.</p>') +
    '</div><details class="vz-media-other"><summary>기타 작업</summary><div class="vz-choice-list">' +
    '<button type="button" class="vz-choice" data-delete><i class="ph ph-trash"></i> 파일 삭제</button></div></details>',
    onMount:(sheet, close) => {
      sheet.querySelector('[data-edit]').onclick = () => { close(); VZ.editMedia(item); };
      VZ.bindRecordingKind?.(sheet, close, [item], () => done());
      sheet.querySelector('[data-download]').onclick = () => { close(); M.download(item).catch(e => VZ.toast('저장하지 못했어요: ' + e.message, 'error')); };
      sheet.querySelector('[data-analyze]')?.addEventListener('click', () => { close(); analyze([item]); });
      sheet.querySelector('[data-delete]').onclick = async () => {
        close(); try { if (!await M.confirmRemove(item)) return; await M.remove(item); picked.delete(String(item.id)); row.remove(); paint(); await done(); VZ.toast('파일을 삭제했어요.'); }
        catch(e) { VZ.toast('삭제하지 못했어요: ' + e.message, 'error'); }
      };
    }
  });
  host.addEventListener('click', e => {
    const row = e.target.closest('[data-media].lib-record'); if (!row || !host.contains(row)) return;
    const item = list().find(m => String(m.id) === row.dataset.media) || picked.get(row.dataset.media);
    if (!item) return;
    if (e.target.closest('[data-lib-pick]') && selecting) {
      e.preventDefault(); e.stopImmediatePropagation();
      picked.has(row.dataset.media) ? picked.delete(row.dataset.media) : picked.set(row.dataset.media, item); paint();
    } else if (e.target.closest('[data-lib-row-more]')) {
      e.preventDefault(); e.stopImmediatePropagation(); singleMenu(item, row);
    }
  }, true);
  bulk.onclick = () => {
    clearOffscreen(); const items = activeChosen(); if (!items.length) return;
    // 곡 지정 is for 곡 녹음·레슨 녹음: with 트레이닝·연습실 files ticked too, it stays and says how many it applies to.
    const songItems = items.filter(m => M.songSearchEligible(m)), others = items.length - songItems.length;
    VZ.menu({title:'선택한 녹음 ' + items.length + '개', body:
      '<div class="vz-choice-list vz-media-action-sheet">' +
      (songItems.length ? '<button type="button" class="vz-choice" data-song><i class="ph ph-music-notes"></i> 곡 지정' + (others ? ' <span class="small" style="margin-left:auto;font-weight:500;opacity:.75">곡·레슨 녹음 ' + songItems.length + '개만</span>' : '') + '</button>' : '<p class="small muted" data-song-note style="margin:8px 12px">트레이닝·연습실 녹음에는 곡을 지정하지 않아요. 곡 녹음으로 지정하면 곡을 고를 수 있어요.</p>') +
      (VZ.recordingKindButtons?.(items) || '') +
      (canAnalyze(items) ? '<button type="button" class="vz-choice" data-analyze-bulk><i class="ph ph-chart-line"></i> 보컬 분석</button>' : '<p class="small muted" style="margin:8px 12px">같은 곡으로 지정된 녹음만 분석할 수 있어요.</p>') + '</div>',
      onMount:(sheet, close) => {
        sheet.querySelector('[data-song]')?.addEventListener('click',() => { close(); setSong(songItems); });
        VZ.bindRecordingKind?.(sheet, close, items, async () => { picked.clear(); paint(); await done(); });
        sheet.querySelector('[data-analyze-bulk]')?.addEventListener('click', () => { if (!canAnalyze(items)) return; close(); analyze(items); });
      }
    });
  };
  const run = async (label, fn, items) => {
    if (!items.length) return;
    busy = true; paint(); let ok = 0, failed = 0;
    for (const m of items) { try { await fn(m); ok++; } catch { failed++; } }
    busy = false; picked.clear(); paint(); M.invalidate?.(); await done();
    VZ.toast(label + ' ' + ok + '개' + (failed ? ' · ' + failed + '개는 변경하지 못했어요' : ''), failed ? 'error' : undefined);
  };
  async function setSong(items) {
    const v = await VZ.pickSheet({title:'곡 지정', placeholder:'곡 제목·작품 검색', value:null,
      options:[{value:'', label:'곡 미지정', always:true}, ...VZ.songsNewest().map(s => ({value:s.id, label:s.title, sub:s.show || '', keywords:(s.aliases || []).join(' ')}))]});
    if (v == null) return;
    const song = VZ.song(v);
    if (!await VZ.confirm('곡 지정', items.length + '개 녹음의 곡을 "' + (song ? VZ.songLabel(song) : '곡 미지정') + '"(으)로 바꿀까요?', {ok:'바꾸기'})) return;
    await run('곡을 바꿨어요:', m => (m.songId || '') === v ? null : M.assignSongSafe(m, {songId:v, song:song ? VZ.songLabel(song) : ''}, {expectedSongId:m.songId || '', expectedSong:m.song || ''}), items);
  }
  paint();
  return {clear:() => { picked.clear(); paint(); }, refresh:paint};
};
})();
