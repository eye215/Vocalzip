/* GoodNotes notebook → scores. The notebook is read on this device (app/goodnotes-parse.js), cut into songs by its
 * outline, and each song becomes its own PDF score with the handwriting as separate, editable ink.
 * Only adds: new score PDFs, new score entries, new ink records (and a new song when the user chooses that).
 * Nothing existing is replaced; the .goodnotes file itself is never uploaded. */
(() => {
'use strict';
const VZ=window.VZ,G=window.VzipGoodnotes,Ink=window.VzipScoreInk;
if(!VZ||!G||!Ink)return;
const esc=VZ.esc,MAX_PDF=50*1024*1024;
/* Ink is kept twice on the device (the record list and an account recovery copy, both in localStorage), so a large
 * notebook must not be poured in whole. Past this budget a song's handwriting is drawn into its PDF instead:
 * still visible, not editable. */
const INK={chars:260000,strokes:900,recordLimit:4000,ledgerChars:Ink.MAX_BYTES/2};
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
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
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
const inkSize=strokes=>strokes.reduce((n,s)=>n+260+s.points.length*24,0);
function inkStore(owner){
 const scope=window.VzipAccountScope;
 const identity=()=>window.vzipCloudSignedIn?.()&&!scope?.leaving&&(!scope||scope.owner===owner)?{owner:window.vzipCloudUserId?.(),session:window.vzipCloudSessionId?.()||'legacy'}:null;
 return Ink.create({storage:scope?.storage||localStorage,identity,getData:()=>VZ.db,change:fn=>VZ.change(fn,{silent:true})});
}
/** How much editable ink this account can still take in this import. */
function inkBudget(owner){
 let used=0,records=0;
 try{const store=inkStore(owner),text=(window.VzipAccountScope?.storage||localStorage).getItem(store.key)||'';used=text.length;records=(VZ.db[Ink.COLLECTION]||[]).length;}catch{}
 return {chars:Math.max(0,Math.min(INK.chars,INK.ledgerChars-used-120000)),strokes:Math.max(0,Math.min(INK.strokes,INK.recordLimit-records-200))};
}
/** Sections with their ink simplified and a decision: editable ink, or drawn into the PDF when it does not fit. */
function plan(model,budget){
 let chars=budget.chars,strokes=budget.strokes;
 return model.sections.map((section,index)=>{
  const pages=section.pages.map((p,i)=>({source:model.pages[p],number:i+1,strokes:model.pages[p].strokes.map(s=>({...s,points:simplify(s.points)}))}));
  const count=pages.reduce((n,p)=>n+p.strokes.length,0),size=pages.reduce((n,p)=>n+inkSize(p.strokes),0);
  const editable=count>0&&count<=strokes&&size<=chars;
  if(editable){strokes-=count;chars-=size;}
  return {index,title:section.title,from:section.from,to:section.to,untitled:section.untitled,pages,count,mode:!count?'none':editable?'editable':'flatten'};
 });
}
/** Builds one song's PDF from its notebook pages; flattened ink is drawn on top when asked. */
async function buildPdf(item,model,lib,sources,flatten){
 const out=await lib.PDFDocument.create();let lost=0;
 for(const page of item.pages){
  const ref=page.source.pdf;let added;
  if(ref){
   if(!sources.has(ref.file)){const bytes=await model.readFile(ref.file);if(!bytes)throw Error('굿노트 파일 안의 PDF를 찾지 못했어요.');sources.set(ref.file,await lib.PDFDocument.load(bytes,{updateMetadata:false}));}
   const source=sources.get(ref.file);
   if(ref.page<1||ref.page>source.getPageCount())throw Error('굿노트 파일의 쪽 번호가 PDF와 맞지 않아요.');
   [added]=await out.copyPages(source,[ref.page-1]);out.addPage(added);
  }else added=out.addPage([page.source.width,page.source.height]);
  if(flatten&&page.strokes.length){
   const {width,height}=added.getSize(),box=added.getCropBox?.()||{x:0,y:0,width,height},turned=added.getRotation?.().angle||0;
   // Only a plain upright page maps 1:1; otherwise the marks would land in the wrong place, so they are left out and counted.
   if(turned%360!==0||Math.abs(box.width-width)>0.5||Math.abs(box.height-height)>0.5)throw Error('“'+item.title+'” 악보의 회전·자르기 영역 때문에 필기 위치를 보장할 수 없어요. 필기는 누락하지 않고 가져오기를 중단했어요.');
   for(const s of page.strokes){
    const d=s.points.map((p,i)=>(i?'L':'M')+(p[0]*width).toFixed(2)+' '+(p[1]*height).toFixed(2)).join(' ')+(s.points.length===1?' l0.01 0':'');
    const n=parseInt(s.color.slice(1),16);
    added.drawSvgPath(d,{x:box.x||0,y:(box.y||0)+height,borderColor:lib.rgb((n>>16&255)/255,(n>>8&255)/255,(n&255)/255),borderWidth:s.width*width,
     borderOpacity:s.opacity,borderLineCap:lib.LineCapStyle.Round,...(s.tool==='highlighter'&&lib.BlendMode?{blendMode:lib.BlendMode.Multiply}:{})});
   }
  }
 }
 return {bytes:await out.save(),lost};
}
const summary=report=>[
 report.unsupported?'알 수 없는 형식의 필기 '+report.unsupported+'개는 가져오지 않아요.':'',
 report.unmatchedNotes?'어느 쪽의 필기인지 확인하지 못한 묶음 '+report.unmatchedNotes+'개는 가져오지 않아요.':'',
 report.pagesWithoutPdf?'PDF가 아닌 쪽 '+report.pagesWithoutPdf+'장은 빈 쪽으로 들어가요.':''].filter(Boolean);

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
 const owner=window.vzipCloudUserId?.()||'',songs=()=>VZ.db.songs||[];
 const items=plan(model,inkBudget(owner));
 const single=items.length===1&&song;
 for(const item of items){
  // A title that names one of the songs goes there; a lone section started from a song's page goes to that song.
  const hit=matchSong(item.title,songs())||(single?song:null);
  item.duplicate=!!hit&&(hit.scores||[]).some(s=>!s.deleted&&s.source==='goodnotes'&&plain(s.title)===plain(item.title)&&s.pages===item.pages.length);
  item.target=item.duplicate||item.untitled&&items.length>1?'skip':hit?hit.id:'new';
  item.state={id:'score-'+VZ.uid(),receipt:null,pdf:null,done:false};
 }
 const total=items.reduce((n,i)=>n+i.count,0),notes=summary(model.report),run={busy:false,cancelled:false,finished:false};
 const options=item=>'<option value="new"'+(item.target==='new'?' selected':'')+'>새 곡으로 추가</option>'+
  songs().map(s=>'<option value="'+esc(s.id)+'"'+(item.target===s.id?' selected':'')+'>'+esc(VZ.songLabel?VZ.songLabel(s):s.title)+'</option>').join('')+
  '<option value="skip"'+(item.target==='skip'?' selected':'')+'>가져오지 않기</option>';
 const inkLabel=item=>item.mode==='none'?'필기 없음':item.mode==='editable'?'필기 '+item.count+'획 · 수정 가능':'필기 '+item.count+'획 · 수정 가능한 저장 공간 부족 (이 곡은 가져오기 보류)';
 VZ.sheet({title:'굿노트 가져오기',label:'굿노트 가져오기',
  body:'<form id="gn-import" class="stack"><p class="small muted" data-gn-summary>'+esc((model.title||file.name)+' · '+model.pages.length+'쪽 · '+(model.outline.length?'개요 '+model.outline.length+'개':'개요 없음')+' · 필기 '+total+'획')+'</p>'+
   (model.outline.length?'':'<p class="small muted">개요가 없어서 전체를 한 곡으로 가져와요. 굿노트에서 곡마다 개요를 넣으면 곡별로 나눠져요.</p>')+
   notes.map(n=>'<p class="small muted">'+esc(n)+'</p>').join('')+
   items.map(item=>'<fieldset class="field" data-gn-section="'+item.index+'" style="border:0;padding:12px;margin:0 0 12px;border-radius:16px;background:var(--vz-color-surface,#fff)">'+
    '<label class="field"><span>악보 제목</span><input type="text" data-gn-title maxlength="120" value="'+esc(item.title)+'" aria-label="'+(item.index+1)+'번째 악보 제목"></label>'+
    '<p class="small muted" style="margin:0 0 8px">'+(item.from===item.to?item.from+'쪽':item.from+'–'+item.to+'쪽')+' · '+inkLabel(item)+(item.duplicate?' · 이미 가져온 악보예요':'')+'</p>'+
    '<label class="field" style="margin:0"><span>넣을 곡</span><select data-gn-target aria-label="'+esc(item.title)+' 넣을 곡">'+options(item)+'</select></label></fieldset>').join('')+
   '<p class="small muted" data-gn-msg role="status" aria-live="polite">굿노트 파일은 이 기기에서만 읽어요. 곡별 PDF만 내 계정에 올라가요.</p></form>',
  foot:'<button type="submit" form="gn-import" class="btn block" data-gn-go>가져오기</button>',
  onClose:()=>{run.cancelled=true;},
  onMount:(el,close)=>{
   const form=el.querySelector('form'),msg=el.querySelector('[data-gn-msg]'),go=el.querySelector('[data-gn-go]');
   const rows=items.map(item=>({item,row:el.querySelector('[data-gn-section="'+item.index+'"]')}));
   const sync=()=>{
    for(const {item,row} of rows){item.target=row.querySelector('[data-gn-target]').value;item.title=row.querySelector('[data-gn-title]').value.trim()||item.title;}
    const n=items.filter(i=>i.target!=='skip'&&!i.state.done).length;go.textContent=n?'가져오기 ('+n+'곡)':'가져올 곡을 골라 주세요';go.disabled=run.busy||!n;
   };
   form.oninput=form.onchange=sync;sync();
   form.onsubmit=async event=>{
    event.preventDefault();if(run.busy)return;sync();
    const account=window.vzipCloudUserId?.()||'';
    if(!window.VzipR2?.enabled?.()||!account||!window.vzipCloudSignedIn?.()){msg.textContent='올리려면 로그인과 클라우드 연결을 확인해 주세요.';return;}
    if(account!==owner){msg.textContent='로그인 계정이 바뀌었어요. 창을 닫고 다시 열어 주세요.';return;}
    const guard=()=>{if(run.cancelled)throw Object.assign(Error('가져오기를 멈췄어요.'),{stopped:true});if(window.vzipCloudUserId?.()!==owner||!window.vzipCloudSignedIn?.()||window.VzipAccountScope?.leaving)throw Error('로그인 계정이 바뀌어 멈췄어요.');};
    run.busy=true;go.disabled=true;for(const control of form.elements)control.disabled=true;
    const todo=items.filter(i=>i.target!=='skip'&&!i.state.done),result={scores:0,ink:0,flattened:0,lost:0};
    if(todo.some(i=>i.mode==='flatten')){msg.textContent='필기가 많은 곡은 현재 저장 공간 한도로 인해 수정 가능한 상태로 옮길 수 없어요. 필기를 PDF에 합치거나 누락하지 않도록 가져오기를 보류했어요. 해당 곡을 제외하거나 저장 구조 개선 후 다시 시도해 주세요.';run.busy=false;for(const control of form.elements)control.disabled=false;sync();return;}
    try{
     msg.textContent='PDF 도구를 준비하고 있어요.';
     const lib=await library(),sources=new Map(),store=inkStore(owner);guard();
     for(const [n,item] of todo.entries()){
      const step=text=>{msg.textContent=(n+1)+'/'+todo.length+' '+item.title+' · '+text;};
      step('PDF 만드는 중');
      item.state.pdf||=await buildPdf(item,model,lib,sources,item.mode==='flatten');guard();
      const {bytes,lost}=item.state.pdf;
      if(bytes.length>MAX_PDF)throw Error('“'+item.title+'” PDF가 50MB를 넘어요. 굿노트에서 나눠서 내보내 주세요.');
      const name=item.title.replace(/[\\/:*?"<>|\u0000-\u001f]+/g,'_').slice(0,80)+'.pdf';
      item.state.receipt||=await window.VzipR2.upload(new File([bytes],name,{type:'application/pdf'}),{mediaId:item.state.id,type:'application/pdf',onProgress:p=>step('올리는 중 '+Math.round(p)+'%')});
      guard();if(!item.state.receipt?.key)throw Error('업로드 결과를 확인하지 못했어요.');
      step('악보 등록 중');
      const target=item.target==='new'?VZ.addSong(item.title):songs().find(s=>s.id===item.target);
      if(!target)throw Error('넣을 곡을 찾지 못했어요.');
      item.target=target.id;
      const entry={id:item.state.id,songId:target.id,title:item.title,originalKey:'',practiceKey:'',fileName:name,r2Key:item.state.receipt.key,size:bytes.length,pages:item.pages.length,source:'goodnotes',uploadedAt:Date.now(),updatedAt:Date.now()};
      if(!VZ.change(d=>{const s=d.songs.find(x=>x.id===target.id);if(!s)throw Error('곡을 찾을 수 없어요.');s.scores||=[];if(!s.scores.some(x=>x.id===entry.id))s.scores.push(entry);}))throw Error('목록에 저장하지 못했어요.');
      result.scores++;result.lost+=lost;
      if(item.mode==='flatten')result.flattened+=item.count-lost;
      if(item.mode==='editable'){
       step('필기 옮기는 중');
       const pdfHash=await digest(bytes),now=Date.now();guard();let order=0;
       const records=item.pages.flatMap(page=>page.strokes.map(s=>({version:1,id:'gn-'+VZ.uid(),ownerId:owner,songId:target.id,scoreId:entry.id,r2Key:entry.r2Key,pdfHash,page:page.number,
        tool:s.tool,color:s.color,opacity:s.opacity,width:s.width,points:s.points,createdAt:now+order++}))).filter(Ink.valid);
       let saved=0;
       try{for(let at=0;at<records.length;at+=150){const part=records.slice(at,at+150);if(!store.commit({add:part}))throw Error('필기를 저장하지 못했어요.');saved+=part.length;guard();}}
       catch(error){result.ink+=saved;throw Error('“'+item.title+'” 필기 '+saved+'/'+records.length+'획 저장 후 중단했어요: '+(error.message||error)+'. 원본은 유지됐고 다시 누르면 남은 필기를 이어서 시도해요.');}
       result.ink+=saved;result.lost+=item.count-saved;
      }
      item.state.done=true;item.state.pdf=null;
      rows.find(r=>r.item===item).row.querySelector('p').textContent+=' · 가져왔어요';
     }
     run.finished=true;close();
     VZ.toast('악보 '+result.scores+'개를 가져왔어요'+(result.ink?' · 수정 가능한 필기 '+result.ink+'획':'')+(result.flattened?' · 악보에 합친 필기 '+result.flattened+'획':'')+(result.lost?' · 가져오지 못한 필기 '+result.lost+'획':'')+'.');
     onDone(result);
    }catch(error){
     msg.textContent=(error.stopped?'':'가져오지 못했어요: ')+(error.message||error)+(result.scores?' · 앞의 '+result.scores+'개는 가져왔어요.':'')+' 다시 누르면 이어서 해요.';
     if(result.scores)onDone(result);
    }finally{
     run.busy=false;
     if(!run.finished){for(const control of form.elements)control.disabled=false;for(const {item,row} of rows)if(item.state.done)for(const control of row.querySelectorAll('input,select'))control.disabled=true;sync();}
    }
   };
  }});
};
VZ.goodnotesImport.plan=plan;VZ.goodnotesImport.buildPdf=buildPdf;VZ.goodnotesImport.library=library;VZ.goodnotesImport.matchSong=matchSong;VZ.goodnotesImport.simplify=simplify;
})();
