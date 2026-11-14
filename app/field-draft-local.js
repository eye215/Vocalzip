/* 05-A 1단계: 입력 중인 글을 이 기기에 자동으로 임시 저장 (서버 동기화 없음).
 * A long text field (lesson feedback, memos) keeps what is typed on this device while it is being typed, so closing
 * the sheet, a reload or the app being killed on iPhone loses nothing. Opening the same field again brings the
 * unsaved text back with a notice and a way to go back to the saved text. Saving clears the draft.
 *  · Per account and per field: key = owner + entity + field. Another account never sees or overwrites it.
 *  · Only this device: nothing is sent anywhere (the server draft contract, sync/field-draft-outbox.js, needs an
 *    approved database change and is not connected here).
 *  · No text is ever thrown away silently: going back to the saved text keeps the draft as the previous copy, and a
 *    draft whose saved text changed meanwhile (another device) is shown as such instead of being applied quietly. */
(() => {
'use strict';
const VZ = window.VZ; if (!VZ) return;
const PREFIX = 'vzip_field_draft_v1:', LIMIT = 64 * 1024;
const store = () => window.VzipAccountScope?.storage || window.localStorage;
const owner = () => { try { return String(window.vzipCloudUserId?.() || 'local'); } catch { return 'local'; } };
const keyOf = (entity, field) => PREFIX + encodeURIComponent(owner()) + ':' + encodeURIComponent(entity) + ':' + encodeURIComponent(field);
const read = key => { try { const v = JSON.parse(store().getItem(key) || 'null'); return v && typeof v.text === 'string' && v.owner === owner() ? v : null; } catch { return null; } };
const write = (key, value) => { try { const s = JSON.stringify(value); if (s.length > LIMIT) return false; store().setItem(key, s); return true; } catch { return false; } };
const drop = key => { try { store().removeItem(key); } catch {} };

/** The unsaved draft of one field, or null. */
const get = (entity, field) => read(keyOf(entity, field));
/** Clear the drafts of a saved form (call after the save succeeded). */
const clear = (entity, fields) => fields.forEach(f => drop(keyOf(entity, f)));

/**
 * Keep the named fields of a form as drafts. Call clear() after saving and discard() when the sheet is closed
 * without saving (onClose), so only text lost by a reload, crash or killed app is brought back.
 * @param form     the <form>
 * @param entity   stable id of what is edited, e.g. 'lesson:<id>:feedback'
 * @param fields   [{name, saved}] — field name and the text currently saved for it
 * @returns {{clear(): void, restored: number}}
 */
function wire(form, entity, fields) {
  const els = fields.map(f => ({...f, el:form.elements[f.name], key:keyOf(entity, f.name)})).filter(f => f.el);
  const status = document.createElement('p');
  status.className = 'small muted field-draft-status'; status.setAttribute('data-field-draft-status', ''); status.setAttribute('role', 'status'); status.hidden = true;
  let restored = 0, changed = 0;
  for (const f of els) {
    const d = read(f.key);
    if (!d || d.text === (f.saved || '')) { if (d) drop(f.key); continue; }
    f.el.value = d.text; restored++;
    if ((d.base || '') !== (f.saved || '')) changed++;
  }
  if (restored) {
    const note = document.createElement('div');
    note.className = 'ana-note ' + (changed ? 'warn' : 'ok') + ' field-draft-note'; note.setAttribute('data-field-draft-restored', '');
    note.innerHTML = '<i class="ph ph-clock-counter-clockwise" aria-hidden="true"></i><span><b>저장하지 않은 입력을 이어서 보여 드려요.</b> ' +
      (changed ? '그사이 저장된 내용이 바뀌었어요(다른 기기 등). 확인하고 저장해 주세요. ' : '이 기기에만 임시로 남아 있던 글이에요. ') +
      '<button type="button" class="btn sm ghost" data-field-draft-revert>저장된 내용으로 되돌리기</button></span>';
    form.prepend(note);
    note.querySelector('[data-field-draft-revert]').onclick = () => {
      // Going back keeps the unsaved text as the previous copy (never silently lost).
      for (const f of els) { const d = read(f.key); if (d) { write(f.key + ':prev', {...d, revertedAt:Date.now()}); drop(f.key); } f.el.value = f.saved || ''; }
      note.remove(); status.hidden = true;
    };
  }
  form.append(status);
  const save = f => {
    const text = f.el.value;
    if (text === (f.saved || '')) { drop(f.key); }
    else if (!write(f.key, {v:1, owner:owner(), text, base:f.saved || '', at:Date.now()})) { status.hidden = false; status.textContent = '이 기기에 임시 저장하지 못했어요. 저장 버튼을 눌러 주세요.'; return; }
    const dirty = els.some(x => x.el.value !== (x.saved || ''));
    status.hidden = !dirty; status.textContent = '이 기기에만 임시 저장됨 · 저장 버튼을 눌러야 반영돼요';
  };
  els.forEach(f => f.el.addEventListener('input', () => save(f)));
  if (restored) { status.hidden = false; status.textContent = '이 기기에만 임시 저장됨 · 저장 버튼을 눌러야 반영돼요'; }
  return {restored,
    clear() { els.forEach(f => drop(f.key)); },
    // The sheet was closed on purpose (닫기/돌아가기): the text is not offered again, but kept as the previous copy.
    // A reload or the app being killed never reaches this, so the draft comes back there.
    discard() { els.forEach(f => { const d = read(f.key); if (d) { write(f.key + ':prev', {...d, discardedAt:Date.now()}); drop(f.key); } }); }};
}
VZ.fieldDraft = {wire, get, clear, keyOf};
})();
