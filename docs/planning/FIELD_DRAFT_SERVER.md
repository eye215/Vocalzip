# Phase 03/05 필드 초안 서버 구현 제안

기준: 2026-11-08. #125의 snapshot 세대/버전 기반에 의존한다.
**UI·앱 진입점 연결 없음, 운영 SQL 적용 없음.** 임시 PostgreSQL에서만 검증한다.

## 저장 책임
- 대상은 본인 레슨의 memo / prepMemo / feedback. 기존 lesson ID(text), vocal_data.payload, 녹음·정산 참조 유지.
- 원본 본문과 서버 초안, 충돌 사본은 분리한다. 초안 저장은 레슨 완료/차감/연습 시간을 바꾸지 않는다.
- 소유자와 Auth 세션은 JWT에서 유도한다. editor_instance UUID는 탭 구분자이며 인증 수단이 아니다.
- 응답의 revision/epoch/snapshot_revision은 정밀도 손실 없는 10진 문자열이다.
- draft_id는 서버 UUID로 세대를 구분한다. 삭제 후 같은 lesson ID를 다시 생성해도 이전 큐가 새 초안을 덮어쓰지 못한다.

## API
vzip_field_draft(operation, entity_id, field_key, editor_instance, draft_id,
expected_revision, expected_epoch, text, request_id, target_editor,
confirm_unsynced, expected_snapshot_revision, expected_generation)

| 연산 | 동작 |
|---|---|
| load | 원본/최신 초안·본문·버전 조회. 초안 생성 안 함 |
| acquire | 최신 원본/초안 토큰을 확인하고 90초 편집권 획득. 활성 타 편집기는 locked |
| save | 현재 세션·탭·epoch·revision 일치 시 초안만 저장. 같은 요청은 영수증 재응답 |
| renew/release | 동일 편집권만 갱신/해제. 만료 후 갱신 불가, 재획득 시 epoch 증가. 텍스트 유지 |
| request_handoff | 현재 편집권을 뺏지 않고 대상 세션/탭의 요청 기록 |
| accept_handoff | 기존 편집기가 저장/버전을 확인한 뒤 요청한 유효 대상에 원자적 epoch 인계 |
| recover_handoff | 최신 토큰과 미전송 사본 안내에 대한 명시 확인이 있어야 강제 인계 |
| commit | 클라우드 최신 본문의 해당 필드만 변경. 다른 필드 변경은 보존 |
 
요청 원장은 계정·검증된 세션·정규화된 전체 요청 hash에 결합한다. 영수증 재생 전에도 현재 세션/원본을 확인한다.
save가 stale이면 최신 초안을 유지하고 들어온 문구를 별도 충돌 사본에 보존한다. 보존 한도 초과면 preserved=false이며 클라이언트 로컬 사본을 지우면 안 된다.
기존 편집기의 새 save는 대기 중인 인계 요청을 무효화한다. 대상은 최신 버전으로 다시 요청해야 한다.

## 전체 snapshot 브리지
초안이 생긴 필드는 lease 만료/해제 후에도 일반 snapshot 쓰기로 변경할 수 없다. 다른 필드/레슨 변경은 허용한다.
commit 전용 RPC가 같은 트랜잭션의 비공개 marker를 넣고 정확히 해당 값만 갱신한다. 사용자 GUC나 current_user 값으로 우회하지 않는다.
marker·본문·history·영수증 중 실패하면 전부 롤백한다. 임시 marker는 커밋 시 남지 않는다.
보호된 레슨을 삭제하려면 실제 deleted.lessons 표식이 필요하다. 초안·충돌·초안 영수증은 정리하지만 녹음/다른 레슨은 삭제하지 않는다.
이력 테이블에 남는 과거 본문의 즉시 삭제 정책은 별도 DELETE 단계에서 검증해야 한다. 이 브리지만으로 운영 삭제 정책 완료를 선언하지 않는다.

## 기술 상한과 운영 게이트
초안 필드당 UTF-8 64KiB, 계정당 512개·텍스트 4MiB, 충돌 128개·4MiB, 요청 영수증 10,000개를 기술적 안전 상한으로 둔다.
한도에 도달해도 오래된 사본을 자동 삭제하지 않으며 기존 영수증 재생/조회는 유지한다. 상품 한도나 보관 기간 확정이 아니다.
운영 적용 전에 영수증 보존·정리, 충돌 사본 정리, 구형 클라이언트의 보호 필드 실패 안내와 opt-in/롤백, 본문 history 삭제 정책을 확정해야 한다.
초기 legacy 계정은 최초 acquire 시 서버 세대 메타데이터만 지연 생성할 수 있다. 기존 payload/ID는 그대로이며 전체 계정 backfill은 하지 않는다.
 
## 검증 상태
tests/field-drafts.test.mjs는 실제 PostgreSQL의 RLS·두 Auth 세션·두 탭·epoch/재전송·충돌 보존·원자적 본문 반영을 검증한다.
실행 결과는 이 PR/Actions에 기록하며 실행 전 통과로 표시하지 않는다.
실제 Supabase 운영 적용·iPhone/iPad·오프라인 UI·계정별 로컬 outbox 연결은 아직 별도다.

## 로컬 outbox 계약 통합

#143의 headless outbox·JWT 고정 전송을 이 PostgreSQL 함수와 함께 검증한다. tests/field-draft-outbox-integration.test.mjs는 메모리 로컬 저장소/HTTP 어댑터를 거쳐 실제 SQL/RLS/트랜잭션을 실행한다. PostgREST 게이트웨이의 JWT 서명 검증이나 브라우저 실기기 E2E를 대체하지 않는다.
문구 저장/응답 유실/전송 중 새 입력/응답 후 저장공간 실패/인계 뒤 과거 편집기/계정 전환/원본 삭제·재생성/서비스 중단을 검사한다.
변경 응답은 is_editor 상태를 명시한다. 이 값과 영수증은 해당 연산 결과이며, 이후 편집권 유지의 증명은 아니다. resume 때 load로 재확인하고 서버가 매 요청의 epoch/세션을 다시 검증한다.

## 계정별 기본 비활성·안전한 중지

vzip_field_draft_rollout은 기본 비활성이며 일반 사용자는 설정을 읽거나 바꿀 수 없다. 소유자 전용 vzip_set_field_draft_enabled는 세션/쓰기와 동일한 계정 잠금 순서로 명시 활성화/중지한다.
비활성 상태에서도 본인 초안 조회와 기존 성공 영수증 재생은 유지하고 새 초안/인계/본문 쓰기는 disabled로 거부한다. 서버/로컬 문구를 삭제하거나 구형 snapshot으로 되돌리지 않는다.
비활성화한 보호 필드는 계속 읽기 전용이다. 롤백은 필드 보호를 풀어 stale 클라이언트의 덮어쓰기를 허용하는 동작이 아니다. 클라이언트는 disabled 응답에서 미전송 원 요청을 보존하고 새 권한 확인/명시 선택 후 재개한다.
