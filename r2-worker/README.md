# vocalzip-media (Cloudflare Worker)

VOCAL.zip media API on R2. Deployed by Cloudflare Workers Builds from this folder
(`main` branch, root directory `r2-worker`, deploy command `npx wrangler deploy`).

- Setup guide: `../docs/R2_설정_가이드.md`
- Bindings and plain settings come from `wrangler.toml`; secrets (`SIGNING_SECRET`,
  optional `SUPABASE_JWT_SECRET`) are set in the Cloudflare dashboard only.
- Check: `https://<worker>.workers.dev/health` → `{"ok":true,"bucket":true}`
- Local tests: `npm install && npm test`
