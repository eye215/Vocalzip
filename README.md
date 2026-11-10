# VOCAL.zip

레슨·개인 연습·공연과 녹음·악보를 곡별로 연결해 관리하는 모바일 우선 웹앱입니다.

[서비스 열기](https://vocalzip.yullul.com/) · [디자인 시스템](docs/design/VOCALZIP_DESIGN_SYSTEM_2026-11-09.md) · [개발 실행 현황](docs/planning/STUDENT_1_0_EXECUTION_STATUS.md)

> 2026-11-10 소스 기준 안내입니다. 소스 구현, 자동 검사, 운영 적용, iPhone 실기기 확인은 서로 다른 상태입니다. 운영·인수 상태는 실행 현황과 각 PR의 검증 기록을 확인하세요.

## 현재 화면 구성

하단 메뉴는 **홈 · 내 곡 · 보관함 · 일정** 네 개입니다. 녹음은 별도의 원형 플로팅 버튼으로 시작합니다.

| 화면 | 주요 기능 |
|---|---|
| 홈 | 다가오는 레슨·무대, 주간 연습과 목표, 최근 연습곡, 레슨노트·연습 기록 바로가기 |
| 내 곡 | 최근 연습곡, 곡 검색·필터·정렬, 나의 공연, 곡별 상세 기록 |
| 보관함 | 녹음·음원·영상 가져오기, 종류별 목록과 검색·선택, 인라인 재생, 업로드·분석 처리 내역 |
| 일정 | 날짜별 레슨·연습·공연·녹음과 월간 연습 요약 |
| 녹음 | 곡 선택 → 준비·녹음·일시정지 → 미리 듣기·저장. 하단 메뉴를 숨기는 다크 집중 화면 |
| 곡 상세·보컬 연구소 | 연결된 녹음·활동·숙제·악보, 선택 녹음의 분석과 날짜별 비교·메모·연습 연결 |
| 노래 연습실 | 홈 진입 → 전체 로드맵 → 공통 녹음·A/B 비교·답변 제출 → 기초 분석·회고 → 복습·응용 추천. 실제 제출의 연습 시간과 명시적으로 선택한 다음 목표만 기존 기록에 연결 |
| 레슨비 정산 | 별도 경로 [`/billing/`](billing/), 레슨권·결제·차감·복구와 백업·수동 동기화 |

보관함의 `+`에서 기기 파일 선택을 시작하고, 업로드 전에 날짜·곡·종류를 확인합니다. 영상은 음성을 추출해 저장합니다. 실제 분석값이나 신뢰도가 부족하면 그 상태를 표시하며, 예시 파형·수치로 사용자 기록을 채우지 않습니다.

녹음 길이와 사용자가 입력한 연습 시간은 구분합니다. 레슨·숙제·파일·정산 사이의 삭제와 복구는 연결 규칙을 따릅니다. 삭제 영향은 작업 화면에서 확인하며, 한 기록의 삭제를 모든 연결 데이터의 자동 삭제로 취급하지 않습니다.

노래 연습실의 첫 버전은 기준음·짧은 선율·리듬·연결 녹음의 **기기 내 기초 분석과 규칙 기반 추천**입니다. AI 모델 기반 보컬 채점은 연결하지 않았습니다. 표현·발성·공연은 제출·자기 회고를 지원하고, 예시 자료는 실제 목표·연습 시간·숙련도에 반영하지 않습니다. 실제 녹음은 기기에 먼저 보관하고 로그인 계정의 R2 저장이 확인되면 연결합니다. 회고·답변은 기존 연습 기록에 포함되어 Supabase와 동기화됩니다. 기존 레슨·곡·분석·정산 데이터와 인증 정책은 변경하지 않습니다.

## 디자인 기준과 토큰

시각·상태·상호작용의 최신 기준은 [디자인 시스템 가이드](docs/design/VOCALZIP_DESIGN_SYSTEM_2026-11-09.md)입니다. 파일 이름의 날짜보다 문서의 버전과 최신 변경 이력을 확인합니다.

| 파일 | 역할 |
|---|---|
| [`design-system/tokens.css`](design-system/tokens.css) | 공통 색·글자·간격·모서리·상태·폼·메뉴·네비·모션의 원본 |
| [`design-system/TOKEN_REFERENCE.md`](design-system/TOKEN_REFERENCE.md) | 토큰 선택, 기존 이름과의 호환 연결, 테마와 적용 범위 |
| [`design-system/global-app.css`](design-system/global-app.css) | 일반 화면의 공통 셸과 역할별 규격 |
| [`app/app.css`](app/app.css) | 앱 기본 스타일·폼·작업 메뉴·토스트 |
| [`design-system/student-home-html.js`](design-system/student-home-html.js) | 원본 홈 HTML과 공통 토큰을 Shadow DOM에 연결하는 어댑터 |
| [`design-system/Vocalzip_Floating_Record_Home.html`](design-system/Vocalzip_Floating_Record_Home.html) | 보존하는 홈 원본 |
| [`billing/billing.css`](billing/billing.css) | 같은 공통 토큰을 불러오는 정산 화면 스타일 |

- 새 공통 값은 `tokens.css`에 정의하고 화면에서는 `var(--vz-…)`로 사용합니다.
- 기존 `--accent`, `--vz-accent` 등의 이름은 호환 별칭으로 남깁니다. 화면별로 같은 값을 다시 선언하지 않습니다.
- `student-home-tokens.css`와 전달 폴더의 `design-tokens.css`는 공통 파일을 불러오는 호환 진입점입니다.
- 다크 녹음·선생님 테마·원본 홈의 장식은 각 범위의 예외입니다. 공통 색을 바꿀 때 이 범위도 확인합니다.
- 과거 `approved-home.css`와 레퍼런스 문서는 현재 운영 화면의 기준 파일로 혼용하지 않습니다.
- 같은 역할의 디자인을 변경하면 구현과 가이드·변경 이력을 같은 PR에서 갱신합니다.

홈 미리보기: [`design-system/student-home-preview.html`](design-system/student-home-preview.html). `?state=empty`, `?state=many`, `?state=failure`, `?state=boundaries`로 예시 상태를 확인할 수 있습니다. 미리보기 데이터는 실제 계정에 저장하지 않습니다.

## 저장과 동기화

- 앱 기록은 localStorage의 `vocal-zip_mvp_v1`, 기기 미디어는 IndexedDB의 `vocalzip_media_v1`에서 관리합니다.
- 로그인한 계정의 기록 동기화와 파일 클라우드 백업은 별도 작업입니다. 백업 중·실패·기기 전용 상태를 구분합니다.
- 기록 JSON 백업에 음원 원본은 포함되지 않습니다. 브라우저 데이터를 지우기 전에 파일 백업 성공 여부도 확인해야 합니다.
- 정산은 별도 IndexedDB `vocalzip_billing_v1`와 수동 클라우드 전송을 사용합니다. 앱 기록의 자동 동기화와 구분합니다.
- 서버 버전 기반 snapshot 브리지는 소스에 있지만 `VZIP_SNAPSHOT_REVISION_ENABLED`의 기본값은 `false`입니다. 구현된 소스가 있다는 이유로 운영 활성화·기기간 충돌 해결 완료로 표시하지 않습니다.
- 업로드 재시도·복구·이어올리기의 적용 범위는 [업로드 복구 계약](docs/planning/MEDIA_UPLOAD_RECOVERY.md), [이어올리기 계약](docs/planning/R2_RESUMABLE_UPLOAD_CONTRACT.md), [최신 실행 현황](docs/planning/STUDENT_1_0_EXECUTION_STATUS.md)을 확인합니다.

## 저장소 구조

| 위치 | 내용 |
|---|---|
| `index.html`, `app/` | 앱 진입점, 화면, 기록·녹음·플레이어 동작 |
| `design-system/` | 공통 토큰·컴포넌트·홈 어댑터·미리보기·폰트 |
| `billing/` | 독립 정산 모듈과 전용 검사 |
| `sync/` | 버전 기반 저장·동기화 연결 |
| `worker/` | 미디어·분석 관련 서버 작업 |
| `supabase/` | DB·서버 함수·마이그레이션 및 제안 소스 |
| `docs/design/` | 최신 디자인 가이드와 참고 자료 |
| `docs/planning/`, `docs/reviews/` | 실행 계약·현황과 검증 기록 |
| `tests/`, `.github/workflows/` | 자동 검사와 실행 설정 |

`legacy.html`과 과거 화면 파일은 호환·이력용입니다. 새 화면은 현재 `index.html`의 진입점과 최신 가이드를 기준으로 작업합니다.

## 로컬 실행과 검사

빌드 단계가 없는 정적 HTML/CSS/JavaScript 앱입니다. 녹음 권한은 HTTPS 또는 localhost에서 사용합니다.

```sh
npm install --ignore-scripts
python3 -m http.server 4173 --bind 127.0.0.1
```

Windows에서는 `python3` 대신 설치된 `python` 명령을 사용할 수 있습니다. 앱은 `http://127.0.0.1:4173/`, 정산은 `http://127.0.0.1:4173/billing/`에서 엽니다.

별도 터미널에서 검사합니다.

```sh
npx playwright install --with-deps chromium webkit
npm run test:syntax
npx playwright test tests/design-tokens.spec.cjs tests/student-home.spec.cjs
npm run test:ui
```

토큰 검사는 호환 진입점, 작은 화면과 데스크톱의 공통 셸, 테마·다크 화면, 입력·비활성·포커스, 정산, 홈 내부 적용과 접근성 설정을 확인합니다. 브라우저 검사는 테스트 데이터와 대역을 사용하며 실제 사용자 기록을 시험 데이터로 사용하지 않습니다.

자동 검사 통과는 실제 iPhone Safari/PWA의 마이크·키보드·Safe Area·파일 선택·장시간 녹음·다른 기기 동기화 인수를 대신하지 않습니다.

## 배포와 변경 상태

이 저장소는 `main` 루트를 GitHub Pages로 제공합니다. PR 브랜치의 변경은 `main` 병합과 배포 확인 전까지 서비스에 반영된 것으로 표시하지 않습니다. 프런트엔드 변경과 서버 함수·DB 설치·기능 활성화는 각각 확인합니다.

클라이언트에 서버 비밀키를 넣지 않습니다. 사용자 파일·원장·기존 데이터를 일괄 변경하는 작업은 UI 수정과 분리합니다.

## 더 보기

- [학생 1.0 실행 현황과 다음 순서](docs/planning/STUDENT_1_0_EXECUTION_STATUS.md)
- [최신 디자인 시스템 가이드](docs/design/VOCALZIP_DESIGN_SYSTEM_2026-11-09.md)
- [토큰 사용과 마이그레이션](design-system/TOKEN_REFERENCE.md)
- [레슨비 정산 안내](billing/README.md)
- [레슨 데이터 연결 계약](docs/레슨데이터_연동계약.md)
- [저장 충돌·앱 브리지 범위](docs/planning/STUDENT_1_0_SNAPSHOT_APP_BRIDGE.md)
