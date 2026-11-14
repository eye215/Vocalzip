/* Local PDF copy export. Original PDF/R2 objects and annotation records are never changed. */
(() => {
'use strict';
const Ink=window.VzipScoreInk;let loading;
function library(){
 if(window.PDFLib)return Promise.resolve(window.PDFLib);
 if(!loading)loading=new Promise((resolve,reject)=>{
  const script=document.createElement('script');script.src='https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';script.crossOrigin='anonymous';
  script.onload=()=>window.PDFLib?resolve(window.PDFLib):reject(Error('PDF 내보내기 모듈을 확인하지 못했어요.'));
  script.onerror=()=>{script.remove();loading=null;reject(Error('PDF 내보내기 모듈을 불러오지 못했어요. 연결 후 다시 시도해 주세요.'));};document.head.append(script);
 });
 return loading;
}
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
async function make({document:source,binding,annotations,check=()=>{},onProgress=()=>{}}){
 check();
 if(!source||!binding||!Array.isArray(annotations)||annotations.some(s=>!Ink.valid(s)||s.ownerId!==binding.ownerId||s.songId!==binding.songId||s.scoreId!==binding.scoreId||s.r2Key!==binding.r2Key||s.pdfHash!==binding.pdfHash))throw Error('이 악보의 개인 필기인지 확인해 주세요.');
 const [lib,bytes]=await Promise.all([library(),source.getData()]);check();
 if(await digest(bytes)!==binding.pdfHash)throw Error('PDF 원본 버전이 바뀌어 내보내기를 중단했어요.');check();
 const output=await lib.PDFDocument.load(bytes,{updateMetadata:false});check();
 if(output.getPageCount()!==source.numPages)throw Error('PDF 페이지를 확인하지 못했어요.');
 const numbers=[...new Set(annotations.map(s=>s.page))].sort((a,b)=>a-b);
 if(numbers.some(n=>n<1||n>source.numPages))throw Error('필기의 PDF 페이지를 확인해 주세요.');
 for(const number of numbers){
  check();const original=await source.getPage(number),viewport=original.getViewport({scale:1}),page=output.getPage(number-1),crop=page.getCropBox();
  if(![crop.x,crop.y,crop.width,crop.height].every(Number.isFinite)||crop.width<=0||crop.height<=0)throw Error('PDF 페이지 크기를 확인하지 못했어요.');
  const scale=Math.min(2.5,2048/Math.max(crop.width,crop.height),Math.sqrt(4000000/(crop.width*crop.height))),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.ceil(crop.width*scale));canvas.height=Math.max(1,Math.ceil(crop.height*scale));const ctx=canvas.getContext('2d');
  try{
   // 스티커 메모 go under the handwriting, as in the viewer. Viewer page space → canvas, whatever the page rotation.
   const notes=annotations.filter(s=>s.page===number&&Ink.isNote(s));
   if(notes.length){
    const at=(vx,vy)=>{const [x,y]=viewport.convertToPdfPoint(vx,vy);return [(x-crop.x)*scale,(crop.y+crop.height-y)*scale];};
    const o=at(0,0),ex=at(1,0),ey=at(0,1),unit=Math.hypot(ex[0]-o[0],ex[1]-o[1]);
    ctx.save();ctx.setTransform(ex[0]-o[0],ex[1]-o[1],ey[0]-o[0],ey[1]-o[1],o[0],o[1]);
    for(const n of notes){
     check();const m=Ink.noteLayout(n,viewport.width,viewport.height,ctx),r=Math.min(m.radius,m.w/2,m.h/2);
     ctx.beginPath();ctx.moveTo(m.x+r,m.y);ctx.arcTo(m.x+m.w,m.y,m.x+m.w,m.y+m.h,r);ctx.arcTo(m.x+m.w,m.y+m.h,m.x,m.y+m.h,r);ctx.arcTo(m.x,m.y+m.h,m.x,m.y,r);ctx.arcTo(m.x,m.y,m.x+m.w,m.y,r);ctx.closePath();
     ctx.save();ctx.shadowColor='rgba(16,24,40,.18)';ctx.shadowBlur=.006*viewport.width*unit;ctx.shadowOffsetY=.002*viewport.width*unit;ctx.fillStyle=n.color;ctx.fill();ctx.restore();
     if(m.lines.length){ctx.save();ctx.clip();ctx.fillStyle=Ink.NOTE_INK;ctx.font='400 '+m.size+'px '+Ink.NOTE_FAMILY;ctx.textBaseline='alphabetic';for(const line of m.lines)ctx.fillText(line.text,line.x,line.y);ctx.restore();}
    }
    ctx.restore();
   }
   for(const s of annotations.filter(s=>s.page===number&&!Ink.isNote(s))){
    check();ctx.strokeStyle=s.color;ctx.globalAlpha=Ink.opacity(s);const origin=viewport.convertToPdfPoint(0,0),edge=viewport.convertToPdfPoint(s.width*viewport.width,0);ctx.lineWidth=Math.hypot(edge[0]-origin[0],edge[1]-origin[1])*scale;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
    let first;
    s.points.forEach((p,i)=>{
     const [x,y]=viewport.convertToPdfPoint(p[0]*viewport.width,p[1]*viewport.height),px=(x-crop.x)*scale,py=(crop.y+crop.height-y)*scale;
     if(!i){ctx.moveTo(px,py);first=[px,py];}else ctx.lineTo(px,py);
    });
    if(s.points.length===1)ctx.lineTo(first[0]+.01,first[1]);ctx.stroke();
   }
   const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('필기 이미지를 만들지 못했어요.')),'image/png'));check();
   const png=await output.embedPng(await blob.arrayBuffer());check();
   // Convert viewport ink back to the unrotated crop box; existing page rotation applies to both.
   page.drawImage(png,{x:crop.x,y:crop.y,width:crop.width,height:crop.height});
  }finally{canvas.width=0;canvas.height=0;}
  onProgress(number,source.numPages);await new Promise(resolve=>requestAnimationFrame(resolve));
 }
 check();const result=await output.save({objectsPerTick:20});check();return new Blob([result],{type:'application/pdf'});
}
window.VzipScoreInkExport={make};
})();
