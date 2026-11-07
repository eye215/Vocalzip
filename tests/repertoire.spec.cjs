const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const KEY='vocal-zip_mvp_v1';
const initial=()=>({categories:[],songs:[{id:'song1',title:'This Is the Moment',show:'지킬 앤 하이드',lyrics:'보존할 가사'},{id:'song2',title:'On My Own',show:'레미제라블'}],lessons:[{id:'lesson1',date:'2026-11-01',songId:'song1',feedback:'기존 피드백'}],practices:[{id:'practice1',date:'2026-11-01',songId:'song1',minutes:30,memo:'기존 연습'}],assignments:[],comparisonReports:[]});
const sdk="window.supabase={createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'archive-user',email:'test@example.invalid'}}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}}),getSession:async()=>({data:{session:{access_token:'test-token'}}})},from:table=>{const c={};let method='select';for(const k of ['select','eq','is','order','range','limit','in','upsert','update','delete','maybeSingle'])c[k]=()=>c;for(const k of ['upsert','update'])c[k]=v=>{method=k;if(table==='vocal_data'){(window.__archiveWrites||=[]).push(v.payload);window.__archiveRemote=v.payload}return c};c.then=r=>r({data:table==='vocal_data'&&method==='select'&&window.__archiveRemote?{payload:window.__archiveRemote,updated_at:null}:['update','upsert'].includes(method)?[{user_id:'archive-user'}]:[],error:null});return c},storage:{from:()=>({createSignedUrl:async()=>({data:{signedUrl:'/file.wav'}})})}})};";
async function boot(page,{seed=initial(),remote=null}={}){
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page._archiveErrors=errors;
 await page.route('**/supabase.min.js',r=>r.fulfill({contentType:'application/javascript',body:sdk}));
 await page.route('**/r2-config.js*',r=>r.fulfill({contentType:'application/javascript',body:"window.VZIP_R2_ENDPOINT='';"}));
 await page.route('**/tus.min.js',r=>r.fulfill({contentType:'application/javascript',body:'window.tus={}'}));await page.route('**/*.supabase.co/**',r=>r.abort());
 await page.addInitScript(([key,data,remote])=>{window.__archiveRemote=remote;if(!sessionStorage.getItem('archiveSeed')){localStorage.setItem(key,JSON.stringify(data));sessionStorage.setItem('archiveSeed','1')}},[KEY,seed,remote]);
 await page.goto('/#/songs');await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 await expect(page.getByRole('link',{name:'나의 공연',exact:true})).toBeVisible();
}
const db=page=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),KEY);
const dialog=page=>page.locator('.archive-sheet');
async function save(page){await dialog(page).getByRole('button',{name:'저장',exact:true}).click();await expect(dialog(page)).toHaveCount(0)}
async function newShow(page,title='지킬 앤 하이드'){
 await page.goto('/#/performances');await page.locator('[data-new-show]').click();
 await dialog(page).getByLabel('작품명',{exact:true}).fill(title);await dialog(page).getByLabel('공연 시작일',{exact:true}).fill('2026-11-01');await dialog(page).getByLabel('배역',{exact:true}).fill('지킬');
 await save(page);await expect(page.locator('[data-add-session]')).toBeVisible();return (await db(page)).performances.at(-1).id;
}
async function addSession(page,time,number){
 await page.locator('[data-add-session]').click();await dialog(page).getByLabel('시작 시간',{exact:true}).fill(time);await dialog(page).getByLabel('공연 회차',{exact:true}).fill(number);await dialog(page).getByLabel('해당 회차 출연',{exact:true}).selectOption('yes');await save(page);
}
test.afterEach(async({page})=>expect(page._archiveErrors||[]).toEqual([]));
test('Repertoire persists metadata ratings keys and filters without rewriting original records',async({page})=>{
 await boot(page);await page.goto('/#/song/song1');await page.locator('[data-rep=status]').click();await dialog(page).getByLabel('상태',{exact:true}).selectOption('ready');await save(page);
 await page.locator('[data-rep=info]').click();await dialog(page).getByLabel('배역',{exact:true}).fill('지킬');await dialog(page).getByLabel('원어',{exact:true}).fill('영어');await dialog(page).getByLabel('구분',{exact:true}).selectOption('solo');await save(page);
 await page.locator('[data-rep=skills]').click();await dialog(page).getByLabel('가사 암보',{exact:true}).selectOption('5');await dialog(page).getByLabel('전체 완성도',{exact:true}).selectOption('4');await save(page);
 await page.locator('[data-rep=keys]').click();await dialog(page).getByLabel('원키',{exact:true}).fill('Db');await dialog(page).getByLabel('연습키',{exact:true}).fill('C');await save(page);
 await page.reload();await expect(page.locator('[data-repertoire]')).toContainText('4.5/5');await expect(page.locator('[data-repertoire]')).toContainText('원키 Db');
 const data=await db(page);expect(data.songs[0].id).toBe('song1');expect(data.songs[0].lyrics).toBe('보존할 가사');expect(data.practices).toEqual(initial().practices);expect(data.lessons).toEqual(initial().lessons);
 await page.goto('/#/songs');await page.getByRole('combobox',{name:'레퍼토리 상태'}).selectOption('ready');await expect(page.locator('[data-l] a')).toHaveCount(1);
 await page.getByRole('searchbox',{name:'곡 검색',exact:true}).fill('지킬');await expect(page.locator('[data-l]')).toContainText('This Is the Moment');
 await page.getByRole('button',{name:'숙련도순',exact:true}).click();await expect(page.locator('[data-l]')).toContainText('공연 가능');
});
test('Performance CRUD, distinct sessions, bidirectional song links and safe deletion',async({page})=>{
 await boot(page);const id=await newShow(page);await addSession(page,'14:00','1');await addSession(page,'19:00','2');
 await page.locator('[data-edit-session]').first().click();await dialog(page).getByLabel('시작 시간',{exact:true}).fill('15:00');await save(page);expect((await db(page)).performances[0].sessions.some(s=>s.time==='15:00')).toBe(true);
 await page.locator('[data-link-songs]').click();await dialog(page).getByRole('searchbox',{name:'공연곡 검색'}).fill('moment');await dialog(page).getByLabel('연결할 기존 곡',{exact:true}).selectOption('song1');await dialog(page).getByLabel('공연 당시 키',{exact:true}).fill('D');await save(page);
 await page.reload();expect((await db(page)).performances[0].sessions).toHaveLength(2);
 await page.goto('/#/song/song1');await expect(page.locator('[data-repertoire]')).toContainText('지킬 앤 하이드');
 const id2=await newShow(page,'두 번째 공연');await page.locator('[data-link-songs]').click();await dialog(page).getByLabel('연결할 기존 곡',{exact:true}).selectOption('song1');await save(page);
 expect((await db(page)).songs).toHaveLength(2);
 await page.goto('/#/show/'+id);await page.locator('[data-edit-show]').click();await dialog(page).getByLabel('공연 후기·개인 메모',{exact:true}).fill('첫 무대');await save(page);
 await page.goto('/#/performances');await expect(page.locator('.archive-page')).toContainText('실제 출연 2회');
 await page.goto('/#/show/'+id2);await page.locator('[data-delete-show]').click();await page.locator('.sheet [data-ok]').click();await expect(page.locator('[data-new-show]')).toBeVisible();
 const state=await db(page);expect(state.performances).toHaveLength(1);expect(state.songs).toHaveLength(2);expect(state.lessons).toEqual(initial().lessons);
 await page.goto('/#/song/song1');await page.locator('[data-song-menu]').click();await page.locator('[data-d]').click();await page.locator('.sheet [data-ok]').click();
 await page.goto('/#/show/'+id);await expect(page.locator('.archive-page')).toContainText('This Is the Moment (연결 해제됨)');expect((await db(page)).practices).toEqual(initial().practices);
});
test('Representative take references the original file and deletion clears only its reference',async({page})=>{
 await boot(page);await page.evaluate(async()=>{
  const bytes=new Uint8Array(44+16000*2*3),view=new DataView(bytes.buffer),write=(at,value)=>{for(let i=0;i<value.length;i++)bytes[at+i]=value.charCodeAt(i)};
  write(0,'RIFF');view.setUint32(4,bytes.length-8,true);write(8,'WAVE');write(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,16000,true);view.setUint32(28,32000,true);view.setUint16(32,2,true);view.setUint16(34,16,true);write(36,'data');view.setUint32(40,bytes.length-44,true);
  await window.vzipStorePracticeMedia({id:'take1',name:'대표 녹음',songId:'song1',type:'audio/wav',durationSeconds:3,created:Date.now(),blob:new Blob([bytes],{type:'audio/wav'})});VZ.media.invalidate();
 });
 await page.goto('/#/song/song1');await page.locator('[data-take]').click();await dialog(page).getByLabel('기존 녹음',{exact:true}).selectOption('take1');await save(page);
 await expect(page.locator('[data-take-player]')).toContainText('대표 녹음');expect((await page.evaluate(()=>vzipReadMedia())).length).toBe(1);
 await page.locator('[data-take-player] [data-toggle]').click();
 await expect.poll(()=>page.locator('[data-take-player] .media-open').evaluate(el=>el._player?.el?.currentTime||0)).toBeGreaterThan(0);
 await page.locator('[data-take-player] [data-toggle]').click();
 await page.evaluate(()=>VZ.change(d=>VzipDataMerge.deleteMedia(d,'take1')));
 expect((await db(page)).songs[0].repertoire.takeId).toBe('');expect((await db(page)).songs[0].lyrics).toBe('보존할 가사');
});
test('Performance upload retries preserve video bytes and isolate metadata from recordings',async({page})=>{
 await boot(page);const id=await newShow(page);await page.evaluate(()=>{
  window.__archiveUploads=[];let attempt=0;
  window.VzipR2={configured:()=>true,ready:async()=>true,upload:async(file,opts)=>{window.__archiveUploads.push({name:file.name,type:opts.type,purpose:opts.purpose,size:file.size});if(++attempt===1)throw Error('테스트 네트워크 중단');return {key:'u/archive-user/'+opts.mediaId+'/original.mp4',size:file.size}},remove:async()=>{},url:async()=>'/test-poster'};
 });
 await page.getByRole('button',{name:'자료 업로드',exact:true}).click();await dialog(page).locator('[data-files]').setInputFiles({name:'공연.mp4',mimeType:'video/mp4',buffer:Buffer.from('original video bytes')});
 await dialog(page).locator('[data-upload]').click();await expect(dialog(page)).toContainText('네트워크 중단');await dialog(page).locator('[data-upload]').click();await expect(dialog(page)).toContainText('저장 완료');
 await dialog(page).getByRole('button',{name:'닫기',exact:true}).click();await expect(page.locator('[data-show-assets]')).toContainText('공연.mp4');
 const data=await db(page);expect(data.performances[0].assets[0].type).toBe('video/mp4');expect(await page.evaluate(()=>vzipReadMedia())).toHaveLength(0);
 expect(await page.evaluate(()=>window.__archiveUploads.at(-1))).toMatchObject({type:'video/mp4',purpose:'performance',size:20});
 await page.getByRole('button',{name:'자료 삭제',exact:true}).click();await page.locator('.sheet [data-ok]').click();await expect(page.locator('.archive-asset')).toHaveCount(0);
 await page.evaluate(()=>{window.vzipCloudUserId=()=> 'another-user';VZ.render()});await expect(page.locator('#view')).toContainText('로그인 계정을 확인');expect((await db(page)).performances[0].id).toBe(id);
});
test('Archive sheets preserve unsaved inputs and fit phone width',async({page})=>{
 await boot(page);await page.goto('/#/performances');await page.locator('[data-new-show]').click();await dialog(page).getByLabel('작품명',{exact:true}).fill('저장 전 제목');
 page.once('dialog',d=>d.dismiss());await dialog(page).getByRole('button',{name:'닫기',exact:true}).click();await expect(dialog(page).getByLabel('작품명',{exact:true})).toHaveValue('저장 전 제목');
 for(const width of [320,390]){await page.setViewportSize({width,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);expect(await dialog(page).evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBe(true)}
 page.once('dialog',d=>d.accept());await dialog(page).getByRole('button',{name:'닫기',exact:true}).click();await expect(dialog(page)).toHaveCount(0);expect((await db(page)).performances||[]).toHaveLength(0);
});

test('Changing account while deletion confirmation is open preserves the original session',async({page})=>{
 await boot(page);await newShow(page);await addSession(page,'14:00','1');
 await page.locator('[data-delete-session]').click();
 await page.evaluate(()=>{window.vzipCloudUserId=()=> 'another-user'});
 await page.locator('.sheet [data-ok]').click();
 expect((await db(page)).performances[0].sessions).toHaveLength(1);
});

test('Cloud writes exclude another account archive while preserving its unsynced device copy',async({page})=>{
 const seed=initial(),remote=initial();
 seed.performances=[{id:'foreign-show',ownerId:'another-user',title:'비공개 미동기화 공연',start:'2026-10-01',sessions:[],songLinks:[],assets:[]}];
 seed.songs[0].repertoire={ownerId:'another-user',status:'ready',memo:'기기 보관'};
 remote.performances=[{id:'remote-show',ownerId:'archive-user',title:'원격 공연',start:'2026-11-01',sessions:[],songLinks:[],assets:[]}];
 await boot(page,{seed,remote});
 await expect.poll(()=>page.evaluate(()=>window.__archiveWrites?.length||0)).toBeGreaterThan(0);
 const local=await db(page),out=await page.evaluate(()=>window.__archiveWrites.at(-1));
 expect(local.performances.map(p=>p.id).sort()).toEqual(['foreign-show','remote-show']);
 expect(local.songs[0].repertoire.memo).toBe('기기 보관');
 expect(out.performances.map(p=>p.id)).toEqual(['remote-show']);expect(out.songs[0].repertoire).toBeUndefined();
 await page.goto('/#/performances');await expect(page.locator('#view')).toContainText('원격 공연');await expect(page.locator('#view')).not.toContainText('비공개 미동기화 공연');
});
test('A production connects to the rest of the app: its day on the calendar, 공연 recordings of that day, their songs, the song page, and before sign-in is confirmed',async({page})=>{
 await boot(page);const id=await newShow(page,'맘마미아');await addSession(page,'19:00','1');
 await page.evaluate(async()=>{window.vzipCloudSignedIn=()=>false;
  await window.vzipStorePracticeMedia({id:'stage1',name:'Dancing Queen 공연',type:'audio/wav',blob:new Blob(['x'],{type:'audio/wav'}),created:new Date('2026-11-01T20:00:00').getTime(),recordedDate:'2026-11-01',dateSource:'manual',source:'import',occasion:'performance',songId:'song2',song:'On My Own'});
  window.VZ.media.invalidate?.();window.dispatchEvent(new Event('vzip:media-updated'))});
 await page.goto('/#/show/'+id);
 const rec=page.locator('[data-show-media]');await expect(rec).toContainText('Dancing Queen 공연');
 await rec.getByRole('button',{name:/곡 1개를 공연곡으로 연결/}).click();
 await expect.poll(async()=>(await db(page)).performances.find(p=>p.id===id).songLinks.map(l=>l.songId)).toEqual(['song2']);
 await page.goto('/#/calendar');await page.locator('[data-d="2026-11-01"]').click();
 await expect(page.locator('[data-day]')).toContainText('맘마미아');
 await page.goto('/#/song/song2');await page.getByRole('tab',{name:'공연'}).click();await expect(page.locator('[data-body]')).toContainText('맘마미아');
 // App just opened / offline: the account this device last synced with still sees its productions.
 await page.evaluate(()=>{localStorage.setItem('vzip_cloud_linked_user','archive-user');window.vzipCloudUserId=()=>''});
 await page.goto('/#/performances');await expect(page.locator('.archive-page')).toContainText('맘마미아');
});
