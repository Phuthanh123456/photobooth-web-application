"""Install official Windows x64 cloudflared locally, verifying GitHub's SHA-256."""
import hashlib
import json
from pathlib import Path
from urllib.request import Request, urlopen

root = Path(__file__).resolve().parents[1]
headers = {'User-Agent': 'CAP-photobooth-setup', 'Accept': 'application/vnd.github+json'}
with urlopen(Request('https://api.github.com/repos/cloudflare/cloudflared/releases/latest', headers=headers), timeout=30) as response:
    release = json.load(response)
asset = next(a for a in release['assets'] if a['name'] == 'cloudflared-windows-amd64.exe')
digest = asset.get('digest', '')
if not digest.startswith('sha256:'):
    raise RuntimeError('Official release has no SHA-256 digest; refusing an unverified installation')
destination = root / '.local' / 'bin'
destination.mkdir(parents=True, exist_ok=True)
temporary = destination / 'cloudflared.download'
try:
    with urlopen(Request(asset['browser_download_url'], headers={'User-Agent': headers['User-Agent']}), timeout=90) as source, temporary.open('wb') as output:
        while chunk := source.read(1024 * 1024):
            output.write(chunk)
    actual = hashlib.sha256(temporary.read_bytes()).hexdigest()
    if actual != digest[7:]:
        raise RuntimeError('Downloaded cloudflared checksum mismatch')
    temporary.replace(destination / 'cloudflared.exe')
    (destination / 'cloudflared-release.json').write_text(json.dumps({'version':release['tag_name'],'url':asset['browser_download_url'],'sha256':actual},indent=2))
    print(f"Installed official cloudflared {release['tag_name']} with verified SHA-256 into .local/bin")
finally:
    temporary.unlink(missing_ok=True)
