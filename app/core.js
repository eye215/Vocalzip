/* VOCAL.zip v6 core: data store (same localStorage schema as v5), helpers, sheet/toast, router. */
(() => {
'use strict';
const KEY = 'vocal-zip_mvp_v1';
const ARRAYS = ['categories', 'songs', 'lessons', 'assignments', 'practices', 'comparisonReports'];
const DEFAULTS = {categories:[{id:'c1',name:'발성',items:['립트릴','허밍','패사지오']},{id:'c2',name:'호흡',items:['복식호흡','호흡 유지']},{id:'c3',name:'곡 연습',items:['음정 교정','프레이징','감정 표현']}],songs:[],lessons:[],assignments:[],practices:[],comparisonReports:[]};
const VZ = window.VZ = {version:'6.0'};

/* ---------- data ---------- */
function read() {
  let data = null;
  try { data = JSON.parse(localStorage.getItem(KEY)); } catch { data = null; }
  if (!data || typeof data !== 'object') data = structuredClone(DEFAULTS);
  for (const k of ARRAYS) if (!Array.isArray(data[k])) data[k] = k === 'categories' && !data[k] ? structuredClone(DEFAULTS.categories) : [];
  return data;
}
let db = read();
Object.defineProperty(VZ, 'db', {get: () => db});
let writing = false;
/** Apply a mutation; on storage failure restore the previous state and report false. */
VZ.change = (mutate, {silent} = {}) => {
  const previous = structuredClone(db);
  try {
    mutate(db);
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (error) {
    db = previous;
    VZ.toast('저장하지 못했어요. 저장 공간을 확인하고 다시 시도해 주세요.', 'error');
    console.error(error);
    return false;
  }
  writing = true;
  try { window.dispatchEvent(new CustomEvent('vzip:data-changed', {detail:{source:'v6'}})); } finally { writing = false; }
  if (!silent) VZ.render();
  return true;
};
function reload() { db = read(); VZ.softRender(); }
window.addEventListener('vzip:data-changed', () => { if (!writing) reload(); });
window.addEventListener('storage', e => { if (e.key === KEY) reload(); });

/* ---------- helpers ---------- */
VZ.uid = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
VZ.esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2, '0');
VZ.ymd = (d = new Date()) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
VZ.today = () => VZ.ymd(new Date());
VZ.parseYmd = s => { const [y, m, d] = String(s || '').split('-').map(Number); return y ? new Date(y, (m || 1) - 1, d || 1) : null; };
const DOW = ['일','월','화','수','목','금','토'];
VZ.dateLabel = (s, withYear) => { const d = VZ.parseYmd(s); if (!d) return '날짜 미상'; return (withYear || d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() + '년 ' : '') + (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + DOW[d.getDay()] + ')'; };
VZ.msLabel = ms => Number.isFinite(ms) && ms > 0 ? VZ.dateLabel(VZ.ymd(new Date(ms))) : '날짜 미상';
VZ.daysBetween = (a, b) => Math.round((VZ.parseYmd(b) - VZ.parseYmd(a)) / 86400000);
VZ.relDay = s => { const n = VZ.daysBetween(VZ.today(), s); if (!Number.isFinite(n)) return ''; return n === 0 ? '오늘' : n === 1 ? '내일' : n === -1 ? '어제' : n > 0 ? n + '일 후' : -n + '일 전'; };
VZ.dday = s => { const n = VZ.daysBetween(VZ.today(), s); return n === 0 ? 'D-DAY' : n > 0 ? 'D-' + n : 'D+' + -n; };
VZ.clock = sec => { sec = Math.max(0, Math.round(sec || 0)); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return (h ? h + ':' + pad(m) : m) + ':' + pad(s); };
VZ.minutes = min => { min = Math.round(min || 0); return min >= 60 ? Math.floor(min / 60) + '시간' + (min % 60 ? ' ' + min % 60 + '분' : '') : min + '분'; };
VZ.size = b => b > 1048576 ? (b / 1048576).toFixed(b > 104857600 ? 0 : 1) + 'MB' : Math.max(1, Math.round(b / 1024)) + 'KB';
VZ.timeRange = l => [l.startTime, l.endTime].filter(Boolean).join(' – ');

/* ---------- domain ---------- */
VZ.song = id => db.songs.find(s => s.id === id);
VZ.songTitle = id => { const s = VZ.song(id); return s ? s.title : ''; };
VZ.songLabel = s => s ? s.title + (s.show ? ' — ' + s.show : '') : '';
/** Legacy lessons were written after the lesson happened, so a missing status means completed. */
VZ.lessonStatus = l => l.status || 'done';
VZ.lessonSongIds = l => [...new Set([...(l.songIds || []), l.songId].filter(Boolean))];
VZ.statusLabel = {scheduled:'예정', done:'완료', cancelled:'취소'};
VZ.statusBadge = st => '<span class="badge ' + ({scheduled:'accent', done:'ok', cancelled:'danger'}[st] || '') + '">' + VZ.statusLabel[st] + '</span>';
VZ.lessonSort = (a, b) => (a.date || '').localeCompare(b.date || '') || (a.startTime || '').localeCompare(b.startTime || '');
VZ.nextLesson = () => db.lessons.filter(l => VZ.lessonStatus(l) === 'scheduled' && (l.date || '') >= VZ.today()).sort(VZ.lessonSort)[0];
VZ.taskLessons = t => t.lessonIds || (t.lessonId ? [t.lessonId] : []);
VZ.taskSongId = t => t.songId || VZ.taskLessons(t).map(id => db.lessons.find(l => l.id === id)?.songId).find(Boolean) || '';
VZ.practiceMinutes = p => Number(p.minutes) || 0;
/** Practice time = practice records + recordings/imports that are not already inside a
 * practice record (its minutes cover them) or a lesson (lesson time is not practice). */
VZ.timeEntries = (media = []) => {
  const inPractice = new Set(db.practices.flatMap(p => p.mediaIds || []));
  const inLesson = new Set(db.lessons.flatMap(l => (l.recordings || []).map(r => r.id)));
  const out = db.practices.map(p => ({date:p.date, minutes:VZ.practiceMinutes(p), songId:p.practiceMode === 'training' ? '' : p.songId || '', training:p.practiceMode === 'training', kind:'practice', ref:p}));
  for (const m of media) {
    if (inPractice.has(m.id) || inLesson.has(m.id) || m.source === 'lesson') continue;
    const seconds = Number(m.durationSeconds) || 0, date = VZ.media?.dateOf(m);
    if (seconds > 0 && date) out.push({date, minutes:seconds / 60, songId:m.songId || '', training:false, kind:'recording', ref:m});
  }
  return out;
};
VZ.sumMinutes = entries => entries.reduce((a, e) => a + e.minutes, 0);
VZ.addSong = (title, show = '') => {
  title = String(title || '').trim();
  if (!title) return null;
  const existing = db.songs.find(s => s.title.trim().toLowerCase() === title.toLowerCase() && (s.show || '') === show);
  if (existing) return existing;
  const song = {id: VZ.uid(), title, show: String(show || '').trim()};
  return VZ.change(d => d.songs.push(song), {silent:true}) ? song : null;
};
/** Last activity per song id across practices, recordings and lessons. */
VZ.songActivity = (media = []) => {
  const map = new Map();
  const today = VZ.today();
  const bump = (id, date) => { if (!id || !date || date > today) return; if (!map.has(id) || map.get(id) < date) map.set(id, date); };
  db.practices.forEach(p => bump(p.songId, p.date));
  db.lessons.filter(l => VZ.lessonStatus(l) === 'done').forEach(l => VZ.lessonSongIds(l).forEach(id => bump(id, l.date)));
  media.forEach(m => bump(m.songId, VZ.media?.dateOf(m) || ''));
  return map;
};

/* ---------- UI primitives ---------- */
let toastTimer;
VZ.toast = (message, kind = '') => {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast ' + kind; el.setAttribute('role', kind === 'error' ? 'alert' : 'status'); el.textContent = message;
  document.body.append(el); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), kind === 'error' ? 5000 : 2600);
};
window.vzipNotice = m => VZ.toast(m);
window.vzipSetPracticeBusy = () => {};

const sheets = [];
/** Bottom sheet. body: html string. Returns {el, close}. onClose fires once. */
VZ.sheet = ({title, body, foot = '', onMount, onClose, label}) => {
  const previous = document.activeElement;
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = '<section class="sheet" role="dialog" aria-modal="true" aria-label="' + VZ.esc(label || title) + '"><div class="sheet-grab"></div><header class="sheet-head"><h2>' + VZ.esc(title) + '</h2><button type="button" class="icon-btn" data-close aria-label="닫기"><i class="ph ph-x"></i></button></header><div class="sheet-body">' + body + '</div>' + (foot ? '<footer class="sheet-foot">' + foot + '</footer>' : '') + '</section>';
  const el = back.querySelector('.sheet');
  let closed = false;
  const close = () => {
    if (closed) return; closed = true; back.remove();
    sheets.splice(sheets.indexOf(api), 1);
    document.body.style.overflow = sheets.length ? 'hidden' : '';
    onClose?.(); if (previous?.isConnected) previous.focus();
    // A refresh that waited for this sheet runs now.
    if (!sheets.length && VZ.pendingRender) setTimeout(() => VZ.softRender(), 50);
  };
  const api = {el, close};
  back.addEventListener('click', e => { if (e.target === back || e.target.closest('[data-close]')) close(); });
  back.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') {
      const nodes = [...el.querySelectorAll('button,input,select,textarea,a[href],[tabindex]:not([tabindex="-1"])')].filter(n => !n.disabled && n.offsetParent);
      if (!nodes.length) return;
      if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes.at(-1).focus(); }
      else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0].focus(); }
    }
  });
  document.body.append(back); document.body.style.overflow = 'hidden';
  sheets.push(api);
  onMount?.(el, close);
  // Keep a focused field above the iOS keyboard.
  el.addEventListener('focusin', e => { if (e.target.matches('input,textarea,select')) setTimeout(() => e.target.scrollIntoView({block:'center', behavior:'smooth'}), 300); });
  (el.querySelector('[autofocus]') || el.querySelector('[data-close]')).focus({preventScroll:true});
  return api;
};
VZ.closeSheets = () => [...sheets].forEach(s => s.close());
VZ.confirm = (title, message, {ok = '확인', danger} = {}) => new Promise(resolve => {
  let result = false;
  VZ.sheet({title, label:title, body:'<p class="muted">' + VZ.esc(message) + '</p>',
    foot:'<div class="btn-row"><button type="button" class="btn ghost" data-close>취소</button><button type="button" class="btn ' + (danger ? 'danger' : '') + '" data-ok>' + VZ.esc(ok) + '</button></div>',
    onMount:(el, close) => el.parentNode.querySelector('[data-ok]').onclick = () => { result = true; close(); },
    onClose:() => resolve(result)});
});
VZ.empty = (icon, text, action = '') => '<div class="empty"><i class="ph ph-' + icon + '"></i><div>' + VZ.esc(text) + '</div>' + action + '</div>';

