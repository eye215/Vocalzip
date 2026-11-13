/* Automatic recording titles; a title the user typed is never replaced. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipMediaNaming=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const strip=value=>String(value||'').replace(/\.(m4a|mp3|wav|aac|ogg|flac|webm|mp4|mov|aiff?|caf|wma|m4v)$/i,'');
function keepPrevious(review,oldName,newName){
 const previous=strip(oldName).trim(),current=String(review||'');
 if(!previous||previous===newName)return current;
 const entry='이전 제목: '+previous;
 return current.split('\n').includes(entry)?current:current+(current&&!current.endsWith('\n')?'\n':'')+entry;
}
function date(meta){
 if(/^\d{4}-\d{2}-\d{2}$/.test(meta.recordedDate||''))return meta.recordedDate;
 const d=new Date(Number(meta.created));if(!Number.isFinite(d.getTime()))return '';
 return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function title(meta,resolve=()=>'',fallback=true){
 const song=String(resolve(meta.songId)||meta.song||'').trim(),day=date(meta);
 if(song)return song+(day?' '+day.replace(/-/g,'.'):'');
 return fallback?strip(meta.originalFilename||meta.originalMedia?.name)||(day?'녹음 '+day.replace(/-/g,'.'):'녹음'):'';
}
function mode(meta,resolve){
 if(meta.nameMode==='manual')return false;
 if(meta.nameMode==='auto')return meta.autoName===meta.name;
 const original=strip(meta.originalFilename||meta.originalMedia?.name);
 if(original&&meta.name===original)return true;
 const base=title(meta,resolve,false);
 return !!base&&(meta.name===base||/^ (?:[2-9]|[1-9]\d+)$/.test(String(meta.name||'').slice(base.length))&&String(meta.name||'').startsWith(base));
}
/* A title the user typed by hand. Titles saved before nameMode existed count when the app's own recorder saved them
 * (its 제목 field is where they were typed) and they are not one of the names the app itself gives a recording. */
const stamped=/(?:^| )\d{1,2}[./]\d{1,2} \d{2}:\d{2}$/; // "녹음 11.13 14:05", "곡 MR 녹음 11/13 14:05", "보이스 체크 11.13 14:05"
function typed(meta,resolve){
 const name=String(meta.name||'').trim();
 if(!name||mode(meta,resolve))return false;
 if(meta.nameMode)return true; // 'manual', or an automatic title that was later changed by hand
 if(!/^(?:practice|lesson)$/.test(meta.source||'')||name==='녹음'||stamped.test(name)||strip(name)!==name)return false;
 const day=date(meta).replace(/-/g,'.'),at=day?name.lastIndexOf(' '+day):-1;
 return at<1||!/^$|^ (?:[2-9]|[1-9]\d+)$/.test(name.slice(at+day.length+1)); // "곡 2026.11.08 2" of a song renamed since
}
function patch(meta,changes,resolve=()=> ''){
 const out={...changes};
 if(typed(meta,resolve)){
  // A typed title stays as it is: a song or date change, or a form's automatic name, never replaces it.
  delete out.normalizeTitle;
  if(out.nameMode==='auto'&&Object.hasOwn(out,'name')){delete out.name;delete out.nameMode;delete out.autoName;}
  return Object.hasOwn(out,'name')&&out.name!==meta.name?{...out,nameMode:'manual',autoName:null}:out;
 }
 const normalize=!!out.normalizeTitle;delete out.normalizeTitle;
 const changed=['song','songId','recordedDate','created'].some(k=>Object.hasOwn(out,k)&&out[k]!==meta[k]);
 if(normalize||changed){
  const next={...meta,...out},base=title(next,resolve,false);
  if(base){
   const requested=out.nameMode==='auto'&&out.name===out.autoName&&String(out.name).startsWith(base)&&/^$|^ (?:[2-9]|[1-9]\d+)$/.test(String(out.name).slice(base.length))?out.name:null;
   if(mode(meta,resolve)&&requested){
    if(meta.name&&meta.name!==requested)out.review=keepPrevious(out.review??meta.review,meta.name,requested);
    return out;
   }
   const automatic=mode(meta,resolve),old=title(meta,resolve,false),tail=old&&String(meta.name||'').startsWith(old)?String(meta.name).slice(old.length):'';
   const suffix=automatic&&/^ (?:[2-9]|[1-9]\d+)$/.test(tail)?tail:'';
   const name=requested||base+suffix;
   if(meta.name&&meta.name!==name){
    out.review=keepPrevious(out.review??meta.review,meta.name,name);
   }
   return {...out,name,nameMode:'auto',autoName:name};
  }
 }
 if(out.nameMode==='auto'&&out.autoName===out.name){
  if(!mode(meta,resolve)){delete out.name;delete out.nameMode;delete out.autoName;}
  else{const base=title({...meta,...out},resolve,false),rest=String(out.name||'').slice(base.length);
   if(base&&String(out.name||'').startsWith(base)&&(rest===''||/^ (?:[2-9]|[1-9]\d+)$/.test(rest)))return out;}
 }
 if(Object.hasOwn(out,'name')&&out.name!==meta.name&&out.nameMode!=='auto')return {...out,nameMode:'manual',autoName:null};
 if(!['song','songId','recordedDate','created'].some(k=>Object.hasOwn(out,k)&&out[k]!==meta[k])||!mode(meta,resolve))return out;
 const old=title(meta,resolve,false),tail=old&&String(meta.name||'').startsWith(old)?String(meta.name).slice(old.length):'';
 const suffix=/^ (?:[2-9]|[1-9]\d+)$/.test(tail)?tail:'';
 const next={...meta,...out},name=title(next,resolve)+(next.song||next.songId?suffix:'');
 return {...out,name,nameMode:'auto',autoName:name};
}
return {patch,title,isAutomatic:mode,isTyped:typed,keepPrevious};
});
