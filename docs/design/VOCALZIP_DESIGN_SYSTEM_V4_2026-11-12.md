# VOCAL.zip Student Light Design System v4.0

2026-11-12 · **Approved target specification for the upcoming IA redesign, not yet implemented in production.**

## Source of truth / inheritance

Existing references: `design-system/tokens.css`, `design-system/global-app.css`, `app/collection-ui.css`, `app/song-detail.css`, `docs/design/VOCALZIP_DESIGN_SYSTEM_2026-11-09.md`. Keep the approved dark recording studio separately themed. This version supersedes the *desired behavior* of inconsistent search and filter active treatments. Do not imply that current CSS is already updated.

**Design intent:** preserve the actual student light appearance; unify equal semantic roles even across screens; change layout and navigation information architecture without re-skinning controls. Work from CSS and real preview markup, not image-generated approximations.

## Global design tokens

| Semantic role | Value |
|---|---|
| Canvas / surface / input | `#F8F6FD` / `#FFFFFF` / `#F2EFF7` |
| Accent / pressed / soft / selected | `#7A32F5` / `#6528CA` / `#F3ECFF` / `#EDE1FF` |
| Title / primary / body / muted / faint | `#101828` / `#344054` / `#475467` / `#667085` / `#98A2B3` |
| Border / focus | `#E8E4F0` / `#DCC4FF` |
| Success / soft | `#23855C` / `#E3F4EC` |
| Warning / soft | `#B26A00` / `#FFF3DC` |
| Error / soft | `#C93A3A` / `#FDEAEA` |
| Category lesson / soft | `#078994` / `#E8F6F6` |
| Category practice / soft | `#7A32F5` / `#F3ECFF` |
| Category stage / soft | `#DE3E0A` / `#FFF0ED` |

Font: `Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif`; letter spacing `-0.02em`.

| Text level | font-size / line-height / weight |
|---|---|
| Page | 26px / 34px / 700 |
| Section | 18px / 26px / 700 |
| Card title | 16px / 22px / 600 |
| List title | 15px / 21px / 600 |
| Body | 14px / 20px / 400 |
| Tabs (v4 target) | 14px / 20px / 600 |
| Field label (v4 target) | 13px / 18px / 600 |
| Meta | 12px / 18px / 400 |
| Bottom nav | 11px / 16px / 500 |
| Metric | 27px / 32px / 700 |
| Feature song title | 23px / 29px / 700 |

Use tabular numerals for counters and dates. Keep ellipsis in list rows and full text in details.

## Radius / spacing

Radius by role: cards and list/media/statistic/highlight `20px`; selection/filter row `16px`; primary/secondary buttons `16px`; inputs `15px`; helper controls and filter choices `14px`; list-icon background `12px`; content and segment pill `99px`; bottom dock `999px`; action popover `27px`; floating mic `50%`.

Spacing scale: `4,8,12,16,20,24,32,40px`. Page max width `560px`, horizontal gutter `12px`, top `max(8px,safe-area)`, header min `44px`, header gap `8px`, card gap `12px`, default padding `16px`, section gap `32px`, pointer target min `44×44px`.

## Component recipes (all properties explicit)

