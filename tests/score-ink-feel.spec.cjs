/* 악보 필기감 (app/score-ink*.js): no text or block selection while writing, smooth pressure strokes, the eraser's
 * circle, the microphone question in fullscreen, and 붙여넣기 (a picture copied in GoodNotes, kept on the device and
 * uploaded to R2). Real Apple Pencil latency and the exact clipboard GoodNotes writes cannot run here: pen input is
 * synthetic PointerEvents, the clipboard a stub with a fake PNG, and R2 the test stand-in. */
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
async function open(page){
 await page.goto('/#/song/s1');await page.getByRole('tab',{name:'악보',exact:true}).click();
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
async function act(dialog,name){
 const button=dialog.getByRole('button',{name,exact:true});
 if(!await button.isVisible())await dialog.locator('[data-ink-more]').click();
 await button.click();
}
async function at(dialog,p){const r=await dialog.locator('[data-ink-svg]').boundingBox();return [r.x+r.width*p[0],r.y+r.height*p[1]];}
async function line(page,dialog,from,to){
 const a=await at(dialog,from),b=await at(dialog,to);
 await page.mouse.move(...a);await page.mouse.down();await page.mouse.move(...b,{steps:12});await page.mouse.up();
}
/** A synthetic Apple Pencil stroke: pointerdown, `moves` pointermoves each carrying `per` coalesced samples (as Safari
 *  and Chrome report them), pointerup. pts(t) → [x, y, pressure] in page fractions for t in 0–1. Returns the raw samples. */
function pen(dialog,{moves=40,per=6,pts,id=31}){
 return dialog.locator('[data-ink-svg]').evaluate((svg,{moves,per,src,id})=>{
  const f=new Function('t','return ('+src+')(t)'),r=svg.getBoundingClientRect(),raw=[];
  const ev=(type,t,extra={})=>{const [x,y,p]=f(t);raw.push([x,y,p]);return new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType:'pen',isPrimary:true,button:type==='pointermove'?-1:0,buttons:type==='pointerup'?0:1,pressure:p,clientX:r.x+r.width*x,clientY:r.y+r.height*y,...extra});};
  svg.dispatchEvent(ev('pointerdown',0));
  for(let m=1;m<=moves;m++){
   const list=[];for(let k=1;k<=per;k++)list.push(ev('pointermove',((m-1)*per+k)/(moves*per)));
   const last=list.at(-1);Object.defineProperty(last,'getCoalescedEvents',{value:()=>list});svg.dispatchEvent(last);
  }
  svg.dispatchEvent(ev('pointerup',1));
  return raw;
 },{moves,per,src:pts.toString(),id});
}
const wave=pressure=>`t=>[.12+.7*t,.3+.06*Math.sin(t*Math.PI*4),${pressure}]`;

