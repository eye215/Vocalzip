/* Calendar is a read-only projection of existing records; dates use local calendar days. */
(() => {
  'use strict';
const localStorage=window.VzipAccountScope?.storage||window.localStorage;
  const history = document.querySelector('#practice .vzip-journal-history');
  if (!history) return;
  const read = () => { try { return JSON.parse(localStorage.getItem('vocal-zip_mvp_v1') || '{}'); } catch { return {}; } };
  const key = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const validDate = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(value + 'T12:00:00'); return !Number.isNaN(d.valueOf()) && key(d) === value;
  };
  let importedMedia=[],mediaRun=0;
  const slim=item=>({id:item.id,name:item.name,songId:item.songId,song:item.song,created:item.created,recordedDate:item.recordedDate,durationSeconds:item.durationSeconds,dateSource:item.dateSource});
  async function refreshMedia(){const run=++mediaRun;const map=new Map();try{(await window.vzipReadMedia?.()||[]).forEach(item=>map.set(item.id,slim(item)))}catch{}try{(await window.vzipCloudMediaList?.()||[]).forEach(item=>map.set(item.id,slim(item)))}catch{}if(run===mediaRun){importedMedia=[...map.values()];render()}}
  let selected = key(new Date()), month = selected.slice(0,7);
  const card = document.createElement('div'); card.className = 'vzip-calendar';
  card.innerHTML = `<div class="vzip-calendar-heading"><button type="button" data-month-step="-1" aria-label="이전 달"><i class="ph ph-caret-left" aria-hidden="true"></i></button><label><span class="vzip-calendar-month-label"></span><input type="month" aria-label="기록 월 선택"></label><button type="button" data-month-step="1" aria-label="다음 달"><i class="ph ph-caret-right" aria-hidden="true"></i></button></div><div class="vzip-calendar-week" aria-hidden="true"><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span><span>일</span></div><div class="vzip-calendar-days" role="group" aria-label="기록 날짜 선택"></div><div class="vzip-calendar-footer"><span>점이 있는 날에 기록이 있어요</span><button type="button" data-today>오늘</button></div><div role="region" class="vzip-calendar-selected" aria-label="선택한 날짜 기록"><h3></h3><div class="vzip-calendar-records"></div></div>`;
  history.prepend(card);
  const heading = document.querySelector('#practice-heading'); if (heading) heading.textContent = '기록';
  const description = document.querySelector('#practice .vzip-page-head p'); if (description) description.textContent = '날짜별로 녹음과 연습, 레슨, 수행한 숙제를 돌아봐요.';
  const navLabel = document.querySelector('.nav [data-tab=practice] span:last-child'); if (navLabel) navLabel.textContent = '기록';
  const monthInput = card.querySelector('input'), grid = card.querySelector('.vzip-calendar-days');
  const make = (tag, cls, text) => { const el = document.createElement(tag); el.className = cls; if (text !== undefined) el.textContent = text; return el; };
  function entries(db) {
    return [...(db.practices || []).map(record => ({kind:'practice',record})),
      ...(db.lessons || []).map(record => ({kind:'lesson',record})),
      ...importedMedia.map(item=>({kind:'media',record:{...item,date:validDate(item.recordedDate)?item.recordedDate:(Number.isFinite(Number(item.created))&&Number(item.created)>0?key(new Date(Number(item.created))):'')}}))].filter(entry => validDate(entry.record.date));
  }
  function openRecord(kind, id) {
    if(kind==='media'){
      const play=()=>{const row=[...document.querySelectorAll('.vzip-hub-item')].find(row=>row.dataset.id===id);if(!row)return false;row.querySelector('[data-action=play]')?.click();row.tabIndex=-1;row.scrollIntoView({block:'center'});row.focus();return true};
      // Navigation refreshes the library. Start playback only on the new rows.
      window.addEventListener('vzip:hub-refreshed',play,{once:true});
      window.vzipNavigate?.('media');
      document.querySelector('#vzip-hub-reload')?.click();
      return;
    }
    const tab = kind === 'lesson' ? 'lessons' : 'practice';
    window.vzipNavigate?.(tab);
    document.querySelector(`#${tab} .vzip-ia-segment button:not([data-ia-open])`)?.click();
    const selector = kind === 'lesson' ? '[data-edit-lesson]' : '[data-delete="practice"]';
    const trigger = [...document.querySelectorAll(selector)].find(button => (button.dataset.editLesson || button.dataset.id) === id);
    const row = trigger?.closest('.item'); if (!row) return;
    row.tabIndex = -1; row.scrollIntoView({block:'center',behavior:'smooth'}); row.focus({preventScroll:true});
    const media = row.querySelector('.vzip-practice-files'); if (media) media.open = true;
  }
  function render() {
    const db = read(), records = entries(db), [year,m] = month.split('-').map(Number);
    monthInput.value = month;
    card.querySelector('.vzip-calendar-month-label').textContent = `${year}년 ${m}월`;
    grid.replaceChildren();
    const offset = (new Date(year,m-1,1).getDay()+6)%7, days = new Date(year,m,0).getDate();
    for (let i=0;i<offset;i++) { const blank=make('span','vzip-calendar-blank'); blank.setAttribute('aria-hidden','true'); grid.append(blank); }
    for (let day=1;day<=days;day++) {
      const date = `${month}-${String(day).padStart(2,'0')}`, count = records.filter(entry=>entry.record.date===date).length;
      const button = make('button', 'vzip-calendar-day', String(day)); button.type='button'; button.dataset.date=date;
      button.setAttribute('aria-label',`${year}년 ${m}월 ${day}일 · 기록 ${count}개`);
      button.setAttribute('aria-pressed',String(date===selected));
      if (date===key(new Date())) button.setAttribute('aria-current','date');
      if (count) button.classList.add('has-records');
      button.onclick=()=>{selected=date;render();card.querySelector(`[data-date="${date}"]`)?.focus({preventScroll:true});}; grid.append(button);
    }
    const date = new Date(selected+'T12:00:00');
    card.querySelector('h3').textContent = date.toLocaleDateString('ko-KR',{month:'long',day:'numeric',weekday:'short'});
    const list = card.querySelector('.vzip-calendar-records'); list.replaceChildren();
    const selectedEntries = records.filter(entry=>entry.record.date===selected);
    for (const {kind,record} of selectedEntries) {
      const row=make('button','vzip-calendar-record');row.type='button';row.dataset.recordId=record.id;
      const icon=make('i','ph ph-'+(kind==='lesson'?'graduation-cap':'microphone'));icon.setAttribute('aria-hidden','true');
      const content=make('span','vzip-calendar-record-text'), song=(db.songs||[]).find(song=>song.id===record.songId);
      content.append(make('strong','',kind==='media'?(record.name||'녹음 파일'):kind==='lesson'?'레슨 기록':song?.title||'자유 연습'));
      const minutes=Number(record.minutes), duration=Number.isFinite(minutes)&&minutes>=0?`${Math.round(minutes*10)/10}분`:'시간 미기록';
      content.append(make('span','',kind==='media'?`녹음 · ${record.song||song?.title||'곡 미지정'}${record.dateSource==='metadata'?' · 메타데이터 날짜':record.dateSource==='file-modified'?' · 파일 수정일':''}`:kind==='lesson'?(record.feedback||record.memo||song?.title||'레슨 메모 보기'):`연습 · ${duration}${record.rating?' · 만족도 '+record.rating+'/5':''}`));
      const arrow=make('i','ph ph-caret-right');arrow.setAttribute('aria-hidden','true');row.append(icon,content,arrow);
      row.onclick=()=>openRecord(kind,record.id);list.append(row);
      if (kind==='practice' && record.completed?.length) {
        const tasks = [...new Set(record.completed)].map(id=>(db.assignments||[]).find(task=>task.id===id)?.title||'이전 숙제');
        const homework=make('button','vzip-calendar-record vzip-calendar-homework');homework.type='button';
        const taskIcon=make('i','ph ph-check-square');taskIcon.setAttribute('aria-hidden','true');
        const info=make('span','vzip-calendar-record-text');info.append(make('strong','',`숙제 수행 ${tasks.length}개`),make('span','',tasks.join(' · ')));
        homework.append(taskIcon,info);homework.onclick=()=>openRecord(kind,record.id);list.append(homework);
      }
    }
    if (!selectedEntries.length) list.append(make('p','vzip-calendar-empty','이날 남긴 기록이 없어요. 연습이나 레슨을 기록해 보세요.'));
  }
  function chooseMonth(value) {
    if (!/^\d{4}-\d{2}$/.test(value)) return;
    const [year,m]=value.split('-').map(Number); if(year<1900||year>9998||m<1||m>12)return;
    const day=Math.min(Number(selected.slice(-2)),new Date(year,m,0).getDate());
    month=value;selected=`${month}-${String(day).padStart(2,'0')}`;render();
  }
  monthInput.min='1900-01';monthInput.max='9998-12';monthInput.onchange=()=>chooseMonth(monthInput.value);
  card.querySelectorAll('[data-month-step]').forEach(button=>button.onclick=()=>{const [y,m]=month.split('-').map(Number);const d=new Date(y,m-1+Number(button.dataset.monthStep),1);chooseMonth(key(d).slice(0,7));});
  card.querySelector('[data-today]').onclick=()=>{selected=key(new Date());month=selected.slice(0,7);render();};
  window.addEventListener('vzip:hub-refreshed',event=>{mediaRun++;importedMedia=(event.detail?.items||[]).map(slim);render()});
  for(const event of ['vzip:media-saved','vzip:media-updated','vzip:cloud-media-changed','vzip:auth-changed'])window.addEventListener(event,refreshMedia);
  window.addEventListener('vzip:media-imported',event=>{if(validDate(event.detail?.date)){selected=event.detail.date;month=selected.slice(0,7)}refreshMedia()});
  window.addEventListener('vzip:data-changed',render);render();refreshMedia();
})();
