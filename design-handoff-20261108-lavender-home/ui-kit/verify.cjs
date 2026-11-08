const {chromium}=require('@playwright/test');
const fs=require('fs'),http=require('http'),path=require('path'),assert=require('node:assert/strict');
(async()=>{
 const dir=__dirname,html=fs.readFileSync(path.join(dir,'Vocalzip_UI_Kit.html'));
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html;charset=utf-8');res.end(html)});await new Promise(r=>server.listen(4173,'127.0.0.1',r));
 const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));let assertions=0;
 const check=(v,m)=>{assert(v,m);assertions++;};const visit=async route=>{await page.goto('http://127.0.0.1:4173/#/'+route);await page.locator('#app-main').waitFor();await page.waitForFunction(()=>document.querySelector('#app-main').children.length>0);};
 fs.mkdirSync(path.join(dir,'screenshots'),{recursive:true});
 const routes=['home','songs','song/s1','library','media/m1','calendar','event/e1','lessons','lesson/l2','practice','practice/p1','homework','record','growth','settings','notifications','design-system'];
 for(const width of [320,390,430]){
  await page.setViewportSize({width,height:844});
  for(const route of routes){await visit(route);check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),width+' overflow at '+route);check(await page.locator('h1,h2').count()>0,'heading '+route);if(width===390)await page.screenshot({path:path.join(dir,'screenshots',route.replaceAll('/','-')+'.png'),fullPage:true});}
 }
 await page.setViewportSize({width:390,height:844});await visit('home');
 check(await page.locator('#app-nav a').count()===4,'four navigation tabs');check(await page.locator('#record-fab').isVisible(),'record fab visible');
 const before=await page.locator('#record-fab').boundingBox();await page.evaluate(()=>window.scrollTo(0,document.body.scrollHeight));const after=await page.locator('#record-fab').boundingBox();check(Math.abs(before.y-after.y)<1,'floating action follows viewport');
 const goal=await page.locator('.vz-goals').boundingBox();check(goal.y+goal.height<=after.y,'last goals scroll above action');
 await page.locator('#app-nav a[data-nav=songs]').click();await page.locator('#songs-search').fill('Gravity');check(await page.locator('#songs-results .list-row').count()===1,'song search');
 await page.locator('#songs-search').fill('not-found-test');check(await page.getByText('조건에 맞는 곡이 없어요').isVisible(),'empty search');
 await page.locator('[data-action=add-song]').click();await page.locator('input[name=title]').fill('<img src=x onerror=alert(1)>');await page.locator('input[name=artist]').fill('시안 테스트');await page.locator('#sheet-actions button[type=submit]').click();check(await page.locator('#songs-results img').count()===0,'escaped user title');
 await page.locator('#record-fab').click();await page.locator('#record-clock').waitFor({state:'visible'});check(await page.locator('#app-nav-space').isHidden(),'nav hidden on recording');await page.locator('[data-action=record-start]').click();await page.waitForFunction(()=>document.querySelector('#record-clock').textContent!=='00:00');await page.locator('[data-action=record-pause]').click();check((await page.locator('#record-status').innerText()).includes('잠시'),'record pause');await page.locator('[data-action=record-stop]').click();check(await page.locator('[data-action=record-save]').isVisible(),'record stop');
 await visit('practice');await page.locator('[data-action=add-practice]').click();await page.locator('input[name=minutes]').fill('25');await page.locator('textarea[name=memo]').fill('시안 테스트 연습');await page.locator('#sheet-actions button[type=submit]').click();check((await page.locator('#app-main').innerText()).includes('25분'),'practice added');
 await visit('calendar');await page.locator('[data-date="2026-11-10"]').click();check((await page.locator('#app-main').innerText()).includes('2026.11.10 일정'),'calendar day selection');
 check(await page.locator('.calendar .selected').evaluate(e=>getComputedStyle(e).backgroundColor==='rgb(122, 50, 245)'),'calendar selected state visible');
 await visit('design-system');check(await page.locator('.btn.full').first().evaluate(e=>getComputedStyle(e).backgroundColor==='rgb(122, 50, 245)'),'button primary fill visible');
 await visit('lesson/l2');await page.locator('[data-action=edit-note]').first().click();await page.locator('textarea[name=note]').fill('새 피드백');await page.locator('#sheet-actions button[type=submit]').click();check((await page.locator('.note-text').innerText())==='새 피드백','note saved');
 await visit('home');await page.locator('input[data-task=t2]').check();check((await page.locator('.vz-count').innerText())==='2 / 3 완료','goal count');
 check(errors.length===0,'no page errors: '+errors.join('\n'));
 fs.writeFileSync(path.join(dir,'QA_RESULT.json'),JSON.stringify({assertions,widths:[320,390,430],routes:routes.length,pageErrors:errors,result:'passed',limitations:['실제 iPhone/PWA/VoiceOver 미검증','운영 데이터·실제 녹음·동기화 미연결']},null,2));
 console.log('Passed',assertions,'checks across',routes.length,'routes.');await browser.close();await new Promise(r=>server.close(r));
})().catch(e=>{console.error(e);process.exit(1)});
