/* Direct integration of the approved home HTML, including its circular quick action.
 * Demo scripts/dialogs stay inert; only root markup and style blocks are used. */
export const FLOATING_HOME_SOURCE = "4985592d5e93a09ba1300cf57ba4eee866db531b";
const tokenAsset=new URL("./tokens.css?v=12",import.meta.url);
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
#vocalzip-refined-preview .vz-recent{margin:16px 0 12px;}
#vocalzip-refined-preview .vz-recent-heading{margin:0 4px 8px;font-size:15px;line-height:21px;font-weight:600;color:var(--vz-color-ink,#101828);}
#vocalzip-refined-preview .vz-recent-pills{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;padding:0 0 2px;}
#vocalzip-refined-preview .vz-recent-pills::-webkit-scrollbar{display:none;}
#vocalzip-refined-preview .vz-recent-pill{display:inline-flex;align-items:center;gap:6px;flex:none;max-width:72%;min-height:44px;padding:0 16px 0 14px;border:0;border-radius:999px;background:#fff;color:var(--vz-color-ink,#101828);font:inherit;font-size:14px;line-height:20px;font-weight:600;cursor:pointer;}
#vocalzip-refined-preview .vz-recent-pill span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#vocalzip-refined-preview .vz-recent-pill .vz-ui-icon{flex:none;font-size:18px;color:var(--vz-color-accent,#7A32F5);}
#vocalzip-refined-preview .vz-recent-pill:focus-visible{outline:2px solid #DCC4FF;outline-offset:2px;}
#vocalzip-refined-preview .vz-goal-list>[hidden]{display:none;}
#vocalzip-refined-preview .vz-goal-more{display:block;width:100%;min-height:44px;margin:4px 0 0;border:0;border-radius:14px;background:#F3ECFF;color:var(--vz-color-accent,#7A32F5);font:inherit;font-size:13px;font-weight:600;cursor:pointer;}
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
#vocalzip-refined-preview .vz-goal-tools .vz-ui-icon{width:17px;height:17px;font-size:17px;}
#vocalzip-refined-preview .vz-art-front .vz-ui-icon{width:28px;height:28px;font-size:28px;color:#fff;}
#vocalzip-refined-preview .vz-goals .vz-title .vz-count{margin-left:7px;white-space:nowrap;color:var(--vz-color-ink-muted);font-size:12px;font-weight:600;line-height:20px;}
#vocalzip-refined-preview .vz-nav{background:var(--vz-nav-surface,rgba(255,255,255,.58));}
@media(prefers-reduced-transparency:reduce),(prefers-contrast:more){#vocalzip-refined-preview .vz-nav{background:#fff;backdrop-filter:none;-webkit-backdrop-filter:none;}}
#vocalzip-refined-preview .vz-nav-item i{display:block;font:normal 22px/1 "Phosphor";color:var(--vz-color-ink-secondary);letter-spacing:0;}
#vocalzip-refined-preview .vz-nav-item.vz-active i{color:var(--vz-color-accent);}
#vocalzip-refined-preview .vz-floating-record i{display:block;font:normal 22px/1 "Phosphor";color:inherit;}
#vocalzip-refined-preview .vz-header{min-height:var(--vz-touch-min);margin-bottom:8px;}
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
#vocalzip-refined-preview .vz-event h2{overflow-wrap:anywhere;line-height:1.33333333;}
#vocalzip-refined-preview .vz-card h2{line-height:1.44444444;}
#vocalzip-refined-preview .vz-song{aspect-ratio:auto;}
#vocalzip-refined-preview .vz-song h3{line-height:1.27777778;}
#vocalzip-refined-preview .vz-time b{line-height:1.14285714;}
#vocalzip-refined-preview .vz-day-minutes{line-height:1.45454545;}
#vocalzip-refined-preview .vz-event-row strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#vocalzip-refined-preview .vz-shortcut strong{min-width:0;white-space:normal;overflow-wrap:anywhere;}
#vocalzip-refined-preview .vz-goal-list label[data-long=true]{align-items:flex-start;padding-block:12px;}
#vocalzip-refined-preview .vz-goal-list label>span{flex:1;min-width:0;overflow-wrap:anywhere;}
#vocalzip-refined-preview .vz-goal-list label small{flex:none;}
#vocalzip-refined-preview .vz-goal-record{flex:none;min-width:44px;min-height:44px;margin:-6px -8px -6px -4px;padding:0 8px;border:0;border-radius:12px;background:none;color:#7A32F5;font-family:inherit;font-size:13px;font-weight:600;line-height:18px;}
#vocalzip-refined-preview .vz-goal-record:active{background:#F3ECFF;}
#vocalzip-refined-preview .vz-goal-record[hidden]{display:none;}
#vocalzip-refined-preview .vz-goal-list[data-many=true]{max-height:300px;overflow-y:auto;overscroll-behavior-y:contain;scroll-padding-block:8px;}
#vocalzip-refined-preview .vz-goal-list input{scroll-margin-block:8px;}
#vocalzip-refined-preview .vz-save-error{font-size:12px;line-height:1.45;color:#b42318;}
#vocalzip-refined-preview .vz-save-error:empty{display:none;}
#vocalzip-refined-preview .vz-goals .vz-empty-action{display:flex;align-items:center;gap:10px;min-height:56px;width:100%;margin-top:12px;padding:12px 14px;border-radius:14px;background:#f7f5fb;color:#858194;font-weight:500;text-align:left;}
#vocalzip-refined-preview .vz-goals .vz-empty-action svg{width:22px;height:22px;flex:none;stroke:#858194;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;}
#vocalzip-refined-preview .vz-goals .vz-empty-action svg:last-child{width:16px;height:16px;margin-left:auto;}
#vocalzip-refined-preview .vz-goal-list:empty{display:none;}
#vocalzip-refined-preview .vz-goals .vz-ai-plan-actions{display:flex;gap:8px;margin-top:8px;}
#vocalzip-refined-preview .vz-goals .vz-ai-plan-actions .vz-empty-action{flex:1;justify-content:center;min-width:0;min-height:44px;margin:0;padding:0 10px;border-radius:999px;background:#F3ECFF;color:var(--vz-color-accent,#7A32F5);font-size:13px;line-height:18px;font-weight:600;white-space:nowrap;}
#vocalzip-refined-preview .vz-guided-recs{margin-top:8px;}
#vocalzip-refined-preview .vz-guided-recs[hidden]{display:none;}
#vocalzip-refined-preview .vz-guided-heading{display:flex;align-items:center;gap:7px;margin-bottom:8px;color:var(--vz-color-ink);font-size:14px;font-weight:700;}
#vocalzip-refined-preview .vz-guided-item{display:flex;align-items:center;min-width:0;gap:8px;min-height:52px;padding:4px 4px 4px 12px;border-radius:14px;background:#f7f5fb;}
#vocalzip-refined-preview .vz-guided-item+.vz-guided-item{margin-top:8px;}
#vocalzip-refined-preview .vz-guided-copy{min-width:0;flex:1;}
#vocalzip-refined-preview .vz-guided-copy strong,#vocalzip-refined-preview .vz-guided-copy small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#vocalzip-refined-preview .vz-guided-copy strong{color:var(--vz-color-ink);font-size:13px;line-height:19px;}
#vocalzip-refined-preview .vz-guided-copy small{color:var(--vz-color-ink-muted);font-size:11px;line-height:17px;margin-top:2px;}
#vocalzip-refined-preview .vz-guided-item button{flex:none;min-height:44px;border:0;border-radius:12px;padding:0 10px;background:var(--vz-color-selected-bg,#eee5ff);color:var(--vz-color-accent);font-size:12px;font-weight:700;cursor:pointer;}
#vocalzip-refined-preview .vz-pset-entry{display:flex;align-items:center;gap:12px;width:100%;min-height:52px;margin:0;padding:0 12px 0 16px;border:0;border-radius:16px;background:var(--vz-color-accent-soft,#F3ECFF);color:var(--vz-color-ink,#101828);font:inherit;text-align:left;cursor:pointer;}
#vocalzip-refined-preview .vz-pset-entry[hidden]{display:none;}
#vocalzip-refined-preview .vz-pset-entry:active{background:#EDE1FF;}
#vocalzip-refined-preview .vz-pset-entry:focus-visible{outline:2px solid #DCC4FF;outline-offset:0;}
#vocalzip-refined-preview .vz-pset-entry>.vz-ui-icon:first-child{flex:none;width:20px;font-size:20px;color:var(--vz-color-accent,#7A32F5);}
#vocalzip-refined-preview .vz-pset-copy{flex:1;min-width:0;display:flex;align-items:baseline;gap:8px;}
#vocalzip-refined-preview .vz-pset-copy strong{flex:none;color:var(--vz-color-accent,#7A32F5);font-size:14px;line-height:20px;font-weight:600;}
#vocalzip-refined-preview .vz-pset-copy small{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--vz-color-ink-secondary,#475467);font-size:13px;line-height:18px;font-variant-numeric:tabular-nums;}
#vocalzip-refined-preview .vz-pset-chevron{flex:none;font-size:16px;color:var(--vz-color-accent,#7A32F5);}
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
 #vocalzip-refined-preview .vz-event{min-height:120px;margin-bottom:16px;padding:24px 28px;}
 #vocalzip-refined-preview .vz-event h2{font-size:28px;line-height:36px;}
 #vocalzip-refined-preview .vz-event p{font-size:16px;line-height:24px;}
 #vocalzip-refined-preview .vz-goals h2,#vocalzip-refined-preview .vz-week h2{font-size:20px;line-height:28px;}
 #vocalzip-refined-preview .vz-goal-list label{min-height:58px;font-size:16px;line-height:24px;}
 #vocalzip-refined-preview .vz-goals .vz-ai-plan-actions .vz-empty-action{min-height:52px;font-size:15px;}
 #vocalzip-refined-preview .vz-summary{padding:8px 20px 8px 24px;}
 #vocalzip-refined-preview .vz-summary-row{min-height:64px;gap:14px;}
 #vocalzip-refined-preview .vz-summary-copy strong,#vocalzip-refined-preview .vz-summary-value{font-size:16px;line-height:24px;}
 #vocalzip-refined-preview .vz-summary-badge{font-size:15px;line-height:22px;}
 #vocalzip-refined-preview .vz-summary-row>.vz-ui-icon:first-child{width:24px;font-size:24px;}
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
#vocalzip-refined-preview .vz-floating-record{background:var(--vz-gradient-floating)}
#vocalzip-refined-preview .vz-nav{box-sizing:border-box;height:var(--vz-nav-height);padding:var(--vz-nav-padding);border:1px solid var(--vz-nav-border,rgba(255,255,255,.68));border-radius:999px;background:var(--vz-nav-surface,rgba(255,255,255,.58));box-shadow:var(--vz-nav-shadow,0 5px 20px rgba(55,33,85,.045));-webkit-backdrop-filter:blur(var(--vz-nav-blur,24px));backdrop-filter:blur(var(--vz-nav-blur,24px))}
#vocalzip-refined-preview .vz-nav{grid-template-columns:repeat(4,minmax(0,1fr));}\n#vocalzip-refined-preview .vz-nav-item{box-sizing:border-box;height:var(--vz-nav-item-height);min-height:var(--vz-nav-item-height);gap:2px;border-radius:999px;font-size:var(--vz-type-nav-size);font-weight:var(--vz-font-medium)}
#vocalzip-refined-preview .vz-nav-item.vz-active{background:var(--vz-color-selected-bg);color:var(--vz-nav-active-label);font-weight:600}
#vocalzip-refined-preview .vz-nav-item i{font-size:var(--vz-icon-tool-size)}
#vocalzip-refined-preview .vz-floating-record{width:var(--vz-floating-size);min-width:var(--vz-floating-size);height:var(--vz-floating-size);bottom:calc(max(var(--vz-nav-bottom),env(safe-area-inset-bottom)) + var(--vz-floating-bottom));box-shadow:var(--vz-shadow-floating)}
@media(prefers-reduced-transparency:reduce),(prefers-contrast:more){#vocalzip-refined-preview .vz-nav{background:#fff;-webkit-backdrop-filter:none;backdrop-filter:none}}
`);
 shadow.append(sharedShell);
 [...root.querySelectorAll('.vz-nav-item')].forEach((button,i)=>{
  const svg=button.querySelector('svg');if(!svg)return;
  const icon=el('i');icon.setAttribute('aria-hidden','true');icon.dataset.glyph=['\ue2c2','\ue340','\ue10a','\ue150'][i];svg.replaceWith(icon);
 });
 const recordIcon=el('i');recordIcon.setAttribute('aria-hidden','true');recordIcon.dataset.glyph='\ue326';root.querySelector('.vz-floating-record svg').replaceWith(recordIcon);
 const q=selector=>root.querySelector(selector);
 q("main").setAttribute("role","presentation");
 root.prepend(el("h1","홈","vz-visually-hidden"));
 q('[aria-label="알림"]').onclick=()=>opts.onNotifications?.();
 q('[aria-label="프로필"]').onclick=()=>opts.onProfile?.();
 /* v4 home (docs/design/VOCALZIP_DESIGN_SYSTEM_V4_2026-11-12.md, Home order): a small date/streak line, one
  * "지금 할 것" card, up to four goals, one Home summary rows card (next schedule, needs-attention when there is
  * something, this week) and recent songs as pills. The approved markup still supplies the card, goal list and dock;
  * its week rings, event rows and recent-song/shortcut tiles leave home (기록 and 성장 hold those views). */
 const section=q(".vz-schedule"),now=q(".vz-event");
 section.querySelectorAll(".vz-event-row").forEach(e=>e.remove());
 q(".vz-quick-grid")?.remove();const weekCard=q(".vz-week"); // 주간 연습 card: shown on tablets only (CSS)
 const todayLine=el("p",null,"vz-today-line");section.before(todayLine);
 const flame=el("i","","vz-ui-icon");flame.setAttribute("aria-hidden","true");
 host.updateNow=item=>{
  section.hidden=!item;if(!item)return;
  now.dataset.kind=item.kind||"";now.querySelector("h2").textContent=item.title||"";
  const badge=now.querySelector(".vz-dday");badge.textContent=item.badge||"";badge.hidden=!badge.textContent;
  now.querySelector("p").textContent=item.line||"";
  action(now,item.label||item.title||"지금 할 것",item.action);
 };
 host.updateNow(opts.now);
 /* 오늘 연습 세트 (app/practice-set.js): one compact row under 지금 할 것 that starts or resumes today's guided set. */
 const practiceSet=el("button",null,"vz-pset-entry");practiceSet.type="button";now.after(practiceSet);
 host.updatePracticeSet=item=>{
  practiceSet.hidden=!item;if(!item)return;
  practiceSet.dataset.state=item.state||"new";practiceSet.setAttribute("aria-label",item.label||item.title||"오늘 연습 시작");
  const icon=el("i","","vz-ui-icon");icon.setAttribute("aria-hidden","true");icon.textContent="\ue3d0";
  const copy=el("span",null,"vz-pset-copy");copy.append(el("strong",item.title||"오늘 연습 시작"),el("small",item.line||""));
  const chevron=el("i","\ue13a","vz-ui-icon vz-pset-chevron");chevron.setAttribute("aria-hidden","true");
  practiceSet.replaceChildren(icon,copy,chevron);practiceSet.onclick=()=>opts.onPracticeSet?.();
 };
 host.updatePracticeSet(opts.practiceSet);
 const summary=el("section",null,"vz-card vz-summary");summary.setAttribute("aria-label","요약");
 const recentWrap=el("section",null,"vz-recent");recentWrap.setAttribute("aria-label","최근 곡");
 q(".vz-goals").after(summary,recentWrap);
 // Two columns on wide screens (tablet landscape, desktop): 지금 할 것 + 오늘의 목표 | 요약 + 최근 곡. On phones the
 // columns are display:contents, so the order and spacing stay exactly as before.
 const mainColumn=el("div",null,"vz-col vz-col-main"),sideColumn=el("div",null,"vz-col vz-col-side");
 section.before(mainColumn);mainColumn.append(section,q(".vz-goals"));mainColumn.after(sideColumn);sideColumn.append(summary,weekCard,recentWrap);
 const glyph=g=>{const i=el("i",g,"vz-ui-icon");i.setAttribute("aria-hidden","true");return i;};
 let summaryRows=Array.isArray(opts.summary)?opts.summary:[],weekRow=null;
 /** One line per row: icon · label · value · trailing badge · chevron. A row without an action is not a button. */
 const paintSummary=()=>{
  summary.replaceChildren();
  for(const row of [...summaryRows,...(weekRow?[weekRow]:[])]){
   const item=el(row.action?"button":"div",null,"vz-summary-row");if(row.action){item.type="button";item.onclick=()=>row.action();}
   item.dataset.row=row.key||"";if(row.tone)item.dataset.tone=row.tone;item.setAttribute("aria-label",row.aria||[row.label,row.value,row.badge].filter(Boolean).join(", "));
   const copy=el("span",null,"vz-summary-copy");copy.append(el("strong",row.label||""),el("span",row.value||"","vz-summary-value"));
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
 /** The 이번 주 row and the streak always describe this week, whichever week the card shows. */
 host.updateThisWeek=week=>{
  week=week||{};const actual=num(week.actualMinutes),target=Number(week.targetMinutes)>0?Number(week.targetMinutes):null;
  weekRow={key:"week",icon:"",label:"이번 주",value:duration(actual)+(target?" / "+duration(target):" · 목표 미설정"),
   badge:target?Math.round(actual/target*100)+"%":"",tone:target&&actual>=target?"done":"",
   aria:"이번 주 연습 "+duration(actual)+(target?", 목표 "+duration(target)+", 달성률 "+Math.round(actual/target*100)+"%":", 목표 미설정")+", 기록 보기",
   action:()=>opts.onWeek?.()};
  paintSummary();
  const streak=num(week.streak),d=opts.today?new Date(opts.today+"T12:00:00"):new Date();
  todayLine.replaceChildren(el("span",(d.getMonth()+1)+"월 "+d.getDate()+"일 ("+"일월화수목금토"[d.getDay()]+")"));
  if(streak){const s=el("span",null,"vz-today-streak");s.dataset.active=String(streak>=2);s.append(flame.cloneNode(true),document.createTextNode(streak+"일 연속"));todayLine.append(s);}
 };
 host.updateWeek(opts.week||{});if(opts.thisWeek)host.updateThisWeek(opts.thisWeek);
 host.updateRecent=(songs,onOpen=opts.onRecentSong)=>{
  const list=(Array.isArray(songs)?songs:[]).slice(0,3);recentWrap.replaceChildren();recentWrap.hidden=!list.length;if(!list.length)return;
  recentWrap.append(el("h3","최근 곡","vz-recent-heading"));
  const pills=el("div",null,"vz-recent-pills");
  for(const song of list){const b=el("button",null,"vz-recent-pill");b.type="button";b.append(glyph(""),el("span",song.title||"곡"));b.setAttribute("aria-label",(song.title||"곡")+" 연습하기");b.onclick=()=>onOpen?.(song);pills.append(b);}
  recentWrap.append(pills);
 };
 host.updateRecent(opts.recentSongs);
 const regular=(glyph)=>{const icon=el("i",glyph,"vz-ui-icon");icon.setAttribute("aria-hidden","true");return icon;};
 const swap=(selector,glyph)=>root.querySelectorAll(selector).forEach(svg=>svg.replaceWith(regular(glyph)));
 q(".vz-goals .vz-title").append(q(".vz-count"));
 q(".vz-goal-tools button").setAttribute("aria-label","오늘의 목표 설정");q(".vz-goal-tools button").onclick=()=>opts.onGoals?.();
 const aiActions=el("div",null,"vz-ai-plan-actions");aiActions.setAttribute("aria-label","AI 연습 계획");
 for(const [label,short,callback] of [["AI로 오늘 할 일 추천받기","AI 오늘 추천",opts.onDailyRecommendation],["주간 돌아보기 · 다음 목표 추천","주간 돌아보기",opts.onWeeklyReview]]){
  const button=el("button",short,"vz-empty-action");button.type="button";button.setAttribute("aria-label",label);button.onclick=()=>callback?.();aiActions.append(button);
 }
 q(".vz-goals").append(aiActions);
 const list=q(".vz-goal-list"),prototype=list.firstElementChild.cloneNode(true),items=(opts.goals||[]).map(g=>({...g,completed:Boolean(g.completed)}));list.replaceChildren();list.dataset.many=String(items.length>6);
 if(items.length>6){list.tabIndex=0;list.setAttribute("role","region");list.setAttribute("aria-label","오늘의 목표 목록, 내부 스크롤");}
 const error=el("p","","vz-save-error");error.setAttribute("role","status");error.setAttribute("aria-live","polite");list.after(error);
 const guided=el("div",null,"vz-guided-recs");guided.hidden=true;guided.setAttribute("aria-label","추천 연습");error.after(guided);
 host.updateRecommendations=rows=>{
  const seen=new Set([...(opts.goals||[]).map(g=>String(g.title||"").trim()),String(now.querySelector("h2")?.textContent||"").trim()].filter(Boolean));
  guided.replaceChildren();const items=(rows||[]).filter(r=>!seen.has(String(r.title||"").trim())).slice(0,1);guided.hidden=!items.length;if(!items.length)return;
  for(const item of items){
   const row=el("div",null,"vz-guided-item"),copy=el("div",null,"vz-guided-copy"),button=el("button","따라 하기");
   copy.append(el("strong",(item.label|| (item.kind==="homework"?"숙제":"분석 추천"))+" · "+item.title),el("small",item.subtitle+(item.kind==="room"?"":" · "+(item.video?"영상 포함":"타이머 안내"))));
   button.type="button";button.setAttribute("aria-label",item.title+" 따라 하기");button.onclick=()=>opts.onGuidedPractice?.(item);
   row.append(copy,button);guided.append(row);
  }
 };host.updateRecommendations(opts.recommendations);
 const refresh=()=>{q(".vz-count").textContent=items.filter(g=>g.completed).length+" / "+items.length+" 완료";};refresh();
 if(!items.length){const button=el("button",null,"vz-empty-action");button.type="button";button.setAttribute("aria-label","오늘의 목표 정하기");button.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg><span>오늘의 목표 정하기</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 4 8 8-8 8"/></svg>';button.onclick=()=>opts.onGoals?.();list.append(button);}
 const MAX_GOALS=4;let expanded=false,more=null;
 for(const [index,item] of items.entries()){
  const row=prototype.cloneNode(true),input=row.querySelector("input");if(index>=MAX_GOALS)row.hidden=true;row.dataset.long=String(String(item.title||"").length>80);input.removeAttribute("checked");input.checked=item.completed;input.setAttribute("aria-label",item.title||"목표");
  row.querySelector("span").textContent=item.title||"목표";
  // A routine day shows its running count (e.g. 반복 3/7), updated with this row's check.
  const tag=row.querySelector("small"),info=item.routineInfo,counted=item.completed;
  const tagText=()=>info?info.label+" "+(info.done-(counted?1:0)+(item.completed?1:0))+"/"+info.total:item.routine&&item.source==="personal"?"반복":({homework:"숙제",personal:"개인",recommendation:"추천"})[item.source]||"";
  const showTag=()=>{tag.textContent=tagText();tag.hidden=!tag.textContent;};showTag();
  // Completed goals keep a way back to the optional 수행 기록 (minutes · recordings) after the 6-second offer.
  let record=null;
  if(opts.onGoalRecord){
   record=el("button","기록","vz-goal-record");record.type="button";record.hidden=!item.completed;record.setAttribute("aria-label",(item.title||"목표")+" 수행 기록");
   record.onclick=event=>{event.preventDefault();event.stopPropagation();opts.onGoalRecord(item.id);};row.append(record);
  }
  input.onchange=async()=>{
   const before=item.completed;item.completed=input.checked;input.disabled=true;row.setAttribute("aria-busy","true");error.textContent="";refresh();showTag();
   try{if(await opts.onGoalToggle?.(item.id,item.completed)===false)throw Error("save rejected");}
   catch{item.completed=before;input.checked=before;refresh();error.textContent="저장하지 못했어요. 다시 체크해 주세요.";}
   finally{input.disabled=false;row.removeAttribute("aria-busy");showTag();if(record)record.hidden=!item.completed;}
  };list.append(row);
 }
 if(items.length>MAX_GOALS){
  more=el("button","목표 "+(items.length-MAX_GOALS)+"개 더 보기","vz-goal-more");more.type="button";more.setAttribute("aria-expanded","false");
  more.onclick=()=>{expanded=!expanded;[...list.children].slice(MAX_GOALS).forEach(r=>{r.hidden=!expanded;});more.setAttribute("aria-expanded",String(expanded));more.textContent=expanded?"접기":"목표 "+(items.length-MAX_GOALS)+"개 더 보기";};
  list.after(more);
 }
  // Semantic icons share the same Phosphor Regular weight as the practice timer.
 // Chevrons, add controls, status marks, logo, play and record icons keep their own rules.
 swap(".vz-header-actions button:first-child svg","\ue0ce");swap(".vz-header-actions button:last-child svg","\ue4c2");
 swap(".vz-event .vz-art-front svg","\ue34c");swap(".vz-week .vz-title > svg:not(.vz-chevron)","\ue150");swap(".vz-goals .vz-title > svg","\ue6a2");swap(".vz-goal-tools button svg","\ue270");
 q(".vz-floating-record").onclick=event=>opts.onRecord?.(event.currentTarget);
 const routes=["home","songs","calendar","vocal-growth"];
 [...root.querySelectorAll(".vz-nav-item")].forEach((button,i)=>{button.dataset.nav=routes[i];button.onclick=()=>opts.onNavigate?.(routes[i]);});
 return host;
}




