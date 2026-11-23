/* 레슨 지적 체크: what the teacher pointed out, measure by measure (지적), and 부르면서 체크 — one tap per point while
 * singing: 지켰어요 / 놓쳤어요. Rows and rules: app/score-points-model.js (rows of the synced list scoreAnnotations).
 * - 곡 화면: a short card (how many points, the last run, 부르면서 체크) and 레슨 지적 (add · edit · 이제 됐어요 · delete).
 * - 레슨 화면: 마디별 지적으로 적기 under the feedback (the point is said to come from that lesson).
 * - 악보 뷰어 (app/score-sync.js calls VzipScorePoints.viewer): ⋯ › 부르면서 체크, and 이 마디에 지적 추가 in the
 *   press-and-hold menu of a measure box. With the MR matched to the score, while the MR plays (app/score-audio.js) a
 *   panel over the score shows the point a measure before it comes, then asks 지켰어요 / 놓쳤어요 once it is over.
 * - Without a matched MR (or from the song page) the points are one big list in measure order.
 * - 악보 표기 → 지적: 지적으로 on selected marks opens the form filled from them (app/score-ink.js), and a preset with
 *   부르면서 체크에 넣기 makes the point as the mark is placed (fromMark below, with 되돌리기 in the toast). Such a point
 *   keeps the mark's id (`fromMark`) and shows the mark's own shape beside its words; erasing the mark never removes
 *   the point — its row then says 표기가 지워졌어요.
 * A run is saved only with 저장 at the end. A take recorded in the viewer during the run is linked by its id
 * (vzip:score-take-saved from app/score-audio.js); practice time is never counted from a run.
 *   window.VzipScorePoints.viewer(ctx) → {menu(actions), add(measure), destroy()}
 *   VZ.scorePoints = {card(host, songId), lessonEntry(main, lesson), manage(songId), editor(songId, preset), start(songId), addMany(rows),
 *     fromMark(songId, {text, measures, fromMark, scoreId})} */
(() => {
'use strict';
const VZ = window.VZ, P = window.VzipScorePointsModel, Ink = window.VzipScoreInk;
if (!VZ || !P) return;
const esc = VZ.esc, RUNS = ['mr', 'mrrec', 'loop'];
const pointsOf = songId => P.points(VZ.db, songId);
const runsOf = songId => P.runs(VZ.db, songId);
const pointById = id => (VZ.db.scoreAnnotations || []).find(r => r?.id === id && P.isPoint(r)) || null;
const lessonsOf = songId => (VZ.db.lessons || []).filter(l => l && (VZ.lessonSongIds(l).includes(songId) || l.songFeedback?.[songId]) && l.status !== 'cancelled').sort((a, b) => VZ.lessonSort(b, a));
const lessonName = id => { const l = (VZ.db.lessons || []).find(x => x.id === id); return l ? VZ.dateLabel(l.date) + ' 레슨' : ''; };
const awake = on => { try { VZ.media?.keepAwake?.(on); } catch {} };
/** Puts a row in scoreAnnotations in place of the one with its id (core.js stamps updatedAt). */
const put = row => VZ.change(d => { if (!Array.isArray(d.scoreAnnotations)) d.scoreAnnotations = []; const list = d.scoreAnnotations, i = list.findIndex(r => r?.id === row.id); if (i >= 0) list[i] = row; else list.push(row); }, {silent:true});
/** Removes a row: core.js leaves its tombstone, so another device does not bring it back. */
const drop = id => VZ.change(d => { const list = Array.isArray(d.scoreAnnotations) ? d.scoreAnnotations : []; const i = list.findIndex(r => r?.id === id); if (i >= 0) list.splice(i, 1); }, {silent:true});
const announce = () => window.dispatchEvent(new CustomEvent('vzip:score-points'));

// ---------- 악보 표기에서 온 지적 ----------
/** A small picture of the mark a point was made from, drawn from its stroke(s) as they lie on the score (a text
 * symbol shows its letters); a plain tag once the mark is gone. '' for a point not made from a mark. */
function markIcon(p) {
  if (!p?.fromMark) return '';
  const all = VZ.db.scoreAnnotations || [], stroke = r => r && r.version === 1 && Array.isArray(r.points) && r.points.length;
  const s = all.find(r => r?.id === p.fromMark && stroke(r));
  const tag = '<span class="vz-pts-mark-icon is-plain" role="img" aria-label="악보 표기" data-pts-mark-icon><i class="ph ph-bookmark-simple" aria-hidden="true"></i></span>';
  if (!s || !Ink) return tag;
  // A stamped symbol (a drawing of several strokes) is all of them; a mark over several lines of music, its first piece.
  const parts = s.group !== undefined && s.measures === undefined ? all.filter(r => stroke(r) && r.scoreId === s.scoreId && r.page === s.page && r.group === s.group) : [s];
  const A = 1.414; // the page's height / width: an A4 page is close enough for a picture this small
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of parts) {
    const half = r.glyph ? (r.size || .04) * 500 : (r.width || .004) * 500;
    for (const q of r.points) { const x = q[0] * 1000, y = q[1] * A * 1000; x0 = Math.min(x0, x - half); x1 = Math.max(x1, x + half); y0 = Math.min(y0, y - half); y1 = Math.max(y1, y + half); }
  }
  const size = Math.max(x1 - x0, y1 - y0, 1), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, f = n => n.toFixed(1);
  const shapes = parts.map(r => {
    const color = /^#[0-9a-f]{6}$/i.test(r.color || '') ? r.color : '#7a32f5', alpha = Math.max(.5, Number(Ink.opacity?.(r)) || 1);
    if (r.glyph) return '<text x="' + f(r.points[0][0] * 1000) + '" y="' + f(r.points[0][1] * A * 1000) + '" font-size="' + f((r.size || .04) * 1000) + '" text-anchor="middle" dominant-baseline="central" font-weight="700" fill="' + color + '" fill-opacity="' + alpha + '">' + esc(r.glyph) + '</text>';
    return '<path d="' + Ink.path(r, A) + '" fill="none" stroke="' + color + '" stroke-opacity="' + alpha + '" stroke-width="' + f(Math.max((r.width || .004) * 1000, size * .09)) + '" stroke-linecap="round" stroke-linejoin="round"/>';
  }).join('');
  const box = size * 1.15;
  return '<span class="vz-pts-mark-icon" role="img" aria-label="악보 표기" data-pts-mark-icon><svg viewBox="' + [cx - box / 2, cy - box / 2, box, box].map(f).join(' ') + '" aria-hidden="true">' + shapes + '</svg></span>';
}
/** The point's words with the picture of its mark before them (points made from a mark). */
const withMark = (p, text = p.text) => p.fromMark ? markIcon(p) + '<span>' + esc(text) + '</span>' : esc(text);
/** A toast with 되돌리기 (VZ.toast has no button): it goes after UNDO_MS or once 되돌리기 is pressed. */
const UNDO_MS = 6000;
function undoToast(message, undo) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast vz-pts-undo-toast'; el.setAttribute('role', 'status'); el.dataset.ptsUndoToast = '';
  el.innerHTML = '<span>' + esc(message) + '</span><button type="button" data-pts-undo>되돌리기</button>';
  (document.fullscreenElement || document.body).append(el);
  const timer = setTimeout(() => el.remove(), UNDO_MS);
  el.querySelector('[data-pts-undo]').onclick = () => { clearTimeout(timer); el.remove(); undo(); };
}
/** 부르면서 체크에 넣기 (app/score-ink.js, as a mark of such a preset is placed): the point {text, measures} made from
 * the mark `fromMark` at once, said to come from the song's latest lesson — unless the song has that point already
 * (P.duplicate). 되돌리기 in the toast removes the new row (its tombstone keeps it removed on other devices); the mark
 * stays either way. → 'added' | 'duplicate' | '' (not saved). */
