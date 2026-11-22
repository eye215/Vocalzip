/* 악보 표기 → 레슨 지적 (app/score-ink.js, app/score-points.js): 지적으로 on selected marks (nothing asked or sent for
 * marks), 부르면서 체크에 넣기 on a preset (a placed mark is a point at once, once per song · words · measures, with
 * 되돌리기), the point kept when its mark is erased, the mark's shape in 부르면서 체크, and 필기를 지적으로 가져오기
 * skipping marks that are points already. The recognition is stubbed at window.vzipCloudScoreVision (cloud-sync.js), so
 * no request leaves the test. All data here is made up. PDF and conversion fixtures as tests/score-ink-points-bulk.spec.cjs
 * (page 1: measures 1–4 on the first line, 5–8 on the second; each measure a fifth of the page wide from x .1). */
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
const LESSONS=[{id:'l-old',date:'2026-10-20',songIds:['s1'],status:'done'},{id:'l-new',date:'2026-11-10',songIds:['s1'],status:'done'}];
const T0=1700000000000;
/** A handwritten word over measure 3, the built-in 숨표 over measure 2 and 반복 placed by 마디 선택 over measures 5–6. */
const WORD=Array.from({length:4},(_,i)=>({id:'w'+i,tool:'pen',color:'#d92d20',width:.003,createdAt:T0+i*1000,points:[[.52+i*.02,.205,.5],[.526+i*.02,.217,.5],[.532+i*.02,.207,.5]]}));
const BREATH={id:'mark-breath',tool:'pen',color:'#7a32f5',width:.006,createdAt:T0+402000,mark:'breath',points:[[.39,.205,.5],[.4,.215,.5],[.41,.205,.5]]};
const REPEAT={id:'mark-repeat',tool:'pen',color:'#7a32f5',width:.006,createdAt:T0+403000,mark:'repeat',measures:[4,5,12],points:[[.1,.47,.5],[.1,.46,.5],[.5,.46,.5],[.5,.47,.5]]};
const RECOGNIZED='호흡 미리';

