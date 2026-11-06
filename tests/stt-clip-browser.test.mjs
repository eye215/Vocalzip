import {test} from 'node:test';
import assert from 'node:assert/strict';
import {writeWav16,encodeBufferRange,extractR2AudioClip} from '../stt-clip-browser.mjs';

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
