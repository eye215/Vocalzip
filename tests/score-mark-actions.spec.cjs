/* 표기의 기능, 마디 선택 and 직접 그리기 (app/score-mark-model.js, app/score-sync.js, the play bar in app/score-audio.js, the 기능 field of the
 * marker editor in app/score-ink.js): 시작점 · 반복 · 컷 marks do something once the score is matched with an MR,
 * a mark can be placed on whole measures (마디 선택 — 컷 by default, a preset's 찍는 방식 in 표기 편집; on a score
 * of several staves per line it covers them all), and a preset can be a symbol the user drew (직접 그리기).
 * The fixtures are those of tests/score-sync.spec.cjs: 12 measures of 4/4 in three lines (1–4 and 5–8 on page 1,
 * 9–12 on page 2) and a generated tone as the MR, matched one measure a second (measure n starts at n seconds).
 * WebKit: every test that plays the MR is skipped there (PLAYS), as in tests/score-sync.spec.cjs; the tests that only
 * look at menus, the list, the editor and messages run everywhere. */
const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {boot,fakeR2,R2,KEY:STORE,wav}=require('./helpers/r2-fixture.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PDFROOT=process.env.VZ_PDFJS_ROOT||'/tmp/vzip-score-pdfjs/node_modules/pdfjs-dist';
const PLAYS='plays the MR: real audio playback and seeking are checked in Chromium';
const PW=300,PH=400,UNIT=.4,STAFF=16,STAFFGAP=20;
/** How high a system is: its staves (voice + piano = 3) with the room between them. */
const tall=s=>(s.staves||1)*STAFF+((s.staves||1)-1)*STAFFGAP;
const SYSTEMS=[
 {page:1,y:80,x0:30,x1:270,measures:[[1,250],[2,250],[3,250],[4,250]]},
 {page:1,y:200,x0:30,x1:270,measures:[[5,250],[6,250],[7,250],[8,250]]},
 {page:2,y:100,x0:30,x1:270,measures:[[9,250],[10,250],[11,250],[12,250]]}
];
function pdf(systems=SYSTEMS,pages=2){
 const stream=text=>'<< /Length '+Buffer.byteLength(text)+' >>\nstream\n'+text+'\nendstream';
 const content=n=>'BT /F1 10 Tf 20 380 Td (VOCAL.zip Score '+n+') Tj ET\n0 0 0 RG 1 w\n'+systems.filter(s=>s.page===n).map(s=>Array.from({length:s.staves||1},(_,k)=>[0,1,2,3,4].map(l=>{const y=PH-s.y-k*(STAFF+STAFFGAP)-l*4;return s.x0+' '+y+' m '+s.x1+' '+y+' l S';}).join('\n')).join('\n')).join('\n');
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
  const first=!last||last.page!==s.page,gap=first?'<top-system-distance>'+s.y/UNIT+'</top-system-distance>':'<system-distance>'+(s.y-last.y-tall(last))/UNIT+'</system-distance>';
  s.measures.forEach(([number,width],i)=>{
   body+='<measure number="'+number+'" width="'+width+'">'+(i?'':'<print'+(!last?'':first?' new-page="yes"':' new-system="yes"')+'><system-layout><system-margins><left-margin>'+s.x0/UNIT+'</left-margin><right-margin>'+(PW-s.x1)/UNIT+'</right-margin></system-margins>'+gap+'</system-layout>'+
    Array.from({length:(s.staves||1)-1},(_,j)=>'<staff-layout number="'+(j+2)+'"><staff-distance>'+STAFFGAP/UNIT+'</staff-distance></staff-layout>').join('')+'</print>')+
    (number===systems[0].measures[0][0]?'<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>'+(systems[0].staves>1?'<staves>'+systems[0].staves+'</staves>':'')+'<clef><sign>G</sign><line>2</line></clef></attributes>':'')+
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
 if(conversion)omr.put(conversion); // conversion: null → the score was never converted
 await page.route(R2+'/v1/omr**',route=>route.fulfill({json:{job:omr.job},headers:{'access-control-allow-origin':'*'}}));
 await page.context().route('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/**',route=>{
  const suffix=new URL(route.request().url()).pathname.split('pdfjs-dist@4.10.38/')[1],file=path.join(PDFROOT,suffix);
  if(!suffix||suffix.includes('..')||!fs.existsSync(file))return route.abort();
  return route.fulfill({path:file,contentType:file.endsWith('.mjs')?'text/javascript':'application/octet-stream',headers:{'access-control-allow-origin':'*'}});
 });
 await page.context().route('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/**',route=>route.fulfill({path:path.join(PDFROOT,'../pdf-lib/dist/pdf-lib.min.js'),contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}}));
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
/** The MR that is sounding (else the one made last): its real time and state. */
const mr=page=>page.evaluate(()=>{const all=window.__players,p=[...all].reverse().find(x=>!x.el.paused)||all.at(-1);return p?{time:p.el.currentTime,paused:p.el.paused,rate:p.el.playbackRate,duration:p.el.duration,id:p.item.id}:null;});
const mrSeek=(page,time)=>page.evaluate(t=>{const all=window.__players;([...all].reverse().find(x=>!x.el.paused)||all.at(-1)).el.currentTime=t;},time);
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

/** One measure a second: measure n starts at n seconds (measure 12 at 12 s, the MR is 16 s long). */
const EVEN=Array.from({length:12},(_,i)=>({t:i+1,m:i}));
const MARKS='vzip_score_marks_v1:'+OWNER,PRESETS='vzip_score_ink_settings_v1:'+OWNER;
// Marks as the viewer places them (PDF units: 300 × 400; line 1 at y 80–96, measures 60 wide from x 30).
const ring=(page,x,y,extra={})=>stroke(page,'pen',Array.from({length:21},(_,i)=>[x+5.4*Math.cos(i/10*Math.PI),y+5.4*Math.sin(i/10*Math.PI)]),{width:.006,...extra});
const bracket=(page,ax,ay,ex,ey,extra={})=>stroke(page,'pen',[[ax,ay-7],[ax,ay+7],[ex,ey+7],[ex,ey-7]],{width:.006,...extra});
const cover=(page,ax,y,ex,extra={})=>stroke(page,'highlighter',[[ax,y],[ex,y]],{width:.04,opacity:.25,...extra});
const START3=ring(1,180,112,{mark:'start'}),START10=ring(2,120,128,{mark:'start'});
const REPEAT67=bracket(1,95,186,205,186,{mark:'repeat'}),REPEAT34=bracket(1,155,60,265,60,{mark:'repeat'});
const CUT4=cover(1,225,88,255,{mark:'cut'});               // drawn inside measure 4: the whole measure is cut
const ALL=[START3,START10,REPEAT67,REPEAT34,CUT4];
/** A place of the PDF page (PDF units) on the screen, once the page has settled: the page is fitted again a moment
 * after the play bar shrinks to its chip or comes back. */
async function spot(dialog,x,y){
 const box=dialog.locator('[data-ink-box]');let r=await box.boundingBox();
 for(let i=0;i<20;i++){await dialog.page().waitForTimeout(180);const next=await box.boundingBox();if(next&&r&&['x','y','width','height'].every(k=>Math.abs(next[k]-r[k])<.5)){r=next;break;}r=next;}
 return {x:r.x+x/PW*r.width,y:r.y+y/PH*r.height};
}
async function tap(page,dialog,x,y){const p=await spot(dialog,x,y);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.up();}
/** 재생 옵션: the one button the bar gets for a score with 시작점 or 컷 marks, and the menu it opens. */
const opts=dialog=>bar(dialog).locator('[data-score-audio-opts]'),optsMenu=page=>page.getByRole('dialog',{name:'재생 옵션'});
const starts=page=>optsMenu(page).getByRole('group',{name:'재생을 시작할 곳'}).getByRole('button'),cutSwitch=page=>optsMenu(page).getByRole('button',{name:/컷 건너뛰기/});
async function pickStart(page,dialog,name){await opts(dialog).click();await optsMenu(page).getByRole('button',{name}).click();await expect(optsMenu(page)).toHaveCount(0);}
const play=dialog=>bar(dialog).getByRole('button',{name:'재생',exact:true}),stopPlay=dialog=>bar(dialog).getByRole('button',{name:'정지',exact:true});
/** The viewer with the score's marks read (the play bar has its 재생 옵션 button). */
async function openMarked(page){const dialog=await open(page);await expect(opts(dialog)).toBeVisible({timeout:10000});return dialog;}
/** A menu is left by pressing beside it. */
const closeMenu=page=>page.locator('.sheet-back.sheet-menu').click({position:{x:3,y:3}});
const openList=async(page,dialog)=>{await more(dialog);await listItem(dialog).click();const list=page.getByRole('dialog',{name:'표시한 마디'});await expect(list.locator('[data-measure-list]')).toBeVisible();return list;};
/** The MR's time every 50 ms for a while. */
async function watch(page,ms){const seen=[];for(const end=Date.now()+ms;Date.now()<end;){seen.push((await mr(page)).time);await page.waitForTimeout(50);}return seen;}
const prefs=page=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)||'null'),MARKS);
const annotations=page=>page.evaluate(()=>JSON.stringify((window.VZ.db.scoreAnnotations||[]).filter(s=>s.kind!=='marker-preset')));

test('시작점: 재생 옵션 in the play bar offers 처음부터 / 시작점 N마디에서, 재생 starts there, and the choice is remembered for the score',async({page,browserName})=>{
 test.skip(browserName==='webkit',PLAYS);
 await setup(page,{sync:EVEN,rows:ALL});let dialog=await openMarked(page);
 const before=await annotations(page);
 // One more button in the bar's row — the bar is still one row.
 await expect(opts(dialog)).toHaveAttribute('aria-label','재생 옵션: 처음부터, 컷 건너뛰기 켜짐');await expect(opts(dialog)).toHaveAttribute('data-lit','true');
 const size=await opts(dialog).boundingBox(),row=await bar(dialog).locator('.score-audio-row').boundingBox();
 expect(size.height).toBeGreaterThanOrEqual(44);expect(size.width).toBeGreaterThanOrEqual(44);expect(size.y).toBeGreaterThanOrEqual(row.y-.5);expect(size.y+size.height).toBeLessThanOrEqual(row.y+row.height+.5);
 expect((await bar(dialog).boundingBox()).height).toBeLessThanOrEqual(60);
 await expect(bar(dialog).getByRole('button')).toHaveText(['재생','녹음','재생+녹음','']);
 // The list: 처음부터, then the 시작점 of the page in view, then the others by page and measure.
 await opts(dialog).click();
 await expect(starts(page)).toHaveText(['처음부터','시작점 3마디에서1쪽','시작점 10마디에서2쪽']);
 await expect(optsMenu(page).getByRole('button',{name:'처음부터'})).toHaveAttribute('aria-pressed','true');
 await expect(cutSwitch(page)).toHaveText('컷 건너뛰기4마디 건너뜀');await expect(cutSwitch(page)).toHaveAttribute('aria-pressed','true');
 for(const b of await optsMenu(page).getByRole('button').all())expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
 await optsMenu(page).getByRole('button',{name:/시작점 3마디에서/}).click();await expect(optsMenu(page)).toHaveCount(0);
 await expect(opts(dialog)).toHaveAttribute('aria-label','재생 옵션: 시작점 3마디에서, 컷 건너뛰기 켜짐');
 expect((await prefs(page))[SCORE].s).toBe(2);
 // 재생 starts at measure 3 (3 s in this MR).
 await play(dialog).click();
 await expect(bar(dialog).getByRole('group',{name:'MR 재생 중'})).toBeVisible();
 await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(2.95);expect((await mr(page)).time).toBeLessThan(3.9);
 await stopPlay(dialog).click();await expect(play(dialog)).toBeVisible();
 // Again: from the 시작점 again, not from where it was stopped.
 await mrSeek(page,9);await play(dialog).click();
 await expect.poll(async()=>(await mr(page)).paused).toBe(false);await page.waitForTimeout(150);
 const again=(await mr(page)).time;expect(again).toBeGreaterThan(2.95);expect(again).toBeLessThan(3.9);
 await stopPlay(dialog).click();
 // Remembered when the score is opened again; on page 2 its own 시작점 comes first.
 await dialog.getByRole('button',{name:'돌아가기',exact:true}).click();await expect(dialog).toHaveCount(0);
 dialog=await openMarked(page);await expect(opts(dialog)).toHaveAttribute('aria-label','재생 옵션: 시작점 3마디에서, 컷 건너뛰기 켜짐');
 await dialog.locator('[data-ink-next]').click();await expect(dialog.locator('[data-ink-page]')).toHaveText('2 / 2쪽');
 await opts(dialog).click();
 await expect(starts(page)).toHaveText(['처음부터','시작점 10마디에서2쪽','시작점 3마디에서1쪽']);
 await expect(optsMenu(page).getByRole('button',{name:/시작점 3마디에서/})).toHaveAttribute('aria-pressed','true');
 await optsMenu(page).getByRole('button',{name:'처음부터'}).click();await expect(opts(dialog)).toHaveAttribute('aria-label','재생 옵션: 처음부터, 컷 건너뛰기 켜짐');
 expect((await prefs(page))[SCORE].s).toBeUndefined();
 await play(dialog).click();await expect.poll(async()=>(await mr(page)).paused).toBe(false);await page.waitForTimeout(150);
 expect((await mr(page)).time).toBeLessThan(.9);
 await stopPlay(dialog).click();
 expect(await annotations(page)).toBe(before); // nothing on the score was rewritten
});

