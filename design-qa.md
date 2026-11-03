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


## Calendar iteration — 2026-11-03
Source: right-hand calendar in codex-clipboard-2970792b-57fc-4a16-b283-718b4c0b9bd6.png. IAB 390×844 capture and side-by-side comparison: workspace outputs/calendar-preview.png and outputs/calendar-comparison.png.
- P2 fixed: nested section inherited app screen hiding; selected-day region now uses a div with region role.
- P2 fixed: repeated brand/page explanation pushed calendar below the fold; record route now uses a compact centered title.
- Typography: existing system Korean font, 19px month, 14px days, 13px record titles and 12px secondary metadata.
- Spacing: retained 44px date targets and existing write/list switch; these intentionally make the real calendar taller than the reference. Daily cards continue below and remain reachable by scrolling. The local development-only banner is not shipped.
- Color: existing lavender palette and white cards preserved, selected date clearly highlighted.
- Assets: official Phosphor icons; activity dots encode actual record presence. No synthetic activity.
- Copy/data: valid real calendar dates replace the reference's invalid day numbers; lessons/practices/performed homework derive from stored records. No date mutation or migration.
Calendar component result: passed. Full-board completion remains pending homework/detail screens.


## Homework iteration — 2026-11-03
Compared user codex-clipboard-0dea53d8-91ab-4df0-8d90-41e59568b462.png with IAB 390×844 capture in outputs/homework-comparison.png (source and implementation together).
- Preserved selected lavender tab, white rounded task rows, outlined checkbox, completed disclosure and primary add action.
- Removed repeated brand header and outer card frame; retained settings access and original lesson-write entry.
- Typography: 22px centered title, 16px section heading, 13px task, 12px helper text. Existing Korean font retained.
- Spacing: 44px checkbox interaction, wrapping titles/notes, collapsed history and completed sections, scrollable long lists.
- Color/icons: original palette; official Phosphor outline/check icons, visible keyboard focus.
- Content: real active/completed counts; fixture has one task versus reference's three. No placeholder tasks shipped. Existing carried lesson links and performed notes retained.
- Added edit control and expandable history intentionally preserve existing product capability. Development-only fixture banner is not shipped.
Homework component result: passed. Independent practice detail page remains next.
