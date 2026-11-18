/* 설정 › 녹음 중 블루투스 시험 (#/bt-test): a diagnostic screen only. With a Bluetooth speaker connected, an iPad sends
 * playback to its own speaker once the microphone is open. This screen lets the owner try the combinations a web page
 * has (audio session type × microphone constraints × player, and their order) and note where the sound came out.
 * Nothing is recorded or uploaded; the answers stay in this browser (localStorage, KEY). The normal recording flow does
 * not use anything here. */
(() => {
'use strict';
const VZ = window.VZ, esc = VZ?.esc;
if (!VZ) return;
const KEY = 'vzip_bt_route_test_v1', MOVE = 0.02; // peak sample level above which the microphone "moved"
const RAW = {echoCancellation:false, noiseSuppression:false, autoGainControl:false};
const METHODS = [
  {id:'par-raw-audio', title:'녹음·재생 모드를 먼저 켜고 오디오로 재생', session:'play-and-record', order:'session-first', mic:'raw', player:'audio'},
  {id:'par-raw-webaudio', title:'녹음·재생 모드를 먼저 켜고 웹 오디오로 재생', session:'play-and-record', order:'session-first', mic:'raw', player:'webaudio'},
  {id:'auto-raw-audio', title:'지금 앱 녹음과 같은 방식', session:'auto', order:'session-first', mic:'raw', player:'audio'},
  {id:'auto-default-audio', title:'자동 모드 · 마이크 소리 다듬기 켜기', session:'auto', order:'session-first', mic:'default', player:'audio'},
  {id:'par-default-webaudio', title:'녹음·재생 모드 · 마이크 소리 다듬기 켜기 · 웹 오디오', session:'play-and-record', order:'session-first', mic:'default', player:'webaudio'},
  {id:'play-first-auto', title:'소리를 먼저 틀고 마이크 켜기 (자동 모드)', session:'auto', order:'play-first', mic:'raw', player:'audio'},
  {id:'play-first-par', title:'소리를 먼저 틀고 마이크 켜기 (녹음·재생 모드)', session:'play-and-record', order:'play-first', mic:'raw', player:'audio'},
  {id:'playback-after', title:'마이크를 켠 뒤 재생 전용 모드로 바꾸기', session:'playback', order:'session-after', mic:'raw', player:'audio', note:'이 방법은 마이크가 멈출 수 있어요. 막대가 계속 움직이는지 봐 주세요.'}
];
// What each method does, in the words a developer reads back from the copied text.
const tech = m => (m.order === 'play-first' ? '<audio> 먼저 재생 → ' : '') +
  (m.order === 'session-after' ? '' : 'audioSession ' + m.session + ' → ') +
  '마이크 ' + (m.mic === 'raw' ? '원음(echoCancellation·noiseSuppression·autoGainControl 끔)' : '기본 설정(echoCancellation 켬)') +
  (m.order === 'session-after' ? ' → audioSession ' + m.session : '') +
  (m.order === 'play-first' ? '' : ' → ' + (m.player === 'audio' ? '<audio>' : 'Web Audio') + ' 재생');
const HEARD = {bt:'블루투스 스피커', ipad:'아이패드', none:'안 들렸어요'};
const STEP = {start:'시작', set:'설정 후', mic:'마이크 후', play:'재생 후', after:'바꾼 후', reset:'정리 후'};

const supported = () => { try { const s = navigator.audioSession; return !!s && typeof s === 'object' && 'type' in s; } catch { return false; } };
const needsSession = m => m.session !== 'auto';
const readType = () => { try { return navigator.audioSession?.type ?? null; } catch { return null; } };
const setType = type => { if (supported()) navigator.audioSession.type = type; };
const standalone = () => { try { return !!(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true); } catch { return false; } };
const load = () => {
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v && typeof v === 'object' && v.results && typeof v.results === 'object') return v; } catch {}
  return {v:1, baseline:null, results:{}};
};
const save = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {} };

