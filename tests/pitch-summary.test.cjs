const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function api(){
 const VZ={media:{},route:()=>{}};const window={VZ};
 vm.runInNewContext(fs.readFileSync(require.resolve('../app/analysis.js'),'utf8'),{window});
 return VZ;
}
test('reanalysis retains each prior summary without nested duplication or mutation',()=>{
 const V=api(),previous={v:1,at:1,metrics:{range:{high:'A#5'}}},copy=JSON.stringify(previous);
 const result={version:2,seconds:12,metrics:{range:{high:'C5'}},confidence:{pitchConfidence:.95}};
 const next=V.analysisSummary(result,previous),again=V.analysisSummary(result,next);
 assert.equal(JSON.stringify(previous),copy);assert.equal(next.history.length,1);assert.equal(again.history.length,2);
 assert.equal(again.history[0].metrics.range.high,'A#5');assert.equal(again.history[1].history,undefined);
});
test('v2 unknown or low pitch confidence cannot be used for growth; mixed versions are held',()=>{
 const V=api(),a={v:2,metrics:{voicedSeconds:20},confidence:{pitchConfidence:.95}};
 assert.equal(V.analysisReliable(a),true);
 assert.equal(V.analysisReliable({...a,confidence:{}}),false);
 assert.equal(V.analysisReliable({...a,confidence:{pitchConfidence:.6}}),false);
 assert.equal(V.analysisComparable(a,{...a,v:1}),false);
 assert.equal(V.analysisComparable(a,a),true);
});

test('history keeps only the last five earlier summaries, and the scope is recorded',()=>{
 const V=api();let summary=null;
 for(let i=0;i<8;i++)summary=V.analysisSummary({version:2,seconds:10+i,metrics:{},confidence:{}},summary);
 assert.equal(summary.history.length,5);
 assert.equal(JSON.stringify(summary.history.map(h=>h.seconds)),'[12,13,14,15,16]');
 assert.equal(summary.scope.kind,'whole-recording');
});
test('v1 and v2 results both stay usable for plans and monthly growth; a before/after across versions is withheld',()=>{
 // The one reliability rule lives in app/growth-dataset.js (v1 and v2 are both read); the three screens ask it
 // instead of carrying their own version test.
 const D=require('../app/growth-dataset.js'),trusted=()=>true;
 assert.deepEqual(D.VERSIONS,[1,2]);
 assert.equal(D.reliable({v:1,metrics:{}},trusted),true);assert.equal(D.reliable({v:2,metrics:{}},trusted),true);
 assert.equal(D.reliable({v:3,metrics:{}},trusted),false);assert.equal(D.reliable({v:2,metrics:{}},()=>false),false);
 for(const file of ['monthly-practice-plans.js','plan-outcome-ui.js','monthly-growth.js']){
  const js=fs.readFileSync(require.resolve('../app/'+file),'utf8');
  assert.doesNotMatch(js,/analysis\?\.v===1/,file);assert.doesNotMatch(js,/\.includes\(\w+\.analysis\?\.v\)/,file);
  assert.match(js,/V\.growthDataset\.ok/,file);
 }
 const {measurement}=require('../app/plan-outcome-model.js');
 const plan={id:'p',kind:'monthly-vocal',metric:'stability',songId:'s',startDate:'2026-11-01',days:5};
 const take=(id,date,v,w)=>({id,date,songId:'s',analysis:{v,metrics:{stability:{wobbleCents:w}}}});
 const same=measurement(plan,[take('a','2026-10-30',2,20),take('b','2026-11-02',2,10)],m=>m.date,()=>true);
 assert.equal(same.change,'better');assert.equal(same.mixedVersions,false);
 const mixed=measurement(plan,[take('a','2026-10-30',1,20),take('b','2026-11-02',2,10)],m=>m.date,()=>true);
 assert.equal(mixed.change,'insufficient');assert.equal(mixed.mixedVersions,true);
});
test('callers survive an older cached analysis.js without analysisComparable',()=>{
 for(const file of ['vocal-lab.js','song-vocal-growth.js']){
  const js=fs.readFileSync(require.resolve('../app/'+file),'utf8');
  // Every direct call is guarded by a presence check in the same expression.
  assert.equal((js.match(/analysisComparable\(/g)||[]).length,(js.match(/analysisComparable \? V(Z)?\.analysisComparable\(/g)||[]).length,file);
 }
});