test('tapping a 시작점 or 반복 mark with the 이동 tool offers 여기서 재생 / 이 구간 반복; with a tool that draws it does not',async({page,browserName})=>{
 test.skip(browserName==='webkit',PLAYS);
 await setup(page,{sync:EVEN,rows:ALL});const dialog=await openMarked(page);
 await tap(page,dialog,180,112);
 const menu=page.getByRole('dialog',{name:'시작점 · 3마디 메뉴'});
 await expect(menu.locator('.score-sync-menu-title')).toHaveText('시작점 · 3마디');await expect(menu.getByRole('button')).toHaveText([/여기서 재생/]);
 expect((await menu.getByRole('button').boundingBox()).height).toBeGreaterThanOrEqual(44);
 await menu.getByRole('button',{name:'여기서 재생'}).click();
 await expect(bar(dialog).getByRole('group',{name:'MR 재생 중'})).toBeVisible();
 await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(2.95);expect((await mr(page)).time).toBeLessThan(3.9);
 // From the playing MR straight into the repeat mark's range: 6–7 (6–8 s) with measure 5 as the lead-in.
 await tap(page,dialog,150,186);
 const repeat=page.getByRole('dialog',{name:'반복 · 6–7마디 메뉴'});
 await expect(repeat.getByRole('button')).toHaveText([/이 구간 반복/]);await repeat.getByRole('button',{name:'이 구간 반복'}).click();
 const loop=bar(dialog).getByRole('group',{name:'마디 반복 재생'});
 await expect(loop.locator('[data-score-audio-loop-label]')).toHaveText('6–7마디 반복 중');await expect(loop).toHaveAttribute('data-score-audio-loop-cuts','');
 await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(4.95);
 await mrSeek(page,7.6);const seen=await watch(page,1200);
 for(const t of seen){expect(t).toBeGreaterThanOrEqual(4.95);expect(t).toBeLessThanOrEqual(8.15);}
 expect(seen.some((t,i)=>i&&t<seen[i-1]-.5)).toBe(true); // it wrapped
 await loop.getByRole('button',{name:'반복 멈춤',exact:true}).click();await expect(play(dialog)).toBeVisible();
 // A press that moves is not a tap; a tap beside the marks does nothing.
 const p=await spot(dialog,180,112);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+30,p.y+3,{steps:3});await page.mouse.up();
 await tap(page,dialog,60,150);await expect(page.locator('.sheet-menu')).toHaveCount(0);
 // 컷: what is skipped, and the switch.
 await tap(page,dialog,240,88);
 const cut=page.getByRole('dialog',{name:'컷 · 4마디 메뉴'});
 await expect(cut.locator('[data-mark-cut-text]')).toHaveText('재생할 때 4마디 건너뜀');await expect(cut.getByRole('button')).toHaveText([/컷 건너뛰기 끄기/]);
 await closeMenu(page);await expect(cut).toHaveCount(0);
 // With the pen the same tap writes (a dot) and opens nothing.
 const count=await page.evaluate(()=>window.VZ.db.scoreAnnotations.filter(s=>s.kind!=='marker-preset').length);
 await dialog.getByRole('button',{name:'펜',exact:true}).click();await tap(page,dialog,180,112);
 await expect.poll(()=>page.evaluate(()=>window.VZ.db.scoreAnnotations.filter(s=>s.kind!=='marker-preset').length)).toBe(count+1);await expect(page.locator('.sheet-menu')).toHaveCount(0);
});

test('표시한 마디: 시작점 → ▶ 여기서 재생, 반복 → ▶ 이 구간 반복, 컷 → 건너뜀 with one line about it; marks without a function are as before',async({page,browserName})=>{
 test.skip(browserName==='webkit',PLAYS);
 const OLD=bracket(1,35,186,85,186);                                         // a 반복 placed before 2026-11-14: no `mark`
 const BREATH=stroke(1,'pen',[[60,70],[64,76],[68,70]],{mark:'breath',width:.006});
 const AWAY=ring(2,180,128,{mark:'m-other-device',role:'start'});             // from a preset this device does not have
 const PLAIN=ring(2,240,128,{mark:'m-plain'});                                // a user mark without a 기능
 await setup(page,{sync:EVEN,rows:[...ALL,OLD,BREATH,AWAY,PLAIN]});const dialog=await openMarked(page);
 const before=await annotations(page);
 let list=await openList(page,dialog);
 const rows=list.locator('.score-measure-line');
 await expect(list.locator('[data-measure-row]')).toHaveCount(9);
 const line=text=>rows.filter({has:page.locator('[data-measure-row]',{hasText:text})});
 await expect(list.locator('[data-measure-row] .score-measure-where')).toHaveText(['1마디','3–4마디','3마디','4마디','5마디','6–7마디','10마디','11마디','12마디']);
 // Each kind of row.
 await expect(line('시작점').first().locator('[data-mark-start]')).toHaveText('여기서 재생');
 await expect(list.getByRole('button',{name:'3마디 여기서 재생',exact:true})).toBeEnabled();await expect(list.getByRole('button',{name:'10마디 여기서 재생',exact:true})).toBeEnabled();
 await expect(list.getByRole('button',{name:'11마디 여기서 재생',exact:true})).toBeEnabled(); // named after its function: 시작점
 await expect(list.locator('[data-measure-row]').nth(7)).toContainText('시작점');
 await expect(list.getByRole('button',{name:'6–7마디 이 구간 반복',exact:true})).toHaveText('이 구간 반복');await expect(list.getByRole('button',{name:'3–4마디 이 구간 반복',exact:true})).toBeEnabled();
 await expect(list.locator('[data-mark-cut]')).toHaveText(['건너뜀']);await expect(list.locator('[data-mark-cut]')).toHaveAttribute('data-on','true');
 // Without a function: ▶ 이 마디 반복 as before — 숨표, the old bracket (a pen line) and the plain user mark.
 await expect(list.getByRole('button',{name:'1마디 반복 재생',exact:true})).toBeVisible();await expect(list.locator('[data-measure-row]').first()).toContainText('숨표');
 await expect(list.getByRole('button',{name:'5마디 반복 재생',exact:true})).toBeVisible();await expect(list.locator('[data-measure-row]').nth(4)).toContainText('펜 필기');
 await expect(list.getByRole('button',{name:'12마디 반복 재생',exact:true})).toBeVisible();await expect(list.locator('[data-measure-row]').nth(8)).toContainText('표기');
 await expect(list.locator('[data-measure-loop]')).toHaveCount(3);
 for(const b of await list.locator('.score-measure-act,.score-measure-play').all())expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
 // The line about cuts, with the switch.
 const hint=list.locator('[data-mark-cut-hint]'),toggle=hint.getByRole('button',{name:'컷 건너뛰기',exact:true});
 await expect(hint).toContainText('재생할 때 4마디 건너뜀');await expect(toggle).toHaveAttribute('aria-pressed','true');expect((await toggle.boundingBox()).height).toBeGreaterThanOrEqual(44);
 await toggle.click();await expect(toggle).toHaveAttribute('aria-pressed','false');await expect(hint).toContainText('컷 건너뛰기가 꺼져 있어요. 4마디도 그대로 재생해요.');
 await expect(list.locator('[data-mark-cut]')).toHaveText(['건너뛰기 꺼짐']);expect((await prefs(page))[SCORE].c).toBe(0);
 await toggle.click();await expect(list.locator('[data-mark-cut]')).toHaveText(['건너뜀']);expect((await prefs(page))[SCORE].c).toBeUndefined();
 // The row itself still only goes to the measure.
 await list.locator('[data-measure-row]').nth(5).click();await expect(list).toHaveCount(0);await expect(play(dialog)).toBeVisible();
 // ▶ 이 구간 반복 → the loop bar over the mark's measures.
 list=await openList(page,dialog);await list.getByRole('button',{name:'6–7마디 이 구간 반복',exact:true}).click();await expect(list).toHaveCount(0);
 const loop=bar(dialog).getByRole('group',{name:'마디 반복 재생'});
 await expect(loop.locator('[data-score-audio-loop-label]')).toHaveText('6–7마디 반복 중');await expect(dialog.locator('[data-ink-measures] .score-measure-flash')).toHaveCount(2);
 await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(4.95);expect((await mr(page)).time).toBeLessThan(8.15);
 // ▶ 여기서 재생 from the loop: the page turns to the mark and the MR goes to measure 10.
 list=await openList(page,dialog);await list.getByRole('button',{name:'10마디 여기서 재생',exact:true}).click();
 await expect(bar(dialog).getByRole('group',{name:'MR 재생 중'})).toBeVisible();await expect(dialog.locator('[data-ink-page]')).toHaveText('2 / 2쪽');
 await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(9.95);expect((await mr(page)).time).toBeLessThan(10.9);
 await stopPlay(dialog).click();
 expect(await annotations(page)).toBe(before);
});

test('컷 건너뛰기: playback jumps over the cut measure, plays it when the switch is off, and the switch is kept for the score',async({page,browserName})=>{
 test.skip(browserName==='webkit',PLAYS);
 await setup(page,{sync:EVEN,rows:ALL,boxes:true});let dialog=await openMarked(page);
 const inCut=seen=>seen.filter(t=>t>4.12&&t<4.95);
 // On (the default for a score with cut marks): from measure 3 the MR goes on at measure 5.
 await play(dialog).click();await expect(bar(dialog).getByRole('group',{name:'MR 재생 중'})).toBeVisible();
 await expect(bar(dialog).locator('[data-score-audio-cutting]')).toHaveAttribute('aria-label','컷 4마디 건너뜀');await expect(bar(dialog).locator('[data-score-audio-hint]')).toHaveText('');
 expect((await bar(dialog).boundingBox()).height).toBeLessThanOrEqual(60); // still one row while it plays
 await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(.2);
 await mrSeek(page,3.45);let seen=await watch(page,1500);
 expect(inCut(seen)).toEqual([]);expect(Math.max(...seen)).toBeGreaterThan(5.2);expect(Math.max(...seen)).toBeLessThan(6.3); // about 0.55 s of measure 3, then measure 5
 await expect(nowBox(dialog)).toHaveAttribute('data-number',/^[56]$/);
 await stopPlay(dialog).click();
 // Off: said when switching, and the cut measure is played.
 await opts(dialog).click();await cutSwitch(page).click();await expect(optsMenu(page)).toHaveCount(0);
 await expect(page.locator('.toast')).toHaveText('컷 건너뛰기를 껐어요. 4마디도 재생해요.');
 await expect(opts(dialog)).toHaveAttribute('aria-label','재생 옵션: 처음부터, 컷 건너뛰기 꺼짐');await expect(opts(dialog)).toHaveAttribute('data-lit','false');
 await opts(dialog).click();await expect(cutSwitch(page)).toHaveText('컷 건너뛰기꺼짐 · 4마디도 재생');await expect(cutSwitch(page)).toHaveAttribute('aria-pressed','false');await closeMenu(page);
 expect((await prefs(page))[SCORE].c).toBe(0);
 await play(dialog).click();await expect.poll(async()=>(await mr(page)).paused).toBe(false);
 await expect(bar(dialog).locator('[data-score-audio-cutting]')).toHaveCount(0);
 await mrSeek(page,3.45);seen=await watch(page,1500);
 expect(inCut(seen).length).toBeGreaterThan(5);
 await stopPlay(dialog).click();
 // Kept for this score on this device.
 await dialog.getByRole('button',{name:'돌아가기',exact:true}).click();await expect(dialog).toHaveCount(0);
 dialog=await openMarked(page);await expect(opts(dialog)).toHaveAttribute('aria-label','재생 옵션: 처음부터, 컷 건너뛰기 꺼짐');
 await opts(dialog).click();await cutSwitch(page).click();await expect(page.locator('.toast')).toHaveText('재생할 때 4마디 건너뜀');
 await expect(opts(dialog)).toHaveAttribute('aria-label','재생 옵션: 처음부터, 컷 건너뛰기 켜짐');
 // What is started on purpose is played: 여기서 재생 on the cut measure…
 const hold=async number=>{const p=await boxCentre(dialog,number);await page.mouse.move(p.x,p.y);await page.mouse.down();await page.waitForTimeout(750);await page.mouse.up();};
 await hold(4);await page.getByRole('dialog',{name:'4마디 메뉴'}).getByRole('button',{name:'여기서 재생'}).click();
 await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(3.95);
 seen=await watch(page,700);expect(inCut(seen).length).toBeGreaterThan(3);
 // …and a loop of the cut measure itself (with measure 3 before it).
 await hold(4);await page.getByRole('dialog',{name:'4마디 메뉴'}).getByRole('button',{name:'이 마디 반복'}).click();
 const loop=bar(dialog).getByRole('group',{name:'마디 반복 재생'});
 await expect(loop.locator('[data-score-audio-loop-label]')).toHaveText('4마디 반복 중');await expect(loop).toHaveAttribute('data-score-audio-loop-cuts','');
 await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(2.95);
 await mrSeek(page,3.7);seen=await watch(page,1500);
 expect(inCut(seen).length).toBeGreaterThan(5);for(const t of seen){expect(t).toBeGreaterThanOrEqual(2.95);expect(t).toBeLessThanOrEqual(5.15);}
 // A loop that only reaches into the cut (the 반복 mark over 3–4): the round ends where the cut starts, and it says so.
 await tap(page,dialog,210,60);await page.getByRole('dialog',{name:'반복 · 3–4마디 메뉴'}).getByRole('button',{name:'이 구간 반복'}).click();
 await expect(loop.locator('[data-score-audio-loop-label]')).toHaveText('3–4마디 반복 중');await expect(loop).toHaveAttribute('data-score-audio-loop-cuts','4마디');
 await expect(page.locator('.toast')).toHaveText('반복하는 동안 컷 4마디 건너뜀');
 await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(1.95);
 await mrSeek(page,3.5);seen=await watch(page,1500);
 expect(inCut(seen)).toEqual([]);for(const t of seen){expect(t).toBeGreaterThanOrEqual(1.95);expect(t).toBeLessThanOrEqual(4.12);}
 expect(seen.some((t,i)=>i&&t<seen[i-1]-.5)).toBe(true);
 await loop.getByRole('button',{name:'반복 멈춤',exact:true}).click();await expect(play(dialog)).toBeVisible();
});

