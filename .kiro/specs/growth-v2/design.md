# 성장 v2 — design notes

## Approach

Build new screens in new files. Keep the old screen files as they are. Point the 성장 tab and the old routes at the new screens.

- When v2 is accepted, remove the old screen entry points in a separate cleanup PR.
- Remove nothing that 기록 still links to.

### New files (suggested)

- `app/growth2-model.js` (pure, UMD, node tests)
  - Composes data for 나 and the 곡 gallery from the existing models:
    - `levels-model`
    - `growth-dataset.verdictRule`
    - `growth-metrics-model.comparePair`
    - `growth-changes-model` (with a period)
    - `growth-next-model`
    - `weekly-summary-model` / `growth-month-model` (한 것)
  - No new calculations. When something is missing, add it to the owning model with a test.
- `app/growth2.js` + `app/growth2.css`: the tab shell (나 · 곡 · 기록) and 나.
- `app/growth2-song.js`: the 곡 gallery and 곡 page.
  - The 곡 page reuses the existing UI pieces where they fit: `growth-changes-ui`, `listen-verdict`, `segment-ab-ui`, `score-points`.
  - Some capabilities only exist inside `vocal-lab.js` (tick to analyse, batch analysis, reference marks, MR re-analysis). Either call them through a small exported API added to `vocal-lab.js`, or link to them from 기록. Do not copy-paste them.
- `app/growth2-record.js`: 기록 list.
  - It may reuse `app/growth-lab.js` row data (states).

## Data in

- Levels and steps: `VzipLevels` (see `app/levels-model.js`).
- Takes: `VZ.media` list → `VzipGrowthDataset` rules.
- Lessons, practices, goals, plans: `VZ.db`.

## Period

나 has a period switch: 이번 주 · 이번 달 · 전체.
- The default is 이번 달.
- The choice is remembered per device in localStorage, wrapped in try/catch.
- Comparisons use the previous period vs this one (`growth-changes-model` with a period).
- 전체 uses first vs latest.

## Visual

These are suggestions inside the design system. The owner reviews them with screenshots before merge.
- 나 opens with one large Lv card in a soft purple gradient.
- The 기본기 grid is 2×4 on phone and 4×2 on iPad. Each tile has an icon, the area name, a step meter (5 dots), and a tiny sparkline.
- The change sentence card has a play pair.
- 곡 gallery cards are horizontal on iPad and stacked on phone.

## Risks

- Many existing specs pin the current growth structure. List them, update their selectors, and keep their intent.
- `growth-characterization.spec.cjs`: numbers must not change.
- WebKit `goto` rule. See `tech.md`.
