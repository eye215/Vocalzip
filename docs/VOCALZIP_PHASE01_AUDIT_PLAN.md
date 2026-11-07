# PHASE 01 — Current-state audit and safe kickoff (Claude / Codex)
Date: 2026-11-07 | Status: **READY TO START / READ-ONLY**
Related: [Product roadmap](VOCALZIP_PRODUCT_ROADMAP_2026-11-07.md)

## Mission
Create an evidence-based current-state map before refactoring or adding features. Target: **Student Release 1.0 first, Teacher Release 2.0 second**. Preserve user data. Audit is not an instruction to implement or deploy code.

## Order of operations
1. Record inspected branch, HEAD SHA, deploy/environment assumptions and docs read. Resolve README vs older docs vs code when mismatched.
2. Map app entrypoints, runtime modules, dependencies, build/test/deploy workflow and status of `legacy.html`.
3. Walk **student E2E**: sign-in → song create → record/import → local save → cloud backup → library playback → attach to practice → lesson/homework → calendar/growth → re-login. Annotate each step with source paths and test evidence.
4. Inspect current **localStorage schema** (`vocal-zip_mvp_v1`), IndexedDB (`vocalzip_media_v1/recordings`), Supabase `vocal_data.payload`, media/chunk refs and billing's separate data contract. Read-only inspection; no production query requiring secrets in output. Note dates, IDs, deleted markers, concurrency.
5. Verify actual use of Supabase Storage vs Cloudflare R2; identify upload, byte-range playback, chunks, cache, retry, offline behavior and access grants. **Do not assume R2 is configured**.
6. Evaluate auth/RLS/data tenancy (multiple users, logout, tokens, ownership), secure media sharing and missing validations. Never log secrets or user data.
7. Inspect `billing/` as separate project and contracts; do not merge it into UI or alter the payment ledger.
8. Crosswalk historic phase docs/PRs with the new **30-phase proposal**. Provide verified statuses: implemented/partial/not present/untested. Don't conflate legacy phase IDs with new ones.
9. Run available static/unit/browser tests in isolation with safe fake data; tests mocking Supabase or virtual media **do not prove** real iPhone or production cloud functionality.
10. Prepare risks, dependencies, and a small first implementation backlog. No schema migrations, production writes, deletion, destructive cleanup or deployment.

## Initial files to inspect
- `README.md`
- `docs/UIUX_v6_개편_2026-11-04.md`
- `docs/VOCALzip_Codex_인수인계_2026-11-03.md`
- `docs/운영검증_2026-11-04.md`
- `docs/레슨데이터_연동계약.md`
- `index.html`, `legacy.html`, `app/core.js`, `app/media.js`, `app/views-main.js`, `app/views-lessons.js`, `app/views-more.js`, `cloud-sync.js`, `chunk-media-core.js`, `share-worker.js`, `billing/`, `tests/`, GitHub Actions workflows.

## Questions the report must answer
- Which 1.0 features exist **in code**, which have tests, and which work on a physical iPhone?
- What are the live/legacy DB fields, media object shapes, media IDs, and associated contracts?
- Is cloud auto-backup actually durable and safe across concurrent clients?
- Where can data be lost, orphaned, duplicated, silently overwritten, or cross-user exposed?
- Is the current app architecture fit for student 1.0 expansion and future teacher 2.0? What is the smallest safe improvement?
- Are video imports intentionally audio-only right now? What is required to support actual video preservation?
- Which planned AI features are real inference versus memo summarization?
- What historical roadmap items have been implemented or abandoned?
- What additional access or manual real-device QA is required?

## Deliverables (commit docs only, after audit)
1. `docs/audit/2026-11-07-current-state.md`: architecture diagram, data flow, dependencies, file references and tested facts.
2. `docs/audit/2026-11-07-phase-mapping.md`: legacy → proposed phases, evidence, gaps.
3. `docs/audit/2026-11-07-risks-and-test-plan.md`: prioritized issues, test matrix, production verification prerequisites.
4. `docs/audit/2026-11-07-next-actions.md`: P0/P1/P2 tasks with acceptance criteria, smallest safe PR order, no speculative ETAs.

## First implementation candidate **after audit approval**
- Resolve critical student path failures without redesign: record/import → save → library playback → practice/lesson attachment → cross-device recovery.
- Respect v6 UI contracts; clarify video import behavior (current v6 docs say MOV video is **audio-extracted**, not video preserved).
- Add regression tests for failed save, retry, duplicate IDs, removal, missing cloud, multiuser read protection.
- Only after these are stable, decide R2 adapter and migration approach.

## Acceptance criteria for Phase 01
- Every important claim has file path/commit/test evidence.
- Unknowns explicitly marked unverified.
- Current live code and data remain unchanged.
- A developer who did not join the chat can understand exactly what to inspect/build next.
