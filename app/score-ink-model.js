/* Private, immutable PDF strokes. No original PDF bytes, signed URLs or account tokens.
 *
 * Records in one list (root.scoreAnnotations, the device recovery copy, and an imported PDF's vocalzip-ink.json).
 * Every record: version 1, id, ownerId, songId, scoreId, r2Key, pdfHash, page (1-based), color '#rrggbb', createdAt.
 * A record is never changed in place: an edit removes it and adds a copy with a new id.
 *
 * Stroke   tool 'pen' | 'highlighter', width (of page width, 0.001–0.06), opacity (optional, 0.05–1),
 *          points [[x, y, pressure], …] with x of page width and y of page height (0–1),
 *          note (optional): link key of the memo it was written on — it moves and is deleted with that memo.
 * Memo     tool 'note' (스티커 메모), rect [x, y, w, h] in the same units (x, w of page width; y, h of page height;
 *          inside the page), mode 'text' | 'pen' (what tapping it does: type/Scribble, or write with the pen),
 *          text (optional string, at most NOTE_TEXT_MAX; drawn wrapped inside the memo, NOTE_FONT of page width),
 *          note (optional): its link key. A memo without it is linked by its id; a moved/edited copy keeps the key.
 *          An importer writes {tool:'note', id, color, rect, mode:'pen'} and strokes carrying note:<that id>.
 * Mark     악보 표기 (숨표·반복·컷·시작점 and the user's own): an ordinary stroke whose points were laid out from the
 *          marker preset when it was placed (markStroke), so it keeps its own look whatever the preset becomes later.
 *          mark (optional): what it is — 'breath' | 'repeat' | 'cut' | 'start', or the id of a user preset. A mark is
 *          told apart by this, never by how it looks. Marks placed before 2026-11-14 have no `mark`.
 *          glyph (optional, with size): 1–4 characters drawn centred on the single point instead of the line;
 *          size is the letter height of page width (GLYPH_MIN–GLYPH_MAX), width its extra boldness.
 * Clients older than memos skip records they do not know when listing (valid() is false), so they neither show nor
 * remove a memo; strokes carrying `note` or `mark` are ordinary strokes to them (a glyph mark is a dot there). */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipScoreInk=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const COLLECTION='scoreAnnotations',PREFIX='vzip_score_ink_v1:',MAX_BYTES=2*1024*1024,MAX_POINTS=2048;