test('재생+녹음 with a cut and a 시작점: the MR starts there and jumps over the cut while the take runs on; the bar says so',async({page,browserName})=>{
 test.skip(browserName==='webkit',PLAYS);
 await setup(page,{sync:EVEN,rows:ALL});const dialog=await openMarked(page);
 await pickStart(page,dialog,/시작점 3마디에서/);
 await bar(dialog).getByRole('button',{name:'재생+녹음',exact:true}).click();
 await expect(bar(dialog).getByRole('group',{name:'녹음 중'})).toBeVisible({timeout:10000});
 await expect(bar(dialog).locator('[data-score-audio-hint]')).toHaveText('이어폰을 끼면 MR이 녹음에 섞이지 않아요. 컷 4마디 건너뜀.');
 await expect.poll(async()=>(await mr(page)).paused).toBe(false);
 const seen=await watch(page,2300);
 expect(Math.min(...seen)).toBeGreaterThan(2.95);                       // from the 시작점
 expect(seen.filter(t=>t>4.12&&t<4.95)).toEqual([]);                    // the cut measure was not played
 expect(Math.max(...seen)).toBeGreaterThan(5.3);                        // the MR went on after it
 // The take is the microphone in real time: its clock simply runs on (about 2.5 s by now, not the MR's 5–6 s).
 const clock=await bar(dialog).locator('[data-score-audio-time]').textContent();expect(clock).toMatch(/^0:0[1-4]$/);
 await bar(dialog).getByRole('button',{name:'정지',exact:true}).click();
 await expect(bar(dialog).getByRole('button',{name:'저장',exact:true})).toBeVisible({timeout:10000});
 await bar(dialog).getByRole('button',{name:'버리기',exact:true}).click();
 await page.getByRole('dialog',{name:'녹음 버리기'}).getByRole('button',{name:'버리기',exact:true}).click();
 await expect(bar(dialog).getByRole('button',{name:/^재생 옵션/})).toHaveAttribute('aria-label','재생 옵션: 시작점 3마디에서, 컷 건너뛰기 켜짐');
});

test('표기 편집: a user preset gets a 기능 and its marks carry it; a built-in one shows its function and cannot change it',async({page})=>{
 await setup(page,{sync:EVEN});const dialog=await open(page);
 await expect(opts(dialog)).toHaveCount(0); // nothing on the score yet
 const sheet=page.getByRole('dialog',{name:'악보 표기 편집'});
 await dialog.locator('[data-ink-marker-mode]').click();
 // Built-in: read-only.
 await dialog.locator('[data-ink-marker-edit]').click();await dialog.locator('[data-ink-marker="start"]').click();
 await expect(sheet.locator('[data-marker-role-fixed]')).toHaveText('기능시작점기본 표기의 기능은 바꿀 수 없어요.');await expect(sheet.locator('[name=role]')).toHaveCount(0);
 await sheet.getByRole('button',{name:'돌아가기',exact:true}).click();await expect(sheet).toHaveCount(0);
 await dialog.locator('[data-ink-marker="breath"]').click(); // still editing
 await expect(sheet.locator('[data-marker-role-fixed] strong')).toHaveText('없음');
 await sheet.getByRole('button',{name:'돌아가기',exact:true}).click();await expect(sheet).toHaveCount(0);
 // A new one: 없음 by default; 건너뛰기 says what it does.
 await dialog.locator('[data-ink-marker-add]').click();
 const roles=sheet.locator('[data-marker-role]');
 await expect(roles.locator('legend')).toHaveText('기능 선택');await expect(roles.locator('label')).toHaveText(['없음기본','시작점','반복 구간','건너뛰기']);
 await expect(roles.locator('[name=role][value=""]')).toBeChecked();await expect(sheet.locator('[data-marker-role-note]')).toHaveText('표시만 남겨요.');
 for(const l of await roles.locator('label').all())expect((await l.boundingBox()).height).toBeGreaterThanOrEqual(44);
 await sheet.locator('[name=name]').fill('건너뛸 곳');
 await sheet.locator('[name=form][value=cover]').check();
 await roles.locator('[name=role][value=cut]').check();
 await expect(sheet.locator('[data-marker-role-note]')).toHaveText('재생할 때 표기가 걸친 마디를 건너뛰어요. 마디와 MR을 맞춘 악보에서 써요.');
 await sheet.getByRole('button',{name:'저장',exact:true}).click();await expect(sheet).toHaveCount(0);
 const preset=(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).markers.user,PRESETS))[0];
 expect(preset).toMatchObject({name:'건너뛸 곳',form:'cover',role:'cut'});
 // Placed over measure 2 (a drag): the mark carries what it is and what it does.
 const a=await spot(dialog,100,88),b=await spot(dialog,140,88);
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:4});await page.mouse.up();
 await expect.poll(()=>page.evaluate(()=>window.VZ.db.scoreAnnotations.filter(s=>s.kind!=='marker-preset').length)).toBe(1);
 expect(await page.evaluate(()=>{const s=window.VZ.db.scoreAnnotations.filter(s=>s.kind!=='marker-preset')[0];return [s.mark,s.role,window.VzipScoreInk.valid(s)];})).toEqual([preset.id,'cut',true]);
 // It works like 컷: the bar offers 컷 건너뛰기 for measure 2, the list says 건너뜀.
 await expect(opts(dialog)).toHaveAttribute('aria-label','재생 옵션: 컷 건너뛰기 켜짐',{timeout:5000});
 await dialog.getByRole('button',{name:'이동',exact:true}).click();await opts(dialog).click();
 await expect(cutSwitch(page)).toHaveText('컷 건너뛰기2마디 건너뜀');await expect(starts(page)).toHaveCount(0);await closeMenu(page);
 const list=await openList(page,dialog);
 await expect(list.locator('[data-measure-row]')).toHaveText([/2마디\s*건너뛸 곳/]);await expect(list.locator('[data-mark-cut]')).toHaveText(['건너뜀']);
 await list.getByRole('button',{name:'돌아가기',exact:true}).click();
 // Back to 없음: marks placed from now on have no function; the one already there keeps its own.
 await dialog.locator('[data-ink-marker-mode]').click();await dialog.locator('[data-ink-marker-edit]').click();await dialog.locator('[data-ink-marker="'+preset.id+'"]').click();
 await expect(roles.locator('[name=role][value=cut]')).toBeChecked();
 await roles.locator('[name=role][value=""]').check();await sheet.getByRole('button',{name:'저장',exact:true}).click();await expect(sheet).toHaveCount(0);
 expect('role' in (await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).markers.user,PRESETS))[0]).toBe(false);
 await dialog.locator('[data-ink-marker="'+preset.id+'"]').click();
 const c=await spot(dialog,160,208),d=await spot(dialog,200,208);
 await page.mouse.move(c.x,c.y);await page.mouse.down();await page.mouse.move(d.x,d.y,{steps:4});await page.mouse.up();
 await expect.poll(()=>page.evaluate(()=>window.VZ.db.scoreAnnotations.filter(s=>s.kind!=='marker-preset').length)).toBe(2);
 expect(await page.evaluate(()=>window.VZ.db.scoreAnnotations.filter(s=>s.kind!=='marker-preset').map(s=>s.role||''))).toEqual(['cut','']);
 await page.waitForTimeout(500);await dialog.getByRole('button',{name:'이동',exact:true}).click();await opts(dialog).click();
 await expect(cutSwitch(page)).toHaveText('컷 건너뛰기2마디 건너뜀');await closeMenu(page);
});

test('without a sync the bar, the list and a tapped mark say what matching gives, with the way to 맞추기; nothing else changes',async({page})=>{
 await setup(page,{rows:ALL});const dialog=await openMarked(page);
 const NEED='시작점·반복·컷 표기는 MR과 맞추면 쓸 수 있어요.';
 // The bar: the same entry, which only explains.
 await expect(opts(dialog)).toHaveAttribute('data-need','');await expect(opts(dialog)).toHaveAttribute('aria-label','재생 옵션');await expect(opts(dialog)).toHaveAttribute('data-lit','false');
 await opts(dialog).click();
 const explain=page.getByRole('dialog',{name:'재생 옵션 메뉴'});
 await expect(explain.locator('[data-sync-need]')).toHaveText(NEED);await expect(explain.getByRole('button')).toHaveText([/MR과 맞추기/]);
 await closeMenu(page);await expect(explain).toHaveCount(0);
 expect(await prefs(page)).toBeNull();
 // The list: one line, no actions on the rows.
 const list=await openList(page,dialog),need=list.locator('[data-sync-need]');
 await expect(need).toHaveText('MR과 맞추면 이 마디만 반복해서 들을 수 있어요. '+NEED+'맞추기');
 await expect(list.locator('.score-measure-act,[data-mark-cut],[data-measure-loop],[data-mark-cut-hint]')).toHaveCount(0);await expect(list.locator('[data-measure-row] .ph-caret-right')).toHaveCount(5);
 await list.getByRole('button',{name:'돌아가기',exact:true}).click();await expect(list).toHaveCount(0);
 // A tapped mark: the same words, and the button leads to the 맞추기 screen.
 await tap(page,dialog,180,112);
 const menu=page.getByRole('dialog',{name:'시작점 · 3마디 메뉴'});
 await expect(menu.locator('[data-sync-need]')).toHaveText(NEED);
 await menu.getByRole('button',{name:'MR과 맞추기'}).click();
 await expect(syncSheet(page).locator('[data-sync-page]')).toBeVisible({timeout:15000});
 await syncSheet(page).getByRole('button',{name:'취소',exact:true}).click();await expect(syncSheet(page)).toHaveCount(0);
 // A sync that can no longer be used says why.
 await page.evaluate(([len,anchors])=>window.VZ.change(d=>{d.songs[0].scores[0].mrSync={'mr-1':window.VzipScoreSyncModel.entry({anchors,count:11,duration:len,now:1700000000000})};},{silent:true}),[MRLEN,EVEN.slice(0,11)]);
 await expect(opts(dialog)).toHaveAttribute('data-need','');
 await opts(dialog).click();
 const stale=page.getByRole('dialog',{name:'재생 옵션 메뉴'});
 await expect(stale.locator('[data-sync-need]')).toHaveText('다시 맞춰야 해요. 악보를 다시 변환해서 마디 수가 달라졌어요. '+NEED);await expect(stale.getByRole('button')).toHaveText([/다시 맞추기/]);
 await closeMenu(page);await expect(stale).toHaveCount(0);
 // Only a YouTube MR: the bar has no such entries (it cannot be matched); no MR at all: a tapped mark is just a drawing.
 await page.evaluate(tube=>window.VZ.change(d=>{d.songs[0].mrTracks=[tube];},{silent:true}),TUBE);
 await expect(opts(dialog)).toHaveCount(0);
 await page.evaluate(()=>window.VZ.change(d=>{d.songs[0].mrTracks=[];},{silent:true}));
 await tap(page,dialog,180,112);await page.waitForTimeout(300);await expect(page.locator('.sheet-menu')).toHaveCount(0);
 await expect(opts(dialog)).toHaveCount(0);
});

