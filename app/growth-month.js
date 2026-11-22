/* 성장 › 이번 달 (#/vocal-growth) — the first tab of 성장 (성장 개편 안 B, phase 2). Four blocks for one period
 * (주간 · 월별 · 전체, 월별 by default, kept on this device):
 *   ⓐ 한 것        entered practice minutes and days, recordings, 보이스 체크 days, lessons, 레슨 지적 체크 runs
 *                  (app/growth-month-model.js, 주간 요약's rules for any span)
 *   ⓑ 달라진 것     무엇이 달라졌나 for the period (app/growth-changes-ui.js with a period: the previous period vs this one,
 *                  same song, same method and version), 전체 · 곡별, the 연습 녹음 포함 switch (off by default — then the
 *                  numbers are 결과 리포트's), and 지표 자세히: 월별 분석's 이달의 변화 and six measures (전체: 전체 분석's six,
 *                  주간: 주간 요약's 성장 card)
 *   ⓒ 다음 연습     one list from every place that recommends something (app/growth-next-model.js), top 5 and 더 보기,
 *                  each with where it came from and a way to start it
 *   ⓓ 지난 흐름 보기 → #/growth-flow (app/monthly-growth.js): the former 결과 리포트 screens with charts, 음역 흐름, AI 코치
 *                  (월별 · 전체 only), 지난 기록·보관 리포트 and 분석 기준
 * Read-only apart from 목표에 담기 (a daily goal, as 전체 분석's 목표 담기 makes it). The period, the switch and the chosen
 * song are per-device conveniences (localStorage), not part of the library. */
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
const PERIODS = [['week', '주간'], ['month', '월별'], ['all', '전체']];
const WORDS = {
  week:{done:'이번 주에 한 것', changes:'지난주와 비교', flow:'주마다의 기록 · 요일별 연습 시간과 지난주 비교', last:'지난주'},
  month:{done:'이번 달에 한 것', changes:'지난달과 비교', flow:'달마다의 흐름 · 지난달과 같은 곡끼리 비교', last:'지난달'},
  all:{done:'지금까지 한 것', changes:'처음과 최근 비교', flow:'처음부터 지금까지 · 같은 곡의 처음과 최근 비교', last:''}
};
let request = 0, view = null;   // view: {host, items, period, practice, song, results}

/* ---------- ⓐ 한 것 ---------- */
const tile = (key, label, value, sub = '') => '<li data-gm-tile="' + key + '"><span>' + e(label) + '</span><strong>' + e(value) + '</strong>' + (sub ? '<small>' + e(sub) + '</small>' : '') + '</li>';
function doneHtml(v) {
  const p = v.period;
  let d;
  try { d = GM.done(V.db, v.items, {from:p.from, to:p.to, prev:p.prev, today:todayOf()}); } catch (error) { console.error(error); return ''; }
  const pts = d.points;
  return '<section class="gm-section gm-done" data-gm-section="done" aria-labelledby="gm-done-title"><header class="gm-head"><h2 id="gm-done-title">' + WORDS[p.kind].done + '</h2>' +
    '<p class="gm-basis" data-gm-basis="done">' + e(GM.compareText(p, d)) + '</p></header><ul class="gm-tiles">' +
    tile('minutes', '연습 시간', GM.minutesText(d.minutes), '직접 적은 시간') + tile('days', '연습한 날', d.days + '일') +
    tile('recordings', '녹음', d.recordings + '개') + tile('voice-check', '보이스 체크', d.voiceCheckDays + '일') +
    tile('lessons', '레슨', d.lessons + '번') +
    tile('points', '레슨 지적 체크', pts.runs + '번', pts.runs ? '지켰어요 ' + pts.kept + ' · 놓쳤어요 ' + pts.missed : '부르면서 체크한 기록') + '</ul>' +
    // 연습 시간 자세히 (#/practice-stats, app/views-more.js): 날짜별 막대와 곡별 연습량 — what the six numbers above do not show.
    '<a class="gm-more-link" href="#/practice-stats" data-gm-practice-stats><i class="ph ph-chart-bar" aria-hidden="true"></i><span>연습 시간 자세히</span><i class="ph ph-caret-right" aria-hidden="true"></i></a></section>';
}

