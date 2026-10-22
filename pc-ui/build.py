"""Rebuild the marked PC UI blocks in pc.html; business HTML/JS stays in place.
Run from any directory: python3 pc-ui/build.py
No install, network, runtime directories or build dependencies are required.
"""
from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parent
PAGE = ROOT.parent / 'pc.html'
FILES = {
    'pc-business-style': ('style', ['business.css']),
    'pc-vendor-style': ('style', ['vendor/element-plus-2.9.3.css', 'vendor/by-components-v3-1.1.26.css']),
    'pc-theme': ('style', ['theme.css']),
    'pc-vendor-runtime': ('script', ['vendor/vue-3.5.13.js','vendor/element-plus-2.9.3.js','vendor/element-plus-zh-cn.js','vendor/by-components-v3-1.1.26.js']),
    'pc-components': ('script', ['components.js']),
}

def block(name, tag, files):
    content = '\n'.join((ROOT / file).read_text() for file in files)
    if name == 'pc-vendor-runtime':
        notices = '\n\n'.join((ROOT / 'vendor' / file).read_text() for file in ['NOTICE.txt','Vue-LICENSE','ElementPlus-LICENSE'])
        content = '/*!\n' + notices.replace('*/', '* /') + '\n*/\n' + content
        # The published company UMD still contains bundler-time NODE_ENV checks.
        # Replace the constant during packaging, without adding a fake process global.
        content = content.replace('process.env.NODE_ENV', '"production"')
    if tag == 'script':
        content = re.sub(r'</script', r'<\\/script', content, flags=re.I)
    if name == 'pc-business-style':
        content = '@layer pc-business {\n' + content + '\n}'
    return f'<!-- {name}:start -->\n<{tag} data-pc-source="{name}">\n{content}\n</{tag}>\n<!-- {name}:end -->'

def build():
    manifest = json.loads((ROOT / 'vendor/manifest.json').read_text())
    for filename, expected in manifest['files'].items():
        actual = hashlib.sha256((ROOT / 'vendor' / filename).read_bytes()).hexdigest()
        if actual != expected:
            raise SystemExit(f'Vendor checksum mismatch: {filename}')
    html = PAGE.read_text()
    for name, (tag, files) in FILES.items():
        pattern = rf'<!-- {name}:start -->.*?<!-- {name}:end -->'
        if not re.search(pattern, html, flags=re.S):
            raise SystemExit(f'Missing build marker: {name}')
        html = re.sub(pattern, lambda _: block(name, tag, files), html, flags=re.S)
    PAGE.write_text(html)
    print(f'Built {PAGE.name}: {len(html.encode()):,} bytes, all dependencies embedded.')

if __name__ == '__main__':
    build()
