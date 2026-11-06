# Phase 10-7 통합 테스트 (v0.6): 핵심 흐름 12개

## 실행 환경
CI(GitHub Actions `ui`)는 PR마다 아래 3가지 환경에서 전체 Playwright 스위트를 돌려요.
- iPhone 크기 Chromium (390×844, 터치)
- iPhone 크기 WebKit (Safari 엔진)
- 데스크톱 Chromium

각 흐름은 실제 앱 화면을 탭하고 입력하는 방식으로 확인해요.
- 클라우드는 가짜 Supabase/R2로 대신해요. 운영 데이터는 쓰지 않아요.
- 녹음은 합성 음성 파일을 써요.

## 흐름 12개
| # | 흐름 | 확인하는 테스트 (tests/) |
|---|---|---|
| 1 | 앱 시작·하단 탭 5개 이동, 가로 넘침 없음 | `v6` Bottom navigation reaches the five main screens… |
| 2 | 로그인 시 기기·클라우드 기록 병합, 다른 기기 저장분 보존 | `v6` Login merges device and cloud records… / Saving app records never drops a save… |
| 3 | 원터치 녹음 → 미리듣기 → 곡과 함께 저장, 실패 시 원본 유지 | `v6` One-touch recording… / Recording from a lesson links the file… |
| 4 | 레슨 일정 추가·수정·완료(곡별 피드백)·취소 | `v6` Lesson schedule: add, edit, complete… / A past scheduled lesson can be recorded… |
| 5 | 숙제 추가 → 홈에서 완료 → 연습 기록 | `v6` Homework: add with song… / Homework has a period… |
| 6 | 파일 가져오기(여러 파일·곡 지정·날짜 수정·실패 파일만 재시도) | `v6` Import: multiple files… / Import hub… / Bulk upload… |
| 7 | 보관함: 필터·검색·재생·정보 수정·**선택 모드 일괄 곡/종류 지정** | `v6` Library filters, edit and play… / **Library select mode…** / Library actually plays… |
| 8 | 곡: 추가·검색·상세 탭·가사·**악보 PDF**·삭제해도 기록 유지 | `v6` Songs: add, search, detail tabs… / `r2` 악보: a PDF is uploaded… |
| 9 | 보컬 분석: MR 위 녹음 → 음높이 곡선·측정값, 곡별 변화·비교 | `v6` 보컬 분석… / 곡별 보컬 측정 변화… / **A measurement ⓘ opens…** |
| 10 | 서버 자동 분석 진행 카드·AI 곡 지정 표시, 실시간 갱신 | `v6` 서버 자동 분석: progress card… (+ 워커는 `analysis-worker.test.mjs` 12개) |
| 11 | 성장·캘린더 집계, 맞춤 연습 추천 → 연습 시작 | `v6` Growth… / Calendar shows lessons… / `calendar-summary` / 맞춤 연습 추천… |
| 12 | 모바일 레이어·iPhone: **곡 검색 시트**, **시트 스크롤 잠금**, **44pt 터치**, **오프라인 안내·백그라운드 즉시 저장**, 곡 탭 고정 | `v6` **Song choices open as a searchable sheet…** / **Every control… 44pt tap** / **Offline notice…** / Sheets fit the iPhone width… |

굵게 표시한 항목은 Phase 10에서 새로 추가한 테스트예요.

## 직접 확인이 필요한 것 (자동화 불가)
실제 iPhone 홈 화면 PWA에서 확인해야 하는 항목이에요.
- 키보드가 올라올 때 시트 입력칸 위치
- 노치·홈 인디케이터 여백
- 백그라운드 전환 직후 클라우드 저장

자동 테스트는 WebKit 엔진으로 같은 동작을 확인하지만, 실제 기기의 키보드와 앱 일시정지는 재현하지 못해요.
