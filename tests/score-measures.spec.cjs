/* 마디 위치 보기 · 표시한 마디 (app/score-measures.js, app/score-measure-model.js): the measure numbers of a score's
 * conversion (.mxl) laid over its PDF pages. Nothing is saved; both menu items appear only when the conversion's
 * pages are the PDF's pages. The PDF and the conversion are written here (tests/fixtures is not committed):
 * a 300 × 400 pt page where one tenth of the conversion is 0.4 pt (inner page 750 × 1000 tenths). */
const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {boot,fakeR2,R2}=require('./helpers/r2-fixture.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PDFROOT=process.env.VZ_PDFJS_ROOT||'/tmp/vzip-score-pdfjs/node_modules/pdfjs-dist';
const PW=300,PH=400,UNIT=.4,STAFF=16; // pt
/* Systems as the conversion describes them (pt on the page): staff top y, left/right x, measures [number, width in tenths]. */
const SYSTEMS=[
 {page:1,y:80,x0:30,x1:270,measures:[[1,200],[2,250],[3,150]]},
 {page:1,y:200,x0:30,x1:270,measures:[[4,300],[5,300]]},
 {page:2,y:100,x0:40,x1:280,measures:[[6,320],[7,280]]}
];
/** A PDF with the staves of `systems` drawn where `place` puts them (identity: exactly where the conversion says). */
function pdf(systems=SYSTEMS,place=s=>s,pages=2){
 const stream=text=>'<< /Length '+Buffer.byteLength(text)+' >>\nstream\n'+text+'\nendstream';
 const content=n=>'BT /F1 10 Tf 20 380 Td (VOCAL.zip Score '+n+') Tj ET\n0 0 0 RG 1 w\n'+systems.filter(s=>s.page===n).map(place).map(s=>
  [0,1,2,3,4].map(l=>s.x0+' '+(PH-s.y-l*(s.step||4))+' m '+s.x1+' '+(PH-s.y-l*(s.step||4))+' l S').join('\n')).join('\n');
 const kids=Array.from({length:pages},(_,i)=>(3+i*2)+' 0 R').join(' '),font=3+pages*2;
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids ['+kids+'] /Count '+pages+' >>'];
 for(let n=1;n<=pages;n++)objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+PW+' '+PH+'] /Resources << /Font << /F1 '+font+' 0 R >> >> /Contents '+(2+n*2)+' 0 R >>',stream(content(n)));
 objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 let out='%PDF-1.4\n',offsets=[0];
 objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(out));out+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});
 const offset=Buffer.byteLength(out);out+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+offset+'\n%%EOF';
 return Buffer.from(out);
}
/** The conversion of those systems as Audiveris writes it: positions from the top-left of the page it read, in
 * tenths, and a page size that adds its fixed 80-tenth margin on every side. */