test('a score without such marks, or with only marks that have no function, keeps the bar and the list as they were',async({page})=>{
 const OLD=bracket(1,95,186,205,186),OLDCUT=cover(1,225,88,255),PLAIN=ring(1,180,112,{mark:'m-plain'}),BREATH=stroke(1,'pen',[[60,70],[64,76],[68,70]],{mark:'breath',width:.006});
 await setup(page,{sync:EVEN,rows:[OLD,OLDCUT,PLAIN,BREATH]});const dialog=await open(page);
 await page.waitForTimeout(600);
 await expect(opts(dialog)).toHaveCount(0);await expect(bar(dialog).getByRole('button')).toHaveText(['재생','녹음','재생+녹음']);
 expect((await bar(dialog).boundingBox()).height).toBeLessThanOrEqual(60);
 for(const [x,y] of [[150,186],[240,88],[180,112]]){await tap(page,dialog,x,y);await page.waitForTimeout(150);}
 await expect(page.locator('.sheet-menu')).toHaveCount(0);
 const list=await openList(page,dialog);
 await expect(list.locator('[data-measure-row]')).toHaveCount(4);await expect(list.locator('[data-measure-loop]')).toHaveCount(4);
 await expect(list.locator('.score-measure-act,[data-mark-cut],[data-mark-cut-hint]')).toHaveCount(0);
 expect(await prefs(page)).toBeNull();
});

test('320px: the bar stays one row with 재생 옵션 in it; the menu, the list actions and the cut line stay inside the screen',async({page})=>{
 await page.setViewportSize({width:320,height:640});
 await setup(page,{sync:EVEN,rows:ALL});const dialog=await openMarked(page);
 const inside=async locator=>{const r=await locator.boundingBox();expect(r.x).toBeGreaterThanOrEqual(-.5);expect(r.x+r.width).toBeLessThanOrEqual(320.5);return r;};
 const noOverflow=()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('.sheet')].every(s=>s.scrollWidth<=s.clientWidth+1));
 await inside(bar(dialog));
 for(const b of await bar(dialog).locator('.score-audio-btn').all()){const r=await inside(b);expect(r.height).toBeGreaterThanOrEqual(44);expect(r.width).toBeGreaterThanOrEqual(44);}
 // Still one row, and no button's words are cut off.
 expect((await bar(dialog).boundingBox()).height).toBeLessThanOrEqual(60);
 expect(await bar(dialog).locator('.score-audio-btn').evaluateAll(list=>list.every(b=>b.scrollWidth<=b.clientWidth+1))).toBe(true);
 const ys=await bar(dialog).locator('.score-audio-btn').evaluateAll(list=>list.map(b=>Math.round(b.getBoundingClientRect().top)));expect(new Set(ys).size).toBe(1);
 // The score keeps most of the screen.
 expect((await dialog.locator('[data-ink-stage]').boundingBox()).height).toBeGreaterThan(260);
 await opts(dialog).click();await inside(optsMenu(page));
 for(const b of await optsMenu(page).getByRole('button').all())expect((await inside(b)).height).toBeGreaterThanOrEqual(44);
 await optsMenu(page).getByRole('button',{name:/시작점 10마디에서/}).click();
 await expect(opts(dialog)).toHaveAttribute('aria-label','재생 옵션: 시작점 10마디에서, 컷 건너뛰기 켜짐');await inside(opts(dialog));expect(await noOverflow()).toBe(true);
 expect(await bar(dialog).locator('.score-audio-btn').evaluateAll(list=>list.every(b=>b.scrollWidth<=b.clientWidth+1))).toBe(true);
 const list=await openList(page,dialog);
 for(const l of await list.locator('.score-measure-line').all())await inside(l);
 for(const b of await list.locator('.score-measure-act').all())expect((await inside(b)).height).toBeGreaterThanOrEqual(44);
 await inside(list.locator('[data-mark-cut]'));await inside(list.locator('[data-mark-cut-hint]'));
 expect((await inside(list.locator('[data-mark-cut-toggle]'))).height).toBeGreaterThanOrEqual(44);
 expect(await noOverflow()).toBe(true);
 await list.getByRole('button',{name:'돌아가기',exact:true}).click();
 // The 기능 field of the editor.
 await dialog.locator('[data-ink-marker-mode]').click();await dialog.locator('[data-ink-marker-add]').click();
 const sheet=page.getByRole('dialog',{name:'악보 표기 편집'});
 await sheet.locator('[data-marker-role]').scrollIntoViewIfNeeded();
 for(const l of await sheet.locator('[data-marker-role] label').all())expect((await inside(l)).height).toBeGreaterThanOrEqual(44);
 await inside(sheet.locator('[data-marker-role-note]'));expect(await noOverflow()).toBe(true);
});

for(const [width,height] of [[1024,768],[820,1180]])test('tablet '+width+'×'+height+': 재생 옵션 sits in the row of the bar, the mark menu and the list actions work',async({page},info)=>{
 test.skip(info.project.name!=='chromium-desktop','sizes are set explicitly');
 await page.setViewportSize({width,height});
 await setup(page,{sync:EVEN,rows:ALL});const dialog=await openMarked(page);
 const button=await opts(dialog).boundingBox(),whole=await bar(dialog).boundingBox(),stage=await dialog.locator('[data-ink-stage]').boundingBox();
 expect(button.y).toBeGreaterThanOrEqual(stage.y+stage.height-1);expect(button.x+button.width).toBeLessThanOrEqual(whole.x+whole.width+.5);
 expect(whole.height).toBeLessThanOrEqual(60);expect(stage.height).toBeGreaterThan(height*.6);expect(button.height).toBeGreaterThanOrEqual(44);
 await pickStart(page,dialog,/시작점 3마디에서/);await expect(opts(dialog)).toHaveText('3마디부터'); // room for the words here
 await pickStart(page,dialog,'처음부터');await expect(opts(dialog)).toHaveText('');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await tap(page,dialog,180,112);
 await page.getByRole('dialog',{name:'시작점 · 3마디 메뉴'}).getByRole('button',{name:'여기서 재생'}).click();
 await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(2.95);expect((await mr(page)).time).toBeLessThan(3.9);
 const list=await openList(page,dialog);
 await list.getByRole('button',{name:'6–7마디 이 구간 반복',exact:true}).click();
 await expect(bar(dialog).locator('[data-score-audio-loop-label]')).toHaveText('6–7마디 반복 중');
 await bar(dialog).getByRole('button',{name:'반복 멈춤',exact:true}).click();await expect(opts(dialog)).toBeVisible();
});

// ---------- 마디 선택: marks placed on whole measures ----------
const status=dialog=>dialog.locator('[data-ink-status]'),layer=dialog=>dialog.locator('[data-ink-measures]');
const pickMarker=async(dialog,id)=>{await dialog.locator('[data-ink-marker-mode]').click();await dialog.locator('[data-ink-marker="'+id+'"]').click();};
/** Opens the editor of a preset: the palette, 편집 on (it stays on after an editor is closed without saving), the preset. */
const editMarker=async(page,dialog,id)=>{
 if(await dialog.locator('[data-ink-marker-palette]').isHidden())await dialog.locator('[data-ink-marker-mode]').click();
 const toggle=dialog.locator('[data-ink-marker-edit]');if(await toggle.getAttribute('aria-pressed')!=='true')await toggle.click();
 await dialog.locator('[data-ink-marker="'+id+'"]').click();const sheet=page.getByRole('dialog',{name:'악보 표기 편집'});await expect(sheet).toBeVisible();return sheet;
};
async function drag(page,dialog,from,to){const a=await spot(dialog,...from),b=await spot(dialog,...to);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move((a.x+b.x)/2,(a.y+b.y)/2,{steps:3});await page.mouse.move(b.x,b.y,{steps:3});return ()=>page.mouse.up();}
const marks=page=>page.evaluate(()=>(window.VZ.db.scoreAnnotations||[]).filter(s=>s.kind!=='marker-preset').map(s=>({id:s.id,mark:s.mark,tool:s.tool,measures:s.measures||null,group:s.group||'',role:s.role||'',page:s.page,valid:window.VzipScoreInk.valid(s),
 x:[Math.min(...s.points.map(p=>p[0])),Math.max(...s.points.map(p=>p[0]))],y:[Math.min(...s.points.map(p=>p[1])),Math.max(...s.points.map(p=>p[1]))],width:s.width,n:s.points.length})));
/** The x of a barline (PDF units) as a share of the page width, and how far a band of that width stops short of it. */
const X=x=>x/PW,Y=y=>y/PH;
const about=(value,want,room=.012)=>{expect(value).toBeGreaterThan(want-room);expect(value).toBeLessThan(want+room);};
const placed=async(page,count)=>{await expect.poll(async()=>(await marks(page)).length).toBe(count);return marks(page);};

test('마디 선택: 컷 takes the whole measure that is tapped, or every measure a drag passes; the boxes show lightly while placing',async({page})=>{
 await setup(page,{sync:EVEN});const dialog=await open(page);
 await expect(layer(dialog)).toBeHidden();
 await pickMarker(dialog,'cut');
 await expect(status(dialog)).toHaveText('컷: 마디를 누르거나, 여러 마디는 끌어서 골라 주세요.');
 // The measure boxes of the page show without 마디 위치 보기 being on, lightly, and take no touch.
 await expect(layer(dialog)).toBeVisible();await expect(layer(dialog)).toHaveAttribute('data-peek','true');await expect(layer(dialog).locator('.score-measure-box')).toHaveCount(8);
 expect(await layer(dialog).locator('.score-measure-box').first().evaluate(n=>[getComputedStyle(n).strokeDasharray!=='none',getComputedStyle(n.ownerSVGElement).pointerEvents])).toEqual([true,'none']);
 await more(dialog);await expect(dialog.locator('[data-ink-measure-boxes]')).toHaveAttribute('aria-pressed','false');await dialog.locator('[data-ink-more]').click();
 expect(await page.evaluate(k=>localStorage.getItem(k),BOXES)).toBeNull();await expect(layer(dialog)).toBeVisible();
 // A tap well below the staff, near the right edge of measure 4: the mark fills that measure's box — the staff with
 // the little room the boxes have, barline to barline (the box is higher than a stroke may be wide: two rows, one stroke).
 await tap(page,dialog,262,128);
 let rows=await placed(page,1);
 expect(rows[0]).toMatchObject({mark:'cut',tool:'highlighter',measures:[3,3,12],group:'',role:'',page:1,valid:true,n:5});
 about(rows[0].x[0]-rows[0].width/2,X(210));about(rows[0].x[1]+rows[0].width/2,X(270));about(inkTop(rows[0]),Y(80)-ROOM,.006);about(inkBottom(rows[0]),Y(96)+ROOM,.006);
 expect(rows[0].width).toBeLessThanOrEqual(.06);
 // A drag from measure 6 to measure 7: one mark over both; while dragging it is shown as it will be.
 const release=await drag(page,dialog,[100,236],[200,170]);
 await expect(dialog.locator('path[data-stroke="mark-preview-0"]')).toHaveCount(1);expect((await marks(page)).length).toBe(1);
 await release();rows=await placed(page,2);
 expect(rows[1]).toMatchObject({mark:'cut',measures:[5,6,12],group:'',valid:true});
 about(rows[1].x[0]-rows[1].width/2,X(90));about(rows[1].x[1]+rows[1].width/2,X(210));about(inkTop(rows[1]),Y(200)-ROOM,.006);about(inkBottom(rows[1]),Y(216)+ROOM,.006);
 await expect(dialog.locator('path[data-stroke="mark-preview-0"]')).toHaveCount(0);
 // Dragged backwards (7 → 5) it is the same kind of mark.
 await (await drag(page,dialog,[160,200],[40,215]))();rows=await placed(page,3);expect(rows[2].measures).toEqual([4,6,12]);
 // It is 컷: the list has one row per mark with its measures, and the bar skips exactly those.
 await dialog.getByRole('button',{name:'이동',exact:true}).click();
 await expect(layer(dialog)).toBeHidden(); // the boxes go with the marker
 const list=await openList(page,dialog);
 await expect(list.locator('[data-measure-row]')).toHaveText([/^4마디\s*컷$/,/^5–7마디\s*컷$/,/^6–7마디\s*컷$/]);await expect(list.locator('[data-mark-cut]')).toHaveText(['건너뜀','건너뜀','건너뜀']);
 await list.getByRole('button',{name:'돌아가기',exact:true}).click();
 await expect(opts(dialog)).toHaveAttribute('aria-label','재생 옵션: 컷 건너뛰기 켜짐');
 await opts(dialog).click();await expect(cutSwitch(page)).toHaveText('컷 건너뛰기4–7마디 건너뜀');await closeMenu(page);
 // With 마디 위치 보기 on the boxes are the usual ones, also while placing.
 await more(dialog);await dialog.locator('[data-ink-measure-boxes]').click();
 await pickMarker(dialog,'cut');await expect(layer(dialog)).toHaveAttribute('data-peek','false');await expect(layer(dialog).locator('.score-measure-box')).toHaveCount(8);
});

