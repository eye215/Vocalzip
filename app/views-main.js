/* VOCAL.zip v6 views: shared components, 홈, 녹음, 내 곡, 곡 상세, 연습 기록. */
(() => {
'use strict';
const VZ = window.VZ, M = VZ.media, esc = VZ.esc;

/* ---------- shared: media list ---------- */
// Day · length · kind first (they get cut last); the song only when the title doesn't already say it.
const mediaSub = m => { const song = VZ.songTitle(m.songId) || '', label = M.label(m); return [VZ.dateLabel(M.dateOf(m)), m.durationSeconds ? VZ.clock(m.durationSeconds) : '', M.occasionLabel(M.occasion(m)) + (m.source === 'import' ? '·가져옴' : ''), m.rating ? '★' + m.rating : '', song && !label.includes(song) ? song : '', m.cloud && !m.local ? '클라우드' : '', m.songSource === 'ai' ? 'AI 곡 지정' : '', !m.songId && VZ.serverReview?.(m.id) ? '곡 확인 필요' : ''].filter(Boolean).join(' · '); };
const librarySub = m => { const song = VZ.songTitle(m.songId) || '', label = M.label(m); return [VZ.dateLabel(M.dateOf(m)), M.occasionLabel(M.occasion(m)) + (m.source === 'import' ? '·가져옴' : ''), m.durationSeconds ? VZ.clock(m.durationSeconds) : '', m.rating ? '★' + m.rating : '', song && !label.includes(song) ? song : '', m.cloud && !m.local ? '클라우드' : '', m.songSource === 'ai' ? 'AI 곡 지정' : '', !m.songId && VZ.serverReview?.(m.id) ? '곡 확인 필요' : ''].filter(Boolean).join(' · '); };
VZ.mediaRow = (m, {library = false} = {}) => '<div data-media="' + esc(m.id) + '" class="vz-record' + (library ? ' lib-record' : '') + '">' + (library ? '<div class="lib-row"><button type="button" class="lib-pick" data-lib-pick aria-label="' + esc(M.label(m)) + ' 선택" aria-pressed="false"><span aria-hidden="true"></span></button>' : '') + '<button type="button" class="item" data-toggle aria-expanded="false"><span class="avatar"><i class="ph ph-waveform"></i></span><span class="item-main"><span class="item-title"><span class="vz-record-name">' + esc(M.label(m)) + '</span></span><span class="item-sub">' + esc(library ? librarySub(m) : mediaSub(m)) + '</span></span><i class="ph ph-caret-down chev"></i></button>' + (library ? '</div>' : '') + '<div class="media-open" hidden style="padding:0 16px 14px"></div></div>';
/** A slim recording line (▶ title · length) for lists where the recording sits under its record; same tap-to-open player. */
VZ.mediaMini = m => '<div data-media="' + esc(m.id) + '" class="mini vz-record"><button type="button" class="mini-row" data-toggle aria-expanded="false"><span class="avatar"><i class="ph ph-waveform"></i></span><span class="item-main"><span class="item-title"><span class="vz-record-name">' + esc(M.label(m)) + '</span></span><span class="item-sub">' + esc(librarySub(m)) + '</span></span><i class="ph ph-caret-down chev"></i></button><div class="media-open" hidden style="padding:0 16px 14px"></div></div>';
/** Wire tap-to-play rows inside host. */
VZ.wireMedia = (host, items) => {
  // Sign ahead the files shown here (one request), and the one a finger lands on, so the tap can play at once.
  const shown = () => { const ids = new Set([...host.querySelectorAll('[data-media]')].map(r => r.dataset.media)); return items.filter(m => ids.has(m.id)); };
  M.prefetch(shown());
  host.addEventListener('pointerdown', e => { const row = e.target.closest('[data-media]'); const item = row && items.find(x => x.id === row.dataset.media); if (item) M.prefetch([item]); }, {passive:true});
  host.vzPrefetch = () => M.prefetch(shown());
  host.addEventListener('click', async e => {
    const row = e.target.closest('[data-media]'); if (!row || !host.contains(row)) return;
    const item = items.find(x => x.id === row.dataset.media); if (!item) return;
    if (e.target.closest('[data-toggle]')) {
      const panel = row.querySelector('.media-open'), btn = row.querySelector('[data-toggle]');
      const open = panel.hidden;
      host.querySelectorAll('.media-open:not([hidden])').forEach(p => { if (p !== panel) { p.hidden = true; p.closest('[data-media]')?.querySelector('[data-toggle]')?.setAttribute('aria-expanded', 'false'); p._player?.destroy(); } });
      panel.hidden = !open; btn.setAttribute('aria-expanded', String(open));
      if (open) {
        panel.innerHTML = '<div data-p></div>' + (item.review ? '<p class="small muted" style="white-space:pre-wrap">' + esc(item.review) + '</p>' : '');
        panel._player = M.player(panel.querySelector('[data-p]'), item, {});
        if (row.classList.contains('lib-record')) panel.querySelector('.player-row')?.insertAdjacentHTML('beforeend', '<button type="button" class="lib-row-more" data-lib-row-more aria-label="' + esc(M.label(item)) + ' 더보기"><i class="ph ph-dots-three"></i></button>');
        else panel.querySelector('.player-row')?.insertAdjacentHTML('beforeend', '<button type="button" class="vz-row-more" data-media-more aria-label="' + esc(M.label(item)) + ' 더보기"><i class="ph ph-dots-three"></i></button>');
        panel._player.play();
        const moreButton = panel.querySelector('[data-media-more]');
        if (moreButton) moreButton.onclick = () => VZ.menu({title:'녹음 더보기', body:'<div class="vz-choice-list vz-media-action-sheet"><button type="button" class="vz-choice" data-edit><i class="ph ph-pencil-simple"></i> 정보 수정</button><button type="button" class="vz-choice" data-download><i class="ph ph-download-simple"></i> 음원 다운로드</button>' + (item.r2Key && VZ.shareSheet ? '<button type="button" class="vz-choice" data-share><i class="ph ph-link"></i> 공유 링크</button>' : '') + '<button type="button" class="vz-choice" data-analyze><i class="ph ph-chart-line"></i> 보컬 분석</button>' + (VZ.recordingKindButtons?.([item]) || '') + '</div><details class="vz-media-other"><summary>기타 작업</summary><div class="vz-choice-list"><button type="button" class="vz-choice" data-delete><i class="ph ph-trash"></i> 파일 삭제</button></div></details>', onMount:(sheet, close) => { VZ.bindRecordingKind?.(sheet, close, [item], () => VZ.softRender()); sheet.querySelector('[data-edit]').onclick = () => { close(); VZ.editMedia(item); }; sheet.querySelector('[data-share]')?.addEventListener('click', () => { close(); VZ.shareSheet(item); }); sheet.querySelector('[data-download]').onclick = () => { close(); M.download(item).catch(err => VZ.toast('저장하지 못했어요: ' + err.message, 'error')); }; sheet.querySelector('[data-analyze]').onclick = () => { close(); panel._player?.destroy(); VZ.openAnalysisSelection([item]); }; sheet.querySelector('[data-delete]').onclick = async () => { close(); try { if (!await M.confirmRemove(item)) return; await M.remove(item); row.remove(); VZ.toast('파일을 삭제했어요. 연습·레슨 기록은 남아 있어요.'); } catch(err) { VZ.toast('삭제를 완료하지 못했어요: ' + err.message, 'error'); } }; }});
      } else panel._player?.destroy();
    }
    if (e.target.closest('[data-edit]')) VZ.editMedia(item);
    if (e.target.closest('[data-analyze]')) { row.querySelector('.media-open')._player?.destroy(); VZ.nav('#/analysis/' + encodeURIComponent(item.id)); }
    if (e.target.closest('[data-download]')) M.download(item).catch(err => VZ.toast('저장하지 못했어요: ' + err.message, 'error'));
    if (e.target.closest('[data-delete]')) {
      const button = e.target.closest('[data-delete]');
      if (button.disabled) return;
      button.disabled = true;
      try {
        if (!await M.confirmRemove(item)) return;
        await M.remove(item); row.remove(); VZ.toast('파일을 삭제했어요. 연습·레슨 기록은 남아 있어요.');
      } catch (err) { VZ.toast('삭제를 완료하지 못했어요: ' + err.message + ' 다시 시도해 주세요.', 'error'); }
      finally { button.disabled = false; }
    }
  });
};
VZ.editMedia = item => {
  const created = M.dateOf(item);
  const stars = [1, 2, 3, 4, 5].map(n => '<button type="button" data-star="' + n + '" aria-label="만족도 ' + n + '" aria-pressed="' + (item.rating >= n) + '">★</button>').join('');
  VZ.sheet({title:'녹음 정보 수정', body:'<form id="media-edit"><label class="field"><span>제목</span><input type="text" name="name" readonly value="' + esc(M.label(item)) + '"><span class="small muted">곡과 날짜를 지정하면 제목이 자동으로 바뀌고, 이전 제목은 기존 감상 메모 아래에 추가돼요.</span></label>' + VZ.songSelect('song', item.songId || '') +
    '<fieldset class="field" style="border:0;padding:0"><legend>종류</legend><div class="seg" role="radiogroup" aria-label="녹음 종류">' + M.OCCASIONS.map(([k, v]) => '<button type="button" role="radio" data-occ="' + k + '" aria-checked="' + (M.occasion(item) === k) + '" aria-pressed="' + (M.occasion(item) === k) + '">' + v + '</button>').join('') + '</div></fieldset>' +
    '<label class="field"><span>녹음 날짜</span><input type="date" name="date" value="' + created + '"><span class="small muted">' + ({metadata:'파일 속 촬영·녹음 날짜예요.', 'file-modified':'날짜 정보가 없어 파일 수정일을 썼어요.', manual:'직접 지정한 날짜예요.'}[item.dateSource] || '') + '</span></label><fieldset class="field" style="border:0;padding:0;margin:0 0 14px"><legend>만족도</legend><div class="stars">' + stars + '</div></fieldset><label class="field"><span>감상 메모</span><textarea name="review" maxlength="3000" placeholder="잘된 점, 고칠 점">' + esc(item.review || '') + '</textarea></label></form>',
    foot:'<button type="submit" form="media-edit" class="btn block">저장</button>',
    onMount:(el, close) => {
      let rating = item.rating || null, occasion = M.occasion(item);
      el.querySelectorAll('[data-occ]').forEach(b => b.onclick = () => { occasion = b.dataset.occ; el.querySelectorAll('[data-occ]').forEach(x => { x.setAttribute('aria-pressed', String(x === b)); x.setAttribute('aria-checked', String(x === b)); }); });
      el.querySelectorAll('[data-star]').forEach(b => b.onclick = () => { const n = +b.dataset.star; rating = rating === n ? null : n; el.querySelectorAll('[data-star]').forEach(x => x.setAttribute('aria-pressed', String(rating >= +x.dataset.star))); });
      const form = el.querySelector('form');
      let known = M.cached();
      M.list().then(all => { known = all; rename(); }).catch(() => {});
      const rename = () => {
        const sel = form.song.value, title = sel === '__new' ? form.song__new.value.trim() : VZ.songTitle(sel);
        form.name.value = title ? M.autoName(title, form.date.value || M.dateOf(item), item.id, known) : M.label(item);
      };
      rename();
      form.song.addEventListener('change', rename);
      form.song__new.addEventListener('input', rename);
      form.date.addEventListener('change', rename);
      form.onsubmit = async e => {
        e.preventDefault();
        const songId = VZ.readSong(form, 'song'); if (songId === null) return;
        const date = form.date.value, keep = item.created ? new Date(item.created) : new Date();
        const d = VZ.parseYmd(date);
        const preview=form.name.value;
        const changes = {songId, song:VZ.songLabel(VZ.song(songId)), rating, review:form.review.value, occasion, normalizeTitle:!!songId,
          created:d ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), keep.getHours(), keep.getMinutes()).getTime() : item.created};
        if(songId&&preview){Object.assign(changes,{name:preview,nameMode:'auto',autoName:preview})}
        if (d && date !== M.dateOf(item)) Object.assign(changes, {recordedDate:date, dateSource:'manual'});
        if (songId !== (item.songId || '')) changes.songSource = 'user'; // the server never changes a user's choice
        const btn = el.parentNode.querySelector('.sheet-foot .btn'); btn.disabled = true;
        try { const updated = await M.update(item, changes); if(updated?.name)M.reserveName(updated.name); Object.assign(item, updated || changes); close(); VZ.toast('저장했어요.'); }
        catch (err) { btn.disabled = false; VZ.toast('저장하지 못했어요: ' + err.message + ' · 입력은 유지돼요.', 'error'); }
      };
    }});
};

