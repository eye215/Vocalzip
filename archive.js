/* VOCAL.zip — song growth archive v0.6 */
(()=>{'use strict';
const $=s=>document.querySelector(s),key='vocal-zip_mvp_v1';
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const read=()=>{try{return JSON.parse(localStorage.getItem(key))||{}}catch{return {}}};
const songSelect=$('#archive-song'),a=$('#archive-a'),b=$('#archive-b');
let media=[],urls=[];
const formatDate=n=>new Date(n).toLocaleDateString('ko-KR');
function dbOpen(){return new Promise((resolve,reject)=>{const req=indexedDB.open('vocalzip_media_v1',1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('recordings'))req.result.createObjectStore('recordings',{keyPath:'id'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function getMedia(){const db=await dbOpen();return new Promise((resolve,reject)=>{const tx=db.transaction('recordings','readonly'),req=tx.objectStore('recordings').getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close()})}
function setOptions(el,items,placeholder){const prev=el.value;el.replaceChildren();el.add(new Option(placeholder,''));for(const item of items)el.add(new Option(item.label,item.id));if(items.some(i=>i.id===prev))el.value=prev}
function clearPlayers(){urls.forEach(URL.revokeObjectURL);urls=[];for(const id of ['#archive-player-a','#archive-player-b'])$(id).replaceChildren()}
function play(which){const target=$(which==='a'?'#archive-player-a':'#archive-player-b'),id=(which==='a'?a:b).value;target.replaceChildren();const item=media.find(m=>m.id===id);if(!item?.blob)return;const el=document.createElement(item.type?.startsWith('video/')?'video':'audio');el.controls=true;el.playsInline=true;el.preload='metadata';el.style.width='100%';el.style.marginTop='12px';const url=URL.createObjectURL(item.blob);urls.push(url);el.src=url;target.append(el)}
function render(){const db=read(),songs=db.songs||[];const previous=songSelect.value;setOptions(songSelect,songs.map(s=>({id:s.id,label:s.title+(s.show?' — '+s.show:'')})),'곡을 선택해 주세요');if(previous&&songs.some(s=>s.id===previous))songSelect.value=previous;
const song=songs.find(s=>s.id===songSelect.value),stats=$('#archive-stats'),timeline=$('#archive-timeline');
clearPlayers();
if(!song){stats.innerHTML='';timeline.innerHTML='<div class="empty">먼저 ‘항목·곡’에서 곡을 등록한 뒤 선택해 주세요.</div>';setOptions(a,[],'녹음 없음');setOptions(b,[],'녹음 없음');return}
const lessons=(db.lessons||[]).filter(l=>l.songId===song.id);
const practices=(db.practices||[]).filter(p=>p.songId===song.id);
const recordings=media.filter(m=>m.song===song.title||m.song===(song.title+(song.show?' — '+song.show:''))||m.songId===song.id).sort((x,y)=>x.created-y.created);
stats.innerHTML='<div class="stat"><strong>'+lessons.length+'</strong><span class="muted">관련 레슨</span></div><div class="stat"><strong>'+practices.length+'</strong><span class="muted">개인 연습</span></div><div class="stat"><strong>'+recordings.length+'</strong><span class="muted">녹음·영상</span></div>';
const options=recordings.map(m=>({id:m.id,label:formatDate(m.created)+' · '+m.name}));setOptions(a,options,'이전 녹음 선택');setOptions(b,options,'최근 녹음 선택');if(recordings.length>=2){a.value=recordings[0].id;b.value=recordings[recordings.length-1].id;play('a');play('b')}else if(recordings.length===1){a.value=recordings[0].id;play('a')}
const entries=[...lessons.map(l=>({date:l.date,type:'레슨',body:'<b>선생님 피드백</b><p>'+safe(l.feedback||'피드백 없음')+'</p><p>'+safe(l.memo||'')+'</p>'})),...practices.map(p=>({date:p.date,type:'개인 연습',body:'<b>'+safe(p.minutes)+'분 연습 · 만족도 '+safe(p.rating)+'/5</b><p>'+safe(p.memo||'연습 메모 없음')+'</p>'})),...recordings.map(m=>({date:new Date(m.created).toLocaleDateString('sv-SE'),time:m.created,type:m.type?.startsWith('video/')?'영상':'녹음',body:'<b>'+safe(m.name)+'</b><p>비교 영역에서 재생할 수 있어요.</p>'}))].sort((x,y)=>x.date.localeCompare(y.date)||(x.time||0)-(y.time||0));
timeline.innerHTML=entries.length?entries.map(x=>'<article class="archive-event"><div class="archive-date">'+safe(x.date)+'</div><div class="archive-event-body"><span class="pill">'+safe(x.type)+'</span>'+x.body+'</div></article>').join(''):'<div class="empty">아직 이 곡의 기록이 없어요. 레슨이나 개인 연습을 저장해 보세요.</div>';
}
async function refresh(){try{media=await getMedia()}catch{media=[]}render()}
songSelect.addEventListener('change',render);
a.addEventListener('change',()=>{clearPlayers();play('a');play('b')});
b.addEventListener('change',()=>{clearPlayers();play('a');play('b')});
document.querySelector('button[data-tab="archive"]')?.addEventListener('click',refresh);
document.addEventListener('click',e=>{if(e.target.closest('[data-go-tab="archive"]'))setTimeout(refresh,30)});
window.addEventListener('pagehide',clearPlayers);
refresh();
})();