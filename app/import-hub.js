/* VOCAL.zip — 기존 자료 가져오기 (Media PRD step A).
 * Pick many files from Photos / iCloud Drive / Voice Memos, read their capture date and length
 * without extracting, filter by date and length, flag duplicates and missing dates, suggest songs,
 * then import only what the user confirmed. Nothing is uploaded before the user presses import. */
(() => {
'use strict';
const VZ = window.VZ, M = VZ.media, esc = VZ.esc;
const SOURCES = {
  photos:{icon:'images', title:'사진 앱 / iCloud 사진', sub:'노래·레슨 영상', accept:'video/*,.mov,.mp4,.m4v', start:'2025-12-31', end:'2026-09-13',
    tip:'사진 보관함에서 영상을 여러 개 선택하세요. 영상은 원본 음성만 추출해 저장해요.'},
  drive:{icon:'cloud', title:'iCloud Drive', sub:'음원·영상 파일', accept:'audio/*,video/*,.m4a,.mp3,.wav,.aac,.flac,.ogg,.mov,.mp4,.m4v', start:'', end:'',
    tip:'파일 앱에서 폴더를 열고 여러 파일을 선택하세요.'},
  memo:{icon:'microphone', title:'음성 메모', sub:'노래 연습 녹음', accept:'audio/*,.m4a,.mp3,.wav,.aac,.caf', start:'2025-07-24', end:'today',
    tip:'음성 메모 앱에서 녹음을 선택 → 공유 → "파일에 저장"으로 한 폴더에 모은 뒤, 여기서 그 폴더의 파일을 여러 개 선택하세요.'},
  vocalzip:{icon:'archive', title:'기존 Vocalzip', sub:'저장된 파일 이전', accept:'', disabled:true,
    tip:'Cloudflare R2 저장소를 설정하면 기존 파일을 옮길 수 있어요. 지금은 기존 저장소(기기·클라우드)에 그대로 안전하게 보관돼요.'}
};
const KEY = 'vzip_import_hub_conditions_v1';
const SOURCE_TYPE = {photos:'photos', drive:'icloud-drive', memo:'voice-memo'};
let hub = fresh();
function fresh() { return {source:null, phase:'source', rows:[], filter:'all', group:false, autoPractice:true, progress:'', cond:null, occasion:'practice'}; }
function conditionsFor(source) {
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || '{}')[source] || {}; } catch {}
  const s = SOURCES[source];
  return {start:saved.start ?? s.start, end:saved.end ?? (s.end === 'today' ? VZ.today() : s.end), min:saved.min ?? 30, max:saved.max ?? 480};
}
function saveConditions() { try { const all = JSON.parse(localStorage.getItem(KEY) || '{}'); all[hub.source] = {...hub.cond, end:hub.source === 'memo' && hub.cond.end === VZ.today() ? undefined : hub.cond.end}; localStorage.setItem(KEY, JSON.stringify(all)); } catch {} }
const mmss = sec => sec == null ? '—' : VZ.clock(sec);
const parseMmss = text => { const m = String(text).trim().match(/^(\d+)(?::(\d{1,2}))?$/); return m ? Number(m[1]) * (m[2] != null ? 60 : 1) + Number(m[2] || 0) : null; };
const dateFromName = name => { const m = String(name).match(/(20\d{2})[-._ ]?(0[1-9]|1[0-2])[-._ ]?(0[1-9]|[12]\d|3[01])/); return m ? m[1] + '-' + m[2] + '-' + m[3] : ''; };

/* ---------- song suggestion (file name / title / show / aliases; no transcription yet) ---------- */
const norm = t => String(t || '').toLowerCase().normalize('NFC').replace(/\.[a-z0-9]{2,4}$/, '').replace(/[^0-9a-z가-힣]+/g, ' ').trim();
VZ.suggestSongs = name => {
  const n = norm(name), compact = n.replace(/ /g, ''), words = new Set(n.split(' ').filter(w => w.length > 1));
  const out = [];
  for (const s of VZ.db.songs) {
    let best = 0;
    for (const label of [s.title, ...(s.aliases || [])]) {
      const l = norm(label), lc = l.replace(/ /g, '');
      if (lc.length >= 2 && compact.includes(lc)) best = Math.max(best, 0.95);
      else { const lw = l.split(' ').filter(w => w.length > 1); if (lw.length) { const hit = lw.filter(w => words.has(w)).length / lw.length; if (hit >= 0.5) best = Math.max(best, 0.4 + hit * 0.4); } }
    }
    if (best) out.push({id:s.id, score:best});
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 3);
};

