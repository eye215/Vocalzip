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
 // A redraw happens when the date, month, sort or cloud data changes.
 if(host._csTimer)clearInterval(host._csTimer);
 const summary=summarize(db,media,month,dateOf),rows=ranked(summary),[year,mo]=month.split('-');
 host.innerHTML='<section class="card calendar-summary" aria-label="월별 노래 연습 요약">'+
 '<div class="cs-heading"><h2>'+Number(mo)+'월 연습 <small>'+year+'</small></h2>'+
 '<div class="cs-totals" aria-live="polite"><strong data-month-minutes>'+duration(summary.minutes)+'</strong><span>·</span><strong data-month-count>'+summary.count+'회</strong></div></div>'+
 (rows.length?'<div class="cs-spotlight" data-cs-spotlight aria-live="off" aria-label="이 달에 연습한 곡"><i class="ph ph-music-notes" aria-hidden="true"></i><span class="cs-name" data-cs-name></span><span class="cs-values" data-cs-values></span></div>':'<p class="cs-empty">이 달의 노래 연습 기록이 없어요.</p>')+
 '<details class="cs-help"><summary>집계 기준</summary><p>연습 기록 1건 또는 기록에 연결되지 않은 녹음 1개를 1회로 계산해요. 연결된 녹음은 중복 집계하지 않아요. 레슨 녹음과 발성 훈련은 제외해요.'+
 (summary.unknown?' 길이가 없는 '+summary.unknown+'건은 횟수에만 포함돼요.':'')+'</p></details>'+
 (error?'<p class="cs-error" role="status">'+esc(error)+' 표시된 합계는 일부 기록만 포함할 수 있어요.</p>':'')+'</section>';
 let index=0;
 const show=()=>{
  const row=rows[index],box=host.querySelector('[data-cs-spotlight]');if(!row||!box)return;
  box.dataset.csSong=row.id;
  const name=row.id?titleOf(row.id)||'삭제된 곡':'곡 미지정';
  box.querySelector('[data-cs-name]').textContent=name;box.querySelector('[data-cs-name]').title=name;
  box.querySelector('[data-cs-values]').textContent=duration(row.minutes)+' · '+row.count+'회';
 };
 const next=()=>{index=(index+1)%rows.length;show();};
 show();
 if(rows.length>1){
  host._csTimer=setInterval(()=>{
   if(!host.isConnected){clearInterval(host._csTimer);host._csTimer=null;return;}
   if(document.hidden||host.matches(':hover')||host.contains(document.activeElement))return;
   next();
  },4000);
 }
}
return {summarize,ranked,duration,render};
});
