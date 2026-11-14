/* GoodNotes notebook → scores. The notebook is read on this device (app/goodnotes-parse.js), cut into songs by its
 * outline (each outline entry runs until the page before the next one), and each song becomes its own PDF score.
 *
 * The handwriting goes INTO that PDF as an attached file (vocalzip-ink.json). The PDF is stored in R2 like every
 * score, so the handwriting reaches every device with it, however much there is: nothing is capped, flattened or
 * kept on one device only. The viewer shows it as ordinary editable strokes (app/score-ink.js); erasing or moving
 * one is recorded with the account's synced ink records, so edits sync too.
 *
 * Audio recorded in the notebook (the owner records each song's MR there, titled with the song) is offered under the
 * scores as "MR 녹음": each recording the user leaves switched on is added to a song's MR list through
 * VZ.songMR.addFile (app/song-mr.js) with its original bytes — nothing is re-encoded.
 *
 * Only adds: new score PDFs, new score entries, new MR files (and a new song when the user chooses that). Nothing
 * existing is replaced; the .goodnotes file itself is never uploaded. Anything that cannot be placed exactly stops
 * the import. */
(() => {
'use strict';
const VZ=window.VZ,G=window.VzipGoodnotes,Ink=window.VzipScoreInk;
if(!VZ||!G||!Ink)return;
const esc=VZ.esc,MAX_PDF=50*1024*1024;
const ATTACHMENT='vocalzip-ink.json';
let pdfLib;
function library(){
 if(window.PDFLib)return Promise.resolve(window.PDFLib);
 if(!pdfLib)pdfLib=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';script.crossOrigin='anonymous';
  script.onload=()=>window.PDFLib?resolve(window.PDFLib):reject(Error('PDF 도구를 확인하지 못했어요.'));
  script.onerror=()=>{script.remove();pdfLib=null;reject(Error('PDF 도구를 불러오지 못했어요. 연결 후 다시 시도해 주세요.'));};document.head.append(script);
 });
 return pdfLib;
}
const plain=s=>String(s||'').normalize('NFKC').toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
/** The song a section title most clearly names; null when none or several fit equally. */
function matchSong(title,songs){
 const name=plain(title);if(name.length<2)return null;
 let best=null,score=0,tie=false;
 for(const song of songs){
  let s=0;
  for(const label of [song.title,...(Array.isArray(song.aliases)?song.aliases:[])]){
   const other=plain(label);if(other.length<2)continue;
   if(other===name)s=Math.max(s,3);
   else if(other.length>=3&&name.includes(other)||name.length>=3&&other.includes(name))s=Math.max(s,2);
  }
  if(s>score){best=song;score=s;tie=false;}else if(s&&s===score)tie=true;
 }
 return tie?null:best;
}
/** "03. Honey Honey", "3) Honey Honey", "03 - Honey Honey" → "Honey Honey": a leading track number is not part of the name. */
const untrack=title=>{const t=String(title||'').trim(),rest=t.replace(/^\d{1,3}\s*(?:[.)]\s*|[-–—:]\s+)(?=\D)/,'').trim();return rest||t;};
/** The song a recording's title names, with or without its track number; null when none or several fit (never guessed). */
const matchTitle=(title,songs)=>matchSong(title,songs)||matchSong(untrack(title),songs);
const sameTitle=(a,b)=>{const x=plain(untrack(a));return x.length>=2&&x===plain(untrack(b));};
const clock=seconds=>{const n=Math.max(0,Math.round(seconds||0));return Math.floor(n/60)+':'+String(n%60).padStart(2,'0');};
const sizeLabel=bytes=>bytes>=1048576?(bytes/1048576).toFixed(1)+'MB':Math.max(1,Math.round(bytes/1024))+'KB';
const safeName=title=>String(title).replace(/[\\/:*?"<>|\u0000-\u001f]+/g,'_').slice(0,80);
/** GoodNotes recordings are MP4 audio (.m4a): the file starts with an `ftyp` box. Anything else is not uploaded as one. */
const isMp4=bytes=>bytes.length>12&&bytes[4]===0x66&&bytes[5]===0x74&&bytes[6]===0x79&&bytes[7]===0x70;
/** Drops points that do not change the line visibly (Ramer–Douglas–Peucker, 0.06% of the page width). */
function simplify(points,tolerance=0.0006){
 if(points.length<3)return points;
 const keep=new Uint8Array(points.length);keep[0]=keep[points.length-1]=1;const stack=[[0,points.length-1]];
 while(stack.length){
  const [a,b]=stack.pop(),[ax,ay]=points[a],[bx,by]=points[b],dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy;let far=-1,max=tolerance;
  for(let i=a+1;i<b;i++){const [x,y]=points[i],t=den?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/den)):0,d=Math.hypot(x-ax-t*dx,y-ay-t*dy);if(d>max){max=d;far=i;}}
  if(far>0){keep[far]=1;stack.push([a,far],[far,b]);}
 }
 return points.filter((_,i)=>keep[i]);
}
/** Sections with their ink simplified. Every stroke stays editable. */
function plan(model){
 return model.sections.map((section,index)=>{
  const pages=section.pages.map((p,i)=>({source:model.pages[p],number:i+1,strokes:model.pages[p].strokes.map(s=>({...s,points:simplify(s.points)}))}));
  return {index,title:section.title,from:section.from,to:section.to,untitled:section.untitled,pages,count:pages.reduce((n,p)=>n+p.strokes.length,0)};
 });
}
/** The attachment: strokes in page units, without account or PDF binding (the viewer adds those when it opens the
 * score, because the binding includes this very PDF's hash). Ids are stable per score, so a re-import of the same
 * section cannot collide with another score's strokes. */
