/* 마디와 MR 맞추기 (app/score-sync.js, app/score-sync-model.js, loop bar in app/score-audio.js): tapping the measure
 * starts along the song's MR file, and what the saved sync is used for — 재생 위치 따라가기, ▶ 이 마디 반복 on the
 * 표시한 마디 rows, press-and-hold on a measure box. The PDF, its conversion and the MR (a generated tone) are written
 * here: 12 measures of 4/4 in three lines, 1–4 and 5–8 on page 1, 9–12 on page 2.
 * The MR really plays in the browser (times are read from its <audio>), so this is not an iPhone audio check.
 * WebKit: every test that plays the MR is skipped there (PLAYS) — Linux WebKit in CI cannot be relied on to play and
 * seek a WAV served this way; the tests that only look at menus and messages run everywhere. */
const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {boot,fakeR2,R2,KEY:STORE,wav}=require('./helpers/r2-fixture.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PDFROOT=process.env.VZ_PDFJS_ROOT||'/tmp/vzip-score-pdfjs/node_modules/pdfjs-dist';
const PLAYS='plays the MR: real audio playback and seeking are checked in Chromium';
const PW=300,PH=400,UNIT=.4,STAFF=16;
const SYSTEMS=[
 {page:1,y:80,x0:30,x1:270,measures:[[1,250],[2,250],[3,250],[4,250]]},
 {page:1,y:200,x0:30,x1:270,measures:[[5,250],[6,250],[7,250],[8,250]]},
 {page:2,y:100,x0:30,x1:270,measures:[[9,250],[10,250],[11,250],[12,250]]}
];
function pdf(systems=SYSTEMS,pages=2){
 const stream=text=>'<< /Length '+Buffer.byteLength(text)+' >>\nstream\n'+text+'\nendstream';
 const content=n=>'BT /F1 10 Tf 20 380 Td (VOCAL.zip Score '+n+') Tj ET\n0 0 0 RG 1 w\n'+systems.filter(s=>s.page===n).map(s=>[0,1,2,3,4].map(l=>s.x0+' '+(PH-s.y-l*4)+' m '+s.x1+' '+(PH-s.y-l*4)+' l S').join('\n')).join('\n');
 const kids=Array.from({length:pages},(_,i)=>(3+i*2)+' 0 R').join(' '),font=3+pages*2;
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids ['+kids+'] /Count '+pages+' >>'];
 for(let n=1;n<=pages;n++)objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+PW+' '+PH+'] /Resources << /Font << /F1 '+font+' 0 R >> >> /Contents '+(2+n*2)+' 0 R >>',stream(content(n)));
 objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 let out='%PDF-1.4\n',offsets=[0];
 objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(out));out+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});
 const offset=Buffer.byteLength(out);out+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+offset+'\n%%EOF';
 return Buffer.from(out);
}
/** The conversion as Audiveris writes it (positions in tenths from the top-left of the page it read). */
function musicxml(systems=SYSTEMS){
 let last=null,body='';
 for(const s of systems){
  const first=!last||last.page!==s.page,gap=first?'<top-system-distance>'+s.y/UNIT+'</top-system-distance>':'<system-distance>'+(s.y-last.y-STAFF)/UNIT+'</system-distance>';
  s.measures.forEach(([number,width],i)=>{
   body+='<measure number="'+number+'" width="'+width+'">'+(i?'':'<print'+(!last?'':first?' new-page="yes"':' new-system="yes"')+'><system-layout><system-margins><left-margin>'+s.x0/UNIT+'</left-margin><right-margin>'+(PW-s.x1)/UNIT+'</right-margin></system-margins>'+gap+'</system-layout></print>')+
    (number===systems[0].measures[0][0]?'<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>':'')+
    '<note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><type>whole</type></note></measure>';
  });
  last=s;
 }
 const pages=new Set(systems.map(s=>s.page)).size;
 return '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><identification><encoding><software>Audiveris 5.11.0</software></encoding><miscellaneous>'+
  Array.from({length:pages},(_,i)=>'<miscellaneous-field name="source-sheet-'+(i+1)+'">1</miscellaneous-field>').join('')+'</miscellaneous></identification>'+
  '<defaults><page-layout><page-height>'+(PH/UNIT+160)+'</page-height><page-width>'+(PW/UNIT+160)+'</page-width><page-margins type="both"><left-margin>80</left-margin><right-margin>80</right-margin><top-margin>80</top-margin><bottom-margin>80</bottom-margin></page-margins></page-layout></defaults>'+
  '<part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list><part id="P1">'+body+'</part></score-partwise>';
}
function mxl(score){
 const table=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
 const crc32=b=>{let c=0xffffffff;for(const x of b)c=table[(c^x)&0xff]^(c>>>8);return (c^0xffffffff)>>>0;};
 const container='<?xml version="1.0" encoding="UTF-8"?><container><rootfiles><rootfile full-path="score.xml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>';
 const files=[['META-INF/container.xml',container],['score.xml',score]].map(([name,text])=>({name:Buffer.from(name),data:Buffer.from(text)}));
 const local=[],central=[];let offset=0;
 for(const f of files){
  const crc=crc32(f.data),head=Buffer.alloc(30),dir=Buffer.alloc(46);
  head.writeUInt32LE(0x04034b50,0);head.writeUInt16LE(20,4);head.writeUInt32LE(crc,14);head.writeUInt32LE(f.data.length,18);head.writeUInt32LE(f.data.length,22);head.writeUInt16LE(f.name.length,26);
  dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(20,4);dir.writeUInt16LE(20,6);dir.writeUInt32LE(crc,16);dir.writeUInt32LE(f.data.length,20);dir.writeUInt32LE(f.data.length,24);dir.writeUInt16LE(f.name.length,28);dir.writeUInt32LE(offset,42);
  local.push(head,f.name,f.data);central.push(dir,f.name);offset+=30+f.name.length+f.data.length;
 }
 const dirBytes=Buffer.concat(central),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(dirBytes.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...local,dirBytes,end]);
}
const OWNER='ui-test-user',SCORE='score-sync',PDFKEY='u/'+OWNER+'/'+SCORE+'/original.pdf',MXL='u/'+OWNER+'/'+SCORE+'/omr.mxl',BOXES='vzip_score_measures_v1:'+OWNER,FOLLOW='vzip_score_sync_v1:'+OWNER;
const MRLEN=16,mrKey=id=>'u/'+OWNER+'/'+id+'/original.wav';
const FILE={id:'mr-1',kind:'file',title:'연습 MR',fileName:'mr.wav',type:'audio/wav',r2Key:mrKey('mr-1'),created:1},FILE2={id:'mr-2',kind:'file',title:'느린 MR',fileName:'slow.wav',type:'audio/wav',r2Key:mrKey('mr-2'),created:2};
const TUBE={id:'mr-tube',kind:'youtube',title:'유튜브 반주',videoId:'abcdefghijk',url:'https://www.youtube.com/watch?v=abcdefghijk',created:3};
/** One measure a second: 1–8 from 1 s, then back to 5 (9 s) and on to 9 (13 s). Measures 5–8 sound twice. */
const PLAYED=[[1,0],[2,1],[3,2],[4,3],[5,4],[6,5],[7,6],[8,7],[9,4],[10,5],[11,6],[12,7],[13,8]].map(([t,m])=>({t,m}));

