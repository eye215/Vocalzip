(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipPrecisionReport=api;})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
const VERSION='report-1.0.0',LABELS={f0:'기본 주파수',rms:'상대 음량',centroid:'스펙트럼 중심',rolloff:'스펙트럼 롤오프',tilt:'스펙트럼 기울기',alpha:'알파 비율',h1h2:'H1-H2 · 보정 전',hnr:'HNR',cpp:'케프스트럼 prominence',jitter:'Jitter',shimmer:'Shimmer',stability:'음정 안정성',drift:'음정 이동',loudnessConsistency:'상대 음량 변동',sustainDuration:'연속 유성음 길이'};
const SECTIONS=['overview','range','transition','resonance','stability','comparison','practice','training'];
const finite=x=>typeof x==='number'&&Number.isFinite(x),usable=m=>finite(m?.value)&&['high','medium'].includes(m.confidence);
const stable=x=>JSON.stringify(x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x);
function compare(a={},b={}){
 const ca=a.context||{},cb=b.context||{},reasons=[];
 if(!a.engineVersion||a.engineVersion!==b.engineVersion)reasons.push('version-mismatch');
 for(const k of ['owner','task','vowel','environment','loudness'])if(!ca[k]||!cb[k]||ca[k]!==cb[k])reasons.push(k+'-mismatch-or-missing');
 if(ca.source!=='clean'||cb.source!=='clean')reasons.push('source-not-clean');
 if(stable(a.parameters)!==stable(b.parameters))reasons.push('parameters-mismatch');
 if(!a.scope||!b.scope||Math.abs(a.scope.start-b.scope.start)>.05||Math.abs((a.scope.end-a.scope.start)-(b.scope.end-b.scope.start))>Math.max(.2,(a.scope.end-a.scope.start)*.2))reasons.push('scope-mismatch');
 const ap=a.metrics?.f0,bp=b.metrics?.f0,al=a.metrics?.rms,bl=b.metrics?.rms;
 if(!usable(ap)||!usable(bp)||Math.abs(1200*Math.log2(ap.value/bp.value))>100)reasons.push('pitch-mismatch-or-missing');
 if(!usable(al)||!usable(bl)||Math.abs(al.value-bl.value)>3)reasons.push('level-mismatch-or-missing');
 const metrics={};for(const k of Object.keys(LABELS)){const x=a.metrics?.[k],y=b.metrics?.[k],ok=!reasons.length&&usable(x)&&usable(y)&&x.unit===y.unit;metrics[k]={before:usable(x)?x.value:null,after:usable(y)?y.value:null,delta:ok?y.value-x.value:null,unit:y?.unit||x?.unit||'',state:ok?'measured':'withheld'};}
 return {state:reasons.length?'withheld':'comparable',reasons,metrics,judgement:null};
}
function trend(results,key){
 const dateOf=r=>r.recordedDate||r.analyzedAt?.slice(0,10);
 const unique=[...new Map(results.filter(r=>r.source?.revision&&usable(r.metrics?.[key])&&/^\d{4}-\d{2}-\d{2}$/.test(dateOf(r))).map(r=>[r.source.id+':'+r.source.revision,r])).values()].sort((a,b)=>dateOf(a).localeCompare(dateOf(b)));
 if(unique.length<3)return {state:'withheld',reason:'three-comparable-dates-required',judgement:null};
 const last=unique.at(-1),same=unique.filter(r=>r===last||compare(r,last).state==='comparable'),dates=new Set(same.map(dateOf));
 if(dates.size<3)return {state:'withheld',reason:'three-comparable-dates-required',judgement:null};
 const slopes=[];for(let i=0;i<same.length;i++)for(let j=i+1;j<same.length;j++){const days=(Date.parse(dateOf(same[j]))-Date.parse(dateOf(same[i])))/86400000;if(days>0)slopes.push((same[j].metrics[key].value-same[i].metrics[key].value)/days);}
 slopes.sort((a,b)=>a-b);const middle=slopes.length>>1;
 return {state:'measured',count:same.length,dates:dates.size,slopePerDay:slopes.length%2?slopes[middle]:(slopes[middle-1]+slopes[middle])/2,unit:same[0].metrics[key].unit,judgement:null,points:same.map(r=>({date:dateOf(r),value:r.metrics[key].value})),limitations:['trend-not-physiological-improvement']};
}
function evidence(current={},previous=null){
 const measurements=Object.entries(current.metrics||{}).filter(([k,m])=>Object.hasOwn(LABELS,k)&&usable(m)).map(([key,m])=>({key,value:m.value,unit:String(m.unit).slice(0,64),confidence:m.confidence}));
 const pair=previous?compare(previous,current):{state:'withheld',reasons:['no-comparable-previous-result'],metrics:{}};
 return {schemaVersion:1,engineVersion:String(current.engineVersion||'unknown'),measurements,
  comparison:{state:pair.state,reasons:pair.reasons,changes:Object.entries(pair.metrics).filter(([k,m])=>Object.hasOwn(LABELS,k)&&finite(m.delta)).map(([key,m])=>({key,before:m.before,after:m.after,delta:m.delta,unit:m.unit}))},
  conditions:{task:['sustain','vowel','siren-up','siren-down','steady','dynamic','vibrato','level','song'].includes(current.context?.task)?current.context.task:'unknown',vowel:['a','e','i','o','u'].includes(current.context?.vowel)?current.context.vowel:'unknown',source:['clean','mixed','separated'].includes(current.context?.source)?current.context.source:'unknown'},
  limitations:[...new Set(['acoustic-only','not-a-diagnosis',...(current.limitations||[]).filter(x=>/^[a-z-]+$/.test(x))])].slice(0,20),
  transitionCandidates:(current.transitions?.candidates||[]).slice(0,8).map(c=>({t:c.t,pitchHz:c.pitchHz,confidence:c.confidence,changes:c.changes.map(x=>({metric:x.metric,delta:x.delta,unit:x.unit}))}))};
}
function validateAI(output,payload){
 if(!Array.isArray(output?.sections)||!output.sections.length||output.sections.length>8)throw Error('unsafe AI format');
 const keys=new Set(payload.measurements.map(m=>m.key));
 const sections=output.sections.map(s=>{if(!SECTIONS.includes(s.section)||typeof s.text!=='string'||!s.text.trim()||s.text.length>500||/[0-9%]|성대|근육|점막|후두|질환|진단|접촉률|활성도|TA|CT|M1|M2|효율.*(?:향상|높|낮)|완전히.*닫/i.test(s.text))throw Error('unsafe AI claim');if(!Array.isArray(s.evidence)||!s.evidence.length||s.evidence.some(k=>!keys.has(k)))throw Error('unknown AI evidence');return {section:s.section,text:s.text.trim(),evidence:[...new Set(s.evidence)]};});
 return {version:VERSION,sections,limitations:['AI-text-reviewed-against-measured-keys','no-audio-sent']};
}
function periods(results,{period='month',today='9999-12-31',songId=null,task=null}={}){
 const groups=new Map(),seen=new Set();
 for(const r of results){const date=r.recordedDate;if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date>today||songId!==null&&r.songId!==songId||task!==null&&r.context?.task!==task)continue;
  const id=r.source?.id+':'+r.source?.revision;if(seen.has(id))continue;seen.add(id);
  let key=date.slice(0,7);if(period==='week'){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));key=d.toISOString().slice(0,10);}
  const cohorts=groups.get(key)||[];let cohort=cohorts.find(c=>compare(c[0],r).state==='comparable');if(!cohort){cohort=[];cohorts.push(cohort);}cohort.push(r);groups.set(key,cohorts);
 }
 return [...groups].sort(([a],[b])=>a.localeCompare(b)).map(([period,cohorts])=>({period,cohorts:cohorts.map(c=>({context:c[0].context,count:c.length,metrics:Object.fromEntries(Object.keys(LABELS).map(k=>{const v=c.map(r=>r.metrics?.[k]).filter(usable);return [k,{mean:v.length?v.reduce((n,m)=>n+m.value,0)/v.length:null,unit:v[0]?.unit||'',count:v.length}];})),judgement:null}))}));
}
return {VERSION,LABELS,SECTIONS,usable,compare,trend,periods,evidence,validateAI};
});
