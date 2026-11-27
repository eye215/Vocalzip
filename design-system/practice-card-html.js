/* 오늘의 연습 — ONE card on home (home redesign step 2, 2026-11-27). It takes the place of the big "지금 할 것" card and of
 * the former 오늘 연습 card (goal rows, 추가 rows, + 계획 넣기 / + 직접 적기, 하루 목표 bars, 시작하기 / 타이머만 켜기, the
 * small rows). What it shows, top to bottom:
 *   head      "오늘의 연습", + 미션 (the goal sheet), 편집 (the set's list) and a round timer button (타이머만 켜기, the free
 *             clock of app/free-timer.js; while it runs a strip "연습 중 · mm:ss · 멈추기", after a long gap the question
 *             how to count it).
 *   missions  필수 미션 done/total with one small box per goal of today (tap = check / uncheck, the goal toggle home always
 *             had) and under it the set's steps as one bar (one segment per step); a flag under each step that is one of
 *             today's goals (step.goalId).
 *   tiles     the set's steps as a row of tiles: the one to do now large, the rest small; done steps leave the row except
 *             done goal steps. Every tile does what the card's one button did: start / carry on / save (V.dailySet.go).
 * The home adapter gives the data and the actions (design-system/student-home-app.js); an action throws Error(message)
 * to have the message said in the card. Nothing here writes data. */
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const minutesText=n=>{n=Math.max(0,Math.round(Number(n)||0));return n>=60?Math.floor(n/60)+"시간"+(n%60?" "+n%60+"분":""):n+"분";};
/* Size and stroke are also set inline: the approved home's sheet sizes every svg 20px with a 1.8 stroke
 * (#vocalzip-refined-preview svg), which drew these icons too big and thin. */
const svg=(body,{size=14,color="currentColor",width=2.2,fill="none"}={})=>'<svg width="'+size+'" height="'+size+'" style="width:'+size+'px;height:'+size+'px;stroke-width:'+width+'" viewBox="0 0 24 24" fill="'+fill+'" stroke="'+color+'" stroke-width="'+width+'" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+body+"</svg>";
const ICON={
 flag:'<path d="M5 21V4h11l-2 4 2 4H5"/>',
 check:'<path d="M5 12.5 10 17 19 7.5"/>',
 timer:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2.5h5"/>',
 pencil:'<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
 wind:'<path d="M3 9h11a3 3 0 1 0-3-3M3 15h15a3 3 0 1 1-3 3M3 12h7"/>',
 wave:'<path d="M4 10v4M8 7v10M12 4v16M16 7v10M20 10v4"/>',
 note:'<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
 mic:'<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
 target:'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/>',
 body:'<circle cx="12" cy="5" r="2"/><path d="M5 10c4 1.5 10 1.5 14 0M12 11v4l-3 6M12 15l3 6"/>',
 beat:'<path d="M7 21h10L14 4h-4z"/><path d="M12 15l5-7"/>',
 again:'<path d="M20 11a8 8 0 0 0-14.3-4.3L4 9M4 4v5h5"/><path d="M4 13a8 8 0 0 0 14.3 4.3L20 15M20 20v-5h-5"/>',
 save:'<path d="M5 12.5 10 17 19 7.5"/>',
 list:'<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>'
};
const PLAY='<svg width="14" height="14" style="width:14px;height:14px" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 5.5v13l10.5-6.5z" fill="#5B1FC2"/></svg>';
const STAR=(x,y,size,delay,duration)=>'<span class="vz-tw vz-pc-star" style="left:'+x+'px;top:'+y+'px;animation-delay:'+delay+'s;animation-duration:'+duration+'s"><svg width="'+size+'" height="'+size+'" style="width:'+size+'px;height:'+size+'px" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 1.5c.6 5.4 3.1 9.9 10.5 10.5-7.4.6-9.9 5.1-10.5 10.5C11.4 17.1 8.9 12.6 1.5 12 8.9 11.4 11.4 6.9 12 1.5z" fill="#fff"/></svg></span>';
const DOT=(x,y,size,delay,duration)=>'<span class="vz-pc-dot" style="left:'+x+'px;top:'+y+'px;width:'+size+'px;height:'+size+'px;animation-delay:'+delay+'s;animation-duration:'+duration+'s"></span>';
/** Five tiny stars and five dots on the large tile (decoration only). */
const SPARKLE='<span class="vz-pc-sparkle" aria-hidden="true">'+STAR(16,56,8,0,2.4)+STAR(66,20,6,.7,2)+STAR(104,60,7,1.3,2.8)+STAR(124,16,5,.3,1.9)+STAR(88,96,5,1.9,2.6)+
 DOT(40,100,3,.5,1.6)+DOT(88,44,2,1.1,1.4)+DOT(10,20,2,1.7,2.1)+DOT(130,96,3,.9,1.7)+DOT(70,112,2,.2,1.5)+"</span>";