/** tracks: the song's MR entries; sync: anchors saved for mr-1 (or {id: anchors}); rows: handwriting on the score. */
async function setup(page,{tracks=[FILE],sync=null,rows=[],boxes=false,conversion=musicxml(),bytes=pdf()}={}){
 const r2=await fakeR2(page);r2.store.set(PDFKEY,{bytes,type:'application/pdf',etag:'"pdf"'});
 const tone=wav(MRLEN);
 for(const t of tracks)if(t.kind==='file')r2.store.set(t.r2Key,{bytes:tone,type:'audio/wav',etag:'"'+t.id+'"'});
 // The MR is read the way a player reads a stored file: byte ranges, also open-ended ones.
 await page.route(R2+'/v1/media/u/'+OWNER+'/mr-*/**',route=>{
  const req=route.request(),o=r2.store.get(decodeURIComponent(new URL(req.url()).pathname.slice(10)));
  if(req.method()!=='GET'||!o)return route.fallback();
  const range=/^bytes=(\d+)-(\d*)$/.exec(req.headers().range||''),head={'access-control-allow-origin':'*','accept-ranges':'bytes',etag:o.etag};
  if(!range)return route.fulfill({status:200,contentType:o.type,headers:head,body:o.bytes});
  const from=Number(range[1]),to=Math.min(o.bytes.length-1,range[2]?Number(range[2]):o.bytes.length-1);
  return route.fulfill({status:206,contentType:o.type,headers:{...head,'content-range':'bytes '+from+'-'+to+'/'+o.bytes.length},body:o.bytes.subarray(from,to+1)});
 });
 const omr={job:null,put(xml,n=1){const file=mxl(xml);r2.store.set(MXL,{bytes:file,type:'application/vnd.recordare.musicxml',etag:'"mxl'+n+'"'});
  omr.job={id:String(n).repeat(24),scoreId:SCORE,status:'done',created:n,finished:n+1,error:null,resultKey:MXL,resultSize:file.length,movements:1};}};
 omr.put(conversion);
 await page.route(R2+'/v1/omr**',route=>route.fulfill({json:{job:omr.job},headers:{'access-control-allow-origin':'*'}}));
 await page.context().route('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/**',route=>{
  const suffix=new URL(route.request().url()).pathname.split('pdfjs-dist@4.10.38/')[1],file=path.join(PDFROOT,suffix);
  if(!suffix||suffix.includes('..')||!fs.existsSync(file))return route.abort();
  return route.fulfill({path:file,contentType:file.endsWith('.mjs')?'text/javascript':'application/octet-stream',headers:{'access-control-allow-origin':'*'}});
 });
 // Every player the app makes is kept, so a test can read (and move) the MR's real time.
 await page.addInitScript(()=>{window.__players=[];const wait=setInterval(()=>{const M=window.VZ?.media;if(!M?.player||M.player.__kept)return;const make=M.player;M.player=(...a)=>{const p=make(...a);window.__players.push(p);return p;};M.player.__kept=true;clearInterval(wait);},5);});
 await boot(page);
 const hash=crypto.createHash('sha256').update(bytes).digest('hex');
 const records=rows.map((r,i)=>({version:1,id:'row-'+i,ownerId:OWNER,songId:'s1',scoreId:SCORE,r2Key:PDFKEY,pdfHash:hash,color:'#7a32f5',createdAt:1700000000000+i,...r}));
 const saved=sync&&(Array.isArray(sync)?{'mr-1':sync}:sync);
 await page.evaluate(([key,size,records,tracks,saved,len,boxKey,boxes])=>{
  const S=window.VzipScoreSyncModel,mrSync=saved?Object.fromEntries(Object.entries(saved).map(([id,anchors])=>[id,S.entry({anchors,count:12,duration:len,now:1700000000000})])):null;
  if(boxes)localStorage.setItem(boxKey,JSON.stringify({on:true,noted:true}));
  return window.VZ.change(d=>{
   d.songs[0].scores=[{id:'score-sync',songId:'s1',title:'연습 악보',r2Key:key,size,uploadedAt:Date.now(),...(mrSync?{mrSync}:{})}];
   d.songs[0].mrTracks=tracks;d.scoreAnnotations=records;
  });
 },[PDFKEY,bytes.length,records,tracks,saved,MRLEN,BOXES,boxes]);
 return {r2,omr};
}
async function open(page){
 await page.goto('/#/song/s1');await page.getByRole('tab',{name:'악보',exact:true}).click();
 await page.getByRole('button',{name:'연습 악보 열기',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'악보 개인 필기'});
 await expect(dialog.locator('[data-ink-box]')).toBeVisible({timeout:20000});
 await expect(dialog.locator('[data-ink-save-state]')).toContainText('필기 준비됨',{timeout:20000});
 await expect(dialog.locator('[data-ink-measure-sync]')).toHaveCount(1,{timeout:15000}); // the conversion has been read
 return dialog;
}
const more=async dialog=>{if(await dialog.getAttribute('data-ink-more-open')!=='true')await dialog.locator('[data-ink-more]').click();};
const syncItem=dialog=>dialog.locator('[data-ink-measure-sync]'),followItem=dialog=>dialog.locator('[data-ink-measure-follow]'),listItem=dialog=>dialog.locator('[data-ink-measure-list]');
const syncSheet=page=>page.getByRole('dialog',{name:'마디와 MR 맞추기'});
async function openSync(page,dialog){await more(dialog);await syncItem(dialog).click();const sheet=syncSheet(page);await expect(sheet.locator('[data-sync-page]')).toBeVisible({timeout:15000});await expect(sheet.locator('.score-sync-box').first()).toBeVisible();return sheet;}
const big=sheet=>sheet.locator('[data-sync-tap]');
/** The MR that was made last: its real time and state. */
// The player that is sounding, else the newest one: the bar now gets its MR ready before the first tap, so the
// newest player is not always the one in use.
const mr=page=>page.evaluate(()=>{const p=[...window.__players].reverse().find(x=>!x.el.paused)||window.__players.at(-1);return p?{time:p.el.currentTime,paused:p.el.paused,rate:p.el.playbackRate,duration:p.el.duration,id:p.item.id}:null;});
const mrSeek=(page,time)=>page.evaluate(t=>{window.__players.at(-1).el.currentTime=t;},time);
const savedSync=(page,id='mr-1')=>page.evaluate(id=>{const e=window.VZ.db.songs[0].scores[0].mrSync?.[id];return e?{raw:e,read:window.VzipScoreSyncModel.read(e)}:null;},id);
const bar=dialog=>dialog.locator('[data-score-audio]');
const nowBox=dialog=>dialog.locator('[data-ink-measures] .score-measure-now');
const pt=(x,y)=>[x/PW,y/PH,.5];
const stroke=(page,tool,points,extra={})=>({page,tool,width:tool==='highlighter'?.024:.004,points:points.map(p=>pt(...p)),...extra});
/** Where a measure box is on the screen (centre), from the page box of the viewer. */
async function boxCentre(dialog,number){
 const r=await dialog.locator('[data-ink-box]').boundingBox(),s=SYSTEMS.find(x=>x.measures.some(m=>m[0]===number)),i=s.measures.findIndex(m=>m[0]===number),w=(s.x1-s.x0)/s.measures.length;
 return {x:r.x+(s.x0+w*(i+.5))/PW*r.width,y:r.y+(s.y+STAFF/2)/PH*r.height};
}
test.afterEach(async({page})=>expect(page.__errors||[]).toEqual([]));

