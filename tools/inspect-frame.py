"""Import original RGBA artwork and measure full rectangular photo underlays.

Build-time dependencies: Pillow, NumPy, SciPy. Runtime uses committed assets.
No colors are removed: sticker outlines and antialiasing remain unchanged.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import numpy as np
from PIL import Image
from scipy import ndimage

root = Path(__file__).resolve().parents[1]
directory = root / 'assets' / 'templates'
parser = argparse.ArgumentParser()
parser.add_argument('--source', type=Path)
args = parser.parse_args()
original = directory / 'Frame CAP.png'
if args.source and args.source.resolve() != original.resolve():
    shutil.copyfile(args.source, original)
image = Image.open(original)
if image.mode != 'RGBA':
    raise RuntimeError('Expected RGBA artwork with transparent photo openings')
pixels = np.array(image)
labels, _ = ndimage.label(pixels[:, :, 3] == 0)
holes = []
for component, bounds in enumerate(ndimage.find_objects(labels), 1):
    if bounds is None:
        continue
    y, x = bounds
    mask = labels[bounds] == component
    if np.count_nonzero(mask) > 100_000:
        holes.append((x, y, mask))
if len(holes) != 8:
    raise RuntimeError(f'Expected eight large transparent openings, found {len(holes)}')

dpi = float(image.info.get('dpi', (400, 400))[0])
factor = 72 / dpi
slots = []
for column in (0, 1):
    group = sorted([hole for hole in holes if (hole[0].start > image.width / 2) == bool(column)], key=lambda hole: hole[1].start)
    if len(group) != 4:
        raise RuntimeError('Expected four openings per column')
    for photo, (x, y, _mask) in enumerate(group, 1):
        # Underlay the entire opening, including underneath sticker corners.
        # Small bleed ensures antialiased/rounded edges also have photo behind them.
        left, top = max(0, x.start-2), max(0, y.start-2)
        right, bottom = min(image.width, x.stop+2), min(image.height, y.stop+2)
        slots.append(dict(x=left*factor, y=top*factor, width=(right-left)*factor,
                          height=(bottom-top)*factor, photo=photo, column=column))
slots.sort(key=lambda slot: (slot['photo'], slot['column']))
preview = Image.alpha_composite(Image.new('RGBA', image.size, 'white'), image).convert('RGB')
preview.save(directory / 'page-1.png', dpi=(dpi, dpi))
page = dict(page=1, name='CAP / Victory stickers', widthPt=image.width*factor, heightPt=image.height*factor,
            dpi=300, sourceDpi=dpi, sourceWidthPx=image.width, sourceHeightPx=image.height,
            artwork='Frame CAP.png', photoFit='cover', bleedPx=2, sourceSha256=hashlib.sha256(original.read_bytes()).hexdigest(), slots=slots)
(directory / 'geometry.json').write_text(json.dumps(dict(pages=[page]), indent=2)+'\n', encoding='utf8')
print(json.dumps(page, indent=2))
