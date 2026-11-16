# Phase 05-A 로컬 초안/outbox 모듈

기준: 2026-11-08. sync/field-draft-outbox.js는 DOM 없는 독립 모듈이다.
초기 모듈은 화면에 연결하지 않은 상태였다. **2026-11-16 과업 9의 로컬 연결은 아래 절을 따른다. 서버 초안 RPC·제안 SQL은 활성화하지 않는다.**

## 책임
create는 계정 소유자·Auth session ID·탭 editor ID, 계정별 storage, 현재 owner/session 조회 함수, 검증된 send 전송 함수를 받는다.
기존 VzipAccountScope.storage는 생성 시 네임스페이스를 고정하므로 재사용할 수 있다. leaving/계정 전환 상태는 getOwner에서 빈 값으로 반환해야 한다.
저장 키는 owner/entity/field/editor를 모두 구분한다. 서로 다른 탭은 editor ID가 반드시 달라야 하며, 명시적 재개 외에 살아 있는 다른 탭의 ID를 복제하지 않는다.
새로고침 후에는 같은 editor ID로 기존 큐를 재개하거나 list의 사본을 명시적으로 복원한다. 로그아웃·세션 변경에서 자동 삭제하지 않는다.

## API와 상태
- start(scope, baseText): 현재 확정 문구로 시작. 기존 로컬 초안이 있으면 보존
- edit(scope,text): UTF-8 64KiB 상한 검사 후 동기 로컬 저장. 저장공간 실패면 성공으로 표시하지 않음
- attachLease(scope,result): load+acquire가 확인한 본인 편집권 연결. dirty 문구와 서버 기준이 다르면 conflict
- sync(scope): 전송 전 operation_id/문구/버전/epoch를 내구 저장. 같은 요청 재시도에 같은 ID 사용
- resolve(scope,result,choice): keep_local / use_server의 명시 선택. 버리는 쪽도 로컬 사본 보존
- markBlocked / read / list / exportRaw: 읽기 전용·충돌·복구 기반. 데이터 삭제 API 없음

상태 local / syncing / server_draft / conflict / blocked를 구분한다.
server_draft는 **서버 초안 저장**이지 vocal_data 본문 반영이나 레슨 저장 완료가 아니다.
전송 중 새로 입력한 문구는 이전 ack로 지워지지 않는다. 응답 저장만 실패한 경우에도 원 요청이 큐에 남아 영수증 재생으로 복구한다.
서버 preserved=false도 로컬 충돌 사본을 유지하며 자동 재시도/승격하지 않는다. 사본 32개/로컬 레코드 512개 한도는 자동 삭제 대신 실패를 반환하는 기술 보호선이다.
소유자가 바뀌면 모든 읽기/수정을 차단한다. 진행 중 응답은 다음 계정 공간에 쓰지 않는다. 같은 소유자의 Auth session이 바뀌면 이전 큐는 재전송하지 않고 새 권한/명시적 해결을 요구한다.
알 수 없는 저장 형식·손상 JSON·다른 owner가 기록된 데이터는 빈 값으로 덮어쓰지 않는다.

## 전송 어댑터
createTransport는 신뢰된 HTTPS Supabase origin·publishable key·현재 자격 증명 조회 함수를 받아 vzip_field_draft RPC만 호출한다.
자격 증명 조회 전후 owner/session을 확인하고 JWT sub/session_id와 일치하는 캡처된 토큰으로 요청한다.
JWT decode는 계정 라우팅 검사용이며 서명·세션 권한은 서버에서 반드시 검증한다.
서비스 비밀키는 거부하고 토큰은 저장/로그하지 않는다. redirect를 거부하고 쿠키를 보내지 않는다.
request_id·원 문구는 auth await 전에 고정한다. 서버 RPC 미설치/거부 시 구형 snapshot 쓰기로 fallback하지 않는다.
프로젝트 URL/키/getCredentials는 앱의 신뢰된 구성에서 제공해야 하며 사용자 입력을 받지 않는다.

## 검증과 미완료
Node 시험은 메모리 storage·가짜 RPC/HTTP로 오프라인/응답 유실/저장공간 실패/계정·세션 전환/새로고침 재개·충돌/큰 버전·손상 데이터·캡처된 자격 증명을 검증한다.
실행 결과는 PR/Actions에 기록한다. 실제 서버 SQL은 별도 #142 PostgreSQL 시험에서 검증한다.
브라우저 입력 연결·명시적 복원은 아래 과업 9에서 추가한다. 서버 초안 resume/realtime·초안 본문 commit·실제 Safari/PWA localStorage 용량·두 실제 기기의 E2E는 여전히 별도 검증 대상이다. 로컬 화면 연결을 기기 간 이어쓰기 완료로 표시하지 않는다.

## 서버 쓰기 중지
서버의 disabled 응답은 feature_disabled 사유의 blocked 상태로 처리하고 원 pending 요청·문구를 유지한다. 자동 재전송이나 snapshot fallback은 없다. 계정이 다시 활성화되면 최신 load/권한을 확인하고 명시적으로 resolve한 뒤 재개한다.

