/* Lossless merge of two VOCAL.zip data snapshots (device ↔ cloud, or a recovery copy).
 * Records are matched by id. Nothing present on either side is dropped unless it was deleted
 * on purpose (a tombstone in `deleted`). When both sides changed a record, the newer
 * `updatedAt` wins; without timestamps the first argument (this device) wins. */
((root) => {
'use strict';
const COLLECTIONS = ['categories', 'songs', 'lessons', 'assignments', 'practices', 'comparisonReports'];
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
function valid(data) { return isObj(data) && ['lessons', 'practices', 'assignments', 'categories', 'songs'].every(k => Array.isArray(data[k])); }
function count(data) { return valid(data) ? (data.songs.length + data.lessons.length + data.practices.length + data.assignments.length) : 0; }
function merge(primary, secondary) {
  const a = isObj(primary) ? primary : {}, b = isObj(secondary) ? secondary : {};
  const out = {...b, ...a}, deleted = {}, added = {};
  for (const k of COLLECTIONS) {
    const gone = new Set([...(a.deleted?.[k] || []), ...(b.deleted?.[k] || [])]);
    const map = new Map();
    for (const x of Array.isArray(b[k]) ? b[k] : []) if (x && x.id != null) map.set(String(x.id), x);
    let fromSecondary = 0;
    const seenA = new Set();
    for (const x of Array.isArray(a[k]) ? a[k] : []) {
      if (!x || x.id == null) continue;
      const id = String(x.id), other = map.get(id); seenA.add(id);
      if (!other) { map.set(id, x); continue; }
      const ta = Number(x.updatedAt) || 0, tb = Number(other.updatedAt) || 0;
      map.set(id, tb > ta ? other : x);
    }
    for (const id of map.keys()) if (!seenA.has(id) && !gone.has(id)) fromSecondary++;
    // Keep the device's order first, then records that only the other side had.
    const order = [...(Array.isArray(a[k]) ? a[k] : []).map(x => String(x?.id)), ...(Array.isArray(b[k]) ? b[k] : []).map(x => String(x?.id))];
    const seen = new Set();
    out[k] = order.filter(id => id !== 'undefined' && !seen.has(id) && seen.add(id) && map.has(id) && !gone.has(id)).map(id => map.get(id));
    if (!Array.isArray(a[k]) && !Array.isArray(b[k])) delete out[k];
    if (gone.size) deleted[k] = [...gone].slice(-5000);
    added[k] = fromSecondary;
  }
  out.deleted = deleted;
  return {data:out, added};
}
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const api = {COLLECTIONS, merge, valid, count, same};
root.VzipDataMerge = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
