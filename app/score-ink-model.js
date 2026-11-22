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
 *          Picture (그림 붙여넣기, e.g. handwriting copied in GoodNotes): imageKey 'u/<ownerId>/scorepic-…/original.png' (the
 *          PNG in R2, uploaded by the device that pasted it; that device keeps a copy and uploads it when it can),
 *          imageW, imageH (its pixels, at most PICTURE_SIDE) and imageBytes (at most PICTURE_BYTES). No picture bytes
 *          are ever in the record. It is drawn as the picture alone, filling its rect (whose sides keep the picture's
 *          proportions); color (#ffffff) is unused and mode is 'pen'. Older clients show it as a plain white memo
 *          and move or delete it like one (the fields are kept).
 * Mark     악보 표기 (숨표·반복·컷·시작점 and the user's own): an ordinary stroke whose points were laid out from the
 *          marker preset when it was placed (markStroke), so it keeps its own look whatever the preset becomes later.
 *          mark (optional): what it is — 'breath' | 'repeat' | 'cut' | 'start', or the id of a user preset. A mark is
 *          told apart by this, never by how it looks. Marks placed before 2026-11-14 have no `mark`.
 *          role (optional): what a mark from a user preset does with the MR — 'start' | 'repeat' | 'cut' (기능:
 *          시작점 · 반복 구간 · 건너뛰기, app/score-mark-model.js). Copied from the preset when the mark is placed, so
 *          it works on every device. The built-in 시작점 · 반복 · 컷 have theirs by their `mark` and carry none.
 *          A role this client does not know is kept and does nothing.
 *          measures (optional): [first, last, count] — a mark placed by 마디 선택 covers exactly these measure boxes
 *          (file indexes as in app/score-measure-model.js, both included) of a conversion that had `count` measure
 *          boxes. Its points are the shape drawn over those boxes when it was placed, so it shows without the
 *          conversion and on older clients. The range is used only while the conversion still has that many boxes.
 *          group (optional): link key of the pieces of one such mark that runs over several lines of music — one
 *          record per line, all with the same `measures`; they are erased, selected and listed as one. A piece that
 *          is moved or resized by hand loses `measures` and `group` and is a freehand mark from then on.
 *          A mark stamped from a 직접 그리기 preset (several strokes the user drew, markStamp) is linked by `group`
 *          the same way and has no `measures`: it is erased, selected, moved and listed as one, and keeps its
 *          `group` when moved.
 *          glyph (optional, with size): 1–4 characters drawn centred on the single point instead of the line;
 *          size is the letter height of page width (GLYPH_MIN–GLYPH_MAX), width its extra boldness.
 * Clients older than memos skip records they do not know when listing (valid() is false), so they neither show nor
 * remove a memo; strokes carrying `note`, `mark`, `role`, `measures` or `group` are ordinary strokes to them (a glyph mark is a dot there). */
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
/* 표기의 기능. Built-in marks have theirs by what they are; a mark from a user preset carries `role`. */
const MARK_ROLES=['start','repeat','cut'],MARK_BUILTIN_ROLES={breath:'',repeat:'repeat',cut:'cut',start:'start'};
const validRole=r=>typeof r==='string'&&/^[a-z][a-z0-9-]{0,23}$/.test(r);
/** What a placed mark does: 'start' | 'repeat' | 'cut', or '' for a drawing (no `mark`, 숨표, a plain user mark). */
const markRole=s=>typeof s?.mark!=='string'?'':Object.prototype.hasOwnProperty.call(MARK_BUILTIN_ROLES,s.mark)?MARK_BUILTIN_ROLES[s.mark]:MARK_ROLES.includes(s.role)?s.role:'';
/* 마디 선택: the measure boxes a mark was placed on, and the pieces of one mark. */
const MEASURES_MAX=100000;
const validMeasures=m=>Array.isArray(m)&&m.length===3&&m.every(Number.isInteger)&&m[0]>=0&&m[0]<=m[1]&&m[1]<=MEASURES_MAX&&m[2]>=1&&m[2]<=MEASURES_MAX;
/** The other records of the mark `s` is a piece of (same page, same link key), s included; [s] when it stands alone. */
const grouped=(rows,s)=>s?.group===undefined?[s]:[s,...rows.filter(r=>r.id!==s.id&&r.page===s.page&&r.group===s.group&&!isNote(r))];
/** What a mark is once it was moved or resized by hand: one placed on measures no longer claims them (nor its other
 *  pieces, which lie on other lines); a stamped drawing stays one mark. */
const freehand=s=>{if(s.measures===undefined)return s;const {measures,group,...rest}=s;return rest;};
/* 직접 그리기: a symbol the user drew, kept in a preset as {a, s}: a = height / width of the drawing, s = its strokes
 * as [x0, y0, x1, y1, …] in whole numbers 0–ART_GRID across the drawing's own box. ART_SIZES: the longer side of a
 * stamped mark, of page width. */
const ART_STROKES=12,ART_POINTS=400,ART_GRID=1000,ART_SIZES={s:.03,m:.05,l:.08},ART_FLAT=.05;
/** Drops the points that do not change a line visibly (Ramer–Douglas–Peucker): every point left out lies within
 *  `tolerance` of the line that remains. points: [[x, y, …], …]; the first and last are always kept. */
function simplifyLine(points,tolerance){
 if(points.length<3||!(tolerance>0))return points.slice();
 const keep=new Uint8Array(points.length),stack=[[0,points.length-1]];keep[0]=keep[points.length-1]=1;
 while(stack.length){
  const [a,z]=stack.pop(),ax=points[a][0],ay=points[a][1],dx=points[z][0]-ax,dy=points[z][1]-ay,den=dx*dx+dy*dy;
  let far=0,at=-1;
  for(let i=a+1;i<z;i++){
   const px=points[i][0]-ax,py=points[i][1]-ay,t=den?Math.max(0,Math.min(1,(px*dx+py*dy)/den)):0,d=Math.hypot(px-t*dx,py-t*dy);
   if(d>far){far=d;at=i;}
  }
  if(at>0&&far>tolerance){keep[at]=1;stack.push([a,at],[at,z]);}
 }
 return points.filter((_,i)=>keep[i]);
}
/** A drawing as a preset stores it. strokes: [[[x, y], …], …] in any unit (y down), in the order drawn. At most
 *  ART_STROKES strokes are kept and ART_POINTS points in all (lines are simplified, more and more coarsely, until
 *  they fit). Null when nothing was drawn. */
function artFrom(strokes){
 const lines=(Array.isArray(strokes)?strokes:[]).map(line=>(Array.isArray(line)?line:[]).filter(p=>Array.isArray(p)&&Number.isFinite(p[0])&&Number.isFinite(p[1])).map(p=>[p[0],p[1]])).filter(line=>line.length).slice(0,ART_STROKES);
 if(!lines.length)return null;
 let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
 for(const line of lines)for(const p of line){x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);y0=Math.min(y0,p[1]);y1=Math.max(y1,p[1]);}
 const w=x1-x0,h=y1-y0,size=Math.max(w,h);
 if(!(size>0))return {a:1,s:[[ART_GRID/2,ART_GRID/2]]}; // a single dot
 let out=lines,tolerance=size*.004;
 for(let i=0;i<24;i++){out=lines.map(line=>simplifyLine(line,tolerance));if(out.reduce((n,line)=>n+line.length,0)<=ART_POINTS)break;tolerance*=1.5;}
 // A line straight across or straight down has no box of its own: it gets a thin one, so it keeps its direction.
 const a=Math.max(ART_FLAT,Math.min(1/ART_FLAT,w>0?h/w:1/ART_FLAT)),grid=(v,from,span)=>span>0?Math.round((v-from)/span*ART_GRID):ART_GRID/2;
 return {a:Math.round(a*1000)/1000,s:out.map(line=>{
  const flat=[];
  for(const p of line){const x=grid(p[0],x0,w),y=grid(p[1],y0,h);if(flat.length<2||flat.at(-2)!==x||flat.at(-1)!==y)flat.push(x,y);}
  return flat;
 })};
}
function validArt(art){
 return !!art&&typeof art==='object'&&Number.isFinite(art.a)&&art.a>=ART_FLAT&&art.a<=1/ART_FLAT&&Array.isArray(art.s)&&art.s.length>=1&&art.s.length<=ART_STROKES&&
  art.s.every(line=>Array.isArray(line)&&line.length>=2&&line.length%2===0&&line.every(v=>Number.isInteger(v)&&v>=0&&v<=ART_GRID))&&art.s.reduce((n,line)=>n+line.length/2,0)<=ART_POINTS;
}
/** The strokes of a stored drawing laid into a box W wide around (cx, cy): [[[x, y], …], …]; H = W × art.a. */
function artLines(art,cx,cy,W){
 const H=W*art.a;
 return art.s.map(line=>{const out=[];for(let i=0;i<line.length;i+=2)out.push([cx+(line[i]/ART_GRID-.5)*W,cy+(line[i+1]/ART_GRID-.5)*H]);return out;});
}
const glyphChars=t=>typeof t==='string'?[...t]:[];
const validGlyph=s=>{const n=glyphChars(s.glyph).length;return n>=1&&n<=GLYPH_CHARS&&!/\s/.test(s.glyph)&&Number.isFinite(s.size)&&s.size>=GLYPH_MIN&&s.size<=GLYPH_MAX&&s.points?.length===1;};
/** Half the room a stroke takes around its points, across and down, of page width. */
function reach(s){
 if(!s.glyph)return [s.width/2,s.width/2];
 return [Math.max(s.width/2,s.size*Math.max(.5,glyphChars(s.glyph).length*.45)),Math.max(s.width/2,s.size*.55)];
}
const PICTURE_SIDE=1600,PICTURE_BYTES=4*1024*1024,PICTURE_KEY=/^u\/([^/]{1,200})\/(scorepic-[A-Za-z0-9_-]{1,80})\/original\.png$/;
/** Where a pasted picture is kept in R2 (the R2 worker names an upload u/<owner>/<mediaId>/original.<ext>). */
const pictureKey=(ownerId,mediaId)=>'u/'+ownerId+'/'+mediaId+'/original.png';
function validPicture(s){
 if(s.imageKey===undefined)return s.imageW===undefined&&s.imageH===undefined&&s.imageBytes===undefined;
 const m=typeof s.imageKey==='string'&&s.imageKey.match(PICTURE_KEY);
 return !!m&&m[1]===s.ownerId&&[s.imageW,s.imageH].every(n=>Number.isInteger(n)&&n>=1&&n<=PICTURE_SIDE)&&Number.isInteger(s.imageBytes)&&s.imageBytes>=1&&s.imageBytes<=PICTURE_BYTES;
}
function validNote(s){
 const r=s.rect;
 if(!validPicture(s))return false;
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
  (s.smooth===undefined||s.smooth===true)&&(s.pressure===undefined||s.pressure===true)&&(s.mark===undefined||validId(s.mark))&&(s.role===undefined||validRole(s.role))&&(s.measures===undefined||validMeasures(s.measures))&&(s.group===undefined||validId(s.group))&&(s.glyph===undefined?s.size===undefined:validGlyph(s)));
}
const FIELDS=['version','id','ownerId','songId','scoreId','r2Key','pdfHash','page','tool','color','width','opacity','points','createdAt','note','rect','mode','text','mark','glyph','size','role','measures','group','smooth','pressure','imageKey','imageW','imageH','imageBytes'];
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
/* 필기감 (strokes written from 2026-11-18). Two optional flags on a freehand pen/highlighter stroke, both `true` or absent:
 *  smooth    the points are joined by curves through their midpoints (quadratic), not straight lines.
 *  pressure  (Apple Pencil) the width follows each point's pressure: PRESSURE_WIDTH(p) × width, 1 × at p = 0.33.
 * A stroke without them is drawn exactly as before (path(): straight lines, one width), and older clients draw a
 * flagged stroke that way too: the points and `width` mean the same. Units of the drawn path: 1000 per page width. */
