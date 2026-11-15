// 키 정보: the song's converted score (MusicXML) fills an empty 원키 from its key signature (saved only with 저장) and
// shows the sung part's lowest / highest notes. A key already typed is never replaced.
const {test, expect} = require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const KEY = 'vocal-zip_mvp_v1';
const stub = `window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'ui-test-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'t'}}})},
 storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/x.wav'},error:null}),upload:async()=>({error:null}),remove:async()=>({error:null})})},
 from:()=>{const c={};for(const m of ['select','eq','is','order','range','upsert','update','delete','maybeSingle'])c[m]=()=>c;c.then=r=>r({data:[],error:null});return c}})};`;
const note = (step, oct, alter = 0) => '<note><pitch><step>' + step + '</step>' + (alter ? '<alter>' + alter + '</alter>' : '') + '<octave>' + oct + '</octave></pitch><duration>4</duration><voice>1</voice><type>quarter</type><lyric><text>la</text></lyric></note>';
// D major (2 sharps), sung part from C#4 to A5, ending on D.
const XML = '<?xml version="1.0"?><score-partwise version="3.1"><part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><key><fifths>2</fifths><mode>major</mode></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>' +
  note('C', 4, 1) + note('F', 4, 1) + note('A', 5) + note('D', 4) + '</measure></part></score-partwise>';
const seed = key => ({categories:[], lessons:[], assignments:[], practices:[], comparisonReports:[],
  songs:[{id:'s1', title:'Test Song', scores:[{id:'sc1', title:'악보', fileName:'a.pdf'}], repertoire:key ? {originalKey:key} : {}}]});

async function boot(page, key) {
  page.__errors = []; page.on('pageerror', e => page.__errors.push(e.message));
  await page.route('**/supabase.min.js', r => r.fulfill({contentType:'application/javascript', body:stub}));
  await page.route('**/r2-config.js*', r => r.fulfill({contentType:'application/javascript', body:"window.VZIP_R2_ENDPOINT='';"}));
  await page.route('**/tus.min.js', r => r.fulfill({contentType:'application/javascript', body:'window.tus={}'}));
  await page.route('**/*.supabase.co/**', r => r.abort());
  await page.addInitScript(([k, s]) => { if (!sessionStorage.getItem('seeded')) { localStorage.setItem(k, s); sessionStorage.setItem('seeded', '1'); } }, [KEY, JSON.stringify(seed(key))]);
  await page.goto('/#/home');
  await expect(page.locator('#vzip-boot-cover')).toHaveCount(0);
  await page.evaluate(xml => {
    window.VzipR2 = {...(window.VzipR2 || {}), enabled:() => true, omr:{status:async () => ({status:'done', resultKey:'k'})}};
    VZ.vocalRangeLoadScore = async () => ({job:{status:'done'}, xml, result:VzipScoreRange.read(xml)});
  }, XML);
}
const song = page => page.evaluate(k => JSON.parse(localStorage.getItem(k)).songs[0], KEY);
test.afterEach(async ({page}) => expect(page.__errors || []).toEqual([]));

test('an empty 원키 is filled from the score and the sung range is shown; saved only with 저장', async ({page}) => {
  await boot(page);
  await page.evaluate(() => VZ.repertoire.edit('s1', 'keys'));
  const box = page.locator('[data-rep-score-key]');
  await expect(box).toBeVisible();
  await expect(page.locator('.archive-sheet [name=originalKey]')).toHaveValue('D');
  await expect(box.locator('[data-rep-key]')).toContainText('원키 D');
  await expect(box.locator('[data-rep-range]')).toContainText('최저음 C#4');
  await expect(box.locator('[data-rep-range]')).toContainText('최고음 A5');
  if (process.env.VZ_SHOTS) await page.screenshot({path:process.env.VZ_SHOTS + '/rep-score-key.png'});
  expect((await song(page)).repertoire?.originalKey || '').toBe('');
  await page.locator('.archive-sheet button[type=submit]').click();
  await expect.poll(async () => (await song(page)).repertoire?.originalKey).toBe('D');
});

test('a 원키 already saved is kept', async ({page}) => {
  await boot(page);
  await page.evaluate(() => VZ.repertoire.edit('s1', 'keys'));
  const input = page.locator('.archive-sheet [name=originalKey]');
  await expect(input).toHaveValue('D');
  await input.fill('E');
  await page.locator('.archive-sheet button[type=submit]').click();
  await expect.poll(async () => (await song(page)).repertoire?.originalKey).toBe('E');
  await expect(page.locator('.archive-sheet')).toHaveCount(0);
  await page.evaluate(() => VZ.repertoire.edit('s1', 'keys'));
  await expect(page.locator('[data-rep-score-key] [data-rep-range]')).toContainText('최고음 A5');
  await expect(page.locator('.archive-sheet [name=originalKey]')).toHaveValue('E');
  await expect(page.locator('[data-rep-score-key] [data-rep-key]')).not.toContainText('넣었어요');
});
