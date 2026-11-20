# VOCAL.zip — tech and workflow (Kiro steering)

## Stack

- A PWA with no build step. Plain JavaScript files are loaded by `<script>` tags in `index.html`.
- Served by GitHub Pages from `main`.
- Cloud data: Supabase (`vocal_data.payload`, edge functions in `supabase/functions/`). Media: Cloudflare R2 through the worker in `r2-worker/`. Cloudflare deploys that worker automatically from `main`.
- Pure models use a UMD wrapper so Node tests can `require` them. Example: `app/growth-metrics-model.js` exports `root.VzipGrowthMetrics`.
- Icons: Phosphor (`ph ph-…`).

## Changing a script

When you change a script, bump its `?v=` in `index.html`. `tests/polish-audit.spec.cjs` enforces two rules:
- at most 24 characters;
- at most one date.

## Data changes

- All data changes go through `VZ.change(mutate)` in `app/core.js`. It stamps `updatedAt` and writes the app record.
- Synced lists merge by `id` with tombstones (`deleted`, `deletedAt`).

## Git and pull requests

1. Work on a new branch. Never push to `main`.
2. Open a pull request.
3. Wait for the GitHub Actions checks. Do not merge your own pull request. The owner's main assistant reviews it and merges it.
4. Merge `origin/main` into your branch just before pushing.

## Tests

- Node unit tests: `node --test tests/<name>.test.cjs`
- Browser tests: `npx playwright test <spec> --project=chromium-mobile --project=chromium-desktop`
  - The config also has `webkit-mobile`, which CI runs.
- Syntax check: `npm run test:syntax`
- Each feature area has a quick workflow in `.github/workflows/`. Add a new spec to the fitting workflow.
  - growth → `growth-listen-check.yml`
  - scores → `scores-check.yml`
  - home → `student-home-check.yml`
  - practice set → `practice-set-check.yml`
- `tests/growth-characterization.snapshot.json` pins the growth numbers. A redesign may change labels and layout. Numbers change only when you mean to change them and explain why in the PR.

### WebKit rule

Never call `page.goto()` with the URL the page is already on. WebKit reloads the page, and in-page test fixtures disappear. Change `location.hash` through `page.evaluate` instead.

### CI artifacts

CI artifacts cannot be downloaded by the assistant. When a test fails, put what the screen showed into the error message itself (see the `noOverflow` helper pattern in the specs).

## UI

- Read `docs/design/VOCALZIP_DESIGN_SYSTEM_V4_2026-11-12.md` and `AGENTS.md` before changing UI.
- Accent purple `#7A32F5`; light canvas `#F8F6FD`.
- Doing-screens (the practice runner) are dark with purple. Viewing screens are light.
- Mobile first: 390×844. Also check iPad 820×1180 and 1180×820.
- Tap targets ≥ 44px. No horizontal page scroll.

## Files not to touch without being asked

The main assistant or another agent owns these files:
- `app/voice-path*.js` internals
- `app/analysis.js`
- `app/mr-cancel.js`
- `app/precision-*.js` internals
- `worker/*`
- `supabase/*`
- `sync/*`, `cloud-sync.js`
- `data-merge.js`
- `app/score-ink*.js`

If a task needs one of them, say so in the PR instead of editing it.