const PRESSURE_MIN=0.6,PRESSURE_MAX=1.5,SIMPLIFY=0.0005;
const pressureWidth=p=>Math.max(PRESSURE_MIN,Math.min(PRESSURE_MAX,0.64+1.1*(Number.isFinite(p)?p:0.33)));
const xy=(p,aspect)=>[p[0]*1000,p[1]*aspect*1000];
const f2=n=>n.toFixed(2);
/** The centre line through the points: a curve through the midpoints, each point its control point. */
function smoothPath(points,aspect=1){
 const pts=points.map(p=>xy(p,aspect)),n=pts.length;
 if(n===1)return 'M'+f2(pts[0][0])+' '+f2(pts[0][1])+' l0.01 0';
 let d='M'+f2(pts[0][0])+' '+f2(pts[0][1]);
 if(n===2)return d+' L'+f2(pts[1][0])+' '+f2(pts[1][1]);
 d+=' L'+f2((pts[0][0]+pts[1][0])/2)+' '+f2((pts[0][1]+pts[1][1])/2);
 for(let i=1;i<n-1;i++)d+=' Q'+f2(pts[i][0])+' '+f2(pts[i][1])+' '+f2((pts[i][0]+pts[i+1][0])/2)+' '+f2((pts[i][1]+pts[i+1][1])/2);
 return d+' L'+f2(pts[n-1][0])+' '+f2(pts[n-1][1]);
}
/** The same curve as dense samples [x, y, half width] (path units), with the pressure (averaged over neighbours) as width. */
function samples(points,width,aspect=1){
 const pts=points.map(p=>xy(p,aspect)),n=pts.length,half=width*500;
 const r=points.map((_,i)=>half*(pressureWidth(points[Math.max(0,i-1)][2])+2*pressureWidth(points[i][2])+pressureWidth(points[Math.min(n-1,i+1)][2]))/4);
 if(n<3)return pts.map((p,i)=>[p[0],p[1],r[i]]);
 const out=[[pts[0][0],pts[0][1],r[0]]],mid=(i,k)=>(pts[i][k]+pts[i+1][k])/2;
 out.push([mid(0,0),mid(0,1),(r[0]+r[1])/2]);
 for(let i=1;i<n-1;i++){
  const a=[mid(i-1,0),mid(i-1,1)],c=[pts[i][0],pts[i][1]],b=[mid(i,0),mid(i,1)],ra=(r[i-1]+r[i])/2,rb=(r[i]+r[i+1])/2;
  const steps=Math.max(1,Math.min(8,Math.ceil((Math.hypot(c[0]-a[0],c[1]-a[1])+Math.hypot(b[0]-c[0],b[1]-c[1]))/3)));
  for(let k=1;k<=steps;k++){const t=k/steps,u=1-t;out.push([u*u*a[0]+2*u*t*c[0]+t*t*b[0],u*u*a[1]+2*u*t*c[1]+t*t*b[1],u*u*ra+2*u*t*r[i]+t*t*rb]);}
 }
 out.push([pts[n-1][0],pts[n-1][1],r[n-1]]);
 return out;
}
/** A pressure stroke as one filled shape: its two edges joined by round ends, in runs that are each one outline
 *  (bands that only touched left faint seams in Chrome). Where the line turns sharply — tighter than its own width —
 *  a run ends and a round dot covers the turn. All parts wind the same way, so (nonzero) they fill as one. */
