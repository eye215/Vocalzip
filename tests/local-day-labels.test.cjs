// Saved-result dates are shown as the local calendar day: toISOString() is UTC and showed the day before until 09:00 in Korea.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const files=['app/song-ar.js','app/ar-note-compare.js','app/score-note-compare.js'];
test('AR / note-compare panels build day labels with the local-date helper, not the UTC ISO string',()=>{
 for(const file of files){
  const source=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  assert.equal(/toISOString\(\)\.slice\(0, ?10\)/.test(source),false,file+' still cuts a UTC ISO string');
  assert.match(source,/dateLabel\?\.\(VZ?\.ymd\(new Date\((?:ref|saved)\.at\)\)\)/,file);
 }
});
// The saved-result day is the DEVICE's calendar day (VZ.ymd, the same helper every other date label uses), so what it
// prints depends on the zone of the machine. Each case therefore runs the real helper from app/core.js in a child
// process with TZ pinned, instead of assuming the test machine is in Korea (CI and most laptops are not).
const {execFileSync}=require('node:child_process');
const core=fs.readFileSync(path.join(__dirname,'..','app/core.js'),'utf8');
const helper=[/^const pad = .*$/m,/^VZ\.ymd = .*$/m].map(re=>{const m=re.exec(core);assert.ok(m,'app/core.js no longer defines '+re);return m[0];}).join('\n');
const dayIn=(zone,iso)=>execFileSync(process.execPath,['-e','const VZ={};\n'+helper+'\nprocess.stdout.write(VZ.ymd(new Date(Date.parse(process.argv[1]))));',iso],{env:{...process.env,TZ:zone},encoding:'utf8'});
test('08:30 in Korea is still that day on a device in Korea, while the UTC string is the day before',()=>{
 const iso='2026-11-10T23:30:00Z';
 assert.equal(new Date(Date.parse(iso)).toISOString().slice(0,10),'2026-11-10');
 assert.equal(dayIn('Asia/Seoul',iso),'2026-11-11');
});
test('the label follows the zone of the device, whatever zone this machine is in',()=>{
 assert.equal(dayIn('UTC','2026-11-10T23:30:00Z'),'2026-11-10');
 assert.equal(dayIn('America/Los_Angeles','2026-11-10T23:30:00Z'),'2026-11-10'); // 15:30 on the 10th
 assert.equal(dayIn('America/Los_Angeles','2026-11-11T03:00:00Z'),'2026-11-10'); // 19:00 on the 10th; the UTC string says the 11th
 assert.equal(dayIn('Asia/Seoul','2026-11-10T14:59:59Z'),'2026-11-10');          // 23:59:59 — one second before midnight in Korea
 assert.equal(dayIn('Asia/Seoul','2026-11-10T15:00:00Z'),'2026-11-11');
});
