# PR #73 safety review — 2026-11-06

Decision: keep Draft, do not merge or activate paid analysis yet.\n\n## 2026-11-06 additional safeguards\n\n- Added `vzipCloudMediaAssignSong` to fetch current cloud metadata, preserve unrelated fields, and compare-and-swap the `updated_at` revision on each song-only write.\n- Added local-first compatibility in `M.assignSongSafe` with explicit song preconditions. Apply now records confirmed successful writes and the post-write version; undo rejects later modifications rather than relying only on matching song ID.\n- Limited each manual analysis action to one paid candidate in the browser; **this is not a secure server-side daily quota or hard dollar limit**.\n- Server-side atomic quota is now present: 3 requests/day and 15 total per account. The migration `vzip_song_stt_quota` was successfully applied to VOCAL.zip Supabase on 2026-11-06 and verified to deny table SELECT for authenticated/anon while permitting authenticated-only RPC invocation. The function was deployed as `vzip-song-stt` v8 (JWT validation on). This is a call-count cap, **not** a dollar limit.\n- Keep `STT_ENABLED=false` until the full PR passes UI/browser CI and real Cloudflare excerpt tests; verify the switch in the Supabase dashboard because secrets cannot be read back.\n

## Cloudflare Media Transformations release finding (2026-11-06)

- Cloudflare's current documentation supports the Media Transformations binding in public beta, `audio` output to AAC/M4A, and processing private R2 inputs. However **official input guidance is MP4 video with H.264 + AAC/MP3**; standalone Voice Memos `.m4a` input is **not guaranteed**. Never promise 3–5 minute audio-only M4A trimming without a real test.
- The binding `[media] binding = "MEDIA_TRANSFORM"` remains commented out and the R2 Worker is not deployed with the new `/v1/clip/` endpoint. Enabling the binding or remote Worker is a separate Cloudflare account action, not achieved by GitHub CI. Cloudflare connectivity cannot be verified through existing GitHub/Supabase connectors.
- Cloudflare docs state binding transformations are not billed **during public beta**, with potential charges after beta. Do not interpret this as an unconditional forever-free feature. Media Transformations may have separate limits.
- The UI no longer claims audio-only M4A works automatically. If live audio-only M4A fails, build/test a separate audio-trimming mechanism before activating any paid STT path.
- Source: https://developers.cloudflare.com/stream/transform-videos/bindings/ and https://developers.cloudflare.com/stream/pricing/

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
- No live paid API call, remote transform, billing-data edit, backup restore or deletion occurred. Later in this task the new quota migration was applied and Supabase Edge Function v8 deployed; secret values remain unreadable.

## Billing and backup interaction

- Main at review time is `fcbf6fd` (PR #71, saved-version history); PR #70 billing-rebuild safety is also merged. `git merge-tree` found no textual conflicts between the original PR head and this main.
- Open billing PR #36 changes billing files and `index.html`; PR #73 also changes `index.html`. Recheck the integration when either branch advances.
- This review changes no billing implementation, backup implementation or migration. Existing billing/backup unit tests pass.
- Important semantic risk: `VZ.media.update` delegates cloud writes to `vzipCloudMediaUpdate`, which replaces the entire metadata JSON from the supplied snapshot. A fresh list followed by an update is not an atomic comparison. Another device's review/date/song changes can be overwritten. Local undo is not covered by the main saved-version history migration.

## Remaining release blockers

1. Review and verify the new account-bound song-only optimistic updates and applied-only undo on real cloud/local devices, including partial cloud/local failures; add integration tests. A crash between successful cloud write and local backup status update still needs recovery support.
2. Verify actual audio format and duration server-side before paid transcription. Filename/MIME/6 MiB checks do not prove a 30-second excerpt. Atomic request-count limits are now deployed (3 per UTC day / 15 total), but a true monetary cap and robust media-duration validation remain to be implemented; an allowlist alone is not sufficient.
3. Verify audio-only M4A input through the real Cloudflare transform service and actual iPhone Safari behavior, then assignment/sync/undo against disposable data. Mocks prove our routing and options, not service compatibility or device memory use. Keep paid services off until separately authorized.
4. Run all checks on the final integration with current main. Local browser tests were not rerun; GitHub Actions covers them. Check deployment compatibility for the new authenticated GET endpoint before any rollout.
5. Existing R2 development dependencies have three high-severity npm audit entries (Miniflare via sharp/undici). These predate this change and are development tooling, not imported Worker runtime code. Resolve in a controlled dependency update; do not blindly apply the suggested breaking downgrade.

## Documentation consulted

- https://supabase.com/docs/reference/javascript/auth-getuser — server validation of bearer tokens.
- https://developers.cloudflare.com/stream/transform-videos/bindings/ — binding API and local simulation limitations. The page describes a free beta but also usage-charge caveats; this review assumes no cost entitlement and makes no remote transform calls.
