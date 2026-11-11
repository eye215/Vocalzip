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
// Opening the score list is a good time to warm the viewer without fetching private PDF bytes.
VZ.preloadScoreInk=()=>{library().catch(()=>{});};
async function readPDF(response,size,signal,onProgress){
 if(!response.ok)throw Error('악보를 불러오지 못했어요 ('+response.status+').');
 if(!Number.isSafeInteger(size)||size<=0||size>MAX)throw Error('50MB 이하 PDF를 사용해 주세요.');
 if(!response.body?.getReader)throw Error('이 브라우저에서 PDF 다운로드를 시작하지 못했어요.');
 const out=new Uint8Array(size),reader=response.body.getReader();let offset=0;
 try{for(;;){if(signal.aborted)throw new DOMException('닫힘','AbortError');const chunk=await deadline(reader.read(),20000,'PDF 다운로드가 멈췄어요.');if(chunk.done)break;if(offset+chunk.value.length>size)throw Error('PDF 원본 크기가 바뀌었어요. 악보를 다시 열어 주세요.');out.set(chunk.value,offset);offset+=chunk.value.length;onProgress?.(offset/size);}}
 finally{await reader.cancel().catch(()=>{});}
 if(offset!==size||!new TextDecoder().decode(out.subarray(0,1024)).includes('%PDF-'))throw Error('PDF 원본을 확인하지 못했어요.');
 return out;
}
function deadline(promise,ms,message){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),ms);})]).finally(()=>clearTimeout(timer));}
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
/* Opened PDFs are kept on this device (Cache Storage, per account + R2 key + size + upload time) with their verified
 * SHA-256, so reopening a score skips the download and the hash. A replaced PDF has a new key/time and is fetched
 * again; deleting a score drops its copy. Only the last 12 scores are kept. */
