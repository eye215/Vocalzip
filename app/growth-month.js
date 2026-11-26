/* 성장 › 나 (#/vocal-growth) — the first tab of 성장: the report of ONE period (큰 정리 3번, 2026-11-27). On top 단계 in one
 * row, then the period switch 주 · 월 · 전체 (월 by default, kept on this device) with ‹ › to step back and forward
 * through weeks or months (전체 has none), and under it that period's report:
 *   ⓐ 한 것        entered practice minutes and days, recordings, 보이스 체크 days, lessons, 레슨 지적 체크 runs
 *                  (app/growth-month-model.js, 주간 요약's rules for any span) and 연습 시간 자세히 (#/practice-stats)
 *   ⓑ 달라진 것     one line, and 곡마다 자세히 folded: 무엇이 달라졌나 for the period (app/growth-changes-ui.js with a
 *                  period: the previous period vs this one, same song, same method and version), 곡별 (a song's own
 *                  screen), the 연습 녹음 포함 switch (off by default — then the numbers are the reports')
 *   ⓒ the report   what #/growth-flow showed for the period, with its own renderers and numbers: 주 → 주간 요약's parts
 *                  (app/weekly-summary.js) and 다음 연습 (VZ.nextPractice, app/next-practice.js: top 3, 더 보기, the
 *                  whole list); 월 → 월별 리포트 (app/monthly-growth.js: 이달의 변화 · 6가지 지표 · 음역 흐름 · AI 월간 종합 ·
 *                  다음 연습 · 지난 기록); 전체 → 전체 리포트 (app/overall-growth-ui.js: 6가지 지표 · AI 전체 종합 · 흐름 ·
 *                  음역 · 다음 연습 · 분석 기준)
 * The address says the period when it was chosen here: ?period=week|month|all (&week=YYYY-MM-DD | &month=YYYY-MM);
 * the old addresses (#/growth-flow?period=…, #/growth-changes, #/weekly-summary) lead here. ?changes=1 opens 곡마다
 * 자세히; &gc=<songId> (전체) opens it at that song's line.
 * Read-only apart from 목표에 담기 (a daily goal, as 전체 분석's 목표 담기 makes it) and the reports' own saving (월별 리포트's
 * monthly archive, AI 종합 after 보내기). The period, the switch and the chosen song are per-device conveniences
 * (localStorage), not part of the library. */
