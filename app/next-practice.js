/* 다음 연습 — ONE list of what to practise next for the whole app (다음 연습 하나로, 2026-11-26).
 *
 *   VZ.nextPractice({date?, songId?, limit?, media?, results?}) → {date, items, open, total}
 *
 * Built on app/growth-next-model.js build() with the inputs 성장 › 나 always gave it (전체 분석 recommendations through
 * the shared VZ.growthModel, the latest 월별 추천 연습, VZ.practiceTips, 발성 정밀 측정 results), so 홈 · 오늘의 목표 시트 ·
 * 성장 › 나 · this list read the same order and the same merging. Nothing is stored: it is derived on every call.
 *   media    the recordings the screen already holds (VZ.media.cached() when left out) — home passes its own list
 *   results  발성 정밀 측정 results when the screen read them; otherwise the last ones read (loadPrecision)
 * Each item carries, besides the model's fields:
 *   inGoals   it is in today's goals ('담김'): merged with a goal, or a goal made from it — matched as the places that
 *             make goals match them (homework source/sourceId, 전체 분석's 'overall-growth:<date>:<metric>' id, a
 *             recommendation's sourceId, else the same title)
 *   doneToday done today (its goal ticked, the homework done in a practice record, the exercise done in 오늘의 연습, a
 *             따라 하기 of it saved today); these come after all the others
 *   go        {href, label}: the way to start it that exists today (따라 하기 …), or null
 * VZ.nextPractice.addGoal(item) puts one in today's goals the way it is done today (no new kind of goal).
 *
 * #/next-practice: the full list as a page — rank, every source, one reason line, 따라 하기 and 목표에 담기 inline;
 * 전체 · 곡별 filters; 오늘 한 것 folded at the end; "AI에게 하나 더 받기" (the 오늘 할 일 AI request of
 * app/practice-review.js), which asks before anything is sent. */
