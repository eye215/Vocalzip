// Preserve exact median and note boundaries while removing repeated prefix sorting.
const test=require('node:test'),assert=require('node:assert/strict');
const {prefixMedian,notesOf}=require('../app/vocal-analysis.js')._internal;
test('prefix median agrees with sorted prefixes, including duplicates and reverse order',()=>{
 let seed=7;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
 for(const values of [Array.from({length:5000},()=>random()*10000-5000),Array.from({length:2000},(_,i)=>2000-i),Array(2000).fill(3)]) {
  const tracker=prefixMedian(),prefix=[];
  for(const value of values){tracker.add(value);prefix.push(value);const sorted=[...prefix].sort((a,b)=>a-b),i=sorted.length>>1;assert.equal(tracker.value(),sorted.length%2?sorted[i]:(sorted[i-1]+sorted[i])/2);}
 }
});
test('sustained notes and five-frame transitions keep their original boundaries',()=>{
 const samples=Float64Array.from({length:3000},(_,i)=>6900+(i>=1000?200:0)+(i>=2000?-100:0)+20*Math.sin(i*.35));
 const notes=notesOf(samples);
 assert.deepEqual(notes.map(n=>[n.start,n.end]),[[5,992],[1002,1998],[2008,2995]]);
 assert.ok(notes.every(n=>n.raw.length===n.sm.length));
});