async function setup(page,{rows=[...WORD,BREATH,REPEAT]}={}){
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
 const inked=rows.map(s=>({version:1,ownerId:OWNER,songId:'s1',scoreId:SCORE,r2Key:PDFKEY,pdfHash:hash,page:1,...s}));
 await page.evaluate(([lessons,rows,size])=>window.VZ.change(d=>{
  d.lessons=lessons;d.scoreAnnotations=rows;
  d.songs[0].scores=[{id:'score-pts',songId:'s1',title:'연습 악보',r2Key:'u/ui-test-user/score-pts/original.pdf',size,uploadedAt:Date.now()}];
 },{silent:true}),[LESSONS,inked,bytes.length]);
 await page.evaluate(text=>{window.__vision=[];window.vzipCloudScoreVision=async(mode,image)=>{
  if(!mode)return {available:true};
  window.__vision.push({mode,image:String(image).slice(0,23)});return {text,confidence:'high'};
 };},RECOGNIZED);
 return inked.length;
}
async function open(page,count){
 await page.getByRole('tab',{name:'악보',exact:true}).click();
 await page.getByRole('button',{name:'연습 악보 열기',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'악보 개인 필기'});
 await expect(dialog.locator('[data-ink-save-state]')).toContainText('필기 준비됨',{timeout:20000});
 await expect(dialog.locator('[data-ink-measure-sync]')).toHaveCount(1,{timeout:15000});
 await expect(dialog.locator('[data-stroke]')).toHaveCount(count);
 return dialog;
}
const toSong=async page=>{await page.goto('/#/song/s1');await expect(page.getByRole('tab',{name:'악보',exact:true})).toBeVisible();};
const points=page=>page.evaluate(()=>(window.VZ.db.scoreAnnotations||[]).filter(r=>r.kind==='score-point').map(({measures,text,lessonId,fromMark,scoreId})=>({measures,text,lessonId,scoreId,...(fromMark?{fromMark}:{})})).sort((a,b)=>a.measures.from-b.measures.from));
const strokeIds=page=>page.evaluate(()=>(window.VZ.db.scoreAnnotations||[]).filter(r=>r.ownerId&&r.points).map(r=>r.id).sort());
const form=page=>page.getByRole('dialog',{name:'지적 추가',exact:true});
const asked=page=>page.getByRole('dialog',{name:'선택 영역 인식',exact:true});
const palette=dialog=>dialog.locator('[data-ink-marker-palette]');
async function at(dialog,p){const r=await dialog.locator('[data-ink-svg]').boundingBox();return [r.x+r.width*p[0],r.y+r.height*p[1]];}
async function tool(dialog,name){await dialog.getByRole('button',{name,exact:true}).click();}
/** Taps one stroke with the 선택 tool. */
async function tapSelect(page,dialog,p,count){await tool(dialog,'선택');const [x,y]=await at(dialog,p);await page.mouse.click(x,y);await expect(dialog.locator('[data-ink-selection-count]')).toHaveText(count+'개 선택');}
async function boxSelect(page,dialog,a,b,count){
 await tool(dialog,'선택');const p=await at(dialog,a),q=await at(dialog,b);
 await page.mouse.move(...p);await page.mouse.down();await page.mouse.move(...q,{steps:8});await page.mouse.up();
 await expect(dialog.locator('[data-ink-selection-count]')).toHaveText(count+'개 선택');
}
async function showPalette(dialog){if(await palette(dialog).isHidden())await dialog.getByRole('button',{name:'악보 표시',exact:true}).click();await expect(palette(dialog)).toBeVisible();}
async function pick(dialog,name){await showPalette(dialog);await palette(dialog).getByRole('button',{name,exact:true}).click();await expect(palette(dialog)).toBeHidden();}
async function edit(page,dialog,name){
 await showPalette(dialog);
 const toggle=palette(dialog).getByRole('button',{name:'편집',exact:true});
 if(await toggle.getAttribute('aria-pressed')!=='true')await toggle.click();
 await palette(dialog).getByRole('button',{name:name+' 편집',exact:true}).click();
 const sheet=page.getByRole('dialog',{name:'악보 표기 편집'});await expect(sheet).toBeVisible();return sheet;
}
/** 숨표 with 부르면서 체크에 넣기 turned on in its editor. */
async function checkOn(page,dialog,{shot=false}={}){
 const sheet=await edit(page,dialog,'숨표');
 const option=sheet.locator('[data-marker-check]');
 await expect(option).toContainText('부르면서 체크에 넣기');
 await expect(option.locator('input')).not.toBeChecked(); // off at first, built-in ones too
 await option.scrollIntoViewIfNeeded();
 const box=await option.boundingBox();expect(box.height).toBeGreaterThanOrEqual(44);
 await option.click();await expect(option.locator('input')).toBeChecked();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(shot&&process.env.VZ_SHOTS)await page.screenshot({path:process.env.VZ_SHOTS+'/preset-editor-check-390.png'});
 await page.getByRole('button',{name:'저장',exact:true}).click();await expect(sheet).toHaveCount(0);
}
async function place(page,dialog,p){const [x,y]=await at(dialog,p);await page.mouse.click(x,y);}
/** What the screen showed, for an error message (CI artifacts cannot be read). */
const seen=page=>page.evaluate(()=>({toast:[...document.querySelectorAll('.toast')].map(t=>t.innerText),status:document.querySelector('[data-ink-status]')?.innerText,points:(window.VZ.db.scoreAnnotations||[]).filter(r=>r.kind==='score-point').map(r=>r.text+'@'+r.measures.from)}));
test.afterEach(async({page})=>expect(page.__errors||[]).toEqual([]));

