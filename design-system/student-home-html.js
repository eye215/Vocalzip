/* Direct integration of the approved home HTML, including its circular quick action.
 * Demo scripts/dialogs stay inert; only root markup and style blocks are used. */
import {createPracticeCard,PRACTICE_CARD_CSS} from './practice-card-html.js?v=logo1-20261127';
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
/* Line icons drawn like the design's (24px grid, round caps); the 오늘 부를 곡 and 다가오는 일 blocks use them. */
const ICON={chevron:'<path d="m9 5 7 7-7 7"/>',note:'<path d="M9 18V5l11-2v13"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',
 dice:'<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="9" cy="9" r="1.1" fill="currentColor"/><circle cx="15" cy="15" r="1.1" fill="currentColor"/><circle cx="15" cy="9" r="1.1" fill="currentColor"/><circle cx="9" cy="15" r="1.1" fill="currentColor"/>',
 chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'};
function icon(body,{size=16,width=2}={}){const t=document.createElement("template");t.innerHTML='<svg width="'+size+'" height="'+size+'" style="width:'+size+'px;height:'+size+'px;stroke-width:'+width+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="'+width+'" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">'+body+'</svg>';return t.content.firstChild;}
function el(tag,text,className){const e=document.createElement(tag);if(text!=null)e.textContent=text;if(className)e.className=className;return e;}
function action(element,label,fn){
 element.setAttribute("role","button");element.tabIndex=0;element.setAttribute("aria-label",label);
 element.onclick=()=>fn?.();
 element.onkeydown=e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();fn?.();}};
}
const adaptations=String.raw`
/* v4 home (VOCALZIP_DESIGN_SYSTEM_V4_2026-11-12.md), redrawn in three steps (2026-11-27): the top, 오늘의 연습, 다가오는 일 · 오늘 부를 곡. */
/* 오늘 위쪽 (home top, 2026-11-27): a ring of today's minutes with the date and one line beside it, the bell and the gear;
 * under a thin line the week's days (one button to the week sheet); then 큰 단계 and the eight 기본기 as chips. */
#vocalzip-refined-preview .vz-header.vz-has-top{align-items:flex-start;gap:8px;min-height:0;margin:0;padding:8px 8px 14px;}
#vocalzip-refined-preview .vz-header.vz-has-top{flex-wrap:wrap;align-items:center;row-gap:6px;}
#vocalzip-refined-preview .vz-brand{order:0;display:flex;align-items:center;gap:9px;flex:1;min-width:0;min-height:44px;}
#vocalzip-refined-preview .vz-brand-icon{display:grid;place-items:center;flex:none;width:34px;height:34px;border-radius:11px;background:linear-gradient(135deg,#9A5BFF 0%,#7A32F5 45%,#5B1FC2 100%);box-shadow:0 4px 10px rgba(122,50,245,.25);}
#vocalzip-refined-preview .vz-brand-icon svg{width:18px;height:18px;stroke:#fff;stroke-width:2.6;}
#vocalzip-refined-preview .vz-brand-word{font-size:21px;line-height:1;font-weight:800;letter-spacing:-.03em;color:var(--vz-color-ink,#101828);}
#vocalzip-refined-preview .vz-brand-word b{font-weight:800;color:#7A32F5;}
#vocalzip-refined-preview .vz-has-top .vz-header-actions{order:1;}
#vocalzip-refined-preview .vz-top{order:2;flex:1 0 100%;display:flex;align-items:center;gap:14px;min-width:0;}
#vocalzip-refined-preview .vz-ring{position:relative;flex:none;width:84px;height:84px;}
#vocalzip-refined-preview .vz-ring-svg{display:block;width:84px;height:84px;overflow:visible;}
#vocalzip-refined-preview .vz-ring-bar{transition:stroke-dashoffset .5s ease;}
#vocalzip-refined-preview .vz-ring-num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;line-height:1;color:var(--vz-color-ink,#101828);font-variant-numeric:tabular-nums;font-feature-settings:"tnum";white-space:nowrap;}
#vocalzip-refined-preview .vz-ring-num b{font-size:30px;font-weight:800;letter-spacing:-.03em;}
#vocalzip-refined-preview .vz-ring-num[data-digits="3"] b{font-size:25px;}
#vocalzip-refined-preview .vz-ring-num[data-digits="4"] b{font-size:20px;}
#vocalzip-refined-preview .vz-ring-num small{margin-left:1px;font-size:13px;font-weight:700;}
#vocalzip-refined-preview .vz-tw{position:absolute;line-height:0;pointer-events:none;opacity:0;animation:vzTw 2.4s ease-in-out infinite;}
#vocalzip-refined-preview .vz-tw svg{display:block;}
@keyframes vzTw{0%,100%{opacity:0;transform:scale(.2) rotate(0deg)}45%{opacity:.55;transform:scale(1) rotate(30deg)}60%{opacity:.45;transform:scale(.85) rotate(40deg)}}
@media(prefers-reduced-motion:reduce){#vocalzip-refined-preview .vz-tw{animation:none;opacity:.4;transform:none;}#vocalzip-refined-preview .vz-ring-bar{transition:none;}}
#vocalzip-refined-preview .vz-top-words{display:flex;flex-direction:column;align-items:flex-start;gap:3px;flex:1;min-width:0;}
#vocalzip-refined-preview .vz-top-date{margin:0;font-size:19px;line-height:1.2;font-weight:800;letter-spacing:-.02em;color:var(--vz-color-ink,#101828);word-break:keep-all;}
#vocalzip-refined-preview .vz-top-say{margin:0;font-size:14px;line-height:1.35;font-weight:400;color:var(--vz-color-ink-muted,#667085);word-break:keep-all;}
#vocalzip-refined-preview .vz-top-say[data-met="true"]{color:#5B1FC2;font-weight:700;}
#vocalzip-refined-preview button.vz-top-say{display:inline-flex;align-items:center;min-height:44px;margin:-12px 0;padding:0;border:0;background:none;color:#5B1FC2;font:inherit;font-size:14px;font-weight:700;text-align:left;cursor:pointer;}
#vocalzip-refined-preview button.vz-top-say:focus-visible{outline:2px solid #DCC4FF;outline-offset:2px;border-radius:8px;}
#vocalzip-refined-preview .vz-has-top .vz-header-actions{flex:none;align-self:flex-start;gap:2px;margin:-3px -3px 0 0;}
#vocalzip-refined-preview .vz-has-top .vz-header-actions button{isolation:isolate;color:#344054;}
#vocalzip-refined-preview .vz-has-top .vz-header-actions button::before{content:"";position:absolute;z-index:-1;inset:2px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(59,15,140,.04),0 6px 18px rgba(59,15,140,.06);}
#vocalzip-refined-preview .vz-has-top .vz-header-actions .vz-ui-icon{width:19px;height:19px;font-size:19px;}
#vocalzip-refined-preview .vz-week-strip{display:flex;align-items:center;justify-content:space-between;gap:10px;box-sizing:border-box;width:calc(100% - 16px);min-height:44px;margin:0 8px 5px;padding:12px 0 0;border:0;border-top:1px solid #ECE6F5;border-radius:0;background:none;color:var(--vz-color-ink-muted,#667085);font:inherit;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent;}
#vocalzip-refined-preview .vz-week-strip:focus-visible{outline:2px solid #DCC4FF;outline-offset:2px;border-radius:12px;}
#vocalzip-refined-preview .vz-week-strip-text{min-width:0;font-size:14px;line-height:22px;color:var(--vz-color-ink-muted,#667085);white-space:nowrap;}
#vocalzip-refined-preview .vz-week-strip-text b{color:#5B1FC2;font-size:16px;font-weight:800;}
#vocalzip-refined-preview .vz-week-dots{display:flex;flex:none;gap:4px;}
#vocalzip-refined-preview .vz-week-dots>span{display:flex;flex-direction:column;align-items:center;gap:4px;width:22px;}
#vocalzip-refined-preview .vz-week-dots small{font-size:13px;line-height:16px;font-weight:600;color:#7D8597;}
#vocalzip-refined-preview .vz-week-dots i{display:block;width:9px;height:9px;border-radius:99px;background:#E6DDF6;}
#vocalzip-refined-preview .vz-week-dots>[data-practiced="true"] small,#vocalzip-refined-preview .vz-week-dots>[data-today="true"] small{color:#5B1FC2;}
#vocalzip-refined-preview .vz-week-dots>[data-today="true"] small{font-weight:800;}
#vocalzip-refined-preview .vz-week-dots>[data-practiced="true"] i{background:var(--vz-gradient-primary,linear-gradient(135deg,#9A5BFF 0%,#7A32F5 45%,#5B1FC2 100%));}
#vocalzip-refined-preview .vz-week-dots>[data-today="true"] i{box-shadow:0 0 0 2px #fff,0 0 0 3.5px #C9AEFB;}
@media(max-width:374px){#vocalzip-refined-preview .vz-week-dots{gap:2px;}#vocalzip-refined-preview .vz-week-dots>span{width:18px;}}
#vocalzip-refined-preview .vz-level-row{display:flex;gap:6px;margin:0 calc(-1 * var(--vz-page-gutter,12px)) 8px;padding:0 calc(var(--vz-page-gutter,12px) + 8px);overflow-x:auto;overscroll-behavior-x:contain;scrollbar-width:none;-webkit-overflow-scrolling:touch;}
#vocalzip-refined-preview .vz-level-row::-webkit-scrollbar{display:none;}
#vocalzip-refined-preview .vz-level-row::after{content:"";flex:none;width:calc(var(--vz-page-gutter,12px) + 2px);}
#vocalzip-refined-preview .vz-level-row[hidden]{display:none;}
#vocalzip-refined-preview .vz-chip{display:flex;flex:none;align-items:center;min-height:44px;margin:0;padding:0;border:0;background:none;font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;}
#vocalzip-refined-preview .vz-chip[hidden]{display:none;}
#vocalzip-refined-preview .vz-chip-face{display:inline-flex;align-items:center;gap:6px;box-sizing:border-box;height:30px;padding:0 10px;border:1px solid #ECE6F5;border-radius:99px;background:#fff;color:var(--vz-color-ink-muted,#667085);font-size:12px;line-height:16px;font-weight:700;letter-spacing:0;white-space:nowrap;}
#vocalzip-refined-preview .vz-chip:focus-visible{outline:none;}
#vocalzip-refined-preview .vz-chip:focus-visible .vz-chip-face{outline:2px solid #DCC4FF;outline-offset:2px;}
#vocalzip-refined-preview .vz-chip-level .vz-chip-face{border-color:transparent;background:var(--vz-gradient-primary,linear-gradient(135deg,#9A5BFF 0%,#7A32F5 45%,#5B1FC2 100%));color:#fff;font-weight:800;}
#vocalzip-refined-preview .vz-chip[data-state="calibrating"] .vz-chip-face{border-color:#E3D6FB;background:#F6F1FE;color:#5B1FC2;}
#vocalzip-refined-preview .vz-chip[data-state="earned"] .vz-chip-face{border-color:transparent;background:#EFE8FC;color:#5B1FC2;}
#vocalzip-refined-preview .vz-chip-seg{display:inline-flex;gap:2px;}
#vocalzip-refined-preview .vz-chip-seg i{display:block;width:6px;height:4px;border-radius:2px;background:#E6DDF6;}
#vocalzip-refined-preview .vz-chip[data-state="calibrating"] .vz-chip-seg i{background:#D9C6FF;}
#vocalzip-refined-preview .vz-chip-seg i.is-on{background:#7A32F5;}
/* 다가오는 일 · 오늘 부를 곡 (home step 3, 2026-11-27): the blocks under 오늘의 연습, on the card's 16px gutter (the page's
 * 12px + 4px) with ~22px between sections. A section head is a 17px title with one light action on the right. */
#vocalzip-refined-preview .vz-upcoming,#vocalzip-refined-preview .vz-weekly-line,#vocalzip-refined-preview .vz-recent{display:block;box-sizing:border-box;min-width:0;margin:22px 4px 0;}
#vocalzip-refined-preview .vz-upcoming:not([hidden])+.vz-weekly-line{margin-top:10px;}
#vocalzip-refined-preview .vz-upcoming[hidden],#vocalzip-refined-preview .vz-weekly-line[hidden],#vocalzip-refined-preview .vz-recent[hidden],#vocalzip-refined-preview .vz-schedule[hidden]{display:none;}
#vocalzip-refined-preview .vz-sec-head,#vocalzip-refined-preview .vz-pick-head{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:30px;margin:0 0 10px;padding:0 0 0 4px;}
#vocalzip-refined-preview .vz-sec-title,#vocalzip-refined-preview .vz-recent-heading{flex:1;min-width:0;margin:0;font-size:17px;line-height:24px;font-weight:800;letter-spacing:-.02em;color:var(--vz-color-ink,#101828);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
/* 44px targets that sit in a 24–30px line: the button is 44px tall, its negative margins keep the line's height. */
#vocalzip-refined-preview .vz-sec-link{display:inline-flex;align-items:center;gap:2px;flex:none;min-height:44px;margin:-10px 0;padding:0 4px 0 10px;border:0;background:none;color:#7D8597;font:inherit;font-size:13px;line-height:18px;font-weight:500;cursor:pointer;-webkit-tap-highlight-color:transparent;}
#vocalzip-refined-preview .vz-sec-link svg{display:block;flex:none;}
#vocalzip-refined-preview .vz-up-cards{display:flex;gap:10px;}
#vocalzip-refined-preview .vz-up-card{display:flex;flex:1 1 0;align-items:center;gap:10px;box-sizing:border-box;min-width:0;min-height:68px;margin:0;padding:12px;border:0;border-radius:18px;background:#fff;box-shadow:0 1px 2px rgba(59,15,140,.04),0 6px 18px rgba(59,15,140,.06);color:var(--vz-color-ink,#101828);font:inherit;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent;}
#vocalzip-refined-preview .vz-up-date{display:flex;flex:none;flex-direction:column;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;background:#EFE8FC;color:#5B1FC2;}
#vocalzip-refined-preview .vz-up-date small{font-size:12px;line-height:14px;font-weight:700;}
#vocalzip-refined-preview .vz-up-date b{font-size:20px;line-height:22px;font-weight:900;letter-spacing:-.02em;font-variant-numeric:tabular-nums;}
#vocalzip-refined-preview .vz-up-words{display:flex;flex:1;flex-direction:column;gap:2px;min-width:0;}
#vocalzip-refined-preview .vz-up-title{display:flex;align-items:baseline;gap:4px;min-width:0;font-size:14px;line-height:20px;font-weight:800;}
#vocalzip-refined-preview .vz-up-title>span,#vocalzip-refined-preview .vz-up-line{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#vocalzip-refined-preview .vz-up-title>b{flex:none;color:#5B1FC2;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap;}
#vocalzip-refined-preview .vz-up-line{font-size:13px;line-height:18px;font-weight:400;color:var(--vz-color-ink-muted,#667085);}
#vocalzip-refined-preview .vz-weekly-row{display:flex;align-items:center;gap:10px;box-sizing:border-box;width:100%;min-height:52px;margin:0;padding:8px 12px 8px 10px;border:0;border-radius:16px;background:#fff;box-shadow:0 1px 2px rgba(59,15,140,.04),0 4px 12px rgba(59,15,140,.06);color:var(--vz-color-ink,#101828);font:inherit;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent;}
#vocalzip-refined-preview .vz-weekly-row>span:nth-child(2){display:flex;flex:1;align-items:baseline;gap:8px;min-width:0;}
#vocalzip-refined-preview .vz-weekly-row strong{flex:none;font-size:14px;line-height:20px;font-weight:800;}
#vocalzip-refined-preview .vz-weekly-row small{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;line-height:18px;color:var(--vz-color-ink-muted,#667085);}
#vocalzip-refined-preview .vz-weekly-row>svg:last-child{flex:none;color:#98A2B3;}
#vocalzip-refined-preview .vz-round-icon{display:grid;flex:none;place-items:center;width:36px;height:36px;border-radius:99px;background:#EFE8FC;color:#5B1FC2;}
#vocalzip-refined-preview .vz-round-icon svg{display:block;}
#vocalzip-refined-preview .vz-pick-random{display:inline-flex;flex:none;align-items:center;min-height:44px;margin:-7px 0;padding:0;border:0;background:none;font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;}
#vocalzip-refined-preview .vz-pick-random>span{display:inline-flex;align-items:center;gap:5px;box-sizing:border-box;height:30px;padding:0 12px;border-radius:99px;background:#EFE8FC;color:#5B1FC2;font-size:13px;line-height:18px;font-weight:800;white-space:nowrap;}
#vocalzip-refined-preview .vz-pick-random svg{display:block;flex:none;}
/* The picks: a row that scrolls sideways edge to edge (its shadows are not cut), first chip on the gutter. */
#vocalzip-refined-preview .vz-recent-pills{display:flex;gap:10px;margin:-2px -16px 0;padding:2px 16px 12px;overflow-x:auto;overscroll-behavior-x:contain;scroll-padding-inline:16px;scrollbar-width:none;-webkit-overflow-scrolling:touch;}
#vocalzip-refined-preview .vz-recent-pills::-webkit-scrollbar{display:none;}
#vocalzip-refined-preview .vz-recent-pills::after{content:"";flex:none;width:6px;}
#vocalzip-refined-preview .vz-recent-pill{display:flex;flex:none;align-items:center;gap:10px;box-sizing:border-box;max-width:min(300px,82%);min-height:56px;margin:0;padding:10px 14px 10px 10px;border:0;border-radius:16px;background:#fff;box-shadow:0 1px 2px rgba(59,15,140,.04),0 4px 12px rgba(59,15,140,.06);color:var(--vz-color-ink,#101828);font:inherit;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent;}
#vocalzip-refined-preview .vz-pick-words{display:grid;gap:1px;min-width:0;text-align:left;}
#vocalzip-refined-preview .vz-pick-words>span,#vocalzip-refined-preview .vz-pick-why{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
#vocalzip-refined-preview .vz-pick-words>span{font-size:15px;line-height:21px;font-weight:800;}
#vocalzip-refined-preview .vz-pick-why{font-size:13px;line-height:18px;font-weight:400;color:var(--vz-color-ink-muted,#667085);}
#vocalzip-refined-preview .vz-up-card:focus-visible,#vocalzip-refined-preview .vz-weekly-row:focus-visible,#vocalzip-refined-preview .vz-recent-pill:focus-visible{outline:2px solid #DCC4FF;outline-offset:2px;}
#vocalzip-refined-preview .vz-sec-link:focus-visible,#vocalzip-refined-preview .vz-pick-random:focus-visible{outline:none;}
#vocalzip-refined-preview .vz-sec-link:focus-visible{text-decoration:underline;color:#5B1FC2;}
#vocalzip-refined-preview .vz-pick-random:focus-visible>span{outline:2px solid #DCC4FF;outline-offset:2px;}
#vocalzip-refined-preview .vz-up-card:active,#vocalzip-refined-preview .vz-weekly-row:active,#vocalzip-refined-preview .vz-recent-pill:active{transform:scale(.98);}
@media(prefers-reduced-motion:reduce){#vocalzip-refined-preview .vz-up-card:active,#vocalzip-refined-preview .vz-weekly-row:active,#vocalzip-refined-preview .vz-recent-pill:active{transform:none;}}
@media(max-width:359px){#vocalzip-refined-preview .vz-up-cards{gap:8px;}#vocalzip-refined-preview .vz-up-card{gap:8px;padding:12px 10px;}}
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
/* The last block (오늘 부를 곡, else 다가오는 일) ends at least 12px above the floating record button when scrolled to the end. */
#vocalzip-refined-preview main{padding-bottom:calc(var(--vz-page-bottom) + 16px + max(var(--vz-nav-bottom),env(safe-area-inset-bottom)));}
#vocalzip-refined-preview .vz-nav-space{max-width:var(--vz-nav-max-width);}
#vocalzip-refined-preview .vz-floating-record{right:max(var(--vz-nav-inset),calc((100vw - var(--vz-content-max))/2 + var(--vz-nav-inset)));}
.vz-visually-hidden{position:absolute!important;width:1px!important;height:1px!important;margin:-1px!important;padding:0!important;border:0!important;clip:rect(0,0,0,0)!important;overflow:hidden!important;white-space:nowrap!important;}
#vocalzip-refined-preview [role=button]{cursor:pointer;}
#vocalzip-refined-preview [role=button]:focus-visible{outline:var(--vz-focus-width) solid var(--vz-color-focus);outline-offset:var(--vz-focus-offset);}
#vocalzip-refined-preview .vz-title[role=button],#vocalzip-refined-preview .vz-song h3[role=button]{position:relative;}
#vocalzip-refined-preview .vz-title[role=button]::after,#vocalzip-refined-preview .vz-song h3[role=button]::before{content:"";position:absolute;left:0;right:0;top:50%;height:max(100%,44px);transform:translateY(-50%);}
#vocalzip-refined-preview .vz-card-heading{flex-wrap:wrap;}
#vocalzip-refined-preview .vz-dday{flex:none;white-space:nowrap;}
#vocalzip-refined-preview .vz-listen{min-width:0;white-space:normal;}
#vocalzip-refined-preview .vz-title,#vocalzip-refined-preview .vz-shortcut>span{min-width:0;}
#vocalzip-refined-preview .vz-card h2{line-height:1.44444444;}
#vocalzip-refined-preview .vz-song{aspect-ratio:auto;}
#vocalzip-refined-preview .vz-song h3{line-height:1.27777778;}
#vocalzip-refined-preview .vz-time b{line-height:1.14285714;}
#vocalzip-refined-preview .vz-day-minutes{line-height:1.45454545;}
#vocalzip-refined-preview .vz-shortcut strong{min-width:0;white-space:normal;overflow-wrap:anywhere;}
@media(max-width:355px){#vocalzip-refined-preview .vz-card h2{line-height:1.625;}}
/* Wide screens (after the rules above so it wins): two columns. */
#vocalzip-refined-preview .vz-col{display:contents;}
#vocalzip-refined-preview .vz-col>.vz-card{margin-bottom:12px;}
#vocalzip-refined-preview .vz-col-side>.vz-week{display:none;}
@media (min-width:768px){
 #vocalzip-refined-preview .vz-phone{max-width:min(1040px,100%);}
 #vocalzip-refined-preview main{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);column-gap:20px;align-items:start;}
 #vocalzip-refined-preview .vz-col{display:block;min-width:0;}
 /* Tablets: the full 주간 연습 card (rings, arrows) under 다가오는 일, and everything reads larger. */
 #vocalzip-refined-preview .vz-col-side>.vz-week{display:block;}
 #vocalzip-refined-preview .vz-col>.vz-card{margin-bottom:16px;padding:24px;border-radius:24px;}
 #vocalzip-refined-preview .vz-week h2{font-size:20px;line-height:28px;}
 /* The side column: 다가오는 일, 지난주 요약, 주간 연습 and 오늘 부를 곡 one under another, 16px apart. */
 #vocalzip-refined-preview .vz-col.vz-col-side{display:flex;flex-direction:column;gap:16px;}
 #vocalzip-refined-preview .vz-col.vz-col-side>*{margin:0;}
 #vocalzip-refined-preview .vz-col.vz-col-side>.vz-upcoming:not([hidden])+.vz-weekly-line{margin-top:-6px;} /* 10px under the date cards, as on phones */
 #vocalzip-refined-preview .vz-sec-title,#vocalzip-refined-preview .vz-recent-heading{font-size:19px;line-height:26px;}
 #vocalzip-refined-preview .vz-recent-pills{flex-wrap:wrap;margin:-2px 0 0;padding:2px 0 4px;overflow:visible;}
 #vocalzip-refined-preview .vz-recent-pills::after{display:none;}
 #vocalzip-refined-preview .vz-recent-pill{max-width:100%;}
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
 const todayStyle=el("style",PRACTICE_CARD_CSS);todayStyle.dataset.integration="today";shadow.append(todayStyle);
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
 /* v4 home (docs/design/VOCALZIP_DESIGN_SYSTEM_V4_2026-11-12.md, Home order): the top (today's ring, the week's days,
  * the 단계 chips), ONE 오늘의 연습 card, 다가오는 일 (the next lesson and stage as date cards) and the songs for today as chips.
  * The approved markup still supplies the cards and dock; its "지금 할 것" event card and event rows, week rings and
  * recent-song/shortcut tiles leave home (home step 2, 2026-11-27: the event card went; 기록 and 성장 hold the rest). */
 const section=q(".vz-schedule");
 q(".vz-quick-grid")?.remove();const weekCard=q(".vz-week"); // 주간 연습 card: shown on tablets only (CSS)
 /* 오늘 위쪽 (home top, 2026-11-27). The wordmark leaves; in its place today's minutes as a ring against the day's target
  * (the numbers VZ.todayPractice gives), the date and one short line. The bell and the gear stay where they were. */
 const header=q(".vz-header");header.classList.add("vz-has-top");q(".vz-logo")?.remove();
 const top=el("div",null,"vz-top"),ring=el("div",null,"vz-ring"),words=el("div",null,"vz-top-words"),dateLine=el("p",null,"vz-top-date");
 ring.dataset.homeRing="";ring.setAttribute("role","img");
 const R=37.5,C=2*Math.PI*R,gradient="vz-ring-grad-"+Math.random().toString(36).slice(2,8);
 const star=(x,y,size,color,delay,duration)=>'<span class="vz-tw" style="left:'+x+'px;top:'+y+'px;animation-delay:'+delay+'s;animation-duration:'+duration+'s"><svg width="'+size+'" height="'+size+'" style="width:'+size+'px;height:'+size+'px" viewBox="0 0 24 24"><path d="M12 1.5c.6 5.4 3.1 9.9 10.5 10.5-7.4.6-9.9 5.1-10.5 10.5C11.4 17.1 8.9 12.6 1.5 12 8.9 11.4 11.4 6.9 12 1.5z" fill="'+color+'"/></svg></span>';
 ring.innerHTML='<svg class="vz-ring-svg" viewBox="0 0 84 84" aria-hidden="true"><defs><linearGradient id="'+gradient+'" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#B07CFF"/><stop offset=".5" stop-color="#7A32F5"/><stop offset="1" stop-color="#4E17B0"/></linearGradient></defs>'+
  '<circle cx="42" cy="42" r="'+R+'" fill="none" stroke="#E9E0FB" stroke-width="7"/><circle class="vz-ring-bar" cx="42" cy="42" r="'+R+'" fill="none" stroke="url(#'+gradient+') #7A32F5" stroke-width="7" stroke-linecap="round" stroke-dasharray="'+C.toFixed(2)+'" stroke-dashoffset="'+C.toFixed(2)+'" transform="rotate(-90 42 42)"/></svg>'+
  '<span class="vz-stars" aria-hidden="true">'+star(74,-6,9,"#B892FF",0,2.4)+star(86,35,6,"#C9AEFB",.8,2)+star(70,82,5,"#B892FF",1.5,2.2)+star(-8,50,7,"#C9AEFB",1.1,2.7)+star(4,-2,5,"#B892FF",1.9,2.1)+'</span>'+
  '<span class="vz-ring-num" aria-hidden="true"><b></b><small>분</small></span>';
 const ringBar=ring.querySelector(".vz-ring-bar"),ringNum=ring.querySelector(".vz-ring-num");
 let say=el("p",null,"vz-top-say");
 words.append(dateLine,say);top.append(ring,words);header.prepend(top);
 /* 로고 (2026-11-27, 안 C): 앱 아이콘 모양의 보라 네모 + "vocal.zip", 알림·설정 버튼과 같은 높이의 맨 윗줄. */
 const brand=el("div",null,"vz-brand");brand.setAttribute("role","img");brand.setAttribute("aria-label","VOCAL.zip");
 brand.innerHTML='<span class="vz-brand-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-linecap="round"><path d="M4 10v4"/><path d="M8 7v10"/><path d="M12 4v16"/><path d="M16 8v8"/><path d="M20 10v4"/></svg></span><span class="vz-brand-word" aria-hidden="true">vocal<b>.zip</b></span>';
 header.prepend(brand);
 /** Today's minutes against today's target (null: no target, an empty ring and the way to set one). */
 const paintRing=(raw,dayTarget)=>{
  const mine=Math.round(raw),ratio=dayTarget?Math.min(1,raw/dayTarget):0,met=!!dayTarget&&raw>=dayTarget;
  ringBar.setAttribute("stroke-dashoffset",(C*(1-ratio)).toFixed(2));ringBar.style.opacity=ratio>0?"1":"0";
  ringNum.firstChild.textContent=String(mine);ringNum.dataset.digits=String(Math.min(4,String(mine).length));
  ring.dataset.met=String(met);
  ring.setAttribute("aria-label","오늘 연습 "+duration(mine)+(dayTarget?", 오늘 목표 "+duration(dayTarget)+", 달성률 "+Math.round(raw/dayTarget*100)+"%":", 오늘 목표 없음"));
  const next=dayTarget?el("p",met?"오늘 목표 달성!":duration(Math.max(1,Math.round(dayTarget-raw)))+"만 더 하면 오늘 목표","vz-top-say"):el("button","오늘 목표를 정해 보세요","vz-top-say");
  if(met)next.dataset.met="true";
  if(!dayTarget){next.type="button";next.onclick=()=>opts.onGoals?.();}
  next.dataset.homeSay="";say.replaceWith(next);say=next;
 };
 /* The week's days under a thin line: practised days filled, today ringed. The whole row opens the week sheet. */
 const weekStrip=el("button",null,"vz-week-strip"),stripText=el("span",null,"vz-week-strip-text"),stripDots=el("span",null,"vz-week-dots");
 weekStrip.type="button";weekStrip.dataset.homeWeek="";stripDots.setAttribute("aria-hidden","true");weekStrip.append(stripText,stripDots);
 weekStrip.onclick=()=>(opts.onWeekSummary||opts.onWeek)?.();
 /* 큰 단계 (app/levels.js) and the eight 기본기 as chips: each opens its own page. Kept and updated in place. */
 const levelRow=el("div",null,"vz-level-row");levelRow.setAttribute("role","group");levelRow.setAttribute("aria-label","단계");levelRow.hidden=true;
 const levelChip=el("button",null,"vz-chip vz-chip-level"),levelText=el("span",null,"vz-chip-face");
 levelChip.type="button";levelChip.dataset.homeLevel="";levelChip.hidden=true;levelChip.append(levelText);
 levelChip.onclick=()=>opts.onLevel?.();
 levelRow.append(levelChip);header.after(weekStrip,levelRow);
 let areaList=Array.isArray(opts.levelAreas)?opts.levelAreas:[];
 const areaSaid=a=>a.state==="step"?(num(a.step)?num(a.step)+"단계":"아직 1단계 전"):a.state==="calibrating"?"기준 맞추는 중":a.state==="soon"?"준비 중":"아직";
 /** info: {level, name, label} (null hides the chip); areas: [{id, title, state, step}] as 단계 shows them. */
 host.updateLevel=(info,areas)=>{
  if(Array.isArray(areas))areaList=areas;
  levelChip.hidden=!info;
  if(info){
   levelText.textContent="Lv "+num(info.level)+" · "+(info.name||"");
   levelChip.dataset.level=String(num(info.level));levelChip.setAttribute("aria-label",info.label||"큰 단계 Lv "+num(info.level)+" "+(info.name||"")+", 단계 보기");
  }
  levelRow.querySelectorAll("[data-home-area]").forEach(e=>e.remove());
  for(const a of areaList){
   if(!a||!a.id)continue;
   const step=a.state==="step"?Math.max(0,Math.min(5,num(a.step))):0,state=step?"earned":a.state==="calibrating"?"calibrating":"none";
   const chip=el("button",null,"vz-chip"),face=el("span",null,"vz-chip-face"),seg=el("span",null,"vz-chip-seg");
   chip.type="button";chip.dataset.homeArea=a.id;chip.dataset.state=state;chip.dataset.step=String(step);
   chip.setAttribute("aria-label",(a.title||"")+", "+areaSaid(a)+", 자세히 보기");
   seg.setAttribute("aria-hidden","true");for(let i=0;i<5;i++){const bit=el("i");if(i<step)bit.className="is-on";seg.append(bit);}
   face.append(document.createTextNode(a.title||""),seg);chip.append(face);chip.onclick=()=>opts.onLevelArea?.(a.id);levelRow.append(chip);
  }
  levelRow.hidden=!info&&!levelRow.querySelector("[data-home-area]");
 };
 host.updateLevel(opts.level||null);
 /* 오늘의 연습 (home step 2, 2026-11-27): ONE card for today's goals (필수 미션), the set's steps (a bar and a row of
  * tiles) and the free timer (design-system/practice-card-html.js; data and actions from the app). It takes the place
  * of the "지금 할 것" card and of the former 오늘 연습 card. */
 const todayCard=createPracticeCard(opts.todayCard||{}),practice=todayCard.el;
 host.updateToday=model=>todayCard.update(model);
 host.tickToday=state=>todayCard.tick(state);
 host.updateToday(opts.todayModel||null);
 /** Bring 오늘의 연습 into view (the former 보컬 트레이닝 addresses and "연습은 오늘 탭에서 해요" lead here). */
 host.showPractice=()=>todayCard.show();
 /* 다가오는 일 (home step 3, 2026-11-27): the next lesson and the next stage as two date cards side by side (a lone one
  * takes the whole row, so its line has room), under "다가오는 일" and 캘린더 ›. Neither: the section is not shown.
  * 지난주 요약 (app/weekly-summary.js, Mon–Wed until opened) is its own slim row under them. */
 const upcoming=el("section",null,"vz-upcoming");upcoming.dataset.homeUpcoming="";upcoming.setAttribute("aria-labelledby","vz-upcoming-title");
 const upHead=el("div",null,"vz-sec-head"),upTitle=el("h2","다가오는 일","vz-sec-title"),calLink=el("button",null,"vz-sec-link");
 upTitle.id="vz-upcoming-title";calLink.type="button";calLink.dataset.homeCalendar="";calLink.setAttribute("aria-label","캘린더 보기");
 calLink.append("캘린더",icon(ICON.chevron,{size:12,width:2.2}));calLink.onclick=()=>opts.onCalendar?.();
 const upCards=el("div",null,"vz-up-cards");upHead.append(upTitle,calLink);upcoming.append(upHead,upCards);
 const weeklyLine=el("section",null,"vz-weekly-line");weeklyLine.setAttribute("aria-label","지난주 요약");weeklyLine.dataset.homeWeekly="";
 const recentWrap=el("section",null,"vz-recent");recentWrap.setAttribute("aria-label","최근 곡");
 // The approved markup's 오늘의 목표 card only marks the place: 오늘의 연습 holds the goals now.
 const goalsCard=q(".vz-goals");goalsCard.after(upcoming,weeklyLine,recentWrap);
 // Two columns on wide screens (tablet landscape, desktop): 오늘의 연습 | 다가오는 일 + 오늘 부를 곡. On phones the
 // columns are display:contents, so the order and spacing stay exactly as before.
 const mainColumn=el("div",null,"vz-col vz-col-main"),sideColumn=el("div",null,"vz-col vz-col-side");
 section.before(mainColumn);mainColumn.append(practice);section.remove();goalsCard.remove();mainColumn.after(sideColumn);sideColumn.append(upcoming,weeklyLine,weekCard,recentWrap);
 /** One date card: {key, date (YYYY-MM-DD), label, badge (D-n), line, aria, action}. */
 const dateCard=item=>{
  const card=el("button",null,"vz-up-card");card.type="button";card.dataset.row=item.key||"";
  const d=new Date(String(item.date)+"T12:00:00"),ok=!Number.isNaN(d.getTime());
  const square=el("span",null,"vz-up-date");square.setAttribute("aria-hidden","true");square.append(el("small",ok?"일월화수목금토"[d.getDay()]:""),el("b",ok?String(d.getDate()):""));
  const words=el("span",null,"vz-up-words"),title=el("span",null,"vz-up-title");
  title.append(el("span",item.label||""));if(item.badge)title.append(el("b",item.badge,"vz-up-dday"));
  words.append(title);if(item.line)words.append(el("span",item.line,"vz-up-line"));
  card.append(square,words);card.setAttribute("aria-label",item.aria||[item.label,item.line,item.badge].filter(Boolean).join(", "));
  card.onclick=()=>item.action?.();return card;
 };
 /** items: the date cards (lesson, stage); weekly: the 지난주 요약 row {label, value, aria, action} or null. */
 host.updateUpcoming=(items,weekly)=>{
  const list=(Array.isArray(items)?items:[]).filter(x=>x&&x.date).slice(0,2);
  upCards.replaceChildren(...list.map(dateCard));upCards.dataset.count=String(list.length);upcoming.hidden=!list.length;
  weeklyLine.replaceChildren();weeklyLine.hidden=!weekly;
  if(weekly){
   const row=el("button",null,"vz-weekly-row"),round=el("span",null,"vz-round-icon"),words=el("span");row.type="button";row.dataset.row="weekly";
   round.setAttribute("aria-hidden","true");round.append(icon(ICON.chart,{size:16,width:2}));
   words.append(el("strong",weekly.label||"지난주 요약"),el("small",weekly.value||""));
   row.append(round,words,icon(ICON.chevron,{size:14,width:2}));
   row.setAttribute("aria-label",weekly.aria||[weekly.label,weekly.value].filter(Boolean).join(", "));row.onclick=()=>weekly.action?.();weeklyLine.append(row);
  }
 };
 host.updateUpcoming(opts.upcoming,opts.weekly||null);
 const shortDate=date=>{const parts=String(date||"").split("-");return parts.length===3?Number(parts[1])+"."+Number(parts[2]):"";};
/* 주간 연습 card (week rings, arrows, swipe): the approved card, kept for tablets where there is room beside the
  * summary. Phones have the week's days at the top instead. */
 const flame=el("i","","vz-ui-icon");flame.setAttribute("aria-hidden","true"); // 주간 연습 card streak (tablets)
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
 /** The ring, the date line and the week's days always describe today and this week, whichever week the card shows.
  * day = {minutes, targetMinutes} from VZ.todayPractice (the shared helper); without it, today's cell of the week. */
 let todayInfo=opts.todayPractice||null;
 host.updateThisWeek=(week,day)=>{
  week=week||{};if(day)todayInfo=day;
  const actual=num(week.actualMinutes),target=Number(week.targetMinutes)>0?Number(week.targetMinutes):null,percent=target?Math.round(actual/target*100):null;
  const t=todayInfo||(week.days||[]).find(d=>d.today)||{},dayTarget=Number(t.targetMinutes)>0?Number(t.targetMinutes):null;
  paintRing(num(t.minutes),dayTarget);
  const d=opts.today?new Date(opts.today+"T12:00:00"):new Date();
  dateLine.textContent=(d.getMonth()+1)+"월 "+d.getDate()+"일 "+"일월화수목금토"[d.getDay()]+"요일";
  // 연속: counted back from this week's latest practised day (it can reach into last week, then "이번 주" is not said).
  const days=(week.days||[]).slice(0,7),on=days.map(x=>num(x.minutes)>0),streak=num(week.streak);
  let inWeek=0;for(let i=on.lastIndexOf(true);i>=0&&on[i];i--)inWeek++;
  const lead=streak?(streak<=inWeek?"이번 주 ":""):"이번 주 ",strong=streak?"연속 "+streak+"일":on.filter(Boolean).length+"일",tail=streak?"":" 연습";
  stripText.replaceChildren(...[lead,el("b",strong),tail].filter(Boolean));weekStrip.dataset.streak=String(streak);
  stripDots.replaceChildren(...days.map(x=>{const cell=el("span");cell.dataset.date=x.date||"";cell.dataset.practiced=String(num(x.minutes)>0);cell.dataset.today=String(!!x.today);cell.append(el("small",x.label||""),el("i"));return cell;}));
  weekStrip.setAttribute("aria-label",(lead+strong+tail).trim()+", 이번 주 연습 "+duration(actual)+(target?", 목표 "+duration(target)+", 달성률 "+percent+"%":", 목표 없음")+", 자세히 보기");
 };
 host.updateWeek(opts.week||{});if(opts.thisWeek)host.updateThisWeek(opts.thisWeek);
 /* 오늘 부를 곡 (app/song-pick-model.js): up to three white chips (a note in a light circle, the title, why today) in a
  * row that scrolls sideways; 랜덤 on the right of the head spins the roulette. Songs without a reason are the old 최근 곡. */
 host.updateRecent=(songs,onOpen=opts.onRecentSong)=>{
  const list=(Array.isArray(songs)?songs:[]).slice(0,3);recentWrap.replaceChildren();recentWrap.hidden=!list.length;if(!list.length)return;
  const picked=list.some(song=>song.reason);recentWrap.setAttribute("aria-label",picked?"오늘 부를 곡":"최근 곡");
  const head=el("div",null,"vz-pick-head");head.append(el("h2",picked?"오늘 부를 곡":"최근 곡","vz-recent-heading"));
  // 랜덤 (owner, 2026-11-25): one of my songs at random (the roulette), straight to recording it.
  if(picked&&opts.onRandomSong){
   const r=el("button",null,"vz-pick-random"),face=el("span");r.type="button";r.setAttribute("aria-label","아무 곡이나 랜덤으로 고르기");
   face.append(icon(ICON.dice,{size:14,width:2.2}),"랜덤");r.append(face);r.onclick=()=>opts.onRandomSong();head.append(r);
  }
  recentWrap.append(head);
  const pills=el("div",null,"vz-recent-pills");
  for(const song of list){
   const b=el("button",null,"vz-recent-pill"+(song.reason?" vz-pick-pill":"")),round=el("span",null,"vz-round-icon"),words=el("span",null,"vz-pick-words");
   b.type="button";round.setAttribute("aria-hidden","true");round.append(icon(ICON.note,{size:16,width:2}));
   words.append(el("span",song.title||"곡"));if(song.reason)words.append(el("small",song.reason+(song.extra?" · "+song.extra:""),"vz-pick-why"));
   b.append(round,words);b.setAttribute("aria-label",(song.title||"곡")+" 연습하기");
   if(song.reason){const why=words.lastChild;why.id="vz-pick-why-"+pills.childElementCount;b.setAttribute("aria-describedby",why.id);}
   b.onclick=()=>onOpen?.(song);pills.append(b);
  }
  recentWrap.append(pills);
 };
 host.updateRecent(opts.recentSongs);
 const regular=(glyph)=>{const icon=el("i",glyph,"vz-ui-icon");icon.setAttribute("aria-hidden","true");return icon;};
 const swap=(selector,glyph)=>root.querySelectorAll(selector).forEach(svg=>svg.replaceWith(regular(glyph)));
  // Semantic icons share the same Phosphor Regular weight as the practice timer.
 // Chevrons, add controls, status marks, logo, play and record icons keep their own rules.
 swap(".vz-header-actions button:first-child svg","\ue0ce");swap(".vz-header-actions button:last-child svg","\ue272");
 swap(".vz-week .vz-title > svg:not(.vz-chevron)","\ue150");
 q(".vz-floating-record").onclick=event=>opts.onRecord?.(event.currentTarget);
 const routes=["home","songs","calendar","vocal-growth"];
 [...root.querySelectorAll(".vz-nav-item")].forEach((button,i)=>{button.dataset.nav=routes[i];button.onclick=()=>opts.onNavigate?.(routes[i]);});
 return host;
}




