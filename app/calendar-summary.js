/* Read-only monthly song-practice summary. No media/storage mutations. */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.VZ.calendarSummary=api;
})(globalThis,()=>{
'use strict';
const positive=n=>Number.isFinite(Number(n))&&Number(n)>0?Number(n):0;
function summarize(db,media,month,dateOf){
 const rows=new Map(),seen=new Set(),linked=new Set((db.practices||[]).flatMap(p=>p.mediaIds||[]));
 const lessonFiles=new Set((db.lessons||[]).flatMap(l=>(l.recordings||[]).map(r=>r.id)));
 let minutes=0,count=0,unknown=0;
 const add=(key,date,songId,value)=>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||date.slice(0,7)!==month||seen.has(key))return;
  seen.add(key);const time=positive(value),id=songId||'';
  const row=rows.get(id)||{id,minutes:0,count:0};
  row.minutes+=time;row.count++;rows.set(id,row);
  minutes+=time;count++;if(!time)unknown++;
 };
 for(const p of db.practices||[])if(p.practiceMode!=='training')add('p:'+p.id,p.date,p.songId,p.minutes);
 for(const m of media||[]){
  if(linked.has(m.id)||lessonFiles.has(m.id)||m.source==='lesson')continue;
  add('m:'+m.id,dateOf(m),m.songId,positive(m.durationSeconds)/60);
 }
 return {minutes,count,unknown,rows:[...rows.values()]};
}
function ranked(summary,metric='minutes'){
 const other=metric==='count'?'minutes':'count';
 return summary.rows.slice().sort((a,b)=>b[metric]-a[metric]||b[other]-a[other]||String(a.id).localeCompare(String(b.id))).slice(0,5);
}
function duration(value){
 const seconds=Math.round(positive(value)*60),hours=Math.floor(seconds/3600),minutes=Math.floor(seconds%3600/60);
 return hours?hours+'시간'+(minutes?' '+minutes+'분':''):minutes?minutes+'분':seconds?seconds+'초':'0분';
}
function render(host,{db,media,month,dateOf,titleOf,esc,error=''}){
 if(host._csTimer)clearInterval(host._csTimer);
 const summary=summarize(db,media,month,dateOf),[year,mo]=month.split('-');
 const lists={minutes:ranked(summary,'minutes'),count:ranked(summary,'count')};
 host.innerHTML='<section class="card calendar-summary" aria-label="월별 노래 연습 요약">'+
 '<div class="cs-heading"><h2>'+Number(mo)+'월 연습 <small>'+year+'</small></h2>'+
 '<div class="cs-totals" aria-live="polite"><strong data-month-minutes>'+duration(summary.minutes)+'</strong><span>·</span><strong data-month-count>'+summary.count+'회</strong></div></div>'+
 (lists.minutes.length?'<button type="button" class="cs-spotlight" data-cs-spotlight aria-expanded="false" aria-controls="cs-rank-panel" aria-label="연습곡 순위 펼치기, 좌우로 밀어 시간별 횟수별 전환"><span class="cs-rank" data-cs-rank></span><span class="cs-name" data-cs-name></span><span class="cs-values" data-cs-values></span><i class="ph ph-caret-down" aria-hidden="true"></i></button><div class="cs-rank-panel" id="cs-rank-panel" aria-hidden="true" inert><div class="cs-rank-list" data-cs-list></div></div>':'<p class="cs-empty">이 달의 노래 연습 기록이 없어요.</p>')+
 '<details class="cs-help"><summary>집계 기준</summary><p>연습 기록 1건 또는 기록에 연결되지 않은 녹음 1개를 1회로 계산해요. 연결된 녹음은 중복 집계하지 않아요. 레슨 녹음과 발성 훈련은 제외해요.'+
 (summary.unknown?' 길이가 없는 '+summary.unknown+'건은 횟수에만 포함돼요.':'')+'</p></details>'+
 (error?'<p class="cs-error" role="status">'+esc(error)+' 표시된 합계는 일부 기록만 포함할 수 있어요.</p>':'')+'</section>';
 const ticker=host.querySelector('[data-cs-spotlight]');if(!ticker)return;
 const panel=host.querySelector('[data-cs-rank-panel],#cs-rank-panel'),list=host.querySelector('[data-cs-list]');
 let metric='minutes',index=0,opened=false,touchX=0,touchY=0,swiped=false;
 const label=()=>metric==='minutes'?'시간별':'횟수별';
 const show=()=>{
  const rows=lists[metric],row=rows[index];if(!row)return;
  ticker.dataset.csSong=row.id;
  const name=row.id?titleOf(row.id)||'삭제된 곡':'곡 미지정';
  ticker.querySelector('[data-cs-rank]').textContent=label()+' '+(index+1)+'위';
  ticker.querySelector('[data-cs-name]').textContent=name;
  ticker.querySelector('[data-cs-name]').title=name;
  ticker.querySelector('[data-cs-values]').textContent=duration(row.minutes)+' · '+row.count+'회';
  list.replaceChildren();
  rows.forEach((entry,i)=>{
   const button=document.createElement('button');button.type='button';button.className='cs-rank-row'+(i===index?' active':'');
   const title=entry.id?titleOf(entry.id)||'삭제된 곡':'곡 미지정',value=duration(entry.minutes)+' · '+entry.count+'회',prefix=label();
   button.setAttribute('aria-label',prefix+' '+(i+1)+'위 '+title+', '+value);
   button.innerHTML='<span class="cs-rank-number"></span><span class="cs-name"></span><span class="cs-values"></span>';
   button.querySelector('.cs-rank-number').textContent=prefix+' '+(i+1)+'위';button.querySelector('.cs-name').textContent=title;button.querySelector('.cs-values').textContent=value;
   button.onclick=()=>{if(swiped)return;index=i;show();close();ticker.focus()};list.append(button);
  });
 };
 const close=()=>{opened=false;panel.classList.remove('open');panel.setAttribute('aria-hidden','true');panel.inert=true;ticker.setAttribute('aria-expanded','false')};
 const setMetric=next=>{if(metric===next)return;metric=next;index=0;show()};
 ticker.onclick=()=>{if(swiped){swiped=false;return}opened=!opened;panel.classList.toggle('open',opened);panel.setAttribute('aria-hidden',String(!opened));panel.inert=!opened;ticker.setAttribute('aria-expanded',String(opened))};
 for(const target of [ticker,panel]){
  target.addEventListener('touchstart',e=>{touchX=e.touches[0].clientX;touchY=e.touches[0].clientY;swiped=false},{passive:true});
  target.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-touchX,dy=e.changedTouches[0].clientY-touchY;if(Math.abs(dx)>35&&Math.abs(dx)>Math.abs(dy)){swiped=true;setMetric(dx>0?'minutes':'count');setTimeout(()=>swiped=false,500)}},{passive:true});
 }
 show();
 host._csTimer=setInterval(()=>{
  if(!host.isConnected){clearInterval(host._csTimer);host._csTimer=null;return}
  if(opened||document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  if(index<lists[metric].length-1)index++;else{metric=metric==='minutes'?'count':'minutes';index=0}show();
 },3500);
}
return {summarize,ranked,duration,render};
});
