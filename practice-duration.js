/* One association map for imported, captured and selected practice media. */
(() => {
  'use strict';
  const form = document.querySelector('#practice-form');
  if (!form) return;
  const input = document.querySelector('#practice-attachments');
  const preview = document.querySelector('#media-preview');
  const saved = document.querySelector('#practice-saved-media');
  const summary = document.querySelector('#practice-time-summary');
  const linked = new Map();
  const localImportLimit=25*1024*1024,maxImportLimit=50*1024*1024;
  input.multiple=false;
  input.accept='.mp4,.mov,.m4v,.m4a,.mp3,.wav,.webm,.aac,.ogg,.flac,video/mp4,video/quicktime,audio/mp4,audio/mpeg,audio/wav';
  const importHint=document.createElement('p');importHint.className='muted';
  importHint.textContent='파일은 한 번에 하나씩, 최대 50MB까지 가져와요. 25MB 초과 파일은 로그인 후 클라우드에 저장하며, 원본 길이 대신 연습 시간을 직접 입력해 주세요.';
  input.after(importHint);
  const cancelImport=document.createElement('button');cancelImport.type='button';cancelImport.className='btn secondary';
  cancelImport.id='vzip-practice-import-cancel';cancelImport.textContent='업로드 취소';cancelImport.hidden=true;
  importHint.after(cancelImport);
  let importController=null;
  cancelImport.onclick=()=>importController?.abort();
  window.addEventListener('pagehide',()=>importController?.abort());
  let listRun = 0;
  const busy = (key, value) => window.vzipSetPracticeBusy?.(key, value);
  const typeOf = file => {
    if (file.type?.startsWith('audio/') || file.type?.startsWith('video/')) return file.type;
    return ({mov:'video/quicktime',mp4:'video/mp4',m4v:'video/mp4',m4a:'audio/mp4',mp3:'audio/mpeg',
      wav:'audio/wav',aac:'audio/aac',ogg:'audio/ogg',webm:'video/webm',flac:'audio/flac'})[
      (file.name || '').split('.').pop().toLowerCase()] || 'application/octet-stream';
  };
  const blobOf = item => item.blob instanceof Blob ?
    (item.blob.type === typeOf(item) ? item.blob : new Blob([item.blob], {type:typeOf(item)})) :
    item.bytes instanceof ArrayBuffer || ArrayBuffer.isView(item.bytes) ?
      new Blob([item.bytes], {type:typeOf(item)}) : null;
  async function transaction(mode, action) {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('vocalzip_media_v1', 1);
      let blocked = false;
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('recordings')) request.result.createObjectStore('recordings', {keyPath:'id'});
      };
      request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
      request.onerror = () => reject(request.error);
      request.onblocked = () => { blocked = true; reject(Error('다른 VOCAL.zip 탭을 닫고 다시 시도해 주세요.')); };
    });
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('recordings', mode), request = action(tx.objectStore('recordings'));
        let result;
        request.onsuccess = () => { result = request.result; };
        request.onerror = () => reject(request.error);
        tx.oncomplete = () => resolve(result);
        tx.onabort = tx.onerror = () => reject(tx.error || Error('파일 저장이 중단됐어요.'));
      });
    } finally { db.close(); }
  }
  window.vzipStorePracticeMedia = async item => {
    // Materialize Files before storing: WebKit may retain a temporary file handle.
    const bytes = await item.blob.arrayBuffer();
    const local = {...item, blob:new Blob([bytes], {type:typeOf(item)})};
    try { await transaction('readwrite', store => store.put(local)); }
    catch (error) {
      if (error.name !== 'DataCloneError' && !/Blob|File data/i.test(error.message || '')) throw error;
      const fallback = {...local, bytes}; delete fallback.blob;
      await transaction('readwrite', store => store.put(fallback));
    }
  };
  window.vzipReadMedia = () => transaction('readonly', store => store.getAll());
  window.vzipMediaBlob = blobOf; window.vzipMediaType = typeOf;
  const clock = value => {
    const seconds = Math.max(0, Math.round(value));
    return Math.floor(seconds / 60) + '분 ' + String(seconds % 60).padStart(2,'0') + '초';
  };
  function calculate() {
    const manual = Math.max(0, Number(form.elements.minutes.value) || 0);
    const seconds = [...linked.values()].reduce((sum, item) => sum + (Number(item.seconds) || 0), 0);
    form.dataset.mediaIds = JSON.stringify([...linked.keys()]);
    form.dataset.mediaSeconds = String(Math.round(seconds));
    form.dataset.totalMinutes = String(Math.round((manual + seconds / 60) * 100) / 100);
    summary.textContent = '직접 연습 ' + manual + '분 + 파일 ' + clock(seconds) + ' = 총 ' + clock(manual * 60 + seconds);
  }
  function duration(file) {
    return new Promise(resolve => {
      const element = document.createElement(typeOf(file).startsWith('video/') ? 'video' : 'audio');
      const url = URL.createObjectURL(file);
      let finished = false;
      const done = value => {
        if (finished) return;
        finished = true; clearTimeout(timeout);
        element.onloadedmetadata = element.onseeked = element.ondurationchange = element.onerror = null;
        element.removeAttribute('src'); element.load(); URL.revokeObjectURL(url);
        resolve(Number.isFinite(value) && value > 0 ? value : 0);
      };
      const timeout = setTimeout(() => done(0), 12000);
      element.preload = 'metadata';
      element.onloadedmetadata = () => {
        if (Number.isFinite(element.duration) && element.duration > 0) done(element.duration);
        else { try { element.currentTime = 1e10; } catch {} }
      };
      element.ondurationchange = element.onseeked = () => {
        if (Number.isFinite(element.duration) && element.duration > 0) done(element.duration);
      };
      element.onerror = () => done(0); element.src = url; element.load();
    });
  }
  async function loadSaved() {
    const run = ++listRun;
    try {
      let warning = '';
      const map = new Map();
      try { (await window.vzipReadMedia()).forEach(item => map.set(item.id, {...item, local:true})); }
      catch (error) { warning = '기기 파일 확인 실패: ' + error.message; }
      if (window.vzipCloudSignedIn?.() && window.vzipCloudMediaList) {
        try {
          (await window.vzipCloudMediaList()).forEach(item =>
            map.set(item.id, {...map.get(item.id), ...item, cloud:true}));
        } catch (error) { warning += (warning ? ' · ' : '') + '클라우드 목록 확인 실패: ' + error.message; }
      }
      const items = [...map.values()].sort((a,b) => b.created-a.created);
      if (run !== listRun) return;
      saved.replaceChildren();
      const heading = document.createElement('p');
      heading.className = 'muted'; heading.textContent = '이번 연습에 연결할 보관함 파일을 선택하세요. 같은 파일은 한 번만 합산해요.';
      saved.append(heading);
      if (warning) {
        const message = document.createElement('p'); message.className = 'muted'; message.setAttribute('role','status');
        message.textContent = warning + ' · 다시 열면 재시도해요.'; saved.append(message);
      }
      if (!items.length) {
        const empty = document.createElement('p'); empty.className = 'empty';
        empty.textContent = '연결할 파일이 없어요. 위에서 녹음하거나 파일을 가져오세요.'; saved.append(empty);
      }
      const list = document.createElement('div'); list.className = 'vzip-duration-list'; saved.append(list);
      for (const item of items) {
        const label = document.createElement('label'); label.className = 'vzip-duration-item';
        const check = document.createElement('input');
        check.type = 'checkbox'; check.value = item.id; check.checked = linked.has(item.id);
        const name = document.createElement('span'); name.textContent = (item.name || '제목 없음') + (item.cloud ? ' · 클라우드' : ' · 이 기기');
        label.append(check, name); list.append(label);
        check.onchange = async () => {
          check.disabled = true; busy('select:' + item.id, true);
          try {
            if (check.checked) {
              const blob = blobOf(item);
              const seconds = Number(item.durationSeconds) || (blob ? await duration(blob) : 0);
              linked.set(item.id, {seconds});
              name.textContent = item.name + (seconds ? ' · ' + clock(seconds) : ' · 길이 미확인: 시간을 직접 입력해 주세요.');
            } else linked.delete(item.id);
            calculate();
          } catch (error) {
            check.checked = linked.has(item.id); summary.textContent = '연결 실패: ' + error.message;
          } finally { check.disabled = false; busy('select:' + item.id, false); }
        };
      }
    } catch (error) { saved.textContent = '보관함을 불러오지 못했어요: ' + error.message; }
  }
  input.onchange = async () => {
    let file=input.files?.[0];if(!file||input.disabled)return;
    busy('import',true);input.disabled=true;preview.replaceChildren();
    const row=document.createElement('p');row.className='vzip-duration-file';preview.append(row);
    const fileName=file.name,songId=form.elements.song?.value||'';
    row.textContent=fileName+' · 저장 중…';
    importController=new AbortController();
    try{
      const type=typeOf(file);
      if(!/^(audio|video)\//.test(type))throw Error('음성·영상 파일을 선택해 주세요.');
      if(!file.size)throw Error('빈 파일은 가져올 수 없어요.');
      if(file.size>maxImportLimit)throw Error('파일당 최대 50MB까지 가져올 수 있어요.');
      let id,seconds=0,cloud=false;
      if(file.size>localImportLimit){
        if(!window.vzipCloudSignedIn?.())throw Error('25MB 초과 파일은 클라우드 로그인이 필요해요.');
        cancelImport.hidden=false;row.textContent=fileName+' · 클라우드에 분할 업로드 중…';
        const metadata=await window.vzipCloudImport(file,{name:fileName,type,source:'practice',songId},
          progress=>{row.textContent=fileName+' · 업로드 '+progress+'%'},
          {signal:importController.signal,onCommit:()=>{cancelImport.hidden=true;row.textContent=fileName+' · 보관함 연결 중…'}});
        id=metadata.id;seconds=Number(metadata.durationSeconds)||0;cloud=true;
      }else{
        seconds=await duration(file);id=crypto.randomUUID();
        const item={id,name:fileName,type,blob:blobOf({name:fileName,type,blob:file}),
          created:Date.now(),source:'practice',songId,durationSeconds:seconds};
        await window.vzipStorePracticeMedia(item);
      }
      linked.set(id,{seconds});calculate();
      row.textContent='✓ '+fileName+' · 보관함 저장 완료'+(cloud?' (클라우드)':'')+' · '+
        (seconds?clock(seconds):'길이 미확인: 시간을 직접 입력해 주세요.');
      window.dispatchEvent(new CustomEvent('vzip:media-saved',{detail:{id,source:'practice'}}));
    }catch(error){
      row.textContent=error.name==='AbortError'?'업로드를 취소했어요. 파일을 연결하지 않았어요.':
        fileName+' 저장 실패: '+error.message+' · 원본을 다시 선택해 주세요.';
    }finally{
      file=null;input.value='';input.disabled=false;cancelImport.hidden=true;importController=null;
      busy('import',false);loadSaved();
    }
  };
  window.addEventListener('vzip:media-saved', event => {
    if (event.detail?.attachToPractice && event.detail.id) {
      linked.set(event.detail.id, {seconds:Number(event.detail.durationSeconds) || 0}); calculate();
    }
    loadSaved();
  });
  for (const event of ['vzip:cloud-media-changed', 'vzip:media-updated', 'vzip:auth-changed'])
    window.addEventListener(event, loadSaved);
  form.elements.minutes.addEventListener('input', calculate);
  window.addEventListener('vzip:practice-reset', () => {
    linked.clear(); input.value = ''; preview.textContent = '가져온 파일은 보관함에 저장하고 이번 연습에 연결해요.';
    calculate(); loadSaved();
  });
  document.querySelector('[data-tab="practice"]')?.addEventListener('click', loadSaved);
  loadSaved(); calculate();
})();