function outlinePath(points,width,aspect=1){
 const dot=([x,y,r])=>'M'+f2(x-r)+' '+f2(y)+' a'+f2(r)+' '+f2(r)+' 0 1 0 '+f2(2*r)+' 0 a'+f2(r)+' '+f2(r)+' 0 1 0 '+f2(-2*r)+' 0Z';
 const q=[];
 for(const p of samples(points,width,aspect)){const l=q.at(-1);if(l&&Math.hypot(p[0]-l[0],p[1]-l[1])<0.05)l[2]=Math.max(l[2],p[2]);else q.push(p.slice());}
 if(q.length===1)return dot(q[0]);
 const dir=q.slice(1).map((p,i)=>{const dx=p[0]-q[i][0],dy=p[1]-q[i][1],l=Math.hypot(dx,dy);return [dx/l,dy/l,l];});
 const cuts=[];
 for(let i=1;i<q.length-1;i++){
  const c=dir[i-1][0]*dir[i][0]+dir[i-1][1]*dir[i][1],turn=Math.acos(Math.max(-1,Math.min(1,c)));
  if(c<0.8||turn*1.5*q[i][2]>Math.min(dir[i-1][2],dir[i][2]))cuts.push(i);
 }
 const parts=[],ends=[0,...cuts,q.length-1];
 for(let k=0;k<ends.length-1;k++){
  const a=ends[k],z=ends[k+1],left=[],right=[];
  for(let i=a;i<=z;i++){
   const u=i===a?dir[a]:i===z?dir[z-1]:[dir[i-1][0]+dir[i][0],dir[i-1][1]+dir[i][1]],ul=Math.hypot(u[0],u[1])||1,nx=-u[1]/ul,ny=u[0]/ul;
   // Between two bands the edge is pushed out a little (miter), so the line keeps its width through a bend.
   const k2=i===a||i===z?1:Math.min(2,1/Math.max(.5,nx*-dir[i][1]+ny*dir[i][0])),r=q[i][2]*k2;
   left.push([q[i][0]+nx*r,q[i][1]+ny*r]);right.push([q[i][0]-nx*r,q[i][1]-ny*r]);
  }
  const ra=q[a][2],rz=q[z][2];
  parts.push('M'+left.map(p=>f2(p[0])+' '+f2(p[1])).join(' L')+' A'+f2(rz)+' '+f2(rz)+' 0 0 0 '+f2(right.at(-1)[0])+' '+f2(right.at(-1)[1])+
   ' L'+right.reverse().map(p=>f2(p[0])+' '+f2(p[1])).join(' L')+' A'+f2(ra)+' '+f2(ra)+' 0 0 0 '+f2(left[0][0])+' '+f2(left[0][1])+'Z');
 }
 for(const i of cuts)parts.push(dot(q[i]));
 return parts.join(' ');
}
/** How a stroke is drawn: {d, fill} — fill true: fill d with the colour; false: stroke d, s.width × 1000 wide, round. */
function strokeShape(s,aspect=1){
 if(s.pressure===true&&!s.glyph)return {d:outlinePath(s.points,s.width,aspect),fill:true};
 if(s.smooth===true&&!s.glyph)return {d:smoothPath(s.points,aspect),fill:false};
 return {d:path(s,aspect),fill:false};
}
/** Points of a finished stroke with the ones that change nothing visible left out (Ramer–Douglas–Peucker over x, y
 *  and, for a pressure stroke, the half width): every dropped point lies within `tolerance` (of page width) of the
 *  line kept. The first and last point always stay. */
