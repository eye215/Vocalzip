/* 악보 표기 presets follow the account (app/score-ink-settings.js): two devices are two browser contexts, each with its own
 * localStorage and app record; a "sync" merges one record into the other with data-merge.js, as cloud-sync.js does,
 * and announces it the same way (vzip:data-changed from 'cloud-merge'). Fixtures follow tests/score-markers.spec.cjs. */
const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {boot,fakeR2}=require('./helpers/r2-fixture.cjs');
const fs=require('node:fs'),path=require('node:path');
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
const bytes=pdf(),key='u/ui-test-user/score-ink/original.pdf',PURPLE='#7a32f5',RED='#b42318',GREEN='#067647';
const SETTINGS='vzip_score_ink_settings_v1:ui-test-user',MOVED='vzip_score_markers_moved_v1:ui-test-user';
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
/** The second device: its own context (own localStorage and record), set up like the test's own page. */
async function otherDevice(browser,page,info){
 const u=info.project.use,context=await browser.newContext({viewport:u.viewport,isMobile:u.isMobile,hasTouch:u.hasTouch,deviceScaleFactor:u.deviceScaleFactor,userAgent:u.userAgent,baseURL:new URL(page.url()).origin});
 await context.addInitScript(()=>{window.VZIP_DEVICE_SESSIONS_ENABLED=false;window.VZIP_APPROVED_HOME_ENABLED=false;});
 const other=await context.newPage();await setup(other);return other;
}
async function open(page){
 await page.goto('/#/song/s1');await page.getByRole('tab',{name:'악보',exact:true}).click();
 await page.getByRole('button',{name:'연습 악보 열기',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'악보 개인 필기'});
 await expect(dialog.locator('[data-ink-box]')).toBeVisible({timeout:20000});
 await expect(dialog.locator('[data-ink-save-state]')).toContainText('필기 준비됨',{timeout:20000});
 return dialog;
}
const record=page=>page.evaluate(()=>JSON.parse(JSON.stringify(window.VZ.db)));
/** What cloud-sync.js does when the other device's record arrives. */
const sync=(page,remote)=>page.evaluate(remote=>{
 const storage=window.VzipAccountScope?.storage||localStorage,merged=window.VzipDataMerge.merge(window.VZ.db,remote).data;
 storage.setItem('vocal-zip_mvp_v1',JSON.stringify(merged));window.dispatchEvent(new CustomEvent('vzip:data-changed',{detail:{source:'cloud-merge'}}));
},remote);
const strokes=page=>page.evaluate(()=>(window.VZ.db.scoreAnnotations||[]).filter(s=>s.kind!=='marker-preset'));
const presetRows=page=>page.evaluate(()=>(window.VZ.db.scoreAnnotations||[]).filter(s=>s.kind==='marker-preset'));
const palette=dialog=>dialog.locator('[data-ink-marker-palette]');
const names=dialog=>palette(dialog).locator('[data-ink-marker]>span');
const editor=page=>page.getByRole('dialog',{name:'악보 표기 편집'});
const save=page=>page.getByRole('button',{name:'저장',exact:true}).click();
async function click(page,dialog,p){const r=await dialog.locator('[data-ink-svg]').boundingBox();await page.mouse.click(r.x+r.width*p[0],r.y+r.height*p[1]);}
async function showPalette(dialog){if(await palette(dialog).isHidden())await dialog.getByRole('button',{name:'악보 표시',exact:true}).click();await expect(palette(dialog)).toBeVisible();}
async function pick(dialog,name){await showPalette(dialog);await palette(dialog).getByRole('button',{name,exact:true}).click();await expect(palette(dialog)).toBeHidden();}
async function edit(page,dialog,name){
 await showPalette(dialog);const toggle=palette(dialog).getByRole('button',{name:'편집',exact:true});
 if(await toggle.getAttribute('aria-pressed')!=='true')await toggle.click();
 await palette(dialog).getByRole('button',{name:name+' 편집',exact:true}).click();await expect(editor(page)).toBeVisible();return editor(page);
}
async function add(page,dialog){await showPalette(dialog);await palette(dialog).getByRole('button',{name:'표기 추가',exact:true}).click();await expect(editor(page)).toBeVisible();return editor(page);}
async function fill(sheet,{name,shape,color}){
 if(name!==undefined)await sheet.getByLabel('이름').fill(name);
 if(shape)await sheet.locator('[name=shape][value='+shape+']').check();
 if(color)await sheet.locator('[name=color][value="'+color+'"]').check();
}
/** Places `name` on the page and returns the stroke it left. */
async function place(page,dialog,name,p){
 const before=(await strokes(page)).length;await pick(dialog,name);await click(page,dialog,p);
 await expect.poll(async()=>(await strokes(page)).length).toBe(before+1);return (await strokes(page)).at(-1);
}
test.afterEach(async({page})=>expect(page.__errors||[]).toEqual([]));

