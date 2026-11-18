/* 레슨 지적 from handwriting on the score (app/score-ink.js → app/score-points.js): select the strokes, 지적으로 (or
 * 레슨 지적으로 저장 in the recognition result), and the 지적 추가 form opens with the recognized words and the printed
 * measures under the strokes. Nothing is saved before 저장; the strokes stay unless the form says to remove them.
 * The recognition (server function vzip-score-vision) is stubbed at the client's boundary, window.vzipCloudScoreVision
 * (cloud-sync.js), so no request leaves the test. All data here is made up.
 * PDF and conversion fixtures follow tests/score-points.spec.cjs: 12 measures, 5–8 on the second line of page 1. */
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
/** Two handwritten strokes on page 1: one over measures 5–6 (the one selected), one over measure 1. */
const STROKES=[['stroke-a',[[.14,.515,.5],[.30,.52,.5],[.46,.525,.5]]],['stroke-b',[[.15,.21,.5],[.25,.22,.5]]]];
const RECOGNIZED='여기서 숨 미리 쉬기';

/** Song s1 with lessons, the score PDF and two strokes; conversion: with the measure conversion (default) or none.
 * vision: 'ok' (recognized text), 'fail' (the server says no) or 'off' (not available: not the owner / signed out). */
async function setup(page,{conversion=true,vision='ok'}={}){
 const r2=await fakeR2(page);
 const bytes=pdf();r2.store.set(PDFKEY,{bytes,type:'application/pdf',etag:'"pdf"'});
 let job=null;
 if(conversion){const file=mxl(musicxml());r2.store.set(MXL,{bytes:file,type:'application/vnd.recordare.musicxml',etag:'"mxl"'});job={id:'1'.repeat(24),scoreId:SCORE,status:'done',created:1,finished:2,error:null,resultKey:MXL,resultSize:file.length,movements:1};}
 await page.route(R2+'/v1/omr**',route=>route.fulfill({json:{job},headers:{'access-control-allow-origin':'*'}}));
 await page.context().route('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/**',route=>{
  const suffix=new URL(route.request().url()).pathname.split('pdfjs-dist@4.10.38/')[1],f=path.join(PDFROOT,suffix);
  if(!suffix||suffix.includes('..')||!fs.existsSync(f))return route.abort();
  return route.fulfill({path:f,contentType:f.endsWith('.mjs')?'text/javascript':'application/octet-stream',headers:{'access-control-allow-origin':'*'}});
 });
 await boot(page);
 const hash=crypto.createHash('sha256').update(bytes).digest('hex');
 const inked=STROKES.map(([id,points],i)=>({version:1,id,ownerId:OWNER,songId:'s1',scoreId:SCORE,r2Key:PDFKEY,pdfHash:hash,page:1,tool:'pen',color:'#101828',width:.004,points,createdAt:1700000000000+i}));
 await page.evaluate(([lessons,rows,size])=>window.VZ.change(d=>{
  d.lessons=lessons;d.scoreAnnotations=rows;
  d.songs[0].scores=[{id:'score-pts',songId:'s1',title:'연습 악보',r2Key:'u/ui-test-user/score-pts/original.pdf',size,uploadedAt:Date.now()}];
 },{silent:true}),[LESSONS,inked,bytes.length]);
 // vzip-score-vision as cloud-sync.js calls it: no mode asks whether it can be used, 'handwriting' gets {text, confidence}.
 await page.evaluate(vision=>{window.__vision=[];window.vzipCloudScoreVision=async(mode,image)=>{
  if(!mode)return {available:vision!=='off'};
  window.__vision.push({mode,image:String(image).slice(0,23)});
  if(vision==='fail')throw Error('손글씨 인식 요청에 실패했어요.');
  return {text:'여기서 숨 미리 쉬기',confidence:'high'};
 };},vision);
}
async function open(page,{conversion=true}={}){
 await page.goto('/#/song/s1');await page.getByRole('tab',{name:'악보',exact:true}).click();
 await page.getByRole('button',{name:'연습 악보 열기',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'악보 개인 필기'});
 await expect(dialog.locator('[data-ink-save-state]')).toContainText('필기 준비됨',{timeout:20000});
 if(conversion)await expect(dialog.locator('[data-ink-measure-sync]')).toHaveCount(1,{timeout:15000});
 await expect(dialog.locator('[data-stroke]')).toHaveCount(2);
 return dialog;
}
/** The 선택 tool and a box around the stroke over measures 5–6 (not the one over measure 1). */
async function selectPhrase(page,dialog){
 await dialog.getByRole('button',{name:'선택',exact:true}).click();
 const r=await dialog.locator('[data-ink-svg]').boundingBox();
 await page.mouse.move(r.x+r.width*.11,r.y+r.height*.48);await page.mouse.down();
 await page.mouse.move(r.x+r.width*.49,r.y+r.height*.57,{steps:8});await page.mouse.up();
 await expect(dialog.locator('[data-ink-selection-count]')).toHaveText('1개 선택');
}
/** The question 텍스트로 변환 asks before the handwriting goes to OpenAI: the same for 지적으로. */
async function consent(page,answer){
 const ask=page.getByRole('dialog',{name:'선택 영역 인식',exact:true});
 await expect(ask).toContainText('선택한 손글씨 획만 OpenAI API로 보내 인식할까요? 결과는 확인 후 저장할 수 있어요.');
 expect(await page.evaluate(()=>window.__vision.length)).toBe(0); // nothing sent before the answer
 await ask.getByRole('button',{name:answer,exact:true}).click();await expect(ask).toHaveCount(0);
}
const rows=(page,kind)=>page.evaluate(k=>(window.VZ.db.scoreAnnotations||[]).filter(r=>r.kind===k),kind);
const strokeIds=page=>page.evaluate(()=>(window.VZ.db.scoreAnnotations||[]).filter(r=>r.ownerId&&r.points).map(r=>r.id).sort());
const form=page=>page.getByRole('dialog',{name:'지적 추가',exact:true});
const noOverflow=page=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('.sheet,[data-ink-selection-bar]')].filter(s=>s.offsetParent).every(s=>s.scrollWidth<=s.clientWidth+1));
async function targets(scope,min=44){for(const b of await scope.locator('button,input:not([type=radio]),select,textarea,.vz-pts-tag span').all()){if(!await b.isVisible())continue;const r=await b.boundingBox();expect(r.height,await b.evaluate(e=>e.outerHTML.slice(0,80))).toBeGreaterThanOrEqual(min-.5);}}
/** The field is the top element at its centre (nothing of the score or its ink layer over it) and takes focus. */
async function reachable(page,field){
 const box=await field.boundingBox();
 expect(await page.evaluate(([x,y])=>{const e=document.elementFromPoint(x,y);return e?.name||e?.tagName;},[box.x+box.width/2,box.y+box.height/2])).toBe('text');
 await field.click();await expect(field).toBeFocused();
}
test.afterEach(async({page})=>expect(page.__errors||[]).toEqual([]));

