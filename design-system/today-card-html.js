/* 오늘 연습 — ONE card on home for today's goals and today's practice (owner's design, 2026-11-26: scratch mockups
 * Flow · Today · Stop). It takes the place of the separate 오늘의 목표 and 연습하기 cards.
 *   head    "계획 n/m · 추가 k · 오늘 X분", today against 하루 목표 and the last seven days as small bars (what the result
 *           popup used to say for six seconds after a save is always here now).
 *   list    계획 rows (today's goals: check circle · title · 숙제/계획/반복 n/m · minutes) and, under a divider, 추가 rows
 *           (today's records linked to no goal: green + · title · 추가 · minutes). The data is app/today-card.js.
 *   inline  Nothing in this card opens a sheet or a popup: a 계획 row opens chips under itself (오늘 기록 연결 · 시간 적고
 *           체크 · 세트로 하기 · 녹음하기 — the recorder carrying the goal), a 추가 row opens 곡·분류·메모, + 직접 적기 opens a short form. Only + 계획 넣기 opens the
 *           goal picker as before.
 *   set     오늘의 연습: its state line, "시작하면: …" (the steps unfold under it), 시작하기 and 타이머만 켜기 beside it. While
 *           the free timer runs (app/free-timer.js) the two buttons give way to "연습 중 · mm:ss · 멈추기".
 *   rows    매일 보이스 체크 · 내 로드맵 · 주간 돌아보기 as small rows.
 * The home adapter gives data and actions (design-system/student-home-app.js); an action throws Error(message) to have
 * the message said inline. The card keeps which row is open and what was typed across redraws. */
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[c]);
const minutesText=n=>{n=Math.max(0,Math.round(Number(n)||0));return n>=60?Math.floor(n/60)+"시간"+(n%60?" "+n%60+"분":""):n+"분";};
const CHECK="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 22'%3E%3Ccircle cx='11' cy='11' r='11' fill='%237A32F5'/%3E%3Cpath d='M6.5 11.3l3 2.9 6-6.2' fill='none' stroke='%23fff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E";
const RING="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 22 22'%3E%3Ccircle cx='11' cy='11' r='10' fill='%23fff' stroke='%23D0D5DD' stroke-width='2'/%3E%3C/svg%3E";
export const TODAY_CARD_CSS=String.raw`
/* 오늘 연습 (design-system/today-card-html.js) */
#vocalzip-refined-preview .vz-today-card{display:block;padding:16px 14px 6px 16px;border-radius:20px;background:#fff;scroll-margin-top:12px;}
#vocalzip-refined-preview .vz-today-card.is-shown{box-shadow:0 0 0 2px #DCC4FF;}
#vocalzip-refined-preview .vz-today-card [hidden]{display:none!important;}
#vocalzip-refined-preview .vz-today-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:2px 10px;}
#vocalzip-refined-preview .vz-today-card .vz-practice-title{margin:0;font-size:17px;line-height:24px;font-weight:700;color:var(--vz-color-ink,#101828);outline:none;}
#vocalzip-refined-preview .vz-today-count{margin:0;font-size:13px;line-height:18px;color:var(--vz-color-ink-muted,#667085);font-variant-numeric:tabular-nums;}
#vocalzip-refined-preview .vz-today-count b{color:var(--vz-color-ink,#101828);font-weight:700;}
#vocalzip-refined-preview .vz-today-goal{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:4px 12px;margin:10px 0 4px;}
#vocalzip-refined-preview .vz-today-goal-line{grid-column:1;margin:0;font-size:13px;line-height:18px;font-weight:600;color:var(--vz-color-ink-secondary,#475467);font-variant-numeric:tabular-nums;}
#vocalzip-refined-preview .vz-today-goal[data-met="true"] .vz-today-goal-line{color:var(--vz-color-accent,#7A32F5);}
#vocalzip-refined-preview .vz-today-bar{grid-column:1;height:6px;border-radius:99px;background:#F2EFF7;overflow:hidden;}
#vocalzip-refined-preview .vz-today-bar i{display:block;height:100%;border-radius:99px;background:var(--vz-color-accent,#7A32F5);}
#vocalzip-refined-preview .vz-today-days{grid-column:2;grid-row:1/3;display:flex;align-items:flex-end;gap:3px;height:34px;}
#vocalzip-refined-preview .vz-today-day{display:flex;flex-direction:column;align-items:center;gap:2px;width:12px;}
#vocalzip-refined-preview .vz-today-day span{position:relative;display:block;width:8px;height:20px;border-radius:3px;background:#F2EFF7;overflow:hidden;}
#vocalzip-refined-preview .vz-today-day span i{position:absolute;left:0;right:0;bottom:0;border-radius:3px;background:#C9B2F7;}
#vocalzip-refined-preview .vz-today-day[data-met="true"] span i{background:var(--vz-color-accent,#7A32F5);}
#vocalzip-refined-preview .vz-today-day small{font-size:9px;line-height:10px;color:var(--vz-color-ink-muted,#667085);}
#vocalzip-refined-preview .vz-today-day[data-today="true"] small{color:var(--vz-color-accent,#7A32F5);font-weight:700;}
#vocalzip-refined-preview .vz-today-list{list-style:none;margin:6px 0 0;padding:0;}
#vocalzip-refined-preview .vz-today-item+.vz-today-item{border-top:1px solid #F2EFF7;}
#vocalzip-refined-preview .vz-today-sep{height:1px;margin:2px 0;background:#EAECF0;list-style:none;}
#vocalzip-refined-preview .vz-today-sep+.vz-today-item{border-top:0;}
#vocalzip-refined-preview .vz-today-row{display:flex;align-items:center;gap:6px;min-height:48px;}
#vocalzip-refined-preview input[type=checkbox].vz-today-check{flex:none;-webkit-appearance:none;appearance:none;width:44px;height:44px;margin:0 0 0 -11px;padding:0;border:0;border-radius:50%;background:url("${RING}") center/22px 22px no-repeat;cursor:pointer;}
#vocalzip-refined-preview input[type=checkbox].vz-today-check:checked{background:url("${CHECK}") center/22px 22px no-repeat;}
#vocalzip-refined-preview input[type=checkbox].vz-today-check:checked:after{content:none;display:none;}
#vocalzip-refined-preview input[type=checkbox].vz-today-check:disabled{opacity:.6;}
#vocalzip-refined-preview input[type=checkbox].vz-today-check:focus-visible{outline:2px solid #DCC4FF;outline-offset:-4px;}
#vocalzip-refined-preview .vz-today-plus{flex:none;display:grid;place-items:center;width:22px;height:22px;margin:0 11px 0 0;border-radius:50%;background:#E3F4EC;color:#23855C;font-size:15px;line-height:1;font-weight:700;}
#vocalzip-refined-preview .vz-today-main{flex:1;min-width:0;display:flex;align-items:center;gap:8px;min-height:48px;margin:0;padding:0;border:0;background:none;color:var(--vz-color-ink,#101828);font:inherit;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent;}
#vocalzip-refined-preview .vz-today-main:focus-visible{outline:2px solid #DCC4FF;outline-offset:2px;border-radius:10px;}
#vocalzip-refined-preview .vz-today-title{flex:1;min-width:0;overflow-wrap:anywhere;font-size:14px;line-height:1.43;}
#vocalzip-refined-preview .vz-today-item[data-done="true"] .vz-today-title{color:var(--vz-color-ink-secondary,#475467);}
#vocalzip-refined-preview .vz-today-item[data-undecided="true"] .vz-today-title{color:var(--vz-color-ink-secondary,#475467);}
#vocalzip-refined-preview .vz-today-tag{flex:none;padding:2px 8px;border-radius:99px;background:#F3ECFF;color:#5B1FC2;font-size:11px;line-height:1.45;font-weight:600;white-space:nowrap;}
#vocalzip-refined-preview .vz-today-item.is-extra .vz-today-tag{background:#E3F4EC;color:#23855C;}
#vocalzip-refined-preview .vz-today-min{flex:none;min-width:36px;text-align:right;font-size:13px;line-height:1.4;color:#344054;font-variant-numeric:tabular-nums;white-space:nowrap;}
#vocalzip-refined-preview .vz-today-min[data-empty="true"]{color:#98A2B3;}
#vocalzip-refined-preview .vz-today-panel{margin:0 0 10px 33px;}
#vocalzip-refined-preview .vz-today-chips{display:flex;flex-wrap:wrap;gap:6px;}
#vocalzip-refined-preview .vz-today-chip{display:inline-flex;box-sizing:border-box;text-decoration:none;align-items:center;min-height:36px;max-width:100%;margin:0;padding:0 12px;border:1px solid #E4D7FB;border-radius:999px;background:#fff;color:var(--vz-color-accent,#7A32F5);font:inherit;font-size:13px;line-height:18px;font-weight:600;cursor:pointer;text-align:left;}
#vocalzip-refined-preview .vz-today-chip[aria-pressed="true"]{border-color:var(--vz-color-accent,#7A32F5);background:var(--vz-color-accent,#7A32F5);color:#fff;}
#vocalzip-refined-preview .vz-today-chip.is-link{background:#F3ECFF;border-color:#F3ECFF;}
#vocalzip-refined-preview .vz-today-chip:focus-visible{outline:2px solid #DCC4FF;outline-offset:2px;}
#vocalzip-refined-preview .vz-today-form{display:grid;gap:10px;margin:4px 0 10px;padding:12px;border-radius:14px;background:#F9F7FD;}
#vocalzip-refined-preview .vz-today-panel .vz-today-form{margin:0;}
#vocalzip-refined-preview .vz-today-label{margin:0;font-size:13px;line-height:18px;font-weight:600;color:var(--vz-color-ink-secondary,#475467);}
#vocalzip-refined-preview .vz-today-label small{font-weight:400;color:var(--vz-color-ink-muted,#667085);}
#vocalzip-refined-preview .vz-today-stepper{display:flex;align-items:center;gap:8px;}
#vocalzip-refined-preview .vz-today-stepper button{display:grid;place-items:center;width:44px;height:44px;border:0;border-radius:50%;background:#F3ECFF;color:var(--vz-color-accent,#7A32F5);font:inherit;font-size:13px;font-weight:700;cursor:pointer;}
#vocalzip-refined-preview .vz-today-stepper label{display:flex;align-items:baseline;gap:4px;}
#vocalzip-refined-preview .vz-today-form input[type=number]{width:72px;min-height:44px;box-sizing:border-box;padding:0 8px;border:1px solid #D0D5DD;border-radius:12px;background:#fff;font:inherit;font-size:16px;text-align:center;font-variant-numeric:tabular-nums;}
#vocalzip-refined-preview .vz-today-form input[type=date],#vocalzip-refined-preview .vz-today-form select,#vocalzip-refined-preview .vz-today-form textarea{width:100%;min-height:44px;box-sizing:border-box;padding:8px 10px;border:1px solid #D0D5DD;border-radius:12px;background:#fff;color:var(--vz-color-ink,#101828);font:inherit;font-size:16px;}
#vocalzip-refined-preview .vz-today-form textarea{min-height:64px;resize:vertical;}
#vocalzip-refined-preview .vz-today-field{display:grid;gap:6px;margin:0;padding:0;border:0;min-width:0;}
#vocalzip-refined-preview .vz-today-actions{display:flex;justify-content:flex-end;gap:8px;}
#vocalzip-refined-preview .vz-today-actions button{min-height:44px;padding:0 16px;border:0;border-radius:12px;background:#F3ECFF;color:var(--vz-color-accent,#7A32F5);font:inherit;font-size:14px;font-weight:700;cursor:pointer;}
#vocalzip-refined-preview .vz-today-actions button[type=submit]{background:var(--vz-color-accent,#7A32F5);color:#fff;}
#vocalzip-refined-preview .vz-today-error{margin:0;font-size:12px;line-height:1.45;color:#b42318;}
#vocalzip-refined-preview .vz-today-error:empty{display:none;}
#vocalzip-refined-preview .vz-today-help{margin:0;font-size:13px;line-height:18px;color:var(--vz-color-ink-muted,#667085);}
#vocalzip-refined-preview .vz-today-help a{color:var(--vz-color-accent,#7A32F5);font-weight:600;}
#vocalzip-refined-preview .vz-today-hint{display:flex;flex-wrap:wrap;align-items:center;gap:0 6px;margin:6px 0 0;padding:8px 12px;border-radius:12px;background:#F3ECFF;font-size:13px;line-height:18px;color:#344054;}
#vocalzip-refined-preview .vz-today-hint button{min-height:36px;padding:0;border:0;background:none;color:var(--vz-color-accent,#7A32F5);font:inherit;font-weight:700;cursor:pointer;}
#vocalzip-refined-preview .vz-today-adds{display:flex;gap:16px;margin:2px 0 0;}
#vocalzip-refined-preview .vz-today-adds button{min-height:44px;padding:0;border:0;background:none;color:var(--vz-color-accent,#7A32F5);font:inherit;font-size:13px;font-weight:700;cursor:pointer;}
#vocalzip-refined-preview .vz-today-note{margin:0 0 6px;font-size:13px;line-height:18px;color:var(--vz-color-ink-secondary,#475467);}
#vocalzip-refined-preview .vz-today-note:empty{display:none;}
#vocalzip-refined-preview .vz-today-set{margin:6px 0 0;padding:6px 0 0;border-top:1px solid #EAECF0;}
#vocalzip-refined-preview .vz-today-set .vz-set-card{padding:0 0 10px;}
#vocalzip-refined-preview .vz-set-steps{display:block;width:100%;min-height:44px;margin:0 0 8px;padding:4px 0;border:0;background:none;color:#344054;font:inherit;font-size:13px;line-height:1.6;text-align:left;cursor:pointer;}
#vocalzip-refined-preview .vz-set-steps:focus-visible{outline:2px solid #DCC4FF;outline-offset:2px;border-radius:8px;}
#vocalzip-refined-preview .vz-set-steps::after{content:" ▾";color:#98A2B3;}
#vocalzip-refined-preview .vz-set-steps[aria-expanded="true"]::after{content:" ▴";}
#vocalzip-refined-preview .vz-today-go{display:flex;gap:8px;}
#vocalzip-refined-preview .vz-today-go .vz-set-go{flex:1;min-width:0;}
#vocalzip-refined-preview .vz-timer-start{flex:none;min-height:56px;margin:0;padding:0 14px;border:0;border-radius:16px;background:#F3ECFF;color:#5B1FC2;font:inherit;font-size:15px;font-weight:700;cursor:pointer;white-space:nowrap;}
#vocalzip-refined-preview .vz-timer-start:focus-visible{outline:2px solid #DCC4FF;outline-offset:2px;}
#vocalzip-refined-preview .vz-today-timer{display:flex;align-items:center;gap:10px;min-height:56px;padding:0 6px 0 16px;border-radius:16px;background:#F3ECFF;color:#5B1FC2;}
#vocalzip-refined-preview .vz-today-timer>span{flex:1;min-width:0;font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;}
#vocalzip-refined-preview .vz-today-timer button{min-height:44px;padding:0 16px;border:0;border-radius:12px;background:var(--vz-color-accent,#7A32F5);color:#fff;font:inherit;font-size:14px;font-weight:700;cursor:pointer;}
#vocalzip-refined-preview .vz-today-away{display:grid;gap:8px;padding:12px;border-radius:16px;background:#F3ECFF;color:#344054;font-size:13px;line-height:18px;}
#vocalzip-refined-preview .vz-today-away strong{color:#5B1FC2;font-size:14px;}
#vocalzip-refined-preview .vz-today-away div{display:flex;flex-wrap:wrap;gap:8px;}
#vocalzip-refined-preview .vz-today-away button{min-height:44px;padding:0 14px;border:0;border-radius:12px;background:#fff;color:var(--vz-color-accent,#7A32F5);font:inherit;font-size:13px;font-weight:700;cursor:pointer;}
#vocalzip-refined-preview .vz-today-links{margin:6px 0 0;border-top:1px solid #EAECF0;}
#vocalzip-refined-preview .vz-today-links .vz-practice-row{min-height:44px;}
@media(min-width:768px){
 #vocalzip-refined-preview .vz-col>.vz-today-card{padding:20px 20px 10px 24px;}
 #vocalzip-refined-preview .vz-today-card .vz-practice-title{font-size:20px;line-height:28px;}
 #vocalzip-refined-preview .vz-today-title{font-size:16px;line-height:1.5;}
}
`;
const STATE_WORD={done:"완료",next:"다음",left:"남음",skipped:"건너뜀"};
/** "시작하면: …" — the steps still to do, said shortly: built-in exercises as "기본기 n개", goals as "계획 n개". */
export function stepsLine(set,groups=[]){
 if(!set)return "";
 const items=(Array.isArray(set.items)?set.items:[]),left=set.state==="done"||set.state==="summary"?items.filter(x=>x.state==="done"):items.filter(x=>x.state!=="done"&&x.state!=="skipped");
 const builtIn=new Set(groups);
 const word=x=>{const label=String(x.label||"").replace(/ · 추천$/,"");
  if(builtIn.has(label))return "기본기";
  if(label==="곡")return "곡에 적용하기";
  if(label==="녹음"||label==="숙제"||label==="레슨 지적")return label;
  if(label==="시작 체크")return x.title||label;
  if(/목표|반복|추천|개인/.test(label))return "계획";
  return x.title||label;};
 const parts=[];for(const x of left){const w=word(x),last=parts.at(-1);if(last&&last.w===w)last.n++;else parts.push({w,n:1});}
 const text=parts.map(p=>p.n>1?p.w+" "+p.n+"개":p.w).join(" → ");
 if(!text)return "";
 return (set.state==="new"?"시작하면: ":set.state==="live"?"남은 것: ":"오늘 한 것: ")+text;
}
export function createTodayCard(opts={}){
 const card=document.createElement("section");
 card.className="vz-card vz-today-card";card.dataset.homePractice="";card.dataset.homeToday="";card.setAttribute("aria-labelledby","vz-practice-title");
 card.innerHTML='<div class="vz-today-head"><h2 id="vz-practice-title" class="vz-practice-title" tabindex="-1">오늘 연습</h2><p class="vz-today-count" data-today-count></p></div>'+
  '<div class="vz-today-goal" data-today-goal></div><p class="vz-today-error vz-save-error" role="status" aria-live="polite" data-today-error></p>'+
  '<ul class="vz-today-list" data-today-list aria-label="오늘 연습 목록"></ul><div data-today-hint-host></div>'+
  '<div class="vz-today-adds"><button type="button" data-today-add-plan data-k="add-plan">+ 계획 넣기</button><button type="button" data-today-direct data-k="direct" aria-expanded="false">+ 직접 적기</button></div>'+
  '<div data-today-direct-host></div><p class="vz-today-note" role="status" aria-live="polite" data-today-note></p>'+
  '<div class="vz-today-set" data-today-set></div><div class="vz-today-links vz-practice-list" data-today-links></div>';
 const $=s=>card.querySelector(s);
 let model=null,sign="",open=null,showAll=false,stepsOpen=false,focusKey="";
 const drafts={time:null,direct:null,extra:null};
 const rootNode=()=>card.getRootNode();
 const say=(where,text)=>{const box=where?.querySelector?.("[data-error]")||$("[data-today-error]");if(box)box.textContent=text||"";};
 /** Run an action; its Error message is said where the action was started. */
 const run=(where,fn)=>{say(where,"");try{const out=fn();if(out&&typeof out.then==="function")return out.catch(e=>{say(where,e?.message||"저장하지 못했어요.");throw e;});return out;}catch(e){say(where,e?.message||"저장하지 못했어요.");return false;}};
 const chip=(label,attrs,cls="")=>'<button type="button" class="vz-today-chip '+cls+'" '+attrs+'>'+esc(label)+"</button>";
 const minutesForm=(d,{submit,question})=>'<p class="vz-today-label">'+esc(question)+'</p><div class="vz-today-stepper"><button type="button" data-step="-5" aria-label="5분 줄이기">−5</button>'+
  '<label><input type="number" name="minutes" min="1" max="1440" inputmode="numeric" value="'+esc(d.minutes??"")+'" aria-label="연습 시간(분)"><span>분</span></label><button type="button" data-step="5" aria-label="5분 늘리기">+5</button></div>'+
  '<div class="vz-today-chips" role="group" aria-label="연습 시간 빠른 선택">'+(model?.chips||[]).map(n=>chip(n+"분",'data-min="'+n+'" aria-pressed="'+(Number(d.minutes)===n)+'"')).join("")+"</div>"+
  '<p class="vz-today-error" role="alert" data-error></p><div class="vz-today-actions"><button type="button" data-cancel>취소</button><button type="submit">'+esc(submit)+"</button></div>";
 const catChips=(d,list)=>'<div class="vz-today-chips" role="group" aria-label="분류">'+list.map(c=>chip(c,'data-cat="'+esc(c)+'" aria-pressed="'+(d.cat===c)+'"')).join("")+"</div>";
 const songSelect=(d,songs)=>'<select name="song" aria-label="곡"><option value="">곡 고르지 않음</option>'+songs.map(s=>'<option value="'+esc(s.id)+'"'+(d.song===s.id?" selected":"")+">"+esc(s.title)+"</option>").join("")+"</select>";
 function planPanel(g){
  if(open.mode==="time"){
   if(drafts.time?.id!==g.id)drafts.time={id:g.id,minutes:g.suggest??null};
   const d=drafts.time;
   return '<form class="vz-today-form" data-time-form="'+esc(g.id)+'">'+minutesForm(d,{submit:g.done?"저장":"저장하고 체크",question:"얼마나 연습했나요?"})+"</form>";
  }
  const links=(model.open||[]).map(x=>chip("오늘 기록 연결 · "+x.label,'data-link="'+esc(x.id)+'" data-k="link:'+esc(g.id)+":"+esc(x.id)+'"',"is-link")).join("");
  return '<div class="vz-today-chips">'+links+chip(g.done?(g.minutes?"시간 고치기":"시간 적기"):"시간 적고 체크",'data-time data-k="time:'+esc(g.id)+'"')+(model.set?chip("세트로 하기",'data-set-from-plan'):"")+(g.record?'<a class="vz-today-chip" data-record-goal href="'+esc(g.record)+'">녹음하기</a>':"")+'</div><p class="vz-today-error" role="alert" data-error></p>';
 }
 function extraPanel(x){
  if(!x.editable)return '<p class="vz-today-help">'+(x.kind==="set"?"오늘의 연습에서 기록했어요.":"다른 화면에서 남긴 기록이에요.")+' <a href="#/practices">연습 기록 보기</a></p>';
  const d=drafts.extra&&drafts.extra.id===x.id?drafts.extra:(drafts.extra={id:x.id,song:x.songId||"",cat:x.category||"",memo:x.memo||""});
  return '<form class="vz-today-form" data-extra-form="'+esc(x.id)+'"><p class="vz-today-help">모두 고르지 않아도 돼요. 안 정하면 그대로 둬요.</p>'+
   '<label class="vz-today-field"><span class="vz-today-label">곡</span>'+songSelect(d,model.songs||[])+"</label>"+
   '<div class="vz-today-field"><span class="vz-today-label">분류</span>'+catChips(d,model.categories||[])+"</div>"+
   '<label class="vz-today-field"><span class="vz-today-label">메모</span><textarea name="memo" maxlength="5000" rows="2">'+esc(d.memo)+"</textarea></label>"+
   '<p class="vz-today-error" role="alert" data-error></p><div class="vz-today-actions"><button type="button" data-cancel>취소</button><button type="submit">저장</button></div></form>';
 }
 function directForm(){
  const d=drafts.direct||(drafts.direct={minutes:30,date:model.today,what:"",song:"",cat:"",memo:""});
  const goals=d.date===model.today?(model.plan||[]).filter(g=>!g.done):[],homework=opts.homeworkFor?.(d.date)||[];
  if(d.what&&![...goals.map(g=>"goal:"+g.id),...homework.map(h=>"hw:"+h.id)].includes(d.what))d.what="";
  const what=[...goals.map(g=>chip("계획 · "+g.title,'data-what="goal:'+esc(g.id)+'" aria-pressed="'+(d.what==="goal:"+g.id)+'"')),...homework.map(h=>chip("숙제였어요 · "+h.title,'data-what="hw:'+esc(h.id)+'" aria-pressed="'+(d.what==="hw:"+h.id)+'"'))].join("");
  return '<form class="vz-today-form" data-direct-form aria-label="연습 직접 적기">'+minutesForm(d,{submit:"저장",question:"연습 시간"}).replace(/<p class="vz-today-error"[\s\S]*$/,"")+
   '<label class="vz-today-field"><span class="vz-today-label">날짜</span><input type="date" name="date" data-k="direct-date" value="'+esc(d.date)+'" required></label>'+
   '<fieldset class="vz-today-field"><legend class="vz-today-label">무슨 연습 <small>선택</small></legend>'+(what?'<div class="vz-today-chips" role="group" aria-label="계획이나 숙제">'+what+"</div>":"")+songSelect(d,model.songs||[])+catChips(d,model.categories||[])+"</fieldset>"+
   '<label class="vz-today-field"><span class="vz-today-label">메모 <small>선택</small></span><textarea name="memo" maxlength="5000" rows="2" placeholder="오늘 연습에서 느낀 점">'+esc(d.memo)+"</textarea></label>"+
   '<p class="vz-today-error" role="alert" data-error></p><div class="vz-today-actions"><button type="button" data-cancel>취소</button><button type="submit">저장</button></div></form>';
 }
 function paintHead(){
  const c=model.counts||{};
  $("[data-today-count]").innerHTML="<b>계획 "+(c.planDone||0)+"/"+(c.planTotal||0)+"</b> · 추가 "+(c.extra||0)+" · 오늘 "+esc(minutesText(model.minutes));
  const t=Number(model.target)>0?Number(model.target):null,p=t?Math.round((Number(model.minutes)||0)/t*100):null,goal=$("[data-today-goal]");
  goal.dataset.met=String(!!t&&model.minutes>=t);
  const days=Array.isArray(model.days)?model.days:[],top=Math.max(t||0,...days.map(d=>Number(d.minutes)||0),1);
  const dayLabel="최근 7일 연습 시간. "+days.map(d=>(d.today?"오늘":d.label+"요일")+" "+minutesText(d.minutes)+(d.met?" 목표 달성":"")).join(", ");
  goal.innerHTML='<p class="vz-today-goal-line" data-today-target>'+(t?"하루 목표 "+esc(minutesText(t))+" · "+p+"%":"하루 목표 없음")+"</p>"+
   (t?'<div class="vz-today-bar" role="progressbar" aria-label="오늘 목표 달성률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+Math.min(100,p)+'"><i style="width:'+Math.min(100,p)+'%"></i></div>':"")+
   (days.length?'<div class="vz-today-days" role="img" aria-label="'+esc(dayLabel)+'" data-today-days>'+days.map(d=>'<span class="vz-today-day" data-met="'+!!d.met+'" data-today="'+!!d.today+'" data-minutes="'+(Number(d.minutes)||0)+'"><span><i style="height:'+((Number(d.minutes)||0)>0?Math.max(8,Math.round((Number(d.minutes)||0)/top*100)):0)+'%"></i></span><small>'+esc(d.today?"오늘":d.label)+"</small></span>").join("")+"</div>":"");
 }
 function paintList(){
  const list=$("[data-today-list]"),plan=model.plan||[],extra=model.extra||[],MAX=5,out=[];
  plan.forEach((g,i)=>{
   const isOpen=open?.key==="plan:"+g.id,pid="vz-today-panel-p"+i;
   out.push('<li class="vz-today-item" data-plan="'+esc(g.id)+'" data-done="'+g.done+'"'+(i>=MAX&&!showAll?" hidden":"")+'><div class="vz-today-row">'+
    '<input type="checkbox" class="vz-today-check" data-check="'+esc(g.id)+'" data-k="check:'+esc(g.id)+'" aria-label="'+esc(g.title)+'"'+(g.done?" checked":"")+">"+
    '<button type="button" class="vz-today-main" data-open="plan:'+esc(g.id)+'" data-k="open:plan:'+esc(g.id)+'" aria-expanded="'+isOpen+'" aria-controls="'+pid+'" aria-label="'+esc([g.title,g.tag,g.minutes?minutesText(g.minutes):"시간 없음"].join(", "))+'">'+
    '<span class="vz-today-title">'+esc(g.title)+'</span><span class="vz-today-tag" data-tag>'+esc(g.tag)+'</span><span class="vz-today-min" data-empty="'+!g.minutes+'">'+(g.minutes?esc(minutesText(g.minutes)):"—")+"</span></button></div>"+
    (isOpen?'<div class="vz-today-panel" id="'+pid+'">'+planPanel(g)+"</div>":"")+"</li>");
  });
  if(plan.length>MAX)out.push('<li class="vz-today-item"><button type="button" class="vz-today-chip" data-more aria-expanded="'+showAll+'" data-k="more">'+(showAll?"접기":"계획 "+(plan.length-MAX)+"개 더 보기")+"</button></li>");
  if(extra.length&&plan.length)out.push('<li class="vz-today-sep" role="presentation"></li>');
  extra.forEach((x,i)=>{
   const isOpen=open?.key==="extra:"+x.id,pid="vz-today-panel-x"+i;
   out.push('<li class="vz-today-item is-extra" data-extra="'+esc(x.id)+'" data-undecided="'+!!x.undecided+'"><div class="vz-today-row"><span class="vz-today-plus" aria-hidden="true">+</span>'+
    '<button type="button" class="vz-today-main" data-open="extra:'+esc(x.id)+'" data-k="open:extra:'+esc(x.id)+'" aria-expanded="'+isOpen+'" aria-controls="'+pid+'" aria-label="'+esc(x.title+", 추가, "+minutesText(x.minutes))+'">'+
    '<span class="vz-today-title">'+esc(x.title)+'</span><span class="vz-today-tag">추가</span><span class="vz-today-min">'+esc(minutesText(x.minutes))+"</span></button></div>"+
    (isOpen?'<div class="vz-today-panel" id="'+pid+'">'+extraPanel(x)+"</div>":"")+"</li>");
  });
  if(!out.length)out.push('<li class="vz-today-item"><p class="vz-today-help" data-today-empty>아직 계획도 기록도 없어요. 계획을 넣거나, 연습하고 적어 보세요.</p></li>');
  list.innerHTML=out.join("");
  $("[data-today-hint-host]").innerHTML=model.hint?'<p class="vz-today-hint" data-today-hint><span>'+esc(model.hint.text)+'</span><span aria-hidden="true">·</span><button type="button" data-hint data-k="hint">반복 계획으로 넣기</button></p>':"";
  const directOpen=open?.key==="direct";
  $("[data-today-direct]").setAttribute("aria-expanded",String(directOpen));
  $("[data-today-direct-host]").innerHTML=directOpen?directForm():"";
 }
 function paintSet(){
  const host=$("[data-today-set]"),set=model.set,timer=model.timer;
  let html="";
  if(set){
   const items=Array.isArray(set.items)?set.items:[],steps=stepsLine(set,model.groups);
   html+='<div class="vz-set-card" data-row="practice-set" data-state="'+esc(set.state||"")+'" role="group" aria-label="'+esc(set.title)+'"><div class="vz-set-head"><strong>'+esc(set.title)+"</strong><small>"+esc(set.line||"")+'</small><button type="button" class="vz-set-pick" data-set-pick aria-label="오늘의 연습 편집"><span>편집</span></button></div>'+
    (steps?'<button type="button" class="vz-set-steps" data-set-summary data-k="steps" aria-expanded="'+stepsOpen+'" aria-controls="vz-today-steps">'+esc(steps)+"</button>":"")+
    '<ol class="vz-set-line" id="vz-today-steps" data-set-line'+(stepsOpen?"":" hidden")+">"+items.map(x=>{
     const word=STATE_WORD[x.state]||"";
     return '<li data-state="'+esc(x.state||"left")+'"><span class="vz-set-item"><b>'+esc(x.label||"")+"</b><span>"+esc(x.title||"")+'</span></span><span class="vz-set-meta">'+(x.mic?'<i class="vz-ui-icon" aria-hidden="true" data-mic></i><span class="vz-visually-hidden">마이크</span>':"")+
      "<span>"+esc(x.time||(x.minutes||0)+"분")+"</span><em"+(x.state==="left"?' class="vz-visually-hidden"':"")+">"+esc(word)+"</em></span></li>";}).join("")+"</ol>";
  }
  if(timer&&timer.away)html+='<div class="vz-today-away" data-today-away role="group" aria-label="오래 자리를 비웠어요"><strong>오래 자리를 비웠어요</strong><span>타이머를 켜 둔 채 '+esc(minutesText(timer.awaySeconds/60))+'이 지났어요. 이 시간을 어떻게 셀지 골라 주세요. 고르면 바로 저장해요.</span>'+
   '<div><button type="button" data-timer-away="all">모두 세고 저장</button><button type="button" data-timer-away="none">비운 시간 빼고 저장</button></div><p class="vz-today-error" role="alert" data-error></p></div>';
  else if(timer)html+='<div class="vz-today-timer" data-today-timer><span>연습 중 · <b data-timer-text>'+esc(timer.text)+'</b></span><button type="button" data-timer-stop data-k="timer-stop">멈추기</button></div><p class="vz-today-error" role="alert" data-error></p>';
  else{
   html+='<div class="vz-today-go">'+(set?'<button type="button" class="vz-set-go" data-set-go data-k="set-go" aria-label="'+esc(set.label||set.button)+'"><span>'+esc(set.button||"")+"</span></button>":"")+
    (model.timerBlocked?"":'<button type="button" class="vz-timer-start" data-timer-start data-k="timer-start">타이머만 켜기</button>')+'</div><p class="vz-today-error" role="alert" data-error></p>';
  }
  if(set)html+="</div>";
  host.innerHTML=html;
  // The steps line opens in place; the card keeps it open across redraws.
  if(!set&&!timer&&model.timerBlocked)host.hidden=true;else host.hidden=false;
 }
 function paintNote(){
  const n=model.note;
  $("[data-today-note]").textContent=!n?"":n.short?"1분이 안 돼서 기록하지 않았어요. 1분 넘게 연습하면 저장돼요.":n.saved?"연습 "+minutesText(n.minutes)+"을 기록했어요. 아래 추가 줄을 눌러 곡이나 분류를 정할 수 있어요.":"";
 }
 /** The small rows, kept and updated in place by key (a row under a finger is never replaced). */
 function paintLinks(){
  const host=$("[data-today-links]"),old=new Map([...host.children].map(b=>[b.dataset.row,b]));
  const next=(model.links||[]).map(r=>{
   let b=old.get(r.key);
   if(!b){b=document.createElement("button");b.type="button";b.className="vz-practice-row";b.dataset.row=r.key;
    b.innerHTML='<i class="vz-ui-icon" aria-hidden="true"></i><span class="vz-practice-copy"><strong></strong><small></small></span><i class="vz-ui-icon" aria-hidden="true">\ue13a</i>';}
   const [icon,copy]=b.children,[name,state]=copy.children;
   if(icon.textContent!==(r.icon||""))icon.textContent=r.icon||"";
   if(name.textContent!==r.title)name.textContent=r.title;
   if(state.textContent!==(r.state||""))state.textContent=r.state||"";
   b.dataset.tone=r.tone||"";b.setAttribute("aria-label",r.label||r.title);
   return b;
  });
  if(next.length!==host.childElementCount||next.some((b,i)=>host.children[i]!==b))host.replaceChildren(...next);
 }
 function render(){
  if(!model)return;
  const active=rootNode().activeElement,key=focusKey||(card.contains(active)?active?.dataset?.k||"":"");focusKey="";
  paintHead();paintList();paintSet();paintNote();paintLinks();
  if(key){const el=card.querySelector('[data-k="'+(window.CSS?.escape?CSS.escape(key):key)+'"]');el?.focus({preventScroll:true});}
 }
 const signOf=m=>JSON.stringify(m,(k,v)=>typeof v==="function"?undefined:v);
 /** New data from home: drawn again only when something changed, with the open row and the typed text kept. */
 function update(next){
  model=next||{};
  if(open?.key?.startsWith("plan:")&&!(model.plan||[]).some(g=>"plan:"+g.id===open.key))open=null;
  if(open?.key?.startsWith("extra:")&&!(model.extra||[]).some(x=>"extra:"+x.id===open.key))open=null;
  const s=signOf(model)+"|"+JSON.stringify(open);
  if(s===sign)return;sign=s;render();
 }
 const redraw=()=>{sign="";update(model);};
 const toggle=(key,mode="chips",fk="")=>{
  if(open?.key===key&&open.mode===mode&&mode==="chips"){open=null;focusKey="open:"+key;}
  else{open={key,mode};if(mode==="chips"&&key!=="direct")focusKey="open:"+key;}
  if(fk)focusKey=fk;
  if(!key.startsWith("plan:")||mode!=="time")drafts.time=null;
  redraw();
 };
 /** The timer's second: only its text changes, unless it started, stopped or went away. */
 function tick(state){
  if(!model)return;
  const was=model.timer;
  if(!!was!==!!state||was?.away!==state?.away){model={...model,timer:state};redraw();return;}
  if(state){model.timer=state;const t=card.querySelector("[data-timer-text]");if(t&&t.textContent!==state.text)t.textContent=state.text;}
 }
 const formOf=t=>t.closest("form");
 card.addEventListener("click",event=>{
  const t=event.target.closest("button,a");if(!t||!card.contains(t))return;
  const where=t.closest(".vz-today-panel,.vz-today-form,[data-today-set],[data-today-away]")||null;
  if(t.matches("[data-open]")){const key=t.dataset.open;if(key.startsWith("extra:")&&drafts.extra?.id!==key.slice(6))drafts.extra=null;return toggle(key);}
  if(t.matches("[data-more]")){showAll=!showAll;focusKey="more";return redraw();}
  if(t.matches("[data-link]")){const gid=t.closest("[data-plan]").dataset.plan;if(run(where,()=>opts.onLink?.(gid,t.dataset.link))!==false){open=null;focusKey="open:plan:"+gid;redraw();}return;}
  if(t.matches("[data-time]")){const g=(model.plan||[]).find(x=>x.id===t.closest("[data-plan]").dataset.plan);drafts.time={id:g.id,minutes:g.suggest??null};return toggle("plan:"+g.id,"time");}
  if(t.matches("[data-set-from-plan]")){open=null;return run(where,()=>opts.onSetGo?.());}
  if(t.matches("[data-cancel]")){const f=formOf(t);if(f?.matches("[data-direct-form]")){drafts.direct=null;open=null;focusKey="direct";}else if(f?.matches("[data-time-form]")){drafts.time=null;open={key:"plan:"+f.dataset.timeForm,mode:"chips"};}else{drafts.extra=null;const id=f?.dataset.extraForm;open=null;focusKey="open:extra:"+id;}return redraw();}
  if(t.matches("[data-step]")){const f=formOf(t),input=f.querySelector("[name=minutes]"),n=Math.max(1,Math.min(1440,(Math.round(Number(input.value))||0)+Number(t.dataset.step)));input.value=String(n);input.dispatchEvent(new Event("input",{bubbles:true}));return;}
  if(t.matches("[data-min]")){const f=formOf(t),input=f.querySelector("[name=minutes]");input.value=t.dataset.min;input.dispatchEvent(new Event("input",{bubbles:true}));return;}
  if(t.matches("[data-cat]")){const d=draftOf(formOf(t));if(d){d.cat=d.cat===t.dataset.cat?"":t.dataset.cat;formOf(t).querySelectorAll("[data-cat]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.cat===d.cat)));}return;}
  if(t.matches("[data-what]")){const d=drafts.direct;if(d){d.what=d.what===t.dataset.what?"":t.dataset.what;formOf(t).querySelectorAll("[data-what]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.what===d.what)));}return;}
  if(t.matches("[data-today-add-plan]"))return opts.onAddPlan?.();
  if(t.matches("[data-today-direct]")){if(open?.key==="direct"){open=null;}else{open={key:"direct",mode:"form"};}return redraw();}
  if(t.matches("[data-hint]"))return run(null,()=>opts.onHint?.());
  if(t.matches("[data-set-summary]")){stepsOpen=!stepsOpen;focusKey="steps";return redraw();}
  if(t.matches("[data-set-pick]"))return opts.onSetPick?.();
  if(t.matches("[data-set-go]"))return run(where,()=>opts.onSetGo?.());
  if(t.matches("[data-timer-start]")){focusKey="timer-stop";return run(where,()=>opts.onTimerStart?.());}
  if(t.matches("[data-timer-stop]")){focusKey="timer-start";return run(where,()=>opts.onTimerStop?.());}
  if(t.matches("[data-timer-away]"))return run(where,()=>opts.onTimerAway?.(t.dataset.timerAway));
  if(t.matches(".vz-practice-row"))return (model.links||[]).find(r=>r.key===t.dataset.row)?.action?.();
 });
 const draftOf=f=>!f?null:f.matches("[data-direct-form]")?drafts.direct:f.matches("[data-time-form]")?drafts.time:f.matches("[data-extra-form]")?drafts.extra:null;
 card.addEventListener("input",event=>{
  const f=formOf(event.target),d=draftOf(f);if(!d)return;const n=event.target.name;
  if(n==="minutes"){d.minutes=event.target.value===""?null:Number(event.target.value);f.querySelectorAll("[data-min]").forEach(b=>b.setAttribute("aria-pressed",String(Number(b.dataset.min)===d.minutes)));}
  if(n==="memo")d.memo=event.target.value;
 });
 card.addEventListener("change",async event=>{
  const t=event.target;
  if(t.matches("[data-check]")){
   const id=t.dataset.check,checked=t.checked;t.disabled=true;say(null,"");
   try{if(await opts.onToggle?.(id,checked)===false)throw Error("save rejected");}
   catch{t.checked=!checked;say(null,"저장하지 못했어요. 다시 체크해 주세요.");}
   finally{t.disabled=false;}
   return;
  }
  const f=formOf(t),d=draftOf(f);if(!d)return;
  if(t.name==="song")d.song=t.value;
  // Another day offers that day's homework (and no goals of today): the form is drawn again with what was typed.
  if(t.name==="date"){d.date=t.value;redraw();}
 });
 card.addEventListener("submit",event=>{
  event.preventDefault();const f=event.target,d=draftOf(f);if(!d)return;
  if(f.matches("[data-time-form]")){
   const m=d.minutes;if(!(Number.isFinite(m)&&m>=1&&m<=600)){say(f,"연습 시간은 1~600분으로 적어 주세요.");f.minutes.focus();return;}
   if(run(f,()=>opts.onTimeCheck?.(f.dataset.timeForm,Math.round(m)))!==false){drafts.time=null;open=null;focusKey="open:plan:"+f.dataset.timeForm;redraw();}
   return;
  }
  if(f.matches("[data-extra-form]")){
   if(run(f,()=>opts.onEditExtra?.(f.dataset.extraForm,{songId:d.song||"",category:d.cat||"",memo:d.memo??""}))!==false){drafts.extra=null;open=null;redraw();}
   return;
  }
  if(f.matches("[data-direct-form]")){
   const m=d.minutes;if(!(Number.isFinite(m)&&m>=1&&m<=1440)){say(f,"연습 시간을 1분 이상 입력해 주세요.");f.minutes.focus();return;}
   if(!d.date){say(f,"날짜를 골라 주세요.");f.date.focus();return;}
   const [kind,id]=d.what?d.what.split(/:(.*)/s):["",""];
   if(run(f,()=>opts.onDirect?.({minutes:Math.round(m),date:d.date,goalId:kind==="goal"?id:"",homeworkId:kind==="hw"?id:"",songId:d.song||"",category:d.cat||"",memo:d.memo||""}))!==false){drafts.direct=null;open=null;focusKey="direct";redraw();}
  }
 });
 return {el:card,update,tick,
  /** Bring the card into view (the former 보컬 트레이닝 addresses and "연습은 오늘 탭에서 해요" lead here). */
  show(){card.scrollIntoView({block:"start"});$("#vz-practice-title").focus({preventScroll:true});card.classList.add("is-shown");setTimeout(()=>card.classList.remove("is-shown"),1600);return true;}};
}
