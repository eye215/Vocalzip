// Fake data for the 성장 개편 phase-1 models (app/growth-dataset.js verdictRule, app/growth-changes-model.js periods,
// app/growth-next-model.js). Invented names and numbers only — no real recording, lesson or person.
const {v2} = require('./growth-characterization.fixture.cjs');

const TODAY = '2026-11-19';
/** A take as app/growth-dataset.js makes it. */
const take = (id, date, a, extra = {}) => ({id, songId:'s1', a, date, created:Date.parse(date + 'T20:00:00+09:00'), ok:true, ...extra});

/* Periods: October (previous) and November (this one). The song was sung in August, twice in October and twice in
 * November; the pair for November is the latest November take vs the latest October take. */
const SONG_TAKES = [
  take('aug', '2026-08-10', v2({into:40, wob:20})),
  take('oct1', '2026-10-05', v2({into:30, wob:20})),
  take('oct2', '2026-10-25', v2({into:26, wob:20})),
  take('nov1', '2026-11-03', v2({into:22, wob:20})),
  take('nov2', '2026-11-15', v2({into:12, wob:20}))
];
const NOV = {from:'2026-11-01', to:'2026-11-30'};

/* Records for 다음 연습 (app/growth-next-model.js). */
const DB = {
  songs:[{id:'s1', title:'연습곡 하나'}, {id:'s2', title:'연습곡 둘'}],
  assignments:[
    {id:'hw-late', title:'2절 호흡 표시하고 부르기', songId:'s1', status:'active', startDate:'2026-11-10', dueDate:'2026-11-28'},
    {id:'hw-soon', title:'립트릴 5분', songId:'', status:'active', startDate:'2026-11-10', dueDate:'2026-11-20'},
    {id:'hw-done', title:'끝난 숙제', status:'done', startDate:'2026-11-01', dueDate:'2026-11-30'},
    {id:'hw-past', title:'기한 지난 숙제', status:'active', startDate:'2026-10-01', dueDate:'2026-11-01'}
  ],
  dailyGoals:[
    // The same homework already put into today's goals: one item, chips 숙제 + 오늘 목표.
    {id:'g-hw', date:TODAY, title:'립트릴 5분', source:'homework', sourceId:'hw-soon', completed:false, order:0},
    {id:'g-own', date:TODAY, title:'가사 소리 내어 읽기', source:'personal', completed:false, order:1},
    {id:'g-done', date:TODAY, title:'끝낸 목표', source:'personal', completed:true, order:2},
    {id:'g-old', date:'2026-11-18', title:'어제 목표', source:'personal', completed:false, order:0}
  ],
  practicePlans:[
    // A monthly song plan running today.
    {id:'monthly-plan:p1', kind:'monthly-vocal', sourceMonth:'2026-10', songId:'s1', metric:'stability', segmentStart:62, segmentEnd:75, minutes:8, days:7,
      startDate:'2026-11-16', created:1, archived:false},
    // An AI 다음 연습 추천 draft whose action is the same as a running 반복 목표 → one item (반복 목표 ranks above AI).
    {id:'ai-review:2026-11-18:s1', period:'ai-review', date:'2026-11-18', songId:'s1', status:'draft',
      proposal:{action:'후렴 첫 구절 롱톤으로 이어 부르기', reason:'최근 기록에 호흡이 짧다고 적었어요', minutes:5, days:3, songId:'s1'}},
    {id:'routine:r1', kind:'routine', title:'후렴 첫 구절 롱톤으로 이어 부르기', songId:'s1', startDate:'2026-11-15', endDate:'2026-11-25', days:11, created:1},
    // Taken or skipped drafts, and an old one: not listed.
    {id:'ai-review:2026-11-17:week', period:'ai-review', date:'2026-11-17', songId:'', status:'skipped', proposal:{action:'건너뛴 초안'}},
    {id:'ai-review:2026-09-01:week', period:'ai-review', date:'2026-09-01', songId:'', status:'draft', proposal:{action:'오래된 초안'}},
    {id:'lab-ai', period:'ai-exercise', date:'2026-11-12', songId:'s2', tip:{key:'ai-x', name:'허밍으로 가사 없이 한 번', reason:'가사 발음에 힘이 들어가요'}, created:2}
  ],
  overallAiReports:[{id:'overall-ai:all', createdDate:'2026-11-17', note:'요약: 안정적이에요\n다음 연습: 5초 지속음 같은 조건으로 녹음하기\n보완할 점: 고음'}],
  monthlyAiReports:[{id:'monthly-ai:2026-10', month:'2026-10', createdDate:'2026-11-02', note:'다음 연습: 1. 립트릴 5분\n2. 낮은 음 허밍'}],
  scoreAnnotations:[
    {id:'point:a', kind:'score-point', songId:'s1', measures:{from:12, to:14}, text:'숨 미리 쉬기', created:1, updated:1},
    {id:'point:b', kind:'score-point', songId:'s1', measures:{from:20, to:20}, text:'모음 열기', created:2, updated:2},
    {id:'point:c', kind:'score-point', songId:'s1', measures:{from:30, to:31}, text:'끝음 길게', created:3, updated:3, retired:5},
    {id:'point-run:1', kind:'score-point-run', songId:'s1', date:'2026-11-10', at:10, results:{'point:a':'missed', 'point:b':'missed', 'point:c':'missed'}},
    {id:'point-run:2', kind:'score-point-run', songId:'s1', date:'2026-11-17', at:20, results:{'point:a':'missed', 'point:b':'kept', 'point:c':'missed'}}
  ],
  practices:[], lessons:[], deleted:{}
};
/** What 전체 분석 computed (app/overall-growth-model.js recommendations): one worse measure. */
const OVERALL = {recommendations:[
  {id:'stability', title:'음정 안정성', practice:'편안한 음에서 5초 지속음을 같은 조건으로 녹음하기', minutes:8, worsened:1}
]};
/** VZ.practiceTips(media) for the whole library: a tip on the same measure (one item with the above) and another. */
const TIPS = {enough:true, count:6, tips:[
  {key:'wob', name:'음정 안정성 (롱톤) 연습', metric:'지속음 흔들림', value:'±9 cent', basis:'최근 6개 중간값', minutes:8},
  {key:'phr', name:'프레이즈·호흡 연습', metric:'프레이즈 길이', value:'2.8초', basis:'최근 6개 중간값', minutes:8}
]};

module.exports = {TODAY, take, SONG_TAKES, NOV, DB, OVERALL, TIPS, v2};
