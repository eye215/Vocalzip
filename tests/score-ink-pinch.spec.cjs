/* Two-finger pinch on the score (app/score-ink.js gestureMove / pinchTo) with real touches (CDP), on the owner's iPad:
 * it zooms around the fingers, the zoom menu follows, the PDF is drawn again once at the end, and two fingers never
 * write — with 펜만 필기 (the iPad default) and with finger writing (a second finger that lands late too), with a wide
 * thumb, and with fingers on the grey margin beside the page. Apple Pencil in the other hand still writes. */
const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {boot,fakeR2}=require('./helpers/r2-fixture.cjs');
const fs=require('node:fs'),path=require('node:path');
// The owner's iPad: its user agent turns 펜만 필기 on by default (fingers move the page, Apple Pencil writes).
const IPAD='Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
test.use({viewport:{width:820,height:1180},hasTouch:true,isMobile:true,userAgent:IPAD});
const PDFROOT=process.env.VZ_PDFJS_ROOT||'/tmp/vzip-score-pdfjs/node_modules/pdfjs-dist';
function pdf(){
 const stream=text=>'<< /Length '+Buffer.byteLength(text)+' >>\nstream\n'+text+'\nendstream';
 const staff='0 0 0 RG 1 w '+[170,180,190,200,210].map(y=>'20 '+y+' m 280 '+y+' l S').join('\n');
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
  stream('BT /F1 18 Tf 20 360 Td (VOCAL.zip Score) Tj ET\n'+staff),'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
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
  if(!d.songs[0].scores?.some(s=>s.id==='score-ink'))d.songs[0].scores=[{id:'score-ink',songId:'s1',title:'연습 악보',r2Key:key,size,uploadedAt:1763000000000}];
 }),[key,bytes.length]);
}
async function open(page){
 await page.goto('/#/song/s1');await page.getByRole('tab',{name:'악보',exact:true}).tap();
 await page.getByRole('button',{name:'연습 악보 열기',exact:true}).tap();
 const dialog=page.getByRole('dialog',{name:'악보 개인 필기'});
 await expect(dialog.locator('[data-ink-box]')).toBeVisible({timeout:20000});
 await expect(dialog.locator('[data-ink-save-state]')).toContainText('필기 준비됨',{timeout:20000});
 return dialog;
}
const SETTINGS='vzip_score_ink_settings_v1:ui-test-user';
const strokes=page=>page.evaluate(()=>(window.VZ.db.scoreAnnotations||[]).filter(s=>s.kind!=='marker-preset').length);
const zoom=dialog=>dialog.locator('[data-ink-zoom]').inputValue();
const width=async dialog=>(await dialog.locator('[data-ink-box]').boundingBox()).width;
/** Two fingers from `from` px apart to `to` px apart around (x, y). late: the first finger moves alone this long first.
 *  radius: the touch radius Safari reports (a thumb is wide). during(): runs while both fingers are down. */
async function pinch(page,{x,y,from,to,late=0,radius=8,during}){
 const cdp=await page.context().newCDPSession(page),send=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
 const pts=d=>[{x:x-d/2,y,id:1,radiusX:radius,radiusY:radius},{x:x+d/2,y,id:2,radiusX:radius,radiusY:radius}];
 if(late){const p=pts(from)[0];await send('touchStart',[p]);for(let i=1;i<=6;i++){await send('touchMove',[{...p,y:p.y-i*6}]);await page.waitForTimeout(late/6);}await send('touchMove',[p]);}
 await send('touchStart',pts(from));
 for(let i=1;i<=12;i++){await send('touchMove',pts(from+(to-from)*i/12));if(i===6&&during)await during();await page.waitForTimeout(16);}
 await send('touchEnd',[]);await cdp.detach();
}
async function centre(dialog){const r=await dialog.locator('[data-ink-svg]').boundingBox();return {x:r.x+r.width/2,y:r.y+r.height/2};}
async function settled(page,dialog,value){
 await expect.poll(()=>zoom(dialog)).toBe(value);
 await expect(dialog.locator('[data-ink-save-state]')).toContainText('필기 준비됨',{timeout:20000});
}
async function start(page,penOnly){
 await setup(page);
 if(!penOnly)await page.evaluate(k=>localStorage.setItem(k,JSON.stringify({version:1,owner:'ui-test-user',penOnly:false})),SETTINGS);
 const dialog=await open(page);
 expect(await dialog.locator('[data-ink-svg]').getAttribute('data-pen-only')).toBe(String(penOnly));
 if(!penOnly)await dialog.getByRole('button',{name:'펜',exact:true}).click();
 return dialog;
}
test.skip(({browserName})=>browserName!=='chromium','real touches need Chromium (CDP)');
test.afterEach(async({page})=>expect(page.__errors||[]).toEqual([]));

