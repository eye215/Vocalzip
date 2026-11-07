# Phase 03→05-A/B: 필드 초안·편집 이어받기 계약

2026-11-07. 설계 상태: **구현 전 계약**. DB 마이그레이션·운영 적용·기능 완료가 아니다.
적용 기준: 제품 정책 D20~D24, 2개의 활성 로그인 세션, PWA 우선.
선행: SYNC-05-00(최초 생성/수정 CAS 보호). 기존 JSON·미디어·ID는 그대로 유지한다.

## 1. 범위와 책임

인증 세션은 동시에 2개가 가능하다. **편집권은 로그인 수 제한과 별개로 문서의 개별 필드에 부여**한다.
첫 적용 대상은 학생 본인의 lessons[].memo / prepMemo / feedback이다. 선생님이 작성한 인증된 피드백 객체는 이번 범위가 아니다.
서버 RLS 소유자·유효 Auth 세션 확인은 기존 vzip_session_read_allowed / vzip_assert_session 계약을 재사용한다.
클라이언트가 user_id/session_id를 보내 소유자나 편집 세션을 지정하지 않는다. auth.uid()와 검증된 JWT session_id에서 유도한다.

기존 localStorage/IDB는 계정별 저장소 안에서만 사용한다.
vocal_data.payload는 확정 본문과 기존 ID/관계의 기준으로 유지한다. 별도 초안은 **아직 제출하지 않은 입력**이며 연습시간/정산/레슨 완료를 자동 변경하지 않는다.
사용자에게 저장됨으로 보이는 범위: 로컬 임시저장 / 서버 초안 저장 / 본문 반영을 구분한다.

## 2. 식별·버전 계약

| 항목 | 의미 |
|---|---|
| owner_id | auth.uid(), 소유권 불변 |
| entity_kind / entity_id / field_key | 초기 allowlist lesson + memo/prepMemo/feedback. 기존 entity_id는 text(과거 비UUID 포함) |
| draft_id | 서버 UUID. owner/kind/id/field UNIQUE; 곡/레슨을 중복 생성하지 않음 |
| revision | 서버에서만 1씩 증가하는 bigint. JSON 응답은 10진 문자열로 보내 JS 정수 범위 문제 방지 |
| text | UTF-8 텍스트, 초기 요청당 최대 64KiB(기술 상한, 제품 필요시 조정). HTML 실행 없음 |
| source_session | 서버가 추출한 현재 Auth 세션. 회수된 세션의 쓰기 거부 |
| editor_instance | 탭 시작 시 생성한 UUID. **같은 Auth 세션의 두 탭도 별개 편집기** |
| lease_epoch | 서버 단조 bigint. 만료 후 같은 편집기가 다시 얻어도 증가; 이전 지연 요청 차단 |
| lease_expires_at | 서버 clock_timestamp 기준. 초안/내용이 아니라 편집권만 만료 |
| saved_at / committed_revision | 서버 초안 저장 시각 / 본문에 반영한 초안 revision |
| operation_id | 계정 내 UUID 멱등 키. 같은 키·같은 요청만 재반영 없이 재응답 |
| content/base digest | 같은 operation_id를 다른 내용/필드/epoch에 재사용하면 거부 |

기기 Date.now와 updatedAt은 표시/구형 호환용이다. 서버 revision과 epoch를 대체하지 않는다.
기존 앱의 tombstone 배열 5,000개 상한은 장기 삭제 안전성을 보장하지 못한다. 장기 보관 삭제 원장/클라이언트 워터마크 없이 표식을 더 줄이지 않는다.

## 3. 서버 연산 계약

API 이름은 제안이며 기존 billing/AI RPC를 변경하지 않는다. 모든 변경은 한 트랜잭션에서 실행한다.

| 연산 | 입력 | 원자적 처리 및 응답 |
|---|---|---|
| load | entity/field | 소유·세션/원본 존재 확인. 최신 서버 초안과 revision/lease 상태. 없으면 확정 본문+base token 반환 |
| acquire | base revision, editor_instance, expected epoch | 원본/필드 행 잠금. 편집자 없거나 만료됐고 base가 최신인 경우 새 epoch 부여. 다른 활성 편집자면 locked |
| save | text, base revision, epoch, editor_instance, operation_id | 먼저 인증 확인→원본/필드 잠금→멱등 요청 검증→유효 lease/epoch/revision 재확인. 일치할 때만 revision+1. stale이면 양쪽 사본 보존 후 conflict |
| renew | epoch, editor_instance | 같은 활성 편집자만 서버 TTL 연장. 만료/회수/소유자 변경 후 복구 불가; 재획득 필요 |
| request_handoff | current revision/epoch, target editor_instance | 기존 기기에 pending 저장/인계 알림. 요청만으로 편집권 회수하지 않음 |
| accept_handoff | expected revision/epoch, target | 기존 기기가 로컬 pending을 서버에 확인한 뒤 원자적으로 epoch 증가·편집자 교체. 조건 변하면 다시 로드 |
| recover_handoff | expected revision/epoch + explicit confirmation | 이전 기기 미연결/미동기화 안내, 서버 저장본 기준 인계를 명시 확인한 경우만 처리. 이전 로컬 초안은 사본으로 유지 |
| commit | revision/epoch, operation_id, payload revision | 확정 본문 해당 경로만 갱신·전체 payload 버전 CAS·초안 committed_revision 갱신·멱등 응답 저장을 동일 트랜잭션. 레슨 상태/정산은 별도 |
| release | epoch, editor_instance | 같은 현재 편집자의 lease만 해제. 저장 안 된 텍스트 삭제 안 함 |
| delete | 원본 삭제 작업 ID | 원본 확정 삭제와 초안/충돌 텍스트/lease 정리를 조정. 미선택 녹음·정산은 유지. 필요한 삭제 표식/최소 감사에는 본문 안 남김 |

