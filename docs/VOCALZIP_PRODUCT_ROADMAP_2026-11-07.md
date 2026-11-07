# VOCAL.zip Product Roadmap — 2026-11-07 (proposal v2)
> **Shared source for Claude, Codex, and ChatGPT.** This is the newly agreed PRODUCT plan, not a claim that historic Phase numbers matched. Update only after auditing actual repo and product decisions. No production data mutation authorized.

## Release strategy
- **Release 1.0: complete student experience**, iOS release. Teacher participation is not required; student records their own lessons/teacher names/homework. Secure optional **read-only expiring media share link** may be implemented without a teacher account.
- **Release 2.0: teacher mode**, N:M student-teacher relationships, private 1:1 lessons, 1:N group lessons, optional co-instructors, reservations, feedback, homework, attendance, and billing. One account can be both student and teacher.
- **Do NOT build an incomplete student MVP just to ship early**. Deliver a polished, tested 1.0 then extend. Phases are planning units, not necessarily sequential sprints.
- The number **30 is a draft grouping, not a fixed requirement**; split/merge as audit demands. Legacy phases and PR labels are not renumbered or marked complete by this file.

## Planned phases / required scope
| ID | Area | Scope | Release |
|---|---|---|---|
| 01 | Existing-state audit | repository, behavior, tests, data inventory, risks, historic phase mapping | 1 |
| 02 | Architecture | modularization, cross-platform/iOS strategy, ownership boundaries | 1 |
| 03 | DB & migration design | ERD, IDs/FKs, RLS, staged non-destructive migration; teacher/group extensibility | 1 |
| 04 | Authentication | Apple/Kakao/email as supported, identity linking, account lifecycle | 1 |
| 05 | Sync & recovery | local/remote merge, concurrency, offline queue, backup/restore | 1 |
| 06 | Media infrastructure | Cloudflare R2 plan, signed access, chunk uploads, resume, playback, compression with audio fidelity, quotas | 1 |
| 07 | Songs & repertoire | metadata, lyrics, PDF score, reference audio, filters, song history | 1 |
| 08 | Recording & library | record, import, M4A/MOV, metadata dates, player, retry, sharing | 1 |
| 09 | Practice | vocal training vs song practice, time, satisfaction, goals, checklist, media linking | 1 |
| 10 | Student lesson log | date/time/place/teacher name, songs, feedback, media, schedule status | 1 |
| 11 | Self-managed homework | linked to lessons/songs/practice, completion and carry-over | 1 |
| 12 | A/B comparisons | same-song clips, segments, playback speed, reports | 1 |
| 13 | Growth dashboard | valid statistics, goals, trend, comparison | 1 |
| 14 | Performance & audition | repertoire, roles, events, rehearsal, archive | 1 |
| 15 | AI transcription & song matching | source-aware transcription, suggestion + user confirmation, usage control | 1 |
| 16 | AI voice analysis | validate pitch/rhythm/range methods and uncertainty before promising metrics | 1 |
| 17 | AI practice coach | grounded recommendations, compare outcomes, cost/privacy controls | 1 |
| 18 | Imports & owner migration | general user file selection; one account's legacy/iCloud/Voice Memos import as separate guarded migration | 1 |
| 19 | Student IA/UX | home / songs / record / calendar / growth, secondary screens, accessibility | 1 |
| 20 | Subscription/product | Free/Plus/Pro pricing TBD, storage and AI quotas, IAP/expiry/export | 1 |
| 21 | Operations/security | monitoring, RLS, media access, deletion, export, notices, support | 1 |
| 22 | iOS integration | native requirements, audio, Files/Share Sheet, offline, notifications, store compliance | 1 |
| 23 | **Student 1.0 release gate** | real-device E2E, subscriptions, multiuser security, recovery, store review | **1** |
| 24 | Teacher roles & links | mode switch, invitations, teacher-student N:M, grant/revoke access | 2 |
| 25 | Private/group lessons | 1:1, 1:N, optional co-instructors, group membership vs attendance | 2 |
| 26 | Booking | availability, invite links, approvals, recurring lessons, makeup/cancellation | 2 |
| 27 | Collaborative feedback/homework | common + individual visibility, voice feedback, submissions | 2 |
| 28 | Lesson packages & billing | individual enrollments, per-student ledger, attendance-adjusted credits, refunds | 2 |
| 29 | Teacher AI & pricing | lesson summaries requiring teacher approval, operational tools, Teacher plans | 2 |
| 30 | **Teacher 2.0 release gate** | N:M, group permissions, attendance, billing & end-to-end QA | **2** |

