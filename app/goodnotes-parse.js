/* Reads a GoodNotes notebook (.goodnotes) on this device: the original PDF pages, the outline (song titles) and the
 * handwriting. Nothing is uploaded or changed here; the file is only read.
 *
 * The format is not published. What is read was checked against a real export (schema 24–26, 2026-11):
 *   zip ─ index.events.pb   length-prefixed protobuf events: document title (30/31), PDF attachment (6),
 *        │                   page background = attachment + PDF page + size (2), page + order key (54), outline entry (65)
 *        ├ index.attachments.pb / index.notes.pb   id → path inside the zip
 *        ├ attachments/<id>  the original PDF
 *        └ notes/<id>        one page's ink: items with a colour and an Apple-LZ4 ("bv41") "tpl" path
 *                            (move + quadratic curves, one width).
 * Anything that is not recognised is counted and reported, never guessed. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipGoodnotes=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const LIMIT={archive:400*1024*1024,entry:200*1024*1024,small:64*1024*1024,entries:20000,points:2048};
const fail=(message,code)=>Object.assign(Error(message),{code});
const text=new TextDecoder('utf-8',{fatal:false});
const str=v=>v instanceof Uint8Array?text.decode(v):'';

/* ---------- zip (stored / deflate, no zip64) ---------- */
function directory(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length<22||bytes.length>LIMIT.archive)throw fail(bytes.length>LIMIT.archive?'파일이 너무 커요 (400MB까지).':'굿노트 파일이 아니에요.','format');
 let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)throw fail('굿노트 파일이 아니에요.','format');
 const count=view.getUint16(end+10,true),size=view.getUint32(end+12,true);let at=view.getUint32(end+16,true);
 if(count===0xffff||at===0xffffffff||count>LIMIT.entries||at+size>bytes.length)throw fail('이 굿노트 파일은 너무 커서 읽을 수 없어요.','format');
 const entries=new Map();
 for(let n=0;n<count;n++){
  if(at+46>bytes.length||view.getUint32(at,true)!==0x02014b50)throw fail('굿노트 파일이 손상됐어요.','format');
  const method=view.getUint16(at+10,true),packed=view.getUint32(at+20,true),length=view.getUint32(at+24,true),
   nameLength=view.getUint16(at+28,true),extra=view.getUint16(at+30,true),comment=view.getUint16(at+32,true),local=view.getUint32(at+42,true);
  const name=str(bytes.subarray(at+46,at+46+nameLength));
  entries.set(name,{name,method,packed,length,local});
  at+=46+nameLength+extra+comment;
 }
 async function read(name,cap=LIMIT.small){
  const e=entries.get(name);if(!e)return null;
  if(e.length>cap||e.length>LIMIT.entry)throw fail('굿노트 파일 안의 항목이 너무 커요.','size');
  if(e.local+30>bytes.length||view.getUint32(e.local,true)!==0x04034b50)throw fail('굿노트 파일이 손상됐어요.','format');
  const start=e.local+30+view.getUint16(e.local+26,true)+view.getUint16(e.local+28,true);
  if(start+e.packed>bytes.length)throw fail('굿노트 파일이 손상됐어요.','format');
  const data=bytes.subarray(start,start+e.packed);
  if(e.method===0){if(e.packed!==e.length)throw fail('굿노트 파일이 손상됐어요.','format');return data.slice();}
  if(e.method!==8)throw fail('지원하지 않는 압축 방식이에요.','format');
  if(typeof DecompressionStream!=='function')throw fail('이 브라우저에서는 굿노트 파일을 풀 수 없어요. 브라우저를 업데이트해 주세요.','browser');
  // The declared size is the ceiling: an entry that inflates past it is rejected, not kept in memory.
  const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),out=new Uint8Array(e.length);let offset=0;
  try{for(;;){const chunk=await reader.read();if(chunk.done)break;if(offset+chunk.value.length>e.length)throw fail('굿노트 파일이 손상됐어요.','format');out.set(chunk.value,offset);offset+=chunk.value.length;}}
  catch(error){await reader.cancel().catch(()=>{});throw error.code?error:fail('굿노트 파일을 풀지 못했어요.','format');}
  if(offset!==e.length)throw fail('굿노트 파일이 손상됐어요.','format');
  return out;
 }
 return {entries,read};
}

