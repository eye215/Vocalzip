# 성장 v2 — tasks

Each phase is one branch and one PR. Before opening a phase's PR, send screenshots at 390×844 and 820×1180 to the owner through the main assistant. Do not merge your own PR.

- [ ] **Phase 1 · model.** Add `app/growth2-model.js` (pure) with node tests. It builds:
  - [ ] the 나 data: Lv card, 8 area tiles with sparkline values, the one change sentence for the period, 다음 연습 top 3, and 이번 달 한 것;
  - [ ] the 곡 gallery data;
  - [ ] the 기록 rows with states.
  - Tests use fake data. No UI.
- [ ] **Phase 2 · 나.** Add the new 성장 tab shell 나 · 곡 · 기록 and the 나 screen, plus the area page (R3).
  - `#/vocal-growth` lands on 나.
  - Specs: above-the-fold content at 390×844, the period switch, the practice switch shared with 곡, the area page.
- [ ] **Phase 3 · 곡.** Add the gallery and the 곡 page (R4), with every capability of 곡 분석 reachable.
  - Old `#/vocal-lab…` routes land on the 곡 page.
  - Specs: gallery states, the take timeline, the pair compare, blind A/B, weak places, lesson points, and every lab capability reachable.
- [ ] **Phase 4 · 기록 and routes.** Add the 기록 list (R5) and redirect every old route (R7). Update the old growth specs.
  - Characterization: numbers unchanged, UI keys listed.
- [ ] **Phase 5 · cleanup** (only after the owner accepts v2 on the device). Remove the old 성장 tab entry points. Keep the files that 기록 still uses.