(() => {
'use strict';
const V = window.VZ, M = V?.media, GM = window.VzipGrowthMonth;
if (!V || !M || !GM || !V.growthDataset) return;
const e = V.esc;
// PRACTICE_KEY is the ONE 연습 녹음 포함 setting of 성장: 곡 (the list and 곡 하나) reads the same key (VZ.growthSong, app/growth-hub.js).
const PRACTICE_KEY = 'vzip:growth-practice', SONG_KEY = 'vzip:monthly-growth-song';
const load = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const save = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch {} };
const todayOf = () => window.VzipGrowthDataset?.koreaDay?.(Date.now()) || V.today();
const PERIODS = [['week', '주'], ['month', '월'], ['all', '전체']];
const WORDS = {
  week:{done:'이번 주에 한 것', then:'그 주에 한 것', compare:'그 주 기록', changes:'지난주와 비교', last:'지난주', step:'주'},
  month:{done:'이번 달에 한 것', then:'그 달에 한 것', compare:'그 달 기록', changes:'지난달과 비교', last:'지난달', step:'달'},
  all:{done:'지금까지 한 것', changes:'처음과 최근 비교', last:''}
};
const shiftDay = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
/** The period of kind that holds the day `at` (this one when left out): the model's span and words, said for a past one. */
function periodAt(kind, at = '') {
  const today = todayOf(), p = GM.period(kind, at && at <= today ? at : today);
  if (p.kind === 'all') return {...p, current:true};
  const current = p.from === GM.period(p.kind, today).from;
  return {...p, current, compare:current ? p.compare : WORDS[p.kind].compare};
}
/** The earliest day anything was kept (a recording, a practice, a lesson): ‹ › does not step before it. */
function firstDay(items) {
  let first = '';
  const take = d => { if (/^\d{4}-\d{2}-\d{2}$/.test(d || '') && (!first || d < first)) first = d; };
  for (const m of items || []) take(V.growthDataset.dateOf(m));
  for (const p of V.db.practices || []) take(String(p?.date || '').slice(0, 10));
  for (const l of V.db.lessons || []) take(String(l?.date || '').slice(0, 10));
  return first;
}
/** The address of 나 at this period (replaced, never added to the history). */
const hashOf = p => '#/vocal-growth?period=' + p.kind + (p.kind === 'week' && !p.current ? '&week=' + p.from : p.kind === 'month' && !p.current ? '&month=' + p.from.slice(0, 7) : '');
let request = 0, view = null;   // view: {host, items, period, practice, song, results}

/* ---------- ⓐ 한 것 ---------- */
const tile = (key, label, value, sub = '') => '<li data-gm-tile="' + key + '"><span>' + e(label) + '</span><strong>' + e(value) + '</strong>' + (sub ? '<small>' + e(sub) + '</small>' : '') + '</li>';
function doneHtml(v) {
  const p = v.period;
  let d;
  try { d = GM.done(V.db, v.items, {from:p.from, to:p.to, prev:p.prev, today:todayOf()}); } catch (error) { console.error(error); return ''; }
  const pts = d.points;
  return '<section class="gm-section gm-done" data-gm-section="done" aria-labelledby="gm-done-title"><header class="gm-head"><h2 id="gm-done-title">' + (p.current ? WORDS[p.kind].done : WORDS[p.kind].then) + '</h2>' +
    '<p class="gm-basis" data-gm-basis="done">' + e(GM.compareText(p, d)) + '</p></header><ul class="gm-tiles">' +
    tile('minutes', '연습 시간', GM.minutesText(d.minutes), '직접 적은 시간') + tile('days', '연습한 날', d.days + '일') +
    tile('recordings', '녹음', d.recordings + '개') + tile('voice-check', '보이스 체크', d.voiceCheckDays + '일') +
    tile('lessons', '레슨', d.lessons + '번') +
    tile('points', '레슨 지적 체크', pts.runs + '번', pts.runs ? '지켰어요 ' + pts.kept + ' · 놓쳤어요 ' + pts.missed : '부르면서 체크한 기록') + '</ul>' +
    // 연습 시간 자세히 (#/practice-stats, app/views-more.js): 날짜별 막대와 곡별 연습량 — what the six numbers above do not show.
    '<a class="gm-more-link" href="#/practice-stats" data-gm-practice-stats><i class="ph ph-chart-bar" aria-hidden="true"></i><span>연습 시간 자세히</span><i class="ph ph-caret-right" aria-hidden="true"></i></a></section>';
}

/* ---------- ⓑ 달라진 것 ---------- */
/** A song's own screen (곡 하나, #/growth-song/<id>) at the period's month when the period is a month. */
const songHref = (id, p) => '#/growth-song/' + encodeURIComponent(id) + (p?.kind === 'month' && p.from ? '?month=' + p.from.slice(0, 7) : '');
const changeOpts = v => ({period:v.period.from ? {from:v.period.from, to:v.period.to} : null, practice:v.practice});
const STATE_LINE = {compare:k => ({week:'지난주 녹음과 견줄 수 있어요', month:'지난달 녹음과 견줄 수 있어요', all:'처음과 최근을 견줄 수 있어요'})[k],
  new:k => k === 'all' ? '견줄 다른 날 녹음이 없어요' : '이 기간 전 녹음이 없어요', hold:() => '판정 보류'};
/** 지표 자세히 with the 연습 녹음 포함 switch on: the period's measures counted with 연습 takes (the report below counts
 * song takes only, as 결과 리포트 always did — with the switch off they are the same numbers, so it is not repeated). */
function detailHtml(v, song) {
  const k = v.period.kind;
  try {
    if (k === 'month' && V.monthlyGrowthDetail) return V.monthlyGrowthDetail(v.items, {month:v.period.from.slice(0, 7), songId:song, practice:v.practice}).html;
    if (k === 'all' && V.growthOverallFor) {
      const r = V.growthOverallFor(v.items, {practice:v.practice, songId:song}), card = window.VzipOverallGrowthUI?.metricCard;
      if (!r || !card) return '';
      return '<div class="growth-month-section-title"><h3>6가지 성장 지표</h3><small>' + (song ? '이 곡의' : '같은 곡의') + ' 처음과 최근 녹음 비교 · 근거가 부족하면 판정 보류</small></div>' +
        (r.analysisCount ? '<div class="growth-metrics">' + r.metrics.map(m => card(m, {cls:'card growth-metric'})).join('') + '</div>' : '<p class="gm-empty">아직 측정된 곡 녹음이 없어요.</p>');
    }
    if (k === 'week' && V.weeklySummary) {
      const s = V.weeklySummary.build(v.items, v.period.from, {practice:v.practice});
      if (song) { const items = s.growth.items.filter(x => x.songId === song); s.growth = {songs:items.length, items, more:0}; }
      return V.weeklySummary.growthHtml(s);
    }
  } catch (error) { console.error(error); }
  return '';
}
function changesHtml(v) {
  const k = v.period.kind, C = window.VzipGrowthChangesUI;
  const list = C?.songChoices?.(v.items, changeOpts(v)) || [];
  // 곡 하나 (큰 정리 2번): a song is its own screen (#/growth-song/<id>, the month's chip for 월별); this card is every song.
  const songOn = false;
  const scope = '<div class="growth-song-scope" role="group" aria-label="달라진 것 범위">' +
    '<button type="button" data-gm-scope="all" aria-pressed="true">전체</button>' +
    '<button type="button" data-gm-scope="song" aria-pressed="false" aria-haspopup="dialog"><span>곡별</span><i class="ph ph-caret-down" aria-hidden="true"></i></button></div>';
  const fallback = '';
  const toggle = '<label class="gm-switch"><input type="checkbox" role="switch" data-gm-practice' + (v.practice ? ' checked' : '') + '><span>연습 녹음 포함</span></label>';
  const note = v.practice ? '노래 연습실·트레이닝 연습 녹음도 넣어 견줘요. 끄면 결과 리포트와 같은 기준이에요.' : '곡 녹음만 견줘요. 노래 연습실·트레이닝 연습 녹음은 빼요.';
  const detail = v.practice ? detailHtml(v, '') : '';
  return '<section class="gm-changes" data-gm-section="changes" aria-label="곡마다 자세히"><header class="gm-head">' +
    '<p class="gm-basis" data-gm-basis="changes">' + e(WORDS[k].changes + ' · 같은 곡을 같은 방법·같은 분석 버전으로 잰 녹음끼리') + '</p></header>' +
    '<div class="gm-tools">' + scope + toggle + '</div><p class="gm-note" data-gm-practice-note>' + e(note) + '</p>' + fallback +
    (C ? '<div class="gc-host" data-growth-changes></div>' : '') +
    (detail ? '<details class="growth-secondary gm-detail" data-gm-detail><summary><span><i class="ph ph-chart-bar" aria-hidden="true"></i> 지표 자세히 · 연습 녹음 포함</span><small>' +
      (k === 'month' ? '이달의 변화 · 6가지 지표' : k === 'all' ? '6가지 지표' : '이번 주 성장') + ' · 아래 리포트는 곡 녹음만 세요</small></summary><div class="gm-detail-body">' + detail + '</div></details>' : '') + '</section>';
}
function mountChanges(v, section) {
  const host = section.querySelector('[data-growth-changes]'), C = window.VzipGrowthChangesUI;
  if (!host || !C) return;
  const list = C.songChoices(v.items, changeOpts(v)), song = '';
  const empty = v.period.from ? {verdicts:'이 기간에 남긴 들어 본 평가가 없어요. 곡 줄의 들어 보고 평가로 남길 수 있어요.',
    songs:'이 기간에 ' + WORDS[v.period.kind].last + ' 녹음과 견줄 같은 곡 녹음이 없어요. 같은 곡을 다시 녹음하고 분석하면 여기에 보여 드려요.'} : null;
  const done = C.mount(host, v.items, {...changeOpts(v), songId:song, head:false, ...(empty ? {empty} : {})});
  v.changesMounted = true;
  // &gc=<songId> (the old 무엇이 달라졌나 link of a song): open and scroll to that song's line, once.
  if (v.focus) { const id = v.focus; v.focus = ''; Promise.resolve(done).then(() => focusLine(v, id)); }
  // 곡별: the chosen song opens on its own screen — at this month's chip for 월별 (the same 지난달 대비 and measures).
  section.querySelector('[data-gm-scope="song"]').onclick = () => {
    if (!list.length) { V.toast('이 기간에는 곡 녹음이 없어요.'); return; }
    V.growthSongMenu(list.map(s => ({songId:s.songId, title:s.title, line:'<span data-gm-song-state="' + s.state + '">' + e(STATE_LINE[s.state](v.period.kind)) + '</span>'})), v.song,
      id => { v.song = id; save(SONG_KEY, id); V.nav(songHref(id, v.period)); });
  };
  section.querySelector('[data-gm-practice]').onchange = ev => { v.practice = ev.target.checked; save(PRACTICE_KEY, v.practice ? '1' : ''); paintChanges(v); };
}
function focusLine(v, id) {
  if (/[?&]gc=/.test(location.hash)) try { history.replaceState(null, '', hashOf(v.period)); } catch {}
  const line = [...v.host.querySelectorAll('[data-gc-song]')].find(x => x.dataset.gcSong === id);
  if (!line) return;
  const more = line.closest('details:not([data-gm-changes-fold])'); if (more) more.open = true;
  line.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'start'});
}
function paintChanges(v) {
  const old = v.host.querySelector('[data-gm-section="changes"]');
  if (!old) return;
  const wrap = document.createElement('div'); wrap.innerHTML = changesHtml(v);
  const next = wrap.firstElementChild; old.replaceWith(next); mountChanges(v, next);
}

