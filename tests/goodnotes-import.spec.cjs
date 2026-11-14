// GoodNotes notebook → scores: cut by the outline into per-song PDFs; the handwriting travels inside each PDF
// (attached vocalzip-ink.json), so it reaches every device with the score and stays editable.
// Uses a synthetic notebook (tests/goodnotes-fixture.cjs); no real GoodNotes file is in the repository.
const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {boot,fakeR2,R2}=require('./helpers/r2-fixture.cjs');
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

/** The handwriting attached to an uploaded score PDF, read the way the viewer reads it (pdf.js). */
async function attached(bytes){
 const pdfjs=await import(path.join(PDFROOT,'legacy/build/pdf.mjs'));
 const doc=await pdfjs.getDocument({data:new Uint8Array(bytes),disableFontFace:true,useSystemFonts:false}).promise;
 const files=await doc.getAttachments(),file=Object.values(files||{}).find(f=>(f.filename||f.rawFilename)==='vocalzip-ink.json');
 const out=file?JSON.parse(Buffer.from(file.content).toString('utf8')):null;await doc.destroy();return out;
}
const open=async(page,title)=>{
 await page.getByRole('button',{name:title+' 열기',exact:true}).click();
 const viewer=page.getByRole('dialog',{name:'악보 개인 필기'});
 await expect(viewer.locator('[data-ink-save-state]')).toContainText('필기 준비됨',{timeout:20000});
 return viewer;
};
const strokesIn=viewer=>viewer.locator('path[data-stroke]');
async function act(dialog,name){
 const button=dialog.getByRole('button',{name,exact:true});
 if(!await button.isVisible())await dialog.locator('[data-ink-more]').click();
 await button.click();
}