/* ---------- protobuf ---------- */
function varint(b,i){let value=0,shift=0;for(;;){if(i>=b.length||shift>63)throw fail('pb','pb');const c=b[i++];value+=(c&0x7f)*2**shift;shift+=7;if(!(c&0x80))return [value,i];}}
function fields(b){
 const out=[];let i=0;
 while(i<b.length){
  let key;[key,i]=varint(b,i);const field=Math.floor(key/8),wire=key%8;let value;
  if(!field)throw fail('pb','pb');
  if(wire===0)[value,i]=varint(b,i);
  else if(wire===1){value=b.subarray(i,i+8);i+=8;}
  else if(wire===5){value=b.subarray(i,i+4);i+=4;}
  else if(wire===2){let n;[n,i]=varint(b,i);if(i+n>b.length)throw fail('pb','pb');value=b.subarray(i,i+n);i+=n;}
  else throw fail('pb','pb');
  if(i>b.length)throw fail('pb','pb');
  out.push([field,wire,value]);
 }
 return out;
}
const first=(list,field,wire)=>{const hit=list.find(x=>x[0]===field&&(wire===undefined||x[1]===wire));return hit?hit[2]:undefined;};
const sub=(list,field)=>{const v=first(list,field,2);if(!v)return null;try{return fields(v);}catch{return null;}};
const f32=v=>new DataView(v.buffer,v.byteOffset,4).getFloat32(0,true);
/** A file of [varint length][message] records. */
function records(b){const out=[];let i=0;while(i<b.length){let n;[n,i]=varint(b,i);if(i+n>b.length)throw fail('굿노트 파일이 손상됐어요.','format');out.push(b.subarray(i,i+n));i+=n;}return out;}
/** A register is {1: value, 2: clock}; the value may be text. */
const reg=(list,field)=>{const inner=sub(list,field);return inner?str(first(inner,1,2)):'';};

