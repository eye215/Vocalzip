# Pitch analysis v2 · 2026-11-12

## Flow
Browser `OfflineAudioContext` → `app/analysis.js` Worker → `app/vocal-analysis.js` → `media.analysis` summary.
The GitHub Actions worker (`worker/analysis-worker.mjs`) imports the same pure analyzer. No model, paid API or
server-side pitch service is involved; everything stays plain JavaScript (cost and runtime as before: a 5-minute
recording takes ≈ 4.2 s in Node vs 3.3 s for v1).

## Pitch tracking (P0)
8 kHz mono, 64 ms Hann window, 10 ms hop, harmonic-sum candidates (75–1100 Hz), Viterbi continuity — unchanged
from v1. v2 adds, per candidate:

1. **Acoustic evidence.** Amplitude found at each harmonic, share of spectral power explained (coverage), and the
   normalized autocorrelation at exactly the candidate period, computed from the power spectrum and divided by the
   Hann window's own autocorrelation (Boersma/Praat). No sample interpolation, so high notes (C6 ≈ 7.6 samples per
   period) are not penalised. `confidence = √(periodicity × coverage)` (a heuristic in 0…1, not a probability).
2. **Octave rule (F0 vs harmonics).** Everything the upper candidate explains is also an even harmonic of the
   candidate an octave below, so only the lower one's **odd** harmonics are independent evidence. A sung C5
   (523 Hz) has partials at 1046 and **1569** Hz: 1569 is C5's 3rd harmonic and no harmonic of C6, so C5 wins even
   with a weak fundamental. The lower octave wins when its 3rd/5th/7th harmonics carry ≥ 15 % of what the upper
   explains **and** either two odd partials are present (≥ 10 % of the frame peak), the odd partials are
   overwhelming (≥ 50 %), or the lower pitch explains the frame clearly better (coverage ≥ 0.9 and +0.02,
   periodicity +0.05). A lower candidate whose odd partials (incl. fundamental) are < 10 % of the upper's is a
   sub-harmonic and is suppressed. Decisions are made decisive (loser × 0.3) so Viterbi cannot hold a wrong octave.
   - Accompaniment an octave below (5 % pure tone, piano doubling at −12 dB, a quiet triad) adds a fundamental but
     no 3rd/5th/7th, so the sung octave stays. This fixes the reviewer's regression of the first v2 draft.
   - A spectrum of only two partials (C5 at 5 % + C6) is physically identical to "C6 over a quiet C5 accompaniment";
     v2 follows the louder partial (as v1 did). The earlier draft's test that expected C5 here was replaced by a
     realistic weak-fundamental voice that also has a 3rd harmonic.
3. **Continuity clean-up** (`clean()`, after Viterbi):
   - frames with confidence < 0.3 are dropped (unpitched);
   - an excursion of ≤ 150 ms between two held notes that agree (≤ 100 cents apart), or ≤ 60 ms at a note's start/end,
     is a tracking spike: frames an octave away are folded back onto the held note; other frames > 300 cents away are
     removed when the excursion is ≤ 60 ms;
   - a sung octave leap (C4→C5, C5→C6) is held longer than that and is never folded.
   Counts are reported in `confidence.octaveFoldedFrames / spikeFramesRemoved / lowConfidenceFrames`.

All thresholds live in `RULES` at the top of `app/vocal-analysis.js` (exported for tests).

## Highest notes (P0) — `metrics.range`
| field | meaning | used for growth |
|---|---|---|
| `instantaneous` (순간 최고음) | highest single voiced frame with confidence ≥ 0.5 (+ `t`) | never |
| `validHigh` (유효 최고음) | highest note held as one continuous segment ≥ **0.2 s** (`RULES.effectiveSeconds`), every frame confidence ≥ 0.75, mean ≥ 0.8, ≤ 80 cents frame-to-frame, ≤ 100 cents from the segment centre | neutral, same version only |
| `stableHigh` (안정 최고음) | as valid, held ≥ 0.5 s, vibrato-free (170 ms moving average) pitch spread p10–p90 ≤ 60 cents | neutral, same version only |
| `main` (주 가창 음역) | p10–p90 of all confident voiced time | — |

`high/highCents/low/lowCents` stay as compatibility fields and point at the valid notes. No quantile fallback: no
held evidence → `null` (판정 보류). Every point keeps `t` (seconds from the recording start, window start),
`duration`, `confidence` and `times` (up to 3 occurrences of the same note, the reported one first).

