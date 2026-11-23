/* 레슨 지적 체크 (app/score-points.js, app/score-points-model.js): points tied to measures on the song page, 부르면서
 * 체크 as a big list (no matched MR) and over the score with the MR matched to the measures, the summary and the
 * history dots, the rows following the account through a sync (data-merge.js, as cloud-sync.js does), and the score
 * viewer leaving them alone (they are not strokes). All data here is made up.
 * The MR in the viewer test is a stand-in player whose clock the test sets (no real audio), so it runs in WebKit too.
 * PDF, conversion and sync fixtures follow tests/score-sync.spec.cjs: 12 measures of 4/4, one a second from 1 s,
 * 5–8 sounding twice. */
const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test);
const {boot,fakeR2,R2}=require('./helpers/r2-fixture.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PDFROOT=process.env.VZ_PDFJS_ROOT||'/tmp/vzip-score-pdfjs/node_modules/pdfjs-dist';
const PW=300,PH=400,UNIT=.4,STAFF=16,OWNER='ui-test-user',SCORE='score-pts',PDFKEY='u/'+OWNER+'/'+SCORE+'/original.pdf',MXL='u/'+OWNER+'/'+SCORE+'/omr.mxl';
const SYSTEMS=[
 {page:1,y:80,x0:30,x1:270,measures:[[1,250],[2,250],[3,250],[4,250]]},
 {page:1,y:200,x0:30,x1:270,measures:[[5,250],[6,250],[7,250],[8,250]]},
 {page:2,y:100,x0:30,x1:270,measures:[[9,250],[10,250],[11,250],[12,250]]}
];
function pdf(){
 const stream=text=>'<< /Length '+Buffer.byteLength(text)+' >>\nstream\n'+text+'\nendstream';
 const content=n=>'BT /F1 10 Tf 20 380 Td (VOCAL.zip Score '+n+') Tj ET\n0 0 0 RG 1 w\n'+SYSTEMS.filter(s=>s.page===n).map(s=>[0,1,2,3,4].map(l=>s.x0+' '+(PH-s.y-l*4)+' m '+s.x1+' '+(PH-s.y-l*4)+' l S').join('\n')).join('\n');
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>'];
 for(let n=1;n<=2;n++)objects.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+PW+' '+PH+'] /Resources << /Font << /F1 7 0 R >> >> /Contents '+(2+n*2)+' 0 R >>',stream(content(n)));
 objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
 let out='%PDF-1.4\n',offsets=[0];
 objects.forEach((o,i)=>{offsets.push(Buffer.byteLength(out));out+=(i+1)+' 0 obj\n'+o+'\nendobj\n';});
 const offset=Buffer.byteLength(out);out+='xref\n0 '+offsets.length+'\n0000000000 65535 f \n'+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size '+offsets.length+' /Root 1 0 R >>\nstartxref\n'+offset+'\n%%EOF';
 return Buffer.from(out);
}
function musicxml(){
 let last=null,body='';
 for(const s of SYSTEMS){
  const first=!last||last.page!==s.page,gap=first?'<top-system-distance>'+s.y/UNIT+'</top-system-distance>':'<system-distance>'+(s.y-last.y-STAFF)/UNIT+'</system-distance>';
  s.measures.forEach(([number,width],i)=>{
   body+='<measure number="'+number+'" width="'+width+'">'+(i?'':'<print'+(!last?'':first?' new-page="yes"':' new-system="yes"')+'><system-layout><system-margins><left-margin>'+s.x0/UNIT+'</left-margin><right-margin>'+(PW-s.x1)/UNIT+'</right-margin></system-margins>'+gap+'</system-layout></print>')+
    (number===1?'<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>':'')+
    '<note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><type>whole</type></note></measure>';
  });
  last=s;
 }
 return '<?xml version="1.0" encoding="UTF-8"?><score-partwise version="4.0"><identification><encoding><software>Audiveris 5.11.0</software></encoding><miscellaneous>'+
  '<miscellaneous-field name="source-sheet-1">1</miscellaneous-field><miscellaneous-field name="source-sheet-2">1</miscellaneous-field></miscellaneous></identification>'+
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
const MRLEN=16,MR={id:'mr-1',kind:'file',title:'연습 MR',fileName:'mr.wav',type:'audio/wav',r2Key:'u/'+OWNER+'/mr-1/original.wav',created:1};
const PLAYED=[[1,0],[2,1],[3,2],[4,3],[5,4],[6,5],[7,6],[8,7],[9,4],[10,5],[11,6],[12,7],[13,8]].map(([t,m])=>({t,m}));
const LESSONS=[{id:'l-old',date:'2026-10-20',songIds:['s1'],status:'done',feedback:'',songFeedback:{s1:'호흡이 짧아요'}},{id:'l-new',date:'2026-11-10',songIds:['s1'],status:'done',songFeedback:{s1:'12마디 숨 미리, 턱 내리기'}}];
const DAY=86400000;
/** A point row as the app writes it (fake data). */
const point=(id,from,to,text,extra={})=>({id:'point:'+id,kind:'score-point',songId:'s1',measures:{from,to},text,created:1763000000000,updated:1763000000000,...extra});
const runRow=(id,at,results)=>({id:'point-run:'+id,kind:'score-point-run',songId:'s1',date:'2026-11-1'+id.slice(-1),at,results});

/** Song s1 with lessons, points and runs; with `score` the PDF, its conversion, an MR (a stand-in player) and the sync. */
async function setup(page,{points=[],runs=[],score=false,strokes=0}={}){
 const r2=await fakeR2(page);
 if(score){
  const bytes=pdf();r2.store.set(PDFKEY,{bytes,type:'application/pdf',etag:'"pdf"'});
  const file=mxl(musicxml());r2.store.set(MXL,{bytes:file,type:'application/vnd.recordare.musicxml',etag:'"mxl"'});
  const job={id:'1'.repeat(24),scoreId:SCORE,status:'done',created:1,finished:2,error:null,resultKey:MXL,resultSize:file.length,movements:1};
  await page.route(R2+'/v1/omr**',route=>route.fulfill({json:{job},headers:{'access-control-allow-origin':'*'}}));
  await page.context().route('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/**',route=>{
   const suffix=new URL(route.request().url()).pathname.split('pdfjs-dist@4.10.38/')[1],f=path.join(PDFROOT,suffix);
   if(!suffix||suffix.includes('..')||!fs.existsSync(f))return route.abort();
   return route.fulfill({path:f,contentType:f.endsWith('.mjs')?'text/javascript':'application/octet-stream',headers:{'access-control-allow-origin':'*'}});
  });
  // The MR: a stand-in player whose time the test sets (window.__mr.el.currentTime); everything else plays as usual.
  await page.addInitScript(()=>{const wait=setInterval(()=>{const M=window.VZ?.media;if(!M?.player||M.player.__fake)return;const make=M.player;
   M.player=(host,item,opts)=>{if(!/^mr-/.test(String(item?.id||'')))return make(host,item,opts);
    const el=new EventTarget();Object.assign(el,{currentTime:0,paused:true,readyState:4,duration:16,error:null,src:'blob:stand-in',playbackRate:1,ended:false,muted:false,play(){this.paused=false;return Promise.resolve();},pause(){this.paused=true;}});
    const p={el,item,load:()=>Promise.resolve(),play:async()=>{el.paused=false;},pause:()=>{el.paused=true;},seek:t=>{el.currentTime=t;},destroy(){}};window.__mr=p;return p;};
   M.player.__fake=true;clearInterval(wait);},5);});
 }
 await boot(page);
 const hash=score?crypto.createHash('sha256').update(pdf()).digest('hex'):'';
 const inked=Array.from({length:strokes},(_,i)=>({version:1,id:'stroke-'+i,ownerId:OWNER,songId:'s1',scoreId:SCORE,r2Key:PDFKEY,pdfHash:hash,page:1,tool:'pen',color:'#101828',width:.004,points:[[.2,.3,.5],[.4,.32,.5]],createdAt:1700000000000+i}));
 await page.evaluate(([lessons,rows,score,size,mr,len,played])=>window.VZ.change(d=>{
  d.lessons=lessons;d.scoreAnnotations=rows;
  if(score){const S=window.VzipScoreSyncModel;d.songs[0].mrTracks=[mr];d.songs[0].scores=[{id:'score-pts',songId:'s1',title:'연습 악보',r2Key:'u/ui-test-user/score-pts/original.pdf',size,uploadedAt:Date.now(),mrSync:{'mr-1':S.entry({anchors:played,count:12,duration:len,now:1700000000000})}}];}
 },{silent:true}),[LESSONS,[...inked,...points,...runs],score,pdf().length,MR,MRLEN,PLAYED]);
}
const rows=(page,kind)=>page.evaluate(k=>(window.VZ.db.scoreAnnotations||[]).filter(r=>r.kind===k),kind);
const record=page=>page.evaluate(()=>JSON.parse(JSON.stringify(window.VZ.db)));
const sync=(page,remote)=>page.evaluate(remote=>{
 const storage=window.VzipAccountScope?.storage||localStorage,merged=window.VzipDataMerge.merge(window.VZ.db,remote).data;
 storage.setItem('vocal-zip_mvp_v1',JSON.stringify(merged));window.dispatchEvent(new CustomEvent('vzip:data-changed',{detail:{source:'cloud-merge'}}));
},remote);
const card=page=>page.locator('[data-pts-card]');
const manageSheet=page=>page.getByRole('dialog',{name:'레슨 지적',exact:true});
const editorSheet=(page,name)=>page.getByRole('dialog',{name,exact:true});
const run=page=>page.locator('[data-pts-run]');
/** No page-wide sideways scroll, nothing wider than a sheet or the run. */
const noOverflow=page=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&[...document.querySelectorAll('.sheet,.vz-pts-run,.vz-pts-card')].every(s=>s.scrollWidth<=s.clientWidth+1));
/** Every visible button and field in `scope` is at least 44 px high. */
async function targets(scope,min=44){for(const b of await scope.locator('button,input:not([type=radio]),select,.vz-pts-tag span').all()){if(!await b.isVisible())continue;const r=await b.boundingBox();expect(r.height,await b.evaluate(e=>e.outerHTML.slice(0,80))).toBeGreaterThanOrEqual(min-.5);}}
async function fillPoint(sheet,{from,to='',text,lesson,tag}){
 await sheet.getByLabel('시작 마디').fill(String(from));await sheet.getByLabel('끝 마디').fill(String(to));await sheet.locator('textarea[name=text]').fill(text);
 if(lesson!==undefined)await sheet.getByLabel('어느 레슨에서').selectOption(lesson);
 if(tag)await sheet.locator('.vz-pts-tag',{hasText:tag}).click();
}
test.afterEach(async({page})=>expect(page.__errors||[]).toEqual([]));