/* ---------- shared: practice log sheet ---------- */
VZ.practiceSheet = ({date = VZ.today(), songId = '', mediaIds = [], practice = null, preset = null} = {}) => {
  const db = VZ.db, p = practice;
  const mode = p?.practiceMode || (songId || !p ? 'song' : 'training');
  // 숙제 체크: homework whose period covers the practice date (plus any this record already has) is asked about.
  const tasksFor = day => db.assignments.filter(t => p?.completed?.includes(t.id) || VZ.taskInPeriod?.(t, day));
  const hw = new Map((p?.completed || []).map(id => [id, {did:true, reps:Number(p.assignmentReps?.[id]) || 1, note:p.assignmentNotes?.[id] || ''}]));
  const cats = db.categories;
  const catOpts = '<option value="">분류 선택</option>' + cats.map(c => '<option value="' + esc(c.id) + '"' + (p?.categoryId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '<option value="__new">+ 새 분류 추가</option>';
  // 트레이닝 분류 3단계: 분류 › 세부 항목 › 세부 항목 2. Each level can add a new entry that is kept for next time.
  const level = (label, name, opts, placeholder) => '<label class="field"><span>' + label + '</span><select name="' + name + '" data-level>' + opts + '</select><input type="text" name="' + name + '__new" maxlength="40" placeholder="' + placeholder + '" hidden style="margin-top:8px"></label>';
  const initialMinutes = p ? VZ.practiceMinutes(p) : preset?.minutes || 30;
  const quick = [10, 20, 30, 60].map(n => '<button type="button" data-min="' + n + '" aria-pressed="' + (Number(initialMinutes) === n) + '">' + n + '분</button>').join('');
  const stars = [1, 2, 3, 4, 5].map(n => '<button type="button" data-star="' + n + '" aria-label="만족도 ' + n + '" aria-pressed="' + ((p?.rating || 0) >= n) + '"><i class="' + ((p?.rating || 0) >= n ? 'ph-fill' : 'ph') + ' ph-star" aria-hidden="true"></i></button>').join('');
  VZ.sheet({title:p ? '연습 기록 수정' : '연습 기록', body:'<form id="practice-log">' +
    '<div class="vz-library-tabs vz-practice-tabs"><div class="lib-seg" role="group" aria-label="연습 종류"><button type="button" data-mode="song" aria-pressed="' + (mode === 'song') + '">곡 연습</button><button type="button" data-mode="training" aria-pressed="' + (mode === 'training') + '">보컬 트레이닝</button></div></div>' +
    '<div data-song-part>' + VZ.songSelect('song', p?.songId || songId) + '</div>' +
    '<div data-train-part><label class="field"><span>훈련 내용</span><select name="recommendation" data-recommendation><option value="">추천 연습 또는 직접 입력 선택</option><option value="__custom">직접 입력</option></select></label><div class="vz-practice-recommendation" data-recommendation-info hidden></div><div data-custom-training hidden>' + level('분류', 'category', catOpts, '새 분류 이름 (예: 고음)') + level('세부 항목', 'detail', '', '새 세부 항목 (예: 립트릴)') + level('세부 항목 2 <span class="small muted">(선택)</span>', 'detail2', '', '새 항목 (예: 저음 5도)') + '</div></div>' +
    '<label class="field vz-practice-date"><span>기록 날짜 <span class="req">*</span></span><input type="date" name="date" required value="' + esc(p?.date || date) + '"></label>' +
    '<div class="vz-practice-time"><label for="vz-practice-minutes">연습 시간 <span class="req">*</span></label><div class="vz-practice-time-value"><button type="button" data-minute-step="-5" aria-label="연습 시간 5분 줄이기"><i class="ph ph-minus" aria-hidden="true"></i></button><div><input id="vz-practice-minutes" type="number" name="minutes" inputmode="numeric" min="1" max="1440" required value="' + initialMinutes + '" aria-label="연습 시간(분)"><span>분</span></div><button type="button" data-minute-step="5" aria-label="연습 시간 5분 늘리기"><i class="ph ph-plus" aria-hidden="true"></i></button></div><div class="vz-practice-minutes" role="group" aria-label="연습 시간 빠른 선택">' + quick + '</div></div>' +
    '<fieldset class="vz-practice-rating"><legend>만족도</legend><div class="stars">' + stars + '</div></fieldset>' +
    '<label class="field"><span>메모 <span class="small muted">(선택)</span></span><textarea name="memo" maxlength="5000" placeholder="오늘 연습에서 느낀 점">' + esc(p?.memo || preset?.memo || '') + '</textarea></label>' +
    '<div data-hw-host></div><div data-media-pick></div></form>',
    foot:'<button type="submit" form="practice-log" class="btn block">' + (p ? '수정 저장' : '연습 기록 저장') + '</button>',
    onMount:async (el, close) => {
      const form = el.querySelector('form');
      let current = mode, rating = p?.rating || null;
      const setMode = m => { current = m; el.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === m))); el.querySelector('[data-song-part]').hidden = m !== 'song'; el.querySelector('[data-train-part]').hidden = m !== 'training'; };
      el.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => setMode(b.dataset.mode)); setMode(mode);
      const opt = (v, t, sel) => '<option value="' + esc(v) + '"' + (sel ? ' selected' : '') + '>' + esc(t) + '</option>';
      const showNew = sel => { const input = form.elements[sel.name + '__new']; input.hidden = sel.value !== '__new'; if (!input.hidden && document.activeElement === sel) input.focus(); };
      const fillDetail2 = () => {
        const c = cats.find(x => x.id === form.category.value), mine = p?.categoryId === c?.id && p?.detail === form.detail.value;
        const list = [...new Set([...(c?.sub?.[form.detail.value] || []), ...(mine && p?.detail2 ? [p.detail2] : [])])];
        form.detail2.innerHTML = opt('', '선택 안 함') + list.map(i => opt(i, i, mine && p?.detail2 === i)).join('') + opt('__new', '+ 새 항목 추가');
        showNew(form.detail2);
      };
      const fillDetail = () => {
        const c = cats.find(x => x.id === form.category.value), items = [...new Set([...(c?.items || []), ...(p?.detail && p?.categoryId === c?.id ? [p.detail] : [])])];
        form.detail.innerHTML = (items.length ? '' : opt('', '선택 안 함')) + items.map(i => opt(i, i, p?.detail === i && p?.categoryId === c?.id)).join('') + opt('__new', '+ 새 세부 항목 추가');
        showNew(form.detail); fillDetail2();
      };
      form.category.onchange = () => { showNew(form.category); fillDetail(); };
      form.detail.onchange = () => { showNew(form.detail); fillDetail2(); };
      form.detail2.onchange = () => showNew(form.detail2);
      if (!cats.length) form.category.value = '__new';
      showNew(form.category); fillDetail();
      const recSelect = form.elements.recommendation, recInfo = el.querySelector('[data-recommendation-info]');
      const customTraining = el.querySelector('[data-custom-training]');
      let recommendations = [], chosenRecommendation = null;
      const classify = (title, key = '', assignedCategory = '') => {
        const name = String(title || '').trim();
        const group = assignedCategory || (key === 'phr' || /호흡|프레이즈|숨/.test(name) ? '호흡' :
          key === 'into' || key === 'wob' || /음정|기준음|롱톤/.test(name) ? '음정' :
          key === 'vib' || /발성|립트릴|허밍|비브라토/.test(name) ? '발성' : '기타 훈련');
        return {category:group, detail:name};
      };
      const applyRecommendation = item => {
        chosenRecommendation = item || null;
        customTraining.hidden = !!item;
        recInfo.hidden = !item;
        if (!item) return;
        const mapped = classify(item.title, item.key, item.category), existing = cats.find(c => c.name === mapped.category);
        form.category.value = existing?.id || '__new';
        form.elements.category__new.value = existing ? '' : mapped.category;
        showNew(form.category); fillDetail();
        form.detail.value = existing?.items?.includes(mapped.detail) ? mapped.detail : '__new';
        form.elements.detail__new.value = form.detail.value === '__new' ? mapped.detail : '';
        showNew(form.detail); fillDetail2(); form.detail2.value = '';
        recInfo.innerHTML = '<strong>' + esc(item.title) + '</strong><span>' + esc(item.source === 'lesson' ? '레슨 숙제' : '분석 추천') + ' · ' + esc(mapped.category) + '으로 자동 분류</span>' + (item.description ? '<small>' + esc(item.description) + '</small>' : '');
      };
      recSelect.onchange = () => {
        if (recSelect.value === '__custom' && chosenRecommendation) {
          form.category.value = ''; form.elements.category__new.value = '';
          showNew(form.category); fillDetail();
          form.elements.detail__new.value = '';
        }
        applyRecommendation(recommendations.find(x => x.id === recSelect.value));
      };
      const drawRecommendations = async () => {
        const day = form.date.value;
        const homework = tasksFor(day).filter(t => t.status !== 'done').map(t => ({id:'lesson:' + t.id, key:'', title:t.title, category:t.categoryLabel || t.category || '', source:'lesson', description:VZ.taskPeriod?.(t) ? '기간 ' + VZ.taskPeriod(t) : '', sourceId:t.id}));
        let analysis = [];
        try {
          const media = await M.list();
          const result = VZ.practiceTips?.(media.filter(m => !M.dateOf(m) || M.dateOf(m) <= day));
          analysis = (result?.tips || []).map(t => ({id:'analysis:' + t.key, key:t.key, title:t.name, category:t.category, source:'analysis', description:t.reason}));
        } catch (_) { /* Recommendations are optional; manual entry remains available. */ }
        recommendations = [...homework, ...analysis.filter(t => !homework.some(h => h.title === t.title))].slice(0, 3);
        const previous = recSelect.value;
        recSelect.innerHTML = '<option value="">추천 연습 또는 직접 입력 선택</option>' + recommendations.map(t => '<option value="' + esc(t.id) + '">' + esc(t.title) + ' · ' + (t.source === 'lesson' ? '레슨 숙제' : '분석 추천') + '</option>').join('') + '<option value="__custom">직접 입력</option>';
        const savedId = p?.recommendationSource && p?.recommendationSourceId ? p.recommendationSource + ':' + p.recommendationSourceId : '';
        recSelect.value = previous === '__custom' || recommendations.some(t => t.id === previous) ? previous : recommendations.some(t => t.id === savedId) ? savedId : p ? '__custom' : '';
        if (!recommendations.length && !p) recSelect.value = '__custom';
        applyRecommendation(recommendations.find(x => x.id === recSelect.value));
        if (recSelect.value === '__custom') customTraining.hidden = false;
      };
      drawRecommendations();
      const hwHost = el.querySelector('[data-hw-host]');
      const drawHw = () => {
        const list = tasksFor(form.date.value);
        if (!list.length) { hwHost.innerHTML = ''; return; }
        hwHost.innerHTML = '<fieldset class="field hw-ask" style="border:0;padding:0"><legend>이번 연습에서 숙제 했나요?</legend><div class="list">' + list.map(t => {
          const st = hw.get(t.id), tally = VZ.taskTally?.(t, p?.id) || {reps:0}, period = VZ.taskPeriod?.(t);
          return '<div class="hw-item" data-hw-id="' + esc(t.id) + '"><div class="row" style="gap:10px;align-items:flex-start"><div class="grow" style="min-width:0"><strong style="display:block">' + esc(t.title) + '</strong><span class="small muted">' + esc([period ? '기간 ' + period : '', VZ.songTitle(VZ.taskSongId(t)), tally.reps ? '지금까지 ' + tally.reps + '회' : '아직 기록 없음'].filter(Boolean).join(' · ')) + '</span></div>' +
            '<div class="seg hw-seg" role="group" aria-label="' + esc(t.title) + ' 했나요"><button type="button" data-hw-did="1" aria-pressed="' + !!st?.did + '">했어요</button><button type="button" data-hw-did="0" aria-pressed="' + (st?.did === false) + '">안 했어요</button></div></div>' +
            '<div class="hw-more" data-hw-more' + (st?.did ? '' : ' hidden') + '><div class="row" style="gap:8px;margin:10px 0 8px"><span class="small" style="font-weight:600">횟수</span><button type="button" class="icon-btn sm" data-hw-step="-1" aria-label="횟수 줄이기"><i class="ph ph-minus"></i></button><input type="number" inputmode="numeric" min="1" max="99" data-hw-reps value="' + (st?.reps || 1) + '" aria-label="' + esc(t.title) + ' 횟수" style="width:64px;text-align:center"><button type="button" class="icon-btn sm" data-hw-step="1" aria-label="횟수 늘리기"><i class="ph ph-plus"></i></button><span class="small muted">회</span></div>' +
            '<input type="text" maxlength="300" data-hw-note value="' + esc(st?.note || '') + '" placeholder="어땠어요? (예: 고음에서 힘이 덜 들어감)" aria-label="' + esc(t.title) + ' 메모"></div></div>';
        }).join('') + '</div></fieldset>';
      };
      hwHost.addEventListener('click', e => {
        const item = e.target.closest('[data-hw-id]'); if (!item) return;
        const id = item.dataset.hwId, st = hw.get(id) || {did:null, reps:1, note:''};
        const did = e.target.closest('[data-hw-did]'), step = e.target.closest('[data-hw-step]');
        if (did) {
          st.did = did.dataset.hwDid === '1'; hw.set(id, st);
          item.querySelectorAll('[data-hw-did]').forEach(b => b.setAttribute('aria-pressed', String(b === did)));
          item.querySelector('[data-hw-more]').hidden = !st.did;
          if (st.did && !st.note) item.querySelector('[data-hw-note]').focus();
        } else if (step) {
          const input = item.querySelector('[data-hw-reps]');
          st.reps = Math.min(99, Math.max(1, (Number(input.value) || 1) + Number(step.dataset.hwStep))); input.value = st.reps; hw.set(id, st);
        }
      });
      hwHost.addEventListener('input', e => {
        const item = e.target.closest('[data-hw-id]'); if (!item) return;
        const st = hw.get(item.dataset.hwId) || {did:true, reps:1, note:''};
        if (e.target.matches('[data-hw-reps]')) st.reps = Math.min(99, Math.max(1, Number(e.target.value) || 1));
        if (e.target.matches('[data-hw-note]')) st.note = e.target.value;
        hw.set(item.dataset.hwId, st);
      });
      form.date.addEventListener('change', () => { drawHw(); drawRecommendations(); }); drawHw();
      const syncMinutes = () => el.querySelectorAll('[data-min]').forEach(b => b.setAttribute('aria-pressed', String(Number(form.minutes.value) === Number(b.dataset.min))));
      el.querySelectorAll('[data-min]').forEach(b => b.onclick = () => { form.minutes.value = b.dataset.min; syncMinutes(); });
      el.querySelectorAll('[data-minute-step]').forEach(b => b.onclick = () => { form.minutes.value = Math.max(1, Math.min(1440, (Number(form.minutes.value) || 0) + Number(b.dataset.minuteStep))); syncMinutes(); });
      form.minutes.addEventListener('input', syncMinutes);
      el.querySelectorAll('[data-star]').forEach(b => b.onclick = () => { const n = +b.dataset.star; rating = rating === n ? null : n; el.querySelectorAll('[data-star]').forEach(x => { const active = rating >= +x.dataset.star; x.setAttribute('aria-pressed', String(active)); x.querySelector('i').className = (active ? 'ph-fill' : 'ph') + ' ph-star'; }); });
      // Offer recordings from the same day to link (recordings never add to practice time).
      const pickHost = el.querySelector('[data-media-pick]');
      const selected = new Set(p?.mediaIds || mediaIds);
      const drawPick = async () => {
        const all = await M.list(); const day = form.date.value;
        const linked = all.filter(m => selected.has(m.id)), known = new Set(all.map(m => m.id));
        const items = [...linked, ...all.filter(m => !selected.has(m.id) && M.dateOf(m) === day).slice(0, 12)];
        // Links whose file is gone (deleted, or only on another device) can be removed here.
        const missing = [...selected].filter(id => !known.has(id));
        const box = (id, title, sub) => '<label class="item"><input type="checkbox" name="media" value="' + esc(id) + '"' + (selected.has(id) ? ' checked' : '') + ' style="width:22px;height:22px;accent-color:var(--accent)"><span class="item-main"><span class="item-title">' + esc(title) + '</span><span class="item-sub">' + esc(sub) + '</span></span></label>';
        pickHost.innerHTML = items.length || missing.length ? '<fieldset class="field" style="border:0;padding:0"><legend>연결할 녹음 <span class="small muted">(체크를 풀면 연결만 해제돼요 · 시간은 합산하지 않아요)</span></legend><div class="list">' + items.map(m => box(m.id, M.label(m), mediaSub(m))).join('') + missing.map(id => box(id, '찾을 수 없는 녹음', '삭제됐거나 다른 기기에만 있어요')).join('') + '</div></fieldset>' : '';
        const fill = () => {
          const seconds = all.filter(m => selected.has(m.id)).reduce((a, m) => a + (Number(m.durationSeconds) || 0), 0), btn = pickHost.querySelector('[data-fill-min]');
          if (btn) { btn.hidden = seconds < 30; btn.dataset.minutes = Math.max(1, Math.round(seconds / 60)); btn.textContent = '선택한 녹음 길이로 연습 시간 채우기 (' + VZ.minutes(Math.max(1, Math.round(seconds / 60))) + ')'; }
        };
        if (pickHost.innerHTML) { pickHost.insertAdjacentHTML('beforeend', '<button type="button" class="chip" data-fill-min hidden style="margin:-6px 0 14px"></button>'); pickHost.querySelector('[data-fill-min]').onclick = e => { form.minutes.value = e.currentTarget.dataset.minutes; }; }
        pickHost.querySelectorAll('input').forEach(i => i.onchange = () => { i.checked ? selected.add(i.value) : selected.delete(i.value); fill(); });
        fill();
      };
      form.date.addEventListener('change', drawPick); drawPick();
      form.onsubmit = e => {
        e.preventDefault();
        const minutes = Number(form.minutes.value);
        if (!(minutes > 0)) { VZ.toast('연습 시간을 1분 이상 입력해 주세요.', 'error'); form.minutes.focus(); return; }
        if (current === 'training' && !recSelect.value) { VZ.toast('훈련 내용을 선택해 주세요.', 'error'); recSelect.focus(); return; }
        let sid = '';
        if (current === 'song') { sid = VZ.readSong(form, 'song'); if (sid === null) return; }
        // New 분류 / 세부 항목 typed here are added to the lists (reusing an existing one with the same name).
        const typed = name => form.elements[name].value === '__new' ? form.elements[name + '__new'].value.trim() : null;
        const newCat = current === 'training' ? typed('category') : null, newDetail = current === 'training' ? typed('detail') : null, newDetail2 = current === 'training' ? typed('detail2') : null;
        for (const [v, name, what] of [[newCat, 'category', '분류'], [newDetail, 'detail', '세부 항목'], [newDetail2, 'detail2', '세부 항목 2']]) if (v === '') { VZ.toast('새 ' + what + ' 이름을 입력해 주세요.', 'error'); form.elements[name + '__new'].focus(); return; }
        let catId = current === 'training' ? form.category.value : '';
        if (newCat !== null) catId = cats.find(c => c.name === newCat)?.id || VZ.uid();
        const detail = current === 'training' ? (newDetail ?? form.detail.value) : '', detail2 = current === 'training' && detail ? (newDetail2 ?? form.detail2.value) : '';
        if (current === 'training' && (!catId || !detail)) { VZ.toast('분류와 훈련 내용을 입력해 주세요.', 'error'); (catId ? form.detail : form.category).focus(); return; }
        const catName = newCat ?? cats.find(c => c.id === catId)?.name ?? '';
        const learn = d => {
          if (current !== 'training' || !catId) return;
          let c = d.categories.find(x => x.id === catId);
          if (!c) { c = {id:catId, name:catName, items:[]}; d.categories.push(c); }
          c.items ||= []; if (detail && !c.items.includes(detail)) c.items.push(detail);
          if (detail && detail2) { c.sub ||= {}; c.sub[detail] ||= []; if (!c.sub[detail].includes(detail2)) c.sub[detail].push(detail2); }
        };
        const cat = {name:catName};
        // Only homework answered "했어요" is recorded, with its 횟수 and 메모.
        const shown = new Set([...hwHost.querySelectorAll('[data-hw-id]')].map(x => x.dataset.hwId));
        const completed = [...hw].filter(([id, st]) => st.did && shown.has(id)).map(([id]) => id);
        const assignmentReps = Object.fromEntries(completed.map(id => [id, hw.get(id).reps || 1]));
        const assignmentNotes = Object.fromEntries(completed.filter(id => hw.get(id).note.trim()).map(id => [id, hw.get(id).note.trim()]));
        const entry = {date:form.date.value, minutes, manualMinutes:minutes, practiceTimeSource:'manual', mediaSeconds:p?.mediaSeconds || 0, mediaIds:[...selected], practiceMode:current,
          technique:detail ? [{name:[detail, detail2].filter(Boolean).join(' · '), minutes}] : [], songId:sid,
          categoryId:current === 'training' ? catId : '', categoryLabel:current === 'training' ? cat.name : '', detail, detail2,
          recommendationSource:current === 'training' ? chosenRecommendation?.source || '' : '', recommendationSourceId:current === 'training' ? chosenRecommendation?.sourceId || chosenRecommendation?.key || '' : '',
          rating:rating || 0, memo:form.memo.value, completed, assignmentReps, assignmentNotes};
        const ok = VZ.change(d => { learn(d); if (p) Object.assign(d.practices.find(x => x.id === p.id) || {}, entry); else d.practices.push({id:VZ.uid(), ...entry}); });
        if (ok) { close(); VZ.toast(p ? '연습 기록을 수정했어요.' : '연습 기록을 저장했어요.'); window.dispatchEvent(new Event('vzip:practice-saved')); }
      };
    }});
};
VZ.practiceRow = (p, opts) => {
  const day = !!opts?.day; // inside a day view: no date, recordings are listed underneath
  const title = p.practiceMode === 'training' ? [p.categoryLabel, p.detail, p.detail2].filter(Boolean).join(' · ') || '보컬 트레이닝' : VZ.songTitle(p.songId) || (p.practiceMode === 'song' ? '곡 연습' : [p.categoryLabel, p.detail, p.detail2].filter(Boolean).join(' · ') || '연습');
  return '<button type="button" class="item" data-practice="' + esc(p.id) + '"><span class="avatar" style="background:var(--ok-soft);color:var(--ok)"><i class="ph ph-timer"></i></span><span class="item-main"><span class="item-title">' + esc(title) + '</span><span class="item-sub">' + esc([day ? '' : VZ.dateLabel(p.date), p.practiceTimeSource === 'unconfirmed' ? '시간 미입력' : VZ.minutes(VZ.practiceMinutes(p)), p.rating ? '★' + p.rating : '', !day && (p.mediaIds || []).length ? '녹음 ' + p.mediaIds.length : '', p.memo ? p.memo.slice(0, 40) : ''].filter(Boolean).join(' · ')) + '</span></span><i class="ph ph-caret-right chev"></i></button>';
};
VZ.practiceDetail = id => {
  const p = VZ.db.practices.find(x => x.id === id); if (!p) return;
  const tasks = (p.completed || []).map(id => { const t = VZ.db.assignments.find(a => a.id === id); return t && [t.title + ' ' + window.VzipPracticeTime.homeworkRepetitions(p, id) + '회', p.assignmentNotes?.[id] || ''].filter(Boolean).join(' — '); }).filter(Boolean);
  VZ.sheet({title:VZ.dateLabel(p.date) + ' 연습', body:'<div class="stack"><div class="card flat"><div class="row between"><strong>' + esc(p.practiceMode === 'training' ? [p.categoryLabel, p.detail, p.detail2].filter(Boolean).join(' · ') || '보컬 트레이닝' : VZ.songTitle(p.songId) || '곡 연습') + '</strong><span class="badge">' + VZ.minutes(VZ.practiceMinutes(p)) + '</span></div>' + (p.rating ? '<p class="small muted">만족도 ' + '★'.repeat(p.rating) + '</p>' : '') + (p.memo ? '<p style="white-space:pre-wrap;margin:8px 0 0">' + esc(p.memo) + '</p>' : '') + (tasks.length ? '<div class="small" style="margin-top:8px"><strong>한 숙제</strong>' + tasks.map(x => '<div class="muted">· ' + esc(x) + '</div>').join('') + '</div>' : '') + '</div><div class="list" data-list></div></div>',
    foot:'<div class="btn-row"><button type="button" class="btn danger" data-del>삭제</button><button type="button" class="btn secondary" data-edit>수정</button></div>',
    onMount:async (el, close) => {
      const wrap = el.parentNode;
      wrap.querySelector('[data-edit]').onclick = () => { close(); VZ.practiceSheet({practice:p}); };
      wrap.querySelector('[data-del]').onclick = async () => {
        if (!await VZ.confirm('연습 기록 삭제', '이 연습 기록을 삭제할까요? 연결된 녹음 파일은 전체 녹음에 그대로 남아요.', {ok:'삭제', danger:true})) return;
        if (VZ.change(d => { d.practices = d.practices.filter(x => x.id !== p.id); })) { close(); VZ.toast('삭제했어요. 녹음은 전체 녹음에 남아 있어요.'); }
      };
      const items = (await M.list()).filter(m => (p.mediaIds || []).includes(m.id));
      const host = el.querySelector('[data-list]');
      const missing = (p.mediaIds || []).length - items.length;
      host.innerHTML = items.map(VZ.mediaRow).join('') + (missing > 0 ? '<div class="item small"><span class="item-main muted">찾을 수 없는 녹음 ' + missing + '개 (삭제됐거나 다른 기기에만 있어요)</span><button type="button" class="btn sm ghost" data-unlink-missing>연결 해제</button></div>' : '');
      if (!host.innerHTML) { host.remove(); return; }
      VZ.wireMedia(host, items);
      host.querySelector('[data-unlink-missing]')?.addEventListener('click', async () => {
        if (!await VZ.confirm('연결 해제', '찾을 수 없는 녹음 ' + missing + '개를 이 연습 기록에서 빼요. 연습 시간과 메모는 그대로예요.', {ok:'연결 해제'})) return;
        const keep = new Set(items.map(m => m.id));
        if (VZ.change(d => { const x = d.practices.find(y => y.id === p.id); if (x) x.mediaIds = (x.mediaIds || []).filter(mid => keep.has(mid)); })) { close(); VZ.toast('찾을 수 없는 녹음 연결을 해제했어요.'); }
      });
    }});
};
document.addEventListener('click', e => { const b = e.target.closest('[data-practice]'); if (b) VZ.practiceDetail(b.dataset.practice); });

