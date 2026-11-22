/* 내 로드맵 (#/roadmap): what to fix next, from how the person sings lately — app/roadmap-model.js decides, this file
 * shows it. It replaces 노래 연습실's fixed 9 steps and the 보컬 트레이닝 sheet on 오늘 › 연습하기 (one row, 내 로드맵).
 * Nothing is stored: it is worked out from the analysed recordings (VZ.practiceTips over this device's media list) and
 * the 기본기 records every time, so a newly analysed recording changes it at once. Its focus exercises are the ones
 * 오늘의 연습 puts first (app/practice-set.js passes V.roadmap().focus to the set). */
(()=>{
'use strict';
const V=window.VZ,R=window.VzipRoadmap,D=window.VzipDailySet;
if(!V||!R||typeof document==='undefined')return;
const esc=V.esc;
const mediaList=()=>{try{return V.media?.cached?.()||[];}catch{return [];}};
const isOn=id=>{const pf=D?.prefs?.(V.db),e=D?.exercise?.(id);return !!e&&!!pf&&!pf.off[id]&&!pf.groupsOff[e.group];};
/** Today's roadmap ({basis, focus, areas}); null when it cannot be worked out. Reading it writes nothing. */
V.roadmap=()=>{
  try{const files=mediaList(),tips=V.practiceTips&&files.length?V.practiceTips(files):{enough:false,count:0,tips:[]};return R.build({db:V.db,today:V.today(),tips,isOn:id=>!D||isOn(id)});}
  catch(error){console.error(error);return null;}
};
V.roadmapSummary=r=>R.summary(r);
const STATE={fix:'손볼 곳',ok:'괜찮아요',skill:'기본기',unknown:'아직 몰라요'};
function focusHtml(f,i){
  const e=D?.exercise?.(f.exercise),on=!D||isOn(f.exercise);
  return '<li class="rm-focus" data-rm-focus="'+esc(f.area)+'"><div class="rm-focus-head"><span class="rm-num">'+(i+1)+'</span><strong>'+esc(f.title)+'</strong>'+
    '<span class="rm-from">'+(f.from==='recording'?'녹음에서':'기본기에서')+'</span></div>'+
    '<p class="rm-why" data-rm-why>'+esc(f.why)+'</p>'+
    (f.goal?'<p class="rm-goal"><b>목표</b> '+esc(f.goal)+'</p>':'')+
    '<p class="rm-ex" data-rm-ex><i class="ph ph-barbell" aria-hidden="true"></i><span>'+esc(e?.title||f.exercise)+(f.step?' · 기본기 '+f.step+'단계 도전':'')+'</span><small>'+(on?'오늘의 연습에 먼저 들어가요':'오늘의 연습 편집에서 꺼 두었어요')+'</small></p>'+
    '<div class="rm-actions"><a class="btn sm" href="#/practice-set">오늘의 연습 하기</a><a class="btn sm secondary" href="#/levels/'+encodeURIComponent(f.area)+'">기본기 보기</a></div></li>';
}
function html(r){
  const b=r.basis,rooms=(V.db.practices||[]).filter(p=>p?.practiceRoom&&!p.practiceRoom.demo&&!(V.db.deleted?.practices||[]).includes(p.id)).length;
  return '<section class="rm" data-roadmap>'+
    '<p class="rm-basis" data-rm-basis>'+(b.enough?'최근 분석된 녹음 '+b.count+'개'+(b.range?' · 음역 '+esc(b.range):'')+'를 보고 정했어요. 새 녹음이 분석되면 바로 다시 정해요.':
      '분석된 녹음이 3개를 넘으면 녹음을 보고 손볼 곳을 정해요'+(b.count?' (지금 '+b.count+'개)':'')+'. 그 전에는 기본기 기록으로 정해요.')+'</p>'+
    '<h2 class="rm-h">지금 손볼 곳</h2>'+
    (r.focus.length?'<ol class="rm-focus-list">'+r.focus.map(focusHtml).join('')+'</ol>':'<p class="muted">지금은 손볼 곳을 정할 기록이 없어요. 곡을 녹음하거나 오늘의 연습을 해 보세요.</p>')+
    '<h2 class="rm-h">기본기 8가지</h2><ul class="rm-areas">'+r.areas.map(a=>'<li><a href="#/levels/'+encodeURIComponent(a.id)+'" data-rm-area="'+esc(a.id)+'" data-state="'+esc(a.state)+'"><strong>'+esc(a.title)+'</strong>'+
      '<span class="rm-chip">'+esc(STATE[a.state]||'')+'</span><small>'+esc(a.line)+'</small><i class="ph ph-caret-right" aria-hidden="true"></i></a></li>').join('')+'</ul>'+
    '<div class="rm-song"><h2 class="rm-h">곡으로 확인하기</h2><p class="muted">곡을 녹음하면 분석해서 로드맵을 다시 정해요. 음정·지속음·비브라토·호흡은 녹음에서, 나머지는 오늘의 연습에서 재요.</p>'+
      '<a class="btn secondary block" href="#/record"><i class="ph ph-microphone" aria-hidden="true"></i>곡 녹음하기</a></div>'+
    (rooms?'<a class="rm-old" href="#/practice-room" data-rm-room>지난 노래 연습실 제출 '+rooms+'개 보기 <i class="ph ph-arrow-right" aria-hidden="true"></i></a>':'')+
    '<p class="rm-note">녹음의 숫자로 고르는 연습 안내예요. 목소리를 평가하거나 진단하는 것이 아니에요. 목이 아프면 쉬어 주세요.</p></section>';
}
V.route('roadmap',{title:'내 로드맵',back:true,tab:'home',
  render:()=>'<div class="rm-host" data-rm-host>'+(V.loadingRows?.(3)??'<p class="muted" role="status">불러오는 중…</p>')+'</div>',
  async mount(){
    const host=document.querySelector('[data-rm-host]');if(!host)return;
    // The media list is read once so the recordings' analysis is in (it is cached after the first read).
    try{await V.media?.list?.();}catch{}
    if(!host.isConnected)return;
    const r=V.roadmap();
    host.innerHTML=r?html(r):(V.errorBox?V.errorBox('로드맵을 만들지 못했어요.','data-rm-retry'):'<p class="muted">로드맵을 만들지 못했어요.</p>');
    host.querySelector('[data-rm-retry]')?.addEventListener('click',()=>V.nav('#/roadmap'));
  }});
})();
