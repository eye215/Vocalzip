/* VOCAL.zip v6 views: 보관함, 가져오기, 비교, 성장, 설정. */
(() => {
'use strict';
const localStorage = window.VzipAccountScope?.storage || window.localStorage;

const VZ = window.VZ, M = VZ.media, esc = VZ.esc;

/* ---------- 가져오기 ---------- */
let importRunning = false;
VZ.importSheet = ({songId = '', files:initialFiles = null} = {}) => {
  if (importRunning) { VZ.toast('이미 파일을 가져오는 중이에요.', 'error'); return; }
  const signed = !!window.vzipCloudSignedIn?.();
  VZ.sheet({title:'파일 가져오기', body:'<div data-step1><label class="btn block" style="cursor:pointer"><i class="ph ph-image"></i>사진 보관함<input type="file" multiple accept="video/*" class="sr-only" data-file></label><label class="btn ghost block" style="cursor:pointer;margin-top:8px"><i class="ph ph-video-camera"></i>비디오 촬영<input type="file" accept="video/*" capture="environment" class="sr-only" data-file></label><label class="btn ghost block" style="cursor:pointer;margin-top:8px"><i class="ph ph-folder-open"></i>파일 선택<input type="file" multiple accept="audio/*,video/*,.m4a,.mp3,.wav,.aac,.mov,.mp4,.m4v,.webm,.ogg,.flac" class="sr-only" data-file></label><p class="small muted">여러 파일을 한 번에 고를 수 있어요. 파일당 최대 1GB · 원본 음질 그대로 저장해요. 영상 파일은 음성만 추출해 음원으로 저장해요.' + (signed ? '' : '<br>로그인하지 않으면 25MB 이하 파일만 이 기기에 저장돼요.') + '</p></div><div data-step2 hidden></div>',
    foot:'<div data-foot hidden class="btn-row"><button type="button" class="btn ghost" data-cancel>취소</button><button type="button" class="btn" data-start style="flex:2">가져오기</button></div>',
    onClose:() => { if (importRunning) abort?.abort(); },
    onMount:(el, close) => {
      const wrap = el.parentNode, step2 = el.querySelector('[data-step2]'), foot = wrap.querySelector('[data-foot]');
      let rows = [];
      const songOpts = v => '<option value="">곡 미지정</option>' + VZ.songsNewest().map(s => '<option value="' + esc(s.id) + '"' + (s.id === v ? ' selected' : '') + '>' + esc(VZ.songLabel(s)) + '</option>').join('');
      el.querySelectorAll('[data-file]').forEach(input => input.onchange = async e => {
        // Only audio and video files are taken (text, images, documents, hidden system files are left out quietly).
        const picked = [...e.target.files]; e.target.value = '';
        const files = picked.filter(f => /^(audio|video)\//.test(M.typeOf(f)) && !/^\./.test(f.name)), skipped = picked.length - files.length;
        const note = skipped ? ' (음성·영상이 아닌 파일 ' + skipped + '개는 뺐어요)' : '';
        if (!files.length) { if (picked.length) VZ.toast('고른 파일 중에 음성·영상 파일이 없어요.', 'error'); return; }
        // Many files go to the bulk uploader: one at a time, server-confirmed, resumable, no device copies.
        if (files.length > 20) { close(); VZ.toast(files.length + '개 파일은 대량 업로드 화면에서 하나씩 확인하며 올려요.' + note); VZ.openImportHub({files}); return; }
        if (skipped) VZ.toast('음성·영상이 아닌 파일 ' + skipped + '개는 뺐어요.');
        rows = files.map(file => {
          const type = M.typeOf(file);
          let error = '';
          if (!/^(audio|video)\//.test(type)) error = '지원하지 않는 형식이에요.';
          else if (!file.size) error = '빈 파일이에요.';
          else if (file.size > (window.VzipChunks?.MAX_SIZE || 1073741824)) error = '1GB를 넘는 파일은 가져올 수 없어요.';
          else if (file.size > M.LOCAL_LIMIT && !window.vzipCloudSignedIn?.()) error = '25MB 초과 파일은 로그인이 필요해요.';
          const candidates = VZ.suggestSongs?.(file.name) || [];
          const autoSongId = candidates[0]?.score >= 0.95 && (!candidates[1] || candidates[1].score < 0.95) ? candidates[0].id : '';
          const namedDate = window.VzipMediaDates?.fromName?.(file.name) || null;
          return {file, id:VZ.uid(), state:error ? 'invalid' : 'ready', error, songId:songId || autoSongId, namedDate, video:type.startsWith('video/')};
        });
        for (const r of rows.filter(r => r.state === 'ready')) {
          try {
            const info = await window.vzipInspectMedia(r.file);
            r.duration = info.duration ?? await M.measure({blob:r.file, type:M.typeOf(r.file), name:r.file.name}, 8000);
            if (!(Number(r.duration) >= 30)) { r.state = 'invalid'; r.error = r.duration > 0 ? '30초 미만 파일은 가져오지 않아요.' : '길이를 확인할 수 없어 가져오지 않아요.'; }
          } catch { r.state = 'invalid'; r.error = '길이를 확인할 수 없어 가져오지 않아요.'; }
        }
        const excluded = rows.filter(r => r.state === 'invalid').length;
        if (excluded) VZ.toast(excluded + '개 파일을 가져오기 목록에서 제외했어요. 원본 파일은 그대로예요.');
        el.querySelector('[data-step1]').hidden = true; step2.hidden = false; foot.hidden = false;
        step2.innerHTML = '<fieldset class="field" style="border:0;padding:0"><legend>종류 (모든 파일)</legend><div class="seg" role="radiogroup" aria-label="가져올 파일 종류">' + M.OCCASIONS.map(([k, v]) => '<button type="button" role="radio" data-occ="' + k + '" aria-pressed="' + (k === occasion) + '" aria-checked="' + (k === occasion) + '">' + v + '</button>').join('') + '</div></fieldset>' + (rows.length > 1 ? '<label class="field"><span>모든 파일의 곡 한 번에 지정</span><select data-bulk data-pick="song"><option value="">선택…</option>' + songOpts('').replace('<option value="">곡 미지정</option>', '<option value="__none">곡 미지정</option>') + '</select></label>' : '') +
          '<p class="up-done" data-done role="status" hidden></p><div class="list up-saved" data-saved hidden></div><p class="small muted" style="margin-top:0">30초 미만 파일은 제외해요. 파일명 날짜·곡 제목을 먼저 인식하고, 인식되지 않은 날짜는 파일 속 촬영·녹음 날짜(없으면 수정일)를 사용해요.</p><div class="stack" data-rows>' + rows.map((r, i) =>
          '<div class="up-row' + (r.state === 'invalid' ? ' failed' : '') + '" data-i="' + i + '"><div class="up-head"><strong title="' + esc(r.file.name) + '">' + esc(r.file.name) + '</strong><span class="small muted">' + VZ.size(r.file.size) + '</span></div>' +
          (r.state === 'invalid' ? '<div class="small" style="color:var(--danger)">' + esc(r.error) + ' (건너뜀)</div>' :
          (r.video ? '<span class="badge accent" style="justify-self:start">영상 → 음성만 저장</span>' : /\.wav$/i.test(r.file.name) || /wav/.test(r.file.type) ? '<span class="badge accent" style="justify-self:start">WAV → FLAC 무손실 압축</span>' : '') + '<select aria-label="' + esc(r.file.name) + ' 곡" data-song data-pick="song">' + songOpts(r.songId) + '</select><label class="up-date"><span>녹음 날짜 <em>' + (r.namedDate ? '파일명에서 인식' : '비우면 자동') + '</em></span><input type="date" aria-label="' + esc(r.file.name) + ' 날짜" data-date value="' + esc(r.namedDate?.recordedDate || '') + '"></label>' + (r.namedDate && !r.namedDate.timeless ? '<span class="small muted">파일명 시각 ' + esc(new Date(r.namedDate.created).toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit', second:'2-digit'})) + ' 적용</span>' : '') + '<div class="bar-mini"><i></i></div><div class="row between"><span class="small muted" data-st>대기 중</span><button type="button" class="btn sm ghost" data-retry hidden>다시 시도</button></div>') + '</div>').join('') + '</div><p class="small muted" data-summary role="status"></p>';
        step2.querySelectorAll('[data-occ]').forEach(b => b.onclick = () => { occasion = b.dataset.occ; step2.querySelectorAll('[data-occ]').forEach(x => { x.setAttribute('aria-pressed', String(x === b)); x.setAttribute('aria-checked', String(x === b)); }); });
        step2.querySelector('[data-bulk]')?.addEventListener('change', ev => { const v = ev.target.value === '__none' ? '' : ev.target.value; if (!ev.target.value) return; step2.querySelectorAll('[data-song]').forEach(s => { s.value = v; }); });
        step2.querySelectorAll('[data-retry]').forEach(b => b.onclick = () => run([rows[+b.closest('[data-i]').dataset.i]]));
        wrap.querySelector('[data-start]').disabled = !rows.some(r => r.state === 'ready');
      });
      let abort = null, occasion = 'practice'; const savedItems = [];
      const ui = r => step2.querySelector('[data-i="' + rows.indexOf(r) + '"]');
      const setRow = (r, text, pct) => { const u = ui(r); u.querySelector('[data-st]').textContent = text; if (pct != null) u.querySelector('.bar-mini i').style.width = pct + '%'; u.classList.toggle('failed', r.state === 'failed' || r.state === 'cancelled'); u.classList.toggle('done', r.state === 'done'); u.querySelector('[data-retry]').hidden = !['failed', 'cancelled'].includes(r.state); };
      const run = async list => {
        if (importRunning) return;
        importRunning = true; abort = new AbortController(); M.keepAwake(true);
        const start = wrap.querySelector('[data-start]'), cancel = wrap.querySelector('[data-cancel]');
        start.disabled = true; cancel.textContent = '업로드 중지';
        step2.querySelectorAll('[data-song],[data-date],[data-bulk],[data-retry]').forEach(x => { x.disabled = true; });
        try {
          for (const r of list) {
            if (abort.signal.aborted) { r.state = 'cancelled'; setRow(r, '취소됨'); continue; }
            const u = ui(r), sid = u.querySelector('[data-song]').value, date = u.querySelector('[data-date]').value;
            if (!(Number(r.duration) >= 30)) { r.state = 'invalid'; setRow(r, '30초 미만 또는 길이 미확인 파일은 제외돼요.'); continue; }
            r.state = 'uploading'; setRow(r, '준비 중…', 2);
            try {
              // The original name and a content fingerprint go with the file, so a later bulk upload can skip it.
              const fileHash = await M.fingerprint(r.file).catch(() => '');
              const saved = await M.importFile(r.file, {id:r.id, songId:sid, song:VZ.songLabel(VZ.song(sid)), date, extra:{occasion, originalFilename:r.file.name, fileHash, importedAt:Date.now()}}, p => typeof p === 'number' ? setRow(r, '업로드 ' + p + '%', p) : setRow(r, String(p)), abort.signal);
              r.state = 'done'; r.file = null;
              r.savedDate = VZ.dateLabel(M.dateOf(saved)) + ({metadata:' (파일 속 날짜)', 'file-modified':' (파일 수정일)', manual:' (직접 지정)'}[saved.dateSource] || '');
              // Finished files leave the list; one line keeps the count and dates.
              ui(r).hidden = true;
              const doneRows = rows.filter(x => x.state === 'done'), dates = [...new Set(doneRows.map(x => x.savedDate))];
              const line = step2.querySelector('[data-done]'); line.hidden = false;
              const waiting = savedItems.concat(saved).some(x => x.pendingUpload);
              line.textContent = (waiting ? '✓ 이 기기에 저장 ' : '✓ 저장 완료 ') + doneRows.length + '개' + (waiting ? ' (클라우드 업로드는 이어서 진행돼요)' : '') + ' · ' + dates.slice(0, 3).join(', ') + (dates.length > 3 ? ' 외' : '');
              // Saved files can be played right here (tap to open a player).
              savedItems.push(saved);
              const list = step2.querySelector('[data-saved]'); list.hidden = false;
              list.insertAdjacentHTML('beforeend', VZ.mediaRow(saved));
              if (!list.dataset.wired) { list.dataset.wired = '1'; VZ.wireMedia(list, savedItems); }
            } catch (e) {
              r.state = e.name === 'AbortError' ? 'cancelled' : 'failed';
              setRow(r, r.state === 'cancelled' ? '취소됨' : '실패: ' + (e.message || '알 수 없는 오류'));
            }
          }
        } finally {
          importRunning = false; M.keepAwake(false); cancel.textContent = '닫기';
          step2.querySelectorAll('[data-song],[data-date],[data-bulk],[data-retry]').forEach(x => { x.disabled = false; });
          const done = rows.filter(r => r.state === 'done').length, bad = rows.filter(r => ['failed', 'cancelled'].includes(r.state)).length;
          step2.querySelector('[data-summary]').textContent = '저장 ' + done + '개' + (bad ? ' · 실패/취소 ' + bad + '개 — 실패한 파일만 다시 시도할 수 있어요.' : '');
          if (savedItems.some(x => x.pendingUpload)) step2.querySelector('[data-summary]').textContent += ' · 이 기기에 먼저 저장했어요. 클라우드 업로드는 자동으로 이어져요(다른 앱을 쓰다 와도 이어서 올라가요).';
          start.hidden = true;
          if (done) M.invalidate();
          if (!bad && done) VZ.toast(savedItems.some(x => x.pendingUpload) ? done + '개 파일을 이 기기에 저장했어요. 클라우드 업로드는 위쪽 표시줄에서 확인할 수 있어요.' : done + '개 파일을 보관함에 저장했어요.');
        }
      };
      wrap.querySelector('[data-start]').onclick = () => run(rows.filter(r => r.state === 'ready'));
      wrap.querySelector('[data-cancel]').onclick = () => { if (importRunning) abort.abort(); else close(); };
      if (initialFiles?.length) el.querySelector('[data-file]').onchange({target:{files:initialFiles, value:''}});
    }});
};

/* ---------- 보관함 ---------- */
const lib = {kind:'all', origin:'all', song:'', month:'', q:''};
const monthTitle = ym => ym ? Number(ym.slice(0, 4)) + '년 ' + Number(ym.slice(5, 7)) + '월' : '날짜 미상';
VZ.route('library', {title:'보관함', tab:'library', noSettings:true, actions:() => '<button type="button" class="icon-btn" data-imp aria-label="파일 가져오기"><i class="ph ph-plus"></i></button><input type="file" multiple accept="audio/*,video/*" class="sr-only" data-imp-native aria-label="가져올 음성·영상 선택">', render() {
  const seg = (k, opts, label) => '<div class="seg lib-seg" role="group" aria-label="' + label + '">' + opts.map(([v, t]) => '<button type="button" data-f="' + k + '" data-v="' + v + '" aria-pressed="' + (lib[k] === v) + '">' + t + '</button>').join('') + '</div>';
  return '<div hidden class="search" style="margin-bottom:10px"><i class="ph ph-magnifying-glass"></i><input type="search" placeholder="제목·곡·메모 검색" aria-label="보관함 검색" data-q value="' + esc(lib.q) + '"></div>' +
    '<div class="vz-library-tabs">'+seg('origin', [['all', '전체'], ['performance', '공연'], ['lesson', '레슨'], ['practice', '연습']], '공연·레슨·연습 구분')+'</div>' +
    '<div data-server-analysis data-compact></div>' + '<a class="vz-review-fallback" href="#/song-suggest">곡 확인 <i class="ph ph-caret-right"></i></a><div data-name-dates></div><div class="lib-tools"><div class="lib-summary"><p data-count></p><p class="small muted" data-backup></p><a href="#/processing-log" class="small" style="color:var(--accent)">처리 내역 · 분석 상태 보기 ›</a></div><button type="button" class="icon-btn vz-filter-icon" data-library-filter aria-label="보관함 필터" aria-pressed="false"><i class="ph ph-sliders-horizontal"></i></button><button type="button" class="icon-btn" data-library-search aria-label="보관함 검색"><i class="ph ph-magnifying-glass"></i></button></div><div class="lib-selects" hidden><select aria-label="형식 필터" data-kind><option value="all"' + (lib.kind === 'all' ? ' selected' : '') + '>파일 형식 전체</option><option value="audio"' + (lib.kind === 'audio' ? ' selected' : '') + '>음성만</option><option value="video"' + (lib.kind === 'video' ? ' selected' : '') + '>영상만</option></select><select aria-label="곡 필터" data-song><option value="">곡 전체</option><option value="__none"' + (lib.song === '__none' ? ' selected' : '') + '>곡 미지정</option>' + VZ.songsNewest().map(s => '<option value="' + esc(s.id) + '"' + (lib.song === s.id ? ' selected' : '') + '>' + esc(s.title) + '</option>').join('') + '</select></div><div class="lib-selection-tools" aria-label="녹음 선택"><button type="button" class="lib-select-start" data-select-mode>선택</button><span class="lib-selection-total" data-lib-total-count>총 0개</span><div class="lib-selection-left" hidden><button type="button" class="lib-select-all" data-lib-select-all aria-pressed="false"><span class="lib-check" aria-hidden="true"></span>전체 선택</button><button type="button" class="lib-select-cancel" data-lib-select-cancel hidden>취소</button></div><div class="lib-selection-meta" hidden><strong data-lib-selected-count>0개 선택</strong><button type="button" class="lib-bulk-more" data-lib-bulk-more aria-label="선택한 녹음 더보기" disabled><i class="ph ph-dots-three"></i></button></div></div><div data-l><div class="empty compact"><span class="muted">불러오는 중…</span></div></div>';
}, async mount(main) {
  VZ.serverAnalysisCard?.(main.querySelector('[data-server-analysis]')); // app/server-analysis.js
  const importPicker = document.querySelector('[data-imp-native]');
  document.querySelector('[data-imp]').onclick = () => importPicker.click();
  importPicker.onchange = e => {
    const files = [...e.target.files]; e.target.value = '';
    if (files.length) VZ.openImportHub({files, review:true});
  };
  main.querySelector('[data-library-search]').onclick=()=>VZ.collectionSearch('보관함 검색','제목·곡·메모 검색',lib.q,value=>{const input=main.querySelector('[data-q]');input.value=value;input.dispatchEvent(new Event('input'));});
  const libraryFilter=main.querySelector('[data-library-filter]');
  libraryFilter.onclick=()=>{const kind=main.querySelector('[data-kind]'),song=main.querySelector('[data-song]'),ym=VZ.ymd(new Date()).slice(0,7),months=[...new Set(media.map(m=>(M.dateOf(m)||'').slice(0,7)).filter(Boolean))].sort().reverse(),monthLabel=lib.month===''?'전체 기간':lib.month==='this'?'이번 달':monthTitle(lib.month);VZ.sheet({title:'보관함 필터',body:'<div class="vz-choice-list"><button type="button" class="vz-choice" data-filter-kind>파일 형식 <span>'+esc(kind.selectedOptions[0]?.text||'파일 형식 전체')+' ›</span></button><button type="button" class="vz-choice" data-filter-song>곡 <span>'+esc(song.selectedOptions[0]?.text||'곡 전체')+' ›</span></button><button type="button" class="vz-choice" data-filter-month>기간 <span>'+esc(monthLabel)+' ›</span></button><button type="button" class="vz-choice" data-filter-reset>필터 초기화</button></div>',onMount:(sheet,close)=>{
    sheet.querySelector('[data-filter-kind]').onclick=()=>{close();VZ.collectionChoice('파일 형식',[...kind.options].map(o=>[o.value,o.text]),kind.value,value=>{kind.value=value;kind.dispatchEvent(new Event('change'));});};
    sheet.querySelector('[data-filter-song]').onclick=()=>{close();VZ.collectionChoice('곡 선택',[...song.options].map(o=>[o.value,o.text]),song.value,value=>{song.value=value;song.dispatchEvent(new Event('change'));});};
    sheet.querySelector('[data-filter-month]').onclick=()=>{close();VZ.collectionChoice('기간 선택',[['','전체 기간'],['this','이번 달'],...months.filter(m=>m!==ym).map(m=>[m,monthTitle(m)])],lib.month,value=>{lib.month=value;M.stopAll();draw();});};
    sheet.querySelector('[data-filter-reset]').onclick=()=>{kind.value='all';song.value='';lib.kind='all';lib.song='';lib.month='';M.stopAll();close();draw();};
  }});};
  const l = main.querySelector('[data-l]');
  let media = [], drawn = [];
  const draw = () => {
    libraryFilter.setAttribute('aria-pressed',String(lib.kind!=='all'||!!lib.song||!!lib.month));
    main.querySelector('[data-library-search]').setAttribute('aria-pressed',String(!!lib.q.trim()));
    const q = lib.q.trim().toLowerCase();
    const list = media.filter(m => (lib.kind === 'all' || (lib.kind === 'video') === M.isVideo(m)) && (lib.origin === 'all' || M.occasion(m) === lib.origin) &&
      (!lib.song || (lib.song === '__none' ? !VZ.song(m.songId) : m.songId === lib.song)) && (!lib.month || (M.dateOf(m)||'').slice(0,7)===(lib.month==='this'?VZ.ymd(new Date()).slice(0,7):lib.month)) && (!q || (M.label(m) + ' ' + (m.review || '') + ' ' + VZ.songTitle(m.songId)).toLowerCase().includes(q)));
    drawn = list;
    VZ.collectionCount?.(media.length,'개');
    const local = M.localOnly(media).length, b = M.backupStatus();
    const seconds = list.reduce((a, m) => a + (Number(m.durationSeconds) || 0), 0);
    main.querySelector('[data-count]').innerHTML = '<b>' + list.length + '개</b>' + (list.length !== media.length ? ' <span class="muted">/ 전체 ' + media.length + '개</span>' : '') + (seconds >= 60 ? ' · 총 ' + VZ.minutes(seconds / 60) : '');
    main.querySelector('[data-backup]').textContent = [M.cloudError(), b.running ? '클라우드 백업 중 ' + (b.done + b.failed) + '/' + b.total : local ? '기기에만 있는 파일 ' + local + '개' + (window.vzipCloudSignedIn?.() ? ' · 곧 자동 백업' : ' · 로그인하면 클라우드에 자동 백업돼요') : window.vzipCloudSignedIn?.() && media.length ? '모두 클라우드에 백업됨' : ''].filter(Boolean).join(' · ');
    if (!list.length) { l.innerHTML = VZ.empty('waveform', media.length ? '조건에 맞는 파일이 없어요.' : '아직 저장된 녹음이 없어요.', media.length ? '<button type="button" class="btn sm secondary" data-reset>필터 초기화</button>' : '<a class="btn sm" href="#/record">녹음하기</a>'); l.querySelector('[data-reset]')?.addEventListener('click', () => { Object.assign(lib, {kind:'all', origin:'all', song:'', month:'', q:''}); VZ.render(); }); return; }
    // Newest recording month first; each month shows how many files and how long.
    const groups = new Map();
    for (const m of list) { const k = (M.dateOf(m) || '').slice(0, 7); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m); }
    // Rows are drawn 60 at a time as the list scrolls: 1,000+ files stay light on a phone (month headers keep full counts).
    const head = k => { const items = groups.get(k), sec = items.reduce((a, m) => a + (Number(m.durationSeconds) || 0), 0); return '<section class="lib-month" data-month="' + (k || 'none') + '"><h3><span>' + monthTitle(k) + '</span><span class="small muted">' + items.length + '개' + (sec >= 60 ? ' · ' + VZ.minutes(sec / 60) : '') + '</span></h3><div class="list"></div></section>'; };
    const order = [...groups].flatMap(([k, items]) => items.map(m => [k, m]));
    l.innerHTML = '<div class="lib-groups"></div><div class="lib-more" data-more aria-hidden="true"></div>';
    const root = l.firstChild; let shown = 0, lastKey = null;
    VZ.wireMedia(root, list);
    const more = n => {
      const end = Math.min(order.length, shown + n);
      while (shown < end) {
        const k = order[shown][0]; let html = '';
        if (k !== lastKey) { root.insertAdjacentHTML('beforeend', head(k)); lastKey = k; }
        while (shown < end && order[shown][0] === k) html += VZ.mediaRow(order[shown++][1], {library:true});
        root.lastElementChild.querySelector('.list').insertAdjacentHTML('beforeend', html);
      }
      root.vzPrefetch?.();
      if (shown >= order.length) { io?.disconnect(); l.querySelector('[data-more]')?.remove(); }
    };
    l._io?.disconnect();
    const io = l._io = window.IntersectionObserver ? new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) more(120); }, {rootMargin:'800px'}) : null;
    more(60);
    if (shown < order.length) { if (io) io.observe(l.querySelector('[data-more]')); else more(order.length); }
    drawn = list;
  };
  main.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { lib[b.dataset.f] = b.dataset.v; main.querySelectorAll('[data-f="' + b.dataset.f + '"]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); M.stopAll(); draw(); });
  main.querySelector('[data-kind]').onchange = e => { lib.kind = e.target.value; M.stopAll(); draw(); };
  main.querySelector('[data-song]').onchange = e => { lib.song = e.target.value; M.stopAll(); draw(); };
  main.querySelector('[data-q]').oninput = e => { lib.q = e.target.value; draw(); };
  // 선택 모드 (app/library-select.js): the ticked rows are among what the filters show now.
  VZ.librarySelect?.(main, {list:() => drawn, done:async () => { media = await M.list().catch(() => media); if (l.isConnected) draw(); }});
  // The list kept on this device is drawn at once; the fresh one replaces it only if something changed and no player is open.
  const sig = list => list.map(m => [m.id, m.name, M.dateOf(m), m.durationSeconds, m.songId, m.occasion, m.cloud ? 1 : 0].join(':')).join('|');
  const peek = await M.peek().catch(() => null);
  if (peek?.length && l.isConnected) { media = peek; draw(); }
  const fresh = await M.list().catch(() => media);
  if (l.isConnected && (!peek?.length || sig(fresh) !== sig(media)) && !l.querySelector('.media-open:not([hidden])')) { media = fresh; draw(); } else media = fresh;
  // Recordings named yyyy-MM-dd_HH-mm-ss that sit on another date (imported before names were read): one tap moves them.
  const nameHost = main.querySelector('[data-name-dates]');
  const drawNameFix = () => {
    const off = media.map(m => ({m, named:window.VzipMediaDates?.fromName?.(m.originalFilename || m.name)}))
      .filter(({m, named}) => named && m.dateSource !== 'manual' && (M.dateOf(m) !== named.recordedDate || (!named.timeless && Math.abs((Number(m.created) || 0) - named.created) > 60000)));
    if (!off.length) { nameHost.innerHTML = ''; return; }
    nameHost.innerHTML = '<div class="card row" style="gap:10px;margin-bottom:12px"><i class="ph ph-calendar-check" style="font-size:22px;color:var(--accent)"></i><span class="grow small">파일 이름에 녹음 날짜가 있는 녹음 <strong>' + off.length + '개</strong>가 다른 날짜로 들어가 있어요.</span><button type="button" class="btn sm" data-name-fix>이름대로 맞추기</button></div>';
    nameHost.querySelector('[data-name-fix]').onclick = async e => {
      const sample = off.slice(0, 3).map(({m, named}) => '· ' + M.label(m) + ': ' + (M.dateOf(m) || '날짜 없음') + ' → ' + named.recordedDate).join('\n');
      if (!await VZ.confirm('파일 이름 날짜로 맞추기', off.length + '개 녹음의 날짜를 파일 이름대로 바꿔요 (2025-08-08_22-09-00 → 그 시각, 2025-10-19 #21 → 그날, 11-5 #10 → 가장 최근 11월 5일). 파일과 곡·메모는 그대로예요. 직접 고친 날짜는 건드리지 않아요.\n\n' + sample + (off.length > 3 ? '\n…' : ''), {ok:'맞추기'})) return;
      e.target.disabled = true; let n = 0, failed = 0;
      for (const {m, named} of off) {
        // A month-day name gives only the day: keep the recording's own time of day.
        const keep = new Date(Number(m.created) || named.created), d = new Date(named.created);
        const created = named.timeless ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), keep.getHours(), keep.getMinutes(), keep.getSeconds()).getTime() : named.created;
        const changes = {created, recordedDate:named.recordedDate, dateSource:'filename'};
        try { await M.update(m, changes, {quiet:true}); Object.assign(m, changes); n++; } catch { failed++; }
      }
      window.dispatchEvent(new CustomEvent('vzip:media-updated', {detail:{}}));
      VZ.toast(n + '개 녹음을 파일 이름 날짜로 옮겼어요.' + (failed ? ' ' + failed + '개는 실패했어요. 다시 시도해 주세요.' : ''), failed ? 'error' : undefined);
      if (l.isConnected) { draw(); drawNameFix(); }
    };
  };
  if (l.isConnected) drawNameFix();
  const onBackup = async () => { if (!l.isConnected) { window.removeEventListener('vzip:v6-backup', onBackup); return; } if (!M.backupStatus().running) media = await M.list().catch(() => media); if (l.isConnected && !l.querySelector('.media-open:not([hidden])')) draw(); };
  window.addEventListener('vzip:v6-backup', onBackup);
  if (M.localOnly(media).length) M.scheduleBackup(500);
  // Show filled lengths, but never close a player the user has open.
  if (await M.fillDurations(drawn.slice(0, 60)) && l.isConnected && !l.querySelector('.media-open:not([hidden])')) draw();
}});

/* Legacy comparison links now open the same-song comparison in 보컬 연구소. */
VZ.route('compare', {title:'보컬 연구소', back:true, tab:'songs', render:()=>'<p class="muted">보컬 연구소로 이동하는 중…</p>', async mount(main,r){
  const media=await M.list().catch(()=>M.cached());if(!main.isConnected)return;
  const a=media.find(m=>m.id===r.query.get('a')), b=media.find(m=>m.id===r.query.get('b'));
  const songId=r.query.get('song')||a?.songId||b?.songId;
  if(a&&b&&a.songId!==b.songId){VZ.toast('같은 곡의 녹음만 비교할 수 있어요.','error');VZ.nav('#/vocal-lab');return}
  VZ.nav('#/vocal-lab'+(songId?'/'+encodeURIComponent(songId):'')+(a||b?'?a='+encodeURIComponent(a?.id||'')+'&b='+encodeURIComponent(b?.id||'')+'&compare=1':''));
}});
VZ.anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoeG5idGl5dXloaXl3emVzaGlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2MDA0ODcsImV4cCI6MjEwOTE3NjQ4N30.65LSQMuaq8MQOpFUjCSyRT4ZITtNxKF3c_xa_ZVEi_E';

/* ---------- 성장 ---------- */
let period = 'week', growthMonth = VZ.today().slice(0, 7), songMetric = 'minutes', songsOpen = false;
VZ.route('growth', {title:'성장', render() {
  return '<div class="growth-shell"><div class="seg growth-period" role="group" aria-label="통계 기간">' + [['week', '이번 주'], ['28', '최근 28일'], ['all', '전체'], ['month', '월별']].map(([k, v]) => '<button type="button" data-pd="' + k + '" aria-pressed="' + (period === k) + '">' + v + '</button>').join('') + '</div><div data-month-controls class="growth-month"' + (period === 'month' ? '' : ' hidden') + '><button type="button" class="btn sm secondary" data-month-prev aria-label="이전 달 통계">←</button><label class="field"><span>조회 월</span><select aria-label="조회 월" data-growth-month></select></label><button type="button" class="btn sm secondary" data-month-next aria-label="다음 달 통계">→</button></div><div data-g></div></div>';
}, async mount(main) {
  main.querySelectorAll('[data-pd]').forEach(b => b.onclick = () => { period = b.dataset.pd; VZ.render(); });
  const host = main.querySelector('[data-g]');
  const draw = media => {
    const db = VZ.db, today = new Date(), t = VZ.today();
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
    const from = period === 'week' ? VZ.ymd(monday) : period === '28' ? VZ.ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 27)) : '';
    const inP = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && (period === 'month' ? d.slice(0, 7) === growthMonth : (!from || d >= from)) && d <= t;
    const monthSelect = main.querySelector('[data-growth-month]');
    const oldest = [...db.practices.map(p => p.date), ...media.map(M.dateOf)].filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && d.slice(0, 7) <= t.slice(0, 7)).sort()[0]?.slice(0, 7) || t.slice(0, 7);
    const first = [oldest, growthMonth].sort()[0], monthOptions = [];
    for (let y = today.getFullYear(), m = today.getMonth(); y >= 1900; m--) { if (m < 0) { y--; m = 11; } const value = y + '-' + String(m + 1).padStart(2, '0'); if (value < first) break; monthOptions.push('<option value="' + value + '"' + (value === growthMonth ? ' selected' : '') + '>' + y + '년 ' + (m + 1) + '월</option>'); }
    monthSelect.innerHTML = monthOptions.join('');
    monthSelect.onchange = e => { growthMonth = e.target.value; draw(media); };
    const moveMonth = delta => { const [y, m] = growthMonth.split('-').map(Number); growthMonth = VZ.ymd(new Date(y, m - 1 + delta, 1)).slice(0, 7); draw(media); };
    main.querySelector('[data-month-prev]').onclick = () => moveMonth(-1);
    main.querySelector('[data-month-prev]').disabled = growthMonth <= '1900-01';
    main.querySelector('[data-month-next]').onclick = () => moveMonth(1);
    main.querySelector('[data-month-next]').disabled = growthMonth >= t.slice(0, 7);
    const ps = db.practices.filter(p => inP(p.date));
    // Only performed practice time; file counts and file durations stay separate.
    const all = VZ.timeEntries(media), es = all.filter(e => inP(e.date));
    const total = VZ.sumMinutes(es), fileTotal = VZ.sumMinutes(es.filter(e => e.kind === 'recording'));
    const days = new Set(es.map(e => e.date)).size;
    const recs = [...new Map(media.filter(m => inP(M.dateOf(m))).map(m => [m.id, m])).values()];
    const doneTasks = db.assignments.filter(x => x.status === 'done' && (period === 'all' || (x.doneAt && inP(VZ.ymd(new Date(x.doneAt))))));
    const rated = ps.filter(p => p.rating > 0), avg = rated.length ? (rated.reduce((a, p) => a + p.rating, 0) / rated.length).toFixed(1) : '–';
    const allTotal = VZ.sumMinutes(all);
    // The same-length period just before this one, for a "vs last time" line.
    let prevFrom = '', prevTo = '', prevLabel = '';
    // A week or month still in progress is compared with the same number of days before it.
    if (period === 'week') { prevFrom = VZ.ymd(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7)); prevTo = VZ.ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 7)); prevLabel = '지난주 같은 요일까지'; }
    else if (period === '28') { prevFrom = VZ.ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 55)); prevTo = VZ.ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 28)); prevLabel = '이전 28일'; }
    else if (period === 'month') { const [y, m] = growthMonth.split('-').map(Number), pm = VZ.ymd(new Date(y, m - 2, 1)).slice(0, 7), running = growthMonth === t.slice(0, 7); prevFrom = pm + '-01'; prevTo = pm + '-' + (running ? t.slice(8) : '31'); prevLabel = running ? '지난달 같은 날까지' : '지난달'; }
    const prevTotal = prevFrom ? VZ.sumMinutes(all.filter(e => e.date >= prevFrom && e.date <= prevTo)) : null;
    const diff = prevTotal === null ? null : Math.round(total) - Math.round(prevTotal);
    const compare = diff === null ? '' : '<span class="growth-delta ' + (diff > 0 ? 'up' : diff < 0 ? 'down' : '') + '">' + prevLabel + ' ' + VZ.minutes(prevTotal) + (diff ? ' · ' + (diff > 0 ? '+' : '−') + VZ.minutes(Math.abs(diff)) : ' · 같아요') + '</span>';
    // per-song minutes
    const songMin = new Map(); es.forEach(e => { const k = e.training ? '__train' : e.songId || '__none'; songMin.set(k, (songMin.get(k) || 0) + e.minutes); });
    const fileCounts = new Map(); recs.forEach(m => { const k = m.songId || '__none'; fileCounts.set(k, (fileCounts.get(k) || 0) + 1); });
    const songRows = [...(songMetric === 'files' ? fileCounts : songMin).entries()].sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...songRows.map(x => x[1]));
    // Keep every bar inside the selected period and use an explicit column count.
    const cols = [];
    let chartTitle;
    if (period === 'week') {
      chartTitle = '요일별 연습';
      for (let i = 0; i < 7; i++) { const d = VZ.ymd(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)); cols.push([['월', '화', '수', '목', '금', '토', '일'][i], VZ.sumMinutes(es.filter(e => e.date === d)), '', d === t]); }
    } else if (period === 'month') {
      chartTitle = '선택한 달의 주간 연습';
      const [year, month] = growthMonth.split('-').map(Number), last = new Date(year, month, 0).getDate();
      for (let day = 1; day <= last; day += 7) { const end = Math.min(last, day + 6); cols.push([day + '–' + end + '일', VZ.sumMinutes(es.filter(e => { const d = Number(e.date.slice(8)); return d >= day && d <= end; }))]); }
    } else if (period === '28') {
      chartTitle = '최근 28일 · 7일 단위';
      for (let i = 0; i < 4; i++) { const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 27 + i * 7), end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6), a = VZ.ymd(start), b = VZ.ymd(end); cols.push([(start.getMonth() + 1) + '/' + start.getDate(), VZ.sumMinutes(es.filter(e => e.date >= a && e.date <= b))]); }
    } else {
      chartTitle = '전체 주별 연습';
      const firstDate = es.map(e => e.date).sort()[0] || VZ.ymd(monday);
      const earliest = VZ.parseYmd(firstDate) || monday;
      const cursor = new Date(earliest.getFullYear(), earliest.getMonth(), earliest.getDate() - ((earliest.getDay() + 6) % 7));
      const sums = new Map();
      es.forEach(entry => { const d = VZ.parseYmd(entry.date); if (!d) return; const key = VZ.ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))); sums.set(key, (sums.get(key) || 0) + entry.minutes); });
      while (cursor <= monday) { const key = VZ.ymd(cursor); cols.push([(cursor.getMonth() + 1) + '/' + cursor.getDate(), sums.get(key) || 0, key]); cursor.setDate(cursor.getDate() + 7); }

    }
    const cmax = Math.max(1, ...cols.map(c => c[1]));
    const trend = db.practices.filter(p => p.rating > 0 && inP(p.date)).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
    const label = period === 'month' ? growthMonth.replace('-', '년 ') + '월' : {week:'이번 주', '28':'최근 28일', all:'전체'}[period];
    const previousChart = host.querySelector('[data-chart-scroll]');
    const previousScroll = previousChart && previousChart.scrollWidth > previousChart.clientWidth && previousChart.scrollLeft < previousChart.scrollWidth - previousChart.clientWidth - 2 ? previousChart.scrollLeft : undefined;
    host.innerHTML = '<div class="stat stat-hero"><span class="stat-label">' + label + ' 연습 시간</span><b>' + VZ.minutes(total) + '</b><span class="small muted">' + days + '일 연습' + (fileTotal ? '<span data-file-time> · 녹음·파일 ' + VZ.minutes(fileTotal) + ' 포함</span>' : '') + '</span>' + compare + '</div>' +
      '<div class="stats stats-mini"><div class="stat"><b>' + recs.length + '개</b><span>녹음</span></div><div class="stat"><b>' + doneTasks.length + '개</b><span>완료한 숙제</span></div><div class="stat"><b>' + (avg === '–' ? '–' : '★' + avg) + '</b><span>평균 만족도</span></div><div class="stat"><b>' + VZ.minutes(allTotal) + '</b><span>누적 연습 시간</span></div></div>' +
      '<h2 class="sec">' + chartTitle + ' <span class="small muted" style="font-weight:500">단위: 분</span></h2>' + (period === 'all' ? '<div class="growth-chart-nav"><button type="button" class="btn sm secondary" data-chart-prev aria-label="이전 주 보기">←</button><span class="small muted">좌우로 밀어 모든 주 보기</span><button type="button" class="btn sm secondary" data-chart-next aria-label="다음 주 보기">→</button></div>' : '') + '<div class="card growth-chart"><div class="growth-chart-scroll" data-chart-scroll tabindex="0" role="region" aria-label="주별 연습 그래프"><div class="week" data-growth-chart style="grid-template-columns:repeat(' + cols.length + ',minmax(0,1fr));' + (period === 'all' ? 'min-width:' + Math.max(1, cols.length) * 48 + 'px' : '') + '">' + cols.map(([k, v, date, now]) => '<div title="' + esc((date ? date + ' 주 · ' : '') + VZ.minutes(v)) + '"' + (now ? ' class="today"' : '') + '><span style="font-size:10px">' + (v ? Math.round(v) : '') + '</span><span class="col' + (v ? '' : ' zero') + '" style="height:' + Math.max(3, Math.round(v / cmax * 80)) + 'px"></span>' + k + '</div>').join('') + '</div></div></div>' +
      '<h2 class="sec">곡별 연습량</h2><div class="seg growth-metric" role="group" aria-label="곡별 연습량 기준"><button type="button" data-song-metric="minutes" aria-pressed="' + (songMetric === 'minutes') + '">분</button><button type="button" data-song-metric="files" aria-pressed="' + (songMetric === 'files') + '">횟수(파일 수)</button></div><p class="small muted">' + (songMetric === 'files' ? '저장된 음원 파일 1개를 1회로 계산해요. 레슨·연습에 연결된 파일도 한 번만 세어요.' : '직접 입력한 실제 연습 시간만 합산해요. 녹음·파일 길이는 자동으로 더하지 않아요.') + '</p>' + (songRows.length ? '<div class="card bars">' + songRows.map(([k, v], i) => '<' + (VZ.song(k) ? 'a href="#/song/' + encodeURIComponent(k) + '"' : 'div') + ' class="bar' + (i >= 8 && !songsOpen ? ' more-hidden' : '') + '" data-song-stat="' + esc(k) + '"><span class="ellipsis" title="' + esc(k === '__train' ? '보컬 트레이닝' : k === '__none' ? '곡 미지정' : VZ.songTitle(k) || '삭제된 곡') + '">' + esc(k === '__train' ? '보컬 트레이닝' : k === '__none' ? '곡 미지정' : VZ.songTitle(k) || '삭제된 곡') + '</span><span class="track"><span class="fill" style="width:' + Math.round(v / max * 100) + '%;display:block"></span></span><span>' + (songMetric === 'files' ? v + '회' : v < 0.5 ? '1분 미만' : VZ.minutes(v)) + '</span></' + (VZ.song(k) ? 'a' : 'div') + '>').join('') + (songRows.length > 8 ? '<button type="button" class="btn ghost sm block" data-songs-more>' + (songsOpen ? '접기' : '나머지 ' + (songRows.length - 8) + '곡 더 보기') + '</button>' : '') + '</div>' : VZ.empty('chart-bar', label + ' 연습 기록이 없어요.', '<button type="button" class="btn sm" data-log>연습 기록하기</button>')) +
      '<h2 class="sec">만족도 추이 <span class="small muted" style="font-weight:500">연습 별점 · 최근 ' + trend.length + '개</span></h2>' + (trend.length >= 2 ? '<div class="card"><div class="week rating-trend" style="grid-template-columns:repeat(' + trend.length + ',minmax(0,1fr))">' + trend.map(p => '<div title="' + esc(p.date) + ' ★' + p.rating + '"><span class="rating-val">★' + p.rating + '</span><span class="col" style="height:' + p.rating * 14 + 'px"></span>' + Number(p.date.slice(5, 7)) + '/' + Number(p.date.slice(8)) + '</div>').join('') + '</div></div>' : '<p class="small muted" style="margin:0 4px">만족도를 기록한 연습이 2개 이상이면 추이를 보여 드려요.</p>') +
      '<h2 class="sec">기록 요약</h2><div class="card small" style="display:grid;gap:6px">' + summary(ps, recs, doneTasks, label, es) + '</div>' +
      '<div class="btn-row" style="margin-top:16px"><a class="btn secondary" href="#/vocal-lab"><i class="ph ph-waveform"></i>보컬 연구소</a><a class="btn secondary" href="#/library"><i class="ph ph-waveform"></i>보관함</a></div>';
    const scroll = host.querySelector('[data-chart-scroll]');
    if (period === 'all') scroll.scrollLeft = previousScroll ?? scroll.scrollWidth;
    host.querySelector('[data-chart-prev]')?.addEventListener('click', () => scroll.scrollBy({left:-Math.max(144, scroll.clientWidth * .8), behavior:'smooth'}));
    host.querySelector('[data-chart-next]')?.addEventListener('click', () => scroll.scrollBy({left:Math.max(144, scroll.clientWidth * .8), behavior:'smooth'}));
    host.querySelectorAll('[data-song-metric]').forEach(button => button.onclick = () => { songMetric = button.dataset.songMetric; draw(media); });
    host.querySelector('[data-songs-more]')?.addEventListener('click', () => { songsOpen = !songsOpen; draw(media); });
    host.querySelector('[data-log]')?.addEventListener('click', () => VZ.practiceSheet());
  };
  function summary(ps, recs, tasks, label, es) {
    if (!ps.length && !recs.length) return '<span class="muted">' + label + ' 기록이 아직 없어요. 녹음하거나 연습을 기록하면 요약이 생겨요.</span>';
    const lines = [];
    const train = ps.filter(p => p.practiceMode === 'training').reduce((a, p) => a + VZ.practiceMinutes(p), 0), song = ps.filter(p => p.practiceMode !== 'training').reduce((a, p) => a + VZ.practiceMinutes(p), 0);
    if (ps.length) lines.push(label + ' ' + ps.length + '번 연습했어요 (곡 연습 ' + VZ.minutes(song) + ', 트레이닝 ' + VZ.minutes(train) + ').');

    const top = [...es.reduce((m, e) => e.songId ? m.set(e.songId, (m.get(e.songId) || 0) + e.minutes) : m, new Map())].sort((a, b) => b[1] - a[1])[0];
    if (top && VZ.songTitle(top[0])) lines.push('가장 많이 연습한 곡은 “' + VZ.songTitle(top[0]) + '”이에요.');
    if (recs.length) lines.push('녹음 ' + recs.length + '개를 남겼어요. 녹음 길이는 연습 시간에 자동으로 더하지 않아요.');
    const open = VZ.db.assignments.filter(x => x.status !== 'done').length;
    lines.push('완료한 숙제 ' + tasks.length + '개 · 남은 숙제 ' + open + '개.');
    lines.push('<span class="muted">기록과 메모를 집계한 요약이에요. 음정·호흡·발성은 평가하지 않아요.</span>');
    return lines.map(x => '<div>' + (x.startsWith('<') ? x : esc(x)) + '</div>').join('');
  }
  draw(M.cached());
  const media = await M.list().catch(() => []); if (host.isConnected) draw(media);
  if (await M.fillDurations(media) && host.isConnected) draw(media);
}});

