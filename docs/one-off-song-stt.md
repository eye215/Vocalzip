# VOCAL.zip — 선택형 STT 곡 추천 (후속 PR #73)

**현재 상태:** 코드 + 보관함 진입 버튼 + Supabase Edge Function 배포됨. **유료 STT는 기본 비활성화**. 별도 브랜치의 앱 코드는 main에 아직 병합되지 않았습니다. 정산/백업 PR과 독립적으로 검토한 후 병합하세요.

## 동작

1. VOCAL.zip 음원 보관함 → **🎵 미분류 AI 곡 추천**.
2. 미분류 음원에서 하나/여러 개 또는 **전체 선택**.
3. **AI 분석 시작**. 파일명에 등록 곡명이 있으면 API 호출 없이 곡 후보를 제안. 나머지는 **먼저 확인창에서 유료 STT 실행 동의**를 받은 다음 곡당 약 30초 분석.
4. 한 파일씩 처리. 중단 가능. 완료한 STT 결과는 기기 로컬 캐시에 남으므로 반복 분석 시 별도 과금하지 않음.
5. 파일별 추천 곡을 드롭다운에서 확인/변경, 후보가 없는 파일은 미분류로 둠.
6. **추천대로 곡 지정 → Y(확인)**을 눌렀을 때만 `songId`/`song` 정보를 보관함의 기존 업데이트 함수로 저장.
7. 최근 변경 내용을 잘못 적용했다면 **마지막 일괄 지정 되돌리기** 사용.

**음악/녹음 원본 데이터는 업로드·변환·삭제하지 않습니다.**

**주의:** 노래 STT는 부정확할 수 있습니다. 제공된 곡 목록에 없는 곡은 식별되지 않습니다. 가사 일부만으로 곡을 결정할 수 없는 경우, 추측 대신 미분류로 남깁니다. 유사도 점수를 실제 확률로 표시하지 않습니다.

## API 및 과금 — 활성화 전 필수

기능은 `supabase/functions/vzip-song-stt/index.ts`에 구현되어 있으며 `vzip-song-stt`라는 이름으로 Supabase에 **배포만** 되어 있습니다. 별도 인증 및 API 비용 제한을 위해, 아래 Secret들이 설정되지 않으면 요청에 **503**을 반환하며 **과금되지 않습니다**.

| Secret | 예시 | 설명 |
|---|---|---|
| `OPENAI_API_KEY` | OpenAI 프로젝트 전용 키 | Supabase 대시보드 Edge Functions → Secrets에서 설정. 브라우저·GitHub에 입력 금지 |
| `STT_ENABLED` | `true` | 마이그레이션 기간에만 활성화 |
| `STT_ALLOWED_USER_IDS` | 본인 Supabase Auth UUID | 허용할 사용자 1명만, 쉼표로 여러 명 가능 |

**활성화 전:** OpenAI 프로젝트에서 사용 한도/알림 설정. 이 프로젝트에서 필요한 STT 외 다른 유료 API 호출이 발생하지 않도록 별도 키 사용을 권장합니다. 현재 앱은 30초 구간을 클라이언트에서 WAV로 만들어 전송하고, 서버에서 `gpt-4o-mini-transcribe` + `gpt-4o-mini`로 전사·곡 후보 판별을 합니다. 실제 원가와 한도는 제공자 대시보드에서 확인하세요.

**마이그레이션 종료 즉시:** `STT_ENABLED=false`로 설정하거나 `OPENAI_API_KEY`를 제거하고 필요하면 프로젝트의 API 키도 폐기하세요. 앱의 캐시/곡 연결은 유지됩니다. **Secret을 나중에 지운다고 이미 발생한 API 사용 요금이 없어지는 것은 아닙니다.**

## 기술적 제한과 테스트

- 30초 WAV 클립만 외부 서비스에 전송. 12MiB가 넘는 원본, 브라우저가 디코딩하지 못하는 FLAC 등은 실패로 표시하고 건너뜀.
- 아이폰 Safari는 대량 파일의 디코딩을 오래 실행하면 탭이 중지될 수 있음. 화면을 유지하고 중단되면 이미 분석된 결과를 다시 이용.
- 모든 곡명을 알아낼 수 있는 시스템이 아님. **사용자 등록 곡 목록을 폐쇄형 후보군**으로 사용. 곡 제목이 가사에 없거나 짧은 전사만으로 불명확하면 추천이 없을 수 있음.
- 파일별 분석 결과는 브라우저 로컬 저장소에 남으므로 같은 기기에서 재분석을 줄임. 기기 데이터가 삭제되면 캐시는 소실될 수 있음.
- **서버 사용량의 절대적인 원화 한도를 강제하는 DB 기반 사용량 미터링은 아직 구현되지 않았음.** 서버는 허용된 Auth UUID만 처리할 수 있고, 비활성 기본값으로 보호하지만, 프로덕션 사용 전 소액 API 프로젝트 제한 및 기간 설정이 권장됨.
- 곡 지정 변경 전 로컬 스냅샷을 생성하고 최근 일괄 지정 되돌리기 버튼 제공. 마지막 저장 작업만 보장하므로 큰 작업 전 `vocal_media` JSON 백업 권장.
- 영구 서비스 기능이 아니라 현재 녹음 마이그레이션 완료 후 비활성화할 일회성 편의 기능.

