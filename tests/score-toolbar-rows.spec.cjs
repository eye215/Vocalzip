/* 전체화면 악보 도구 (2026-11-19): in fullscreen the score viewer's toolbar is two rows, laid out like GoodNotes —
 * row 1: 페이지 목록, AI, 무대용 보기, 선택 | 필기 모드, 지우개, ▾ … 내보내기·공유, 더보기;
 * row 2 (while 필기 모드 is on and not folded): 되돌리기, 다시 실행, 펜 ▾, 형광펜, 악보 표시, 메모, 이동 … 굵기, 색.
 * The same buttons move there and go back when fullscreen ends; nothing from 더보기 disappears. */
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

test.afterEach(async({page})=>expect(page.__errors||[]).toEqual([]));
test.beforeEach(({},info)=>test.skip(!info.project.name.startsWith('chromium'),'layout checked in Chromium'));

const names=locator=>locator.evaluateAll(all=>all.filter(b=>b.getClientRects().length).map(b=>b.getAttribute('aria-label')||b.textContent.trim()));
const row1=dialog=>dialog.locator('[data-ink-row-main]'),row2=dialog=>dialog.locator('.score-ink-tools');
const FORMER_MORE=['필기 되돌리기','필기 다시 실행','현재 페이지 필기 삭제','색상·굵기·투명도 설정','무대용 보기','전체화면 종료'];
const TOOLS=['이동','펜','형광펜','지우개','선택','메모','악보 표시'];
async function enter(dialog){
 await dialog.locator('[data-ink-more]').click();await dialog.getByRole('button',{name:'전체화면',exact:true}).click();
 await expect(dialog).toHaveClass(/score-ink-fullscreen/);
}
/** A button is reachable when it is on screen, or once 더보기 is open. */
async function reachable(dialog,name){
 const button=dialog.getByRole('button',{name,exact:true});
 if(await button.isVisible())return true;
 const more=dialog.locator('[data-ink-more]');await more.click();
 const seen=await button.isVisible();await more.click();return seen;
}
async function fits(page,dialog){
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1&&document.body.scrollWidth<=innerWidth+1)).toBe(true);
 expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
 const r=await dialog.locator('.score-ink-bar').boundingBox(),w=page.viewportSize().width;
 expect(r.x).toBeGreaterThanOrEqual(-.5);expect(r.x+r.width).toBeLessThanOrEqual(w+.5);
}
async function targets(locator){
 for(const b of await locator.all()){if(!await b.isVisible())continue;const r=await b.boundingBox(),n=await b.getAttribute('aria-label')||await b.textContent();
  expect(r.width,n).toBeGreaterThanOrEqual(43.5);expect(r.height,n).toBeGreaterThanOrEqual(43.5);}
}