test('마디 선택 across a line break: one mark drawn as one piece per line — one row, one undo, one erase, one selection',async({page})=>{
 await setup(page,{sync:EVEN});const dialog=await open(page);
 await pickMarker(dialog,'cut');
 // From measure 3 (line 1) to measure 6 (line 2).
 const release=await drag(page,dialog,[180,88],[120,208]);
 await expect(dialog.locator('path[data-stroke^="mark-preview-"]')).toHaveCount(2);
 await release();
 let rows=await placed(page,2);
 expect(rows.map(r=>r.measures)).toEqual([[2,5,12],[2,5,12]]);expect(rows[0].group).not.toBe('');expect(rows[1].group).toBe(rows[0].group);expect(rows.every(r=>r.valid&&r.mark==='cut')).toBe(true);
 const [upper,lower]=rows[0].y[0]<rows[1].y[0]?rows:[rows[1],rows[0]];
 about(upper.x[0]-upper.width/2,X(150));about(upper.x[1]+upper.width/2,X(270));about(inkTop(upper),Y(80)-ROOM,.006);about(inkBottom(upper),Y(96)+ROOM,.006);   // measures 3–4 to the end of the line
 about(lower.x[0]-lower.width/2,X(30));about(lower.x[1]+lower.width/2,X(150));about(inkTop(lower),Y(200)-ROOM,.006);about(inkBottom(lower),Y(216)+ROOM,.006);   // measures 5–6 from its start
 await expect(dialog.locator('[data-ink-svg] path[data-stroke]')).toHaveCount(2);
 // One row.
 await dialog.getByRole('button',{name:'이동',exact:true}).click();
 let list=await openList(page,dialog);
 await expect(list.locator('[data-measure-row]')).toHaveText([/^3–6마디\s*컷$/]);await expect(list.locator('[data-mark-cut-hint]')).toContainText('재생할 때 3–6마디 건너뜀');
 await list.getByRole('button',{name:'돌아가기',exact:true}).click();
 // One undo and one redo.
 await more(dialog);await dialog.locator('[data-ink-undo]').click();await placed(page,0);
 await more(dialog);await dialog.locator('[data-ink-redo]').click();rows=await placed(page,2);expect(new Set(rows.map(r=>r.group)).size).toBe(1);expect(rows.map(r=>r.measures)).toEqual([[2,5,12],[2,5,12]]);
 // The eraser on the lower piece takes the whole mark; undo brings both back.
 await dialog.getByRole('button',{name:'지우개',exact:true}).click();await tap(page,dialog,90,208);await placed(page,0);
 await more(dialog);await dialog.locator('[data-ink-undo]').click();await placed(page,2);
 // Selecting one piece selects the mark. Moved by hand it no longer lies on its measures: it becomes a freehand mark
 // (still 컷, now read from where it lies).
 await dialog.getByRole('button',{name:'선택',exact:true}).click();await tap(page,dialog,240,88);
 await expect(dialog.locator('[data-ink-selection-count]')).toHaveText('2개 선택');
 const a=await spot(dialog,240,88),b=await spot(dialog,240,60);
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:4});await page.mouse.up();
 await expect.poll(async()=>(await marks(page)).map(r=>[r.mark,r.measures,r.group])).toEqual([['cut',null,''],['cut',null,'']]);
 await dialog.getByRole('button',{name:'이동',exact:true}).click();
 list=await openList(page,dialog);await expect(list.locator('[data-measure-row]')).toHaveCount(2);
});

test('컷 건너뛰기 uses the measures a mark was placed on, not where its shape happens to lie',async({page,browserName})=>{
 // Drawn over measure 2, but placed on measure 4; another one from a conversion that had 11 measure boxes.
 const MOVED=cover(1,100,88,140,{mark:'cut',measures:[3,3,12]}),OUTDATED=cover(1,100,208,140,{mark:'cut',measures:[0,0,11]});
 await setup(page,{sync:EVEN,rows:[MOVED,OUTDATED]});const dialog=await openMarked(page);
 await opts(dialog).click();await expect(cutSwitch(page)).toHaveText('컷 건너뛰기4마디, 6마디 건너뜀');await closeMenu(page); // 6: the outdated one, read from where it lies
 const list=await openList(page,dialog);
 await expect(list.locator('[data-measure-row] .score-measure-where')).toHaveText(['4마디','6마디']);
 await list.getByRole('button',{name:'돌아가기',exact:true}).click();
 await tap(page,dialog,120,88);await expect(page.getByRole('dialog',{name:'컷 · 4마디 메뉴'})).toBeVisible();await closeMenu(page);
 if(browserName==='webkit')return; // the rest plays the MR
 await play(dialog).click();await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(.2);
 await mrSeek(page,1.5);const seen=await watch(page,3200);
 expect(seen.filter(t=>t>2.2&&t<2.9).length).toBeGreaterThan(5);   // measure 2 is played
 expect(seen.filter(t=>t>4.12&&t<4.95)).toEqual([]);               // measure 4 is not
 expect(Math.max(...seen)).toBeGreaterThan(5.2);
 await stopPlay(dialog).click();
});

test('표기 편집 › 찍는 방식: 컷 can go back to its own way and be reset; 반복 and a user preset can take 마디 선택; a 기호 cannot',async({page})=>{
 await setup(page,{sync:EVEN});const dialog=await open(page);
 const pick=sheet=>sheet.locator('[data-marker-pick]'),save=sheet=>sheet.getByRole('button',{name:'저장',exact:true});
 const builtin=page=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)||'{}').markers?.builtin||{},PRESETS);
 // 컷: 마디 선택 is on by default.
 let sheet=await editMarker(page,dialog,'cut');
 await expect(pick(sheet).locator('legend')).toHaveText('찍는 방식');await expect(pick(sheet).locator('label')).toHaveText(['따라 긋기손으로 자리를 정해요','마디 선택마디를 누르거나 끌어요']);
 await expect(pick(sheet).locator('[name=pick][value=measure]')).toBeChecked();await expect(sheet.locator('[data-marker-input]')).toHaveText('찍는 방식 · 마디 선택');
 await expect(sheet.locator('[data-marker-pick-note]')).toHaveText('표기가 고른 마디에 딱 맞게 그려져요. 음표로 변환하지 않은 악보에서는 ‘따라 긋기’로 찍어요.');
 await expect(sheet.locator('[data-marker-reset]')).toBeDisabled();
 for(const l of await pick(sheet).locator('label').all())expect((await l.boundingBox()).height).toBeGreaterThanOrEqual(44);
 await pick(sheet).locator('[name=pick][value=""]').check();
 await expect(sheet.locator('[data-marker-input]')).toHaveText('찍는 방식 · 따라 긋기');await expect(sheet.locator('[data-marker-pick-note]')).toHaveText('마디 선택은 음표로 변환한 악보에서 쓸 수 있어요.');
 await save(sheet).click();await expect(sheet).toHaveCount(0);
 expect((await builtin(page)).cut.pick).toBe('');
 // Now it is drawn by hand again: no boxes, a line where the finger went, no measures on the mark.
 await dialog.locator('[data-ink-marker="cut"]').click();
 await expect(status(dialog)).toHaveText('컷: 표시할 곳을 따라 그어 주세요.');await expect(layer(dialog)).toBeHidden();
 await (await drag(page,dialog,[100,120],[140,120]))();
 let rows=await placed(page,1);expect(rows[0]).toMatchObject({mark:'cut',measures:null,group:''});about(rows[0].x[0],X(100));about(rows[0].x[1],X(140));about(rows[0].y[0],Y(120),.006);
 // 기본값으로 되돌리기 brings 마디 선택 back.
 sheet=await editMarker(page,dialog,'cut');
 await expect(pick(sheet).locator('[name=pick][value=""]')).toBeChecked();await expect(sheet.locator('[data-marker-reset]')).toBeEnabled();
 await sheet.locator('[data-marker-reset]').click();await page.getByRole('dialog',{name:'기본값으로 되돌리기'}).getByRole('button',{name:'되돌리기',exact:true}).click();await expect(sheet).toHaveCount(0);
 expect(await builtin(page)).toEqual({});
 await dialog.locator('[data-ink-marker="cut"]').click();await expect(status(dialog)).toContainText('마디를 누르거나');
 await tap(page,dialog,60,88);rows=await placed(page,2);expect(rows[1].measures).toEqual([0,0,12]);
 // 반복 keeps its two taps unless 마디 선택 is chosen; then the bracket sits over the measures and does what 반복 does.
 sheet=await editMarker(page,dialog,'repeat');
 await expect(pick(sheet).locator('label')).toHaveText(['시작과 끝을 차례로 누르기손으로 자리를 정해요','마디 선택마디를 누르거나 끌어요']);await expect(pick(sheet).locator('[name=pick][value=""]')).toBeChecked();
 await pick(sheet).locator('[name=pick][value=measure]').check();await save(sheet).click();await expect(sheet).toHaveCount(0);
 expect((await builtin(page)).repeat.pick).toBe('measure');
 await dialog.locator('[data-ink-marker="repeat"]').click();
 await (await drag(page,dialog,[120,208],[180,208]))();rows=await placed(page,3);
 expect(rows[2]).toMatchObject({mark:'repeat',tool:'pen',measures:[5,6,12],n:4,valid:true});about(rows[2].x[0],X(90));about(rows[2].x[1],X(210));expect(rows[2].y[1]).toBeLessThan(Y(200)); // over the staff
 // A 기호 has no such choice; a user preset (밑줄) can have it, and its mark is a line under the measures.
 sheet=await editMarker(page,dialog,'breath');await expect(pick(sheet)).toBeHidden();
 await sheet.getByRole('button',{name:'돌아가기',exact:true}).click();await expect(sheet).toHaveCount(0);
 await dialog.locator('[data-ink-marker-add]').click();sheet=page.getByRole('dialog',{name:'악보 표기 편집'});
 await expect(pick(sheet)).toBeHidden(); // 기호 by default
 await sheet.locator('[name=name]').fill('밑줄');await sheet.locator('[name=form][value=line]').check();
 await expect(pick(sheet)).toBeVisible();await expect(pick(sheet).locator('[name=pick][value=""]')).toBeChecked();
 await pick(sheet).locator('[name=pick][value=measure]').check();
 await sheet.locator('[name=form][value=wave]').check();await expect(pick(sheet)).toBeHidden();await expect(sheet.locator('[data-marker-input]')).toHaveText('찍는 방식 · 따라 긋기'); // 물결선: its own way only
 await sheet.locator('[name=form][value=line]').check();await expect(pick(sheet).locator('[name=pick][value=measure]')).toBeChecked();
 await save(sheet).click();await expect(sheet).toHaveCount(0);
 const user=(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).markers.user,PRESETS))[0];expect(user).toMatchObject({name:'밑줄',form:'line',pick:'measure'});
 await tap(page,dialog,240,208);rows=await placed(page,4);
 expect(rows[3]).toMatchObject({mark:user.id,tool:'pen',measures:[7,7,12],n:2,role:''});about(rows[3].x[0],X(210));about(rows[3].x[1],X(270));expect(rows[3].y[0]).toBeGreaterThan(Y(216)); // under the staff
 // The list: the mark placed on measures 6–7 is 반복 with its action, the 밑줄 has its row.
 await dialog.getByRole('button',{name:'이동',exact:true}).click();
 const list=await openList(page,dialog);
 await expect(list.getByRole('button',{name:'6–7마디 이 구간 반복',exact:true})).toBeEnabled();await expect(list.locator('[data-measure-row]').last()).toHaveText(/^8마디\s*밑줄$/);
});

