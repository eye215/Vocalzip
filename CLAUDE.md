# VOCAL.zip — AI developer handoff
This file is read by Claude Code and is also the shared working contract for Codex/ChatGPT.

## Product priorities
1. **Student Release 1.0 first**, fully functional and validated on real iOS devices.
2. **Teacher Release 2.0 later**, including N:M teacher/student connections and 1:N group lessons.
3. Product phases are a **proposed 30-phase plan**, not fixed historical numbering. Verify actual implementation and old PRs before claiming done.

## Read first
- [Product roadmap](docs/VOCALZIP_PRODUCT_ROADMAP_2026-11-07.md)
- [Phase 01 audit kickoff](docs/VOCALZIP_PHASE01_AUDIT_PLAN.md)
- [README](README.md)
- [UI/UX v6 architecture](docs/UIUX_v6_개편_2026-11-04.md)
- [Operating verification](docs/운영검증_2026-11-04.md)

## NEXT TASK: Phase 01 READ-ONLY AUDIT
Inspect existing implementation and data architecture, compare roadmap vs code, create evidence-based docs listed in Phase 01. Do **not** begin rewriting, migrating DB, moving media, deploying, deleting files, or modifying production data. Preserve current storage schemas and existing billing project. Use safe synthetic test data only.

## Hard rules
- No destructive changes, no data loss. Snapshot and reversible migration plan required before future changes.
- Current `localStorage: vocal-zip_mvp_v1`, `IndexedDB: vocalzip_media_v1/recordings`, Supabase payload and `billing/` must be treated as existing compatibility contracts until verified.
- v6 currently records audio; according to its docs, importing MOV extracts audio. Do not assume retained original video, deployed R2, or verified audio AI analysis.
- A recorded teacher name is not an authenticated teacher account. No automatic access on later signup.
- Share media by authorized grants; never expose other students' private data or duplicate ownership storage by sharing.
- Separate student personal lesson expense records from teacher billing ledgers and app subscription.
- No secrets, tokens, real personal records, or private audio in commits or logs.
- Report what was inspected, verified, unverified, and tested; mocked test success ≠ production or iPhone validation.

## Suggested response to owner
Summarize: (a) what exists, (b) what is broken/missing, (c) real-data risks, (d) prioritized first safe PRs and acceptance tests. Ask for explicit approval before destructive or production-affecting operations.
