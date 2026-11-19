/* 필기를 지적으로 가져오기 (app/score-ink-points-bulk.js): 더보기 › 필기를 지적으로 가져오기 groups the handwriting on the
 * score into notes, asks once before sending, recognizes each note's crop (two at a time), and lists them with the
 * measures under them and the 악보 표기 placed on the score; 선택한 n개 지적으로 저장 makes the points. The recognition
 * (vzip-score-vision) is stubbed at the client's boundary, window.vzipCloudScoreVision (cloud-sync.js), so no request
 * leaves the test. All data here is made up. PDF and conversion fixtures as tests/score-ink-points.spec.cjs. */
const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {boot,fakeR2,R2}=require('./helpers/r2-fixture.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PDFROOT=process.env.VZ_PDFJS_ROOT||'/tmp/vzip-score-pdfjs/node_modules/pdfjs-dist';
const PW=300,PH=400,UNIT=.4,STAFF=16,OWNER='ui-test-user',SCORE='score-pts',PDFKEY='u/'+OWNER+'/'+SCORE+'/original.pdf',MXL='u/'+OWNER+'/'+SCORE+'/omr.mxl';
const SYSTEMS=[
 {page:1,y:80,x0:30,x1:270,measures:[[1,250],[2,250],[3,250],[4,250]]},
 {page:1,y:200,x0:30,x1:270,measures:[[5,250],[6,250],[7,250],[8,250]]},
 {page:2,y:100,x0:30,x1:270,measures:[[9,250],[10,250],[11,250],[12,250]]}
];
function pdf(){
 const stream=text=>'<< /Length '+Buffer.byteLength(text)+' >>\nstream\n'+text+'\nendstream';
 const content=n=>'BT /F1 10 Tf 20 380 Td (VOCAL.zip Score '+n+') Tj ET\n0 0 0 RG 1 w\n'+SYSTEMS.filter(s=>s.page===n).map(s=>[0,1,2,3,4].map(l=>s.x0+' '+(PH-s.y-l*4)+' m '+s.x1+' '+(PH-s.y-l*4)+' l S').join('\n')).join('\n');
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>'];
 for(let n=1;n<=2;n++)objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+PW+' '+PH+'] /Resources << /Font << /F1 7 0 R >> >> /Contents '+(2+n*2)+' 0 R >>',stream(content(n)));
 objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 let out='%PDF-1.4\n',offsets=[0];
 objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(out));out+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});
 const offset=Buffer.byteLength(out);out+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+offset+'\n%%EOF';
 return Buffer.from(out);
}
function musicxml(){
 let last=null,body='';
 for(const s of SYSTEMS){
  const first=!last||last.page!==s.page,gap=first?'<top-system-distance>'+s.y/UNIT+'</top-system-distance>':'<system-distance>'+(s.y-last.y-STAFF)/UNIT+'</system-distance>';
  s.measures.forEach(([number,width],i)=>{
   body+='<measure number="'+number+'" width="'+width+'">'+(i?'':'<print'+(!last?'':first?' new-page="yes"':' new-system="yes"')+'><system-layout><system-margins><left-margin>'+s.x0/UNIT+'</left-margin><right-margin>'+(PW-s.x1)/UNIT+'</right-margin></system-margins>'+gap+'</system-layout></print>')+
    (number===1?'<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>':'')+
    '<note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><type>whole</type></note></measure>';
  });
  last=s;
 }
 return '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><identification><encoding><software>Audiveris 5.11.0</software></encoding><miscellaneous>'+
  '<miscellaneous-field name="source-sheet-1">1</miscellaneous-field><miscellaneous-field name="source-sheet-2">1</miscellaneous-field></miscellaneous></identification>'+
  '<defaults><page-layout><page-height>'+(PH/UNIT+160)+'</page-height><page-width>'+(PW/UNIT+160)+'</page-width><page-margins type="both"><left-margin>80</left-margin><right-margin>80</right-margin><top-margin>80</top-margin><bottom-margin>80</bottom-margin></page-margins></page-layout></defaults>'+
  '<part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list><part id="P1">'+body+'</part></score-partwise>';
}
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
const LESSONS=[{id:'l-old',date:'2026-10-20',songIds:['s1'],status:'done',songFeedback:{s1:'호흡이 짧아요'}},{id:'l-new',date:'2026-11-10',songIds:['s1'],status:'done',songFeedback:{s1:'5마디 숨 미리'}}];
const ASPECT=PH/PW;
let n=0;
/** A short pen stroke (a letter) at x, y (page fractions), drawn at `at`. */
const letter=(x,y,at,extra={})=>({id:'w'+String(++n).padStart(3,'0'),tool:'pen',color:'#d92d20',width:.003,createdAt:at,points:[[x,y,.5],[x+.006,y+.012,.5],[x+.012,y+.002,.5]],...extra});
/** A word of k letters from x along y, a second apart. */
const word=(x,y,k,at)=>Array.from({length:k},(_,i)=>letter(x+i*.02,y,at+i*1000));
const T0=1700000000000;
/** Page 1: three handwritten notes, one arrow, and what is never a note: a speck, a highlighter stroke, two 악보 표기.
 *  A 끝까지 부르기: measure 1 · B 호흡 미리: measure 3 · C 턱 내리기: measures 6–7 · the arrow under measure 8. */
