# VOCAL.zip — Codex 개발 인수인계
작성일: 2026-11-03 | 저장소: eye215/Vocalzip | 브랜치: main | 현재 표시 버전: v5.6

> 주의: 코드에 구현되어 있다는 사실과 iPhone Safari에서 실제로 동작이 검증되었다는 것은 다릅니다. 기존 응답에서 검증 없이 완료라고 안내된 부분이 있으므로, 모든 핵심 흐름을 직접 검증해야 합니다.

## 1. 링크와 인프라
- 서비스: https://vocalzip.yullul.com/
- 최신 확인: https://vocalzip.yullul.com/?v=56
- 저장소: https://github.com/eye215/Vocalzip
- main: https://github.com/eye215/Vocalzip/tree/main
- GitHub Pages: https://eye215.github.io/Vocalzip/
- Supabase 프로젝트: chxnbtiyuyhiywzeshis
- Supabase 대시보드: https://supabase.com/dashboard/project/chxnbtiyuyhiywzeshis
- Edge Functions: https://supabase.com/dashboard/project/chxnbtiyuyhiywzeshis/functions
- AI Edge Function: vocal-ai (NVIDIA 연동; 실제 응답 검증 필요)
- 최근 커밋: 41a887e (연습 녹음 연결), 1bc3a3b (연습 가져오기 보관함 저장), 4cf329c (중복 녹음기 정리), 4e0fbc3 (v5.6).

## 2. 서비스 목표
뮤지컬/보컬 레슨, 숙제, 개인 연습, 곡, 음성 녹음/영상 녹화를 기록하고 시간이 지남에 따른 성장을 확인하는 모바일 우선 웹앱.

필수 요구사항:
1. 레슨: 날짜, 곡, 피드백, 메모, 숙제, 녹음·영상, 녹음별 메모.
2. 개인 연습: 보컬 트레이닝(호흡/발성/저음/패사지오 등)과 곡 연습을 구분, 항목별 시간, 만족도, 체크리스트, 메모.
3. **연습 추가/작성 폼 내부에 직접 음성 녹음·영상 녹화 버튼.** 별도 상단 카드/탭으로 빼지 말 것.
4. **연습 폼에서 가져온 음성/영상 파일도 보관함에 저장되어 조회·재생 가능**해야 함.
5. 직접 녹음·가져온 파일 모두 해당 연습 기록에 연결되고 기록 상세에서 재생 가능해야 함.
6. 보관함: 레슨/연습/가져온 파일 출처별, 음성/영상별 관리, 제목/곡/날짜 수정, 재생, 비교.
7. AI: 선택한 기록 비교와 개선점 추적. 현재 실제 오디오 음정/호흡/비브라토 분석 완성 아님.
8. 로그인/동기화, 기기 변경, 데이터 소실 방지, iPhone Safari 우선.

## 3. Phase 계획과 현황
| 단계 | 목표 | 현재 상태 | 남은 작업 |
|---|---|---|---|
| 기반 단계 (Phase 1~3 영역, 공식 명칭 미확인) | 앱 구조, 레슨/연습/곡/숙제, 로컬 저장, 보관함, 로그인 | 구현 흔적 있음 | 실제 CRUD, 로그인, 데이터 보존 검증 |
| Phase 4 — 기록 연결 | 레슨↔숙제↔연습↔녹음·영상 연결, 연습 모드 분리 | 부분 구현, 미검증 | 연습 작성→보관함→상세까지 완성, 삭제·중복 정책 |
| Phase 5 — 성장 분석 | 연습량·만족도·숙제 추세, 녹음 비교, AI | 비교 UI/리포트 일부 구현 | 통계 검증, 실제 오디오 AI 범위 설계 |
| Phase 6 — 레슨 관리 | 레슨 입력, 녹음, 피드백, 숙제 연계 | 일부 구현 | 저장/재열기/수정/삭제 및 연결 이력 검증 |
| Phase 7 — 사용성 개선 | 모바일 정보구조, 입력 UX, 시각 일관성 | v5.0 CSS 개편 반영 | iPhone QA, 접근성, 화면 겹침, 성능 |
| 운영 안정화 | 클라우드 미디어, 백업, 복원, 오류 대응 | 부분 구현 | 업로드·동기화·복구·권한·저장 공간 테스트 |

