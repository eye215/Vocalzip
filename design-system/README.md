# VOCAL.zip Design System 1.0 — 실제 재사용 가능한 코드 라이브러리

**상태:** v1 기초 구현 / 검토용 분리 프리뷰. **현재 학생 v6 화면에는 적용되지 않음.**  
기준일: 2026-11-07 · 단일 소스: [tokens.css](tokens.css) · [components.css](components.css) · [components.js](components.js) · [preview.html](preview.html)

## 0. 기존 제품과의 연결

- 기존 디자인 토큰: `app/app.css`(학생 v6 라이트), `ios-lavender.css`(구 라벤더 시안), `glass.css`(구 다크 실험).
- 이 파일은 현재 v6의 CSS 전역 `:root`·`.card`·`.nav` 등과 충돌하지 않게 **모든 구현 클래스에 `vz-` 접두사**를 사용한다.
- 학생용 **라벤더 #7954E7**, 선생님용 **블루 #386CCB**를 공유 토큰 명세의 테마 값으로 설계. 실서비스에 자동 테마 적용된다는 의미는 아니다.
- DS v1은 **컴포넌트와 디자인 시스템 프리뷰를 빌드한 것**이고, 실제 목표 데이터/추천/휴식 동기화와 선생님 2.0 업무 데이터 로직까지 완성한 것은 아니다.
- 일일 목표의 실행 정책은 별도 [일일 목표 PR #118](https://github.com/eye215/Vocalzip/pull/118)을 참고한다. 이 PR이 아직 병합되지 않았다면 별도 계획으로 취급한다.

## 1. 디자인 원칙 — iOS 글래스 위젯

| 요소 | 토큰/수치 | 사용 위치 |
|---|---|---|
| 화면 폭 | 모바일 최대 `440px`; 기본 좌우 `20px` | 모든 학생용 화면 기본 그리드 |
| 4px spacing scale | `4,8,12,16,20,24,32,40px` | 간격은 토큰만 사용 |
| 기본 카드 곡률 | `28px` | 목표·주간·일반 카드 |
| 히어로 곡률 | `32px` | 다가오는 무대·다음 레슨 |
| 퀵 타일 | `20px` | 아이콘/텍스트 |
| 컨트롤 | `14px` | 버튼·텍스트 필드 |
| 독 | `30px` | 화면 하단; 중앙 마이크 |
| 카드 재질 | white .73 / blur 24px / saturation 145% | 글래스, 흰 테두리, 저채도 그림자 |
| 독 재질 | blur 30px / saturation 165% | iOS 스타일 플로팅 바 |
| 본문 글자 | `16px`, 보조 `14px`, 캡션 `12px` | 시스템 한국어 폰트 |
| 터치 목표 | 기본 최소 44px | 버튼·메뉴·폼 컨트롤 |
| 접근성 | reduced motion / transparency / contrast / focus | iPhone PWA · iPad · 웹 |

> **제한:** CSS 기본 `border-radius`는 실제 iOS 연속 곡선(superellipse)과 완전히 동일하지 않다. 현재는 구현 안정성을 우선하며 실기기에서 곡률·도크·블러를 비교해 보정한다. 글래스 질감은 브라우저/OS에 따라 달라질 수 있다.

## 2. 공용 컴포넌트 목록

| 컴포넌트 | CSS / JS | 상태·계약 |
|---|---|---|
| Base GlassCard | `.vz-card` | hero / 기본 / 타일. 공통 radius·surface·stroke·shadow |
| Hero / Upcoming Stage | `createHeroCard` | 제목·일정 D-day·레슨 서브 줄 |
| Daily Goal Card | `createGoalCard` | 원형 건수 달성률 + 단일 혼합 목표 목록; planned / rest / deferred |
| Progress Ring | `createProgressRing` | 완료/전체 개수, 총 개수 0일 때 미설정 |
| Goal Row | `.vz-goal-row` / GoalCard 내부 | 단순 완료형 체크, 시간·횟수형은 callback에서 수행량 입력 |
| Weekly Practice | `createWeekCard` | 요일 7칸 met/partial/empty/rest/future/unplanned, 실적 시간·streak |
| Song 1×1 + Quick 2 | `createWidgetGrid` | 최근 연습곡 카드 + 악보 열기·트레이닝 |
| Action Button | `.vz-button` | primary / secondary / quiet / block |
| Badge / Status | `.vz-pill`, `.vz-week__streak` | 라벨·현재 상태 |
| Floating Glass Dock | `createDock` | 5개 메뉴, 중앙 녹음, 선택 상태 |
| First-entry Bottom Sheet | `openPlanSheet` | 추천 리스트(유형 구분 없음) + 시간 목표(선택), 설정/휴식/나중 |
| Empty / Rest | `.vz-empty`, `.vz-goal-card--rest` | 계획 미설정, 의도적 휴식, 나중에 정하기 |

### 핵심 계산/정책
- **원형 지표:** 체크된 **오늘의 목표 개수 / 설정한 목표 개수**. 값이 0개면 `0%`가 아니라 미설정 `—`.
- **연습 시간:** 실제 별도 기록. 시간을 안 적었다면 목표 시간 달성률 산출 금지. 단순 체크로 연습 시간을 늘리지 않는다.
- **추천/홈 리스트:** 숙제 / 개인 목표 / 오디션 / 루틴 구분 없이 **단일 순서 목록**. 오른쪽 목록만 스크롤. 완료 체크 후 목록 순서 자동 변경 금지.
- **주간 카드:** 막대그래프와 불꽃 이모지 금지. 타일은 **일일 연습 시간 목표 대비 상태**를 표시한다. 주간 목표가 없으면 퍼센트 미계산.
- **휴식:** 모든 원본 숙제·레슨·기존 계획 정의 보존. streak 보호 여부는 미확정.
- **녹음:** dock 중앙 버튼에만 기본 녹음 CTA. 목표 카드 안에 중복 `연습 시작하기` 버튼을 넣지 않는다.

## 3. 사용 방법 (기존 v6에 자동 연결되지 않음)

```html
<link rel="stylesheet" href="/design-system/tokens.css">
<link rel="stylesheet" href="/design-system/components.css">
<main id="home" class="vz-scope" data-vz-theme="student"></main>
<script type="module">
  import { createGoalCard } from "/design-system/components.js";
  document.querySelector("#home").append(createGoalCard({
    goals:[{id:"x",title:"가사 암기",kind:"check",completed:false}],
    practicedMinutes:0,
    targetMinutes:null,
    onOpen:()=>{/* 목표 설정 화면 연결 */},
    onAction:goal=>{/* 완료 검증/수행량 입력 후 데이터 저장 */},
  }));
</script>
```

- **독립 프리뷰:** `/design-system/preview.html` — 서비스와 분리된 예시 데이터. `?firstEntry=1`을 붙이면 첫 진입 시트 자동 표시.
- **프리뷰에서 할 수 있는 것:** 테마 전환, 체크형 목표 토글, 시간·횟수 수행량 입력 데모, 휴식/보류 상태, 추천 계획 시트, 위젯·하단 독 확인.
- **프리뷰에서 하지 않는 것:** Supabase 데이터 쓰기, 실제 녹음, 수강/숙제 제출, 알림 및 AI 추천. 데모 버튼은 실제 실행 대신 명시적 안내만 표시.

## 4. 명세-컴포넌트 대응과 Figma 정합성

Figma 라이브러리에서 사용할 이름과 CSS 연결 규칙:

| Figma 변수 명 | 코드 CSS 변수 |
|---|---|
| `color/canvas` | `var(--vz-color-canvas)` |
| `color/ink` | `var(--vz-color-ink)` |
| `color/accent` | `var(--vz-color-accent)` |
| `color/glass/surface` | `var(--vz-color-glass)` |
| `color/glass/border` | `var(--vz-color-glass-border)` |
| `spacing/4`, `spacing/5`, `spacing/6` | `var(--vz-space-4)`, `-5`, `-6` |
| `radius/card`, `radius/hero`, `radius/dock` | `var(--vz-radius-card)`, `--vz-radius-hero`, `--vz-radius-dock` |

- Figma 모드: `Student / Teacher` (코드 `data-vz-theme`과 대응). 색상값은 CSS가 기준이며 Figma에 새 값 임의 작성 금지.
- 컴포넌트 variant 후보: `Card/Kind=Default|Hero|Song|Quick`, `Goal/State=Unplanned|Planned|Completed|Rest|Deferred`, `Button/Tone=Primary|Secondary|Quiet`, `WeekDay/State=Empty|Partial|Met|Rest|Future`.
- Figma 파일·변수/Component Set·Code Connect는 **별도 생성 필요**. 연결이 확인되기 전에는 'Figma에 반영됨'이라고 보고하지 않는다.

## 5. QA 및 배포 게이트

```bash
npm install
npx playwright test tests/design-system.spec.cjs
```

- **DS-00 완료:** 현행 CSS 및 사용자 iOS 위젯 레퍼런스 기준 도출.
- **DS-01/02 완료(코드 초안):** 토큰·기초 컴포넌트·인터랙티브 격리 프리뷰.
- **DS-03 검증 필요:** 320/390/430px, VoiceOver, 실제 iPhone Safari, 키보드/포커스, iOS PWA 내부 스크롤, WCAG 대비 수동 점검.
- **DS-04 검증 필요:** Figma 변수·스타일·variant를 같은 값으로 구축하고 스크린샷 대조.
- **Phase 19 적용 대기:** 기존 `app/app.css`를 한 번에 덮어쓰지 말고 하나의 학생 홈 컴포넌트부터 `vz-`로 바꿔 점진적 이관. 기존 라우터/녹음/데이터 핸들러는 유지.
- **실서비스 배포 금지:** 본 단계는 새로운 독립 라이브러리/프리뷰만 추가. 실제 화면 전면 교체는 승인+사용성 검증 뒤 별도 PR.

## 6. 완료 기준 / 알려진 한계

- [x] 공통 토큰(CSS) / 학생·선생님 테마 / 코어 컴포넌트 코드
- [x] 실제 브라우저용 독립 데모 화면 / 기본 상호작용 / 자동화 테스트 명세
- [ ] Playwright + WebKit 로컬/CI 실실행 결과
- [ ] iPhone·iPad 실기기 글래스/스크롤/44pt 검증
- [ ] Figma 변수 및 Variant Library 구축·Code Connect
- [ ] 실제 사용자 홈 데이터와 연결 및 Phase 19 통합

**디자인 방향:** Soft Lavender Liquid Glass / native iOS widget-inspired proportions. iOS 실제 시스템 UI를 그대로 복제한 픽셀 완성본이라고 주장하지 않는다.
