/* Screen structure. Existing forms stay mounted to preserve their values and handlers. */
(() => {
  'use strict';
  const $ = selector => document.querySelector(selector);
  const data = () => { try { return JSON.parse(localStorage.getItem('vocal-zip_mvp_v1') || '{}'); } catch { return {}; } };
  const make = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };
  function heading(section, eyebrow, title, description) {
    const head = make('div', 'vzip-page-head');
    const h2 = make('h2', '', title); h2.tabIndex = -1;
    h2.id = section.id + '-heading'; section.setAttribute('aria-labelledby', h2.id);
    head.append(make('div', 'vzip-page-eyebrow', eyebrow), h2, make('p', '', description));
    section.prepend(head); return head;
  }
  function button(text, run, className = 'secondary') {
    const element = make('button', 'vzip-ia-action ' + className, text);
    element.type = 'button'; element.addEventListener('click', run); return element;
  }
  const home = $('#home'), manage = $('#manage');
  const backup = $('#export')?.closest('.card');
  if (backup) manage.append(backup);
  heading(home, 'MY VOCAL JOURNAL', '오늘의 연습', '작은 연습을 쌓아, 나만의 목소리로.');
  const hero = home.querySelector('.hero');
  if (hero) {
    const title = hero.querySelector('h2');
    title.textContent = '오늘도, 한 소절 더.';
    hero.querySelector('.hero-eyebrow').textContent = 'DAILY PRACTICE';
    hero.querySelector('p').textContent = '녹음부터 연습 메모까지 한 번에 남겨보세요.';
    hero.querySelector('.primary').textContent = '＋ 연습 시작하기';
    hero.querySelector('.ghost').textContent = '레슨 기록하기';
    hero.querySelector('.hero-wave')?.setAttribute('aria-hidden', 'true');
  }
  const insight = make('div', 'card vzip-weekly');
  insight.append(make('h2', '', '이번 주 연습'));
  const chart = make('div', 'vzip-week-bars'); chart.setAttribute('aria-label', '이번 주 날짜별 연습 시간');
  const weekText = make('p', 'muted');
  insight.append(weekText, chart);
  home.querySelector('#recent')?.closest('.card')?.before(insight);
  function updateWeek() {
    const state = data(), records = state.practices || [], now = new Date();
    $('#recent')?.classList.toggle('empty', !(records.length || state.lessons?.length));
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    const days = Array.from({length: 7}, (_, index) => {
      const date = new Date(start); date.setDate(start.getDate() + index);
      const key = date.toLocaleDateString('sv-SE');
      const minutes = records.filter(record => record.date === key).reduce((sum, record) =>
        sum + (Number.isFinite(Number(record.minutes)) ? Math.max(0, Number(record.minutes)) : 0), 0);
      return {date, minutes};
    });
    const total = days.reduce((sum, day) => sum + day.minutes, 0);
    weekText.textContent = Math.round(total) + '분 · ' + days.filter(day => day.minutes > 0).length + '일의 기록';
    const maximum = Math.max(30, ...days.map(day => day.minutes));
    chart.replaceChildren();
    days.forEach(({date, minutes}, index) => {
      const column = make('div', 'vzip-week-day');
      column.setAttribute('aria-label', date.toLocaleDateString('ko-KR') + ' ' + minutes + '분');
      const bar = make('div', 'vzip-week-bar');
      bar.style.setProperty('--level', String(Math.max(0, minutes / maximum)));
      bar.classList.toggle('is-empty', minutes === 0);
      column.append(make('span', 'vzip-week-value', minutes ? String(Math.round(minutes)) : '—'),
        bar, make('span', '', ['월', '화', '수', '목', '금', '토', '일'][index]));
      chart.append(column);
    });
  }
  const journalStates = {};
  for (const [tab, title, description] of [
    ['lessons', '레슨 노트', '배운 내용과 다음 연습의 과제를 정리해요.'],
    ['practice', '연습 기록', '보컬 트레이닝과 곡 연습을 차곡차곡 남겨요.']
  ]) {
    const section = $('#' + tab), form = $('#' + (tab === 'lessons' ? 'lesson' : 'practice') + '-form');
    const formCard = form.closest('.card');
    heading(section, tab === 'lessons' ? 'LESSON NOTES' : 'PRACTICE LOG', title, description);
    const history = make('div', 'vzip-journal-history');
    [...section.querySelectorAll(':scope > .card')].filter(card =>
      card !== formCard && card.id !== 'vzip-recorder').forEach(card => history.append(card));
    section.append(history);
    const controls = make('div', 'vzip-ia-segment');
    const list = button('기록 목록', () => show(false));
    const write = button(tab === 'lessons' ? '＋ 레슨 작성' : '＋ 연습 작성', () => show(true));
    write.dataset.iaOpen = 'new'; controls.append(list, write);
    section.querySelector('.vzip-page-head').after(controls);
    const back = button('← 기록 목록으로', () => show(false), 'back');
    back.dataset.iaBack = tab; formCard.prepend(back);
    function show(edit) {
      formCard.hidden = !edit; history.hidden = edit;
      list.setAttribute('aria-pressed', String(!edit)); write.setAttribute('aria-pressed', String(edit));
      list.classList.toggle('is-active', !edit); write.classList.toggle('is-active', edit);
      if (edit) {
        formCard.scrollIntoView({block: 'start'});
        formCard.querySelector('h2')?.setAttribute('tabindex', '-1');
        formCard.querySelector('h2')?.focus({preventScroll: true});
      }
    }
    journalStates[tab] = show;
    window.addEventListener(tab === 'lessons' ? 'vzip:lesson-saved' : 'vzip:practice-saved', () => show(false));
    show(false);
  }
  heading(manage, 'YOUR WORKSPACE', '설정', '계정과 동기화, 곡과 백업을 관리해요.');
  const menu = make('div', 'vzip-ia-menu'), detail = make('div', 'vzip-ia-detail');
  manage.querySelector('.vzip-page-head').after(menu, detail);
  const cards = [...manage.querySelectorAll(':scope > .card')];
  const settings = [
    ['account', '계정 · 클라우드', '로그인, 기록 동기화와 미디어 백업', card => card.id === 'vzip-cloud-root'],
    ['songs', '연습곡', '곡 목록을 추가하고 관리하기', card => !!card.querySelector('#song-form')],
    ['categories', '연습 항목', '발성·호흡과 세부 항목 관리', card => !!card.querySelector('#manage-category')],
    ['backup', '백업 · 복원', '기록 내보내기와 백업 불러오기', card => !!card.querySelector('#export')]
  ];
  const panels = new Map();
  const settingsBack = button('← 설정 목록으로', settingsList, 'back');
  detail.append(settingsBack);
  settings.forEach(([key, title, description, match]) => {
    const card = cards.find(match);
    if (!card) return;
    card.hidden = true; detail.append(card); panels.set(key, card);
    const row = button('', () => {
      menu.hidden = true; detail.hidden = false;
      panels.forEach((panel, id) => { panel.hidden = id !== key; });
      settingsBack.focus({preventScroll: true});
    }, 'vzip-ia-menu-row');
    const label = make('span');
    label.append(make('strong', '', title), make('small', '', description));
    row.append(label, make('span', 'vzip-menu-arrow', '›')); row.dataset.iaOpen = key; menu.append(row);
  });
  function settingsList() { menu.hidden = false; detail.hidden = true; }
  settingsList();
  window.addEventListener('vzip:route-change', event => { if (event.detail.tab === 'manage') settingsList(); });
  const media = $('#media');
  heading(media, 'MEDIA LIBRARY', '보관함', '레슨과 연습에서 남긴 목소리를 다시 들어보세요.');
  $('#vzip-media-page-head')?.remove();
  const hub = $('#vzip-media-hub');
  if (hub) {
    const count = make('p', 'muted'); count.id = 'vzip-library-count';
    hub.querySelector('#vzip-hub-list')?.before(count);
    hub.querySelector('h2').textContent = '내 파일';
    hub.querySelector('p').textContent = '재생·정보 수정은 버튼으로, 두 파일 비교는 카드를 눌러 시작해요.';
    hub.querySelector('[for="vzip-hub-upload"]').textContent = '＋ 파일 가져오기';
  }
  const archive = $('#archive');
  heading(archive, 'YOUR PROGRESS', '성장 기록', '같은 곡의 기록을 돌아보고 달라진 점을 발견해요.');
  const reports = $('#vzip-saved-reports')?.closest('.card');
  const reportPage = make('div'); reportPage.id = 'vzip-ia-reports'; reportPage.hidden = true;
  const main = make('div'); main.id = 'vzip-ia-growth-main';
  archive.querySelector('.vzip-page-head').after(main);
  const actions = make('div', 'card vzip-growth-actions');
  actions.append(make('h2', '', '목소리의 변화를 들어보세요'),
    make('p', 'muted', '파일 두 개를 비교하고 느낀 변화를 메모로 남겨요.'),
    button('새 비교 시작', () => window.vzipNavigate('media'), 'primary'),
    button('저장한 리포트', () => openReports()));
  main.append(actions);
  [...archive.querySelectorAll(':scope > .card, :scope > .vzip-legacy-compare')].forEach(card => {
    if (card !== reports) main.append(card);
  });
  archive.append(reportPage);
  reportPage.append(button('← 성장 기록으로', closeReports, 'back'));
  if (reports) reportPage.append(reports);
  function openReports() { main.hidden = true; reportPage.hidden = false; }
  function closeReports() { main.hidden = false; reportPage.hidden = true; }
  window.vzipOpenReports = openReports;
  window.addEventListener('vzip:route-change', event => { if (event.detail.tab === 'archive') closeReports(); });
  window.addEventListener('vzip:data-changed', updateWeek);
  window.addEventListener('vzip:hub-refreshed', event => {
    const status = document.querySelector('#vzip-library-count');
    if (status) status.textContent = '보관함 전체 ' + (event.detail.items || []).length + '개';
  });
  updateWeek();
})();