test('writing never selects text or blocks; text fields still select',async({page})=>{
 await setup(page);
 // An AI text memo (텍스트 메모) on the page: in the text layer above the score.
 await page.evaluate(([hash,key])=>localStorage.setItem('vzip_score_text_v1:ui-test-user:score-ink',JSON.stringify({pdfHash:hash,r2Key:key,notes:[{id:'t1',page:1,text:'숨 크게',x:.3,y:.3}]})),[PDF_HASH,key]);
 const dialog=await open(page);await tool(dialog,'펜');
 const style=(sel)=>dialog.locator(sel).first().evaluate(e=>{const c=getComputedStyle(e);return {user:c.userSelect??c.webkitUserSelect,webkit:c.webkitUserSelect,touch:c.touchAction,callout:c.webkitTouchCallout,events:c.pointerEvents};});
 for(const sel of ['[data-ink-svg]','[data-ink-box]','[data-ink-pdf]','[data-ink-stage]','[data-ink-text-layer]','.score-ink-text-note','.score-ink-tools']){
  const c=await style(sel);expect(c.user,sel).toBe('none');if(c.webkit!==undefined)expect(c.webkit,sel).toBe('none');
  if(c.callout!==undefined)expect(c.callout,sel).toBe('none'); // WebKit only
 }
 expect((await style('[data-ink-svg]')).touch).toBe('none');
 // The text memo neither selects nor stands in the pen's way while writing.
 expect((await style('.score-ink-text-note')).events).toBe('none');
 // selectstart anywhere on the page is refused, before and during a stroke.
 const refused=sel=>dialog.locator(sel).first().evaluate(e=>{const ev=new Event('selectstart',{bubbles:true,cancelable:true});(e.firstChild||e).dispatchEvent(ev);return ev.defaultPrevented;});
 expect(await refused('[data-ink-svg]')).toBe(true);expect(await refused('.score-ink-text-note')).toBe(true);expect(await refused('.score-ink-tools button')).toBe(true);
 // A selection already on the page (e.g. from a long press) is cleared when the pen goes down.
 await page.evaluate(()=>{const t=document.querySelector('.score-ink-text-note'),r=document.createRange();r.selectNodeContents(t);getSelection().removeAllRanges();getSelection().addRange(r);});
 expect(await page.evaluate(()=>getSelection().rangeCount)).toBe(1);
 const during=await dialog.locator('[data-ink-svg]').evaluate(svg=>{
  const r=svg.getBoundingClientRect(),o={bubbles:true,cancelable:true,pointerId:41,pointerType:'pen',isPrimary:true,pressure:.4,clientX:r.x+r.width*.2,clientY:r.y+r.height*.5};
  svg.dispatchEvent(new PointerEvent('pointerdown',{...o,button:0,buttons:1}));
  const cleared=getSelection().rangeCount===0,ev=new Event('selectstart',{bubbles:true,cancelable:true});svg.dispatchEvent(ev);
  // Apple Pencil's touchstart is cancelled too (no loupe, callout or double-tap zoom on iOS).
  let stylus=null;
  try{const t=new Touch({identifier:41,target:svg,clientX:o.clientX,clientY:o.clientY,touchType:'stylus'});if(t.touchType==='stylus'){const te=new TouchEvent('touchstart',{bubbles:true,cancelable:true,touches:[t],changedTouches:[t],targetTouches:[t]});svg.dispatchEvent(te);stylus=te.defaultPrevented;}}catch{}
  svg.dispatchEvent(new PointerEvent('pointermove',{...o,clientX:o.clientX+60,button:-1,buttons:1}));
  svg.dispatchEvent(new PointerEvent('pointerup',{...o,clientX:o.clientX+60,button:0,buttons:0}));
  return {cleared,prevented:ev.defaultPrevented,stylus};
 });
 expect(during.cleared).toBe(true);expect(during.prevented).toBe(true);if(during.stylus!==null)expect(during.stylus).toBe(true);
 await expect.poll(async()=>(await records(page)).length).toBe(1);
 // Text fields keep selecting: the page number field and a 글자 memo's text.
 await dialog.locator('[data-ink-page]').click();
 const jump=dialog.locator('[data-ink-jump-input]');expect(await jump.evaluate(e=>getComputedStyle(e).userSelect??getComputedStyle(e).webkitUserSelect)).not.toBe('none');
 expect(await refused('[data-ink-jump-input]')).toBe(false);
 await dialog.locator('[data-ink-thumb-close]').click();
 await tool(dialog,'메모');const [x,y]=await at(dialog,[.7,.7]);await page.mouse.click(x,y);
 await dialog.locator('[data-ink-memo-bar]').getByRole('button',{name:'글자로 쓰기',exact:true}).click();
 const field=dialog.locator('textarea[data-ink-memo-input]');await expect(field).toBeFocused();
 expect(await field.evaluate(e=>[getComputedStyle(e).userSelect,getComputedStyle(e).webkitUserSelect])).not.toContain('none');
 expect(await refused('textarea[data-ink-memo-input]')).toBe(false);
 await field.pressSequentially('가사');await field.evaluate(e=>e.select());
 expect(await field.evaluate(e=>e.selectionEnd-e.selectionStart)).toBe(2);
});

