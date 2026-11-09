/* VOCAL.zip v6 views: 레슨 일정·피드백, 숙제, 캘린더. No payment/ticket logic by design. */
(() => {
'use strict';
const VZ = window.VZ, M = VZ.media, esc = VZ.esc;

/* ---------- 숙제 ---------- */
/* 숙제 기간: startDate ~ dueDate (둘 다 선택). 기간 안의 연습마다 "숙제 했나요?"를 묻고, 횟수(assignmentReps)와 메모(assignmentNotes)를 남겨요. */
const md = ymd => { const d = VZ.parseYmd(ymd); return d ? (d.getMonth() + 1) + '/' + d.getDate() : ''; };
VZ.taskPeriod = t => t.startDate || t.dueDate ? (t.startDate ? md(t.startDate) : '') + ' ~ ' + (t.dueDate ? md(t.dueDate) : '') : '';
VZ.taskInPeriod = (t, date) => t.status !== 'done' && (!t.startDate || !date || date >= t.startDate) && (!t.dueDate || !date || date <= t.dueDate);
VZ.taskOverdue = t => t.status !== 'done' && !!t.dueDate && t.dueDate < VZ.today();
/** How often the homework was done: {sessions, reps, last} over practice records (excluding one record if given). */
VZ.taskTally = (t, exceptId) => window.VzipPracticeTime.homeworkProgress(VZ.db, t.id, exceptId);
VZ.taskRow = t => {
  const done = t.status === 'done';
  const lesson = VZ.taskLessons(t).map(id => VZ.db.lessons.find(l => l.id === id)).filter(Boolean)[0];
  const tally = VZ.taskTally(t), practiced = tally.sessions;
  const period = VZ.taskPeriod(t), late = VZ.taskOverdue(t);
  return '<div class="item ' + (done ? 'done' : '') + '"><button type="button" class="check" role="checkbox" aria-checked="' + done + '" data-task-check="' + esc(t.id) + '" aria-label="' + esc(t.title) + ' 완료"><i class="ph' + (done ? '-fill ph-check-circle' : ' ph-circle') + '"></i></button><button type="button" class="item-main" data-task="' + esc(t.id) + '" style="border:0;background:none;text-align:left;padding:0;min-height:44px"><span class="item-title" style="display:block">' + esc(t.title) + '</span><span class="item-sub" style="display:block">' + esc([period ? '기간 ' + period : '', VZ.songTitle(VZ.taskSongId(t)), !period && lesson ? VZ.dateLabel(lesson.date) + ' 레슨' : '', practiced ? tally.reps + '회 했어요' : ''].filter(Boolean).join(' · ') || '연결 없음') + (late ? ' <span class="badge warn">기간 지남</span>' : '') + '</span></button></div>';
};
document.addEventListener('click', e => {
  const c = e.target.closest('[data-task-check]');
  if (c) {
    const id = c.dataset.taskCheck;
    const t = VZ.db.assignments.find(x => x.id === id); if (!t) return;
    const done = t.status !== 'done';
    if (VZ.change(d => { const x = d.assignments.find(a => a.id === id); x.status = done ? 'done' : 'active'; if (done) x.doneAt = Date.now(); else delete x.doneAt; }))
      VZ.toast(done ? '숙제를 완료했어요.' : '숙제를 다시 진행 중으로 바꿨어요.');
    return;
  }
  const b = e.target.closest('[data-task]');
  if (b) { const t = VZ.db.assignments.find(x => x.id === b.dataset.task); if (t) VZ.taskSheet({task:t}); }
});
/** Default 마감일: the next scheduled lesson after today (homework is usually due then), else a week from today. */
function defaultDue() {
  const today = VZ.today(), next = VZ.db.lessons.filter(l => VZ.lessonStatus(l) === 'scheduled' && (l.date || '') > today).sort(VZ.lessonSort)[0];
  if (next) return next.date;
  const d = new Date(); d.setDate(d.getDate() + 7); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
VZ.taskSheet = ({task, songId = '', lessonId = ''} = {}) => {
  const db = VZ.db, t = task;
  const lessons = [...db.lessons].sort((a, b) => VZ.lessonSort(b, a)).slice(0, 40);
  const linked = t ? VZ.taskLessons(t)[0] || '' : lessonId;
  const practices = t ? window.VzipPracticeTime.homeworkRows(db, t.id).sort((a, b) => (b.date || '').localeCompare(a.date || '')) : [];
  VZ.sheet({title:t ? '숙제' : '숙제 추가', body:'<form id="task-form"><label class="field"><span>숙제 내용 <span class="req">*</span></span><textarea name="title" rows="2" maxlength="500" required autofocus style="min-height:64px">' + esc(t?.title || '') + '</textarea></label>' +
    VZ.songSelect('song', t ? t.songId || VZ.taskSongId(t) : songId, {label:'연결 곡'}) +
    '<div class="two"><label class="field"><span>시작일</span><input type="date" name="startDate" value="' + esc(t ? t.startDate || '' : VZ.today()) + '"></label><label class="field"><span>마감일</span><input type="date" name="dueDate" value="' + esc(t ? t.dueDate || '' : defaultDue(lessonId)) + '"></label></div>' +
    '<p class="small muted" style="margin:-6px 4px 14px">기간 안에 연습을 기록할 때마다 이 숙제를 했는지 물어봐요.</p>' +
    '<label class="field"><span>연결 레슨</span><select name="lesson"><option value="">연결 안 함</option>' + lessons.map(l => '<option value="' + esc(l.id) + '"' + (l.id === linked ? ' selected' : '') + '>' + esc(VZ.dateLabel(l.date) + ' ' + (VZ.timeRange(l) || '') + ' · ' + VZ.statusLabel[VZ.lessonStatus(l)]) + '</option>').join('') + '</select></label>' +
    (t ? '<label class="item" style="padding:0 0 14px"><input type="checkbox" name="done"' + (t.status === 'done' ? ' checked' : '') + ' style="width:22px;height:22px;accent-color:var(--ok)"><span class="item-main">숙제 완료</span></label>' : '') +
    (practices.length ? '<h2 class="sec" style="margin-top:4px">한 기록 <span class="small muted">연습 ' + practices.length + '번 · ' + VZ.taskTally(t).reps + '회</span></h2><div class="list" style="margin-bottom:14px">' + practices.map(p => '<button type="button" class="item" data-practice="' + esc(p.id) + '"><span class="avatar" style="background:var(--ok-soft);color:var(--ok);font-size:13px;font-weight:750">' + window.VzipPracticeTime.homeworkRepetitions(p, t.id) + '회</span><span class="item-main"><span class="item-title">' + esc(VZ.dateLabel(p.date)) + '</span><span class="item-sub">' + esc(p.assignmentNotes?.[t.id] || '메모 없음') + '</span></span><i class="ph ph-caret-right chev"></i></button>').join('') + '</div>' : '') + '</form>',
    foot:'<div class="btn-row">' + (t ? '<button type="button" class="btn danger" data-del>삭제</button>' : '') + '<button type="submit" form="task-form" class="btn" style="flex:2">저장</button></div>',
    onMount:(el, close) => {
      const form = el.querySelector('form');
      el.parentNode.querySelector('[data-del]')?.addEventListener('click', async () => {
        if (!await VZ.confirm('숙제 삭제', '이 숙제를 삭제할까요? 연습 기록은 그대로 남아요.', {ok:'삭제', danger:true})) return;
        if (VZ.change(d => { d.assignments = d.assignments.filter(a => a.id !== t.id); })) { close(); VZ.toast('숙제를 삭제했어요.'); }
      });
      form.onsubmit = e => {
        e.preventDefault();
        const title = form.title.value.trim(); if (!title) return;
        const sid = VZ.readSong(form, 'song'); if (sid === null) return;
        const lid = form.lesson.value, startDate = form.startDate.value, dueDate = form.dueDate.value;
        if (startDate && dueDate && dueDate < startDate) { VZ.toast('마감일이 시작일보다 빨라요.', 'error'); form.dueDate.focus(); return; }
        const ok = VZ.change(d => {
          if (t) {
            const x = d.assignments.find(a => a.id === t.id); if (!x) return;
            x.title = title; x.songId = sid; x.startDate = startDate; x.dueDate = dueDate;
            // Keep carried-over lesson links; only change the primary one.
            const ids = VZ.taskLessons(x).filter(id => id !== VZ.taskLessons(t)[0]);
            x.lessonIds = lid ? [lid, ...ids.filter(id => id !== lid)] : ids; x.lessonId = x.lessonIds[0] || '';
            const done = form.done?.checked; if (done && x.status !== 'done') x.doneAt = Date.now(); if (!done) delete x.doneAt; x.status = done ? 'done' : 'active';
          } else d.assignments.push({id:VZ.uid(), lessonId:lid, lessonIds:lid ? [lid] : [], title, status:'active', songId:sid, startDate, dueDate, created:Date.now()});
        });
        if (ok) { close(); VZ.toast(t ? '숙제를 저장했어요.' : '숙제를 추가했어요.'); }
      };
    }});
};
let hwTab = 'active';
VZ.route('homework', {title:'숙제', back:true, tab:'home', actions:() => '<button type="button" class="icon-btn" data-add-task aria-label="숙제 추가"><i class="ph ph-plus"></i></button>', render() {
  const all = VZ.db.assignments, active = all.filter(t => t.status !== 'done'), done = all.filter(t => t.status === 'done').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const list = hwTab === 'active' ? active : done;
  return '<div class="seg" style="margin-bottom:12px"><button type="button" data-hw="active" aria-pressed="' + (hwTab === 'active') + '">진행 중 ' + active.length + '</button><button type="button" data-hw="done" aria-pressed="' + (hwTab === 'done') + '">완료 ' + done.length + '</button></div>' +
    (list.length ? '<div class="list">' + list.map(VZ.taskRow).join('') + '</div>' : VZ.empty('check-square', hwTab === 'active' ? '진행 중인 숙제가 없어요.' : '완료한 숙제가 없어요.', hwTab === 'active' ? '<button type="button" class="btn sm" data-add-task2>숙제 추가</button>' : '')) +
    '<p class="small muted" style="margin:12px 4px">숙제 기간 안에 연습을 기록하면 숙제를 했는지, 몇 번 했고 어땠는지 물어봐요. 숙제를 다 끝내면 체크해 주세요.</p>';
}, mount(main) {
  document.querySelector('[data-add-task]').onclick = () => VZ.taskSheet();
  main.querySelector('[data-add-task2]')?.addEventListener('click', () => VZ.taskSheet());
  main.querySelectorAll('[data-hw]').forEach(b => b.onclick = () => { hwTab = b.dataset.hw; VZ.render(); });
}});

/* ---------- 레슨 일정 ---------- */
VZ.lessonSheet = ({lesson, date, songId} = {}) => {
  const l = lesson, db = VZ.db, selected = new Set(l ? VZ.lessonSongIds(l) : songId && VZ.song(songId) ? [songId] : []);
  const last = [...db.lessons].filter(x => x.place || x.teacher).sort((a, b) => VZ.lessonSort(b, a))[0];
  const st = l ? VZ.lessonStatus(l) : 'scheduled';
  VZ.sheet({title:l ? '레슨 일정 수정' : '레슨 일정 추가', body:'<form id="lesson-form">' +
    '<label class="field"><span>레슨 날짜 <span class="req">*</span></span><input type="date" name="date" required value="' + esc(l?.date || date || VZ.today()) + '"></label>' +
    '<div class="two"><label class="field"><span>시작 시간' + (l ? '' : ' <span class="req">*</span>') + '</span><input type="time" name="start" ' + (l ? '' : 'required') + ' value="' + esc(l?.startTime || '') + '"></label><label class="field"><span>종료 시간</span><input type="time" name="end" value="' + esc(l?.endTime || '') + '"></label></div>' +
    '<div class="two"><label class="field"><span>장소</span><input type="text" name="place" maxlength="100" value="' + esc(l ? l.place || '' : last?.place || '') + '"></label><label class="field"><span>선생님</span><input type="text" name="teacher" maxlength="60" value="' + esc(l ? l.teacher || '' : last?.teacher || '') + '"></label></div>' +
    '<fieldset class="field" style="border:0;padding:0"><legend>연습 곡</legend><div class="lesson-song-picker" data-songs></div></fieldset>' +
    '<label class="field"><span>준비 메모</span><textarea name="prep" rows="2" maxlength="2000" placeholder="레슨 전에 준비할 것, 질문할 것" style="min-height:64px">' + esc(l?.prepMemo || '') + '</textarea></label>' +
    (l ? '<fieldset class="field" style="border:0;padding:0"><legend>상태</legend><div class="seg" data-status>' + ['scheduled', 'done', 'cancelled'].map(s => '<button type="button" data-st="' + s + '" aria-pressed="' + (st === s) + '">' + VZ.statusLabel[s] + '</button>').join('') + '</div></fieldset>' : '') + '</form>',
    foot:'<button type="submit" form="lesson-form" class="btn block">' + (l ? '저장' : '일정 추가') + '</button>',
    onMount:(el, close) => {
      const form = el.querySelector('form'), songsHost = el.querySelector('[data-songs]');
      let status = st;
      const drawSongs = () => {
        songsHost.innerHTML = '<select aria-label="레슨 곡 추가" data-lesson-song data-pick="song"><option value="">곡을 선택해 추가하세요</option>' +
          VZ.songsNewest().filter(s => !selected.has(s.id)).map(s => '<option value="' + esc(s.id) + '">' + esc(VZ.songLabel(s)) + '</option>').join('') +
          '<option value="__new">+ 새 곡 추가</option></select><div class="lesson-song-selected" aria-label="선택한 곡">' +
          [...selected].map(id => '<button type="button" class="chip" data-remove-song="' + esc(id) + '" aria-label="' + esc(VZ.songTitle(id) || '이전에 연결된 곡') + ' 선택 해제">' + esc(VZ.songTitle(id) || '이전에 연결된 곡') + ' ×</button>').join('') + '</div>';
      };
      songsHost.onchange = e => {
        const pick = e.target.closest('[data-lesson-song]'); if (!pick?.value) return;
        if (pick.value === '__new') { pick.value = ''; VZ.songSheet(null, id => { selected.add(id); drawSongs(); }); return; }
        selected.add(pick.value); drawSongs(); songsHost.querySelector('select').focus();
      };
      songsHost.onclick = e => {
        const button = e.target.closest('[data-remove-song]'); if (!button) return;
        selected.delete(button.dataset.removeSong); drawSongs(); songsHost.querySelector('select').focus();
      };
      drawSongs();
      el.querySelectorAll('[data-st]').forEach(b => b.onclick = () => { status = b.dataset.st; el.querySelectorAll('[data-st]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); });
      form.onsubmit = e => {
        e.preventDefault();
        if (!form.date.value) return;
        if (form.end.value && form.start.value && form.end.value <= form.start.value) { VZ.toast('종료 시간은 시작 시간보다 늦어야 해요.', 'error'); return; }
        const songIds = [...selected];
        const fields = {date:form.date.value, startTime:form.start.value, endTime:form.end.value, place:form.place.value.trim(), teacher:form.teacher.value.trim(), songIds, songId:songIds[0] || '', prepMemo:form.prep.value, status};
        // Never stamp a status onto a legacy lesson unless the user changed it:
        // billing asks the user before deducting lessons that have no status.
        if (l && !l.status && status === st) delete fields.status;
        let id = l?.id;
        const ok = VZ.change(d => {
          if (l) { const x = d.lessons.find(y => y.id === l.id); if (x) { Object.assign(x, fields); if (!songIds.length && l.songId && !(l.songIds || []).length) x.songId = ''; } }
          else { id = VZ.uid(); d.lessons.push({id, ...fields, feedback:'', memo:'', recordings:[], created:Date.now()}); }
        });
        if (ok) { close(); VZ.toast(l ? '레슨 일정을 저장했어요.' : '레슨 일정을 추가했어요.'); if (!l) VZ.nav('#/lesson/' + id); }
      };
    }});
};
/** Scheduled lessons whose date has passed: their result (완료/취소) was never recorded. */
VZ.overdueLessons = () => VZ.db.lessons.filter(l => VZ.lessonStatus(l) === 'scheduled' && l.date && l.date < VZ.today()).sort(VZ.lessonSort);
/** Card that lets the user record those results in one tap (완료 → 레슨비 정산 자동 차감도 따라와요). */
VZ.overdueCard = (max = 3) => {
  const list = VZ.overdueLessons(); if (!list.length) return '';
  return '<div class="card stack overdue-card" data-overdue><div class="row" style="gap:8px"><i class="ph ph-warning-circle" style="font-size:20px;color:var(--warn)"></i><strong class="grow">지난 레슨 결과를 기록해 주세요</strong>' + (list.length > max ? '<a class="small" href="#/lessons">전체 ' + list.length + '</a>' : '') + '</div>' +
    list.slice(0, max).map(l => { const songs = VZ.lessonSongIds(l).map(VZ.songTitle).filter(Boolean); return '<div class="row overdue-row" style="gap:8px"><a class="grow" href="#/lesson/' + esc(l.id) + '" style="color:inherit;text-decoration:none;min-width:0"><span style="display:block;font-weight:650">' + esc(VZ.dateLabel(l.date)) + (l.startTime ? ' ' + esc(VZ.timeRange(l)) : '') + '</span><span class="small muted ellipsis" style="display:block">' + esc([songs.join(', '), l.place, l.teacher].filter(Boolean).join(' · ') || '레슨') + '</span></a><button type="button" class="btn sm" data-resolve="done" data-id="' + esc(l.id) + '">완료</button><button type="button" class="btn sm ghost" data-resolve="cancelled" data-id="' + esc(l.id) + '">취소</button></div>'; }).join('') + '</div>';
};
document.addEventListener('click', e => {
  const b = e.target.closest('[data-resolve]'); if (!b) return;
  const to = b.dataset.resolve, id = b.dataset.id;
  if (VZ.change(d => { const x = d.lessons.find(y => y.id === id); if (!x) return; x.status = to; if (to === 'done') x.completedAt = Date.now(); }))
    VZ.toast(to === 'done' ? '레슨을 완료로 기록했어요.' : '레슨을 취소로 기록했어요.');
});
const lessonFeedbackLabel = l => l.feedback?.trim() || VZ.lessonSongIds(l).some(id => l.songFeedback?.[id]?.trim()) ? '피드백 작성' : '피드백 미작성';
const lessonNoteIcon = '<svg class="vz-lesson-note-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4"/><path d="M2 6h4"/><path d="M2 10h4"/><path d="M2 14h4"/><path d="M2 18h4"/><path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z"/></svg>';
const lessonRecordTitle = l => [VZ.dateLabel(l.date),VZ.timeRange(l)||'시간 미정'].filter(Boolean).join(' · ');
const lessonRecordSub = l => [l.place,VZ.lessonSongIds(l).map(VZ.songTitle).filter(Boolean).join(', ')||'곡 미정',lessonFeedbackLabel(l)].filter(Boolean).join(' · ');
VZ.lessonRow = l => {
  const st=VZ.lessonStatus(l),late=st==='scheduled'&&l.date&&l.date<VZ.today();
  return '<a class="item" href="#/lesson/'+esc(l.id)+'"><span class="avatar">'+lessonNoteIcon+'</span><span class="item-main"><span class="item-title">'+esc(lessonRecordTitle(l))+'</span><span class="item-sub">'+esc(lessonRecordSub(l))+'</span></span>'+(late?'<span class="badge warn">결과 미기록</span>':VZ.statusBadge(st))+'<i class="ph ph-caret-right chev"></i></a>';
};
let lessonTab = 'upcoming';
VZ.route('lessons', {title:'레슨', back:true, tab:'calendar', actions:() => '<a class="icon-btn" href="billing/" aria-label="레슨비 정산"><i class="ph ph-receipt"></i></a><button type="button" class="icon-btn" data-add-lesson aria-label="레슨 일정 추가"><i class="ph ph-plus"></i></button>', render() {
  const all = VZ.db.lessons, today = VZ.today();
  const groups = {
    upcoming:all.filter(l => VZ.lessonStatus(l) === 'scheduled').sort(VZ.lessonSort),
    past:all.filter(l => VZ.lessonStatus(l) === 'done').sort((a, b) => VZ.lessonSort(b, a)),
    cancelled:all.filter(l => VZ.lessonStatus(l) === 'cancelled').sort((a, b) => VZ.lessonSort(b, a))
  };
  const overdue = groups.upcoming.filter(l => l.date < today).length;
  const list = groups[lessonTab];
  return '<div class="seg lesson-tabs" style="margin-bottom:14px"><button type="button" data-lt="upcoming" aria-pressed="' + (lessonTab === 'upcoming') + '">예정 ' + groups.upcoming.length + '</button><button type="button" data-lt="past" aria-pressed="' + (lessonTab === 'past') + '">완료 ' + groups.past.length + '</button><button type="button" data-lt="cancelled" aria-pressed="' + (lessonTab === 'cancelled') + '">취소 ' + groups.cancelled.length + '</button></div>' +
    (lessonTab === 'upcoming' && overdue ? '<div style="margin-bottom:12px">' + VZ.overdueCard(5) + '</div>' : '') +
    (list.length ? '<div class="list">' + list.map(VZ.lessonRow).join('') + '</div>' : VZ.empty('calendar-blank', {upcoming:'예정된 레슨이 없어요.', past:'완료한 레슨이 없어요.', cancelled:'취소한 레슨이 없어요.'}[lessonTab], lessonTab === 'upcoming' ? '<button type="button" class="btn sm" data-add-lesson2>레슨 일정 추가</button>' : ''));
}, mount(main) {
  document.querySelector('[data-add-lesson]').onclick = () => VZ.lessonSheet();
  main.querySelector('[data-add-lesson2]')?.addEventListener('click', () => VZ.lessonSheet());
  main.querySelectorAll('[data-lt]').forEach(b => b.onclick = () => { lessonTab = b.dataset.lt; VZ.render(); });
  VZ.billingImportLessons?.().catch(() => {});
  VZ.billingDecorateLessons?.(main);
}});

/* ---------- 레슨 상세 ---------- */
VZ.route('lesson', {title:'레슨', back:true, tab:'calendar',
  actions:r => VZ.db.lessons.some(l => l.id === r.params[0]) ? '<button type="button" class="icon-btn" data-edit-lesson aria-label="일정 수정"><i class="ph ph-pencil-simple"></i></button>' : '',
  render(r) {
    const l = VZ.db.lessons.find(x => x.id === r.params[0]);
    if (!l) return VZ.empty('calendar-x', '레슨을 찾을 수 없어요.', '<a class="btn sm" href="#/lessons">레슨 목록</a>');
    const st = VZ.lessonStatus(l), songIds = VZ.lessonSongIds(l);
    const tasks = VZ.db.assignments.filter(t => VZ.taskLessons(t).includes(l.id));
    const statusActions = st === 'scheduled' ? '<div class="btn-row"><button type="button" class="btn" data-set="done"><i class="ph ph-check"></i>레슨 완료</button><button type="button" class="btn ghost" data-set="cancelled">레슨 취소</button></div>'
      : '<button type="button" class="btn ghost block" data-set="scheduled">' + (st === 'done' ? '예정으로 되돌리기' : '취소 철회 (예정으로)') + '</button>';
    const perSong = songIds.some(id => l.songFeedback?.[id]);
    return '<div class="card stack" style="margin-bottom:12px"><div class="row between"><strong style="font-size:19px">' + esc(VZ.dateLabel(l.date)) + '</strong>' + VZ.statusBadge(st) + '</div>' +
      '<div class="small muted" style="display:grid;gap:4px">' + [VZ.timeRange(l) && '<span><i class="ph ph-clock"></i> ' + esc(VZ.timeRange(l)) + '</span>', l.place && '<span><i class="ph ph-map-pin"></i> ' + esc(l.place) + '</span>', l.teacher && '<span><i class="ph ph-user"></i> ' + esc(l.teacher) + '</span>', songIds.length && '<span><i class="ph ph-music-note"></i> ' + songIds.map(id => '<a href="#/song/' + esc(id) + '">' + esc(VZ.songTitle(id) || '삭제된 곡') + '</a>').join(', ') + '</span>', l.categoryLabel && '<span><i class="ph ph-tag"></i> ' + esc([l.categoryLabel, l.detail].filter(Boolean).join(' · ')) + '</span>'].filter(Boolean).join('') + '</div>' +
      (l.prepMemo ? '<div class="small" style="white-space:pre-wrap;background:var(--surface-2);padding:10px 12px;border-radius:10px">준비: ' + esc(l.prepMemo) + '</div>' : '') + statusActions + '<div data-billing-status></div></div>' +
      (st === 'cancelled' ? '' :
      '<h2 class="sec">피드백 <button type="button" data-fb>' + (l.feedback || l.memo || perSong ? '수정' : '작성') + '</button></h2>' +
      (l.feedback || l.memo || perSong ? '<div class="card stack">' + (l.feedback ? '<div style="white-space:pre-wrap">' + esc(l.feedback) + '</div>' : '') + songIds.filter(id => l.songFeedback?.[id]).map(id => '<div><div class="small" style="font-weight:700;color:var(--accent)">' + esc(VZ.songTitle(id)) + '</div><div style="white-space:pre-wrap">' + esc(l.songFeedback[id]) + '</div></div>').join('') + (l.memo ? '<div class="small muted" style="white-space:pre-wrap">메모: ' + esc(l.memo) + '</div>' : '') + '</div>'
        : '<div class="empty compact"><span class="muted">' + (st === 'done' ? '선생님 피드백을 기록해 두세요.' : '레슨 후 피드백을 기록할 수 있어요.') + '</span><button type="button" class="btn sm secondary" data-fb2>작성</button></div>') +
      '<h2 class="sec">숙제 <button type="button" data-add-task>+ 추가</button></h2>' + (tasks.length ? '<div class="list">' + tasks.map(VZ.taskRow).join('') + '</div>' : '<p class="small muted" style="margin:0 4px">이 레슨의 숙제가 없어요.</p>') +
      '<h2 class="sec">녹음 <span class="row" style="gap:12px"><button type="button" data-link-media>기존 녹음 연결</button><a href="#/record?lesson=' + esc(l.id) + (songIds[0] ? '&song=' + esc(songIds[0]) : '') + '">+ 녹음</a></span></h2><div data-recs></div>') +
      '<button type="button" class="btn ghost block" data-del-lesson style="margin-top:24px;color:var(--danger)"><i class="ph ph-trash"></i>레슨 삭제</button>';
  },
  async mount(main, r) {
    const id = r.params[0], l = VZ.db.lessons.find(x => x.id === id); if (!l) return;
    document.querySelector('[data-edit-lesson]').onclick = () => VZ.lessonSheet({lesson:l});
    main.querySelectorAll('[data-set]').forEach(b => b.onclick = () => {
      const to = b.dataset.set;
      if (VZ.change(d => { const x = d.lessons.find(y => y.id === id); x.status = to; if (to === 'done') x.completedAt = Date.now(); }))
        VZ.toast({done:'레슨을 완료로 표시했어요. 피드백을 남겨 보세요.', cancelled:'레슨을 취소로 표시했어요.', scheduled:'예정으로 되돌렸어요.'}[to]);
    });
    VZ.billingLessonCard?.(main.querySelector('[data-billing-status]'), l);
    main.querySelectorAll('[data-fb],[data-fb2]').forEach(b => b.onclick = () => feedbackSheet(l));
    main.querySelector('[data-add-task]')?.addEventListener('click', () => VZ.taskSheet({lessonId:id, songId:VZ.lessonSongIds(l)[0] || ''}));
    main.querySelector('[data-del-lesson]').onclick = async () => {
      if (!await VZ.confirm('레슨 삭제', '이 레슨을 삭제할까요? 숙제·숙제 수행 기록·녹음 원본은 지워지지 않고 이 레슨과의 연결만 해제돼요.', {ok:'삭제', danger:true})) return;
      const ok = VZ.change(d => {
        d.lessons = d.lessons.filter(x => x.id !== id);
        d.assignments.forEach(t => { if (VZ.taskLessons(t).includes(id)) { t.lessonIds = VZ.taskLessons(t).filter(x => x !== id); t.lessonId = t.lessonIds[0] || ''; } });
      }, {silent:true});
      if (ok) { VZ.toast('레슨을 삭제했어요.'); history.length > 1 ? history.back() : VZ.nav('#/lessons'); }
    };
    const host = main.querySelector('[data-recs]'); if (!host) return;
    const recs = l.recordings || [];
    main.querySelector('[data-link-media]').onclick = () => linkMediaSheet(l);
    if (!recs.length) { host.innerHTML = '<p class="small muted" style="margin:0 4px">연결된 녹음이 없어요.</p>'; return; }
    host.innerHTML = '<div class="empty compact"><span class="muted">불러오는 중…</span></div>';
    const media = await M.list().catch(() => []);
    if (!host.isConnected) return;
    const items = recs.map(x => media.find(m => m.id === x.id)).filter(Boolean);
    host.innerHTML = '<div class="list">' + recs.map(x => { const m = media.find(y => y.id === x.id); return m ? VZ.mediaRow(m).replace('<div class="media-open"', (x.note ? '<p class="small muted" style="margin:-6px 16px 10px 68px;white-space:pre-wrap">' + esc(x.note) + '</p>' : '') + '<div class="media-open"') : '<div class="item small muted">찾을 수 없는 녹음 (삭제됐거나 다른 기기에만 있어요)</div>'; }).join('') + '</div>';
    VZ.wireMedia(host.firstChild, items);
  }});
function feedbackSheet(l) {
  const songIds = VZ.lessonSongIds(l);
  VZ.sheet({title:'레슨 피드백', body:'<form id="fb-form"><label class="field"><span>전체 피드백</span><textarea name="feedback" rows="5" maxlength="10000" placeholder="선생님이 말씀하신 내용">' + esc(l.feedback || '') + '</textarea></label>' +
    songIds.map(id => '<label class="field"><span>' + esc(VZ.songTitle(id) || '곡') + ' 피드백</span><textarea name="song_' + esc(id) + '" rows="3" maxlength="5000" style="min-height:72px">' + esc(l.songFeedback?.[id] || '') + '</textarea></label>').join('') +
    '<label class="field"><span>내 메모</span><textarea name="memo" rows="3" maxlength="5000" style="min-height:72px">' + esc(l.memo || '') + '</textarea></label>' +
    (VZ.lessonStatus(l) === 'scheduled' && l.date <= VZ.today() ? '<label class="item" style="padding:0 0 8px"><input type="checkbox" name="complete" checked style="width:22px;height:22px;accent-color:var(--accent)"><span class="item-main">레슨 완료로 표시</span></label>' : '') + '</form>',
    foot:'<button type="submit" form="fb-form" class="btn block">피드백 저장</button>',
    onMount:(el, close) => {
      const form = el.querySelector('form');
      form.onsubmit = e => {
        e.preventDefault();
        const ok = VZ.change(d => {
          const x = d.lessons.find(y => y.id === l.id); if (!x) return;
          x.feedback = form.feedback.value; x.memo = form.memo.value;
          const sf = {...(x.songFeedback || {})};
          songIds.forEach(id => { const v = form.elements['song_' + id].value; if (v.trim()) sf[id] = v; else delete sf[id]; });
          x.songFeedback = sf;
          if (form.complete?.checked) { x.status = 'done'; x.completedAt = Date.now(); }
        });
        if (ok) { close(); VZ.toast('피드백을 저장했어요.'); }
      };
    }});
}
async function linkMediaSheet(l) {
  const media = await M.list().catch(() => []);
  const linked = new Set((l.recordings || []).map(x => x.id));
  const songIds = VZ.lessonSongIds(l);
  const sorted = [...media].sort((a, b) => {
    const near = m => Math.abs(VZ.daysBetween(l.date, M.dateOf(m) || '1970-01-01')) - (songIds.includes(m.songId) ? 3 : 0);
    return near(a) - near(b);
  }).slice(0, 60);
  VZ.sheet({title:'녹음 연결', body:sorted.length ? '<p class="small muted" style="margin-top:0">레슨 날짜와 가까운 녹음부터 보여요.</p><div class="list">' + sorted.map(m => '<label class="item"><input type="checkbox" value="' + esc(m.id) + '"' + (linked.has(m.id) ? ' checked' : '') + ' style="width:22px;height:22px;accent-color:var(--accent)"><span class="item-main"><span class="item-title">' + esc(M.label(m)) + '</span><span class="item-sub">' + esc(VZ.dateLabel(M.dateOf(m)) + ' · ' + (VZ.songTitle(m.songId) || '곡 미지정')) + '</span></span></label>').join('') + '</div>' : VZ.empty('waveform', '보관함에 녹음이 없어요.'),
    foot:sorted.length ? '<button type="button" class="btn block" data-save>연결 저장</button>' : '',
    onMount:(el, close) => {
      el.parentNode.querySelector('[data-save]')?.addEventListener('click', () => {
        const ids = [...el.querySelectorAll('input:checked')].map(i => i.value);
        const ok = VZ.change(d => {
          const x = d.lessons.find(y => y.id === l.id); if (!x) return;
          const notes = new Map((x.recordings || []).map(r => [r.id, r.note || '']));
          // Keep links to files not shown in this list (e.g. other device only).
          const shown = new Set(sorted.map(m => m.id));
          x.recordings = [...(x.recordings || []).filter(r => !shown.has(r.id)), ...ids.map(id => ({id, note:notes.get(id) || ''}))];
        });
        if (ok) { close(); VZ.toast('녹음 연결을 저장했어요.'); }
      });
    }});
}

/* ---------- 캘린더 ---------- */
let calMonth = null, calDay = null;
VZ.route('calendar', {title:'일정', actions:() => '<a class="icon-btn" href="#/lessons" aria-label="레슨 목록"><i class="ph ph-list-bullets"></i></a>', render(route) {
  const today = VZ.today();
  const requested=route?.query?.get('date'),date=VZ.parseYmd(requested);
  if(date&&VZ.ymd(date)===requested){calDay=requested;calMonth=requested.slice(0,7);}
  calDay ||= today;
  calMonth ||= today.slice(0, 7);
  return '<div data-calendar-summary></div><div class="card vz-calendar-month"><div class="cal-head"><button type="button" class="icon-btn" data-mv="-1" aria-label="이전 달"><i class="ph ph-caret-left"></i></button><strong data-title></strong><button type="button" class="icon-btn" data-mv="1" aria-label="다음 달"><i class="ph ph-caret-right"></i></button></div><div class="cal-grid" data-grid></div><div class="vz-calendar-footer"><div class="legend"><span><i class="l"></i>레슨</span><span><i class="p"></i>연습</span><span><i class="s"></i>공연</span></div><button type="button" data-today>오늘</button></div></div><div data-day></div>';
}, async mount(main) {
  const grid = main.querySelector('[data-grid]'), dayHost = main.querySelector('[data-day]');
  let media = M.cached();
  const byDay = () => {
    const map = new Map(), add = (d, k, x) => { if (!d) return; if (!map.has(d)) map.set(d, {l:[], p:[], rl:[], rp:[], rs:[], ps:[]}); map.get(d)[k].push(x); };
    // Registered productions (나의 공연) stand on their session days, or their run when no session is entered.
    for (const [d, list] of perfDays()) list.forEach(p => add(d, 'ps', p));
    VZ.db.lessons.forEach(l => add(l.date, 'l', l)); VZ.db.practices.forEach(p => add(p.date, 'p', p));
    // Only recordings that are not inside a lesson/practice record stand on their own day (as lesson or practice recordings).
    media.forEach(m => { const o = M.owner(m); if (!o.lesson && !o.practice) add(M.dateOf(m), {performance:'rs', lesson:'rl'}[M.occasion(m)] || 'rp', m); });
    return map;
  };
  const perfDays = () => {
    const out = new Map(); if (!VZ.repertoire?.showsOn) return out;
    const [y, m] = calMonth.split('-').map(Number);
    for (let i = -7; i < 45; i++) { const k = VZ.ymd(new Date(y, m - 1, 1 + i)), list = VZ.repertoire.showsOn(k); if (list.length) out.set(k, list); }
    if (!out.has(calDay)) { const list = VZ.repertoire.showsOn(calDay); if (list.length) out.set(calDay, list); }
    return out;
  };
  const draw = () => {
    const map = byDay(), [y, m] = calMonth.split('-').map(Number), first = new Date(y, m - 1, 1), today = VZ.today();
    main.querySelector('[data-title]').textContent = y + '년 ' + m + '월';
    VZ.calendarSummary.render(main.querySelector('[data-calendar-summary]'), {
      db:VZ.db,media,month:calMonth,dateOf:M.dateOf,titleOf:VZ.songTitle,esc,
      error:M.cloudError()
    });
    let html = ['일', '월', '화', '수', '목', '금', '토'].map(d => '<div class="dow">' + d + '</div>').join('');
    const start = new Date(y, m - 1, 1 - first.getDay());
    for (let i = 0; i < 42; i++) {
      const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), key = VZ.ymd(d), e = map.get(key);
      if (i >= 35 && d.getMonth() !== m - 1) break;
      const active = e?.l.filter(l => VZ.lessonStatus(l) !== 'cancelled'), lessonDot = active?.length || e?.rl.length, practiceDot = e?.p.length || e?.rp.length, stageDot = e?.rs.length || e?.ps.length;
      html += '<button type="button" class="cal-day' + (d.getMonth() !== m - 1 ? ' out' : '') + (key === today ? ' today' : '') + '" data-d="' + key + '" aria-pressed="' + (key === calDay) + '" aria-label="' + esc(VZ.dateLabel(key)) + (e ? ' 기록 있음' : '') + '"><span>' + d.getDate() + '</span><span class="dots">' + (lessonDot ? '<i class="l"></i>' : '') + (practiceDot ? '<i class="p"></i>' : '') + (stageDot ? '<i class="s"></i>' : '') + '</span></button>';
    }
    grid.innerHTML = html;
    const e = map.get(calDay) || {l:[], p:[], rl:[], rp:[], rs:[], ps:[]}, all = new Map(media.map(m => [m.id, m])), wired = [];
    // Each lesson/practice shows its own recordings underneath it.
    // Records keep their attached recordings; each unlinked recording is a separate playable card.
    const minis = ids => { const items = ids.map(id => all.get(id)).filter(Boolean); wired.push(...items); return items.length ? '<div class="minis" data-r>' + items.map(VZ.mediaMini).join('') + '</div>' : ''; };
    const owner = (row, ids, kind) => '<div class="cal-own" data-kind="'+kind+'">' + row + minis(ids) + '</div>';
    const loose = (title, items, kind) => { if (!items.length) return ''; wired.push(...items); return '<p class="cal-loose-heading">' + title + '</p>' + items.map(m => '<div class="cal-own cal-loose-card" data-kind="' + kind + '" data-r>' + VZ.mediaMini(m) + '</div>').join(''); };
    const group = rows => rows ? '<div class="cal-list">' + rows + '</div>' : '';
    const lessonRow=l=>'<a class="item vz-calendar-item" data-kind="lesson" href="#/lesson/'+esc(l.id)+'"><span class="avatar">'+lessonNoteIcon+'</span><span class="item-main"><span class="item-title">'+esc(lessonRecordTitle(l))+'</span><span class="item-sub">'+esc(lessonRecordSub(l))+'</span></span>'+(VZ.lessonStatus(l)==='scheduled'?'':VZ.statusBadge(VZ.lessonStatus(l)))+'<i class="ph ph-caret-right chev"></i></a>';
    const lessonsHtml = group(e.l.sort(VZ.lessonSort).map(l => owner(lessonRow(l), (l.recordings || []).map(r => r.id),'lesson')).join('') + loose('기록에 연결되지 않은 레슨 녹음', e.rl,'lesson'));
    const practiceHtml = group(e.p.map(p => owner(VZ.practiceRow(p, {day:true}), p.mediaIds || [],'practice')).join('') + loose('기록에 연결되지 않은 연습 녹음', e.rp,'practice'));
    const stageHtml = group(e.ps.map(p=>owner(VZ.repertoire.showCard(p),[],'stage')).join('') + loose('공연 녹음·영상', e.rs,'stage'));
    dayHost.innerHTML = '<div class="vz-calendar-day-head"><h2 class="sec">' + esc(VZ.dateLabel(calDay)) + '</h2><button type="button" data-add aria-label="일정 추가"><i class="ph ph-plus" aria-hidden="true"></i></button></div>' +
      (lessonsHtml || practiceHtml || stageHtml ? '<div class="stack">' + (stageHtml ? '<h3 class="cal-group stage">공연·오디션</h3>' + stageHtml : '') + (lessonsHtml ? '<h3 class="cal-group lesson">레슨</h3>' + lessonsHtml : '') + (practiceHtml ? '<h3 class="cal-group practice">연습</h3>' + practiceHtml : '') + '</div>'
        : '<p class="small muted" style="margin:0 4px">이 날 기록이 없어요.</p>');
    dayHost.querySelector('[data-add]').onclick=()=>VZ.sheet({title:'기록 추가',body:'<div class="vz-choice-list"><button type="button" class="vz-choice" data-calendar-add="lesson">레슨 일정<i class="ph ph-caret-right"></i></button><button type="button" class="vz-choice" data-calendar-add="practice">연습 기록<i class="ph ph-caret-right"></i></button><a class="vz-choice" href="#/performances" data-calendar-add="stage">나의 공연<i class="ph ph-caret-right"></i></a></div>',onMount:(sheet,close)=>sheet.querySelectorAll('[data-calendar-add]').forEach(b=>b.onclick=()=>{close();if(b.dataset.calendarAdd==='lesson')VZ.lessonSheet({date:calDay});if(b.dataset.calendarAdd==='practice')VZ.practiceSheet({date:calDay});})});
    dayHost.querySelectorAll('[data-r]').forEach(r => VZ.wireMedia(r, wired));
  };
  grid.onclick = e => { const b = e.target.closest('[data-d]'); if (!b) return; calDay = b.dataset.d; if (calDay.slice(0, 7) !== calMonth) calMonth = calDay.slice(0, 7); draw(); };
  main.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => { const [y, m] = calMonth.split('-').map(Number), d = new Date(y, m - 1 + Number(b.dataset.mv), 1); calMonth = VZ.ymd(d).slice(0, 7); draw(); });
  main.querySelector('[data-today]').onclick = () => { calDay = VZ.today(); calMonth = calDay.slice(0, 7); draw(); };
  // Horizontal swipe changes month.
  let sx = null; grid.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, {passive:true});
  grid.addEventListener('touchend', e => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 60) main.querySelector('[data-mv="' + (dx < 0 ? 1 : -1) + '"]').click(); });
  draw();
  media = await M.list().catch(() => []); if (grid.isConnected) draw();
}});
})();
