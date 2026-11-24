/* 듣고 고르기 (#/listen): put on the person's own takes and let them run — "틀어 놓으면 다음 노래 계속 나와서 안 끊기게,
 * 화면 끄거나 다른 앱 써도" (owner, 2026-11-23) — and judge two takes of a song (평가: 두 녹음 중 고르기).
 *   듣고 고르기   예전 vs 요즘 pairs of a song (app/listen-session-model.js): A then B, then the next pair, blind (the days
 *                 are shown once a side is chosen). A choice is a 들어 본 평가 row (app/listen-verdict-model.js make →
 *                 comparisonReports, kind listen-verdict), the same as the 두 녹음 비교 sheet saves; it is quoted on 성장.
 *   그냥 이어 듣기 every take, newest first.
 * ONE <audio> element in the page plays the whole session and moves on by itself ('ended', or the end of 앞 1분), so it
 * keeps going with the screen off or in another app; the lock screen shows the take and has ▶︎/❚❚ · 이전 · 다음 (Media
 * Session). The next takes' sources are fetched ahead so a cloud take starts without a wait. Choosing happens in the app:
 * a pair that went by unanswered waits in 답 안 한 비교, where A and B can be heard again. Nothing but the choices is kept
 * (the session itself lives in memory: a reload ends it). */
