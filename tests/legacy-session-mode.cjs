// Existing fixtures exercise pre-enrollment compatibility. New session tests explicitly enable the feature.
module.exports=test=>test.beforeEach(async({page})=>{await page.addInitScript(()=>{window.VZIP_DEVICE_SESSIONS_ENABLED=false;});});
