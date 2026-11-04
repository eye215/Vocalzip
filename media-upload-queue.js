/* Keep File handles only; upload one file at a time and release each successful handle. */
(()=>{
'use strict';
const catalog=()=>{try{return JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')||'{}').songs||[]}catch{return []}};
window.vzipChooseUploadSongs=(files,defaultSongId='')=>new Promise(resolve=>{
 const overlay=document.createElement('div');overlay.className='vzip-media-edit-backdrop';
 const sheet=document.createElement('div');sheet.className='vzip-media-edit-sheet';sheet.setAttribute('role','dialog');sheet.setAttribute('aria-modal','true');sheet.setAttribute('aria-label','파일별 곡 선택');
 const heading=document.createElement('h2');heading.textContent='파일별 곡 선택';
 const note=document.createElement('p');note.className='muted';note.textContent='각 파일의 곡을 고른 뒤 업로드하세요. 한 번에 하나씩 순서대로 저장해요.';
 sheet.append(heading,note);
 const entries=files.map(file=>{
  const row=document.createElement('div');row.className='vzip-upload-song-row';
  const name=document.createElement('strong');name.textContent=file.name;
  const label=document.createElement('label');label.textContent='곡 선택';
  const select=document.createElement('select');select.setAttribute('aria-label',file.name+' 곡');
  select.add(new Option('곡 미지정',''));catalog().forEach(song=>select.add(new Option(song.title+(song.show?' — '+song.show:''),song.id)));select.value=defaultSongId;
  const custom=document.createElement('input');custom.placeholder='새 곡명 (선택)';custom.setAttribute('aria-label',file.name+' 새 곡명');custom.maxLength=150;
  select.onchange=()=>{if(select.value)custom.value=''};
  label.append(select);row.append(name,label,custom);sheet.append(row);return {select,custom};
 });
 const error=document.createElement('p');error.setAttribute('role','alert');
 const actions=document.createElement('div');actions.className='buttons';
 const cancel=document.createElement('button');cancel.type='button';cancel.className='btn secondary';cancel.textContent='취소';
 const start=document.createElement('button');start.type='button';start.className='btn';start.textContent='선택한 '+files.length+'개 업로드';
 const previous=document.activeElement;
 function finish(result){overlay.remove();previous?.focus?.();resolve(result)}
 cancel.onclick=()=>finish(null);overlay.onclick=event=>{if(event.target===overlay)finish(null)};
 overlay.onkeydown=event=>{
  if(event.key==='Escape'){event.preventDefault();finish(null)}
  if(event.key==='Tab'){const focusable=[...sheet.querySelectorAll('input,select,button')],first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
 };
 start.onclick=()=>{
  try{
   const data=JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')||'{}');data.songs=data.songs||[];let changed=false;
   const choices=entries.map(({select,custom})=>{
    let song=data.songs.find(x=>x.id===select.value);const title=custom.value.trim();
    if(title){song=data.songs.find(x=>x.title.trim().toLowerCase()===title.toLowerCase());if(!song){song={id:crypto.randomUUID(),title,show:''};data.songs.push(song);changed=true}}
    return {songId:song?.id||'',song:song?song.title+(song.show?' — '+song.show:''):''};
   });
   if(changed){localStorage.setItem('vocal-zip_mvp_v1',JSON.stringify(data));window.dispatchEvent(new Event('vzip:data-changed'))}
   finish(choices);
  }catch(e){error.textContent='곡 저장 실패: '+e.message}
 };
 actions.append(cancel,start);sheet.append(error,actions);overlay.append(sheet);document.body.append(overlay);entries[0]?.select.focus();
});
window.vzipImportBatch=async(files,options)=>{
 const {host,cancelButton,importFile,onBusy,onSummary,choose}=options;
 const choices=await choose(files);
 if(!choices){onSummary?.('파일 가져오기를 취소했어요.');return}
 const rows=files.map((file,i)=>{
  const row=document.createElement('article');row.className='vzip-upload-progress';
  const status=document.createElement('p');status.setAttribute('role','status');status.textContent=file.name+' · 대기 중';
  const retry=document.createElement('button');retry.type='button';retry.className='btn secondary';retry.textContent='이 파일 다시 시도';retry.hidden=true;
  row.append(status,retry);host.append(row);return {file,name:file.name,choice:{...choices[i],id:crypto.randomUUID()},status,retry,state:'pending'};
 });
 let running=false,controller;
 const summary=()=>onSummary?.((rows.some(x=>x.state==='done')?'보관함 저장 완료 '+rows.filter(x=>x.state==='done').length+'개':'저장된 파일 없음')+' · 실패/취소 '+rows.filter(x=>['failed','cancelled'].includes(x.state)).length+'개'+(rows.find(x=>['failed','cancelled'].includes(x.state))?' · '+rows.find(x=>['failed','cancelled'].includes(x.state)).status.textContent:''));
 const process=async entries=>{
  if(running)return;running=true;onBusy?.(true);controller=new AbortController();
  cancelButton.hidden=false;cancelButton.disabled=false;cancelButton.onclick=()=>controller.abort();
  rows.forEach(x=>x.retry.disabled=true);
  try{
   for(const entry of entries){
    entry.retry.hidden=true;
    if(controller.signal.aborted){entry.state='cancelled';entry.status.textContent=entry.name+' · 업로드 취소';entry.retry.hidden=false;continue}
    entry.state='uploading';
    try{
     await importFile(entry.file,entry.choice,value=>{entry.status.textContent=entry.name+' · '+value},controller.signal);
     entry.state='done';entry.file=null;entry.status.textContent='✓ '+entry.name+' · 보관함 저장 완료';
    }catch(error){
     entry.state=error.name==='AbortError'?'cancelled':'failed';
     entry.status.textContent=entry.name+' · '+(entry.state==='cancelled'?'업로드 취소':'저장 실패: '+error.message);
     entry.retry.hidden=false;
    }
   }
  }finally{running=false;cancelButton.hidden=true;onBusy?.(false);rows.forEach(x=>x.retry.disabled=false);summary()}
 };
 rows.forEach(entry=>entry.retry.onclick=()=>process([entry]));
 const abandon=()=>controller?.abort();window.addEventListener('pagehide',abandon,{once:true});
 await process(rows);
};
})();
