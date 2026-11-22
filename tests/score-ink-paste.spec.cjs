/* 그림 붙여넣기 on a score (app/score-ink*.js): a picture copied in GoodNotes (lasso → 복사) is pasted from 더보기 ›
 * 그림 붙여넣기, from the 메모 row or with ⌘V. It is kept on this device first, uploaded to R2 (scorepic-…, PNG) and the
 * synced record carries only its key and size. It moves, resizes and is deleted like a memo, and goes into the PDF copy.
 * The exact clipboard GoodNotes writes cannot run here: the clipboard is a stub with a made-up PNG, R2 the test stand-in. */
const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {boot,fakeR2}=require('./helpers/r2-fixture.cjs');
const fs=require('node:fs'),path=require('node:path');
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
 await page.context().route('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/**',route=>route.fulfill({path:path.join(PDFROOT,'../pdf-lib/dist/pdf-lib.min.js'),contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}}));
 await boot(page);
 await page.evaluate(([key,size])=>window.VZ.change(d=>{
  if(!d.songs[0].scores?.some(s=>s.id==='score-ink'))d.songs[0].scores=[{id:'score-ink',songId:'s1',title:'연습 악보',r2Key:key,size,uploadedAt:1763000000000}];
 }),[key,bytes.length]);
 return r2;
}
/** Opens the score. The page is never sent to the address it is already on (WebKit would reload it): the hash moves. */
async function open(page){
 await page.evaluate(()=>{if(location.hash==='#/song/s1')location.hash='#/home';});
 await page.waitForFunction(()=>location.hash!=='#/song/s1');
 await page.evaluate(()=>{location.hash='#/song/s1';});
 await page.getByRole('tab',{name:'악보',exact:true}).click();
 await page.getByRole('button',{name:'연습 악보 열기',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'악보 개인 필기'});
 await expect(dialog.locator('[data-ink-box]')).toBeVisible({timeout:20000});
 await expect(dialog.locator('[data-ink-save-state]')).toContainText('필기 준비됨',{timeout:20000});
 return dialog;
}
test.afterEach(async({page})=>expect(page.__errors||[]).toEqual([]));

const crypto=require('node:crypto'),PDF_HASH=crypto.createHash('sha256').update(bytes).digest('hex');
const records=page=>page.evaluate(()=>window.VZ.db.scoreAnnotations||[]);
const tool=(dialog,name)=>dialog.getByRole('button',{name,exact:true}).click();
async function at(dialog,p){const r=await dialog.locator('[data-ink-svg]').boundingBox();return [r.x+r.width*p[0],r.y+r.height*p[1]];}
async function line(page,dialog,from,to){
 const a=await at(dialog,from),b=await at(dialog,to);
 await page.mouse.move(...a);await page.mouse.down();await page.mouse.move(...b,{steps:12});await page.mouse.up();
}
/** 더보기 › 그림 붙여넣기 (the menu opens first unless it is open). */
async function pasteFromMore(dialog){
 if(await dialog.locator('[data-ink-more]').getAttribute('aria-expanded')!=='true')await dialog.locator('[data-ink-more]').click();
 const button=dialog.locator('.score-ink-actions [data-ink-paste]');
 await expect(button).toBeVisible();await expect(button).toHaveAccessibleName('그림 붙여넣기');await button.click();
}
/** A see-through PNG (dark ink on nothing), w × h, made in the page. */
const fakePng=(page,w=400,h=200)=>page.evaluate(([w,h])=>new Promise(resolve=>{
 const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d');x.strokeStyle='#101828';x.lineWidth=8;x.beginPath();x.moveTo(20,h/2);x.bezierCurveTo(w/3,0,w/2,h,w-20,h/2);x.stroke();
 c.toBlob(b=>{window.__fakePng=b;resolve(b.size);},'image/png');
}),[w,h]);
const stubClipboard=(page,kind)=>page.evaluate(kind=>{
 const item=kind==='png'?{types:['image/png'],getType:async()=>window.__fakePng}:{types:['text/plain'],getType:async()=>new Blob(['가사'],{type:'text/plain'})};
 Object.defineProperty(navigator,'clipboard',{configurable:true,value:{read:async()=>[item],readText:async()=>''}});
},kind);
const pictures=async page=>(await records(page)).filter(s=>s.tool==='note'&&s.imageKey);
const queued=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('vzip_score_picture_pending_v1:ui-test-user')||'[]'));
async function otherDevice(browser,page,info){
 const u=info.project.use,context=await browser.newContext({viewport:u.viewport,isMobile:u.isMobile,hasTouch:u.hasTouch,deviceScaleFactor:u.deviceScaleFactor,userAgent:u.userAgent,baseURL:new URL(page.url()).origin});
 await context.addInitScript(()=>{window.VZIP_DEVICE_SESSIONS_ENABLED=false;window.VZIP_APPROVED_HOME_ENABLED=false;});
 const other=await context.newPage();const r2=await setup(other);return {other,r2};
}
const sync=(page,remote)=>page.evaluate(remote=>{
 const storage=window.VzipAccountScope?.storage||localStorage,merged=window.VzipDataMerge.merge(window.VZ.db,remote).data;
 storage.setItem('vocal-zip_mvp_v1',JSON.stringify(merged));window.dispatchEvent(new CustomEvent('vzip:data-changed',{detail:{source:'cloud-merge'}}));
},remote);
const noSideways=(page)=>page.evaluate(()=>[document.documentElement.scrollWidth<=innerWidth,[...document.querySelectorAll('.score-ink-sheet')].every(e=>e.scrollWidth<=e.clientWidth+1)]);