test('one 숨표 → 지적으로: the form opens at once with its name, measure and the latest lesson; nothing asked or sent',async({page})=>{
 const count=await setup(page);await toSong(page);const dialog=await open(page,count);
 await tapSelect(page,dialog,[.4,.21],1);
 const bar=dialog.locator('[data-ink-selection-bar]');
 await bar.getByRole('button',{name:'지적으로',exact:true}).click();
 const sheet=form(page);await expect(sheet).toBeVisible();
 await expect(asked(page)).toHaveCount(0);
 expect(await page.evaluate(()=>window.__vision.length)).toBe(0);
 await expect(sheet.locator('textarea[name=text]')).toHaveValue('숨표');
 await expect(sheet.getByLabel('시작 마디')).toHaveValue('2');await expect(sheet.getByLabel('끝 마디')).toHaveValue('');
 await expect(sheet.getByLabel('어느 레슨에서')).toHaveValue('l-new');
 await expect(sheet.locator('[data-pts-ink]')).toHaveCount(0); // a mark is not handwriting: nothing to keep or remove
 expect(await points(page)).toEqual([]);
 await sheet.getByRole('button',{name:'저장'}).click();await expect(sheet).toHaveCount(0);
 expect(await points(page)).toEqual([{measures:{from:2,to:2},text:'숨표',lessonId:'l-new',scoreId:SCORE,fromMark:'mark-breath'}]);
 expect(await strokeIds(page)).toEqual(['mark-breath','mark-repeat','w0','w1','w2','w3']);
 // A 반복 placed by 마디 선택 over two measures: its name and both measures.
 await tapSelect(page,dialog,[.3,.465],1);
 await dialog.locator('[data-ink-selection-bar]').getByRole('button',{name:'지적으로',exact:true}).click();
 await expect(form(page).locator('textarea[name=text]')).toHaveValue('반복');
 await expect(form(page).getByLabel('시작 마디')).toHaveValue('5');await expect(form(page).getByLabel('끝 마디')).toHaveValue('6');
 expect(await page.evaluate(()=>window.__vision.length)).toBe(0);
});

test('handwriting and a mark together: asked first, only the handwriting is sent, the mark name follows the words',async({page})=>{
 const count=await setup(page);await toSong(page);const dialog=await open(page,count);
 await boxSelect(page,dialog,[.37,.19],[.62,.235],5);
 await dialog.locator('[data-ink-selection-bar]').getByRole('button',{name:'지적으로',exact:true}).click();
 const ask=asked(page);await expect(ask).toContainText('선택한 손글씨 획만 OpenAI API로 보내 인식할까요?');await expect(ask).toContainText('악보 표기는 보내지 않아요.');
 expect(await page.evaluate(()=>window.__vision.length)).toBe(0);
 // What is sent is a picture of the four handwritten strokes only.
 await page.evaluate(()=>{const real=window.vzipCloudScoreVision;window.vzipCloudScoreVision=async(mode,image)=>{if(mode){const img=new Image();img.src=image;await img.decode();const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const x=c.getContext('2d');x.drawImage(img,0,0);const d=x.getImageData(0,0,c.width,c.height).data;let purple=0;for(let i=0;i<d.length;i+=4)if(d[i+2]>150&&d[i]>80&&d[i]<160&&d[i+1]<90)purple++;window.__purple=purple;}return real(mode,image);};});
 await ask.getByRole('button',{name:'인식하기',exact:true}).click();
 const sheet=form(page);await expect(sheet).toBeVisible();
 expect(await page.evaluate(()=>window.__vision.map(v=>v.mode))).toEqual(['handwriting']);
 expect(await page.evaluate(()=>window.__purple)).toBe(0); // the purple 숨표 is not in the picture
 await expect(sheet.locator('textarea[name=text]')).toHaveValue(RECOGNIZED+', 숨표');
 await expect(sheet.getByLabel('시작 마디')).toHaveValue('2');await expect(sheet.getByLabel('끝 마디')).toHaveValue('3');
 // 저장하고 지우기 removes the handwriting only; the mark stays.
 await sheet.locator('[data-pts-ink] .vz-pts-tag',{hasText:'저장하고 지우기'}).click();
 await sheet.getByRole('button',{name:'저장'}).click();await expect(sheet).toHaveCount(0);
 const saved=await points(page);
 expect(saved).toEqual([{measures:{from:2,to:3},text:RECOGNIZED+', 숨표',lessonId:'l-new',scoreId:SCORE}]);
 await expect.poll(()=>strokeIds(page)).toEqual(['mark-breath','mark-repeat']);
});