test('지적으로: recognized words and measures 5–6 fill the form, 저장 makes the point, the handwriting stays',async({page})=>{
 await setup(page);const dialog=await open(page);
 await selectPhrase(page,dialog);
 const bar=dialog.locator('[data-ink-selection-bar]'),go=bar.getByRole('button',{name:'지적으로',exact:true});
 await expect(go).toBeVisible();await expect(bar.locator('[data-ink-recognize]')).toBeVisible();
 // Both actions fit the bar at small and usual phone width and iPad width, at 44 px.
 for(const width of [375,390,820]){await page.setViewportSize({width,height:844});expect(await noOverflow(page)).toBe(true);await targets(bar);}
 await page.setViewportSize({width:390,height:844});
 // Recognition is slow: 인식 중… on the button meanwhile.
 await page.evaluate(()=>{const real=window.vzipCloudScoreVision;window.__release=null;window.vzipCloudScoreVision=async(mode,image)=>{if(!mode)return real();await new Promise(r=>{window.__release=r;});return real(mode,image);};});
 await go.click();await consent(page,'인식하기');
 await expect(bar.locator('[data-ink-to-point]')).toHaveText('인식 중…');await expect(bar.locator('[data-ink-to-point]')).toBeDisabled();
 await expect(dialog.locator('[data-ink-save-state]')).toHaveText('인식 중…');
 await page.evaluate(()=>window.__release());
 const sheet=form(page);await expect(sheet).toBeVisible();
 expect(await page.evaluate(()=>window.__vision.map(v=>v.mode+':'+v.image))).toEqual(['handwriting:data:image/jpeg;base64,']);
 await expect(sheet.locator('[data-pts-note]')).toContainText('손글씨를 글자로 바꿨어요');
 await expect(sheet.getByLabel('시작 마디')).toHaveValue('5');await expect(sheet.getByLabel('끝 마디')).toHaveValue('6');
 await expect(sheet.locator('textarea[name=text]')).toHaveValue(RECOGNIZED);
 await expect(sheet.getByLabel('어느 레슨에서')).toHaveValue('l-new');
 await expect(sheet.locator('[data-pts-ink] input[value=keep]')).toBeChecked();
 await expect(sheet.locator('[data-pts-scribble]')).toHaveCount(0); // not an iPad
 // Not saved until 저장.
 expect(await rows(page,'score-point')).toEqual([]);
 await reachable(page,sheet.locator('textarea[name=text]'));
 if(process.env.VZ_SHOTS)await page.screenshot({path:process.env.VZ_SHOTS+'/ink-point-form-390.png'});
 for(const width of [375,390,820]){await page.setViewportSize({width,height:844});expect(await noOverflow(page)).toBe(true);await targets(sheet);}
 await page.setViewportSize({width:390,height:844});
 await sheet.locator('textarea[name=text]').fill(RECOGNIZED+', 턱 내리기');
 await sheet.getByRole('button',{name:'저장'}).click();await expect(sheet).toHaveCount(0);
 const saved=await rows(page,'score-point');
 expect(saved).toHaveLength(1);
 expect(saved[0]).toMatchObject({kind:'score-point',songId:'s1',scoreId:SCORE,measures:{from:5,to:6},text:RECOGNIZED+', 턱 내리기',lessonId:'l-new'});
 expect(await strokeIds(page)).toEqual(['stroke-a','stroke-b']);await expect(dialog.locator('[data-stroke]')).toHaveCount(2);
});