const clone=x=>JSON.parse(JSON.stringify(x)),fail=(message,code)=>Object.assign(Error(message),{code});
const unit=n=>Number.isFinite(n)&&n>=0&&n<=1;
const validId=x=>typeof x==='string'&&x.length>0&&x.length<=200;
/* 스티커 메모. Sizes are fractions of the page width unless a rect says otherwise. */
const NOTE_TEXT_MAX=2000,NOTE_MIN=0.02,NOTE_SIZE=0.235,NOTE_SMALLEST=0.1,NOTE_FONT=0.026,NOTE_LINE=1.35,NOTE_PAD=0.012,NOTE_RADIUS=0.006,NOTE_INK='#101828';
const NOTE_FAMILY='Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif';
const NOTE_COLORS=[['#fbe88c','노랑'],['#fbcfe0','분홍'],['#c9ecc9','초록'],['#cfe3fb','파랑']];
const isNote=s=>s?.tool==='note';
/* 악보 표기. MARK_UNIT: half the size of a 기호 (of page width). */
const MARK_UNIT=0.018,MARK_OPACITY=0.25,GLYPH_SIZE=0.04,GLYPH_MIN=0.01,GLYPH_MAX=0.2,GLYPH_CHARS=4;
const glyphChars=t=>typeof t==='string'?[...t]:[];
const validGlyph=s=>{const n=glyphChars(s.glyph).length;return n>=1&&n<=GLYPH_CHARS&&!/\s/.test(s.glyph)&&Number.isFinite(s.size)&&s.size>=GLYPH_MIN&&s.size<=GLYPH_MAX&&s.points?.length===1;};
/** Half the room a stroke takes around its points, across and down, of page width. */
function reach(s){
 if(!s.glyph)return [s.width/2,s.width/2];
 return [Math.max(s.width/2,s.size*Math.max(.5,glyphChars(s.glyph).length*.45)),Math.max(s.width/2,s.size*.55)];
}
function validNote(s){
 const r=s.rect;
 return Array.isArray(r)&&r.length===4&&r.every(Number.isFinite)&&r[0]>=0&&r[1]>=0&&r[2]>=NOTE_MIN&&r[3]>=NOTE_MIN&&r[0]+r[2]<=1.00001&&r[1]+r[3]<=1.00001&&
  ['text','pen'].includes(s.mode)&&(s.text===undefined||typeof s.text==='string'&&s.text.length<=NOTE_TEXT_MAX);
}
function valid(s){
 return s?.version===1&&validId(s.id)&&validId(s.ownerId)&&validId(s.songId)&&validId(s.scoreId)&&
  typeof s.r2Key==='string'&&s.r2Key.startsWith('u/'+s.ownerId+'/'+s.scoreId+'/')&&!s.r2Key.includes('..')&&s.r2Key.length<=300&&
  /^[0-9a-f]{64}$/.test(s.pdfHash||'')&&Number.isInteger(s.page)&&s.page>=1&&s.page<=2000&&
  /^#[0-9a-f]{6}$/i.test(s.color||'')&&(s.note===undefined||validId(s.note))&&Number.isFinite(s.createdAt)&&s.createdAt>0&&
  (isNote(s)?validNote(s):
  ['pen','highlighter'].includes(s.tool)&&Number.isFinite(s.width)&&s.width>=0.001&&s.width<=0.06&&
  (s.opacity===undefined||Number.isFinite(s.opacity)&&s.opacity>=0.05&&s.opacity<=1)&&
  Array.isArray(s.points)&&s.points.length>=1&&s.points.length<=MAX_POINTS&&s.points.every(p=>Array.isArray(p)&&p.length===3&&p.every(unit))&&
  (s.mark===undefined||validId(s.mark))&&(s.glyph===undefined?s.size===undefined:validGlyph(s)));
}
const FIELDS=['version','id','ownerId','songId','scoreId','r2Key','pdfHash','page','tool','color','width','opacity','points','createdAt','note','rect','mode','text','mark','glyph','size'];
const same=(a,b)=>JSON.stringify(FIELDS.map(k=>a[k]))===JSON.stringify(FIELDS.map(k=>b[k]));
const opacity=s=>isNote(s)?1:s.opacity===undefined?(s.tool==='highlighter'?0.28:1):s.opacity;
const round=n=>Math.round(n*100000)/100000;
/** The key strokes written on a memo carry in `note`. */
const noteKey=s=>s.note||s.id;
/** Topmost memo under a point (page-normalised), or undefined. */
function noteAt(rows,p){return rows.filter(isNote).reverse().find(s=>p[0]>=s.rect[0]&&p[0]<=s.rect[0]+s.rect[2]&&p[1]>=s.rect[1]&&p[1]<=s.rect[1]+s.rect[3]);}
/** Strokes on the memo's page that were written on it. Empty when another memo there shares the key (two devices
 *  edited the same memo), so removing one copy never takes the handwriting with it. */
function linked(rows,memo){
 const key=noteKey(memo);
 if(rows.some(s=>isNote(s)&&s.id!==memo.id&&s.page===memo.page&&noteKey(s)===key))return [];
 return rows.filter(s=>!isNote(s)&&s.page===memo.page&&s.note===key);
}
/** A memo rect kept inside the page and no smaller than NOTE_SMALLEST of the page width each way. */
function noteRect(x,y,w,h,aspect=1){
 const minH=Math.max(NOTE_MIN,Math.min(1,NOTE_SMALLEST/aspect));
 w=Math.max(NOTE_SMALLEST,Math.min(1,w));h=Math.max(minH,Math.min(1,h));
 x=Math.max(0,Math.min(1-w,x));y=Math.max(0,Math.min(1-h,y));
 x=round(x);y=round(y);return [x,y,Math.min(round(w),round(1-x)),Math.min(round(h),round(1-y))];
}
/** Memo text broken into lines no wider than `width`; measure(text) returns a width in the same unit. Breaks at
 *  spaces where it can, anywhere otherwise (Korean). Used by the viewer and the PDF export, so both wrap alike. */