/** The icon of a step: its group, else its kind. */
function iconOf(x){
 const g=x.group||"",k=x.kind||"";
 if(k==="voice-check")return ICON.wave;
 if(g==="loosen")return ICON.body;
 if(g==="breath")return ICON.wind;
 if(g==="voice")return ICON.wave;
 if(g==="ear")return ICON.note;
 if(g==="rhythm")return ICON.beat;
 if(k==="take"||k==="record")return ICON.mic;
 if(k==="song")return ICON.note;
 if(k==="warmup")return ICON.target;
 return ICON.pencil;
}
/** A step's planned time as said on a tile: under a minute in seconds. */
const timeOf=x=>{const m=Number(x.minutes)||0;if(x.time)return String(x.time);return m>0&&m<1?Math.round(m*60)+"초":Math.round(m)+"분";};
const MAX_BOXES=5;
export const PRACTICE_CARD_CSS=String.raw`
/* 오늘의 연습 (design-system/practice-card-html.js) */
#vocalzip-refined-preview .vz-card.vz-pc{display:block;box-sizing:border-box;margin:0 4px 12px;padding:18px;border-radius:22px;background:#fff;box-shadow:0 1px 2px rgba(59,15,140,.05),0 8px 24px rgba(59,15,140,.06);scroll-margin-top:12px;}
#vocalzip-refined-preview .vz-pc.is-shown{box-shadow:0 0 0 2px #DCC4FF;}
#vocalzip-refined-preview .vz-pc [hidden]{display:none!important;}
#vocalzip-refined-preview .vz-pc button{font:inherit;-webkit-tap-highlight-color:transparent;}
#vocalzip-refined-preview .vz-pc button:focus-visible{outline:2px solid #DCC4FF;outline-offset:2px;}
#vocalzip-refined-preview .vz-pc-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px;margin:-5px 0;}
#vocalzip-refined-preview .vz-pc .vz-practice-title{flex:1;min-width:0;margin:0;font-size:17px;line-height:24px;font-weight:800;letter-spacing:-.01em;color:var(--vz-color-ink,#101828);outline:none;white-space:nowrap;}
#vocalzip-refined-preview .vz-pc-tools{display:flex;flex:none;align-items:center;gap:0;margin-right:-5px;font-size:14px;color:#667085;}
#vocalzip-refined-preview .vz-pc-tools>span{padding:0 2px;}
#vocalzip-refined-preview .vz-pc-link{min-width:44px;min-height:44px;margin:0;padding:0 4px;border:0;background:none;color:#667085;font-size:14px;line-height:20px;cursor:pointer;white-space:nowrap;}
#vocalzip-refined-preview .vz-pc-link[data-set-pick]{min-width:44px;color:#5B1FC2;font-weight:800;}
#vocalzip-refined-preview .vz-pc-timer{display:grid;place-items:center;flex:none;width:44px;height:44px;margin:0 0 0 2px;padding:0;border:0;border-radius:50%;background:none;cursor:pointer;}
#vocalzip-refined-preview .vz-pc-timer>span{display:grid;place-items:center;width:34px;height:34px;border-radius:50%;background:#EFE8FC;color:#5B1FC2;}
#vocalzip-refined-preview .vz-pc-timer[aria-disabled="true"]>span{background:#F4F1F9;color:#A39CB4;}
#vocalzip-refined-preview .vz-pc-run{display:flex;align-items:center;gap:10px;min-height:48px;margin:12px 0 0;padding:0 4px 0 14px;border-radius:14px;background:#EFE8FC;color:#5B1FC2;}
#vocalzip-refined-preview .vz-pc-run>span{flex:1;min-width:0;display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;}
#vocalzip-refined-preview .vz-pc-run>span>i{display:block;flex:none;width:8px;height:8px;border-radius:50%;background:#7A32F5;animation:vzPcBlink 1.6s ease-in-out infinite;}
@keyframes vzPcBlink{0%,100%{opacity:1}50%{opacity:.35}}
#vocalzip-refined-preview .vz-pc-run button{flex:none;min-height:44px;padding:0 16px;border:0;border-radius:12px;background:#7A32F5;color:#fff;font-size:14px;font-weight:700;cursor:pointer;}
#vocalzip-refined-preview .vz-pc-away{display:grid;gap:8px;margin:12px 0 0;padding:12px;border-radius:14px;background:#EFE8FC;color:#344054;font-size:13px;line-height:18px;}
#vocalzip-refined-preview .vz-pc-away strong{color:#5B1FC2;font-size:14px;}
#vocalzip-refined-preview .vz-pc-away div{display:flex;flex-wrap:wrap;gap:8px;}
#vocalzip-refined-preview .vz-pc-away button{min-height:44px;padding:0 14px;border:0;border-radius:12px;background:#fff;color:#5B1FC2;font-size:13px;font-weight:700;cursor:pointer;}
#vocalzip-refined-preview .vz-pc-mission{margin:14px 0 0;padding:12px 14px;border:1px solid #E8DDFB;border-radius:16px;background:#F7F3FE;}
#vocalzip-refined-preview .vz-pc-mission-head{display:flex;align-items:center;justify-content:space-between;gap:4px 10px;flex-wrap:wrap;min-height:44px;margin:-10px 0 -9px;}
#vocalzip-refined-preview .vz-pc-count{flex:none;margin:0;font-size:15px;line-height:22px;font-weight:900;color:var(--vz-color-ink,#101828);font-variant-numeric:tabular-nums;white-space:nowrap;}
#vocalzip-refined-preview .vz-pc-count b{color:#5B1FC2;font-weight:900;}
#vocalzip-refined-preview .vz-pc-count small{color:#7D8597;font-size:15px;font-weight:900;}
#vocalzip-refined-preview .vz-pc-boxes{display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;flex:1 1 auto;min-width:0;margin:0 -11px 0 0;}
/* 22px boxes 4px apart, each still a 44px target: the buttons overlap by 18px (the later one on top). */
#vocalzip-refined-preview .vz-pc-box{position:relative;display:grid;place-items:center;flex:none;width:44px;height:44px;margin:0 -9px;padding:0;border:0;background:none;cursor:pointer;}
#vocalzip-refined-preview .vz-pc-box:first-child{margin-left:0;}
#vocalzip-refined-preview .vz-pc-box:last-child{margin-right:0;}
#vocalzip-refined-preview .vz-pc-box>span{display:grid;place-items:center;box-sizing:border-box;width:22px;height:22px;border:2px solid #7A32F5;border-radius:7px;background:#fff;color:#5B1FC2;}
#vocalzip-refined-preview .vz-pc-box[aria-pressed="true"]>span{background:#7A32F5;color:#fff;}
#vocalzip-refined-preview .vz-pc-box:disabled{cursor:progress;}
#vocalzip-refined-preview .vz-pc-box:disabled>span{opacity:.6;}
#vocalzip-refined-preview .vz-pc-box:focus-visible{outline:none;}
#vocalzip-refined-preview .vz-pc-box:focus-visible>span{outline:2px solid #DCC4FF;outline-offset:2px;}
#vocalzip-refined-preview .vz-pc-more{flex:none;min-width:44px;min-height:44px;margin:0;padding:0 6px;border:0;background:none;color:#5B1FC2;font-size:13px;font-weight:800;cursor:pointer;font-variant-numeric:tabular-nums;}
#vocalzip-refined-preview .vz-pc-empty{display:flex;align-items:center;gap:6px;width:100%;min-height:44px;margin:-10px 0 -9px;padding:0;border:0;background:none;color:var(--vz-color-ink,#101828);font-size:15px;line-height:22px;font-weight:900;text-align:left;cursor:pointer;}
#vocalzip-refined-preview .vz-pc-empty b{color:#5B1FC2;font-weight:800;font-size:14px;}
#vocalzip-refined-preview .vz-pc-empty>span{color:#7D8597;font-weight:600;font-size:14px;}
#vocalzip-refined-preview .vz-pc-bar{display:flex;gap:4px;margin:12px 0 0;}
#vocalzip-refined-preview .vz-pc-bar>i{display:block;box-sizing:border-box;min-width:4px;height:7px;border-radius:99px;background:#E6DDF6;}
#vocalzip-refined-preview .vz-pc-bar>i[data-look="done"]{background:var(--vz-gradient-primary,linear-gradient(135deg,#9A5BFF 0%,#7A32F5 45%,#5B1FC2 100%));}
#vocalzip-refined-preview .vz-pc-bar>i[data-look="next"]{background:#C9AEFB;}
#vocalzip-refined-preview .vz-pc-flags{display:flex;gap:4px;height:12px;margin:6px 0 0;}
#vocalzip-refined-preview .vz-pc-flags>i{display:flex;justify-content:center;min-width:4px;line-height:0;}
#vocalzip-refined-preview .vz-pc-flags svg{display:block;flex:none;}
#vocalzip-refined-preview .vz-pc-line{margin:14px 0 0;font-size:14px;line-height:20px;font-weight:700;color:#5B1FC2;font-variant-numeric:tabular-nums;}
#vocalzip-refined-preview .vz-pc-tiles{display:flex;gap:8px;margin:14px -18px -18px;padding:0 18px 18px;overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none;-webkit-overflow-scrolling:touch;scroll-padding-inline:18px;}
#vocalzip-refined-preview .vz-pc-tiles::-webkit-scrollbar{display:none;}
#vocalzip-refined-preview .vz-pc-tiles::after{content:"";flex:none;width:10px;}
#vocalzip-refined-preview .vz-pc-tile{position:relative;display:flex;flex-direction:column;justify-content:space-between;gap:10px;flex:none;box-sizing:border-box;width:112px;min-height:104px;margin:0;padding:12px;border:1px solid #EEE9F6;border-radius:18px;background:#fff;color:var(--vz-color-ink,#101828);text-align:left;cursor:pointer;overflow:hidden;}
#vocalzip-refined-preview .vz-pc-tile-top{display:flex;align-items:center;justify-content:space-between;gap:4px;min-width:0;}
#vocalzip-refined-preview .vz-pc-ic{display:grid;place-items:center;flex:none;width:30px;height:30px;border-radius:50%;background:#F3EEFC;color:#667085;}
#vocalzip-refined-preview .vz-pc-words{display:grid;grid-template-columns:minmax(0,1fr);min-width:0;}
#vocalzip-refined-preview .vz-pc-title{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;line-height:21px;font-weight:800;color:#344054;}
#vocalzip-refined-preview .vz-pc-meta{margin-top:2px;font-size:13px;line-height:18px;color:#7D8597;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#vocalzip-refined-preview .vz-pc-pill{display:inline-flex;align-items:center;gap:3px;flex:none;padding:3px 7px;border-radius:99px;background:#7A32F5;color:#fff;font-size:11px;line-height:14px;font-weight:900;white-space:nowrap;}
#vocalzip-refined-preview .vz-pc-tile[data-goal="true"]{border:2px solid #7A32F5;}
#vocalzip-refined-preview .vz-pc-tile[data-goal="true"] .vz-pc-ic{background:#EFE8FC;color:#5B1FC2;}
#vocalzip-refined-preview .vz-pc-tile[data-goal="true"] .vz-pc-title{font-size:15px;font-weight:800;color:var(--vz-color-ink,#101828);}
#vocalzip-refined-preview .vz-pc-tile[data-goal="true"] .vz-pc-meta{color:#667085;}
#vocalzip-refined-preview .vz-pc-tile[data-look="done"]{border:2px solid #7A32F5;background:#F1ECFF;}
#vocalzip-refined-preview .vz-pc-tile[data-look="done"] .vz-pc-ic{background:#7A32F5;color:#fff;}
#vocalzip-refined-preview .vz-pc-tile[data-look="done"] .vz-pc-title,#vocalzip-refined-preview .vz-pc-tile[data-look="done"] .vz-pc-meta,#vocalzip-refined-preview .vz-pc-done-word{color:#5B1FC2;}
#vocalzip-refined-preview .vz-pc-done-word{font-size:13px;font-weight:900;white-space:nowrap;}
#vocalzip-refined-preview .vz-pc-tile[data-look="now"]{width:152px;border:0;background:var(--vz-gradient-primary,linear-gradient(135deg,#9A5BFF 0%,#7A32F5 45%,#5B1FC2 100%));color:#fff;box-shadow:0 8px 18px rgba(122,50,245,.3);}
#vocalzip-refined-preview .vz-pc-tile[data-look="now"] .vz-pc-ic{background:rgba(255,255,255,.2);color:#fff;}
#vocalzip-refined-preview .vz-pc-tile[data-look="now"] .vz-pc-title{font-size:15px;font-weight:800;color:#fff;}
#vocalzip-refined-preview .vz-pc-tile[data-look="now"] .vz-pc-meta{padding-right:36px;} /* the ▶ sits beside the second line only, so the title keeps the full width */
#vocalzip-refined-preview .vz-pc-tile[data-look="now"] .vz-pc-meta{color:rgba(255,255,255,.88);}
#vocalzip-refined-preview .vz-pc-tile[data-look="now"] .vz-pc-pill{background:#fff;color:#5B1FC2;}
#vocalzip-refined-preview .vz-pc-tile[data-look="soft"]{width:140px;border:0;background:#F1ECFF;}
#vocalzip-refined-preview .vz-pc-tile[data-look="soft"] .vz-pc-ic{background:#fff;color:#5B1FC2;}
#vocalzip-refined-preview .vz-pc-tile[data-look="soft"] .vz-pc-title{font-size:15px;font-weight:800;color:#5B1FC2;}
#vocalzip-refined-preview .vz-pc-tile[data-look="soft"] .vz-pc-meta{color:#5B1FC2;white-space:normal;}
#vocalzip-refined-preview .vz-pc-play{position:absolute;right:12px;bottom:12px;display:grid;place-items:center;width:32px;height:32px;border-radius:50%;background:#fff;box-shadow:0 4px 10px rgba(40,0,110,.25);}
#vocalzip-refined-preview .vz-pc-tile>*:not(.vz-pc-sparkle){position:relative;z-index:1;}
#vocalzip-refined-preview .vz-pc-tile>.vz-pc-play{position:absolute;}
#vocalzip-refined-preview .vz-pc-sparkle{position:absolute;inset:0;z-index:0;pointer-events:none;}
#vocalzip-refined-preview .vz-pc-dot{position:absolute;border-radius:99px;background:#fff;opacity:.08;animation:vzPcDot 1.8s ease-in-out infinite;pointer-events:none;}
@keyframes vzPcDot{0%,100%{opacity:.08}50%{opacity:.5}}
#vocalzip-refined-preview .vz-pc-tile:active{transform:scale(.98);}
#vocalzip-refined-preview .vz-pc-tile:focus-visible{outline:2px solid #DCC4FF;outline-offset:2px;}
#vocalzip-refined-preview .vz-pc-note,#vocalzip-refined-preview .vz-pc-error{margin:10px 0 0;font-size:13px;line-height:18px;}
#vocalzip-refined-preview .vz-pc-note{color:var(--vz-color-ink-secondary,#475467);}
#vocalzip-refined-preview .vz-pc-error{color:#b42318;}
#vocalzip-refined-preview .vz-pc-note:empty,#vocalzip-refined-preview .vz-pc-error:empty{display:none;}
#vocalzip-refined-preview .vz-pc-tiles+.vz-pc-error,#vocalzip-refined-preview .vz-pc-tiles+.vz-pc-error+.vz-pc-note{margin-top:28px;}
@media(prefers-reduced-motion:reduce){
 #vocalzip-refined-preview .vz-pc .vz-tw,#vocalzip-refined-preview .vz-pc-dot,#vocalzip-refined-preview .vz-pc-run>span>i{animation:none;}
 #vocalzip-refined-preview .vz-pc .vz-tw{opacity:.35;transform:none;}
 #vocalzip-refined-preview .vz-pc-dot{opacity:.25;}
 #vocalzip-refined-preview .vz-pc-tile:active{transform:none;}
}
@media(min-width:768px){
 #vocalzip-refined-preview .vz-col>.vz-card.vz-pc{margin:0 0 16px;padding:22px;}
 #vocalzip-refined-preview .vz-pc .vz-practice-title{font-size:20px;line-height:28px;}
 #vocalzip-refined-preview .vz-pc-tiles{margin:16px -22px -22px;padding:0 22px 22px;scroll-padding-inline:22px;}
}
`;
export function createPracticeCard(opts={}){
 const card=document.createElement("section");
 card.className="vz-card vz-pc";card.dataset.homePractice="";card.dataset.homeToday="";card.setAttribute("aria-labelledby","vz-practice-title");
 card.innerHTML='<div class="vz-pc-body" data-row="practice-set"></div><p class="vz-pc-error vz-save-error" role="alert" data-today-error></p><p class="vz-pc-note" role="status" aria-live="polite" data-today-note></p>';
 const $=s=>card.querySelector(s),body=$("[data-row=practice-set]");
 let model=null,sign="",showAll=false,focusKey="",pending=new Map();
 const rootNode=()=>card.getRootNode();
 const say=text=>{$("[data-today-error]").textContent=text||"";};
 /** Run an action; its Error message is said in the card. */
 const run=fn=>{say("");try{const out=fn();if(out&&typeof out.then==="function")return out.catch(e=>{say(e?.message||"저장하지 못했어요.");});return out;}catch(e){say(e?.message||"저장하지 못했어요.");return false;}};
 const goals=()=>(Array.isArray(model?.plan)?model.plan:[]).map(g=>pending.has(g.id)?{...g,done:pending.get(g.id)}:g);
 function head(){
  const t=model.timer,off=!!model.timerOff,blocked=model.timerBlocked||"";
  return '<div class="vz-pc-head"><h2 id="vz-practice-title" class="vz-practice-title" tabindex="-1">오늘의 연습</h2><div class="vz-pc-tools">'+
   '<button type="button" class="vz-pc-link" data-today-add-plan data-k="add-plan" aria-label="필수 미션 넣기">+ 미션</button><span aria-hidden="true">·</span>'+
   '<button type="button" class="vz-pc-link" data-set-pick data-k="pick" aria-label="오늘의 연습 편집">편집</button>'+
   (off||t?"":'<button type="button" class="vz-pc-timer" data-timer-start data-k="timer-start" aria-label="'+(blocked?"타이머 켜기, 지금은 켤 수 없어요":"타이머 켜기")+'"'+(blocked?' aria-disabled="true"':"")+"><span>"+svg(ICON.timer,{size:18,width:1.8})+"</span></button>")+
   "</div></div>"+
   (t&&t.away?'<div class="vz-pc-away" data-today-away role="group" aria-label="오래 자리를 비웠어요"><strong>오래 자리를 비웠어요</strong><span>타이머를 켜 둔 채 '+esc(minutesText(t.awaySeconds/60))+'이 지났어요. 이 시간을 어떻게 셀지 골라 주세요. 고르면 바로 저장해요.</span>'+
    '<div><button type="button" data-timer-away="all">모두 세고 저장</button><button type="button" data-timer-away="none">비운 시간 빼고 저장</button></div></div>':
   t?'<div class="vz-pc-run" data-today-timer><span><i aria-hidden="true"></i>연습 중 · <b data-timer-text>'+esc(t.text)+'</b></span><button type="button" data-timer-stop data-k="timer-stop">멈추기</button></div>':"");
 }
 function missions(items,look,current){
  const list=goals(),done=list.filter(g=>g.done).length;
  let top;
  if(!list.length)top='<button type="button" class="vz-pc-empty" data-mission-empty data-k="mission-empty">필수 미션 없음 <span aria-hidden="true">·</span> <b>+ 미션</b></button>';
  else{
   const shown=showAll?list:list.slice(0,MAX_BOXES);
   top='<div class="vz-pc-mission-head"><p class="vz-pc-count" data-mission-count>필수 미션 <b>'+done+"</b><small>/"+list.length+"</small></p>"+
    '<div class="vz-pc-boxes" role="group" aria-label="필수 미션 '+done+"개 완료, 모두 "+list.length+'개">'+shown.map(g=>
     '<button type="button" class="vz-pc-box" data-mission="'+esc(g.id)+'" data-k="mission:'+esc(g.id)+'" aria-pressed="'+!!g.done+'" aria-label="'+esc("필수 미션 "+g.title+", "+(g.done?"완료":"아직"))+'"'+(pending.has(g.id)?" disabled":"")+"><span>"+
      (g.done?svg(ICON.check,{size:12,width:3}):svg(ICON.flag,{size:11,width:2.4}))+"</span></button>").join("")+
    (list.length>MAX_BOXES?'<button type="button" class="vz-pc-more" data-more data-k="more" aria-expanded="'+showAll+'" aria-label="'+(showAll?"필수 미션 접기":"필수 미션 "+(list.length-MAX_BOXES)+"개 더 보기")+'">'+(showAll?"접기":"+"+(list.length-MAX_BOXES))+"</button>":"")+
    "</div></div>";
  }
  let bar="";
  if(items.length){
   const set=model.set,flex=x=>Math.max(1,Number(x.minutes)||0);
   // A short step still reads as a segment, not a dot (14px while the steps fit, narrower when there are many).
   const least=items.length<=12?14:items.length<=16?8:4,grow=x=>"flex:"+flex(x)+";min-width:"+least+"px";
   const word=x=>look(x)==="done"?"완료":x.state==="skipped"?"건너뜀":x===current?"지금":"남음";
   const said=(set.line?set.line+". ":"")+items.map(x=>x.title+" "+timeOf(x)+" "+word(x)+(x.goal?" (필수 미션)":"")).join(", ");
   bar='<div class="vz-pc-bar" data-set-bar role="img" aria-label="'+esc(said)+'">'+items.map(x=>'<i data-seg="'+esc(x.id)+'" data-look="'+look(x)+'" data-state="'+esc(x.state||"left")+'"'+(x.goal?' data-goal="true"':"")+' style="'+grow(x)+'"></i>').join("")+"</div>"+
    (items.some(x=>x.goal)?'<div class="vz-pc-flags" data-set-flags aria-hidden="true">'+items.map(x=>{
     if(!x.goal)return '<i style="'+grow(x)+'"></i>';
     const l=look(x),icon=l==="done"?svg(ICON.check,{size:12,width:3,color:"#7A32F5"}):svg(ICON.flag,{size:12,width:2.4,color:x===current?"#5B1FC2":"#B8A6DA"});
     return '<i style="'+grow(x)+'" data-flag="'+esc(x.id)+'" data-look="'+(l==="done"?"done":x===current?"next":"rest")+'">'+icon+"</i>";}).join("")+"</div>":"");
  }
  return '<div class="vz-pc-mission" data-missions>'+top+bar+"</div>";
 }
 const pill=(now)=>'<span class="vz-pc-pill">'+svg(ICON.flag,{size:11,width:2.4,color:now?"#5B1FC2":"#fff"})+"필수</span>";
 function tile(x,{now=false,live=false}={}){
  const done=x.look==="done",lookAttr=now?"now":done?"done":"step";
  const meta=now?timeOf(x)+" · "+(live?"이어서 하기":"눌러서 시작"):done?"필수 미션":timeOf(x);
  const label=(x.label&&!String(x.title||"").startsWith(x.label)?x.label+" ":"")+(x.title||"")+", "+(done?"필수 미션 완료":timeOf(x))+(x.goal&&!done?", 필수 미션":"")+(now?", "+(live?"이어서 하기":"눌러서 시작"):", 오늘의 연습 "+(live?"이어서 하기":"시작하기"));
  return '<button type="button" class="vz-pc-tile" data-step="'+esc(x.id)+'" data-label="'+esc(x.label||"")+'" data-look="'+lookAttr+'" data-goal="'+!!x.goal+'"'+(now?" data-set-go":"")+' data-k="tile:'+esc(x.id)+'" aria-label="'+esc(label)+'">'+
   (now?SPARKLE:"")+
   '<span class="vz-pc-tile-top"><span class="vz-pc-ic">'+svg(done?ICON.check:iconOf(x),{size:15,width:done?2.6:2.2})+"</span>"+(done?'<span class="vz-pc-done-word">완료!</span>':x.goal?pill(now):"")+"</span>"+
   '<span class="vz-pc-words"><span class="vz-pc-title">'+esc(x.title)+'</span><span class="vz-pc-meta">'+esc(meta)+"</span></span>"+
   (now?'<span class="vz-pc-play" aria-hidden="true">'+PLAY+"</span>":"")+"</button>";
 }
 /** One tile of its own (기록 저장하기 · 한 번 더 하기 · 연습 고르기). */
 const single=({look,icon,title,meta,label,attr})=>'<div class="vz-pc-tiles" role="group" aria-label="오늘의 연습"><button type="button" class="vz-pc-tile" data-look="'+look+'" '+attr+' aria-label="'+esc(label)+'">'+(look==="now"?SPARKLE:"")+
  '<span class="vz-pc-tile-top"><span class="vz-pc-ic">'+svg(icon,{size:15})+"</span></span>"+
  '<span class="vz-pc-words"><span class="vz-pc-title">'+esc(title)+'</span><span class="vz-pc-meta">'+esc(meta)+"</span></span>"+(look==="now"?'<span class="vz-pc-play" aria-hidden="true">'+PLAY+"</span>":"")+"</button></div>";
 function render(){
  if(!model)return;
  const active=rootNode().activeElement,key=focusKey||(card.contains(active)?active?.dataset?.k||"":"");focusKey="";
  const scroller=$(".vz-pc-tiles"),scrollLeft=scroller?scroller.scrollLeft:0;
  const set=model.set||null,state=set?.state||"none",list=goals(),byId=new Map(list.map(g=>[g.id,g]));
  // A step is one of today's goals when it carries that goal's id (app/daily-set-model.js timeline: goalId).
  const items=(Array.isArray(set?.items)?set.items:[]).map(x=>({...x,goal:!!(x.goalId&&byId.has(x.goalId)),goalDone:!!(x.goalId&&byId.get(x.goalId)?.done)}));
  const doneLook=x=>x.state==="done"||(x.goal&&x.goalDone);
  const current=state==="live"?items.find(x=>x.state==="next")||null:state==="new"?items.find(x=>!doneLook(x)&&x.state!=="skipped")||null:null;
  const look=x=>doneLook(x)?"done":x===current?"next":"rest";
  items.forEach(x=>{x.look=look(x)==="done"?"done":"";});
  let rest="";
  if(state==="new"||state==="live"){
   const live=state==="live",others=items.filter(x=>x!==current&&(x.goal?true:x.look!=="done"&&x.state!=="skipped"));
   // Every tile is the set's button (start / carry on); the large one is the step to do now.
   const tiles=[...(current?[tile(current,{now:true,live})]:[]),...others.map(x=>tile(x,{live}))];
   rest='<div class="vz-pc-tiles" role="group" aria-label="'+esc(set.label||"오늘의 연습")+'">'+tiles.join("")+"</div>";
  }else if(state==="summary")rest=single({look:"now",icon:ICON.save,title:"기록 저장하기",meta:"시간을 확인하고 저장해요",label:set.label||"오늘의 연습 기록 저장하기",attr:"data-set-go"});
  else if(state==="done")rest='<p class="vz-pc-line" data-set-done>'+esc(set.line||"")+"</p>"+single({look:"soft",icon:ICON.again,title:set.button||"한 번 더 하기",meta:"처음부터 다시 해요",label:set.label||"오늘의 연습 한 번 더 하기",attr:"data-set-go"});
  else rest='<p class="vz-pc-line" data-set-done>오늘 할 연습이 비어 있어요</p>'+single({look:"soft",icon:ICON.list,title:"연습 고르기",meta:"편집에서 넣어요",label:"오늘의 연습 고르기",attr:"data-set-pick-tile"});
  body.dataset.state=state;
  body.innerHTML=head()+missions(items,look,current)+rest;
  const n=model.note;
  $("[data-today-note]").textContent=!n?"":n.short?"1분이 안 돼서 기록하지 않았어요. 1분 넘게 연습하면 저장돼요.":n.saved?"연습 "+minutesText(n.minutes)+"을 기록했어요.":"";
  const next=$(".vz-pc-tiles");if(next&&scrollLeft)next.scrollLeft=scrollLeft;
  if(key){const el=card.querySelector('[data-k="'+(window.CSS?.escape?CSS.escape(key):key)+'"]');el?.focus({preventScroll:true});}
 }
 const signOf=m=>JSON.stringify(m,(k,v)=>typeof v==="function"?undefined:v);
 /** New data from home: drawn again only when something changed. */
 function update(next){
  model=next||{};
  for(const [id,v] of pending)if((model.plan||[]).find(g=>g.id===id)?.done===v)pending.delete(id);
  const s=signOf(model)+"|"+showAll+"|"+JSON.stringify([...pending]);
  if(s===sign)return;sign=s;render();
 }
 const redraw=()=>{sign="";update(model);};
 /** The timer's second: only its text changes, unless it started, stopped or went away. */
 function tick(state){
  if(!model)return;
  const was=model.timer;
  if(!!was!==!!state||was?.away!==state?.away){model={...model,timer:state};redraw();return;}
  if(state){model.timer=state;const t=card.querySelector("[data-timer-text]");if(t&&t.textContent!==state.text)t.textContent=state.text;}
 }
 card.addEventListener("click",async event=>{
  const t=event.target.closest("button");if(!t||!card.contains(t))return;
  if(t.matches("[data-mission]")){
   const id=t.dataset.mission,g=goals().find(x=>x.id===id);if(!g||pending.has(id))return;
   const want=!g.done;pending.set(id,want);focusKey="mission:"+id;say("");redraw();
   try{if(await opts.onToggle?.(id,want)===false)throw Error("save rejected");}
   catch{pending.delete(id);focusKey="mission:"+id;redraw();say("저장하지 못했어요. 다시 눌러 주세요.");return;}
   // Saved: the new data comes from home (and clears the pending mark); until then the box keeps the new state.
   if(pending.has(id)&&(model.plan||[]).find(x=>x.id===id)?.done===want){pending.delete(id);redraw();}
   return;
  }
  if(t.matches("[data-more]")){showAll=!showAll;focusKey="more";return redraw();}
  if(t.matches("[data-today-add-plan],[data-mission-empty]"))return opts.onAddPlan?.();
  if(t.matches("[data-set-pick],[data-set-pick-tile]"))return opts.onSetPick?.();
  if(t.matches("[data-step],[data-set-go]"))return run(()=>opts.onSetGo?.());
  if(t.matches("[data-timer-start]")){focusKey="timer-stop";return run(()=>opts.onTimerStart?.());}
  if(t.matches("[data-timer-stop]")){focusKey="timer-start";return run(()=>opts.onTimerStop?.());}
  if(t.matches("[data-timer-away]"))return run(()=>opts.onTimerAway?.(t.dataset.timerAway));
 });
 return {el:card,update,tick,
  /** Bring the card into view (the former 보컬 트레이닝 addresses and "연습은 오늘 탭에서 해요" lead here). */
  show(){card.scrollIntoView({block:"start"});$("#vz-practice-title")?.focus({preventScroll:true});card.classList.add("is-shown");setTimeout(()=>card.classList.remove("is-shown"),1600);return true;}};
}