과거 대화에서 확인되는 번호는 Phase 4 기록 연결 → 5 성장 분석 → 6 레슨 관리 → 7 사용성 개선. 1~3 정식 명칭은 확인되지 않음.

## 4. 주요 파일
- `index.html`: 화면, 로컬 데이터 모델, 연습/레슨 저장, 스크립트 로드.
- `practice-modes.js`: 보컬 트레이닝 vs 곡 연습 모드.
- `practice-capture.js`: 연습 폼 내부 직접 녹음/녹화, MediaRecorder, IndexedDB, 저장 이벤트.
- `practice-duration.js`: 가져오기, 보관함 파일 선택, 시간 합산, mediaIds 연결.
- `recorder.js`: 기존 공유 녹음기, 녹음·영상·가져오기·편집.
- `lesson-recorder.js`: 공유 녹음기 레슨 탭 배치.
- `lesson-recording-notes.js`: 레슨 녹음과 메모 연결.
- `media-hub.js`: 보관함, 유형/출처 필터, 로컬+클라우드 목록.
- `comparison-reports.js`: 녹음 비교, 리포트, 텍스트 노트 AI.
- `cloud-sync.js`: Supabase 인증·데이터/미디어 동기화 관련.
- `lesson-wizard.js`: 레슨 입력 단계.
- `archive.js`: 기록 조회.
- `ui.js`, `ui-refresh.css`, `glass.css`, `ux.css`, `wizard.css`: UI.
- `ia-v3.js`, `library-growth-ux.js`, `share-receiver.js`, `inline-category.js`: IA/보관함/공유 수신/카테고리.
- `README.md`: 현재 실제 기능을 반영하도록 갱신 필요.

### 데이터
- 앱 로컬 데이터: localStorage 키 `vocal-zip_mvp_v1`.
- 로컬 미디어: IndexedDB `vocalzip_media_v1`, object store `recordings` (keyPath `id`).
- 연습 폼 저장: `index.html`의 `#practice-form` submit에서 `form.dataset.mediaIds`를 파싱해 저장.
- `practice-duration.js`: 가져온 파일 IndexedDB 저장 및 연습 mediaIds 반영.
- `practice-capture.js`: 녹음 종료 후 `vzip:media-saved` 이벤트 (`detail.attachToPractice=true`) 발행.
- `media-hub.js`: 로컬 IndexedDB와 Supabase 미디어 목록 병합.
- 앱 데이터 JSON 백업에 미디어 원본이 포함된다고 가정하지 말 것.

## 5. 현재 의심 결함 (우선 조사)
1. 연습 추가 폼에 녹음 UI가 실제로 보이는지. `practice-capture.js`가 `#practice-attachments` 앞에 삽입하나 `practice-modes.js` DOM 재배치와 CSS 영향 확인.
2. 가져온 파일의 보관함 표시/재생, .m4a/.mov 및 빈 MIME, Safari 권한·저장 실패·새로고침 확인.
3. 직접 녹음→IndexedDB→mediaIds→연습 저장→기록 상세 재생까지 연결 확인. 저장 중 제출 race condition 방지.
4. **저장 포맷 불일치 가능성:** `practice-capture.js`는 `bytes`(ArrayBuffer)를 저장하지만 보관함/재생 코드는 `blob`을 기대할 수 있음. 미디어 스키마를 통일해야 함.
5. 연습 파일 길이 합산: 가져온 파일이 보관함에 저장되지만 `attachments` 합산 경로 변경됨. 실제 시간 합계·중복 산정 검증.
6. 연습 전용 녹음과 가져온 파일은 로컬 IndexedDB 중심. 다른 기기에서 보려면 클라우드 업로드·동기화 필요.
7. `recorder.js`와 `practice-capture.js`가 둘 다 로드됨. 연습 중복 녹음 UI와 레슨 녹음 UI 회귀 확인.
8. `ui-refresh.css`의 전역 `section` 선택자가 내부 섹션에 잘못 적용될 가능성.
9. AI는 텍스트 메모 분석 수준. 실제 음성의 음정·호흡·비브라토 분석 구현으로 오인하지 말 것.
10. 이전 GitHub 수정 후 **iPhone 실기기 E2E 검증은 수행되지 않았음**.

