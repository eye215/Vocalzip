/* 음표 단위 악보 비교 (시험판): in the vocal lab, one recording against the vocal part the owner confirmed for the song
 * (song.vocalRange from a converted score, app/score-range.js). The score's notes come from the same converted .mxl;
 * the recording's pitch curve is computed on this device (VZ.analyzeRecording, save:false — the saved analysis is not
 * touched) and aligned in a worker (app/score-align-model.js).
 * - Measured values are never moved to fit the score. A key the singer moved is detected and said out loud.
 * - Weak alignment, unclear key or low analysis confidence → 판정 보류.
 * - Nothing is stored until the owner taps 결과 저장: then a small per-note summary is kept on the song
 *   (song.noteCompare.takes[recordingId]), keyed by score + conversion version + part.
 *   VZ.scoreNoteBlock(song, item)                 — HTML placeholder for the vocal lab (dark)
 *   VZ.scoreNoteBind(host, {song, item, player, full, keep}) — wires it (tap-to-listen on the lab's player) */
(() => {
'use strict';
const VZ = window.VZ, R = window.VzipScoreRange, A = window.VzipScoreAlign;
if (!VZ || !R || !A) return;
const esc = VZ.esc;
const WORKER = 'app/score-align-model.js?v=1', KEEP = 30, LIST = 40;
const clock = t => VZ.clock ? VZ.clock(t) : Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const songOf = song => VZ.song?.(song?.id) || song;
const refOf = song => { const r = songOf(song)?.vocalRange; return r && r.source === 'score' && r.scoreId && r.partId ? r : null; };
const savedOf = (song, id) => songOf(song)?.noteCompare?.takes?.[id] || null;
const jobs = new Map(), ctxs = new Map(); // recording id → {status, stage, result, key, error, saved}; → latest bind

function alignInWorker(melody, sung, options) {
  return new Promise((resolve, reject) => {
    let w;
    try { w = new Worker(WORKER); } catch { setTimeout(() => { try { resolve(A.align(melody, sung, options)); } catch (e) { reject(e); } }, 0); return; }
    w.onmessage = e => { w.terminate(); e.data.error ? reject(Error(e.data.error)) : resolve(e.data.result); };
    w.onerror = e => { w.terminate(); e.preventDefault?.(); try { resolve(A.align(melody, sung, options)); } catch (err) { reject(err); } };
    w.postMessage({melody:{notes:melody.notes, measures:melody.measures}, sung:{cents:sung.cents, fps:sung.fps, tuning:sung.tuning}, options});
  });
}

async function run(song, item) {
  const id = item.id, ref = refOf(song), job = {status:'running', stage:'악보 읽는 중…'};
  jobs.set(id, job); draw(id);
  const stage = text => { job.stage = text; draw(id); };
  try {
    if (!ref) throw Error('악보에서 가져온 기준 음역이 없어요.');
    const score = (songOf(song)?.scores || []).find(s => s && s.id === ref.scoreId);
    if (!score) throw Error('기준 음역을 가져온 악보가 이 곡에 없어요. 악보 기준 음역을 다시 설정해 주세요.');
    if (!window.VzipR2?.enabled?.() || !window.VzipR2.omr || !VZ.vocalRangeLoadScore) throw Error('로그인하고 클라우드에 올라간 악보에서 쓸 수 있어요.');
    const loaded = await VZ.vocalRangeLoadScore(score);
    if (!loaded.xml) throw Error(loaded.job && ['queued', 'running'].includes(loaded.job.status) ? '악보를 아직 음표로 변환하는 중이에요.' : '악보가 음표로 변환되지 않았어요.');
    const melody = R.melody(new DOMParser().parseFromString(loaded.xml, 'application/xml'), ref.partId);
    if (melody.notes.length < A.RULES.minCovered) throw Error('고른 파트에서 음표를 충분히 찾지 못했어요.');
    let full = ctxs.get(id)?.full?.();
    if (!full?.curve) {
      stage('녹음 음높이 불러오는 중…');
      full = await VZ.analyzeRecording(item, {save:false, onStage:text => stage(text)});
      ctxs.get(id)?.keep?.(full);
    }
    if (!full?.metrics?.voicedSeconds) throw Error('이 녹음에서 노래한 부분을 찾지 못했어요.');
    stage('악보와 맞춰 보는 중…');
    const result = await alignInWorker(melody, A.framesOf(full), {reliable:!!VZ.analysisReliable?.(full.summary || full)});
    Object.assign(job, {status:'done', result, key:{scoreId:score.id, version:loaded.job?.id || loaded.job?.finished || '', partId:ref.partId, part:ref.part || melody.part}});
  } catch (e) { Object.assign(job, {status:'error', error:e?.message || String(e)}); }
  if (jobs.get(id) === job) draw(id);
}

/* ---------- drawing ---------- */
const pitchOf = (r, shift) => R.noteName(r.midi) + (shift ? '<small>(부른 키 ' + esc(A.noteName(r.midi + shift)) + ')</small>' : '');
function row(r, shift, playable) {
  const what = r.status === 'missed' ? '놓침 <em>(목소리 거의 없음)</em>' : r.status === 'unsure' && r.sung == null ? '불확실' :
    '부른 음 ' + esc(A.nameOfCents(r.sung)) + ' <em>(' + esc(A.devText(r.dev)) + (r.status === 'unsure' ? ' · 불확실' : '') + ')</em>';
  const play = playable ? '<button type="button" class="vl-chip-play" data-note-seek="' + r.t + '" aria-label="' + esc(r.measure + '마디 ' + R.noteName(r.midi) + ' ' + clock(r.t) + ' 부분 듣기') + '"><i class="ph-fill ph-play" aria-hidden="true"></i> ' + clock(r.t) + '</button>' : '<small>' + clock(r.t) + '</small>';
  return '<li class="vl-note-row ' + r.status + '" data-note-row="' + r.status + '"><span><b>' + esc(r.measure) + '마디</b>' + (r.visit > 1 ? '<small>(' + r.visit + '번째)</small>' : '') + ' · 악보 ' + pitchOf(r, shift) + ' → ' + what + (r.lyric ? ' <small class="vl-note-lyric">' + esc(r.lyric) + '</small>' : '') + '</span>' + play + '</li>';
}
function body(song, item, playable) {
  const job = jobs.get(item.id), saved = savedOf(song, item.id), ref = refOf(song);
  const button = (label, attr = 'data-note-run') => '<button type="button" class="vl-chip-play vl-note-run" ' + attr + (job?.status === 'running' ? ' disabled' : '') + '>' + label + '</button>';
  const head = '<div class="vl-measure"><span>음표 단위 비교 <small>시험판 · 자동 악보 인식과 정렬이라 틀릴 수 있어요</small></span>' + button(job?.status === 'done' ? '다시 비교' : '비교하기') + '</div>';
  if (!job) {
    const last = saved ? '<p class="vl-muted" data-note-saved-summary>저장된 결과 · ' + (saved.state === 'ok' ? '맞은 음 ' + saved.pct + '% (' + saved.ok + '/' + saved.judged + '음)' : '판정 보류') + ' · ' + saved.cover[0] + '/' + saved.cover[1] + '마디' + (saved.at ? ' · ' + esc(VZ.dateLabel?.(VZ.ymd(new Date(saved.at))) || '') : '') + '</p>' : '';
    return head + last + '<p class="vl-muted">악보 "' + esc(ref.part || '보컬') + '" 파트의 음표와 이 녹음에서 부른 음을 마디별로 맞춰 봐요. 이 기기에서 계산하고, 저장된 분석은 바꾸지 않아요.</p>';
  }
  if (job.status === 'running') return head + '<p class="vl-muted" role="status" data-note-status>' + esc(job.stage || '준비 중…') + '</p>';
  if (job.status === 'error') return head + '<p class="vl-muted vl-note-error" role="alert" data-note-status>비교하지 못했어요: ' + esc(job.error) + '</p>';
  const r = job.result, shiftNote = r.shift ? '<p class="vl-note-key" data-note-key><i class="ph ph-music-notes" aria-hidden="true"></i><span>' + esc(A.shiftText(r.shift)) + ' 부른 것으로 보고, 그 기준으로 비교했어요.</span></p>' : '';
  const cover = r.coveredMeasures + '/' + r.measuresTotal + '마디 비교';
  if (r.state === 'hold') return head + '<div class="vl-high-row"><span>결과</span><span class="vrange-verdict hold" data-note-verdict>판정 보류</span></div>' +
    '<p class="vl-muted" data-note-reason>' + esc(A.holdText(r.reason)) + (r.coveredMeasures ? ' · ' + cover : '') + '</p>' + (r.reason === 'confidence' ? shiftNote : '');
  const off = r.rows.filter(x => ['high', 'low', 'missed'].includes(x.status));
  const counts = [['ok', r.ok], ['high', r.high], ['low', r.low], ['missed', r.missed], ['unsure', r.unsure]].filter(([, n]) => n).map(([k, n]) => '<span class="vl-note-count ' + k + '">' + A.STATUS[k] + ' ' + n + '</span>').join('');
  const worst = r.worst.length ? '<p class="vl-note-worst" data-note-worst>다시 들어 볼 마디 <b>' + r.worst.map(w => esc(w.measure)).join(' · ') + '</b></p>' : '';
  const repeat = r.repeat?.length ? '<p class="vl-muted" data-note-repeat>같은 멜로디가 ' + r.repeat.map(x => esc(x.other)).join(', ') + '마디에도 있어 마디 번호가 다를 수 있어요.</p>' : '';
  return head +
    '<div class="vl-note-sum" data-note-summary><strong>맞은 음 ' + r.pct + '%</strong><span>±50 cent 안 ' + r.ok + '/' + r.judged + '음 · ' + cover + '</span></div>' +
    shiftNote + '<div class="vl-note-counts">' + counts + '</div>' + worst + repeat +
    (off.length ? '<ul class="vl-note-list" data-note-off>' + off.slice(0, LIST).map(x => row(x, r.shift, playable)).join('') + '</ul>' + (off.length > LIST ? '<p class="vl-muted">처음 ' + LIST + '개만 보여요.</p>' : '')
      : '<p class="vl-muted">비교한 음이 모두 ±50 cent 안이에요.</p>') +
    '<details class="vl-note-all" data-note-all><summary>모든 음 보기 (' + r.rows.length + ')</summary><ul class="vl-note-list" data-note-all-list></ul></details>' +
    '<p class="vl-muted">측정값은 악보에 맞춰 고치지 않아요. 맞음은 ±50 cent 안, 놓침은 그 자리에 목소리가 거의 없을 때예요. 실력 판정이 아니라 다시 들어 볼 곳을 찾는 참고용이에요.</p>' + save(r, job, saved);
}
function save(r, job, saved) {
  const same = job.saved || (saved && saved.at === job.savedAt);
  return '<div class="vl-note-actions"><button type="button" class="vl-note-save" data-note-save' + (same ? ' disabled' : '') + '>' + (same ? '<i class="ph ph-check" aria-hidden="true"></i> 저장됨' : '결과 저장') + '</button>' +
    '<small>저장하면 음마다 맞음·높음·낮음 요약만 곡에 남아요.' + (saved && !same ? ' 이 녹음의 이전 저장 결과를 바꿔요.' : '') + '</small></div>';
}
function draw(id) {
  const ctx = ctxs.get(id), el = ctx?.host?.querySelector('[data-note-cmp]');
  if (!el || !el.isConnected) return;
  el.innerHTML = body(ctx.song, ctx.item, !!ctx.player);
}

VZ.scoreNoteBlock = (song, item) => refOf(song) && item ? '<div class="vl-note-cmp" data-note-cmp="' + esc(item.id) + '"></div>' : '';
VZ.scoreNoteBind = (host, ctx) => {
  const el = host?.querySelector('[data-note-cmp]');
  if (!el || !ctx?.item) return;
  ctxs.set(ctx.item.id, {...ctx, host});
  draw(ctx.item.id);
  el.addEventListener('click', e => {
    const c = ctxs.get(ctx.item.id) || ctx;
    const seek = e.target.closest('[data-note-seek]');
    if (seek) { VZ.analysisPlayAt?.(c.player, seek.dataset.noteSeek); return; }
    if (e.target.closest('[data-note-run]')) { run(c.song, c.item); return; }
    if (e.target.closest('[data-note-save]')) store(c);
  });
  el.addEventListener('toggle', e => {
    const d = e.target.closest?.('[data-note-all]'), list = d?.querySelector('[data-note-all-list]'), job = jobs.get(ctx.item.id);
    if (d?.open && list && !list.children.length && job?.result) list.innerHTML = job.result.rows.map(x => row(x, job.result.shift, !!(ctxs.get(ctx.item.id) || ctx).player)).join('');
  }, true);
};
function store(ctx) {
  const job = jobs.get(ctx.item.id);
  if (!job?.result || !job.key) return;
  const record = A.compact(job.result, job.key);
  const ok = VZ.change(db => {
    const s = db.songs.find(x => x.id === ctx.song.id);
    if (!s) throw Error('곡을 찾을 수 없어요.');
    const takes = {...(s.noteCompare?.takes || {}), [ctx.item.id]:record};
    // Small: keep the most recent results only.
    const keep = Object.entries(takes).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, KEEP);
    s.noteCompare = {v:1, takes:Object.fromEntries(keep)};
  }, {silent:true});
  if (!ok) return;
  job.saved = true; job.savedAt = record.at;
  VZ.toast('음표 단위 비교 결과를 저장했어요.');
  draw(ctx.item.id);
}
})();
