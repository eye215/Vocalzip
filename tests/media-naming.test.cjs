const {test}=require('node:test'),assert=require('node:assert/strict'),n=require('../media-naming.js');
const resolve=id=>({s1:'첫 곡',s2:'새 곡'})[id]||'';
const auto={name:'첫 곡 2026.11.08 10',nameMode:'auto',autoName:'첫 곡 2026.11.08 10',songId:'s1',song:'첫 곡',recordedDate:'2026-11-08'};
test('song and date updates also update an automatic title and preserve ordinal',()=>{
 assert.deepEqual(n.patch(auto,{songId:'s2',song:'새 곡',recordedDate:'2026-11-09'},resolve),{songId:'s2',song:'새 곡',recordedDate:'2026-11-09',review:'이전 제목: 첫 곡 2026.11.08 10',name:'새 곡 2026.11.09 10',nameMode:'auto',autoName:'새 곡 2026.11.09 10'});
});
test('an imported original filename becomes a song/date title on assignment',()=>{
 const meta={name:'2026-11-08 take',originalFilename:'2026-11-08 take.m4a',recordedDate:'2026-11-08',songId:'',song:''};
 assert.equal(n.patch(meta,{songId:'s2',song:'새 곡'},resolve).name,'새 곡 2026.11.08');
});
test('manual title moves to the review when song and date are set',()=>{
 const meta={...auto,name:'내가 직접 쓴 제목',nameMode:'manual'};
 const patch=n.patch(meta,{songId:'s2',song:'새 곡',recordedDate:'2026-11-09'},resolve);
 assert.equal(patch.name,'새 곡 2026.11.09');assert.equal(patch.review,'이전 제목: 내가 직접 쓴 제목');assert.equal(patch.nameMode,'auto');
});
test('previous title is appended without changing an existing review',()=>{
 const meta={...auto,name:'예전 제목',nameMode:'manual',review:'첫 줄 메모\n둘째 줄 메모  '};
 const first=n.patch(meta,{normalizeTitle:true},resolve);
 assert.equal(first.review,'첫 줄 메모\n둘째 줄 메모  \n이전 제목: 예전 제목');
 const second=n.patch({...meta,...first},{normalizeTitle:true},resolve);
 assert.equal(second.review,undefined);
});
test('legacy manual title is converted when a date is edited',()=>{
 const patch=n.patch(auto,{name:'오디션용 최종'},resolve),meta={...auto,...patch};
 assert.equal(patch.nameMode,'manual');const next=n.patch(meta,{recordedDate:'2026-11-09'},resolve);
 assert.equal(next.name,'첫 곡 2026.11.09');assert.equal(next.review,'이전 제목: 오디션용 최종');
});
test('title changed on another device is retained in the review during normalization',()=>{
 const patch=n.patch({...auto,name:'다른 기기에서 수정한 제목'},{songId:'s2',song:'새 곡'},resolve);
 assert.equal(patch.name,'새 곡 2026.11.08');assert.equal(patch.review,'이전 제목: 다른 기기에서 수정한 제목');
});
test('legacy automatic title updates and unknown custom title moves into review',()=>{
 const old={name:'첫 곡 2026.11.08 2',songId:'s1',song:'첫 곡',recordedDate:'2026-11-08'};
 assert.equal(n.patch(old,{recordedDate:'2026-11-09'},resolve).name,'첫 곡 2026.11.09 2');
 const next=n.patch({...old,name:'분석 전 내 메모 제목'},{songId:'s2',song:'새 곡'},resolve);
 assert.equal(next.name,'새 곡 2026.11.08');assert.equal(next.review,'이전 제목: 분석 전 내 메모 제목');
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
 assert.deepEqual(n.patch(auto,changes,resolve),{...changes,review:'이전 제목: 첫 곡 2026.11.08 10'});
});
test('normalization uses the latest title as memo, without duplicating it',()=>{
 const current={...auto,name:'다른 기기의 수동 제목',nameMode:'manual',autoName:null};
 const out=n.patch(current,{songId:'s2',song:'새 곡',normalizeTitle:true},resolve);
 assert.equal(out.name,'새 곡 2026.11.08');assert.equal(out.review,'이전 제목: 다른 기기의 수동 제목');
 assert.equal(n.patch({...current,...out},{normalizeTitle:true},resolve).review,undefined);
});
test('a chosen song and date keep the collision number and append the old title to an existing memo',()=>{
 const current={name:'오래된 파일 제목',nameMode:'manual',review:'후렴 연습',recordedDate:'2026-11-08'};
 const next=n.patch(current,{songId:'s2',song:'새 곡',recordedDate:'2026-11-09',review:'후렴 연습',name:'새 곡 2026.11.09 2',nameMode:'auto',autoName:'새 곡 2026.11.09 2'},resolve);
 assert.equal(next.name,'새 곡 2026.11.09 2');
 assert.equal(next.review,'후렴 연습\n이전 제목: 오래된 파일 제목');
});
test('import keeps the original filename in the memo once when a song and day give it a new title',()=>{
 assert.equal(n.keepPrevious('호흡 확인','SODA_123.m4a','The River 2026.11.10'),'호흡 확인\n이전 제목: SODA_123');
 assert.equal(n.keepPrevious('호흡 확인\n이전 제목: SODA_123','SODA_123.m4a','The River 2026.11.10'),'호흡 확인\n이전 제목: SODA_123');
 assert.equal(n.keepPrevious('','The River 2026.11.10.m4a','The River 2026.11.10'),'');
});
