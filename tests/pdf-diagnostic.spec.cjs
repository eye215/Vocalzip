const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {boot,fakeR2}=require('./helpers/r2-fixture.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PDFROOT=process.env.VZ_PDFJS_ROOT||'/tmp/vzip-score-pdfjs/node_modules/pdfjs-dist';
function pdf(pad=0){
 const stream=text=>'<< /Length '+Buffer.byteLength(text)+' >>\nstream\n'+text+'\nendstream';
 const staff='0 0 0 RG 1 w '+[170,180,190,200,210].map(y=>'20 '+y+' m 280 '+y+' l S').join('\n');
 const content=n=>'BT /F1 18 Tf 20 360 Td (VOCAL.zip Score '+n+') Tj ET\n'+staff;
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 7 0 R >> >> /Contents 4 0 R >>',stream(content(1)+(pad?'\n'+('%'+'x'.repeat(998)+'\n').repeat(Math.ceil(pad/1000)):'')),
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 7 0 R >> >> /Contents 6 0 R >>',stream(content(2)),
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 let out='%PDF-1.4\n',offsets=[0];
 objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(out));out+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});
 const offset=Buffer.byteLength(out);out+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+offset+'\n%%EOF';
 return Buffer.from(out);
}
const bytes=pdf(),key='u/ui-test-user/score-ink/original.pdf';
/** n pages, each with ~pad bytes inside its content stream, so later pages lie beyond the first 1 MB range. */
function bigPdf(n,pad){
 const stream=text=>'<< /Length '+Buffer.byteLength(text)+' >>\nstream\n'+text+'\nendstream';
 const filler=('%'+'x'.repeat(998)+'\n').repeat(Math.ceil(pad/1000));
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids ['+Array.from({length:n},(_,i)=>(4+i*2)+' 0 R').join(' ')+'] /Count '+n+' >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
 for(let i=0;i<n;i++)objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 3 0 R >> >> /Contents '+(5+i*2)+' 0 R >>',stream('BT /F1 18 Tf 20 360 Td (Page '+(i+1)+') Tj ET\n'+filler));
 let out='%PDF-1.4\n';const offsets=[0];
 objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(out));out+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});
 const at=Buffer.byteLength(out);out+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+at+'\n%%EOF';
 return Buffer.from(out);
}
async function setup(page,sourceBytes=bytes){
 const r2=await fakeR2(page);r2.store.set(key,{bytes:sourceBytes,type:'application/pdf',etag:'"pdf"'});
 await page.context().route('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/**',route=>{
  const suffix=new URL(route.request().url()).pathname.split('pdfjs-dist@4.10.38/')[1],file=path.join(PDFROOT,suffix);
  if(!suffix||suffix.includes('..')||!fs.existsSync(file))return route.abort();
  return route.fulfill({path:file,contentType:file.endsWith('.mjs')?'text/javascript':'application/octet-stream',headers:{'access-control-allow-origin':'*'}});
 });
 await page.context().route('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/**',route=>route.fulfill({path:path.join(PDFROOT,'../pdf-lib/dist/pdf-lib.min.js'),contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}}));
 await boot(page);
 await page.evaluate(([key,size])=>window.VZ.change(d=>{
  if(!d.songs[0].scores?.some(s=>s.id==='score-ink'))d.songs[0].scores=[{id:'score-ink',songId:'s1',title:'연습 악보',r2Key:key,size,uploadedAt:Date.now()}];
  if(!d.lessons.length)d.lessons.push({id:'existing-lesson',note:'기존 레슨 메모'});
  if(!d.practices.length)d.practices.push({id:'existing-practice',minutes:17,note:'기존 연습 메모'});
 }),[key,sourceBytes.length]);
 return r2;
}
async function open(page,pages=2){
 await page.goto('/#/song/s1');await page.getByRole('tab',{name:'악보',exact:true}).click();
 await page.getByRole('button',{name:'연습 악보 열기',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'악보 개인 필기'});
 await expect(dialog.locator('[data-ink-box]')).toBeVisible({timeout:20000});
 await expect(dialog.locator('[data-ink-page]')).toHaveText('1 / '+pages+'쪽');
 await expect(dialog.locator('[data-ink-save-state]')).toContainText('필기 준비됨',{timeout:20000});
 return dialog;
}
async function draw(page,dialog,{tool='펜',y=.22,ignored=false}={}){
 await dialog.getByRole('button',{name:tool,exact:true}).click();
 const r=await dialog.locator('[data-ink-svg]').boundingBox();
 await page.mouse.move(r.x+r.width*.15,r.y+r.height*y);await page.mouse.down();await page.mouse.move(r.x+r.width*.65,r.y+r.height*(y+.04),{steps:10});await page.mouse.up();
 if(!ignored)await expect(dialog.locator('[data-ink-status]')).toContainText('이 기기에 저장됨');
}
test.afterEach(async({page})=>expect(page.__errors||[]).toEqual([]));