const NOTES={A:word(.12,.205,6,T0),B:word(.52,.205,4,T0+120000),C:word(.35,.515,12,T0+240000)};
const ARROW=[{id:'arrow-1',tool:'pen',color:'#d92d20',width:.003,createdAt:T0+360000,points:[[.72,.57,.5],[.8,.57,.5],[.86,.57,.5]]},{id:'arrow-2',tool:'pen',color:'#d92d20',width:.003,createdAt:T0+361000,points:[[.84,.56,.5],[.86,.57,.5],[.84,.58,.5]]}];
const OTHER=[
 {id:'speck',tool:'pen',color:'#d92d20',width:.003,createdAt:T0+400000,points:[[.95,.95,.5]]},
 {id:'glow',tool:'highlighter',color:'#fde047',width:.02,createdAt:T0+401000,points:[[.3,.52,.5],[.5,.52,.5]]},
 {id:'mark-breath',tool:'pen',color:'#7a32f5',width:.006,createdAt:T0+402000,mark:'breath',points:[[.39,.205,.5],[.4,.215,.5],[.41,.205,.5]]},
 {id:'mark-repeat',tool:'pen',color:'#7a32f5',width:.006,createdAt:T0+403000,mark:'repeat',measures:[4,5,12],points:[[.1,.47,.5],[.1,.46,.5],[.5,.46,.5],[.5,.47,.5]]}
];
const TEXTS={A:'끝까지 부르기',B:'호흡 미리',C:'턱 내리기'};
const ANSWERS=[{text:TEXTS.A,confidence:'high'},{text:TEXTS.B,confidence:'medium'},{text:TEXTS.C,confidence:'high'},{text:'→',confidence:'high'}];

/** Song s1 with lessons, the score PDF (2 pages, 12 measures) and the strokes above. vision: 'ok' | 'fail' | 'off'.
 * The recognition (window.vzipCloudScoreVision, cloud-sync.js) answers in the order it is asked (A, B, C, arrow:
 * the notes are sent in reading order); with window.__hold set each answer waits for window.__release(). */
