/* 악보 표기 직접 설정 (app/score-ink*.js): the four built-in markers can be changed and put back, the user adds their
 * own. A preset decides what the next mark looks like; a mark on a score keeps its own look and says what it is. */
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
const bytes=pdf(),key='u/ui-test-user/score-ink/original.pdf',ASPECT=4/3,PURPLE='#7a32f5',RED='#b42318',GREEN='#067647';
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
const stored=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('vzip_score_ink_settings_v1:ui-test-user')||'null')?.markers||null);
const palette=dialog=>dialog.locator('[data-ink-marker-palette]');
const editor=page=>page.getByRole('dialog',{name:'악보 표기 편집'});
const save=page=>page.getByRole('button',{name:'저장',exact:true}).click();
async function at(dialog,p){const r=await dialog.locator('[data-ink-svg]').boundingBox();return [r.x+r.width*p[0],r.y+r.height*p[1]];}
async function click(page,dialog,p){const [x,y]=await at(dialog,p);await page.mouse.click(x,y);}
async function drag(page,dialog,from,to){
 const a=await at(dialog,from);await page.mouse.move(...a);await page.mouse.down();
 const b=await at(dialog,to);await page.mouse.move((a[0]+b[0])/2,(a[1]+b[1])/2,{steps:4});await page.mouse.move(...b,{steps:4});await page.mouse.up();
}
async function showPalette(dialog){if(await palette(dialog).isHidden())await dialog.getByRole('button',{name:'악보 표시',exact:true}).click();await expect(palette(dialog)).toBeVisible();}
/** Chooses a marker: the palette closes and the next touch on the page places it. */
async function pick(dialog,name){await showPalette(dialog);await palette(dialog).getByRole('button',{name,exact:true}).click();await expect(palette(dialog)).toBeHidden();}
/** Opens the editor of an existing marker (편집 → the marker). */
async function edit(page,dialog,name){
 await showPalette(dialog);
 const toggle=palette(dialog).getByRole('button',{name:'편집',exact:true}); // stays on after an editor is closed without saving
 if(await toggle.getAttribute('aria-pressed')!=='true')await toggle.click();
 await expect(toggle).toHaveAttribute('aria-pressed','true');
 await palette(dialog).getByRole('button',{name:name+' 편집',exact:true}).click();
 await expect(editor(page)).toBeVisible();return editor(page);
}
async function add(page,dialog){await showPalette(dialog);await palette(dialog).getByRole('button',{name:'표기 추가',exact:true}).click();await expect(editor(page)).toBeVisible();return editor(page);}
/** Fills the editor: only the fields given. */
async function fill(sheet,{name,form,shape,text,type,color,width}){
 if(name!==undefined)await sheet.getByLabel('이름').fill(name);
 if(form)await sheet.locator('[name=form][value='+form+']').check();
 if(shape)await sheet.locator('[name=shape][value='+shape+']').check();
 if(text!==undefined)await sheet.locator('[name=text]').fill(text);
 if(type)await sheet.locator('[name=type][value='+type+']').check();
 if(color)await sheet.locator('[name=color][value="'+color+'"]').check();
 if(width)await sheet.getByLabel('표기 굵기',{exact:true}).fill(String(width));
}
async function act(dialog,name){
 const button=dialog.getByRole('button',{name,exact:true});
 if(!await button.isVisible())await dialog.locator('[data-ink-more]').click();
 await button.click();
}
test.afterEach(async({page})=>expect(page.__errors||[]).toEqual([]));