/* ---------- Apple LZ4 frames ("bv41" compressed, "bv4-" stored, "bv4$" end) ---------- */
function lz4(src,size){
 const out=new Uint8Array(size);let i=0,o=0;
 while(i<src.length){
  const token=src[i++];let literal=token>>4;
  if(literal===15)for(;;){const c=src[i++];literal+=c;if(c!==255)break;}
  if(i+literal>src.length||o+literal>size)throw fail('lz4','ink');
  out.set(src.subarray(i,i+literal),o);i+=literal;o+=literal;
  if(i>=src.length)break;
  const offset=src[i]|src[i+1]<<8;i+=2;let match=token&15;
  if(match===15)for(;;){const c=src[i++];match+=c;if(c!==255)break;}
  match+=4;
  if(!offset||offset>o||o+match>size)throw fail('lz4','ink');
  for(let k=0;k<match;k++,o++)out[o]=out[o-offset];
 }
 if(o!==size)throw fail('lz4','ink');
 return out;
}
function unframe(b){
 const view=new DataView(b.buffer,b.byteOffset,b.byteLength),parts=[];let i=0,total=0;
 for(;;){
  if(i+4>b.length)throw fail('bv4','ink');
  const tag=str(b.subarray(i,i+4));i+=4;
  if(tag==='bv4$')break;
  if(tag==='bv41'){const size=view.getUint32(i,true),packed=view.getUint32(i+4,true);i+=8;if(size>LIMIT.small||i+packed>b.length)throw fail('bv4','ink');parts.push(lz4(b.subarray(i,i+packed),size));i+=packed;total+=size;}
  else if(tag==='bv4-'){const size=view.getUint32(i,true);i+=4;if(i+size>b.length)throw fail('bv4','ink');parts.push(b.subarray(i,i+size));i+=size;total+=size;}
  else throw fail('bv4','ink');
  if(total>LIMIT.small)throw fail('bv4','ink');
 }
 const out=new Uint8Array(total);let o=0;for(const p of parts){out.set(p,o);o+=p.length;}
 return out;
}
/* ---------- "tpl": a self-describing tuple. v = uint16, u = uint32, f = float32, A(…) = counted array, S(…) = struct ---------- */
function tuple(raw){
 if(str(raw.subarray(0,4))!=='tpl\0')throw fail('tpl','ink');
 const view=new DataView(raw.buffer,raw.byteOffset,raw.byteLength),end=raw.indexOf(0,8);
 if(end<0)throw fail('tpl','ink');
 const schema=str(raw.subarray(8,end));let i=end+1,budget=400000;
 const close=(s,j)=>{let depth=0;for(let k=j;k<s.length;k++){if(s[k]==='(')depth++;else if(s[k]===')'&&--depth===0)return k;}throw fail('tpl','ink');};
 function many(s){const values=[];let j=0;while(j<s.length){const [value,next]=one(s,j);values.push(value);j=next;}return values;}
 function one(s,j){
  if(--budget<0||i>raw.length)throw fail('tpl','ink');
  const c=s[j];
  if(c==='v'){const value=view.getUint16(i,true);i+=2;return [value,j+1];}
  if(c==='u'){const value=view.getUint32(i,true);i+=4;return [value,j+1];}
  if(c==='f'){const value=view.getFloat32(i,true);i+=4;return [value,j+1];}
  if(c==='S'||c==='A'){
   const k=close(s,j+1),inner=s.slice(j+2,k);
   if(c==='S')return [many(inner),k+1];
   const count=view.getUint32(i,true);i+=4;if(count>200000)throw fail('tpl','ink');
   const list=[];for(let n=0;n<count;n++){const values=many(inner);list.push(values.length===1?values[0]:values);}
   return [list,k+1];
  }
  throw fail('tpl','ink');
 }
 let values;try{values=many(schema);}catch(error){throw error.code?error:fail('tpl','ink');}
 return {schema,values};
}
const PATH_SCHEMA='vuA(v)A(S(uu))A(S(uuuu))vA(f)';
const bits=new DataView(new ArrayBuffer(4)),float=u=>{bits.setUint32(0,u,true);return bits.getFloat32(0,true);};
/** One ink item → sub-paths in page units: [{width, points:[[x,y]…]}]; null when the shape is not one we know. */
function inkPaths(payload){
 const {schema,values}=tuple(unframe(payload));
 if(schema!==PATH_SCHEMA)return null;
 const [,widthBits,kinds,moves,curves,,widths]=values;let width=float(widthBits);
 if(!(width>0)&&widths.length){const sorted=widths.filter(Number.isFinite).sort((a,b)=>a-b);width=sorted[Math.floor(sorted.length/2)]||0;}
 const paths=[];let m=0,c=0,current=null;
 for(const kind of kinds){
  if(kind===0){const p=moves[m++];if(!p)return null;current={width,points:[[float(p[0]),float(p[1])]]};paths.push(current);}
  else if(kind===1){
   const q=curves[c++];if(!q||!current)return null;
   const [x0,y0]=current.points.at(-1),cx=float(q[0]),cy=float(q[1]),x=float(q[2]),y=float(q[3]);
   // Dense strokes are almost straight between samples: keep the end point, and the midpoint of a real bend.
   const bend=Math.hypot(cx-(x0+x)/2,cy-(y0+y)/2),steps=bend>0.35?Math.min(8,2+Math.floor(bend/2)):1;
   for(let s=1;s<=steps;s++){const t=s/steps,a=(1-t)*(1-t),b=2*(1-t)*t,d=t*t;current.points.push([a*x0+b*cx+d*x,a*y0+b*cy+d*y]);}
  }else return null;
 }
 if(m!==moves.length||c!==curves.length)return null;
 return paths.filter(p=>p.points.every(q=>q.every(Number.isFinite)));
}
const hex=n=>Math.round(Math.max(0,Math.min(1,n||0))*255).toString(16).padStart(2,'0');
const nextId=id=>{try{const raw=id.replace(/-/g,'');if(!/^[0-9a-f]{32}$/i.test(raw))return '';const n=(BigInt('0x'+raw)+1n).toString(16).padStart(32,'0').slice(-32).toUpperCase();return [n.slice(0,8),n.slice(8,12),n.slice(12,16),n.slice(16,20),n.slice(20)].join('-');}catch{return '';}};

