/* 다음 연습 — ONE list of what to practise next, gathered from every place that recommends something today (성장 개편 안
 * B, phase 1; audit §2.2). Pure (no DOM, no storage, no network; also loaded by the Node tests). Nothing is stored or
 * changed: each source adapter reads data the screen has already loaded, through the model that source already has,
 * and the list is derived on the fly.
 *
 *   VzipGrowthNext.build({db, today, overall?, monthly?, tips?, precision?, limit = 5, aiDays = 30, pointDays = 30})
 *     → {items, more, total}
 *   VzipGrowthNext.merge(candidates, {limit}) → the same, from candidates made by the adapters below
 *
 * Sources (adapter → what it reads, through which model):
 *   homework      fromHomework(db, {today})     open assignments (started, not past due, not done) as
 *                                               app/practice-review-model.js context() lists them, due soonest first;
 *                                               one already checked off in today's goals is left out
 *   lesson-point  fromLessonPoints(db, {today, days})  레슨 지적 체크 (app/score-points-model.js): an active point whose
 *                                               latest marked run (within `days`) was 놓쳤어요, with its 최근 N번 중 M번
 *   measure       fromMeasures({overall, monthly, tips})  the measured, rule-based ones: 전체 분석 "다음에 연습할 것"
 *                                               (app/overall-growth-model.js recommendations), a month's 추천 연습 as kept
 *                                               in monthlyGrowthReports[].recommendations, and VZ.practiceTips results
 *                                               (app/practice-tips.js); one item per measure (tips map to measures
 *                                               through app/growth-metrics-model.js METRICS[].help)
 *   precision     fromPrecision({session, results, changes})  발성 정밀 측정: a session left half-way
 *                                               (app/precision-session-model.js progress), no measurement yet (invite),
 *                                               or a task never measured on another day (app/growth-changes-model.js
 *                                               taskChanges 'one-day')
 *   goal          fromGoals(db, {today})        today's unfinished goals as 홈 lists them (app/student-home-model.js)
 *   plan          fromPlans(db, {today})        monthly song plans running today (app/practice-set-model.js
 *                                               activePlans) and running 반복 목표 (app/goal-routines.js)
 *   ai            fromAi(db, {today, days})     AI drafts not yet taken or skipped: the "다음 연습" part of the AI 전체 /
 *                                               월간 코치 notes, 다음 연습 추천 drafts (practicePlans period 'ai-review',
 *                                               status 'draft') and 보컬 연구소 "다른 연습" (period 'ai-exercise'), newer
 *                                               than `days`
 *
 * Item: {id, title, why, source, sources, songId?, measures?, due?, action:{kind, …}}. `source` is the chip of the
 * place it ranks by; `sources` every place that suggested it (the same thing from two places is ONE item — same
 * normalised title and song, or linked by id: a goal made from a homework, plan or AI draft).
 * Rank: 숙제 (due soonest first) > 놓친 레슨 지적 > 측정 기반 (then 정밀 측정) > 계획·목표 > AI 초안.
 * Words: what to practise and why, never a verdict on the voice. */
