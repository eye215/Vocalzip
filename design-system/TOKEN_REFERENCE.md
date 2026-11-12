# 공통 디자인 토큰

기준: [디자인 시스템 가이드 v3.31](../docs/design/VOCALZIP_DESIGN_SYSTEM_2026-11-09.md), 2026-11-10.

## 원본과 적용 순서

**값의 원본은 [tokens.css](tokens.css) 한 곳이다.** 일반 앱은 토큰 → app/app.css → components.css → 화면 CSS 순서로 읽고, global-app.css가 공통 셸을 적용한다. 기존 선택자의 우선순위와 화면 동작은 유지한다.

홈은 원본 HTML을 수정하지 않고 student-home-html.js가 같은 tokens.css를 읽어 Shadow DOM에 넣는다. 원본의 .vz-phone에 선언된 과거 별칭도 이 범위에서 공통 값에 다시 연결한다. 정산은 billing.css의 첫 @import에서 공통 파일을 읽는다.

| 진입 파일 | 현재 역할 |
|---|---|
| tokens.css | 공통 원본과 호환 별칭 |
| student-home-tokens.css | tokens.css를 불러오는 호환 진입점 |
| ../design-handoff-20261108-lavender-home/design-tokens.css | 공통 원본을 불러오는 전달용 진입점 |
| approved-home.css | 과거 v1 시안 전용. 레거시 장식 팔레트는 이 파일 안에만 보존 |

전달 폴더만 복사하면 상대 import가 끊어진다. 디자인 전달 시 design-system/tokens.css도 같은 상대 경로로 포함한다. 단일 파일 배포가 필요한 경우 공통 원본에서 생성하며 별도의 값 사본을 수동 관리하지 않는다.

## 이름과 역할

새 코드는 의미별 --vz-color-*, --vz-type-*, --vz-space-* 및 컴포넌트 규격을 사용한다. 과거 이름은 제거하지 않고 호환 별칭으로 유지한다.

| 의미 | 공통 토큰 | 기존 별칭 |
|---|---|---|
| 배경 | --vz-color-canvas | --bg, --vz-page |
| 카드 면 | --vz-color-surface | --surface, --vz-surface |
| 제목 | --vz-color-ink | --ink, --vz-title, --vz-song-title, --text |
| 주요 글자·아이콘 | --vz-color-primary | --vz-primary, --primary |
| 본문 | --vz-color-ink-secondary | --ink-2, --vz-body, --body |
| 보조 문구 | --vz-color-ink-muted | --vz-muted, --muted |
| 비강조 | --vz-color-faint | --vz-faint |
| 주요 동작 | --vz-color-accent | --accent, --vz-accent |
| 눌림 | --vz-color-accent-strong | --vz-pressed |
| 연한 면 | --vz-color-accent-soft | --accent-soft, --vz-soft |
| 선택 탭·네비 면 | --vz-color-selected-bg | --vz-nav-selected |
| 구분선 | --vz-color-border | --line, --border |
| 카드 여백 | --vz-card-padding | --vz-padding-card |
| 카드 반경 | --vz-radius-card | --radius, --vz-card-radius |
| 카드 간격 | --vz-grid-gap | --vz-gap, --vz-card-gap |
| 페이지 좌우 | --vz-page-gutter | --vz-page-inset |
| 네비 흐림 | --vz-nav-backdrop-blur | --vz-nav-blur |

--vz-color-selected는 기존 컴포넌트 호환을 위한 선택 **전경색**이다. 선택 배경에는 --vz-color-selected-bg를 사용한다. --ink-3은 어두운 녹음에서 별도의 3차 글자색을 유지한다.

CSS var() 별칭은 선언된 요소에서 계산된 뒤 상속된다. 따라서 :root만 선언하고 끝내지 않고 body, 테마 요소와 홈 .vz-phone 경계에서 별칭을 다시 연결한다. 새로운 중첩 테마를 추가할 때 이 경계와 파생 토큰도 함께 확인한다.

## 역할별 글자와 공간

| 역할 | 크기 토큰 | 행간 토큰 | 기준 |
|---|---|---|---|
| 페이지 제목 | --vz-type-page-size | --vz-type-page-leading | 26/34px, 700 |
| 섹션 제목 | --vz-type-section-size | --vz-type-section-leading | 18/26px, 700 |
| 카드 제목 | --vz-type-card-size | --vz-type-card-leading | 16/22px, 600 |
| 곡 목록 | --vz-type-list-size | --vz-type-list-leading | 15/21px, 600 |
| 본문 | --vz-type-body-size | --vz-type-body-leading | 14/20px, 400 |
| 필터 | --vz-type-filter-size | --vz-type-filter-leading | 13/18px, 600 |
| 날짜·시간 | --vz-type-meta-size | --vz-type-meta-leading | 12/18px, 400 |
| 네비 라벨 | --vz-type-nav-size | --vz-type-nav-leading | 11/16px, 500–600 |
| 분석 수치 | --vz-type-metric-size | --vz-type-metric-leading | 27/32px, 700 |
| 최근 곡 강조 | --vz-type-feature-size | --vz-type-feature-leading | 23/29px, 700 |

