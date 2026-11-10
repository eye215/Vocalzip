# VOCAL.zip 디자인 시스템

최신 시각·상태·사용 규칙은 [디자인 시스템 가이드](../docs/design/VOCALZIP_DESIGN_SYSTEM_2026-11-09.md), 실제 공통 값은 [tokens.css](tokens.css)를 기준으로 합니다.

- [토큰 사용·별칭·테마·마이그레이션](TOKEN_REFERENCE.md)
- [공통 셸](global-app.css) · [컴포넌트](components.css)
- [현재 홈 어댑터](student-home-html.js) · [미리보기](student-home-preview.html)

일반 앱과 정산, Shadow DOM 홈은 같은 공통 토큰을 읽습니다. `student-home-tokens.css`와 전달용 `design-tokens.css`는 공통 원본을 불러오는 호환 진입점입니다. 과거 승인 홈 전용 CSS와 레퍼런스 제안값은 현재 운영 기준으로 혼용하지 않습니다.