**Owner-verifiable evidence.** The analysis screen (`#/analysis/:id`) and the vocal lab show the instant and
effective highest notes with their positions; tapping one plays the existing player from 1 s before
(`VZ.analysisPlayAt`; `play()` stays inside the tap for iPhone Safari, the seek waits for metadata).

## Growth report rules
- Instant max is never used; 유효/안정 최고음 are shown as neutral (no better/worse colour) with "실력 판정 아님".
- Comparisons need the same analysis version and reliable summaries (`analysisComparable`), otherwise 판정 보류.
  Plan outcomes (`plan-outcome-model.js`) withhold a before/after that mixes v1 and v2.
- Accuracy (cents from the nearest semitone) and stability (sustained-note wobble) remain separate metrics.
- Note differences are exact semitone counts of the named notes (A#5→F#5 = 4반음, never "약 4.5반음").
- Same-song recordings are compared; the vocal lab's A/B same-segment comparison is preferred.

## Data / compatibility
- New results are `v:2`; v1 results stay readable and are only replaced when the owner re-analyses. The previous
  summary moves to `analysis.history` (last 5 kept). Background jobs (app and server) still skip recordings that
  already have any analysis. Server summaries now also carry `scope`.
- v1 and v2 both count for monthly growth, practice plans and plan outcomes.
- `index.html` cache-busts every changed file; callers tolerate an older cached `analysis.js` without
  `analysisComparable`. Worker URL `app/vocal-analysis.js?v=5`.

## Verification — synthetic only
`tests/pitch-truth.cjs` generates recordings with a known sung pitch at every 50 ms point;
`tests/pitch-ground-truth.test.cjs` asserts ≥ 95 % within ±50 cents, zero octave errors, no voice in silence/noise,
the expected valid/stable highs and their timestamps. Reproduce the table with
`node tools/pitch-bench.cjs main=<v1 file> new=app/vocal-analysis.js`.

acc = % of sung points within ±50 cents · oct = % off by an octave · FA = % of silence/noise/accompaniment-only points
reported as voice · highs = instant/valid/stable (v1 has only `peak` and `high`).

| scenario | v1 (main) | first v2 draft | v2 (this) |
|---|---|---|---|
| C5 pure tone | 100/0/0 · C5/C5/— | 100/0/0 · C5/C5/C5 | 100/0/0 · C5/C5/C5 |
| C5 voice-like harmonics | 100/0/0 · C5/C5/— | 100/0/0 · C5/C5/C5 | 100/0/0 · C5/C5/C5 |
| C5 weak fundamental (.1,1,.3) | 100/0/0 · C5/C5/— | 100/0/0 · C6/C5/C5 | 100/0/0 · C5/C5/C5 |
| C5 very weak fundamental (.05,1,.2,.3,.1) | **0/100/0 · C6/C6** | 100/0/0 · C5/C5/C5 | 100/0/0 · C5/C5/C5 |
| C5 missing fundamental | 100/0/0 · C5/C5/— | 100/0/0 · C5/C5/C5 | 100/0/0 · C5/C5/C5 |
| C4→C5→C4 sung leaps | 100/0/0 · C5/C5/— | 100/0/0 · C5/C5/C5 | 100/0/0 · C5/C5/C5 |
| C5→C6 sung leap | 100/0/0 · C6/C6/— | 100/0/0 · C6/C6/**C5** | 100/0/0 · C6/C6/C6 |
| held C5/G4 + 50 ms octave spikes, blip, noise burst | 100/0/0 · C5/C5/— | 100/0/0 · C5/C5/C5 | 98.7/0/0 · C5/C5/C5 ¹ |
| held C5 + 100 ms octave flips | **0 (no voice found)** | 64.6/0/0 · C6/C5/C5 | 100/0/0 · C5/C5/C5 |
| melody C5–E5–G5–C6 + 5 % sub-octave tone | 100/0/0 · C6/C6/— | 95.3/4.7/0 · C6/C6/G5 | 100/0/0 · C6/C6/C6 |
| pure-tone melody + 5 % sub-octave tone | 100/0/0 · C6/C6/— | **0/100/0 · C6/C5/C5** | 100/0/0 · C6/C6/C6 |
| melody + piano octave-below doubling −12 dB | 100/0/0 · C6/C6/— | **50/50/0 · E5/E5/E5** | 100/0/0 · C6/C6/C6 |
| E5 melody + quiet A3–C#4–E4 triad | 100/0/0 · E5/E5/— | 100/0/0 · E5/E5/A4 | 100/0/0 · E5/E5/E5 |
| silence + noise segments | 100/0/0 · F5/F5/— | 100/0/0 · F5/F5/F5 | 100/0/0 · F5/F5/F5 |
| same song, 3 takes (timbre/vibrato/detune/squeak) | 86.7, 100, 100 · C5 ×3 | 100 ×3 · C5 ×3 | 100 ×3 · C5 ×3 |
| synth song over MR −12 dB | 100/0/0 · C5/C5/— | 100/0/0 · C5/C5/C5 | 100/0/0 · C5/C5/C5 |
| synth song over MR 0 dB | 100/0/0 · C5/C5/— | 100/0/0 · C5/C5/C5 | 99.4/0/0 · C5/C5/C5 ¹ |

¹ one 50 ms point left unvoiced (noise burst / chord change), not a wrong pitch.

**Not verified:** real recordings (including the owner's evaluation song), real accompaniment mixes, physical
iPhone Safari. Synthetic accuracy must not be generalised to real polyphonic singing. Voice/MR separation is still a
level heuristic, not source separation.

## P1: score-based range check (implemented 2026-11-12, `app/score-range-model.js`, `app/score-range.js`)
OMR output is `u/<uid>/<scoreId>/omr.mxl` (`app/score-omr.js`). Recognition errors are possible, so nothing is used
until the owner has looked at it and confirmed.
1. **Reference.** One per song, in the synced record: `song.vocalRange = {version:1, low, high, lowMidi, highMidi,
   source:'score'|'manual', scoreId, part, partId, transposition, confirmedByUser:true, updatedAt}` (score fields only
   for `source:'score'`). Manual entry = two note pickers (C2–C7). A manual range is replaced only after an explicit
   "바꿀까요?" confirmation; nothing is ever set or updated automatically (re-converting a score changes nothing).
2. **Vocal part only.** The `.mxl` is unzipped in the browser (tiny zip reader + `DecompressionStream('deflate-raw')`,
   `META-INF/container.xml` rootfile) and parsed with `DOMParser`; partwise and timewise are read. Per part:
   lowest/highest **sounding** MIDI note — `<alter>` and `<octave>` exact, `<transpose>` chromatic + octave-change
   applied (ignored in MusicXML 4 `<concert-score>`), rests, grace, cue, hidden and unpitched notes skipped, tied notes
   are the same pitch. `<octave-shift>` and the key signature need nothing: MusicXML pitch already includes them.
   Parts with 2+ staves or a keyboard MIDI program/sound are piano; ≥ 50 % chord notes are chord parts; instrument
   names (sax, guitar…) are instruments — none of these is preselected. Lyrics, a `voice.*` sound or a vocal name
   (Voice, Soprano…, 보컬, 노래, 멜로디) mark a vocal part. One vocal part → preselected; several (duet/SATB) or none →
   the owner picks from the list (name, range, highest-note measure, lyrics, staves, guess). One unnamed single line
   beside a piano is preselected as a guess. The owner always confirms before saving.
3. **Compare, never correct.** Vocal lab (`makeSegment`, per recording): 악보 최고음 vs 유효 최고음 → **일치**
   (±1 semitone), else **악보보다 N반음 높음/낮음** (exact MIDI difference of the named notes); 안정/순간 shown with their
   own semitone differences. Instant max ≥ 3 semitones over the score while the valid max fits →
   "순간 최고음은 재확인 필요 (배음·잡음 가능성)" with the existing tap-to-listen (`VZ.analysisPlayAt`). v1 results,
   `analysisReliable` false or no valid note → **판정 보류**. Measured values are never clamped or folded, and the
   block says a range difference is not a skill judgement.
4. Not done: note-by-note accuracy (needs score↔recording alignment), partial-coverage references, key changes the
   singer chose (practice key) — the block warns that a different key or a partial take changes the result.

## Alternatives considered
pYIN would add probabilistic voicing but needs a Python/librosa port or a JS rewrite plus benchmarking; CREPE needs
model weights and inference time on the phone and the Actions worker. Neither separates the voice from the MR on its
own. v2 keeps the harmonic-sum + Viterbi tracker and adds probabilistic-style candidate evidence instead; pYIN/CREPE
remain candidates for an offline benchmark on annotated real clips.
