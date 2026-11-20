# 성장 v2 — requirements

## Why

The owner (a singer) has watched the 성장 tab go through several redesigns. Each one folded the old content away and added a new layer on top, so to them nothing really changed.

They want a **new structure, built from scratch**, centred on two things:
- **단계**: Lv plus the 8 기본기 areas.
- **곡**: how each song has grown.

It also needs a **new visual design**.

Old screens must not survive as folded sections inside the new ones.

## Who

One singer. iPhone (390×844) and iPad (820×1180 and 1180×820), installed PWA, Korean UI in 해요체.

## Requirements

### R1. One new 성장 tab with three sections: **나 · 곡 · 기록**

- **나** is the first screen.
- The current 이번 달 · 곡 · 연구소 screens and the old 결과 리포트 / 지난 흐름 layouts are no longer shown in the 성장 tab.
- Their data and models stay (see R6).

### R2. 나 — "am I getting better, and what next" in one glance

Above the fold on a 390×844 phone, show:
1. A **Lv card**: level, name, progress to the next level, and today's points (from `app/levels-model.js`).
2. A **기본기 grid** of 8 tiles (호흡 · 음정 · 지속음 · 소리 길 · 음역 · 고음 · 비브라토 · 리듬).
   - Each tile shows the step (n/5), or 기준 맞추는 중, or 준비 중.
   - Each tile has a tiny trend line of the measured values and a 유지 중 mark.
3. **One sentence of change** for the chosen period (default 이번 달), taken from the existing change models.
   - Example: "Home · 지속음 흔들림이 줄었어요 (지난달 대비)".
   - With a play button that plays the two takes it compares.

Below the fold:
4. **다음 연습**: top 3 from `VzipGrowthNext`, each with its source chip and action.
5. **이번 달 한 것**: practice minutes entered, days, recordings, voice checks, lessons, lesson-point runs.

Rules for 나:
- No long explanations.
- Every number says what it compares in ≤ 1 short line.

### R3. 기본기 area page (tap a tile)

The page shows:
- the current step;
- the next step's criterion in plain words;
- progress, for example "3번 중 2번 했어요";
- a chart of values over time;
- the exercise that measures it, with a link into 오늘의 연습 고르기.

Areas without an exercise yet say what the exercise will be.

### R4. 곡 — songs as the second axis

- **곡 gallery**: one card per analysed song. Each card has:
  - a state chip (좋아진 방향 / 비슷함 / 아쉬운 방향 / 판정 보류 / 녹음 하나);
  - first and latest take play buttons;
  - one line of change;
  - take count;
  - last date.
  - It uses the shared verdict rule (`VzipGrowthDataset.verdictRule`) and the same 연습 녹음 포함 setting as 나.
- **곡 page**: a new design built on the same models as today's 곡 분석. It has:
  - a **take timeline** (dots by date, tap to play);
  - **처음 vs 최근** with the metric changes;
  - **두 녹음 비교** (pick two, blind A/B and listening verdict);
  - **약한 곳** (weak phrases, passaggio hint, lesson points, 구간 A/B);
  - **레슨 지적 체크** progress.
  - Every current capability of 곡 분석 (`app/vocal-lab.js`) stays reachable, either here or in 기록. That includes: tick recordings → analyse, batch analysis, reference take marks, same-day counting choice, MR re-analysis, and AI interpretation.

### R5. 기록 — everything deep or archival in one list

The list holds:
- monthly and all-time reports with AI coach;
- weekly summary;
- 리포트 보관함;
- 소리 길 흔적;
- 발성 정밀 측정 and its report;
- MR로 다시 분석;
- 녹음 하나 분석;
- 귀와 숫자;
- 분석 기준.

Each row has a name, one line, and a state. These screens may keep their current look in this spec. They are reached only from here.

### R6. Data and numbers

- No data change. No new top-level list. Reuse the pure models listed in `.kiro/steering/structure.md`.
- `tests/growth-characterization.snapshot.json`:
  - The numbers must not change.
  - The UI-text parts may be replaced by the new screens' text. List every changed key in the PR.
- The 연습 녹음 포함 switch keeps its current device setting key, so the choice survives.

### R7. Routes

- Every old route keeps working and lands on the closest new place. Routes to keep:
  - `#/vocal-growth` (and `?mode=monthly`, `?gc=`)
  - `#/growth-flow?period=`
  - `#/weekly-summary`
  - `#/growth`
  - `#/vocal-lab…`
  - `#/growth-lab`
  - `#/lab-reports`
  - `#/growth-ear`
  - `#/growth-basis`
  - `#/practice-stats`
  - `#/vocal-analysis`
- Back navigation behaves the same as today: a redirect does not bounce back.

### R8. Design

- New layout and cards, but within the app's design system:
  - `docs/design/VOCALZIP_DESIGN_SYSTEM_V4_2026-11-12.md`
  - accent purple `#7A32F5`
  - light canvas
  - Pretendard
- Record any new shared component rule in that guide in the same PR (see `AGENTS.md`).
- 44px targets. No horizontal scroll at 390, 820 and 1180.
- Respect reduced motion.

### R9. Done means

- Before each phase's PR, send the owner screenshots at 390×844 and 820×1180 for review.
- New specs exist for every section.
- The existing growth specs are updated where they pin the old structure.
- The relevant workflows are green, WebKit included.
