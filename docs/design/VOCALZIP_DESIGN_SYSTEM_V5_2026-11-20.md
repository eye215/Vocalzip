# VOCAL.zip Design System v5.0 (draft)

Status: **draft. Only rows marked with a date in the Built column are in the app.** Each section says which PR will build it. Update the "Built" column only in the PR that ships the change.

## Relation to earlier guides

- v5 keeps every visual rule of `VOCALZIP_DESIGN_SYSTEM_V4_2026-11-12.md` (tokens, radius, spacing, components, interaction states, wide-screen layouts). Those rules stay in force.
- v5 adds a clearer information structure (below) and a pass that removes duplicated component CSS.
- The 2026-11-09 guide stays as the long history. Where it disagrees with v4 or v5, v5 wins.

## Hard limits (unchanged)

- Stored data does not change: localStorage `vocal-zip_mvp_v1`, IndexedDB `vocalzip_media_v1` / `recordings`, Supabase `vocal_data.payload`, billing data.
- No new top-level list in the app record. New rows go into existing lists with their own `kind` and a stable `id`.
- Old routes keep working. A moved screen gets a redirect, never a deletion.
- Practice time never comes from recording length.
- Files owned by others stay untouched: `app/analysis.js`, `data-merge.js`, `sync/*`, `cloud-sync.js`, `app/score-ink*.js`, `worker/*`, `supabase/*`, `app/voice-path*.js`, `app/mr-cancel.js`, `app/precision-*.js`.

## Information structure

Bottom dock stays `오늘 | 내 곡 | 기록 | 성장`, with the floating mic above it.

Each route carries a `tab` key that picks the highlighted dock item (`app/core.js`, `VZ.render`). The dock has `home`, `songs`, `calendar` (기록) and `growth`. A key with no dock item highlights nothing. The key `keep` is a deliberate shared rule: the dock stays on the tab the person came from.

v5 rule: **a page that is opened from several tabs uses `keep`.** A page that belongs to one tab uses that tab's key. Nothing else may use a key without a dock item, except the dark recorder.

| Route | Before | v5 key | Built |
|---|---|---|---|
| `home`, `practice-set`, `practice-room`, `guided-practice`, `vocal-training`, `voice-check`, `levels` | home | home | already |
| `songs`, `song`, `library`, `compare`, `recording` | songs | songs | already |
| `calendar`, `lessons`, `lesson`, `lesson-ai`, `homework`, `practices`, `performances`, `show` | calendar | calendar | already |
| growth routes (`growth`, `vocal-growth`, `vocal-lab`, `analysis`, `weekly-summary`, …) | growth | growth | already |
| `settings`, `storage`, `data-export`, `shares`, `upload-check`, `processing-log`, `bt-test`, `practice-review` | keep | keep | already |
| `import-hub` (opened from 오늘, 내 곡 and 설정) | record (dock went blank) | keep | 2026-11-20 |
| `song-suggest`, `song-transcript` (opened from 가져오기 and 녹음 분석) | record (dock went blank) | keep | 2026-11-20 |
| `record` (the dark recorder, from the mic) | record | record, no highlight on purpose | — |

Before this change, opening 기존 자료 가져오기 or 곡 확인 cleared the dock highlight, and every 설정 page opened afterwards stayed blank too, because `keep` copies the last key. Now the dock keeps the tab the person came from.

Rules:

1. A back arrow returns to the screen the person came from.
2. The dock always shows one highlighted tab, except on the dark recorder.
3. 기록 stays the only place for lessons, homework and calendar. 내 곡 links to them from the song.

### 설정 groups (built 2026-11-20)

Below the account card and 나의 노래 기록, 설정 has four groups. Each row sits in exactly one group. The look of the rows is unchanged (`app/settings-refresh.css`: white R20 list, rows ≥54px, divider `#F2F0F6`).

