/* 목표로 넣기 (app/score-ink.js): the lines of a 글자 스티커 메모 become goals of the score's song — 오늘의 목표 (the home
 * goal list, VzipStudentHomeModel.savePlan) or 숙제 (VZ.addTask) — after the user picks the lines and confirms. */
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
const goals=page=>page.evaluate(()=>window.VZ.db.dailyGoals||[]);
const tasks=page=>page.evaluate(()=>window.VZ.db.assignments||[]);
const today=page=>page.evaluate(()=>window.VZ.today());
const bar=dialog=>dialog.locator('[data-ink-memo-bar]');
const goalButton=dialog=>bar(dialog).getByRole('button',{name:'목표로 넣기',exact:true});
const sheetOf=page=>page.getByRole('dialog',{name:'메모를 목표로 넣기'});
const rows=sheet=>sheet.locator('.vz-plan-option');
async function at(dialog,p){const r=await dialog.locator('[data-ink-svg]').boundingBox();return [r.x+r.width*p[0],r.y+r.height*p[1]];}
async function click(page,dialog,p){const [x,y]=await at(dialog,p);await page.mouse.click(x,y);}
/** A 글자 memo at p with this text; leaves its text field open (the state a tapped memo is in). */
async function memo(page,dialog,p,text){
 await dialog.getByRole('button',{name:'메모',exact:true}).click();await click(page,dialog,p);
 await bar(dialog).getByRole('button',{name:'글자로 쓰기',exact:true}).click();
 const field=dialog.locator('textarea[data-ink-memo-input]');await expect(field).toBeFocused();
 if(text)await field.fill(text);
}
async function openSheet(page,dialog){await goalButton(dialog).click();await expect(sheetOf(page)).toBeVisible();return sheetOf(page);}
const TEXT='- 2절 숨 크게\n1. 박자  주의\n\n• 후렴 고음 힘 빼기\n   \n-5도 올려 부르기';
const LINES=['2절 숨 크게','박자 주의','후렴 고음 힘 빼기','-5도 올려 부르기'];
test.afterEach(async({page})=>expect(page.__errors||[]).toEqual([]));

test('a 글자 memo offers 목표로 넣기: its lines are listed without bullets, all ticked, and 넣기 adds the ticked ones to 오늘의 목표 for this song',async({page})=>{
 await setup(page);const dialog=await open(page);
 await memo(page,dialog,[.6,.3],TEXT);
 await expect(goalButton(dialog)).toBeVisible();
 const sheet=await openSheet(page,dialog);
 // The text that was being typed is saved first, as it was typed.
 await expect(dialog.locator('textarea[data-ink-memo-input]')).toHaveCount(0);
 const [note]=await records(page);expect(note).toMatchObject({tool:'note',mode:'text',text:TEXT});
 await expect(rows(sheet).locator('.vz-plan-title')).toHaveText(LINES);
 for(const box of await rows(sheet).locator('input').all())await expect(box).toBeChecked();
 await expect(sheet.locator('[name=target][value=today]')).toBeChecked();
 await expect(sheet.locator('[data-goal-help]')).toHaveText('오늘의 목표에 개인 목표로 들어가요.');
 await expect(sheet.locator('legend').last()).toContainText('Defying Gravity');await expect(sheet.locator('[data-goal-count]')).toHaveText('4개 선택');
 const submit=page.getByRole('button',{name:'목표 4개 넣기',exact:true});await expect(submit).toBeEnabled();
 expect(await goals(page)).toEqual([]);expect(await tasks(page)).toEqual([]); // nothing before 넣기
 await rows(sheet).nth(1).click(); // untick 박자 주의
 await expect(rows(sheet).nth(1).locator('input')).not.toBeChecked();await expect(sheet.locator('[data-goal-count]')).toHaveText('3개 선택');
 await page.getByRole('button',{name:'목표 3개 넣기',exact:true}).click();
 await expect(sheetOf(page)).toHaveCount(0);await expect(page.locator('.toast')).toHaveText('오늘의 목표에 3개를 넣었어요.');
 const day=await today(page),added=await goals(page);
 expect(added.map(g=>g.title)).toEqual([LINES[0],LINES[2],LINES[3]]);
 for(const [i,g] of added.entries()){
  expect(g).toMatchObject({date:day,source:'personal',sourceId:'',songId:'s1',completed:false,order:i});expect(g.id).toBeTruthy();
  // The fields of a goal typed in 오늘의 목표, plus the song.
  expect(Object.keys(g).filter(k=>k!=='updatedAt').sort()).toEqual(['completed','date','id','order','songId','source','sourceId','title']);
 }
 expect(new Set(added.map(g=>g.id)).size).toBe(3);expect(await tasks(page)).toEqual([]);
 // They are today's goals: on the home list, and offered first for a recording of this song.
 expect(await page.evaluate(()=>window.VzipStudentHomeModel.build(window.VZ.db,{today:window.VZ.today()}).goals.map(g=>g.title))).toEqual([LINES[0],LINES[2],LINES[3]]);
 expect(await page.evaluate(()=>window.VZ.unfinishedGoals('s1').map(g=>g.title))).toEqual([LINES[0],LINES[2],LINES[3]]);
 // The memo itself is untouched and still on the score.
 expect(await records(page)).toEqual([note]);await expect(dialog.locator('[data-ink-box]')).toBeVisible();
 // Again: the lines already there for this song say so and are not ticked; only the new one can be added.
 await dialog.getByRole('button',{name:'선택',exact:true}).click();await click(page,dialog,[.6,.3]);
 const again=await openSheet(page,dialog);
 await expect(rows(again).locator('[data-goal-state]:visible')).toHaveText(['이미 있어요','이미 있어요','이미 있어요']);
 for(const i of [0,2,3]){await expect(rows(again).nth(i).locator('input')).not.toBeChecked();await expect(rows(again).nth(i).locator('input')).toBeDisabled();}
 await expect(rows(again).nth(1).locator('input')).toBeChecked();
 await page.getByRole('button',{name:'목표 1개 넣기',exact:true}).click();
 await expect(page.locator('.toast')).toHaveText('오늘의 목표에 1개를 넣었어요.');
 expect((await goals(page)).map(g=>[g.title,g.order])).toEqual([[LINES[0],0],[LINES[2],1],[LINES[3],2],[LINES[1],3]]);
});

