# Phase 03·05 — 서버 저장 버전과 앱 연결

작성: 2026-11-10 · [PR #214](https://github.com/eye215/Vocalzip/pull/214)

## 범위와 운영 상태

기기 간 기록 덮어쓰기를 막기 위해 기존 snapshot revision SQL 제안을 앱에 연결했다. 미디어 업로드 속도 개선과는 별도 작업이다.

**기본 비활성:** `VZIP_SNAPSHOT_REVISION_ENABLED=false`. 운영 SQL 설치·계정 rollout·새 방식 활성화를 수행하지 않는다. 기존 timestamp CAS 동기화를 유지한다. 새 코드 반영과 운영 활성화를 구분한다.

기존 녹음·파일·정산 데이터의 이동·삭제·초기화와 UI 디자인 변경은 없다. 레슨 삭제는 기존 선택 삭제 흐름 안에서 미완료 요청의 선택 레슨 본문을 정리하도록 연결한다. 최신 main의 설정 화면·처리 로그 등 병렬 변경을 유지했다.

## 구현한 동작

- 서버 revision을 문자열로 처리해 bigint 정밀도를 지킨다. generation으로 서버 행 재생성을 구분한다.
- 로그인 계정과 등록 세션을 요청 전후 고정한다. 서버 본인 행만 조회하고 사용자 JWT로 요청한다. 토큰은 journal에 보관하지 않는다. 클라이언트 JWT 검사는 라우팅 보조이며 서버 서명 검증·RLS·등록 세션 검사가 권한의 기준이다.
- 쓰기 전에 기준 버전·요청 ID·payload를 계정별 로컬 journal 한 항목으로 보존한다. 기본 한도는 JSON UTF-16 기준 2MiB이며 저장 실패 시 서버 쓰기를 중단한다.
- 응답을 잃으면 같은 요청 ID와 내용으로 확인한다. SQL 영수증 계약으로 중복 적용을 막는다. 이전 미완료 요청 확인이 새 요청보다 우선한다.
- 서버의 확정 버전·generation을 다시 읽고 로컬 반영이 끝나야 pending을 비운다. 그동안 생긴 로컬 수정은 남겨 후속 전송한다.
- 최초 전환 시 기기/서버가 불일치하거나, 양쪽이 같은 기준에서 변경됐거나, 다른 로그인 세션의 pending이 있으면 자동 덮어쓰기·폐기를 멈춘다.
- 기존 새 프로토콜 상태가 있는 기기에서 flag를 꺼도 이전 직접 쓰기로 우회하지 않는다. 새 경로의 journal은 Web Locks로 직렬화한다.
- 레슨 영구 삭제 시 pending 안의 선택 레슨을 제거하고 관련 없는 연습/미디어는 유지한다. 이미 전송됐을 수 있는 ID의 payload를 바꾸지 않고 새 ID 및 deleted 보류 상태로 보존한다. 자동 재전송하지 않는다.
- 소유자별 archive 필터를 사용하는 환경에서는 서버에 보낼 본인 내용끼리 완료 여부를 비교한다. 전송 제외 항목 때문에 재동기화를 반복하지 않는다.

## 주요 파일

| 파일 | 변경 |
|---|---|
| `sync/snapshot-transport.js` | 버전·미완료 요청·영수증·계정/세션 고정·선택 삭제 정리 |
| `cloud-sync.js` | 실제 sync 연결, 기본 off의 기존 저장 경로 유지 |
| `account-config.js` | 기본 off 설정 |
| `app/lesson-deletion.js` | 기존 선택 삭제에 journal 정리 연결 |
| `index.html`, `legacy.html` | 로딩 순서·캐시 갱신, 최신 화면 변경 유지 |
| `supabase/proposals/20261113_snapshot_revision.sql` | 최초 생성 경쟁의 conflict 응답에도 generation 포함. 제안 소스만 수정 |
| `tests/snapshot-transport.test.cjs`, `tests/cloud-sync.test.cjs` | 컨트롤러 및 전체 실제 sync 스크립트 검사 |
| `tests/field-draft-outbox-integration.test.mjs` | 세션·snapshot·draft/outbox·영구 삭제 SQL 통합 검사 |
| `tests/snapshot-bridge.spec.cjs` | 실제 앱 Chromium/WebKit 검사 |
| `.github/workflows/snapshot-bridge-check.yml` | 운영 비밀 없이 격리 DB/가상 계정 검사 |

## 검사 결과

기능 소스 `dd5235e8c3665b3d55a0a8153fd7ea58cd302d2c`, Actions [42736449331](https://github.com/eye215/Vocalzip/actions/runs/42736449331)에서 확인했다. 이 문서는 해당 기능 소스 위 문서 변경이다.

| 검사 | 실제 결과 |
|---|---|
| JS 구문 + transport/root sync/merge/lesson deletion 단위 검사 | 62 통과, 실패 0 |
| 기존 영구 삭제 SQL | 10 통과 |
| snapshot·draft/outbox·앱 브리지 SQL 통합 | 95 통과 |
| 새 브리지 실제 앱 브라우저 | 9 통과 |
| 두 세션·계정 격리 브라우저 | 61 통과, 2 건너뜀 |
| 새 방식 off 상태의 기존 레슨 선택 삭제 브라우저 | 24 통과 |

DB는 임시 PostgreSQL 16을 사용했다. 브라우저는 테스트용 사용자·JWT·HTTP 응답을 사용하므로 실제 Supabase 로그인/PostgREST HTTP 인수 결과가 아니다. Chromium 모바일/데스크톱 및 WebKit 모바일 자동 검사는 실제 iPhone Safari/PWA 종료·오프라인 인수를 대신하지 않는다.

## 활성화 전 남은 작업과 순서

| 순서 | 후속 작업 | 완료 조건 |
|---|---|---|
| 1 | 충돌·이전 로그인·저장 후 추가 변경 복구 | 서버본/기기본을 명시적으로 확인·보존하고 새 기준에서 선택 변경만 전송. 묵시적 마지막 쓰기 우선 금지 |
| 2 | 서버 계정별 rollout 계약 | 클라이언트 flag로 권한을 대신하지 않음. 비대상 계정·이전 클라이언트 쓰기·되돌림 계획 검증 |
| 3 | 제한 설치·실제 PostgREST 인수 | revision 문자열 projection·인증/RLS·두 등록 세션·행 재생성·HTTP 재시도 검증. 운영 설치는 별도 작업 |
| 4 | 입력 초안 UI 연결 | field lease/outbox 계정 격리·저장·충돌 확인을 실제 입력에서 검증 |
| 5 | 삭제/보관 범위 | 레슨 외 삭제의 pending 정리, 기존 `vzip_before_cloud_*` 사본·다운로드/기기 복사본 정책 확정 |
| 6 | 용량/실기기 인수 | 실제 기록 크기의 journal 실패 복구, iPhone Safari/PWA·두 기기·네트워크 중단·앱 종료·세션 교체 |

이번 변경만으로 모든 로컬 복구 사본이 삭제됐다고 주장하지 않는다. 마지막 운영 읽기 전용 확인(2026-11-09)에서는 snapshot revision·draft/outbox 신규 계약이 미설치였다. 이번 작업은 운영 DB를 수정하지 않았다. 위 조건이 충족될 때까지 Phase 03·05 전체 완료 또는 운영 활성화로 표시하지 않는다.

## 병렬 작업 경계

Codex는 transport·복구/rollout 계약·격리 검사를 맡는다. 별도 UI 작업은 최신 main의 디자인을 유지한다. root 저장·계정·삭제 hook은 충돌 가능 파일이므로 병합 전 최신 main과 대조한다. 검사 결과와 후속 실제 운영·실기기 인수는 구분해 추가한다.