test('펜만 필기 (iPad default): a pinch zooms, with a wide thumb and on the grey margin too; the pencil still writes',async({page})=>{
 const dialog=await start(page,true),fit=await width(dialog);
 // A thumb and a finger: Safari reports the thumb some 70px wide.
 await pinch(page,{...await centre(dialog),from:80,to:160,radius:35});await settled(page,dialog,'2');
 expect(await width(dialog)).toBeGreaterThan(fit*1.9);
 // Smaller than the screen, then pinched on the margin beside the page and across its edge.
 await pinch(page,{...await centre(dialog),from:320,to:100});await settled(page,dialog,'0.75');
 const box=await dialog.locator('[data-ink-box]').boundingBox(),stage=await dialog.locator('[data-ink-stage]').boundingBox();
 await pinch(page,{x:(stage.x+box.x)/2,y:box.y+box.height/2,from:20,to:50});
 await expect.poll(async()=>Number(await zoom(dialog))).toBeGreaterThan(.9);
 await expect(dialog.locator('[data-ink-save-state]')).toContainText('필기 준비됨',{timeout:20000});
 const z=Number(await zoom(dialog)),b=await dialog.locator('[data-ink-box]').boundingBox();
 await pinch(page,{x:b.x,y:b.y+b.height/2,from:60,to:120});
 await expect.poll(async()=>Number(await zoom(dialog))).toBeGreaterThan(z*1.3);
 // Apple Pencil writes while two fingers hold the page.
 await pinch(page,{...await centre(dialog),from:200,to:150,during:()=>dialog.locator('[data-ink-svg]').evaluate(svg=>{
  const r=svg.getBoundingClientRect(),o={bubbles:true,cancelable:true,pointerId:61,pointerType:'pen',isPrimary:true,pressure:.5,buttons:1};
  svg.dispatchEvent(new PointerEvent('pointerdown',{...o,clientX:r.x+r.width*.3,clientY:r.y+r.height*.3}));
  for(let i=1;i<=5;i++)svg.dispatchEvent(new PointerEvent('pointermove',{...o,clientX:r.x+r.width*(.3+i*.02),clientY:r.y+r.height*.3}));
  svg.dispatchEvent(new PointerEvent('pointerup',{...o,buttons:0,clientX:r.x+r.width*.4,clientY:r.y+r.height*.3}));
 })});
 await expect.poll(()=>strokes(page)).toBe(1);
});

test('finger writing: two fingers zoom and never write, also when the second finger lands late',async({page})=>{
 const dialog=await start(page,false),fit=await width(dialog);
 await pinch(page,{...await centre(dialog),from:80,to:160});await settled(page,dialog,'2');
 expect(await width(dialog)).toBeGreaterThan(fit*1.9);
 // The first finger has been drawing for half a second when the second one lands: the stroke is dropped, the page zooms.
 await pinch(page,{...await centre(dialog),from:240,to:120,late:500});await settled(page,dialog,'1');
 // On the grey margin beside the page (finger writing on: these fingers start no pointer gesture of their own).
 await pinch(page,{...await centre(dialog),from:320,to:100});await settled(page,dialog,'0.75');
 const box=await dialog.locator('[data-ink-box]').boundingBox(),stage=await dialog.locator('[data-ink-stage]').boundingBox();
 await pinch(page,{x:(stage.x+box.x)/2,y:box.y+box.height/2,from:20,to:50});
 await expect.poll(async()=>Number(await zoom(dialog))).toBeGreaterThan(.9);
 await expect(dialog.locator('[data-ink-save-state]')).toContainText('필기 준비됨',{timeout:20000});
 expect(await strokes(page)).toBe(0);
});

