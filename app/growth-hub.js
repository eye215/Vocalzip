/* 성장 통합 (#385, docs/audit/2026-11-13-growth-unification.md §4 · PR B): one 성장 menu with three tabs.
 *   결과 리포트   #/vocal-growth (전체·월별) and #/weekly-summary — unchanged screens, the tabs sit above them
 *   보컬 분석     #/vocal-analysis — pick a song, then the existing 보컬 연구소 (#/vocal-lab/<songId>)
 *   보컬 트레이닝 #/vocal-training — entries to the existing 노래 연습실 · 보이스 체크 · 연습 세트 · 추천 연습, recent records
 * (#/vocal-growth/analysis and #/vocal-growth/training are accepted as other spellings of the two tab addresses.)
 * Nothing is stored, moved or deleted here; it only reads. Every older link (#/vocal-lab…, #/lab-reports, #/compare,
 * #/practice-room…) keeps working as before.
 * History: the three tabs and the 전체·월별·주간 period are ONE place in the browser history — switching between them
 * replaces the address, so 뒤로 from a screen opened here returns to the tab it was opened from and 뒤로 on a tab
 * leaves 성장 in one step. */
(() => {
'use strict';
const V = window.VZ, M = V?.media;
if (!V || !M) return;
const e = V.esc, G = window.VzipGrowthMetrics;
const TABS = [['report', '결과 리포트', '#/vocal-growth'], ['analysis', '보컬 분석', '#/vocal-analysis'], ['training', '보컬 트레이닝', '#/vocal-training']];
/** The three 성장 tabs; `active` is report | analysis | training. Links, so each tab has its own address. */
V.growthTabs = active => '<nav class="growth-top-tabs" aria-label="성장 메뉴">' + TABS.map(([key, label, href]) =>
  '<a href="' + href + '" data-growth-tab="' + key + '" data-growth-replace' + (key === active ? ' aria-current="page"' : '') + '>' + label + '</a>').join('') + '</nav>';
/** Move between the tabs / periods of 성장 without adding a history entry. */
const go = hash => { if (location.hash !== hash) location.replace(hash); };
V.growthHub = {tabs:TABS.map(([key, , href]) => ({key, href})), go};
const ROOTS = ['vocal-growth', 'vocal-analysis', 'vocal-training', 'weekly-summary'];
const route = () => document.body.dataset.vzRoute;
document.addEventListener('click', ev => {
  if (ev.defaultPrevented || ev.button || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
  // The bottom 성장 item, pressed while already inside 성장, is a tab switch too.
  const a = ev.target.closest?.('a[data-growth-replace]') || (ROOTS.includes(route()) ? ev.target.closest?.('.v-nav a[data-nav="growth"]') : null);
  if (!a) return;
  ev.preventDefault(); go(a.getAttribute('href'));
});
// 뒤로 on a screen that belongs to 성장 (연구소 · 분석 · 보관함 · 보이스 체크 …) opened with nothing behind it (a pasted
// link, a fresh window): 결과 리포트 instead of 오늘. With a history it is the ordinary 뒤로 (app/core.js).
document.addEventListener('click', ev => {
  if (!ev.target.closest?.('[data-back]') || history.length > 1) return;
  if (!document.querySelector('.v-nav a[data-nav="growth"][aria-current="page"]')) return;
  ev.stopPropagation(); V.nav('#/vocal-growth');
}, true);

const chev = '<i class="ph ph-caret-right chev" aria-hidden="true"></i>';
const row = (href, icon, title, sub, attr = '', chip = '') => '<a class="item" href="' + href + '"' + attr + '><i class="ph ph-' + icon + '" aria-hidden="true"></i><span class="item-main"><span class="growth-hub-title"><span class="item-title">' + e(title) + '</span>' + chip + '</span>' +
  (sub ? '<span class="item-sub">' + e(sub) + '</span>' : '') + '</span>' + chev + '</a>';
const gone = (list, id) => (V.db.deleted?.[list] || []).includes(id);
const shortDate = d => d ? V.dateLabel(d).replace(/ \(.*$/, '') : '';
const cols = (main, side) => '<div class="growth-hub-cols"><div class="growth-hub-col" data-hub-col="main">' + main + '</div><div class="growth-hub-col" data-hub-col="side">' + side + '</div></div>';
const empty = (title, text, action = '') => '<div class="growth-hub-empty"><strong>' + e(title) + '</strong><p>' + e(text) + '</p>' + action + '</div>';
let request = 0;
// A recording's day as every growth screen reads it (app/growth-dataset.js): recorded date, else the Korea day it was made.
const dayOf = m => window.VzipGrowthDataset?.dateOf(m) ?? M.dateOf(m);

/* ---------- 보컬 분석 ---------- */
/** 비교 가능 / 판정 보류 / 분석 전 from the per-song reports 결과 리포트 already made (V.growthModel) — nothing is
 * calculated again per row. 비교 가능: at least one measure has two takes it could compare. */
const STATE = {ok:'비교 가능', hold:G?.HOLD_LABEL || '판정 보류', none:'분석 전'};
const stateOf = (count, report) => !count ? 'none' : report && (G?.METRICS || []).some(d => !d.reference && report[d.id] && report[d.id].state !== 'hold') ? 'ok' : 'hold';
const chip = state => '<span class="growth-hub-chip" data-state="' + state + '">' + e(STATE[state]) + '</span>';
/** A small word after a recording's name: 연습 (not counted by 결과 리포트) · 영상. A kind, not a state or a score. */
const KIND = {practice:['연습', '연습 녹음 · 결과 리포트에는 넣지 않아요'], video:['영상', '영상 녹음']};
const kindChip = kind => '<span class="growth-hub-chip" data-state="none" data-hub-kind="' + kind + '" title="' + e(KIND[kind][1]) + '">' + KIND[kind][0] + '</span>';
async function mountAnalysis(host) {
  const my = ++request, songs = V.songsNewest();
  const saved = (V.db.comparisonReports || []).filter(r => !gone('comparisonReports', r.id)).length;
  const foot = '<div class="list icons growth-hub-list">' + row('#/lab-reports', 'folder-open', '리포트 보관함', saved ? '저장한 리포트 ' + saved + '개' : '저장한 리포트가 아직 없어요', ' data-hub-reports') +
    row('#/library', 'list-checks', '녹음을 직접 골라 분석', '전체 녹음에서 선택한 뒤 분석을 눌러요', ' data-hub-library') + '</div>';
  if (!songs.length) { host.innerHTML = V.empty('music-notes', '먼저 곡을 추가해 주세요.', '<a class="btn" href="#/songs">내 곡으로 가기</a>') + foot; return; }
  if (!M.cached().length) host.innerHTML = '<p class="growth-hub-note" role="status">녹음을 불러오는 중…</p>';
  let items, failed = false;
  try { items = await M.list(); } catch { items = M.cached(); failed = true; }
  if (my !== request || !host.isConnected) return;
  // One pass over the list 결과 리포트 reads, and its model (one M.list(), one set of song reports for both tabs;
  // V.growthModel checks its inputs on every call, so this is never older than the list and the records).
  const reports = new Map((V.growthModel?.(items)?.overall?.reports || []).map(r => [r.songId, r.report]));
  // Which recordings a song row counts is the dataset's rule 'songList' (app/growth-dataset.js): the song's own,
  // videos too — 연습실 and 트레이닝 recordings of the song included, as 보컬 연구소 lists them. Those are said
  // (연습 N개 포함): 결과 리포트 does not count them, and the row should not look as if it did.
  const ds = V.growthDataset(items), bySong = new Map(), recent = [];
  for (const r of ds.rows) {
    if (r.deleted) continue;                                           // in the deleted list: gone on every growth screen
    if (r.analysed && recent.length < 5) recent.push(r.m);           // the list is newest recording first
    if (ds.why(r, 'songList')) continue;
    const s = bySong.get(r.songId) || {count:0, analysed:0, latest:'', practice:0, video:0};
    s.count++; if (r.analysed) s.analysed++;
    if (r.practiceTake) s.practice++; if (r.video) s.video++;
    if (r.date > s.latest) s.latest = r.date;
    bySong.set(r.songId, s);
  }
  // Songs with recordings first, the most recently recorded on top; the rest keep the 내 곡 order.
  const withTakes = songs.filter(s => bySong.has(s.id)).sort((a, b) => bySong.get(b.id).latest.localeCompare(bySong.get(a.id).latest));
  const without = songs.filter(s => !bySong.has(s.id));
  const songRow = s => {
    const t = bySong.get(s.id), state = stateOf(t.analysed, reports.get(s.id));
    // Counts as they are: an unanalysed recording is said (the 분석 전 chip), never shown as a result.
    const part = [t.practice ? '연습 ' + t.practice + '개' : '', t.video ? '영상 ' + t.video + '개' : ''].filter(Boolean).join(' · ');
    const sub = '녹음 ' + t.count + '개' + (part ? ' (' + part + ' 포함)' : '') + (t.analysed ? ' · 분석 ' + t.analysed + '개' : '') + (t.latest ? ' · 최근 ' + shortDate(t.latest) : '');
    return row('#/vocal-lab/' + encodeURIComponent(s.id), 'waveform', s.title, sub, ' data-hub-song="' + e(s.id) + '" data-hub-state="' + state + '"', chip(state));
  };
  // 연습: a 연습실 · 트레이닝 연습 recording of a song (in 보컬 분석, not in 결과 리포트). 영상: a video.
  const kinds = m => { const r = ds.row(m); return (r?.hasSong && r.practiceTake ? kindChip('practice') : '') + (r?.video ? kindChip('video') : ''); };
  const takeRow = m => row('#/analysis/' + encodeURIComponent(m.id), 'chart-line', M.label(m),
    [m.songId && V.song(m.songId) ? V.songTitle(m.songId) : '곡 미지정', shortDate(dayOf(m))].filter(Boolean).join(' · '), ' data-hub-take="' + e(m.id) + '"', kinds(m));
  const practised = withTakes.some(s => bySong.get(s.id).practice);
  const main = '<h2 class="sec">곡별 분석 <span class="small muted" style="font-weight:500">녹음이 있는 곡 ' + withTakes.length + '</span></h2>' +
    (withTakes.length ? '<div class="list icons growth-hub-list" data-hub-songs>' + withTakes.map(songRow).join('') + '</div>' +
        (practised ? '<p class="small muted growth-hub-caption" data-hub-practice-note>연습은 노래 연습실·트레이닝 연습으로 남긴 녹음이에요. 여기서는 함께 보고, 결과 리포트·주간 요약·계획 결과에는 넣지 않아요.</p>' : '')
      : empty('아직 곡에 연결된 녹음이 없어요', '곡을 지정해 녹음하거나, 전체 녹음에서 곡을 지정하면 여기에서 변화와 비교를 볼 수 있어요.', '<a class="btn secondary block" href="#/record" data-hub-empty-action>곡 녹음하러 가기</a>')) +
    (without.length ? '<details class="growth-hub-more"><summary>녹음이 없는 곡 ' + without.length + '</summary><div class="list growth-hub-list">' +
      without.map(s => '<a class="item" href="#/song/' + encodeURIComponent(s.id) + '"><span class="item-main"><span class="item-title">' + e(s.title) + '</span><span class="item-sub">곡 상세에서 녹음을 추가해요</span></span>' + chev + '</a>').join('') + '</div></details>' : '');
  const side = (withTakes.length ? '<p class="growth-hub-hint"><i class="ph ph-hand-tap" aria-hidden="true"></i><span>곡을 누르면 보컬 연구소가 열려요. 녹음을 골라 듣고, 날짜별 변화와 두 녹음 비교를 볼 수 있어요.</span></p>' : '') +
    (recent.length ? '<h2 class="sec">최근 분석한 녹음</h2><div class="list icons growth-hub-list" data-hub-takes>' + recent.map(takeRow).join('') + '</div>' : '') +
    '<h2 class="sec">보관함과 다른 분석</h2>' + foot;
  host.innerHTML = (failed ? '<p class="growth-hub-note" role="status">녹음 목록을 새로 불러오지 못해 이 기기에 남아 있는 목록으로 보여 드려요.</p>' : '') + cols(main, side) +
    '<p class="small muted growth-disclaimer">수치는 음성 측정에 기반한 참고 정보예요. 분석하지 않은 녹음에는 결과를 만들어 넣지 않아요.</p>';
}
V.route('vocal-analysis', {title:'성장', tab:'growth', noAutoRefresh:true,
  render:() => V.growthTabs('analysis') + '<div class="growth-hub" data-growth-analysis></div>',
  mount(main) { mountAnalysis(main.querySelector('[data-growth-analysis]')); },
  leave() { request++; }
});

/* ---------- 보컬 트레이닝 ---------- */
// 노래 연습실 submissions live on practice rows (app/practice-room-model.js record()).
const roomRows = () => (V.db.practices || []).filter(p => p?.practiceRoom && !p.practiceRoom.demo && !gone('practices', p.id))
  .sort((a, b) => String(b.practiceRoom.date || b.date || '').localeCompare(String(a.practiceRoom.date || a.date || '')) || (b.created || 0) - (a.created || 0));
// 추천 연습 (app/practice-tips.js), worked out from the list in hand on every draw: nothing is kept between draws,
// so an analysis saved meanwhile is counted.
function tipsHtml(items) {
  const r = items && V.practiceTips?.(items);
  if (!r) return '';
  // Where a recommended exercise is practised today: 연습 따라 하기 (app/guided-practice.js).
  const guided = key => '#/guided-practice/' + encodeURIComponent('analysis:' + key);
  const rows = !r.enough ? '' : r.tips.length ? r.tips.slice(0, 2).map(t => row(guided(t.key), 'target', t.name, t.metric + ' ' + t.value + ' · ' + t.basis + ' · 권장 ' + t.minutes + '분', ' data-hub-tip="' + e(t.key) + '"')).join('')
    : row(guided('maintain'), 'target', '롱톤 유지 연습', '측정값이 고르게 안정적이에요 · 권장 5분', ' data-hub-tip="maintain"');
  return '<h2 class="sec">추천 연습</h2>' + (rows ? '<div class="list icons growth-hub-list" data-hub-tips>' + rows + '</div><p class="small muted growth-hub-caption">측정값을 참고한 일반 연습 가이드예요. 통증이나 쉰 목소리가 있으면 쉬어 주세요.</p>'
    : '<p class="growth-hub-note" data-hub-tips-empty>분석된 녹음이 3개 이상 모이면 맞춤 연습을 추천해요 (지금 ' + r.count + '개).</p>');
}
function trainingHtml(items) {
  const rooms = roomRows(), checks = V.voiceCheck?.checks?.() || [], checked = !!V.voiceCheck?.doneToday?.(), set = V.practiceSetEntry?.();
  const entries = '<div class="list icons growth-hub-list" data-hub-training>' +
    row('#/practice-room', 'microphone-stage', '노래 연습실', '9단계 과제 · ' + (rooms.length ? '제출 ' + rooms.length + '개' : '아직 제출 전'), ' data-hub-room') +
    (V.voiceCheck ? row('#/voice-check', 'waveform', '매일 보이스 체크', (checked ? '오늘 완료' : '오늘 아직 · 30초') + (checks.length ? ' · 기록 ' + checks.length + '개' : ''), ' data-hub-check') : '') +
    (V.practiceSetEntry ? row('#/practice-set', 'play-circle', '오늘 연습 세트', set ? (set.state === 'new' ? set.line : set.title + ' · ' + set.line) : '워밍업부터 곡 연습까지 순서대로', ' data-hub-set') : '') +
    row('#/practice-review', 'compass', '다음 연습 추천', '기록과 분석을 바탕으로 고른 연습', ' data-hub-review') + '</div>';
  const recent = rooms.slice(0, 5).map(p => {
    const r = p.practiceRoom, song = r.songId ? V.songTitle(r.songId) : '';
    const sub = [V.dateLabel(p.date), song, Number(p.minutes) > 0 ? V.minutes(Number(p.minutes)) : ''].filter(Boolean).join(' · ');
    return row('#/practice-room?result=' + encodeURIComponent(r.id), 'check-circle', r.title || '연습실 과제', sub, ' data-hub-result="' + e(r.id) + '"');
  }).join('');
  // 트레이닝 recordings (녹음 종류 = 트레이닝), newest first as the list is.
  const takes = items ? V.growthDataset(items).rows.filter(r => !r.deleted && r.category === 'training').map(r => r.m) : null;
  const takeRows = (takes || []).slice(0, 5).map(m => row('#/recording/' + encodeURIComponent(m.id), 'microphone', M.label(m),
    [V.dateLabel(dayOf(m)), Number(m.durationSeconds) > 0 ? V.minutes(Math.max(1, Math.round(m.durationSeconds / 60))) : ''].filter(Boolean).join(' · '), ' data-hub-training-take="' + e(m.id) + '"')).join('');
  const main = '<h2 class="sec">측정하고 연습하기</h2>' + entries + tipsHtml(items);
  const side = '<h2 class="sec">최근 트레이닝 녹음' + (takes ? ' <span class="small muted" style="font-weight:500">' + takes.length + '</span>' : '') + '</h2>' +
    (takeRows ? '<div class="list icons growth-hub-list" data-hub-training-takes>' + takeRows + '</div>'
      : takes ? empty('아직 트레이닝 녹음이 없어요', '발성·스케일 연습을 녹음하고 종류를 트레이닝으로 정하면 여기에 모여요.') : '<p class="growth-hub-note" role="status">녹음을 불러오는 중…</p>') +
    '<h2 class="sec">최근 연습실 기록 <span class="small muted" style="font-weight:500">' + rooms.length + '</span></h2>' +
    (recent ? '<div class="list icons growth-hub-list" data-hub-results>' + recent + '</div>'
      : empty('아직 제출한 과제가 없어요', '노래 연습실에서 과제를 제출하면 여기에 최근 기록이 쌓여요.')) +
    '<a class="btn secondary block growth-hub-all" href="#/practices">연습 기록 전체 보기</a>';
  return cols(main, side) + '<p class="small muted growth-disclaimer">연습실의 자동 확인은 기초 분석이에요. 보컬 채점이나 발성 건강 진단이 아니에요.</p>';
}
let trainingItems = null;
async function mountTraining(host) {
  const my = ++request;
  // Entries first (no waiting), with the list already in memory when there is one; then the fresh list.
  trainingItems = M.cached().length ? M.cached() : null;
  host.innerHTML = trainingHtml(trainingItems);
  let items;
  try { items = await M.list(); } catch { items = M.cached(); }
  if (my !== request || !host.isConnected || items === trainingItems) return;
  trainingItems = items; host.innerHTML = trainingHtml(items);
}
V.route('vocal-training', {title:'성장', tab:'growth', noAutoRefresh:true,
  render:() => V.growthTabs('training') + '<div class="growth-hub" data-growth-training></div>',
  mount(main) { mountTraining(main.querySelector('[data-growth-training]')); },
  leave() { request++; }
});
// A record that arrives while the tab is open (another device, a finished submission) shows without leaving the tab.
window.addEventListener('vzip:data-changed', () => {
  const host = route() === 'vocal-training' && document.querySelector('[data-growth-training]');
  if (host) host.innerHTML = trainingHtml(trainingItems);
});
// So does a recording that was added, analysed or re-sorted meanwhile.
for (const name of ['vzip:v6-media', 'vzip:analysis-saved']) window.addEventListener(name, () => {
  const analysis = route() === 'vocal-analysis' && document.querySelector('[data-growth-analysis]');
  if (analysis) mountAnalysis(analysis);
  const training = route() === 'vocal-training' && document.querySelector('[data-growth-training]');
  if (training) mountTraining(training);
});
})();