test('recognition fails: the form opens with an empty field and says so; 저장하고 지우기 removes only the selected strokes',async({page})=>{
 await setup(page,{vision:'fail'});const dialog=await open(page);
 await selectPhrase(page,dialog);
 await dialog.locator('[data-ink-selection-bar]').getByRole('button',{name:'지적으로',exact:true}).click();await consent(page,'인식하기');
 const sheet=form(page);await expect(sheet).toBeVisible();
 await expect(sheet.locator('[data-pts-note]')).toContainText('손글씨를 인식하지 못했어요');
 await expect(sheet.locator('textarea[name=text]')).toHaveValue('');
 await expect(sheet.getByLabel('시작 마디')).toHaveValue('5');await expect(sheet.getByLabel('끝 마디')).toHaveValue('6');
 // Empty text cannot be saved.
 await expect(sheet.getByRole('button',{name:'저장'})).toBeDisabled();
 await reachable(page,sheet.locator('textarea[name=text]'));
 await page.keyboard.type('숨 미리');
 await sheet.locator('[data-pts-ink] .vz-pts-tag',{hasText:'저장하고 지우기'}).click();
 await sheet.getByRole('button',{name:'저장'}).click();await expect(sheet).toHaveCount(0);
 expect(await rows(page,'score-point')).toMatchObject([{measures:{from:5,to:6},text:'숨 미리'}]);
 await expect(dialog.locator('[data-stroke]')).toHaveCount(1);
 expect(await strokeIds(page)).toEqual(['stroke-b']);
 await expect(dialog.locator('[data-ink-selection-bar]')).toBeHidden();
 // One step back brings the handwriting back.
 const undo=dialog.getByRole('button',{name:'필기 되돌리기',exact:true});if(!await undo.isVisible())await dialog.locator('[data-ink-more]').click();
 await undo.click();await expect(dialog.locator('[data-stroke]')).toHaveCount(2);
});

test('지적으로, 취소 on the question: nothing is sent, the form opens with the measures and an empty field',async({page})=>{
 await setup(page);const dialog=await open(page);
 await selectPhrase(page,dialog);
 await dialog.locator('[data-ink-selection-bar]').getByRole('button',{name:'지적으로',exact:true}).click();await consent(page,'취소');
 const sheet=form(page);await expect(sheet).toBeVisible();
 expect(await page.evaluate(()=>window.__vision.length)).toBe(0);
 await expect(sheet.locator('[data-pts-note]')).toHaveCount(0);
 await expect(sheet.locator('textarea[name=text]')).toHaveValue('');
 await expect(sheet.getByLabel('시작 마디')).toHaveValue('5');await expect(sheet.getByLabel('끝 마디')).toHaveValue('6');
 await expect(dialog.locator('[data-ink-to-point]')).toHaveText('지적으로');
 await sheet.locator('textarea[name=text]').fill('숨 미리');await sheet.getByRole('button',{name:'저장'}).click();await expect(sheet).toHaveCount(0);
 expect(await rows(page,'score-point')).toMatchObject([{measures:{from:5,to:6},text:'숨 미리'}]);
 expect(await strokeIds(page)).toEqual(['stroke-a','stroke-b']);
});