function musicxml(systems=SYSTEMS,{layout=true}={}){
 let last=null,body='';
 for(const s of systems){
  const first=!last||last.page!==s.page,gap=first?'<top-system-distance>'+s.y/UNIT+'</top-system-distance>':'<system-distance>'+(s.y-last.y-STAFF)/UNIT+'</system-distance>';
  s.measures.forEach(([number,width],i)=>{
   body+='<measure number="'+number+'" width="'+width+'">'+(i?'':'<print'+(!last?'':first?' new-page="yes"':' new-system="yes"')+'>'+(layout?'<system-layout><system-margins><left-margin>'+s.x0/UNIT+'</left-margin><right-margin>'+(PW-s.x1)/UNIT+'</right-margin></system-margins>'+gap+'</system-layout>':'')+'</print>')+
    (number===1?'<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>':'')+
    '<note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><type>whole</type></note></measure>';
  });
  last=s;
 }
 const pages=new Set(systems.map(s=>s.page)).size;
 return '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><identification><encoding><software>Audiveris 5.11.0</software></encoding><miscellaneous>'+
  Array.from({length:pages},(_,i)=>'<miscellaneous-field name="source-sheet-'+(i+1)+'">1</miscellaneous-field>').join('')+'</miscellaneous></identification>'+
  '<defaults><page-layout><page-height>'+(PH/UNIT+160)+'</page-height><page-width>'+(PW/UNIT+160)+'</page-width><page-margins type="both"><left-margin>80</left-margin><right-margin>80</right-margin><top-margin>80</top-margin><bottom-margin>80</bottom-margin></page-margins></page-layout></defaults>'+
  '<part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list><part id="P1">'+body+'</part></score-partwise>';
}
/** A compressed MusicXML (.mxl = zip of META-INF/container.xml + the score); stored entries are enough. */
function mxl(score){
 const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
 const crc32=b=>{let c=0xffffffff;for(const x of b)c=table[(c^x)&0xff]^(c>>>8);return (c^0xffffffff)>>>0;};
 const container='<?xml version="1.0" encoding="UTF-8"?><container><rootfiles><rootfile full-path="score.xml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>';
 const files=[['META-INF/container.xml',container],['score.xml',score]].map(([name,text])=>({name:Buffer.from(name),data:Buffer.from(text)}));
 const local=[],central=[];let offset=0;
 for(const f of files){
  const crc=crc32(f.data),head=Buffer.alloc(30),dir=Buffer.alloc(46);
  head.writeUInt32LE(0x04034b50,0);head.writeUInt16LE(20,4);head.writeUInt32LE(crc,14);head.writeUInt32LE(f.data.length,18);head.writeUInt32LE(f.data.length,22);head.writeUInt16LE(f.name.length,26);
  dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);dir.writeUInt32LE(crc,16);dir.writeUInt32LE(f.data.length,20);dir.writeUInt32LE(f.data.length,24);dir.writeUInt16LE(f.name.length,28);dir.writeUInt32LE(offset,42);
  local.push(head,f.name,f.data);central.push(dir,f.name);offset+=30+f.name.length+f.data.length;
 }
 const dirBytes=Buffer.concat(central),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(dirBytes.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,dirBytes,end]);
}
const OWNER='ui-test-user',SCORE='score-meas',KEY='u/'+OWNER+'/'+SCORE+'/original.pdf',MXL='u/'+OWNER+'/'+SCORE+'/omr.mxl',PREF='vzip_score_measures_v1:'+OWNER,NOTE='자동 인식 기준이라 어긋날 수 있어요.';
/** conversion: MusicXML text, or null for a score that was never converted; status: the job's state. */
async function setup(page,{bytes=pdf(),conversion=musicxml(),status='done',rows=[]}={}){
 const r2=await fakeR2(page);r2.store.set(KEY,{bytes,type:'application/pdf',etag:'"pdf"'});
 const omr={job:null,asked:0,
  /** Stores a conversion result the way the worker does: the same key, a new job. */
  put(xml,n=1){const file=mxl(xml);r2.store.set(MXL,{bytes:file,type:'application/vnd.recordare.musicxml',etag:'"mxl'+n+'"'});
   omr.job={id:String(n).repeat(24),scoreId:SCORE,status,created:n,finished:n+1,error:null,resultKey:status==='done'?MXL:null,resultSize:file.length,movements:1};}};
 if(conversion!==null)omr.put(conversion);
 await page.route(R2+'/v1/omr**',route=>{omr.asked++;return route.fulfill({json:{job:omr.job},headers:{'access-control-allow-origin':'*'}});});
 await page.context().route('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/**',route=>{
  const suffix=new URL(route.request().url()).pathname.split('pdfjs-dist@4.10.38/')[1],file=path.join(PDFROOT,suffix);
  if(!suffix||suffix.includes('..')||!fs.existsSync(file))return route.abort();
  return route.fulfill({path:file,contentType:file.endsWith('.mjs')?'text/javascript':'application/octet-stream',headers:{'access-control-allow-origin':'*'}});
 });
 await boot(page);
 const hash=crypto.createHash('sha256').update(bytes).digest('hex');
 const records=rows.map((r,i)=>({version:1,id:'row-'+i,ownerId:OWNER,songId:'s1',scoreId:SCORE,r2Key:KEY,pdfHash:hash,color:'#7a32f5',createdAt:1700000000000+i,...r}));
 await page.evaluate(([key,size,records])=>window.VZ.change(d=>{
  d.songs[0].scores=[{id:'score-meas',songId:'s1',title:'연습 악보',r2Key:key,size,uploadedAt:Date.now()}];
  d.scoreAnnotations=records;
 }),[KEY,bytes.length,records]);
 return {r2,omr};
}
async function open(page){
 await page.goto('/#/song/s1');await page.getByRole('tab',{name:'악보',exact:true}).click();
 await page.getByRole('button',{name:'연습 악보 열기',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'악보 개인 필기'});
 await expect(dialog.locator('[data-ink-box]')).toBeVisible({timeout:20000});
 await expect(dialog.locator('[data-ink-save-state]')).toContainText('필기 준비됨',{timeout:20000});
 return dialog;
}
const more=async dialog=>{if(await dialog.getAttribute('data-ink-more-open')!=='true')await dialog.locator('[data-ink-more]').click();};
const toggle=dialog=>dialog.locator('[data-ink-measure-boxes]'),listButton=dialog=>dialog.locator('[data-ink-measure-list]');
const layer=dialog=>dialog.locator('[data-ink-measures]'),boxes=dialog=>dialog.locator('[data-ink-measures] .score-measure-box');
/** The menu items are there once the conversion has been read. */
async function ready(dialog){await expect(toggle(dialog)).toHaveCount(1,{timeout:15000});}
async function turnOn(dialog){await more(dialog);await toggle(dialog).click();await expect(toggle(dialog)).toHaveAttribute('aria-pressed','true');}
/** Every measure box on screen as page points (300 × 400), with its number; px is one screen pixel in points. The
 * layer is 1000 units wide and exactly covers the page, so it scales with it. */