/* ---------- ⓑ 달라진 것 ---------- */
const changeOpts = v => ({period:v.period.from ? {from:v.period.from, to:v.period.to} : null, practice:v.practice});
const STATE_LINE = {compare:k => ({week:'지난주 녹음과 견줄 수 있어요', month:'지난달 녹음과 견줄 수 있어요', all:'처음과 최근을 견줄 수 있어요'})[k],
  new:k => k === 'all' ? '견줄 다른 날 녹음이 없어요' : '이 기간 전 녹음이 없어요', hold:() => '판정 보류'};
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
  const songOn = !!v.song && list.some(s => s.songId === v.song);
  const songName = songOn ? V.songTitle(v.song) || '곡' : '';
  const scope = '<div class="growth-song-scope" role="group" aria-label="달라진 것 범위">' +
    '<button type="button" data-gm-scope="all" aria-pressed="' + !songOn + '">전체</button>' +
    '<button type="button" data-gm-scope="song" aria-pressed="' + songOn + '" aria-haspopup="dialog"><span>' + (songOn ? e(songName) : '곡별') + '</span><i class="ph ph-caret-down" aria-hidden="true"></i></button></div>';
  const fallback = v.song && !songOn && V.song(v.song) ? '<p class="small muted growth-song-note" data-gm-song-fallback>' + e(V.songTitle(v.song)) + ' 녹음이 이 기간에는 없어 전체를 보여 드려요.</p>' : '';
  const toggle = '<label class="gm-switch"><input type="checkbox" role="switch" data-gm-practice' + (v.practice ? ' checked' : '') + '><span>연습 녹음 포함</span></label>';
  const note = v.practice ? '노래 연습실·트레이닝 연습 녹음도 넣어 견줘요. 끄면 결과 리포트와 같은 기준이에요.' : '곡 녹음만 견줘요. 노래 연습실·트레이닝 연습 녹음은 빼요.';
  const detail = detailHtml(v, songOn ? v.song : '');
  return '<section class="gm-section gm-changes" data-gm-section="changes" aria-labelledby="gm-changes-title"><header class="gm-head"><h2 id="gm-changes-title">달라진 것</h2>' +
    '<p class="gm-basis" data-gm-basis="changes">' + e(WORDS[k].changes + ' · 같은 곡을 같은 방법·같은 분석 버전으로 잰 녹음끼리') + '</p></header>' +
    '<div class="gm-tools">' + scope + toggle + '</div><p class="gm-note" data-gm-practice-note>' + e(note) + '</p>' + fallback +
    (C ? '<div class="gc-host" data-growth-changes></div>' : '') +
    // 곡별: the song's own screen (성장 › 곡 › 곡 하나, app/vocal-lab.js) says the same verdict with the same switch.
    (songOn ? '<a class="gc-chip gm-song-link" href="#/vocal-lab/' + encodeURIComponent(v.song) + '" data-gm-song-detail><i class="ph ph-waveform" aria-hidden="true"></i><span>이 곡 자세히</span></a>' : '') +
    (detail ? '<details class="growth-secondary gm-detail" data-gm-detail><summary><span><i class="ph ph-chart-bar" aria-hidden="true"></i> 지표 자세히</span><small>' +
      (k === 'month' ? '이달의 변화 · 6가지 지표' : k === 'all' ? '6가지 지표' : '이번 주 성장') + '</small></summary><div class="gm-detail-body">' + detail + '</div></details>' : '') + '</section>';
}
function mountChanges(v, section) {
  const host = section.querySelector('[data-growth-changes]'), C = window.VzipGrowthChangesUI;
  if (!host || !C) return;
  const list = C.songChoices(v.items, changeOpts(v)), song = v.song && list.some(s => s.songId === v.song) ? v.song : '';
  const empty = v.period.from ? {verdicts:'이 기간에 남긴 들어 본 평가가 없어요. 곡 줄의 들어 보고 평가로 남길 수 있어요.',
    songs:'이 기간에 ' + WORDS[v.period.kind].last + ' 녹음과 견줄 같은 곡 녹음이 없어요. 같은 곡을 다시 녹음하고 분석하면 여기에 보여 드려요.'} : null;
  C.mount(host, v.items, {...changeOpts(v), songId:song, head:false, ...(empty ? {empty} : {})});
  section.querySelector('[data-gm-scope="all"]').onclick = () => { if (!v.song) return; v.song = ''; save(SONG_KEY, ''); paintChanges(v); };
  section.querySelector('[data-gm-scope="song"]').onclick = () => {
    if (!list.length) { V.toast('이 기간에는 곡 녹음이 없어요.'); return; }
    V.growthSongMenu(list.map(s => ({songId:s.songId, title:s.title, line:'<span data-gm-song-state="' + s.state + '">' + e(STATE_LINE[s.state](v.period.kind)) + '</span>'})), song,
      id => { v.song = id; save(SONG_KEY, id); if (v.host.isConnected) paintChanges(v); });
  };
  section.querySelector('[data-gm-practice]').onchange = ev => { v.practice = ev.target.checked; save(PRACTICE_KEY, v.practice ? '1' : ''); paintChanges(v); };
}
function paintChanges(v) {
  const old = v.host.querySelector('[data-gm-section="changes"]');
  if (!old) return;
  const wrap = document.createElement('div'); wrap.innerHTML = changesHtml(v);
  const next = wrap.firstElementChild; old.replaceWith(next); mountChanges(v, next);
}