function fromMark(songId, {text, measures, fromMark: mark, scoreId} = {}) {
  let row;
  try {
    if (P.duplicate(pointsOf(songId), text, measures)) return 'duplicate';
    const latest = P.latestLesson(VZ.db.lessons, songId, VZ.today());
    row = P.point({songId, text, measures, fromMark:mark, ...(scoreId ? {scoreId} : {}), ...(latest ? {lessonId:latest.id} : {})}, {uid:VZ.uid()});
  } catch (e) { VZ.toast('지적으로 넣지 못했어요: ' + e.message, 'error'); return ''; }
  if (!addMany([row])) return '';
  undoToast('지적으로 넣었어요', () => { if (pointById(row.id) && drop(row.id)) { announce(); VZ.toast('지적에서 뺐어요. 악보의 표기는 그대로예요.'); } });
  return 'added';
}
/** New points made together (필기를 지적으로 가져오기, app/score-ink-points-bulk.js): one change, one announce. rows: P.point(). */
const addMany = list => { if (!list.length || !list.every(P.isPoint)) return false; const ok = VZ.change(d => { if (!Array.isArray(d.scoreAnnotations)) d.scoreAnnotations = []; for (const row of list) { const i = d.scoreAnnotations.findIndex(r => r?.id === row.id); if (i >= 0) d.scoreAnnotations[i] = row; else d.scoreAnnotations.push(row); } }, {silent:true}); if (ok) announce(); return ok; };

/** ✓ / ✗ of the last runs, oldest first. */
function dots(recent) {
  if (!recent.length) return '';
  return '<span class="vz-pts-dots" role="img" aria-label="최근 체크: ' + recent.map(v => v === 'kept' ? '지킴' : '놓침').join(', ') + '">' +
    recent.map(v => '<i class="vz-pts-dot is-' + v + ' ph ph-' + (v === 'kept' ? 'check' : 'x') + '" aria-hidden="true"></i>').join('') + '</span>';
}
const meta = p => [p.lessonId ? lessonName(p.lessonId) : '', P.tagName(p.tag)].filter(Boolean).join(' · ');

// ---------- 지적 추가 · 수정 ----------
/** iPad: Apple Pencil handwriting (Scribble) turns into letters in any text field — the system's own, nothing sent. */
const iPad = () => /iPad/.test(navigator.userAgent || '') || navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
/** preset: {point} to edit, or {from, to, lessonId, scoreId, feedback, text, note, ink, fromMark} for a new one. note: a line on
 * top (what the handwriting recognition did); ink: the point comes from handwriting selected on the score — the form
 * asks whether to keep it (the default) or remove it after 저장, and onDone(row, {removeInk}) does that. fromMark: the
 * id of the 악보 표기 the point is made from (kept on the row). */
