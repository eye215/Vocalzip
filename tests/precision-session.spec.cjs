const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {boot,wav}=require('./helpers/r2-fixture.cjs');
async function start(page){await boot(page);await page.evaluate(()=>VZ.nav('#/precision-measurement'));await page.locator('[name=environment]').fill('가짜 마이크 환경');await page.locator('[name=clean]').check();await page.getByRole('button',{name:'측정 준비',exact:true}).click();}
test('measurement route works at small widths, persists only synthetic takes and retries analysis without rerecording',async({page},info)=>{
 await start(page);
 for(const [width,height] of [[320,640],[375,812]]){
  await page.setViewportSize({width,height});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  await page.screenshot({path:info.outputPath('measurement-'+width+'.png'),fullPage:true});
 }
 const before=await page.evaluate(()=>JSON.stringify(VZ.db)),audio=wav(5,16000).toString('base64');
 await page.evaluate(audio=>{
  window.__syntheticSaves=[];window.__captureCount=0;window.__failAnalysis=true;
  VZ.media.capture=async()=>{window.__captureCount++;return {start(){},cancel(){},stop:async()=>({blob:new Blob([Uint8Array.from(atob(audio),c=>c.charCodeAt(0))],{type:'audio/wav'}),durationSeconds:5,type:'audio/wav'})};};
  VZ.media.saveBlob=async item=>{__syntheticSaves.push(item);return item;};VZ.media.list=async()=>__syntheticSaves;
  VZ.precisionAnalyze=async()=>{if(__failAnalysis)throw Error('fixture unavailable');return {metrics:{f0:{value:220}},quality:{state:'high'}};};
 },audio);
 await page.getByRole('button',{name:'녹음 시작',exact:true}).click();await page.getByRole('button',{name:'여기까지 녹음하고 보관'}).click();
 await expect(page.locator('[data-precision-error]')).toContainText('분석하지 못했어요');
 await page.evaluate(()=>{__failAnalysis=false;});await page.getByRole('button',{name:'보관된 녹음 분석'}).click();await expect(page.locator('[data-precision-error]')).toContainText('과제 분석을 보관');
 expect(await page.evaluate(()=>__captureCount)).toBe(1);expect(await page.evaluate(()=>__syntheticSaves.length)).toBe(1);
 expect(await page.evaluate(()=>JSON.stringify(VZ.db))).toBe(before);
 await page.reload();await expect(page.locator('[data-precision-session]')).toContainText('완료');
 expect(page.__errors).toEqual([]);
});
test('permission refusal and leaving preserve the uncompleted task and existing data',async({page})=>{
 await start(page);const before=await page.evaluate(()=>JSON.stringify(VZ.db));
 await page.evaluate(()=>{VZ.media.capture=async()=>{throw new DOMException('fixture refusal','NotAllowedError');};});
 await page.getByRole('button',{name:'녹음 시작',exact:true}).click();await expect(page.locator('[data-precision-error]')).toContainText('권한이 거절');
 await expect(page.locator('[data-precision-session]')).toContainText('0 / 20');expect(await page.evaluate(()=>JSON.stringify(VZ.db))).toBe(before);
 // 성장 › 연구소 lists 발성 정밀 측정 as its own row (성장 개편 안 B, phase 4): it is in the tab as drawn — the same turn
 // the address changes, nothing added to the list afterwards — and says how far the measurement is.
 expect(await page.evaluate(()=>{location.hash='#/growth-lab';VZ.render();
  const row=document.querySelector('#view [data-lab-group="deep"] a[data-lab-tool="precision"]');return row&&{href:row.getAttribute('href'),title:row.querySelector('.item-title').textContent,sub:row.querySelector('.item-sub').textContent,state:row.querySelector('[data-lab-state]').textContent};}))
  .toEqual({href:'#/precision-measurement',title:'발성 정밀 측정',sub:'편안한 음역에서 8가지 과제로 목소리를 재요',state:'과제 0/20 완료'});
 await page.waitForTimeout(300);await expect(page.locator('[data-precision-entry]')).toHaveCount(0);await expect(page.locator('[data-lab-tool="precision"]')).toHaveCount(1);
 expect((await page.locator('[data-lab-tool="precision"]').boundingBox()).height).toBeGreaterThanOrEqual(44);
 await page.locator('[data-lab-tool="precision"]').click();await expect(page).toHaveURL(/#\/precision-measurement$/);
 await expect(page.locator('[data-precision-session]')).toContainText('0 / 20');
 // The former 보컬 트레이닝 address no longer shows it (practice is on 오늘).
 await page.evaluate(()=>VZ.nav('#/vocal-training'));await expect(page).toHaveURL(/#\/home$/);await expect(page.locator('[data-precision-entry]')).toHaveCount(0);
 expect(page.__errors).toEqual([]);
});
test('pagehide stops and preserves a partial synthetic take without completing or timing the task',async({page})=>{
 await start(page);await page.evaluate(()=>{window.__partial=[];VZ.media.capture=async()=>({start(){},cancel(){throw Error('must preserve');},stop:async()=>({blob:new Blob(['fake audio only'],{type:'audio/wav'}),durationSeconds:1,type:'audio/wav'})});VZ.media.saveBlob=async item=>{__partial.push(item);return item;};});
 const before=await page.evaluate(()=>JSON.stringify(VZ.db));await page.getByRole('button',{name:'녹음 시작',exact:true}).click();await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
 await expect(page.locator('[data-precision-error]')).toContainText('화면을 벗어나기 전까지');expect(await page.evaluate(()=>__partial.length)).toBe(1);
 await expect(page.locator('[data-precision-session]')).toContainText('0 / 20');expect(await page.evaluate(()=>JSON.stringify(VZ.db))).toBe(before);expect(page.__errors).toEqual([]);
});
test('quota failure while saving analysis progress releases controls and preserves the saved take for retry',async({page})=>{
 await start(page);
 await page.evaluate(()=>{
  window.__quotaSaves=[];window.__analysisCalls=0;window.__quota=false;
  const set=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(window.__quota&&String(k).includes('vzip_precision_session:'))throw new DOMException('fixture quota','QuotaExceededError');return set.call(this,k,v);};
  VZ.media.capture=async()=>({start(){},cancel(){},stop:async()=>({blob:new Blob(['synthetic fixture'],{type:'audio/wav'}),durationSeconds:2,type:'audio/wav'})});
  VZ.media.saveBlob=async item=>{__quotaSaves.push(item);return item;};VZ.media.list=async()=>__quotaSaves;
  VZ.precisionAnalyze=async()=>{__analysisCalls++;throw Error('fixture analysis not ready');};
 });
 await page.getByRole('button',{name:'녹음 시작',exact:true}).click();await page.getByRole('button',{name:'여기까지 녹음하고 보관'}).click();
 await expect(page.locator('[data-precision-error]')).toContainText('분석하지 못했어요');
 await page.evaluate(()=>{__quota=true;});await page.getByRole('button',{name:'보관된 녹음 분석'}).click();
 await expect(page.locator('[data-precision-error]')).toContainText('저장 공간');
 await expect(page.getByRole('button',{name:'보관된 녹음 분석'})).toBeEnabled();expect(await page.evaluate(()=>__quotaSaves.length)).toBe(1);
 await page.evaluate(()=>{__quota=false;VZ.precisionAnalyze=async()=>({metrics:{f0:{value:220}},quality:{state:'high'}});});
 await page.getByRole('button',{name:'보관된 녹음 분석'}).click();await expect(page.locator('[data-precision-error]')).toContainText('과제 분석을 보관');
 expect(await page.evaluate(()=>__quotaSaves.length)).toBe(1);expect(page.__errors).toEqual([]);
});
