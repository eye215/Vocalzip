> **과거 v1 구현 안내입니다.** 현재 홈은 student-home-html.js가 원본 HTML과 공통 tokens.css를 Shadow DOM에 연결합니다. 아래 approved-home.css import 방식은 현재 홈 엔트리와 다릅니다. 최신 기준은 [토큰 참조](TOKEN_REFERENCE.md)와 [디자인 가이드](../docs/design/VOCALZIP_DESIGN_SYSTEM_2026-11-09.md)를 확인하세요.

# Approved student home preview

This extends the design-system files from PR #120 (b674e8a) while preserving their existing exports. The approved home uses the scoped v1 factories and overrides in `approved-home.css`; the rest of the application keeps its own tokens.

Open `/design-system/student-home-preview.html` through the application web server. Default fixtures reproduce the approved information hierarchy with DOM, CSS and small SVG graphics. Fixtures exist only in `student-home-preview.js`. Additional states: `?state=empty`, `?state=many` (900 goals), `?state=failure`, `?state=boundaries` (0, 99, 100, 120, 121 percent).

Import order: `tokens.css`, `components.css`, `approved-home.css` after the application skins. The application and preview both import `createStudentHome` from `components.js`. Phosphor fill icons use the repository's `vendor/phosphor/fill.css`.

`createStudentHome(options)` returns a `.vz-student-home[data-vz-theme=student][data-vz-design=approved-home-v1]` element. Supported data:

- greeting, name, subtitle.
- stage and lesson: title, subtitle, dateLabel, daysLeft, id. Dates and D-day are caller-calculated.
- goals: ordered {id, title, source: homework | personal | recommendation, completed}.
- week: {days: [{date,label,minutes,targetMinutes,ratio,state,today}], actualMinutes,targetMinutes,ratio,streak}. Minutes are actual practice minutes. Ratios are percentages (100 = 100%). Positive targetMinutes derives each day's ratio; missing targets stay neutral unless the caller supplies an explicit ratio. Future state is `future`; today remains independent. The caller supplies date-local ordering, deduplicated time totals and its streak policy.
- recent: {id,title,artist,canPlay}. The detail and optional play control are separate buttons.

Callbacks: onGoals, onGoalToggle(id,nextCompleted), onNotifications, onProfile, onStage, onLesson, onCalendar, onRecent, onPlay, onLessons (lesson notes), onPractice (practice records), onGrowth. No component performs persistence, networking or navigation. Goal completion is optimistic; the checkbox is disabled while its promise is pending and rolls back on rejection or a false result. Rows keep their order and the list retains its DOM and scroll position. Missing data renders honest empty states.

Additional exports: createStudentHeader, createUpcomingStage, createGoalProgress, createGoalChecklist, createWeeklyPractice, createRecentSongActions, createStudentDock. `createRecentSongActions` returns `.vz-recent-region` for partial updates. The preview uses createStudentDock; the application keeps its existing router-backed `.v-nav.vz-home-dock`.

Approved home colours are scoped --vz tokens, with no mutation of existing --bg tokens. No full-screen raster is rendered. Stage curtains and cover art are decorative CSS; flower badges and semicircle gauges are SVG.

Validation performed during implementation: JavaScript compiled with the available V8 parser; CSS brace balance checked; a lightweight mock DOM checked checkbox pending disable/failure rollback, immutable caller records, empty home construction, and daily 0/99/100/120/121 percent boundaries. This mock is not browser validation. This environment has no usable execution/browser environment. No rendered screenshots, Chromium/WebKit checks or iPhone Safari/PWA checks were performed here. These remain required before claiming visual parity. Touch targets and long content can increase card heights relative to the approved raster; scrolling is intentional.

