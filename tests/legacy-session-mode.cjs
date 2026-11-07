// Legacy fixtures keep their original UI/auth contract; dedicated home/session suites enable the new flows.
module.exports=(test,{approvedHome=false}={})=>test.beforeEach(async({context},info)=>{
 const home=typeof approvedHome==='function'?approvedHome(info):approvedHome;
 await context.addInitScript(home=>{window.VZIP_DEVICE_SESSIONS_ENABLED=false;window.VZIP_APPROVED_HOME_ENABLED=home;},home);
});
