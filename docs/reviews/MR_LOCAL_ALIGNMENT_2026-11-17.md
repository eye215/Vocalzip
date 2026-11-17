# MR local alignment review — 2026-11-17

Status: implementation under review; no merge or production deployment. Builds on the
start-offset and quiet-MR safeguards proposed in #449, whose real-file checks failed.
Latest main #452 is integrated, including saved-analysis comparisons and refusal reasons.
No user media, titles, file names, waveform samples, account data or AI models are in this PR.

## Problem and change

The supplied recordings both returned `no-match` on main and #449. Onset candidates can
miss the waveform position by more than the former ±50 ms search. A single straight
delay/speed fit also leaves substantial MR when the local delay changes during a take.
Relaxing the fit error alone accepts an alignment without improving subtraction.

The ordinary, independently verified alignment path remains first. Its unverified
3 dB loudness-only acceptance path is removed. On failure, nine 2.048 s waveform anchors
per candidate are searched within ±0.5 s. At least five consistent anchors, sufficient
temporal span, mean phase peak and bounded line error are required. Those anchors only
initialize a 0.5 s-step local tracker; they do not directly make an attempt successful.

The tracker rejects weak peaks and local outliers, smooths reliable delays with weighted
quadratic fits, and uses cubic delay interpolation. Large jumps and long unsupported gaps
are protected. Their middle remains exactly as recorded. At least 85% trusted coverage
is required. The output is blended back to the input outside supported stretches.

For this fallback, the complex transfer comes from up to sixteen neighbouring blocks on
each side, excluding the current block. This limits fitting away the singer. No residual
spectral mask is used on this path. A positive held-out prediction benefit is required;
its whole-mix level change is not presented as the amount of MR removed.

FFT windows are reused. Transfer statistics are small per-block arrays; there is no
whole-take Float64 spectrogram. The worker stays terminable and reports alignment,
tracking, transfer estimation and subtraction progress. MR cache signatures and the
responsible script/worker versions change. Original recordings and MRs are never written.

The existing success/failure cards are reused. Copy says `반주 줄임`, acknowledges residual
MR, and does not infer a key/speed change from a failed match. Numeric local evidence is
whitelisted in diagnostics. Latest main's saved-analysis fallback remains separate.

## Real-file evidence (private, outside Git)

- Main and #449: both intended pairs failed. The new module accepts both intended pairs
  and rejects both cross-pairs.
- Windows Edge: original AAC/M4A bytes decoded through Web Audio, then passed through the
  actual `voice-path-worker.js` with both MR candidates. Both recordings selected their
  correct MR; both wrong candidates were rejected. Progress stayed monotonic and reached
  completion. Trusted coverage was about 97% and 100%; unsupported audio remains present.
- Three separated time regions were compared per take (about 30 s total per take) with a
  separate local Kim Vocal 2 model. Aggregate residual error against that comparison output
  improved about **3.7 dB and 3.3 dB**. Individual regions improved **1.2–5.0 dB**.
  This is agreement with an imperfect comparison reference, **not measured MR attenuation
  against a clean ground truth**, and not full-file verification of vocal preservation.
- The same comparison model's output on MR-only control excerpts was approximately
  57 dB and 40 dB below the respective input. These controls establish neither a clean
  vocal truth nor an amount of MR removed from the recordings.
- Review WAVs are the app module's **8 kHz mono analysis output**, not the comparison
  model output or a full-fidelity export. Both decode completely; the review ZIP passes
  its integrity check. They stay outside Git.

## Synthetic and browser validation

- Targeted Node suite after integrating #452: **54 passed** (alignment, streamed buffers,
  progress, model diagnostics and refusal reasons). Syntax and diff whitespace checks pass.
- New fixtures cover changing delay, quiet MR, unrelated waveform, solo voice, silence,
  short input, unsupported voice-only stretches, actual worker pass-through and bounded
  three-minute transfer buffers. Existing ±0.5% constant-speed and early-start checks pass.
- An independently injected synthetic voice isolates vocal alteration from residual MR:
  signal-to-error ratio approximately **19.4 dB**, projection level change **−0.05 dB**.
  This is a controlled fixture result, not proof of unchanged real voices.
- Final Chromium mobile/desktop screen regressions after the #452 merge: **73 passed,
  5 conditional skips**. Separate analysis/MR-result replacement cases: **4 passed**.
- Windows automated WebKit lacks the usable Web Audio context in this setup. Related
  baseline main checks fail too. The unavailable engine's remaining run was stopped;
  it is not reported as a passing WebKit suite. Bundled Chromium also cannot decode the
  supplied AAC here; installed Edge was used for the real-byte browser check.

## Remaining acceptance

Actual iPhone Safari/PWA, listening acceptance, full-file vocal-preservation assessment,
and production behavior remain unverified. Residual MR is expected. This PR is a concrete
improvement candidate, not a claim of perfect source separation or completed deployment.
No DB, media ownership, stored analysis, server separation queue or production data changes.