function editor(songId, preset = {}, onDone) {
  const old = preset.point ? pointById(preset.point.id) || preset.point : null;
  const lessons = lessonsOf(songId), latest = P.latestLesson(VZ.db.lessons, songId, VZ.today());
  const lessonId = old ? old.lessonId || '' : preset.lessonId !== undefined ? preset.lessonId : latest?.id || '';
  const from = old ? old.measures.from : preset.from || '', to = old ? (old.measures.to !== old.measures.from ? old.measures.to : '') : preset.to && preset.to !== preset.from ? preset.to : '';
  const tag = old?.tag || '';
  const lessonOptions = '<option value="">선택 안 함</option>' + lessons.map(l => '<option value="' + esc(l.id) + '"' + (l.id === lessonId ? ' selected' : '') + '>' + esc(VZ.dateLabel(l.date) + ' 레슨') + '</option>').join('') +
    (lessonId && !lessons.some(l => l.id === lessonId) ? '<option value="' + esc(lessonId) + '" selected>' + esc(lessonName(lessonId) || '지난 레슨') + '</option>' : '');
  const body = '<form id="vz-pts-form" class="vz-pts-form" novalidate>' +
    (preset.note ? '<p class="vz-pts-note" role="status" data-pts-note>' + esc(preset.note) + '</p>' : '') +
    (preset.feedback ? '<div class="vz-pts-feedback"><span>레슨 피드백</span><p>' + esc(preset.feedback) + '</p></div>' : '') +
    '<div class="two"><label class="field"><span>시작 마디</span><input type="text" name="from" inputmode="numeric" autocomplete="off" maxlength="4" required value="' + esc(from) + '"' + (from ? '' : ' autofocus') + '></label>' +
    '<label class="field"><span>끝 마디</span><input type="text" name="to" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="한 마디면 비워 두기" value="' + esc(to) + '"></label></div>' +
    '<p class="vz-pts-hint">악보에 적힌 마디 번호예요.</p>' +
    '<label class="field"><span>지적</span><textarea name="text" rows="2" maxlength="' + P.TEXT_MAX + '" required placeholder="예: 여기서 숨 미리, 턱 내리기"' + (from ? ' autofocus' : '') + '>' + esc(old?.text || preset.text || '') + '</textarea></label>' +
    (iPad() ? '<p class="vz-pts-hint" data-pts-scribble>애플펜슬로 이 칸에 바로 써도 글자로 바뀌어요 (iPad 설정 › Apple Pencil › 손글씨 입력)</p>' : '') +
    '<label class="field"><span>어느 레슨에서</span><select name="lessonId">' + lessonOptions + '</select></label>' +
    '<fieldset class="field vz-pts-tags"><legend>분류 (골라도 되고 안 골라도 돼요)</legend><div class="vz-pts-tag-row">' +
    [['', '없음'], ...P.TAGS].map(([k, name]) => '<label class="vz-pts-tag"><input type="radio" name="tag" value="' + k + '"' + (k === tag ? ' checked' : '') + '><span>' + esc(name) + '</span></label>').join('') + '</div></fieldset>' +
    (preset.ink && !old ? '<fieldset class="field vz-pts-tags" data-pts-ink><legend>악보의 손글씨</legend><div class="vz-pts-tag-row">' +
      '<label class="vz-pts-tag"><input type="radio" name="ink" value="keep" checked><span>그대로 두기</span></label><label class="vz-pts-tag"><input type="radio" name="ink" value="remove"><span>저장하고 지우기</span></label></div></fieldset>' : '') +
    '<p class="archive-error" role="alert" data-pts-error></p>' +
    (old ? '<div class="vz-pts-edit-actions">' + (old.retired
      ? '<button type="button" class="btn secondary block" data-pts-unretire><i class="ph ph-arrow-counter-clockwise" aria-hidden="true"></i>다시 체크하기</button>'
      : '<button type="button" class="btn secondary block" data-pts-retire><i class="ph ph-check-circle" aria-hidden="true"></i>이제 됐어요 (기록은 남겨요)</button>') +
      '<button type="button" class="btn ghost block vz-pts-danger" data-pts-delete><i class="ph ph-trash" aria-hidden="true"></i>지적 삭제</button></div>' : '') +
    '</form>';
  VZ.sheet({title:old ? '지적 수정' : '지적 추가', body, foot:'<button type="submit" form="vz-pts-form" class="btn block">저장</button>', onMount:(el, close) => {
    el.classList.add('vz-pts-editor');
    const form = el.querySelector('form'), error = el.querySelector('[data-pts-error]');
    const done = (message, ...after) => { close(); VZ.toast(message); announce(); onDone?.(...after); };
    form.onsubmit = e => {
      e.preventDefault();
      const raw = {songId, measures:{from:form.elements.from.value, to:form.elements.to.value}, text:form.elements.text.value, lessonId:form.elements.lessonId.value || null, tag:form.querySelector('[name=tag]:checked')?.value || null};
      let row;
      try {
        if (old) { const cur = pointById(old.id); if (!cur) throw Error('다른 기기에서 지운 지적이에요.'); row = P.edit(cur, raw); }
        else row = P.point({...raw, ...(preset.scoreId ? {scoreId:preset.scoreId} : {}), ...(preset.fromMark ? {fromMark:preset.fromMark} : {})}, {uid:VZ.uid()});
      } catch (err) { error.textContent = err.message; return; }
      if (put(row)) done(old ? '지적을 고쳤어요.' : '지적을 추가했어요.', row, {removeInk:form.querySelector('[name=ink]:checked')?.value === 'remove'});
    };
    const change = (patch, message) => { const cur = pointById(old.id); if (!cur) { error.textContent = '다른 기기에서 지운 지적이에요.'; return; } let row; try { row = P.edit(cur, patch); } catch (err) { error.textContent = err.message; return; } if (put(row)) done(message); };
    el.querySelector('[data-pts-retire]')?.addEventListener('click', () => change({retired:Date.now()}, '이제 체크에서 빼 둘게요. 기록은 남아 있어요.'));
    el.querySelector('[data-pts-unretire]')?.addEventListener('click', () => change({retired:null, stay:Date.now()}, '다시 체크할게요.'));
    el.querySelector('[data-pts-delete]')?.addEventListener('click', async () => {
      if (!await VZ.confirm('지적 삭제', '"' + old.text + '" 지적을 삭제할까요? 지난 체크에 남은 이 지적의 결과도 더 보이지 않고, 되돌릴 수 없어요.', {ok:'삭제', danger:true})) return;
      if (drop(old.id)) done('지적을 삭제했어요.');
    });
  }});
}

