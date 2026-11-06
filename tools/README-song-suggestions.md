# VOCAL.zip one-time song suggestion POC

**Status: proof of concept, not connected to the VOCAL.zip UI or cloud.**

This tool suggests existing song IDs for **unassigned recordings only**. It reads local copies or existing text, never changes media files, Supabase, or Cloudflare R2, and never commits assignments automatically.

## Inputs

Create `media.csv` with UTF-8 columns `id,name,path,songId`. Rows with nonempty `songId` are skipped. `path` points to an audio file on the Mac. You can optionally add `transcript` to reuse preexisting text and `recordedDate`. **Do not publish real user manifests/audio in Git.**

Create `songs.csv` with columns `id,title,aliases,lyric_hints`. Separate aliases and **user-provided short lyric hints** with `|`. The tool **does not search the web for copyrighted song lyrics**.

Example catalog:

```csv
id,title,aliases,lyric_hints
song001,Out Here on My Own,Out Here on My Own,
song002,The Winner Takes It All,Winner Takes It All,
```

For filename-only classification (no dependencies):

```sh
python3 tools/song_suggestions.py --media media.csv --songs songs.csv --dry-run --limit 10
```

For STT on unassigned local audio:

```sh
# Mac: install ffmpeg and faster-whisper in your own Python environment
brew install ffmpeg
python3 -m pip install faster-whisper
python3 tools/song_suggestions.py --media media.csv --songs songs.csv --audio-dir /path/to/audio --limit 10 --language en
```

The script starts with a 30-second excerpt around second 20 (configurable `--offset`, `--seconds`). It caches each transcription by file ID/path/size/mtime so retries do not rerun STT. **No existing R2 file is downloaded automatically.** If the original exists only in R2, download securely with an authorized user's session before running this POC; do not embed auth tokens in code.

Review `stt-song-review/review.csv`, listen to uncertain items, and put approved IDs in `approved_song_id` for a later import stage. The displayed score is a heuristic similarity indicator, **not a calibrated probability**. No mutation/approval importer is included: any future writer must validate each row's user ownership and current `songId`, update only the song fields of the same `vocal_media.metadata`, back up before applying, support rollback, and avoid overwriting concurrent edits.

## Next work for in-app experience

The product asks for: **보관함 > 미분류 > select recordings > AI 곡 추천 > review > approve selected**. Integrate this only after upload/recovery and billing backup work has stabilized. Implement STT in a secure compute environment (never in Cloudflare R2), using batch processing with opt-in and a cost preview. The currently shipping code does **not** provide in-app song recommendations. No auto-classification if confidence is weak. Show `미분류` when unrecognized.

Run tests:

```sh
python3 -m unittest discover -s tools -p 'test_song_suggestions.py'
```