/* ---------- analysis ---------- */
async function analyze(files) {
  hub.phase = 'analyzing'; hub.rows = []; draw();
  const existing = await M.list().catch(() => []);
  const known = {hash:new Set(existing.map(m => m.fileHash).filter(Boolean)), nameSize:new Set(existing.map(m => (m.originalMedia?.name || m.originalFilename || '') + '|' + (m.originalMedia?.size || m.size || '')))};
  const seenHash = new Map();
  for (const [i, file] of files.entries()) {
    hub.progress = '파일 확인 중 ' + (i + 1) + '/' + files.length + ' · ' + file.name; drawProgress();
    const row = {id:VZ.uid(), file, name:file.name, size:file.size, type:M.typeOf(file), state:'pending', song:'', approved:false, occasion:hub.occasion || 'practice'};
    try {
      const info = await window.vzipInspectMedia(file);
      row.readable = info.readable !== false;
      row.duration = info.duration ?? (await M.measure({blob:file, type:row.type, name:file.name}, 8000) || null);
      row.video = info.hasVideo || row.type.startsWith('video/');
      const meta = info.metadata || {};
      const fromName = dateFromName(file.name);
      // Only the file's own capture/recording date is trusted; anything else waits for the user.
      if (meta.dateSource === 'metadata') Object.assign(row, {date:meta.recordedDate, dateSource:'metadata', dateOk:true});
      else if (fromName) Object.assign(row, {date:fromName, dateSource:'filename', dateOk:true});
      else Object.assign(row, {date:meta.recordedDate || '', dateSource:'unconfirmed', dateOk:false});
      row.hash = await M.fingerprint(file);
    } catch (e) { row.error = e.message; }
    if (!/^(audio|video)\//.test(row.type)) row.error = '지원하지 않는 형식이에요.';
    row.dup = known.hash.has(row.hash) || known.nameSize.has(file.name + '|' + file.size) ? '보관함에 이미 있어요' : seenHash.has(row.hash) ? '선택한 파일끼리 같아요' : '';
    if (!seenHash.has(row.hash)) seenHash.set(row.hash, row);
    const sug = VZ.suggestSongs(file.name);
    row.suggestions = sug; if (sug[0]?.score >= 0.9) row.song = sug[0].id;
    evaluate(row);
    row.selected = row.status === 'ok';
    hub.rows.push(row);
  }
  hub.phase = 'review'; hub.progress = ''; draw();
}
/** ok | dup | needs-date | out | error */
function evaluate(row) {
  const c = hub.cond;
  row.reasons = [];
  if (row.error) { row.status = 'error'; return; }
  if (row.duration == null) row.reasons.push('길이 확인 불가');
  else if (row.duration < c.min || row.duration > c.max) row.reasons.push('길이 ' + mmss(row.duration));
  if (row.dateOk && row.date && ((c.start && row.date < c.start) || (c.end && row.date > c.end))) row.reasons.push('기간 밖 ' + VZ.dateLabel(row.date));
  row.status = row.reasons.length ? 'out' : row.dup ? 'dup' : !row.dateOk ? 'needs-date' : 'ok';
}

/* ---------- import ---------- */
async function runImport(rows) {
  hub.phase = 'importing'; draw(); M.keepAwake(true);
  try { await importRows(rows); } finally { M.keepAwake(false); }
}
async function importRows(rows) {
  for (const row of rows) {
    if (row.state === 'done') continue;
    row.state = 'uploading'; row.msg = '준비 중…'; drawRow(row);
    try {
      const song = VZ.song(row.song);
      const extra = {occasion:row.occasion, sourceType:SOURCE_TYPE[hub.source], originalFilename:row.name, fileHash:row.hash, importedAt:Date.now(), recordedAtSource:row.dateSource === 'metadata' ? 'metadata' : row.dateSource === 'filename' ? 'filename' : 'user'};
      const saved = await M.importFile(row.file, {id:row.id, songId:song ? song.id : '', song:VZ.songLabel(song), date:row.dateSource === 'metadata' ? '' : row.date, extra},
        p => { row.msg = typeof p === 'number' ? '업로드 ' + p + '%' : String(p); drawRow(row); });
      row.state = 'done'; row.msg = '✓ 저장됨'; row.saved = saved; row.file = null;
    } catch (e) { row.state = 'failed'; row.msg = '실패: ' + e.message; }
    drawRow(row);
  }
  // Practice records for files whose song the user confirmed (one per file, never duplicated).
  let made = 0;
  if (hub.autoPractice) {
    const linked = new Set(VZ.db.practices.flatMap(p => p.mediaIds || []));
    const todo = rows.filter(r => r.state === 'done' && r.song && r.occasion === 'practice' && !linked.has(r.id));
    if (todo.length) VZ.change(d => { for (const r of todo) {
      const minutes = Math.max(0.1, Math.round((Number(r.saved?.durationSeconds || r.duration) || 0) / 6) / 10);
      d.practices.push({id:VZ.uid(), date:M.dateOf(r.saved) || r.date, minutes, manualMinutes:minutes, mediaSeconds:0, mediaIds:[r.id], practiceMode:'song', technique:[], songId:r.song, categoryId:'', categoryLabel:'', detail:'', rating:0,
        memo:'', completed:[], assignmentNotes:{}, importedFrom:SOURCE_TYPE[hub.source], suggestedSongId:r.suggestions?.[0]?.id || '', confirmedSongId:r.song});
      made++; } }, {silent:true});
  }
  hub.made = (hub.made || 0) + made;
  hub.phase = 'done'; M.invalidate(); draw();
}

/* ---------- view ---------- */
VZ.route('import-hub', {title:'기존 자료 가져오기', back:true, tab:'record', noAutoRefresh:true,
  render() { return '<div data-hub></div>'; },
  mount(main) {
    VZ.setGuard(() => hub.phase === 'review' && hub.rows.some(r => r.selected) ? '분석한 파일을 아직 가져오지 않았어요. 나가면 선택이 사라져요. 나갈까요?' : hub.phase === 'importing' ? '가져오는 중이에요. 나가면 남은 파일은 가져오지 않아요. 나갈까요?' : '');
    draw();
  },
  leave() { if (hub.phase !== 'importing') { M.destroyAll(); if (['done', 'source'].includes(hub.phase)) hub = fresh(); } }});
function host() { return document.querySelector('[data-hub]'); }
function draw() {
  const h = host(); if (!h) return;
  if (hub.phase === 'source') {
    h.innerHTML = '<p class="muted" style="margin-top:0">어디에 있는 자료를 가져올까요? 선택한 파일은 가져오기를 누르기 전까지 올라가지 않아요.</p><div class="stack">' +
      Object.entries(SOURCES).map(([k, s]) => '<button type="button" class="card item" data-src="' + k + '"' + (s.disabled ? ' aria-disabled="true"' : '') + '><span class="avatar"><i class="ph ph-' + s.icon + '"></i></span><span class="item-main"><span class="item-title">' + esc(s.title) + '</span><span class="item-sub">' + esc(s.sub) + (s.disabled ? ' · R2 설정 후' : '') + '</span></span><i class="ph ph-caret-right chev"></i></button>').join('') + '</div>';
    h.querySelectorAll('[data-src]').forEach(b => b.onclick = () => {
      const k = b.dataset.src;
      if (SOURCES[k].disabled) { VZ.toast(SOURCES[k].tip); return; }
      hub.source = k; hub.cond = conditionsFor(k); hub.phase = 'pick'; draw();
    });
    return;
  }
  const s = SOURCES[hub.source], c = hub.cond;
  if (hub.phase === 'pick') {
    h.innerHTML = '<div class="row" style="margin-bottom:8px"><span class="avatar"><i class="ph ph-' + s.icon + '"></i></span><strong class="grow">' + esc(s.title) + '</strong><button type="button" class="btn sm ghost" data-reset>출처 변경</button></div>' +
      '<div class="card stack"><strong>가져오기 조건</strong>' +
      '<div class="two"><label class="field" style="margin:0"><span>시작일</span><input type="date" data-c="start" value="' + esc(c.start) + '"></label><label class="field" style="margin:0"><span>종료일</span><input type="date" data-c="end" value="' + esc(c.end) + '"></label></div>' +
      '<div class="two"><label class="field" style="margin:0"><span>최소 길이 (분:초)</span><input type="text" inputmode="numeric" data-c="min" value="' + mmss(c.min) + '"></label><label class="field" style="margin:0"><span>최대 길이 (분:초)</span><input type="text" inputmode="numeric" data-c="max" value="' + mmss(c.max) + '"></label></div>' +
      '<p class="small muted" style="margin:0">날짜는 파일 속 촬영·녹음일 기준이에요. 길이는 최소·최대 값을 포함해요. 원본 날짜가 없는 파일은 "날짜 확인 필요"로 따로 보여 드려요.</p></div>' +
      '<p class="small muted">' + esc(s.tip) + '</p>' +
      '<label class="btn block" style="cursor:pointer"><i class="ph ph-folder-open"></i>파일 여러 개 선택<input type="file" multiple accept="' + esc(s.accept) + '" class="sr-only" data-files></label>';
    h.querySelector('[data-reset]').onclick = () => { hub = fresh(); draw(); };
    h.querySelectorAll('[data-c]').forEach(inp => inp.onchange = () => {
      const k = inp.dataset.c;
      if (k === 'min' || k === 'max') { const v = parseMmss(inp.value); if (v == null) { VZ.toast('길이는 분:초로 입력해 주세요. 예: 0:30, 8:00', 'error'); inp.value = mmss(c[k]); return; } c[k] = v; inp.value = mmss(v); }
      else c[k] = inp.value;
      saveConditions();
    });
    h.querySelector('[data-files]').onchange = e => { const files = [...e.target.files]; e.target.value = ''; if (files.length) analyze(files); };
    return;
  }
  if (hub.phase === 'analyzing') { h.innerHTML = '<div class="card stack"><strong>파일 분석 중</strong><p class="small muted" data-progress style="margin:0">' + esc(hub.progress) + '</p><p class="small muted" style="margin:0">파일을 올리지 않고 날짜·길이만 읽고 있어요.</p></div>'; return; }
  const rows = hub.rows, count = st => rows.filter(r => r.status === st).length;
  const chips = [['all', '전체 ' + rows.length], ['ok', '조건 충족 ' + count('ok')], ['dup', '중복 의심 ' + count('dup')], ['needs-date', '날짜 확인 필요 ' + count('needs-date')], ['out', '조건 밖 ' + count('out')], ['error', '읽기 실패 ' + count('error')]].filter(([k, label]) => k === 'all' || !label.endsWith(' 0'));
  const visible = rows.filter(r => hub.filter === 'all' || r.status === hub.filter).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const songOpts = v => '<option value="">곡 미지정</option>' + VZ.songsNewest().map(x => '<option value="' + esc(x.id) + '"' + (x.id === v ? ' selected' : '') + '>' + esc(x.title) + '</option>').join('');
  const rowHtml = r => {
    const sug = r.suggestions?.[0], sugSong = sug && VZ.song(sug.id);
    const badge = {ok:'', dup:'<span class="badge warn">중복 의심 · ' + esc(r.dup) + '</span>', 'needs-date':'<span class="badge warn">날짜 확인 필요</span>', out:'<span class="badge">' + esc(r.reasons.join(' · ')) + '</span>', error:'<span class="badge danger">' + esc(r.error || '읽기 실패') + '</span>'}[r.status];
    return '<div class="hub-row" data-row="' + r.id + '"><label class="hub-check"><input type="checkbox" data-sel' + (r.selected ? ' checked' : '') + (r.status === 'error' || r.state === 'done' ? ' disabled' : '') + ' aria-label="' + esc(r.name) + ' 선택"></label><div class="hub-main">' +
      '<div class="hub-top"><strong>' + (r.dateOk ? esc(VZ.dateLabel(r.date)) : '날짜 미확인') + '</strong><span class="small muted">' + mmss(r.duration) + (r.video ? ' · 영상→음성' : '') + '</span></div>' +
      '<div class="small muted hub-name" title="' + esc(r.name) + '">' + esc(r.name) + '</div>' + (badge ? '<div>' + badge + '</div>' : '') +
      (r.status === 'needs-date' || r.dateSource === 'filename' ? '<label class="hub-date"><span class="small">녹음 날짜' + (r.dateSource === 'filename' ? ' (파일명)' : r.date ? ' · 파일 수정일 ' + esc(r.date) + '을 넣어 뒀어요' : '') + '</span><input type="date" data-date value="' + esc(r.date || '') + '"></label>' : '') +
      '<div class="hub-song"><select data-occ-row aria-label="' + esc(r.name) + ' 종류">' + M.OCCASIONS.map(([k, v]) => '<option value="' + k + '"' + (r.occasion === k ? ' selected' : '') + '>' + v + '</option>').join('') + '</select><select data-song aria-label="' + esc(r.name) + ' 곡">' + songOpts(r.song) + '</select>' + (sugSong && r.song !== sug.id ? '<button type="button" class="chip" data-approve>추천: ' + esc(sugSong.title) + ' 승인</button>' : '') + '</div>' +
      '<div class="hub-actions"><button type="button" class="chip" data-play><i class="ph ph-play"></i> 들어보기</button><span class="small" data-msg>' + esc(r.msg || '') + '</span></div><div data-p></div></div></div>';
  };
  let list;
  if (hub.group) {
    const groups = new Map(); for (const r of visible) { const k = r.song || r.suggestions?.[0]?.id || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    list = [...groups.entries()].map(([k, rs]) => '<h3 class="cal-group">' + esc(VZ.songTitle(k) || '곡 미지정') + ' · ' + rs.length + '</h3>' + rs.map(rowHtml).join('')).join('');
  } else list = visible.map(rowHtml).join('');
  const selected = rows.filter(r => r.selected && r.state !== 'done');
  if (hub.phase === 'review') {
    h.innerHTML = '<div class="row" style="margin-bottom:8px"><span class="avatar"><i class="ph ph-' + s.icon + '"></i></span><strong class="grow">' + esc(s.title) + ' 분석 결과</strong><button type="button" class="btn sm ghost" data-again>다시 선택</button></div>' +
      '<div class="chips" style="flex-wrap:wrap;margin-bottom:10px">' + chips.map(([k, label]) => '<button type="button" class="chip" data-f="' + k + '" aria-pressed="' + (hub.filter === k) + '">' + label + '</button>').join('') + '</div>' +
      '<div class="chips" style="flex-wrap:wrap;margin-bottom:10px"><button type="button" class="chip" data-all>전체 선택</button><button type="button" class="chip" data-none>선택 해제</button><button type="button" class="chip" data-nodup>중복 제외</button><button type="button" class="chip" data-approve-all>추천곡 일괄 승인</button><button type="button" class="chip" data-group aria-pressed="' + hub.group + '">곡별 묶어 보기</button></div>' +
      '<label class="field"><span>선택한 파일의 종류 한 번에 지정</span><select data-bulk-occ><option value="">선택…</option>' + M.OCCASIONS.map(([k, v]) => '<option value="' + k + '">' + v + '</option>').join('') + '</select></label>' +
      '<label class="field"><span>선택한 파일의 곡 한 번에 지정</span><select data-bulk><option value="">선택…</option>' + songOpts('').replace('<option value="">곡 미지정</option>', '<option value="__none">곡 미지정</option>') + '</select></label>' +
      '<label class="item" style="padding:0 0 10px"><input type="checkbox" data-auto' + (hub.autoPractice ? ' checked' : '') + ' style="width:22px;height:22px;accent-color:var(--accent)"><span class="item-main small">곡을 정한 "연습" 파일은 그 날짜의 연습 기록으로 만들기 (같은 파일은 한 번만)</span></label>' +
      '<div class="stack" data-list>' + (list || '<p class="small muted">이 조건에 해당하는 파일이 없어요.</p>') + '</div>' +
      '<div class="sheet-foot" style="position:sticky;bottom:calc(var(--nav-h) + var(--safe-b));margin:16px -16px 0;padding:12px 16px"><button type="button" class="btn block" data-import' + (selected.length ? '' : ' disabled') + '>선택한 ' + selected.length + '개 가져오기</button></div>';
    wireReview(h);
    return;
  }
  const done = rows.filter(r => r.state === 'done').length, failed = rows.filter(r => r.state === 'failed');
  h.innerHTML = '<div class="card stack"><strong>' + (hub.phase === 'importing' ? '가져오는 중…' : '가져오기 완료') + '</strong><p class="small muted" style="margin:0">저장 ' + done + '개' + (failed.length ? ' · 실패 ' + failed.length + '개' : '') + (hub.phase === 'done' && hub.made ? ' · 연습 기록 ' + hub.made + '개 생성' : '') + '</p>' +
    (rows.some(r => r.saved?.pendingUpload) ? '<p class="small muted" style="margin:0">이 기기에 먼저 저장했어요. 클라우드 업로드는 자동으로 이어져요. 다른 앱을 쓰다가 돌아와도 이어서 올라가요.</p>' : '') +
    (hub.phase === 'done' ? '<div class="btn-row">' + (failed.length ? '<button type="button" class="btn secondary" data-retry>실패한 ' + failed.length + '개 다시 시도</button>' : '') + '<a class="btn" href="#/library">보관함 보기</a></div><button type="button" class="btn ghost block" data-more>다른 자료 가져오기</button>' : '') + '</div>' +
    '<div class="stack" data-list style="margin-top:12px">' + rows.filter(r => r.state !== 'pending').map(rowHtml).join('') + '</div>';
  h.querySelector('[data-retry]')?.addEventListener('click', () => runImport(failed));
  h.querySelector('[data-more]')?.addEventListener('click', () => { hub = fresh(); draw(); });
  wirePlay(h);
}
function drawProgress() { const p = host()?.querySelector('[data-progress]'); if (p) p.textContent = hub.progress; else draw(); }
function drawRow(row) { const el = host()?.querySelector('[data-row="' + row.id + '"] [data-msg]'); if (el) el.textContent = row.msg || ''; else draw(); }
function wirePlay(h) {
  h.querySelectorAll('[data-play]').forEach(b => b.onclick = () => {
    const el = b.closest('[data-row]'), r = hub.rows.find(x => x.id === el.dataset.row), slot = el.querySelector('[data-p]');
    if (slot._p) { slot._p.destroy(); slot._p = null; slot.innerHTML = ''; return; }
    const item = r.saved || {id:'preview-' + r.id, name:r.name, type:r.type, blob:r.file, durationSeconds:r.duration};
    if (!item.blob && !item.cloud && !item.local) return;
    slot._p = M.player(slot, item, {}); slot._p.play();
  });
}
function wireReview(h) {
  const byRow = el => hub.rows.find(r => r.id === el.closest('[data-row]').dataset.row);
  h.querySelector('[data-again]').onclick = () => { hub.phase = 'pick'; hub.rows = []; draw(); };
  h.querySelectorAll('[data-f]').forEach(b => b.onclick = () => { hub.filter = b.dataset.f; draw(); });
  h.querySelector('[data-all]').onclick = () => { hub.rows.forEach(r => { if (r.status !== 'error') r.selected = true; }); draw(); };
  h.querySelector('[data-none]').onclick = () => { hub.rows.forEach(r => { r.selected = false; }); draw(); };
  h.querySelector('[data-nodup]').onclick = () => { hub.rows.forEach(r => { if (r.dup) r.selected = false; }); draw(); };
  h.querySelector('[data-approve-all]').onclick = () => { let n = 0; hub.rows.forEach(r => { const s = r.suggestions?.[0]; if (s && r.song !== s.id) { r.song = s.id; n++; } }); VZ.toast(n ? '추천곡 ' + n + '개를 승인했어요.' : '승인할 추천곡이 없어요.'); draw(); };
  h.querySelector('[data-group]').onclick = () => { hub.group = !hub.group; draw(); };
  h.querySelector('[data-auto]').onchange = e => { hub.autoPractice = e.target.checked; };
  h.querySelector('[data-bulk]').onchange = e => { const v = e.target.value; if (!v) return; hub.rows.forEach(r => { if (r.selected) r.song = v === '__none' ? '' : v; }); draw(); };
  h.querySelectorAll('[data-sel]').forEach(c => c.onchange = () => { const r = byRow(c); r.selected = c.checked; draw(); });
  h.querySelectorAll('[data-song]').forEach(sel => sel.onchange = () => { byRow(sel).song = sel.value; });
  h.querySelectorAll('[data-occ-row]').forEach(sel => sel.onchange = () => { byRow(sel).occasion = sel.value; });
  h.querySelector('[data-bulk-occ]').onchange = e => { const v = e.target.value; if (!v) return; hub.occasion = v; hub.rows.forEach(r => { if (r.selected) r.occasion = v; }); draw(); };
  h.querySelectorAll('[data-approve]').forEach(b => b.onclick = () => { const r = byRow(b); r.song = r.suggestions[0].id; draw(); });
  h.querySelectorAll('[data-date]').forEach(inp => inp.onchange = () => {
    const r = byRow(inp); if (!inp.value) return;
    Object.assign(r, {date:inp.value, dateOk:true, dateSource:r.dateSource === 'filename' ? 'filename' : 'user'}); evaluate(r); if (r.status === 'ok') r.selected = true; draw();
  });
  h.querySelector('[data-import]').onclick = () => {
    const rows = hub.rows.filter(r => r.selected && r.state !== 'done');
    const undated = rows.filter(r => !r.dateOk);
    if (undated.length) { VZ.toast('날짜를 확인하지 않은 파일 ' + undated.length + '개가 있어요. 날짜를 정하거나 선택을 해제해 주세요.', 'error'); hub.filter = 'needs-date'; draw(); return; }
    runImport(rows);
  };
  wirePlay(h);
}
VZ.openImportHub = () => { hub = hub.phase === 'importing' ? hub : fresh(); VZ.nav('#/import-hub'); };
})();