test('부르면서 체크에 넣기: placing a 숨표 makes one point; the same mark on the same measure does not; 되돌리기 removes it',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const count=await setup(page,{rows:[]});await toSong(page);const dialog=await open(page,count);
 // Off: placing makes no point.
 await pick(dialog,'숨표');await place(page,dialog,[.6,.2]);
 await expect.poll(async()=>(await strokeIds(page)).length).toBe(1);
 expect(await points(page)).toEqual([]);
 await checkOn(page,dialog,{shot:true});
 // The option is on the synced preset row, beside the look.
 expect(await page.evaluate(()=>(window.VZ.db.scoreAnnotations||[]).filter(r=>r.kind==='marker-preset').map(({preset,look,check})=>({preset,look,check})))).toEqual([{preset:'breath',look:null,check:true}]);
 await pick(dialog,'숨표');await place(page,dialog,[.62,.21]);
 await expect.poll(async()=>(await points(page)).length,{message:JSON.stringify(await seen(page))}).toBe(1);
 const ids=await strokeIds(page);expect(ids).toHaveLength(2);
 const [made]=await points(page);
 expect(made).toMatchObject({measures:{from:3,to:3},text:'숨표',lessonId:'l-new',scoreId:SCORE});
 expect(ids).toContain(made.fromMark);
 const toast=page.locator('[data-pts-undo-toast]');
 await expect(toast).toContainText('지적으로 넣었어요');
 const undo=toast.getByRole('button',{name:'되돌리기',exact:true});
 expect((await undo.boundingBox()).height).toBeGreaterThanOrEqual(44);
 // Again on the same measure: no second point.
 await pick(dialog,'숨표');await place(page,dialog,[.56,.215]);
 await expect.poll(async()=>(await strokeIds(page)).length).toBe(3);
 await expect(page.locator('.toast')).toHaveText('같은 지적이 이미 있어요.');
 expect(await points(page)).toHaveLength(1);
 // Another measure: a second point; 되돌리기 takes it away (a tombstone) and leaves the mark.
 await pick(dialog,'숨표');await place(page,dialog,[.4,.21]);
 await expect.poll(async()=>(await points(page)).length).toBe(2);
 await toast.getByRole('button',{name:'되돌리기',exact:true}).click();
 await expect.poll(async()=>(await points(page)).map(p=>p.measures.from)).toEqual([3]);
 await expect(page.locator('.toast')).toHaveText('지적에서 뺐어요. 악보의 표기는 그대로예요.');
 expect(await strokeIds(page)).toHaveLength(4);
 expect(await page.evaluate(()=>(window.VZ.db.deleted?.scoreAnnotations||[]).filter(id=>id.startsWith('point:')).length)).toBe(1);
});

