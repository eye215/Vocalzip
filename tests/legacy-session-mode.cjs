// Existing fixtures exercise pre-enrollment compatibility, including additional tabs and frames.
// New account-session tests do not load this helper and keep enforcement enabled.
module.exports=test=>test.beforeEach(async({context})=>{await context.addInitScript(()=>{window.VZIP_DEVICE_SESSIONS_ENABLED=false;});});
