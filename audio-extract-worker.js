/* Audio packet copy and metadata inspection; no video/audio encoders or decoders. */
let stopped=false;
self.onmessage=event=>{
 if(event.data?.type==='cancel'){stopped=true;return}
 if(event.data?.type==='prepare')prepare(event.data).catch(error=>self.postMessage({type:'error',name:stopped?'AbortError':error.name,message:stopped?'가져오기를 취소했어요.':error.message}));
};
const check=()=>{if(stopped)throw new DOMException('가져오기를 취소했어요.','AbortError')};
async function prepare({file,id,videoHint,inspect}){
 let input,resultInput,directory,handle,access,buffered,closed=false,output,success=false;
 const iterators=[];
 const progress=message=>self.postMessage({type:'progress',message});
 try{
  await import('./media-date.js?v=1');
  const fallback=self.VzipMediaDates.pick({},file.lastModified);
  const b=await import('https://cdn.jsdelivr.net/npm/mediabunny@1.65.1/dist/bundles/mediabunny.min.mjs');check();
  let maximumInputRead=0;
  const slice=file.slice.bind(file);file.arrayBuffer=()=>{throw Error('원본 전체를 메모리에 읽지 않아요.')};
  file.slice=(...args)=>{const part=slice(...args);maximumInputRead=Math.max(maximumInputRead,part.size);if(part.size>8*1024*1024)throw Error('한 구간이 너무 큰 파일이에요. 음원 파일로 다시 가져와 주세요.');return part};
  input=new b.Input({source:new b.BlobSource(file,{maxCacheSize:4*1024*1024,useStreamReader:false}),formats:b.ALL_FORMATS});
  let tags={},videos,audios;
  try{tags=await input.getMetadataTags();videos=await input.getVideoTracks();audios=await input.getAudioTracks()}
  catch(error){if(videoHint)throw Error('영상의 음성 정보를 읽지 못했어요. 음원 파일로 가져와 주세요.');success=true;self.postMessage({type:'done',metadata:fallback,inspect:{duration:null,readable:false}});return}
  const metadata=self.VzipMediaDates.pick(tags,file.lastModified);
  // Inspect only: date and length for the import filter, without extracting or writing anything.
  if(inspect){let duration=null;try{duration=await input.computeDuration()}catch{}success=true;self.postMessage({type:'done',metadata,inspect:{duration:Number.isFinite(duration)?Math.round(duration*10)/10:null,hasVideo:videos.length>0,hasAudio:audios.length>0,readable:true}});return}
  if(!videos.length&&!videoHint){
   // Uncompressed WAV becomes FLAC (lossless) only when decoding both gives the very same samples.
   let flac=null;try{flac=await toFlac(b,input,audios,file,metadata,progress,iterators)}catch(error){flac={error:error.message}}
   success=true;
   if(flac?.file)self.postMessage({type:'done',file:flac.file,metadata:{...metadata,originalMedia:{name:file.name,type:file.type,size:file.size,created:metadata.created,recordedDate:metadata.recordedDate},losslessFlac:flac.proof}});
   else self.postMessage({type:'done',metadata:flac?.error?{...metadata,flacSkipped:flac.error}:metadata});
   return;
  }
  self.postMessage({type:'detected-video'});
  if(!audios.length)throw Error('음성이 없는 영상은 음원으로 가져올 수 없어요.');
  progress('영상에서 원본 음성 추출 중…');check();
  try{
   if(!navigator.storage?.getDirectory)throw Error('OPFS unavailable');
   directory=await (await navigator.storage.getDirectory()).getDirectoryHandle('vzip-audio-temp-v1',{create:true});
   handle=await directory.getFileHandle(id,{create:true});
   if(!handle.createSyncAccessHandle)throw Error('OPFS unavailable');
   access=await handle.createSyncAccessHandle();
  }catch{
   await import('./bounded-byte-writer.js?v=1');
   buffered=self.VzipBoundedBytes.create();
  }
  let codecs=await Promise.all(audios.map(track=>track.getCodec()));
  const candidates=[
   {format:new b.Mp4OutputFormat({fastStart:false,metadataFormat:'mdta'}),type:'audio/mp4',extension:'.m4a'},
   {format:new b.WavOutputFormat(),type:'audio/wav',extension:'.wav'},
   {format:new b.WebMOutputFormat(),type:'audio/webm',extension:'.webm'}
  ];
  // iPhone spatial-audio videos carry an extra APAC track next to the stereo AAC mix. Tracks that cannot be
  // copied bit-for-bit are skipped; the copyable ones (the AAC mix) are kept unchanged and verified as before.
  const copyable=codec=>!!codec&&candidates.some(({format})=>format.getSupportedAudioCodecs().includes(codec));
  const skippedCodecs=codecs.filter(codec=>!copyable(codec)).map(codec=>codec||'unknown');
  let skipped=[];
  if(skippedCodecs.length&&skippedCodecs.length<codecs.length){skipped=skippedCodecs;const keep=codecs.map(copyable);audios=audios.filter((track,i)=>keep[i]);codecs=codecs.filter((codec,i)=>keep[i])}
  const selected=candidates.find(({format})=>codecs.every(codec=>codec&&format.getSupportedAudioCodecs().includes(codec))&&(audios.length===1||format.getSupportedTrackCounts().audio.max>=audios.length));
  if(!selected)throw Error('원본 음질을 유지할 수 없는 음성 형식이에요. 음원 파일로 가져와 주세요.');
  const writable=new WritableStream({
   write(chunk){check();if(buffered){buffered.write(chunk);return}let at=0;while(at<chunk.data.byteLength){const count=access.write(chunk.data.subarray(at),{at:chunk.position+at});if(!count)throw Error('음원 임시 저장 공간이 부족해요.');at+=count}},
   close(){if(!closed){if(access){access.flush();access.close()}closed=true}},
   abort(){if(!closed){if(access)access.close();closed=true}}
  });
  output=new b.Output({format:selected.format,target:new b.StreamTarget(writable,{chunked:true,chunkSize:1024*1024})});
  const recordedTag=typeof tags.raw?.['com.apple.quicktime.creationdate']==='string'?tags.raw['com.apple.quicktime.creationdate']:metadata.recordedDate;
  const rawDate=selected.extension==='.m4a'?{'com.apple.quicktime.creationdate':recordedTag,recorded_date:metadata.recordedDate}:selected.extension==='.wav'?{ICRD:metadata.recordedDate}:{DATE:metadata.recordedDate};
  output.setMetadataTags({creationTime:new Date(metadata.created),raw:rawDate});
  const pumps=[];
  for(let i=0;i<audios.length;i++){
   const track=audios[i],config=await track.getDecoderConfig();if(!config)throw Error('원본 음성 정보를 확인하지 못했어요.');
   const source=new b.EncodedAudioPacketSource(codecs[i]);
   output.addAudioTrack(source,{languageCode:await track.getLanguageCode(),name:await track.getName()||undefined,disposition:await track.getDisposition()});
   const iterator=new b.EncodedPacketSink(track).packets();iterators.push(iterator);
   pumps.push({source,iterator,config,next:await iterator.next(),done:false});
  }
  await output.start();
  const pump=async(value,until)=>{
   while(!value.next.done&&value.next.value.timestamp<until){check();await value.source.add(value.next.value,{decoderConfig:value.config});value.next=await value.iterator.next()}
   if(value.next.done&&!value.done){value.source.close();value.done=true}
  };
  for(let until=1;pumps.some(value=>!value.done);until++){check();await Promise.all(pumps.map(value=>pump(value,until)));if(until%3===0){progress('음성 추출 '+until+'초 구간 처리 중');await new Promise(resolve=>setTimeout(resolve,0))}}
  await output.finalize();check();
  const extracted=buffered?new File(buffered.parts(),id,{type:selected.type}):await handle.getFile();
  resultInput=new b.Input({source:new b.BlobSource(extracted,{maxCacheSize:4*1024*1024,useStreamReader:false}),formats:b.ALL_FORMATS});
  const resultAudios=await resultInput.getAudioTracks();if((await resultInput.getVideoTracks()).length||resultAudios.length!==audios.length)throw Error('음원 변환 결과를 확인하지 못했어요.');
  progress('추출한 음성이 원본과 같은지 확인 중…');
  let packets=0,bytes=0;
  for(let i=0;i<audios.length;i++){
   const original=audios[i],result=resultAudios[i],aConfig=await original.getDecoderConfig(),cConfig=await result.getDecoderConfig();
   if(await original.getCodec()!==await result.getCodec()||aConfig.sampleRate!==cConfig.sampleRate||aConfig.numberOfChannels!==cConfig.numberOfChannels)throw Error('원본 음성 형식이 달라 저장하지 않았어요.');
   const a=new b.EncodedPacketSink(original).packets(),c=new b.EncodedPacketSink(result).packets();iterators.push(a,c);
   while(true){
    check();const [x,y]=await Promise.all([a.next(),c.next()]);
    if(x.done||y.done){if(x.done!==y.done)throw Error('음성 길이가 달라 저장하지 않았어요.');break}
    const p=x.value,q=y.value,tolerance=1/aConfig.sampleRate+0.000001;
    if(p.data.length!==q.data.length||Math.abs(p.timestamp-q.timestamp)>tolerance||Math.abs(p.duration-q.duration)>tolerance)throw Error('음성 데이터 또는 타이밍이 달라 저장하지 않았어요.');
    for(let n=0;n<p.data.length;n++)if(p.data[n]!==q.data[n])throw Error('음질 보존 확인에 실패했어요.');
    packets++;bytes+=p.data.length;if(packets%250===0)await new Promise(resolve=>setTimeout(resolve,0));
   }
  }
  const proof={version:1,originalName:file.name,originalBytes:file.size,outputBytes:extracted.size,audioPacketCopyVerified:true,audioTracks:audios.length,audioPackets:packets,audioBytes:bytes,maximumInputRead,storageMode:buffered?'bounded-memory':'opfs',skippedAudioTracks:skipped};
  const resultFile=new File([extracted],file.name.replace(/\.[^.]+$/,'')+selected.extension,{type:selected.type,lastModified:metadata.created});
  success=true;self.postMessage({type:'done',file:resultFile,metadata:{...metadata,originalMedia:{name:file.name,type:file.type,size:file.size,created:metadata.created,recordedDate:metadata.recordedDate},audioExtraction:proof}});
 }finally{
  for(const iterator of iterators)try{await iterator.return()}catch{}
  input?.dispose();resultInput?.dispose();
  if(output&&output.state!=='finalized')try{await output.cancel()}catch{}
  if(access&&!closed)try{access.close()}catch{}
  buffered?.clear();
  if(directory&&(!success||buffered))try{await directory.removeEntry(id)}catch{}
 }
}

