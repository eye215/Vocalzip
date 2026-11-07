# Phase 01: 기존 개발 이력과 새 30단계 매핑 (2026-11-07)

> 기준: `main` = `2230346`. 이력은 `git log --all`(origin 브랜치 109개)과 `docs/*`로 복원했습니다. **PR이나 파일이 있다고 운영이나 iPhone에서 검증된 것은 아닙니다.**

## 1. 상태 표기

| 표기 | 뜻 |
|---|---|
| **구현** | 코드가 있습니다. |
| **부분** | 일부만 있습니다. |
| **없음** | 코드가 없습니다. |
| **(모의)** | 테스트가 Supabase, R2, 마이크를 대역으로 바꿔서만 확인했습니다. |
| **운영관찰** | 문서가 운영 환경을 본 기록이 있습니다. |

이 표의 모든 항목에 실제 iPhone E2E 증거는 **없습니다**.

## 2. 기존 이력 (시간순 요약)

| 날짜 | PR / 커밋 | 내용 | 주요 파일 |
|---|---|---|---|
| 11-02 | PR 전 `e1508b1`…`8a109dc` | MVP v0.2 → v5.1, IndexedDB 녹음, PWA 공유 받기 | `index.html`(구), `practice-*.js`, `share-receiver.js` |
| 11-03 | `320e6b6` | Codex 인수인계 문서("Phase 4–7") | `docs/VOCALzip_Codex_인수인계_2026-11-03.md` |
| 11-03 | #1, #2, #3–#7, #11, #12 | v5.7 IA, v5.8 디자인, iOS 대용량 TUS, 녹음별 곡·평점, 녹음 캘린더 | `ui.js`, `ia-v3.js`, `record-calendar.js` |
| 11-04 | #16, #19 | 24MiB 분할 저장(최대 1GiB), **영상 → 음성 추출**, 날짜 태그 | `chunk-media*.js`, `media-import.js`, `audio-extract-worker.js` |
| 11-04 | **#20** `12074ea` | **v6 전면 개편**(`VZ.version='6.0'`), `legacy.html` 유지 | `app/*` |
| 11-04 | **#21** `d16e4fc` | **레슨비 정산(Project B)** | `billing/*` |
| 11-04 | #22–#39 | CSV 다중 가져오기, 자동 미디어 백업(#30), **ID 병합 동기화와 삭제 표식(#31)**, 가져오기 허브(#37), **R2 저장(#38)** | `cloud-sync.js`, `data-merge.js`, `r2-*` |
| 11-05 | #40–#56 | R2 연결(#41), 월 요약(#42), 이어 올리기(#45), 노션·시간제 정산(#47), **자동 차감(#50)**, 다크 모드 추가(#52)와 제거(#53), 3단 훈련 분류(#56) | `r2-config.js`, `app/billing-lessons.js` |
| 11-05 | #57–#68 | 숙제 기간(#57), 파일명 날짜(#58/#59), **정산 → 캘린더(#60)**, 업로드 진단(#63), 250개 묶음(#67) | `app/upload-check.js`, `media-date.js` |
| 11-06 | #69–#76 | 정산 자동 동기화(#69), **`vocal_history`(#71)**, **`vocal_data`·`vocal_media` 낙관적 동시성(#75)** | `cloud-sync.js:44-72` |
| 11-06 | #73, #77–#84 | **STT 곡 추천**, 기기 내 피치 PoC(#77), R2 구간 클립(#78), 가사(#80), 기기 간 STT 동기화(#81) | `app/song-suggestions.js`, `supabase/functions/vzip-song-stt` |
| 11-06 | #85–#96 | 파일 삭제(#85), "Phase 7" 곡 성장 그래프(#86), 자동 분석(#87), **STT 상한 제거(#88)**, **서버 분석 워커(#89)**, "Phase 8A" 악보 PDF(#96) | `worker/analysis-worker.mjs`, `app/scores.js` |
| 11-06/07 | #97, #98, #100–#105, #107, #109 | 8B 연습 팁, **8C 레퍼토리·공연**, Phase 10-1…10-7 UI, 워커 깨우기, 미디어 따라가기, 공연 연결, 곡 재확인 | `app/practice-tips.js`, `app/repertoire*.js`, `app/performance-assets.js` |
| 11-07 | `d528f44`, `3b69192`, `2230346` | 새 30단계 로드맵, Phase 01 지시서, `CLAUDE.md` | docs |