/** A short, soft arpeggio (C major up and down) with a little second harmonic; no file needed. */
function melody(rate, seconds) {
  const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 659.25], step = 0.45, out = new Float32Array(Math.round(rate * seconds));
  for (let i = 0; i < out.length; i++) {
    const t = i / rate, k = Math.floor(t / step), local = t - k * step, f = notes[k % notes.length];
    const env = Math.min(1, local / 0.02) * Math.exp(-local * 4.5), fade = Math.min(1, (seconds - t) / 0.15);
    out[i] = 0.32 * env * fade * (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t));
  }
  return out;
}
function wavBlob(seconds) {
  const rate = 22050, pcm = melody(rate, seconds), buf = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE'); str(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  str(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 32767, true);
  return new Blob([buf], {type:'audio/wav'});
}
const AC = () => window.AudioContext || window.webkitAudioContext;

/** One player: <audio> with a generated WAV, or an AudioBufferSourceNode. stop() releases everything. */
function makePlayer(kind) {
  let audio = null, url = '', ctx = null, src = null;
  return {
    async play(seconds) {
      this.stop(true);
      if (kind === 'audio') {
        if (!audio) { audio = new Audio(); audio.setAttribute('playsinline', ''); }
        if (url) URL.revokeObjectURL(url);
        url = URL.createObjectURL(wavBlob(seconds)); audio.src = url;
        await audio.play();
      } else {
        if (!ctx) ctx = new (AC())();
        if (ctx.state !== 'running') await ctx.resume().catch(() => {});
        const data = melody(ctx.sampleRate, seconds), buffer = ctx.createBuffer(1, data.length, ctx.sampleRate);
        buffer.getChannelData(0).set(data);
        src = ctx.createBufferSource(); src.buffer = buffer; src.connect(ctx.destination); src.start();
      }
    },
    stop(keep) {
      if (audio) { try { audio.pause(); } catch {} if (!keep) { audio.removeAttribute('src'); try { audio.load(); } catch {} audio = null; } }
      if (url && !keep) { URL.revokeObjectURL(url); url = ''; }
      if (src) { try { src.stop(); } catch {} src = null; }
      if (ctx && !keep) { ctx.close().catch(() => {}); ctx = null; }
    }
  };
}

/** Peak level of the microphone, polled; `max` is the highest seen since `reset()`. */
function makeMeter(stream, onLevel) {
  const ctx = new (AC())(), source = ctx.createMediaStreamSource(stream), analyser = ctx.createAnalyser();
  analyser.fftSize = 1024; source.connect(analyser); // not connected to the speakers
  ctx.resume?.().catch(() => {});
  const f = analyser.getFloatTimeDomainData ? new Float32Array(analyser.fftSize) : null, b = new Uint8Array(analyser.fftSize);
  const meter = {max:0, level:0, stop() { clearInterval(timer); try { source.disconnect(); } catch {} ctx.close().catch(() => {}); }, reset() { this.max = 0; }};
  const timer = setInterval(() => {
    let peak = 0;
    if (f) { analyser.getFloatTimeDomainData(f); for (const x of f) peak = Math.max(peak, Math.abs(x)); }
    else { analyser.getByteTimeDomainData(b); for (const x of b) peak = Math.max(peak, Math.abs(x - 128) / 128); }
    meter.level = peak; meter.max = Math.max(meter.max, peak); onLevel(peak);
  }, 60);
  return meter;
}

async function leaveFullscreen() {
  try {
    if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
    else if (document.webkitFullscreenElement && document.webkitExitFullscreen) document.webkitExitFullscreen();
  } catch {}
}
async function copyText(text) {
  try { if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; } } catch {}
  const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
  document.body.append(ta); ta.select(); let ok = false; try { ok = document.execCommand('copy'); } catch {} ta.remove(); return ok;
}
const pad = n => String(n).padStart(2, '0');
const stamp = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
const sessionLine = r => (r.session || []).map(([step, type]) => (STEP[step] || step) + ' ' + (type ?? '미지원')).join(' → ');

