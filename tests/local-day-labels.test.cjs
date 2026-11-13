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
test('08:30 in Korea is still that day locally, while the UTC string is the day before',()=>{
 const at=Date.parse('2026-11-10T23:30:00Z'),d=new Date(at),pad=n=>String(n).padStart(2,'0');
 const ymd=x=>x.getFullYear()+'-'+pad(x.getMonth()+1)+'-'+pad(x.getDate()); // same as VZ.ymd (app/core.js)
 assert.equal(d.toISOString().slice(0,10),'2026-11-10');
 assert.equal(ymd(d),'2026-11-11');
});
