// 내 곡 (#/songs) new design, 2026-11-27: header 검색 · + round buttons, 연습 중 · 전체 · 보관 tabs, the 무대 곡 card,
// one white card of three-line song rows (no picture) and the 전체 녹음 · 나의 공연 card. Reading only: nothing is saved.
// Fixture data only: a mocked Supabase client, made-up songs and silent fake recordings in IndexedDB.
const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const KEY='vocal-zip_mvp_v1';
const O='archive-user';
const rep=status=>({ownerId:O,status});
const initial=()=>({categories:[],
 songs:[
  {id:'s1',title:'This Is the Moment',show:'지킬 앤 하이드',repertoire:rep('practicing'),vocalRange:{low:'A2',high:'F#4',lowMidi:45,highMidi:66}},
  {id:'s2',title:'On My Own',show:'레 미제라블',repertoire:rep('practicing'),vocalRange:{low:'B3',high:'E5',lowMidi:59,highMidi:76}},
  {id:'s3',title:'Defying Gravity',show:'위키드',repertoire:rep('practicing'),vocalRange:{low:'C4',high:'F5',lowMidi:60,highMidi:77}},
  {id:'s4',title:'Memory',show:'캣츠',repertoire:rep('planned')},
  {id:'s5',title:'She Used To Be Mine',show:'웨이트리스',repertoire:rep('ready')},
  {id:'s6',title:'Think of Me',show:'오페라의 유령',repertoire:rep('paused')}],
 lessons:[],
 practices:[{id:'p1',date:'2026-11-25',songId:'s2',minutes:20},{id:'p2',date:'2026-11-24',songId:'s2',minutes:20},{id:'p3',date:'2026-11-21',songId:'s3',minutes:20},{id:'p4',date:'2026-11-13',songId:'s4',minutes:10},{id:'p5',date:'2026-11-06',songId:'s5',minutes:10},{id:'p6',date:'2026-11-26',songId:'s1',minutes:30}],
 assignments:[{id:'a1',title:'2절 가사 외우기',songId:'s4',status:'open'}],
 performances:[{id:'show1',ownerId:O,title:'연말 갈라',start:'2026-11-30',end:'',status:'preparing',venue:'',company:'',role:'',casting:'',team:'',memo:'',sessions:[{id:'ss1',date:'2026-11-30',time:'14:00',number:'',role:'',memo:'',appeared:false}],songLinks:[{id:'l1',songId:'s1',kind:'solo'}],assets:[]},
  {id:'show0',ownerId:O,title:'봄 공연',start:'2026-04-01',end:'',status:'completed',sessions:[],songLinks:[],assets:[]}],
 comparisonReports:[]});
const sdk="window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'archive-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'test-token'}}})},from:table=>{const c={};let method='select';for(const k of ['select','eq','is','order','range','limit','in','upsert','update','delete','maybeSingle'])c[k]=()=>c;for(const k of ['upsert','update'])c[k]=v=>{method=k;if(table==='vocal_data'){(window.__archiveWrites||=[]).push(v.payload);window.__archiveRemote=v.payload}return c};c.then=r=>r({data:table==='vocal_data'&&method==='select'&&window.__archiveRemote?{payload:window.__archiveRemote,updated_at:null}:['update','upsert'].includes(method)?[{user_id:'archive-user'}]:[],error:null});return c},storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/file.wav'}})})}})};";