(() => {
'use strict';
const V = window.VZ, M = V?.media, S = window.VzipListenSession, L = window.VzipListenVerdict;
if (!V || !M || !S || !L || typeof document === 'undefined') return;
const e = V.esc, title = id => V.songTitle?.(id) || '곡';
const dotted = d => d ? Number(d.slice(5, 7)) + '월 ' + Number(d.slice(8, 10)) + '일' : '날짜 미상';

/* ---------- the takes ---------- */
async function takes() {
  let items = [];
  try { items = await M.list(); } catch { items = M.cached?.() || []; }
  return items.filter(m => m && m.songId && V.song?.(m.songId) && M.songSearchEligible?.(m) !== false && M.dateOf(m) && (m.blob || m.bytes || m.cloud || m.local))
    .map(m => ({id:m.id, songId:m.songId, date:M.dateOf(m), created:Number(m.created) || 0, seconds:Number(m.durationSeconds) || 0, item:m}));
}

/* ---------- the session ---------- */
let session = null;   // {mode, clip, songId, steps:[{pair?, side?, take}], index, answered:Map, missed:[pair], extra}
const audio = document.createElement('audio');
audio.setAttribute('playsinline', ''); audio.preload = 'auto'; audio.dataset.listenAudio = ''; audio.hidden = true;
document.body.appendChild(audio);
// iOS lets a page start sound only straight after a tap. The tap that starts (or resumes) a session plays a moment of
// silence on THIS element at once; from then on the element may start each next take by itself, also with the screen
// off — even when the take is still being fetched from the cloud when the tap's moment has passed.
const SILENCE = 'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
function unlock() { if (audio.getAttribute('src')) return; audio.src = SILENCE; audio.play().catch(() => {}); }
const sources = new Map();   // take id → Promise<{url, revoke}>
const srcOf = item => { if (!sources.has(item.id)) sources.set(item.id, M.src(item).catch(error => { sources.delete(item.id); throw error; })); return sources.get(item.id); };
function release(keep) {
  for (const [id, p] of sources) if (!keep.has(id)) { sources.delete(id); p.then(s => { if (s.revoke) URL.revokeObjectURL(s.url); }, () => {}); }
}
const step = () => session?.steps[session.index] || null;
const sectionOf = take => S.section(take, session?.clip);
const changed = () => { paint(); bar(); };

function start({mode, songId, clip, list}) {
  stop(false);
  const steps = mode === 'pick'
    ? S.pairs(list, {songId, verdicts:L.list(V.db), random:() => Math.random()}).flatMap(pair => [{pair, side:'A', take:pair.a}, {pair, side:'B', take:pair.b}])
    : S.queue(list, {songId}).map(q => ({take:q.take}));
  if (!steps.length) return false;
  session = {mode, clip, songId, steps, index:0, answered:new Map(), missed:[], extra:null, failed:0};
  unlock();
  load(true);
  return true;
}
async function load(play) {
  const s = step(); if (!s) return done();
  const mine = session, at = session.index;
  // The next takes are fetched ahead: a cloud take then starts at once, also with the screen off.
  const ahead = session.steps.slice(at, at + 3).map(x => x.take);
  ahead.slice(1).forEach(t => srcOf(t.item));
  release(new Set(ahead.map(t => t.id)));
  meta();
  try {
    const {url} = await srcOf(s.take.item);
    if (session !== mine || session.index !== at || session.extra) return;
    audio.src = url;
    // Not waited on: some browsers settle play() late (or never, without sound out); the screen follows at once.
    if (play) audio.play().catch(() => {});
  } catch {
    if (session !== mine) return;
    session.failed++;
    next();
    return;
  }
  changed();
}
function next() {
  if (!session) return;
  if (session.flash) { clearTimeout(session.flash.timer); session.flash = null; }
  if (session.extra) { session.extra = null; }
  const s = step();
  // A pair that went by without a choice waits in 답 안 한 비교.
  if (s?.pair && s.side === 'B' && !session.answered.has(s.pair.key) && !session.missed.some(p => p.key === s.pair.key)) session.missed.push(s.pair);
  session.index++;
  if (session.index >= session.steps.length) return done();
  load(true);
}
function prev() {
  if (!session) return;
  if (session.flash) { clearTimeout(session.flash.timer); session.flash = null; }
  session.extra = null;
  session.index = Math.max(0, session.index - (audio.currentTime > 3 ? 0 : 1));
  load(true);
}
function done() {
  audio.pause();
  if (session) { session.index = session.steps.length; session.over = true; }
  if (navigator.mediaSession) navigator.mediaSession.playbackState = 'none';
  changed();
}
function stop(paintNow = true) {
  audio.pause(); audio.removeAttribute('src'); audio.load?.();
  release(new Set()); session = null;
  if (navigator.mediaSession) { navigator.mediaSession.metadata = null; navigator.mediaSession.playbackState = 'none'; }
  if (paintNow) changed();
}
/** Hear one take of a waiting pair again; the session waits where it was (▶︎ 이어 듣기 goes back to it). */
async function hear(pair, side) {
  if (!session) return;
  const take = side === 'A' ? pair.a : pair.b;
  session.extra = {pair, side, take};
  meta();
  try { audio.src = (await srcOf(take.item)).url; audio.play().catch(() => {}); } catch { session.extra = null; V.toast('이 녹음을 불러오지 못했어요.', 'error'); }
  changed();
}
function resume() { if (!session) return; session.extra = null; load(true); }

audio.addEventListener('timeupdate', () => {
  const t = session?.extra?.take || step()?.take; if (!t) return;
  const end = sectionOf(t).end;
  if (end != null && audio.currentTime >= end) { if (session.extra) { audio.pause(); session.extra = null; changed(); } else next(); }
});
audio.addEventListener('ended', () => { if (!session || audio.getAttribute('src') === SILENCE) return; if (session.extra) { session.extra = null; changed(); } else next(); });
audio.addEventListener('error', () => { const src = audio.getAttribute('src'); if (session && !session.extra && src && src !== SILENCE) { session.failed++; next(); } });
for (const name of ['play', 'pause']) audio.addEventListener(name, () => { if (navigator.mediaSession) navigator.mediaSession.playbackState = audio.paused ? 'paused' : 'playing'; changed(); });

/* ---------- choosing ---------- */
function choose(pair, side) {
  const range = t => { const r = sectionOf(t); return r.end == null ? null : r; };
  let record;
  try {
    record = L.make({songId:pair.songId, takes:[pair.a, pair.b].map(t => ({id:t.id, date:t.date, created:t.created, range:range(t)})),
      overall:L.choiceOf(side, pair.aIsFirst), judge:'me', blind:true}, {today:V.today()});
  } catch (error) { V.toast(error.message, 'error'); return; }
  const ok = V.change(db => { db.comparisonReports ||= []; db.comparisonReports.push(record); }, {silent:true});
  if (!ok) return;
  window.dispatchEvent(new CustomEvent('vzip:listen-verdicts'));
  session.answered.set(pair.key, side);
  session.missed = session.missed.filter(p => p.key !== pair.key);
  try { navigator.vibrate?.(12); } catch {}
  // Owner, 2026-11-24: "선택했는데 넘어갔는지 모르겠어" — the choice is shown (what was chosen, which take was which,
  // what it means) for a moment, with 되돌리기 and 바로 다음, and only then the next pair comes.
  const s = step();
  if (!session.extra && s?.pair?.key === pair.key) {
    clearTimeout(session.flash?.timer);
    session.flash = {key:pair.key, side, recordId:record.id, overall:record.overall, at:Date.now(), timer:setTimeout(() => advance(pair.key), FLASH_MS)};
    changed();
  } else { V.toast('저장했어요 · ' + meaning(record.overall)); changed(); }
}
const FLASH_MS = 2600;
/** 곡이 틀렸어요 (owner, 2026-11-24: listening found a take filed under the wrong song): the same 곡 지정 as everywhere
 * (app/recording-menu.js pickRecordingSong → saveRecordingSong: confirm, then the take's song and title change). The
 * take then no longer belongs here: its pairs are left out of the rest of the session (and of 답 안 한 비교); in 그냥
 * 이어 듣기 it just plays on under its new song. */
async function fixSong() {
  const x = session?.extra || step(); if (!x) return;
  const item = x.take.item, before = x.take.songId;
  const v = await V.pickRecordingSong([item]); if (v == null || !session) return;
  try { await V.saveRecordingSong(item, v); M.invalidate?.(); }
  catch (error) { V.toast('곡을 바꾸지 못했어요: ' + error.message, 'error'); return; }
  item.songId = v; x.take.songId = v;
  const now = V.song(v) ? title(v) : '곡 미지정';
  if (session.mode !== 'pick' || v === before) { V.toast('곡을 ‘' + now + '’(으)로 바꿨어요.'); return changed(); }
  const id = item.id, uses = st => st.pair && (st.pair.a.id === id || st.pair.b.id === id);
  if (session.flash && uses(step())) { clearTimeout(session.flash.timer); session.flash = null; }
  session.steps = session.steps.slice(0, session.index).concat(session.steps.slice(session.index).filter(st => !uses(st)));
  session.missed = session.missed.filter(p => p.a.id !== id && p.b.id !== id);
  session.extra = null;
  V.toast('곡을 ‘' + now + '’(으)로 바꿨어요. 이 비교는 건너뛸게요.');
  if (session.index >= session.steps.length) return done();
  load(true);
}
/** On from a chosen pair to the next one (unless the choice was taken back, or the session moved on meanwhile). */
function advance(key) {
  if (!session || session.flash?.key !== key) return;
  clearTimeout(session.flash.timer); session.flash = null;
  const s = step();
  if (s?.pair?.key !== key) return changed();
  session.index = session.steps.findIndex((x, i) => i > session.index && x.pair?.key !== key);
  if (session.index < 0) return done();
  load(true);
}
/** 되돌리기: the verdict just saved goes again (the pair can be chosen anew). */
function undo() {
  const f = session?.flash; if (!f) return;
  clearTimeout(f.timer); session.flash = null;
  const ok = V.change(db => { db.comparisonReports = (db.comparisonReports || []).filter(x => x.id !== f.recordId); }, {silent:true});
  if (ok) { session.answered.delete(f.key); window.dispatchEvent(new CustomEvent('vzip:listen-verdicts')); V.toast('고른 것을 되돌렸어요.'); }
  changed();
}
const meaning = overall => overall === 'same' ? '비슷하다고 남겼어요' : overall === 'second' ? '요즘 녹음이 더 낫다고 남겼어요' : '예전 녹음이 더 낫다고 남겼어요';
/** Which take was which: "A · 예전 9월 10일", "B · 요즘 11월 20일". */
const sides = pair => [['A', pair.a, pair.aIsFirst], ['B', pair.b, !pair.aIsFirst]].map(([k, t, older]) => ({k, when:older ? '예전' : '요즘', date:dotted(t.date)}));
function resultHtml(pair, f) {
  const elapsed = Math.min(FLASH_MS, Date.now() - f.at);
  return '<div class="ls-result" data-ls-result data-side="' + e(f.side) + '" role="status" aria-live="polite">' +
    '<p class="ls-result-head"><i class="ph-fill ph-check-circle" aria-hidden="true"></i><strong>' + e(saidOf(f.side)) + '</strong></p>' +
    '<div class="ls-result-sides">' + sides(pair).map(x => '<span' + (x.k === f.side ? ' data-picked' : '') + '><b>' + x.k + '</b>' + x.when + ' · ' + e(x.date) + '</span>').join('') + '</div>' +
    '<p class="ls-result-meaning">' + e(meaning(f.overall)) + '</p>' +
    '<div class="ls-result-bar" aria-hidden="true"><span style="animation-duration:' + FLASH_MS + 'ms;animation-delay:-' + elapsed + 'ms"></span></div>' +
    '<div class="ls-result-actions"><button type="button" data-ls-undo>되돌리기</button><button type="button" class="is-main" data-ls-skip>바로 다음 <i class="ph ph-arrow-right" aria-hidden="true"></i></button></div></div>';
}
const reveal = pair => 'A ' + dotted(pair.a.date) + ' · B ' + dotted(pair.b.date);
const saidOf = side => side === 'same' ? '비슷해요' : side + '가 나아요';

/* ---------- lock screen ---------- */
function meta() {
  if (!navigator.mediaSession || !session) return;
  const x = session.extra || step(); if (!x) return;
  const pick = session.mode === 'pick', n = pick ? Math.floor(session.index / 2) + 1 : session.index + 1, of = pick ? session.steps.length / 2 : session.steps.length;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title:(x.side ? x.side + ' · ' : '') + title(x.take.songId),
      artist:pick ? '듣고 고르기 ' + n + ' / ' + of : M.label(x.take.item),
      album:'VOCAL.zip',
      artwork:[{src:'apple-touch-icon.png', sizes:'180x180', type:'image/png'}]});
  } catch {}
}
if (navigator.mediaSession) {
  const on = (action, fn) => { try { navigator.mediaSession.setActionHandler(action, fn); } catch {} };
  on('play', () => audio.play());
  on('pause', () => audio.pause());
  on('nexttrack', () => next());
  on('previoustrack', () => prev());
}

