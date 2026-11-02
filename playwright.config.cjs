const {defineConfig} = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests', testMatch: 'ui.spec.cjs', timeout: 30000,
  reporter: [['list'], ['html', {open: 'never'}]],
  use: {baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure', screenshot: 'only-on-failure'},
  projects: [
    {name:'chromium-mobile',use:{browserName:'chromium',viewport:{width:390,height:844},isMobile:true,hasTouch:true,
      launchOptions:{args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']}}},
    {name:'webkit-mobile',use:{browserName:'webkit',viewport:{width:390,height:844},isMobile:true,hasTouch:true}},
    {name:'chromium-desktop',use:{browserName:'chromium',viewport:{width:1280,height:900},
      launchOptions:{args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']}}}
  ],
  webServer: {command:'python3 -m http.server 4173 --bind 127.0.0.1',url:'http://127.0.0.1:4173',
    reuseExistingServer:!process.env.CI}
});