test('the palette has its own row with the four built-in markers, 표기 추가 and 편집; each is placed as before and says what it is',async({page})=>{
 await setup(page);const dialog=await open(page);
 const pen=dialog.getByRole('button',{name:'펜',exact:true}),before=await pen.boundingBox();
 await showPalette(dialog);
 await expect(palette(dialog).locator('[data-ink-marker]>span')).toHaveText(['숨표','반복','컷','시작점']);
 await expect(palette(dialog).locator('[data-ink-marker] svg')).toHaveCount(4); // each shows what it leaves
 await expect(palette(dialog).getByRole('button',{name:'표기 추가',exact:true})).toBeVisible();
 await expect(palette(dialog).getByRole('button',{name:'편집',exact:true})).toHaveAttribute('aria-pressed','false');
 // The tools keep their size: the palette is a row under them, not inside the tool row.
 const now=await pen.boundingBox();expect(now.width).toBeCloseTo(before.width,0);
 expect((await palette(dialog).boundingBox()).y).toBeGreaterThanOrEqual(now.y+now.height-1);
 // 숨표: one tap, a V.
 await pick(dialog,'숨표');await click(page,dialog,[.5,.2]);
 await expect.poll(async()=>(await records(page)).length).toBe(1);
 let rows=await records(page);
 expect(rows[0]).toMatchObject({tool:'pen',color:PURPLE,width:.006,opacity:1,mark:'breath',page:1});expect(rows[0].points).toHaveLength(3);
 expect(rows[0].points[1][0]).toBeCloseTo(.5,2);expect(rows[0].points[0][0]).toBeCloseTo(rows[0].points[1][0]-.016,4);
 // 시작점: one tap, a circle.
 await pick(dialog,'시작점');await click(page,dialog,[.2,.3]);
 await expect.poll(async()=>(await records(page)).length).toBe(2);
 rows=await records(page);expect(rows[1]).toMatchObject({tool:'pen',color:PURPLE,width:.006,mark:'start'});expect(rows[1].points).toHaveLength(21);
 // 컷: a drag, a see-through band; the band follows the finger before it is saved.
 await pick(dialog,'컷');
 const a=await at(dialog,[.2,.5]),b=await at(dialog,[.6,.5]);
 await page.mouse.move(...a);await page.mouse.down();await page.mouse.move((a[0]+b[0])/2,a[1],{steps:3});
 await expect(dialog.locator('[data-stroke="mark-preview"]')).toHaveCount(1);expect((await records(page)).length).toBe(2);
 await page.mouse.move(...b,{steps:3});await page.mouse.up();
 await expect.poll(async()=>(await records(page)).length).toBe(3);await expect(dialog.locator('[data-stroke="mark-preview"]')).toHaveCount(0);
 rows=await records(page);expect(rows[2]).toMatchObject({tool:'highlighter',color:PURPLE,width:.04,opacity:.25,mark:'cut'});expect(rows[2].points).toHaveLength(2);
 expect(rows[2].points[0][0]).toBeCloseTo(.2,2);expect(rows[2].points[1][0]).toBeCloseTo(.6,2);
 // 반복: two taps. The first saves nothing and leaves a tick where the range begins.
 await pick(dialog,'반복');await click(page,dialog,[.2,.7]);
 await expect(dialog.locator('[data-stroke="mark-start"]')).toHaveCount(1);expect((await records(page)).length).toBe(3);
 await click(page,dialog,[.7,.72]);
 await expect.poll(async()=>(await records(page)).length).toBe(4);await expect(dialog.locator('[data-stroke="mark-start"]')).toHaveCount(0);
 rows=await records(page);expect(rows[3]).toMatchObject({tool:'pen',color:PURPLE,width:.006,mark:'repeat'});expect(rows[3].points).toHaveLength(4);
 expect(rows[3].points[0][0]).toBeCloseTo(.2,2);expect(rows[3].points[3][0]).toBeCloseTo(.7,2);
 expect(await page.evaluate(all=>all.every(s=>window.VzipScoreInk.valid(s)),rows)).toBe(true);
 await expect(dialog.locator('path[data-stroke]')).toHaveCount(4);
 // Each mark is one undo step.
 await act(dialog,'필기 되돌리기');await expect.poll(async()=>(await records(page)).map(s=>s.mark)).toEqual(['breath','start','cut']);
 // Nothing was written to the preset store by using the defaults.
 expect(await stored(page)).toBeNull();
});

