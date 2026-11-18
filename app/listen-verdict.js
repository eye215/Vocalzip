/* 두 녹음 들어 보고 비교 — the listening sheet (model: app/listen-verdict-model.js; sections: app/segment-ab-model.js).
 * Pick two takes of one song (default: the earliest and the latest; any two of the song's recordings), optionally a
 * section of each (start/end typed per take, prefilled with the whole take — the same per-take sections as the 구간 A/B
 * panel, app/segment-ab-ui.js, which opens this sheet with its own choice), listen to A and B and flip between them at
 * the same relative position, then say which is better overall and, if wanted, on 소리 길 · 음정 · 호흡 · 소리 크기·힘 ·
 * 표현, with a memo and who judged (나 / 선생님, with the lesson's teacher name).
 * Blind (default): A and B are the two takes in random order and their dates are shown only after saving.
 * Saved only when 평가 저장 is pressed (VZ.change → comparisonReports, kind listen-verdict); editable and deletable.
 *   VZ.listenCompare.open({songId, a, b, judge, teacher, lessonId, verdictId, ranges})
 *   [data-listen-open] (data-song, data-a, data-b, data-judge, data-teacher, data-lesson) and [data-listen-edit="<id>"]
 *   anywhere in the app open it. VZ.listenEntry(song, items) — the 보컬 연구소 row; VZ.listenLesson(host, lesson, media)
 *   — a lesson's 선생님 평가 남기기. 'vzip:listen-verdicts' is sent after every save or deletion. */