/* ---------- 홈 ---------- */
VZ.route('home', {title:'홈', render() {
  const db = VZ.db, next = VZ.nextLesson();
  const songs = (next ? VZ.lessonSongIds(next) : []).map(VZ.songTitle).filter(Boolean);
  const nextHtml = next ? '<a class="card accent lesson-hero" href="#/lesson/' + esc(next.id) + '" style="text-decoration:none"><div class="row between"><span class="small" style="font-weight:700;opacity:.9">다음 레슨</span><span class="dday">' + VZ.dday(next.date) + '</span></div><div class="when">' + esc(VZ.dateLabel(next.date)) + (next.startTime ? ' ' + esc(VZ.timeRange(next)) : '') + '</div><div class="meta muted">' + (next.place ? '<span><i class="ph ph-map-pin"></i>' + esc(next.place) + '</span>' : '') + (next.teacher ? '<span><i class="ph ph-user"></i>' + esc(next.teacher) + '</span>' : '') + (songs.length ? '<span><i class="ph ph-music-note"></i>' + esc(songs.join(', ')) + '</span>' : '') + '</div>' + (next.prepMemo ? '<div class="small muted ellipsis">준비: ' + esc(next.prepMemo) + '</div>' : '') + '<div data-billing-left></div></a>'
    : '<div class="empty compact"><span>예정된 레슨이 없어요</span><button type="button" class="btn sm secondary" data-add-lesson>일정 추가</button></div>';
  const tasks = db.assignments.filter(t => t.status !== 'done');
  const taskHtml = tasks.length ? '<h2 class="sec">해야 할 숙제 <a href="#/homework">전체 ' + tasks.length + '</a></h2><div class="list">' + tasks.slice(0, 4).map(VZ.taskRow).join('') + '</div>' : '<p class="small muted" style="margin:16px 4px 0"><i class="ph ph-check-circle"></i> 남은 숙제가 없어요 · <a href="#/homework">숙제 관리</a></p>';
  return '<div class="quick" style="grid-template-columns:repeat(4,1fr)"><a href="#/record"><i class="ph-fill ph-microphone"></i>녹음</a><button type="button" data-log><i class="ph ph-timer"></i>연습 기록</button><button type="button" data-add-lesson><i class="ph ph-calendar-plus"></i>레슨 일정</button><button type="button" data-import><i class="ph ph-upload-simple"></i>가져오기</button></div>' +
    '<div data-tip style="margin-top:16px"></div>' +
    (VZ.overdueLessons?.().length ? '<div style="margin-top:16px">' + VZ.overdueCard() + '</div>' : '') +
    '<h2 class="sec">다음 레슨 <a href="#/calendar">캘린더</a></h2>' + nextHtml + taskHtml +
    '<h2 class="sec">최근 연습한 곡 <a href="#/songs">내 곡</a></h2><div data-recent><div class="empty compact"><span class="muted">불러오는 중…</span></div></div>';
}, async mount(main) {
  main.querySelectorAll('[data-add-lesson]').forEach(b => b.onclick = () => VZ.lessonSheet());
  main.querySelector('[data-log]').onclick = () => VZ.practiceSheet();
  VZ.renderTips?.(main.querySelector('[data-tip]'), {limit:1}); // app/practice-tips.js
  main.querySelector('[data-import]').onclick = () => VZ.openImportHub();
  VZ.billingLeftChip?.(main.querySelector('[data-billing-left]'));
  const media = await M.list().catch(() => []);
  const host = main.querySelector('[data-recent]'); if (!host?.isConnected) return;
  const act = VZ.songActivity(media);
  const recent = [...act.entries()].filter(([id]) => VZ.song(id)).sort((a, b) => b[1].localeCompare(a[1])).slice(0, 3);
  host.innerHTML = recent.length ? '<div class="list">' + recent.map(([id, date]) => '<div class="item"><a href="#/song/' + esc(id) + '" class="item-main" style="color:inherit;text-decoration:none"><span class="item-title">' + esc(VZ.songTitle(id)) + '</span><span class="item-sub">' + esc(['마지막 연습 ' + VZ.relDay(date), (n => n ? '녹음 ' + n + '개' : '')(media.filter(m => m.songId === id).length)].filter(Boolean).join(' · ')) + '</span></a><a class="btn sm secondary" href="#/record?song=' + esc(id) + '" aria-label="' + esc(VZ.songTitle(id)) + ' 이어서 연습"><i class="ph-fill ph-microphone"></i>이어서</a></div>').join('') + '</div>'
    : VZ.empty('music-notes', '아직 연습한 곡이 없어요.', '<a class="btn sm" href="#/songs?add=1">곡 추가하기</a>');
}});

