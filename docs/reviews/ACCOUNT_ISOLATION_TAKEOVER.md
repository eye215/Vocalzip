# 두 로그인 세션·계정별 파일 격리 운영 전환

## 확정 범위
사용자 요청으로 계정당 등록 로그인 **2세션**, 세 번째 진입은 종료할 기존 로그인 명시 선택으로 변경했다. 물리적 기기 수와 Auth 세션 수는 같지 않다. Safari와 홈 화면 PWA가 별도 로그인일 수 있다.

이 PR은 로그인과 파일/정산 격리의 운영 전환을 다룬다. D21~D24의 서버 초안 동기화·동일 필드 편집 lease·충돌 사본·악보 필기 병합은 별도 후속 개발이다. 기존 payload 병합을 필드별 공동 편집 구현으로 표시하지 않는다.

## 서버
- `vzip_account_session_state`의 서버 전용 한도는 기본 2, 계정별 revision 잠금으로 동시에 들어오는 로그인과 오래된 교체 승인을 직렬화한다.
- `vzip_device_sessions`는 검증 JWT/session_id를 참조한다. 등록/조회/개별·전체 회수/현재 로그아웃 RPC를 제공하며, 사용자 인자로 현재 계정을 신뢰하지 않는다.
- 명시적으로 회수한 로그인은 `auth.sessions`에서도 해당 사용자/세션만 제거한다. 전체 로그아웃은 그 사용자의 Auth 세션 전체를 대상으로 한다. refresh_tokens의 세션 FK cascade를 운영 적용 전에 검사한다. 기존 곡·녹음·레슨·정산 원본을 삭제하는 작업이 아니다.
- Supabase 문서의 [세션 회수·JWT 확인 원칙](https://supabase.com/docs/guides/auth/sessions)을 따르며 실제 refresh 거절은 운영의 별도 합성 계정으로 검증한다. JWT 자체는 만료 전 암호학적으로 유효할 수 있으므로 모든 민감 경로가 Auth/등록 세션을 다시 확인한다.
- 직접 DB/Storage는 기존 소유자 정책과 AND로 검사한다. 읽기는 Realtime의 JWT 문맥도 지원하고, 쓰기는 격리 클라이언트 프로토콜을 추가 확인한다. 프로토콜 헤더는 인증 수단이 아니다.
- 사용자 SECURITY DEFINER RPC 4개를 감싼다: 정산 저장, 과거 미디어 enqueue, STT reserve/usage. 원래 함수 본문은 직접 실행 불가한 `*_session_impl`로 보존한다. STT Edge는 기존 코드대로 사용자 JWT를 넘기므로 reserve는 실제 Auth/등록 세션으로 검사하며 브라우저 SDK 헤더를 인증 수단으로 삼지 않는다. AI 알고리즘·Worker 큐 처리는 바꾸지 않는다.
- `vzip_session_rollout.enforced=false`로 서버를 준비하면 기존 미등록 계정은 기존 소유자 정책을 유지한다. 새 클라이언트로 등록한 계정에는 즉시 등록 세션 검사가 적용된다. 클라이언트/Worker 배포를 확인한 뒤 전역 true로 전환한다.

## R2
- Worker는 직접 API 요청의 JWT를 검증한 뒤 원래 사용자 토큰으로 `vzip_session_context`를 확인한다. DB 오류나 회수된 세션은 우회하지 않는다.
- 재생 링크는 파일 key/만료/세션별 무작위 playback capability를 HMAC으로 묶는다. 전체 JWT·refresh token은 URL에 넣지 않는다.
- 서명 GET/HEAD/Range도 capability가 여전히 유효한 Auth/등록 세션인지 확인한다. 검증 RPC는 무작위 capability의 소유자만 반환하며 쓰기 권한을 부여하지 않는다.
- 활성화 후 세션 정보가 없는 구버전 링크를 거부한다. 새 미디어 응답은 private/no-store다. 이미 내려받은 바이트의 회수는 보장하지 않는다.
- multipart 완료 후에도 로그인 상태를 재검사한다. 도중 회수되면 메타데이터 확정을 허용하지 않는다. 원본 객체를 임의 삭제하지 않으며 기기 대기열/원본으로 재시도한다.
- 서명 URL 캐시는 계정뿐 아니라 로그인 세션 변경 때도 비운다. 새 앱은 세션 capability 없는 예전 Worker 응답을 재사용하지 않는다.

## 기기 자료와 정산
- localStorage/IndexedDB·업로드 큐·스냅샷·URL 캐시는 계정별 공간을 쓴다. 이전 비동기 작업은 원래 계정에 고정하고 전환 전에 진행/미저장 녹음을 보호한다. 보호 실패면 전환하지 않는다.
- 기존 앱 JSON/미디어 DB는 자동 삭제·병합하지 않는다. 소유 계정 명시 확인 후 복사하며 현재/클라우드 중복·tombstone을 덮어쓰지 않는다.
- 정산은 별도 계정 DB를 사용하며 서버 검증 전 화면/기기 쓰기를 잠근다. 기존 정산 DB에서 정확히 같은 owner의 행만 복사하고 현재 행이 있으면 덮어쓰지 않는다.
- 다른 로그인 계정의 정산은 열거하거나 가져오지 않는다. 소유자 미확정인 device 정산은 명시 확인과 공통 legacy claim/Web Lock을 거쳐 복사한다. 원본은 유지한다.
- 앱의 레슨↔정산 bridge도 같은 계정 DB를 참조한다. 새 DB를 만들기 전에는 자신의 예전 ledger만 읽는다. 자동 차감·정산 클라우드 설정은 기존 사용자 선택을 유지한다.

## 검증
- 임시 실제 PostgreSQL: 한도·동시 요청/CAS·Auth 및 refresh cascade·공개/내부 RPC·RLS/Storage·Realtime 읽기·재생 capability·단계적 활성화.
- Chromium/WebKit: 승인/취소·파일/대기열·진행/미저장 녹음·기존 원본·정산의 계정 전환/회수 잠금.
- R2: 기존 Miniflare 회귀 및 새 세션/서명/기발급 URL/완료 시 회수 검사.
- 기존 UI/정산 테스트는 명시적 미등록 호환 모드다. 새 세션 테스트와 운영 합성 계정 smoke는 새 모드를 사용한다.
- 운영 release job은 자체 생성한 테스트 계정만 사용하고 삭제 전 배치 표식을 재확인한다. 실제 사용자 레코드·미디어 파일은 수정하지 않는다. 토큰/비밀번호/서명 URL을 로그나 artifact에 남기지 않는다.
- 실제 iPhone/iPad의 Safari/설치형 PWA·오프라인/저용량/잠금은 별도 미검증이다. 자동 WebKit 검사로 완료 표시하지 않는다.

## 배포 순서와 승인
사용자가 **2개 제한·테스트 후 배포**를 명시 승인했다. 소스 후보는 기본 플래그 true이므로 아래 순서를 지킨다.

1. 후보의 모든 필수 CI 통과.
2. `ops/device-session-release.json`에 검증한 source SHA와 prepare 모드만 추가. 운영 workflow는 소스 차이가 이 계획 파일뿐인지 확인하고 CI를 재확인한다.
3. 기존 GitHub Actions DB 자격 증명으로 서버 계약 준비(전역 강제 off). 실제 합성 Auth 계정으로 refresh/2세션/세 번째 확인/회수/RLS/RPC와 로컬 후보 브라우저·정산 smoke.
4. R2 Worker 변경을 먼저 main에 병합. 기존 Cloudflare Workers Builds가 배포한 health의 sessionContract=v2를 확인하고 verify_worker 계획으로 실제 토큰·서명 회수 검사.
5. 그 뒤 #117 클라이언트를 main에 병합. Pages 배포 파일을 후보와 비교한다.
6. activate 계획에서 준비된 Worker/웹 버전 확인 후 전역 강제 on, 새 합성 계정으로 기존 서명·미등록/회수 토큰 거부까지 재확인.
7. 실패 시 활성화 job은 전역 설정을 준비 상태로 되돌린다. 이미 등록된 계정의 세션 보호는 유지한다. 원본 데이터/세션 이력을 지우는 rollback은 하지 않는다.

Supabase 직접 도구의 프로젝트 권한 오류 때문에 기존 저장소의 승인된 Actions 접속 경로를 사용한다. 별도의 관리 토큰을 출력하거나 사용자에게 채팅으로 요구하지 않는다. 운영 실행 결과와 배포 commit/run은 PR에 별도로 기록하며 소스 구현을 운영 적용 완료로 표시하지 않는다.
