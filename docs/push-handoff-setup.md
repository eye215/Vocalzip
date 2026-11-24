# 휴대폰으로 녹음 알림 — 켜는 방법

**지금 상태:** 앱 코드·서비스 워커·DB 마이그레이션·Edge Function 코드와 자동 테스트까지 완료.
**운영에는 아직 꺼져 있어요.** 아래 4단계를 하기 전에는 앱에 `설정 › 알림`이 보이지 않고, 휴대폰으로 녹음은 지금처럼
(앱이 열려 있을 때 메시지, 10분 안에 열면 맨 위 줄) 동작해요.

| 상태 | 내용 |
|---|---|
| 코드 구현 | 완료 (`app/push-handoff.js`, `share-worker.js` push/notificationclick, `cloud-sync.js` `vzipCloudPush`, `supabase/functions/vzip-push-handoff`, `supabase/migrations/20261123_push_subscriptions.sql`) |
| 자동 테스트 | `tests/push-subscriptions.test.mjs`(임시 PostgreSQL), `tests/push-worker.test.cjs`, `tests/push-handoff.spec.cjs` |
| 실제 운영 검증 | **아직 안 함** — 아래 단계 후 iPhone(홈 화면 앱)·iPad로 확인 필요 |

## 켜는 4단계 (Supabase 접근 권한이 있는 사람 또는 세션)

1. **DB 표 만들기** — 승인 후 `supabase/migrations/20261123_push_subscriptions.sql`을 운영 DB에 적용.
   새 표 하나와 함수 두 개만 추가하고, 기존 표·행은 건드리지 않아요.
2. **알림 키 만들기·비밀값 넣기** — VAPID 키 한 쌍을 만들고(아이폰·아이패드: https://vocalzip.yullul.com/push-keys.html — 기기 안에서만 만들고 아무 데도 보내지 않음. 컴퓨터: `npx web-push generate-vapid-keys`),
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