const drawn=dialog=>dialog.locator('[data-ink-box]').evaluate(box=>{
 const p=box.getBoundingClientRect(),layer=box.querySelector('[data-ink-measures]'),l=layer.getBoundingClientRect(),view=layer.viewBox.baseVal;
 if(Math.abs(l.left-p.left)>.5||Math.abs(l.top-p.top)>.5||Math.abs(l.width-p.width)>.5||Math.abs(l.height-p.height)>.5||view.width!==1000||Math.abs(view.height/1000-p.height/p.width)>.01)throw Error('the measure layer does not cover the page');
 const k=300/1000,n=name=>r=>r[name].baseVal.value*k;
 return [...layer.querySelectorAll('.score-measure-box,.score-measure-flash')].map(r=>({number:r.dataset.number,flash:r.dataset.flash,x0:n('x')(r),x1:n('x')(r)+n('width')(r),y0:n('y')(r),y1:n('y')(r)+n('height')(r),px:300/p.width}));
});
/** Where the conversion puts the measures of a page, in page points. */
function expected(n,systems=SYSTEMS){
 return systems.filter(s=>s.page===n).flatMap(s=>{const total=s.measures.reduce((a,m)=>a+m[1],0);let x=s.x0;
  return s.measures.map(([number,width])=>{const x0=x;x+=width*(s.x1-s.x0)/total;return {number:String(number),x0,x1:x,top:s.y,bottom:s.y+STAFF};});});
}
/** Boxes are where expected: within 1px across, and around the staff down the page (its lines plus one staff space
 * of 4pt when the lines were seen on the page). */
async function matches(dialog,want,{room=[3,5]}={}){
 const got=(await drawn(dialog)).filter(g=>!g.flash);
 expect(got.map(g=>g.number)).toEqual(want.map(w=>w.number));
 got.forEach((g,i)=>{
  const w=want[i],tol=g.px+.05; // one screen pixel, in page points
  expect(Math.abs(g.x0-w.x0),'left of '+w.number).toBeLessThanOrEqual(tol);expect(Math.abs(g.x1-w.x1),'right of '+w.number).toBeLessThanOrEqual(tol);
  expect(w.top-g.y0,'top of '+w.number).toBeGreaterThanOrEqual(room[0]-tol);expect(w.top-g.y0).toBeLessThanOrEqual(room[1]+tol);
  expect(g.y1-w.bottom,'bottom of '+w.number).toBeGreaterThanOrEqual(room[0]-tol);expect(g.y1-w.bottom).toBeLessThanOrEqual(room[1]+tol);
 });
}
const pt=(x,y)=>[x/PW,y/PH,.5];
const stroke=(page,tool,points,more={})=>({page,tool,width:tool==='highlighter'?.024:.004,points:points.map(p=>pt(...p)),...more});
test.afterEach(async({page})=>expect(page.__errors||[]).toEqual([]));

