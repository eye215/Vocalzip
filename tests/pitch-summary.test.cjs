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