test('a notebook is cut by its outline into per-song scores, and its handwriting travels inside each PDF as editable ink',async({page})=>{
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
 await expect(sheet.locator('[data-gn-summary]')).toHaveText('5쪽 · 2곡 · 필기 3획');
 const rows=sheet.locator('[data-gn-section]');await expect(rows).toHaveCount(3);
 await expect(rows.nth(0)).toContainText('1쪽 · 필기 없음');
 await expect(rows.nth(1)).toContainText('2–3쪽 · 필기 2획');
 await expect(rows.nth(2)).toContainText('4–5쪽 · 필기 1획');
 // The untitled first page is left out, the title that names an existing song goes to that song, the other becomes a new song.
 expect(await rows.locator('[data-gn-target]').evaluateAll(list=>list.map(s=>s.value))).toEqual(['skip','s1','new']);
 // Nothing is written before the user confirms.
 expect(r2.store.size).toBe(0);expect(await page.evaluate(()=>window.VZ.db.songs.length)).toBe(1);
 await sheet.getByRole('button',{name:'가져오기 (2곡)'}).click();
 await expect(page.locator('.toast')).toContainText('악보 2개를 가져왔어요 · 수정 가능한 필기 3획');
 await expect(sheet).toHaveCount(0);

 const db=await page.evaluate(()=>({songs:window.VZ.db.songs.map(s=>({id:s.id,title:s.title,scores:(s.scores||[]).map(x=>({id:x.id,title:x.title,pages:x.pages,source:x.source,r2Key:x.r2Key,size:x.size,importedStrokes:x.importedStrokes}))})),records:(window.VZ.db.scoreAnnotations||[]).length}));
 expect(db.songs.map(s=>s.title)).toEqual(['Defying Gravity','The River']);
 const [mine,river]=db.songs.map(s=>s.scores[0]);
 expect([mine.title,mine.pages,mine.source,mine.importedStrokes]).toEqual(['Defying Gravity (연습용)',2,'goodnotes',2]);
 expect([river.title,river.pages,river.source,river.importedStrokes]).toEqual(['The River',2,'goodnotes',1]);
 // Only the two song PDFs were uploaded: never the notebook itself, never the untitled page.
 expect([...r2.store.keys()].sort()).toEqual([mine.r2Key,river.r2Key].sort());
 expect(await pdfPages(r2.store.get(mine.r2Key).bytes)).toBe(2);expect(await pdfPages(r2.store.get(river.r2Key).bytes)).toBe(2);
 expect(r2.store.get(mine.r2Key).bytes.includes(Buffer.from('Original page 2'))).toBe(true);
 expect(r2.store.get(mine.r2Key).bytes.includes(Buffer.from('Original page 4'))).toBe(false);
 // The handwriting is inside each PDF, not in the account record (which syncs everywhere and has to stay small).
 expect(db.records).toBe(0);
 const a=await attached(r2.store.get(mine.r2Key).bytes),b=await attached(r2.store.get(river.r2Key).bytes);
 expect([a.format,a.version,a.source]).toEqual(['vocalzip-ink',1,'goodnotes']);
 expect(a.strokes.map(s=>[s.id,s.page,s.tool,s.color,s.opacity])).toEqual([['gn-'+mine.id+'-0',1,'pen','#ff0000',1],['gn-'+mine.id+'-1',2,'highlighter','#00ffff',0.5]]);
 expect([a.strokes[0].points[0],a.strokes[0].points.at(-1),a.strokes[0].width]).toEqual([[0.2,0.15,0.5],[0.8,0.15,0.5],0.01]);
 expect(b.strokes.map(s=>[s.page,s.color])).toEqual([[2,'#0000ff']]);

 // The viewer draws it where it was, and it is edited like any stroke: erase, undo, erase again.
 await expect(page.locator('.score-row')).toContainText('Defying Gravity (연습용)');
 let viewer=await open(page,'Defying Gravity (연습용)');
 await expect(viewer.locator('[data-ink-page]')).toHaveText('1 / 2쪽');
 await expect(strokesIn(viewer)).toHaveCount(1);
 await viewer.getByRole('button',{name:'지우개',exact:true}).click();let box=await viewer.locator('[data-ink-svg]').boundingBox();
 await page.mouse.click(box.x+box.width*.5,box.y+box.height*.15);
 await expect(strokesIn(viewer)).toHaveCount(0);
 expect(await page.evaluate(id=>window.VZ.db.deleted.scoreAnnotations.includes(id),'gn-'+mine.id+'-0')).toBe(true);
 await act(viewer,'필기 되돌리기');
 await expect(strokesIn(viewer)).toHaveCount(1);
 expect(await page.evaluate(()=>window.VZ.db.scoreAnnotations.length)).toBe(1); // the restored copy is an ordinary synced stroke
 if(!await viewer.getByRole('button',{name:'지우개',exact:true}).isVisible())await viewer.locator('[data-ink-more]').click();
 await viewer.getByRole('button',{name:'지우개',exact:true}).click();
 box=await viewer.locator('[data-ink-svg]').boundingBox();await page.mouse.click(box.x+box.width*.5,box.y+box.height*.15);
 await expect(strokesIn(viewer)).toHaveCount(0);
 await viewer.getByRole('button',{name:'돌아가기',exact:true}).click();

 // Another device: nothing of this one's local copies, only the synced account record and the PDF in R2.
 await page.evaluate(async()=>{for(const k of Object.keys(localStorage))if(k.startsWith('vzip_score_ink_v1:'))localStorage.removeItem(k);for(const n of await caches.keys())await caches.delete(n);});
 await page.reload();await page.getByRole('tab',{name:'악보',exact:true}).click();
 viewer=await open(page,'Defying Gravity (연습용)');
 await expect(strokesIn(viewer)).toHaveCount(0); // still erased
 await viewer.getByRole('button',{name:'다음 악보 페이지',exact:true}).click();
 await expect(viewer.locator('[data-ink-page]')).toHaveText('2 / 2쪽');
 await expect(strokesIn(viewer)).toHaveCount(1); // the other imported stroke arrived with the PDF
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
test('950 handwriting strokes all stay editable and reach the viewer through the PDF, with no cap and no flattening',async({page})=>{
 const r2=await setup(page);
 const many=Array.from({length:950},(_,i)=>ink(100+i,[0,0,0,1],2,20+i%20*10,20+Math.floor(i/20)*7,26+i%20*10,24+Math.floor(i/20)*7));
 const notebook=F.notebook({title:'필기 많은 곡',pdf:pdf(1),width:300,height:400,pages:[{pdfPage:1,order:'a',ink:many}]});
 await pick(page,'필기 많은 곡.goodnotes',notebook);
 const sheet=page.getByRole('dialog',{name:'굿노트 가져오기'});
 await expect(sheet.locator('[data-gn-section]')).toContainText('필기 950획');
 // Started from this song's page with a single section: it goes to this song.
 expect(await sheet.locator('[data-gn-target]').inputValue()).toBe('s1');
 await sheet.getByRole('button',{name:'가져오기 (1곡)'}).click();
 await expect(page.locator('.toast')).toContainText('악보 1개를 가져왔어요 · 수정 가능한 필기 950획');
 expect(r2.store.size).toBe(1);
 const [stored]=[...r2.store.values()];
 expect((await attached(stored.bytes)).strokes).toHaveLength(950);
 expect(stored.bytes.includes(Buffer.from('/Type /Annot'))).toBe(false);
 expect(await page.evaluate(()=>(window.VZ.db.scoreAnnotations||[]).length)).toBe(0);
 const title=await page.evaluate(()=>window.VZ.db.songs[0].scores[0].title);
 const viewer=await open(page,title);
 await expect(strokesIn(viewer)).toHaveCount(950);
});
test('a failed save loses nothing: drawn and erased strokes are journaled on the device and completed on the next open',async({page})=>{
 await setup(page);
 const notebook=F.notebook({title:'저장 실패',pdf:pdf(1),width:300,height:400,pages:[{pdfPage:1,order:'a',ink:[ink(1,[1,0,0,1],3,60,60,240,60),ink(2,[0,0,1,1],3,60,300,240,300)]}]});
 await pick(page,'저장 실패.goodnotes',notebook);
 await page.getByRole('dialog',{name:'굿노트 가져오기'}).getByRole('button',{name:'가져오기 (1곡)'}).click();
 await expect(page.locator('.toast')).toContainText('수정 가능한 필기 2획');
 const {title,scoreId}=await page.evaluate(()=>({title:window.VZ.db.songs[0].scores[0].title,scoreId:window.VZ.db.songs[0].scores[0].id}));
 let viewer=await open(page,title);await expect(strokesIn(viewer)).toHaveCount(2);
 // The account record cannot be written. A new stroke stays on screen, an erase is applied, and 다시 저장 is offered.
 await page.evaluate(()=>{window.VZ.change=()=>false;});
 await act(viewer,'펜');let box=await viewer.locator('[data-ink-svg]').boundingBox();
 await page.mouse.move(box.x+box.width*.2,box.y+box.height*.5);await page.mouse.down();await page.mouse.move(box.x+box.width*.8,box.y+box.height*.5,{steps:5});await page.mouse.up();
 await expect(viewer.getByRole('button',{name:'다시 저장',exact:true})).toBeVisible();
 await expect(strokesIn(viewer)).toHaveCount(3);
 await viewer.getByRole('button',{name:'돌아가기',exact:true}).click();await expect(viewer).toBeVisible(); // it does not close on unsaved ink
 // Reload (saving works again): the device's journal completes the stroke, nothing disappears and nothing comes back.
 await page.reload();await page.getByRole('tab',{name:'악보',exact:true}).click();
 viewer=await open(page,title);await expect(strokesIn(viewer)).toHaveCount(3);
 await act(viewer,'지우개');box=await viewer.locator('[data-ink-svg]').boundingBox();
 await page.evaluate(()=>{window.__change=window.VZ.change;window.VZ.change=()=>false;});
 await page.mouse.click(box.x+box.width*.5,box.y+box.height*.15);
 await expect(viewer.getByRole('button',{name:'다시 저장',exact:true})).toBeVisible();
 await expect(strokesIn(viewer)).toHaveCount(2);
 await page.reload();await page.getByRole('tab',{name:'악보',exact:true}).click();
 viewer=await open(page,title);await expect(strokesIn(viewer)).toHaveCount(2); // the erase was kept, the imported stroke did not return
 const root=await page.evaluate(id=>({drawn:window.VZ.db.scoreAnnotations.length,erased:window.VZ.db.deleted.scoreAnnotations.includes(id)}),'gn-'+scoreId+'-0');
 expect(root).toEqual({drawn:1,erased:true}); // both reached the synced account record
 expect(page.__errors).toEqual([]);
});
test('rows ticked in order are joined into one score; repeated page names start joined; a joined row can be split again',async({page})=>{
 const r2=await setup(page);
 // Every page has its own name (no outline made by hand): the first song names both of its pages the same.
 const notebook=F.notebook({title:'쪽마다 이름',pdf:pdf(6),width:300,height:400,pages:[
  {pdfPage:1,order:'a'},{pdfPage:2,order:'b'},{pdfPage:3,order:'c'},{pdfPage:4,order:'d',ink:[ink(1,[1,0,0,1],3,60,60,240,60)]},{pdfPage:5,order:'e'},{pdfPage:6,order:'f'}],
  outline:[{page:0,title:'Song A'},{page:1,title:'Song A'},{page:2,title:'B 1'},{page:3,title:'B 2'},{page:4,title:'B 3'},{page:5,title:'C'}]});
 await pick(page,'쪽마다 이름.goodnotes',notebook);
 const sheet=page.getByRole('dialog',{name:'굿노트 가져오기'}),rows=sheet.locator('[data-gn-section]');
 const titles=()=>rows.locator('[data-gn-title]').evaluateAll(list=>list.map(i=>i.value));
 await expect(rows).toHaveCount(5);
 expect(await titles()).toEqual(['Song A','B 1','B 2','B 3','C']);
 await expect(rows.nth(0)).toContainText('1–2쪽 · 필기 없음 · 2개 합침');
 // Not next to each other: offered, but not allowed.
 await rows.nth(0).locator('[data-gn-pick]').check();await rows.nth(4).locator('[data-gn-pick]').check();
 await expect(sheet.locator('[data-gn-merge]')).toBeDisabled();await expect(sheet.locator('[data-gn-mergehint]')).toHaveText('이웃한 줄만 합칠 수 있어요');
 await rows.nth(0).locator('[data-gn-pick]').uncheck();await rows.nth(4).locator('[data-gn-pick]').uncheck();
 await expect(sheet.locator('[data-gn-mergebar]')).toBeHidden();
 // B 1, B 2, B 3 ticked in order → one score.
 for(const i of [1,2,3])await rows.nth(i).locator('[data-gn-pick]').check();
 await sheet.getByRole('button',{name:'한 곡으로 합치기'}).click();
 await expect(rows).toHaveCount(3);
 await expect(rows.nth(1)).toContainText('3–5쪽 · 필기 1획 · 3개 합침');
 await rows.nth(1).locator('[data-gn-title]').fill('Song B');
 // A joined row splits back into its sections.
 await rows.nth(0).getByRole('button',{name:'Song A 나누기'}).click();
 expect(await titles()).toEqual(['Song A','Song A','Song B','C']);
 await rows.nth(0).locator('[data-gn-pick]').check();await rows.nth(1).locator('[data-gn-pick]').check();
 await sheet.getByRole('button',{name:'한 곡으로 합치기'}).click();
 expect(await titles()).toEqual(['Song A','Song B','C']); // the renamed Song B kept its name
 await sheet.getByRole('button',{name:'가져오기 (3곡)'}).click();
 await expect(page.locator('.toast')).toContainText('악보 3개를 가져왔어요 · 수정 가능한 필기 1획');
 const scores=await page.evaluate(()=>window.VZ.db.songs.flatMap(s=>(s.scores||[]).map(x=>({title:x.title,pages:x.pages,r2Key:x.r2Key}))));
 expect(scores.map(s=>[s.title,s.pages])).toEqual([['Song A',2],['Song B',3],['C',1]]);
 const b=scores.find(s=>s.title==='Song B'),bytes=r2.store.get(b.r2Key).bytes;
 expect(await pdfPages(bytes)).toBe(3);
 expect(bytes.includes(Buffer.from('Original page 3'))&&bytes.includes(Buffer.from('Original page 5'))&&!bytes.includes(Buffer.from('Original page 6'))).toBe(true);
 expect((await attached(bytes)).strokes.map(s=>s.page)).toEqual([2]); // page 4 of the notebook is page 2 of Song B
});
test('ticking rows imports only those songs, even one set to 가져오지 않기; select-all toggles every row',async({page})=>{
 const r2=await setup(page);
 const notebook=F.notebook({title:'세 곡',pdf:pdf(3),width:300,height:400,pages:[{pdfPage:1,order:'a'},{pdfPage:2,order:'b'},{pdfPage:3,order:'c'}],
  outline:[{page:0,title:'Song A'},{page:1,title:'Song B'},{page:2,title:'Song C'}]});
 await pick(page,'세 곡.goodnotes',notebook);
 const sheet=page.getByRole('dialog',{name:'굿노트 가져오기'}),rows=sheet.locator('[data-gn-section]'),go=sheet.locator('button[type=submit]');
 await expect(rows).toHaveCount(3);
 await expect(go).toHaveText('가져오기 (3곡)');
 await sheet.getByRole('button',{name:'전체 선택'}).click();
 await expect(rows.locator('[data-gn-pick]:checked')).toHaveCount(3);
 await expect(go).toHaveText('선택한 3곡 가져오기');
 await sheet.getByRole('button',{name:'선택 해제'}).click();
 await expect(rows.locator('[data-gn-pick]:checked')).toHaveCount(0);
 await expect(go).toHaveText('가져오기 (3곡)');
 // Song A and Song C ticked; Song C had been set to 가져오지 않기, but ticking it means "this one".
 await rows.nth(2).locator('[data-gn-target]').selectOption('skip');
 await expect(rows.nth(2)).toHaveAttribute('data-skip','true'); // shown dimmed: it will not be imported
 // Each song is one compact card, so a notebook with dozens of songs stays scannable on a phone.
 for(const box of await rows.evaluateAll(list=>list.map(r=>r.getBoundingClientRect().height)))expect(box).toBeLessThan(150);
 await rows.nth(0).locator('[data-gn-pick]').check();await rows.nth(2).locator('[data-gn-pick]').check();
 await expect(rows.nth(2)).toHaveAttribute('data-skip','false');
 await expect(sheet.locator('[data-gn-count]')).toHaveText('2곡 선택');
 await expect(go).toHaveText('선택한 2곡 가져오기');
 await expect(sheet.locator('[data-gn-merge]')).toBeDisabled(); // not neighbours, so they cannot be joined
 await go.click();
 await expect(page.locator('.toast')).toContainText('악보 2개를 가져왔어요');
 const scores=await page.evaluate(()=>window.VZ.db.songs.flatMap(s=>(s.scores||[]).map(x=>x.title)));
 expect(scores.sort()).toEqual(['Song A','Song C']);
 expect(r2.store.size).toBe(2);
 // The sheet stays open with Song B still to import; the imported rows are locked.
 await expect(rows.nth(0)).toContainText('가져왔어요');await expect(rows.nth(0).locator('[data-gn-pick]')).toBeDisabled();
 await expect(rows.nth(1)).not.toContainText('가져왔어요');
 // The result sits right above the button, in view however long the list is.
 await expect(page.locator('.sheet-foot [data-gn-msg]')).toHaveText('악보 2개를 가져왔어요. 남은 곡도 골라서 가져올 수 있어요.');
 await expect(go).toHaveText('가져오기 (1곡)');
 await go.click();
 await expect(sheet).toHaveCount(0);
 expect(r2.store.size).toBe(3);
});
test('넣을 곡 opens the app song picker: a searchable song page where 새 곡으로 추가 and 가져오지 않기 always stay',async({page})=>{
 const r2=await setup(page);
 const ids=await page.evaluate(()=>['Kaleidoscope','Burn','The Wizard and I','Popular','Maybe This Time','Memory','On My Own','Bring Him Home'].map(t=>window.VZ.addSong(t).id));
 const notebook=F.notebook({title:'한 곡',pdf:pdf(1),width:300,height:400,pages:[{pdfPage:1,order:'a'}],outline:[{page:0,title:'Untitled Medley'}]});
 await pick(page,'한 곡.goodnotes',notebook);
 const sheet=page.getByRole('dialog',{name:'굿노트 가져오기'}),row=sheet.locator('[data-gn-section]').first();
 const button=row.locator('.gn-target .pick-btn');
 await expect(button).toContainText('Defying Gravity'); // a lone section started from a song's page goes to that song
 await button.click();
 const picker=page.getByRole('dialog',{name:'넣을 곡'});
 await picker.getByRole('searchbox').fill('kalei');
 await expect(picker.locator('.pick-row:visible')).toHaveText(['새 곡으로 추가','Kaleidoscope','가져오지 않기']);
 await picker.getByRole('option',{name:'Kaleidoscope'}).click();
 await expect(picker).toHaveCount(0);
 await expect(button).toContainText('Kaleidoscope');
 expect(await row.locator('[data-gn-target]').inputValue()).toBe(ids[0]);
 await sheet.getByRole('button',{name:'가져오기 (1곡)'}).click();
 await expect(page.locator('.toast')).toContainText('악보 1개를 가져왔어요');
 expect(await page.evaluate(id=>window.VZ.song(id).scores.map(x=>x.title),ids[0])).toEqual(['Untitled Medley']);
 expect(r2.store.size).toBe(1);
});
test('importing shows a progress popup (song n/total, step, bar); 멈추기 stops after the current step and 가져오기 resumes without uploading twice',async({page})=>{
 const r2=await setup(page);
 // Hold the first upload's completion so the popup can be seen mid-import.
 let release,held=0;const gate=new Promise(r=>{release=r;});
 await page.route(R2+'/**',async route=>{if(/\/v1\/uploads\/[^/]+\/complete$/.test(new URL(route.request().url()).pathname)&&!held++)await gate;return route.fallback();});
 const notebook=F.notebook({title:'두 곡',pdf:pdf(2),width:300,height:400,pages:[{pdfPage:1,order:'a'},{pdfPage:2,order:'b'}],outline:[{page:0,title:'Song A'},{page:1,title:'Song B'}]});
 await pick(page,'두 곡.goodnotes',notebook);
 const sheet=page.getByRole('dialog',{name:'굿노트 가져오기'});
 await sheet.getByRole('button',{name:'가져오기 (2곡)'}).click();
 const pop=page.getByRole('alertdialog',{name:'악보 가져오는 중'});
 await expect(pop).toBeVisible();
 await expect(pop).toContainText('1 / 2곡 · Song A');
 await expect(pop.locator('[data-gn-pstep]')).toContainText('올리는 중');
 expect(Number(await pop.getByRole('progressbar').getAttribute('aria-valuenow'))).toBeGreaterThan(0);
 await pop.getByRole('button',{name:'멈추기'}).click();
 await expect(pop.getByRole('button',{name:'지금 단계를 마치고 멈춰요'})).toBeDisabled();
 release();
 const stopped=page.getByRole('alertdialog',{name:'가져오기를 멈췄어요'});
 await expect(stopped).toContainText('다시 누르면 이어서 해요');
 expect(await page.evaluate(()=>window.VZ.db.songs.flatMap(s=>s.scores||[]).length)).toBe(0); // stopped before saving
 expect(r2.store.size).toBe(1);
 await stopped.getByRole('button',{name:'확인'}).click();
 await expect(stopped).toBeHidden();
 await expect(sheet.locator('[data-gn-msg]')).toContainText('가져오기를 멈췄어요');
 // Resume: Song A's finished upload is reused, Song B is uploaded, and the popup closes with the page.
 await sheet.getByRole('button',{name:'가져오기 (2곡)'}).click();
 await expect(page.locator('.toast')).toContainText('악보 2개를 가져왔어요');
 await expect(page.locator('[data-gn-progress]')).toHaveCount(0);
 expect(r2.store.size).toBe(2);
 expect(await page.evaluate(()=>window.VZ.db.songs.flatMap(s=>(s.scores||[]).map(x=>x.title)).sort())).toEqual(['Song A','Song B']);
});
test('a notebook whose PDF is locked with an owner password only (as bought scores often are) imports readable pages; one that needs a password is refused',async({page})=>{
 const r2=await setup(page);
 const locked=name=>fs.readFileSync(path.join(__dirname,'encrypted-pdf',name+'.pdf'));
 const notebook=F.notebook({title:'잠긴 악보',pdf:locked('aes-256'),width:300,height:400,pages:[
  {pdfPage:1,order:'a'},{pdfPage:2,order:'b',ink:[ink(1,[1,0,0,1],3,60,60,240,60)]},{pdfPage:3,order:'c'}],
  outline:[{page:0,title:'Song A'},{page:2,title:'Song C'}]});
 await pick(page,'잠긴 악보.goodnotes',notebook);
 const sheet=page.getByRole('dialog',{name:'굿노트 가져오기'});
 await sheet.getByRole('button',{name:'가져오기 (2곡)'}).click();
 await expect(page.locator('.toast')).toContainText('악보 2개를 가져왔어요 · 수정 가능한 필기 1획');
 const scores=await page.evaluate(()=>window.VZ.db.songs.flatMap(s=>(s.scores||[]).map(x=>({title:x.title,r2Key:x.r2Key}))));
 const a=r2.store.get(scores.find(s=>s.title==='Song A').r2Key).bytes;
 expect(a.includes(Buffer.from('/Encrypt'))).toBe(false);
 const pdfjs=await import(path.join(PDFROOT,'legacy/build/pdf.mjs'));
 const doc=await pdfjs.getDocument({data:new Uint8Array(a),disableFontFace:true,useSystemFonts:false}).promise;
 const text=[];for(let i=1;i<=doc.numPages;i++)text.push((await (await doc.getPage(i)).getTextContent()).items.map(t=>t.str).join(''));await doc.destroy();
 expect(text).toEqual(['Original page 1','Original page 2']);
 expect((await attached(a)).strokes.map(s=>s.page)).toEqual([2]);
 // Needs a password to open: a plain reason, nothing uploaded.
 const before=r2.store.size;
 await pick(page,'비밀번호.goodnotes',F.notebook({title:'비밀번호',pdf:locked('aes-256-user-password'),width:300,height:400,pages:[{pdfPage:1,order:'a'}]}));
 await page.getByRole('dialog',{name:'굿노트 가져오기'}).getByRole('button',{name:'가져오기 (1곡)'}).click();
 await expect(page.getByRole('dialog',{name:'굿노트 가져오기'}).locator('[data-gn-msg]')).toContainText('비밀번호가 있어야 열리는 PDF예요');
 expect(r2.store.size).toBe(before);
});
test('a file that is not a GoodNotes notebook is refused and nothing is uploaded',async({page})=>{
 const r2=await setup(page);
 await pick(page,'악보.pdf',pdf(1));
 await expect(page.locator('.toast')).toContainText('굿노트 파일이 아니에요');
 await expect(page.getByRole('dialog',{name:'굿노트 가져오기'})).toHaveCount(0);
 expect(r2.store.size).toBe(0);
});

/* ---- MR 녹음: audio recorded in the notebook (the owner records each song's MR there, titled with the song). ---- */
const mrRows=sheet=>sheet.locator('[data-gn-rec]');
const mrTargets=sheet=>mrRows(sheet).locator('[data-gn-mrtarget]').evaluateAll(list=>list.map(s=>s.value));
const mrOf=(page,id)=>page.evaluate(id=>(window.VZ.song(id).mrTracks||[]).filter(t=>!t.deleted).map(t=>({title:t.title,fileName:t.fileName,type:t.type,kind:t.kind,size:t.size,source:t.source,r2Key:t.r2Key})),id);
test('the notebook’s recordings are offered as MR: each goes to the song its title or its score names, with the original bytes; a second import recognises them',async({page})=>{
 const r2=await setup(page);
 const honey=await page.evaluate(()=>window.VZ.addSong('Honey Honey').id);
 const audio=[F.m4a(1,300),F.m4a(2,2000),F.m4a(3,700),F.m4a(4,90),F.m4a(5,64)];
 const notebook=F.notebook({title:'레슨 노트',pdf:pdf(3),width:300,height:400,pages:[{pdfPage:1,order:'a'},{pdfPage:2,order:'b'},{pdfPage:3,order:'c'}],
  outline:[{page:0,title:'03. Honey Honey'},{page:1,title:'21. The winner takes it all'}],
  recordings:[
   {title:'03. Honey Honey',seconds:56,bytes:audio[0]},              // its score row goes to the song "Honey Honey"
   {title:'옛 이름',renames:[{title:'21. The winner takes it all',counter:4}],seconds:260,bytes:audio[1]}, // its score row makes a new song
   {title:'지운 녹음',seconds:99,deleted:true},
   {title:'07) Defying Gravity',seconds:125,bytes:audio[2]},         // no score row: the song the title names
   {title:'모르는 노래',seconds:61,bytes:audio[3]},                    // names nothing: never guessed
   {seconds:3.6,bytes:audio[4]}]});                                  // no title
 await pick(page,'레슨 노트.goodnotes',notebook);
 const sheet=page.getByRole('dialog',{name:'굿노트 가져오기'}),rows=mrRows(sheet),go=sheet.locator('button[type=submit]');
 await expect(sheet.locator('[data-gn-summary]')).toHaveText('3쪽 · 2곡 · 필기 0획 · 녹음 5개');
 await expect(sheet.locator('[data-gn-mr]')).toContainText('MR 녹음 5개');
 await expect(rows).toHaveCount(5);
 await expect(rows.locator('.gn-mr-title')).toHaveText(['03. Honey Honey','21. The winner takes it all','07) Defying Gravity','모르는 노래','제목 없는 녹음']);
 await expect(rows.locator('[data-gn-info]')).toHaveText([/^길이 0:56 · /,/^길이 4:20 · /,/^길이 2:05 · /,/^길이 1:01 · /,/^길이 0:04 · /]);
 expect(await sheet.locator('[data-gn-target]').evaluateAll(list=>list.map(s=>s.value))).toEqual([honey,'new']);
 expect(await mrTargets(sheet)).toEqual([honey,'score','s1','skip','skip']);
 await expect(rows.nth(1).locator('.pick-btn')).toContainText('악보와 같은 새 곡');
 await expect(go).toHaveText('가져오기 (악보 2 · MR 3)');
 await expect(sheet.locator('[data-gn-diag]')).toContainText('녹음 5개(지운 것 1)');
 // The MR follows its score row: not imported → nowhere (nothing else names that song); a song chosen there → that song.
 const winner=sheet.locator('[data-gn-section]').nth(1).locator('[data-gn-target]');
 await winner.selectOption('skip');
 expect(await mrTargets(sheet)).toEqual([honey,'skip','s1','skip','skip']);
 await expect(go).toHaveText('가져오기 (악보 1 · MR 2)');
 await winner.selectOption('s1');
 expect(await mrTargets(sheet)).toEqual([honey,'s1','s1','skip','skip']);
 await winner.selectOption('new');
 expect(await mrTargets(sheet)).toEqual([honey,'score','s1','skip','skip']);
 // 전체 선택 counts both kinds; rows that are not ticked are imported by their 넣을 곡.
 await sheet.getByRole('button',{name:'전체 선택'}).click();
 await expect(sheet.locator('[data-gn-count]')).toHaveText('악보 2 · MR 5 선택');
 await expect(go).toHaveText('선택한 악보 2 · MR 5 가져오기');
 await sheet.getByRole('button',{name:'선택 해제'}).click();
 await rows.nth(0).locator('[data-gn-pick]').check();
 await expect(go).toHaveText('선택한 MR 1개 가져오기');
 await rows.nth(0).locator('[data-gn-pick]').uncheck();
 await expect(go).toHaveText('가져오기 (악보 2 · MR 3)');
 // A narrow phone: nothing runs off the side.
 const size=page.viewportSize();
 await page.setViewportSize({width:320,height:700});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
 for(const edge of await sheet.locator('[data-gn-rec],[data-gn-rec] .pick-btn,[data-gn-mr] .gn-summary').evaluateAll(list=>list.map(e=>e.getBoundingClientRect().right)))expect(edge).toBeLessThanOrEqual(320);
 await page.setViewportSize(size);
 // Nothing leaves the device before 가져오기.
 expect(r2.store.size).toBe(0);
 expect(await page.evaluate(()=>window.VZ.db.songs.flatMap(s=>s.mrTracks||[]).length)).toBe(0);
 await go.click();
 await expect(page.locator('.toast')).toContainText('악보 2개 · MR 3개를 가져왔어요');
 await expect(sheet).toHaveCount(0);

 const created=await page.evaluate(()=>window.VZ.db.songs.find(s=>s.title==='21. The winner takes it all')?.id);
 expect(created).toBeTruthy();
 const [a,b,c]=[await mrOf(page,honey),await mrOf(page,created),await mrOf(page,'s1')];
 expect(a.map(t=>[t.title,t.fileName,t.type,t.kind,t.size,t.source])).toEqual([['03. Honey Honey','03. Honey Honey.m4a','audio/mp4','file',audio[0].length,'goodnotes']]);
 expect(b.map(t=>[t.title,t.fileName,t.size,t.source])).toEqual([['21. The winner takes it all','21. The winner takes it all.m4a',audio[1].length,'goodnotes']]);
 expect(c.map(t=>[t.title,t.fileName,t.size,t.source])).toEqual([['07) Defying Gravity','07) Defying Gravity.m4a',audio[2].length,'goodnotes']]);
 // The stored files are the notebook's bytes, untouched; the unmatched and untitled recordings were not uploaded.
 for(const [track,bytes] of [[a[0],audio[0]],[b[0],audio[1]],[c[0],audio[2]]]){
  const stored=r2.store.get(track.r2Key);
  expect(stored.type).toBe('audio/mp4');expect(track.r2Key.endsWith('.m4a')).toBe(true);
  expect(Buffer.compare(stored.bytes,bytes)).toBe(0);
 }
 expect(r2.store.size).toBe(5); // two score PDFs + three MR files
 expect(await page.evaluate(id=>window.VZ.song(id).scores.length,created)).toBe(1); // the MR went to the song its score made

 // It is in the song's 레퍼런스 › MR list like a file the user added.
 await page.goto('/#/song/s1');await page.locator('[data-tab=ar]').click();
 await expect(page.locator('.vz-mr-links [data-mr-open]')).toContainText('07) Defying Gravity');
 await expect(page.locator('.vz-mr-links [data-mr-open] small')).toHaveText('07) Defying Gravity.m4a');

 // The same notebook again: the three are recognised and left out; one of the others can still be placed by hand.
 await page.getByRole('tab',{name:'악보',exact:true}).click();
 await pick(page,'레슨 노트.goodnotes',notebook);
 const again=page.getByRole('dialog',{name:'굿노트 가져오기'}),rows2=mrRows(again),go2=again.locator('button[type=submit]');
 await expect(rows2).toHaveCount(5);
 for(const i of [0,1,2])await expect(rows2.nth(i)).toContainText('이미 가져온 MR이에요');
 for(const i of [3,4])await expect(rows2.nth(i)).not.toContainText('이미 가져온 MR이에요');
 expect(await mrTargets(again)).toEqual(['skip','skip','skip','skip','skip']);
 await expect(go2).toBeDisabled();
 await rows2.nth(3).locator('[data-gn-mrtarget]').selectOption('s1');
 await expect(go2).toHaveText('가져오기 (MR 1개)');
 await go2.click();
 await expect(page.locator('.toast')).toContainText('MR 1개를 가져왔어요');
 await expect(again).toHaveCount(0);
 expect(r2.store.size).toBe(6);
 expect((await mrOf(page,'s1')).map(t=>t.title)).toEqual(['07) Defying Gravity','모르는 노래']);
 expect(page.__errors).toEqual([]);
});
test('a recording that cannot be imported is named and the others still go in; the progress popup can stop an MR upload and resume without uploading twice',async({page})=>{
 const r2=await setup(page);
 let release,held=0;const gate=new Promise(r=>{release=r;});
 await page.route(R2+'/**',async route=>{if(/\/v1\/uploads\/[^/]+\/complete$/.test(new URL(route.request().url()).pathname)&&!held++)await gate;return route.fallback();});
 const good=F.m4a(9,500),other=F.m4a(8,400);
 const notebook=F.notebook({title:'녹음만',pdf:pdf(1),width:300,height:400,pages:[{pdfPage:1,order:'a'}],outline:[{page:0,title:'악보 한 장'}],recordings:[
  {title:'1. Defying Gravity',seconds:30,bytes:good},
  {title:'Defying Gravity 2절',seconds:40,bytes:Buffer.from('this is not an audio file at all, only text')},
  {title:'02 - Defying Gravity',seconds:50,bytes:other}]});
 await pick(page,'녹음만.goodnotes',notebook);
 const sheet=page.getByRole('dialog',{name:'굿노트 가져오기'}),rows=mrRows(sheet),go=sheet.locator('button[type=submit]');
 await expect(rows).toHaveCount(3);
 expect(await mrTargets(sheet)).toEqual(['s1','s1','s1']);
 // Only the recordings: the score row is left out, so no PDF tool is needed.
 await sheet.locator('[data-gn-section] [data-gn-target]').selectOption('skip');
 await expect(go).toHaveText('가져오기 (MR 3개)');
 await go.click();
 const pop=page.getByRole('alertdialog',{name:'MR 가져오는 중'});
 await expect(pop).toContainText('MR 1 / 3 · 1. Defying Gravity');
 await expect(pop.locator('[data-gn-pstep]')).toContainText('올리는 중');
 await pop.getByRole('button',{name:'멈추기'}).click();
 release();
 const stopped=page.getByRole('alertdialog',{name:'가져오기를 멈췄어요'});
 await expect(stopped).toContainText('다시 누르면 이어서 해요');
 expect(await mrOf(page,'s1')).toEqual([]); // stopped before the list was saved
 expect(r2.store.size).toBe(1);
 await stopped.getByRole('button',{name:'확인'}).click();
 // Resume: the finished upload is reused; the file that is not audio is named, the two real ones are in.
 await go.click();
 const failed=page.getByRole('alertdialog',{name:'일부 MR을 가져오지 못했어요'});
 await expect(failed).toContainText('MR 1개는 가져오지 못했어요: “Defying Gravity 2절” (M4A 오디오 파일이 아니라서 올리지 않았어요.)');
 await expect(failed).toContainText('MR 2개를 가져왔어요');
 await failed.getByRole('button',{name:'확인'}).click();
 await expect(sheet.locator('[data-gn-msg]')).toContainText('“Defying Gravity 2절”');
 await expect(rows.nth(0)).toContainText('가져왔어요');await expect(rows.nth(2)).toContainText('가져왔어요');
 await expect(rows.nth(1)).not.toContainText('가져왔어요');
 await expect(rows.nth(0).locator('[data-gn-pick]')).toBeDisabled();
 const tracks=await mrOf(page,'s1');
 expect(tracks.map(t=>t.title)).toEqual(['1. Defying Gravity','02 - Defying Gravity']);
 expect(r2.store.size).toBe(2); // the first upload was not sent twice, the text file was never sent
 expect(Buffer.compare(r2.store.get(tracks[0].r2Key).bytes,good)).toBe(0);
 expect(Buffer.compare(r2.store.get(tracks[1].r2Key).bytes,other)).toBe(0);
 expect(await page.evaluate(()=>window.VZ.db.songs.flatMap(s=>s.scores||[]).length)).toBe(0);
 expect(page.__errors).toEqual([]);
});
test('a notebook without recordings shows no MR section and the button reads as before',async({page})=>{
 await setup(page);
 await pick(page,'한 곡.goodnotes',F.notebook({title:'한 곡',pdf:pdf(1),width:300,height:400,pages:[{pdfPage:1,order:'a'}],outline:[{page:0,title:'Song A'}]}));
 const sheet=page.getByRole('dialog',{name:'굿노트 가져오기'});
 await expect(sheet.locator('[data-gn-mr]')).toBeHidden();
 await expect(sheet.locator('button[type=submit]')).toHaveText('가져오기 (1곡)');
 await expect(sheet.locator('[data-gn-diag]')).toContainText('녹음 0개(지운 것 0)');
});