## IA snapshot
Student bottom navigation: **Home / Songs / Record / Calendar / Growth**.
Student secondary flows: songs→lyrics/scores/recordings/lessons/homework; record→library/import/A-B; calendar→lessons/practice/homework/performance; settings→storage/subscription/export.
Teacher navigation (2.0): **Home / Students / Calendar / Feedback / Management**.
Teacher flow: group→session→participants & attendance→common lesson note→private individual feedback→group/individual homework→student-specific credit treatment.
App login is shared. A user can activate both modes; default to last-used mode.

## Conceptual data graph (not SQL or assertion of deployed schema)
- auth.users → profiles (user id), user_roles (user id, role).
- teacher_student_links (teacher id, student id, status), groups / group_members.
- lessons (id, optional group id, starts/ends, state), lesson_instructors, lesson_participants (attendance, billing status).
- songs / song_aliases / song_scores / song_lyrics.
- practices / practice_media, assignments / assignment_recipients, feedback (author, target student, visibility).
- media_files (owner id), media_variants, storage_objects (provider/object key/chunks), media_access_grants (principal, permission, expiry). **A share does not transfer ownership or duplicate storage quota**.
- lesson_packages / enrollments / credit_transactions / lesson_payments **separate from** app plans / subscriptions / usage events.
- ai_jobs / transcriptions / ai_analyses / ai_usage; performance / performance_participants / performance_songs.
- Referential integrity, RLS, audit/versioning and exact tables must be established in phase 03; do not blindly create all future tables in 1.0.

## Invariants and decisions
1. Never reset existing user data, overwrite binary originals, or delete legacy media to do a refactor.
2. Legacy localStorage `vocal-zip_mvp_v1`, IndexedDB `vocalzip_media_v1`/`recordings`, Supabase `vocal_data.payload` and the separate `billing/` contract must be assessed before migration.
3. Recording ≠ practice session; attaching media does not count additional practice time. Deleting a lesson should not delete its original audio/homework.
4. A recorded teacher name in student 1.0 is **not** an authenticated teacher identity and cannot later acquire access automatically.
5. Group lesson common information is visible to participants; individual feedback, recordings and financial data are **private** by default. Group membership ≠ session attendance. Lesson marked complete ≠ blanket credit debit.
6. Supabase for structured metadata/auth; R2 is a **planned** media architecture, not an assertion it's deployed. Validate actual infra and auth before changes.
7. Original media/date/ID provenance is preserved. Audio fidelity prioritized; video can use lower-resolution derivatives, original preserved under policy.
8. Personal migration scope: only explicitly allowlisted owner's account. Video candidates 2025-12-31..2026-09-13, Voice Memos 2025-07-24..import date, 30s..8min, require review. Web cannot silently access full iPhone Voice Memos library.
9. Tentative plans/prices: student Free 1GB / Plus 20GB 4,900 KRW / Pro 100GB 9,900 KRW; teacher plans TBD. These are **not approved production prices**.
10. Discussed cancellation behavior: 29-day grace following actual paid expiry, consider excess-media cleanup starting day 30 with notice and export. **Not an authorization to implement destructive deletion until product/legal review**.
11. AI audio pitch/breath/voice quality measurement is not considered complete. Validate models/metrics and report uncertainty.
12. No public secrets, tokens, user recordings, personal data, or service-role credentials in Git.

## Source-of-truth and current evidence
- `README.md`: current v6 documented feature behavior and links.
- `docs/UIUX_v6_개편_2026-11-04.md`: view architecture and compatibility.
- `docs/VOCALzip_Codex_인수인계_2026-11-03.md`: older historical phase mapping and known issues; may be stale.
- `docs/운영검증_2026-11-04.md`: automatic tests versus real-device and production gaps.
- Old phase titles are inconsistent across docs and PRs; phase 01 **must reconcile** history. A file/PR existing never means production verified.

## Collaboration rule
Claude/Codex should **read this roadmap + Phase 01 audit brief + repo README first**, then investigate actual code before recommending edits. Record: evidence (paths/commit), verified status, outstanding QA, risks, next tasks. Avoid changing current production app while performing read-only Phase 01.