// ---------- 레슨 지적 (목록) ----------
function row(p, runs) {
  const rec = P.record(runs, p.id), suggest = P.suggestRetire(runs, p);
  return '<div class="vz-pts-row" data-pts-row="' + esc(p.id) + '"' + (p.retired ? ' data-retired' : '') + '>' +
    '<button type="button" class="vz-pts-row-main" data-pts-edit aria-label="' + esc(P.label(p.measures) + ' ' + p.text + ' 수정') + '"><span class="vz-pts-where">' + esc(P.label(p.measures)) + '</span>' +
    '<span class="vz-pts-what"><strong' + (p.fromMark ? ' class="has-mark"' : '') + '>' + withMark(p) + '</strong>' + (meta(p) ? '<small>' + esc(meta(p)) + '</small>' : '') +
    (P.markGone(VZ.db.scoreAnnotations, p) ? '<small class="vz-pts-mark-gone" data-pts-mark-gone><i class="ph ph-eraser" aria-hidden="true"></i>표기가 지워졌어요</small>' : '') + '</span><i class="ph ph-caret-right" aria-hidden="true"></i></button>' +
    '<div class="vz-pts-row-foot">' + dots(rec.recent) + '<span class="vz-pts-record">' + esc(P.recordText(rec)) + '</span></div>' +
    (suggest ? '<div class="vz-pts-suggest" data-pts-suggest><span>이제 몸에 붙었어요 · 그만 볼까요?</span><span class="vz-pts-suggest-actions"><button type="button" data-pts-retire>그만 볼래요</button><button type="button" data-pts-stay>계속 볼래요</button></span></div>' : '') +
    (p.retired ? '<div class="vz-pts-row-foot"><button type="button" class="vz-pts-small" data-pts-unretire>다시 체크하기</button></div>' : '') + '</div>';
}
/** Retire / keep a point from a list row (no sheet). */
function quick(id, patch, message) {
  const cur = pointById(id); if (!cur) return false;
  let next; try { next = P.edit(cur, patch); } catch (e) { VZ.toast(e.message, 'error'); return false; }
  if (!put(next)) return false;
  VZ.toast(message); announce(); return true;
}
function manage(songId) {
  VZ.sheet({title:'레슨 지적', label:'레슨 지적', body:'<div class="vz-pts-manage" data-pts-manage></div>', foot:'<button type="button" class="btn block" data-pts-run><i class="ph ph-play" aria-hidden="true"></i>부르면서 체크</button>', onMount:(el, close) => {
    el.classList.add('vz-pts-sheet-page');
    const host = el.querySelector('[data-pts-manage]');
    const paint = () => {
      if (!host.isConnected) { window.removeEventListener('vzip:score-points', paint); window.removeEventListener('vzip:data-changed', paint); return; }
      const list = pointsOf(songId), runs = runsOf(songId), on = P.active(list), off = list.filter(p => p.retired);
      host.innerHTML = '<p class="vz-pts-hint">레슨에서 들은 지적을 마디에 붙여 두면, 부를 때마다 지켰는지 체크할 수 있어요.</p>' +
        '<button type="button" class="btn secondary block" data-pts-add><i class="ph ph-plus" aria-hidden="true"></i>지적 추가</button>' +
        (on.length ? '<div class="vz-pts-rows">' + on.map(p => row(p, runs)).join('') + '</div>' : '<p class="vz-pts-empty" data-pts-empty>체크할 지적이 없어요.</p>') +
        (off.length ? '<details class="vz-pts-retired"><summary>그만 보는 지적 ' + off.length + '</summary><div class="vz-pts-rows">' + off.map(p => row(p, runs)).join('') + '</div></details>' : '');
      el.querySelector('[data-pts-run]').disabled = !on.length;
      host.querySelector('[data-pts-add]').onclick = () => editor(songId, {}, paint);
      host.querySelectorAll('[data-pts-row]').forEach(r => {
        const id = r.dataset.ptsRow;
        r.querySelector('[data-pts-edit]').onclick = () => { const p = pointById(id); if (p) editor(songId, {point:p}, paint); };
        r.querySelector('[data-pts-retire]')?.addEventListener('click', () => { if (quick(id, {retired:Date.now()}, '이제 체크에서 빼 둘게요. 기록은 남아 있어요.')) paint(); });
        r.querySelector('[data-pts-stay]')?.addEventListener('click', () => { if (quick(id, {stay:Date.now()}, '계속 체크할게요.')) paint(); });
        r.querySelector('[data-pts-unretire]')?.addEventListener('click', () => { if (quick(id, {retired:null, stay:Date.now()}, '다시 체크할게요.')) paint(); });
      });
    };
    window.addEventListener('vzip:score-points', paint); window.addEventListener('vzip:data-changed', paint);
    el.querySelector('[data-pts-run]').onclick = () => { close(); start(songId); };
    paint();
  }});
}

