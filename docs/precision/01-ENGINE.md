# 정밀 발성 엔진 1 — 조사·알고리즘·계약

조사 기준 main `5600a16` (2026-11-16). 구현·합성 신호 검증·운영 검증은 별개다. 이 PR은 배포·DB·작업 큐를 변경하지 않는다.

## 기존 구현 재사용

| 영역 | 실제 코드와 계약 |
|---|---|
| F0 | `app/vocal-analysis.js` v2: 8kHz, 512 sample Hann 창, 80 sample/10ms hop, 75–1100Hz 배음 합산·Viterbi·자기상관 검증·옥타브 보정. 결과 곡선 20Hz. 새 모듈은 이 결과를 그대로 재사용한다. |
| 음정·음역 | 반음/A440 또는 검출된 MR 튜닝 기준. 유효 음 0.2초/confidence .8, 안정 음 0.5초/.8/60cent 조건. 악보 없는 음정 정확도는 선율의 정답 정확도가 아니다. |
| 비브라토 | 기존 `vibratoOf`, 변조 주파수·진폭·규칙성 및 지속음 비율. 새 계산으로 대체하지 않는다. |
| 추가 기존 분석 | `voice-path-model.js` vp-0.2, 16kHz/20ms 자기상관, centroid·octave-band tilt·2–4k/0.1–2k 에너지비·HNR·지속음·onset·끊김. 새 모듈은 시간별 복합 변화와 표준 과제용 고해상도 원본 스펙트럼을 별도 계약으로 제공한다. 해당 모듈은 수정하지 않는다. |
| 저장 | 원본 IndexedDB `vocalzip_media_v1`/R2. 기존 `analysis`는 녹음 metadata, 재분석 history 최대 5. 새 결과는 **다른 namespace**에서 원본 hash·버전·조건과 함께 저장할 연결 명세이며 기존 `analysis`를 쓰지 않는다. |
| 서버 | `worker/analysis-worker.mjs`: Node+ffmpeg, 동일 v2 모듈, 15분 한도, 분석 job. `worker/separation-worker.mjs`: Demucs 분리 후 동일 v2. 이 PR은 서버 스케줄·유료 STT·DB를 호출하지 않는다. 새 CLI도 ffmpeg와 기존 v2를 사용한다. |
| 성장 | `growth-metrics-model.js`, `growth-range-model.js`, dataset: 버전·신뢰도·유효 구간·종류별 포함 판정. 기존 파사지오는 음정 변화 기반의 참고치이며 생리학적 확정값이 아니다. 새 시간별 복합 탐지는 별도다. |
| UI | `vocal-lab.js` 다크 연구소, 밝은 growth-hub·결과 리포트·voice-path. 최신 디자인 3.51 및 11/16 변경 이력 확인. 연결은 새 모듈로 수행하고 연구소·core·cloud-sync는 수정하지 않는다. |
| 캐시 | 기존 current analysis v2/detail, voice-path 기기 캐시. 새 캐시는 원본 revision·엔진·조건·파라미터가 모두 일치해야 재사용한다. |

진행 PR: #441은 analysis.js, vocal-analysis.js, voice-path, MR·R2 로더, index와 디자인 문서를 수정한다. #403은 cloud-sync와 index 수정. 해당 엔진/로더/보호 파일은 이 작업에서 수정하지 않는다. 후속 UI의 index **추가 script/link**와 디자인 문서 추가 절은 충돌 가능 구간이다.

## 신규 실제 계산

