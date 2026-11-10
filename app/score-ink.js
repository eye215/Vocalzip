/* Phase 07-C: client-rendered PDF and private vector ink. Original R2 bytes never change. */
(() => {
'use strict';
const VZ=window.VZ,Ink=window.VzipScoreInk,Settings=window.VzipScoreInkSettings,Export=window.VzipScoreInkExport;
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
 if(!response.body?.getReader)throw Error('이 브라우저에서 PDF 다운로드를 시작하지 못했어요.');
 const out=new Uint8Array(size),reader=response.body.getReader();let offset=0;
 try{for(;;){if(signal.aborted)throw new DOMException('닫힘','AbortError');const chunk=await deadline(reader.read(),20000,'PDF 다운로드가 멈췄어요.');if(chunk.done)break;if(offset+chunk.value.length>size)throw Error('PDF 원본 크기가 바뀌었어요. 악보를 다시 열어 주세요.');out.set(chunk.value,offset);offset+=chunk.value.length;}}
 finally{await reader.cancel().catch(()=>{});}
 if(offset!==size||!new TextDecoder().decode(out.subarray(0,1024)).includes('%PDF-'))throw Error('PDF 원본을 확인하지 못했어요.');
 return out;
}
function deadline(promise,ms,message){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms);})]).finally(()=>clearTimeout(timer));}
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
 let selection=null,selectionFrame=0,exportUrl=null,exportStamp='',exportBusy=false,lastSaveMessage='',tool=profiles.penOnly?'pen':'pan',paintTool='pen',full=false,hadNative=false,fullGeneration=0,touchPan=null,pageSwipe=null,twoSwipe=null,touchInkStart=null,touchEraser=null,touches=new Map(),pinch=null,pinchDirty=false,active=null,pending=null,undo=[],redo=[],frame=0,renderNumber=0,cleanupHook=()=>{},resizeObserver,resizeTimer,sheet,el,svg,canvas,box,stage,status,done;
 const button=(name,icon,label)=>'<button type="button" class="icon-btn" data-ink-'+name+' aria-label="'+label+'" title="'+label+'"><i class="ph ph-'+icon+'"></i></button>';
 const tools=['pan','pen','highlighter','eraser','select'];
 const names=['이동','펜','형광펜','지우개','선택'],icons=['hand','pen','highlighter','eraser','selection'];
 const body='<div class="score-ink-editor"><p class="score-ink-title">'+VZ.esc(score.title||score.fileName||'PDF 악보')+'</p>'+
  '<div class="score-ink-bar"><div class="score-ink-tools" role="toolbar" aria-label="필기 도구">'+tools.map((t,i)=>'<button type="button" data-ink-tool="'+t+'" aria-label="'+names[i]+'" title="'+names[i]+'" aria-pressed="'+(t===tool)+'"><i class="ph ph-'+icons[i]+'"></i><span>'+names[i]+'</span></button>').join('')+
  '</div>'+
  '<div class="score-ink-actions">'+button('undo','arrow-counter-clockwise','필기 되돌리기')+button('redo','arrow-clockwise','필기 다시 실행')+button('clear','trash','현재 페이지 필기 삭제')+button('settings','sliders-horizontal','색상·굵기·투명도 설정')+button('fullscreen','arrows-out','전체화면')+'</div>'+
  '<section class="score-ink-settings" data-ink-settings aria-label="필기 설정" hidden><div class="score-ink-settings-head"><strong data-ink-profile-label>펜 설정</strong>'+button('settings-close','x','필기 설정 닫기')+'</div>'+
  '<div class="score-ink-palette-section"><span>기본 색상</span><div data-ink-palette class="score-ink-swatches" role="group" aria-label="기본 색상"></div></div>'+
  '<div class="score-ink-palette-section"><span>최근 사용</span><div data-ink-recent class="score-ink-swatches" role="group" aria-label="최근 사용 색상"></div></div>'+
  '<div class="score-ink-palette-section"><span>사용자 색상</span><div data-ink-custom class="score-ink-swatches" role="group" aria-label="사용자 색상"></div></div>'+
  '<div class="score-ink-custom-add"><input type="color" data-ink-picker aria-label="사용자 색상 선택" value="#101828"><input type="text" data-ink-hex aria-label="사용자 색상 코드" maxlength="7" placeholder="#RRGGBB" value="#101828" autocapitalize="none" spellcheck="false"><button type="button" data-ink-custom-add>추가</button></div>'+
  '<button type="button" class="score-ink-custom-remove" data-ink-custom-remove>선택한 사용자 색상 삭제</button>'+
  '<label class="score-ink-slider">굵기 <output data-ink-width-label>4</output><input type="range" data-ink-width aria-label="펜 굵기" min="1" max="60" step="1" value="4"></label>'+
  '<label class="score-ink-slider">투명도 <output data-ink-opacity-label>0%</output><input type="range" data-ink-opacity aria-label="필기 투명도" min="0" max="95" step="1" value="0"></label>'+
  '<label class="score-ink-pen-only"><input type="checkbox" aria-label="펜만" data-ink-pen-only>펜만 필기 · 손가락은 스크롤</label>'+
  '<a data-ink-original target="_blank" rel="noopener">원본 PDF 열기</a><button type="button" data-ink-export>필기 PDF 만들기</button><a data-ink-export-save hidden>만든 PDF 저장</a></section></div>'+
  '<div class="score-ink-pages">'+button('prev','caret-left','이전 악보 페이지')+'<span data-ink-page aria-live="polite">불러오는 중</span>'+button('next','caret-right','다음 악보 페이지')+
  '<select data-ink-zoom aria-label="악보 확대"><option value="1">화면 맞춤</option><option value="1.5">150%</option><option value="2">200%</option></select></div>'+
  '<div class="score-ink-selection-bar" data-ink-selection-bar role="group" aria-label="선택한 필기" hidden><span data-ink-selection-count></span>'+button('selection-smaller','minus','선택 필기 축소')+button('selection-larger','plus','선택 필기 확대')+button('selection-delete','trash','선택 필기 삭제')+button('selection-clear','x','필기 선택 해제')+'</div>'+
  '<p class="score-ink-status" data-ink-status role="status" aria-live="polite">PDF를 준비하고 있어요.</p><a class="score-ink-original-quick" data-ink-original-quick target="_blank" rel="noopener" hidden>원본 PDF 열기</a>'+
  '<div class="score-ink-stage" data-ink-stage tabindex="0" aria-label="악보 페이지"><div class="score-ink-page" data-ink-box hidden><canvas data-ink-pdf aria-label="PDF 악보"></canvas><svg xmlns="http://www.w3.org/2000/svg" data-ink-svg role="img" aria-label="개인 필기 영역"></svg></div></div>'+
  '<p class="score-ink-help">손가락 두 개로 좌우 스와이프해 페이지를 넘겨요. ‘펜만 필기’가 켜져 있으면 한 손가락도 사용할 수 있어요.</p></div>';
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

 function resetGestures(){touchPan=null;pageSwipe=null;twoSwipe=null;touchInkStart=null;touchEraser=null;touches.clear();pinch=null;pinchDirty=false;}
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
  if(touches.size===1)pageSwipe={pointer:event.pointerId,x:event.clientX,y:event.clientY,time:Date.now(),atLeft:stage.scrollLeft<=2,atRight:stage.scrollLeft>=stage.scrollWidth-stage.clientWidth-2};
  if(touches.size===2){
   const starts=new Map([...touches].map(([id,p])=>[id,{...p}]));
   twoSwipe={starts,ends:new Map(starts),time:Date.now(),zoom,atLeft:pageSwipe.atLeft,atRight:pageSwipe.atRight,canceled:false};
   beginPinch();
  }
  try{svg.setPointerCapture(event.pointerId);}catch{}
 }
 function gestureMove(event){
  const old=touches.get(event.pointerId);if(!old)return false;
  event.preventDefault();touches.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(twoSwipe?.ends.has(event.pointerId))twoSwipe.ends.set(event.pointerId,{x:event.clientX,y:event.clientY});
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
  if(twoSwipe){
   twoSwipe.ends.set(event.pointerId,{x:event.clientX,y:event.clientY});
   if(event.type!=='pointerup')twoSwipe.canceled=true;
  }
  touches.delete(event.pointerId);pinch=null;
  if(!touches.size){
   const swipe=pageSwipe,pair=twoSwipe,redraw=pinchDirty;
   let direction=0;
   if(pair&&!pair.canceled&&Date.now()-pair.time<1200){
    const ids=[...pair.starts.keys()],[a,b]=ids.map(id=>pair.starts.get(id)),[c,d]=ids.map(id=>pair.ends.get(id));
    const dx1=c.x-a.x,dx2=d.x-b.x,dy1=c.y-a.y,dy2=d.y-b.y;
    const startDistance=Math.hypot(a.x-b.x,a.y-b.y),endDistance=Math.hypot(c.x-d.x,c.y-d.y);
    if(dx1*dx2>0&&Math.min(Math.abs(dx1),Math.abs(dx2))>72&&Math.max(Math.abs(dy1),Math.abs(dy2))<Math.min(Math.abs(dx1),Math.abs(dx2))*.7&&Math.abs(dx1-dx2)<55&&Math.abs(endDistance-startDistance)<Math.max(25,startDistance*.18))direction=dx1<0?1:-1;
   }else if(profiles.penOnly&&event.type==='pointerup'&&swipe?.pointer===event.pointerId&&Date.now()-swipe.time<900){
    const dx=event.clientX-swipe.x,dy=event.clientY-swipe.y;
    if(Math.abs(dx)>72&&Math.abs(dx)>Math.abs(dy)*1.4)direction=dx<0?1:-1;
   }
   const edge=direction===1?(pair||swipe)?.atRight:(pair||swipe)?.atLeft;
   const turn=direction&&edge&&ready&&!busy&&!pending&&pageNo+direction>=1&&pageNo+direction<=doc?.numPages;
   if(pair&&turn){zoom=pair.zoom;zoomValue();}
   resetGestures();
   if(turn){pageNo+=direction;renderPage();}
   else if(redraw)renderPage({keepScroll:true});
  }
  return true;
 }

 // Selection snapshots never mutate stored strokes. One transform becomes one undo action.
 function clearSelection(){cancelAnimationFrame(selectionFrame);selectionFrame=0;selection=null;}
 function selectionFresh(){
  if(!selection?.rows?.length)return true;
  const rows=store.list(binding,pageNo);return selection.rows.every(s=>rows.some(r=>r.id===s.id&&Ink.same(r,s)));
 }
 function selected(rows){
  selection=rows.length?{rows,page:pageNo,preview:null,drag:null}:null;paint();
  say(rows.length?rows.length+'개 선택됨 · 안쪽을 끌어 이동, 오른쪽 아래 모서리로 크기 조절':'필기를 누르거나 사각형으로 둘러 선택하세요.');
 }
 function commitSelection(rows){
  if(!selectionFresh()){clearSelection();paint();say('선택한 필기가 다른 곳에서 바뀌었어요. 다시 선택해 주세요.',true);return;}
  if(rows.every((s,i)=>s.width===selection.rows[i].width&&JSON.stringify(s.points)===JSON.stringify(selection.rows[i].points))){selection.preview=null;paint();return;}
  const old=selection.rows;clearSelection();
  const add=rows.map(s=>({...s,id:VZ.uid()}));
  apply({add,remove:old});if(!pending){selection={rows:add,page:pageNo,preview:null,drag:null};paint();}
 }
 function selectionEnd(commit=true){
  if(!selection?.drag)return;
  const drag=selection.drag,preview=selection.preview;selection.drag=null;selection.preview=null;
  if(drag.kind==='marquee'){
   if(!commit){clearSelection();paint();return;}
   const a=drag.start,b=drag.end||a,r=svg.getBoundingClientRect();
   const rows=store.list(binding,pageNo);
   selected(Math.hypot((b[0]-a[0])*r.width,(b[1]-a[1])*r.height)<6?
    rows.slice().reverse().filter(s=>Ink.hit(s,b,aspect)).slice(0,1):
    Ink.inRect(rows,{x:a[0],y:a[1],w:b[0]-a[0],h:b[1]-a[1]},aspect));return;
  }
  if(commit&&preview)commitSelection(preview);else paint();
 }
 function selectionDown(event,p){
  if(selection&&!selectionFresh()){clearSelection();say('선택한 필기가 바뀌었어요. 다시 선택해 주세요.',true);}
  const b=selection?.rows.length?Ink.bounds(selection.rows,aspect):null;
  let kind='marquee';
  if(b&&(event.target.closest?.('[data-ink-selection-handle]')))kind='resize';
  else if(b&&p[0]>=b.x&&p[0]<=b.x+b.w&&p[1]>=b.y&&p[1]<=b.y+b.h)kind='move';
  if(kind==='marquee')selection={rows:[],page:pageNo,preview:null,drag:{kind,start:p,end:p,pointer:event.pointerId}};
  else selection.drag={kind,start:p,end:p,bounds:b,pointer:event.pointerId};
  try{svg.setPointerCapture(event.pointerId);}catch{}paint();
 }
 function selectionMove(event){
  const drag=selection?.drag;if(!drag||drag.pointer!==event.pointerId)return false;
  event.preventDefault();const p=coords(event);drag.end=p;
  if(drag.kind!=='marquee'){
   const r=svg.getBoundingClientRect();
   if(Math.hypot((p[0]-drag.start[0])*r.width,(p[1]-drag.start[1])*r.height)>=3){
    const b=drag.bounds,scale=drag.kind==='resize'?1+((p[0]-drag.start[0])*b.w+(p[1]-drag.start[1])*b.h*aspect*aspect)/(b.w*b.w+b.h*b.h*aspect*aspect):1;
    selection.preview=Ink.transform(selection.rows,drag.kind==='move'?{dx:p[0]-drag.start[0],dy:p[1]-drag.start[1]}:{scale:Math.max(.001,scale)},aspect);
   }else selection.preview=null;
  }
  if(!selectionFrame)selectionFrame=requestAnimationFrame(()=>{selectionFrame=0;paint();});return true;
 }
 function selectionOverlay(){
  const panel=el.querySelector('[data-ink-selection-bar]'),rows=selection?.rows||[];
  panel.hidden=!rows.length||tool!=='select';
  el.querySelector('[data-ink-selection-count]').textContent=rows.length+'개 선택';
  panel.querySelectorAll('button').forEach(b=>b.disabled=busy||exportBusy||!!pending||!!selection?.drag);
  if(!selection||tool!=='select')return;
  const drag=selection.drag,preview=selection.preview||rows;
  let b=preview.length?Ink.bounds(preview,aspect):null;
  if(drag?.kind==='marquee'){const a=drag.start,p=drag.end;b={x:Math.min(a[0],p[0]),y:Math.min(a[1],p[1]),w:Math.abs(p[0]-a[0]),h:Math.abs(p[1]-a[1])};}
  if(!b)return;
  const node=(tag,attrs)=>{const n=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
  const group=node('g',{'data-ink-selection-overlay':'','aria-hidden':'true'});
  group.append(node('rect',{x:b.x*1000,y:b.y*aspect*1000,width:b.w*1000,height:b.h*aspect*1000,class:'score-ink-selection-outline','vector-effect':'non-scaling-stroke'}));
  if(rows.length){
   const pixel=1000/Math.max(1,svg.getBoundingClientRect().width),x=Math.max(22*pixel,Math.min(1000-22*pixel,(b.x+b.w)*1000)),y=Math.max(22*pixel,Math.min(aspect*1000-22*pixel,(b.y+b.h)*aspect*1000));
   group.append(node('rect',{x:x-22*pixel,y:y-22*pixel,width:44*pixel,height:44*pixel,fill:'transparent','data-ink-selection-handle':''}));
   group.append(node('circle',{cx:x,cy:y,r:6*pixel,class:'score-ink-selection-handle','data-ink-selection-handle':'','vector-effect':'non-scaling-stroke'}));
  }
  svg.append(group);
 }
 function resizeSelection(scale){
  if(!selection?.rows.length||selection.drag||busy||exportBusy||pending)return;
  try{current();commitSelection(Ink.transform(selection.rows,{scale},aspect));}catch(e){say(e.message,true);}
 }
 const exportSignature=rows=>JSON.stringify(rows.map(s=>[s.id,s.page,s.tool,s.color,s.width,Ink.opacity(s),s.points]));
 function invalidateExport(){
  if(exportUrl)URL.revokeObjectURL(exportUrl);exportUrl=null;exportStamp='';
  const link=el?.querySelector('[data-ink-export-save]');if(link){link.hidden=true;link.removeAttribute('href');}
 }
 async function exportPDF(){
  selectionEnd();finishStroke();if(!doc||!ready||busy||pending||exportBusy||!Export){say('악보와 필기 저장을 확인한 뒤 다시 시도해 주세요.',true);return;}
  const button=el.querySelector('[data-ink-export]'),rows=store.list(binding),stamp=exportSignature(rows);exportBusy=true;button.disabled=true;paint();say('필기 PDF를 만들고 있어요.');
  try{
   const blob=await Export.make({document:doc,binding,annotations:rows,check:()=>{current();if(closed||controller.signal.aborted)throw new DOMException('닫힘','AbortError');},
    onProgress:(page,total)=>say('필기 PDF 준비 '+page+' / '+total+'쪽')});
   current();if(exportSignature(store.list(binding))!==stamp)throw Error('내보내는 동안 필기가 바뀌었어요. 다시 만들어 주세요.');
   invalidateExport();exportUrl=URL.createObjectURL(blob);exportStamp=stamp;
   const link=el.querySelector('[data-ink-export-save]');link.href=exportUrl;link.download=String(score.title||'악보').replace(/[\\/:*?"<>|]/g,'_')+'_필기.pdf';link.hidden=false;
   say('필기 PDF가 준비됐어요. 만든 PDF 저장을 눌러 주세요.');settingsOpen(true);
  }catch(e){if(!closed&&e.name!=='AbortError')say('내보내지 못했어요: '+e.message+' · 원본과 필기는 유지돼요.',true);}
  finally{exportBusy=false;if(!closed){button.disabled=false;paint();}}
 }

 function strokes(){
  if(!binding)return [];
  let rows=store.list(binding,pageNo);if(pending){rows=rows.filter(s=>!pending.action.remove.some(r=>r.id===s.id));const ids=new Set(rows.map(s=>s.id));rows.push(...pending.action.add.filter(s=>s.page===pageNo&&!ids.has(s.id)));}
  if(selection?.preview){const ids=new Set(selection.rows.map(s=>s.id));rows=rows.map(s=>ids.has(s.id)?selection.preview.find(r=>r.id===s.id):s);}
  if(active?.stroke)rows.push(active.stroke);return rows;
 }
 function paint(){
  if(!svg||!binding||closed)return;
  svg.replaceChildren();svg.setAttribute('viewBox','0 0 1000 '+(1000*aspect));
  for(const s of strokes()){
   const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',Ink.path(s,aspect));path.setAttribute('fill','none');path.setAttribute('stroke',s.color);
   path.setAttribute('stroke-width',s.width*1000);path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');path.setAttribute('opacity',String(Ink.opacity(s)));path.dataset.stroke=s.id;svg.append(path);
  }
  selectionOverlay();
  el.querySelector('[data-ink-undo]').disabled=!ready||busy||exportBusy||!!pending||!undo.length;
  el.querySelector('[data-ink-redo]').disabled=!ready||busy||exportBusy||!!pending||!redo.length;
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
   pending=null;invalidateExport();
   if(kind==='normal'){undo.push(action);redo=[];}else if(kind==='undo'){undo.pop();redo.push(action);}else{redo.pop();undo.push(action);}
   lastSaveMessage=navigator.onLine===false?'이 기기에 저장됨 · 온라인 연결 후 동기화':'이 기기에 저장됨 · 클라우드는 기존 동기화로 저장';say(lastSaveMessage);
  }catch(e){say('저장하지 못했어요: '+e.message,true);}
  paint();
 }
 function inverse(action){return {add:action.remove.map(s=>({...s,id:VZ.uid()})),remove:action.add};}
 function finishStroke(){
  if(!active)return;const s=active.stroke;active=null;
  if(s?.points.length){
   apply({add:[s],remove:[]});
   if(!pending)try{profiles=prefs.write(s.tool,{},{recent:true});syncSettings();}catch{say('필기는 이 기기에 저장됨 · 최근 색상 설정은 저장하지 못했어요.');}
  }
 }
 function coords(event){const r=svg.getBoundingClientRect();return Ink.point((event.clientX-r.left)/r.width,(event.clientY-r.top)/r.height,event.pressure||0.5);}
 async function renderPage({keepScroll=false}={}){
  if(!doc||closed)return;const previousScroll={left:stage.scrollLeft,top:stage.scrollTop};resetGestures();selectionEnd(false);if(selection?.page!==pageNo)clearSelection();finishStroke();busy=true;ready=false;const number=++renderNumber;renderTask?.cancel();
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
   el.querySelector('[data-ink-prev]').disabled=pageNo<=1||!binding;el.querySelector('[data-ink-next]').disabled=pageNo>=doc.numPages||!binding;
   box.hidden=false;ready=!!binding;svg.dataset.tool=ready?tool:'pan';svg.dataset.penOnly=String(profiles.penOnly);svg.style.pointerEvents=ready?'':'none';if(keepScroll)stage.scrollTo(previousScroll.left,previousScroll.top);else stage.scrollTo(0,0);
   paint();if(!binding)say('악보를 볼 수 있어요 · 필기를 확인하고 있어요.');else if(pending)say('필기 저장이 끝나지 않았어요. 다시 저장해 주세요.',true);else say(lastSaveMessage||'필기 준비됨 · 한 획씩 이 기기에 자동 저장');
  }catch(e){if(!closed&&number===renderNumber&&e.name!=='RenderingCancelledException')say('악보를 열지 못했어요: '+e.message,true);}
  finally{if(number===renderNumber){busy=false;if(!closed)paint();}}
 }
 function closeEditor(){
  selectionEnd();finishStroke();if(pending){say('필기를 먼저 다시 저장해 주세요. 저장되지 않은 획은 이 화면에 남아 있어요.',true);return;}
  sheet.close();VZ.toast('필기 화면을 닫았어요.');
 }
 function changed(){
  if(closed)return;
  try{current();store.restore();if(selection&&!selectionFresh()){clearSelection();say('선택한 필기가 다른 곳에서 바뀌었어요. 다시 선택해 주세요.',true);}if(exportUrl&&exportSignature(store.list(binding))!==exportStamp)invalidateExport();paint();}catch{sheet.close();}
 }
 function cleanup(){
  closed=true;clearSelection();invalidateExport();document.removeEventListener('fullscreenchange',nativeFullscreenChanged);if(document.fullscreenElement===el)document.exitFullscreen?.().catch(()=>{});controller.abort();resizeObserver?.disconnect();clearTimeout(resizeTimer);cancelAnimationFrame(frame);resetGestures();renderTask?.cancel();loadingTask?.destroy()?.catch?.(()=>{});doc?.destroy()?.catch?.(()=>{});
  if(canvas){canvas.width=0;canvas.height=0;}cleanupHook();window.removeEventListener('vzip:auth-changed',changed);window.removeEventListener('vzip:data-changed',changed);
  window.removeEventListener('beforeunload',unload);document.removeEventListener('visibilitychange',hidden);VZ.setGuard(null);
 }
 function unload(event){selectionEnd();finishStroke();if(pending){event.preventDefault();event.returnValue='';}}
 function hidden(){if(document.visibilityState==='hidden'){selectionEnd();finishStroke();}}
 sheet=VZ.sheet({title:'악보 필기',label:'악보 개인 필기',body,foot:'<button type="button" class="btn block" data-ink-done>완료</button>',onClose:cleanup,onMount:(node)=>{
  el=node;el.classList.add('score-ink-sheet');svg=el.querySelector('[data-ink-svg]');canvas=el.querySelector('[data-ink-pdf]');box=el.querySelector('[data-ink-box]');stage=el.querySelector('[data-ink-stage]');status=el.querySelector('[data-ink-status]');done=el.querySelector('[data-ink-done]');
  el.querySelector('[data-ink-prev]').disabled=true;el.querySelector('[data-ink-next]').disabled=true;
  const back=el.parentNode;
  back.addEventListener('click',event=>{if(event.target===back||event.target.closest('[data-close]')){event.preventDefault();event.stopImmediatePropagation();closeEditor();}},true);
  back.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(!el.querySelector('section[data-ink-settings]').hidden)settingsOpen(false);else if(selection){selectionEnd(false);clearSelection();paint();}else if(full)fullscreen(false);else closeEditor();}},true);
  done.onclick=()=>{if(pending)apply(pending.action,pending.kind);else closeEditor();};
  const settingsButton=el.querySelector('.score-ink-actions [data-ink-settings]');
  settingsButton.setAttribute('aria-expanded','false');
  settingsButton.onclick=()=>settingsOpen(el.querySelector('section[data-ink-settings]').hidden);
  el.querySelector('[data-ink-settings-close]').onclick=()=>settingsOpen(false);
  el.querySelector('[data-ink-fullscreen]').onclick=()=>fullscreen(!full);
  el.querySelector('[data-ink-export]').onclick=exportPDF;
  el.querySelector('[data-ink-width]').oninput=event=>updateSettings({width:Number(event.target.value)/1000});
  el.querySelector('[data-ink-opacity]').oninput=event=>updateSettings({opacity:Math.round((100-Number(event.target.value))*1000)/100000});
  el.querySelector('[data-ink-picker]').oninput=event=>{el.querySelector('[data-ink-hex]').value=event.target.value;el.querySelector('[data-ink-custom-add]').disabled=false;};
  el.querySelector('[data-ink-hex]').oninput=event=>{const valid=/^#[0-9a-f]{6}$/i.test(event.target.value);el.querySelector('[data-ink-custom-add]').disabled=!valid;if(valid)el.querySelector('[data-ink-picker]').value=event.target.value;};
  el.querySelector('[data-ink-custom-add]').onclick=()=>updateSettings({color:el.querySelector('[data-ink-hex]').value},{custom:true,recent:true});
  el.querySelector('[data-ink-custom-remove]').onclick=()=>updateSettings({},{removeCustom:true});
  el.querySelector('[data-ink-pen-only]').onchange=event=>{finishStroke();try{profiles=prefs.write('input',{penOnly:event.target.checked});syncSettings();}catch(e){event.target.checked=profiles.penOnly;say(e.message,true);}};
  syncSettings();settingsOpen(false);
  el.querySelectorAll('[data-ink-tool]').forEach(button=>button.onclick=()=>{
   selectionEnd(false);clearSelection();finishStroke();resetGestures();tool=button.dataset.inkTool;svg.dataset.tool=tool;if(['pen','highlighter'].includes(tool))paintTool=tool;syncSettings();
   el.querySelectorAll('[data-ink-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));paint();
   if(tool==='select')say('필기를 누르거나 사각형으로 둘러 선택하세요.');
  });
  el.querySelector('[data-ink-prev]').onclick=()=>{if(ready&&!busy&&pageNo>1){pageNo--;renderPage();}};
  el.querySelector('[data-ink-next]').onclick=()=>{if(ready&&!busy&&pageNo<doc?.numPages){pageNo++;renderPage();}};
  el.querySelector('[data-ink-zoom]').onchange=event=>{zoom=Number(event.target.value);renderPage();};
  el.querySelector('[data-ink-undo]').onclick=()=>{if(!pending&&undo.length){clearSelection();apply(inverse(undo.at(-1)),'undo');}};
  el.querySelector('[data-ink-redo]').onclick=()=>{if(!pending&&redo.length){clearSelection();apply(inverse(redo.at(-1)),'redo');}};
  el.querySelector('[data-ink-selection-smaller]').onclick=()=>resizeSelection(.9);
  el.querySelector('[data-ink-selection-larger]').onclick=()=>resizeSelection(1.1);
  el.querySelector('[data-ink-selection-clear]').onclick=()=>{selectionEnd(false);clearSelection();paint();};
  el.querySelector('[data-ink-selection-delete]').onclick=()=>{
   if(!selection?.rows.length||selection.drag||busy||exportBusy||pending)return;
   try{current();if(!selectionFresh())throw Error('선택한 필기가 바뀌었어요. 다시 선택해 주세요.');const rows=selection.rows;clearSelection();apply({add:[],remove:rows});}
   catch(e){clearSelection();paint();say(e.message,true);}
  };
  el.querySelector('[data-ink-clear]').onclick=async()=>{
   if(!ready||busy||exportBusy||pending)return;
   const rows=store.list(binding,pageNo);if(!rows.length)return;
   if(await VZ.confirm('페이지 필기 삭제','현재 페이지의 개인 필기 '+rows.length+'개를 지울까요? PDF 원본은 그대로예요.',{ok:'필기 삭제',danger:true})){
    try{current();clearSelection();apply({add:[],remove:rows});}catch(e){say(e.message,true);}
   }
  };
  svg.onpointerdown=event=>{
   if(!ready||busy||exportBusy||pending||event.button>0)return;
   if(event.pointerType==='touch'&&touchInkStart&&touchInkStart.pointer!==event.pointerId&&!touches.size&&event.width<=50&&event.height<=50&&Date.now()-touchInkStart.time<280&&(!active||active.stroke.points.length<4)){
    if(active?.pointer===touchInkStart.pointer){active=null;cancelAnimationFrame(frame);frame=0;}
    touchEraser=null;
    if(selection?.drag?.pointer===touchInkStart.pointer)selectionEnd(false);
    paint();
    const first=touchInkStart;touchInkStart=null;
    gestureDown({pointerId:first.pointer,clientX:first.x,clientY:first.y,width:0,height:0,preventDefault(){}});
    gestureDown(event);return;
   }
   if(event.pointerType==='touch'&&(profiles.penOnly||tool==='pan')){
    if(active||selection?.drag)return;
    if(!el.querySelector('section[data-ink-settings]').hidden){settingsOpen(false);return;}
    gestureDown(event);return;
   }
   if(tool==='pan'||active||selection?.drag||event.isPrimary===false)return;
   if(!el.querySelector('section[data-ink-settings]').hidden){settingsOpen(false);return;}
   if(profiles.penOnly&&event.pointerType!=='pen')return;
   resetGestures();
   if(event.pointerType==='touch')touchInkStart={pointer:event.pointerId,x:event.clientX,y:event.clientY,time:Date.now()};
   try{
    current();event.preventDefault();const p=coords(event);
    if(tool==='select'){selectionDown(event,p);return;}
    if(tool==='eraser'){
     if(event.pointerType==='touch'){touchEraser={pointer:event.pointerId,point:p};try{svg.setPointerCapture?.(event.pointerId);}catch{}return;}
     const found=strokes().reverse().find(s=>Ink.hit(s,p,aspect));if(found)apply({add:[],remove:[found]});return;
    }
    const config=profiles[tool];
    const stroke={version:1,id:VZ.uid(),...binding,page:pageNo,tool,color:config.color,opacity:config.opacity,
     width:config.width,points:[p],createdAt:Date.now()};
    active={pointer:event.pointerId,stroke};try{svg.setPointerCapture?.(event.pointerId);}catch{}schedule();
   }catch(e){say(e.message,true);}
  };
  svg.onpointermove=event=>{
   try{if(selectionMove(event))return;}catch(e){selectionEnd(false);say(e.message,true);return;}
   if(!active&&gestureMove(event))return;
   if(active?.pointer!==event.pointerId)return;event.preventDefault();
   const samples=event.getCoalescedEvents?.();const events=samples?.length?samples:[event];
   for(const item of events){const p=coords(item),last=active.stroke.points.at(-1);if(Math.hypot(p[0]-last[0],p[1]-last[1])>0.0008&&active.stroke.points.length<Ink.MAX_POINTS)active.stroke.points.push(p);}
   schedule();
  };
  svg.onpointerup=svg.onpointercancel=svg.onlostpointercapture=event=>{
   if(touchInkStart?.pointer===event.pointerId)touchInkStart=null;
   if(touchEraser?.pointer===event.pointerId){const point=touchEraser.point;touchEraser=null;if(event.type==='pointerup'){try{const found=strokes().reverse().find(s=>Ink.hit(s,point,aspect));if(found)apply({add:[],remove:[found]});}catch(e){say(e.message,true);}}return;}
   if(selection?.drag?.pointer===event.pointerId){event.preventDefault();try{selectionEnd(event.type==='pointerup');}catch(e){selectionEnd(false);say(e.message,true);}return;}
   if(gestureEnd(event))return;
   if(active?.pointer!==event.pointerId)return;
   if(event.type==='pointerup'&&active.stroke.points.length<Ink.MAX_POINTS){const p=coords(event),last=active.stroke.points.at(-1);if(Math.hypot(p[0]-last[0],p[1]-last[1])>0.0008)active.stroke.points.push(p);}
   finishStroke();
  };
 }});
 if(window.ResizeObserver){resizeObserver=new ResizeObserver(()=>{if(ready&&!busy&&Math.abs(Math.max(240,stage.clientWidth-16)-baseWidth)>1){clearTimeout(resizeTimer);resizeTimer=setTimeout(renderPage,120);}});resizeObserver.observe(stage);}
 cleanupHook=scope?.beforeLeave(()=>{if(active||selection?.drag||pending)throw Error('악보 필기를 먼저 저장하고 계정을 바꿔 주세요.');sheet.close();})||(()=>{});
 document.addEventListener('fullscreenchange',nativeFullscreenChanged);
 window.addEventListener('vzip:auth-changed',changed);window.addEventListener('vzip:data-changed',changed);
 window.addEventListener('beforeunload',unload);document.addEventListener('visibilitychange',hidden);
 VZ.setGuard(()=>{selectionEnd();finishStroke();return pending?'필기가 아직 저장되지 않았어요. 먼저 다시 저장해 주세요.':null;});
 (async()=>{
  try{
   say('PDF를 준비하고 있어요.');
   const [url,pdf]=await Promise.all([
    deadline(window.VzipR2.url(score.r2Key),15000,'PDF 주소 확인이 오래 걸려요.'),
    deadline(library(),20000,'악보 뷰어를 불러오지 못했어요.')
   ]);current();
   el.querySelector('[data-ink-original]').href=url;el.querySelector('[data-ink-original-quick]').href=url;
   let bytesPromise;
   const fullBytes=()=>bytesPromise ||= (async()=>{
    const response=await deadline(fetch(url,{signal:controller.signal,cache:'no-store'}),20000,'PDF 다운로드가 지연되고 있어요.');
    return readPDF(response,score.size,controller.signal);
   })();
   const options={isEvalSupported:false,enableXfa:false,standardFontDataUrl:PDFJS+'standard_fonts/',cMapUrl:PDFJS+'cmaps/',cMapPacked:true};
   say('첫 페이지를 준비하고 있어요.');
   let fromRange=true;
   loadingTask=pdf.getDocument({...options,url,disableAutoFetch:true,disableStream:true,rangeChunkSize:65536});
   loadingTask.onPassword=()=>{loadingTask.destroy();say('암호가 없는 PDF로 다시 올려 주세요.',true);};
   try{doc=await deadline(loadingTask.promise,30000,'PDF 첫 페이지를 열지 못했어요.');}
   catch(rangeError){
    fromRange=false;
    current();if(closed)return;
    loadingTask?.destroy()?.catch?.(()=>{});
    say('PDF 전체를 확인하고 있어요.');
    const bytes=await fullBytes();current();
    loadingTask=pdf.getDocument({...options,data:bytes});
    doc=await deadline(loadingTask.promise,30000,'PDF 페이지를 열지 못했어요.');
   }
   current();if(closed)return;
   if(doc.numPages>2000)throw Error('2000쪽 이하 PDF를 사용해 주세요.');
   await renderPage();current();if(closed)return;
   if(box.hidden)throw Error('악보 첫 페이지를 표시하지 못했어요.');
   // PDF content identity must be verified before annotations can be drawn or edited.
   // The first page is readable while the complete original is being hashed.
   const bytes=await fullBytes();current();if(closed)return;
   const pdfHash=await hash(bytes);current();if(closed)return;
   if(fromRange){
    const fullTask=pdf.getDocument({...options,data:bytes});
    const fullDoc=await deadline(fullTask.promise,30000,'필기 준비가 지연되고 있어요.');current();if(closed){fullTask.destroy()?.catch?.(()=>{});return;}
    const rangeTask=loadingTask;doc=fullDoc;loadingTask=fullTask;rangeTask.destroy()?.catch?.(()=>{});
   }
   binding={ownerId:owner,songId,scoreId,r2Key:score.r2Key,pdfHash};
   ready=true;svg.style.pointerEvents='';svg.dataset.tool=tool;
   el.querySelector('[data-ink-prev]').disabled=pageNo<=1;el.querySelector('[data-ink-next]').disabled=pageNo>=doc.numPages;
   paint();
   const old=(VZ.db.scoreAnnotations||[]).some(s=>s.ownerId===owner&&s.scoreId===scoreId&&s.r2Key===score.r2Key&&s.pdfHash!==pdfHash);
   say(old?'PDF 내용이 바뀌어 이전 버전 필기는 겹쳐 표시하지 않아요. 이전 필기 기록은 유지돼요.':'필기 준비됨 · 한 획씩 이 기기에 자동 저장');
  }catch(e){if(!closed&&e.name!=='AbortError'){say('악보를 열지 못했어요: '+e.message+' · 원본 PDF 열기를 눌러 확인해 주세요.',true);el.querySelector('[data-ink-original-quick]').hidden=!el.querySelector('[data-ink-original-quick]').hasAttribute('href');}}
 })();
 return sheet;
};
})();