test('without a conversion (or one whose pages are not the PDF’s) 마디 선택 falls back to the form’s own way, and the palette says so',async({page})=>{
 for(const conversion of [null,musicxml(SYSTEMS.slice(0,2))]){ // never converted; converted from a one-page file
  await setup(page,{conversion});
  await page.goto('/#/song/s1');await page.getByRole('tab',{name:'악보',exact:true}).click();await page.getByRole('button',{name:'연습 악보 열기',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'악보 개인 필기'});
  await expect(dialog.locator('[data-ink-save-state]')).toContainText('필기 준비됨',{timeout:20000});await page.waitForTimeout(800);
  await expect(dialog.locator('[data-ink-measure-list]')).toHaveCount(0);
  await dialog.locator('[data-ink-marker-mode]').click();
  const note=dialog.locator('[data-ink-marker-measure-note]');
  await expect(note).toHaveText('마디 선택은 음표로 변환한 악보에서 쓸 수 있어요.');await expect(note).toBeVisible();
  const r=await note.boundingBox();expect(r.x).toBeGreaterThanOrEqual(0);expect(r.x+r.width).toBeLessThanOrEqual(page.viewportSize().width+.5);
  await dialog.locator('[data-ink-marker="cut"]').click();
  await expect(status(dialog)).toHaveText('마디 선택은 음표로 변환한 악보에서 쓸 수 있어요. 컷: 표시할 곳을 따라 그어 주세요.');
  await expect(layer(dialog)).toBeHidden();
  await (await drag(page,dialog,[100,120],[140,120]))();
  const rows=await placed(page,1);expect(rows[0]).toMatchObject({mark:'cut',tool:'highlighter',measures:null,group:'',valid:true});about(rows[0].x[0],X(100));about(rows[0].x[1],X(140));
  await dialog.getByRole('button',{name:'돌아가기',exact:true}).click();await expect(dialog).toHaveCount(0);
 }
});

test('320px: placing by 마디 선택 and the 찍는 방식 field stay inside the screen',async({page})=>{
 await page.setViewportSize({width:320,height:640});
 await setup(page,{sync:EVEN});const dialog=await open(page);
 const inside=async locator=>{const r=await locator.boundingBox();expect(r.x).toBeGreaterThanOrEqual(-.5);expect(r.x+r.width).toBeLessThanOrEqual(320.5);return r;};
 await pickMarker(dialog,'cut');await inside(layer(dialog));
 await expect(layer(dialog).locator('.score-measure-box')).toHaveCount(8);
 await tap(page,dialog,120,88);const rows=await placed(page,1);expect(rows[0].measures).toEqual([1,1,12]);
 const sheet=await editMarker(page,dialog,'cut');
 await sheet.locator('[data-marker-pick]').scrollIntoViewIfNeeded();
 for(const l of await sheet.locator('[data-marker-pick] label').all())expect((await inside(l)).height).toBeGreaterThanOrEqual(44);
 await inside(sheet.locator('[data-marker-pick-note]'));
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('.sheet')].every(s=>s.scrollWidth<=s.clientWidth+1))).toBe(true);
});

// ---------- 마디 선택 on a score of several staves per line (voice + piano) ----------
/** Two lines of three staves on page 1 (measures 1–4 at y 60–148, 5–8 at y 220–308), one on page 2. */
const GRAND=[{page:1,y:60,staves:3,x0:30,x1:270,measures:[[1,250],[2,250],[3,250],[4,250]]},{page:1,y:220,staves:3,x0:30,x1:270,measures:[[5,250],[6,250],[7,250],[8,250]]},
 {page:2,y:100,staves:3,x0:30,x1:270,measures:[[9,250],[10,250],[11,250],[12,250]]}];
/** Where the ink of a mark ends, top and bottom, as shares of the page height (ASPECT: page height / width). */
const ROOM=STAFF*.25/PH; // the little room a measure box has around its staff lines (seen on the page)
const ASPECT=PH/PW,inkTop=r=>r.y[0]-r.width/2/ASPECT,inkBottom=r=>r.y[1]+r.width/2/ASPECT;

test('마디 선택 on three staves per line: the mark covers the measure across the whole system, for every form',async({page})=>{
 await setup(page,{sync:EVEN,conversion:musicxml(GRAND),bytes:pdf(GRAND)});const dialog=await open(page);
 await pickMarker(dialog,'cut');
 // The boxes shown while placing are the system's boxes: top of the top staff to bottom of the bottom staff.
 const boxes=await layer(dialog).locator('.score-measure-box').evaluateAll(list=>list.slice(0,2).map(n=>{const v=n.ownerSVGElement.viewBox.baseVal;return [n.y.baseVal.value/v.height,(n.y.baseVal.value+n.height.baseVal.value)/v.height,n.x.baseVal.value/v.width];}));
 about(boxes[0][0],Y(60)-ROOM,.006);about(boxes[0][1],Y(148)+ROOM,.006);
 // A tap on the middle staff of measure 2: 구간 덮기 fills that box — all three staves, barline to barline.
 await tap(page,dialog,120,104);
 let rows=await placed(page,1);
 expect(rows[0]).toMatchObject({mark:'cut',tool:'highlighter',measures:[1,1,12],group:'',valid:true});
 about(inkTop(rows[0]),boxes[0][0],.004);about(inkBottom(rows[0]),boxes[0][1],.004);
 about(rows[0].x[0]-rows[0].width/2,X(90));about(rows[0].x[1]+rows[0].width/2,X(150));
 expect(rows[0].width).toBeLessThanOrEqual(.06);expect(rows[0].n).toBeGreaterThanOrEqual(6); // rows that lie edge to edge, in one stroke
 // On screen it is one see-through band over the three staves.
 const drawn=await dialog.locator('[data-ink-svg] path[data-stroke="'+rows[0].id+'"]').boundingBox(),stage=await dialog.locator('[data-ink-box]').boundingBox();
 about((drawn.y-stage.y)/stage.height,Y(60),.03);about((drawn.y+drawn.height-stage.y)/stage.height,Y(148),.03);expect(drawn.height/stage.height).toBeGreaterThan(Y(148)-Y(60)-.03);
 // Across the line break: one piece per line, each over its whole system.
 await (await drag(page,dialog,[240,70],[60,300]))();rows=await placed(page,3);
 const [upper,lower]=[rows[1],rows[2]].sort((a,b)=>a.y[0]-b.y[0]);
 expect(upper.group).not.toBe('');expect(lower.group).toBe(upper.group);expect(upper.measures).toEqual([3,4,12]);
 about(inkTop(upper),Y(60)-ROOM,.006);about(inkBottom(upper),Y(148)+ROOM,.006);about(inkTop(lower),Y(220)-ROOM,.006);about(inkBottom(lower),Y(308)+ROOM,.006);
 about(upper.x[0]-upper.width/2,X(210));about(lower.x[1]+lower.width/2,X(90));
 // The other forms: a frame round the three staves, a line under the lowest, a bracket over the highest.
 const make=async(name,form)=>{
  await dialog.locator('[data-ink-marker-mode]').click();await dialog.locator('[data-ink-marker-add]').click();
  const sheet=page.getByRole('dialog',{name:'악보 표기 편집'});
  await sheet.locator('[name=name]').fill(name);await sheet.locator('[name=form][value='+form+']').check();await sheet.locator('[name=pick][value=measure]').check();
  await sheet.getByRole('button',{name:'저장',exact:true}).click();await expect(sheet).toHaveCount(0);
 };
 await make('상자','box');await tap(page,dialog,180,250);rows=await placed(page,4);
 about(rows[3].y[0],Y(220)-ROOM,.006);about(rows[3].y[1],Y(308)+ROOM,.006);about(rows[3].x[0],X(150));about(rows[3].x[1],X(210));expect(rows[3].n).toBe(5);
 await make('밑줄','line');await tap(page,dialog,180,250);rows=await placed(page,5);
 about(rows[4].y[0],Y(308)+ROOM,.006);about(rows[4].y[1],Y(308)+ROOM,.006);
 await make('괄호','bracket');await tap(page,dialog,180,250);rows=await placed(page,6);
 about(rows[5].y[1],Y(220)-ROOM,.006);expect(rows[5].y[0]).toBeLessThan(Y(212));
 // The list reads the measures as placed.
 await dialog.getByRole('button',{name:'이동',exact:true}).click();
 const list=await openList(page,dialog);
 await expect(list.locator('[data-measure-row] .score-measure-where')).toHaveText(['2마디','4–5마디','7마디','7마디','7마디']);
});

// ---------- 직접 그리기: a symbol the user drew ----------
const editorOf=page=>page.getByRole('dialog',{name:'악보 표기 편집'});
const pad=sheet=>sheet.locator('[data-marker-pad]'),padStrokes=sheet=>sheet.locator('[data-marker-pad] [data-pad-stroke]');
/** Draws one stroke on the pad with the pointer; points are shares of the pad (0–1). */
async function padStroke(page,sheet,points){
 await pad(sheet).evaluate(n=>n.scrollIntoView({block:'center'}));
 const r=await pad(sheet).boundingBox(),at=p=>[r.x+p[0]*r.width,r.y+p[1]*r.height];
 await page.mouse.move(...at(points[0]));await page.mouse.down();for(const p of points.slice(1))await page.mouse.move(...at(p),{steps:5});await page.mouse.up();
}
/** A T: a bar across the top and a stem down from its middle. */
const drawT=async(page,sheet)=>{await padStroke(page,sheet,[[.3,.25],[.7,.25]]);await padStroke(page,sheet,[[.5,.25],[.5,.75]]);};
const userPresets=page=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)||'{}').markers?.user||[],PRESETS);
const sampleOf=(dialog,id)=>dialog.locator('[data-ink-marker="'+id+'"] svg path');

test('직접 그리기: the pad in 표기 편집 — strokes, 되돌리기, 모두 지우기, an empty drawing cannot be saved; the preset keeps the drawing and its 크기',async({page})=>{
 await setup(page,{sync:EVEN});const dialog=await open(page);
 await dialog.locator('[data-ink-marker-mode]').click();await dialog.locator('[data-ink-marker-add]').click();
 const sheet=editorOf(page);
 await expect(sheet.locator('[data-marker-draw]')).toBeHidden();await expect(sheet.locator('[data-marker-size]')).toBeHidden();
 await expect(sheet.locator('[name=form]')).toHaveCount(7);await expect(sheet.locator('label:has([name=form][value=draw])')).toHaveText('직접 그리기');
 await sheet.locator('[name=name]').fill('내 기호');await sheet.locator('[name=form][value=draw]').check();
 // The pad: a square of at least 240px with a faint staff, nothing on it yet; shapes of 기호 and 찍는 방식 are not offered.
 await expect(sheet.locator('[data-marker-draw]')).toBeVisible();await expect(sheet.locator('[data-marker-shapes]')).toBeHidden();await expect(sheet.locator('[data-marker-pick]')).toBeHidden();
 await expect(sheet.locator('[data-marker-input]')).toHaveText('찍는 방식 · 한 번 누르기');
 await pad(sheet).evaluate(n=>n.scrollIntoView({block:'center'}));
 const size=await pad(sheet).boundingBox();expect(size.width).toBeGreaterThanOrEqual(240);expect(Math.abs(size.width-size.height)).toBeLessThan(1);
 await expect(pad(sheet).locator('line')).toHaveCount(5);await expect(padStrokes(sheet)).toHaveCount(0);
 expect(await pad(sheet).evaluate(n=>getComputedStyle(n).touchAction)).toBe('none');
 const undo=sheet.getByRole('button',{name:'한 획 되돌리기',exact:true}),clear=sheet.getByRole('button',{name:'모두 지우기',exact:true}),note=sheet.locator('[data-marker-pad-note]');
 await expect(undo).toBeDisabled();await expect(clear).toBeDisabled();await expect(note).toHaveText('손가락이나 펜슬로 표기를 그려 주세요. 옅은 줄은 오선이에요.');
 for(const b of [undo,clear])expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(44);
 // Nothing drawn: 저장 says why it cannot.
 await sheet.getByRole('button',{name:'저장',exact:true}).click();
 await expect(sheet.locator('[data-marker-error]')).toHaveText('표기를 그려 주세요. 그린 것이 없으면 저장할 수 없어요.');expect(await userPresets(page)).toEqual([]);
 // Three strokes; the top preview shows the drawing as it will be stamped.
 await drawT(page,sheet);await padStroke(page,sheet,[[.3,.75],[.7,.75]]);
 await expect(padStrokes(sheet)).toHaveCount(3);await expect(note).toHaveText('획 3개 · 12개까지 그릴 수 있어요.');await expect(sheet.locator('[data-marker-error]')).toHaveText('');
 await expect(sheet.locator('[data-marker-preview] path')).toHaveCount(3);
 await expect(sheet.locator('label:has([name=form][value=draw]) svg path')).toHaveCount(3); // and so does its choice
 // 되돌리기 takes the last stroke, 모두 지우기 all of them.
 await undo.click();await expect(padStrokes(sheet)).toHaveCount(2);await expect(sheet.locator('[data-marker-preview] path')).toHaveCount(2);
 await clear.click();await expect(padStrokes(sheet)).toHaveCount(0);await expect(undo).toBeDisabled();
 // A pencil and a finger both draw (pressure is ignored); a tap is a dot.
 await pad(sheet).evaluate(n=>{
  const r=n.getBoundingClientRect(),fire=(type,pointerType,id,x,y,pressure)=>n.dispatchEvent(new PointerEvent(type,{pointerType,pointerId:id,clientX:r.left+x*r.width,clientY:r.top+y*r.height,pressure,bubbles:true,cancelable:true,isPrimary:true}));
  fire('pointerdown','pen',41,.3,.25,.9);fire('pointermove','pen',41,.5,.25,.1);fire('pointermove','pen',41,.7,.25,1);fire('pointerup','pen',41,.7,.25,0);
  fire('pointerdown','touch',42,.5,.25,0);fire('pointermove','touch',42,.5,.5,0);fire('pointermove','touch',42,.5,.75,0);fire('pointerup','touch',42,.5,.75,0);
 });
 await expect(padStrokes(sheet)).toHaveCount(2);
 // 크기 and colour; saved.
 await expect(sheet.locator('[data-marker-size] label')).toHaveText(['작게','보통','크게']);await expect(sheet.locator('[name=size][value=m]')).toBeChecked();
 await sheet.locator('[name=size][value=l]').check();await sheet.locator('[name=color][value="#b42318"]').check();
 await expect(padStrokes(sheet).first()).toHaveAttribute('stroke','#b42318');
 await sheet.getByRole('button',{name:'저장',exact:true}).click();await expect(sheet).toHaveCount(0);await expect(page.locator('.toast')).toHaveText('표기를 추가했어요.');
 const [preset]=await userPresets(page);
 expect(preset).toMatchObject({name:'내 기호',form:'draw',size:'l',color:'#b42318',type:'pen'});
 expect(preset.art.s).toHaveLength(2);expect(preset.art.a).toBeGreaterThan(1.15);expect(preset.art.a).toBeLessThan(1.35); // 0.4 wide, 0.5 high
 expect(preset.art.s.flat().every(v=>Number.isInteger(v)&&v>=0&&v<=1000)).toBe(true);
 expect(preset.art.s[0].slice(0,2)).toEqual([0,0]);expect(preset.art.s[1].at(-1)).toBe(1000); // the bar starts top-left, the stem ends at the bottom
 // The palette draws the real shape.
 await dialog.locator('[data-ink-marker-mode]').click();
 await expect(sampleOf(dialog,preset.id)).toHaveCount(2);await expect(sampleOf(dialog,preset.id).first()).toHaveAttribute('stroke','#b42318');
});