test('찍기: each tap of 다음 마디 stores that measure at the MR time it was pressed; 되돌리기, 0.75×, 저장',async({page,browserName})=>{
 test.skip(browserName==='webkit',PLAYS);
 await setup(page);const dialog=await open(page);
 // The menu item sits with the other measure items; nothing is being followed yet.
 await more(dialog);await expect(syncItem(dialog)).toHaveText('마디와 MR 맞추기');await expect(followItem(dialog)).toHaveCount(0);
 const sheet=await openSync(page,dialog);
 await expect(sheet.locator('[data-sync-track-name]')).toHaveText('연습 MR');
 await expect(sheet.locator('[data-sync-now]')).toHaveText('시작 전');await expect(sheet.locator('[data-sync-count]')).toHaveText('찍은 곳 0');
 await expect(sheet.locator('[data-sync-pageno]')).toHaveText('1 / 2쪽');
 await expect(sheet.locator('.score-sync-box')).toHaveCount(8);await expect(sheet.locator('.score-sync-box[data-state=next]')).toHaveAttribute('data-number','1');
 await expect(sheet.locator('[data-sync-save]')).toBeDisabled();
 // The big button is in thumb reach: at the bottom, at least 56px high; it starts the MR first.
 const size=await big(sheet).boundingBox(),view=page.viewportSize();
 expect(size.height).toBeGreaterThanOrEqual(56);expect(size.y).toBeGreaterThan(view.height*.55);
 if(view.width<900)expect(size.width).toBeGreaterThan(view.width*.8);else expect(size.width).toBeGreaterThan(300); // beside the score on a wide screen
 await expect(big(sheet)).toContainText('MR 재생');await expect(big(sheet)).toBeFocused();
 await big(sheet).click();
 await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(.25);
 await expect(big(sheet)).toContainText('다음 마디');await expect(big(sheet)).toContainText('1마디');
 expect(await sheet.locator('[data-sync-count]').textContent()).toBe('찍은 곳 0'); // starting the MR is not a tap
 const taps=[];
 const press=async()=>{const before=(await mr(page)).time;await big(sheet).click();taps.push([before,(await mr(page)).time]);};
 for(let i=0;i<5;i++){await press();await page.waitForTimeout(330);}
 await expect(sheet.locator('[data-sync-count]')).toHaveText('찍은 곳 5');await expect(sheet.locator('[data-sync-now]')).toHaveText('지금 5마디');
 await expect(big(sheet)).toContainText('6마디');
 await expect(sheet.locator('.score-sync-box[data-state=now]')).toHaveAttribute('data-number','5');
 await expect(sheet.locator('.score-sync-box[data-state=done]')).toHaveCount(4);await expect(sheet.locator('.score-sync-box[data-state=next]')).toHaveAttribute('data-number','6');
 // 되돌리기 takes the last tap away and goes back (2 s, but not before the tap that is now the last).
 await sheet.locator('[data-sync-undo]').click();taps.pop();
 await expect(sheet.locator('[data-sync-count]')).toHaveText('찍은 곳 4');await expect(sheet.locator('[data-sync-now]')).toHaveText('지금 4마디');
 const back=(await mr(page)).time;expect(back).toBeGreaterThanOrEqual(taps[3][0]);expect(back).toBeLessThan(taps[3][1]+.6);
 // Slower: 0.75×. What is stored is the MR's own time, not the time on the clock.
 await sheet.locator('[data-sync-rate]').click();await expect(sheet.locator('[data-sync-rate]')).toHaveAttribute('aria-pressed','true');
 expect((await mr(page)).rate).toBe(.75);
 await page.waitForTimeout(300);await press();const started=Date.now();await page.waitForTimeout(1200);await press();const wall=(Date.now()-started)/1000;
 await expect(sheet.locator('[data-sync-count]')).toHaveText('찍은 곳 6');
 await expect(sheet.locator('[data-sync-save]')).toBeEnabled();
 await sheet.locator('[data-sync-save]').click();
 await expect(page.locator('.toast')).toHaveText('마디와 MR을 맞췄어요.');await expect(sheet).toHaveCount(0);
 const stored=await savedSync(page);
 expect(stored.raw.n).toBe(12);expect(Math.abs(stored.raw.d-MRLEN*100)).toBeLessThanOrEqual(2);expect(stored.raw.o).toBeUndefined();
 expect(stored.raw.a.every(Number.isInteger)).toBe(true);expect(JSON.stringify(stored.raw).length).toBeLessThan(120);
 expect(stored.read.anchors.map(a=>a.m)).toEqual([0,1,2,3,4,5]);
 stored.read.anchors.forEach((a,i)=>{expect(a.t,'tap '+i).toBeGreaterThanOrEqual(taps[i][0]-.03);expect(a.t,'tap '+i).toBeLessThanOrEqual(taps[i][1]+.03);});
 const slow=stored.read.anchors[5].t-stored.read.anchors[4].t;
 expect(slow).toBeLessThan(wall*.9);expect(slow).toBeGreaterThan(wall*.6); // about three quarters of the time that passed
 // It is one field on the score entry of the song, and it is in what the device stores (and so in what syncs).
 const kept=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).songs[0],STORE);
 expect(kept.scores[0].mrSync['mr-1']).toEqual(stored.raw);expect(kept.updatedAt).toBeGreaterThan(0);
 // The viewer now follows: the menu offers 재생 위치 따라가기, on.
 await more(dialog);await expect(followItem(dialog)).toHaveAttribute('aria-pressed','true');await expect(syncItem(dialog)).toHaveText('마디와 MR 맞추기');
 // Opening it again takes up what was saved; nothing changed, so 저장 waits.
 await syncItem(dialog).click();
 await expect(syncSheet(page).locator('[data-sync-count]')).toHaveText('찍은 곳 6');await expect(syncSheet(page).locator('[data-sync-now]')).toHaveText('지금 6마디');
 await expect(syncSheet(page).locator('[data-sync-save]')).toBeDisabled();
});

test('줄 시작만 찍기: one tap per line, the measures between are shared out; a measure box sets 지금 여기; Space and Enter tap',async({page,browserName})=>{
 test.skip(browserName==='webkit',PLAYS);
 await setup(page);const dialog=await open(page),sheet=await openSync(page,dialog);
 await sheet.locator('[data-sync-lines]').click();await expect(sheet.locator('[data-sync-lines]')).toHaveAttribute('aria-pressed','true');
 await expect(sheet.locator('[data-sync-guide]')).toContainText('줄이 시작될 때마다');
 await big(sheet).click();await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(.3);
 await expect(big(sheet)).toContainText('1마디');
 await big(sheet).click();                       // line 1 → measure 1
 await expect(big(sheet)).toContainText('다음 줄');await expect(big(sheet)).toContainText('5마디');
 await page.waitForTimeout(800);await big(sheet).focus();await page.keyboard.press('Space'); // line 2 → measure 5, by keyboard
 await expect(sheet.locator('[data-sync-count]')).toHaveText('찍은 곳 2');await expect(big(sheet)).toContainText('9마디');
 await expect(sheet.locator('.score-sync-box[data-state=done]')).toHaveCount(4); // 1 was tapped, 2–4 lie between the taps
 await page.waitForTimeout(800);await page.keyboard.press('Enter');                      // line 3 → measure 9, on the next page
 await expect(sheet.locator('[data-sync-count]')).toHaveText('찍은 곳 3');
 await expect(sheet.locator('[data-sync-pageno]')).toHaveText('2 / 2쪽');await expect(sheet.locator('.score-sync-box[data-state=now]')).toHaveAttribute('data-number','9');
 await expect(big(sheet)).toBeDisabled();await expect(big(sheet)).toContainText('끝까지 찍었어요');
 // A repeat: back on page 1, pressing measure 2 says "the MR is here now".
 await page.waitForTimeout(500);await sheet.locator('[data-sync-prev]').click();await expect(sheet.locator('[data-sync-pageno]')).toHaveText('1 / 2쪽');
 const before=(await mr(page)).time;await sheet.locator('.score-sync-box[data-number="2"]').click();const after=(await mr(page)).time;
 await expect(sheet.locator('[data-sync-count]')).toHaveText('찍은 곳 4');await expect(sheet.locator('[data-sync-now]')).toHaveText('지금 2마디');
 await expect(big(sheet)).toContainText('5마디'); // the next line after measure 2
 await sheet.locator('[data-sync-save]').click();await expect(sheet).toHaveCount(0);
 const {read}=await savedSync(page);
 expect(read.anchors.map(a=>a.m)).toEqual([0,4,8,1]);
 expect(read.anchors[3].t).toBeGreaterThanOrEqual(before-.03);expect(read.anchors[3].t).toBeLessThanOrEqual(after+.03);
 // Measures 2–4 share the first line's time evenly; measure 2 sounds twice.
 const times=await page.evaluate(()=>{const S=window.VzipScoreSyncModel,e=S.read(window.VZ.db.songs[0].scores[0].mrSync['mr-1']),seq=Array.from({length:12},(_,i)=>({beats:4,first:i%4===0})),m=S.build(seq,e.anchors);return {t:[0,1,2,3,4].map(i=>m.timeOf(i)),twice:m.occurrences(1)};});
 const step=(times.t[4]-times.t[0])/4;expect(step).toBeGreaterThan(.15);
 [1,2,3].forEach(i=>expect(Math.abs(times.t[i]-(times.t[0]+step*i))).toBeLessThan(1e-6));expect(times.twice).toBe(2);
});

