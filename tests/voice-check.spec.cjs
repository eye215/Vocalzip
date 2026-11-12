// 매일 보이스 체크: injected 30-second recording (synthesized steady check), saved as a training recording with its tag,
// analysed on the device, kept out of song growth; home card hides after today's check; trend renders at 320px.
const {test,expect}=require('@playwright/test');
require('./legacy-session-mode.cjs')(test,{approvedHome:true});
const {boot}=require('./helpers/r2-fixture.cjs');
const {synth}=require('./synth-vocal.cjs');
const VC=require('../app/voice-check-model.js');

function checkWav(ref,high){
 const P=VC.PROTOCOL.parts,f=k=>P.find(p=>p.key===k),s=f('scale');
 const notes=[[f('sustain').start+.1,5.8,ref,0,true],...s.offsets.map((o,i)=>[s.start+i*s.step+.05,s.step-.15,ref+o,0,false]),[f('high').start+.1,6,high,0,true]];
 const {samples,sr}=synth({sr:16000,withMr:false,dur:30,notes});
 const b=Buffer.alloc(44+samples.length*2);
 b.write('RIFF',0);b.writeUInt32LE(36+samples.length*2,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(samples.length*2,40);
 for(let i=0;i<samples.length;i++)b.writeInt16LE(Math.max(-32767,Math.min(32767,Math.round(samples[i]*20000))),44+i*2);
 return b.toString('base64');
}
const WAV=checkWav(57,66); // 테너: 기준음 A3, 고음 F#4

async function fakeMic(page){
 await page.evaluate(b64=>{
  window.VZIP_VOICE_CHECK_SPEED=15; // the guide runs 15× faster; the injected take is a real-time 30-second check
  const bytes=Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
  window.__captures=0;
  window.VZ.media.capture=async({onLevel}={})=>{
   window.__captures++;let t0=0,stopped=false;
   return {start(){t0=performance.now();},seconds:()=>t0?(performance.now()-t0)/1000:0,get state(){return stopped?'inactive':'recording';},
    async stop(){stopped=true;onLevel?.(0);return {blob:new Blob([bytes],{type:'audio/wav'}),type:'audio/wav',durationSeconds:30,waveform:[.2,.4,.3],releaseProtection(){}};},
    cancel(){stopped=true;}};
  };
 },WAV);
}
async function runCheck(page,{type='테너',rating=4,tag='피곤',shots=false}={}){
 await expect(page.getByRole('heading',{name:'같은 루틴으로 목 상태를 기록해요'})).toBeVisible();
 await expect(page.getByRole('button',{name:'30초 체크 시작'})).toBeDisabled();
 await page.getByRole('button',{name:type,exact:true}).click();
 await expect(page.locator('[data-vc-ref]')).toHaveValue('57');
 if(shots)await page.screenshot({path:test.info().outputPath('intro.png'),fullPage:true});
 await page.getByRole('button',{name:'30초 체크 시작'}).click();
 await expect(page.locator('.vc-recording')).toBeVisible();
 if(shots)await page.screenshot({path:test.info().outputPath('rec.png')});
 await expect(page.getByRole('heading',{name:'지금 목 상태는 어때요?'})).toBeVisible({timeout:15000});
 await page.locator('[data-vc-rate="'+rating+'"]').click();
 if(tag)await page.getByRole('button',{name:tag,exact:true}).click();
 await page.getByRole('button',{name:'결과 보기'}).click();
 await expect(page.locator('.vc-done .vc-result')).toBeVisible({timeout:30000});
}

test('daily check: home card → 30-second check saved as training with its tag, analysed, home card gone',async({page})=>{
 test.setTimeout(90000);
 await boot(page);
 await fakeMic(page);
 const card=page.locator('.vz-student-home [data-row="voice-check"]');
 await expect(card).toBeVisible();
 await expect(card).toContainText('오늘 보이스 체크');
 expect((await card.boundingBox()).height).toBeGreaterThanOrEqual(44);
 await page.screenshot({path:test.info().outputPath('home.png')});
 await card.click();
 await expect(page).toHaveURL(/#\/voice-check\/run$/);
 await runCheck(page,{shots:true});
 await expect(page.locator('.vc-done')).toContainText('지속음 흔들림');
 await page.screenshot({path:test.info().outputPath('done.png'),fullPage:true});
 await expect(page.locator('.vc-done')).toContainText('평소 기준을 만드는 중');
 const saved=await page.evaluate(async()=>{
  const p=window.VZ.db.practices.find(x=>x.voiceCheck);
  const stored=(await window.vzipReadMedia()).find(m=>m.id===p.voiceCheck.mediaId);
  const merged=(await window.VZ.media.list(true)).find(m=>m.id===p.voiceCheck.mediaId);
  return {p,stored:{...stored,blob:undefined,bytes:undefined,size:stored.blob?.size,type:stored.type},category:window.VZ.media.recordingCategory(merged),songSearch:window.VZ.media.songSearchEligible(merged),
   activity:[...window.VZ.songActivity([merged]).keys()],entries:window.VZ.timeEntries().filter(e=>e.ref.id===p.id).map(e=>({training:e.training,songId:e.songId})),prefs:window.VZ.db.settings.voiceCheck};
 });
 expect(saved.p).toMatchObject({practiceMode:'training',songId:'',practiceTimeSource:'voice-check',mediaIds:[saved.p.voiceCheck.mediaId],
  voiceCheck:{v:1,protocol:'vc30-v1',refNote:57,highNote:66,selfRating:4,tags:['tired'],error:''}});
 const m=saved.p.voiceCheck.metrics;
 expect(m.reliable).toBe(true);
 expect(m.sustainWobble).toBeLessThan(8);expect(m.scaleCents).toBeLessThan(8);expect(m.highHold).toBeGreaterThan(4);
 expect(saved.stored).toMatchObject({recordingCategory:'training',songId:'',origin:'voice-check',type:'audio/wav',voiceCheck:{v:1,protocol:'vc30-v1',refNote:57,highNote:66}});
 expect(saved.stored.size).toBe(44+16000*30*2); // the original take, byte for byte (no re-encode)
 expect(saved.stored.analysis.v).toBe(2);
 expect(saved.category).toBe('training');expect(saved.songSearch).toBe(false);expect(saved.activity).toEqual([]);
 expect(saved.entries).toEqual([{training:true,songId:''}]);
 expect(saved.prefs).toMatchObject({voiceType:'tenor',refNote:57,highNote:66,tones:true});
 // 성장 entry says today's check is done; the home card is gone.
 await page.evaluate(()=>window.VZ.nav('#/vocal-growth'));
 await expect(page.locator('.vc-entry')).toContainText('오늘 완료');
 await page.evaluate(()=>window.VZ.nav('#/home'));
 await expect(page.locator('.vz-student-home .vz-today-line')).toBeVisible();
 await expect(page.locator('.vz-student-home [data-row="voice-check"]')).toHaveCount(0);
 expect(page.__errors).toEqual([]);
});

test('exported hook: VZ.voiceCheck.open({onDone}) returns the result to the caller',async({page})=>{
 test.setTimeout(90000);
 await boot(page);
 await fakeMic(page);
 await page.evaluate(()=>{window.__done=null;window.VZ.voiceCheck.open({onDone:r=>{window.__done=r;window.VZ.nav('#/home');}});});
 await runCheck(page,{rating:2,tag:'쉰 소리'});
 await expect(page.locator('.vc-done .vc-flag[data-tone="rest"]')).toContainText('쉬어');
 await page.getByRole('button',{name:'다음으로'}).click();
 await expect(page).toHaveURL(/#\/home$/);
 const done=await page.evaluate(()=>window.__done);
 expect(done).toMatchObject({selfRating:2,tags:['hoarse'],state:{level:'rest'}});
 expect(done.metrics.reliable).toBe(true);
 expect(page.__errors).toEqual([]);
});

test('voice check page: baseline, gentle flag and 30-day trend fit a 320px screen',async({page})=>{
 await page.setViewportSize({width:320,height:720});
 await boot(page);
 await page.evaluate(()=>{
  const V=window.VZ,day=n=>{const d=new Date();d.setDate(d.getDate()-n);return V.ymd(d);};
  V.change(d=>{
   for(let n=20;n>=0;n--)d.practices.push({id:'voice-check:t'+n,date:day(n),minutes:.5,manualMinutes:.5,practiceMode:'training',songId:'',practiceTimeSource:'voice-check',mediaIds:['t'+n],created:Date.now()-n*864e5,
    voiceCheck:{v:1,protocol:'vc30-v1',refNote:57,highNote:66,mediaId:'t'+n,at:Date.now()-n*864e5,selfRating:n?4:3,tags:[],
     metrics:{reliable:true,sustainWobble:n?4+(n%3):14,scaleCents:6+(n%2),highHold:6-(n%2)*.5,highWobble:5,voicedPct:90,scaleBias:-2}}});
  },{silent:true});
  V.nav('#/voice-check');
 });
 await expect(page.locator('.vc-result')).toContainText('평소보다 흔들림이 커요 — 무리하지 마세요.');
 await expect(page.locator('.vc-stats')).toContainText('21');
 await expect(page.locator('.vc-chart svg')).toHaveCount(5);
 await expect(page.getByRole('button',{name:'한 번 더 체크하기'})).toBeVisible();
 const layout=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,charts:[...document.querySelectorAll('.vc-chart')].map(c=>c.getBoundingClientRect().right)}));
 expect(layout.scroll).toBeLessThanOrEqual(320);
 for(const right of layout.charts)expect(right).toBeLessThanOrEqual(320);
 const chart=page.locator('.vc-chart[data-metric="sustainWobble"]');
 await expect(chart.locator('[data-vc-readout]')).toHaveText(/±14 cent/);
 const box=await chart.locator('svg').boundingBox();
 await chart.locator('svg').click({position:{x:box.width*.3,y:box.height/2}});
 await expect(chart.locator('[data-vc-readout]')).not.toHaveText(/±14 cent/);
 await expect(chart.locator('.vc-cross')).toHaveClass(/\bon\b/);
 await page.locator('.vc-history summary').click();
 await expect(page.locator('.vc-history tbody tr')).toHaveCount(21);
 await page.screenshot({path:test.info().outputPath('voice-check-320.png'),fullPage:true});
 expect(page.__errors).toEqual([]);
});