test('editing a built-in marker (colour, width, pen type, form) changes the next mark only; what it is and how it is placed stay; 기본값으로 되돌리기 puts it back',async({page})=>{
 await setup(page);const dialog=await open(page);
 await pick(dialog,'시작점');await click(page,dialog,[.3,.2]);
 await expect.poll(async()=>(await records(page)).length).toBe(1);
 const [old]=await records(page);
 // 시작점 → a red star, thick, see-through.
 let sheet=await edit(page,dialog,'시작점');
 await expect(sheet.getByLabel('이름')).toHaveValue('시작점');
 await expect(sheet.locator('[data-marker-input]')).toHaveText('찍는 방식 · 한 번 누르기');
 await expect(sheet.locator('[name=form][value=symbol]')).toBeChecked();await expect(sheet.locator('[name=shape][value=circle]')).toBeChecked();
 await expect(sheet.locator('[name=type][value=pen]')).toBeChecked();await expect(sheet.locator('[name=color][value="'+PURPLE+'"]')).toBeChecked();
 await expect(sheet.getByRole('button',{name:'기본값으로 되돌리기',exact:true})).toBeDisabled(); // nothing to put back yet
 await fill(sheet,{shape:'star',type:'highlighter',color:RED,width:12});
 // The preview shows the mark as it will be drawn.
 const shown=sheet.locator('[data-marker-preview] path');
 await expect(shown).toHaveAttribute('stroke',RED);await expect(shown).toHaveAttribute('stroke-width','12');await expect(shown).toHaveAttribute('opacity','0.25');
 expect(await records(page)).toEqual([old]);expect(await stored(page)).toBeNull(); // nothing until 저장
 await save(page);await expect(editor(page)).toHaveCount(0);await expect(page.locator('.toast')).toHaveText('표기를 저장했어요.');
 expect((await stored(page)).builtin.start).toEqual({name:'시작점',color:RED,width:.012,type:'highlighter',form:'symbol',shape:'star'});
 // The mark placed before is exactly as it was, on screen and in the data.
 expect(await records(page)).toEqual([old]);
 await expect(dialog.locator('path[data-stroke="'+old.id+'"]')).toHaveAttribute('stroke',PURPLE);
 // The next 시작점 uses the new look and is still a 시작점, placed with one tap.
 await pick(dialog,'시작점');await click(page,dialog,[.6,.2]);
 await expect.poll(async()=>(await records(page)).length).toBe(2);
 let rows=await records(page);expect(rows[0]).toEqual(old);
 expect(rows[1]).toMatchObject({tool:'highlighter',color:RED,width:.012,opacity:.25,mark:'start'});expect(rows[1].points).toHaveLength(11);
 await expect(dialog.locator('path[data-stroke="'+rows[1].id+'"]')).toHaveAttribute('stroke',RED);
 // 반복 keeps its two taps with a new colour…
 sheet=await edit(page,dialog,'반복');await expect(sheet.locator('[data-marker-input]')).toHaveText('찍는 방식 · 시작과 끝을 차례로 누르기');
 await fill(sheet,{color:GREEN});await save(page);
 await pick(dialog,'반복');await click(page,dialog,[.2,.6]);expect((await records(page)).length).toBe(2);
 await click(page,dialog,[.8,.6]);await expect.poll(async()=>(await records(page)).length).toBe(3);
 rows=await records(page);expect(rows[2]).toMatchObject({color:GREEN,mark:'repeat',tool:'pen'});expect(rows[2].points).toHaveLength(4);
 expect(rows[2].points[0][0]).toBeCloseTo(.2,2);expect(rows[2].points[3][0]).toBeCloseTo(.8,2);
 // …and as a 테두리 상자 it is drawn with one drag, still a 반복.
 sheet=await edit(page,dialog,'반복');await fill(sheet,{form:'box'});
 await expect(sheet.locator('[data-marker-input]')).toHaveText('찍는 방식 · 따라 긋기');await expect(sheet.locator('[data-marker-shapes]')).toBeHidden();
 await save(page);
 await pick(dialog,'반복');await drag(page,dialog,[.2,.75],[.6,.85]);
 await expect.poll(async()=>(await records(page)).length).toBe(4);
 rows=await records(page);expect(rows[3]).toMatchObject({color:GREEN,mark:'repeat'});expect(rows[3].points).toHaveLength(5);expect(rows[3].points[4]).toEqual(rows[3].points[0]);
 // 기본값으로 되돌리기 asks first, then the next mark is the original one; marks on the page stay.
 sheet=await edit(page,dialog,'반복');
 await sheet.getByRole('button',{name:'기본값으로 되돌리기',exact:true}).click();
 await expect(page.locator('.sheet-alert')).toContainText('‘반복’ 표기를 처음 모양으로 되돌릴까요? 악보에 이미 찍은 표기는 그대로예요.');
 await page.locator('.sheet-alert .btn[data-close]').click();await expect(editor(page)).toBeVisible();expect((await stored(page)).builtin.repeat.form).toBe('box');
 await sheet.getByRole('button',{name:'기본값으로 되돌리기',exact:true}).click();await page.locator('.sheet-alert [data-ok]').click();
 await expect(editor(page)).toHaveCount(0);await expect(page.locator('.toast')).toHaveText('처음 모양으로 되돌렸어요.');
 expect(Object.keys((await stored(page)).builtin)).toEqual(['start']);
 await pick(dialog,'반복');await click(page,dialog,[.3,.4]);await click(page,dialog,[.7,.4]);
 await expect.poll(async()=>(await records(page)).length).toBe(5);
 rows=await records(page);expect(rows[4]).toMatchObject({color:PURPLE,mark:'repeat'});expect(rows[4].points).toHaveLength(4);
 expect(rows.slice(0,4).map(s=>s.color)).toEqual([PURPLE,RED,GREEN,GREEN]);
 expect(await page.evaluate(all=>all.every(s=>window.VzipScoreInk.valid(s)),rows)).toBe(true);
});

