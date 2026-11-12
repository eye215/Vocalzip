# Builds the synthetic encrypted PDFs used by tests/pdf-decrypt.test.cjs (no real score, no personal data).
# (pikepdf needs aes=False, metadata=False below R4; those revisions always encrypt everything anyway.)
# Each has 3 pages with the text "Original page N", an annotation string, an Info title and object streams,
# then is encrypted the way real sheet-music PDFs are: no user password (opens freely) plus an owner password.
# Run: PYTHONPATH=<dir with pikepdf> python3 make.py   (pikepdf/qpdf is an independent encryptor)
import os, pikepdf
from pikepdf import Pdf, Name, Dictionary, Array, String, Encryption, Permissions

here = os.path.dirname(os.path.abspath(__file__))

def base():
    pdf = Pdf.new()
    font = pdf.make_indirect(Dictionary(Type=Name.Font, Subtype=Name.Type1, BaseFont=Name.Helvetica))
    for i in range(1, 4):
        page = pdf.add_blank_page(page_size=(300, 400))
        page.Resources = Dictionary(Font=Dictionary(F1=font))
        page.Contents = pdf.make_stream(('BT /F1 18 Tf 20 360 Td (Original page %d) Tj ET\n' % i).encode() + b'% padding to make it compress\n' * 20)
        page.Annots = Array([pdf.make_indirect(Dictionary(Type=Name.Annot, Subtype=Name.Text, Rect=Array([10, 10, 30, 30]), Contents=String('note on page %d' % i)))])
    pdf.docinfo[Name.Title] = String('Synthetic encrypted score')
    return pdf

restrict = Permissions(extract=False, modify_other=False, modify_annotation=False, modify_assembly=False, modify_form=False, print_highres=False)
cases = {
    'rc4-40': Encryption(owner='owner-secret', user='', R=2, aes=False, metadata=False, allow=restrict),
    'rc4-128': Encryption(owner='owner-secret', user='', R=3, aes=False, metadata=False, allow=restrict),
    'aes-128': Encryption(owner='owner-secret', user='', R=4, aes=True, allow=restrict),
    'rc4-128-r4-plain-metadata': Encryption(owner='owner-secret', user='', R=4, aes=False, metadata=False, allow=restrict),
    'aes-128-classic': Encryption(owner='owner-secret', user='', R=4, aes=True, allow=restrict),
    'aes-256': Encryption(owner='owner-secret', user='', R=6, allow=restrict),
    'aes-256-user-password': Encryption(owner='owner-secret', user='user-secret', R=6),
    'rc4-128-user-password': Encryption(owner='owner-secret', user='user-secret', R=3, aes=False, metadata=False),
}
# 'classic' files keep every object at the top level, so their strings are encrypted one by one.
classic = {'rc4-40', 'aes-128-classic'}
for name, enc in cases.items():
    pdf = base()
    if 'plain-metadata' in name:
        with pdf.open_metadata() as meta:
            meta['dc:title'] = 'Synthetic encrypted score'
    pdf.save(os.path.join(here, name + '.pdf'), encryption=enc, object_stream_mode=pikepdf.ObjectStreamMode.disable if name in classic else pikepdf.ObjectStreamMode.generate,
             compress_streams=True)
print('ok')
