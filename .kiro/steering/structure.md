# VOCAL.zip — where things are (Kiro steering)

## App shell

- `app/core.js`: the app record (`VZ.db`), `VZ.change`, routes (`VZ.route`), helpers.
- `index.html`: the script list.
- Bottom tabs: 오늘 · 내 곡 · 기록 · 성장.
- 오늘 tab (home): `design-system/student-home-app.js`, its model and CSS.

## Recordings and analysis

- `app/media.js`: recordings, capture.
- `app/analysis.js`: one recording's analysis, stored as `analysis` on the recording.
- `app/growth-dataset.js`: which takes count. `verdictRule({practice})` decides whether practice takes are included.

## Growth (성장)

### Tab and screens

- `app/growth-hub.js`: the tab with three tabs, 이번 달 · 곡 · 연구소.
- `app/growth-month.js` + `growth-month-model.js`: 이번 달.
- `app/vocal-lab.js` + `growth-song-model.js`: 곡 and 곡 분석.
- `app/growth-lab.js`: 연구소.
- `app/monthly-growth.js`, `overall-growth-ui.js`, `overall-growth-model.js`: 지난 흐름 (monthly and all-time reports, AI coach).
- `app/weekly-summary*.js`: weekly view.

### Models: reuse, do not rewrite

- `growth-metrics-model.js`: `comparePair`, `compareMetric`. These are the comparison rules.
- `growth-changes-model.js` + `growth-changes-ui.js`: 무엇이 달라졌나.
- `growth-between-model.js`: what was done between two takes.
- `growth-next-model.js`: the merged "다음 연습" list.
- `growth-range-model.js`: range.
- `listen-verdict-model.js`: listening verdicts.
- `segment-ab-*`: blind A/B listening.
- `ear-agreement-model.js`: how the ear and the numbers agree.

## Practice

- `app/daily-set-model.js` + `daily-set-run.js`: 오늘의 연습, the daily set and the dark runner.
- `app/practice-set*.js`: the person's own set steps.
- `app/guided-practice.js`: 보컬 트레이닝.
- `app/voice-check*.js`: 매일 보이스 체크.
- `practice-room/`: 노래 연습실.

## Levels

- `app/levels-model.js` + `levels.js`: 단계.
  - Lv comes from consistency points.
  - Skill steps cover 8 areas × 5 steps. They are rows `skill-step:<area>:<n>` in `practicePlans`.

## Lessons and sheet music

- `app/views-lessons.js`: lessons.
- `app/score-points*.js`: 레슨 지적 체크.
- `app/score-ink*.js`: sheet-music handwriting.

## Planning docs

- `docs/`: product decisions and plans.
- `.kiro/specs/`: work specs for Kiro.
