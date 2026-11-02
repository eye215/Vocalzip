/* Navigation and practice submission state; data belongs to the existing app. */
(() => {
  'use strict';
  const nav = document.querySelector('.nav');
  const app = document.querySelector('.app');
  if (!nav || !app) return;
  const ids = ['home', 'lessons', 'practice', 'media', 'archive', 'manage'];
  const notice = document.createElement('div'); notice.className = 'vzip-notice';
  notice.setAttribute('role', 'status'); notice.setAttribute('aria-live', 'polite'); notice.hidden = true;
  document.body.append(notice); let noticeTimer;
  window.vzipNotice = message => { clearTimeout(noticeTimer); notice.textContent = message; notice.hidden = false;
    noticeTimer = setTimeout(() => { notice.hidden = true; }, 4500); };
  const reasons = new Set(), prior = new Map();
  window.vzipSetPracticeBusy = (reason, busy) => {
    if (busy) reasons.add(reason); else reasons.delete(reason);
    const form = document.querySelector('#practice-form');
    if (!form) return;
    form.dataset.mediaBusy = String(reasons.size > 0);
    form.querySelectorAll('button[type="submit"],button:not([type])').forEach(button => {
      if (reasons.size) {
        if (!prior.has(button)) prior.set(button, button.disabled);
        button.disabled = true;
      }
    });
    if (!reasons.size) {
      prior.forEach((disabled, button) => { button.disabled = disabled; });
      prior.clear();
    }
  };
  function navigate(tab, focus = true) {
    if (!ids.includes(tab)) return;
    const section = document.getElementById(tab);
    app.querySelectorAll(':scope > section').forEach(page => {
      page.classList.toggle('active', page === section);
      page.hidden = page !== section;
      if (page.id === 'vzip-report-page') page.style.removeProperty('display');
    });
    nav.querySelectorAll('button[data-tab]').forEach(button => {
      const active = button.dataset.tab === tab;
      button.classList.toggle('active', active);
      button.setAttribute('aria-current', active ? 'page' : 'false');
    });
    document.body.dataset.vzipPage = tab;
    document.querySelectorAll('audio,video').forEach(player => {
      if (!section.contains(player) && !player.srcObject) player.pause();
    });
    window.dispatchEvent(new CustomEvent('vzip:route-change', {detail: {tab}}));
    window.scrollTo(0, 0);
    if (focus) section.querySelector('.vzip-page-head h2')?.focus({preventScroll: true});
  }
  nav.setAttribute('aria-label', '주요 메뉴');
  nav.querySelectorAll('button[data-tab]').forEach(button => {
    button.setAttribute('aria-controls', button.dataset.tab);
    button.addEventListener('click', () => navigate(button.dataset.tab));
  });
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-go-tab]');
    if (!button) return;
    const tab = button.dataset.goTab;
    // Use the existing nav click so media and archive refresh listeners also run.
    nav.querySelector('[data-tab="' + tab + '"]')?.click();
    if (tab === 'lessons' || tab === 'practice') {
      document.getElementById(tab)?.querySelector('[data-ia-open="new"]')?.click();
    }
  });
  document.querySelector('#vzip-open-settings')?.addEventListener('click', () => {
    nav.querySelector('[data-tab="manage"]')?.click();
  });
  window.vzipNavigate = tab => nav.querySelector('[data-tab="' + tab + '"]')?.click();
  navigate('home', false);
})();
