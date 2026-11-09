/* VOCAL.zip searchable picker: long choice lists (songs above all) open as a full page with a search
 * field instead of the phone's wheel. The real <select> stays in the form (value, change events, VZ.readSong), only
 * visually replaced by a button, so every screen keeps working the same way and keyboard/automation still use it.
 * Applied to every select[data-song-select] and select[data-pick]; a select opts out with data-native. */
(() => {
'use strict';
const VZ = window.VZ;
if (!VZ) return;
const esc = VZ.esc;
const norm = s => String(s || '').toLowerCase().replace(/\s+/g, '');

/** Searchable list page. options: [{value, label, sub?}]; resolves the chosen value, or null when closed. */
VZ.pickSheet = ({title, options, value = '', placeholder = '검색'}) => new Promise(resolve => {
  let picked = null;
  const search = options.length > 7;
  (search ? VZ.sheet : VZ.menu)({title, label:title, body:(search ? '<div class="search pick-search"><i class="ph ph-magnifying-glass"></i><input type="search" data-pick-q placeholder="' + esc(placeholder) + '" aria-label="' + esc(title) + ' 검색" autocomplete="off"></div>' : '') +
      '<div class="list pick-list" role="listbox" aria-label="' + esc(title) + '">' + options.map((o, i) => '<button type="button" class="item pick-row" role="option" data-i="' + i + '" aria-selected="' + (o.value === value) + '"><span class="item-main"><span class="item-title">' + esc(o.label) + '</span>' + (o.sub ? '<span class="item-sub">' + esc(o.sub) + '</span>' : '') + '</span>' + (o.value === value ? '<i class="ph ph-check pick-check"></i>' : '') + '</button>').join('') + '</div>' +
      '<p class="small muted pick-none" hidden>찾는 항목이 없어요.</p>',
    onMount:(el, close) => {
      const q = el.querySelector('[data-pick-q]'), rows = [...el.querySelectorAll('.pick-row')], none = el.querySelector('.pick-none');
      const keys = options.map(o => norm(o.label + ' ' + (o.sub || '') + ' ' + (o.keywords || '')));
      if (q) q.oninput = () => {
        const t = norm(q.value); let shown = 0;
        rows.forEach((r, i) => { const on = !t || options[i].always || keys[i].includes(t); r.hidden = !on; if (on && !options[i].always) shown++; });
        none.hidden = !!shown || !t;
      };
      el.querySelector('.pick-list').onclick = e => { const r = e.target.closest('.pick-row'); if (!r) return; picked = options[r.dataset.i].value; close(); VZ.toast('선택했어요.'); };
      // Start at the current choice in a long list.
      el.querySelector('[aria-selected="true"]')?.scrollIntoView({block:'center'});
      if (q && !matchMedia('(pointer: coarse)').matches) q.focus();
    },
    onClose:() => resolve(picked)});
});

const label = sel => sel.selectedOptions[0]?.textContent || '';
const songOf = id => VZ.song?.(id);
const name = sel => sel.dataset.pickTitle || sel.getAttribute('aria-label') || sel.closest('label')?.querySelector('span')?.textContent || '선택';
function enhance(sel) {
  if (sel.dataset.picker || sel.hasAttribute('data-native') || sel.multiple) return;
  sel.dataset.picker = '1';
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'pick-btn';
  const sync = () => {
    // Named by its content (field name for screen readers + value), not aria-label: the select keeps the field's label.
    btn.innerHTML = '<span class="sr-only">' + esc(name(sel)) + ', </span><span class="pick-val' + (sel.value ? '' : ' muted') + '">' + esc(label(sel)) + '</span><i class="ph ph-caret-down" aria-hidden="true"></i>';
    btn.disabled = sel.disabled;
  };
  // Code that sets select.value directly fires no event: keep the button in step anyway.
  const proto = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  Object.defineProperty(sel, 'value', {configurable:true, get() { return proto.get.call(this); }, set(v) { proto.set.call(this, v); sync(); }});
  sel.addEventListener('change', sync); sel.addEventListener('input', sync);
  sel.classList.add('pick-native'); sel.tabIndex = -1;
  sel.after(btn); sync(); // after: the <label> keeps naming the select (its first control)
  btn.onclick = async e => {
    e.preventDefault();
    const song = sel.matches('[data-song-select]') || sel.dataset.pick === 'song';
    const options = [...sel.options].filter(o => !o.disabled).map(o => {
      const s = song && songOf(o.value);
      return {value:o.value, label:o.textContent, sub:s?.show || '', keywords:s ? (s.aliases || []).join(' ') : '', always:o.value === '' || o.value === '__new' || o.value === '__none'};
    });
    const title = name(sel);
    const v = await VZ.pickSheet({title, options, value:sel.value, placeholder:song ? '곡 제목·작품 검색' : '검색'});
    if (v == null || v === sel.value) { btn.focus(); return; }
    sel.value = v; sel.dispatchEvent(new Event('input', {bubbles:true})); sel.dispatchEvent(new Event('change', {bubbles:true}));
    btn.focus();
  };
}
const scan = root => root.querySelectorAll?.('select[data-song-select],select[data-pick]').forEach(enhance);
new MutationObserver(list => { for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches('select[data-song-select],select[data-pick]')) enhance(n); else scan(n); } })
  .observe(document.documentElement, {childList:true, subtree:true});
scan(document);
})();
