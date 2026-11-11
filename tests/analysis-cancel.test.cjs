const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){const workers=[];const VZ={media:{}};class Worker{constructor(){workers.push(this)}postMessage(){}terminate(){this.terminated=true}}
 const source=fs.readFileSync('app/analysis.js','utf8').split('/* ---------- drawing ---------- */')[0]+'})();';
 vm.runInNewContext(source,{window:{VZ},Worker,DOMException,Float32Array});return {VZ,workers};}
test('stopping title voice detection terminates the worker immediately',async()=>{
 const {VZ,workers}=setup(),controller=new AbortController();
 const pending=VZ.analyzeSamples(new Float32Array(100),8000,()=>{},{voiceOnly:true,signal:controller.signal});
 controller.abort();await assert.rejects(pending,e=>e.name==='AbortError');assert.equal(workers[0].terminated,true);
});
test('already cancelled requests never create a worker',async()=>{
 const {VZ,workers}=setup(),controller=new AbortController();controller.abort();
 await assert.rejects(VZ.analyzeSamples(new Float32Array(100),8000,()=>{},{signal:controller.signal}),e=>e.name==='AbortError');assert.equal(workers.length,0);
});