**병합되지 않은 PR**
- 병합 커밋이 없는 PR: #8, #9, #10, #13, #14, #15, #17, #18, #43, #72, #106, #108.
- #36은 #74로 옮겨 들어갔습니다.
- #43("시간 기준 정산")이 다른 PR에 흡수됐는지는 미검증입니다.

## 3. 옛 단계 번호가 서로 맞지 않습니다

같은 번호가 문서마다 다른 범위를 가리킵니다.

| 출처 | 번호 체계 |
|---|---|
| 인수인계(11-03, `:31-41`) | Phase 4 기록 연결, 5 성장 분석, 6 레슨 관리, 7 사용성. Phase 1–3은 "공식 명칭 미확인" |
| 마스터 로드맵(11-06) | Phase 4 날짜 보존, 5 곡별 성장, 6 보컬 정량 분석, 7 성장 그래프, 9 정산, 10 UI/UX, 19는 8C로 흡수 |

- 마스터 로드맵은 작업이 끝난 뒤 번호를 거꾸로 붙였습니다.
- 커밋과 PR이 단계 번호를 쓰기 시작한 것은 11-06부터입니다("Phase 7" `4ab6ad5`, 8A/8B/8C, "Phase 10-1…10-7").
- 정산은 단계 번호 없이 "Project B"로 불립니다.
- 버전 표기도 흩어져 있습니다: v5.6, v5.7, v5.8, v6(`VZ.version`), "v0.6"(`docs/phase10_*.md:1`).
- 범위가 충돌합니다: 마스터 로드맵(`:13`)은 "오디션 기능은 개발하지 않음"이라고 했지만, 새 Phase 14는 오디션을 포함합니다.

→ **이 문서부터는 새 ID(01–30)만 씁니다.** 옛 번호는 아래 "기여한 옛 작업" 칸에서만 참고합니다.

## 4. 매핑표 (새 Phase → 옛 작업 → 상태 → 빈틈)

