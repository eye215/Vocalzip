const test=require('node:test'),assert=require('node:assert/strict'),R=require('../app/precision-resonance.js');
const sr=16000;
function vowel(formants,hz=120){
 let x=Float64Array.from({length:sr},(_,i)=>Array.from({length:30},(_,h)=>Math.sin(2*Math.PI*hz*(h+1)*i/sr)/(h+1)).reduce((a,b)=>a+b,0));
 for(const f of formants){const radius=Math.exp(-Math.PI*80/sr),a=2*radius*Math.cos(2*Math.PI*f/sr),b=-(radius**2),y=new Float64Array(x.length);for(let i=0;i<x.length;i++)y[i]=x[i]+(i?a*y[i-1]:0)+(i>1?b*y[i-2]:0);x=y;}
 const peak=Math.max(...x);return Float32Array.from(x,v=>v/peak*.5);
}
const context={source:'clean',vowel:'a',task:'vowel',owner:'fake',environment:'mic-A',targetMidi:48,loudness:'normal'};
test('LPC resonances recover known synthetic vowel peaks within stated tolerance',()=>{
 const x=vowel([700,1200,2500]),r=R.estimate(x.subarray(4000,5280),sr,120,{context});
 assert.equal(r.confidence,'medium',JSON.stringify(r));for(let i=0;i<3;i++)assert.ok(Math.abs(r.values[i]-[700,1200,2500][i])<160,JSON.stringify(r));
});
test('different known vowels give different measured F1/F2 distributions',()=>{
 const a=R.estimate(vowel([700,1200,2500]).subarray(4000,5280),sr,120,{context});
 const i=R.estimate(vowel([300,2200,3000]).subarray(4000,5280),sr,120,{context:{...context,vowel:'i'}});
 assert.ok(a.values[0]-i.values[0]>200,JSON.stringify({a,i}));assert.ok(i.values[1]-a.values[1]>600);
});
test('high F0, mixed/separated voice, unknown vowel, silence, low sample rate and short windows are withheld',()=>{
 const x=vowel([700,1200,2500]).subarray(4000,5280);
 for(const [pcm,rate,f0,ctx] of [[x,sr,700,context],[x,sr,120,{...context,source:'mixed'}],[x,sr,120,{...context,source:'separated'}],[x,sr,120,{...context,vowel:''}],[new Float32Array(1280),sr,120,context],[x,8000,120,context],[x.subarray(0,100),sr,120,context]]){
  const r=R.estimate(pcm,rate,f0,{context:ctx});assert.equal(r.values,null);assert.equal(r.confidence,'withheld');assert.ok(r.reasons.length);
 }
});
test('pitch zones and vowel-conditioned frame rows retain null formants, never impute high notes',()=>{
 const x=vowel([700,1200,2500]),frames=Array.from({length:15},(_,i)=>({t:.1+i*.05,f0:i<8?120:700,trusted:true,centroid:1400+i*10,tilt:-8,alpha:-12}));
 const r=R.analyze(x,sr,frames,{context});assert.ok(r.rows.some(f=>f.formants.values));assert.ok(r.rows.some(f=>f.formants.values===null));assert.ok(r.zones.length>=1);
 assert.equal(r.f1f2.length,r.rows.filter(f=>f.formants.values).length);
});
test('same pitch/vowel/environment/version comparison is factual; different conditions withhold judgement',()=>{
 const a={version:R.VERSION,context,metrics:{f1:700,f2:1200,centroid:1300},pitchMidi:48,rmsDb:-20};
 const b={...a,metrics:{f1:680,f2:1250,centroid:1400}};
 const pair=R.compare(a,b);assert.equal(pair.state,'comparable');assert.equal(pair.deltas.f1,-20);assert.equal(pair.judgement,null);
 for(const patch of [{context:{...context,vowel:'i'}},{context:{...context,environment:'mic-B'}},{version:'old'},{pitchMidi:55},{rmsDb:-5}])assert.equal(R.compare(a,{...b,...patch}).state,'withheld');
});
