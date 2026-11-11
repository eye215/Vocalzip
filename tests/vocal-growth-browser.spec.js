/* Isolated, synthetic browser smoke tests. No production login, audio files, or Supabase calls. */
const {test, expect}=require('@playwright/test');
const path=require('node:path');
const scripts=[
 'app/weak-phrase.js','app/segment-ab-model.js','app/segment-ab-ui.js',
 'app/plan-outcome-model.js','app/plan-outcome-ui.js',
 'app/monthly-practice-plans.js','app/monthly-growth.js'
];
async function boot(page,{recordings=[],plans=[],goals=[],reports=[],practices=[]}={}){
 await page.goto('about:blank');
 await page.setContent('<main id="test-root"></main>');
 await page.evaluate(({recordings,plans,goals,reports,practices})=>{
  window.__mockRecordings=recordings;
  window.__coachCalls=0;
  window.__notifications=[];
  window.VzipAccountScope={beforeLeave:()=>()=>{}};
  window.VZ={
   db:{songs:[{id:'song-1',title:'Test Song'}],practices,
    practicePlans:plans,dailyGoals:goals,vocalPlanReports:reports,
    monthlyGrowthReports:[],monthlyAiReports:[],lessons:[],assignments:[]},
   esc:x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
   today:()=> '2026-11-11',uid:()=> 'ui-'+Math.random().toString(36).slice(2),
   song:id=>window.VZ.db.songs.find(s=>s.id===id),
   songTitle:id=>window.VZ.song(id)?.title||'',
   change(fn){fn(this.db);window.__notifications.push('saved');return true;},
   toast:msg=>window.__notifications.push(msg),
   confirm:async()=>true,
   analysisReliable:a=>a?.metrics?.voicedSeconds>=10,
   route(name,definition){(this.routes ||= {})[name]=definition;},
   media:{
    list:async()=>window.__mockRecordings,
    cached:()=>window.__mockRecordings,
    owner:()=>({kind:'practice'}),
    dateOf:m=>m.recordedDate||'',
    label:m=>m.name||'Unnamed',
    isVideo:m=>m.type?.startsWith('video/')||false,
    src:async()=>({url:'data:audio/wav;base64,UklGRgQAAABXQVZF',revoke:false})
   },
   analyzeRecording:async m=>({
    summary:{v:1,metrics:{voicedSeconds:25},confidence:{voiceOverMrDb:7}},
    seconds:40,
    notes:[{t:5,dur:1,dev:m.id==='a'?40:15},{t:8,dur:1,dev:m.id==='a'?30:12}],
    curve:[]
   }),
  };
  window.vzipCloudSignedIn=()=>true;
  window.vzipCloudUserId=()=> 'mock-user-1';
  window.vzipCloudSessionId=()=> 'mock-session-1';
  window.vzipCloudCoach=async evidence=>{
   window.__coachCalls++;
   return {mode:'monthly',month:evidence.month,note:'요약: 기록을 확인했어요.'};
  };
 },{recordings,plans,goals,reports,practices});
 for(const f of scripts)await page.addScriptTag({path:path.resolve(__dirname,'..',f)});
 await page.evaluate(()=>{
  const def=window.VZ.routes['vocal-growth'];
  const el=document.getElementById('test-root');
  el.innerHTML=def.render();
  def.mount(el);
 });
 await expect(page.locator('[data-growth-select]')).toBeVisible();
}
test('empty library still shows current month and permits a song plan without a recording',async({page})=>{
 await boot(page);
 await expect(page.locator('[data-growth-select]')).toHaveValue('2026-11');
 await page.locator('details.growth-plan-expand').last().locator('summary').click();
 await page.locator('[data-plan-form] [name=song]').selectOption('song-1');
 await page.locator('[data-plan-form] [name=metric]').selectOption('stability');
 await page.locator('[data-plan-form] [name=days]').fill('5');
 await page.locator('[data-plan-form] button[type=submit]').click();
 await expect(page.locator('.growth-plan-item')).toHaveCount(1);
 const state=await page.evaluate(()=>({plans:VZ.db.practicePlans.length,goals:VZ.db.dailyGoals.length}));
 expect(state).toEqual({plans:1,goals:5});
});
test('archive keeps the plan visible and completion progress is based on planned days',async({page})=>{
 const plan={id:'p1',kind:'monthly-vocal',songId:'song-1',metric:'intonation',
  startDate:'2026-11-01',sourceMonth:'2026-11',segmentStart:5,segmentEnd:15,
  minutes:5,days:5,archived:false};
 const goal={id:'p1:2026-11-01',sourceId:'p1',date:'2026-11-01',completed:true};
 await boot(page,{plans:[plan],goals:[goal]});
 await expect(page.locator('.growth-plan-item').first()).toContainText('1/5');
 await page.locator('[data-archive-plan]').click();
 await expect(page.locator('details.growth-plan-expand').first().locator('summary')).toContainText('보관 리포트');
 await page.locator('details.growth-plan-expand').first().locator('summary').click();
 await expect(page.locator('details.growth-plan-expand').first().locator('.growth-plan-item')).toContainText('1/5');
 expect(await page.evaluate(()=>VZ.db.practicePlans[0].archived)).toBe(true);
});
test('on-demand A/B compares two synthetic takes without uploading or altering recordings',async({page})=>{
 const plan={id:'p2',kind:'monthly-vocal',songId:'song-1',metric:'intonation',
  startDate:'2026-11-01',sourceMonth:'2026-11',segmentStart:0,segmentEnd:15,
  minutes:5,days:5};
 const media=[
  {id:'a',songId:'song-1',recordedDate:'2026-10-30',type:'audio/wav',
   analysis:{v:1,metrics:{voicedSeconds:20,intonation:{meanAbsCents:35}}}},
  {id:'b',songId:'song-1',recordedDate:'2026-11-04',type:'audio/wav',
   analysis:{v:1,metrics:{voicedSeconds:20,intonation:{meanAbsCents:13}}}}
 ];
 await boot(page,{recordings:media,plans:[plan]});
 await page.locator('[data-ab-plan]').first().click();
 await page.locator('[data-ab-record="0"]').selectOption('a');
 await page.locator('[data-ab-record="1"]').selectOption('b');
 await page.locator('[data-ab-run]').click();
 await expect(page.locator('[data-ab-result]')).toContainText('35 cent');
 await expect(page.locator('[data-ab-result]')).toContainText('13.5 cent');
 expect(await page.evaluate(()=>VZ.db.practicePlans.length)).toBe(1);
});
test('monthly AI is explicit opt-in and month switching never replaces a different month',async({page})=>{
 const m={id:'a',songId:'song-1',recordedDate:'2026-11-04',type:'audio/wav',
  analysis:{v:1,metrics:{voicedSeconds:20,intonation:{meanAbsCents:25}},confidence:{voiceOverMrDb:8}}};
 const old={id:'c',songId:'song-1',recordedDate:'2026-10-04',type:'audio/wav',
  analysis:{v:1,metrics:{voicedSeconds:20,intonation:{meanAbsCents:35}},confidence:{voiceOverMrDb:8}}};
 await boot(page,{recordings:[m,old]});
 expect(await page.evaluate(()=>window.__coachCalls)).toBe(0);
 await page.evaluate(()=>{window.vzipCloudCoach=async data=>{window.__coachCalls++;return new Promise(resolve=>window.__releaseCoach=()=>resolve({mode:'monthly',month:data.month,note:'요약: 11월 확인'}));};});
 await page.locator('[data-monthly-ai-run]').click();
 await page.locator('[data-growth-select]').selectOption('2026-10');
 await page.evaluate(()=>window.__releaseCoach());
 await expect.poll(()=>page.evaluate(()=>VZ.db.monthlyAiReports.length)).toBe(1);
 await expect(page.locator('[data-growth-select]')).toHaveValue('2026-10');
 await expect(page.locator('[data-monthly-ai]')).not.toContainText('11월 확인');
 expect(await page.evaluate(()=>window.__coachCalls)).toBe(1);
});

