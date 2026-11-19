/* Account-bound tool preferences only. No PDF, stroke data, URLs or login credentials.
 * Pen/highlighter/eraser/memo settings stay on this device (localStorage, one entry per account); they are not synced.
 * 악보 표기 presets (markers): the four built-in ones (숨표·반복·컷·시작점) keep their id and can be changed and put
 * back, never removed; the user's own are added, changed and removed. A preset only decides what the next mark looks
 * like: a mark already on a score carries its own look. In the device entry they are stored as {builtin:{id:changed
 * fields}, user:[…]}.
 * Presets follow the account (when create() is given getData and change, as the score viewer does): each one is a row
 * of the synced list scoreAnnotations, so data-merge.js merges it like a stroke — by id, the newer updatedAt (stamped
 * by app/core.js) wins, and a removed row leaves a tombstone that wins. A row:
 *   {id:'marker-preset:'+preset id, kind:'marker-preset', ownerId, preset:'breath'|'repeat'|'cut'|'start'|user id,
 *    look:{name, color, …}|null, createdAt}
 * A built-in preset's row is never removed: 기본값으로 되돌리기 sets look to null (a tombstone would stop the preset
 * from ever being changed again). A user preset's row is removed when it is deleted. Rows are not strokes:
 * VzipScoreInk.valid() is false for them, so every client (also older ones) skips them when showing and erasing.
 * The device entry keeps being written too (a copy for older app versions, which read only it). On a device's first
 * run with sync, migrate() copies the presets found there and not yet synced (MOVED_PREFIX marks it done).
 * 기능 (role, optional, user presets only): what the marks placed with it do once the score is matched with an MR —
 * 시작점 · 반복 구간 · 건너뛰기 (app/score-mark-model.js). The built-in 시작점 · 반복 · 컷 have theirs fixed.
 * 찍는 방식 (pick, optional): 'measure' = 마디 선택 — a tap takes a whole measure, a drag a run of measures, and the
 * mark is drawn over them (needs the score's conversion; without it the form's own way is used). For the forms in
 * MARK_PICK_FORMS; 컷 has it by default.
 * 직접 그리기 (form 'draw'): the preset carries the symbol the user drew (art, see app/score-ink-model.js artFrom) and
 * its 크기 (size 's' | 'm' | 'l'); a tap stamps it. Drawings make the stored settings larger than they used to be,
 * so up to MAX_TEXT characters are read.
 * 크기 (size) of a 기호 too: a factor of the usual size (markSize). Older versions draw a 기호 at the usual size and a
 * drawing whose size is not s | m | l at 보통 (they keep the preset; saving it there drops the factor).
 * 투명도 (opacity, optional, 0.05–1): how see-through the marks are. Without it a highlighter preset's marks have
 * Ink.MARK_OPACITY and a pen preset's 1, as before it could be set. Older app versions skip the field (marker() keeps
 * only what it knows): they still show the preset, with the default 투명도, and saving it there drops the field. */