function simplifyStroke(points,{aspect=1,width=0,pressure=false,tolerance=SIMPLIFY}={}){
 if(points.length<3)return points.map(p=>p.slice());
 const q=points.map(p=>[p[0],p[1]*aspect,pressure?pressureWidth(p[2])*width/2:0]),keep=new Uint8Array(q.length),stack=[[0,q.length-1]];
 keep[0]=keep[q.length-1]=1;
 while(stack.length){
  const [a,z]=stack.pop(),A=q[a],D=[q[z][0]-A[0],q[z][1]-A[1],q[z][2]-A[2]],den=D[0]*D[0]+D[1]*D[1]+D[2]*D[2];let far=0,at=-1;
  for(let i=a+1;i<z;i++){
   const P=[q[i][0]-A[0],q[i][1]-A[1],q[i][2]-A[2]],t=den?Math.max(0,Math.min(1,(P[0]*D[0]+P[1]*D[1]+P[2]*D[2])/den)):0,d=Math.hypot(P[0]-t*D[0],P[1]-t*D[1],P[2]-t*D[2]);
   if(d>far){far=d;at=i;}
  }
  if(at>0&&far>tolerance){keep[at]=1;stack.push([a,at],[at,z]);}
 }
 return points.filter((_,i)=>keep[i]).map(p=>p.slice());
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
/** How large a 기호 or 직접 그리기 preset's marks are, as a factor of the usual size (보통 = 1): its own `size` — a number
 *  MARK_SIZE_MIN–MARK_SIZE_MAX, or 's' | 'm' | 'l' as drawn presets had before (ART_SCALES) — else 1. */
const MARK_SIZE_MIN=.5,MARK_SIZE_MAX=2.5,ART_SCALES={s:.6,m:1,l:1.6};
const markSize=look=>Number.isFinite(look?.size)?Math.max(MARK_SIZE_MIN,Math.min(MARK_SIZE_MAX,look.size)):ART_SCALES[look?.size]||1;
/** How see-through the marks of a preset are: its own `opacity` (0.05–1) when it has one, else what marks have always
 *  had — MARK_OPACITY for a highlighter preset, 1 for a pen one. Placed marks carry it, so changing it later leaves them. */
const markOpacity=look=>Number.isFinite(look?.opacity)&&look.opacity>=0.05&&look.opacity<=1?look.opacity:look?.type==='highlighter'?MARK_OPACITY:1;
/** What a marker preset leaves on the page, as the fields of a stroke record: tool, color, opacity, width, points
 *  (and glyph + size for typed characters). look = {form, shape, text, color, width, type}; a is where the press
 *  began (the first tap of a 구간 괄호), b where it ended (the second tap) or null for a plain tap.
 *  form 'symbol' (shape v | comma | check | circle | dot | triangle | star | diamond | text) is one point,
 *  'line' | 'wave' | 'box' | 'cover' follow a drag from a to b, 'bracket' spans two taps. */
function markStroke(look,a,b,aspect=1){
 const k=Number.isFinite(aspect)&&aspect>0?aspect:1,at=(x,y)=>point(a[0]+x,a[1]+y/k),pen=look.type!=='highlighter';
 const out={tool:pen?'pen':'highlighter',color:look.color,opacity:markOpacity(look),width:look.width};
 const form=look.form,shape=look.shape,z=form==='symbol'?markSize(look):1,u=MARK_UNIT*z; // 크기 of a 기호
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
  out.points=[at(0,0)];out.glyph=glyphChars(look.text).slice(0,GLYPH_CHARS).join('');out.size=Math.round(GLYPH_SIZE*z*1e4)/1e4;
 }else if(shape==='dot'){
  out.points=[at(0,0)];out.width=Math.min(.06,Math.max(.012,look.width*4)*z);
 }else if(shape==='circle'){
  out.points=Array.from({length:21},(_,i)=>{const t=i/20*Math.PI*2;return at(u*Math.cos(t),u*Math.sin(t));});
 }else if(MARK_SHAPES[shape]){
  out.points=MARK_SHAPES[shape].map(([x,y])=>at(x*u,y*u));
 }else out.points=[at(-.016*z,-.017*z),at(0,.017*z),at(.016*z,-.017*z)]; // 'v', the breath mark
 return out;
}
/** What a 직접 그리기 preset leaves where it is tapped: the strokes of its drawing, each as the fields of a stroke
 *  record, centred on the tap, the drawing's longer side as long as the preset's 크기 says. look = {art, size, color,
 *  width, type}; at: the tap (page fractions); aspect: page height / width. */
