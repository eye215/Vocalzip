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

// Tombstones carry {at, seen} (deletedAt, written by core.js): an edit the deleting device never saw wins.
test('A goal checked on another device survives a routine ended here, whichever happened first', () => {
  const goal = (updatedAt, completed) => ({id:'g1', title:'호흡 연습', completed, updatedAt});
  // Created at t=1 on both. Phone ends the routine (removing today's unchecked goal); tablet checks it.
  for (const [endAt, checkAt] of [[1000, 1500], [1500, 1000]]) {
    const phone = {...base(), dailyGoals:[], deleted:{dailyGoals:['g1']}, deletedAt:{dailyGoals:{g1:{at:endAt, seen:1}}}};
    const tablet = {...base(), dailyGoals:[goal(checkAt, true)]};
    for (const [first, second] of [[phone, tablet], [tablet, phone]]) {
      const {data} = M.merge(first, second);
      assert.deepEqual(data.dailyGoals, [goal(checkAt, true)], 'end '+endAt+' check '+checkAt);
      assert.equal(data.deleted.dailyGoals, undefined);
      assert.equal(data.deletedAt, undefined);
    }
  }
});
test('A deletion made after seeing the latest edit still wins, and its record is kept for the next merge', () => {
  const phone = {...base(), dailyGoals:[], deleted:{dailyGoals:['g1']}, deletedAt:{dailyGoals:{g1:{at:2000, seen:1500}}}};
  const tablet = {...base(), dailyGoals:[{id:'g1', completed:true, updatedAt:1500}]};
  const {data} = M.merge(tablet, phone);
  assert.deepEqual(data.dailyGoals, []);
  assert.deepEqual(data.deleted.dailyGoals, ['g1']);
  assert.deepEqual(data.deletedAt, {dailyGoals:{g1:{at:2000, seen:1500}}});
});
test('Old tombstones without deletedAt still always win (unchanged), and two tombstones keep the better-informed one', () => {
  const old = {...base(), dailyGoals:[], deleted:{dailyGoals:['g1']}};
  const edited = {...base(), dailyGoals:[{id:'g1', updatedAt:9e12}]};
  assert.deepEqual(M.merge(edited, old).data.dailyGoals, []);
  assert.deepEqual(M.merge(old, edited).data.dailyGoals, []);
  const a = {...base(), deleted:{dailyGoals:['g2']}, deletedAt:{dailyGoals:{g2:{at:100, seen:40}}}};
  const b = {...base(), deleted:{dailyGoals:['g2']}, deletedAt:{dailyGoals:{g2:{at:300, seen:20}}}};
  assert.deepEqual(M.merge(a, b).data.deletedAt, {dailyGoals:{g2:{at:300, seen:40}}});
});
test('Lessons, songs and other permanently deleted records stay deleted even if edited elsewhere later', () => {
  for (const k of ['lessons', 'songs', 'practices', 'scoreAnnotations']) {
    const gone = {...base(), [k]:[], deleted:{[k]:['x1']}, deletedAt:{[k]:{x1:{at:1000, seen:1}}}};
    const edited = {...base(), [k]:[{id:'x1', note:'edited elsewhere', updatedAt:5000}]};
    assert.deepEqual(M.merge(edited, gone).data[k], [], k);
    assert.deepEqual(M.merge(gone, edited).data.deleted[k], ['x1'], k);
  }
  const plan = M.merge({...base(), practicePlans:[{id:'p1', updatedAt:5000}]}, {...base(), practicePlans:[], deleted:{practicePlans:['p1']}, deletedAt:{practicePlans:{p1:{at:1000, seen:1}}}}).data;
  assert.deepEqual(plan.practicePlans.map(p => p.id), ['p1']);
});
test('core.js records when each tombstone was made and which version it removed', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '../app/core.js'), 'utf8');
  // The save's own code: the tracked lists, then everything from TRACKED up to VZ.change (snapshot, stampedText).
  const body = src.slice(src.indexOf('const ARRAYS'), src.indexOf('\n', src.indexOf('const ARRAYS'))) + '\n' + src.slice(src.indexOf('const TRACKED'), src.indexOf('VZ.change ='));
  const stamp = new Function(body + '\nreturn (before, after) => stampedText(snapshot(before), after);')();
  const before = {dailyGoals:[{id:'g1', updatedAt:42}, {id:'g2'}, {id:'g3'}]}, after = {dailyGoals:[{id:'g3'}], deleted:{dailyGoals:['old']}, deletedAt:{dailyGoals:{old:{at:5, seen:2}}}};
  const t0 = Date.now(); stamp(before, after);
  assert.deepEqual(after.deleted.dailyGoals, ['old', 'g1', 'g2']);
  assert.deepEqual(after.deletedAt.dailyGoals.old, {at:5, seen:2});
  assert.equal(after.deletedAt.dailyGoals.g1.seen, 42);assert.equal(after.deletedAt.dailyGoals.g2.seen, 0);
  assert.ok(after.deletedAt.dailyGoals.g1.at >= t0 && after.deletedAt.dailyGoals.g1.at <= Date.now());
  // The text a save stores is the stamped state, character for character.
  const next = {dailyGoals:[{id:'g3', title:'바뀜'}, {id:'g4'}], settings:{a:1}};
  assert.equal(stamp({dailyGoals:[{id:'g3'}], settings:{a:1}}, next), JSON.stringify(next));
  assert.ok(next.dailyGoals[0].updatedAt >= t0 && next.dailyGoals[1].updatedAt >= t0);
});

