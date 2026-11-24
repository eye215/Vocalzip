/* 성장 › 곡 하나 (#/growth-song/<songId>) — 성장 v2 R4 (.kiro/specs/growth-v2): one song on one light, short screen.
 * Built on the models the song screens already share, nothing new is worked out or stored:
 *   한마디 · 한 줄        VZ.growthSong (app/growth-hub.js → app/growth-song-model.js verdict), the 연습 녹음 포함 setting
 *   녹음 타임라인        the song's recordings by day (VZ.growthDataset 'songList'), analysed ones filled; tap to play
 *   처음 vs 최근         the verdict's five measures (rows: 좋아짐 · 아쉬움 · 비슷함 · 판정 보류, with what was compared)
 *   들어 본 평가         the listening verdicts of the song (app/listen-verdict-model.js) + 두 녹음 비교 · 듣고 고르기
 *   약한 곳              VZ.practiceTips over the song's takes (the median of the recent takes past their line) +
 *                        구간별로 (파사지오 · 음높이 확인 구간 · 구간 A/B) on the full screen
 *   레슨 지적 체크       VZ.scorePoints.card
 *   모든 분석 도구       the full 곡 분석 screen (#/vocal-lab/<id>: 분석 실행 · MR로 다시 분석 · 정밀 리포트 · AI 해석 ·
 *                        기준 녹음 · 깊이 보기) — every capability stays reachable (R4).
 * Words: what was measured and heard, never a verdict on the voice. */