for(const [width,height] of [[820,1180],[1180,820],[390,844]])test('fullscreen at '+width+'×'+height+': two rows in order, 44px targets, no sideways overflow',async({page})=>{
 await page.setViewportSize({width,height});await setup(page);
 // 악보 표기 AI 분석 shows only when the account may use it: here it may.
 await page.evaluate(()=>{window.VzipR2.scoreVisionAvailable=async()=>({available:true});});
 const dialog=await open(page);
 // Outside fullscreen the viewer is as before: no row 1, one tool row.
 await expect(row1(dialog)).toBeHidden();
 const before=await dialog.locator('.score-ink-bar button,.score-ink-full-actions button').evaluateAll(all=>all.map(b=>[...b.attributes].filter(a=>a.name.startsWith('data-ink')).map(a=>a.name+'='+a.value).join(' ')));
 await enter(dialog);
 await dialog.getByRole('button',{name:'펜',exact:true}).click();
 await expect(row1(dialog)).toBeVisible();await expect(row2(dialog)).toBeVisible();
 expect(await names(row1(dialog).locator('button'))).toEqual(['페이지 목록','악보 표기 AI 분석','무대용 보기','선택','필기 모드','지우개','도구 줄 접기','내보내기·공유','더보기']);
 expect(await names(row2(dialog).locator('button'))).toEqual(['필기 되돌리기','필기 다시 실행','펜','색상·굵기·투명도 설정','형광펜','악보 표시','메모','이동','굵기 고르기','색상 고르기']);
 await expect(dialog.getByRole('button',{name:'필기 모드',exact:true})).toHaveAttribute('aria-pressed','true');
 // Row 1 above row 2, each one line; the status bar's safe area is kept by the sheet's padding.
 const r1=await row1(dialog).boundingBox(),r2=await row2(dialog).boundingBox();
 expect(r2.y).toBeGreaterThanOrEqual(r1.y+r1.height-1);expect(r1.height).toBeLessThan(52);expect(r2.height).toBeLessThan(52);
 for(const row of [row1(dialog),row2(dialog)])expect(new Set(await row.locator('button').evaluateAll(all=>all.filter(b=>b.getClientRects().length&&!b.closest('.score-ink-actions')).map(b=>Math.round(b.getBoundingClientRect().top)))).size).toBe(1);
 expect(await dialog.locator('.score-ink-sheet .sheet-body,.sheet-body').first().evaluate(e=>getComputedStyle(e).paddingTop)).not.toBe('');
 await targets(row1(dialog).locator('button'));await targets(row2(dialog).locator('button'));
 await fits(page,dialog);
 // On iPad widths both rows fit as they are; on a phone the tool row may scroll inside itself.
 if(width>=768)for(const row of [row1(dialog).locator('[data-ink-row-left]'),row2(dialog)])expect(await row.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
 // The stage gets the rest of the screen, below the rows.
 const stage=await dialog.locator('[data-ink-stage]').boundingBox();expect(stage.y).toBeGreaterThanOrEqual(r2.y+r2.height-1);
 if(width===820){
  await dialog.getByRole('button',{name:'펜',exact:true}).click(); // fold the colour/width row for a clean shot
  await page.screenshot({path:test.info().project.name==='chromium-mobile'?'test-results/score-toolbar-rows/fullscreen-820x1180.png':'test-results/score-toolbar-rows/fullscreen-820x1180-'+test.info().project.name+'.png'});
  await dialog.locator('[data-ink-more]').click();await expect(dialog.getByRole('button',{name:'전체화면 종료',exact:true})).toBeVisible();await fits(page,dialog);
  await page.screenshot({path:'test-results/score-toolbar-rows/fullscreen-820x1180-more-'+test.info().project.name+'.png'});
  await dialog.locator('[data-ink-more]').click();
 }
 // Leaving fullscreen puts every button back where it was.
 await dialog.locator('[data-ink-more]').click();await dialog.getByRole('button',{name:'전체화면 종료',exact:true}).click();
 await expect(dialog).not.toHaveClass(/score-ink-fullscreen/);await expect(row1(dialog)).toBeHidden();
 expect(await dialog.locator('.score-ink-bar button,.score-ink-full-actions button').evaluateAll(all=>all.map(b=>[...b.attributes].filter(a=>a.name.startsWith('data-ink')).map(a=>a.name+'='+a.value).join(' ')))).toEqual(before);
 await expect(dialog.locator('button[data-ink-settings] i')).toHaveClass(/ph-sliders-horizontal/);
});

test('row 2 hides when 필기 모드 is off and when folded; 되돌리기 · 설정 go back to 더보기 meanwhile',async({page})=>{
 await page.setViewportSize({width:820,height:1180});await setup(page);const dialog=await open(page);await enter(dialog);
 const writing=dialog.getByRole('button',{name:'필기 모드',exact:true});
 await expect(row2(dialog)).toBeVisible();
 // 필기 모드 off: reading — the tool is 이동 and the tool row hides.
 await writing.click();await expect(writing).toHaveAttribute('aria-pressed','false');await expect(row2(dialog)).toBeHidden();
 await expect(dialog.locator('[data-ink-tool="pan"]')).toHaveAttribute('aria-pressed','true');
 for(const name of ['필기 되돌리기','필기 다시 실행','색상·굵기·투명도 설정'])expect(await reachable(dialog,name),name).toBe(true);
 // 필기 모드 on again: the pen is in hand and the row is back.
 await writing.click();await expect(writing).toHaveAttribute('aria-pressed','true');await expect(row2(dialog)).toBeVisible();
 await expect(dialog.getByRole('button',{name:'펜',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(row2(dialog).getByRole('button',{name:'필기 되돌리기',exact:true})).toBeVisible();
 // ▾ folds the tool row (the pen stays in hand) and opens it again.
 await dialog.getByRole('button',{name:'도구 줄 접기',exact:true}).click();await expect(row2(dialog)).toBeHidden();
 await expect(dialog.locator('[data-ink-quick]')).toBeHidden();
 await expect(writing).toHaveAttribute('aria-pressed','true');
 for(const name of ['필기 되돌리기','필기 다시 실행','색상·굵기·투명도 설정'])expect(await reachable(dialog,name),name).toBe(true);
 await dialog.getByRole('button',{name:'도구 줄 펴기',exact:true}).click();await expect(row2(dialog)).toBeVisible();
 await expect(dialog.getByRole('button',{name:'도구 줄 접기',exact:true})).toHaveAttribute('aria-expanded','true');
 // The pen still writes with the row folded or open.
 const box=await dialog.locator('[data-ink-svg]').boundingBox();
 await page.evaluate(([x,y])=>{const svg=document.querySelector('[data-ink-svg]'),c={bubbles:true,pointerId:91,pointerType:'pen',isPrimary:true,button:0,pressure:.6};
  for(const [t,dx] of [['pointerdown',0],['pointermove',60],['pointerup',90]])svg.dispatchEvent(new PointerEvent(t,{...c,clientX:x+dx,clientY:y}));},[box.x+box.width*.3,box.y+box.height*.3]);
 await expect.poll(()=>page.evaluate(()=>window.VZ.db.scoreAnnotations?.length||0)).toBe(1);
 await row2(dialog).getByRole('button',{name:'필기 되돌리기',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.VZ.db.scoreAnnotations?.length||0)).toBe(0);
});

test('every former 더보기 action and every tool stays reachable in fullscreen',async({page})=>{
 await page.setViewportSize({width:820,height:1180});await setup(page);const dialog=await open(page);await enter(dialog);
 for(const state of ['open','reading','folded']){
  if(state==='reading')await dialog.getByRole('button',{name:'필기 모드',exact:true}).click();
  if(state==='folded'){await dialog.getByRole('button',{name:'필기 모드',exact:true}).click();await dialog.getByRole('button',{name:'도구 줄 접기',exact:true}).click();}
  for(const name of FORMER_MORE)expect(await reachable(dialog,name),state+': '+name).toBe(true);
  // A tool on a hidden row comes back with 필기 모드 / ▾ (one tap).
  if(state==='open')for(const name of TOOLS)expect(await reachable(dialog,name),name).toBe(true);
 }
 await dialog.getByRole('button',{name:'도구 줄 펴기',exact:true}).click();
 for(const name of TOOLS)expect(await reachable(dialog,name),name).toBe(true);
});

test('row 1 and row 2 extras: 페이지 목록, 내보내기·공유, the 굵기 line and the colour dot',async({page})=>{
 await page.setViewportSize({width:820,height:1180});await setup(page);const dialog=await open(page);await enter(dialog);
 await dialog.getByRole('button',{name:'펜',exact:true}).click();
 const quick=dialog.locator('[data-ink-quick]'),sizes=quick.locator('[data-ink-quick-size-row]'),colors=quick.locator('[data-ink-quick-color-row]');
 const widthButton=dialog.getByRole('button',{name:'굵기 고르기',exact:true}),colorButton=dialog.getByRole('button',{name:'색상 고르기',exact:true});
 // Folded after the pen tap again, the 굵기 line opens only the sizes, the dot only the colours.
 await dialog.getByRole('button',{name:'펜',exact:true}).click();await expect(quick).toBeHidden();
 await widthButton.click();await expect(sizes).toBeVisible();await expect(colors).toBeHidden();await expect(widthButton).toHaveAttribute('aria-expanded','true');
 await quick.getByRole('button',{name:'굵기 10',exact:true}).click();
 expect(await widthButton.locator('span').evaluate(e=>e.getBoundingClientRect().height)).toBeCloseTo(7,0);
 await colorButton.click();await expect(colors).toBeVisible();await expect(sizes).toBeHidden();
 const first=colors.locator('button').first(),picked=(await first.getAttribute('aria-label')).split(' ').pop();await first.click();
 expect(await colorButton.evaluate(e=>e.style.getPropertyValue('--sample-color'))).toBe(picked);
 await colorButton.click();await expect(quick).toBeHidden();
 // The eraser has a size only.
 await dialog.getByRole('button',{name:'지우개',exact:true}).click();await expect(widthButton).toBeVisible();await expect(colorButton).toBeHidden();
 // 펜 ▾ opens the existing settings; 내보내기·공유 opens them on 기타 (원본 PDF · 필기 PDF 만들기).
 await dialog.getByRole('button',{name:'펜',exact:true}).click();
 await dialog.getByRole('button',{name:'색상·굵기·투명도 설정',exact:true}).click();
 const panel=dialog.getByRole('region',{name:'필기 설정',exact:true});await expect(panel).toBeVisible();await expect(panel.getByRole('slider',{name:'펜 굵기',exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'필기 설정 닫기',exact:true}).click();
 await dialog.getByRole('button',{name:'내보내기·공유',exact:true}).click();
 await expect(panel).toBeVisible();await expect(panel.getByRole('button',{name:'필기 PDF 만들기',exact:true})).toBeVisible();
 await dialog.getByRole('button',{name:'필기 설정 닫기',exact:true}).click();
 // 페이지 목록 opens the page previews.
 await dialog.getByRole('button',{name:'페이지 목록',exact:true}).click();
 await expect(dialog.getByRole('region',{name:'악보 페이지 미리보기',exact:true})).toBeVisible();
 await fits(page,dialog);
});
