/* 악보 기준 음정 비교 (score-based pitch check): a song keeps one reference range (song.vocalRange) taken from the
 * vocal part of its converted score (.mxl, see app/score-omr.js) or entered by hand, and the vocal lab compares a
 * recording's measured highest notes with it.
 * - Recognition (OMR) and part detection are automatic, so the owner always sees the parts and confirms before
 *   anything is saved. A hand-entered range is never replaced without asking.
 * - The comparison never changes measured values to fit the score; old (v1) or low-confidence results are 판정 보류.
 *   A range difference is not a skill judgement.
 *   VZ.vocalRangeCard(host, song)            — card on the song's 악보 tab
 *   VZ.vocalRangeSheet(song, done)           — set from a score / by hand / remove
 *   VZ.vocalRangeCompare(song, analysis, {playable}) — HTML block for the vocal lab (dark)
 *   VZ.vocalRangeBind(host, song, redraw)    — wires the block's 설정 button */
(() => {
'use strict';
const VZ = window.VZ, R = window.VzipScoreRange;
if (!VZ || !R) return;
const esc = VZ.esc;
const LOWEST = 36, HIGHEST = 96; // C2–C7
const clock = t => VZ.clock ? VZ.clock(t) : Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
const rangeOf = song => { const r = (VZ.song?.(song?.id) || song)?.vocalRange; return r && Number.isFinite(r.lowMidi) && Number.isFinite(r.highMidi) ? r : null; };
const scoresOf = song => ((VZ.song?.(song?.id) || song)?.scores || []).filter(s => s && s.id);
const sourceText = (song, r) => {
  if (r.source !== 'score') return '직접 입력';
  const score = scoresOf(song).find(s => s.id === r.scoreId);
  return '악보' + (score ? ' "' + (score.title || score.fileName || '') + '"' : ' (삭제됨)') + (r.part ? ' · ' + r.part + ' 파트' : '');
};
function save(song, range) {
  return VZ.change(db => {
    const s = db.songs.find(x => x.id === song.id);
    if (!s) throw Error('곡을 찾을 수 없어요.');
    if (range) s.vocalRange = range; else delete s.vocalRange;
  }, {silent:true});
}

/* ---------- song card (light) ---------- */
VZ.vocalRangeCard = (host, song) => {
  if (!host || !song) return;
  const r = rangeOf(song);
  host.innerHTML = '<section class="vrange-card" aria-label="악보 기준 음역"><div class="vrange-head"><h2>악보 기준 음역</h2>' +
    '<button type="button" class="icon-btn" data-vrange-edit aria-label="악보 기준 음역 설정"><i class="ph ph-' + (r ? 'pencil-simple' : 'plus') + '" aria-hidden="true"></i></button></div>' +
    (r ? '<p class="vrange-value" data-vrange-value>' + esc(r.low) + ' – ' + esc(r.high) + '</p><p class="vrange-sub">' + esc(sourceText(song, r)) + ' · 내가 확인함</p>' +
      '<p class="vrange-sub">보컬 연구소에서 녹음의 최고음과 비교해요. 실력 판정이 아니라 참고용이에요.</p>'
      : '<p class="vrange-sub">변환된 악보의 보컬 파트에서 가져오거나 직접 입력하면, 보컬 연구소에서 녹음 최고음과 비교해요.</p>') + '</section>';
  host.querySelector('[data-vrange-edit]').onclick = () => VZ.vocalRangeSheet(song, () => VZ.vocalRangeCard(host, VZ.song(song.id) || song));
};

/* ---------- set / change sheet ---------- */
const noteOptions = selected => { let h = ''; for (let m = HIGHEST; m >= LOWEST; m--) h += '<option value="' + m + '"' + (m === selected ? ' selected' : '') + '>' + R.noteName(m) + (m === 60 ? ' (가운데 도)' : '') + '</option>'; return h; };
async function loadScore(score) {
  const job = await window.VzipR2.omr.status(score.id);
  if (!job || job.status !== 'done' || !job.resultKey) return {job};
  const res = await fetch(await window.VzipR2.url(job.resultKey), {cache:'no-store'});
  if (!res.ok) throw Error('변환된 악보를 받지 못했어요 (' + res.status + ').');
  return {job, result:R.read(await R.unzip(await res.arrayBuffer()))};
}
const TYPE = {vocal:'보컬로 보여요', piano:'피아노·건반으로 보여요', chords:'화음 위주', instrument:'악기로 보여요', empty:'음표 없음', unknown:''};

VZ.vocalRangeSheet = (songArg, done = () => {}) => {
  const song = VZ.song?.(songArg.id) || songArg;
  VZ.sheet({title:'악보 기준 음역', body:'<div class="vrange-sheet" data-vrange-sheet></div>', onMount:(el, close) => {
    const body = el.querySelector('[data-vrange-sheet]');
    let alive = true;
    new MutationObserver((_, o) => { if (!el.isConnected) { alive = false; o.disconnect(); } }).observe(document.body, {childList:true, subtree:true});
    const finish = (range, message) => { if (save(song, range)) { close(); VZ.toast(message); done(); } };
    const home = () => {
      const r = rangeOf(song), cloud = !!window.VzipR2?.enabled?.() && !!window.VzipR2.omr;
      const scores = scoresOf(song).filter(s => s.r2Key);
      body.innerHTML = (r ? '<div class="vrange-now"><span>지금 기준</span><strong>' + esc(r.low) + ' – ' + esc(r.high) + '</strong><small>' + esc(sourceText(song, r)) + '</small></div>' : '') +
        '<h3 class="vrange-h">변환된 악보에서 가져오기</h3>' +
        (scores.length && cloud ? '<div class="vrange-list">' + scores.map(s => '<button type="button" class="vrange-row" data-from-score="' + esc(s.id) + '"><i class="ph ph-music-notes" aria-hidden="true"></i><span>' + esc(s.title || s.fileName || '악보') + '</span><i class="ph ph-caret-right" aria-hidden="true"></i></button>').join('') + '</div>'
          : '<p class="vrange-note">' + (scores.length ? '로그인하고 클라우드에 올라간 악보에서 쓸 수 있어요.' : '이 곡에 올린 악보가 없어요. 악보 PDF를 올리고 음표로 변환하면 가져올 수 있어요.') + '</p>') +
        '<h3 class="vrange-h">직접 입력</h3><button type="button" class="btn secondary block" data-manual><i class="ph ph-piano-keys" aria-hidden="true"></i>최저음·최고음 고르기</button>' +
        (r ? '<button type="button" class="btn ghost block vrange-clear" data-clear>기준 음역 지우기</button>' : '');
      body.querySelectorAll('[data-from-score]').forEach(b => b.onclick = () => fromScore(scores.find(s => s.id === b.dataset.fromScore)));
      body.querySelector('[data-manual]').onclick = manual;
      body.querySelector('[data-clear]')?.addEventListener('click', async () => {
        if (await VZ.confirm('기준 음역 지우기', '이 곡의 악보 기준 음역을 지울까요? 녹음과 분석 결과는 그대로예요.', {ok:'지우기', danger:true})) finish(null, '기준 음역을 지웠어요.');
      });
    };
    const manual = () => {
      const r = rangeOf(song);
      body.innerHTML = '<form class="vrange-form" data-manual-form><p class="vrange-note">노래 악보의 가장 낮은 음과 가장 높은 음을 골라 주세요. 가운데 도는 C4예요.</p>' +
        '<label class="field"><span>최저음</span><select name="low" aria-label="최저음">' + noteOptions(r?.lowMidi ?? 57) + '</select></label>' +
        '<label class="field"><span>최고음</span><select name="high" aria-label="최고음">' + noteOptions(r?.highMidi ?? 72) + '</select></label>' +
        '<p class="archive-error" role="alert" data-error></p><div class="vrange-actions"><button type="button" class="btn secondary" data-vrange-back>이전</button><button type="submit" class="btn">직접 입력한 음역 저장</button></div></form>';
      const form = body.querySelector('form');
      body.querySelector('[data-vrange-back]').onclick = home;
      form.onsubmit = e => {
        e.preventDefault();
        try { finish(R.reference({low:form.low.value, high:form.high.value, source:'manual'}), '직접 입력한 음역을 저장했어요.'); }
        catch (err) { form.querySelector('[data-error]').textContent = err.message; }
      };
    };
    const fromScore = async score => {
      if (!score) return;
      body.innerHTML = '<p class="vrange-note" role="status">"' + esc(score.title || '악보') + '"의 변환 결과를 읽는 중…</p>';
      let out;
      try { out = await loadScore(score); }
      catch (err) { if (alive) { body.innerHTML = '<p class="vrange-note vrange-error" role="alert">악보를 읽지 못했어요: ' + esc(err.message) + '</p><button type="button" class="btn secondary block" data-vrange-back>이전</button>'; body.querySelector('[data-vrange-back]').onclick = home; } return; }
      if (!alive) return;
      if (!out.result) {
        const waiting = out.job && ['queued', 'running'].includes(out.job.status);
        body.innerHTML = '<p class="vrange-note">' + (waiting ? '이 악보는 아직 음표로 변환하는 중이에요. 변환이 끝나면 다시 시도해 주세요.' : '이 악보는 아직 음표로 변환되지 않았어요. 먼저 음표로 변환해 주세요.') + '</p>' +
          (VZ.scoreOmrSheet ? '<button type="button" class="btn block" data-omr>음표로 변환 열기</button>' : '') + '<button type="button" class="btn secondary block" data-vrange-back>이전</button>';
        body.querySelector('[data-vrange-back]').onclick = home;
        body.querySelector('[data-omr]')?.addEventListener('click', () => { close(); VZ.scoreOmrSheet(song, score); });
        return;
      }
      pickPart(score, out.result);
    };
    const pickPart = (score, result) => {
      const usable = result.parts.filter(p => p.notes);
      const order = [...usable.filter(p => ['vocal', 'unknown'].includes(p.type)), ...usable.filter(p => !['vocal', 'unknown'].includes(p.type))];
      if (!order.length) { body.innerHTML = '<p class="vrange-note vrange-error" role="alert">변환된 악보에서 음표를 찾지 못했어요. 직접 입력해 주세요.</p><button type="button" class="btn secondary block" data-vrange-back>이전</button>'; body.querySelector('[data-vrange-back]').onclick = home; return; }
      const lead = result.ambiguous ? '보컬 파트를 확실히 찾지 못했어요. 부를 파트를 골라 주세요.' : result.guess ? '이름이나 가사로 확인하지 못해 한 줄 멜로디 파트를 골라 두었어요. 맞는지 확인해 주세요.' : '가사·파트 이름으로 보컬 파트를 골라 두었어요. 맞는지 확인해 주세요.';
      body.innerHTML = '<form class="vrange-form" data-part-form><p class="vrange-note vrange-warn"><i class="ph ph-warning" aria-hidden="true"></i><span>자동 인식(OMR) 결과라 틀린 음표가 있을 수 있어요. 악보와 맞는지 확인한 뒤 저장해 주세요.</span></p>' +
        '<p class="vrange-note">' + lead + '</p><fieldset class="vrange-parts"><legend>파트</legend>' + order.map(p =>
          '<label class="vrange-part"><input type="radio" name="part" value="' + esc(p.id) + '"' + (p.id === result.pick ? ' checked' : '') + '><span><strong>' + esc(p.name) + '</strong>' +
          '<small>' + esc([p.low + ' – ' + p.high, p.highMeasure ? '최고음 ' + p.highMeasure + '마디' : '', p.lyrics ? '가사 있음' : '', p.staves > 1 ? p.staves + '단' : '', p.transposition ? '이조 ' + (p.transposition > 0 ? '+' : '') + p.transposition + '반음 반영' : '', TYPE[p.type]].filter(Boolean).join(' · ')) + '</small></span></label>').join('') + '</fieldset>' +
        '<div class="vrange-actions"><button type="button" class="btn secondary" data-vrange-back>이전</button><button type="submit" class="btn" data-save-part' + (result.pick ? '' : ' disabled') + '>이 음역으로 저장</button></div></form>';
      const form = body.querySelector('form'), submit = form.querySelector('[data-save-part]');
      body.querySelector('[data-vrange-back]').onclick = home;
      form.addEventListener('change', () => { submit.disabled = !form.part.value; });
      form.onsubmit = async e => {
        e.preventDefault();
        const p = order.find(x => x.id === form.part.value); if (!p) return;
        const now = rangeOf(song);
        if (now?.source === 'manual' && !await VZ.confirm('직접 입력한 음역 바꾸기', '직접 입력한 음역(' + now.low + ' – ' + now.high + ')을 악보 음역(' + p.low + ' – ' + p.high + ')으로 바꿀까요?', {ok:'바꾸기'})) return;
        finish(R.reference({low:p.lowMidi, high:p.highMidi, source:'score', scoreId:score.id, part:p.name, partId:p.id, transposition:p.transposition}), '악보 기준 음역을 저장했어요.');
      };
    };
    home();
  }});
};

/* ---------- vocal lab comparison (dark) ---------- */
const HOLD = {version:'이전(v1) 분석이라 비교하지 않아요. 다시 분석하면 비교할 수 있어요.', confidence:'분석 신뢰도가 낮아(목소리가 짧거나 반주가 큼) 판정하지 않아요.', 'no-valid':'0.2초 이상 이어 부른 최고음이 없어 판정하지 않아요.'};
VZ.vocalRangeCompare = (song, a, {playable = false} = {}) => {
  const ref = rangeOf(song);
  const setup = '<button type="button" class="vl-chip-play vrange-setup" data-vrange-setup aria-label="악보 기준 음역 ' + (ref ? '변경' : '설정') + '">' + (ref ? '변경' : '설정') + '</button>';
  if (!ref) return '<div class="vl-score-range" data-vrange><div class="vl-high-row"><span>악보 기준 비교 <small>기준 음역 없음</small></span>' + setup + '</div></div>';
  const c = R.compare(ref, a, {reliable:!!(a && VZ.analysisReliable?.(a))});
  const listen = (row, label) => {
    const times = (row.point?.times?.length ? row.point.times : Number.isFinite(row.point?.t) ? [{t:row.point.t}] : []).filter(x => Number.isFinite(x?.t)).slice(0, 3);
    return times.map(x => playable ? '<button type="button" class="vl-chip-play" data-seek-at="' + x.t + '" aria-label="' + esc(label + ' ' + clock(x.t) + ' 부분 듣기') + '"><i class="ph-fill ph-play"></i> ' + clock(x.t) + '</button>' : '<small>' + clock(x.t) + '</small>').join('');
  };
  const verdict = c.state === 'ok' || c.state === 'hold' ? '<span class="vrange-verdict ' + (c.state === 'hold' ? 'hold' : c.verdict) + '" data-vrange-verdict>' + esc(R.verdictText(c)) + '</span>' : '';
  const rows = (c.rows || []).map(r => '<div class="vl-high-row" data-vrange-row="' + r.key + '"><span>' + r.label + ' <strong>' + esc(r.note) + '</strong> <small>' + esc(R.diffText(r.diff)) + (r.key === 'instant' ? ' · 평가에 쓰지 않음' : '') + '</small></span>' +
    (r.key === 'instant' && c.recheck ? '<span class="vl-high-times">' + listen(r, '순간 최고음') + '</span>' : '') + '</div>' +
    (r.key === 'instant' && c.recheck ? '<p class="vrange-recheck" data-vrange-recheck><i class="ph ph-ear" aria-hidden="true"></i> 순간 최고음은 재확인 필요 (배음·잡음 가능성)</p>' : '')).join('');
  const note = c.state === 'no-analysis' ? '녹음을 분석하면 악보 최고음과 비교해요.' : c.state === 'hold' ? HOLD[c.reason] : '';
  return '<div class="vl-score-range" data-vrange><div class="vl-measure"><span>악보 기준 비교 <small>악보 ' + esc(ref.low + ' – ' + ref.high) + ' · ' + (ref.source === 'score' ? '악보에서 가져옴' : '직접 입력') + '</small></span>' + setup + '</div>' +
    '<div class="vl-high-row"><span>악보 최고음 <strong>' + esc(ref.high) + '</strong></span>' + verdict + '</div>' + rows +
    (note ? '<p class="vl-muted" data-vrange-note>' + esc(note) + '</p>' : '') +
    '<p class="vl-muted">측정값은 악보에 맞춰 고치지 않아요. 키를 바꿔 불렀거나 일부만 불렀다면 차이가 날 수 있고, 음역 차이만으로 실력을 판단하지 않아요.</p></div>';
};
VZ.vocalRangeBind = (host, song, redraw) => {
  host?.querySelectorAll('[data-vrange-setup]').forEach(b => b.onclick = () => VZ.vocalRangeSheet(VZ.song?.(song.id) || song, redraw));
};
})();