/* ---------- 설정 ---------- */
VZ.route('settings', {title:'설정', back:true, tab:'home', noAutoRefresh:true, render() {
  return '<div class="vz-settings">' +
    '<section class="vz-settings-account" aria-label="로그인 계정"><div class="vz-settings-cloud" data-cloud></div><span class="vz-sync-summary" data-sync-summary aria-hidden="true"></span></section>' +
    '<section class="vz-journey" aria-label="나의 노래 기록"><div class="vz-journey-content" data-journey><strong>기록을 불러오는 중이에요</strong></div></section>' +
    '<section class="vz-settings-section"><h2>분석</h2><div class="list icons vz-settings-list" data-auto-analysis></div></section>' +
    '<section class="vz-settings-section"><h2>관리</h2><div class="list icons vz-settings-list"><button type="button" class="item" data-cats><i class="ph ph-tag"></i><span class="item-main"><span class="item-title">트레이닝 항목</span><span class="item-sub">발성·호흡 연습 분류</span></span><i class="ph ph-caret-right chev"></i></button><a class="item" href="#/storage"><i class="ph ph-hard-drives"></i><span class="item-main"><span class="item-title">저장 공간</span><span class="item-sub" data-storage-status>확인 중…</span></span><i class="ph ph-caret-right chev"></i></a><details class="vz-settings-backup"><summary class="item"><i class="ph ph-archive"></i><span class="item-main"><span class="item-title">기록 백업·복원</span><span class="item-sub">필요할 때만 사용</span></span><i class="ph ph-caret-down chev"></i></summary><div class="vz-settings-backup-actions"><p>JSON 기록만 포함해요. 음성·영상 원본은 포함되지 않아요.</p><button type="button" data-export>기록 내보내기</button><label>기록 불러오기<input type="file" accept="application/json,.json" class="sr-only" data-import-json></label></div></details></div></section>' +
    '<p class="vz-settings-version">VOCAL.zip v' + VZ.version + '</p>' +
    '</div>';
}, mount(main) {
  const journey = main.querySelector('[data-journey]');
  const drawJourney = media => {
    if (!journey.isConnected) return;
    const valid = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !!VZ.parseYmd(d) && VZ.ymd(VZ.parseYmd(d)) === d && d <= VZ.today();
    const accountId = window.vzipCloudUserId?.() || localStorage.getItem('vzip_cloud_linked_user') || '';
    const shows = (VZ.db.performances || []).filter(p => accountId && p.ownerId === accountId);
    const dates = [...media.map(M.dateOf), ...VZ.db.lessons.map(l => l.date), ...shows.flatMap(p => [p.start, ...(p.sessions || []).map(x => x.date)])].filter(valid).sort();
    const first = dates[0];
    let duration = '';
    if (first) {
      const a = VZ.parseYmd(first), b = VZ.parseYmd(VZ.today());
      let months = (b.getFullYear() - a.getFullYear()) * 12 + b.getMonth() - a.getMonth() - (b.getDate() < a.getDate() ? 1 : 0);
      months = Math.max(0, months);
      const years = Math.floor(months / 12), rest = months % 12;
      duration = months ? [years ? years + '년' : '', rest ? rest + '개월' : ''].filter(Boolean).join(' ') : Math.max(1, VZ.daysBetween(first, VZ.today()) + 1) + '일';
    }
    journey.innerHTML =
      (first ? '<strong><span>노래가 쌓인 시간</span><em>' + duration + '</em><small class="vz-journey-date">첫 기록 ' + esc(first.replace(/-/g, '.')) + '</small></strong>' : '<strong><span>노래가 쌓인 시간</span><em>첫 기록을 기다려요</em><small class="vz-journey-date">녹음·레슨·공연을 남겨보세요</small></strong>') +
      '<div class="vz-journey-stats"><div><span>내 곡</span><b>' + VZ.db.songs.length + '</b></div><div><span>녹음</span><b>' + media.length + '</b></div><div><span>레슨</span><b>' + VZ.db.lessons.length + '</b></div></div>';
  };
  drawJourney(M.cached());
  M.list().then(drawJourney).catch(() => {});
  VZ.autoAnalysisSettings?.(main.querySelector('[data-auto-analysis]')); // app/auto-analysis.js
  const root = document.getElementById('vzip-cloud-root');
  if (root) {
    main.querySelector('[data-cloud]').append(root); root.hidden = false;
    // One main action; the manual backup/restore tools stay one tap away.
    const box = root.querySelector('#cloud-signed-in .cloud-actions');
    if (box && !root.querySelector('.cloud-more')) {
      const more = document.createElement('details'); more.className = 'cloud-more';
      more.innerHTML = '<summary>동기화·백업 도구</summary><p class="small muted" data-cloud-detail-status style="margin:6px 0"></p><div class="cloud-actions"></div>';
      for (const id of ['cloud-upload', 'cloud-download', 'cloud-media-upload', 'cloud-media-download']) { const b = root.querySelector('#' + id); if (b) more.lastChild.append(b); }
      box.after(more);
      const out = root.querySelector('#cloud-logout'); if (out) more.append(out);
      const who = root.querySelector('#cloud-user');
      if (who && !who.closest('.cloud-account')) { const row = document.createElement('div'); row.className = 'cloud-account'; row.innerHTML = '<i class="ph-fill ph-user-circle"></i><div><small>로그인 계정</small></div>'; who.before(row); row.lastChild.append(who); }
    }
    const statusLine = root.querySelector('#cloud-status'), accountRow = root.querySelector('.cloud-account');
    if (statusLine && accountRow) accountRow.after(statusLine);
    main._vzSyncCleanup?.();
    const summary = main.querySelector('[data-sync-summary]');
    const paintSync = () => {
      if (!summary.isConnected) return;
      const raw = statusLine?.textContent || '', signed = !root.querySelector('#cloud-signed-in')?.hidden;
      const state = !signed ? 'off' : /오류|실패|확인 필요|못했/.test(raw) ? 'error' : /진행 중|합치는 중|연결 확인 중|동기화 중/.test(raw) ? 'busy' : /저장했어요|자동으로 서버에 저장/.test(raw) ? 'ok' : 'busy';
      summary.dataset.state = state;
      summary.textContent = state === 'off' ? '로그인하면 기록을 동기화할 수 있어요' : state === 'error' ? '동기화 확인 필요' : state === 'ok' ? '자동 동기화됨' : '동기화 상태 확인 중';
      const detail = root.querySelector('[data-cloud-detail-status]');
      if (detail) detail.textContent = raw;
    };
    const observer = new MutationObserver(paintSync);
    if (statusLine) observer.observe(statusLine, {childList:true, characterData:true, subtree:true});
    const signedPanel = root.querySelector('#cloud-signed-in');
    if (signedPanel) observer.observe(signedPanel, {attributes:true, attributeFilter:['hidden']});
    window.addEventListener('vzip:auth-changed', paintSync);
    main._vzSyncCleanup = () => { observer.disconnect(); window.removeEventListener('vzip:auth-changed', paintSync); };
    paintSync();
    const syncButton = root.querySelector('#cloud-upload');
    if (syncButton) { syncButton.textContent = '지금 동기화'; syncButton.setAttribute('aria-label', '지금 동기화: 기기와 클라우드 기록 합치기'); }
  }
  const status = main.querySelector('[data-storage-status]');
  (async () => {
    const r2 = window.VzipR2, signed = !!window.vzipCloudSignedIn?.();
    const text = !signed ? '로그인하면 클라우드에 백업돼요' : !r2?.configured() ? '기존 클라우드 사용 중' : await r2.ready() ? 'R2 연결됨 · 파일 위치 확인·옮기기' : 'R2 확인 필요 · 기존 클라우드 사용 중';
    if (status.isConnected) status.textContent = text;
  })();
  main.querySelector('[data-export]').onclick = () => {
    const blob = new Blob([JSON.stringify(VZ.db, null, 2)], {type:'application/json'}), url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'vocalzip-backup-' + VZ.today() + '.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  main.querySelector('[data-import-json]').onchange = async e => {
    const file = e.target.files[0]; e.target.value = ''; if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!['lessons', 'practices', 'assignments', 'categories', 'songs'].every(k => Array.isArray(data[k]))) throw Error('VOCAL.zip 백업 형식이 아니에요.');
      if (!await VZ.confirm('백업 불러오기', '백업 파일의 기록(레슨 ' + data.lessons.length + '·연습 ' + data.practices.length + '·곡 ' + data.songs.length + ')을 현재 기록과 합칠까요? 어느 쪽 기록도 지우지 않아요.', {ok:'합치기'})) return;
      localStorage.setItem('vzip_before_import_' + Date.now(), JSON.stringify(VZ.db));
      const merged = window.VzipDataMerge.merge(VZ.db, data).data;
      if (VZ.change(d => { Object.assign(d, merged); })) VZ.toast('백업을 합쳤어요.');
    } catch (err) { VZ.toast('불러오지 못했어요: ' + err.message, 'error'); }
  };
  main.querySelector('[data-cats]').onclick = categorySheet;
}, leave() {
  document.getElementById('view')?._vzSyncCleanup?.();
  const root = document.getElementById('vzip-cloud-root'), park = document.getElementById('vzip-park');
  if (root && park) { park.append(root); }
}});
function categorySheet() {
  const draw = el => {
    el.querySelector('[data-cl]').innerHTML = VZ.db.categories.map(c => '<div class="card flat" style="margin-bottom:8px"><div class="row between"><strong>' + esc(c.name) + '</strong></div><div class="chips" style="flex-wrap:wrap;margin:8px 0">' + (c.items || []).map(i => '<span class="badge">' + esc(i + (c.sub?.[i]?.length ? ' › ' + c.sub[i].join(', ') : '')) + '</span>').join('') + '</div><form class="row" data-add-item="' + esc(c.id) + '"><input type="text" maxlength="60" placeholder="세부 항목 추가" aria-label="' + esc(c.name) + ' 세부 항목" style="min-height:44px"><button type="submit" class="btn sm secondary">추가</button></form></div>').join('');
  };
  VZ.sheet({title:'트레이닝 항목', body:'<div data-cl></div><form class="row" data-add-cat style="margin-top:8px"><input type="text" maxlength="40" placeholder="새 분류 (예: 고음)" aria-label="새 분류" style="min-height:44px"><button type="submit" class="btn sm">분류 추가</button></form>',
    onMount:el => {
      draw(el);
      el.addEventListener('submit', e => {
        e.preventDefault();
        const input = e.target.querySelector('input'), v = input.value.trim(); if (!v) return;
        const ok = e.target.dataset.addItem ? VZ.change(d => { const c = d.categories.find(x => x.id === e.target.dataset.addItem); c.items ||= []; if (!c.items.includes(v)) c.items.push(v); }, {silent:true})
          : VZ.change(d => d.categories.push({id:VZ.uid(), name:v, items:[]}), {silent:true});
        if (ok) { draw(el); el.querySelector('[data-add-cat] input').value = ''; }
      });
    }});
}

