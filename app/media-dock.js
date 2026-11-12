/* Shared selection for recording lists. Playback remains inside each row. */
(() => {
  'use strict';
  const VZ = window.VZ, M = VZ?.media;
  if (!VZ?.wireMedia || !M) return;
  const wireAccordion = VZ.wireMedia;
  const selected = new Map();
  let selectionBar = null;
  let songAction = false;

  const visibleSelected = () => {
    for (const [id, entry] of selected) if (!entry.button.isConnected) selected.delete(id);
    return [...selected.values()].map(entry => entry.item);
  };
  const clearSelection = () => {
    for (const entry of selected.values()) {
      entry.button.setAttribute('aria-pressed', 'false');
      entry.row.classList.remove('vz-media-picked');
    }
    selected.clear(); selectionBar?.remove(); selectionBar = null;
    document.body.classList.remove('vz-media-selecting', 'vz-media-has-selection');
  };
  const paintSelection = () => {
    const items = visibleSelected();
    if (!items.length) { selectionBar?.remove(); selectionBar = null; document.body.classList.remove('vz-media-selecting', 'vz-media-has-selection'); return; }
    if (!selectionBar) {
      selectionBar = document.createElement('div');
      selectionBar.className = 'vz-media-selection';
      selectionBar.setAttribute('role', 'toolbar');
      selectionBar.setAttribute('aria-label', '선택한 녹음');
      selectionBar.innerHTML = '<strong data-count></strong><button type="button" data-clear>선택 해제</button><button type="button" data-analysis class="btn sm"><i class="ph ph-sparkle" aria-hidden="true"></i><span>보컬 분석하기</span></button><a data-lab-link hidden href="#/vocal-lab/" aria-label="보컬 연구소에서 녹음 분석과 비교 보기"></a>';
      document.body.append(selectionBar);
      selectionBar.querySelector('[data-clear]').onclick = clearSelection;
      selectionBar.querySelector('[data-lab-link]').onclick = clearSelection;
      selectionBar.querySelector('[data-analysis]').onclick = () => {
        const chosen = visibleSelected();
        if (!chosen.length) return;
        if (VZ.openAnalysisSelection(chosen)) clearSelection();
      };
    }
    document.body.classList.add('vz-media-selecting');
    document.body.classList.toggle('vz-media-has-selection', !!items.length);
    selectionBar.querySelector('[data-count]').textContent = items.length + '개 선택';
    const analysis = selectionBar.querySelector('[data-analysis]');
    const songId = items[0]?.songId;
    const analyzable = !!songId && !!VZ.song(songId) && items.every(item => item.songId === songId);
    analysis.hidden = !analyzable;
    analysis.disabled = !analyzable;
    analysis.title = '';
    const labLink = selectionBar.querySelector('[data-lab-link]');
    labLink.hidden = !songAction || !analyzable;
    if (!labLink.hidden) {
      labLink.href = '#/vocal-lab/' + encodeURIComponent(songId);
      labLink.textContent = '녹음 ' + M.cached().filter(item => item.songId === songId).length + '개 · 분석과 비교 보기';
    }
  };
  const toggleSelected = (row, item, button) => {
    if (selected.has(row.dataset.media)) {
      selected.delete(row.dataset.media);
      button.setAttribute('aria-pressed', 'false'); row.classList.remove('vz-media-picked');
    } else {
      selected.set(row.dataset.media, {item, row, button});
      button.setAttribute('aria-pressed', 'true'); row.classList.add('vz-media-picked');
    }
    paintSelection();
  };

  VZ.wireMedia = (host, items) => {
    if (host.closest('.vz-recording-page, .archive-song')) return wireAccordion(host, items);
    host.classList.add('vz-media-select-enabled');
    const findItem = id => items.find(item => String(item.id) === id);
    const decorate = () => {
      if (document.body.dataset.vzRoute === 'library') return;
      host.querySelectorAll('[data-media]').forEach(row => {
        if (row.querySelector('.vz-media-select')) return;
        const item = findItem(row.dataset.media);
        if (!item) return;
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'vz-media-select';
        button.setAttribute('aria-label', '녹음 선택: ' + M.label(item));
        button.setAttribute('aria-pressed', 'false');
        button.innerHTML = '<i class="ph ph-check" aria-hidden="true"></i>';
        row.append(button);
      });
    };
    decorate();
    if (document.body.dataset.vzRoute !== 'library') new MutationObserver(decorate).observe(host, {childList:true, subtree:true});
    host.addEventListener('click', event => {
      const row = event.target.closest('[data-media]');
      if (!row || !host.contains(row)) return;
      const item = findItem(row.dataset.media);
      if (!item) return;
      const button = row.querySelector('.vz-media-select');
      if (event.target.closest('.vz-media-select')) {
        event.preventDefault(); event.stopImmediatePropagation();
        toggleSelected(row, item, button);
      }
    }, true);
    return wireAccordion(host, items);
  };
  window.addEventListener('hashchange', () => { if (songAction && document.body.dataset.vzRoute === 'song') return; songAction = false; clearSelection(); });
  new MutationObserver(() => { if (selectionBar && selected.size && !visibleSelected().length) paintSelection(); }).observe(document.body, {childList:true, subtree:true});
  VZ.mediaSelection = {
    clear:clearSelection,
    showSongAction:() => { songAction = true; paintSelection(); },
    hideSongAction:() => { songAction = false; clearSelection(); },
    count:host => [...selected.values()].filter(entry => entry.row.isConnected && host.contains(entry.row)).length,
    selectedFor:host => [...selected.values()].filter(entry => entry.row.isConnected && host.contains(entry.row)).map(entry => entry.item),
    selectAll:(host, items, on) => {
      for (const item of items) {
        const row = [...host.querySelectorAll('[data-media]')].find(r => r.dataset.media === String(item.id));
        const button = row?.querySelector('.vz-media-select');
        if (row && button && selected.has(String(item.id)) !== on) toggleSelected(row, item, button);
      }
    }
  };
})();
