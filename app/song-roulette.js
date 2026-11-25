/* 🎲 곡 룰렛 (owner, 2026-11-25: "게임같이 아예 랜덤으로 골라주기도"): my song titles spin like a slot and stop on one
 * (app/song-pick-model.js random: 보류·지운 곡 제외, 오늘 안 부른 곡 우선). 이 곡 부르기 opens the recorder on it;
 * 다시 돌리기 spins again. Nothing is saved. With reduced motion the spin is skipped and the song shows at once. */
(function(){
'use strict';
const V=window.VZ;if(!V)return;
const esc=s=>V.esc(String(s??''));
const day=()=>V.today();
const mediaRows=()=>(V.media?.cached?.()||[]).map(m=>({songId:m?.songId,date:V.media?.dateOf?.(m)||''}));
const titles=()=>{const gone=new Set((V.db.deleted?.songs||[]).map(String));return (V.db.songs||[]).filter(s=>s&&!gone.has(String(s.id))&&s.repertoire?.status!=='paused').map(s=>String(s.title||'곡'));};
const still=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
V.songRoulette=()=>{
  const P=window.VzipSongPick;
  if(!P||!titles().length){V.toast('먼저 곡을 추가해 주세요.');return;}
  let timer=null,chosen=null;
  V.sheet({title:'🎲 오늘 부를 곡 뽑기',label:'오늘 부를 곡 뽑기',variant:'compact',onClose:()=>clearTimeout(timer),body:
    '<div class="vz-roulette" data-roulette><div class="vz-roulette-window" aria-hidden="true"><span data-roulette-title></span></div>'+
    '<p class="vz-roulette-result" data-roulette-result role="status" aria-live="polite"></p>'+
    '<div class="vz-roulette-actions"><button type="button" class="btn block" data-roulette-go disabled>이 곡 부르기</button>'+
    '<button type="button" class="btn secondary block" data-roulette-again disabled>다시 돌리기</button></div></div>',
    onMount:(el,close)=>{
      const shown=el.querySelector('[data-roulette-title]'),result=el.querySelector('[data-roulette-result]'),go=el.querySelector('[data-roulette-go]'),again=el.querySelector('[data-roulette-again]'),box=el.querySelector('[data-roulette]');
      const land=()=>{
        shown.textContent=chosen.title;box.classList.remove('spinning');box.classList.add('landed');
        result.textContent='오늘은 '+chosen.title+'!';go.disabled=false;again.disabled=false;go.focus();
      };
      const spin=()=>{
        clearTimeout(timer);chosen=P.random(V.db,{today:day(),media:mediaRows()});if(!chosen){close();return;}
        go.disabled=true;again.disabled=true;result.textContent='';box.classList.remove('landed');
        const list=titles();
        if(still()||list.length<2){land();return;}
        box.classList.add('spinning');
        // Fast at first, slower each step (about 2 seconds in all), then the chosen one.
        let step=0;const steps=18;
        const tick=()=>{
          if(step>=steps){land();return;}
          let t=list[Math.floor(Math.random()*list.length)];if(list.length>1&&t===shown.textContent)t=list[(list.indexOf(t)+1)%list.length];
          shown.textContent=t;step++;timer=setTimeout(tick,40+step*step*0.7);
        };
        tick();
      };
      go.onclick=()=>{if(!chosen)return;const id=chosen.songId;close();V.nav('#/record?song='+encodeURIComponent(id));};
      again.onclick=spin;
      spin();
    }});
};
})();