test('the editor saves nothing until 저장: closing with changes asks first, and a name is required',async({page})=>{
 await setup(page);const dialog=await open(page);
 let sheet=await edit(page,dialog,'숨표');
 // Untouched: closes at once.
 await sheet.getByRole('button',{name:'돌아가기',exact:true}).click();await expect(editor(page)).toHaveCount(0);
 await expect(dialog.locator('[data-ink-box]')).toBeVisible(); // the score is still open behind it
 sheet=await edit(page,dialog,'숨표');
 await fill(sheet,{name:'숨',color:RED});
 await sheet.getByRole('button',{name:'돌아가기',exact:true}).click();
 await expect(page.locator('.sheet-alert')).toContainText('작성 중인 내용이 있어요');
 await page.locator('.sheet-alert .btn[data-close]').click(); // 계속 작성
 await expect(sheet.getByLabel('이름')).toHaveValue('숨');
 await sheet.getByRole('button',{name:'돌아가기',exact:true}).click();await page.locator('.sheet-alert [data-ok]').click(); // 닫기
 await expect(editor(page)).toHaveCount(0);expect(await stored(page)).toBeNull();
 await expect(palette(dialog).locator('[data-ink-marker]>span')).toHaveText(['숨표','반복','컷','시작점']);
 // A name is needed; typed characters need 1–4 characters.
 sheet=await add(page,dialog);
 await expect(page.getByRole('button',{name:'저장',exact:true})).toBeDisabled();
 await fill(sheet,{name:'셈여림',shape:'text'});
 await expect(sheet.locator('[name=text]')).toBeVisible();await save(page);
 await expect(sheet.locator('[data-marker-error]')).toHaveText('기호로 쓸 글자를 1~4자로 적어 주세요.');expect(await stored(page)).toBeNull();
 await fill(sheet,{text:'mf'});await expect(sheet.locator('[data-marker-error]')).toHaveText('');
 await expect(sheet.locator('[data-marker-preview] text')).toHaveText('mf');
 await save(page);await expect(editor(page)).toHaveCount(0);
 expect((await stored(page)).user).toHaveLength(1);
});