(function(root,factory){const node=typeof module==='object'&&module.exports,api=factory(node?require('./score-ink-model.js'):root.VzipScoreInk);if(node)module.exports=api;else root.VzipScoreInkSettings=api;})(typeof window==='object'?window:globalThis,function(Ink){
'use strict';
const HEX=/^#[0-9a-f]{6}$/i,PREFIX='vzip_score_ink_settings_v1:',MAX_TEXT=600000;
/* Synced presets: rows of this list (see the top); MOVED_PREFIX + owner = this device's presets were copied up. */
const LIST='scoreAnnotations',ROW='marker-preset',ROW_PREFIX=ROW+':',MOVED_PREFIX='vzip_score_markers_moved_v1:',PRESET_ID=/^[\w:-]{1,64}$/;
const PALETTES={
 pen:[['#101828','검정'],['#b42318','진한 빨강'],['#175cd3','파랑'],['#1849a9','남색'],['#067647','진한 초록'],['#5925dc','진한 보라'],['#854a0e','갈색'],['#851651','자주']],
 highlighter:[['#fef08a','파스텔 노랑'],['#fbcfe8','파스텔 분홍'],['#bae6fd','파스텔 하늘'],['#bbf7d0','파스텔 초록'],['#ddd6fe','파스텔 보라'],['#fed7aa','파스텔 주황'],['#99f6e4','파스텔 민트'],['#e9d5ff','파스텔 라일락']]
};
/* 남기는 형태: [id, name, how it is placed — 'tap' 한 번 누르기, 'drag' 따라 긋기, 'two' 시작·끝 두 번 누르기]. */
const MARK_FORMS=[['symbol','기호','tap'],['line','밑줄','drag'],['wave','물결선','drag'],['box','테두리 상자','drag'],['cover','구간 덮기','drag'],['bracket','구간 괄호','two'],['draw','직접 그리기','tap']];
/* 크기 of a drawn symbol as it was first stored: [id, name]; how large each is on the page is Ink.ART_SIZES. Now the
 * size is a factor of the usual one (markSize below), and these three are its steps that older versions also read. */
const MARK_SIZES=[['s','작게'],['m','보통'],['l','크게']];
/** 크기 of a 기호 or 직접 그리기 preset, as stored: a factor of the usual size, Ink.MARK_SIZE_MIN–MAX in steps of 0.1.
 *  A drawing at one of the three old steps keeps its letter (s | m | l) so older versions draw it as large; a 기호 at
 *  the usual size has none (as before it could be set). Anything unreadable is the usual size. */
function markSize(form,size){
 const z=Number.isFinite(size)?Math.round(Math.max(Ink.MARK_SIZE_MIN,Math.min(Ink.MARK_SIZE_MAX,size))*10)/10:Ink.ART_SCALES[size]||1;
 if(form==='draw')return MARK_SIZES.find(([id])=>Ink.ART_SCALES[id]===z)?.[0]||z;
 return z===1?undefined:z;
}
const MARK_SHAPES=[['v','브이'],['comma','쉼표'],['check','체크'],['circle','동그라미'],['dot','점'],['triangle','세모'],['star','별'],['diamond','마름모'],['text','글자']];
const MARK_INPUTS={tap:'한 번 누르기',drag:'따라 긋기',two:'시작과 끝을 차례로 누르기',measure:'마디 선택'};
/* 마디 선택 is offered for the forms that mark a stretch. */
const MARK_PICK_FORMS=['line','box','cover','bracket'];
/* 기능: [role stored on the preset and on its marks ('' = none), name, what it does]. */
const MARK_ROLES=[['','없음','표시만 남겨요.'],['start','시작점','이 표기가 있는 마디부터 재생할 수 있어요.'],['repeat','반복 구간','표기가 걸친 마디를 반복해서 들을 수 있어요.'],['cut','건너뛰기','재생할 때 표기가 걸친 마디를 건너뛰어요.']];
const MARK_BUILTIN_ROLES={breath:'',repeat:'repeat',cut:'cut',start:'start'};
const MARK_COLOR='#7a32f5',MARK_COLORS=[[MARK_COLOR,'보라'],...PALETTES.pen],MARK_USER_MAX=20,MARK_NAME_MAX=12,MARK_TEXT_MAX=4;
const MARKERS=[
 {id:'breath',name:'숨표',color:MARK_COLOR,width:0.006,type:'pen',form:'symbol',shape:'v'},
 {id:'repeat',name:'반복',color:MARK_COLOR,width:0.006,type:'pen',form:'bracket'},
 {id:'cut',name:'컷',color:MARK_COLOR,width:0.04,type:'highlighter',form:'cover',pick:'measure'},
 {id:'start',name:'시작점',color:MARK_COLOR,width:0.006,type:'pen',form:'symbol',shape:'circle'}
];
const markInput=form=>MARK_FORMS.find(f=>f[0]===form)?.[2]||'tap';
/** How a preset is placed: 'measure' (마디 선택) when it asks for it and its form allows it, else its form's own way. */
const markWay=m=>m?.pick==='measure'&&MARK_PICK_FORMS.includes(m.form)?'measure':markInput(m?.form);
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
  const size=markSize('symbol',raw.size);if(size!==undefined)out.size=size;
 }
 if(raw.form==='draw'){
  if(!Ink.validArt(raw.art))throw Error('표기를 그려 주세요. 그린 것이 없으면 저장할 수 없어요.');
  out.art={a:raw.art.a,s:raw.art.s.map(line=>line.slice())};out.size=markSize('draw',raw.size);
 }
 // 투명도 (optional): kept to two decimals, and only when it is not what the marks have anyway (Ink.markOpacity).
 if(raw.opacity!==undefined&&raw.opacity!==null){
  if(!Number.isFinite(raw.opacity)||raw.opacity<0.05||raw.opacity>1)throw Error('투명도를 확인해 주세요.');
  const opacity=Math.round(raw.opacity*100)/100;if(opacity!==Ink.markOpacity({type:out.type}))out.opacity=opacity;
 }
 if(raw.pick==='measure'&&MARK_PICK_FORMS.includes(raw.form))out.pick='measure';
 // A role this version does not know is left out (the preset then only draws).
 if(typeof raw.role==='string'&&raw.role&&MARK_ROLES.some(r=>r[0]===raw.role))out.role=raw.role;
 return out;
}
/** What marks placed with this preset do: the built-in ones by what they are, a user preset by its `role`. */
const markerRole=m=>!m?'':m.builtin||Object.prototype.hasOwnProperty.call(MARK_BUILTIN_ROLES,m.id)?MARK_BUILTIN_ROLES[m.id]||'':m.role||'';
// 투명도 and 크기 are compared as the marks would have them, so a preset that names the default is the same as one without it.
const sameMarker=(a,b)=>['name','color','width','type','form','shape','text','pick'].every(k=>a[k]===b[k])&&Ink.markOpacity(a)===Ink.markOpacity(b)&&Ink.markSize(a)===Ink.markSize(b)&&JSON.stringify(a.art||null)===JSON.stringify(b.art||null);
const lookOnly=({role,...look})=>look;
function markers(stored){
 const list=MARKERS.map(m=>{
  let now=m;
  try{const patch=stored?.builtin?.[m.id];if(patch&&typeof patch==='object')now=lookOnly(marker({...m,...patch}));}catch{}
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
// A changed built-in whose default is 마디 선택 (컷) says its way outright, so "off" is not lost when read with the default.
const packMarkers=list=>({builtin:Object.fromEntries(list.filter(m=>m.builtin&&m.changed).map(m=>[m.id,{...plainMarker(m),...(MARKERS.find(d=>d.id===m.id)?.pick?{pick:m.pick||''}:{})}])),user:list.filter(m=>!m.builtin).map(m=>({id:m.id,...plainMarker(m)}))});
const clone=x=>JSON.parse(JSON.stringify(x)),defaults=()=>({pen:{color:'#101828',width:0.004,opacity:1,recent:[],custom:[]},highlighter:{color:'#fef08a',width:0.024,opacity:0.55,recent:[],custom:[]},eraser:{size:0.018},memo:{mode:'text',color:'#fbe88c'},goalTarget:'today',markers:markers(null),penOnly:false});
/* Synced presets (rows of LIST, see the top). */
const BUILTIN_IDS=new Set(MARKERS.map(m=>m.id));
/** What a row keeps of a preset: a user one whole; a built-in one what packMarkers keeps, or null when it is as at first. */
const rowLook=m=>m.builtin?(m.changed?packMarkers([m]).builtin[m.id]:null):plainMarker(m);
/** The preset rows of `owner` in the app record, by preset id. Rows that do not read as one are left where they are. */
function presetRows(data,owner){
 const out=new Map();
 for(const r of Array.isArray(data?.[LIST])?data[LIST]:[])
  if(r?.kind===ROW&&r.ownerId===owner&&typeof r.preset==='string'&&PRESET_ID.test(r.preset)&&r.id===ROW_PREFIX+r.preset)out.set(r.preset,r);
 return out;
}
const removedRows=data=>new Set((Array.isArray(data?.deleted?.[LIST])?data.deleted[LIST]:[]).map(String));
/** Rows as the device entry stores presets (what markers() reads): user presets in the order they were made. */
function storedFromRows(rows){
 const builtin={},user=[];
 for(const r of rows.values()){
  if(!r.look||typeof r.look!=='object'||Array.isArray(r.look))continue;
  if(BUILTIN_IDS.has(r.preset))builtin[r.preset]=r.look;else user.push({...r.look,id:r.preset,made:Number(r.createdAt)||0});
 }
 user.sort((a,b)=>a.made-b.made||(a.id<b.id?-1:a.id>b.id?1:0));
 return {builtin,user:user.map(({made,...u})=>u)};
}
/** The rows to write so the presets in a device entry (`stored`) reach the synced list. at: when this version last
 *  wrote a preset there (markersAt); 0 for older versions, which is older than any synced row. A preset synced already
 *  stays unless the device copy is newer; one deleted on any device stays deleted; at most MARK_USER_MAX user presets. */
function migration(stored,at,rows,removed,owner,now){
 const out=[];let users=[...rows.values()].filter(r=>!BUILTIN_IDS.has(r.preset)&&r.look).length;
 markers(stored).forEach((m,i)=>{
  const id=ROW_PREFIX+m.id,row=rows.get(m.id),look=rowLook(m);
  if(removed.has(id)||row&&!(at>(Number(row.updatedAt)||0)))return;
  if(!row){if(!look)return;if(!m.builtin){if(users>=MARK_USER_MAX)return;users++;}}
  out.push({...row,id,kind:ROW,ownerId:owner,preset:m.id,look,createdAt:Number(row?.createdAt)||now+i});
 });
 return out;
}
/** Puts rows into the app record `next` in place of those with the same id; a null row for an id removes it. */
function putRows(next,rows){
 if(!Array.isArray(next[LIST]))next[LIST]=[];const list=next[LIST];
 for(const [id,row] of rows){const at=list.findIndex(r=>r?.id===id);if(!row){if(at>=0)list.splice(at,1);}else if(at>=0)list[at]=row;else list.push(row);}
}
function create({storage,identity,defaultPenOnly=false,getData,change}){
 const initial=identity(),owner=initial?.owner,session=initial?.session;
 if(!owner||!session)throw Error('로그인이 필요해요.');
 const key=PREFIX+encodeURIComponent(owner);
 const current=()=>{const now=identity();if(now?.owner!==owner||now?.session!==session)throw Error('로그인이 바뀌어 도구 설정을 중단했어요.');};
 // Presets follow the account when the app record is given; without it (older callers, tests) they stay here.
 const synced=typeof getData==='function'&&typeof change==='function',movedKey=MOVED_PREFIX+encodeURIComponent(owner);
 /** This account's device entry, or null when there is none or it does not read. */
 function entry(){
  try{const text=storage.getItem(key);if(!text||text.length>MAX_TEXT)return null;const data=JSON.parse(text);return data?.version===1&&data.owner===owner?data:null;}catch{return null;}
 }
 const moved=()=>{try{return storage.getItem(movedKey)==='1';}catch{return false;}};
 const localAt=data=>Number.isFinite(data?.markersAt)?data.markersAt:0;
 /** The synced preset rows; before this device's presets were copied up, with them as the copy would put them. */
 function rows(){
  const d=getData(),out=presetRows(d,owner);
  if(!moved()){const data=entry();for(const r of migration(data?.markers,localAt(data),out,removedRows(d),owner,Date.now()))out.set(r.preset,r);}
  return out;
 }
 function read(){
  current();const fallback=defaults();fallback.penOnly=defaultPenOnly===true;const data=entry();
  if(synced)fallback.markers=markers(storedFromRows(rows()));
  if(!data)return fallback;
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
  // 목표로 넣기: where the lines went last time (오늘의 목표 or 숙제).
  if(['today','homework'].includes(data.goalTarget))fallback.goalTarget=data.goalTarget;
  if(!synced)fallback.markers=markers(data.markers);
  if(typeof data.penOnly==='boolean')fallback.penOnly=data.penOnly;return fallback;
 }
 /** First run with sync on this device: copies the presets kept here and not synced yet (see migration()) into the
  *  app record, once. The device entry is left as it is. False when the app record could not be saved. */
 function migrate(){
  current();if(!synced||moved())return true;
  const d=getData(),data=entry(),add=migration(data?.markers,localAt(data),presetRows(d,owner),removedRows(d),owner,Date.now());
  if(add.length&&!change(next=>putRows(next,add.map(r=>[r.id,r]))))return false;
  current();try{storage.setItem(movedKey,'1');}catch{} // not marked: it is tried again, and finds nothing newer to copy
  return true;
 }
 function write(tool,patch={},options={}){
  current();if(tool==='marker'&&synced&&!migrate())throw Error('표기 설정을 저장하지 못했어요. 저장 공간을 확인해 주세요.');
  const data=read();
  if(tool==='input'){data.penOnly=patch.penOnly===true;}
  else if(tool==='memo'){
   if(patch.mode!==undefined){if(!['text','pen'].includes(patch.mode))throw Error('메모 쓰는 방법을 확인해 주세요.');data.memo.mode=patch.mode;}
   if(patch.color!==undefined){if(typeof patch.color!=='string'||!HEX.test(patch.color))throw Error('#RRGGBB 형식의 색상을 입력해 주세요.');data.memo.color=patch.color.toLowerCase();}
  }
  else if(tool==='goal'){
   if(!['today','homework'].includes(patch.target))throw Error('목표를 넣을 곳을 확인해 주세요.');
   data.goalTarget=patch.target;
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
    const made=marker({...old,...patch}),next=old.builtin?lookOnly(made):made;
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
  let at=localAt(entry());
  if(tool==='marker'){
   at=Date.now();
   if(synced){
    // The preset's row in the app record (VZ.change stamps updatedAt); then the device entry, kept for older versions.
    const d=getData(),now=data.markers.find(m=>m.id===patch.id),id=ROW_PREFIX+patch.id,old=presetRows(d,owner).get(patch.id);
    if(now&&removedRows(d).has(id))throw Error('다른 기기에서 지운 표기예요.');
    const row=now?{...old,id,kind:ROW,ownerId:owner,preset:now.id,look:rowLook(now),createdAt:Number(old?.createdAt)||at}:null;
    current();if(!change(next=>putRows(next,[[id,row]])))throw Error('표기 설정을 저장하지 못했어요. 저장 공간을 확인해 주세요.');
    try{current();storage.setItem(key,JSON.stringify({version:1,owner,...data,markers:packMarkers(data.markers),markersAt:at}));}catch{}
    current();return clone(read());
   }
  }
  current();storage.setItem(key,JSON.stringify({version:1,owner,...data,markers:packMarkers(data.markers),...(at?{markersAt:at}:{})}));current();return clone(data);
 }
 return {read,write,migrate,key,movedKey};
}
return {create,PALETTES,defaults,ROW,ROW_PREFIX,MOVED_PREFIX,presetRows,migration,MARKERS,MARK_FORMS,MARK_SHAPES,MARK_INPUTS,MARK_COLORS,MARK_USER_MAX,MARK_NAME_MAX,MARK_TEXT_MAX,MARK_ROLES,MARK_BUILTIN_ROLES,MARK_PICK_FORMS,MARK_SIZES,markInput,markWay,marker,markerRole,markerOpacity:Ink.markOpacity};
});
