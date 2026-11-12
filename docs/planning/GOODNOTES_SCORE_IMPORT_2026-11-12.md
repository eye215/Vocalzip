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


---

## Update 2026-11-12 (later the same day): outline and ink decoded, in-app import added

The two open questions above are answered for the sample (schema 26). What follows replaces the "not verified" / "not decoded" statements for that schema; other GoodNotes versions are still unverified.

### What the file contains (verified on the sample)

| Part | Where | Notes |
|---|---|---|
| Events | `index.events.pb` | `[varint length][protobuf]` records. Kinds read: 30/31 document title, 6 attachment, 2 page background (attachment + PDF page number + page size), 54 page (+ order key), **65 outline entry (title → page)**. Other kinds are counted, not interpreted. |
| Index | `index.attachments.pb`, `index.notes.pb` | id → path inside the zip |
| Ink | `notes/<page id + 1>` | per item: colour (r,g,b,a floats), Apple LZ4 frame (`bv41`/`bv4-`/`bv4$`) holding a `tpl` tuple `vuA(v)A(S(uu))A(S(uuuu))vA(f)`: width, element kinds (0 move, 1 quadratic curve), points as float bits. An erased item keeps an empty path and flag 14. |

Rendering the decoded strokes over page 1 of the embedded PDF puts them exactly where GoodNotes shows them (four highlighter slashes, one circle).

### Implemented

- `app/goodnotes-parse.js` — reads the notebook on the device: pages in notebook order, outline → sections (songs), ink → the score viewer's stroke format (page-normalised points). Read-only; size limits on the archive and each entry; unknown ink shapes and erased items are counted and left out.
- `app/goodnotes-import.js` — 악보 탭 → `PDF 올리기` → `굿노트 파일에서 가져오기`. Shows one row per outline section (title, pages, ink count, target song: matching song / new song / skip). On confirm, per section: build the song's PDF from its pages (pdf-lib), upload it as a normal score, add the score entry, then store the ink as editable records bound to that PDF's SHA-256.
  - Only adds: nothing existing is replaced; the `.goodnotes` file is never uploaded; pages before the first outline entry are skipped by default; an already imported section is skipped by default.
  - Ink budget: editable ink lives twice in localStorage (record list + account recovery copy), so one import takes at most ~900 strokes / ~260k characters and never more than the recovery copy can hold. A section over the budget has its ink drawn into its PDF (visible, not editable) and says so before the import.
  - Retry continues from the failed section; finished sections are not uploaded again.
- Tests: `tests/goodnotes-parse.test.cjs` (7, synthetic archives), `tests/goodnotes-import.spec.cjs` (4, browser, fake R2). The real sample is used locally only and is not in the repository.

### Not verified yet

- Only one real file: 1 page, 1 outline entry, highlighter strokes. **Pen strokes with pressure, text boxes, images, shapes, lasso-moved ink, multi-page ink files, several PDFs in one notebook, page deletions/moves in the event log** have not been seen. Pen width falls back to the median of the per-point values when the single width is 0 (a guess).
- The "ink file id = page id + 1" rule comes from one page. Ink files that match no page are counted and not imported.
- GoodNotes 5 / other schema versions; iPhone Safari with a large notebook (memory); real R2 upload.