test('마디 위치 보기: numbered boxes on the measures, under the handwriting, once explained and kept on this device',async({page})=>{
 await setup(page);let dialog=await open(page);await ready(dialog);
 // Off at first: nothing over the page. Both items sit in the ⋯ menu with labels.
 await expect(layer(dialog)).toBeHidden();await expect(boxes(dialog)).toHaveCount(0);
 await more(dialog);
 await expect(toggle(dialog)).toBeVisible();await expect(toggle(dialog)).toHaveAttribute('aria-pressed','false');await expect(toggle(dialog)).toHaveText('마디 위치 보기');
 await expect(listButton(dialog)).toHaveText('표시한 마디');
 for(const b of [toggle(dialog),listButton(dialog)]){const r=await b.boundingBox();expect(r.width).toBeGreaterThanOrEqual(44);expect(r.height).toBeGreaterThanOrEqual(44);}
 await toggle(dialog).click();
 await expect(page.locator('.toast')).toHaveText(NOTE);
 await expect(dialog).toHaveAttribute('data-ink-more-open','false');
 await expect(layer(dialog)).toBeVisible();await expect(layer(dialog)).toHaveAttribute('data-snapped','true'); // laid onto the staff lines of the page
 await matches(dialog,expected(1));
 await expect(dialog.locator('[data-ink-measures] .score-measure-number')).toHaveText(['1','2','3','4','5']);
 // Under the handwriting and out of the way of every touch: drawing still works through it.
 expect(await dialog.locator('[data-ink-box]').evaluate(box=>{const kids=[...box.children],m=box.querySelector('[data-ink-measures]');
  return {order:kids.indexOf(m)<kids.indexOf(box.querySelector('[data-ink-svg]'))&&kids.indexOf(m)>kids.indexOf(box.querySelector('[data-ink-pdf]')),events:getComputedStyle(m).pointerEvents,hidden:m.getAttribute('aria-hidden')};})).toEqual({order:true,events:'none',hidden:'true'});
 await dialog.getByRole('button',{name:'펜',exact:true}).click();
 const r=await dialog.locator('[data-ink-svg]').boundingBox();
 await page.mouse.move(r.x+r.width*.3,r.y+r.height*.22);await page.mouse.down();await page.mouse.move(r.x+r.width*.5,r.y+r.height*.23,{steps:5});await page.mouse.up();
 await expect.poll(()=>page.evaluate(()=>(window.VZ.db.scoreAnnotations||[]).length)).toBe(1);
 await expect(listButton(dialog)).toHaveText('표시한 마디 2'); // the stroke runs over measures 1–2
 // The boxes scale with the page.
 await dialog.locator('[data-ink-zoom]').selectOption('1.5');
 await expect.poll(async()=>Math.round((await dialog.locator('[data-ink-box]').boundingBox()).width/r.width*10)).toBe(15);
 await matches(dialog,expected(1));
 await dialog.locator('[data-ink-zoom]').selectOption('1');
 await expect.poll(async()=>Math.round((await dialog.locator('[data-ink-box]').boundingBox()).width)).toBe(Math.round(r.width));
 // The next page has its own measures.
 await dialog.getByRole('button',{name:'다음 악보 페이지',exact:true}).click();await expect(dialog.locator('[data-ink-page]')).toHaveText('2 / 2쪽');
 await expect(boxes(dialog)).toHaveCount(2);await matches(dialog,expected(2));
 // Never in 무대용 보기.
 await more(dialog);await dialog.locator('[data-ink-performance]').click();
 await expect(dialog).toHaveClass(/score-ink-performance/);await expect(layer(dialog)).toBeHidden();
 await page.locator('[data-ink-stage]').click({position:{x:5,y:5}});await dialog.getByRole('button',{name:'편집으로 돌아가기',exact:true}).click();
 await expect(layer(dialog)).toBeVisible();
 // Kept on this device, without the note a second time. Nothing about measures goes into the saved data.
 expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),PREF)).toEqual({on:true,noted:true});
 expect(await page.evaluate(()=>JSON.stringify(window.VZ.db).includes('measure'))).toBe(false);
 await dialog.getByRole('button',{name:'돌아가기',exact:true}).click();await expect(dialog).toHaveCount(0);
 await expect(page.locator('.toast')).toHaveText('필기 화면을 닫았어요.');
 dialog=await open(page);await ready(dialog);
 await expect(boxes(dialog)).toHaveCount(2);await expect(page.locator('.toast').filter({hasText:NOTE})).toHaveCount(0);
 await more(dialog);await expect(toggle(dialog)).toHaveAttribute('aria-pressed','true');
 await toggle(dialog).click();await expect(layer(dialog)).toBeHidden();await expect(boxes(dialog)).toHaveCount(0);
 expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),PREF)).toEqual({on:false,noted:true});
});