test('a user marker is added, used, changed and deleted; presets are still there after a reload and deleting one keeps its marks',async({page})=>{
 await setup(page);let dialog=await open(page);
 let sheet=await add(page,dialog);
 await fill(sheet,{name:'셈여림',shape:'text',text:'mf',color:GREEN,width:4});
 await save(page);await expect(page.locator('.toast')).toHaveText('표기를 추가했어요.');
 // It is ready to place straight away.
 await expect(palette(dialog)).toBeHidden();await expect(dialog.getByRole('button',{name:'악보 표시',exact:true})).toHaveAttribute('aria-pressed','true');
 await click(page,dialog,[.5,.3]);
 await expect.poll(async()=>(await records(page)).length).toBe(1);
 const [glyph]=await records(page),id=glyph.mark;
 expect(id).toMatch(/^m-/);expect(glyph).toMatchObject({tool:'pen',color:GREEN,width:.004,glyph:'mf',size:.04});expect(glyph.points).toHaveLength(1);
 expect(glyph.points[0][0]).toBeCloseTo(.5,2);expect(glyph.points[0][1]).toBeCloseTo(.3,2);
 expect(await page.evaluate(s=>window.VzipScoreInk.valid(s),glyph)).toBe(true);
 const letters=dialog.locator('text[data-stroke="'+glyph.id+'"]');
 await expect(letters).toHaveText('mf');await expect(letters).toHaveAttribute('fill',GREEN);
 // The letters are centred on the tap and scale with the page.
 const box=await letters.boundingBox(),[cx,cy]=await at(dialog,[.5,.3]);
 expect(Math.abs(box.x+box.width/2-cx)).toBeLessThan(4);expect(Math.abs(box.y+box.height/2-cy)).toBeLessThan(box.height*.45);
 // In the palette: after the built-in ones, marked as the one in use.
 await showPalette(dialog);
 await expect(palette(dialog).locator('[data-ink-marker]>span')).toHaveText(['숨표','반복','컷','시작점','셈여림']);
 await expect(palette(dialog).getByRole('button',{name:'셈여림',exact:true})).toHaveAttribute('aria-pressed','true');
 // Change it to a 물결선: the next mark is a wavy line of the same kind; the letters stay letters.
 sheet=await edit(page,dialog,'셈여림');
 await expect(sheet.locator('[name=shape][value=text]')).toBeChecked();await expect(sheet.locator('[name=text]')).toHaveValue('mf');
 await expect(sheet.getByRole('button',{name:'기본값으로 되돌리기',exact:true})).toHaveCount(0);
 await fill(sheet,{name:'밑줄 물결',form:'wave'});await save(page);
 await pick(dialog,'밑줄 물결');await drag(page,dialog,[.2,.6],[.7,.6]);
 await expect.poll(async()=>(await records(page)).length).toBe(2);
 let rows=await records(page);expect(rows[0]).toEqual(glyph);
 expect(rows[1]).toMatchObject({mark:id,color:GREEN,tool:'pen'});expect(rows[1].glyph).toBeUndefined();expect(rows[1].points.length).toBeGreaterThan(40);
 // A built-in change too, then reload: both presets are still there (kept on this device).
 sheet=await edit(page,dialog,'숨표');await fill(sheet,{shape:'comma',color:RED});await save(page);
 await page.reload();dialog=await open(page);
 await expect(dialog.locator('text[data-stroke]')).toHaveText('mf');await expect(dialog.locator('path[data-stroke]')).toHaveCount(1);
 await showPalette(dialog);
 await expect(palette(dialog).locator('[data-ink-marker]>span')).toHaveText(['숨표','반복','컷','시작점','밑줄 물결']);
 await pick(dialog,'숨표');await click(page,dialog,[.8,.2]);
 await expect.poll(async()=>(await records(page)).length).toBe(3);
 rows=await records(page);expect(rows[2]).toMatchObject({mark:'breath',color:RED});expect(rows[2].points).toHaveLength(7);
 // Delete the user marker: asks, then it is gone from the palette; the marks made with it stay on the score.
 sheet=await edit(page,dialog,'밑줄 물결');
 await sheet.getByRole('button',{name:'이 표기 삭제',exact:true}).click();
 await expect(page.locator('.sheet-alert')).toContainText('‘밑줄 물결’ 표기를 지울까요? 악보에 이미 찍은 표기는 그대로 남아요.');
 await page.locator('.sheet-alert .btn[data-close]').click();expect((await stored(page)).user).toHaveLength(1);
 await sheet.getByRole('button',{name:'이 표기 삭제',exact:true}).click();await page.locator('.sheet-alert [data-ok]').click();
 await expect(editor(page)).toHaveCount(0);await expect(page.locator('.toast')).toHaveText('표기를 지웠어요.');
 await expect(palette(dialog).locator('[data-ink-marker]>span')).toHaveText(['숨표','반복','컷','시작점']);
 expect((await stored(page)).user).toEqual([]);
 expect((await records(page)).map(s=>s.mark)).toEqual([id,id,'breath']);
 await expect(dialog.locator('text[data-stroke]')).toHaveText('mf');await expect(dialog.locator('path[data-stroke]')).toHaveCount(2);
});

