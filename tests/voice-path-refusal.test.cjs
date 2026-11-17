const {test}=require('node:test'),assert=require('node:assert/strict'),P=require('../app/voice-path-model.js');
test('a weak pitch reading reports its actual confidence rather than inventing an accompaniment level',()=>{
 const r={voicedSeconds:200,confidence:{meanStrength:.774,glitchShare:.043,jumpsPerMin:209.4}};
 const text=P.refusedText(r,'weak-pitch');
 assert.match(text,/77\.4%/);assert.match(text,/88%/);assert.doesNotMatch(text,/목소리만큼|반주가.*크/);
});
test('refusals distinguish unstable pitch, frequent jumps, band mismatch and missing voice',()=>{
 const r={confidence:{glitchShare:.043,jumpsPerMin:209.4,outsideBandShare:.2}};
 assert.match(P.refusedText(r,'many-glitches'),/불안정/);
 assert.match(P.refusedText(r,'pitch-jumps'),/도약/);
 assert.match(P.refusedText(r,'follows-accompaniment'),/음역/);
 assert.match(P.refusedText(r,'no-voice'),/목소리를 찾지 못/);
 assert.doesNotMatch(P.refusedText(r,'unknown'),/목소리만큼/);
});

test('a value just below the gate remains visibly below its threshold',()=>{
 assert.match(P.refusedText({confidence:{meanStrength:.877}},'weak-pitch'),/87\.7%.*88%/);
 assert.match(P.refusedText({confidence:{meanStrength:.87999}},'weak-pitch'),/87\.9%.*88%/);
});
