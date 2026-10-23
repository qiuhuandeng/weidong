"""Build the PC entry and fingerprinted, same-origin assets (Python stdlib only).
Sources live in share/. Deploy PC entries AND share/dist/ together. No CDN, npm or
build service is needed. Older assets are deliberately retained for open tabs.
"""
from pathlib import Path
import gzip
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parent.parent
PROJECT = ROOT.parent
OUT = ROOT / 'dist'
ENTRY_BUDGET = 16000
SHARED_GZIP_BUDGET = 1500000
FIRST_ROUTE_GZIP_BUDGET = 1700000
NEW_MODULE_GZIP_BUDGET = 60000
LEGACY_MODULE_BUDGETS = {'customer': 180000, 'complaints': 40000}


def read(filename):
    return (ROOT / filename).read_text()


def build():
    manifest = json.loads(read('vendor/manifest.json'))
    for filename, expected in manifest['files'].items():
        if hashlib.sha256((ROOT / 'vendor' / filename).read_bytes()).hexdigest() != expected:
            raise SystemExit(f'Vendor checksum mismatch: {filename}')
    routes = json.loads(read('routes.json'))
    entries = json.loads(read('entries.json'))
    all_routes = [route for module in routes['modules'].values() for route in module['routes']]
    if len(set(all_routes)) != len(all_routes) or routes['defaultRoute'] not in all_routes:
        raise SystemExit('Duplicate route or missing default route')
    if 'pc.html' not in entries:
        raise SystemExit('entries.json must retain pc.html')
    for filename, entry in entries.items():
        # Keep the builder away from index, zhongtai, V3 and arbitrary file paths.
        if not re.fullmatch(r'pc(?:-[a-z0-9]+)*\.html', filename):
            raise SystemExit(f'PC entry must be pc.html or pc-<name>.html: {filename}')
        if entry['route'] not in all_routes:
            raise SystemExit(f'Entry route has no module: {filename}')
        target = PROJECT / filename
        if target.exists() and filename != 'pc.html' and '<!-- Generated PC entry: share/tools/build.py -->' not in target.read_text():
            raise SystemExit(f'Refusing to overwrite an unmanaged HTML file: {filename}')
    for group in routes['navigation']:
        for route, *_ in group['items']:
            if route not in all_routes:
                raise SystemExit(f'Navigation route has no module: {route}')
    OUT.mkdir(parents=True, exist_ok=True)
    report = {}
    pending = {}

    def asset(name, content, extension):
        data = content.encode()
        digest = hashlib.sha256(data).hexdigest()[:16]
        filename = f'{extension}/{name}.{digest}.{extension}'
        pending[filename] = data
        report[filename] = {'bytes': len(data), 'gzipBytes': len(gzip.compress(data, mtime=0)), 'sha256': hashlib.sha256(data).hexdigest()}
        return 'share/dist/' + filename

    def compressed(urls):
        return sum(report[url.removeprefix('share/dist/')]['gzipBytes'] for url in urls)

    def js(name, files, vendor=False):
        content = '\n;\n'.join(read(file) for file in files)
        if vendor:
            content = content.replace('process.env.NODE_ENV', '"production"')
            notices = '\n'.join(read('vendor/' + file) for file in ['NOTICE.txt', 'Vue-LICENSE', 'ElementPlus-LICENSE'])
            content = '/*!\n' + notices.replace('*/', '* /') + '\n*/\n' + content
        return asset(name, content, 'js')

    def css(name, files, layer=False):
        content = '\n'.join(read(file) for file in files)
        if layer:
            content = '@layer pc-business {\n' + content + '\n}'
        return asset(name, content, 'css')

    scripts = [
        js('vue-3.5.13', ['vendor/vue-3.5.13.js'], True),
        js('element-plus-2.9.3', ['vendor/element-plus-2.9.3.js', 'vendor/element-plus-zh-cn.js'], True),
        js('by-components-1.1.26', ['vendor/by-components-v3-1.1.26.js'], True),
        js('components', ['js/components.js'])
    ]
    styles = [css('business', ['css/legacy-business.css'], True), css('vendor', ['vendor/element-plus-2.9.3.css', 'vendor/by-components-v3-1.1.26.css']), css('theme', ['css/tokens.css', 'css/theme.css'])]
    app = js('app', ['js/core.js', 'js/loader.js'])
    modules = {}
    for name, module in routes['modules'].items():
        if not re.fullmatch(r'[a-z][a-z0-9-]*', name):
            raise SystemExit(f'Invalid module name: {name}')
        for file in [*module['scripts'], *module['styles']]:
            if not (ROOT / file).resolve().is_relative_to((ROOT / 'pages' / name).resolve()):
                raise SystemExit(f'{name} sources must stay in pages/{name}/; reuse shared UI and vendor assets.')
        module_js = js(name, module['scripts'])
        module_css = [css(name, module['styles'], True)] if module['styles'] else []
        size = compressed([module_js, *module_css])
        ceiling = LEGACY_MODULE_BUDGETS.get(name, NEW_MODULE_GZIP_BUDGET)
        budget = min(module.get('gzipBudget', ceiling), ceiling)
        if size > budget:
            raise SystemExit(f'{name} exceeds compressed module budget: {size:,} > {budget:,}. Split the business module; do not raise the limit to bypass this check.')
        modules[name] = {'routes': module['routes'], 'script': module_js, 'styles': module_css}
    config = {'defaultRoute': routes['defaultRoute'], 'navigation': routes['navigation'], 'scripts': scripts, 'styles': styles, 'modules': modules}
    template = read('templates/entry.html').replace('<!-- pc-critical -->', '<style>\n' + read('css/tokens.css') + read('css/critical.css') + '\n</style>')
    # Discover the selected route's assets before downloading/executing the shell.
    # Preload does not block first paint like a stylesheet link would.
    hints = """(function(c){var r=location.hash.slice(1).split('?')[0]||c.defaultRoute,m=Object.values(c.modules).find(function(m){return m.routes.includes(r)})||Object.values(c.modules).find(function(m){return m.routes.includes(c.defaultRoute)});[[c.scripts.concat(m.script),'script'],[c.styles.concat(m.styles),'style']].forEach(function(g){g[0].forEach(function(url){var l=document.createElement('link');l.rel='preload';l.as=g[1];l.href=url;l.dataset.pcPreload='';document.head.appendChild(l)})})})(window.PC_ASSETS);"""
    fallback = """window.PC_BOOT_FAILED=function(){function show(){var main=document.getElementById('main');main.removeAttribute('aria-busy');main.innerHTML='<div class="pc-loading" role="alert"><span>页面加载失败，请检查网络后重试。</span><button type="button" onclick="location.reload()">重新加载</button></div>'}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',show,{once:true});else show()};window.PC_BOOT_TIMER=setTimeout(function(){if(!window.PCApp)PC_BOOT_FAILED()},30000);"""
    pages = {}
    for filename, entry in entries.items():
        entry_config = {**config, 'defaultRoute': entry['route']}
        config_json = json.dumps(entry_config, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
        html = template.replace('<!-- pc-assets -->', '<script defer fetchpriority="high" src="' + app + '" onerror="PC_BOOT_FAILED()"></script>\n<script>window.PC_ASSETS=' + config_json + ';' + hints + fallback + '</script>')
        if len(html.encode()) > ENTRY_BUDGET:
            raise SystemExit(f'{filename} exceeds {ENTRY_BUDGET:,} bytes; move business code to its module.')
        pages[filename] = html
    shared_size = compressed([app, *scripts, *styles])
    if shared_size > SHARED_GZIP_BUDGET:
        raise SystemExit(f'Shared assets exceed budget: {shared_size:,} > {SHARED_GZIP_BUDGET:,}')
    first_sizes = {}
    for name, module in modules.items():
        first_sizes[name] = shared_size + max(len(gzip.compress(html.encode(), mtime=0)) for html in pages.values()) + compressed([module['script'], *module['styles']])
        if first_sizes[name] > FIRST_ROUTE_GZIP_BUDGET:
            raise SystemExit(f'{name} first-load budget exceeded: {first_sizes[name]:,} > {FIRST_ROUTE_GZIP_BUDGET:,}')
    for filename, data in pending.items():
        path = OUT / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_bytes(data)
        elif path.read_bytes() != data:
            raise SystemExit(f'Asset hash collision: {filename}')
    (ROOT / 'asset-manifest.json').write_text(json.dumps({'entryBytes': len(pages['pc.html'].encode()), 'entries': {name:len(html.encode()) for name,html in pages.items()}, 'sharedGzipBytes': shared_size, 'firstRouteGzipBytes': first_sizes, 'files': report}, ensure_ascii=False, indent=2) + '\n')
    for filename, html in pages.items():
        (PROJECT / filename).write_text(html)
    print(f'Built {len(pages)} PC entries; pc.html: {len(pages["pc.html"].encode()):,} bytes; {len(report)} versioned assets. Shared gzip: {shared_size:,} bytes.')
    for name, size in first_sizes.items():
        print(f'  {name}: first load gzip {size:,} bytes (only this business module)')


if __name__ == '__main__':
    build()
