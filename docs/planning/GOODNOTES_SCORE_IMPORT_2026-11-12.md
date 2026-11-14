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

### 2026-11-14: the owner's real notebook (293 pages, 95 PDFs, schema 35), from its structure export

The structure export (events only) of the notebook that imported wrongly was re-encoded into a minimal archive and read with the real reader:

- 340 page events − 47 removed = **293 pages**, the count GoodNotes shows; 81 move events applied; the song the owner photographed at GoodNotes page 183 comes out at page 183, and its neighbours are the right single-page PDFs.
- Event kinds seen there and now treated as known (not counted as unknown): **160/161/163/164** are **audio recordings made in the notebook** (corrected 2026-11-14 with a lesson notebook: 160 = created, field 4 is the length in flicks — 705,600,000 per second; 164 = title, e.g. a song name; 163 = deleted; 161 = a stroke/element id tied to a moment of a recording and a page, thousands per recording); **57** is a flag register on some pages (meaning not established); **62** marks a page brought in from another notebook (name + order key) — such pages also have their normal page event. (At that point the audio was not imported; see the recordings section below.)
- None of these change page order or removal.

### 2026-11-14: recordings imported as each song's MR (reader 8)

The owner records each song's MR inside GoodNotes, titled with the song ("21. The winner takes it all"). These are now offered in the import screen under the score rows ("MR 녹음 N개").

- **Format** (index.events.pb): **160** created `{1: recording id, 2: attachment id, 3: document id, 4: length in flicks}` (705,600,000 flicks = 1 s); **164** title `{1: recording id, 2: document id, 3: {1: text, 2: clock}}` (a register: highest clock counter wins); **163** deleted `{1: recording id, 2: document id}` (the file is gone); **161** ties a stroke to a moment (ignored). The attachment id is registered by a kind 6 event and listed in `index.attachments.pb` like a PDF; the file is MP4 audio (starts with an `ftyp` box).
- **Reader**: `read()` returns `recordings: [{id, title, seconds, file, size}]` for recordings that are not deleted and whose file is in the archive (event order; title `''` when none). `report.recordings`, `report.recordingsSkipped` (deleted + without a file), `report.recordingsDeleted`. The audio bytes are not read until a row is imported (`model.readFile`).
- **Verified on a real notebook** (schema 35, 17 pages): one 160 event, no 164 (untitled), file 47,870 bytes `ftyp mp42`, length 3.6 s — returned exactly so.
- **Where an MR goes by default**: the song its score row goes to (same title, leading track numbers "03. ", "3) ", "03 - " aside — including a new song made by that row in the same import); otherwise the song the title names (`matchSong`, with and without the track number); otherwise 가져오지 않기. Untitled recordings show as "제목 없는 녹음" and are never placed automatically.
- **Import**: the archive's bytes go unchanged through `VZ.songMR.addFile` (app/song-mr.js, the same path as MR 추가): file name `<title>.m4a`, type `audio/mp4`, title = the recording's title, and the entry is marked `source:'goodnotes'`, `sourceId:<recording id>`. A later import recognises it by that mark (same recording id, or same file name and size) on any song: "이미 가져온 MR이에요", 가져오지 않기 preselected. A file that does not start with `ftyp` is not uploaded. A recording that fails is named and the others still go in.
- **Sticker memos**: a notes record whose field 20 is a message is the sticker memo itself (at reader 8 still counted as "record 20" and not imported — imported since reader 9, next section); a header whose field 20 is an id text only says the stroke sits on that sticker (a header field, like 4, 6 and 10). Text boxes (field 12) are not imported.

### 2026-11-14: sticker memos imported as the app's own sticker memos (reader 9)

The app has its own sticker memo now (`tool:'note'` records, app/score-ink-model.js). A GoodNotes sticker memo comes in as one, with the pen strokes written on it still attached to it.

