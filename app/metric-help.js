/* VOCAL.zip 측정값 설명 시트 (Phase 10-3): an ⓘ next to a measurement opens what it measures, how to read it and its
 * limits. Wording follows the measurement definitions in app/vocal-analysis.js. Any element with
 * data-metric-help="<key>" opens it. */
(() => {
'use strict';
const VZ = window.VZ;
if (!VZ) return;
const esc = VZ.esc;
const HELP = {
  into:{title:'음정 정확도 (음정 오차)', what:'0.3초 넘게 낸 음이 가장 가까운 반음에서 평균 얼마나 벗어났는지예요. 반음 하나 = 100 cent.',
    read:['±10 cent 안팎: 매우 정확', '±20 cent 안: 대부분의 귀에 맞게 들림', '±25 cent 이상: 음이 뜨거나 처지게 들릴 수 있음'],
    note:'반주(MR)가 들리면 반주의 튜닝을 기준으로 재요. 일부러 꾸민 음(벤딩·슬라이드)도 오차로 잡힐 수 있어요.'},
  wob:{title:'음정 안정성 (지속음 흔들림)', what:'0.5초 넘게 길게 낸 음에서 비브라토를 뺀 뒤 남는 음높이 흔들림이에요.',
    read:['±5~8 cent: 안정적', '±12 cent 이상: 호흡·지지가 흔들릴 수 있음'],
    note:'비브라토는 따로 재서 빼요. 짧은 음이 많은 곡은 측정할 음이 적어 값이 덜 정확해요.'},
  vib:{title:'비브라토', what:'긴 음에서 주기적으로 음높이가 오르내리는 정도예요. 속도(초당 횟수), 폭(±cent), 규칙성, 긴 음 중 비율을 봐요.',
    read:['속도 초당 5~7회, 폭 ±30~60 cent가 흔한 범위', '규칙성이 높을수록 고르게 흔들림', '비율은 스타일에 따라 달라서 높고 낮음에 정답은 없어요'],
    note:'뮤지컬 넘버는 곡과 장면에 따라 비브라토를 일부러 줄이기도 해요.'},
  range:{title:'음역 (최고음)', what:'유효 최고음은 0.2초 이상, 안정 최고음은 0.5초 이상 지속되며 신뢰도·연속성 조건을 통과한 음이에요(안정은 비브라토를 뺀 흔들림도 작아야 해요). 주 가창 음역은 노래한 시간의 10~90백분위입니다. 순간 최고음은 한 순간의 값이라 미끄러짐·오검출을 포함할 수 있어 평가에 쓰지 않아요.',
    read:['곡의 최고음을 안정적으로 머물며 낼 수 있는지 볼 때 써요','분석 화면·보컬랩에서 최고음 시각을 누르면 1초 전부터 재생돼요. 직접 들어 보고 확인하세요','최고음 하나만으로 실력이 늘었거나 줄었다고 판단하지 않아요'],
    note:'곡에 나오지 않는 음은 잴 수 없어요. 그래서 음역이 좁게 나와도 실제 음역이 좁다는 뜻은 아니에요.'},
  phr:{title:'호흡 유지 (프레이즈 길이)', what:'쉬지 않고 이어 부른 구간의 길이예요. 성장 비교에서는 같은 곡의 같은(위치·음높이가 비슷한) 프레이즈끼리 지속시간을 비교하고 템포 차이를 보정해요.',
    read:['같은 프레이즈가 3개 이상 맞아야 비교해요. 못 찾으면 판정 보류', '곡의 프레이즈가 짧으면 값도 짧게 나와요', '더 길다고 무조건 더 좋은 호흡은 아니에요'],
    note:'반주가 커서 목소리가 묻힌 부분은 끊긴 것으로 잡힐 수 있어요. 이전 분석(v1)과 세부 측정이 없는 분석은 다시 분석해야 비교할 수 있어요.'},
  high:{title:'고음 안정성', what:'곡의 고음 구간(악보 기준 음역이 있으면 악보 최고음 아래 2반음부터, 없으면 주 가창 음역 상단부터)에서 0.5초 넘게 지속한 음의 흔들림과 평균 유지시간이에요.',
    read:['두 녹음의 같은 고음 구간끼리 비교해요', '흔들림이 줄고 유지시간이 늘면 좋아진 방향, 서로 엇갈리면 변화 혼재', '키를 바꿔 불렀거나 고음 지속음이 2개 미만이면 판정 보류'],
    note:'최고음이 올라갔는지는 보지 않아요. 고음을 일부러 짧게 끊는 곡이나 해석 차이도 결과에 영향을 줘요.'},
  pass:{title:'파사지오 (전환 구간) · 참고', what:'음높이별로 지속음 흔들림을 비교해 흔들림이 유난히 커지는 음역대를 보여 줘요.',
    read:['음정 데이터만으로 판별 불가, 선생님 판단 참고', '좋아짐·나빠짐을 판정하지 않아요', '여러 음높이의 지속음이 4개 음 이상 있어야 보여 줘요'],
    note:'성구 전환은 음색·공명·근육 사용이 함께 바뀌는 현상이라 피치 흔들림만으로 알 수 없어요. 레슨에서 선생님과 확인하세요.'},
  reliable:{title:'측정 신뢰도', what:'노래한 시간이 10초 이상이고, 반주에 묻히지 않고 v2의 피치 신뢰도 조건도 충족할 때 비교에 써요. 이 조건만으로 보컬 분리가 확정되지는 않아요.',
    read:['신뢰도가 낮은 녹음은 그래프에서 흐리게 보이고, 추천·비교 기준에서 빠져요'],
    note:'휴대폰을 입 가까이, 반주는 작게 두고 녹음하면 측정이 정확해져요.'}
};
VZ.metricHelp = key => {
  const h = HELP[key]; if (!h) return;
  VZ.sheet({title:h.title, body:'<div class="stack metric-help"><p style="margin:0">' + esc(h.what) + '</p>' +
    '<div class="card flat"><b class="small">이렇게 읽어요</b><ul class="small" style="margin:6px 0 0;padding-left:18px">' + h.read.map(r => '<li>' + esc(r) + '</li>').join('') + '</ul></div>' +
    '<p class="small muted" style="margin:0">' + esc(h.note) + '</p><p class="small muted" style="margin:0">측정값은 연습을 돕는 참고 자료예요. 목소리의 좋고 나쁨을 판정하지 않아요.</p></div>'});
};
VZ.metricInfo = (key, label = '') => '<button type="button" class="info-btn" data-metric-help="' + esc(key) + '" aria-label="' + esc((label || HELP[key]?.title || '') + ' 설명') + '"><i class="ph ph-info"></i></button>';
document.addEventListener('click', e => { const b = e.target.closest('[data-metric-help]'); if (!b) return; e.preventDefault(); e.stopPropagation(); VZ.metricHelp(b.dataset.metricHelp); });
})();
