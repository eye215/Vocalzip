/* 원곡 기준 비교 (원곡(AR) 음정 비교, 시험판): in the vocal lab, one recording against the original singer's melody
 * extracted from the song's original recording (app/song-ar.js, app/ar-melody-model.js). The alignment is the score
 * comparison's (app/score-align-model.js, in its worker): key shift, partial takes, 판정 보류 when uncertain.
 * - The reference is never presented as ground truth: "원곡 가수의 멜로디(자동 추출)", ad-libs/harmonies/style differ.
 *   A reference that was itself withheld is not compared against at all.
 * - Each differing note can be heard in the take (▶ time) and in the original at the matching place (▶ 원곡).
 * - The recording's pitch curve is computed on this device (VZ.analyzeRecording, save:false); nothing is stored until
 *   결과 저장: then a small per-note summary goes to song.arCompare.takes[recordingId] (src 'ar').
 *   VZ.arNoteBlock(song, item) / VZ.arNoteBind(host, {song, item, player, full, keep}) */
(() => {
'use strict';
const VZ = window.VZ, A = window.VzipScoreAlign, AM = window.VzipArMelody;
if (!VZ || !A || !AM) return;
const esc = VZ.esc;
const WORKER = 'app/score-align-model.js?v=2', KEEP = 30, LIST = 40;
const clock = t => VZ.clock ? VZ.clock(t) : Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const songOf = song => VZ.song?.(song?.id) || song;
const fileOf = song => VZ.arFile?.(song?.id) || null;
const savedOf = (song, id) => songOf(song)?.arCompare?.takes?.[id] || null;
const jobs = new Map(), ctxs = new Map();

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
  const id = item.id, job = {status:'running', stage:'원곡 멜로디 확인 중…'};
  jobs.set(id, job); draw(id);
  const stage = text => { if (jobs.get(id) !== job) return; job.stage = text; draw(id); };
  try {
    const file = fileOf(song);
    if (!file) throw Error('이 곡에 원곡 파일이 없어요. 곡 > 레퍼런스에서 올려 주세요.');
    if (!window.VzipR2?.enabled?.()) throw Error('로그인하고 클라우드에 올린 원곡 파일에서 쓸 수 있어요.');
    const packed = await VZ.arReferenceEnsure(songOf(song), {onStage:stage});
    const ref = AM.unpack(packed);
    if (ref.state !== 'ok') { Object.assign(job, {status:'ref-hold', reason:ref.reason}); draw(id); return; }
    const melody = AM.toMelody(ref);
    let full = ctxs.get(id)?.full?.();
    if (!full?.curve) {
      stage('녹음 음높이 불러오는 중…');
      full = await VZ.analyzeRecording(item, {save:false, onStage:text => stage(text)});
      ctxs.get(id)?.keep?.(full);
    }
    if (!full?.metrics?.voicedSeconds) throw Error('이 녹음에서 노래한 부분을 찾지 못했어요.');
    stage('원곡 멜로디와 맞춰 보는 중…');
    const sung = AM.sungAgainst(A.framesOf(full), ref, full.confidence?.tuningFrom === 'mr');
    const raw = await alignInWorker(melody, sung, {reliable:!!VZ.analysisReliable?.(full.summary || full), rules:AM.ALIGN_RULES});
    Object.assign(job, {status:'done', result:AM.refine(raw, melody), melody, key:AM.compareKey(packed), file});
    primeAr(id, file);
  } catch (e) { Object.assign(job, {status:'error', error:e?.message || String(e)}); }
  if (jobs.get(id) === job) draw(id);
}

/* ---------- the original for ▶ 원곡 (signed URL fetched ahead, so play() stays inside the tap) ---------- */
const arAudio = new Map(); // recording id → {el, play, file}
function primeAr(id, file) {
  const have = arAudio.get(id);
  if (have && have.file === file.r2Key) return;
  const el = new Audio(); el.preload = 'metadata';
  const player = {el, file:file.r2Key, ready:false, play:() => { const p = el.play(); p?.catch?.(() => {}); }};
  arAudio.set(id, player);
  window.VzipR2.url(file.r2Key).then(url => { el.src = url; player.ready = true; }, () => {});
}

/* ---------- drawing ---------- */
const name = (midi, shift) => A.noteName(midi) + (shift ? '<small>(부른 키 ' + esc(A.noteName(midi + shift)) + ')</small>' : '');
function row(r, job, playable) {
  const n = job.melody.notes[r.i], at = n ? n.beat : 0, shift = job.result.shift;
  const what = r.status === 'missed' ? '원곡에만 있음 <em>(이 녹음엔 목소리가 거의 없음 · 애드리브·코러스일 수 있어요)</em>' : r.status === 'unsure' && r.sung == null ? '불확실' :
    '부른 음 ' + esc(A.nameOfCents(r.sung)) + ' <em>(' + esc(A.devText(r.dev)) + (r.status === 'unsure' ? ' · 불확실' : '') + ')</em>';
  const label = '원곡 ' + clock(at) + ' ' + A.noteName(r.midi);
  const take = playable ? '<button type="button" class="vl-chip-play" data-ar-seek="' + r.t + '" aria-label="' + esc(label + ' · 내 녹음 ' + clock(r.t) + ' 부분 듣기') + '"><i class="ph-fill ph-play" aria-hidden="true"></i> ' + clock(r.t) + '</button>' : '<small>' + clock(r.t) + '</small>';
  const orig = '<button type="button" class="vl-chip-play vl-ar-orig" data-ar-orig="' + at + '" aria-label="' + esc(label + ' · 원곡에서 듣기') + '"><i class="ph-fill ph-play" aria-hidden="true"></i> 원곡</button>';
  return '<li class="vl-note-row ' + r.status + '" data-ar-row="' + r.status + '"><span><b>원곡 ' + clock(at) + '</b>' + (r.visit > 1 ? '<small>(' + r.visit + '번째)</small>' : '') + ' · 원곡 ' + name(r.midi, shift) + ' → ' + what + '</span><span class="vl-ar-plays">' + take + orig + '</span></li>';
}
const DISCLAIMER = '원곡 가수의 멜로디(자동 추출)와 비교했어요. 원곡의 애드리브·화음·창법 차이와 추출 오류가 섞일 수 있어 정답이 아니에요. 실력 판정이 아니라 원곡과 다르게 들리는 곳을 찾아 직접 들어 보는 참고용이에요.';
function body(song, item, playable) {
  const job = jobs.get(item.id), saved = savedOf(song, item.id), file = fileOf(song), packed = VZ.arReference?.(song.id);
  const button = label => '<button type="button" class="vl-chip-play vl-note-run" data-ar-run' + (job?.status === 'running' ? ' disabled' : '') + '>' + label + '</button>';
  const head = '<div class="vl-measure"><span>원곡 기준 비교 <small>시험판 · 원곡 가수의 멜로디(자동 추출)라 틀릴 수 있어요</small></span>' + button(job?.status === 'done' ? '다시 비교' : '비교하기') + '</div>';
  if (!job) {
    const last = saved ? '<p class="vl-muted" data-ar-saved-summary>저장된 결과 · ' + (saved.state === 'ok' ? '원곡 기준 맞은 음 ' + saved.pct + '% (' + saved.ok + '/' + saved.judged + '음)' : '판정 보류') + (saved.at ? ' · ' + esc(VZ.dateLabel?.(new Date(saved.at).toISOString().slice(0, 10)) || '') : '') + '</p>' : '';
    const refState = packed ? (packed.state === 'ok' ? '원곡 멜로디는 이미 뽑아 두었어요.' : '원곡 멜로디 판정 보류: ' + esc(AM.holdRefText(packed.reason)) + '.')
      : '처음 비교할 때 원곡 "' + esc(file?.title || '원곡') + '"에서 멜로디를 한 번 뽑아요 (곡 길이에 따라 몇십 초~몇 분).';
    return head + last + '<p class="vl-muted">원곡 가수가 부른 음과 이 녹음에서 부른 음을 맞춰 봐요. ' + refState + ' 이 기기에서 계산하고, 저장된 분석과 원곡 파일은 바꾸지 않아요.</p>';
  }
  if (job.status === 'running') return head + '<p class="vl-muted" role="status" data-ar-status>' + esc(job.stage || '준비 중…') + '</p>';
  if (job.status === 'error') return head + '<p class="vl-muted vl-note-error" role="alert" data-ar-status>비교하지 못했어요: ' + esc(job.error) + '</p>';
  if (job.status === 'ref-hold') return head + '<div class="vl-high-row"><span>원곡 멜로디</span><span class="vrange-verdict hold" data-ar-verdict>판정 보류</span></div>' +
    '<p class="vl-muted" data-ar-reason>' + esc(AM.holdRefText(job.reason)) + '. 믿을 만한 기준이 아니라서 비교하지 않았어요. 보컬이 또렷한 음원이면 나아질 수 있어요.</p>';
  const r = job.result, shift = AM.shiftText(r.shift);
  const cover = '원곡 구절 ' + r.coveredMeasures + '/' + r.measuresTotal + '개 비교';
  if (r.state === 'hold') return head + '<div class="vl-high-row"><span>결과</span><span class="vrange-verdict hold" data-ar-verdict>판정 보류</span></div>' +
    '<p class="vl-muted" data-ar-reason>' + esc(AM.holdText(r.reason)) + (r.coveredMeasures ? ' · ' + cover : '') + '</p>';
  const off = r.rows.filter(x => x.status === 'high' || x.status === 'low'), only = r.rows.filter(x => x.status === 'missed').length;
  const counts = [['ok', r.ok, '맞음'], ['high', r.high, '높음'], ['low', r.low, '낮음'], ['unsure', r.unsure, '불확실'], ['missed', r.missed, '원곡에만']].filter(([, n]) => n).map(([k, n, l]) => '<span class="vl-note-count ' + k + '">' + l + ' ' + n + '</span>').join('');
  const phrases = job.melody.phrases;
  const worst = r.worst.length ? '<p class="vl-note-worst" data-ar-worst>다시 들어 볼 구간 <b>' + r.worst.map(w => '원곡 ' + clock(phrases[w.mi] || 0)).join(' · ') + '</b></p>' : '';
  const repeat = r.repeat?.length ? '<p class="vl-muted" data-ar-repeat>원곡에서 같은 멜로디가 반복돼서(후렴 등) ▶ 원곡이 다른 반복 자리를 들려줄 수 있어요.</p>' : '';
  return head +
    '<div class="vl-note-sum" data-ar-summary><strong>원곡 기준 맞은 음 ' + r.pct + '%' + (shift ? ' · ' + esc(shift) : '') + '</strong><span>±50 cent 안 ' + r.ok + '/' + r.judged + '음 · ' + cover + '</span></div>' +
    (shift ? '<p class="vl-note-key" data-ar-key><i class="ph ph-music-notes" aria-hidden="true"></i><span>' + esc(shift) + ' 부른 것으로 보고, 그 키로 옮긴 원곡 멜로디와 비교했어요.</span></p>' : '') +
    '<div class="vl-note-counts">' + counts + '</div>' + worst + repeat +
    (off.length ? '<ul class="vl-note-list" data-ar-off>' + off.slice(0, LIST).map(x => row(x, job, playable)).join('') + '</ul>' + (off.length > LIST ? '<p class="vl-muted">처음 ' + LIST + '개만 보여요.</p>' : '')
      : '<p class="vl-muted">비교한 음이 모두 원곡 멜로디의 ±50 cent 안이에요.</p>') +
    (only ? '<p class="vl-muted" data-ar-only>원곡에만 있는 소리 ' + only + '개는 틀린 음으로 세지 않아요 (애드리브·코러스·추출 오류일 수 있어요).</p>' : '') +
    '<details class="vl-note-all" data-ar-all><summary>모든 음 보기 (' + r.rows.length + ')</summary><ul class="vl-note-list" data-ar-all-list></ul></details>' +
    '<p class="vl-muted vl-ar-disclaimer" data-ar-disclaimer>' + DISCLAIMER + '</p>' + save(job, saved);
}
function save(job, saved) {
  const same = job.saved || (saved && saved.at === job.savedAt);
  return '<div class="vl-note-actions"><button type="button" class="vl-note-save" data-ar-save' + (same ? ' disabled' : '') + '>' + (same ? '<i class="ph ph-check" aria-hidden="true"></i> 저장됨' : '결과 저장') + '</button>' +
    '<small>저장하면 음마다 맞음·높음·낮음 요약만 곡에 남아요(원곡 기준).' + (saved && !same ? ' 이 녹음의 이전 저장 결과를 바꿔요.' : '') + '</small></div>';
}
function draw(id) {
  const ctx = ctxs.get(id), el = ctx?.host?.querySelector('[data-ar-cmp]');
  if (!el || !el.isConnected) return;
  el.innerHTML = body(ctx.song, ctx.item, !!ctx.player);
}

VZ.arNoteBlock = (song, item) => fileOf(song) && item ? '<div class="vl-note-cmp vl-ar-cmp" data-ar-cmp="' + esc(item.id) + '"></div>' : '';
VZ.arNoteBind = (host, ctx) => {
  const el = host?.querySelector('[data-ar-cmp]');
  if (!el || !ctx?.item) return;
  ctxs.set(ctx.item.id, {...ctx, host});
  draw(ctx.item.id);
  el.addEventListener('click', e => {
    const c = ctxs.get(ctx.item.id) || ctx;
    const seek = e.target.closest('[data-ar-seek]');
    if (seek) { arAudio.get(c.item.id)?.el.pause(); VZ.analysisPlayAt?.(c.player, seek.dataset.arSeek); return; }
    const orig = e.target.closest('[data-ar-orig]');
    if (orig) {
      const a = arAudio.get(c.item.id);
      if (!a?.ready) { VZ.toast('원곡을 불러오는 중이에요. 잠시 후 다시 눌러 주세요.'); return; }
      try { c.player?.el?.pause(); } catch {}
      VZ.analysisPlayAt?.(a, orig.dataset.arOrig);
      return;
    }
    if (e.target.closest('[data-ar-run]')) { run(c.song, c.item); return; }
    if (e.target.closest('[data-ar-save]')) store(c);
  });
  el.addEventListener('toggle', e => {
    const d = e.target.closest?.('[data-ar-all]'), list = d?.querySelector('[data-ar-all-list]'), job = jobs.get(ctx.item.id);
    if (d?.open && list && !list.children.length && job?.result) list.innerHTML = job.result.rows.map(x => row(x, job, !!(ctxs.get(ctx.item.id) || ctx).player)).join('');
  }, true);
};
function store(ctx) {
  const job = jobs.get(ctx.item.id);
  if (!job?.result || !job.key) return;
  const record = {...A.compact(job.result, job.key), src:'ar'};
  const ok = VZ.change(db => {
    const s = db.songs.find(x => x.id === ctx.song.id);
    if (!s) throw Error('곡을 찾을 수 없어요.');
    const takes = {...(s.arCompare?.takes || {}), [ctx.item.id]:record};
    const keep = Object.entries(takes).sort((a, b) => (b[1].at || 0) - (a[1].at || 0)).slice(0, KEEP);
    s.arCompare = {v:1, takes:Object.fromEntries(keep)};
  }, {silent:true});
  if (!ok) return;
  job.saved = true; job.savedAt = record.at;
  VZ.toast('원곡 기준 비교 결과를 저장했어요.');
  draw(ctx.item.id);
}
})();
