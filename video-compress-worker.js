/* Pinned media parser/muxer; audio is copied as encoded packets, never decoded or re-encoded. */
let stopped=false,conversion,output,access,input,decodedOutput,audioPumps=[];
const abort=()=>{if(stopped)throw new DOMException('압축을 취소했어요.','AbortError')};
self.onmessage=event=>{
 if(event.data?.type==='cancel'){stopped=true;conversion?.cancel().catch(()=>{});return}
 if(event.data?.type==='compress')run(event.data).catch(error=>self.postMessage({type:'error',name:stopped?'AbortError':error.name,message:stopped?'압축을 취소했어요.':error.message}));
};
async function run({file,id}){
 let directory,handle,closed=false,success=false;
 const progress=(value,message)=>self.postMessage({type:'progress',value,message});
 try{
  abort();
  if(typeof VideoEncoder!=='function'||typeof VideoDecoder!=='function')throw Error('이 브라우저는 영상 압축을 지원하지 않아요. 원본 업로드를 선택해 주세요.');
  directory=await (await navigator.storage.getDirectory()).getDirectoryHandle('vzip-video-temp-v1',{create:true});
  handle=await directory.getFileHandle(id,{create:true});
  if(!handle.createSyncAccessHandle)throw Error('이 브라우저는 대용량 영상 임시 저장을 지원하지 않아요.');
  access=await handle.createSyncAccessHandle();
  const b=await import('https://cdn.jsdelivr.net/npm/mediabunny@1.65.1/dist/bundles/mediabunny.min.mjs');
  abort();
  let maximumInputRead=0;
  const slice=file.slice.bind(file);
  file.arrayBuffer=()=>{throw Error('원본 전체를 메모리에 읽는 압축은 허용하지 않아요.')};
  file.slice=(...args)=>{
   const part=slice(...args);maximumInputRead=Math.max(maximumInputRead,part.size);
   if(part.size>8*1024*1024)throw Error('영상의 한 구간이 너무 커서 압축할 수 없어요. 원본 업로드를 선택해 주세요.');
   return part;
  };
  input=new b.Input({source:new b.BlobSource(file,{maxCacheSize:4*1024*1024,useStreamReader:false}),formats:b.ALL_FORMATS});
  const videos=await input.getVideoTracks(),audios=await input.getAudioTracks();
  if(videos.length!==1)throw Error('영상 트랙이 하나인 파일만 압축할 수 있어요. 원본 업로드를 선택해 주세요.');
  const track=videos[0],width=await track.getDisplayWidth(),height=await track.getDisplayHeight();
  if(!width||!height||!await track.canDecode())throw Error('이 기기에서 원본 영상을 읽을 수 없어요. 원본 업로드를 선택해 주세요.');
  const scale=Math.min(1,1280/Math.max(width,height),720/Math.min(width,height));
  const targetWidth=Math.max(2,Math.floor(width*scale/2)*2),targetHeight=Math.max(2,Math.floor(height*scale/2)*2);
  const codecSupport=await VideoEncoder.isConfigSupported({codec:'avc1.42001f',width:targetWidth,height:targetHeight,bitrate:1200000,framerate:24});
  if(!codecSupport.supported)throw Error('이 기기는 H.264 영상 압축을 지원하지 않아요. 원본 업로드를 선택해 주세요.');
  const audioCodecs=await Promise.all(audios.map(track=>track.getCodec()));
  const formats=[new b.Mp4OutputFormat({fastStart:false}),new b.MovOutputFormat({fastStart:false})];
  const format=formats.find(candidate=>audioCodecs.every(codec=>codec&&candidate.getSupportedAudioCodecs().includes(codec)));
  if(!format)throw Error('원본 음성 형식을 그대로 담을 수 없어 압축을 중단했어요.');
  let written=0;
  const writable=new WritableStream({
   write(chunk){
    abort();
    let position=0;
    while(position<chunk.data.byteLength){
     const count=access.write(chunk.data.subarray(position),{at:chunk.position+position});
     if(!count)throw Error('압축 파일을 저장할 공간이 부족해요.');
     position+=count;
    }
    written=Math.max(written,chunk.position+chunk.data.byteLength);
    if(written>=file.size)throw Error('원본보다 작아지지 않아 압축을 중단했어요. 원본 업로드를 선택해 주세요.');
   },
   close(){if(!closed){access.flush();access.close();closed=true}},
   abort(){if(!closed){access.close();closed=true}}
  });
  output=new b.Output({format,target:new b.StreamTarget(writable,{chunked:true,chunkSize:1024*1024})});
  conversion=await b.Conversion.init({
   input,output,composable:true,showWarnings:false,trim:{start:0},
   audio:{discard:true},
   video:{codec:'avc',width:targetWidth,height:targetHeight,fit:'contain',frameRate:Math.min(24,(await track.computeFrameRateMetrics()).bestGuessFrameRate||24),
    quality:new b.Quality({bitrate:1200000}),forceTranscode:true,hardwareAcceleration:'no-preference',allowTransformationMetadata:false,keyFrameInterval:2}
  });
  if(!conversion.isValid||conversion.utilizedTracks.length!==1||conversion.discardedTracks.some(x=>x.reason!=='discarded_by_user'))throw Error('이 기기의 영상 변환 설정을 지원하지 않아요.');
  for(let i=0;i<audios.length;i++){
   const track=audios[i],config=await track.getDecoderConfig();
   if(!config)throw Error('원본 음성 정보를 확인하지 못해 압축을 중단했어요.');
   const source=new b.EncodedAudioPacketSource(audioCodecs[i]);
   output.addAudioTrack(source,{languageCode:await track.getLanguageCode(),name:await track.getName()||undefined,disposition:await track.getDisposition()});
   const iterator=new b.EncodedPacketSink(track).packets();
   audioPumps.push({source,iterator,config,next:await iterator.next(),done:false});
  }
  const duration=await input.computeDuration();
  if(!Number.isFinite(duration)||duration<=0)throw Error('영상 길이를 확인할 수 없어요.');
  await output.start();
  const pumpAudio=async(pump,until)=>{
   while(!pump.next.done&&pump.next.value.timestamp<until){
    abort();await pump.source.add(pump.next.value,{decoderConfig:pump.config});
    pump.next=await pump.iterator.next();
   }
   if(pump.next.done&&!pump.done){pump.source.close();pump.done=true}
  };
  for(let until=1;conversion.state!=='done'||audioPumps.some(pump=>!pump.done);until++){
   abort();
   await Promise.all([conversion.execute({until}),...audioPumps.map(pump=>pumpAudio(pump,until))]);
   progress(Math.min(89,Math.floor(until/duration*89)),'영상 압축 중 · 음성은 원본 그대로 복사');
  }
  await output.finalize();
  abort();
  const compressed=await handle.getFile();
  if(!compressed.size||compressed.size>=file.size)throw Error('압축 효과가 없어 원본 업로드가 더 적합해요.');
  progress(90,'원본 음성과 압축 결과의 음성을 비교하는 중');
  decodedOutput=new b.Input({source:new b.BlobSource(compressed,{maxCacheSize:4*1024*1024,useStreamReader:false}),formats:b.ALL_FORMATS});
  const resultAudios=await decodedOutput.getAudioTracks();
  if(resultAudios.length!==audios.length)throw Error('음성 트랙 수가 달라 압축 결과를 사용하지 않았어요.');
  let packetCount=0,audioBytes=0;
  for(let i=0;i<audios.length;i++){
   const original=audios[i],result=resultAudios[i];
   const aConfig=await original.getDecoderConfig(),bConfig=await result.getDecoderConfig();
   if(await original.getCodec()!==await result.getCodec()||aConfig.sampleRate!==bConfig.sampleRate||aConfig.numberOfChannels!==bConfig.numberOfChannels)throw Error('원본 음성 형식이 달라 압축 결과를 사용하지 않았어요.');
   const a=new b.EncodedPacketSink(original).packets(),c=new b.EncodedPacketSink(result).packets();
   try{
    while(true){
     abort();const [x,y]=await Promise.all([a.next(),c.next()]);
     if(x.done||y.done){if(x.done!==y.done)throw Error('음성 패킷 수가 달라요.');break}
     const p=x.value,q=y.value,tolerance=1/aConfig.sampleRate+0.000001;
     if(p.data.length!==q.data.length||Math.abs(p.timestamp-q.timestamp)>tolerance||Math.abs(p.duration-q.duration)>tolerance)throw Error('음성 데이터 또는 타이밍이 달라요.');
     for(let n=0;n<p.data.length;n++)if(p.data[n]!==q.data[n])throw Error('원본 음성과 다른 데이터가 있어요.');
     packetCount++;audioBytes+=p.data.length;
     if(packetCount%250===0){progress(95,'원본 음성 데이터 확인 중');await new Promise(resolve=>setTimeout(resolve,0))}
    }
   }finally{await a.return();await c.return()}
  }
  const resultVideos=await decodedOutput.getVideoTracks();
  if(resultVideos.length!==1)throw Error('압축 영상 트랙을 확인하지 못했어요.');
  const videoEnd=await resultVideos[0].computeDuration(),sourceEnd=await track.computeDuration();
  if(Math.abs(videoEnd-sourceEnd)>.15)throw Error('영상 길이가 달라 압축 결과를 사용하지 않았어요.');
  const proof={version:1,originalName:file.name,originalBytes:file.size,outputBytes:compressed.size,audioPacketCopyVerified:true,audioTracks:audios.length,audioPackets:packetCount,audioBytes,maximumInputRead,width:targetWidth,height:targetHeight,videoBitrate:1200000};
  const resultFile=new File([compressed],file.name.replace(/\.[^.]+$/,'')+'-compressed'+format.fileExtension,{type:format.mimeType,lastModified:file.lastModified});
  abort();success=true;progress(100,'음성 원본 확인 완료');
  self.postMessage({type:'done',file:resultFile,proof});
 }finally{
  for(const pump of audioPumps){try{await pump.iterator.return()}catch{}}
  input?.dispose();decodedOutput?.dispose();
  if(output&&output.state!=='finalized')try{await output.cancel()}catch{}
  if(access&&!closed)try{access.close();closed=true}catch{}
  if(directory&&!success)try{await directory.removeEntry(id)}catch{}
 }
}
