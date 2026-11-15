/* 음표로 변환 (OMR PoC, Phase 07-B/16): the owner asks the conversion server to read one score PDF into MusicXML.
 * Nothing is sent before the button is pressed. The PDF stays unchanged; the result (.mxl) is stored next to it and
 * shown here as a preview with a download. Automatic recognition makes mistakes, so it is not used for scoring; only the
 * vocal range the owner confirms in app/score-range.js (악보 기준 음역) is compared with recordings. */
(() => {
'use strict';
const VZ = window.VZ;
if (!VZ) return;
const esc = VZ.esc;
const OSMD = 'https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@2.2.1/build/opensheetmusicdisplay.min.js';
const FAIL = {'no-music':'악보에서 음표를 찾지 못했어요. 스캔이 흐리거나 손글씨 악보면 인식이 어려워요.', timeout:'변환이 너무 오래 걸려 멈췄어요. 쪽수가 많은 악보는 나눠 올려 보세요.',
  'too-large':'변환 결과가 너무 커요.', unreadable:'원본 PDF를 읽지 못했어요. 악보를 다시 올린 뒤 시도해 주세요.', engine:'변환 프로그램에서 오류가 났어요. 다시 시도해 주세요.'};
let osmdLoading;
const loadOsmd = () => window.opensheetmusicdisplay ? Promise.resolve(window.opensheetmusicdisplay) : osmdLoading ||= new Promise((resolve, reject) => {
  const s = document.createElement('script'); s.src = OSMD; s.async = true;
  s.onload = () => window.opensheetmusicdisplay ? resolve(window.opensheetmusicdisplay) : reject(Error('미리보기 도구를 불러오지 못했어요.'));
  s.onerror = () => { osmdLoading = null; reject(Error('미리보기 도구를 불러오지 못했어요.')); };
  document.head.append(s);
});
const binary = buf => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 32768) s += String.fromCharCode.apply(null, b.subarray(i, i + 32768)); return s; };
const fileName = score => (String(score.title || score.fileName || 'score').replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || 'score') + '.mxl';

/* Preview of the converted score.
 * 악보 줄바꿈대로 (default): the file's own line breaks (<print new-system>/<print new-page>) are kept. The library still
 * breaks a line that does not fit its page, so the music is laid out on the narrowest page where every printed line fits
 * (never narrower than the box) and the drawn SVG is scaled to the box — small on a phone, but sharp. − ＋ only rescale
 * that SVG, so the lines never change while zooming.
 * 화면에 맞게 크게: the library breaks the lines itself for the box width (readable size, fewer measures per line). */
const LAYOUT_KEY = 'vzip_omr_layout_v1', LAYOUTS = [['score', '악보 줄바꿈대로'], ['screen', '화면에 맞게 크게']];
const NARROW = 240, WIDEST = 4000, ZOOMS = [1, 1.5, 2, 3, 4, 6, 8];
const prefs = () => window.VzipAccountScope?.storage || window.localStorage;
const readLayout = () => { try { return prefs().getItem(LAYOUT_KEY) === 'screen' ? 'screen' : 'score'; } catch { return 'score'; } };
const saveLayout = v => { try { prefs().setItem(LAYOUT_KEY, v); } catch {} };
const previewTools = '<div class="omr-tools" data-omr-tools hidden><div class="seg omr-mode" data-omr-mode role="group" aria-label="미리보기 줄바꿈">' +
  LAYOUTS.map(([k, v]) => '<button type="button" data-omr-layout="' + k + '" aria-pressed="false">' + v + '</button>').join('') + '</div>' +
  '<div class="omr-zoom" role="group" aria-label="미리보기 크기"><button type="button" class="icon-btn" data-omr-zoom="out" aria-label="작게 보기"><i class="ph ph-minus" aria-hidden="true"></i></button>' +
  '<span data-omr-scale>1배</span><button type="button" class="icon-btn" data-omr-zoom="in" aria-label="크게 보기"><i class="ph ph-plus" aria-hidden="true"></i></button>' +
  '<button type="button" class="btn secondary sm" data-omr-zoom="fit">화면 맞춤</button></div></div>';
