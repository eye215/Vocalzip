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
 const files=['app/analysis.js','app/weak-phrase.js','app/segment-ab-model.js',
  'app/segment-ab-ui.js','app/plan-outcome-model.js','app/plan-outcome-ui.js',
  'app/monthly-practice-plans.js','app/monthly-growth.js'];
 const indexes=files.map(p=>html.indexOf('src="'+p+'?'));
 assert.ok(indexes.every(i=>i>=0),'all dependencies must be loaded');
 assert.deepEqual(indexes,indexes.slice().sort((a,b)=>a-b));
});
test('all synced report arrays exist in core and conflict merge',()=>{
 for(const name of ['monthlyGrowthReports','monthlyAiReports','vocalPlanReports']){
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
