const {test}=require('node:test'),assert=require('node:assert/strict');
const dates=require('../media-date.js'),now=Date.parse('2026-11-04T00:00:00Z');
test('QuickTime creation offset wins over filesystem mtime and UTC header date',()=>{
 const result=dates.pick({creationTime:new Date('2024-02-29T15:30:00Z'),raw:{'com.apple.quicktime.creationdate':'2024-03-01T00:30:00+0900'}},now,now);
 assert.equal(result.created,Date.parse('2024-02-29T15:30:00Z'));assert.equal(result.recordedDate,'2024-03-01');assert.equal(result.dateSource,'metadata');
});
test('Recording tags, WAV dates and date-only values keep their calendar day',()=>{
 for(const key of ['TDRC','ICRD','DATE'])assert.equal(dates.pick({raw:{[key]:'2024-02-29'}},now,now).recordedDate,'2024-02-29');
 assert.equal(dates.parse('2024:02:29 16:12:30',now).recordedDate,'2024-02-29');
});
test('Missing, incomplete, invalid and zero metadata never invent capture dates',()=>{
 for(const tags of [{},{raw:{TDRC:'2024'}},{raw:{ICRD:'2024-02-31'}},{creationTime:new Date('1904-01-01')}])
  assert.equal(dates.pick(tags,now,now).dateSource,'file-modified');
 const fallback=dates.pick({},0,now);assert.equal(fallback.dateSource,'upload-time');assert.equal(fallback.created,now);
 assert.equal(dates.parse('2024-02-31',now),null);
});
