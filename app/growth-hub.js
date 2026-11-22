/* 성장 (#385 통합, then 성장 개편 안 B — scratchpad GROWTH_B_PLAN, phases 2–4): one 성장 menu with three tabs.
 *   이번 달  #/vocal-growth — app/growth-month.js: 한 것 · 달라진 것 · 다음 연습 · 지난 흐름 보기 (주간·월별·전체 inside).
 *            지난 흐름 (#/growth-flow?period=week|month|all) is its sub-page: the former 결과 리포트 screens, unchanged.
 *   곡       #/vocal-analysis — the songs with an analysed take, each with ONE word (좋아진 방향 · 비슷함 · 판정 보류 ·
 *            녹음 하나 …) from the verdict every 성장 screen shares (VZ.growthSong below, app/growth-song-model.js), then
 *            곡 하나 (#/vocal-lab/<songId>, app/vocal-lab.js): 이 곡의 변화 · 약한 곳 · 두 녹음 비교 · 깊이 보기
 *   연구소   #/growth-lab — app/growth-lab.js: the second-tier tools (소리 깊이 보기 · 기록·기준), each with its state
 * The things you DO (오늘 연습 세트 · 매일 보이스 체크 · 노래 연습실 · 보컬 트레이닝) are on 오늘 › 연습하기
 * (design-system/student-home-app.js); their screens belong to the 오늘 tab.
 * Older addresses lead into the new places: #/vocal-training and #/vocal-growth/training → 오늘 › 연습하기,
 * #/vocal-growth/analysis → 곡, #/weekly-summary(?week=) → 지난 흐름 주간, #/vocal-growth?mode=monthly → 지난 흐름 월별,
 * #/vocal-growth?gc= → 지난 흐름 전체 (that song's line), #/growth (the old practice-time page) → 이번 달. #/lab-reports,
 * #/vocal-lab…, #/compare, #/practice-room… keep their own screens; opened with nothing behind them, 뒤로 goes to the
 * tab they belong to (보관함 and the other deep tools → 연구소).
 * Nothing is stored, moved or deleted here; it only reads (the 성장 period is a per-device convenience).
 * History: the three tabs are ONE place in the browser history — switching between them replaces the address, so 뒤로
 * from a screen opened here returns to the tab it was opened from and 뒤로 on a tab leaves 성장 in one step. The
 * period (주간·월별·전체) does not change the address of 이번 달; inside 지난 흐름 it replaces the address. */
