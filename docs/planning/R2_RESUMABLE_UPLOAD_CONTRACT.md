# Phase 06-B: 검증된 R2 part 재개와 완료 응답 복구

2026-11-08. #148의 속도/자동 제목 수정 위에 쌓는 독립 변경이다. UI 레이아웃·DB 스키마 변경 없음.

## 프로토콜과 원본 보호

- /v2/uploads는 서버가 생성한 시도 UUID별 u/<owner>/<mediaId>/<attempt>/original.<ext>에 MPU를 만든다. 기존 평면 original 경로와 다른 시도 파일을 덮어쓰지 않는다.
- 서버 HMAC ticket은 owner·mediaId·key·uploadId·size·type·ext·SHA-256 root·attempt에 결합된다. Ticket만으로 접근할 수 없고 매 요청마다 현재 Supabase 등록 세션을 검증한다.
- 원본을 8MiB씩 읽어 각 조각 SHA-256과 index/길이를 포함하는 Merkle root를 만든다. 서버는 제한된 8MiB 버퍼와 조각 proof를 검증한 뒤에만 R2 part를 받는다. 크기/이름만 같은 다른 파일은 재개하지 않는다.
- 상태/완료 재요청은 고유 시도의 R2 metadata와 root/크기/etag를 확인한다. 완료된 시도를 다시 쓰지 않는다. 서버의 일반 업로드(v1) 계약은 유지한다.

## 기기의 임시 작업 원장

- 계정·저장소 endpoint·media ID별 키. 원본 bytes·access token·서명 재생 URL 저장 없음.
- 실제 전송 전에 원래 연결 metadata, SHA manifest, 작업 원장을 저장한다. 처음부터 레코드당 128KiB 공간을 예약하여 part ACK 증가에 필요한 공간을 확보한다.
- 최대 2개 조각을 전송하고 성공 ACK를 지속 저장한다. 취소/응답 유실 시 서버의 부분 업로드를 자동 abort하지 않는다.
- 같은 ID와 동일 원본으로 재시도하면 ACK가 있는 part는 전송하지 않는다. 계정/세션/endpoint 변경 중의 오래된 작업은 기록을 확정하지 않는다.
- 모든 part ACK가 있으면 원본 File 없이도 상태/완료 응답을 다시 받아 06-A의 보관함 영수증으로 전달한다. 보관함 행을 확인한 뒤에만 두 작업 원장을 정리한다.
- 서로 다른 시도의 동일 ID가 충돌하면 기존 metadata를 덮어쓰지 않는다. 두 물리 파일은 보존하며 조용히 한쪽을 지우지 않는다.

## 활성화

저장소의 기본 UPLOADS_V2_ENABLED는 false다. 웹 클라이언트와 Worker 소스를 먼저 배포해도 새 계약을 자동 활성화하지 않는다.
원격 Worker 설정과 등록 세션을 검증한 뒤 UPLOADS_V2_ENABLED=true + SESSION_GUARD_ENABLED=true로 활성화해야 새 전송을 시작한다.
/v1/me가 uploadContract=merkle-v2를 알린 경우에만 신규 보관함 업로드가 v2를 선택한다.
기존 v2 작업이 있으면 서버가 중지/연결 실패해도 v1/TUS에 같은 ID로 자동 전환하지 않는다.
일반 PDF/공연 자료 업로드는 이번 v2 범위가 아니다.

운영 Worker 배포는 아직 수행하지 않았다. 읽기 전용 GitHub Actions 확인(run 42503327451)에서 표준 CLOUDFLARE_API_TOKEN/CF_API_TOKEN 및 계정 ID 설정이 모두 비어 있었고, 현재 도구에 Cloudflare 배포 연결이 없다.
워커 소스/테스트/빌드 산출물을 먼저 제공한다. 배포 시 기존 MEDIA R2, 서명/JWT secret, SESSION_GUARD, STT 비활성, MEDIA_TRANSFORM 바인딩을 보존해야 한다. 토큰/개인 파일을 GitHub 로그·채팅에 넣지 않는다.

## 검증·한계

실제 Miniflare/workerd + R2에서 Worker 기존/추가 계약과 비활성 상태의 v1 호환을 검증하고 Wrangler dry-run 번들을 생성한다. 최종 소스의 통과 건수와 브라우저 시험은 PR/Actions에 실제 기록한다.
브라우저에서 모의 Supabase/R2와 연결·재로그인·원본 검증을 시험한다. 실제 운영 R2·iPhone/PWA의 결과로 확대하지 않는다.

- 일부 part만 ACK된 상태에는 원본 File이 필요하다. 기기에 원본이 있는 기존 녹음 백업/같은 ID의 현재 파일 재시도는 지원하지만, 새로고침으로 사라진 직접 업로드 File을 임의 복원하지 않는다.
- 새 파일 선택이 새 media ID를 생성하는 흐름은 이전 ID의 작업을 자동으로 합치지 않는다.
- localStorage 자체를 지우면 기기의 작업 원장도 사라진다. 원장 유실 후 전체 계정 복구는 보장하지 않는다.
- 기술 안전 상한은 계정/endpoint당 16개 미완료 작업. 자동 오래된 항목 삭제/다른 원본 대체 없음. MPU 만료·정리는 R2의 기존 수명주기 설정에 따른다.
- 파일 영구 삭제와 진행 중 업로드 확정의 서버 원자적 조정, 구형 v1 클라이언트의 자체 덮어쓰기 방지는 별도 후속이다.
