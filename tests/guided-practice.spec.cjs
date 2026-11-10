const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function setup({assignments=[],feedback=[],tips=[],categories=[]}={}){
  const db={assignments,categories,videoFeedback:feedback};
  const V={db,media:{list:async()=>[]},esc:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),today:()=> '2026-11-10',
    uid:()=>`new-${db.categories.length}`,taskInPeriod:t=>t.status!=='done',taskLessons:t=>t.lessonId?[t.lessonId]:[],taskSongId:t=>t.songId||'',dateLabel:s=>s,
    practiceTips:()=>({tips}),route:()=>{}};
  const window={VZ:V};
  vm.runInNewContext(fs.readFileSync('app/guided-practice.js','utf8'),{window,document:{},location:{},setInterval,clearInterval}, {filename:'app/guided-practice.js'});
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