test('a preset made on one device appears on the other after a sync; edits and deletion follow, placed marks stay',async({page,browser},info)=>{
 await setup(page);const dialog=await open(page);
 let sheet=await add(page,dialog);await fill(sheet,{name:'강세',shape:'star',color:RED});await save(page);
 await expect(page.locator('.toast')).toHaveText('표기를 추가했어요.');
 const [row]=await presetRows(page);expect(row).toMatchObject({kind:'marker-preset',ownerId:'ui-test-user',look:{name:'강세',color:RED,shape:'star'}});
 // The device entry still has it too (older app versions read only that).
 expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).markers.user.map(m=>m.name),SETTINGS)).toEqual(['강세']);
 // Device B, viewer open with the palette showing: the preset arrives with the sync, without reopening.
 const phone=await otherDevice(browser,page,info),there=await open(phone);await showPalette(there);
 await expect(names(there)).toHaveText(['숨표','반복','컷','시작점']);
 await sync(phone,await record(page));
 await expect(names(there)).toHaveText(['숨표','반복','컷','시작점','강세']);
 const mark=await place(phone,there,'강세',[.5,.3]);expect(mark).toMatchObject({mark:row.preset,color:RED});
 // Edited on B → shows on A.
 sheet=await edit(phone,there,'강세');await fill(sheet,{name:'강세 2',color:GREEN});await save(phone);
 await expect(phone.locator('.toast')).toHaveText('표기를 저장했어요.');
 await sync(page,await record(phone));await showPalette(dialog);
 await expect(names(dialog)).toHaveText(['숨표','반복','컷','시작점','강세 2']);
 expect(await place(page,dialog,'강세 2',[.3,.6])).toMatchObject({mark:row.preset,color:GREEN});
 // Deleted on A → gone on B; the mark B placed with it stays.
 sheet=await edit(page,dialog,'강세 2');await sheet.getByRole('button',{name:'이 표기 삭제',exact:true}).click();await page.locator('.sheet-alert [data-ok]').click();
 await expect(page.locator('.toast')).toHaveText('표기를 지웠어요.');
 await sync(phone,await record(page));await showPalette(there);
 await expect(names(there)).toHaveText(['숨표','반복','컷','시작점']);
 expect((await strokes(phone)).filter(s=>s.mark===row.preset).map(s=>s.id)).toContain(mark.id);
 await expect(there.locator('path[data-stroke="'+mark.id+'"]')).toHaveCount(1);
 // Syncing back the other way does not bring it back.
 await sync(page,await record(phone));await showPalette(dialog);await expect(names(dialog)).toHaveText(['숨표','반복','컷','시작점']);
 expect(phone.__errors).toEqual([]);await phone.context().close();
});

test('a built-in change and 기본값으로 되돌리기 both follow the account',async({page,browser},info)=>{
 await setup(page);const dialog=await open(page);
 let sheet=await edit(page,dialog,'숨표');await fill(sheet,{color:RED,shape:'comma'});await save(page);
 const phone=await otherDevice(browser,page,info),there=await open(phone);
 expect(await place(phone,there,'숨표',[.5,.2])).toMatchObject({mark:'breath',color:PURPLE});
 await sync(phone,await record(page));
 const changed=await place(phone,there,'숨표',[.5,.4]);expect(changed).toMatchObject({mark:'breath',color:RED});expect(changed.points).toHaveLength(7); // a comma
 sheet=await edit(page,dialog,'숨표');await sheet.getByRole('button',{name:'기본값으로 되돌리기',exact:true}).click();await page.locator('.sheet-alert [data-ok]').click();
 await expect(page.locator('.toast')).toHaveText('처음 모양으로 되돌렸어요.');
 await sync(phone,await record(page));
 const reset=await place(phone,there,'숨표',[.5,.6]);expect(reset).toMatchObject({mark:'breath',color:PURPLE});expect(reset.points).toHaveLength(3); // a V
 // The built-in row stays (look: null), so 숨표 can be changed again later.
 expect((await presetRows(phone)).map(r=>[r.preset,r.look])).toEqual([['breath',null]]);
 expect(phone.__errors).toEqual([]);await phone.context().close();
});

