// Small polish fixes from the 2026-11-13 audit: one short check per item.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const KEY = 'vocal-zip_mvp_v1';
const stub = "window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},from:()=>{const c={};for(const m of ['select','eq','is','order','range','limit','in','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};";
const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
const label = d => (d.getMonth() + 1) + '월 ' + d.getDate() + '일';
const seed = () => ({categories:[], comparisonReports:[],
  songs:[{id:'a', title:'아주 긴 노래 제목 '.repeat(8)}, {id:'b', title:'노래 B'}],
  lessons:[{id:'bill', date:day(0), startTime:'00:00', endTime:'01:00', status:'done', importedFrom:'billing', billingDeductionId:'d1', recordings:[]},
    {id:'timed', date:day(0), startTime:'10:00', endTime:'11:00', status:'scheduled', recordings:[]}],
  assignments:[{id:'late', title:'숙제', status:'active', songId:'a', startDate:day(-9), dueDate:day(-2)}],
  practices:[{id:'p0', date:day(0), songId:'', minutes:90}, {id:'p1', date:day(0), songId:'b', minutes:10}],
  performances:[{id:'show1', ownerId:'ui-test-user', title:'지킬 앤 하이드', start:'2026-10-23', end:'2026-10-25', status:'done', sessions:[{id:'s1', date:'2026-10-23', time:'19:30', number:'1회', appeared:true}], songLinks:[], assets:[]}]});
async function boot(page, hash = '#/calendar') {
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(seed())]);
  await page.goto('/' + hash);
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await expect(page.locator('#vzip-auth-screen')).toBeHidden();
}
const go = (page, hash) => page.evaluate(h => { location.hash = h; }, hash);
const currentTab = page => page.locator('.v-nav a[aria-current="page"]').getAttribute('data-nav');

test('1. settings pages keep the bottom tab the user came from', async ({page}) => {
  await boot(page, '#/calendar');
  for (const hash of ['#/settings', '#/processing-log', '#/data-export', '#/shares']) {
    await go(page, hash); await expect(page).toHaveURL(new RegExp(hash + '$'));
    expect(await currentTab(page), hash).toBe('calendar');
  }
  await go(page, '#/songs'); await expect.poll(() => currentTab(page)).toBe('songs');
  await go(page, '#/settings'); await expect(page.locator('.vz-settings')).toBeVisible();
  expect(await currentTab(page)).toBe('songs');
});

test('2. another month selects its 1st (today for this month); a stale day gives way to today', async ({page}) => {
  await boot(page);
  const head = page.locator('.vz-calendar-day-head h2'), now = new Date();
  await expect(head).toContainText(label(now));
  await page.getByRole('button', {name:'다음 달', exact:true}).click();
  await expect(head).toContainText(label(new Date(now.getFullYear(), now.getMonth() + 1, 1)));
  await expect(page.locator('.cal-day[aria-pressed="true"]')).toHaveCount(1);
  await page.getByRole('button', {name:'이전 달', exact:true}).click();
  await expect(head).toContainText(label(now));
  // After midnight: the day shown yesterday (never picked by hand) is replaced by today.
  await go(page, '#/songs'); await expect.poll(() => currentTab(page)).toBe('songs');
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9);
  await page.evaluate(t => { const Real = Date; window.Date = class extends Real { constructor(...a) { super(...(a.length ? a : [t])); } static now() { return t; } }; }, tomorrow.getTime());
  await go(page, '#/calendar');
  await expect(head).toContainText(label(tomorrow));
});

test('3. the overdue badge stays whole; the text before it ellipsizes', async ({page}) => {
  await boot(page, '#/homework');
  const badge = page.locator('.item .badge.warn'), row = page.locator('.item').filter({has:page.locator('.badge.warn')});
  await expect(badge).toHaveText('기간 지남');
  const b = await badge.boundingBox(), r = await row.locator('.item-sub').boundingBox();
  expect(b.x + b.width).toBeLessThanOrEqual(r.x + r.width + 0.5);
  expect(await badge.evaluate(n => n.scrollWidth <= n.clientWidth + 1 && n.getBoundingClientRect().width > 40)).toBe(true);
});

test('4. a lesson brought in from billing without a time reads 시간 미정', async ({page}) => {
  await boot(page);
  const rows = page.locator('.cal-own[data-kind=lesson] .item-title');
  await expect(rows).toHaveCount(2);
  await expect(page.locator('.cal-list').first()).not.toContainText('00:00');
  await expect(rows.filter({hasText:'시간 미정'})).toHaveCount(1);
  await expect(rows.filter({hasText:'10:00 – 11:00'})).toHaveCount(1);
  expect(await page.evaluate(k => JSON.parse(localStorage.getItem(k)).lessons[0].startTime, KEY)).toBe('00:00'); // stored value untouched
});

test('5. named songs lead the month summary, 곡 미지정 comes last, and it stops rotating once used', async ({page}) => {
  await boot(page);
  const spot = page.locator('.cs-spotlight');
  await expect(spot).toHaveAttribute('data-cs-song', 'b');
  await spot.click();
  await expect(page.locator('.cs-rank-row .cs-name').last()).toHaveText('곡 미지정');
  await spot.click();
  await page.waitForTimeout(4200);
  await expect(spot).toHaveAttribute('data-cs-song', 'b');
});