test('취소 and the back button ask before throwing taps away; 처음부터 asks too; nothing is saved without 저장',async({page,browserName})=>{
 test.skip(browserName==='webkit',PLAYS);
 await setup(page);const dialog=await open(page);let sheet=await openSync(page,dialog);
 // Nothing done: 취소 simply closes.
 await sheet.getByRole('button',{name:'취소',exact:true}).click();await expect(sheet).toHaveCount(0);await expect(page.locator('.toast')).toHaveText('취소했어요.');
 sheet=await openSync(page,dialog);
 await big(sheet).click();await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(.2);
 await big(sheet).click();await page.waitForTimeout(250);await big(sheet).click();
 await expect(sheet.locator('[data-sync-count]')).toHaveText('찍은 곳 2');
 const ask=page.getByRole('dialog',{name:'작성 중인 내용이 있어요'});
 await sheet.getByRole('button',{name:'취소',exact:true}).click();await expect(ask).toBeVisible();
 await ask.getByRole('button',{name:'계속 작성',exact:true}).click();await expect(ask).toHaveCount(0);
 await expect(sheet.locator('[data-sync-count]')).toHaveText('찍은 곳 2');
 // 처음부터: asks, then clears and goes back to the start.
 await sheet.locator('[data-sync-restart]').click();
 const again=page.getByRole('dialog',{name:'처음부터 다시 찍기'});await expect(again).toContainText('2곳');
 await again.getByRole('button',{name:'취소',exact:true}).click();await expect(sheet.locator('[data-sync-count]')).toHaveText('찍은 곳 2');
 await sheet.locator('[data-sync-restart]').click();await again.getByRole('button',{name:'다시 찍기',exact:true}).click();
 await expect(sheet.locator('[data-sync-count]')).toHaveText('찍은 곳 0');await expect(sheet.locator('[data-sync-now]')).toHaveText('시작 전');
 expect((await mr(page)).time).toBeLessThan(.5);await expect(big(sheet)).toContainText('MR 재생');
 await sheet.getByRole('button',{name:'돌아가기',exact:true}).click();await expect(sheet).toHaveCount(0); // nothing left to lose: no question
 // Taps made by keyboard alone (nothing in the sheet was clicked) count as unsaved work as well. Playing the MR does not.
 sheet=await openSync(page,dialog);
 await expect(big(sheet)).toBeFocused();await page.keyboard.press('Enter');await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(.3);
 await page.keyboard.press('Space');await page.waitForTimeout(200);await page.keyboard.press('Space');
 await expect(sheet.locator('[data-sync-count]')).toHaveText('찍은 곳 2');
 await page.keyboard.press('Escape');await expect(ask).toBeVisible();
 await ask.getByRole('button',{name:'닫기',exact:true}).click();await expect(sheet).toHaveCount(0);
 expect(await savedSync(page)).toBeNull();
 expect((await mr(page)).paused).toBe(true); // its MR stopped with it
 await more(dialog);await expect(followItem(dialog)).toHaveCount(0);
});

test('확인: the mark runs along with the MR, 전체 앞당기기 / 늦추기 moves every time by 0.05 s, a measure goes there',async({page,browserName})=>{
 test.skip(browserName==='webkit',PLAYS);
 await setup(page,{sync:PLAYED});const dialog=await open(page),sheet=await openSync(page,dialog);
 await expect(sheet.locator('[data-sync-count]')).toHaveText('찍은 곳 13');
 await expect(sheet.locator('[data-sync-nudge]')).toBeHidden();
 await sheet.getByRole('button',{name:'확인',exact:true}).click();
 await expect(sheet.locator('[data-sync-nudge]')).toBeVisible();await expect(sheet.locator('[data-sync-undo]')).toBeHidden();await expect(sheet.locator('[data-sync-lines]')).toBeHidden();
 await expect.poll(async()=>(await mr(page)).paused).toBe(false);
 // The measure shown is the one the model gives for the MR's time, as it plays.
 await mrSeek(page,2.2);await expect(sheet.locator('[data-sync-pageno]')).toHaveText('1 / 2쪽');await expect(sheet.locator('.score-sync-box[data-state=now]')).toHaveCount(1);
 for(let i=0;i<6;i++){
  const seen=await page.evaluate(()=>({time:window.__players.at(-1).el.currentTime,number:document.querySelector('.score-sync-box[data-state=now]')?.dataset.number||''}));
  const late=await mr(page);
  expect([Math.floor(seen.time-.15),Math.floor(seen.time),Math.floor(late.time)].map(String)).toContain(seen.number);
  await page.waitForTimeout(280);
 }
 // Pages follow: measure 9 starts at 13 s on page 2.
 await mrSeek(page,13.2);await expect(sheet.locator('[data-sync-pageno]')).toHaveText('2 / 2쪽');await expect(sheet.locator('.score-sync-box[data-state=now]')).toHaveAttribute('data-number','9');
 await expect(sheet.locator('[data-sync-now]')).toHaveText('지금 9마디');
 // A measure pressed here plays from there; pressed again it goes to the next time it sounds.
 await sheet.locator('.score-sync-box[data-number="10"]').click();await expect(sheet.locator('[data-sync-guide]')).toContainText('아직 위치를 몰라요');
 await sheet.locator('[data-sync-prev]').click();
 await sheet.locator('.score-sync-box[data-number="6"]').click();
 await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(5.99);expect((await mr(page)).time).toBeLessThan(6.9);
 await sheet.locator('.score-sync-box[data-number="6"]').click();
 await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(9.99);expect((await mr(page)).time).toBeLessThan(10.9);
 // Nudge: three steps earlier, one back.
 await expect(sheet.locator('[data-sync-offset]')).toHaveText('0.00초');
 const earlier=sheet.getByRole('button',{name:'전체 앞당기기',exact:true}),later=sheet.getByRole('button',{name:'전체 늦추기',exact:true});
 await earlier.click();await earlier.click();await earlier.click();await expect(sheet.locator('[data-sync-offset]')).toHaveText('−0.15초');
 await later.click();await expect(sheet.locator('[data-sync-offset]')).toHaveText('−0.10초');
 await sheet.locator('[data-sync-play]').click();await expect.poll(async()=>(await mr(page)).paused).toBe(true);
 await mrSeek(page,4.95);await expect(sheet.locator('.score-sync-box[data-state=now]')).toHaveAttribute('data-number','5'); // 0.1 s earlier than tapped
 await sheet.locator('[data-sync-save]').click();await expect(sheet).toHaveCount(0);
 const stored=await savedSync(page);
 expect(stored.raw.o).toBe(-10);expect(stored.read.offset).toBe(-.1);expect(stored.read.anchors).toEqual(PLAYED); // the taps themselves are kept
});