test('a mark of typed characters is selected, moved and erased like any other handwriting',async({page})=>{
 await setup(page);const dialog=await open(page);
 const sheet=await add(page,dialog);await fill(sheet,{name:'가사',shape:'text',text:'숨'});await save(page);
 await click(page,dialog,[.4,.4]);await expect.poll(async()=>(await records(page)).length).toBe(1);
 const [first]=await records(page);
 await dialog.getByRole('button',{name:'선택',exact:true}).click();
 await click(page,dialog,[.41,.4]);
 await expect(dialog.locator('[data-ink-selection-count]')).toHaveText('1개 선택');
 // The selection is smaller than its 44px corner handle: a drag that starts on the letters still moves them.
 await drag(page,dialog,[.39,.39],[.59,.54]);
 await expect.poll(async()=>(await records(page))[0].points[0][0]).toBeCloseTo(first.points[0][0]+.2,2);
 let [moved]=await records(page);expect(moved).toMatchObject({glyph:'숨',size:.04,mark:first.mark});expect(moved.points[0][1]).toBeCloseTo(first.points[0][1]+.15,2);
 // Larger: the letters grow with the selection.
 await dialog.getByRole('button',{name:'선택 필기 확대',exact:true}).click();
 await expect.poll(async()=>(await records(page))[0].size).toBeCloseTo(.044,4);
 // The eraser takes it when its letters are touched, not when the page beside them is.
 await dialog.getByRole('button',{name:'지우개',exact:true}).click();
 await click(page,dialog,[.3,.3]);expect((await records(page)).length).toBe(1);
 [moved]=await records(page);await click(page,dialog,[moved.points[0][0]+.012,moved.points[0][1]]);
 await expect.poll(async()=>(await records(page)).length).toBe(0);await expect(dialog.locator('text[data-stroke]')).toHaveCount(0);
 await act(dialog,'필기 되돌리기');await expect.poll(async()=>(await records(page)).map(s=>s.glyph)).toEqual(['숨']);
});

