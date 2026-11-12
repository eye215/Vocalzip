const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function setup({assignments=[],feedback=[],tips=[],categories=[]}={}){
  const db={assignments,categories,videoFeedback:feedback};
  const V={db,media:{list:async()=>[]},esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),today:()=> '2026-11-10',
    uid:()=>`new-${db.categories.length}`,taskInPeriod:t=>t.status!=='done',taskLessons:t=>t.lessonId?[t.lessonId]:[],taskSongId:t=>t.songId||'',dateLabel:s=>s,
    practiceTips:()=>({tips}),route:()=>{}};
  const window={VZ:V,addEventListener:()=>{}};
  vm.runInNewContext(fs.readFileSync('app/guided-practice.js','utf8'),{window,document:{addEventListener:()=>{}},location:{},setInterval,clearInterval}, {filename:'app/guided-practice.js'});
  return V;
}
test('lesson homework comes first, repeated measurements fill only three cards',async()=>{
  const V=setup({assignments:[{id:'plain',title:'호흡 연습',status:'active',created:2},{id:'lesson',lessonId:'l1',title:'긴 음 유지',status:'active',created:1}],
    tips:[{key:'wob',name:'롱톤',frequency:4,score:.7,metric:'흔들림',value:'±18 cent',steps:['아'],minutes:8},
      {key:'into',name:'기준음',frequency:3,score:.9,metric:'음정',value:'±19 cent',steps:['도'],minutes:10}]});
  const rows=await V.guidedRecommendations();
  assert.equal(rows.map(x=>x.key).join(','),'homework:lesson,homework:plain,analysis:into');
  assert.equal(rows[0].video.id,'Kl85hKuMP5Y');
  assert.equal(rows[1].video,null);
});
test('rejected video is suppressed only for the same exercise',async()=>{
  const tips=[{key:'wob',name:'롱톤',frequency:4,score:1,metric:'흔들림',value:'±18 cent',steps:['아'],minutes:8}];
  const V=setup({feedback:[{id:'analysis:wob:Kl85hKuMP5Y',exerciseKey:'analysis:wob',videoId:'Kl85hKuMP5Y',verdict:'bad'}],tips});
  const rows=await V.guidedRecommendations();
  assert.equal(rows[0].video,null);
  V.db.assignments.push({id:'another',title:'롱톤 5초',lessonId:'l1',status:'active'});
  const next=await V.guidedRecommendations();
  assert.equal(next[0].video.id,'Kl85hKuMP5Y');
});
test('isolated weak observation is not recommended',async()=>{
  const V=setup({tips:[{key:'wob',name:'롱톤',frequency:1,score:1,metric:'흔들림',value:'±18 cent'}]});
  assert.equal((await V.guidedRecommendations()).length,0);
});
test('guided recommendation reuses a suitable category or creates a missing one',()=>{
  const V=setup({categories:[{id:'breath',name:'호흡',items:['복식호흡']} ]});
  const existing=V.guidedCategory(V.db,{title:'호흡을 길게 유지하기',kind:'homework'});
  assert.equal(existing.categoryId,'breath');
  assert.equal(existing.detail,'호흡을 길게 유지하기');
  assert.deepEqual(V.db.categories[0].items,['복식호흡','호흡을 길게 유지하기']);
  V.guidedCategory(V.db,{title:'호흡을 길게 유지하기',kind:'homework'});
  assert.equal(V.db.categories[0].items.length,2);
  const newCategory=V.guidedCategory(V.db,{title:'음정 안정성 (롱톤) 연습',tipKey:'wob'});
  assert.equal(newCategory.categoryLabel,'발성');
  assert.equal(V.db.categories.length,2);
  const fallback=V.guidedCategory(V.db,{title:'어깨 힘 풀기'});
  assert.equal(fallback.categoryLabel,'보컬 트레이닝');
  assert.equal(V.db.categories.length,3);
});
test('intonation range stays metadata and the three-step exercise includes a live tuner',()=>{
 const db={practices:[]},VZ={db,media:{dateOf:()=> '2026-11-10'},esc:s=>String(s),analysisReliable:()=>true};
 const window={VZ};
 vm.runInNewContext(fs.readFileSync('app/practice-tips.js','utf8'),{window}, {filename:'app/practice-tips.js'});
 const analysis={v:1,metrics:{intonation:{meanAbsCents:25},range:{lowCents:4600,highCents:8100}}};
 const tip=VZ.practiceTips([1,2,3].map(created=>({created,analysis}))).tips.find(t=>t.key==='into');
 assert.equal(tip.range,'A#2~A5');
 assert.equal(tip.steps.length,3);
 assert.match(tip.steps[2],/튜너가 가운데/);
 assert.ok(tip.steps.every(step=>!step.includes('A#2~A5')));
});
test('live pitch detection finds a sung note and rejects silence',()=>{
 const V=setup(),sampleRate=48000,frame=Float32Array.from({length:4096},(_,i)=>.25*Math.sin(2*Math.PI*440*i/sampleRate));
 assert.ok(Math.abs(V.guidedDetectPitch(frame,sampleRate)-440)<2);
 assert.equal(V.guidedDetectPitch(new Float32Array(4096),sampleRate),null);
});
test('solfege text becomes scale intervals inside the observed range',()=>{
 const V=setup(),range={low:46,high:81};
 const full=V.guidedScaleFromText('도레미파솔라시도',range);
 assert.deepEqual(Array.from(full.offsets),[0,2,4,5,7,9,11,12]);
 assert.equal(full.initial,58);
 const five=V.guidedScaleFromText('5음계 상행·하행 (도레미파솔파미레도) 3회',range);
 assert.deepEqual(Array.from(five.offsets),[0,2,4,5,7,5,4,2,0]);
 assert.equal(V.guidedScaleFromText('도레미파솔라시도',{low:60,high:65}),null);
});
