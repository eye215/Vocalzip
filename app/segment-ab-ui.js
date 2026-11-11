/* Explicit A/B review UI; segments are manually aligned per recording. */
(()=>{
'use strict';
const V=window.VZ,M=V?.media,Model=window.VzipSegmentAB;if(!V||!M||!Model)return;
const E=V.esc,format=n=>Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0');
let active=null, serial=0;
function stop(){
 serial++;
 if(active?.audio){active.audio.pause();active.audio.removeAttribute('src');active.audio.load();}
 if(active?.revoke)active.revoke();
 active=null;
}
window.addEventListener('hashchange',stop);
window.addEventListener('pagehide',stop);
window.VzipAccountScope?.beforeLeave(stop);
async function play(m,host,start,end){
 stop();
 const token=serial;
 host.textContent='파일을 여는 중…';
 try{
  const source=await M.src(m);
  if(token!==serial||!host.isConnected){
   if(source.revoke)URL.revokeObjectURL(source.url);
   return;
  }
  const audio=document.createElement('audio');audio.controls=true;audio.preload='metadata';audio.src=source.url;
  const revoke=source.revoke?()=>URL.revokeObjectURL(source.url):null;
  active={audio,revoke};host.replaceChildren(audio);
  audio.addEventListener('loadedmetadata',()=>{audio.currentTime=Math.max(0,Math.min(start,(audio.duration||start)-.1));},{once:true});
  audio.addEventListener('timeupdate',()=>{if(audio.currentTime>=end)audio.pause();});
  audio.play().catch(()=>{ /* Native controls remain usable on iOS after async URL retrieval. */ });
 }catch(error){if(token===serial&&host.isConnected)host.textContent=error.message||'재생을 열지 못했어요.';}
}
function panel(host,plan,items){
 stop();
 const all=items.filter(x=>x.songId===plan.songId&&!M.isVideo(x)&&(!x.size||x.size<=60*1024*1024));
 const sorted=all.sort((a,b)=>(M.dateOf(a)||'').localeCompare(M.dateOf(b)||''));
 const source=sorted.find(x=>x.id===plan.reviewRecordingId);
 const left=source||sorted[0],right=sorted.at(-1);
 const options=(selected)=>'<option value="">녹음 선택</option>'+sorted.map(m=>'<option value="'+E(m.id)+'"'+(m.id===selected?.id?' selected':'')+'>'+E(M.dateOf(m)+' · '+M.label(m))+'</option>').join('');
 const start=plan.segmentStart||0,end=plan.segmentEnd||30;
 host.innerHTML='<div class="growth-ab-panel"><h4>같은 곡 A/B 구간 비교</h4>'+
 '<p class="small muted">각 녹음에서 동일한 가사·선율을 부른 부분을 직접 맞춰 주세요. 녹음 시작 시간이 다르면 초도 다르게 입력해야 합니다. 악보 정답과 비교하지 않아요.</p>'+
 '<div class="growth-ab-grid">'+
 ['A · 이전','B · 최근'].map((title,i)=>'<div class="growth-ab-side"><label class="field"><span>'+title+'</span><select data-ab-record="'+i+'">'+options(i?right:left)+'</select></label>'+
 '<div class="growth-ab-times"><label class="field"><span>시작 초</span><input type="number" data-ab-start="'+i+'" min="0" value="'+start+'"></label>'+
 '<label class="field"><span>종료 초</span><input type="number" data-ab-end="'+i+'" min="1" value="'+end+'"></label></div>'+
 '<button type="button" class="btn sm ghost" data-ab-play="'+i+'">▶ 해당 구간 듣기</button><div data-ab-player="'+i+'"></div></div>').join('')+'</div>'+
 '<button type="button" class="btn block" data-ab-run>선택 구간 측정 비교</button>'+
 '<div role="status" data-ab-result class="growth-ab-result"></div></div>';
 const pick=i=>{
  const select=host.querySelector('[data-ab-record="'+i+'"]');
  const start=Number(host.querySelector('[data-ab-start="'+i+'"]').value);
  const end=Number(host.querySelector('[data-ab-end="'+i+'"]').value);
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end-start>120)throw Error('각 구간은 0초 이상, 최대 120초로 선택해 주세요.');
  const m=sorted.find(x=>x.id===select.value);
  if(!m)throw Error('두 개의 녹음을 선택해 주세요.');
  if(Number(m.durationSeconds)>0&&end>m.durationSeconds+1)throw Error('구간이 녹음 길이를 넘었어요.');
  return {m,start,end};
 };
 host.querySelectorAll('[data-ab-play]').forEach(b=>b.onclick=()=>{
  const i=Number(b.dataset.abPlay);
  try{const p=pick(i);play(p.m,host.querySelector('[data-ab-player="'+i+'"]'),p.start,p.end);}
  catch(error){V.toast(error.message,'error');}
 });
 host.querySelectorAll('select,input').forEach(el=>el.addEventListener('change',()=>{stop();host.querySelector('[data-ab-result]').textContent='';}));
 host.querySelector('[data-ab-run]').onclick=async()=>{
  const el=host.querySelector('[data-ab-result]'),button=host.querySelector('[data-ab-run]');
  let a,b;
  try{a=pick(0);b=pick(1);if(a.m.id===b.m.id)throw Error('서로 다른 녹음 두 개를 선택해 주세요.');
   const da=M.dateOf(a.m)||'',db=M.dateOf(b.m)||'';
   if(da&&db&&da>db)throw Error('A에는 이전 녹음, B에는 최근 녹음을 선택해 주세요.');
  }catch(error){el.textContent=error.message;return;}
  stop();const token=serial;
  button.disabled=true;el.textContent='A 녹음을 기기에서 분석하고 있어요…';
  try{
   const first=await V.analyzeRecording(a.m,{save:false});
   if(token!==serial||!host.isConnected)return;
   el.textContent='B 녹음을 기기에서 분석하고 있어요…';
   const last=await V.analyzeRecording(b.m,{save:false});
   if(token!==serial||!host.isConnected)return;
   if(!V.analysisReliable(first.summary)||!V.analysisReliable(last.summary)){
    el.textContent='한쪽 녹음의 전체 분석 신뢰도가 낮아 비교를 보류했어요. 반주가 너무 크거나 목소리 구간이 짧을 수 있어요.';return;
   }
   const result=Model.compare(first,last,a.start,a.end,b.start,b.end);
   if(result.status!=='ok'){
    el.textContent='선택한 구간에서 충분한 지속음을 측정하지 못했어요. 각 구간에 분석 가능한 음이 2개 이상 있어야 해요.';return;
   }
   const delta=Math.abs(result.delta);
   const direction=result.trend==='lower'?'가까운 반음과의 평균 편차 감소':result.trend==='higher'?'가까운 반음과의 평균 편차 증가':'유사한 편차';
   el.innerHTML='<strong>구간 측정 비교</strong><p>A '+E(result.a.meanAbsCents)+' cent → B '+E(result.b.meanAbsCents)+' cent</p>'+
   '<p>'+E(direction)+(result.trend==='similar'?'':' · '+delta+' cent 차이')+'</p>'+
   '<p class="small muted">A '+result.a.notes+'개 지속음, B '+result.b.notes+'개 지속음을 참고했어요. 각 구간의 음절·선율이 정말 같은지는 직접 들으며 확인해야 해요. 실제 악보 음정의 정확성이나 발성 개선을 보증하지 않습니다.</p>';
  }catch(error){if(token===serial&&host.isConnected)el.textContent=error.message||'구간을 비교하지 못했어요.';}
  finally{if(button.isConnected)button.disabled=false;}
 };
}
V.segmentABStop=stop;
V.segmentABPanel=panel;
})();
