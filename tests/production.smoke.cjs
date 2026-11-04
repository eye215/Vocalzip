const {test,expect}=require('@playwright/test');
test('Published app boots with the real authentication SDK and a fresh signed-out session',async({page},testInfo)=>{
 const errors=[],failed=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('requestfailed',request=>{if(/supabase\.min\.js|tus\.min\.js|cloud-sync\.js|practice-capture\.js/.test(request.url()))failed.push(request.failure()?.errorText)});
 await page.goto('/?verify='+Date.now());
 await expect(page.locator('#vzip-auth-screen')).toBeVisible();
 await expect(page.locator('#cloud-email')).toBeVisible();
 await expect(page.locator('#cloud-login')).toBeEnabled();
 await expect(page.locator('#vzip-auth-message')).toContainText('로그인');
 const modules=await page.evaluate(()=>({
  sdk:typeof window.supabase?.createClient,
  tus:typeof window.tus?.Upload,
  importer:typeof window.vzipCloudImport,
  chunks:typeof window.VzipChunks?.response,
  lessonControls:document.querySelectorAll('#vzip-lesson-capture [data-kind]').length,
  practiceMultiple:document.querySelector('#practice-attachments')?.multiple,
  libraryMultiple:document.querySelector('#vzip-hub-upload')?.multiple
 }));
 expect(modules).toEqual({sdk:'function',tus:'function',importer:'function',chunks:'function',lessonControls:2,practiceMultiple:true,libraryMultiple:true});
 expect(errors).toEqual([]);expect(failed).toEqual([]);
 await testInfo.attach('published-login',{body:await page.screenshot({fullPage:true}),contentType:'image/png'});
});
