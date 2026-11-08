# Phase 05-A 로컬 초안/outbox 모듈

기준: 2026-11-08. sync/field-draft-outbox.js는 DOM 없는 독립 모듈이다.
**index.html·기존 화면·입력 폼에 연결하지 않았다. 운영 DB·실제 사용자 초안을 변경하지 않는다.**

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
브라우저 입력 이벤트 연결·가시 상태·resume/realtime·초안 본문 commit·실제 Safari/PWA localStorage 용량·두 실제 기기의 E2E는 미완료다.
UI는 사용자가 별도로 진행하므로 이 모듈만으로 자동 초안/이어쓰기 제품 기능 완료로 표시하지 않는다.

## 서버 쓰기 중지
서버의 disabled 응답은 feature_disabled 사유의 blocked 상태로 처리하고 원 pending 요청·문구를 유지한다. 자동 재전송이나 snapshot fallback은 없다. 계정이 다시 활성화되면 최신 load/권한을 확인하고 명시적으로 resolve한 뒤 재개한다.