/** Ink of one notes file, converted to page-normalised strokes the score viewer can edit. */
function readInk(bytes,page,report){
 const strokes=[],unit=n=>Math.round(Math.max(0,Math.min(1,n))*100000)/100000;
 for(const record of records(bytes)){
  let item;try{item=sub(fields(record),7);}catch{item=null;}
  if(!item)continue; // the id/clock header before each item
  const payload=first(item,2,2);
  if(!payload||!payload.length)continue;
  let paths;try{paths=inkPaths(payload);}catch{paths=null;}
  if(!paths){report.unsupported++;continue;}
  if(!paths.length||first(item,14,0))  {if(paths.length)report.deleted++;continue;} // an erased item keeps an empty path and a flag
  const colour=sub(item,4)||[],rgba=[1,2,3,4].map(f=>{const v=first(colour,f,5);return v?f32(v):0;});
  const alpha=rgba[3]>0?rgba[3]:1,tool=alpha<0.999?'highlighter':'pen';
  for(const path of paths){
   const width=Math.max(0.001,Math.min(0.06,(path.width>0?path.width:2)/page.width)),points=[];
   for(const [x,y] of path.points){const p=[unit(x/page.width),unit(y/page.height),0.5],last=points.at(-1);if(!last||last[0]!==p[0]||last[1]!==p[1])points.push(p);}
   for(let at=0;at<points.length;at+=LIMIT.points-1){
    const part=points.slice(at,at+LIMIT.points);if(at&&part.length<2)break;
    strokes.push({tool,color:'#'+hex(rgba[0])+hex(rgba[1])+hex(rgba[2]),opacity:Math.round(Math.max(0.05,Math.min(1,alpha))*1000)/1000,width:Math.round(width*100000)/100000,points:part});
   }
   report.strokes++;
  }
 }
 return strokes;
}

/**
 * @param {ArrayBuffer|Uint8Array} input the .goodnotes file
 * @returns {Promise<{title:string, pages:Array, outline:Array, sections:Array, report:object, readFile:Function}>}
 *   pages: [{id, width, height, pdf:{file, page}|null, strokes:[…]}] in notebook order
 *   sections: [{title, from, to, pages:[index…], strokes, untitled}] — the outline cut into songs
 */