const PDF_CACHE='vzip-score-pdf-v1',PDF_KEEP=12;
const pdfKey=(owner,score)=>'https://vzip-score.invalid/'+encodeURIComponent(owner)+'/'+encodeURIComponent(score.r2Key)+'?size='+score.size+'&v='+encodeURIComponent(score.updatedAt||score.uploadedAt||'');
const pdfCache={
 async get(owner,score){
  if(!window.caches)return null;
  const response=await (await caches.open(PDF_CACHE)).match(pdfKey(owner,score));if(!response)return null;
  const digest=response.headers.get('x-vzip-pdf-hash')||'',bytes=new Uint8Array(await response.arrayBuffer());
  if(!/^[0-9a-f]{64}$/.test(digest)||bytes.length!==score.size||!new TextDecoder().decode(bytes.subarray(0,1024)).includes('%PDF-'))return null;
  return {bytes,hash:digest,etag:response.headers.get('x-vzip-pdf-etag')||''};
 },
 /** The device copy is used only while the stored original is still the same (size and ETag, one 1-byte request).
  * Offline, the device copy is used as is. */
 async fresh(owner,score){
  const kept=await this.get(owner,score);if(!kept)return null;
  let now;try{now=await deadline(window.VzipR2.stat(score.r2Key),5000,'확인 지연');}catch{return kept;}
  if(!now||now.size!==score.size||(now.etag||kept.etag)&&now.etag!==kept.etag){await this.drop(score.r2Key);return null;}
  return kept;
 },
 async put(owner,score,bytes,digest){
  if(!window.caches)return;
  const cache=await caches.open(PDF_CACHE),key=pdfKey(owner,score);
  // The ETag is read after the hash, so a copy is only ever labelled with the original it was verified against.
  const etag=(await window.VzipR2.stat(score.r2Key).catch(()=>null))?.etag||'';
  await cache.delete(key);await cache.put(key,new Response(bytes,{headers:{'content-type':'application/pdf','x-vzip-pdf-hash':digest,'x-vzip-pdf-etag':etag}}));
  const keys=await cache.keys();for(const old of keys.slice(0,Math.max(0,keys.length-PDF_KEEP)))await cache.delete(old);
 },
 async drop(r2Key){
  if(!window.caches)return;
  const cache=await caches.open(PDF_CACHE),part='/'+encodeURIComponent(r2Key)+'?';
  for(const key of await cache.keys())if(key.url.includes(part))await cache.delete(key);
 }
};
VZ.deleteScoreWithInk=(songId,score)=>{
 const owner=window.vzipCloudUserId?.(),scope=window.VzipAccountScope;
 const identity=()=>window.vzipCloudSignedIn?.()&&!scope?.leaving&&(!scope||scope.owner===owner)?{owner:window.vzipCloudUserId?.(),session:window.vzipCloudSessionId?.()||'legacy'}:null;
 const store=Ink.create({storage:scope?.storage||localStorage,identity,getData:()=>VZ.db,change:fn=>VZ.change(fn,{silent:true})});
 pdfCache.drop(score.r2Key).catch(()=>{});
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
 const controller=new AbortController();let audioBar=null,doc,loadingTask,renderTask,prepared=null,prepareTask=null,prepareTimer=0,closed=false,binding,ready=false,viewReady=false,busy=false,pageNo=1,zoom=1,aspect=1.414,baseWidth=0;
 let thumbBatch=0,thumbObserver=null,thumbGeneration=0,thumbTasks=new Set(),selection=null,selectionFrame=0,exportUrl=null,exportStamp='',exportBusy=false,lastSaveMessage='',tool=profiles.penOnly?'pen':'pan',paintTool='pen',settingsTab='pen',full=false,performance=false,performanceOriginFull=false,performanceTimer=0,hadNative=false,fullGeneration=0,touchPan=null,pageSwipe=null,twoSwipe=null,touchSwipe=null,touchInkStart=null,touchEraser=null,touches=new Map(),pinch=null,pinchDirty=false,markerType='breath',markerStart=null,markerDrag=null,active=null,pending=null,undo=[],redo=[],frame=0,renderNumber=0,cleanupHook=()=>{},resizeObserver,resizeTimer,sheet,el,svg,canvas,box,stage,status,done,visionDrag=null,scoreRect=null,visionBusy=false,visionController=null,visionAvailable=false,notes=[],notesHistory=[];
 const viewKey='vzip_score_view_v1:'+owner+':'+scoreId;
 const viewStorage=scope?.storage||localStorage;
 const notesKey='vzip_score_text_v1:'+owner+':'+scoreId;
 let savedView=null;
 try{
  const value=JSON.parse(viewStorage.getItem(viewKey)||'null');
  if(value?.r2Key===score.r2Key&&value.size===score.size&&Number.isInteger(value.page)&&value.page>=1&&value.page<=2000&&Number.isFinite(value.zoom)&&value.zoom>=.75&&value.zoom<=4){
   savedView=value;pageNo=value.page;zoom=value.zoom;
  }
 }catch{}
 function rememberView(){
  if(!binding||!ready)return;
  try{viewStorage.setItem(viewKey,JSON.stringify({r2Key:score.r2Key,size:score.size,pdfHash:binding.pdfHash,page:pageNo,zoom}));}catch{}
 }
 const button=(name,icon,label)=>'<button type="button" class="icon-btn" data-ink-'+name+' aria-label="'+label+'" title="'+label+'"><i class="ph ph-'+icon+'"></i></button>';
 const tools=['pan','pen','highlighter','eraser','select'];
 const names=['이동','펜','형광펜','지우개','선택'],icons=['hand','pen','highlighter','eraser','selection'];
 const body='<div class="score-ink-editor"><div class="score-ink-header"><p class="score-ink-title">'+VZ.esc(score.title||score.fileName||'PDF 악보')+'</p><button type="button" data-ink-other-scores>다른 악보</button></div><div class="score-ink-score-picker" data-ink-score-picker hidden></div>'+
  '<div class="score-ink-save-state" data-ink-save-state role="status">PDF 준비 중</div>'+ 
  '<div class="score-ink-bar"><div class="score-ink-tools" role="toolbar" aria-label="필기 도구">'+tools.map((t,i)=>'<button type="button" data-ink-tool="'+t+'" aria-label="'+names[i]+'" title="'+names[i]+'" aria-pressed="'+(t===tool)+'"><i class="ph ph-'+icons[i]+'"></i><span>'+names[i]+'</span></button>').join('')+button('marker-mode','bookmark-simple','악보 표시')+
  '</div>'+
  '<div class="score-ink-actions">'+button('undo','arrow-counter-clockwise','필기 되돌리기')+button('redo','arrow-clockwise','필기 다시 실행')+button('clear','trash','현재 페이지 필기 삭제')+button('settings','sliders-horizontal','색상·굵기·투명도 설정')+button('performance','eye','무대용 보기')+button('fullscreen','arrows-out','전체화면')+'</div>'+
  '<div class="score-ink-quick" data-ink-quick hidden><div class="score-ink-quick-row" data-ink-quick-color-row><span>색상</span><div class="score-ink-quick-options" data-ink-quick-colors></div></div><div class="score-ink-quick-row"><span data-ink-quick-size-label>굵기</span><div class="score-ink-quick-options" data-ink-quick-sizes></div></div></div>'+
  '<div class="score-ink-full-actions" data-ink-full-actions hidden><button type="button" data-ink-more aria-label="더보기" aria-expanded="false"><i class="ph ph-dots-three"></i><span>더보기</span></button></div>'+
  '<div class="score-ink-marker-palette" data-ink-marker-palette hidden><button type="button" data-ink-marker="breath">숨표</button><button type="button" data-ink-marker="repeat">반복</button><button type="button" data-ink-marker="cut">컷</button><button type="button" data-ink-marker="start">시작점</button></div>'+
  '<div class="score-ink-vision-tools" data-ink-vision-tools hidden><button type="button" data-ink-notation aria-pressed="false">악보 표기 AI 분석</button><button type="button" data-ink-note-undo hidden>메모 되돌리기</button><span>요청할 때만 선택 영역을 AI로 설명해요.</span></div><div class="score-ink-explain-action" data-ink-explain-action hidden><button type="button" data-ink-explain-selection>선택 영역 설명 보기</button></div>'+ 
  '<section class="score-ink-settings" data-ink-settings aria-label="필기 설정" hidden><div class="score-ink-settings-head"><strong data-ink-profile-label>펜 설정</strong>'+button('settings-close','x','필기 설정 닫기')+'</div>'+
  '<div class="score-ink-settings-tabs" role="tablist" aria-label="도구 상세 설정"><button type="button" data-ink-settings-tab="pen" role="tab">펜</button><button type="button" data-ink-settings-tab="highlighter" role="tab">형광펜</button><button type="button" data-ink-settings-tab="eraser" role="tab">지우개</button><button type="button" data-ink-settings-tab="general" role="tab">기타</button></div><div class="score-ink-settings-content" data-ink-draw-settings>'+
  '<div class="score-ink-palette-section"><span>기본 색상</span><div data-ink-palette class="score-ink-swatches" role="group" aria-label="기본 색상"></div></div>'+
  '<div class="score-ink-palette-section"><span>최근 사용</span><div data-ink-recent class="score-ink-swatches" role="group" aria-label="최근 사용 색상"></div></div>'+
  '<div class="score-ink-palette-section"><span>사용자 색상</span><div data-ink-custom class="score-ink-swatches" role="group" aria-label="사용자 색상"></div></div>'+
  '<div class="score-ink-custom-add"><input type="color" data-ink-picker aria-label="사용자 색상 선택" value="#101828"><input type="text" data-ink-hex aria-label="사용자 색상 코드" maxlength="7" placeholder="#RRGGBB" value="#101828" autocapitalize="none" spellcheck="false"><button type="button" data-ink-custom-add>추가</button></div>'+
  '<button type="button" class="score-ink-custom-remove" data-ink-custom-remove>선택한 사용자 색상 삭제</button>'+
  '<label class="score-ink-slider">굵기 <output data-ink-width-label>4</output><input type="range" data-ink-width aria-label="펜 굵기" min="1" max="60" step="1" value="4"></label>'+
  '<label class="score-ink-slider">투명도 <output data-ink-opacity-label>0%</output><input type="range" data-ink-opacity aria-label="필기 투명도" min="0" max="95" step="1" value="0"></label></div>'+
  '<div class="score-ink-settings-content" data-ink-eraser-settings hidden><label class="score-ink-slider">지우개 크기 <output data-ink-eraser-size-label>18</output><input type="range" data-ink-eraser-size aria-label="지우개 크기" min="8" max="60" step="1" value="18"></label></div>'+
  '<div class="score-ink-settings-content" data-ink-general-settings hidden><label class="score-ink-pen-only"><input type="checkbox" aria-label="펜만" data-ink-pen-only>펜만 필기 · 손가락은 스크롤</label>'+
  '<a data-ink-original target="_blank" rel="noopener">원본 PDF 열기</a><button type="button" data-ink-export>필기 PDF 만들기</button><a data-ink-export-save hidden>만든 PDF 저장</a></div></section></div>'+
  '<div class="score-ink-pages">'+button('first','skip-back','첫 악보 페이지')+button('prev','caret-left','이전 악보 페이지')+'<button type="button" class="score-ink-page-jump" data-ink-page aria-label="페이지 미리보기와 바로 이동" aria-expanded="false">불러오는 중</button>'+button('next','caret-right','다음 악보 페이지')+button('last','skip-forward','마지막 악보 페이지')+
  '<select data-ink-zoom aria-label="악보 확대"><option value="1">화면 맞춤</option><option value="1.5">150%</option><option value="2">200%</option></select></div>'+
  '<section class="score-ink-thumbnails" data-ink-thumbnails aria-label="악보 페이지 미리보기" hidden><div class="score-ink-thumbnails-head"><strong>페이지 이동</strong>'+button('thumb-close','x','페이지 미리보기 닫기')+'</div><form data-ink-jump-form><label>페이지 번호 <input type="number" data-ink-jump-input min="1" inputmode="numeric" aria-label="이동할 페이지 번호"></label><button type="submit">이동</button></form><div class="score-ink-thumb-grid" data-ink-thumb-grid></div><div class="score-ink-thumb-nav">'+button('thumb-prev','caret-left','앞 페이지 목록')+'<span data-ink-thumb-range></span>'+button('thumb-next','caret-right','다음 페이지 목록')+'</div></section>'+
  '<div class="score-ink-selection-bar" data-ink-selection-bar role="group" aria-label="선택한 필기" hidden><span data-ink-selection-count></span><button type="button" data-ink-recognize hidden>텍스트로 변환</button>'+button('selection-smaller','minus','선택 필기 축소')+button('selection-larger','plus','선택 필기 확대')+button('selection-delete','trash','선택 필기 삭제')+button('selection-clear','x','필기 선택 해제')+'</div>'+
  '<p class="score-ink-status" data-ink-status role="status" aria-live="polite">PDF를 준비하고 있어요.</p><a class="score-ink-original-quick" data-ink-original-quick target="_blank" rel="noopener" hidden>원본 PDF 열기</a>'+
  '<div class="score-ink-stage" data-ink-stage tabindex="0" aria-label="악보 페이지"><div class="score-ink-page" data-ink-box hidden><canvas data-ink-pdf aria-label="PDF 악보"></canvas><svg xmlns="http://www.w3.org/2000/svg" data-ink-svg role="img" aria-label="개인 필기 영역"></svg><div class="score-ink-text-layer" data-ink-text-layer></div><div class="score-ink-vision-rect" data-ink-vision-rect hidden></div></div></div>'+ 
  '<section class="score-ink-vision-result" data-ink-vision-result aria-label="인식 결과" hidden><strong data-ink-vision-heading></strong><p data-ink-vision-explanation></p><button type="button" class="score-ink-vision-more" data-ink-vision-more aria-expanded="false" hidden>더보기</button><label data-ink-vision-text-label hidden>변환된 글자 확인·수정<textarea data-ink-vision-text rows="3" maxlength="1200"></textarea></label><p class="score-ink-vision-disclosure">선택 영역만 OpenAI API로 전송해 인식해요. 결과는 틀릴 수 있으니 확인해 주세요.</p><div class="score-ink-vision-buttons"><button type="button" data-ink-vision-save hidden>텍스트 메모 저장</button><button type="button" data-ink-vision-replace hidden>저장 후 원래 필기 대체</button><button type="button" data-ink-vision-delete hidden>메모 삭제</button><button type="button" data-ink-vision-cancel>닫기</button></div></section>'+ 
  '<div class="score-ink-performance-controls" data-ink-performance-controls hidden>'+button('performance-prev','caret-left','이전 페이지')+'<span data-ink-performance-page></span>'+button('performance-next','caret-right','다음 페이지')+'<button type="button" data-ink-performance-exit>편집으로 돌아가기</button></div>'+
  '<p class="score-ink-help">손가락 두 개로 좌우 스와이프해 페이지를 넘겨요. ‘펜만 필기’가 켜져 있으면 한 손가락도 사용할 수 있어요.</p></div>';
 function say(text,error=false){if(!closed){status.textContent=text;status.dataset.error=error?'true':'false';done.textContent=pending?'다시 저장':'완료';el.toggleAttribute('data-ink-save-error',!!pending);}}
 function saveState(text,kind){if(!closed&&el){const badge=el.querySelector('[data-ink-save-state]');badge.textContent=text;badge.dataset.kind=kind||'neutral';}}
 function settingsOpen(open){
  const panel=el.querySelector('section[data-ink-settings]');panel.hidden=!open;panel.inert=!open;
  if(open)setSettingsTab(['pen','highlighter','eraser'].includes(tool)?tool:settingsTab);
  el.querySelector('.score-ink-actions [data-ink-settings]').setAttribute('aria-expanded',String(open));
 }
 function setSettingsTab(tab){
  settingsTab=tab;
  if(tab==='pen'||tab==='highlighter')paintTool=tab;
  el.querySelector('[data-ink-profile-label]').textContent=({pen:'펜 설정',highlighter:'형광펜 설정',eraser:'지우개 설정',general:'기타 설정'})[tab];
  el.querySelector('[data-ink-draw-settings]').hidden=!['pen','highlighter'].includes(tab);
  el.querySelector('[data-ink-eraser-settings]').hidden=tab!=='eraser';
  el.querySelector('[data-ink-general-settings]').hidden=tab!=='general';
  el.querySelectorAll('[data-ink-settings-tab]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.inkSettingsTab===tab)));
  syncSettings();
 }
 function syncQuick(){
  const quick=el.querySelector('[data-ink-quick]'),drawing=tool==='pen'||tool==='highlighter',erasing=tool==='eraser';
  quick.hidden=!(drawing||erasing);
  if(quick.hidden)return;
  el.querySelector('[data-ink-quick-color-row]').hidden=!drawing;
  const colors=el.querySelector('[data-ink-quick-colors]');colors.replaceChildren();
  if(drawing)for(const [color,label] of Settings.PALETTES[tool]){
   const b=document.createElement('button');b.type='button';b.className='score-ink-quick-color';b.style.setProperty('--sample-color',color);
   b.setAttribute('aria-label',label+' '+color);b.title=label;b.setAttribute('aria-pressed',String(profiles[tool].color===color));
   b.onclick=()=>{paintTool=tool;updateSettings({color},{recent:true});};colors.append(b);
  }
  const sizes=erasing?[8,12,18,26,40,60]:tool==='pen'?[1,2,4,6,10,16]:[8,16,24,32,44,60];
  el.querySelector('[data-ink-quick-size-label]').textContent=erasing?'크기':'굵기';
  const host=el.querySelector('[data-ink-quick-sizes]');host.replaceChildren();
  for(const size of sizes){
   const b=document.createElement('button');b.type='button';b.className='score-ink-quick-size';
   b.setAttribute('aria-label',(erasing?'지우개 크기 ':'굵기 ')+size);b.title=String(size);
   b.setAttribute('aria-pressed',String(Math.round((erasing?profiles.eraser.size:profiles[tool].width)*1000)===size));
   const dot=document.createElement('span');dot.style.width=dot.style.height=Math.max(3,Math.min(22,erasing?size*.38:size*.7))+'px';b.append(dot);
   b.onclick=()=>{if(erasing)updateEraser(size/1000);else{paintTool=tool;updateSettings({width:size/1000});}};host.append(b);
  }
 }
 function syncSettings(){
  const p=profiles[paintTool];
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
  el.querySelector('[data-ink-eraser-size]').value=String(Math.round(profiles.eraser.size*1000));el.querySelector('[data-ink-eraser-size-label]').textContent=String(Math.round(profiles.eraser.size*1000));
  el.querySelector('[data-ink-opacity]').value=String(Math.round((1-p.opacity)*100));el.querySelector('[data-ink-opacity-label]').textContent=Math.round((1-p.opacity)*100)+'%';
  el.querySelector('[data-ink-pen-only]').checked=profiles.penOnly;if(svg)svg.dataset.penOnly=String(profiles.penOnly);
  el.querySelector('[data-ink-picker]').value=p.color;el.querySelector('[data-ink-hex]').value=p.color;
  el.querySelector('[data-ink-custom-add]').disabled=false;el.querySelector('[data-ink-custom-remove]').disabled=!p.custom.includes(p.color);
  el.style.setProperty('--ink-active-color',p.color);
  syncQuick();
 }
 function updateEraser(size){
  finishStroke();
  try{current();profiles=prefs.write('eraser',{size});syncSettings();}
  catch(e){syncSettings();say('지우개 크기를 저장하지 못했어요: '+e.message,true);}
 }
 function updateSettings(patch,options={}){
  finishStroke();
  try{current();profiles=prefs.write(paintTool,patch,options);syncSettings();}
  catch(e){if(patch.width!==undefined||patch.opacity!==undefined)syncSettings();say('도구 설정을 저장하지 못했어요: '+e.message,true);}
 }
 function setMoreOpen(open){
  el.dataset.inkMoreOpen=String(!!open);
  el.querySelector('[data-ink-more]').setAttribute('aria-expanded',String(!!open));
 }
 /* Compact viewer (both normal and fullscreen): one tool row whose right end is 더보기 (undo/redo/clear/settings/
  * stage view/fullscreen), the song title on top with 다른 악보 as an icon, and the page row fixed at the bottom. */
 function compactLayout(){
  el.classList.add('score-ink-compact');
  const bar=el.querySelector('.score-ink-bar'),actions=el.querySelector('.score-ink-actions'),
   fullActions=el.querySelector('[data-ink-full-actions]'),notation=el.querySelector('[data-ink-notation]'),noteUndo=el.querySelector('[data-ink-note-undo]');
  notation.hidden=!visionAvailable; // shown once the owner-only AI check answers (syncVisionTools)
  bar.append(fullActions);fullActions.insertBefore(notation,el.querySelector('[data-ink-more]'));
  fullActions.append(actions);actions.append(noteUndo);fullActions.hidden=false;
  const head=el.querySelector('.sheet-head'),other=el.querySelector('[data-ink-other-scores]');
  if(head&&other){other.innerHTML='<i class="ph ph-files" aria-hidden="true"></i>';other.setAttribute('aria-label','다른 악보');other.title='다른 악보';other.classList.add('icon-btn');head.querySelector(':scope>span[aria-hidden]')?.replaceWith(other);}
  el.querySelector('.score-ink-editor').append(el.querySelector('.score-ink-pages'));
 }
 function fullLayout(next){
  resetGestures();full=next;el.classList.toggle('score-ink-fullscreen',full);setMoreOpen(false);
  const button=el.querySelector('[data-ink-fullscreen]');
  button.setAttribute('aria-label',full?'전체화면 종료':'전체화면');button.title=full?'전체화면 종료':'전체화면';
  button.querySelector('i').className='ph ph-'+(full?'arrows-in':'arrows-out');
  button.querySelector('.score-ink-menu-label').textContent=full?'전체화면 종료':'전체화면';
 }
 async function fullscreen(next){
  finishStroke();const generation=++fullGeneration;fullLayout(next);
  try{
   if(next&&document.fullscreenEnabled&&el.requestFullscreen&&!document.fullscreenElement)await el.requestFullscreen();
   else if(!next&&document.fullscreenElement===el)await document.exitFullscreen();
  }catch{} // iOS/PWA keep the same viewport-filling layout when native fullscreen is unavailable.
  if(!closed&&generation===fullGeneration)requestAnimationFrame(renderPage);
 }
 function showPerformanceControls(){
  if(!performance||closed)return;
  const controls=el.querySelector('[data-ink-performance-controls]');controls.hidden=false;
  controls.querySelector('[data-ink-performance-page]').textContent=pageNo+' / '+(doc?.numPages||'?')+'쪽';
  controls.querySelector('[data-ink-performance-prev]').disabled=!viewReady||pageNo<=1;
  controls.querySelector('[data-ink-performance-next]').disabled=!viewReady||pageNo>=doc?.numPages;
  clearTimeout(performanceTimer);performanceTimer=setTimeout(()=>{if(!closed&&performance)controls.hidden=true;},4500);
 }
 function performanceMode(next){
  // Stage view only reads the score: it works as soon as a page is on screen, before the ink check finishes.
  if(next&&!viewReady){say('악보 첫 페이지가 보인 뒤에 무대용 보기를 쓸 수 있어요.',true);return;}
  if(next===performance)return;
  finishStroke();markerStart=null;markerDrag=null;if(next&&pending){saveState('저장 실패 · 다시 시도','error');say('필기를 먼저 다시 저장해 주세요.',true);return;}
  if(next){performanceOriginFull=full;if(!full)fullLayout(true);}
  performance=next;el.classList.toggle('score-ink-performance',next);
  svg.style.pointerEvents=next?'none':ready?'':'none';
  el.querySelector('[data-ink-performance-controls]').hidden=!next;
  clearTimeout(performanceTimer);
  if(next)showPerformanceControls();else if(!performanceOriginFull)fullLayout(false);
  requestAnimationFrame(()=>{if(!closed)renderPage({keepScroll:true});});
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
  try{(ready?svg:stage).setPointerCapture(event.pointerId);}catch{}
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
   if(pair?.canceled&&touchSwipe)touchSwipe.needsRedraw=redraw;
   let direction=0;
   if(pair&&!pair.canceled&&Date.now()-pair.time<1200){
    const ids=[...pair.starts.keys()],[a,b]=ids.map(id=>pair.starts.get(id)),[c,d]=ids.map(id=>pair.ends.get(id));
    const dx1=c.x-a.x,dx2=d.x-b.x,dy1=c.y-a.y,dy2=d.y-b.y;
    const startDistance=Math.hypot(a.x-b.x,a.y-b.y),endDistance=Math.hypot(c.x-d.x,c.y-d.y);
    if(dx1*dx2>0&&Math.min(Math.abs(dx1),Math.abs(dx2))>56&&Math.max(Math.abs(dy1),Math.abs(dy2))<Math.min(Math.abs(dx1),Math.abs(dx2))*.7&&Math.abs(dx1-dx2)<55&&Math.abs(endDistance-startDistance)<Math.max(25,startDistance*.18))direction=dx1<0?1:-1;
   }else if((profiles.penOnly||performance)&&event.type==='pointerup'&&swipe?.pointer===event.pointerId&&Date.now()-swipe.time<900){
    const dx=event.clientX-swipe.x,dy=event.clientY-swipe.y;
    if(Math.abs(dx)>56&&Math.abs(dx)>Math.abs(dy)*1.4)direction=dx<0?1:-1;
   }
   const edge=direction===1?(pair||swipe)?.atRight:(pair||swipe)?.atLeft;
   const canTurn=!!pair||stage.scrollWidth-stage.clientWidth<=8||edge;
   const turn=direction&&canTurn&&viewReady&&!busy&&!pending&&pageNo+direction>=1&&pageNo+direction<=doc?.numPages;
   if(pair&&turn){zoom=pair.zoom;zoomValue();}
   resetGestures();
   if(turn){pageNo+=direction;renderPage();}
   else if(redraw&&!(pair?.canceled&&touchSwipe))renderPage({keepScroll:true});
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
   const distance=Math.hypot((b[0]-a[0])*r.width,(b[1]-a[1])*r.height);
   const matches=distance<6?rows.slice().reverse().filter(s=>Ink.hit(s,b,aspect)).slice(0,1):
    Ink.inRect(rows,{x:a[0],y:a[1],w:b[0]-a[0],h:b[1]-a[1]},aspect);
   selected(matches);
   if(distance>=6){
    scoreRect={x:a[0],y:a[1],w:b[0]-a[0],h:b[1]-a[1]};
    const rect=el.querySelector('[data-ink-vision-rect]');rect.hidden=false;
    rect.style.left=Math.min(a[0],b[0])*100+'%';rect.style.top=Math.min(a[1],b[1])*100+'%';
    rect.style.width=Math.abs(a[0]-b[0])*100+'%';rect.style.height=Math.abs(a[1]-b[1])*100+'%';
    el.querySelector('[data-ink-explain-action]').hidden=false;
    say(matches.length?matches.length+'개 필기 선택됨 · 필요하면 선택 영역 설명 보기':'필기 선택 없음 · 표기 설명이 필요하면 선택 영역 설명 보기');
   }
   return;
  }
  if(commit&&preview)commitSelection(preview);else paint();
 }
 function selectionDown(event,p){
  clearScoreRect();
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
  el.querySelector('[data-ink-recognize]').hidden=!visionAvailable||!rows.length;
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
 function readNotes(){
  try{const saved=JSON.parse(viewStorage.getItem(notesKey)||'null');notes=saved?.pdfHash===binding?.pdfHash&&saved?.r2Key===score.r2Key&&Array.isArray(saved.notes)?saved.notes.filter(n=>n&&n.page>=1&&n.page<=2000&&typeof n.text==='string'&&n.text.length<=1200&&n.x>=0&&n.x<=1&&n.y>=0&&n.y<=1).slice(0,300):[];}catch{notes=[];}
 }
 function saveNotes(next){
  current();if(!binding||!ready)throw Error('악보를 확인한 뒤 저장해 주세요.');
  viewStorage.setItem(notesKey,JSON.stringify({pdfHash:binding.pdfHash,r2Key:score.r2Key,notes:next}));notesHistory.push(notes);if(notesHistory.length>30)notesHistory.shift();notes=next;syncVisionTools();paintNotes();saveState('이 기기에 저장됨','local');say('텍스트 메모를 이 기기에 저장했어요.');
 }
 function syncVisionTools(){
  const host=el.querySelector('[data-ink-vision-tools]');
  host.hidden=!visionAvailable&&!notesHistory.length;
  el.querySelector('[data-ink-notation]').hidden=!visionAvailable;
  el.querySelector('[data-ink-note-undo]').hidden=!notesHistory.length;
  host.querySelector('span').hidden=!visionAvailable;
 }
 function paintNotes(){
  const host=el?.querySelector('[data-ink-text-layer]');if(!host)return;host.replaceChildren();
  for(const note of notes.filter(n=>n.page===pageNo)){
   const b=document.createElement('button');b.type='button';b.className='score-ink-text-note';b.style.left=(note.x*100)+'%';b.style.top=(note.y*100)+'%';b.textContent=note.text;b.title='텍스트 메모 수정';
   b.onclick=()=>{if(performance)return;showVisionResult({mode:'edit',id:note.id,page:note.page,rect:{x:note.x,y:note.y},text:note.text});};host.append(b);
  }
 }
 function visionPanel(open){const panel=el.querySelector('[data-ink-vision-result]');panel.hidden=!open;if(open)panel.scrollIntoView({block:'nearest',behavior:'smooth'});}
 function showVisionResult(result){
  const panel=el.querySelector('[data-ink-vision-result]');panel.dataset.mode=result.mode;panel.dataset.noteId=result.id||'';panel._result=result;
  const isText=result.mode==='handwriting'||result.mode==='edit';
  const label=String(result.label||'');
  el.querySelector('[data-ink-vision-heading]').textContent=result.mode==='notation'?(/[A-Za-z]/.test(label)&&!/[가-힣]/.test(label)?'악보 표기 설명':label||'악보 표기 설명'):'손글씨 → 텍스트 메모';
  const tempo=result.mode==='notation'&&String(result.label||'').match(/[♩♪]\s*=\s*(\d{2,3})/);
  const explanation=result.mode==='notation'&&!/[가-힣]/.test(String(result.explanation||''))
   ?(tempo?'4분음표를 1박으로 하여 1분에 '+tempo[1]+'박의 빠르기로 노래하세요. 일정한 박을 유지해 보세요.':'한국어 설명을 받지 못했어요. 영역을 다시 선택해 분석해 주세요.')
   :result.explanation;
  el.querySelector('[data-ink-vision-explanation]').textContent=result.mode==='notation'?(explanation||'표기를 구별하기 어려워요.'):(result.confidence==='low'?'인식이 불확실해요. 글자를 직접 확인하고 수정해 주세요.':'원래 필기는 그대로 남아요. 결과를 확인하고 수정해 주세요.');
  const more=el.querySelector('[data-ink-vision-more]'),description=el.querySelector('[data-ink-vision-explanation]');panel.dataset.expanded='false';more.hidden=true;more.textContent='더보기';more.setAttribute('aria-expanded','false');
  if(result.mode==='notation')requestAnimationFrame(()=>{if(panel.hidden||panel._result!==result)return;more.hidden=description.scrollHeight<=description.clientHeight+2;});
  el.querySelector('[data-ink-vision-text-label]').hidden=!isText;el.querySelector('[data-ink-vision-text]').value=result.text||'';
  el.querySelector('[data-ink-vision-save]').hidden=!isText;el.querySelector('[data-ink-vision-replace]').hidden=result.mode!=='handwriting';el.querySelector('[data-ink-vision-delete]').hidden=result.mode!=='edit';
  el.querySelector('.score-ink-vision-disclosure').textContent=result.mode==='notation'?'선택한 악보 영역만 NVIDIA AI로 보내 설명해요. 결과는 직접 확인해 주세요.':'선택한 필기만 OpenAI API로 보내 인식해요. 결과는 직접 확인해 주세요.';
  el.querySelector('[data-ink-vision-cancel]').textContent='닫기';visionPanel(true);
 }
 function cropNotation(rect){
  const x=Math.max(0,Math.min(rect.x,rect.x+rect.w)),y=Math.max(0,Math.min(rect.y,rect.y+rect.h));
  const w=Math.min(1-x,Math.abs(rect.w)),h=Math.min(1-y,Math.abs(rect.h));
  if(w<.018||h<.012)throw Error('표기를 조금 더 넓게 둘러 선택해 주세요.');
  const src={x:Math.floor(x*canvas.width),y:Math.floor(y*canvas.height),w:Math.max(1,Math.floor(w*canvas.width)),h:Math.max(1,Math.floor(h*canvas.height))};
  const scale=Math.min(3,1024/Math.max(src.w,src.h)),out=document.createElement('canvas');out.width=Math.max(1,Math.floor(src.w*scale));out.height=Math.max(1,Math.floor(src.h*scale));
  out.getContext('2d').drawImage(canvas,src.x,src.y,src.w,src.h,0,0,out.width,out.height);return out.toDataURL('image/jpeg',.86);
 }
 function cropHandwriting(rows){
  const bounds=Ink.bounds(rows,aspect),pad=.03,x=Math.max(0,bounds.x-pad),y=Math.max(0,bounds.y-pad),w=Math.min(1-x,bounds.w+2*pad),h=Math.min(1-y,bounds.h+2*pad);
  if(w<.008||h<.008)throw Error('선택한 필기를 확인해 주세요.');
  const out=document.createElement('canvas'),scale=Math.min(1024/Math.max(w,h*aspect),1800);out.width=Math.max(64,Math.ceil(w*scale));out.height=Math.max(64,Math.ceil(h*aspect*scale));const ctx=out.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,out.width,out.height);
  ctx.save();ctx.scale(scale/1000,scale/1000);ctx.translate(-x*1000,-y*aspect*1000);
  for(const stroke of rows){ctx.strokeStyle=stroke.color;ctx.globalAlpha=Ink.opacity(stroke);ctx.lineWidth=stroke.width*1000;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke(new Path2D(Ink.path(stroke,aspect)));}ctx.restore();
  return {image:out.toDataURL('image/jpeg',.82),rect:{x,y,w,h}};
 }
 async function recognize(mode,rect,rows){
  if(visionBusy||!ready||busy||pending||performance){say('악보 준비나 저장이 끝난 뒤 다시 시도해 주세요.',true);return;}
  const bound=binding.pdfHash,atPage=pageNo,chosen=rows?.map(s=>({...s}));
  if(mode==='handwriting'&&!await VZ.confirm('선택 영역 인식','선택한 손글씨 획만 OpenAI API로 보내 인식할까요? 결과는 확인 후 저장할 수 있어요.',{ok:'인식하기'}))return;
  visionBusy=true;visionController=new AbortController();saveState('인식 중…','pending');say('선택한 영역을 인식하고 있어요.');
  try{
   current();const image=mode==='notation'?cropNotation(rect):cropHandwriting(chosen).image;
   if(image.length>600000)throw Error('선택 영역이 너무 커요. 조금 작게 선택해 주세요.');
   const result=await window.VzipR2.scoreVision(mode,image,visionController.signal);
   current();if(closed||binding.pdfHash!==bound||pageNo!==atPage)return;
   if(mode==='handwriting'&&!chosen.every(s=>store.list(binding,atPage).some(r=>r.id===s.id&&Ink.same(r,s))))throw Error('인식하는 동안 원래 필기가 바뀌었어요. 다시 선택해 주세요.');
   showVisionResult({mode,...result,page:atPage,rect:mode==='notation'?rect:cropHandwriting(chosen).rect,rows:chosen});
   say(mode==='notation'?'표기 설명을 확인해 주세요.':'변환 결과를 확인하고 수정해 주세요.');
  }catch(e){if(e.name!=='AbortError')say('인식하지 못했어요: '+e.message,true);}
  finally{visionBusy=false;visionController=null;if(!closed)saveState('이 기기에 저장됨','local');}
 }
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
  paintNotes();
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
  pending={action,kind};saveState('저장 중…','pending');
  try{
   current();
   if(!store.commit({add:action.add,remove:action.remove.map(s=>s.id)}))throw Error('필기 복구 기록은 보존했어요. 저장 공간을 확인하고 다시 저장해 주세요.');
   pending=null;invalidateExport();
   if(kind==='normal'){undo.push(action);redo=[];}else if(kind==='undo'){undo.pop();redo.push(action);}else{redo.pop();undo.push(action);}
   lastSaveMessage=navigator.onLine===false?'이 기기에 저장됨 · 온라인 연결 후 동기화':'이 기기에 저장됨 · 클라우드는 기존 동기화로 저장';saveState('이 기기에 저장됨','local');say(lastSaveMessage);
  }catch(e){saveState('저장 실패 · 다시 시도','error');say('저장하지 못했어요: '+e.message,true);}
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
 function clearScoreRect(){scoreRect=null;const rect=el?.querySelector('[data-ink-vision-rect]');if(rect)rect.hidden=true;const action=el?.querySelector('[data-ink-explain-action]');if(action)action.hidden=true;}
 function visionMove(point){
  if(!visionDrag)return;const a=visionDrag.start,rect=el.querySelector('[data-ink-vision-rect]');rect.hidden=false;
  rect.style.left=Math.min(a[0],point[0])*100+'%';rect.style.top=Math.min(a[1],point[1])*100+'%';
  rect.style.width=Math.abs(a[0]-point[0])*100+'%';rect.style.height=Math.abs(a[1]-point[1])*100+'%';
 }
 function visionEnd(point,complete){
  if(!visionDrag)return;const start=visionDrag.start;visionDrag=null;el.querySelector('[data-ink-vision-rect]').hidden=true;
  if(complete)recognize('notation',{x:start[0],y:start[1],w:point[0]-start[0],h:point[1]-start[1]});
 }
 async function renderPage({keepScroll=false}={}){
  if(!doc||closed)return;const previousScroll={left:stage.scrollLeft,top:stage.scrollTop};resetGestures();selectionEnd(false);clearScoreRect();if(selection?.page!==pageNo)clearSelection();finishStroke();busy=true;viewReady=false;ready=false;const number=++renderNumber;renderTask?.cancel();clearTimeout(prepareTimer);
  svg.dataset.tool='pan';say('악보 '+pageNo+'쪽을 불러오고 있어요.');
  try{
   current();const page=await doc.getPage(pageNo);if(closed||number!==renderNumber)return;current();
   const natural=page.getViewport({scale:1});aspect=natural.height/natural.width;
   baseWidth=Math.max(240,stage.clientWidth-16);const width=baseWidth*zoom,height=width*aspect;
   const pixelScale=Math.min(devicePixelRatio||1,2,Math.sqrt(4000000/(width*height))),viewport=page.getViewport({scale:width/natural.width*pixelScale});
   const target=document.createElement('canvas'),cache=prepared;
   if(cache?.page===pageNo&&cache.width===width&&cache.zoom===zoom&&cache.pixelScale===pixelScale&&cache.doc===doc){
    prepared=null;target.width=cache.canvas.width;target.height=cache.canvas.height;target.getContext('2d').drawImage(cache.canvas,0,0);
   }else{
    target.width=Math.max(1,Math.floor(viewport.width));target.height=Math.max(1,Math.floor(viewport.height));
    renderTask=page.render({canvasContext:target.getContext('2d'),viewport});await renderTask.promise;
   }
   if(closed||number!==renderNumber)return;current();
   box.style.width=width+'px';box.style.height=height+'px';canvas.width=target.width;canvas.height=target.height;canvas.getContext('2d').drawImage(target,0,0);
   el.querySelector('[data-ink-page]').textContent=pageNo+' / '+doc.numPages+'쪽';
   el.querySelector('[data-ink-prev]').disabled=pageNo<=1;el.querySelector('[data-ink-next]').disabled=pageNo>=doc.numPages;
   el.querySelector('[data-ink-first]').disabled=pageNo<=1;el.querySelector('[data-ink-last]').disabled=pageNo>=doc.numPages;
   box.hidden=false;viewReady=true;ready=!!binding;stage.dataset.viewOnly=String(!ready);if(ready)rememberView();svg.dataset.tool=ready?tool:'pan';svg.dataset.penOnly=String(profiles.penOnly);svg.style.pointerEvents=ready&&!performance?'':'none';if(performance)showPerformanceControls();if(keepScroll)stage.scrollTo(previousScroll.left,previousScroll.top);else stage.scrollTo(0,0);
   paint();if(!binding)say('악보를 볼 수 있어요 · 필기를 확인하고 있어요.');else if(pending)say('필기 저장이 끝나지 않았어요. 다시 저장해 주세요.',true);else say(lastSaveMessage||'필기 준비됨 · 한 획씩 이 기기에 자동 저장');
   prepareTimer=setTimeout(()=>prepareNext(pageNo+1,number),100);
  }catch(e){if(!closed&&number===renderNumber&&e.name!=='RenderingCancelledException')say('악보를 열지 못했어요: '+e.message,true);}
  finally{if(number===renderNumber){busy=false;if(!closed)paint();}}
 }
 async function prepareNext(next,number){
  if(closed||number!==renderNumber||!doc||next>doc.numPages||prepared?.page===next)return;
  let task;
  try{
   const source=doc,page=await source.getPage(next);if(closed||number!==renderNumber||source!==doc)return;
   const natural=page.getViewport({scale:1}),width=Math.max(240,stage.clientWidth-16)*zoom,height=width*natural.height/natural.width;
   const pixelScale=Math.min(devicePixelRatio||1,2,Math.sqrt(4000000/(width*height))),viewport=page.getViewport({scale:width/natural.width*pixelScale});
   const nextCanvas=document.createElement('canvas');nextCanvas.width=Math.max(1,Math.floor(viewport.width));nextCanvas.height=Math.max(1,Math.floor(viewport.height));
   task=page.render({canvasContext:nextCanvas.getContext('2d'),viewport});prepareTask=task;await task.promise;
   if(!closed&&number===renderNumber&&source===doc)prepared={page:next,width,zoom,pixelScale,doc:source,canvas:nextCanvas};
  }catch{}finally{if(prepareTask===task)prepareTask=null;}
 }
 function markPoint(x,y){return [Math.max(0,Math.min(1,x)),Math.max(0,Math.min(1,y)),.5];}
 function placeMarker(start,end){
  if(markerType==='repeat'&&!markerStart){markerStart=start;say('반복 구간의 끝을 눌러 주세요.');return;}
  let points,width=.006,opacity=1,color='#7a32f5',drawTool='pen';
  if(markerType==='breath'){
   const x=start[0],y=start[1],h=.017/aspect;
   points=[markPoint(x-.016,y-h),markPoint(x,y+h),markPoint(x+.016,y-h)];
  }else if(markerType==='start'){
   points=Array.from({length:21},(_,i)=>{const t=i/20*Math.PI*2;return markPoint(start[0]+.018*Math.cos(t),start[1]+.018/aspect*Math.sin(t));});
  }else if(markerType==='cut'){
   const distance=Math.hypot((end[0]-start[0])*box.clientWidth,(end[1]-start[1])*box.clientHeight);
   const stop=distance<8?markPoint(start[0]+.07,start[1]):end;
   points=[start,stop];width=.04;opacity=.25;drawTool='highlighter';
  }else{
   const first=markerStart;markerStart=null;
   const h=.023/aspect;
   points=[markPoint(first[0],first[1]-h),markPoint(first[0],first[1]+h),markPoint(end[0],end[1]+h),markPoint(end[0],end[1]-h)];
  }
  const stroke={version:1,id:VZ.uid(),...binding,page:pageNo,tool:drawTool,color,opacity,width,points,createdAt:Date.now()};
  apply({add:[stroke],remove:[]});
 }
 function closeThumbnails(){
  const panel=el?.querySelector('[data-ink-thumbnails]');if(!panel)return;
  panel.hidden=true;el.querySelector('[data-ink-page]').setAttribute('aria-expanded','false');
  ++thumbGeneration;thumbObserver?.disconnect();thumbObserver=null;
  for(const task of thumbTasks)task.cancel();thumbTasks.clear();
 }
 function showThumbnails(){
  if(!doc||!viewReady)return;
  const panel=el.querySelector('[data-ink-thumbnails]');panel.hidden=false;
  el.querySelector('[data-ink-page]').setAttribute('aria-expanded','true');
  thumbBatch=Math.floor((pageNo-1)/24);
  drawThumbnailBatch();
 }
 function drawThumbnailBatch(){
  const grid=el.querySelector('[data-ink-thumb-grid]'),generation=++thumbGeneration;
  thumbObserver?.disconnect();for(const task of thumbTasks)task.cancel();thumbTasks.clear();
  const start=thumbBatch*24+1,end=Math.min(doc.numPages,start+23);
  grid.replaceChildren();el.querySelector('[data-ink-thumb-range]').textContent=start+'–'+end+' / '+doc.numPages+'쪽';
  el.querySelector('[data-ink-thumb-prev]').disabled=thumbBatch===0;
  el.querySelector('[data-ink-thumb-next]').disabled=end>=doc.numPages;
  const render=async button=>{
   let task;
   try{
    const n=Number(button.dataset.inkThumbPage),page=await doc.getPage(n);
    if(closed||generation!==thumbGeneration||!button.isConnected)return;
    const natural=page.getViewport({scale:1}),viewport=page.getViewport({scale:84/natural.width});
    const canvas=button.querySelector('canvas');canvas.width=Math.round(viewport.width);canvas.height=Math.round(viewport.height);
    task=page.render({canvasContext:canvas.getContext('2d'),viewport});thumbTasks.add(task);await task.promise;
   }catch(e){if(e.name!=='RenderingCancelledException')button.dataset.error='true';}
   finally{if(task)thumbTasks.delete(task);}
  };
  if(window.IntersectionObserver)thumbObserver=new IntersectionObserver(entries=>{
   for(const entry of entries)if(entry.isIntersecting){thumbObserver.unobserve(entry.target);render(entry.target);}
  },{root:grid,rootMargin:'60px'});
  for(let n=start;n<=end;n++){
   const item=document.createElement('button');item.type='button';item.dataset.inkThumbPage=n;item.className='score-ink-thumb';item.setAttribute('aria-label',n+'쪽으로 이동');
   if(n===pageNo)item.setAttribute('aria-current','page');
   const canvas=document.createElement('canvas'),label=document.createElement('span');label.textContent=n+'쪽';item.append(canvas,label);
   item.onclick=()=>{pageNo=n;closeThumbnails();renderPage();};
   grid.append(item);if(thumbObserver)thumbObserver.observe(item);else if(n<start+8)render(item);
  }
 }
 function openOtherScores(){
  const picker=el.querySelector('[data-ink-score-picker]');if(!picker.hidden){picker.hidden=true;return;}
  const songs=VZ.db.songs||[],currentSong=VZ.song(songId),lastPractice=new Map();
  for(const practice of VZ.db.practices||[]){
   if(!practice.songId||!/^\d{4}-\d{2}-\d{2}$/.test(practice.date||''))continue;
   const stamp=practice.date+'|'+String(Number(practice.created)||0).padStart(15,'0');
   if(stamp>(lastPractice.get(practice.songId)||''))lastPractice.set(practice.songId,stamp);
  }
  const sameShow=new Set([songId]);
  const showName=(currentSong?.show||'').trim().toLocaleLowerCase();
  for(const song of songs)if(showName&&song.show?.trim().toLocaleLowerCase()===showName)sameShow.add(song.id);
  for(const show of VZ.db.performances||[]){
   if(show.ownerId!==owner||!(show.songLinks||[]).some(link=>link.songId===songId))continue;
   for(const link of show.songLinks||[])if(link.songId)sameShow.add(link.songId);
  }
  const scores=songs.flatMap(song=>(song.scores||[]).filter(item=>!item.deleted&&item.id!==scoreId&&item.r2Key?.startsWith('u/'+owner+'/'+item.id+'/')).map(item=>({song,item})));
  const mostRecent=[...scores].filter(x=>lastPractice.has(x.song.id)).sort((a,b)=>lastPractice.get(b.song.id).localeCompare(lastPractice.get(a.song.id)))[0]?.song.id;
  scores.sort((a,b)=>{
   const rank=x=>x.song.id===mostRecent?0:x.song.id===songId?1:sameShow.has(x.song.id)?2:3;
   return rank(a)-rank(b)||(lastPractice.get(b.song.id)||'').localeCompare(lastPractice.get(a.song.id)||'')||String(a.song.title||'').localeCompare(String(b.song.title||''),'ko')||String(a.item.title||'').localeCompare(String(b.item.title||''),'ko');
  });
  picker.replaceChildren();
  if(!scores.length){const empty=document.createElement('p');empty.textContent='열 수 있는 다른 PDF 악보가 없어요.';picker.append(empty);}
  for(const {song,item} of scores){
   const button=document.createElement('button');button.type='button';
   const title=document.createElement('strong');title.textContent=song.title||'제목 없는 곡';
   const detail=document.createElement('span');detail.textContent=[item.title||item.fileName||'PDF 악보',song.show||''].filter(Boolean).join(' · ');
   const heading=document.createElement('span');heading.className='score-ink-score-heading';heading.append(title);
   const badge=song.id===mostRecent?'최근 연습':sameShow.has(song.id)?'같은 공연':'';
   if(badge){const tag=document.createElement('small');tag.textContent=badge;heading.append(tag);}
   button.append(heading,detail);
   button.onclick=()=>{finishStroke();if(pending){say('필기를 먼저 다시 저장해 주세요. 저장되지 않은 획은 이 화면에 남아 있어요.',true);return;}
    try{current();sheet.close();requestAnimationFrame(()=>VZ.openScoreInk(song.id,item.id));}catch(e){say(e.message,true);}
   };
   picker.append(button);
  }
  picker.hidden=false;
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
  audioBar?.destroy()?.catch?.(()=>{});audioBar=null;
  closed=true;visionController?.abort();clearTimeout(performanceTimer);clearTimeout(prepareTimer);prepareTask?.cancel();prepared=null;closeThumbnails();clearSelection();invalidateExport();document.removeEventListener('fullscreenchange',nativeFullscreenChanged);if(document.fullscreenElement===el)document.exitFullscreen?.().catch(()=>{});controller.abort();resizeObserver?.disconnect();clearTimeout(resizeTimer);cancelAnimationFrame(frame);resetGestures();renderTask?.cancel();loadingTask?.destroy()?.catch?.(()=>{});doc?.destroy()?.catch?.(()=>{});
  if(canvas){canvas.width=0;canvas.height=0;}cleanupHook();window.removeEventListener('vzip:auth-changed',changed);window.removeEventListener('vzip:data-changed',changed);
  window.removeEventListener('beforeunload',unload);document.removeEventListener('visibilitychange',hidden);VZ.setGuard(null);
 }
 function unload(event){selectionEnd();finishStroke();if(pending){event.preventDefault();event.returnValue='';}}
 function hidden(){if(document.visibilityState==='hidden'){selectionEnd();finishStroke();}}
 sheet=VZ.sheet({title:VZ.songTitle?.(songId)||score.title||score.fileName||'악보',label:'악보 개인 필기',body,foot:'<button type="button" class="btn block" data-ink-done>완료</button>',onClose:cleanup,onMount:(node)=>{
  el=node;el.classList.add('score-ink-sheet');
  // Quick samples sit below the whole toolbar, independent of fullscreen toolbar layout.
  const toolbar=el.querySelector('.score-ink-bar');
  toolbar.after(el.querySelector('[data-ink-quick]'),el.querySelector('[data-ink-full-actions]'),el.querySelector('[data-ink-vision-tools]'),el.querySelector('[data-ink-explain-action]'));
  el.querySelectorAll('.score-ink-actions>button').forEach(button=>{const label=document.createElement('span');label.className='score-ink-menu-label';label.textContent=button.getAttribute('aria-label')||'';button.append(label);});
  svg=el.querySelector('[data-ink-svg]');canvas=el.querySelector('[data-ink-pdf]');box=el.querySelector('[data-ink-box]');stage=el.querySelector('[data-ink-stage]');status=el.querySelector('[data-ink-status]');done=el.querySelector('[data-ink-done]');
  // MR 재생 · 녹음 · MR+녹음 under the score page (app/score-audio.js).
  try{audioBar=window.VzipScoreAudio?.mount(stage,{songId,scoreTitle:score.title||score.fileName||''})||null;}catch{audioBar=null;}
  compactLayout();
  // Fullscreen: the page row floats over the score and hides after 2.5 s without touch, swipe, scroll or keys.
  el.querySelector('[data-ink-prev]').disabled=true;el.querySelector('[data-ink-next]').disabled=true;
  el.querySelector('[data-ink-first]').disabled=true;el.querySelector('[data-ink-last]').disabled=true;
  const back=el.parentNode;
  back.addEventListener('click',event=>{if(event.target===back||event.target.closest('[data-close]')){event.preventDefault();event.stopImmediatePropagation();closeEditor();}},true);
  back.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(el.dataset.inkMoreOpen==='true')setMoreOpen(false);else if(!el.querySelector('section[data-ink-settings]').hidden)settingsOpen(false);else if(selection){selectionEnd(false);clearSelection();paint();}else if(performance)performanceMode(false);else if(full)fullscreen(false);else closeEditor();}},true);
  done.onclick=()=>{if(pending)apply(pending.action,pending.kind);else closeEditor();};
  el.querySelector('[data-ink-other-scores]').onclick=openOtherScores;
  const settingsButton=el.querySelector('.score-ink-actions [data-ink-settings]');
  settingsButton.setAttribute('aria-expanded','false');
  settingsButton.onclick=()=>settingsOpen(el.querySelector('section[data-ink-settings]').hidden);
  el.querySelector('[data-ink-settings-close]').onclick=()=>settingsOpen(false);
  el.querySelector('[data-ink-fullscreen]').onclick=()=>fullscreen(!full);
  el.querySelector('[data-ink-more]').onclick=()=>setMoreOpen(el.dataset.inkMoreOpen!=='true');
  el.addEventListener('click',event=>{if(el.dataset.inkMoreOpen==='true'&&!event.target.closest('[data-ink-more],.score-ink-actions'))setMoreOpen(false);else if(event.target.closest('.score-ink-actions>button'))setMoreOpen(false);});
  el.querySelector('[data-ink-performance]').onclick=()=>performanceMode(true);
  el.querySelector('[data-ink-performance-exit]').onclick=()=>performanceMode(false);
  el.querySelector('[data-ink-performance-prev]').onclick=()=>{if(viewReady&&!busy&&pageNo>1){pageNo--;markerStart=null;renderPage();}};
  el.querySelector('[data-ink-performance-next]').onclick=()=>{if(viewReady&&!busy&&pageNo<doc?.numPages){pageNo++;markerStart=null;renderPage();}};
  stage.onpointerdown=event=>{if((performance||!ready)&&event.pointerType==='touch'&&viewReady&&!busy&&event.target!==svg)gestureDown(event);};
  stage.onpointermove=event=>{if((performance||!ready)&&event.target!==svg)gestureMove(event);};
  stage.onpointerup=stage.onpointercancel=event=>{if((performance||!ready)&&event.target!==svg)gestureEnd(event);};
  // Safari can cancel PointerEvents while scrolling. Track fingers as a fallback
  // so horizontal page swipes still work without interfering with Apple Pencil.
  stage.addEventListener('touchstart',event=>{
   if(tool==='notation'||!viewReady||busy||pending)return;
   const fingers=[...event.touches].filter(t=>t.touchType!=='stylus');
   if(fingers.length!==2&&!(fingers.length===1&&(profiles.penOnly||performance)))return;
   if(fingers.length===2){
    if(active&&touchInkStart?.pointer===active.pointer){active=null;cancelAnimationFrame(frame);frame=0;paint();}
    touchEraser=null;markerDrag=null;
    if(selection?.drag)selectionEnd(false);
   }
   if(!touchSwipe||touchSwipe.count!==fingers.length){
    touchSwipe={count:fingers.length,start:new Map(fingers.map(t=>[t.identifier,{x:t.clientX,y:t.clientY}])),
     end:new Map(fingers.map(t=>[t.identifier,{x:t.clientX,y:t.clientY}])),page:pageNo,time:Date.now(),
     zoom,atLeft:stage.scrollLeft<=2,atRight:stage.scrollLeft>=stage.scrollWidth-stage.clientWidth-2};
   }
  },{passive:true});
  stage.addEventListener('touchmove',event=>{
   if(!touchSwipe)return;
   for(const t of event.changedTouches)if(touchSwipe.end.has(t.identifier))touchSwipe.end.set(t.identifier,{x:t.clientX,y:t.clientY});
  },{passive:true});
  for(const type of ['touchend','touchcancel'])stage.addEventListener(type,event=>{
   const swipe=touchSwipe;if(!swipe)return;
   for(const t of event.changedTouches)if(swipe.end.has(t.identifier))swipe.end.set(t.identifier,{x:t.clientX,y:t.clientY});
   if(type==='touchcancel'){touchSwipe=null;return;}
   if([...event.touches].some(t=>swipe.start.has(t.identifier)))return;
   touchSwipe=null;
   const restore=()=>{if(swipe.needsRedraw&&!busy&&pageNo===swipe.page)renderPage({keepScroll:true});};
   if(pageNo!==swipe.page||Date.now()-swipe.time>1200||!viewReady||busy||pending||!doc){restore();return;}
   const ids=[...swipe.start.keys()],dx=ids.map(id=>swipe.end.get(id).x-swipe.start.get(id).x),
    dy=ids.map(id=>swipe.end.get(id).y-swipe.start.get(id).y);
   if(dx.some((v,i)=>Math.abs(v)<56||Math.abs(v)<Math.abs(dy[i])*1.4)){restore();return;}
   if(swipe.count===2){
    const [a,b]=ids.map(id=>swipe.start.get(id)),[c,d]=ids.map(id=>swipe.end.get(id));
    if(dx[0]*dx[1]<=0||Math.abs(dx[0]-dx[1])>=55||Math.abs(Math.hypot(c.x-d.x,c.y-d.y)-Math.hypot(a.x-b.x,a.y-b.y)) >=Math.max(25,Math.hypot(a.x-b.x,a.y-b.y)*.18)){restore();return;}
   }else if(!(profiles.penOnly||performance)||stage.scrollWidth-stage.clientWidth>8&&!(dx[0]<0?swipe.atRight:swipe.atLeft)){restore();return;}
   const direction=dx[0]<0?1:-1;
   if(pageNo+direction<1||pageNo+direction>doc.numPages){restore();return;}
   if(swipe.count===2){zoom=swipe.zoom;zoomValue();}
   pageNo+=direction;resetGestures();renderPage();
  },{passive:true});
  stage.addEventListener('touchstart',event=>{
   if(tool!=='notation'||!ready||busy||exportBusy||pending||!box.contains(event.target)||event.touches.length!==1)return;
   const touch=event.changedTouches[0];if(!touch||touch.touchType==='stylus')return;
   event.preventDefault();visionDrag={touch:touch.identifier,start:coords(touch)};visionMove(visionDrag.start);
  },{passive:false});
  stage.addEventListener('touchmove',event=>{
   if(tool!=='notation'||visionDrag?.touch===undefined)return;
   const touch=Array.from(event.changedTouches).find(t=>t.identifier===visionDrag.touch);if(!touch)return;
   event.preventDefault();visionMove(coords(touch));
  },{passive:false});
  for(const type of ['touchend','touchcancel'])stage.addEventListener(type,event=>{
   if(visionDrag?.touch===undefined)return;
   const touch=Array.from(event.changedTouches).find(t=>t.identifier===visionDrag.touch);if(!touch)return;
   event.preventDefault();visionEnd(coords(touch),type==='touchend');
  },{passive:false});
  stage.onclick=event=>{if(performance&&event.target.closest?.('[data-ink-performance-controls]')==null)showPerformanceControls();};
  el.querySelector('[data-ink-export]').onclick=exportPDF;
  el.querySelector('[data-ink-vision-more]').onclick=()=>{const panel=el.querySelector('[data-ink-vision-result]'),more=el.querySelector('[data-ink-vision-more]'),expanded=panel.dataset.expanded!=='true';panel.dataset.expanded=String(expanded);more.setAttribute('aria-expanded',String(expanded));more.textContent=expanded?'접기':'더보기';};
  el.querySelector('[data-ink-vision-cancel]').onclick=()=>visionPanel(false);
  el.querySelector('[data-ink-note-undo]').onclick=()=>{if(!notesHistory.length||!ready)return;try{const previous=notesHistory.at(-1);current();viewStorage.setItem(notesKey,JSON.stringify({pdfHash:binding.pdfHash,r2Key:score.r2Key,notes:previous}));notesHistory.pop();notes=previous;syncVisionTools();paintNotes();say('이전 텍스트 메모로 되돌렸어요.');}catch(e){say(e.message,true);}};
  el.querySelector('[data-ink-vision-delete]').onclick=()=>{const result=el.querySelector('[data-ink-vision-result]')._result;if(result?.mode!=='edit')return;try{saveNotes(notes.filter(n=>n.id!==result.id));visionPanel(false);}catch(e){say(e.message,true);}};
  el.querySelector('[data-ink-vision-save]').onclick=()=>{
   const result=el.querySelector('[data-ink-vision-result]')._result,text=el.querySelector('[data-ink-vision-text]').value.trim();
   if(!text){say('저장할 글자를 입력해 주세요.',true);return;}if(!result||result.page!==pageNo||!ready){say('원래 페이지에서 다시 확인해 주세요.',true);return;}
   try{const note={id:result.id||VZ.uid(),page:pageNo,text:text.slice(0,1200),x:Math.max(0,Math.min(.92,result.rect.x)),y:Math.max(0,Math.min(.95,result.rect.y))};saveNotes([...notes.filter(n=>n.id!==note.id),note]);visionPanel(false);}catch(e){say('텍스트 메모를 저장하지 못했어요: '+e.message,true);}
  };
  el.querySelector('[data-ink-vision-replace]').onclick=()=>{
   const result=el.querySelector('[data-ink-vision-result]')._result,text=el.querySelector('[data-ink-vision-text]').value.trim();
   if(!text||result?.page!==pageNo||!ready||pending||!result?.rows?.length){say('변환 결과와 원래 필기를 확인해 주세요.',true);return;}
   try{current();if(!result.rows.every(s=>store.list(binding,pageNo).some(r=>r.id===s.id&&Ink.same(r,s))))throw Error('원래 필기가 바뀌었어요. 다시 선택해 주세요.');const note={id:VZ.uid(),page:pageNo,text:text.slice(0,1200),x:Math.max(0,Math.min(.92,result.rect.x)),y:Math.max(0,Math.min(.95,result.rect.y))};saveNotes([...notes,note]);apply({add:[],remove:result.rows});visionPanel(false);clearSelection();}catch(e){say('필기 대체를 완료하지 못했어요: '+e.message,true);}
  };
  el.querySelector('[data-ink-recognize]').onclick=()=>{if(selection?.rows.length)recognize('handwriting',null,selection.rows);};
  el.querySelector('[data-ink-explain-selection]').onclick=()=>{if(scoreRect)recognize('notation',scoreRect);};
  el.querySelector('[data-ink-notation]').onclick=()=>{if(tool==='notation'){el.querySelector('[data-ink-tool="pan"]').click();say('악보 표기 AI 분석을 껐어요.');return;}selectionEnd(false);clearSelection();clearScoreRect();finishStroke();resetGestures();markerStart=null;markerDrag=null;el.querySelector('[data-ink-marker-palette]').hidden=true;el.querySelector('[data-ink-marker-mode]').setAttribute('aria-pressed','false');tool='notation';svg.dataset.tool=tool;stage.dataset.notation='true';el.querySelectorAll('[data-ink-tool]').forEach(b=>b.setAttribute('aria-pressed','false'));el.querySelector('[data-ink-notation]').setAttribute('aria-pressed','true');syncQuick();say('궁금한 표기를 손가락으로 사각형으로 둘러 주세요.');};
  el.querySelector('[data-ink-width]').oninput=event=>updateSettings({width:Number(event.target.value)/1000});
  el.querySelector('[data-ink-eraser-size]').oninput=event=>updateEraser(Number(event.target.value)/1000);
  el.querySelectorAll('[data-ink-settings-tab]').forEach(button=>button.onclick=()=>setSettingsTab(button.dataset.inkSettingsTab));
  el.querySelector('[data-ink-opacity]').oninput=event=>updateSettings({opacity:Math.round((100-Number(event.target.value))*1000)/100000});
  el.querySelector('[data-ink-picker]').oninput=event=>{el.querySelector('[data-ink-hex]').value=event.target.value;el.querySelector('[data-ink-custom-add]').disabled=false;};
  el.querySelector('[data-ink-hex]').oninput=event=>{const valid=/^#[0-9a-f]{6}$/i.test(event.target.value);el.querySelector('[data-ink-custom-add]').disabled=!valid;if(valid)el.querySelector('[data-ink-picker]').value=event.target.value;};
  el.querySelector('[data-ink-custom-add]').onclick=()=>updateSettings({color:el.querySelector('[data-ink-hex]').value},{custom:true,recent:true});
  el.querySelector('[data-ink-custom-remove]').onclick=()=>updateSettings({},{removeCustom:true});
  el.querySelector('[data-ink-pen-only]').onchange=event=>{finishStroke();try{profiles=prefs.write('input',{penOnly:event.target.checked});syncSettings();}catch(e){event.target.checked=profiles.penOnly;say(e.message,true);}};
  syncSettings();settingsOpen(false);zoomValue();
  el.querySelector('[data-ink-page]').onclick=()=>{if(el.querySelector('[data-ink-thumbnails]').hidden)showThumbnails();else closeThumbnails();};
  el.querySelector('[data-ink-thumb-close]').onclick=closeThumbnails;
  el.querySelector('[data-ink-thumb-prev]').onclick=()=>{if(thumbBatch>0){thumbBatch--;drawThumbnailBatch();}};
  el.querySelector('[data-ink-thumb-next]').onclick=()=>{if((thumbBatch+1)*24<doc?.numPages){thumbBatch++;drawThumbnailBatch();}};
  el.querySelector('[data-ink-jump-form]').onsubmit=event=>{event.preventDefault();const n=Number(el.querySelector('[data-ink-jump-input]').value);if(!Number.isInteger(n)||n<1||n>doc?.numPages){say('1부터 '+doc.numPages+'쪽 사이 번호를 입력해 주세요.',true);return;}pageNo=n;closeThumbnails();renderPage();};
  el.querySelectorAll('[data-ink-tool]').forEach(button=>button.onclick=()=>{
   selectionEnd(false);clearSelection();clearScoreRect();finishStroke();resetGestures();markerStart=null;markerDrag=null;el.querySelector('[data-ink-marker-palette]').hidden=true;el.querySelector('[data-ink-marker-mode]').setAttribute('aria-pressed','false');tool=button.dataset.inkTool;svg.dataset.tool=tool;stage.dataset.notation='false';el.querySelector('[data-ink-notation]').setAttribute('aria-pressed','false');if(['pen','highlighter','eraser'].includes(tool))settingsTab=tool;if(['pen','highlighter'].includes(tool))paintTool=tool;syncSettings();
   el.querySelectorAll('[data-ink-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));paint();
   if(tool==='select')say('필기를 누르거나 사각형으로 둘러 선택하세요.');
  });
  el.querySelector('[data-ink-marker-mode]').onclick=()=>{
   if(tool==='notation')el.querySelector('[data-ink-tool="pan"]').click();
   const palette=el.querySelector('[data-ink-marker-palette]');palette.hidden=!palette.hidden;
  };
  el.querySelectorAll('[data-ink-marker]').forEach(button=>button.onclick=()=>{
   finishStroke();selectionEnd(false);clearSelection();clearScoreRect();markerStart=null;markerDrag=null;resetGestures();
   markerType=button.dataset.inkMarker;tool='marker';svg.dataset.tool=tool;stage.dataset.notation='false';el.querySelector('[data-ink-notation]').setAttribute('aria-pressed','false');syncQuick();
   el.querySelectorAll('[data-ink-tool]').forEach(b=>b.setAttribute('aria-pressed','false'));
   el.querySelector('[data-ink-marker-mode]').setAttribute('aria-pressed','true');
   el.querySelectorAll('[data-ink-marker]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
   el.querySelector('[data-ink-marker-palette]').hidden=true;
   say(markerType==='repeat'?'반복 구간의 시작과 끝을 차례로 눌러 주세요.':markerType==='cut'?'생략할 구간을 따라 그어 주세요.':'악보에서 표시할 위치를 눌러 주세요.');
  });
  el.querySelector('[data-ink-prev]').onclick=()=>{if(viewReady&&!busy&&pageNo>1){pageNo--;renderPage();}};
  el.querySelector('[data-ink-next]').onclick=()=>{if(viewReady&&!busy&&pageNo<doc?.numPages){pageNo++;renderPage();}};
  el.querySelector('[data-ink-first]').onclick=()=>{if(viewReady&&!busy&&pageNo>1){pageNo=1;renderPage();}};
  el.querySelector('[data-ink-last]').onclick=()=>{if(viewReady&&!busy&&pageNo<doc?.numPages){pageNo=doc.numPages;renderPage();}};
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
   if(tool!=='notation'&&event.pointerType==='touch'&&touchInkStart&&touchInkStart.pointer!==event.pointerId&&!touches.size&&event.width<=50&&event.height<=50&&Date.now()-touchInkStart.time<280&&(!active||active.stroke.points.length<4)){
    if(active?.pointer===touchInkStart.pointer){active=null;cancelAnimationFrame(frame);frame=0;}
    touchEraser=null;markerDrag=null;
    if(selection?.drag?.pointer===touchInkStart.pointer)selectionEnd(false);
    paint();
    const first=touchInkStart;touchInkStart=null;
    gestureDown({pointerId:first.pointer,clientX:first.x,clientY:first.y,width:0,height:0,preventDefault(){}});
    gestureDown(event);return;
   }
   if(event.pointerType==='touch'&&tool!=='notation'&&(profiles.penOnly||tool==='pan')){
    if(active||selection?.drag)return;
    if(!el.querySelector('section[data-ink-settings]').hidden){settingsOpen(false);return;}
    gestureDown(event);return;
   }
   if(tool==='pan'||active||selection?.drag||event.isPrimary===false)return;
   if(!el.querySelector('section[data-ink-settings]').hidden){settingsOpen(false);return;}
   if(profiles.penOnly&&event.pointerType!=='pen'&&tool!=='notation')return;
   resetGestures();
   if(event.pointerType==='touch'&&tool!=='notation')touchInkStart={pointer:event.pointerId,x:event.clientX,y:event.clientY,time:Date.now()};
   try{
    current();event.preventDefault();const p=coords(event);
    if(tool==='select'){selectionDown(event,p);return;}
    if(tool==='notation'){visionDrag={pointer:event.pointerId,start:p};try{svg.setPointerCapture?.(event.pointerId);}catch{}return;}
    if(tool==='marker'){markerDrag={pointer:event.pointerId,start:p};try{svg.setPointerCapture?.(event.pointerId);}catch{}return;}
    if(tool==='eraser'){
     if(event.pointerType==='touch'){touchEraser={pointer:event.pointerId,point:p};try{svg.setPointerCapture?.(event.pointerId);}catch{}return;}
     const found=strokes().reverse().find(s=>Ink.hit(s,p,aspect,profiles.eraser.size));if(found)apply({add:[],remove:[found]});return;
    }
    const config=profiles[tool];
    const stroke={version:1,id:VZ.uid(),...binding,page:pageNo,tool,color:config.color,opacity:config.opacity,
     width:config.width,points:[p],createdAt:Date.now()};
    active={pointer:event.pointerId,stroke};try{svg.setPointerCapture?.(event.pointerId);}catch{}schedule();
   }catch(e){say(e.message,true);}
  };
  svg.onpointermove=event=>{
   if(visionDrag?.pointer===event.pointerId){event.preventDefault();visionMove(coords(event));return;}
   try{if(selectionMove(event))return;}catch(e){selectionEnd(false);say(e.message,true);return;}
   if(!active&&gestureMove(event))return;
   if(markerDrag?.pointer===event.pointerId){event.preventDefault();markerDrag.end=coords(event);return;}
   if(active?.pointer!==event.pointerId)return;event.preventDefault();
   const samples=event.getCoalescedEvents?.();const events=samples?.length?samples:[event];
   for(const item of events){const p=coords(item),last=active.stroke.points.at(-1);if(Math.hypot(p[0]-last[0],p[1]-last[1])>0.0008&&active.stroke.points.length<Ink.MAX_POINTS)active.stroke.points.push(p);}
   schedule();
  };
  svg.onpointerup=svg.onpointercancel=svg.onlostpointercapture=event=>{
   if(visionDrag?.pointer===event.pointerId){visionEnd(coords(event),event.type==='pointerup');return;}
   if(touchInkStart?.pointer===event.pointerId)touchInkStart=null;
   if(touchEraser?.pointer===event.pointerId){const point=touchEraser.point;touchEraser=null;if(event.type==='pointerup'){try{const found=strokes().reverse().find(s=>Ink.hit(s,point,aspect,profiles.eraser.size));if(found)apply({add:[],remove:[found]});}catch(e){say(e.message,true);}}return;}
   if(selection?.drag?.pointer===event.pointerId){event.preventDefault();try{selectionEnd(event.type==='pointerup');}catch(e){selectionEnd(false);say(e.message,true);}return;}
   if(gestureEnd(event))return;
   if(markerDrag?.pointer===event.pointerId){const start=markerDrag.start;markerDrag=null;if(event.type==='pointerup')try{placeMarker(start,coords(event));}catch(e){say(e.message,true);}return;}
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
   const urlPromise=deadline(window.VzipR2.url(score.r2Key),15000,'PDF 주소 확인이 오래 걸려요.');
   let bytesPromise,knownHash='';
   // Render the first page via PDF.js ranges, then reuse its raw bytes for the
   // original hash. A separate download is only needed if PDF.js cannot provide them.
   // The complete original is fetched in one request as soon as the score opens (not re-collected in 256 KB
   // ranges after the first page): it feeds the ink check and, when it arrives first, the page itself.
   // Its progress is shown while the first page is not on screen yet.
   let fullDone=false;
   const fullBytes=()=>bytesPromise ||= (async()=>{
    const url=await urlPromise;
    const response=await deadline(fetch(url,{signal:controller.signal,cache:'default'}),20000,'PDF 다운로드가 지연되고 있어요.');
    const data=await readPDF(response,score.size,controller.signal,part=>{if(!closed&&box.hidden)say('악보 불러오는 중 '+Math.min(99,Math.round(part*100))+'%');});
    fullDone=true;return data;
   })();
   const options={isEvalSupported:false,enableXfa:false,standardFontDataUrl:PDFJS+'standard_fonts/',cMapUrl:PDFJS+'cmaps/',cMapPacked:true};
   const original=url=>{if(!closed){el.querySelector('[data-ink-original]').href=url;el.querySelector('[data-ink-original-quick]').href=url;}};
   // A PDF opened before on this device opens from the device copy: no download, no second hash.
   const kept=await pdfCache.fresh(owner,score).catch(()=>null);current();
   if(kept){
    urlPromise.then(original,()=>{});
    const pdf=await deadline(library(),20000,'악보 뷰어를 불러오지 못했어요.');current();
    say('첫 페이지를 준비하고 있어요.');
    bytesPromise=Promise.resolve(kept.bytes);knownHash=kept.hash;
    loadingTask=pdf.getDocument({...options,data:kept.bytes.slice()});
    doc=await deadline(loadingTask.promise,30000,'PDF 페이지를 열지 못했어요.');
   }else{
   fullBytes().catch(()=>{});
   const [url,pdf]=await Promise.all([urlPromise,deadline(library(),20000,'악보 뷰어를 불러오지 못했어요.')]);current();
   original(url);
   if(fullDone){
    // The whole PDF is already here: open it once from those bytes.
    loadingTask=pdf.getDocument({...options,data:(await fullBytes()).slice()});
    doc=await deadline(loadingTask.promise,30000,'PDF 페이지를 열지 못했어요.');
   }else{
   loadingTask=pdf.getDocument({...options,url,disableAutoFetch:true,disableStream:true,rangeChunkSize:1048576});
   loadingTask.onPassword=()=>{loadingTask.destroy();say('암호가 없는 PDF로 다시 올려 주세요.',true);};
   try{doc=await deadline(loadingTask.promise,30000,'PDF 첫 페이지를 열지 못했어요.');}
   catch(rangeError){
    current();if(closed)return;
    loadingTask?.destroy()?.catch?.(()=>{});
    say('PDF 전체를 확인하고 있어요.');
    const bytes=await fullBytes();current();
    loadingTask=pdf.getDocument({...options,data:new Uint8Array(bytes)});
    doc=await deadline(loadingTask.promise,30000,'PDF 페이지를 열지 못했어요.');
   }
   }
   }
   current();if(closed)return;
   if(doc.numPages>2000)throw Error('2000쪽 이하 PDF를 사용해 주세요.');
   pageNo=Math.min(pageNo,doc.numPages);
   await renderPage();current();if(closed)return;
   if(box.hidden)throw Error('악보 첫 페이지를 표시하지 못했어요.');
   // PDF content identity must be verified before annotations can be drawn or edited.
   // The first page is readable while the complete original is being hashed.
   const bytes=await fullBytes();current();if(closed)return;
   const pdfHash=knownHash||await hash(bytes);current();if(closed)return;
   if(!knownHash)pdfCache.put(owner,score,bytes,pdfHash).catch(()=>{});
   binding={ownerId:owner,songId,scoreId,r2Key:score.r2Key,pdfHash};
   readNotes();
   if(savedView?.pdfHash&&savedView.pdfHash!==pdfHash){
    pageNo=1;zoom=1;zoomValue();await renderPage();current();if(closed)return;
   }
   ready=true;stage.dataset.viewOnly='false';rememberView();saveState('필기 준비됨','local');svg.style.pointerEvents=performance?'none':'';svg.dataset.tool=tool;
   window.VzipR2.scoreVisionAvailable?.().then(result=>{if(closed)return;visionAvailable=!!result.available;syncVisionTools();paint();}).catch(()=>{if(!closed)syncVisionTools();});
   el.querySelector('[data-ink-prev]').disabled=pageNo<=1;el.querySelector('[data-ink-next]').disabled=pageNo>=doc.numPages;
   el.querySelector('[data-ink-first]').disabled=pageNo<=1;el.querySelector('[data-ink-last]').disabled=pageNo>=doc.numPages;
   paint();
   const old=(VZ.db.scoreAnnotations||[]).some(s=>s.ownerId===owner&&s.scoreId===scoreId&&s.r2Key===score.r2Key&&s.pdfHash!==pdfHash);
   say(old?'PDF 내용이 바뀌어 이전 버전 필기는 겹쳐 표시하지 않아요. 이전 필기 기록은 유지돼요.':'필기 준비됨 · 한 획씩 이 기기에 자동 저장');
  }catch(e){if(!closed&&e.name!=='AbortError'){say('악보를 열지 못했어요: '+e.message+' · 원본 PDF 열기를 눌러 확인해 주세요.',true);el.querySelector('[data-ink-original-quick]').hidden=!el.querySelector('[data-ink-original-quick]').hasAttribute('href');}}
 })();
 return sheet;
};
})();