test('a pen stroke takes every coalesced point, is smooth, follows the pressure, is thinned when it ends and reloads the same',async({page})=>{
 await setup(page);let dialog=await open(page);await tool(dialog,'펜');
 const raw=await pen(dialog,{pts:wave('.2+.6*t')});
 await expect.poll(async()=>(await records(page)).length).toBe(1);
 const [s]=await records(page),aspect=4/3;
 expect(s).toMatchObject({tool:'pen',smooth:true,pressure:true});
 expect(await page.evaluate(s=>window.VzipScoreInk.valid(s),s)).toBe(true);
 // Before: one point per pointermove (40) or, with the old 0.0008 step, every sample kept; now every sample is read
 // and the ones that change nothing visible are dropped when the pen lifts.
 const kept=[raw[0]];for(const p of raw.slice(1))if(Math.hypot(p[0]-kept.at(-1)[0],p[1]-kept.at(-1)[1])>0.0008)kept.push(p);
 console.log('[ink-feel] synthetic stroke: '+raw.length+' samples · old code '+kept.length+' points · now '+s.points.length+' points');
 expect(s.points.length).toBeLessThan(kept.length*.6);expect(s.points.length).toBeGreaterThan(8);
 // Thinned within 0.0005 of the page width (0.4 px on a 800 px page): every sample is that close to the kept line.
 const dist=(p,a,b)=>{const dx=b[0]-a[0],dy=(b[1]-a[1])*aspect,t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*aspect*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,(p[1]-a[1])*aspect-t*dy);};
 const far=Math.max(...raw.slice(1,-1).map(p=>Math.min(...s.points.slice(1).map((q,i)=>dist(p,s.points[i],q)))));expect(far).toBeLessThan(.0012);
 const node=dialog.locator('path[data-stroke]');await expect(node).toHaveCount(1);
 // A pressure stroke is one filled shape; it is wider where the pen pressed harder.
 expect(await node.getAttribute('fill')).toBe(s.color);expect(await node.getAttribute('stroke')).toBe('none');
 await tool(dialog,'펜');
 await pen(dialog,{pts:`t=>[.15+.6*t,.6,.08]`,id:32});await pen(dialog,{pts:`t=>[.15+.6*t,.8,.95]`,id:33});
 await expect.poll(async()=>(await records(page)).length).toBe(3);
 const heights=await dialog.locator('path[data-stroke]').evaluateAll(n=>n.map(e=>e.getBBox().height));
 expect(heights[2]).toBeGreaterThan(heights[1]*1.6);
 const d=await node.first().getAttribute('d');
 // A mouse (or finger) stroke keeps one width and is a curve through the points.
 await line(page,dialog,[.2,.45],[.6,.5]);await expect.poll(async()=>(await records(page)).length).toBe(4);
 const mouse=(await records(page))[3];expect(mouse.smooth).toBe(true);expect(mouse.pressure).toBeUndefined();
 const m=dialog.locator('path[data-stroke="'+mouse.id+'"]');expect(await m.getAttribute('fill')).toBe('none');expect(Number(await m.getAttribute('stroke-width'))).toBeCloseTo(mouse.width*1000,5);
 // An old stroke (no smooth / pressure) is drawn exactly as before: straight lines, one width.
 const old={...mouse,id:'old-1',points:[[.1,.9,.5],[.3,.92,.5],[.5,.9,.5]],createdAt:mouse.createdAt+5};delete old.smooth;
 await page.evaluate(old=>window.VZ.change(d=>{d.scoreAnnotations.push(old);}),old);
 await expect(dialog.locator('path[data-stroke="old-1"]')).toHaveAttribute('d',await page.evaluate(([o,a])=>window.VzipScoreInk.path(o,a),[old,aspect]));
 expect(await dialog.locator('path[data-stroke="old-1"]').getAttribute('d')).toMatch(/^M[\d. ]+ L[\d. ]+ L[\d. ]+$/);
 // Saved strokes come back the same after a reload.
 const before=await records(page);await page.reload();dialog=await open(page);
 expect(await records(page)).toEqual(before);
 await expect(dialog.locator('path[data-stroke]').first()).toHaveAttribute('d',d);
 // The PDF copy draws the new strokes too.
 await act(dialog,'색상·굵기·투명도 설정');const panel=dialog.getByRole('region',{name:'필기 설정',exact:true});
 await panel.getByRole('tab',{name:'기타',exact:true}).click();await panel.getByRole('button',{name:'필기 PDF 만들기',exact:true}).click();
 await expect(panel.getByRole('link',{name:'만든 PDF 저장',exact:true})).toBeVisible({timeout:20000});
});

