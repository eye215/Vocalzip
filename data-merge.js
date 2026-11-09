/* Lossless merge of two VOCAL.zip data snapshots (device ↔ cloud, or a recovery copy).
 * Records are matched by id. Nothing present on either side is dropped unless it was deleted
 * on purpose (a tombstone in `deleted`). When both sides changed a record, the newer
 * `updatedAt` wins; without timestamps the first argument (this device) wins. */
((root) => {
'use strict';
const COLLECTIONS = ['categories', 'songs', 'lessons', 'assignments', 'practices', 'comparisonReports', 'performances', 'dailyGoals', 'practicePlans'];
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
    if (gone.size) deleted[k] = [...gone];
    added[k] = fromSecondary;
  }
  const media = [...new Set([...(a.deleted?.media || []), ...(b.deleted?.media || [])])];
  if (media.length) deleted.media = media;
  out.deleted = deleted;
  unlinkMedia(out, media);
  unlinkLessons(out, out.deleted.lessons || []);
  const removedSongs = new Set(out.deleted.songs || []);
  if (out.performances) out.performances = out.performances.map(p => ({...p, songLinks:(p.songLinks || []).map(l => removedSongs.has(l.songId) ? {...l,songId:'',unlinked:true} : l)}));
  return {data:out, added};
}
/** File deletion removes links, never lesson/practice text, minutes or comparison snapshots. */
function unlinkMedia(data, ids) {
  if (!ids.length) return data;
  const gone = new Set(ids);
  if (data.songs) data.songs = data.songs.map(s => gone.has(s.repertoire?.takeId) ? {...s,repertoire:{...s.repertoire,takeId:''}} : s);
  if (data.practices) data.practices = data.practices.map(p => p.mediaIds ? {...p, mediaIds:p.mediaIds.filter(id => !gone.has(id))} : p);
  if (data.lessons) data.lessons = data.lessons.map(l => l.recordings ? {...l, recordings:l.recordings.filter(r => !gone.has(r.id))} : l);
  if (data.comparisonReports) data.comparisonReports = data.comparisonReports.map(original => {
    const r = {...original};
    for (const key of ['firstId', 'secondId']) if (gone.has(r[key])) r[key] = '';
    return r;
  });
  return data;
}
function deleteMedia(data, id) {
  data.deleted ||= {};
  data.deleted.media = [...new Set([...(data.deleted.media || []), id])];
  return unlinkMedia(data, [id]);
}
function unlinkLessons(data,ids){
 const gone=new Set(ids);
 if(data.assignments)data.assignments=data.assignments.map(t=>{
  const linked=[...new Set([...(Array.isArray(t.lessonIds)?t.lessonIds:[]),t.lessonId].filter(Boolean))];
  if(!linked.some(id=>gone.has(id)))return t;
  const keep=linked.filter(id=>!gone.has(id));return {...t,lessonIds:keep,lessonId:keep[0]||''};
 });
 return data;
}
function deleteLesson(data,id){
 data.deleted||={};data.deleted.lessons=[...new Set([...(data.deleted.lessons||[]),id])];
 if(data.lessons)data.lessons=data.lessons.filter(l=>l.id!==id);
 return unlinkLessons(data,[id]);
}
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const api = {COLLECTIONS, merge, valid, count, same, deleteMedia, deleteLesson};
root.VzipDataMerge = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : globalThis);
