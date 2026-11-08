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
  wob:{title:'지속음 흔들림', what:'0.5초 넘게 길게 낸 음에서 비브라토를 뺀 뒤 남는 음높이 흔들림이에요.',
    read:['±5~8 cent: 안정적', '±12 cent 이상: 호흡·지지가 흔들릴 수 있음'],
    note:'비브라토는 따로 재서 빼요. 짧은 음이 많은 곡은 측정할 음이 적어 값이 덜 정확해요.'},
  vib:{title:'비브라토', what:'긴 음에서 주기적으로 음높이가 오르내리는 정도예요. 속도(초당 횟수), 폭(±cent), 규칙성, 긴 음 중 비율을 봐요.',
    read:['속도 초당 5~7회, 폭 ±30~60 cent가 흔한 범위', '규칙성이 높을수록 고르게 흔들림', '비율은 스타일에 따라 달라서 높고 낮음에 정답은 없어요'],
    note:'뮤지컬 넘버는 곡과 장면에 따라 비브라토를 일부러 줄이기도 해요.'},
  range:{title:'음역 (최고음)', what:'0.3초 넘게 머문 음 중 가장 낮은 음과 가장 높은 음이에요. "순간 최고"는 아주 짧게 스친 음까지 포함해요.',
    read:['곡의 최고음을 안정적으로 머물며 낼 수 있는지 볼 때 써요'],
    note:'곡에 나오지 않는 음은 잴 수 없어요. 그래서 음역이 좁게 나와도 실제 음역이 좁다는 뜻은 아니에요.'},
  phr:{title:'프레이즈 길이', what:'쉬지 않고 이어 부른 구간의 길이예요. 평균(중앙값)과 가장 긴 구간, 숨 쉰 시간을 봐요.',
    read:['평균 4초 이상이면 긴 프레이즈를 잘 이어 가는 편', '곡의 프레이즈가 짧으면 값도 짧게 나와요'],
    note:'반주가 커서 목소리가 묻힌 부분은 끊긴 것으로 잡힐 수 있어요.'},
  reliable:{title:'측정 신뢰도', what:'노래한 시간이 10초 이상이고, 목소리가 반주보다 3dB 이상 크게 녹음됐을 때만 믿을 만한 측정으로 써요.',
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