/** The text the owner pastes back to us: device facts and one line per method. No account, no ids. */
function report(state) {
  const lines = ['VOCAL.zip 녹음 중 블루투스 시험', '날짜: ' + stamp(new Date()), '기기: ' + navigator.userAgent,
    '홈 화면 앱: ' + (standalone() ? '예' : '아니오'), '오디오 세션 설정: ' + (supported() ? '지원' : '미지원'),
    '마이크 없이 재생: ' + (state.baseline === 'bt' ? '스피커에서 들림' : state.baseline === 'ipad' ? '아이패드에서 들림' : '확인 안 함')];
  METHODS.forEach((m, i) => {
    const r = state.results[m.id], head = (i + 1) + '. ' + m.title + ' [' + tech(m) + ']';
    if (!supported() && needsSession(m)) { lines.push(head + ' — 건너뜀(오디오 세션 미지원)'); return; }
    if (!r) { lines.push(head + ' — 시험 안 함'); return; }
    lines.push(head + ' — 들린 곳: ' + (HEARD[r.heard] || '답 없음') + ' · 마이크 반응: ' + (r.micMoved ? '있음' : '없음') + ' (최대 ' + (r.maxLevel ?? 0) + ')' +
      (r.micState ? ' · 마이크 상태: ' + r.micState : '') + ' · 세션: ' + (sessionLine(r) || '-') + ' · 오류: ' + (r.error || '없음'));
  });
  return lines.join('\n');
}

let active = null; // the run in progress: {method, stream, meter, player, steps, ...}
async function finish(answer) {
  const run = active; if (!run) return;
  active = null;
  try { run.player?.stop(); } catch {}
  run.micState = run.stream ? run.stream.getAudioTracks().map(t => t.readyState === 'ended' ? 'ended' : t.muted ? 'muted' : 'live').join(',') : '';
  run.stream?.getTracks().forEach(t => { try { t.stop(); } catch {} });
  const max = run.meter ? (run.order === 'session-after' ? run.afterMax ?? run.meter.max : run.meter.max) : 0;
  run.meter?.stop();
  try { setType('auto'); } catch (err) { run.error ||= err?.name || 'Error'; }
  run.steps.push(['reset', readType()]);
  if (answer === undefined) return; // left the screen mid-test: nothing to save
  const state = load();
  state.results[run.method.id] = {heard:answer, micMoved:max > MOVE, maxLevel:Math.round(max * 1000) / 1000, micState:run.micState, session:run.steps, error:run.error || '', at:Date.now()};
  save(state);
}

