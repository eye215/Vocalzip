/* Additive research measurements. No I/O, storage or physiological inference.
 * Legacy pitch/vibrato/range is preserved verbatim. Spectra use the original PCM, never the 8 kHz pitch copy. */
(function(root,factory){const api=factory(typeof module==='object'&&module.exports?require('./vocal-analysis.js'):root.VzipVocalAnalysis);if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipPrecisionAcoustics=api;})(typeof self!=='undefined'?self:globalThis,function(Legacy){
'use strict';
const VERSION='pa-1.0.0';
const RULES=Object.freeze({hopSeconds:.05,windowSeconds:.064,minSeconds:.5,minConfidence:.8,minPeriodicity:.8,maxClippedShare:.001,minVoicedShare:.3,minHarmonicDb:-35,stableCents:20,perturbationSeconds:1,maxSeconds:60});
const finite=x=>typeof x==='number'&&Number.isFinite(x),mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null;
const quantile=(a,q)=>{if(!a.length)return null;const s=Array.from(a).sort((a,b)=>a-b),p=(s.length-1)*q,i=Math.floor(p);return s[i]+(s[Math.min(i+1,s.length-1)]-s[i])*(p-i);};
const median=a=>quantile(a,.5),sd=a=>a.length?Math.sqrt(mean(a.map(v=>(v-mean(a))**2))):null;
const db=x=>x>0?10*Math.log10(x):null;
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
function cacheKey({sourceId,sourceRevision,context={},sampleRate,rules={}}){return JSON.stringify(canonical({version:VERSION,sourceId,sourceRevision,context,sampleRate,rules:{...RULES,...rules}}));}
function fft(re,im,inverse=false){
 const n=re.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
 for(let len=2;len<=n;len<<=1){const angle=(inverse?2:-2)*Math.PI/len,cr=Math.cos(angle),ci=Math.sin(angle);for(let i=0;i<n;i+=len){let wr=1,wi=0;for(let j=0;j<len/2;j++){const a=i+j,b=a+len/2,tr=wr*re[b]-wi*im[b],ti=wr*im[b]+wi*re[b];re[b]=re[a]-tr;im[b]=im[a]-ti;re[a]+=tr;im[a]+=ti;const next=wr*cr-wi*ci;wi=wr*ci+wi*cr;wr=next;}}}
 if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n;}
}
function spectrum(x,rate){
 let n=1;while(n<x.length*2)n*=2;const re=new Float64Array(n),im=new Float64Array(n),center=mean(Array.from(x))||0;
 for(let i=0;i<x.length;i++)re[i]=(x[i]-center)*(.5-.5*Math.cos(2*Math.PI*i/(x.length-1)));
 fft(re,im);const power=Float64Array.from({length:n/2+1},(_,k)=>re[k]**2+im[k]**2);
 return {power,binHz:rate/n,n,rate};
}
function band(s,lo,hi){let sum=0;for(let k=Math.max(1,Math.ceil(lo/s.binHz));k<s.power.length&&k*s.binHz<hi;k++)sum+=s.power[k];return sum;}
function regression(xs,ys){const xm=mean(xs),ym=mean(ys);let den=0,num=0;for(let i=0;i<xs.length;i++){den+=(xs[i]-xm)**2;num+=(xs[i]-xm)*(ys[i]-ym);}return {slope:den?num/den:0,intercept:den?ym-num/den*xm:ym};}
function spectral(s){
 let sum=0,weighted=0;for(let k=1;k<s.power.length;k++){sum+=s.power[k];weighted+=k*s.binHz*s.power[k];}
 let cumulative=0,rolloff=null;for(let k=1;k<s.power.length;k++){cumulative+=s.power[k];if(cumulative>=.85*sum){rolloff=k*s.binHz;break;}}
 const xs=[],ys=[];for(let hz=125;hz*2<=s.rate/2;hz*=2){const e=band(s,hz,hz*2);if(e>1e-12){xs.push(Math.log2(hz));ys.push(db(e));}}
 const low=band(s,50,1000),high=band(s,1000,5000);
 return {centroid:sum>1e-12?weighted/sum:null,rolloff:sum>1e-12?rolloff:null,tilt:xs.length>=3?regression(xs,ys).slope:null,alpha:low>1e-12&&high>1e-12?db(high/low):null,
  bandEnergy:[band(s,50,500),band(s,500,1000),band(s,1000,2000),band(s,2000,4000)].map(v=>sum>1e-12?v/sum:null)};
}
function harmonic(s,f0,h){
 const hz=f0*h;if(hz>=s.rate/2)return null;const center=Math.round(hz/s.binHz),radius=Math.max(1,Math.floor(f0*.12/s.binHz));let max=0;
 for(let k=Math.max(1,center-radius);k<=Math.min(center+radius,s.power.length-1);k++)max=Math.max(max,s.power[k]);return max;
}
function periodicity(x,rate,f0){
 if(!(f0>0))return null;const lag=rate/f0,center=mean(Array.from(x))||0;let cross=0,a=0,b=0;
 for(let i=0;i+Math.ceil(lag)<x.length;i++){const at=i+lag,k=Math.floor(at),v=x[i]-center,w=x[k]+(x[k+1]-x[k])*(at-k)-center;cross+=v*w;a+=v*v;b+=w*w;}
 return a*b>1e-20?Math.max(0,Math.min(.999999,cross/Math.sqrt(a*b))):null;
}
/* Real cepstrum of ln magnitude, peak above an OLS quefrency baseline (1–16 ms).
 * This is NOT Praat CPPS or dB CPP. Its algorithm-defined unit is stored and cannot be mixed with those. */
function cepstralProminence(s,f0){
 if(!(f0>0))return null;const re=new Float64Array(s.n),im=new Float64Array(s.n),peak=Math.max(...s.power);
 if(!(peak>1e-12))return null;
 for(let k=0;k<=s.n/2;k++){const v=.5*Math.log(Math.max(s.power[k],peak*1e-12));re[k]=v;if(k&&k<s.n/2)re[s.n-k]=v;}
 fft(re,im,true);const lo=Math.ceil(s.rate/f0*.85),hi=Math.min(re.length/2,Math.floor(s.rate/f0*1.15));let at=lo;
 for(let i=lo;i<=hi;i++)if(re[i]>re[at])at=i;
 const xs=[],ys=[];for(let q=Math.ceil(.001*s.rate);q<=Math.floor(.016*s.rate);q++)if(q<lo||q>hi){xs.push(q/s.rate);ys.push(re[q]);}
 if(xs.length<3)return null;const line=regression(xs,ys);return Math.max(0,re[at]-(line.intercept+line.slope*at/s.rate));
}
const units={f0:'Hz',rms:'dBFS',centroid:'Hz',rolloff:'Hz',tilt:'dB/octave',alpha:'dB',h1h2:'dB (uncorrected)',hnr:'dB',cpp:'log-amplitude cepstral units',jitter:'%',shimmer:'%',aperiodic:'ratio',stability:'cent',drift:'cent/s',loudnessConsistency:'dB',sustainDuration:'s'};
function metric(value,unit,confidence='medium',reasons=[],algorithm=''){return {value:finite(value)?value:null,unit,confidence:finite(value)?confidence:'withheld',reasons:[...new Set(reasons)],algorithm};}
function perturbation(samples,rate,frames,context,rules,clean){
 const reasons=[];if(!clean)reasons.push('source-not-clean');if(!['sustain','steady'].includes(context.task))reasons.push('sustained-task-required');
 // Longest contiguous voiced run. Never join across silence or across changing pitches.
 let run=[],best=[];for(const f of frames){if(f.f0&&f.trusted&&(!run.length||Math.abs(1200*Math.log2(f.f0/run[0].f0))<=rules.stableCents)){run.push(f);}else{if(run.length>best.length)best=run;run=f.f0&&f.trusted?[f]:[];}}if(run.length>best.length)best=run;
 if(best.length*rules.hopSeconds<rules.perturbationSeconds)reasons.push('stable-segment-too-short');
 if(reasons.length)return {jitter:metric(null,'%','withheld',reasons),shimmer:metric(null,'%','withheld',reasons)};
 const start=Math.ceil((best[0].t+.02)*rate),end=Math.min(samples.length-1,Math.floor((best.at(-1).t-.02)*rate)),crossings=[];
 // Upward zero crossings with fractional-sample interpolation; reject extra crossings/noisy cycles.
 for(let i=start;i<end;i++)if(samples[i]<=0&&samples[i+1]>0)crossings.push(i-samples[i]/(samples[i+1]-samples[i]));
 const periods=[],amps=[],expected=rate/median(best.map(f=>f.f0));
 for(let i=1;i<crossings.length;i++){const p=crossings[i]-crossings[i-1];if(p<expected*.8||p>expected*1.2){reasons.push('ambiguous-cycles');break;}let lo=Infinity,hi=-Infinity;for(let k=Math.ceil(crossings[i-1]);k<crossings[i];k++){lo=Math.min(lo,samples[k]);hi=Math.max(hi,samples[k]);}periods.push(p);amps.push(hi-lo);}
 if(periods.length<20)reasons.push('few-cycles');
 const local=a=>mean(a.slice(1).map((v,i)=>Math.abs(v-a[i])))/mean(a)*100;
 return {jitter:metric(reasons.length?null:local(periods),'%','medium',reasons,'cycle-zero-crossing-local'),shimmer:metric(reasons.length?null:local(amps),'%','medium',reasons,'cycle-peak-to-peak-local')};
}
function analyze(samples,sampleRate,options={}){
 const rules={...RULES,...options.rules},maxSeconds=options.maxSeconds??rules.maxSeconds;
 if(!samples||!Number.isInteger(samples.length)||Array.from(samples).some(x=>!finite(x)))throw Error('finite mono PCM required');
 if(!finite(sampleRate)||sampleRate<8000||sampleRate>96000)throw Error('unsupported sample rate');
 if(samples.length/sampleRate>maxSeconds)throw Error('duration limit exceeded; analyze explicit segments');
 const abort=()=>{if(options.aborted?.())throw Error('analysis cancelled');};abort();
 const started=Date.now(),seconds=samples.length/sampleRate,context={...options.context,source:options.context?.source||'unknown'};
 if(!Legacy?.analyze)throw Error('legacy pitch engine required');
 const legacy=options.baseAnalysis||Legacy.analyze(samples,sampleRate,{onProgress:p=>{abort();options.onProgress?.(p*.6);}});
 const frames=[],win=Math.round(sampleRate*rules.windowSeconds),hop=Math.round(sampleRate*rules.hopSeconds),clean=context.source==='clean';
 let clipped=0,energy=0;for(const v of samples){if(Math.abs(v)>=.999)clipped++;energy+=v*v;}
 const clippedShare=samples.length?clipped/samples.length:0;
 for(let at=0;at+win<=samples.length;at+=hop){
  abort();const t=(at+win/2)/sampleRate,index=Math.floor(t*(legacy.fps||20)),c=legacy.curve?.[index];
  const f0=finite(c)?440*2**((c-6900)/1200):null,x=samples.subarray? samples.subarray(at,at+win):samples.slice(at,at+win),s=spectrum(x,sampleRate),spec=spectral(s),p=periodicity(x,sampleRate,f0),rms=db(mean(Array.from(x,v=>v*v)));
  const trusted=clean&&clippedShare<=rules.maxClippedShare&&rms>-65&&p>=rules.minPeriodicity&&Number(legacy.confidence?.pitchConfidence)>=rules.minConfidence;
  const h1=f0?harmonic(s,f0,1):null,h2=f0?harmonic(s,f0,2):null,max=Math.max(...s.power),harmonics=Array.from({length:8},(_,h)=>f0?harmonic(s,f0,h+1):null);
  const ratio=trusted&&h1>max*10**(rules.minHarmonicDb/10)&&h2>max*10**(rules.minHarmonicDb/10)?db(h1/h2):null;
  frames.push({t,f0,rms,...spec,periodicity:p,trusted,h1h2:ratio,hnr:trusted&&p>0?db(p/(1-p)):null,cpp:trusted?cepstralProminence(s,f0):null,harmonics:trusted?harmonics.map(v=>v!=null&&max>0?v/max:null):[],
   spectralSlice:frames.length%4===0?Array.from({length:64},(_,i)=>db(band(s,i*sampleRate/128,(i+1)*sampleRate/128))):null});
 }
 const voiced=frames.filter(f=>f.f0),valid=frames.filter(f=>f.trusted),reasons=[];
 if(seconds<rules.minSeconds)reasons.push('too-short');if(energy<=1e-12)reasons.push('silence');if(clippedShare>rules.maxClippedShare)reasons.push('clipping');
 if(voiced.length/Math.max(1,frames.length)<rules.minVoicedShare)reasons.push('few-voiced-frames');if(!clean)reasons.push('source-not-clean');
 if(Number(legacy.confidence?.pitchConfidence)<rules.minConfidence)reasons.push('low-pitch-confidence');
 const quality={state:reasons.length?'withheld':valid.length/Math.max(1,frames.length)>.8?'high':'low',reasons,clippedShare,voicedShare:voiced.length/Math.max(1,frames.length),validShare:valid.length/Math.max(1,frames.length),pitchConfidence:legacy.confidence?.pitchConfidence??null,snrDb:null,snrReason:'noise-reference-not-provided'};
 const metrics={},overallHold=seconds<rules.minSeconds||energy<=1e-12;
 for(const k of ['f0','rms','centroid','rolloff','tilt','alpha','h1h2','hnr','cpp']){
  const isolated=['h1h2','hnr','cpp'].includes(k),rows=isolated?valid:frames,values=rows.map(f=>f[k]).filter(finite),why=overallHold?['too-short-or-silent']:isolated?reasons:[];
  metrics[k]=metric(why.length?null:median(values),units[k],isolated?'medium':'medium',values.length?why:[...why,'insufficient-evidence'],k==='cpp'?'real-cepstrum-lnmag-baseline-v1':k==='hnr'?'normalized-lag-correlation-v1':k==='h1h2'?'hann-peak-uncorrected-v1':'hann-power-spectrum-v1');
 }
 const stable=legacy.metrics?.stability;
 metrics.stability=metric(stable?.wobbleCents,'cent','medium',stable?[]:['no-stable-notes'],'legacy-v2');
 const phrases=[],gaps=[];let phrase=null;
 for(const f of frames){if(f.f0){if(!phrase)phrase={start:f.t,frames:[]};phrase.frames.push(f);phrase.end=f.t+rules.hopSeconds;}else if(phrase){phrases.push(phrase);phrase=null;}}if(phrase)phrases.push(phrase);
 for(let i=1;i<phrases.length;i++)gaps.push({start:phrases[i-1].end,end:phrases[i].start,label:'unvoiced-pause-candidate'});
 const phraseRows=phrases.filter(p=>p.end-p.start>=.3).map(p=>{const tail=p.frames.slice(-Math.max(1,Math.floor(p.frames.length*.25))),head=p.frames.slice(0,Math.max(1,Math.floor(p.frames.length*.25)));return {start:p.start,end:p.end,duration:p.end-p.start,tailPitchCents:1200*Math.log2(median(tail.map(f=>f.f0))/median(head.map(f=>f.f0))),tailEnergyDb:median(tail.map(f=>f.rms))-median(head.map(f=>f.rms))};});
 const pitch=voiced.map(f=>1200*Math.log2(f.f0/440)),times=voiced.map(f=>f.t);
 metrics.drift=metric(pitch.length>=3?regression(times,pitch).slope:null,'cent/s','medium',[],'ols-voiced-pitch');
 metrics.loudnessConsistency=metric(voiced.length>=3?sd(voiced.map(f=>f.rms)):null,'dB','medium',[],'voiced-rms-sd');
 metrics.sustainDuration=metric(phraseRows.length?Math.max(...phraseRows.map(p=>p.duration)):null,'s','medium',[],'contiguous-voicing');
 Object.assign(metrics,perturbation(samples,sampleRate,frames,context,rules,clean&&!reasons.length));
 options.onProgress?.(1);
 return {kind:'precision-acoustics',schemaVersion:1,engineVersion:VERSION,analyzedAt:new Date().toISOString(),source:{id:String(options.sourceId||''),revision:String(options.sourceRevision||''),sampleRate,seconds},context,parameters:rules,
  algorithms:{pitch:'legacy-harmonic-octave-continuity-v2',spectrum:'Hann zero-padded radix-2 FFT power',hnr:'10log10(r/(1-r)), fractional-lag normalized correlation',cpp:'real cepstrum ln magnitude, OLS baseline 1–16 ms',h1h2:'uncorrected harmonic-peak power ratio',jitter:'local fractional zero-crossing periods',shimmer:'local cycle peak-to-peak amplitudes'},
  scope:options.scope||{start:0,end:seconds},quality,metrics,frames,phrases:phraseRows,pauseCandidates:gaps,legacy:{version:legacy.version,metrics:JSON.parse(JSON.stringify(legacy.metrics)),confidence:JSON.parse(JSON.stringify(legacy.confidence))},
  limitations:[...new Set([...reasons,'uncalibrated-research-algorithms','h1h2-not-formant-corrected','cpp-not-praat-cpps','no-physiological-inference',...(sampleRate<16000?['limited-spectral-bandwidth']:[]),...(context.source==='separated'?['separation-artifacts-unquantified']:[])])],cost:{elapsedMs:Date.now()-started,paidCalls:0}};
}
return {VERSION,RULES,analyze,cacheKey,metric,fft,spectrum,spectral,band,regression,mean,median,quantile,sd};
});