(() => {
'use strict';
const V = window.VZ, M = V?.media, L = window.VzipListenVerdict;
if (!V || !M || typeof document === 'undefined') return;
const e = V.esc;
const short = d => d ? Number(d.slice(5, 7)) + '.' + Number(d.slice(8, 10)) : '';
const dayLabel = d => d ? V.dateLabel(d).replace(/ \(.*$/, '') : '날짜 미상';
const STATE = {better:'좋아짐', worse:'아쉬움', mixed:'엇갈림', similar:'비슷함', hold:'판정 보류'};
let instance = 0, player = null;
const stopPlayer = () => { try { player?.destroy?.(); } catch {} player = null; };

function heroHtml(song, v, takes) {
  const analysed = takes.filter(t => t.analysed), last = takes.at(-1);
  const play = (id, label, date) => id ? '<button type="button" class="gsp-play" data-gsp-play="' + e(id) + '"><i class="ph-fill ph-play" aria-hidden="true"></i>' + label + (date ? ' · ' + e(dayLabel(date)) : '') + '</button>' : '';
  return '<section class="gsp-hero" data-gsp-hero data-state="' + e(v?.state || 'none') + '">' +
    '<p class="gsp-kicker">' + e(song.show || '내 곡') + '</p><h2>' + e(song.title) + '</h2>' +
    (v ? '<p class="gsp-word"><span class="gsp-chip" data-state="' + e(v.state) + '">' + e(v.word) + '</span><span data-gsp-line>' + e(v.text || '') + '</span></p>' : '') +
    '<p class="gsp-sub">녹음 ' + takes.length + '개 · 분석 ' + analysed.length + '개' + (last ? ' · 최근 ' + e(dayLabel(last.date)) : '') + '</p>' +
    '<div class="gsp-actions">' + (v?.firstId && v?.lastId ? play(v.firstId, '처음', v.item?.firstDate) + play(v.lastId, '최근', v.item?.lastDate) : '') +
    (window.VZ.listenSession && takes.length >= 2 ? '<a class="gsp-play is-soft" href="#/listen?song=' + encodeURIComponent(song.id) + '" data-gsp-listen><i class="ph-fill ph-headphones" aria-hidden="true"></i>듣고 고르기</a>' : '') + '</div>' +
    '<div class="gsp-player" data-gsp-player></div></section>';
}
function timelineHtml(takes, v) {
  if (!takes.length) return '';
  const mark = id => id === v?.firstId ? '처음' : id === v?.lastId ? '최근' : '';
  return '<section class="gsp-card"><h3>녹음 <small>' + takes.length + '</small></h3>' +
    '<div class="gsp-timeline" data-gsp-timeline role="list">' + takes.map(t => '<button type="button" role="listitem" class="gsp-dot" data-gsp-take="' + e(t.m.id) + '"' +
      (t.analysed ? ' data-analysed' : '') + (mark(t.m.id) ? ' data-pair="' + mark(t.m.id) + '"' : '') + ' aria-label="' + e(M.label(t.m) + ' · ' + dayLabel(t.date) + (t.analysed ? ' · 분석함' : ' · 분석 전')) + '">' +
      '<i aria-hidden="true"></i><span>' + e(short(t.date)) + '</span>' + (mark(t.m.id) ? '<b>' + mark(t.m.id) + '</b>' : '') + '</button>').join('') + '</div>' +
    '<p class="gsp-note">채운 점은 분석한 녹음이에요. 누르면 들어요.</p></section>';
}
function rowsHtml(v) {
  if (!v) return '';
  if (!v.rows?.length) return '<section class="gsp-card"><h3>처음 vs 최근</h3><p class="gsp-empty">' + e(v.text || '분석한 녹음이 아직 없어요') + '</p></section>';
  return '<section class="gsp-card" data-gsp-rows><h3>처음 vs 최근 <small>' + e([v.item?.firstDate, v.item?.lastDate].map(dayLabel).join(' → ')) + '</small></h3><ul class="gsp-rows">' +
    v.rows.map(r => '<li data-row="' + e(r.id) + '" data-state="' + e(r.state) + '"><div><strong>' + e(r.title) + '</strong><span class="gsp-chip" data-state="' + e(r.state) + '">' + e(STATE[r.state] || '') + '</span></div>' +
      '<p>' + e(r.text || '') + '</p>' + (r.note ? '<small>' + e(r.note) + '</small>' : '') + '</li>').join('') + '</ul></section>';
}
function heardHtml(song, state = '') {
  const list = L ? L.list(V.db, {songId:song.id}) : [];
  // 모아 보기 (owner, 2026-11-24): how the ear leans over all of the song's verdicts, next to the measured direction.
  const t = L?.tally ? L.tally(list) : null, ear = t && L.earOf(t), agree = ear ? L.agreeText(t, state) : '';
  const sum = ear ? '<div class="gsp-ear" data-gsp-ear="' + ear + '"><p><strong>' + e(L.EAR_TEXT[ear]) + '</strong></p>' +
    '<div class="gsp-ear-bar" aria-hidden="true">' + ['later', 'same', 'earlier'].map(k => t[k] ? '<i data-k="' + k + '" style="flex:' + t[k] + '"></i>' : '').join('') + '</div>' +
    '<small data-gsp-ear-count>' + e(L.tallyText(t)) + '</small>' + (agree ? '<small data-gsp-agree>' + e(agree) + '</small>' : '') + '</div>' : '';
  return '<section class="gsp-card" data-gsp-heard data-state="' + e(state) + '"><h3>들어 본 평가 <small>' + (list.length ? list.length + '개' : '') + '</small></h3>' + sum +
    (list.length ? '<ul class="gsp-heard">' + list.slice(0, 3).map(x => '<li>' + e(L.line(x)) + '</li>').join('') + '</ul>' : '<p class="gsp-empty">아직 없어요. 두 녹음을 들어 보고 어느 쪽이 나은지 남겨 보세요.</p>') +
    '<button type="button" class="btn secondary block" data-listen-open data-song="' + e(song.id) + '">두 녹음 비교하기</button></section>';
}
function weakHtml(song, items) {
  let tips = {enough:false, count:0, tips:[]};
  try { tips = V.practiceTips ? V.practiceTips(items, {songId:song.id}) : tips; } catch (error) { console.error(error); }
  const list = tips.tips || [];
  return '<section class="gsp-card" data-gsp-weak><h3>약한 곳</h3>' +
    (!tips.enough ? '<p class="gsp-empty">분석한 녹음이 3개 넘게 모이면 되풀이해 흔들리는 곳을 알려 드려요 (지금 ' + (tips.count || 0) + '개).</p>'
      : list.length ? '<ul class="gsp-tips">' + list.slice(0, 3).map(t => '<li><strong>' + e(t.metric || t.title || '') + ' ' + e(String(t.value ?? '')) + '</strong>' + '<small>' + e([t.basis, t.name].filter(Boolean).join(' · ')) + '</small>' + '</li>').join('') + '</ul>'
      : '<p class="gsp-empty">최근 녹음에서 선을 넘은 곳이 없어요.</p>') +
    '<a class="gsp-link" href="#/vocal-lab/' + encodeURIComponent(song.id) + '?jump=weak" data-gsp-weak-more>구간별로 보기 · 파사지오 · 음높이 확인 · 구간 A/B<i class="ph ph-caret-right" aria-hidden="true"></i></a></section>';
}
/** 곡 확인이 필요해 보이는 녹음 of this song (app/song-check.js), when there is any. */
function checkHtml(song, items) {
  const list = V.songCheck ? V.songCheck.suspects(items).filter(s => s.songId === song.id) : [];
  return list.length ? '<section class="gsp-card" data-gsp-check><h3>곡 확인이 필요해 보이는 녹음 <small>' + list.length + '</small></h3>' + V.songCheck.listHtml(list, items) + '</section>' : '';
}
function html(song, v, takes, items) {
  return heroHtml(song, v, takes) + timelineHtml(takes, v) + rowsHtml(v) + heardHtml(song, v?.state) + weakHtml(song, items) +
    checkHtml(song, items) +
    '<section class="gsp-points" data-gsp-points></section>' +
    '<a class="gsp-all" href="#/vocal-lab/' + encodeURIComponent(song.id) + '" data-gsp-all><span><strong>모든 분석 도구</strong><small>분석 실행 · MR로 다시 분석 · 정밀 리포트 · AI 해석 · 깊이 보기</small></span><i class="ph ph-caret-right" aria-hidden="true"></i></a>' +
    '<p class="gsp-disclaimer">수치는 음성 측정에 기반한 참고 정보예요. 분석하지 않은 녹음에는 결과를 만들어 넣지 않아요.</p>';
}
function playIn(host, item) {
  stopPlayer();
  const box = host.querySelector('[data-gsp-player]'); if (!box) return;
  box.replaceChildren();
  if (!item) { V.toast('녹음을 찾을 수 없어요. 지워졌거나 다른 기기에만 있어요.', 'error'); return; }
  player = M.player(box, item, {});
  player.play?.();
  host.querySelectorAll('[data-gsp-take]').forEach(b => b.toggleAttribute('data-active', b.dataset.gspTake === item.id));
}
V.route('growth-song', {title:'곡', back:true, tab:'growth', noAutoRefresh:true,
  render:() => '<div class="gsp" data-gsp>' + (V.loadingRows?.(3) ?? '<p class="muted" role="status">불러오는 중…</p>') + '</div>',
  async mount(main, r) {
    const my = ++instance, host = main.querySelector('[data-gsp]'), song = V.song(r.params[0]);
    stopPlayer();
    if (!song) { location.replace('#/vocal-analysis'); return; }
    let items = [];
    try { items = await M.list(); } catch { items = M.cached?.() || []; }
    if (my !== instance || !host.isConnected) return;
    const ds = V.growthDataset?.(items);
    const takes = (ds ? ds.pick('songList').filter(row => row.songId === song.id && !row.deleted).map(row => ({m:row.m, date:row.date, analysed:!!row.analysed}))
      : items.filter(m => m.songId === song.id).map(m => ({m, date:M.dateOf(m), analysed:!!m.analysis}))).sort((a, b) => String(a.date).localeCompare(String(b.date)) || (a.m.created || 0) - (b.m.created || 0));
    let v = null;
    try { v = V.growthSong?.of(items, song.id, V.growthSong.practice())?.now || null; } catch (error) { console.error(error); }
    host.innerHTML = html(song, v, takes, items);
    const byId = new Map(items.map(m => [String(m.id), m]));
    host.querySelectorAll('[data-gsp-play]').forEach(b => b.onclick = () => playIn(host, byId.get(b.dataset.gspPlay)));
    host.querySelectorAll('[data-gsp-take]').forEach(b => b.onclick = () => playIn(host, byId.get(b.dataset.gspTake)));
    try { V.scorePoints?.card(host.querySelector('[data-gsp-points]'), song.id); } catch (error) { console.error(error); }
    const check = host.querySelector('[data-gsp-check]');
    if (check) V.songCheck.wire(check, items, () => { if (location.hash.startsWith('#/growth-song/')) V.render?.(); });
    // The latest take is in view on the timeline.
    const tl = host.querySelector('[data-gsp-timeline]'); if (tl) tl.scrollLeft = tl.scrollWidth;
  },
  leave() { instance++; stopPlayer(); }
});
// A verdict saved from the 두 녹음 비교 sheet over this screen shows at once.
window.addEventListener('vzip:listen-verdicts', () => {
  const box = document.querySelector('[data-gsp-heard]'), id = /^#\/growth-song\/([^?]+)/.exec(location.hash)?.[1];
  const song = id && V.song(decodeURIComponent(id));
  if (box && song) box.outerHTML = heardHtml(song, box.dataset.state);
});
})();
