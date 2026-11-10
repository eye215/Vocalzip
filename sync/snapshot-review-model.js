/* Explicit field selection for snapshot recovery; never chooses content by timestamp. */
(function(root,factory){const api=factory(root.VzipDataMerge||(typeof require==='function'?require('../data-merge.js'):null));if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipSnapshotReviewModel=api;})(globalThis,Merge=>{
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x)),object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
function canonical(x){return Array.isArray(x)?x.map(canonical):object(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;}
const error=(code,message)=>Object.assign(Error(message),{code});
const labels={categories:'분류',songs:'곡',lessons:'레슨',assignments:'숙제',practices:'연습',performances:'공연',comparisonReports:'분석 기록',dailyGoals:'일일 목표',practicePlans:'연습 계획',title:'제목',name:'이름',memo:'메모',feedback:'피드백',prepMemo:'레슨 준비',date:'날짜',time:'시간',minutes:'연습 시간',manualMinutes:'직접 입력한 연습 시간',rating:'만족도',songId:'연결 곡',songIds:'연결 곡',mediaIds:'연결 녹음',recordings:'연결 녹음',status:'상태',repertoire:'레퍼토리',role:'배역',skills:'숙련도',lyrics:'가사',melody:'멜로디',breathing:'호흡',expression:'표현',overall:'완성도',originalKey:'원키',practiceKey:'연습키',stageKey:'공연키',takeId:'대표 녹음',show:'작품',deleted:'삭제 표시',updatedAt:'수정 시각',createdAt:'등록 시각',completed:'완료 여부',done:'완료 여부',checked:'수행 여부'};
function sources(review){
 const out=[{label:'이 기기',data:review.device},{label:'클라우드',data:review.cloud?.payload},{label:'이전 미완료 저장',data:review.pending?.payload}];
 (review.recoveries||[]).forEach((r,i)=>{out.push({label:'이전 확인 '+(i+1)+' · 기기',data:r.device},{label:'이전 확인 '+(i+1)+' · 클라우드',data:r.cloud?.payload},{label:'이전 확인 '+(i+1)+' · 미완료 저장',data:r.pending?.payload});});
 return out.filter(x=>x.data);
}
function plan(review){
 if(!Merge||!review||!Merge.valid(review.device))throw error('corrupt','비교할 기록 형식을 확인하지 못했어요.');
 const inputs=sources(review);if(inputs.some(x=>!Merge.valid(x.data)))throw error('corrupt','비교할 기록 형식을 확인하지 못했어요.');
 const conflicts=[];
 function node(values,path,record='전체 기록'){
  if(values.every(v=>equal(v.value,values[0].value)))return {value:copy(values[0].value)};
  if(path.at(-1)==='updatedAt'&&values.every(v=>typeof v.value==='number'&&Number.isFinite(v.value)))return {value:Math.max(...values.map(v=>v.value))};
  if(values.every(v=>object(v.value))){
   const keys=[...new Set(values.flatMap(v=>Object.keys(v.value)))];
   return {object:keys.map(k=>[k,node(values.filter(v=>Object.hasOwn(v.value,k)).map(v=>({...v,value:v.value[k]})),[...path,k],record)])};
  }
  if(values.every(v=>Array.isArray(v.value))){
   if(path[0]==='deleted')return {value:[...new Set(values.flatMap(v=>v.value))]};
   const all=values.flatMap(v=>v.value);
   if(all.length&&all.every(v=>object(v)&&v.id!=null)){
    for(const v of values){const ids=v.value.map(r=>String(r.id));if(new Set(ids).size!==ids.length)throw error('corrupt','같은 기록이 중복되어 비교를 멈췄어요. 원본은 유지돼요.');}
    const ids=[...new Set(all.map(v=>String(v.id)))];
    return {array:ids.map(id=>{
     const rows=values.filter(v=>v.value.some(r=>String(r.id)===id)).map(v=>({...v,value:v.value.find(r=>String(r.id)===id)}));
     const row=rows[0].value,name=String(row.title||row.name||row.date||row.start||'기록');
     return node(rows,[...path,'#'+id],(labels[path[0]]||'기록')+' · '+name);
    })};
   }
  }
  const id=String(conflicts.length),options=[];
  for(const v of values){let choice=options.find(o=>equal(o.value,v.value));if(choice)choice.sources.push(v.label);else options.push({id:String(options.length),sources:[v.label],value:copy(v.value)});}
  const field=path.filter(k=>!k.startsWith('#')).map(k=>labels[k]||'추가 정보').slice(1).join(' · ')||'내용';
  conflicts.push({id,record,field,options});
  return {choice:id,options};
 }
 const tree=node(inputs.map(v=>({label:v.label,value:copy(v.data)})),[]);
 function materialize(n,choices){
  if(Object.hasOwn(n,'value'))return copy(n.value);
  if(n.object)return Object.fromEntries(n.object.map(([key,value])=>[key,materialize(value,choices)]));
  if(n.array)return n.array.map(v=>materialize(v,choices));
  const selected=Object.hasOwn(choices,n.choice)?n.options.find(o=>o.id===choices[n.choice]):null;
  if(!selected)throw error('incomplete','서로 다른 내용을 모두 선택해 주세요.');
  return copy(selected.value);
 }
 return {conflicts:copy(conflicts),count:Merge.count(review.device),candidate:choices=>{
  const result=materialize(tree,choices||{});return Merge.merge(result,result).data;
 }};
}
function preserveLocal(current,approved,owner){
 if(!Merge?.valid(current)||!Merge.valid(approved)||!owner)throw error('corrupt','현재 기기의 기록을 확인하지 못했어요.');
 const next=copy(approved),foreign=(current.performances||[]).filter(p=>p.ownerId!==owner);
 const ids=new Set((next.performances||[]).map(p=>String(p.id)));
 if(foreign.some(p=>ids.has(String(p.id))))throw error('archiveConflict','다른 계정의 공연 기록과 겹쳐 저장을 멈췄어요. 이 기기의 원본은 유지돼요.');
 if(foreign.length)next.performances=[...(next.performances||[]),...copy(foreign)];
 for(const song of current.songs){
  if(!song.repertoire||song.repertoire.ownerId===owner)continue;
  const target=next.songs.find(s=>s.id===song.id);
  if(!target||target.repertoire)throw error('archiveConflict','이 기기에 남은 다른 계정의 레퍼토리를 먼저 확인해야 해요. 원본은 유지돼요.');
  target.repertoire=copy(song.repertoire);
 }
 return next;
}
function format(value,data){
 const all=data?[data.songs,data.lessons,data.assignments,data.performances].flat().filter(Boolean):[];
 function show(v,depth=0){
  if(v===null)return '내용 없음';if(v===true)return '예';if(v===false)return '아니요';
  if(typeof v==='string'){const row=all.find(r=>r.id===v);return row?(row.title||row.name||row.date||'연결된 기록'):(v||'내용 없음');}
  if(typeof v==='number')return String(v);
  if(Array.isArray(v))return v.length?v.map(x=>show(x,depth+1)).join(' · '):'없음';
  if(object(v))return Object.entries(v).filter(([k])=>!['id','ownerId','updatedAt'].includes(k)).map(([k,x])=>(labels[k]||'추가 정보')+': '+show(x,depth+1)).join(' / ')||'연결된 기록';
  return '내용 없음';
 }
 return show(value);
}
return {plan,preserveLocal,format};
});
