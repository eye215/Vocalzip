/* Only compares transcripts from the user's own recordings. No LLM call, no lyrics API.
 * Short STT snippets are noisy; fail closed when ambiguous. */
export const normalizeText=(value)=>String(value||'').normalize('NFKC').toLocaleLowerCase()
 .replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
function grams(text){
 const s=normalizeText(text).replace(/\s+/g,'');
 const set=new Set();for(let i=0;i<=s.length-3;i++)set.add(s.slice(i,i+3));return set;
}
export function scoreTranscripts(a,b){
 const l=grams(a),r=grams(b);if(l.size<4||r.size<4)return 0;
 let same=0;for(const x of l)if(r.has(x))same++;
 return same/Math.sqrt(l.size*r.size);
}
export function matchTranscripts(text, references, {threshold=0.26,margin=0.07}={}){
 if(normalizeText(text).length<12)return {candidate:null,reason:'인식된 가사가 너무 짧아요.',matches:[]};
 const ranked=(Array.isArray(references)?references:[]).filter(x=>x?.songId&&x?.transcript)
 .map(x=>({songId:x.songId,score:scoreTranscripts(text,x.transcript)}))
 .sort((a,b)=>b.score-a.score);
 const top=ranked[0],second=ranked[1];
 if(!top||top.score<threshold)return {candidate:null,reason:'기준 녹음과 충분히 일치하지 않아요.',matches:ranked.slice(0,3)};
 if(second&&top.songId!==second.songId&&top.score-second.score<margin)
  return {candidate:null,reason:'유사한 곡이 여러 개 있어요. 직접 확인해 주세요.',matches:ranked.slice(0,3)};
 return {candidate:top.songId,reason:'저장된 기준 녹음과 가사 구간 일치',matches:ranked.slice(0,3)};
}
