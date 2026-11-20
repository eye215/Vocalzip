# v5 cleanup — tasks

Pace: **one PR per batch below, not per CSS rule.** Do not stop between tasks to ask; run the whole batch, run the tests, push, open the PR, then start the next batch on a new branch stacked on the previous one. Stop and ask only when a change would be visible in a way the requirements do not cover.

Before every push: `git fetch origin && git merge origin/main`, then `npm run test:syntax`, then the Playwright specs for every area you touched (`chromium-mobile` and `chromium-desktop`; add `webkit-mobile` for anything touching layout), plus `tests/v6.spec.cjs` and `tests/polish-audit.spec.cjs`.

- [ ] **Batch 1 · audit + tokens** (C1, C2). Branch `v5-tokens`.
  - [ ] Re-measure the table in requirements.md with a script; commit the script as `tools/css-audit.cjs` so later batches can re-run it.
  - [ ] Write the audit document.
  - [ ] Swap raw colours, radii, font sizes for tokens in every in-scope CSS file.
  - [ ] Pixel diff before/after; PR lists the result per screen and the audit numbers before → after.
- [ ] **Batch 2 · shared components** (C3, C5). Branch `v5-components`.
  - [ ] Card, chip, tabs, list row, section header, badge, toast in `components.css`.
  - [ ] Point every screen at them; delete the freed screen rules; remove unneeded `!important`.
  - [ ] Add a spec in `tests/v6.spec.cjs` that fails if a screen CSS file restyles colour, radius or font of a shared component (static check over the CSS files is fine).
- [ ] **Batch 3 · 오늘 + 내 곡** (C4 for `views-main.js`, C6). Branch `v5-home-songs`.
- [ ] **Batch 4 · 기록 + 설정 + 가져오기** (C4 for `views-lessons.js`, `views-more.js`, `import-hub.js`; C6). Branch `v5-calendar-settings`.
- [ ] **Then** start `.kiro/specs/growth-v2/` Phase 1 (pure model, no UI — it can run while batches 1–4 are in review).

Each PR description: what changed, the audit numbers before → after, the tests you ran with pass counts, and the screens that look different (should be none for batch 1).