function noteLines(text,width,measure,limit=200){
 const out=[];
 for(const part of String(text||'').split('\n')){
  let line='';
  for(const ch of part){
   if(!line||measure(line+ch)<=width){line+=ch;continue;}
   const cut=ch===' '?-1:line.lastIndexOf(' ');
   if(cut>0&&/[!-~]/.test(ch)){out.push(line.slice(0,cut));line=line.slice(cut+1)+ch;}
   else{out.push(line);line=ch===' '?'':ch;}
   if(out.length>=limit)return out;
  }
  out.push(line);if(out.length>=limit)return out;
 }
 return out;
}
function scope(s,b){return s.songId===b.songId&&s.scoreId===b.scoreId&&s.r2Key===b.r2Key&&s.pdfHash===b.pdfHash&&s.ownerId===b.ownerId;}
function point(x,y,pressure=0.5){return [x,y,pressure].map(n=>Math.round(Math.max(0,Math.min(1,Number.isFinite(n)?n:0.5))*100000)/100000);}
/** Where a memo and its text go on a page W wide and H high (any unit). `ctx` is a 2D canvas context used only to
 *  measure, always at one reference size, so the viewer and the PDF export break lines at the same places. */
function noteLayout(n,W,H,ctx){
 const x=n.rect[0]*W,y=n.rect[1]*H,w=n.rect[2]*W,h=n.rect[3]*H,pad=NOTE_PAD*W,size=NOTE_FONT*W,step=size*NOTE_LINE,lines=[];
 if(n.text&&ctx){
  ctx.font='400 100px '+NOTE_FAMILY;
  const all=noteLines(n.text,Math.max(size,w-2*pad),t=>ctx.measureText(t).width*size/100,Math.ceil(h/step)+1);
  all.forEach((text,i)=>{if(pad+i*step<h&&text)lines.push({text,x:x+pad,y:y+pad+size*.82+i*step});});
 }
 return {x,y,w,h,radius:NOTE_RADIUS*W,size,lines};
}
function hit(s,p,aspect=1,radius=0.018){
 if(isNote(s))return false; // the eraser and the stroke selection never take a memo's background
 const x=p[0],y=p[1]*aspect,r=Math.max(s.width/2,radius),pts=s.points;
 if(s.glyph){const [rx,ry]=reach(s);return Math.abs(x-pts[0][0])<=Math.max(rx,radius)&&Math.abs(y-pts[0][1]*aspect)<=Math.max(ry,radius);}
 const dist=(a,b)=>{
  const ax=a[0],ay=a[1]*aspect,bx=b[0],by=b[1]*aspect,dx=bx-ax,dy=by-ay,den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/den)):0;
  return Math.hypot(x-ax-t*dx,y-ay-t*dy);
 };
 return pts.some((q,i)=>dist(q,pts[Math.max(0,i-1)])<=r);
}
function path(s,aspect=1){
 const pts=s.points.map(p=>[p[0]*1000,p[1]*aspect*1000]);
 return pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(2)+' '+p[1].toFixed(2)).join(' ')+(pts.length===1?' l0.01 0':'');
}
// Page-normalized geometry; stroke thickness is measured against page width.
function bounds(rows,aspect=1){
 if(!rows.length||!Number.isFinite(aspect)||aspect<=0)return null;
 let x=Infinity,y=Infinity,right=-Infinity,bottom=-Infinity;
 for(const s of rows)if(isNote(s)){x=Math.min(x,s.rect[0]);y=Math.min(y,s.rect[1]);right=Math.max(right,s.rect[0]+s.rect[2]);bottom=Math.max(bottom,s.rect[1]+s.rect[3]);}
 else{const [rx,ry]=reach(s);for(const p of s.points){x=Math.min(x,p[0]-rx);right=Math.max(right,p[0]+rx);y=Math.min(y,p[1]-ry/aspect);bottom=Math.max(bottom,p[1]+ry/aspect);}}
 return {x,y,w:right-x,h:bottom-y};
}
function inRect(rows,rect,aspect=1){
 const x=Math.min(rect.x,rect.x+rect.w),y=Math.min(rect.y,rect.y+rect.h),right=Math.max(rect.x,rect.x+rect.w),bottom=Math.max(rect.y,rect.y+rect.h);
 return rows.filter(s=>{
  if(isNote(s))return false;
  const [rx,ry]=reach(s),left=x-rx,top=y-ry/aspect,w=right-x+2*rx,h=bottom-y+2*ry/aspect;
  return s.points.some((b,i)=>{
   const a=s.points[Math.max(0,i-1)],dx=b[0]-a[0],dy=b[1]-a[1];let lo=0,hi=1;
   for(const [p,q]of [[-dx,a[0]-left],[dx,left+w-a[0]],[-dy,a[1]-top],[dy,top+h-a[1]]]){
    if(!p){if(q<0)return false;continue;}const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return false;
   }
   return true;
  });
 });
}
function transform(rows,{dx=0,dy=0,scale=1}={},aspect=1){
 if(!rows.length||!rows.every(valid)||![dx,dy,scale,aspect].every(Number.isFinite)||scale<=0||aspect<=0)throw fail('선택한 필기 범위를 확인해 주세요.','geometry');
 const b=bounds(rows,aspect),min=Math.max(...rows.map(s=>isNote(s)?NOTE_MIN/Math.min(s.rect[2],s.rect[3]):Math.max(.001/s.width,s.glyph?GLYPH_MIN/s.size:0))),max=Math.min(1/b.w,1/b.h,...rows.map(s=>isNote(s)?Infinity:Math.min(.06/s.width,s.glyph?GLYPH_MAX/s.size:Infinity)));
 if(max<min)throw fail('이 필기는 더 줄일 수 없어요.','geometry');
 const k=Math.max(min,Math.min(max,scale)),x=Math.max(0,Math.min(1-b.w*k,b.x+dx)),y=Math.max(0,Math.min(1-b.h*k,b.y+dy));
 return rows.map(s=>{
  if(!isNote(s))return {...clone(s),width:Math.max(.001,Math.min(.06,s.width*k)),...(s.glyph?{size:Math.max(GLYPH_MIN,Math.min(GLYPH_MAX,round(s.size*k)))}:{}),points:s.points.map(p=>[point(x+(p[0]-b.x)*k,0)[0],point(0,y+(p[1]-b.y)*k)[1],p[2]])};
  const left=round(x+(s.rect[0]-b.x)*k),top=round(y+(s.rect[1]-b.y)*k);
  return {...clone(s),rect:[left,top,Math.min(round(s.rect[2]*k),round(1-left)),Math.min(round(s.rect[3]*k),round(1-top))]};
 });
}
/* 기호 shapes as one line through these corners, in MARK_UNIT around the pressed point (y down). */
const MARK_SHAPES={
 check:[[-.9,.05],[-.3,.8],[.95,-.8]],
 comma:[[.2,-.9],[.335,-.6],[.372,-.3],[.312,0],[.155,.3],[-.1,.6],[-.45,.9]],
 triangle:[[-.95,-.8],[.95,-.8],[0,.85],[-.95,-.8]],
 star:Array.from({length:11},(_,i)=>{const t=-Math.PI/2+i*Math.PI/5,r=i%2?.42:1;return [r*Math.cos(t),r*Math.sin(t)];}),
 diamond:[[0,-1],[.72,0],[0,1],[-.72,0],[0,-1]]
};
/** What a marker preset leaves on the page, as the fields of a stroke record: tool, color, opacity, width, points
 *  (and glyph + size for typed characters). look = {form, shape, text, color, width, type}; a is where the press
 *  began (the first tap of a 구간 괄호), b where it ended (the second tap) or null for a plain tap.
 *  form 'symbol' (shape v | comma | check | circle | dot | triangle | star | diamond | text) is one point,
 *  'line' | 'wave' | 'box' | 'cover' follow a drag from a to b, 'bracket' spans two taps. */
