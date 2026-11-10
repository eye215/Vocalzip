const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');

test('처리 내역 새로고침이 업로드·백업·실패한 서버 분석을 다시 시도한다',async()=>{
  const calls=[],host={isConnected:true,dataset:{},innerHTML:''},events=new Map();
  let route;
  const VZ={media:{list:async()=>[],cached:()=>[],backupLocal:async()=>{calls.push('backup');return {done:1,failed:0}}},
    esc:s=>String(s),route:(name,options)=>{if(name==='processing-log')route=options},
    retryImportFailures:async()=>{calls.push('import');return {retried:1,missing:0}},
    processingCostEstimate:null};
  const window={VZ,localStorage:{getItem:()=>null,setItem:()=>{}},
    vzipAnalysisJobs:async()=>({rows:[{media_id:'m1',kind:'vocal',status:'failed',cost_usd:0}],review:[]}),
    vzipAnalysisRetry:async()=>{calls.push('analysis');return 1},vzipCloudSignedIn:()=>true,
    addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:name=>events.delete(name)};
  vm.runInNewContext(fs.readFileSync('app/processing-log.js','utf8'),{window,document:{visibilityState:'visible'},Date,Math,Number,Object,JSON,Map,Promise,setInterval:()=>1,clearInterval:()=>{}});
  route.mount({querySelector:()=>host});
  await new Promise(resolve=>setImmediate(resolve));
  assert.match(host.innerHTML,/새로고침/);
  await host.onclick({target:{closest:selector=>selector==='[data-retry-all]'?{}:null}});
  assert.deepEqual(calls,['import','backup','analysis']);
  assert.match(host.innerHTML,/서버 분석 1개 다시 대기열에 등록/);
  route.leave();
});
