/* Only compares transcripts from the user's own recordings. No LLM call, no lyrics API.
 * Short STT snippets are noisy; fail closed when ambiguous. */
export const normalizeText=(value)=>String(value||'').normalize('NFKC').toLocaleLowerCase()
 .replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
function grams(text){
 const s=normalizeText(text).replace(/\s+/g,'');
 const set=new Set();for(let i=0;i<=s.length-3;i++)set.add(s.slice(i,i+3));return set;
}
export function scoreTranscripts(a,b){
 const short=normalizeText(a).replace(/\s+/g,''),long=normalizeText(b).replace(/\s+/g,'');
 const l=grams(short);if(l.size<4||long.length<12)return 0;
 // A recorded 30-second excerpt can occur anywhere inside a complete lyric sheet.
 // Compare local windows rather than diluting the overlap over a whole song.
 const windowSize=Math.max(short.length,Math.min(long.length,Math.ceil(short.length*1.5)));
 const step=Math.max(20,Math.floor(short.length/3));
 let best=0;
 for(let start=0;start<long.length;start+=step){
  const r=grams(long.slice(start,start+windowSize));if(r.size<4)continue;
  let same=0;for(const g of l)if(r.has(g))same++;
  best=Math.max(best,same/Math.sqrt(l.size*r.size));
  if(start+windowSize>=long.length)break;
 }
 return best;
}
export function matchTranscripts(text, references, {threshold=0.26,margin=0.07}={}){
 if(normalizeText(text).length<12)return {candidate:null,reason:'인식된 가사가 너무 짧아요.',matches:[]};
 const ranked=(Array.isArray(references)?references:[]).filter(x=>x?.songId&&x?.transcript)
 .map(x=>({songId:x.songId,score:scoreTranscripts(text,x.transcript)}))
 .sort((a,b)=>b.score-a.score)
 // One song may have several texts (original lyrics, Korean translation, reference take): keep its best one,
 // so it is neither its own runner-up nor listed twice.
 .filter((x,i,all)=>all.findIndex(y=>y.songId===x.songId)===i);
 const top=ranked[0],second=ranked[1];
 if(!top||top.score<threshold)return {candidate:null,reason:'등록된 가사 또는 기준 녹음과 충분히 일치하지 않아요.',matches:ranked.slice(0,3)};
 if(second&&top.songId!==second.songId&&top.score-second.score<margin)
  return {candidate:null,reason:'유사한 곡이 여러 개 있어요. 직접 확인해 주세요.',matches:ranked.slice(0,3)};
 return {candidate:top.songId,reason:'등록된 가사 또는 기준 녹음과 일치',matches:ranked.slice(0,3)};
}
