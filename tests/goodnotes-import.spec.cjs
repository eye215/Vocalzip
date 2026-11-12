// GoodNotes notebook → scores: cut by the outline into per-song PDFs, handwriting moved as editable ink.
// Uses a synthetic notebook (tests/goodnotes-fixture.cjs); no real GoodNotes file is in the repository.
const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {boot,fakeR2}=require('./helpers/r2-fixture.cjs');
const F=require('./goodnotes-fixture.cjs');
const fs=require('node:fs'),path=require('node:path');
const PDFROOT=process.env.VZ_PDFJS_ROOT||'/tmp/vzip-score-pdfjs/node_modules/pdfjs-dist';

/** n pages of 300×400, each showing its page number. */
function pdf(n){
 const stream=text=>'<< /Length '+Buffer.byteLength(text)+' >>\nstream\n'+text+'\nendstream';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids ['+Array.from({length:n},(_,i)=>(4+i*2)+' 0 R').join(' ')+'] /Count '+n+' >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 for(let i=0;i<n;i++)objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 3 0 R >> >> /Contents '+(5+i*2)+' 0 R >>',stream('BT /F1 18 Tf 20 360 Td (Original page '+(i+1)+') Tj ET'));
 let out='%PDF-1.4\n';const offsets=[0];
 objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(out));out+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});
 const at=Buffer.byteLength(out);out+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+at+'\n%%EOF';
 return Buffer.from(out);
}
const line=(x0,y0,x1,y1,n=6)=>{const kinds=[0],curves=[];for(let i=1;i<=n;i++){kinds.push(1);curves.push([x0+(x1-x0)*(i-.5)/n,y0+(y1-y0)*(i-.5)/n,x0+(x1-x0)*i/n,y0+(y1-y0)*i/n]);}return {kinds,moves:[[x0,y0]],curves};};
const ink=(id,color,width,...xy)=>F.inkItem(F.uuid(id),{color,payload:F.stored(F.pathTuple({width,...line(...xy)}))});
async function setup(page){
 const r2=await fakeR2(page);
 await page.context().route('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/**',route=>{
  const suffix=new URL(route.request().url()).pathname.split('pdfjs-dist@4.10.38/')[1],file=path.join(PDFROOT,suffix);
  if(!suffix||suffix.includes('..')||!fs.existsSync(file))return route.abort();
  return route.fulfill({path:file,contentType:file.endsWith('.mjs')?'text/javascript':'application/octet-stream',headers:{'access-control-allow-origin':'*'}});
 });
 await page.context().route('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/**',route=>route.fulfill({path:path.join(PDFROOT,'../pdf-lib/dist/pdf-lib.min.js'),contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}}));
 await boot(page);
 await page.goto('/#/song/s1');await page.getByRole('tab',{name:'악보',exact:true}).click();
 return r2;
}
const pick=async(page,name,buffer)=>{
 await page.getByRole('button',{name:'PDF 올리기'}).click();
 await page.getByLabel('굿노트 파일',{exact:true}).setInputFiles({name,mimeType:'application/octet-stream',buffer});
};
const pdfPages=async buffer=>{const lib=require(path.join(PDFROOT,'../pdf-lib'));return (await lib.PDFDocument.load(buffer)).getPageCount();};

async function readStoredInk(page){
 return page.evaluate(()=>new Promise((resolve,reject)=>{
  const request=indexedDB.open('vzip_score_ink_v2',2);
  request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{
   const db=request.result,tx=db.transaction('strokes','readonly'),get=tx.objectStore('strokes').getAll();
   get.onsuccess=()=>resolve(get.result.map(s=>({scoreId:s.scoreId,songId:s.songId,page:s.page,tool:s.tool,color:s.color,opacity:s.opacity,width:s.width,first:s.points[0],last:s.points.at(-1),valid:window.VzipScoreInk.valid(s)})));
   get.onerror=()=>reject(get.error);
   tx.oncomplete=()=>db.close();
  };
 }));
}


