const {test}=require('@playwright/test');
async function probe(page){
 await page.route('https://cache.test/**',r=>r.fulfill({contentType:'text/html',body:'<p>Cache test without application code</p>'}));
 await page.goto('https://cache.test/');
 const before=await page.evaluate(async()=>{const c=await caches.open('probe');await c.put('https://other.invalid/pdf',new Response('pdf bytes'));return (await c.keys()).map(k=>k.url)});
 await page.reload();
 const after=await page.evaluate(async()=>(await (await caches.open('probe')).keys()).map(k=>k.url));
 return {before,after};
}
test('compare ephemeral and persistent WebKit Cache Storage without app code',async({page,browserName},info)=>{
 console.log('CACHE EPHEMERAL',JSON.stringify(await probe(page)));
 const context=await require('playwright')[browserName].launchPersistentContext(info.outputPath('profile'),{headless:true});
 try{console.log('CACHE PERSISTENT',JSON.stringify(await probe(await context.newPage())));}finally{await context.close();}
});
