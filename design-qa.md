# Player component design QA — 2026-11-03

Scope: recorder and linked-media playback components, not the full reference screen board.
Source: user attachments codex-clipboard-2970792b-57fc-4a16-b283-718b4c0b9bd6.png and codex-clipboard-bb432b02-b051-4348-89c6-d17b3f5a8e7c.png.
Runtime: existing production repository, local fixture server http://127.0.0.1:4174; IAB viewport 390×844. Production data not used.
Captures: workspace outputs/recorder-preview.png, outputs/player-preview.png, outputs/player-comparison.png. Combined source/implementation comparison inspected. Recorder is idle rather than the reference's active recording: no invented waveform. Playback fixture is an imported synthetic WAV without stored peaks, so its seek-only fallback is intentional.

## Findings and fixes
- P2: recorder was buried below form fields. Moved existing recorder into the first form position; preserved inputs and submit handlers.
- P2: duplicate headings and optional filename inflated vertical layout. Removed duplicate presentation and collapsed optional filename; final recorder capture inspected again.
- P2: stop label wrapped in circular button. Reset inherited padding, kept label on one line and retained 58px target.
- P2: player card whitespace could trigger comparison selection. Excluded the entire player from row click behavior; focused test passed.
- Remaining scope: calendar/homework/detail page composition has not been rebuilt. No claim of full-board fidelity.

## Five surfaces
- Typography: existing Korean system font retained; timer 42px with tabular numerals, secondary text 12–13px, readable playback times.
- Layout: centered 82px recording action with 58px side actions; rounded 22px player; 54px play target; flexible track fits mobile. Optional native controls remain reachable.
- Colors: existing lavender/white palette retained as requested; disabled state distinct; focus outline visible.
- Assets: official Phosphor 2.1.2 icon font vendored with MIT license. Waveform is actual live signal / stored bounded amplitude summary; no decorative fake peaks or AI claims.
- Copy: actual states and recovery messages; optional filename, unknown length, failed playback, paused recording handled. Reference's fabricated AI audio assessment is not copied.

Component review: passed with the intentional data/state differences above.
Full selected-screen fidelity gate: pending calendar, homework and detail layout work and matching active-state source captures.
final result: blocked

Blocker is incomplete full-screen design QA, not permission or missing access. Do not present this iteration as a completed recreation of all selected screens.
