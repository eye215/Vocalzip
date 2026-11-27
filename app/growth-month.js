/* 성장 › 나 (#/vocal-growth) — the first tab of 성장: ONE period at a glance (성장 새 디자인, 2026-11-27; before it 큰 정리
 * 3번). The period pill beside the tabs ("이번 달 · 11월") opens 주 · 월 · 전체 (월 by default, kept on this device) with ‹ ›
 * to step back and forward through weeks or months (전체 has none). Under it, for that period:
 *   이 달 한마디    one or two sentences from the measures that changed and the practice change (app/growth-me-model.js
 *                  oneLine; 측정값 기반 참고), 다음 연습's first 목표에 담기 item and AI 종합 (the report's own button, so
 *                  what is sent is asked first)
 *   연습량 · 목 상태 entered minutes a day against the last period (→ 연습 시간 자세히, #/practice-stats) · 보이스 체크
 *                  self-ratings one dot a day (→ #/voice-check)
 *   지표 6가지      월별 리포트's (a week: its month's) or 전체 리포트's six measures; a tile chosen shows that measure's
 *                  flow over the measured song takes (처음 · 평균 · 최고 · 녹음 n개)
 *   연습 구성       곡 · 기본기 (entered minutes) · 녹음 (recorded length)
 *   the rows       단계 (#/levels) · 다음 연습 (VZ.nextPractice, folded) · 주간 요약 (→ 지난주) · 곡마다 자세히 (달라진 것
 *                  one line, 무엇이 달라졌나 for the period, 곡별, 연습 녹음 포함 switch; folded) · 한 것 (folded) · the
 *                  period's report (folded): 주 → 주간 요약 (app/weekly-summary.js); 월 → 월별 리포트 (app/monthly-growth.js:
 *                  이달의 변화 · 6가지 지표 · 음역 흐름 · AI 월간 종합 · 다음 연습 · 지난 기록); 전체 → 전체 리포트
 *                  (app/overall-growth-ui.js)
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
  // v.next is undefined while the month / 전체 report is still being drawn (see paint): said as loading.
  const n = v.next, items = n?.items || [];
  const body = n === undefined ? '<p class="gm-empty" role="status" data-gm-next-wait>불러오는 중…</p>' : !n ? '<p class="gm-empty">다음 연습 목록을 만들지 못했어요.</p>' : !items.length
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
  section.querySelectorAll('[data-gm-goal]').forEach(b => b.onclick = () => addGoal(v, Number(b.dataset.gmGoal)));
}
function paintNext(v) {
  v.next = nextModel(v);
  const old = v.host.querySelector('[data-gm-section="next"]');
  if (!old) return;
  const open = !!old.querySelector('[data-gm-more]')?.open;
  const wrap = document.createElement('div'); wrap.innerHTML = nextHtml(v);
  const next = wrap.firstElementChild; old.replaceWith(next);
  if (open) { const more = next.querySelector('[data-gm-more]'); if (more) more.open = true; }
  bindNext(v, next);
  const n = v.next?.items?.length || 0, sub = v.host.querySelector('[data-gm-next-sub]');
  if (sub) sub.textContent = n ? '오늘 할 것 ' + n + '개' : '지금은 없어요';
  paintWord(v);
}

/* ---------- 나 (성장 새 디자인, 2026-11-27): 한마디 · 연습량 · 목 상태 · 지표 6가지 · 연습 구성 · 줄 목록 ---------- */
const ME = window.VzipGrowthMe, G = window.VzipGrowthMetrics;
const chevR = '<svg class="gm-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M9 6l6 6-6 6"/></svg>';
const chevD = '<svg class="gm-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M6 9l6 6 6-6"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 1.5c.6 5.4 3.1 9.9 10.5 10.5-7.4.6-9.9 5.1-10.5 10.5C11.4 17.1 8.9 12.6 1.5 12 8.9 11.4 11.4 6.9 12 1.5z"/></svg>';
const goneMedia = () => new Set((V.db.deleted?.media || []).map(String));
const r1 = n => Math.round(n * 10) / 10;
const refOf = id => { const r = V.song(id)?.vocalRange; return r && Number.isFinite(r.highMidi) ? r : null; };
/** 단계 as one line: "Lv n · 이름 · 다음 단계까지 n점 · 기본기 n/8" (the level 오늘 and 단계 show, VZ.levels.now). */
function lvText() {
  if (!ME) return '';
  let lv = null, tiles = [];
  try { lv = V.levels?.now?.() || ME.lv(V.db, V.today()); tiles = ME.tiles(V.db, V.today()); } catch (error) { console.error(error); }
  if (!lv) return '';
  const next = lv.toNext == null ? '가장 높은 단계예요' : '다음 단계까지 ' + lv.toNext + '점';
  const set = tiles.filter(t => t.state === 'step').length;
  return ['Lv ' + lv.level, lv.name, next, tiles.length ? '기본기 ' + set + '/' + tiles.length : ''].filter(Boolean).join(' · ');
}
/** ONE line of what changed (the latest song pair, else a listening verdict, else 음역) — 곡마다 자세히 opens under it. */
function changeLine(v) {
  if (!ME) return null;
  try { return ME.changeLine(window.VzipGrowthChangesUI?.model?.(v.items, changeOpts(v)), v.period.kind); } catch (error) { console.error(error); return null; }
}
function lineHtml(v) {
  const line = v.o?.line;
  return '<div class="gme-line" data-gm-section="line">' + (line ? '<p class="gme-line-text" data-gme-line>' + e(line.text) + '</p><p class="gm-basis">' + e(line.basis) + '</p>' +
      (line.songId ? '<a class="gm-pill gm-pill-line" href="' + e(songHref(line.songId, v.period)) + '" data-gme-listen><i class="ph ph-play" aria-hidden="true"></i>두 녹음 듣기</a>' : '')
    : '<p class="gm-empty" data-gme-line-empty>' + e(WORDS[v.period.kind].changes) + ' 견줄 같은 곡 녹음이 아직 없어요. 같은 곡을 다시 녹음하고 분석하면 여기에 한 줄로 알려 드려요.</p>') + '</div>';
}
/** The month the 지표 6가지 read for a period: the month itself, a week's month (the week's last day so far), none for 전체. */
const metricMonth = (p, today) => p.kind === 'month' ? p : p.kind === 'week' ? GM.period('month', p.to < today ? p.to : today) : null;
/** A take's value for one measure, as 월별 리포트 measures it (app/monthly-growth.js measure): null when it has none. */
function takeValue(m, id) {
  const a = m.analysis;
  if (id === 'passaggio') return null;
  if (id === 'high') { try { const w = G.single(a, {reference:refOf(m.songId)}).high?.wobble; return Number.isFinite(w) ? w : null; } catch { return null; } }
  const x = G.value(a, id);
  return Number.isFinite(x) ? x : null;
}
const noteOf = cents => G.noteName(G.midiOf(cents));
/** "±12 cent", "3.4초", "F5" — the value of a measure as the reports say it. */
const valueText = (id, x) => x == null || !Number.isFinite(Number(x)) ? '—' : id === 'range' ? noteOf(x) : G.fmt(id, x);
/** Everything the overview cards read, worked out once per drawing. Read-only. */
function overview(v) {
  const p = v.period, k = p.kind, today = todayOf(), o = {today};
  const first = v.first && v.first <= today ? v.first : today;
  o.span = k === 'all' ? {from:first, to:today, today} : {from:p.from, to:p.to, today};
  const gone = goneMedia(), dated = (v.items || []).filter(m => m && !gone.has(String(m.id))).map(m => ({m, date:V.growthDataset.dateOf(m)}));
  try { o.prac = ME.practice(V.db, o.span, k === 'all' ? null : p.prev); } catch (error) { console.error(error); o.prac = null; }
  o.dotSpan = k === 'all' ? {from:shiftDay(today, -27), to:today, today} : o.span;
  try { o.cond = ME.condition(V.db, dated.map(x => ({date:x.date, voiceCheck:!!x.m.voiceCheck})), o.dotSpan); } catch (error) { console.error(error); o.cond = null; }
  try { o.mix = ME.mix(V.db, dated.map(x => ({date:x.date, seconds:x.m.durationSeconds})), o.span); } catch (error) { console.error(error); o.mix = null; }
  // 지표 6가지: 월별 리포트's numbers for the month (a week reads its month), 전체 리포트's for 전체 — never new ones.
  const mp = metricMonth(p, today);
  o.mp = mp;
  let rows = [];
  try {
    if (!mp) rows = V.growthOverallFor?.(v.items, {})?.metrics || [];
    else rows = (V.monthlyGrowthDetail?.(v.items, {month:mp.from.slice(0, 7)})?.rows || []).map(r => ({...r.d, ...r.agg, id:r.d.id, title:r.d.title}));
  } catch (error) { console.error(error); }
  o.metrics = ORDER.map(id => G.METRICS.find(d => d.id === id)).filter(Boolean).map(d => ({...d, ...(rows.find(r => r.id === d.id) || {}), id:d.id, title:d.title, direction:d.direction}));
  // The flow of each measure: every measured song take (rule 'verdict', reliable) of the month before and this one.
  const from = mp ? mp.prev.from : '', to = mp ? (mp.to < today ? mp.to : today) : today;
  let takes = [];
  try { takes = V.growthModel(v.items).songItems.filter(V.growthDataset.ok).map(m => ({m, date:V.growthDataset.dateOf(m)})).filter(x => x.date && (!from || x.date >= from) && x.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.m.created || 0) - (b.m.created || 0)); } catch (error) { console.error(error); }
  o.series = {};
  for (const d of G.METRICS) o.series[d.id] = takes.map(x => ({date:x.date, value:takeValue(x.m, d.id)})).filter(x => x.value != null);
  o.line = changeLine(v);
  return o;
}
/* 이 달 한마디 */
const WORD_TITLE = {week:['이 주 한마디', '그 주 한마디'], month:['이 달 한마디', '그 달 한마디'], all:['지금까지 한마디', '지금까지 한마디']};
function suggestion(v) {
  const items = v.next?.items || [];
  const i = items.findIndex(it => it.action?.kind === 'add-goal' && String(it.action.title || '').trim());
  return i < 0 ? null : {i, it:items[i]};
}
const hasGoal = a => todayGoals().some(g => norm(g.title) === norm(a.title) || g.id === 'overall-growth:' + V.today() + ':' + a.metric);
function wordHtml(v) {
  const o = v.o, k = v.period.kind;
  const judged = o.metrics.filter(m => m.judged && !m.reference && m.compared);
  let text = '';
  try { text = ME.oneLine({better:judged.filter(m => m.state === 'better').map(m => m.title), worse:judged.filter(m => m.state === 'worse').map(m => m.title),
    practice:o.prac?.trend || null, kind:k, fallback:o.line?.text || ''}); } catch (error) { console.error(error); }
  const s = suggestion(v), done = s && hasGoal(s.it.action);
  const pick = s ? '<button type="button" class="gm-pill gm-pill-line" data-gm-suggest="' + s.i + '"' + (done ? ' disabled' : '') + ' aria-label="' + e(s.it.action.title + (done ? ' · 오늘 목표에 담았어요' : ' · 오늘 목표에 담기')) + '"><span class="gm-pill-t">‘' + e(s.it.title) + '’</span><span>' + (done ? ' 담았어요' : ' 목표에 담기') + '</span></button>' : '';
  const ai = k === 'week' ? '' : '<button type="button" class="gm-pill gm-pill-text" data-gm-ai>AI 종합</button>';
  return '<section class="gm-word" data-gm-section="word" aria-labelledby="gm-word-title"><h2 id="gm-word-title" class="gm-word-title">' + WORD_TITLE[k][v.period.current ? 0 : 1] + '</h2>' +
    '<p class="gm-word-text" data-gm-word>' + e(text) + '</p><p class="gm-word-basis">측정값 기반 참고</p>' +
    (pick || ai ? '<div class="gm-word-acts">' + pick + ai + '</div>' : '') + '</section>';
}
/* 연습량 · 목 상태 */
const LAST_WORD = {week:'지난주', month:'지난달'};
function pracLine(o) {
  const pts = (o.prac?.line || []).slice(-60);
  if (pts.length < 2) return '<div class="gm-spark gm-spark-empty"></div>';
  const before = o.prac.before?.avg ?? null, top = Math.max(1, ...pts.map(x => x.avg), before || 0) * 1.12;
  const W = 134, H = 50, x = i => (i / (pts.length - 1)) * (W - 8), y = n => H - 4 - (n / top) * (H - 10);
  const line = pts.map((pt, i) => x(i).toFixed(1) + ',' + y(pt.avg).toFixed(1)).join(' '), end = pts.length - 1;
  return '<svg class="gm-spark" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true" focusable="false"><defs><linearGradient id="gmSparkL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#C9AEFB"/><stop offset=".6" stop-color="#7A32F5"/><stop offset="1" stop-color="#5B1FC2"/></linearGradient>' +
    '<linearGradient id="gmSparkA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8B45FF" stop-opacity=".28"/><stop offset="1" stop-color="#7A32F5" stop-opacity="0"/></linearGradient></defs>' +
    (before != null ? '<line x1="0" x2="' + W + '" y1="' + y(before).toFixed(1) + '" y2="' + y(before).toFixed(1) + '" stroke="#D0D5DD" stroke-dasharray="3 3" data-gm-spark-before/>' : '') +
    '<polygon points="0,' + H + ' ' + line + ' ' + x(end).toFixed(1) + ',' + H + '" fill="url(#gmSparkA)"/><polyline points="' + line + '" fill="none" stroke="url(#gmSparkL)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>' +
    '<circle cx="' + x(end).toFixed(1) + '" cy="' + y(pts[end].avg).toFixed(1) + '" r="4" fill="#7A32F5" stroke="#fff" stroke-width="2"/></svg>';
}
const DOT = {1:'#DCC8FD', 2:'#B994FF', 3:'#9459F8', 4:'#7A32F5', 5:'#5B1FC2'};
function dotsHtml(o) {
  const days = ME.daysOf(o.dotSpan.from, o.dotSpan.to), by = new Map((o.cond?.dots || []).map(d => [d.date, d]));
  const cols = days.length <= 7 ? 7 : Math.min(16, Math.ceil(days.length / 2));
  return '<div class="gm-dots" style="--gm-cols:' + cols + '" aria-hidden="true">' + days.map(d => {
    const x = by.get(d);
    if (d > o.today) return '<i data-dot="later"></i>';
    if (x?.rating) return '<i data-dot="' + x.rating + '" style="background:' + DOT[x.rating] + '"></i>';
    return '<i data-dot="' + (x?.checked ? 'checked' : 'none') + '"></i>';
  }).join('') + '</div>';
}
function tilesHtml(v) {
  const o = v.o, k = v.period.kind, pr = o.prac, c = o.cond;
  const avg = pr ? Math.round(pr.avg) : 0, last = LAST_WORD[k];
  const trend = !pr ? ['', ''] : pr.trend === 'up' ? ['늘었어요', '↗ ' + last + '보다 +' + pr.delta] : pr.trend === 'down' ? ['줄었어요', '↘ ' + last + '보다 −' + Math.abs(pr.delta)]
    : pr.trend === 'same' ? ['비슷해요', '→ ' + last + ME.josa(last, '과', '와') + ' 같아요'] : ['연습한 날', pr.practised + '일'];
  const cAvg = c?.avg == null ? '—' : r1(c.avg).toFixed(1);
  const cWord = c?.avg != null ? c.word : c?.checkedDays ? '점수 없음' : '기록 없음';
  return '<div class="gm-tiles2" data-gm-section="tiles">' +
    '<a class="gm-tile2" href="#/practice-stats" data-gm-tile2="practice" aria-label="연습량 하루 평균 ' + avg + '분 · ' + e(trend.join(' ')) + ', 연습 시간 자세히">' +
      '<span class="gm-tile2-head"><span>연습량</span>' + chevR + '</span>' + pracLine(o) +
      '<span class="gm-tile2-num"><b>' + avg + '</b><small> 분/일</small></span><span class="gm-tile2-foot"><strong>' + e(trend[0]) + '</strong><span>' + e(trend[1]) + '</span></span></a>' +
    '<a class="gm-tile2" href="#/voice-check" data-gm-tile2="condition" aria-label="목 상태 ' + (c?.avg == null ? '점수 없음' : '평균 ' + cAvg + '점 ' + e(cWord)) + ' · 기록 ' + (c?.checkedDays || 0) + '일, 보이스 체크 기록">' +
      '<span class="gm-tile2-head"><span>목 상태</span>' + chevR + '</span>' + dotsHtml(o) +
      '<span class="gm-tile2-num"><b>' + cAvg + '</b><small> /5 평균</small></span><span class="gm-tile2-foot"><strong>' + e(cWord) + '</strong><span>기록 ' + (c?.checkedDays || 0) + '일</span></span></a></div>';
}
/* 지표 6가지 — the six measure tiles, and under them the chosen one's flow */
const SHORT = {passaggio:'파사지오', range:'음역'};
// The order of the tiles: the three judged pitch/breath measures first, then 고음, 음역 and the reference one.
const ORDER = ['intonation', 'stability', 'phrase', 'high', 'range', 'passaggio'];
const STATE_WORD = {better:'좋아짐', worse:'아쉬움', similar:'비슷함', mixed:'엇갈림', changed:'달라짐', reference:'참고', hold:'판정 보류'};
const ARROW = {better:'↗', worse:'↘', similar:'→', mixed:'↕', changed:'↕'};
function shownValue(m, o) {
  if (m.id === 'passaggio') return '참고';
  if (m.id === 'range') return valueText('range', o.series.range.at(-1)?.value);
  return valueText(m.id, m.compared && m.after != null ? m.after : m.current);
}
function deltaText(m) {
  if (m.id === 'range') return m.delta ? (m.delta > 0 ? '+' : '−') + Math.abs(m.delta) + '반음' : '';
  if (m.before == null || m.after == null) return '';
  const d = r1(m.after - m.before), unit = m.unit === 'cent' ? ' cent' : m.unit === '초' ? '초' : '';
  return (d > 0 ? '+' : d < 0 ? '−' : '±') + Math.abs(d) + unit;
}
function flowSvg(m, o, pts, takes = pts.length) {
  const W = 318, H = 138, top = 14, bottom = 118, vals = pts.map(p => p.value);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * .12; lo -= pad; hi += pad;
  const up = m.direction === -1 ? v => (v - lo) / (hi - lo) : v => (hi - v) / (hi - lo);   // smaller is better: drawn higher
  const x = i => i / (pts.length - 1) * (W - 12), y = v => top + up(v) * (bottom - top);
  const line = pts.map((p, i) => x(i).toFixed(1) + ',' + y(p.value).toFixed(1)).join(' '), end = pts.length - 1, ex = x(end), ey = y(pts[end].value);
  const cut = o.mp ? pts.findIndex(p => p.date >= o.mp.from) : -1;
  const divider = cut > 0 ? '<line x1="' + x(cut).toFixed(1) + '" x2="' + x(cut).toFixed(1) + '" y1="0" y2="' + bottom + '" stroke="#D0D5DD" stroke-dasharray="2 3" data-gm-mx-divider/>' +
    '<text x="' + (x(cut) + 4).toFixed(1) + '" y="9" font-size="9" fill="#7D8597">' + Number(o.mp.from.slice(5, 7)) + '월</text>' : '';
  const md = d => Number(d.slice(5, 7)) + '/' + Number(d.slice(8, 10));
  const dir = m.direction === -1 || m.direction === 1 ? '위가 좋아요' : m.id === 'range' ? '위가 높은 음' : '';
  return '<div class="gm-flow" data-gm-mx-graph="' + m.id + '"><svg class="gm-flow-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + e(m.title + ' 흐름, ' + ME.UNIT_WORD[pts[0].unit] + '별 평균 ' + pts.length + '개, 녹음 ' + takes + '개') + '" focusable="false">' +
    '<defs><linearGradient id="gmFlowL" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#C9AEFB"/><stop offset=".6" stop-color="#7A32F5"/><stop offset="1" stop-color="#5B1FC2"/></linearGradient>' +
    '<linearGradient id="gmFlowA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8B45FF" stop-opacity=".34"/><stop offset="1" stop-color="#7A32F5" stop-opacity="0"/></linearGradient></defs>' +
    [.25, .5, .75].map(f => '<line x1="0" x2="' + W + '" y1="' + (top + f * (bottom - top)).toFixed(1) + '" y2="' + (top + f * (bottom - top)).toFixed(1) + '" stroke="#F3EEFC"/>').join('') + divider +
    (dir ? '<text x="0" y="9" font-size="9" fill="#98A2B3">' + dir + '</text>' : '') +
    '<polygon points="0,' + bottom + ' ' + line + ' ' + ex.toFixed(1) + ',' + bottom + '" fill="url(#gmFlowA)"/>' +
    '<polyline points="' + line + '" fill="none" stroke="url(#gmFlowL)" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>' +
    (pts.length <= 40 ? pts.slice(0, -1).map((p, i) => '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.value).toFixed(1) + '" r="2.6" fill="#fff" stroke="#7A32F5" stroke-width="1.6" data-gm-mx-dot/>').join('') : '') +
    '<circle cx="' + ex.toFixed(1) + '" cy="' + ey.toFixed(1) + '" r="11" fill="#7A32F5" opacity=".12" data-gm-mx-glow/><circle cx="' + ex.toFixed(1) + '" cy="' + ey.toFixed(1) + '" r="5" fill="#5B1FC2" stroke="#fff" stroke-width="2"/>' +
    '<text x="0" y="' + (H - 4) + '" font-size="10" fill="#7D8597">' + e(pts[0].label || md(pts[0].date)) + '</text><text x="' + W + '" y="' + (H - 4) + '" font-size="10" fill="#7D8597" text-anchor="end">' + e(pts[end].label || md(pts[end].date)) + '</text></svg>' +
    // A few soft stars by the latest point (none with reduced motion, app/growth-month.css).
    '<span class="gm-stars" aria-hidden="true" style="left:' + (ex / W * 100).toFixed(2) + '%;top:' + (ey / H * 100).toFixed(2) + '%"><i style="--x:-16px;--y:-18px;--s:9px;--d:2.4s;--w:0s">' + STAR + '</i><i style="--x:6px;--y:-24px;--s:6px;--d:2.1s;--w:.9s">' + STAR + '</i><i style="--x:-26px;--y:-4px;--s:5px;--d:2.6s;--w:1.6s">' + STAR + '</i></span></div>';
}
function flowHtml(v) {
  const o = v.o, m = o.metrics.find(x => x.id === v.metric) || o.metrics[0], wk = v.period.kind === 'week' && v.period.from ? v.period : null;
  // 주 draws that week's days only (the numbers above stay the month's, "n월 기준"); 월 and 전체 draw the whole flow.
  const raw = (o.series[m.id] || []).filter(p => !wk || (p.date >= wk.from && p.date <= wk.to));
  // One point per day (주) · week (월) · month or quarter (전체): the average of that span's takes, so a long period
  // reads as a line instead of a comb of single takes.
  const pts = ME.buckets(raw, v.period.kind), unit = pts[0] ? ME.UNIT_WORD[pts[0].unit] : '';
  const state = m.id === 'passaggio' ? 'reference' : m.compared ? m.state : '';
  const last = o.mp ? '지난달' : '처음', vs = m.compared && m.before != null ? '<span class="gm-mx-vs">' + last + ' ' + e(m.id === 'range' ? m.before : valueText(m.id, m.before)) +
    (ARROW[m.state] || deltaText(m) ? ' <b>' + (ARROW[m.state] || '') + (deltaText(m) ? ' ' + e(deltaText(m)) : '') + '</b>' : '') + '</span>' : '';
  const head = '<div class="gm-mx-head" data-gm-mx-head><span class="gm-mx-name">' + e(SHORT[m.id] || m.title) + '</span><span class="gm-mx-big">' + e(shownValue(m, o)) + '</span>' +
    '<span class="gm-mx-state" data-gm-mx-state>' + (STATE_WORD[state] || '비교 전') + '</span>' + vs + '</div>';
  let body;
  if (m.id === 'passaggio') body = '<p class="gm-mx-empty">파사지오는 참고로만 봐요 · ' + e(G.PASSAGGIO_NOTE) + '. 곡별 결과는 아래 리포트에 있어요.</p>';
  else if (pts.length < 2) body = '<p class="gm-mx-empty" data-gm-mx-empty>' + (raw.length ? '다른 ' + (unit === '하루' ? '날' : unit) + '에 잰 녹음이 쌓이면 흐름을 그려요.' : wk ? '이 주에 잰 녹음이 아직 없어요.' : '이 기간에 잰 녹음이 아직 없어요.') + '</p>';
  else body = flowSvg(m, o, pts, raw.length) + '<p class="gm-mx-unit" data-gm-mx-unit>점 하나 = ' + e(unit) + ' 평균' + (wk ? ' · ' + (wk.current ? '이번 주' : GM.md(wk.from) + ' 주') : '') + '</p>';
  // The unit is in the big number above: the stats line says the numbers only ("±29", "3.4초", "F5").
  // 처음 · 최고 are of the averaged points (one stray take is not the best); 평균 and the count are of every take.
  const st = {...ME.stats(pts.map(p => p.value), m.direction), avg:ME.stats(raw.map(p => p.value)).avg, count:raw.length}, val = x => e(valueText(m.id, x).replace(/ cent$/, ''));
  const stats = st.count && m.id !== 'passaggio' ? '<p class="gm-mx-stats" data-gm-mx-stats><span>처음 <b>' + val(st.first) + '</b></span><span>평균 <b>' + val(m.id === 'range' ? Math.round(st.avg / 100) * 100 : st.avg) + '</b></span><span>' + (m.direction ? '최고' : '가장 높음') + ' <b>' + val(st.best) + '</b></span><span>녹음 ' + st.count + '개</span></p>' : '';
  return '<div class="gm-mx-flow" data-gm-mx-flow="' + m.id + '">' + head + body + stats + '</div>';
}
function metricsHtml(v) {
  const o = v.o, sel = v.metric;
  return '<section class="gm-card gm-mx" data-gm-section="metrics" aria-labelledby="gm-mx-title"><header class="gm-card-head"><h2 id="gm-mx-title">지표 6가지</h2><span>' +
    (v.period.kind === 'week' && o.mp ? Number(o.mp.from.slice(5, 7)) + '월 기준 · ' : '') + '눌러서 흐름 보기</span></header>' +
    '<div class="gm-mx-tiles" role="group" aria-label="지표 고르기">' + o.metrics.map(m => {
      const arrow = m.id === 'passaggio' || !m.compared ? '' : ARROW[m.state] || '';
      return '<button type="button" class="gm-mx-tile" data-gm-metric="' + m.id + '" aria-pressed="' + (m.id === sel) + '"><span>' + e(SHORT[m.id] || m.title) + '</span><b>' + e(shownValue(m, o)) + (arrow ? ' <small>' + arrow + '</small>' : '') + '</b></button>';
    }).join('') + '</div><div class="gm-mx-rule"></div>' + flowHtml(v) + '</section>';
}
/* 이 달 연습 구성 */
const MIX_TITLE = {week:'이 주 연습 구성', month:'이 달 연습 구성', all:'지금까지 연습 구성'};
function mixHtml(v) {
  const x = v.o.mix, k = v.period.kind;
  const title = (v.period.current || k === 'all' ? MIX_TITLE[k] : k === 'week' ? '그 주 연습 구성' : '그 달 연습 구성');
  const time = n => GM.minutesText(Math.round(n));
  const bars = x && x.total > 0 ? [['song', '곡', x.song], ['basic', '기본기', x.basic], ['rec', '녹음', x.rec]].map(([key, label, n]) => {
    const pct = Math.round(n / x.total * 100);
    return '<div class="gm-mix-row" data-gm-mix="' + key + '"><div class="gm-mix-bar"><i style="width:' + pct + '%"></i><span' + (pct >= 30 && key !== 'rec' ? ' class="on"' : '') + '>' + label + ' · ' + pct + '%</span></div><b>' + time(n) + '</b></div>';
  }).join('') : '<p class="gm-empty" data-gm-mix-empty>이 기간에 적은 연습 시간이나 녹음이 아직 없어요.</p>';
  return '<section class="gm-card gm-mix" data-gm-section="mix" aria-labelledby="gm-mix-title"><header class="gm-card-head"><h2 id="gm-mix-title">' + title + '</h2>' +
    (x && x.total > 0 ? '<span data-gm-mix-total>합계 ' + time(x.total) + '</span>' : '') + '</header>' + bars +
    '<p class="gm-mix-note">곡·기본기는 직접 적은 연습 시간, 녹음은 녹음한 길이예요.</p></section>';
}
/* The rows: 단계 · 다음 연습 · 주간 요약 · 곡마다 자세히 · 한 것 · 리포트 */
const sub = (text, attr = '') => text ? '<span class="gm-row-sub"' + attr + '>' + e(text) + '</span>' : '';
const fold = (key, title, subText, body, open, attr = '') => '<details class="gm-fold' + (key === 'report' ? ' gm-report-fold' : '') + '" data-gm-fold="' + key + '"' + attr + (open ? ' open' : '') + '><summary class="gm-row"' + (key === 'changes' ? ' data-gme-changes' : '') + '><span class="gm-row-text"><strong>' + title + '</strong> ' + subText + '</span>' + chevR + '</summary><div class="gm-fold-body">' + body + '</div></details>';
function lastWeek() { return periodAt('week', shiftDay(GM.period('week', todayOf()).from, -1)); }
function rowsHtml(v) {
  const k = v.period.kind, p = v.period, lv = lvText(), today = todayOf();
  const n = v.next?.items?.length || 0;
  let weekSub = '';
  if (k !== 'week') { try { const w = lastWeek(), d = GM.done(V.db, v.items, {from:w.from, to:w.to, prev:null, today}); weekSub = '지난주 ' + d.days + '일 · ' + GM.minutesText(d.minutes); } catch (error) { console.error(error); } }
  let songs = 0;
  try { songs = window.VzipGrowthChangesUI?.songChoices?.(v.items, changeOpts(v))?.length || 0; } catch (error) { console.error(error); }
  let doneSub = '';
  try { const d = GM.done(V.db, v.items, {from:p.from, to:p.to, prev:null, today}); doneSub = '녹음 ' + d.recordings + '개 · 레슨 ' + d.lessons + '번'; } catch {}
  const report = '<div class="gm-report ' + (k === 'week' ? 'ws-page' : 'growth-page') + '" data-gm-report="' + k + '"' + (k === 'week' ? ' data-weekly-summary' : ' data-growth') + '></div>';
  const reportFold = k === 'week'
    ? fold('report', '주간 요약', sub(p.current ? '이번 주 · 연습·녹음·성장' : '그 주 · 연습·녹음·성장'), '<p class="growth-flow-note" data-gm-week-ai><i class="ph ph-info" aria-hidden="true"></i><span>주간 AI 종합은 아직 없어요. AI 종합은 월·전체에서 받을 수 있어요.</span></p>' + report, v.open.has('report'))
    : fold('report', k === 'all' ? '전체 리포트' : p.current ? '이 달 리포트' : '그 달 리포트', sub(k === 'all' ? '지표·AI 종합·흐름·음역·다음 연습' : '지표·음역·AI 종합·계획·지난 기록'), report, v.open.has('report'));
  return '<section class="gm-rows" data-gm-section="rows" aria-label="더 보기">' +
    (lv ? '<a class="gm-row" href="#/levels" data-gme-lv aria-label="' + e('단계 ' + lv + ', 단계 보기') + '"><span class="gm-row-text"><strong>단계</strong> <span class="gm-row-sub" data-gme-lv-text>' + e(lv) + '</span></span>' + chevR + '</a>' : '') +
    fold('next', '다음 연습', sub(n ? '오늘 할 것 ' + n + '개' : '지금은 없어요', ' data-gm-next-sub'), nextHtml(v), v.open.has('next')) +
    (k === 'week' ? '' : '<button type="button" class="gm-row" data-gm-week-jump><span class="gm-row-text"><strong>주간 요약</strong> ' + sub(weekSub) + '</span>' + chevR + '</button>') +
    fold('changes', '곡마다 자세히', sub(songs ? songs + '곡' : '견줄 곡 없음'), lineHtml(v) + changesHtml(v), v.open.has('changes'), ' data-gm-changes-fold') +
    fold('done', p.current ? WORDS[k].done : WORDS[k].then || WORDS[k].done, sub(doneSub), doneHtml(v), v.open.has('done')) + '</section>' +
    // The period's whole report: its own row under the list, opening onto the page (its cards are its own).
    reportFold;
}

/* ---------- the screen ---------- */
const PILL = (p, today) => {
  if (p.kind === 'all') return '전체';
  if (p.kind === 'week') return p.current ? '이번 주' : GM.md(p.from) + ' 주';
  const m = Number(p.from.slice(5, 7)) + '월';
  return p.current ? '이번 달 · ' + m : (p.from.slice(0, 4) !== today.slice(0, 4) ? p.from.slice(0, 4) + '년 ' : '') + m;
};
function barHtml(v) {
  const p = v.period, k = p.kind, first = v.first || '';
  const prev = k !== 'all' && !!first && first < p.from, next = k !== 'all' && !p.current;
  const arrow = (dir, on) => '<button type="button" class="gm-step-btn" data-gm-move="' + dir + '" aria-label="' + (dir < 0 ? '이전 ' : '다음 ') + WORDS[k].step + '"' + (on ? '' : ' disabled') + '><i class="ph ph-caret-' + (dir < 0 ? 'left' : 'right') + '" aria-hidden="true"></i></button>';
  return '<div class="gm-period-panel" id="gm-period-panel" data-gm-period-panel' + (v.periodOpen ? '' : ' hidden') + '><div class="gm-bar"><div class="growth-view-tabs growth-range gm-period" role="group" aria-label="성장 기간"><span class="growth-range-label" aria-hidden="true">기간</span>' +
    PERIODS.map(([key, label]) => '<button type="button" data-gm-period="' + key + '" aria-pressed="' + (key === k) + '" class="' + (key === k ? 'active' : '') + '">' + label + '</button>').join('') + '</div>' +
    '<div class="gm-step" data-gm-step>' + (k === 'all' ? '' : arrow(-1, prev)) + '<p class="gm-label" data-gm-label>' + e(p.label) + (k !== 'all' && p.current ? ' <small>' + (k === 'week' ? '이번 주' : '이번 달') + '</small>' : '') + '</p>' + (k === 'all' ? '' : arrow(1, next)) + '</div></div></div>';
}
/** The period pill beside the tabs (it opens 주 · 월 · 전체 and ‹ ›). */
function paintPill(v) {
  const slot = v.host.parentElement?.querySelector('[data-gm-period-slot]');
  if (!slot) return;
  slot.innerHTML = '<button type="button" class="gm-period-pill" data-gm-period-open aria-controls="gm-period-panel" aria-expanded="' + !!v.periodOpen + '" aria-label="기간 ' + e(v.period.label) + ', 바꾸기">' +
    '<span data-gm-pill-text>' + e(PILL(v.period, todayOf())) + '</span>' + chevD + '</button>';
  slot.querySelector('[data-gm-period-open]').onclick = ev => {
    v.periodOpen = !v.periodOpen;
    ev.currentTarget.setAttribute('aria-expanded', String(v.periodOpen));
    const panel = v.host.querySelector('[data-gm-period-panel]');
    if (panel) panel.hidden = !v.periodOpen;
    if (v.periodOpen) panel?.querySelector('[data-gm-period][aria-pressed="true"]')?.focus({preventScroll:true});
  };
}
/** The report of the period (what #/growth-flow showed), mounted by its own renderer. */
function mountReport(v) {
  const box = v.host.querySelector('[data-gm-report]'), p = v.period;
  if (!box) return;
  V.growthReport?.leave?.(); V.weeklySummary?.leave?.();
  if (p.kind === 'week') { v.reportReady = true; V.weeklySummary?.mount(box, {week:p.from}); return; }
  // 다음 연습 reads the shared growth model; the month report may first keep last months' reports (which starts that
  // model afresh), so it is worked out once the report is drawn — one model pass, as before.
  v.reportReady = false;
  const key = v.reportKey;
  Promise.resolve(V.growthReport?.mount(box, {kind:p.kind, month:p.from.slice(0, 7), onMonth:key => go(v, periodAt('month', key + '-01'))}))
    .catch(() => {}).then(() => { if (v.reportKey !== key || view !== v || !v.host.isConnected) return; v.reportReady = true; paintNext(v); });
}
/** To another period: drawn again, the address replaced (no new history entry). */
function go(v, p) {
  v.period = p; V.growthPeriod?.set(p.kind);
  try { history.replaceState(null, '', hashOf(p)); } catch {}
  paint(v);
}
/** 목표에 담기 of a 다음 연습 item (the row's button or 한마디's suggestion): today's goal, the same one 전체 분석's 목표
 * 담기 makes (same id), so the places never make it twice. */
function addGoal(v, i) {
  const it = v.next?.items?.[i], a = it?.action;
  if (!a || a.kind !== 'add-goal' || !String(a.title || '').trim()) return;
  const date = V.today(), id = 'overall-growth:' + date + ':' + a.metric;
  if (todayGoals().some(g => g.id === id || norm(g.title) === norm(a.title))) { V.toast('오늘 이미 담은 목표예요.'); return; }
  const title = a.title + (a.minutes ? ' (' + a.minutes + '분)' : '');
  if (V.change(db => { db.dailyGoals ||= []; db.dailyGoals.push({id, date, title, source:'personal', sourceId:'overall-growth', completed:false,
    order:db.dailyGoals.filter(x => x.date === date).length, created:Date.now()}); }, {silent:true})) { V.toast('오늘의 연습 목표에 담았어요.'); paintNext(v); }
  else V.toast('목표를 저장하지 못했어요.', 'error');
}
function paintWord(v) {
  const old = v.host.querySelector('[data-gm-section="word"]');
  if (!old || !v.o) return;
  const wrap = document.createElement('div'); wrap.innerHTML = wordHtml(v);
  const next = wrap.firstElementChild; old.replaceWith(next); bindWord(v, next);
}
function bindWord(v, box) {
  box.querySelector('[data-gm-suggest]')?.addEventListener('click', ev => addGoal(v, Number(ev.currentTarget.dataset.gmSuggest)));
  // AI 종합: the report's own button (월별 · 전체 리포트), so what it sends is asked first exactly as there; its card opens.
  box.querySelector('[data-gm-ai]')?.addEventListener('click', () => {
    const run = v.host.querySelector(v.period.kind === 'all' ? '[data-gm-report] [data-overall-ai-run]' : '[data-gm-report] [data-monthly-ai-run]');
    if (!run) { V.toast('리포트를 불러오는 중이에요. 잠시 뒤 다시 눌러 주세요.'); return; }
    const report = v.host.querySelector('[data-gm-fold="report"]');
    if (report && !report.open) report.open = true;
    run.closest('[data-monthly-ai],[data-overall-ai]')?.scrollIntoView({behavior:window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block:'start'});
    run.click();
  });
}
function paint(v) {
  if (!v.host.isConnected) return;
  const k = v.period.kind, key = k + ':' + v.period.from;
  // The report of the same period, already mounted (it reads the list itself): kept as it is, so a redraw of the blocks
  // above it (the list loaded, a record added) never drops what is open or running in it.
  const kept = v.reportKey === key ? v.host.querySelector('[data-gm-report]') : null;
  v.next = kept && v.reportReady || k === 'week' ? nextModel(v) : undefined;
  try { v.o = ME ? overview(v) : null; } catch (error) { console.error(error); v.o = null; }
  // 나: 한마디 · 연습량 · 목 상태 · 지표 6가지 · 연습 구성, then the rows (단계 · 다음 연습 · 주간 요약 · 곡마다 자세히 · 한 것 · 리포트).
  v.host.innerHTML = barHtml(v) + (v.o ? wordHtml(v) + tilesHtml(v) + metricsHtml(v) + mixHtml(v) : '') + rowsHtml(v) +
    '<p class="small muted growth-disclaimer">수치는 음성 측정에 기반한 참고 정보예요. 분석하지 않은 녹음에는 결과를 만들어 넣지 않고, 연습 시간은 직접 적은 시간만 더해요.</p>';
  paintPill(v);
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
  const word = v.host.querySelector('[data-gm-section="word"]');
  if (word) bindWord(v, word);
  v.host.querySelectorAll('[data-gm-metric]').forEach(b => b.onclick = () => {
    v.metric = b.dataset.gmMetric;
    v.host.querySelectorAll('[data-gm-metric]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    const old = v.host.querySelector('[data-gm-mx-flow]'), wrap = document.createElement('div');
    wrap.innerHTML = flowHtml(v); old?.replaceWith(wrap.firstElementChild);
  });
  v.host.querySelector('[data-gm-week-jump]')?.addEventListener('click', () => { v.open.add('report'); go(v, lastWeek()); window.scrollTo({top:0}); });
  v.host.querySelectorAll('[data-gm-fold]').forEach(d => d.addEventListener('toggle', () => {
    const name = d.dataset.gmFold;
    if (d.open) v.open.add(name); else v.open.delete(name);
    if (name === 'changes' && d.open && !v.changesMounted) mountChanges(v, v.host.querySelector('[data-gm-section="changes"]'));
  }));
  const changes = v.host.querySelector('[data-gm-section="changes"]'), next = v.host.querySelector('[data-gm-section="next"]');
  v.changesMounted = false;
  if (changes && v.open.has('changes')) mountChanges(v, changes);
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
    open:new Set(kept ? kept.open : []), periodOpen:!!kept?.periodOpen, metric:kept?.metric || 'intonation', focus:ask?.focus || '', first:firstDay(cached)};
  if (ask?.changes) view.open.add('changes');
  // An address that names the period (기록 › 지난 리포트, the old report links) opens that period's report.
  if (ask?.report) view.open.add('report');
  if (cached.length) paint(view); else host.innerHTML = (window.VZ.loadingRows?.() ?? '<p class="muted" role="status">불러오는 중…</p>');
  let items;
  try { items = await M.list(); } catch (error) { items = cached; if (!cached.length && my === request && host.isConnected) host.insertAdjacentHTML('afterbegin', '<p class="growth-hub-note" role="status">녹음 목록을 불러오지 못해 녹음·변화 항목은 빠졌을 수 있어요.</p>'); }
  if (my !== request || !host.isConnected) return;
  if (items !== cached || !cached.length) { view.items = items; view.first = firstDay(items); paint(view); }
  const results = await readPrecision();
  if (my !== request || !host.isConnected || !Array.isArray(results)) return;
  view.results = results; if (view.reportReady) paintNext(view);
}
const isDay = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '');
V.route('vocal-growth', {title:'성장', tab:'growth', noAutoRefresh:true,
  render:() => (V.growthTabs?.('me', '<div class="gm-period-slot" data-gm-period-slot></div>') || '') + '<div class="gm" data-growth-month></div>',
  actions:() => V.growthHub?.archive?.() || '',
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
      at:kind === 'week' && isDay(week) ? week : kind === 'month' && /^\d{4}-\d{2}$/.test(month) ? month + '-01' : '', changes:q?.get('changes') === '1' || !!gc, focus:gc, report:['week', 'month', 'all'].includes(kind) && !gc} : null;
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
  // 한 것 · 연습량 · 목 상태 · 연습 구성 read the records: drawn again in place (the folds and the report stay as they are).
  try { if (ME) v.o = overview(v); } catch (error) { console.error(error); }
  const swap = (sel, html) => { const old = v.host.querySelector(sel); if (!old || !html) return; const wrap = document.createElement('div'); wrap.innerHTML = html; if (wrap.firstElementChild) old.replaceWith(wrap.firstElementChild); };
  swap('[data-gm-section="done"]', doneHtml(v));
  if (v.o) { swap('[data-gm-section="tiles"]', tilesHtml(v)); swap('[data-gm-section="mix"]', mixHtml(v)); }
  if (v.reportReady) paintNext(v);
});
})();
