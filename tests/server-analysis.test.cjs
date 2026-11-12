const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

test('a manually assigned recording stops counting as song review',async()=>{
 const listeners=new Map(),media=[{id:'recording',songId:''}];
 const jobs={rows:[{media_id:'recording',kind:'song',status:'review'}],review:[{media_id:'recording',result:{top3:[{songId:'song',score:.7}]}}]};
 const VZ={media:{list:async()=>media.map(m=>({...m})),invalidate(){}},esc:x=>x};
 const window={VZ,vzipCloudUserId:()=> 'owner',vzipCloudSignedIn:()=>true,vzipAnalysisEnqueue:async()=>1,vzipAnalysisJobs:async()=>jobs,
  vzipAnalysisLive:()=>()=>{},addEventListener:(name,fn)=>listeners.set(name,fn),dispatchEvent:()=>{}};
 vm.runInNewContext(fs.readFileSync('app/server-analysis.js','utf8'),{window,document:{addEventListener(){}},Event:class Event{},setInterval:()=>1,clearInterval(){},setTimeout,clearTimeout}, {filename:'app/server-analysis.js'});
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(VZ.serverAnalysisCounts().song.review,1);
 assert.ok(VZ.serverReview('recording'));
 media[0].songId='song';listeners.get('vzip:media-updated')();
 await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(VZ.serverAnalysisCounts().song.review,0);
 assert.equal(VZ.serverReview('recording'),null);
});