내부 함수는 public/anon/authenticated 직접 실행 권한을 제거한다.
본문/초안 테이블은 앱의 직접 INSERT/UPDATE/DELETE를 허용하지 않고 검증 RPC를 통한다.
읽기는 본인+실제 활성 세션으로 한정한다. UI 비활성화만으로 막지 않는다.
두 계정이 같은 entity_id를 써도 접근/멱등 키/lease/후보 사본은 섞이지 않는다.

## 4. 잠금·멱등·실패 보존

- 잠금 순서는 계정 세션 상태 → 원본 문서 → 필드 → 요청 원장으로 고정해 세션 회수/본문 저장과의 교착을 방지한다. 실제 기존 세션 함수의 잠금 순서와 테스트 DB에서 대조한다.
- 같은 필드 최초 생성도 UNIQUE + ON CONFLICT DO NOTHING 후 잠금/재조회한다. 존재 여부 검사 후 무조건 INSERT/전체 upsert하지 않는다.
- 동일 operation_id 응답을 재사용하기 전에도 **현재 세션의 유효성**을 재확인한다. 회수된 JWT가 성공 응답 재생으로 본문/초안을 조회하면 안 된다.
- 멱등 키는 원장에 최소 원 요청의 digest와 결과 revision을 저장한다. **다른 세션이 같은 키를 쓰면 거부**하며 원장 재응답 범위는 작성 계정/세션에 한정한다.
- 동일 field/revision에서 경합한 저장은 하나만 성공한다. loser의 텍스트는 계정별 로컬에 남기고, 유효 계정 세션인 경우 별도 충돌 사본으로 서버에 보존한다. 최신 본문을 자동 선택하지 않는다.
- 권한 회수·삭제된 원본·본문 크기 초과는 서버 충돌 저장도 거부한다. 이 경우 로컬 사본과 이유를 표시한다.
- 연결 종료·응답 유실은 원 operation_id로 재시도한다. 서버 ack 없는 텍스트의 로컬 사본을 지우지 않는다.
- 기본 설계 TTL: 편집 lease 90초, 표시 중 갱신 30초. iOS 절전 중 갱신은 보장하지 않는다. 만료 후 새 epoch와 revision 확인이 필요하며 입력 문구는 보존한다.
- 모든 텍스트 변경마다 영구 이력을 무한히 쌓지 않는다. conflict 사본은 사용자의 선택/내보내기 후 정리하고, 원본 삭제 시 즉시 삭제 정책을 따른다. 결제 감사에 개인 노트를 저장하지 않는다.

## 5. 전체 payload와의 정합성 — 활성화 전 필수

별도 초안 테이블만 추가하면 구형 snapshot 쓰기가 본문을 되돌릴 수 있다.
아래 브리지가 완료되기 전에는 필드 초안 UI/새 RPC의 운영 활성화를 하지 않는다.

1. 서버가 vocal_data의 revision/수정 token을 생성하고 CAS/operation_id로 본문 변경을 수락한다. 클라이언트 입력 토큰으로 서버 버전을 되돌리지 못함.
2. 구형 snapshot 저장은 활성 필드의 값을 덮어쓰지 못하도록 보호한다. 일반 merge가 서버 초안을 확정 본문으로 간주하지 않게 함.
3. 새 commit은 클라우드 최신 payload에서 대상 경로만 바꾸며 다른 레슨/곡/연습/공연의 변경을 보존한다.
4. 다른 기기에서 원본 레슨을 삭제하면 진행 중 입력은 로컬 사본으로 보존하고 삭제된 레슨을 자동 재생성하지 않음.
5. 기존 payload/history/정산 트리거·RLS와 같은 트랜잭션에서 테스트하고 초기 버전/legacy ID를 보존함.
6. 준비(기능 off)→기존 데이터 스냅샷·synthetic canary→클라이언트 배포→검증→계정 제한 활성화→확대 순서.
7. 롤백은 UI/RPC 진입 차단·원본 유지로 한다. 생성된 초안을 DROP하거나 최신 본문을 과거 JSON으로 무조건 덮어쓰지 않음.