(() => {
'use strict';
const V = window.VZ, N = window.VzipGrowthNext;
if (!V || !N) return;
const e = V.esc;
const list = v => Array.isArray(v) ? v : [];
const live = key => { const gone = new Set(list(V.db.deleted?.[key])); return list(V.db[key]).filter(x => x && !gone.has(x.id)); };
const clean = s => String(s ?? '').trim();
let precisionCache = null;

/* ---------- the list ---------- */
function precisionOf(results) {
  if (!Array.isArray(results)) return null;
  let changes = null;
  if (window.VzipGrowthChanges) try {
    changes = window.VzipGrowthChanges.taskChanges(results, {compare:window.VzipPrecisionReport?.compare, labels:window.VzipPrecisionReport?.LABELS || {}, groups:window.VzipPrecisionSession?.GROUPS || []});
  } catch (error) { console.error(error); }
  return {results, changes};
}
const assignmentIds = it => new Set([it, ...list(it.also)].map(x => x.source === 'homework' ? String(x.id).slice(9) : '').filter(Boolean)
  .concat(it.action?.kind === 'homework' ? [it.action.assignmentId] : []));
/** The goal of today this item is already (or was made into), or null. */
function goalOf(it, goals, date) {
  const a = it.action || {}, ids = new Set([it.id, ...list(it.also).map(x => x.id)]), hw = assignmentIds(it), t = N.norm(it.title);
  const goalIds = new Set([it, ...list(it.also)].filter(x => x.source === 'goal').map(x => String(x.id).slice(5)));
  return goals.find(g => goalIds.has(g.id)) ||
    goals.find(g => g.source === 'homework' && hw.has(g.sourceId)) ||
    (a.metric ? goals.find(g => g.id === 'overall-growth:' + date + ':' + a.metric) : null) ||
    goals.find(g => g.source === 'recommendation' && (ids.has(g.sourceId) || (a.tipKey && g.sourceId === 'analysis:' + a.tipKey))) ||
    goals.find(g => N.norm(g.title) === t) || null;
}
function doneByRecord(it, practices, runs) {
  const a = it.action || {};
  if (a.kind === 'skill' && a.exercise) return runs.some(r => list(r.dailySet?.items).some(x => x.exercise === a.exercise && x.state === 'done'));
  // 따라 하기: a row of the old screen (guidedExerciseKey), or a set of one step whose step is 'guide:<key>'.
  const guided = key => practices.some(p => p.guidedExerciseKey === key) || runs.some(r => list(r.dailySet?.items).some(x => x.id === 'guide:' + key && x.state === 'done'));
  if (a.kind === 'practice-tip') return guided('analysis:' + a.tipKey);
  if (a.kind === 'homework') return guided('homework:' + a.assignmentId);
  return false;
}
const guideHref = (key, songId = '') => V.guideHref ? V.guideHref(key, songId) : '#/practice-set?guide=' + encodeURIComponent(key) + (songId ? '&song=' + encodeURIComponent(songId) : '');
/** The way to start an item that exists today: 따라 하기 (a set of one step), 오늘의 연습, the song's 레슨 지적 체크, … */
function goOf(it) {
  const a = it.action || {}, enc = encodeURIComponent;
  switch (a.kind) {
    // 따라 하기: a set of one step in 오늘의 연습 (VZ.guideHref, app/guided-practice.js).
    case 'homework': return {href:guideHref('homework:' + a.assignmentId), label:'따라 하기'};
    case 'practice-tip': return {href:guideHref('analysis:' + a.tipKey, a.songId || ''), label:'따라 하기'};
    case 'skill': return {href:'#/practice-set', label:'오늘의 연습에서 하기'};
    case 'plan': return {href:'#/practice-set', label:'오늘의 연습으로'};
    case 'lesson-point': return {href:a.href || '#/song/' + enc(a.songId || ''), label:'곡에서 체크'};
    case 'route': return a.href ? {href:a.href, label:'열기'} : null;
    case 'goal': case 'routine': return {href:'#/home', label:'오늘 목표에서 하기'};
    case 'ai-draft': {
      const ref = a.ref?.kind;
      if (ref === 'overall-ai') return {href:'#/growth-flow?period=all', label:'AI 코치 보기'};
      if (ref === 'monthly-ai') return {href:'#/growth-flow?period=month', label:'AI 코치 보기'};
      return {href:a.href || '#/practice-review', label:ref === 'ai-review' ? 'AI 초안 보기' : '곡 분석에서 보기'};
    }
    default: return null;
  }
}
/** Can 목표에 담기 make a goal of it? Goals already are goals; AI drafts are taken (after editing) on their own screen. */
const canAdd = it => !['goal', 'routine', 'ai-draft'].includes(it.action?.kind);
function nextPractice({date = V.today(), songId = '', limit = 0, media = null, results} = {}) {
  const files = Array.isArray(media) ? media : V.media?.cached?.() || [];
  if (Array.isArray(results)) precisionCache = results;
  let overall = null, tips = null;
  try { overall = V.growthModel?.(files)?.overall || null; } catch (error) { console.error(error); }
  try { tips = V.practiceTips?.(files) || null; } catch (error) { console.error(error); }
  const monthly = live('monthlyGrowthReports').sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')))[0] || null;
  const built = N.build({db:V.db, today:date, overall, monthly, tips, precision:precisionOf(precisionCache), limit:1000, keepDone:true});
  const goals = live('dailyGoals').filter(g => g.date === date), practices = live('practices').filter(p => p.date === date);
  const runs = window.VzipDailySet?.runsOn?.(V.db, date) || [];
  const items = built.items.map(it => {
    const goal = goalOf(it, goals, date);
    const doneToday = !!it.done || goal?.completed === true || doneByRecord(it, practices, runs);
    return {...it, inGoals:!!goal || it.sources.includes('goal'), doneToday, goalId:goal?.id || '', go:goOf(it), canAdd:canAdd(it)};
  });
  // Done today goes after everything still to do; the order inside each part is the model's.
  const ranked = [...items.filter(x => !x.doneToday), ...items.filter(x => x.doneToday)];
  const mine = songId ? ranked.filter(x => x.songId === songId) : ranked;
  return {date, items:limit > 0 ? mine.slice(0, limit) : mine, open:mine.filter(x => !x.doneToday).length, total:mine.length};
}
/** The goal this item becomes (the shape of the place that already makes it), or null. */
function goalFor(it, date) {
  const a = it.action || {};
  if (!canAdd(it) || !clean(it.title)) return null;
  if (a.kind === 'homework') {
    const t = live('assignments').find(x => x.id === a.assignmentId);
    // As 다음 연습 (AI)'s "이 숙제를 오늘 목표에 담기" (app/practice-review.js): the homework's own words and song.
    return t ? {id:V.uid(), title:t.title, songId:t.songId || '', source:'homework', sourceId:t.id} : null;
  }
  // As 성장 › 나 and 전체 분석's 목표 담기: one id per measure and day, so no place makes it twice.
  if (a.kind === 'add-goal') return {id:'overall-growth:' + date + ':' + a.metric, title:a.title + (a.minutes ? ' (' + a.minutes + '분)' : ''), source:'personal', sourceId:'overall-growth'};
  // As 오늘의 목표's 다음 연습 (a recommendation named by its key: 'analysis:<tip>' for a 따라 하기 exercise).
  return {id:V.uid(), title:it.title, ...(it.songId ? {songId:it.songId} : {}), source:'recommendation', sourceId:a.kind === 'practice-tip' ? 'analysis:' + a.tipKey : it.id};
}
/** Put one item in today's goals. false when it is there already or could not be saved. */
function addGoal(it) {
  const date = V.today(), goal = goalFor(it, date);
  if (!goal) return false;
  const fresh = nextPractice({date}).items.find(x => x.id === it.id);
  if (fresh?.inGoals || it.inGoals) { V.toast('오늘 이미 담은 목표예요.'); return false; }
  const ok = V.change(db => {
    db.dailyGoals ||= [];
    const gone = new Set(list(db.deleted?.dailyGoals));
    if (db.dailyGoals.some(g => g && !gone.has(g.id) && g.date === date && (g.id === goal.id || (goal.source === 'homework' && g.source === 'homework' && g.sourceId === goal.sourceId)))) return;
    db.dailyGoals.push({...goal, date, completed:false, order:db.dailyGoals.filter(x => x?.date === date).length, created:Date.now()});
  }, {silent:true});
  if (!ok) { V.toast('목표를 저장하지 못했어요.', 'error'); return false; }
  V.toast('오늘의 목표에 담았어요.');
  return true;
}
/** 발성 정밀 측정 results of this account on this device (read-only), kept for the next calls. */
async function loadPrecision() {
  if (!window.VzipPrecisionStore) return precisionCache;
  const owner = window.vzipCloudUserId?.() || window.VzipAccountScope?.owner || 'local';
  try { precisionCache = (await window.VzipPrecisionStore.list(owner)).map(r => r.result).filter(Boolean); } catch {}
  return precisionCache;
}
V.nextPractice = nextPractice;
Object.assign(V.nextPractice, {addGoal, goalFor, loadPrecision, label:s => N.LABEL[s] || ''});

/* ---------- #/next-practice ---------- */
let request = 0, view = null;   // view: {host, media, filter: 'all'|'song', song, open (오늘 한 것 펼침), status}
const chips = it => [...new Set(list(it.sources).length ? it.sources : [it.source])].map(s => N.LABEL[s]).filter(Boolean)
  .map(c => '<span class="gm-chip np-chip" data-np-chip="' + e(c) + '">' + e(c) + '</span>').join('');
function reason(it) {
  const song = it.songId ? clean(V.songTitle?.(it.songId)) : '';
  const why = clean(it.why);
  return [song && !it.title.includes(song) && !why.includes(song) ? song : '', why].filter(Boolean).join(' · ');
}
function rowHtml(it, n) {
  const go = it.go ? '<a class="np-go" href="' + e(it.go.href) + '" data-np-go aria-label="' + e(it.title + ' ' + it.go.label) + '">' + e(it.go.label) + '</a>' : '';
  const add = it.doneToday || !it.canAdd && !it.inGoals ? '' : it.inGoals
    ? '<span class="np-added" data-np-added>목표에 담김 ✓</span>'
    : '<button type="button" class="np-add" data-np-add="' + e(it.id) + '" aria-label="' + e(it.title + ' 목표에 담기') + '">목표에 담기</button>';
  return '<li class="np-item" data-np-item="' + e(it.id) + '" data-source="' + e(it.source) + '"' + (it.doneToday ? ' data-done' : '') + (it.source === 'ai' ? ' data-draft' : '') + '>' +
    '<p class="np-head">' + (n ? '<span class="np-num">' + n + '</span>' : '<span class="np-check" aria-hidden="true">✓</span><span class="sr-only">오늘 했어요</span>') + chips(it) + '</p>' +
    '<strong class="np-title">' + e(it.title) + '</strong>' + (reason(it) ? '<small class="np-why">' + e(reason(it)) + '</small>' : '') +
    (go || add ? '<div class="np-actions">' + go + add + '</div>' : '') + '</li>';
}
function paint(v) {
  if (!v.host.isConnected) return;
  let all;
  try { all = nextPractice({media:v.media}).items; } catch (error) { console.error(error); v.host.innerHTML = V.errorBox('다음 연습 목록을 만들지 못했어요.', 'data-np-retry'); v.host.querySelector('[data-np-retry]').onclick = () => mount(v.host); return; }
  const songs = [...new Map(all.filter(x => x.songId && V.song?.(x.songId)).map(x => [x.songId, V.songTitle(x.songId) || '곡'])).entries()];
  if (v.song && !songs.some(([id]) => id === v.song)) v.song = '';
  const songOn = v.filter === 'song' && !!v.song;
  const shown = songOn ? all.filter(x => x.songId === v.song) : all;
  const open = shown.filter(x => !x.doneToday), done = shown.filter(x => x.doneToday);
  const allOpen = all.filter(x => !x.doneToday).length;
  const filters = '<div class="np-filters" role="group" aria-label="다음 연습 범위">' +
    '<button type="button" class="np-filter" data-np-filter="all" aria-pressed="' + (v.filter !== 'song') + '">전체 ' + allOpen + '</button>' +
    (songs.length ? '<button type="button" class="np-filter" data-np-filter="song" aria-pressed="' + (v.filter === 'song') + '" aria-expanded="' + (v.filter === 'song') + '" aria-controls="np-songs">' + (songOn ? e(songs.find(([id]) => id === v.song)?.[1] || '곡별') : '곡별') + '</button>' : '') + '</div>' +
    // 곡별: the songs in the list as a row of chips, right here (no sheet).
    (v.filter === 'song' && songs.length ? '<div class="np-songs" id="np-songs" role="group" aria-label="곡 고르기">' + songs.map(([id, title]) =>
      '<button type="button" class="np-song" data-np-song="' + e(id) + '" aria-pressed="' + (v.song === id) + '">' + e(title) + '</button>').join('') + '</div>' : '');
  const body = !open.length
    ? '<p class="gm-empty np-empty" data-np-empty>' + (v.filter === 'song' && !v.song ? '위에서 곡을 골라 주세요.' : all.length ? '지금 할 다음 연습을 모두 했어요.' : '지금은 모아 보여 줄 다음 연습이 없어요. 숙제, 레슨 지적, 분석한 녹음이 생기면 여기에 모여요.') + '</p>'
    : '<ol class="np-list" data-np-list>' + open.map((it, i) => rowHtml(it, i + 1)).join('') + '</ol>';
  const doneHtml = done.length ? '<details class="np-done" data-np-done' + (v.open ? ' open' : '') + '><summary>오늘 한 것 ' + done.length + '개<small>' + e(done.slice(0, 2).map(x => x.title + ' ✓').join(' · ')) + '</small></summary>' +
    '<ol class="np-list">' + done.map(it => rowHtml(it, 0)).join('') + '</ol></details>' : '';
  v.host.innerHTML = '<p class="np-basis" data-np-basis>숙제 → 레슨 지적 → 기본기 → 측정 → 계획 → AI 순서예요. 같은 연습은 한 줄로 모았어요.</p>' + filters + body + doneHtml +
    '<section class="np-ai" aria-labelledby="np-ai-title"><h2 id="np-ai-title" class="np-ai-h">하나 더 필요하면</h2><button type="button" class="np-ai-btn" data-np-ai' + (v.asking ? ' disabled' : '') + '>AI에게 하나 더 받기</button>' +
    '<p class="np-ai-note">보내기 전에 무엇을 보내는지 먼저 보여 드려요. 받은 것은 초안으로 이 목록에 들어가요.</p><p class="np-ai-status" role="status" data-np-ai-status>' + e(v.status || '') + '</p></section>';
  bind(v);
}
function bind(v) {
  const h = v.host;
  h.querySelectorAll('[data-np-filter]').forEach(b => b.onclick = () => {
    const f = b.dataset.npFilter;
    if (f === 'all') { v.filter = 'all'; v.song = ''; } else v.filter = v.filter === 'song' && !v.song ? 'all' : 'song';
    paint(v); h.querySelector('[data-np-filter="' + f + '"]')?.focus();
  });
  h.querySelectorAll('[data-np-song]').forEach(b => b.onclick = () => { v.song = b.dataset.npSong; paint(v); h.querySelector('[data-np-song="' + CSS.escape(v.song) + '"]')?.focus(); });
  h.querySelector('[data-np-done]')?.addEventListener('toggle', ev => { v.open = ev.target.open; });
  h.querySelectorAll('[data-np-add]').forEach(b => b.onclick = () => {
    const it = nextPractice({media:v.media}).items.find(x => x.id === b.dataset.npAdd);
    if (!it) return;
    b.disabled = true;
    if (addGoal(it)) { paint(v); h.querySelector('[data-np-item="' + CSS.escape(it.id) + '"] [data-np-added]')?.setAttribute('tabindex', '-1'); }
    else b.disabled = false;
  });
  const ai = h.querySelector('[data-np-ai]');
  if (ai) ai.onclick = () => askAi(v);
}
/** "AI에게 하나 더 받기": the 오늘 할 일 AI request (app/practice-review.js), asked first; nothing is sent before 보내기. */
async function askAi(v) {
  const R = V.practiceReviewRequest;
  if (!R || !window.vzipCloudCoach) { V.toast('지금은 AI 추천을 받을 수 없어요.'); return; }
  const ok = await V.confirm('AI에게 하나 더 받기',
    '이번 주 연습 기록(연습 시간·메모·오늘의 목표), 진행 중인 숙제, 다가오는 공연을 NVIDIA에 보내 오늘 할 연습 초안을 하나 만들어요.\n' +
    '녹음 파일은 보내지 않아요. 녹음을 청취하지 않으며 수치만으로 소리나 실력 향상을 단정하지 않아요.\n받은 초안은 담기 전에 고칠 수 있어요.', {ok:'보내기'});
  if (!ok || !v.host.isConnected) return;
  v.asking = true; v.status = '기록을 정리하고 있어요…'; paint(v);
  try {
    const req = R({todayMode:true, media:v.media}), draft = await req.ask();
    if (!V.change(db => req.save(db, draft, 'draft'), {silent:true})) throw Error('초안을 저장하지 못했어요.');
    v.status = '초안이에요. 목록의 AI 초안에서 확인하고 고친 뒤 담아 주세요.';
  } catch (error) { v.status = error?.message || '추천을 가져오지 못했어요.'; }
  finally { v.asking = false; if (v.host.isConnected) paint(v); }
}
async function mount(host) {
  const my = ++request;
  view = {host, media:V.media?.cached?.() || [], filter:'all', song:'', open:false, status:'', asking:false};
  paint(view);
  let media = view.media;
  try { media = await V.media.list(); } catch {}
  await loadPrecision();
  if (my !== request || !host.isConnected) return;
  view.media = media; paint(view);
}
V.route('next-practice', {title:'다음 연습', back:true, tab:'home', noAutoRefresh:true,
  render:() => '<div class="np" data-next-practice>' + (V.loadingRows?.() || '') + '</div>',
  mount(main) { mount(main.querySelector('[data-next-practice]')); },
  leave() { request++; view = null; }
});
// A goal ticked or added elsewhere, a practice saved, a recording analysed: the list follows in place.
for (const name of ['vzip:data-changed', 'vzip:analysis-saved', 'vzip:v6-media']) window.addEventListener(name, () => {
  if (document.body.dataset.vzRoute === 'next-practice' && view?.host?.isConnected && !view.asking) paint(view);
});
})();