| Group (`data-settings-group`) | Heading | Rows, in order |
|---|---|---|
| `practice` | 연습 | 하루 연습 목표 시간 · 트레이닝 항목 (노래 연습실 moved out 2026-11-20, see Flows) |
| `analysis` | 분석 | automatic analysis switches (unchanged) |
| `files` | 파일·저장 | 처리 내역 (file status line) · 저장 공간 · 녹음 찾기 (이 기기) · 내 데이터 내보내기 · 굿노트에서 가져온 악보 지우기 (only when there are some) · 기록 백업·복원 (folded) |
| `more` | 공유·점검 | 공유 중인 링크 · 녹음 중 블루투스 시험 |

Before, 연습 목표 held one row and 관리 held ten mixed rows. On screens 768px and wider the four groups sit two by two; only the version line spans both columns (`app/wide-lists.css`). A new 설정 row goes into the group it belongs to; do not add a fifth group without updating this table.
## Flows (one door per job)

Checked 2026-11-20 against the code. Each job has one place where it starts; other screens link to that place.

| Job | The one door | State |
|---|---|---|
| Do practice (오늘의 연습 · 매일 보이스 체크 · 노래 연습실 · 보컬 트레이닝) | 오늘 › 연습하기 (`design-system/student-home-app.js`) | Already one door since 성장 개편 안 B 4단계. 2026-11-20: the extra 노래 연습실 row in 설정 removed; the screen and its records are unchanged and still open from 오늘, the recording menu and 성장 links. |
| Look at growth | 성장 with three tabs 이번 달 · 곡 · 연구소 (`app/growth-hub.js`) | Already built in 성장 개편 안 B 2–4단계; old addresses lead to the new tabs. No change. |
| Bring in old files | 전체 녹음 › + → 기존 자료 가져오기 (`app/import-hub.js`) | Already one door: 처리 내역's "다시 고르기" and the file count rule (more than 20 files) both hand over to the same screen. No change. |
| After an upload | The result card of 기존 자료 가져오기 | 2026-11-20: the card lists **다음 단계** in order (below). |

**다음 단계 after an upload** (inside the white result card, rows ≥56px with `#F2EFF7` dividers, 20px accent icon, title 15/21/600, line 12/18 muted, trailing caret; no nested card):

