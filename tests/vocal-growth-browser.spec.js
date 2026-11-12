/* Isolated, synthetic browser smoke tests. No production login, audio files, or Supabase calls. */
const {test, expect}=require('@playwright/test');
const path=require('node:path');
const scripts=[
 'app/weak-phrase.js','app/segment-ab-model.js','app/segment-ab-ui.js',
 'app/plan-outcome-model.js','app/plan-outcome-ui.js',
 'app/growth-metrics-model.js','app/overall-growth-model.js','app/overall-growth-ui.js',
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
 // 성장 리포트 v2: six separated measures; v1 takes judge accuracy/stability only, v2-only measures are withheld.
 await expect(page.locator('.growth-stat')).toHaveCount(6);
 await expect(page.locator('.growth-stat').first()).toContainText('음정 정확도');
 await expect(page.locator('.growth-stat').first()).toContainText('좋아진 방향');
 await expect(page.locator('[data-growth-metric="phrase"]')).toContainText('판정 보류');
 await expect(page.locator('[data-growth-metric="range"]')).not.toContainText('좋아진 방향');
 await expect(page.locator('[data-growth-metric="passaggio"]')).toContainText('음정 데이터만으로 판별 불가, 선생님 판단 참고');
 expect(await page.evaluate(()=>window.__coachCalls)).toBe(0);
 await expect(page.locator('[data-overall-metric]')).toHaveCount(2); // monthly averages only for whole-recording values
 await page.locator('[data-overall-metric="stability"]').click();
 await expect(page.locator('[data-overall-metric="stability"]')).toHaveAttribute('aria-pressed','true');
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
 await expect(page.locator('[data-month-section="results"] .growth-metric')).toHaveCount(6);
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
test('growth report v2: same-phrase comparison, neutral range, passaggio reference and no overflow at 320px',async({page})=>{
 await page.setViewportSize({width:320,height:700});
 const rows=(into,longer=0)=>[[10,3+longer,64,into,8],[15,2.5+longer,67,into,8],[20,3.5+longer,69,into,8],[26,4+longer,72,into,8]];
 const bands=w=>[[60,4,.6,1,3,6],[62,4,.6,1,3,6],[64,5,.7,1.2,4,7],[65,3,.5,.8,2,19],[67,4,.6,1,3,6],[72,3,.8,1.2,3,w],[74,2,.8,1,2,w]];
 const a=(into,stable,w,longer)=>({v:2,metrics:{voicedSeconds:40,intonation:{meanAbsCents:into,notes:30},stability:{wobbleCents:8,notes:10},
  range:{stableHigh:{note:stable===7700?'F5':'A5',cents:stable},main:{low:'C4',high:'D5',lowCents:6000,highCents:7400},instantaneous:{note:'C7',cents:9600}},
  breath:{medianPhrase:3},phrases:{v:1,rows:rows(into,longer)},pitchBands:{v:1,rows:bands(w)}},confidence:{pitchConfidence:.95}});
 const media=[{id:'x1',songId:'song-1',recordedDate:'2026-09-02',analysis:a(22,7700,14,0)},{id:'x2',songId:'song-1',recordedDate:'2026-11-03',analysis:a(10,8100,9,.6)}];
 await boot(page,{recordings:media,view:'overall'});
 await page.addStyleTag({path:path.resolve(__dirname,'../app/monthly-growth.css')});
 await page.addStyleTag({path:path.resolve(__dirname,'../app/growth-polish.css')});
 await expect(page.locator('[data-growth-metric]')).toHaveCount(6);
 await expect(page.locator('[data-growth-metric="intonation"] .growth-state').first()).toHaveText('좋아진 방향');
 await page.locator('[data-growth-metric="intonation"] summary').click();
 await expect(page.locator('[data-growth-metric="intonation"]')).toContainText('같은 프레이즈 4개 비교');
 await expect(page.locator('[data-growth-metric="phrase"] .growth-state').first()).toHaveText('좋아진 방향');
 await expect(page.locator('[data-growth-metric="range"] .growth-state').first()).toHaveText('변화 관찰');
 await expect(page.locator('[data-growth-metric="range"]')).not.toContainText('C7');
 await expect(page.locator('[data-growth-metric="passaggio"]')).toContainText('음정 데이터만으로 판별 불가, 선생님 판단 참고');
 const widths=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,
  over:[...document.querySelectorAll('[data-growth-metric] *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).length}));
 expect(widths.document).toBeLessThanOrEqual(widths.viewport+1);
 expect(widths.over).toBe(0);
 await page.locator('[data-overall-ai-run]').click();
 await expect.poll(()=>page.evaluate(()=>VZ.db.overallAiReports.length)).toBe(1);
});
test('plan outcome v2: same-phrase preview, 판정 보류 with the growth reason, legacy saved report still renders, 320px',async({page})=>{
 await page.setViewportSize({width:320,height:700});
 const rows=into=>[[10,3,64,into,8],[15,2.5,67,into,8],[20,3.5,69,into,8],[26,4,72,into,8]];
 const a=(into,v=2)=>v===2?{v:2,metrics:{voicedSeconds:40,intonation:{meanAbsCents:into+15,notes:30},stability:{wobbleCents:8,notes:10},
  range:{stableHigh:{note:'F5',cents:7700},main:{low:'C4',high:'D5',lowCents:6000,highCents:7400},instantaneous:{note:'C7',cents:9600}},
  breath:{medianPhrase:3},phrases:{v:1,rows:rows(into)},pitchBands:{v:1,rows:[[60,4,.6,1,3,6],[72,3,.8,1.2,3,9]]}}}
  :{v:1,metrics:{voicedSeconds:40,intonation:{meanAbsCents:into,notes:30},breath:{medianPhrase:3}}};
 const plans=[
  {id:'pv2',kind:'monthly-vocal',songId:'song-1',metric:'intonation',startDate:'2026-11-01',sourceMonth:'2026-11',segmentStart:0,segmentEnd:20,minutes:10,days:5,created:3},
  {id:'phold',kind:'monthly-vocal',songId:'song-2',metric:'phrase',startDate:'2026-11-01',sourceMonth:'2026-11',segmentStart:0,segmentEnd:20,minutes:10,days:5,created:2},
  {id:'plegacy',kind:'monthly-vocal',songId:'song-1',metric:'stability',startDate:'2026-10-01',sourceMonth:'2026-10',segmentStart:0,segmentEnd:20,minutes:10,days:5,created:1}];
 const media=[{id:'s1a',songId:'song-1',recordedDate:'2026-10-28',type:'audio/wav',analysis:a(20)},
  {id:'s1b',songId:'song-1',recordedDate:'2026-11-03',type:'audio/wav',analysis:a(11)},
  {id:'s2a',songId:'song-2',recordedDate:'2026-10-28',type:'audio/wav',analysis:a(20,1)},
  {id:'s2b',songId:'song-2',recordedDate:'2026-11-03',type:'audio/wav',analysis:a(11,1)}];
 // Saved before rules:2 (old app version): must still render with its own numbers.
 const legacy={id:'plan-outcome:plegacy',planId:'plegacy',songId:'song-1',metric:'stability',startDate:'2026-10-01',endDate:'2026-10-05',
  completedDays:3,scheduledDays:5,completionRate:60,recommendation:'maintain',scope:'whole-recording',createdDate:'2026-10-06',
  measurement:{before:27,after:19,delta:-8,change:'better',mixedVersions:false,beforeCount:2,afterCount:1,beforeIds:['x'],afterIds:['y']}};
 await page.goto('about:blank');
 await boot(page,{recordings:media,plans,reports:[legacy]});
 await page.evaluate(()=>{VZ.db.songs.push({id:'song-2',title:'Second'});});
 await page.evaluate(()=>{const el=document.getElementById('test-root');el.innerHTML=VZ.routes['vocal-growth'].render();VZ.routes['vocal-growth'].mount(el);});
 await page.locator('[data-growth-mode="monthly"]').click();
 await page.addStyleTag({path:path.resolve(__dirname,'../app/monthly-growth.css')});
 await page.addStyleTag({path:path.resolve(__dirname,'../app/growth-polish.css')});
 const items=page.locator('.growth-plan-item');
 const v2card=items.filter({has:page.locator('[data-plan-outcome="pv2"]')});
 await expect(v2card).toContainText('음정 정확도');
 await expect(v2card.locator('.growth-plan-measure')).toContainText('좋아진 방향');
 await expect(v2card.locator('.growth-plan-measure')).toContainText('±20 cent → ±11 cent');
 await expect(v2card.locator('.growth-plan-measure')).toContainText('같은 프레이즈 4개 비교');
 const hold=items.filter({has:page.locator('[data-plan-outcome="phold"]')});
 await expect(hold).toContainText('호흡 유지');
 await expect(hold.locator('.growth-plan-measure .growth-state')).toHaveText('판정 보류');
 await expect(hold.locator('.growth-plan-measure')).toContainText('이전 분석(v1) 결과라 이 지표는 계산하지 않아요');
 // Save the v2 outcome: same wording, recommendation, saved fields.
 await v2card.locator('[data-save-outcome]').click();
 await expect(v2card.locator('.growth-outcome-report')).toContainText('좋아진 방향');
 await expect(v2card.locator('.growth-outcome-report')).toContainText('같은 프레이즈 4개 비교');
 await hold.locator('[data-save-outcome]').click();
 await expect(hold.locator('.growth-outcome-report')).toContainText('같은 곡을 계획 시작 전후로 더 녹음한 뒤');
 const saved=await page.evaluate(()=>VZ.db.vocalPlanReports.map(r=>[r.planId,r.rules,r.measurement.state,r.measurement.reason,r.recommendation]));
 expect(saved).toEqual([['plegacy',undefined,undefined,undefined,'maintain'],['pv2',2,'better','','maintain'],['phold',2,'hold','v1','collect']]);
 // Legacy report (saved by an older app version).
 const old=page.locator('[data-plan-outcome="plegacy"] .growth-outcome-report');
 await expect(old).toContainText('3/5일');
 await expect(old).toContainText('27 cent');
 await expect(old).toContainText('19 cent');
 await expect(old).toContainText('이전 기준');
 await expect(old).toContainText('음정 안정성');
 const over=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,vw:innerWidth,
  n:[...document.querySelectorAll('.growth-plan-item *')].filter(e=>e.getClientRects().length&&e.getBoundingClientRect().right>innerWidth+1).length}));
 expect(over.doc).toBeLessThanOrEqual(over.vw+1);
 expect(over.n).toBe(0);
});