/* ---------- 공유받은 파일 (share target) ---------- */
async function receiveShared() {
  const params = new URLSearchParams(location.search);
  if (params.has('share_error')) { VZ.toast('공유한 파일을 받지 못했어요. 앱에서 직접 가져와 주세요.', 'error'); history.replaceState(null, '', location.pathname + location.hash); return; }
  if (!params.has('shared')) return;
  history.replaceState(null, '', location.pathname + '#/library');
  try {
    const db = await new Promise((res, rej) => { const r = indexedDB.open('vzip_share_inbox_v1', 1); r.onupgradeneeded = () => r.result.createObjectStore('files', {keyPath:'id'}); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const files = await new Promise((res, rej) => { const t = db.transaction('files', 'readonly').objectStore('files').getAll(); t.onsuccess = () => res(t.result || []); t.onerror = () => rej(t.error); });
    let n = 0;
    for (const f of files) {
      const type = M.typeOf({name:f.name, type:f.type});
      await M.importFile(new File([f.blob], f.name || '공유 파일', {type, lastModified:f.lastModified || Date.now()}), {id:f.id, songId:'', song:''});
      await new Promise(res => { const t = db.transaction('files', 'readwrite'); t.objectStore('files').delete(f.id); t.oncomplete = t.onerror = res; });
      n++;
    }
    db.close();
    if (n) VZ.toast('공유한 파일 ' + n + '개를 보관함에 저장했어요.');
  } catch (e) { VZ.toast('공유 파일 저장 실패: ' + e.message, 'error'); }
}
VZ.receiveShared = receiveShared;
})();



