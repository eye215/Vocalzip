/* VOCAL.zip: range-backed 30s STT excerpt for R2 audio, without Cloudflare video-only
 * Media Transformations. The original file remains untouched in R2.
 * Mediabunny performs sparse HTTP Range reads and decodes only the requested audio segment.
 * Can handle audio-only M4A/AAC, MP3, WAV, FLAC, and supported WebM/other codecs;
 * actual decoding depends on browser support. Never falls back to downloading full files. */
const RATE = 16000;
const SECONDS = 30;
const MAX_FRAMES = RATE * SECONDS;

export function writeWav16(samples, rate=RATE) {
  if (!(samples instanceof Int16Array) || samples.length<rate*2 || samples.length>rate*SECONDS)
    throw Error('분석 구간 길이를 확인할 수 없어요.');
  const bytes=new ArrayBuffer(44+samples.length*2),v=new DataView(bytes);
  const ascii=(p,s)=>{for(let i=0;i<s.length;i++)v.setUint8(p+i,s.charCodeAt(i))};
  ascii(0,'RIFF');v.setUint32(4,36+samples.length*2,true);
  ascii(8,'WAVE');ascii(12,'fmt ');v.setUint32(16,16,true);
  v.setUint16(20,1,true);v.setUint16(22,1,true);
  v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);
  v.setUint16(32,2,true);v.setUint16(34,16,true);
  ascii(36,'data');v.setUint32(40,samples.length*2,true);
  new Int16Array(bytes,44).set(samples);
  return new Blob([bytes],{type:'audio/wav'});
}
export function encodeBufferRange(pcm,buffer,bufferTimestamp,clipStart,firstIndex=0,rate=RATE) {
  const sourceRate=buffer.sampleRate,channels=Math.min(2,buffer.numberOfChannels);
  if(!Number.isFinite(sourceRate)||sourceRate<=0||!channels)return firstIndex;
  const data=Array.from({length:channels},(_,i)=>buffer.getChannelData(i));
  const first=Math.max(firstIndex,Math.ceil((bufferTimestamp-clipStart)*rate));
  const last=Math.min(pcm.length,Math.ceil((bufferTimestamp+buffer.length/sourceRate-clipStart)*rate));
  for(let i=first;i<last;i++){
    const pos=(clipStart+i/rate-bufferTimestamp)*sourceRate;
    const j=Math.max(0,Math.min(buffer.length-1,Math.floor(pos)));
    const k=Math.min(buffer.length-1,j+1),f=Math.min(1,Math.max(0,pos-j));
    let s=0;for(let c=0;c<channels;c++)s+=(data[c][j]*(1-f)+data[c][k]*f)/channels;
    s=Math.max(-1,Math.min(1,s));
    pcm[i]=Math.round(s<0?s*32768:s*32767);
  }
  return Math.max(firstIndex,last);
}

const SEARCH_SECONDS = 120;
/** Fetch only the R2 byte ranges for [time, time+seconds) and return it as 16 kHz mono PCM16.
 * Used to look for the singing (up to 2 minutes) before choosing the 30 seconds that are paid for. */
export async function extractR2AudioPcm(sourceUrl,{time=0,seconds=SEARCH_SECONDS,signal,media}={}) {
  if(!Number.isInteger(time)||time<0||!(seconds>=2&&seconds<=SEARCH_SECONDS))throw Error('잘못된 추출 구간이에요.');
  if(!sourceUrl || !/^https:\/\//.test(sourceUrl))throw Error('R2 음원 링크를 확인해 주세요.');
  if(signal?.aborted)throw new DOMException('분석 중단','AbortError');
  const b=media || await import('https://cdn.jsdelivr.net/npm/mediabunny@1.65.1/dist/bundles/mediabunny.min.mjs');
  let input; let onAbort;
  try{
    input=new b.Input({source:new b.UrlSource(sourceUrl),formats:b.ALL_FORMATS});
    onAbort=()=>input.dispose();
    signal?.addEventListener('abort',onAbort,{once:true});
    const track=await input.getPrimaryAudioTrack();
    if(!track||!(await track.canDecode()))throw Error('이 브라우저에서는 해당 오디오 코덱을 재생·분석할 수 없어요.');
    const length=await track.computeDuration();
    if(!Number.isFinite(length)||length<2)throw Error('분석할 수 있는 음성이 2초 미만이에요.');
    const start=Math.max(0,Math.min(time,length-seconds));
    const end=Math.min(length,start+seconds);
    const frames=Math.min(RATE*seconds,Math.floor((end-start)*RATE));
    const pcm=new Int16Array(frames),sink=new b.AudioBufferSink(track);
    let last=0;
    for await(const part of sink.buffers(start,end)){
      if(signal?.aborted)throw new DOMException('분석 중단','AbortError');
      last=encodeBufferRange(pcm,part.buffer,part.timestamp,start,last);
      if(last>=frames)break;
    }
    if(last<Math.min(frames,2*RATE))throw Error('오디오 구간을 충분히 추출하지 못했어요.');
    return {pcm:pcm.subarray(0,last),start,duration:length,rate:RATE};
  } finally {
    signal?.removeEventListener('abort',onAbort);
    try{input?.dispose()}catch{}
  }
}
/** The 30 seconds starting at `offset` (seconds into pcm) as a WAV file. */
export function clipFromPcm(pcm,offset=0,name='vocalzip-stt-clip.wav') {
  const from=Math.max(0,Math.min(pcm.length-2*RATE,Math.round(offset*RATE)));
  return new File([writeWav16(pcm.slice(from,from+MAX_FRAMES))],name,{type:'audio/wav'});
}
/** Fetch only the required R2 media ranges; output exactly the decoded excerpt as 16k mono WAV. */
export async function extractR2AudioClip(sourceUrl,{time=20,duration=30,signal,media}={}) {
  if(duration!==SECONDS||!Number.isInteger(time)||time<0)throw Error('잘못된 추출 구간이에요.');
  const {pcm}=await extractR2AudioPcm(sourceUrl,{time,seconds:SECONDS,signal,media});
  return clipFromPcm(pcm,0);
}