/* ---------- 녹음 ---------- */
let rec = null; // {session, state, result, video}
VZ.isBusy = () => !!(rec?.session || (rec?.result && !rec.saved));
VZ.route('record', {title:'녹음', tab:'record', back:true, noSettings:true, noAutoRefresh:true, render(r) {
  const songId = r.query.get('song') || rec?.songId || '';
  const lessonId = r.query.get('lesson') || '';
  const song=VZ.song(songId),songMeta=[song?.show,song?.role].filter(Boolean).join(' · ');
  return '<div class="stack vz-record-screen">' +
    (lessonId ? '<div class="badge accent" style="justify-self:start">레슨 녹음 · ' + esc(VZ.dateLabel(VZ.db.lessons.find(l => l.id === lessonId)?.date)) + '</div>' : '') +
    '<button type="button" class="card flat item" data-pick-song><span class="avatar"><i class="ph ph-music-note"></i></span><span class="item-main"><span class="item-sub">연결 곡</span><span class="item-title" data-song-name>' + esc(VZ.songTitle(songId) || '곡 미지정') + '</span><span class="item-sub vz-record-song-meta" data-song-meta>' + esc(songMeta) + '</span></span><i class="ph ph-caret-down chev"></i></button>' +
    '<section class="rec-stage" aria-label="녹음기" data-phase="idle"><h2 class="rec-heading">녹음 준비</h2><div class="rec-time" aria-live="off">0:00</div><div class="rec-wave-wrap"><div class="rec-wave-idle" aria-hidden="true"></div><canvas class="rec-wave" aria-hidden="true"></canvas></div>' +
    '<div class="rec-controls"><button type="button" class="rec-side" data-cancel disabled><i class="ph ph-x"></i>취소</button><div class="rec-primary"><button type="button" class="rec-main" data-main aria-label="녹음 시작"><i class="ph ph-microphone"></i></button></div><button type="button" class="rec-side" data-pause disabled><i class="ph ph-pause"></i><span>일시정지</span></button></div>' +
    '<div class="rec-status" role="status" data-status>버튼을 누르면 바로 녹음이 시작돼요.</div></section>' +
    '<div data-review hidden></div></div>';
}, leave() { rec?.result?.releaseProtection?.();if (rec?.session) { rec.session.cancel(); } rec = null; }, mount(main, r) {
  const lessonId = r.query.get('lesson') || '';
  const state = {songId:r.query.get('song') || '', video:false, session:null, result:null, waveLive:[]};
  rec = state;
  const $ = s => main.querySelector(s);
  const status = $('[data-status]'), timeEl = $('.rec-time'), wave = $('.rec-wave');
  $('.rec-wave-idle').innerHTML = Array.from({length:45}, (_, i) => '<i style="--h:' + (9 + i * 13 % 39) + 'px"></i>').join('');
  const mainBtn = $('[data-main]'), pauseBtn = $('[data-pause]'), cancelBtn = $('[data-cancel]'), review = $('[data-review]'), stage=$('.rec-stage'), picker=$('[data-pick-song]');
  picker.onclick = () => VZ.pickSong(state.songId, id => { state.songId = id; $('[data-song-name]').textContent = VZ.songTitle(id) || '곡 미지정'; const song=VZ.song(id);$('[data-song-meta]').textContent=[song?.show,song?.role].filter(Boolean).join(' · '); });
  VZ.setGuard(() => state.session ? '녹음 중이에요. 이동하면 이번 녹음이 사라져요. 이동할까요?' : state.result && !state.saved ? '저장하지 않은 녹음이 있어요. 이동하면 사라져요. 이동할까요?' : '');
  M.drawWave(wave, [], '#A65CFF');
  const setUI = phase => {
    const recording = phase === 'recording' || phase === 'paused';
    stage.dataset.phase=phase;
    stage.querySelector('.rec-heading').textContent=phase==='recording'?'녹음 중':phase==='paused'?'일시정지':'녹음 준비';
    picker.disabled=recording||phase==='review';
    mainBtn.classList.toggle('recording', recording);
    mainBtn.innerHTML = recording ? '<i class="ph-fill ph-stop"></i>' : '<i class="ph ph-microphone"></i>';
    mainBtn.setAttribute('aria-label', recording ? '녹음 종료' : '녹음 시작');
    pauseBtn.disabled = !recording; cancelBtn.disabled = !recording;
    pauseBtn.innerHTML = phase === 'paused' ? '<i class="ph ph-play"></i><span>계속</span>' : '<i class="ph ph-pause"></i><span>일시정지</span>';
    mainBtn.hidden = phase === 'review';
    main.querySelector('.rec-controls').hidden = phase === 'review';
  };
  const reset = () => { state.result?.releaseProtection?.();state.result = null; state.saved = false; state.savedId = null; review.hidden = true; review.innerHTML = ''; timeEl.textContent = '0:00'; state.waveLive = []; M.drawWave(wave, [], '#A65CFF'); setUI('idle'); status.textContent = '버튼을 누르면 바로 녹음이 시작돼요.'; };
  mainBtn.onclick = async () => {
    if (state.session) return stop();
    mainBtn.disabled = true; status.textContent = '마이크 준비 중…';
    try {
      state.session = await M.capture({onTick:s => { timeEl.textContent = VZ.clock(s); }, onLevel:v => { state.waveLive.push(v); if (state.waveLive.length > 400) state.waveLive.shift(); M.drawWave(wave, state.waveLive, '#A65CFF'); }});
      state.session.start(); setUI('recording');
      status.innerHTML = '<span class="rec-dot"></span>녹음 중 · 다시 누르면 종료';
    } catch (e) { state.session = null; status.textContent = e.message; VZ.toast(e.message, 'error'); setUI('idle'); }
    finally { mainBtn.disabled = false; }
  };
  pauseBtn.onclick = () => {
    const s = state.session; if (!s) return;
    if (s.state === 'recording') { s.pause(); setUI('paused'); status.textContent = '일시정지됨'; }
    else { s.resume(); setUI('recording'); status.innerHTML = '<span class="rec-dot"></span>녹음 중'; }
  };
  cancelBtn.onclick = async () => {
    if (!await VZ.confirm('녹음 취소', '이번 녹음을 버릴까요?', {ok:'버리기', danger:true})) return;
    state.session?.cancel(); state.session = null; reset();
  };
  async function stop() {
    const s = state.session; state.session = null; mainBtn.disabled = true; status.textContent = '녹음 마무리 중…';
    try { state.result = await s.stop(); } catch (e) { status.textContent = e.message; VZ.toast(e.message, 'error'); reset(); return; }
    finally { mainBtn.disabled = false; }
    showReview();
  }
  function showReview() {
    const res = state.result, now = new Date();
    const defName = state.songId ? M.autoName(VZ.songTitle(state.songId), VZ.today()) : (lessonId ? '레슨 녹음' : '녹음') + ' ' + (now.getMonth() + 1) + '.' + now.getDate() + ' ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');
    setUI('review'); status.textContent = '미리 듣고 저장하세요.';
    M.drawWave(wave, res.waveform, '#A65CFF');
    review.hidden = false;
    review.innerHTML = '<div class="card stack"><div data-p></div><label class="field" style="margin:0"><span>제목</span><input type="text" name="name" maxlength="150" value="' + esc(defName) + '"></label><label class="field" style="margin:0"><span>메모 (선택)</span><textarea name="memo" rows="2" maxlength="3000" placeholder="잘된 점, 고칠 점" style="min-height:64px"></textarea></label><div class="btn-row"><button type="button" class="btn ghost" data-redo><i class="ph ph-arrow-counter-clockwise"></i>다시</button><button type="button" class="btn" data-save style="flex:2"><i class="ph ph-check"></i>저장</button></div><div data-fail hidden></div></div>';
    const tmp = {id:'preview', name:defName, type:res.type, blob:res.blob, durationSeconds:res.durationSeconds};
    const pl = M.player(review.querySelector('[data-p]'), tmp, {});
    review.querySelector('[data-redo]').onclick = async () => { if (await VZ.confirm('다시 녹음', '이번 녹음을 버리고 다시 녹음할까요?', {ok:'다시 녹음', danger:true})) { pl.destroy(); reset(); } };
    review.querySelector('[data-save]').onclick = () => save(pl);
  }
  async function save(pl) {
    const res = state.result, btn = review.querySelector('[data-save]'), fail = review.querySelector('[data-fail]');
    const id = state.savedId ||= VZ.uid();
    const item = {id, ...(window.VzipAccountScope?{accountOwner:res.accountOwner}:{}), name:review.querySelector('[name=name]').value.trim() || '녹음', created:Date.now(), recordedDate:VZ.today(), dateSource:'recorded', type:res.type, source:lessonId ? 'lesson' : 'practice', songId:state.songId, song:VZ.songLabel(VZ.song(state.songId)), blob:res.blob, durationSeconds:res.durationSeconds, waveform:res.waveform, review:review.querySelector('[name=memo]').value};
    btn.disabled = true; btn.textContent = '저장 중…'; fail.hidden = true;
    try {
      await M.saveBlob(item, p => { btn.textContent = '클라우드 저장 ' + p + '%'; });
      if (lessonId) VZ.change(d => { const l = d.lessons.find(x => x.id === lessonId); if (l) { l.recordings ||= []; if (!l.recordings.some(x => x.id === id)) l.recordings.push({id, note:item.review || ''}); } }, {silent:true});
      res.releaseProtection?.();state.saved = true; pl.destroy();
      review.innerHTML = '<div class="card stack"><div class="row"><span class="avatar" style="background:var(--ok-soft);color:var(--ok)"><i class="ph ph-check"></i></span><div class="grow"><strong>저장했어요</strong><div class="small muted">' + esc(item.name) + ' · ' + VZ.clock(item.durationSeconds) + (window.vzipCloudSignedIn?.() ? ' · 클라우드 백업 진행' : '') + '</div></div></div><div class="btn-row">' +
        (lessonId ? '<a class="btn secondary" href="#/lesson/' + esc(lessonId) + '">레슨으로</a>' : '<button type="button" class="btn secondary" data-log>연습 기록</button>') + '<button type="button" class="btn" data-again>새 녹음</button></div>' +
        (state.songId ? '<a class="btn ghost" href="#/song/' + esc(state.songId) + '">' + esc(VZ.songTitle(state.songId)) + ' 곡 보기</a>' : '') + '</div>';
      review.querySelector('[data-again]').onclick = reset;
      review.querySelector('[data-log]')?.addEventListener('click', () => VZ.practiceSheet({songId:state.songId, mediaIds:[id]}));
      VZ.toast('녹음을 저장했어요.');
      status.textContent = '';
    } catch (e) {
      btn.disabled = false; btn.innerHTML = '<i class="ph ph-arrow-clockwise"></i>다시 저장';
      fail.hidden = false;
      fail.innerHTML = '<p class="small" style="color:var(--danger);margin:0 0 8px">저장 실패: ' + esc(e.message) + '<br>녹음 원본은 이 화면에 보관 중이에요. 다시 저장하거나 기기로 내려받으세요.</p><button type="button" class="btn ghost block" data-dl><i class="ph ph-download-simple"></i>기기로 내려받기</button>';
      fail.querySelector('[data-dl]').onclick = () => { const url = URL.createObjectURL(res.blob); const a = document.createElement('a'); a.href = url; a.download = item.name + (res.type.includes('mp4') ? '.m4a' : '.webm'); a.click(); setTimeout(() => URL.revokeObjectURL(url), 4000); };
    }
  }
  if (!M.canRecord()) { status.textContent = '이 브라우저는 녹음을 지원하지 않아요. 전체 녹음에서 파일을 가져올 수 있어요.'; mainBtn.disabled = true; }
}});
VZ.pickSong = (value, onPick) => {
  VZ.sheet({title:'곡 선택', body:'<form id="pick-song-form">' + VZ.songSelect('song', value) + '</form>',
    foot:'<button type="submit" form="pick-song-form" class="btn block">선택 완료</button>',
    onMount:(el, close) => { const form = el.querySelector('form'); form.onsubmit = e => { e.preventDefault(); const id = VZ.readSong(form, 'song'); if (id === null) return; onPick(id); close(); }; }});
};