## 검증

GitHub 브랜치 `feat/stt-song-suggestions-poc` / 초안 PR #73. JS 구문 파싱 및 노출 경로/버튼 구조는 확인함. **실제 유료 STT 호출, iPhone Safari, 대량 1,128개 처리, 실제 Supabase 곡 메타데이터 저장까지의 종단 간 테스트는 진행되지 않았음.** 테스트용 소수 파일로 먼저 확인하고 충분히 검증한 뒤 전체를 실행.

## iPhone Safari 메모리 보호 (2026-11-06)

- `VZ.media.src(item)`로 R2 서명 URL 또는 로컬 blob URL을 읽음. 먼저 `<audio preload="metadata">`로 재생 시간을 확인해서 초장시간 음원을 불필요하게 다운로드·디코딩하지 않음.
- 80초 초과 또는 예상·실제 PCM 32MiB 초과 음원은 **아이폰에서 디코딩하지 않고 건너뜀**. 원본 용량은 별도 12MiB 상한. 긴 파일은 Mac 일회성 `tools/song_suggestions.py`의 FFmpeg 구간 추출 방식으로 분석할 수 있음.
- M4A의 앞 3~5MB를 무조건 Range로 자르지 않음. 컨테이너 인덱스 구조에 따라 오히려 재생 오류가 날 수 있음.
- 1개씩 순차 처리, 요청 취소용 AbortController, 파일 간 UI 양보, AudioContext 종료·blob URL revoke, 로컬 완료 결과 캐시 및 선택 목록 체크포인트 추가.
- **제약:** 이 경로는 짧은 파일에 대해서는 여전히 전체 디코딩을 수행함. 실기기 메모리 프로파일·20개 연속 분석 테스트는 남아 있으며, **5분 녹음의 30초 서버 구간 추출 기능은 구현하지 않음**. 대량 마이그레이션 전 해당 분기 개선 또는 Mac 실행이 필요.


## 3~5분 R2 녹음: Cloudflare 서버에서 30초 구간만 추출 (추가 구현)

**개발 코드:** `r2-worker/src/index.js`의 인증된 `GET /v1/clip/u/<uid>/<mediaId>/original.m4a?time=20&duration=30` 엔드포인트. `r2-worker/wrangler.toml`에 `[media] binding = "MEDIA_TRANSFORM"` 추가. 기존 R2 바인딩 `MEDIA`와는 다른 별도 바인딩.

- Worker가 사용자 JWT를 검증한 뒤 해당 사용자 소유 R2 원본을 **읽기만 함**.
- Cloudflare Media Transformations의 `input(...).output({mode:"audio",time:"20s",duration:"30s",format:"m4a"})`를 통해 **Cloudflare 쪽에서 30초 M4A를 생성**, 브라우저에는 30초짜리 파일만 반환.
- 앱 `r2-storage.js`의 `VzipR2.clip(key)`가 bearer token으로 클립을 요청. `app/song-suggestions.js`가 `storageProvider:'r2'` 파일에서는 클립을 그대로 Supabase STT 함수로 전송함. **Safari에서 3분 파일 전체 다운로드/PCM 디코딩 안 함.**
- Supabase `vzip-song-stt` 함수는 WAV와 M4A를 모두 받도록 수정했고, 버전 2로 배포됨. **키가 없으면 비활성화/무과금** 상태임.
- 비-R2 또는 Cloudflare 변환을 지원하지 않는 파일은 자동으로 원본 전체 STT에 보내지 않음. (현행 80초/메모리 제한, 실패 표시.)

### 운영 준비

1. Cloudflare 계정에서 **Media Transformations beta binding** 지원 여부와 요금/사용량 확인.
2. 별도 브랜치를 검토해 Worker를 배포해야 `/v1/clip/`이 실제 사용 가능함. **GitHub PR만 만든 상태로는 Worker가 자동 배포되지 않음**. GitHub `.github/workflows/r2-worker.yml`은 현재 테스트 워크플로이며 배포가 아님.
3. 아이폰 Safari에서 실제 **3분짜리 M4A** 1개를 선택해 클립 다운로드 정상 여부 검증. Cloudflare Media Transformations 문서의 기본 지원 입력은 영상 MP4이며, **오디오 전용 M4A 변환은 실기기 검증 필요**. 미지원이면 서버 FFmpeg 기반 별도 변환이 필요함.
4. 3~5개 실파일로 가사 인식 및 기존 곡 후보 품질 검증, 20개 연속 안정성 테스트.
5. OpenAI 별도 API 프로젝트와 사용 한도, 서버 Secret 세팅 후 사용자 승인한 파일만 STT 실행. 완료 시 `STT_ENABLED=false`.

### 주의

Cloudflare media transform API 자체도 무료라고 단정하지 마세요. 베타 제한, 계정 플랜, 트랜스폼 사용량에 따라 과금 정책이 변경될 수 있습니다. **API 키 설정·실파일 검증·Worker 배포 전까지 실제 STT 기능은 사용 불가**.