/** Song <select> with "새 곡 추가" option; returns html. Use VZ.readSong(form, name) to resolve. */
VZ.songSelect = (name, value = '', {label = '곡', none = '곡 미지정'} = {}) => {
  const opts = [...db.songs].sort((a, b) => a.title.localeCompare(b.title, 'ko')).map(s => '<option value="' + VZ.esc(s.id) + '"' + (s.id === value ? ' selected' : '') + '>' + VZ.esc(VZ.songLabel(s)) + '</option>').join('');
  const orphan = value && !VZ.song(value) ? '<option value="' + VZ.esc(value) + '" selected>이전에 연결된 곡</option>' : '';
  return '<label class="field"><span>' + VZ.esc(label) + '</span><select name="' + name + '" data-song-select><option value="">' + VZ.esc(none) + '</option>' + opts + orphan + '<option value="__new">+ 새 곡 추가</option></select><input type="text" name="' + name + '__new" placeholder="새 곡 제목" maxlength="150" hidden></label>';
};
document.addEventListener('change', e => {
  const sel = e.target.closest('[data-song-select]'); if (!sel) return;
  const input = sel.parentNode.querySelector('input[name="' + sel.name + '__new"]');
  if (input) { input.hidden = sel.value !== '__new'; if (!input.hidden) input.focus(); }
});
/** Resolve a song select to an id, creating a new song if requested. Returns null on invalid input. */
VZ.readSong = (form, name) => {
  const v = form.elements[name]?.value || '';
  if (v !== '__new') return v;
  const title = form.elements[name + '__new']?.value.trim();
  if (!title) { VZ.toast('새 곡 제목을 입력해 주세요.', 'error'); return null; }
  return VZ.addSong(title)?.id ?? null;
};

