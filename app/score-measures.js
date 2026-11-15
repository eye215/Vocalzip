/* 마디 위치 보기 · 표시한 마디 (악보 뷰어 ⋯ 메뉴). The measure numbers come from the score's conversion
 * (.mxl, app/score-omr.js) through app/score-measure-model.js each time the viewer opens: nothing is saved, so a new
 * conversion simply replaces them. Both items appear only when the conversion's pages are the PDF's pages one to one.
 * - 마디 위치 보기: light numbered boxes under the handwriting (not interactive, scale with the page, never in 무대용
 *   보기 or an exported PDF). The boxes are laid onto the staff lines seen in the rendered page when those can be
 *   found, otherwise drawn where the file says with a little room around. On/off is kept on this device.
 * - 표시한 마디: what is on the score (표기, 스티커 메모, 형광펜, 펜 필기) by page and measure; a row goes to its place.
 * - 마디와 MR 맞추기 (app/score-sync.js) hangs on the same conversion: its menu items, the measure that sounds now
 *   (drawn in this layer), ▶ on the list rows and the press-and-hold menu of a measure box.
 *   window.VzipScoreMeasuresUI.mount(viewer) → {load, shown, changed, destroy} — called by app/score-ink.js */
(() => {
'use strict';
const VZ = window.VZ, M = window.VzipScoreMeasures;
if (!VZ || !M) return;
const esc = VZ.esc, NS = 'http://www.w3.org/2000/svg', ACCENT = '#7a32f5';
const NOTE = '자동 인식 기준이라 어긋날 수 있어요.';
const node = (tag, attrs = {}) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); return n; };

/* One conversion per score; a new one has a new job id / finish time, so it is read again. */
const kept = new Map();
async function conversion(score) {
  const R2 = window.VzipR2, R = window.VzipScoreRange;
  if (!R2?.omr || !R2.enabled?.() || !R?.unzip) return null;
  const job = await R2.omr.status(score.id);
  if (!job || job.status !== 'done' || !job.resultKey) return null;
  const stamp = [job.id, job.finished, job.resultKey, job.resultSize].join(':'), old = kept.get(score.id);
  if (old?.stamp === stamp) return old.layout;
  const res = await fetch(await R2.url(job.resultKey), {cache:'no-store'});
  if (!res.ok) throw Error('변환된 악보를 받지 못했어요 (' + res.status + ').');
  const layout = M.read(await R.unzip(await res.arrayBuffer()));
  kept.set(score.id, {stamp, layout});
  for (const id of [...kept.keys()].slice(0, Math.max(0, kept.size - 6))) kept.delete(id);
  return layout;
}

