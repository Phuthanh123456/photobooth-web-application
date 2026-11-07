"""Local-only syntax compatibility for Clang/MinGW; never modify or commit Nikon files."""
import os
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
source = Path(os.environ['NIKON_SDK_ROOT']) / 'Module/Win/HeaderFile/Maid3.h'
text = source.read_text(encoding='utf8', errors='strict')
enum = re.search(r'enum eNkMAIDDataType\s*\{[^}]+\};', text)
if enum is None or text.count('enum eNkMAIDDataType;') != 1 or text.count('enum eNkMAIDLiveViewStatus;') != 1:
    raise RuntimeError('Unrecognized SDK header; inspect it before adapting the build')
# Move the unchanged enum definition to its forward-declaration site.
text = text[:enum.start()] + text[enum.end():]
text = text.replace('enum eNkMAIDDataType;', enum.group())
# This forward reference is unused: the actual LV status API uses eNkMAIDLVStatus.
text = text.replace('enum eNkMAIDLiveViewStatus;', '')
target = root / '.local/sdk-compat'
target.mkdir(parents=True, exist_ok=True)
(target / 'Maid3.h').write_text(text, encoding='utf8')
print('Prepared ignored local compatibility header; Nikon installation unchanged.')