/* ---------- the screen ---------- */
let host = null, setup = {mode:'pick', clip:true, songId:''}, cached = [];
function setupHtml() {
  const songs = [...new Map(cached.map(t => [t.songId, t.songId])).keys()].map(id => ({id, n:cached.filter(t => t.songId === id).length}))
    .filter(s => setup.mode === 'play' || s.n >= 2).sort((a, b) => title(a.id).localeCompare(title(b.id), 'ko'));
  if (setup.songId && !songs.some(s => s.id === setup.songId)) setup.songId = '';
  const pairs = setup.mode === 'pick' ? S.pairs(cached, {songId:setup.songId || null, verdicts:L.list(V.db), random:() => 0}).length : 0;
  const count = setup.mode === 'pick' ? pairs : S.queue(cached, {songId:setup.songId || null}).length;
  const seg = (name, value, label) => '<button type="button" data-ls-' + name + '="' + value + '" aria-pressed="' + (String(setup[name]) === String(value)) + '">' + label + '</button>';
  return '<section class="ls-setup" data-ls-setup>' +
    '<div class="ls-seg" role="group" aria-label="듣는 방법">' + seg('mode', 'pick', '듣고 고르기') + seg('mode', 'play', '그냥 이어 듣기') + '</div>' +
    '<p class="ls-lead">' + (setup.mode === 'pick' ? '같은 곡의 예전 녹음과 요즘 녹음을 A·B로 이어 들려 드려요. 어느 쪽이 나은지 고르면 그때 날짜를 알려 드려요.' : '녹음을 최근 것부터 하나씩 이어서 들려 드려요.') + '</p>' +
    '<label class="field"><span>곡</span><select data-ls-song><option value="">전체 곡</option>' + songs.map(s => '<option value="' + e(s.id) + '"' + (s.id === setup.songId ? ' selected' : '') + '>' + e(title(s.id)) + ' (' + s.n + ')</option>').join('') + '</select></label>' +
    '<div class="ls-seg" role="group" aria-label="길이">' + seg('clip', 'true', '앞 1분씩') + seg('clip', 'false', '전체') + '</div>' +
    '<p class="ls-count" data-ls-count>' + (setup.mode === 'pick' ? '비교 ' + count + '개' : '녹음 ' + count + '개') + '</p>' +
    '<button type="button" class="btn block" data-ls-start' + (count ? '' : ' disabled') + '><i class="ph-fill ph-play" aria-hidden="true"></i>시작</button>' +
    (count ? '' : '<p class="muted small">' + (setup.mode === 'pick' ? '한 곡에 녹음이 두 개 넘게 있어야 비교할 수 있어요. 이미 고른 짝은 다시 나오지 않아요.' : '들을 녹음이 없어요.') + '</p>') +
    '<p class="ls-note">화면을 끄거나 다른 앱을 써도 다음 녹음이 이어서 나와요. 잠금화면에서는 멈춤·이전·다음만 되고, 고르기는 이 화면에서 해요.</p></section>';
}
function nowHtml() {
  const x = session.extra || step(), pick = session.mode === 'pick';
  if (session.over || !x) {
    return '<section class="ls-now" data-ls-done><p class="ls-big">다 들었어요</p><p class="muted">' + (pick ? '고른 비교 ' + session.answered.size + '개' : '녹음 ' + session.steps.length + '개') + (session.failed ? ' · 불러오지 못한 녹음 ' + session.failed + '개' : '') + '</p>' +
      (pick ? summaryHtml() : '') +
      '<button type="button" class="btn secondary block" data-ls-stop>처음으로</button></section>';
  }
  const pair = x.pair, answered = pair && session.answered.get(pair.key);
  const n = pick ? Math.floor(session.index / 2) + 1 : session.index + 1, of = pick ? session.steps.length / 2 : session.steps.length;
  return '<section class="ls-now" data-ls-now>' +
    '<p class="ls-step">' + (session.extra ? '다시 듣기' : (pick ? '비교 ' : '') + n + ' / ' + of + (pick && session.answered.size ? ' · 고른 것 ' + session.answered.size : '')) + '</p>' +
    '<p class="ls-song">' + e(title(x.take.songId)) + '</p>' +
    (V.pickRecordingSong && V.saveRecordingSong ? '<button type="button" class="ls-fix" data-ls-fix-song><i class="ph ph-music-notes" aria-hidden="true"></i>' + (x.side ? x.side + ' 녹음' : '이 녹음') + '의 곡이 틀렸어요</button>' : '') +
    (x.side ? '<p class="ls-side" data-ls-side>' + x.side + '</p>' : '<p class="ls-take">' + e(M.label(x.take.item)) + ' · ' + e(dotted(x.take.date)) + '</p>') +
    '<div class="ls-controls"><button type="button" data-ls-prev aria-label="이전"><i class="ph-fill ph-skip-back"></i></button>' +
    '<button type="button" class="ls-play" data-ls-toggle aria-label="' + (audio.paused ? '재생' : '일시정지') + '"><i class="ph-fill ' + (audio.paused ? 'ph-play' : 'ph-pause') + '"></i></button>' +
    '<button type="button" data-ls-next aria-label="다음"><i class="ph-fill ph-skip-forward"></i></button></div>' +
    (session.extra ? '<button type="button" class="btn secondary block" data-ls-resume>이어 듣기로 돌아가기</button>' : '') +
    (pair && !session.extra ? (session.flash?.key === pair.key ? resultHtml(pair, session.flash) : answered ? '<p class="ls-said" data-ls-said>' + saidOf(answered) + ' · ' + e(reveal(pair)) + '</p>' : choiceHtml(pair)) : '') +
    '</section>';
}
/** 이번에 고른 것 모아 보기 (owner, 2026-11-24): per song, how many times the later take (요즘), 비슷함 or the earlier
 * take (예전) was chosen in this session, with a link to that song's page (all its 들어 본 평가 and the measured direction). */