test('지적: add, edit, 이제 됐어요 and delete from the song page; the card follows; no overflow at 390 and 820',async({page})=>{
 await setup(page);await page.goto('/#/song/s1');
 await expect(card(page).locator('[data-pts-card-sub]')).toHaveText('마디에 적어 두고 부를 때 체크해요');
 await card(page).getByRole('button',{name:'지적 추가'}).click();
 let sheet=editorSheet(page,'지적 추가');await expect(sheet).toBeVisible();
 // The latest lesson that took place is chosen to begin with.
 await expect(sheet.getByLabel('어느 레슨에서')).toHaveValue('l-new');
 await fillPoint(sheet,{from:5,to:3,text:'여기서 숨 미리'});await sheet.getByRole('button',{name:'저장'}).click();
 await expect(sheet.locator('[data-pts-error]')).toHaveText('끝 마디는 시작 마디와 같거나 뒤여야 해요.');
 await fillPoint(sheet,{from:12,to:'',text:'여기서 숨 미리',tag:'호흡'});
 await targets(sheet);expect(await noOverflow(page)).toBe(true);
 await sheet.getByRole('button',{name:'저장'}).click();await expect(page.locator('.toast')).toHaveText('지적을 추가했어요.');
 let [p]=await rows(page,'score-point');
 expect(p).toMatchObject({kind:'score-point',songId:'s1',measures:{from:12,to:12},text:'여기서 숨 미리',lessonId:'l-new',tag:'breath'});expect(p.id).toMatch(/^point:/);expect(p.updatedAt).toBeGreaterThan(0);
 await expect(card(page).locator('[data-pts-card-sub]')).toHaveText('지적 1개 · 아직 체크 전');
 if(process.env.VZ_SHOTS)await page.screenshot({path:process.env.VZ_SHOTS+'/points-card-390.png'});
 // A second one, then the list: measure order.
 await card(page).locator('[data-pts-manage]').click();const list=manageSheet(page);
 await list.getByRole('button',{name:'지적 추가'}).click();sheet=editorSheet(page,'지적 추가');
 await fillPoint(sheet,{from:3,to:4,text:'턱 내리기',lesson:''});await sheet.getByRole('button',{name:'저장'}).click();
 await expect(list.locator('[data-pts-row] .vz-pts-where')).toHaveText(['3–4마디','12마디']);
 await expect(list.locator('[data-pts-row]').nth(1).locator('small')).toHaveText(/11월 10일 .* 레슨 · 호흡/);
 await expect(list.locator('[data-pts-row]').first().locator('.vz-pts-record')).toHaveText('아직 체크한 적이 없어요');
 await targets(list);expect(await noOverflow(page)).toBe(true);
 // Edit: measures and text change, created stays.
 await list.getByRole('button',{name:'12마디 여기서 숨 미리 수정'}).click();sheet=editorSheet(page,'지적 수정');
 await expect(sheet.getByLabel('시작 마디')).toHaveValue('12');await expect(sheet.getByLabel('끝 마디')).toHaveValue('');
 await fillPoint(sheet,{from:11,to:12,text:'11마디 끝에서 숨 미리'});await sheet.getByRole('button',{name:'저장'}).click();
 await expect(page.locator('.toast')).toHaveText('지적을 고쳤어요.');
 const edited=(await rows(page,'score-point')).find(r=>r.id===p.id);
 expect(edited).toMatchObject({measures:{from:11,to:12},text:'11마디 끝에서 숨 미리',created:p.created,tag:'breath'});
 // 이제 됐어요: kept, out of the runs, under 그만 보는 지적; and back.
 await list.getByRole('button',{name:'11–12마디 11마디 끝에서 숨 미리 수정'}).click();sheet=editorSheet(page,'지적 수정');
 await sheet.getByRole('button',{name:/이제 됐어요/}).click();
 await expect(list.locator('.vz-pts-rows').first().locator('[data-pts-row]')).toHaveCount(1);
 await expect(list.locator('.vz-pts-retired summary')).toHaveText('그만 보는 지적 1');
 expect((await rows(page,'score-point')).find(r=>r.id===p.id).retired).toBeGreaterThan(0);
 await expect(card(page).locator('[data-pts-card-sub]')).toHaveText('지적 1개 · 아직 체크 전');
 await list.locator('.vz-pts-retired summary').click();await list.getByRole('button',{name:'다시 체크하기'}).click();
 expect((await rows(page,'score-point')).find(r=>r.id===p.id).retired).toBeUndefined();
 // Delete: asks, then the row goes and leaves a tombstone.
 await list.getByRole('button',{name:'3–4마디 턱 내리기 수정'}).click();sheet=editorSheet(page,'지적 수정');
 const gone=(await rows(page,'score-point')).find(r=>r.text==='턱 내리기').id;
 await sheet.getByRole('button',{name:'지적 삭제'}).click();await page.locator('.sheet-alert [data-ok]').click();
 await expect(page.locator('.toast')).toHaveText('지적을 삭제했어요.');
 expect((await rows(page,'score-point')).map(r=>r.id)).toEqual([p.id]);
 expect(await page.evaluate(id=>window.VZ.db.deleted.scoreAnnotations.includes(id),gone)).toBe(true);
 // 820 wide (iPad portrait): the card and the list fit.
 await page.setViewportSize({width:820,height:1180});expect(await noOverflow(page)).toBe(true);await targets(list);
 // Rows survive a reload.
 await page.reload();await expect(card(page).locator('[data-pts-card-sub]')).toHaveText('지적 1개 · 아직 체크 전');
});

