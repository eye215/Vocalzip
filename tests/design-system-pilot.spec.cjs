const {test,expect}=require('@playwright/test');
const KEY='vocal-zip_mvp_v1';
const seed=()=>({
  categories:[],
  songs:[{id:'song-next',title:'Defying Gravity',show:'Wicked'}],
  lessons:[{id:'lesson-next',status:'scheduled',date:'2099-11-10',startTime:'15:00',endTime:'16:00',teacher:'보컬 선생님',place:'제1연습실',songId:'song-next',feedback:''}],
  practices:[],assignments:[],comparisonReports:[]
});
const sdk="window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'archive-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'test-token'}}})},from:table=>{const c={};let method='select';for(const k of ['select','eq','is','order','range','limit','in','upsert','update','delete','maybeSingle'])c[k]=()=>c;for(const k of ['upsert','update'])c[k]=v=>{method=k;if(table==='vocal_data'){(window.__archiveWrites||=[]).push(v.payload);window.__archiveRemote=v.payload}return c};c.then=r=>r({data:table==='vocal_data'&&method==='select'&&window.__archiveRemote?{payload:window.__archiveRemote,updated_at:null}:method==='update'?[{user_id:'archive-user'}]:[],error:null});return c},storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/file.wav'}})})}})};";
async function boot(page){
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.__pilotErrors=errors;
  await page.route('**/supabase.min.js',r=>r.fulfill({contentType:'application/javascript',body:sdk}));
  await page.route('**/r2-config.js*',r=>r.fulfill({contentType:'application/javascript',body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js',r=>r.fulfill({contentType:'application/javascript',body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**',r=>r.abort());
  await page.addInitScript(([key,data])=>{if(!sessionStorage.getItem('vzip-ds-pilot-seed')){localStorage.setItem(key,JSON.stringify(data));sessionStorage.setItem('vzip-ds-pilot-seed','1')}},[KEY,seed()]);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-auth-screen')).toBeHidden();
}
test.describe('Phase 19: migrate only next lesson card',()=>{
  test('preserves lesson link, original quick actions, task and recording nav',async({page})=>{
    await boot(page);
    const card=page.locator('.vz-lesson-hero');
    await expect(card).toHaveCount(1);
    await expect(card).toHaveAttribute('href','#/lesson/lesson-next');
    await expect(card).toContainText('다음 레슨');
    await expect(card).toContainText('제1연습실');
    await expect(card).toContainText('Defying Gravity');
    await expect(page.locator('[data-billing-left]')).toHaveCount(1);
    await expect(page.locator('.quick')).toBeVisible();
    await expect(page.locator('.v-nav a[data-nav=record]')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
    const radius=await card.evaluate(el=>getComputedStyle(el).borderTopLeftRadius);
    expect(radius).toBe('32px');
    expect(page.__pilotErrors).toEqual([]);
  });
  for(const width of [320,390,430]){
    test('next lesson card fits '+width+'px and other cards retain original structure',async({page},testInfo)=>{
      await page.setViewportSize({width,height:844});
      await boot(page);
      await expect(page.locator('.vz-lesson-hero')).toBeVisible();
      await expect(page.locator('.card.accent.lesson-hero')).toHaveCount(0);
      await expect(page.locator('.quick')).toBeVisible();
      const dims=await page.evaluate(()=>{
        const card=document.querySelector('.vz-lesson-hero').getBoundingClientRect();
        return {left:card.left,right:card.right,scroll:document.documentElement.scrollWidth,width:window.innerWidth};
      });
      expect(dims.left).toBeGreaterThanOrEqual(-1);
      expect(dims.right).toBeLessThanOrEqual(width+1);
      expect(dims.scroll).toBeLessThanOrEqual(width+1);
      await page.screenshot({path:'test-results/pilot-'+testInfo.project.name+'-'+width+'x844.png',fullPage:true,animations:'disabled'});
    });
  }
});
