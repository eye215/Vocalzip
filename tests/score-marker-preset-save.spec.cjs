/* 악보 표기 editor on the iPad (app/score-ink.js markerSheet): a preset that cannot be saved says why where it can be
 * seen — the error line sits at the end of a long form, below the fold, so a failed 저장 used to look like nothing
 * happened (e.g. Safari's storage full: VZ.change fails and app/score-ink-settings.js throws). Saved ones survive
 * closing the viewer, a reload and a sync round trip. Fixtures follow tests/score-marker-presets-sync.spec.cjs. */
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
const palette=dialog=>dialog.locator('[data-ink-marker-palette]');
const names=dialog=>palette(dialog).locator('[data-ink-marker]>span');
const editor=page=>page.getByRole('dialog',{name:'악보 표기 편집'});
const presetRows=page=>page.evaluate(()=>(window.VZ.db.scoreAnnotations||[]).filter(r=>r.kind==='marker-preset').map(r=>[r.preset,r.look&&r.look.name,r.look&&r.look.color]));
async function showPalette(dialog){if(await palette(dialog).isHidden())await dialog.getByRole('button',{name:'악보 표시',exact:true}).tap();await expect(palette(dialog)).toBeVisible();}
async function add(page,dialog){await showPalette(dialog);await palette(dialog).getByRole('button',{name:'표기 추가',exact:true}).tap();await expect(editor(page)).toBeVisible();return editor(page);}
async function edit(page,dialog,name){
 await showPalette(dialog);const toggle=palette(dialog).getByRole('button',{name:'편집',exact:true});
 if(await toggle.getAttribute('aria-pressed')!=='true')await toggle.tap();
 await palette(dialog).getByRole('button',{name:name+' 편집',exact:true}).tap();await expect(editor(page)).toBeVisible();return editor(page);
}
const save=page=>page.getByRole('button',{name:'저장',exact:true}).tap();
/** The editor's error line is on screen (inside the sheet's scrolling body, not below it). */
async function errorShown(sheet,text){
 const error=sheet.locator('[data-marker-error]');await expect(error).toContainText(text);
 await expect.poll(()=>error.evaluate(e=>{const r=e.getBoundingClientRect(),body=e.closest('.sheet-body')||document.documentElement,b=body.getBoundingClientRect();return r.top>=b.top-1&&r.bottom<=Math.min(b.bottom,innerHeight)+1;})).toBe(true);
}
const sync=(page,remote)=>page.evaluate(remote=>{
 const merged=window.VzipDataMerge.merge(window.VZ.db,remote).data;
 localStorage.setItem('vocal-zip_mvp_v1',JSON.stringify(merged));window.dispatchEvent(new CustomEvent('vzip:data-changed',{detail:{source:'cloud-merge'}}));
},remote);
test.afterEach(async({page})=>expect(page.__errors||[]).toEqual([]));

test('iPad: a 저장 that fails says why on screen and keeps the form; once there is room it saves and stays',async({page})=>{
 await setup(page);const dialog=await open(page);
 expect(await dialog.locator('[data-ink-svg]').getAttribute('data-pen-only')).toBe('true');
 // Safari's storage is full: the app record cannot be written.
 await page.evaluate(()=>{const set=Storage.prototype.setItem;window.__full=true;Storage.prototype.setItem=function(k,v){if(window.__full&&k==='vocal-zip_mvp_v1')throw new DOMException('full','QuotaExceededError');return set.call(this,k,v);};});
 let sheet=await add(page,dialog);await sheet.getByLabel('이름').fill('강세');
 await sheet.locator('[name=shape][value=text]').tap();await sheet.locator('[name=text]').fill('mf');
 await save(page);
 await errorShown(sheet,'저장 공간을 확인해 주세요');
 await expect(sheet.getByLabel('이름')).toHaveValue('강세');expect(await presetRows(page)).toEqual([]);
 // Room again: the same form saves.
 await page.evaluate(()=>{window.__full=false;});await save(page);
 await expect(page.locator('.toast')).toHaveText('표기를 추가했어요.');await expect(editor(page)).toHaveCount(0);
 // A built-in one: name and colour.
 sheet=await edit(page,dialog,'숨표');await sheet.getByLabel('이름').fill('숨');await sheet.locator('[name=color][value="#b42318"]').tap();await save(page);
 await expect(page.locator('.toast')).toHaveText('표기를 저장했어요.');
 await showPalette(dialog);await expect(names(dialog)).toHaveText(['숨','반복','컷','시작점','강세']);
 const rows=await presetRows(page);expect(rows.map(r=>r.slice(1))).toEqual([['강세','#7a32f5'],['숨','#b42318']]);
 // Closing the viewer, reloading the app, and the cloud copy coming back keep them.
 await page.reload();const again=await open(page);await showPalette(again);
 await expect(names(again)).toHaveText(['숨','반복','컷','시작점','강세']);
 const record=await page.evaluate(()=>JSON.parse(JSON.stringify(window.VZ.db)));
 await sync(page,{...record,scoreAnnotations:[]});await sync(page,record);
 await showPalette(again);await expect(names(again)).toHaveText(['숨','반복','컷','시작점','강세']);expect(await presetRows(page)).toEqual(rows);
});

test('iPad: 직접 그리기 without a drawing and 글자 without letters say so on screen',async({page})=>{
 await setup(page);const dialog=await open(page);
 const sheet=await add(page,dialog);await sheet.getByLabel('이름').fill('그림');
 await sheet.locator('[name=form][value=draw]').tap();await save(page);
 await errorShown(sheet,'표기를 그려 주세요');
 await sheet.locator('[name=form][value=symbol]').tap();await sheet.locator('[name=shape][value=text]').tap();await save(page);
 await errorShown(sheet,'기호로 쓸 글자');
 expect(await presetRows(page)).toEqual([]);
});