function summaryHtml() {
  const bySong = new Map();
  for (const [key, side] of session.answered) {
    const pair = session.steps.find(st => st.pair?.key === key)?.pair;
    if (!pair) continue;
    const t = bySong.get(pair.songId) || {later:0, same:0, earlier:0, n:0};
    t.n++; t[side === 'same' ? 'same' : (side === 'A') !== pair.aIsFirst ? 'later' : 'earlier']++;
    bySong.set(pair.songId, t);
  }
  if (!bySong.size) return '';
  return '<ul class="ls-sum" data-ls-summary>' + [...bySong].map(([sid, t]) => '<li data-ls-sum-song="' + e(sid) + '"><a href="#/growth-song/' + encodeURIComponent(sid) + '">' +
    '<strong>' + e(title(sid)) + '</strong><small>' + e(L.tallyText ? L.tallyText(t) : '') + '</small><i class="ph ph-caret-right" aria-hidden="true"></i></a></li>').join('') + '</ul>' +
    '<p class="ls-note">곡을 누르면 지금까지 고른 것을 모두 모아 측정 숫자와 나란히 보여 드려요.</p>';
}
const choiceHtml = pair => '<div class="ls-choice" role="group" aria-label="어느 쪽이 나아요?" data-ls-choice="' + e(pair.key) + '">' +
  [['A', 'A가 나아'], ['same', '비슷해'], ['B', 'B가 나아']].map(([v, t]) => '<button type="button" data-ls-pick="' + v + '">' + t + '</button>').join('') + '</div>';