test('그림 붙여넣기 keeps the picture on this device at once (offline too), uploads it to R2 later, and another device loads it from R2',async({page,browser,context},info)=>{
 test.setTimeout(90000);
 const r2=await setup(page);let dialog=await open(page);await tool(dialog,'펜');
 await fakePng(page,400,200);await stubClipboard(page,'png');
 const before=(await records(page)).length;
 // The middle of what is on screen of the page, before the picture's row opens above it.
 const view=await dialog.locator('[data-ink-stage]').boundingBox(),box=await dialog.locator('[data-ink-box]').boundingBox();
 const mid=[((Math.max(box.x,view.x)+Math.min(box.x+box.width,view.x+view.width))/2-box.x)/box.width,((Math.max(box.y,view.y)+Math.min(box.y+box.height,view.y+view.height))/2-box.y)/box.height];
 await context.setOffline(true);
 await pasteFromMore(dialog);
 await expect.poll(async()=>(await pictures(page)).length).toBe(1);
 expect((await records(page)).length).toBe(before+1);
 const [pic]=await pictures(page);
 expect(pic).toMatchObject({tool:'note',mode:'pen',color:'#ffffff',page:1,songId:'s1',scoreId:'score-ink',imageW:400,imageH:200});
 expect(pic.imageKey).toMatch(/^u\/ui-test-user\/scorepic-[\w-]+\/original\.png$/);expect(pic.imageBytes).toBeGreaterThan(100);
 // In the existing scoreAnnotations list (no new list in the app record), and the record carries no picture bytes.
 expect(await page.evaluate(()=>Object.keys(window.VZ.db).filter(k=>JSON.stringify(window.VZ.db[k]).includes('scorepic-')))).toEqual(['scoreAnnotations']);
 expect(await page.evaluate(()=>JSON.stringify(window.VZ.db))).not.toContain('data:image');
 expect(JSON.stringify(pic).length).toBeLessThan(800);
 // Shown at once from this device's copy, while offline; listed for upload, not in R2 yet.
 const shown=dialog.locator('[data-ink-note][data-ink-picture]');await expect(shown.locator('image')).toHaveAttribute('href',/^blob:/);
 await expect(shown.locator('rect')).toHaveCount(0);
 expect(await queued(page)).toEqual([pic.imageKey]);expect(r2.store.has(pic.imageKey)).toBe(false);
 const aspect=4/3;expect(pic.rect[2]/(pic.rect[3]*aspect)).toBeCloseTo(2,1);
 expect(pic.rect[0]+pic.rect[2]/2).toBeCloseTo(mid[0],2);expect(pic.rect[1]+pic.rect[3]/2).toBeCloseTo(mid[1],2);
 // Back online: uploaded as a PNG (see-through kept) under the owner's folder with the scorepic- id; the list empties.
 await context.setOffline(false);
 await expect.poll(()=>r2.store.has(pic.imageKey)).toBe(true);await expect.poll(()=>queued(page)).toEqual([]);
 const stored=r2.store.get(pic.imageKey);expect(stored.type).toBe('image/png');expect(stored.bytes.subarray(1,4).toString()).toBe('PNG');
 expect(await page.evaluate(b64=>new Promise(r=>{const i=new Image();i.onload=()=>{const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);r(x.getImageData(1,1,1,1).data[3]);};i.src='data:image/png;base64,'+b64;}),stored.bytes.toString('base64'))).toBe(0);
 // Nothing went anywhere but the R2 stand-in.
 expect(r2.calls.filter(c=>c.startsWith('POST /v1/uploads')).length).toBeGreaterThanOrEqual(1);
 // Selected with 선택: drag to move …
 await expect(dialog.getByRole('button',{name:'선택',exact:true})).toHaveAttribute('aria-pressed','true');
 const bar=dialog.locator('[data-ink-memo-bar]');await expect(bar.getByRole('button',{name:'그림 삭제',exact:true})).toBeVisible();
 await expect(bar.locator('[data-ink-memo-colors]')).toBeHidden();await expect(bar.getByRole('button',{name:'글자로 쓰기',exact:true})).toBeHidden();
 const c=[pic.rect[0]+pic.rect[2]/2,pic.rect[1]+pic.rect[3]/2];
 await line(page,dialog,c,[c[0]-.1,c[1]+.1]);
 await expect.poll(async()=>(await pictures(page))[0]?.id).not.toBe(pic.id);
 const [moved]=await pictures(page);
 expect(moved.rect[0]).toBeCloseTo(pic.rect[0]-.1,2);expect(moved.rect[1]).toBeCloseTo(pic.rect[1]+.1,2);expect(moved.rect[2]).toBeCloseTo(pic.rect[2],5);expect(moved.imageKey).toBe(pic.imageKey);
 // … and its corner to resize, keeping the proportions.
 const handle=await dialog.locator('rect[data-ink-note-handle]').boundingBox();
 await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await page.mouse.down();
 const svg=await dialog.locator('[data-ink-svg]').boundingBox();await page.mouse.move(handle.x+handle.width/2+svg.width*.1,handle.y+handle.height/2+svg.height*.02,{steps:6});await page.mouse.up();
 await expect.poll(async()=>(await pictures(page))[0]?.id).not.toBe(moved.id);
 const [bigger]=await pictures(page);expect(bigger.rect[2]).toBeGreaterThan(moved.rect[2]+.05);expect(bigger.rect[2]/(bigger.rect[3]*aspect)).toBeCloseTo(2,1);
 // Kept on this device (reload, no download), and another device loads it from R2 through a signed address.
 const reads=()=>r2.calls.filter(c=>c==='GET /v1/media/'+pic.imageKey).length;
 await page.reload();dialog=await open(page);await expect(dialog.locator('[data-ink-picture] image')).toHaveAttribute('href',/^blob:/);expect(reads()).toBe(0);
 const {other,r2:far}=await otherDevice(browser,page,info);
 far.store.set(pic.imageKey,stored);await sync(other,await page.evaluate(()=>window.VZ.db));
 const there=await open(other);await expect(there.locator('[data-ink-picture] image')).toHaveAttribute('href',/^blob:/);
 expect(far.calls).toContain('GET /v1/media/'+pic.imageKey);
 await other.context().close();
 // 그림 삭제 in its row: the record goes (tombstoned); the PNG stays in R2.
 await tool(dialog,'선택');const [x,y]=await at(dialog,[bigger.rect[0]+bigger.rect[2]/2,bigger.rect[1]+bigger.rect[3]/2]);await page.mouse.click(x,y);
 await dialog.locator('[data-ink-memo-bar]').getByRole('button',{name:'그림 삭제',exact:true}).click();
 await expect.poll(async()=>(await pictures(page)).length).toBe(0);await expect(dialog.locator('[data-ink-picture]')).toHaveCount(0);
 expect(await page.evaluate(id=>window.VZ.db.deleted.scoreAnnotations.includes(id),bigger.id)).toBe(true);
 expect(r2.store.has(pic.imageKey)).toBe(true);expect(r2.calls.some(c=>c.startsWith('DELETE'))).toBe(false);
});

