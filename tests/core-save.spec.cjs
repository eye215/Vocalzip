// VZ.change (app/core.js) saves with one JSON text per record before the change and one after. These checks pin what a
// save must keep doing whatever its inside looks like: the stored text is exactly JSON.stringify(db), only changed
// records get a new updatedAt, removed ids are remembered with the version this device saw, and a failed save puts
// the previous state back. Fake data only.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const KEY = 'vocal-zip_mvp_v1';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:null}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const SEED = {
  categories:[{id:'c1', name:'발성', items:['립트릴']}],
  songs:[{id:'s1', title:'Defying "Gravity"', lyrics:'줄 하나\n줄 둘\t탭 \\ 역슬래시 \u2028 😀', updatedAt:100}, {id:'s2', title:'On My Own', updatedAt:200}, {id:3, title:'숫자 id', updatedAt:300}],
  lessons:[{id:'l1', date:'2026-11-01', feedback:'좋아요', updatedAt:400}],
  assignments:[], comparisonReports:[],
  practices:[{id:'p1', date:'2026-11-02', minutes:20, updatedAt:500}, {id:'p2', date:'2026-11-03', minutes:15, nested:{a:[1, null, {b:'c'}]}, updatedAt:600}, {date:'id 없는 줄'}, null],
  settings:{dailyMinutes:30}, deleted:{practices:['old-1']}
};
async function boot(page, seed = SEED) {
  page.__errors = [];
  page.on('pageerror', e => page.__errors.push(e.message));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(seed)]);
  await page.goto('/#/settings');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.waitForFunction(() => window.VZ?.db?.songs?.length === 3);
}

test('the stored text is exactly JSON.stringify(db), awkward shapes included', async ({page}) => {
  await boot(page);
  const out = await page.evaluate(KEY => {
    const VZ = window.VZ, results = [];
    const save = (name, mutate) => { const ok = VZ.change(mutate, {silent:true}); results.push({name, ok, same:localStorage.getItem(KEY) === JSON.stringify(VZ.db)}); };
    save('edit one record', d => { d.songs[0].title = '바뀐 제목'; });
    save('no change at all', () => {});
    save('add and remove', d => { d.practices.push({id:'p3', date:'2026-11-04', minutes:5}); d.lessons.length = 0; });
    save('undefined, NaN, a hole and a date in a row', d => {
      d.practices[0].gone = undefined; d.practices[0].bad = NaN; d.practices[0].when = new Date(0);
      const list = [1, 2, 3]; delete list[1]; d.practices[1].holes = list;
    });
    save('rows that are not records', d => { d.dailyGoals.push(undefined, 'text', 7, {title:'id 없음'}); d.dailyGoals.length = 6; });
    save('the same id twice', d => { d.songs.push({id:'s2', title:'같은 id'}); });
    save('a key with no text and a new top-level key', d => { d.nothing = undefined; d.extra = {'한글 키':[true, false, null]}; d['"quoted" key'] = 1; });
    save('an empty tracked list and a big number', d => { d.assignments = []; d.settings.big = 1e21; d.settings.neg = -0; });
    save('a tracked key that is no longer a list', d => { d.videoFeedback = null; });
    save('a list with holes, saved again', d => { d.settings.again = true; });
    return {results, parsed:JSON.parse(localStorage.getItem(KEY)), keys:Object.keys(JSON.parse(localStorage.getItem(KEY)))};
  }, KEY);
  for (const r of out.results) expect(r, r.name).toEqual({name:r.name, ok:true, same:true});
  expect(out.parsed.songs[0].title).toBe('바뀐 제목');
  expect(out.parsed.songs[0].lyrics).toBe(SEED.songs[0].lyrics);
  expect(out.keys).not.toContain('nothing');
  expect(page.__errors).toEqual([]);
});

