/* Progressive media controls: native streaming, no whole-file decoding or download. */
(() => {
  'use strict';
  const time = value => Number.isFinite(value) && value >= 0
    ? String(Math.floor(value / 60)).padStart(2, '0') + ':' + String(Math.floor(value % 60)).padStart(2, '0') : '--:--';
  window.vzipEnhancePlayer = (media, item = {}) => {
    if (media.closest('.vzip-player')) return;
    const card = document.createElement('div'); card.className = 'vzip-player';
    card.innerHTML = `<div class="vzip-player-controls"><button type="button" class="vzip-player-toggle" aria-label="재생"><i class="ph ph-play" aria-hidden="true"></i></button><div class="vzip-player-track"><input type="range" min="0" max="100" value="0" step="0.1" aria-label="재생 위치" disabled><div class="vzip-player-times"><span data-current>00:00</span><span data-duration>--:--</span></div></div></div><p class="vzip-player-message" role="status"></p>`;
    media.before(card); card.prepend(media);
    // Keep native controls available as an explicit fallback, including Safari codecs.
    if (media.tagName === 'AUDIO') {
      const fallback = document.createElement('details'); fallback.className = 'vzip-player-native';
      const summary = document.createElement('summary'); summary.textContent = '기본 플레이어';
      fallback.append(summary, media); card.append(fallback);
    }
    if (Array.isArray(item.waveform) && item.waveform.length) {
      const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 100;
      canvas.className = 'vzip-player-wave'; canvas.setAttribute('aria-label','녹음 당시 마이크 입력 파형');
      card.querySelector('.vzip-player-track').prepend(canvas);
      const ctx = canvas.getContext('2d'), peaks = item.waveform.slice(0,512);
      ctx.strokeStyle = '#a279e9'; ctx.lineWidth = Math.max(1,600/peaks.length*.55); ctx.lineCap = 'round';
      peaks.forEach((value,index) => { if (!Number.isFinite(value)) return; const size = Math.max(1, Math.min(1,Math.abs(value))*46), x=(index+.5)/peaks.length*600; ctx.beginPath(); ctx.moveTo(x,50-size); ctx.lineTo(x,50+size); ctx.stroke(); });
    }
    const button = card.querySelector('button'), range = card.querySelector('input'), message = card.querySelector('[role=status]');
    const update = () => {
      const duration = media.duration, valid = Number.isFinite(duration) && duration > 0;
      range.disabled = !valid; range.max = valid ? duration : 100;
      range.value = media.currentTime || 0;
      range.setAttribute('aria-valuetext', time(media.currentTime) + ' / ' + time(duration));
      card.querySelector('[data-current]').textContent = time(media.currentTime);
      card.querySelector('[data-duration]').textContent = time(duration);
      button.setAttribute('aria-label', media.paused ? '재생' : '일시정지');
      button.firstElementChild.className = 'ph ph-' + (media.paused ? 'play' : 'pause');
    };
    button.onclick = async () => {
      message.textContent = '';
      if (!media.paused) { media.pause(); return; }
      try { await media.play(); } catch { message.textContent = '재생하지 못했어요. 기본 플레이어 또는 원본 파일을 확인해 주세요.'; }
    };
    range.oninput = () => { if (!range.disabled) { media.currentTime = Number(range.value); update(); } };
    ['loadedmetadata','durationchange','timeupdate','play','pause','ended','emptied'].forEach(event => media.addEventListener(event, update));
    media.addEventListener('error', () => { message.textContent = '파일을 불러오지 못했어요. 네트워크와 파일 형식을 확인해 주세요.'; });
    media.vzipRemovePlayer = () => card.remove();
    update();
  };
})();