// ---------- 곡 화면 카드 ----------
/** A score of the song matched with one of its MR files (app/score-sync.js): 부르면서 체크 can then follow the MR. */
function synced(songId) {
  const s = VZ.song(songId), files = (s?.mrTracks || []).filter(t => t && !t.deleted && t.kind !== 'youtube' && t.r2Key);
  return (s?.scores || []).find(x => x && !x.deleted && x.mrSync && Object.keys(x.mrSync).some(id => files.some(t => t.id === id))) || null;
}
function card(host, songId) {
  if (!host) return;
  const paint = () => {
    if (!host.isConnected || !VZ.song(songId)) { window.removeEventListener('vzip:data-changed', paint); window.removeEventListener('vzip:score-points', paint); return; }
    const on = P.active(pointsOf(songId)), runs = runsOf(songId), last = runs.at(-1);
    const sub = on.length ? '지적 ' + on.length + '개' + (last ? ' · 마지막 체크 ' + VZ.dateLabel(last.date) : ' · 아직 체크 전') : '마디에 적어 두고 부를 때 체크해요';
    host.innerHTML = '<section class="vz-pts-card" data-pts-card aria-label="레슨 지적 체크">' +
      '<button type="button" class="vz-pts-card-head" data-pts-manage aria-label="레슨 지적 체크 · ' + esc(sub) + '"><span class="vz-pts-card-icon"><i class="ph ph-chat-circle-text" aria-hidden="true"></i></span>' +
      '<span class="vz-pts-card-main"><strong>레슨 지적 체크</strong><small data-pts-card-sub>' + esc(sub) + '</small></span><i class="ph ph-caret-right" aria-hidden="true"></i></button>' +
      (on.length ? '<button type="button" class="vz-pts-start" data-pts-start><i class="ph-fill ph-play" aria-hidden="true"></i>부르면서 체크</button>'
        : '<button type="button" class="vz-pts-start is-soft" data-pts-add><i class="ph ph-plus" aria-hidden="true"></i>지적 추가</button>') + '</section>';
    host.querySelector('[data-pts-manage]').onclick = () => manage(songId);
    host.querySelector('[data-pts-start]')?.addEventListener('click', () => begin(songId));
    host.querySelector('[data-pts-add]')?.addEventListener('click', () => editor(songId));
  };
  if (host.__ptsPaint) { window.removeEventListener('vzip:data-changed', host.__ptsPaint); window.removeEventListener('vzip:score-points', host.__ptsPaint); }
  host.__ptsPaint = paint;
  window.addEventListener('vzip:data-changed', paint); window.addEventListener('vzip:score-points', paint);
  paint();
}
/** 부르면서 체크 from the song page: with a score matched to the MR, ask whether to sing along the score. */
function begin(songId) {
  const score = synced(songId);
  if (!score || !VZ.openScoreInk) { start(songId); return; }
  VZ.menu({title:'부르면서 체크', body:'<div class="vz-choice-list"><button type="button" class="vz-choice" data-pts-with-score><i class="ph ph-music-notes" aria-hidden="true"></i> 악보와 MR로 · 재생하면 마디에 맞춰 알려줘요</button>' +
    '<button type="button" class="vz-choice" data-pts-with-list><i class="ph ph-list-checks" aria-hidden="true"></i> 목록으로 체크</button></div>', onMount:(el, close) => {
    el.querySelector('[data-pts-with-list]').onclick = () => { close(); start(songId); };
    el.querySelector('[data-pts-with-score]').onclick = () => { close(); pending = {songId, at:Date.now()}; VZ.openScoreInk(songId, score.id); };
  }});
}

// ---------- 레슨 화면 ----------
function lessonEntry(main, lesson) {
  if (!main || !lesson || lesson.status === 'cancelled') return;
  const songs = VZ.lessonSongIds(lesson).filter(id => VZ.song(id)), anchor = main.querySelector('a[href^="#/lesson-ai/"]');
  if (!songs.length || !anchor) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'btn secondary block vz-pts-lesson'; b.dataset.ptsFromLesson = '';
  b.innerHTML = '<i class="ph ph-chat-circle-text" aria-hidden="true"></i>마디별 지적으로 적기';
  anchor.before(b);
  const open = id => editor(id, {lessonId:lesson.id, feedback:String(lesson.songFeedback?.[id] || lesson.feedback || '').trim()});
  b.onclick = () => {
    if (songs.length === 1) { open(songs[0]); return; }
    VZ.menu({title:'어느 곡의 지적인가요?', body:'<div class="vz-choice-list">' + songs.map(id => '<button type="button" class="vz-choice" data-pts-song="' + esc(id) + '">' + esc(VZ.songTitle(id) || '곡') + '</button>').join('') + '</div>', onMount:(el, close) => {
      el.querySelectorAll('[data-pts-song]').forEach(x => x.onclick = () => { close(); open(x.dataset.ptsSong); });
    }});
  };
}