function markStroke(look,a,b,aspect=1){
 const k=Number.isFinite(aspect)&&aspect>0?aspect:1,at=(x,y)=>point(a[0]+x,a[1]+y/k),pen=look.type!=='highlighter';
 const out={tool:pen?'pen':'highlighter',color:look.color,opacity:pen?1:MARK_OPACITY,width:look.width};
 const form=look.form,shape=look.shape;
 if(form==='bracket'){
  const e=b||[a[0]+.09,a[1]],h=.023/k;
  out.points=[point(a[0],a[1]-h),point(a[0],a[1]+h),point(e[0],e[1]+h),point(e[0],e[1]-h)];
 }else if(form==='box'){
  const e=b||[a[0]+.09,a[1]+.05/k];
  out.points=[point(a[0],a[1]),point(e[0],a[1]),point(e[0],e[1]),point(a[0],e[1]),point(a[0],a[1])];
 }else if(form==='wave'){
  const e=b||[a[0]+.09,a[1]],dx=e[0]-a[0],dy=(e[1]-a[1])*k,length=Math.hypot(dx,dy)||.0001,waves=Math.max(1,Math.round(length/.03)),steps=Math.min(480,waves*8),rise=.007;
  out.points=Array.from({length:steps+1},(_,i)=>{const t=i/steps,off=rise*Math.sin(t*waves*2*Math.PI);return point(a[0]+dx*t-dy/length*off,a[1]+(dy*t+dx/length*off)/k);});
 }else if(form==='line'||form==='cover'){
  out.points=[point(a[0],a[1]),b?point(b[0],b[1]):at(.07,0)];
 }else if(shape==='text'){
  out.points=[at(0,0)];out.glyph=glyphChars(look.text).slice(0,GLYPH_CHARS).join('');out.size=GLYPH_SIZE;
 }else if(shape==='dot'){
  out.points=[at(0,0)];out.width=Math.max(.012,Math.min(.06,look.width*4));
 }else if(shape==='circle'){
  out.points=Array.from({length:21},(_,i)=>{const t=i/20*Math.PI*2;return at(MARK_UNIT*Math.cos(t),MARK_UNIT*Math.sin(t));});
 }else if(MARK_SHAPES[shape]){
  out.points=MARK_SHAPES[shape].map(([x,y])=>at(x*MARK_UNIT,y*MARK_UNIT));
 }else out.points=[at(-.016,-.017),at(0,.017),at(.016,-.017)]; // 'v', the breath mark
 return out;
}
/** Where a glyph mark's characters go on a page W wide and H high: centre x, baseline y, letter size and the extra
 *  outline that makes them bolder. The viewer (SVG) and the PDF export (canvas) both draw from this. */
