/* Shared selection for recording lists. Playback remains inside each row. */
(() => {
  'use strict';
  const VZ = window.VZ, M = VZ?.media;
  if (!VZ?.wireMedia || !M) return;
  const wireAccordion = VZ.wireMedia;
  const selected = new Map();
  let selectionBar = null;

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
    document.body.classList.remove('vz-media-selecting');
  };
  const paintSelection = () => {
    const items = visibleSelected();
    if (!items.length) { selectionBar?.remove(); selectionBar = null; document.body.classList.remove('vz-media-selecting'); return; }
    if (!selectionBar) {
      selectionBar = document.createElement('div');
      selectionBar.className = 'vz-media-selection';
      selectionBar.setAttribute('role', 'toolbar');
      selectionBar.setAttribute('aria-label', '선택한 녹음');
      selectionBar.innerHTML = '<strong data-count></strong><button type="button" data-clear>선택 해제</button><button type="button" data-analysis class="btn sm">보컬 분석하기</button>';
      document.body.append(selectionBar);
      selectionBar.querySelector('[data-clear]').onclick = clearSelection;
      selectionBar.querySelector('[data-analysis]').onclick = () => {
        const chosen = visibleSelected();
        if (!chosen.length) return;
        if (VZ.openAnalysisSelection(chosen)) clearSelection();
      };
    }
    document.body.classList.add('vz-media-selecting');
    selectionBar.querySelector('[data-count]').textContent = items.length + '개 선택';
    const analysis = selectionBar.querySelector('[data-analysis]');
    analysis.disabled = !items.length;
    analysis.title = '';
  };
  const closeAccordions = () => {
    M.stopAll?.();
    document.querySelectorAll('.vz-media-select-enabled .media-open:not([hidden])').forEach(panel => {
      panel.hidden = true;
      panel._player?.destroy(); panel._player = null;
      panel.closest('[data-media]')?.querySelector('[data-toggle]')?.setAttribute('aria-expanded', 'false');
    });
  };
  const toggleSelected = (row, item, button) => {
    if (selected.has(row.dataset.media)) {
      selected.delete(row.dataset.media);
      button.setAttribute('aria-pressed', 'false'); row.classList.remove('vz-media-picked');
    } else {
      if (!selected.size) closeAccordions();
      selected.set(row.dataset.media, {item, row, button});
      button.setAttribute('aria-pressed', 'true'); row.classList.add('vz-media-picked');
    }
    paintSelection();
  };

  VZ.wireMedia = (host, items) => {
    if (host.closest('.vz-recording-page')) return wireAccordion(host, items);
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
      if (event.target.closest('.vz-media-select') || (selected.size && button && event.target.closest('[data-toggle]'))) {
        event.preventDefault(); event.stopImmediatePropagation();
        toggleSelected(row, item, button);
      }
    }, true);
    return wireAccordion(host, items);
  };
  window.addEventListener('hashchange', clearSelection);
  new MutationObserver(() => { if (selectionBar && !visibleSelected().length) paintSelection(); }).observe(document.body, {childList:true, subtree:true});
  VZ.mediaSelection = {
    clear:clearSelection,
    count:host => [...selected.values()].filter(entry => entry.row.isConnected && host.contains(entry.row)).length,
    selectAll:(host, items, on) => {
      for (const item of items) {
        const row = [...host.querySelectorAll('[data-media]')].find(r => r.dataset.media === String(item.id));
        const button = row?.querySelector('.vz-media-select');
        if (row && button && selected.has(String(item.id)) !== on) toggleSelected(row, item, button);
      }
    }
  };
})();
