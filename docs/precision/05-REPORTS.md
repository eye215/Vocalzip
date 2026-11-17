# 정밀 리포트·성장·AI 연결

main `5600a16` 기준 독립 PR5. 1–3의 엔진 파일을 이 PR에 복사하지 않는다. 1–3 적용 전에도 리포트의 빈 상태·기기 보관·비교 모델을 검증할 수 있고, 엔진이 없으면 분석은 실패 안내를 내며 기존 결과를 건드리지 않는다. PR4는 표준 측정 화면이며 `VZ.precisionAnalyze` hook으로 연결한다. PR1–3과의 실제 결합 검증은 `VALIDATION.md` 참조.

## 연결과 보존

- `precision-analysis.js` → 기존 media.src의 원본 **읽기만** → 16kHz OfflineAudioContext decode → 별도 worker. 기존 8kHz pitch 엔진을 그대로 재사용하고 원래 `analysis`·history·원본을 쓰지 않는다.
- `precision-report-worker.js`: PR1의 full result에 PR2 전환 후보와 PR3 공명 특성을 추가. 실패·abort 후 저장하지 않는다.
- `precision-result-store.js`: 새 IndexedDB `vocalzip_precision_v1/results`. 기존 media DB를 열거나 upgrade하지 않는다. owner를 모든 get/list/cache에 적용, add만 사용하고 update/delete는 없다. 결과 버전·원본 SHA256·엔진/문맥/구간 캐시 키가 같으면 재사용. force 재계산은 새 ID로 보존한다. 클라우드 동기화·백업이라고 표시하지 않는다.
- 리포트는 성장 → 보컬 분석 및 연구소의 새 진입 행, 직접 `#/precision-report`. 기존 과제를 통한 녹음은 PR4 링크로 연결한다. 잠겨 있는 `vocal-lab.js`, `core.js`, `cloud-sync.js`는 수정하지 않는다.
- 일반 녹음은 실제 분석 가능한 F0·음정·음역·비브라토·기록 스펙트럼을 유지. 깨끗함을 확인하지 않으면 CPP/HNR/H1-H2/포먼트는 보류한다. 기존 Demucs·MR 제거 결과를 원래 PCM의 깨끗함으로 자동 승격하지 않는다.
- 자동 분석은 기존 `vzip:analysis-saved`를 따른 **opt-in** `VZIP_PRECISION_AUTO_ANALYSIS_ENABLED===true`. 60초 이하 파일 한 개, 단일 실행, 조건 unknown. 기본 꺼짐이며 대량 기존 파일 재분석·운영 데이터 변경을 실행하지 않는다.

## 화면·비교

공통 밝은 화면 토큰·R20 카드·52px 폼·44px 탭을 재사용. 종합/전환/공명·음색/안정성/음역별/이전비교 6영역. 실제 frame의 시간선, F1/F2 분포, 시간별 F1/tilt/HNR/RMS, 스펙트로그램을 SVG로 표시한다. null은 선을 잇지 않는다. 스펙트럼 색은 상대 FFT power이며 보정된 SPL 또는 dBFS가 아니다. individual metric value/unit/confidence와 알고리즘·제한사항을 각각 볼 수 있고 결과 JSON도 내보낼 수 있다.

성장: 같은 owner·task·vowel·source·microphone/environment·loudness·알고리즘·파라미터·유사 scope/음높이/상대음량만 비교. 다른 조건은 이유와 함께 보류하고 좋음/나쁨 판단은 null. 서로 다른 녹음 날짜가 세 번 이상이어야 Theil–Sen 추세를 표시하며 재분석 날짜로 성장 표본을 늘리지 않는다. 원본 revision 중복 제외. 주/월/곡/과제별 집계에서도 조건이 다른 cohort를 합치지 않는다. 반복 사이렌은 같은 measurementId의 최신 trial만 PR2의 상·하행 recurrence로 전달한다.

## AI 서버 소스, 미배포

새 `supabase/functions/vzip-precision-coach`는 기존 NVIDIA provider와 기존 소유자 권한 계약을 재사용한다. 기존 함수에 지원하지 않는 지표를 보내거나 mode를 위장하지 않는다. `auth/v1/user`로 JWT 검증, STT_ALLOWED_USER_IDS allowlist 및 기존 `vzip_ai_owner_allowed` RPC가 true일 때만 provider 호출. service role은 없다. DB 스키마/마이그레이션 없음.

요청 16KiB 한도, 지표 allowlist·유한 수치·단위·실제 측정 상태·전후 delta 일관성·최대8구간 후보·조건·제한사항만 정규화한다. 이름/owner/media ID/원음/임의 prompt는 전달하지 않는다. 모델 응답은 측정 key 인용을 요구하고 수치와 생리학/질환 주장을 거절한다. 이 검사는 문장 의미의 완전한 과학 검증을 대신하지 않으므로 연구용 해석으로만 제공한다. 30초 provider timeout, max1200 output tokens, 원본/결과 쓰기 없음. 기존 비밀키는 서버 환경에서만 읽는다. 실제 API 호출·비용 청구는 실행하지 않았다. 유료 사용량의 서비스 전체 budget/rate-limit 원장은 이 PR 범위에 없으므로 운영 활성화 전에 별도 검토가 필요하다. 클라이언트 기본 `VZIP_PRECISION_COACH_ENABLED`는 꺼져 있고 미활성화 안내를 표시한다.

Supabase 조사: 2026-11-16 changelog 및 Edge Functions auth 문서 확인. 11/10 TLS 1.2 cipher 일부 폐기 공지 확인; 새 코드는 기본 플랫폼 TLS와 서버 `fetch` 사용, 구형 cipher 고정 없음. 인증은 저장소의 현재 직접 JWT 검증 계약을 따르며 새 wrapper 패키지를 추가하지 않는다. 인허가·oversize·비정상 AI는 오프라인 Request/Response 대역으로 검증했고 운영 auth/RPC 호출은 하지 않았다.

## 처리 한도·미완료 인수

브라우저 한 작업은 60초 이내 명시 구간, 원본 수신25MiB, decode 전 metadata 길이180초 한도, 전체90초 abort. 파일 decoder는 전체 파일을 읽으므로 긴 압축 파일의 streaming decode/server queue 연결은 남아 있다. 무거운 torchcrepe·Praat·Demucs를 iPhone에서 새로 실행하지 않는다. PCM·FFT·frame 및 기존 F0 계산만 사용한다.

실제 사람 음원·전문가/EGG reference·다중 마이크/AGC·clinical CPP/HNR·분리 artifact 정량 검증은 남아 있다. 실제 근육 활성/접촉률/점막/후두 높이/공기역학적 효율은 직접 측정 불가다. subharmonic event 확정·음소 자동 인식·절대 SPL·호흡량 계산도 구현하지 않는다. 추천 훈련은 보수적인 동일 과제 반복 및 편안한 음역에 한정한다.

실제 iPhone Safari/PWA는 미검증. WebKit 자동 실행도 이 Cloud host의 GTK/Graphene/WOFF/Harfbuzz/Hyphen/Manette/GLES 런타임 부재로 launch에서 막혔으며 Chromium을 Safari 검증으로 대체하지 않는다. 운영 배포·유료 호출·기존 데이터 변경 없음.