충돌 해결에서 로컬 문구를 선택해도 버려지는 서버 문구를 별도 로컬 사본으로 보존한다. 서버 후보가 다시 갱신되면 이전 후보도 자동으로 버리지 않는다. PostgreSQL에서 표현할 수 없는 NUL/비정상 surrogate는 저장 성공으로 표시하지 않고 기존 안전한 사본을 유지한다. 영구 HTTP 4xx(408/429 제외)는 pending을 보존한 blocked 상태이며 무한 재전송하지 않는다.

## 과업 9 — 레슨 로컬 입력 연결 (2026-11-16)

`app/lesson-local-draft.js`가 기존 outbox의 `start/edit/list`를 재사용한다. outbox API·상태·저장 형식은 바꾸지 않는다. `sync()`·전송 어댑터·서버 초안 RPC는 호출하지 않는다.

- `app/views-lessons.js`의 일정 추가·수정 폼 `prep` → `prepMemo`, 피드백 폼 `feedback` → `feedback`, `memo` → `memo`만 연결한다. 기존 `songFeedback`·연습 메모의 별도 임시 저장 동작과 저장소는 유지하고 합치거나 이전하지 않는다. 이전 `vzip_field_draft_v1:*` 레슨 사본도 삭제·자동 이전하지 않는다.
- 계정 namespace·확인된 owner/session에 묶는다. 폼을 열 때마다 새 editor UUID를 만들므로 다른 탭·재진입의 기존 레코드를 덮어쓰지 않는다. 재진입/새로고침은 `list()` 사본을 안내하고, 필드별 **저장 안 된 초안이 있어요 · 불러오기**를 누른 경우에만 새 editor 사본으로 복원한다. 자동 복원은 없다.
- `input/change/compositionend`에서 동기 로컬 저장한다. 지연 저장 타이머는 없다. 닫기·pagehide·beforeunload·visibilitychange에서도 마지막 값을 확인한다. 폼별 AbortController와 beforeLeave 해제 함수로 리스너를 정리한다.
- 저장 전 레슨은 outbox의 text `entityId` 계약 안에서 `new:<UUID>`를 사용한다. 새 폼마다 다른 UUID를 쓰고, 기존 신규 초안을 명시적으로 고르면 그 UUID를 이어 쓴다. 확정 저장 전까지 `lessons[]`에는 행을 만들지 않는다. 확정 저장 시 접두사를 뺀 UUID로 기존 생성 경로를 사용한다. 이미 로컬 레슨으로 생성된 `new:<id>` 초안은 새 일정 목록에서 제외하고 해당 레슨 편집에서만 안내한다.
- 입력칸의 원래 확정 값은 불러오기 전까지 유지한다. 현재 확정 값이 초안의 기준과 다르면 변경 안내를 붙인다. 사용자가 건드리지 않은 필드는 저장 직전의 최신 `VZ.db` 값을 사용해, 열린 폼의 오래된 값으로 갱신된 내용을 덮어쓰지 않는다.

### 확정 저장과 완료 확인

확정 저장은 기존 `VZ.change` → 기존 클라우드 동기화 경로 그대로다. 로컬 저장 성공 뒤에만 계정 storage의 `vzip_lesson_draft_receipts_v1:<owner>`에 제출 영수증을 쓴다. 영수증에는 레슨 ID, 제출한 필드 값, 화면에서 안내한 초안과 현재 editor의 정확한 `(entityId, field, editorId, localRevision)`만 담는다. 인증 정보는 저장하지 않는다.

기존 읽기 전용 `vzipAccountImportBaseline()`으로 서버 본문을 다시 확인하고, 일치한 **필드별로** 해당 revision까지만 안내에서 제외한다. outbox 레코드·본문은 지우지 않으며 outbox의 서버 초안 `ackRevision/server_draft`를 본문 저장 완료로 오용하지 않는다. 저장 뒤 추가 입력, 화면을 연 뒤 다른 편집기가 쓴 미확인 revision, 다른 필드는 이전 응답으로 완료 처리하지 않는다.

확인은 확정 저장 후, 재진입·focus·online·로그인 상태 변경·기존 cloud-merge 알림에 예약되며 동시에 하나만 수행한다. 서버 실패·값 불일치·응답 불확실·영수증 저장 실패는 미완료 사본을 유지한다. 서버 반영 후에도 아직 읽기 확인을 못 했다면 다음 확인까지 안내가 보수적으로 남을 수 있다. 서버 내용이 다르다고 자동 교체하거나 자동 재전송하지 않는다. 동기화 공통 파일·라우트·운영 DB·제안 SQL은 수정하지 않는다.

### 저장소 실패와 검증 범위

로컬 초안 저장 실패는 성공으로 표시하지 않는다. 입력칸과 계정에 묶인 메모리 복구 사본은 유지하며, 같은 페이지에서 다시 열어 명시적으로 불러올 수 있다. **기기 저장을 쓸 수 없으면 새로고침·프로세스 종료 후 보존은 보장할 수 없으므로 복사 안내를 표시한다.** 확정 로컬 저장 실패 때는 기존 core의 롤백을 유지하고 폼을 닫지 않는다.

확인된 계정/session이 없으면 다른 계정 또는 공용 초안을 추정해 불러오지 않는다. 기존 미등록/legacy 폼의 명시적 저장은 유지한다. [과업 9 검증 기록](../reviews/LESSON_LOCAL_DRAFT_2026-11-16.md)에 실패 재현, 자동 검사, 화면 증거와 실기기 미검증 항목을 기록한다.
