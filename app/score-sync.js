/* 마디와 MR 맞추기 (악보 뷰어): which measure sounds at which second of the song's MR file.
 * The app cannot hear this by itself, so the user taps along once (직접 찍기): the MR plays and 다음 마디 is pressed at
 * every measure start (or only at line starts — the rest is shared out evenly). The taps are saved on the score entry
 * (songs[].scores[].mrSync[MR id], through VZ.change like every other edit of a song) for that MR file and that
 * conversion; when the MR is deleted or the score is converted again with another number of measures the sync is
 * shown as "다시 맞춰야 해요" and is not used. Model: app/score-sync-model.js. With a usable sync:
 * - 재생 위치 따라가기 (⋯ menu, kept on this device): the measure sounding now is marked lightly while the MR plays and
 *   pages follow — never while the user is writing.
 * - 표시한 마디 rows get ▶ 이 마디 반복 (the loop bar lives in app/score-audio.js).
 * - With 마디 위치 보기 on, pressing and holding a measure box (where a finger or the 이동 tool cannot draw) offers
 *   여기서 재생 and 이 마디 반복.
 * - 표기의 기능 (app/score-mark-model.js): 시작점 · 반복 · 컷 marks (and user marks with a 기능) do something. The play
 *   bar gets one button, 재생 옵션: 처음부터 / 시작점 N마디에서 and 컷 건너뛰기 (both kept per score on this
 *   device, app/score-audio.js setPlan); 표시한 마디 rows get ▶ 여기서 재생 / ▶ 이 구간 반복 / 건너뜀; tapping such a mark
 *   where the pointer cannot draw offers the same. Without a usable sync these places say that matching is needed.
 * YouTube MRs cannot be matched: the app never learns where a YouTube player is.
 *   window.VzipScoreSync.attach(context) → {refresh, menu, now, list, marked, destroy} — called by app/score-measures.js */
(() => {
'use strict';
const VZ = window.VZ, M = window.VzipScoreMeasures, S = window.VzipScoreSyncModel, K = window.VzipScoreMarks || null;
if (!VZ || !M || !S) return;
const esc = VZ.esc, NS = 'http://www.w3.org/2000/svg';
const node = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };
const NEED = 'MR과 맞추면 이 마디만 반복해서 들을 수 있어요.', AGAIN = '다시 맞춰야 해요', MARK_NEED = '시작점·반복·컷 표기는 MR과 맞추면 쓸 수 있어요.';
const WHY = {measures:'악보를 다시 변환해서 마디 수가 달라졌어요.', length:'MR 파일 길이가 맞출 때와 달라요.', broken:'전에 맞춘 내용을 읽을 수 없어요.', mr:'맞춘 MR이 지워졌어요.'};
const TAP_GAP = .08, HOLD_MS = 550, HOLD_MOVE = 10, SLOW = .75, BACK = 2, MARK_REACH = 14;
const seconds = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2) + '초';