/* ---------- ⓒ 다음 연습 ---------- */
const CHIP = {homework:'숙제', 'lesson-point':'레슨 지적', measure:'측정', precision:'측정', goal:'계획', plan:'계획', ai:'AI'};
const SHOWN = 5;
const norm = s => window.VzipGrowthNext?.norm?.(s) ?? String(s || '').replace(/\s+/g, '');
const todayGoals = () => (V.db.dailyGoals || []).filter(g => g?.date === V.today() && !(V.db.deleted?.dailyGoals || []).includes(g.id));
function nextModel(v) {
  const N = window.VzipGrowthNext;
  if (!N) return null;
  let overall = null, tips = null, changes = null;
  try { overall = V.growthModel?.(v.items)?.overall || null; } catch (error) { console.error(error); }
  try { tips = V.practiceTips?.(v.items) || null; } catch (error) { console.error(error); }
  const gone = V.db.deleted?.monthlyGrowthReports || [];
  const monthly = (V.db.monthlyGrowthReports || []).filter(r => r && !gone.includes(r.id)).sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')))[0] || null;
  if (Array.isArray(v.results) && window.VzipGrowthChanges) try {
    changes = window.VzipGrowthChanges.taskChanges(v.results, {compare:window.VzipPrecisionReport?.compare, labels:window.VzipPrecisionReport?.LABELS || {}, groups:window.VzipPrecisionSession?.GROUPS || []});
  } catch (error) { console.error(error); }
  try { return N.build({db:V.db, today:V.today(), overall, monthly, tips, precision:{results:Array.isArray(v.results) ? v.results : null, changes}, limit:50}); }
  catch (error) { console.error(error); return null; }
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
    case 'practice-tip': return link('#/guided-practice/' + encodeURIComponent('analysis:' + a.tipKey), '따라 하기');
    case 'route': return link(a.href, '열기');
    case 'goal': case 'routine': return link('#/home', '오늘 목표에서 하기');
    case 'plan': return link('#/practice-set', '오늘의 연습으로');
    case 'ai-draft': {
      const ref = a.ref?.kind;
      if (ref === 'overall-ai') return link('#/growth-flow?period=all', 'AI 코치 보기');
      if (ref === 'monthly-ai') return link('#/growth-flow?period=month', 'AI 코치 보기');
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
    '<p class="gm-basis" data-gm-basis="next">오늘 기준 · 숙제를 먼저, 그다음 레슨 지적·측정·계획·AI 초안 순서 · 겹치는 것은 하나로</p></header>' + body +
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

/* ---------- ⓓ 지난 흐름 ---------- */
function flowHtml(v) {
  const k = v.period.kind;
  const sub = k === 'week' ? '주간 요약 · 요일별 연습 시간 · 저장·공유' : k === 'month' ? '월별 분석 · 꺾은선 · 음역 흐름 · AI 월간 코치 · 지난 기록·보관 리포트' : '전체 분석 · 꺾은선 · 음역 흐름 · AI 전체 코치 · 분석 기준';
  return '<section class="gm-section gm-flow" data-gm-section="flow" aria-labelledby="gm-flow-title"><header class="gm-head"><h2 id="gm-flow-title">지난 흐름</h2>' +
    '<p class="gm-basis" data-gm-basis="flow">' + e(WORDS[k].flow) + '</p></header>' +
    '<div class="list icons"><a class="item" href="#/growth-flow?period=' + k + '" data-gm-flow><i class="ph ph-chart-line-up" aria-hidden="true"></i><span class="item-main"><span class="item-title">지난 흐름 보기</span><span class="item-sub">' + e(sub) + '</span></span><i class="ph ph-caret-right chev" aria-hidden="true"></i></a></div>' +
    (k === 'week' ? '<p class="gm-note" data-gm-week-ai>주간 AI 코치는 아직 없어요. AI 코치는 월별·전체에서 쓸 수 있어요.</p>' : '') + '</section>';
}

/* ---------- the screen ---------- */
function paint(v) {
  if (!v.host.isConnected) return;
  const k = v.period.kind;
  const bar = '<div class="gm-bar"><div class="growth-view-tabs growth-range gm-period" role="group" aria-label="성장 기간"><span class="growth-range-label" aria-hidden="true">기간</span>' +
    PERIODS.map(([key, label]) => '<button type="button" data-gm-period="' + key + '" aria-pressed="' + (key === k) + '" class="' + (key === k ? 'active' : '') + '">' + label + '</button>').join('') +
    '</div><p class="gm-label" data-gm-label>' + e(v.period.label) + '</p></div>';
  v.host.innerHTML = bar + '<div class="gm-grid">' + doneHtml(v) + changesHtml(v) + nextHtml(v) + flowHtml(v) + '</div>' +
    '<p class="small muted growth-disclaimer">수치는 음성 측정에 기반한 참고 정보예요. 분석하지 않은 녹음에는 결과를 만들어 넣지 않고, 연습 시간은 직접 적은 시간만 더해요.</p>';
  v.host.querySelectorAll('[data-gm-period]').forEach(b => b.onclick = () => {
    if (b.dataset.gmPeriod === v.period.kind) return;
    V.growthPeriod?.set(b.dataset.gmPeriod);
    v.period = GM.period(b.dataset.gmPeriod, todayOf());
    paint(v);
    v.host.querySelector('[data-gm-period="' + v.period.kind + '"]')?.focus();
  });
  mountChanges(v, v.host.querySelector('[data-gm-section="changes"]'));
  bindNext(v, v.host.querySelector('[data-gm-section="next"]'));
}
/** The 발성 정밀 측정 results of this account (read-only, this device), for 다음 연습; null when there is no store. */
async function readPrecision() {
  if (!window.VzipPrecisionStore) return null;
  const owner = window.vzipCloudUserId?.() || window.VzipAccountScope?.owner || 'local';
  try { return (await window.VzipPrecisionStore.list(owner)).map(r => r.result).filter(Boolean); } catch { return null; }
}
async function mount(host) {
  const my = ++request;
  const period = GM.period(V.growthPeriod?.get() || 'month', todayOf());
  let song = load(SONG_KEY);
  if (song && !V.song(song)) song = '';
  const cached = M.cached?.() || [];
  view = {host, items:cached, period, practice:load(PRACTICE_KEY) === '1', song, results:null, next:null};
  if (cached.length) paint(view); else host.innerHTML = (window.VZ.loadingRows?.() ?? '<p class="muted" role="status">불러오는 중…</p>');
  let items;
  try { items = await M.list(); } catch (error) { items = cached; if (!cached.length && my === request && host.isConnected) host.insertAdjacentHTML('afterbegin', '<p class="growth-hub-note" role="status">녹음 목록을 불러오지 못해 녹음·변화 항목은 빠졌을 수 있어요.</p>'); }
  if (my !== request || !host.isConnected) return;
  if (items !== cached || !cached.length) { view.items = items; paint(view); }
  const results = await readPrecision();
  if (my !== request || !host.isConnected || !Array.isArray(results)) return;
  view.results = results; paintNext(view);
}
V.route('vocal-growth', {title:'성장', tab:'growth', noAutoRefresh:true,
  render:() => (V.growthTabs?.('month') || '') + '<div class="gm" data-growth-month></div>',
  mount(main, r) {
    // Older addresses of 결과 리포트 lead to where their content is now (one history entry, replaced).
    // #/vocal-growth/training (the former 보컬 트레이닝): practice is on 오늘 › 연습하기 now.
    if (r?.params?.[0] === 'training') { V.homeShow?.('practice'); location.replace('#/home'); return; }
    const alias = {analysis:'#/vocal-analysis'}[r?.params?.[0]];
    const q = r?.query, gc = q?.get('gc');
    const to = alias || (gc ? '#/growth-flow?period=all&gc=' + encodeURIComponent(gc) : q?.get('mode') === 'monthly' ? '#/growth-flow?period=month' : '');
    if (to) { location.replace(to); return; }
    mount(main.querySelector('[data-growth-month]'));
  },
  leave() { request++; }
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
