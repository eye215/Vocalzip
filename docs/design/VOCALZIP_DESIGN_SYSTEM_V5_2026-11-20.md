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
| `practice` | 연습 | 하루 연습 목표 시간 · 트레이닝 항목 · 노래 연습실 |
| `analysis` | 분석 | automatic analysis switches (unchanged) |
| `files` | 파일·저장 | 처리 내역 (file status line) · 저장 공간 · 녹음 찾기 (이 기기) · 내 데이터 내보내기 · 굿노트에서 가져온 악보 지우기 (only when there are some) · 기록 백업·복원 (folded) |
| `more` | 공유·점검 | 공유 중인 링크 · 녹음 중 블루투스 시험 |

Before, 연습 목표 held one row and 관리 held ten mixed rows. On screens 768px and wider the four groups sit two by two; only the version line spans both columns (`app/wide-lists.css`). A new 설정 row goes into the group it belongs to; do not add a fifth group without updating this table.
## Component rules added in v5

- **One definition per component.** Cards, chips, tab bars, list rows and buttons are defined once in `design-system/components.css`. Screen CSS may position them but may not restyle colour, radius or type.
- **Empty states** use a white R20 card, a 20px Phosphor icon in `#98A2B3`, one 14/20/600 line saying what is missing, and one secondary button when an action exists.
- **Loading** shows the final layout with `#F2EFF7` blocks (R12). No spinners on list screens.
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