function missedHtml() {
  if (!session?.missed.length) return '';
  return '<section class="ls-missed" data-ls-missed><h2>답 안 한 비교 ' + session.missed.length + '</h2>' + session.missed.map(p =>
    '<div class="ls-missed-row" data-ls-row="' + e(p.key) + '"><p><strong>' + e(title(p.songId)) + '</strong></p>' +
    '<div class="ls-again"><button type="button" data-ls-hear="A">▶ A</button><button type="button" data-ls-hear="B">▶ B</button></div>' + choiceHtml(p) + '</div>').join('') + '</section>';
}
function paint() {
  if (!host?.isConnected) return;
  host.innerHTML = session ? nowHtml() + missedHtml() + (session.over ? '' : '<button type="button" class="ls-stop" data-ls-stop>그만 듣기</button>') : setupHtml();
  wire();
}
function wire() {
  const q = s => host.querySelector(s);
  host.querySelectorAll('[data-ls-mode]').forEach(b => b.onclick = () => { setup.mode = b.dataset.lsMode; paint(); });
  host.querySelectorAll('[data-ls-clip]').forEach(b => b.onclick = () => { setup.clip = b.dataset.lsClip === 'true'; paint(); });
  const sel = q('[data-ls-song]'); if (sel) sel.onchange = () => { setup.songId = sel.value; paint(); };
  const go = q('[data-ls-start]'); if (go) go.onclick = () => { if (!start({...setup, songId:setup.songId || null, list:cached})) V.toast('들을 녹음이 없어요.'); };
  host.querySelectorAll('[data-ls-stop]').forEach(b => b.onclick = () => stop());
  const t = q('[data-ls-toggle]'); if (t) t.onclick = () => { if (audio.paused) { if (audio.getAttribute('src') && audio.getAttribute('src') !== SILENCE) audio.play(); else { unlock(); load(true); } } else audio.pause(); };
  const n = q('[data-ls-next]'); if (n) n.onclick = () => session.extra ? resume() : next();
  const p = q('[data-ls-prev]'); if (p) p.onclick = () => prev();
  const r = q('[data-ls-resume]'); if (r) r.onclick = () => resume();
  const u = q('[data-ls-undo]'); if (u) u.onclick = () => undo();
  const fx = q('[data-ls-fix-song]'); if (fx) fx.onclick = () => fixSong();
  const k = q('[data-ls-skip]'); if (k) k.onclick = () => advance(session.flash?.key);
  host.querySelectorAll('[data-ls-choice]').forEach(box => {
    const pair = session.steps.find(x => x.pair?.key === box.dataset.lsChoice)?.pair; if (!pair) return;
    box.querySelectorAll('[data-ls-pick]').forEach(b => b.onclick = () => choose(pair, b.dataset.lsPick));
  });
  host.querySelectorAll('[data-ls-row]').forEach(row => {
    const pair = session.missed.find(x => x.key === row.dataset.lsRow); if (!pair) return;
    row.querySelectorAll('[data-ls-hear]').forEach(b => b.onclick = () => hear(pair, b.dataset.lsHear));
  });
}

