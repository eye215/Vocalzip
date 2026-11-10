const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {boot,fakeR2}=require('./helpers/r2-fixture.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PDFROOT=process.env.VZ_PDFJS_ROOT||'/tmp/vzip-score-pdfjs/node_modules/pdfjs-dist';
function pdf(){
 const stream=text=>'<< /Length '+Buffer.byteLength(text)+' >>\nstream\n'+text+'\nendstream';
 const staff='0 0 0 RG 1 w '+[170,180,190,200,210].map(y=>'20 '+y+' m 280 '+y+' l S').join('\n');
 const content=n=>'BT /F1 18 Tf 20 360 Td (VOCAL.zip Score '+n+') Tj ET\n'+staff;
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',stream(content(1)),
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',stream(content(2)),
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 let out='%PDF-1.4\n',offsets=[0];
 objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(out));out+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});
 const offset=Buffer.byteLength(out);out+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+offset+'\n%%EOF';
 return Buffer.from(out);
}
const bytes=pdf(),key='u/ui-test-user/score-ink/original.pdf';
async function setup(page,sourceBytes=bytes){
 const r2=await fakeR2(page);r2.store.set(key,{bytes:sourceBytes,type:'application/pdf',etag:'"pdf"'});
 await page.context().route('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/**',route=>{
  const suffix=new URL(route.request().url()).pathname.split('pdfjs-dist@4.10.38/')[1],file=path.join(PDFROOT,suffix);
  if(!suffix||suffix.includes('..')||!fs.existsSync(file))return route.abort();
  return route.fulfill({path:file,contentType:file.endsWith('.mjs')?'text/javascript':'application/octet-stream',headers:{'access-control-allow-origin':'*'}});
 });
 await page.context().route('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/**',route=>route.fulfill({path:path.join(PDFROOT,'../pdf-lib/dist/pdf-lib.min.js'),contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}}));
 await boot(page);
 await page.evaluate(([key,size])=>window.VZ.change(d=>{
  if(!d.songs[0].scores?.some(s=>s.id==='score-ink'))d.songs[0].scores=[{id:'score-ink',songId:'s1',title:'연습 악보',r2Key:key,size,uploadedAt:Date.now()}];
  if(!d.lessons.length)d.lessons.push({id:'existing-lesson',note:'기존 레슨 메모'});
  if(!d.practices.length)d.practices.push({id:'existing-practice',minutes:17,note:'기존 연습 메모'});
 }),[key,sourceBytes.length]);
 return r2;
}
async function open(page){
 await page.goto('/#/song/s1');await page.getByRole('tab',{name:'악보',exact:true}).click();
 await page.getByRole('button',{name:'연습 악보 열기',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'악보 개인 필기'});
 await expect(dialog.locator('[data-ink-box]')).toBeVisible({timeout:20000});
 await expect(dialog.locator('[data-ink-page]')).toHaveText('1 / 2쪽');
 await expect(dialog.locator('[data-ink-save-state]')).toContainText('필기 준비됨',{timeout:20000});
 return dialog;
}
async function draw(page,dialog,{tool='펜',y=.22,ignored=false}={}){
 await dialog.getByRole('button',{name:tool,exact:true}).click();
 const r=await dialog.locator('[data-ink-svg]').boundingBox();
 await page.mouse.move(r.x+r.width*.15,r.y+r.height*y);await page.mouse.down();await page.mouse.move(r.x+r.width*.65,r.y+r.height*(y+.04),{steps:10});await page.mouse.up();
 if(!ignored)await expect(dialog.locator('[data-ink-status]')).toContainText('이 기기에 저장됨');
}
test.afterEach(async({page})=>expect(page.__errors||[]).toEqual([]));
test('other scores lists peer songs, puts the latest practiced song first, then the same show, and opens the selected PDF',async({page})=>{
 const r2=await setup(page);
 for(const id of ['score-recent','score-show','score-other'])r2.store.set('u/ui-test-user/'+id+'/original.pdf',{bytes,type:'application/pdf',etag:'"pdf"'});
 await page.evaluate(size=>window.VZ.change(d=>{
  d.songs[0].show='Mamma Mia';
  d.songs.push(
   {id:'s2',title:'The Winner Takes It All',show:'공연용 편집본',scores:[{id:'score-show',songId:'s2',title:'공연 악보',r2Key:'u/ui-test-user/score-show/original.pdf',size}]},
   {id:'s3',title:'Memory',show:'Cats',scores:[{id:'score-recent',songId:'s3',title:'연습 악보',r2Key:'u/ui-test-user/score-recent/original.pdf',size}]},
   {id:'s4',title:'Tomorrow',show:'Annie',scores:[{id:'score-other',songId:'s4',title:'기본 악보',r2Key:'u/ui-test-user/score-other/original.pdf',size}]}
  );
  d.performances=[{id:'show-1',ownerId:'ui-test-user',title:'Mamma Mia',songLinks:[{songId:'s1'},{songId:'s2'}]}];
  d.practices=[{id:'p1',songId:'s2',date:'2026-11-09'},{id:'p2',songId:'s3',date:'2026-11-10'}];
 }),bytes.length);
 const dialog=await open(page);
 await dialog.getByRole('button',{name:'다른 악보'}).click();
 const options=dialog.locator('[data-ink-score-picker] button');
 await expect(options).toHaveCount(3);
 await expect(options.nth(0)).toContainText('Memory');
 await expect(options.nth(0)).toContainText('최근 연습');
 await expect(options.nth(1)).toContainText('The Winner Takes It All');
 await expect(options.nth(1)).toContainText('같은 공연');
 await expect(options.nth(2)).toContainText('Tomorrow');
 await options.nth(0).click();
 await expect(page.getByRole('dialog',{name:'악보 개인 필기'}).locator('.score-ink-title')).toHaveText('연습 악보');
 await expect(page.getByRole('dialog',{name:'악보 개인 필기'}).locator('[data-ink-box]')).toBeVisible();
});
test('the complete PDF starts downloading while the viewer module is still loading',async({page})=>{
 const r2=await setup(page);let started,moduleRequested;
 const fullStarted=new Promise(resolve=>{started=resolve;});
 const moduleStarted=new Promise(resolve=>{moduleRequested=resolve;});let release;
 const gate=new Promise(resolve=>{release=resolve;});
 r2.reject.beforeRead=async req=>{if(!req.headers().range)started();};
 await page.route('**/pdfjs-dist@4.10.38/legacy/build/pdf.min.mjs',async route=>{
  moduleRequested();await gate;
  await route.fulfill({path:path.join(PDFROOT,'legacy/build/pdf.min.mjs'),contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}});
 });
 try{
  await page.goto('/#/song/s1');await page.getByRole('tab',{name:'악보',exact:true}).click();
  await moduleStarted;
  await page.getByRole('button',{name:'연습 악보 열기',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'악보 개인 필기'});
  await fullStarted;
  await expect(dialog.locator('[data-ink-box]')).toBeHidden();
  release();
  await expect(dialog.locator('[data-ink-status]')).toContainText('필기 준비됨',{timeout:20000});
 }finally{release();}
});
test('real PDF renders, ink persists after reload and original PDF/lesson/practice bytes remain unchanged',async({page})=>{
 const r2=await setup(page),dialog=await open(page);
 const before=await page.evaluate(()=>({songs:window.VZ.db.songs,lessons:window.VZ.db.lessons,practices:window.VZ.db.practices}));
 expect(await dialog.locator('canvas').evaluate(c=>{
  const data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let dark=0;for(let i=0;i<data.length;i+=4)if(data[i+3]>200&&data[i]<100&&data[i+1]<100&&data[i+2]<100)dark++;return dark;
 })).toBeGreaterThan(500);
 await draw(page,dialog);await expect(dialog.locator('path[data-stroke]')).toHaveCount(1);
 if(process.env.VZ_INK_PREVIEW==='1'&&test.info().project.name==='chromium-mobile')console.log('VZIP_INK_PREVIEW:'+Buffer.from(await page.screenshot()).toString('base64'));
 await expect(dialog.getByRole('button',{name:'펜',exact:true})).toHaveCSS('background-color','rgb(237, 225, 255)');
 const saved=await page.evaluate(()=>window.VZ.db.scoreAnnotations);
 expect(saved[0]).toMatchObject({ownerId:'ui-test-user',scoreId:'score-ink',page:1,tool:'pen',pdfHash:crypto.createHash('sha256').update(bytes).digest('hex')});
 expect(saved[0].points.length).toBeGreaterThan(2);
 await dialog.getByRole('button',{name:'완료',exact:true}).click();await page.reload();const again=await open(page);
 await expect(again.locator('path[data-stroke]')).toHaveCount(1);
 expect(await page.evaluate(()=>({songs:window.VZ.db.songs,lessons:window.VZ.db.lessons,practices:window.VZ.db.practices}))).toEqual(before);
 expect(r2.store.get(key).bytes.equals(bytes)).toBe(true);expect(r2.calls.some(s=>s.startsWith('PUT')||s.startsWith('DELETE')||s==='POST /v1/uploads')).toBe(false);
});
test('highlighter, undo/redo, eraser and page selection keep independent stroke records',async({page})=>{
 await setup(page);const dialog=await open(page);await draw(page,dialog,{tool:'형광펜'});
 await expect(dialog.locator('path[data-stroke]')).toHaveAttribute('opacity','0.55');
 await dialog.getByRole('button',{name:'필기 되돌리기',exact:true}).click();await expect(dialog.locator('path[data-stroke]')).toHaveCount(0);
 await dialog.getByRole('button',{name:'필기 다시 실행',exact:true}).click();await expect(dialog.locator('path[data-stroke]')).toHaveCount(1);
 await dialog.getByRole('button',{name:'다음 악보 페이지',exact:true}).click();await expect(dialog.locator('[data-ink-page]')).toHaveText('2 / 2쪽');
 await expect(dialog.locator('path[data-stroke]')).toHaveCount(0);await draw(page,dialog,{y:.3});
 await dialog.getByRole('button',{name:'이전 악보 페이지',exact:true}).click();await expect(dialog.locator('[data-ink-page]')).toHaveText('1 / 2쪽');
 await expect(dialog.locator('path[data-stroke]')).toHaveCount(1);
 await dialog.getByRole('button',{name:'지우개',exact:true}).click();const r=await dialog.locator('[data-ink-svg]').boundingBox();
 await page.mouse.click(r.x+r.width*.4,r.y+r.height*.24);await expect(dialog.locator('path[data-stroke]')).toHaveCount(0);
 expect(await page.evaluate(()=>window.VZ.db.scoreAnnotations.map(s=>s.page))).toEqual([2]);
});
test('zoom, 320px layout and synthetic pen-only input preserve normalized positions',async({page})=>{
 await page.setViewportSize({width:320,height:844});await setup(page);const dialog=await open(page);await draw(page,dialog);
 const points=await page.evaluate(()=>window.VZ.db.scoreAnnotations[0].points);
 await dialog.getByLabel('악보 확대',{exact:true}).selectOption('2');
 await expect.poll(()=>dialog.locator('[data-ink-svg]').evaluate(e=>e.getBoundingClientRect().width)).toBeGreaterThan(450);
 expect(await page.evaluate(()=>window.VZ.db.scoreAnnotations[0].points)).toEqual(points);
 expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
 await dialog.getByLabel('악보 확대',{exact:true}).selectOption('1');
 await expect.poll(()=>dialog.locator('[data-ink-svg]').evaluate(e=>e.getBoundingClientRect().width)).toBeLessThan(350);
 await dialog.getByRole('button',{name:'색상·굵기·투명도 설정',exact:true}).click();
 await dialog.getByLabel('펜만',{exact:true}).check();
 await dialog.getByRole('button',{name:'필기 설정 닫기',exact:true}).click();
 await draw(page,dialog,{ignored:true}); // Mouse is ignored in pen-only mode.
 await expect(dialog.locator('path[data-stroke]')).toHaveCount(1);
 await dialog.locator('[data-ink-svg]').evaluate(svg=>{
  const r=svg.getBoundingClientRect(),common={bubbles:true,pointerId:77,pointerType:'pen',isPrimary:true,button:0,pressure:.6};
  for(const [type,x]of [['pointerdown',.2],['pointermove',.4],['pointerup',.6]])svg.dispatchEvent(new PointerEvent(type,{...common,clientX:r.x+r.width*x,clientY:r.y+r.height*.35}));
 });
 await expect(dialog.locator('path[data-stroke]')).toHaveCount(2);
});
test('a changed PDF keeps prior-version ink without placing it on the new source',async({page})=>{
 const r2=await setup(page);let dialog=await open(page);await draw(page,dialog);await dialog.getByRole('button',{name:'완료',exact:true}).click();
 const changed=Buffer.from(bytes.toString().replace('Score 1','Score X'));expect(changed.length).toBe(bytes.length);
 r2.store.set(key,{bytes:changed,type:'application/pdf'});
 dialog=await open(page);await expect(dialog.locator('path[data-stroke]')).toHaveCount(0);
 await expect(dialog.locator('[data-ink-status]')).toContainText('이전 버전 필기');
 expect(await page.evaluate(()=>window.VZ.db.scoreAnnotations.length)).toBe(1);
});
test('root save failure preserves the stroke journal and retries; account changes close the private editor',async({page})=>{
 await setup(page);const dialog=await open(page);
 await page.evaluate(()=>{window.__inkOriginalChange=window.VZ.change;window.VZ.change=()=>false;});
 await dialog.getByRole('button',{name:'펜',exact:true}).click();const r=await dialog.locator('[data-ink-svg]').boundingBox();
 await page.mouse.move(r.x+30,r.y+70);await page.mouse.down();await page.mouse.move(r.x+130,r.y+90,{steps:5});await page.mouse.up();
 await expect(dialog.getByRole('button',{name:'다시 저장',exact:true})).toBeVisible();await expect(dialog.locator('path[data-stroke]')).toHaveCount(1);
 await dialog.getByRole('button',{name:'돌아가기',exact:true}).click();await expect(dialog).toBeVisible();
 await page.evaluate(()=>window.VZ.change=window.__inkOriginalChange);
 await dialog.getByRole('button',{name:'다시 저장',exact:true}).click();await expect(dialog.locator('[data-ink-status]')).toContainText('이 기기에 저장됨');
 await page.evaluate(()=>{window.vzipCloudUserId=()=> 'other-user';window.dispatchEvent(new Event('vzip:auth-changed'));});
 await expect(dialog).toHaveCount(0);
 expect(await page.evaluate(()=>window.VZ.db.scoreAnnotations.length)).toBe(1);
});

