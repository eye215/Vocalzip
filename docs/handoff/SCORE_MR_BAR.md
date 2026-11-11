# 악보 MR 재생·녹음 — 인계용 초안 (Claude, 2026-11-11)

**앱에 연결하지 않은 초안.** 사용자가 이 기능을 다른 작업자에게 맡기기로 해서 코드만 남긴다.

- `app/score-mr-bar.js`: `VZ.scoreMrBar(sheetEl, songId)`. 곡의 `mrTracks`(파일 MR)로 ▶재생 / ●녹음 / MR 틀고 녹음. 녹음은 `VZ.media.capture` → `M.saveBlob`으로 그 곡에 저장(`occasion:'practice'`, `mrTrackId`). 저장 전 악보를 닫으면 녹음을 보관함에 보존.
- `app/score-mr-bar.css`: 악보 편집기 세로 흐름 맨 아래 바.
- 연결 방법(미적용): `app/score-ink.js`의 `onMount`에서 `el.classList.add('score-ink-sheet')` 다음 줄에 `VZ.scoreMrBar?.(el,songId);`, `index.html`에 js/css 추가.
- `tests/score-mr-bar.spec.cjs`: Chromium 가짜 마이크로 재생→함께 녹음→저장 확인 (로컬 2/2 통과).
- 사용자 피드백: **훨씬 콤팩트하게** 넣어야 함, 디자인 가이드(`docs/design/VOCALZIP_DESIGN_SYSTEM_2026-11-09.md`) 준수. 현재 바는 너무 큼.
- iPhone에서 마이크 사용 중 MR 음량·출력 경로는 실기기 미검증.
