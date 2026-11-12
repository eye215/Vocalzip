/* A social login (카카오) that fails comes back to the app with ?error=…&error_description=… (or the same in the
 * hash). Supabase does not sign in then, and nothing told the user why: the login screen just reappeared. This reads
 * that reason once, before anything else touches the URL, shows it on the login screen in plain Korean, and removes
 * only those error fields from the address. Nothing is stored; tokens and other URL parts are never read or changed. */
(() => {
  'use strict';
  const KEYS = ['error', 'error_code', 'error_description'];
  const read = text => { const p = new URLSearchParams(text); return KEYS.some(k => p.has(k)) ? p : null; };
  const query = read(location.search.slice(1)), hash = read(location.hash.replace(/^#/, ''));
  const params = query || hash;
  if (!params) return;
  const code = params.get('error') || '', detail = (params.get('error_description') || params.get('error_code') || '').replace(/\+/g, ' ');
  const message = /email/i.test(detail) ? '카카오 계정 이메일을 받지 못해 로그인하지 못했어요. 카카오 로그인 동의 화면에서 이메일 제공에 동의했는지 확인해 주세요. 계속 안 되면 서비스 설정(카카오 동의 항목)을 확인해야 해요.'
    : code === 'access_denied' ? '카카오 로그인을 취소했어요. 다시 시도하려면 카카오로 로그인을 눌러 주세요.'
    : /provider is not enabled|unsupported provider/i.test(detail) ? '서버에서 카카오 로그인이 아직 켜져 있지 않아요. 이메일로 로그인해 주세요.'
    : '로그인하지 못했어요' + (detail ? ': ' + detail.slice(0, 200) : code ? ' (' + code.slice(0, 60) + ')' : '') + '. 다시 시도하거나 이메일로 로그인해 주세요.';
  window.vzipAuthReturnError = {code, detail, message};
  // The address keeps everything else; only the error fields go, so a reload does not show the message again.
  const strip = text => { const p = new URLSearchParams(text); KEYS.forEach(k => p.delete(k)); return p.toString(); };
  const clean = () => {
    try {
      const q = query ? strip(location.search.slice(1)) : location.search.slice(1);
      const h = hash ? strip(location.hash.replace(/^#/, '')) : location.hash.replace(/^#/, '');
      history.replaceState(history.state, '', location.pathname + (q ? '?' + q : '') + (h ? '#' + h : hash ? '#/home' : ''));
    } catch {}
  };
  const style = document.createElement('style');
  style.textContent = '.vzip-auth-return-error{margin:0 0 12px;padding:10px 14px;border-radius:14px;background:rgba(255,107,107,.16);color:#ffd9d9;font-size:13px;line-height:1.45;letter-spacing:-.01em;overflow-wrap:anywhere}';
  (document.head || document.documentElement).append(style);
  // Shown in its own line on the login screen, so the screen's own status messages cannot overwrite it.
  const show = () => {
    const card = document.querySelector('#vzip-auth-screen .vzip-auth-wrap');
    if (!card) return false;
    if (!card.querySelector('[data-auth-return-error]')) {
      const line = document.createElement('p');
      line.className = 'vzip-auth-return-error'; line.setAttribute('role', 'alert'); line.dataset.authReturnError = '';
      line.textContent = message;
      card.prepend(line);
    }
    return true;
  };
  const start = () => {
    if (show()) { setTimeout(clean, 1500); return; }
    const watch = new MutationObserver(() => { if (show()) { watch.disconnect(); setTimeout(clean, 1500); } });
    watch.observe(document.documentElement, {childList:true, subtree:true});
    setTimeout(() => watch.disconnect(), 30000);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true}); else start();
})();
