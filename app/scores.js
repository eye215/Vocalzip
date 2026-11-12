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
const keySelect = (name, value) => '<select name="' + name + '" aria-label="' + (name === 'originalKey' ? '원키' : '연습 키') + '">' + KEYS.map(k => '<option value="' + esc(k) + '"' + (k === (value || '') ? ' selected' : '') + '>' + (k || '선택 안 함') + '</option>').join('') + '</select>';
const scoresOf = id => (VZ.song(id)?.scores || []).filter(s => !s.deleted);
const size = n => n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB';
const save = (songId, mutate) => VZ.change(d => { const song = d.songs.find(x => x.id === songId); if (!song) throw Error('곡을 찾을 수 없어요.'); song.scores ||= []; mutate(song.scores, song); });

function uploadSheet(song, redraw) {
  // Choosing a local PDF must not depend on cloud/auth readiness. Check those at submit.
  const owner = () => window.vzipCloudUserId?.() || '';
  VZ.sheet({title:'악보 올리기', body:'<form id="score-up" class="stack">' +
      '<label class="field"><span>PDF 파일</span><span class="btn ghost" style="position:relative;overflow:hidden;min-height:44px"><i class="ph ph-file-arrow-up" aria-hidden="true"></i>PDF 파일 선택' +
      '<input type="file" name="file" aria-label="PDF 파일" accept="application/pdf,.pdf" required style="position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer"></span></label>' +
      '<p class="small muted" data-file-name aria-live="polite" style="overflow-wrap:anywhere">선택한 파일이 없어요.</p>' +
      '<label class="field"><span>제목</span><input type="text" name="title" maxlength="120" placeholder="비워 두면 파일 이름"></label>' +
      '<div class="two"><label class="field"><span>원키</span>' + keySelect('originalKey') + '</label><label class="field"><span>연습 키</span>' + keySelect('practiceKey') + '</label></div>' +
      '<p class="small muted" data-msg role="status">PDF 한 개, 50MB까지. 이 계정에서만 볼 수 있어요. 올리면 음표 변환(시험판)도 자동으로 시작돼요.</p></form>' +
      // A GoodNotes notebook is cut into songs by its outline; its own picker has no type filter because iOS greys out unknown types.
      (VZ.goodnotesImport ? '<div class="stack" style="margin-top:16px"><span class="btn ghost" style="position:relative;overflow:hidden;min-height:44px"><i class="ph ph-notebook" aria-hidden="true"></i>굿노트 파일에서 가져오기' +
      '<input type="file" data-goodnotes aria-label="굿노트 파일" style="position:absolute;inset:0;width:100%;height:100%;margin:0;opacity:0;cursor:pointer"></span>' +
      '<p class="small muted">굿노트에서 ‘GoodNotes 문서’로 내보낸 파일을 고르면, 개요의 곡 제목대로 나눠 악보로 넣고 필기는 따로 수정할 수 있게 옮겨요.</p></div>' : ''),
    foot:'<button type="submit" form="score-up" class="btn block" data-go>올리기</button>',
    onMount:(el, close) => {
      const form = el.querySelector('form'), msg = el.querySelector('[data-msg]'), go = el.querySelector('[data-go]');
      const field = name => form.elements.namedItem(name), input = field('file');
      let busy = false, pending = null;
      const cloudMessage = '파일은 선택할 수 있어요. 올리려면 로그인과 클라우드 연결을 확인해 주세요.';
      if (!window.VzipR2?.enabled?.()) msg.textContent = cloudMessage;
      const notebook = picked => { close(); VZ.goodnotesImport(picked, {song, onDone:redraw}); };
      const goodnotes = el.querySelector('[data-goodnotes]');
      if (goodnotes) goodnotes.onchange = () => { if (goodnotes.files[0]) notebook(goodnotes.files[0]); };
      input.onchange = () => {
        if (VZ.goodnotesImport && /\.goodnotes$/i.test(input.files[0]?.name || '')) { notebook(input.files[0]); return; }
        pending = null;
        el.querySelector('[data-file-name]').textContent = input.files[0]?.name || '선택한 파일이 없어요.';
        msg.textContent = window.VzipR2?.enabled?.() ? 'PDF 한 개, 50MB까지. 이 계정에서만 볼 수 있어요.' : cloudMessage;
      };
      form.onsubmit = async e => {
        e.preventDefault(); if (busy) return;
        const file = input.files[0];
        if (!file) { msg.textContent = 'PDF 파일을 골라 주세요.'; return; }
        if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') { msg.textContent = 'PDF 파일만 올릴 수 있어요.'; return; }
        if (file.size > MAX) { msg.textContent = '50MB 이하 PDF만 올릴 수 있어요.'; return; }
        const account = owner();
        if (!window.VzipR2?.enabled?.() || !account) { msg.textContent = cloudMessage; return; }
        if (pending && pending.owner !== account) { msg.textContent = '로그인 계정이 바뀌었어요. 창을 닫고 다시 열어 주세요.'; return; }
        pending ||= {file, owner:account, id:'score-' + VZ.uid(), receipt:null};
        const current = pending;
        const details = {title:field('title').value.trim() || file.name.replace(/\.pdf$/i, ''), originalKey:field('originalKey').value, practiceKey:field('practiceKey').value};
        busy = true; go.disabled = true;
        for (const control of form.elements) control.disabled = true;
        msg.textContent = '업로드를 준비하고 있어요.';
        try {
          // Keep the receipt if only the metadata save fails, so retry doesn't upload a second PDF.
          current.receipt ||= await window.VzipR2.upload(new File([file], file.name, {type:'application/pdf'}), {
            mediaId:current.id, type:'application/pdf', onProgress:p => { msg.textContent = '올리는 중 ' + Math.round(p) + '%'; }
          });
          if (owner() !== account || !window.vzipCloudSignedIn?.()) throw Error('로그인 계정이 바뀌었어요. 창을 닫고 다시 열어 주세요.');
          if (!current.receipt?.key) throw Error('업로드 결과를 확인하지 못했어요.');
          const entry = {id:current.id, songId:song.id, ...details, fileName:file.name, r2Key:current.receipt.key, size:file.size, uploadedAt:Date.now(), updatedAt:Date.now()};
          if (!save(song.id, list => { if (!list.some(s => s.id === current.id)) list.push(entry); })) throw Error('목록에 저장하지 못했어요.');
          // Decided 2026-11-11: a new score starts its note conversion (OMR) right away; failures never affect the upload.
          const converting = !!window.VzipR2.omr && /\/original\.pdf$/.test(entry.r2Key);
          if (converting) window.VzipR2.omr.request(entry.r2Key).catch(() => {});
          close(); VZ.toast(converting ? '악보를 올렸어요. 음표 변환도 시작했어요.' : '악보를 올렸어요.'); redraw();
        } catch (err) {
          msg.textContent = '올리지 못했어요: ' + err.message + ' · 선택한 파일은 유지돼요.';
          go.textContent = '다시 시도';
        } finally {
          busy = false; go.disabled = false;
          for (const control of form.elements) control.disabled = false;
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
  const owner=window.vzipCloudUserId?.(),session=window.vzipCloudSessionId?.()||'';
  const guard=()=>{if(!owner||window.vzipCloudUserId?.()!==owner||(window.vzipCloudSessionId?.()||'')!==session||window.VzipAccountScope?.leaving)throw Error('로그인이 바뀌어 삭제를 중단했어요.');};
  if (!await VZ.confirm('악보 삭제', '"' + score.title + '" PDF와 연결된 개인 필기를 삭제할까요? 클라우드의 파일도 지워지고 되돌릴 수 없어요. 곡과 녹음은 그대로예요.', {ok:'삭제', danger:true})) return;
  try {
    guard();await window.VzipR2.remove(score.r2Key);if(/\/original\.pdf$/.test(score.r2Key||''))await window.VzipR2.remove(score.r2Key.replace(/original\.pdf$/,'omr.mxl')).catch(()=>{});guard();
    if (VZ.deleteScoreWithInk ? VZ.deleteScoreWithInk(song.id, score) : save(song.id, list => { const i = list.findIndex(x => x.id === score.id); if (i >= 0) list.splice(i, 1); })) { VZ.toast('악보를 삭제했어요.'); redraw(); }
  } catch (err) { VZ.toast('삭제하지 못했어요: ' + err.message, 'error'); }
}

/** The complete PDF row opens the integrated viewer; secondary actions remain independent. */
VZ.renderScores = (host, song) => {
 const draw=()=>{
  const list=scoresOf(song.id);
  if(list.length){
   VZ.preloadScoreInk?.();
   window.VzipR2?.prefetch?.(list.slice(0,5).map(s=>s.r2Key)).catch(()=>{});
  }
  host.innerHTML='<div class="row between" style="margin:4px 4px 10px"><h2 class="sec" style="margin:0">악보 '+list.length+'</h2><button type="button" class="btn sm" data-score-add><i class="ph ph-file-arrow-up"></i>PDF 올리기</button></div>'+
   (list.length?'<div class="list">'+list.map(s=>'<div class="item score-row" data-score="'+esc(s.id)+'"><button type="button" data-score-open aria-label="'+esc(s.title)+' 열기"><span class="avatar"><i class="ph ph-file-pdf"></i></span><span class="item-main"><span class="item-title">'+esc(s.title)+'</span><span class="item-sub">'+
   esc([s.originalKey?'원키 '+s.originalKey:'',s.practiceKey?'연습 '+s.practiceKey:'',VZ.dateLabel(VZ.ymd(new Date(s.uploadedAt))),size(s.size||0)].filter(Boolean).join(' · '))+'</span></span></button>'+
   '<span class="score-actions">'+(VZ.scoreOmrSheet&&s.r2Key?'<button type="button" class="icon-btn" data-omr aria-label="'+esc(s.title)+' 음표로 변환"><i class="ph ph-music-notes"></i></button>':'')+'<button type="button" class="icon-btn" data-edit aria-label="정보 수정"><i class="ph ph-pencil-simple"></i></button><button type="button" class="icon-btn" data-del aria-label="삭제"><i class="ph ph-trash"></i></button></span></div>').join('')+'</div>':
   VZ.empty('music-notes','아직 악보가 없어요. PDF를 올려 두면 이 곡에서 바로 열어 볼 수 있어요.'));
  host.querySelector('[data-score-add]').onclick=()=>uploadSheet(song,draw);
  host.querySelectorAll('[data-score]').forEach(row=>{
   const score=list.find(s=>s.id===row.dataset.score);
   row.onclick=event=>{if(!event.target.closest('[data-edit],[data-del],[data-omr]'))VZ.openScoreInk(song.id,score.id);};
   row.querySelector('[data-omr]')?.addEventListener('click',event=>{event.stopPropagation();VZ.scoreOmrSheet(song,score);});
   row.querySelector('[data-edit]').onclick=event=>{event.stopPropagation();editSheet(song,score,draw);};
   row.querySelector('[data-del]').onclick=event=>{event.stopPropagation();remove(song,score,draw);};
  });
 };
 draw();
};
})();