/* ---------- a small bar on other screens while a session plays ---------- */
let barEl = null;
function bar() {
  const show = session && !session.over && !/^#\/listen/.test(location.hash);
  if (!show) { barEl?.remove(); barEl = null; return; }
  const x = session.extra || step(); if (!x) return;
  if (!barEl) { barEl = document.createElement('div'); barEl.className = 'ls-bar'; barEl.dataset.listenBar = ''; document.body.appendChild(barEl); }
  barEl.innerHTML = '<a href="#/listen"><i class="ph ph-headphones" aria-hidden="true"></i><span>' + (x.side ? x.side + ' · ' : '') + e(title(x.take.songId)) + '</span></a>' +
    '<button type="button" data-ls-bar-toggle aria-label="' + (audio.paused ? '재생' : '일시정지') + '"><i class="ph-fill ' + (audio.paused ? 'ph-play' : 'ph-pause') + '"></i></button>';
  barEl.querySelector('[data-ls-bar-toggle]').onclick = () => { if (audio.paused) audio.play(); else audio.pause(); };
}
window.addEventListener('hashchange', bar);

V.route('listen', {title:'듣고 고르기', back:true, tab:'growth', noAutoRefresh:true,
  render:() => '<div class="ls" data-listen>' + (V.loadingRows?.(3) ?? '<p class="muted" role="status">불러오는 중…</p>') + '</div>',
  async mount(main, r) {
    host = main.querySelector('[data-listen]');
    // #/listen?song=<id> (성장 › 곡 하나 › 듣고 고르기): that song is chosen.
    const pre = r?.query?.get?.('song'); if (pre && V.song(pre)) setup.songId = pre;
    if (!session) { cached = await takes(); if (!host.isConnected) return; }
    paint();
  }});
V.listenSession = {start, next, prev, stop, choose, undo, advance, fixSong, state:() => session, audio};
})();