/* ---------- ⓒ 다음 연습 ---------- */
const CHIP = {homework:'숙제', 'lesson-point':'레슨 지적', skill:'기본기', measure:'측정', precision:'측정', goal:'계획', plan:'계획', ai:'AI'};
const SHOWN = 3;
const norm = s => window.VzipGrowthNext?.norm?.(s) ?? String(s || '').replace(/\s+/g, '');
const todayGoals = () => (V.db.dailyGoals || []).filter(g => g?.date === V.today() && !(V.db.deleted?.dailyGoals || []).includes(g.id));
/** 다음 연습 as every screen reads it (VZ.nextPractice, app/next-practice.js — the same inputs, order and merging as 홈
 * and #/next-practice). Here: what is still to do today; 오늘 한 것 is on the full list. */
function nextModel(v) {
  if (!V.nextPractice) return null;
  try {
    const n = V.nextPractice({media:v.items, ...(Array.isArray(v.results) ? {results:v.results} : {})}), items = n.items.filter(x => !x.doneToday).slice(0, 50);
    return {items, more:0, total:items.length};
  } catch (error) { console.error(error); return null; }
}
const link = (href, label) => '<a class="gc-chip gm-act" href="' + e(href) + '">' + e(label) + '</a>';
function actionHtml(it, i) {
  const a = it.action || {};
  switch (a.kind) {
    case 'homework': return link('#/homework', '숙제 보기');
    case 'lesson-point': return link(a.href || '#/song/' + encodeURIComponent(a.songId || ''), '곡에서 체크');
    case 'add-goal': {
      const has = todayGoals().some(g => norm(g.title) === norm(a.title) || g.id === 'overall-growth:' + V.today() + ':' + a.metric);
      return '<button type="button" class="gc-chip gm-act" data-gm-goal="' + i + '"' + (has ? ' disabled' : '') + '>' + (has ? '담았어요' : '목표에 담기') + '</button>';
    }
    case 'practice-tip': return link(V.guideHref ? V.guideHref('analysis:' + a.tipKey) : '#/practice-set?guide=' + encodeURIComponent('analysis:' + a.tipKey), '따라 하기');
    case 'route': return link(a.href, '열기');
    case 'goal': case 'routine': return link('#/home', '오늘 목표에서 하기');
    case 'plan': return link('#/practice-set', '오늘의 연습으로');
    case 'skill': return link('#/practice-set', '오늘의 연습에서 하기');
    case 'ai-draft': {
      const ref = a.ref?.kind;
      if (ref === 'overall-ai') return link('#/vocal-growth?period=all', 'AI 코치 보기');
      if (ref === 'monthly-ai') return link('#/vocal-growth?period=month', 'AI 코치 보기');
      return link(a.href || '#/practice-review', ref === 'ai-review' ? 'AI 초안 보기' : '곡 분석에서 보기');
    }
    default: return '';
  }
}
function itemHtml(it, i) {
  const chips = [...new Set((it.sources || [it.source]).map(s => CHIP[s]).filter(Boolean))];
  return '<li class="gm-next-item" data-gm-next="' + e(it.id) + '" data-source="' + e(it.source) + '"><div class="gm-next-main"><p class="gm-chips">' +
    chips.map(c => '<span class="gm-chip" data-gm-chip="' + e(c) + '">' + e(c) + '</span>').join('') + '</p><strong>' + e(it.title) + '</strong>' +
    (it.why ? '<small>' + e(it.why) + '</small>' : '') + '</div><div class="gm-next-actions">' + actionHtml(it, i) + '</div></li>';
}
function nextHtml(v) {
  const n = v.next = nextModel(v), items = n?.items || [];
  const body = !n ? '<p class="gm-empty">다음 연습 목록을 만들지 못했어요.</p>' : !items.length
    ? '<p class="gm-empty" data-gm-next-empty>지금은 모아 보여 줄 다음 연습이 없어요. 숙제, 레슨 지적, 분석한 녹음이 생기면 여기에 모여요.</p>'
    : '<ol class="gm-next">' + items.slice(0, SHOWN).map(itemHtml).join('') + '</ol>' + (items.length > SHOWN ? '<details class="gm-more" data-gm-more><summary>더 보기 (' + (items.length - SHOWN) + ')</summary><ol class="gm-next">' +
      items.slice(SHOWN).map((it, k) => itemHtml(it, SHOWN + k)).join('') + '</ol></details>' : '');
  return '<section class="gm-section gm-next-box" data-gm-section="next" aria-labelledby="gm-next-title"><header class="gm-head"><h2 id="gm-next-title">다음 연습</h2>' +
    '<p class="gm-basis" data-gm-basis="next">오늘 기준 · 숙제를 먼저, 그다음 레슨 지적·기본기·측정·계획·AI 초안 순서 · 겹치는 것은 하나로</p></header>' + body +
    // The whole list (오늘 한 것 too, 목표에 담기 for every item, AI에게 하나 더 받기) on its own page.
    (n ? '<a class="gm-more-link gm-next-all" href="#/next-practice" data-gm-next-all><span>다음 연습 전체 보기</span><i class="ph ph-arrow-right" aria-hidden="true"></i></a>' : '') +
    // The screens you practise on (연습 세트 · 보이스 체크 · 노래 연습실 · 보컬 트레이닝) live on 오늘 › 연습하기.
    '<a class="gm-more-link gm-today-link" href="#/home" data-home-practice data-gm-today><span>연습은 오늘 탭에서 해요</span><i class="ph ph-arrow-right" aria-hidden="true"></i></a></section>';
}
function bindNext(v, section) {
  section.querySelectorAll('[data-gm-goal]').forEach(b => b.onclick = () => {
    const it = v.next?.items?.[Number(b.dataset.gmGoal)], a = it?.action;
    if (!a || a.kind !== 'add-goal' || !String(a.title || '').trim()) return;
    const date = V.today(), id = 'overall-growth:' + date + ':' + a.metric;
    if (todayGoals().some(g => g.id === id || norm(g.title) === norm(a.title))) { V.toast('오늘 이미 담은 목표예요.'); return; }
    const title = a.title + (a.minutes ? ' (' + a.minutes + '분)' : '');
    // The same goal as 전체 분석's 목표 담기 (same id), so the two places never make it twice.
    if (V.change(db => { db.dailyGoals ||= []; db.dailyGoals.push({id, date, title, source:'personal', sourceId:'overall-growth', completed:false,
      order:db.dailyGoals.filter(x => x.date === date).length, created:Date.now()}); }, {silent:true})) { V.toast('오늘의 연습 목표에 담았어요.'); paintNext(v); }
    else V.toast('목표를 저장하지 못했어요.', 'error');
  });
}
function paintNext(v) {
  const old = v.host.querySelector('[data-gm-section="next"]');
  if (!old) return;
  const open = !!old.querySelector('[data-gm-more]')?.open;
  const wrap = document.createElement('div'); wrap.innerHTML = nextHtml(v);
  const next = wrap.firstElementChild; old.replaceWith(next);
  if (open) { const more = next.querySelector('[data-gm-more]'); if (more) more.open = true; }
  bindNext(v, next);
}