test('a picture another device has not uploaded yet shows as a light frame, not an error',async({page})=>{
 await setup(page);
 await page.evaluate(([hash,key])=>window.VZ.change(d=>{(d.scoreAnnotations||=[]).push({version:1,id:'far-pic',ownerId:'ui-test-user',songId:'s1',scoreId:'score-ink',r2Key:key,pdfHash:hash,page:1,tool:'note',color:'#ffffff',rect:[.2,.2,.3,.1],mode:'pen',note:'far-pic',imageKey:'u/ui-test-user/scorepic-far/original.png',imageW:300,imageH:100,imageBytes:900,createdAt:1763000000000});}),[PDF_HASH,key]);
 const dialog=await open(page);
 await expect(dialog.locator('[data-ink-picture]')).toHaveAttribute('data-ink-picture-state','missing');
 await expect(dialog.locator('[data-ink-picture] .score-ink-picture-wait')).toHaveCount(1);
});

test('⌘V pastes a picture; a clipboard with only text says so; text fields paste text as usual; the PDF copy carries it',async({page})=>{
 test.setTimeout(60000);
 await setup(page);const dialog=await open(page);
 await fakePng(page,120,300);
 await page.evaluate(()=>{const dt=new DataTransfer();dt.items.add(new File([window.__fakePng],'goodnotes.png',{type:'image/png'}));document.querySelector('[data-ink-svg]').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt}));});
 await expect.poll(async()=>(await pictures(page)).length).toBe(1);
 const [pic]=await pictures(page);expect(pic.rect[3]*4/3/pic.rect[2]).toBeCloseTo(2.5,1);expect(pic).toMatchObject({imageW:120,imageH:300});
 // Only text on the clipboard: nothing is added and the owner is told what to do.
 await stubClipboard(page,'text');await pasteFromMore(dialog);
 await expect(page.locator('.toast').last()).toContainText('클립보드에 글자만 있어요');
 await page.evaluate(()=>{const dt=new DataTransfer();dt.setData('text/plain','가사');document.querySelector('[data-ink-svg]').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt}));});
 await expect(dialog.locator('[data-ink-status]')).toContainText('클립보드에 글자만 있어요');
 expect((await pictures(page)).length).toBe(1);
 // The 메모 row offers it too, and a paste into the page number field is left alone.
 await tool(dialog,'메모');await expect(dialog.locator('[data-ink-memo-bar]').getByRole('button',{name:'그림 붙여넣기',exact:true})).toBeVisible();
 await dialog.locator('[data-ink-page]').click();
 const kept=await dialog.locator('[data-ink-jump-input]').evaluate(e=>{const dt=new DataTransfer();dt.items.add(new File([window.__fakePng],'x.png',{type:'image/png'}));const ev=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt});e.dispatchEvent(ev);return ev.defaultPrevented;});
 expect(kept).toBe(false);expect((await pictures(page)).length).toBe(1);
 await dialog.locator('[data-ink-thumb-close]').click();
 // The PDF copy carries the picture: the page drawn into the copy has its dark ink where the picture is.
 const drawn=await page.evaluate(()=>{const seen=[];const original=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(img,...rest){if(img instanceof HTMLImageElement&&img.src.startsWith('blob:'))seen.push(rest.length);return original.call(this,img,...rest);};window.__drawn=seen;return true;});
 expect(drawn).toBe(true);
 const settings=dialog.locator('button[data-ink-settings]');if(!await settings.isVisible())await dialog.locator('[data-ink-more]').click();await settings.click();
 const panel=dialog.getByRole('region',{name:'필기 설정',exact:true});
 await panel.getByRole('tab',{name:'기타',exact:true}).click();await panel.getByRole('button',{name:'필기 PDF 만들기',exact:true}).click();
 await expect(panel.getByRole('link',{name:'만든 PDF 저장',exact:true})).toBeVisible({timeout:20000});
 expect(await page.evaluate(()=>window.__drawn)).toEqual([4]);
});