test('only changed records get a new updatedAt; removed ids are remembered with the version seen', async ({page}) => {
  await boot(page);
  const out = await page.evaluate(() => {
    const VZ = window.VZ, started = Date.now();
    VZ.change(d => { d.songs[1].title = 'On My Own (수정)'; d.practices.push({id:'p9', date:'2026-11-05', minutes:1}); }, {silent:true});
    const first = structuredClone(VZ.db);
    VZ.change(() => {}, {silent:true});
    const idle = structuredClone(VZ.db);
    VZ.change(d => { d.practices = d.practices.filter(p => !p || p.id !== 'p2'); d.lessons = []; }, {silent:true});
    return {started, first, idle, last:structuredClone(VZ.db)};
  });
  const at = (db, list, id) => db[list].find(x => x && x.id === id)?.updatedAt;
  expect(at(out.first, 'songs', 's1')).toBe(100);                       // untouched
  expect(at(out.first, 'songs', 3)).toBe(300);                          // numeric id, untouched
  expect(at(out.first, 'practices', 'p1')).toBe(500);
  expect(at(out.first, 'songs', 's2')).toBeGreaterThanOrEqual(out.started);   // edited
  expect(at(out.first, 'practices', 'p9')).toBeGreaterThanOrEqual(out.started); // added
  expect(out.first.practices.find(x => x && !x.id)).toEqual({date:'id 없는 줄'}); // rows without an id are never stamped
  expect(out.idle).toEqual(out.first);                                   // a save that changes nothing stamps nothing
  expect(out.last.deleted.practices).toEqual(['old-1', 'p2']);
  expect(out.last.deleted.lessons).toEqual(['l1']);
  expect(out.last.deletedAt.practices.p2.seen).toBe(600);
  expect(out.last.deletedAt.practices.p2.at).toBeGreaterThanOrEqual(out.started);
  expect(out.last.deletedAt.lessons.l1.seen).toBe(400);
  expect(at(out.last, 'practices', 'p1')).toBe(500);
  expect(page.__errors).toEqual([]);
});

test('a save that fails puts the previous state back and the next save works', async ({page}) => {
  await boot(page);
  const out = await page.evaluate(KEY => {
    const VZ = window.VZ, before = JSON.stringify(VZ.db), stored = localStorage.getItem(KEY);
    const real = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) { if (String(k).includes('vocal-zip_mvp_v1')) throw new DOMException('full', 'QuotaExceededError'); return real.call(this, k, v); };
    const failed = VZ.change(d => { d.songs[0].title = '저장 안 됨'; d.songs.pop(); d.practices.push({id:'lost'}); d.settings.dailyMinutes = 99; }, {silent:true});
    Storage.prototype.setItem = real;
    const afterFail = JSON.stringify(VZ.db), storedAfterFail = localStorage.getItem(KEY);
    const thrown = VZ.change(d => { d.songs[0].title = '중간에 실패'; throw Error('boom'); }, {silent:true});
    const afterThrow = JSON.stringify(VZ.db);
    const ok = VZ.change(d => { d.songs[0].title = '다시 저장'; }, {silent:true});
    return {failed, thrown, ok, before, afterFail, afterThrow, stored, storedAfterFail, title:VZ.db.songs[0].title, same:localStorage.getItem(KEY) === JSON.stringify(VZ.db), lists:Array.isArray(VZ.db.songs) && Array.isArray(VZ.db.practices)};
  }, KEY);
  expect(out.failed).toBe(false);
  expect(out.afterFail).toBe(out.before);
  expect(out.storedAfterFail).toBe(out.stored);
  expect(out.thrown).toBe(false);
  expect(out.afterThrow).toBe(out.before);
  expect(out.ok).toBe(true);
  expect(out.title).toBe('다시 저장');
  expect(out.same).toBe(true);
  expect(out.lists).toBe(true);
  await expect(page.locator('.toast, [role="alert"], [role="status"]').filter({hasText:'저장하지 못했어요'}).first()).toBeVisible();
});
