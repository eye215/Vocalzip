# 학생 1.0 — 원본 버전 보호 서버 계약

기준: PR [#232](https://github.com/eye215/Vocalzip/pull/232), 기능 검사 커밋 `f6e8cee37ea0c74a3f44e600fedc9c473678d956`. Phase 03·05·06/08의 P0 선행 작업이다.

## 현재 상태

서버 계약 소스와 격리 자동 검사를 추가했다. **운영 Worker 배포, SQL 설치, 계정 전환, 기존 원본 이동·삭제는 수행하지 않았다.** `MEDIA_VERSION_GUARD_ENABLED=false`, `UPLOADS_V2_ENABLED=false`, 앱의 새 동기화 OFF를 유지한다. 기존 클라이언트는 새 서버 계약과 아직 연결되지 않았으므로 이 PR만으로 활성화하면 안 된다.

## 보호 대상과 처리 순서

대상은 v2 업로드가 만든 `u/<uid>/<mediaId>/<attemptUuid>/original.<ext>` 형태의 완료된 오디오 원본이다. 같은 ID의 다른 업로드 시도는 별도 키를 사용한다. R2의 조건부 삭제 기능에 의존하지 않는다.

1. 클라이언트가 현재 세션에서 root revision의 삭제 표시와 알려진 참조 정리를 확정한다.
2. `POST /v2/media/delete/prepare`에 requestId·mediaId·key·updatedAt·size를 보낸다.
3. Worker가 R2 HEAD로 소유자·업로드 UUID·크기·형식·해시 루트·ETag를 확인하고 별도 HMAC 개체 증명을 만든다.
4. SQL은 현재 등록 세션, revision 계정, root 삭제 표시, metadata의 정확한 버전을 확인한다. 같은 트랜잭션에서 삭제 가드와 최소 요청 영수증을 만든다. 이 단계는 원본이나 metadata를 삭제하지 않는다.
5. Worker는 사용자·검증된 JWT session_id·요청·개체 버전에 묶인 티켓을 반환한다.
6. `POST /v2/media/delete/commit`은 티켓, 현재 세션/삭제 상태, 같은 개체의 HEAD를 재확인하고 **해당 불변 키 하나만** 삭제한다. 이어 별도 완료 HMAC으로 정확한 metadata와 요청 상태를 정리한다.
7. 응답 유실은 같은 요청 상태로 재확인한다. 완료 요청 재실행은 원본을 다시 지우지 않는다. 다른 시도의 원본은 보존한다. 새 로그인에서는 기존 티켓을 자동 재사용하지 않고 #231의 명시적 재승인 흐름과 연결해야 한다.

사용자 메모·녹음 본문은 서버 삭제 원장에 복제하지 않는다. 삭제 가드는 같은 media ID 재생성, 알려진 root 참조 복원, 이후 업로드 완료를 차단한다. 영구 삭제 정책과 다른 복구용 휴지통을 만들지 않는다.

## 구 클라이언트와 권한

| 계정 모드 | 서버 동작 |
|---|---|
| legacy | 기존 API 유지. 단, 서버 가드가 켜진 경우 UUID 불변 키의 v1 직접 삭제는 티켓을 요구 |
| revision | v1 업로드/직접 원본 삭제와 직접 metadata 쓰기를 거부. v2 계약과 활성 등록 세션 필요 |
| paused | 미디어 변경을 거부. 자동으로 legacy에 되돌리지 않음 |

SQL 제안은 `vocal-recordings` Supabase Storage 버킷의 INSERT/UPDATE/DELETE에도 restrictive RLS를 추가한다. 전환 계정이 구 버킷을 통해 우회하지 못하게 하며 기존 읽기·소유자/세션 정책, 다른 버킷·비전환 계정은 유지한다. service_role 등 신뢰 서버의 모든 변경 경로를 이 규칙이 대신 통제하는 것은 아니다.

새 원장 직접 접근·내부 증명 함수는 클라이언트에 허용하지 않는다. Worker는 사용자 JWT를 RPC에 전달하며 service_role 키를 사용하지 않는다. RPC 리다이렉트를 따라가지 않으며 검증 불가 시 변경을 거부한다. SQL은 `proposals`에만 추가했고 설치 시 기존 데이터 backfill이나 초기화를 하지 않는다.

## 비밀 설정

Worker `MEDIA_VERSION_SECRET`과 Supabase Vault `vzip_media_version_secret`에 같은 별도 비밀을 안전한 운영 도구로 설정해야 한다(32~1024자). 티켓·개체 검증·삭제 완료 증명은 각각 다른 서명 영역을 사용한다. 값은 저장소·채팅·검사 로그에 기록하지 않는다. 설정이 없거나 서로 다르면 요청은 실패한다.

회전 시 계정을 일시 중지하고 진행 요청을 정리한 뒤 양쪽 설정을 함께 교체한다. 이전 티켓은 새로 준비한다. 실제 Vault 권한·pgcrypto 설치 스키마·트랜잭션 잠금은 설치 전 확인한다.

## 실제 검증

기능 검사 SHA의 Actions:
- [격리 SQL·workerd/R2 통합](https://github.com/eye215/Vocalzip/actions/runs/42775505525): 신규 **15/15**, 기존 rollout·2세션 DB 계약 **22/22** 통과.
- [Worker](https://github.com/eye215/Vocalzip/actions/runs/42775505570): 전체 **50/50** 통과, 신규 계약 14개 포함.

신규 검사는 계정 격리, 세션 회수/정지, 위조·다른 용도의 HMAC, 변경된 metadata, root 삭제 표시·참조, 구형 직접 쓰기/Storage 우회, 재생성 방지, 완료 증명 없이 완료 주장, 같은 요청 재시도, 응답 유실을 포함한다. 실제 Miniflare multipart로 원본 두 개를 만든 뒤 SQL RPC 계약과 연결하여 이전 원본만 삭제되고 새 원본·메모가 유지됨을 확인했다. metadata가 새 원본을 가리키면 이전 삭제 요청은 물리 삭제 전에 거부했다. SQL 재적용도 검사했다.

이는 **메모리 R2 + 격리 PostgreSQL + SQL 역할/claims를 설정하는 RPC 어댑터** 검사다. 운영 Cloudflare R2, 실제 Supabase PostgREST/Vault, iPhone Safari/PWA, 두 실기기 동시 작업을 인수한 결과가 아니다. 기존 UI의 18개 실패는 이 PR의 서버 검사 통과로 해결 처리하지 않는다. 앱·CSS·UI 테스트 파일은 변경하지 않는다.

## 활성화 전 남은 필수 작업

1. **클라이언트 metadata 게시·수정 계약**: 완료 업로드의 검증 영수증을 받아 정확한 버전을 CAS로 게시하고, 원본 변경 없이 곡명/날짜/제목 등 편집을 지원한다. 현재는 전환 계정의 직접 metadata DML을 차단하므로 이 연결 없이 활성화하면 업로드/편집이 실패한다.
2. **클라이언트 삭제 연결**: #225/#231의 root 승인·로컬 revision 보호와 새 prepare/commit 및 지속 영수증을 연결한다. 응답 유실·재로그인·오프라인/용량 부족·계정 전환을 검사한다.
3. **기존 원본 인수**: 고정 키·legacyStorage·PDF·공연 자료·영상 등 기존 v1 경로의 보존/편집/삭제 계약을 마련한다. 이 PR은 오디오 v2만 지원하며 전환 계정의 v1 쓰기를 막으므로 전체 기존 흐름 호환 전에는 활성화하지 않는다. 기존 파일 자동 이동·변환·삭제 금지.
4. **진행 중 구 작업 처리**: 새 가드는 이미 통과한 v1 요청을 소급 취소하지 않는다. 계정 정지·세션 회수·진행 요청 소진과 기존 고정 키 덮어쓰기 경로 점검 후 전환한다. DB와 R2를 하나의 원자적 트랜잭션으로 표현하지 않는다.
5. **전체 writer/참조 목록**: 기존 STT·history 복구·서명 URL·신뢰 서버 RPC·다른 버킷·공연/공유 자료·로컬 writer를 대조한다. root 보호는 현재 songs.repertoire.takeId, lessons.recordings.id, practices.mediaIds, comparisonReports.firstId/secondId를 확인한다. 새 참조가 생기면 함께 확장한다.
6. **운영 설치 전 인수**: 검토된 순서로 세션/스냅샷/rollout/본 제안 의존성을 설치하는 별도 계획, 보존/정리·용량 정책, 원장 증가에 따른 root 검사 성능, 백업·실패 복구·운영 HTTP 검사를 준비한다. 두 기기/iPhone에서 중단·재로그인·계정 전환·동시 편집·최종 영구 삭제 확인을 수행한다.

다음 구현 순서: metadata 게시/편집 계약 → 삭제 클라이언트 브리지 → 기존 원본·나머지 업로드 흐름 인수 → 전체 writer/운영 HTTP·실기기 검사 → 소유자 계정 제한 활성화. 서버 소스 병합만으로 Phase 전체 또는 운영 데이터 보호 완료로 표시하지 않는다.
