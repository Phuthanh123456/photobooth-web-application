# Frame CAP

The supplied two-page original is preserved as `Frame CAP.pdf`. Page 1 is Coral/Sky (419.528015 × 595.276001 pt); page 2 is Blue/Green (420 × 592 pt). They are distinct color designs with slightly different print page sizes, not front/back pages. Default: page 1. `TEMPLATE_PAGE=2` selects page 2 at backend startup.

`geometry.json` records the actual eight white filled PDF vector rectangles, measured in points from the top left. Both columns receive the same photo for each row. `tools/inspect-frame.py` regenerates geometry and 300-dpi PNG artwork using PyMuPDF. It refuses a page that does not have eight matching rectangles. Run `python -m pip install PyMuPDF` then `python tools/inspect-frame.py` if regeneration is needed. Runtime uses the committed assets and does not require Python.

The compositor uses these same slots for progressive JPEG previews and final output. JPEG output is 300dpi, EXIF orientation corrected, and fits the entire photo inside each slot without cropping or stretching. White bars are used if aspect ratios differ. PDF retains the original page artwork and print dimensions; original JPEG streams are embedded using the same contain fitting (orientation normalization only when needed). There is no invented branding or replacement artwork.

On 2026-11-08 the supplied `Frame CAP (1).pdf` had exactly the same SHA-256 as this template (2bc798aaa8c02d5b8a72d44a623ced04be1468dcb6c07a5c5d121669034127b8). The operator confirmed the wrong file was provided. Replacement by the intended sticker artwork is pending the correct PDF. Do not claim the sticker design is installed.
