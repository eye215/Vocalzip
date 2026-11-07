/* Non-destructive recovery of recordings made before an account was verified. */
(() => {
  'use strict';
  const scope = window.VzipAccountScope;
  const root = document.getElementById('vzip-cloud-root');
  if (!window.VZIP_DEVICE_SESSIONS_ENABLED || !scope || !root) return;

  const OLD_KEY = 'vzip_account_v1:unclaimed:vocal-zip_mvp_v1';
  const BASE_KEY = 'vocal-zip_mvp_v1';
  const OLD_DB = 'vocalzip_media_v1_account_unclaimed';
  const COLLECTIONS = ['categories', 'songs', 'lessons', 'assignments', 'practices', 'comparisonReports', 'performances'];
  const rawStorage = window.localStorage;

  const signedIn = () => Boolean(
    scope.owner && !scope.leaving &&
    window.vzipCloudSignedIn?.() &&
    window.vzipCloudUserId?.() === scope.owner
  );
  const ensure = owner => {
    if (!signedIn() || scope.owner !== owner) {
      throw Error('로그인 계정이 변경됐어요. 원본은 그대로 남겨 두었어요.');
    }
  };

  function openDb(name, create) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => {
        if (!create) {
          // Never create or alter the unclaimed source while inspecting it.
          request.transaction.abort();
        } else if (!request.result.objectStoreNames.contains('recordings')) {
          request.result.createObjectStore('recordings', { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('recordings')) { db.close(); resolve(null); }
        else resolve(db);
      };
      request.onerror = () => {
        if (!create && request.error?.name === 'AbortError') resolve(null);
        else reject(request.error || Error('기기 음원 저장소를 읽지 못했어요.'));
      };
      request.onblocked = () => reject(Error('다른 VOCAL.zip 탭을 닫고 다시 시도해 주세요.'));
    });
  }

  function requestIn(db, mode, action) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction('recordings', mode);
      const req = action(tx.objectStore('recordings'));
      let value;
      req.onsuccess = () => { value = req.result; };
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => resolve(value);
      tx.onabort = tx.onerror = () => reject(tx.error || Error('기기 저장소 처리에 실패했어요.'));
    });
  }

  function oldData() {
    const text = rawStorage.getItem(OLD_KEY);
    if (!text) return null;
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw Error('미연결 기록 형식을 확인할 수 없어요. 원본은 그대로 보존했어요.');
    }
    return value;
  }

  async function inspect() {
    const data = oldData();
    const records = COLLECTIONS.reduce((sum, key) => sum + (Array.isArray(data?.[key]) ? data[key].length : 0), 0);
    const source = await openDb(OLD_DB, false);
    let fileCount = 0;
    if (source) {
      try { fileCount = (await requestIn(source, 'readonly', store => store.getAllKeys())).length; }
      finally { source.close(); }
    }
    return { records, fileCount };
  }

  async function copyUnclaimed() {
    const owner = scope.owner;
    ensure(owner);
    if (navigator.locks?.request) {
      return navigator.locks.request('vzip-unclaimed-recovery-' + owner, { mode: 'exclusive' }, () => copyLocked(owner));
    }
    // Fail closed rather than permit duplicate concurrent copies on old browsers.
    throw Error('안전한 복구를 위해 최신 Safari에서 다시 시도해 주세요.');
  }

  async function copyLocked(owner) {
    ensure(owner);
    // Read the cloud baseline before any write; tombstones and existing IDs win.
    if (!window.vzipAccountImportBaseline) throw Error('클라우드 상태 확인 기능이 준비되지 않았어요.');
    const baseline = await window.vzipAccountImportBaseline();
    ensure(owner);
    const sourceData = oldData();
    const remote = baseline.payload || {};
    const cloudIds = new Set((baseline.mediaIds || []).map(String));
    const current = JSON.parse(scope.storage.getItem(BASE_KEY) || '{}');
    const deletedMedia = new Set([
      ...(remote.deleted?.media || []),
      ...(current.deleted?.media || []),
      ...(sourceData?.deleted?.media || [])
    ].map(String));
    const summary = { records: 0, files: 0, skipped: 0 };

    // Work from a copy. Never edit or clear the unclaimed storage.
    if (sourceData) {
      for (const collection of COLLECTIONS) {
        const rows = Array.isArray(sourceData[collection]) ? sourceData[collection] : [];
        if (!Array.isArray(current[collection])) current[collection] = [];
        const existing = new Set(current[collection].map(row => String(row.id)));
        const remotelyExisting = new Set((remote[collection] || []).map(row => String(row.id)));
        const tombstones = new Set([
          ...(remote.deleted?.[collection] || []),
          ...(current.deleted?.[collection] || []),
          ...(sourceData.deleted?.[collection] || [])
        ].map(String));
        for (const row of rows) {
          const id = String(row?.id ?? '');
          if (!id || (row.ownerId && row.ownerId !== owner) ||
              existing.has(id) || remotelyExisting.has(id) || tombstones.has(id)) {
            summary.skipped++;
            continue;
          }
          current[collection].push(row);
          existing.add(id);
          summary.records++;
        }
      }
    }

    const source = await openDb(OLD_DB, false);
    if (source) {
      let destination = null;
      try {
        const ids = await requestIn(source, 'readonly', store => store.getAllKeys());
        destination = await openDb(scope.mediaDb(), true);
        if (!destination) throw Error('현재 계정의 저장소를 열 수 없어요.');
        for (const id of ids) {
          ensure(owner);
          if (cloudIds.has(String(id)) || deletedMedia.has(String(id))) {
            summary.skipped++;
            continue;
          }
          let item = await requestIn(source, 'readonly', store => store.get(id));
          if (!item || (item.accountOwner && item.accountOwner !== owner)) {
            summary.skipped++;
            continue;
          }
          if (item.blob instanceof Blob && item.blob.size <= 25 * 1024 * 1024) {
            item = { ...item, bytes: await item.blob.arrayBuffer() };
            delete item.blob;
          }
          ensure(owner);
          const existed = await requestIn(destination, 'readwrite', store => {
            const existing = store.get(id);
            existing.onsuccess = () => {
              if (!existing.result) {
                store.put({ ...item, accountOwner: owner, pendingUpload: true });
              }
            };
            return existing;
          });
          if (existed) summary.skipped++;
          else summary.files++;
        }
      } finally {
        destination?.close();
        source.close();
      }
    }
    ensure(owner);
    if (summary.records) {
      // Save only to the active account namespace. Source remains untouched.
      scope.storage.setItem(BASE_KEY, JSON.stringify(current));
      scope.storage.setItem('vzip_account_dirty', '1');
    }
    window.VZ?.media?.invalidate?.();
    window.dispatchEvent(new CustomEvent('vzip:data-changed', { detail: { source: 'unclaimed-recovery' } }));
    window.dispatchEvent(new Event('vzip:media-saved'));
    return summary;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn secondary';
  button.textContent = '이 기기의 미연결 녹음 찾기 (삭제 없이 검사)';
  button.style.marginTop = '10px';
  const status = document.createElement('p');
  status.className = 'small muted';
  status.setAttribute('role', 'status');
  root.append(button, status);

  button.addEventListener('click', async () => {
    if (!signedIn()) {
      status.textContent = '현재 계정 로그인을 확인한 다음 다시 시도해 주세요.';
      return;
    }
    button.disabled = true;
    try {
      status.textContent = '이 기기의 미연결 저장소를 확인하는 중…';
      const found = await inspect();
      if (!found.records && !found.fileCount) {
        status.textContent = '미연결 저장소에서 기록·녹음 0개를 확인했어요. 다른 브라우저나 홈 화면 앱에 저장됐을 수도 있어요. 기존 자료 가져오기 기능도 확인해 주세요.';
        return;
      }
      status.textContent = '미연결 저장소에서 녹음 ' + found.fileCount + '개, 기록 ' + found.records + '건을 찾았어요.';
      const ok = await window.VZ.confirm(
        '미연결 녹음 복사',
        '찾은 녹음 ' + found.fileCount + '개와 기록 ' + found.records + '건이 현재 로그인 계정의 자료인가요? 원본은 삭제하지 않으며 현재 기록·클라우드 기록을 덮어쓰지 않습니다.',
        { ok: '내 자료를 이 계정으로 복사' }
      );
      if (!ok) return;
      status.textContent = '기록과 녹음을 복사하는 중… 앱을 닫지 마세요.';
      const result = await copyUnclaimed();
      status.textContent = '복사 완료: 녹음 ' + result.files + '개, 기록 ' + result.records + '건. 기존·중복·삭제된 항목 ' + result.skipped + '건은 건드리지 않았어요. 보관함을 다시 열어 확인해 주세요.';
      window.VZ?.toast?.('미연결 녹음 복사가 끝났어요. 보관함을 확인해 주세요.');
    } catch (error) {
      status.textContent = '복구 검사/복사 실패: ' + (error?.message || String(error)) + '. 원본은 삭제하지 않았어요.';
    } finally {
      button.disabled = false;
    }
  });
})();
