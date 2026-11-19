/* 필기를 지적으로 가져오기 (악보 뷰어 더보기): the teacher's handwriting on the score (written here or imported with the
 * PDF from GoodNotes) and the 악보 표기 placed on it become 레슨 지적 (app/score-points.js) together, after review.
 * - The handwriting of this page or of every page is grouped into notes (app/score-ink-points-bulk-model.js).
 * - One question, as 텍스트로 변환 asks, before anything is sent; then each note's crop — drawn as 지적으로 draws it
 *   (cropHandwriting in app/score-ink.js) — goes to the same recognition (VzipR2.scoreVision 'handwriting'), two at
 *   a time, at most LIMIT per run; 멈추기 keeps what is finished. A result is kept in memory for this app session, so
 *   a second run sends only notes it has not read yet (strokes never change in place: their ids name them).
 * - 악보 표기 (숨표·반복·컷·시작점 and the account's own presets) are listed on their own, named after their preset, with
 *   the measures the 표시한 마디 list gives them. Nothing about them is sent anywhere. Unchecked by default.
 * - The review lists each note with its picture, its words (editable), the measures under it (as 지적으로 maps them;
 *   empty without the conversion), and a checkbox. Notes and marks that are already a point of the song (same words,
 *   same measures) are skipped and counted. 선택한 n개 지적으로 저장 adds the points in one change. The handwriting and
 *   the marks always stay on the score.
 *   window.VzipScoreInkBulk.attach(viewer) — called by app/score-ink.js with {el, menu, songId, score, signal, closed,
 *   current, outside, say, ready, settle, why, visionAsked, vision, rows(page?), page, pageAspect(n), crop(rows, aspect), measuresOn(n, box),
 *   marks(rows), hasMeasures}. */
