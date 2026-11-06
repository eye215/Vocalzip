# VOCAL.zip — 실제 저장 형식과 STT 30초 추출

2026-11-06 확인. 실제 서비스 DB에서는 `vocal_media.metadata`의 MIME과 R2 파일 확장자를 집계함. 개인정보/원본 음성 내용은 읽지 않음.

## 실제 클라우드 파일 형식
- R2 `.m4a` + `audio/x-m4a`: **434건**
- R2 `.m4a` + `audio/mp4`: **252건**
- R2 키 미기재 + `audio/mp4`: **176건** (기존 클라우드 파일: R2 clip API 사용 불가)
- 총 **862건**, 이 시점 R2 M4A **686건**.
- source: `voice-memo`, `photos`, `icloud-drive` 등. `audioExtraction` 메타데이터를 가진 항목 다수.

## 저장 파이프라인 (코드 기준)
| 원본 | 가져오기 시 처리 | R2 저장 형태 |
| --- | --- | --- |
| iPhone Voice Memos M4A | 보통 오디오 스트림 그대로. PCM WAV만 조건부 FLAC | 원본 M4A (audio/x-m4a 또는 audio/mp4) |
| Photos/iCloud MOV, MP4 등 영상 | `audio-extract-worker.js`에서 영상 제거, 오디오 패킷 비트 복사 | 코덱과 컨테이너 호환 시 AAC→M4A, 또는 WAV/WebM |
| WAV | 샘플 동등성을 재검증할 수 있는 기기에서만 선택적으로 FLAC 무손실 압축 | FLAC 또는 WAV |
| MP3, AAC, WebM, FLAC 등 | 기본적으로 재인코딩 없이 보존 | 해당 확장자/형식 |
| 웹에서 직접 녹음 | MediaRecorder가 지원하는 audio/mp4 또는 audio/webm 등 | 해당 브라우저가 만든 형식 |

## 30초 STT 경로
1. `audio-only M4A` 등은 Cloudflare의 영상 입력 변환기에 강제로 보내지 않음.
2. R2에 저장된 **원본을 변경하지 않고**, 사용자 전용 서명 URL로 HTTP Range 접근.
3. Mediabunny `UrlSource + AudioBufferSink`로 20초부터 최대 30초만 디코딩.
4. 16 kHz 모노 PCM WAV로 변환하여 Supabase STT 함수에 업로드.
5. 오디오 코덱이 브라우저에서 지원되지 않으면 **유료 API 호출 이전**에 실패 안내.
6. `.mp4` 영상 컨테이너는 Cloudflare Media Transformations로 먼저 30초 추출; **415/422 형식 미지원 응답일 때만** Range 방식으로 대체.
7. `401/403/503` (권한·비활성화) 등 보안 오류에서는 대체 경로로 우회하지 않음.
8. R2 저장 파일이 아닌 기존 클라우드·기기 녹음은 기존 80초 이내 메모리 제한 경로 유지.

## 남은 검증
- iOS Safari 26 + Chrome iOS 26에서 실제 **3~5분 M4A**의 Range/AudioDecoder/30초 WAV 생성 확인.
- AAC(영상 추출), 원본 Voice Memo AAC 등 2개 이상의 샘플 검증.
- 재생 길이, 30초 요청 데이터량, 가사 인식 성공 여부, 원본 무변경 확인.
- 변환 실패/중단/권한 오류 시 **OpenAI 사용량이 늘지 않는지** 확인.
- 변환 전 단계는 무료지만 R2 대역폭/요청 및 Cloudflare 사용량에는 별도 비용이 발생할 수 있음.

관련 코드: `audio-extract-worker.js`, `app/media.js`, `r2-storage.js`, `stt-clip-browser.mjs`, `app/song-suggestions.js`.
