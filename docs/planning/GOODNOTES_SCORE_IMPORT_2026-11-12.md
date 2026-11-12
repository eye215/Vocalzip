# GoodNotes → VOCAL.zip score importer (2026-11-12)

## Scope and verified fixture

Sample: `유리의 Favorites 2.goodnotes`. ZIP entries include `index.notes.pb`, `index.events.pb`, one PDF under `attachments/`, and a search index. The embedded PDF is the original **The River** score (5 pages). Native GoodNotes handwriting is stored separately from the embedded PDF; it is **not** an editable PDF annotation. A notebook outline or song-boundary list was **not verified** from the sample.

## Completed in this PR

- Read-only utility `tools/goodnotes_extract.py` extracts embedded original PDFs, without replacing, altering, or flattening the `.goodnotes` source.
- Validates ZIP expansion size and PDF signature; outputs a JSON manifest that explicitly declares native ink and outline unsupported.
- Accepts explicit, 1-indexed page ranges to split a single embedded PDF into named song PDFs (requires `pypdf`). Rejects invalid and overlapping ranges.

Usage:

```bash
python tools/goodnotes_extract.py "유리의 Favorites 2.goodnotes" --out /tmp/score-export
cat > /tmp/ranges.json <<'JSON'
[{"title":"The River","start":1,"end":5}]
JSON
python tools/goodnotes_extract.py "유리의 Favorites 2.goodnotes" --out /tmp/score-split --ranges /tmp/ranges.json
```

## Next implementation milestones (not completed in this PR)

1. **Notebook metadata parser:** investigate GoodNotes protobuf schema, extract/validate notebook outline bookmarks and page order across versions. Never infer song boundaries silently; show confidence and user confirmation.
2. **User import flow:** iPhone Safari-safe upload to existing score management UI; generate candidate ranges, rename/reorder/edit, preserve source and avoid replacing existing score by default; exact song-match confirmation.
3. **Ink layer migration:** determine whether strokes (coordinates, page id, brush color/width, erase edits) can be decoded reliably from event stream. If yes, transform to VOCAL.zip's existing vector ink format, keeping an independent import layer; if not, display as non-editable overlay only with clear labeling.
4. **Storage/permissions:** secure private score storage and account ownership, error handling for large archives and malformed ZIPs, idempotent retry, versioned imports, rollback.
5. **End-to-end validation:** iPhone Safari, several GoodNotes versions, with/without outlines, PDF/scan mixed pages, reused song names, transforms and zoom/rotation; verify all imported ink alignment before allowing edits.

Existing `app/score-ink.js` remains unchanged. In particular, **this is not an operational GoodNotes importer in the UI**, and it does not read native GoodNotes outlines or make GoodNotes ink editable.