test('표시한 마디: marks, highlighter, pen writing and memos by page and measure; a row goes there and marks the measure',async({page})=>{
 const [a,b,c]=SYSTEMS;
 await setup(page,{rows:[
  stroke(1,'pen',[[150,70],[154,76],[158,70]],{mark:'breath',width:.006}),                 // 숨표 over measure 2
  stroke(1,'pen',[[120,104],[260,104]],{mark:'user-gone',width:.006}),                     // a long mark of a preset that no longer exists: 2–3
  stroke(1,'highlighter',[[60,208],[240,208]]),                                           // 형광펜 over 4–5
  stroke(1,'pen',[[228,84],[236,90]]),stroke(1,'pen',[[238,84],[246,92]]),                 // two strokes of one word in measure 3
  {page:2,tool:'note',color:'#fbe88c',rect:[190/PW,(c.y-6)/PH,.235,.06],mode:'text',text:'숨 크게 쉬고\n다음 줄'}, // memo on measure 7
  {page:2,tool:'note',color:'#fbcfe0',rect:[60/PW,(c.y+30)/PH,.2,.05],mode:'pen',id:'memo-pen'},                    // a handwritten memo on measure 6 …
  stroke(2,'pen',[[70,c.y+36],[90,c.y+44]],{note:'memo-pen'})                                                      // … with its writing
 ]});
 const dialog=await open(page);await ready(dialog);
 await more(dialog);await expect(listButton(dialog)).toHaveText('표시한 마디 6'); // measures 2, 3, 4, 5, 6, 7
 await listButton(dialog).click();
 const sheet=page.getByRole('dialog',{name:'표시한 마디'});
 await expect(sheet).toBeVisible();await expect(sheet.locator('.score-measure-note')).toContainText(NOTE);
 await expect(sheet.locator('section h3')).toHaveText(['1쪽','2쪽']);
 const texts=async()=>(await sheet.locator('[data-measure-row]').evaluateAll(rows=>rows.map(r=>[r.closest('section').querySelector('h3').textContent,r.querySelector('.score-measure-where').textContent,r.querySelector('strong').textContent,r.querySelector('small')?.textContent||''])));
 expect(await texts()).toEqual([
  ['1쪽','2마디','숨표',''],['1쪽','2–3마디','표기',''],['1쪽','3마디','펜 필기',''],['1쪽','4–5마디','형광펜',''],
  ['2쪽','6마디','스티커 메모','손글씨'],['2쪽','7마디','스티커 메모','숨 크게 쉬고']
 ]);
 for(const row of await sheet.locator('[data-measure-row]').all())expect((await row.boundingBox()).height).toBeGreaterThanOrEqual(44);
 // A row closes the list, turns to its page and marks the measure for a moment — also with 마디 위치 보기 off.
 await sheet.getByRole('button',{name:/7마디/}).click();
 await expect(sheet).toHaveCount(0);await expect(dialog.locator('[data-ink-page]')).toHaveText('2 / 2쪽');
 const flash=dialog.locator('[data-ink-measures] .score-measure-flash');
 await expect(flash).toHaveCount(1);await expect(boxes(dialog)).toHaveCount(0);
 const want=expected(2)[1],got=(await drawn(dialog)).find(g=>g.flash==='6');
 expect(Math.abs(got.x0-want.x0)).toBeLessThanOrEqual(got.px+.05);expect(Math.abs(got.x1-want.x1)).toBeLessThanOrEqual(got.px+.05);
 expect(got.y0).toBeLessThanOrEqual(want.top+got.px);expect(got.y1).toBeGreaterThanOrEqual(want.bottom-got.px);
 await expect(flash).toHaveCount(0,{timeout:6000});await expect(layer(dialog)).toBeHidden();
 // A span row marks every measure of the span, back on page 1.
 await more(dialog);await listButton(dialog).click();
 await page.getByRole('dialog',{name:'표시한 마디'}).getByRole('button',{name:/4–5마디/}).click();
 await expect(dialog.locator('[data-ink-page]')).toHaveText('1 / 2쪽');await expect(flash).toHaveCount(2);
 expect(await flash.evaluateAll(n=>n.map(r=>r.dataset.flash))).toEqual(['3','4']);
 // Erasing something takes it off the count and the list; nothing was written by listing.
 await page.evaluate(()=>window.VZ.change(d=>{d.scoreAnnotations=d.scoreAnnotations.filter(s=>s.tool!=='highlighter');},{silent:true}));
 await expect(listButton(dialog)).toHaveText('표시한 마디 4');
 expect(await page.evaluate(()=>window.VZ.db.scoreAnnotations.length)).toBe(7);
});

