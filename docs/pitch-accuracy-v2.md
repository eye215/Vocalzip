# Pitch analysis v2 · 2026-11-11

## Existing flow and cause
Browser OfflineAudioContext → app/analysis.js Worker → app/vocal-analysis.js → media.analysis summary. The Node server imports the same pure analyzer. No pYIN/CREPE or external pitch inference currently exists.

v1 uses 8 kHz mono, a 64 ms Hann window, 10 ms hop, spectral harmonic voting (75–1100 Hz), and Viterbi continuity. Its octave candidate scores favor a dominant second harmonic when the fundamental is weak. A synthetic C5 with fundamental amplitude 0.05 and second harmonic amplitude 1 is tracked as C6 in v1. This is a reproduced algorithm failure, not yet proof of the reported recording's cause. The v1 range also falls back to frame quantiles when sustained notes are absent. Its peak is a 99th percentile, not a literal maximum. Voice/MR level separation is a heuristic, not source identification.

## Minimal implementation
Keep the existing browser/Node pure JS architecture and existing measurements. Add candidate harmonic support (fundamental or coprime harmonic indices), explained spectral power and fractional-lag periodicity. Prefer an octave-lower candidate only when its acoustic evidence explains additional energy and its periodicity supports it. Never divide pitches merely because the preceding pitch was lower. Viterbi still permits genuine octave leaps.

The confidence score is a heuristic in [0,1], not a calibrated probability. The current frequency ceiling and resampling architecture remain; no claim of arbitrary vocal range or robust polyphonic voice separation.

Range definitions:
- instantaneous: highest candidate with confidence >= 0.5, over all pitched frames; can include accompaniment/transients; excluded from growth.
- valid high: median of a contiguous >= 200 ms segment, each frame confidence >= 0.75 and mean >= 0.8; adjacent difference <= 80 cents and distance from running center <= 100 cents.
- stable high: valid segment >= 500 ms, mean confidence >= 0.9, 10th–90th percentile spread <= 70 cents.
- main range: time-weighted frame 10th–90th percentiles after the range confidence mask.
- no quantile fallback for valid high. Gaps or rejected frames split segments. Duration uses hop count, not overlapping-window width.
- Stable denotes this acoustic rule only, not healthy technique, comfort or singing skill.

Compatibility high/highCents point only to valid high; absent evidence yields null. New fields contain the four distinct metrics and criteria. v1 results do not become v2 highs merely by relabeling.

Reanalysis is explicit through existing analysis actions. Summary v2 retains prior summaries in analysis.history without deleting recordings, transactions or stored v1 results. Background jobs continue skipping existing summaries; no bulk production rewrite. Browser Worker URL is versioned. Same-version, sufficiently reliable summaries are required for a change verdict; highest-note changes are neutral. Named-note semitone differences round MIDI note indices separately (A#5→F#5 = -4). Nearest-semitone deviation is not score-note accuracy. Existing manually aligned same-song A/B flow remains the preferred comparison.

## Validation and limits
Tests contain only generated fixtures: C5, dominant second harmonic, missing fundamental, actual octave jumps, short high events, confidence/gap rules, silence/noise, changed timbre of the same melody; existing synthetic vocal + accompaniment regression is retained. Browser tests use a real WAV decode and Worker plus prior-version retention and growth withholding.

The Winner Takes It All is the user-selected real evaluation song. Its saved v1 summaries and an attached PDF were located with read-only database queries. No personal recording IDs, storage paths, names or audio are included here. Original audio and score note truth have NOT been decoded/annotated in this environment; metadata inspection is not an accuracy test. Physical iPhone Safari is NOT verified. CI outcomes are recorded on the PR; synthetic accuracy must not be generalized to real polyphonic vocals.

## P1: score reference contract, no forced pitch correction
Existing songs[].scores retains score ID, song ID, private PDF key, filename, original/practice key. The score-vision endpoint describes selected symbols/handwriting; it does not produce MusicXML or isolate vocal staves.

Proposed additive score.pitchReference:
- version, source (manual/musicxml/reviewed-omr), scoreId, partId, staff/voice, transpositionSemitones, status (draft/confirmed), coverage (whole-score/selected-measures), measure bounds;
- lowMidi/highMidi, confirmedByUser, reviewedAt; optional note events {measure,beat,duration,midi,tie,confidence};
- manual limits use exactly the same schema, so PDF conversion is optional.
Flow: choose uploaded PDF → identify vocal staff and have user confirm → isolated OMR/MusicXML → exclude piano/other parts → review key, clef, accidentals, octave signs, repeats, transposition → calculate extrema on confirmed vocal notes. Missing or partial score coverage cannot establish the whole-song maximum.

Recording comparison attaches review flags with timestamps for out-of-range events; it never clamps, octave-folds, edits audio or replaces measured pitches. Manual A/B alignment or confirmed score measure alignment precedes note accuracy; accompaniment/unclear notes yield pending. Record intended pitch vs observed pitch and cents error separately from sustained-note wobble.

## Alternative algorithms
pYIN can add probabilistic voicing and transitions but needs Python/librosa and CPU benchmarking; it assumes a predominantly monophonic source. CREPE adds model weights and inference/runtime cost, and likewise does not solve vocal separation by itself. Keep these as candidate read-only offline benchmarks on annotated real clips before adopting a server dependency. No model or paid API is called by this change.

## Release gate
CI regression + real annotated vocal segments (including quiet/strong accompaniment) + physical iPhone rendering/performance must be reviewed before declaring accuracy solved. A C5 seen in some score bars is not assumed to be the song's global maximum. Until real verification, keep the PR a draft and production results unchanged.
