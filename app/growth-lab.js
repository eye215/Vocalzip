/* 성장 › 연구소 (#/growth-lab) — the third tab of 성장 (성장 개편 안 B, phase 4): the second-tier tools, small. Each row
 * says what it answers and what is there now ("결과 3개", "아직 없음"). Two groups:
 *   소리 깊이 보기  소리 길 흔적 · 발성 정밀 측정 · 발성 정밀 리포트 · MR로 다시 분석 · 녹음 하나 분석
 *   기록·기준      리포트 보관함 · 귀와 숫자 표 전체 (#/growth-ear) · 분석 기준·뺀 것 목록 (#/growth-basis)
 * The things you DO (오늘 연습 세트, 매일 보이스 체크, 노래 연습실, 보컬 트레이닝) are on 오늘 › 연습하기
 * (design-system/student-home-app.js); the former 보컬 트레이닝 addresses lead there (app/growth-hub.js).
 * Read-only: every count is worked out on each draw from what is already kept (the library, the 정밀 측정 and 소리 길
 * stores of this device). Nothing is stored, moved or deleted here. */
(() => {
'use strict';
const V = window.VZ, M = V?.media;
if (!V || !M || !V.growthTabs) return;
const e = V.esc;
const gone = (list, id) => (V.db.deleted?.[list] || []).includes(id);
const owner = () => window.vzipCloudUserId?.() || window.VzipAccountScope?.owner || 'local';
const practice = () => !!V.growthSong?.practice?.();
const dayOf = m => window.VzipGrowthDataset?.dateOf(m) ?? M.dateOf(m);
const shortDate = d => d ? V.dateLabel(d).replace(/ \(.*$/, '') : '';
const NONE = '아직 없음';
let request = 0, view = null;   // view: {host, items, results (정밀 측정: undefined reading · null none · list), paths}

/* ---------- the rows ---------- */
// [key, icon, name, what it answers, href ('' = a button), shown()]
const GROUPS = [
  ['deep', '소리 깊이 보기', [
    ['voice-path', 'path', '소리 길 흔적 · 시험판', '두 녹음에서 소리가 어디서 달라졌는지 나란히 봐요', '#/voice-path', () => !!window.VzipVoicePath],
    ['precision', 'microphone', '발성 정밀 측정', '편안한 음역에서 8가지 과제로 목소리를 재요', '#/precision-measurement', () => !!V.precisionMeasurement],
    ['precision-report', 'waveform', '발성 정밀 리포트', '정밀 측정 결과를 지난 측정과 과제별로 견줘요', '#/precision-report', () => !!window.VzipPrecisionReport],
    ['mr', 'music-notes-minus', 'MR로 다시 분석', '반주를 빼고 목소리만 다시 재요', '', () => !!V.mrReanalyze],
    ['take', 'chart-line', '녹음 하나 분석', '녹음을 직접 골라 그 녹음의 음높이와 측정값을 봐요', '', () => true]
  ]],
  ['records', '기록·기준', [
    ['reports', 'folder-open', '리포트 보관함', '저장해 둔 곡 분석 리포트를 다시 봐요', '#/lab-reports', () => true],
    ['ear', 'ear', '귀와 숫자 표 전체', '귀로 들은 평가와 숫자가 같은 쪽으로 움직였는지 봐요', '#/growth-ear', () => !!window.VzipGrowthChangesUI?.lab && !!window.VzipEarAgreement],
    ['basis', 'list-magnifying-glass', '분석 기준·뺀 것 목록', '무엇을 세고, 무엇을 왜 비교에서 뺐는지 봐요', '#/growth-basis', () => !!window.VzipGrowthChangesUI?.lab]
  ]]
];
const mrSongs = () => V.songsNewest().filter(s => V.mrReanalyze?.has(s));
/** What each row has now: {key: [text, has something]}; '' while a store is still being read. */
function states(v) {
  const out = {}, items = v.items, lab = window.VzipGrowthChangesUI?.lab;
  const n = (count, unit, none = NONE) => count ? [unit.replace('#', count), true] : [none, false];
  out['voice-path'] = v.paths == null ? ['', false] : n(v.paths, '결과 #개');
  const p = (() => { try { return V.precisionMeasurement?.summary?.()?.progress || null; } catch { return null; } })();
  out.precision = p ? ['과제 ' + p.complete + '/' + p.total + ' 완료', p.complete > 0] : [NONE, false];
  out['precision-report'] = v.results === undefined ? ['', false] : n((v.results || []).length, '결과 #개');
  out.mr = n(mrSongs().length, 'MR 있는 곡 #개', 'MR 올린 곡 없음');
  out.reports = n((V.db.comparisonReports || []).filter(r => r.kind !== 'listen-verdict' && !gone('comparisonReports', r.id)).length, '저장 #개');
  if (!items) { out.take = out.ear = out.basis = ['', false]; return out; }
  let analysed = 0;
  try { analysed = V.growthDataset(items).rows.filter(r => !r.deleted && r.analysed).length; } catch (error) { console.error(error); }
  out.take = n(analysed, '분석한 녹음 #개');
  const c = lab ? lab.counts(items, Array.isArray(v.results) ? v.results : null, {practice:practice()}) : null;
  out.ear = c ? n(c.verdicts, '평가 #개') : ['', false];
  out.basis = c ? n(c.excluded + c.earExcluded, '뺀 것 #개', '뺀 것 없음') : ['', false];
  return out;
}
const chev = '<i class="ph ph-caret-right chev" aria-hidden="true"></i>';
const stateChip = (key, [text, on]) => '<span class="growth-hub-chip growth-lab-state" data-lab-state="' + key + '" data-state="' + (on ? 'ok' : 'none') + '"' + (text ? '' : ' hidden') + '>' + e(text) + '</span>';
function rowHtml([key, icon, title, sub, href], st) {
  const inner = '<i class="ph ph-' + icon + '" aria-hidden="true"></i><span class="item-main"><span class="growth-hub-title"><span class="item-title">' + e(title) + '</span>' + stateChip(key, st) + '</span>' +
    '<span class="item-sub">' + e(sub) + '</span></span>' + chev;
  return href ? '<a class="item" href="' + href + '" data-lab-tool="' + key + '">' + inner + '</a>' : '<button type="button" class="item" data-lab-tool="' + key + '">' + inner + '</button>';
}
function html(v) {
  const st = states(v);
  return '<p class="growth-lab-lead" data-lab-lead>궁금할 때 더 깊이 들여다보는 도구예요. 연습은 <a href="#/home" data-home-practice>오늘 탭</a>에서 해요.</p>' +
    GROUPS.map(([group, title, rows]) => {
      const shown = rows.filter(r => r[5]());
      return shown.length ? '<section class="growth-lab-group" data-lab-group="' + group + '" aria-labelledby="growth-lab-' + group + '"><h2 class="sec" id="growth-lab-' + group + '">' + title + '</h2>' +
        '<div class="list icons growth-hub-list" data-lab-tools>' + shown.map(r => rowHtml(r, st[r[0]] || ['', false])).join('') + '</div></section>' : '';
    }).join('') +
    '<p class="small muted growth-disclaimer">수치는 음성 측정에 기반한 참고 정보예요. 발성 건강을 진단하지 않아요.</p>';
}
/** Only the state words change after the first draw, so a row never moves under a finger. */
function paintStates(v) {
  const st = states(v);
  v.host.querySelectorAll('[data-lab-state]').forEach(chip => {
    const [text, on] = st[chip.dataset.labState] || ['', false];
    if (chip.textContent !== text) chip.textContent = text;
    chip.dataset.state = on ? 'ok' : 'none'; chip.hidden = !text;
  });
}

/* ---------- MR로 다시 분석: choose a song that has an MR file ---------- */
function openMr() {
  const songs = mrSongs();
  if (V.mrReanalyze.running()) { V.toast('다른 분석이 진행 중이에요. 끝난 뒤 다시 눌러 주세요.', 'error'); return; }
  if (!songs.length) {
    V.sheet({title:'MR로 다시 분석', variant:'compact',
      body:'<p class="growth-lab-sheet-note" data-lab-mr-empty>MR 파일을 올린 곡이 아직 없어요. 내 곡에서 곡을 열고 레퍼런스에 MR 파일을 올리면, 그 곡 녹음을 반주를 빼고 다시 잴 수 있어요. 유튜브 MR은 쓸 수 없어요.</p>',
      foot:'<a class="btn block" href="#/songs" data-lab-mr-songs>내 곡으로 가기</a>'});
    return;
  }
  V.menu({title:'어느 곡을 다시 잴까요?', body:'<div class="vz-choice-list growth-song-choices">' + songs.map(s =>
    '<button type="button" class="vz-choice" data-lab-mr-song="' + e(s.id) + '"><span class="growth-song-choice"><strong>' + e(s.title) + '</strong><small>MR 파일이 있어요</small></span></button>').join('') + '</div>',
    onMount:(el, close) => el.querySelectorAll('[data-lab-mr-song]').forEach(b => b.onclick = () => {
      const song = V.song(b.dataset.labMrSong); close();
      // The same sheet 곡 분석 opens; a saved result redraws the 성장 screens ('vzip:analysis-saved').
      if (song) V.mrReanalyze.open(song, {onClose:() => { const now = here(); if (now) paintStates(now); }});
    })});
}

/* ---------- 녹음 하나 분석: choose one recording ---------- */
const PICK_SHOWN = 30;
async function openTake() {
  let items = view?.items;
  if (!items) { try { items = await M.list(); } catch { items = M.cached(); } }
  const ds = V.growthDataset(items), rows = ds.rows.filter(r => !r.deleted);
  if (!rows.length) {
    V.sheet({title:'녹음 하나 분석', variant:'compact', body:'<p class="growth-lab-sheet-note" data-lab-take-empty>아직 녹음이 없어요. 녹음하거나 가져온 뒤에 여기에서 골라 볼 수 있어요.</p>',
      foot:'<a class="btn block" href="#/record">녹음하러 가기</a>'});
    return;
  }
  const line = r => [r.songId && V.song(r.songId) ? V.songTitle(r.songId) : '곡 미지정', shortDate(dayOf(r.m))].filter(Boolean).join(' · ');
  const item = r => '<a class="item" href="#/analysis/' + encodeURIComponent(r.id) + '" data-lab-take="' + e(r.id) + '" data-find="' + e((M.label(r.m) + ' ' + line(r)).toLowerCase()) + '"><i class="ph ph-waveform" aria-hidden="true"></i>' +
    '<span class="item-main"><span class="growth-hub-title"><span class="item-title">' + e(M.label(r.m)) + '</span><span class="growth-hub-chip" data-state="' + (r.analysed ? 'ok' : 'none') + '">' + (r.analysed ? '분석함' : '분석 전') + '</span></span>' +
    '<span class="item-sub">' + e(line(r)) + '</span></span>' + chev + '</a>';
  V.sheet({title:'녹음 하나 분석',
    body:'<div class="growth-lab-pick" data-lab-pick><p class="growth-lab-sheet-note">녹음을 하나 고르면 그 녹음의 음높이 곡선과 측정값을 보여 드려요. 이 기기 안에서 분석해요.</p>' +
      '<div class="search growth-hub-search"><i class="ph ph-magnifying-glass" aria-hidden="true"></i><input type="search" data-q data-lab-take-q placeholder="녹음 이름이나 곡 제목" aria-label="녹음 검색"></div>' +
      '<div class="list icons growth-hub-list" data-lab-takes>' + rows.map(item).join('') + '</div>' +
      '<p class="growth-hub-note" data-lab-take-none hidden>그 이름의 녹음이 없어요.</p>' +
      '<button type="button" class="btn secondary block" data-lab-take-more hidden></button></div>',
    onMount:el => {
      const q = el.querySelector('[data-lab-take-q]'), all = [...el.querySelectorAll('[data-lab-take]')], more = el.querySelector('[data-lab-take-more]');
      let limit = PICK_SHOWN;
      const filter = () => {
        const word = q.value.trim().toLowerCase(), hits = all.filter(a => !word || a.dataset.find.includes(word));
        all.forEach(a => { a.hidden = true; });
        hits.slice(0, limit).forEach(a => { a.hidden = false; });
        el.querySelector('[data-lab-take-none]').hidden = hits.length > 0;
        more.hidden = hits.length <= limit; more.textContent = '녹음 ' + (hits.length - limit) + '개 더 보기';
      };
      q.oninput = () => { limit = PICK_SHOWN; filter(); };
      more.onclick = () => { limit += PICK_SHOWN; filter(); };
      filter();
    }});
}

/* ---------- the tab ---------- */
/** The 발성 정밀 측정 results of this account (its own device store, read-only): a list, or null when there is none. */
async function readPrecision() {
  if (!window.VzipPrecisionStore) return null;
  try { return (await window.VzipPrecisionStore.list(owner())).map(r => r.result).filter(Boolean); } catch { return null; }
}
function bind(v) {
  v.host.querySelector('button[data-lab-tool="mr"]')?.addEventListener('click', openMr);
  v.host.querySelector('button[data-lab-tool="take"]')?.addEventListener('click', openTake);
}
async function mount(host) {
  const my = ++request, cached = M.cached?.() || [];
  const v = view = {host, items:cached.length ? cached : null, results:window.VzipPrecisionStore ? undefined : null, paths:V.voicePathCache ? null : 0};
  host.innerHTML = html(v); bind(v);
  const alive = () => my === request && host.isConnected;
  const [items, results, paths] = await Promise.all([
    M.list().catch(() => cached),
    readPrecision(),
    V.voicePathCache?.ids ? V.voicePathCache.ids().then(ids => ids.length).catch(() => 0) : 0
  ]);
  if (!alive()) return;
  Object.assign(v, {items, results, paths});
  paintStates(v);
}
const here = () => document.body.dataset.vzRoute === 'growth-lab' && view?.host?.isConnected ? view : null;
V.route('growth-lab', {title:'성장', tab:'growth', noAutoRefresh:true,
  render:() => V.growthTabs('lab') + '<div class="growth-hub growth-lab" data-growth-lab></div>',
  mount(main) { mount(main.querySelector('[data-growth-lab]')); },
  leave() { request++; }
});
// A report saved, a recording analysed or re-sorted while the tab is open: the state words follow.
window.addEventListener('vzip:data-changed', () => { const v = here(); if (v) paintStates(v); });
for (const name of ['vzip:v6-media', 'vzip:analysis-saved', 'vzip:listen-verdicts']) window.addEventListener(name, async () => {
  const v = here();
  if (!v) return;
  const my = request;
  try { v.items = await M.list(); } catch {}
  if (my === request && v.host.isConnected) paintStates(v);
});

/* ---------- 귀와 숫자 표 전체 · 분석 기준·뺀 것 목록: the folded parts of 달라진 것, opened on their own page ---------- */
const ruleLine = () => '<p class="growth-lab-rule" data-lab-rule>' + (practice()
  ? '지금까지의 모든 기간 · 노래 연습실·트레이닝 연습 녹음도 넣어 셌어요. 성장 › 이번 달의 연습 녹음 포함을 끄면 곡 녹음만 세요.'
  : '지금까지의 모든 기간 · 곡 녹음만 셌어요. 성장 › 이번 달에서 연습 녹음 포함을 켜면 연습 녹음도 넣어 세요.') + '</p>';
async function page(host, draw) {
  const my = ++request;
  host.innerHTML = (window.VZ.loadingRows?.() ?? '<p class="muted" role="status">불러오는 중…</p>');
  let items;
  try { items = await M.list(); } catch { items = M.cached?.() || []; }
  const results = await readPrecision();
  if (my !== request || !host.isConnected) return;
  host.innerHTML = draw(items, results);
  host.querySelectorAll('details.gc-more').forEach(d => { d.open = true; });   // 표 전체: what was left out is shown, not folded
  window.VzipGrowthChangesUI?.lab?.bind(host);
}
const subPage = (name, title, draw) => {
  const again = () => { const host = document.body.dataset.vzRoute === name && document.querySelector('[data-growth-lab-page]'); if (host) page(host, draw); };
  V.route(name, {title, back:true, tab:'growth', noAutoRefresh:true,
    render:() => '<div class="growth-hub growth-lab-page" data-growth-lab-page="' + name + '"></div>',
    mount(main) { page(main.querySelector('[data-growth-lab-page]'), draw); },
    leave() { request++; }
  });
  for (const ev of ['vzip:analysis-saved', 'vzip:listen-verdicts']) window.addEventListener(ev, again);
};
subPage('growth-ear', '귀와 숫자', items => {
  const lab = window.VzipGrowthChangesUI?.lab;
  return '<p class="growth-lab-lead">두 녹음을 가리고 들어 보고 남긴 평가와, 그 두 녹음의 숫자가 같은 쪽으로 움직였는지 세어 본 표예요.</p>' + ruleLine() +
    (lab?.earHtml(items, {practice:practice()}) || '<p class="growth-hub-note">귀와 숫자 표를 만들지 못했어요.</p>') +
    '<a class="btn secondary block" href="#/vocal-analysis" data-lab-ear-songs>곡에서 들어 보고 평가 남기기</a>';
});
subPage('growth-basis', '분석 기준·뺀 것', (items, results) => {
  const lab = window.VzipGrowthChangesUI?.lab, evidence = window.VzipOverallGrowthUI?.evidenceHtml;
  let basis = '';
  try { const report = V.growthOverallFor ? V.growthOverallFor(items, {practice:practice()}) : V.growthModel?.(items)?.overall; if (report && evidence) basis = evidence(report); } catch (error) { console.error(error); }
  const c = lab?.counts(items, results, {practice:practice()});
  return '<p class="growth-lab-lead">성장 화면이 무엇을 세고, 무엇을 왜 비교에서 뺐는지 한곳에 모았어요. 뺀 것도 기록은 그대로 있어요.</p>' + ruleLine() +
    '<div data-lab-basis>' + (basis || '<p class="growth-hub-note">분석 기준을 만들지 못했어요.</p>') + '</div>' +
    '<section class="growth-panel growth-lab-excluded" data-lab-excluded aria-labelledby="growth-lab-excluded-title"><h2 id="growth-lab-excluded-title">비교할 수 없어 뺀 것 <small>' + (c ? c.excluded + '개' : '') + '</small></h2>' +
    '<p class="small muted">같은 곡·같은 과제라도 잰 방법이나 분석 버전이 다르거나 견줄 다른 날 녹음이 없으면 비교에서 빼요.</p>' +
    (lab?.excludedHtml(items, results, {practice:practice()}) || '') + '</section>' +
    (c?.earExcluded ? '<a class="btn secondary block" href="#/growth-ear" data-lab-basis-ear>귀와 숫자에서 뺀 평가 ' + c.earExcluded + '개 보기</a>' : '');
});
})();