test('부르면서 체크 without a matched MR: a big list in measure order, one tap each, summary and history dots, 그만 볼까요?',async({page})=>{
 const now=Date.now(),a=point('a',3,4,'여기서 숨 미리'),b=point('b',1,1,'턱 내리기',{tag:'path'}),c=point('c',8,9,'끝까지 소리 유지'),old=point('old',2,2,'이미 된 것',{retired:1});
 // b was kept the last four runs: one more makes five in a row.
 const before=[1,2,3,4].map(i=>runRow('r'+i,now-(5-i)*DAY,{[b.id]:'kept',[a.id]:i%2?'missed':'kept'}));
 await setup(page,{points:[a,b,c,old],runs:before});await page.goto('/#/song/s1');
 await expect(card(page).locator('[data-pts-card-sub]')).toHaveText(/^지적 3개 · 마지막 체크 /);
 await card(page).getByRole('button',{name:'부르면서 체크'}).click();
 const r=run(page);await expect(r).toBeVisible();await expect(r).toHaveAttribute('aria-label','부르면서 체크');
 await expect(r.locator('[data-pts-item] .vz-pts-where')).toHaveText(['1마디','3–4마디','8–9마디']); // retired one left out
 await expect(r.locator('[data-pts-item] .vz-pts-text').first()).toHaveText('턱 내리기');
 await expect(r.locator('[data-pts-progress]')).toHaveText('0/3 체크');
 // Big targets, no sideways scroll.
 for(const m of await r.locator('.vz-pts-mark').all()){const box=await m.boundingBox();expect(box.height).toBeGreaterThanOrEqual(56);expect(box.width).toBeGreaterThanOrEqual(56);}
 await targets(r);expect(await noOverflow(page)).toBe(true);
 if(process.env.VZ_SHOTS)await page.screenshot({path:process.env.VZ_SHOTS+'/points-run-list-390.png'});
 // iPad, both ways round: still no sideways scroll, targets as big.
 for(const size of [{width:820,height:1180},{width:1180,height:820}]){await page.setViewportSize(size);expect(await noOverflow(page)).toBe(true);await targets(r);if(process.env.VZ_SHOTS)await page.screenshot({path:process.env.VZ_SHOTS+'/points-run-list-'+size.width+'.png'});}
 await page.setViewportSize({width:390,height:844});
 const item=id=>r.locator('[data-pts-item="'+id+'"]');
 await item(b.id).getByRole('button',{name:'지켰어요'}).click();
 await item(a.id).getByRole('button',{name:'놓쳤어요'}).click();
 await item(c.id).getByRole('button',{name:'지켰어요'}).click();await item(c.id).getByRole('button',{name:'지켰어요'}).click(); // again: unmarked
 await expect(item(b.id).getByRole('button',{name:'지켰어요'})).toHaveAttribute('aria-pressed','true');
 await expect(item(c.id).getByRole('button',{name:'지켰어요'})).toHaveAttribute('aria-pressed','false');
 await expect(r.locator('[data-pts-progress]')).toHaveText('2/3 체크');
 await r.getByRole('button',{name:'끝내기'}).click();
 await expect(r).toHaveAttribute('aria-label','이번 체크 결과');
 await expect(r.locator('[data-pts-counts] b')).toHaveText(['1','1','1']);
 // History with this run: b ✓✓✓✓✓ and the suggestion; a ✗✓✗✓✗.
 await expect(item(b.id).locator('.vz-pts-dot')).toHaveCount(5);await expect(item(b.id).locator('.vz-pts-record')).toHaveText('최근 5번 중 5번 지켰어요');
 await expect(item(a.id).locator('.vz-pts-dots')).toHaveAttribute('aria-label','최근 체크: 놓침, 지킴, 놓침, 지킴, 놓침');
 await expect(item(a.id).locator('.vz-pts-record')).toHaveText('최근 5번 중 2번 지켰어요');
 await expect(item(b.id).locator('[data-pts-suggest]')).toContainText('이제 몸에 붙었어요 · 그만 볼까요?');
 await expect(item(a.id).locator('[data-pts-suggest]')).toHaveCount(0);
 await targets(r);expect(await noOverflow(page)).toBe(true);
 if(process.env.VZ_SHOTS)await page.screenshot({path:process.env.VZ_SHOTS+'/points-summary-390.png'});
 await r.getByRole('button',{name:'저장',exact:true}).click();await expect(page.locator('.toast')).toHaveText('체크를 저장했어요.');
 await expect(r).toHaveCount(0);
 const saved=(await rows(page,'score-point-run')).find(x=>!before.some(y=>y.id===x.id));
 expect(saved).toMatchObject({kind:'score-point-run',songId:'s1',mode:'list',results:{[b.id]:'kept',[a.id]:'missed'}});
 expect(Object.keys(saved.results)).toHaveLength(2);expect(saved.recordingId).toBeUndefined();
 expect(saved.date).toBe(await page.evaluate(()=>window.VZ.today()));
 // No practice time is counted from a run.
 expect(await page.evaluate(()=>window.VZ.db.practices.length)).toBe(0);
 await expect(card(page).locator('[data-pts-card-sub]')).toHaveText(/^지적 3개 · 마지막 체크 .*/);
 // The list shows the suggestion too; 계속 볼래요 keeps it and the next five count again.
 await card(page).locator('[data-pts-manage]').click();const list=manageSheet(page);
 const brow=list.locator('[data-pts-row="'+b.id+'"]');
 await expect(brow.locator('.vz-pts-dot.is-kept')).toHaveCount(5);
 await brow.getByRole('button',{name:'계속 볼래요'}).click();await expect(brow.locator('[data-pts-suggest]')).toHaveCount(0);
 expect((await rows(page,'score-point')).find(x=>x.id===b.id).stay).toBeGreaterThan(0);
 // A run with nothing marked cannot be saved.
 await list.getByRole('button',{name:'부르면서 체크'}).click();
 await expect(r.locator('[data-pts-item]')).toHaveCount(3);
 await r.getByRole('button',{name:'끝내기'}).click();await expect(r.getByRole('button',{name:'저장',exact:true})).toBeDisabled();
 await r.getByRole('button',{name:'저장 안 하고 닫기'}).click();await expect(r).toHaveCount(0);
 expect((await rows(page,'score-point-run')).length).toBe(5);
});