test('erasing the mark keeps the point: the list says 표기가 지워졌어요; 부르면서 체크 shows the mark beside the words',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 const count=await setup(page,{rows:[]});await toSong(page);let dialog=await open(page,count);
 await checkOn(page,dialog);
 await pick(dialog,'숨표');await place(page,dialog,[.62,.21]);
 await pick(dialog,'숨표');await place(page,dialog,[.4,.21]);
 await expect.poll(async()=>(await points(page)).length).toBe(2);
 const [m2,m3]=await points(page);
 // Moving a mark (a copy under a new id): its point follows it.
 await tapSelect(page,dialog,[.62,.21],1);
 const box=await at(dialog,[.62,.21]);await page.mouse.move(box[0],box[1]);await page.mouse.down();await page.mouse.move(box[0]+6,box[1]+4,{steps:4});await page.mouse.up();
 await expect.poll(async()=>(await points(page)).find(p=>p.measures.from===3).fromMark).not.toBe(m3.fromMark);
 expect(await strokeIds(page)).toContain((await points(page)).find(p=>p.measures.from===3).fromMark);
 // Erase the 숨표 over measure 2.
 await tool(dialog,'지우개');await place(page,dialog,[.4,.21]);
 await expect.poll(async()=>(await strokeIds(page)).length).toBe(1);
 expect((await points(page)).map(p=>p.text+p.measures.from)).toEqual(['숨표2','숨표3']); // nothing removed silently
 for(let i=0;i<3&&await dialog.count();i++){await page.keyboard.press('Escape');await page.waitForTimeout(200);}await expect(dialog).toHaveCount(0);
 await page.locator('[data-pts-card] [data-pts-manage]').click();
 const list=page.getByRole('dialog',{name:'레슨 지적',exact:true});await expect(list).toBeVisible();
 const rowOf=id=>list.locator('[data-pts-row="'+id+'"]');
 const ids=await page.evaluate(()=>(window.VZ.db.scoreAnnotations||[]).filter(r=>r.kind==='score-point').sort((a,b)=>a.measures.from-b.measures.from).map(r=>r.id));
 await expect(rowOf(ids[0]).locator('[data-pts-mark-gone]')).toHaveText('표기가 지워졌어요');
 await expect(rowOf(ids[1]).locator('[data-pts-mark-gone]')).toHaveCount(0);
 await expect(rowOf(ids[1]).locator('[data-pts-mark-icon] svg path')).toHaveCount(1);
 await expect(rowOf(ids[0]).locator('[data-pts-mark-icon].is-plain')).toHaveCount(1);
 // The point can still be retired or deleted as usual.
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 // 부르면서 체크: the mark's own shape (its colour) before the words; nothing else changes.
 await list.locator('[data-pts-run]').click();
 const run=page.locator('[data-pts-run]').filter({has:page.locator('.vz-pts-list')});await expect(run).toBeVisible();
 const item=run.locator('[data-pts-item="'+ids[1]+'"]');
 await expect(item.locator('.vz-pts-text')).toHaveText('숨표');
 const icon=item.locator('.vz-pts-text [data-pts-mark-icon]');await expect(icon).toBeVisible();
 await expect(icon.locator('path')).toHaveAttribute('stroke','#7a32f5');
 const ib=await icon.boundingBox();expect(ib.width).toBeGreaterThanOrEqual(22);
 await expect(run.locator('[data-pts-item="'+ids[0]+'"] [data-pts-mark-icon]')).toHaveCount(1);
 await expect(item.locator('[data-pts-mark]')).toHaveCount(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 if(process.env.VZ_SHOTS){await page.evaluate(()=>document.querySelectorAll('.toast').forEach(t=>t.remove()));await page.screenshot({path:process.env.VZ_SHOTS+'/sing-check-mark-point-390.png'});}
 await item.getByRole('button',{name:'지켰어요'}).click();
 await run.locator('[data-pts-finish]').first().click();await run.locator('[data-pts-save]').click();
 await expect(page.locator('.toast')).toHaveText('체크를 저장했어요.');
});

test('필기를 지적으로 가져오기 skips marks that are points already (made from the mark, by its name)',async({page})=>{
 const count=await setup(page);await toSong(page);const dialog=await open(page,count);
 // 반복 over 5–6 made a point from the mark: its words are the name only.
 await tapSelect(page,dialog,[.3,.465],1);
 await dialog.locator('[data-ink-selection-bar]').getByRole('button',{name:'지적으로',exact:true}).click();
 await form(page).getByRole('button',{name:'저장'}).click();await expect(form(page)).toHaveCount(0);
 expect(await points(page)).toEqual([{measures:{from:5,to:6},text:'반복',lessonId:'l-new',scoreId:SCORE,fromMark:'mark-repeat'}]);
 await dialog.locator('[data-ink-more]').click();
 await dialog.getByRole('button',{name:'필기를 지적으로 가져오기',exact:true}).click();
 await page.locator('[data-bulk-scope=page]').click();
 const ask=page.getByRole('dialog',{name:'선택 영역 인식',exact:true});await ask.getByRole('button',{name:'취소',exact:true}).click();
 const review=page.locator('.vz-bulk-sheet');await expect(review).toBeVisible();
 await expect(review.locator('[data-bulk-status]')).toContainText('표기 1개는 이미 지적으로 있어 건너뛰었어요.');
 const marks=review.locator('[data-bulk-mark-list] [data-bulk-item]');
 await expect(marks).toHaveCount(1);await expect(marks.locator('[data-bulk-text]')).toHaveValue('숨표');
 expect(await page.evaluate(()=>window.__vision.length)).toBe(0);
});