1. 다시 올리기: only when some files failed and their originals are still picked; it retries just those (same as 처리 내역's retry).
2. 곡 정하기 → 곡 확인 (`#/song-suggest`): only when saved song/training recordings have no song yet. That screen asks before any paid recognition.
3. 연습 시간 적기 → 연습 기록 (`#/practices`): only when practice records were made from the files. Their time is never taken from the recording length; the person writes it.
4. 처리 내역 (`#/processing-log`): always last, "분석은 자동으로 이어져요".

Below the rows: primary 전체 녹음 보기, secondary 다른 자료 가져오기, and a quiet 44px 결과 보고서 파일로 저장 (it was a third button in the main row). The summary line (저장 · 제외 · 중복 · 실패 counts) and 레슨 녹음 연결 line are unchanged.

**Import review (확인 화면 before 가져오기)** (built 2026-11-22): in sight stay the status filters (전체 · 조건 충족 · 중복 의심 …), 전체 선택 · 선택 해제, the file rows and the sticky `선택한 N개 가져오기`. The tools that act on many files at once (중복 제외 · 추천곡 일괄 승인 · 레슨 연결 일괄 승인 · 곡별 묶어 보기, both "한 번에 지정" selects and the 연습 기록 checkbox) sit behind one fold `한 번에 정하기`, drawn as the V4 List filter row (`#F3ECFF`, R16, 48px, 0 14px, 13/18/600 `#475467`). The closed fold says what its tools would act on in accent 13/600 (e.g. `추천곡 3개 · 같은 날 레슨 2개`; with nothing to suggest, `유형 · 곡 · 연습 기록`). It stays as the person left it when the list redraws. Before, all of these were two rows of 12 chips and two selects above the files. Defaults (연습 기록 on, per-file type and song) are unchanged.
**After a new recording** (`#/record`, dark recorder): checked, no change. The steps are already short: 녹음 → 미리 듣기 → 저장, then 새 녹음 · 연습 기록 (or 레슨으로 / 오늘로) · 곡 보기.
## Component rules added in v5

- **One definition per component.** Cards, chips, tab bars, list rows and buttons are defined once in `design-system/components.css`. Screen CSS may position them but may not restyle colour, radius or type.
- **Empty states** (built 2026-11-20 for the shared `.empty` box in `design-system/global-app.css`; before, it had a 1px dashed border and a 32px `#9557FF` icon) use a white R20 card with no border, a 20px Phosphor icon in `#98A2B3`, one 14/20/600 line saying what is missing, and one secondary button when an action exists.
- **Buttons** (built 2026-11-20): the shared `.btn` is 52px, R16, weight 600 for primary and secondary, set once in `design-system/global-app.css` with `:where()` so a screen's own size still wins. Before, it was 48px, R14, weight 650 and several screens patched it to 52/16/600 one by one. `.btn.sm` stays 44px, R12. No button may be lower than 44px (the 다음 연습 row button was 38px, now 44px).
- **Form fields** (built 2026-11-20): every labelled field (`.field`) on a light screen uses the V4 Input/Textarea look that sheets already had: no border, `#F2EFF7`, R15, 52px (a textarea keeps the height its screen gives it), focus 2px `#DCC4FF` outline. A screen's own field rule still wins: the shared rule has the same weight as the old base input rule (fixed 2026-11-20 after the first version overrode screen sizes). Before, fields outside sheets had a 1px border, R12, 48px and a 3px soft ring. Checkboxes, radios, sliders, file pickers and the dark recorder are not touched. Set once in `design-system/global-app.css` with `:where()`.
- **Loading** shows the final layout with `#F2EFF7` blocks (R12). No spinners on list screens. Built 2026-11-22 as `VZ.loadingRows(n)` (`app/core.js`, styles in `app/app.css`): a white list of n 60px rows, each a 36px icon block, a title bar and a meta bar, no animation; `role=status` with the hidden words `불러오는 중…`. Used on 전체 녹음, the old home recent list and the lesson list; other screens still show their own loading line and move over one by one.
- **Errors** use the danger soft background with a plain sentence and a retry button. No technical words.
- Touch targets stay at 44px or more. No horizontal page scroll at 320, 390, 430, 820 and 1180px.

## Build order

1. This guide and the token review (this PR). No runtime change.
2. Route ownership and 설정 list (table above). Redirects only, no data change.
3. 오늘 tab clean-up against the shared components.
4. 내 곡 and 기록.
5. 성장 (numbers pinned by `tests/growth-characterization.snapshot.json`; a number change needs a reason in the PR).
6. 연습 and 단계.

Each step is its own pull request. A step is "done" only after the automated checks pass and the owner has looked at it on an iPhone or iPad.

## Change log

- 2026-11-20: v5 draft added. v4 stays in force.
- 2026-11-20: screen ownership rule built for 기존 자료 가져오기, 곡 확인, 전사 확인 (keep instead of ecord).
- 2026-11-20: 설정 regrouped into 연습 · 분석 · 파일·저장 · 공유·점검 (replaces 연습 목표 · 분석 · 관리). No setting, value or link removed.
- 2026-11-20: shared empty box: dashed border removed, icon 20px `#98A2B3`. Text and buttons unchanged.
- 2026-11-20: shared button 48px/R14/650 → 52px/R16/600; 다음 연습 row button 38px → 44px.
- 2026-11-20: labelled fields outside sheets now match sheet fields (no border, #F2EFF7, R15, 52px).
- 2026-11-20: Flows section; 설정 no longer repeats 노래 연습실; upload result card lists 다음 단계.
- 2026-11-22: import review: bulk tools behind one 한 번에 정하기 fold.
- 2026-11-22: list loading rows (VZ.loadingRows) on 전체 녹음 and the lesson list.
