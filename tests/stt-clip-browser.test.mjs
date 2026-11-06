import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeWav16,encodeBufferRange,extractR2AudioClip,extractR2AudioPcm,clipFromPcm} from '../stt-clip-browser.mjs';

test('range decoder WAV output is mono PCM16 at 16kHz, with correct RIFF sizes',()=>{
 const samples=new Int16Array(32000);samples[0]=1000;samples[1]=-2000;
 const blob=writeWav16(samples);
 assert.equal(blob.type,'audio/wav');
 assert.equal(blob.size,64044);
});
test('reject empty and unbounded PCM buffers before encoding',()=>{
 assert.throws(()=>writeWav16(new Int16Array(1)),/길이/);
 assert.throws(()=>writeWav16(new Int16Array(16000*31)),/길이/);
});
test('only the requested 30 second window is filled; video decoded audio can be mono or stereo',()=>{
 const pcm=new Int16Array(16000*3);
 const a=new Float32Array(48000).fill(0.5),b=new Float32Array(48000).fill(-0.5);
 const audio={sampleRate:48000,numberOfChannels:2,length:48000,getChannelData:c=>c===0?a:b};
 const next=encodeBufferRange(pcm,audio,20,20,0);
 assert.equal(next,16000);
 assert.equal(pcm[0],0);assert.equal(pcm[100],0);
 assert.equal(pcm[15999],0);assert.equal(pcm[16000],0);
});
test('refuse non-HTTPS source before external codec load',async()=>{
 await assert.rejects(extractR2AudioClip('blob:http://test/1'),/R2 음원/);
});

test('sparse 3-minute audio clip requests only 20-50 seconds, yields 30s WAV',async()=>{
 let requested=null,disposed=false,sourceUrl=null;
 const media={
  ALL_FORMATS:['fake'],
  UrlSource:class{constructor(url){sourceUrl=url}},
  Input:class{
   constructor(){ }
   async getPrimaryAudioTrack(){return {canDecode:async()=>true,computeDuration:async()=>180}}
   dispose(){disposed=true}
  },
  AudioBufferSink:class{
   constructor(){ }
   async *buffers(start,end){
    requested=[start,end];
    for(let sec=start;sec<end;sec++){
     const samples=new Float32Array(16000).fill(0.25);
     yield {timestamp:sec,buffer:{sampleRate:16000,numberOfChannels:1,length:16000,getChannelData:()=>samples}};
    }
   }
  }
 };
 const clip=await extractR2AudioClip('https://r2.example.test/signed.m4a?sig=token',{time:20,duration:30,media});
 assert.deepEqual(requested,[20,50]);
 assert.match(sourceUrl,/signed\.m4a/);
 assert.equal(disposed,true);
 assert.equal(clip.type,'audio/wav');
 assert.equal(clip.size,960044);
 const bytes=new DataView(await clip.arrayBuffer());
 assert.equal(bytes.getUint32(24,true),16000);
 assert.equal(bytes.getUint32(40,true),960000);
 assert.equal(bytes.getInt16(44,true),8192);
});

test('singing search reads only the first two minutes by range, and the paid clip is cut from them',async()=>{
 let requested=null;
 const media={ALL_FORMATS:['fake'],UrlSource:class{},
  Input:class{async getPrimaryAudioTrack(){return {canDecode:async()=>true,computeDuration:async()=>300}}dispose(){}},
  AudioBufferSink:class{async *buffers(start,end){requested=[start,end];
   for(let sec=start;sec<end;sec++){const v=new Float32Array(16000).fill(sec/1000);yield {timestamp:sec,buffer:{sampleRate:16000,numberOfChannels:1,length:16000,getChannelData:()=>v}}}}}};
 const {pcm,start,duration,rate}=await extractR2AudioPcm('https://r2.example.test/a.m4a?sig=t',{time:0,seconds:120,media});
 assert.deepEqual(requested,[0,120]); // never the whole 5-minute file
 assert.equal(pcm.length,120*16000);assert.equal(start,0);assert.equal(duration,300);assert.equal(rate,16000);
 const clip=clipFromPcm(pcm,39.5);
 assert.equal(clip.size,44+30*16000*2);
 const first=new DataView(await clip.arrayBuffer()).getInt16(44,true);
 assert.equal(first,Math.round(39/1000*32767)); // 39.5 s falls inside the 39th second's samples
 await assert.rejects(extractR2AudioPcm('https://x.test/a',{seconds:121,media}),/구간/);
});