test('a drawn mark is stamped where it is tapped, at its 크기, as ONE mark: one undo, one erase, one selection that moves it whole, one row',async({page})=>{
 await setup(page,{sync:EVEN});const dialog=await open(page);
 await dialog.locator('[data-ink-marker-mode]').click();await dialog.locator('[data-ink-marker-add]').click();
 const sheet=editorOf(page);
 await sheet.locator('[name=name]').fill('내 기호');await sheet.locator('[name=form][value=draw]').check();await drawT(page,sheet);
 await sheet.locator('[name=size][value=l]').check();await sheet.getByRole('button',{name:'저장',exact:true}).click();await expect(sheet).toHaveCount(0);
 const [preset]=await userPresets(page);
 // A tap above measure 2: two strokes, linked, each an ordinary pen stroke that says what it is.
 await tap(page,dialog,120,60);
 let rows=await placed(page,2);
 expect(rows.every(r=>r.mark===preset.id&&r.tool==='pen'&&r.valid&&r.measures===null&&r.role==='')).toBe(true);expect(rows[0].group).not.toBe('');expect(rows[1].group).toBe(rows[0].group);
 const extent=rows=>({x:[Math.min(...rows.map(r=>r.x[0])),Math.max(...rows.map(r=>r.x[1]))],y:[Math.min(...rows.map(r=>r.y[0])),Math.max(...rows.map(r=>r.y[1]))]});
 let e=extent(rows);
 about((e.y[1]-e.y[0])*ASPECT,.08,.006);about(e.x[1]-e.x[0],.064,.008);       // 크게: its longer side is .08 of the page width; it is 4:5
 about((e.x[0]+e.x[1])/2,X(120),.006);about((e.y[0]+e.y[1])/2,Y(60),.006);    // centred on the tap
 await expect(dialog.locator('[data-ink-svg] path[data-stroke]')).toHaveCount(2);
 // One undo, one redo.
 await more(dialog);await dialog.locator('[data-ink-undo]').click();await placed(page,0);
 await more(dialog);await dialog.locator('[data-ink-redo]').click();rows=await placed(page,2);expect(new Set(rows.map(r=>r.group)).size).toBe(1);
 // The eraser on the stem takes the bar too.
 await dialog.getByRole('button',{name:'지우개',exact:true}).click();await tap(page,dialog,120,66);await placed(page,0);
 await more(dialog);await dialog.locator('[data-ink-undo]').click();await placed(page,2);
 // Selecting one stroke selects the mark; moved, it is still one mark.
 await dialog.getByRole('button',{name:'선택',exact:true}).click();await tap(page,dialog,120,66);
 await expect(dialog.locator('[data-ink-selection-count]')).toHaveText('2개 선택');
 const a=await spot(dialog,120,62),b=await spot(dialog,180,62);
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:4});await page.mouse.up();
 await expect.poll(async()=>extent(await marks(page)).x[0]).toBeGreaterThan(X(160));
 rows=await marks(page);expect(rows).toHaveLength(2);expect(rows[0].group).not.toBe('');expect(rows[1].group).toBe(rows[0].group);
 e=extent(rows);about((e.x[0]+e.x[1])/2,X(180),.008);about((e.y[1]-e.y[0])*ASPECT,.08,.006);
 // A second stamp; the list has one row per mark, named after the preset.
 await dialog.locator('[data-ink-marker-mode]').click();await dialog.locator('[data-ink-marker="'+preset.id+'"]').click();
 await tap(page,dialog,60,180);await placed(page,4);
 await dialog.getByRole('button',{name:'이동',exact:true}).click();
 const list=await openList(page,dialog);
 await expect(list.locator('[data-measure-row]')).toHaveText([/^3마디\s*내 기호$/,/^5마디\s*내 기호$/]);
});

test('editing a drawing changes only the marks stamped afterwards; it is still there after a reload; leaving with an unsaved drawing asks first',async({page})=>{
 await setup(page,{sync:EVEN});let dialog=await open(page);
 await dialog.locator('[data-ink-marker-mode]').click();await dialog.locator('[data-ink-marker-add]').click();
 let sheet=editorOf(page);
 await sheet.locator('[name=name]').fill('내 기호');await sheet.locator('[name=form][value=draw]').check();await drawT(page,sheet);
 await sheet.getByRole('button',{name:'저장',exact:true}).click();await expect(sheet).toHaveCount(0);
 const [preset]=await userPresets(page);
 await tap(page,dialog,120,60);const before=JSON.stringify(await page.evaluate(()=>window.VZ.db.scoreAnnotations.filter(s=>s.kind!=='marker-preset')));expect((await marks(page)).length).toBe(2);
 // After a reload the palette still draws it and the editor opens with the drawing on the pad.
 await page.reload();dialog=await open(page);
 await dialog.locator('[data-ink-marker-mode]').click();await expect(sampleOf(dialog,preset.id)).toHaveCount(2);
 await dialog.locator('[data-ink-marker-edit]').click();await dialog.locator('[data-ink-marker="'+preset.id+'"]').click();sheet=editorOf(page);
 await expect(sheet.locator('[name=form][value=draw]')).toBeChecked();await expect(padStrokes(sheet)).toHaveCount(2);await expect(sheet.locator('[data-marker-preview] path')).toHaveCount(2);
 // Opened and closed untouched: no question. With one more stroke: it asks, and 닫기 keeps the old drawing.
 await sheet.getByRole('button',{name:'돌아가기',exact:true}).click();await expect(sheet).toHaveCount(0);
 await dialog.locator('[data-ink-marker="'+preset.id+'"]').click();sheet=editorOf(page);
 await padStroke(page,sheet,[[.3,.75],[.7,.75]]);await expect(padStrokes(sheet)).toHaveCount(3);
 await sheet.getByRole('button',{name:'돌아가기',exact:true}).click();
 const ask=page.getByRole('dialog',{name:'작성 중인 내용이 있어요'});await expect(ask).toBeVisible();
 await ask.getByRole('button',{name:'계속 작성',exact:true}).click();await expect(padStrokes(sheet)).toHaveCount(3);
 await sheet.getByRole('button',{name:'돌아가기',exact:true}).click();await ask.getByRole('button',{name:'닫기',exact:true}).click();await expect(sheet).toHaveCount(0);
 expect((await userPresets(page))[0].art.s).toHaveLength(2);
 // Saved with the third stroke: the mark already on the score is untouched; the next stamp has three strokes.
 await dialog.locator('[data-ink-marker="'+preset.id+'"]').click();sheet=editorOf(page);
 await padStroke(page,sheet,[[.3,.75],[.7,.75]]);await sheet.getByRole('button',{name:'저장',exact:true}).click();await expect(sheet).toHaveCount(0);
 expect((await userPresets(page))[0].art.s).toHaveLength(3);expect(JSON.stringify(await page.evaluate(()=>window.VZ.db.scoreAnnotations.filter(s=>s.kind!=='marker-preset')))).toBe(before);
 await dialog.locator('[data-ink-marker="'+preset.id+'"]').click();await tap(page,dialog,240,60);
 const rows=await placed(page,5);expect(new Set(rows.slice(2).map(r=>r.group)).size).toBe(1);expect(rows[2].group).not.toBe(rows[0].group);
});

test('a drawn mark with a 기능 does it; a built-in mark can be drawn too and 기본값으로 되돌리기 brings its own shape back; at most 12 strokes',async({page})=>{
 await setup(page,{sync:EVEN});const dialog=await open(page);
 await dialog.locator('[data-ink-marker-mode]').click();await dialog.locator('[data-ink-marker-add]').click();
 let sheet=editorOf(page);
 await sheet.locator('[name=name]').fill('내 시작');await sheet.locator('[name=form][value=draw]').check();await drawT(page,sheet);
 await sheet.locator('[name=role][value=start]').check();await sheet.getByRole('button',{name:'저장',exact:true}).click();await expect(sheet).toHaveCount(0);
 await tap(page,dialog,180,112);
 const rows=await placed(page,2);expect(rows.map(r=>r.role)).toEqual(['start','start']);
 // It is a 시작점 at measure 3: the bar offers it, and a tap on either stroke opens its menu.
 await dialog.getByRole('button',{name:'이동',exact:true}).click();
 await expect(opts(dialog)).toBeVisible({timeout:5000});await opts(dialog).click();
 await expect(starts(page)).toHaveText(['처음부터','시작점 3마디에서1쪽']);await closeMenu(page);
 await tap(page,dialog,180,105);
 await expect(page.getByRole('dialog',{name:'내 시작 · 3마디 메뉴'}).getByRole('button')).toHaveText([/여기서 재생/]);await closeMenu(page);
 const list=await openList(page,dialog);
 await expect(list.locator('[data-measure-row]')).toHaveText([/^3마디\s*내 시작$/]);await expect(list.getByRole('button',{name:'3마디 여기서 재생',exact:true})).toBeEnabled();
 await list.getByRole('button',{name:'돌아가기',exact:true}).click();
 // 숨표 drawn by hand, then put back.
 sheet=await editMarker(page,dialog,'breath');
 await sheet.locator('[name=form][value=draw]').check();
 // The 13th stroke is refused and says so.
 for(let i=0;i<12;i++)await padStroke(page,sheet,[[.1+i*.07,.3],[.1+i*.07,.6]]);
 await expect(padStrokes(sheet)).toHaveCount(12);
 await padStroke(page,sheet,[[.2,.8],[.8,.8]]);await expect(padStrokes(sheet)).toHaveCount(12);
 await expect(sheet.locator('[data-marker-pad-note]')).toHaveText('획은 12개까지예요. 되돌리거나 지운 뒤에 그려 주세요.');
 await sheet.getByRole('button',{name:'모두 지우기',exact:true}).click();await drawT(page,sheet);
 await sheet.getByRole('button',{name:'저장',exact:true}).click();await expect(sheet).toHaveCount(0);
 await expect(sampleOf(dialog,'breath')).toHaveCount(2);
 expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).markers.builtin.breath.form,PRESETS)).toBe('draw');
 sheet=await editMarker(page,dialog,'breath');await expect(padStrokes(sheet)).toHaveCount(2);
 await sheet.locator('[data-marker-reset]').click();await page.getByRole('dialog',{name:'기본값으로 되돌리기'}).getByRole('button',{name:'되돌리기',exact:true}).click();await expect(sheet).toHaveCount(0);
 await expect(sampleOf(dialog,'breath')).toHaveCount(1);expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).markers.builtin,PRESETS)).toEqual({});
});

