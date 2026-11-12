#!/usr/bin/env python3
"""Extract original score PDFs from a GoodNotes archive without modifying ink.

Usage:
    python tools/goodnotes_extract.py "notebook.goodnotes" --out extracted
    python tools/goodnotes_extract.py "notebook.goodnotes" --out extracted --ranges ranges.json

Optional ranges.json: [{"title":"The River","start":1,"end":5}]
Page numbers are inclusive and 1-based; per-PDF ranges are supported only when
an archive contains exactly one PDF attachment. Requires pypdf for splitting.
GoodNotes protobuf strokes and notebook outlines are NOT decoded by this tool.
"""
import argparse
import json
import re
import shutil
import zipfile
from pathlib import Path

MAX_ARCHIVE_BYTES = 500 * 1024 * 1024
MAX_PDF_BYTES = 100 * 1024 * 1024
MAX_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024

def clean_name(value):
    name = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', '_', str(value)).strip(' .')
    return (name[:100] or 'score')

def extract(source, out, ranges=None):
    source, out = Path(source), Path(out)
    if source.stat().st_size > MAX_ARCHIVE_BYTES:
        raise ValueError("GoodNotes archive exceeds 500 MB")
    out.mkdir(parents=True, exist_ok=True)
    results = []
    with zipfile.ZipFile(source) as archive:
        if sum(item.file_size for item in archive.infolist()) > MAX_UNCOMPRESSED_BYTES:
            raise ValueError("GoodNotes archive expands beyond 1 GB")
        pdfs = [item for item in archive.infolist()
                if item.filename.startswith('attachments/') and not item.is_dir()
                and item.file_size <= MAX_PDF_BYTES]
        for index, item in enumerate(pdfs, start=1):
            with archive.open(item) as stream:
                header = stream.read(8)
                if not header.startswith(b'%PDF-'):
                    continue
                target = out / f'original_{index:02d}.pdf'
                with target.open('wb') as destination:
                    destination.write(header)
                    shutil.copyfileobj(stream, destination)
            results.append({'source': item.filename, 'pdf': target.name,
                            'bytes': target.stat().st_size})
    if not results:
        raise ValueError("No embedded PDF attachment found; no score was produced")
    if ranges:
        if len(results) != 1:
            raise ValueError("Page ranges require exactly one PDF attachment")
        try:
            from pypdf import PdfReader, PdfWriter
        except ImportError as exc:
            raise RuntimeError("Install pypdf to split pages: pip install pypdf") from exc
        original = out / results[0]['pdf']
        reader = PdfReader(str(original))
        occupied = set()
        for idx, span in enumerate(ranges, start=1):
            start, end = int(span['start']), int(span['end'])
            if start < 1 or end < start or end > len(reader.pages):
                raise ValueError(f"Invalid range {start}-{end}, document has {len(reader.pages)} pages")
            pages = set(range(start, end + 1))
            if occupied & pages:
                raise ValueError("Page ranges overlap")
            occupied |= pages
            writer = PdfWriter()
            for page in range(start - 1, end):
                writer.add_page(reader.pages[page])
            filename = f'{idx:02d}_{clean_name(span["title"])}.pdf'
            with (out / filename).open('wb') as file:
                writer.write(file)
            results.append({'title': span['title'], 'pdf': filename,
                            'start': start, 'end': end, 'kind': 'split'})
    manifest = {
        'source': source.name, 'files': results,
        'ink': {'status': 'preserved_in_original_goodnotes_only',
                'editable': False,
                'note': 'GoodNotes protobuf ink is not a PDF annotation layer; do not flatten or claim it was imported.'},
        'outline': {'status': 'not_decoded',
                    'note': 'Manual page ranges are required until notebook outline protobuf is decoded and verified.'}
    }
    (out / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')
    return manifest

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('goodnotes')
    parser.add_argument('--out', required=True)
    parser.add_argument('--ranges', help='JSON array of title/start/end page ranges')
    args = parser.parse_args()
    spans = json.loads(Path(args.ranges).read_text(encoding='utf-8')) if args.ranges else None
    print(json.dumps(extract(args.goodnotes, args.out, spans), ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
