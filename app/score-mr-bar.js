/* Score + MR practice bar: while reading a song's PDF score, play one of the song's MR tracks (songs[].mrTracks from
 * app/song-mr.js), record the voice, or both at once (sing along). The take is reviewed and then saved through the
 * same path as the recorder page (VZ.media.capture → M.saveBlob) into that song, so it shows in the library,
 * analysis and growth like any other recording. Nothing is saved without 저장. YouTube MRs cannot be mixed in a page
 * recording, so only uploaded MR files are offered here. */
(() => {
'use strict';
const VZ = window.VZ, M = VZ?.media;
if (!VZ || !M) return;
const esc = VZ.esc;
const clock = s => { s = Math.max(0, Math.floor(s || 0)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

VZ.scoreMrBar = (sheetEl, songId) => {
  if (!sheetEl || sheetEl.querySelector('.score-mr')) return;
  const song = VZ.song(songId); if (!song) return;
  const files = (song.mrTracks || []).filter(t => !t.deleted && t.kind === 'file' && t.r2Key);
  const youtubeOnly = !files.length && (song.mrTracks || []).some(t => !t.deleted && t.kind === 'youtube');
  const bar = document.createElement('section');
  bar.className = 'score-mr'; bar.setAttribute('aria-label', 'MR 재생·녹음');
  bar.innerHTML = '<div class="score-mr-row">' +
    (files.length > 1 ? '<select data-mr-pick aria-label="MR 선택">' + files.map(t => '<option value="' + esc(t.id) + '">' + esc(t.title || t.fileName || 'MR') + '</option>').join('') + '</select>'
      : '<span class="score-mr-name">' + (files[0] ? '<i class="ph ph-music-notes" aria-hidden="true"></i>' + esc(files[0].title || files[0].fileName || 'MR') : 'MR 없음') + '</span>') +
    '<span class="score-mr-time" data-mr-time aria-live="off">0:00</span></div>' +
    '<div class="score-mr-actions">' +
      '<button type="button" data-mr-act="play"' + (files.length ? '' : ' disabled') + '><i class="ph-fill ph-play" aria-hidden="true"></i><span>재생</span></button>' +
      '<button type="button" data-mr-act="rec"><i class="ph-fill ph-record" aria-hidden="true"></i><span>녹음</span></button>' +
      '<button type="button" data-mr-act="both" class="score-mr-main"' + (files.length ? '' : ' disabled') + '><i class="ph-fill ph-microphone" aria-hidden="true"></i><span>MR 틀고 녹음</span></button>' +
      '<button type="button" data-mr-act="stop" hidden><i class="ph-fill ph-stop" aria-hidden="true"></i><span>정지</span></button>' +
    '</div>' +
    '<p class="score-mr-note" data-mr-note>' + (files.length ? '함께 녹음할 땐 이어폰을 쓰면 MR이 덜 섞여요.' : youtubeOnly ? '유튜브 MR은 악보 화면에서 녹음과 함께 틀 수 없어요. 곡 상세에서 MR 파일을 추가해 주세요.' : '곡 상세 → MR 반주에서 MR 파일을 추가하면 여기서 재생·녹음할 수 있어요.') + '</p>' +
    '<div class="score-mr-review" data-mr-review hidden></div>';
  (sheetEl.querySelector('.score-ink-editor') || sheetEl.querySelector('.sheet-body') || sheetEl).append(bar); // last row of the score column

  const $ = s => bar.querySelector(s), time = $('[data-mr-time]'), note = $('[data-mr-note]'), review = $('[data-mr-review]');
  let audio = null, session = null, mode = '', ticker = 0, take = null, savedId = '', closed = false;
  const track = () => files.find(t => t.id === ($('[data-mr-pick]')?.value || files[0]?.id));
  const busy = on => {
    bar.classList.toggle('is-busy', on);
    bar.querySelectorAll('[data-mr-act]').forEach(b => { b.hidden = b.dataset.mrAct === 'stop' ? !on : on; });
    const pick = $('[data-mr-pick]'); if (pick) pick.disabled = on;
  };
  const tick = () => { cancelAnimationFrame(ticker); const loop = () => { time.textContent = clock(session ? session.seconds() : audio?.currentTime); ticker = requestAnimationFrame(loop); }; loop(); };
  async function mr() {
    const t = track(); if (!t) throw Error('MR을 골라 주세요.');
    if (!audio || audio.dataset.track !== t.id) {
      audio?.pause(); audio = new Audio(); audio.preload = 'auto'; audio.dataset.track = t.id;
      audio.src = await window.VzipR2.url(t.r2Key);
      audio.onended = () => { if (mode === 'play') stop(); };
    }
    audio.currentTime = 0;
    return audio;
  }
  async function start(kind) {
    if (mode) return;
    review.hidden = true; take = null; savedId = '';
    mode = kind; busy(true); note.textContent = kind === 'play' ? 'MR 재생 중' : '마이크 준비 중…';
    try {
      // Microphone first (permission prompt), then the MR, so the take and the MR start together.
      if (kind !== 'play') session = await M.capture({});
      const a = kind !== 'rec' ? await mr() : null;
      if (closed) { session?.cancel(); return; }
      session?.start();
      if (a) await a.play();
      note.textContent = kind === 'play' ? 'MR 재생 중' : kind === 'rec' ? '녹음 중' : 'MR과 함께 녹음 중';
      tick();
    } catch (e) {
      session?.cancel(); session = null; audio?.pause(); mode = ''; busy(false); cancelAnimationFrame(ticker);
      note.textContent = e.message || '시작하지 못했어요.';
    }
  }
  async function stop() {
    const was = mode; if (!was) return;
    mode = ''; cancelAnimationFrame(ticker); audio?.pause();
    if (!session) { busy(false); note.textContent = '정지했어요.'; return; }
    const s = session; session = null; note.textContent = '녹음 마무리 중…';
    try { take = await s.stop(); } catch (e) { busy(false); note.textContent = e.message; return; }
    busy(false); note.textContent = '들어 보고 저장하세요.'; showReview(was);
  }
  function showReview(kind) {
    const t = kind === 'both' ? track() : null;
    const name = M.autoName ? M.autoName(VZ.songTitle(songId), VZ.today()) : VZ.songTitle(songId) + ' ' + VZ.today();
    review.hidden = false;
    review.innerHTML = '<div data-mr-player></div><label class="field"><span>제목</span><input type="text" data-mr-name maxlength="150" value="' + esc(name) + '"></label>' +
      '<div class="score-mr-review-actions"><button type="button" class="btn ghost" data-mr-discard>버리기</button><button type="button" class="btn" data-mr-save>저장</button></div><p class="small" data-mr-fail hidden></p>';
    const preview = M.player ? M.player(review.querySelector('[data-mr-player]'), {id:'mr-preview', name, type:take.type, blob:take.blob, durationSeconds:take.durationSeconds}, {}) : null;
    review.querySelector('[data-mr-discard]').onclick = async () => {
      if (!await VZ.confirm('녹음 버리기', '이번 녹음을 저장하지 않고 버릴까요?', {ok:'버리기', danger:true})) return;
      preview?.destroy(); take?.releaseProtection?.(); take = null; review.hidden = true; review.innerHTML = ''; note.textContent = '버렸어요.';
    };
    review.querySelector('[data-mr-save]').onclick = async e => {
      const btn = e.currentTarget, fail = review.querySelector('[data-mr-fail]');
      const id = savedId ||= VZ.uid(); // a retry after a failed save keeps the same take id
      const item = {id, ...(window.VzipAccountScope ? {accountOwner:take.accountOwner} : {}), name:review.querySelector('[data-mr-name]').value.trim() || name,
        created:Date.now(), recordedDate:VZ.today(), dateSource:'recorded', type:take.type, source:'practice', occasion:'practice', songId, song:VZ.songLabel(VZ.song(songId)),
        blob:take.blob, durationSeconds:take.durationSeconds, waveform:take.waveform, review:t ? 'MR: ' + (t.title || t.fileName || 'MR') : '', ...(t ? {mrTrackId:t.id} : {})};
      btn.disabled = true; btn.textContent = '저장 중…'; fail.hidden = true;
      try {
        await M.saveBlob(item, p => { btn.textContent = '클라우드 저장 ' + p + '%'; });
        take.releaseProtection?.(); preview?.destroy(); take = null;
        review.innerHTML = '<p class="score-mr-saved"><i class="ph ph-check-circle" aria-hidden="true"></i> 저장했어요 · ' + esc(item.name) + '</p>';
        note.textContent = '보관함과 이 곡의 녹음에 들어갔어요.'; VZ.toast('녹음을 저장했어요.');
      } catch (err) {
        btn.disabled = false; btn.textContent = '다시 저장'; fail.hidden = false; fail.textContent = '저장하지 못했어요: ' + err.message + ' · 녹음은 이 화면에 남아 있어요.';
      }
    };
  }
  bar.addEventListener('click', e => {
    const b = e.target.closest('[data-mr-act]'); if (!b || b.disabled) return;
    b.dataset.mrAct === 'stop' ? stop() : start(b.dataset.mrAct);
  });
  // Closing the score: stop sound and the microphone; an unsaved take is protected by the recorder's own guard.
  const observer = new MutationObserver(() => {
    if (sheetEl.isConnected) return;
    closed = true; observer.disconnect(); cancelAnimationFrame(ticker); audio?.pause(); if (audio) audio.src = '';
    // A take still recording or recorded but not saved is kept (after the 11/7 loss, a take is never dropped silently).
    const keep = async () => {
      const t = session ? await session.stop().catch(() => null) : take; session = null; take = null;
      if (!t?.blob?.size) return;
      await M.saveBlob({id:savedId || VZ.uid(), ...(window.VzipAccountScope ? {accountOwner:t.accountOwner} : {}), name:'저장 안 한 악보 연습 녹음', created:Date.now(), recordedDate:VZ.today(),
        dateSource:'recorded', type:t.type, source:'practice', occasion:'practice', songId, song:VZ.songLabel(VZ.song(songId)), blob:t.blob, durationSeconds:t.durationSeconds, waveform:t.waveform});
      t.releaseProtection?.(); VZ.toast('저장하지 않은 녹음을 보관함에 보존했어요.');
    };
    keep().catch(e => VZ.toast('녹음을 보존하지 못했어요: ' + e.message, 'error'));
  });
  observer.observe(document.body, {childList:true});
  return bar;
};
})();
