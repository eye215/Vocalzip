/* Linked recordings belong to saved practices. Playback never changes app data. */
(() => {
  'use strict';
  const root = document.querySelector('#practice-list');
  if (!root) return;
  const players = new Map(), runs = new WeakMap();
  const records = () => { try { return JSON.parse(localStorage.getItem('vocal-zip_mvp_v1') || '{}').practices || []; } catch { return []; } };
  function clear(details) {
    (players.get(details) || []).forEach(({player, url}) => {
      player.pause(); player.removeAttribute('src'); player.load();
      if (url) URL.revokeObjectURL(url);
    });
    players.delete(details);
  }
  function decorate() {
    const map = new Map(records().map(record => [record.id, record]));
    root.querySelectorAll('[data-delete="practice"]').forEach(button => {
      const record = map.get(button.dataset.id), row = button.closest('.item');
      if (!record?.mediaIds?.length || !row || row.querySelector('.vzip-practice-files')) return;
      const details = document.createElement('details');
      details.className = 'vzip-practice-files'; details.dataset.practiceId = record.id;
      const summary = document.createElement('summary');
      summary.textContent = '연결된 음성·영상 ' + new Set(record.mediaIds).size + '개';
      const files = document.createElement('div'); files.className = 'vzip-practice-file-list';
      details.append(summary, files); row.append(details);
    });
  }
  root.addEventListener('toggle', async event => {
    const details = event.target;
    if (!details.classList.contains('vzip-practice-files')) return;
    const run = (runs.get(details) || 0) + 1;
    runs.set(details, run); clear(details);
    const current = () => runs.get(details) === run && details.open && details.isConnected;
    const host = details.querySelector('.vzip-practice-file-list');
    if (!details.open) { host.replaceChildren(); return; }
    host.textContent = '연결 파일 불러오는 중…';
    try {
      const record = records().find(item => item.id === details.dataset.practiceId);
      if (!record) return;
      let local = [], error;
      try { local = await window.vzipReadMedia(); } catch (problem) { error = problem; }
      const map = new Map(local.map(item => [item.id, item]));
      if (record.mediaIds.some(id => !map.has(id)) && window.vzipCloudSignedIn?.()) {
        try {
          const remote = await window.vzipCloudMediaList();
          remote.forEach(item => map.set(item.id, {...map.get(item.id), ...item}));
        } catch (problem) { error = problem; }
      }
      if (!current()) return;
      host.replaceChildren(); players.set(details, []);
      for (const id of new Set(record.mediaIds)) {
        const item = map.get(id), row = document.createElement('div');
        row.className = 'vzip-practice-file'; host.append(row);
        if (!item) {
          row.textContent = error ? '파일 확인 실패: ' + error.message :
            '원본을 찾을 수 없어요. 파일을 저장한 기기 또는 클라우드 백업을 확인해 주세요.';
          continue;
        }
        const title = document.createElement('p'), seconds = Math.round(Number(item.durationSeconds) || 0);
        title.textContent = item.name + (seconds ? ' · ' + Math.floor(seconds / 60) + '분 ' + seconds % 60 + '초' : ' · 길이 미확인');
        row.append(title);
        try {
          const blob = window.vzipMediaBlob(item);
          const url = blob ? URL.createObjectURL(blob) : null;
          const player = document.createElement(window.vzipMediaType(item).startsWith('video/') ? 'video' : 'audio');
          if (url) players.get(details).push({player, url});
          const src = url || await window.vzipCloudMediaUrl(item);
          if (!current()) return;
          if (!url) players.get(details).push({player, url:null});
          player.controls = true; player.playsInline = true; player.preload = 'metadata'; player.src = src;
          const failure = document.createElement('p'); failure.className = 'muted'; failure.setAttribute('role', 'status');
          player.onerror = () => { failure.textContent = '파일을 재생하지 못했어요. 원본 형식과 네트워크를 확인해 주세요.'; };
          row.append(player, failure);
        } catch (problem) { row.append(document.createTextNode('재생 준비 실패: ' + problem.message)); }
      }
    } catch (error) { if (current()) host.textContent = '파일 확인 실패: ' + error.message; }
  }, true);
  new MutationObserver(() => { for (const details of players.keys()) if (!details.isConnected) clear(details); })
    .observe(root, {childList:true, subtree:true});
  window.addEventListener('vzip:data-changed', decorate);
  window.addEventListener('pagehide', () => { for (const details of players.keys()) clear(details); });
  decorate();
})();