test('숙제 can be chosen instead: the lines become this song\'s homework with the usual period, and the choice is remembered',async({page})=>{
 await setup(page);const dialog=await open(page);
 // A goal typed by hand earlier today with the same words (no song) counts as already there for 오늘의 목표 only.
 await page.evaluate(()=>window.VZ.change(db=>{window.VzipStudentHomeModel.savePlan(db,{date:window.VZ.today(),goals:[{id:'hand',title:'박자 주의',source:'personal',sourceId:'',completed:false}]});},{silent:true}));
 await memo(page,dialog,[.6,.3],TEXT);
 let sheet=await openSheet(page,dialog);
 await expect(rows(sheet).locator('[data-goal-state]:visible')).toHaveText(['이미 있어요']);await expect(rows(sheet).nth(1).locator('input')).toBeDisabled();
 await sheet.locator('[name=target][value=homework]').check();
 const [day,due]=await page.evaluate(()=>[window.VZ.today(),window.VZ.taskDefaultDue()]),[,m,d]=due.split('-');
 await expect(sheet.locator('[data-goal-help]')).toHaveText('이 곡의 숙제로 들어가요. 기간은 오늘부터 '+Number(m)+'/'+Number(d)+'까지예요.');
 await expect(rows(sheet).locator('[data-goal-state]:visible')).toHaveCount(0);
 for(const box of await rows(sheet).locator('input').all())await expect(box).toBeChecked();
 expect(await tasks(page)).toEqual([]);
 await page.getByRole('button',{name:'목표 4개 넣기',exact:true}).click();
 await expect(sheetOf(page)).toHaveCount(0);await expect(page.locator('.toast')).toHaveText('숙제에 4개를 넣었어요.');
 const added=await tasks(page);expect(added.map(t=>t.title)).toEqual(LINES);
 // Exactly what 숙제 추가 saves for a homework of this song.
 const byHand=await page.evaluate(([day,due])=>{let made;window.VZ.change(db=>{made=JSON.parse(JSON.stringify(window.VZ.addTask(db,{title:'손으로',songId:'s1',startDate:day,dueDate:due})));db.assignments.pop();},{silent:true});return made;},[day,due]);
 for(const t of added){
  expect(t).toMatchObject({lessonId:'',lessonIds:[],status:'active',songId:'s1',startDate:day,dueDate:due});
  expect(Object.keys(t).filter(k=>k!=='updatedAt').sort()).toEqual(Object.keys(byHand).sort());
 }
 expect((await goals(page)).map(g=>g.id)).toEqual(['hand']); // 오늘의 목표 was not touched
 // Next time 숙제 is offered first; everything is already there, so there is nothing to add until 오늘의 목표 is chosen.
 await dialog.getByRole('button',{name:'메모',exact:true}).click();await click(page,dialog,[.6,.3]);
 sheet=await openSheet(page,dialog);
 await expect(sheet.locator('[name=target][value=homework]')).toBeChecked();
 await expect(rows(sheet).locator('[data-goal-state]:visible')).toHaveCount(4);
 await expect(page.getByRole('button',{name:'넣기',exact:true})).toBeDisabled();
 await sheet.locator('[name=target][value=today]').check();
 await expect(page.getByRole('button',{name:'목표 3개 넣기',exact:true})).toBeEnabled();
 // A finished homework with the same words can be given again.
 await page.evaluate(()=>window.VZ.change(db=>{db.assignments[0].status='done';},{silent:true}));
 await sheet.locator('[name=target][value=homework]').check();
 await expect(page.getByRole('button',{name:'목표 1개 넣기',exact:true})).toBeEnabled();await expect(rows(sheet).nth(0).locator('input')).toBeChecked();
});

