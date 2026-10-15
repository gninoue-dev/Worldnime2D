"""Génère tests/fixtures/personnage_test.ora : un personnage simple en formes géométriques, en calques.

Sert au test automatique de l'import OpenRaster. Usage : python3 tests/fixtures/make_fixture.py
"""
import io
import zipfile
from pathlib import Path
from PIL import Image, ImageDraw

W, H = 400, 800
OUT = Path(__file__).with_name('personnage_test.ora')

# (nom, boîte dans le document, couleur, forme) — du fond vers l'avant.
PIECES = [
    ('jambe_g', (150, 520, 195, 790), (60, 70, 140), 'rect'),
    ('jambe_d', (205, 520, 250, 790), (60, 70, 140), 'rect'),
    ('bras_g', (80, 230, 130, 480), (230, 180, 140), 'rect'),
    ('torse', (130, 210, 270, 540), (160, 60, 170), 'rect'),
    ('bras_d', (270, 230, 320, 480), (230, 180, 140), 'rect'),
    ('tete', (140, 40, 260, 200), (240, 195, 150), 'ellipse'),
]


def layer_png(box, color, shape, margin=10):
    """Image du calque avec une marge transparente, pour tester le recadrage."""
    x0, y0, x1, y1 = box
    img = Image.new('RGBA', (x1 - x0 + 2 * margin, y1 - y0 + 2 * margin), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    rect = (margin, margin, img.width - margin - 1, img.height - margin - 1)
    if shape == 'ellipse':
        d.ellipse(rect, fill=color + (255,), outline=(40, 30, 30, 255), width=3)
    else:
        d.rounded_rectangle(rect, radius=14, fill=color + (255,), outline=(40, 30, 30, 255), width=3)
    buf = io.BytesIO()
    img.save(buf, 'PNG')
    return buf.getvalue(), x0 - margin, y0 - margin


def main():
    layers_xml = []
    files = {}
    # Dans stack.xml, le premier calque est celui du dessus.
    for name, box, color, shape in reversed(PIECES):
        png, x, y = layer_png(box, color, shape)
        files[f'data/{name}.png'] = png
        layers_xml.append(
            f'<layer name="{name}" src="data/{name}.png" x="{x}" y="{y}" opacity="1.0" visibility="visible" />')
    # Un groupe avec une ombre en mode produit, et un calque caché (ignoré à l'import).
    shadow = Image.new('RGBA', (220, 40), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).ellipse((0, 0, 219, 39), fill=(0, 0, 0, 160))
    buf = io.BytesIO()
    shadow.save(buf, 'PNG')
    files['data/ombre.png'] = buf.getvalue()
    hidden = Image.new('RGBA', (50, 50), (255, 0, 0, 255))
    buf = io.BytesIO()
    hidden.save(buf, 'PNG')
    files['data/cache.png'] = buf.getvalue()
    layers_xml.append('<layer name="cache" src="data/cache.png" x="0" y="0" visibility="hidden" />')
    layers_xml.append(
        '<stack name="sol" x="90" y="770"><layer name="ombre" src="data/ombre.png" x="0" y="0" '
        'opacity="0.5" composite-op="svg:multiply" /></stack>')

    stack = f'<?xml version="1.0" encoding="UTF-8"?><image w="{W}" h="{H}"><stack>{"".join(layers_xml)}</stack></image>'
    with zipfile.ZipFile(OUT, 'w') as z:
        z.writestr(zipfile.ZipInfo('mimetype'), 'image/openraster', compress_type=zipfile.ZIP_STORED)
        z.writestr('stack.xml', stack, compress_type=zipfile.ZIP_DEFLATED)
        for path, data in files.items():
            z.writestr(path, data, compress_type=zipfile.ZIP_DEFLATED)
    print(f'{OUT} : {len(PIECES) + 1} calques visibles, 1 caché')


if __name__ == '__main__':
    main()
