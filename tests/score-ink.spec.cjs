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
async function setup(page){
 const r2=await fakeR2(page);r2.store.set(key,{bytes,type:'application/pdf',etag:'"pdf"'});
 await page.context().route('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/**',route=>{
  const suffix=new URL(route.request().url()).pathname.split('pdfjs-dist@4.10.38/')[1],file=path.join(PDFROOT,suffix);
  if(!suffix||suffix.includes('..')||!fs.existsSync(file))return route.abort();
  return route.fulfill({path:file,contentType:file.endsWith('.mjs')?'text/javascript':'application/octet-stream',headers:{'access-control-allow-origin':'*'}});
 });
 await boot(page);
 await page.evaluate(([key,size])=>window.VZ.change(d=>{
  if(!d.songs[0].scores?.some(s=>s.id==='score-ink'))d.songs[0].scores=[{id:'score-ink',songId:'s1',title:'연습 악보',r2Key:key,size,uploadedAt:Date.now()}];
  if(!d.lessons.length)d.lessons.push({id:'existing-lesson',note:'기존 레슨 메모'});
  if(!d.practices.length)d.practices.push({id:'existing-practice',minutes:17,note:'기존 연습 메모'});
 }),[key,bytes.length]);
 return r2;
}
async function open(page){
 await page.goto('/#/song/s1');await page.getByRole('tab',{name:'악보',exact:true}).click();
 await page.getByRole('button',{name:'연습 악보 필기',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'악보 개인 필기'});
 await expect(dialog.locator('[data-ink-box]')).toBeVisible({timeout:20000});
 await expect(dialog.locator('[data-ink-page]')).toHaveText('1 / 2쪽');
 return dialog;
}
async function draw(page,dialog,{tool='펜',y=.22,ignored=false}={}){
 await dialog.getByRole('button',{name:tool,exact:true}).click();
 const r=await dialog.locator('[data-ink-svg]').boundingBox();
 await page.mouse.move(r.x+r.width*.15,r.y+r.height*y);await page.mouse.down();await page.mouse.move(r.x+r.width*.65,r.y+r.height*(y+.04),{steps:10});await page.mouse.up();
 if(!ignored)await expect(dialog.locator('[data-ink-status]')).toContainText('이 기기에 저장됨');
}
test.afterEach(async({page})=>expect(page.__errors||[]).toEqual([]));
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
 await expect(dialog.locator('path[data-stroke]')).toHaveAttribute('opacity','0.28');
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
 await dialog.getByLabel('펜만',{exact:true}).check();
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