function glyphLayout(s,W,H){
 const size=s.size*W;
 return {text:s.glyph,x:s.points[0][0]*W,y:s.points[0][1]*H+size*.36,size,bold:Math.min(size*.12,s.width*W*.25)};
}
function create({storage,identity,getData,change}){
 const start=identity(),owner=start?.owner,session=start?.session;
 if(!owner||!session)throw fail('필기하려면 로그인해 주세요.','identity');
 const key=PREFIX+encodeURIComponent(owner),current=()=>{const now=identity();if(now?.owner!==owner||now?.session!==session)throw fail('로그인이 바뀌어 필기를 중단했어요.','identity');};
 function read(){
  current();const text=storage.getItem(key);if(text===null)return {version:1,owner,records:[],deleted:[]};
  if(text.length*2>MAX_BYTES)throw fail('필기 보관 공간 한도를 확인해 주세요.','capacity');
  let out;try{out=JSON.parse(text);}catch{throw fail('필기 복구 기록을 확인해야 해요. 기존 기록은 보존했어요.','corrupt');}
  if(out?.version!==1||out.owner!==owner||!Array.isArray(out.records)||!Array.isArray(out.deleted)||!out.deleted.every(validId)||
   out.records.length>4000||!out.records.every(s=>valid(s)&&s.ownerId===owner)||new Set(out.records.map(s=>s.id)).size!==out.records.length)
   throw fail('필기 복구 기록 형식이 달라요. 기존 기록은 보존했어요.','corrupt');
  return out;
 }
 function data(){
  current();const d=getData();
  if(d[COLLECTION]!==undefined&&!Array.isArray(d[COLLECTION])||d.deleted?.[COLLECTION]!==undefined&&!Array.isArray(d.deleted[COLLECTION]))
   throw fail('저장된 필기 형식을 확인해야 해요.','corrupt');
  return d;
 }
 function exists(d,s){return d.songs?.some(song=>song.id===s.songId&&song.scores?.some(score=>score.id===s.scoreId&&!score.deleted&&score.r2Key===s.r2Key));}
 function put(ledger){
  current();const text=JSON.stringify(ledger);if(text.length*2>MAX_BYTES||ledger.records.length>4000||ledger.deleted.length>10000)throw fail('필기 보관 공간이 가득 찼어요. 기존 필기는 유지돼요.','capacity');
  storage.setItem(key,text);current();
 }
 function restore(){
  const d=data(),ledger=read(),rows=d[COLLECTION]||[],gone=new Set([...(d.deleted?.[COLLECTION]||[]),...ledger.deleted]);
  const retained=ledger.records.filter(s=>!gone.has(s.id));
  if(retained.length!==ledger.records.length)put({...ledger,records:retained,deleted:[...gone]});
  const additions=retained.filter(s=>!gone.has(s.id)&&exists(d,s)&&!rows.some(r=>r.id===s.id));
  const remove=rows.filter(s=>s.ownerId===owner&&gone.has(s.id)).map(s=>s.id);
  const freshGone=ledger.deleted.filter(id=>!(d.deleted?.[COLLECTION]||[]).includes(id));
  if(!additions.length&&!remove.length&&!freshGone.length)return true;
  current();return change(next=>{
   const dead=new Set([...(next.deleted?.[COLLECTION]||[]),...ledger.deleted]);
   next[COLLECTION]=(next[COLLECTION]||[]).filter(s=>s.ownerId!==owner||!dead.has(s.id));
   for(const s of additions)if(!dead.has(s.id)&&exists(next,s)&&!next[COLLECTION].some(r=>r.id===s.id))next[COLLECTION].push(clone(s));
   next.deleted||={};next.deleted[COLLECTION]=[...dead];
  });
 }
 function list(binding,page){
  const d=data(),ledger=read(),gone=new Set([...(d.deleted?.[COLLECTION]||[]),...ledger.deleted]),map=new Map();
  for(const s of [...ledger.records,...(d[COLLECTION]||[])])if(valid(s)&&s.ownerId===owner&&!gone.has(s.id)&&scope(s,binding)&&(!page||s.page===page))map.set(s.id,s);
  return [...map.values()].sort((a,b)=>a.createdAt-b.createdAt||a.id.localeCompare(b.id)).map(clone);
 }
 function commit({add=[],remove=[]}={},mutate){
  current();const d=data(),ledger=read(),rows=d[COLLECTION]||[],gone=new Set([...(d.deleted?.[COLLECTION]||[]),...ledger.deleted]);
  if(!Array.isArray(add)||!Array.isArray(remove)||add.some(s=>!valid(s)||s.ownerId!==owner||gone.has(s.id)||!exists(d,s)))throw fail('현재 악보의 필기인지 확인해 주세요.','binding');
  for(const id of remove){if(!validId(id)||[...rows,...ledger.records].some(s=>s.id===id&&s.ownerId!==owner))throw fail('다른 사용자의 필기는 수정할 수 없어요.','identity');gone.add(id);}
  const map=new Map(ledger.records.map(s=>[s.id,s]));
  for(const s of add){
   const old=rows.find(r=>r.id===s.id)||map.get(s.id);
   if(old&&!same(old,s))throw fail('같은 필기 ID의 다른 내용은 덮어쓰지 않아요.','conflict');
   map.set(s.id,clone(s));
  }
  // Account-scoped recovery copy is durable before updating the shared root.
  put({version:1,owner,records:[...map.values()].filter(s=>!gone.has(s.id)),deleted:[...gone]});
  const saved=change(next=>{
   for(const s of add)if(!exists(next,s))throw fail('악보가 변경됐어요.','binding');
   next[COLLECTION]=(next[COLLECTION]||[]).filter(s=>!remove.includes(s.id));
   for(const s of add)if(!next[COLLECTION].some(r=>r.id===s.id))next[COLLECTION].push(clone(s));
   next.deleted||={};next.deleted[COLLECTION]=[...new Set([...(next.deleted[COLLECTION]||[]),...remove])];
   mutate?.(next);
  });
  current();return saved;
 }
 function removeScore(b){
  const d=data();if(b.ownerId!==owner||!exists(d,b))throw fail('악보가 변경됐어요. 다시 확인해 주세요.','binding');
  const ids=[...new Set([...(d[COLLECTION]||[]),...read().records].filter(s=>s.ownerId===owner&&s.songId===b.songId&&s.scoreId===b.scoreId&&s.r2Key===b.r2Key).map(s=>s.id))];
  return commit({remove:ids},next=>{if(!exists(next,b))throw fail('악보가 바뀌어 삭제를 중단했어요.','binding');const song=next.songs.find(s=>s.id===b.songId);song.scores= song.scores.filter(s=>s.id!==b.scoreId);});
 }
 /** Ids erased on any device (synced) or on this one (recovery copy). Strokes that live outside the records — the
  * handwriting attached to an imported PDF — use it to stay erased. */
 function gone(){const d=data();return new Set([...(d.deleted?.[COLLECTION]||[]),...read().deleted]);}
 return {restore,list,commit,removeScore,gone,key};
}
return {COLLECTION,valid,same,opacity,point,hit,path,bounds,inRect,transform,create,MAX_POINTS,MAX_BYTES,
 markStroke,glyphLayout,MARK_UNIT,MARK_OPACITY,GLYPH_SIZE,GLYPH_MIN,GLYPH_MAX,GLYPH_CHARS,
 isNote,noteKey,noteAt,linked,noteRect,noteLines,noteLayout,NOTE_TEXT_MAX,NOTE_MIN,NOTE_SIZE,NOTE_SMALLEST,NOTE_FONT,NOTE_LINE,NOTE_PAD,NOTE_RADIUS,NOTE_INK,NOTE_FAMILY,NOTE_COLORS};
});
