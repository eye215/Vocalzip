/* Phase 07-C: client-rendered PDF and private vector ink. Original R2 bytes never change. */
(() => {
'use strict';
const VZ=window.VZ,Ink=window.VzipScoreInk,Settings=window.VzipScoreInkSettings;
if(!VZ||!Ink||!Settings)return;
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
 if(!Number.isSafeInteger(score.size)||score.size<=0||score.size>MAX){VZ.toast('50MB 이하 PDF 원본 크기를 확인해 주세요.','error');return;}
 const initialSession=window.vzipCloudSessionId?.()||'legacy',scope=window.VzipAccountScope;
 const identity=()=>window.vzipCloudSignedIn?.()&&!scope?.leaving&&(!scope||scope.owner===owner)?{owner:window.vzipCloudUserId?.(),session:window.vzipCloudSessionId?.()||'legacy'}:null;
 const current=()=>{const i=identity(),s=VZ.song(songId)?.scores?.find(s=>s.id===scoreId&&!s.deleted);if(i?.owner!==owner||i.session!==initialSession||!s||s.r2Key!==score.r2Key)throw Error('계정이나 악보가 바뀌어 필기를 중단했어요.');};
 let store,prefs,profiles;
 try{store=Ink.create({storage:scope?.storage||localStorage,identity,getData:()=>VZ.db,change:fn=>VZ.change(fn,{silent:true})});if(!store.restore())throw Error('필기 복구 기록을 저장하지 못했어요. 공간을 확인한 뒤 다시 열어 주세요.');prefs=Settings.create({storage:scope?.storage||localStorage,identity,defaultPenOnly:/iPad/.test(navigator.userAgent||'')||navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1});profiles=prefs.read();}
 catch(e){VZ.toast(e.message,'error');return;}
 const controller=new AbortController();let doc,loadingTask,renderTask,closed=false,binding,ready=false,busy=false,pageNo=1,zoom=1,aspect=1.414,baseWidth=0;
 let lastSaveMessage='',tool='pan',paintTool='pen',full=false,hadNative=false,fullGeneration=0,touchPan=null,touches=new Map(),pinch=null,pinchDirty=false,active=null,pending=null,undo=[],redo=[],frame=0,renderNumber=0,cleanupHook=()=>{},resizeObserver,resizeTimer,sheet,el,svg,canvas,box,stage,status,done;
 const button=(name,icon,label)=>'<button type="button" class="icon-btn" data-ink-'+name+' aria-label="'+label+'" title="'+label+'"><i class="ph ph-'+icon+'"></i></button>';
 const tools=['pan','pen','highlighter','eraser'];
 const names=['이동','펜','형광펜','지우개'],icons=['hand','pen','highlighter','eraser'];
 const body='<div class="score-ink-editor"><p class="score-ink-title">'+VZ.esc(score.title||score.fileName||'PDF 악보')+'</p>'+
  '<div class="score-ink-bar"><div class="score-ink-tools" role="toolbar" aria-label="필기 도구">'+tools.map((t,i)=>'<button type="button" data-ink-tool="'+t+'" aria-label="'+names[i]+'" title="'+names[i]+'" aria-pressed="'+(t==='pan')+'"><i class="ph ph-'+icons[i]+'"></i><span>'+names[i]+'</span></button>').join('')+
  button('undo','arrow-counter-clockwise','필기 되돌리기')+button('redo','arrow-clockwise','필기 다시 실행')+button('clear','trash','현재 페이지 필기 삭제')+'</div>'+
  '<div class="score-ink-actions">'+button('settings','sliders-horizontal','색상·굵기·투명도 설정')+button('fullscreen','arrows-out','전체화면')+'</div>'+
  '<section class="score-ink-settings" data-ink-settings aria-label="필기 설정" hidden><div class="score-ink-settings-head"><strong data-ink-profile-label>펜 설정</strong>'+button('settings-close','x','필기 설정 닫기')+'</div>'+
  '<div class="score-ink-palette-section"><span>기본 색상</span><div data-ink-palette class="score-ink-swatches" role="group" aria-label="기본 색상"></div></div>'+
  '<div class="score-ink-palette-section"><span>최근 사용</span><div data-ink-recent class="score-ink-swatches" role="group" aria-label="최근 사용 색상"></div></div>'+
  '<div class="score-ink-palette-section"><span>사용자 색상</span><div data-ink-custom class="score-ink-swatches" role="group" aria-label="사용자 색상"></div></div>'+
  '<div class="score-ink-custom-add"><input type="color" data-ink-picker aria-label="사용자 색상 선택" value="#101828"><input type="text" data-ink-hex aria-label="사용자 색상 코드" maxlength="7" placeholder="#RRGGBB" value="#101828" autocapitalize="none" spellcheck="false"><button type="button" data-ink-custom-add>추가</button></div>'+
  '<button type="button" class="score-ink-custom-remove" data-ink-custom-remove>선택한 사용자 색상 삭제</button>'+
  '<label class="score-ink-slider">굵기 <output data-ink-width-label>4</output><input type="range" data-ink-width aria-label="펜 굵기" min="1" max="60" step="1" value="4"></label>'+
  '<label class="score-ink-slider">투명도 <output data-ink-opacity-label>0%</output><input type="range" data-ink-opacity aria-label="필기 투명도" min="0" max="95" step="1" value="0"></label>'+
  '<label class="score-ink-pen-only"><input type="checkbox" aria-label="펜만" data-ink-pen-only>펜만 필기 · 손가락은 스크롤</label>'+
  '<a data-ink-original target="_blank" rel="noopener">원본 PDF 열기</a></section></div>'+
  '<div class="score-ink-pages">'+button('prev','caret-left','이전 악보 페이지')+'<span data-ink-page aria-live="polite">불러오는 중</span>'+button('next','caret-right','다음 악보 페이지')+
  '<select data-ink-zoom aria-label="악보 확대"><option value="1">화면 맞춤</option><option value="1.5">150%</option><option value="2">200%</option></select></div>'+
  '<p class="score-ink-status" data-ink-status role="status" aria-live="polite">PDF를 준비하고 있어요.</p>'+
  '<div class="score-ink-stage" data-ink-stage tabindex="0" aria-label="악보 페이지"><div class="score-ink-page" data-ink-box hidden><canvas data-ink-pdf aria-label="PDF 악보"></canvas><svg xmlns="http://www.w3.org/2000/svg" data-ink-svg role="img" aria-label="개인 필기 영역"></svg></div></div>'+
  '<p class="score-ink-help">손가락·펜으로 필기해요. 스크롤은 이동 모드를 선택하세요.</p></div>';
 function say(text,error=false){if(!closed){status.textContent=text;status.dataset.error=error?'true':'false';done.textContent=pending?'다시 저장':'완료';el.toggleAttribute('data-ink-save-error',!!pending);}}
 function settingsOpen(open){
  const panel=el.querySelector('section[data-ink-settings]');panel.hidden=!open;panel.inert=!open;
  el.querySelector('.score-ink-actions [data-ink-settings]').setAttribute('aria-expanded',String(open));
 }
 function syncSettings(){
  const p=profiles[paintTool];
  el.querySelector('[data-ink-profile-label]').textContent=paintTool==='highlighter'?'형광펜 설정':'펜 설정';
  const swatches=(name,colors)=>{
   const host=el.querySelector('[data-ink-'+name+']');host.replaceChildren();
   for(const [color,label]of colors){
    const b=document.createElement('button');b.type='button';b.className='score-ink-swatch';b.dataset.inkSwatch=color;
    b.setAttribute('aria-label',label+' '+color);b.title=label+' '+color;b.setAttribute('aria-pressed',String(p.color===color));
    const dot=document.createElement('span');dot.style.background=color;dot.setAttribute('aria-hidden','true');b.append(dot);
    b.onclick=()=>updateSettings({color},{recent:true});host.append(b);
   }
   if(!colors.length){const hint=document.createElement('span');hint.className='score-ink-no-colors';hint.textContent='아직 없어요';host.append(hint);}
  };
  swatches('palette',Settings.PALETTES[paintTool]);
  swatches('recent',p.recent.map(c=>[c,'최근 사용 색상']));
  swatches('custom',p.custom.map(c=>[c,'사용자 색상']));
  el.querySelector('[data-ink-width]').value=String(Math.round(p.width*1000));el.querySelector('[data-ink-width-label]').textContent=String(Math.round(p.width*1000));
  el.querySelector('[data-ink-opacity]').value=String(Math.round((1-p.opacity)*100));el.querySelector('[data-ink-opacity-label]').textContent=Math.round((1-p.opacity)*100)+'%';
  el.querySelector('[data-ink-pen-only]').checked=profiles.penOnly;if(svg)svg.dataset.penOnly=String(profiles.penOnly);
  el.querySelector('[data-ink-picker]').value=p.color;el.querySelector('[data-ink-hex]').value=p.color;
  el.querySelector('[data-ink-custom-add]').disabled=false;el.querySelector('[data-ink-custom-remove]').disabled=!p.custom.includes(p.color);
  el.style.setProperty('--ink-active-color',p.color);
 }
 function updateSettings(patch,options={}){
  finishStroke();
  try{current();profiles=prefs.write(paintTool,patch,options);syncSettings();}
  catch(e){if(patch.width!==undefined||patch.opacity!==undefined)syncSettings();say('도구 설정을 저장하지 못했어요: '+e.message,true);}
 }
 function fullLayout(next){
  resetGestures();full=next;el.classList.toggle('score-ink-fullscreen',full);
  const button=el.querySelector('[data-ink-fullscreen]');
  button.setAttribute('aria-label',full?'전체화면 종료':'전체화면');button.title=full?'전체화면 종료':'전체화면';
  button.innerHTML='<i class="ph ph-'+(full?'arrows-in':'arrows-out')+'" aria-hidden="true"></i>';
 }
 async function fullscreen(next){
  finishStroke();const generation=++fullGeneration;fullLayout(next);
  try{
   if(next&&document.fullscreenEnabled&&el.requestFullscreen&&!document.fullscreenElement)await el.requestFullscreen();
   else if(!next&&document.fullscreenElement===el)await document.exitFullscreen();
  }catch{} // iOS/PWA keep the same viewport-filling layout when native fullscreen is unavailable.
  if(!closed&&generation===fullGeneration)requestAnimationFrame(renderPage);
 }
 function nativeFullscreenChanged(){
  if(closed)return;
  const native=document.fullscreenElement===el;
  if(hadNative&&!native&&full){fullLayout(false);requestAnimationFrame(renderPage);}
  hadNative=native;
 }

 function resetGestures(){touchPan=null;touches.clear();pinch=null;pinchDirty=false;}
 function zoomValue(){
  const select=el.querySelector('[data-ink-zoom]'),value=String(zoom);
  select.querySelector('[data-ink-free-zoom]')?.remove();
  if(![...select.options].some(o=>o.value===value)){const option=new Option(Math.round(zoom*100)+'%',value);option.dataset.inkFreeZoom='';select.add(option);}
  select.value=value;
 }
 function beginPinch(){
  const points=[...touches.values()];if(points.length<2)return;
  const [a,b]=points,r=box.getBoundingClientRect(),distance=Math.hypot(a.x-b.x,a.y-b.y);
  if(distance<8)return;
  pinch={distance,zoom,x:((a.x+b.x)/2-r.left)/r.width,y:((a.y+b.y)/2-r.top)/r.height};
 }
 function gestureDown(event){
  if(touches.size>=2||event.width>50||event.height>50)return;
  event.preventDefault();touches.set(event.pointerId,{x:event.clientX,y:event.clientY});touchPan={pointer:event.pointerId,x:event.clientX,y:event.clientY};
  if(touches.size===2)beginPinch();try{svg.setPointerCapture(event.pointerId);}catch{}
 }
 function gestureMove(event){
  const old=touches.get(event.pointerId);if(!old)return false;
  event.preventDefault();touches.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(touches.size===2){
   if(!pinch)beginPinch();if(!pinch)return true;
   const [a,b]=[...touches.values()],r=stage.getBoundingClientRect(),distance=Math.hypot(a.x-b.x,a.y-b.y);
   zoom=Math.round(Math.max(.75,Math.min(4,pinch.zoom*distance/pinch.distance))*100)/100;zoomValue();
   const width=baseWidth*zoom,height=width*aspect;box.style.width=width+'px';box.style.height=height+'px';
   stage.scrollLeft=box.offsetLeft+pinch.x*width-((a.x+b.x)/2-r.left);
   stage.scrollTop=box.offsetTop+pinch.y*height-((a.y+b.y)/2-r.top);pinchDirty=true;
  }else{
   stage.scrollLeft-=event.clientX-old.x;stage.scrollTop-=event.clientY-old.y;
   touchPan={pointer:event.pointerId,x:event.clientX,y:event.clientY};
  }
  return true;
 }
 function gestureEnd(event){
  if(!touches.has(event.pointerId))return false;
  touches.delete(event.pointerId);pinch=null;
  if(!touches.size){const redraw=pinchDirty;resetGestures();if(redraw)renderPage({keepScroll:true});}
  return true;
 }

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
   path.setAttribute('stroke-width',s.width*1000);path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');path.setAttribute('opacity',String(Ink.opacity(s)));path.dataset.stroke=s.id;svg.append(path);
  }
  el.querySelector('[data-ink-undo]').disabled=!ready||busy||!!pending||!undo.length;
  el.querySelector('[data-ink-redo]').disabled=!ready||busy||!!pending||!redo.length;
 }
 function schedule(){
  if(frame)return;
  frame=requestAnimationFrame(()=>{
   frame=0;if(closed||!binding)return;
   try{
    if(!active){paint();return;}
    const s=active.stroke;
    if(!active.path?.isConnected){
     active.path=svg.querySelector('[data-stroke="'+s.id+'"]');
     if(!active.path){
      const p=document.createElementNS('http://www.w3.org/2000/svg','path');p.dataset.stroke=s.id;p.setAttribute('fill','none');p.setAttribute('stroke',s.color);
      p.setAttribute('stroke-width',s.width*1000);p.setAttribute('stroke-linecap','round');p.setAttribute('stroke-linejoin','round');p.setAttribute('opacity',String(Ink.opacity(s)));
      svg.append(p);active.path=p;
     }
    }
    active.path.setAttribute('d',Ink.path(s,aspect));
   }catch(e){say(e.message,true);}
  });
 }
 function apply(action,kind='normal'){
  pending={action,kind};
  try{
   current();
   if(!store.commit({add:action.add,remove:action.remove.map(s=>s.id)}))throw Error('필기 복구 기록은 보존했어요. 저장 공간을 확인하고 다시 저장해 주세요.');
   pending=null;
   if(kind==='normal'){undo.push(action);redo=[];}else if(kind==='undo'){undo.pop();redo.push(action);}else{redo.pop();undo.push(action);}
   lastSaveMessage=navigator.onLine===false?'이 기기에 저장됨 · 온라인 연결 후 동기화':'이 기기에 저장됨 · 클라우드는 기존 동기화로 저장';say(lastSaveMessage);
  }catch(e){say('저장하지 못했어요: '+e.message,true);}
  paint();
 }
 function inverse(action){return {add:action.remove.map(s=>({...s,id:VZ.uid(),createdAt:Date.now()})),remove:action.add};}
 function finishStroke(){
  if(!active)return;const s=active.stroke;active=null;
  if(s?.points.length){
   apply({add:[s],remove:[]});
   if(!pending)try{profiles=prefs.write(s.tool,{},{recent:true});syncSettings();}catch{say('필기는 이 기기에 저장됨 · 최근 색상 설정은 저장하지 못했어요.');}
  }
 }
 function coords(event){const r=svg.getBoundingClientRect();return Ink.point((event.clientX-r.left)/r.width,(event.clientY-r.top)/r.height,event.pressure||0.5);}
 async function renderPage({keepScroll=false}={}){
  if(!doc||closed)return;const previousScroll={left:stage.scrollLeft,top:stage.scrollTop};resetGestures();finishStroke();busy=true;ready=false;const number=++renderNumber;renderTask?.cancel();
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
   box.hidden=false;ready=true;svg.dataset.tool=tool;svg.dataset.penOnly=String(profiles.penOnly);if(keepScroll)stage.scrollTo(previousScroll.left,previousScroll.top);else stage.scrollTo(0,0);
   paint();if(pending)say('필기 저장이 끝나지 않았어요. 다시 저장해 주세요.',true);else say(lastSaveMessage||'필기 준비됨 · 한 획씩 이 기기에 자동 저장');
  }catch(e){if(!closed&&number===renderNumber&&e.name!=='RenderingCancelledException')say('악보를 열지 못했어요: '+e.message,true);}
  finally{if(number===renderNumber){busy=false;if(!closed)paint();}}
 }
 function closeEditor(){
  finishStroke();if(pending){say('필기를 먼저 다시 저장해 주세요. 저장되지 않은 획은 이 화면에 남아 있어요.',true);return;}
  sheet.close();VZ.toast('필기 화면을 닫았어요.');
 }
 function changed(){
  if(closed)return;
  try{current();store.restore();paint();}catch{sheet.close();}
 }
 function cleanup(){
  closed=true;document.removeEventListener('fullscreenchange',nativeFullscreenChanged);if(document.fullscreenElement===el)document.exitFullscreen?.().catch(()=>{});controller.abort();resizeObserver?.disconnect();clearTimeout(resizeTimer);cancelAnimationFrame(frame);resetGestures();renderTask?.cancel();loadingTask?.destroy()?.catch?.(()=>{});doc?.destroy()?.catch?.(()=>{});
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
  back.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(!el.querySelector('section[data-ink-settings]').hidden)settingsOpen(false);else if(full)fullscreen(false);else closeEditor();}},true);
  done.onclick=()=>{if(pending)apply(pending.action,pending.kind);else closeEditor();};
  const settingsButton=el.querySelector('.score-ink-actions [data-ink-settings]');
  settingsButton.setAttribute('aria-expanded','false');
  settingsButton.onclick=()=>settingsOpen(el.querySelector('section[data-ink-settings]').hidden);
  el.querySelector('[data-ink-settings-close]').onclick=()=>settingsOpen(false);
  el.querySelector('[data-ink-fullscreen]').onclick=()=>fullscreen(!full);
  el.querySelector('[data-ink-width]').oninput=event=>updateSettings({width:Number(event.target.value)/1000});
  el.querySelector('[data-ink-opacity]').oninput=event=>updateSettings({opacity:Math.round((100-Number(event.target.value))*1000)/100000});
  el.querySelector('[data-ink-picker]').oninput=event=>{el.querySelector('[data-ink-hex]').value=event.target.value;el.querySelector('[data-ink-custom-add]').disabled=false;};
  el.querySelector('[data-ink-hex]').oninput=event=>{const valid=/^#[0-9a-f]{6}$/i.test(event.target.value);el.querySelector('[data-ink-custom-add]').disabled=!valid;if(valid)el.querySelector('[data-ink-picker]').value=event.target.value;};
  el.querySelector('[data-ink-custom-add]').onclick=()=>updateSettings({color:el.querySelector('[data-ink-hex]').value},{custom:true,recent:true});
  el.querySelector('[data-ink-custom-remove]').onclick=()=>updateSettings({},{removeCustom:true});
  el.querySelector('[data-ink-pen-only]').onchange=event=>{finishStroke();try{profiles=prefs.write('input',{penOnly:event.target.checked});syncSettings();}catch(e){event.target.checked=profiles.penOnly;say(e.message,true);}};
  syncSettings();settingsOpen(false);
  el.querySelectorAll('[data-ink-tool]').forEach(button=>button.onclick=()=>{
   finishStroke();resetGestures();tool=button.dataset.inkTool;svg.dataset.tool=tool;if(['pen','highlighter'].includes(tool))paintTool=tool;syncSettings();
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
   if(!ready||busy||pending||event.button>0)return;
   if(event.pointerType==='touch'&&(profiles.penOnly||tool==='pan')){
    if(active)return;
    if(!el.querySelector('section[data-ink-settings]').hidden){settingsOpen(false);return;}
    gestureDown(event);return;
   }
   if(tool==='pan'||active||event.isPrimary===false)return;
   if(!el.querySelector('section[data-ink-settings]').hidden){settingsOpen(false);return;}
   if(profiles.penOnly&&event.pointerType!=='pen')return;
   resetGestures();
   try{
    current();event.preventDefault();const p=coords(event);
    if(tool==='eraser'){const found=strokes().reverse().find(s=>Ink.hit(s,p,aspect));if(found)apply({add:[],remove:[found]});return;}
    const config=profiles[tool];
    const stroke={version:1,id:VZ.uid(),...binding,page:pageNo,tool,color:config.color,opacity:config.opacity,
     width:config.width,points:[p],createdAt:Date.now()};
    active={pointer:event.pointerId,stroke};try{svg.setPointerCapture?.(event.pointerId);}catch{}schedule();
   }catch(e){say(e.message,true);}
  };
  svg.onpointermove=event=>{
   if(!active&&gestureMove(event))return;
   if(active?.pointer!==event.pointerId)return;event.preventDefault();
   const samples=event.getCoalescedEvents?.();const events=samples?.length?samples:[event];
   for(const item of events){const p=coords(item),last=active.stroke.points.at(-1);if(Math.hypot(p[0]-last[0],p[1]-last[1])>0.0008&&active.stroke.points.length<Ink.MAX_POINTS)active.stroke.points.push(p);}
   schedule();
  };
  svg.onpointerup=svg.onpointercancel=svg.onlostpointercapture=event=>{
   if(gestureEnd(event))return;
   if(active?.pointer!==event.pointerId)return;
   if(event.type==='pointerup'&&active.stroke.points.length<Ink.MAX_POINTS){const p=coords(event),last=active.stroke.points.at(-1);if(Math.hypot(p[0]-last[0],p[1]-last[1])>0.0008)active.stroke.points.push(p);}
   finishStroke();
  };
 }});
 if(window.ResizeObserver){resizeObserver=new ResizeObserver(()=>{if(ready&&!busy&&Math.abs(Math.max(240,stage.clientWidth-16)-baseWidth)>1){clearTimeout(resizeTimer);resizeTimer=setTimeout(renderPage,120);}});resizeObserver.observe(stage);}
 cleanupHook=scope?.beforeLeave(()=>{if(active||pending)throw Error('악보 필기를 먼저 저장하고 계정을 바꿔 주세요.');sheet.close();})||(()=>{});
 document.addEventListener('fullscreenchange',nativeFullscreenChanged);
 window.addEventListener('vzip:auth-changed',changed);window.addEventListener('vzip:data-changed',changed);
 window.addEventListener('beforeunload',unload);document.addEventListener('visibilitychange',hidden);
 VZ.setGuard(()=>{finishStroke();return pending?'필기가 아직 저장되지 않았어요. 먼저 다시 저장해 주세요.':null;});
 (async()=>{
  try{
   const [pdf,url]=await Promise.all([library(),window.VzipR2.url(score.r2Key)]);current();el.querySelector('[data-ink-original]').href=url;
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