test('first run: presets kept on this device are copied up once, never over a newer synced one; the device entry is left as it was',async({page})=>{
 await setup(page);
 const entry=JSON.stringify({version:1,owner:'ui-test-user',pen:{color:'#175cd3',width:.004,opacity:1,recent:[],custom:[]},
  markers:{builtin:{start:{name:'시작점',color:GREEN,width:.006,type:'pen',form:'symbol',shape:'circle'}},user:[{id:'m-old',name:'옛 표기',color:RED,width:.005,type:'pen',form:'symbol',shape:'star'}]}});
 await page.evaluate(([k,entry])=>{
  localStorage.setItem(k,entry);
  // 시작점 was already changed on another device and synced.
  window.VZ.change(d=>{d.scoreAnnotations.push({id:'marker-preset:start',kind:'marker-preset',ownerId:'ui-test-user',preset:'start',createdAt:1,
   look:{name:'시작점',color:'#5925dc',width:.006,type:'pen',form:'symbol',shape:'star'}});},{silent:true});
 },[SETTINGS,entry]);
 const synced=(await presetRows(page))[0];
 let dialog=await open(page);await showPalette(dialog);
 await expect(names(dialog)).toHaveText(['숨표','반복','컷','시작점','옛 표기']);
 let rows=await presetRows(page);
 expect(rows.map(r=>[r.preset,r.look.name,r.look.color])).toEqual([['start','시작점','#5925dc'],['m-old','옛 표기',RED]]);
 expect(rows[0]).toEqual(synced);
 expect(await page.evaluate(k=>localStorage.getItem(k),SETTINGS)).toBe(entry);
 expect(await page.evaluate(k=>localStorage.getItem(k),MOVED)).toBe('1');
 expect(await place(page,dialog,'시작점',[.4,.3])).toMatchObject({mark:'start',color:'#5925dc'});
 // An older version on this device adds one more to the device entry: it is not copied again.
 await page.evaluate(k=>{const e=JSON.parse(localStorage.getItem(k));e.markers.user.push({id:'m-late',name:'나중',color:'#b42318',width:.005,type:'pen',form:'symbol',shape:'v'});localStorage.setItem(k,JSON.stringify(e));},SETTINGS);
 await page.reload();dialog=await open(page);await showPalette(dialog);
 await expect(names(dialog)).toHaveText(['숨표','반복','컷','시작점','옛 표기']);
 expect(await presetRows(page)).toEqual(rows);
});

test('pen and highlighter settings stay on the device; synced presets keep the 320px palette in the screen',async({page,browser},info)=>{
 await page.setViewportSize({width:320,height:740});await setup(page);const dialog=await open(page);
 const before=JSON.stringify(await record(page));
 await dialog.getByRole('button',{name:'펜',exact:true}).click();
 await dialog.locator('[data-ink-more]').click();await dialog.getByRole('button',{name:'색상·굵기·투명도 설정',exact:true}).click();
 const panel=dialog.getByRole('region',{name:'필기 설정',exact:true});
 await panel.getByRole('button',{name:'진한 빨강 #b42318',exact:true}).click();
 await expect.poll(()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)||'{}').pen?.color,SETTINGS)).toBe(RED);
 expect(JSON.stringify(await record(page))).toBe(before);
 await dialog.getByRole('button',{name:'필기 설정 닫기',exact:true}).click();
 // Three presets with the longest names arrive from another device.
 const phone=await otherDevice(browser,page,info),there=await open(phone);
 for(const name of ['가나다라마바사아자차카타','WWWWWWWWWWWW','셈여림']){const sheet=await add(phone,there);await fill(sheet,{name});await save(phone);}
 expect(await phone.evaluate(k=>localStorage.getItem(k),SETTINGS)).not.toContain('#b42318');
 await sync(page,await record(phone));await showPalette(dialog);
 await expect(names(dialog)).toHaveText(['숨표','반복','컷','시작점','가나다라마바사아자차카타','WWWWWWWWWWWW','셈여림']);
 expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).pen.color,SETTINGS)).toBe(RED);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 expect(await palette(dialog).evaluate(e=>e.scrollWidth<=e.clientWidth+1)).toBe(true);
 for(const b of await palette(dialog).locator('button').all()){if(!await b.isVisible())continue;const r=await b.boundingBox();expect(r.height).toBeGreaterThanOrEqual(43.5);expect(r.x+r.width).toBeLessThanOrEqual(320.5);}
 const stage=await dialog.locator('[data-ink-stage]').boundingBox(),row=await palette(dialog).boundingBox();
 expect(stage.y).toBeGreaterThanOrEqual(row.y+row.height-1);
 expect(phone.__errors).toEqual([]);await phone.context().close();
});