// ---------- 부르면서 체크 ----------
let live = null, viewerCtx = null, pending = null, lastSaved = null;
const marked = () => Object.keys(live.results).filter(id => live.list.some(p => p.id === id)).length;
const playing = () => { const m = live?.ctx?.audio?.()?.mode?.(); return RUNS.includes(m); };
/** The windows along the MR, made again when the sync's model changes; null without a matched MR. */
function line() {
  let t = null; try { t = live.ctx?.timing?.() || null; } catch {}
  if (!t?.model) return null;
  if (t.model !== live.lineFor) { live.lineFor = t.model; live.line = P.timeline(live.list, t.seq, t.model); }
  return live.line;
}
function start(songId, {ctx = null, wait = false} = {}) {
  if (live) { if (live.songId === songId) { show(); return; } VZ.toast('지금 하는 체크를 먼저 끝내 주세요.', 'error'); return; }
  const list = P.active(pointsOf(songId));
  if (!list.length) { VZ.toast('먼저 체크할 지적을 추가해 주세요.'); editor(songId); return; }
  const c = ctx || (viewerCtx?.songId === songId ? viewerCtx : null);
  live = {songId, scoreId:c?.scoreId || '', list, results:{}, started:Date.now(), recorded:false, recordingId:'', timed:false, ctx:null, view:'list', t:NaN, sig:'', line:null, lineFor:null, el:null, offs:[]};
  awake(true);
  const el = live.el = document.createElement('div');
  el.className = 'vz-pts-run'; el.dataset.ptsRun = '';
  el.addEventListener('keydown', e => { if (e.key === 'Escape' && live?.view === 'list') { e.preventDefault(); finish(); } });
  // Above the sheets open now (the score viewer), level with them: a question asked later (VZ.confirm) comes on top.
  el.style.zIndex = String(Math.max(60, ...[...document.querySelectorAll('.sheet-back')].map(x => Number(getComputedStyle(x).zIndex) || 0)));
  (document.fullscreenElement || document.body).append(el);
  if (c) bind(c, wait); else show();
}
/** Follows the viewer's play bar. The panel over the score when the MR is matched (or still loading, `wait`), else the list. */
function bind(c, wait = false) {
  if (!live || live.ctx === c) return;
  live.ctx = c; live.view = wait || line() ? 'panel' : 'list';
  const a = c.audio?.();
  if (a?.onTick) live.offs.push(a.onTick(time => { if (!live) return; live.t = time; if (live.view === 'panel') panel(); }));
  if (a?.onChange) live.offs.push(a.onChange(mode => { if (!live) return; if (mode === 'rec' || mode === 'mrrec') live.recorded = true; if (live.view === 'panel') panel(); }));
  if (['rec', 'mrrec'].includes(a?.mode?.())) live.recorded = true;
  // The conversion and the sync may arrive after the run started: looked at again every second.
  const poll = setInterval(() => { if (live?.view === 'panel') panel(); }, 1000);
  live.offs.push(() => clearInterval(poll));
  Promise.resolve(c.outside?.()).catch(() => {}).then(show);
}
function unbind() {
  if (!live) return;
  for (const off of live.offs.splice(0)) try { off?.(); } catch {}
  live.ctx = null; live.line = null; live.lineFor = null;
  if (live.view === 'panel') { live.view = 'list'; show(); }
}
function show() {
  if (!live) return;
  live.sig = '';
  if (live.view === 'panel') panel(); else if (live.view === 'summary') summary(); else list();
}
function setResult(id, v) {
  if (!live) return;
  if (live.results[id] === v) delete live.results[id]; else live.results[id] = v;
  if (live.view === 'panel' && playing()) live.timed = true;
}
const markButtons = (id, label) => '<div class="vz-pts-marks" role="group" aria-label="' + esc(label) + ' 결과">' +
  '<button type="button" class="vz-pts-mark is-kept" data-pts-mark="kept" data-point="' + esc(id) + '" aria-pressed="' + (live.results[id] === 'kept') + '"><i class="ph-fill ph-check-circle" aria-hidden="true"></i><span>지켰어요</span></button>' +
  '<button type="button" class="vz-pts-mark is-missed" data-pts-mark="missed" data-point="' + esc(id) + '" aria-pressed="' + (live.results[id] === 'missed') + '"><i class="ph-fill ph-x-circle" aria-hidden="true"></i><span>놓쳤어요</span></button></div>';