test('a very long pen stroke is thinned to fit rather than cut short; while writing only its own pieces are redrawn',async({page})=>{
 await setup(page);const dialog=await open(page);await tool(dialog,'펜');
 // Live: the stroke in hand is drawn in pieces (the earlier ones stay as they are); predicted points are drawn ahead
 // of the pen but never saved.
 const live=await dialog.locator('[data-ink-svg]').evaluate(async svg=>{
  const r=svg.getBoundingClientRect(),o={bubbles:true,cancelable:true,pointerId:51,pointerType:'pen',isPrimary:true,buttons:1};
  const at=t=>({clientX:r.x+r.width*(.1+.5*t),clientY:r.y+r.height*(.5+.1*Math.sin(t*20)),pressure:.3+.3*t});
  const frame=()=>new Promise(requestAnimationFrame);
  svg.dispatchEvent(new PointerEvent('pointerdown',{...o,button:0,...at(0)}));
  let first=null;
  for(let i=1;i<=150;i++){
   const ev=new PointerEvent('pointermove',{...o,button:-1,...at(i/300)});
   if(i===150)Object.defineProperty(ev,'getPredictedEvents',{value:()=>[new PointerEvent('pointermove',{...o,...at(.9)})]});
   svg.dispatchEvent(ev);if(i%10===0){await frame();if(!first)first=svg.querySelector('[data-ink-live] path');}
  }
  await frame();
  const pieces=svg.querySelectorAll('[data-ink-live] path').length,same=svg.querySelector('[data-ink-live] path')===first;
  const tail=[...svg.querySelectorAll('[data-ink-live] path')].at(-1).getAttribute('d').match(/[\d.]+ [\d.]+/g).map(p=>Number(p.split(' ')[0]));
  svg.dispatchEvent(new PointerEvent('pointerup',{...o,button:0,buttons:0,...at(.5)}));
  return {pieces,same,reach:Math.max(...tail)/1000};
 });
 expect(live.pieces).toBeGreaterThan(2);expect(live.same).toBe(true);expect(live.reach).toBeGreaterThan(.55); // drawn ahead to the predicted point
 await expect.poll(async()=>(await records(page)).length).toBe(1);
 expect(Math.max(...(await records(page))[0].points.map(p=>p[0]))).toBeLessThan(.61);
 await expect(dialog.locator('[data-ink-live]')).toHaveCount(0);
 await pen(dialog,{moves:200,per:15,pts:`t=>[.1+.8*t,.2+.6*t+.05*Math.sin(t*60),.3+.2*Math.sin(t*9)]`});
 await expect.poll(async()=>(await records(page)).filter(s=>s.points.length>100).length).toBe(1);
 const s=(await records(page)).find(s=>s.points.length>100);expect(s.points.length).toBeLessThanOrEqual(2048);
 expect(s.points.at(-1)[0]).toBeCloseTo(.9,3);expect(s.points.at(-1)[1]).toBeGreaterThan(.75);
});