- 원본 PCM 64ms Hann 창, 50ms hop, 2배 이상 zero padding. F0 mask는 기존 20Hz curve에서 읽는다. 스펙트럼을 8kHz pitch PCM에서 만들지 않는다.
- A06 RMS dBFS, A07 power centroid, A08 85% power rolloff, A09 octave-band power OLS dB/octave, A13 1–5kHz / 50–1000Hz alpha ratio 및 네 주파수 대역 에너지 비율.
- A12 H1-H2: F0·2F0 주변 peak power 비. **포먼트 보정 전**으로만 표시. 두 번째 배음이 floor 아래면 null.
- A10 HNR: fractional pitch-period normalized waveform correlation r의 `10log10(r/(1-r))`. 음원·창·F0 의존. Praat HNR와 상호 교환하지 않는다.
- A11 CPP: ln magnitude real cepstrum, F0 quefrency ±15%의 최대값에서 1–16ms OLS baseline을 뺀 값. 단위 **log-amplitude cepstral units**. Praat CPP/CPPS dB와 동일하다고 표시하지 않는다.
- A14/A15: 지정 sustain/steady 과제, 1초 이상·pitch band 20cent 이내·고신뢰·깨끗한 신호의 연속 segment만 fractional upward zero crossings의 cycle-local period 및 peak-to-peak 차이. noisy crossings, 비브라토·사이렌·노래·부족한 cycle은 보류. 임상 jitter/shimmer와 동등성은 미검증.
- 기존 안정성, 실제 유성 run 길이, 전체 voiced pitch OLS drift, RMS SD, 프레이즈 후반 pitch/energy 변화, 무성 휴지 **후보**. 휴지는 호흡 확정값이 아니다.

## 신뢰도와 한계

`metrics[key]={value|null,unit,confidence,reasons,algorithm}`. high는 품질 조건 충족을 뜻하며 임상적 정확도를 뜻하지 않는다. 개별 신규 주기성 지표는 현재 보수적으로 medium까지만 준다. 임의 confidence 백분율을 만들지 않는다. `quality`에는 clipping share, voiced/valid frame ratio, 기존 F0 confidence와 보류 이유가 있다. noise reference 없는 SNR는 null이다. 깨끗함은 음향으로 확정하지 않으며 source 선언과 별개로 신호 품질도 검사한다. mixed/unknown/separated의 HNR·CPP·H1-H2·perturbation은 보류. 분리 왜곡을 정량 검증하지 않았으므로 Demucs 결과를 깨끗한 원음으로 승격하지 않는다.

데이터: kind/schemaVersion/engineVersion/analyzedAt/source(id,revision,rate,duration)/context/parameters/algorithms/scope/metrics/frames/limitations/cost. 범위·단위·버전이 다른 값은 비교 불가. 기존 요약과 PCM은 불변. 실패·중단은 결과를 저장하지 않는다. 재생성은 새 버전 결과로 append하며 기존 결과를 덮어쓰지 않을 후속 저장 계약을 사용한다.

## 검증 및 비용

`node --test tests/precision-acoustics.test.cjs`: 새 파일이 없는 상태의 실패를 먼저 확인했고 구현 후 12개 통과. 사인·알려진 배음 6.02dB·noise·mixed·separated·silence·short·clipping·기존 결과 불변·취소·캐시 revision 검증. 추가 기존 pitch 회귀는 PR 검사 결과 참조.

브라우저는 worker에서 최대 60초 **명시적 구간**. CLI도 60초 초과를 조용히 자르지 않고 거부한다. 오디오 전체를 다시 부르는 자동 무제한 작업은 없다. 유료 API 0회. `cost.elapsedMs`로 측정하며 장비·파일별 실제 시간을 보고한다. 메모리는 PCM·기존 pitch·한 frame FFT와 요약 frame 배열, 무한 spectrogram 저장 없음. iPhone Safari/PWA 실제 마이크·속도·메모리 미검증.

임상/실제 성구 전환 gold dataset은 미확보. EGG 접촉지수, TA/CT 활성도, 점막파동, 후두 mm, 공기유량·압력·효율·질병은 계산하지 않는다. 검증 전에는 의료적 혹은 생리학적 수치로 승격할 수 없다. 공개/동의된 동일 과제 dry voice+EGG/전문가 라벨 자료로 추후 보정해야 한다.
