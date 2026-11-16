// Legacy fixtures keep their original UI/auth contract; dedicated home/session suites enable the new flows.
module.exports=(test,{approvedHome=false}={})=>test.beforeEach(async({context},info)=>{
 const home=typeof approvedHome==='function'?approvedHome(info):approvedHome;
 await context.addInitScript(home=>{window.VZIP_DEVICE_SESSIONS_ENABLED=false;window.VZIP_APPROVED_HOME_ENABLED=home;},home);
 // The import worker loads the pinned Mediabunny parser from the CDN for every file it inspects. With VZ_MEDIABUNNY
 // (CI sets it) every spec gets the local copy instead, so no test waits on a third-party server: one stalled CDN
 // request held "파일 확인 중 1/10" for the worker's whole 30-second limit and failed the bulk upload test.
 if(process.env.VZ_MEDIABUNNY)await context.route('**/mediabunny@1.65.1/dist/bundles/mediabunny.min.mjs',route=>route.fulfill({path:process.env.VZ_MEDIABUNNY,contentType:'text/javascript'}));
});
