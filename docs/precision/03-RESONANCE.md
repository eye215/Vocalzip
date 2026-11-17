# 공명·음색의 측정 가능한 범위

main `5600a16`에서 독립 분기. 새 모듈 `app/precision-resonance.js`는 mono PCM·sample rate·이미 측정한 frame F0/신뢰도·명시한 모음 조건을 받는다. PR1 centroid/tilt/alpha/frame을 재사용하고 기존 소리 길 흔적 또는 v2 pitch를 수정하지 않는다.

알고리즘: 80ms 창, preemphasis .97 + Hann, autocorrelation LPC/Levinson–Durbin. 차수 18과 20 각각의 LPC envelope를 10Hz 간격으로 평가해 180–5000Hz의 첫 세 공명 peak와 -3dB bandwidth를 찾는다. 이는 Praat Burg/complex-pole formant와 같은 알고리즘이라고 주장하지 않는다. 두 차수의 추정이 160Hz 이상 다르거나 25–300Hz bandwidth 조건을 통과하지 못하면 보류한다. 모든 기준값은 export한다. 단위 Hz, 중립 confidence medium. **자연 음성에서 정확도는 미검증**이다.

보류: 16kHz 미만, F0>300Hz 또는 F1<2F0(배음 표본 희소), 알려지지 않은 모음, 약한 주기성, clipped/짧은/무음·부적절한 LPC, mixed·unknown·분리 음원. F0가 높다고 보간한 포먼트를 만들지 않는다. ‘앞으로 울린 비율’, 후두 높이·성도 길이·TA/CT·접촉률은 출력하지 않는다.

결과는 모음별 F1/F2 분포점·시간별 F1/F2/F3/centroid/tilt/alpha·개인 관측 음역을 3등분한 음역별 요약이다. 특정 성구의 저/중/고 경계를 의미하지 않는다. 높은 음의 null도 시간열에 남겨 공백을 표시한다. PR5가 실제 SVG·spectrogram을 렌더링한다.

비교는 동일 owner/task/vowel/environment/loudness와 엔진 버전, ±1반음/3dB 안의 측정만 허용한다. 누락 조건도 보류. 비교 가능한 경우에도 값의 차이만 내며 좋음/나쁨 판정은 null이다. 같은 스마트폰이어도 AGC·거리·방 반향이 달라지면 환경을 같다고 가정하지 말아야 한다.

검증: 구현 부재 실패 확인 → LPC 구현 → 합성 vowel의 known resonator peak 복원. 5개 테스트(2개 모음 분리, 허용 오차160Hz, 고 F0·혼합/분리·unknown vowel·silence·short·8kHz 보류, frame/음역별 null 보존, 비교 조건) 통과. 합성 신호는 알려진 80Hz bandwidth all-pole resonator를 cascade한 120Hz harmonic source다. 실제 사람의 모음·다중 마이크·반주 dataset에서 Praat reference와 오차/coverage 평가를 추가해야 한다. 실기기·운영·배포는 미검증/미실행이다.
