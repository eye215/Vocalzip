const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {boot}=require('./helpers/r2-fixture.cjs');

test('deployed AI runs only on a manual click, keeps explicit disable and owner errors, and preserves records',async({page})=>{
 await boot(page);
 await page.evaluate(async()=>{
  const owner=vzipCloudUserId(),result={engineVersion:'pa-1.0.0',recordedDate:'2026-11-01',source:{id:'fixture-audio',revision:'fixture-r1'},context:{owner,source:'clean',task:'sustain',vowel:'a',environment:'fixture-mic',loudness:'normal'},parameters:{hopSeconds:.05},scope:{start:0,end:5},metrics:{hnr:{value:20,unit:'dB',confidence:'high'},rms:{value:-20,unit:'dBFS',confidence:'medium'}},quality:{state:'high'},algorithms:{hnr:'fixture'},limitations:[],frames:[]};
  await VzipPrecisionStore.append({id:'fixture-ai-report',owner,key:'fixture-ai',result});
  delete window.VZIP_PRECISION_COACH_ENABLED;
  window.vzipCloudAccessToken=async()=> 'fixture-token';
 });
 const requests=[];let denied=false;
 await page.route('**/functions/v1/vzip-precision-coach',async route=>{
  requests.push(route.request().postDataJSON());
  await route.fulfill({status:denied?403:200,contentType:'application/json',body:JSON.stringify(denied?{error:'소유자 계정과 활성 세션 권한을 확인해 주세요.'}:{sections:[{section:'stability',text:'음성 주기성의 측정 근거를 함께 확인해 주세요.',evidence:['hnr']}]})});
 });
 await page.evaluate(()=>VZ.nav('#/precision-report'));
 const button=page.locator('[data-pr-ai]'),status=page.locator('[data-pr-ai-status]');
 await expect(button).toBeVisible();expect(requests).toHaveLength(0);
 const before=await page.evaluate(async()=>({db:JSON.stringify(VZ.db),reports:JSON.stringify(await VzipPrecisionStore.list(vzipCloudUserId()))}));
 await button.click();await expect(status).toContainText('측정 근거를 인용한 AI 해석');
 await expect(page.locator('[data-pr-ai-output]')).toContainText('음성 주기성의 측정 근거');
 expect(requests).toHaveLength(1);expect(requests[0].measurements).toContainEqual({key:'hnr',value:20,unit:'dB',confidence:'high'});
 expect(JSON.stringify(requests[0])).not.toContain('fixture-audio');await expect(button).toBeEnabled();
 await page.evaluate(()=>{window.VZIP_PRECISION_COACH_ENABLED=false;});
 await button.click();await expect(status).toContainText('꺼져');expect(requests).toHaveLength(1);
 await page.evaluate(()=>{delete window.VZIP_PRECISION_COACH_ENABLED;window.vzipCloudAccessToken=async()=>null;});
 await button.click();await expect(status).toContainText('로그인을 확인');expect(requests).toHaveLength(1);
 denied=true;await page.evaluate(()=>{window.vzipCloudAccessToken=async()=> 'fixture-token';});
 await button.click();await expect(status).toContainText('소유자 계정과 활성 세션');expect(requests).toHaveLength(2);await expect(button).toBeEnabled();
 expect(await page.evaluate(async()=>({db:JSON.stringify(VZ.db),reports:JSON.stringify(await VzipPrecisionStore.list(vzipCloudUserId()))}))).toEqual(before);
 expect(page.__errors).toEqual([]);
});
