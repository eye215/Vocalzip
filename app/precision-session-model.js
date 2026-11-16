(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipPrecisionSession=api;})(typeof self!=='undefined'?self:globalThis,function(){
'use strict';
const VERSION='ps-1.0.0';
const GROUPS=[
 {id:'sustains',title:'편안한 아',task:'sustain',seconds:5,repeats:3,vowel:'a',guide:'편안한 음으로 아를 유지해요. 회차 사이에는 충분히 쉬어요.'},
 {id:'vowels',title:'모음별 소리',task:'vowel',seconds:3,vowels:['a','e','i','o','u'],guide:'같은 편안한 음에서 아·에·이·오·우를 각각 녹음해요.'},
 {id:'ascending',title:'편안한 상행 사이렌',task:'siren-up',seconds:6,repeats:3,vowel:'a',guide:'편안한 낮은 음에서 편안한 높은 음으로 연결해요. 최고음을 강요하지 않아요.'},
 {id:'descending',title:'편안한 하행 사이렌',task:'siren-down',seconds:6,repeats:3,vowel:'a',guide:'편안한 높은 음에서 낮은 음으로 천천히 연결해요.'},
 {id:'steady',title:'일정 음높이 유지',task:'steady',seconds:5,vowel:'a',guide:'편안한 음 하나를 일정하게 유지해요.'},
 {id:'dynamics',title:'여리게·강하게·여리게',task:'dynamic',seconds:7,vowel:'a',guide:'같은 음을 유지하며 무리하지 않는 범위에서 음량을 바꿔요.'},
 {id:'vibrato',title:'비브라토 지속음',task:'vibrato',seconds:5,vowel:'a',guide:'편안한 음에서 평소 쓰는 비브라토로 불러요. 억지로 만들지 않아요.'},
 {id:'levels',title:'세 가지 음량',task:'level',seconds:4,levels:['soft','normal','loud'],vowel:'a',guide:'같은 음을 여리게·보통·조금 강하게 각각 녹음해요. 소리를 밀지 않아요.'}
];
const copy=x=>JSON.parse(JSON.stringify(x));
function create({id,owner,targetMidi,environment='',now=Date.now()}={}){
 if(!id||!owner)throw Error('session id and owner required');if(!Number.isInteger(targetMidi)||targetMidi<36||targetMidi>84)throw Error('comfortable pitch required');
 const names={a:'아',e:'에',i:'이',o:'오',u:'우',soft:'여리게',normal:'보통',loud:'조금 강하게'};
 const tasks=[];for(const g of GROUPS){const variants=g.vowels||g.levels||Array.from({length:g.repeats||1},(_,i)=>i+1);for(const [i,v] of variants.entries())tasks.push({id:g.id+'-'+i,group:g.id,title:g.title+(g.vowels||g.levels?' · '+names[v]:variants.length>1?' · '+v+'회':''),guide:g.guide,task:g.task,seconds:g.seconds,vowel:g.vowels?v:g.vowel,loudness:g.levels?v:'normal',targetMidi,environment,state:'pending',attempts:[]});}
 return {version:VERSION,id:String(id),owner:String(owner),createdAt:now,index:0,tasks};
}
function taskOf(s,id){const t=s.tasks.find(t=>t.id===id);if(!t)throw Error('task not found');return t;}
function capture(s,id,{mediaId,revision='',duration}={}){if(!mediaId)throw Error('saved media required');const t=taskOf(s,id);t.attempts.push({mediaId:String(mediaId),revision:String(revision),duration:Number(duration)||0,result:null});t.state='captured';return t;}
function result(s,id,result,state='complete'){const t=taskOf(s,id),a=t.attempts.at(-1);if(!a)throw Error('saved media required');a.result=copy(result);a.state=state;t.state=state;return t;}
function restore(raw,owner){if(raw?.version!==VERSION||raw.owner!==owner||!Array.isArray(raw.tasks)||raw.tasks.length!==20)return null;const s=copy(raw);for(const t of s.tasks){if(!Array.isArray(t.attempts))return null;if(['recording','analyzing'].includes(t.state))t.state=t.attempts.length?'captured':'pending';}return s;}
function progress(s){return {complete:s.tasks.filter(t=>t.state==='complete').length,failed:s.tasks.filter(t=>t.state==='failed').length,total:s.tasks.length};}
function summary(s){return {kind:'precision-measurement',version:VERSION,id:s.id,owner:s.owner,progress:progress(s),practiceMinutes:null,results:s.tasks.filter(t=>t.attempts.at(-1)?.result).map(t=>({task:t.id,group:t.group,context:{task:t.task,vowel:t.vowel,targetMidi:t.targetMidi,loudness:t.loudness,environment:t.environment,owner:s.owner},...copy(t.attempts.at(-1))})),limitations:['no-physiological-diagnosis','recording-duration-not-practice-time']};}
return {VERSION,GROUPS,create,restore,capture,result,progress,summary};
});