(function (root, factory) {
  const node = typeof module === 'object' && module.exports;
  const req = (path, name) => node ? require(path) : root[name];
  const api = factory({
    review:() => req('./practice-review-model.js', 'VzipPracticeReview'),
    points:() => req('./score-points-model.js', 'VzipScorePointsModel'),
    metrics:() => req('./growth-metrics-model.js', 'VzipGrowthMetrics'),
    home:() => req('./student-home-model.js', 'VzipStudentHomeModel'),
    set:() => req('./practice-set-model.js', 'VzipPracticeSet'),
    routines:() => req('./goal-routines.js', 'VzipGoalRoutines'),
    precision:() => req('./precision-session-model.js', 'VzipPrecisionSession')
  });
  if (node) module.exports = api; else root.VzipGrowthNext = api;
})(typeof self !== 'undefined' ? self : globalThis, dep => {
'use strict';
const SOURCES = ['homework', 'lesson-point', 'measure', 'precision', 'goal', 'plan', 'ai'];
/** Chip words for each source. */
const LABEL = {homework:'숙제', 'lesson-point':'레슨 지적', measure:'측정 기반', precision:'정밀 측정', goal:'오늘 목표', plan:'연습 계획', ai:'AI 초안'};
/** Rank of each source: lower first. 정밀 측정 goes with 측정 기반, after it; 목표 and 계획 share a place. */
const TIER = {homework:0, 'lesson-point':1, measure:2, precision:2.5, goal:3, plan:3, ai:4};
const LIMIT = 5, AI_DAYS = 30, POINT_DAYS = 30;
const list = v => Array.isArray(v) ? v : [];
const isDay = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const live = (db, key) => list(db?.[key]).filter(x => x && !list(db?.deleted?.[key]).includes(x.id));
const dayNum = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000;
/** Whole days from a to b ('YYYY-MM-DD'); NaN when either is not a day. */
const daysBetween = (a, b) => isDay(a) && isDay(b) ? dayNum(String(b).slice(0, 10)) - dayNum(String(a).slice(0, 10)) : NaN;
const md = s => +s.slice(5, 7) + '월 ' + +s.slice(8, 10) + '일';
const clean = s => String(s ?? '').trim().replace(/\s+/g, ' ');
/** The title as compared for duplicates: no spaces, punctuation or a "(N분)" tail, lower case. */
const norm = s => clean(s).toLowerCase().replace(/\(\s*\d+\s*분\s*\)/g, '').replace(/[\s·.,!?~\-–—:;()[\]{}'"“”‘’/]+/g, '');
const songTitle = (db, id) => id ? clean(live(db, 'songs').find(s => s.id === id)?.title) : '';
/** One candidate. links: ids that make two candidates the same (e.g. 'assignment:<id>'). */
const item = (source, {id, title, why = '', songId = '', measures = null, due = '', action, links = [], order = 0}) => ({
  id:source + ':' + id, title:clean(title), why:clean(why), source, sources:[source], ...(songId ? {songId} : {}),
  ...(measures ? {measures} : {}), ...(due ? {due} : {}), action, links, order});

/* ---------- homework ---------- */
function dueText(due, today) {
  const d = daysBetween(today, due);
  if (!Number.isFinite(d)) return '선생님 숙제';
  return '숙제 · ' + (d <= 0 ? '오늘까지' : d === 1 ? '내일까지' : md(due) + '까지 (D-' + d + ')');
}
/** Open assignments as 다음 연습 추천 reads them (practice-review-model context: started, not past due, not done). */
function fromHomework(db, {today} = {}) {
  if (!isDay(today)) return [];
  const R = dep.review();
  const open = R ? R.context(db || {}, {today, start:today}).homework : [];
  const doneToday = new Set(live(db, 'dailyGoals').filter(g => g.date === today && g.source === 'homework' && g.completed === true).map(g => g.sourceId));
  return open.filter(t => !doneToday.has(t.id)).map((t, i) => item('homework', {id:t.id, title:t.title, why:dueText(t.dueDate, today), songId:t.songId,
    due:t.dueDate || '', action:{kind:'homework', assignmentId:t.id, ...(t.songId ? {songId:t.songId} : {})}, links:['assignment:' + t.id], order:i}));
}

/* ---------- 레슨 지적 체크 ---------- */
/** Active points whose latest marked run (within `days` of today) was 놓쳤어요: the most often missed first. */
function fromLessonPoints(db, {today, days = POINT_DAYS} = {}) {
  const P = dep.points();
  if (!P || !isDay(today)) return [];
  const songs = [...new Set(list(db?.[P.LIST]).filter(P.isPoint).map(p => p.songId))];
  const out = [];
  for (const songId of songs) {
    const runs = P.runs(db, songId);
    for (const p of P.active(P.points(db, songId))) {
      const marked = runs.filter(r => P.RESULTS.includes(r.results[p.id]));
      const last = marked.at(-1);
      if (!last || last.results[p.id] !== 'missed') continue;
      const age = daysBetween(last.date, today);
      if (!(age >= 0 && age <= days)) continue;
      const rec = P.record(runs, p.id), title = songTitle(db, songId);
      out.push({...item('lesson-point', {id:p.id, title:(title ? title + ' · ' : '') + P.label(p.measures) + ' · ' + p.text,
        why:'레슨 지적 · ' + P.recordText(rec) + ' · 마지막 체크에서 놓쳤어요', songId, measures:{...p.measures},
        action:{kind:'lesson-point', songId, pointId:p.id, measures:{...p.measures}, href:'#/song/' + encodeURIComponent(songId)}, links:['point:' + p.id]}),
        _missed:rec.total - rec.kept, _last:last.date});
    }
  }
  out.sort((a, b) => b._missed - a._missed || b._last.localeCompare(a._last) || a.id.localeCompare(b.id));
  return out.map(({_missed, _last, ...x}, i) => ({...x, order:i}));
}

/* ---------- 측정 기반 ---------- */
/**
 * overall: VzipOverallGrowth.calculate(…) (its `recommendations`, as 전체 분석 "다음에 연습할 것" shows them);
 * monthly: a monthlyGrowthReports row (its `recommendations`, as 월별 "추천 연습" kept them) or that list itself;
 * tips: VZ.practiceTips(media, {songId}) (and `songId` when it was for one song). One item per measure and song.
 */
function fromMeasures({overall = null, monthly = null, tips = null, songId = ''} = {}) {
  const G = dep.metrics(), METRICS = list(G?.METRICS), byId = Object.fromEntries(METRICS.map(m => [m.id, m]));
  const byHelp = Object.fromEntries(METRICS.filter(m => m.help).map(m => [m.help, m.id]));
  const out = [];
  const add = (metric, title, why, minutes, extra = {}) => {
    if (!clean(title)) return;
    const sid = extra.songId || '';
    out.push(item('measure', {id:metric + (sid ? ':' + sid : ''), title, why, songId:sid,
      action:{kind:extra.tipKey ? 'practice-tip' : 'add-goal', metric, title:clean(title), minutes:Number(minutes) || 0, ...(extra.tipKey ? {tipKey:extra.tipKey} : {}), ...(sid ? {songId:sid} : {})},
      links:['metric:' + metric + ':' + sid], order:out.length}));
  };
  for (const m of list(overall?.recommendations)) {
    if (!m?.practice) continue;
    add(m.id, m.practice, '측정 기반 · ' + m.title + ' · ' + (m.worsened ? '같은 곡 ' + m.worsened + '곡에서 아쉬운 방향이에요' : '기초 데이터를 쌓아요') + (m.minutes ? ' · 권장 ' + m.minutes + '분' : ''), m.minutes);
  }
  const month = Array.isArray(monthly) ? {recommendations:monthly} : monthly;
  for (const r of list(month?.recommendations)) {
    const d = byId[r?.key];
    if (!r?.practice) continue;
    add(r.key, r.practice, '측정 기반 · ' + (r.title || d?.title || '') + (month?.month ? ' · ' + month.month + ' 추천 연습' : ' · 월별 추천 연습') + (r.minutes ? ' · 권장 ' + r.minutes + '분' : ''), r.minutes);
  }
  if (tips?.enough) for (const t of list(tips.tips)) {
    if (!t?.name) continue;
    add(byHelp[t.key] || 'tip-' + t.key, t.name, '측정 기반 · ' + t.metric + ' ' + t.value + ' (' + t.basis + ')' + (t.minutes ? ' · 권장 ' + t.minutes + '분' : ''), t.minutes, {tipKey:t.key, songId});
  }
  return out;
}

/* ---------- 발성 정밀 측정 ---------- */
/**
 * session: the device's restored session (VzipPrecisionSession.restore) or null; results: the device's result objects
 * (null when not read); changes: VzipGrowthChanges.taskChanges(results, …) or build(…) (its `excluded`). At most one item.
 */
function fromPrecision({session = null, results = null, changes = null} = {}) {
  const S = dep.precision();
  const go = (id, title, why, href = '#/precision-measurement') => [item('precision', {id, title, why, action:{kind:'route', href}, links:['precision:' + id]})];
  if (session && S) {
    const p = S.progress(session), started = list(session.tasks).some(t => list(t.attempts).length);
    if (started && p.complete + p.failed < p.total) return go('resume', '발성 정밀 측정 이어서 하기', '정밀 측정 · ' + p.total + '개 과제 중 ' + p.complete + '개 했어요');
  }
  if (Array.isArray(results) && !results.length) return go('start', '발성 정밀 측정 표준 과제 녹음하기', '정밀 측정 · 같은 과제·모음·음량끼리 비교하려면 기준 측정이 있어야 해요');
  const once = list(changes?.excluded).filter(x => x?.kind === 'task' && x.reason === 'one-day');
  if (once.length) return go('again', '발성 정밀 측정 다른 날 한 번 더 하기', '정밀 측정 · 다른 날 잰 같은 과제가 아직 없어요 (' + once.length + '개 과제)');
  return [];
}

/* ---------- 오늘 목표 · 연습 계획 ---------- */
/** Links of a daily goal to what it was made from, so the same thing is one item. */
function goalLinks(g, R) {
  const out = [];
  const routine = R?.routineOf?.(g);
  if (routine) out.push('routine:' + routine);
  if (g.sourceId) out.push(g.source === 'homework' ? 'assignment:' + g.sourceId : 'plan:' + g.sourceId);
  return out;
}
/** Today's unfinished goals, in 홈's order (app/student-home-model.js build().goals). */
function fromGoals(db, {today} = {}) {
  const H = dep.home(), R = dep.routines();
  if (!H || !isDay(today)) return [];
  return H.build(db || {}, {today}).goals.filter(g => g.completed !== true && clean(g.title)).map((g, i) => {
    const songId = g.songId || '';
    return item('goal', {id:g.id, title:g.title, why:g.source === 'homework' ? '오늘 목표 · 숙제' : R?.routineOf?.(g) ? '오늘 목표 · 반복 목표' : '오늘 목표',
      songId, action:{kind:'goal', goalId:g.id, ...(songId ? {songId} : {})}, links:goalLinks(g, R), order:i});
  });
}
const SEGMENT = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
const PLAN_METRIC = {intonation:'음정 정확도', stability:'음정 안정성', phrase:'호흡 유지', vibrato:'비브라토 규칙성'};
/** Monthly song plans running today (app/practice-set-model.js activePlans) and running 반복 목표 (app/goal-routines.js). */
function fromPlans(db, {today} = {}) {
  if (!isDay(today)) return [];
  const S = dep.set(), R = dep.routines(), out = [];
  for (const p of S ? S.activePlans(db || {}, today) : []) {
    const seg = Number.isFinite(p.segmentStart) && Number.isFinite(p.segmentEnd) ? SEGMENT(p.segmentStart) + '–' + SEGMENT(p.segmentEnd) : '';
    const title = [songTitle(db, p.songId), PLAN_METRIC[p.metric] || '연습', seg].filter(Boolean).join(' · ');
    const day = daysBetween(p.startDate, today) + 1;
    out.push(item('plan', {id:p.id, title, why:'곡별 집중 연습 계획 · ' + (Number(p.days) > 0 ? p.days + '일 중 ' + day + '일째' : day + '일째'), songId:p.songId || '',
      action:{kind:'plan', planId:p.id, ...(p.songId ? {songId:p.songId} : {}), ...(seg ? {segmentStart:p.segmentStart, segmentEnd:p.segmentEnd} : {})},
      links:['plan:' + p.id], order:out.length}));
  }
  for (const r of R ? R.routines(db || {}).filter(r => R.active(r, today) && (!isDay(r.startDate) || r.startDate <= today)) : []) {
    if (!clean(r.title)) continue;
    out.push(item('plan', {id:r.id, title:r.title, why:'반복 목표' + (isDay(r.endDate) ? ' · ' + md(r.endDate) + '까지' : ''), songId:r.songId || '',
      action:{kind:'routine', routineId:r.id}, links:['routine:' + r.id, ...(r.sourceId ? [(r.source === 'homework' ? 'assignment:' : 'plan:') + r.sourceId] : [])], order:out.length}));
  }
  return out;
}

/* ---------- AI 초안 ---------- */
const NOTE_PART = /(?:^|\n)\s*(요약|좋아진 점|보완할 점|다음 연습)\s*[:：]\s*/g;
/** The "다음 연습" part of an AI coach note (as app/overall-growth-ui.js noteHtml splits it), one line per suggestion. */
function noteNext(note) {
  const raw = String(note || ''), parts = [...raw.matchAll(NOTE_PART)];
  const i = parts.findIndex(m => m[1] === '다음 연습');
  if (i < 0) return [];
  const body = raw.slice(parts[i].index + parts[i][0].length, i + 1 < parts.length ? parts[i + 1].index : raw.length);
  return body.split(/\n+/).map(l => clean(l.replace(/^\s*(?:[-•*]|\d+[.)])\s*/, ''))).filter(Boolean).slice(0, 2);
}
/** AI drafts newer than `days` that nobody took or skipped yet, newest first. */
function fromAi(db, {today, days = AI_DAYS} = {}) {
  if (!isDay(today)) return [];
  const fresh = d => { const age = daysBetween(String(d || '').slice(0, 10), today); return age >= 0 && age <= days; };
  const out = [];
  const push = (date, x) => out.push({...x, _date:String(date || '').slice(0, 10)});
  for (const r of live(db, 'overallAiReports').filter(r => r.id === 'overall-ai:all' && fresh(r.createdDate))) {
    noteNext(r.note).forEach((line, k) => push(r.createdDate, item('ai', {id:r.id + ':' + k, title:line, why:'AI 전체 코치 초안 · ' + md(r.createdDate),
      action:{kind:'ai-draft', ref:{kind:'overall-ai', id:r.id}, href:'#/vocal-growth'}, links:['ai:' + r.id + ':' + k]})));
  }
  const months = live(db, 'monthlyAiReports').filter(r => fresh(r.createdDate)).sort((a, b) => String(b.month || '').localeCompare(String(a.month || '')));
  for (const r of months.slice(0, 1)) {
    noteNext(r.note).forEach((line, k) => push(r.createdDate, item('ai', {id:r.id + ':' + k, title:line, why:'AI 월간 코치 초안 · ' + (r.month || ''),
      action:{kind:'ai-draft', ref:{kind:'monthly-ai', id:r.id}, href:'#/vocal-growth?mode=monthly'}, links:['ai:' + r.id + ':' + k]})));
  }
  for (const p of live(db, 'practicePlans')) {
    if (p.period === 'ai-review' && p.status === 'draft' && clean(p.proposal?.action) && fresh(p.date)) {
      push(p.date, item('ai', {id:p.id, title:p.proposal.action, why:'다음 연습 추천 초안' + (p.proposal.reason ? ' · ' + p.proposal.reason : ''), songId:p.songId || p.proposal.songId || '',
        action:{kind:'ai-draft', ref:{kind:'ai-review', id:p.id}, href:'#/practice-review' + (String(p.id).endsWith(':today') ? '?mode=today' : p.songId ? '?song=' + encodeURIComponent(p.songId) : '')},
        links:['plan:' + p.id]}));
    } else if (p.period === 'ai-exercise' && clean(p.tip?.name) && fresh(p.date)) {
      push(p.date, item('ai', {id:p.id, title:p.tip.name, why:'곡 분석 AI 다른 연습' + (p.tip.reason ? ' · ' + p.tip.reason : ''), songId:p.songId || '',
        action:{kind:'ai-draft', ref:{kind:'ai-exercise', id:p.id}, href:'#/vocal-lab/' + encodeURIComponent(p.songId || '')}, links:['plan:' + p.id]}));
    }
  }
  out.sort((a, b) => b._date.localeCompare(a._date) || a.id.localeCompare(b.id));
  return out.map(({_date, ...x}, i) => ({...x, order:i}));
}

/* ---------- one list ---------- */
/**
 * Candidates from the adapters → {items (at most `limit`), more (how many more), total}. The same thing from two
 * places is kept once, where it ranks highest, with every source in `sources` (and `also`: [{source, id}]).
 */
function merge(candidates, {limit = LIMIT} = {}) {
  const ranked = list(candidates).filter(x => x && SOURCES.includes(x.source) && x.title)
    .map((x, i) => ({x, i})).sort((a, b) => TIER[a.x.source] - TIER[b.x.source] ||
      SOURCES.indexOf(a.x.source) - SOURCES.indexOf(b.x.source) || (a.x.order || 0) - (b.x.order || 0) || a.i - b.i).map(r => r.x);
  const kept = [], owner = new Map();
  for (const c of ranked) {
    const keys = ['title:' + norm(c.title) + '|' + (c.songId || ''), ...list(c.links)];
    const found = keys.map(k => owner.get(k)).find(Boolean);
    if (found) {
      if (!found.sources.includes(c.source)) found.sources.push(c.source);
      found.also.push({source:c.source, id:c.id});
      for (const k of keys) if (!owner.has(k)) owner.set(k, found);
      continue;
    }
    const {links, order, ...rest} = c;
    const it = {...rest, sources:[c.source], also:[]};
    kept.push(it);
    for (const k of keys) owner.set(k, it);
  }
  const n = Math.max(0, Number.isInteger(limit) ? limit : LIMIT);
  return {items:kept.slice(0, n), more:Math.max(0, kept.length - n), total:kept.length};
}
/**
 * Every source at once. db: the app's records; today: 'YYYY-MM-DD'; overall / monthly / tips / precision: what the
 * screen already computed (see fromMeasures, fromPrecision) — left out, that source adds nothing.
 */
function build({db = {}, today, overall = null, monthly = null, tips = null, tipsSongId = '', precision = null, limit = LIMIT, aiDays = AI_DAYS, pointDays = POINT_DAYS} = {}) {
  if (!isDay(today)) throw Error('오늘 날짜를 확인해 주세요.');
  return merge([
    ...fromHomework(db, {today}),
    ...fromLessonPoints(db, {today, days:pointDays}),
    ...fromMeasures({overall, monthly, tips, songId:tipsSongId}),
    ...fromPrecision(precision || {}),
    ...fromGoals(db, {today}),
    ...fromPlans(db, {today}),
    ...fromAi(db, {today, days:aiDays})
  ], {limit});
}
return {SOURCES, LABEL, TIER, LIMIT, AI_DAYS, POINT_DAYS, norm, daysBetween, noteNext, dueText,
  fromHomework, fromLessonPoints, fromMeasures, fromPrecision, fromGoals, fromPlans, fromAi, merge, build};
});
