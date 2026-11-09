/* VOCAL.zip 보관함 선택 모드 (Phase 10-3): tap "선택", tick recordings, then act on all of them from the bottom bar —
 * set the song or the kind (공연·레슨·연습). Song changes use the conditional write (M.assignSongSafe): a recording
 * changed on another device meanwhile is left as it is and counted, never overwritten. Nothing is deleted here. */
(() => {
'use strict';
const VZ = window.VZ, M = VZ?.media;
if (!VZ || !M) return;

/** main: the library screen; list(): the recordings shown now (after filters); done(): reload after a change. */
VZ.librarySelect = (main, {list, done}) => {
  const toggle = main.querySelector('[data-select-mode]'), host = main.querySelector('[data-l]');
  if (!toggle || !host) return;
  const picked = new Set();
  let on = false, bar = null, allButton = null, selectionRow = null, busy = false;
  const mark = root => root.querySelectorAll('[data-media]').forEach(r => { const p = picked.has(r.dataset.media); r.classList.toggle('picked', p); r.querySelector('[data-toggle]')?.setAttribute('aria-pressed', String(p)); });
  const watch = new MutationObserver(() => { if (on) mark(host); });
  const items = () => list().filter(m => picked.has(m.id));
  const paint = () => {
    if (!bar) return;
    const n = items().length, all = list().length;
    bar.querySelector('[data-n]').textContent = n + '개 선택';
    if (allButton) {
      const checked = !!all && n === all;
      allButton.setAttribute('aria-pressed', String(checked));
      allButton.setAttribute('aria-label', checked ? '전체 선택 해제' : '전체 선택');
      selectionRow.querySelector('[data-selected-count]').textContent = '선택 ' + n + '개';
    }
    bar.hidden = !n;
    document.body.classList.toggle('vz-media-selecting', !!n);
    bar.querySelector('[data-act="analysis"]').disabled = n !== 1 || busy;
    bar.querySelector('[data-bulk]').disabled = !n || busy;
  };
  const exit = () => {
    on = false; picked.clear(); watch.disconnect(); bar?.remove(); bar = null; selectionRow?.remove(); selectionRow = null; allButton = null;
    main.classList.remove('lib-selecting'); document.body.classList.remove('vz-media-selecting'); toggle.textContent = '선택'; toggle.setAttribute('aria-pressed', 'false');
    host.querySelectorAll('[data-media]').forEach(r => { r.classList.remove('picked'); r.querySelector('[data-toggle]')?.removeAttribute('aria-pressed'); });
    removeEventListener('hashchange', exit);
  };
  const enter = () => {
    on = true; M.stopAll?.();
    host.querySelectorAll('.media-open:not([hidden])').forEach(p => { p.hidden = true; p.closest('[data-media]')?.querySelector('[data-toggle]')?.setAttribute('aria-expanded', 'false'); p._player?.destroy(); p._player = null; });
    main.classList.add('lib-selecting'); toggle.textContent = '완료'; toggle.setAttribute('aria-pressed', 'true');
    selectionRow = document.createElement('div'); selectionRow.className = 'vz-record-selection-row';
    selectionRow.innerHTML = '<button type="button" data-lib-all aria-pressed="false" aria-label="전체 선택"><span class="vz-select-checkbox" aria-hidden="true"></span>전체선택</button><span data-selected-count>선택 0개</span>';
    host.before(selectionRow); allButton = selectionRow.querySelector('[data-lib-all]');
    allButton.onclick = () => { const all = list(); if (items().length === all.length) picked.clear(); else all.forEach(m => picked.add(m.id)); mark(host); paint(); };
    bar = document.createElement('div');
    bar.className = 'sel-bar'; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', '선택한 녹음 작업');
    bar.innerHTML = '<div class="sel-bar-top"><b data-n></b></div>' +
      '<div class="sel-bar-acts"><button type="button" class="btn sm" data-act="analysis"><i class="ph ph-chart-line"></i>보컬 분석</button><button type="button" class="btn sm secondary" data-bulk><i class="ph ph-dots-three"></i>일괄 변경</button></div>';
    document.body.append(bar);
    bar.querySelector('[data-act="analysis"]').onclick = () => { const chosen = items(); if (chosen.length !== 1) return; const id = chosen[0].id; exit(); VZ.nav('#/analysis/' + encodeURIComponent(id)); };
    bar.querySelector('[data-bulk]').onclick = () => VZ.sheet({title:'선택한 녹음 변경', body:'<div class="vz-choice-list"><button type="button" class="vz-choice" data-song>곡 지정</button><button type="button" class="vz-choice" data-occ>종류 변경</button></div>', onMount:(sheet, close) => { sheet.querySelector('[data-song]').onclick = () => { close(); setSong(); }; sheet.querySelector('[data-occ]').onclick = () => { close(); setKind(); }; }});
    watch.observe(host, {childList:true, subtree:true});
    addEventListener('hashchange', exit);
    mark(host); paint();
  };
  toggle.onclick = () => on ? exit() : enter();
  // In select mode a tap on a row ticks it instead of opening the player.
  host.addEventListener('click', e => {
    if (!on) return;
    const row = e.target.closest('[data-media]'); if (!row || !e.target.closest('[data-toggle]')) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const id = row.dataset.media; picked.has(id) ? picked.delete(id) : picked.add(id);
    mark(row.parentNode); paint();
  }, true);

  const run = async (label, fn) => {
    const chosen = items(); if (!chosen.length) return;
    busy = true; paint();
    let ok = 0, failed = 0;
    for (const m of chosen) { try { await fn(m); ok++; } catch { failed++; } }
    busy = false;
    VZ.toast(label + ' ' + ok + '개' + (failed ? ' · ' + failed + '개는 다른 기기에서 바뀌었거나 저장하지 못해 그대로 뒀어요' : ''), failed ? 'error' : undefined);
    exit(); M.invalidate?.(); done();
  };
  async function setSong() {
    const songs = VZ.songsNewest();
    const v = await VZ.pickSheet({title:'곡 지정', placeholder:'곡 제목·작품 검색', value:null,
      options:[{value:'', label:'곡 미지정', always:true}, ...songs.map(s => ({value:s.id, label:s.title, sub:s.show || '', keywords:(s.aliases || []).join(' ')}))]});
    if (v == null) return;
    const song = VZ.song(v), chosen = items();
    if (!await VZ.confirm('곡 지정', chosen.length + '개 녹음의 곡을 "' + (song ? VZ.songLabel(song) : '곡 미지정') + '"(으)로 바꿀까요? 파일과 날짜·메모는 그대로예요.', {ok:'바꾸기'})) return;
    await run('곡을 바꿨어요:', m => (m.songId || '') === v ? null : M.assignSongSafe(m, {songId:v, song:song ? VZ.songLabel(song) : ''}, {expectedSongId:m.songId || '', expectedSong:m.song || ''}));
  }
  async function setKind() {
    const v = await VZ.pickSheet({title:'종류 바꾸기', value:null, options:M.OCCASIONS.map(([k, t]) => ({value:k, label:t}))});
    if (v == null) return;
    await run('종류를 바꿨어요:', m => M.occasion(m) === v ? null : M.update(m, {occasion:v}));
  }
  return {exit};
};
})();