async function setup(page,{vision='ok'}={}){
 const r2=await fakeR2(page);
 const bytes=pdf();r2.store.set(PDFKEY,{bytes,type:'application/pdf',etag:'"pdf"'});
 const file=mxl(musicxml());r2.store.set(MXL,{bytes:file,type:'application/vnd.recordare.musicxml',etag:'"mxl"'});
 const job={id:'1'.repeat(24),scoreId:SCORE,status:'done',created:1,finished:2,error:null,resultKey:MXL,resultSize:file.length,movements:1};
 await page.route(R2+'/v1/omr**',route=>route.fulfill({json:{job},headers:{'access-control-allow-origin':'*'}}));
 await page.context().route('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/**',route=>{
  const suffix=new URL(route.request().url()).pathname.split('pdfjs-dist@4.10.38/')[1],f=path.join(PDFROOT,suffix);
  if(!suffix||suffix.includes('..')||!fs.existsSync(f))return route.abort();
  return route.fulfill({path:f,contentType:f.endsWith('.mjs')?'text/javascript':'application/octet-stream',headers:{'access-control-allow-origin':'*'}});
 });
 await boot(page);
 const hash=crypto.createHash('sha256').update(bytes).digest('hex');
 const inked=[...NOTES.A,...NOTES.B,...NOTES.C,...ARROW,...OTHER].map(s=>({version:1,ownerId:OWNER,songId:'s1',scoreId:SCORE,r2Key:PDFKEY,pdfHash:hash,page:1,...s}));
 await page.evaluate(([lessons,rows,size])=>window.VZ.change(d=>{
  d.lessons=lessons;d.scoreAnnotations=rows;
  d.songs[0].scores=[{id:'score-pts',songId:'s1',title:'연습 악보',r2Key:'u/ui-test-user/score-pts/original.pdf',size,uploadedAt:Date.now()}];
 },{silent:true}),[LESSONS,inked,bytes.length]);
 await stub(page,vision);
 return inked.length;
}
async function stub(page,vision='ok'){
 await page.evaluate(([vision,answers])=>{window.__vision=[];window.__hold=false;window.__waiting=[];window.__release=()=>window.__waiting.shift()?.();
  window.vzipCloudScoreVision=async(mode,image,signal)=>{
   if(!mode)return {available:vision!=='off'};
   const i=window.__vision.length;window.__vision.push({mode,image:String(image).slice(0,23)});
   if(window.__hold)await new Promise((resolve,reject)=>{window.__waiting.push(resolve);signal?.addEventListener('abort',()=>reject(new DOMException('멈춤','AbortError')));});
   if(vision==='fail')throw Error('AI 요청 한도에 도달했어요.');
   return answers[i%answers.length];
  };},[vision,ANSWERS]);
}
async function open(page,count){
 await page.goto('/#/song/s1');await page.getByRole('tab',{name:'악보',exact:true}).click();
 await page.getByRole('button',{name:'연습 악보 열기',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'악보 개인 필기'});
 await expect(dialog.locator('[data-ink-save-state]')).toContainText('필기 준비됨',{timeout:20000});
 await expect(dialog.locator('[data-ink-measure-sync]')).toHaveCount(1,{timeout:15000});
 await expect(dialog.locator('[data-stroke]')).toHaveCount(count);
 return dialog;
}
/** 더보기 › 필기를 지적으로 가져오기 › 이 페이지. */
async function bulk(page,dialog,{scope='이 페이지'}={}){
 await dialog.locator('[data-ink-more]').click();
 const item=dialog.getByRole('button',{name:'필기를 지적으로 가져오기',exact:true});
 await expect(item).toBeVisible();const box=await item.boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);
 await item.click();
 const menu=page.getByRole('dialog',{name:'필기를 지적으로 가져오기',exact:true}).filter({has:page.locator('[data-bulk-scope]')});
 await expect(menu.locator('[data-bulk-scope=page]')).toHaveText('이 페이지 (1쪽) · 손글씨 4곳 · 표기 2개');
 await expect(menu.locator('[data-bulk-scope=all]')).toHaveText('모든 페이지 · 손글씨 4곳 · 표기 2개');
 await menu.locator(scope==='이 페이지'?'[data-bulk-scope=page]':'[data-bulk-scope=all]').click();
}
async function consent(page,answer,count=4){
 const ask=page.getByRole('dialog',{name:'선택 영역 인식',exact:true});
 try{await expect(ask).toContainText('손글씨 '+count+'곳의 획만 OpenAI API로 보내 인식할까요? 결과는 확인 후 저장할 수 있어요.');}
 catch(e){ // say what the screen showed instead (CI artifacts cannot be read)
  const seen=await page.evaluate(()=>({dialogs:[...document.querySelectorAll('[role=dialog],dialog[open]')].map(d=>(d.getAttribute('aria-label')||'')+': '+(d.innerText||'').slice(0,300)),review:document.querySelector('[data-bulk-review]')?.innerText?.slice(0,400),status:[...document.querySelectorAll('[role=status],[role=alert],.toast')].map(x=>x.innerText).join(' | '),sent:window.__vision?.length}));
  throw Error('no consent: '+JSON.stringify(seen)+' · page errors: '+JSON.stringify(page.__errors||[]));
 }
 expect(await page.evaluate(()=>window.__vision.length)).toBe(0);
 await ask.getByRole('button',{name:answer,exact:true}).click();await expect(ask).toHaveCount(0);
}
const review=page=>page.locator('.vz-bulk-sheet');
const notes=page=>review(page).locator('[data-bulk-note-list] [data-bulk-item]');
const marks=page=>review(page).locator('[data-bulk-mark-list] [data-bulk-item]');
const points=page=>page.evaluate(()=>(window.VZ.db.scoreAnnotations||[]).filter(r=>r.kind==='score-point').map(({songId,scoreId,measures,text,lessonId})=>({songId,scoreId,measures,text,lessonId})).sort((a,b)=>a.measures.from-b.measures.from));
const strokeIds=page=>page.evaluate(()=>(window.VZ.db.scoreAnnotations||[]).filter(r=>r.ownerId&&r.points).map(r=>r.id).sort());
const noOverflow=page=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('.sheet')].filter(s=>s.offsetParent).every(s=>s.scrollWidth<=s.clientWidth+1));
async function targets(scope,min=44){for(const b of await scope.locator('button,input,select,textarea,label.vz-bulk-check').all()){if(!await b.isVisible())continue;if(await b.evaluate(e=>e.type==='checkbox'))continue;const r=await b.boundingBox();expect(r.height,await b.evaluate(e=>e.outerHTML.slice(0,80))).toBeGreaterThanOrEqual(min-.5);}}
const row=(list,i)=>({text:list.nth(i).locator('[data-bulk-text]'),from:list.nth(i).locator('[data-bulk-from]'),to:list.nth(i).locator('[data-bulk-to]'),check:list.nth(i).locator('[data-bulk-check]'),flag:list.nth(i).locator('[data-bulk-flag]')});
test.afterEach(async({page})=>expect(page.__errors||[]).toEqual([]));

