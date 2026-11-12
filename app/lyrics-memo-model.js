/* 가사 외우기 모드: pure masking + progress helpers. Never edits the lyric text itself; it only describes how to
 * show it. Used by app/lyrics-memo.js in the browser and by tests/lyrics-memo-model.test.cjs in Node. */
(function(root,factory){const api=factory();root.VzipLyricsMemo=api;if(typeof module==='object')module.exports=api})(globalThis,()=>{
'use strict';
const LEVELS=[
 {id:'full',short:'전체',label:'전체 보기',hint:'가사를 모두 보여줘요.'},
 {id:'third',short:'일부',label:'단어 일부 가리기',hint:'세 단어마다 하나씩 가려요.'},
 {id:'half',short:'절반',label:'단어 절반 가리기',hint:'두 단어마다 하나씩 가려요.'},
 {id:'initial',short:'첫 글자',label:'첫 글자만',hint:'단어의 첫 글자만 보여줘요.'},
 {id:'hidden',short:'모두',label:'모두 가리기',hint:'줄 자리만 남겨요.'}
];
const LEVEL_IDS=LEVELS.map(l=>l.id);
const SOURCES=['lyrics','translation'];
const WORD=/[\p{L}\p{N}]/u;
// Wide (two-column) scripts: Hangul, kana, CJK ideographs and full-width forms take a full em on screen.
const WIDE=/[ᄀ-ᇿ⺀-〿぀-ヿ㄰-㆏㐀-䶿一-鿿ꥠ-꥿가-힯ힰ-퟿豈-﫿︰-﹏＀-｠￠-￦]/u;
const WIDE_MASK='○',NARROW_MASK='_';
const level=id=>LEVEL_IDS.includes(id)?id:'full';
const splitLines=text=>String(text??'').split(/\r\n|\r|\n/);
const segmenter=typeof Intl==='object'&&Intl.Segmenter?new Intl.Segmenter('ko',{granularity:'grapheme'}):null;
function graphemes(s){return segmenter?[...segmenter.segment(s)].map(x=>x.segment):(s.match(/\P{M}\p{M}*|\p{M}+/gu)||[])}
/** One line → whitespace, punctuation and word tokens. Joining every token's text gives back the line exactly. */
function tokenizeLine(line){
 const out=[];
 // A word is a run of letters/digits, kept whole across inner apostrophes and hyphens (don't, heart-break);
 // dashes, brackets, commas and the like stay visible as punctuation.
 for(const m of String(line??'').matchAll(/(\s+)|([\p{L}\p{N}\p{M}]+(?:['’\-‐][\p{L}\p{N}\p{M}]+)*)|([^\s\p{L}\p{N}\p{M}]+|[\p{M}]+)/gu)){
  const type=m[1]?'space':m[2]?'word':'punct',prev=out[out.length-1];
  if(type==='punct'&&prev?.type==='punct')prev.text+=m[0];else out.push({type,text:m[0]});
 }
 return out;
}
function maskOf(s){let wide=0,narrow=0,mask='';for(const ch of s){if(/\s/u.test(ch)){mask+=ch;continue}if(WIDE.test(ch)){wide++;mask+=WIDE_MASK}else{narrow++;mask+=NARROW_MASK}}return {mask,wide,narrow}}
function hides(lv,index,offset){
 if(lv==='third')return (index+offset)%3===2;
 if(lv==='half')return (index+offset)%2===1;
 return lv==='initial'||lv==='hidden';
}
/** The whole text at one level. Word positions count across the whole text so short lines still get gaps.
 * `offset` shifts which words the partial levels hide (the "다른 단어" button), deterministically. */
function build(text,lv,{offset=0}={}){
 lv=level(lv);offset=Math.abs(Math.trunc(Number(offset)||0));
 let n=0,number=0;
 return splitLines(text).map((line,index)=>{
  const empty=!line.trim();
  const tokens=tokenizeLine(line).map(t=>{
   if(t.type==='space')return {...t,hidden:false,shown:t.text,rest:''};
   if(t.type==='punct'){const hidden=lv==='hidden';return {...t,hidden,shown:hidden?'':t.text,rest:hidden?t.text:'',...(hidden?maskOf(t.text):{mask:'',wide:0,narrow:0})}}
   const word=n++;
   if(!hides(lv,word,offset))return {...t,word,hidden:false,shown:t.text,rest:'',mask:'',wide:0,narrow:0};
   const first=lv==='initial'?graphemes(t.text)[0]||'':'';
   const rest=t.text.slice(first.length);
   // A one-letter word (이, 날, I) is its own first letter: nothing to hide at 첫 글자만.
   if(lv==='initial'&&!rest)return {...t,word,hidden:false,shown:t.text,rest:'',mask:'',wide:0,narrow:0};
   return {...t,word,hidden:true,shown:first,rest,...maskOf(rest)};
  });
  return {index,number:empty?0:++number,text:line,empty,words:tokens.filter(t=>t.type==='word').length,tokens};
 });
}
const render=line=>line.tokens.map(t=>t.shown+(t.hidden?t.mask:'')).join('');
/** Deterministic display string of the masked text (○ for a hidden wide character, _ for a narrow one). */
function maskText(text,lv,opts){return build(text,lv,opts).map(render).join('\n')}
function maskLine(line,lv,opts){return maskText(String(line??'').replace(/\r\n|\r|\n/g,' '),lv,opts)}
/** Raw indices of the lines worth practising (not blank). */
const practiceLines=text=>splitLines(text).flatMap((line,i)=>line.trim()?[i]:[]);
const idxList=(list,valid)=>[...new Set((Array.isArray(list)?list:[]).map(Number).filter(i=>Number.isInteger(i)&&i>=0&&(!valid||valid.has(i))))].sort((a,b)=>a-b).slice(0,2000);
const keys=source=>source==='translation'?['translationHard','translationKnown']:['hard','known'];
/** Normalise a stored `song.lyricsMemo`. With the song, marks that no longer point at a lyric line are dropped. */
function normalize(raw,song){
 const m=raw&&typeof raw==='object'?raw:{};
 const valid=s=>song?new Set(practiceLines(song[s])):null;
 const out={level:level(m.level),source:SOURCES.includes(m.source)?m.source:'lyrics',updatedAt:Number(m.updatedAt)||0};
 for(const s of SOURCES){const [h,k]=keys(s),v=valid(s);out[h]=idxList(m[h],v);out[k]=idxList(m[k],v).filter(i=>!out[h].includes(i))}
 return out;
}
const marks=(memo,source)=>{const [h,k]=keys(source);return {hard:memo?.[h]||[],known:memo?.[k]||[]}};
const markOf=(memo,source,index)=>{const m=marks(memo,source);return m.hard.includes(index)?'hard':m.known.includes(index)?'known':''};
/** New memo with line `index` of `source` marked 'hard' (헷갈림), 'known' (외움) or '' (표시 없음). */
function setMark(memo,source,index,mark){
 const out=normalize(memo),[h,k]=keys(SOURCES.includes(source)?source:'lyrics');index=Number(index);
 if(!Number.isInteger(index)||index<0)return out;
 out[h]=out[h].filter(i=>i!==index);out[k]=out[k].filter(i=>i!==index);
 if(mark==='hard')out[h]=idxList([...out[h],index]);else if(mark==='known')out[k]=idxList([...out[k],index]);
 return out;
}
const levelInfo=id=>LEVELS.find(l=>l.id===level(id));
return {LEVELS,LEVEL_IDS,SOURCES,WIDE_MASK,NARROW_MASK,level,levelInfo,splitLines,tokenizeLine,build,maskText,maskLine,practiceLines,normalize,marks,markOf,setMark,isWordChar:ch=>WORD.test(ch)};
});
