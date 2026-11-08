const {test}=require('node:test'),assert=require('node:assert/strict'),n=require('../media-naming.js');
const resolve=id=>({s1:'첫 곡',s2:'새 곡'})[id]||'';
const auto={name:'첫 곡 2026.11.08 10',nameMode:'auto',autoName:'첫 곡 2026.11.08 10',songId:'s1',song:'첫 곡',recordedDate:'2026-11-08'};
test('song and date updates also update an automatic title and preserve ordinal',()=>{
 assert.deepEqual(n.patch(auto,{songId:'s2',song:'새 곡',recordedDate:'2026-11-09'},resolve),{songId:'s2',song:'새 곡',recordedDate:'2026-11-09',name:'새 곡 2026.11.09 10',nameMode:'auto',autoName:'새 곡 2026.11.09 10'});
});
test('an imported original filename becomes a song/date title on assignment',()=>{
 const meta={name:'2026-11-08 take',originalFilename:'2026-11-08 take.m4a',recordedDate:'2026-11-08',songId:'',song:''};
 assert.equal(n.patch(meta,{songId:'s2',song:'새 곡'},resolve).name,'새 곡 2026.11.08');
});
test('manual title is preserved while date and song change',()=>{
 const meta={...auto,name:'내가 직접 쓴 제목',nameMode:'manual'};
 const patch=n.patch(meta,{songId:'s2',recordedDate:'2026-11-09'},resolve);assert.equal(Object.hasOwn(patch,'name'),false);
});
test('explicit rename marks the title manual and future automatic changes do not overwrite it',()=>{
 const patch=n.patch(auto,{name:'오디션용 최종'},resolve),meta={...auto,...patch};
 assert.equal(patch.nameMode,'manual');assert.equal(n.patch(meta,{songId:'s2'},resolve).name,undefined);
});
test('newer manual edits are preserved even if an old auto marker remains',()=>{
 const patch=n.patch({...auto,name:'다른 기기에서 수정한 제목'},{songId:'s2'},resolve);assert.equal(patch.name,undefined);
});
test('legacy automatic title can update without renaming unknown custom titles',()=>{
 const old={name:'첫 곡 2026.11.08 2',songId:'s1',song:'첫 곡',recordedDate:'2026-11-08'};
 assert.equal(n.patch(old,{recordedDate:'2026-11-09'},resolve).name,'첫 곡 2026.11.09 2');
 assert.equal(n.patch({...old,name:'분석 전 내 메모 제목'},{songId:'s2'},resolve).name,undefined);
});
test('undo song assignment restores the original filename for an automatically titled import',()=>{
 const meta={...auto,originalFilename:'원본.2026.11.08.m4a'};
 assert.equal(n.patch(meta,{songId:'',song:''},resolve).name,'원본.2026.11.08');
});
test('unrelated review/rating edits do not change a title',()=>{
 assert.deepEqual(n.patch(auto,{review:'새 메모',rating:4},resolve),{review:'새 메모',rating:4});
});
test('recording day takes precedence over upload time',()=>{
 assert.equal(n.patch({...auto,created:1890000000000},{songId:'s2'},resolve).name,'새 곡 2026.11.08 10');
});

test('a verified automatic form name keeps its collision number',()=>{
 const changes={songId:'s2',song:'새 곡',recordedDate:'2026-11-09',name:'새 곡 2026.11.09 2',nameMode:'auto',autoName:'새 곡 2026.11.09 2'};
 assert.deepEqual(n.patch(auto,changes,resolve),changes);
});
test('a stale automatic form cannot overwrite the latest manual title',()=>{
 const current={...auto,name:'다른 기기의 수동 제목',nameMode:'manual',autoName:null};
 const out=n.patch(current,{songId:'s2',name:'새 곡 2026.11.08',nameMode:'auto',autoName:'새 곡 2026.11.08'},resolve);
 assert.deepEqual(out,{songId:'s2'});
});
