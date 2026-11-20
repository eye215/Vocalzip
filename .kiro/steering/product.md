# VOCAL.zip — product (Kiro steering)

VOCAL.zip is a personal vocal-practice PWA for one singer, used mostly on iPhone and iPad Safari as an installed app. The UI is Korean, written in plain 해요체.

The app holds:
- songs, lessons with feedback and homework, practice records, and recordings (audio);
- sheet music with handwriting;
- vocal analysis of recordings;
- growth screens;
- a daily practice set (오늘의 연습);
- levels (단계).

The owner is a singer, not a developer. They judge work only by what they see on the device.

## How the owner talks to us

- The owner writes short Korean messages.
- Answer in Korean, 해요체, plain words. No code or internal names in user-facing text.
- Report three things separately:
  - what is coded;
  - what passed automated tests;
  - what was really checked on an iPhone or iPad.
- Never call something done that was not built.

## Rules that are never broken

1. **No data loss.** Never delete, reset or overwrite user records, recordings or analysis results.
   - A screen may change. The data behind it stays.
   - Deleting a song does not delete cloud files.
2. **Storage contracts stay compatible.** These are compatibility targets:
   - localStorage `vocal-zip_mvp_v1`
   - IndexedDB `vocalzip_media_v1` / `recordings`
   - Supabase `vocal_data.payload`
   - the separate billing data (`billing/`)
3. **No new top-level list in the app record.**
   - `data-merge.js` merges only the lists in its `COLLECTIONS`. A new top-level list would be overwritten by another device.
   - Put new rows into an existing synced list (for example `practicePlans`, `practices`, `scoreAnnotations`, `comparisonReports`) with their own `kind` and a stable `id`.
4. **Practice time is never derived from recordings.** It comes from what the person entered or from the practice runner's active time only.
5. **Numbers are observations, not verdicts on talent.** Write "흔들림이 줄었어요", not "잘해요".
6. **Nothing is sent to an outside service without the owner's confirmation.** Handwriting sent to OpenAI, for example, needs a confirm dialog every time.
7. **No secrets, tokens, personal recordings or personal data** in code, commits, logs, test fixtures or PR text. GitHub Actions logs are public.
8. **Sheet music the owner bought, their audio, and diagnosis files are never committed.**
