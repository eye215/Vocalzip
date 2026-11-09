/* 보관함: 상단 전체 선택·선택 수·일괄 작업, 행별 선택·더보기. */
(() => {
'use strict';
const VZ = window.VZ, M = VZ?.media;
if (!VZ || !M) return;
VZ.librarySelect = (main, {list, done}) => {
  const host = main.querySelector('[data-l]'), allButton = main.querySelector('[data-lib-select-all]'),
    count = main.querySelector('[data-lib-selected-count]'), bulk = main.querySelector('[data-lib-bulk-more]');
  if (!host || !allButton || !count || !bulk) return;
  const picked = new Map();
  let busy = false;
  const chosen = () => [...picked.values()];
  const mark = root => root.querySelectorAll('[data-media].lib-record').forEach(row => {
    const button = row.querySelector('[data-lib-pick]'); if (!button) return;
    const yes = picked.has(row.dataset.media), span = button.querySelector('span');
    button.setAttribute('aria-pressed', String(yes));
    if (span && span.textContent !== (yes ? '✓' : '')) span.textContent = yes ? '✓' : '';
  });
  const paint = () => {
    const visible = list(), all = visible.length > 0 && visible.every(m => picked.has(String(m.id)));
    allButton.setAttribute('aria-pressed', String(all));
    const box = allButton.querySelector('.lib-check'); if (box && box.textContent !== (all ? '✓' : '')) box.textContent = all ? '✓' : '';
    count.textContent = picked.size + '개 선택'; bulk.disabled = !picked.size || busy; mark(host);
  };
  const watch = new MutationObserver(() => paint());
  watch.observe(host, {childList:true, subtree:true});
  addEventListener('hashchange', () => watch.disconnect(), {once:true});
  allButton.onclick = () => {
    const visible = list(), all = visible.length > 0 && visible.every(m => picked.has(String(m.id)));
    visible.forEach(m => all ? picked.delete(String(m.id)) : picked.set(String(m.id), m)); paint();
  };
  const analyze = items => { if (items.length) VZ.openAnalysisSelection(items); };
  const singleMenu = (item, row) => VZ.sheet({title:'녹음 더보기', body:
    '<div class="vz-choice-list vz-media-action-sheet">' +
    '<button type="button" class="vz-choice" data-edit><i class="ph ph-pencil-simple"></i> 정보 수정</button>' +
    '<button type="button" class="vz-choice" data-download><i class="ph ph-download-simple"></i> 저장</button>' +
    '<button type="button" class="vz-choice" data-analyze><i class="ph ph-chart-line"></i> 보컬 분석</button>' +
    '</div><details class="vz-media-other"><summary>기타 작업</summary><div class="vz-choice-list">' +
    '<button type="button" class="vz-choice" data-compare><i class="ph ph-arrows-left-right"></i> 비교</button>' +
    '<button type="button" class="vz-choice" data-delete><i class="ph ph-trash"></i> 파일 삭제</button></div></details>',
    onMount:(sheet, close) => {
      sheet.querySelector('[data-edit]').onclick = () => { close(); VZ.editMedia(item); };
      sheet.querySelector('[data-download]').onclick = () => { close(); M.download(item).catch(e => VZ.toast('저장하지 못했어요: ' + e.message, 'error')); };
      sheet.querySelector('[data-analyze]').onclick = () => { close(); analyze([item]); };
      sheet.querySelector('[data-compare]').onclick = () => { close(); VZ.nav('#/compare?a=' + encodeURIComponent(item.id) + (item.songId ? '&song=' + encodeURIComponent(item.songId) : '')); };
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
    if (e.target.closest('[data-lib-pick]')) {
      e.preventDefault(); e.stopImmediatePropagation();
      picked.has(row.dataset.media) ? picked.delete(row.dataset.media) : picked.set(row.dataset.media, item); paint();
    } else if (e.target.closest('[data-lib-row-more]')) {
      e.preventDefault(); e.stopImmediatePropagation(); singleMenu(item, row);
    }
  }, true);
  bulk.onclick = () => {
    if (!picked.size) return;
    VZ.sheet({title:'선택한 녹음 ' + picked.size + '개', body:
      '<div class="vz-choice-list vz-media-action-sheet">' +
      '<button type="button" class="vz-choice" data-song><i class="ph ph-music-notes"></i> 곡 지정</button>' +
      '<button type="button" class="vz-choice" data-occ><i class="ph ph-tag"></i> 종류 변경</button></div>',
      onMount:(sheet, close) => {
        sheet.querySelector('[data-song]').onclick = () => { close(); setSong(); };
        sheet.querySelector('[data-occ]').onclick = () => { close(); setKind(); };
      }
    });
  };
  const run = async (label, fn) => {
    const items = chosen(); if (!items.length) return;
    busy = true; paint(); let ok = 0, failed = 0;
    for (const m of items) { try { await fn(m); ok++; } catch { failed++; } }
    busy = false; picked.clear(); paint(); M.invalidate?.(); await done();
    VZ.toast(label + ' ' + ok + '개' + (failed ? ' · ' + failed + '개는 변경하지 못했어요' : ''), failed ? 'error' : undefined);
  };
  async function setSong() {
    const v = await VZ.pickSheet({title:'곡 지정', placeholder:'곡 제목·작품 검색', value:null,
      options:[{value:'', label:'곡 미지정', always:true}, ...VZ.songsNewest().map(s => ({value:s.id, label:s.title, sub:s.show || '', keywords:(s.aliases || []).join(' ')}))]});
    if (v == null) return;
    const song = VZ.song(v);
    if (!await VZ.confirm('곡 지정', picked.size + '개 녹음의 곡을 "' + (song ? VZ.songLabel(song) : '곡 미지정') + '"(으)로 바꿀까요?', {ok:'바꾸기'})) return;
    await run('곡을 바꿨어요:', m => (m.songId || '') === v ? null : M.assignSongSafe(m, {songId:v, song:song ? VZ.songLabel(song) : ''}, {expectedSongId:m.songId || '', expectedSong:m.song || ''}));
  }
  async function setKind() {
    const v = await VZ.pickSheet({title:'종류 바꾸기', value:null, options:M.OCCASIONS.map(([k,t]) => ({value:k, label:t}))});
    if (v == null) return;
    await run('종류를 바꿨어요:', m => M.occasion(m) === v ? null : M.update(m, {occasion:v}));
  }
  paint();
  return {clear:() => { picked.clear(); paint(); }};
};
})();
