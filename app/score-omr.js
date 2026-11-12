/* 음표로 변환 (OMR PoC, Phase 07-B/16): the owner asks the conversion server to read one score PDF into MusicXML.
 * Nothing is sent before the button is pressed. The PDF stays unchanged; the result (.mxl) is stored next to it and
 * shown here as a preview with a download. Automatic recognition makes mistakes, so it is not used for scoring or
 * singing comparison until a review step exists. */
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

VZ.scoreOmrSheet = (song, score) => {
  if (!window.VzipR2?.enabled?.() || !window.VzipR2.omr) { VZ.toast('음표 변환은 로그인하고 클라우드에 올라간 악보에서 쓸 수 있어요.', 'error'); return; }
  VZ.sheet({title:'음표로 변환', body:'<div class="omr-sheet" data-omr-sheet><p class="omr-file"><i class="ph ph-file-pdf" aria-hidden="true"></i><span>' + esc(score.title || score.fileName || '악보') + '</span><small>시험판</small></p>' +
      '<div data-omr-body><p class="muted">상태를 확인하는 중…</p></div></div>',
    onMount:(el, close) => {
      const body = el.querySelector('[data-omr-body]');
      let alive = true, timer = 0;
      const stop = () => { alive = false; clearTimeout(timer); };
      new MutationObserver((_, o) => { if (!el.isConnected) { stop(); o.disconnect(); } }).observe(document.body, {childList:true, subtree:true});
      const draw = async () => {
        clearTimeout(timer);
        let job;
        try { job = await window.VzipR2.omr.status(score.id); }
        catch (e) { if (alive) body.innerHTML = '<p class="omr-note" role="alert">상태를 불러오지 못했어요: ' + esc(e.message) + '</p>'; return; }
        if (!alive) return;
        if (!job || job.status === 'failed') {
          body.innerHTML = (job ? '<p class="omr-note omr-error" role="alert">' + esc(FAIL[job.error] || FAIL.engine) + '</p>' : '') +
            '<p class="omr-note">PDF의 음표를 읽어 MusicXML(다른 악보 앱에서 열 수 있는 형식)로 바꿔요. 인쇄된 악보에서 가장 잘 되고, 자동 인식이라 틀린 음표가 있을 수 있어요.</p>' +
            '<p class="omr-note small">올린 악보는 서버에서 차례로 자동 변환돼요(이미 올린 악보 포함). 변환하면 이 PDF를 VOCAL.zip 변환 서버(GitHub 실행 환경)에서 처리해요. 끝나면 서버에서 지우고, 결과는 원본 옆에 저장해요. 원본 PDF는 바뀌지 않아요.</p>' +
            '<button type="button" class="btn block" data-omr-start><i class="ph ph-music-notes" aria-hidden="true"></i>' + (job ? '다시 변환하기' : '변환 요청') + '</button>';
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
        body.innerHTML = '<p class="omr-note">자동 인식 결과예요. 틀린 음표가 있을 수 있어 아직 점수나 노래 비교에는 쓰지 않아요.' + (job.movements > 1 ? ' 이 PDF에서 곡이 ' + job.movements + '개로 나뉘어 첫 곡만 보여요.' : '') + '</p>' +
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
          preview.innerHTML = '';
          const osmd = new lib.OpenSheetMusicDisplay(preview, {autoResize:true, backend:'svg', drawTitle:false, drawingParameters:'compacttight'});
          await osmd.load(data);
          if (alive) osmd.render();
        } catch (e) { if (alive) preview.innerHTML = '<p class="omr-note" role="alert">미리보기를 그리지 못했어요: ' + esc(e.message) + ' · 파일은 받아서 다른 악보 앱으로 열 수 있어요.</p>'; }
      };
      const start = async () => {
        const button = body.querySelector('[data-omr-start]'); if (button) { button.disabled = true; button.textContent = '요청하는 중…'; }
        try { await window.VzipR2.omr.request(score.r2Key); VZ.toast('변환을 요청했어요. 끝나면 여기서 볼 수 있어요.'); }
        catch (e) { VZ.toast(e.status === 429 ? '변환을 기다리는 악보가 많아요. 하나가 끝난 뒤 다시 요청해 주세요.' : '요청하지 못했어요: ' + e.message, 'error'); }
        draw();
      };
      draw();
    }, onClose:() => {}});
};
})();