test('no measure conversion and no recognition: 지적으로 opens the form with empty measures and text',async({page})=>{
 await setup(page,{conversion:false,vision:'off'});const dialog=await open(page,{conversion:false});
 await selectPhrase(page,dialog);
 const bar=dialog.locator('[data-ink-selection-bar]');
 await expect(bar.locator('[data-ink-recognize]')).toBeHidden();
 await bar.getByRole('button',{name:'지적으로',exact:true}).click();
 const sheet=form(page);await expect(sheet).toBeVisible();
 await expect(page.getByRole('dialog',{name:'선택 영역 인식',exact:true})).toHaveCount(0); // nothing to send, nothing to ask
 expect(await page.evaluate(()=>window.__vision.length)).toBe(0);
 await expect(sheet.locator('[data-pts-note]')).toHaveCount(0);
 await expect(sheet.getByLabel('시작 마디')).toHaveValue('');await expect(sheet.getByLabel('끝 마디')).toHaveValue('');
 await expect(sheet.locator('.vz-pts-hint').first()).toHaveText('악보에 적힌 마디 번호예요.');
 await expect(sheet.locator('textarea[name=text]')).toHaveValue('');
 await sheet.getByLabel('시작 마디').fill('7');await sheet.locator('textarea[name=text]').fill('소리 크기 줄이기');
 await sheet.getByRole('button',{name:'저장'}).click();await expect(sheet).toHaveCount(0);
 expect(await rows(page,'score-point')).toMatchObject([{measures:{from:7,to:7},text:'소리 크기 줄이기',scoreId:SCORE}]);
 expect(await strokeIds(page)).toEqual(['stroke-a','stroke-b']);
});

test('레슨 지적으로 저장 in the recognition result: the edited words and the measures go to the form',async({page})=>{
 await setup(page);const dialog=await open(page);
 await selectPhrase(page,dialog);
 await dialog.locator('[data-ink-recognize]').click();
 await page.getByRole('dialog',{name:'선택 영역 인식'}).getByRole('button',{name:'인식하기'}).click();
 const result=dialog.locator('[data-ink-vision-result]');await expect(result.locator('[data-ink-vision-text]')).toHaveValue(RECOGNIZED);
 const action=result.getByRole('button',{name:'레슨 지적으로 저장'});await expect(action).toBeVisible();
 const b=await action.boundingBox();expect(b.height).toBeGreaterThanOrEqual(44);
 await result.locator('[data-ink-vision-text]').fill('5마디 숨 미리');
 await action.click();
 const sheet=form(page);await expect(sheet).toBeVisible();
 await expect(sheet.locator('textarea[name=text]')).toHaveValue('5마디 숨 미리');
 await expect(sheet.getByLabel('시작 마디')).toHaveValue('5');await expect(sheet.getByLabel('끝 마디')).toHaveValue('6');
 await expect(sheet.locator('[data-pts-ink] input[value=keep]')).toBeChecked();
 // Closing the form saves nothing.
 await page.keyboard.press('Escape');await expect(sheet).toHaveCount(0);
 expect(await rows(page,'score-point')).toEqual([]);expect(await strokeIds(page)).toEqual(['stroke-a','stroke-b']);
});

test('iPad: the 지적 field says Apple Pencil can write in it',async({page})=>{
 await page.addInitScript(()=>{Object.defineProperty(Navigator.prototype,'platform',{get:()=>'MacIntel'});Object.defineProperty(Navigator.prototype,'maxTouchPoints',{get:()=>5});});
 await boot(page);await page.evaluate(lessons=>window.VZ.change(d=>{d.lessons=lessons;},{silent:true}),LESSONS);
 await page.goto('/#/song/s1');
 await page.locator('[data-pts-card] [data-pts-add]').click();
 const sheet=form(page);
 await expect(sheet.locator('[data-pts-scribble]')).toHaveText('애플펜슬로 이 칸에 바로 써도 글자로 바뀌어요 (iPad 설정 › Apple Pencil › 손글씨 입력)');
 await expect(sheet.locator('[data-pts-ink]')).toHaveCount(0);
 await reachable(page,sheet.locator('textarea[name=text]'));
 expect(await noOverflow(page)).toBe(true);
});
