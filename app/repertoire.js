/* Phase 8C UI: integrated with existing songs; independent sheets and performance routes. */
(()=>{
'use strict';
const V=window.VZ,A=window.VzipArchive,M=V.media,E=V.esc,Keys=window.VzipSongKeys;
// Before sign-in is confirmed (app just opened, offline) the account this device last synced with is used.
const owner=()=>window.vzipCloudUserId?.()||(()=>{try{return localStorage.getItem('vzip_cloud_linked_user')||''}catch{return ''}})();
const mine=p=>p.ownerId===owner()&&!!owner();
const shows=()=> (V.db.performances||[]).filter(mine);
const get=id=>shows().find(p=>p.id===id);
const writable=(db,id)=>{const row=db.performances?.find(p=>p.id===id);if(!row||!mine(row))throw Error('공연 또는 로그인 계정이 변경됐어요.');return row};
const info=s=>s.repertoire?.ownerId===owner()?s.repertoire:{};
const opt=(obj,v,none='선택 안 함')=>'<option value="">'+none+'</option>'+Object.entries(obj).map(([k,n])=>'<option value="'+E(k)+'"'+(k===v?' selected':'')+'>'+E(n)+'</option>').join('');
const field=(label,name,value='',type='text',required=false)=>'<label class="field"><span>'+E(label)+'</span><input name="'+name+'" type="'+type+'" value="'+E(value)+'"'+(required?' required':'')+' maxlength="200"></label>';
const area=(label,name,value='')=>'<label class="field"><span>'+E(label)+'</span><textarea name="'+name+'" maxlength="8000">'+E(value)+'</textarea></label>';
const select=(label,name,choices,value)=>'<label class="field"><span>'+E(label)+'</span><select name="'+name+'" aria-label="'+E(label)+'">'+opt(choices,value)+'</select></label>';
function message(error){V.toast(error.message||String(error),'error')}
function save(fn){if(!owner())throw Error('로그인 후 저장해 주세요.');if(!V.change(fn,{silent:true}))throw Error('저장하지 못했어요. 입력은 화면에 남아 있어요.');V.softRender()}
function panel(title,body,onSave,{wide=false,submit='저장'}={}){
 let dirty=false,busy=false,approved=false;const account=owner();let api;
 api=V.sheet({title,confirmClose:false,body:'<form class="archive-form">'+body+'<p class="archive-error" role="alert"></p><button type="submit" class="btn block">'+submit+'</button></form>',
 onMount:(el,close)=>{el.classList.add('archive-sheet');if(wide)el.classList.add('archive-full');const form=el.querySelector('form');form.oninput=()=>{dirty=true};form.onchange=()=>{dirty=true};
 // This sheet asks by itself (it also waits while saving): the same question as every other sheet, in the app's own popup.
 let asking=false;
 const guard=e=>{if((e.type==='keydown'&&e.key==='Escape')||(e.type==='click'&&(e.target===el.parentNode||e.target.closest('[data-close]')))){if(busy||dirty){e.preventDefault();e.stopImmediatePropagation();if(!busy&&!asking){asking=true;V.confirmDiscard().then(ok=>{asking=false;if(ok){approved=true;close();V.toast('취소했어요.')}})}}}};
 el.parentNode.addEventListener('click',guard,true);el.parentNode.addEventListener('keydown',guard,true);
 const unload=e=>{if(dirty&&!approved){e.preventDefault();e.returnValue=''}};
 V.setGuard(()=>dirty&&!approved?'저장하지 않은 입력을 버릴까요?':'');
 window.addEventListener('beforeunload',unload);el._archiveUnload=unload;
 const submitButton=form.querySelector('[type=submit]');
 form.onsubmit=async e=>{e.preventDefault();if(busy)return;busy=true;submitButton.disabled=true;try{if(!account||owner()!==account)throw Error('로그인 계정이 바뀌었어요. 다시 열어 주세요.');await onSave(Object.fromEntries(new FormData(form)),form);approved=true;dirty=false;close();V.toast('저장했어요.');V.softRender()}catch(e){form.querySelector('[role=alert]').textContent=e.message}finally{busy=false;submitButton.disabled=false}};
 },onClose:()=>{V.setGuard(null);window.removeEventListener('beforeunload',api?.el._archiveUnload);}});
 return api;
}
function updateSong(id,values,shared={}){
 const song=V.song(id);if(!song)throw Error('곡을 찾을 수 없어요.');
 const next=A.repertoire(values,info(song),owner());
 save(db=>{const current=db.songs.find(s=>s.id===id);if(!current)throw Error('삭제된 곡이에요.');Object.assign(current,shared);current.repertoire=next});
 const host=document.querySelector('[data-repertoire]');if(!host)return;
 const draw=list=>{if(host.isConnected&&V.song(id))V.repertoire.songPanel(host,V.song(id),list.filter(m=>m.songId===id))};
 const cached=M.cached();draw(cached);
 // The kept list can be cold (a refresh or a cloud read that was not kept): read it again rather than show the chosen take as missing.
 if(next.takeId&&!cached.some(m=>m.id===next.takeId))M.list().then(draw).catch(()=>{});
}
/* 키 정보 from the song's converted score (MusicXML): the key signature fills an empty 원키 (nothing is saved until
 * 저장), and the sung part's lowest/highest notes are shown. A key the owner already set on a score (악보 정보) wins
 * over the automatic reading; the song's confirmed 악보 기준 음역 wins over the automatic part range. */
async function scoreKey(song,host){
 const R=window.VzipScoreRange;if(!host||!R)return;
 // Reading the score takes a moment: a 원키 the owner typed or cleared meanwhile is left alone.
 const form=host.closest('form'),input=form?.elements.originalKey;let typed=false;input?.addEventListener('input',()=>{typed=true},{once:true});
 const scores=(song.scores||[]).filter(x=>x&&x.id);
 const range=song.vocalRange&&Number.isFinite(song.vocalRange.lowMidi)?{low:song.vocalRange.low,high:song.vocalRange.high,how:'악보 기준 음역(확인함)'}:null;
 // A key typed on a score (older data) counts until the song's keys were saved here (keysAt): after that 키 정보 is the one place.
 const typedOnScore=info(song).keysAt?'':scores.map(x=>x.originalKey).find(Boolean);
 let key=typedOnScore?{name:typedOnScore,how:'악보 정보에 넣은 원키'}:null,auto=null,partRange=null;
 if((!key||!range)&&V.vocalRangeLoadScore&&window.VzipR2?.enabled?.()&&window.VzipR2.omr){
  for(const sc of scores){
   try{const loaded=await V.vocalRangeLoadScore(sc);if(!loaded?.xml)continue;
    auto=R.readKey?.(loaded.xml)||null;const res=loaded.result,part=res?.parts?.find(p=>p.id===res.pick);
    if(part?.low&&part?.high)partRange={low:part.low,high:part.high,how:'악보 '+(part.name?'"'+part.name+'" ':'')+'파트(자동 인식)'};
    break;
   }catch{}
  }
 }
 if(!key&&auto){const minor=auto.likely==='minor';key={name:minor?auto.minor:auto.major,how:'악보 조표(자동 인식)',other:minor?auto.major:auto.minor,sure:!!auto.likely,changes:auto.changes}}
 const show=range||partRange;
 if(!host.isConnected||(!key&&!show))return;
 const filled=key&&input&&!typed&&!input.value.trim();
 if(filled){input.value=key.name;input.dispatchEvent(new Event('input',{bubbles:true}))}
 host.innerHTML='<p class="score-key-title"><i class="ph ph-music-notes" aria-hidden="true"></i> 악보에서 찾았어요</p>'+
  (key?'<p class="small" data-rep-key>원키 <b>'+E(key.name)+'</b> · '+E(key.how)+(filled?' · 원키 칸에 넣었어요. 저장을 눌러야 반영돼요.':'')+'</p>'+
   (key.other&&!key.sure?'<p class="small muted">조표만으로는 장조·단조를 가릴 수 없어요. 단조라면 '+E(key.other)+'예요.</p>':'')+(key.changes?'<p class="small muted">곡 중간에 조가 바뀌어요(처음 조표 기준).</p>':''):'')+
  (show?'<p class="small" data-rep-range>최저음 <b>'+E(show.low)+'</b> · 최고음 <b>'+E(show.high)+'</b> · '+E(show.how)+'</p>':'');
 host.hidden=false;
}
function editRepertoire(id,kind){
 const s=V.song(id);if(!s)return;const r=info(s);
 if(kind==='status')return panel('레퍼토리 상태',select('상태','status',A.states,r.status),v=>updateSong(id,v));
 if(kind==='skills')return panel('나의 숙련도', '<p class="small muted">직접 평가하는 항목입니다. AI 분석 점수와 별도로 저장해요.</p>'+Object.entries(A.skills).map(([k,n])=>select(n,k,{'1':'1','2':'2','3':'3','4':'4','5':'5'},String(r.skills?.[k]||''))).join(''),v=>updateSong(id,{skills:v}));
 if(kind==='keys')return keysPanel(id);
 if(kind==='memo')return panel('레퍼토리 메모',area('메모','memo',r.memo),v=>updateSong(id,v));
 const values=[...new Set(V.db.songs.map(x=>x.show).filter(Boolean))];
 const showOptions='<datalist id="archive-show">'+values.map(v=>'<option value="'+E(v)+'"></option>').join('')+'</datalist>';
 panel('곡 정보',field('곡명','title',s.title,'text',true)+field('뮤지컬 작품명','show',s.show).replace('name="show"','name="show" list="archive-show"')+showOptions+select('구분','kind',A.kinds,r.kind)+field('원어','language',r.language)+area('개인 메모','memo',r.memo),v=>{const {title,show,...rest}=v;if(!title.trim())throw Error('곡명을 입력해 주세요.');updateSong(id,rest,{title:title.trim(),show:show.trim()})});
}
/* 키 정보: the one place a song's keys are kept (songs[].repertoire). The score sheet and the MR key suggestion read the
 * same values (app/song-keys.js). Keys are free text and saved exactly as typed; a key written in a way the app does not
 * understand stays as a note. Keys that older data kept on a score are shown here and move to the song on 저장. */
const KEY_HELP='C, F#, Gb, Am, "Eb major", "내림 마 장조", "-2키"처럼 적으면 MR 키 맞추기에 쓸 수 있어요.';
function keysPanel(id){
 const s=V.song(id);if(!s)return;const r=info(s),k=Keys.of({...s,repertoire:r});
 const api=panel('키 정보','<div class="rep-score-key" data-rep-score-key hidden></div>'+field('원키','originalKey',k.originalKey)+'<p class="small muted archive-key-note" data-key-note="originalKey" hidden></p>'+field('연습키','practiceKey',k.practiceKey)+'<p class="small muted archive-key-note" data-key-note="practiceKey" hidden></p>'+field('공연키','stageKey',r.stageKey)+area('조옮김 메모','transposeNote',r.transposeNote)+'<p class="small muted">'+E(KEY_HELP)+' 이 곡의 악보와 MR에도 같은 키를 써요.</p>',v=>saveKeys(id,v));
 const form=api.el.querySelector('form');
 const note=name=>{const value=form.elements[name].value.trim(),el=form.querySelector('[data-key-note="'+name+'"]'),known=!value||Keys.parse(value)||(name==='practiceKey'&&Keys.relative(value)!=null);el.hidden=!!known;if(!known)el.textContent='이 표기는 MR 키 맞추기에 쓸 수 없어요. 적은 그대로 메모처럼 보관해요.'};
 for(const name of ['originalKey','practiceKey']){form.elements[name].addEventListener('input',()=>note(name));note(name)}
 scoreKey(s,form.querySelector('[data-rep-score-key]'));
 return api;
}
/** Saves the song's keys; `values` holds any of originalKey, practiceKey, stageKey, transposeNote. Throws when it cannot save. */
function saveKeys(id,values){
 const s=V.song(id);if(!s)throw Error('곡을 찾을 수 없어요.');
 // The first save on the song keeps what was read from a score, so nothing shown so far is lost.
 const k=Keys.of({...s,repertoire:info(s)});
 updateSong(id,{originalKey:k.originalKey,practiceKey:k.practiceKey,...values,keysAt:Date.now()});
}
async function chooseTake(id){
 try{const media=(await M.list()).filter(m=>m.songId===id&&!V.db.deleted?.media?.includes(m.id));const s=V.song(id);if(!s)return;
 panel('대표 테이크 선택',select('기존 녹음','takeId',Object.fromEntries(media.map(m=>[m.id,M.label(m)+' · '+(M.dateOf(m)||'날짜 미상')])),info(s).takeId)+'<p class="small muted">곡 미연결 파일은 전체 녹음에서 먼저 곡을 지정해 주세요. 선택 안 함으로 해제할 수 있어요.</p>',v=>{if(v.takeId&&!media.some(m=>m.id===v.takeId))throw Error('녹음을 다시 선택해 주세요.');updateSong(id,v)});
 }catch(e){message(e)}
}
/* A production's days: its sessions, or start~end when no session is entered yet (at most 120 days). */
function days(p){
 const set=new Set((p.sessions||[]).map(s=>s.date).filter(Boolean));
 if(!set.size&&p.start){const a=new Date(p.start+'T12:00:00'),b=new Date((p.end||p.start)+'T12:00:00');for(let d=a,i=0;d<=b&&i<120;d=new Date(d.getTime()+864e5),i++)set.add(V.ymd(d))}
 return set;
}
/* Library recordings marked 공연 on one of the production's days. */
const stageMedia=(p,media)=>{const d=days(p);return media.filter(m=>M.occasion(m)==='performance'&&d.has(M.dateOf(m))&&!V.db.deleted?.media?.includes(m.id))};
let filter='',panelOpen={id:'',on:false};
V.repertoire={
 saveKeys,
 edit:editRepertoire,
 chooseTake,
 toolbar:()=>'<div class="archive-toolbar"><a class="btn secondary" href="#/performances">나의 공연</a><label class="field"><span>레퍼토리 상태</span><select data-rep-filter aria-label="레퍼토리 상태">'+opt(A.states,filter,'전체')+'</select></label></div>',
 matches:s=>!filter||info(s).status===filter,
 statusLabel:s=>A.states[info(s).status]||'',
 // For the calendar and the song page: this account's productions on a day / with a song.
 showsOn:date=>shows().filter(p=>p.status!=='cancelled'&&days(p).has(date)),
 showsForSong:id=>shows().filter(p=>(p.songLinks||[]).some(l=>l.songId===id)),
 showCard:p=>showCard(p),
 role:s=>info(s).role||'',
 score:s=>A.proficiency({repertoire:info(s)})||0,
 card:s=>{const r=info(s),score=A.proficiency({repertoire:r});return '<span class="archive-card-meta">'+E([r.role,A.states[r.status],score?'숙련도 '+score.toFixed(1)+'/5':''].filter(Boolean).join(' · '))+'</span>'},
 wireList:(main,draw)=>{const el=main.querySelector('[data-rep-filter]');if(el)el.onchange=()=>{filter=el.value;draw()}},
 // Song page: one compact card (two lines at most) above the tabs; the rows open under it and stay open while this song is shown.
 songPanel:(host,s,media)=>{
  if(!host)return;const r=info(s),score=A.proficiency({repertoire:r}),take=media.find(m=>m.id===r.takeId&&!V.db.deleted?.media?.includes(m.id));
  const keys=Keys.summary({...s,repertoire:r});
  if(panelOpen.id!==s.id)panelOpen={id:s.id,on:false};
  const row=(key,label,value,extra='')=>'<button type="button" class="archive-song-row '+extra+'" data-rep="'+key+'"><strong>'+label+'</strong><span class="archive-song-value '+(value?'':'is-empty')+'">'+E(value||({status:'상태 지정',skills:'미평가',keys:'미입력',memo:'메모 적기'}[key]))+'</span><i class="ph ph-caret-right" aria-hidden="true"></i></button>';
  const first=[A.states[r.status],score?'숙련도 '+score.toFixed(1)+'/5':''].filter(Boolean).join(' · ');
  const second=[keys,(r.memo||'').trim().replace(/\s+/g,' ')||(take?'대표 테이크 '+M.label(take):'')].filter(Boolean).join(' · ');
  const html='<section class="archive-song" aria-label="나의 레퍼토리">' +
    '<button type="button" class="archive-song-summary" data-rep-toggle aria-expanded="false" aria-controls="archive-song-detail"><span class="archive-song-summary-top"><strong>나의 레퍼토리</strong><span class="archive-song-value '+(first?'':'is-empty')+'">'+E(first||'상태·숙련도·키 적기')+'</span></span>'+(second?'<span class="archive-song-summary-note">'+E(second)+'</span>':'')+'<i class="ph ph-caret-down" aria-hidden="true"></i></button>' +
    '<div class="archive-song-detail" id="archive-song-detail" data-rep-detail hidden>' +
    row('status','상태',A.states[r.status]||'','archive-song-status') +
    row('skills','숙련도',score?score.toFixed(1)+'/5':'') +
    row('keys','키 정보',keys) +
    // The chosen take stays chosen while its recording cannot be read (offline, list not loaded yet).
    '<button type="button" class="archive-song-take" data-take><span class="archive-song-take-icon"><i class="ph ph-music-note" aria-hidden="true"></i></span><span class="archive-song-take-copy"><strong>대표 테이크</strong><small>'+E(take?M.label(take):r.takeId?'지금은 녹음을 불러올 수 없어요. 지정은 그대로예요.':'아직 지정한 녹음이 없어요')+'</small></span><i class="ph ph-caret-right" aria-hidden="true"></i></button>' +
    '<div data-take-player>'+(take?'<div class="list">'+V.mediaRow(take)+'</div>':'')+'</div>' +
    '<button type="button" class="archive-song-row archive-song-memo" data-rep="memo"><strong>메모</strong><span class="archive-song-value '+(r.memo?'':'is-empty')+'">'+E(r.memo||'메모 적기')+'</span><i class="ph ph-caret-right" aria-hidden="true"></i></button>' +
    '</div></section>';
  // The song page redraws on every data event: nothing is rebuilt (an open take player keeps playing) unless what is shown changed.
  const same=host.__panel===html&&!!host.firstElementChild;
  if(!same){host.__panel=html;host.innerHTML=html}
  const toggle=host.querySelector('[data-rep-toggle]'),detail=host.querySelector('[data-rep-detail]');
  const open=()=>{detail.hidden=!panelOpen.on;toggle.setAttribute('aria-expanded',String(panelOpen.on))};
  open();if(same)return;
  toggle.onclick=()=>{panelOpen.on=!panelOpen.on;open()};
  host.querySelectorAll('[data-rep]').forEach(b=>b.onclick=()=>editRepertoire(s.id,b.dataset.rep));host.querySelector('[data-take]').onclick=()=>chooseTake(s.id);if(take)V.wireMedia(host.querySelector('[data-take-player] .list'),[take]);
 }
};

function showCard(p){
 const date=p.start?V.dateLabel(p.start):'날짜 미정', meta=[p.role&&'배역 '+p.role,(p.sessions||[]).length&&'회차 '+p.sessions.length+'회',(p.songLinks||[]).length&&'공연곡 '+p.songLinks.length+'곡'].filter(Boolean);
 return '<a class="archive-performance" href="#/show/'+E(p.id)+'"><span class="archive-performance-poster" data-poster="'+E(p.id)+'"><i class="ph ph-mask-happy" aria-hidden="true"></i></span><span class="archive-performance-copy"><span class="archive-performance-date">'+E(date)+(p.end&&p.end!==p.start?' – '+E(V.dateLabel(p.end)):'')+'</span><strong>'+E(p.title)+'</strong><span class="archive-performance-meta">'+E(meta.join(' · ')||A.stages[p.status]||'공연 기록')+'</span></span><span class="archive-performance-state">'+E(A.stages[p.status]||'공연')+'</span><i class="ph ph-caret-right" aria-hidden="true"></i></a>';

}
function editShow(id){
 const p=id?get(id):null;if(id&&!p)return;
 panel(p?'공연 수정':'공연 등록',field('작품명','title',p?.title,'text',true)+'<div class="two">'+field('공연 시작일','start',p?.start||V.today(),'date',true)+field('공연 종료일','end',p?.end,'date')+'</div>'+field('공연장','venue',p?.venue)+field('공연팀·극단','company',p?.company)+field('배역','role',p?.role)+field('캐스팅 구분','casting',p?.casting)+field('소속팀 (A팀·B팀 등)','team',p?.team)+select('공연 상태','status',A.stages,p?.status||'preparing')+area('공연 후기·개인 메모','memo',p?.memo),v=>{
  const current=id?get(id):{};if(id&&!current)throw Error('삭제되거나 다른 계정의 공연이에요.');
  const next=A.performance(v,current,owner());next.id=id||V.uid();next.created=current.created||Date.now();
  save(db=>{db.performances||=[];const index=db.performances.findIndex(p=>p.id===id);if(index>=0)db.performances[index]=next;else db.performances.push(next)});
  if(!id)setTimeout(()=>V.nav('#/show/'+next.id),0);
 },{wide:true});
}
function editSession(pid,sid){
 const p=get(pid),s=p?.sessions?.find(x=>x.id===sid);if(!p)return;
 panel(s?'회차 수정':'공연 회차 추가',field('공연 날짜','date',s?.date||p.start,'date',true)+field('시작 시간','time',s?.time,'time')+field('공연 회차','number',s?.number)+select('해당 회차 출연','appeared',{yes:'출연함',no:'미출연 / 예정'},s?.appeared?'yes':'no')+field('해당 회차 배역','role',s?.role||p.role)+area('회차 메모','memo',s?.memo),v=>{
  const current=get(pid);if(!current)throw Error('공연을 찾을 수 없어요.');
  const next=A.session({...v,id:sid||V.uid(),appeared:v.appeared==='yes'},current.sessions);
  save(db=>{const item=writable(db,pid);item.sessions=[...(item.sessions||[]).filter(x=>x.id!==sid),next]});
 });
}
function linkSongs(pid){
 const p=get(pid);if(!p)return;const existing=new Set((p.songLinks||[]).map(l=>l.songId));
 const api=panel('공연곡 연결','<label class="field"><span>곡 검색</span><input type="search" data-search aria-label="공연곡 검색"></label><div data-results></div>'+select('솔로·듀엣·앙상블','kind',A.kinds,'solo')+field('공연 당시 키','key',''),(v,form)=>{
  const id=form.querySelector('[name=songId]')?.value,song=V.song(id);if(!song)throw Error('기존 곡을 선택해 주세요.');
  if(!get(pid))throw Error('공연이 삭제됐어요.');
  save(db=>{const p=writable(db,pid);if(p.songLinks.some(l=>l.songId===id))throw Error('이미 연결된 곡이에요.');p.songLinks.push({id:V.uid(),songId:id,title:song.title,show:song.show||'',kind:v.kind||'solo',key:v.key.trim()})});
 });
 const form=api.el.querySelector('form'),q=form.querySelector('[data-search]');
 // 공연 당시 키 starts from the chosen song's 공연키 (or 연습키) in 키 정보, until something is typed; it stays this performance's own record.
 let typedKey=false;form.elements.key.addEventListener('input',()=>{typedKey=true});
 form.addEventListener('change',e=>{if(e.target.name!=='songId'||typedKey)return;const song=V.song(e.target.value),k=song?Keys.of({...song,repertoire:info(song)}):null;form.elements.key.value=k?k.stageKey||k.practiceKey:''});
 const draw=()=>{
 const candidates=V.db.songs.filter(s=>!existing.has(s.id)&&(!q.value||(s.title+' '+s.show).toLowerCase().includes(q.value.toLowerCase())));
 form.querySelector('[data-results]').innerHTML=select('연결할 기존 곡','songId',Object.fromEntries(candidates.map(s=>[s.id,V.songLabel(s)])),'');
 };q.oninput=draw;draw();
}
async function removeShow(id){
 const p=get(id);if(!p)return;
 if(!await V.confirm('공연 삭제','공연과 회차·공연곡 연결을 삭제할까요? 기존 곡·녹음·레슨·연습은 보존됩니다. 첨부 파일이 있다면 먼저 자료 목록에서 삭제해 주세요.',{ok:'삭제',danger:true}))return;
 try{const current=get(id);if(!current)throw Error('공연 또는 로그인 계정이 변경됐어요.');if(current.assets?.length)throw Error('공연 자료를 먼저 삭제해 주세요. 파일이 남은 채 공연만 지우지 않아요.');save(db=>{writable(db,id);db.performances=db.performances.filter(p=>p.id!==id)});V.nav('#/performances')}catch(e){message(e)}
}
let year='';
V.route('performances',{title:'나의 공연',tab:'calendar',back:true,render(){
 const list=shows().sort((a,b)=>b.start.localeCompare(a.start)),years=[...new Set(list.map(p=>p.start.slice(0,4)))],selected=list.filter(p=>!year||p.start.startsWith(year)),stats=A.stats(selected);

 return '<div class="archive-page archive-performances-page"><div class="archive-performance-toolbar"><h2>공연 기록 <span>'+selected.length+'</span></h2><label class="archive-performance-year"><select name="year" aria-label="공연 연도">'+opt(Object.fromEntries(years.map(y=>[y,y+'년'])),year,'전체 연도')+'</select><i class="ph ph-caret-down" aria-hidden="true"></i></label></div><div class="archive-performance-stats"><span><strong>'+stats.productions+'</strong> 작품</span><span><strong>'+stats.sessions+'</strong> 출연</span><span><strong>'+new Set(selected.flatMap(p=>[p.role,...(p.sessions||[]).filter(s=>s.appeared).map(s=>s.role)].filter(Boolean))).size+'</strong> 배역</span><span><strong>'+stats.songs+'</strong> 공연곡</span></div><div class="archive-performance-list">'+(selected.length?selected.map(showCard).join(''):'<div class="archive-performance-empty"><strong>아직 등록한 공연이 없어요</strong><span>공연을 추가하면 이곳에 모아 볼 수 있어요.</span></div>')+'</div><button type="button" class="btn secondary archive-performance-add" data-new-show><i class="ph ph-plus" aria-hidden="true"></i> 공연 등록</button></div>';
 },mount(main){main.querySelector('[data-new-show]').onclick=()=>editShow();main.querySelector('[name=year]').onchange=e=>{year=e.target.value;V.render()};V.archiveAssets?.posters(main,shows())}});

V.route('show',{title:r=>get(r.params[0])?.title||'공연',tab:'calendar',back:true,render(r){
 const p=get(r.params[0]);if(!p)return V.empty('mask-happy','공연을 찾을 수 없어요. 로그인 계정을 확인해 주세요.');
 return '<div class="archive-page archive-show-page"><section class="archive-show-hero"><span class="archive-show-eyebrow">나의 공연 기록</span><strong>'+E(p.title)+'</strong><span class="archive-show-date">'+E([...new Set([p.start,p.end].filter(Boolean))].map(d=>V.dateLabel(d)).join(' – ')||'날짜 미정')+'</span><span class="archive-show-status">'+E(A.stages[p.status]||'공연')+'</span></section><section class="archive-show-info"><h2>공연 정보</h2><div class="archive-show-facts">'+[['공연장',p.venue],['공연팀',p.company],['배역',p.role],['캐스팅',p.casting],['소속팀',p.team]].filter(([,value])=>value).map(([label,value])=>'<div><small>'+label+'</small><span>'+E(value)+'</span></div>').join('')+'</div>'+(p.memo?'<p class="archive-show-memo">'+E(p.memo)+'</p>':'')+'<div class="archive-show-actions"><button class="btn secondary" data-edit-show>공연 수정</button><button class="btn ghost" data-delete-show>공연 삭제</button></div></section><section class="archive-show-section"><h2 class="sec">공연 회차 <button data-add-session>회차 추가</button></h2><div class="list">'+(p.sessions||[]).slice().sort((a,b)=>a.date.localeCompare(b.date)||a.time.localeCompare(b.time)).map(s=>'<div class="item"><div class="item-main"><b>'+E([V.dateLabel(s.date),s.time,s.number].filter(Boolean).join(' '))+'</b><div class="small">'+E([s.appeared?'출연함':'미출연 / 예정',s.role,s.memo].filter(Boolean).join(' · '))+'</div></div><button class="btn sm ghost" data-edit-session="'+E(s.id)+'">수정</button><button class="btn sm ghost" data-delete-session="'+E(s.id)+'">삭제</button></div>').join('')+'</div></section><section class="archive-show-section"><h2 class="sec">공연곡 <button data-link-songs>곡 연결</button></h2><div class="list">'+(p.songLinks||[]).map(l=>'<div class="item"><span class="item-main">'+(l.songId&&V.song(l.songId)?'<a href="#/song/'+E(l.songId)+'">'+E(V.songTitle(l.songId))+'</a>':'<b>'+E(l.title)+' (연결 해제됨)</b>')+'<span class="item-sub">'+E([A.kinds[l.kind],l.key&&'공연키 '+l.key].filter(Boolean).join(' · '))+'</span></span><button class="btn sm ghost" data-edit-link="'+E(l.id)+'">수정</button><button class="btn sm ghost" data-unlink="'+E(l.id)+'">해제</button></div>').join('')+'</div></section><section class="archive-show-section"><h2 class="sec">공연 녹음·영상</h2><div data-show-media>'+window.VZ.loadingRows(2)+'</div></section><section class="archive-show-section"><h2 class="sec">공연 자료</h2><div data-show-assets></div></section></div>';
 },mount(main,r){
 const id=r.params[0],p=get(id);if(!p)return;
 main.querySelector('[data-edit-show]').onclick=()=>editShow(id);main.querySelector('[data-delete-show]').onclick=()=>removeShow(id);main.querySelector('[data-add-session]').onclick=()=>editSession(id);main.querySelector('[data-link-songs]').onclick=()=>linkSongs(id);
 main.querySelectorAll('[data-edit-session]').forEach(b=>b.onclick=()=>editSession(id,b.dataset.editSession));
 main.querySelectorAll('[data-delete-session]').forEach(b=>b.onclick=async()=>{if(await V.confirm('회차 삭제','이 회차를 삭제할까요?',{ok:'삭제',danger:true}))try{save(db=>{const item=writable(db,id);item.sessions=item.sessions.filter(s=>s.id!==b.dataset.deleteSession)})}catch(e){message(e)}});
 main.querySelectorAll('[data-unlink]').forEach(b=>b.onclick=async()=>{if(await V.confirm('공연곡 연결 해제','공연에서 이 곡의 연결만 해제할까요?',{ok:'해제'}))try{save(db=>{const item=writable(db,id);item.songLinks=item.songLinks.filter(l=>l.id!==b.dataset.unlink)})}catch(e){message(e)}});
 main.querySelectorAll('[data-edit-link]').forEach(b=>b.onclick=()=>{const l=p.songLinks.find(x=>x.id===b.dataset.editLink);panel('공연곡 정보',select('구분','kind',A.kinds,l.kind)+field('공연 당시 키','key',l.key),v=>save(db=>{const row=writable(db,id).songLinks.find(x=>x.id===l.id);if(!row)throw Error('연결을 찾지 못했어요.');row.kind=v.kind||'solo';row.key=v.key.trim()}))});
 V.archiveAssets?.mount(main.querySelector('[data-show-assets]'),p);
 // Recordings marked 공연 on this production's days (from the library), and a one-tap link of their songs.
 const host=main.querySelector('[data-show-media]');
 M.list().catch(()=>M.cached?.()||[]).then(media=>{
  if(!host.isConnected)return;const list=stageMedia(p,media),linked=new Set((p.songLinks||[]).map(l=>l.songId));
  const missing=[...new Set(list.map(m=>m.songId).filter(id=>id&&V.song(id)&&!linked.has(id)))];
  host.innerHTML=(list.length?'<div class="list" data-r>'+list.map(V.mediaRow).join('')+'</div>':'<p class="small muted">공연 날짜('+E([...days(p)].sort().slice(0,3).map(d=>V.dateLabel(d)).join(', ')+(days(p).size>3?' …':''))+')에 "공연"으로 지정한 녹음이 없어요. 전체 녹음에서 녹음의 종류를 공연으로, 날짜를 공연 날로 맞추면 여기 모여요.</p>')+
   (missing.length?'<button type="button" class="btn sm secondary" data-link-found>이 녹음들의 곡 '+missing.length+'개를 공연곡으로 연결</button>':'');
  if(list.length)V.wireMedia(host.querySelector('[data-r]'),list);
  host.querySelector('[data-link-found]')?.addEventListener('click',()=>{try{save(db=>{const row=writable(db,id);for(const sid of missing){const s=V.song(sid);if(s&&!row.songLinks.some(l=>l.songId===sid))row.songLinks.push({id:V.uid(),songId:sid,title:s.title,show:s.show||'',kind:'solo',key:''})}});V.toast('공연곡 '+missing.length+'개를 연결했어요.')}catch(e){message(e)}});
 });
 }});
V.archiveUI={owner,get,shows,save,panel};
})();