/* ---------- 나 (성장 v2): 단계 한 줄 · 달라진 한 줄 ---------- */
const ME = window.VzipGrowthMe;
/** 단계 in ONE row (단계 하나로, 2026-11-27): "Lv n · 이름 · 다음 단계까지 n점 · 기본기 n/8 기준 맞춤", opening 단계
 * (#/levels), the one place with the level card and the eight 기본기 areas. The level is the one 오늘 and 단계 show
 * (VZ.levels.now); 기준 맞춤 = an area past 기준 맞추는 중 (it has a step). */
function meHtml(v) {
  if (!ME) return '';
  let lv = null, tiles = [];
  try { lv = V.levels?.now?.() || ME.lv(V.db, V.today()); tiles = ME.tiles(V.db, V.today()); } catch (error) { console.error(error); }
  if (!lv) return '';
  const next = lv.toNext == null ? '가장 높은 단계예요' : '다음 단계까지 ' + lv.toNext + '점';
  const set = tiles.filter(t => t.state === 'step').length;
  const skills = tiles.length ? '기본기 ' + set + '/' + tiles.length + ' 기준 맞춤' : '';
  const text = ['Lv ' + lv.level, lv.name, next, skills].filter(Boolean).join(' · ');
  return '<section class="gm-section gme-me" data-gm-section="me" aria-label="나"><a class="gme-lv" href="#/levels" data-gme-lv aria-label="' + e(text + ', 단계 보기') + '">' +
    '<i class="ph ph-arrow-fat-line-up gme-lv-icon" aria-hidden="true"></i><span class="gme-lv-text" data-gme-lv-text>' + e(text) + '</span><i class="ph ph-caret-right gme-lv-go" aria-hidden="true"></i></a></section>';
}
function lineHtml(v) {
  if (!ME) return '';
  let line = null;
  try { line = ME.changeLine(window.VzipGrowthChangesUI?.model?.(v.items, changeOpts(v)), v.period.kind); } catch (error) { console.error(error); }
  return '<section class="gm-section gme-line" data-gm-section="line" aria-labelledby="gme-line-title"><h2 id="gme-line-title" class="gme-h">달라진 것</h2>' +
    (line ? '<p class="gme-line-text" data-gme-line>' + e(line.text) + '</p><p class="gm-basis">' + e(line.basis) + '</p>' +
      (line.songId ? '<a class="gc-chip gm-act" href="' + e(songHref(line.songId, v.period)) + '" data-gme-listen><i class="ph ph-play" aria-hidden="true"></i>두 녹음 듣기</a>' : '')
      : '<p class="gm-empty" data-gme-line-empty>' + e(WORDS[v.period.kind].changes) + ' 견줄 같은 곡 녹음이 아직 없어요. 같은 곡을 다시 녹음하고 분석하면 여기에 한 줄로 알려 드려요.</p>') +
    '<details class="gme-more" data-gm-changes-fold' + (v.changesOpen ? ' open' : '') + '><summary class="gm-more-link" data-gme-changes><span>곡마다 자세히</span><i class="ph ph-caret-down" aria-hidden="true"></i></summary>' +
    changesHtml(v) + '</details></section>';
}

