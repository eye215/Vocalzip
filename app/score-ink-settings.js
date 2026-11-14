/* Account-bound tool preferences only. No PDF, stroke data, URLs or login credentials. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipScoreInkSettings=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const HEX=/^#[0-9a-f]{6}$/i,PREFIX='vzip_score_ink_settings_v1:';
const PALETTES={
 pen:[['#101828','검정'],['#b42318','진한 빨강'],['#175cd3','파랑'],['#1849a9','남색'],['#067647','진한 초록'],['#5925dc','진한 보라'],['#854a0e','갈색'],['#851651','자주']],
 highlighter:[['#fef08a','파스텔 노랑'],['#fbcfe8','파스텔 분홍'],['#bae6fd','파스텔 하늘'],['#bbf7d0','파스텔 초록'],['#ddd6fe','파스텔 보라'],['#fed7aa','파스텔 주황'],['#99f6e4','파스텔 민트'],['#e9d5ff','파스텔 라일락']]
};
const clone=x=>JSON.parse(JSON.stringify(x)),defaults=()=>({pen:{color:'#101828',width:0.004,opacity:1,recent:[],custom:[]},highlighter:{color:'#fef08a',width:0.024,opacity:0.55,recent:[],custom:[]},eraser:{size:0.018},memo:{mode:'text',color:'#fbe88c'},penOnly:false});
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
  if(typeof data.penOnly==='boolean')fallback.penOnly=data.penOnly;return fallback;
 }
 function write(tool,patch={},options={}){
  current();const data=read();
  if(tool==='input'){data.penOnly=patch.penOnly===true;}
  else if(tool==='memo'){
   if(patch.mode!==undefined){if(!['text','pen'].includes(patch.mode))throw Error('메모 쓰는 방법을 확인해 주세요.');data.memo.mode=patch.mode;}
   if(patch.color!==undefined){if(typeof patch.color!=='string'||!HEX.test(patch.color))throw Error('#RRGGBB 형식의 색상을 입력해 주세요.');data.memo.color=patch.color.toLowerCase();}
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
  current();storage.setItem(key,JSON.stringify({version:1,owner,...data}));current();return clone(data);
 }
 return {read,write,key};
}
return {create,PALETTES,defaults};
});