test('표시한 마디 with nothing on the score says so',async({page})=>{
 await setup(page);const dialog=await open(page);await ready(dialog);
 await more(dialog);await expect(listButton(dialog)).toHaveText('표시한 마디');await listButton(dialog).click();
 const sheet=page.getByRole('dialog',{name:'표시한 마디'});
 await expect(sheet.locator('[data-measure-empty]')).toContainText('아직 표시한 마디가 없어요.');await expect(sheet.locator('[data-measure-row]')).toHaveCount(0);
 await sheet.getByRole('button',{name:'돌아가기',exact:true}).click();await expect(sheet).toHaveCount(0);await expect(dialog.locator('[data-ink-box]')).toBeVisible();
});

for(const [name,options] of [
 ['the score was never converted',{conversion:null}],
 ['the conversion is still running',{status:'running'}],
 ['the conversion has fewer pages than the PDF',{conversion:musicxml(SYSTEMS.filter(s=>s.page===1))}],
 ['the conversion has more pages than the PDF',{bytes:pdf(SYSTEMS,s=>s,1)}],
 ['the conversion carries no layout',{conversion:musicxml(SYSTEMS,{layout:false})}]
])test('no measure items when '+name,async({page})=>{
 const {omr}=await setup(page,options);
 await page.evaluate(k=>localStorage.setItem(k,JSON.stringify({on:true,noted:true})),PREF); // even when it was left on for another score
 const dialog=await open(page);
 await expect.poll(()=>omr.asked).toBeGreaterThan(0);
 await page.waitForTimeout(600);
 await more(dialog);await expect(dialog.locator('[data-ink-performance]')).toBeVisible();
 await expect(toggle(dialog)).toHaveCount(0);await expect(listButton(dialog)).toHaveCount(0);
 await expect(layer(dialog)).toBeHidden();await expect(boxes(dialog)).toHaveCount(0);
});