test('this page: three notes recognized and checked, the arrow not; marks listed unchecked; 저장 makes three points',async({page})=>{
 const count=await setup(page);const dialog=await open(page,count);const before=await strokeIds(page);
 await bulk(page,dialog);await consent(page,'인식하기');
 const sheet=review(page);await expect(sheet).toBeVisible();
 await expect(sheet.locator('[data-bulk-status]')).toContainText('손글씨 4곳을 인식했어요.');
 expect(await page.evaluate(()=>window.__vision.map(v=>v.mode+':'+v.image))).toEqual(Array(4).fill('handwriting:data:image/jpeg;base64,'));
 await expect(notes(page)).toHaveCount(4);
 const want=[[TEXTS.A,'1',''],[TEXTS.B,'3',''],[TEXTS.C,'6','7']];
 for(const [i,[text,from,to]] of want.entries()){const r=row(notes(page),i);await expect(r.text).toHaveValue(text);await expect(r.from).toHaveValue(from);await expect(r.to).toHaveValue(to);await expect(r.check).toBeChecked();await expect(r.flag).toHaveCount(0);}
 const arrow=row(notes(page),3);await expect(arrow.text).toHaveValue('→');await expect(arrow.check).not.toBeChecked();await expect(arrow.flag).toHaveText('글자가 아니에요');
 await expect(notes(page).locator('img.vz-bulk-thumb')).toHaveCount(4);
 expect(await notes(page).locator('img.vz-bulk-thumb').first().getAttribute('src')).toMatch(/^data:image\/jpeg;base64,/);
 // 악보 표기: by their preset name and measures, unchecked; nothing about them was sent.
 await expect(marks(page)).toHaveCount(2);
 await expect(row(marks(page),0).text).toHaveValue('숨표');await expect(row(marks(page),0).from).toHaveValue('2');
 await expect(row(marks(page),1).text).toHaveValue('반복 (5–6마디)');await expect(row(marks(page),1).from).toHaveValue('5');await expect(row(marks(page),1).to).toHaveValue('6');
 for(const i of [0,1])await expect(row(marks(page),i).check).not.toBeChecked();
 await expect(sheet.locator('[data-bulk-lesson]')).toHaveValue('l-new');
 const save=page.locator('[data-bulk-save]');await expect(save).toHaveText('선택한 3개 지적으로 저장');await expect(save).toBeEnabled();
 for(const width of [390,820]){await page.setViewportSize({width,height:844});expect(await noOverflow(page)).toBe(true);await targets(sheet);}
 await page.setViewportSize({width:390,height:844});
 if(process.env.VZ_SHOTS)await page.screenshot({path:process.env.VZ_SHOTS+'/bulk-review-390.png',fullPage:false});
 expect(await points(page)).toEqual([]);
 await row(notes(page),1).text.fill('호흡 미리 쉬기');
 await save.click();await expect(sheet).toHaveCount(0);
 expect(await points(page)).toEqual([
  {songId:'s1',scoreId:SCORE,measures:{from:1,to:1},text:TEXTS.A,lessonId:'l-new'},
  {songId:'s1',scoreId:SCORE,measures:{from:3,to:3},text:'호흡 미리 쉬기',lessonId:'l-new'},
  {songId:'s1',scoreId:SCORE,measures:{from:6,to:7},text:TEXTS.C,lessonId:'l-new'}]);
 expect(await strokeIds(page)).toEqual(before);await expect(dialog.locator('[data-stroke]')).toHaveCount(count);
});