const today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,10);
const shift=(n)=>{const d=new Date(today()+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
/** The fixture moved to today: the stage in 3 days, practices a few days back. */
function seed(){
 const s=initial();
 s.practices=s.practices.map((p,i)=>({...p,date:shift(-[2,3,6,14,21,1][i])}));
 s.performances[0].start=shift(3);s.performances[0].sessions[0].date=shift(3);
 return s;
}
async function boot(page,{data=seed(),recordings=true,list=true}={}){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page._errors=errors;
 await page.route('**/supabase.min.js',r=>r.fulfill({contentType:'application/javascript',body:sdk}));
 await page.route('**/r2-config.js*',r=>r.fulfill({contentType:'application/javascript',body:"window.VZIP_R2_ENDPOINT='';"}));
 await page.route('**/tus.min.js',r=>r.fulfill({contentType:'application/javascript',body:'window.tus={}'}));await page.route('**/*.supabase.co/**',r=>r.abort());
 await page.addInitScript(([key,data])=>{if(!sessionStorage.getItem('archiveSeed')){localStorage.setItem(key,JSON.stringify(data));sessionStorage.setItem('archiveSeed','1')}},[KEY,data]);
 await page.goto('/#/songs');await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 if(recordings){
  await page.evaluate(async()=>{
   const db=await new Promise((resolve,reject)=>{const q=indexedDB.open('vocalzip_media_v1',1);q.onupgradeneeded=()=>q.result.createObjectStore('recordings',{keyPath:'id'});q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});
   await new Promise((resolve,reject)=>{const tx=db.transaction('recordings','readwrite');const per={s2:14,s3:9,s5:2,s1:6};let n=0;
    for(const [sid,c] of Object.entries(per))for(let i=0;i<c;i++)tx.objectStore('recordings').put({id:'r'+(n++),name:'녹음 '+n+'.m4a',type:'audio/mp4',source:'practice',songId:sid,created:Date.now()-(10+i)*864e5,durationSeconds:60,bytes:new Uint8Array(8).buffer});
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close();});
  await page.reload();await expect(page.locator('#vzip-auth-screen')).toBeHidden();
  // The app's own recording-time backfill (app/recording-time-model.js) adds rec-time:* practice rows for these
  // recordings a moment after loading and redraws: wait for it, so the checks below run on settled data.
  await expect.poll(()=>page.evaluate(k=>(JSON.parse(localStorage.getItem(k)).practices||[]).some(p=>String(p.id).startsWith('rec-time:')),KEY)).toBe(true);
  await page.waitForTimeout(300);
 }
 if(list)await expect(page.locator('.vz-song-list')).toBeVisible();
}
const stored=page=>page.evaluate(k=>localStorage.getItem(k),KEY);
const row=(page,id)=>page.locator('.vz-song-list a[href="#/song/'+id+'"]');
test.afterEach(async({page})=>{expect(page._errors||[]).toEqual([]);});

test('내 곡: header buttons, tabs, the stage card and three-line rows without pictures',async({page})=>{
 test.slow(); // many steps across four screens
 await boot(page);const before=await stored(page);
 // Header: big 내 곡, white round 검색 and + (44px), no settings gear here (설정 is on 오늘).
 await expect(page.locator('#top h1')).toHaveText('내 곡');await expect(page.locator('#top h1')).toHaveCSS('font-size','34px');
 const search=page.locator('#top [data-song-search]'),add=page.locator('#top [data-add-song]');
 for(const b of [search,add]){await expect(b).toHaveCSS('background-color','rgb(255, 255, 255)');const box=await b.boundingBox();expect(Math.min(box.width,box.height)).toBeGreaterThanOrEqual(44);}
 await expect(page.locator('#top a[href="#/settings"]')).toHaveCount(0);await expect(page.locator('[data-collection-count]')).toHaveCount(0);
 // Tabs: only the chosen one is a pill; no track behind.
 const tabs=page.getByRole('navigation',{name:'곡 보기'}).getByRole('button');
 await expect(tabs).toHaveText(['연습 중','전체','보관']);
 await expect(page.locator('[data-song-view=active]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('[data-song-view=active]>span')).toHaveCSS('background-color','rgb(239, 232, 252)');
 await expect(page.locator('[data-song-view=all]>span')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 await expect(page.locator('.vz-st-tabs')).toHaveCSS('background-color','rgba(0, 0, 0, 0)');
 // 무대 곡: the next stage's song as the gradient card (stars on it), opening the song like a row.
 const stage=page.locator('.vz-st-stage');
 await expect(stage).toHaveAttribute('href','#/song/s1');
 await expect(stage.locator('.vz-st-eyebrow')).toHaveText(/^무대 곡 · .+ 14:00 · D-3$/);
 await expect(stage.locator('.vz-st-stage-title')).toHaveText('This Is the Moment');
 expect(await stage.evaluate(el=>getComputedStyle(el).backgroundImage)).toContain('linear-gradient');
 const spark=await stage.locator('.vz-st-tw,.vz-st-dot').count();expect(spark).toBeGreaterThanOrEqual(4);expect(spark).toBeLessThanOrEqual(6);
 expect((await stage.locator('.vz-st-play').boundingBox()).width).toBeCloseTo(46,0);
 // The heading counts the stage song too; it is not listed twice. 보류 (Think of Me) is under 보관.
 await expect(page.locator('[data-song-count]')).toHaveText('연습 중 5곡');
 await expect(page.locator('.vz-song-list>.item')).toHaveCount(4);
 await expect(row(page,'s1')).toHaveCount(0);await expect(row(page,'s6')).toHaveCount(0);
 // A row: title + when / 작품 · 음역 / chips + counts. No avatar picture, no chevron.
 const own=row(page,'s2');
 await expect(own.locator('.item-title')).toHaveText('On My Own');await expect(own.locator('.vz-st-when')).toHaveText('2일 전');
 await expect(own.locator('.item-sub')).toHaveText('레 미제라블 · B3–E5');
 await expect(own.locator('.vz-st-counts')).toHaveText(/^녹음 14( · 이번 주 \d번)?$/);
 await expect(page.locator('.vz-song-list .avatar, .vz-song-list .chev')).toHaveCount(0);
 const memory=row(page,'s4');
 await expect(memory.locator('.vz-st-chip')).toHaveText(['숙제','첫 녹음 전']);await expect(memory.locator('.vz-st-counts')).toHaveText('녹음 0');
 await expect(row(page,'s5').locator('.vz-st-chip')).toHaveText(['공연 가능']);
 await expect(row(page,'s3').locator('.vz-song-status')).toHaveCount(0); // 연습 중 is not repeated on the 연습 중 tab
 // Rows split by thin lines inside one white card.
 await expect(page.locator('.vz-song-list')).toHaveCSS('background-color','rgb(255, 255, 255)');
 await expect(page.locator('.vz-song-list>.item').nth(1)).toHaveCSS('border-top-width','1px');
 // 전체 녹음 n개 · 나의 공연 예정 1 · 지난 1
 await expect(page.locator('[data-songs-library]')).toHaveText(/전체 녹음 31개/);
 await expect(page.locator('[data-songs-performances]')).toHaveText(/나의 공연 예정 1 · 지난 1/);
 // Tabs filter the same list: 전체 = all six, 보관 = the 보류 song.
 await page.locator('[data-song-view=all]').click();await expect(page.locator('[data-song-count]')).toHaveText('전체 6곡');await expect(row(page,'s6')).toHaveCount(1);
 await expect(row(page,'s3').locator('.vz-song-status')).toHaveText('연습 중');
 await page.locator('[data-song-view=archived]').click();await expect(page.locator('[data-song-count]')).toHaveText('보관 1곡');
 await expect(page.locator('.vz-song-list>.item')).toHaveCount(1);await expect(row(page,'s6')).toContainText('보류');await expect(stage).toHaveCount(0);
 // The tab is kept on coming back from a song.
 await row(page,'s6').click();await expect(page.locator('.vz-song-detail-title')).toHaveText('Think of Me');
 await page.goto('/#/songs');await expect(page.locator('[data-song-view=archived]')).toHaveAttribute('aria-pressed','true');
 await page.locator('[data-song-view=active]').click();
 await stage.click();await expect(page.locator('.vz-song-detail-title')).toHaveText('This Is the Moment');
 await page.goto('/#/songs');await page.locator('[data-songs-library]').click();await expect(page).toHaveURL(/#\/library$/);
 await page.goto('/#/songs');await page.locator('[data-songs-performances]').click();await expect(page).toHaveURL(/#\/performances$/);
 expect(await stored(page)).toBe(before);
});

test('내 곡: 필터 and 정렬 words keep the sheet and sort; search from the header; the 성장 word shows as a chip',async({page})=>{
 await boot(page);
 const filter=page.locator('[data-song-filter]'),sort=page.locator('[data-song-sort]');
 await expect(filter).toHaveText('필터');await expect(sort).toHaveText('최근 연습순');await expect(filter).toHaveCSS('color','rgb(102, 112, 133)');
 for(const b of [filter,sort])expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
 await sort.click();await page.locator('[data-choice=name]').click();
 await expect(sort).toHaveText('이름순');await expect(filter).toHaveAttribute('aria-pressed','true');
 const titles=await page.locator('.vz-song-list .item-title').allInnerTexts();expect(titles).toEqual([...titles].sort((a,b)=>a.localeCompare(b,'ko')));
 await filter.click();await page.locator('[data-filter-status]').click();await page.locator('[data-choice=ready]').click();
 await expect(page.locator('[data-song-filter-label]')).toHaveText('공연 가능');await expect(filter).toHaveCSS('color','rgb(122, 50, 245)');
 await expect(page.locator('[data-song-count]')).toHaveText('연습 중 1곡');await expect(page.locator('.vz-st-stage')).toHaveCount(0);
 await filter.click();await page.locator('[data-filter-reset]').click();
 await expect(filter).toHaveAttribute('aria-pressed','false');await expect(sort).toHaveText('최근 연습순');
 // Search lives in the header now.
 await page.locator('#top [data-song-search]').click();const box=page.getByRole('searchbox',{name:'곡 검색',exact:true});
 await box.fill('위키드');await box.press('Enter');
 await expect(page.locator('.vz-song-list>.item')).toHaveCount(1);await expect(page.locator('#top [data-song-search]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('#top [data-song-search]')).toHaveCSS('color','rgb(122, 50, 245)');
 await page.locator('#top [data-song-search]').click();await box.fill('없는 곡');await box.press('Enter');
 await expect(page.locator('[data-l] .empty')).toContainText('조건에 맞는 곡이 없어요');
 await page.locator('#top [data-song-search]').click();await box.fill('');await box.press('Enter');
 // The verdict 성장 › 곡 shows (VZ.growthSong) becomes the row chip and the stage line.
 await page.evaluate(()=>{const real=window.VZ.growthSong;window.VZ.growthSong={...real,verdicts:()=>new Map([
  ['s2',{now:{state:'better',report:{intonation:{state:'better'}}}}],['s3',{now:{state:'worse',report:{high:{state:'worse'}}}}],
  ['s5',{now:{state:'hold'}}],['s1',{now:{state:'better',report:{intonation:{state:'better'}}}}]])};});
 await page.goto('/#/home');await page.goto('/#/songs');
 await expect(row(page,'s2').locator('[data-song-verdict]')).toHaveText('음정 좋아짐');
 await expect(row(page,'s3').locator('[data-song-verdict]')).toHaveText('고음이 아쉬워요');
 await expect(row(page,'s5').locator('.vz-st-chip')).toHaveText(['판정 보류','공연 가능']);
 await expect(page.locator('.vz-st-stage-line')).toHaveText('음정이 좋아졌어요');
});

test('내 곡: + and ?add=1 open 곡 추가; no songs shows the first-song empty state with the rows card',async({page})=>{
 await boot(page,{data:{categories:[],songs:[],lessons:[],practices:[],assignments:[],comparisonReports:[]},recordings:false,list:false});
 await expect(page.locator('[data-l] .empty')).toContainText('곡을 추가하면');await expect(page.locator('[data-song-head]')).toBeHidden();
 await expect(page.locator('.vz-st-stage')).toHaveCount(0);await expect(page.locator('[data-songs-library]')).toBeVisible();
 await page.locator('#top [data-add-song]').click();await expect(page.locator('.sheet-page [name=title]')).toBeVisible();
 await page.locator('.sheet-page [name=title]').fill('Memory');await page.getByRole('button',{name:'곡 추가',exact:true}).last().click();
 await expect(page.locator('.vz-song-detail-title')).toHaveText('Memory');
 await page.goto('/#/songs?add=1');await expect(page.locator('.sheet-page [name=title]')).toBeVisible();await expect(page).toHaveURL(/#\/songs$/);
});

test('내 곡: no sideways scroll at 320 / 390 / 430; the stars stand still with reduced motion',async({page})=>{
 await boot(page);
 for(const width of [320,390,430]){
  await page.setViewportSize({width,height:844});await page.waitForTimeout(100);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth),width+'px').toBeLessThanOrEqual(width);
  for(const sel of ['.vz-st-stage','.vz-song-list','.vz-st-more','.vz-st-head','.vz-st-tabs']){await expect(page.locator(sel)).toBeVisible();const b=await page.locator(sel).boundingBox();expect(b.x,sel).toBeGreaterThanOrEqual(0);expect(b.x+b.width,sel+' at '+width).toBeLessThanOrEqual(width);}
  const lines=await page.locator('.vz-song-list>.item').evaluateAll(els=>els.map(el=>[...el.children].every(c=>c.scrollWidth<=c.clientWidth+1||getComputedStyle(c).textOverflow==='ellipsis'||c.querySelector('.vz-st-counts'))));
  expect(lines.every(Boolean)).toBe(true);
 }
 expect(await page.locator('.vz-st-tw').first().evaluate(el=>getComputedStyle(el).animationName)).toBe('vzStTw');
 await page.emulateMedia({reducedMotion:'reduce'});
 expect(await page.locator('.vz-st-tw,.vz-st-dot').evaluateAll(els=>els.map(el=>getComputedStyle(el).animationName))).toEqual(Array(6).fill('none'));
});
