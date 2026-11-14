/* 스티커 메모 on the score handwriting layer (app/score-ink*.js). Apple Pencil handwriting input (Scribble) is the
 * system's own and cannot run in Chromium: these tests cover the text field it writes into and everything around it. */
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
const bytes=pdf(),key='u/ui-test-user/score-ink/original.pdf',ASPECT=4/3;
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
  if(!d.songs[0].scores?.some(s=>s.id==='score-ink'))d.songs[0].scores=[{id:'score-ink',songId:'s1',title:'연습 악보',r2Key:key,size,uploadedAt:Date.now()}];
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
const records=page=>page.evaluate(()=>window.VZ.db.scoreAnnotations||[]);
const memos=async page=>(await records(page)).filter(s=>s.tool==='note');
const strokes=async page=>(await records(page)).filter(s=>s.tool!=='note');
const tool=(dialog,name)=>dialog.getByRole('button',{name,exact:true}).click();
const bar=dialog=>dialog.locator('[data-ink-memo-bar]');
/** Mouse press/drag/release at page-normalised points (the page box is re-read each time: rows above it open and close). */
async function at(dialog,p){const r=await dialog.locator('[data-ink-svg]').boundingBox();return [r.x+r.width*p[0],r.y+r.height*p[1]];}
async function click(page,dialog,p){const [x,y]=await at(dialog,p);await page.mouse.click(x,y);}
async function drag(page,dialog,from,to){
 const a=await at(dialog,from);await page.mouse.move(...a);await page.mouse.down();
 const b=await at(dialog,to);await page.mouse.move((a[0]+b[0])/2,(a[1]+b[1])/2,{steps:4});await page.mouse.move(...b,{steps:4});await page.mouse.up();
}
/** 메모 tool → tap the page → choose the way of writing. Leaves a 글자 memo with its text field open, a 펜 memo with the pen active. */
async function place(page,dialog,p,mode,color){
 await tool(dialog,'메모');await expect(bar(dialog)).toContainText('메모를 붙일 곳을 눌러 주세요.');
 await click(page,dialog,p);
 await expect(dialog.locator('[data-ink-note][data-draft]')).toHaveCount(1);
 if(color)await bar(dialog).getByRole('button',{name:color+' 메모',exact:true}).click();
 await bar(dialog).getByRole('button',{name:mode==='text'?'글자로 쓰기':'펜으로 쓰기',exact:true}).click();
 await expect(dialog.locator('[data-ink-note][data-draft]')).toHaveCount(0);
}
async function act(dialog,name){
 const button=dialog.getByRole('button',{name,exact:true});
 if(!await button.isVisible())await dialog.locator('[data-ink-more]').click();
 await button.click();
}
test.afterEach(async({page})=>expect(page.__errors||[]).toEqual([]));