test('the eraser shows how far it reaches at any zoom and erases what it passes over when it lifts',async({page})=>{
 await setup(page);const dialog=await open(page);await tool(dialog,'펜');
 await line(page,dialog,[.15,.3],[.75,.3]);await line(page,dialog,[.15,.6],[.75,.6]);
 await expect.poll(async()=>(await records(page)).length).toBe(2);
 const [top,bottom]=await records(page);
 await tool(dialog,'지우개');await dialog.getByRole('button',{name:'지우개 크기 26',exact:true}).click();
 const cursor=dialog.locator('[data-ink-eraser-cursor]');
 const check=async p=>{
  const [x,y]=await at(dialog,p);await page.mouse.move(x,y);await expect(cursor).toHaveCount(1);
  const svg=await dialog.locator('[data-ink-svg]').boundingBox(),c=await cursor.boundingBox();
  expect((c.width-1.5)/2).toBeCloseTo(.026*svg.width,0); // the outline is 1.5 px wideexpect(c.x+c.width/2).toBeCloseTo(x,0);expect(c.y+c.height/2).toBeCloseTo(y,0);
  return c.width;
 };
 const small=await check([.5,.45]);await check([.3,.2]); // it follows the pointer
 await dialog.getByLabel('악보 확대',{exact:true}).selectOption('2');
 await expect.poll(()=>dialog.locator('[data-ink-svg]').evaluate(e=>e.getBoundingClientRect().width)).toBeGreaterThan(500);
 const big=await check([.3,.2]);expect(big).toBeGreaterThan(small*1.8);
 await dialog.getByLabel('악보 확대',{exact:true}).selectOption('1');
 await expect.poll(()=>dialog.locator('[data-ink-svg]').evaluate(e=>e.getBoundingClientRect().width)).toBeLessThan(500);
 // Pressed and dragged across the top line: it fades (the bottom one does not) and goes when the mouse lifts.
 const a=await at(dialog,[.1,.31]),b=await at(dialog,[.5,.31]);
 await page.mouse.move(...a);await page.mouse.down();await page.mouse.move(...b,{steps:8});
 await expect(dialog.locator('[data-stroke="'+top.id+'"]')).toHaveAttribute('data-ink-erasing','');
 await expect(dialog.locator('[data-stroke="'+bottom.id+'"]')).not.toHaveAttribute('data-ink-erasing','');
 expect(await dialog.locator('[data-stroke="'+top.id+'"]').evaluate(e=>Number(getComputedStyle(e).opacity))).toBeLessThan(.5);
 expect((await records(page)).length).toBe(2);
 await page.mouse.up();
 await expect.poll(async()=>(await records(page)).map(s=>s.id)).toEqual([bottom.id]);
 await expect(dialog.locator('path[data-stroke]')).toHaveCount(1);
 // One undo brings it back; leaving the page hides the circle.
 await act(dialog,'필기 되돌리기');await expect(dialog.locator('path[data-stroke]')).toHaveCount(2);
 await tool(dialog,'지우개');const [x,y]=await at(dialog,[.5,.5]);await page.mouse.move(x,y);await expect(cursor).toHaveCount(1);
 await page.mouse.move(2,2);await expect(cursor).toHaveCount(0);
});

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

