/* 곡 확인이 필요해 보이는 녹음 (#/song-mismatch; app/song-check-model.js decides). Each take shows why it was picked out
 * ("주로 부른 음역이 6반음 낮아요"), the song whose takes it sits with when there is one, and four answers:
 *   ▶ 듣기 · '<곡>'으로 옮기기 (that song, after a yes) · 곡 바꾸기 (the same 곡 지정 as everywhere) · 맞아요
 * 맞아요 is kept as ONE practicePlans row {id:'song-check-ok', kind:'song-check-ok', ids:[…]} that syncs like other plans,
 * so a take said to be right is not pointed at again on any device. Nothing else is written here: moving a take is
 * app/recording-menu.js saveRecordingSong (title follows the song, as everywhere).
 * Shown on 성장 › 곡 (a line when there is any) and on 성장 › 곡 하나 (that song's takes). */
(() => {
'use strict';
const V = window.VZ, M = V?.media, C = window.VzipSongCheck;
if (!V || !M || !C || typeof document === 'undefined') return;
const e = V.esc, ROW = 'song-check-ok';
const title = id => V.songTitle?.(id) || '곡';
const day = d => d ? V.dateLabel(d).replace(/ \(.*$/, '') : '';
const josaRo = w => { const c = String(w).charCodeAt(String(w).length - 1) - 0xAC00; return c < 0 || c > 11171 ? '(으)로' : c % 28 === 0 || c % 28 === 8 ? '로' : '으로'; };
const okRow = () => (V.db.practicePlans || []).find(p => p?.id === ROW && p.kind === ROW && !(V.db.deleted?.practicePlans || []).includes(p.id));
const dismissed = () => okRow()?.ids || [];
function takesOf(items) {
  const ds = V.growthDataset?.(items);
  const rows = ds ? ds.pick('songList').filter(r => !r.deleted).map(r => r.m) : items.filter(m => m.songId);
  return rows.filter(m => m?.songId && V.song(m.songId)).map(m => ({id:m.id, songId:m.songId, date:M.dateOf(m), a:m.analysis}));
}
const suspects = items => C.suspects(takesOf(items), {dismissed:dismissed()}).filter(s => V.song(s.songId));

function rowHtml(s, byId) {
  const m = byId.get(String(s.id));
  return '<li class="sc-row" data-sc-row="' + e(s.id) + '"><div class="sc-head"><strong>' + e(m ? M.label(m) : '녹음') + '</strong><small>' + e([title(s.songId), day(s.date)].filter(Boolean).join(' · ')) + '</small></div>' +
    '<p class="sc-why">' + e(C.reasonText(s)) + (s.likeSongId ? ' · <b>‘' + e(title(s.likeSongId)) + '’ 녹음들과 비슷해요</b>' : '') + '</p>' +
    '<div class="sc-actions"><button type="button" data-sc-play><i class="ph-fill ph-play" aria-hidden="true"></i>듣기</button>' +
    (s.likeSongId ? '<button type="button" class="is-main" data-sc-move="' + e(s.likeSongId) + '">‘' + e(title(s.likeSongId)) + '’' + josaRo(title(s.likeSongId)) + ' 옮기기</button>' : '') +
    '<button type="button" data-sc-pick>곡 바꾸기</button><button type="button" data-sc-ok>맞아요</button></div><div class="sc-player" data-sc-player></div></li>';
}
/** The list for these suspects (all songs, or one). */
function listHtml(list, items, {empty = ''} = {}) {
  if (!list.length) return empty ? '<p class="sc-empty" data-sc-empty>' + e(empty) + '</p>' : '';
  const byId = new Map(items.map(m => [String(m.id), m]));
  return '<ul class="sc-list" data-sc-list>' + list.map(s => rowHtml(s, byId)).join('') + '</ul>';
}
let player = null;
function wire(host, items, repaint) {
  const byId = new Map(items.map(m => [String(m.id), m]));
  host.querySelectorAll('[data-sc-row]').forEach(row => {
    const id = row.dataset.scRow, m = byId.get(id);
    row.querySelector('[data-sc-play]').onclick = () => {
      try { player?.destroy?.(); } catch {} host.querySelectorAll('[data-sc-player]').forEach(x => x.replaceChildren());
      if (!m) return V.toast('녹음을 찾을 수 없어요.', 'error');
      player = M.player(row.querySelector('[data-sc-player]'), m, {}); player.play?.();
    };
    const move = async songId => {
      if (!m || !V.saveRecordingSong) return;
      try { await V.saveRecordingSong(m, songId); m.songId = songId; M.invalidate?.(); V.toast('‘' + (V.song(songId) ? title(songId) : '곡 미지정') + '’' + josaRo(title(songId)) + ' 옮겼어요.'); repaint(); }
      catch (error) { V.toast('곡을 바꾸지 못했어요: ' + error.message, 'error'); }
    };
    row.querySelector('[data-sc-move]')?.addEventListener('click', async ev => {
      const to = ev.currentTarget.dataset.scMove;
      if (!await V.confirm('곡 옮기기', '이 녹음을 ‘' + title(to) + '’' + josaRo(title(to)) + ' 옮길까요?', {ok:'옮기기'})) return;
      move(to);
    });
    row.querySelector('[data-sc-pick]').onclick = async () => { if (!m || !V.pickRecordingSong) return; const v = await V.pickRecordingSong([m]); if (v != null) move(v); };
    row.querySelector('[data-sc-ok]').onclick = () => {
      const ok = V.change(db => {
        db.practicePlans ||= [];
        const at = db.practicePlans.findIndex(p => p?.id === ROW), ids = [...new Set([...(at >= 0 ? db.practicePlans[at].ids || [] : []), id])];
        const r = {id:ROW, kind:ROW, v:1, ids, updatedAt:Date.now()};
        if (at < 0) db.practicePlans.push(r); else db.practicePlans[at] = r;
      }, {silent:true});
      if (ok) { V.toast('맞다고 해 두었어요. 다시 묻지 않아요.'); repaint(); }
    };
  });
}
V.songCheck = {takesOf, suspects, listHtml, wire, dismissed};

V.route('song-mismatch', {title:'곡 점검', back:true, tab:'growth', noAutoRefresh:true,
  render:() => '<div class="sc" data-sc>' + (V.loadingRows?.(3) ?? '<p class="muted" role="status">불러오는 중…</p>') + '</div>',
  async mount(main) {
    const host = main.querySelector('[data-sc]');
    let items = [];
    try { items = await M.list(); } catch { items = M.cached?.() || []; }
    const paint = () => {
      if (!host.isConnected) return;
      const list = suspects(items);
      host.innerHTML = '<p class="sc-lead">같은 곡은 부를 때마다 비슷한 음역에서 불러요. 이 곡의 다른 녹음과 음역이 많이 다른 녹음이에요. 곡이 잘못 들어갔거나, 다른 키로 불렀거나, 음이 한 옥타브 잘못 재졌을 수 있어요. 들어 보고 골라 주세요.</p>' +
        listHtml(list, items, {empty:'확인이 필요해 보이는 녹음이 없어요.'}) +
        '<p class="sc-note">분석한 녹음이 4개 넘는 곡만 살펴요. ‘맞아요’라고 한 녹음은 다시 묻지 않아요.</p>';
      wire(host, items, paint);
    };
    paint();
  }});
})();