function inkFile(item,scoreId,createdAt){
 let n=0;
 const strokes=item.pages.flatMap(page=>page.strokes.map(s=>({id:'gn-'+scoreId+'-'+(n++),page:page.number,tool:s.tool,color:s.color,opacity:s.opacity,width:s.width,points:s.points,createdAt:createdAt+n})));
 return {format:'vocalzip-ink',version:1,source:'goodnotes',strokes};
}
/** The notebook's PDF for page copying. Bought scores are often locked with an owner password only (they open without
 *  a password); pdf-lib refuses those, so they are decrypted on this device first. Files that need a password are refused. */
async function openSource(lib,bytes){
 try{return await lib.PDFDocument.load(bytes,{updateMetadata:false});}
 catch(error){
  const D=window.VzipPdfDecrypt;if(!D||!D.isEncrypted(error))throw error;
  return D.load(lib,bytes,{updateMetadata:false});
 }
}
/** Builds one song's PDF from its notebook pages, with its handwriting attached. */
async function buildPdf(item,model,lib,sources,ink){
 const out=await lib.PDFDocument.create();
 for(const page of item.pages){
  const ref=page.source.pdf;let added;
  if(ref){
   if(!sources.has(ref.file)){const bytes=await model.readFile(ref.file);if(!bytes)throw Error('굿노트 파일 안의 PDF를 찾지 못했어요.');sources.set(ref.file,await openSource(lib,bytes));}
   const source=sources.get(ref.file);
   if(ref.page<1||ref.page>source.getPageCount())throw Error('굿노트 파일의 쪽 번호가 PDF와 맞지 않아요.');
   [added]=await out.copyPages(source,[ref.page-1]);out.addPage(added);
  }else added=out.addPage([page.source.width,page.source.height]);
  if(page.strokes.length){
   // GoodNotes places ink on the upright page as it shows it. A rotated or cropped PDF page would put the strokes
   // somewhere else, so such a page stops the import instead of silently misplacing (or dropping) them.
   const {width,height}=added.getSize(),box=added.getCropBox?.()||{x:0,y:0,width,height},turned=added.getRotation?.().angle||0;
   if(turned%360!==0||Math.abs(box.width-width)>0.5||Math.abs(box.height-height)>0.5)
    throw Error('“'+item.title+'” '+page.number+'쪽은 회전되었거나 잘린 PDF라 필기 위치를 정확히 맞출 수 없어요. 필기를 빠뜨리지 않도록 가져오기를 멈췄어요.');
  }
 }
 if(ink.strokes.length)await out.attach(new TextEncoder().encode(JSON.stringify(ink)),ATTACHMENT,{mimeType:'application/json',description:'VOCAL.zip handwriting imported from GoodNotes',creationDate:new Date(ink.strokes[0].createdAt),modificationDate:new Date(ink.strokes[0].createdAt)});
 return await out.save();
}
const summary=report=>[
 report.removedPages?'굿노트에서 지운 쪽 '+report.removedPages+'장은 빼고 가져와요.':'',
 report.unsupported?'알 수 없는 형식의 필기 '+report.unsupported+'개는 가져오지 않아요.':'',
 report.unmatchedNotes?'어느 쪽의 필기인지 확인하지 못한 묶음 '+report.unmatchedNotes+'개는 가져오지 않아요.':'',
 report.pagesWithoutPdf?'PDF가 아닌 쪽 '+report.pagesWithoutPdf+'장은 빈 쪽으로 들어가요.':'',
 report.recordingsSkipped>report.recordingsDeleted?'파일이 남아 있지 않은 녹음 '+(report.recordingsSkipped-report.recordingsDeleted)+'개는 가져올 수 없어요.':''].filter(Boolean);

/** Counts only (no titles, no content): what the reader found in the file, for telling why an import looks wrong. */
const diagnosis=(model,file)=>{const r=model.report,list=o=>Object.entries(o||{}).map(([k,n])=>k+'×'+n).join(' ')||'없음';
 return ['읽기 버전 '+(r.reader||'?')+' · 굿노트 형식 '+(r.schema??'?')+' · 파일 '+Math.round((file?.size||0)/1024)+'KB',
  '쪽 기록 '+r.pageEvents+' · 옮긴 쪽 '+(r.movedPages||0)+' · 지움 표시 '+r.removedPages+' · 가져올 쪽 '+model.pages.length+' · PDF 쪽 번호 '+model.pages.map(p=>p.pdf?p.pdf.page:'-').join(','),
  '필기 '+r.strokes+'획 · 못 읽음 '+r.unsupported+' · 지운 필기 '+r.deleted+' · 짝 없는 묶음 '+r.unmatchedNotes,
  '녹음 '+(r.recordings||0)+'개(지운 것 '+(r.recordingsDeleted||0)+')'+(r.recordingsSkipped>r.recordingsDeleted?' · 파일 없음 '+(r.recordingsSkipped-r.recordingsDeleted):''),
  '필기 종류 '+list(r.inkKinds),'필기가 아닌 것(스티커·이미지·글상자 등, 아직 가져오지 않아요) '+list(r.elements),'기록 종류 '+list(r.events),'모르는 기록 '+list(r.unknownEvents)];};