test('points and runs follow the account: added on one device, edited on the other, a deletion stays deleted',async({page,browser},info)=>{
 await setup(page,{points:[point('a',3,4,'여기서 숨 미리')]});await page.goto('/#/song/s1');
 const u=info.project.use,context=await browser.newContext({viewport:u.viewport,isMobile:u.isMobile,hasTouch:u.hasTouch,deviceScaleFactor:u.deviceScaleFactor,userAgent:u.userAgent,baseURL:new URL(page.url()).origin});
 await context.addInitScript(()=>{window.VZIP_DEVICE_SESSIONS_ENABLED=false;window.VZIP_APPROVED_HOME_ENABLED=false;});
 const phone=await context.newPage();await setup(phone);await phone.goto('/#/song/s1');
 await expect(card(phone).locator('[data-pts-card-sub]')).toHaveText(/^마디에 적어 두고/);
 await sync(phone,await record(page));
 await expect(card(phone).locator('[data-pts-card-sub]')).toHaveText('지적 1개 · 아직 체크 전');
 // The phone adds one and checks a run; the iPad gets both.
 await card(phone).locator('[data-pts-manage]').click();await manageSheet(phone).getByRole('button',{name:'지적 추가'}).click();
 const sheet=editorSheet(phone,'지적 추가');await fillPoint(sheet,{from:7,text:'턱 내리기'});await sheet.getByRole('button',{name:'저장'}).click();
 await expect(phone.locator('.toast')).toHaveText('지적을 추가했어요.');
 await manageSheet(phone).getByRole('button',{name:'부르면서 체크'}).click();
 await run(phone).locator('[data-pts-item]').first().getByRole('button',{name:'지켰어요'}).click();
 await run(phone).getByRole('button',{name:'끝내기'}).click();await run(phone).getByRole('button',{name:'저장',exact:true}).click();
 await sync(page,await record(phone));
 await expect(card(page).locator('[data-pts-card-sub]')).toHaveText(/^지적 2개 · 마지막 체크 /);
 expect((await rows(page,'score-point-run'))).toHaveLength(1);
 // Edited on the iPad, deleted on the phone; the deletion holds both ways.
 const added=(await rows(page,'score-point')).find(x=>x.text==='턱 내리기');
 await page.evaluate(id=>window.VZ.change(d=>{const r=d.scoreAnnotations.find(x=>x.id===id);r.text='턱 힘 빼기';},{silent:true}),'point:a');
 await sync(phone,await record(page));
 expect((await rows(phone,'score-point')).find(x=>x.id==='point:a').text).toBe('턱 힘 빼기');
 await phone.evaluate(id=>window.VZ.change(d=>{d.scoreAnnotations=d.scoreAnnotations.filter(x=>x.id!==id);},{silent:true}),added.id);
 await sync(page,await record(phone));await sync(phone,await record(page));
 for(const p of [page,phone])expect((await rows(p,'score-point')).map(x=>x.id)).toEqual(['point:a']);
 expect(phone.__errors).toEqual([]);await context.close();
});

