# 성구 전환 관련 음향 변화 후보

main `5600a16`에서 독립 분기. `app/precision-transitions.js`는 시간순 frame 배열을 받는 순수 모델이며 기존 pitch 기반 파사지오 참고치를 교체하지 않는다. PR1 결과의 `frames`를 그대로 받을 통합 지점이다. 독립 적용 시 기존 UI·분석은 변하지 않는다.

계산: 경계 앞/뒤 300ms의 median 차이를 local MAD 3배 및 지표별 effect floor와 비교하는 robust window change-point detection. F0 진행 방향을 별도로 산출하되 F0 jump 자체는 trigger가 아니다. H1-H2/tilt/centroid의 spectral 계열과 HNR/CPP의 periodic 계열 모두, 합계 3개 이상이 같은 위치에서 변화해야 한다. 800ms suppression 중 effect가 가장 큰 시점을 남긴다. 모든 threshold를 export한다. 보류된 frame·혼합/분리/출처불명 음원·level 3dB 초과 변화·명시적 모음 변화는 제외한다. 모음 통제가 없으면 confidence low와 제한사항을 붙인다. 숨겨진 모음 변화를 음향만으로 완전히 구분할 수 없다.

출력: 시작/끝·최대 변화 시점, 실제 Hz/음이름·주변 음역, 상/하행, 지표별 전후 값/변화량/단위/threshold, normalized effect strength(점수나 확률 아님), confidence·한계. 생리학적 classification은 항상 null. M1/M2, TA/CT, 후두 위치를 판정하지 않는다. ‘변화가 적다’가 ‘좋다’는 의미도 아니다.

반복: up/down 과제를 분리해 ±1반음 이내 후보를 cluster하고 같은 trial을 한 번만 센다. 후보가 없는 유효 trial도 분모에 포함한다. 유효 trial ≥3 및 절반 이상에서 관찰될 때에만 재현성 flag. 실패 trial은 별도로 보고한다.

검증: 모듈 부재 실패 후 테스트 작성·구현. 연속 glide/단순 pitch jump/level-only, 동시에 변하는 spectral+periodic, 모음·음량 confound, 무효 frame, 상/하행, 모음 미통제, 3회 중 2회, mixed·separated·누락 지표를 합성 frame으로 검사한다. 이 단위 검증은 실제 성구 전환 정답 검증이 아니다. 실제 전환 참고 녹음/전문가·EGG 라벨은 확보하지 못했으며 민감도·특이도는 주장하지 않는다. 후속 통합 검증에서 합성 PCM→PR1→본 모듈도 확인한다. 운영·iPhone 검증·배포 없음.