/** Apple Pencil along y = .3 of the page from x0 to x1 (shares of the page). */
const pen=(dialog,x0,x1,id)=>dialog.locator('[data-ink-svg]').evaluate((svg,[x0,x1,id])=>{
 const r=svg.getBoundingClientRect(),o={bubbles:true,cancelable:true,pointerId:id,pointerType:'pen',isPrimary:true,pressure:.5,buttons:1},at=(x,y)=>({clientX:r.x+r.width*x,clientY:r.y+r.height*y});
 svg.dispatchEvent(new PointerEvent('pointerdown',{...o,...at(x0,.3)}));
 for(let i=1;i<=6;i++)svg.dispatchEvent(new PointerEvent('pointermove',{...o,...at(x0+(x1-x0)*i/6,.3+(i%2)*.01)}));
 svg.dispatchEvent(new PointerEvent('pointerup',{...o,buttons:0,...at(x1,.3)}));
},[x0,x1,id]);
test('iPad taps: toolbar and selection-bar buttons work with touch; 지적으로 while the page is drawn again waits for it',async({page})=>{
 const dialog=await start(page,true),bar=dialog.locator('[data-ink-selection-bar]');
 await pen(dialog,.2,.5,71);await expect.poll(()=>strokes(page)).toBe(1);
 // A finger tap on the toolbar, then the pencil draws a selection box.
 await dialog.getByRole('button',{name:'선택',exact:true}).tap();
 await expect(dialog.getByRole('button',{name:'선택',exact:true})).toHaveAttribute('aria-pressed','true');
 const box=async()=>dialog.locator('[data-ink-svg]').evaluate(svg=>{
  const r=svg.getBoundingClientRect(),o={bubbles:true,cancelable:true,pointerId:72,pointerType:'pen',isPrimary:true,buttons:1},at=(x,y)=>({clientX:r.x+r.width*x,clientY:r.y+r.height*y});
  svg.dispatchEvent(new PointerEvent('pointerdown',{...o,...at(.1,.2)}));
  for(let i=1;i<=6;i++)svg.dispatchEvent(new PointerEvent('pointermove',{...o,...at(.1+.5*i/6,.2+.2*i/6)}));
  svg.dispatchEvent(new PointerEvent('pointerup',{...o,buttons:0,...at(.6,.4)}));
 });
 await box();await expect(bar.locator('[data-ink-selection-count]')).toHaveText('1개 선택');
 // A finger tap on the selection bar.
 await bar.locator('[data-ink-selection-delete]').tap();await expect.poll(()=>strokes(page)).toBe(0);
 await dialog.getByRole('button',{name:'펜',exact:true}).tap();await pen(dialog,.2,.5,73);await expect.poll(()=>strokes(page)).toBe(1);
 await dialog.getByRole('button',{name:'선택',exact:true}).tap();await box();await expect(bar.locator('[data-ink-selection-count]')).toHaveText('1개 선택');
 // The page is drawn again (the zoom changed, as when the iPad turns) and 지적으로 is tapped meanwhile: it waits, then asks.
 const go=bar.locator('[data-ink-to-point]');await expect(go).toBeVisible();
 // (The press lands in the same moment the redraw starts.)
 expect(await dialog.evaluate(el=>{const zoom=el.querySelector('[data-ink-zoom]');zoom.value='2';zoom.dispatchEvent(new Event('change'));el.querySelector('[data-ink-to-point]').click();return el.querySelector('[data-ink-save-state]')!=null;})).toBe(true);
 await expect(page.getByRole('dialog',{name:/^(지적 추가|선택 영역 인식)$/})).toBeVisible();
});