test('취소 on the question: nothing is sent; the marks can still be chosen (모두 선택) and saved',async({page})=>{
 const count=await setup(page);const dialog=await open(page,count);
 await bulk(page,dialog,{scope:'모든 페이지'});await consent(page,'취소');
 const sheet=review(page);await expect(sheet).toBeVisible();
 expect(await page.evaluate(()=>window.__vision.length)).toBe(0);
 await expect(sheet.locator('[data-bulk-status]')).toContainText('손글씨 4곳은 보내지 않았어요.');
 await expect(notes(page)).toHaveCount(0);await expect(marks(page)).toHaveCount(2);
 await expect(page.locator('[data-bulk-save]')).toBeDisabled();
 await sheet.getByLabel('모두 선택').check();
 for(const i of [0,1])await expect(row(marks(page),i).check).toBeChecked();
 await sheet.locator('[data-bulk-lesson]').selectOption('l-old');
 await page.locator('[data-bulk-save]').click();await expect(sheet).toHaveCount(0);
 expect(await points(page)).toEqual([
  {songId:'s1',scoreId:SCORE,measures:{from:2,to:2},text:'숨표',lessonId:'l-old'},
  {songId:'s1',scoreId:SCORE,measures:{from:5,to:6},text:'반복 (5–6마디)',lessonId:'l-old'}]);
 expect(await page.evaluate(()=>window.__vision.length)).toBe(0);
 // Again: the marks are points already and are skipped.
 await bulk(page,dialog);await consent(page,'취소');
 await expect(review(page).locator('[data-bulk-status]')).toContainText('표기 2개는 이미 지적으로 있어 건너뛰었어요.');
 await expect(marks(page)).toHaveCount(0);
});

