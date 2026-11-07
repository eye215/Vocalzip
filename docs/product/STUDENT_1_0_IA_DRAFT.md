# VOCAL.zip — Student 1.0 IA and screen inventory (draft)
Version: 2026-11-07 / v0.1 / **pending actual UI audit**. Preserve current v6 5-tab mental model unless usability tests justify change.

## Global navigation and hierarchy
- Bottom tabs: **Home · Songs · Record · Calendar · Growth**.
- Global entry: profile/settings, notifications, search where relevant.
- Context entry: lesson detail, homework, media library, import, comparisons, performance archive.
- Primary capture button should always be reachable with minimal steps. Recording and media import are different actions.
- User can access song-based information without being locked to a lesson or teacher.

## Screen registry
| Screen ID | Route / area (conceptual, not implemented URL) | Primary purpose | Core actions | Required states |
|---|---|---|---|---|
| A01 | Welcome | Describe app & start | Sign in/sign up | returning, guest info |
| A02 | Auth | Authenticate | Apple, Kakao, email | loading, denied, expired |
| A03 | Profile & permissions | Consent/settings | account, mic, privacy | permission-denied |
| H01 | Home | Today’s focus | quick record, next lesson, homework, last song | empty, active, loading, offline |
| H02 | Quick actions | One-tap progress | record, practice, lesson, import | mic denied, no connection |
| S01 | Songs list | Search repertoire | add, sort, search, select | no songs, results empty |
| S02 | Add/edit song | Song metadata | save, cancel | validation, unsaved |
| S03 | Song detail | Song-centered timeline | play, attach, practice, lesson, compare | no attachments |
| S04 | Lyrics & score | Reference materials | PDF reader, notes | missing file, offline |
| R01 | Recorder | Capture audio | start, pause, stop, preview | permission denied, interrupt, failure |
| R02 | Save recording | Title/song/date | save, retry, download original | pending upload, duplicate save |
| R03 | Media library | Find assets | filter, play, edit, attach, export | local-only/cloud-only/missing |
| R04 | Media detail | Playback & provenance | seek, repeat, speed, edit date | unsupported codec, expired auth |
| R05 | Import queue | Multiple items | pick, assign song, retry failures | unsupported, oversized, cancelled |
| R06 | Comparison | Two recordings | A/B, segments, notes | 0/1 take, mismatch |
| C01 | Calendar | Time-based overview | month switch, date select | empty month, timezone |
| C02 | Day details | What happened | open lesson/practice/recording | multiple entries |
| L01 | Lessons list | Personal lesson history | add, filter | scheduled/done/cancelled |
| L02 | Lesson form | Student adds lesson | date, time, place, teacher name, songs | legacy status, unsaved |
| L03 | Lesson detail | Revisit a lesson | feedback, media, homework, status | deleted media association |
| P01 | Practice form | Log actual practice | training or song, time, targets, media | save pending |
| P02 | Practice detail | Inspect/edit session | edit, media play, delete | orphaned attachments |
| W01 | Homework list | Track tasks | add, check, open | due, overdue, done |
| W02 | Homework detail | Lesson/song linkage | edit, link practice | carried over |
| G01 | Growth | Patterns & habits | period switch, drill into songs | no practice, incomplete data |
| G02 | Report/analysis | Interpret change | compare, note, dismiss | AI unavailable, confidence low |
| F01 | Performance list | Performances & auditions | add/view | empty, upcoming/past |
| F02 | Performance detail | Role and materials | edit, link songs and media | private/public boundaries |
| U01 | Storage & subscription | Quota and plan | upgrade, manage, restore | offline, expired, grace |
| U02 | Backup/export | Leave with data | export metadata/media | partial export and retry |
| U03 | Share settings | Grant media access | create/revoke expiring link | invalid/expired/revoked |
| U04 | Account lifecycle | Manage personal data | delete account, export | verification, cooldown |
| O01 | Owner-only migration | Existing user import | preview, map, dedupe, verify | forbidden for other users |

## Core navigation sequences
- Fast capture: Home→R01→R02→R03; if song opened first, prepopulate the song ID.
- Song work: S01→S03→P01 or L02 or R03; song deletion unlinks but keeps original records/media.
- Lesson preparation: H01→L01→L03→W01→P01; entering a scheduled past lesson **does not** automatically complete it.
- Import: Home/Library→R05→status per file→R03; failure does not remove local original.
- Growth: G01→S03→R06 and back.
- Personal performance: C01→F02→S03; no teacher connection required.
- Profile: Account→U01, U02, U04; user can manage plan and data independently.

## UX and interaction constraints
1. **One primary action per screen.** Short forms by default; optional song and memo. No mandatory upload before an offline capture.
2. Editing recorded date makes an explicit override; preserve date source and timezone where available.
3. Display upload progress per file and aggregate; clearly distinguish local save vs cloud backup confirmed.
4. Non-destructive delete/remove association. Explicit warning and confirmation for actual file deletion.
5. No duplicate UI entrypoints that confuse users; keep quick actions contextual.
6. Dynamic Type/large text, VoiceOver labels, touch targets and safe-area/keyboard tested on physical iPhone.
7. Record playback failures must not drop associated metadata; provide fallback/download.
8. Privacy labels clearly show private vs shared media; no implied teacher access from entering name.
9. Unsaved notes or lesson changes survive accidental sheet dismissal where technically feasible.
10. Empty-state CTA goes to appropriate first action; avoid large blank statistic widgets without records.

## What is deliberately absent in Student 1.0
- Teacher dashboard, managed student roster, invitations granting ongoing teacher access, teacher-authored lessons, group attendance, booking inventory, teacher billing packages.
- A **single student can record having attended a group lesson** in their personal lesson notes if desired, but this is not 2.0 group management or shared attendance.

## Screens needing actual code crosswalk after Phase 01
- Legacy v5 views and current v6 tabs, where records and homework are currently in settings/more, and actual hash routing.
- Whether media library has true video files or only extracted audio.
- Which screens are actually linked, reachable, tested and accessible.
- Final screen IDs/routes should be added by Claude/Codex when code mappings are known.

## Proposed screen-level definition-of-done
For every screen: entry/exit, visible elements, actions, loading/empty/error states, privacy permissions, changes to data, undo/retry, a11y test, iPhone QA, analytics/telemetry where authorized.