(() => {
'use strict';
const V = window.VZ, M = V?.media, L = window.VzipListenVerdict, S = window.VzipSegmentAB;
if (!V || !M || !L || !S) return;
const e = V.esc;
const api = V.listenCompare = {random:() => Math.random()};
const changed = () => window.dispatchEvent(new CustomEvent('vzip:listen-verdicts'));
const dayOf = m => window.VzipGrowthDataset?.dateOf(m) ?? M.dateOf(m) ?? '';
const dotted = d => d ? d.replace(/-/g, '.') : '날짜 미상';
// m:ss, with tenths when a section was set to them (the 구간 A/B panel takes any second): never rounded away.
const clock = s => s == null ? '' : Number.isInteger(Number(s)) ? V.clock(s) : Math.floor(s / 60) + ':' + (s % 60).toFixed(1).padStart(4, '0');
/** "1:23", "83" or "83.5" → seconds; '' → null; anything else → NaN. */
function parseTime(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  const m = /^(\d{1,3}):([0-5]?\d(?:\.\d+)?)$/.exec(t);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return /^\d+(?:\.\d+)?$/.test(t) ? Number(t) : NaN;
}
/** A song's recordings as the 보컬 연구소 lists them (app/growth-dataset.js rule songList), oldest first. */
function songTakes(items, songId) {
  const rows = V.growthDataset ? V.growthDataset(items).bySong('songList').get(songId) || [] : items.filter(m => m.songId === songId).map(m => ({m, id:m.id}));
  return rows.map(r => ({m:r.m, id:r.m.id, date:dayOf(r.m), created:r.m.created})).sort(L.order);
}
const lastTeacher = () => [...(V.db.lessons || [])].filter(l => String(l.teacher || '').trim()).sort((a, b) => V.lessonSort(b, a))[0]?.teacher || '';
const takeName = t => dotted(t.date) + ' · ' + M.label(t.m);
const seg = (name, value, label, attrs = '') => '<label class="lc-seg-item"><input type="radio" name="' + name + '" value="' + value + '"' + attrs + '><span>' + label + '</span></label>';
const choices = (name, attrs = '') => seg(name, 'A', 'A가 나아요', attrs) + seg(name, 'same', '비슷해요', attrs) + seg(name, 'B', 'B가 나아요', attrs);

api.open = async ({songId = '', a = '', b = '', judge = 'me', teacher = '', lessonId = '', verdictId = '', ranges = {}} = {}) => {
  let items;
  try { items = await M.list(); } catch { items = M.cached(); }
  const saved = verdictId ? L.list(V.db).find(v => v.id === verdictId) : null;
  if (verdictId && !saved) { V.toast('평가를 찾을 수 없어요. 다른 기기에서 지웠을 수 있어요.', 'error'); return null; }
  const sid = saved?.songId || songId;
  const takes = songTakes(items, sid);
  if (!saved && takes.length < 2) { V.toast('같은 곡의 녹음이 두 개 이상 있어야 비교할 수 있어요.', 'error'); return null; }
  const pair = L.defaultPair(takes);
  const find = id => takes.find(t => t.id === id) || null;
  const st = {
    edit:!!saved, blind:saved ? false : true, swap:false, active:'A', players:{},
    x:saved ? find(saved.firstId) : find(a) || pair[0], y:saved ? find(saved.secondId) : find(b) || pair[1],
    ranges:{}
  };
  if (!saved && st.x?.id === st.y?.id) st.y = takes.find(t => t.id !== st.x.id);
  // A take of a saved verdict may be gone (deleted recording): its stored date still names it.
  const gone = (id, date) => ({m:null, id:id || '', date, created:0});
  if (saved) { st.x ||= gone(saved.firstId, saved.firstDate); st.y ||= gone(saved.secondId, saved.secondDate); }
  const rangeIn = (t, stored) => stored !== undefined ? stored : ranges?.[t?.id] || null;
  st.ranges.x = rangeIn(st.x, saved ? saved.firstRange : undefined);
  st.ranges.y = rangeIn(st.y, saved ? saved.secondRange : undefined);
  const shuffle = () => { st.swap = st.blind ? api.random() < .5 : false; st.active = 'A'; };
  shuffle();
  const side = k => (k === 'A') !== st.swap ? 'x' : 'y';        // which pick sits behind A / B
  const takeOf = k => st[side(k)], rangeOf = k => st.ranges[side(k)] || {start:0, end:null};
  const duration = t => Number(t?.m?.durationSeconds) > 0 ? Number(t.m.durationSeconds) : null;
  const aIsFirst = () => L.order(takeOf('A'), takeOf('B')) <= 0;
  const options = sel => takes.map(t => '<option value="' + e(t.id) + '"' + (t.id === sel?.id ? ' selected' : '') + '>' + e(takeName(t)) + '</option>').join('');
  const rangeFields = (key, label) => {
    const t = st[key], r = st.ranges[key], d = duration(t);
    return '<fieldset class="lc-range-row" data-lc-range="' + key + '"><legend>' + label + '</legend>' +
      '<label class="field"><span>시작</span><input type="text" inputmode="decimal" autocomplete="off" name="' + key + 'Start" value="' + e(clock(r?.start ?? 0)) + '" placeholder="0:00"' + (st.edit ? ' disabled' : '') + '></label>' +
      '<label class="field"><span>끝</span><input type="text" inputmode="decimal" autocomplete="off" name="' + key + 'End" value="' + e(r?.end != null ? clock(r.end) : d ? clock(d) : '') + '" placeholder="끝까지"' + (st.edit ? ' disabled' : '') + '></label></fieldset>';
  };
  const pickCard = () => '<section class="lc-card" data-lc-pick><h3>녹음 두 개 고르기</h3>' +
    (st.edit ? '<p class="lc-fixed" data-lc-fixed><span>' + e(st.x.m ? takeName(st.x) : dotted(st.x.date) + ' · 지워진 녹음') + '</span><span>' + e(st.y.m ? takeName(st.y) : dotted(st.y.date) + ' · 지워진 녹음') + '</span></p><p class="lc-help">평가한 두 녹음과 구간은 그대로 두고 평가만 고쳐요.</p>' :
      '<label class="field"><span>녹음 1</span><select name="take1" data-lc-take="x">' + options(st.x) + '</select></label>' +
      '<label class="field"><span>녹음 2</span><select name="take2" data-lc-take="y">' + options(st.y) + '</select></label>' +
      '<label class="lc-check"><input type="checkbox" name="blind" data-lc-blind' + (st.blind ? ' checked' : '') + '><span><strong>가리고 듣기</strong><small>A·B 순서를 섞고, 어느 녹음인지는 평가를 저장한 뒤에 알려 드려요</small></span></label>') +
    '<details class="lc-ranges"' + (st.ranges.x || st.ranges.y ? ' open' : '') + '><summary><span>들을 구간 정하기</span><small>처음에는 녹음 전체예요</small></summary>' +
      '<p class="lc-help">두 녹음에서 같은 가사·선율을 부른 부분을 직접 맞춰 주세요. 녹음마다 시작 시간이 다르면 초도 다르게 적어요. 분:초(1:20) 또는 초(80)로 적어요.</p>' +
      rangeFields('x', '녹음 1') + rangeFields('y', '녹음 2') + '<p class="lc-error" data-lc-range-error role="alert"></p></details></section>';
  const labelText = k => {
    const t = takeOf(k), r = rangeOf(k);
    const sub = st.blind ? '어느 녹음인지 가려 뒀어요' : t.m ? takeName(t) : dotted(t.date) + ' · 지워진 녹음';
    return sub + (!st.blind && (r.start > 0 || r.end != null) ? ' · ' + clock(r.start) + '–' + (r.end == null ? '끝' : clock(r.end)) : '');
  };
  const sideHead = k => '<div class="lc-side-head"><b class="lc-badge">' + k + '</b><span data-lc-label="' + k + '">' + e(labelText(k)) + '</span></div>';
  const listenCard = () => '<section class="lc-card" data-lc-listen><h3>번갈아 듣기</h3>' +
    ['A', 'B'].map(k => '<div class="lc-side" data-lc-side="' + k + '"' + (st.active === k ? ' data-active' : '') + '>' + sideHead(k) +
      (takeOf(k).m ? '<div class="lc-player" data-lc-player="' + k + '"></div>' : '<p class="lc-help">이 녹음은 지워져 다시 들을 수 없어요.</p>') + '</div>').join('') +
    (takeOf('A').m && takeOf('B').m ? '<button type="button" class="btn secondary block lc-flip" data-lc-flip><i class="ph ph-arrows-left-right" aria-hidden="true"></i><span data-lc-flip-label>같은 위치에서 ' + (st.active === 'A' ? 'B' : 'A') + ' 듣기</span></button>' +
      '<p class="lc-help">고른 구간 안의 같은 비율 위치로 옮겨 들어요. 구간 끝에 닿으면 멈춰요.</p>' : '') + '</section>';
  const tagRows = () => L.TAGS.map(([key, name, hint]) => '<fieldset class="lc-tag" data-lc-tag="' + key + '"><legend>' + e(name) + (hint ? ' <small>' + e(hint) + '</small>' : '') + '</legend><div class="lc-seg">' + choices('tag-' + key) + '</div></fieldset>').join('');
  const verdictCard = () => '<section class="lc-card" data-lc-verdict><h3>들어 보니 어때요</h3>' +
    '<fieldset class="lc-overall"><legend>전체</legend><div class="lc-seg">' + choices('overall', ' required') + '</div></fieldset>' +
    '<p class="lc-sub">자세히 · 고르지 않아도 돼요 (한 번 더 누르면 지워져요)</p>' + tagRows() +
    '<label class="field"><span>메모</span><textarea name="memo" maxlength="' + L.MEMO_MAX + '" rows="3" placeholder="들으며 느낀 점 (선택)">' + e(saved?.memo || '') + '</textarea></label>' +
    '<fieldset class="lc-judge"><legend>누가 들었나요</legend><div class="lc-seg lc-seg-two">' + seg('judge', 'me', '나') + seg('judge', 'teacher', '선생님') + '</div></fieldset>' +
    '<label class="field" data-lc-teacher-field><span>선생님 이름 (선택)</span><input type="text" name="teacher" maxlength="' + L.TEACHER_MAX + '" autocomplete="off" value="' + e(saved?.teacher || teacher || lastTeacher()) + '"></label>' +
    '<p class="lc-help">이름은 기록용이에요. 선생님 계정과 연결되지 않아요.</p>' +
    (saved ? '<button type="button" class="btn ghost block lc-delete" data-lc-delete><i class="ph ph-trash" aria-hidden="true"></i>이 평가 지우기</button>' : '') +
    '<button type="submit" class="btn block" data-lc-save>' + (saved ? '평가 고치기' : '평가 저장') + '</button></section>';

  const destroyPlayers = () => { for (const p of Object.values(st.players)) p?.destroy(); st.players = {}; };
  let sheetApi = null;
  const sheet = V.sheet({title:'두 녹음 들어 보고 비교', label:'두 녹음 들어 보고 비교',
    body:'<form class="lc" data-lc>' + pickCard() + '<div data-lc-listen-host>' + listenCard() + '</div>' + verdictCard() + '</form>',
    onClose:destroyPlayers,
    onMount(el, close) {
      const form = el.querySelector('[data-lc]');
      sheetApi = {el, close};
      // Saved choices are in recording order; on the sheet they sit on A / B.
      if (saved) {
        const set = (name, choice) => { const v = L.sideOf(choice, aIsFirst()); const input = v && form.querySelector('input[name="' + name + '"][value="' + v + '"]'); if (input) input.checked = true; };
        set('overall', saved.overall);
        for (const [key] of L.TAGS) set('tag-' + key, saved.tags?.[key]);
      }
      const judgeInput = form.querySelector('input[name="judge"][value="' + (saved?.judge || judge) + '"]');
      if (judgeInput) judgeInput.checked = true;
      const teacherField = form.querySelector('[data-lc-teacher-field]');
      const showTeacher = () => { teacherField.hidden = form.judge.value !== 'teacher'; teacherField.nextElementSibling.hidden = teacherField.hidden; };
      form.querySelectorAll('input[name="judge"]').forEach(i => i.addEventListener('change', showTeacher));
      showTeacher();
      // A tag can be cleared: pressing the chosen one again takes it back.
      const current = {};
      form.querySelectorAll('.lc-tag input[type=radio]').forEach(i => { if (i.checked) current[i.name] = i.value; });
      form.querySelectorAll('.lc-tag input[type=radio]').forEach(i => i.addEventListener('click', () => {
        if (current[i.name] === i.value) { i.checked = false; current[i.name] = ''; i.dispatchEvent(new Event('change', {bubbles:true})); }
        else current[i.name] = i.value;
      }));
      const clearVerdict = () => { form.querySelectorAll('.lc-overall input,.lc-tag input').forEach(i => { i.checked = false; }); for (const k of Object.keys(current)) current[k] = ''; form.dispatchEvent(new Event('change')); };
      mountPlayers(el);
      if (!st.edit) {
        form.querySelectorAll('[data-lc-take]').forEach(sel => sel.addEventListener('change', () => {
          const key = sel.dataset.lcTake, t = find(sel.value);
          if (!t) return;
          st[key] = t; st.ranges[key] = null;
          const box = form.querySelector('[data-lc-range="' + key + '"]');
          box.querySelector('input[name="' + key + 'Start"]').value = '0:00';
          box.querySelector('input[name="' + key + 'End"]').value = duration(t) ? clock(duration(t)) : '';
          // A and B change: a choice made for the old pair would now point at the wrong recording.
          shuffle(); clearVerdict(); redrawListen(el);
        }));
        form.querySelector('[data-lc-blind]').addEventListener('change', ev => { st.blind = ev.target.checked; shuffle(); clearVerdict(); redrawListen(el); });
        form.querySelectorAll('[data-lc-range] input').forEach(input => input.addEventListener('change', () => readRanges(form)));
      }
      form.querySelector('[data-lc-delete]')?.addEventListener('click', async () => {
        if (!await V.confirm('평가 지우기', '이 평가를 지울까요? 지운 평가는 되돌릴 수 없어요.', {ok:'지우기', danger:true})) return;
        const ok = V.change(db => { db.comparisonReports = (db.comparisonReports || []).filter(x => x.id !== saved.id); }, {silent:true});
        if (!ok) return;
        close(); changed(); V.toast('평가를 지웠어요.');
      });
      form.addEventListener('submit', ev => { ev.preventDefault(); save(form, close); });
    }});
  /** Read the typed sections; false (and the reason shown) when one is not a section of its take. */
  function readRanges(form) {
    const out = {}, error = form.querySelector('[data-lc-range-error]');
    for (const [key, label] of [['x', '녹음 1'], ['y', '녹음 2']]) {
      const start = parseTime(form.elements[key + 'Start'].value), end = parseTime(form.elements[key + 'End'].value), d = duration(st[key]);
      const sec = Number.isNaN(start) || Number.isNaN(end) ? null : S.section(start ?? 0, end, d);
      if (!sec) { error.textContent = label + '의 구간을 확인해 주세요. 끝이 시작보다 뒤이고 녹음 길이 안이어야 해요.'; form.elements[key + 'End'].setAttribute('aria-invalid', 'true'); return false; }
      form.elements[key + 'End'].removeAttribute('aria-invalid');
      out[key] = S.whole(sec, d) ? null : sec;
    }
    error.textContent = '';
    st.ranges.x = out.x; st.ranges.y = out.y;
    const host = sheetApi?.el.querySelector('[data-lc-listen]');
    if (host) for (const k of ['A', 'B']) { const label = host.querySelector('[data-lc-label="' + k + '"]'); if (label) label.textContent = labelText(k); }
    return true;
  }
  function redrawListen(el) {
    destroyPlayers();
    el.querySelector('[data-lc-listen-host]').innerHTML = listenCard();
    mountPlayers(el);
  }
  function setActive(el, k) {
    st.active = k;
    el.querySelectorAll('[data-lc-side]').forEach(s => s.toggleAttribute('data-active', s.dataset.lcSide === k));
    const label = el.querySelector('[data-lc-flip-label]');
    if (label) label.textContent = '같은 위치에서 ' + (k === 'A' ? 'B' : 'A') + ' 듣기';
  }
  function mountPlayers(el) {
    for (const k of ['A', 'B']) {
      const host = el.querySelector('[data-lc-player="' + k + '"]'), t = takeOf(k);
      if (!host || !t.m) continue;
      const p = st.players[k] = host.lcPlayer = M.player(host, t.m, {prefetch:true});
      const media = p.el;
      const bounds = () => { const r = rangeOf(k), d = Number.isFinite(media.duration) && media.duration > 0 ? media.duration : duration(t); return {start:r.start, end:r.end ?? d ?? Infinity}; };
      // Inside the chosen section: playing starts at its beginning when outside it, and stops at its end.
      media.addEventListener('play', () => { setActive(el, k); const b = bounds(); if (media.currentTime < b.start - .25 || media.currentTime >= b.end - .05) p.seek(b.start); });
      media.addEventListener('timeupdate', () => { const b = bounds(); if (!media.paused && media.currentTime >= b.end) { media.pause(); } });
      media.addEventListener('loadedmetadata', () => { const b = bounds(); if (media.currentTime < b.start) p.seek(b.start); }, {once:true});
      host.addEventListener('pointerdown', () => setActive(el, k));
    }
    el.querySelector('[data-lc-flip]')?.addEventListener('click', () => {
      const from = st.active, to = from === 'A' ? 'B' : 'A', pf = st.players[from], pt = st.players[to];
      if (!pf || !pt) return;
      const len = p => Number.isFinite(p.el.duration) && p.el.duration > 0 ? p.el.duration : duration(p.item);
      const at = S.mapPosition(pf.el.currentTime, rangeOf(from), rangeOf(to), {fromLength:len(pf), toLength:len(pt)});
      const playing = !pf.el.paused;
      pf.pause();
      pt.seek(at);
      setActive(el, to);
      if (playing) pt.play();
    });
  }
  function save(form, close) {
    if (!st.edit && !readRanges(form)) return;
    const side = name => form.querySelector('input[name="' + name + '"]:checked')?.value || '';
    const first = aIsFirst();
    try {
      const overall = L.choiceOf(side('overall'), first);
      const tags = Object.fromEntries(L.TAGS.map(([key]) => [key, L.choiceOf(side('tag-' + key), first)]).filter(([, v]) => v));
      const take = key => ({id:st[key].id || (key === 'x' ? '(gone-1)' : '(gone-2)'), date:st[key].date, created:st[key].created, range:st.ranges[key]});
      const made = L.make({id:saved?.id || 'listen:' + V.uid(), songId:sid, takes:[take('x'), take('y')], overall, tags, memo:form.memo.value,
        judge:side('judge') || 'me', teacher:form.teacher.value, lessonId:saved ? saved.lessonId : lessonId, blind:saved ? saved.blind : st.blind,
        created:saved?.created, judgedDate:saved?.judgedDate}, {today:V.today()});
      // A deleted take keeps its cleared id (data-merge.js unlinks deleted recordings).
      const record = saved ? {...made, firstId:saved.firstId, secondId:saved.secondId, firstDate:saved.firstDate, secondDate:saved.secondDate, firstRange:saved.firstRange, secondRange:saved.secondRange} : made;
      const ok = V.change(db => {
        db.comparisonReports ||= [];
        const at = db.comparisonReports.findIndex(x => x.id === record.id);
        if (at < 0) db.comparisonReports.push(record); else db.comparisonReports[at] = record;
      }, {silent:true});
      if (!ok) return;
      const reveal = !saved && st.blind ? {A:takeOf('A'), B:takeOf('B')} : null;
      close(); changed();
      V.toast(saved ? '평가를 고쳤어요.' : '평가를 저장했어요.');
      if (reveal) V.sheet({title:'어느 녹음이었는지 알려 드려요', variant:'alert',
        body:'<div class="lc-reveal" data-lc-reveal>' + ['A', 'B'].map(k => '<p><b class="lc-badge">' + k + '</b><span data-lc-reveal-side="' + k + '">' + e(takeName(reveal[k])) + '</span></p>').join('') +
          '<p class="lc-reveal-line">' + e(L.line(record)) + '</p></div>',
        foot:'<button type="button" class="btn block" data-close>확인</button>'});
    } catch (error) {
      V.toast(error.message || '평가를 저장하지 못했어요.', 'error');
    }
  }
  return sheet;
};

/* ---------- entries ---------- */
document.addEventListener('click', ev => {
  const open = ev.target.closest?.('[data-listen-open]'), edit = ev.target.closest?.('[data-listen-edit]');
  if (!open && !edit) return;
  ev.preventDefault();
  if (edit) { api.open({verdictId:edit.dataset.listenEdit}); return; }
  const d = open.dataset;
  api.open({songId:d.song || '', a:d.a || '', b:d.b || '', judge:d.judge || 'me', teacher:d.teacher || '', lessonId:d.lesson || ''});
});
/** 보컬 연구소 (app/vocal-lab.js): the row under 두 녹음 자세히 비교. */
V.listenEntry = (song, items) => {
  if (!song?.id || (items || []).length < 2) return '';
  const n = L.list(V.db, {songId:song.id}).length;
  return '<section class="vl-section"><button type="button" class="vl-report lc-lab-entry" data-listen-open data-song="' + e(song.id) + '"><strong>두 녹음 들어 보고 비교</strong>' +
    '<span>' + (n ? '남긴 평가 ' + n + '개' : '가리고 듣고 평가를 남겨요') + '</span><i class="ph ph-caret-right" aria-hidden="true"></i></button></section>';
};
/** A lesson's recordings: 선생님 평가 남기기 for each song with a pair (two lesson takes, or the earliest take and the
 * lesson take), and the verdicts already attached to this lesson. */
V.listenLesson = (host, lesson, media) => {
  if (!host || !lesson) return;
  let block = host.querySelector('[data-listen-lesson]');
  if (!block) { block = document.createElement('div'); block.className = 'lc-lesson'; block.dataset.listenLesson = ''; host.append(block); }
  const ids = (lesson.recordings || []).map(r => r.id), mine = ids.map(id => media.find(m => m.id === id)).filter(m => m?.songId && V.song(m.songId));
  const bySong = new Map();
  for (const m of mine) { const list = bySong.get(m.songId) || []; list.push(m); bySong.set(m.songId, list); }
  const buttons = [...bySong].map(([songId, recs]) => {
    const takes = songTakes(media, songId), lessonTakes = takes.filter(t => recs.some(m => m.id === t.id));
    let pair = null;
    if (lessonTakes.length >= 2) pair = [lessonTakes[0], lessonTakes.at(-1)];
    else { const other = takes.find(t => !recs.some(m => m.id === t.id)); if (other && lessonTakes[0]) pair = [other, lessonTakes[0]]; }
    if (!pair) return '';
    return '<button type="button" class="btn secondary block lc-lesson-open" data-listen-open data-song="' + e(songId) + '" data-a="' + e(pair[0].id) + '" data-b="' + e(pair[1].id) + '" data-judge="teacher" data-lesson="' + e(lesson.id) + '" data-teacher="' + e(lesson.teacher || '') + '">' +
      '<i class="ph ph-chalkboard-teacher" aria-hidden="true"></i><span>선생님 평가 남기기 · ' + e(V.songTitle(songId)) + '</span></button>';
  }).join('');
  const verdicts = L.list(V.db, {lessonId:lesson.id});
  block.innerHTML = (buttons || verdicts.length ? '<h3 class="lc-lesson-title">들어 보고 남긴 평가</h3>' : '') + buttons +
    (verdicts.length ? '<ul class="lc-lesson-list">' + verdicts.map(v => '<li data-lc-lesson-verdict="' + e(v.id) + '"><p>' + e(V.songTitle(v.songId) || '삭제된 곡') + ' · ' + e(L.line(v)) + '</p>' +
      (v.memo ? '<small>' + e(v.memo) + '</small>' : '') + '<button type="button" class="lc-chip" data-listen-edit="' + e(v.id) + '">고치기</button></li>').join('') + '</ul>' : '') +
    (buttons ? '<p class="lc-help">이 레슨의 녹음을 같은 곡의 다른 녹음과 들어 보고 선생님 평가를 남겨요.</p>' : '');
  block._listen = {lesson, media};
};
window.addEventListener('vzip:listen-verdicts', () => {
  document.querySelectorAll('[data-listen-lesson]').forEach(block => { const x = block._listen; if (x && block.isConnected) V.listenLesson(block.parentElement, V.db.lessons.find(l => l.id === x.lesson.id) || x.lesson, x.media); });
  // 보컬 연구소 row: its count.
  document.querySelectorAll('.lc-lab-entry').forEach(b => { const n = L.list(V.db, {songId:b.dataset.song}).length; const s = b.querySelector('span'); if (s) s.textContent = n ? '남긴 평가 ' + n + '개' : '가리고 듣고 평가를 남겨요'; });
});
})();