test('재생 위치 따라가기: the measure sounding now is marked while the MR plays, pages follow — not under a writing hand',async({page,browserName})=>{
 test.skip(browserName==='webkit',PLAYS);
 await setup(page,{sync:PLAYED});const dialog=await open(page);
 await expect(nowBox(dialog)).toHaveCount(0);
 await bar(dialog).getByRole('button',{name:'재생',exact:true}).click();
 await expect(bar(dialog).getByRole('group',{name:'MR 재생 중'})).toBeVisible();
 await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(1.05);
 // Marked without 마디 위치 보기: only the one measure, lightly, and it moves on with the music.
 await expect(nowBox(dialog)).toHaveCount(1);await expect(dialog.locator('[data-ink-measures] .score-measure-box')).toHaveCount(0);
 for(let i=0;i<5;i++){
  const seen=await page.evaluate(()=>({time:window.__players.at(-1).el.currentTime,number:document.querySelector('[data-ink-measures] .score-measure-now')?.dataset.number||''}));
  const late=await mr(page);
  expect([Math.floor(seen.time-.15),Math.floor(seen.time),Math.floor(late.time)].map(String)).toContain(seen.number);
  await page.waitForTimeout(300);
 }
 expect(await nowBox(dialog).evaluate(n=>getComputedStyle(n).pointerEvents)).toBe('none');
 // The second time measures 5–8 sound (9–13 s) the same boxes are marked again; then page 2 for measure 9.
 await mrSeek(page,10.3);await expect(nowBox(dialog)).toHaveAttribute('data-number','6');
 await mrSeek(page,12.8);await expect(nowBox(dialog)).toHaveAttribute('data-number','9',{timeout:4000});
 await expect(dialog.locator('[data-ink-page]')).toHaveText('2 / 2쪽');
 // Writing: the page does not turn away under the pen. It follows again once the hand has been still for a while.
 await bar(dialog).getByRole('button',{name:'일시정지',exact:true}).click();await expect(nowBox(dialog)).toHaveCount(1); // kept while paused
 await dialog.getByRole('button',{name:'펜',exact:true}).click();
 const r=await dialog.locator('[data-ink-svg]').boundingBox();
 await page.mouse.move(r.x+r.width*.3,r.y+r.height*.6);await page.mouse.down();await page.mouse.move(r.x+r.width*.5,r.y+r.height*.62,{steps:4});await page.mouse.up();
 await expect.poll(()=>page.evaluate(()=>(window.VZ.db.scoreAnnotations||[]).length)).toBe(1);
 const wrote=Date.now();
 await mrSeek(page,1.3);await bar(dialog).getByRole('button',{name:'계속',exact:true}).click();
 await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(2.1);
 expect(Date.now()-wrote).toBeLessThan(2800);await expect(dialog.locator('[data-ink-page]')).toHaveText('2 / 2쪽');await expect(nowBox(dialog)).toHaveCount(0); // measure 2 is on page 1
 await expect(dialog.locator('[data-ink-page]')).toHaveText('1 / 2쪽',{timeout:6000});await expect(nowBox(dialog)).toHaveCount(1);
 // Off: no mark, no page turns; kept on this device.
 await more(dialog);await followItem(dialog).click();await expect(followItem(dialog)).toHaveAttribute('aria-pressed','false');
 await expect(nowBox(dialog)).toHaveCount(0);
 await mrSeek(page,13.05);await page.waitForTimeout(600);await expect(dialog.locator('[data-ink-page]')).toHaveText('1 / 2쪽');await expect(nowBox(dialog)).toHaveCount(0);
 expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),FOLLOW)).toEqual({follow:false});
 // On again: it picks the music up where it is — measure 9, on page 2.
 await bar(dialog).getByRole('button',{name:'일시정지',exact:true}).click();await mrSeek(page,13.05);
 await more(dialog);await followItem(dialog).click();await expect(followItem(dialog)).toHaveAttribute('aria-pressed','true');
 await bar(dialog).getByRole('button',{name:'계속',exact:true}).click();
 await expect(dialog.locator('[data-ink-page]')).toHaveText('2 / 2쪽',{timeout:4000});
 // ■ stops the MR: the mark goes.
 await bar(dialog).getByRole('button',{name:'정지',exact:true}).click();await expect(nowBox(dialog)).toHaveCount(0);
 await expect(bar(dialog).getByRole('button',{name:'재생',exact:true})).toBeVisible();
});

test('표시한 마디: ▶ loops the MR over the row’s measures with a lead-in; 앞 마디 포함, 다음 등장, 속도, 멈춤; recording is untouched',async({page,browserName})=>{
 test.skip(browserName==='webkit',PLAYS);
 await setup(page,{sync:PLAYED,rows:[
  stroke(1,'pen',[[60,70],[64,76],[68,70]],{mark:'breath',width:.006}),   // 숨표 on measure 1
  stroke(1,'highlighter',[[100,208],[200,208]]),                          // 형광펜 over measures 6–7
  stroke(2,'highlighter',[[100,108],[140,108]])]});                       // 형광펜 on measure 10: never tapped
 const dialog=await open(page);
 await more(dialog);await listItem(dialog).click();
 let list=page.getByRole('dialog',{name:'표시한 마디'});
 await expect(list.locator('[data-sync-need]')).toHaveCount(0);
 await expect(list.locator('[data-measure-row]')).toHaveCount(3);await expect(list.locator('[data-measure-loop]')).toHaveCount(3);
 for(const b of await list.locator('[data-measure-loop]').all()){const r=await b.boundingBox();expect(r.width).toBeGreaterThanOrEqual(44);expect(r.height).toBeGreaterThanOrEqual(44);}
 await expect(list.getByRole('button',{name:'10마디 반복 재생',exact:true})).toBeDisabled(); // no time for it in the sync
 // The row itself still only goes to the measure.
 await list.locator('[data-measure-row]').first().click();await expect(list).toHaveCount(0);
 await expect(bar(dialog).getByRole('button',{name:'재생',exact:true})).toBeVisible();
 await more(dialog);await listItem(dialog).click();list=page.getByRole('dialog',{name:'표시한 마디'});
 await list.getByRole('button',{name:'6–7마디 반복 재생',exact:true}).click();
 await expect(list).toHaveCount(0);
 const loop=bar(dialog).getByRole('group',{name:'마디 반복 재생'});
 await expect(loop).toBeVisible();await expect(loop.locator('[data-score-audio-loop-label]')).toHaveText('6–7마디 반복 중');
 const stop=loop.getByRole('button',{name:'반복 멈춤',exact:true}),lead=loop.getByRole('button',{name:'앞 마디 포함',exact:true}),rate=loop.locator('[data-score-audio-loop-rate]'),next=loop.locator('[data-score-audio-loop-next]');
 await expect(stop).toBeVisible();await expect(lead).toHaveAttribute('aria-pressed','true');await expect(rate).toHaveText('1×');await expect(next).toHaveText('다음 1/2');
 await expect(dialog.locator('[data-ink-measures] .score-measure-flash')).toHaveCount(2); // the row's measures are shown as before
 // First time measures 6–7 sound: 6–8 s, with measure 5 (5–6 s) as lead-in. It wraps and never leaves that stretch.
 const watch=async(ms,low,high)=>{const seen=[];for(const end=Date.now()+ms;Date.now()<end;){seen.push((await mr(page)).time);await page.waitForTimeout(60);}
  for(const t of seen){expect(t).toBeGreaterThanOrEqual(low);expect(t).toBeLessThanOrEqual(high);}return seen;};
 const wrapped=seen=>seen.some((t,i)=>i&&t<seen[i-1]-.5);
 await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(4.95);
 let seen=await watch(1200,4.95,8.15);expect(wrapped(seen)).toBe(false);
 for(const b of [stop,lead,rate,next])expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
 await mrSeek(page,7.6);seen=await watch(1300,4.95,8.15);expect(wrapped(seen)).toBe(true);
 await expect(nowBox(dialog)).toHaveCount(1); // 재생 위치 따라가기 runs during a loop too
 // 앞 마디 포함 off: from measure 6 itself.
 await lead.click();await expect(lead).toHaveAttribute('aria-pressed','false');
 await mrSeek(page,7.7);await page.waitForTimeout(500);seen=await watch(1000,5.95,8.15);
 // 다음 등장: the second time they sound, 10–12 s.
 await next.click();await expect(next).toHaveText('다음 2/2');await expect(loop.locator('[data-score-audio-loop-label]')).toHaveText('6–7마디 반복 중');
 await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(9.95);
 await mrSeek(page,11.7);seen=await watch(1100,9.95,12.15);expect(wrapped(seen)).toBe(true);
 await next.click();await expect(next).toHaveText('다음 1/2');await expect.poll(async()=>(await mr(page)).time).toBeLessThan(8.15);
 // 속도 0.75× and back.
 await rate.click();await expect(rate).toHaveText('0.75×');await expect(rate).toHaveAttribute('aria-pressed','true');expect((await mr(page)).rate).toBe(.75);
 // 멈춤: the bar is back as it was, at normal speed.
 await stop.click();
 await expect(bar(dialog).getByRole('button')).toHaveText(['재생','녹음','재생+녹음']);
 expect(await mr(page)).toMatchObject({paused:true,rate:1});await expect(nowBox(dialog)).toHaveCount(0);
 // Recording works as before, and a loop cannot start over a take.
 await bar(dialog).getByRole('button',{name:'녹음',exact:true}).click();
 await expect(bar(dialog).getByRole('group',{name:'녹음 중'})).toBeVisible({timeout:10000});
 await more(dialog);await listItem(dialog).click();
 await page.getByRole('dialog',{name:'표시한 마디'}).getByRole('button',{name:'1마디 반복 재생',exact:true}).click();
 await expect(page.locator('.toast')).toHaveText('녹음을 끝낸 뒤에 들을 수 있어요.');
 await expect(bar(dialog).getByRole('group',{name:'녹음 중'})).toBeVisible();await expect(loop).toHaveCount(0);
 await bar(dialog).getByRole('button',{name:'정지',exact:true}).click();
 await expect(bar(dialog).getByRole('button',{name:'저장',exact:true})).toBeVisible({timeout:10000});
 await bar(dialog).getByRole('button',{name:'버리기',exact:true}).click();
 await page.getByRole('dialog',{name:'녹음 버리기'}).getByRole('button',{name:'버리기',exact:true}).click();
 await expect(bar(dialog).getByRole('button')).toHaveText(['재생','녹음','재생+녹음']);
});

