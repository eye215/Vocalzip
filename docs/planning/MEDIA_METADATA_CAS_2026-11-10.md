# 파일 정보 수정의 서버 버전 보호 — 2026-11-10

Phase 03·05·06/08의 P0 후속이다. 악보·스와이프·UI 고도화와 분리한다. 이번 범위는 **독립 서버 계약과 전송 API**이며 현재 편집 폼의 저장 경로 전환이나 운영 활성화가 아니다.

## 계약

- 제안 SQL: `20261118_media_metadata_cas.sql`, 이전 세션·snapshot·rollout·media guard 제안에 의존.
- Worker: `POST /v2/media/edit`.
- 클라이언트: `VzipR2.editLibrary({requestId,mediaId,key,updatedAt,patch},{signal})`.
- `updatedAt`은 사용자가 확인한 서버 버전의 UTC 6자리 소수 초 원문이다. JS Date로 왕복 변환해 마이크로초를 버리지 않는다.
- 수정 허용: `name, song, songId, recordedDate, dateSource, rating, review`. 곡명/ID는 함께 변경하며 해당 계정 root에 있는 곡만 연결한다. 연결 해제는 두 값 모두 빈 문자열이다. 날짜는 빈 문자열 또는 유효한 YYYY-MM-DD, 별점은 null 또는 0~5 정수다.
- 계정·활성 세션·revision 모드를 서버가 확인하고 root→요청 영수증→metadata 순서로 잠근다. 기대 버전/불변 원본 키가 다르면 409에 해당하는 충돌로 중단한다. 새 버전으로 자동 재시도하거나 오래된 patch를 최신 입력에 재적용하지 않는다.
- 원본 ID·키·형식·크기·ETag·업로드 정보는 수정할 수 없다. 고정 키/다른 저장소/영상은 인수 계약이 선행된다. R2 원본의 읽기·재전송·교체·삭제를 하지 않는다.
- 실제 metadata의 나머지 필드와 root의 레슨·연습·곡·참조는 그대로 보존한다. timestamp는 미래 시각의 기존 행에서도 최소 1마이크로초 증가한다. 기존 DB 트리거가 버전/내용을 바꾸면 트랜잭션 전체를 취소한다.

## 응답 유실과 후속 수정

요청 ID는 사용자·세션·파일·원본 키·기대 버전·patch 해시에 묶는다. 같은 입력 재요청은 한 번만 적용한다. 서버 영수증은 이 식별값과 적용 버전만 저장하며 수정 본문·개인 메모·미디어 바이트를 복제하지 않는다. 직접 클라이언트 접근은 금지한다.

응답은 `applied_updated_at`(이 요청이 적용된 버전), `updated_at`(현재 버전), `metadata`(현재값), `replayed`, `superseded`를 반환한다. 이전 요청 뒤 다른 수정이 있으면 현재값과 `superseded:true`를 반환하며 원래 patch를 다시 적용하지 않는다. 향후 화면/저장 브리지는 이 상태를 과거 요청의 그대로인 성공으로 표시하거나 현재 입력을 조용히 교체해서는 안 된다.

다른 세션으로 같은 요청을 재사용하거나 입력을 바꾸면 충돌이다. 재로그인은 기존 복구/명시적 재승인 정책과 연결해야 한다. 삭제 표시·삭제 예약 후에는 새 편집과 예전 영수증 재확인을 막고 원본을 부활시키지 않는다.

## 클라이언트 연결의 범위

새 전송 함수는 사용자 입력의 사본을 만든 뒤 읽기 준비를 기다리며 계정/세션을 앞뒤로 재확인한다. 서버가 확인된 legacy 모드일 때만 null을 반환한다. 모드 불명·연결 실패·paused·409·응답 불명에는 기존 직접 쓰기로 우회하지 않는다. 서버 적용 응답의 소유자/원본/요청·정밀 버전·실제 patch와 superseded 조합을 검사한다.

현재 `cloud-sync.js`의 기존 `patchMedia`·곡 지정·제목 파생 규칙은 바꾸지 않았다. 이 함수는 아직 폼에서 호출하지 않는다. 다음 브리지 작업에서 최초 편집 기준 버전, 요청/outbox 보존, 충돌·superseded 표시와 사용자 확인, 곡 자동 제목 파생 필드의 허용 범위, 모든 metadata writer를 연결해야 한다. 이 연결 전에는 revision 계정의 직접 DML 차단을 활성화하지 않는다.

## 검증과 활성화

격리 PostgreSQL의 실제 두 트랜잭션, Miniflare Worker/R2, 클라이언트 VM 검사 결과와 SHA는 PR에 기록한다. 실제 Supabase PostgREST/Vault·Cloudflare R2·iPhone·두 실기기 인수와 구분한다.

SQL은 proposals에만 추가한다. 운영 DB/Worker 설치·배포, 계정 전환, 실제 미디어 이동/삭제는 하지 않는다. 새 동기화·`MEDIA_VERSION_GUARD_ENABLED`·`UPLOADS_V2_ENABLED` 기본 OFF는 유지한다. 운영 적용 전에는 영수증 보존/용량·기존 파일 인수·전체 writer·실제 HTTP/기기간 검증이 필요하다.
