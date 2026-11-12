"""Regression tests for the read-only GoodNotes PDF extractor.

Run: python -m unittest discover -s tests -p 'test_goodnotes_extract.py'
Optional: install pypdf for page-range splitting coverage.
"""
import importlib.util
import json
import tempfile
import unittest
import zipfile
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / 'tools' / 'goodnotes_extract.py'
spec = importlib.util.spec_from_file_location('goodnotes_extract', SOURCE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class GoodNotesExtractTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.notebook = self.root / 'sample.goodnotes'
        # Header is checked, not a full PDF structure, for extraction-only coverage.
        with zipfile.ZipFile(self.notebook, 'w') as z:
            z.writestr('attachments/valid-id', b'%PDF-1.7\nEXAMPLE')
            z.writestr('index.events.pb', b'not-decoded')
            z.writestr('attachments/image-id', b'not a PDF')

    def test_extracts_only_pdfs_and_keeps_source_unchanged(self):
        before = self.notebook.read_bytes()
        manifest = module.extract(self.notebook, self.root / 'output')
        self.assertEqual(self.notebook.read_bytes(), before)
        self.assertEqual(len(manifest['files']), 1)
        self.assertEqual((self.root / 'output' / 'original_01.pdf').read_bytes(),
                         b'%PDF-1.7\nEXAMPLE')
        self.assertFalse(manifest['ink']['editable'])
        self.assertEqual(manifest['outline']['status'], 'not_decoded')
        self.assertEqual(json.loads((self.root / 'output' / 'manifest.json').read_text())['files'],
                         manifest['files'])

    def test_fails_if_no_original_pdf(self):
        with zipfile.ZipFile(self.notebook, 'w') as z:
            z.writestr('index.events.pb', b'data')
        with self.assertRaisesRegex(ValueError, 'No embedded PDF'):
            module.extract(self.notebook, self.root / 'output')

    def test_invalid_range_rejected(self):
        # Range checks are only exercised with pypdf and a valid PDF.
        try:
            from pypdf import PdfWriter
        except ImportError:
            self.skipTest('pypdf optional')
        pdf = self.root / 'one.pdf'
        writer = PdfWriter()
        writer.add_blank_page(width=500, height=700)
        with pdf.open('wb') as f:
            writer.write(f)
        with zipfile.ZipFile(self.notebook, 'w') as z:
            z.write(pdf, 'attachments/original-id')
        with self.assertRaisesRegex(ValueError, 'Invalid range'):
            module.extract(self.notebook, self.root / 'out-invalid',
                           [{'title': 'Bad', 'start': 2, 'end': 4}])

    def test_valid_page_ranges_create_separate_pdf(self):
        try:
            from pypdf import PdfReader, PdfWriter
        except ImportError:
            self.skipTest('pypdf optional')
        writer = PdfWriter()
        writer.add_blank_page(width=500, height=700)
        writer.add_blank_page(width=500, height=700)
        pdf = self.root / 'two.pdf'
        with pdf.open('wb') as f:
            writer.write(f)
        with zipfile.ZipFile(self.notebook, 'w') as z:
            z.write(pdf, 'attachments/original-id')
        manifest = module.extract(self.notebook, self.root / 'out-valid',
                                  [{'title': 'The River', 'start': 1, 'end': 1},
                                   {'title': 'Another Song', 'start': 2, 'end': 2}])
        self.assertEqual(len(manifest['files']), 3)
        self.assertEqual(len(PdfReader(self.root / 'out-valid' / '01_The River.pdf').pages), 1)
        self.assertEqual(len(PdfReader(self.root / 'out-valid' / '02_Another Song.pdf').pages), 1)


if __name__ == '__main__':
    unittest.main()