test('a 글자 memo is typed in a real text field over the memo and is still there, with its text, after a reload',async({page})=>{
 await setup(page);let dialog=await open(page);
 await tool(dialog,'메모');await click(page,dialog,[.7,.3]);
 // Nothing is saved until the way of writing is chosen; yellow and 글자 are offered first.
 expect(await records(page)).toEqual([]);
 await expect(bar(dialog).getByRole('button',{name:'글자로 쓰기',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(bar(dialog).getByRole('button',{name:'노랑 메모',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(bar(dialog).locator('[data-ink-memo-color]')).toHaveCount(4);
 await bar(dialog).getByRole('button',{name:'글자로 쓰기',exact:true}).click();
 const field=dialog.locator('textarea[data-ink-memo-input]');
 await expect(field).toBeFocused();await expect(field).toHaveAttribute('autocapitalize','off');
 // 16px or more while editing (no iOS zoom), and the field covers the memo it belongs to.
 expect(await field.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
 const [memoBox,fieldBox]=[await dialog.locator('[data-ink-note] .score-ink-note-bg').boundingBox(),await field.boundingBox()];
 expect(fieldBox.width).toBeGreaterThanOrEqual(memoBox.width-1);expect(fieldBox.height).toBeGreaterThanOrEqual(memoBox.height-1);
 const pageBox=await dialog.locator('[data-ink-box]').boundingBox();
 expect(fieldBox.x).toBeGreaterThanOrEqual(pageBox.x-1);expect(fieldBox.x+fieldBox.width).toBeLessThanOrEqual(pageBox.x+pageBox.width+1);
 await field.pressSequentially('2절 숨 크게');await field.press('Enter');await field.pressSequentially('박자 주의');
 await bar(dialog).getByRole('button',{name:'완료',exact:true}).click();
 await expect(field).toHaveCount(0);
 const [memo]=await memos(page);
 expect(memo).toMatchObject({version:1,tool:'note',mode:'text',color:'#fbe88c',page:1,text:'2절 숨 크게\n박자 주의',songId:'s1',scoreId:'score-ink'});
 expect(memo.rect).toHaveLength(4);expect(memo.rect[2]).toBeCloseTo(.235,5);expect(memo.rect[3]*ASPECT).toBeCloseTo(.235,3); // a square, 23.5% of the page width
 expect(memo.rect[0]+memo.rect[2]/2).toBeCloseTo(.7,2);expect(memo.rect[1]+memo.rect[3]/2).toBeCloseTo(.3,2);
 expect(await page.evaluate(m=>window.VzipScoreInk.valid(m),memo)).toBe(true);
 await expect(dialog.locator('[data-ink-note] text')).toContainText('2절 숨 크게');
 // The text is drawn inside the memo and scales with the page.
 const size=()=>dialog.locator('[data-ink-note] tspan').first().evaluate(e=>e.getBoundingClientRect().height);
 const small=await size();await dialog.getByLabel('악보 확대',{exact:true}).selectOption('2');
 await expect.poll(size).toBeGreaterThan(small*1.8);
 await dialog.getByLabel('악보 확대',{exact:true}).selectOption('1');await expect.poll(size).toBeLessThan(small*1.2);
 await page.reload();dialog=await open(page);
 await expect(dialog.locator('[data-ink-note]')).toHaveCount(1);
 await expect(dialog.locator('[data-ink-note] text')).toContainText('박자 주의');
 // Tapping it with the 메모 (or 선택) tool opens the same text again; leaving the field saves.
 await tool(dialog,'선택');await click(page,dialog,[.7,.3]);
 await expect(dialog.locator('textarea[data-ink-memo-input]')).toHaveValue('2절 숨 크게\n박자 주의');
 await dialog.locator('textarea[data-ink-memo-input]').pressSequentially('!');
 await dialog.locator('textarea[data-ink-memo-input]').blur();
 await expect.poll(async()=>(await memos(page)).map(m=>m.text)).toEqual(['2절 숨 크게\n박자 주의!']);
 // An edit is a new record with the same link key; the old one is tombstoned for the other devices.
 const after=(await memos(page))[0];expect(after.id).not.toBe(memo.id);expect(after.note).toBe(memo.note);
 expect(await page.evaluate(id=>window.VZ.db.deleted.scoreAnnotations.includes(id),memo.id)).toBe(true);
});

test('a 펜 memo goes straight to the pen; strokes written on it move with it and are deleted with it after a confirm',async({page})=>{
 await setup(page);const dialog=await open(page);
 await place(page,dialog,[.3,.6],'pen','분홍');
 await expect(dialog.getByRole('button',{name:'펜',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(bar(dialog)).toBeHidden();
 const [memo]=await memos(page);expect(memo).toMatchObject({mode:'pen',color:'#fbcfe0'});expect(memo.text).toBeUndefined();
 // One stroke on the memo, one beside it.
 await drag(page,dialog,[.25,.58],[.36,.63]);await expect.poll(async()=>(await strokes(page)).length).toBe(1);
 await drag(page,dialog,[.6,.15],[.8,.2]);await expect.poll(async()=>(await strokes(page)).length).toBe(2);
 let rows=await strokes(page);const on=rows.find(s=>s.note),off=rows.find(s=>!s.note);
 expect(on.note).toBe(memo.note);expect(off.points[0][1]).toBeLessThan(.3);
 // The memo is drawn under the handwriting.
 expect(await dialog.locator('[data-ink-svg]').evaluate(svg=>{const all=[...svg.children],note=all.findIndex(n=>n.matches('[data-ink-note]')),stroke=all.findIndex(n=>n.matches('path[data-stroke]'));return note>=0&&note<stroke;})).toBe(true);
 // 선택 tool: dragging the memo moves it and the stroke written on it by the same amount, as one change.
 await tool(dialog,'선택');await drag(page,dialog,[.3,.6],[.5,.4]);
 await expect.poll(async()=>(await memos(page))[0].rect[0]).toBeCloseTo(memo.rect[0]+.2,2);
 const moved=(await memos(page))[0];rows=await strokes(page);const carried=rows.find(s=>s.note);
 expect(moved.rect[1]).toBeCloseTo(memo.rect[1]-.2,2);expect(moved.rect.slice(2)).toEqual(memo.rect.slice(2));expect(moved.note).toBe(memo.note);
 expect(carried.note).toBe(memo.note);expect(carried.points.length).toBe(on.points.length);
 expect(carried.points[0][0]-on.points[0][0]).toBeCloseTo(moved.rect[0]-memo.rect[0],4);
 expect(carried.points[0][1]-on.points[0][1]).toBeCloseTo(moved.rect[1]-memo.rect[1],4);
 expect(rows.find(s=>!s.note).points).toEqual(off.points); // the stroke beside it stayed
 // Undo puts both back together; redo moves both again.
 await act(dialog,'필기 되돌리기');
 await expect.poll(async()=>(await memos(page))[0].rect).toEqual(memo.rect);
 expect((await strokes(page)).find(s=>s.note).points).toEqual(on.points);
 await act(dialog,'필기 다시 실행');
 await expect.poll(async()=>(await memos(page))[0].rect).toEqual(moved.rect);
 expect((await strokes(page)).find(s=>s.note).points).toEqual(carried.points);
 // Delete says that the handwriting on it goes too, and does nothing until confirmed.
 await tool(dialog,'선택');await click(page,dialog,[.5,.4]);
 await expect(bar(dialog).getByRole('button',{name:'펜으로 쓰기',exact:true})).toHaveAttribute('aria-pressed','true');
 await bar(dialog).getByRole('button',{name:'메모 삭제',exact:true}).click();
 const confirm=page.getByRole('alertdialog').or(page.getByRole('dialog',{name:'메모 삭제'})).last();
 await expect(confirm).toContainText('이 메모와 그 위에 쓴 필기 1개를 함께 지울까요?');
 await confirm.getByRole('button',{name:'취소',exact:true}).click();
 expect((await memos(page)).length).toBe(1);expect((await strokes(page)).length).toBe(2);
 await bar(dialog).getByRole('button',{name:'메모 삭제',exact:true}).click();
 await confirm.getByRole('button',{name:'삭제',exact:true}).click();
 await expect.poll(async()=>(await records(page)).map(s=>s.id)).toEqual([rows.find(s=>!s.note).id]);
 await expect(dialog.locator('[data-ink-note]')).toHaveCount(0);await expect(dialog.locator('path[data-stroke]')).toHaveCount(1);
 // Undo brings the memo and its stroke back, still linked.
 await act(dialog,'필기 되돌리기');
 await expect.poll(async()=>(await memos(page)).length).toBe(1);
 expect((await strokes(page)).filter(s=>s.note===(memo.note)).length).toBe(1);
});

test('the eraser removes strokes on a memo but never the memo; undo and redo cover create, text, recolour and delete',async({page})=>{
 await setup(page);const dialog=await open(page);
 await place(page,dialog,[.3,.6],'pen');
 await drag(page,dialog,[.25,.6],[.36,.6]);await expect.poll(async()=>(await strokes(page)).length).toBe(1);
 await tool(dialog,'지우개');
 await click(page,dialog,[.3,.66]); // memo background, away from the stroke
 await click(page,dialog,[.36,.55]);
 expect((await memos(page)).length).toBe(1);expect((await strokes(page)).length).toBe(1);
 await click(page,dialog,[.3,.6]); // on the stroke
 await expect.poll(async()=>(await strokes(page)).length).toBe(0);
 expect((await memos(page)).length).toBe(1);await expect(dialog.locator('[data-ink-note]')).toHaveCount(1);
 // Undo: erase → stroke → memo creation; redo brings the memo back.
 for(const expected of [[1,1],[1,0],[0,0]]){
  await act(dialog,'필기 되돌리기');
  await expect.poll(async()=>[(await memos(page)).length,(await strokes(page)).length]).toEqual(expected);
 }
 await act(dialog,'필기 다시 실행');await expect.poll(async()=>(await memos(page)).length).toBe(1);
 await expect(dialog.locator('[data-ink-note]')).toHaveCount(1);
 // Switch it to 글자, type, recolour: each is one undo step.
 await tool(dialog,'메모');await click(page,dialog,[.3,.6]);
 await bar(dialog).getByRole('button',{name:'글자로 쓰기',exact:true}).click();
 const field=dialog.locator('textarea[data-ink-memo-input]');await expect(field).toBeFocused();
 await field.pressSequentially('고음 준비');
 await bar(dialog).getByRole('button',{name:'초록 메모',exact:true}).click(); // saves the text, recolours, keeps writing
 await expect(field).toBeFocused();await expect(field).toHaveValue('고음 준비');
 await bar(dialog).getByRole('button',{name:'완료',exact:true}).click();
 expect((await memos(page))[0]).toMatchObject({mode:'text',text:'고음 준비',color:'#c9ecc9'});
 await act(dialog,'필기 되돌리기');await expect.poll(async()=>(await memos(page))[0].color).toBe('#fbe88c');
 expect((await memos(page))[0].text).toBe('고음 준비');
 await act(dialog,'필기 되돌리기');await expect.poll(async()=>(await memos(page))[0].text).toBeUndefined();
 await act(dialog,'필기 다시 실행');await expect.poll(async()=>(await memos(page))[0].text).toBe('고음 준비');
 await expect(dialog.locator('[data-ink-note] text')).toContainText('고음 준비');
 // A memo with text asks before deleting; undo restores it with the text.
 await tool(dialog,'선택');await click(page,dialog,[.3,.6]);
 await dialog.locator('textarea[data-ink-memo-input]').blur();
 await bar(dialog).getByRole('button',{name:'메모 삭제',exact:true}).click();
 await expect(page.getByText('이 메모를 지울까요?',{exact:true})).toBeVisible();
 await page.locator('.sheet-alert [data-ok]').click();
 await expect.poll(async()=>(await memos(page)).length).toBe(0);
 await act(dialog,'필기 되돌리기');await expect.poll(async()=>(await memos(page)).map(m=>m.text)).toEqual(['고음 준비']);
});

test('the corner handle resizes a memo inside the page and never below the smallest size',async({page})=>{
 await setup(page);const dialog=await open(page);
 await place(page,dialog,[.4,.4],'pen');const [memo]=await memos(page);
 await tool(dialog,'선택');await click(page,dialog,[.4,.4]);
 const handle=dialog.locator('rect[data-ink-note-handle]');await expect(handle).toHaveCount(1);
 const h=await handle.boundingBox();expect(h.width).toBeGreaterThanOrEqual(43.5);expect(h.height).toBeGreaterThanOrEqual(43.5);
 const corner=[memo.rect[0]+memo.rect[2],memo.rect[1]+memo.rect[3]];
 await drag(page,dialog,corner,[.02,.02]); // far past the top-left corner
 await expect.poll(async()=>(await memos(page))[0].rect[2]).toBeCloseTo(.1,4);
 let now=(await memos(page))[0];
 expect(now.rect.slice(0,2)).toEqual(memo.rect.slice(0,2));expect(now.rect[3]*ASPECT).toBeCloseTo(.1,3);
 await drag(page,dialog,[now.rect[0]+now.rect[2],now.rect[1]+now.rect[3]],[1.5,1.5]); // past the page edge
 await expect.poll(async()=>(await memos(page))[0].rect[2]).toBeGreaterThan(.5);
 now=(await memos(page))[0];
 expect(now.rect[0]+now.rect[2]).toBeLessThanOrEqual(1.00001);expect(now.rect[1]+now.rect[3]).toBeLessThanOrEqual(1.00001);
 expect(await page.evaluate(m=>window.VzipScoreInk.valid(m),now)).toBe(true);
 await act(dialog,'필기 되돌리기');await expect.poll(async()=>(await memos(page))[0].rect[2]).toBeCloseTo(.1,4);
 // A memo placed at the page corner is kept inside the page.
 await place(page,dialog,[.99,.01],'pen');
 const edge=(await memos(page)).find(m=>m.rect[0]>.5);
 expect(edge.rect[0]+edge.rect[2]).toBeCloseTo(1,4);expect(edge.rect[1]).toBe(0);expect(edge.rect[2]).toBeCloseTo(.235,5);
});

test('무대용 보기 shows memos but nothing on them can be edited; an open text field is saved first',async({page})=>{
 await setup(page);const dialog=await open(page);
 await place(page,dialog,[.5,.3],'text');
 await dialog.locator('textarea[data-ink-memo-input]').pressSequentially('저장돼요');
 await act(dialog,'무대용 보기');await expect(dialog).toHaveClass(/score-ink-performance/);
 await expect(dialog.locator('textarea[data-ink-memo-input]')).toHaveCount(0);
 expect((await memos(page))[0].text).toBe('저장돼요');
 await expect(dialog.locator('[data-ink-note]')).toHaveCount(1);await expect(dialog.locator('[data-ink-note] text')).toContainText('저장돼요');
 await expect(bar(dialog)).toBeHidden();
 const before=await records(page);
 await click(page,dialog,[.5,.3]);await drag(page,dialog,[.5,.3],[.3,.6]);
 await expect(dialog.locator('textarea[data-ink-memo-input]')).toHaveCount(0);
 await expect(dialog.locator('[data-ink-note-overlay]')).toHaveCount(0);
 expect(await records(page)).toEqual(before);
});

test('펜만 필기: a finger scrolls and never places or moves a memo; the pen does',async({page})=>{
 await setup(page);const dialog=await open(page);
 const panel=async()=>{await act(dialog,'색상·굵기·투명도 설정');const p=dialog.getByRole('region',{name:'필기 설정',exact:true});await p.getByRole('tab',{name:'기타',exact:true}).click();await dialog.getByLabel('펜만',{exact:true}).setChecked(true);await dialog.getByRole('button',{name:'필기 설정 닫기',exact:true}).click();};
 await panel();await tool(dialog,'메모');
 const press=(type,p)=>dialog.locator('[data-ink-svg]').evaluate((svg,{type,p})=>{
  const r=svg.getBoundingClientRect(),common={bubbles:true,pointerId:type==='pen'?91:92,pointerType:type,isPrimary:true,button:0,pressure:.5,width:10,height:10,clientX:r.x+r.width*p[0],clientY:r.y+r.height*p[1]};
  svg.dispatchEvent(new PointerEvent('pointerdown',common));svg.dispatchEvent(new PointerEvent('pointerup',common));
 },{type,p});
 await press('touch',[.5,.5]);await press('mouse',[.5,.5]);
 await expect(dialog.locator('[data-ink-note]')).toHaveCount(0);
 await press('pen',[.5,.5]);
 await expect(dialog.locator('[data-ink-note][data-draft]')).toHaveCount(1);
 await bar(dialog).getByRole('button',{name:'펜으로 쓰기',exact:true}).click();
 expect((await memos(page)).length).toBe(1);
 // The choice is remembered: the next memo offers 펜 first.
 await tool(dialog,'메모');await press('pen',[.3,.2]);
 await expect(bar(dialog).getByRole('button',{name:'펜으로 쓰기',exact:true})).toHaveAttribute('aria-pressed','true');
 await bar(dialog).getByRole('button',{name:'메모 붙이기 취소',exact:true}).click();
 await expect(dialog.locator('[data-ink-note][data-draft]')).toHaveCount(0);expect((await memos(page)).length).toBe(1);
});

for(const width of [320,430])test('at '+width+'px the tools and the memo row fit: no sideways overflow, 44px targets',async({page})=>{
 await page.setViewportSize({width,height:844});await setup(page);const dialog=await open(page);
 const fits=async()=>{expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);};
 const targets=async(locator,minWidth=43.5)=>{for(const b of await locator.all()){if(!await b.isVisible())continue;const r=await b.boundingBox();expect(r.width,await b.getAttribute('aria-label')||await b.textContent()).toBeGreaterThanOrEqual(minWidth);expect(r.height).toBeGreaterThanOrEqual(43.5);expect(r.x).toBeGreaterThanOrEqual(-.5);expect(r.x+r.width).toBeLessThanOrEqual(width+.5);}};
 // One tool row that never wraps; on the narrowest phones it scrolls sideways inside itself, as before.
 const tools=dialog.locator('.score-ink-tools');
 expect(new Set(await tools.locator('button').evaluateAll(all=>all.map(b=>Math.round(b.getBoundingClientRect().top)))).size).toBe(1);
 const memoTool=dialog.getByRole('button',{name:'메모',exact:true});await memoTool.scrollIntoViewIfNeeded();
 const t=await memoTool.boundingBox(),pen=await dialog.getByRole('button',{name:'펜',exact:true}).boundingBox();
 expect(t.height).toBeGreaterThanOrEqual(43.5);expect(t.width).toBeGreaterThanOrEqual(39.5);expect(Math.abs(t.width-pen.width)).toBeLessThanOrEqual(1);expect(Math.abs(t.height-pen.height)).toBeLessThanOrEqual(1);
 await fits();
 await memoTool.click();await fits();
 await click(page,dialog,[.5,.4]);
 await expect(bar(dialog).getByRole('button',{name:'글자로 쓰기',exact:true})).toBeVisible();
 await targets(bar(dialog).locator('button'));await fits();
 await bar(dialog).getByRole('button',{name:'글자로 쓰기',exact:true}).click();
 const field=dialog.locator('textarea[data-ink-memo-input]');await expect(field).toBeVisible();
 const f=await field.boundingBox();expect(f.x).toBeGreaterThanOrEqual(0);expect(f.x+f.width).toBeLessThanOrEqual(width);
 await targets(bar(dialog).locator('button'));await fits();
 await bar(dialog).getByRole('button',{name:'완료',exact:true}).click();
 await targets(bar(dialog).locator('button'));await fits();
});

test('필기 PDF 만들기 includes the memo, its text and the handwriting on it',async({page})=>{
 await setup(page);const dialog=await open(page);
 await place(page,dialog,[.3,.7],'text','파랑');
 await dialog.locator('textarea[data-ink-memo-input]').pressSequentially('MMMMMM');
 await bar(dialog).getByRole('button',{name:'완료',exact:true}).click();
 await act(dialog,'색상·굵기·투명도 설정');
 const panel=dialog.getByRole('region',{name:'필기 설정',exact:true});await panel.getByRole('tab',{name:'기타',exact:true}).click();
 await panel.getByRole('button',{name:'필기 PDF 만들기',exact:true}).click();
 const save=panel.getByRole('link',{name:'만든 PDF 저장',exact:true});await expect(save).toBeVisible({timeout:20000});
 const [memo]=await memos(page);
 const rendered=await save.evaluate(async(a,rect)=>{
  const data=new Uint8Array(await(await fetch(a.href)).arrayBuffer());
  const pdf=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.min.mjs');
  const document=await pdf.getDocument({data,isEvalSupported:false,standardFontDataUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/'}).promise;
  try{
   const page=await document.getPage(1),view=page.getViewport({scale:2}),canvas=window.document.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
   await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;
   const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;let blue=0,inside=0,ink=0;
   for(let i=0;i<pixels.length;i+=4){
    const x=(i/4%canvas.width)/canvas.width,y=Math.floor(i/4/canvas.width)/canvas.height,within=x>=rect[0]&&x<=rect[0]+rect[2]&&y>=rect[1]&&y<=rect[1]+rect[3];
    if(Math.abs(pixels[i]-0xcf)<6&&Math.abs(pixels[i+1]-0xe3)<6&&Math.abs(pixels[i+2]-0xfb)<6){blue++;if(within)inside++;}
    if(within&&pixels[i]<70&&pixels[i+1]<70&&pixels[i+2]<90)ink++;
   }
   return {blue,inside,ink,area:rect[2]*rect[3]*canvas.width*canvas.height};
  }finally{await document.destroy();}
 },memo.rect);
 expect(rendered.inside/rendered.area).toBeGreaterThan(.7); // the memo colour fills its rect
 expect(rendered.inside/rendered.blue).toBeGreaterThan(.98); // and nothing outside it
 expect(rendered.ink).toBeGreaterThan(40); // the dark text is drawn on it
 // Changing a memo makes the prepared file stale, like any other handwriting change.
 await dialog.getByRole('button',{name:'필기 설정 닫기',exact:true}).click();
 await tool(dialog,'선택');await drag(page,dialog,[.3,.7],[.4,.6]);
 await expect.poll(async()=>(await memos(page))[0].rect[0]).not.toBe(memo.rect[0]);
 await expect(dialog.locator('[data-ink-export-save]')).toBeHidden();
});

test('model: Ink.valid accepts a memo and strokes carrying its key, rejects a bad rect, colour or mode, and leaves old strokes as they were',async({page})=>{
 await setup(page);await page.goto('/');
 const out=await page.evaluate(()=>{
  const Ink=window.VzipScoreInk,base={version:1,ownerId:'o',songId:'s',scoreId:'c',r2Key:'u/o/c/original.pdf',pdfHash:'0'.repeat(64),page:1,createdAt:1};
  const memo={...base,id:'m',tool:'note',color:'#fbe88c',rect:[.1,.1,.235,.18],mode:'pen'},stroke={...base,id:'a',tool:'pen',color:'#101828',width:.004,points:[[.15,.15,.5],[.2,.2,.5]]};
  const bad=[{rect:[.1,.1,.235]},{rect:[.9,.1,.235,.18]},{rect:[.1,.95,.235,.18]},{rect:[-.1,.1,.235,.18]},{rect:[.1,.1,0,.18]},{rect:[.1,.1,'a',.18]},{rect:undefined},{color:'yellow'},{color:'#fff'},{mode:'draw'},{mode:undefined},{text:5},{text:'x'.repeat(2001)},{note:''},{note:7}];
  return {memo:Ink.valid(memo),text:Ink.valid({...memo,mode:'text',text:'가'.repeat(2000),note:'m'}),linked:Ink.valid({...stroke,note:'m'}),plain:Ink.valid(stroke),
   bad:bad.map(patch=>Ink.valid({...memo,...patch})),strokeBad:[Ink.valid({...stroke,width:0}),Ink.valid({...stroke,points:[]}),Ink.valid({...stroke,note:''}),Ink.valid({...stroke,tool:'marker'})],
   hit:Ink.hit(memo,[.15,.15,.5]),inRect:Ink.inRect([memo,stroke],{x:0,y:0,w:1,h:1}).map(s=>s.id),at:Ink.noteAt([memo,stroke],[.15,.15])?.id,
   linkedRows:Ink.linked([memo,{...stroke,note:'m'},{...stroke,id:'b'}],memo).map(s=>s.id),twin:Ink.linked([memo,{...memo,id:'m2',note:'m'},{...stroke,note:'m'}],memo).length,
   same:[Ink.same(memo,{...memo}),Ink.same(memo,{...memo,text:'x'}),Ink.same(memo,{...memo,rect:[.1,.1,.2,.18]}),Ink.same(stroke,{...stroke}),Ink.same(stroke,{...stroke,note:'m'})]};
 });
 expect(out).toEqual({memo:true,text:true,linked:true,plain:true,bad:Array(15).fill(false),strokeBad:[false,false,false,false],hit:false,inRect:['a'],at:'m',linkedRows:['a'],twin:0,same:[true,false,false,true,false]});
});

test('tablet 1024×768: the memo, the choice row in one line and the text field over the memo',async({page},info)=>{
 test.skip(info.project.name!=='chromium-desktop','sizes are set explicitly');
 await page.setViewportSize({width:1024,height:768});await setup(page);const dialog=await open(page);
 const before=await dialog.locator('[data-ink-box]').boundingBox();
 await tool(dialog,'메모');await click(page,dialog,[.7,.25]);
 // The row that opens is counted back in: the page keeps its size.
 expect((await dialog.locator('[data-ink-box]').boundingBox()).width).toBeCloseTo(before.width,0);
 expect(new Set(await bar(dialog).locator('button:visible').evaluateAll(all=>all.map(b=>Math.round(b.getBoundingClientRect().top+b.getBoundingClientRect().height/2)))).size).toBe(1);
 for(const b of await bar(dialog).locator('button:visible').all()){const r=await b.boundingBox();expect(r.width).toBeGreaterThanOrEqual(43.5);expect(r.height).toBeGreaterThanOrEqual(43.5);}
 await bar(dialog).getByRole('button',{name:'글자로 쓰기',exact:true}).click();
 const field=dialog.locator('textarea[data-ink-memo-input]');await expect(field).toBeFocused();
 expect(await field.evaluate(e=>parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(16);
 const [m,f]=[await dialog.locator('[data-ink-note] .score-ink-note-bg').boundingBox(),await field.boundingBox()];
 expect(Math.abs(f.x-m.x)).toBeLessThanOrEqual(f.width);expect(f.width).toBeGreaterThanOrEqual(m.width-1);
 await field.pressSequentially('태블릿 메모');await field.blur();
 await expect.poll(async()=>(await memos(page)).map(x=>x.text)).toEqual(['태블릿 메모']);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 // 두 쪽 보기: a memo on the next page shows on the side page (read-only there).
 await dialog.locator('[data-ink-next]').click();await expect(dialog.locator('[data-ink-page]')).toHaveText('2 / 2쪽');
 await expect(dialog.locator('[data-ink-box] [data-ink-note]')).toHaveCount(0);
 await place(page,dialog,[.3,.3],'pen','분홍');
 await dialog.locator('[data-ink-prev]').click();await expect(dialog.locator('[data-ink-page]')).toHaveText('1 / 2쪽');
 await expect(dialog.locator('[data-ink-spread] [data-ink-note] .score-ink-note-bg')).toHaveAttribute('fill','#fbcfe0');
 await expect(dialog.locator('[data-ink-box] [data-ink-note] text')).toContainText('태블릿 메모');
});

test('fullscreen keeps the memo row under the tools; turning the page saves an open text field and drops the selection',async({page})=>{
 await setup(page);const dialog=await open(page);
 await act(dialog,'전체화면');await expect(dialog).toHaveClass(/score-ink-fullscreen/);
 await place(page,dialog,[.5,.3],'text');
 const row=await bar(dialog).boundingBox(),tools=await dialog.locator('.score-ink-tools').boundingBox(),stage=await dialog.locator('[data-ink-stage]').boundingBox();
 expect(row.y).toBeGreaterThanOrEqual(tools.y+tools.height-1);expect(row.y+row.height).toBeLessThanOrEqual(stage.y+1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await dialog.locator('textarea[data-ink-memo-input]').pressSequentially('넘겨도 저장');
 await dialog.locator('[data-ink-next]').click();await expect(dialog.locator('[data-ink-page]')).toHaveText('2 / 2쪽');
 await expect(dialog.locator('textarea[data-ink-memo-input]')).toHaveCount(0);
 expect((await memos(page)).map(m=>[m.page,m.text])).toEqual([[1,'넘겨도 저장']]);
 await expect(dialog.locator('[data-ink-box] [data-ink-note]')).toHaveCount(0);await expect(dialog.locator('[data-ink-note-overlay]')).toHaveCount(0);
 // Escape leaves the text field (saving it) before anything else; the page clear counts memos apart from strokes.
 await place(page,dialog,[.4,.4],'text');await dialog.locator('textarea[data-ink-memo-input]').pressSequentially('둘째');
 await page.keyboard.press('Escape');
 await expect(dialog.locator('textarea[data-ink-memo-input]')).toHaveCount(0);await expect(dialog).toHaveClass(/score-ink-fullscreen/);
 expect((await memos(page)).map(m=>m.text).sort()).toEqual(['넘겨도 저장','둘째']);
 await act(dialog,'현재 페이지 필기 삭제');
 await expect(page.getByText('현재 페이지의 개인 필기 0개와 메모 1개를 지울까요? PDF 원본은 그대로예요.',{exact:true})).toBeVisible();
 // The question is reachable even when the viewer was the browser's fullscreen element; 취소 keeps everything,
 // and the viewer keeps its screen-filling layout.
 await page.locator('.sheet-alert .btn[data-close]').click();
 await expect(page.locator('.sheet-alert')).toHaveCount(0);await expect(dialog.locator('[data-ink-box]')).toBeVisible();
 await expect(dialog).toHaveClass(/score-ink-fullscreen/);expect(await page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
 expect((await memos(page)).length).toBe(2);
 await act(dialog,'현재 페이지 필기 삭제');await page.locator('.sheet-alert [data-ok]').click();
 await expect.poll(async()=>(await memos(page)).map(m=>m.text)).toEqual(['넘겨도 저장']);
 // The same for deleting a memo with text.
 await dialog.locator('[data-ink-prev]').click();await expect(dialog.locator('[data-ink-page]')).toHaveText('1 / 2쪽');
 await tool(dialog,'메모');await click(page,dialog,[.5,.3]);await dialog.locator('textarea[data-ink-memo-input]').blur();
 await bar(dialog).getByRole('button',{name:'메모 삭제',exact:true}).click();
 await page.locator('.sheet-alert [data-ok]').click();
 await expect.poll(async()=>(await records(page)).length).toBe(0);
});