/* ---------- 내 곡 ---------- */
const songArUrl = value => { try { const url = new URL(String(value || '').trim()); return ['https:', 'http:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
const songArRow = (link = {}) => '<div class="vz-ar-edit-row" data-ar-row data-id="' + esc(link.id || '') + '"><label class="field"><span>이름 (선택)</span><input type="text" data-ar-label maxlength="80" placeholder="예: 연습용 반주" value="' + esc(link.label || '') + '"></label><label class="field"><span>링크</span><input type="url" data-ar-url inputmode="url" maxlength="2000" placeholder="https://" value="' + esc(link.url || '') + '"></label><button type="button" class="icon-btn" data-remove-ar aria-label="AR 링크 삭제"><i class="ph ph-x" aria-hidden="true"></i></button></div>';
VZ.songSheet = (song, onSaved, {hideShow = false, focusAr = false} = {}) => {
  VZ.sheet({title:song ? '곡 수정' : '곡 추가', body:'<form id="song-form"><label class="field"><span>곡 제목 <span class="req">*</span></span><input type="text" name="title" maxlength="150" required autofocus value="' + esc(song?.title || '') + '"></label>' + (hideShow ? '' : '<label class="field"><span>작품 / 아티스트</span><input type="text" name="show" maxlength="150" placeholder="예: 레미제라블" value="' + esc(song?.show || '') + '"></label>') + '<label class="field"><span>별칭 (쉼표로 구분)</span><input type="text" name="aliases" maxlength="300" placeholder="예: 원데이모어, One Day" value="' + esc((song?.aliases || []).join(', ')) + '"><small class="small muted">파일 이름에 별칭이 들어 있으면 가져올 때 이 곡을 추천해요.</small></label><div class="vz-ar-edit"><div class="row between"><strong>AR 레퍼런스</strong><button type="button" class="btn sm secondary" data-add-ar>+ 링크 추가</button></div><div data-ar-rows>' + (song?.arLinks || []).map(songArRow).join('') + '</div></div></form>',
    foot:'<button type="submit" form="song-form" class="btn block">' + (song ? '저장' : '곡 추가') + '</button>',
    onMount:(el, close) => {
      const form = el.querySelector('form');
      const rows = form.querySelector('[data-ar-rows]');
      const addAr = () => { rows.insertAdjacentHTML('beforeend', songArRow()); rows.lastElementChild.querySelector('[data-ar-url]').focus(); };
      form.querySelector('[data-add-ar]').onclick = addAr;
      rows.onclick = e => { const button = e.target.closest('[data-remove-ar]'); if (button) button.closest('[data-ar-row]').remove(); };
      if (focusAr) addAr();
      form.onsubmit = e => {
        e.preventDefault();
        const title = form.title.value.trim(), show = hideShow ? (song?.show || '') : form.show.value.trim(), aliases = [...new Set(form.aliases.value.split(/[,，]/).map(x => x.trim()).filter(Boolean))].slice(0, 20);
        const arLinks = [];
        for (const row of rows.querySelectorAll('[data-ar-row]')) {
          const label = row.querySelector('[data-ar-label]').value.trim(), input = row.querySelector('[data-ar-url]'), raw = input.value.trim();
          if (!raw && !label) continue;
          const url = songArUrl(raw);
          if (!url) { input.setCustomValidity('http:// 또는 https:// 링크를 입력해 주세요.'); input.reportValidity(); input.addEventListener('input', () => input.setCustomValidity(''), {once:true}); return; }
          arLinks.push({id:row.dataset.id || VZ.uid(), label, url});
        }
        if (!title) return;
        if (!song && VZ.db.songs.some(s => s.title.trim().toLowerCase() === title.toLowerCase() && (s.show || '') === show)) { VZ.toast('이미 같은 곡이 있어요.', 'error'); return; }
        let id = song?.id;
        const ok = VZ.change(d => { if (song) Object.assign(d.songs.find(s => s.id === song.id), hideShow ? {title, aliases, arLinks} : {title, show, aliases, arLinks}); else { id = VZ.uid(); d.songs.push({id, title, show, aliases, arLinks, created:Date.now()}); } });
        if (ok) { close(); VZ.toast(song ? '곡을 수정했어요.' : '곡을 추가했어요.'); onSaved?.(id); }
      };
    }});
};
let songQ = '';
/* v4 IA: 내 곡 holds two views, 곡별 (#/songs) and 전체 녹음 (#/library, formerly the 보관함 tab). Same routes, no data change. */
VZ.songsSwitch = active => '<nav class="vz-songs-switch" aria-label="내 곡 보기">' +
  [['songs', '곡별'], ['library', '전체 녹음']].map(([route, label]) => '<a href="#/' + route + '"' + (route === active ? ' aria-current="page"' : '') + '>' + label + '</a>').join('') + '</nav>';
VZ.route('songs', {title:'내 곡', tab:'songs', actions:() => '<button type="button" class="icon-btn" data-add-song aria-label="곡 추가"><i class="ph ph-plus"></i></button>', render() {
  return VZ.songsSwitch('songs') + '<a class="vz-performances" href="#/performances"><i class="ph ph-ticket"></i><strong>나의 공연</strong><i class="ph ph-caret-right"></i></a><div data-recent-song></div><div class="vz-section-heading"><h2>전체 곡</h2><button type="button" class="icon-btn vz-filter-icon" data-song-filter aria-label="곡 필터" aria-pressed="false"><i class="ph ph-funnel"></i></button><button type="button" class="icon-btn vz-search-icon" data-song-search aria-label="곡 검색" aria-pressed="false"><i class="ph ph-magnifying-glass"></i></button></div><div hidden data-repertoire-filter>' + (VZ.repertoire?.toolbar() || '') + '</div><div data-l></div>';
}, async mount(main, r) {
  document.querySelector('[data-add-song]').onclick = () => VZ.songSheet(null, id => VZ.nav('#/song/' + id));
  if (r.query.get('add')) { history.replaceState(null, '', '#/songs'); VZ.songSheet(null, id => VZ.nav('#/song/' + id)); }
  let sort = 'recent', media = M.cached();
  const l=main.querySelector('[data-l]'), recent=main.querySelector('[data-recent-song]');
  const labels={recent:'최근 연습순',name:'이름순',created:'최근 등록순',skill:'숙련도순'};
  const draw=()=>{
    const db=VZ.db,act=VZ.songActivity(media),term=songQ.trim().toLowerCase();
    VZ.collectionCount?.(db.songs.length,'곡');
    const stateSelect=main.querySelector('[data-rep-filter]');
    const filter=main.querySelector('[data-song-filter]');if(filter)filter.setAttribute('aria-pressed',String(!!stateSelect?.value||sort!=='recent'));
    main.querySelector('[data-song-search]').setAttribute('aria-pressed',String(!!term));
    const latest=db.songs.filter(s=>act.get(s.id)).sort((a,b)=>String(act.get(b.id)).localeCompare(String(act.get(a.id))))[0];
    recent.innerHTML=latest?'<a class="vz-recent-song" href="#/record?song='+encodeURIComponent(latest.id)+'"><span class="vz-recent-kicker">최근 연습곡</span><strong>'+esc(latest.title)+'</strong><span>'+esc([latest.show,VZ.repertoire?.role(latest)].filter(Boolean).join(' · '))+'</span><i class="ph ph-music-note vz-hero-note" aria-hidden="true"></i><div class="vz-recent-meta"><span>'+esc(VZ.repertoire?.statusLabel(latest)||'상태 미지정')+(VZ.repertoire?.score(latest)?' · 숙련도 '+VZ.repertoire.score(latest).toFixed(1)+'/5':'')+'</span><span>'+esc(VZ.dateLabel(act.get(latest.id),true))+' 연습</span></div></a>':'';
    const newest=new Map(VZ.songsNewest().map((s,i)=>[s.id,i]));
    const list=db.songs.filter(s=>(!term||(s.title+' '+(s.show||'')+' '+(VZ.repertoire?.role(s)||'')).toLowerCase().includes(term))&&(!VZ.repertoire||VZ.repertoire.matches(s)));
    list.sort(sort==='skill'?(a,b)=>(VZ.repertoire?.score(b)||0)-(VZ.repertoire?.score(a)||0):sort==='created'?(a,b)=>newest.get(a.id)-newest.get(b.id):sort==='name'?(a,b)=>a.title.localeCompare(b.title,'ko'):(a,b)=>String(act.get(b.id)||'').localeCompare(String(act.get(a.id)||''))||a.title.localeCompare(b.title,'ko'));
    if(!db.songs.length){l.innerHTML=VZ.empty('music-notes','곡을 추가하면 녹음·레슨·숙제를 곡별로 모아볼 수 있어요.','<button class="btn sm" data-add-first>첫 곡 추가</button>');l.querySelector('[data-add-first]').onclick=()=>VZ.songSheet(null,id=>VZ.nav('#/song/'+id));return;}
    l.innerHTML=list.length?'<div class="list vz-song-list">'+list.map(s=>'<a class="item" href="#/song/'+encodeURIComponent(s.id)+'"><span class="avatar"><i class="ph ph-music-note"></i></span><span class="item-main"><span class="item-title">'+esc(s.title)+'</span><span class="item-sub">'+esc([s.show,VZ.repertoire?.role(s)].filter(Boolean).join(' · '))+'</span><span class="vz-song-status">'+esc(VZ.repertoire?.statusLabel(s)||'상태 미지정')+'</span></span><i class="ph ph-caret-right chev"></i></a>').join('')+'</div>':VZ.empty('magnifying-glass','조건에 맞는 곡이 없어요.');
  };
  VZ.repertoire?.wireList(main,draw);
  main.querySelector('[data-song-search]').onclick=()=>VZ.collectionSearch('곡 검색','곡명·작품·배역 검색',songQ,value=>{songQ=value;draw();});
  main.querySelector('[data-song-filter]').onclick=()=>{const select=main.querySelector('[data-rep-filter]');if(!select)return;VZ.sheet({title:'곡 필터',body:'<div class="vz-choice-list"><button type="button" class="vz-choice" data-filter-status>상태 <span>'+esc(select.selectedOptions[0]?.text||'전체 상태')+' ›</span></button><button type="button" class="vz-choice" data-filter-sort>정렬 <span>'+esc(labels[sort])+' ›</span></button><button type="button" class="vz-choice" data-filter-reset>필터 초기화</button></div>',onMount:(sheet,close)=>{
    sheet.querySelector('[data-filter-status]').onclick=()=>{close();VZ.collectionChoice('상태 선택',[...select.options].map(o=>[o.value,o.value?o.text:'전체 상태']),select.value,value=>{select.value=value;select.dispatchEvent(new Event('change'));});};
    sheet.querySelector('[data-filter-sort]').onclick=()=>{close();VZ.collectionChoice('정렬 기준',Object.entries(labels),sort,value=>{sort=value;draw();});};
    sheet.querySelector('[data-filter-reset]').onclick=()=>{select.value='';sort='recent';select.dispatchEvent(new Event('change'));close();draw();};
  }});};
  draw();media=await M.list().catch(()=>media);if(l.isConnected)draw();
}});

/* ---------- 곡 상세 ---------- */
let songTab = 'media';
VZ.route('song', {title:'곡 상세', tab:'songs', back:true, noAutoRefresh:true,
  leave(){ songTab = 'media'; document.querySelector('.vz-collection-record')?.setAttribute('href','#/record'); VZ.mediaSelection?.hideSongAction(); },
  actions:r => VZ.song(r.params[0]) ? '<button type="button" class="icon-btn" data-song-menu aria-label="곡 수정·삭제"><i class="ph ph-dots-three-outline"></i></button>' : '',
  render(r) {
    const s = VZ.song(r.params[0]);
    if (!s) return VZ.empty('music-notes', '곡을 찾을 수 없어요. 삭제됐을 수 있어요.', '<a class="btn sm" href="#/songs">내 곡으로</a>');
    const tabs = [['media', '녹음'], ['lyrics', '가사'], ['scores', '악보'], ['timeline', '활동 기록'], ['ar', '레퍼런스']];
    return '<div class="song-head vz-song-detail-hero"><span class="vz-song-detail-eyebrow">곡 상세</span><strong class="vz-song-detail-title">' + esc(s.title) + '</strong>' + '<span class="vz-song-detail-summary" data-summary></span></div>' +
      '<div data-repertoire></div><div class="seg song-tabs" role="tablist">' + tabs.map(([k, v]) => '<button type="button" role="tab" data-tab="' + k + '" aria-pressed="' + (songTab === k) + '" aria-selected="' + (songTab === k) + '">' + v + '</button>').join('') + '</div><div data-body></div>';
  },
  async mount(main, r) {
    const s = VZ.song(r.params[0]); if (!s) return;
    document.querySelector('.vz-collection-record')?.setAttribute('href','#/record?song='+encodeURIComponent(s.id));
    document.querySelector('[data-song-menu]')?.addEventListener('click', () => VZ.menu({title:s.title, body:'<div class="list"><button type="button" class="item" data-e><i class="ph ph-pencil-simple"></i><span class="item-main">곡 정보 수정</span></button><button type="button" class="item" data-rep-menu><i class="ph ph-music-notes"></i><span class="item-main">나의 레퍼토리 설정</span></button><button type="button" class="item" data-d style="color:var(--danger)"><i class="ph ph-trash"></i><span class="item-main">곡 삭제</span></button></div>',
      onMount:(el, close) => {
        el.querySelector('[data-e]').onclick = () => { close(); VZ.songSheet(s, null, {hideShow:true}); };
        el.querySelector('[data-rep-menu]').onclick = () => { close(); VZ.menu({title:'나의 레퍼토리', body:'<div class="list">' + [['status','상태'],['skills','숙련도'],['keys','키 정보'],['take','대표 테이크']].map(([k,label]) => '<button type="button" class="item" data-rep="' + k + '"><span class="item-main">' + label + '</span></button>').join('') + '</div>', onMount:(panel,done) => panel.querySelectorAll('[data-rep]').forEach(button => button.onclick = () => { done(); if (button.dataset.rep === 'take') VZ.repertoire?.chooseTake?.(s.id); else VZ.repertoire?.edit?.(s.id,button.dataset.rep); })}); };
        el.querySelector('[data-d]').onclick = async () => {
          close();
          if (!await VZ.confirm('곡 삭제', '"' + s.title + '" 곡을 목록에서 삭제할까요? 녹음·연습·레슨 기록은 지워지지 않고 "곡 미지정"으로 남아요.', {ok:'삭제', danger:true})) return;
          if (VZ.change(d => { d.songs = d.songs.filter(x => x.id !== s.id); }, {silent:true})) { VZ.toast('곡을 삭제했어요. 기록은 남아 있어요.'); VZ.nav('#/songs'); }
        };
      }}));
    const body = main.querySelector('[data-body]');
    let media = M.cached().filter(m => m.songId === s.id), selectionTouched = false;
    const draw = () => {
      const db = VZ.db;
      const practices = db.practices.filter(p => p.songId === s.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const lessons = db.lessons.filter(l => VZ.lessonSongIds(l).includes(s.id) || l.songFeedback?.[s.id]).sort((a, b) => VZ.lessonSort(b, a));
      const tasks = db.assignments.filter(t => VZ.taskSongId(t) === s.id);
      const minutes = VZ.sumMinutes(VZ.timeEntries(media).filter(e => e.songId === s.id && !e.training));
      main.querySelector('[data-summary]').textContent = [minutes ? '연습 ' + VZ.minutes(minutes) : '', practices.length ? '기록 ' + practices.length + '회' : '', media.length ? '녹음 ' + media.length + '개' : '', (n => n ? '레슨 ' + n + '회' : '')(lessons.filter(l => VZ.lessonStatus(l) === 'done').length)].filter(Boolean).join(' · ') || '아직 기록이 없어요';
      VZ.repertoire?.songPanel(main.querySelector('[data-repertoire]'), VZ.song(s.id) || s, media);
      main.querySelectorAll('[data-tab]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.tab === songTab)); b.setAttribute('aria-selected', String(b.dataset.tab === songTab)); });
      const fb = l => l.songFeedback?.[s.id] || l.feedback || '';
      // Recordings live inside lessons and practices: each tab lists its records with their recordings.
      const lessonMedia = media.filter(m => M.occasion(m) === 'lesson'), practiceMedia = media.filter(m => M.occasion(m) === 'practice'), stageMedia = media.filter(m => M.occasion(m) === 'performance');
      const recList = (items, empty) => items.length ? '<div class="list" data-r>' + items.map(VZ.mediaRow).join('') + '</div>' : '<p class="small muted" style="margin:0 4px">' + empty + '</p>';
      if (songTab === 'media') {
        const visible = media.slice().sort((a,b) => String(M.dateOf(b) || '').localeCompare(String(M.dateOf(a) || '')) || (b.created || 0) - (a.created || 0));
        body.innerHTML = '<div class="vz-song-section"><h2>녹음 <span>' + visible.length + '</span></h2></div>' +
          (visible.length ? '<div class="vz-song-select-row"><label><input type="checkbox" data-all aria-label="녹음 전체선택"> 전체선택</label><div class="vz-song-selection-actions"><span data-selected-count>선택 0개</span></div></div><div class="vz-song-media-list" data-r data-song-media>' + visible.map(VZ.mediaRow).join('') + '</div>' : VZ.empty('waveform', '이 곡의 녹음이 없어요.', '<a class="btn sm" href="#/record?song=' + encodeURIComponent(s.id) + '">녹음 시작</a>'));
        const host = body.querySelector('[data-song-media]');
        if (host) {
          const linked = m => {
            const lesson = lessons.find(l => (l.recordings || []).some(x => x.id === m.id));
            if (lesson) return {kind:'lesson', date:lesson.date, summary:fb(lesson) || '피드백 미작성', minutes:'', rating:''};
            const practice = practices.find(p => (p.mediaIds || []).includes(m.id));
            if (practice) return {kind:'practice', date:practice.date, summary:practice.memo || '메모 없음', minutes:VZ.minutes(VZ.practiceMinutes(practice)), rating:practice.rating ? '★'+practice.rating : ''};
            return null;
          };
          host.addEventListener('click', e => {
            const chip = e.target.closest('[data-linked-record]');
            if (!chip) return;
            e.preventDefault(); e.stopImmediatePropagation();
            const item = visible.find(m => String(m.id) === chip.dataset.linkedRecord), record = item && linked(item);
            if (!record) return;
            const title = record.kind === 'lesson' ? '레슨 기록' : '연습 기록';
            VZ.sheet({title, body:'<div class="vz-song-linked-sheet"><p class="small muted">'+esc(VZ.dateLabel(record.date))+' · '+esc(s.title)+'</p><strong>'+esc([record.minutes,record.rating].filter(Boolean).join(' · ') || title)+'</strong><div class="vz-song-linked-note">'+esc(record.summary)+'</div></div>'});
          }, true);
          host.addEventListener('click', e => { if (e.target.closest('.vz-media-select, [data-toggle]')) { selectionTouched = true; setTimeout(sync, 0); } }, true);
          VZ.wireMedia(host, visible);
          host.querySelectorAll('[data-media]').forEach(row => {
            const item = visible.find(m => String(m.id) === row.dataset.media), name = row.querySelector('.item-title');
            if (!item || !name) return;
            const occasion = M.occasion(item), relation = linked(item);
            const chip = document.createElement('span');
            chip.className = 'vz-song-kind ' + occasion;
            chip.textContent = ({lesson:'레슨 기록',practice:'연습 기록',performance:'공연',audition:'오디션'})[occasion] || M.occasionLabel(occasion);
            if (relation) { chip.dataset.linkedRecord = item.id; chip.tabIndex = 0; chip.setAttribute('role','button'); chip.setAttribute('aria-label',chip.textContent+' 보기'); chip.addEventListener('keydown',e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); chip.click(); } }); }
            name.append(chip);
          });
          const all = body.querySelector('[data-all]');
          const sync = () => { const count = VZ.mediaSelection?.count(host) || 0; body.querySelector('[data-selected-count]').textContent = '선택 ' + count + '개'; all.checked = count === visible.length; all.indeterminate = count > 0 && count < visible.length; };
          all.onchange = () => { selectionTouched = true; VZ.mediaSelection?.selectAll(host, visible, all.checked); sync(); };
          VZ.mediaSelection?.selectAll(host, visible, true);
          sync();
        }
        VZ.mediaSelection?.showSongAction();
        return;
      }
      if (songTab === 'ar') {
        const current = VZ.song(s.id) || s;
        const links = (current.arLinks || []).filter(link => songArUrl(link.url));
        body.innerHTML = '<div data-song-mr></div><section class="vz-ar-links" aria-label="AR 레퍼런스"><div class="vz-ar-heading"><strong>AR 레퍼런스 <span>' + links.length + '</span></strong><button type="button" data-add-song-ar aria-label="AR 레퍼런스 링크 추가"><i class="ph ph-plus" aria-hidden="true"></i></button></div>' +
          (links.length ? '<div class="vz-ar-list">' + links.map((link, i) => '<div class="vz-ar-item"><a href="' + esc(songArUrl(link.url)) + '" target="_blank" rel="noopener noreferrer"><span><strong>' + esc(link.label || 'AR 레퍼런스 ' + (i + 1)) + '</strong><small>' + esc(link.url) + '</small></span><i class="ph ph-arrow-square-out" aria-hidden="true"></i></a>' + (VZ.shareUrl ? '<button type="button" class="icon-btn vz-ar-share" data-ar-share="' + i + '" aria-label="' + esc(link.label || 'AR 레퍼런스 ' + (i + 1)) + ' 링크 보내기"><i class="ph ph-share" aria-hidden="true"></i></button>' : '') + '</div>').join('') + '</div>' : '<p>링크를 추가하면 여기서 바로 열 수 있어요.</p>') + '</section>';
        VZ.renderSongMR?.(body.querySelector('[data-song-mr]'),current);
        body.querySelectorAll('[data-ar-share]').forEach(b => b.onclick = () => { const link = links[+b.dataset.arShare]; VZ.shareUrl(link.label || current.title + ' 레퍼런스', songArUrl(link.url)); });
        body.querySelector('[data-add-song-ar]').onclick = () => VZ.songSheet(VZ.song(s.id), () => draw(), {hideShow:true, focusAr:true});
        VZ.mediaSelection?.hideSongAction();
        return;
      }
      if (songTab === 'scores') {
        // The score list keeps its own host; the reference range (악보 기준 음역) sits below it.
        body.innerHTML = '<div data-score-list></div><div data-vocal-range></div>';
        if (VZ.renderScores) VZ.renderScores(body.querySelector('[data-score-list]'), s);
        VZ.vocalRangeCard?.(body.querySelector('[data-vocal-range]'), VZ.song(s.id) || s);
      }
      else if (songTab === 'lyrics') {
        const current = VZ.song(s.id) || s;
        const fields = [['lyrics','가사 원문',30000,11],['translation','한글 해석 / 번역',30000,8],['lyricNotes','발음 / 호흡 / 감정 메모',12000,7]];
        const preview = value => String(value || '').trim().replace(/\s+/g,' ').slice(0,180) || '입력한 내용이 없습니다';
        body.innerHTML = '<div class="vz-song-section"><h2>가사</h2></div><div class="vz-lyric-list">' + fields.map(([key,title]) =>
          '<button type="button" class="vz-lyric-card" data-lyric="'+key+'"><span class="vz-lyric-heading"><strong>'+title+'</strong><i class="ph ph-caret-right" aria-hidden="true"></i></span><span class="vz-lyric-preview" data-lyric-preview="'+key+'">'+esc(preview(current[key]))+'</span></button>').join('') + '</div>';
        body.querySelectorAll('[data-lyric]').forEach(button => button.onclick = () => {
          const [key,title,max,rows] = fields.find(([name]) => name === button.dataset.lyric);
          VZ.sheet({title, body:'<form class="vz-lyric-form"><label class="field"><span>'+title+'</span><textarea name="content" rows="'+rows+'" maxlength="'+max+'" aria-label="'+title+'"></textarea></label><p class="archive-error" role="alert"></p><button type="submit" class="btn block">저장</button></form>',
            onMount:(sheet,close) => {
              const form=sheet.querySelector('form');form.elements.content.value=(VZ.song(s.id)||s)[key]||'';
              form.onsubmit=e=>{e.preventDefault();const value=form.elements.content.value.trim();try{
                if(!VZ.change(db=>{const song=db.songs.find(x=>x.id===s.id);if(!song)throw Error('곡을 찾을 수 없어요.');song[key]=value},{silent:true}))throw Error('저장하지 못했어요. 다시 시도해 주세요.');
                body.querySelector('[data-lyric-preview="'+key+'"]').textContent=preview(value);close();VZ.toast('저장했어요.');
              }catch(error){form.querySelector('[role=alert]').textContent=error.message||String(error)}};
            }});
        });
      } else if (songTab === 'lessons') {
        body.innerHTML = '<h2 class="sec" style="margin-top:4px">레슨 피드백</h2>' + (lessons.length ? '<div class="list">' + lessons.map(l => '<a class="item" href="#/lesson/' + esc(l.id) + '"><span class="item-main"><span class="item-title">' + esc(VZ.dateLabel(l.date)) + ' ' + VZ.statusBadge(VZ.lessonStatus(l)) + '</span><span class="item-sub">' + esc(fb(l) || '피드백 미작성') + '</span></span><i class="ph ph-caret-right chev"></i></a>').join('') + '</div>' : VZ.empty('chalkboard-teacher', '이 곡과 연결된 레슨이 없어요.')) +
          '<h2 class="sec">레슨 녹음 ' + lessonMedia.length + '</h2>' + recList(lessonMedia, '이 곡의 레슨 녹음이 없어요.') +
          '<h2 class="sec">숙제 <button type="button" data-add-task>+ 숙제 추가</button></h2>' + (tasks.length ? '<div class="list">' + tasks.map(VZ.taskRow).join('') + '</div>' : VZ.empty('check-square', '이 곡의 숙제가 없어요.'));
        body.querySelector('[data-add-task]').onclick = () => VZ.taskSheet({songId:s.id});
      } else if (songTab === 'practice') {
        body.innerHTML = '<h2 class="sec" style="margin-top:4px">연습 기록 <button type="button" data-log2>+ 기록</button></h2>' + (practices.length ? '<div class="list">' + practices.map(VZ.practiceRow).join('') + '</div>' : '<p class="small muted" style="margin:0 4px">이 곡의 연습 기록이 없어요.</p>') +
          '<h2 class="sec">연습 녹음 ' + practiceMedia.length + ' <a href="#/record?song=' + esc(s.id) + '">+ 녹음</a></h2>' + recList(practiceMedia, '이 곡의 연습 녹음이 없어요.');
        body.querySelector('[data-log2]')?.addEventListener('click', () => VZ.practiceSheet({songId:s.id}));
      }
      if (songTab !== 'timeline') { body.querySelectorAll('[data-r]').forEach(r => VZ.wireMedia(r, media)); return; }
      {
        const shows = VZ.repertoire?.showsForSong?.(s.id) || [];
        body.innerHTML =
          '<div class="vz-song-section"><h2>공연·오디션 <span>' + shows.length + '</span></h2><a class="icon-btn" href="#/performances" aria-label="공연 관리"><i class="ph ph-arrow-up-right"></i></a></div>' +
          (shows.length ? '<div class="list">' + shows.map(VZ.repertoire.showCard).join('') + '</div>' : '') +
          (!shows.length ? '<p class="small muted" style="margin:0 4px">연결된 공연·오디션 기록이 없어요.</p>' : '') +
          '<div class="vz-song-section"><h2>레슨 기록 <span>' + lessons.length + '</span></h2><button type="button" data-add-lesson-from-activity aria-label="레슨 기록 추가"><i class="ph ph-plus"></i></button></div>' +
          (lessons.length ? '<div class="list">' + lessons.map(l => '<a class="item" href="#/lesson/' + esc(l.id) + '"><span class="item-main"><span class="item-title">' + esc(VZ.dateLabel(l.date)) + ' ' + VZ.statusBadge(VZ.lessonStatus(l)) + '</span><span class="item-sub">' + esc([VZ.timeRange(l), l.place, fb(l) || '피드백 미작성'].filter(Boolean).join(' · ')) + '</span></span><i class="ph ph-caret-right chev"></i></a>').join('') + '</div>' : '<p class="small muted" style="margin:0 4px">연결된 레슨 기록이 없어요.</p>') +
          '<div class="vz-song-section"><h2>연습 기록 <span>' + practices.length + '</span></h2><button type="button" data-log-from-activity aria-label="연습 기록 추가"><i class="ph ph-plus"></i></button></div>' +
          (practices.length ? '<div class="list">' + practices.map(p => VZ.practiceRow(p)).join('') + '</div>' : '<p class="small muted" style="margin:0 4px">이 곡의 연습 기록이 없어요.</p>') +
          '<div class="vz-song-section"><h2>숙제 <span>' + tasks.length + '</span></h2><button type="button" data-add-task aria-label="숙제 추가"><i class="ph ph-plus"></i></button></div>' +
          (tasks.length ? '<div class="vz-song-activity-list">' + tasks.map(VZ.taskRow).join('') + '</div>' : '<p class="small muted" style="margin:0 4px">연결된 숙제가 없어요.</p>');
        body.querySelector('[data-add-lesson-from-activity]').onclick = () => VZ.lessonSheet({songId:s.id});
        body.querySelector('[data-log-from-activity]').onclick = () => VZ.practiceSheet({songId:s.id});
        body.querySelector('[data-add-task]').onclick = () => VZ.taskSheet({songId:s.id});
      }
    };
    // The tab bar sticks to the top: a tab chosen further down starts its list right under the bar.
    main.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => {
      VZ.mediaSelection?.hideSongAction();
      songTab = b.dataset.tab; selectionTouched = false; draw();
      // Keep the user's current scroll position when changing tabs.
    });
    draw();
    media = (await M.list().catch(() => [])).filter(m => m.songId === s.id);
    if (body.isConnected && !selectionTouched) { VZ.mediaSelection?.clear(); draw(); }
    if (await M.fillDurations(media) && body.isConnected && !selectionTouched && !body.querySelector('.media-open:not([hidden])')) { VZ.mediaSelection?.clear(); draw(); }
  }});
/** "이 곡의 성장": recent time, practice days, rating, six months of minutes, first → latest recording. */
function songGrowth(host, s, media, practices) {
  if (!host) return;
  const entries = VZ.timeEntries(media).filter(e => e.songId === s.id && !e.training && /^\d{4}-\d{2}-\d{2}$/.test(e.date || ''));
  if (!entries.length && !media.length && !practices.length) { host.innerHTML = ''; return; }
  const total = VZ.sumMinutes(entries), days = new Set(entries.map(e => e.date)).size;
  const rated = [...practices.filter(p => p.rating > 0).map(p => p.rating), ...media.filter(m => m.rating > 0).map(m => m.rating)];
  const avg = rated.length ? (rated.reduce((a,b) => a + b, 0) / rated.length).toFixed(1) : '';
  const today = new Date(), months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1), key = VZ.ymd(d).slice(0,7);
    const rows = entries.filter(e => e.date.slice(0,7) === key);
    months.push({label:(d.getMonth()+1)+'월', minutes:VZ.sumMinutes(rows), count:rows.length});
  }
  const max = Math.max(1, ...months.map(m => m.minutes));
  const points = months.map((m,i) => [20+i*58, 87-(m.minutes/max)*64]);
  const path = points.map((p,i) => (i ? 'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const graph = '<svg viewBox="0 0 330 105" role="img" aria-label="최근 6개월 연습 시간">' +
    '<path d="' + path + '" fill="none" stroke="#7A32F5" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    points.map(p => '<circle cx="'+p[0]+'" cy="'+p[1].toFixed(1)+'" r="4" fill="#7A32F5" stroke="#fff" stroke-width="2"/>').join('') + '</svg>';
  const goal = Number(s.goalMinutes || 0);
  const goalText = goal > 0 ? '<div class="vz-song-goal"><span>연습 목표 ' + esc(VZ.minutes(goal)) + '</span><strong>' + esc(VZ.minutes(total)) + ' · ' + Math.round(total/goal*100) + '% 달성</strong></div>' : '';
  host.innerHTML = '<div class="vz-song-section"><h2>이 곡의 성장</h2></div><div class="card vz-song-dashboard">' +
    '<div class="vz-song-stats"><div><b>'+esc(VZ.minutes(total))+'</b><span>누적 연습</span></div><div><b>'+days+'일</b><span>연습한 날</span></div><div><b>'+(avg?'★ '+avg:'–')+'</b><span>평균 만족도</span></div></div>' +
    goalText + '<h3>최근 6개월 연습량</h3><div class="vz-song-chart">' + graph + '<div class="vz-song-months">' +
    months.map(m => '<div><span>'+m.label+'</span><strong>'+Math.round(m.minutes)+'분 · '+m.count+'회</strong></div>').join('') +
    '</div></div></div>';
}
// Refresh media-driven views when files change.
window.addEventListener('vzip:v6-media', () => { clearTimeout(window.__vzRefresh); window.__vzRefresh = setTimeout(() => { if (!rec?.result) VZ.softRender(); }, 400); });
})();




