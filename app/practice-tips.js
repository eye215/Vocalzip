/* VOCAL.zip 맞춤 연습 추천 (Phase 8B MVP): rules over the measurements already saved with recordings
 * (analysis.metrics from app/vocal-analysis.js — intonation, stability, vibrato, range, breath). No AI call, no cost.
 * Only reliable measurements count (enough singing, voice clearly above the MR). With fewer than 3 there is no
 * personal advice. The advice is a general practice guide, not a judgement of the voice. */
(() => {
'use strict';
const VZ = window.VZ, M = VZ?.media;
if (!VZ || !M) return;
const esc = VZ.esc, MIN_TAKES = 3;
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const note = c => { const m = Math.round(c / 100); return NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1); };
const median = a => { const s = a.filter(Number.isFinite).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r1 = v => Math.round(v * 10) / 10;

/* Each rule: the value it reads, from which level it speaks up (warn) and how far is "a lot" (strong).
 * Levels follow the metric definitions: cents from the nearest semitone (±20 is clearly audible),
 * sustained-note wobble without vibrato (±5–8 is steady), vibrato share/width/regularity, phrase seconds. */
const RULES = [
  {key:'into', name:'음정 정확도 연습', metric:'음정 오차', lower:true, warn:14, strong:24,
    value:a => a.metrics.intonation?.meanAbsCents, show:v => '±' + r1(v) + ' cent',
    reason:v => '최근 녹음의 지속음이 반음 칸에서 평균 ±' + r1(v) + ' cent 벗어났어요.', goal:'평균 ±12 cent 이내', minutes:10,
    steps:['기준음(피아노 앱)을 듣고 같은 음을 "아"로 따라 불러요', '편한 음역에서 5음계 상행·하행 (도레미파솔파미레도) 3회', '목표음을 4초 유지하며 튜너 바늘이 가운데에 오는지 확인']},
  {key:'wob', name:'음정 안정성 (롱톤) 연습', metric:'지속음 흔들림', lower:true, warn:7, strong:12,
    value:a => a.metrics.stability?.wobbleCents, show:v => '±' + r1(v) + ' cent',
    reason:v => '길게 낸 음이 비브라토를 빼고도 평균 ±' + r1(v) + ' cent 흔들렸어요.', goal:'흔들림 ±6 cent 이내', minutes:8,
    steps:['편한 음역에서 "아" 롱톤 5초 × 5회', '시작·유지·끝을 같은 세기로', '짧은 음형(도-레-도) 천천히 반복']},
  {key:'vib', name:'지속음·비브라토 연습', metric:'비브라토', lower:false,
    value:a => a.metrics.vibrato?.notes >= 3 ? a.metrics.vibrato : null,
    level:v => { const s = []; if (v.share < 15) s.push(0.6); if (v.extentCents > 90) s.push(0.8); if (v.regularity != null && v.regularity < 0.55) s.push(0.7); return s.length ? Math.max(...s) : 0; },
    show:v => v.rateHz ? '초당 ' + v.rateHz + '회 · ±' + v.extentCents + ' cent' : '거의 없음',
    reason:v => v.share < 15 ? '긴 음에서 비브라토가 거의 없어요(긴 음 중 ' + v.share + '%).' : v.extentCents > 90 ? '비브라토 폭이 넓어요(±' + v.extentCents + ' cent).' : '비브라토 규칙성이 낮아요(' + Math.round(v.regularity * 100) + '%).',
    goal:'긴 음 끝에서 자연스럽게, 폭 ±30~60 cent', minutes:6,
    steps:['편안한 지속음 4초 → 마지막 1초에만 자연스러운 흔들림', '턱·혀·목에 힘이 들어가지 않는지 거울로 확인', '안정적인 호흡으로 같은 세기 유지']},
  {key:'phr', name:'프레이즈·호흡 연습', metric:'프레이즈 길이', lower:false, warn:3.2, strong:2.2,
    value:a => a.metrics.breath?.medianPhrase, show:v => '평균 ' + r1(v) + '초',
    reason:v => '쉬지 않고 이어 부른 길이가 평균 ' + r1(v) + '초로 짧아요.', goal:'평균 4초 이상', minutes:8,
    steps:['가사에 숨 쉴 곳을 미리 표시', '긴 프레이즈를 2~3조각으로 나눠 반복 → 이어 붙이기', '"스-" 소리로 일정하게 내쉬기 10초 × 3회']}
];
const severity = (rule, v) => {
  if (v == null) return 0;
  if (rule.level) return rule.level(v);
  const d = rule.lower ? v - rule.warn : rule.warn - v, span = Math.abs(rule.strong - rule.warn);
  return d <= 0 ? 0 : Math.min(1, 0.4 + d / span * 0.6);
};
/** Recommendations from the recordings given (all, or one song's). */
VZ.practiceTips = (media, {songId = ''} = {}) => {
  const takes = media.filter(m => (!songId || m.songId === songId) && m.analysis?.v && VZ.analysisReliable?.(m.analysis))
    .sort((a, b) => (M.dateOf(b) || '').localeCompare(M.dateOf(a) || '') || (b.created || 0) - (a.created || 0));
  if (takes.length < MIN_TAKES) return {enough:false, count:takes.length, tips:[]};
  const recent = takes.slice(0, 8).map(m => m.analysis), older = takes.slice(8, 20).map(m => m.analysis);
  const pick = (list, rule) => { const vals = list.map(rule.value).filter(v => v != null); if (!vals.length) return null; return typeof vals[0] === 'object' ? vals[0] : median(vals); };
  const lo = median(recent.map(a => a.metrics.range?.lowCents)), hi = median(recent.map(a => a.metrics.range?.highCents));
  const range = lo != null && hi != null ? note(lo) + '~' + note(hi) : '';
  const tips = RULES.map(rule => {
    const v = pick(recent, rule), s = severity(rule, v);
    if (!s) return null;
    const before = older.length >= 3 ? pick(older, rule) : null;
    const worse = typeof v === 'number' && before != null && (rule.lower ? v - before : before - v) > (rule.key === 'phr' ? 0.5 : 3);
    return {key:rule.key, name:rule.name, metric:rule.metric, value:rule.show(v), reason:rule.reason(v) + (worse ? ' 예전 녹음보다 나빠졌어요.' : ''),
      goal:rule.goal, minutes:rule.minutes, steps:[...rule.steps, ...(range ? ['무리하지 말고 지금 안정적인 음역(' + range + ') 안에서'] : [])], score:s + (worse ? 0.2 : 0)};
  }).filter(Boolean).sort((a, b) => b.score - a.score);
  return {enough:true, count:takes.length, range, tips};
};
const doneToday = tip => VZ.db.practices.some(p => p.date === VZ.today() && String(p.memo || '').includes('[추천 연습] ' + tip.name));
const card = (tip, songId) => '<div class="card tip" data-tip-key="' + esc(tip.key) + '"><div class="row between"><span class="tip-k">🎯 ' + (songId ? '이 곡 추천 연습' : '오늘의 추천 연습') + '</span><span class="badge accent">' + esc(tip.metric) + ' ' + esc(tip.value) + '</span></div>' +
  '<h3 class="tip-name">' + esc(tip.name) + '</h3><p class="small" style="margin:0 0 6px">' + esc(tip.reason) + '</p>' +
  '<ol class="tip-steps">' + tip.steps.map(s => '<li>' + esc(s) + '</li>').join('') + '</ol>' +
  '<div class="row between" style="gap:8px"><span class="small muted">목표: ' + esc(tip.goal) + ' · 권장 ' + tip.minutes + '분</span>' +
  (doneToday(tip) ? '<span class="badge ok">오늘 했어요 ✓</span>' : '<button type="button" class="btn sm" data-tip-start>연습 시작</button>') + '</div></div>';
/** Card(s) into host: home (best one overall) or song page (that song's). */
VZ.renderTips = async (host, {songId = '', limit = 1} = {}) => {
  if (!host) return;
  const media = await M.list().catch(() => M.cached?.() || []);
  if (!document.body.contains(host)) return;
  const r = VZ.practiceTips(media, {songId});
  if (!r.enough) {
    host.innerHTML = r.count || !songId ? '<p class="small muted tip-empty">' + (songId ? '이 곡의' : '') + ' 분석된 녹음이 ' + MIN_TAKES + '개 이상 모이면 맞춤 연습을 추천해요 (지금 ' + r.count + '개).</p>' : '';
    return;
  }
  const tips = r.tips.slice(0, limit);
  host.innerHTML = (tips.length ? tips.map(t => card(t, songId)).join('') : '<div class="card tip"><span class="tip-k">🎯 ' + (songId ? '이 곡' : '오늘의') + ' 추천 연습</span><p class="small" style="margin:6px 0 0">측정값이 고르게 안정적이에요 👍 편한 음역' + (r.range ? '(' + esc(r.range) + ')' : '') + '에서 롱톤 5분으로 유지해 보세요.</p></div>') +
    '<p class="small muted tip-note">측정값을 참고한 일반 연습 가이드예요. 통증이나 쉰 목소리가 있으면 쉬어 주세요.</p>';
  host.querySelectorAll('[data-tip-start]').forEach(b => b.onclick = () => {
    const tip = tips.find(t => t.key === b.closest('[data-tip-key]').dataset.tipKey);
    VZ.practiceSheet({songId, preset:{minutes:tip.minutes, memo:'[추천 연습] ' + tip.name + ' — ' + tip.steps.join(' / ')}});
  });
};
})();
