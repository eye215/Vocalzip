/* VOCAL.zip 주간 요약 screen (성장 탭) and the 홈 "지난주 요약" row. Read-only over the records: nothing here calls
 * VZ.change. The only thing written is a per-device "seen" marker for the home row (account-scoped storage, like the
 * daily goal prompt). Image/text export happens on this device; nothing is uploaded.
 * AI comment: not offered. The coach server accepts only 'monthly' (a calendar month) or 'overall' (lifetime) evidence,
 * so a week cannot be described to it without mislabelling the period. */
(() => {
'use strict';
const V=window.VZ,M=V?.media,W=window.VzipWeeklySummary;
if(!V||!M||!W)return;
const e=V.esc;
let request=0;
const valid=m=>[1,2].includes(m.analysis?.v)&&!!V.analysisReliable?.(m.analysis);
function isSongTake(m){
 if(!m.songId||!V.song(m.songId))return false;
 const practice=M.owner?.(m)?.practice;
 return !practice?.practiceRoom&&practice?.practiceMode!=='training';
}
/** Plain copies of the recordings with only what the week model reads. */
const plain=items=>(items||[]).map(m=>({id:m.id,recordedDate:m.recordedDate,created:m.created,category:M.recordingCategory?.(m)||'song',
 songId:m.songId||'',songTake:isSongTake(m),analysis:m.analysis||null,ok:valid(m),voiceCheck:m.voiceCheck||null,raw:m}));
/** 매일 보이스 체크 (built in parallel): use its own summary when the API exists; tolerate any shape or absence. */
function voiceCheckLines(items){
 const api=V.voiceCheck;if(!api)return [];
 const raw=items.map(x=>x.raw);
 for(const name of ['weeklyLines','weekSummary','summaryLines','summary']){
  if(typeof api[name]!=='function')continue;
  const out=api[name](raw);
  return Array.isArray(out)?out:typeof out==='string'?[out]:Array.isArray(out?.lines)?out.lines:out?.text?[out.text]:[];
 }
 return [];
}
const owner=()=>window.vzipCloudUserId?.()||window.VzipAccountScope?.owner||'local';
const store=()=>{try{return window.VzipAccountScope?.storage||window.localStorage;}catch{return null;}};
const seenKey=()=>'vzip_weekly_summary_seen:'+owner();
const seen=()=>{try{return store()?.getItem(seenKey())||'';}catch{return '';}};
const markSeen=week=>{try{if(seen()<week)store()?.setItem(seenKey(),week);}catch{}};
const build=(items,weekStart,extra={})=>W.build(V.db,plain(items),{weekStart,voiceCheckLines,...extra});

/* ---------- home row ---------- */
/** "지난주 요약" in the home summary rows: Monday to Wednesday (Korea time) after a week with any record, until opened. */
V.weeklySummaryHomeRow=()=>{
 try{
  const today=W.kstDate(Date.now()),weekday=(new Date(Date.parse(today+'T00:00:00Z')).getUTCDay()+6)%7;
  if(weekday>2)return null;
  const last=W.shift(W.monday(today),-7);
  if(seen()>=last)return null;
  const s=build(M.cached?.()||[],last,{today,growth:false});
  if(s.empty||s.start!==last)return null;
  return {key:'weekly',icon:'',label:'지난주 요약',value:'연습 '+W.minutesLabel(s.practice.minutes)+' · '+s.practice.days+'일',
   aria:'지난주 요약 보기, 연습 '+W.minutesLabel(s.practice.minutes)+', '+s.practice.days+'일',action:()=>V.nav('#/weekly-summary?week='+last)};
 }catch{return null;}
};

/* ---------- screen ---------- */
const STATE_CLASS={better:'good',worse:'warn',similar:'neutral',mixed:'neutral'};
const dayNames=['월','화','수','목','금','토','일'];
function weekTitle(s){return s.start.slice(0,4)+'년 '+W.rangeLabel(s);}
function badge(s){return s.current?'이번 주':s.previousWeek?'지난주':'';}
function hero(s){
 const p=s.practice,max=Math.max(...p.daysList.map(d=>d.minutes),1);
 const compare=p.previous.minutes||p.minutes?'지난주보다 '+W.signed(p.delta):'지난주 기록 없음';
 const target=p.target>0?'주간 목표 '+W.minutesLabel(p.target)+'의 '+p.ratio+'%':'주간 목표 미설정';
 const bars=p.daysList.map((d,i)=>'<li class="ws-bar'+(d.future?' future':'')+(d.today?' today':'')+'"><span class="ws-bar-track"><i style="height:'+(d.minutes?Math.max(8,Math.round(d.minutes/max*100)):0)+'%"></i></span><small>'+dayNames[i]+'</small></li>').join('');
 const label='요일별 연습 시간: '+p.daysList.map((d,i)=>dayNames[i]+' '+W.minutesLabel(d.minutes)).join(', ');
 return '<section class="ws-card ws-hero" aria-label="연습 요약">'+
  '<div class="ws-hero-top"><div><span class="ws-label">연습 시간</span><strong class="ws-metric" data-ws-minutes>'+e(W.minutesLabel(p.minutes))+'</strong></div>'+
  '<dl class="ws-stats"><div><dt>연습한 날</dt><dd data-ws-days>'+p.days+'<small>/7일</small></dd></div><div><dt>연속</dt><dd>'+p.streak+'<small>일</small></dd></div></dl></div>'+
  '<p class="ws-compare"><span>'+e(compare)+'</span><span>'+e(target)+'</span></p>'+
  (p.target>0?'<div class="ws-meter" role="meter" aria-label="주간 목표 달성률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.min(100,p.ratio)+'"><i style="width:'+Math.min(100,p.ratio)+'%"></i></div>':'')+
  '<ol class="ws-bars" role="img" aria-label="'+e(label)+'">'+bars+'</ol>'+
  (p.topSongs.length?'<ul class="ws-rows ws-top">'+p.topSongs.map((x,i)=>'<li><span class="ws-rank">'+(i+1)+'</span><span class="ws-row-title">'+e(x.title)+'</span><span class="ws-row-value">'+e(W.minutesLabel(x.minutes))+' · '+x.sessions+'회</span></li>').join('')+'</ul>':'')+
  '</section>';
}
const row=(title,value)=>'<li><span class="ws-row-title">'+e(title)+'</span><span class="ws-row-value">'+e(value)+'</span></li>';
function card(name,title,body){return '<section class="ws-card" data-ws-section="'+name+'"><h2>'+e(title)+'</h2>'+body+'</section>';}
function goalsCard(s){
 const g=s.goals,rows=[];
 rows.push(row('오늘의 목표',g.total?g.done+'/'+g.total+'개 완료':'세운 목표 없음'));
 for(const r of g.routines.slice(0,3))rows.push(row('반복 · '+r.title,r.done+'/'+r.total+'일'));
 rows.push(row('숙제 연결 연습',g.homework.sessions?g.homework.sessions+'번':'없음'));
 for(const t of g.homework.tasks.slice(0,3))rows.push(row('· '+t.title,t.sessions+'번 · '+t.reps+'회'));
 return card('goals','목표','<ul class="ws-rows">'+rows.join('')+'</ul>');
}
function recordingsCard(s){
 const r=s.recordings;
 const chips=W.CATEGORIES.map(([k,l])=>'<li><span>'+e(l)+'</span><strong>'+r.byCategory[k]+'</strong></li>').join('');
 return card('recordings','녹음','<ul class="ws-chips" aria-label="종류별 녹음 수">'+chips+'</ul><ul class="ws-rows">'+
  row('분석 완료',r.analyses+'개')+row('새로 추가한 곡',r.newSongs.length?r.newSongs.map(x=>x.title).join(', '):'없음')+'</ul>');
}
function growthCard(s){
 const g=s.growth;
 if(!g.songs)return card('growth','성장','<p class="ws-empty">이번 주에 분석한 곡 녹음이 없어요. 같은 곡을 다른 날 다시 녹음하고 분석하면 변화를 비교해요.</p>');
 const items=g.items.map(x=>'<li class="ws-growth"><strong>'+e(x.title)+'</strong>'+
  (x.lines.length?x.lines.map(l=>'<p><span class="ws-state '+(STATE_CLASS[l.state]||'neutral')+'">'+e(l.title+' · '+l.label)+'</span><small>'+e(l.text)+'</small>'+(l.basis?'<small class="ws-basis">'+e(l.basis)+'</small>':'')+'</p>').join('')
   :'<p><span class="ws-state hold">판정 보류</span><small>'+e(x.holdText)+'</small></p>')+'</li>').join('');
 return card('growth','성장','<ul class="ws-growth-list">'+items+'</ul>'+(g.more?'<p class="ws-note">분석한 곡 '+g.more+'곡 더 · <a href="#/vocal-growth">성장 분석 보기</a></p>':'')+
  '<p class="ws-note">이번 주 녹음과 그 전에 부른 같은 곡을 비교해요. 최고음이나 파사지오로는 판단하지 않아요.</p>');
}
function lessonsCard(s){
 const L=s.lessons;
 if(!L.list.length&&!L.newHomework.length)return '';
 const items=L.list.map(l=>'<li class="ws-lesson"><a href="#/lesson/'+encodeURIComponent(l.id)+'"><strong>'+e(V.dateLabel(l.date)+(l.startTime?' '+l.startTime:''))+'</strong>'+
  (l.songs.length?'<small>'+e(l.songs.join(', '))+'</small>':'')+(l.feedback?'<span class="ws-quote">'+e(l.feedback)+'</span>':'<small>피드백 미작성</small>')+'</a></li>').join('');
 return card('lessons','레슨',(items?'<ul class="ws-lessons">'+items+'</ul>':'')+
  (L.newHomework.length?'<p class="ws-sub">새 숙제</p><ul class="ws-rows">'+L.newHomework.slice(0,5).map(t=>'<li><span class="ws-row-title">'+e(t.title)+'</span></li>').join('')+'</ul>':''));
}
function optionalCards(s){
 let out='';
 if(s.voiceCheck){const v=s.voiceCheck;out+=card('voice-check','매일 보이스 체크','<ul class="ws-rows">'+row('체크한 날',v.days+'일 · '+v.count+'번')+v.lines.map(t=>'<li><span class="ws-row-title">'+e(t)+'</span></li>').join('')+'</ul>');}
 if(s.practiceSet){const p=s.practiceSet;out+=card('practice-set','오늘 연습 세트','<ul class="ws-rows">'+row('완료한 세트',p.sessions+'세트 · '+p.days+'일')+(p.minutes?row('세트 연습 시간',W.minutesLabel(p.minutes)):'')+'</ul><p class="ws-note">위 연습 시간에 이미 포함돼 있어요.</p>');}
 return out;
}
function page(s){
 const b=badge(s);
 return '<div class="growth-view-tabs growth-range ws-tabs" role="group" aria-label="성장 분석 범위"><span class="growth-range-label" aria-hidden="true">기간</span>'+
   '<button type="button" data-ws-tab="#/vocal-growth">전체 분석</button><button type="button" data-ws-tab="#/vocal-growth?mode=monthly">월별 분석</button>'+
   '<button type="button" class="active" aria-pressed="true">주간 요약</button></div>'+
  '<nav class="ws-week" aria-label="주 선택"><button type="button" class="ws-nav" data-ws-move="-1" aria-label="이전 주"'+(s.canPrevious?'':' disabled')+'><i class="ph ph-caret-left" aria-hidden="true"></i></button>'+
   '<div class="ws-week-label"><strong data-ws-range>'+e(weekTitle(s))+'</strong><small>'+e(b||'월–일 · 한국 시간')+'</small></div>'+
   '<button type="button" class="ws-nav" data-ws-move="1" aria-label="다음 주"'+(s.canNext?'':' disabled')+'><i class="ph ph-caret-right" aria-hidden="true"></i></button></nav>'+
  (s.empty?'<section class="ws-card ws-empty-card" data-ws-empty><h2>기록이 없는 주예요</h2><p>이 주에는 연습, 목표, 녹음, 레슨 기록이 없어요.</p>'+(s.current?'<a class="btn secondary" href="#/record">지금 녹음하기</a>':'')+'</section>'
   :hero(s)+goalsCard(s)+recordingsCard(s)+growthCard(s)+lessonsCard(s)+optionalCards(s)+
   '<section class="ws-card ws-share" aria-label="공유·저장"><h2>저장·공유</h2><div class="ws-share-buttons"><button type="button" class="btn secondary" data-ws-image><i class="ph ph-image" aria-hidden="true"></i> 이미지로 저장</button>'+
   '<button type="button" class="btn secondary" data-ws-copy><i class="ph ph-copy" aria-hidden="true"></i> 텍스트 복사</button></div><p class="ws-note" role="status" data-ws-share-state>이 기기에서만 만들어요. 서버로 보내지 않아요.</p></section>')+
  '<p class="ws-disclaimer">연습 시간은 직접 기록한 연습 시간만 더해요(녹음 길이는 더하지 않아요). 주는 한국 시간 월요일부터 일요일까지예요.</p>';
}

/* ---------- export (local only) ---------- */
const FONT='Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif';
const STYLE={title:['700 46px',58,'#101828'],meta:['400 28px',40,'#667085'],head:['700 32px',46,'#7A32F5'],body:['400 28px',40,'#344054'],item:['400 26px',38,'#475467']};
function wrap(ctx,text,width){
 const out=[];let line='';
 for(const ch of Array.from(text)){const next=line+ch;if(ctx.measureText(next).width>width&&line){out.push(line);line=ch.trimStart();}else line=next;}
 if(line)out.push(line);return out;
}
function drawImage(s){
 const W_=1080,pad=72,inner=W_-pad*2-48,canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
 const rows=W.lines(s),barsAfter=1,barH=150;
 const layout=[];let y=pad+48;
 rows.forEach((r,i)=>{
  const [font,lh,color]=STYLE[r.kind]||STYLE.body;ctx.font=font+' '+FONT;
  const text=r.kind==='item'?'· '+r.text:r.text;
  if(r.kind==='head')y+=18;
  for(const t of wrap(ctx,text,inner)){layout.push({font,color,t,y:y+lh*.75});y+=lh;}
  if(i===barsAfter){layout.push({bars:true,y:y+16});y+=barH+40;}
 });
 const H=y+pad;canvas.width=W_;canvas.height=H;
 ctx.fillStyle='#F8F6FD';ctx.fillRect(0,0,W_,H);
 ctx.fillStyle='#FFFFFF';ctx.beginPath();(ctx.roundRect?ctx.roundRect(pad-24,pad-24,W_-pad*2+48,H-pad*2+48,40):ctx.rect(pad-24,pad-24,W_-pad*2+48,H-pad*2+48));ctx.fill();
 const left=pad+24;
 for(const item of layout){
  if(item.bars){
   const d=s.practice.daysList,max=Math.max(...d.map(x=>x.minutes),1),gap=18,bw=(inner-gap*6)/7;
   d.forEach((x,i)=>{
    const bx=left+i*(bw+gap),h=x.minutes?Math.max(10,Math.round(x.minutes/max*(barH-40))):0;
    ctx.fillStyle='#F2EFF7';ctx.fillRect(bx,item.y,bw,barH-40);
    if(h){ctx.fillStyle='#7A32F5';ctx.fillRect(bx,item.y+barH-40-h,bw,h);}
    ctx.fillStyle='#667085';ctx.font='400 24px '+FONT;ctx.textAlign='center';ctx.fillText(dayNames[i],bx+bw/2,item.y+barH-6);ctx.textAlign='left';
   });
   continue;
  }
  ctx.font=item.font+' '+FONT;ctx.fillStyle=item.color;ctx.fillText(item.t,left,item.y);
 }
 return canvas;
}
function pngBlob(canvas){
 const b64=canvas.toDataURL('image/png').split(',')[1],bin=atob(b64),bytes=new Uint8Array(bin.length);
 for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);
 return new Blob([bytes],{type:'image/png'});
}
async function saveImage(s){
 // The blob is made synchronously so the iPhone share sheet still sees the tap that opened it.
 const blob=pngBlob(drawImage(s)),name='vocalzip-weekly-'+s.start+'.png';
 const file=typeof File==='function'?new File([blob],name,{type:'image/png'}):null;
 if(file&&navigator.canShare?.({files:[file]})&&navigator.share){
  try{await navigator.share({files:[file],title:'VOCAL.zip 주간 요약'});return 'shared';}
  catch(err){if(err?.name==='AbortError')return 'cancelled';}
 }
 const url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;a.hidden=true;document.body.append(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
 return 'downloaded';
}
async function copyText(text){
 try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(text);return true;}}catch{}
 const ta=document.createElement('textarea');ta.value=text;ta.setAttribute('readonly','');ta.style.cssText='position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
 document.body.append(ta);ta.select();let ok=false;try{ok=document.execCommand('copy');}catch{}ta.remove();return ok;
}

async function mount(host,query){
 const my=++request;
 let weekStart=query?.get('week')||'',items=M.cached?.()||[];
 const paint=()=>{
  const s=build(items,weekStart);
  if(!host.isConnected||my!==request)return;
  host.innerHTML=page(s);host.dataset.week=s.start;
  if(s.previousWeek)markSeen(s.start); // the home "지난주 요약" row has done its job
  // 전체·월별·주간 are one place in the history (성장 통합): switching replaces the address instead of adding to it.
  host.querySelectorAll('[data-ws-tab]').forEach(b=>b.onclick=()=>(V.growthHub?.go||V.nav)(b.dataset.wsTab));
  host.querySelectorAll('[data-ws-move]').forEach(b=>b.onclick=()=>{
   if(b.disabled)return;
   weekStart=W.shift(s.start,7*Number(b.dataset.wsMove));
   try{history.replaceState(null,'','#/weekly-summary?week='+weekStart);}catch{}
   paint();host.querySelector('[data-ws-move="'+b.dataset.wsMove+'"]:not([disabled])')?.focus();
  });
  const state=host.querySelector('[data-ws-share-state]');
  const say=t=>{if(state)state.textContent=t;};
  const image=host.querySelector('[data-ws-image]');
  if(image)image.onclick=async()=>{
   image.disabled=true;
   try{const how=await saveImage(s);say(how==='shared'?'공유 창을 열었어요.':how==='cancelled'?'저장을 취소했어요.':'이미지를 저장했어요.');}
   catch{say('이미지를 만들지 못했어요. 텍스트 복사를 이용해 주세요.');}
   finally{if(image.isConnected)image.disabled=false;}
  };
  const copy=host.querySelector('[data-ws-copy]');
  if(copy)copy.onclick=async()=>{
   const text=W.toText(s);
   if(await copyText(text)){say('요약을 복사했어요.');V.toast('주간 요약을 복사했어요.');return;}
   V.sheet({title:'주간 요약 텍스트',body:'<p class="small muted">길게 눌러 전체 선택한 뒤 복사해 주세요.</p><textarea class="ws-copy-area" readonly rows="12">'+e(text)+'</textarea>'});
  };
 };
 paint();
 try{const fresh=await M.list();if(my!==request||!host.isConnected)return;items=fresh;paint();}
 catch(err){if(my===request&&host.isConnected&&!items.length)host.insertAdjacentHTML('afterbegin','<p class="ws-note" role="status">녹음 목록을 불러오지 못해 녹음·성장 항목은 빠졌을 수 있어요.</p>');}
}
V.route('weekly-summary',{title:'성장',tab:'growth',noAutoRefresh:true,
 render:()=>(V.growthTabs?.('report')||'')+'<div class="ws-page" data-weekly-summary></div>',
 mount(main,r){mount(main.querySelector('[data-weekly-summary]'),r?.query);},
 leave(){request++;}
});
})();