test('completed plan saves an outcome and follow-up only prefills the next plan',async({page})=>{
 const plan={id:'plan-outcome-demo',kind:'monthly-vocal',songId:'song-1',metric:'intonation',
  startDate:'2026-11-01',sourceMonth:'2026-11',segmentStart:5,segmentEnd:15,minutes:10,days:5};
 const media=[
  {id:'before',songId:'song-1',recordedDate:'2026-10-29',type:'audio/wav',
   analysis:{v:1,metrics:{voicedSeconds:22,intonation:{meanAbsCents:36}},confidence:{voiceOverMrDb:6}}},
  {id:'after',songId:'song-1',recordedDate:'2026-11-04',type:'audio/wav',
   analysis:{v:1,metrics:{voicedSeconds:22,intonation:{meanAbsCents:21}},confidence:{voiceOverMrDb:6}}}
 ];
 const goals=[{id:'goal-1',sourceId:plan.id,date:'2026-11-01',completed:true}];
 await boot(page,{plans:[plan],recordings:media,goals});
 await page.locator('[data-save-outcome]').first().click();
 await expect(page.locator('.growth-outcome-report').first()).toContainText('1/5일');
 await expect(page.locator('.growth-outcome-report').first()).toContainText('36 cent');
 await expect(page.locator('.growth-outcome-report').first()).toContainText('21 cent');
 await page.locator('[data-next-outcome]').first().click();
 const next=page.locator('[data-plan-form]');
 await expect(next.locator('[name=song]')).toHaveValue('song-1');
 await expect(next.locator('[name=metric]')).toHaveValue('intonation');
 await expect(next.locator('[name=start]')).toHaveValue('5');
 const counts=await page.evaluate(()=>({plans:VZ.db.practicePlans.length,reports:VZ.db.vocalPlanReports.length}));
 expect(counts).toEqual({plans:1,reports:1});
});

test('browser model excludes later and unrelated takes, and the snapshot equals the saved outcome',async({page})=>{
 await boot(page);
 const state=await page.evaluate(()=>{
  const plan={id:'p3',kind:'monthly-vocal',songId:'song-1',metric:'intonation',
    startDate:'2026-11-01',days:5};
  const data=[
    {id:'old',songId:'song-1',date:'2026-10-29',analysis:{metrics:{intonation:{meanAbsCents:35}}}},
    {id:'during',songId:'song-1',date:'2026-11-04',analysis:{metrics:{intonation:{meanAbsCents:25}}}},
    {id:'late',songId:'song-1',date:'2026-11-09',analysis:{metrics:{intonation:{meanAbsCents:1}}}},
    {id:'wrong',songId:'other',date:'2026-11-04',analysis:{metrics:{intonation:{meanAbsCents:1}}}}
  ];
  const dateOf=x=>x.date,valid=()=>true;
  const measured=window.VzipPlanOutcome.measurement(plan,data,dateOf,valid);
  const saved=window.VzipPlanOutcome.report({plan,recordings:data,dateOf,valid,asOf:'2026-11-11'});
  return {measured,saved};
 });
 expect(state.measured.before).toBe(35);
 expect(state.measured.after).toBe(25);
 expect(state.measured.afterIds).toEqual(['during']);
 expect(state.saved.measurement).toEqual(state.measured);
});