const scorePreview = (lib, body) => {
  const tools = body.querySelector('[data-omr-tools]'), modes = tools.querySelector('[data-omr-mode]'), scaleText = tools.querySelector('[data-omr-scale]');
  const preview = body.querySelector('[data-omr-preview]'), stage = document.createElement('div');
  stage.className = 'omr-stage'; preview.innerHTML = ''; preview.append(stage);
  const osmd = new lib.OpenSheetMusicDisplay(stage, {autoResize:false, backend:'svg', drawTitle:false, drawingParameters:'compacttight'});
  let dead = false, layout = readLayout(), want = 1, need = 0, box = 0, page = 0, zoom = 1, timer = 0, queued = false;
  const room = () => { const cs = getComputedStyle(preview); return Math.max(160, Math.floor(preview.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight))); };
  const lines = () => osmd.GraphicSheet.MusicPages.reduce((n, p) => n + p.MusicSystems.length, 0);
  // Lines the library makes on a page w px wide. Laying out without drawing is what render() does first; draw too if that step is missing.
  const probe = w => {
    if (osmd.Sheet && typeof osmd.GraphicSheet?.reCalculate === 'function') { osmd.Sheet.pageWidth = w / 10; osmd.GraphicSheet.reCalculate(); }
    else { stage.style.width = w + 'px'; osmd.render(); }
    return lines();
  };
  // Narrowest page (within 4%) on which the lines are the file's lines: a wider page never makes more lines.
  const narrowest = () => {
    let lo = NARROW, hi = 1280, n = probe(hi);
    while (n > want && hi < WIDEST) { lo = hi; hi = Math.min(WIDEST, hi * 1.5); n = probe(hi); }
    if (n > want) lo = NARROW;   // some line never fits: settle for the fewest lines the widest page reaches
    while (hi / lo > 1.04) { const mid = Math.round((lo + hi) / 2); if (probe(mid) <= n) hi = mid; else lo = mid; }
    return hi;
  };
  const steps = () => ZOOMS.filter(z => z <= Math.max(2, 1.5 * page / box));   // up to about 1.5× the size the library draws at
  const paint = () => {
    const shown = Math.round(box * zoom), all = steps();
    stage.style.width = shown + 'px';
    stage.querySelectorAll('svg').forEach(svg => {
      const w = +svg.getAttribute('width') || page, h = +svg.getAttribute('height') || 0;
      if (svg.parentElement !== stage) svg.parentElement.style.width = shown + 'px';
      svg.style.width = shown + 'px'; svg.style.height = Math.ceil(h * shown / w) + 'px';
    });
    scaleText.textContent = zoom + '배';
    tools.querySelector('[data-omr-zoom=out]').disabled = zoom <= 1;
    tools.querySelector('[data-omr-zoom=in]').disabled = zoom >= all[all.length - 1];
    modes.querySelectorAll('[data-omr-layout]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.omrLayout === layout)));
  };
  const draw = () => {
    if (dead || !preview.isConnected) return;
    const top = preview.scrollHeight ? preview.scrollTop / preview.scrollHeight : 0, score = layout === 'score';
    osmd.setOptions({newSystemFromXML:score, newSystemFromNewPageInXML:score});
    box = room();
    page = score ? Math.max(box, need ||= narrowest()) : box;
    stage.style.width = page + 'px';
    osmd.render();
    const all = steps(); zoom = Math.min(zoom, all[all.length - 1]);
    paint();
    preview.scrollTop = top * preview.scrollHeight;
  };
  const zoomTo = z => {
    const r = z / zoom, cx = preview.scrollLeft + preview.clientWidth / 2, cy = preview.scrollTop + preview.clientHeight / 2;
    zoom = z; paint();
    preview.scrollLeft = cx * r - preview.clientWidth / 2; preview.scrollTop = cy * r - preview.clientHeight / 2;
  };
  tools.onclick = e => {
    const mode = e.target.closest('[data-omr-layout]'), z = e.target.closest('[data-omr-zoom]');
    if (mode && mode.dataset.omrLayout !== layout) {
      layout = mode.dataset.omrLayout; saveLayout(layout); zoom = 1; paint(); preview.scrollTop = preview.scrollLeft = 0;
      if (!queued) { queued = true; requestAnimationFrame(() => setTimeout(() => { queued = false; draw(); }, 0)); }   // let the pressed state show first
    }
    if (z && !z.disabled) { const all = steps(), i = all.indexOf(zoom) + (z.dataset.omrZoom === 'in' ? 1 : -1); zoomTo(z.dataset.omrZoom === 'fit' ? 1 : all[Math.max(0, Math.min(all.length - 1, i))]); }
  };
  // Rotation or a resized window: draw again for the new box width (same instance, nothing is loaded twice).
  const resized = () => { clearTimeout(timer); timer = setTimeout(() => { if (!dead && preview.isConnected && room() !== box) draw(); }, 150); };
  const watcher = window.ResizeObserver ? new ResizeObserver(resized) : null;
  return {
    show: async data => {
      await osmd.load(data);
      if (dead) return;
      want = 1 + (osmd.Sheet?.SourceMeasures || []).filter((m, i) => i && (m.printNewSystemXml || m.printNewPageXml)).length;
      if (want < 2) { layout = 'screen'; modes.hidden = true; }   // no line breaks in the file: the library's own layout only
      draw();
      tools.hidden = false;
      if (watcher) watcher.observe(preview); else addEventListener('resize', resized);
    },
    dispose: () => {
      dead = true; clearTimeout(timer); tools.hidden = true;
      if (watcher) watcher.disconnect(); else removeEventListener('resize', resized);
      try { osmd.clear(); } catch {}
    }
  };
};