| Component | background; border; shadow | radius; sizing / padding | typography |
|---|---|---|---|
| Base card | white; none; `0 2px 10px rgba(55,33,85,.045)` | R20; 16px pad; 12px gap between cards | title 16/22/600 |
| List card | white; none; none | R20; min 86px; 16px pad; 12px between items | title 15/21/600; meta 12/18/400 |
| Media card | white; none; none | R20; 16px pad; 12px gap | title 16/22/600; meta 12/18/400 |
| Statistics card | white; none; none | R20; 16px pad | metric 27/32/700 |
| Status card | white; none; none | R20; 16px pad | use semantic state tokens for sub-elements |
| Recent-song highlight | `linear-gradient(125deg,#A65CFF,#7A32F5 52%,#6D2BE5)`; none; none | R20; min-height 151px; padding 18px 20px | title white 23/29/700 |
| Content/segment tab bar | transparent; none; none | gap 3px; no enclosing rounded white card | — |
| Unselected tab | transparent; none; none | R99; min-height 44px; 0 14px pad | `#475467` 14/20/600 |
| Selected tab | `#EDE1FF`; none; none | R99; min-height 44px; 0 14px pad | `#7A32F5` 14/20/600 |
| List filter row | `#F3ECFF`; none; none | R16; min-height 48px; 0 14px pad | `#475467` 13/18/600 |
| Filter choice default | white; none; none | R14; min-height 52px; 0 16px pad | `#101828` 14/20/600 |
| Filter choice selected | `#F3ECFF`; none; none | R14; min-height 52px; 0 16px pad | `#7A32F5` 14/20/600 |
| Primary | `#7A32F5`; none; none | R16; 52px; 0 16px pad | white 16/22/600 |
| Secondary | `#F3ECFF`; none; none | R16; 52px; 0 16px pad | `#7A32F5` 16/22/600 |
| Input | `#F2EFF7`; none; none | R15; min-height 52px; 0 16px pad | `#344054` 14/20/400; placeholder `#98A2B3` |
| Textarea | `#F2EFF7`; none; none | R15; min-height 120px; 16px pad | `#344054` 14/20/400 |
| Checkbox default / selected | white / `#7A32F5`; `1px solid #E8E4F0` / accent border; none | 20×20px, R6; touch min 44px | white check when selected |
| Small tool icon button | transparent; none; none | touch 44×44px, R12 | Phosphor Regular 22px |
| Bottom nav container | `rgba(255,255,255,.58)`; `1px solid rgba(255,255,255,.68)`; `0 5px 20px rgba(55,33,85,.045)` | R999; height 70px; 8px pad; max-width 528px; inset 16px, bottom 12px; blur 24px | — |
| Nav item default / selected | transparent / `#EDE1FF`; none; none | R999; height 54px | icon 22px `#475467` / `#7A32F5`; label 11/16/500 `#7D748A` / `#8A6DB8` |
| Floating mic | `linear-gradient(135deg,#9557FF 0%,#7A32F5 52%,#6D2BE5 100%)`; none; `0 5px 14px rgba(109,43,229,.18),inset 0 1px 0 rgba(255,255,255,.22)` | 56×56px; 50% | `ph-microphone` white 22px |
| Action popover | `rgba(54,51,59,.92)`; none; `0 18px 40px rgba(24,17,33,.25)` | R27; max-width 304px; row min 56px | white text; optional white 21px icon |
| Full page form | `#F8F6FD`; none; none | max-width 560px, 12px gutter; no sheet corners | header 18/26/700 |
| Home summary rows | white; none; none | R20; padding 4px 12px 4px 16px; row min-height 52px; divider `1px solid #F2EFF7` | icon 20px semantic color; label 14/20/600 + value 14/20/400 `#475467`; trailing badge 13/18/700 |

Use Phosphor Regular consistently: `ph-microphone` for record, `ph-timer` practice, `ph-note-pencil` lesson, `ph-magnifying-glass` search, `ph-gear` settings, `ph-plus` add, `ph-caret-left/right/down`, `ph-funnel` filter. Standard 20–22px; small chevrons 14–17px.

## Interaction states (v4 target)

**Unified search/filter/sort tools:** Default transparent background and icon `#667085`; applied conditions change the icon itself to `#7A32F5` and DO NOT add a dot; pressed background `#F3ECFF` with purple icon; disabled icon `#98A2B3` and opacity .45. Search active only when applied search text is nonempty; filter and sort active only if deviating from defaults. This deliberately changes the current search dot treatment in `app/collection-ui.css`.

Primary pressed `#6528CA`, disabled bg `#D9D1E3`/text `#7A7285`. Secondary pressed `#EDE1FF`, disabled bg `#F2EFF7`/text `#98A2B3`. Input focus 2px `#DCC4FF` outline (offset 0), error bg `#FDEAEA`, outline 1px `#C93A3A`, hint 12px in danger color, disabled bg `#D9D1E3`/text `#7A7285`. For reduced motion set transition duration 0. Use 150ms fast / 240ms normal elsewhere.