test('a second run skips notes that are points already: from memory without sending, and after a reload',async({page})=>{
 const count=await setup(page);let dialog=await open(page,count);
 await bulk(page,dialog);await consent(page,'인식하기');
 await expect(notes(page)).toHaveCount(4);await page.locator('[data-bulk-save]').click();await expect(review(page)).toHaveCount(0);
 expect(await points(page)).toHaveLength(3);
 // Same session: the answers are known, nothing is asked or sent.
 await bulk(page,dialog);
 await expect(review(page)).toBeVisible();
 await expect(page.getByRole('dialog',{name:'선택 영역 인식',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>window.__vision.length)).toBe(4);
 await expect(review(page).locator('[data-bulk-status]')).toContainText('손글씨 3곳은 이미 지적으로 있어 건너뛰었어요.');
 await expect(notes(page)).toHaveCount(1);await expect(row(notes(page),0).flag).toHaveText('글자가 아니에요');
 await expect(page.locator('[data-bulk-save]')).toHaveText('선택한 0개 지적으로 저장');await expect(page.locator('[data-bulk-save]')).toBeDisabled();
 await page.keyboard.press('Escape');await expect(review(page)).toHaveCount(0);
 // After a reload the notes are read again and the duplicates are still skipped.
 await page.reload();await stub(page);dialog=await open(page,count);
 await bulk(page,dialog);await consent(page,'인식하기');
 await expect(review(page).locator('[data-bulk-status]')).toContainText('손글씨 3곳은 이미 지적으로 있어 건너뛰었어요.');
 await expect(notes(page)).toHaveCount(1);
 expect(await points(page)).toHaveLength(3);
});

test('멈추기 mid-way keeps the finished results; the rest is not sent',async({page})=>{
 const count=await setup(page);const dialog=await open(page,count);
 await page.evaluate(()=>{window.__hold=true;});
 await bulk(page,dialog);await consent(page,'인식하기');
 const sheet=review(page);
 await expect.poll(()=>page.evaluate(()=>window.__vision.length)).toBe(2); // two at a time
 await expect(sheet.locator('[data-bulk-status]')).toContainText('손글씨 인식 중 0 / 4');
 await expect(page.locator('[data-bulk-save]')).toBeDisabled();
 await page.evaluate(()=>window.__release());
 await expect(notes(page)).toHaveCount(1);await expect(row(notes(page),0).text).toHaveValue(TEXTS.A);
 await expect.poll(()=>page.evaluate(()=>window.__vision.length)).toBe(3);
 const stop=sheet.getByRole('button',{name:'멈추기'});const b=await stop.boundingBox();expect(b.height).toBeGreaterThanOrEqual(44);
 await stop.click();
 await expect(sheet.locator('[data-bulk-status]')).toContainText('멈췄어요. 인식이 끝난 1곳만 보여요.');
 await expect(stop).toBeHidden();
 await expect(notes(page)).toHaveCount(1);
 expect(await page.evaluate(()=>window.__vision.length)).toBe(3);
 await page.locator('[data-bulk-save]').click();await expect(sheet).toHaveCount(0);
 expect(await points(page)).toMatchObject([{measures:{from:1,to:1},text:TEXTS.A}]);
});

test('pressed while the page is being drawn again (or the score just opened): it waits, then asks',async({page})=>{
 const count=await setup(page);const dialog=await open(page,count);
 await dialog.locator('[data-ink-more]').click();
 await expect(dialog.locator('[data-ink-bulk-points]')).toBeVisible();
 // The zoom changes (as when the iPad turns) and the item is pressed in the same moment the redraw starts.
 await dialog.evaluate(el=>{const zoom=el.querySelector('[data-ink-zoom]');zoom.value='2';zoom.dispatchEvent(new Event('change'));el.querySelector('[data-ink-bulk-points]').click();});
 await page.locator('[data-bulk-scope=page]').click();
 await consent(page,'인식하기');
 await expect(notes(page)).toHaveCount(4);
});

test('recognition fails: it says so and nothing is saved',async({page})=>{
 const count=await setup(page,{vision:'fail'});const dialog=await open(page,count);
 await bulk(page,dialog);await consent(page,'인식하기');
 const sheet=review(page);
 await expect(sheet.locator('[data-bulk-status]')).toContainText('인식하지 못했어요 (AI 요청 한도에 도달했어요.)');
 await expect(notes(page)).toHaveCount(0);await expect(marks(page)).toHaveCount(2);
 await expect(page.locator('[data-bulk-save]')).toBeDisabled();
 await page.keyboard.press('Escape');await expect(sheet).toHaveCount(0);
 expect(await points(page)).toEqual([]);
});