VZ.scoreOmrSheet = (song, score) => {
  if (!window.VzipR2?.enabled?.() || !window.VzipR2.omr) { VZ.toast('음표 변환은 로그인하고 클라우드에 올라간 악보에서 쓸 수 있어요.', 'error'); return; }
  VZ.sheet({title:'음표로 변환', body:'<div class="omr-sheet" data-omr-sheet><p class="omr-file"><i class="ph ph-file-pdf" aria-hidden="true"></i><span>' + esc(score.title || score.fileName || '악보') + '</span><small>시험판</small></p>' +
      '<div data-omr-body><p class="muted">상태를 확인하는 중…</p></div></div>',
    onMount:(el, close) => {
      const body = el.querySelector('[data-omr-body]');
      let alive = true, timer = 0, view = null;
      const stop = () => { alive = false; clearTimeout(timer); view?.dispose(); view = null; };
      new MutationObserver((_, o) => { if (!el.isConnected) { stop(); o.disconnect(); } }).observe(document.body, {childList:true, subtree:true});
      const draw = async () => {
        clearTimeout(timer); view?.dispose(); view = null;
        let job;
        try { job = await window.VzipR2.omr.status(score.id); }
        catch (e) { if (alive) body.innerHTML = '<p class="omr-note" role="alert">상태를 불러오지 못했어요: ' + esc(e.message) + '</p>'; return; }
        if (!alive) return;
        if (!job || job.status === 'failed') {
          body.innerHTML = (job ? '<p class="omr-note omr-error" role="alert">' + esc(FAIL[job.error] || FAIL.engine) + '</p>' : '') +
            '<p class="omr-note">PDF의 음표를 읽어 MusicXML(다른 악보 앱에서 열 수 있는 형식)로 바꿔요. 인쇄된 악보에서 가장 잘 되고, 자동 인식이라 틀린 음표가 있을 수 있어요.</p>' +
            // One story for both cases: scores are converted automatically in turn; the button only skips the wait (or retries a failure).
            '<p class="omr-note small">' + (job ? '실패한 악보는 자동으로 다시 변환하지 않아요. 아래 버튼으로 다시 시도할 수 있어요.' : '아직 변환 전이에요. 올린 악보는 서버가 차례로 자동 변환하니 기다려도 되고, 아래 버튼으로 지금 시작할 수도 있어요.') +
            ' 변환할 때 이 PDF를 VOCAL.zip 변환 서버(GitHub 실행 환경)에서 처리해요. 끝나면 서버에서 지우고, 결과는 원본 옆에 저장해요. 원본 PDF는 바뀌지 않아요.</p>' +
            '<button type="button" class="btn block" data-omr-start><i class="ph ph-music-notes" aria-hidden="true"></i>' + (job ? '다시 변환하기' : '지금 변환하기') + '</button>';
          body.querySelector('[data-omr-start]').onclick = start;
          return;
        }
        if (job.status === 'queued' || job.status === 'running') {
          body.innerHTML = '<div class="omr-wait" role="status"><i class="ph ph-hourglass-medium" aria-hidden="true"></i><div><strong>' + (job.status === 'running' ? '변환하는 중이에요' : '변환 차례를 기다리는 중이에요') + '</strong>' +
            '<p>보통 10~30분 걸려요. 앱을 닫아도 계속돼요.</p></div></div><button type="button" class="btn secondary block" data-omr-refresh>상태 새로고침</button>';
          body.querySelector('[data-omr-refresh]').onclick = draw;
          timer = setTimeout(draw, 60000);
          return;
        }
        body.innerHTML = '<p class="omr-note">자동 인식 결과예요. 틀린 음표가 있을 수 있어 점수에는 쓰지 않고, 노래 비교에는 내가 확인한 보컬 음역(악보 탭의 악보 기준 음역)만 써요.' + (job.movements > 1 ? ' 이 PDF에서 곡이 ' + job.movements + '개로 나뉘어 첫 곡만 보여요.' : '') + '</p>' + previewTools +
          '<div class="omr-preview" data-omr-preview aria-label="변환된 악보 미리보기"><p class="muted">미리보기를 그리는 중…</p></div>' +
          '<div class="omr-actions"><a class="btn" data-omr-download><i class="ph ph-download-simple" aria-hidden="true"></i>MusicXML 받기</a><button type="button" class="btn secondary" data-omr-start>다시 변환</button></div>';
        body.querySelector('[data-omr-start]').onclick = async () => {
          if (await VZ.confirm('다시 변환', '이 악보를 다시 변환할까요? 지금 결과는 새 결과로 바뀌어요.', {ok:'다시 변환'})) start();
        };
        const preview = body.querySelector('[data-omr-preview]'), download = body.querySelector('[data-omr-download]');
        try {
          const url = await window.VzipR2.url(job.resultKey);
          download.href = url + (url.includes('?') ? '&' : '?') + 'download=' + encodeURIComponent(fileName(score));
          download.setAttribute('download', fileName(score));
          const [lib, res] = await Promise.all([loadOsmd(), fetch(url, {cache:'no-store'})]);
          if (!res.ok) throw Error('결과 파일을 받지 못했어요 (' + res.status + ').');
          const data = binary(await res.arrayBuffer());
          if (!alive) return;
          view = scorePreview(lib, body);
          await view.show(data);
        } catch (e) { view?.dispose(); view = null; if (alive) preview.innerHTML = '<p class="omr-note" role="alert">미리보기를 그리지 못했어요: ' + esc(e.message) + ' · 파일은 받아서 다른 악보 앱으로 열 수 있어요.</p>'; }
      };
      const start = async () => {
        const button = body.querySelector('[data-omr-start]'); if (button) { button.disabled = true; button.textContent = '요청하는 중…'; }
        try { await window.VzipR2.omr.request(score.r2Key); VZ.toast('변환을 시작했어요. 끝나면 여기서 볼 수 있어요.'); }
        catch (e) { VZ.toast(e.status === 429 ? '변환을 기다리는 악보가 많아요. 하나가 끝난 뒤 다시 요청해 주세요.' : '요청하지 못했어요: ' + e.message, 'error'); }
        draw();
      };
      draw();
    }, onClose:() => {}});
};
})();
