/* 가사 외우기 모드 (song detail → 가사 tab). Hides lyric words progressively for memorisation.
 * Reads songs[].lyrics / songs[].translation and only ever writes songs[].lyricsMemo
 * ({level, source, hard, known, translationHard, translationKnown, updatedAt}); the lyric text is never changed. */
(() => {
'use strict';
const V=window.VZ,M=window.VzipLyricsMemo;if(!V||!M)return;
const esc=V.esc,SOURCE_LABEL={lyrics:'원문',translation:'한글 해석'},REVEAL_MS=4000,STAGE_KEY='vzip_lyrics_memo_stage';
const st={open:'',view:'all',offset:0,hardOnly:false,pos:{},revealed:new Set(),timers:new Map(),ctx:null};
const stage={get(){try{return localStorage.getItem(STAGE_KEY)==='1'}catch{return false}},set(on){try{on?localStorage.setItem(STAGE_KEY,'1'):localStorage.removeItem(STAGE_KEY)}catch{}}};
const texts=song=>M.SOURCES.filter(k=>String(song?.[k]||'').trim());
const memoOf=song=>M.normalize(song?.lyricsMemo,song);
function clearReveal(){for(const t of st.timers.values())clearTimeout(t);st.timers.clear();st.revealed.clear()}
function save(id,mutate){
 return V.change(db=>{
  const song=db.songs.find(x=>x.id===id);if(!song)throw Error('곡을 찾을 수 없어요.');
  const raw=song.lyricsMemo&&typeof song.lyricsMemo==='object'?song.lyricsMemo:{};
  // Keep any fields a newer app version may have added; only the memo record changes.
  const memo=memoOf(song);song.lyricsMemo={...raw,...memo,...mutate(memo),updatedAt:Date.now()};
 },{silent:true});
}
function summary(song){
 const have=texts(song);if(!have.length)return '';
 const memo=memoOf(song),parts=[M.levelInfo(memo.level).label];
 const hard=have.reduce((n,k)=>n+M.marks(memo,k).hard.length,0),known=have.reduce((n,k)=>n+M.marks(memo,k).known.length,0);
 if(known)parts.push('외움 '+known+'줄');if(hard)parts.push('헷갈림 '+hard+'줄');
 return parts.join(' · ');
}
/** The entry card shown above the lyric fields. */
function entry(song){
 const ok=texts(song).length>0;
 return '<button type="button" class="vz-lyric-card vz-lm-entry" data-lm-open'+(ok?'':' disabled aria-disabled="true"')+'><span class="vz-lyric-heading"><strong><i class="ph ph-brain" aria-hidden="true"></i> 가사 외우기</strong><i class="ph ph-caret-right" aria-hidden="true"></i></span><span class="vz-lyric-preview">'+esc(ok?summary(song):'가사 원문이나 번역을 입력하면 시작할 수 있어요')+'</span></button>';
}
function wordHtml(t){
 if(!t.hidden)return esc(t.text);
 const key='W'+t.word;
 if(st.revealed.has(key))return '<button type="button" class="vz-lm-word is-open" data-lm-word="'+t.word+'" aria-label="'+esc(t.text)+', 다시 가리기">'+esc(t.text)+'</button>';
 return '<button type="button" class="vz-lm-word" data-lm-word="'+t.word+'" aria-label="가려진 단어'+(t.shown?' '+esc(t.shown)+'…':'')+' 보기">'+(t.shown?'<span>'+esc(t.shown)+'</span>':'')+'<span class="vz-lm-blank" style="--wide:'+t.wide+';--narrow:'+t.narrow+'" aria-hidden="true"></span></button>';
}
function textHtml(line,lv){
 const open=st.revealed.has('L'+line.index);
 if(open||lv==='full')return esc(line.text);
 if(lv==='hidden'){const len=[...line.text.trim()].length;return '<button type="button" class="vz-lm-bar" data-lm-line="'+line.index+'" style="--len:'+Math.min(40,Math.max(3,len))+'" aria-label="'+line.number+'번째 줄 보기, 단어 '+line.words+'개"></button>'}
 return line.tokens.map(t=>t.type==='space'?esc(t.text):t.type==='punct'&&!t.hidden?'<span class="vz-lm-punct">'+esc(t.text)+'</span>':wordHtml(t)).join('');
}
function lineHtml(line,lv,memo,source){
 if(line.empty)return '<div class="vz-lm-gap" aria-hidden="true"></div>';
 const open=st.revealed.has('L'+line.index),mark=M.markOf(memo,source,line.index);
 const num=lv==='full'?'<span class="vz-lm-num">'+line.number+'</span>':'<button type="button" class="vz-lm-num" data-lm-line="'+line.index+'" aria-pressed="'+open+'" aria-label="'+line.number+'번째 줄 '+(open?'다시 가리기':'보기')+'">'+line.number+'</button>';
 return '<div class="vz-lm-line'+(mark?' is-'+mark:'')+(open?' is-open':'')+'" data-lm-row="'+line.index+'">'+num+'<p class="vz-lm-text" lang="'+(/[가-힯]/.test(line.text)?'ko':'')+'">'+textHtml(line,lv)+'</p>'+(mark?'<span class="vz-lm-flag" aria-label="'+(mark==='hard'?'헷갈림':'외움')+'"><i class="ph ph-'+(mark==='hard'?'question':'check')+'" aria-hidden="true"></i></span>':'')+'</div>';
}
function practiceList(lines,memo,source){
 const all=lines.filter(l=>!l.empty);
 if(!st.hardOnly)return all;
 const hard=new Set(M.marks(memo,source).hard);return all.filter(l=>hard.has(l.index));
}
function panel(song){
 const have=texts(song),memo=memoOf(song),source=have.includes(memo.source)?memo.source:have[0],lv=memo.level,info=M.levelInfo(lv);
 const lines=M.build(song[source],lv,{offset:st.offset}),marks=M.marks(memo,source),total=lines.filter(l=>!l.empty).length;
 const seg=(attr,label,items,value)=>'<div class="vz-lm-seg" role="group" aria-label="'+label+'">'+items.map(([k,v])=>'<button type="button" data-'+attr+'="'+k+'" aria-pressed="'+(k===value)+'">'+v+'</button>').join('')+'</div>';
 let body;
 if(st.view==='line'){
  const list=practiceList(lines,memo,source),key=song.id+':'+source+(st.hardOnly?':hard':'');
  const pos=Math.min(Math.max(0,st.pos[key]||0),Math.max(0,list.length-1));st.pos[key]=pos;
  const line=list[pos],mark=line?M.markOf(memo,source,line.index):'',open=line&&st.revealed.has('L'+line.index);
  body='<div class="vz-lm-practice">'+
   '<div class="vz-lm-pmeta"><span class="vz-lm-count" data-lm-count>'+(list.length?(pos+1)+' / '+list.length+'줄':'0줄')+'</span><button type="button" class="vz-lm-chip" data-lm-hard-only aria-pressed="'+st.hardOnly+'">헷갈린 줄만 '+marks.hard.length+'</button></div>'+
   (line?'<div class="vz-lm-card'+(mark?' is-'+mark:'')+'" data-lm-current="'+line.index+'" aria-live="polite"><span class="vz-lm-card-num">'+line.number+'번째 줄</span><p class="vz-lm-text">'+textHtml(line,lv)+'</p></div>'+
    '<div class="vz-lm-marks" role="group" aria-label="이 줄 표시"><button type="button" data-lm-mark="known" aria-pressed="'+(mark==='known')+'"><i class="ph ph-check-circle" aria-hidden="true"></i>외움</button><button type="button" data-lm-mark="hard" aria-pressed="'+(mark==='hard')+'"><i class="ph ph-question" aria-hidden="true"></i>헷갈림</button></div>'+
    '<div class="vz-lm-nav"><button type="button" class="vz-lm-icon" data-lm-prev aria-label="이전 줄"'+(pos?'':' disabled')+'><i class="ph ph-caret-left" aria-hidden="true"></i></button>'+
    (lv==='full'?'':'<button type="button" class="vz-lm-ghost" data-lm-line="'+line.index+'" aria-pressed="'+!!open+'">'+(open?'가리기':'보기')+'</button>')+
    '<button type="button" class="vz-lm-primary" data-lm-next>'+(pos<list.length-1?'다음 줄 <i class="ph ph-caret-right" aria-hidden="true"></i>':'처음으로 <i class="ph ph-arrow-counter-clockwise" aria-hidden="true"></i>')+'</button></div>'
   :'<p class="vz-lm-empty">'+(st.hardOnly?'헷갈림으로 표시한 줄이 없어요.':'연습할 줄이 없어요.')+'</p>')+'</div>';
 } else body='<div class="vz-lm-lines" data-lm-lines>'+lines.map(l=>lineHtml(l,lv,memo,source)).join('')+'</div>';
 return '<section class="vz-lm'+(stage.get()?' is-stage':'')+'" data-lyrics-memo aria-label="가사 외우기">'+
  '<div class="vz-lm-head"><h2>가사 외우기</h2><div class="vz-lm-tools"><button type="button" class="vz-lm-icon" data-lm-stage aria-pressed="'+stage.get()+'" aria-label="어두운 무대 화면"><i class="ph ph-moon" aria-hidden="true"></i></button><button type="button" class="vz-lm-icon" data-lm-close aria-label="외우기 닫기"><i class="ph ph-x" aria-hidden="true"></i></button></div></div>'+
  (have.length>1?seg('lm-source','가사 종류',have.map(k=>[k,SOURCE_LABEL[k]]),source):'<p class="vz-lm-source">'+SOURCE_LABEL[source]+'</p>')+
  '<div class="vz-lm-levels" role="group" aria-label="가리기 단계">'+M.LEVELS.map(l=>'<button type="button" data-lm-level="'+l.id+'" aria-pressed="'+(l.id===lv)+'" aria-label="'+l.label+'">'+l.short+'</button>').join('')+'</div>'+
  '<div class="vz-lm-hint"><p data-lm-hint><strong>'+info.label+'</strong> · '+info.hint+(lv==='full'?'':' 가려진 곳을 누르면 잠깐 보여요.')+'</p>'+(lv==='third'||lv==='half'?'<button type="button" class="vz-lm-ghost" data-lm-shuffle>다른 단어</button>':'')+'</div>'+
  seg('lm-view','보기 방식',[['all','전체 가사'],['line','한 줄씩']],st.view)+
  '<p class="vz-lm-progress" data-lm-progress>전체 '+total+'줄 · 외움 '+marks.known.length+' · 헷갈림 '+marks.hard.length+'</p>'+body+'</section>';
}
function paint(first){
 const c=st.ctx;if(!c||!c.host.isConnected)return;
 // A reveal timer can fire after the user switched to another song tab: never paint over that tab.
 if(!first&&!c.host.querySelector(':scope>[data-lyrics-memo]'))return;
 const song=V.song(c.id);
 if(!song||!texts(song).length){close();c.onClose?.();return}
 const a=document.activeElement,focus=a&&c.host.contains(a)?[...a.attributes].find(x=>x.name.startsWith('data-lm-')):null;
 c.host.innerHTML=panel(song);
 if(focus){const el=c.host.querySelector('['+focus.name+(focus.value?'="'+CSS.escape(focus.value)+'"':'')+']');(el&&!el.disabled?el:c.host.querySelector('[data-lm-close]'))?.focus({preventScroll:true})}
}
function reveal(key){
 if(st.revealed.has(key)){st.revealed.delete(key);clearTimeout(st.timers.get(key));st.timers.delete(key);paint();return}
 st.revealed.add(key);clearTimeout(st.timers.get(key));
 st.timers.set(key,setTimeout(()=>{st.timers.delete(key);if(st.revealed.delete(key))paint()},REVEAL_MS));
 paint();
}
function onClick(e){
 const c=st.ctx,b=e.target.closest('button');if(!c||!b||!c.host.contains(b)||b.disabled)return;
 const song=V.song(c.id);if(!song)return;
 const memo=memoOf(song),have=texts(song),source=have.includes(memo.source)?memo.source:have[0],d=b.dataset;
 if('lmClose' in d){close();c.onClose?.();return}
 if('lmStage' in d){stage.set(!stage.get());paint();return}
 if(d.lmLevel){if(d.lmLevel!==memo.level){clearReveal();st.offset=0;save(c.id,()=>({level:M.level(d.lmLevel)}))}paint();return}
 if(d.lmSource){if(d.lmSource!==source){clearReveal();save(c.id,()=>({source:d.lmSource}))}paint();return}
 if(d.lmView){st.view=d.lmView==='line'?'line':'all';clearReveal();paint();return}
 if('lmShuffle' in d){st.offset=(st.offset+1)%6;clearReveal();paint();return}
 if(d.lmWord!=null){reveal('W'+d.lmWord);return}
 if(d.lmLine!=null){reveal('L'+d.lmLine);return}
 if('lmHardOnly' in d){st.hardOnly=!st.hardOnly;clearReveal();paint();return}
 if(d.lmMark){
  const index=Number(c.host.querySelector('[data-lm-current]')?.dataset.lmCurrent);if(!Number.isInteger(index))return;
  const next=M.markOf(memo,source,index)===d.lmMark?'':d.lmMark;
  if(save(c.id,m=>M.setMark(m,source,index,next)))paint();
  return;
 }
 if('lmPrev' in d||'lmNext' in d){
  const lines=M.build(song[source],'full'),list=practiceList(lines,memo,source),key=c.id+':'+source+(st.hardOnly?':hard':'');
  const pos=st.pos[key]||0;st.pos[key]='lmPrev' in d?Math.max(0,pos-1):pos>=list.length-1?0:pos+1;
  clearReveal();paint();
 }
}
function render(host,song,{onClose}={}){
 if(!host||!song)return;
 if(st.ctx?.host!==host){st.ctx?.host?.removeEventListener('click',onClick);host.addEventListener('click',onClick)}
 st.ctx={host,id:song.id,onClose};paint(true);
}
function open(id){if(st.open!==id){st.view='all';st.offset=0;st.hardOnly=false;clearReveal()}st.open=id}
function close(){st.open='';clearReveal();if(st.ctx){st.ctx.host.removeEventListener('click',onClick);st.ctx=null}}
V.lyricsMemo={entry,render,open,close,isOpen:id=>!!id&&st.open===id,summary};
})();
