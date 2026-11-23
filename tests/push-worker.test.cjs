// share-worker.js › 휴대폰으로 녹음 알림: a push of kind record-handoff shows ONE notification (the song, the device it came
// from) and a tap opens #/record?song=… in the open window, or a new one. Other pushes show nothing. A fake worker scope.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
function load() {
  const handlers = {}, shown = [], opened = [], navigated = [];
  const self = {addEventListener:(t, f) => { (handlers[t] ||= []).push(f); }, skipWaiting:() => {}, registration:{scope:'https://vocalzip.yullul.com/', showNotification:async (title, opts) => { shown.push({title, opts}); }},
    clients:{windows:[], matchAll:async () => self.clients.windows, openWindow:async url => { opened.push(url); }}};
  const ctx = {self, importScripts:() => {}, caches:{open:async () => ({})}, fetch:async () => ({}), URL, console, Response:function () {}};
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, '..', 'share-worker.js'), 'utf8'), ctx);
  const fire = async (type, event) => { const waits = []; event.waitUntil = p => waits.push(p); for (const f of handlers[type] || []) f(event); await Promise.all(waits); };
  return {self, fire, shown, opened, navigated};
}
test('a record-handoff push shows the song and where it came from; a tap opens the recorder with it', async () => {
  const w = load();
  await w.fire('push', {data:{json:() => ({type:'record-handoff', songId:'s 1', title:'Defying Gravity', fromName:'아이패드', at:5})}});
  assert.equal(w.shown.length, 1);
  assert.equal(w.shown[0].title, '녹음 시작 · Defying Gravity');
  assert.equal(w.shown[0].opts.body, '아이패드에서 고른 곡이에요. 눌러서 녹음을 시작해요.');
  assert.equal(w.shown[0].opts.tag, 'record-handoff');
  assert.equal(w.shown[0].opts.data.url, 'https://vocalzip.yullul.com/#/record?song=s%201');
  // No window open: a new one.
  let closed = 0;
  await w.fire('notificationclick', {notification:{data:w.shown[0].opts.data, close:() => { closed++; }}});
  assert.equal(closed, 1); assert.deepEqual(w.opened, ['https://vocalzip.yullul.com/#/record?song=s%201']);
  // An open window: it is focused and goes there.
  const went = [];
  w.self.clients.windows = [{url:'https://vocalzip.yullul.com/#/home', focus:async () => {}, navigate:async url => { went.push(url); }}];
  await w.fire('notificationclick', {notification:{data:w.shown[0].opts.data, close() {}}});
  assert.deepEqual(went, ['https://vocalzip.yullul.com/#/record?song=s%201']);
  assert.equal(w.opened.length, 1);
});
test('any other push shows nothing', async () => {
  const w = load();
  await w.fire('push', {data:{json:() => ({type:'something-else', songId:'x'})}});
  await w.fire('push', {data:{json:() => { throw Error('not json'); }}});
  await w.fire('push', {data:null});
  assert.equal(w.shown.length, 0);
});
