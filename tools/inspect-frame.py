"""Import original RGBA artwork and measure its holes and clear photo rectangles.

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

def safe_rectangle(mask):
    """Largest 3:2 rectangle clear of stickers, including 2px edge clearance.

    Contain fitting inside this rectangle also preserves portrait/wide photos.
    """
    clear = ndimage.binary_erosion(mask, iterations=2)
    integral = np.pad((~clear).astype(np.int32).cumsum(0).cumsum(1), ((1, 0), (1, 0)))
    def positions(height):
        width = int(np.ceil(height * 1.5))
        total = integral[height:, width:] - integral[:-height, width:] - integral[height:, :-width] + integral[:-height, :-width]
        return width, np.argwhere(total == 0)
    low, high = 1, min(clear.shape[0], clear.shape[1] * 2 // 3)
    best = None
    while low <= high:
        height = (low + high) // 2
        width, candidates = positions(height)
        if len(candidates):
            best = (width, height, candidates)
            low = height + 1
        else:
            high = height - 1
    if best is None:
        raise RuntimeError('No clear photo rectangle inside the frame')
    width, height, candidates = best
    centers = candidates + [height / 2, width / 2]
    y, x = candidates[np.argmin(np.sum((centers - np.array(clear.shape)/2) ** 2, axis=1))]
    return int(x), int(y), width, height

dpi = float(image.info.get('dpi', (400, 400))[0])
factor = 72 / dpi
slots = []
for column in (0, 1):
    group = sorted([hole for hole in holes if (hole[0].start > image.width / 2) == bool(column)], key=lambda hole: hole[1].start)
    if len(group) != 4:
        raise RuntimeError('Expected four openings per column')
    for photo, (x, y, mask) in enumerate(group, 1):
        sx, sy, sw, sh = safe_rectangle(mask)
        box = dict(x=(x.start+sx)*factor, y=(y.start+sy)*factor, width=sw*factor, height=sh*factor)
        slots.append(dict(x=x.start*factor, y=y.start*factor, width=(x.stop-x.start)*factor,
                          height=(y.stop-y.start)*factor, photo=photo, column=column, contentBox=box))
slots.sort(key=lambda slot: (slot['photo'], slot['column']))
preview = Image.alpha_composite(Image.new('RGBA', image.size, 'white'), image).convert('RGB')
preview.save(directory / 'page-1.png', dpi=(dpi, dpi))
page = dict(page=1, name='CAP / Victory stickers', widthPt=image.width*factor, heightPt=image.height*factor,
            dpi=300, sourceDpi=dpi, sourceWidthPx=image.width, sourceHeightPx=image.height,
            artwork='Frame CAP.png', sourceSha256=hashlib.sha256(original.read_bytes()).hexdigest(), slots=slots)
(directory / 'geometry.json').write_text(json.dumps(dict(pages=[page]), indent=2)+'\n', encoding='utf8')
print(json.dumps(page, indent=2))