/* ---------- router ---------- */
const routes = {};
VZ.route = (name, def) => { routes[name] = def; };
VZ.nav = hash => { if (location.hash === hash) VZ.render(); else location.hash = hash; };
window.vzipNavigate = tab => VZ.nav('#/' + ({lessons:'lessons', practice:'record', media:'library', archive:'growth', manage:'settings'}[tab] || 'home'));
let current = null, guard = null, lastHash = location.hash;
/** A view may block navigation (e.g. while recording). Return a message to confirm. */
VZ.setGuard = fn => { guard = fn; };
function parse() {
  const [path, query = ''] = (location.hash.replace(/^#\/?/, '') || 'home').split('?');
  const [name, ...params] = path.split('/');
  return {name: routes[name] ? name : 'home', params: params.map(decodeURIComponent), query: new URLSearchParams(query)};
}
VZ.render = () => {
  const r = parse(), def = routes[r.name];
  const main = document.getElementById('view');
  if (!main) return;
  const scroll = current && current.name === r.name && current.key === location.hash ? window.scrollY : 0;
  if (current?.def.leave && current.key !== location.hash) current.def.leave();
  current = {name:r.name, def, key:location.hash};
  document.querySelectorAll('.v-nav a').forEach(a => a.toggleAttribute('aria-current', false));
  const tab = def.tab || r.name;
  document.querySelector('.v-nav a[data-nav="' + tab + '"]')?.setAttribute('aria-current', 'page');
  const title = typeof def.title === 'function' ? def.title(r) : def.title;
  const back = def.back ? '<button type="button" class="icon-btn" data-back aria-label="뒤로"><i class="ph ph-caret-left"></i></button>' : '';
  const heading = r.name === 'home' ? '<h1>VOCAL<span class="logo-dot">.</span>zip</h1>' : '<h1>' + VZ.esc(title) + '</h1>';
  const actions = (def.actions ? def.actions(r) : '') + (r.name === 'settings' || def.back ? '' : '<a class="icon-btn" href="#/settings" aria-label="설정"><i class="ph ph-gear-six"></i></a>');
  document.getElementById('top').innerHTML = '<div class="v-top-left">' + back + heading + '</div><div class="v-top-actions">' + actions + '</div>';
  document.title = (r.name === 'home' ? '' : title + ' · ') + 'VOCAL.zip';
  const cloud = document.getElementById('vzip-cloud-root');
  if (cloud && main.contains(cloud)) document.getElementById('vzip-park')?.append(cloud);
  delete main.dataset.dirty;
  main.innerHTML = def.render(r);
  def.mount?.(main, r);
  window.scrollTo(0, scroll);
};
window.addEventListener('hashchange', () => {
  if (guard) {
    const message = guard();
    if (message && !confirm(message)) { history.replaceState(null, '', lastHash || '#/home'); return; }
  }
  guard = null; lastHash = location.hash; VZ.closeSheets(); VZ.render();
});
document.addEventListener('click', e => {
  if (e.target.closest('[data-back]')) { history.length > 1 ? history.back() : VZ.nav('#/home'); }
});
VZ.rerender = () => VZ.render();
/** Background refresh: never wipe what the user is typing or interrupt playback. */
VZ.softRender = () => {
  const main = document.getElementById('view');
  const typing = main?.contains(document.activeElement) && document.activeElement.matches('input,textarea,select');
  if (VZ.isBusy?.() || document.querySelector('.sheet-back') || main?.dataset.dirty || typing || main?.querySelector('.media-open:not([hidden])') || VZ.media?.playing?.() || current?.def.noAutoRefresh) { VZ.pendingRender = true; return; }
  VZ.pendingRender = false; VZ.render();
};
document.addEventListener('input', e => { const main = document.getElementById('view'); if (main?.contains(e.target) && !e.target.matches('[type=search],[data-q]')) main.dataset.dirty = '1'; });
// Icon fonts render private-use glyphs; keep them out of accessible names.
const hideIcons = root => root.querySelectorAll?.('i[class*="ph"]:not([aria-hidden])').forEach(i => i.setAttribute('aria-hidden', 'true'));
new MutationObserver(list => list.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) { if (n.matches('i[class*="ph"]')) n.setAttribute('aria-hidden', 'true'); hideIcons(n); } }))).observe(document.documentElement, {childList:true, subtree:true});
document.addEventListener('DOMContentLoaded', () => hideIcons(document));
})();
