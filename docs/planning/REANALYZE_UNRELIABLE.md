# 판정 보류 녹음 재분석

운영 적용 전 소유자 승인 필요. 이 PR에서는 운영 dispatch를 실행하지 않는다.

- Analysis worker의 `reanalyze_unreliable=true`는 **미리보기**다. `reanalyze_apply=false`가 기본이며 DB·큐·미디어를 변경하지 않는다.
- `reanalyze_limit`는 1–500, 기본 50이다. 로그에는 건수만 표시한다.
- 승인 후 `reanalyze_apply=true`로 실행하면 해당 건수만 기존 vocal 큐에 등록한다. 이 dispatch는 음원 분석·STT·추가 workflow 실행을 하지 않는다. 이후 일반 예약 worker가 큐를 처리한다.
- 대상은 현재 버전/상세 분석이 있고, `reliableResult=false`이며, 소유자 저장 경로가 남은 오디오/비디오다. 이미 분리 대기 중인 녹음·실행 중인 큐는 제외한다.
- 캠페인과 원 분석 fingerprint를 기존 job.result에 보관한다. 동일 원 분석에 대한 중복 등록·실패 작업 초기화를 방지한다. 처리 시 원 분석이 바뀌었으면 재사용하며 사용자 편집을 우선한다.
- 성공한 새 분석은 이전 history 전체와 직전 결과를 보존한다. 여전히 보류이고 MR 제거 결과가 없으면 `scope.separationWanted`로 분리 worker에 연결한다. 분리 결과에서도 history와 캠페인 표식을 보존한다.
- 테이블·마이그레이션·원본 파일·곡 연결은 변경하지 않는다.

검증은 합성 음원, 로컬 R2/STT 대역, 폐기 가능한 localhost PostgreSQL만 사용한다. 실제 저장소 접근 가능 여부와 실제 녹음의 분리 품질은 운영 검증으로 별도 확인해야 한다.