test('explicit PDF deletion removes its annotation vectors and keeps lesson/practice records',async({page})=>{
 const r2=await setup(page),dialog=await open(page);await draw(page,dialog);await dialog.getByRole('button',{name:'완료',exact:true}).click();
 await page.getByRole('button',{name:'삭제',exact:true}).click();const confirm=page.getByRole('dialog',{name:'악보 삭제',exact:true});
 await expect(confirm).toContainText('개인 필기');await confirm.getByRole('button',{name:'삭제',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.VZ.song('s1').scores.length)).toBe(0);
 expect(await page.evaluate(()=>window.VZ.db.scoreAnnotations)).toEqual([]);
 expect(await page.evaluate(()=>window.VZ.db.lessons[0].note)).toBe('기존 레슨 메모');
 expect(await page.evaluate(()=>window.VZ.db.practices[0].minutes)).toBe(17);expect(r2.store.has(key)).toBe(false);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vzip_score_ink_v1:ui-test-user')).records)).toEqual([]);
});

async function configure(dialog){
 await dialog.getByRole('button',{name:'색상·굵기·투명도 설정',exact:true}).click();
 return dialog.getByRole('region',{name:'필기 설정',exact:true});
}
async function range(dialog,name,value){
 await dialog.getByRole('slider',{name,exact:true}).evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},value);
}
test('custom ink and settings persist across viewport fullscreen entry/exit with one toolbar row',async({page})=>{
 await setup(page);const dialog=await open(page);
 await dialog.getByRole('button',{name:'펜',exact:true}).click();let panel=await configure(dialog);
 await panel.getByRole('group',{name:'기본 색상',exact:true}).getByRole('button',{name:'파랑 #175cd3',exact:true}).click();
 await panel.getByLabel('사용자 색상 코드',{exact:true}).fill('#123456');await panel.getByRole('button',{name:'추가',exact:true}).click();
 await range(dialog,'펜 굵기',12);await range(dialog,'필기 투명도',60);
 await dialog.getByRole('button',{name:'필기 설정 닫기',exact:true}).click();await draw(page,dialog);
 const before=await page.evaluate(()=>window.VZ.db.scoreAnnotations);
 expect(before[0]).toMatchObject({color:'#123456',width:.012,opacity:.4});
 // Explicitly exercise the iOS/PWA viewport fallback without pretending this is a physical device.
 await page.evaluate(()=>Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:false}));
 await dialog.getByRole('button',{name:'전체화면',exact:true}).click();
 await expect(dialog).toHaveClass(/score-ink-fullscreen/);await expect(dialog.locator('[data-ink-box]')).toBeVisible();
 const tops=await dialog.locator('.score-ink-bar>.score-ink-tools>button,.score-ink-bar>.score-ink-actions>button').evaluateAll(nodes=>nodes.map(n=>Math.round(n.getBoundingClientRect().top)));
 expect(new Set(tops).size).toBe(1);
 expect(await page.evaluate(()=>window.VZ.db.scoreAnnotations)).toEqual(before);
 panel=await configure(dialog);await expect(panel.getByRole('slider',{name:'펜 굵기',exact:true})).toHaveValue('12');
 await expect(panel.getByRole('slider',{name:'필기 투명도',exact:true})).toHaveValue('60');
 await expect(panel.getByRole('button',{name:'사용자 색상 #123456',exact:true})).toHaveAttribute('aria-pressed','true');
 await dialog.getByRole('button',{name:'필기 설정 닫기',exact:true}).click();
 if(process.env.VZ_INK_PREVIEW==='1'&&test.info().project.name==='chromium-mobile')console.log('VZIP_INK2_FULL_PREVIEW:'+Buffer.from(await page.screenshot()).toString('base64'));
 await dialog.getByRole('button',{name:'전체화면 종료',exact:true}).click();
 await expect(dialog).not.toHaveClass(/score-ink-fullscreen/);await expect(dialog.locator('[data-ink-box]')).toBeVisible();
 panel=await configure(dialog);await expect(panel.getByRole('slider',{name:'펜 굵기',exact:true})).toHaveValue('12');
 await expect(panel.getByRole('slider',{name:'필기 투명도',exact:true})).toHaveValue('60');expect(await page.evaluate(()=>window.VZ.db.scoreAnnotations)).toEqual(before);
});
test('highlighter pastel and recent/custom colors survive refresh separately from pen preferences',async({page})=>{
 await setup(page);let dialog=await open(page);await dialog.getByRole('button',{name:'형광펜',exact:true}).click();
 let panel=await configure(dialog);
 await expect(panel.getByRole('group',{name:'기본 색상',exact:true}).getByRole('button')).toHaveCount(8);
 await panel.getByLabel('사용자 색상 코드',{exact:true}).fill('#c0ffee');await panel.getByRole('button',{name:'추가',exact:true}).click();
 await range(dialog,'펜 굵기',42);await range(dialog,'필기 투명도',20);
 await dialog.getByRole('button',{name:'필기 설정 닫기',exact:true}).click();await draw(page,dialog,{tool:'형광펜'});
 await expect(dialog.locator('path[data-stroke]')).toHaveAttribute('opacity','0.8');
 expect(await page.evaluate(()=>window.VZ.db.scoreAnnotations[0])).toMatchObject({color:'#c0ffee',width:.042,opacity:.8});
 await dialog.getByRole('button',{name:'완료',exact:true}).click();await page.reload();dialog=await open(page);
 await dialog.getByRole('button',{name:'형광펜',exact:true}).click();panel=await configure(dialog);
 await expect(panel.getByRole('button',{name:'사용자 색상 #c0ffee',exact:true})).toBeVisible();
 await expect(panel.getByRole('button',{name:'최근 사용 색상 #c0ffee',exact:true})).toBeVisible();
 await expect(panel.getByRole('button',{name:'파랑 #175cd3',exact:true})).toHaveCount(0);
 await dialog.getByRole('button',{name:'펜',exact:true}).click();
 await expect(panel.getByRole('button',{name:'파랑 #175cd3',exact:true})).toBeVisible();
 await expect(panel.getByRole('button',{name:'사용자 색상 #c0ffee',exact:true})).toHaveCount(0);
});
test('pen-only mode permits finger scrolling and ignores a palm while a pen stroke is active',async({page})=>{
 await setup(page);const dialog=await open(page);await dialog.getByLabel('악보 확대',{exact:true}).selectOption('2');
 await expect.poll(()=>dialog.locator('[data-ink-svg]').evaluate(e=>e.getBoundingClientRect().width)).toBeGreaterThan(450);
 await dialog.getByRole('button',{name:'펜',exact:true}).click();await configure(dialog);await dialog.getByLabel('펜만',{exact:true}).check();
 await dialog.getByRole('button',{name:'필기 설정 닫기',exact:true}).click();
 await dialog.locator('[data-ink-svg]').evaluate(svg=>{
  const stage=svg.closest('[data-ink-stage]'),r=stage.getBoundingClientRect(),common={bubbles:true,pointerId:51,pointerType:'touch',isPrimary:true,button:0};
  svg.dispatchEvent(new PointerEvent('pointerdown',{...common,clientX:r.x+100,clientY:r.y+150}));
  svg.dispatchEvent(new PointerEvent('pointermove',{...common,clientX:r.x+100,clientY:r.y+70}));
  svg.dispatchEvent(new PointerEvent('pointerup',{...common,clientX:r.x+100,clientY:r.y+70}));
 });
 await expect.poll(()=>dialog.locator('[data-ink-stage]').evaluate(e=>e.scrollTop)).toBeGreaterThan(20);
 const result=await dialog.locator('[data-ink-svg]').evaluate(svg=>{
  const stage=svg.closest('[data-ink-stage]'),r=stage.getBoundingClientRect(),before=stage.scrollTop,common={bubbles:true,isPrimary:true,button:0};
  svg.dispatchEvent(new PointerEvent('pointerdown',{...common,pointerId:77,pointerType:'pen',clientX:r.x+50,clientY:r.y+90}));
  svg.dispatchEvent(new PointerEvent('pointerdown',{...common,pointerId:52,pointerType:'touch',clientX:r.x+120,clientY:r.y+150}));
  svg.dispatchEvent(new PointerEvent('pointermove',{...common,pointerId:52,pointerType:'touch',clientX:r.x+120,clientY:r.y+80}));
  const unchanged=stage.scrollTop===before;
  svg.dispatchEvent(new PointerEvent('pointermove',{...common,pointerId:77,pointerType:'pen',clientX:r.x+150,clientY:r.y+100}));
  svg.dispatchEvent(new PointerEvent('pointerup',{...common,pointerId:77,pointerType:'pen',clientX:r.x+150,clientY:r.y+100}));
  return unchanged;
 });
 expect(result).toBe(true);expect(await page.evaluate(()=>window.VZ.db.scoreAnnotations.length)).toBe(1);
});
test('whole score row opens the viewer with keyboard access and independent edit/delete controls',async({page})=>{
 await setup(page);await page.goto('/#/song/s1');await page.getByRole('tab',{name:'악보',exact:true}).click();
 const row=page.locator('[data-score="score-ink"]');await expect(row.locator('[data-open],[data-ink]')).toHaveCount(0);
 await row.getByRole('button',{name:'정보 수정',exact:true}).click();await expect(page.getByRole('dialog',{name:'악보 개인 필기'})).toHaveCount(0);
 await page.getByRole('dialog',{name:'악보 정보',exact:true}).getByRole('button',{name:'돌아가기',exact:true}).click();
 await row.getByRole('button',{name:'연습 악보 열기',exact:true}).focus();await page.keyboard.press('Enter');
 const dialog=page.getByRole('dialog',{name:'악보 개인 필기'});await expect(dialog.locator('[data-ink-box]')).toBeVisible({timeout:20000});
 await dialog.getByRole('button',{name:'완료',exact:true}).click();
 await row.getByRole('button',{name:'삭제',exact:true}).click();await expect(page.getByRole('dialog',{name:'악보 삭제',exact:true})).toBeVisible();
 await expect(page.getByRole('dialog',{name:'악보 개인 필기'})).toHaveCount(0);
 await page.getByRole('dialog',{name:'악보 삭제',exact:true}).getByRole('button',{name:'취소',exact:true}).click();
});

