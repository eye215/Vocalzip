/* Phase 07-C: client-rendered PDF and private vector ink. Original R2 bytes never change. */
(() => {
'use strict';
const VZ=window.VZ,Ink=window.VzipScoreInk;
if(!VZ||!Ink)return;
const PDFJS='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/',MAX=50*1024*1024;
let pdfLibrary;
async function library(){
 if(!Promise.withResolvers)Promise.withResolvers=function(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
 if(!pdfLibrary)pdfLibrary=import(PDFJS+'legacy/build/pdf.min.mjs').then(pdf=>{pdf.GlobalWorkerOptions.workerSrc=PDFJS+'legacy/build/pdf.worker.min.mjs';return pdf;}).catch(e=>{pdfLibrary=null;throw e;});
 return pdfLibrary;
}
async function readPDF(response,size,signal){
 if(!response.ok)throw Error('악보를 불러오지 못했어요 ('+response.status+').');
 if(!Number.isSafeInteger(size)||size<=0||size>MAX)throw Error('50MB 이하 PDF를 사용해 주세요.');
 const out=new Uint8Array(size),reader=response.body.getReader();let offset=0;
 try{for(;;){if(signal.aborted)throw new DOMException('닫힘','AbortError');const chunk=await reader.read();if(chunk.done)break;if(offset+chunk.value.length>size)throw Error('PDF 원본 크기가 바뀌었어요. 악보를 다시 열어 주세요.');out.set(chunk.value,offset);offset+=chunk.value.length;}}
 finally{await reader.cancel().catch(()=>{});}
 if(offset!==size||!new TextDecoder().decode(out.subarray(0,1024)).includes('%PDF-'))throw Error('PDF 원본을 확인하지 못했어요.');
 return out;
}
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
VZ.deleteScoreWithInk=(songId,score)=>{
 const owner=window.vzipCloudUserId?.(),scope=window.VzipAccountScope;
 const identity=()=>window.vzipCloudSignedIn?.()&&!scope?.leaving&&(!scope||scope.owner===owner)?{owner:window.vzipCloudUserId?.(),session:window.vzipCloudSessionId?.()||'legacy'}:null;
 const store=Ink.create({storage:scope?.storage||localStorage,identity,getData:()=>VZ.db,change:fn=>VZ.change(fn,{silent:true})});
 return store.removeScore({ownerId:owner,songId,scoreId:score.id,r2Key:score.r2Key});
};
VZ.openScoreInk=(songId,scoreId)=>{
 const score=VZ.song(songId)?.scores?.find(s=>s.id===scoreId&&!s.deleted),owner=window.vzipCloudUserId?.();
 if(!score||!owner||!window.vzipCloudSignedIn?.()||!score.r2Key?.startsWith('u/'+owner+'/'+scoreId+'/')){VZ.toast('이 계정의 PDF 악보를 먼저 열어 주세요.','error');return;}
 const initialSession=window.vzipCloudSessionId?.()||'legacy',scope=window.VzipAccountScope;
 const identity=()=>window.vzipCloudSignedIn?.()&&!scope?.leaving&&(!scope||scope.owner===owner)?{owner:window.vzipCloudUserId?.(),session:window.vzipCloudSessionId?.()||'legacy'}:null;
 const current=()=>{const i=identity(),s=VZ.song(songId)?.scores?.find(s=>s.id===scoreId&&!s.deleted);if(i?.owner!==owner||i.session!==initialSession||!s||s.r2Key!==score.r2Key)throw Error('계정이나 악보가 바뀌어 필기를 중단했어요.');};
 let store;
 try{store=Ink.create({storage:scope?.storage||localStorage,identity,getData:()=>VZ.db,change:fn=>VZ.change(fn,{silent:true})});store.restore();}
 catch(e){VZ.toast(e.message,'error');return;}
 const controller=new AbortController();let doc,loadingTask,renderTask,closed=false,binding,ready=false,busy=false,pageNo=1,zoom=1,aspect=1.414,baseWidth=0;
 let tool='pan',active=null,pending=null,undo=[],redo=[],frame=0,renderNumber=0,cleanupHook=()=>{},resizeObserver,resizeTimer,sheet,el,svg,canvas,box,stage,status,done;
 const button=(name,icon,label)=>'<button type="button" class="icon-btn" data-ink-'+name+' aria-label="'+label+'" title="'+label+'"><i class="ph ph-'+icon+'"></i></button>';
 const tools=['pan','pen','highlighter','eraser'];
 const names=['이동','펜','형광펜','지우개'],icons=['hand','pen','highlighter','eraser'];
 const body='<div class="score-ink-editor"><p class="score-ink-title">'+VZ.esc(score.title||score.fileName||'PDF 악보')+'</p>'+
  '<div class="score-ink-tools" role="toolbar" aria-label="필기 도구">'+tools.map((t,i)=>'<button type="button" data-ink-tool="'+t+'" aria-pressed="'+(t==='pan')+'"><i class="ph ph-'+icons[i]+'"></i><span>'+names[i]+'</span></button>').join('')+
  button('undo','arrow-counter-clockwise','필기 되돌리기')+button('redo','arrow-clockwise','필기 다시 실행')+button('clear','trash','현재 페이지 필기 삭제')+'</div>'+
  '<div class="score-ink-options"><label>색상 <select data-ink-color aria-label="필기 색상"><option value="#7a32f5">보라</option><option value="#344054">진회색</option><option value="#e5484d">빨강</option><option value="#eab308">노랑</option></select></label>'+
  '<label>굵기 <select data-ink-width aria-label="펜 굵기"><option value="0.004">얇게</option><option value="0.008">보통</option><option value="0.014">굵게</option></select></label>'+
  '<label class="score-ink-pen-only"><input type="checkbox" data-ink-pen-only>펜만</label></div>'+
  '<div class="score-ink-pages">'+button('prev','caret-left','이전 악보 페이지')+'<span data-ink-page aria-live="polite">불러오는 중</span>'+button('next','caret-right','다음 악보 페이지')+
  '<select data-ink-zoom aria-label="악보 확대"><option value="1">화면 맞춤</option><option value="1.5">150%</option><option value="2">200%</option></select></div>'+
  '<p class="score-ink-status" data-ink-status role="status" aria-live="polite">PDF를 준비하고 있어요.</p>'+
  '<div class="score-ink-stage" data-ink-stage tabindex="0" aria-label="악보 페이지"><div class="score-ink-page" data-ink-box hidden><canvas data-ink-pdf aria-label="PDF 악보"></canvas><svg xmlns="http://www.w3.org/2000/svg" data-ink-svg role="img" aria-label="개인 필기 영역"></svg></div></div>'+
  '<p class="score-ink-help">한 획씩 이 기기에 저장해요. 클라우드는 기존 동기화로 저장합니다. 이동 모드에서 스크롤하고, 펜·형광펜 모드에서 손가락이나 펜으로 쓰세요.</p></div>';
 function say(text,error=false){if(!closed){status.textContent=text;status.dataset.error=error?'true':'false';done.textContent=pending?'다시 저장':'완료';}}
 function strokes(){
  if(!binding)return [];
  let rows=store.list(binding,pageNo);if(pending){rows=rows.filter(s=>!pending.action.remove.some(r=>r.id===s.id));const ids=new Set(rows.map(s=>s.id));rows.push(...pending.action.add.filter(s=>s.page===pageNo&&!ids.has(s.id)));}
  if(active?.stroke)rows.push(active.stroke);return rows;
 }
 function paint(){
  if(!svg||!binding||closed)return;
  svg.replaceChildren();svg.setAttribute('viewBox','0 0 1000 '+(1000*aspect));
  for(const s of strokes()){
   const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',Ink.path(s,aspect));path.setAttribute('fill','none');path.setAttribute('stroke',s.color);
   path.setAttribute('stroke-width',s.width*1000);path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');path.setAttribute('opacity',s.tool==='highlighter'?'0.28':'1');path.dataset.stroke=s.id;svg.append(path);
  }
  el.querySelector('[data-ink-undo]').disabled=!ready||busy||!!pending||!undo.length;
  el.querySelector('[data-ink-redo]').disabled=!ready||busy||!!pending||!redo.length;
 }
 function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;try{paint();}catch(e){say(e.message,true);}});}
 function apply(action,kind='normal'){
  pending={action,kind};
  try{
   current();
   if(!store.commit({add:action.add,remove:action.remove.map(s=>s.id)}))throw Error('필기 복구 기록은 보존했어요. 저장 공간을 확인하고 다시 저장해 주세요.');
   pending=null;
   if(kind==='normal'){undo.push(action);redo=[];}else if(kind==='undo'){undo.pop();redo.push(action);}else{redo.pop();undo.push(action);}
   say(navigator.onLine===false?'이 기기에 저장됨 · 온라인 연결 후 동기화':'이 기기에 저장됨 · 클라우드는 기존 동기화로 저장');
  }catch(e){say('저장하지 못했어요: '+e.message,true);}
  paint();
 }
 function inverse(action){return {add:action.remove.map(s=>({...s,id:VZ.uid(),createdAt:Date.now()})),remove:action.add};}
 function finishStroke(){
  if(!active)return;const s=active.stroke;active=null;
  if(s?.points.length)apply({add:[s],remove:[]});
 }
 function coords(event){const r=svg.getBoundingClientRect();return Ink.point((event.clientX-r.left)/r.width,(event.clientY-r.top)/r.height,event.pressure||0.5);}
 async function renderPage(){
  if(!doc||closed)return;finishStroke();busy=true;ready=false;const number=++renderNumber;renderTask?.cancel();
  box.hidden=true;svg.dataset.tool='pan';say('악보 '+pageNo+'쪽을 불러오고 있어요.');
  try{
   current();const page=await doc.getPage(pageNo);if(closed||number!==renderNumber)return;current();
   const natural=page.getViewport({scale:1});aspect=natural.height/natural.width;
   baseWidth=Math.max(240,stage.clientWidth-16);const width=baseWidth*zoom,height=width*aspect;
   box.style.width=width+'px';box.style.height=height+'px';
   const pixelScale=Math.min(devicePixelRatio||1,2,Math.sqrt(4000000/(width*height))),viewport=page.getViewport({scale:width/natural.width*pixelScale});
   canvas.width=Math.max(1,Math.floor(viewport.width));canvas.height=Math.max(1,Math.floor(viewport.height));
   renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport});await renderTask.promise;
   if(closed||number!==renderNumber)return;current();
   el.querySelector('[data-ink-page]').textContent=pageNo+' / '+doc.numPages+'쪽';
   el.querySelector('[data-ink-prev]').disabled=pageNo<=1;el.querySelector('[data-ink-next]').disabled=pageNo>=doc.numPages;
   box.hidden=false;ready=true;svg.dataset.tool=tool;stage.scrollTo(0,0);
   paint();if(!pending)say('이동 모드로 스크롤하거나 필기 도구를 선택하세요.');
  }catch(e){if(!closed&&number===renderNumber&&e.name!=='RenderingCancelledException')say('악보를 열지 못했어요: '+e.message,true);}
  finally{if(number===renderNumber){busy=false;if(!closed)paint();}}
 }
 function closeEditor(){
  finishStroke();if(pending){say('필기를 먼저 다시 저장해 주세요. 저장되지 않은 획은 이 화면에 남아 있어요.',true);return;}
  sheet.close();VZ.toast('필기를 이 기기에 저장했어요.');
 }
 function changed(){
  if(closed)return;
  try{current();store.restore();paint();}catch{sheet.close();}
 }
 function cleanup(){
  closed=true;controller.abort();resizeObserver?.disconnect();clearTimeout(resizeTimer);cancelAnimationFrame(frame);renderTask?.cancel();loadingTask?.destroy()?.catch?.(()=>{});doc?.destroy()?.catch?.(()=>{});
  if(canvas){canvas.width=0;canvas.height=0;}cleanupHook();window.removeEventListener('vzip:auth-changed',changed);window.removeEventListener('vzip:data-changed',changed);
  window.removeEventListener('beforeunload',unload);document.removeEventListener('visibilitychange',hidden);VZ.setGuard(null);
 }
 function unload(event){finishStroke();if(pending){event.preventDefault();event.returnValue='';}}
 function hidden(){if(document.visibilityState==='hidden')finishStroke();}
 sheet=VZ.sheet({title:'악보 필기',label:'악보 개인 필기',body,foot:'<button type="button" class="btn block" data-ink-done>완료</button>',onClose:cleanup,onMount:(node)=>{
  el=node;el.classList.add('score-ink-sheet');svg=el.querySelector('[data-ink-svg]');canvas=el.querySelector('[data-ink-pdf]');box=el.querySelector('[data-ink-box]');stage=el.querySelector('[data-ink-stage]');status=el.querySelector('[data-ink-status]');done=el.querySelector('[data-ink-done]');
  el.querySelector('[data-ink-prev]').disabled=true;el.querySelector('[data-ink-next]').disabled=true;
  const back=el.parentNode;
  back.addEventListener('click',event=>{if(event.target===back||event.target.closest('[data-close]')){event.preventDefault();event.stopImmediatePropagation();closeEditor();}},true);
  back.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeEditor();}},true);
  done.onclick=()=>{if(pending)apply(pending.action,pending.kind);else closeEditor();};
  el.querySelectorAll('[data-ink-tool]').forEach(button=>button.onclick=()=>{
   finishStroke();tool=button.dataset.inkTool;svg.dataset.tool=tool;
   el.querySelectorAll('[data-ink-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
  });
  el.querySelector('[data-ink-prev]').onclick=()=>{if(ready&&!busy&&pageNo>1){pageNo--;renderPage();}};
  el.querySelector('[data-ink-next]').onclick=()=>{if(ready&&!busy&&pageNo<doc?.numPages){pageNo++;renderPage();}};
  el.querySelector('[data-ink-zoom]').onchange=event=>{zoom=Number(event.target.value);renderPage();};
  el.querySelector('[data-ink-undo]').onclick=()=>{if(!pending&&undo.length)apply(inverse(undo.at(-1)),'undo');};
  el.querySelector('[data-ink-redo]').onclick=()=>{if(!pending&&redo.length)apply(inverse(redo.at(-1)),'redo');};
  el.querySelector('[data-ink-clear]').onclick=async()=>{
   if(!ready||busy||pending)return;
   const rows=store.list(binding,pageNo);if(!rows.length)return;
   if(await VZ.confirm('페이지 필기 삭제','현재 페이지의 개인 필기 '+rows.length+'개를 지울까요? PDF 원본은 그대로예요.',{ok:'필기 삭제',danger:true})){
    try{current();apply({add:[],remove:rows});}catch(e){say(e.message,true);}
   }
  };
  svg.onpointerdown=event=>{
   if(!ready||busy||tool==='pan'||active||pending||event.isPrimary===false||event.button>0||el.querySelector('[data-ink-pen-only]').checked&&event.pointerType!=='pen')return;
   try{
    current();event.preventDefault();const p=coords(event);
    if(tool==='eraser'){const found=strokes().reverse().find(s=>Ink.hit(s,p,aspect));if(found)apply({add:[],remove:[found]});return;}
    const stroke={version:1,id:VZ.uid(),...binding,page:pageNo,tool,color:el.querySelector('[data-ink-color]').value,
     width:Number(el.querySelector('[data-ink-width]').value)*(tool==='highlighter'?3:1),points:[p],createdAt:Date.now()};
    active={pointer:event.pointerId,stroke};try{svg.setPointerCapture?.(event.pointerId);}catch{}schedule();
   }catch(e){say(e.message,true);}
  };
  svg.onpointermove=event=>{
   if(active?.pointer!==event.pointerId)return;event.preventDefault();
   const samples=event.getCoalescedEvents?.();const events=samples?.length?samples:[event];
   for(const item of events){const p=coords(item),last=active.stroke.points.at(-1);if(Math.hypot(p[0]-last[0],p[1]-last[1])>0.0008&&active.stroke.points.length<Ink.MAX_POINTS)active.stroke.points.push(p);}
   schedule();
  };
  svg.onpointerup=svg.onpointercancel=svg.onlostpointercapture=event=>{if(active?.pointer===event.pointerId)finishStroke();};
 }});
 if(window.ResizeObserver){resizeObserver=new ResizeObserver(()=>{if(ready&&!busy&&Math.abs(Math.max(240,stage.clientWidth-16)-baseWidth)>1){clearTimeout(resizeTimer);resizeTimer=setTimeout(renderPage,120);}});resizeObserver.observe(stage);}
 cleanupHook=scope?.beforeLeave(()=>{if(active||pending)throw Error('악보 필기를 먼저 저장하고 계정을 바꿔 주세요.');sheet.close();})||(()=>{});
 window.addEventListener('vzip:auth-changed',changed);window.addEventListener('vzip:data-changed',changed);
 window.addEventListener('beforeunload',unload);document.addEventListener('visibilitychange',hidden);
 VZ.setGuard(()=>{finishStroke();return pending?'필기가 아직 저장되지 않았어요. 먼저 다시 저장해 주세요.':null;});
 (async()=>{
  try{
   const [pdf,url]=await Promise.all([library(),window.VzipR2.url(score.r2Key)]);current();
   const bytes=await readPDF(await fetch(url,{signal:controller.signal,cache:'no-store'}),score.size,controller.signal);current();
   const pdfHash=await hash(bytes);current();binding={ownerId:owner,songId,scoreId,r2Key:score.r2Key,pdfHash};
   loadingTask=pdf.getDocument({data:bytes,isEvalSupported:false,enableXfa:false,standardFontDataUrl:PDFJS+'standard_fonts/',cMapUrl:PDFJS+'cmaps/',cMapPacked:true});
   loadingTask.onPassword=()=>{loadingTask.destroy();say('암호가 없는 PDF로 다시 올려 주세요. 원본과 기존 필기는 유지돼요.',true);};
   doc=await loadingTask.promise;current();if(closed)return;
   if(doc.numPages>2000)throw Error('2000쪽 이하 PDF를 사용해 주세요.');
   const old=(VZ.db.scoreAnnotations||[]).some(s=>s.ownerId===owner&&s.scoreId===scoreId&&s.r2Key===score.r2Key&&s.pdfHash!==pdfHash);
   await renderPage();if(old)say('PDF 내용이 바뀌어 이전 버전 필기는 겹쳐 표시하지 않아요. 이전 필기 기록은 유지돼요.');
  }catch(e){if(!closed&&e.name!=='AbortError')say('악보를 열지 못했어요: '+e.message+' · 원본과 기존 필기는 유지돼요.',true);}
 })();
 return sheet;
};
})();