test('필기 PDF 만들기 draws the new forms: a star, typed characters and a box, each in its colour and place',async({page})=>{
 await setup(page);const dialog=await open(page);
 let sheet=await add(page,dialog);await fill(sheet,{name:'별',shape:'star',color:RED,width:8});await save(page);
 await click(page,dialog,[.25,.2]);
 sheet=await add(page,dialog);await fill(sheet,{name:'글자',shape:'text',text:'MM',color:GREEN,width:8});await save(page);
 await click(page,dialog,[.7,.2]);
 sheet=await add(page,dialog);await fill(sheet,{name:'상자',form:'box',color:'#175cd3',width:8});await save(page);
 await drag(page,dialog,[.2,.7],[.8,.85]);
 await expect.poll(async()=>(await records(page)).length).toBe(3);
 await act(dialog,'색상·굵기·투명도 설정');
 const panel=dialog.getByRole('region',{name:'필기 설정',exact:true});await panel.getByRole('tab',{name:'기타',exact:true}).click();
 await panel.getByRole('button',{name:'필기 PDF 만들기',exact:true}).click();
 const link=panel.getByRole('link',{name:'만든 PDF 저장',exact:true});await expect(link).toBeVisible({timeout:20000});
 const rendered=await link.evaluate(async a=>{
  const data=new Uint8Array(await(await fetch(a.href)).arrayBuffer());
  const pdf=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.min.mjs');
  const document=await pdf.getDocument({data,isEvalSupported:false,standardFontDataUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/'}).promise;
  try{
   const page=await document.getPage(1),view=page.getViewport({scale:2}),canvas=window.document.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
   await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;
   const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
   const near=(i,[r,g,b])=>Math.abs(pixels[i]-r)<40&&Math.abs(pixels[i+1]-g)<40&&Math.abs(pixels[i+2]-b)<40;
   const count=(colour,[x0,y0,x1,y1])=>{let inside=0,all=0;for(let i=0;i<pixels.length;i+=4){if(!near(i,colour))continue;all++;const x=(i/4%canvas.width)/canvas.width,y=Math.floor(i/4/canvas.width)/canvas.height;if(x>=x0&&x<=x1&&y>=y0&&y<=y1)inside++;}return {inside,all};};
   return {star:count([0xb4,0x23,0x18],[.2,.16,.3,.24]),letters:count([0x06,0x76,0x47],[.62,.16,.78,.24]),box:count([0x17,0x5c,0xd3],[.18,.68,.82,.87]),
    hollow:count([0x17,0x5c,0xd3],[.25,.73,.75,.82]).inside};
  }finally{await document.destroy();}
 });
 for(const name of ['star','letters','box']){expect(rendered[name].inside,name).toBeGreaterThan(150);expect(rendered[name].inside/rendered[name].all,name).toBeGreaterThan(.97);}
 expect(rendered.hollow).toBe(0); // an outline, not a filled block
});

test('무대용 보기 shows marks but places none; a marker left half placed is dropped',async({page})=>{
 await setup(page);const dialog=await open(page);
 await pick(dialog,'반복');await click(page,dialog,[.2,.5]);
 await expect(dialog.locator('[data-stroke="mark-start"]')).toHaveCount(1);
 await pick(dialog,'숨표');await expect(dialog.locator('[data-stroke="mark-start"]')).toHaveCount(0);
 await click(page,dialog,[.5,.5]);await expect.poll(async()=>(await records(page)).length).toBe(1);
 await showPalette(dialog);
 await act(dialog,'무대용 보기');await expect(dialog).toHaveClass(/score-ink-performance/);
 await expect(palette(dialog)).toBeHidden();await expect(dialog.locator('path[data-stroke]')).toHaveCount(1);
 await click(page,dialog,[.3,.3]);expect((await records(page)).length).toBe(1);
});

test('전체화면: the palette sits under the tools and the editor opens over the viewer, which stays fullscreen behind it',async({page})=>{
 await setup(page);const dialog=await open(page);
 await act(dialog,'전체화면');await expect(dialog).toHaveClass(/score-ink-fullscreen/);
 await showPalette(dialog);
 const row=await palette(dialog).boundingBox(),tools=await dialog.locator('.score-ink-tools').boundingBox(),stage=await dialog.locator('[data-ink-stage]').boundingBox();
 expect(row.y).toBeGreaterThanOrEqual(tools.y+tools.height-1);expect(row.y+row.height).toBeLessThanOrEqual(stage.y+1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 const sheet=await edit(page,dialog,'숨표');
 await expect(sheet.getByLabel('이름')).toBeVisible();expect(await page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
 await fill(sheet,{color:RED});await save(page);
 await expect(editor(page)).toHaveCount(0);await expect(dialog).toHaveClass(/score-ink-fullscreen/);
 await pick(dialog,'숨표');await click(page,dialog,[.5,.3]);
 await expect.poll(async()=>(await records(page)).map(s=>[s.mark,s.color])).toEqual([['breath',RED]]);
});

for(const width of [320,430])test('at '+width+'px the palette and the editor fit: no sideways overflow, 44px targets',async({page})=>{
 await page.setViewportSize({width,height:740});await setup(page);const dialog=await open(page);
 const fits=async node=>{expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(await node.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);};
 const targets=async locator=>{for(const b of await locator.all()){if(!await b.isVisible())continue;const r=await b.boundingBox(),label=await b.getAttribute('aria-label')||await b.textContent();expect(r.width,label).toBeGreaterThanOrEqual(43.5);expect(r.height,label).toBeGreaterThanOrEqual(43.5);expect(r.x,label).toBeGreaterThanOrEqual(-.5);expect(r.x+r.width,label).toBeLessThanOrEqual(width+.5);}};
 // Three user markers with the longest names allowed.
 for(const name of ['가나다라마바사아자차카타','WWWWWWWWWWWW','셈여림']){const sheet=await add(page,dialog);await fill(sheet,{name});await save(page);}
 await showPalette(dialog);
 await expect(palette(dialog).locator('[data-ink-marker]')).toHaveCount(7);
 await targets(palette(dialog).locator('button'));await fits(dialog);await fits(palette(dialog));
 // The score is still on screen under the palette.
 const stage=await dialog.locator('[data-ink-stage]').boundingBox(),row=await palette(dialog).boundingBox();
 expect(stage.y).toBeGreaterThanOrEqual(row.y+row.height-1);expect(stage.height).toBeGreaterThan(200);
 await palette(dialog).getByRole('button',{name:'편집',exact:true}).click();
 await expect(palette(dialog).locator('[data-ink-marker-hint]')).toHaveText('고칠 표기를 눌러 주세요.');
 await targets(palette(dialog).locator('button'));await fits(dialog);
 await palette(dialog).getByRole('button',{name:'컷 편집',exact:true}).click();
 const sheet=editor(page);await expect(sheet).toBeVisible();
 await fits(sheet);await fits(sheet.locator('.sheet-body'));
 await targets(sheet.locator('.ink-marker-choices label, .ink-marker-colors label'));
 await targets(sheet.locator('button'));await targets(page.getByRole('button',{name:'저장',exact:true}));
 // The preview stays in view while the form scrolls.
 await sheet.locator('.sheet-body').evaluate(e=>e.scrollTo(0,e.scrollHeight));
 const preview=await sheet.locator('[data-marker-preview]').boundingBox(),body=await sheet.locator('.sheet-body').boundingBox();
 expect(preview.y).toBeGreaterThanOrEqual(body.y-1);expect(preview.y+preview.height).toBeLessThan(body.y+body.height);
 await fill(sheet,{form:'symbol',shape:'text',text:'WWWW'});
 await fits(sheet);await targets(sheet.locator('.ink-marker-choices label'));
});

test('tablet 1024×768: the palette is one row that keeps the page size, and the editor is a centred form',async({page},info)=>{
 test.skip(info.project.name!=='chromium-desktop','sizes are set explicitly');
 await page.setViewportSize({width:1024,height:768});await setup(page);const dialog=await open(page);
 const before=await dialog.locator('[data-ink-box]').boundingBox();
 await showPalette(dialog);
 // The row that opens is counted back in: the page keeps its size.
 await page.waitForTimeout(300);
 expect((await dialog.locator('[data-ink-box]').boundingBox()).width).toBeCloseTo(before.width,0);
 expect(new Set(await palette(dialog).locator('[data-ink-marker]').evaluateAll(all=>all.map(b=>Math.round(b.getBoundingClientRect().top)))).size).toBe(1);
 for(const b of await palette(dialog).locator('button').all()){const r=await b.boundingBox();expect(r.width).toBeGreaterThanOrEqual(43.5);expect(r.height).toBeGreaterThanOrEqual(43.5);}
 const sheet=await edit(page,dialog,'컷');
 await expect(sheet.locator('[name=form][value=cover]')).toBeChecked();await expect(sheet.locator('[name=type][value=highlighter]')).toBeChecked();
 await expect(sheet.locator('[data-marker-input]')).toHaveText('찍는 방식 · 따라 긋기');
 const form=await sheet.locator('form').boundingBox();expect(form.width).toBeLessThanOrEqual(560);expect(Math.abs(form.x+form.width/2-512)).toBeLessThan(2);
 for(const label of await sheet.locator('.ink-marker-choices label:visible, .ink-marker-colors label').all()){const r=await label.boundingBox();expect(r.width).toBeGreaterThanOrEqual(43.5);expect(r.height).toBeGreaterThanOrEqual(43.5);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 // Leaving 구간 덮기 for a line form goes back to a thin pen line; the width can then be set freely.
 await fill(sheet,{form:'line'});
 await expect(sheet.locator('[name=type][value=pen]')).toBeChecked();await expect(sheet.getByLabel('표기 굵기',{exact:true})).toHaveValue('6');
 await fill(sheet,{width:10,form:'wave'});await expect(sheet.getByLabel('표기 굵기',{exact:true})).toHaveValue('10');
 await save(page);
 await pick(dialog,'컷');await drag(page,dialog,[.2,.5],[.6,.5]);
 await expect.poll(async()=>(await records(page)).length).toBe(1);
 const [row]=await records(page);expect(row).toMatchObject({mark:'cut',tool:'pen',width:.01,opacity:1});expect(row.points.length).toBeGreaterThan(20);
 // 두 쪽 보기: a mark on the next page shows on the side page.
 await dialog.locator('[data-ink-next]').click();await expect(dialog.locator('[data-ink-page]')).toHaveText('2 / 2쪽');
 await pick(dialog,'시작점');await click(page,dialog,[.3,.3]);await expect.poll(async()=>(await records(page)).length).toBe(2);
 await dialog.locator('[data-ink-prev]').click();await expect(dialog.locator('[data-ink-page]')).toHaveText('1 / 2쪽');
 await expect(dialog.locator('[data-ink-spread] path[data-spread-stroke]')).toHaveCount(1);
});