test('마디별 지적으로 적기 from a lesson: that lesson, its feedback shown for reference',async({page})=>{
 await setup(page);await page.goto('/#/lesson/l-old');
 await page.getByRole('button',{name:'마디별 지적으로 적기'}).click();
 const sheet=editorSheet(page,'지적 추가');
 await expect(sheet.locator('.vz-pts-feedback p')).toHaveText('호흡이 짧아요');await expect(sheet.getByLabel('어느 레슨에서')).toHaveValue('l-old');
 await fillPoint(sheet,{from:2,to:3,text:'숨 깊게'});await sheet.getByRole('button',{name:'저장'}).click();
 expect((await rows(page,'score-point'))[0]).toMatchObject({lessonId:'l-old',measures:{from:2,to:3}});
});

test('over the score with the MR matched: the point shows a measure ahead, then asks; taps are kept; ink ignores the rows',async({page})=>{
 const a=point('a',3,4,'여기서 숨 미리'),b=point('b',6,6,'턱 내리기');
 await setup(page,{score:true,strokes:1,points:[a,b],runs:[runRow('r1',Date.now()-DAY,{[a.id]:'missed'})]});
 await page.goto('/#/song/s1');await page.getByRole('tab',{name:'악보',exact:true}).click();
 await page.getByRole('button',{name:'연습 악보 열기',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'악보 개인 필기'});
 await expect(dialog.locator('[data-ink-save-state]')).toContainText('필기 준비됨',{timeout:20000});
 await expect(dialog.locator('[data-ink-measure-sync]')).toHaveCount(1,{timeout:15000});
 // The rows are not strokes: one drawn stroke, and none of them in the device recovery copy.
 await expect(dialog.locator('[data-stroke]')).toHaveCount(1);
 const ledger=await page.evaluate(()=>JSON.parse(localStorage.getItem('vzip_score_ink_v1:ui-test-user')||'{"records":[]}').records.map(r=>r.id));
 expect(ledger.filter(id=>/^point/.test(id))).toEqual([]);
 if(await dialog.getAttribute('data-ink-more-open')!=='true')await dialog.locator('[data-ink-more]').click();
 const item=dialog.locator('[data-ink-points-run]');await expect(item).toHaveAttribute('aria-label','부르면서 체크 · 지적 2개');
 await item.click();
 const r=run(page);await expect(r).toHaveClass(/is-panel/);await expect(r.locator('[data-pts-wait="idle"]')).toBeVisible();
 await expect(r.locator('.vz-pts-next')).toHaveText('첫 지적 · 3–4마디 · 여기서 숨 미리');
 // The play bar stays usable below the panel.
 const panel=await r.locator('.vz-pts-panel').boundingBox(),playButton=dialog.locator('[data-score-audio]').getByRole('button',{name:'재생',exact:true});
 const pb=await playButton.boundingBox();expect(pb.y).toBeGreaterThanOrEqual(panel.y+panel.height);
 await playButton.click();await expect.poll(()=>page.evaluate(()=>window.__mr&&!window.__mr.el.paused)).toBe(true);
 const at=t=>page.evaluate(t=>{window.__mr.el.currentTime=t;},t);
 await at(.5);await expect(r.locator('[data-pts-next]')).toHaveText('다음 · 3–4마디 · 여기서 숨 미리');
 await at(2.4);await expect(r.locator('[data-pts-cue="soon"]')).toContainText('곧 · 3–4마디');await expect(r.locator('[data-pts-cue] .vz-pts-cue-text')).toHaveText('여기서 숨 미리');
 await at(3.5);await expect(r.locator('[data-pts-cue="now"]')).toContainText('지금 · 3–4마디');await expect(r.locator('[data-pts-ask]')).toHaveCount(0);
 // Measure 4 is over: the check, while 6마디 is coming.
 await at(5.3);await expect(r.locator('[data-pts-ask="'+a.id+'"]')).toBeVisible();await expect(r.locator('[data-pts-cue="soon"]')).toContainText('곧 · 6마디');
 for(const m of await r.locator('.vz-pts-mark').all()){const box=await m.boundingBox();expect(box.height).toBeGreaterThanOrEqual(56);}
 await r.locator('[data-pts-ask="'+a.id+'"]').getByRole('button',{name:'지켰어요'}).click();
 await expect(r.locator('[data-pts-progress]')).toHaveText('1/2 체크');
 await at(7.4);await expect(r.locator('[data-pts-ask="'+b.id+'"]')).toBeVisible(); // the one still waiting comes first
 await r.locator('[data-pts-ask="'+b.id+'"]').getByRole('button',{name:'놓쳤어요'}).click();
 // 6마디 sounds again at 10 s (the repeat): reminded again.
 await at(9.5);await expect(r.locator('[data-pts-cue="soon"]')).toContainText('곧 · 6마디');
 expect(await noOverflow(page)).toBe(true);await targets(r.locator('.vz-pts-panel-top'));
 if(process.env.VZ_SHOTS)await page.screenshot({path:process.env.VZ_SHOTS+'/points-panel-390.png'});
 // iPad landscape: the panel stays within the screen and leaves the play bar free.
 await page.setViewportSize({width:1180,height:820});expect(await noOverflow(page)).toBe(true);
 const wide=await r.locator('.vz-pts-panel').boundingBox();expect(wide.width).toBeLessThanOrEqual(720.5);expect(wide.height).toBeLessThan(410);
 if(process.env.VZ_SHOTS)await page.screenshot({path:process.env.VZ_SHOTS+'/points-panel-1180.png'});
 await page.setViewportSize({width:390,height:844});
 await r.getByRole('button',{name:'끝내기'}).click();
 await expect(r.locator('[data-pts-counts] b')).toHaveText(['1','1','0']);
 await expect(r.locator('[data-pts-item="'+a.id+'"] .vz-pts-dots')).toHaveAttribute('aria-label','최근 체크: 놓침, 지킴');
 await r.getByRole('button',{name:'저장',exact:true}).click();await expect(r).toHaveCount(0);
 const saved=(await rows(page,'score-point-run')).find(x=>x.id!=='point-run:r1');
 expect(saved).toMatchObject({mode:'timed',scoreId:SCORE,results:{[a.id]:'kept',[b.id]:'missed'}});
 // Still one stroke after the rows changed.
 await expect(dialog.locator('[data-stroke]')).toHaveCount(1);
});

