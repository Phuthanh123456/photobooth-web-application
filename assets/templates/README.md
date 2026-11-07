# Frame CAP

The supplied two-page original is preserved as `Frame CAP.pdf`. Page 1 is Coral/Sky (419.528015 × 595.276001 pt); page 2 is Blue/Green (420 × 592 pt). They are distinct color designs with slightly different print page sizes, not front/back pages. Default: page 1. `TEMPLATE_PAGE=2` selects page 2 at backend startup.

`geometry.json` records the actual eight white filled PDF vector rectangles, measured in points from the top left. Both columns receive the same photo for each row. `tools/inspect-frame.py` regenerates geometry and 300-dpi PNG artwork using PyMuPDF. It refuses a page that does not have eight matching rectangles. Run `python -m pip install PyMuPDF` then `python tools/inspect-frame.py` if regeneration is needed. Runtime uses the committed assets and does not require Python.

The compositor uses these same slots for progressive JPEG previews and final output. JPEG output is 300dpi, centre cover-cropped, EXIF orientation corrected. PDF retains the original page artwork and print dimensions; original JPEG streams are embedded with slot clipping (orientation normalization only when needed). There is no invented branding or replacement artwork. Crop is deterministic; automatic face-aware cropping is not implemented.
