# VOCAL.zip — Data contracts and Teacher 2.0 extensibility (draft)
Date: 2026-11-07 / **design notes, not deployed schema or migration SQL**.
This is for Phase 01 evidence gathering and Phase 03 schema design, **not permission to change production data**.

## Current contract documented in repo (confirm against code)
| Layer | Existing name / location | Constraint |
|---|---|---|
| Student domain JSON | localStorage key: `vocal-zip_mvp_v1` | Do not reset, rename or discard; snapshots first |
| Local media | IndexedDB `vocalzip_media_v1`, store `recordings` | May contain Blob or ArrayBuffer bytes; normalize read-compatible |
| Cloud metadata | Supabase `vocal_data.payload` | Existing merge uses per-ID updatedAt and tombstones; may lose concurrent edits without server-level versioning |
| Chunk media | Supabase media table and Storage objects (verify exact names) | Preserve object parts and byte-range streaming; signed access |
| Billing subsystem | `billing/`, `docs/레슨데이터_연동계약.md` | Separate ledger and persistence; app reads billing link only |
| R2 | Desired target | **Do not assert it is currently deployed** |

### Existing lesson linkage: compatibility invariants
- `lessons[].id`: stable opaque string, may be legacy, should not regenerate during import.
- `lessons[].date`: local `YYYY-MM-DD`, distinct from UTC instant. Editing is permitted.
- `lessons[].status`: `scheduled` / `done` / `cancelled` / **missing**. Missing means *display as completed in v6*, not automatically persist a new status or debit a credit.
- Existing optional: `startTime`, `endTime`, `place`, `teacher` (free text), `songIds[]`, `songFeedback`, `prepMemo`, `completedAt`, `created`.
- Lesson deletion today may be a hard delete with only associations removed; billing could retain old `lesson_id` references. Migration needs explicit tombstone/ledger handling instead of assumption.
- Keep all v6/v5 cross-compatibility tests until deprecation is confirmed.

## Student 1.0 conceptual entities
Identity: authenticated user, profile, auth provider identities and consents.
Learning: song, song alias, lyrics, score, practice, practice-media link, personal lesson note, homework, performance, comparison report, growth aggregates (prefer derived).
Media: media identity, original metadata/provenance, owned storage objects, optional audio/video derivative, local-to-cloud upload ledger, access grants, access logs.
AI: analysis/transcription/match suggestion job, result, version, model, status, quota usage.
Commerce: plan, entitlement, user subscription, quota/usage, export/deletion workflow.
**Proposed entity names are NOT a directive to create tables now.** Audit first whether JSON payload can migrate safely, in stages.

## Future Teacher 2.0 entities
- `user_roles` with role memberships, not one permanent account type.
- `teacher_student_links`: teacher user, student user, state/invitation, explicit accepted access; N:M.
- `lesson_groups` and `group_members`: ongoing class membership.
- `lessons` and `lesson_participants`: actual individual session and per-student attendance, optional `lesson_instructors` for co-teaching.
- `feedback` with author, target student or common, explicit visibility.
- `assignments` + per-recipient state, distinct from student self-homework.
- `lesson_packages`, enrollments, credit ledger, payment records, independent of *app subscriptions*.

## Relationship design (conceptual, no concrete PK types asserted)
- User 1→N owned songs, practices, lessons/notes, media records.
- Song 1→N practice/media/lesson-song links (many-to-many where needed).
- Media owned by exactly one principal/account billing context; sharing grants additional access only; one binary object may be referenced from multiple records.
- Teacher 1→N teaching links; Student 1→N teaching links; therefore N:M.
- Group 1→N membership and group 1→N sessions. Membership is NOT session attendance.
- Session 1→N participants and 1→N instructors; participant has independent attendance and credit ledger decision.
- A completed session does NOT imply all participants attended or had credits deducted.
- Common feedback can be visible to class participants; individual feedback/recordings and finances default private.

## Required server-side authorization rules
1. Auth user can only access owned private learning records unless a precise valid grant exists.
2. Media signed URLs require short-lived authorization to owner or explicit recipient. No public R2 bucket access by guessable file path.
3. Student entering teacher name (string) is not proof of identity or consent; do not automatically turn it into `teacher_id` on a later signup.
4. Transferring class, unlinking a teacher, exiting a group or expiring a share must revoke relevant access while preserving record ownership.
5. Restrict owner-only migration to exact allowlisted account ID server-side, never just a hidden frontend button.
6. Partition app subscription quotas from teacher lesson payments/ledger; never directly mutate credit balances without ledger transaction.
7. RLS policies and SQL permissions must be designed/tested for ordinary, shared, revoked, and cross-account scenarios.

## Migration planning (before any production writes)
1. Inventory production schema via read-only access, agree current commit and environment.
2. Create **complete metadata snapshot and verified binary inventory** (JSON export alone misses media originals).
3. Choose stable ID mapping; preserve legacy ids as `legacy_id` where new UUIDs are necessary.
4. Test on synthetic and sanitized staging clones; produce row counts, checksum comparisons, referential integrity report, rollback procedure.
5. Implement backward-compatible dual-read or versioned adapter before switching canonical writes.
6. Confirm real iPhone offline→online, two-device conflicts and old app versions behavior.
7. Obtain explicit authorization for the selected migration; monitor canary, then transition.

## Media and retention rules — not yet operationalized
- Original recording fidelity is a priority. If video transcoding is chosen, explicitly distinguish original and 720p derivative plus retained or exportable audio.
- Preserve original `recorded_at` and local calendar date separately, including metadata provenance and manual overrides.
- One owned object may be shared without double charging storage usage.
- Proposed subscription policy: 29-day grace from actual plan expiry, possible disposal of **excess** media starting day 30; this requires clear notice, user choice/export, order, retention confirmation, legal review and a safe preview mode **before** implementing any deletion job.

## Phase 03 deliverables after Phase 01
- Exact ERD including PK/FK/cardinalities, immutable IDs, soft-delete/tombstones and version columns.
- SQL DDL/migrations for selected 1.0 entities only, rollback and integrity audit queries.
- RLS policy/test matrix for owner, granted access, expired/revoked grants, instructor, group member, administrator.
- DTO and endpoint contracts, compatibility adapter from current JSON payload.
- Upload, object-part, playback authorization and usage event flow including retry idempotency.
- Staging migration and production deployment checklist. **No destructive changes** without explicit owner approval.