Popovers are dark glass, anchored to their trigger, with no title, grabber or row dividers; delete last in `#FFD6DF`. Data-entry, search-heavy selection, multi-select use full pages (not new bottom sheets). Confirm dialog target: white/R20/20px padding; title 16/700, body 14/400, controls height 48px/R14 and `rgba(20,16,40,.32)` backdrop. Mark confirm as target/new standard if existing implementations differ.

## Target IA, preserving visual system

Bottom dock **four items**: `오늘 | 내 곡 | 기록 | 성장`. Keep the separate floating mic above the dock, **not** a fifth dock item; opening it enters approved dark studio or common action flow. **보관함** disappears as a top-level tab but survives as `내 곡 > 전체 녹음`, with old route redirecting, not deleting data. `기록` includes calendar/list, lessons, practices, homework, performances; `성장` includes summaries, vocal lab and monthly reports. Song detail resource tab includes original scores/GoodNotes ink separate layers, lyrics, MR/AR as existing data allows. Settings hosts unified file processing/storage/analysis status.

Home order: small date/streak header; a single situational “지금 할 것” card; max four goals; next schedule; up to three recent songs; conditional needs-attention line; weekly summary. To keep Home about one screen tall, next schedule, needs-attention and weekly summary sit as rows inside one **Home summary rows** card; the needs-attention row renders only when something needs attention. Recent songs are one row of content pills (R99, min-height 44px), not cards. Reuse current light home layout and token styling, not generic glossy concept art.

**Home summary rows (확정 2026-11-12):** 홈의 다음 레슨·이번 주 요약(필요할 때만 주의 줄)은 List card(최소 86px)가 아니라 위 표의 Home summary rows 한 장 안의 한 줄 행으로 둔다. 순서는 위 Home order를 그대로 따른다.

## Delivery and validation

1. Current CSS values and new target values must be clearly differentiated (this document specifies **target**).
2. Centralize roles in `tokens.css` and shared components; remove redundant overrides only after screenshot and functional regression comparison.
3. Preserve all existing data, route compatibility, production authentication, recording and the approved dark recording studio.
4. Visual acceptance: widths 320 / 390 / 430px, iPhone Safari, no overflow, safe-area and keyboard behavior, 44px touch targets, accessibility/contrast/reduced-motion.
5. Prototype fidelity: do not treat a generative image as a pixel-accurate representation. Prefer actual browser-rendered HTML/CSS for sign-off.

**Status:** documentation proposal; no runtime styles, screens, or deployment changed by this document.

**Implementation log:** 2026-11-12 branch `feat/ia-v4-four-tab-dock` applies only the four-item dock (`오늘 | 내 곡 | 기록 | 성장`), the `곡별 | 전체 녹음` switch on 내 곡 (`#/library` kept), and route-to-tab highlighting. Home layout, copy that still says 보관함, and Settings file status are not yet implemented.

**Home on wide screens (2026-11-12):** from a 768px-wide viewport (iPad portrait and landscape, desktop) Home uses up to 1040px and two columns — left `지금 할 것` + `오늘의 목표`, right `Home summary rows` + recent-song pills; the date/streak line spans both. Below 768px (phones, iPad mini portrait) the columns collapse (`display:contents`) and the single-column order above is unchanged. The dock stays 528px centred; the floating mic follows the 1040px edge. On tablets the cards read larger (card padding 24px/R24, 지금 할 것 title 28/36, summary rows 64px with 16px text, goal rows 58px, pills 52px) and the right column also holds the full **주간 연습** card (day rings, week arrows/swipe, title → 기록) between the summary and recent songs; its one-line 이번 주 summary row is then hidden. The 이번 주 row and the streak always describe the current week, even when the card shows an earlier week.

**List screens on wide screens (2026-11-12):** from 768px, 내 곡, 전체 녹음 and 기록 use the same 1040px column as Home (`app/wide-lists.css`; 24px side gutters, `--vz-content-max` 1040px so the floating mic follows the edge). 내 곡 lays song cards in a grid (`minmax(300px,1fr)`: 2 across in iPad portrait, 3 in landscape). 전체 녹음 keeps each month's white card and lists its recordings in two columns; an opened row's player stays inside its column. 기록 puts the month summary and calendar on the left and the chosen day's records on the right. Below 768px every list stays one column as before.
