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
  return '<div class="item ' + (done ? 'done' : '') + '"><button type="button" class="check" role="checkbox" aria-checked="' + done + '" data-task-check="' + esc(t.id) + '" aria-label="' + esc(t.title) + ' 완료"><i class="ph' + (done ? '-fill ph-check-circle' : ' ph-circle') + '"></i></button><button type="button" class="item-main" data-task="' + esc(t.id) + '" style="border:0;background:none;text-align:left;padding:0;min-height:44px"><span class="item-title" style="display:block">' + esc(t.title) + '</span><span class="item-sub" style="display:flex;align-items:center;gap:6px"><span class="ellipsis" style="min-width:0">' + esc([period ? '기간 ' + period : '', VZ.songTitle(VZ.taskSongId(t)), t.source==='ai-candidate'?'AI 후보에서 직접 추가':'', !period && lesson ? VZ.dateLabel(lesson.date) + ' 레슨' : '', practiced ? tally.reps + '회 했어요' : ''].filter(Boolean).join(' · ') || '연결 없음') + '</span>' + (late ? '<span class="badge warn" style="flex:none">기간 지남</span>' : '') + '</span></button>' + (done ? '' : '<button type="button" class="vz-task-start vz-task-log" data-task-log="' + esc(t.id) + '" aria-label="' + esc(t.title) + ' 연습 기록">기록</button><a class="vz-task-start" href="' + esc(VZ.guideHref ? VZ.guideHref('homework:' + t.id) : '#/practice-set?guide=' + encodeURIComponent('homework:' + t.id)) + '" aria-label="' + esc(t.title) + ' 따라 하기">따라 하기</a>') + '</div>';
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
  // 숙제 › 연습 기록: the practice sheet with this homework's song and "했어요" filled in (1.0 점검).
  const log = e.target.closest('[data-task-log]');
  if (log) { VZ.practiceSheet({homeworkId:log.dataset.taskLog}); return; }
  const b = e.target.closest('[data-task]');
  if (b) { const t = VZ.db.assignments.find(x => x.id === b.dataset.task); if (t) VZ.taskSheet({task:t}); }
});
/** Default 마감일: the next scheduled lesson after today (homework is usually due then), else a week from today. */
function defaultDue() {
  const today = VZ.today(), next = VZ.db.lessons.filter(l => VZ.lessonStatus(l) === 'scheduled' && (l.date || '') > today).sort(VZ.lessonSort)[0];
  if (next) return next.date;
  const d = new Date(); d.setDate(d.getDate() + 7); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
VZ.taskDefaultDue = defaultDue;
/** A new 숙제, as 숙제 추가 saves it. Call inside VZ.change. */
VZ.addTask = (d, {title, songId = '', lessonId = '', startDate = '', dueDate = ''}) => {
  const task = {id:VZ.uid(), lessonId, lessonIds:lessonId ? [lessonId] : [], title, status:'active', songId, startDate, dueDate, created:Date.now()};
  d.assignments.push(task); return task;
};
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
          } else VZ.addTask(d, {title, songId:sid, lessonId:lid, startDate, dueDate});
        });
        if (ok) { close(); VZ.toast(t ? '숙제를 저장했어요.' : '숙제를 추가했어요.'); }
      };
    }});
};
let hwTab = 'active';
VZ.route('homework', {title:'숙제', back:true, tab:'calendar', actions:() => '<button type="button" class="icon-btn" data-add-task aria-label="숙제 추가"><i class="ph ph-plus"></i></button>', render() {
  const all = VZ.db.assignments, active = all.filter(t => t.status !== 'done'), done = all.filter(t => t.status === 'done').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  const list = hwTab === 'active' ? active : done;
  return '<div class="seg lesson-tabs" style="margin-bottom:12px"><button type="button" data-hw="active" aria-pressed="' + (hwTab === 'active') + '">진행 중 ' + active.length + '</button><button type="button" data-hw="done" aria-pressed="' + (hwTab === 'done') + '">완료 ' + done.length + '</button></div>' +
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
  // Status (예정/완료/취소) is not edited here: the lesson page's 레슨 완료·레슨 취소·예정으로 되돌리기 buttons, 피드백과 함께
  // 완료 and 지난 레슨 결과 change it (owner, 2026-11-26). Saving this sheet never touches status; a new lesson starts 예정.
  // Picked songs are not form fields: count them as edits when closing.
  let draft = null;
  // A NEW lesson's 준비 메모 stays when the sheet is closed without saving (owner, 2026-11-23): it is offered again the next
  // time 레슨 일정 추가 opens (with 저장된 내용으로 되돌리기 to drop it). An existing lesson's draft goes on close, as before.
  VZ.sheet({title:l ? '레슨 일정 수정' : '레슨 일정 추가', onClose:() => { if (l) draft?.discard(); },
    closeNote:() => !l && document.querySelector('#lesson-form [name=prep]')?.value.trim() ? '날짜·시간 같은 입력은 저장되지 않아요. 준비 메모는 이 기기에 남아서 다음에 레슨을 추가할 때 다시 보여 드려요. 닫을까요?' : '', dirtyState:() => [...selected].join(','), body:'<form id="lesson-form">' +
    '<label class="field"><span>레슨 날짜 <span class="req">*</span></span><input type="date" name="date" required value="' + esc(l?.date || date || VZ.today()) + '"></label>' +
    '<div class="two"><label class="field"><span>시작 시간' + (l ? '' : ' <span class="req">*</span>') + '</span><input type="time" name="start" ' + (l ? '' : 'required') + ' value="' + esc(l?.startTime || '') + '"></label><label class="field"><span>종료 시간</span><input type="time" name="end" value="' + esc(l?.endTime || '') + '"></label></div>' +
    '<div class="two"><label class="field"><span>장소</span><input type="text" name="place" maxlength="100" value="' + esc(l ? l.place || '' : last?.place || '') + '"></label><label class="field"><span>선생님</span><input type="text" name="teacher" maxlength="60" value="' + esc(l ? l.teacher || '' : last?.teacher || '') + '"></label></div>' +
    '<fieldset class="field" style="border:0;padding:0"><legend>연습 곡</legend><div class="lesson-song-picker" data-songs></div></fieldset>' +
    '<label class="field"><span>준비 메모</span><textarea name="prep" rows="2" maxlength="2000" placeholder="레슨 전에 준비할 것, 질문할 것" style="min-height:64px">' + esc(l?.prepMemo || '') + '</textarea></label>' +
    '</form>',
    foot:'<button type="submit" form="lesson-form" class="btn block">' + (l ? '저장' : '일정 추가') + '</button>',
    onMount:(el, close) => {
      const form = el.querySelector('form'), songsHost = el.querySelector('[data-songs]');
      draft = VZ.fieldDraft?.wire(form, l ? 'lesson:' + l.id + ':prep' : 'lesson:new:prep', [{name:'prep', saved:l?.prepMemo || ''}]) || null;
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
      form.onsubmit = e => {
        e.preventDefault();
        if (!form.date.value) return;
        if (form.end.value && form.start.value && form.end.value <= form.start.value) { VZ.toast('종료 시간은 시작 시간보다 늦어야 해요.', 'error'); return; }
        const songIds = [...selected];
        const fields = {date:form.date.value, startTime:form.start.value, endTime:form.end.value, place:form.place.value.trim(), teacher:form.teacher.value.trim(), songIds, songId:songIds[0] || '', prepMemo:form.prep.value};
        // A legacy lesson keeps having no status (billing asks the user before deducting lessons that have none).
        let id = l?.id;
        const ok = VZ.change(d => {
          if (l) { const x = d.lessons.find(y => y.id === l.id); if (x) { Object.assign(x, fields); if (!songIds.length && l.songId && !(l.songIds || []).length) x.songId = ''; } }
          else { id = VZ.uid(); d.lessons.push({id, ...fields, status:'scheduled', feedback:'', memo:'', recordings:[], created:Date.now()}); }
        });
        if (ok) { draft?.clear(); close(); VZ.toast(l ? '레슨 일정을 저장했어요.' : '레슨 일정을 추가했어요.'); if (!l) VZ.nav('#/lesson/' + id); }
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
let resolving = false;
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-resolve]'); if (!b || resolving) return;
  const to = b.dataset.resolve, id = b.dataset.id;
  if (to === 'done') {
    // Completing a lesson can deduct the lesson fee by itself: say what will be deducted and ask first.
    resolving = true;
    try {
      const l = VZ.db.lessons.find(y => y.id === id), fee = l ? await VZ.billingAutoPreview?.(l).catch(() => null) : null;
      if (fee && !await VZ.confirm('레슨 완료', VZ.dateLabel(l.date) + ' 레슨을 완료로 기록할까요?\n레슨비 정산에서 레슨권 ' + fee.text + '가 차감돼요.', {ok:'완료로 기록'})) return;
    } finally { resolving = false; }
  }
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
VZ.route('lessons', {title:'레슨 목록', back:true, tab:'calendar', actions:() => '<a class="icon-btn" href="billing/" aria-label="레슨비 정산"><i class="ph ph-receipt"></i></a><button type="button" class="icon-btn" data-add-lesson aria-label="레슨 일정 추가"><i class="ph ph-plus"></i></button>', render() {
  const all = VZ.db.lessons, today = VZ.today();
  const groups = {
    upcoming:all.filter(l => VZ.lessonStatus(l) === 'scheduled').sort(VZ.lessonSort),
    past:all.filter(l => VZ.lessonStatus(l) === 'done').sort((a, b) => VZ.lessonSort(b, a)),
    cancelled:all.filter(l => VZ.lessonStatus(l) === 'cancelled').sort((a, b) => VZ.lessonSort(b, a))
  };
  const overdue = groups.upcoming.filter(l => l.date < today).length;
  const list = groups[lessonTab];
  return (VZ.lessonDeletion?.pendingButton() || '') + '<div class="seg lesson-tabs" style="margin-bottom:14px"><button type="button" data-lt="upcoming" aria-pressed="' + (lessonTab === 'upcoming') + '">예정 ' + groups.upcoming.length + '</button><button type="button" data-lt="past" aria-pressed="' + (lessonTab === 'past') + '">완료 ' + groups.past.length + '</button><button type="button" data-lt="cancelled" aria-pressed="' + (lessonTab === 'cancelled') + '">취소 ' + groups.cancelled.length + '</button></div>' +
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
      '<a class="btn secondary block" href="#/lesson-ai/'+encodeURIComponent(l.id)+'">피드백에서 AI 숙제 후보 찾기</a><h2 class="sec">숙제 <button type="button" data-add-task>+ 추가</button></h2>' + (tasks.length ? '<div class="list">' + tasks.map(VZ.taskRow).join('') + '</div>' : '<p class="small muted" style="margin:0 4px">이 레슨의 숙제가 없어요.</p>') +
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
    VZ.scorePoints?.lessonEntry(main, l); // 마디별 지적으로 적기 (app/score-points.js)
    main.querySelector('[data-add-task]')?.addEventListener('click', () => VZ.taskSheet({lessonId:id, songId:VZ.lessonSongIds(l)[0] || ''}));
    main.querySelector('[data-del-lesson]').onclick = () => VZ.lessonDeletion.open(id);
    const query=new URLSearchParams(location.hash.split('?')[1]||''),deductionId=query.get('settlementDelete');
    if(deductionId){
      const expectedVersion=Number(query.get('version'));
      history.replaceState(null,'',location.pathname+location.search+'#/lesson/'+encodeURIComponent(id));
      if(Number.isSafeInteger(expectedVersion)&&expectedVersion>0)
        void VZ.lessonDeletion.open(id,{deductionId,expectedVersion,returnTo:'billing'});
      else VZ.toast('정산 삭제 대상을 다시 확인해 주세요.','error');
    }
    const host = main.querySelector('[data-recs]'); if (!host) return;
    const recs = l.recordings || [];
    main.querySelector('[data-link-media]').onclick = () => linkMediaSheet(l);
    if (!recs.length) { host.innerHTML = '<p class="small muted" style="margin:0 4px">연결된 녹음이 없어요.</p>'; return; }
    host.innerHTML = '' + (VZ.loadingRows?.() ?? '<p class="muted" role="status">불러오는 중…</p>') + '';
    const media = await M.list().catch(() => []);
    if (!host.isConnected) return;
    const items = recs.map(x => media.find(m => m.id === x.id)).filter(Boolean);
    host.innerHTML = '<div class="list">' + recs.map(x => { const m = media.find(y => y.id === x.id); return m ? VZ.mediaRow(m).replace('<div class="media-open"', (x.note ? '<p class="small muted" style="margin:-6px 16px 10px 68px;white-space:pre-wrap">' + esc(x.note) + '</p>' : '') + '<div class="media-open"') : '<div class="item small muted">찾을 수 없는 녹음 (삭제됐거나 다른 기기에만 있어요)</div>'; }).join('') + '</div>';
    VZ.wireMedia(host.firstChild, items);
    // 선생님 평가 남기기: two takes of a song heard and judged by the teacher (app/listen-verdict.js).
    VZ.listenLesson?.(host, l, media);
  }});
function feedbackSheet(l) {
  const songIds = VZ.lessonSongIds(l);
  let draft = null;
  VZ.sheet({title:'레슨 피드백', onClose:() => draft?.discard(), body:'<form id="fb-form"><label class="field"><span>전체 피드백</span><textarea name="feedback" rows="5" maxlength="10000" placeholder="선생님이 말씀하신 내용">' + esc(l.feedback || '') + '</textarea></label>' +
    songIds.map(id => '<label class="field"><span>' + esc(VZ.songTitle(id) || '곡') + ' 피드백</span><textarea name="song_' + esc(id) + '" rows="3" maxlength="5000" style="min-height:72px">' + esc(l.songFeedback?.[id] || '') + '</textarea></label>').join('') +
    '<label class="field"><span>내 메모</span><textarea name="memo" rows="3" maxlength="5000" style="min-height:72px">' + esc(l.memo || '') + '</textarea></label>' +
    (VZ.lessonStatus(l) === 'scheduled' && l.date <= VZ.today() ? '<label class="item" style="padding:0 0 8px"><input type="checkbox" name="complete" style="width:22px;height:22px;accent-color:var(--accent)"><span class="item-main">레슨 완료로 표시</span></label><p class="small muted" data-complete-note hidden style="margin:0 0 8px"></p>' : '') + '</form>',
    foot:'<button type="submit" form="fb-form" class="btn block">피드백 저장</button>',
    onMount:(el, close) => {
      const form = el.querySelector('form');
      // 05-A: typing is kept on this device until saved (closing, reload or the app being killed loses nothing).
      draft = VZ.fieldDraft?.wire(form, 'lesson:' + l.id + ':feedback', [{name:'feedback', saved:l.feedback || ''}, {name:'memo', saved:l.memo || ''},
        ...songIds.map(id => ({name:'song_' + id, saved:l.songFeedback?.[id] || ''}))]);
      // Saving feedback does not complete the lesson unless the box is ticked; ticking it says what completing deducts.
      const box = form.complete, note = el.querySelector('[data-complete-note]');
      if (box) {
        let fee = null;
        const show = () => { note.hidden = !(box.checked && fee); };
        box.onchange = show;
        VZ.billingAutoPreview?.(l).then(p => { if (!p) return; fee = p; note.textContent = '완료로 저장하면 레슨비 정산에서 레슨권 ' + p.text + '가 차감돼요.'; show(); }).catch(() => {});
      }
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
        if (ok) { draft?.clear(); close(); VZ.toast('피드백을 저장했어요.'); }
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
  VZ.sheet({title:'녹음 연결', body:sorted.length ? '<p class="small muted" style="margin-top:0">레슨 날짜와 가까운 녹음부터 보여요.</p><div class="list">' + sorted.map(m => '<label class="item"><input type="checkbox" value="' + esc(m.id) + '"' + (linked.has(m.id) ? ' checked' : '') + ' style="width:22px;height:22px;accent-color:var(--accent)"><span class="item-main"><span class="item-title">' + esc(M.label(m)) + '</span><span class="item-sub">' + esc(VZ.dateLabel(M.dateOf(m)) + ' · ' + (VZ.songTitle(m.songId) || '곡 미지정')) + '</span></span></label>').join('') + '</div>' : VZ.empty('waveform', '아직 녹음이 없어요.'),
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

/* ---------- 캘린더 (기록 탭, rec1 2026-11-27) ----------
 * Header: 기록 · 📊 (this month's practice summary, folded) · + 직접 적기 (the 기록 추가 menu).
 * A row of ways in (레슨 · 숙제 · 연습 기록 · 나의 공연), then a WEEK strip (‹ 11월 첫째 주 ›) that opens to the month
 * (한 달 보기). A ring around a day = its practice time against the daily target; a dot = a lesson or a stage.
 * The chosen day: its title, one gray summary line, and ONE card with the day's records grouped 레슨 · 무대 · 연습 ·
 * 따로 남긴 녹음. Every action is one that existed here before (open/edit/delete a record, play a recording and its ⋯
 * menu, link a recording, choose its song, add a record): this screen only reads and calls them. */
const W = window.VzipRecordWeek;
let calMonth = null, calDay = null, calSetOn = null, calPicked = false, calView = 'week', calSummaryOpen = false;
const rtIcon = {
  lesson:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
  stage:'<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></svg>',
  mic:'<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
  play:'<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/></svg>',
  star:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.5c.6 5.4 3.1 9.9 10.5 10.5-7.4.6-9.9 5.1-10.5 10.5C11.4 17.1 8.9 12.6 1.5 12 8.9 11.4 11.4 6.9 12 1.5z" fill="currentColor"/></svg>'
};
const RING_C = 2 * Math.PI * 16.3;
VZ.route('calendar', {title:'기록', tab:'calendar', noSettings:true,
  actions:() => '<button type="button" class="rt-head-btn rt-chart" data-cal-chart aria-label="이번 달 연습 요약" aria-expanded="' + calSummaryOpen + '" aria-controls="vz-cal-summary"><i class="ph ph-chart-bar" aria-hidden="true"></i></button>' +
    '<button type="button" class="rt-head-btn rt-add" data-add aria-label="기록 추가"><i class="ph ph-plus" aria-hidden="true"></i><span>직접 적기</span></button>',
  render(route) {
  const today = VZ.today();
  const requested=route?.query?.get('date'),date=VZ.parseYmd(requested);
  // The day kept from an earlier date (e.g. the app stayed open past midnight) gives way to today, unless a day was picked in this visit.
  if (calSetOn !== today && !calPicked) { calDay = today; calMonth = today.slice(0, 7); }
  calSetOn = today;
  if(date&&VZ.ymd(date)===requested){calDay=requested;calMonth=requested.slice(0,7);}
  // 기록 holds lessons, homework, practices and performances (V4 IA): one small row of ways in.
  const links = '<nav class="vz-record-links rt-links" aria-label="기록 바로가기">' + [['lessons', 'pencil-simple', '레슨'], ['homework', 'check', '숙제'], ['practices', 'timer', '연습 기록'], ['performances', 'music-notes', '나의 공연']]
    .map(([route, icon, label]) => '<a href="#/' + route + '"><i class="ph ph-' + icon + '" aria-hidden="true"></i><span>' + label + '</span></a>').join('') + '</nav>';
  return links + '<div class="rt-summary" id="vz-cal-summary" data-calendar-summary' + (calSummaryOpen ? '' : ' hidden') + '></div>' +
    '<section class="card vz-calendar-month rt-cal" aria-label="달력"><div class="rt-cal-head"><button type="button" class="rt-cal-mv" data-mv="-1"><i class="ph ph-caret-left" aria-hidden="true"></i></button><strong data-title aria-live="polite"></strong><button type="button" class="rt-cal-mv" data-mv="1"><i class="ph ph-caret-right" aria-hidden="true"></i></button></div>' +
    '<div class="rt-grid" data-grid></div><div class="rt-cal-foot"><button type="button" class="rt-cal-link" data-today>오늘</button><button type="button" class="rt-cal-link rt-cal-view" data-cal-view aria-expanded="false"><span></span><i class="ph ph-caret-down" aria-hidden="true"></i></button></div></section><div class="rt-day" data-day></div>';
}, leave() { calPicked = false; }, async mount(main) {
  const grid = main.querySelector('[data-grid]'), dayHost = main.querySelector('[data-day]'), summaryHost = main.querySelector('[data-calendar-summary]');
  const top = document.getElementById('top'), chart = top?.querySelector('[data-cal-chart]');
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
  const target = () => Number(VZ.dailyTargetMinutes?.() ?? VZ.db.settings?.dailyTargetMinutes ?? 30);
  const thisYear = new Date().getFullYear();
  /** One day of the strip or the month: a ring for practice (time against the daily target), a dot for a lesson or stage. */
  const dayButton = (key, e, {out = false} = {}) => {
    const d = VZ.parseYmd(key), today = VZ.today(), selected = key === calDay;
    const lessons = (e?.l || []).filter(l => VZ.lessonStatus(l) !== 'cancelled').length + (e?.rl.length || 0), stages = (e?.ps.length || 0) + (e?.rs.length || 0);
    const practices = (e?.p || []).filter(p => !VZ.practiceHidden?.(p)), practiced = practices.length + (e?.rp.length || 0);
    const minutes = practices.reduce((n, p) => n + (VZ.practiceMinutes(p) || 0), 0), ratio = W.ring(minutes, target());
    const has = [lessons ? 'lesson' : '', stages ? 'stage' : '', practiced ? 'practice' : ''].filter(Boolean);
    const label = [VZ.dateLabel(key), lessons ? '레슨' : '', stages ? '무대' : '', practiced ? '연습' + (minutes > 0 ? ' ' + W.duration(minutes) : '') : '', key === today ? '오늘' : ''].filter(Boolean).join(', ');
    const ring = practiced && !selected ? '<svg class="rt-ring" viewBox="0 0 38 38" aria-hidden="true"><circle cx="19" cy="19" r="16.3" class="rt-ring-track"/><circle cx="19" cy="19" r="16.3" class="rt-ring-bar" stroke-dasharray="' + RING_C.toFixed(1) + '" stroke-dashoffset="' + (RING_C * (1 - ratio)).toFixed(1) + '" transform="rotate(-90 19 19)"/></svg>' : '';
    const stars = selected ? '<span class="rt-tw" style="left:28px;top:-6px;width:8px;height:8px;animation-duration:2.4s">' + rtIcon.star + '</span><span class="rt-tw" style="left:-6px;top:22px;width:6px;height:6px;animation-delay:1s;animation-duration:2.2s">' + rtIcon.star + '</span><span class="rt-tw" style="left:31px;top:30px;width:5px;height:5px;animation-delay:1.7s;animation-duration:2.6s">' + rtIcon.star + '</span>' : '';
    return '<button type="button" class="rt-dayb' + (out ? ' out' : '') + (key === today ? ' today' : '') + (practiced ? ' has-ring' : '') + (has.length ? ' has-any' : '') + '" data-d="' + key + '" data-has="' + has.join(' ') + '" aria-pressed="' + selected + '"' + (key === today ? ' aria-current="date"' : '') + ' aria-label="' + esc(label) + '"><span class="rt-circle">' + ring + '<b>' + d.getDate() + '</b>' + stars + '</span><i class="rt-dot' + (lessons || stages ? ' on' : '') + '" aria-hidden="true"></i></button>';
  };
  const drawGrid = map => {
    const month = calView === 'month';
    main.querySelector('.rt-cal').dataset.view = calView;
    main.querySelector('[data-title]').textContent = month ? calMonth.replace(/^(\d+)-0?(\d+)$/, '$1년 $2월') : W.weekLabel(calDay, thisYear);
    main.querySelectorAll('[data-mv]').forEach(b => b.setAttribute('aria-label', (b.dataset.mv === '-1' ? '이전 ' : '다음 ') + (month ? '달' : '주')));
    const view = main.querySelector('[data-cal-view]');
    view.setAttribute('aria-expanded', String(month)); view.querySelector('span').textContent = month ? '한 주 보기' : '한 달 보기';
    // 오늘 only when today is not already the chosen day in view.
    main.querySelector('[data-today]').hidden = calDay === VZ.today();
    let html = '<div class="rt-dows" aria-hidden="true">' + '일월화수목금토'.split('').map(d => '<span>' + d + '</span>').join('') + '</div><div class="rt-days">';
    if (month) {
      const [y, m] = calMonth.split('-').map(Number), first = new Date(y, m - 1, 1), start = new Date(y, m - 1, 1 - first.getDay());
      for (let i = 0; i < 42; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i), key = VZ.ymd(d);
        if (i >= 35 && d.getMonth() !== m - 1) break;
        html += dayButton(key, map.get(key), {out:d.getMonth() !== m - 1});
      }
    } else for (const key of W.weekDays(calDay)) html += dayButton(key, map.get(key));
    grid.innerHTML = html + '</div>';
  };
  const chip = (inner, attrs = '') => '<button type="button" class="rt-chip"' + attrs + '>' + inner + '</button>';
  /** A recording as a ▶ chip; tapping opens the same player (and its ⋯ menu) under the chips. */
  const mediaChip = (m, label) => '<div class="rt-media" data-media="' + esc(m.id) + '">' + chip(rtIcon.play + '<span>' + esc(label) + '</span>', ' data-toggle aria-expanded="false" aria-label="' + esc(M.label(m)) + ' 듣기"') + '<div class="media-open rt-player" hidden></div></div>';
  const chips = list => list.length ? '<div class="rt-chips">' + list.join('') + '</div>' : '';
  const section = (key, label, total, body) => body ? '<section class="rt-sec" data-section="' + key + '"><h3 class="rt-sec-head"><span>' + label + '</span>' + (total ? '<span class="rt-sec-total">' + esc(total) + '</span>' : '') + '</h3>' + body + '</section>' : '';
  const top2 = (title, right) => '<span class="rt-top"><span class="rt-title">' + esc(title) + '</span>' + (right ? '<span class="rt-right">' + esc(right) + '</span>' : '') + '</span>';
  const sub = text => text ? '<span class="rt-sub">' + esc(text) + '</span>' : '';
  const vcTags = Object.fromEntries(window.VzipVoiceCheckModel?.TAGS || [['tired', '피곤'], ['hoarse', '쉰 소리'], ['good', '좋음']]);
  const drawDay = map => {
    const e = map.get(calDay) || {l:[], p:[], rl:[], rp:[], rs:[], ps:[]}, all = new Map(media.map(m => [m.id, m])), wired = [], shownIds = new Set();
    const files = ids => ids.map(id => all.get(id)).filter(Boolean).filter(m => !shownIds.has(m.id) && shownIds.add(m.id));
    const use = list => { wired.push(...list); return list; };
    /* 레슨 */
    const gone = new Set(VZ.db.deleted?.assignments || []);
    const lessons = e.l.sort(VZ.lessonSort), activeLessons = lessons.filter(l => VZ.lessonStatus(l) !== 'cancelled');
    const lessonItem = l => {
      const st = VZ.lessonStatus(l), songs = VZ.lessonSongIds(l).map(VZ.songTitle).filter(Boolean).join(', '), mins = W.lessonMinutes(l);
      const line = [VZ.timeRange(l) ? l.startTime : '시간 미정', songs || '곡 미정', st === 'done' ? '' : VZ.statusLabel[st]].filter(Boolean).join(' · ');
      const note = (l.feedback || '').trim().split('\n')[0] || lessonFeedbackLabel(l);
      const recs = use(files((l.recordings || []).map(r => r.id))), work = (VZ.db.assignments || []).filter(t => t && !gone.has(t.id) && VZ.taskLessons(t).includes(l.id)).length;
      return '<div class="rt-item rt-big" data-kind="lesson" data-status="' + esc(st) + '"><span class="rt-badge">' + rtIcon.lesson + '</span><div class="rt-body"><a class="rt-main" href="#/lesson/' + esc(l.id) + '">' + top2([l.teacher, l.place].filter(Boolean).join(' · ') || '레슨', mins ? VZ.minutes(mins) : '') + sub(line) + '<span class="rt-note">' + esc(note.slice(0, 80)) + '</span></a>' +
        chips([...recs.map((m, i) => mediaChip(m, '레슨 녹음' + (recs.length > 1 ? ' ' + (i + 1) : ''))), ...(work ? ['<a class="rt-chip" href="#/homework">숙제 ' + work + '</a>'] : [])]) + '</div></div>';
    };
    const looseItem = (m, kind, line, extra = []) => '<div class="rt-item rt-rec" data-kind="' + kind + '" data-media="' + esc(m.id) + '"><span class="rt-mic">' + rtIcon.mic + '</span><div class="rt-body">' + top2(M.label(m), m.durationSeconds ? VZ.clock(m.durationSeconds) : '') + sub(line) +
      '<div class="rt-chips">' + chip(rtIcon.play + '<span>듣기</span>', ' data-toggle aria-expanded="false" aria-label="' + esc(M.label(m)) + ' 듣기"') + extra.join('') + '</div><div class="media-open rt-player" hidden></div></div></div>';
    const looseLessons = use(e.rl.filter(m => !shownIds.has(m.id)));
    const lessonHtml = lessons.map(lessonItem).join('') + looseLessons.map(m => looseItem(m, 'lesson', '레슨 녹음 · 레슨 기록에 아직 안 묶임', activeLessons.length === 1 ? [chip('레슨에 묶기', ' data-rt-lesson="' + esc(activeLessons[0].id) + '"')] : [])).join('');
    /* 무대 */
    const stageItem = p => {
      const s = (p.sessions || []).find(x => x.date === calDay);
      return '<div class="rt-item rt-big" data-kind="stage"><span class="rt-badge">' + rtIcon.stage + '</span><div class="rt-body"><a class="rt-main" href="#/show/' + esc(p.id) + '">' + top2(p.title || '공연', s?.time || '') + sub([s?.number, p.role ? '배역 ' + p.role : '', p.venue].filter(Boolean).join(' · ') || '나의 공연') + '</a></div></div>';
    };
    const stageFiles = use(e.rs.filter(m => !shownIds.has(m.id)));
    const stageHtml = e.ps.map(stageItem).join('') + stageFiles.map(m => looseItem(m, 'stage', '공연 녹음·영상')).join('');
    /* 연습 */
    // A song's recording with no record of its own goes under that day's record of the same song (owner, 2026-11-23:
    // "얘네 왜 the river에 안 들어가?" — time typed for the song wins, so its takes made no record of their own). Display only:
    // nothing is written; the record's time stays what it was.
    const shownPractices = e.p.filter(p => !VZ.practiceHidden?.(p)), sameSong = new Map(), looseRp = [];
    for (const m of e.rp) {
      const p = m.songId && shownPractices.find(x => x.songId === m.songId && x.practiceMode !== 'training');
      if (p) { if (!sameSong.has(p.id)) sameSong.set(p.id, []); sameSong.get(p.id).push(m.id); } else looseRp.push(m);
    }
    const practiceSub = p => {
      const src = VZ.practiceSource(p), vc = p.voiceCheck;
      if (vc) return [Number.isInteger(vc.selfRating) ? '목 상태 ' + vc.selfRating : '', ...(vc.tags || []).map(t => vcTags[t] || '')].filter(Boolean).join(' · ') || '30초 체크';
      return [p.practiceMode === 'training' ? src.label || '보컬 트레이닝' : VZ.songTitle(p.songId) ? '곡 연습' : src.label, p.practiceTimeSource === 'recording' ? '녹음으로 셈' : '', p.rating ? '★' + p.rating : '', src.memo ? src.memo.slice(0, 40) : ''].filter(Boolean).join(' · ');
    };
    const coach = p => Array.isArray(p.dailySet?.items) && p.dailySet.items.some(x => x && typeof x.aiCoach === 'string' && x.aiCoach.trim());
    const practiceItem = p => {
      const recs = use(files([...(p.mediaIds || []), ...(sameSong.get(p.id) || [])]));
      return '<div class="rt-item rt-line" data-kind="practice"><span class="rt-node" aria-hidden="true"></span><div class="rt-body"><button type="button" class="rt-main" data-practice="' + esc(p.id) + '">' + top2(p.voiceCheck ? '보이스 체크' : VZ.practiceTitle(p), p.practiceTimeSource === 'unconfirmed' ? '시간 미입력' : W.duration(VZ.practiceMinutes(p))) + sub(practiceSub(p)) + '</button>' +
        chips([...recs.map(m => mediaChip(m, '녹음' + (m.durationSeconds ? ' ' + VZ.clock(m.durationSeconds) : ''))), ...(coach(p) ? [chip('AI 코멘트', ' data-practice="' + esc(p.id) + '"')] : [])]) + '</div></div>';
    };
    // 오늘의 목표 of that day with no practice row of their own (a ticked goal's time is in its row, shown above): 계획.
    const goneGoals = new Set(VZ.db.deleted?.dailyGoals || []), seenGoal = new Set();
    const goals = (VZ.db.dailyGoals || []).filter(g => g && g.date === calDay && !goneGoals.has(g.id) && String(g.title || '').trim() && !shownPractices.some(p => p.id === 'goal:' + g.id))
      .filter(g => { const k = String(g.title).trim(); if (seenGoal.has(k)) return false; seenGoal.add(k); return true; });
    const goalItem = g => '<div class="rt-item rt-line is-plan" data-kind="goal"><span class="rt-node" aria-hidden="true"></span><div class="rt-body"><div class="rt-main">' + top2(g.title, g.completed === true ? '완료' : '') + sub('계획') + '</div></div></div>';
    const practiceMinutes = shownPractices.reduce((n, p) => n + (VZ.practiceMinutes(p) || 0), 0);
    const practiceHtml = shownPractices.map(practiceItem).join('') + goals.map(goalItem).join('');
    /* 따로 남긴 녹음 */
    const loose = use(looseRp.filter(m => !shownIds.has(m.id)));
    const looseHtml = loose.map(m => {
      const song = VZ.songTitle(m.songId), at = m.created ? new Date(m.created) : null;
      const line = song ? M.recordingTypeName(M.recordingCategory(m)) + ' · 연습 기록에 아직 안 묶임' : at && !isNaN(at) && VZ.ymd(at) === calDay ? String(at.getHours()).padStart(2, '0') + ':' + String(at.getMinutes()).padStart(2, '0') + '에 남김' : M.recordingTypeName?.(M.recordingCategory(m)) || '녹음';
      const extra = song ? [chip('연습에 묶기', ' data-rt-practice')] : M.songSearchEligible?.(m) ? [chip('곡 고르기', ' data-rt-song')] : [];
      return looseItem(m, 'loose', line, extra);
    }).join('');
    const recordings = wired.length;
    const sumLine = W.summary({lessons:activeLessons.length, stages:e.ps.length, voiceCheck:shownPractices.some(p => p.voiceCheck), practices:shownPractices.length, practiceMinutes, recordings});
    const body = section('lesson', '레슨', '', lessonHtml) + section('stage', '무대', '', stageHtml) + section('practice', '연습', practiceMinutes > 0 ? W.duration(practiceMinutes) : '', practiceHtml) + section('loose', '따로 남긴 녹음', loose.length ? String(loose.length) : '', looseHtml);
    dayHost.innerHTML = '<div class="vz-calendar-day-head rt-day-head"><h2>' + esc(W.dayTitle(calDay, thisYear)) + '</h2>' + (sumLine ? '<p class="rt-day-sum" data-day-summary>' + esc(sumLine) + '</p>' : '') + '</div>' +
      (body ? '<div class="rt-card" data-no-media-select>' + body + '</div>' : '<p class="rt-empty">이 날 기록이 없어요.</p>');
    const card = dayHost.querySelector('.rt-card');
    if (!card) return;
    VZ.wireMedia(card, wired);
    // The actions a loose recording had (its own ⋯ menu stays in the player): link it to a record, or pick its song.
    card.addEventListener('click', async ev => {
      const row = ev.target.closest('[data-media]'), m = row && wired.find(x => x.id === row.dataset.media);
      if (!m) return;
      if (ev.target.closest('[data-rt-practice]')) {
        const own = (VZ.db.practices || []).filter(p => p.date === calDay && p.songId === m.songId && p.practiceMode !== 'training' && !['unconfirmed', 'recording'].includes(p.practiceTimeSource) && VZ.practiceMinutes(p) > 0);
        VZ.practiceSheet({songId:m.songId, date:calDay, mediaIds:[m.id], practice:own.length === 1 ? own[0] : null});
      }
      if (ev.target.closest('[data-rt-lesson]')) { const l = VZ.db.lessons.find(x => x.id === ev.target.closest('[data-rt-lesson]').dataset.rtLesson); if (l) linkMediaSheet(l); }
      if (ev.target.closest('[data-rt-song]')) {
        const v = await VZ.pickRecordingSong?.([m]); if (v == null) return;
        try { await VZ.saveRecordingSong(m, v); M.invalidate?.(); VZ.toast('곡을 바꿨어요: 1개'); media = await M.list().catch(() => media); if (grid.isConnected) draw(); }
        catch (err) { VZ.toast('곡을 바꾸지 못했어요: ' + err.message, 'error'); }
      }
    });
  };
  const drawSummary = () => {
    summaryHost.hidden = !calSummaryOpen; chart?.setAttribute('aria-expanded', String(calSummaryOpen));
    if (!calSummaryOpen) { if (summaryHost._csTimer) { clearInterval(summaryHost._csTimer); summaryHost._csTimer = null; } summaryHost.replaceChildren(); return; }
    VZ.calendarSummary.render(summaryHost, {db:VZ.db, media, month:calMonth, dateOf:M.dateOf, titleOf:VZ.songTitle, esc, error:M.cloudError()});
  };
  const draw = () => { const map = byDay(); drawSummary(); drawGrid(map); drawDay(map); };
  const pick = key => { calPicked = true; calDay = key; calMonth = key.slice(0, 7); draw(); };
  grid.onclick = e => { const b = e.target.closest('[data-d]'); if (b) pick(b.dataset.d); };
  main.querySelectorAll('[data-mv]').forEach(b => b.onclick = () => {
    const step = Number(b.dataset.mv);
    if (calView === 'month') { const next = W.moveMonth(calMonth, step, VZ.today()); calPicked = true; calMonth = next.month; calDay = next.day; draw(); }
    else pick(W.moveWeek(calDay, step, VZ.today()));
  });
  main.querySelector('[data-today]').onclick = () => { calPicked = false; calDay = VZ.today(); calMonth = calDay.slice(0, 7); draw(); };
  main.querySelector('[data-cal-view]').onclick = () => { calView = calView === 'month' ? 'week' : 'month'; calMonth = calDay.slice(0, 7); draw(); };
  if (chart) chart.onclick = () => { calSummaryOpen = !calSummaryOpen; drawSummary(); };
  const add = top?.querySelector('[data-add]');
  if (add) add.onclick = () => VZ.menu({title:'기록 추가', anchor:add, body:'<div class="vz-choice-list"><button type="button" class="vz-choice" data-calendar-add="stage">나의 공연<i class="ph ph-caret-right"></i></button><button type="button" class="vz-choice" data-calendar-add="lesson">레슨 일정<i class="ph ph-caret-right"></i></button><button type="button" class="vz-choice" data-calendar-add="practice">연습 기록<i class="ph ph-caret-right"></i></button><button type="button" class="vz-choice" data-calendar-add="homework">숙제<i class="ph ph-caret-right"></i></button></div>',
    onMount:(sheet, close) => sheet.querySelectorAll('[data-calendar-add]').forEach(b => b.onclick = () => { close(); if (b.dataset.calendarAdd === 'stage') VZ.nav('#/performances'); if (b.dataset.calendarAdd === 'lesson') VZ.lessonSheet({date:calDay}); if (b.dataset.calendarAdd === 'practice') VZ.practiceSheet({date:calDay}); if (b.dataset.calendarAdd === 'homework') VZ.taskSheet(); })});
  // Horizontal swipe on the days: a week (or a month) back or forward.
  let sx = null; grid.addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, {passive:true});
  grid.addEventListener('touchend', e => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 60) main.querySelector('[data-mv="' + (dx < 0 ? 1 : -1) + '"]').click(); });
  draw();
  media = await M.list().catch(() => []); if (grid.isConnected) draw();
}});
})();
