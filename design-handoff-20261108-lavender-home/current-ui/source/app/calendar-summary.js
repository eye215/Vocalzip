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
function render(host,{db,media,month,dateOf,titleOf,esc,metric,onMetric,expanded=false,onExpand,error=''}){
 const summary=summarize(db,media,month,dateOf),allRows=ranked(summary,metric),rows=expanded?allRows:allRows.slice(0,3),[year,mo]=month.split('-');
 host.innerHTML='<section class="card calendar-summary" aria-label="월별 노래 연습 요약">'+
 '<div class="cs-heading"><h2>'+Number(mo)+'월 노래 연습 <small>'+year+'</small></h2>'+
 '<div class="cs-totals" aria-live="polite"><span>총 <strong data-month-minutes>'+duration(summary.minutes)+'</strong></span><span>· <strong data-month-count>'+summary.count+'회</strong></span></div></div>'+
 '<div class="cs-heading"><h3>곡별 TOP '+(expanded?'5':'3')+'</h3><div class="cs-toggle" role="group" aria-label="월별 곡 순위 기준">'+
 ['minutes','count'].map(k=>'<button type="button" data-cs-metric="'+k+'" aria-pressed="'+(metric===k)+'">'+(k==='minutes'?'시간순':'횟수순')+'</button>').join('')+'</div></div>'+
 (rows.length?'<ol class="cs-ranking">'+rows.map((r,i)=>{
 const name=r.id?titleOf(r.id)||'삭제된 곡':'곡 미지정';
 const title='<span class="cs-name" title="'+esc(name)+'">'+esc(name)+'</span>';
 return '<li data-cs-song="'+esc(r.id)+'"><span class="cs-rank">'+(i+1)+'</span>'+title+'<span class="cs-values"><b>'+duration(r.minutes)+'</b><span>'+r.count+'회</span></span></li>';
 }).join('')+'</ol>':'<p class="cs-empty">이 달의 노래 연습 기록이 없어요.</p>')+
 '<div class="cs-footer">'+(allRows.length>3?'<button type="button" class="cs-more" data-cs-expand aria-expanded="'+expanded+'">'+(expanded?'접기':'TOP 5 더 보기')+'</button>':'')+
 '<details class="cs-help"><summary>집계 기준</summary><p>연습 기록 1건 또는 기록에 연결되지 않은 녹음 1개를 1회로 계산해요. 연결된 녹음은 중복 집계하지 않아요. 레슨 녹음과 발성 훈련은 제외해요.'+
 (summary.unknown?' 길이가 없는 '+summary.unknown+'건은 횟수에만 포함돼요.':'')+'</p></details></div>'+
 (error?'<p class="cs-error" role="status">'+esc(error)+' 표시된 합계는 일부 기록만 포함할 수 있어요.</p>':'')+'</section>';
 host.querySelector('[data-cs-expand]')?.addEventListener('click',()=>onExpand(!expanded));
 host.querySelectorAll('[data-cs-metric]').forEach(b=>b.onclick=()=>onMetric(b.dataset.csMetric));
}
return {summarize,ranked,duration,render};
});