test('마디 위치 보기 on: pressing and holding a measure box offers 여기서 재생 and 이 마디 반복',async({page,browserName})=>{
 test.skip(browserName==='webkit',PLAYS);
 await setup(page,{sync:PLAYED,boxes:true});const dialog=await open(page);
 await expect(dialog.locator('[data-ink-measures] .score-measure-box')).toHaveCount(8);
 const hold=async(number,ms=750)=>{const p=await boxCentre(dialog,number);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.waitForTimeout(ms);await page.mouse.up();};
 const menu=n=>page.getByRole('dialog',{name:n+'마디 메뉴'});
 // A short press and a press that moves are not a hold.
 await hold(2,200);await expect(page.locator('.sheet-menu')).toHaveCount(0);
 const p=await boxCentre(dialog,2);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+30,p.y+4,{steps:3});await page.waitForTimeout(750);await page.mouse.up();
 await expect(page.locator('.sheet-menu')).toHaveCount(0);
 await hold(2);
 await expect(menu(2)).toBeVisible();await expect(menu(2).locator('.score-sync-menu-title')).toHaveText('2마디');
 await expect(menu(2).getByRole('button')).toHaveText([/여기서 재생/,/이 마디 반복/]);
 for(const b of await menu(2).getByRole('button').all())expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
 await menu(2).getByRole('button',{name:'여기서 재생'}).click();
 await expect(bar(dialog).getByRole('group',{name:'MR 재생 중'})).toBeVisible();
 await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(2);expect((await mr(page)).time).toBeLessThan(3.2);
 await expect(nowBox(dialog)).toHaveAttribute('data-number',/^[23]$/);
 // From the playing MR straight into a loop of one measure: 3 s → 4 s with measure 2 before it.
 await hold(3);await menu(3).getByRole('button',{name:'이 마디 반복'}).click();
 const loop=bar(dialog).getByRole('group',{name:'마디 반복 재생'});
 await expect(loop.locator('[data-score-audio-loop-label]')).toHaveText('3마디 반복 중');await expect(loop.locator('[data-score-audio-loop-next]')).toHaveCount(0);
 await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(1.95);
 for(let i=0;i<12;i++){const t=(await mr(page)).time;expect(t).toBeGreaterThanOrEqual(1.95);expect(t).toBeLessThanOrEqual(4.15);await page.waitForTimeout(80);}
 await loop.getByRole('button',{name:'반복 멈춤',exact:true}).click();await expect(bar(dialog).getByRole('button',{name:'재생',exact:true})).toBeVisible();
 // With a tool that draws, holding still writes: no menu.
 await dialog.getByRole('button',{name:'펜',exact:true}).click();await hold(2);await expect(page.locator('.sheet-menu')).toHaveCount(0);
 await dialog.getByRole('button',{name:'이동',exact:true}).click();
 // With 마디 위치 보기 off there is nothing to hold.
 await more(dialog);await dialog.locator('[data-ink-measure-boxes]').click();await hold(2);await expect(page.locator('.sheet-menu')).toHaveCount(0);
});

test('without a sync the list and the held measure say what matching gives, with a way to the 맞추기 screen',async({page})=>{
 await setup(page,{boxes:true,rows:[stroke(1,'highlighter',[[100,208],[200,208]])]});const dialog=await open(page);
 await more(dialog);await listItem(dialog).click();
 const list=page.getByRole('dialog',{name:'표시한 마디'}),need=list.locator('[data-sync-need]');
 await expect(need).toContainText('MR과 맞추면 이 마디만 반복해서 들을 수 있어요.');await expect(need).toHaveAttribute('data-state','none');
 await expect(list.locator('[data-measure-loop]')).toHaveCount(0);await expect(list.locator('[data-measure-row] .ph-caret-right')).toHaveCount(1);
 const go=need.getByRole('button',{name:'맞추기',exact:true});expect((await go.boundingBox()).height).toBeGreaterThanOrEqual(44);
 await go.click();await expect(list).toHaveCount(0);
 await expect(syncSheet(page).locator('[data-sync-page]')).toBeVisible({timeout:15000});
 await syncSheet(page).getByRole('button',{name:'취소',exact:true}).click();await expect(syncSheet(page)).toHaveCount(0);
 const p=await boxCentre(dialog,6);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.waitForTimeout(750);await page.mouse.up();
 const menu=page.getByRole('dialog',{name:'6마디 메뉴'});
 await expect(menu.locator('[data-sync-need]')).toHaveText('MR과 맞추면 이 마디만 반복해서 들을 수 있어요.');
 await expect(menu.getByRole('button')).toHaveText([/MR과 맞추기/]);
 await menu.getByRole('button',{name:'MR과 맞추기'}).click();await expect(syncSheet(page).locator('[data-sync-page]')).toBeVisible({timeout:15000});
});