async function read(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input),zip=directory(bytes);
 const eventsBytes=await zip.read('index.events.pb');
 if(!eventsBytes)throw fail('굿노트 파일이 아니에요. 굿노트에서 ‘GoodNotes 문서’로 내보낸 파일을 골라 주세요.','format');
 const report={strokes:0,deleted:0,unsupported:0,unmatchedNotes:0,pagesWithoutPdf:0,unknownEvents:{},schema:null};
 const schemaBytes=await zip.read('schema.pb');if(schemaBytes){try{report.schema=first(fields(schemaBytes),1,0)??null;}catch{}}
 const index=async name=>{const map=new Map(),data=await zip.read(name);if(data)for(const r of records(data)){try{const f=fields(r);map.set(str(first(f,1,2)).toUpperCase(),str(first(f,2,2)));}catch{}}return map;};
 const [attachmentPaths,notePaths]=[await index('index.attachments.pb'),await index('index.notes.pb')];
 let title='';const backgrounds=new Map(),pages=new Map(),outline=new Map();
 for(const record of records(eventsBytes)){
  let top;try{top=fields(record);}catch{continue;}
  const event=top.find(x=>x[0]!==1&&x[1]===2);if(!event)continue;
  let body;try{body=fields(event[2]);}catch{continue;}
  const kind=event[0];
  if(kind===30||kind===31){const name=reg(body,2);if(name)title=name;}
  else if(kind===2){
   const id=str(first(body,2,2)).toUpperCase(),size=sub(body,8),old=backgrounds.get(id)||{};
   backgrounds.set(id,{...old,attachment:str(first(body,4,2)).toUpperCase()||old.attachment||'',page:first(body,5,0)||old.page||0,
    width:size&&first(size,1,5)?f32(first(size,1,5)):old.width||0,height:size&&first(size,2,5)?f32(first(size,2,5)):old.height||0});
  }else if(kind===54){
   const id=str(first(body,2,2)).toUpperCase(),old=pages.get(id)||{};
   pages.set(id,{id,background:reg(body,3).toUpperCase()||old.background||'',order:reg(body,4)||old.order||''});
  }else if(kind===65){
   const id=str(first(body,2,2)).toUpperCase(),old=outline.get(id)||{};
   outline.set(id,{id,pageId:str(first(body,1,2)).toUpperCase()||old.pageId||'',title:reg(body,5)||old.title||'',order:reg(body,4)||old.order||''});
  }else if(![6,10,15,34,38,102,104,105,106,121].includes(kind))report.unknownEvents[kind]=(report.unknownEvents[kind]||0)+1;
 }
 const compare=(a,b)=>a<b?-1:a>b?1:0;
 const ordered=[...pages.values()].sort((a,b)=>compare(a.order,b.order)||compare(a.id,b.id));
 if(!ordered.length)throw fail('이 굿노트 파일에서 페이지를 찾지 못했어요.','empty');
 const usedNotes=new Set(),result=[];
 for(const p of ordered){
  const bg=backgrounds.get(p.background)||{},file=attachmentPaths.get(bg.attachment)||'';
  const page={id:p.id,width:bg.width>0?bg.width:595,height:bg.height>0?bg.height:842,pdf:file&&bg.page>=1&&zip.entries.has(file)?{file,page:bg.page}:null,strokes:[]};
  if(!page.pdf)report.pagesWithoutPdf++;
  // The page's ink file has the page id + 1. With a single page and a single ink file they belong together.
  let noteId=nextId(p.id);
  if(!notePaths.has(noteId)&&ordered.length===1&&notePaths.size===1)noteId=[...notePaths.keys()][0];
  const path=notePaths.get(noteId);
  if(path){usedNotes.add(noteId);const data=await zip.read(path);if(data){try{page.strokes=readInk(data,page,report);}catch{report.unsupported++;}}}
  result.push(page);
 }
 report.unmatchedNotes=[...notePaths.keys()].filter(id=>!usedNotes.has(id)).length;
 const at=new Map(result.map((p,i)=>[p.id,i]));
 const marks=[...outline.values()].filter(o=>o.title.trim()&&at.has(o.pageId)).sort((a,b)=>at.get(a.pageId)-at.get(b.pageId)||compare(a.order,b.order));
 const sections=[],span=(name,from,to,untitled=false)=>{const list=[];for(let i=from;i<=to;i++)list.push(i);sections.push({title:name,from:from+1,to:to+1,pages:list,strokes:list.reduce((n,i)=>n+result[i].strokes.length,0),untitled});};
 if(!marks.length)span(title||'굿노트 악보',0,result.length-1,true);
 else{
  // Several outline entries on one page: the first names the section.
  const starts=marks.filter((m,i)=>!i||at.get(m.pageId)!==at.get(marks[i-1].pageId));
  if(at.get(starts[0].pageId)>0)span((title||'굿노트 악보')+' (앞부분)',0,at.get(starts[0].pageId)-1,true);
  starts.forEach((m,i)=>span(m.title.trim().slice(0,120),at.get(m.pageId),i+1<starts.length?at.get(starts[i+1].pageId)-1:result.length-1));
 }
 return {title,pages:result,outline:marks.map(m=>({title:m.title.trim(),page:at.get(m.pageId)+1})),sections,report,readFile:name=>zip.read(name,LIMIT.entry)};
}
return {read,LIMIT,_internal:{lz4,unframe,tuple,inkPaths,fields,records,nextId}};
});
