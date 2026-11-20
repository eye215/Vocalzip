# VOCAL.zip Design System v5.0 (draft)

Status: **proposal. Nothing in this document is built yet.** Each section says which PR will build it. Update the "Built" column only in the PR that ships the change.

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

Current routes carry a `tab` key. Several keys are leftovers from the removed 보관함 tab (`keep`, `record`) and the 기록 tab is keyed `calendar`. v5 makes each screen belong to exactly one of the four tabs, or to 설정.

| Route | Today's tab key | v5 owner | Built |
|---|---|---|---|
| `home`, `practice-set`, `practice-room`, `guided-practice`, `vocal-training`, `voice-check`, `levels` | home | 오늘 (unchanged) | — |
| `songs`, `song`, `library`, `compare`, `recording` | songs | 내 곡 (unchanged) | — |
| `song-suggest`, `song-transcript` | record | 내 곡 | no |
| `import-hub` | record | 설정 | no |
| `record` | record | none: the dark recorder, opened from the mic, keeps no dock highlight | no |
| `calendar`, `lessons`, `lesson`, `lesson-ai`, `homework`, `practices`, `performances`, `show` | calendar | 기록 (key stays `calendar`) | — |
| `practice-review` | keep | 기록 | no |
| `growth`, `growth-flow`, `growth-lab`, `lab-reports`, `analysis`, `practice-stats`, `precision-measurement`, `precision-report`, `vocal-analysis`, `vocal-growth`, `vocal-lab`, `voice-path`, `weekly-summary` | growth | 성장 (unchanged) | — |
| `settings`, `storage`, `data-export`, `shares`, `upload-check`, `processing-log`, `bt-test` | keep | 설정 (opened from the gear on every tab; no dock highlight) | no |

Only the rows marked "no" move. The tab keys `home`, `songs`, `calendar`, `growth` stay as they are so existing code and tests keep working. `record` and `keep` are the leftovers that v5 retires.

Rules:

1. A back arrow returns to the screen the person came from. If none exists, it returns to the owning tab.
2. The dock highlights the owning tab. 설정 screens highlight nothing.
3. 설정 gets one list in this order: 파일 상태 → 저장 공간 → 공유 중인 링크 → 내 데이터 내보내기 → 기존 자료 가져오기 → 진단 (업로드 상태, 블루투스 시험). The 파일 상태 row from v4 stays at the top.
4. 기록 stays the only place for lessons, homework and calendar. 내 곡 does not repeat them except as a link on the song.

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

- 2026-11-20: v5 draft added. v4 stays in force. Nothing implemented.