/**
 * @param {File} file a .goodnotes file
 * @param {{song?:object, onDone?:Function}} [options] song: the song page the import was started from
 */
VZ.goodnotesImport=async(file,{song=null,onDone=()=>{}}={})=>{
 if(!file)return;
 VZ.toast('굿노트 파일을 읽고 있어요…');
 let model;
 try{model=await G.read(new Uint8Array(await file.arrayBuffer()));}
 catch(error){VZ.toast(error.code?error.message:'굿노트 파일을 읽지 못했어요: '+(error.message||error),'error');return;}
 document.querySelector('.toast')?.remove();
 const owner=window.vzipCloudUserId?.()||'',songs=()=>VZ.db.songs||[];
 const atoms=plan(model),single=atoms.length===1&&song;
 /* One row = one score. A row is one or more outline sections next to each other: the user can tick rows in order and
  * join them ("한 곡으로 합치기"), or split a joined row again. Sections whose titles repeat back to back (GoodNotes
  * names every page of a song the same) start out joined. */
 let n=0;
 const join=list=>{let page=0;const pages=list.flatMap(a=>a.pages).map(p=>({...p,number:++page}));
  return {key:'r'+(n++),atoms:list,title:list[0].title,from:list[0].from,to:list.at(-1).to,untitled:list.every(a=>a.untitled),pages,count:pages.reduce((k,p)=>k+p.strokes.length,0)};};
 const decorate=(item,{target,title}={})=>{
  if(title)item.title=title;
  // A title that names one of the songs goes there; a lone section started from a song's page goes to that song.
  const hit=matchSong(item.title,songs())||(single?song:null);
  item.duplicate=!!hit&&(hit.scores||[]).some(s=>!s.deleted&&s.source==='goodnotes'&&plain(s.title)===plain(item.title)&&s.pages===item.pages.length);
  item.target=target&&target!=='skip'?target:item.duplicate||item.untitled&&atoms.length>1?'skip':hit?hit.id:'new';
  item.state={id:'score-'+VZ.uid(),createdAt:Date.now(),receipt:null,pdf:null,done:false};
  return item;
 };
 const runs=[];for(const a of atoms){const last=runs.at(-1);if(last&&!a.untitled&&!last[0].untitled&&plain(a.title)&&plain(a.title)===plain(last[0].title))last.push(a);else runs.push([a]);}
 let items=runs.map(list=>decorate(join(list)));
 const total=atoms.reduce((k,i)=>k+i.count,0),notes=summary(model.report),run={busy:false,cancelled:false,finished:false},picked=new Set();
 /* One row per recording (an MR). choice: what the user picked in 넣을 곡 ('auto' until they do); target: what the
  * row shows and does now — a song id, 'score' (the new song its score row creates in this import) or 'skip'. */
 const mrs=(model.recordings||[]).map((rec,i)=>{const title=rec.title||'굿노트 녹음';
  return {key:'m'+i,rec,title,label:rec.title||'제목 없는 녹음',name:safeName(title)+'.m4a',choice:'auto',target:'skip',duplicate:false,state:{id:'mr-'+VZ.uid(),receipt:null,done:false}};});
 const songOf=id=>songs().find(s=>s.id===id)||null;
 /** The score row with the same title (track numbers aside): the MR goes where that score goes. */
 const linked=mr=>mr.rec.title?items.find(i=>!i.untitled&&sameTitle(i.title,mr.rec.title))||null:null;
 /** The song that already holds this recording from an earlier import (marked source 'goodnotes'; same recording, or same file name and size). */
 const stored=mr=>songs().find(s=>(s.mrTracks||[]).some(t=>!t.deleted&&t.kind==='file'&&t.source==='goodnotes'&&(t.sourceId===mr.rec.id||t.fileName===mr.name&&t.size===mr.rec.size)))||null;
 /** Where a recording goes when the user has not chosen: with its score; else the song its title names; else nowhere. */
 const follow=mr=>{
  const row=linked(mr);
  if(row&&row.target!=='skip')return row.target==='new'&&!row.state.done?'score':songOf(row.target)?row.target:'skip';
  return mr.rec.title?matchTitle(mr.rec.title,songs())?.id||'skip':'skip';
 };
 const settle=mr=>{if(mr.state.done)return;mr.duplicate=!!stored(mr);mr.target=mr.choice==='auto'?mr.duplicate?'skip':follow(mr):songOf(mr.choice)||mr.choice==='skip'?mr.choice:'skip';};
 /** At import time: the song itself (a score row imported a moment ago has its real song by now). */
 const destination=mr=>{
  if(mr.choice!=='auto'&&mr.choice!=='skip')return songOf(mr.choice);
  const row=linked(mr);
  if(row&&row.target!=='skip'&&row.target!=='new')return songOf(row.target);
  return mr.rec.title?matchTitle(mr.rec.title,songs()):null;
 };
 const mrOptions=mr=>'<option value="score" data-pick-always'+(mr.target==='score'?' selected':' disabled')+'>악보와 같은 새 곡</option>'+
  songs().map(s=>'<option value="'+esc(s.id)+'"'+(mr.target===s.id?' selected':'')+'>'+esc(VZ.songLabel?VZ.songLabel(s):s.title)+'</option>').join('')+
  '<option value="skip" data-pick-always'+(mr.target==='skip'?' selected':'')+'>가져오지 않기</option>';
 const mrHtml=mr=>{settle(mr);const done=mr.state.done,off=done?' disabled':'';
  return '<div class="gn-row gn-mr-row" data-gn-rec="'+mr.key+'"'+(done?' data-done="true"':'')+'>'+
  '<label class="gn-pick"><input type="checkbox" data-gn-pick'+(picked.has(mr.key)?' checked':'')+off+' aria-label="'+esc(mr.label)+' MR 선택"><span class="gn-box" aria-hidden="true"></span></label>'+
  '<div class="gn-main"><div class="gn-head"><strong class="gn-mr-title">'+esc(mr.label)+'</strong></div>'+
  '<p class="gn-meta" data-gn-info>길이 '+clock(mr.rec.seconds)+' · '+sizeLabel(mr.rec.size)+(done?' · 가져왔어요':'')+'</p>'+
  (mr.duplicate&&!done?'<p class="gn-note">이미 가져온 MR이에요</p>':'')+
  '<label class="gn-target"><span>넣을 곡</span><select data-gn-mrtarget data-pick="song" data-pick-title="넣을 곡" aria-label="'+esc(mr.label)+' MR 넣을 곡"'+off+'>'+mrOptions(mr)+'</select></label></div></div>';};
 const options=item=>'<option value="new" data-pick-always'+(item.target==='new'?' selected':'')+'>새 곡으로 추가</option>'+
  songs().map(s=>'<option value="'+esc(s.id)+'"'+(item.target===s.id?' selected':'')+'>'+esc(VZ.songLabel?VZ.songLabel(s):s.title)+'</option>').join('')+
  '<option value="skip" data-pick-always'+(item.target==='skip'?' selected':'')+'>가져오지 않기</option>';
 const inkLabel=item=>item.count?'필기 '+item.count+'획':'필기 없음';
 const pagesLabel=item=>item.from===item.to?item.from+'쪽':item.from+'–'+item.to+'쪽';
 /* One compact white card per score: tick · title (editable) · 나누기, then pages/ink, then 넣을 곡. */
 const rowHtml=(item,i)=>{const done=item.state.done,off=done?' disabled':'';
  return '<div class="gn-row" data-gn-section="'+item.key+'"'+(done?' data-done="true"':'')+'>'+
  '<label class="gn-pick"><input type="checkbox" data-gn-pick'+(picked.has(item.key)?' checked':'')+off+' aria-label="'+esc(item.title)+' 선택"><span class="gn-box" aria-hidden="true"></span></label>'+
  '<div class="gn-main"><div class="gn-head"><input type="text" class="gn-title" data-gn-title maxlength="120" value="'+esc(item.title)+'" aria-label="'+(i+1)+'번째 악보 제목"'+off+'>'+
  (item.atoms.length>1&&!done?'<button type="button" class="gn-split" data-gn-split aria-label="'+esc(item.title)+' 나누기">나누기</button>':'')+'</div>'+
  '<p class="gn-meta" data-gn-info>'+pagesLabel(item)+' · '+inkLabel(item)+(item.atoms.length>1?' · '+item.atoms.length+'개 합침':'')+(done?' · 가져왔어요':'')+'</p>'+
  (item.duplicate&&!done?'<p class="gn-note">이미 가져온 악보예요</p>':'')+
  '<label class="gn-target"><span>넣을 곡</span><select data-gn-target data-pick="song" data-pick-title="넣을 곡" aria-label="'+esc(item.title)+' 넣을 곡"'+off+'>'+options(item)+'</select></label></div></div>';};
 const meta=model.pages.length+'쪽 · '+(model.outline.length?atoms.filter(a=>!a.untitled).length+'곡':'개요 없음')+' · 필기 '+total.toLocaleString('ko-KR')+'획'+(mrs.length?' · 녹음 '+mrs.length+'개':'');
 VZ.sheet({title:'굿노트 가져오기',label:'굿노트 가져오기',
  body:'<form id="gn-import" class="gn-import">'+
   '<section class="gn-summary"><strong>'+esc(model.title||file.name)+'</strong><p data-gn-summary>'+esc(meta)+'</p>'+
   '<p>'+(model.outline.length?'곡을 골라 가져오거나, 한 곡이 여러 줄로 나뉘었으면 이어진 줄을 골라 합치세요.':'개요가 없어서 전체를 한 곡으로 가져와요. 굿노트에서 곡마다 개요를 넣으면 곡별로 나눠져요.')+'</p>'+
   notes.map(t=>'<p class="gn-warn">'+esc(t)+'</p>').join('')+
   '<details class="gn-diag" data-gn-diag><summary>진단 정보</summary>'+diagnosis(model,file).map(t=>'<p>'+esc(t)+'</p>').join('')+
    '<button type="button" class="btn sm secondary" data-gn-structure>진단 파일 저장</button><p>쪽 순서·지움 같은 구조 기록과, 스티커·글상자의 위치·크기만 담아요. 악보 PDF, 필기, 글상자에 쓴 글은 들어가지 않아요(노트·개요 제목은 들어가요).</p></details>'+
   '<p>파일은 이 기기에서만 읽고, '+(mrs.length?'곡별 PDF와 필기, 고른 MR 녹음만 올라가요.':'곡별 PDF와 필기만 올라가요.')+' 필기는 모두 수정할 수 있어요.</p></section>'+
   '<div class="gn-bar" data-gn-bar><button type="button" class="gn-all" data-gn-all aria-pressed="false"><span class="gn-box" aria-hidden="true"></span><span data-gn-alltext>전체 선택</span></button>'+
   '<span class="gn-count" data-gn-count></span><span class="gn-merge" data-gn-mergebar hidden><button type="button" class="gn-merge-btn" data-gn-merge>한 곡으로 합치기</button><span data-gn-mergehint></span></span></div>'+
   '<div class="gn-list" data-gn-list></div>'+
   '<section class="gn-mr" data-gn-mr aria-labelledby="gn-mr-title"'+(mrs.length?'':' hidden')+'><div class="gn-summary"><strong id="gn-mr-title">MR 녹음 '+mrs.length+'개</strong>'+
   '<p>굿노트에서 녹음한 파일이에요. 넣을 곡을 고르면 그 곡의 MR로 원본 그대로 들어가요.</p></div><div class="gn-list" data-gn-mrlist></div></section></form>',
  foot:'<p class="gn-msg" data-gn-msg role="status" aria-live="polite" hidden></p><button type="submit" form="gn-import" class="btn block" data-gn-go>가져오기</button>',
  onClose:()=>{run.cancelled=true;},
  onMount:(el,close)=>{
   const form=el.querySelector('form'),msg=el.querySelector('[data-gn-msg]'),go=el.querySelector('[data-gn-go]'),list=el.querySelector('[data-gn-list]');
   const bar=el.querySelector('[data-gn-mergebar]'),mergeButton=el.querySelector('[data-gn-merge]'),hint=el.querySelector('[data-gn-mergehint]'),all=el.querySelector('[data-gn-all]');
   const count=el.querySelector('[data-gn-count]'),allText=el.querySelector('[data-gn-alltext]');
   const mrList=el.querySelector('[data-gn-mrlist]');
   const structureButton=el.querySelector('[data-gn-structure]');
   if(structureButton)structureButton.onclick=async()=>{
    structureButton.disabled=true;
    try{
     const data=JSON.stringify(await G.structure(new Uint8Array(await file.arrayBuffer())));
     const out=new File([data],'goodnotes-structure.json',{type:'application/json'});
     if(navigator.canShare?.({files:[out]})&&navigator.share){try{await navigator.share({files:[out],title:'굿노트 진단 파일'});return;}catch(error){if(error?.name==='AbortError')return;}}
     const url=URL.createObjectURL(out),link=document.createElement('a');link.href=url;link.download=out.name;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
     VZ.toast('진단 파일을 저장했어요.');
    }catch(error){VZ.toast('진단 파일을 만들지 못했어요: '+(error.message||error),'error');}
    finally{structureButton.disabled=false;}
   };
   /** One line above the button: progress, results and errors stay in view however long the list is. */
   const say=(text,tone='')=>{msg.textContent=text||'';msg.hidden=!text;msg.dataset.tone=tone;};
   /* Progress popup over the page while importing: song n/total, its step, an overall bar and 멈추기. It blocks the page
    * (nothing on it can change mid-import) and, if the import stops or fails, says why until 확인. */
   el.insertAdjacentHTML('beforeend','<div class="gn-progress" data-gn-progress hidden><div class="gn-progress-card" role="alertdialog" aria-modal="true" aria-labelledby="gn-progress-title" aria-describedby="gn-progress-line">'+
    '<strong id="gn-progress-title" data-gn-ptitle>악보 가져오는 중</strong><p id="gn-progress-line" data-gn-pline aria-live="polite"></p>'+
    '<div class="gn-progress-bar" role="progressbar" aria-label="가져오기 진행" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-gn-pbar><span></span></div>'+
    '<p class="gn-progress-step" data-gn-pstep></p><button type="button" class="gn-progress-btn" data-gn-pbtn>멈추기</button></div></div>');
   const pop=el.querySelector('[data-gn-progress]'),popTitle=pop.querySelector('[data-gn-ptitle]'),popLine=pop.querySelector('[data-gn-pline]'),popBar=pop.querySelector('[data-gn-pbar]'),popStep=pop.querySelector('[data-gn-pstep]'),popButton=pop.querySelector('[data-gn-pbtn]');
   const progress={
    show(){pop.hidden=false;pop.dataset.state='busy';popTitle.textContent='악보 가져오는 중';popButton.textContent='멈추기';popButton.disabled=false;this.set('','',0);popButton.focus();},
    set(line,step,fraction){popLine.textContent=line;popStep.textContent=step;popStep.hidden=!step;const v=Math.round(Math.max(0,Math.min(1,fraction))*100);popBar.setAttribute('aria-valuenow',String(v));popBar.firstChild.style.width=v+'%';},
    end(title,text,state){pop.dataset.state=state;popTitle.textContent=title;popLine.textContent=text;popStep.hidden=true;popButton.textContent='확인';popButton.disabled=false;popButton.focus();},
    hide(){pop.hidden=true;}
   };
   popButton.onclick=()=>{
    if(pop.dataset.state!=='busy'){progress.hide();go.focus();return;}
    run.cancelled=true;popButton.disabled=true;popButton.textContent='지금 단계를 마치고 멈춰요';
   };
   const open=()=>items.filter(i=>!i.state.done),openMr=()=>mrs.filter(m=>!m.state.done);
   const rowOf=item=>list.querySelector('[data-gn-section="'+item.key+'"]'),mrRowOf=mr=>mrList.querySelector('[data-gn-rec="'+mr.key+'"]');
   /** "악보 27 · MR 12"; recordings alone "MR 12개"; scores alone keep the short "27곡". */
   const amount=(scores,mr)=>mr?scores?'악보 '+scores+' · MR '+mr:'MR '+mr+'개':scores+'곡';
   /** The ticked rows, if they sit next to each other and none is imported yet. */
   const selection=()=>{const at=items.map((item,i)=>picked.has(item.key)?i:-1).filter(i=>i>=0);
    return {at,ok:at.length>=2&&at.every((v,k)=>!k||v===at[k-1]+1)&&at.every(i=>!items[i].state.done)};};
   const read=()=>{for(const item of items){const row=rowOf(item);if(!row||item.state.done)continue;item.target=row.querySelector('[data-gn-target]').value;item.title=row.querySelector('[data-gn-title]').value.trim()||item.title;}};
   const sync=()=>{
    read();
    // Ticked rows decide what is imported; with nothing ticked, every row not set to 가져오지 않기 is.
    // A recording the user has not placed follows its score row (or the song its title names) as the rows above change.
    for(const mr of openMr()){
     settle(mr);const row=mrRowOf(mr),select=row?.querySelector('[data-gn-mrtarget]');if(!select)continue;
     select.querySelector('option[value="score"]').disabled=mr.target!=='score';
     if(select.value!==mr.target)select.value=mr.target;
    }
    const chosen=open().filter(i=>picked.has(i.key)).length,left=open().filter(i=>i.target!=='skip').length;
    const chosenMr=openMr().filter(m=>picked.has(m.key)).length,leftMr=openMr().filter(m=>m.target!=='skip').length;
    go.textContent=chosen||chosenMr?'선택한 '+amount(chosen,chosenMr)+' 가져오기':left||leftMr?'가져오기 ('+amount(left,leftMr)+')':mrs.length?'가져올 곡이나 MR을 골라 주세요':'가져올 곡을 골라 주세요';
    go.disabled=run.busy||!(chosen||chosenMr||left||leftMr);
    const sel=selection();bar.hidden=run.busy||sel.at.length<2;mergeButton.hidden=!sel.ok;mergeButton.disabled=!sel.ok;
    mergeButton.textContent='한 곡으로 합치기';hint.textContent=sel.ok?'':'이웃한 줄만 합칠 수 있어요';
    count.textContent=chosen||chosenMr?amount(chosen,chosenMr)+' 선택':'';
    const rows=open().length+openMr().length,every=rows>0&&open().every(i=>picked.has(i.key))&&openMr().every(m=>picked.has(m.key));
    all.setAttribute('aria-pressed',String(every));allText.textContent=every?'선택 해제':'전체 선택';all.disabled=run.busy||!rows;
    // A row set to 가져오지 않기 is dimmed unless it is ticked (a ticked row is imported anyway).
    for(const item of items){const row=rowOf(item);if(row)row.dataset.skip=String(item.target==='skip'&&!picked.has(item.key)&&!item.state.done);}
    for(const mr of mrs){const row=mrRowOf(mr);if(row)row.dataset.skip=String(mr.target==='skip'&&!picked.has(mr.key)&&!mr.state.done);}
   };
   const draw=()=>{list.innerHTML=items.map(rowHtml).join('');mrList.innerHTML=mrs.map(mrHtml).join('');sync();};
   const mrOf=node=>mrs.find(m=>m.key===node.closest('[data-gn-rec]')?.dataset.gnRec);
   // 넣을 곡 of a recording: the user's own choice from now on ("악보와 같은 새 곡" hands it back to following the score).
   // Both events, and before the form's handler: that one re-applies the followed target to rows still on 'auto'.
   for(const type of ['input','change'])mrList.addEventListener(type,event=>{
    const select=event.target.closest('[data-gn-mrtarget]'),box=event.target.closest('[data-gn-pick]'),mr=mrOf(event.target);if(!mr)return;
    if(select)mr.choice=select.value==='score'?'auto':select.value;
    if(box&&type==='change'){box.checked?picked.add(mr.key):picked.delete(mr.key);sync();}
   });
   list.addEventListener('change',event=>{const box=event.target.closest('[data-gn-pick]');if(!box)return;const key=box.closest('[data-gn-section]').dataset.gnSection;box.checked?picked.add(key):picked.delete(key);sync();});
   list.addEventListener('click',event=>{
    const button=event.target.closest('[data-gn-split]');if(!button||run.busy)return;read();
    const at=items.findIndex(item=>item.key===button.closest('[data-gn-section]').dataset.gnSection),item=items[at];
    items.splice(at,1,...item.atoms.map(a=>decorate(join([a]))));picked.clear();draw();
   });
   mergeButton.onclick=()=>{
    if(run.busy)return;read();const sel=selection();if(!sel.ok)return;
    const first=items[sel.at[0]],joined=decorate(join(sel.at.flatMap(i=>items[i].atoms)),{title:first.title,target:first.target});
    items.splice(sel.at[0],sel.at.length,joined);picked.clear();draw();
    say('“'+joined.title+'” '+pagesLabel(joined)+'을 한 악보로 합쳤어요.');
   };
   all.onclick=()=>{read();const rows=[...open(),...openMr()],every=rows.every(i=>picked.has(i.key));picked.clear();if(!every)for(const i of rows)picked.add(i.key);draw();};
   form.oninput=form.onchange=sync;draw();
   form.onsubmit=async event=>{
    event.preventDefault();if(run.busy)return;sync();
    const account=window.vzipCloudUserId?.()||'';
    if(!window.VzipR2?.enabled?.()||!account||!window.vzipCloudSignedIn?.()){say('올리려면 로그인과 클라우드 연결을 확인해 주세요.','error');return;}
    if(account!==owner){say('로그인 계정이 바뀌었어요. 창을 닫고 다시 열어 주세요.','error');return;}
    // halt: the whole import stops here (the user stopped it, or the account changed) — unlike one recording that fails.
    const guard=()=>{if(run.cancelled)throw Object.assign(Error('가져오기를 멈췄어요.'),{stopped:true,halt:true});if(window.vzipCloudUserId?.()!==owner||!window.vzipCloudSignedIn?.()||window.VzipAccountScope?.leaving)throw Object.assign(Error('로그인 계정이 바뀌어 멈췄어요.'),{halt:true});};
    run.busy=true;run.cancelled=false;go.disabled=true;for(const control of form.elements)control.disabled=true;
    // A ticked row is imported even if it was set to 가져오지 않기: it goes to its matching song, or a new one.
    const chosen=open().filter(i=>picked.has(i.key)),chosenMr=openMr().filter(m=>picked.has(m.key)),ticked=chosen.length+chosenMr.length;
    for(const item of chosen)if(item.target==='skip'){const hit=matchSong(item.title,songs())||(single?song:null);item.target=hit?hit.id:'new';}
    const todo=ticked?chosen:open().filter(i=>i.target!=='skip'),todoMr=ticked?chosenMr:openMr().filter(m=>m.target!=='skip'),result={scores:0,ink:0,mr:0},failed=[];
    const units=todo.length+todoMr.length,got=()=>[result.scores?'악보 '+result.scores+'개':'',result.mr?'MR '+result.mr+'개':''].filter(Boolean).join(' · ');
    picked.clear();bar.hidden=true;
    try{
     say('');progress.show();if(todo.length)progress.set('PDF 도구를 준비하고 있어요.','',0);
     const lib=todo.length?await library():null,sources=new Map();guard();
     for(const [n,item] of todo.entries()){
      // Overall bar: each song is an equal share; within a song, making the PDF ≈10%, uploading ≈85%, saving the rest.
      const step=(text,part)=>progress.set((n+1)+' / '+todo.length+'곡 · '+item.title,text,(n+part)/units);
      step('PDF 만드는 중',0);
      const ink=inkFile(item,item.state.id,item.state.createdAt),bad=ink.strokes.find(s=>!Ink.valid({...s,version:1,ownerId:owner,songId:'song',scoreId:item.state.id,r2Key:'u/'+owner+'/'+item.state.id+'/original.pdf',pdfHash:'0'.repeat(64)}));
      if(bad)throw Error('“'+item.title+'” '+bad.page+'쪽에 앱에서 다룰 수 없는 필기가 있어요. 필기를 빠뜨리지 않도록 가져오기를 멈췄어요.');
      item.state.pdf||=await buildPdf(item,model,lib,sources,ink);guard();
      const bytes=item.state.pdf;
      if(bytes.length>MAX_PDF)throw Error('“'+item.title+'” PDF가 50MB를 넘어요. 굿노트에서 나눠서 내보내 주세요.');
      const name=item.title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g,'_').slice(0,80)+'.pdf';
      item.state.receipt||=await window.VzipR2.upload(new File([bytes],name,{type:'application/pdf'}),{mediaId:item.state.id,type:'application/pdf',onProgress:p=>step('올리는 중 '+Math.round(p)+'%',.1+.85*Math.max(0,Math.min(100,p))/100)});
      guard();if(!item.state.receipt?.key)throw Error('업로드 결과를 확인하지 못했어요.');
      step('악보 등록 중',.95);
      const target=item.target==='new'?VZ.addSong(item.title):songs().find(s=>s.id===item.target);
      if(!target)throw Error('넣을 곡을 찾지 못했어요.');
      item.target=target.id;
      const entry={id:item.state.id,songId:target.id,title:item.title,originalKey:'',practiceKey:'',fileName:name,r2Key:item.state.receipt.key,size:bytes.length,pages:item.pages.length,source:'goodnotes',importedStrokes:ink.strokes.length,uploadedAt:Date.now(),updatedAt:Date.now()};
      if(!VZ.change(d=>{const s=d.songs.find(x=>x.id===target.id);if(!s)throw Error('곡을 찾을 수 없어요.');s.scores||=[];if(!s.scores.some(x=>x.id===entry.id))s.scores.push(entry);}))throw Error('목록에 저장하지 못했어요.');
      result.scores++;result.ink+=ink.strokes.length;
      item.state.done=true;item.state.pdf=null;
      const done=rowOf(item);if(done){done.dataset.done='true';done.querySelector('[data-gn-info]').textContent+=' · 가져왔어요';for(const control of done.querySelectorAll('input,select,button'))control.disabled=true;}
     }
     /* Recordings, after the scores (so a song created above exists). Each is read from the notebook only now and goes
      * to its song through the MR list's own upload path, unchanged. One that fails is named and the rest go on. */
     for(const [n,mr] of todoMr.entries()){
      guard();
      const step=(text,part)=>progress.set('MR '+(n+1)+' / '+todoMr.length+' · '+mr.label,text,(todo.length+n+part)/units);
      popTitle.textContent='MR 가져오는 중';step('녹음 파일 읽는 중',0);
      try{
       const target=destination(mr);
       if(!target)throw Error(linked(mr)?'악보를 먼저 가져오거나 넣을 곡을 골라 주세요.':'넣을 곡을 골라 주세요.');
       const bytes=await model.readFile(mr.rec.file);guard();
       if(!bytes||!bytes.length)throw Error('굿노트 파일 안에서 녹음 파일을 찾지 못했어요.');
       if(!isMp4(bytes))throw Error('M4A 오디오 파일이 아니라서 올리지 않았어요.');
       // The archive's bytes as they are: no decoding, no re-encoding.
       await VZ.songMR.addFile(target.id,new File([bytes],mr.name,{type:'audio/mp4'}),{title:mr.title,pending:mr.state,guard,source:'goodnotes',sourceId:mr.rec.id,
        onProgress:p=>step('올리는 중 '+Math.round(p)+'%',.05+.9*Math.max(0,Math.min(100,p))/100)});
       mr.state.done=true;mr.target=target.id;result.mr++;
       const done=mrRowOf(mr);if(done){done.dataset.done='true';done.querySelector('[data-gn-info]').textContent+=' · 가져왔어요';for(const control of done.querySelectorAll('input,select,button'))control.disabled=true;}
      }catch(error){
       if(error.halt||run.cancelled)throw error.halt?error:Object.assign(Error('가져오기를 멈췄어요.'),{stopped:true,halt:true});
       failed.push('“'+mr.label+'” ('+(error.message||String(error))+')');
      }
     }
     const about=got()?got()+'를 가져왔어요':'';
     if(failed.length){
      const why='MR '+failed.length+'개는 가져오지 못했어요: '+failed.join(', ')+'. '+(about?about+'. ':'')+'다시 누르면 남은 것만 다시 해요.';
      say(why,'error');progress.end('일부 MR을 가져오지 못했어요',why,'error');
     }else{
      // Only some rows were picked: keep the sheet open so the rest can still be imported.
      if(ticked&&open().length+openMr().length)say(about+'. 남은 '+(mrs.length?'것':'곡')+'도 골라서 가져올 수 있어요.','done');
      else{run.finished=true;close();}
      progress.hide();
     }
     if(about)VZ.toast(about+(result.ink?' · 수정 가능한 필기 '+result.ink+'획':'')+'.');
     if(about||!failed.length)onDone(result);
    }catch(error){
     const why=(error.message||String(error))+(result.mr?' 앞의 '+got()+'는 가져왔어요.':result.scores?' 앞의 '+result.scores+'곡은 가져왔어요.':'')+' 다시 누르면 이어서 해요.';
     say((error.stopped?'':'가져오지 못했어요: ')+why,error.stopped?'':'error');
     progress.end(error.stopped?'가져오기를 멈췄어요':'가져오지 못했어요',error.stopped?why.replace(/^가져오기를 멈췄어요\.\s*/,''):why,error.stopped?'stopped':'error');
     if(result.scores||result.mr)onDone(result);
    }finally{
     run.busy=false;
     if(!run.finished)draw();
    }
   };
  }});
};
VZ.goodnotesImport.plan=plan;VZ.goodnotesImport.buildPdf=buildPdf;VZ.goodnotesImport.inkFile=inkFile;VZ.goodnotesImport.library=library;
VZ.goodnotesImport.matchSong=matchSong;VZ.goodnotesImport.untrack=untrack;VZ.goodnotesImport.openSource=openSource;VZ.goodnotesImport.simplify=simplify;VZ.goodnotesImport.ATTACHMENT=ATTACHMENT;
})();
