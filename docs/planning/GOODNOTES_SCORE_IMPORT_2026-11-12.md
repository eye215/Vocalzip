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

- `app/goodnotes-parse.js` — reads the notebook on the device: pages in notebook order, outline → sections (each outline entry runs until the page before the next one; the last reaches the end), ink → the score viewer's stroke format (page-normalised points). Read-only; size limits on the archive and each entry; unknown ink shapes and erased items are counted and left out.
- `app/goodnotes-import.js` — 악보 탭 → `PDF 올리기` → `굿노트 파일에서 가져오기`. One row per outline section (title, pages, ink count, target song: matching song / new song / skip). On confirm, per section: build the song's PDF from its pages (pdf-lib), **attach the section's handwriting to that PDF as `vocalzip-ink.json`**, upload it as a normal score, add the score entry.
  - Only adds: nothing existing is replaced; the `.goodnotes` file is never uploaded; pages before the first outline entry are skipped by default; an already imported section is skipped by default.
  - No stroke cap and no flattening: the ink is in the PDF, so its size only counts against the PDF limit (50 MB).
  - A page that is rotated or cropped, or a stroke the app cannot represent, stops the import with the reason (nothing is silently dropped or misplaced).
  - Retry continues from the failed section; finished sections are not uploaded again.
- `app/score-ink.js` — when a score opens, the attached handwriting is read with pdf.js (`getAttachments`) and bound to this account and this exact PDF (SHA-256). It is shown and edited like the account's own strokes: erasing records the id in the synced `deleted.scoreAnnotations`; undo or moving creates ordinary synced strokes. `app/score-ink-model.js` gained `gone()` (the erased ids).

### Where the handwriting lives (why not IndexedDB)

An intermediate version kept imported and hand-drawn ink in IndexedDB. That was device-local only: new ink would not reach other devices and could be lost with the browser's site data, and it broke 33 existing score-ink tests. It was replaced before merge (never deployed, so no device holds data in it):

| | Where | Syncs to other devices |
|---|---|---|
| Imported handwriting (any amount) | inside the score PDF in R2 | yes, with the PDF |
| Erasures of imported strokes | `vocal_data.payload` → `deleted.scoreAnnotations` (ids only) | yes |
| Strokes drawn in the app, undo copies, moved copies | `vocal_data.payload` → `scoreAnnotations` (unchanged from before) | yes |

- Tests: `tests/goodnotes-parse.test.cjs` (8), `tests/goodnotes-import.spec.cjs` (4, browser, fake R2: outline split, PDF attachment contents, erase/undo, "another device" with no local copies, 950 strokes all editable). The real sample is used locally only and is not in the repository.

### 2026-11-13: second real file (5 pages, schema 25)

A real 5-page notebook with one removed page, pen, highlighter and shape strokes showed what the first sample could not:

- **Removed pages.** Removing a page does not delete its page event (54). The page gets a register event **56** `{2: page id, 3: {1: 1, 2: clock}}`. The reader now leaves such pages out (and their ink file), so the pages after them keep their own PDF page. A later value 0 (restored) brings the page back. Before this, removed pages were imported.
- **Pressure pen** (item field 3 = 1, tuple `vA(v)A(u)A(u)A(v)A(v)A(u)A(u)A(u)A(u)A(v)`): kinds 0/1 = move/curve; start `(x, y, w)`; each curve `(cx, cy, w, x, y, w)`; `w` is **half** the stroke width (it equals the distance to the outline polygon stored in the same item). Imported as a pen stroke with width 2 × median(w).
- **Freehand highlighter** (same tuple, kinds 4/5, start has 4 values, 9 values per curve): `w` is the **full** width (18 in the sample, matching GoodNotes' own thumbnail). The colour is stored solid; it is imported as a highlighter at 0.5 opacity.
- **Brush pen** (field 3 = 5, schema 25 tuple with `S(uuuuu)` moves and `S(uuuuuuuuuuu)` curves): one width scalar; curve = flag, control (x, y, …), end (x, y, …).
- **Shape line**: an item with an empty plain path and its corner points and width in field 9 (`{1:{1:{x,y}…} 15:width}`).
- The "ink file id = page id + 1" rule held for all five pages.
- Rendering the imported strokes of page 1 matched GoodNotes' `thumbnail.jpg` (positions, colours, relative widths).
- Event 103 (search index) is known and ignored.

Still not seen: **text boxes, images, lasso-moved ink**. Text typed in GoodNotes is not imported.

### 2026-11-14: notebooks built from several PDFs, with pages moved and removed (schema 26)

Two real notebooks (one with a known edit history: shuffle pages, insert a second PDF, move a page back, remove pages, append a third PDF) showed why a large real notebook imported pages in the wrong places:

- **Moved pages.** Moving a page does not rewrite its page event (54). It adds event **55** `{2: page id, 3: {1: new order key, 2: {1: counter, …}}}`. The reader ignored it, so a moved page stayed at its first position and landed inside another song. Registers now carry their clock counter; the highest counter wins (the later event on a tie), for the order key, the background and the removed flag.
- **Order keys are byte strings** compared byte by byte: first import `<prefix>01 … <prefix>13` (zero padded), an inserted PDF `<prefix>02q<…>01 …`, a moved page gets a key between its new neighbours (`…4044q62~` between `…404` and `…405`, `!1dxuw` for the front).
- **Removed pages** (56) confirmed on 13 pages of known history.
- With these, the reconstructed order of the known-history notebook equals the history exactly (first PDF p1, copy p2–p4, first PDF p5 moved to place 5, copy p6–p13, third PDF p1–p4).

### Not verified yet

- First real file: 1 page, 1 outline entry, highlighter strokes (see the 2026-11-13 section above for the second file). **Text boxes, images, lasso-moved ink, several PDFs in one notebook, page moves in the event log** have not been seen. Pen width falls back to the median of the per-point values when the single width is 0 (a guess).
- The "ink file id = page id + 1" rule comes from one page. Ink files that match no page are counted and not imported.
- GoodNotes 5 / other schema versions; iPhone Safari with a large notebook (memory); real R2 upload.


## 잠긴 PDF (2026-11-12, 실사용 250MB 노트에서 발견)
- 구매한 악보는 **소유자 비밀번호만** 걸린 경우가 많다. 이런 파일은 누구나 열 수 있지만(굿노트·미리보기·pdf.js) 내용은 빈 사용자 비밀번호로 만든 키로 암호화되어 있다. pdf-lib는 이런 파일을 거부한다(`Input document to PDFDocument.load is encrypted`). `ignoreEncryption`으로 열어도 내용이 암호화된 채로 복사되어 쓸 수 없다.
- `app/pdf-decrypt.js`는 뷰어가 하는 방식대로 이 기기에서 복호화한 뒤 pdf-lib에 넘긴다.
  - 지원 범위는 Standard 보안 처리기 RC4 40–128비트(R2–R4), AES-128(R4), AES-256(R5·R6)이다.
  - 객체 스트림은 먼저 복호화한 뒤 푼다. 증분 저장으로 나중에 고쳐 쓴 객체는 새 쪽을 유지한다.
- **비밀번호가 있어야 열리는 PDF는 열지 않고** "비밀번호가 있어야 열리는 PDF예요"로 멈춘다. 추측하거나 우회하지 않는다.
- 만든 곡 PDF는 잠금 없이 저장된다(앱 안에서 보고 필기하기 위한 개인 사본).
- 테스트는 독립 구현(qpdf/pikepdf)으로 만든 합성 고정 파일을 쓴다: `tests/encrypted-pdf/`, `tests/pdf-decrypt.test.cjs`, `goodnotes-import.spec.cjs`.
