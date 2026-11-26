/* Direct integration of the approved home HTML, including its circular quick action.
 * Demo scripts/dialogs stay inert; only root markup and style blocks are used. */
import {createTodayCard,TODAY_CARD_CSS} from './today-card-html.js?v=today1-20261126';
export const FLOATING_HOME_SOURCE = "4985592d5e93a09ba1300cf57ba4eee866db531b";
const tokenAsset=new URL("./tokens.css?v=14",import.meta.url);
const asset=new URL("./Vocalzip_Floating_Record_Home.html?v="+FLOATING_HOME_SOURCE.slice(0,12),import.meta.url);
let sourcePromise;
async function source(){
 if(!sourcePromise)sourcePromise=Promise.all([fetch(asset,{cache:"force-cache"}),fetch(tokenAsset,{cache:"force-cache"})]).then(async ([response,tokenResponse])=>{
  if(!tokenResponse.ok)throw Error("공통 디자인 기준을 불러오지 못했어요.");
  const tokens=await tokenResponse.text();
  if(!response.ok)throw Error("홈 HTML을 불러오지 못했어요.");
  const doc=new DOMParser().parseFromString(await response.text(),"text/html");
  const root=doc.querySelector("#vocalzip-refined-preview");
  if(!root||root.querySelectorAll(".vz-nav-item").length!==4||!root.querySelector(".vz-floating-record"))throw Error("홈 HTML 구성을 확인해 주세요.");
  return {tokens,root,styles:[...doc.querySelectorAll("style")].map(s=>s.textContent.replace(/@import\s+url\([^;]*\);/g,""))};
 }).catch(error=>{sourcePromise=null;throw error;});
 return sourcePromise;
}
const num=value=>Number.isFinite(Number(value))?Math.max(0,Number(value)):0;
const daysText=value=>value==null||typeof value==="boolean"||!Number.isFinite(Number(value))?"":Number(value)===0?"D-day":Number(value)>0?"D-"+value:"D+"+Math.abs(value);
const duration=value=>{const n=Math.round(num(value));return n>=60?Math.floor(n/60)+"시간"+(n%60?" "+n%60+"분":""):n+"분";};
function el(tag,text,className){const e=document.createElement(tag);if(text!=null)e.textContent=text;if(className)e.className=className;return e;}
function action(element,label,fn){
 element.setAttribute("role","button");element.tabIndex=0;element.setAttribute("aria-label",label);
 element.onclick=()=>fn?.();
 element.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();fn?.();}};
}
const adaptations=String.raw`
/* v4 home (VOCALZIP_DESIGN_SYSTEM_V4_2026-11-12.md): date/streak line, Home summary rows, recent-song pills, goal limit. */
#vocalzip-refined-preview .vz-today-line{display:flex;align-items:center;gap:10px;margin:0 4px 8px;font-size:13px;line-height:18px;font-weight:600;color:var(--vz-color-ink-secondary,#475467);}
#vocalzip-refined-preview .vz-today-streak{display:inline-flex;align-items:center;gap:3px;color:var(--vz-color-ink-muted,#667085);}
#vocalzip-refined-preview .vz-today-streak[data-active="true"]{color:var(--vz-color-flame,#ba7d52);}
#vocalzip-refined-preview .vz-today-streak .vz-ui-icon{width:16px;height:16px;font-size:16px;}
/* 큰 단계 (app/levels.js): "Lv 3 · 이름" over a thin bar to the next level, at the end of the date line. A 44px target
 * of its own: with it the line is 44px high (and gives up its bottom margin), so the chip's box touches neither the
 * bell and profile buttons above nor the cards below. */
#vocalzip-refined-preview .vz-today-line.has-level{min-height:44px;margin-bottom:0;}
#vocalzip-refined-preview .vz-today-level{display:inline-flex;flex-direction:column;justify-content:center;align-items:stretch;gap:3px;box-sizing:border-box;min-width:44px;max-width:62%;height:44px;margin:0 0 0 auto;padding:0 2px;border:0;border-radius:10px;background:none;color:var(--vz-color-accent,#7A32F5);font:inherit;font-weight:700;letter-spacing:-.01em;text-align:right;cursor:pointer;-webkit-tap-highlight-color:transparent;}
#vocalzip-refined-preview .vz-today-level[hidden]{display:none;}
#vocalzip-refined-preview .vz-today-level:focus-visible{outline:2px solid var(--vz-color-accent,#7A32F5);outline-offset:-2px;}
#vocalzip-refined-preview .vz-today-level-text{display:block;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
#vocalzip-refined-preview .vz-today-level-bar{display:block;height:3px;border-radius:99px;background:#e3d4ff;overflow:hidden;}
#vocalzip-refined-preview .vz-today-level-bar i{display:block;height:100%;border-radius:99px;background:var(--vz-color-accent,#7A32F5);}
#vocalzip-refined-preview .vz-summary{display:block;margin:12px 0 0;padding:4px 12px 4px 16px;border-radius:20px;background:#fff;}
#vocalzip-refined-preview .vz-summary[hidden],#vocalzip-refined-preview .vz-recent[hidden],#vocalzip-refined-preview .vz-schedule[hidden]{display:none;}
#vocalzip-refined-preview .vz-summary-row{display:flex;align-items:center;gap:12px;width:100%;min-height:52px;margin:0;padding:0;border:0;background:none;color:var(--vz-color-ink,#101828);font:inherit;text-align:left;cursor:pointer;}
#vocalzip-refined-preview div.vz-summary-row{cursor:default;}
#vocalzip-refined-preview .vz-summary-row+.vz-summary-row{border-top:1px solid #F2EFF7;}
#vocalzip-refined-preview .vz-summary-row>.vz-ui-icon:first-child{flex:none;width:20px;font-size:20px;color:var(--vz-color-accent,#7A32F5);}
#vocalzip-refined-preview .vz-summary-row[data-row="stage"]>.vz-ui-icon:first-child{color:#8063B0;}
#vocalzip-refined-preview .vz-summary-row[data-tone="attention"]>.vz-ui-icon:first-child,#vocalzip-refined-preview .vz-summary-row[data-tone="attention"] .vz-summary-badge{color:var(--vz-color-warning,#B26A00);}
#vocalzip-refined-preview .vz-summary-copy{display:flex;align-items:baseline;gap:8px;flex:1;min-width:0;}
#vocalzip-refined-preview .vz-summary-copy strong{flex:none;font-size:14px;line-height:20px;font-weight:600;}
#vocalzip-refined-preview .vz-summary-value{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px;font-weight:400;color:#475467;}
#vocalzip-refined-preview .vz-summary-badge{flex:none;font-size:13px;line-height:18px;font-weight:700;color:var(--vz-color-accent,#7A32F5);}
#vocalzip-refined-preview .vz-summary-row[data-tone="done"] .vz-summary-badge{color:var(--vz-color-success,#23855C);}
#vocalzip-refined-preview .vz-summary-row>.vz-ui-icon:last-child:not(:first-child){flex:none;font-size:15px;color:#98A2B3;}
#vocalzip-refined-preview .vz-summary-row:focus-visible{outline:2px solid #DCC4FF;outline-offset:2px;border-radius:12px;}
/* 오늘 · 이번 주 row: two lines on phones (오늘 line, 이번 주 line). Numbers wrap as whole groups and are never cut:
 * at 320px the 이번 주 line breaks before "/ 목표 …" so the week percentage stays beside the whole row. */
#vocalzip-refined-preview .vz-summary-row[data-lines="2"]{display:grid;grid-template-columns:20px minmax(0,1fr) auto auto;grid-template-areas:"icon line badge chev" "icon sub badge chev";gap:2px 12px;align-items:center;align-content:center;min-height:64px;padding:9px 0;}
#vocalzip-refined-preview .vz-summary-row[data-lines="2"]>.vz-ui-icon:first-child{grid-area:icon;}
#vocalzip-refined-preview .vz-summary-row[data-lines="2"]>.vz-summary-copy{display:contents;}
#vocalzip-refined-preview .vz-summary-row[data-lines="2"] .vz-summary-line{grid-area:line;display:flex;align-items:baseline;gap:6px;min-width:0;}
#vocalzip-refined-preview .vz-summary-row[data-lines="2"] .vz-summary-value{overflow:visible;white-space:nowrap;font-variant-numeric:tabular-nums;}
#vocalzip-refined-preview .vz-summary-sep{display:none;}
#vocalzip-refined-preview .vz-summary-sub{grid-area:sub;min-width:0;font-size:13px;line-height:18px;font-weight:400;color:var(--vz-color-ink-muted,#667085);font-variant-numeric:tabular-nums;}
#vocalzip-refined-preview .vz-summary-sub>span{white-space:nowrap;}
#vocalzip-refined-preview .vz-summary-row[data-lines="2"]>.vz-summary-badge{grid-area:badge;}
#vocalzip-refined-preview .vz-summary-row[data-lines="2"]>.vz-ui-icon:last-child{grid-area:chev;}
#vocalzip-refined-preview .vz-recent{margin:16px 0 12px;}
#vocalzip-refined-preview .vz-recent-heading{margin:0 4px 8px;font-size:15px;line-height:21px;font-weight:600;color:var(--vz-color-ink,#101828);}
#vocalzip-refined-preview .vz-recent-pills{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:0 0 2px;}
#vocalzip-refined-preview .vz-recent-pills::-webkit-scrollbar{display:none;}
#vocalzip-refined-preview .vz-recent-pill{display:inline-flex;align-items:center;gap:6px;flex:none;max-width:72%;min-height:44px;padding:0 16px 0 14px;border:0;border-radius:999px;background:#fff;color:var(--vz-color-ink,#101828);font:inherit;font-size:14px;line-height:20px;font-weight:600;cursor:pointer;}
#vocalzip-refined-preview .vz-recent-pill span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#vocalzip-refined-preview .vz-recent-pill .vz-ui-icon{flex:none;font-size:18px;color:var(--vz-color-accent,#7A32F5);}
#vocalzip-refined-preview .vz-recent-pill:focus-visible{outline:2px solid #DCC4FF;outline-offset:2px;}
#vocalzip-refined-preview .vz-pick-words{display:grid;min-width:0;text-align:left;}
#vocalzip-refined-preview .vz-pick-head{display:flex;align-items:center;justify-content:space-between;gap:8px;}
#vocalzip-refined-preview .vz-pick-head .vz-recent-heading{flex:1;}
#vocalzip-refined-preview .vz-pick-random{flex:none;min-height:36px;margin:0 0 8px;padding:0 14px;border:0;border-radius:999px;background:var(--vz-color-accent-soft,#F1EAFF);color:var(--vz-color-accent,#7A32F5);font:inherit;font-size:14px;font-weight:700;cursor:pointer;}
#vocalzip-refined-preview .vz-pick-random::before{content:"🎲 ";}
#vocalzip-refined-preview .vz-pick-words>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#vocalzip-refined-preview .vz-pick-why{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;line-height:16px;font-weight:500;color:var(--vz-color-ink-muted,#667085);}
#vocalzip-refined-preview .vz-recent-pill.vz-pick-pill{min-height:56px;border-radius:18px;padding:8px 16px 8px 14px;}
#vocalzip-refined-preview .vz-week{touch-action:pan-y;}
#vocalzip-refined-preview .vz-week .vz-time[data-target-met="true"] b,#vocalzip-refined-preview .vz-week .vz-time[data-target-met="true"]>span{color:var(--vz-color-accent);}
#vocalzip-refined-preview .vz-week-nav{display:grid;grid-template-columns:44px minmax(0,1fr) 44px;align-items:center;margin:12px 0 0;min-height:var(--vz-touch-min);background:transparent;}
#vocalzip-refined-preview .vz-week-nav button{display:grid;place-items:center;width:44px;height:44px;border:0;border-radius:50%;background:radial-gradient(circle at center,#f2f4f7 0 16px,transparent 16.5px);color:var(--ink-2,#5f5a74);cursor:pointer;padding:0;}
#vocalzip-refined-preview .vz-week-nav button:disabled{color:#c7bfd2;cursor:default;opacity:.5;}
#vocalzip-refined-preview .vz-week-nav button svg{width:18px;height:18px;stroke:currentColor;stroke-width:1.8;fill:none;stroke-linecap:round;stroke-linejoin:round;}
#vocalzip-refined-preview .vz-week-nav .vz-week-range{text-align:center;white-space:nowrap;line-height:1.25;}
#vocalzip-refined-preview .vz-week-year{display:block;color:var(--vz-color-ink-muted);font-size:11px;font-weight:400;}
#vocalzip-refined-preview .vz-week-dates{display:block;color:var(--vz-color-ink-secondary);font-size:14px;font-weight:600;letter-spacing:.01em;font-variant-numeric:tabular-nums;margin-top:2px;}
#vocalzip-refined-preview .vz-days{margin-top:14px;}
#vocalzip-refined-preview .vz-days>div{min-height:80px;cursor:pointer;}
#vocalzip-refined-preview .vz-days>div>span:first-child{font-size:15px;font-weight:600;line-height:22px;color:var(--vz-color-primary);}
#vocalzip-refined-preview .vz-days>div.vz-saturday>span:first-child{color:#617596;}
#vocalzip-refined-preview .vz-days>div.vz-sunday>span:first-child{color:#a96171;}
#vocalzip-refined-preview .vz-days>div.vz-today>span:first-child{color:var(--vz-color-accent);}
/* Daily mark: filled when the day's time target is met, checked when every goal of that day is done. */
#vocalzip-refined-preview .vz-day-dot.time-met{background:var(--vz-color-accent);color:#fff;border:0;}
#vocalzip-refined-preview .vz-day-dot.goals-complete{background:#9872e2;color:#fff;border:0;}
#vocalzip-refined-preview .vz-day-dot.goals-complete.time-met{background:#641fcb;}
#vocalzip-refined-preview .vz-streak{color:var(--vz-color-ink-muted);margin-left:0;}
#vocalzip-refined-preview .vz-streak[data-active="true"]{color:var(--vz-color-accent);}
#vocalzip-refined-preview .vz-streak svg{width:22px;height:22px;}
#vocalzip-refined-preview .vz-week-meta{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:6px;box-sizing:border-box;min-height:47px;border-top:1px solid #ece6f4;margin-top:8px;padding-top:10px;}
#vocalzip-refined-preview .vz-week-meta>span{display:flex;align-items:center;gap:3px;min-height:36px;white-space:nowrap;}
#vocalzip-refined-preview .vz-week .vz-empty-action{min-height:36px;}
#vocalzip-refined-preview .vz-week [role=button]:focus-visible,#vocalzip-refined-preview .vz-week button:focus-visible{outline:var(--vz-focus-width) solid var(--vz-color-focus);outline-offset:var(--vz-focus-offset);}

:host{display:block;width:100%;background:var(--vz-color-canvas);}
/* Use the device width rather than leaving a 390px mock phone inside wider phones. */
#vocalzip-refined-preview .vz-phone{max-width:var(--vz-content-max);padding:8px 12px 0;padding-top:max(8px,env(safe-area-inset-top));}
#vocalzip-refined-preview .vz-nav-item.vz-active{background:var(--vz-color-selected-bg);}
#vocalzip-refined-preview .vz-ui-icon{display:inline-grid;place-items:center;width:20px;height:20px;flex:none;font-family:"Phosphor";font-style:normal;font-weight:400;font-size:20px;line-height:1;color:inherit;}
#vocalzip-refined-preview .vz-streak .vz-ui-icon,#vocalzip-refined-preview .vz-song-label .vz-ui-icon{width:13px;height:13px;font-size:13px;}
#vocalzip-refined-preview .vz-card .vz-title>.vz-ui-icon:first-child,#vocalzip-refined-preview .vz-shortcut>span>.vz-ui-icon{color:inherit;}
#vocalzip-refined-preview .vz-art-front .vz-ui-icon{width:28px;height:28px;font-size:28px;color:#fff;}
#vocalzip-refined-preview .vz-nav{background:var(--vz-nav-surface,rgba(255,255,255,.58));}
@media(prefers-reduced-transparency:reduce),(prefers-contrast:more){#vocalzip-refined-preview .vz-nav{background:#fff;backdrop-filter:none;-webkit-backdrop-filter:none;}}
#vocalzip-refined-preview .vz-nav-item i{display:block;font:normal 22px/1 "Phosphor";color:var(--vz-color-ink-secondary);letter-spacing:0;}
#vocalzip-refined-preview .vz-nav-item.vz-active i{color:var(--vz-color-accent);}
#vocalzip-refined-preview .vz-floating-record i{display:block;font:normal 22px/1 "Phosphor";color:inherit;}
#vocalzip-refined-preview .vz-header{min-height:var(--vz-touch-min);margin-bottom:8px;}
#vocalzip-refined-preview .vz-header-actions button{position:relative;}
#vocalzip-refined-preview .vz-bell-dot{position:absolute;top:11px;right:11px;width:8px;height:8px;border-radius:50%;background:var(--vz-color-warning,#B26A00);box-shadow:0 0 0 2px var(--vz-color-canvas,#f8f6fd);}
#vocalzip-refined-preview .vz-bell-dot[hidden]{display:none;}
#vocalzip-refined-preview .vz-logo{font-size:var(--vz-type-page-size);line-height:var(--vz-type-page-leading);gap:8px;}
#vocalzip-refined-preview .vz-logo b{font-weight:700;}
#vocalzip-refined-preview .vz-logo svg{width:28px;height:28px;}
#vocalzip-refined-preview .vz-schedule{padding:0 0 8px;}
#vocalzip-refined-preview .vz-card{padding:16px;}
#vocalzip-refined-preview .vz-song{background:linear-gradient(135deg,#E8D8FF 0%,#EFE3FF 52%,#F5EDFF 100%);}
#vocalzip-refined-preview .vz-song h3{max-width:none;}
#vocalzip-refined-preview main{padding-bottom:calc(var(--vz-page-bottom) + max(var(--vz-nav-bottom),env(safe-area-inset-bottom)));}
#vocalzip-refined-preview .vz-nav-space{max-width:var(--vz-nav-max-width);}
#vocalzip-refined-preview .vz-floating-record{right:max(var(--vz-nav-inset),calc((100vw - var(--vz-content-max))/2 + var(--vz-nav-inset)));}
.vz-visually-hidden{position:absolute!important;width:1px!important;height:1px!important;margin:-1px!important;padding:0!important;border:0!important;clip:rect(0,0,0,0)!important;overflow:hidden!important;white-space:nowrap!important;}
#vocalzip-refined-preview [role=button]{cursor:pointer;}
#vocalzip-refined-preview [role=button]:focus-visible{outline:var(--vz-focus-width) solid var(--vz-color-focus);outline-offset:var(--vz-focus-offset);}
#vocalzip-refined-preview .vz-event-row{min-height:var(--vz-touch-min);}
#vocalzip-refined-preview .vz-title[role=button],#vocalzip-refined-preview .vz-song h3[role=button]{position:relative;}
#vocalzip-refined-preview .vz-title[role=button]::after,#vocalzip-refined-preview .vz-song h3[role=button]::before{content:"";position:absolute;left:0;right:0;top:50%;height:max(100%,44px);transform:translateY(-50%);}
#vocalzip-refined-preview .vz-card-heading{flex-wrap:wrap;}
#vocalzip-refined-preview .vz-dday{flex:none;white-space:nowrap;}
#vocalzip-refined-preview .vz-event-heading h2{min-width:0;}
#vocalzip-refined-preview .vz-listen{min-width:0;white-space:normal;}
#vocalzip-refined-preview .vz-event-content,#vocalzip-refined-preview .vz-event-heading,#vocalzip-refined-preview .vz-title,#vocalzip-refined-preview .vz-shortcut>span{min-width:0;}
#vocalzip-refined-preview .vz-event h2{word-break:keep-all;overflow-wrap:anywhere;line-height:1.33333333;}
#vocalzip-refined-preview .vz-card h2{line-height:1.44444444;}
#vocalzip-refined-preview .vz-song{aspect-ratio:auto;}
#vocalzip-refined-preview .vz-song h3{line-height:1.27777778;}
#vocalzip-refined-preview .vz-time b{line-height:1.14285714;}
#vocalzip-refined-preview .vz-day-minutes{line-height:1.45454545;}
#vocalzip-refined-preview .vz-event-row strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#vocalzip-refined-preview .vz-shortcut strong{min-width:0;white-space:normal;overflow-wrap:anywhere;}
/* 지금 할 것 › "다음 연습 n개 더": the whole 다음 연습 list (#/next-practice), under the card. */
#vocalzip-refined-preview .vz-now-more{display:flex;align-items:center;justify-content:flex-end;gap:4px;min-height:44px;margin:-8px 0 0 auto;padding:0 4px;border:0;background:none;color:var(--vz-color-accent);font:inherit;font-size:13px;font-weight:700;cursor:pointer;}
#vocalzip-refined-preview .vz-now-more[hidden]{display:none;}
#vocalzip-refined-preview .vz-now-more:focus-visible{outline:2px solid var(--vz-color-accent);outline-offset:-2px;border-radius:10px;}
/* 연습하기: one compact card of the things you do. Rows follow the Home summary rows recipe (white R20, 20px accent
 * icon, 14/20 name + state, chevron); each row is a 48px target. */
#vocalzip-refined-preview .vz-practice{display:block;padding:14px 12px 6px 16px;border-radius:20px;background:#fff;scroll-margin-top:12px;}
#vocalzip-refined-preview .vz-practice[hidden]{display:none;}
#vocalzip-refined-preview .vz-practice-title{margin:0 0 4px;font-size:15px;line-height:21px;font-weight:600;color:var(--vz-color-ink,#101828);outline:none;}
#vocalzip-refined-preview .vz-practice-row{display:flex;align-items:center;gap:12px;width:100%;min-height:48px;margin:0;padding:0;border:0;background:none;color:var(--vz-color-ink,#101828);font:inherit;text-align:left;cursor:pointer;}
#vocalzip-refined-preview .vz-practice-row+.vz-practice-row{border-top:1px solid #F2EFF7;}
#vocalzip-refined-preview .vz-practice-row>.vz-ui-icon:first-child{flex:none;width:20px;font-size:20px;color:var(--vz-color-accent,#7A32F5);}
#vocalzip-refined-preview .vz-practice-row>.vz-ui-icon:last-child{flex:none;font-size:15px;color:#98A2B3;}
#vocalzip-refined-preview .vz-practice-copy{display:flex;align-items:baseline;gap:8px;flex:1;min-width:0;}
#vocalzip-refined-preview .vz-practice-copy strong{flex:none;font-size:14px;line-height:20px;font-weight:600;}
#vocalzip-refined-preview .vz-practice-copy small{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:20px;color:var(--vz-color-ink-secondary,#475467);font-variant-numeric:tabular-nums;}
#vocalzip-refined-preview .vz-practice-row[data-tone="done"] small{color:var(--vz-color-success,#23855C);}
#vocalzip-refined-preview .vz-practice-row[data-tone="live"] small{color:var(--vz-color-accent,#7A32F5);font-weight:600;}
#vocalzip-refined-preview .vz-practice-row:active{background:#F7F5FB;}
#vocalzip-refined-preview .vz-practice-row:focus-visible{outline:2px solid #DCC4FF;outline-offset:2px;border-radius:12px;}
#vocalzip-refined-preview .vz-practice.is-shown{box-shadow:0 0 0 2px #DCC4FF;}
/* 오늘의 연습 card: the first thing in 연습하기 — today's steps as a vertical timeline, the progress, ONE button. */
#vocalzip-refined-preview .vz-set-card{display:block;padding:0 4px 12px 0;}
#vocalzip-refined-preview .vz-set-card+.vz-practice-row{border-top:1px solid #F2EFF7;}
#vocalzip-refined-preview .vz-set-head{display:flex;align-items:center;gap:8px;min-height:44px;}
#vocalzip-refined-preview .vz-set-head strong{flex:none;font-size:15px;line-height:21px;font-weight:700;color:var(--vz-color-ink,#101828);}
#vocalzip-refined-preview .vz-set-head small{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:20px;color:var(--vz-color-ink-secondary,#475467);font-variant-numeric:tabular-nums;}
#vocalzip-refined-preview .vz-set-card[data-state="live"] .vz-set-head small{color:var(--vz-color-accent,#7A32F5);font-weight:600;}
#vocalzip-refined-preview .vz-set-card[data-state="done"] .vz-set-head small{color:var(--vz-color-accent,#7A32F5);font-weight:600;}
#vocalzip-refined-preview .vz-set-pick{flex:none;display:inline-flex;align-items:center;gap:4px;min-width:44px;min-height:44px;margin:0;padding:0 8px;border:0;border-radius:12px;background:none;color:var(--vz-color-accent,#7A32F5);font:inherit;font-size:14px;line-height:20px;font-weight:600;cursor:pointer;}
#vocalzip-refined-preview .vz-set-pick .vz-ui-icon{font-size:16px;}
#vocalzip-refined-preview .vz-set-line{list-style:none;margin:0 0 12px;padding:0;}
#vocalzip-refined-preview .vz-set-line li{position:relative;display:flex;align-items:center;gap:8px;min-height:36px;padding-left:28px;}
#vocalzip-refined-preview .vz-set-line li::before{content:"";position:absolute;z-index:1;left:3px;top:50%;box-sizing:border-box;width:14px;height:14px;margin-top:-7px;border:2px solid #D0D5DD;border-radius:50%;background:#fff;}
#vocalzip-refined-preview .vz-set-line li::after{content:"";position:absolute;left:9px;top:-50%;width:2px;height:100%;background:#E8E4F0;}
#vocalzip-refined-preview .vz-set-line li:first-child::after{display:none;}
#vocalzip-refined-preview .vz-set-line li[data-state="done"]::before{border-color:var(--vz-color-accent,#7A32F5);background:var(--vz-color-accent,#7A32F5) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 14 14'%3E%3Cpath d='M3.2 7.3l2.4 2.3 5-5.2' fill='none' stroke='%23fff' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center/10px 10px no-repeat;}
#vocalzip-refined-preview .vz-set-line li[data-state="done"]::after,#vocalzip-refined-preview .vz-set-line li[data-state="skipped"]::after,#vocalzip-refined-preview .vz-set-line li[data-state="next"]:not(:first-child)::after{background:#C9B2F7;}
#vocalzip-refined-preview .vz-set-line li[data-state="skipped"]::before{border-color:#C9B2F7;border-style:dashed;}
#vocalzip-refined-preview .vz-set-line li[data-state="next"]::before{border-color:var(--vz-color-accent,#7A32F5);box-shadow:0 0 0 4px #F3ECFF;}
#vocalzip-refined-preview .vz-set-item{flex:1;min-width:0;display:flex;align-items:baseline;gap:6px;}
#vocalzip-refined-preview .vz-set-item b{flex:none;font-size:12px;line-height:18px;font-weight:600;color:var(--vz-color-ink-muted,#667085);}
#vocalzip-refined-preview .vz-set-item span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px;font-weight:600;color:var(--vz-color-ink,#101828);}
#vocalzip-refined-preview .vz-set-line li[data-state="done"] .vz-set-item span,#vocalzip-refined-preview .vz-set-line li[data-state="skipped"] .vz-set-item span{color:var(--vz-color-ink-muted,#667085);font-weight:500;}
#vocalzip-refined-preview .vz-set-meta{flex:none;display:flex;align-items:center;gap:6px;font-size:13px;line-height:20px;color:var(--vz-color-ink-secondary,#475467);font-variant-numeric:tabular-nums;}
#vocalzip-refined-preview .vz-set-meta .vz-ui-icon{font-size:14px;color:var(--vz-color-accent,#7A32F5);}
#vocalzip-refined-preview .vz-set-meta em{font-style:normal;font-size:12px;font-weight:700;color:var(--vz-color-accent,#7A32F5);}
#vocalzip-refined-preview .vz-set-line li[data-state="done"] .vz-set-meta em{color:var(--vz-color-accent,#7A32F5);}
#vocalzip-refined-preview .vz-set-line li[data-state="skipped"] .vz-set-meta em{color:var(--vz-color-ink-muted,#667085);}
#vocalzip-refined-preview .vz-set-go{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:56px;margin:0;padding:0 16px;border:0;border-radius:16px;background:var(--vz-gradient-floating,linear-gradient(135deg,#9557FF 0%,#7A32F5 52%,#6D2BE5 100%));color:#fff;font:inherit;font-size:16px;line-height:22px;font-weight:700;letter-spacing:-.01em;cursor:pointer;}
#vocalzip-refined-preview .vz-set-go span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#vocalzip-refined-preview .vz-set-go .vz-ui-icon{flex:none;font-size:18px;}
#vocalzip-refined-preview .vz-set-card[data-state="done"] .vz-set-go{background:#F3ECFF;color:var(--vz-color-accent,#7A32F5);}
#vocalzip-refined-preview .vz-set-go:active{transform:scale(.99);}
#vocalzip-refined-preview .vz-set-go:focus-visible,#vocalzip-refined-preview .vz-set-pick:focus-visible{outline:2px solid #DCC4FF;outline-offset:2px;}
@media(prefers-reduced-motion:reduce){#vocalzip-refined-preview .vz-set-go:active{transform:none;}}
@media(max-width:355px){#vocalzip-refined-preview .vz-practice-copy{flex-direction:column;align-items:flex-start;gap:0;padding:6px 0;}#vocalzip-refined-preview .vz-practice-copy small{max-width:100%;}}
@media(max-width:355px){#vocalzip-refined-preview .vz-event h2{line-height:1.45454545;}#vocalzip-refined-preview .vz-card h2{line-height:1.625;}}
/* Wide screens (after the rules above so it wins): two columns. */
#vocalzip-refined-preview .vz-col{display:contents;}
#vocalzip-refined-preview .vz-col>.vz-card{margin-bottom:12px;}
#vocalzip-refined-preview .vz-col-side>.vz-week{display:none;}
@media (min-width:768px){
 #vocalzip-refined-preview .vz-phone{max-width:min(1040px,100%);}
 #vocalzip-refined-preview main{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);column-gap:20px;align-items:start;}
 #vocalzip-refined-preview main>.vz-today-line{grid-column:1/-1;}
 #vocalzip-refined-preview .vz-col{display:block;min-width:0;}
 #vocalzip-refined-preview .vz-col-side>.vz-summary{margin-top:0;}
 /* Tablets: the full 주간 연습 card (rings, arrows) replaces the one-line 이번 주 row, and everything reads larger. */
 #vocalzip-refined-preview .vz-col-side>.vz-week{display:block;}
 #vocalzip-refined-preview .vz-summary-row[data-row="week"]{display:none;}
 #vocalzip-refined-preview .vz-col>.vz-card{margin-bottom:16px;padding:24px;border-radius:24px;}
 #vocalzip-refined-preview .vz-today-line{margin-bottom:12px;font-size:15px;line-height:22px;}
 #vocalzip-refined-preview .vz-today-line.has-level{margin-bottom:0;}
 #vocalzip-refined-preview .vz-event{min-height:120px;margin-bottom:16px;padding:24px 28px;}
 #vocalzip-refined-preview .vz-event h2{font-size:28px;line-height:36px;}
 #vocalzip-refined-preview .vz-event p{font-size:16px;line-height:24px;}
 #vocalzip-refined-preview .vz-week h2{font-size:20px;line-height:28px;}
 #vocalzip-refined-preview .vz-summary{padding:8px 20px 8px 24px;}
 #vocalzip-refined-preview .vz-summary-row{min-height:64px;gap:14px;}
 #vocalzip-refined-preview .vz-summary-copy strong,#vocalzip-refined-preview .vz-summary-value{font-size:16px;line-height:24px;}
 #vocalzip-refined-preview .vz-summary-badge{font-size:15px;line-height:22px;}
 #vocalzip-refined-preview .vz-summary-row>.vz-ui-icon:first-child{width:24px;font-size:24px;}
 #vocalzip-refined-preview .vz-col>.vz-practice{padding:20px 20px 12px 24px;}
 #vocalzip-refined-preview .vz-practice-title{margin-bottom:6px;font-size:20px;line-height:28px;}
 #vocalzip-refined-preview .vz-practice-row{min-height:60px;gap:14px;}
 #vocalzip-refined-preview .vz-practice-copy strong{font-size:16px;line-height:24px;}
 #vocalzip-refined-preview .vz-practice-copy small{font-size:15px;line-height:22px;}
 #vocalzip-refined-preview .vz-practice-row>.vz-ui-icon:first-child{width:24px;font-size:24px;}
 #vocalzip-refined-preview .vz-recent{margin-top:20px;}
 #vocalzip-refined-preview .vz-recent-heading{margin-bottom:10px;font-size:18px;line-height:26px;}
 #vocalzip-refined-preview .vz-recent-pills{flex-wrap:wrap;gap:10px;overflow:visible;}
 #vocalzip-refined-preview .vz-recent-pill{min-height:52px;max-width:100%;padding:0 20px 0 16px;font-size:16px;line-height:24px;}
 #vocalzip-refined-preview .vz-recent-pill .vz-ui-icon{font-size:20px;}
 #vocalzip-refined-preview .vz-week .vz-time b{font-size:34px;line-height:38px;}
 #vocalzip-refined-preview .vz-week .vz-days{gap:6px;margin-top:22px;}
 #vocalzip-refined-preview .vz-week .vz-days>div>span:first-child{font-size:18px;line-height:24px;}
 #vocalzip-refined-preview .vz-week .vz-day-dot{width:32px;height:32px;}
 #vocalzip-refined-preview .vz-week .vz-day-dot svg{width:18px;height:18px;}
 #vocalzip-refined-preview .vz-week .vz-day-minutes{font-size:13px;line-height:18px;min-height:18px;}
 #vocalzip-refined-preview .vz-week .vz-week-dates{font-size:16px;}
 #vocalzip-refined-preview .vz-week-meta>span{font-size:14px;}
 #vocalzip-refined-preview .vz-floating-record{right:max(var(--vz-nav-inset),calc((100vw - 1040px)/2 + var(--vz-nav-inset)));}
}
`;
export async function createFloatingHome(opts={}){
 const template=await source(),host=el("section");host.className="vz-student-home";host.dataset.sourceBlob=FLOATING_HOME_SOURCE;host.setAttribute("aria-label","학생 홈");
 const shadow=host.attachShadow({mode:"open"});
 template.styles.forEach((css,i)=>{const style=el("style",css);style.dataset.sourceStyle=String(i);shadow.append(style);});
 const tokenStyle=el("style",template.tokens);tokenStyle.dataset.sharedTokens="true";shadow.append(tokenStyle);
 const integration=el("style",adaptations);integration.dataset.integration="accessibility";shadow.append(integration);
 const todayStyle=el("style",TODAY_CARD_CSS);todayStyle.dataset.integration="today";shadow.append(todayStyle);
 const root=document.importNode(template.root,true);root.setAttribute("aria-label","Vocalzip 홈");shadow.append(root);
 // Extend only the rendered dock; keep the approved HTML file untouched.
 // On home, the ordinary .v-nav is hidden in favor of this shadow-root dock.
 const dock=root.querySelector('.vz-nav');
 // v4 IA (docs/design/VOCALZIP_DESIGN_SYSTEM_V4_2026-11-12.md): four tabs 오늘 · 내 곡 · 기록 · 성장.
 // The approved source still has 홈 · 내 곡 · 보관함 · 일정, so relabel in place; 보관함 lives under 내 곡 › 전체 녹음.
 [...(dock?.querySelectorAll('.vz-nav-item')||[])].forEach((button,i)=>{const label=button.querySelector('span');if(label)label.textContent=['오늘','내 곡','기록','성장'][i];});
 const iconFont=el("style",`@font-face{font-family:"Phosphor";src:url("${new URL('../vendor/phosphor/Phosphor.woff2',import.meta.url)}") format("woff2");font-display:block}#vocalzip-refined-preview .vz-nav-item i::before,#vocalzip-refined-preview .vz-floating-record i::before{content:attr(data-glyph)}`);
 shadow.append(iconFont);
 const sharedShell=el("style",`/* Match the common four-tab dock and circular recording action. */
#vocalzip-refined-preview .vz-phone{background:var(--vz-color-canvas);color:var(--vz-color-ink);font-family:var(--vz-font);letter-spacing:var(--vz-tracking);padding-inline:var(--vz-page-gutter)}
#vocalzip-refined-preview .vz-card{padding:var(--vz-card-padding);border-radius:var(--vz-radius-card)}
#vocalzip-refined-preview .vz-floating-record{background:transparent;color:#5B1FC2;isolation:isolate;box-shadow:0 6px 18px rgba(122,50,245,.26)}#vocalzip-refined-preview .vz-floating-record::before{content:"";position:absolute;inset:-2.5px;border-radius:50%;z-index:-1;background:conic-gradient(from 0deg,#C9AEFB,#7A32F5,#E9DDFF,#9A5BFF,#C9AEFB);animation:vzMicSpin 3.2s linear infinite}#vocalzip-refined-preview .vz-floating-record::after{content:"";position:absolute;inset:0;border-radius:50%;z-index:-1;background:#fff}#vocalzip-refined-preview .vz-floating-record .vz-mic-anim{display:block;width:40px;height:40px;overflow:visible;color:#5B1FC2}#vocalzip-refined-preview .vz-floating-record .vz-mic-body,#vocalzip-refined-preview .vz-floating-record .vz-mic-wave{transform-box:fill-box;transform-origin:center}#vocalzip-refined-preview .vz-floating-record .vz-mic-body{animation:vzMicBob 1.6s ease-in-out infinite}#vocalzip-refined-preview .vz-floating-record .vz-mic-wave{stroke:#9A5BFF;animation:vzMicWave 1.6s ease-out infinite}#vocalzip-refined-preview .vz-floating-record .vz-mic-wave2{animation-delay:.5s}@keyframes vzMicSpin{to{transform:rotate(360deg)}}@keyframes vzMicBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.2px)}}@keyframes vzMicWave{0%{opacity:0;transform:scale(.6)}30%{opacity:1}100%{opacity:0;transform:scale(1.25)}}@media(prefers-reduced-motion:reduce){#vocalzip-refined-preview .vz-floating-record::before,#vocalzip-refined-preview .vz-floating-record .vz-mic-body,#vocalzip-refined-preview .vz-floating-record .vz-mic-wave{animation:none}#vocalzip-refined-preview .vz-floating-record .vz-mic-wave2{opacity:0}}
#vocalzip-refined-preview .vz-nav{box-sizing:border-box;height:var(--vz-nav-height);padding:var(--vz-nav-padding);border:1px solid var(--vz-nav-border,rgba(255,255,255,.68));border-radius:999px;background:var(--vz-nav-surface,rgba(255,255,255,.58));box-shadow:var(--vz-nav-shadow,0 5px 20px rgba(55,33,85,.045));-webkit-backdrop-filter:blur(var(--vz-nav-blur,24px));backdrop-filter:blur(var(--vz-nav-blur,24px))}
#vocalzip-refined-preview .vz-nav{grid-template-columns:repeat(4,minmax(0,1fr));}\n#vocalzip-refined-preview .vz-nav-item{box-sizing:border-box;height:var(--vz-nav-item-height);min-height:var(--vz-nav-item-height);gap:2px;border-radius:999px;font-size:var(--vz-type-nav-size);font-weight:var(--vz-font-medium)}
#vocalzip-refined-preview .vz-nav-item.vz-active{background:var(--vz-color-selected-bg);color:var(--vz-nav-active-label);font-weight:600}
#vocalzip-refined-preview .vz-nav-item i{font-size:var(--vz-icon-tool-size)}
#vocalzip-refined-preview .vz-floating-record{width:var(--vz-floating-size);min-width:var(--vz-floating-size);height:var(--vz-floating-size);bottom:calc(max(var(--vz-nav-bottom),env(safe-area-inset-bottom)) + var(--vz-floating-bottom));box-shadow:0 6px 18px rgba(122,50,245,.26)}
@media(prefers-reduced-transparency:reduce),(prefers-contrast:more){#vocalzip-refined-preview .vz-nav{background:#fff;-webkit-backdrop-filter:none;backdrop-filter:none}}
`);
 shadow.append(sharedShell);
 [...root.querySelectorAll('.vz-nav-item')].forEach((button,i)=>{
  const svg=button.querySelector('svg');if(!svg)return;
  const icon=el('i');icon.setAttribute('aria-hidden','true');icon.dataset.glyph=['\ue2c2','\ue340','\ue10a','\ue150'][i];svg.replaceWith(icon);
 });
 root.querySelector('.vz-floating-record svg').outerHTML='<svg class="vz-mic-anim" width="40" height="40" viewBox="-3.5 0.5 31 23" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g class="vz-mic-body"><rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5.5 10.5a6.5 6.5 0 0 0 13 0"/><path d="M12 17v4"/></g><path class="vz-mic-wave" d="M2.5 6.5a8 8 0 0 0 0 9"/><path class="vz-mic-wave" d="M21.5 6.5a8 8 0 0 1 0 9"/><path class="vz-mic-wave vz-mic-wave2" d="M-0.5 4.5a11 11 0 0 0 0 13"/><path class="vz-mic-wave vz-mic-wave2" d="M24.5 4.5a11 11 0 0 1 0 13"/></svg>'; // 소리 물결 마이크 (공통 녹음 버튼과 같은 그림)
 const q=selector=>root.querySelector(selector);
 q("main").setAttribute("role","presentation");
 root.prepend(el("h1","홈","vz-visually-hidden"));
 /* 알림 = only what needs a check (곡 확인 · 분석 실패, from the app as [{key,label,count}]). A small dot on the bell
  * when there is something; the sheet says "확인할 게 없어요" otherwise. */
 const bell=q('[aria-label="알림"]');bell.onclick=()=>opts.onNotifications?.();
 const bellDot=el("span",null,"vz-bell-dot");bellDot.setAttribute("aria-hidden","true");bellDot.hidden=true;bell.append(bellDot);
 host.updateAlerts=items=>{
  const list=Array.isArray(items)?items:[],total=list.reduce((n,i)=>n+num(i?.count),0);
  bellDot.hidden=!total;bell.toggleAttribute("data-has-alert",!!total);
  bell.setAttribute("aria-label",total?"알림, 확인할 것 "+total+"건":"알림");
 };
 host.updateAlerts(opts.alerts);
 // 설정 (화면 지도 정리 후보 5, 2026-11-26): the person icon read as "프로필" and was hard to find as the way to 설정 —
 // it is the same gear and the same name as on the other tabs now. Its action is unchanged (opts.onProfile → 설정).
 const settingsButton=q('[aria-label="프로필"]');settingsButton.setAttribute("aria-label","설정");settingsButton.title="설정";
 settingsButton.onclick=()=>opts.onProfile?.();
 /* v4 home (docs/design/VOCALZIP_DESIGN_SYSTEM_V4_2026-11-12.md, Home order): a small date/streak line, one
  * "지금 할 것" card, up to four goals, one Home summary rows card (next schedule, needs-attention when there is
  * something, this week) and recent songs as pills. The approved markup still supplies the card, goal list and dock;
  * its week rings, event rows and recent-song/shortcut tiles leave home (기록 and 성장 hold those views). */
 const section=q(".vz-schedule"),now=q(".vz-event");
 section.querySelectorAll(".vz-event-row").forEach(e=>e.remove());
 q(".vz-quick-grid")?.remove();const weekCard=q(".vz-week"); // 주간 연습 card: shown on tablets only (CSS)
 const todayLine=el("p",null,"vz-today-line");section.before(todayLine);
 const flame=el("i","","vz-ui-icon");flame.setAttribute("aria-hidden","true");
 /* 큰 단계 next to the streak ({level, name, percent, label} from the app; null hides it): kept and updated in place. */
 const levelChip=el("button",null,"vz-today-level"),levelText=el("span",null,"vz-today-level-text"),levelBar=el("span",null,"vz-today-level-bar"),levelFill=el("i");
 levelChip.type="button";levelChip.dataset.homeLevel="";levelChip.hidden=true;levelBar.setAttribute("aria-hidden","true");levelBar.append(levelFill);levelChip.append(levelText,levelBar);
 levelChip.onclick=()=>opts.onLevel?.();
 host.updateLevel=info=>{
  levelChip.hidden=!info;todayLine.classList.toggle("has-level",!!info);if(!info)return;
  levelText.textContent="Lv "+num(info.level)+" · "+(info.name||"");levelFill.style.width=Math.max(0,Math.min(100,num(info.percent)))+"%";
  levelChip.dataset.level=String(num(info.level));levelChip.setAttribute("aria-label",info.label||"큰 단계 Lv "+num(info.level)+" "+(info.name||"")+", 단계 보기");
 };
 host.updateLevel(opts.level||null);
 host.updateNow=item=>{
  section.hidden=!item;if(!item)return;
  now.dataset.kind=item.kind||"";now.querySelector("h2").textContent=item.title||"";
  const badge=now.querySelector(".vz-dday");badge.textContent=item.badge||"";badge.hidden=!badge.textContent;
  now.querySelector("p").textContent=item.line||"";
  action(now,item.label||item.title||"지금 할 것",item.action);
  // {count, text, action}: the rest of 다음 연습 (the card is its first item, or something else comes first today).
  nowMore.hidden=!item.more;nowMore.onclick=()=>item.more?.action?.();
  if(item.more){const chevron=el("i","\ue13a","vz-ui-icon");chevron.setAttribute("aria-hidden","true");nowMore.replaceChildren(el("span",item.more.text),chevron);nowMore.setAttribute("aria-label",item.more.text+" 보기");}
 };
 const nowMore=el("button",null,"vz-now-more");nowMore.type="button";nowMore.dataset.homeNextMore="";nowMore.hidden=true;now.after(nowMore);
 host.updateNow(opts.now);
 /* 오늘 연습 (owner's design, 2026-11-26): ONE card under 지금 할 것 for today's goals and today's practice, with
  * 오늘의 연습 (시작하기 · 타이머만 켜기) and the small rows 매일 보이스 체크 · 내 로드맵 · 주간 돌아보기. It takes the place of the
  * separate 오늘의 목표 and 연습하기 cards (design-system/today-card-html.js; data and actions from the app). */
 const todayCard=createTodayCard(opts.todayCard||{}),practice=todayCard.el;
 host.updateToday=model=>todayCard.update(model);
 host.tickToday=state=>todayCard.tick(state);
 host.updateToday(opts.todayModel||null);
 /** Bring 오늘 연습 into view (the former 보컬 트레이닝 addresses and "연습은 오늘 탭에서 해요" lead here). */
 host.showPractice=()=>todayCard.show();
 const summary=el("section",null,"vz-card vz-summary");summary.setAttribute("aria-label","요약");
 const recentWrap=el("section",null,"vz-recent");recentWrap.setAttribute("aria-label","최근 곡");
 // The approved markup's 오늘의 목표 card only marks the place: 오늘 연습 holds the goals now.
 const goalsCard=q(".vz-goals");goalsCard.after(summary,recentWrap);
 // Two columns on wide screens (tablet landscape, desktop): 지금 할 것 + 오늘 연습 | 요약 + 최근 곡. On phones the
 // columns are display:contents, so the order and spacing stay exactly as before.
 const mainColumn=el("div",null,"vz-col vz-col-main"),sideColumn=el("div",null,"vz-col vz-col-side");
 section.before(mainColumn);mainColumn.append(section,practice);goalsCard.remove();mainColumn.after(sideColumn);sideColumn.append(summary,weekCard,recentWrap);
 const glyph=g=>{const i=el("i",g,"vz-ui-icon");i.setAttribute("aria-hidden","true");return i;};
 let summaryRows=Array.isArray(opts.summary)?opts.summary:[],weekRow=null;
 /** One line per row: icon · label · value · trailing badge · chevron. A row without an action is not a button. */
 const paintSummary=()=>{
  summary.replaceChildren();
  for(const row of [...summaryRows,...(weekRow?[weekRow]:[])]){
   const item=el(row.action?"button":"div",null,"vz-summary-row");if(row.action){item.type="button";item.onclick=()=>row.action();}
   item.dataset.row=row.key||"";if(row.tone)item.dataset.tone=row.tone;item.setAttribute("aria-label",row.aria||[row.label,row.value,row.badge].filter(Boolean).join(", "));
   const copy=el("span",null,"vz-summary-copy");
   if(row.sub){
    // Two-line row: "label value" / "sub" (sub = groups that wrap whole). The text still reads as one sentence.
    item.dataset.lines="2";
    const line=el("span",null,"vz-summary-line");line.append(el("strong",row.label||"")," ",el("span",row.value||"","vz-summary-value"));
    const sub=el("span",null,"vz-summary-sub");row.sub.forEach((part,i)=>{if(i)sub.append(" ");sub.append(el("span",part));});
    copy.append(line,el("span"," · ","vz-summary-sep"),sub);
   }else copy.append(el("strong",row.label||""),el("span",row.value||"","vz-summary-value"));
   item.append(glyph(row.icon||""),copy);
   if(row.badge)item.append(el("b",row.badge,"vz-summary-badge"));
   if(row.action)item.append(glyph(""));
   summary.append(item);
  }
  summary.hidden=!summary.childElementCount;
 };
 host.updateSummary=rows=>{summaryRows=Array.isArray(rows)?rows:[];paintSummary();};
 const shortDate=date=>{const parts=String(date||"").split("-");return parts.length===3?Number(parts[1])+"."+Number(parts[2]):"";};
/* 주간 연습 card (week rings, arrows, swipe): the approved card, kept for tablets where there is room beside the
  * summary. Phones show the one-line 이번 주 summary row instead. */
 const meta=q(".vz-week-meta"),goal=meta.children[0];
 const days=q(".vz-days"),dayPrototype=days.firstElementChild.cloneNode(true),check=days.querySelector(".vz-day-dot svg").cloneNode(true);
 action(q(".vz-week .vz-title"),"오늘 일정 보기",opts.onWeek||opts.onCalendar);
 const weekNav=el("div",null,"vz-week-nav"),prev=el("button"),range=el("div",null,"vz-week-range"),next=el("button");
 prev.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 4.5-7.5 7.5 7.5 7.5"/></svg>';
 next.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 4.5 7.5 7.5-7.5 7.5"/></svg>';
 for(const [button,label,fn] of [[prev,"이전 주",()=>opts.onWeekMove?.(-1)],[next,"다음 주",()=>opts.onWeekMove?.(1)]]){
  button.type="button";button.setAttribute("aria-label",label);button.onclick=fn;
 }
 weekNav.append(prev,range,next);meta.before(weekNav);days.after(meta);
 const paintWeekCard=week=>{
  const actual=num(week.actualMinutes),target=week.targetMinutes,ratio=Number(target)>0?actual/Number(target)*100:null;
  weekCard.dataset.weekStart=week.start||"";
  prev.disabled=week.canPrevious===false;next.disabled=week.canNext===false;
  prev.setAttribute("aria-disabled",String(prev.disabled));next.setAttribute("aria-disabled",String(next.disabled));
  q(".vz-week h2").textContent="주간 연습";
  q(".vz-time b").textContent=String(Math.round(actual));
  q(".vz-time").dataset.targetMet=String(Number(target)>0&&actual>=Number(target));
  const startYear=String(week.start||"").slice(0,4),endYear=String(week.end||"").slice(0,4);
  const currentYear=String(new Date().getFullYear()),showYear=startYear!==currentYear||endYear!==currentYear;
  range.replaceChildren(el("span",week.start?(showYear?startYear+".":"")+shortDate(week.start)+" – "+(showYear&&endYear!==startYear?endYear+".":"")+shortDate(week.end):"","vz-week-dates"));
  if(target==null){
   if(week.current===false)goal.textContent="목표 미설정";
   else{const button=el("button","목표 설정","vz-empty-action");button.type="button";button.setAttribute("aria-label","주간 목표 설정");button.onclick=()=>opts.onGoals?.();goal.replaceChildren(button);}
  }else goal.textContent="목표 "+duration(target);
  meta.children[1].querySelector("strong").textContent=ratio==null?"—":Math.round(ratio)+"%";
  meta.querySelector(".vz-streak").dataset.active=String(num(week.streak)>=2);
  meta.querySelector(".vz-streak").replaceChildren(flame.cloneNode(true),document.createTextNode(num(week.streak)+"일 연속"));
  days.replaceChildren();
  for(const item of (week.days||[]).slice(0,7)){
   const day=dayPrototype.cloneNode(true),minutes=num(item.minutes),future=item.state==="future",planned=Number(item.targetMinutes)>0;
   const rate=planned?minutes/Number(item.targetMinutes)*100:item.ratio!=null&&Number.isFinite(Number(item.ratio))?Number(item.ratio):null;
   const level=future?"future":minutes===0?"missed":rate==null||rate<100?"partial":rate<=120?"done":"exceeded";
   const weekday=item.date?new Date(item.date+"T12:00:00").getDay():-1;
   day.className=[item.today?"vz-today":"",weekday===6?"vz-saturday":"",weekday===0?"vz-sunday":""].filter(Boolean).join(" ");day.dataset.date=item.date||"";day.dataset.state=item.state||level;day.dataset.today=String(Boolean(item.today));
   const label=[item.date,(item.label||"")+"요일",item.today?"오늘":"",future?"예정":Math.round(minutes)+"분 연습",rate==null?"목표 미설정":(planned?"목표 "+Math.round(Number(item.targetMinutes))+"분, ":"")+"달성률 "+Math.round(rate)+"%",item.goalCount?(item.goalsComplete?"목표 모두 완료":"목표 "+item.goalCount+"개 중 미완료"):"목표 목록 미설정","일정 보기"].filter(Boolean).join(", ");
   action(day,label,()=>opts.onDay?.(item.date));
   day.firstElementChild.textContent=item.date?String(Number(String(item.date).slice(8,10))):"";
   const dot=day.querySelector(".vz-day-dot");dot.className="vz-day-dot "+level+(item.today?" today":"")+(!future&&item.timeMet?" time-met":"")+(!future&&item.goalsComplete?" goals-complete":"");dot.replaceChildren();
   if(!future&&item.goalsComplete)dot.append(check.cloneNode(true));
   // Today's partial ring keeps its tint unless a time or goal mark already fills it.
   if(item.today&&!future&&minutes>0&&!item.timeMet&&!item.goalsComplete)dot.style.backgroundColor=({partial:"#D9C5FA",done:"var(--vz-color-accent)",exceeded:"#4C188E"})[level];
   day.querySelector(".vz-day-minutes").textContent=future||item.today&&minutes===0?"":Math.round(minutes)+"분";days.append(day);
  }
 };
 // Horizontal gestures change weeks; vertical page scrolling stays available.
 let pointer=null,suppressClickUntil=0,wheelMovedAt=-Infinity;
 weekCard.addEventListener("pointerdown",event=>{if(event.button===0)pointer={id:event.pointerId,x:event.clientX,y:event.clientY};});
 weekCard.addEventListener("pointercancel",()=>{pointer=null;});
 weekCard.addEventListener("pointerup",event=>{
  const start=pointer;pointer=null;if(!start||start.id!==event.pointerId)return;
  const dx=event.clientX-start.x,dy=event.clientY-start.y;
  if(Math.abs(dx)>=45&&Math.abs(dx)>Math.abs(dy)*1.5){suppressClickUntil=performance.now()+350;opts.onWeekMove?.(dx<0?1:-1);}
 });
 weekCard.addEventListener("click",event=>{if(performance.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
 weekCard.addEventListener("wheel",event=>{
  if(Math.abs(event.deltaX)<25||Math.abs(event.deltaX)<=Math.abs(event.deltaY))return;
  event.preventDefault();if(performance.now()-wheelMovedAt<450)return;wheelMovedAt=performance.now();opts.onWeekMove?.(event.deltaX>0?1:-1);
 },{passive:false});
 days.addEventListener("keydown",event=>{if(event.key==="ArrowLeft"||event.key==="ArrowRight"){event.preventDefault();opts.onWeekMove?.(event.key==="ArrowRight"?1:-1);}});
 /** The week the 주간 연습 card shows (it can be moved to earlier weeks). */
 host.updateWeek=week=>{week=week||{};paintWeekCard(week);if(week.current!==false)host.updateThisWeek(week);};
 /** The 오늘 · 이번 주 row and the streak always describe today and this week, whichever week the card shows.
  * day = {minutes, targetMinutes} from VZ.todayPractice (the shared helper); without it, today's cell of the week. */
 let todayInfo=opts.todayPractice||null;
 host.updateThisWeek=(week,day)=>{
  week=week||{};if(day)todayInfo=day;
  const actual=num(week.actualMinutes),target=Number(week.targetMinutes)>0?Number(week.targetMinutes):null,percent=target?Math.round(actual/target*100):null;
  const t=todayInfo||(week.days||[]).find(d=>d.today)||{},mine=num(t.minutes),dayTarget=Number(t.targetMinutes)>0?Number(t.targetMinutes):null;
  // The badge beside "오늘 35분 / 30분" is today's share (1.0 walkthrough, 2026-11-24: it showed the week's 17% there, read as
  // today's); the week's share is in 자세히 (the 주간 sheet) and the spoken name. Without a daily goal the badge is the week's.
  const dayPercent=dayTarget?Math.round(mine/dayTarget*100):null;
  weekRow={key:"week",icon:"",label:"오늘",value:duration(mine)+(dayTarget?" / "+duration(dayTarget):""),
   sub:["이번 주 "+duration(actual),"/ "+(target?"목표 "+duration(target):"목표 없음")],
   badge:dayTarget?dayPercent+"%":target?percent+"%":"",tone:dayTarget?(mine>=dayTarget?"done":""):target&&actual>=target?"done":"",
   aria:"오늘 연습 "+duration(mine)+(dayTarget?", 오늘 목표 "+duration(dayTarget)+", 오늘 달성률 "+dayPercent+"%":"")+", 이번 주 연습 "+duration(actual)+(target?", 목표 "+duration(target)+", 이번 주 달성률 "+percent+"%":", 목표 없음")+", 자세히 보기",
   action:()=>(opts.onWeekSummary||opts.onWeek)?.()};
  paintSummary();
  const streak=num(week.streak),d=opts.today?new Date(opts.today+"T12:00:00"):new Date();
  todayLine.replaceChildren(el("span",(d.getMonth()+1)+"월 "+d.getDate()+"일 ("+"일월화수목금토"[d.getDay()]+")"));
  if(streak){const s=el("span",null,"vz-today-streak");s.dataset.active=String(streak>=2);s.append(flame.cloneNode(true),document.createTextNode(streak+"일 연속"));todayLine.append(s);}
  todayLine.append(levelChip);
 };
 host.updateWeek(opts.week||{});if(opts.thisWeek)host.updateThisWeek(opts.thisWeek);
 host.updateRecent=(songs,onOpen=opts.onRecentSong)=>{
  const list=(Array.isArray(songs)?songs:[]).slice(0,3);recentWrap.replaceChildren();recentWrap.hidden=!list.length;if(!list.length)return;
  // 오늘 부를 곡 (app/song-pick-model.js): each pill says why that song today; songs without a reason are the old 최근 곡.
  const picked=list.some(song=>song.reason);recentWrap.setAttribute("aria-label",picked?"오늘 부를 곡":"최근 곡");
  const head=el("div",null,"vz-pick-head");head.append(el("h3",picked?"오늘 부를 곡":"최근 곡","vz-recent-heading"));
  // 랜덤 (owner, 2026-11-25): one of my songs at random, straight to recording it.
  if(picked&&opts.onRandomSong){const r=el("button","랜덤","vz-pick-random");r.type="button";r.setAttribute("aria-label","아무 곡이나 랜덤으로 고르기");r.onclick=()=>opts.onRandomSong();head.append(r);}
  recentWrap.append(head);
  const pills=el("div",null,"vz-recent-pills");
  for(const song of list){const b=el("button",null,"vz-recent-pill"+(song.reason?" vz-pick-pill":""));b.type="button";const words=el("span",null,"vz-pick-words");words.append(el("span",song.title||"곡"));if(song.reason)words.append(el("small",song.reason+(song.extra?" · "+song.extra:""),"vz-pick-why"));b.append(glyph(""),words);b.setAttribute("aria-label",(song.title||"곡")+" 연습하기");if(song.reason){const why=words.lastChild;why.id="vz-pick-why-"+pills.childElementCount;b.setAttribute("aria-describedby",why.id);}b.onclick=()=>onOpen?.(song);pills.append(b);}
  recentWrap.append(pills);
 };
 host.updateRecent(opts.recentSongs);
 const regular=(glyph)=>{const icon=el("i",glyph,"vz-ui-icon");icon.setAttribute("aria-hidden","true");return icon;};
 const swap=(selector,glyph)=>root.querySelectorAll(selector).forEach(svg=>svg.replaceWith(regular(glyph)));
  // Semantic icons share the same Phosphor Regular weight as the practice timer.
 // Chevrons, add controls, status marks, logo, play and record icons keep their own rules.
 swap(".vz-header-actions button:first-child svg","\ue0ce");swap(".vz-header-actions button:last-child svg","\ue272");
 swap(".vz-event .vz-art-front svg","\ue34c");swap(".vz-week .vz-title > svg:not(.vz-chevron)","\ue150");
 q(".vz-floating-record").onclick=event=>opts.onRecord?.(event.currentTarget);
 const routes=["home","songs","calendar","vocal-growth"];
 [...root.querySelectorAll(".vz-nav-item")].forEach((button,i)=>{button.dataset.nav=routes[i];button.onclick=()=>opts.onNavigate?.(routes[i]);});
 return host;
}