test('diagnose PDF reopen requests',async({page})=>{
 const start=Date.now();let phase='setup';
 const log=(...x)=>console.log(Date.now()-start,phase,...x);
 page.on('console',m=>{if(m.text().startsWith('DIAG'))log(m.text());});
 page.on('request',r=>{if(/original\.pdf/.test(r.url()))log('REQUEST',r.method(),r.headers(),r.resourceType(),r.isNavigationRequest(),(()=>{try{return r.frame().url()}catch{return 'NO FRAME'}})());});
 page.on('worker',w=>log('WORKER',w.url()));
 await page.addInitScript(()=>{
  const fetch0=fetch;window.fetch=(...args)=>{if(String(args[0]).includes('original.pdf'))console.log('DIAG fetch',args[0],new Error().stack);return fetch0(...args);};
 });
 await page.route('**/app/score-ink.js*',route=>{
  let body=fs.readFileSync(path.join(__dirname,'../app/score-ink.js'),'utf8');
  body=body.replace('if(!response)return null;',"console.log('DIAG cache match',pdfKey(owner,score),!!response);if(!response)return null;");
  body=body.replace('const kept=await pdfCache.fresh(owner,score).catch(()=>null);',"const kept=await pdfCache.fresh(owner,score).catch(e=>{console.log('DIAG cache error',e.message,e.stack);return null;});console.log('DIAG fresh',!!kept);");
  body=body.replace('return {bytes,hash:digest,etag:',"console.log('DIAG bytes valid',bytes.length,digest);return {bytes,hash:digest,etag:");
  return route.fulfill({body,contentType:'text/javascript'});
 });
 const r2=await setup(page);phase='first-open';let dialog=await open(page);
 await expect.poll(()=>page.evaluate(async()=>(await (await caches.open('vzip-score-pdf-v1')).keys()).length)).toBe(1);
 const cacheInfo=()=>page.evaluate(async()=>{const cache=await caches.open('vzip-score-pdf-v1'),keys=await cache.keys();return Promise.all(keys.map(async k=>({url:k.url,method:k.method,headers:[...k.headers],match:!!(await cache.match(k)),string:!!(await cache.match(k.url)),response:(await cache.match(k))?.headers&&[...(await cache.match(k)).headers]})));});
 log('CACHE-BEFORE',await cacheInfo());
 phase='close';await dialog.getByRole('button',{name:'돌아가기',exact:true}).click();
 await page.waitForTimeout(1000);phase='goto';await page.goto('/#/song/s1');
 log('CACHE-AFTER-GOTO',await cacheInfo());
 await page.waitForTimeout(1000);phase='score-tab';await page.getByRole('tab',{name:'악보',exact:true}).click();
 await page.waitForTimeout(1000);phase='open-button';await page.getByRole('button',{name:'연습 악보 열기',exact:true}).click();
 dialog=page.getByRole('dialog',{name:'악보 개인 필기'});
 await expect(dialog.locator('[data-ink-save-state]')).toContainText('필기 준비됨');
 await page.waitForTimeout(1000);log('FINISHED');
});
