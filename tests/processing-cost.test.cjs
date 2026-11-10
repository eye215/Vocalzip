const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');

function calculator(){
  const VZ={media:{},esc:s=>s,route:()=>{}};
  const window={VZ,localStorage:{getItem:()=>null,setItem:()=>{}}};
  vm.runInNewContext(fs.readFileSync('app/processing-log.js','utf8'),{window,Date,Math,Number,Object,JSON});
  return VZ.processingCostEstimate;
}

test('실제 R2 용량의 무료 구간과 초과 월 보관료를 구분한다',()=>{
  const estimate=calculator();
  assert.equal(estimate({r2Bytes:9e9,sttCalls:0}).storageUsd,0);
  assert.equal(estimate({r2Bytes:11e9,sttCalls:0}).storageUsd,0.015);
  assert.equal(estimate({r2Bytes:null,sttCalls:0}).storageUsd,null);
});

test('유료 음성 인식 호출과 서버 작업 비용은 분리한다',()=>{
  const value=calculator()({r2Bytes:0,sttCalls:4,jobUsd:0.01});
  assert.equal(value.sttUsd,0.006);
  assert.equal(value.jobUsd,0.01);
  assert.equal(calculator()({r2Bytes:0,sttCalls:null}).sttUsd,null);
});
