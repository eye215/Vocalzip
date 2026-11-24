# 휴대폰으로 녹음 알림 — 켜는 방법

**지금 상태:** 앱 코드·서비스 워커·DB 마이그레이션·Edge Function 코드와 자동 테스트까지 완료.
**운영 알림은 아직 꺼져 있어요.** 아래 서버 준비 현황의 남은 단계를 마치기 전에는 앱에 `설정 › 알림`이 보이지 않고, 휴대폰으로 녹음은 지금처럼
(앱이 열려 있을 때 메시지, 10분 안에 열면 맨 위 줄) 동작해요.

| 상태 | 내용 |
|---|---|
| 코드 구현 | 완료 (`app/push-handoff.js`, `share-worker.js` push/notificationclick, `cloud-sync.js` `vzipCloudPush`, `supabase/functions/vzip-push-handoff`, `supabase/migrations/20261123_push_subscriptions.sql`) |
| 자동 테스트 | `tests/push-subscriptions.test.mjs`(임시 PostgreSQL), `tests/push-worker.test.cjs`, `tests/push-handoff.spec.cjs` |
| 실제 운영 검증 | **아직 안 함** — 아래 단계 후 iPhone(홈 화면 앱)·iPad로 확인 필요 |

## 2026-11-24 서버 준비 현황

소유자가 승인한 범위에서 다음 작업을 마쳤어요. **이 기록은 알림 활성화 완료를 뜻하지 않아요.**

| 구분 | 확인한 상태 |
|---|---|
| 코드 구현 | 기존 코드 유지. `SERVER_READY=false`이며 앱 활성화·배포는 하지 않음 |
| 운영 DB | 승인된 `20261123_push_subscriptions.sql` 적용 완료. 새 표·인덱스·RLS·RPC 추가만 수행. 기존 데이터 변경·삭제 없음 |
| 운영 함수 | `vzip-push-handoff` v1 배포, ACTIVE, JWT 확인 켬. 인증 없는 요청은 401 확인 |
| 권한 확인 | 새 표 RLS 켬, 자기 계정 조회·삭제 정책, RPC의 anon 실행 금지·authenticated 실행 허용·빈 search_path 확인. 적용 후 구독 행 수 0 |
| 자동 테스트 | 임시 PostgreSQL/서비스 워커 5개, 가짜 계정·알림 API를 사용한 Chromium/WebKit UI 10개 통과 |
| 실제 운영 확인 | 휴대폰으로 실제 알림을 보내거나 수신한 검증은 아직 하지 않음 |

남은 순서는 **새 VAPID 키를 Edge Secrets에 등록 → 로그인된 요청으로 서버 준비 확인 → `SERVER_READY=true`와 해당 `?v=`를 변경하는 PR → 배포 후 실제 iPhone 홈 화면 앱에서 수신 확인**이에요.
새 VAPID 키는 아직 생성하지 않았고, 개인 키를 채팅·GitHub·로그·로컬 파일에 남기지 않았어요.
현재 연결 도구에는 Edge Secrets 쓰기 기능이 없고 로컬 Supabase CLI도 미로그인이라, 키 등록 단계는 아직 진행하지 못했어요.
DB 마이그레이션과 함수 배포를 다시 할 필요는 없어요. 진행 전 현재 함수·Secrets 상태를 확인하세요.

## 켜는 4단계 (Supabase 접근 권한이 있는 사람 또는 세션)

1. **DB 표 만들기** — 승인 후 `supabase/migrations/20261123_push_subscriptions.sql`을 운영 DB에 적용.
   새 표 하나와 함수 두 개만 추가하고, 기존 표·행은 건드리지 않아요.
2. **알림 키 만들기·비밀값 넣기** — VAPID 키 한 쌍을 만들고(예: `npx web-push generate-vapid-keys`),
   Supabase 대시보드 → Edge Functions → Secrets에 넣어요. **브라우저·GitHub·채팅·로그에 개인 키를 적지 않아요.**
   - `VAPID_PUBLIC_KEY` — 공개 키
   - `VAPID_PRIVATE_KEY` — 개인 키
   - `VAPID_SUBJECT` — `https://vocalzip.yullul.com`
3. **함수 배포** — `supabase functions deploy vzip-push-handoff` (JWT 확인 켜 둔 채로).

4. **앱에서 켜기** — `app/push-handoff.js`의 `SERVER_READY`를 `true`로 바꾸고 `?v=`를 올려 배포.
   (그 전에는 앱이 알림 서버를 아예 부르지 않아요.)

그 뒤 앱의 `설정 › 알림 › 휴대폰으로 녹음 알림`이 나타나요.

## 쓰는 법

- **아이폰**: Safari에서 공유 → 홈 화면에 추가한 VOCAL.zip 앱을 열고 → 설정 › 알림 켜기 → 알림 허용.
  (Apple은 홈 화면에 추가한 웹앱에서만 웹 알림을 허용해요. iOS 16.4 이상.)
- **아이패드**: 곡 화면 › 휴대폰으로 녹음 → 아이폰(과 짝지은 애플워치)에 "녹음 시작 · 곡" 알림 → 누르면 그 곡 녹음 화면.
- 워치에서는 알림을 볼 수만 있고 녹음은 아이폰에서 해요.

## 지키는 것

- 같은 계정의 다른 기기에만 보내요. 다른 계정에는 절대 보내지 않아요(RLS: 자기 행만, 함수는 로그인 사용자 기준).
- 알림 내용: 곡 제목과 보낸 기기 이름뿐. 녹음·개인 정보 없음. 저장하는 것은 기기의 알림 주소(endpoint)와 공개 키뿐.
- 사라진 기기(404/410)는 자동으로 지워요. 한 사람당 최대 10대.