test('다시 맞춰야 해요: a sync is not used once its MR was deleted or the score was converted again',async({page,browserName})=>{
 const {omr}=await setup(page,{tracks:[FILE,FILE2],sync:PLAYED,rows:[stroke(1,'highlighter',[[100,208],[200,208]])]});
 let dialog=await open(page);
 await more(dialog);await expect(syncItem(dialog)).toHaveText('마디와 MR 맞추기');await expect(followItem(dialog)).toHaveCount(1);
 await dialog.locator('[data-ink-more]').click();
 // The MR it was made for is deleted (as the 레퍼런스 tab does it): the other MR must be matched anew.
 await page.evaluate(()=>window.VZ.change(d=>{const t=d.songs[0].mrTracks[0];t.deleted=true;t.updatedAt=Date.now();},{silent:true}));
 await more(dialog);
 await expect(syncItem(dialog)).toHaveText('마디와 MR 맞추기다시 맞춰야 해요');await expect(syncItem(dialog)).toHaveAttribute('data-state','stale');
 await expect(syncItem(dialog).locator('.score-sync-menu-note')).toHaveText('다시 맞춰야 해요');await expect(followItem(dialog)).toHaveCount(0);
 await listItem(dialog).click();
 let list=page.getByRole('dialog',{name:'표시한 마디'});
 await expect(list.locator('[data-sync-need]')).toHaveAttribute('data-state','stale');
 await expect(list.locator('[data-sync-need]')).toContainText('다시 맞춰야 해요. 맞춘 MR이 지워졌어요.');await expect(list.locator('[data-measure-loop]')).toHaveCount(0);
 await list.getByRole('button',{name:'다시 맞추기',exact:true}).click();
 // The 맞추기 screen starts empty for the MR that is left and says why.
 const sheet=syncSheet(page);await expect(sheet.locator('[data-sync-page]')).toBeVisible({timeout:15000});
 await expect(sheet.locator('[data-sync-track-name]')).toHaveText('느린 MR');await expect(sheet.locator('[data-sync-count]')).toHaveText('찍은 곳 0');
 await sheet.getByRole('button',{name:'취소',exact:true}).click();await expect(sheet).toHaveCount(0);
 if(browserName!=='webkit'){ // playing the other MR marks nothing
  await bar(dialog).getByRole('button',{name:'재생',exact:true}).click();await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(1.3);
  expect((await mr(page)).id).toBe('mr-2');await expect(nowBox(dialog)).toHaveCount(0);
  await bar(dialog).getByRole('button',{name:'정지',exact:true}).click();
 }
 // The saved taps were left as they are (they are only not used).
 expect((await savedSync(page)).read.anchors).toEqual(PLAYED);
 // Back with its MR, but converted again with one measure fewer: stale for another reason.
 await page.evaluate(()=>window.VZ.change(d=>{delete d.songs[0].mrTracks[0].deleted;},{silent:true}));
 // The bar still has the other MR chosen: that one simply has no sync. Choosing the first MR brings its sync back.
 await more(dialog);await expect(syncItem(dialog)).toHaveText('마디와 MR 맞추기');await expect(syncItem(dialog)).toHaveAttribute('data-state','none');await expect(followItem(dialog)).toHaveCount(0);
 await dialog.locator('[data-ink-more]').click();
 await bar(dialog).getByLabel('MR 선택').selectOption('mr-1');
 await more(dialog);await expect(syncItem(dialog)).toHaveAttribute('data-state','ok');await expect(followItem(dialog)).toHaveCount(1);
 await dialog.getByRole('button',{name:'돌아가기',exact:true}).click();await expect(dialog).toHaveCount(0);
 const fewer=[SYSTEMS[0],SYSTEMS[1],{...SYSTEMS[2],measures:[[9,330],[10,330],[11,340]]}];
 omr.put(musicxml(fewer),2);
 dialog=await open(page);
 await more(dialog);await expect(syncItem(dialog).locator('.score-sync-menu-note')).toHaveText('다시 맞춰야 해요');await expect(followItem(dialog)).toHaveCount(0);
 await listItem(dialog).click();list=page.getByRole('dialog',{name:'표시한 마디'});
 await expect(list.locator('[data-sync-need]')).toContainText('악보를 다시 변환해서 마디 수가 달라졌어요.');
 await list.getByRole('button',{name:'다시 맞추기',exact:true}).click();
 await expect(syncSheet(page).locator('[data-sync-guide]')).toContainText('처음부터 다시 맞춰야 해요');await expect(syncSheet(page).locator('[data-sync-count]')).toHaveText('찍은 곳 0');
});

test('a song with only a YouTube MR: 맞추기 says it needs an MR file',async({page})=>{
 await setup(page,{tracks:[TUBE],rows:[stroke(1,'highlighter',[[100,208],[200,208]])]});const dialog=await open(page);
 await more(dialog);await expect(syncItem(dialog)).toHaveText('마디와 MR 맞추기');await expect(followItem(dialog)).toHaveCount(0);
 await syncItem(dialog).click();
 const alert=page.getByRole('dialog',{name:'MR 파일이 필요해요'});
 await expect(alert.locator('[data-sync-explain]')).toHaveText('유튜브 MR은 앱이 재생 위치를 알 수 없어서 마디와 맞출 수 없어요. 맞추기는 올려 둔 MR 파일로만 할 수 있어요. 곡의 레퍼런스 탭에서 MR 파일을 추가한 뒤 다시 열어 주세요.');
 await expect(syncSheet(page)).toHaveCount(0);
 await alert.getByRole('button',{name:'확인',exact:true}).click();await expect(alert).toHaveCount(0);
 // The list still says what matching would give; its button leads to the same explanation.
 await more(dialog);await listItem(dialog).click();
 await page.getByRole('dialog',{name:'표시한 마디'}).locator('[data-sync-need]').getByRole('button',{name:'맞추기',exact:true}).click();
 await expect(alert).toBeVisible();await alert.getByRole('button',{name:'확인',exact:true}).click();
 // A song with no MR at all: the list says nothing about it, the menu item explains.
 await page.evaluate(()=>window.VZ.change(d=>{d.songs[0].mrTracks=[];},{silent:true}));
 await more(dialog);await listItem(dialog).click();
 await expect(page.getByRole('dialog',{name:'표시한 마디'}).locator('[data-measure-row]')).toHaveCount(1);await expect(page.getByRole('dialog',{name:'표시한 마디'}).locator('[data-sync-need]')).toHaveCount(0);
 await page.getByRole('dialog',{name:'표시한 마디'}).getByRole('button',{name:'돌아가기',exact:true}).click();
 await more(dialog);await syncItem(dialog).click();
 await expect(alert.locator('[data-sync-explain]')).toContainText('이 곡에는 아직 MR 파일이 없어요.');
});

test('several MR files: the screen matches the one chosen, each MR keeps its own sync',async({page,browserName})=>{
 test.skip(browserName==='webkit',PLAYS);
 await setup(page,{tracks:[FILE,FILE2,TUBE],sync:PLAYED});const dialog=await open(page),sheet=await openSync(page,dialog);
 const pick=sheet.getByLabel('맞출 MR');
 await expect(pick.locator('option')).toHaveText(['연습 MR','느린 MR']); // no YouTube MR here
 await expect(pick).toHaveValue('mr-1');await expect(sheet.locator('[data-sync-count]')).toHaveText('찍은 곳 13');
 await pick.selectOption('mr-2');await expect(sheet.locator('[data-sync-count]')).toHaveText('찍은 곳 0');
 await big(sheet).click();await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(.2);expect((await mr(page)).id).toBe('mr-2');
 await big(sheet).click();await page.waitForTimeout(300);await big(sheet).click();
 // Changing the MR with taps not saved asks first.
 await pick.selectOption('mr-1');
 const ask=page.getByRole('dialog',{name:'MR 바꾸기'});await ask.getByRole('button',{name:'취소',exact:true}).click();
 await expect(pick).toHaveValue('mr-2');await expect(sheet.locator('[data-sync-count]')).toHaveText('찍은 곳 2');
 await sheet.locator('[data-sync-save]').click();await expect(sheet).toHaveCount(0);
 expect((await savedSync(page,'mr-2')).read.anchors.map(a=>a.m)).toEqual([0,1]);
 expect((await savedSync(page,'mr-1')).read.anchors).toEqual(PLAYED);
});