test('붙여넣기 keeps the picture on this device at once (offline too), uploads it to R2 later, and another device loads it from R2',async({page,browser,context},info)=>{
 test.setTimeout(90000);
 const r2=await setup(page);let dialog=await open(page);await tool(dialog,'펜');
 await fakePng(page,400,200);await stubClipboard(page,'png');
 // The middle of what is on screen of the page, before the picture's row opens above it.
 const view=await dialog.locator('[data-ink-stage]').boundingBox(),box=await dialog.locator('[data-ink-box]').boundingBox();
 const mid=[((Math.max(box.x,view.x)+Math.min(box.x+box.width,view.x+view.width))/2-box.x)/box.width,((Math.max(box.y,view.y)+Math.min(box.y+box.height,view.y+view.height))/2-box.y)/box.height];
 await context.setOffline(true);
 await act(dialog,'붙여넣기');
 await expect.poll(async()=>(await pictures(page)).length).toBe(1);
 const [pic]=await pictures(page);
 expect(pic).toMatchObject({tool:'note',mode:'pen',color:'#ffffff',page:1,songId:'s1',scoreId:'score-ink',imageW:400,imageH:200});
 expect(pic.imageKey).toMatch(/^u\/ui-test-user\/scorepic-[\w-]+\/original\.png$/);expect(pic.imageBytes).toBeGreaterThan(100);
 // The synced record carries no picture bytes.
 expect(await page.evaluate(()=>JSON.stringify(window.VZ.db))).not.toContain('data:image');
 expect(JSON.stringify(pic).length).toBeLessThan(800);
 // Shown at once from this device's copy, while offline; listed for upload, not in R2 yet.
 const shown=dialog.locator('[data-ink-note][data-ink-picture]');await expect(shown.locator('image')).toHaveAttribute('href',/^blob:/);
 await expect(shown.locator('rect')).toHaveCount(0);
 expect(await queued(page)).toEqual([pic.imageKey]);expect(r2.store.has(pic.imageKey)).toBe(false);
 const aspect=4/3;expect(pic.rect[2]/(pic.rect[3]*aspect)).toBeCloseTo(2,1);
 expect(pic.rect[0]+pic.rect[2]/2).toBeCloseTo(mid[0],2);expect(pic.rect[1]+pic.rect[3]/2).toBeCloseTo(mid[1],2);
 // Back online: uploaded as a PNG (see-through kept) under the owner's folder; the list empties.
 await context.setOffline(false);
 await expect.poll(()=>r2.store.has(pic.imageKey)).toBe(true);await expect.poll(()=>queued(page)).toEqual([]);
 const stored=r2.store.get(pic.imageKey);expect(stored.type).toBe('image/png');expect(stored.bytes.subarray(1,4).toString()).toBe('PNG');
 expect(await page.evaluate(b64=>new Promise(r=>{const i=new Image();i.onload=()=>{const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);r(x.getImageData(1,1,1,1).data[3]);};i.src='data:image/png;base64,'+b64;}),stored.bytes.toString('base64'))).toBe(0);
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

test('⌘V pastes a picture; a clipboard with only text says so; text fields paste text as usual',async({page})=>{
 await setup(page);const dialog=await open(page);
 await fakePng(page,120,300);
 await page.evaluate(()=>{const dt=new DataTransfer();dt.items.add(new File([window.__fakePng],'goodnotes.png',{type:'image/png'}));document.querySelector('[data-ink-svg]').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt}));});
 await expect.poll(async()=>(await pictures(page)).length).toBe(1);
 const [pic]=await pictures(page);expect(pic.rect[3]*4/3/pic.rect[2]).toBeCloseTo(2.5,1);expect(pic).toMatchObject({imageW:120,imageH:300});
 // Only text on the clipboard: nothing is added and the owner is told what to do.
 await stubClipboard(page,'text');await act(dialog,'붙여넣기');
 await expect(page.locator('.toast').last()).toContainText('클립보드에 글자만 있어요');
 await page.evaluate(()=>{const dt=new DataTransfer();dt.setData('text/plain','가사');document.querySelector('[data-ink-svg]').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt}));});
 await expect(dialog.locator('[data-ink-status]')).toContainText('클립보드에 글자만 있어요');
 // The memo bar offers it too (메모 tool), and a paste into the page number field is left alone.
 await tool(dialog,'메모');await expect(dialog.locator('[data-ink-memo-bar]').getByRole('button',{name:'그림 붙여넣기',exact:true})).toBeVisible();
 await dialog.locator('[data-ink-page]').click();
 const kept=await dialog.locator('[data-ink-jump-input]').evaluate(e=>{const dt=new DataTransfer();dt.items.add(new File([window.__fakePng],'x.png',{type:'image/png'}));const ev=new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt});e.dispatchEvent(ev);return ev.defaultPrevented;});
 expect(kept).toBe(false);expect((await pictures(page)).length).toBe(1);
 // The PDF copy carries the picture.
 await dialog.locator('[data-ink-thumb-close]').click();
 await act(dialog,'색상·굵기·투명도 설정');const panel=dialog.getByRole('region',{name:'필기 설정',exact:true});
 await panel.getByRole('tab',{name:'기타',exact:true}).click();await panel.getByRole('button',{name:'필기 PDF 만들기',exact:true}).click();
 await expect(panel.getByRole('link',{name:'만든 PDF 저장',exact:true})).toBeVisible({timeout:20000});
});