test('a PDF whose pages were refitted: the boxes follow the staff lines seen on the page',async({page})=>{
 // The same music printed smaller and lower on the sheet than the conversion saw it (as after print-to-PDF).
 const place=s=>({...s,x0:s.x0*.9+18,x1:s.x1*.9+18,y:s.y*.9+30,step:3.6});
 const three=[SYSTEMS[0],SYSTEMS[1],{page:1,y:300,x0:30,x1:270,measures:[[6,280],[7,320]]},{page:2,y:100,x0:40,x1:280,measures:[[8,300],[9,300]]}];
 await setup(page,{bytes:pdf(three,place),conversion:musicxml(three)});
 await page.evaluate(k=>localStorage.setItem(k,JSON.stringify({on:true,noted:true})),PREF);
 const dialog=await open(page);await ready(dialog);
 await expect(layer(dialog)).toHaveAttribute('data-snapped','true');
 const moved=expected(1,three.map(place)).map(m=>({...m,bottom:m.top+STAFF*.9}));
 await matches(dialog,moved);
});

test('a page with no staff lines to see: the boxes are drawn where the file says, with more room around',async({page})=>{
 await setup(page,{bytes:pdf([])});
 await page.evaluate(k=>localStorage.setItem(k,JSON.stringify({on:true,noted:true})),PREF);
 const dialog=await open(page);await ready(dialog);
 await expect(layer(dialog)).toHaveAttribute('data-snapped','false');
 await matches(dialog,expected(1),{room:[8,11]});
});

test('a new conversion replaces the old one: boxes and list follow the new file, nothing was kept',async({page})=>{
 const {omr}=await setup(page,{rows:[stroke(1,'highlighter',[[60,208],[240,208]])]});
 await page.evaluate(k=>localStorage.setItem(k,JSON.stringify({on:true,noted:true})),PREF);
 let dialog=await open(page);await ready(dialog);
 await expect(dialog.locator('[data-ink-measures] .score-measure-number')).toHaveText(['1','2','3','4','5']);
 await more(dialog);await expect(listButton(dialog)).toHaveText('표시한 마디 2');
 await dialog.getByRole('button',{name:'돌아가기',exact:true}).click();await expect(dialog).toHaveCount(0);
 // Converted again: the second system is now read as three measures, numbered from 11.
 const again=[{...SYSTEMS[0],measures:[[9,300],[10,300]]},{...SYSTEMS[1],measures:[[11,200],[12,200],[13,200]]},SYSTEMS[2]];
 omr.put(musicxml(again),2);
 dialog=await open(page);await ready(dialog);
 await expect(dialog.locator('[data-ink-measures] .score-measure-number')).toHaveText(['9','10','11','12','13']);
 await matches(dialog,expected(1,again));
 await more(dialog);await expect(listButton(dialog)).toHaveText('표시한 마디 3');await listButton(dialog).click();
 await expect(page.getByRole('dialog',{name:'표시한 마디'}).locator('.score-measure-where')).toHaveText(['11–13마디']);
});

test('320px: the menu items, the boxes and the list stay inside the screen',async({page})=>{
 await page.setViewportSize({width:320,height:640});
 await setup(page,{rows:[stroke(1,'pen',[[150,70],[154,76],[158,70]],{mark:'breath',width:.006}),
  {page:1,tool:'note',color:'#fbe88c',rect:[40/PW,210/PH,.5,.08],mode:'text',text:'아주 긴 메모 내용을 한 줄로 길게 길게 적어서 목록에서 잘리는지 확인하는 메모입니다 끝까지'}]});
 const dialog=await open(page);await ready(dialog);
 const inside=async locator=>{const r=await locator.boundingBox();expect(r.x).toBeGreaterThanOrEqual(0);expect(r.x+r.width).toBeLessThanOrEqual(320.5);};
 const noOverflow=()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('.sheet')].every(s=>s.scrollWidth<=s.clientWidth+1));
 await turnOn(dialog);await more(dialog);
 await inside(toggle(dialog));await inside(listButton(dialog));await expect(listButton(dialog)).toHaveText('표시한 마디 2');
 expect(await noOverflow()).toBe(true);
 await matches(dialog,expected(1));
 await listButton(dialog).click();
 const sheet=page.getByRole('dialog',{name:'표시한 마디'});
 await expect(sheet.locator('[data-measure-row]')).toHaveCount(2);
 for(const row of await sheet.locator('[data-measure-row]').all())await inside(row);
 await inside(sheet.locator('.score-measure-note'));
 expect(await noOverflow()).toBe(true);
 const small=sheet.locator('[data-measure-row] small');
 expect(await small.evaluate(n=>n.scrollWidth>n.clientWidth&&getComputedStyle(n).textOverflow==='ellipsis')).toBe(true); // the long text is cut with …
});