function markStamp(look,at,aspect=1){
 if(!validArt(look?.art))return [];
 const k=Number.isFinite(aspect)&&aspect>0?aspect:1,pen=look.type!=='highlighter',long=ART_SIZES[look.size]||Math.round(ART_SIZES.m*markSize(look)*1e4)/1e4,W=look.art.a<=1?long:long/look.art.a;
 return artLines(look.art,0,0,W).map(line=>({tool:pen?'pen':'highlighter',color:look.color,opacity:markOpacity(look),width:look.width,points:line.map(p=>point(at[0]+p[0],at[1]+p[1]/k))}));
}
/** Everything a preset leaves for one placing: the strokes of a drawn symbol, or the one stroke of any other form. */
const markShapes=(look,a,b,aspect=1)=>look?.form==='draw'?markStamp(look,a,aspect):[markStroke(look,a,b,aspect)];
/** Where a glyph mark's characters go on a page W wide and H high: centre x, baseline y, letter size and the extra
 *  outline that makes them bolder. The viewer (SVG) and the PDF export (canvas) both draw from this. */
function glyphLayout(s,W,H){
 const size=s.size*W;
 return {text:s.glyph,x:s.points[0][0]*W,y:s.points[0][1]*H+size*.36,size,bold:Math.min(size*.12,s.width*W*.25)};
}
/** A memo's text as a list: one entry per non-empty line, without a leading bullet, number or tick box
 *  ("- ", "• ", "1. ", "2) ", "[ ] "), each line once. "-5도" and "1.5배" keep their number. */
