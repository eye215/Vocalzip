const {test,expect}=require('@playwright/test'),fs=require('node:fs');
require('./legacy-session-mode.cjs')(test);
const {boot,wav}=require('./helpers/r2-fixture.cjs');
async function go(page){await boot(page);await page.evaluate(()=>VZ.nav('#/precision-report'));await expect(page.locator('[data-precision-report]')).toContainText('원본을 보존');}
const combined=fs.existsSync(require('node:path').join(__dirname,'../app/precision-acoustics.js'));
test('precision navigation stays in the analysis hub and lab, outside the saved report archive',async({page})=>{
 await boot(page);
 await page.evaluate(()=>{VZ.db.comparisonReports=[{id:'fixture-saved-report',kind:'vocal-lab',songId:'s1',song:'가짜 곡',mediaIds:['fixture-take'],created:Date.now()}];VZ.nav('#/lab-reports');});
 await expect(page.locator('.vl-reports .vl-report')).toHaveCount(1);
 await expect(page.locator('[data-precision-lab-entry]')).toHaveCount(0);
 await page.evaluate(()=>VZ.nav('#/vocal-lab/s1'));
 await expect(page.locator('[data-lab] [data-precision-lab-entry]')).toHaveCount(1);
 await page.locator('[data-precision-lab-entry]').click();await expect(page.locator('[data-precision-report]')).toBeVisible();
 await page.evaluate(()=>VZ.nav('#/vocal-analysis'));
 const link=page.locator('[data-precision-report-entry]');await expect(link).toHaveCount(1);await expect(link).toHaveAttribute('href','#/precision-report');
 expect(await link.evaluate(el=>!!el.parentElement.querySelector('[data-hub-reports]'))).toBe(true);
 expect(page.__errors).toEqual([]);
});
test('empty report and independent module failure never invent results or change existing data',async({page})=>{
 await go(page);const before=await page.evaluate(()=>JSON.stringify(VZ.db));await expect(page.locator('[data-pr-result]')).toContainText('아직 측정 없음');
 await expect(page.locator('[data-pr-tab]')).toHaveCount(0);expect(await page.evaluate(()=>JSON.stringify(VZ.db))).toBe(before);expect(page.__errors).toEqual([]);
});
test('account partition, append-only results, charts and null gaps work at 320/375, unsafe AI response is refused',async({page},info)=>{
 await go(page);const before=await page.evaluate(()=>JSON.stringify(VZ.db));
 await page.evaluate(async()=>{
  const owner=window.vzipCloudUserId(),result={engineVersion:'pa-1.0.0',analyzedAt:'2026-11-01T12:00:00Z',recordedDate:'2026-11-01',source:{id:'synthetic',revision:'synthetic-r1',sampleRate:16000},context:{owner,source:'clean',task:'sustain',vowel:'a',environment:'fixture-mic',loudness:'normal'},parameters:{hopSeconds:.05},scope:{start:0,end:5},metrics:{f0:{value:220,unit:'Hz',confidence:'medium'},rms:{value:-20,unit:'dBFS',confidence:'medium'},hnr:{value:20,unit:'dB',confidence:'medium'},cpp:{value:null,unit:'log-amplitude cepstral units',confidence:'withheld'}},quality:{state:'high'},algorithms:{hnr:'fixture'},limitations:['synthetic-only'],frames:Array.from({length:20},(_,i)=>({t:i*.05,f0:220,rms:i===10?null:-20+i*.1,hnr:20+i*.1,tilt:-8+i*.1,spectralSlice:[1,2,3,4]})),resonance:{f1f2:[{f1:600,f2:1200,vowel:'a'}],rows:[],zones:[]},transitions:{candidates:[]}};
  await VzipPrecisionStore.append({id:'fixture-report',owner,key:'synthetic-key',result});
  await VzipPrecisionStore.append({id:'other-owner',owner:'unrelated',key:'other',result});
  window.__partitionCount=(await VzipPrecisionStore.list(owner)).length;
 });
 await page.reload();await expect(page.locator('[data-pr-result]')).toHaveValue('fixture-report');expect(await page.evaluate(()=>window.__partitionCount)).toBeUndefined();
 expect(await page.evaluate(async()=> (await VzipPrecisionStore.list(vzipCloudUserId())).length)).toBe(1);
 for(const [width,height] of [[320,640],[375,812]]){
  await page.setViewportSize({width,height});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBe(width);
  for(const tab of ['resonance','stability','comparison']){await page.locator('[data-pr-tab='+tab+']').click();await expect(page.locator('[data-precision-report]')).toContainText('측정');}
  await page.locator('[data-pr-tab=resonance]').click();await expect(page.locator('svg')).not.toHaveCount(0);
  await page.screenshot({path:info.outputPath('precision-report-'+width+'.png'),fullPage:true});
 }
 await page.evaluate(()=>{window.VZIP_PRECISION_COACH_ENABLED=true;window.vzipCloudAccessToken=async()=> 'fixture-token';});
 await page.route('**/functions/v1/vzip-precision-coach',route=>route.fulfill({contentType:'application/json',body:JSON.stringify({sections:[{section:'overview',text:'성대 접촉률 90%',evidence:['hnr']}]})}));
 await page.locator('[data-pr-ai]').click();await expect(page.locator('[data-pr-ai-status]')).toContainText('unsafe AI claim');await expect(page.locator('[data-pr-ai-output]')).toBeEmpty();
 expect(await page.evaluate(()=>JSON.stringify(VZ.db))).toBe(before);expect(page.__errors).toEqual([]);
});
test('combined: real synthetic PCM -> legacy F0 -> spectral/LPC/change modules -> archive, cache and cancellation',async({page})=>{
 test.skip(!combined,'PR1–3 dependencies are tested together in the integration worktree');
 await go(page);const audio=wav(3,16000).toString('base64');
 const result=await page.evaluate(async audio=>{
  const bytes=Uint8Array.from(atob(audio),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'audio/wav'})),item={id:'synthetic-integration',created:Date.now(),durationSeconds:3,recordedDate:'2026-11-01',songId:''},before=JSON.stringify(VZ.db);
  VZ.media.src=async()=>({url,revoke:false});
  const context={source:'clean',task:'sustain',vowel:'a',environment:'fixture',loudness:'normal'};
  const a=await VZ.precisionAnalyze(item,{context}),b=await VZ.precisionAnalyze(item,{context});
  const controller=new AbortController();controller.abort();let aborted=false;try{await VZ.precisionAnalyze(item,{context,signal:controller.signal});}catch(e){aborted=e.name==='AbortError';}
  const during=new AbortController(),pending=VZ.precisionAnalyze(item,{context,force:true,signal:during.signal});setTimeout(()=>during.abort(),1);let midAbort=false;try{await pending;}catch(e){midAbort=e.name==='AbortError';}
  const segment=await VZ.precisionAnalyze(item,{context,start:1,end:2.5});
  URL.revokeObjectURL(url);return {a,b,aborted,midAbort,segment,before,after:JSON.stringify(VZ.db),stored:(await VzipPrecisionStore.list(vzipCloudUserId())).length};
 },audio);
 expect(result.a.metrics.f0.value).toBeGreaterThan(100);expect(result.a.legacy.version).toBe(2);expect(result.a.resonance.version).toBe('pr-1.0.0');expect(result.a.transitions.version).toBe('pt-1.0.0');
 expect(result.b.fromCache).toBe(true);expect(result.stored).toBe(2);expect(result.aborted).toBe(true);expect(result.midAbort).toBe(true);expect(result.segment.frames[0].t).toBeGreaterThanOrEqual(1);expect(result.after).toBe(result.before);expect(page.__errors).toEqual([]);
});
test('independent: absent engine dependencies fail without saving or modifying original records',async({page})=>{
 test.skip(combined,'The integration worktree has the actual engines');await go(page);const audio=wav(2,16000).toString('base64');
 const result=await page.evaluate(async audio=>{const before=JSON.stringify(VZ.db),url=URL.createObjectURL(new Blob([Uint8Array.from(atob(audio),c=>c.charCodeAt(0))],{type:'audio/wav'}));VZ.media.src=async()=>({url});let failed=false;try{await VZ.precisionAnalyze({id:'missing-engine',durationSeconds:2,recordedDate:'2026-11-01'});}catch{failed=true;}URL.revokeObjectURL(url);return {before,after:JSON.stringify(VZ.db),failed,count:(await VzipPrecisionStore.list(vzipCloudUserId())).length};},audio);
 expect(result.failed).toBe(true);expect(result.count).toBe(0);expect(result.after).toBe(result.before);expect(page.__errors).toEqual([]);
});
