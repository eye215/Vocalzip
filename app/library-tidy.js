/* 녹음 정리 (#/library-tidy, owner 2026-11-26): the recordings worth a look when the library has grown large — very
 * short takes, takes with almost no voice, days with many takes of one song (app/library-tidy-model.js) — each one
 * playable, nothing ticked. Only what the person ticks is deleted, after one confirmation, with the app's ordinary
 * permanent delete (M.remove: this device and the cloud copy, practice/lesson records kept). Recordings without a song
 * are not handled here: a link goes to 곡 확인 (#/song-suggest). */
(()=>{
'use strict';
const V=window.VZ,M=V?.media,T=window.VzipLibraryTidy;
if(!V||!M||!T)return;
const esc=V.esc;
const MAX_ROWS=60,MAX_DAYS=15;
const dayLabel=date=>{const d=V.parseYmd?.(date);return d?(d.getMonth()+1)+'월 '+d.getDate()+'일':date;};
let busy=false;

V.route('library-tidy',{title:'녹음 정리',back:true,tab:'songs',noAutoRefresh:true,
  render(){return '<div data-tidy>'+(V.loadingRows?.(4)||'<p class="muted">불러오는 중…</p>')+'</div>';},
  async mount(main){await draw(main.querySelector('[data-tidy]'));}
});

async function draw(host){
  if(!host)return;
  let list;
  try{list=await M.list();}catch(error){if(host.isConnected)host.innerHTML=V.errorBox?.('녹음 목록을 불러오지 못했어요.','data-tidy-retry')||'';host.querySelector('[data-tidy-retry]')?.addEventListener('click',()=>draw(host));return;}
  if(!host.isConnected)return;
  const g=T.groups(list,{dateOf:M.dateOf,songless:m=>M.songSearchEligible?.(m)});
  const shown=[];
  const row=(m,why)=>{shown.push(m);return '<div class="tidy-row" data-tidy-row="'+esc(m.id)+'"><label class="tidy-pick"><input type="checkbox" data-tidy-id="'+esc(m.id)+'" aria-label="'+esc(M.label(m))+' 고르기"></label><div class="tidy-main">'+V.mediaMini(m)+(why?'<p class="small muted tidy-why">'+esc(why)+'</p>':'')+'</div></div>';};
  const block=(key,title,help,body,count)=>'<section class="tidy-group" data-tidy-group="'+key+'"><div class="tidy-head"><h2 class="sec">'+esc(title)+' <span class="muted">'+count+'개</span></h2><button type="button" class="chip" data-tidy-all="'+key+'">모두 고르기</button></div><p class="small muted">'+esc(help)+'</p>'+body+'</section>';
  const secs=m=>Number(m.durationSeconds)>0?Math.round(Number(m.durationSeconds))+'초':'';
  const parts=[];
  if(g.short.length)parts.push(block('short','아주 짧은 녹음','5초가 안 돼요. 잘못 눌러 녹음된 것일 수 있어요.',g.short.slice(0,MAX_ROWS).map(m=>row(m,M.dateOf(m)+' · '+secs(m))).join(''),g.short.length));
  if(g.quiet.length)parts.push(block('quiet','소리가 거의 없는 녹음','분석해 보니 노래한 소리가 2초도 안 돼요.',g.quiet.slice(0,MAX_ROWS).map(m=>row(m,M.dateOf(m)+' · '+secs(m)+' · 소리 '+(Math.round(Number(m.analysis.metrics.voicedSeconds)*10)/10)+'초')).join(''),g.quiet.length));
  if(g.sameDay.length)parts.push(block('same','같은 날 같은 곡을 여러 번','4번 이상 녹음한 날이에요. 남길 것만 두고 정리해도 돼요. 위가 나중에 녹음한 거예요.',
    g.sameDay.slice(0,MAX_DAYS).map(d=>'<h3 class="tidy-day">'+esc(V.songTitle(d.songId)||'곡')+' · '+esc(dayLabel(d.date))+' · '+d.items.length+'개</h3>'+d.items.map(m=>row(m,secs(m))).join('')).join(''),
    g.sameDay.reduce((n,d)=>n+d.items.length,0)));
  host.innerHTML='<div class="card tidy-intro"><p class="small" style="margin:0">살펴볼 만한 녹음을 모았어요. <b>미리 골라 둔 건 없어요.</b> 들어 보고 지울 것만 고르세요. 지우면 이 기기와 클라우드에서 영구 삭제돼요. 연습·레슨 기록과 연습 시간은 남아요.</p></div>'+
    (g.songless?'<a class="card item tidy-songless" href="#/song-suggest" style="text-decoration:none"><span class="item-main"><span class="item-title">곡이 정해지지 않은 녹음 '+g.songless+'개</span><span class="item-sub">곡 확인에서 곡을 정해요</span></span><i class="ph ph-caret-right chev"></i></a>':'')+
    (parts.length?parts.join(''):(V.empty?.('check-circle','정리할 만한 녹음이 없어요.')||'<p>정리할 만한 녹음이 없어요.</p>'))+
    '<div class="tidy-foot" data-tidy-foot><button type="button" class="btn danger block" data-tidy-delete disabled>골라서 지우기</button></div>';
  V.wireMedia?.(host,shown);host.classList.remove('vz-media-select-enabled'); // the ticks here are this screen's own
  const byId=new Map(shown.map(m=>[String(m.id),m]));
  const picked=()=>[...new Set([...host.querySelectorAll('[data-tidy-id]:checked')].map(i=>i.dataset.tidyId))].map(id=>byId.get(id)).filter(Boolean);
  const btn=host.querySelector('[data-tidy-delete]');
  const sync=()=>{const n=picked().length;btn.disabled=busy||!n;btn.textContent=n?'고른 '+n+'개 영구 삭제':'골라서 지우기';};
  // The same recording can sit in two groups (a short take on a busy day): ticking one ticks both.
  host.addEventListener('change',e=>{const i=e.target.closest('[data-tidy-id]');if(!i)return;host.querySelectorAll('[data-tidy-id="'+CSS.escape(i.dataset.tidyId)+'"]').forEach(x=>{x.checked=i.checked;});sync();});
  host.querySelectorAll('[data-tidy-all]').forEach(b=>b.onclick=()=>{const boxes=[...b.closest('[data-tidy-group]').querySelectorAll('[data-tidy-id]')],on=!boxes.every(x=>x.checked);
    for(const x of boxes)host.querySelectorAll('[data-tidy-id="'+CSS.escape(x.dataset.tidyId)+'"]').forEach(y=>{y.checked=on;});b.textContent=on?'모두 풀기':'모두 고르기';sync();});
  btn.onclick=async()=>{
    const items=picked();if(!items.length||busy)return;
    const ok=await V.confirm('녹음 영구 삭제','고른 녹음 '+items.length+'개를 삭제할까요?\n\n이 기기와 클라우드의 파일과 연결을 삭제해요. 연습·레슨 기록, 메모와 연습 시간은 남아요. 파일은 복구할 수 없어요.',{ok:items.length+'개 영구 삭제',danger:true});
    if(!ok)return;
    busy=true;sync();let done=0;const failed=[];
    for(const m of items){
      btn.textContent='지우는 중 '+(done+failed.length+1)+' / '+items.length;
      try{await M.remove(m);done++;}catch(error){failed.push(M.label(m)+': '+(error?.message||'실패'));}
    }
    busy=false;M.invalidate?.();
    V.toast(done+'개를 지웠어요.'+(failed.length?' '+failed.length+'개는 지우지 못했어요: '+failed[0]:''),failed.length?'error':undefined);
    await draw(host);
  };
  sync();
}
})();
