# 실제 구현과 시안의 대응

| 화면 | 기준 코드 | 보존한 실제 구조 | 변경 |
| --- | --- | --- | --- |
| 내 곡 | app/views-main.js, app/repertoire.js | 배역 검색·4종 정렬·레퍼토리 상태·나의 공연 | 루트 뒤로 없음, 정보 위계·포인트 |
| 곡 상세 | app/views-main.js, app/repertoire.js, app/scores.js | 6개 탭·레퍼토리·키·숙련도·대표 테이크·녹음/기록/비교 | 제목/메타·보조 액션 스타일 |
| 보관함 | app/views-more.js, app/library-select.js | 용도·형식·곡 필터·월 그룹·선택·행 확장 | 루트 뒤로 없음, 보관함 탭 선택 수정 |
| 일정 | app/views-lessons.js, app/calendar-summary.js | 월간 요약·달력·하루 기록·연결 녹음 | 루트 뒤로 없음, 달력 선택/요약 강조 |
| 레슨·상세 | app/views-lessons.js, app/billing-lessons.js | 상태·복수곡·시간·장소·선생님·피드백·숙제·정산 연결 | 공통 카드·텍스트·시트 |
| 연습 기록 | VZ.practiceSheet / practiceDetail | 곡/트레이닝·분·평가·숙제 반복·메모·미디어 | 별도 페이지를 발명하지 않음 |
| 녹음 | app/views-main.js, app/media.js | 기존 녹음·검토·저장 UI 흐름 | 플로팅 진입/닫기/네비 숨김, 시안용 무음 |
| 나의 공연·상세 | app/repertoire.js | 작품·배역·공연일·회차·곡 연결·상태 | 기존 필드 보존 |
| 성장·비교 | app/views-more.js | 기간·월·곡·측정항목·녹음 비교·메모 | 공통 규격·색상 |
| 설정 | app/views-more.js | 계정·음원·기록·트레이닝·백업·정산 진입 | 실제 계정 대신 예시 안내. 디자인 시스템 없음 |

디자인 시스템은 이 README와 별도 DESIGN_SYSTEM.md로만 전달합니다. 사용자 앱 내부 화면 목록에는 포함하지 않습니다. 등록된 원본 경로는 route-inventory.json에서 확인할 수 있습니다.

별도 개발 중인 홈 PR #135는 main과 구분하며 이 패키지의 서브페이지 기준은 위 고정 main 커밋입니다. 승인 홈의 최근 디자인은 미리보기 연결층에서 유지합니다. 실제 서비스 적용은 본 패키지 업로드와 구분합니다.
