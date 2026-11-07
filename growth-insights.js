/* Read-only practice insights. Existing records are never rewritten. */
(() => {
 'use strict';
const localStorage=window.VzipAccountScope?.storage||window.localStorage;
 const root=document.querySelector('#vzip-ia-growth-main');if(!root)return;
 const card=document.createElement('div');card.className='card vzip-insights';card.id='vzip-growth-insights';
 card.innerHTML='<div class="vzip-insights-head"><div><h2>연습의 흐름</h2><p class="muted">기록한 시간과 만족도를 함께 돌아보세요.</p></div><label for="vzip-growth-period">조회 기간<select id="vzip-growth-period"><option value="week">이번 주</option><option value="28" selected>최근 28일</option><option value="all">전체 기록</option></select></label></div><p class="muted" id="vzip-growth-range"></p><div id="vzip-growth-totals" class="vzip-insight-grid" aria-live="polite"></div><p id="vzip-growth-empty" class="empty" hidden>이 기간에는 연습 기록이 없어요. 첫 연습을 남겨보세요.</p><div class="vzip-insight-columns"><div><h3>연습 종류별 시간</h3><div id="vzip-growth-modes"></div></div><div><h3>자주 연습한 곡 · 상위 5</h3><div id="vzip-growth-songs"></div></div></div><h3>주별 시간과 만족도</h3><p class="muted">선택한 기간의 최근 8주까지 표시해요. 만족도는 점수가 있는 기록의 평균이에요.</p><div class="vzip-insight-table-wrap"><table><caption class="sr-only">주 시작일별 연습 시간과 평균 만족도</caption><thead><tr><th scope="col">주 시작일</th><th scope="col">시간</th><th scope="col">만족도</th></tr></thead><tbody id="vzip-growth-weeks"></tbody></table></div><h3>보컬 트레이닝 항목</h3><p class="muted">항목에 직접 입력한 시간만 집계해요. 녹음 시간은 위의 전체 시간에 포함돼요.</p><div id="vzip-growth-techniques"></div>';
 root.prepend(card);
 const $=selector=>card.querySelector(selector),period=$('#vzip-growth-period');
 const dateKey=date=>date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
 const day=value=>{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
  const [year,month,date]=value.split('-').map(Number),result=new Date(year,month-1,date);
  return dateKey(result)===value?result:null;
 };
 const monday=value=>{const date=new Date(value);date.setDate(date.getDate()-(date.getDay()+6)%7);return date};
 const amount=value=>{const number=Number(value);return Number.isFinite(number)&&number>0?number:0};
 const fmt=value=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1}).format(value);
 const average=records=>{
  const ratings=records.map(record=>Number(record.rating)).filter(rating=>Number.isFinite(rating)&&rating>=1&&rating<=5);
  return ratings.length?fmt(ratings.reduce((sum,value)=>sum+value,0)/ratings.length)+' / 5':'—';
 };
 const sum=records=>records.reduce((total,record)=>total+amount(record.minutes),0);
 function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el}
 function metric(key,label,value,note){
  const box=node('div',undefined,'vzip-insight-metric');box.dataset.metric=key;
  box.append(node('span',label),node('strong',value));if(note)box.append(node('small',note));return box;
 }
 function breakdown(target,entries,empty){
  target.replaceChildren();
  if(!entries.length){target.append(node('p',empty,'muted'));return}
  for(const [name,minutes] of entries){const row=node('div',undefined,'vzip-insight-row');row.append(node('span',name),node('strong',fmt(minutes)+'분'));target.append(row)}
 }
 function render(){
  let state;try{state=JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')||'{}')}catch{state={}}
  const now=new Date(),today=new Date(now.getFullYear(),now.getMonth(),now.getDate()),end=dateKey(today);
  let start=null;if(period.value==='week')start=monday(today);else if(period.value==='28'){start=new Date(today);start.setDate(start.getDate()-27)}
  const first=start?dateKey(start):'0000-00-00';
  const records=(Array.isArray(state?.practices)?state.practices:[]).filter(record=>record&&day(record.date)&&record.date>=first&&record.date<=end);
  $('#vzip-growth-range').textContent=(start?first:'전체 기록')+' ~ '+end+' · 오늘까지 저장한 기록';
  const completed=new Set(records.flatMap(record=>Array.isArray(record.completed)?record.completed:[]).filter(Boolean));
  const count=records.reduce((total,record)=>total+new Set((Array.isArray(record.completed)?record.completed:[]).filter(Boolean)).size,0);
  $('#vzip-growth-totals').replaceChildren(
   metric('minutes','총 연습 시간',fmt(sum(records))+'분',records.length+'개 기록 · '+new Set(records.map(record=>record.date)).size+'일'),
   metric('rating','평균 만족도',average(records),'자가 평가 기록 기준'),
   metric('homework','숙제 수행',count+'회',completed.size+'개 숙제에 수행 기록'));
  $('#vzip-growth-empty').hidden=records.length>0;
  const modes=new Map([['training',0],['song',0],['unknown',0]]);
  records.forEach(record=>{const mode=modes.has(record.practiceMode)?record.practiceMode:'unknown';modes.set(mode,modes.get(mode)+amount(record.minutes))});
  breakdown($('#vzip-growth-modes'),[['보컬 트레이닝',modes.get('training')],['곡 연습',modes.get('song')],['미분류 · 이전 기록',modes.get('unknown')]],'');
  const catalog=new Map((Array.isArray(state?.songs)?state.songs:[]).filter(Boolean).map(song=>[song.id,song.title])),songs=new Map(),techniques=new Map();
  for(const record of records){
   if(record.songId){const key=record.songId;songs.set(key,(songs.get(key)||0)+amount(record.minutes))}
   if(record.practiceMode==='training'&&Array.isArray(record.technique))for(const item of record.technique){
    if(item?.name&&amount(item.minutes))techniques.set(String(item.name),(techniques.get(String(item.name))||0)+amount(item.minutes));
   }
  }
  const rank=map=>[...map.entries()].sort((a,b)=>b[1]-a[1]);
  breakdown($('#vzip-growth-songs'),rank(songs).slice(0,5).map(([id,minutes])=>[catalog.get(id)||'삭제되었거나 이름이 없는 곡',minutes]),'곡이 연결된 연습이 없어요.');
  breakdown($('#vzip-growth-techniques'),rank(techniques),'항목별 시간이 기록되면 여기에 표시돼요.');
  const weeks=$('#vzip-growth-weeks');weeks.replaceChildren();
  const earliest=records.length?records.reduce((min,record)=>record.date<min?record.date:min,records[0].date):end;
  const lower=monday(start||day(earliest)),cursor=monday(today),buckets=[];
  for(let index=0;index<8&&cursor>=lower;index++){
   const from=dateKey(cursor),next=new Date(cursor);next.setDate(next.getDate()+7);
   const entries=records.filter(record=>record.date>=from&&record.date<dateKey(next));
   buckets.unshift({from,minutes:sum(entries),rating:average(entries)});
   cursor.setDate(cursor.getDate()-7);
  }
  for(const bucket of buckets){
   const tr=node('tr'),th=node('th',bucket.from);th.scope='row';
   tr.append(th,node('td',fmt(bucket.minutes)+'분'),node('td',bucket.rating));weeks.append(tr);
  }
 }

 const songCard=node('div',undefined,'card');songCard.id='vzip-song-growth';
 const songSelect=node('select');songSelect.id='vzip-growth-song';
 const songLabel=node('label','곡별 성장 리포트');songLabel.htmlFor=songSelect.id;
 const songBody=node('div');songBody.id='vzip-song-growth-content';
 songCard.append(songLabel,songSelect,songBody);card.after(songCard);
 let media=[];
 function renderSong(){
  let state;try{state=JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')||'{}')}catch{state={}}
  const catalog=new Map((state.songs||[]).map(s=>[s.id,s.title]));
  media.forEach(m=>{if(m.songId&&!catalog.has(m.songId))catalog.set(m.songId,m.song||'이전 곡')});
  (state.practices||[]).forEach(p=>{if(p.songId&&!catalog.has(p.songId))catalog.set(p.songId,'이전 곡')});
  const selected=songSelect.value;songSelect.replaceChildren(new Option('곡을 선택하세요',''));
  for(const [id,title] of catalog)songSelect.add(new Option(title,id));
  if(catalog.has(selected))songSelect.value=selected;
  songBody.replaceChildren();const id=songSelect.value;
  if(!id){songBody.append(node('p','곡을 선택하면 저장된 연습과 녹음의 변화를 볼 수 있어요.','muted'));return}
  const records=(state.practices||[]).filter(p=>p.songId===id);
  const recordings=media.filter(m=>m.songId===id).sort((a,b)=>(a.created||0)-(b.created||0));
  songBody.append(node('p','전체 기록 · 연습 '+records.length+'회 · '+(records.some(p=>amount(p.minutes))?'누적 '+fmt(sum(records))+'분':'연습 시간 기록 없음')+' · 녹음 '+recordings.length+'개'));
  if(!recordings.length)songBody.append(node('p','아직 이 곡에 연결된 녹음이 없어요. 보관함에서 곡을 지정해 주세요.','empty'));
  for(const item of recordings){
   const row=node('div',undefined,'vzip-insight-row');
   const when=Number.isFinite(item.created)?new Date(item.created).toLocaleDateString('ko-KR'):'날짜 미상';
   row.append(node('span',when+' · '+(item.name||'녹음')),node('strong',item.rating>=1&&item.rating<=5?item.rating+' / 5':'평가 없음'));songBody.append(row);
  }
  if(recordings.length>=2){const compare=node('button','이전 녹음과 최근 녹음 비교','btn secondary');compare.type='button';compare.onclick=()=>window.dispatchEvent(new CustomEvent('vzip:compare-pair',{detail:{firstId:recordings[recordings.length-2].id,secondId:recordings[recordings.length-1].id}}));songBody.append(compare)}
  else songBody.append(node('p','비교하려면 같은 곡의 녹음이 2개 이상 필요해요.','muted'));
  const reports=(state.comparisonReports||[]).filter(r=>r.songId===id);
  for(const [field,title] of [['notes','기록한 변화·개선점'],['goal','다음 연습 목표']]){
   songBody.append(node('h3',title));const counts=new Map();
   reports.forEach(r=>String(r[field]||'').split('\n').map(t=>t.trim()).filter(Boolean).forEach(t=>counts.set(t,(counts.get(t)||0)+1)));
   if(!counts.size)songBody.append(node('p','아직 작성한 기록이 없어요.','muted'));
   [...counts].sort((a,b)=>b[1]-a[1]).slice(0,5).forEach(([text,count])=>songBody.append(node('p',text+' · '+count+'회 기록')));
  }
 }
 songSelect.addEventListener('change',renderSong);
 window.addEventListener('vzip:hub-refreshed',event=>{media=event.detail.items||[];renderSong()});
 window.addEventListener('vzip:data-changed',renderSong);
 window.addEventListener('vzip:route-change',event=>{if(event.detail.tab==='archive')renderSong()});
 renderSong();
 period.addEventListener('change',render);
 window.addEventListener('vzip:data-changed',render);
 window.addEventListener('storage',event=>{if(event.key===(window.VzipAccountScope?.key('vocal-zip_mvp_v1')||'vocal-zip_mvp_v1'))render()});
 window.addEventListener('vzip:route-change',event=>{if(event.detail.tab==='archive')render()});
 render();
})();
