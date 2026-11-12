/* Isolated, synthetic browser smoke tests. No production login, audio files, or Supabase calls. */
const {test, expect}=require('@playwright/test');
const path=require('node:path');
const scripts=[
 'app/weak-phrase.js','app/segment-ab-model.js','app/segment-ab-ui.js',
 'app/plan-outcome-model.js','app/plan-outcome-ui.js',
 'app/overall-growth-model.js','app/overall-growth-ui.js',
 'app/monthly-practice-plans.js','app/monthly-growth.js'
];
async function boot(page,{recordings=[],plans=[],goals=[],reports=[],practices=[],view='monthly'}={}){
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
   sheet:args=>{window.__lastSheet=args;return {close:()=>{}};},
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
   return {mode:evidence.mode,month:evidence.month,note:'요약: 기록을 확인했어요.'};
  };
 },{recordings,plans,goals,reports,practices});
 for(const f of scripts)await page.addScriptTag({path:path.resolve(__dirname,'..',f)});
 await page.evaluate(()=>{
  const def=window.VZ.routes['vocal-growth'];
  const el=document.getElementById('test-root');
  el.innerHTML=def.render();
  def.mount(el);
 });
 await expect(page.locator('[data-growth-mode="overall"]')).toBeVisible();
 if(view==='monthly'){
  await page.locator('[data-growth-mode="monthly"]').click();
  await expect(page.locator('[data-growth-select]')).toBeVisible();
 }else{
  await expect(page.locator('.growth-hero')).toBeVisible();
 }
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

test('song growth listening evidence excludes training-only and unassigned sessions',async({page})=>{
 const practices=[
  {id:'practice-room:song',date:'2026-11-05',songId:'song-1',practiceMode:'song',
   practiceRoom:{songId:'song-1',aiCoach:'들리는 특징: 지정 곡의 짧은 소리 관찰'}},
  {id:'practice-room:training',date:'2026-11-05',practiceMode:'training',
   practiceRoom:{songId:'',aiCoach:'들리는 특징: 훈련 전용 코멘트'}},
  {id:'practice-room:unassigned',date:'2026-11-05',practiceMode:'song',
   practiceRoom:{songId:'',aiCoach:'들리는 특징: 미지정 과제 코멘트'}}
 ];
 await boot(page,{practices});
 await expect(page.locator('.growth-listening')).toHaveCount(1);
 await expect(page.locator('.growth-listening')).toContainText('지정 곡의 짧은 소리');
 await expect(page.locator('.growth-page')).not.toContainText('훈련 전용 코멘트');
 await page.evaluate(()=>{window.vzipCloudCoach=async evidence=>{
   window.__coachEvidence=evidence;
   return {mode:'monthly',month:evidence.month,note:'요약: 곡의 기록 확인'};
 };});
 await page.locator('[data-monthly-ai-run]').click();
 await expect.poll(()=>page.evaluate(()=>window.__coachEvidence?.observations?.length)).toBe(1);
 const evidence=await page.evaluate(()=>window.__coachEvidence);
 expect(evidence.observations[0].song).toBe('Test Song');
 expect(evidence.observations[0].heard).not.toContain('훈련 전용');
});

test('all-time dashboard combines lifetime counts, consistent same-song metrics, monthly chart and opt-in overall AI',async({page})=>{
 const media=[
  {id:'first',songId:'song-1',recordedDate:'2026-09-01',type:'audio/wav',
   analysis:{v:1,metrics:{voicedSeconds:22,intonation:{meanAbsCents:35},stability:{wobbleCents:20},breath:{medianPhrase:3},vibrato:{regularity:.5}}}},
  {id:'latest',songId:'song-1',recordedDate:'2026-11-05',type:'audio/wav',
   analysis:{v:1,metrics:{voicedSeconds:23,intonation:{meanAbsCents:17},stability:{wobbleCents:14},breath:{medianPhrase:4},vibrato:{regularity:.65}}}}
 ];
 await boot(page,{recordings:media,view:'overall'});
 await expect(page.locator('.growth-hero')).toContainText('2');
 await expect(page.locator('.growth-stat')).toHaveCount(4);
 await expect(page.locator('.growth-stat').first()).toContainText('개선 방향');
 expect(await page.evaluate(()=>window.__coachCalls)).toBe(0);
 await page.locator('[data-overall-metric="phrase"]').click();
 await expect(page.locator('[data-overall-metric="phrase"]')).toHaveAttribute('aria-pressed','true');
 await page.locator('[data-overall-month]').first().click();
 const popup=await page.evaluate(()=>window.__lastSheet);
 expect(popup.title).toContain('측정 기록');
 await page.locator('[data-overall-ai-run]').click();
 await expect.poll(()=>page.evaluate(()=>VZ.db.overallAiReports.length)).toBe(1);
 expect(await page.evaluate(()=>window.__coachCalls)).toBe(1);
 await page.locator('[data-growth-mode="monthly"]').click();
 await expect(page.locator('[data-growth-select]')).toBeVisible();
 await page.locator('[data-growth-mode="overall"]').click();
 await expect(page.locator('.growth-ai-note')).toContainText('기록을 확인했어요');
});
test('all-time with no analyzed recording explains missing measurements instead of displaying invented improvement',async({page})=>{
 await boot(page,{recordings:[],view:'overall'});
 // One compact note replaces four identical "측정 없음" cards; still no number, no improvement claim.
 await expect(page.locator('.growth-stat')).toHaveCount(0);
 await expect(page.locator('.growth-stats-empty')).toContainText('아직 측정된 곡 녹음이 없어요');
 await expect(page.locator('.growth-hero')).toContainText('비교 기록 필요');
 await expect(page.locator('[data-overall-ai-run]')).toBeVisible();
 expect(await page.evaluate(()=>window.__coachCalls)).toBe(0);
});

