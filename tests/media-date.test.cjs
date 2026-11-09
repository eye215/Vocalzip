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

test('Repeated date tags preserve full dates and do not turn year-only tags into January 1',()=>{
 assert.equal(dates.pick({raw:{TDRC:['2024-02-29']}},now,now).recordedDate,'2024-02-29');
 assert.equal(dates.pick({raw:{TDRC:['2024']},date:new Date('2024-01-01')},now,now).dateSource,'file-modified');
});
test('File names written yyyy-MM-dd_HH-mm-ss give the exact recording time; broken times are ignored',()=>{
 const r=dates.fromName('2025-08-08_22-09-00.m4a',now);
 assert.equal(r.recordedDate,'2025-08-08');assert.equal(r.created,new Date(2025,7,8,22,9,0).getTime());assert.equal(r.dateSource,'filename');
 assert.equal(dates.fromName('보컬 2025-08-08 22.09.00.wav',now).recordedDate,'2025-08-08');
 for(const name of ['2025-02-30_10-00-00.m4a','2025-08-08_24-00-00.m4a','take.m4a','12025-08-08_22-09-00.m4a',''])assert.equal(dates.fromName(name,now),null);
});
test('Names starting with month-day and no year use the current calendar year, including later months',()=>{
 const ref=new Date(2026,10,10,20).getTime();
 for(const [name,day] of [['11-3 scale.m4a','2026-11-03'],['11-5 #20-2.m4a','2026-11-05'],['11-9 #4.m4a','2026-11-09'],['12-25 carol.m4a','2026-12-25']]){
  const r=dates.fromName(name,ref);assert.equal(r.recordedDate,day,name);assert.equal(r.timeless,true);
 }
 for(const name of ['2-30 x.m4a','take 11-3.m4a','113 scale.m4a','13-1 x.m4a'])assert.equal(dates.fromName(name,ref),null,name);
});
test('A full date without a time in the name ("2025-10-19 #21 2") gives that day; the file keeps its own time',()=>{
 for(const [name,day] of [['2025-10-19 #21 2','2025-10-19'],['2025-10-22 #8.m4a','2025-10-22'],['2025-08-08.m4a','2025-08-08'],['레슨 2025.9.3 발성','2025-09-03'],['2025-10-19_#21','2025-10-19']]){
  const r=dates.fromName(name,now);assert.equal(r.recordedDate,day,name);assert.equal(r.timeless,true,name);assert.equal(r.dateSource,'filename');
 }
 assert.equal(dates.fromName('2025-08-08_22-09-00.m4a',now).timeless,undefined); // a full timestamp still gives the exact time
 for(const name of ['2025-02-30 x','2025-13-01 x','2027-01-05 x','12025-10-19 x','take 1019'])assert.equal(dates.fromName(name,now),null,name);
});

test('Yearless names follow the reference calendar year across New Year without rewriting explicit years',()=>{
 const dec=new Date(2026,11,31,23).getTime(),jan=new Date(2027,0,1,1).getTime();
 assert.equal(dates.fromName('1-1 warmup.m4a',dec).recordedDate,'2026-01-01');
 assert.equal(dates.fromName('12-31 warmup.m4a',jan).recordedDate,'2027-12-31');
 assert.equal(dates.fromName('2025-12-31 old.m4a',jan).recordedDate,'2025-12-31');
});
test('Yearless February 29 is valid only in the current leap year, with no fallback to an older year',()=>{
 const leap=new Date(2024,0,1,12).getTime(),ordinary=new Date(2026,0,1,12).getTime();
 assert.equal(dates.fromName('2-29 scale.m4a',leap).recordedDate,'2024-02-29');
 assert.equal(dates.fromName('2-29 scale.m4a',ordinary),null);
 assert.equal(dates.fromName('02.29 scale.m4a',leap).timeless,true);
});
