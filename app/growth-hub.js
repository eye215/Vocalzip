/* 성장 통합 (#385, docs/audit/2026-11-13-growth-unification.md §4 · PR B): one 성장 menu with three tabs.
 *   결과 리포트   #/vocal-growth (전체·월별) and #/weekly-summary — unchanged screens, the tabs sit above them
 *   보컬 분석     #/vocal-analysis — pick a song, then the existing 보컬 연구소 (#/vocal-lab/<songId>)
 *   보컬 트레이닝 #/vocal-training — entries to the existing 노래 연습실 · 보이스 체크 · 다음 연습 추천, and recent 연습실 records
 * Nothing is stored, moved or deleted here; it only reads. Every older link (#/vocal-lab…, #/lab-reports, #/compare,
 * #/practice-room…) keeps working as before. */
(() => {
'use strict';
const V = window.VZ, M = V?.media;
if (!V || !M) return;
const e = V.esc;
const TABS = [['report', '결과 리포트', '#/vocal-growth'], ['analysis', '보컬 분석', '#/vocal-analysis'], ['training', '보컬 트레이닝', '#/vocal-training']];
/** The three 성장 tabs; `active` is report | analysis | training. Links, so each tab has its own address. */
V.growthTabs = active => '<nav class="growth-top-tabs" aria-label="성장 메뉴">' + TABS.map(([key, label, href]) =>
  '<a href="' + href + '" data-growth-tab="' + key + '"' + (key === active ? ' aria-current="page"' : '') + '>' + label + '</a>').join('') + '</nav>';
V.growthHub = {tabs:TABS.map(([key, , href]) => ({key, href}))};

const chev = '<i class="ph ph-caret-right chev" aria-hidden="true"></i>';
const row = (href, icon, title, sub, attr = '') => '<a class="item" href="' + href + '"' + attr + '><i class="ph ph-' + icon + '" aria-hidden="true"></i><span class="item-main"><span class="item-title">' + e(title) + '</span>' +
  (sub ? '<span class="item-sub">' + e(sub) + '</span>' : '') + '</span>' + chev + '</a>';
const gone = (list, id) => (V.db.deleted?.[list] || []).includes(id);
let request = 0;

/* ---------- 보컬 분석 ---------- */
// The same recordings 보컬 연구소 lists for a song (app/vocal-lab.js): the song's own, without videos.
const analysed = m => !!m.analysis?.metrics;
async function mountAnalysis(host) {
  const my = ++request, songs = V.songsNewest();
  const reports = (V.db.comparisonReports || []).filter(r => !gone('comparisonReports', r.id)).length;
  const foot = '<div class="list icons growth-hub-list">' + row('#/lab-reports', 'folder-open', '리포트 보관함', reports ? '저장한 리포트 ' + reports + '개' : '저장한 리포트가 아직 없어요', ' data-hub-reports') +
    row('#/library', 'list-checks', '녹음을 직접 골라 분석', '전체 녹음에서 선택한 뒤 분석을 눌러요', ' data-hub-library') + '</div>';
  if (!songs.length) { host.innerHTML = V.empty('music-notes', '먼저 곡을 추가해 주세요.', '<a class="btn" href="#/songs">내 곡으로 가기</a>') + foot; return; }
  host.innerHTML = '<p class="growth-hub-note" role="status">녹음을 불러오는 중…</p>';
  let items, failed = false;
  try { items = await M.list(); } catch { items = M.cached(); failed = true; }
  if (my !== request || !host.isConnected) return;
  const bySong = new Map();
  for (const m of items) {
    if (!m.songId || M.isVideo(m) || !V.song(m.songId)) continue;
    const s = bySong.get(m.songId) || {count:0, analysed:0, latest:''};
    s.count++; if (analysed(m)) s.analysed++;
    const date = M.dateOf(m) || ''; if (date > s.latest) s.latest = date;
    bySong.set(m.songId, s);
  }
  // Songs with recordings first, the most recently recorded on top; the rest keep the 내 곡 order.
  const withTakes = songs.filter(s => bySong.has(s.id)).sort((a, b) => bySong.get(b.id).latest.localeCompare(bySong.get(a.id).latest));
  const without = songs.filter(s => !bySong.has(s.id));
  const songRow = s => {
    const t = bySong.get(s.id);
    // Counts as they are: an unanalysed recording is said, never shown as a result.
    const sub = '녹음 ' + t.count + '개 · ' + (t.analysed ? '분석 ' + t.analysed + '개' : '분석 전') + (t.latest ? ' · 최근 ' + V.dateLabel(t.latest).replace(/ \(.*$/, '') : '');
    return row('#/vocal-lab/' + encodeURIComponent(s.id), 'waveform', s.title, sub, ' data-hub-song="' + e(s.id) + '"');
  };
  host.innerHTML = (failed ? '<p class="growth-hub-note" role="status">녹음 목록을 새로 불러오지 못해 이 기기에 남아 있는 목록으로 보여 드려요.</p>' : '') +
    '<h2 class="sec">곡별 분석 <span class="small muted" style="font-weight:500">녹음이 있는 곡 ' + withTakes.length + '</span></h2>' +
    (withTakes.length ? '<div class="list icons growth-hub-list" data-hub-songs>' + withTakes.map(songRow).join('') + '</div>'
      : '<div class="growth-hub-empty"><strong>아직 곡에 연결된 녹음이 없어요</strong><p>곡을 지정해 녹음하거나, 전체 녹음에서 곡을 지정하면 여기에서 변화와 비교를 볼 수 있어요.</p></div>') +
    (without.length ? '<details class="growth-hub-more"><summary>녹음이 없는 곡 ' + without.length + '</summary><div class="list growth-hub-list">' +
      without.map(s => '<a class="item" href="#/song/' + encodeURIComponent(s.id) + '"><span class="item-main"><span class="item-title">' + e(s.title) + '</span><span class="item-sub">곡 상세에서 녹음을 추가해요</span></span>' + chev + '</a>').join('') + '</div></details>' : '') +
    '<h2 class="sec">보관함과 다른 분석</h2>' + foot +
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
function trainingHtml() {
  const rooms = roomRows(), checks = V.voiceCheck?.checks?.() || [], checked = !!V.voiceCheck?.doneToday?.();
  const entries = '<div class="list icons growth-hub-list" data-hub-training>' +
    row('#/practice-room', 'microphone-stage', '노래 연습실', '9단계 과제 · ' + (rooms.length ? '제출 ' + rooms.length + '개' : '아직 제출 전'), ' data-hub-room') +
    (V.voiceCheck ? row('#/voice-check', 'waveform', '매일 보이스 체크', (checked ? '오늘 완료' : '오늘 아직 · 30초') + (checks.length ? ' · 기록 ' + checks.length + '개' : ''), ' data-hub-check') : '') +
    row('#/practice-review', 'compass', '다음 연습 추천', '기록과 분석을 바탕으로 고른 연습', ' data-hub-review') + '</div>';
  const recent = rooms.slice(0, 5).map(p => {
    const r = p.practiceRoom, song = r.songId ? V.songTitle(r.songId) : '';
    const sub = [V.dateLabel(p.date), song, Number(p.minutes) > 0 ? V.minutes(Number(p.minutes)) : ''].filter(Boolean).join(' · ');
    return row('#/practice-room?result=' + encodeURIComponent(r.id), 'check-circle', r.title || '연습실 과제', sub, ' data-hub-result="' + e(r.id) + '"');
  }).join('');
  return '<h2 class="sec">측정하고 연습하기</h2>' + entries +
    '<h2 class="sec">최근 트레이닝 기록 <span class="small muted" style="font-weight:500">' + rooms.length + '</span></h2>' +
    (recent ? '<div class="list icons growth-hub-list" data-hub-results>' + recent + '</div>'
      : '<div class="growth-hub-empty"><strong>아직 제출한 과제가 없어요</strong><p>노래 연습실에서 과제를 제출하면 여기에 최근 기록이 쌓여요.</p></div>') +
    '<a class="btn secondary block growth-hub-all" href="#/practices">연습 기록 전체 보기</a>' +
    '<p class="small muted growth-disclaimer">연습실의 자동 확인은 기초 분석이에요. 보컬 채점이나 발성 건강 진단이 아니에요.</p>';
}
V.route('vocal-training', {title:'성장', tab:'growth', noAutoRefresh:true,
  render:() => V.growthTabs('training') + '<div class="growth-hub" data-growth-training>' + trainingHtml() + '</div>'
});
// A record that arrives while the tab is open (another device, a finished submission) shows without leaving the tab.
window.addEventListener('vzip:data-changed', () => {
  const host = document.body.dataset.vzRoute === 'vocal-training' && document.querySelector('[data-growth-training]');
  if (host) host.innerHTML = trainingHtml();
});
})();
