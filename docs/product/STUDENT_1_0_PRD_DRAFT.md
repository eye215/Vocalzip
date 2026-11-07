# VOCAL.zip — Student Release 1.0 PRD (draft, pending Phase 01 audit)
Version: 2026-11-07 / v0.1 / planning only. **Not approved for implementation or deployment.**
Related: [roadmap](../VOCALZIP_PRODUCT_ROADMAP_2026-11-07.md), [Phase 01 audit](../VOCALZIP_PHASE01_AUDIT_PLAN.md), [IA](STUDENT_1_0_IA_DRAFT.md), [data guardrails](DATA_CONTRACTS_AND_V2_EXTENSIBILITY_DRAFT.md).

## Goal and release boundary
Release 1.0 is a **fully usable student product** for private songs, recordings, practice, personal lesson notes/homework, growth, repertoire, and validated AI capabilities, with iOS-ready reliability, paid plans, privacy and data export. A teacher account or teacher enrollment is not a prerequisite. Release 2.0 adds teacher mode, bookings, N:M relationships, group classes and their billing workflows.

This specification describes **target behavior**, not necessarily existing behavior. Phase 01 must label each item: Existing verified / Existing unverified / Partial / New / Blocked / Deferred. Do not equate passing mocked Playwright tests with iPhone validation.

## Primary jobs to be done
A. “I have a recording or video; I want it saved safely, dated correctly, and connected to the song I am learning.”
B. “I want to enter what I learned in my lesson, track homework, and know what to practice before my next lesson.”
C. “I want to revisit earlier takes, compare them, and understand meaningful improvement without inaccurate AI claims.”
D. “I want to move between iPhone and another device without losing records or media.”
E. “I want the app to be fast for recording and easy to understand without mandatory metadata entry.”

## Functional requirements
| ID | Area | Required user-facing behavior | Critical acceptance test |
|---|---|---|---|
| AUTH-01 | Account | Apple, Kakao and a feasible email authentication method; verified session, recovery, logout | New/existing sign-in; logout hides private content; cross-account isolation |
| AUTH-02 | Consent & lifecycle | Terms, privacy, optional AI consent; export and account deletion controls | Explain/export own data; withdrawal/closure honored |
| HOME-01 | Home | Next lesson, due homework, recently practiced songs, one-tap recording and record practice | Empty and populated states work; one-tap capture does not create fake practice time |
| SONG-01 | Song library | Add/edit/search/filter song; associate aliases, artist/musical, optional reference material | Duplicate titles permitted per user; search does not destroy existing IDs |
| SONG-02 | Song detail | Unified timeline of practice, lessons, homework, audio, score/lyrics, comparisons | Navigating from any item returns to song context |
| MEDIA-01 | Record | Start/pause/resume/finish, preview, title optional, choose or defer song | Save successful once; if save fails recover/download the original bytes |
| MEDIA-02 | Library | Unified local/cloud library, filter/edit title/date/song, play, repeat range, speed | Reopen, seek, relog and play all supported media; no duplicated displayed assets |
| MEDIA-03 | Import | Select multiple M4A/MP3/WAV/MOV as supported; captured date from metadata with provenance and override | A filename or modified date does not silently replace valid captured date |
| MEDIA-04 | Large upload | Progress, cancellation, failed-only retry, durable association to original media ID | 200MB-class upload interruption must be recoverable without silent loss; define resume limits |
| MEDIA-05 | Video policy | **Decision needed**: full video preservation/playback and quality-managed derivatives in 1.0 vs audio-only MOV extraction | Clearly label stored format and original retention; test audio fidelity |
| MEDIA-06 | Storage | Auth-protected media access, user-based ownership, quota, export/download | Another account cannot enumerate/play user media |
| PRACT-01 | Practice entry | Vocal training vs song practice, time, goals/checklist, satisfaction, memo, attachments | Attaching recording does not increase practice duration |
| PRACT-02 | History | Review/edit/delete practice; reliable statistics; optionally link a recording | Deleting record doesn't delete owned original media |
| LESSON-01 | Personal lesson | Student enters date/time/place/teacher display name, songs, prep notes, feedback | Future lesson stays scheduled until explicitly completed; legacy status handled |
| LESSON-02 | Connections | Link lesson to homework, songs and media without ownership transfer | Legacy lesson ID/date/status compatibility retained for billing |
| HW-01 | Homework | Enter homework linked to lesson/song, mark complete and carry forward | Completion state is separate from checkboxes in a practice entry |
| CAL-01 | Calendar | Lessons/practice/recordings/homework/performance on correct local dates | Imported media uses recorded local date; manual corrections move calendar entry |
| COMP-01 | Comparisons | Same-song take A/B, repeat/seek/speed, save comparison notes | Original recordings remain unchanged |
| GROW-01 | Growth | Practice hours/days, song distribution, satisfaction trend, homework count | Aggregates match source records; no double counting |
| PERF-01 | Performance | Performance/audition date, role, repertoire, rehearsal notes, archive links | May create event without external publishing |
| AI-01 | Transcription | Consent-based transcribe and timestamp, job state/retry | AI failures do not block recording; no invented transcripts |
| AI-02 | Song matching | Suggest candidate from existing user's songs with confidence; ask user to confirm | No automatic irreversible song relinking |
| AI-03 | Voice analysis | Pitch/rhythm/range/other metrics only after accuracy evaluation; uncertainty and scope shown | Audio-only signal cannot be presented as a reliable clinical assessment of breath technique |
| AI-04 | Recommendations | Ground suggestions in own material, allow reject/edit, usage quota | No fabricated “teacher feedback” or guaranteed performance scores |
| SHARE-01 | Optional sharing | Expiring protected playback link, optionally revoke; no teacher signup necessary | Default private; link access constrained, auditable and time-limited |
| PLAN-01 | Plans | Free/Plus/Pro quota and optional AI limits; cancellation, restore, receipt handling | Backend enforces entitlements, not only UI flags |
| DATA-01 | Backup/export | Export records AND media as distinct deliverables; transparent progress and completeness | JSON backup is explicitly NOT misrepresented as original-media backup |
| DATA-02 | Owner import | Explicit allowlisted owner-only migration; preview/dedup/date provenance/checksum; reversible | Every old ID remains traceable; standard users cannot access owner migration |
| OPS-01 | Reliability | Error states, progress, notifications, monitoring, safe retries, performance | Real iPhone sign-in→record→reload→play→cloud recover tested |
| IOS-01 | App release | Native media permissions, iOS Files/Share Sheet integration, subscription compliance | On-device tests with real audio/video, permission denial and backgrounding |

