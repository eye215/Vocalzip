const {test}=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../bounded-byte-writer.js');
test('Non-contiguous MP4 writes, header rewrites and gaps preserve byte positions',()=>{
 const writer=create(32,8);
 writer.write({position:12,data:new Uint8Array([12,13,14,15,16,17])});
 writer.write({position:0,data:new Uint8Array([1,2,3,4])});
 writer.write({position:2,data:new Uint8Array([9,8])});
 assert.deepEqual([...Buffer.concat(writer.parts())],[1,2,9,8,0,0,0,0,0,0,0,0,12,13,14,15,16,17]);
 assert.equal(writer.size,18);
});
test('Output allocation is capped before a write and cancelled buffers can be released',()=>{
 const writer=create(8,4);writer.write({position:0,data:new Uint8Array([1,2])});
 assert.throws(()=>writer.write({position:7,data:new Uint8Array([3,4])}));assert.equal(writer.size,2);
 writer.clear();assert.equal(writer.size,0);assert.deepEqual(writer.parts(),[]);
});
