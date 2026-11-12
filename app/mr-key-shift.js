/* MR 키 바꿔 재생: playback-only key change for a song's uploaded MR file (−6…+6 semitones, tempo unchanged).
 * The stored file is never decoded to disk, re-encoded or uploaded: the <audio> element streams it as before and,
 * only while a shift is chosen, its output goes through a pitch shifter in Web Audio (MediaElementSource →
 * Signalsmith Stretch AudioWorklet → speakers). Long files stay streamed (no full-file decode).
 * Library: signalsmith-stretch@1.3.2 (MIT, Geraint Luff), loaded on first use from jsDelivr.
 * The chosen shift is kept per song as songs[].mrKeyShift (see app/song-mr.js). */
(() => {
'use strict';
const V = window.VZ;
if (!V) return;
const LIB = 'https://cdn.jsdelivr.net/npm/signalsmith-stretch@1.3.2/SignalsmithStretch.mjs';
const MIN = -6, MAX = 6;
const clamp = n => Math.max(MIN, Math.min(MAX, Math.round(Number(n) || 0)));
const label = n => (n = clamp(n)) ? (n > 0 ? '+' : '−') + Math.abs(n) : '원키';
const spoken = n => (n = clamp(n)) ? '원키에서 반음 ' + Math.abs(n) + '개 ' + (n > 0 ? '올림' : '내림') : '원키';
const NOTES = ['C', 'C#/Db', 'D', 'D#/Eb', 'E', 'F', 'F#/Gb', 'G', 'G#/Ab', 'A', 'A#/Bb', 'B'];
/** Semitones from one key name (scores.js / repertoire style: "D", "F#/Gb", "Am") to another, nearest way round. */
function interval(from, to) {
  const at = k => NOTES.indexOf(String(k || '').trim().replace(/m$/, ''));
  const a = at(from), b = at(to);
  if (a < 0 || b < 0) return null;
  const d = ((b - a) % 12 + 12) % 12;
  return d > 6 ? d - 12 : d;
}
/** The song's keys: repertoire first, then the first score that has them. */
function keysOf(song) {
  const r = song?.repertoire || {}, score = (song?.scores || []).find(s => !s.deleted && (s.practiceKey || s.originalKey)) || {};
  const practiceKey = r.practiceKey || score.practiceKey || '', originalKey = r.originalKey || score.originalKey || '';
  return {practiceKey, originalKey, suggested:practiceKey && originalKey ? interval(originalKey, practiceKey) : null};
}

let ctx = null, lib = null;
/** Creates or wakes the shared AudioContext. Call it synchronously inside a tap: iPhone Safari only starts audio there. */
function context() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) return null;
  if (!ctx || ctx.state === 'closed') { try { ctx = new Audio({latencyHint:'playback'}); } catch { ctx = new Audio(); } }
  // iOS 17+: play through the ringer switch like the normal player does.
  try { if (navigator.audioSession && navigator.audioSession.type !== 'play-and-record') navigator.audioSession.type = 'playback'; } catch {}
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  return ctx;
}
const load = () => lib ||= import(LIB).then(m => m.default || m).catch(error => { lib = null; throw error; });
/** A Signalsmith Stretch node on `audioContext`, ready for live input. */
async function createShifter(audioContext) {
  const Stretch = await load();
  return Stretch(audioContext, {numberOfInputs:1, numberOfOutputs:1, outputChannelCount:[2]});
}

/** Routes `audio` (an <audio crossorigin="anonymous">) through the shifter when needed.
 * Nothing changes for the element while the shift is 0 and no shift was used yet (plain native playback). */
function attach(audio, {onState} = {}) {
  let source = null, node = null, pending = null, want = 0, dead = false, routed = '';
  const state = s => { routed = s; audio.dataset.mrKeyRoute = s; onState?.(s); };
  const route = () => {
    if (!source || dead) return;
    try { source.disconnect(); } catch {}
    try { node?.disconnect(); } catch {}
    if (want && node) {
      source.connect(node); node.connect(ctx.destination);
      node.schedule({active:!audio.paused, semitones:want});
      state('shifted');
    } else {
      node?.schedule({active:false});
      source.connect(ctx.destination);
      state('direct');
    }
  };
  async function set(n) {
    want = clamp(n);
    if (dead || (!want && !source)) return routed || 'native';
    if (!context()) throw Error('이 브라우저는 키 변경 재생을 지원하지 않아요.');
    if (!source) { source = ctx.createMediaElementSource(audio); route(); }
    if (want && !node) {
      state('loading');
      try { node = await (pending ||= createShifter(ctx)); }
      catch (error) { pending = null; want = 0; route(); throw Error('키 변경 기능을 불러오지 못했어요. 원키로 재생해요.'); }
      if (dead) { try { node.disconnect(); } catch {} return routed; }
    }
    route();
    return routed;
  }
  const onPlay = () => {
    if (!source || dead) return;
    // An iPhone call or lock can suspend the context; a play tap wakes it again.
    if (ctx.state !== 'running') ctx.resume().catch(() => {});
    if (want && node) node.schedule({active:true, semitones:want});
  };
  // Paused: let the worklet idle so it costs nothing.
  const onPause = () => { if (node && !dead) node.schedule({active:false}); };
  audio.addEventListener('play', onPlay);
  audio.addEventListener('pause', onPause);
  function destroy() {
    if (dead) return;
    dead = true;
    audio.removeEventListener('play', onPlay); audio.removeEventListener('pause', onPause);
    try { audio.pause(); } catch {}
    try { node?.schedule({active:false}); } catch {}
    try { source?.disconnect(); } catch {}
    try { node?.disconnect(); } catch {}
  }
  return {set, destroy, get route() { return routed || 'native'; }, get semitones() { return want; }, get context() { return ctx; }};
}

V.mrKey = {MIN, MAX, LIB, clamp, label, spoken, interval, keysOf, context, load, createShifter, attach};
})();