/* ---------- WAV → FLAC (lossless, verified sample by sample) ---------- */
async function toFlac(b,input,audios,file,metadata,progress,iterators){
 if(audios.length!==1)return null;
 const codec=await audios[0].getCodec();
 if(codec!=='pcm-s16'&&codec!=='pcm-s24')return null;
 // iPhone/iPad and Safari (WebKit) keep the WAV: FLAC playback there is not something this app can confirm.
 const webkit=/AppleWebKit/i.test(navigator.userAgent)&&!/Chrome|Chromium|Edg/i.test(navigator.userAgent)||/iPhone|iPad|iPod/i.test(navigator.userAgent);
 if(webkit)return {error:'이 브라우저(Safari)에서는 FLAC 대신 WAV 그대로 저장했어요.'};
 if(file.size>400*1024*1024)return {error:'400MB가 넘는 WAV는 그대로 저장했어요.'};
 progress('WAV를 FLAC으로 무손실 압축 중…');check();
 await import('./flac-encode.js?v=2');
 const encoded=await self.VzipFlac.encodeWav(file,{date:metadata.recordedDate,check,onProgress:value=>progress('FLAC 압축 '+Math.round(value*100)+'%')});
 if(!encoded)return null;check();
 if(encoded.blob.size>=file.size)return {error:'FLAC으로 줄어들지 않아 WAV 그대로 저장했어요.'};
 // Decode the FLAC again and compare every sample with the WAV's own integers before keeping it.
 progress('FLAC이 원본 WAV와 같은 소리인지 확인 중…');
 try{await self.VzipFlac.verify(encoded.blob,file,encoded.info,{check})}catch(error){if(error.name==='AbortError')throw error;return {error:'FLAC 확인에 실패해 WAV 그대로 저장했어요. ('+error.message+')'}}
 const flacFile=new File([encoded.blob],file.name.replace(/\.[^.]+$/,'')+'.flac',{type:'audio/flac',lastModified:metadata.created});
 const i=encoded.info;
 return {file:flacFile,proof:{version:2,codec:'flac',originalCodec:codec,originalBytes:file.size,outputBytes:flacFile.size,channels:i.channels,sampleRate:i.rate,frames:i.frames,samplesVerified:true}};
}
