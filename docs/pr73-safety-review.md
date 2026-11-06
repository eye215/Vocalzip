# PR #73 safety review — 2026-11-06

Decision: keep Draft, do not merge or activate paid analysis yet.

## Fixed in this review

- Corrected the Worker extension regex which rejected normal M4A/MP4 keys.
- Added independent default-off extraction and mandatory user allowlist gates before R2 reads/transforms. Commented out automatic transform-binding provisioning.
- Added a free authenticated STT readiness check before browser extraction. Server POST authorization remains enforced independently.
- Bounded request bytes while streaming, even when Content-Length is absent or forged; removed upstream error bodies from logs; tolerated null catalog entries.
- Serialized analysis/apply/undo including confirmation time, disabled editing during work, froze approved song choices, and stopped pending operations when the account changes or the view disappears.
- Scoped suggestion caches, selection checkpoints and undo pointers by account. Old unscoped records are not adopted or deleted.
- Corrected Python date normalization and Windows Miniflare test paths.
- Added offline safety and mocked transformation regression tests and a CI workflow. No real API key or user recording is used.

## Validation

- Application/billing Node suite: 86 passed, 5 skipped (FFmpeg unavailable). Two subsequent assignment/undo tests also passed, bringing covered Node cases to 88 passed.
- R2 Worker suite: 13 passed, including ownership, default-off gates and successful mocked M4A extraction.
- Python suite: 4 passed. JavaScript syntax and whitespace checks passed.
- Original PR head `67bdc2524d11bd4d08e870bafc310d037803f3fd`: UI, Billing and R2 GitHub Actions succeeded. These original runs do not validate the new review commit; inspect its fresh CI separately.
- No live paid API call, remote transform, deployment, migration, billing-data edit, backup restore or deletion occurred. Live secret/deployment state was not verified.

## Billing and backup interaction

- Main at review time is `fcbf6fd` (PR #71, saved-version history); PR #70 billing-rebuild safety is also merged. `git merge-tree` found no textual conflicts between the original PR head and this main.
- Open billing PR #36 changes billing files and `index.html`; PR #73 also changes `index.html`. Recheck the integration when either branch advances.
- This review changes no billing implementation, backup implementation or migration. Existing billing/backup unit tests pass.
- Important semantic risk: `VZ.media.update` delegates cloud writes to `vzipCloudMediaUpdate`, which replaces the entire metadata JSON from the supplied snapshot. A fresh list followed by an update is not an atomic comparison. Another device's review/date/song changes can be overwritten. Local undo is not covered by the main saved-version history migration.

## Remaining release blockers

1. Implement and test atomic, account-bound song-only updates with optimistic concurrency, including partial cloud/local failures. Undo must record confirmed successful writes and compare the exact assigned version; the current song-ID-only comparison can undo a later same-song edit. This needs a reviewed persistence/API contract, beyond the UI-level lock added here.
2. Verify actual audio format and duration server-side before paid transcription. Filename/MIME/6 MiB checks do not prove a 30-second excerpt. Add durable request metering/rate limits and an enforceable spending cap; an allowlist alone does not bound repeated/concurrent spending.
3. Verify audio-only M4A input through the real Cloudflare transform service and actual iPhone Safari behavior, then assignment/sync/undo against disposable data. Mocks prove our routing and options, not service compatibility or device memory use. Keep paid services off until separately authorized.
4. Run all checks on the final integration with current main. Local browser tests were not rerun; GitHub Actions covers them. Check deployment compatibility for the new authenticated GET endpoint before any rollout.
5. Existing R2 development dependencies have three high-severity npm audit entries (Miniflare via sharp/undici). These predate this change and are development tooling, not imported Worker runtime code. Resolve in a controlled dependency update; do not blindly apply the suggested breaking downgrade.

## Documentation consulted

- https://supabase.com/docs/reference/javascript/auth-getuser — server validation of bearer tokens.
- https://developers.cloudflare.com/stream/transform-videos/bindings/ — binding API and local simulation limitations. The page describes a free beta but also usage-charge caveats; this review assumes no cost entitlement and makes no remote transform calls.