test('a notebook is cut by its outline into per-song scores, and its handwriting arrives as editable ink',async({page})=>{
 const r2=await setup(page);
 const notebook=F.notebook({title:'내 악보집',pdf:pdf(5),width:300,height:400,pages:[
  {pdfPage:1,order:'a'},
  {pdfPage:2,order:'b',ink:[ink(1,[1,0,0,1],3,60,60,240,60)]},
  {pdfPage:3,order:'c',ink:[ink(2,[0,1,1,0.5],12,60,200,240,200)]},
  {pdfPage:4,order:'d'},
  {pdfPage:5,order:'e',ink:[ink(3,[0,0,1,1],3,60,300,240,300)]}],
  outline:[{page:1,title:'Defying Gravity (연습용)'},{page:3,title:'The River'}]});
 await pick(page,'내 악보집.goodnotes',notebook);
 const sheet=page.getByRole('dialog',{name:'굿노트 가져오기'});
 await expect(sheet.locator('[data-gn-summary]')).toHaveText('내 악보집 · 5쪽 · 개요 2개 · 필기 3획');
 const rows=sheet.locator('[data-gn-section]');await expect(rows).toHaveCount(3);
 await expect(rows.nth(0)).toContainText('1쪽 · 필기 없음');
 await expect(rows.nth(1)).toContainText('2–3쪽 · 필기 2획 · 수정 가능');
 await expect(rows.nth(2)).toContainText('4–5쪽 · 필기 1획 · 수정 가능');
 // The untitled first page is left out, the title that names an existing song goes to that song, the other becomes a new song.
 expect(await rows.locator('[data-gn-target]').evaluateAll(list=>list.map(s=>s.value))).toEqual(['skip','s1','new']);
 // Nothing is written before the user confirms.
 expect(r2.store.size).toBe(0);expect(await page.evaluate(()=>window.VZ.db.songs.length)).toBe(1);
 await sheet.getByRole('button',{name:'가져오기 (2곡)'}).click();
 await expect(page.locator('.toast')).toContainText('악보 2개를 가져왔어요 · 수정 가능한 필기 3획');
 await expect(sheet).toHaveCount(0);

 const db=await page.evaluate(()=>({songs:window.VZ.db.songs.map(s=>({id:s.id,title:s.title,scores:(s.scores||[]).map(x=>({id:x.id,title:x.title,pages:x.pages,source:x.source,r2Key:x.r2Key,size:x.size}))}))}));
 const importedInk=await readStoredInk(page);
 expect(db.songs.map(s=>s.title)).toEqual(['Defying Gravity','The River']);
 const [mine,river]=db.songs.map(s=>s.scores[0]);
 expect([mine.title,mine.pages,mine.source]).toEqual(['Defying Gravity (연습용)',2,'goodnotes']);
 expect([river.title,river.pages,river.source]).toEqual(['The River',2,'goodnotes']);
 // Only the two song PDFs were uploaded: never the notebook itself, never the untitled page.
 expect([...r2.store.keys()].sort()).toEqual([mine.r2Key,river.r2Key].sort());
 expect(await pdfPages(r2.store.get(mine.r2Key).bytes)).toBe(2);expect(await pdfPages(r2.store.get(river.r2Key).bytes)).toBe(2);
 expect(r2.store.get(mine.r2Key).bytes.includes(Buffer.from('Original page 2'))).toBe(true);
 expect(r2.store.get(mine.r2Key).bytes.includes(Buffer.from('Original page 4'))).toBe(false);
 expect(importedInk.every(s=>s.valid)).toBe(true);
 expect(importedInk.map(s=>[s.scoreId===mine.id?'mine':'river',s.page,s.tool,s.color,s.opacity])).toEqual([['mine',1,'pen','#ff0000',1],['mine',2,'highlighter','#00ffff',0.5],['river',2,'pen','#0000ff',1]]);
 expect([importedInk[0].first,importedInk[0].last,importedInk[0].width]).toEqual([[0.2,0.15,0.5],[0.8,0.15,0.5],0.01]);

 // The song's score list shows it, and the viewer draws the imported stroke where it was — and can erase it.
 await expect(page.locator('.score-row')).toContainText('Defying Gravity (연습용)');
 await page.getByRole('button',{name:'Defying Gravity (연습용) 열기',exact:true}).click();
 const viewer=page.getByRole('dialog',{name:'악보 개인 필기'});
 await expect(viewer.locator('[data-ink-save-state]')).toContainText('필기 준비됨',{timeout:20000});
 await expect(viewer.locator('[data-ink-page]')).toHaveText('1 / 2쪽');
 await expect(viewer.locator('path[data-stroke]')).toHaveCount(1);
 await viewer.getByRole('button',{name:'지우개',exact:true}).click();const box=await viewer.locator('[data-ink-svg]').boundingBox();
 await page.mouse.click(box.x+box.width*.5,box.y+box.height*.15);
 await expect(viewer.locator('path[data-stroke]')).toHaveCount(0);
 await expect.poll(async()=>(await readStoredInk(page)).length).toBe(2);
 expect(page.__errors).toEqual([]);
});
test('importing the same notebook again does not add the scores twice unless the user chooses to',async({page})=>{
 const r2=await setup(page);
 const notebook=F.notebook({title:'한 곡',pdf:pdf(2),width:300,height:400,pages:[{pdfPage:1,order:'a'},{pdfPage:2,order:'b'}],outline:[{page:0,title:'Defying Gravity'}]});
 await pick(page,'한 곡.goodnotes',notebook);
 let sheet=page.getByRole('dialog',{name:'굿노트 가져오기'});
 await sheet.getByRole('button',{name:'가져오기 (1곡)'}).click();
 await expect(page.locator('.toast')).toContainText('악보 1개를 가져왔어요');
 await pick(page,'한 곡.goodnotes',notebook);
 sheet=page.getByRole('dialog',{name:'굿노트 가져오기'});
 await expect(sheet.locator('[data-gn-section]')).toContainText('이미 가져온 악보예요');
 expect(await sheet.locator('[data-gn-target]').inputValue()).toBe('skip');
 await expect(sheet.locator('[data-gn-go]')).toBeDisabled();
 expect(r2.store.size).toBe(1);
});
test('950 handwriting strokes are imported as separately editable IndexedDB strokes',async({page})=>{
 const r2=await setup(page);
 const many=Array.from({length:950},(_,i)=>ink(100+i,[0,0,0,1],2,20+i%20*10,20+Math.floor(i/20)*7,26+i%20*10,24+Math.floor(i/20)*7));
 const notebook=F.notebook({title:'필기 많은 곡',pdf:pdf(1),width:300,height:400,pages:[{pdfPage:1,order:'a',ink:many}]});
 await pick(page,'필기 많은 곡.goodnotes',notebook);
 const sheet=page.getByRole('dialog',{name:'굿노트 가져오기'});
 await expect(sheet.locator('[data-gn-section]')).toContainText('필기 950획 · 수정 가능');
 await sheet.getByRole('button',{name:'가져오기 (1곡)'}).click();
 await expect(page.locator('.toast')).toContainText('악보 1개를 가져왔어요 · 수정 가능한 필기 950획');
 expect(r2.store.size).toBe(1);
 expect((await readStoredInk(page)).length).toBe(950);
 await page.reload();
 expect((await readStoredInk(page)).length).toBe(950);
});

test('a file that is not a GoodNotes notebook is refused and nothing is uploaded',async({page})=>{
 const r2=await setup(page);
 await pick(page,'악보.pdf',pdf(1));
 await expect(page.locator('.toast')).toContainText('굿노트 파일이 아니에요');
 await expect(page.getByRole('dialog',{name:'굿노트 가져오기'})).toHaveCount(0);
 expect(r2.store.size).toBe(0);
});
