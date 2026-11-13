/* Diagnose a silent Kakao OAuth return without reading credentials or modifying account data. */
(() => {
  'use strict';
  const KEY = 'vzip_kakao_oauth_pending_v1';
  const MAX_AGE = 2 * 60 * 1000;
  const setPending = () => {
    try { sessionStorage.setItem(KEY, String(Date.now())); } catch {}
  };
  const clearPending = () => {
    try { sessionStorage.removeItem(KEY); } catch {}
  };
  const pendingAt = () => {
    try { return Number(sessionStorage.getItem(KEY)) || 0; } catch { return 0; }
  };
  // Capture before the original button handler redirects to the OAuth provider.
  document.addEventListener('click', event => {
    if (event.target.closest?.('#vzip-auth-screen [data-kakao]')) setPending();
  }, true);
  let timer;
  const check = () => {
    const at = pendingAt();
    if (!at) return;
    if (Date.now() - at > MAX_AGE) { clearPending(); return; }
    if (window.vzipCloudSignedIn?.()) { clearPending(); return; }
    if (window.vzipAuthReturnError) { clearPending(); return; } // Existing server error UI owns this case.
    const auth = document.getElementById('vzip-auth-screen');
    if (!auth || auth.hidden) return;
    const wrap = auth.querySelector('.vzip-auth-wrap');
    if (!wrap || wrap.querySelector('[data-kakao-return-status]')) return;
    const message = document.createElement('p');
    message.dataset.kakaoReturnStatus = '';
    message.setAttribute('role', 'alert');
    message.style.cssText = 'border:1px solid #a76669;background:#49252d;color:#ffe5e6;padding:12px 14px;border-radius:14px;font-size:13px;line-height:1.5;overflow-wrap:anywhere';
    message.textContent = '카카오 인증 후 VOCAL.zip 로그인 세션을 확인하지 못했어요. 로그인 설정 또는 기기 세션 확인에 문제가 있을 수 있어요. 이 화면을 캡처해 주세요. 기존 녹음과 기록은 삭제되지 않았어요.';
    wrap.prepend(message);
    clearPending();
  };
  const schedule = () => {
    clearTimeout(timer);
    if (!pendingAt()) return;
    // Allow Supabase URL/session initialization and the device session RPC to finish.
    timer = setTimeout(check, 12000);
  };
  document.addEventListener('DOMContentLoaded', schedule, {once:true});
  window.addEventListener('pageshow', schedule);
  window.addEventListener('vzip:auth-changed', () => {
    if (window.vzipCloudSignedIn?.()) {
      clearPending();
      document.querySelector('[data-kakao-return-status]')?.remove();
    }
  });
})();