test('nothing is saved without 넣기: closing the sheet adds no goal, and closing after changing the ticks asks first',async({page})=>{
 await setup(page);const dialog=await open(page);
 await memo(page,dialog,[.5,.4],TEXT);
 let sheet=await openSheet(page,dialog);
 await sheet.getByRole('button',{name:'돌아가기',exact:true}).click();
 await expect(sheetOf(page)).toHaveCount(0);await expect(page.locator('.sheet-alert')).toHaveCount(0);
 expect(await goals(page)).toEqual([]);expect(await tasks(page)).toEqual([]);
 await dialog.getByRole('button',{name:'메모',exact:true}).click();await click(page,dialog,[.5,.4]);
 sheet=await openSheet(page,dialog);
 await rows(sheet).nth(0).click();await sheet.locator('[name=target][value=homework]').check();
 await sheet.getByRole('button',{name:'돌아가기',exact:true}).click();
 await expect(page.locator('.sheet-alert')).toContainText('작성 중인 내용이 있어요');
 await page.locator('.sheet-alert .btn[data-close]').click();await expect(sheet).toBeVisible(); // 계속 작성
 await expect(rows(sheet).nth(0).locator('input')).not.toBeChecked();
 await page.keyboard.press('Escape');await page.locator('.sheet-alert [data-ok]').click(); // 닫기
 await expect(sheetOf(page)).toHaveCount(0);
 expect(await goals(page)).toEqual([]);expect(await tasks(page)).toEqual([]);
 // The place chosen is only remembered once something was added.
 await dialog.getByRole('button',{name:'메모',exact:true}).click();await click(page,dialog,[.5,.4]);
 sheet=await openSheet(page,dialog);await expect(sheet.locator('[name=target][value=today]')).toBeChecked();
 // Unticking everything leaves nothing to add.
 for(const row of await rows(sheet).all())await row.click();
 await expect(page.getByRole('button',{name:'넣기',exact:true})).toBeDisabled();
 expect((await records(page)).length).toBe(1);
});