VZ.route('bt-test', {title:'녹음 중 블루투스 시험', back:true, tab:'keep', noAutoRefresh:true,
  render() { return '<div class="vz-bt" data-bt-test></div>'; },
  mount(main) {
    const host = main.querySelector('[data-bt-test]');
    let baselinePlayer = null, baselineAsked = false, status = {};
    const paint = () => {
      if (!host.isConnected) return;
      const state = load(), ok = supported();
      const methods = METHODS.map((m, i) => {
        const r = state.results[m.id], skip = !ok && needsSession(m), running = active?.method.id === m.id;
        const result = skip ? '<p class="vz-bt-skip">이 기기는 오디오 세션 설정을 지원하지 않아 건너뛰어요.</p>' :
          r ? '<p class="vz-bt-done">' + (r.error && !r.heard ? '시험하지 못했어요 (' + esc(r.error) + ')' : '들린 곳: <b>' + esc(HEARD[r.heard] || '답 없음') + '</b> · 마이크 ' + (r.micMoved ? '움직였어요' : '안 움직였어요') + (r.error ? ' · 오류 ' + esc(r.error) : '')) + '</p>' : '';
        return '<li class="vz-bt-method" data-method="' + m.id + '"' + (running ? ' data-running' : '') + '>' +
          '<div class="vz-bt-method-head"><span class="vz-bt-num">' + (i + 1) + '</span><div><strong>' + esc(m.title) + '</strong><small>' + esc(tech(m)) + '</small>' + (m.note ? '<small class="vz-bt-note">' + esc(m.note) + '</small>' : '') + '</div></div>' +
          (running ? '<div class="vz-bt-run"><div class="vz-bt-meter" role="meter" aria-label="마이크 소리 크기" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span data-level></span></div>' +
            '<p class="vz-bt-status" data-run-status aria-live="polite">' + esc(status[m.id] || '준비 중이에요…') + '</p>' +
            '<div class="vz-bt-ask" data-ask hidden><p>어디서 들렸어요?</p><div class="vz-bt-answers"><button type="button" class="btn sm" data-answer="bt">블루투스 스피커</button><button type="button" class="btn sm" data-answer="ipad">아이패드</button><button type="button" class="btn sm ghost" data-answer="none">안 들렸어요</button></div>' +
            '<button type="button" class="btn sm ghost block" data-replay><i class="ph ph-arrow-clockwise"></i>한 번 더 듣기</button></div></div>' :
            result + (skip ? '' : '<button type="button" class="btn sm secondary block" data-run' + (active ? ' disabled' : '') + '>' + (r ? '다시 시험하기' : '시험하기') + '</button>')) +
          '</li>';
      }).join('');
      const rows = METHODS.map((m, i) => {
        const r = state.results[m.id], skip = !ok && needsSession(m);
        return '<tr><th scope="row">' + (i + 1) + '</th><td>' + (skip ? '건너뜀' : r ? esc(HEARD[r.heard] || '답 없음') : '—') + '</td><td>' + (skip || !r ? '—' : r.micMoved ? '움직임' : '없음') + '</td><td><small>' + (r && !skip ? esc(sessionLine(r)) + (r.error ? ' · 오류 ' + esc(r.error) : '') : '') + '</small></td></tr>';
      }).join('');
      host.innerHTML =
        '<p class="vz-bt-intro">블루투스 스피커를 연결한 채 녹음하면 소리가 아이패드에서 나오는 문제를 살펴보는 화면이에요. 방법을 하나씩 시험하고 어디서 들렸는지 눌러 주세요. 녹음은 저장되지 않아요.</p>' +
        '<section class="vz-bt-card" aria-labelledby="bt-step1"><h2 id="bt-step1">1. 먼저 확인해요</h2><p>블루투스 스피커를 연결하고 소리가 스피커로 나오는지 먼저 확인해요</p>' +
          '<button type="button" class="btn block" data-baseline' + (active ? ' disabled' : '') + '><i class="ph ph-speaker-high"></i>소리 들어 보기</button>' +
          (baselineAsked ? '<div class="vz-bt-answers two"><button type="button" class="btn sm secondary" data-baseline-answer="bt">스피커에서 들렸어요</button><button type="button" class="btn sm secondary" data-baseline-answer="ipad">아이패드에서 들렸어요</button></div>' : '') +
          (state.baseline ? '<p class="vz-bt-done" data-baseline-result>' + (state.baseline === 'bt' ? '마이크 없이 재생하면 스피커에서 들렸어요.' : '마이크 없이도 아이패드에서 들렸어요. 스피커 연결을 먼저 확인해 주세요.') + '</p>' : '') +
        '</section>' +
        '<section class="vz-bt-card" aria-labelledby="bt-step2"><h2 id="bt-step2">2. 방법을 하나씩 시험해요</h2>' +
          '<p>시험하기를 누르면 마이크가 켜지고 4초쯤 짧은 멜로디가 나와요. 막대가 움직이면 마이크가 켜진 거예요. 처음에 마이크 사용을 물어보면 허용을 눌러 주세요.</p>' +
          (ok ? '' : '<p class="vz-bt-unsupported" data-unsupported>이 브라우저는 오디오 세션 설정(navigator.audioSession)을 지원하지 않아요. 그 설정이 필요한 방법은 건너뛰어요.</p>') +
          '<ol class="vz-bt-methods">' + methods + '</ol></section>' +
        '<section class="vz-bt-card" aria-labelledby="bt-step3"><h2 id="bt-step3">3. 결과</h2>' +
          '<table class="vz-bt-table" data-results><thead><tr><th scope="col">방법</th><th scope="col">들린 곳</th><th scope="col">마이크</th><th scope="col">세션·오류</th></tr></thead><tbody>' + rows + '</tbody></table>' +
          '<p class="small muted">결과는 이 기기에만 남아요.</p>' +
          '<div class="btn-row"><button type="button" class="btn sm" data-copy><i class="ph ph-copy"></i>결과 복사</button><button type="button" class="btn sm ghost" data-clear' + (active ? ' disabled' : '') + '><i class="ph ph-trash"></i>지우기</button></div></section>';
    };
    const setStatus = (id, text) => { status[id] = text; const el = host.querySelector('[data-method="' + id + '"] [data-run-status]'); if (el) el.textContent = text; };
    const showLevel = level => {
      const el = host.querySelector('[data-running] [data-level]'); if (!el) return;
      const pct = Math.min(100, Math.round(Math.sqrt(level) * 140));
      el.style.width = pct + '%'; el.parentNode.setAttribute('aria-valuenow', String(pct));
    };

    async function run(m) {
      if (active) return;
      baselinePlayer?.stop(); baselinePlayer = null;
      const r = active = {method:m, order:m.order, steps:[['start', readType()]], error:'', player:makePlayer(m.player)};
      status[m.id] = '준비 중이에요…'; paint();
      const seconds = m.order === 'play-first' ? 8 : 4;
      const play = async () => { try { await r.player.play(seconds); } catch (err) { r.error ||= err?.name || 'Error'; } r.steps.push(['play', readType()]); };
      try {
        if (document.fullscreenElement || document.webkitFullscreenElement) await leaveFullscreen();
        if (m.order === 'play-first') {
          await play(); if (active !== r) return;
          setStatus(m.id, '소리가 나오는 중이에요. 곧 마이크를 켜요…');
          await new Promise(res => setTimeout(res, 1500)); if (active !== r) return;
        }
        if (m.order !== 'session-after' && (needsSession(m) || supported())) { setType(m.session); r.steps.push(['set', readType()]); }
        if (!navigator.mediaDevices?.getUserMedia) { const e = Error('getUserMedia 없음'); e.name = 'NotSupportedError'; throw e; }
        r.stream = await navigator.mediaDevices.getUserMedia({audio:m.mic === 'raw' ? RAW : true});
        if (active !== r) { r.stream.getTracks().forEach(t => t.stop()); return; }
        r.steps.push(['mic', readType()]);
        r.meter = makeMeter(r.stream, level => { if (active === r) { showLevel(level); if (r.order === 'session-after' && r.afterMax != null) r.afterMax = Math.max(r.afterMax, level); } });
        if (m.order === 'session-after') {
          await new Promise(res => setTimeout(res, 500)); if (active !== r) return;
          setType(m.session); r.steps.push(['after', readType()]); r.afterMax = 0;
        }
        if (m.order !== 'play-first') await play();
        if (active !== r) return;
        setStatus(m.id, r.error ? '소리를 틀지 못했어요 (' + r.error + '). 들린 곳을 골라 주세요.' : '소리를 듣고 어디서 들렸는지 골라 주세요. 소리를 내 보면 막대가 움직여요.');
        const ask = host.querySelector('[data-running] [data-ask]'); if (ask) ask.hidden = false;
      } catch (err) {
        if (active !== r) return;
        r.error = err?.name || 'Error';
        await finish(null);
        VZ.toast('시험하지 못했어요: ' + (r.error === 'NotAllowedError' ? '마이크 사용이 허용되지 않았어요.' : r.error), 'error');
        paint();
      }
    }

    host.addEventListener('click', async e => {
      const t = e.target.closest('button'); if (!t || t.disabled) return;
      if (t.matches('[data-baseline]')) {
        baselinePlayer?.stop(); baselinePlayer = makePlayer('audio');
        try { await baselinePlayer.play(4); } catch (err) { VZ.toast('소리를 틀지 못했어요: ' + (err?.name || 'Error'), 'error'); }
        baselineAsked = true; paint();
      } else if (t.dataset.baselineAnswer) {
        baselinePlayer?.stop(); baselinePlayer = null; baselineAsked = false;
        const state = load(); state.baseline = t.dataset.baselineAnswer; save(state); paint();
      } else if (t.matches('[data-run]')) {
        const m = METHODS.find(x => x.id === t.closest('[data-method]').dataset.method); if (m) run(m);
      } else if (t.dataset.answer) {
        await finish(t.dataset.answer); paint();
      } else if (t.matches('[data-replay]') && active) {
        try { await active.player.play(4); } catch (err) { active.error ||= err?.name || 'Error'; }
      } else if (t.matches('[data-copy]')) {
        VZ.toast(await copyText(report(load())) ? '결과를 복사했어요.' : '복사하지 못했어요.', undefined);
      } else if (t.matches('[data-clear]')) {
        if (!await VZ.confirm('결과 지우기', '이 기기에 남긴 블루투스 시험 결과를 지울까요?', {ok:'지우기', danger:true})) return;
        try { localStorage.removeItem(KEY); } catch {}
        status = {}; paint(); VZ.toast('결과를 지웠어요.');
      }
    });
    host._vzBtStop = () => { baselinePlayer?.stop(); baselinePlayer = null; finish(undefined); };
    paint();
  },
  leave() { document.querySelector('[data-bt-test]')?._vzBtStop?.(); finish(undefined); }
});
window.addEventListener('pagehide', () => finish(undefined));
VZ.btRouteReport = () => report(load()); // for tests and support: the same text 결과 복사 copies
})();