function noteGoalLines(text){
 const out=[];
 for(const raw of String(text||'').split(/\r?\n/)){
  let line=raw.trim(),before;
  do{before=line;line=line.replace(/^(?:[-*+](?!\d)|[•·∙▪▫◦‣○●□■☐☑✓✔–—]+|\d{1,3}[.)](?!\d)|[(（]\d{1,3}[)）]|[①-⑳]|\[[ xX✓]?\])\s*/,'');}while(line!==before);
  line=line.replace(/\s+/g,' ');
  if(line&&!out.includes(line))out.push(line);
 }
 return out;
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
 /** The recovery copy only has to hold what the shared root does not hold yet: strokes it has with the same content and
  *  erasures it has recorded are dropped from it (they used to stay forever, so every stroke was kept twice on the
  *  device and Safari's storage filled up). Never throws: a copy that cannot be read or rewritten stays as it is. */
 function prune(){
  try{
   const d=data(),ledger=read(),rows=new Map((d[COLLECTION]||[]).map(r=>[r?.id,r])),dead=new Set(d.deleted?.[COLLECTION]||[]);
   const records=ledger.records.filter(s=>{const r=rows.get(s.id);return !dead.has(s.id)&&!(r&&same(r,s));}),deleted=ledger.deleted.filter(id=>!dead.has(id));
   if(records.length===ledger.records.length&&deleted.length===ledger.deleted.length)return;
   current();if(!records.length&&!deleted.length&&typeof storage.removeItem==='function')storage.removeItem(key);else storage.setItem(key,JSON.stringify({...ledger,records,deleted}));
  }catch{}
 }
 const isQuota=e=>e?.name==='QuotaExceededError'||e?.code===22||/quota/i.test(e?.message||'');
 function restore(){
  // Duplicates of what the root holds go first: on a full device the root can only be saved once they are gone.
  prune();
  const d=data(),ledger=read(),rows=d[COLLECTION]||[],gone=new Set([...(d.deleted?.[COLLECTION]||[]),...ledger.deleted]);
  const retained=ledger.records.filter(s=>!gone.has(s.id));
  if(retained.length!==ledger.records.length)put({...ledger,records:retained,deleted:[...gone]});
  const additions=retained.filter(s=>!gone.has(s.id)&&exists(d,s)&&!rows.some(r=>r.id===s.id));
  const remove=rows.filter(s=>s.ownerId===owner&&gone.has(s.id)).map(s=>s.id);
  const freshGone=ledger.deleted.filter(id=>!(d.deleted?.[COLLECTION]||[]).includes(id));
  if(!additions.length&&!remove.length&&!freshGone.length){prune();return true;}
  current();const saved=change(next=>{
   const dead=new Set([...(next.deleted?.[COLLECTION]||[]),...ledger.deleted]);
   next[COLLECTION]=(next[COLLECTION]||[]).filter(s=>s.ownerId!==owner||!dead.has(s.id));
   for(const s of additions)if(!dead.has(s.id)&&exists(next,s)&&!next[COLLECTION].some(r=>r.id===s.id))next[COLLECTION].push(clone(s));
   next.deleted||={};next.deleted[COLLECTION]=[...dead];
  });
  if(saved)prune();return saved;
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
  // Account-scoped recovery copy is durable before updating the shared root. When the device storage is full, the
  // shared root is still tried (it is the copy that syncs); the recovery copy is pruned once that is saved.
  const copy=()=>put({version:1,owner,records:[...map.values()].filter(s=>!gone.has(s.id)),deleted:[...gone]});
  try{copy();}
  catch(e){
   if(!isQuota(e))throw e;
   // Full: drop what the shared root already holds from the copy (frees the space the duplicates took), try once more.
   prune();for(const s of rows)if(map.has(s.id)&&same(map.get(s.id),s)&&!add.some(a=>a.id===s.id))map.delete(s.id);
   try{copy();}catch(again){if(!isQuota(again))throw again;}
  }
  const saved=change(next=>{
   for(const s of add)if(!exists(next,s))throw fail('악보가 변경됐어요.','binding');
   next[COLLECTION]=(next[COLLECTION]||[]).filter(s=>!remove.includes(s.id));
   for(const s of add)if(!next[COLLECTION].some(r=>r.id===s.id))next[COLLECTION].push(clone(s));
   next.deleted||={};next.deleted[COLLECTION]=[...new Set([...(next.deleted[COLLECTION]||[]),...remove])];
   mutate?.(next);
  });
  current();if(saved)prune();return saved;
 }
 function removeScore(b){
  const d=data();if(b.ownerId!==owner||!exists(d,b))throw fail('악보가 변경됐어요. 다시 확인해 주세요.','binding');
  const ids=[...new Set([...(d[COLLECTION]||[]),...read().records].filter(s=>s.ownerId===owner&&s.songId===b.songId&&s.scoreId===b.scoreId&&s.r2Key===b.r2Key).map(s=>s.id))];
  return commit({remove:ids},next=>{if(!exists(next,b))throw fail('악보가 바뀌어 삭제를 중단했어요.','binding');const song=next.songs.find(s=>s.id===b.songId);song.scores= song.scores.filter(s=>s.id!==b.scoreId);});
 }
 /** Ids erased on any device (synced) or on this one (recovery copy). Strokes that live outside the records — the
  * handwriting attached to an imported PDF — use it to stay erased. */
 function gone(){const d=data();return new Set([...(d.deleted?.[COLLECTION]||[]),...read().deleted]);}
 return {restore,list,commit,removeScore,gone,key,prune};
}
return {COLLECTION,valid,same,opacity,point,hit,path,smoothPath,outlinePath,strokeShape,simplifyStroke,pressureWidth,SIMPLIFY,bounds,inRect,transform,create,MAX_POINTS,MAX_BYTES,
 markStroke,glyphLayout,noteGoalLines,markRole,MARK_ROLES,MARK_BUILTIN_ROLES,validMeasures,grouped,freehand,
 simplifyLine,artFrom,validArt,artLines,markStamp,markShapes,markOpacity,markSize,MARK_SIZE_MIN,MARK_SIZE_MAX,ART_SCALES,ART_STROKES,ART_POINTS,ART_GRID,ART_SIZES,MARK_UNIT,MARK_OPACITY,GLYPH_SIZE,GLYPH_MIN,GLYPH_MAX,GLYPH_CHARS,
 isNote,pictureKey,PICTURE_SIDE,PICTURE_BYTES,noteKey,noteAt,linked,noteRect,noteLines,noteLayout,NOTE_TEXT_MAX,NOTE_MIN,NOTE_SIZE,NOTE_SMALLEST,NOTE_FONT,NOTE_LINE,NOTE_PAD,NOTE_RADIUS,NOTE_INK,NOTE_FAMILY,NOTE_COLORS};
});