- **Format** (`notes/<id>`, the page's ink file). A sticker memo is a record whose field **20 is a message**; a header record with the same id comes right before it, as for ink items.

  | Field | Meaning |
  |---|---|
  | 20.1 | id (UUID text) |
  | 20.2 | schema number |
  | 20.3 | register clock `{1: counter, 2: replica}` |
  | 20.20 | `{1: {1: x, 2: y}, 3: scale}` — top-left corner in page units (the units of ink points); `scale` is 1 until the memo is resized |
  | 20.21 | `{2: {1: w, 2: h}}` — size before the scale; the memo is shown `w·scale` × `h·scale` |
  | 20.30 | `{1: r, 2: g, 3: b, 4: a}` floats 0–1 |
  | 20.31 | typed text (a blob; 96 bytes when nothing is typed). **Not decoded.** |
  | 20.33 | author name. **Not read, not imported, not shown.** |
  | 20.7, 20.32, 20.40, 20.41 | seen, meaning not established, ignored |

  A pen stroke written on a memo is an ordinary ink record whose **header** carries field 20 = the memo's id (text). Its points are page coordinates like every stroke.
- **Reader** (`app/goodnotes-parse.js`): `pages[i].memos = [{id, x, y, w, h, color}]` — `x`, `w` of the page width and `y`, `h` of the page height (scale applied, not clamped), `color` `#rrggbb`; a stroke written on a memo carries `memo: <id>`. `sections[i].memos`, `report.memos`, `report.memosDeleted`, `report.memoTexts`. A field-20 message that is read is no longer counted in `report.elements`; one without a corner, a size or a colour still is ("record 20") and is not imported.
- **Importer** (`app/goodnotes-import.js`, `inkFile`): each memo becomes `{id: 'gn-<score id>-m<k>', tool: 'note', color, rect, mode: 'pen', note: <its id>}` before the strokes of its page in the score PDF's `vocalzip-ink.json`; strokes written on it carry the same `note`, so the viewer moves and deletes them with the memo. The colour is the stored one. The rect keeps the memo's size and is moved inside the page if it hangs over an edge (the strokes are not moved with it). A song whose pages have memos but no strokes still gets its attachment. The row, the summary, the toast and 진단 정보 say "스티커 메모 N개" when there are any.
- **Structure export** (`structure()`, version 3): each sticker element gets `memo: {strokes, unread, strokeBox: [minX, minY, maxX, maxY]}` — how many strokes name it and the box they cover in page units, numbers only. Together with the memo's own corner, size and scale this will show how strokes on a resized memo are stored.

**Verified on a real notebook** (schema 35, page 1091.34 × 1543.46 units): one yellow memo (0.98, 0.906, 0.471 → `#fae778`) at (668.86, 360.47), 256 × 256, scale 1, with 15 pen strokes whose headers name it; their box is x 697.7–932.8, y 377.3–581.5, so they sit on the memo and run 8 units past its right edge (924.9) — exactly what GoodNotes shows. Imported through the real import and opened in the viewer, the memo and the strokes are where GoodNotes draws them; the memo is under the strokes, moves with all 15 and is deleted with them after the confirm. Three more real memos (resized) only fit inside their page with the scale applied to the size, which is why the size is `w·scale`.

**Assumed, not seen**

- *A deleted memo.* No deleted memo has been seen. The reader follows its existing conventions: the same id twice → the higher clock counter wins (the later record on a tie); a memo record carrying field 14 (the flag an erased ink item carries) is left out and counted (`report.memosDeleted`), and its strokes come in as ordinary strokes. If GoodNotes marks deletion another way, a deleted memo is imported as a memo (nothing is lost; it can be deleted in the viewer).
- *Strokes on a resized memo.* Strokes are taken as stored (page coordinates). Whether GoodNotes stores them already resized, or resizes them when drawing, is unknown: the only memo with strokes was never resized. If it resizes when drawing, strokes on a resized memo will come in at their old size and place. The structure export's `strokeBox` answers this from one diagnosis file.
- *Typed text.* The text blob is not decoded, so typed text is not imported; the memo comes in empty (with its pen strokes). All four real memos are empty (96 bytes). A memo whose blob has another length is counted (`report.memoTexts`) and the import screen says that it comes in without its text — a hint from the length only.
- Overlapping memos keep the file's order; rotation of a memo has not been seen.
- Tests: `tests/goodnotes-parse.test.cjs` (corner, size × scale, colour, linked strokes, two versions of one memo, erased, not an element, structure box), `tests/goodnotes-import.spec.cjs` (memo in the viewer within 1 px of its place and under its strokes, a stroke past its edge, moving it moves its strokes, delete with confirm, memo-only song, second import adds nothing, wording).

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