(() => {
'use strict';
const V = window.VZ, M = V?.media;
if (!V || !M) return;
const e = V.esc, G = window.VzipGrowthMetrics;
const TABS = [['month', '이번 달', '#/vocal-growth'], ['songs', '곡', '#/vocal-analysis'], ['lab', '연구소', '#/growth-lab']];
/** The three 성장 tabs; `active` is month | songs | lab. Links, so each tab has its own address. */
V.growthTabs = active => '<nav class="growth-top-tabs" aria-label="성장 메뉴">' + TABS.map(([key, label, href]) =>
  '<a href="' + href + '" data-growth-tab="' + key + '" data-growth-replace' + (key === active ? ' aria-current="page"' : '') + '>' + label + '</a>').join('') + '</nav>';
/** Move between the tabs / periods of 성장 without adding a history entry. */
const go = hash => { if (location.hash !== hash) location.replace(hash); };
V.growthHub = {tabs:TABS.map(([key, , href]) => ({key, href})), go};
/** The 성장 period (주간 · 월별 · 전체) kept on this device: 'week' | 'month' (default) | 'all'. Not part of the library. */
const PERIOD_KEY = 'vzip:growth-period', PERIODS = ['week', 'month', 'all'];
V.growthPeriod = {
  get() { try { const p = localStorage.getItem(PERIOD_KEY); return PERIODS.includes(p) ? p : 'month'; } catch { return 'month'; } },
  set(p) { if (!PERIODS.includes(p)) return; try { localStorage.setItem(PERIOD_KEY, p); } catch {} }
};
const ROOTS = ['vocal-growth', 'vocal-analysis', 'growth-lab'];
const route = () => document.body.dataset.vzRoute;
document.addEventListener('click', ev => {
  if (ev.defaultPrevented || ev.button || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
  // The bottom 성장 item, pressed while already inside 성장, is a tab switch too.
  const a = ev.target.closest?.('a[data-growth-replace]') || (ROOTS.includes(route()) ? ev.target.closest?.('.v-nav a[data-nav="growth"]') : null);
  if (!a) return;
  ev.preventDefault(); go(a.getAttribute('href'));
});
// 뒤로 on a screen that belongs to 성장 (곡 분석 · 녹음 분석 · 보관함 · 정밀 측정 …) opened with nothing behind it (a pasted
// link, a fresh window): the 성장 tab it belongs to instead of 오늘 — a song's screens → 곡, the deep tools → 연구소,
// anything else → 이번 달. With a history it is the ordinary 뒤로 (app/core.js). The practice screens (보이스 체크,
// 노래 연습실, 연습 세트, 따라 하기) belong to 오늘, where the ordinary 뒤로 already leads.
const HOME_OF = {'vocal-lab':'#/vocal-analysis', analysis:'#/vocal-analysis', 'lab-reports':'#/growth-lab', 'voice-path':'#/growth-lab',
  'precision-measurement':'#/growth-lab', 'precision-report':'#/growth-lab', 'growth-ear':'#/growth-lab', 'growth-basis':'#/growth-lab'};
document.addEventListener('click', ev => {
  if (!ev.target.closest?.('[data-back]') || history.length > 1) return;
  if (!document.querySelector('.v-nav a[data-nav="growth"][aria-current="page"]')) return;
  ev.stopPropagation(); V.nav(HOME_OF[route()] || '#/vocal-growth');
}, true);

const chev = '<i class="ph ph-caret-right chev" aria-hidden="true"></i>';
const row = (href, icon, title, sub, attr = '', chip = '') => '<a class="item" href="' + href + '"' + attr + '><i class="ph ph-' + icon + '" aria-hidden="true"></i><span class="item-main"><span class="growth-hub-title"><span class="item-title">' + e(title) + '</span>' + chip + '</span>' +
  (sub ? '<span class="item-sub">' + e(sub) + '</span>' : '') + '</span>' + chev + '</a>';
const gone = (list, id) => (V.db.deleted?.[list] || []).includes(id);
const shortDate = d => d ? V.dateLabel(d).replace(/ \(.*$/, '') : '';
const cols = (main, side) => '<div class="growth-hub-cols"><div class="growth-hub-col" data-hub-col="main">' + main + '</div><div class="growth-hub-col" data-hub-col="side">' + side + '</div></div>';
const STATE_HOLD = G?.HOLD_LABEL || '판정 보류';
const empty = (title, text, action = '') => '<div class="growth-hub-empty"><strong>' + e(title) + '</strong><p>' + e(text) + '</p>' + action + '</div>';
let request = 0;
// A recording's day as every growth screen reads it (app/growth-dataset.js): recorded date, else the Korea day it was made.
const dayOf = m => window.VzipGrowthDataset?.dateOf(m) ?? M.dateOf(m);

/* ---------- 곡: one verdict per song (성장 개편 안 B, phase 3) ---------- */
// The 연습 녹음 포함 switch is ONE device setting for 이번 달 (app/growth-month.js), this list and 곡 하나 (app/vocal-lab.js).
const PRACTICE_KEY = 'vzip:growth-practice';
const todayOf = () => window.VzipGrowthDataset?.koreaDay?.(Date.now()) || V.today();
/** A song's verdict as every 성장 screen says it: the takes of VzipGrowthDataset.verdictRule({practice}) (through
 * app/growth-changes-ui.js songTakes, so a second measurement with the MR removed counts as it does there), judged by
 * app/growth-song-model.js. Nothing is stored. */
V.growthSong = {
  practice() { try { return localStorage.getItem(PRACTICE_KEY) === '1'; } catch { return false; } },
  setPractice(on) { try { if (on) localStorage.setItem(PRACTICE_KEY, '1'); else localStorage.removeItem(PRACTICE_KEY); } catch {} },
  /** songId → {off, on, now, effect, args}: the verdict without / with 연습 takes, the one that counts now, the line
   * saying what the switch changes ('' when nothing), and the takes it was made from. */
  verdicts(items, practice = V.growthSong.practice()) {
    const S = window.VzipGrowthSong, U = window.VzipGrowthChangesUI, out = new Map();
    if (!S || !U?.songTakes) return out;
    const off = new Map(U.songTakes(items, false).map(s => [s.songId, s]));
    for (const s of U.songTakes(items, true)) {
      const mine = off.get(s.songId) || {songId:s.songId, title:s.title, takes:[], reference:s.reference};
      let a = S.verdict(mine);
      const b = S.verdict(s);
      // Only 연습 recordings of the song are analysed: said as 판정 보류 with the reason, never as "nothing".
      if (a.state === 'none' && b.takes) a = {...a, state:'hold', word:S.WORD.hold, reason:'practice-only', text:'분석한 곡 녹음이 없어요 · 연습 녹음만 ' + b.takes + '개 있어요'};
      out.set(s.songId, {off:a, on:b, now:practice ? b : a, effect:S.effect(a, b, practice), args:practice ? s : mine});
    }
    return out;
  },
  of(items, songId, practice) { return V.growthSong.verdicts(items, practice).get(songId) || null; },
  /** 지난달 대비 for one song (this month against the latest take before it), or null when there is no such pair. */
  month(items, songId, practice = V.growthSong.practice()) {
    const S = window.VzipGrowthSong, GM = window.VzipGrowthMonth, x = V.growthSong.of(items, songId, practice);
    if (!S || !GM || !x) return null;
    try { const p = GM.period('month', todayOf()); return S.month({...x.args, period:{from:p.from, to:p.to}}); } catch (error) { console.error(error); return null; }
  }
};
/** The one word of a song row — 좋아진 방향 · 아쉬운 방향 · 엇갈림 · 비슷함 · 판정 보류 · 녹음 하나 · 분석 전: a state, never a score. */
const chip = (state, word) => '<span class="growth-hub-chip" data-state="' + state + '">' + e(word) + '</span>';
/** A small word after a recording's name: 연습 (counted only with 연습 녹음 포함) · 영상. A kind, not a state or a score. */
const KIND = {practice:['연습', '연습 녹음 · 결과 리포트에는 넣지 않아요'], video:['영상', '영상 녹음']};
const kindChip = kind => '<span class="growth-hub-chip" data-state="none" data-hub-kind="' + kind + '" title="' + e(KIND[kind][1]) + '">' + KIND[kind][0] + '</span>';
const SEARCH_FROM = 8;   // a search field once the list is this long
let hubQuery = '';
function filterSongs(host) {
  const q = hubQuery.trim().toLowerCase(), rows = [...host.querySelectorAll('[data-hub-songs] [data-hub-song]')];
  let shown = 0;
  for (const a of rows) { const hit = !q || (a.dataset.hubTitle || '').toLowerCase().includes(q); a.hidden = !hit; if (hit) shown++; }
  const none = host.querySelector('[data-hub-search-empty]');
  if (none) none.hidden = shown > 0;
}
async function mountAnalysis(host) {
  const my = ++request, songs = V.songsNewest();
  // 들어 보고 남긴 평가 (kind listen-verdict) live in the same list but are not 보관함 reports.
  const saved = (V.db.comparisonReports || []).filter(r => r.kind !== 'listen-verdict' && !gone('comparisonReports', r.id)).length;
  const foot = '<div class="list icons growth-hub-list">' + row('#/lab-reports', 'folder-open', '리포트 보관함', saved ? '저장한 리포트 ' + saved + '개' : '저장한 리포트가 아직 없어요', ' data-hub-reports') +
    row('#/library', 'list-checks', '녹음을 직접 골라 분석', '전체 녹음에서 선택한 뒤 분석을 눌러요', ' data-hub-library') +
    // 소리 길 흔적 (시험판, app/voice-path.js): two takes of a song side by side.
    (window.VzipVoicePath ? row('#/voice-path', 'path', '소리 길 흔적 · 시험판', '두 녹음에서 들리는 흔적을 나란히 봐요', ' data-hub-voice-path') : '') + '</div>';
  if (!songs.length) { host.innerHTML = V.empty('music-notes', '먼저 곡을 추가해 주세요.', '<a class="btn" href="#/songs">내 곡으로 가기</a>') + foot; return; }
  if (!M.cached().length) host.innerHTML = window.VZ.loadingRows();
  let items, failed = false;
  try { items = await M.list(); } catch { items = M.cached(); failed = true; }
  if (my !== request || !host.isConnected) return;
  // Which recordings belong to a song is the dataset's rule 'songList' (app/growth-dataset.js): the song's own, videos
  // too, 연습실 and 트레이닝 recordings too. Whether those 연습 takes count for the word is the 연습 녹음 포함 switch.
  const ds = V.growthDataset(items), bySong = new Map(), recent = [];
  for (const r of ds.rows) {
    if (r.deleted) continue;                                           // in the deleted list: gone on every growth screen
    if (r.analysed && recent.length < 5) recent.push(r.m);           // the list is newest recording first
    if (ds.why(r, 'songList')) continue;
    const s = bySong.get(r.songId) || {count:0, analysed:0, latest:'', latestAnalysed:'', practice:0, practiceAnalysed:0, video:0, videoAnalysed:0};
    s.count++;
    if (r.analysed) { s.analysed++; if (r.date > s.latestAnalysed) s.latestAnalysed = r.date; if (r.practiceTake) s.practiceAnalysed++; else if (r.video) s.videoAnalysed++; }
    if (r.practiceTake) s.practice++; if (r.video) s.video++;
    if (r.date > s.latest) s.latest = r.date;
    bySong.set(r.songId, s);
  }
  const practice = V.growthSong.practice();
  let verdicts = new Map();
  try { verdicts = V.growthSong.verdicts(items, practice); } catch (error) { console.error(error); }
  // Songs with an analysed take, the most recently sung on top; then the songs still to analyse; the rest keep the 내 곡 order.
  const by = key => (a, b) => bySong.get(b.id)[key].localeCompare(bySong.get(a.id)[key]) || bySong.get(b.id).latest.localeCompare(bySong.get(a.id).latest);
  const analysed = songs.filter(s => bySong.get(s.id)?.analysed).sort(by('latestAnalysed'));
  const waiting = songs.filter(s => bySong.has(s.id) && !bySong.get(s.id).analysed).sort(by('latest'));
  const without = songs.filter(s => !bySong.has(s.id));
  const songRow = s => {
    const t = bySong.get(s.id), v = verdicts.get(s.id)?.now, state = v?.state || 'hold';
    const counted = v ? v.takes : t.analysed;
    // What the count holds is said: 영상 always (the verdict counts videos), 연습 only with the switch on — off, how many were left out.
    const inside = [practice && t.practiceAnalysed ? '연습 ' + t.practiceAnalysed + '개' : '', t.videoAnalysed ? '영상 ' + t.videoAnalysed + '개' : ''].filter(Boolean).join(' · ');
    const part = (inside ? ' (' + inside + ' 포함)' : '') + (!practice && t.practiceAnalysed ? ' · 연습 ' + t.practiceAnalysed + '개는 빼고 봐요' : '');
    // Recordings of the song still to analyse are said, never counted as takes of the verdict.
    const sub = '분석한 녹음 ' + counted + '개' + part + (t.count > t.analysed ? ' · 분석 전 ' + (t.count - t.analysed) + '개' : '') + (t.latestAnalysed ? ' · 최근 ' + shortDate(t.latestAnalysed) : '');
    return row('#/vocal-lab/' + encodeURIComponent(s.id), 'waveform', s.title, sub, ' data-hub-song="' + e(s.id) + '" data-hub-state="' + state + '" data-hub-title="' + e(s.title) + '"', chip(state, v?.word || STATE_HOLD));
  };
  const waitingRow = s => {
    const t = bySong.get(s.id), part = [t.practice ? '연습 ' + t.practice + '개' : '', t.video ? '영상 ' + t.video + '개' : ''].filter(Boolean).join(' · ');
    return row('#/vocal-lab/' + encodeURIComponent(s.id), 'waveform', s.title, '녹음 ' + t.count + '개' + (part ? ' (' + part + ' 포함)' : '') + (t.latest ? ' · 최근 ' + shortDate(t.latest) : ''),
      ' data-hub-song="' + e(s.id) + '" data-hub-state="none"', chip('none', '분석 전'));
  };
  // 연습: a 연습실 · 트레이닝 연습 recording of a song. 영상: a video.
  const kinds = m => { const r = ds.row(m); return (r?.hasSong && r.practiceTake ? kindChip('practice') : '') + (r?.video ? kindChip('video') : ''); };
  const takeRow = m => row('#/analysis/' + encodeURIComponent(m.id), 'chart-line', M.label(m),
    [m.songId && V.song(m.songId) ? V.songTitle(m.songId) : '곡 미지정', shortDate(dayOf(m))].filter(Boolean).join(' · '), ' data-hub-take="' + e(m.id) + '"', kinds(m));
  const practised = analysed.some(s => bySong.get(s.id).practiceAnalysed);
  const tools = (analysed.length >= SEARCH_FROM ? '<div class="search growth-hub-search"><i class="ph ph-magnifying-glass" aria-hidden="true"></i><input type="search" data-hub-q placeholder="곡 제목 검색" aria-label="곡 제목 검색" value="' + e(hubQuery) + '"></div>' : '') +
    (practised ? '<label class="gm-switch growth-hub-switch"><input type="checkbox" role="switch" data-hub-practice' + (practice ? ' checked' : '') + '><span>연습 녹음 포함</span></label>' : '');
  const main = '<h2 class="sec">곡별 변화 <span class="small muted" style="font-weight:500">분석한 곡 ' + analysed.length + '</span></h2>' +
    (analysed.length ? (tools ? '<div class="growth-hub-tools">' + tools + '</div>' : '') +
        '<div class="list icons growth-hub-list" data-hub-songs>' + analysed.map(songRow).join('') + '</div>' +
        '<p class="growth-hub-note" data-hub-search-empty hidden>그 제목의 곡이 없어요.</p>' +
        '<p class="small muted growth-hub-caption" data-hub-rule-note>한마디는 그 곡의 처음과 최근 녹음을 같은 방법으로 잰 것끼리 견준 결과예요. 이번 달과 같은 기준이에요.' +
        (practised ? (practice ? ' 노래 연습실·트레이닝 연습 녹음도 넣어 견줘요.' : ' 노래 연습실·트레이닝 연습 녹음은 빼고 견줘요.') : '') + '</p>'
      : waiting.length ? empty('아직 분석한 녹음이 없어요', '아래 곡을 열어 녹음을 분석하면 처음과 최근을 견줘 한마디로 보여 드려요.')
      : empty('아직 곡에 연결된 녹음이 없어요', '곡을 지정해 녹음하거나, 전체 녹음에서 곡을 지정하면 여기에서 변화와 비교를 볼 수 있어요.', '<a class="btn secondary block" href="#/record" data-hub-empty-action>곡 녹음하러 가기</a>')) +
    (waiting.length ? '<details class="growth-hub-more" data-hub-waiting' + (analysed.length ? '' : ' open') + '><summary>아직 분석 전인 곡 ' + waiting.length + '</summary><div class="list icons growth-hub-list">' + waiting.map(waitingRow).join('') + '</div></details>' : '') +
    (without.length ? '<details class="growth-hub-more"><summary>녹음이 없는 곡 ' + without.length + '</summary><div class="list growth-hub-list">' +
      without.map(s => '<a class="item" href="#/song/' + encodeURIComponent(s.id) + '"><span class="item-main"><span class="item-title">' + e(s.title) + '</span><span class="item-sub">곡 상세에서 녹음을 추가해요</span></span>' + chev + '</a>').join('') + '</div></details>' : '');
  const side = (analysed.length + waiting.length ? '<p class="growth-hub-hint"><i class="ph ph-hand-tap" aria-hidden="true"></i><span>곡을 누르면 그 곡의 변화, 약한 곳, 두 녹음 비교를 한 화면에서 볼 수 있어요.</span></p>' : '') +
    (recent.length ? '<h2 class="sec">최근 분석한 녹음</h2><div class="list icons growth-hub-list" data-hub-takes>' + recent.map(takeRow).join('') + '</div>' : '') +
    '<h2 class="sec">보관함과 다른 분석</h2>' + foot;
  host.innerHTML = (failed ? '<p class="growth-hub-note" role="status">녹음 목록을 새로 불러오지 못해 이 기기에 남아 있는 목록으로 보여 드려요.</p>' : '') + cols(main, side) +
    '<p class="small muted growth-disclaimer">수치는 음성 측정에 기반한 참고 정보예요. 분석하지 않은 녹음에는 결과를 만들어 넣지 않아요.</p>';
  const q = host.querySelector('[data-hub-q]');
  if (q) { q.oninput = () => { hubQuery = q.value; filterSongs(host); }; filterSongs(host); }
  const sw = host.querySelector('[data-hub-practice]');
  if (sw) sw.onchange = async () => { V.growthSong.setPractice(sw.checked); await mountAnalysis(host); host.querySelector('[data-hub-practice]')?.focus({preventScroll:true}); };
}
V.route('vocal-analysis', {title:'성장', tab:'growth', noAutoRefresh:true,
  render:() => V.growthTabs('songs') + '<div class="growth-hub" data-growth-analysis></div>',
  mount(main) { mountAnalysis(main.querySelector('[data-growth-analysis]')); },
  leave() { request++; }
});

/* ---------- 연구소 is app/growth-lab.js. The former 보컬 트레이닝 tab was practice: that is 오늘 › 연습하기 now. ---------- */
/** Ask 오늘 to bring a part into view when it is drawn next ('practice' = 연습하기). Home reads the ask once
 * (design-system/student-home-app.js); it is a moment's note in memory, nothing is stored. */
V.homeShow = what => { V.homeWants = {what, at:Date.now()}; };
// A link to 오늘 that means its 연습하기 section (연구소's lead, 이번 달 › 다음 연습): <a href="#/home" data-home-practice>.
document.addEventListener('click', ev => {
  if (ev.button || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey) return;
  if (ev.target.closest?.('a[data-home-practice]')) V.homeShow('practice');
}, true);
// One history entry, replaced: 뒤로 from 오늘 does not come back here and forward again.
V.route('vocal-training', {title:'오늘', tab:'home', render:() => '', mount() { V.homeShow('practice'); location.replace('#/home'); }});
// A recording that was added, analysed or re-sorted meanwhile shows without leaving the tab.
for (const name of ['vzip:v6-media', 'vzip:analysis-saved']) window.addEventListener(name, () => {
  const analysis = route() === 'vocal-analysis' && document.querySelector('[data-growth-analysis]');
  if (analysis) mountAnalysis(analysis);
});
})();