(() => {
'use strict';
const VZ = window.VZ, B = window.VzipInkBulkModel, P = window.VzipScorePointsModel, Ink = window.VzipScoreInk;
if (!VZ || !B || !P || !Ink) return;
const esc = VZ.esc, T = B.T, IMAGE_MAX = 600000, CACHE_MAX = 400;
const TITLE = '필기를 지적으로 가져오기';
/** What recognition answered for a note, by score and stroke ids (this app session only). */
const cache = new Map();
const keyOf = (score, c) => score.id + ':' + c.ids.join(',');
const remember = (k, v) => { cache.delete(k); cache.set(k, v); while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value); };
const lessonsOf = songId => (VZ.db.lessons || []).filter(l => l && (VZ.lessonSongIds(l).includes(songId) || l.songFeedback?.[songId]) && l.status !== 'cancelled').sort((a, b) => VZ.lessonSort(b, a));

function attach(v) {
  if (!v?.menu || !VZ.scorePoints?.addMany) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'icon-btn'; b.dataset.inkBulkPoints = ''; b.setAttribute('aria-label', TITLE); b.title = TITLE;
  b.innerHTML = '<i class="ph ph-list-checks" aria-hidden="true"></i><span class="score-ink-menu-label">' + TITLE + '</span>';
  v.menu.append(b);
  let running = false;
  b.onclick = async () => { if (running) return; running = true; try { await begin(v); } catch (e) { v.say('지적으로 가져오지 못했어요: ' + e.message, true); VZ.toast('지적으로 가져오지 못했어요: ' + e.message, 'error'); } finally { running = false; } };
}

/** Which pages: this one or all of them. Resolves 'page' | 'all' | null. */
function chooseScope(v, here, pages, counts) {
  if (pages <= 1) return Promise.resolve('page');
  const text = c => c.notes || c.marks ? [c.notes ? '손글씨 ' + c.notes + '곳' : '', c.marks ? '표기 ' + c.marks + '개' : ''].filter(Boolean).join(' · ') : '가져올 게 없어요';
  return new Promise(resolve => {
    let picked = null;
    VZ.menu({title:TITLE, anchor:v.el.querySelector('[data-ink-more]'), body:'<div class="vz-choice-list">' +
      '<button type="button" class="vz-choice" data-bulk-scope="page"' + (counts.page.notes + counts.page.marks ? '' : ' disabled') + '><i class="ph ph-file" aria-hidden="true"></i> 이 페이지 (' + here + '쪽) · ' + esc(text(counts.page)) + '</button>' +
      '<button type="button" class="vz-choice" data-bulk-scope="all"><i class="ph ph-files" aria-hidden="true"></i> 모든 페이지 · ' + esc(text(counts.all)) + '</button></div>',
    onMount:(el, close) => el.querySelectorAll('[data-bulk-scope]').forEach(x => x.onclick = () => { picked = x.dataset.bulkScope; close(); }),
    onClose:() => resolve(picked)});
  });
}

async function begin(v) {
  // Right after the viewer opens (or the iPad turns) the page is still being drawn: wait for it, then say why if not.
  await v.settle?.(); if (v.closed()) return;
  if (!v.ready()) { const why = v.why?.() || '악보 준비나 저장이 끝난 뒤 다시 시도해 주세요.'; v.say(why, true); VZ.toast(why, 'error'); return; }
  v.current();
  const here = v.page(), all = v.rows(), aspects = new Map();
  for (const n of new Set(all.map(s => s.page))) { try { aspects.set(n, await v.pageAspect(n)); } catch {} if (v.closed()) return; }
  const notes = B.clusters(all, n => aspects.get(n));
  let marked = [];
  try { marked = B.marks(await v.marks(all)); } catch { marked = []; }
  if (v.closed()) return;
  const on = scope => x => scope === 'all' || x.page === here;
  const counts = {page:{notes:notes.filter(on('page')).length, marks:marked.filter(on('page')).length}, all:{notes:notes.length, marks:marked.length}};
  if (!counts.all.notes && !counts.all.marks) { v.say('지적으로 가져올 손글씨나 악보 표기를 찾지 못했어요.', true); VZ.toast('지적으로 가져올 손글씨나 악보 표기를 찾지 못했어요.'); return; }
  await v.outside(); if (v.closed()) return;
  const scope = await chooseScope(v, here, v.pages?.() || Math.max(1, ...aspects.keys()), counts);
  if (!scope || v.closed()) return;
  const chosen = notes.filter(on(scope)), marks = marked.filter(on(scope));
  for (const c of chosen) {
    const a = aspects.get(c.page);
    c.key = keyOf(v.score, c); c.bounds = Ink.bounds(c.rows, a);
    try { c.measures = B.measuresOf(await v.measuresOn(c.page, c.bounds)); } catch { c.measures = null; }
    if (v.closed()) return;
  }
  // Notes read in an earlier run come first only if their answer is gone; new ones are sent first, up to LIMIT.
  const fresh = chosen.filter(c => !cache.has(c.key)), known = chosen.filter(c => cache.has(c.key));
  const send = fresh.slice(0, T.LIMIT), later = fresh.length - send.length;
  // Whether recognition can be used is asked when the score opens; a quick press may come before the answer.
  if (send.length) { await Promise.race([v.visionAsked?.(), new Promise(r => setTimeout(r, 5000))]); if (v.closed()) return; }
  const canSend = v.vision() && navigator.onLine !== false;
  let consent = false;
  if (send.length && canSend) {
    consent = await VZ.confirm('선택 영역 인식', '손글씨 ' + send.length + '곳의 획만 OpenAI API로 보내 인식할까요? 결과는 확인 후 저장할 수 있어요.' +
      (later ? '\n한 번에 ' + T.LIMIT + '곳까지 보내요. 나머지 ' + later + '곳은 다시 가져오기를 누르면 이어서 보내요.' : ''), {ok:'인식하기'});
    if (v.closed()) return;
    if (!consent && !known.length && !marks.length) { v.say('인식을 취소했어요. 보낸 것도 저장한 것도 없어요.'); return; }
  }
  const why = !send.length ? '' : !canSend ? (navigator.onLine === false ? '인터넷에 연결되지 않아 손글씨 ' + send.length + '곳은 인식하지 못했어요.' : '손글씨 인식을 지금 쓸 수 없어요 (본인 계정으로 로그인해 있을 때만 써요). 손글씨 ' + send.length + '곳은 보내지 않았어요.')
    : !consent ? '손글씨 ' + send.length + '곳은 보내지 않았어요.' : '';
  review(v, {send:consent ? send : [], known, marks, later:consent ? later : 0, why, aspects});
}

function review(v, {send, known, marks, later, why, aspects}) {
  const songId = v.songId, lessons = lessonsOf(songId), latest = P.latestLesson(VZ.db.lessons, songId, VZ.today());
  const existing = () => P.points(VZ.db, songId);
  const notes = [...known, ...send].sort((p, q) => p.page - q.page || p.bounds.y - q.bounds.y || p.bounds.x - q.bounds.x || (p.ids[0] < q.ids[0] ? -1 : 1));
  const ctl = new AbortController(), stopAll = () => ctl.abort();
  v.signal?.addEventListener('abort', stopAll, {once:true});
  let running = send.length > 0, done = 0, stopped = false, failure = '', markSkipped = 0;
  const lessonOptions = '<option value="">선택 안 함</option>' + lessons.map(l => '<option value="' + esc(l.id) + '"' + (l.id === latest?.id ? ' selected' : '') + '>' + esc(VZ.dateLabel(l.date) + ' 레슨') + '</option>').join('');
  const markList = marks.filter(m => { const dup = B.duplicate(existing(), m.text, m.measures); if (dup) markSkipped++; return !dup; });
  const body = '<div class="vz-bulk" data-bulk>' +
    '<p class="vz-bulk-status" role="status" aria-live="polite" data-bulk-status></p>' +
    '<progress class="vz-bulk-progress" data-bulk-progress max="' + Math.max(1, send.length) + '" value="0"' + (send.length ? '' : ' hidden') + '></progress>' +
    '<button type="button" class="btn secondary block" data-bulk-stop' + (send.length ? '' : ' hidden') + '><i class="ph ph-stop" aria-hidden="true"></i>멈추기</button>' +
    '<label class="field"><span>어느 레슨에서 (모두 같은 레슨으로)</span><select data-bulk-lesson>' + lessonOptions + '</select></label>' +
    '<p class="vz-pts-hint">악보의 손글씨와 표기는 그대로 남아요. 틀린 글자나 마디는 고쳐서 저장해 주세요.</p>' +
    '<section class="vz-bulk-section" data-bulk-notes aria-label="손글씨"' + (notes.length ? '' : ' hidden') + '><h3>손글씨</h3><div class="vz-bulk-list" data-bulk-note-list></div></section>' +
    '<section class="vz-bulk-section" data-bulk-marks aria-label="악보 표기"' + (markList.length ? '' : ' hidden') + '><div class="vz-bulk-section-head"><h3>악보 표기</h3>' +
    '<label class="vz-bulk-all"><input type="checkbox" data-bulk-marks-all>모두 선택</label></div><p class="vz-pts-hint">AI로 보내지 않아요. 지적으로 넣을 표기만 골라 주세요.</p><div class="vz-bulk-list" data-bulk-mark-list></div></section>' +
    '<p class="archive-error" role="alert" data-bulk-error></p></div>';
  VZ.sheet({title:TITLE, label:TITLE, body, foot:'<button type="button" class="btn block" data-bulk-save disabled>선택한 0개 지적으로 저장</button>', confirmClose:false,
    onClose:() => { stopAll(); v.signal?.removeEventListener('abort', stopAll); },
    onMount:(el, close) => {
      el.classList.add('vz-bulk-sheet');
      const $ = s => el.querySelector(s), status = $('[data-bulk-status]'), save = el.querySelector('[data-bulk-save]'), error = $('[data-bulk-error]');
      const noteHost = $('[data-bulk-note-list]'), markHost = $('[data-bulk-mark-list]');
      const items = [];
      const count = () => items.filter(it => it.node.isConnected && it.node.querySelector('[data-bulk-check]').checked).length;
      const sync = () => {
        const n = count(), hidden = notes.filter(c => c.dup).length;
        save.textContent = '선택한 ' + n + '개 지적으로 저장'; save.disabled = running || !n;
        const parts = [];
        if (running) parts.push('손글씨 인식 중 ' + done + ' / ' + send.length);
        else {
          if (send.length && !stopped && !failure) parts.push('손글씨 ' + send.length + '곳을 인식했어요.');
          if (stopped) parts.push('멈췄어요. 인식이 끝난 ' + done + '곳만 보여요.');
        }
        if (failure) parts.push('인식하지 못했어요 (' + failure + '). 끝난 결과만 보여요.');
        if (why) parts.push(why);
        if (later) parts.push('나머지 ' + later + '곳은 다시 가져오기를 누르면 이어서 보내요.');
        if (hidden || markSkipped) parts.push([hidden ? '손글씨 ' + hidden + '곳' : '', markSkipped ? '표기 ' + markSkipped + '개' : ''].filter(Boolean).join(', ') + (markSkipped ? '는' : '은') + ' 이미 지적으로 있어 건너뛰었어요.');
        if (!running && !items.length) parts.push('저장할 지적이 없어요. 저장한 것도 없어요.');
        status.textContent = parts.join(' ');
        $('[data-bulk-progress]').value = done; $('[data-bulk-progress]').hidden = !running;
        $('[data-bulk-stop]').hidden = !running;
        const all = $('[data-bulk-marks-all]'), boxes = [...markHost.querySelectorAll('[data-bulk-check]')];
        all.checked = boxes.length > 0 && boxes.every(b => b.checked); all.indeterminate = !all.checked && boxes.some(b => b.checked);
      };
      /** A row of the review: picture or icon, words, measures, checkbox. */
      const row = (it, label) => {
        const m = it.measures, node = document.createElement('div');
        node.className = 'vz-bulk-item'; node.dataset.bulkItem = it.kind; if (it.flag) node.dataset.flag = it.flag;
        node.innerHTML = '<label class="vz-bulk-check"><input type="checkbox" data-bulk-check aria-label="' + esc(label + ' 지적으로 저장') + '"' + (it.checked ? ' checked' : '') + '></label>' +
          (it.image ? '<img class="vz-bulk-thumb" alt="' + esc(label) + '" src="' + esc(it.image) + '">' : '<span class="vz-bulk-icon" aria-hidden="true"><i class="ph ph-bookmark-simple"></i></span>') +
          '<div class="vz-bulk-main"><textarea data-bulk-text rows="2" maxlength="' + P.TEXT_MAX + '" aria-label="' + esc(label + ' 지적 내용') + '" placeholder="지적 내용을 적어 주세요">' + esc(it.text) + '</textarea>' +
          '<div class="vz-bulk-measures"><input type="text" data-bulk-from inputmode="numeric" maxlength="4" autocomplete="off" aria-label="' + esc(label + ' 시작 마디') + '" value="' + esc(m?.from ?? '') + '"><span>–</span>' +
          '<input type="text" data-bulk-to inputmode="numeric" maxlength="4" autocomplete="off" aria-label="' + esc(label + ' 끝 마디') + '" value="' + esc(m && m.to !== m.from ? m.to : '') + '" placeholder="끝"><span>마디 · ' + it.page + '쪽</span></div>' +
          (it.flag ? '<small class="vz-bulk-flag" data-bulk-flag>' + esc(it.flag) + '</small>' : '') + '<p class="vz-bulk-row-error" role="alert" data-bulk-row-error></p></div>';
        it.node = node; items.push(it);
        node.querySelector('[data-bulk-check]').onchange = sync;
        return node;
      };
      const slots = new Map(notes.map(c => { const s = document.createElement('div'); s.className = 'vz-bulk-slot'; noteHost.append(s); return [c, s]; }));
      /** A note whose answer is in: shown, or counted as skipped when it is a point already. */
      const show = c => {
        const r = c.result || {text:'', confidence:'low'}, text = B.clean(r.text).slice(0, P.TEXT_MAX);
        if (!c.error && B.duplicate(existing(), text, c.measures)) { c.dup = true; slots.get(c).remove(); return; }
        const words = B.looksLikeText(text);
        const flag = c.error ? c.error : !words ? '글자가 아니에요' : r.confidence === 'low' ? '인식이 불확실해요. 확인해 주세요.' : !c.measures ? '마디 번호를 적어 주세요' : '';
        const label = '손글씨 ' + (notes.indexOf(c) + 1);
        let image = ''; try { image = c.image || v.crop(c.rows, aspects.get(c.page)); } catch {}
        slots.get(c).replaceWith(row({kind:'note', page:c.page, image, text, measures:c.measures, flag, checked:!c.error && B.preselect({text, confidence:r.confidence})}, label));
      };
      markList.forEach((m, i) => markHost.append(row({kind:'mark', page:m.page, text:m.text, measures:m.measures, checked:false}, '표기 ' + (i + 1))));
      $('[data-bulk-marks-all]').onchange = e => { markHost.querySelectorAll('[data-bulk-check]').forEach(b => { b.checked = e.target.checked; }); sync(); };
      $('[data-bulk-stop]').onclick = () => { stopped = true; ctl.abort(); };
      for (const c of known) { c.result = cache.get(c.key); show(c); }
      save.onclick = () => {
        error.textContent = ''; el.querySelectorAll('[data-bulk-row-error]').forEach(p => { p.textContent = ''; });
        const lessonId = $('[data-bulk-lesson]').value || null, picked = items.filter(it => it.node.isConnected && it.node.querySelector('[data-bulk-check]').checked);
        const out = [], seen = new Set(), have = existing();
        let bad = null, dup = 0;
        for (const it of picked) {
          const f = it.node, raw = {songId, scoreId:v.score.id, lessonId, text:f.querySelector('[data-bulk-text]').value, measures:{from:f.querySelector('[data-bulk-from]').value, to:f.querySelector('[data-bulk-to]').value}};
          let row;
          try { row = P.point(raw, {uid:VZ.uid()}); } catch (e) { f.querySelector('[data-bulk-row-error]').textContent = e.message; bad = bad || f; continue; }
          const k = B.clean(row.text).toLowerCase() + '|' + row.measures.from + '|' + row.measures.to;
          if (seen.has(k) || B.duplicate(have, row.text, row.measures)) { dup++; continue; }
          seen.add(k); out.push(row);
        }
        if (bad) { error.textContent = '고칠 곳이 있어요. 표시한 줄을 확인해 주세요.'; bad.scrollIntoView({block:'nearest'}); return; }
        try { v.current(); } catch (e) { error.textContent = e.message; return; }
        if (!out.length) { error.textContent = '모두 이미 있는 지적이라 저장할 게 없어요.'; return; }
        if (!VZ.scorePoints.addMany(out)) { error.textContent = '저장하지 못했어요. 다시 시도해 주세요.'; return; }
        close();
        const message = '지적 ' + out.length + '개를 저장했어요.' + (dup ? ' 이미 있던 ' + dup + '개는 건너뛰었어요.' : '');
        VZ.toast(message); v.say(message + ' 악보의 필기는 그대로 있어요.');
      };
      sync();
      if (!send.length) return;
      B.pool(send, T.CONCURRENCY, async c => {
        if (ctl.signal.aborted) return;
        try {
          v.current();
          c.image = v.crop(c.rows, aspects.get(c.page));
          if (c.image.length > IMAGE_MAX) { c.error = '너무 커서 보내지 않았어요. 직접 적어 주세요.'; }
          else {
            const r = await window.VzipR2.scoreVision('handwriting', c.image, ctl.signal);
            if (ctl.signal.aborted) return;
            c.result = {text:B.clean(r?.text).slice(0, P.TEXT_MAX), confidence:['high', 'medium', 'low'].includes(r?.confidence) ? r.confidence : 'low'};
            remember(c.key, c.result);
          }
          done++; if (el.isConnected) show(c);
        } catch (e) {
          if (e?.name === 'AbortError' || ctl.signal.aborted) return;
          failure = String(e?.message || e || '오류'); ctl.abort();
        } finally { if (el.isConnected) sync(); }
      }, () => ctl.signal.aborted).finally(() => {
        running = false;
        for (const c of send) if (!c.result && !c.error) slots.get(c)?.remove();
        if (el.isConnected) { sync(); v.say(failure ? '손글씨를 인식하지 못했어요: ' + failure : '지적으로 넣을 것을 골라 주세요.', !!failure); }
      });
    }});
}
window.VzipScoreInkBulk = {attach};
})();