| ID | 영역 | 기여한 옛 작업 | 상태 | 근거 | 빈틈 |
|---|---|---|---|---|---|
| 01 | 현황 조사 | 인수인계, 개발현황, 운영검증, 병렬개발 점검, phase10 구조점검 | 이번 문서로 진행 중 | `docs/audit/*` | 운영 DB, Worker, 실기기 접근 필요 |
| 02 | 아키텍처 | v6 개편 #20, 8C 소유권 규약 | 부분 | `docs/UIUX_v6_개편_2026-11-04.md:14-27`, `docs/Phase8C_…:157-165` | 전역 스크립트 정적 앱, iOS 전략 없음, `legacy.html` 계속 배포 |
| 03 | DB·마이그레이션 설계 | 정산, 이력, 곡 텍스트, 분석 작업 마이그레이션 | 부분 | `supabase/migrations/*`, `billing/migrations/*` | **`vocal_data`·`vocal_media`·Storage 정책이 저장소에 없음**, JSON 덩어리 payload, FK 없음, 스키마 버전 없음 |
| 04 | 인증 | `cloud-sync.js` 이메일·비밀번호 | 부분(모의) | `cloud-sync.js:506-509` | Apple/Kakao 없음, 계정 전환 시 데이터 격리 없음(P0-1), 유출 비밀번호 보호 꺼짐(`docs/병렬개발_점검_2026-11-05.md:191`) |
| 05 | 동기화·복구 | #30, #31, #45, #62, #71, #75 | 구현(모의) | `cloud-sync.js:48-79`, `data-merge.js`, `20261106_keep_history.sql` | 레코드 단위 마지막 쓰기 승리, 기기 시계 의존, 계정 격리 없음, 실계정 2기기 미검증, 앱 내 복원 UI 없음 |
| 06 | 미디어 인프라 | #16, #38, #41, #45, #63, #65, #67, #76, #78 | 구현, 운영관찰 | `r2-config.js:3`, `docs/stt-media-format-audit.md:6-11` | 사용자별 용량 상한 없음, 서버 고아 정리 없음, 배포 Worker와 시크릿 미검증, 새로고침 후 이어 올리기는 일부만 |
| 07 | 곡·레퍼토리 | #80, #81(가사), #96(8A PDF), #98(8C), #109 | 구현(모의) | `app/scores.js`, `app/repertoire*.js` | 원곡(참고) 오디오 없음, PDF 악보는 R2와 로그인 필수, 곡 이력 화면은 부분 |
| 08 | 녹음·보관함 | #19, #29, #58/#59/#91, #82, #85, #105 | 구현(모의), **음성만** | `app/media.js`, `audio-extract-worker.js` | 25MB 초과 녹음은 기기에 저장 불가, 녹음 중 새로고침이나 종료 시 유실, 외부 공유 링크 없음 |
| 09 | 연습 | practice-modes, #56, #57, 8B(#97) | 부분 | `app/views-main.js:91-228`, `app/practice-tips.js` | 목표·체크리스트 엔터티 없음(`codex/homework-checklist`, `codex/recommended-practice-checklist` 미병합) |
| 10 | 레슨 기록 | v6 레슨, 상태, 선생님 텍스트, #107 | 구현(모의) | `app/views-lessons.js:103-147` | 정산에서 들어온 `bill-*` 가짜 레슨(00:00)이 섞임 |
| 11 | 숙제 | assignments, `lessonIds`, #57 | 부분 | `app/views-lessons.js:72-76`, `app/views-main.js:95-148` | v6에 이월 UI 없음(legacy `#carryover-checks`만 있음, `legacy.html:62`) |
| 12 | A/B 비교 | v6 비교, #66 | 구현(모의) | `app/views-more.js:224-247`, `app/media.js:430-433` | 구간별 비교 리포트 없음. "AI 정리"는 저장소에 없는 Edge Function |
| 13 | 성장 대시보드 | 성장 화면, #42, #44, #86, #101 | 부분 | `app/views-more.js:268-373`, `app/song-vocal-growth.js` | 목표 없음. 연결 안 된 녹음을 연습 시간에 넣음(불변 조건 3과 충돌 가능) |
| 14 | 공연·오디션 | 8C(#98), #107 | 구현(모의), 로그인과 R2 필요 | `app/repertoire-model.js:22-35`, `app/performance-assets.js` | 오디션은 옛 로드맵에서 제외됨. Worker MIME 허용 목록 배포 미검증(`docs/Phase8C_…:181`) |
| 15 | AI 받아쓰기·곡 매칭 | #73, #78–#84, #88, #89, #109 | 구현, 운영관찰(Edge Function 배포) | `supabase/functions/vzip-song-stt`, `worker/analysis-worker.mjs` | **서버 경로 비용 상한 없음**(#88에서 제거), 자동 지정 기준 0.40 미검증, 확인 대기 약 611개 |
| 16 | AI 보컬 분석 | #77, #87, #89 | 구현(휴리스틱) | `app/vocal-analysis.js`, `tests/vocal-analysis.test.cjs` | 실제 목소리 정확도와 불확실성 검증 없음, README와 성장 화면 문구가 코드와 반대 |
| 17 | AI 연습 코치 | 8B 규칙 기반(#97), `vocal-ai` 메모 요약 | 부분 | `app/practice-tips.js`, `app/views-more.js:255` | 근거 기반 추천과 결과 비교 없음, `vocal-ai` 소스 없음 |
| 18 | 가져오기·소유자 이전 | #37, #63, #64, #67 | 부분, **위험** | `app/import-hub.js:9-17` | 소유자 개인 날짜 범위가 **모든 사용자 UI에 하드코딩**, 허용 목록 기반 이전 도구 없음 |
| 19 | 학생 IA/UX | #1, #20, #44, #61, #100–#103 | 구현(모의) | `index.html:30-36`, `docs/phase10_*` | 실기기 키보드, safe-area, PWA 점검 항목 미실행(`docs/phase10_통합테스트.md:31-37`) |
| 20 | 구독·상품 | — | **없음** | — | IAP, 용량, AI 사용량 상한, 만료 처리 모두 없음 |
| 21 | 운영·보안 | 정산 RLS와 RPC, 이력 RLS, Worker 소유권, STT 허용 목록 | 부분 | migrations, `r2-worker/src/index.js` | 모니터링 없음, 앱 테이블 RLS 버전 관리 안 됨, Storage 정책 미확인, 계정 삭제·내보내기 흐름 없음 |
| 22 | iOS 통합 | PWA manifest, share-receiver | 부분 | `manifest.webmanifest` | 네이티브 앱 없음, SVG 아이콘만 있음, CDN 의존, 서비스 워커 의존, share_target은 iOS 미지원 |
| 23 | 1.0 출시 관문 | — | 없음 | — | — |
| 24–27 | 선생님 역할·수업·예약·협업 | — | 없음 | `teacher`는 자유 텍스트 | — |
| 28 | 수강권·정산(선생님) | `billing/` (#21…#74) | **선생님용으로는 없음** | `billing/core.js:50` (계정당 문서 1개) | 현재 `billing/`은 개인 장부입니다. 확장하지 말고 새로 설계해야 합니다. |
| 29–30 | 선생님 AI, 2.0 관문 | — | 없음 | — | — |

## 5. 계획했다가 버리거나 바뀐 것

| 항목 | 경과 |
|---|---|
| 영상 녹화·압축 | #14 문서와 `codex/video-only-compression`(미병합)에서 계획했습니다. 음성 녹음·추출로 바뀌었습니다(`docs/음원추출_날짜자동분류_2026-11-04.md:3`). 인수인계의 P0 "영상 녹화"는 빠졌습니다. |
| 다크 모드 | #52에서 추가하고 #53에서 제거했습니다. |
| 정산 "수동 전송만" | 기본 켜짐 자동 동기화(#69)로 바뀌었습니다. |
| 정산 "링크만, 읽기만" | 자동 차감(#50), 레슨 상태(#51), 정산 → 캘린더(#60)로 바뀌었습니다. |
| STT 안전 상한 (하루 3회, 총 15회) | #83에서 올리고 #88에서 없앴습니다. |
| 옛 Phase 19 레퍼토리 | 8C로 합쳐졌습니다. |
| 오디션 | 옛 로드맵에서 제외했습니다. 새 Phase 14는 다시 포함합니다(제품 결정 필요). |
| 미병합 브랜치 | `codex/homework-checklist`, `codex/verify-production-media`, `codex/recommended-practice-checklist`(11-07). 그리고 `claude/ux-overhaul`(하단 탭에 보관함이 있어 새 IA와 충돌) |
| `git revert` 커밋 | 없습니다. |

## 6. 중복 개발 방지: 이미 있는 것

다음 작업에서 **새로 만들지 말고 재사용하거나 고쳐야 하는 것**입니다.

| 기능 | 이미 있는 곳 |
|---|---|
| ID 병합, 삭제 표식, `updated_at` 조건부 저장 | `data-merge.js`, `cloud-sync.js:48-79` |
| 서버 JSON 버전 이력 | `vocal_history` |
| R2 업로드, 서명 재생, 소유자 접두사 검사, Range | `r2-worker/src/index.js`, `r2-storage.js` |
| 대용량 분할 저장과 서비스 워커 스트리밍 | `chunk-media*.js`, `share-worker.js` |
| 영상 → 무손실 음성 추출, 날짜 추출 | `audio-extract-worker.js`, `media-date.js` |
| 여러 파일 가져오기, 실패만 다시 시도, 중복 감지 | `app/import-hub.js`, `app/media.js:365-370` |
| 보컬 측정(DSP)과 서버 분석 큐 | `app/vocal-analysis.js`, `worker/analysis-worker.mjs` |
| 곡 텍스트(가사, 받아쓰기) 클라우드 동기화와 삭제 표식 | `vocal_song_texts` |
| 업로드 점검(읽기 전용) | `app/upload-check.js` |
| 정산 장부와 낙관적 RPC | `billing/` |
