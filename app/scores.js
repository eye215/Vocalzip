/* VOCAL.zip 악보 (Phase 8A): PDF scores kept with a song.
 * The PDF goes to Cloudflare R2 (u/<user>/<scoreId>/original.pdf, the same private upload path as recordings);
 * the list lives on the song (songs[].scores) and syncs like every other record.
 * Each entry keeps what a later PDF → MusicXML conversion needs: id, songId, r2Key, file name, size, upload time. */
(() => {
'use strict';
const VZ = window.VZ;
if (!VZ) return;
const esc = VZ.esc, MAX = 50 * 1024 * 1024;
const KEYS = ['', 'C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'].flatMap(k => k ? [k, k + 'm'] : ['']);
const keySelect = (name, value) => '<select name="' + name + '">' + KEYS.map(k => '<option value="' + esc(k) + '"' + (k === (value || '') ? ' selected' : '') + '>' + (k || '선택 안 함') + '</option>').join('') + '</select>';
const scoresOf = id => (VZ.song(id)?.scores || []).filter(s => !s.deleted);
const size = n => n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB';
const save = (songId, mutate) => VZ.change(d => { const song = d.songs.find(x => x.id === songId); if (!song) throw Error('곡을 찾을 수 없어요.'); song.scores ||= []; mutate(song.scores, song); });

function uploadSheet(song, redraw) {
  if (!window.VzipR2?.enabled?.()) { VZ.toast('악보는 클라우드(R2)에 저장돼요. 로그인 후 다시 시도해 주세요.', 'error'); return; }
  VZ.sheet({title:'악보 올리기', body:'<form id="score-up" class="stack">' +
      '<label class="field"><span>PDF 파일</span><input type="file" name="file" accept="application/pdf,.pdf" required></label>' +
      '<label class="field"><span>제목</span><input type="text" name="title" maxlength="120" placeholder="비워 두면 파일 이름"></label>' +
      '<div class="two"><label class="field"><span>원키</span>' + keySelect('originalKey') + '</label><label class="field"><span>연습 키</span>' + keySelect('practiceKey') + '</label></div>' +
      '<p class="small muted" data-msg>PDF 한 개, 50MB까지. 이 계정에서만 볼 수 있어요.</p></form>',
    foot:'<button type="submit" form="score-up" class="btn block" data-go>올리기</button>',
    onMount:(el, close) => {
      const form = el.querySelector('form'), msg = el.querySelector('[data-msg]'), go = el.parentNode.querySelector('[data-go]');
      let busy = false;
      form.onsubmit = async e => {
        e.preventDefault(); if (busy) return;
        const file = form.file.files[0];
        if (!file) { msg.textContent = 'PDF 파일을 골라 주세요.'; return; }
        if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { msg.textContent = 'PDF 파일만 올릴 수 있어요.'; return; }
        if (file.size > MAX) { msg.textContent = '50MB 이하 PDF만 올릴 수 있어요.'; return; }
        busy = true; go.disabled = true;
        const id = 'score-' + VZ.uid(), pdf = new File([file], file.name, {type:'application/pdf'});
        try {
          const up = await window.VzipR2.upload(pdf, {mediaId:id, type:'application/pdf', onProgress:p => { msg.textContent = '올리는 중 ' + Math.round(p) + '%'; }});
          const entry = {id, songId:song.id, title:form.title.value.trim() || file.name.replace(/\.pdf$/i, ''), fileName:file.name, r2Key:up.key, size:file.size,
            originalKey:form.originalKey.value, practiceKey:form.practiceKey.value, uploadedAt:Date.now(), updatedAt:Date.now()};
          if (!save(song.id, list => list.push(entry))) throw Error('목록에 저장하지 못했어요.');
          close(); VZ.toast('악보를 올렸어요.'); redraw();
        } catch (err) {
          msg.textContent = '올리지 못했어요: ' + err.message + ' · 다시 눌러 재시도할 수 있어요.';
          busy = false; go.disabled = false; go.textContent = '다시 시도';
        }
      };
    }});
}
function editSheet(song, score, redraw) {
  VZ.sheet({title:'악보 정보', body:'<form id="score-edit" class="stack">' +
      '<label class="field"><span>제목</span><input type="text" name="title" maxlength="120" required value="' + esc(score.title) + '"></label>' +
      '<div class="two"><label class="field"><span>원키</span>' + keySelect('originalKey', score.originalKey) + '</label><label class="field"><span>연습 키</span>' + keySelect('practiceKey', score.practiceKey) + '</label></div></form>',
    foot:'<button type="submit" form="score-edit" class="btn block">저장</button>',
    onMount:(el, close) => {
      const form = el.querySelector('form');
      form.onsubmit = e => {
        e.preventDefault();
        const changes = {title:form.title.value.trim() || score.title, originalKey:form.originalKey.value, practiceKey:form.practiceKey.value, updatedAt:Date.now()};
        if (save(song.id, list => Object.assign(list.find(x => x.id === score.id) || {}, changes))) { close(); VZ.toast('저장했어요.'); redraw(); }
      };
    }});
}
async function remove(song, score, redraw) {
  if (!await VZ.confirm('악보 삭제', '"' + score.title + '" PDF를 삭제할까요? 클라우드의 파일도 지워지고 되돌릴 수 없어요. 곡과 녹음은 그대로예요.', {ok:'삭제', danger:true})) return;
  try {
    await window.VzipR2.remove(score.r2Key);
    if (save(song.id, list => { const i = list.findIndex(x => x.id === score.id); if (i >= 0) list.splice(i, 1); })) { VZ.toast('악보를 삭제했어요.'); redraw(); }
  } catch (err) { VZ.toast('삭제하지 못했어요: ' + err.message, 'error'); }
}

/** The 악보 tab of a song page. Links are signed ahead so a tap opens the PDF at once (iOS blocks late popups). */
VZ.renderScores = (host, song) => {
  const draw = () => {
    const list = scoresOf(song.id);
    host.innerHTML = '<div class="row between" style="margin:4px 4px 10px"><h2 class="sec" style="margin:0">악보 ' + list.length + '</h2><button type="button" class="btn sm" data-score-add><i class="ph ph-file-arrow-up"></i>PDF 올리기</button></div>' +
      (list.length ? '<div class="list">' + list.map(s => '<div class="item score-row" data-score="' + esc(s.id) + '"><span class="avatar"><i class="ph ph-file-pdf"></i></span><span class="item-main"><span class="item-title">' + esc(s.title) + '</span><span class="item-sub">' +
        esc([s.originalKey ? '원키 ' + s.originalKey : '', s.practiceKey ? '연습 ' + s.practiceKey : '', VZ.dateLabel(VZ.ymd(new Date(s.uploadedAt))), size(s.size || 0)].filter(Boolean).join(' · ')) + '</span></span>' +
        '<span class="score-actions"><a class="icon-btn" data-open target="_blank" rel="noopener" aria-label="' + esc(s.title) + ' 열기"><i class="ph ph-eye"></i></a><button type="button" class="icon-btn" data-edit aria-label="정보 수정"><i class="ph ph-pencil-simple"></i></button><button type="button" class="icon-btn" data-del aria-label="삭제"><i class="ph ph-trash"></i></button></span></div>').join('') + '</div>'
        : VZ.empty('music-notes', '아직 악보가 없어요. PDF를 올려 두면 이 곡에서 바로 열어 볼 수 있어요.'));
    host.querySelector('[data-score-add]').onclick = () => uploadSheet(song, draw);
    const keys = list.map(s => s.r2Key);
    const link = () => host.querySelectorAll('[data-score]').forEach(row => { const s = list.find(x => x.id === row.dataset.score), a = row.querySelector('[data-open]'), u = s && window.VzipR2?.cachedUrl?.(s.r2Key); if (u) a.href = u; });
    window.VzipR2?.prefetch?.(keys)?.then?.(link); link();
    host.querySelectorAll('[data-score]').forEach(row => {
      const s = list.find(x => x.id === row.dataset.score);
      row.querySelector('[data-open]').onclick = async e => {
        if (e.currentTarget.getAttribute('href')) return; // signed already: the browser opens it
        e.preventDefault();
        try { const u = await window.VzipR2.url(s.r2Key); e.currentTarget.href = u; VZ.toast('준비됐어요. 한 번 더 누르면 열려요.'); } catch (err) { VZ.toast('열지 못했어요: ' + err.message, 'error'); }
      };
      row.querySelector('[data-edit]').onclick = () => editSheet(song, s, draw);
      row.querySelector('[data-del]').onclick = () => remove(song, s, draw);
    });
  };
  draw();
};
})();
