const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../data-merge.js');
const base = () => ({categories:[], songs:[], lessons:[], assignments:[], practices:[]});
test('Nothing on either side is lost: device and cloud records are unioned by id', () => {
  const device = {...base(), songs:[{id:'s1', title:'This Is the Moment'}, {id:'s3', title:'새 곡'}], practices:[{id:'p1', minutes:30}]};
  const cloud = {...base(), songs:[{id:'s1', title:'This Is the Moment'}, {id:'s2', title:'On My Own'}], lessons:[{id:'l1', date:'2026-11-01'}]};
  const {data, added} = M.merge(device, cloud);
  assert.deepEqual(data.songs.map(s => s.id), ['s1', 's3', 's2']);
  assert.deepEqual(data.lessons.map(l => l.id), ['l1']);
  assert.deepEqual(data.practices.map(p => p.id), ['p1']);
  assert.equal(added.songs, 1);
});
test('An empty device (new browser) never wipes the cloud, and a stale cloud never wipes the device', () => {
  const full = {...base(), songs:[{id:'s1', title:'a'}, {id:'s2', title:'b'}]};
  assert.equal(M.merge(base(), full).data.songs.length, 2);
  assert.equal(M.merge(full, base()).data.songs.length, 2);
});
test('Deliberate deletions (tombstones) win on both sides; newer updatedAt wins on conflicts', () => {
  const device = {...base(), songs:[{id:'s1', title:'new title', updatedAt:200}], deleted:{songs:['s2']}};
  const cloud = {...base(), songs:[{id:'s1', title:'old title', updatedAt:100}, {id:'s2', title:'deleted on phone'}]};
  const {data} = M.merge(device, cloud);
  assert.deepEqual(data.songs, [{id:'s1', title:'new title', updatedAt:200}]);
  assert.deepEqual(data.deleted.songs, ['s2']);
  const newerCloud = M.merge({...base(), songs:[{id:'s1', title:'x', updatedAt:1}]}, {...base(), songs:[{id:'s1', title:'y', updatedAt:2}]}).data;
  assert.equal(newerCloud.songs[0].title, 'y');
});
test('Without timestamps the device version wins and other fields are kept', () => {
  const {data} = M.merge({...base(), songs:[{id:'s1', title:'device'}], extra:1}, {...base(), songs:[{id:'s1', title:'cloud'}], comparisonReports:[{id:'r1'}]});
  assert.equal(data.songs[0].title, 'device');
  assert.equal(data.extra, 1);
  assert.deepEqual(data.comparisonReports, [{id:'r1'}]);
  assert.ok(M.valid(data));
});

test('Daily goal checks from different devices and explicit plan deletions survive sync',()=>{
 const a={...base(),dailyGoals:[{id:'a',date:'2026-11-07',completed:true,updatedAt:20},{id:'b',completed:false,updatedAt:1}],practicePlans:[{id:'day:2026-11-07',targetMinutes:30}],deleted:{practicePlans:['week:2026-11-02']}};
 const b={...base(),dailyGoals:[{id:'a',completed:false,updatedAt:1},{id:'b',completed:true,updatedAt:30}],practicePlans:[{id:'week:2026-11-02',targetMinutes:180}]};
 const out=M.merge(a,b).data;
 assert.deepEqual(out.dailyGoals.map(g=>[g.id,g.completed]),[['a',true],['b',true]]);
 assert.deepEqual(out.practicePlans.map(p=>p.id),['day:2026-11-07']);
 assert.deepEqual(out.deleted.practicePlans,['week:2026-11-02']);
});
