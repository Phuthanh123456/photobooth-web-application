"""Extract the supplied PDF's actual white slot rectangles and 300dpi artwork.
Requires PyMuPDF. Does not substitute artwork or infer coordinates from pixels.
"""
import json
from pathlib import Path
import pymupdf

root = Path(__file__).resolve().parents[1]
directory = root / 'assets' / 'templates'
doc = pymupdf.open(directory / 'Frame CAP.pdf')
pages = []
for index, page in enumerate(doc):
    slots = []
    for drawing in page.get_drawings():
        rect = drawing['rect']
        if drawing.get('fill') == (1., 1., 1.) and 100 < rect.width < 200 and 80 < rect.height < 150:
            slots.append(dict(x=rect.x0, y=rect.y0, width=rect.width, height=rect.height))
    slots.sort(key=lambda item: (round(item['y']), item['x']))
    if len(slots) != 8:
        raise RuntimeError(f'Expected exactly 8 vector slots on page {index + 1}')
    for slot_index, slot in enumerate(slots):
        slot.update(photo=slot_index // 2 + 1, column=slot_index % 2)
    page.get_pixmap(matrix=pymupdf.Matrix(300/72, 300/72), alpha=False).save(directory / f'page-{index+1}.png')
    pages.append(dict(page=index+1, name=['Coral / Sky', 'Blue / Green'][index], widthPt=page.rect.width,
                      heightPt=page.rect.height, dpi=300, slots=slots))
(directory / 'geometry.json').write_text(json.dumps(dict(pages=pages), indent=2), encoding='utf8')
print(json.dumps(pages, indent=2))
