// Offline launch: the service worker keeps the app's own files, and never serves an old app while online.
const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
// Let context.route answer the worker's own requests too (Chromium).
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS='1';
test.use({serviceWorkers:'allow'});
const stub="window.__up=[];window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},\n storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},\n from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=(...a)=>{if(m==='upsert')window.__up.push(a[0]);return c};c.then=r=>r({data:[],error:null});return c}})};";
const cors={'Access-Control-Allow-Origin':'*'};
async function boot(page,context){
 // The worker fetches the pinned CDN libraries itself (CORS): answer them here, and keep Supabase unreachable.
 await context.route('**/supabase.min.js',r=>r.fulfill({contentType:'application/javascript',headers:cors,body:stub}));
 await context.route('**/tus.min.js',r=>r.fulfill({contentType:'application/javascript',headers:cors,body:'window.tus={}'}));
 await context.route('**/*.supabase.co/**',r=>r.abort());
 await page.addInitScript(()=>{if(!sessionStorage.getItem('seed')){localStorage.setItem('vocal-zip_mvp_v1',JSON.stringify({categories:[],songs:[{id:'s1',title:'지금 이 순간'}],lessons:[],assignments:[],practices:[],comparisonReports:[]}));sessionStorage.setItem('seed','1')}});
 await page.goto('/?source=home');await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
}
const keptUrls=page=>page.evaluate(async()=>{const names=(await caches.keys()).filter(n=>n.startsWith('vzip-shell-'));const out=[];for(const n of names)for(const r of await (await caches.open(n)).keys())out.push(r.url);return out});

test('after one online visit the app opens with no network and shows the offline notice',async({page,context,browserName})=>{
 test.skip(browserName!=='chromium','service worker network control is Chromium-only in this suite');
 await boot(page,context);
 const scripts=await page.evaluate(()=>[...document.querySelectorAll('script[src],link[rel=stylesheet][href]')].map(n=>n.src||n.href));
 await expect.poll(async()=>{const urls=new Set(await keptUrls(page));return scripts.filter(u=>!urls.has(u)).length},{timeout:20000}).toBe(0);
 const urls=await keptUrls(page);
 expect(urls).toContain(new URL('/',page.url()).href);                         // the page itself, without ?source=home
 expect(urls.some(u=>u.endsWith('/vendor/phosphor/Phosphor.woff2'))).toBe(true); // icon font named by a stylesheet
 expect(urls.filter(u=>/supabase\.co|workers\.dev|share-inbox|__vzip_media__|\.(wav|mp3|m4a|mp4|mov|flac|pdf)(\?|$)/.test(u))).toEqual([]);
 await context.setOffline(true);
 await page.reload();
 await expect(page.locator('#top h1')).toBeVisible();await expect(page.locator('.v-nav a[data-nav=songs]')).toBeVisible();
 await expect(page.locator('#vz-offline')).toContainText('오프라인');
 expect(await page.evaluate(()=>typeof window.VZ?.render==='function'&&!!window.supabase)).toBe(true);
 await page.locator('.v-nav a[data-nav=songs]').click();await expect(page.locator('#view')).toContainText('지금 이 순간');
 // A page that was never visited is not invented from the cache.
 expect(await page.evaluate(()=>fetch('no-such-page.html').then(r=>r.status,()=>'failed'))).toBe('failed');
});

test('online: the page comes from the network, a changed ?v= fetches the new file and drops the old one',async({page,context,browserName})=>{
 test.skip(browserName!=='chromium','service worker network control is Chromium-only in this suite');
 await boot(page,context);
 await expect.poll(async()=>(await keptUrls(page)).some(u=>/\/app\/app\.js\?v=/.test(u)),{timeout:20000}).toBe(true);
 const old=(await keptUrls(page)).find(u=>/\/app\/metric-help\.js\?v=/.test(u));expect(old).toBeTruthy();
 // Same version, file changed on the server without a ?v= bump: online the server's file wins (never stuck on the kept copy).
 let hits=0;await context.route('**/app/metric-help.js?v=*',r=>{hits++;return r.fulfill({contentType:'application/javascript',body:'window.__metricHelp="'+new URL(r.request().url()).searchParams.get('v')+'"'})});
 expect(await page.evaluate(u=>fetch(u,{cache:'no-store'}).then(r=>r.text()),old)).toContain('__metricHelp');expect(hits).toBe(1);
 // New version: fetched from the network, kept, and the old version is removed.
 const next=old.replace(/\?v=.*/,'?v=next-test');
 expect(await page.evaluate(u=>fetch(u).then(r=>r.text()),next)).toContain('next-test');expect(hits).toBe(2);
 await expect.poll(async()=>(await keptUrls(page)).filter(u=>u.includes('/app/metric-help.js'))).toEqual([next]);
 // The page itself is always asked from the network while online.
 const html=await (await context.request.get('/')).text();
 await context.route(u=>u.pathname==='/',r=>r.fulfill({contentType:'text/html',body:html.replace('<title>','<meta name="vz-test" content="new"><title>')}));
 await page.reload();await expect(page.locator('meta[name=vz-test]')).toHaveAttribute('content','new');
 await expect(page.locator('#top h1')).toBeVisible();
 // POST, range requests and other origins are left alone.
 expect(await page.evaluate(()=>fetch('icon.svg',{headers:{Range:'bytes=0-9'}}).then(r=>r.status))).toBeGreaterThanOrEqual(200);
 expect((await keptUrls(page)).filter(u=>!u.startsWith(new URL('/',page.url()).origin)&&!u.startsWith('https://cdn.jsdelivr.net/npm/'))).toEqual([]);
});
