/* Phase 8C: pure repertoire/performance data helpers. No audio or AI mutation. */
(function(root,factory){const api=factory();root.VzipArchive=api;if(typeof module==='object')module.exports=api})(globalThis,()=>{
'use strict';
const states={interest:'💜 관심곡',planned:'📋 연습 예정',practicing:'🎤 연습 중',ready:'⭐ 공연 가능',paused:'📦 보류'};
const skills={lyrics:'가사 암보',melody:'멜로디 숙지',breathing:'호흡·프레이징',expression:'표현·감정',overall:'전체 완성도'};
const kinds={solo:'솔로',duet:'듀엣',ensemble:'앙상블'};
const stages={preparing:'준비 중',completed:'공연 완료',cancelled:'취소'};
const text=v=>String(v??'').trim();
function check(ok,message){if(!ok)throw Error(message)}
function date(v,required=false){v=text(v);if(!v&&!required)return '';check(/^\d{4}-\d{2}-\d{2}$/.test(v),'날짜를 확인해 주세요.');const d=new Date(v+'T12:00:00Z');check(Number.isFinite(+d)&&d.toISOString().slice(0,10)===v,'존재하지 않는 날짜예요.');return v}
function repertoire(values,previous={},ownerId){
 check(ownerId,'로그인 후 저장해 주세요.');
 const r={...previous,...values,ownerId};
 check(!r.status||Object.hasOwn(states,r.status),'레퍼토리 상태를 확인해 주세요.');
 check(!r.kind||Object.hasOwn(kinds,r.kind),'곡 구분을 확인해 주세요.');
 r.skills={...previous.skills,...values.skills};
 for(const k of Object.keys(skills)){const v=r.skills[k];check(v==null||v===''||(Number.isInteger(Number(v))&&v>=1&&v<=5),'숙련도는 1~5 또는 미평가로 입력해 주세요.');if(v==null||v==='')delete r.skills[k];else r.skills[k]=Number(v)}
 for(const k of ['role','language','memo','originalKey','practiceKey','stageKey','transposeNote'])r[k]=text(r[k]);
 return r;
}
function proficiency(song){const values=Object.values(song.repertoire?.skills||{}).filter(n=>Number.isFinite(n)&&n>=1&&n<=5);return values.length?values.reduce((a,b)=>a+b,0)/values.length:null}
function performance(values,old={},ownerId){
 check(ownerId&&(!old.ownerId||old.ownerId===ownerId),'이 공연을 수정할 권한이 없어요.');
 const out={...old,...values,ownerId,title:text(values.title??old.title),start:date(values.start??old.start,true),end:date(values.end??old.end),status:values.status||old.status||'preparing'};
 check(out.title,'작품명을 입력해 주세요.');check(!out.end||out.end>=out.start,'공연 종료일을 확인해 주세요.');check(Object.hasOwn(stages,out.status),'공연 상태를 확인해 주세요.');
 for(const k of ['venue','company','role','casting','team','memo'])out[k]=text(out[k]);
 out.sessions=old.sessions||[];out.songLinks=old.songLinks||[];out.assets=old.assets||[];
 return out;
}
function session(values,siblings=[]){
 const out={...values,date:date(values.date,true),time:text(values.time),number:text(values.number),role:text(values.role),memo:text(values.memo),appeared:values.appeared===true};
 check(!out.time||/^([01]\d|2[0-3]):[0-5]\d$/.test(out.time),'시작 시간을 확인해 주세요.');
 check(!siblings.some(s=>s.id!==out.id&&s.date===out.date&&s.time===out.time&&s.number===out.number),'같은 날짜·시간·회차가 이미 있어요.');
 return out;
}
function reconcile(data){
 const songs=new Set((data.songs||[]).map(s=>s.id)),gone=new Set(data.deleted?.media||[]);
 for(const p of data.performances||[])for(const link of p.songLinks||[])if(link.songId&&!songs.has(link.songId)){link.songId='';link.unlinked=true}
 for(const s of data.songs||[])if(s.repertoire?.takeId&&gone.has(s.repertoire.takeId))s.repertoire={...s.repertoire,takeId:''};
 return data;
}
function forOwner(data,owner){
 if(!data)return data;
 const out=JSON.parse(JSON.stringify(data));
 if(out.performances)out.performances=out.performances.filter(p=>p.ownerId===owner);
 for(const s of out.songs||[])if(s.repertoire&&s.repertoire.ownerId!==owner)delete s.repertoire;
 return out;
}
function stats(list){
 const shown=list.filter(p=>p.status!=='cancelled'),attended=shown.filter(p=>(p.sessions||[]).some(s=>s.appeared));
 const roles=new Set(),songs=new Set(),years={};let sessions=0;
 for(const p of attended){const seen=new Set(),yearSet=new Set();for(const s of p.sessions||[])if(s.appeared&&!seen.has(s.id)){seen.add(s.id);sessions++;yearSet.add(s.date.slice(0,4));if(s.role||p.role)roles.add(s.role||p.role)}for(const year of yearSet)years[year]=(years[year]||0)+1;for(const l of p.songLinks||[])songs.add(l.songId||'snapshot:'+l.title+'|'+l.show)}
 return {productions:attended.length,sessions,roles:roles.size,songs:songs.size,years};
}
return {states,skills,kinds,stages,date,repertoire,performance,session,reconcile,forOwner,proficiency,stats};
});
