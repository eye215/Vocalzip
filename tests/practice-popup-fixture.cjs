// Shared fixture for the result popup (app/today-practice.js): seeded days, a fake clock, no live Supabase or media.
const {expect} = require('@playwright/test');
const KEY = 'vocal-zip_mvp_v1';
const NOW = '2026-11-04T12:00:00.000Z';
const TODAY = '2026-11-04'; // a Wednesday: the seven days are 10-29 (목) … 11-04 (수), across two weeks
const day = n => { const d = new Date(2026, 10, 4 + n, 12); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); };
/** past = minutes for the six days before today, oldest first; today = minutes already recorded today. */
const seed = ({target = 40, today = 0, past = [0,0,0,0,0,0]} = {}) => ({
  categories:[], songs:[{id:'s1', title:'This Is the Moment', show:'지킬 앤 하이드'}], lessons:[], assignments:[], performances:[], comparisonReports:[],
  practices:[...past.map((minutes,i) => ({id:'past'+i, date:day(i - 6), manualMinutes:minutes, songId:'s1', practiceMode:'song'})).filter(p => p.manualMinutes > 0),
    ...(today > 0 ? [{id:'today0', date:TODAY, manualMinutes:today, songId:'s1', practiceMode:'song'}] : [])],
  dailyGoals:[{id:'g1', date:TODAY, title:'호흡을 길게 유지하기', source:'personal', completed:false, order:0}],
  practicePlans:[], settings:{dailyTargetMinutes:target}
});
function installSDK() {
  const clone = x => x == null ? x : JSON.parse(JSON.stringify(x));
  const row = () => JSON.parse(sessionStorage.getItem('popup-server-row') || 'null');
  const client = {
    auth:{
      getUser:async () => ({data:{user:{id:'home-qa-user',email:'home@example.invalid',user_metadata:{name:'김유리'}}},error:null}),
      getSession:async () => ({data:{session:{access_token:'fixture-token'}}}),
      onAuthStateChange:() => ({data:{subscription:{unsubscribe(){}}}})
    },
    storage:{from:() => ({createSignedUrl:async () => ({data:{signedUrl:'/fixture.wav'},error:null})})},
    async rpc(){return {data:null,error:null};},
    from(table) {
      const q = {method:'read',filters:{},single:false}, chain = {};
      chain.select = columns => {q.columns=columns;return chain;};
      chain.eq = chain.is = (key,value) => {q.filters[key]=value;return chain;};
      for (const method of ['order','range','limit','in']) chain[method] = () => chain;
      chain.maybeSingle = () => {q.single=true;return chain;};
      for (const method of ['upsert','insert','update','delete']) chain[method] = (body,options) => {Object.assign(q,{method,body,options});return chain;};
      chain.then = (resolve,reject) => Promise.resolve().then(() => {
        if (table !== 'vocal_data') return {data:q.single?null:[],error:null};
        const current = row();
        if (q.method === 'read') {
          const value = q.columns?.startsWith('ids:') ? (current ? {ids:current.payload?.deleted?.media || []}:null) : current;
          return {data:q.single?clone(value):(value?[clone(value)]:[]),error:null};
        }
        if (q.method === 'update' && (!current || q.filters.updated_at !== current.updated_at)) return {data:[],error:null};
        if ((q.method === 'upsert' || q.method === 'insert') && current && q.options?.ignoreDuplicates) return {data:[],error:null};
        sessionStorage.setItem('popup-server-row',JSON.stringify({payload:q.body.payload,updated_at:q.body.updated_at}));
        return {data:[{user_id:'home-qa-user'}],error:null};
      }).then(resolve,reject);
      return chain;
    }
  };
  window.supabase = {createClient:() => client};
}
/** Opens home with the seeded data. The clock is installed (running) so a test can pause it and step the motion. */
async function boot(page, value = seed()) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.clock.install({time:new Date(NOW)});
  await page.addInitScript(({key,value}) => {
    if (!sessionStorage.getItem('popup-seeded')) {
      localStorage.setItem(key,JSON.stringify(value));
      sessionStorage.setItem('popup-server-row',JSON.stringify({payload:value,updated_at:'2026-11-04T11:00:00.000Z'}));
      sessionStorage.setItem('popup-seeded','1');
    }
  }, {key:KEY,value});
  await page.route('**/supabase.min.js', route => route.fulfill({contentType:'application/javascript',body:'('+installSDK.toString()+')();'}));
  await page.route('**/r2-config.js*', route => route.fulfill({contentType:'application/javascript',body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', route => route.fulfill({contentType:'application/javascript',body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', route => route.abort());
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => !!window.VZ?.db && typeof window.VZ?.change === 'function' && typeof window.VZ?.todayPracticePopup === 'function')).toBe(true);
  await expect(page.locator('.vz-student-home')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}
/** Saves `add` minutes for today (as a goal or a set would) and then opens the popup, exactly in that order.
 * add = 0 opens it without new minutes (a goal ticked with 건너뛰기). window.__closed counts onClose calls. */
const openPopup = (page, add = 0, extra = {}) => page.evaluate(({add, extra, today}) => {
  window.__closed = window.__closed || 0;
  if (add > 0 && !VZ.change(db => { db.practices.push({id:'add' + db.practices.length, date:today, manualMinutes:add, songId:'s1', practiceMode:'song'}); }, {silent:true})) throw Error('save failed');
  VZ.todayPracticePopup({...(add > 0 ? {addedMinutes:add} : {}), ...extra, onClose:() => { window.__closed++; }});
}, {add, extra, today:TODAY});
module.exports = {KEY, NOW, TODAY, day, seed, boot, openPopup};
