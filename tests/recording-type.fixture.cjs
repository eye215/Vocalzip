// Seed for the 녹음 유형 characterization (tests/recording-type-characterization.spec.cjs): every combination of the
// stored fields that decide a recording's type — recordingCategory, occasion, lesson / practice links, source and the
// practice-room id shape — plus a small cloud list that puts at least one recording in every 전체 녹음 tab.
const CATEGORY = [undefined, 'song', 'lesson', 'training', 'room', 'other'];
const OCCASION = [undefined, 'performance', 'lesson', 'practice', 'audition'];
const LINK = ['none', 'lesson', 'practice-song', 'practice-training', 'practice-room', 'lesson+training'];
const SOURCE = [undefined, 'practice', 'record', 'lesson', 'import', 'practice-room'];
const ROOM_ID = [false, true];
const DAY = '2026-11-09';

// A 노래 연습실 submission as app/practice-room-model.js stores it; its recording is 'roomsubmit1-0'.
const ROOM = {id:'roomsubmit1', task:'basics', chapterId:'comfortable-voice', title:'편한 소리로 한 구절 남기기', songId:'', date:DAY + 'T10:00:00.000Z', analysis:{status:'reflection', summary:''}, recommendation:'reflection', mood:'', summary:'',
  aiCoach:'', aiConditionCheck:false, aiNextTask:'', draft:{difficulty:'', comfort:'', symptoms:[], memo:'', answers:[]}, demo:false, audioIds:[{id:'roomsubmit1-0', name:'녹음', duration:60, cloud:true}], seconds:300, variant:'normal'};

/** Every combination, in a fixed order. `key` names the combination in a failure message. */
function combos() {
  const out = [];
  for (const category of CATEGORY) for (const occasion of OCCASION) for (const link of LINK) for (const source of SOURCE) for (const roomId of ROOM_ID) {
    const n = out.length, id = roomId ? 'roomsub' + String(n).padStart(5, '0') + '-' + (n % 2) : 'c' + String(n).padStart(5, '0');
    const item = {id, name:'녹음 ' + n, type:'audio/mp4', created:new Date(2026, 10, 9, 12).getTime(), recordedDate:DAY, durationSeconds:60, songId:'', song:''};
    if (category !== undefined) item.recordingCategory = category;
    if (occasion !== undefined) item.occasion = occasion;
    if (source !== undefined) item.source = source;
    out.push({key:[category ?? '-', occasion ?? '-', link, source ?? '-', roomId ? 'room-id' : 'id'].join(' / '), link, item});
  }
  return out;
}
/** Lessons and practices that hold the linked combinations (and the cloud rows below). */
function db(list = combos()) {
  const ids = kind => list.filter(c => c.link === kind || (c.link === 'lesson+training' && (kind === 'lesson' || kind === 'practice-training'))).map(c => c.item.id);
  const practice = (id, extra) => ({id, date:DAY, minutes:10, songId:'', technique:[], rating:3, memo:'', completed:[], ...extra});
  return {categories:[], songs:[{id:'s1', title:'Defying Gravity'}, {id:'s2', title:'On My Own'}], assignments:[], comparisonReports:[],
    lessons:[{id:'l1', date:DAY, startTime:'19:00', songIds:[], songId:'', status:'done', feedback:'', memo:'', recordings:[...ids('lesson'), 'row-linked-lesson'].map(id => ({id, note:''}))}],
    practices:[
      practice('p-song', {songId:'s1', practiceMode:'song', mediaIds:[...ids('practice-song'), 'row-practice-song']}),
      practice('p-training', {practiceMode:'training', mediaIds:[...ids('practice-training'), 'row-practice-training']}),
      practice('practice-room:roomsubmit1', {practiceMode:'training', mediaIds:[...ids('practice-room'), 'row-practice-room'], practiceRoom:ROOM})]};
}
/** Cloud rows as the app lists them: one per way a recording gets its type today. */
function rows() {
  const base = new Date(2026, 10, 9, 12).getTime();
  const defs = [
    ['row-plain', {source:'practice'}],
    ['row-import', {source:'import', occasion:'practice'}],
    ['row-song-s1', {source:'practice', songId:'s1', song:'Defying Gravity'}],
    ['row-performance', {source:'import', occasion:'performance', songId:'s1', song:'Defying Gravity'}],
    ['row-practice-song', {source:'practice', songId:'s1', song:'Defying Gravity'}],
    ['row-explicit-song', {source:'lesson', recordingCategory:'song', occasion:'practice'}],
    ['row-source-lesson', {source:'lesson'}],
    ['row-occasion-lesson', {source:'import', occasion:'lesson'}],
    ['row-linked-lesson', {source:'practice'}],
    ['row-explicit-lesson', {source:'practice', recordingCategory:'lesson'}],
    ['row-lesson-performance', {source:'practice', recordingCategory:'lesson', occasion:'performance'}],
    ['row-practice-training', {source:'practice'}],
    ['row-explicit-training', {source:'import', recordingCategory:'training', occasion:'practice'}],
    ['row-practice-room', {source:'practice'}],
    ['row-source-room', {source:'practice-room'}],
    ['roomsubmit1-0', {source:'practice'}],
    ['row-explicit-room', {source:'practice', recordingCategory:'room'}]];
  return Object.fromEntries(defs.map(([id, extra], i) => [id, {id, name:'유형 ' + id, created:base - i * 3600000, type:'audio/mp4', durationSeconds:60 + i, songId:'', song:'', storageProvider:'r2', r2Key:'u/ui-test-user/' + id + '/original.m4a', size:200000, ...extra}]));
}
module.exports = {combos, db, rows, DAY};