test('320px: the 맞추기 screen, the loop bar and the list rows stay inside the screen',async({page,browserName})=>{
 await page.setViewportSize({width:320,height:640});
 await setup(page,{sync:PLAYED,rows:[stroke(1,'highlighter',[[100,208],[200,208]])]});const dialog=await open(page);
 const inside=async locator=>{const r=await locator.boundingBox();expect(r.x).toBeGreaterThanOrEqual(-.5);expect(r.x+r.width).toBeLessThanOrEqual(320.5);return r;};
 const noOverflow=()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('.sheet')].every(s=>s.scrollWidth<=s.clientWidth+1));
 await more(dialog);await inside(syncItem(dialog));await inside(followItem(dialog));
 for(const b of [syncItem(dialog),followItem(dialog)]){const r=await b.boundingBox();expect(r.width).toBeGreaterThanOrEqual(44);expect(r.height).toBeGreaterThanOrEqual(44);}
 const sheet=await openSync(page,dialog);
 expect((await inside(big(sheet))).height).toBeGreaterThanOrEqual(56);
 for(const b of await sheet.locator('.score-sync-tools button:visible,.score-sync-modes button,.score-sync-pages button').all())expect((await inside(b)).height).toBeGreaterThanOrEqual(44);
 for(const name of ['취소','저장'])expect((await inside(sheet.getByRole('button',{name,exact:true}))).height).toBeGreaterThanOrEqual(44);
 await inside(sheet.locator('[data-sync-stage]'));await inside(sheet.locator('[data-sync-guide]'));await inside(sheet.locator('.score-sync-status'));
 const stage=await sheet.locator('[data-sync-stage]').boundingBox();expect(stage.height).toBeGreaterThanOrEqual(120);
 expect(await noOverflow()).toBe(true);
 await sheet.getByRole('button',{name:'확인',exact:true}).click();
 for(const b of await sheet.locator('.score-sync-nudge button').all())expect((await inside(b)).height).toBeGreaterThanOrEqual(44);
 await inside(sheet.locator('[data-sync-offset]'));expect(await noOverflow()).toBe(true);
 await sheet.locator('[data-sync-play]').click();
 await sheet.getByRole('button',{name:'취소',exact:true}).click();await expect(sheet).toHaveCount(0);
 await more(dialog);await listItem(dialog).click();
 const list=page.getByRole('dialog',{name:'표시한 마디'});
 await inside(list.locator('.score-measure-line'));await inside(list.locator('[data-measure-loop]'));expect(await noOverflow()).toBe(true);
 if(browserName==='webkit')return; // the loop bar needs the MR to play
 await list.locator('[data-measure-loop]').click();
 const loop=bar(dialog).getByRole('group',{name:'마디 반복 재생'});
 await expect(loop).toBeVisible();await page.waitForTimeout(1100);await inside(loop); // after it has popped in
 // A thin strip under the score (it never lies over the page); each control is still a 44px box.
 expect((await bar(dialog).boundingBox()).height).toBeLessThanOrEqual(46);
 for(const b of await loop.getByRole('button').all())expect((await inside(b)).height).toBeGreaterThanOrEqual(43.5);
 expect(await noOverflow()).toBe(true);
});

for(const [width,height] of [[1024,768],[820,1180]])test('tablet '+width+'×'+height+': the whole page beside or above the controls, taps work',async({page},info)=>{
 test.skip(info.project.name!=='chromium-desktop','sizes are set explicitly');
 await page.setViewportSize({width,height});
 await setup(page);const dialog=await open(page),sheet=await openSync(page,dialog);
 const stage=await sheet.locator('[data-sync-stage]').boundingBox(),panel=await sheet.locator('.score-sync-panel').boundingBox(),pageBox=await sheet.locator('[data-sync-page]').boundingBox(),tap=await big(sheet).boundingBox();
 expect(tap.height).toBeGreaterThanOrEqual(56);
 // The whole page is in view, with every measure of it.
 expect(pageBox.y).toBeGreaterThanOrEqual(stage.y);expect(pageBox.y+pageBox.height).toBeLessThanOrEqual(stage.y+stage.height+.5);expect(pageBox.width).toBeGreaterThan(300);
 if(width>height){expect(panel.x).toBeGreaterThanOrEqual(stage.x+stage.width);expect(panel.width).toBeLessThanOrEqual(341);expect(stage.height).toBeGreaterThan(height*.7);}
 else{expect(panel.y).toBeGreaterThanOrEqual(stage.y+stage.height);expect(Math.abs(panel.width-stage.width)).toBeLessThan(2);}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await big(sheet).click();await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(.2);
 await big(sheet).click();await page.waitForTimeout(250);await big(sheet).click();
 await expect(sheet.locator('[data-sync-count]')).toHaveText('찍은 곳 2');await expect(sheet.locator('.score-sync-box[data-state=now]')).toHaveAttribute('data-number','2');
 await sheet.locator('[data-sync-save]').click();await expect(sheet).toHaveCount(0);
 expect((await savedSync(page)).read.anchors.map(a=>a.m)).toEqual([0,1]);
});

test.describe('screens for review (only with VZ_SHOTS)',()=>{
 test.use({deviceScaleFactor:2});
 const rows=[stroke(1,'pen',[[60,70],[64,76],[68,70]],{mark:'breath',width:.006}),stroke(1,'highlighter',[[100,208],[200,208]]),
  {page:1,tool:'note',color:'#fbe88c',rect:[40/PW,236/PH,.4,.07],mode:'text',text:'여기서 숨 크게 쉬기'},stroke(2,'highlighter',[[40,108],[80,108]])];
 test('phone 375',async({page},info)=>{
  test.skip(!process.env.VZ_SHOTS||info.project.name!=='chromium-mobile','only when screenshots are asked for');
  test.setTimeout(90000);
  await page.setViewportSize({width:375,height:812});
  await setup(page,{sync:PLAYED.slice(0,6),rows,boxes:true});const dialog=await open(page);
  await page.waitForTimeout(600);await page.screenshot({path:process.env.VZ_SHOTS+'/bar-idle-375.png'});
  await bar(dialog).getByRole('button',{name:'재생',exact:true}).click();await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(.6);
  await page.screenshot({path:process.env.VZ_SHOTS+'/bar-live-375.png'});
  await bar(dialog).getByRole('button',{name:'정지',exact:true}).click();
  const sheet=await openSync(page,dialog);
  await big(sheet).click();await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(.2);
  await mrSeek(page,7);await big(sheet).click();await expect(sheet.locator('[data-sync-count]')).toHaveText('찍은 곳 7');await page.waitForTimeout(400);
  await page.screenshot({path:process.env.VZ_SHOTS+'/sync-tap-375.png'});
  await sheet.getByRole('button',{name:'확인',exact:true}).click();await mrSeek(page,3.3);await expect(sheet.locator('.score-sync-box[data-state=now]')).toHaveAttribute('data-number','3');
  await sheet.getByRole('button',{name:'전체 앞당기기',exact:true}).click();await page.waitForTimeout(300);
  await page.screenshot({path:process.env.VZ_SHOTS+'/sync-check-375.png'});
  await sheet.locator('[data-sync-save]').click();await expect(sheet).toHaveCount(0);await page.waitForTimeout(2800);
  await more(dialog);await page.screenshot({path:process.env.VZ_SHOTS+'/sync-menu-375.png'});
  await listItem(dialog).click();const list=page.getByRole('dialog',{name:'표시한 마디'});await expect(list.locator('[data-measure-loop]').first()).toBeVisible();
  await page.screenshot({path:process.env.VZ_SHOTS+'/sync-list-375.png'});
  await list.getByRole('button',{name:'6–7마디 반복 재생',exact:true}).click();
  await expect(bar(dialog).getByRole('group',{name:'마디 반복 재생'})).toBeVisible();await expect(nowBox(dialog)).toHaveCount(1);await page.waitForTimeout(2600);
  await page.screenshot({path:process.env.VZ_SHOTS+'/sync-loop-375.png'});
  await bar(dialog).getByRole('button',{name:'반복 멈춤',exact:true}).click();
  const p=await boxCentre(dialog,3);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.waitForTimeout(750);await page.mouse.up();
  await expect(page.locator('.sheet-menu')).toBeVisible();await page.screenshot({path:process.env.VZ_SHOTS+'/sync-hold-menu-375.png'});
 });
 test('tablet 1024',async({page},info)=>{
  test.skip(!process.env.VZ_SHOTS||info.project.name!=='chromium-desktop','only when screenshots are asked for');
  await page.setViewportSize({width:1024,height:768});
  await setup(page,{sync:PLAYED.slice(0,6),rows});const dialog=await open(page),sheet=await openSync(page,dialog);
  await big(sheet).click();await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(.2);
  await mrSeek(page,7);await big(sheet).click();await expect(sheet.locator('[data-sync-count]')).toHaveText('찍은 곳 7');await page.waitForTimeout(400);
  await page.screenshot({path:process.env.VZ_SHOTS+'/sync-tap-1024.png'});
 });
});