for(const [width,height] of [[1180,820],[820,1180]])test('tablet '+width+'×'+height+': boxes on the page being read, the list as a page',async({page},info)=>{
 test.skip(info.project.name!=='chromium-desktop','sizes are set explicitly');
 await page.setViewportSize({width,height});
 await setup(page,{rows:[stroke(2,'highlighter',[[60,108],[250,108]])]});
 const dialog=await open(page);await ready(dialog);
 await turnOn(dialog);
 await expect(layer(dialog)).toHaveAttribute('data-snapped','true');
 await matches(dialog,expected(1));
 // 두 쪽 보기 (landscape): the page beside is only looked at — no boxes on it.
 await expect(dialog.locator('button[data-ink-spread]')).toHaveCount(width>height?1:0);
 await expect(dialog.locator('[data-ink-spread] [data-ink-measures]')).toHaveCount(0);
 await more(dialog);await expect(listButton(dialog)).toHaveText('표시한 마디 2');await listButton(dialog).click();
 const sheet=page.getByRole('dialog',{name:'표시한 마디'});
 await expect(sheet.locator('[data-measure-row]')).toHaveCount(1);
 const r=await sheet.boundingBox();expect(r.width).toBeLessThanOrEqual(560.5);expect(r.x).toBeGreaterThanOrEqual(0);
 await sheet.getByRole('button',{name:/6–7마디/}).click();
 await expect(dialog.locator('[data-ink-page]')).toHaveText('2 / 2쪽');
 await expect(dialog.locator('[data-ink-measures] .score-measure-flash')).toHaveCount(2);
 await matches(dialog,expected(2));
});

test('screens for review (only with VZ_SHOTS)',async({page},info)=>{
 test.skip(!process.env.VZ_SHOTS||info.project.name!=='chromium-mobile','only when screenshots are asked for');
 await page.setViewportSize({width:375,height:812});
 const c=SYSTEMS[2];
 await setup(page,{rows:[
  stroke(1,'pen',[[150,70],[154,76],[158,70]],{mark:'breath',width:.006}),stroke(1,'pen',[[120,104],[260,104]],{mark:'user-gone',width:.006}),
  stroke(1,'highlighter',[[60,208],[240,208]]),stroke(1,'pen',[[228,84],[236,90]]),stroke(1,'pen',[[238,84],[246,92]]),
  {page:1,tool:'note',color:'#fbe88c',rect:[40/PW,236/PH,.4,.07],mode:'text',text:'여기서 숨 크게 쉬기'},
  {page:2,tool:'note',color:'#fbcfe0',rect:[190/PW,(c.y-6)/PH,.235,.06],mode:'text',text:'끝음 길게 끌지 않기\n다음 줄'}]});
 const dialog=await open(page);await ready(dialog);await turnOn(dialog);
 await expect(boxes(dialog)).toHaveCount(5);await page.waitForTimeout(2800); // the first-time note has gone
 await page.screenshot({path:process.env.VZ_SHOTS+'/fixture-overlay-375.png',scale:'device'});
 await more(dialog);await page.screenshot({path:process.env.VZ_SHOTS+'/fixture-menu-375.png',scale:'device'});
 await listButton(dialog).click();await expect(page.getByRole('dialog',{name:'표시한 마디'})).toBeVisible();
 await page.screenshot({path:process.env.VZ_SHOTS+'/fixture-list-375.png',scale:'device'});
 await page.getByRole('dialog',{name:'표시한 마디'}).getByRole('button',{name:/4–5마디/}).click();
 await expect(dialog.locator('[data-ink-measures] .score-measure-flash')).toHaveCount(2);await page.waitForTimeout(350);
 await page.screenshot({path:process.env.VZ_SHOTS+'/fixture-row-highlight-375.png',scale:'device'});
});