## 6. 우선순위와 완료 기준

### P0 — 연습 작성/보관함 핵심 흐름
- 연습 탭 → 개인 연습 기록하기/연습 추가 **폼 내부**에서 음성 녹음, 영상 녹화 시작/종료/저장.
- 같은 폼에서 기존 음성/영상 파일 가져오기 → 보관함 등록 및 재생.
- 직접 녹음과 가져온 파일 모두 연습 `mediaIds` 연결.
- 연습 저장 후 기록 상세에서 재생·파일명·시간 확인.
- 보관함 전체 및 연습 출처 필터에서 조회·재생, 새로고침 후 유지.
- 중복 녹음 UI 제거, 레슨 기능 유지.
- iPhone Safari MIME/권한/IndexedDB/저장 공간 오류 대응.

**P0 검증 시나리오:** iPhone Safari 로그인 → 연습 추가 → 음성 10초 녹음 → 종료 → 연습 저장 → 연습 상세에서 재생 → 보관함 연습 필터에서 재생 → 재접속 후 재생. 영상 녹화, 기존 .m4a/.mov 가져오기도 동일하게 반복. 실기기 테스트 불가하면 '미검증'으로 보고.

### P1 — 데이터 무결성/클라우드
- 미디어 스키마 일원화(id, name, created, source, type, blob, songId, practiceId/lessonId, durationSeconds, cloud metadata).
- 로컬/Supabase 동기화, 업로드 실패 재시도, 로그인·로그아웃·기기 변경.
- 기록 삭제 시 미디어 보존, 중복 업로드, 고아 파일 정책.
- 백업·복원 시나리오 검증.

### P2 — 성장 기록 완성
- 보컬 트레이닝/곡 연습을 데이터와 통계에서 구분.
- 항목별·곡별·주별 연습 시간, 만족도 추세, 숙제 이행률.
- 레슨→숙제→개인 연습→다음 레슨 이력 연결.
- 녹음 A/B 비교, 비교 리포트 수정·삭제·재열기.

### P3 — AI 및 UX
- 텍스트 분석과 실제 오디오 분석 구분. 비용·개인정보·동의·신뢰도 검증 후 구현.
- 모바일 탐색, 작성 단계, 저장 완료 피드백, 에러/빈 상태, 접근성·성능.
- README, 배포, 테스트, 환경변수 문서화. 비밀키 프런트/저장소 커밋 금지.

## 7. Codex 실행 지시 (복사해서 사용)
`eye215/Vocalzip`의 `main`을 확인하고 VOCAL.zip v5.6의 연습 작성/미디어 흐름을 먼저 안정화하세요.

요구사항: (1) 녹음/녹화는 **연습 추가 폼 내부**에 배치, (2) 연습에서 가져온 파일과 직접 녹음/녹화 파일 모두 **보관함에 표시·재생**, (3) 두 종류 모두 연습 기록에 연결되어 기록 상세에서 재생, (4) 레슨 녹음 유지, (5) iPhone Safari 우선.

먼저 `practice-capture.js`, `practice-duration.js`, `media-hub.js`, `recorder.js`, `lesson-recorder.js`, `practice-modes.js`, `index.html`을 점검하세요. `bytes` vs `blob` 불일치, 저장 중 race condition, IndexedDB 파일 형식, 클라우드 미디어 미동기화를 우선 해결하세요.

수정 후 재현 가능한 테스트를 수행하고 **변경 파일, 커밋 SHA, 테스트 결과, 미완료 항목**을 보고하세요. 테스트하지 못한 기능을 완료로 표시하지 마세요. 개인정보·비밀키를 출력/커밋하지 마세요.

## 8. 인수인계 기준
- 마지막 확인 커밋: `4e0fbc33da8493a40bdec7dd43debde1b2e0a5ee` (v5.6).
- GitHub 코드 반영은 확인했으나 사이트 배포 및 최신 JS 로드 여부 미확인.
- 최우선 사용자 요구: **연습 추가 안에 녹음·녹화**, **연습에서 가져온 파일도 보관함에서 확인**.
