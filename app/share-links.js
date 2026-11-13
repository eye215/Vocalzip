/* 개별 녹음 공유 링크 (Phase 08/21, SHARE-08-01).
 * The owner makes a link for one cloud (R2) recording: anyone with it can play and download it without signing in,
 * until it expires (1/7/30 days, a number of days, or "until I stop it") or the owner stops it — the server checks
 * the grant on every request, so a stopped link refuses new playback at once. A file already downloaded by the
 * receiver cannot be taken back (said in the sheet). Entry points: 녹음 더보기 → 공유 링크, 곡 > 레퍼런스의 MR·레퍼런스 공유 아이콘, settings → 공유 중인 링크. */
(() => {
'use strict';
const VZ = window.VZ;
if (!VZ) return;
const esc = VZ.esc, DAY = 86400;
const until = s => s.expires == null ? '끊을 때까지' : new Date(s.expires).toLocaleDateString('ko-KR', {month:'long', day:'numeric'}) + ' ' + new Date(s.expires).toLocaleTimeString('ko-KR', {hour:'2-digit', minute:'2-digit'}) + '까지';
const ready = () => window.VzipR2?.enabled?.() && window.VzipR2.shares;
async function copy(text) {
  try { await navigator.clipboard.writeText(text); VZ.toast('링크를 복사했어요.'); }
  catch { window.prompt('링크를 복사하세요', text); }
}
async function send(title, url) {
  if (navigator.share) { try { await navigator.share({title, text:title + ' 녹음', url}); return; } catch (e) { if (e?.name === 'AbortError') return; } }
  copy(url);
}
async function stop(share, after) {
  if (!await VZ.confirm('링크 끊기', '"' + share.title + '" 공유 링크를 끊을까요? 링크를 받은 사람은 더 이상 재생·다운로드할 수 없어요. 이미 내려받은 파일은 회수되지 않아요.', {ok:'링크 끊기', danger:true})) return false;
  try { await window.VzipR2.shares.revoke(share.id); VZ.toast('링크를 끊었어요.'); after?.(); return true; }
  catch (e) { VZ.toast('끊지 못했어요: ' + e.message, 'error'); return false; }
}

/** A plain web link (YouTube MR, AR reference): the phone's share sheet, else copy. */
VZ.shareUrl = (title, url) => send(title, url);

/** Sheet to make (and then manage) a link for one recording or MR file. */
VZ.shareSheet = (item, {title:named = ''} = {}) => {
  if (!ready()) { VZ.toast('공유 링크는 로그인하고 클라우드에 올라간 녹음에서 만들 수 있어요.', 'error'); return; }
  if (!item?.r2Key) { VZ.toast('클라우드에 올라간 녹음만 공유할 수 있어요. 업로드가 끝난 뒤 다시 시도해 주세요.', 'error'); return; }
  const choices = [['1', '1일'], ['7', '7일'], ['30', '30일'], ['custom', '직접 입력'], ['none', '계속']];
  VZ.sheet({title:'공유 링크', body:'<div class="share-sheet" data-share>' +
      '<p class="share-file"><i class="ph ph-waveform" aria-hidden="true"></i><span>' + esc(named || item.name || VZ.media?.label?.(item) || '녹음') + '</span></p>' +
      '<fieldset class="share-period"><legend>링크 유지 기간</legend><div class="share-chips" role="radiogroup" aria-label="링크 유지 기간">' +
        choices.map(([v, t]) => '<button type="button" role="radio" data-period="' + v + '" aria-checked="' + (v === '7') + '">' + t + '</button>').join('') + '</div>' +
        '<label class="share-days" data-days hidden><input type="number" inputmode="numeric" min="1" max="3650" value="14" aria-label="며칠 동안"><span>일 동안</span></label></fieldset>' +
      '<p class="share-note">링크만 있으면 로그인 없이 듣고 내려받을 수 있어요. 언제든 끊을 수 있지만, 이미 내려받은 파일은 회수되지 않아요.</p>' +
      '<div class="share-result" data-result hidden></div></div>',
    foot:'<button type="button" class="btn block" data-make>링크 만들기</button>',
    onMount:(el, close) => {
      const root = el.querySelector('[data-share]'), make = el.parentNode.querySelector('[data-make]'), days = root.querySelector('[data-days]');
      let period = '7', busy = false;
      root.querySelectorAll('[data-period]').forEach(b => b.onclick = () => {
        period = b.dataset.period; root.querySelectorAll('[data-period]').forEach(x => x.setAttribute('aria-checked', String(x === b)));
        days.hidden = period !== 'custom'; if (period === 'custom') days.querySelector('input').focus();
      });
      make.onclick = async () => {
        if (busy) return;
        let expiresIn = null;
        if (period === 'custom') { const n = Math.round(Number(days.querySelector('input').value)); if (!(n >= 1 && n <= 3650)) { VZ.toast('1~3650일 사이로 입력해 주세요.', 'error'); return; } expiresIn = n * DAY; }
        else if (period !== 'none') expiresIn = Number(period) * DAY;
        busy = true; make.disabled = true; make.textContent = '만드는 중…';
        try {
          const title = named || item.name || VZ.media?.label?.(item) || '녹음';
          const s = await window.VzipR2.shares.create({key:item.r2Key, mediaId:item.id, title, expiresIn});
          const url = window.VzipR2.shares.link(s.token), result = root.querySelector('[data-result]');
          root.querySelector('.share-period').hidden = true;
          result.hidden = false;
          result.innerHTML = '<p class="share-ok"><i class="ph ph-check-circle" aria-hidden="true"></i>링크를 만들었어요 · ' + esc(until(s)) + '</p>' +
            '<input type="text" readonly value="' + esc(url) + '" aria-label="공유 링크" data-url>' +
            '<div class="share-actions"><button type="button" class="btn" data-send><i class="ph ph-share" aria-hidden="true"></i>보내기</button><button type="button" class="btn secondary" data-copy><i class="ph ph-copy" aria-hidden="true"></i>복사</button></div>' +
            '<button type="button" class="share-stop" data-stop>이 링크 끊기</button>';
          result.querySelector('[data-send]').onclick = () => send(title, url);
          result.querySelector('[data-copy]').onclick = () => copy(url);
          result.querySelector('[data-url]').onfocus = e => e.target.select();
          result.querySelector('[data-stop]').onclick = () => stop({id:s.id, title}, close);
          make.hidden = true;
        } catch (e) { VZ.toast('링크를 만들지 못했어요: ' + e.message, 'error'); busy = false; make.disabled = false; make.textContent = '링크 만들기'; }
      };
    }});
};

/* 공유 중인 링크 (settings → 관리): every link of this account, with copy and stop. */
VZ.route('shares', {title:'공유 중인 링크', back:true, tab:'keep', render() {
  return '<div class="share-list-page" data-shares><p class="muted">불러오는 중…</p></div>';
}, async mount(main) {
  const host = main.querySelector('[data-shares]');
  const draw = async () => {
    if (!ready()) { host.innerHTML = VZ.empty('link', '로그인하면 공유한 링크를 볼 수 있어요.'); return; }
    let list; try { list = await window.VzipR2.shares.list(); } catch (e) { host.innerHTML = VZ.empty('warning', '목록을 불러오지 못했어요: ' + e.message); return; }
    if (!host.isConnected) return;
    if (!list.length) { host.innerHTML = VZ.empty('link', '공유 중인 링크가 없어요. 녹음 재생 화면의 "공유 링크"에서 만들 수 있어요.'); return; }
    host.innerHTML = '<p class="share-note">링크를 끊으면 받은 사람은 바로 재생·다운로드할 수 없어요. 이미 내려받은 파일은 회수되지 않아요.</p><div class="list">' +
      list.map(s => '<div class="item share-row" data-id="' + esc(s.id) + '"><span class="item-main"><span class="item-title">' + esc(s.title) + '</span><span class="item-sub' + (s.expired ? ' share-expired' : '') + '">' + (s.expired ? '기간 만료' : esc(until(s))) + '</span></span>' +
        (s.expired ? '' : '<button type="button" class="icon-btn" data-copy aria-label="' + esc(s.title) + ' 링크 복사"><i class="ph ph-copy"></i></button>') +
        '<button type="button" class="icon-btn" data-stop aria-label="' + esc(s.title) + ' 링크 끊기"><i class="ph ph-link-break"></i></button></div>').join('') + '</div>';
    host.querySelectorAll('.share-row').forEach(row => {
      const s = list.find(x => x.id === row.dataset.id);
      row.querySelector('[data-copy]')?.addEventListener('click', () => copy(window.VzipR2.shares.link(s.token)));
      row.querySelector('[data-stop]').onclick = () => stop(s, draw);
    });
  };
  draw();
}});

})();