function wireMarks(root, after) {
  root.querySelectorAll('[data-pts-mark]').forEach(b => b.onclick = () => {
    setResult(b.dataset.point, b.dataset.ptsMark);
    root.querySelectorAll('[data-pts-mark][data-point="' + CSS.escape(b.dataset.point) + '"]').forEach(x => x.setAttribute('aria-pressed', String(live.results[b.dataset.point] === x.dataset.ptsMark)));
    after?.(b.dataset.point);
  });
}
const progress = () => marked() + '/' + live.list.length + ' 체크';
/** The big list: every point in measure order, scrolled through while singing. */
function list() {
  const el = live.el, title = VZ.songTitle?.(live.songId) || '';
  el.className = 'vz-pts-run is-list';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '부르면서 체크');
  el.innerHTML = '<header class="vz-pts-run-head"><div class="vz-pts-run-title"><strong>부르면서 체크</strong><small><span>' + esc(title) + '</span> · <span data-pts-progress>' + progress() + '</span></small></div>' +
    (live.ctx ? '<button type="button" class="vz-pts-tool" data-pts-to-panel><i class="ph ph-music-notes" aria-hidden="true"></i>악보로</button>' : '') +
    '<button type="button" class="vz-pts-tool is-strong" data-pts-finish>끝내기</button></header>' +
    '<ol class="vz-pts-list">' + live.list.map(p => '<li class="vz-pts-item" data-pts-item="' + esc(p.id) + '"><div class="vz-pts-item-head"><span class="vz-pts-where">' + esc(P.label(p.measures)) + '</span>' + (p.tag ? '<small>' + esc(P.tagName(p.tag)) + '</small>' : '') + '</div>' +
      '<p class="vz-pts-text' + (p.fromMark ? ' has-mark' : '') + '">' + withMark(p) + '</p>' + markButtons(p.id, P.label(p.measures) + ' ' + p.text) + '</li>').join('') + '</ol>' +
    '<footer class="vz-pts-run-foot"><button type="button" class="vz-pts-done" data-pts-finish>끝내고 결과 보기</button></footer>';
  wireMarks(el, () => { el.querySelector('[data-pts-progress]').textContent = progress(); });
  el.querySelectorAll('[data-pts-finish]').forEach(b => b.onclick = finish);
  el.querySelector('[data-pts-to-panel]')?.addEventListener('click', () => { live.view = 'panel'; show(); });
  el.querySelector('.vz-pts-mark')?.focus({preventScroll:true});
}
/** Over the score while the MR plays: the point a measure ahead, then 지켰어요 / 놓쳤어요 once it is over. */
function panel() {
  if (!live) return;
  const el = live.el, ln = line(), on = playing(), c = ln && on ? P.cue(ln, live.t, live.results) : null;
  const byId = id => live.list.find(p => p.id === id);
  const remind = c ? c.now[0] || c.soon[0] || null : null, ask = c?.ask[0] || null;
  const next = !remind && ln ? (on ? c.next : Number.isFinite(live.t) ? ln.find(e => e.start > live.t) || null : ln[0] || null) : null;
  const sig = JSON.stringify([!!ln, on, remind && [remind.id, remind.start, c.now[0] === remind], ask && [ask.id, ask.end, live.results[ask.id] || ''], next?.id, next?.start, marked()]);
  if (sig === live.sig && el.classList.contains('is-panel')) return;
  live.sig = sig;
  if (on && ln) live.timed = true;
  el.className = 'vz-pts-run is-panel';
  el.setAttribute('role', 'region'); el.removeAttribute('aria-modal'); el.setAttribute('aria-label', '부르면서 체크');
  const card = (e, kind) => { const p = byId(e.id); return p ? '<div class="vz-pts-cue" data-pts-cue="' + kind + '" data-point="' + esc(p.id) + '"><span class="vz-pts-cue-when">' + (kind === 'now' ? '지금' : '곧') + ' · ' + esc(P.label(p.measures)) + '</span><strong class="vz-pts-cue-text' + (p.fromMark ? ' has-mark' : '') + '">' + withMark(p) + '</strong></div>' : ''; };
  let body;
  if (!ln) body = '<p class="vz-pts-wait" data-pts-wait="nosync">MR과 맞춘 마디를 아직 찾지 못했어요. 악보의 ⋯ › 마디와 MR 맞추기를 하면 재생할 때 마디에 맞춰 알려줘요. 지금은 목록으로 체크할 수 있어요.</p>';
  else if (!on) body = '<p class="vz-pts-wait" data-pts-wait="idle">재생이나 재생+녹음을 누르면 마디에 맞춰 알려줘요.</p>' + (next ? '<p class="vz-pts-next">' + (Number.isFinite(live.t) ? '다음' : '첫') + ' 지적 · ' + esc(P.label(byId(next.id).measures)) + ' · ' + esc(byId(next.id).text) + '</p>' : '');
  else {
    body = (remind ? card(remind, c.now[0] === remind ? 'now' : 'soon') : next ? '<p class="vz-pts-next" data-pts-next>다음 · ' + esc(P.label(byId(next.id).measures)) + ' · ' + esc(byId(next.id).text) + '</p>' : '<p class="vz-pts-next">남은 지적이 없어요.</p>');
    if (ask) { const p = byId(ask.id); body += '<div class="vz-pts-ask" data-pts-ask="' + esc(p.id) + '"><span class="vz-pts-ask-when' + (p.fromMark ? ' has-mark' : '') + '">방금 ' + esc(P.label(p.measures)) + ' · ' + withMark(p) + '</span>' + markButtons(p.id, P.label(p.measures) + ' ' + p.text) + '</div>'; }
  }
  el.innerHTML = '<div class="vz-pts-panel"><div class="vz-pts-panel-top"><strong>부르면서 체크</strong><span class="vz-pts-panel-progress" data-pts-progress>' + progress() + '</span>' +
    '<button type="button" class="vz-pts-tool" data-pts-to-list><i class="ph ph-list-checks" aria-hidden="true"></i>목록</button><button type="button" class="vz-pts-tool is-strong" data-pts-finish>끝내기</button></div>' + body + '</div>';
  wireMarks(el, () => { live.sig = ''; panel(); });
  el.querySelector('[data-pts-finish]').onclick = finish;
  el.querySelector('[data-pts-to-list]').onclick = () => { live.view = 'list'; show(); };
}
/** 끝내기: this run's results, the history with it, and 저장. */
function finish() {
  if (!live) return;
  live.view = 'summary'; show();
}
function summary(again = false) {
  const el = live.el, now = Date.now(), results = live.results, s = P.summary(live.list, results), top = again ? el.scrollTop : 0;
  const runs = [...runsOf(live.songId), {results, at:now}];
  el.className = 'vz-pts-run is-list is-summary';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', '이번 체크 결과');
  const linked = live.recordingId ? '<p class="vz-pts-linked" data-pts-linked><i class="ph ph-link" aria-hidden="true"></i>이번 녹음과 연결돼요.</p>' : live.recorded ? '<p class="vz-pts-linked" data-pts-linked="wait"><i class="ph ph-microphone" aria-hidden="true"></i>녹음을 저장하면 이 체크와 연결돼요.</p>' : '';
  el.innerHTML = '<header class="vz-pts-run-head"><div class="vz-pts-run-title"><strong>이번 체크 결과</strong><small>' + esc(VZ.songTitle?.(live.songId) || '') + '</small></div></header>' +
    '<div class="vz-pts-summary"><div class="vz-pts-counts" data-pts-counts><span class="is-kept"><b>' + s.kept + '</b>지켰어요</span><span class="is-missed"><b>' + s.missed + '</b>놓쳤어요</span><span><b>' + s.skipped + '</b>안 고름</span></div>' + linked + '</div>' +
    '<ol class="vz-pts-list">' + live.list.map(p => { const rec = P.record(runs, p.id); return '<li class="vz-pts-item" data-pts-item="' + esc(p.id) + '"><div class="vz-pts-item-head"><span class="vz-pts-where">' + esc(P.label(p.measures)) + '</span></div>' +
      '<p class="vz-pts-text' + (p.fromMark ? ' has-mark' : '') + '">' + withMark(p) + '</p>' + markButtons(p.id, P.label(p.measures) + ' ' + p.text) +
      '<div class="vz-pts-row-foot">' + dots(rec.recent) + '<span class="vz-pts-record">' + esc(P.recordText(rec)) + '</span></div>' +
      (P.suggestRetire(runs, p) ? '<div class="vz-pts-suggest" data-pts-suggest><span>이제 몸에 붙었어요 · 그만 볼까요?</span><span class="vz-pts-suggest-actions"><button type="button" data-pts-retire data-point="' + esc(p.id) + '">그만 볼래요</button></span></div>' : '') + '</li>'; }).join('') + '</ol>' +
    '<footer class="vz-pts-run-foot two"><button type="button" class="vz-pts-tool" data-pts-discard>저장 안 하고 닫기</button><button type="button" class="vz-pts-done" data-pts-save' + (marked() ? '' : ' disabled') + '>저장</button></footer>';
  wireMarks(el, () => summary(true));
  el.querySelectorAll('[data-pts-retire]').forEach(b => b.onclick = () => { if (quick(b.dataset.point, {retired:Date.now()}, '이제 체크에서 빼 둘게요. 기록은 남아 있어요.')) b.closest('[data-pts-suggest]').innerHTML = '<span>다음 체크부터 빼 둘게요.</span>'; });
  el.querySelector('[data-pts-save]').onclick = save;
  el.querySelector('[data-pts-discard]').onclick = async () => {
    if (marked() && !await VZ.confirm('체크 닫기', '이번 체크를 저장하지 않고 닫을까요?', {ok:'닫기', danger:true})) return;
    close();
  };
  if (again) el.scrollTop = top; else el.querySelector('[data-pts-save]')?.focus({preventScroll:true});
}
function save() {
  if (!live || !marked()) return;
  let row;
  try { row = P.run({songId:live.songId, scoreId:live.scoreId || undefined, date:VZ.today(), at:Date.now(), results:live.results, mode:live.timed ? 'timed' : 'list', recordingId:live.recordingId || undefined}, {uid:VZ.uid()}); }
  catch (e) { VZ.toast(e.message, 'error'); return; }
  if (!put(row)) return;
  lastSaved = {id:row.id, songId:row.songId, at:row.at, recorded:live.recorded, recordingId:row.recordingId || ''};
  close(); VZ.toast('체크를 저장했어요.'); announce();
}
function close() {
  if (!live) return;
  for (const off of live.offs.splice(0)) try { off?.(); } catch {}
  live.el.remove(); live = null; awake(false);
}
/** A take saved in the score viewer (app/score-audio.js): linked to the run it was recorded in. */
window.addEventListener('vzip:score-take-saved', e => {
  const {songId, id} = e.detail || {};
  if (!songId || !id) return;
  if (live && live.songId === songId && live.recorded && !live.recordingId) { live.recordingId = String(id); if (live.view === 'summary') summary(true); return; }
  if (lastSaved && lastSaved.songId === songId && lastSaved.recorded && !lastSaved.recordingId && Date.now() - lastSaved.at < 30 * 60000) {
    const cur = (VZ.db.scoreAnnotations || []).find(r => r?.id === lastSaved.id && P.isRun(r));
    if (cur && !cur.recordingId && put({...cur, recordingId:String(id)})) lastSaved.recordingId = String(id);
  }
});
window.VzipAccountScope?.beforeLeave?.(() => { if (live) close(); pending = null; lastSaved = null; });

