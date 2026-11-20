# v5 cleanup — requirements (deep pass)

## Why

The first v5 PRs (#499, #500, #501) each changed one CSS rule. That is too slow and too shallow. The owner wants the look cleaned up **at the root**: one definition per component, tokens instead of raw values, and every screen checked. Work in large batches.

## Measured on main, 2026-11-20 (56 CSS files, 6,284 lines)

| What | Count | Target |
|---|---|---|
| Raw 6-digit hex colours in CSS | 2,282 (vs 1,471 `var(--vz…)`) | tokens only, except inside `design-system/tokens.css` |
| Raw accent `#7A32F5` | 254 | 0 outside tokens (`var(--vz-color-accent)` or the existing token name) |
| Off-brand purples `#9557FF` (7), `#7C3AED` (1) | 8 | 0 |
| Distinct `border-radius` px values | 20+ (2,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,20,22,99,999) | radius tokens only (check `tokens.css` and v4 guide; expected 8 · 12 · 16 · 20 · pill) |
| Distinct `font-size` px values | 39 | the v4 type scale only |
| Files that restyle `.btn` | 25 | `design-system/components.css` / `global-app.css` only; screens may position, not restyle |
| Card class names (`*card*`) | 36 | one card component + modifiers |
| Chip class names (`*chip*`) | 19 | one chip component + modifiers |
| Tab bar class names (`*tabs*`) | 10 | one segmented tab component |
| `!important` | 119 (top: `approved-home.css` 14, `voice-check.css` 8, `media-dock.css` 8, `shared-nav.css` 6) | only where it beats a third-party rule; each kept one gets a comment |
| Inline `style="` in JS templates | 269 (top: `views-main.js` 30, `views-lessons.js` 29, `import-hub.js` 27, `views-more.js` 17) | classes; inline style only for computed values (width %, colour from data) |
| Spinner on a list screen | `song-check-ui.css` | skeleton blocks per v5 |

Re-measure at the start; the numbers above are a baseline, not a promise.

## Requirements

### C1. Audit document first

Write `docs/design/V5_AUDIT_2026-11-20.md`:
- For every route in `app/core.js` (light screens), list the components it uses, and every place where screen CSS restyles a shared component (file:line).
- A mapping table: old class → shared component + modifier.
- The token table: every raw value found → the token it becomes. Values with no token: propose one, or say it stays and why.
- Merge this into the same PR as C2 if it is ready; do not wait for review on the document alone.

### C2. Tokens everywhere (no visible change)

- Replace raw colours, radii, font sizes, shadows and spacing with tokens, file by file.
- Visual result must stay the same, except off-brand purples move to the accent.
- Prove it: before/after screenshots of the touched screens at 390×844 and 820×1180 with the same fake data, compared pixel by pixel (Playwright `toHaveScreenshot` locally or a small diff script). List any screen with a diff in the PR and say why.

### C3. One definition per component

Card, chip, segmented tabs, list row, section header, empty state, sheet, button, field, toast, badge.
- Define each once in `design-system/components.css` (or `global-app.css` where it already lives) with modifiers.
- Screens use the shared class. Screen CSS keeps layout only (grid, gap, order, width).
- Delete the dead screen rules this frees. Grep that no JS still renders the old class before deleting it; keep the old class as an alias if some JS still uses it.

### C4. Inline styles out of JS templates

Start with the four biggest files. Move static inline styles to classes. Keep computed ones.

### C5. `!important` down

Remove each one that is no longer needed after C3. Comment each one that stays.

### C6. Screen passes (v5 build order steps 3–4)

오늘, 내 곡, 기록 (calendar, lessons, homework), 설정 and its sub-pages, 가져오기. Each screen:
- uses shared components only;
- has v5 empty, loading and error states;
- 44px targets, no horizontal scroll at 320, 390, 430, 820, 1180.

### Out of scope here

- 성장: done by `.kiro/specs/growth-v2/`. Do not restyle the old growth screens beyond token swaps; they will be replaced.
- Dark doing-screens (`daily-set`, recorder, practice runner): token swaps only.
- Score screens (`app/score-*`): another agent is working there now. Do not touch `score-*.css` or `score-*.js` in this spec.
- The files listed in `.kiro/steering/tech.md` → "Files not to touch".
- No data, route or behaviour change. No text change except where a screen shows a technical word.