test('a 펜 memo has no 목표로 넣기, and a 글자 memo without text has nothing to add',async({page})=>{
 await setup(page);const dialog=await open(page);
 await dialog.getByRole('button',{name:'메모',exact:true}).click();await click(page,dialog,[.3,.6]);
 await expect(bar(dialog).locator('[data-ink-memo-goals]')).toBeHidden(); // not placed yet
 await bar(dialog).getByRole('button',{name:'펜으로 쓰기',exact:true}).click();
 await dialog.getByRole('button',{name:'선택',exact:true}).click();await click(page,dialog,[.3,.6]);
 await expect(bar(dialog).getByRole('button',{name:'펜으로 쓰기',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(bar(dialog).locator('[data-ink-memo-goals]')).toBeHidden();
 // Switched to 글자 it gets the button; with nothing written a message says so and no sheet opens.
 await bar(dialog).getByRole('button',{name:'글자로 쓰기',exact:true}).click();
 await expect(dialog.locator('textarea[data-ink-memo-input]')).toBeFocused();await expect(goalButton(dialog)).toBeVisible();
 await goalButton(dialog).click();
 await expect(page.locator('.toast')).toHaveText('목표로 넣을 내용이 없어요. 메모에 한 줄 이상 적어 주세요.');await expect(sheetOf(page)).toHaveCount(0);
 await expect(bar(dialog).locator('[data-ink-memo-goals]')).toBeHidden(); // selected, empty
 // Only bullets and blank lines: still nothing.
 await dialog.getByRole('button',{name:'메모',exact:true}).click();await click(page,dialog,[.3,.6]);
 await dialog.locator('textarea[data-ink-memo-input]').fill('-\n\n • ');
 await goalButton(dialog).click();await expect(sheetOf(page)).toHaveCount(0);
 expect(await goals(page)).toEqual([]);
 await expect(page.locator('.toast')).toHaveText('목표로 넣을 내용이 없어요. 메모에 한 줄 이상 적어 주세요.');
 // 무대용 보기 hides the row with the button.
 await click(page,dialog,[.3,.6]);await dialog.locator('textarea[data-ink-memo-input]').fill('한 줄');await expect(goalButton(dialog)).toBeVisible();
 const more=dialog.getByRole('button',{name:'무대용 보기',exact:true});if(!await more.isVisible())await dialog.locator('[data-ink-more]').click();await more.click();
 await expect(bar(dialog)).toBeHidden();
});

for(const width of [320,430])test('at '+width+'px the memo row with 목표로 넣기 and the sheet fit: no sideways overflow, 44px targets',async({page})=>{
 await page.setViewportSize({width,height:740});await setup(page);const dialog=await open(page);
 const fits=async node=>{expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(await node.evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);};
 const targets=async locator=>{for(const b of await locator.all()){if(!await b.isVisible())continue;const r=await b.boundingBox(),label=await b.getAttribute('aria-label')||await b.textContent();expect(r.width,label).toBeGreaterThanOrEqual(43.5);expect(r.height,label).toBeGreaterThanOrEqual(43.5);expect(r.x,label).toBeGreaterThanOrEqual(-.5);expect(r.x+r.width,label).toBeLessThanOrEqual(width+.5);}};
 await memo(page,dialog,[.5,.4],'- 아주 긴 목표 한 줄은 화면 너비를 넘지 않고 줄이 바뀌어야 해요 그래야 끝까지 읽을 수 있어요\n- 짧은 줄');
 await targets(bar(dialog).locator('button'));await fits(dialog); // editing: 완료 + 목표로 넣기
 const label=await goalButton(dialog).evaluate(b=>b.scrollWidth<=b.clientWidth+1);expect(label).toBe(true); // the words are not cut
 await bar(dialog).getByRole('button',{name:'완료',exact:true}).click();
 await targets(bar(dialog).locator('button'));await fits(dialog); // selected: 글자 · 펜 · 목표로 넣기
 expect(await goalButton(dialog).evaluate(b=>b.scrollWidth<=b.clientWidth+1)).toBe(true);
 const sheet=await openSheet(page,dialog);
 await fits(sheet);await fits(sheet.locator('.sheet-body'));
 await targets(rows(sheet));await targets(sheet.locator('.ink-marker-choices label'));await targets(page.getByRole('button',{name:'목표 2개 넣기',exact:true}));
 await sheet.locator('[name=target][value=homework]').check();await fits(sheet);
});

test('tablet 1024×768: the memo row stays one line with 목표로 넣기, and the sheet is a centred page',async({page},info)=>{
 test.skip(info.project.name!=='chromium-desktop','sizes are set explicitly');
 await page.setViewportSize({width:1024,height:768});await setup(page);const dialog=await open(page);
 await memo(page,dialog,[.6,.3],TEXT);
 await bar(dialog).getByRole('button',{name:'완료',exact:true}).click();
 const visible=bar(dialog).locator('button:visible');
 expect(new Set(await visible.evaluateAll(all=>all.map(b=>Math.round(b.getBoundingClientRect().top+b.getBoundingClientRect().height/2)))).size).toBe(1);
 for(const b of await visible.all()){const r=await b.boundingBox();expect(r.width).toBeGreaterThanOrEqual(43.5);expect(r.height).toBeGreaterThanOrEqual(43.5);}
 const sheet=await openSheet(page,dialog);
 const form=await sheet.locator('form').boundingBox();expect(form.width).toBeLessThanOrEqual(560);expect(Math.abs(form.x+form.width/2-512)).toBeLessThan(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.getByRole('button',{name:'목표 4개 넣기',exact:true}).click();
 await expect(page.locator('.toast')).toHaveText('오늘의 목표에 4개를 넣었어요.');
 expect((await goals(page)).map(g=>g.songId)).toEqual(['s1','s1','s1','s1']);
});