// Sync asks unchanged(device, merged) before storing a merged copy and redrawing (cloud-sync.js). A merge that only
// brought nothing new must read as unchanged, whatever text merge() gave it; every real difference must not.
test('unchanged: a merge that brings nothing new is not a change, whatever its text', () => {
  const device = {...base(), songs:[{id:'s1', title:'On My Own', updatedAt:5}], performances:[{id:'p1', title:'갈라'}], settings:{dailyMinutes:30}};
  // The server copy is this device's own earlier save, with its keys in another order.
  const cloud = {settings:{dailyMinutes:30}, performances:[{title:'갈라', id:'p1'}], practices:[], assignments:[], lessons:[], songs:[{updatedAt:5, title:'On My Own', id:'s1'}], categories:[]};
  const merged = M.merge(device, cloud).data;
  assert.equal(M.same(device, merged), false);                  // deleted:{} and songLinks:[] were added, keys moved
  assert.equal(M.unchanged(device, merged), true);
  assert.equal(M.unchanged(merged, M.merge(merged, cloud).data), true);
  // Tombstones: the same ids, kinds in merge()'s own order, numbers as text.
  const withDeleted = {...device, deleted:{practices:['x'], songs:[7], media:['m1']}, deletedAt:{practices:{x:{at:9, seen:3}}}};
  const again = M.merge(withDeleted, {...cloud, deleted:{songs:['7']}}).data;
  assert.deepEqual(Object.keys(again.deleted), ['songs', 'practices', 'media']);
  assert.equal(M.unchanged(withDeleted, again), true);
  assert.equal(M.unchanged({...device, deleted:{}, deletedAt:{}}, device), true);
  assert.equal(M.unchanged({...device, deleted:{songs:[]}}, device), true);
});
test('unchanged: every real difference is a change', () => {
  const device = {...base(), songs:[{id:'s1', title:'On My Own', updatedAt:5}, {id:'s2', title:'Stars', updatedAt:5}], practices:[{id:'p1', minutes:20, mediaIds:['m1']}], performances:[{id:'f1', songLinks:[{songId:'s1'}]}], settings:{dailyMinutes:30}};
  const differs = (name, cloud) => assert.equal(M.unchanged(device, M.merge(device, cloud).data), false, name);
  const copy = () => structuredClone(device);
  let cloud = copy(); cloud.songs.push({id:'s3', title:'다른 기기의 곡'}); differs('a record from another device', cloud);
  cloud = copy(); cloud.songs[0] = {...cloud.songs[0], title:'바뀐 제목', updatedAt:9}; differs('a newer edit', cloud);
  cloud = copy(); cloud.deleted = {songs:['s2']}; differs('a deletion', cloud);
  cloud = copy(); cloud.deleted = {media:['m1']}; differs('a deleted recording unlinked from a practice', cloud);
  cloud = copy(); cloud.goalSettings = {weekly:3}; differs('a key only the other device has', cloud);
  cloud = copy(); cloud.deleted = {dailyGoals:['g1']}; differs('a tombstone alone', cloud);
  // Not merge results, but what the comparison itself must tell apart.
  assert.equal(M.unchanged(device, {...device, songs:[device.songs[1], device.songs[0]]}), false);            // list order
  assert.equal(M.unchanged(device, {...device, settings:{dailyMinutes:45}}), false);
  assert.equal(M.unchanged(device, {...device, practices:[{id:'p1', minutes:20, mediaIds:[]}]}), false);
  assert.equal(M.unchanged({...device, practices:[{id:'p1', minutes:20}]}, {...device, practices:[{id:'p1', minutes:20, mediaIds:[]}]}), false);   // only merge()'s own empties are ignored
  assert.equal(M.unchanged({...device, deletedAt:{dailyGoals:{g1:{at:1, seen:1}}}}, device), false);
  assert.equal(M.unchanged(null, device), false);
  // A record the merge drops (a row saved twice) is a change to store, not a matter of text.
  const twice = {...device, songs:[...device.songs, device.songs[0]]};
  assert.equal(M.unchanged(twice, M.merge(twice, device).data), false);
});
