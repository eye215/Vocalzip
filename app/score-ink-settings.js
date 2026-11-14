/* Account-bound tool preferences only. No PDF, stroke data, URLs or login credentials.
 * Kept on this device (localStorage, one entry per account); nothing here is synced.
 * 악보 표기 presets (markers): the four built-in ones (숨표·반복·컷·시작점) keep their id and can be changed and put
 * back, never removed; the user's own are added, changed and removed. A preset only decides what the next mark looks
 * like: a mark already on a score carries its own look. Stored as {builtin:{id:changed fields}, user:[…]}. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipScoreInkSettings=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const HEX=/^#[0-9a-f]{6}$/i,PREFIX='vzip_score_ink_settings_v1:';
const PALETTES={
 pen:[['#101828','검정'],['#b42318','진한 빨강'],['#175cd3','파랑'],['#1849a9','남색'],['#067647','진한 초록'],['#5925dc','진한 보라'],['#854a0e','갈색'],['#851651','자주']],
 highlighter:[['#fef08a','파스텔 노랑'],['#fbcfe8','파스텔 분홍'],['#bae6fd','파스텔 하늘'],['#bbf7d0','파스텔 초록'],['#ddd6fe','파스텔 보라'],['#fed7aa','파스텔 주황'],['#99f6e4','파스텔 민트'],['#e9d5ff','파스텔 라일락']]
};
/* 남기는 형태: [id, name, how it is placed — 'tap' 한 번 누르기, 'drag' 따라 긋기, 'two' 시작·끝 두 번 누르기]. */
const MARK_FORMS=[['symbol','기호','tap'],['line','밑줄','drag'],['wave','물결선','drag'],['box','테두리 상자','drag'],['cover','구간 덮기','drag'],['bracket','구간 괄호','two']];
const MARK_SHAPES=[['v','브이'],['comma','쉼표'],['check','체크'],['circle','동그라미'],['dot','점'],['triangle','세모'],['star','별'],['diamond','마름모'],['text','글자']];
const MARK_INPUTS={tap:'한 번 누르기',drag:'따라 긋기',two:'시작과 끝을 차례로 누르기'};
const MARK_COLOR='#7a32f5',MARK_COLORS=[[MARK_COLOR,'보라'],...PALETTES.pen],MARK_USER_MAX=20,MARK_NAME_MAX=12,MARK_TEXT_MAX=4;
const MARKERS=[
 {id:'breath',name:'숨표',color:MARK_COLOR,width:0.006,type:'pen',form:'symbol',shape:'v'},
 {id:'repeat',name:'반복',color:MARK_COLOR,width:0.006,type:'pen',form:'bracket'},
 {id:'cut',name:'컷',color:MARK_COLOR,width:0.04,type:'highlighter',form:'cover'},
 {id:'start',name:'시작점',color:MARK_COLOR,width:0.006,type:'pen',form:'symbol',shape:'circle'}
];
const markInput=form=>MARK_FORMS.find(f=>f[0]===form)?.[2]||'tap';
/** A complete, valid marker preset from loose input, or an Error saying what to fix. */
function marker(raw){
 const name=typeof raw?.name==='string'?raw.name.trim().replace(/\s+/g,' '):'';
 if(!name||[...name].length>MARK_NAME_MAX)throw Error('표기 이름을 1~'+MARK_NAME_MAX+'자로 적어 주세요.');
 if(typeof raw.color!=='string'||!HEX.test(raw.color))throw Error('#RRGGBB 형식의 색상을 입력해 주세요.');
 if(!Number.isFinite(raw.width)||raw.width<0.001||raw.width>0.06)throw Error('굵기를 확인해 주세요.');
 if(!['pen','highlighter'].includes(raw.type))throw Error('필기구 유형을 확인해 주세요.');
 if(!MARK_FORMS.some(f=>f[0]===raw.form))throw Error('남기는 형태를 확인해 주세요.');
 const out={name,color:raw.color.toLowerCase(),width:raw.width,type:raw.type,form:raw.form};
 if(raw.form==='symbol'){
  if(!MARK_SHAPES.some(f=>f[0]===raw.shape))throw Error('기호를 골라 주세요.');
  out.shape=raw.shape;
  if(raw.shape==='text'){
   const text=typeof raw.text==='string'?raw.text.trim():'',count=[...text].length;
   if(!count||count>MARK_TEXT_MAX||/\s/.test(text))throw Error('기호로 쓸 글자를 1~'+MARK_TEXT_MAX+'자로 적어 주세요.');
   out.text=text;
  }
 }
 return out;
}
const sameMarker=(a,b)=>['name','color','width','type','form','shape','text'].every(k=>a[k]===b[k]);
function markers(stored){
 const list=MARKERS.map(m=>{
  let now=m;
  try{const patch=stored?.builtin?.[m.id];if(patch&&typeof patch==='object')now=marker({...m,...patch});}catch{}
  return {...now,id:m.id,builtin:true,changed:!sameMarker(now,m)};
 });
 const ids=new Set(list.map(m=>m.id));
 for(const raw of Array.isArray(stored?.user)?stored.user:[]){
  if(list.length>=MARKERS.length+MARK_USER_MAX)break;
  if(typeof raw?.id!=='string'||!/^[\w:-]{1,64}$/.test(raw.id)||ids.has(raw.id))continue;
  try{list.push({...marker(raw),id:raw.id,builtin:false});ids.add(raw.id);}catch{}
 }
 return list;
}
const plainMarker=({builtin,changed,id,...look})=>look;
const packMarkers=list=>({builtin:Object.fromEntries(list.filter(m=>m.builtin&&m.changed).map(m=>[m.id,plainMarker(m)])),user:list.filter(m=>!m.builtin).map(m=>({id:m.id,...plainMarker(m)}))});
const clone=x=>JSON.parse(JSON.stringify(x)),defaults=()=>({pen:{color:'#101828',width:0.004,opacity:1,recent:[],custom:[]},highlighter:{color:'#fef08a',width:0.024,opacity:0.55,recent:[],custom:[]},eraser:{size:0.018},memo:{mode:'text',color:'#fbe88c'},markers:markers(null),penOnly:false});
function create({storage,identity,defaultPenOnly=false}){
 const initial=identity(),owner=initial?.owner,session=initial?.session;
 if(!owner||!session)throw Error('로그인이 필요해요.');
 const key=PREFIX+encodeURIComponent(owner);
 const current=()=>{const now=identity();if(now?.owner!==owner||now?.session!==session)throw Error('로그인이 바뀌어 도구 설정을 중단했어요.');};
 function read(){
  current();const fallback=defaults();fallback.penOnly=defaultPenOnly===true;let data;
  try{const text=storage.getItem(key);if(!text||text.length>16000)return fallback;data=JSON.parse(text);}catch{return fallback;}
  if(data?.version!==1||data.owner!==owner)return fallback;
  for(const tool of ['pen','highlighter']){
   const p=data[tool];if(!p)continue;
   if(HEX.test(p.color||''))fallback[tool].color=p.color.toLowerCase();
   if(Number.isFinite(p.width)&&p.width>=0.001&&p.width<=0.06)fallback[tool].width=p.width;
   if(Number.isFinite(p.opacity)&&p.opacity>=0.05&&p.opacity<=1)fallback[tool].opacity=p.opacity;
   for(const name of ['recent','custom'])if(Array.isArray(p[name]))fallback[tool][name]=[...new Set(p[name].filter(c=>typeof c==='string'&&HEX.test(c)).map(c=>c.toLowerCase()))].slice(0,name==='recent'?8:24);
  }
  if(Number.isFinite(data.eraser?.size)&&data.eraser.size>=0.008&&data.eraser.size<=0.06)fallback.eraser.size=data.eraser.size;
  // 스티커 메모: the last way of writing (글자/펜) and colour, offered first next time.
  if(['text','pen'].includes(data.memo?.mode))fallback.memo.mode=data.memo.mode;
  if(typeof data.memo?.color==='string'&&HEX.test(data.memo.color))fallback.memo.color=data.memo.color.toLowerCase();
  fallback.markers=markers(data.markers);
  if(typeof data.penOnly==='boolean')fallback.penOnly=data.penOnly;return fallback;
 }
 function write(tool,patch={},options={}){
  current();const data=read();
  if(tool==='input'){data.penOnly=patch.penOnly===true;}
  else if(tool==='memo'){
   if(patch.mode!==undefined){if(!['text','pen'].includes(patch.mode))throw Error('메모 쓰는 방법을 확인해 주세요.');data.memo.mode=patch.mode;}
   if(patch.color!==undefined){if(typeof patch.color!=='string'||!HEX.test(patch.color))throw Error('#RRGGBB 형식의 색상을 입력해 주세요.');data.memo.color=patch.color.toLowerCase();}
  }
  else if(tool==='marker'){
   // {id, …look}: changes that preset, or adds a user preset under a new id. options.reset puts a built-in one back,
   // options.remove deletes a user one (marks already placed keep their own look and their `mark` id).
   const at=data.markers.findIndex(m=>m.id===patch.id),old=data.markers[at];
   if(options.reset){
    if(!old?.builtin)throw Error('기본 표기만 처음 모양으로 되돌릴 수 있어요.');
    data.markers[at]={...MARKERS.find(m=>m.id===old.id),builtin:true,changed:false};
   }else if(options.remove){
    if(!old)throw Error('이미 지운 표기예요.');
    if(old.builtin)throw Error('기본 표기는 지울 수 없어요. 모양은 바꿀 수 있어요.');
    data.markers.splice(at,1);
   }else if(old){
    const next=marker({...old,...patch});
    data.markers[at]={...next,id:old.id,builtin:old.builtin,...(old.builtin?{changed:!sameMarker(next,MARKERS.find(m=>m.id===old.id))}:{})};
   }else{
    if(typeof patch.id!=='string'||!/^[\w:-]{1,64}$/.test(patch.id))throw Error('표기를 확인해 주세요.');
    if(data.markers.filter(m=>!m.builtin).length>=MARK_USER_MAX)throw Error('직접 만든 표기는 '+MARK_USER_MAX+'개까지예요. 안 쓰는 표기를 먼저 지워 주세요.');
    data.markers.push({...marker(patch),id:patch.id,builtin:false});
   }
  }
  else if(tool==='eraser'){
   if(!Number.isFinite(patch.size)||patch.size<0.008||patch.size>0.06)throw Error('지우개 크기를 확인해 주세요.');
   data.eraser.size=patch.size;
  }
  else{
   if(!['pen','highlighter'].includes(tool))throw Error('필기 도구를 확인해 주세요.');
   const p=data[tool];
   if(patch.color!==undefined){if(typeof patch.color!=='string'||!HEX.test(patch.color))throw Error('#RRGGBB 형식의 색상을 입력해 주세요.');p.color=patch.color.toLowerCase();}
   if(patch.width!==undefined){if(!Number.isFinite(patch.width)||patch.width<0.001||patch.width>0.06)throw Error('굵기를 확인해 주세요.');p.width=patch.width;}
   if(patch.opacity!==undefined){if(!Number.isFinite(patch.opacity)||patch.opacity<0.05||patch.opacity>1)throw Error('투명도를 확인해 주세요.');p.opacity=patch.opacity;}
   if(options.custom&&!p.custom.includes(p.color)){if(p.custom.length>=24)throw Error('사용자 색상은 도구별 24개까지예요. 먼저 사용하지 않는 색상을 지워 주세요.');p.custom.push(p.color);}
   if(options.removeCustom)p.custom=p.custom.filter(c=>c!==p.color);
   if(options.recent)p.recent=[p.color,...p.recent.filter(c=>c!==p.color)].slice(0,8);
  }
  current();storage.setItem(key,JSON.stringify({version:1,owner,...data,markers:packMarkers(data.markers)}));current();return clone(data);
 }
 return {read,write,key};
}
return {create,PALETTES,defaults,MARKERS,MARK_FORMS,MARK_SHAPES,MARK_INPUTS,MARK_COLORS,MARK_USER_MAX,MARK_NAME_MAX,MARK_TEXT_MAX,markInput,marker};
});