for(const [name,size]of [['phone 390',{width:390,height:844}],['iPad 820',{width:820,height:1180}]])test('그림 붙여넣기 sits in 더보기 (also in the fullscreen two-row toolbar) and the 메모 row: 44px, no sideways scroll on '+name,async({page})=>{
 await page.setViewportSize(size);await setup(page);const dialog=await open(page);
 const big=async(locator,label)=>{const b=await locator.boundingBox();expect(b.height,label).toBeGreaterThanOrEqual(44);expect(b.width,label).toBeGreaterThanOrEqual(44);};
 // 더보기, between 다시 실행 and 현재 페이지 필기 삭제.
 await dialog.locator('[data-ink-more]').click();
 const paste=dialog.locator('.score-ink-actions [data-ink-paste]');await expect(paste).toBeVisible();await big(paste,'더보기 › 그림 붙여넣기');
 expect(await dialog.locator('.score-ink-actions>button').evaluateAll(all=>all.map(b=>b.getAttribute('aria-label')).slice(0,4))).toEqual(['필기 되돌리기','필기 다시 실행','그림 붙여넣기','현재 페이지 필기 삭제']);
 expect(await noSideways(page)).toEqual([true,true]);
 await dialog.locator('[data-ink-more]').click();
 // Fullscreen (GoodNotes-style rows): still in 더보기 at the end of row 1.
 await dialog.locator('[data-ink-more]').click();await dialog.getByRole('button',{name:'전체화면',exact:true}).click();
 await expect(dialog).toHaveClass(/score-ink-fullscreen/);
 await dialog.locator('[data-ink-more]').click();await expect(paste).toBeVisible();await big(paste,'fullscreen 더보기 › 그림 붙여넣기');
 expect(await noSideways(page)).toEqual([true,true]);
 await fakePng(page);await stubClipboard(page,'png');await paste.click();
 await expect(dialog.getByRole('button',{name:'그림 삭제',exact:true})).toBeVisible();
 for(const label of ['그림 삭제','그림 선택 해제'])await big(dialog.getByRole('button',{name:label,exact:true}),label);
 expect(await noSideways(page)).toEqual([true,true]);
 // Back out of fullscreen: the 메모 row's 그림 붙여넣기 when no memo is chosen.
 await dialog.getByRole('button',{name:'그림 선택 해제',exact:true}).click();
 await dialog.locator('[data-ink-more]').click();await dialog.getByRole('button',{name:'전체화면 종료',exact:true}).click();
 await expect(dialog).not.toHaveClass(/score-ink-fullscreen/);
 await tool(dialog,'메모');const memoPaste=dialog.locator('[data-ink-memo-paste]');await expect(memoPaste).toBeVisible();await big(memoPaste,'메모 › 그림 붙여넣기');
 expect(await noSideways(page)).toEqual([true,true]);
});