for(const [name,size]of [['phone 390',{width:390,height:844}],['iPad 820',{width:820,height:1180}]])test('44px targets and no sideways scroll on '+name,async({page})=>{
 await page.setViewportSize(size);await setup(page);const dialog=await open(page);
 const wide=()=>page.evaluate(()=>[document.documentElement.scrollWidth<=innerWidth,[...document.querySelectorAll('.score-ink-sheet')].every(e=>e.scrollWidth<=e.clientWidth+1)]);
 expect(await wide()).toEqual([true,true]);
 for(const name of ['펜','지우개','메모']){
  await tool(dialog,name);expect(await wide(),name).toEqual([true,true]);
  const b=await dialog.getByRole('button',{name,exact:true}).boundingBox();expect(b.height).toBeGreaterThanOrEqual(44);
 }
 await tool(dialog,'지우개');
 const [x,y]=await at(dialog,[.5,.5]);await page.mouse.move(x,y);await expect(dialog.locator('[data-ink-eraser-cursor]')).toHaveCount(1);
 expect(await wide()).toEqual([true,true]); await dialog.locator('[data-ink-more]').click();
 const paste=dialog.locator('.score-ink-actions [data-ink-paste]');await expect(paste).toBeVisible();
 let b=await paste.boundingBox();expect(b.height).toBeGreaterThanOrEqual(44);expect(b.width).toBeGreaterThanOrEqual(44);
 await dialog.locator('[data-ink-more]').click();
 await tool(dialog,'메모');b=await dialog.locator('[data-ink-memo-paste]').boundingBox();expect(b.height).toBeGreaterThanOrEqual(44);
 await fakePng(page);await stubClipboard(page,'png');await dialog.locator('[data-ink-memo-paste]').click();
 await expect(dialog.getByRole('button',{name:'그림 삭제',exact:true})).toBeVisible();
 for(const label of ['그림 삭제','그림 선택 해제']){b=await dialog.getByRole('button',{name:label,exact:true}).boundingBox();expect(b.height).toBeGreaterThanOrEqual(44);expect(b.width).toBeGreaterThanOrEqual(44);}
 expect(await wide()).toEqual([true,true]);
});

test('녹음 in the viewer fullscreen leaves the browser fullscreen first (mic question shows) and keeps the full layout',async({page})=>{
 await setup(page);const dialog=await open(page);
 await page.evaluate(()=>{
  window.__log=[];let fs=null;const sheet=document.querySelector('.score-ink-sheet');
  Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>fs});Object.defineProperty(document,'fullscreenEnabled',{configurable:true,get:()=>true});
  sheet.requestFullscreen=async()=>{fs=sheet;document.dispatchEvent(new Event('fullscreenchange'));};
  document.exitFullscreen=async()=>{window.__log.push('exit-fullscreen');fs=null;document.dispatchEvent(new Event('fullscreenchange'));};
  window.__state='prompt';Object.defineProperty(navigator,'permissions',{configurable:true,value:{query:async()=>({state:window.__state})}});
  window.VZ.media.canRecord=()=>true;
  window.VZ.media.capture=async()=>{window.__log.push('capture:'+(document.fullscreenElement?'fullscreen':'outside'));return {start(){},pause(){},resume(){},seconds:()=>1,state:'recording',stop:async()=>({blob:new Blob(['x']),type:'audio/mp4',durationSeconds:1}),cancel(){window.__log.push('cancel');}};};
 });
 await act(dialog,'전체화면');await expect(dialog).toHaveClass(/score-ink-fullscreen/);
 expect(await page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
 await dialog.getByRole('button',{name:'녹음',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.__log)).toEqual(['exit-fullscreen','capture:outside']);
 await expect(dialog).toHaveClass(/score-ink-fullscreen/); // still the screen-filling viewer
 // (Already allowed: the fullscreen stays — tests/score-audio.spec.cjs.)
});