test('6. the day + button is clear of the floating mic, and 나의 공연 looks like the other menu rows', async ({page}) => {
  await page.setViewportSize({width:375, height:812});
  await boot(page);
  const add = page.locator('.vz-calendar-day-head [data-add]'), mic = page.getByRole('link', {name:'녹음 시작', exact:true});
  const a = await add.boundingBox(), m = await mic.boundingBox();
  expect(a.x + a.width <= m.x || a.y + a.height <= m.y || a.y >= m.y + m.height || a.x >= m.x + m.width).toBe(true);
  await add.click();
  const style = l => l.evaluate(n => { const s = getComputedStyle(n); return [s.textDecorationLine, s.color, s.fontSize, s.fontWeight, s.minHeight, s.paddingLeft].join('|'); });
  const rows = page.locator('.sheet .vz-choice');
  await expect(rows).toHaveCount(3);
  expect(await style(rows.nth(0))).toBe(await style(rows.nth(1)));
  expect(await rows.nth(0).evaluate(n => getComputedStyle(n).textDecorationLine)).toBe('none');
});

test('7. performance pages show readable dates and ask in the app popup', async ({page}) => {
  await boot(page, '#/show/show1');
  await expect(page.locator('.archive-show-date')).toContainText('10월 23일');
  await expect(page.locator('.archive-show-page')).not.toContainText(/2026-10-2\d/);
  await expect(page.locator('.archive-show-page')).toContainText('19:30');
  expect(read('app/performance-assets.js')).not.toMatch(/[^.\w]confirm\(/);
});

test('8. copy: neutral AI wording, one name for 처리 내역, a plain 로그아웃 row', async ({page}) => {
  await boot(page, '#/lesson-ai/timed');
  await expect(page.locator('[data-lesson-ai]')).toContainText('AI 서버에 보내');
  await expect(page.locator('[data-lesson-ai]')).not.toContainText('NVIDIA');
  await go(page, '#/settings');
  await expect(page.locator('[data-file-status-link] .item-title')).toHaveText('처리 내역');
  const out = page.locator('#cloud-logout');
  await expect(out).toBeVisible(); // without opening 동기화·백업 도구
  expect(await out.evaluate(n => !n.closest('details'))).toBe(true);
  expect(read('app/views-lessons.js')).not.toContain('전체 녹음에 녹음이 없어요');
});

test('9. 레슨·숙제 tabs have no enclosing card', async ({page}) => {
  await boot(page, '#/lessons');
  for (const hash of ['#/lessons', '#/homework']) {
    await go(page, hash); await expect(page).toHaveURL(new RegExp(hash + '$'));
    const seg = page.locator('#view .seg').first();
    await expect(seg).toBeVisible();
    expect(await seg.evaluate(n => { const s = getComputedStyle(n); return [s.backgroundColor, s.paddingTop, s.boxShadow, s.borderTopWidth].join('|'); }), hash).toBe('rgba(0, 0, 0, 0)|0px|none|0px');
    expect(await seg.locator('button').first().evaluate(n => n.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  }
});

test('10. iOS gets a 180px PNG home-screen icon; the manifest has PNG icons', async () => {
  const size = f => { const b = fs.readFileSync(path.join(root, f)); expect(b.subarray(1, 4).toString()).toBe('PNG'); return b.readUInt32BE(16) + 'x' + b.readUInt32BE(20); };
  expect(read('index.html')).toMatch(/<link rel="apple-touch-icon" href="apple-touch-icon\.png">/);
  expect(size('apple-touch-icon.png')).toBe('180x180');
  const icons = JSON.parse(read('manifest.webmanifest')).icons;
  for (const n of [192, 512]) { const i = icons.find(x => x.sizes === n + 'x' + n && x.type === 'image/png'); expect(i, n + 'px').toBeTruthy(); expect(size(i.src.replace(/^\//, ''))).toBe(n + 'x' + n); }
});

test('11. a saved recording carries the time recording started', async ({page}) => {
  await boot(page, '#/record');
  await page.evaluate(() => { window.__saved = null; VZ.media.saveBlob = async item => { window.__saved = {created:item.created, recordedDate:item.recordedDate}; }; });
  const main = page.locator('.rec-controls [data-main]');
  const started = Date.now();
  await main.click();
  await expect(page.locator('.rec-dot')).toBeVisible();
  await page.waitForTimeout(700);
  await main.click();
  await expect(page.locator('[data-save]')).toBeVisible();
  // Two days pass before 저장 is pressed.
  await page.evaluate(() => { const Real = Date, shift = 2 * 864e5; window.Date = class extends Real { constructor(...a) { super(...(a.length ? a : [Real.now() + shift])); } static now() { return Real.now() + shift; } }; });
  await page.locator('[data-save]').click();
  await expect.poll(() => page.evaluate(() => window.__saved)).toBeTruthy();
  const saved = await page.evaluate(() => window.__saved);
  expect(Math.abs(saved.created - started)).toBeLessThan(60000);
  expect(saved.recordedDate).toBe(ymd(new Date(saved.created)));
});

test('12–13. recover.html wording and short cache-busting values', async () => {
  expect(read('recover.html')).not.toContain('이전 공용 저장소');
  const values = [...read('index.html').matchAll(/(\S+?)\?v=([^"]+)"/g)].filter(m => !/student-home-/.test(m[1])).map(m => m[2]);
  expect(values.filter(v => v.length > 24 || /\d{8}.*\d{8}/.test(v) || /-rec-p1/.test(v))).toEqual([]);
});
