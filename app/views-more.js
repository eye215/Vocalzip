/* VOCAL.zip v6 views: 보관함, 가져오기, 비교, 성장, 설정. */
(() => {
'use strict';
const VZ = window.VZ, M = VZ.media, esc = VZ.esc;

/* ---------- 가져오기 ---------- */
let importRunning = false;
VZ.importSheet = ({songId = ''} = {}) => {
  if (importRunning) { VZ.toast('이미 파일을 가져오는 중이에요.', 'error'); return; }
  const signed = !!window.vzipCloudSignedIn?.();
  VZ.sheet({title:'파일 가져오기', body:'<div data-step1><label class="btn block" style="cursor:pointer"><i class="ph ph-folder-open"></i>음성·영상 파일 선택<input type="file" multiple accept="audio/*,video/*,.m4a,.mp3,.wav,.aac,.mov,.mp4,.m4v,.webm,.ogg,.flac" class="sr-only" data-file></label><p class="small muted">여러 파일을 한 번에 고를 수 있어요. 파일당 최대 1GB · 원본 음질 그대로 저장해요. 영상 파일은 음성만 추출해 음원으로 저장해요.' + (signed ? '' : '<br>로그인하지 않으면 25MB 이하 파일만 이 기기에 저장돼요.') + '</p></div><div data-step2 hidden></div>',
    foot:'<div data-foot hidden class="btn-row"><button type="button" class="btn ghost" data-cancel>취소</button><button type="button" class="btn" data-start style="flex:2">가져오기</button></div>',
    onClose:() => { if (importRunning) abort?.abort(); },
    onMount:(el, close) => {
      const wrap = el.parentNode, step2 = el.querySelector('[data-step2]'), foot = wrap.querySelector('[data-foot]');
      let rows = [];
      const songOpts = v => '<option value="">곡 미지정</option>' + VZ.songsNewest().map(s => '<option value="' + esc(s.id) + '"' + (s.id === v ? ' selected' : '') + '>' + esc(VZ.songLabel(s)) + '</option>').join('');
      el.querySelector('[data-file]').onchange = e => {
        const files = [...e.target.files]; e.target.value = '';
        if (!files.length) return;
        rows = files.map(file => {
          const type = M.typeOf(file);
          let error = '';
          if (!/^(audio|video)\//.test(type)) error = '지원하지 않는 형식이에요.';
          else if (!file.size) error = '빈 파일이에요.';
          else if (file.size > (window.VzipChunks?.MAX_SIZE || 1073741824)) error = '1GB를 넘는 파일은 가져올 수 없어요.';
          else if (file.size > M.LOCAL_LIMIT && !window.vzipCloudSignedIn?.()) error = '25MB 초과 파일은 로그인이 필요해요.';
          return {file, id:VZ.uid(), state:error ? 'invalid' : 'ready', error, songId, video:type.startsWith('video/')};
        });
        el.querySelector('[data-step1]').hidden = true; step2.hidden = false; foot.hidden = false;
        step2.innerHTML = (rows.length > 1 ? '<label class="field"><span>모든 파일의 곡 한 번에 지정</span><select data-bulk><option value="">선택…</option>' + songOpts('').replace('<option value="">곡 미지정</option>', '<option value="__none">곡 미지정</option>') + '</select></label>' : '') +
          '<p class="up-done" data-done role="status" hidden></p><div class="list up-saved" data-saved hidden></div><p class="small muted" style="margin-top:0">날짜를 비워 두면 파일 속 촬영·녹음 날짜(없으면 파일 수정일)로 자동 정리해요.</p><div class="stack" data-rows>' + rows.map((r, i) =>
          '<div class="up-row' + (r.state === 'invalid' ? ' failed' : '') + '" data-i="' + i + '"><div class="up-head"><strong title="' + esc(r.file.name) + '">' + esc(r.file.name) + '</strong><span class="small muted">' + VZ.size(r.file.size) + '</span></div>' +
          (r.state === 'invalid' ? '<div class="small" style="color:var(--danger)">' + esc(r.error) + ' (건너뜀)</div>' :
          (r.video ? '<span class="badge accent" style="justify-self:start">영상 → 음성만 저장</span>' : '') + '<select aria-label="' + esc(r.file.name) + ' 곡" data-song>' + songOpts(r.songId) + '</select><label class="up-date"><span>녹음 날짜 <em>비우면 자동</em></span><input type="date" aria-label="' + esc(r.file.name) + ' 날짜" data-date></label><div class="bar-mini"><i></i></div><div class="row between"><span class="small muted" data-st>대기 중</span><button type="button" class="btn sm ghost" data-retry hidden>다시 시도</button></div>') + '</div>').join('') + '</div><p class="small muted" data-summary role="status"></p>';
        step2.querySelector('[data-bulk]')?.addEventListener('change', ev => { const v = ev.target.value === '__none' ? '' : ev.target.value; if (!ev.target.value) return; step2.querySelectorAll('[data-song]').forEach(s => { s.value = v; }); });
        step2.querySelectorAll('[data-retry]').forEach(b => b.onclick = () => run([rows[+b.closest('[data-i]').dataset.i]]));
        wrap.querySelector('[data-start]').disabled = !rows.some(r => r.state === 'ready');
      };
      let abort = null; const savedItems = [];
      const ui = r => step2.querySelector('[data-i="' + rows.indexOf(r) + '"]');
      const setRow = (r, text, pct) => { const u = ui(r); u.querySelector('[data-st]').textContent = text; if (pct != null) u.querySelector('.bar-mini i').style.width = pct + '%'; u.classList.toggle('failed', r.state === 'failed' || r.state === 'cancelled'); u.classList.toggle('done', r.state === 'done'); u.querySelector('[data-retry]').hidden = !['failed', 'cancelled'].includes(r.state); };
      const run = async list => {
        if (importRunning) return;
        importRunning = true; abort = new AbortController();
        const start = wrap.querySelector('[data-start]'), cancel = wrap.querySelector('[data-cancel]');
        start.disabled = true; cancel.textContent = '업로드 중지';
        step2.querySelectorAll('[data-song],[data-date],[data-bulk],[data-retry]').forEach(x => { x.disabled = true; });
        try {
          for (const r of list) {
            if (abort.signal.aborted) { r.state = 'cancelled'; setRow(r, '취소됨'); continue; }
            const u = ui(r), sid = u.querySelector('[data-song]').value, date = u.querySelector('[data-date]').value;
            r.state = 'uploading'; setRow(r, '준비 중…', 2);
            try {
              const saved = await M.importFile(r.file, {id:r.id, songId:sid, song:VZ.songLabel(VZ.song(sid)), date}, p => typeof p === 'number' ? setRow(r, '업로드 ' + p + '%', p) : setRow(r, String(p)), abort.signal);
              r.state = 'done'; r.file = null;
              r.savedDate = VZ.dateLabel(M.dateOf(saved)) + ({metadata:' (파일 속 날짜)', 'file-modified':' (파일 수정일)', manual:' (직접 지정)'}[saved.dateSource] || '');
              // Finished files leave the list; one line keeps the count and dates.
              ui(r).hidden = true;
              const doneRows = rows.filter(x => x.state === 'done'), dates = [...new Set(doneRows.map(x => x.savedDate))];
              const line = step2.querySelector('[data-done]'); line.hidden = false;
              line.textContent = '✓ 저장 완료 ' + doneRows.length + '개 · ' + dates.slice(0, 3).join(', ') + (dates.length > 3 ? ' 외' : '');
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
          importRunning = false; cancel.textContent = '닫기';
          step2.querySelectorAll('[data-song],[data-date],[data-bulk],[data-retry]').forEach(x => { x.disabled = false; });
          const done = rows.filter(r => r.state === 'done').length, bad = rows.filter(r => ['failed', 'cancelled'].includes(r.state)).length;
          step2.querySelector('[data-summary]').textContent = '저장 ' + done + '개' + (bad ? ' · 실패/취소 ' + bad + '개 — 실패한 파일만 다시 시도할 수 있어요.' : '');
          start.hidden = true;
          if (done) M.invalidate();
          if (!bad && done) VZ.toast(done + '개 파일을 보관함에 저장했어요.');
        }
      };
      wrap.querySelector('[data-start]').onclick = () => run(rows.filter(r => r.state === 'ready'));
      wrap.querySelector('[data-cancel]').onclick = () => { if (importRunning) abort.abort(); else close(); };
    }});
};

/* ---------- 보관함 ---------- */
const lib = {kind:'all', origin:'all', song:'', q:''};
VZ.route('library', {title:'음원 보관함', back:true, tab:'record', actions:() => '<button type="button" class="icon-btn" data-imp aria-label="파일 가져오기"><i class="ph ph-upload-simple"></i></button>', render() {
  const chip = (k, v, label) => '<button type="button" class="chip" data-f="' + k + '" data-v="' + v + '" aria-pressed="' + (lib[k] === v) + '">' + label + '</button>';
  return '<div class="search" style="margin-bottom:10px"><i class="ph ph-magnifying-glass"></i><input type="search" placeholder="제목·메모 검색" aria-label="보관함 검색" data-q value="' + esc(lib.q) + '"></div>' +
    '<div class="chips" style="margin-bottom:8px">' + chip('kind', 'all', '전체') + chip('kind', 'audio', '음성') + chip('kind', 'video', '영상') + '<span style="width:8px;flex:none"></span>' + chip('origin', 'all', '레슨·연습') + chip('origin', 'lesson', '레슨') + chip('origin', 'practice', '연습') + '</div>' +
    '<select aria-label="곡 필터" data-song style="margin-bottom:12px;min-height:44px"><option value="">모든 곡</option><option value="__none"' + (lib.song === '__none' ? ' selected' : '') + '>곡 미지정</option>' + VZ.songsNewest().map(s => '<option value="' + esc(s.id) + '"' + (lib.song === s.id ? ' selected' : '') + '>' + esc(s.title) + '</option>').join('') + '</select>' +
    '<p class="small muted" data-count style="margin:0 4px 8px"></p><div data-l><div class="empty compact"><span class="muted">불러오는 중…</span></div></div>';
}, async mount(main) {
  document.querySelector('[data-imp]').onclick = () => VZ.importSheet();
  const l = main.querySelector('[data-l]');
  let media = [];
  const draw = () => {
    const q = lib.q.trim().toLowerCase();
    const list = media.filter(m => (lib.kind === 'all' || (lib.kind === 'video') === M.isVideo(m)) && (lib.origin === 'all' || M.owner(m).kind === lib.origin) &&
      (!lib.song || (lib.song === '__none' ? !VZ.song(m.songId) : m.songId === lib.song)) && (!q || (M.label(m) + ' ' + (m.review || '') + ' ' + VZ.songTitle(m.songId)).toLowerCase().includes(q)));
    const local = M.localOnly(media).length, b = M.backupStatus();
    main.querySelector('[data-count]').textContent = (M.cloudError() ? M.cloudError() + ' · ' : '') + list.length + '개 파일' +
      (b.running ? ' · 클라우드 백업 중 ' + (b.done + b.failed) + '/' + b.total : local ? ' · 기기에만 있는 파일 ' + local + '개' + (window.vzipCloudSignedIn?.() ? ' (곧 자동 백업)' : ' · 로그인하면 클라우드에 자동 백업돼요') : window.vzipCloudSignedIn?.() && media.length ? ' · 모두 클라우드에 백업됨' : '');
    l.innerHTML = list.length ? '<div class="list">' + list.map(VZ.mediaRow).join('') + '</div>' : VZ.empty('waveform', media.length ? '조건에 맞는 파일이 없어요.' : '아직 저장된 녹음이 없어요.', media.length ? '' : '<a class="btn sm" href="#/record">녹음하기</a>');
    if (list.length) VZ.wireMedia(l.firstChild, list);
  };
  main.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { lib[b.dataset.f] = b.dataset.v; main.querySelectorAll('[data-f="' + b.dataset.f + '"]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); M.stopAll(); draw(); });
  main.querySelector('[data-song]').onchange = e => { lib.song = e.target.value; draw(); };
  main.querySelector('[data-q]').oninput = e => { lib.q = e.target.value; draw(); };
  media = await M.list().catch(() => []); if (l.isConnected) draw();
  const onBackup = async () => { if (!l.isConnected) { window.removeEventListener('vzip:v6-backup', onBackup); return; } if (!M.backupStatus().running) media = await M.list().catch(() => media); if (l.isConnected && !l.querySelector('.media-open:not([hidden])')) draw(); };
  window.addEventListener('vzip:v6-backup', onBackup);
  if (M.localOnly(media).length) M.scheduleBackup(500);
  // Show filled lengths, but never close a player the user has open.
  if (await M.fillDurations(media) && l.isConnected && !l.querySelector('.media-open:not([hidden])')) draw();
}});

/* ---------- 비교 ---------- */
VZ.route('compare', {title:'녹음 비교', back:true, tab:'growth', noAutoRefresh:true, render() {
  return '<div data-c><div class="empty compact"><span class="muted">불러오는 중…</span></div></div>';
}, async mount(main, r) {
  const host = main.querySelector('[data-c]');
  const media = await M.list().catch(() => []); if (!host.isConnected) return;
  const q = r.query, A = media.find(m => m.id === q.get('a')), B = media.find(m => m.id === q.get('b'));
  let songId = q.get('song') || A?.songId || '';
  const pool = () => media.filter(m => !songId || m.songId === songId).sort((a, b) => M.dateOf(a).localeCompare(M.dateOf(b)) || (a.created || 0) - (b.created || 0));
  let a = A || null, b = B || null;
  if (!a && !b && pool().length >= 2) { a = pool()[0]; b = pool().at(-1); }
  if (a && !b) b = pool().filter(m => m.id !== a.id).at(-1) || null;
  const reports = VZ.db.comparisonReports || [];
  const pick = (which) => {
    const list = pool();
    VZ.sheet({title:which + ' 녹음 선택', body:list.length ? '<div class="list">' + list.map(m => '<button type="button" class="item" data-id="' + esc(m.id) + '"><span class="item-main"><span class="item-title">' + esc(M.label(m)) + '</span><span class="item-sub">' + esc(VZ.dateLabel(M.dateOf(m)) + ' · ' + VZ.clock(m.durationSeconds) + (m.rating ? ' · ★' + m.rating : '')) + '</span></span></button>').join('') + '</div>' : VZ.empty('waveform', '선택할 녹음이 없어요.'),
      onMount:(el, close) => el.onclick = e => { const btn = e.target.closest('[data-id]'); if (!btn) return; const m = media.find(x => x.id === btn.dataset.id); if (which === 'A') a = m; else b = m; close(); draw(); }});
  };
  let pa, pb, active = 'A';
  const draw = () => {
    pa?.destroy(); pb?.destroy();
    const saved = a && b ? reports.find(x => (x.firstId === a.id && x.secondId === b.id)) : null;
    const side = (tag, m) => '<div class="side' + (active === tag ? ' active' : '') + '" data-side="' + tag + '"><div class="row between" style="margin-bottom:8px"><div class="grow" style="min-width:0"><span class="tag">' + tag + '</span><strong>' + esc(m ? M.label(m) : '녹음 선택') + '</strong>' + (m ? '<div class="small muted">' + esc(VZ.dateLabel(M.dateOf(m)) + (m.rating ? ' · ★' + m.rating : '')) + '</div>' : '') + '</div><button type="button" class="btn sm ghost" data-pick="' + tag + '">변경</button></div>' + (m ? '<div data-p></div>' + (m.review ? '<p class="small muted" style="white-space:pre-wrap;margin:6px 0 0">' + esc(m.review) + '</p>' : '') : '') + '</div>';
    host.innerHTML = '<select aria-label="곡" data-song-f style="margin-bottom:10px;min-height:44px"><option value="">모든 곡</option>' + VZ.songsNewest().map(s => '<option value="' + esc(s.id) + '"' + (s.id === songId ? ' selected' : '') + '>' + esc(s.title) + '</option>').join('') + '</select>' +
      (pool().length >= 2 ? '<button type="button" class="btn sm secondary" data-first-last style="margin-bottom:10px"><i class="ph ph-lightning"></i>처음 vs 최근 바로 비교</button>' : '') +
      '<div class="ab">' + side('A', a) + side('B', b) + '</div>' +
      (a && b ? '<button type="button" class="btn block" data-switch style="margin-top:10px"><i class="ph ph-swap"></i>A/B 전환 (같은 위치에서)</button><div class="chips" style="margin-top:10px" role="group" aria-label="재생 속도">' + [0.5, 0.75, 1, 1.25].map(s => '<button type="button" class="chip" data-rate="' + s + '" aria-pressed="' + (s === 1) + '">' + s + '×</button>').join('') + '</div>' +
        '<h2 class="sec">비교 메모</h2><form id="cmp-form"><label class="field"><span>달라진 점</span><textarea name="notes" maxlength="5000" placeholder="예: 고음에서 힘이 덜 들어감">' + esc(saved?.notes || '') + '</textarea></label><label class="field"><span>다음 연습 목표</span><textarea name="goal" rows="2" maxlength="3000" style="min-height:64px">' + esc(saved?.goal || '') + '</textarea></label><div class="btn-row"><button type="button" class="btn secondary" data-ai><i class="ph ph-sparkle"></i>메모 AI 정리</button><button type="submit" class="btn">' + (saved ? '메모 수정' : '메모 저장') + '</button></div><p class="small muted" data-ai-out style="white-space:pre-wrap"></p><p class="small muted">AI는 작성한 메모만 정리해요. 녹음의 음정·호흡·발성을 측정하지 않아요.</p></form>' : '<p class="small muted">두 녹음을 고르면 A/B로 번갈아 들을 수 있어요.</p>') +
      (reports.length ? '<h2 class="sec">저장한 비교</h2><div class="list">' + [...reports].sort((x, y) => (y.created || 0) - (x.created || 0)).slice(0, 20).map(x => '<a class="item" href="#/compare?a=' + esc(x.firstId) + '&b=' + esc(x.secondId) + '"><span class="item-main"><span class="item-title">' + esc(x.song || '비교') + '</span><span class="item-sub">' + esc((x.firstName || '') + ' ↔ ' + (x.secondName || '') + (x.notes ? ' · ' + x.notes.slice(0, 40) : '')) + '</span></span><i class="ph ph-caret-right chev"></i></a>').join('') + '</div>' : '');
    host.querySelector('[data-song-f]').onchange = e => { songId = e.target.value; a = b = null; if (pool().length >= 2) { a = pool()[0]; b = pool().at(-1); } draw(); };
    host.querySelector('[data-first-last]')?.addEventListener('click', () => { a = pool()[0]; b = pool().at(-1); draw(); });
    host.querySelectorAll('[data-pick]').forEach(x => x.onclick = () => pick(x.dataset.pick));
    if (a) pa = M.player(host.querySelector('[data-side="A"] [data-p]'), a, {tools:true, speed:false});
    if (b) pb = M.player(host.querySelector('[data-side="B"] [data-p]'), b, {tools:true, speed:false});
    const mark = () => host.querySelectorAll('[data-side]').forEach(s => s.classList.toggle('active', s.dataset.side === active));
    pa && pa.el.addEventListener('play', () => { active = 'A'; mark(); });
    pb && pb.el.addEventListener('play', () => { active = 'B'; mark(); });
    host.querySelector('[data-switch]')?.addEventListener('click', async () => {
      const from = active === 'A' ? pa : pb, to = active === 'A' ? pb : pa;
      const t = from.el.currentTime; from.pause(); await to.load().catch(() => {});
      to.seek(t); to.play();
    });
    host.querySelectorAll('[data-rate]').forEach(x => x.onclick = () => { const v = +x.dataset.rate; pa?.setRate(v); pb?.setRate(v); host.querySelectorAll('[data-rate]').forEach(y => y.setAttribute('aria-pressed', String(y === x))); });
    const form = host.querySelector('#cmp-form');
    if (form) {
      form.onsubmit = e => {
        e.preventDefault();
        const entry = {firstId:a.id, secondId:b.id, firstName:M.label(a), secondName:M.label(b), firstDate:a.created, secondDate:b.created, song:VZ.songTitle(a.songId && a.songId === b.songId ? a.songId : '') || '서로 다른 곡 또는 미지정', songId:a.songId && a.songId === b.songId ? a.songId : '', notes:form.notes.value, goal:form.goal.value, firstRating:a.rating ?? null, secondRating:b.rating ?? null, firstReview:a.review || '', secondReview:b.review || ''};
        const ok = VZ.change(d => { d.comparisonReports ||= []; const x = d.comparisonReports.find(y => y.firstId === a.id && y.secondId === b.id); if (x) Object.assign(x, entry); else d.comparisonReports.push({id:VZ.uid(), created:Date.now(), ...entry}); }, {silent:true});
        if (ok) { delete document.getElementById('view').dataset.dirty; VZ.toast('비교 메모를 저장했어요.'); }
      };
      host.querySelector('[data-ai]').onclick = async () => {
        const out = host.querySelector('[data-ai-out]'), notes = form.notes.value.trim(), btn = host.querySelector('[data-ai]');
        if (notes.length < 10) { out.textContent = '정리할 메모를 10자 이상 작성해 주세요.'; return; }
        const token = await window.vzipCloudAccessToken?.(); if (!token) { out.textContent = 'AI 정리는 로그인 후 사용할 수 있어요.'; return; }
        btn.disabled = true; out.textContent = '메모를 정리하는 중…';
        try {
          const res = await fetch('https://chxnbtiyuyhiywzeshis.supabase.co/functions/v1/vocal-ai', {method:'POST', headers:{'Content-Type':'application/json', Authorization:'Bearer ' + token, apikey:VZ.anonKey}, body:JSON.stringify({mode:'comparison', notes})});
          const json = await res.json(); if (!res.ok) throw Error(json.error || 'AI 정리 실패');
          out.textContent = json.analysis + '\n\n※ 작성한 메모를 정리한 결과예요. 녹음을 직접 분석하지 않았어요.';
        } catch (e) { out.textContent = 'AI 정리 실패: ' + e.message; } finally { btn.disabled = false; }
      };
    }
  };
  draw();
}, leave() { M.destroyAll(); }});
VZ.anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNoeG5idGl5dXloaXl3emVzaGlzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM2MDA0ODcsImV4cCI6MjEwOTE3NjQ4N30.65LSQMuaq8MQOpFUjCSyRT4ZITtNxKF3c_xa_ZVEi_E';

/* ---------- 성장 ---------- */
let period = 'week';
VZ.route('growth', {title:'성장', render() {
  return '<div class="seg" style="margin-bottom:12px">' + [['week', '이번 주'], ['28', '최근 28일'], ['all', '전체']].map(([k, v]) => '<button type="button" data-pd="' + k + '" aria-pressed="' + (period === k) + '">' + v + '</button>').join('') + '</div><div data-g></div>';
}, async mount(main) {
  main.querySelectorAll('[data-pd]').forEach(b => b.onclick = () => { period = b.dataset.pd; VZ.render(); });
  const host = main.querySelector('[data-g]');
  const draw = media => {
    const db = VZ.db, today = new Date(), t = VZ.today();
    const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
    const from = period === 'week' ? VZ.ymd(monday) : period === '28' ? VZ.ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 27)) : '';
    const inP = d => !!d && (!from || d >= from) && d <= t;
    const ps = db.practices.filter(p => inP(p.date));
    // Practice records + recording/import lengths not already counted in a record.
    const all = VZ.timeEntries(media), es = all.filter(e => inP(e.date));
    const total = VZ.sumMinutes(es), fileTotal = VZ.sumMinutes(es.filter(e => e.kind === 'recording'));
    const days = new Set(es.map(e => e.date)).size;
    const recs = media.filter(m => inP(M.dateOf(m)));
    const doneTasks = db.assignments.filter(x => x.status === 'done' && (period === 'all' || (x.doneAt && inP(VZ.ymd(new Date(x.doneAt))))));
    const rated = ps.filter(p => p.rating > 0), avg = rated.length ? (rated.reduce((a, p) => a + p.rating, 0) / rated.length).toFixed(1) : '–';
    const allTotal = VZ.sumMinutes(all);
    // per-song minutes
    const songMin = new Map(); es.forEach(e => { const k = e.training ? '__train' : e.songId || '__none'; songMin.set(k, (songMin.get(k) || 0) + e.minutes); });
    const songRows = [...songMin.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    const max = Math.max(1, ...songRows.map(x => x[1]));
    // last 7 days or 8 weeks bars
    const cols = [];
    if (period === 'week') for (let i = 0; i < 7; i++) { const d = VZ.ymd(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)); cols.push([['월', '화', '수', '목', '금', '토', '일'][i], VZ.sumMinutes(all.filter(e => e.date === d))]); }
    else for (let i = 7; i >= 0; i--) { const s = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - i * 7), e = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 6); const a = VZ.ymd(s), b = VZ.ymd(e); cols.push([(s.getMonth() + 1) + '/' + s.getDate(), VZ.sumMinutes(all.filter(e => e.date >= a && e.date <= b))]); }
    const cmax = Math.max(1, ...cols.map(c => c[1]));
    const trend = db.practices.filter(p => p.rating > 0 && inP(p.date)).sort((a, b) => a.date.localeCompare(b.date)).slice(-14);
    const label = {week:'이번 주', '28':'최근 28일', all:'전체'}[period];
    host.innerHTML = '<div class="stats"><div class="stat"><b>' + VZ.minutes(total) + '</b><span>' + label + ' 연습 시간</span>' + (fileTotal ? '<span class="small muted" data-file-time style="display:block">녹음·파일 ' + VZ.minutes(fileTotal) + ' 포함</span>' : '') + '</div><div class="stat"><b>' + days + '일</b><span>연습한 날</span></div><div class="stat"><b>' + recs.length + '개</b><span>녹음</span></div><div class="stat"><b>' + doneTasks.length + '개</b><span>완료한 숙제</span></div><div class="stat"><b>' + avg + '</b><span>평균 만족도</span></div><div class="stat"><b>' + VZ.minutes(allTotal) + '</b><span>누적 연습 시간</span></div></div>' +
      '<h2 class="sec">' + (period === 'week' ? '요일별 연습' : '주별 연습 (최근 8주)') + '</h2><div class="card"><div class="week">' + cols.map(([k, v]) => '<div title="' + VZ.minutes(v) + '"><span style="font-size:10px">' + (v ? Math.round(v) : '') + '</span><span class="col' + (v ? '' : ' zero') + '" style="height:' + Math.max(3, Math.round(v / cmax * 80)) + 'px"></span>' + k + '</div>').join('') + '</div></div>' +
      '<h2 class="sec">곡별 연습량</h2>' + (songRows.length ? '<div class="card bars">' + songRows.map(([k, v]) => '<div class="bar"><span class="ellipsis">' + esc(k === '__train' ? '보컬 트레이닝' : k === '__none' ? '곡 미지정' : VZ.songTitle(k) || '삭제된 곡') + '</span><span class="track"><span class="fill" style="width:' + Math.round(v / max * 100) + '%;display:block"></span></span><span>' + VZ.minutes(v) + '</span></div>').join('') + '</div>' : VZ.empty('chart-bar', label + ' 연습 기록이 없어요.', '<button type="button" class="btn sm" data-log>연습 기록하기</button>')) +
      '<h2 class="sec">만족도 추이</h2>' + (trend.length >= 2 ? '<div class="card"><div class="week" style="grid-template-columns:repeat(' + trend.length + ',1fr);height:90px">' + trend.map(p => '<div title="' + esc(p.date) + ' ★' + p.rating + '"><span class="col" style="height:' + p.rating * 14 + 'px;background:#f2b31b"></span>' + VZ.parseYmd(p.date).getDate() + '</div>').join('') + '</div></div>' : '<p class="small muted" style="margin:0 4px">만족도를 기록한 연습이 2개 이상이면 추이를 보여 드려요.</p>') +
      '<h2 class="sec">기록 요약</h2><div class="card small" style="display:grid;gap:6px">' + summary(ps, recs, doneTasks, label, es) + '</div>' +
      '<div class="btn-row" style="margin-top:16px"><a class="btn secondary" href="#/compare"><i class="ph ph-arrows-left-right"></i>녹음 비교</a><a class="btn secondary" href="#/library"><i class="ph ph-waveform"></i>보관함</a></div>';
    host.querySelector('[data-log]')?.addEventListener('click', () => VZ.practiceSheet());
  };
  function summary(ps, recs, tasks, label, es) {
    if (!ps.length && !recs.length) return '<span class="muted">' + label + ' 기록이 아직 없어요. 녹음하거나 연습을 기록하면 요약이 생겨요.</span>';
    const lines = [];
    const train = ps.filter(p => p.practiceMode === 'training').reduce((a, p) => a + VZ.practiceMinutes(p), 0), song = ps.filter(p => p.practiceMode !== 'training').reduce((a, p) => a + VZ.practiceMinutes(p), 0);
    if (ps.length) lines.push(label + ' ' + ps.length + '번 연습했어요 (곡 연습 ' + VZ.minutes(song) + ', 트레이닝 ' + VZ.minutes(train) + ').');
    const files = es.filter(e => e.kind === 'recording');
    if (files.length) lines.push('기록에 연결되지 않은 녹음·파일 ' + files.length + '개, ' + VZ.minutes(VZ.sumMinutes(files)) + '을 연습 시간에 더했어요.');
    const top = [...es.reduce((m, e) => e.songId ? m.set(e.songId, (m.get(e.songId) || 0) + e.minutes) : m, new Map())].sort((a, b) => b[1] - a[1])[0];
    if (top && VZ.songTitle(top[0])) lines.push('가장 많이 연습한 곡은 “' + VZ.songTitle(top[0]) + '”이에요.');
    if (recs.length) lines.push('녹음 ' + recs.length + '개를 남겼어요.');
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
  return '<h2 class="sec" style="margin-top:4px">메뉴</h2><div class="list"><a class="item" href="#/library"><i class="ph ph-waveform"></i><span class="item-main">전체 음원 보관함</span><i class="ph ph-caret-right chev"></i></a><a class="item" href="#/lessons"><i class="ph ph-chalkboard-teacher"></i><span class="item-main">레슨 기록</span><i class="ph ph-caret-right chev"></i></a><a class="item" href="#/homework"><i class="ph ph-check-square"></i><span class="item-main">숙제 관리</span><i class="ph ph-caret-right chev"></i></a><a class="item" href="billing/" data-billing><i class="ph ph-receipt"></i><span class="item-main">레슨비 정산</span><i class="ph ph-arrow-square-out chev"></i></a><button type="button" class="item" data-cats><i class="ph ph-tag"></i><span class="item-main">트레이닝 항목 관리</span><i class="ph ph-caret-right chev"></i></button></div>' +
    '<h2 class="sec">계정 · 클라우드 동기화</h2><div class="card" data-cloud></div>' +
    '<h2 class="sec">데이터</h2><div class="list"><button type="button" class="item" data-export><i class="ph ph-download-simple"></i><span class="item-main"><span class="item-title">기록 백업 (JSON)</span><span class="item-sub">음성·영상 원본은 포함되지 않아요</span></span></button><label class="item" style="cursor:pointer"><i class="ph ph-upload-simple"></i><span class="item-main"><span class="item-title">백업 불러오기</span><span class="item-sub">백업 파일의 기록을 현재 기록과 합쳐요</span></span><input type="file" accept="application/json,.json" class="sr-only" data-import-json></label></div>' +
    '<p class="small muted" style="margin:16px 4px">VOCAL.zip v' + VZ.version + ' · 기록은 이 기기에 저장되고, 로그인·연결하면 클라우드에 자동 백업돼요.</p>';
}, mount(main) {
  const root = document.getElementById('vzip-cloud-root');
  if (root) { main.querySelector('[data-cloud]').append(root); root.hidden = false; }
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
  const root = document.getElementById('vzip-cloud-root'), park = document.getElementById('vzip-park');
  if (root && park) { park.append(root); }
}});
function categorySheet() {
  const draw = el => {
    el.querySelector('[data-cl]').innerHTML = VZ.db.categories.map(c => '<div class="card flat" style="margin-bottom:8px"><div class="row between"><strong>' + esc(c.name) + '</strong></div><div class="chips" style="flex-wrap:wrap;margin:8px 0">' + (c.items || []).map(i => '<span class="badge">' + esc(i) + '</span>').join('') + '</div><form class="row" data-add-item="' + esc(c.id) + '"><input type="text" maxlength="60" placeholder="세부 항목 추가" aria-label="' + esc(c.name) + ' 세부 항목" style="min-height:44px"><button type="submit" class="btn sm secondary">추가</button></form></div>').join('');
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
