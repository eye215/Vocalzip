const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
 testDir:'./tests',testMatch:'billing.spec.cjs',fullyParallel:true,forbidOnly:!!process.env.CI,
 retries:0,workers:2,timeout:45000,expect:{timeout:7000},
 reporter:[['list'],['html',{outputFolder:'billing-report',open:'never'}]],outputDir:'billing-results',
 use:{baseURL:'http://127.0.0.1:4173',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[
 {name:'chromium-mobile',use:{browserName:'chromium',viewport:{width:390,height:844},isMobile:true,hasTouch:true}},
 {name:'webkit-mobile',use:{browserName:'webkit',viewport:{width:390,height:844},isMobile:true,hasTouch:true}},
 {name:'chromium-desktop',use:{browserName:'chromium',viewport:{width:1280,height:900}}}
 ],
 webServer:{command:'python3 -m http.server 4173 --bind 127.0.0.1',cwd:'..',url:'http://127.0.0.1:4173/billing/',reuseExistingServer:!process.env.CI}
});
