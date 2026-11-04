const base=require('./playwright.config.cjs');
module.exports={
 ...base,
 testMatch:['ui.spec.cjs','audio-import.spec.cjs','production.smoke.cjs'],
 timeout:60000,
 workers:2,
 webServer:undefined,
 outputDir:'production-test-results',
 reporter:[['list'],['html',{outputFolder:'production-playwright-report',open:'never'}]],
 use:{...base.use,baseURL:'https://vocalzip.yullul.com',trace:'off',screenshot:'only-on-failure'},
};