test('필기 PDF 만들기 draws a stamped mark: every stroke of the drawing, in its colour and place',async({page})=>{
 await setup(page,{sync:EVEN});const dialog=await open(page);
 await dialog.locator('[data-ink-marker-mode]').click();await dialog.locator('[data-ink-marker-add]').click();
 const sheet=editorOf(page);
 await sheet.locator('[name=name]').fill('내 기호');await sheet.locator('[name=form][value=draw]').check();await drawT(page,sheet);
 await sheet.locator('[name=size][value=l]').check();await sheet.locator('[name=color][value="#b42318"]').check();await sheet.locator('[name=width]').fill('8');
 await sheet.getByRole('button',{name:'저장',exact:true}).click();await expect(sheet).toHaveCount(0);
 await tap(page,dialog,150,300);await placed(page,2);
 await more(dialog);await dialog.getByRole('button',{name:'색상·굵기·투명도 설정',exact:true}).click();
 const panel=dialog.getByRole('region',{name:'필기 설정',exact:true});await panel.getByRole('tab',{name:'기타',exact:true}).click();
 await panel.getByRole('button',{name:'필기 PDF 만들기',exact:true}).click();
 const link=panel.getByRole('link',{name:'만든 PDF 저장',exact:true});await expect(link).toBeVisible({timeout:20000});
 const rendered=await link.evaluate(async a=>{
  const data=new Uint8Array(await(await fetch(a.href)).arrayBuffer());
  const pdf=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/legacy/build/pdf.min.mjs');
  const document=await pdf.getDocument({data,isEvalSupported:false,standardFontDataUrl:'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/standard_fonts/'}).promise;
  try{
   const page=await document.getPage(1),view=page.getViewport({scale:2}),canvas=window.document.createElement('canvas');canvas.width=Math.ceil(view.width);canvas.height=Math.ceil(view.height);
   await page.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;
   const pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
   const red=i=>Math.abs(pixels[i]-0xb4)<40&&Math.abs(pixels[i+1]-0x23)<40&&Math.abs(pixels[i+2]-0x18)<40;
   const count=([x0,y0,x1,y1])=>{let n=0;for(let i=0;i<pixels.length;i+=4){if(!red(i))continue;const x=(i/4%canvas.width)/canvas.width,y=Math.floor(i/4/canvas.width)/canvas.height;if(x>=x0&&x<=x1&&y>=y0&&y<=y1)n++;}return n;};
   // The T is .064 wide and .08 high (of the page width) around (.5, .75): its bar across the top, its stem down the middle.
   return {all:count([0,0,1,1]),mark:count([.45,.70,.55,.80]),bar:count([.46,.705,.54,.73]),stem:count([.485,.73,.515,.79]),beside:count([.46,.745,.48,.79])};
  }finally{await document.destroy();}
 });
 expect(rendered.mark).toBeGreaterThan(150);expect(rendered.mark/rendered.all).toBeGreaterThan(.97);
 expect(rendered.bar).toBeGreaterThan(50);expect(rendered.stem).toBeGreaterThan(50);expect(rendered.beside).toBe(0);
});

test('320px: the drawing pad, its tools and the 크기 choice stay inside the screen and the pad is still 240px',async({page})=>{
 await page.setViewportSize({width:320,height:640});
 await setup(page,{sync:EVEN});const dialog=await open(page);
 const inside=async locator=>{const r=await locator.boundingBox();expect(r.x).toBeGreaterThanOrEqual(-.5);expect(r.x+r.width).toBeLessThanOrEqual(320.5);return r;};
 await dialog.locator('[data-ink-marker-mode]').click();await dialog.locator('[data-ink-marker-add]').click();
 const sheet=editorOf(page);
 await sheet.locator('[name=name]').fill('내 기호');await sheet.locator('[name=form][value=draw]').check();
 for(const l of await sheet.locator('label:has([name=form])').all())expect((await inside(l)).height).toBeGreaterThanOrEqual(44);
 await pad(sheet).evaluate(n=>n.scrollIntoView({block:'center'}));
 const size=await inside(pad(sheet));expect(size.width).toBeGreaterThanOrEqual(240);expect(Math.abs(size.width-size.height)).toBeLessThan(1);
 expect(size.y).toBeGreaterThanOrEqual(0);expect(size.y+size.height).toBeLessThanOrEqual(640); // the whole pad is on screen at once
 await drawT(page,sheet);await expect(padStrokes(sheet)).toHaveCount(2);
 for(const b of await sheet.locator('.ink-marker-pad-tools button').all())expect((await inside(b)).height).toBeGreaterThanOrEqual(44);
 await sheet.locator('[data-marker-size]').scrollIntoViewIfNeeded();
 for(const l of await sheet.locator('[data-marker-size] label').all())expect((await inside(l)).height).toBeGreaterThanOrEqual(44);
 await inside(sheet.locator('[data-marker-pad-note]'));
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('.sheet')].every(s=>s.scrollWidth<=s.clientWidth+1))).toBe(true);
 await sheet.getByRole('button',{name:'저장',exact:true}).click();await expect(sheet).toHaveCount(0);
 await tap(page,dialog,120,60);await placed(page,2); // the new marker is in hand
});

for(const [width,height] of [[1024,768],[820,1180]])test('tablet '+width+'×'+height+': the drawing pad is a centred square in the form, drawn on with the pointer',async({page},info)=>{
 test.skip(info.project.name!=='chromium-desktop','sizes are set explicitly');
 await page.setViewportSize({width,height});
 await setup(page,{sync:EVEN});const dialog=await open(page);
 await dialog.locator('[data-ink-marker-mode]').click();await dialog.locator('[data-ink-marker-add]').click();
 const sheet=editorOf(page);
 await sheet.locator('[name=name]').fill('내 기호');await sheet.locator('[name=form][value=draw]').check();
 await pad(sheet).evaluate(n=>n.scrollIntoView({block:'center'}));
 const size=await pad(sheet).boundingBox(),form=await sheet.locator('form').boundingBox();
 expect(size.width).toBeGreaterThanOrEqual(240);expect(size.width).toBeLessThanOrEqual(341);expect(Math.abs(size.width-size.height)).toBeLessThan(1);
 expect(Math.abs(size.x+size.width/2-(form.x+form.width/2))).toBeLessThan(2);expect(form.width).toBeLessThanOrEqual(560);
 await drawT(page,sheet);await expect(padStrokes(sheet)).toHaveCount(2);
 await sheet.getByRole('button',{name:'저장',exact:true}).click();await expect(sheet).toHaveCount(0);
 await tap(page,dialog,120,60);await placed(page,2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test.describe('screens for review (only with VZ_SHOTS)',()=>{
 test.use({deviceScaleFactor:2});
 test('phone 375',async({page},info)=>{
  test.skip(!process.env.VZ_SHOTS||info.project.name!=='chromium-mobile','only when screenshots are asked for');
  test.setTimeout(90000);
  await page.setViewportSize({width:375,height:812});
  const BREATH=stroke(1,'pen',[[60,70],[64,76],[68,70]],{mark:'breath',width:.006});
  await setup(page,{sync:EVEN,rows:[...ALL,BREATH,stroke(2,'highlighter',[[160,108],[200,108]])]});const dialog=await openMarked(page);
  await pickStart(page,dialog,/시작점 3마디에서/);
  await page.waitForTimeout(2800);await page.screenshot({path:process.env.VZ_SHOTS+'/mark-bar-375.png'});
  await opts(dialog).click();await expect(optsMenu(page)).toBeVisible();await page.waitForTimeout(300);
  await page.screenshot({path:process.env.VZ_SHOTS+'/mark-play-options-375.png'});
  await closeMenu(page);
  const list=await openList(page,dialog);await page.waitForTimeout(300);
  await page.screenshot({path:process.env.VZ_SHOTS+'/mark-list-375.png'});
  await list.getByRole('button',{name:'돌아가기',exact:true}).click();
  await tap(page,dialog,150,186);await expect(page.locator('.sheet-menu')).toBeVisible();await page.waitForTimeout(300);
  await page.screenshot({path:process.env.VZ_SHOTS+'/mark-tap-menu-375.png'});
  await closeMenu(page);
  await page.waitForTimeout(2800);await play(dialog).click();await expect.poll(async()=>(await mr(page)).time).toBeGreaterThan(3.2);await page.waitForTimeout(1200);
  await page.screenshot({path:process.env.VZ_SHOTS+'/mark-playing-375.png'});
  await stopPlay(dialog).click();
  await dialog.locator('[data-ink-marker-mode]').click();await dialog.locator('[data-ink-marker-add]').click();
  const sheet=page.getByRole('dialog',{name:'악보 표기 편집'});
  await sheet.locator('[name=name]').fill('건너뛸 곳');await sheet.locator('[name=form][value=cover]').check();
  await sheet.locator('[name=role][value=cut]').check();
  await sheet.locator('[data-marker-role]').scrollIntoViewIfNeeded();await sheet.locator('.ink-marker-note').scrollIntoViewIfNeeded();await page.waitForTimeout(300);
  await page.screenshot({path:process.env.VZ_SHOTS+'/mark-editor-role-375.png'});
  await page.keyboard.press('Escape');
  const ask=page.getByRole('dialog',{name:'작성 중인 내용이 있어요'});await ask.getByRole('button',{name:'닫기',exact:true}).click();
  await dialog.locator('[data-ink-marker-edit]').click();await dialog.locator('[data-ink-marker="cut"]').click();
  await sheet.locator('[data-marker-role-fixed]').scrollIntoViewIfNeeded();await page.waitForTimeout(300);
  await page.screenshot({path:process.env.VZ_SHOTS+'/mark-editor-builtin-375.png'});
 });
 test('phone 375: 마디 선택',async({page},info)=>{
  test.skip(!process.env.VZ_SHOTS||info.project.name!=='chromium-mobile','only when screenshots are asked for');
  test.setTimeout(90000);
  await page.setViewportSize({width:375,height:812});
  await setup(page,{sync:EVEN,rows:[START3]});const dialog=await openMarked(page);
  await pickMarker(dialog,'cut');await tap(page,dialog,60,208);await placed(page,2);
  const release=await drag(page,dialog,[180,88],[120,208]);await page.waitForTimeout(300);
  await page.screenshot({path:process.env.VZ_SHOTS+'/measure-pick-dragging-375.png'});
  await release();await placed(page,4);await page.waitForTimeout(300);
  await page.screenshot({path:process.env.VZ_SHOTS+'/measure-pick-placed-375.png'});
  await dialog.getByRole('button',{name:'이동',exact:true}).click();
  const list=await openList(page,dialog);await page.waitForTimeout(300);await page.screenshot({path:process.env.VZ_SHOTS+'/measure-pick-list-375.png'});
  await list.getByRole('button',{name:'돌아가기',exact:true}).click();
  const sheet=await editMarker(page,dialog,'cut');
  await sheet.locator('[data-marker-pick]').scrollIntoViewIfNeeded();await page.waitForTimeout(300);
  await page.screenshot({path:process.env.VZ_SHOTS+'/measure-pick-editor-375.png'});
 });
 test('phone 375: 직접 그리기',async({page},info)=>{
  test.skip(!process.env.VZ_SHOTS||info.project.name!=='chromium-mobile','only when screenshots are asked for');
  test.setTimeout(90000);
  await page.setViewportSize({width:375,height:812});
  await setup(page,{sync:EVEN});const dialog=await open(page);
  await dialog.locator('[data-ink-marker-mode]').click();await dialog.locator('[data-ink-marker-add]').click();
  const sheet=editorOf(page);
  await sheet.locator('[name=name]').fill('강세');await sheet.locator('[name=form][value=draw]').check();
  // An accent: a wedge, with a short line under it.
  await padStroke(page,sheet,[[.25,.3],[.75,.45],[.25,.6]]);await padStroke(page,sheet,[[.3,.75],[.7,.75]]);
  await sheet.locator('[name=color][value="#b42318"]').check();await pad(sheet).evaluate(n=>n.scrollIntoView({block:'center'}));await page.waitForTimeout(300);
  await page.screenshot({path:process.env.VZ_SHOTS+'/draw-pad-375.png'});
  await sheet.getByRole('button',{name:'저장',exact:true}).click();await expect(sheet).toHaveCount(0);
  for(const [x,y] of [[60,62],[150,62],[240,182],[120,182]])await tap(page,dialog,x,y);
  await placed(page,8);await page.waitForTimeout(2800);
  await page.screenshot({path:process.env.VZ_SHOTS+'/draw-stamped-375.png'});
  await dialog.locator('[data-ink-marker-mode]').click();await page.waitForTimeout(300);
  await page.screenshot({path:process.env.VZ_SHOTS+'/draw-palette-375.png'});
 });
 test('phone 375: 마디 선택 on three staves',async({page},info)=>{
  test.skip(!process.env.VZ_SHOTS||info.project.name!=='chromium-mobile','only when screenshots are asked for');
  await page.setViewportSize({width:375,height:812});
  await setup(page,{sync:EVEN,conversion:musicxml(GRAND),bytes:pdf(GRAND)});const dialog=await open(page);
  await pickMarker(dialog,'cut');await tap(page,dialog,120,104);await (await drag(page,dialog,[240,70],[60,300]))();await placed(page,3);await page.waitForTimeout(400);
  await page.screenshot({path:process.env.VZ_SHOTS+'/staves3-cut-375.png'});
 });
});
