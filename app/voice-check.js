/* 매일 보이스 체크 (30초): a fixed protocol recorded with the normal recorder (VZ.media.capture → VZ.media.saveBlob),
 * kept as a 트레이닝 recording (never a song take), analysed on this device (VZ.analyzeRecording) and stored as a
 * training practice record carrying `voiceCheck` (metrics, self-rating). Model: app/voice-check-model.js.
 * Hook for other flows (e.g. 오늘 연습 세트): VZ.voiceCheck.open({onDone(result), onCancel()}). */
(()=>{
'use strict';
const V=window.VZ,M=V?.media,C=window.VzipVoiceCheckModel;
if(!V||!M||!C)return;
const esc=V.esc,P=C.PROTOCOL,SING=P.parts.filter(p=>['sustain','scale','high'].includes(p.kind));
const hz=midi=>440*2**((midi-69)/12);
const note=C.noteName;
// Test-only time compression of the guide (the saved audio is never altered). 1 in the app.
const speed=()=>Math.max(1,Number(window.VZIP_VOICE_CHECK_SPEED)||1);
const audioSession=type=>{try{if(navigator.audioSession)navigator.audioSession.type=type;}catch{}};
const list=()=>C.checks(V.db.practices,V.db.deleted?.practices);
const doneToday=()=>list().some(c=>c.date===V.today());
const prefs=()=>C.settings(V.db.settings?.voiceCheck);
const shortDate=s=>{const d=V.parseYmd(s);return d?(d.getMonth()+1)+'.'+d.getDate():'';};
let pending=null,live=null;

/* ---------- reference tones (Web Audio; created inside the tap for iPhone Safari) ---------- */
function tones(){
 const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return null;
 const ctx=new Audio(),sources=new Set();
 return {ctx,
  play(midi,at,dur,level=.16){
   const o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.value=hz(midi);
   g.gain.setValueAtTime(0,at);g.gain.linearRampToValueAtTime(level,at+.03);g.gain.setValueAtTime(level,Math.max(at+.03,at+dur-.08));g.gain.linearRampToValueAtTime(0,at+dur);
   o.connect(g).connect(ctx.destination);sources.add(o);o.onended=()=>{sources.delete(o);o.disconnect();g.disconnect();};o.start(at);o.stop(at+dur+.02);
  },
  get playing(){return sources.size>0;},
  stop(){for(const o of sources){try{o.stop();}catch{}}sources.clear();},
  close(){this.stop();ctx.close().catch(()=>{});}
 };
}

/* ---------- data ---------- */
function savePrefs(next){
 return V.change(d=>{d.settings||={};d.settings.voiceCheck={...(d.settings.voiceCheck||{}),...next};},{silent:true});
}
function recordFor(id){return (V.db.practices||[]).find(p=>p.id===id);}
async function analyse(practiceId,item){
 const p=recordFor(practiceId),vc=p?.voiceCheck;if(!vc)throw Error('보이스 체크 기록을 찾지 못했어요.');
 try{
  const r=await V.analyzeRecording(item,{save:true});
  const metrics=C.derive(r,{refNote:vc.refNote,highNote:vc.highNote});
  if(!metrics)throw Error('음높이를 읽지 못했어요.');
  V.change(d=>{const x=d.practices.find(y=>y.id===practiceId);if(x?.voiceCheck)x.voiceCheck={...x.voiceCheck,metrics,analysisV:r.version,error:''};},{silent:true});
  return metrics;
 }catch(error){
  V.change(d=>{const x=d.practices.find(y=>y.id===practiceId);if(x?.voiceCheck)x.voiceCheck={...x.voiceCheck,error:String(error.message||error).slice(0,200)};},{silent:true});
  throw error;
 }
}
async function reanalyse(practiceId){
 const vc=recordFor(practiceId)?.voiceCheck;if(!vc?.mediaId)throw Error('녹음을 찾지 못했어요.');
 const item=(await M.list().catch(()=>M.cached()||[])).find(m=>m.id===vc.mediaId);
 if(!item)throw Error('녹음 원본을 찾지 못했어요. 삭제됐거나 아직 불러오지 못했어요.');
 return analyse(practiceId,item);
}

/* ---------- shared result pieces ---------- */
const checkAt=id=>{const all=list(),i=all.findIndex(c=>c.id===id);return {all,i,check:all[i]};};
function assess(id){
 const {all,i,check}=checkAt(id);if(!check)return null;
 const base=C.baseline(all,i),recent=all.slice(Math.max(0,i-2),i);
 return {check,base,state:C.flags(check,base,recent)};
}
function compareRows(check,base){
 const m=check.metrics||{};
 const rows=C.METRICS.map(d=>{const t=C.valueOf(check,d.key),b=base[d.key];
  if(t==null&&b==null)return '';
  return '<tr><th scope="row">'+esc(d.label)+'<small>'+esc(d.help)+'</small></th><td>'+(t==null?'—':esc(d.fmt(t)))+'</td><td>'+(b==null?'—':esc(d.fmt(b)))+'</td></tr>';}).join('');
 const bias=m.scaleBias!=null&&Math.abs(m.scaleBias)>=12?'<tr><th scope="row">음계 방향<small>전체적으로 '+(m.scaleBias<0?'낮게':'높게')+' 불렀어요</small></th><td>'+(m.scaleBias>0?'+':'')+esc(m.scaleBias)+' cent</td><td>—</td></tr>':'';
 const voiced=m.voicedPct!=null?'<tr><th scope="row">소리 낸 비율<small>30초 안내 중 노래한 부분</small></th><td>'+esc(m.voicedPct)+'%</td><td>—</td></tr>':'';
 return '<table class="vc-compare"><thead><tr><th scope="col">측정</th><th scope="col">이번</th><th scope="col">평소</th></tr></thead><tbody>'+rows+bias+voiced+'</tbody></table>';
}
function stateHtml(a){
 const {state}=a,lines=[];
 if(state.level==='building')lines.push('<p class="vc-note">평소 기준을 만드는 중이에요 · 체크 '+state.needed+'번 더 하면 비교해 드려요.</p>');
 for(const f of state.flags)lines.push('<p class="vc-flag" data-tone="'+esc(f.tone)+'"><i class="ph ph-'+(f.tone==='warn'?'warning-circle':'info')+'" aria-hidden="true"></i><span>'+esc(f.text)+'</span></p>');
 if(state.advice)lines.push('<p class="vc-flag" data-tone="rest"><i class="ph ph-coffee" aria-hidden="true"></i><span>'+esc(state.advice)+'</span></p>');
 if(state.level==='ok')lines.push('<p class="vc-flag" data-tone="ok"><i class="ph ph-check-circle" aria-hidden="true"></i><span>평소와 비슷해요.</span></p>');
 return lines.join('');
}
function resultCard(id,{title='이번 체크'}={}){
 const a=assess(id);if(!a)return '';
 const {check}=a,ratingLabel=check.selfRating?RATINGS[check.selfRating-1]:'';
 const tags=(check.tags||[]).map(k=>C.TAGS.find(t=>t[0]===k)?.[1]).filter(Boolean);
 let body;
 if(check.metrics)body=stateHtml(a)+compareRows(check,a.base);
 else body=stateHtml(a)+'<p class="vc-note">'+(check.error?'분석하지 못했어요: '+esc(check.error):'아직 분석 전이에요.')+'</p><button type="button" class="vc-secondary" data-vc-reanalyse="'+esc(check.id)+'">다시 분석</button>';
 return '<section class="vc-card vc-result" aria-label="'+esc(title)+'"><header><h3>'+esc(title)+'</h3><small>'+esc(V.dateLabel(check.date))+' · 기준음 '+esc(note(check.refNote))+' · 고음 '+esc(note(check.highNote))+'</small></header>'+
  (ratingLabel||tags.length?'<p class="vc-self">목 상태 <strong>'+esc(check.selfRating+'점 · '+ratingLabel)+'</strong>'+(tags.length?' · '+esc(tags.join(', ')):'')+'</p>':'')+body+'</section>';
}
const DISCLAIMER='<p class="vc-disclaimer">보이스 체크는 내 평소 기록과 비교하는 참고용이에요. 건강 진단이 아니며, 녹음 환경·컨디션에 따라 달라질 수 있어요. 불편함이 이어지면 선생님이나 전문가와 상의해 주세요.</p>';
const RATINGS=['많이 지침','조금 불편','보통','좋음','아주 좋음'];

/* ---------- trend charts (one measure per small chart, single series) ---------- */
function chart(def,all,today){
 const pts=C.trend(all,def.key,today,30),base=C.baseline(all)[def.key];
 if(!pts.length)return '<figure class="vc-chart" data-metric="'+esc(def.key)+'"><figcaption><span>'+esc(def.label)+'</span></figcaption><p class="vc-empty">아직 기록이 없어요</p></figure>';
 const W=300,H=96,PX=8,PT=10,PB=10,vals=pts.map(p=>p.v).concat(base!=null?[base]:[]);
 let lo=Math.min(...vals),hi=Math.max(...vals);const span=def.key==='selfRating'?2:def.unit==='초'?2:6;
 if(def.key==='selfRating'){lo=1;hi=5;}else{if(hi-lo<span){const c=(hi+lo)/2;lo=c-span/2;hi=c+span/2;}lo=Math.max(0,lo-(hi-lo)*.12);hi+= (hi-lo)*.12;}
 const x=i=>PX+i*(W-2*PX)/29,y=v=>PT+(hi-v)/(hi-lo||1)*(H-PT-PB);
 const line=pts.length>1?'<polyline class="vc-line" points="'+pts.map(p=>x(p.x).toFixed(1)+','+y(p.v).toFixed(1)).join(' ')+'"/>':'';
 const ref=base!=null?'<line class="vc-base" x1="'+PX+'" x2="'+(W-PX)+'" y1="'+y(base).toFixed(1)+'" y2="'+y(base).toFixed(1)+'"/>':'';
 const dots=pts.map((p,i)=>'<circle class="vc-dot'+(i===pts.length-1?' last':'')+'" cx="'+x(p.x).toFixed(1)+'" cy="'+y(p.v).toFixed(1)+'" r="'+(i===pts.length-1?5:4)+'"><title>'+esc(shortDate(p.date)+' · '+def.fmt(p.v))+'</title></circle>').join('');
 const last=pts[pts.length-1],first=(()=>{const d=V.parseYmd(today);d.setDate(d.getDate()-29);return V.ymd(d);})();
 const data=esc(JSON.stringify(pts.map(p=>[p.x,p.date,def.fmt(p.v),+x(p.x).toFixed(1),+y(p.v).toFixed(1)])));
 return '<figure class="vc-chart" data-metric="'+esc(def.key)+'"><figcaption><span>'+esc(def.label)+'</span><strong data-vc-readout>'+esc(shortDate(last.date)+' · '+def.fmt(last.v))+'</strong></figcaption>'+
  '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+esc(def.label+' 최근 30일 '+pts.length+'회 기록, 마지막 '+def.fmt(last.v)+(base!=null?', 평소 '+def.fmt(base):''))+'" data-vc-points="'+data+'">'+
  '<line class="vc-axis" x1="'+PX+'" x2="'+(W-PX)+'" y1="'+(H-PB+4)+'" y2="'+(H-PB+4)+'"/>'+ref+line+'<line class="vc-cross" x1="0" x2="0" y1="'+PT+'" y2="'+(H-PB)+'"/>'+dots+'</svg>'+
  '<div class="vc-chart-foot"><span>'+esc(shortDate(first))+'</span><span>'+(base!=null?'<i class="vc-key-base" aria-hidden="true"></i>평소 '+esc(def.fmt(base)):'평소 기준 쌓는 중')+'</span><span>오늘</span></div>'+
  '<small class="vc-chart-help">'+esc(def.help)+'</small></figure>';
}
function bindCharts(host){
 host.querySelectorAll('svg[data-vc-points]').forEach(svg=>{
  const pts=JSON.parse(svg.dataset.vcPoints||'[]'),fig=svg.closest('figure'),readout=fig.querySelector('[data-vc-readout]'),cross=svg.querySelector('.vc-cross'),initial=readout?.textContent;
  if(!pts.length)return;
  const pick=e=>{const box=svg.getBoundingClientRect(),vx=(e.clientX-box.left)/box.width*300;let best=pts[0];for(const p of pts)if(Math.abs(p[3]-vx)<Math.abs(best[3]-vx))best=p;
   readout.textContent=shortDate(best[1])+' · '+best[2];cross.setAttribute('x1',best[3]);cross.setAttribute('x2',best[3]);cross.classList.add('on');
   svg.querySelectorAll('.vc-dot').forEach((c,i)=>c.classList.toggle('active',pts[i]===best));};
  svg.addEventListener('pointermove',pick);svg.addEventListener('pointerdown',pick);
  svg.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'){readout.textContent=initial;cross.classList.remove('on');svg.querySelectorAll('.vc-dot.active').forEach(c=>c.classList.remove('active'));}});
 });
}
function historyTable(all){
 const rows=all.slice(-30).reverse();
 if(!rows.length)return '';
 return '<details class="vc-card vc-history"><summary>기록 표로 보기 <small>최근 '+rows.length+'회</small></summary><div class="vc-scroll"><table><thead><tr><th scope="col">날짜</th>'+C.METRICS.map(d=>'<th scope="col">'+esc(d.label)+'</th>').join('')+'</tr></thead><tbody>'+
  rows.map(c=>'<tr><th scope="row">'+esc(shortDate(c.date))+'</th>'+C.METRICS.map(d=>{const v=C.valueOf(c,d.key);return '<td>'+(v==null?'—':esc(d.fmt(v)))+'</td>';}).join('')+'</tr>').join('')+'</tbody></table></div></details>';
}

/* ---------- 보이스 체크 page ---------- */
function summaryPage(){
 const all=list(),today=V.today(),todays=all.filter(c=>c.date===today),latest=all[all.length-1],streak=C.streak(all,today);
 const month=all.filter(c=>c.date.slice(0,7)===today.slice(0,7)).length;
 return '<div class="vc-page"><header class="vc-head"><p class="vc-eyebrow">매일 보이스 체크</p><h2>오늘 목 상태</h2><p>같은 30초 루틴으로 내 평소와 비교해요</p></header>'+
  '<div class="vc-stats"><div><span>연속</span><strong>'+streak+'</strong><small>일</small></div><div><span>이번 달</span><strong>'+month+'</strong><small>회</small></div><div><span>오늘</span><strong class="vc-today-state">'+(todays.length?'완료':'아직')+'</strong></div></div>'+
  (todays.length?'<button type="button" class="vc-secondary vc-block" data-vc-start>한 번 더 체크하기</button>':'<button type="button" class="vc-primary vc-block" data-vc-start><i class="ph ph-waveform" aria-hidden="true"></i>오늘 보이스 체크 시작 · 30초</button>')+
  (latest?resultCard(latest.id,{title:latest.date===today?'오늘 결과':'최근 결과'}):'<section class="vc-card"><p class="vc-note">아직 보이스 체크 기록이 없어요. 하루 30초면 목 상태 변화를 볼 수 있어요.</p></section>')+
  (all.length?'<section class="vc-trend" aria-label="최근 30일 추이"><h3>최근 30일</h3><div class="vc-charts">'+C.METRICS.map(d=>chart(d,all,today)).join('')+'</div></section>'+historyTable(all):'')+
  DISCLAIMER+'</div>';
}
function bindPage(host){
 host.querySelector('[data-vc-start]')?.addEventListener('click',()=>open());
 bindCharts(host);
 host.querySelectorAll('[data-vc-reanalyse]').forEach(b=>b.onclick=async()=>{
  b.disabled=true;b.textContent='분석 중…';
  try{await reanalyse(b.dataset.vcReanalyse);V.toast('다시 분석했어요.');}catch(e){V.toast(e.message||'분석하지 못했어요.','error');}
  if(host.isConnected){host.innerHTML=summaryPage();bindPage(host);}
 });
}

/* ---------- 30-second run ---------- */
function setupHtml(s){
 const p=s.setup,types=C.VOICE_TYPES;
 const refs=[];for(let n=45;n<=76;n++)refs.push(n);
 const highs=[];if(p)for(let n=p.refNote+3;n<=Math.min(84,p.refNote+14);n++)highs.push(n);
 return '<fieldset class="vc-types"><legend>내 목소리 유형 <small>처음 한 번만 · 기준음을 정해요</small></legend><div>'+types.map(t=>'<button type="button" data-vc-type="'+t.key+'" aria-pressed="'+(p?.voiceType===t.key)+'">'+esc(t.label)+'</button>').join('')+'</div></fieldset>'+
  (p?'<div class="vc-notes"><label><span>기준음 (편한 “아—”)</span><select data-vc-ref>'+refs.map(n=>'<option value="'+n+'"'+(n===p.refNote?' selected':'')+'>'+note(n)+'</option>').join('')+'</select></label>'+
   '<label><span>편한 고음</span><select data-vc-high>'+highs.map(n=>'<option value="'+n+'"'+(n===p.highNote?' selected':'')+'>'+note(n)+'</option>').join('')+'</select></label></div>'+
   '<label class="vc-toggle"><input type="checkbox" data-vc-tones'+(p.tones?' checked':'')+'><span>파트마다 기준음 들려주기 <small>스피커 소리는 분석에서 빼요</small></span></label>'+
   '<button type="button" class="vc-secondary vc-block" data-vc-preview>기준음·음계·고음 미리 듣기</button>':'');
}
function introHtml(s){
 const p=s.setup,steps=SING.map((x,i)=>'<li><b>'+(i+1)+'</b><span>'+esc(x.label)+'<small>'+(x.kind==='sustain'?'약 6초':x.kind==='scale'?esc(x.syllables.join(' '))+' · 한 음 1.25초':'최대 7초 · 편한 만큼만')+'</small></span></li>').join('');
 return '<div class="vc-run"><p class="vc-eyebrow">매일 보이스 체크 · 30초</p><h2>같은 루틴으로 목 상태를 기록해요</h2>'+
  '<ol class="vc-steps">'+steps+'</ol>'+setupHtml(s)+
  (s.message?'<p class="vc-flag" data-tone="warn" role="alert"><i class="ph ph-warning-circle" aria-hidden="true"></i><span>'+esc(s.message)+'</span></p>':'')+
  '<p class="vc-privacy">트레이닝 녹음으로 저장돼 곡 성장 분석에는 들어가지 않아요. 분석은 이 기기에서 해요.</p>'+
  '<div class="vc-actions"><button type="button" class="vc-primary vc-block" data-vc-go'+(p?'':' disabled')+'><i class="ph ph-microphone" aria-hidden="true"></i>30초 체크 시작</button></div></div>';
}
function recHtml(){
 const scale=P.parts.find(p=>p.kind==='scale');
 return '<div class="vc-run vc-recording" aria-live="off"><p class="vc-eyebrow">녹음 중 · <span data-vc-clock>0</span> / '+P.seconds+'초</p>'+
  '<div class="vc-meter" aria-hidden="true"><i data-vc-progress></i></div>'+
  '<section class="vc-stage"><small data-vc-part-n></small><h2 data-vc-part role="status"></h2><p data-vc-target></p><strong class="vc-count" data-vc-count></strong>'+
  '<div class="vc-scale" data-vc-scale hidden>'+scale.syllables.map((t,i)=>'<span data-i="'+i+'">'+esc(t)+'</span>').join('')+'</div>'+
  '<div class="vc-level" aria-hidden="true"><i data-vc-level></i></div></section>'+
  '<div class="vc-actions"><button type="button" class="vc-secondary vc-block" data-vc-cancel>그만두기</button></div></div>';
}
function rateHtml(s){
 return '<div class="vc-run"><p class="vc-eyebrow">녹음 저장 완료 · <span data-vc-analysis>'+(s.metrics?'분석 완료':s.analysisError?'분석 실패':'분석 중…')+'</span></p><h2>지금 목 상태는 어때요?</h2>'+
  '<fieldset class="vc-rating"><legend class="vc-sr">목 상태 1–5</legend>'+RATINGS.map((t,i)=>'<button type="button" data-vc-rate="'+(i+1)+'" aria-pressed="'+(s.rating===i+1)+'"><b>'+(i+1)+'</b><span>'+esc(t)+'</span></button>').join('')+'</fieldset>'+
  '<fieldset class="vc-tags"><legend>메모 <small>선택</small></legend><div>'+C.TAGS.map(([k,t])=>'<button type="button" data-vc-tag="'+k+'" aria-pressed="'+s.tags.includes(k)+'">'+esc(t)+'</button>').join('')+'</div></fieldset>'+
  '<div class="vc-actions"><button type="button" class="vc-primary vc-block" data-vc-rate-save'+(s.rating?'':' disabled')+'>결과 보기</button></div></div>';
}
function doneHtml(s){
 return '<div class="vc-run vc-done">'+resultCard(s.practiceId,{title:'오늘 결과'})+DISCLAIMER+
  '<div class="vc-actions">'+(s.onDone?'<button type="button" class="vc-primary vc-block" data-vc-continue>다음으로</button>':'<button type="button" class="vc-primary vc-block" data-vc-history>보이스 체크 기록 보기</button><button type="button" class="vc-secondary vc-block" data-vc-home>홈으로</button>')+'</div></div>';
}
function errorHtml(s){
 return '<div class="vc-run"><h2>녹음을 저장하지 못했어요</h2><p class="vc-flag" data-tone="warn" role="alert"><i class="ph ph-warning-circle" aria-hidden="true"></i><span>'+esc(s.message||'')+'</span></p><p class="vc-note">녹음 원본은 이 화면에 있어요. 다시 저장하거나 기기로 내려받아 주세요.</p>'+
  '<div class="vc-actions"><button type="button" class="vc-primary vc-block" data-vc-retry-save>다시 저장</button><button type="button" class="vc-secondary vc-block" data-vc-download>기기로 내려받기</button></div></div>';
}
function paint(s){
 if(!s.host.isConnected)return;
 s.host.innerHTML=s.step==='intro'?introHtml(s):s.step==='rec'?recHtml():s.step==='saving'?'<div class="vc-run"><p class="vc-note" role="status">녹음 저장 중…</p></div>':s.step==='rate'?rateHtml(s):s.step==='done'?doneHtml(s):errorHtml(s);
 bindRun(s);
}
function stopPreview(s){s.preview?.close();s.preview=null;const b=s.host.querySelector('[data-vc-preview]');if(b)b.textContent='기준음·음계·고음 미리 듣기';}
function preview(s){
 if(s.preview){stopPreview(s);return;}
 const t=tones();if(!t){V.toast('이 브라우저에서는 소리를 재생할 수 없어요.','error');return;}
 audioSession('playback');s.preview=t;
 t.ctx.resume().then(()=>{
  if(s.preview!==t)return;
  const p=s.setup,scale=P.parts.find(x=>x.kind==='scale');let at=t.ctx.currentTime+.05;
  t.play(p.refNote,at,.9);at+=1.2;
  scale.offsets.forEach(o=>{t.play(p.refNote+o,at,.36,.15);at+=.42;});at+=.3;
  t.play(p.highNote,at,.9);
  const b=s.host.querySelector('[data-vc-preview]');if(b)b.textContent='소리 정지';
  setTimeout(()=>{if(s.preview===t)stopPreview(s);},(at+1-t.ctx.currentTime)*1000);
 }).catch(()=>{stopPreview(s);V.toast('소리를 재생하지 못했어요. 기기 소리 설정을 확인해 주세요.','error');});
}
function bindRun(s){
 const q=x=>s.host.querySelector(x);
 s.host.querySelectorAll('[data-vc-type]').forEach(b=>b.onclick=()=>{s.setup={...C.defaults(b.dataset.vcType),tones:s.setup?.tones!==false};s.message='';paint(s);});
 q('[data-vc-ref]')?.addEventListener('change',e=>{const n=Number(e.target.value);s.setup={...s.setup,refNote:n,highNote:Math.max(n+3,Math.min(n+14,s.setup.highNote-s.setup.refNote+n))};stopPreview(s);paint(s);});
 q('[data-vc-high]')?.addEventListener('change',e=>{s.setup={...s.setup,highNote:Number(e.target.value)};stopPreview(s);});
 q('[data-vc-tones]')?.addEventListener('change',e=>{s.setup={...s.setup,tones:e.target.checked};});
 q('[data-vc-preview]')?.addEventListener('click',()=>preview(s));
 q('[data-vc-go]')?.addEventListener('click',()=>start(s));
 q('[data-vc-cancel]')?.addEventListener('click',()=>abort(s,''));
 s.host.querySelectorAll('[data-vc-rate]').forEach(b=>b.onclick=()=>{s.rating=Number(b.dataset.vcRate);s.host.querySelectorAll('[data-vc-rate]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));q('[data-vc-rate-save]').disabled=false;});
 s.host.querySelectorAll('[data-vc-tag]').forEach(b=>b.onclick=()=>{const k=b.dataset.vcTag;s.tags=s.tags.includes(k)?s.tags.filter(x=>x!==k):[...s.tags,k];b.setAttribute('aria-pressed',String(s.tags.includes(k)));});
 q('[data-vc-rate-save]')?.addEventListener('click',()=>rate(s));
 q('[data-vc-continue]')?.addEventListener('click',()=>{const cb=s.onDone;s.onDone=null;pending=null;cb?.(resultOf(s));});
 q('[data-vc-history]')?.addEventListener('click',()=>V.nav('#/voice-check'));
 q('[data-vc-home]')?.addEventListener('click',()=>V.nav('#/home'));
 q('[data-vc-retry-save]')?.addEventListener('click',()=>save(s));
 q('[data-vc-download]')?.addEventListener('click',()=>{const url=URL.createObjectURL(s.res.blob),a=document.createElement('a');a.href=url;a.download='보이스 체크 '+V.today()+(s.res.type.includes('mp4')?'.m4a':s.res.type.includes('wav')?'.wav':'.webm');a.click();setTimeout(()=>URL.revokeObjectURL(url),4000);});
 if(s.step==='done')bindPage(s.host);
}
const resultOf=s=>{const c=list().find(x=>x.id===s.practiceId);return c?{id:c.id,date:c.date,mediaId:c.mediaId,metrics:c.metrics||null,selfRating:c.selfRating??null,tags:c.tags||[],state:assess(c.id)?.state||null}:null;};

async function start(s){
 if(s.step!=='intro'||s.starting||!s.setup)return;
 s.starting=true;stopPreview(s);
 const setup=s.setup;savePrefs({voiceType:setup.voiceType,refNote:setup.refNote,highNote:setup.highNote,tones:setup.tones});
 // iPhone Safari: the tone context is created and resumed inside this tap, and play-and-record is set before the mic opens.
 const t=setup.tones?tones():null;
 audioSession('play-and-record');
 try{
  if(t)await t.ctx.resume().catch(()=>{});
  const capture=await M.capture({onLevel:v=>{const el=s.host.querySelector('[data-vc-level]');if(el)el.style.width=Math.round(Math.min(1,v*1.6)*100)+'%';}});
  if(live!==s||!s.host.isConnected){capture.cancel();t?.close();audioSession('auto');return;}
  s.capture=capture;s.tones=t;s.step='rec';s.setupUsed=setup;paint(s);
  capture.start();
  const k=speed();
  if(t&&t.ctx.state==='running'){const base=t.ctx.currentTime;for(const p of P.parts.filter(x=>x.kind==='cue'))t.play(p.note==='high'?setup.highNote:setup.refNote,base+(p.start+.15)/k,1/k);}
  V.setGuard(()=>s.capture?'보이스 체크 녹음 중이에요. 나가면 이번 녹음은 저장되지 않아요. 나갈까요?':'');
  s.timer=setInterval(()=>tick(s),100);tick(s);
 }catch(error){
  t?.close();audioSession('auto');s.message=error.message||'마이크를 열지 못했어요.';paint(s);
 }finally{s.starting=false;}
}
function tick(s){
 if(!s.capture)return;
 if(!s.host.isConnected){abort(s,'');return;}
 const t=Math.min(P.seconds,s.capture.seconds()*speed()),p=P.parts.find(x=>t>=x.start&&t<x.end)||P.parts[P.parts.length-1],q=x=>s.host.querySelector(x);
 const n=SING.indexOf(p),next=SING.find(x=>x.start>=p.start),setup=s.setupUsed,highish=p.kind==='high'||p.note==='high';
 q('[data-vc-clock]').textContent=String(Math.floor(t));
 q('[data-vc-progress]').style.width=(t/P.seconds*100).toFixed(1)+'%';
 if(s.partKey!==p.key){
  s.partKey=p.key;
  q('[data-vc-part-n]').textContent=n>=0?(n+1)+' / 3':p.kind==='cue'&&next?'준비 · 다음 '+(SING.indexOf(next)+1)+' / 3':'';
  q('[data-vc-part]').textContent=p.kind==='cue'&&next?(setup.tones?'소리를 들어 보세요':'숨 고르기')+' · 다음: '+next.label:p.kind==='end'?'편하게 숨을 쉬세요':p.label;
  q('[data-vc-target]').textContent=p.kind==='end'?'곧 끝나요':highish?'고음 '+note(setup.highNote)+' · 힘들면 바로 멈춰도 괜찮아요':p.kind==='scale'||p.key==='cue2'?note(setup.refNote)+'에서 시작 · 한 칸씩 따라가요':'기준음 '+note(setup.refNote);
  q('[data-vc-scale]').hidden=!(p.kind==='scale'||p.key==='cue2');
 }
 q('[data-vc-count]').textContent=Math.max(0,Math.ceil(p.end-t))+'';
 if(p.kind==='scale'){const i=Math.min(p.offsets.length-1,Math.floor((t-p.start)/p.step));s.host.querySelectorAll('[data-vc-scale] span').forEach(x=>x.classList.toggle('on',Number(x.dataset.i)===i));}
 if(t>=P.seconds)finish(s);
}
function stopRun(s){clearInterval(s.timer);s.timer=0;s.tones?.close();s.tones=null;audioSession('auto');V.setGuard(null);}
function abort(s,message){
 const capture=s.capture;s.capture=null;stopRun(s);capture?.cancel();
 if(!s.host.isConnected)return;
 s.step='intro';s.message=message;s.partKey='';paint(s);
}
async function finish(s){
 const capture=s.capture;if(!capture)return;s.capture=null;stopRun(s);
 s.step='saving';paint(s);
 try{s.res=await capture.stop();}catch(error){s.step='intro';s.message=error.message||'녹음을 마무리하지 못했어요.';paint(s);return;}
 await save(s);
}
async function save(s){
 const res=s.res,setup=s.setupUsed,d=new Date(),id=s.mediaId||=V.uid();
 const item={id,...(window.VzipAccountScope&&res.accountOwner?{accountOwner:res.accountOwner}:{}),name:'보이스 체크 '+(d.getMonth()+1)+'.'+d.getDate()+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0'),
  created:Date.now(),recordedDate:V.today(),dateSource:'recorded',type:res.type,source:'practice',origin:'voice-check',recordingCategory:'training',songId:'',song:'',
  blob:res.blob,durationSeconds:res.durationSeconds,waveform:res.waveform,voiceCheck:{v:1,protocol:P.id,refNote:setup.refNote,highNote:setup.highNote}};
 s.step='saving';paint(s);
 try{await M.saveBlob(item);res.releaseProtection?.();}
 catch(error){s.step='error';s.message=error.message||'저장하지 못했어요.';paint(s);return;}
 const practiceId=s.practiceId='voice-check:'+id,minutes=Number((Math.min(P.seconds,res.durationSeconds||P.seconds)/60).toFixed(3));
 V.change(db=>{
  if(db.practices.some(p=>p.id===practiceId))return;
  const category=V.guidedCategory?V.guidedCategory(db,{title:'보이스 체크',tipKey:'wob'}):{};
  // Training practice linked to the file: the recording reads as 트레이닝 on every device (VZ.media.recordingCategory).
  db.practices.push({id:practiceId,date:V.today(),minutes,manualMinutes:minutes,practiceTimeSource:'voice-check',practiceMode:'training',songId:'',mediaIds:[id],...category,
   technique:[{name:'보이스 체크',minutes}],memo:'[보이스 체크]',completed:[],assignmentReps:{},assignmentNotes:{},created:Date.now(),
   voiceCheck:{v:1,protocol:P.id,refNote:setup.refNote,highNote:setup.highNote,tones:!!setup.tones,mediaId:id,at:Date.now()}});
 },{silent:true});
 s.step='rate';s.rating=0;s.tags=[];paint(s);
 s.analysis=analyse(practiceId,{...item,local:true}).then(m=>{s.metrics=m;},e=>{s.analysisError=e.message||'분석 실패';}).finally(()=>{const el=s.host.querySelector('[data-vc-analysis]');if(el)el.textContent=s.metrics?'분석 완료':'분석 실패';});
}
async function rate(s){
 if(!s.rating)return;
 V.change(db=>{const p=db.practices.find(x=>x.id===s.practiceId);if(p?.voiceCheck)p.voiceCheck={...p.voiceCheck,selfRating:s.rating,tags:[...s.tags]};},{silent:true});
 const b=s.host.querySelector('[data-vc-rate-save]');if(b){b.disabled=true;b.textContent='분석 마무리 중…';}
 await s.analysis?.catch(()=>{});
 if(live!==s||!s.host.isConnected)return;
 s.step='done';paint(s);
}
function clear(){
 const s=live;live=null;if(!s)return;
 if(s.capture){const c=s.capture;s.capture=null;c.cancel();}
 stopRun(s);stopPreview(s);
}
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&live?.capture)abort(live,'화면을 벗어나서 체크를 멈췄어요. 같은 순서로 다시 시작해 주세요.');});
window.addEventListener('pagehide',()=>{if(live?.capture)abort(live,'');});

V.route('voice-check',{title:r=>r.params[0]==='run'?'보이스 체크 · 30초':'보이스 체크',back:true,tab:'growth',noSettings:true,noAutoRefresh:true,
 render:r=>r.params[0]==='run'?'<div data-vc-host class="vc-host"></div>':'<div data-vc-host class="vc-host">'+summaryPage()+'</div>',
 mount(main,r){
  const host=main.querySelector('[data-vc-host]');
  if(r.params[0]!=='run'){bindPage(host);return;}
  clear();
  const s={host,step:'intro',setup:prefs(),message:'',tags:[],rating:0,onDone:pending?.onDone||null,onCancel:pending?.onCancel||null};
  live=s;paint(s);
 },
 leave(){const s=live,cb=s&&s.step!=='done'?s.onCancel:null;clear();pending=null;cb?.();}
});

/* ---------- entries ---------- */
function open({onDone,onCancel}={}){
 pending=onDone||onCancel?{onDone:typeof onDone==='function'?onDone:null,onCancel:typeof onCancel==='function'?onCancel:null}:null;
 V.nav('#/voice-check/run');
}
function entryHtml(){
 const all=list(),done=all.some(c=>c.date===V.today()),streak=C.streak(all,V.today());
 return '<a class="vc-entry" href="#/voice-check"><i class="ph ph-waveform" aria-hidden="true"></i><span><strong>매일 보이스 체크</strong><small>'+(done?'오늘 완료':'오늘 아직 · 30초')+(streak?' · 연속 '+streak+'일':'')+'</small></span><i class="ph ph-caret-right" aria-hidden="true"></i></a>';
}
// Same recipe as the Home summary rows (V4: white R20, row min-height 52px, 20px accent icon, 14/20 label + value).
const HOME_CSS=`#vocalzip-refined-preview .vz-vc-card{display:block;margin:0 0 12px;padding:4px 12px 4px 16px;border-radius:20px;background:#fff}
#vocalzip-refined-preview .vz-vc-row{display:flex;align-items:center;gap:12px;width:100%;min-height:52px;margin:0;padding:0;border:0;background:none;color:var(--vz-color-ink,#101828);font:inherit;text-align:left;cursor:pointer}
#vocalzip-refined-preview .vz-vc-row>.vz-ui-icon:first-child{flex:none;width:20px;font-size:20px;color:var(--vz-color-accent,#7A32F5)}
#vocalzip-refined-preview .vz-vc-row>.vz-ui-icon:last-child{flex:none;font-size:15px;color:#98A2B3}
#vocalzip-refined-preview .vz-vc-copy{display:flex;align-items:baseline;gap:8px;flex:1;min-width:0}
#vocalzip-refined-preview .vz-vc-copy strong{flex:none;font-size:14px;line-height:20px;font-weight:600}
#vocalzip-refined-preview .vz-vc-copy span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px;line-height:20px;color:#475467}
#vocalzip-refined-preview .vz-vc-row:focus-visible{outline:2px solid #DCC4FF;outline-offset:2px;border-radius:12px}
@media (min-width:768px){#vocalzip-refined-preview .vz-vc-row{min-height:64px}#vocalzip-refined-preview .vz-vc-copy strong,#vocalzip-refined-preview .vz-vc-copy span{font-size:16px;line-height:22px}}`;
/* Home: one compact row under 지금 할 것, only until today's check is done. The home is a shadow root built by
 * design-system/student-home-html.js; the row adds its own small style there instead of editing that file. */
function homeCard(){
 const root=document.querySelector('#view .vz-student-home')?.shadowRoot;if(!root)return;
 let card=root.querySelector('[data-voice-check-card]');
 if(doneToday()){card?.remove();return;}
 if(card)return;
 const el=(tag,cls,text)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(text!=null)x.textContent=text;return x;};
 if(!root.querySelector('style[data-voice-check]')){const style=el('style',null,HOME_CSS);style.dataset.voiceCheck='';root.append(style);}
 card=el('section','vz-vc-card');card.dataset.voiceCheckCard='';card.setAttribute('aria-label','오늘 보이스 체크');
 const row=el('button','vz-vc-row');row.type='button';row.dataset.row='voice-check';row.setAttribute('aria-label','오늘 보이스 체크 30초 시작하기');
 const icon=el('i','vz-ui-icon','\ue802'),chev=el('i','vz-ui-icon','\ue13a'),copy=el('span','vz-vc-copy');
 icon.setAttribute('aria-hidden','true');chev.setAttribute('aria-hidden','true');
 copy.append(el('strong',null,'오늘 보이스 체크'),el('span',null,'30초'));
 row.append(icon,copy,chev);row.onclick=()=>open();card.append(row);
 const anchor=root.querySelector('.vz-schedule');
 if(anchor&&!anchor.hidden){anchor.after(card);}
 else{(root.querySelector('.vz-col-main')||root.querySelector('main'))?.prepend(card);}
}
const view=document.getElementById('view');
if(view)new MutationObserver(records=>{
 if(document.body.dataset.vzRoute!=='home')return;
 if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1&&(n.classList.contains('vz-student-home')||n.querySelector?.('.vz-student-home')))))homeCard();
}).observe(view,{childList:true,subtree:true});
window.addEventListener('vzip:data-changed',()=>{if(document.body.dataset.vzRoute==='home')homeCard();});

V.voiceCheck={open,doneToday,checks:list,entryHtml,latest:()=>{const c=list().at(-1);return c?resultOf({practiceId:c.id}):null;}};
})();