이전 --vz-text-* 원시 크기 스케일은 호환용이다. 역할별 제목을 원시 스케일의 24/30px로 임의 대체하지 않는다.

공간 원시값은 4·8·12·16·20·24·32·40px이다. 페이지 좌우 12px/최대 폭 560px, 카드 R20/안쪽 16px/간격 12px, 큰 섹션 간격 32px을 각각 별도 의미 토큰으로 연결한다. 최소 터치는 44px이다. 사용자 글자 확대·긴 콘텐츠에서는 최소 높이를 쓰고 콘텐츠가 커지게 한다.

## 공통 상태와 구성요소

- 성공·경고·오류 및 연한 배경: --vz-color-success / warning / danger와 각각 -soft. 실제 일반 앱이 사용하던 피드백 색을 유지해 통합했다. 범주색 레슨·연습·공연은 별도 --vz-category-*이며 오류색으로 혼용하지 않는다.
- 포커스: --vz-color-focus, --vz-focus-width(2px), --vz-focus-offset(3px). 입력창은 기존 옅은 외곽선 색 --vz-color-input-focus와 offset 0을 유지한다.
- 비활성 저장: --vz-color-disabled-bg / ink. 실제 disabled와 유효성 검사·중복 실행 방지는 동작 코드가 담당한다.
- 폼: --vz-input-bg(#F2EFF7), --vz-input-min-height(52px), --vz-input-radius(15px), --vz-input-date-max(175px), --vz-field-gap(12px).
- 주 버튼: --vz-button-height(52px), --vz-button-radius(16px).
- 짧은 메뉴: --vz-menu-bg / ink / danger / hover / border / shadow, 최대 폭 304px·R27·행 최소 56px. 긴 선택·입력은 전체 페이지이며 새 바텀시트 규격을 추가하지 않는다.
- 네비: 높이 70px·최대 폭 528px·항목 54px·표면 rgba(255,255,255,.58)·흐림 24px. 선택 면 #EDE1FF, 라벨 #8A6DB8, 아이콘 22px.
- 녹음 플로팅: --vz-floating-size(56px), 도크 기준 세로 위치 82px, 공통 그라데이션과 그림자.
- 겹침 순서: --vz-z-nav(40), --vz-z-floating(41), --vz-z-overlay(60), --vz-z-toast(80). 기존 위치 관계를 보존한다. 브라우저 top layer와 개별 stacking context는 별도다.
- 모션: --vz-motion-fast(150ms), --vz-motion-normal(240ms). 동작 줄이기에서 0ms이며 개별 애니메이션의 접근성 처리도 유지한다.

## 테마·원본·이력

- 학생 테마가 기본이다. 선생님 테마의 기존 파란색 팔레트와 카드 효과는 [data-vz-theme="teacher"] 범위에서 유지한다.
- body.vz-record-mode의 배경 #0B0911, 면 #1B1724, 제목 #F7F5FC 및 보조 #AAA3B7을 공통 의미에 연결한다. 보컬 연구소·로그인의 다크 장식과 세부 차이는 화면 CSS의 의도된 예외다.
- 대비 높이기·투명도 줄이기에서는 공통 유리 면을 불투명하게 하고 네비 흐림을 제거한다. 홈 내부에도 같은 파일과 설정을 적용한다.
- 홈 원본 HTML의 장식, 녹음 파형과 그래프의 상태색·실시간 위치 변수는 전역 공통 토큰으로 억지로 합치지 않는다.
- 과거 전달값 카드 안쪽 20px/페이지 16px/곡명 #352544는 현재 공통값 16px/12px/#101828로 대체한다.
- 과거 네비 20px 흐림/.78 표면은 현재 공통값 24px/.58로 대체한다. 원본 HTML은 보존하고 어댑터에서 반영한다.

## 검사

```sh
npm run test:syntax
npx playwright test tests/design-tokens.spec.cjs tests/student-home.spec.cjs
```

전용 검사는 실제 브라우저의 최종 계산값으로 import, 별칭 재계산, 반응형 셸, 다크/선생님 테마, 폼·메뉴 상태, 정산, Shadow DOM 홈과 접근성 설정을 확인한다. 기존 홈 회귀 검사는 저장·실패 복원·탐색·원본 보존을 함께 확인한다.

검사 통과와 병합·Pages 배포·iPhone 실기기 인수는 각각 기록한다.