function mount(v) {
  const {el, box, canvas, stage, score, owner, storage} = v;
  const key = 'vzip_score_measures_v1:' + owner;
  let alive = true, layout = null, shownPage = 0, timer = 0, lookTimer = 0, flashTimer = 0, flashed = null, sheet = null, generation = 0;
  let prefs = {on:false, noted:false};
  try { const p = JSON.parse(storage.getItem(key) || 'null'); if (p && typeof p === 'object') prefs = {on:p.on === true, noted:p.noted === true}; } catch {}
  const remember = () => { try { storage.setItem(key, JSON.stringify(prefs)); } catch {} };
  const aspects = new Map(), plain = new Map(), seen = new Map(); // page → aspect, geometry from the file, geometry on the seen staves
  const layer = node('svg', {'data-ink-measures':'', 'aria-hidden':'true'});
  layer.setAttribute('hidden', ''); canvas.after(layer);
  let toggle = null, list = null, sync = null;

  /** Geometry of a page: on the staves seen in its picture when it was shown, else from the file. */
  const geometry = n => {
    if (!layout) return null;
    if (seen.has(n)) return seen.get(n);
    if (!plain.has(n) && aspects.has(n)) plain.set(n, M.page(layout, n, aspects.get(n)));
    return plain.get(n) || null;
  };
  /** A rendered page as pixels, at most 1000 wide (enough to tell staff lines apart, cheap to scan). */
  function pixels(source) {
    if (!(source.width > 160 && source.height > 160)) return null;
    const k = Math.min(1, 1000 / source.width), small = document.createElement('canvas');
    small.width = Math.round(source.width * k); small.height = Math.round(source.height * k);
    const ctx = small.getContext('2d', {willReadFrequently:true});
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, small.width, small.height); ctx.drawImage(source, 0, 0, small.width, small.height);
    const data = ctx.getImageData(0, 0, small.width, small.height); small.width = small.height = 0;
    return data;
  }
  /** Reads the staves of page n once from a picture of it (the viewer's page, or the 맞추기 screen's), and lays its
   * measures onto them. */
  function see(n, source, aspect) {
    if (!layout || !n || seen.has(n)) return;
    aspects.set(n, aspect); plain.delete(n);
    const base = geometry(n); if (!base) return;
    let out = base;
    try { const image = pixels(source); if (image) out = M.snap(base, M.findStaves(image)); } catch {}
    seen.set(n, out);
  }
  function look(n) { if (n === v.page() && n === shownPage) see(n, canvas, v.aspect()); }
  /** Room drawn around a system's staff lines: little on staves that were seen, more when placed from the file alone. */
  const room = pg => pg.staff * (pg.snapped ? .25 : .6);
  /** The measure box under a point of the screen on the page now shown, or null. */
  function boxAt(x, y) {
    const n = v.page(), pg = shownPage === n ? geometry(n) : null, r = box.getBoundingClientRect();
    if (!pg || !(r.width > 0 && r.height > 0)) return null;
    const fx = (x - r.left) / r.width, fy = (y - r.top) / r.height, pad = room(pg);
    for (const sys of pg.systems) if (fy >= sys.top - pad && fy <= sys.bottom + pad) for (const m of sys.measures) if (fx >= m.x0 && fx < m.x1) return {page:n, index:m.index};
    return null;
  }
  /** Brings a measure of the page now shown into view when its line is not fully on screen. */
  function show(index) {
    const pg = shownPage === v.page() ? geometry(shownPage) : null, sys = pg?.systems.find(s => s.measures.some(m => m.index === index));
    if (!sys) return;
    const pad = room(pg) + .02, top = box.offsetTop + (sys.top - pad) * box.clientHeight, bottom = box.offsetTop + (sys.bottom + pad) * box.clientHeight;
    if (top >= stage.scrollTop && bottom <= stage.scrollTop + stage.clientHeight) return;
    stage.scrollTo({top:Math.max(0, top - stage.clientHeight * .25), behavior:'smooth'});
  }
  const markName = id => (v.markers() || []).find(m => m.id === id)?.name || window.VzipScoreInkSettings?.MARKERS?.find(m => m.id === id)?.name || '';
  /** Page sizes of every page that carries something, so those pages can be read without being shown. */
  async function sizes(rows) {
    for (const n of new Set(rows.map(s => s.page))) if (!aspects.has(n) && Number.isInteger(n) && n >= 1 && n <= v.pages()) { try { aspects.set(n, await v.pageAspect(n)); } catch {} if (!alive) return; }
  }
  const summarize = rows => M.summary(geometry, rows, {markName});

  function paintLayer() {
    const n = v.page(), pg = shownPage === n ? geometry(n) : null, aspect = v.aspect(), H = 1000 * aspect;
    layer.replaceChildren();
    const boxes = prefs.on && !!pg, flash = flashed?.page === n && pg ? flashed : null, live = pg ? sync?.now(n) ?? null : null;
    layer.toggleAttribute('hidden', !boxes && !flash && live === null);
    layer.dataset.on = String(boxes); layer.dataset.snapped = String(!!pg?.snapped);
    if (!boxes && !flash && live === null) return;
    layer.setAttribute('viewBox', '0 0 1000 ' + H);
    // Seen staff lines: one staff space around. From the file alone: more room, as the place is less exact.
    const pad = room(pg), size = Math.max(24, Math.min(34, pg.staff * H * .9));
    pg.systems.forEach((sys, si) => {
      const y = Math.max(0, sys.top - pad) * H, h = Math.min(1, sys.bottom + pad) * H - y;
      sys.measures.forEach((m, mi) => {
        const x = m.x0 * 1000, w = Math.max(0, m.x1 - m.x0) * 1000, hit = flash?.measures.includes(m.index);
        if (boxes) {
          layer.append(node('rect', {class:'score-measure-box', 'data-measure':m.index, 'data-number':m.number, 'data-system':si, x:x.toFixed(2), y:y.toFixed(2), width:w.toFixed(2), height:h.toFixed(2), rx:6, 'data-tone':(m.index % 2) ? 'b' : 'a'}));
          const label = node('text', {class:'score-measure-number', x:(x + 8).toFixed(2), y:Math.max(size, y - size * .3).toFixed(2), 'font-size':size.toFixed(1)});
          label.textContent = m.last ? m.number + '–' + m.last : m.number; layer.append(label);
        }
        if (hit) layer.append(node('rect', {class:'score-measure-flash', 'data-flash':m.index, x:x.toFixed(2), y:y.toFixed(2), width:w.toFixed(2), height:h.toFixed(2), rx:6}));
        // 재생 위치 따라가기: the measure sounding now, lightly.
        if (m.index === live) layer.append(node('rect', {class:'score-measure-now', 'data-now':m.index, 'data-number':m.number, x:x.toFixed(2), y:y.toFixed(2), width:w.toFixed(2), height:h.toFixed(2), rx:6}));
      });
    });
  }
  function syncMenu(count) {
    const ok = !!layout;
    if (!ok) { toggle?.remove(); list?.remove(); toggle = list = null; sync?.menu(null); return; }
    const actions = el.querySelector('.score-ink-actions'); if (!actions) return;
    if (!toggle) {
      const make = (name, icon) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'icon-btn'; b.setAttribute('data-ink-' + name, ''); b.innerHTML = '<i class="ph ph-' + icon + '" aria-hidden="true"></i><span class="score-ink-menu-label"></span>'; return b; };
      toggle = make('measure-boxes', 'columns'); list = make('measure-list', 'list-numbers');
      toggle.onclick = () => setOn(!prefs.on); list.onclick = openList;
      actions.append(toggle, list);
    }
    const label = (b, t) => { b.setAttribute('aria-label', t); b.title = t; b.querySelector('.score-ink-menu-label').textContent = t; };
    label(toggle, '마디 위치 보기'); toggle.setAttribute('aria-pressed', String(prefs.on));
    if (count !== undefined) list.dataset.count = String(count);
    label(list, '표시한 마디' + (Number(list.dataset.count) > 0 ? ' ' + list.dataset.count : ''));
    sync?.menu(actions);
  }
  function setOn(next) {
    prefs.on = !!next;
    if (prefs.on && !prefs.noted) { prefs.noted = true; VZ.toast(NOTE); }
    remember(); look(v.page()); syncMenu(); paintLayer();
  }
  async function count() {
    if (!layout || !alive) return;
    try {
      const mine = ++generation, rows = v.rows();
      await sizes(rows); if (!alive || mine !== generation || !layout) return;
      syncMenu(summarize(rows).measures);
    } catch {}
  }
  /** Shows the measures of a list row: goes to the page, brings them into view and marks them for a moment. */
  async function reveal(item) {
    try { if (!alive || !await v.go(item.page) || !alive) return; } catch { return; }
    look(item.page);
    const pg = geometry(item.page), hits = (pg?.systems || []).flatMap(s => s.measures.filter(m => item.measures.includes(m.index)).map(m => ({m, s})));
    if (!hits.length) return;
    const top = Math.min(...hits.map(h => h.s.top)), left = Math.min(...hits.map(h => h.m.x0));
    stage.scrollTo({top:Math.max(0, box.offsetTop + top * box.clientHeight - stage.clientHeight * .3), left:stage.scrollWidth - stage.clientWidth > 8 ? Math.max(0, box.offsetLeft + left * box.clientWidth - 24) : stage.scrollLeft});
    clearTimeout(flashTimer); flashed = {page:item.page, measures:item.measures}; paintLayer();
    flashTimer = setTimeout(() => { flashed = null; if (alive) paintLayer(); }, 2200);
  }
  async function openList() {
    if (!layout || !alive || sheet) return;
    let data;
    try {
      await v.outside(); if (!alive) return;
      const rows = v.rows(); await sizes(rows); if (!alive || !layout || sheet) return;
      data = summarize(rows); syncMenu(data.measures);
    } catch { VZ.toast('표시한 마디를 불러오지 못했어요. 다시 시도해 주세요.', 'error'); return; }
    const pages = [...new Set(data.items.map(i => i.page))];
    // With the MR matched to the measures (app/score-sync.js) a row also gets ▶ 이 마디 반복; without it one line says so.
    const extra = data.items.length ? sync?.list(data.items) || null : null;
    const row = (it, i) => '<button type="button" class="score-measure-row" data-measure-row="' + i + '" data-kind="' + it.kind + '"><span class="score-measure-where">' + esc(it.where) + '</span>' +
      '<span class="score-measure-what"><strong>' + esc(it.label) + (it.count > 1 ? ' ' + it.count + '개' : '') + '</strong>' + (it.detail ? '<small>' + esc(it.detail) + '</small>' : '') + '</span>' + (extra?.rows ? '' : '<i class="ph ph-caret-right" aria-hidden="true"></i>') + '</button>';
    const body = '<div class="score-measure-list" data-measure-list><p class="score-measure-note"><i class="ph ph-info" aria-hidden="true"></i><span>변환된 악보의 마디 번호로 모았어요. ' + NOTE + '</span></p>' + (extra?.head || '') +
      (data.items.length ? pages.map(n => '<section aria-label="' + n + '쪽"><h3>' + n + '쪽</h3><div class="score-measure-rows">' + data.items.map((it, i) => it.page !== n ? '' :
        extra?.rows ? '<div class="score-measure-line">' + row(it, i) + extra.rows[i] + '</div>' : row(it, i)).join('') + '</div></section>').join('')
        : '<p class="score-measure-empty" data-measure-empty>아직 표시한 마디가 없어요.<br>악보에 표기·형광펜·메모를 남기면 마디 번호로 여기에 모여요.</p>') + '</div>';
    sheet = VZ.sheet({title:'표시한 마디', body, onClose:() => { sheet = null; }, onMount:(host, close) => {
      host.classList.add('score-measure-sheet');
      host.querySelectorAll('[data-measure-row]').forEach(b => b.onclick = () => { const item = data.items[Number(b.dataset.measureRow)]; close(); reveal(item); });
      extra?.wire(host, close);
    }});
  }

  try { sync = window.VzipScoreSync?.attach({v, layout:() => layout, geometry, see, reveal, repaint:paintLayer, show, boxAt, boxes:() => prefs.on && !!layout, menu:() => syncMenu()}) || null; } catch { sync = null; }
  return {
    /** Reads the conversion once the first page is on screen. Quiet when there is none or it does not fit. */
    async load() {
      let next = null;
      try { next = await conversion(score); } catch { next = null; }
      if (!alive) return;
      try {
        layout = M.fits(next, v.pages()) ? next : null;
        plain.clear(); seen.clear();
        if (layout && shownPage === v.page()) look(shownPage);
        sync?.refresh(); syncMenu(0); paintLayer(); count();
      } catch { layout = null; }
    },
    /** The viewer drew page n. */
    shown(n) {
      if (!alive) return;
      shownPage = n; clearTimeout(lookTimer);
      // With the boxes on the staves are read before they are drawn; otherwise a moment later, off the page turn.
      try { if (prefs.on || flashed || sync?.now(n) != null) look(n); else if (layout) lookTimer = setTimeout(() => { if (alive) try { look(n); } catch {} }, 400); paintLayer(); } catch {}
    },
    /** Handwriting changed (or was repainted): the count follows shortly. */
    changed() { if (!alive || !layout || timer) return; timer = setTimeout(() => { timer = 0; count(); }, 300); },
    destroy() { alive = false; clearTimeout(timer); clearTimeout(lookTimer); clearTimeout(flashTimer); try { sheet?.close(); } catch {} try { sync?.destroy(); } catch {} layer.remove(); toggle?.remove(); list?.remove(); }
  };
}
window.VzipScoreMeasuresUI = {mount};
})();