test('saved overall AI becomes four readable, escaped cards and quick jumps retain the growth route',async({page})=>{
 await boot(page,{view:'overall'});
 await page.evaluate(()=>{
  VZ.db.overallAiReports=[{id:'overall-ai:all',createdDate:'2026-11-11',
   note:'요약: 전반적인 녹음 기록을 정리했어요.\n좋아진 점: 음정 흔들림이 줄었어요.\n보완할 점: <script>alert(1)</script> 같은 곡 비교가 더 필요해요.\n다음 연습: 편한 음역으로 5분 반복해요.'}];
  const el=document.getElementById('test-root');
  el.innerHTML=VZ.routes['vocal-growth'].render();
  VZ.routes['vocal-growth'].mount(el);
 });
 await expect(page.locator('.growth-coach-part')).toHaveCount(4);
 await expect(page.locator('.growth-coach-part.growth-coach-better')).toContainText('음정 흔들림');
 await expect(page.locator('.growth-coach-part.growth-coach-action')).toContainText('5분');
 await expect(page.locator('.growth-ai-note script')).toHaveCount(0);
 await expect(page.locator('.growth-coach-part.growth-coach-focus')).toContainText('<script>');
 await expect(page.locator('.growth-jumps button')).toHaveCount(5);
 await page.locator('[data-growth-jump="coach"]').click();
 await expect(page.locator('[data-growth-anchor="coach"]')).toBeAttached();
 expect(new URL(page.url()).hash).toBe('');
});
test('monthly view groups measurements, AI, plans and optional supporting history',async({page})=>{
 const recorded=[{id:'take',songId:'song-1',recordedDate:'2026-11-05',
  analysis:{v:1,metrics:{voicedSeconds:20,intonation:{meanAbsCents:28}}}}];
 const practices=[{id:'saved-coach',date:'2026-11-05',songId:'song-1',practiceMode:'song',
  practiceRoom:{songId:'song-1',aiCoach:'들리는 특징: 안정된 발음'}}];
 await boot(page,{recordings:recorded,practices,view:'monthly'});
 await expect(page.locator('.growth-month-overview>div')).toHaveCount(3);
 await expect(page.locator('[data-month-section="results"] .growth-metric')).toHaveCount(4);
 await expect(page.locator('.growth-secondary')).toHaveCount(2);
 await expect(page.locator('.growth-secondary').first()).not.toHaveAttribute('open','');
 await page.locator('.growth-secondary').first().locator('summary').click();
 await expect(page.locator('.growth-secondary').first().locator('.growth-listening')).toBeVisible();
 await page.locator('[data-monthly-jump="history"]').click();
 await expect(page.locator('[data-month-section="history"]')).toHaveAttribute('open','');
 await expect(page.locator('[data-month-section="history"] .growth-month')).toHaveCount(1);
});
test('growth cards stay within a 375px viewport even with twelve month bars',async({page})=>{
 await page.setViewportSize({width:375,height:812});
 const media=Array.from({length:12},(_,i)=>{
  const date='2026-'+String(i+1).padStart(2,'0')+'-03';
  return {id:'record-'+i,songId:'song-1',recordedDate:date,
   analysis:{v:1,metrics:{voicedSeconds:20,intonation:{meanAbsCents:35-i},stability:{wobbleCents:19-i}}}};
 });
 await boot(page,{recordings:media,view:'overall'});
 await page.addStyleTag({path:path.resolve(__dirname,'../app/monthly-growth.css')});
 await expect(page.locator('.growth-chart-point')).toHaveCount(12);
 const widths=await page.evaluate(()=>{
  const host=document.querySelector('.growth-page');
  const chart=document.querySelector('.growth-chart');
  return {viewport:window.innerWidth,document:document.documentElement.scrollWidth,
   host:host.getBoundingClientRect().width,chart:chart.getBoundingClientRect().width};
 });
 expect(widths.document).toBeLessThanOrEqual(widths.viewport+1);
 expect(widths.chart).toBeLessThanOrEqual(widths.host+1);
});