// ---------- 악보 뷰어 ----------
/** Called by app/score-sync.js for every score the viewer opens. ctx: {songId, scoreId, audio() (the play bar of
 * app/score-audio.js), timing() → {seq, model} (the measure boxes and the sync's model, null when not matched),
 * outside() (leaves the viewer's own fullscreen so this can be seen)}. */
function viewer(ctx) {
  const c = {...ctx};
  let button = null;
  viewerCtx = c;
  if (pending && pending.songId === c.songId && Date.now() - pending.at < 120000) { pending = null; setTimeout(() => { if (viewerCtx === c) start(c.songId, {ctx:c, wait:true}); }, 0); }
  else if (live && live.songId === c.songId && !live.ctx && live.view !== 'summary') bind(c, true);
  return {
    /** ⋯ menu of the viewer: 부르면서 체크 (with how many points). */
    menu(actions) {
      if (!actions) { button?.remove(); button = null; return; }
      if (!button) {
        button = document.createElement('button'); button.type = 'button'; button.className = 'icon-btn'; button.setAttribute('data-ink-points-run', '');
        button.innerHTML = '<i class="ph ph-list-checks" aria-hidden="true"></i><span class="score-ink-menu-label"></span>';
        button.onclick = () => {
          if (live && live.songId === c.songId) { if (!live.ctx && live.view !== 'summary') bind(c); else show(); return; }
          if (!P.active(pointsOf(c.songId)).length) { Promise.resolve(c.outside?.()).catch(() => {}).then(() => editor(c.songId, {scoreId:c.scoreId})); return; }
          start(c.songId, {ctx:c});
        };
      }
      if (!button.isConnected) actions.append(button);
      const n = P.active(pointsOf(c.songId)).length, text = '부르면서 체크';
      button.setAttribute('aria-label', text + (n ? ' · 지적 ' + n + '개' : ' · 지적 추가')); button.title = text;
      const l = button.querySelector('.score-ink-menu-label'); l.textContent = text;
      const small = document.createElement('small'); small.className = 'score-sync-menu-note'; small.textContent = n ? '지적 ' + n + '개' : '지적 추가'; l.append(small);
    },
    /** 이 마디에 지적 추가 (measure: a box of VzipScoreMeasures.sequence). */
    add(measure) {
      const from = parseInt(String(measure?.number ?? ''), 10), last = parseInt(String(measure?.last ?? ''), 10);
      Promise.resolve(c.outside?.()).catch(() => {}).then(() => editor(c.songId, {from:Number.isFinite(from) ? from : '', to:Number.isFinite(last) ? last : '', scoreId:c.scoreId}));
    },
    /** 지적으로 in the menu of a placed 표기 (app/score-sync.js): the form filled from the mark — {text, from, to, fromMark}. */
    mark(m) {
      Promise.resolve(c.outside?.()).catch(() => {}).then(() => editor(c.songId, {from:m?.from ?? '', to:m?.to ?? '', text:m?.text || '', fromMark:m?.fromMark || undefined, scoreId:c.scoreId}));
    },
    destroy() { if (viewerCtx === c) viewerCtx = null; button?.remove(); button = null; if (live?.ctx === c) unbind(); }
  };
}
window.VzipScorePoints = {viewer};
VZ.scorePoints = {card, lessonEntry, manage, editor, start, addMany, fromMark};
})();
