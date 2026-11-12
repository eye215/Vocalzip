const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const root=require('node:path').join(__dirname,'..');
const file=p=>fs.readFileSync(require('node:path').join(root,p),'utf8');
test('new vocal growth route does not replace existing statistics growth',()=>{
 const old=file('app/views-more.js'),added=file('app/monthly-growth.js'),html=file('index.html');
 assert.match(old,/VZ\.route\('growth'/);
 assert.match(added,/V\.route\('vocal-growth'/);
 assert.doesNotMatch(added,/V\.route\('growth'/);
 assert.match(html,/href="#\/vocal-growth" data-nav="growth"/);
});
test('dependencies load in correct order',()=>{
 const html=file('index.html');
 const files=['app/analysis.js','app/growth-metrics-model.js','app/weak-phrase.js','app/segment-ab-model.js',
  'app/segment-ab-ui.js','app/plan-outcome-model.js','app/plan-outcome-ui.js',
  'app/monthly-practice-plans.js','app/monthly-growth.js'];
 const indexes=files.map(p=>html.indexOf('src="'+p+'?'));
 assert.ok(indexes.every(i=>i>=0),'all dependencies must be loaded');
 assert.deepEqual(indexes,indexes.slice().sort((a,b)=>a-b));
});
test('all synced report arrays exist in core and conflict merge',()=>{
 for(const name of ['monthlyGrowthReports','monthlyAiReports','overallAiReports','vocalPlanReports']){
  assert.ok(file('app/core.js').includes("'"+name+"'"),name+' missing in core');
  assert.ok(file('data-merge.js').includes("'"+name+"'"),name+' missing in merge');
 }
});
test('song reports exclude unlabeled training and exercise takes',()=>{
 const js=file('app/monthly-growth.js');
 assert.match(js,/if\(!m\.songId\|\|!V\.song\(m\.songId\)\)return false/);
 assert.match(js,/!practice\?\.practiceRoom/);
 assert.match(js,/practice\?\.practiceMode!=='training'/);
 assert.match(js,/songItems=items\.filter\(isSongTake\)/);
 assert.match(js,/selected,songItems,rows/);
});
test('AI reports remain explicit opt-in with no direct audio upload',()=>{
 const js=file('app/monthly-growth.js');
 assert.match(js,/data-monthly-ai-run/);
 assert.match(js,/window\.vzipCloudCoach\(evidence\)/);
 assert.match(js,/mode:'monthly'/);
 const worker=file('supabase/functions/vzip-nvidia-coach/index.ts');
 assert.match(worker,/input\.mode === 'monthly'/);
 assert.ok(worker.indexOf("input.mode === 'monthly'") < worker.indexOf('const audio = input.audio'));
});

test('mobile segment playback is cleaned on month changes and only audio is analyzed',()=>{
 const plan=file('app/monthly-practice-plans.js'),ab=file('app/segment-ab-ui.js');
 assert.match(plan,/function render\(host,month,items,rows\)\{[\s\S]*?stopReview\(\)/);
 assert.match(plan,/items\.find\(m=>m\.id===sourceId\)/);
 assert.match(plan,/songInput\.value&&!M\.isVideo\(m\)/);
 assert.match(ab,/songId===plan\.songId&&!M\.isVideo\(x\)/);
 assert.match(ab,/V\.analyzeRecording\(a\.m,\{save:false\}\)/);
 assert.match(ab,/V\.analyzeRecording\(b\.m,\{save:false\}\)/);
});

test('current month stays available without recordings, and AI completion respects month switches',()=>{
 const js=file('app/monthly-growth.js');
 assert.match(js,/ym\(V\.today\(\)\),\.\.\.months\.keys\(\)/);
 assert.match(js,/\.\.\.\(V\.db\.practicePlans\|\|\[\]\)/);
 assert.match(js,/visibleSerial===renderSerial&&selected===month/);
 assert.match(js,/my!==request\|\|!window\.vzipCloudSignedIn/);
 assert.doesNotMatch(js,/btn\.onclick=\(\)=>\{selected=month;render\(\)/);
});

test('song plans are available before recording and archived plans remain discoverable',()=>{
 const code=file('app/monthly-practice-plans.js');
 assert.match(code,/\.\.\.\(V\.db\.songs\|\|\[\]\)\.map\(x=>x\.id\)/);
 assert.match(code,/filter\(x=>x\?\.kind==='monthly-vocal'&&x\.archived\)/);
 assert.doesNotMatch(code,/x\.archived&&savedOutcomeIds\.has/);
 assert.match(code,/plan\.archived\?'':'<button/);
});
test('archiving cannot reduce planned-day completion denominator or duplicate completed days',()=>{
 const code=file('app/monthly-practice-plans.js');
 assert.match(code,/new Set\(goals\.filter\(g=>g\.completed===true\)\.map\(g=>g\.date\)\)\.size/);
 assert.match(code,/total:Number\.isInteger\(plan\.days\)&&plan\.days>0\?plan\.days:goals\.length/);
});

test('song-only AI evidence shares the same explicit exclusion for training sessions',()=>{
 const js=file('app/monthly-growth.js');
 assert.match(js,/function songListeningEntry\(p,month\)/);
 assert.match(js,/p\.practiceMode!=='training'/);
 assert.match(js,/!!V\.song\(songId\)/);
 assert.match(js,/const entries=\(V\.db\.practices\|\|\[\]\)\.filter\(p=>songListeningEntry\(p,month\)\)/);
 assert.match(js,/const observations=\(V\.db\.practices\|\|\[\]\)\.filter\(p=>songListeningEntry\(p,month\)\)/);
});

test('overall and monthly growth share a single route and preserve month controls',()=>{
 const html=file('index.html'),js=file('app/monthly-growth.js');
 assert.match(html,/app\/overall-growth-model\.js/);
 assert.match(html,/app\/overall-growth-ui\.js/);
 assert.match(html,/design-system\/shared-nav\.css/);
 assert.match(js,/data-growth-mode="overall"/);
 assert.match(js,/data-growth-mode="monthly"/);
 assert.match(js,/data-growth-select/);
 assert.match(js,/window\.VzipOverallGrowth\?\.calculate/);
 assert.match(js,/V\.monthlyPracticePlans/);
});
test('overall AI is explicit, durable and does not upload audio',()=>{
 const overall=file('app/overall-growth-ui.js'),api=file('supabase/functions/vzip-nvidia-coach/index.ts');
 assert.match(overall,/data-overall-ai-run/);
 assert.match(overall,/window\.vzipCloudCoach\(input\)/);
 assert.match(overall,/db\.overallAiReports/);
 assert.match(overall,/mode:'overall'/);
 assert.match(api,/input\.mode === 'overall'/);
 assert.ok(api.indexOf("input.mode === 'overall'")<api.indexOf('const audio = input.audio'));
 assert.match(api,/overall\?'overall':'monthly'/);
});