## The minimum complete student journey (critical path)
1. Sign in or reopen existing account.
2. Add a song (optional for initial recording).
3. Record 10 seconds OR import an existing audio/video file.
4. Preview, store locally without loss, then back up to authenticated cloud.
5. View in library, change captured date with provenance, attach to song/practice/lesson.
6. Create personal lesson with date/time, teacher display name, song, feedback.
7. Create homework and complete via actual practice log (no false automatic elapsed time).
8. Check calendar and growth metrics, listen to earlier recording, compare two takes.
9. Sign in on another device and confirm records **and media** remain retrievable.
10. Export data, verify account isolation, and handle quota/cancel states safely.

## Priority gates (not a reduction of promised 1.0 scope)
- **G0 Data safety and correctness:** import/save/play/reopen/cloud sync, verified accounts and permissions, data integrity, recovery.
- **G1 Daily workflow completeness:** song→record→practice→lesson→homework→calendar→growth, excellent mobile UX.
- **G2 Full student feature set:** PDF scores, performance archive, sharing, validated AI, subscriptions, real iOS support.
- **Release** only once all approved 1.0 requirements and real-device QA pass.

## Current implementation evidence to reconcile in Phase 01
- Current v6 README: 5-tab student navigation, audio-only recording, MOV import extracts audio (does **not** preserve video), localStorage + IndexedDB + cloud payload sync, chunked upload, lesson and homework, growth; AI is text-memo assistance and not actual pitch/breath analysis.
- Billing remains independent under `billing/` and the UI reads its link. Do not merge teacher commerce into student v1 incidentally.
- `docs/운영검증_2026-11-04.md` records mocked automated checks; actual iPhone and live cloud validation still outstanding in that snapshot.

## Open product decisions (owner + engineering to resolve, not silently assume)
1. Video in 1.0: archived 720p transcoded version plus original retained, or keep audio-only imports? Original request favors video support, existing implementation is audio-only extraction.
2. Student 1.0 plans: initial Free 1GB / Plus 20GB KRW 4,900 / Pro 100GB KRW 9,900 **tentative**; benchmark cost, IAP and quotas.
3. Public vs authenticated media share link and whether comments/feedback are allowed pre-teacher release.
4. AI scope: validated reliable metrics by launch, unsupported dimensions hidden or labeled experimental.
5. 29-day post-expiry grace, day-30 excess-media disposal **proposal only**. Legal/consent/notification/restore/export decisions first.
6. Which native iOS framework and video conversion jobs; decide after auditing current web app.

## Non-functional requirements
- All mutations versioned/audited where data loss or financial ledger impact matters.
- Accessible touch targets, keyboard/safe-area handling, explicit loading/empty/error/offline states.
- Server-authorized media links and RLS; never embed privileged keys client-side.
- Performance budget to be set after baseline measurement rather than invented.
- No actual personal recordings in GitHub, screenshots, or test fixtures.

## Handoff
The Phase 01 audit must annotate this PRD with evidence and gaps. Phase 02 resolves open UX/architecture questions, Phase 03 provides concrete SQL contracts and migration plan; no blind production schema changes.