function attach(c) {
  const {v} = c, {score, songId, owner, storage, stage} = v;
  const key = 'vzip_score_sync_v1:' + owner, markKey = 'vzip_score_marks_v1:' + owner;
  /** The score's marks with a function (K.collect) and the pages they are on. */
  let fn = {starts:[], repeats:[], cuts:[]}, rolePages = new Set();
  let alive = true, seq = [], seqFor = null, ordOf = new Map(), state = {state:'none'}, model = null, stamp = '', lengthFor = '', now = null, sheet = null;
  let syncButton = null, followButton = null, hold = null, offTick = null;
  let prefs = {follow:true};
  try { const p = JSON.parse(storage.getItem(key) || 'null'); if (p && typeof p === 'object') prefs = {follow:p.follow !== false}; } catch {}
  const remember = () => { try { storage.setItem(key, JSON.stringify(prefs)); } catch {} };
  const audio = () => v.audio?.() || null;
  const song = () => VZ.song(songId) || null;
  const saved = () => (song()?.scores || []).find(s => s.id === score.id)?.mrSync || null;
  const tracks = () => song()?.mrTracks || [];
  const files = () => tracks().filter(S.fileTrack);
  /** The MR the viewer plays: the bar's choice when that is a file, else the song's first MR file. */
  const track = () => { const t = audio()?.track?.(); return S.fileTrack(t) ? t : files()[0] || null; };

  /** Reads the saved sync for the MR in use again when the conversion, the MR choice or the saved data changed. */
  function refresh() {
    const lay = c.layout();
    if (lay !== seqFor) { seqFor = lay; seq = lay ? M.sequence(lay) : []; ordOf = new Map(seq.map(m => [m.index, m.ord])); stamp = ''; }
    const t = lay ? track() : null, map = lay ? saved() : null, next = lay ? JSON.stringify([t?.id || '', map, tracks().map(x => [x?.id, !!x?.deleted, x?.kind])]) : 'none';
    if (next !== stamp) {
      stamp = next; lengthFor = '';
      state = lay ? S.status(map, t, {count:seq.length, tracks:tracks()}) : {state:'none'};
      model = state.state === 'ok' ? S.build(seq, state.data.anchors, {offset:state.data.offset}) : null;
      if (state.state === 'ok' && !model) state = {state:'stale', why:'broken'};
      if (!model) now = null;
      plan();
    }
    // The MR's time is listened to only while there is something to follow.
    const a = audio();
    if (model && prefs.follow && !offTick && a?.onTick) offTick = a.onTick(onTick);
    else if ((!model || !prefs.follow) && offTick) { offTick(); offTick = null; }
  }
  /** The file is not as long as the one the sync was made for (checked once its length is known): not used. */
  function lengthCheck() {
    const t = track(), d = audio()?.duration?.();
    if (!model || !t || !d || lengthFor === t.id) return;
    lengthFor = t.id;
    if (Math.abs(d - state.data.duration) > S.LENGTH_ROOM) { state = {state:'stale', why:'length'}; model = null; now = null; plan(); c.menu(); c.repaint(); }
  }

  // ---------- ⋯ menu ----------
  function menu(actions) {
    if (!actions) { syncButton?.remove(); followButton?.remove(); syncButton = followButton = null; points?.menu(null); return; }
    refresh();
    const make = (name, icon, run) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'icon-btn'; b.setAttribute('data-ink-' + name, ''); b.innerHTML = '<i class="ph ph-' + icon + '" aria-hidden="true"></i><span class="score-ink-menu-label"></span>'; b.onclick = run; return b; };
    if (!syncButton) actions.append(syncButton = make('measure-sync', 'hand-tap', () => openSheet()));
    // 재생 위치 따라가기 is offered only while there is a sync to follow.
    if (state.state === 'ok' && !followButton) syncButton.after(followButton = make('measure-follow', 'crosshair-simple', () => setFollow(!prefs.follow)));
    else if (state.state !== 'ok' && followButton) { followButton.remove(); followButton = null; }
    const label = (b, text, note = '') => {
      b.setAttribute('aria-label', text + (note ? ' · ' + note : '')); b.title = text;
      const l = b.querySelector('.score-ink-menu-label'); l.textContent = text;
      if (note) { const small = document.createElement('small'); small.className = 'score-sync-menu-note'; small.textContent = note; l.append(small); }
    };
    label(syncButton, '마디와 MR 맞추기', state.state === 'stale' ? AGAIN : '');
    syncButton.dataset.state = state.state;
    if (followButton) { label(followButton, '재생 위치 따라가기'); followButton.setAttribute('aria-pressed', String(prefs.follow)); }
    points?.menu(actions);
  }
  function setFollow(next) { prefs.follow = !!next; remember(); now = null; refresh(); c.menu(); c.repaint(); }

  // ---------- 재생 위치 따라가기 ----------
  function onTick(time) {
    if (!alive) return;
    lengthCheck();
    const hit = model && prefs.follow ? model.measureAt(time) : null;
    if (hit === now) return;
    const before = now ? seq[now.m] : null; now = hit;
    if (!hit) { c.repaint(); return; }
    const m = seq[hit.m];
    // Pages and the scroll place follow, but never under a hand that is writing.
    if (m.page !== v.page()) {
      if (v.writing()) { c.repaint(); return; }
      Promise.resolve(v.go(m.page)).then(() => { if (alive && now === hit) { c.repaint(); c.show(m.index); } }, () => {});
      return;
    }
    c.repaint();
    if ((!before || before.page !== m.page || before.system !== m.system) && !v.writing()) c.show(m.index);
  }
  /** The bar repainted (another mode or MR): the mark goes when the MR stops. */
  function onMode(mode) {
    if (!alive) return;
    refresh(); if (syncButton) c.menu();
    if (!['mr', 'mrrec', 'loop', 'paused'].includes(mode) && now) { now = null; c.repaint(); }
  }
  const offChange = audio()?.onChange?.(onMode) || null;
  // 레슨 지적 체크 (app/score-points.js): 부르면서 체크 follows the MR through this sync; a measure box can take a point.
  let points = null;
  try { points = window.VzipScorePoints?.viewer({songId, scoreId:score.id, audio, outside:() => v.outside?.(), timing:() => ({seq, model})}) || null; } catch { points = null; }

  // ---------- 여기서 재생 · 이 마디 반복 ----------
  async function startLoop(from, to, occurrence = 0) {
    refresh();
    const r = model?.rangeOf(from, to, occurrence), a = audio(), t = track();
    if (!r || !a || !t) { VZ.toast('이 마디는 MR에서 위치를 알 수 없어요.', 'error'); return; }
    try {
      await a.loop({label:S.label(seq, r.from, r.to), start:r.start, end:r.end, lead:r.lead, occurrence:r.occurrence, occurrences:r.occurrences,
        next:r.occurrences > 1 ? () => startLoop(from, to, (occurrence + 1) % r.occurrences) : null}, t.id);
      // A cut the loop only meets (it does not lie inside it) is jumped over on every round: said once.
      const cuts = K && !occurrence ? a.loopCuts?.() || [] : [];
      if (cuts.length) VZ.toast('반복하는 동안 컷 ' + K.text(cuts) + ' 건너뜀');
    } catch (e) { VZ.toast(e?.message || '재생하지 못했어요.', 'error'); }
  }
  async function playHere(ord) {
    refresh();
    const time = model?.timeOf(ord), a = audio(), t = track();
    if (time == null || !a || !t) { VZ.toast('이 마디는 MR에서 위치를 알 수 없어요.', 'error'); return; }
    try { await a.playFrom(time, t.id); } catch (e) { VZ.toast(e?.message || '재생하지 못했어요.', 'error'); }
  }
  /** What the 표시한 마디 list adds: ▶ per row with a sync (a 표기 with a function gets its own action), one line with a
   * way to 맞추기 without. Null: nothing. */
  function list(items) {
    refresh();
    if (!tracks().some(t => t && !t.deleted)) return null; // a song without any MR
    const roles = !!K && items.some(it => it.role);
    if (state.state !== 'ok') {
      const stale = state.state === 'stale';
      return {rows:null, head:'<p class="score-sync-need" data-sync-need data-state="' + state.state + '"><i class="ph ph-' + (stale ? 'warning' : 'repeat') + '" aria-hidden="true"></i><span>' +
        (stale ? '<strong>' + AGAIN + '.</strong> ' + esc(WHY[state.why] || '') + ' ' : '') + NEED + (roles ? ' ' + MARK_NEED : '') + '</span><button type="button" data-sync-open>' + (stale ? '다시 맞추기' : '맞추기') + '</button></p>',
        wire:(host, close) => { host.querySelector('[data-sync-open]').onclick = () => { close(); openSheet(); }; }};
    }
    const ranges = items.map(it => { const ords = it.measures.map(i => ordOf.get(i)).filter(Number.isInteger); return ords.length ? {from:Math.min(...ords), to:Math.max(...ords)} : null; });
    audio()?.prepare?.(track()?.id);
    const act = (name, i, text, label, ok) => '<button type="button" class="score-measure-act" data-mark-' + name + '="' + i + '" aria-label="' + esc(label) + '"' + (ok ? '' : ' disabled') + '><i class="ph-fill ph-play" aria-hidden="true"></i><span>' + text + '</span></button>';
    const skipped = i => !!ranges[i] && model.occurrences(ranges[i].from) > 0;
    const badge = i => { const on = K.prefs(stored(), score.id).cut; return !skipped(i) ? '위치 모름' : on ? '건너뜀' : '건너뛰기 꺼짐'; };
    const cutHint = () => { const cut = cutInfo(), on = K.prefs(stored(), score.id).cut;
      return (cut.skips.length ? on ? '재생할 때 <strong>' + esc(cut.text) + ' 건너뜀</strong>. 반복해서 듣거나 그 마디에서 재생하면 건너뛰지 않아요.' : '컷 건너뛰기가 꺼져 있어요. ' + esc(cut.text) + '도 그대로 재생해요.' : '컷 표시한 마디는 MR에서 위치를 알 수 없어서 건너뛰지 못해요.'); };
    return {head:roles && items.some(it => it.role === 'cut') ? '<p class="score-sync-need score-mark-cuts" data-mark-cut-hint><i class="ph ph-scissors" aria-hidden="true"></i><span data-mark-cut-text>' + cutHint() + '</span>' +
        (cutInfo().skips.length ? '<button type="button" data-mark-cut-toggle aria-pressed="' + K.prefs(stored(), score.id).cut + '">컷 건너뛰기</button>' : '') + '</p>' : '',
      rows:items.map((it, i) => roles && it.role === 'start' ? act('start', i, '여기서 재생', it.where + ' 여기서 재생', !!ranges[i] && model.timeOf(ranges[i].from) != null)
        : roles && it.role === 'repeat' ? act('repeat', i, '이 구간 반복', it.where + ' 이 구간 반복', !!ranges[i] && !!model.rangeOf(ranges[i].from, ranges[i].to))
        : roles && it.role === 'cut' ? '<span class="score-measure-skip" data-mark-cut="' + i + '" data-on="' + (badge(i) === '건너뜀') + '">' + badge(i) + '</span>'
        : '<button type="button" class="score-measure-play" data-measure-loop="' + i + '" title="이 마디 반복" aria-label="' + esc(it.where) + ' 반복 재생"' +
        (ranges[i] && model.rangeOf(ranges[i].from, ranges[i].to) ? '' : ' disabled') + '><i class="ph-fill ph-play" aria-hidden="true"></i></button>'),
      wire:(host, close) => {
        const on = (name, run) => host.querySelectorAll('[data-' + name + ']').forEach(b => b.onclick = () => { const i = Number(b.getAttribute('data-' + name)); close(); c.reveal(items[i]); run(ranges[i]); });
        on('measure-loop', r => startLoop(r.from, r.to)); on('mark-repeat', r => startLoop(r.from, r.to)); on('mark-start', r => playHere(r.from));
        const toggle = host.querySelector('[data-mark-cut-toggle]');
        if (toggle) toggle.onclick = () => {
          setCuts(!K.prefs(stored(), score.id).cut, false);
          toggle.setAttribute('aria-pressed', String(K.prefs(stored(), score.id).cut)); host.querySelector('[data-mark-cut-text]').innerHTML = cutHint();
          host.querySelectorAll('[data-mark-cut]').forEach(b => { const text = badge(Number(b.dataset.markCut)); b.textContent = text; b.dataset.on = String(text === '건너뜀'); });
        };
      }};
  }

  // ---------- 표기의 기능: 시작점 · 반복 · 컷 ----------
  const stored = () => { try { return storage.getItem(markKey); } catch { return null; } };
  const keep = patch => { try { storage.setItem(markKey, K.withPrefs(stored(), score.id, patch)); } catch {} };
  /** The 표시한 마디 rows were read again (the viewer opened, or the handwriting changed). */
  function marked(items) {
    if (!K || !alive) return;
    refresh();
    fn = K.collect(items, ordOf); rolePages = new Set((items || []).filter(it => it.role).map(it => it.page));
    plan();
  }
  /** The cut stretches the MR in use can skip (each with its name) and one line naming their measures. */
  function cutInfo() {
    if (!model) return {skips:[], text:''};
    const name = k => k.to >= k.from ? S.label(seq, k.from, k.to) : S.label(seq, k.from) + ', ' + S.label(seq, k.to);
    return {skips:K.skips(model.spans, fn.cuts).map(k => ({start:k.start, end:k.end, label:name(k)})),
      text:K.text(K.runs(fn.cuts.filter(m => model.occurrences(m) > 0)).map(r => S.label(seq, r.from, r.to)))};
  }
  /** The 시작점 remembered for this score, while it is still there and the MR has a time for it. */
  const chosenStart = () => { const at = K.prefs(stored(), score.id).start; return model && at != null ? fn.starts.find(x => x.ord === at && model.timeOf(x.ord) != null) || null : null; };
  /** Tells the play bar what it offers besides its buttons: where 재생 starts and which stretches it jumps over. */
  function plan() {
    const a = audio();
    if (!a?.setPlan) return;
    const t = K && c.layout() && (fn.starts.length || fn.cuts.length) ? track() : null;
    if (!t) { a.setPlan(null); return; }
    if (state.state !== 'ok' || !model) {
      a.setPlan({trackId:t.id, need:true, start:fn.starts.length ? {label:'시작점'} : null, cuts:fn.cuts.length ? {on:false, note:''} : null, explain:anchor => needMenu('재생 옵션', anchor)});
      return;
    }
    const chosen = chosenStart(), cut = cutInfo(), on = K.prefs(stored(), score.id).cut;
    a.setPlan({trackId:t.id, need:false,
      start:fn.starts.length ? {label:chosen ? '시작점 ' + S.label(seq, chosen.ord) + '에서' : '처음부터', short:chosen ? S.label(seq, chosen.ord) + '부터' : '', time:chosen ? model.timeOf(chosen.ord) : null} : null,
      cuts:fn.cuts.length ? {on, note:!cut.skips.length ? '위치 모름' : on ? cut.text + ' 건너뜀' : '꺼짐', skips:cut.skips} : null,
      open:anchor => optionsMenu(anchor)});
  }
  function setCuts(on, say = true) {
    keep({cut:!!on}); plan();
    const cut = cutInfo();
    if (say) VZ.toast(!cut.skips.length ? '컷 표시한 마디는 MR에서 위치를 알 수 없어요.' : on ? '재생할 때 ' + cut.text + ' 건너뜀' : '컷 건너뛰기를 껐어요. ' + cut.text + '도 재생해요.');
  }
  /** 재생 옵션 (from the play bar): 처음부터 / 시작점 N마디에서 — the 시작점 of the page in view first, then the others
   * by page and measure — and 컷 건너뛰기 with the measures it skips. */
  async function optionsMenu(anchor) {
    try { await v.outside(); } catch {}
    if (!alive) return;
    refresh();
    if (state.state !== 'ok' || !model) { needMenu('재생 옵션', anchor); return; }
    const chosen = chosenStart(), cut = cutInfo(), on = K.prefs(stored(), score.id).cut;
    const row = (attrs, text, note, pressed, ok = true, icon = '') => '<button type="button" class="vz-choice" ' + attrs + ' aria-pressed="' + pressed + '"' + (ok ? '' : ' disabled') + '>' + (icon ? '<i class="ph ph-' + icon + '" aria-hidden="true"></i>' : '') +
      '<span>' + esc(text) + (note ? '<small>' + esc(note) + '</small>' : '') + '</span>' + (pressed ? '<i class="ph ph-check" aria-hidden="true"></i>' : '') + '</button>';
    const body = (fn.starts.length ? '<p class="score-sync-menu-title">재생을 시작할 곳</p><div class="vz-choice-list" role="group" aria-label="재생을 시작할 곳">' + row('data-mark-start-pick=""', '처음부터', '', !chosen) +
        K.orderStarts(fn.starts, v.page()).map(x => { const ok = model.timeOf(x.ord) != null; return row('data-mark-start-pick="' + x.ord + '"', '시작점 ' + S.label(seq, x.ord) + '에서', x.page + '쪽' + (ok ? '' : ' · MR에서 위치를 알 수 없어요'), chosen?.ord === x.ord, ok); }).join('') + '</div>' : '') +
      (fn.cuts.length ? '<p class="score-sync-menu-title">컷</p><div class="vz-choice-list" role="group" aria-label="컷">' +
        row('data-mark-cut-pick', '컷 건너뛰기', !cut.skips.length ? 'MR에서 위치를 알 수 없어요' : on ? cut.text + ' 건너뜀' : '꺼짐 · ' + cut.text + '도 재생', on && cut.skips.length > 0, cut.skips.length > 0, 'scissors') + '</div>' : '');
    VZ.menu({title:'재생 옵션', label:'재생 옵션', anchor, body, onMount:(host, close) => {
      host.classList.add('score-sync-menu');
      host.querySelectorAll('[data-mark-start-pick]').forEach(b => b.onclick = () => { close(); keep({start:b.dataset.markStartPick === '' ? null : Number(b.dataset.markStartPick)}); plan(); });
      const toggle = host.querySelector('[data-mark-cut-pick]'); if (toggle) toggle.onclick = () => { close(); setCuts(!on); };
    }});
  }
  /** Not matched (yet, or any more): what matching gives, with the way to the 맞추기 screen. */
  function needMenu(title, anchor) {
    const stale = state.state === 'stale';
    const body = '<p class="score-sync-menu-title">' + esc(title) + '</p><p class="small muted score-sync-menu-text" data-sync-need>' + (stale ? AGAIN + '. ' + esc(WHY[state.why] || '') + ' ' : '') + MARK_NEED + '</p>' +
      '<div class="vz-choice-list"><button type="button" class="vz-choice" data-sync-open><i class="ph ph-hand-tap" aria-hidden="true"></i> ' + (stale ? '다시 맞추기' : 'MR과 맞추기') + '</button></div>';
    VZ.menu({title, label:title + ' 메뉴', anchor, body, onMount:(host, close) => { host.classList.add('score-sync-menu'); host.querySelector('[data-sync-open]').onclick = () => { close(); openSheet(); }; }});
  }
  /** The topmost mark with a function under a point of the screen, on the page now shown. */
  function markAt(x, y) {
    const n = v.page();
    if (!K || !c.layout() || !rolePages.has(n)) return null;
    const r = v.box.getBoundingClientRect(), aspect = v.aspect();
    if (!(r.width > 0 && r.height > 0 && aspect > 0)) return null;
    const fx = (x - r.left) / r.width, fy = (y - r.top) / r.height;
    let rows; try { rows = v.rows(); } catch { return null; }
    rows = rows.filter(row => row.page === n);
    for (const row of rows.slice().reverse()) {
      const b = K.roleOf(row) ? M.strokeBox(row) : null;
      if (!b) continue;
      const reach = Math.max(MARK_REACH / r.width, (row.width || 0) / 2);
      // A stamped symbol of several strokes is one mark: it stands where its whole drawing lies.
      if (fx >= b.x - reach && fx <= b.x + b.w + reach && fy >= b.y - reach / aspect && fy <= b.y + b.h + reach / aspect) return K.whole(rows, row);
    }
    return null;
  }
  /** A tap on a 시작점 · 반복 · 컷 mark: 여기서 재생 / 이 구간 반복 / what is skipped. */
  async function markMenu(row, x, y) {
    try { await v.outside(); } catch {}
    if (!alive || sheet) return;
    refresh();
    if (!tracks().some(t => t && !t.deleted)) return; // a song without any MR: the mark stays a drawing
    const role = K.roleOf(row), ords = K.span(c.geometry(row.page), row, role, c.layout()?.measures).map(h => ordOf.get(h.index)).filter(Number.isInteger);
    if (!ords.length) return;
    const from = Math.min(...ords), to = Math.max(...ords), where = S.label(seq, from, to);
    const title = ((v.markers() || []).find(m => m.id === row.mark)?.name || K.ROLE_NAMES[role]) + ' · ' + where, anchor = {getBoundingClientRect:() => ({left:x, right:x, top:y, bottom:y, width:0, height:0})};
    if (state.state !== 'ok' || !model) { needMenu(title, anchor); return; }
    audio()?.prepare?.(track()?.id);
    const choice = (name, icon, text, ok = true, pressed = '') => '<button type="button" class="vz-choice" data-mark-' + name + (ok ? '' : ' disabled') + (pressed === '' ? '' : ' aria-pressed="' + pressed + '"') + '><i class="ph ph-' + icon + '" aria-hidden="true"></i> ' + text + '</button>';
    const lost = '<p class="small muted score-sync-menu-text">이 마디는 MR에서 위치를 알 수 없어요.</p>', cut = cutInfo(), on = K.prefs(stored(), score.id).cut, known = model.timeOf(from) != null;
    const body = '<p class="score-sync-menu-title">' + esc(title) + '</p>' + (
      role === 'start' ? (known ? '' : lost) + '<div class="vz-choice-list">' + choice('here', 'play', '여기서 재생', known) + '</div>'
      : role === 'repeat' ? (model.rangeOf(from, to) ? '' : lost) + '<div class="vz-choice-list">' + choice('loop', 'repeat', '이 구간 반복', !!model.rangeOf(from, to)) + '</div>'
      : '<p class="small muted score-sync-menu-text" data-mark-cut-text>' + (!model.occurrences(from) ? '이 마디는 MR에서 위치를 알 수 없어서 건너뛰지 못해요.' : on ? '재생할 때 ' + esc(cut.text) + ' 건너뜀' : '컷 건너뛰기가 꺼져 있어요.') + '</p>' +
        '<div class="vz-choice-list">' + choice('cuts', 'scissors', '컷 건너뛰기 ' + (on ? '끄기' : '켜기'), cut.skips.length > 0) + '</div>');
    VZ.menu({title, label:title + ' 메뉴', anchor, body, onMount:(host, close) => {
      host.classList.add('score-sync-menu');
      const act = (name, run) => { const b = host.querySelector('[data-mark-' + name + ']'); if (b) b.onclick = () => { close(); run(); }; };
      act('here', () => playHere(from)); act('loop', () => startLoop(from, to)); act('cuts', () => setCuts(!on));
    }});
  }
  /** Press-and-hold menu of a measure box (마디 위치 보기 on). */
  async function measureMenu(hit, x, y) {
    try { await v.outside(); } catch {}
    if (!alive) return;
    refresh();
    const ord = ordOf.get(hit.index);
    if (ord == null) return;
    const name = S.label(seq, ord), ok = state.state === 'ok', known = ok && model.timeOf(ord) != null, stale = state.state === 'stale';
    if (ok) audio()?.prepare?.(track()?.id);
    const body = '<p class="score-sync-menu-title">' + esc(name) + '</p>' + (ok
      ? (known ? '' : '<p class="small muted score-sync-menu-text">이 마디는 MR에서 위치를 알 수 없어요.</p>') +
        '<div class="vz-choice-list"><button type="button" class="vz-choice" data-sync-here' + (known ? '' : ' disabled') + '><i class="ph ph-play" aria-hidden="true"></i> 여기서 재생</button>' +
        '<button type="button" class="vz-choice" data-sync-loop' + (known ? '' : ' disabled') + '><i class="ph ph-repeat" aria-hidden="true"></i> 이 마디 반복</button></div>'
      : '<p class="small muted score-sync-menu-text" data-sync-need>' + (stale ? AGAIN + '. ' + esc(WHY[state.why] || '') + ' ' : '') + NEED + '</p>' +
        '<div class="vz-choice-list"><button type="button" class="vz-choice" data-sync-open><i class="ph ph-hand-tap" aria-hidden="true"></i> ' + (stale ? '다시 맞추기' : 'MR과 맞추기') + '</button></div>') +
      (points ? '<div class="vz-choice-list"><button type="button" class="vz-choice" data-sync-point><i class="ph ph-chat-circle-text" aria-hidden="true"></i> 이 마디에 지적 추가</button></div>' : '');
    VZ.menu({title:name, label:name + ' 메뉴', anchor:{getBoundingClientRect:() => ({left:x, right:x, top:y, bottom:y, width:0, height:0})}, body, onMount:(host, close) => {
      host.classList.add('score-sync-menu');
      const on = (what, fn) => { const b = host.querySelector('[data-sync-' + what + ']'); if (b) b.onclick = () => { close(); fn(); }; };
      on('here', () => playHere(ord)); on('loop', () => startLoop(ord, ord)); on('open', () => openSheet()); on('point', () => points?.add(seq[ord]));
    }});
  }
  // A held pointer that cannot draw (이동, or a finger with 펜만 필기) and has not moved: no existing gesture uses it.
  // The same pointer lifted again without having moved, before the hold ran out: a tap — on a 표기 with a function
  // it opens that mark's menu. A page that scrolls under the pointer ends the hold but not a tap: the score also
  // scrolls by itself while it follows the MR.
  const drop = () => { if (hold) { clearTimeout(hold.timer); hold = null; } };
  const scrolled = () => { if (hold) { clearTimeout(hold.timer); hold.timer = 0; } };
  const down = e => {
    if (hold) { drop(); return; } // a second finger: a pinch or a two-finger swipe
    if (!alive || sheet || e.button > 0 || !v.canHold?.(e)) return;
    const hit = c.boxes() ? c.boxAt(e.clientX, e.clientY) : null;
    if (!hit && !rolePages.has(v.page())) return;
    const mine = hold = {id:e.pointerId, x:e.clientX, y:e.clientY, at:Date.now(), timer:hit ? setTimeout(() => { if (hold !== mine) return; hold = null; if (alive && c.boxes() && v.canHold?.(e)) measureMenu(hit, mine.x, mine.y); }, HOLD_MS) : 0};
  };
  const move = e => { if (hold && e.pointerId === hold.id && Math.hypot(e.clientX - hold.x, e.clientY - hold.y) > HOLD_MOVE) drop(); };
  const up = e => {
    if (!hold || e.pointerId !== hold.id) return;
    const press = hold; drop();
    if (e.type !== 'pointerup' || !alive || sheet || Date.now() - press.at >= HOLD_MS || !v.canHold?.(e)) return;
    const row = markAt(e.clientX, e.clientY);
    if (row) markMenu(row, e.clientX, e.clientY);
  };
  stage.addEventListener('pointerdown', down, true); stage.addEventListener('pointermove', move, true);
  stage.addEventListener('pointerup', up, true); stage.addEventListener('pointercancel', up, true); stage.addEventListener('scroll', scrolled, {passive:true});

  // ---------- 맞추기 화면 ----------
  /** No MR file to match with: say what is needed. */
  function explain(kind) {
    VZ.sheet({variant:'alert', title:'MR 파일이 필요해요', body:'<p class="muted" data-sync-explain>' +
      (kind === 'youtube' ? '유튜브 MR은 앱이 재생 위치를 알 수 없어서 마디와 맞출 수 없어요. 맞추기는 올려 둔 MR 파일로만 할 수 있어요.' : '이 곡에는 아직 MR 파일이 없어요.') +
      ' 곡의 레퍼런스 탭에서 MR 파일을 추가한 뒤 다시 열어 주세요.</p>', foot:'<button type="button" class="btn block" data-close>확인</button>'});
  }
  async function openSheet() {
    if (!alive || sheet || !c.layout()) return;
    refresh();
    const a = audio(), P = VZ.media?.player, item = window.VzipScoreAudio?.mrItem;
    try { await v.outside(); } catch {}
    if (!alive || sheet) return;
    if (!files().length) { explain(tracks().some(t => t && !t.deleted) ? 'youtube' : 'none'); return; }
    if (!a || !P || !item) return;
    if (!a.quiet()) { VZ.toast('녹음을 끝낸 뒤에 맞출 수 있어요.', 'error'); return; }

    const aspects = new Map();
    let t = track(), anchors = [], offset = 0, base = '', wasStale = false, mode = 'tap', lines = false, slow = false, pageNo = 1, shownPage = 0, nowOrd = -1;
    let player = null, built = null, timer = 0, drawing = 0, sayTimer = 0, resizeTimer = 0, shut = false, downTap = false, keyTap = false, boxTime = null, observer = null;
    let host, close, form, stageEl, pageEl, canvasEl, svgEl, tapButton, saveButton;
    // The shared player runs the MR off screen (its seek slider must not count as a field of this sheet).
    const engine = document.createElement('div');
    const signature = () => JSON.stringify([S.pack(anchors), Math.round(offset * 100)]);
    const changed = () => signature() !== base;
    const el = () => player.el;
    const clock = () => el().currentTime || 0;
    const length = () => Number.isFinite(el().duration) && el().duration > 0 ? el().duration : 0;
    const seek = time => { const e = el(), go = () => { try { e.currentTime = Math.max(0, time); } catch {} }; if (e.readyState >= 1) go(); else e.addEventListener('loadedmetadata', go, {once:true}); };
    const last = () => anchors.at(-1) || null;
    const target = () => S.nextTarget(seq, last() ? last().m : -1, lines);
    const q = name => host.querySelector('[data-sync-' + name + ']');
    const GUIDE = {tap:'MR을 들으면서 마디가 시작될 때마다 ‘다음 마디’를 눌러 주세요. 도돌이표처럼 다른 곳으로 넘어가면 그 마디를 악보에서 직접 눌러 주세요.',
      check:'표시가 음악보다 늦으면 ‘전체 앞당기기’, 빠르면 ‘전체 늦추기’를 눌러 맞춰 주세요. 마디를 누르면 거기서부터 들려줘요.'};
    function say(text) { const g = q('guide'); if (!g) return; g.textContent = text; g.dataset.note = 'true'; clearTimeout(sayTimer); sayTimer = setTimeout(() => { if (!shut) paintGuide(); }, 4000); }
    function paintGuide() { const g = q('guide'); g.dataset.note = 'false'; g.textContent = (wasStale && mode === 'tap' && !anchors.length ? '악보나 MR이 바뀌어서 처음부터 다시 맞춰야 해요. ' : '') + (mode === 'tap' && lines ? 'MR을 들으면서 줄이 시작될 때마다 ‘다음 줄’을 눌러 주세요. 그 사이 마디는 고르게 나눠요.' : GUIDE[mode]); }

    /** Takes up the MR: what was saved for it (when it still fits), and its own player. */
    function load(next) {
      t = next;
      const st = S.status(saved(), t, {count:seq.length, tracks:tracks()});
      anchors = st.state === 'ok' ? st.data.anchors.map(x => ({t:x.t, m:x.m})) : []; offset = st.state === 'ok' ? st.data.offset : 0;
      wasStale = st.state === 'stale'; base = signature(); mode = 'tap';
      player?.destroy(); player = P(engine, item(t), {});
      for (const type of ['play', 'pause', 'ended', 'loadedmetadata']) el().addEventListener(type, () => { if (!shut) paintControls(); });
      if (last()) seek(Math.max(0, last().t - BACK));
      update({page:last() ? seq[last().m].page : 1});
    }
    /** After the anchors, the nudge or the mode changed. */
    function update({page} = {}) {
      built = anchors.length ? S.build(seq, anchors, {offset}) : null;
      // Tells the sheet that something was done here (its close question looks for that), also after a key press.
      if (changed()) form.dispatchEvent(new Event('change', {bubbles:true}));
      if (mode === 'tap') nowOrd = last() ? last().m : -1;
      paintControls(); paintGuide();
      if (page && page !== pageNo) { pageNo = page; drawPage(); } else { paintBoxes(); reveal(); }
    }
    function paintControls() {
      const paused = el().paused, next = target(), tap = mode === 'tap';
      form.dataset.mode = mode;
      host.querySelectorAll('[data-sync-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.syncMode === mode)));
      q('nudge').hidden = tap; q('undo').hidden = q('lines').hidden = !tap;
      q('undo').disabled = !anchors.length;
      q('play').innerHTML = '<i class="ph ph-' + (paused ? 'play' : 'pause') + '" aria-hidden="true"></i><span>' + (paused ? '재생' : '일시정지') + '</span>';
      q('rate').setAttribute('aria-pressed', String(slow)); q('lines').setAttribute('aria-pressed', String(lines));
      q('offset').textContent = seconds(offset);
      q('earlier').disabled = offset <= -S.MAX_OFFSET + 1e-9; q('later').disabled = offset >= S.MAX_OFFSET - 1e-9;
      const big = tapButton.querySelector('strong'), small = tapButton.querySelector('small');
      if (!tap || paused) { big.textContent = paused ? 'MR 재생' : '일시정지'; small.textContent = tap ? (anchors.length ? '이어서 찍기' : '재생한 뒤 마디마다 눌러요') : '표시가 맞는지 확인해요'; tapButton.disabled = false; }
      else if (next == null) { big.textContent = '끝까지 찍었어요'; small.textContent = '확인하거나 저장해 주세요'; tapButton.disabled = true; }
      else { big.textContent = lines && anchors.length ? '다음 줄' : '다음 마디'; small.textContent = S.label(seq, next); tapButton.disabled = false; }
      tapButton.dataset.target = next == null ? '' : String(next);
      const here = nowOrd >= 0 ? S.label(seq, nowOrd) : '';
      q('now').textContent = tap ? (here ? '지금 ' + here : '시작 전') : here ? '지금 ' + here : '마디 밖';
      q('count').textContent = '찍은 곳 ' + anchors.length;
      q('pageno').textContent = pageNo + ' / ' + v.pages() + '쪽';
      q('prev').disabled = pageNo <= 1; q('next').disabled = pageNo >= v.pages();
      saveButton.disabled = anchors.length < 2 || !changed();
      paintTime();
    }
    function paintTime() { q('time').textContent = VZ.clock(clock()) + ' / ' + VZ.clock(length() || 0); }

    // --- the page with its measure boxes ---
    async function drawPage() {
      const n = pageNo, mine = ++drawing;
      paintControls();
      let aspect = aspects.get(n);
      try { if (!aspect) { aspect = await v.pageAspect(n); aspects.set(n, aspect); } } catch { return; }
      if (shut || mine !== drawing) return;
      // Phones fit the page width (and scroll down); from tablet width the whole page is in view, as in the viewer.
      const room = Math.max(160, stageEl.clientWidth - 16), width = innerWidth >= 700 ? Math.min(room, Math.max(160, (stageEl.clientHeight - 16) / aspect)) : room;
      const picture = document.createElement('canvas');
      try { await v.draw(n, picture, width); } catch { if (!shut && mine === drawing) say('악보를 그리지 못했어요. 창을 닫고 다시 열어 주세요.'); return; }
      if (shut || mine !== drawing) return;
      pageEl.style.width = width + 'px'; pageEl.style.height = width * aspect + 'px';
      canvasEl.width = picture.width; canvasEl.height = picture.height; canvasEl.getContext('2d').drawImage(picture, 0, 0); picture.width = picture.height = 0;
      pageEl.hidden = false; pageEl.dataset.page = String(n);
      c.see(n, canvasEl, aspect); shownPage = n;
      stageEl.scrollTop = 0; paintBoxes(); reveal();
    }
    function paintBoxes() {
      svgEl.replaceChildren();
      const pg = shownPage ? c.geometry(shownPage) : null, aspect = aspects.get(shownPage);
      if (!pg || !aspect) return;
      const H = 1000 * aspect, pad = pg.staff * (pg.snapped ? .25 : .6), size = Math.max(24, Math.min(34, pg.staff * H * .9)), next = mode === 'tap' ? target() : null;
      svgEl.setAttribute('viewBox', '0 0 1000 ' + H);
      for (const sys of pg.systems) {
        const y = Math.max(0, sys.top - pad) * H, h = Math.min(1, sys.bottom + pad) * H - y;
        for (const m of sys.measures) {
          const ord = ordOf.get(m.index), x = m.x0 * 1000, w = Math.max(0, m.x1 - m.x0) * 1000, name = S.label(seq, ord);
          const state = ord === nowOrd ? 'now' : ord === next ? 'next' : built?.occurrences(ord) ? 'done' : 'todo';
          svgEl.append(node('rect', {class:'score-sync-box', 'data-ord':ord, 'data-number':m.number, 'data-state':state, role:'button', 'aria-label':name + (state === 'now' ? ' (지금)' : ''), x:x.toFixed(2), y:y.toFixed(2), width:w.toFixed(2), height:h.toFixed(2), rx:6}));
          const text = node('text', {class:'score-measure-number', x:(x + 8).toFixed(2), y:Math.max(size, y - size * .3).toFixed(2), 'font-size':size.toFixed(1)});
          text.textContent = m.last ? m.number + '–' + m.last : m.number; svgEl.append(text);
        }
      }
    }
    /** Keeps the line of the measure in question on screen (phones scroll down a page). */
    function reveal() {
      const ord = nowOrd >= 0 ? nowOrd : mode === 'tap' ? target() : -1, m = seq[ord], pg = shownPage ? c.geometry(shownPage) : null;
      if (!m || !pg || m.page !== shownPage) return;
      const sys = pg.systems[m.system]; if (!sys) return;
      const top = pageEl.offsetTop + (sys.top - .04) * pageEl.clientHeight, bottom = pageEl.offsetTop + (sys.bottom + .04) * pageEl.clientHeight;
      if (top >= stageEl.scrollTop && bottom <= stageEl.scrollTop + stageEl.clientHeight) return;
      stageEl.scrollTo({top:Math.max(0, top - stageEl.clientHeight * .25), behavior:'smooth'});
    }
    function turn(n) { if (n < 1 || n > v.pages() || n === pageNo) return; pageNo = n; drawPage(); }

    // --- tapping ---
    /** One anchor: measure m starts at this second of the MR (real MR time, whatever the speed). */
    function tap(m, time = clock()) {
      if (mode !== 'tap' || m == null) return;
      const at = Math.round(time * 100) / 100;
      if (last() && at < last().t + TAP_GAP) { say('MR이 마지막으로 찍은 곳(' + VZ.clock(last().t) + ')보다 앞이에요. 그 뒤에서 눌러 주세요.'); return; }
      if (anchors.length >= S.MAX_ANCHORS) { say('여기까지만 찍을 수 있어요 (' + S.MAX_ANCHORS + '곳).'); return; }
      anchors.push({t:at, m});
      update({page:seq[m].page});
    }
    function undo() {
      const gone = anchors.pop();
      if (!gone) return;
      // Two seconds back, but not before the tap that is now the last one (the next tap has to come after it).
      seek(Math.max(0, gone.t - BACK, last() ? last().t + .02 : 0));
      update({page:last() ? seq[last().m].page : seq[gone.m].page});
    }
    async function restart() {
      if (mode === 'tap' && anchors.length) {
        player.pause();
        if (!await VZ.confirm('처음부터 다시 찍기', '지금까지 찍은 ' + anchors.length + '곳을 지우고 처음부터 다시 찍을까요?', {ok:'다시 찍기', danger:true}) || shut) return;
        anchors = [];
      }
      seek(0); update({page:mode === 'tap' ? 1 : pageNo});
    }
    const toggle = () => { if (el().paused) player.play(); else player.pause(); };
    /** The big button (and Space / Enter): a tap while the MR runs, otherwise play or pause. */
    function press() { if (mode === 'tap' && !el().paused) tap(target()); else toggle(); }
    /** A measure box: 지금 여기 while tapping (a repeat, a jump); in 확인 the MR goes there. */
    function boxPress(ord, time) {
      if (mode === 'tap') { tap(ord, time ?? clock()); return; }
      const count = built?.occurrences(ord) || 0;
      if (!count) { say('이 마디는 아직 위치를 몰라요.'); return; }
      const at = built.measureAt(clock()), occurrence = at && at.m === ord ? (at.occurrence + 1) % count : 0;
      seek(built.timeOf(ord, occurrence) + .001); if (el().paused) player.play();
    }
    function setMode(next) {
      if (next === mode) return;
      if (next === 'check' && anchors.length < 2) { say('두 곳 이상 찍은 뒤에 확인할 수 있어요.'); return; }
      mode = next;
      if (mode === 'check') { nowOrd = -1; seek(Math.max(0, anchors[0].t + offset - BACK)); update(); player.play(); }
      else { player.pause(); seek(Math.max(0, last().t - BACK)); update({page:seq[last().m].page}); }
    }
    function nudge(by) { offset = Math.round(Math.max(-S.MAX_OFFSET, Math.min(S.MAX_OFFSET, offset + by)) * 100) / 100; update(); }
    /** 20 times a second: the time, and in 확인 the measure the MR is in (pages follow it). */
    function tick() {
      if (shut) return;
      paintTime();
      if (mode !== 'check') return;
      const hit = built?.measureAt(clock()) || null, ord = hit ? hit.m : -1;
      if (ord === nowOrd) return;
      nowOrd = ord; paintControls();
      if (ord >= 0 && seq[ord].page !== pageNo) { pageNo = seq[ord].page; drawPage(); } else { paintBoxes(); reveal(); }
    }
    async function save() {
      const entry = (song()?.scores || []).find(s => s.id === score.id);
      if (anchors.length < 2) { say('두 곳 이상 찍어야 저장할 수 있어요.'); return; }
      if (!entry || !tracks().some(x => x.id === t.id && S.fileTrack(x))) { say('악보나 MR이 지워져서 저장할 수 없어요.'); return; }
      if (!length()) { say('MR 길이를 아직 몰라요. MR을 한 번 재생한 뒤 저장해 주세요.'); return; }
      const stored = S.entry({anchors, count:seq.length, duration:length(), offset});
      if (!stored) { say('찍은 순서를 읽을 수 없어요. 되돌리기로 마지막 것을 지우고 다시 찍어 주세요.'); return; }
      const {map, over} = S.withEntry(entry.mrSync, t.id, stored, tracks());
      if (over) {
        player.pause();
        const name = tracks().find(x => x.id === over)?.title || 'MR';
        if (!await VZ.confirm('맞춘 MR 정리', '한 악보는 MR ' + S.MAX_SYNCS + '개까지 맞춰 둘 수 있어요. 가장 오래전에 맞춘 “' + name + '”의 맞춤을 지우고 저장할까요?', {ok:'지우고 저장', danger:true}) || shut) return;
        delete map[over];
      }
      // One small field on the score entry of the song record; the song syncs across devices as it always does.
      const done = VZ.change(d => { const e = (d.songs.find(x => x.id === songId)?.scores || []).find(x => x.id === score.id); if (e) e.mrSync = map; }, {silent:true});
      if (!done || !saved()?.[t.id]) { say('저장하지 못했어요. 찍은 내용은 이 화면에 그대로 있어요. 다시 저장해 주세요.'); return; }
      base = signature(); close(); VZ.toast('마디와 MR을 맞췄어요.');
    }

    const multi = files().length > 1;
    const tool = (name, icon, text, extra = '') => '<button type="button" data-sync-' + name + extra + '>' + (icon ? '<i class="ph ph-' + icon + '" aria-hidden="true"></i>' : '') + '<span>' + text + '</span></button>';
    const body = '<form id="score-sync-form" class="score-sync" data-score-sync data-mode="tap" novalidate>' +
      '<div class="score-sync-head"><div class="score-sync-modes" role="group" aria-label="맞추기 단계"><button type="button" data-sync-mode="tap" aria-pressed="true">찍기</button><button type="button" data-sync-mode="check" aria-pressed="false">확인</button></div>' +
      (multi ? '<select class="score-sync-track" data-sync-track data-q aria-label="맞출 MR">' + files().map(x => '<option value="' + esc(x.id) + '"' + (x.id === t.id ? ' selected' : '') + '>' + esc(x.title || 'MR') + '</option>').join('') + '</select>' : '<span class="score-sync-track-name" data-sync-track-name>' + esc(t.title || 'MR') + '</span>') + '</div>' +
      '<p class="score-sync-guide" data-sync-guide role="status"></p>' +
      '<div class="score-sync-status"><strong data-sync-now>시작 전</strong><span class="score-sync-time" data-sync-time role="timer">0:00 / 0:00</span><span data-sync-count>찍은 곳 0</span>' +
      '<span class="score-sync-pages"><button type="button" class="icon-btn" data-sync-prev aria-label="이전 쪽"><i class="ph ph-caret-left" aria-hidden="true"></i></button><span data-sync-pageno></span><button type="button" class="icon-btn" data-sync-next aria-label="다음 쪽"><i class="ph ph-caret-right" aria-hidden="true"></i></button></span></div>' +
      '<div class="score-sync-stage" data-sync-stage><div class="score-sync-page" data-sync-page hidden><canvas aria-hidden="true"></canvas><svg xmlns="' + NS + '" data-sync-boxes role="group" aria-label="마디"></svg></div></div>' +
      '<div class="score-sync-panel"><div class="score-sync-tools" role="group" aria-label="맞추기 도구">' + tool('restart', 'skip-back', '처음부터') + tool('undo', 'arrow-counter-clockwise', '되돌리기') + tool('play', 'play', '재생') +
      tool('rate', 'gauge', '0.75×', ' aria-pressed="false" aria-label="느리게 0.75배"') + tool('lines', 'rows', '줄 시작만 찍기', ' aria-pressed="false"') + '</div>' +
      '<div class="score-sync-nudge" data-sync-nudge role="group" aria-label="전체 앞당기기와 늦추기" hidden>' + tool('earlier', 'caret-left', '전체 앞당기기') + '<output data-sync-offset aria-label="전체 이동">0.00초</output>' + tool('later', 'caret-right', '전체 늦추기') + '</div>' +
      '<button type="button" class="score-sync-tap" data-sync-tap autofocus><strong>MR 재생</strong><small></small></button></div>' +
      '</form>';
    const foot = '<div class="btn-row"><button type="button" class="btn ghost" data-close>취소</button><button type="submit" form="score-sync-form" class="btn" data-sync-save disabled>저장</button></div>';
    sheet = VZ.sheet({title:'마디와 MR 맞추기', body, foot, dirtyState:() => changed() ? 'changed' : '',
      onClose:() => { shut = true; clearInterval(timer); clearTimeout(sayTimer); clearTimeout(resizeTimer); observer?.disconnect(); try { player?.destroy(); } catch {} sheet = null; if (alive) { refresh(); c.menu(); c.repaint(); } },
      onMount:(node_, done) => {
        host = node_; close = done; host.classList.add('score-sync-sheet');
        form = host.querySelector('form'); stageEl = q('stage'); pageEl = q('page'); canvasEl = pageEl.querySelector('canvas'); svgEl = q('boxes'); tapButton = q('tap'); saveButton = q('save');
        load(t);
        form.onsubmit = e => { e.preventDefault(); save(); };
        // A tap counts when the finger lands (a click comes only when it lifts); play and pause need the click (iPhone).
        tapButton.addEventListener('pointerdown', e => { downTap = false; if (e.button > 0 || mode !== 'tap' || el().paused) return; downTap = true; tap(target()); });
        tapButton.addEventListener('click', e => { if (downTap) { downTap = false; return; } if (keyTap && e.detail === 0) { keyTap = false; return; } press(); });
        host.addEventListener('keydown', e => {
          if (e.key !== ' ' && e.key !== 'Enter' || e.repeat || e.altKey || e.ctrlKey || e.metaKey) return;
          const on = e.target.closest?.('button,select,input,textarea,a');
          if (on && on !== tapButton) return; // other buttons keep their own keys
          e.preventDefault(); keyTap = true; setTimeout(() => { keyTap = false; }, 600); press();
        });
        svgEl.addEventListener('pointerdown', e => { boxTime = e.target.closest?.('[data-ord]') ? clock() : null; });
        svgEl.addEventListener('click', e => { const r = e.target.closest?.('[data-ord]'); if (r) boxPress(Number(r.dataset.ord), boxTime); boxTime = null; });
        q('restart').onclick = restart; q('undo').onclick = undo; q('play').onclick = toggle;
        q('rate').onclick = () => { slow = !slow; el().playbackRate = slow ? SLOW : 1; paintControls(); };
        q('lines').onclick = () => { lines = !lines; update(); };
        q('earlier').onclick = () => nudge(-S.STEP); q('later').onclick = () => nudge(S.STEP);
        q('prev').onclick = () => turn(pageNo - 1); q('next').onclick = () => turn(pageNo + 1);
        host.querySelectorAll('[data-sync-mode]').forEach(b => b.onclick = () => setMode(b.dataset.syncMode));
        const pick = q('track');
        if (pick) pick.onchange = async () => {
          const next = files().find(x => x.id === pick.value);
          if (!next || next.id === t.id) return;
          player.pause();
          if (changed() && !await VZ.confirm('MR 바꾸기', '지금 찍은 내용은 저장되지 않아요. 다른 MR로 바꿀까요?', {ok:'바꾸기', danger:true})) { pick.value = t.id; return; }
          if (shut) return;
          slow = false; load(next); drawPage();
        };
        timer = setInterval(tick, 50);
        requestAnimationFrame(() => { if (!shut) drawPage(); });
        if (window.ResizeObserver) { let width = 0; observer = new ResizeObserver(() => { const w = stageEl.clientWidth; if (!width) { width = w; return; } if (Math.abs(w - width) < 8) return; width = w; clearTimeout(resizeTimer); resizeTimer = setTimeout(() => { if (!shut) drawPage(); }, 150); }); observer.observe(stageEl); }
      }});
  }

  return {
    refresh, menu, list, marked,
    /** The measure (file index) sounding now on page n, or null. */
    now:n => now && seq[now.m]?.page === n ? seq[now.m].index : null,
    destroy() { alive = false; drop(); offTick?.(); offChange?.(); try { points?.destroy(); } catch {} try { audio()?.setPlan?.(null); } catch {} try { sheet?.close(); } catch {}
      stage.removeEventListener('pointerdown', down, true); stage.removeEventListener('pointermove', move, true); stage.removeEventListener('pointerup', up, true); stage.removeEventListener('pointercancel', up, true); stage.removeEventListener('scroll', scrolled);
      syncButton?.remove(); followButton?.remove(); }
  };
}
window.VzipScoreSync = {attach};
})();
