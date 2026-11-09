/* Shared recording list selection and bottom player. */
(() => {
  'use strict';
  const VZ = window.VZ, M = VZ?.media;
  if (!VZ?.wireMedia || !M) return;
  const legacyWire = VZ.wireMedia;
  const selected = new Map();
  let dock = null, player = null, activeRow = null, activeItem = null, selectionBar = null;

  const visibleSelected = () => {
    for (const [id, entry] of selected) if (!entry.button.isConnected) selected.delete(id);
    return [...selected.values()].map(entry => entry.item);
  };
  const close = () => {
    player?.destroy(); player = null;
    dock?.remove(); dock = null;
    activeRow?.classList.remove('vz-media-active');
    activeRow?.querySelector('[data-toggle]')?.setAttribute('aria-expanded', 'false');
    activeRow = activeItem = null;
    document.body.classList.remove('vz-media-dock-open');
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
      selectionBar.innerHTML = '<strong data-count></strong><button type="button" data-clear>선택 해제</button><button type="button" data-analysis class="btn sm">보컬 분석</button>';
      document.body.append(selectionBar);
      selectionBar.querySelector('[data-clear]').onclick = clearSelection;
      selectionBar.querySelector('[data-analysis]').onclick = () => {
        const chosen = visibleSelected();
        if (chosen.length !== 1) return;
        const id = chosen[0].id;
        clearSelection(); close(); VZ.nav('#/analysis/' + encodeURIComponent(id));
      };
    }
    document.body.classList.add('vz-media-selecting');
    selectionBar.querySelector('[data-count]').textContent = items.length + '개 선택';
    const analysis = selectionBar.querySelector('[data-analysis]');
    analysis.disabled = items.length !== 1;
    analysis.title = items.length === 1 ? '' : '보컬 분석은 녹음 1개를 선택해 주세요';
  };
  const open = (item, row) => {
    close();
    activeItem = item; activeRow = row;
    row.classList.add('vz-media-active');
    row.querySelector('[data-toggle]')?.setAttribute('aria-expanded', 'true');
    dock = document.createElement('section');
    dock.className = 'vz-media-dock';
    dock.setAttribute('aria-label', '녹음 플레이어');
    dock.innerHTML = '<div class="vz-media-dock-head"><strong></strong><button type="button" data-more aria-label="녹음 더보기" aria-expanded="false"><i class="ph ph-dots-three"></i></button><button type="button" data-close aria-label="플레이어 닫기"><i class="ph ph-x"></i></button></div>' +
      '<div data-player></div><div class="vz-media-dock-menu" data-menu hidden><button type="button" data-edit><i class="ph ph-pencil-simple"></i>정보 수정</button><button type="button" data-download><i class="ph ph-download-simple"></i>저장</button><button type="button" data-analyze><i class="ph ph-chart-line"></i>보컬 분석</button></div>';
    dock.querySelector('strong').textContent = M.label(item);
    document.body.append(dock);
    document.body.classList.add('vz-media-dock-open');
    player = M.player(dock.querySelector('[data-player]'), item, {prefetch:true});
    player.play();
    dock.querySelector('[data-close]').onclick = close;
    const more = dock.querySelector('[data-more]'), menu = dock.querySelector('[data-menu]');
    more.onclick = () => { menu.hidden = !menu.hidden; more.setAttribute('aria-expanded', String(!menu.hidden)); };
    dock.querySelector('[data-edit]').onclick = () => { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); player?.pause(); VZ.editMedia(item); };
    dock.querySelector('[data-download]').onclick = () => { menu.hidden = true; more.setAttribute('aria-expanded', 'false'); M.download(item).catch(err => VZ.toast('저장하지 못했어요: ' + err.message, 'error')); };
    dock.querySelector('[data-analyze]').onclick = () => { close(); VZ.nav('#/analysis/' + encodeURIComponent(item.id)); };
  };

  VZ.wireMedia = (host, items) => {
    // The immediate post-recording review has its own player and controls.
    if (host.closest('.vz-recording-page')) return legacyWire(host, items);
    host.classList.add('vz-media-dock-enabled');
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
      const select = event.target.closest('.vz-media-select');
      if (select) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (selected.has(row.dataset.media)) { selected.delete(row.dataset.media); select.setAttribute('aria-pressed', 'false'); row.classList.remove('vz-media-picked'); }
        else { selected.set(row.dataset.media, {item, row, button:select}); select.setAttribute('aria-pressed', 'true'); row.classList.add('vz-media-picked'); }
        paintSelection(); return;
      }
      if (!event.target.closest('[data-toggle]') || host.closest('.lib-selecting')) return;
      event.preventDefault(); event.stopImmediatePropagation();
      open(item, row);
    }, true);
    return legacyWire(host, items);
  };
  document.addEventListener('click', event => {
    if (event.target.closest('[data-select-mode]')) close();
    if (dock && !event.target.closest('.vz-media-dock') && !event.target.closest('[data-media]')) {
      const menu = dock.querySelector('[data-menu]');
      if (!menu.hidden) { menu.hidden = true; dock.querySelector('[data-more]').setAttribute('aria-expanded', 'false'); }
    }
  }, true);
  window.addEventListener('hashchange', () => { close(); clearSelection(); });
  new MutationObserver(() => {
    if (dock && activeRow && !activeRow.isConnected) close();
    if (selectionBar && !visibleSelected().length) paintSelection();
  }).observe(document.body, {childList:true, subtree:true});
  VZ.mediaDock = {open, close, clearSelection};
})();