/* ---------- the screen ---------- */
function barHtml(v) {
  const p = v.period, k = p.kind, first = v.first || '';
  const prev = k !== 'all' && !!first && first < p.from, next = k !== 'all' && !p.current;
  const arrow = (dir, on) => '<button type="button" class="gm-step-btn" data-gm-move="' + dir + '" aria-label="' + (dir < 0 ? '이전 ' : '다음 ') + WORDS[k].step + '"' + (on ? '' : ' disabled') + '><i class="ph ph-caret-' + (dir < 0 ? 'left' : 'right') + '" aria-hidden="true"></i></button>';
  return '<div class="gm-bar"><div class="growth-view-tabs growth-range gm-period" role="group" aria-label="성장 기간"><span class="growth-range-label" aria-hidden="true">기간</span>' +
    PERIODS.map(([key, label]) => '<button type="button" data-gm-period="' + key + '" aria-pressed="' + (key === k) + '" class="' + (key === k ? 'active' : '') + '">' + label + '</button>').join('') + '</div>' +
    '<div class="gm-step" data-gm-step>' + (k === 'all' ? '' : arrow(-1, prev)) + '<p class="gm-label" data-gm-label>' + e(p.label) + (k !== 'all' && p.current ? ' <small>' + (k === 'week' ? '이번 주' : '이번 달') + '</small>' : '') + '</p>' + (k === 'all' ? '' : arrow(1, next)) + '</div></div>';
}
/** The report of the period (what #/growth-flow showed), mounted by its own renderer. */
function mountReport(v) {
  const box = v.host.querySelector('[data-gm-report]'), p = v.period;
  if (!box) return;
  V.growthReport?.leave?.(); V.weeklySummary?.leave?.();
  if (p.kind === 'week') { V.weeklySummary?.mount(box, {week:p.from}); return; }
  V.growthReport?.mount(box, {kind:p.kind, month:p.from.slice(0, 7), onMonth:key => go(v, periodAt('month', key + '-01'))});
}
/** To another period: drawn again, the address replaced (no new history entry). */
function go(v, p) {
  v.period = p; V.growthPeriod?.set(p.kind);
  try { history.replaceState(null, '', hashOf(p)); } catch {}
  paint(v);
}
function paint(v) {
  if (!v.host.isConnected) return;
  const k = v.period.kind, key = k + ':' + v.period.from;
  // The report of the same period, already mounted (it reads the list itself): kept as it is, so a redraw of the blocks
  // above it (the list loaded, a record added) never drops what is open or running in it.
  const kept = v.reportKey === key ? v.host.querySelector('[data-gm-report]') : null;
  // 나: 단계 한 줄, the period, then its report: 한 것 · 달라진 것 · (주: 다음 연습 · 주간 요약 | 월 · 전체: 월별 · 전체 리포트).
  v.host.innerHTML = meHtml(v) + barHtml(v) + '<div class="gm-grid">' + doneHtml(v) + lineHtml(v) + (k === 'week' ? nextHtml(v) : '') + '</div>' +
    (k === 'week' ? '<p class="growth-flow-note" data-gm-week-ai><i class="ph ph-info" aria-hidden="true"></i><span>주간 AI 종합은 아직 없어요. AI 종합은 월·전체에서 받을 수 있어요.</span></p>' : '') +
    '<div class="gm-report ' + (k === 'week' ? 'ws-page' : 'growth-page') + '" data-gm-report="' + k + '"' + (k === 'week' ? ' data-weekly-summary' : ' data-growth') + '></div>' +
    '<p class="small muted growth-disclaimer">수치는 음성 측정에 기반한 참고 정보예요. 분석하지 않은 녹음에는 결과를 만들어 넣지 않고, 연습 시간은 직접 적은 시간만 더해요.</p>';
  v.host.querySelectorAll('[data-gm-period]').forEach(b => b.onclick = () => {
    if (b.dataset.gmPeriod === v.period.kind) return;
    go(v, periodAt(b.dataset.gmPeriod));
    v.host.querySelector('[data-gm-period="' + v.period.kind + '"]')?.focus();
  });
  v.host.querySelectorAll('[data-gm-move]').forEach(b => b.onclick = () => {
    if (b.disabled) return;
    const p = v.period, dir = Number(b.dataset.gmMove);
    go(v, periodAt(p.kind, p.kind === 'week' ? shiftDay(p.from, 7 * dir) : dir < 0 ? shiftDay(p.from, -1) : shiftDay(p.to, 1)));
    (v.host.querySelector('[data-gm-move="' + dir + '"]:not([disabled])') || v.host.querySelector('[data-gm-move]:not([disabled])'))?.focus();
  });
  const fold = v.host.querySelector('[data-gm-changes-fold]'), changes = v.host.querySelector('[data-gm-section="changes"]'), next = v.host.querySelector('[data-gm-section="next"]');
  v.changesMounted = false;
  if (fold) fold.addEventListener('toggle', () => { v.changesOpen = fold.open; if (fold.open && !v.changesMounted) mountChanges(v, v.host.querySelector('[data-gm-section="changes"]')); });
  if (changes && v.changesOpen) mountChanges(v, changes);
  if (next) bindNext(v, next);
  if (kept) v.host.querySelector('[data-gm-report]')?.replaceWith(kept);
  else { v.reportKey = key; mountReport(v); }
}
/** The 발성 정밀 측정 results of this account (read-only, this device), for 다음 연습; null when there is no store. */
async function readPrecision() {
  if (!window.VzipPrecisionStore) return null;
  const owner = window.vzipCloudUserId?.() || window.VzipAccountScope?.owner || 'local';
  try { return (await window.VzipPrecisionStore.list(owner)).map(r => r.result).filter(Boolean); } catch { return null; }
}
/** ask: {kind, at, changes, focus} from the address; without it, this device's period, now. */
async function mount(host, ask = null) {
  const my = ++request;
  const kept = view?.host === host ? view : null;
  const period = ask ? periodAt(ask.kind, ask.at) : kept ? kept.period : periodAt(V.growthPeriod?.get() || 'month');
  let song = load(SONG_KEY);
  if (song && !V.song(song)) song = '';
  const cached = M.cached?.() || [];
  view = {host, items:cached, period, practice:load(PRACTICE_KEY) === '1', song, results:null, next:null,
    changesOpen:ask ? !!ask.changes : !!kept?.changesOpen, focus:ask?.focus || '', first:firstDay(cached)};
  if (cached.length) paint(view); else host.innerHTML = (window.VZ.loadingRows?.() ?? '<p class="muted" role="status">불러오는 중…</p>');
  let items;
  try { items = await M.list(); } catch (error) { items = cached; if (!cached.length && my === request && host.isConnected) host.insertAdjacentHTML('afterbegin', '<p class="growth-hub-note" role="status">녹음 목록을 불러오지 못해 녹음·변화 항목은 빠졌을 수 있어요.</p>'); }
  if (my !== request || !host.isConnected) return;
  if (items !== cached || !cached.length) { view.items = items; view.first = firstDay(items); paint(view); }
  const results = await readPrecision();
  if (my !== request || !host.isConnected || !Array.isArray(results)) return;
  view.results = results; paintNext(view);
}
const isDay = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
V.route('vocal-growth', {title:'성장', tab:'growth', noAutoRefresh:true,
  render:() => (V.growthTabs?.('me') || '') + '<div class="gm" data-growth-month></div>',
  mount(main, r) {
    // Older addresses lead to where their content is now (one history entry, replaced).
    // #/vocal-growth/training (the former 보컬 트레이닝): practice is on 오늘 › 연습하기 now.
    if (r?.params?.[0] === 'training') { V.homeShow?.('practice'); location.replace('#/home'); return; }
    if (r?.params?.[0] === 'analysis') { location.replace('#/vocal-analysis'); return; }
    const q = r?.query, gc = q?.get('gc') || '';
    // ?mode=monthly (결과 리포트 월별) and ?gc= (무엇이 달라졌나 of a song) are periods of 나 now.
    if (q?.get('mode') === 'monthly') { location.replace('#/vocal-growth?period=month'); return; }
    if (gc && q?.get('period') !== 'all') { location.replace('#/vocal-growth?period=all&gc=' + encodeURIComponent(gc)); return; }
    const kind = q?.get('period'), month = q?.get('month') || '', week = q?.get('week') || '';
    const ask = ['week', 'month', 'all'].includes(kind) || q?.get('changes') === '1' ? {kind:['week', 'month', 'all'].includes(kind) ? kind : V.growthPeriod?.get() || 'month',
      at:kind === 'week' && isDay(week) ? week : kind === 'month' && /^\d{4}-\d{2}$/.test(month) ? month + '-01' : '', changes:q?.get('changes') === '1' || !!gc, focus:gc} : null;
    if (ask) V.growthPeriod?.set(ask.kind);
    mount(main.querySelector('[data-growth-month]'), ask);
  },
  leave() { request++; V.growthReport?.leave?.(); V.weeklySummary?.leave?.(); }
});
// 달라진 것 자세히 was its own page: it is 나's 곡마다 자세히 now, at the period kept on this device.
V.route('growth-changes', {title:'성장', tab:'growth', noAutoRefresh:true,
  render:() => '',
  mount() { location.replace('#/vocal-growth?period=' + (V.growthPeriod?.get() || 'month') + '&changes=1'); }
});
const here = () => document.body.dataset.vzRoute === 'vocal-growth' && view?.host?.isConnected ? view : null;
// A recording added or analysed meanwhile: everything again. A record (a goal, a lesson): 한 것 and 다음 연습 only, so the
// 달라진 것 card (and a player in it) stays as it is.
for (const name of ['vzip:analysis-saved', 'vzip:v6-media']) window.addEventListener(name, () => { const v = here(); if (v) mount(v.host); });
window.addEventListener('vzip:data-changed', () => {
  const v = here();
  if (!v) return;
  const done = v.host.querySelector('[data-gm-section="done"]');
  if (done) { const wrap = document.createElement('div'); wrap.innerHTML = doneHtml(v); if (wrap.firstElementChild) done.replaceWith(wrap.firstElementChild); }
  paintNext(v);
});
})();