test('in the viewer without a matched MR the run is the list; a measure box can take a point',async({page})=>{
 await setup(page,{score:true,points:[point('a',3,4,'여기서 숨 미리')]});
 await page.evaluate(()=>window.VZ.change(d=>{delete d.songs[0].scores[0].mrSync;},{silent:true}));
 await page.evaluate(()=>localStorage.setItem('vzip_score_measures_v1:ui-test-user',JSON.stringify({on:true,noted:true})));
 await page.goto('/#/song/s1');await page.getByRole('tab',{name:'악보',exact:true}).click();
 await page.getByRole('button',{name:'연습 악보 열기',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'악보 개인 필기'});
 await expect(dialog.locator('[data-ink-save-state]')).toContainText('필기 준비됨',{timeout:20000});
 await expect(dialog.locator('[data-ink-measures] .score-measure-box')).toHaveCount(8,{timeout:15000});
 // Press and hold measure 6 with the 이동 tool: 이 마디에 지적 추가 starts at 6.
 await dialog.getByRole('button',{name:'이동',exact:true}).click();
 const r=await dialog.locator('[data-ink-box]').boundingBox(),s=SYSTEMS[1],w=(s.x1-s.x0)/4,x=r.x+(s.x0+w*1.5)/PW*r.width,y=r.y+(s.y+STAFF/2)/PH*r.height;
 await page.mouse.move(x,y);await page.mouse.down();await page.waitForTimeout(750);await page.mouse.up();
 const menu=page.getByRole('dialog',{name:'6마디 메뉴'});await menu.getByRole('button',{name:'이 마디에 지적 추가'}).click();
 const sheet=editorSheet(page,'지적 추가');await expect(sheet.getByLabel('시작 마디')).toHaveValue('6');
 await sheet.locator('textarea[name=text]').fill('소리 크기 줄이기');await sheet.getByRole('button',{name:'저장'}).click();
 expect((await rows(page,'score-point')).find(p=>p.text==='소리 크기 줄이기')).toMatchObject({measures:{from:6,to:6},scoreId:SCORE});
 if(await dialog.getAttribute('data-ink-more-open')!=='true')await dialog.locator('[data-ink-more]').click();
 await dialog.locator('[data-ink-points-run]').click();
 await expect(run(page)).toHaveClass(/is-list/);await expect(run(page).locator('[data-pts-item] .vz-pts-where')).toHaveText(['3–4마디','6마디']);
 expect(await noOverflow(page)).toBe(true);
 await run(page).getByRole('button',{name:'끝내기'}).click();await run(page).getByRole('button',{name:'저장 안 하고 닫기'}).click();
});