## 6. 모바일 화면 계약

- 입력 즉시 해당 계정/문서/필드 로컬 초안 보존. 로컬 저장 실패를 서버 완료 표시로 숨기지 않는다.
- 상태: 기기에만 저장됨 / 동기화 중 / 클라우드 초안 저장됨 / 본문 반영됨 / 다른 기기에서 편집 중 / 충돌.
- 다른 기기에서 load만 하면 읽기 상태. [이어서 작성하기]가 명시적인 편집권 인계.
- 충돌 시 서버 최신본과 이 기기 문구를 나란히 확인·복사·선택할 수 있게 한다. 원치 않는 자동 덮어쓰기 없음.
- 같은 세션의 다른 탭도 읽기/인계를 적용한다. editor_instance는 인증 수 제한에 포함하지 않는다.
- PWA 화면 전환·오프라인·세션 교체에서 pending을 먼저 보존. 로컬에만 있는 초안을 다른 기기에 있다고 표시하지 않는다.
- Realtime은 갱신 알림 용도이며 권한·순서·완료 근거가 아니다. resume 시 서버 revision/epoch 재조회.
- 포커스된 입력 필드를 자동 재렌더링으로 바꾸지 않는다. Claude UI 통합은 API/state 계약 이후 별도 PR.

## 7. 실행 단위와 테스트 게이트

| 작업 | 산출물 | 통과 조건 |
|---|---|---|
| DRAFT-03-A | SQL 제안·실제 disposable PostgreSQL 테스트 | 재실행 안전, ID 유지, 2세션·다른 계정·회수 JWT·직접 쓰기 차단 |
| DRAFT-03-B | payload revision/commit 브리지·구버전 보호 | 최초/기존 행·동시 문서/필드·본문 삭제·이력/정산 보존·반복 요청·원자적 롤백 |
| DRAFT-05-A | 계정별 로컬 초안/outbox 어댑터 | 응답 유실·오프라인·저장공간 부족·로그아웃·원본 유지 |
| DRAFT-05-B | 명시 인계·충돌 UI·readonly 전환 | 한 필드 두 기기/두 탭·동시 인계·만료·절전·권한 회수·양쪽 문구 보존 |
| DRAFT-22-A | iPhone Safari/PWA ↔ iPad 시험 | 네트워크 중단·기기 잠금·새로고침·재로그인·실제 이어쓰기 및 미전송 안내 |

각 행은 완료가 아니라 예정 작업이다. 테스트하지 않은 운영/실기기 항목은 완료로 표시하지 않는다.
SQL 구현은 운영 migration 디렉터리에 즉시 넣지 않고 검토 가능한 제안·임시DB 시험으로 먼저 제출한다.
파일럿 이후 레슨/숙제 텍스트로 확대하고, 필기 stroke는 text lease 모델에 억지로 넣지 않고 별도 버전 이벤트로 처리한다.

## 8. 선행 snapshot revision 구현 제안

이 PR에는 `supabase/proposals/20261113_snapshot_revision.sql`과 임시 PostgreSQL 시험을 함께 둔다. **운영 migration 경로가 아니며 앱에서는 아직 호출하지 않는다.**
서버가 기존 vocal_data의 revision/updated_at을 발급하고, 기존 세션 회수와 같은 계정 잠금 순서에서 예상 revision을 검사한다.
성공한 operation_id의 hash/서버 버전 영수증만 별도 저장해 재전송을 중복 적용하지 않는다. 회수된 JWT는 영수증 재생도 거부한다.
기존 행은 revision=0을 초기값으로 읽으며 payload/ID를 일괄 다시 쓰지 않는다. RPC 최초 생성은 충돌 무시 후 conflict를 반환한다.
기존 직접 저장도 트리거가 서버 버전을 올리므로 이전 updated_at CAS가 최신 RPC 저장을 덮어쓰지 못한다.
그러나 무조건적인 구형 전체 upsert·동일 필드 stale 본문·장기 tombstone 문제는 이것만으로 해결되지 않는다. 위 §5 브리지와 필드 API/클라이언트 통합 이후에만 운영 활성화를 검토한다.
초안/lease 테이블·입력 UI·기기간 이어쓰기는 이 PR에서 구현하지 않았다. 계정 삭제 외 영수증 정리/보존 기간, 오류 재시도 관측·조회 상한은 운영 적용 전에 확정한다.
기존 history 트리거와의 운영 통합·백업/롤백·실제 Supabase canary도 추가 게이트다. 임시 DB 통과를 운영 적용으로 표시하지 않는다.
