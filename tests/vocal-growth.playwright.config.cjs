const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
 testDir:__dirname,
 testMatch:'vocal-growth-browser.spec.js',
 timeout:20000,
 expect:{timeout:5000},
 retries:0,
 workers:1,
 reporter:'line',
 use:{browserName:process.env.VZIP_TEST_BROWSER==='webkit'?'webkit':'chromium',headless:true},
});
