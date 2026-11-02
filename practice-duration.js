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
  let listRun = 0;
  const busy = (key, value) => window.vzipSetPracticeBusy?.(key, value);
  const typeOf = file => {
    if (file.type?.startsWith('audio/') || file.type?.startsWith('video/')) return file.type;
    return ({mov:'video/quicktime',mp4:'video/mp4',m4a:'audio/mp4',mp3:'audio/mpeg',
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
      const items = (await window.vzipReadMedia()).sort((a,b) => b.created-a.created);
      if (run !== listRun) return;
      saved.replaceChildren();
      const heading = document.createElement('p');
      heading.className = 'muted'; heading.textContent = '이번 연습에 연결할 보관함 파일을 선택하세요. 같은 파일은 한 번만 합산해요.';
      saved.append(heading);
      const list = document.createElement('div'); list.className = 'vzip-duration-list'; saved.append(list);
      for (const item of items) {
        const label = document.createElement('label'); label.className = 'vzip-duration-item';
        const check = document.createElement('input');
        check.type = 'checkbox'; check.value = item.id; check.checked = linked.has(item.id);
        const name = document.createElement('span'); name.textContent = item.name;
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
    const files = Array.from(input.files || []);
    if (!files.length) return;
    busy('import', true); input.disabled = true; preview.replaceChildren();
    try {
      for (const file of files) {
        const row = document.createElement('p'); row.className = 'vzip-duration-file';
        row.textContent = file.name + ' · 저장 중…'; preview.append(row);
        try {
          const type = typeOf(file);
          if (!/^(audio|video)\//.test(type)) throw Error('음성·영상 파일을 선택해 주세요.');
          const seconds = await duration(file), id = crypto.randomUUID();
          const item = {id, name:file.name, type, blob:blobOf({...file, name:file.name, type, blob:file}),
            created:Date.now(), source:'practice', songId:form.elements.song?.value || '', durationSeconds:seconds};
          await transaction('readwrite', store => store.put(item));
          linked.set(id, {seconds}); calculate();
          row.textContent = '✓ ' + file.name + ' · 보관함 저장 완료 · ' +
            (seconds ? clock(seconds) : '길이 미확인: 시간을 직접 입력해 주세요.');
          window.dispatchEvent(new CustomEvent('vzip:media-saved', {detail:{id,source:'practice'}}));
        } catch (error) { row.textContent = file.name + ' 저장 실패: ' + error.message + ' · 원본을 다시 선택해 주세요.'; }
      }
    } finally { input.value = ''; input.disabled = false; busy('import', false); loadSaved(); }
  };
  window.addEventListener('vzip:media-saved', event => {
    if (event.detail?.attachToPractice && event.detail.id) {
      linked.set(event.detail.id, {seconds:Number(event.detail.durationSeconds) || 0}); calculate();
    }
    loadSaved();
  });
  form.elements.minutes.addEventListener('input', calculate);
  window.addEventListener('vzip:practice-reset', () => {
    linked.clear(); input.value = ''; preview.textContent = '가져온 파일은 보관함에 저장하고 이번 연습에 연결해요.';
    calculate(); loadSaved();
  });
  document.querySelector('[data-tab="practice"]')?.addEventListener('click', loadSaved);
  loadSaved(); calculate();
})();