test('tablet default favors Pencil and two-finger pinch zoom changes only the viewport',async({page})=>{
 await setup(page);
 await page.evaluate(()=>{Object.defineProperty(navigator,'platform',{configurable:true,value:'MacIntel'});Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,value:5});});
 const dialog=await open(page);await expect(dialog.getByRole('button',{name:'펜',exact:true})).toHaveAttribute('aria-pressed','true');await configure(dialog);await expect(dialog.getByLabel('펜만',{exact:true})).toBeChecked();
 await dialog.getByRole('button',{name:'필기 설정 닫기',exact:true}).click();
 const before=await dialog.locator('[data-ink-svg]').evaluate(e=>e.getBoundingClientRect().width);
 await dialog.locator('[data-ink-svg]').evaluate(svg=>{
  const r=svg.closest('[data-ink-stage]').getBoundingClientRect(),common={bubbles:true,pointerType:'touch',button:0};
  const send=(type,id,x,primary)=>svg.dispatchEvent(new PointerEvent(type,{...common,pointerId:id,isPrimary:primary,clientX:r.x+x,clientY:r.y+140}));
  send('pointerdown',31,90,true);send('pointerdown',32,190,false);
  send('pointermove',31,50,true);send('pointermove',32,230,false);
  send('pointerup',31,50,true);send('pointerup',32,230,false);
 });
 await expect(dialog.locator('[data-ink-box]')).toBeVisible();
 await expect.poll(()=>dialog.locator('[data-ink-svg]').evaluate(e=>e.getBoundingClientRect().width)).toBeGreaterThan(before*1.5);
 expect(await page.evaluate(()=>window.VZ.db.scoreAnnotations||[])).toEqual([]);
 await dialog.getByRole('button',{name:'펜',exact:true}).click();
 await dialog.locator('[data-ink-svg]').evaluate(svg=>{
  const r=svg.closest('[data-ink-stage]').getBoundingClientRect(),common={bubbles:true,pointerId:81,pointerType:'pen',isPrimary:true,button:0,pressure:.7};
  for(const [type,x]of [['pointerdown',50],['pointermove',150],['pointerup',180]])svg.dispatchEvent(new PointerEvent(type,{...common,clientX:r.x+x,clientY:r.y+100}));
 });
 await expect(dialog.locator('[data-ink-status]')).toContainText('이 기기에 저장됨');expect(await page.evaluate(()=>window.VZ.db.scoreAnnotations.length)).toBe(1);
});
test('fullscreen-capable browsers keep the editor open when the explicit exit control is used',async({page})=>{
 await setup(page);const dialog=await open(page);await dialog.getByRole('button',{name:'전체화면',exact:true}).click();
 await expect(dialog).toHaveClass(/score-ink-fullscreen/);await expect(dialog.getByRole('button',{name:'전체화면 종료',exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'전체화면 종료',exact:true}).click();await expect(dialog).toBeVisible();await expect(dialog).not.toHaveClass(/score-ink-fullscreen/);
});

for(const rotated of [false,true]){
 test('annotated PDF download preserves source and exports transformed red ink'+(rotated?' with rotation/crop':''),async({page})=>{
  const lib=require(path.join(PDFROOT,'../pdf-lib')),sourceDoc=await lib.PDFDocument.load(bytes);
  if(rotated){sourceDoc.getPage(0).setRotation(lib.degrees(90));sourceDoc.getPage(0).setCropBox(20,30,260,340);}
  const sourceBytes=rotated?Buffer.from(await sourceDoc.save()):bytes,r2=await setup(page,sourceBytes),dialog=await open(page);
  await dialog.getByRole('button',{name:'펜',exact:true}).click();let panel=await configure(dialog);
  await panel.getByRole('button',{name:'진한 빨강 #b42318',exact:true}).click();await range(dialog,'펜 굵기',14);
  await dialog.getByRole('button',{name:'필기 설정 닫기',exact:true}).click();await draw(page,dialog);
  await dialog.getByRole('button',{name:'선택',exact:true}).click();
  await dragInk(page,dialog,[.1,.18],[.7,.30]);
  await expect(dialog.locator('[data-ink-selection-count]')).toHaveText('1개 선택');
  await dragInk(page,dialog,[.4,.24],[.5,.28],{pen:true});
  const before=await page.evaluate(()=>window.VZ.db.scoreAnnotations);panel=await configure(dialog);
  await panel.getByRole('button',{name:'필기 PDF 만들기',exact:true}).click();
  const save=panel.getByRole('link',{name:'만든 PDF 저장',exact:true});await expect(save).toBeVisible({timeout:20000});
  const rendered=await save.evaluate(async a=>{
   const bytes=new Uint8Array(await(await fetch(a.href)).arrayBuffer());
   const pdf=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.min.mjs');
   const document=await pdf.getDocument({data:bytes,isEvalSupported:false,standardFontDataUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/'}).promise;
   try{
    const page=await document.getPage(1),view=page.getViewport({scale:1}),canvas=window.document.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
    await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;
    const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let red=0,positioned=0;
    for(let i=0;i<pixels.length;i+=4)if(pixels[i]>100&&pixels[i+1]<80&&pixels[i+2]<80){red++;const x=(i/4%canvas.width)/canvas.width,y=Math.floor(i/4/canvas.width)/canvas.height;if(x>.22&&x<.78&&y>.22&&y<.34)positioned++;}
    const out={red,positioned,pages:document.numPages,rotation:page.rotate};canvas.width=0;canvas.height=0;return out;
   }finally{await document.destroy();}
  });
  expect(rendered.red).toBeGreaterThan(50);expect(rendered.positioned/rendered.red).toBeGreaterThan(.95);expect(rendered.pages).toBe(2);expect(rendered.rotation).toBe(rotated?90:0);
  const downloadEvent=page.waitForEvent('download');await save.click();const download=await downloadEvent;
  expect(download.suggestedFilename()).toBe('연습 악보_필기.pdf');
  const output=await lib.PDFDocument.load(fs.readFileSync(await download.path()));expect(output.getPageCount()).toBe(2);
  expect(output.getPage(0).getRotation().angle).toBe(rotated?90:0);
  if(rotated)expect(output.getPage(0).getCropBox()).toEqual({x:20,y:30,width:260,height:340});
  expect(r2.store.get(key).bytes.equals(sourceBytes)).toBe(true);expect(await page.evaluate(()=>window.VZ.db.scoreAnnotations)).toEqual(before);
  expect(r2.calls.some(c=>c.startsWith('PUT')||c.startsWith('DELETE')||c==='POST /v1/uploads')).toBe(false);
 });
}

async function dragInk(page,dialog,from,to,{cancel=false,pen=false,handle=false}={}){
 const svg=dialog.locator('[data-ink-svg]'),r=await svg.boundingBox();
 if(pen||cancel){
  await svg.evaluate((svg,{from,to,cancel,handle})=>{
   const r=svg.getBoundingClientRect(),common={bubbles:true,pointerId:91,pointerType:'pen',isPrimary:true,button:0,pressure:.6};
   const fire=(target,type,p)=>target.dispatchEvent(new PointerEvent(type,{...common,clientX:r.x+r.width*p[0],clientY:r.y+r.height*p[1]}));
   fire(handle?svg.querySelector('[data-ink-selection-handle]'):svg,'pointerdown',from);
   fire(svg,'pointermove',to);fire(svg,cancel?'pointercancel':'pointerup',to);
  },{from,to,cancel,handle});
 }else{
  await page.mouse.move(r.x+r.width*from[0],r.y+r.height*from[1]);await page.mouse.down();
  await page.mouse.move(r.x+r.width*to[0],r.y+r.height*to[1],{steps:8});await page.mouse.up();
 }
}
async function selectInk(page,dialog){
 await dialog.getByRole('button',{name:'선택',exact:true}).click();
 await dragInk(page,dialog,[.10,.10],[.70,.33]);
 await expect(dialog.locator('[data-ink-selection-count]')).toHaveText('2개 선택');
}

test('selection moves a group once, undoes/redoes and deletes without changing scores or unrelated records',async({page})=>{
 const r2=await setup(page);let dialog=await open(page);
 await draw(page,dialog,{y:.14});await draw(page,dialog,{tool:'형광펜',y:.24});
 const before=await page.evaluate(()=>structuredClone(window.VZ.db)),original=before.scoreAnnotations;
 await selectInk(page,dialog);
 const dragBox=await dialog.locator('[data-ink-svg]').boundingBox();
 await dragInk(page,dialog,[.4,.2],[.5,.24]);
 await expect(dialog.locator('[data-ink-status]')).toContainText('이 기기에 저장됨');
 const moved=await page.evaluate(()=>window.VZ.db.scoreAnnotations);
 expect(moved).toHaveLength(2);moved.forEach((s,i)=>{
  expect(s.id).not.toBe(original[i].id);expect(Math.abs(s.points[0][0]-original[i].points[0][0]-.1)).toBeLessThan(1.5/dragBox.width);
  expect(Math.abs(s.points[0][1]-original[i].points[0][1]-.04)).toBeLessThan(1.5/dragBox.height);
  expect(s.color).toBe(original[i].color);expect(s.opacity).toBe(original[i].opacity);expect(s.points[0][2]).toBe(original[i].points[0][2]);
 });
 await dialog.getByRole('button',{name:'필기 되돌리기',exact:true}).click();
 expect(await page.evaluate(()=>window.VZ.db.scoreAnnotations.map(s=>s.points))).toEqual(original.map(s=>s.points));
 await dialog.getByRole('button',{name:'필기 다시 실행',exact:true}).click();
 expect(await page.evaluate(()=>window.VZ.db.scoreAnnotations.map(s=>s.points))).toEqual(moved.map(s=>s.points));
 await selectInk(page,dialog);await dialog.getByRole('button',{name:'선택 필기 삭제',exact:true}).click();
 await expect(dialog.locator('path[data-stroke]')).toHaveCount(0);
 await dialog.getByRole('button',{name:'필기 되돌리기',exact:true}).click();await expect(dialog.locator('path[data-stroke]')).toHaveCount(2);
 await dialog.getByRole('button',{name:'완료',exact:true}).click();await page.reload();dialog=await open(page);
 expect(await page.evaluate(()=>window.VZ.db.scoreAnnotations.map(s=>s.points))).toEqual(moved.map(s=>s.points));
 expect(await page.evaluate(()=>({songs:window.VZ.db.songs,lessons:window.VZ.db.lessons,practices:window.VZ.db.practices}))).toEqual({songs:before.songs,lessons:before.lessons,practices:before.practices});
 expect(r2.store.get(key).bytes.equals(bytes)).toBe(true);
});
test('Pencil corner resize scales a group and thickness; cancellation and empty tap never edit notes',async({page})=>{
 await setup(page);const dialog=await open(page);await draw(page,dialog,{y:.14});await draw(page,dialog,{tool:'형광펜',y:.24});await selectInk(page,dialog);
 const original=await page.evaluate(()=>window.VZ.db.scoreAnnotations),b=await page.evaluate(()=>window.VzipScoreInk.bounds(window.VZ.db.scoreAnnotations,4/3));
 await dragInk(page,dialog,[b.x+b.w,b.y+b.h],[b.x+b.w*1.2,b.y+b.h*1.2],{pen:true,handle:true});
 const resized=await page.evaluate(()=>window.VZ.db.scoreAnnotations);
 resized.forEach((s,i)=>expect(s.width/original[i].width).toBeCloseTo(1.2,2));
 await dragInk(page,dialog,[.4,.2],[.5,.25],{pen:true,cancel:true});
 expect(await page.evaluate(()=>window.VZ.db.scoreAnnotations)).toEqual(resized);
 await dragInk(page,dialog,[.9,.35],[.9,.35],{pen:true});
 await expect(dialog.locator('[data-ink-selection-bar]')).toBeHidden();
 expect(await page.evaluate(()=>window.VZ.db.scoreAnnotations)).toEqual(resized);
});
test('selection controls remain touch sized in fullscreen, preserve selection on zoom, and release on page change',async({page})=>{
 await setup(page);const dialog=await open(page);await draw(page,dialog,{y:.14});await draw(page,dialog,{y:.24});await selectInk(page,dialog);
 const before=await page.evaluate(()=>window.VZ.db.scoreAnnotations.map(s=>s.points));
 await dialog.getByRole('button',{name:'전체화면',exact:true}).click();
 await expect(dialog.locator('[data-ink-selection-count]')).toHaveText('2개 선택');
 for(const label of ['선택 필기 축소','선택 필기 확대','선택 필기 삭제','필기 선택 해제']){
  const r=await dialog.getByRole('button',{name:label,exact:true}).boundingBox();expect(r.width).toBeGreaterThanOrEqual(44);expect(r.height).toBeGreaterThanOrEqual(44);
 }
 if(process.env.VZ_INK_PREVIEW==='1'&&test.info().project.name==='chromium-mobile')console.log('VZIP_INK_SELECTION_PREVIEW:'+Buffer.from(await page.screenshot()).toString('base64'));
 await dialog.getByLabel('악보 확대',{exact:true}).selectOption('1.5');
 await expect(dialog.locator('[data-ink-selection-bar]')).toBeVisible();
 expect(await page.evaluate(()=>window.VZ.db.scoreAnnotations.map(s=>s.points))).toEqual(before);
 await dialog.getByRole('button',{name:'선택 필기 확대',exact:true}).click();
 const after=await page.evaluate(()=>window.VZ.db.scoreAnnotations);
 expect(after[0].width/.004).toBeCloseTo(1.1,3);
 await dialog.getByRole('button',{name:'다음 악보 페이지',exact:true}).click();
 await expect(dialog.locator('[data-ink-page]')).toHaveText('2 / 2쪽');await expect(dialog.locator('[data-ink-selection-bar]')).toBeHidden();
 await expect(dialog.locator('path[data-stroke]')).toHaveCount(0);
});
test('a concurrent deleted selection is released and never deletes another incoming stroke',async({page})=>{
 await setup(page);const dialog=await open(page);await draw(page,dialog,{y:.14});await draw(page,dialog,{y:.24});await selectInk(page,dialog);
 await page.evaluate(()=>window.VZ.change(d=>{
  const old=d.scoreAnnotations[0];d.scoreAnnotations=d.scoreAnnotations.slice(1);d.scoreAnnotations.push({...old,id:'other-device',points:[[.8,.1,.5],[.9,.2,.5]]});
  d.deleted||={};d.deleted.scoreAnnotations=[...(d.deleted.scoreAnnotations||[]),old.id];
 }));
 await expect(dialog.locator('[data-ink-selection-bar]')).toBeHidden();
 expect(await page.evaluate(()=>window.VZ.db.scoreAnnotations.some(s=>s.id==='other-device'))).toBe(true);
 await dialog.getByRole('button',{name:'펜',exact:true}).click();
 await expect(dialog.locator('[data-ink-selection-overlay]')).toHaveCount(0);
});
test('failed group movement preserves a recovery copy, retries once, and undo restores the original group',async({page})=>{
 await setup(page);const dialog=await open(page);await draw(page,dialog,{y:.14});await draw(page,dialog,{y:.24});await selectInk(page,dialog);
 const before=await page.evaluate(()=>window.VZ.db.scoreAnnotations.map(s=>s.points));
 await page.evaluate(()=>{window.__inkChange=window.VZ.change;window.VZ.change=()=>false;});
 await dragInk(page,dialog,[.4,.2],[.5,.24],{pen:true});
 await expect(dialog.getByRole('button',{name:'다시 저장',exact:true})).toBeVisible();
 await expect(dialog.locator('path[data-stroke]')).toHaveCount(2);
 await page.evaluate(()=>window.VZ.change=window.__inkChange);
 await dialog.getByRole('button',{name:'다시 저장',exact:true}).click();
 const moved=await page.evaluate(()=>window.VZ.db.scoreAnnotations);
 expect(moved).toHaveLength(2);expect(moved[0].points).not.toEqual(before[0]);
 await dialog.getByRole('button',{name:'필기 되돌리기',exact:true}).click();
 expect(await page.evaluate(()=>window.VZ.db.scoreAnnotations.map(s=>s.points))).toEqual(before);
});
