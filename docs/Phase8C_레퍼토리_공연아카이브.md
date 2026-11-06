# Phase 8C — Musical repertoire and performance archive

Started from 30f01baee738aedd78ebeb962a6e6b55540c2898; integrated main bb8efab7ea2ef5127a7f8efd0c4abeb6a47949de including Phase 8A scores and Phase 8B practice tips. Branch: codex/phase8c-repertoire-performances.

## Ownership / integration contract

- app/repertoire-model.js: pure validation, statistics, reference cleanup and account projection.
- app/repertoire.js + repertoire.css: scoped sheets, repertoire controls, performances/show routes. Existing song detail is extended through one optional slot and callback; its recordings, lessons, lyrics, growth and AI sections remain intact.
- app/performance-assets.js: existing VzipR2 transport, private originals, metadata retry journal. No new media server, new library or AI job.
- Song IDs stay unchanged. song.repertoire stores status, role, kind, language, memo, manual skills, keys and takeId; song.title/show remain the canonical title/work.
- performances is an optional array in the existing vocal_data JSON payload, tracked/merged by ID using the existing version-aware cloud sync and history. A production embeds sessions, songLinks and assets. No statistics tables or new database migration.
- Records have ownerId. Repertoire writes require the current logged-in identity; archive lists filter by that owner. Only the outbound cloud payload projects out another account's performances and repertoire fields; merging remote rows preserves the other account's unsynced local archive copy. Existing vocal_data RLS remains the server-side boundary; it is not replaced by client filtering.
- For parallel Claude work: preserve optional VZ.repertoire hooks in views-main.js, the performances collection in core/data-merge, and scripts in index.html. No AI server/queue changes. Before merge, compare latest main and resolve shared-file conflicts explicitly.

## Policies

Unspecified legacy status/skills remain unclassified/unrated. Skills are manual 1–5, separate from AI. Key changes are metadata only. Representative takes reference existing media IDs; confirmed deletion tombstones clear references. A failed/offline list fetch never clears a reference merely because the file is absent.

A production requires title and start date. Separate sessions use unique IDs; duplicate date/time/session-number tuples are rejected. Actual appearance statistics count appeared sessions, exclude cancelled productions, and count each production record separately (including separate stagings of the same title). Year filtering uses the production start year.

Song links retain title/work snapshots. Removing a song unlinks it while retaining performance history; removing a production leaves all existing songs, recordings, lessons, practices and AI results untouched. Productions with attachments must have their files explicitly deleted before the production can be removed, preventing unreachable private blobs.

## R2 attachments

A small allowlist extension to the existing worker accepts image JPEG/PNG/WebP/GIF/HEIC, PDF, plain text and DOCX only with purpose=performance and a performance- prefixed asset ID. Existing audio/video support remains. HTML/SVG/scripts are rejected; nosniff is sent and archive documents download as attachments. Video is uploaded unchanged, bypassing audio extraction and recording/AI pipelines. File limit is 1 GiB in the UI. The Worker enforces user key ownership and token checks on upload/sign/read/delete. Existing R2 upload uses bounded 8 MiB parts and retries.

Metadata is stored in the performance inside Supabase vocal_data through existing sync, not vocal_media. Each upload uses a new asset ID; metadata-save failure retains the completed asset in an account-scoped local pending journal for retry without another binary upload. The existing media upload diagnostic excludes performance- objects from its missing-recording-row warning.

Worker changes must be deployed through the existing R2 deployment process before image/PDF/document upload works in production. Frontend code does not deploy a Worker. Network access and the authenticated production R2/Supabase configuration must be verified separately.

## Validation commands

- node --test tests/repertoire-model.test.cjs
- npx playwright test tests/repertoire.spec.cjs
- cd r2-worker && npm ci && npm test

Tests include a mocked cloud merge/upload round trip that keeps foreign unsynced archives on the device and excludes them from the current account's payload. Tests cover validation, field preservation, multi-device merge/tombstones and account projection; repertoire save/filter/keys/skills, sessions, cross-linked songs, take references, archive CRUD, upload retries and 320/390px sheets; Miniflare checks private attachment ownership and unsafe MIME rejection. Browser auth/R2 is mocked. Real iPhone/PWA, real login and two physical-device cloud round trips are not implied by these checks. Latest CI results are recorded on the PR.

P2 animation/gallery refinements are omitted. Existing cloud sync uses record-level conflict resolution: concurrent edits to the same production follow its updatedAt policy, not field-level collaboration.
