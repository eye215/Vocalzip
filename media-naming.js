/* Automatic recording titles; manual names are preserved. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipMediaNaming=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const strip=value=>String(value||'').replace(/\.(m4a|mp3|wav|aac|ogg|flac|webm|mp4|mov|aiff?|caf|wma|m4v)$/i,'');
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
function patch(meta,changes,resolve=()=> ''){
 const out={...changes};
 if(Object.hasOwn(out,'name')&&out.name!==meta.name&&out.nameMode!=='auto')return {...out,nameMode:'manual',autoName:null};
 if(!['song','songId','recordedDate','created'].some(k=>Object.hasOwn(out,k)&&out[k]!==meta[k])||!mode(meta,resolve))return out;
 const old=title(meta,resolve,false),tail=old&&String(meta.name||'').startsWith(old)?String(meta.name).slice(old.length):'';
 const suffix=/^ (?:[2-9]|[1-9]\d+)$/.test(tail)?tail:'';
 const next={...meta,...out},name=title(next,resolve)+(next.song||next.songId?suffix:'');
 return {...out,name,nameMode:'auto',autoName:name};
}
return {patch,title,isAutomatic:mode};
});
