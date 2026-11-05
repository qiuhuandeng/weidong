"""Build the PC entry and fingerprinted, same-origin assets (Python stdlib only).
Sources live in share/. Deploy PC entries AND share/dist/ together. No CDN, npm or
build service is needed. Older assets are deliberately retained for open tabs.
"""
from pathlib import Path
import base64
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


def critical_styles():
    """Inline only tokens needed before the full theme arrives; keep one source."""
    css = read('css/critical.css')
    tokens = dict(re.findall(r'(--[\w-]+)\s*:\s*([^;{}]+);', read('css/tokens.css')))
    required = set()

    def include(name):
        if name in required:
            return
        if name not in tokens:
            raise SystemExit('Unknown critical CSS token: ' + name)
        required.add(name)
        for dependency in re.findall(r'var\((--[\w-]+)', tokens[name]):
            include(dependency)

    for name in re.findall(r'var\((--[\w-]+)', css):
        include(name)
    return ':root{' + ''.join(f'{name}:{value};' for name, value in tokens.items() if name in required) + '}\n' + css


def entry_scopes(entries, modules):
    """Select an entry's module registry before emitting routes and navigation."""
    scopes = {}
    for filename, entry in entries.items():
        if 'modules' in entry and 'excludeModules' in entry:
            raise SystemExit(f'{filename}: use modules or excludeModules, not both')
        for field in ('modules', 'excludeModules'):
            names = entry.get(field, [])
            if (not isinstance(names, list) or
                    any(not isinstance(name, str) or name not in modules for name in names) or
                    len(set(names)) != len(names)):
                raise SystemExit(f'{filename}: invalid {field}')
        selected = entry.get('modules', list(modules))
        scopes[filename] = [name for name in selected if name not in entry.get('excludeModules', [])]
        if not any(entry['route'] in modules[name]['routes'] for name in scopes[filename]):
            raise SystemExit(f'{filename}: default route is outside its module scope')
    return scopes


def entry_redirects(entries, modules, scopes):
    """Only allow local, registered destinations that really own each old route."""
    redirects = {}
    for filename, entry in entries.items():
        mapping = entry.get('redirectModules', {})
        if not isinstance(mapping, dict):
            raise SystemExit(f'{filename}: invalid redirectModules')
        redirects[filename] = {}
        for name, target in mapping.items():
            if (name not in modules or name in scopes[filename] or
                    not isinstance(target, str) or target not in entries or
                    name not in scopes[target]):
                raise SystemExit(f'{filename}: invalid module redirect {name}')
            redirects[filename].update({route: target for route in modules[name]['routes']})
    return redirects


def build():
    manifest = json.loads(read('vendor/manifest.json'))
    for filename, expected in manifest['files'].items():
        if hashlib.sha256((ROOT / 'vendor' / filename).read_bytes()).hexdigest() != expected:
            raise SystemExit(f'Vendor checksum mismatch: {filename}')
    routes = json.loads(read('routes.json'))
    entries = json.loads(read('entries.json'))
    def check_dependencies(name, chain=()):
        if name in chain or name not in routes['modules']:
            raise SystemExit('Invalid or circular module dependency: ' + ' -> '.join((*chain, name)))
        for dependency in routes['modules'][name].get('dependencies', []):
            check_dependencies(dependency, (*chain, name))
    for name in routes['modules']:
        check_dependencies(name)
    all_routes = [route for module in routes['modules'].values() for route in module['routes']]
    if len(set(all_routes)) != len(all_routes) or routes['defaultRoute'] not in all_routes:
        raise SystemExit('Duplicate route or missing default route')
    if 'pc.html' not in entries:
        raise SystemExit('entries.json must retain pc.html')
    for filename, entry in entries.items():
        # Keep the builder away from index, zhongtai, V3 and arbitrary file paths.
        if filename != 'inventory.html' and not re.fullmatch(r'pc(?:-[a-z0-9]+)*\.html', filename):
            raise SystemExit(f'PC entry must be pc.html, inventory.html or pc-<name>.html: {filename}')
        if entry['route'] not in all_routes:
            raise SystemExit(f'Entry route has no module: {filename}')
        target = PROJECT / filename
        if target.exists() and filename != 'pc.html' and '<!-- Generated PC entry: share/tools/build.py -->' not in target.read_text():
            raise SystemExit(f'Refusing to overwrite an unmanaged HTML file: {filename}')
    for group in routes['navigation']:
        for route, *_ in group['items']:
            if route not in all_routes:
                raise SystemExit(f'Navigation route has no module: {route}')
    scopes = entry_scopes(entries, routes['modules'])
    for filename, selected in scopes.items():
        for name in selected:
            if any(dep not in selected for dep in routes['modules'][name].get('dependencies', [])):
                raise SystemExit(filename + ': missing module dependency for ' + name)
    redirects = entry_redirects(entries, routes['modules'], scopes)
    OUT.mkdir(parents=True, exist_ok=True)
    report = {}
    pending = {}
    preferred_fonts = set()

    def asset(name, content, extension):
        data = content if isinstance(content, bytes) else content.encode()
        digest = hashlib.sha256(data).hexdigest()[:16]
        directory = 'fonts' if extension in {'woff2', 'woff', 'ttf'} else extension
        filename = f'{directory}/{name}.{digest}.{extension}'
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
        # Keep the vendor CSS and all fallback formats intact, but let browsers
        # download only the font format actually needed instead of all base64 copies.
        def font_face(match):
            block = match.group(0)
            family = re.search(r'font-family:\s*([\w-]+)', block)
            def font_url(source):
                data = base64.b64decode(source.group(1), validate=True)
                extension = {b'wOF2': 'woff2', b'wOFF': 'woff', b'\x00\x01\x00\x00': 'ttf'}.get(data[:4])
                if not extension or not family:
                    raise SystemExit('Unrecognized embedded vendor font')
                url = asset(family.group(1), data, extension)
                if extension == 'woff2':
                    preferred_fonts.add(url)
                return 'url(../' + url.removeprefix('share/dist/') + ')'
            return re.sub(r'url\(data:[^,)]*;base64,([A-Za-z0-9+/=]+)\)', font_url, block)
        content = re.sub(r'@font-face\s*\{[^}]+\}', font_face, content)
        if layer:
            content = '@layer pc-business {\n' + content + '\n}'
        return asset(name, content, 'css')

    # Independent immutable downloads; the loader gates execution on successful
    # initialization, not merely the insertion order of classic script tags.
    scripts = [
        {'src': js('vue', ['vendor/vue-3.5.13.js'], True), 'global': 'Vue'},
        {'src': js('element-plus', ['vendor/element-plus-2.9.3.js', 'vendor/element-plus-zh-cn.js'], True), 'global': 'ElementPlus'},
        {'src': js('by-components', ['vendor/by-components-v3-1.1.26.js'], True), 'global': 'ByComponentsV3'},
        {'src': js('components', ['js/components.js']), 'global': 'PCUI'}
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
        if 'requiresUI' in module and not isinstance(module['requiresUI'], bool):
            raise SystemExit(f'{name} requiresUI must be a boolean')
        modules[name] = {'routes': module['routes'], 'script': module_js, 'styles': module_css}
        if module.get('requiresUI') is False:
            modules[name]['requiresUI'] = False
        if module.get('dependencies'):
            modules[name]['dependencies'] = module['dependencies']
    shell_styles = [styles[0], styles[2]]
    config = {'scripts': scripts, 'styles': styles, 'shellStyles': shell_styles}
    template = read('templates/entry.html').replace('<!-- pc-critical -->', '<style>\n' + critical_styles() + '\n</style>')
    bootstrap = read('js/bootstrap.js')
    pages = {}
    for filename, entry in entries.items():
        selected_modules = {name: modules[name] for name in scopes[filename]}
        selected_routes = {route for module in selected_modules.values() for route in module['routes']}
        navigation = []
        for group in routes['navigation']:
            items = [item for item in group['items'] if item[0] in selected_routes]
            if items:
                navigation.append({**group, 'items': items})
        entry_config = {**config, 'defaultRoute': entry['route'], 'modules': selected_modules,
                        'navigation': navigation, 'routeRedirects': redirects[filename]}
        config_json = json.dumps(entry_config, ensure_ascii=False, separators=(',', ':')).replace('<', '\\u003c')
        html = template.replace('<!-- pc-assets -->', '<script>window.PC_ASSETS=' + config_json + ';\n' + bootstrap + '</script>\n<script defer fetchpriority="high" src="' + app + '" onerror="PC_BOOT_FAILED(new Error(\'入口资源加载失败\'))" onload="if(!window.PCApp)PC_BOOT_FAILED(new Error(\'入口初始化未完成\'))"></script>')
        if len(html.encode()) > ENTRY_BUDGET:
            raise SystemExit(f'{filename} exceeds {ENTRY_BUDGET:,} bytes; move business code to its module.')
        pages[filename] = html
    # WOFF2 is already compressed; conservatively count both preferred fonts even
    # on pages that do not use their glyphs. Fallback formats are not double-counted.
    font_size = sum(report[url.removeprefix('share/dist/')]['bytes'] for url in preferred_fonts)
    shared_size = compressed([app, *(script['src'] for script in scripts), *styles]) + font_size
    if shared_size > SHARED_GZIP_BUDGET:
        raise SystemExit(f'Shared assets exceed budget: {shared_size:,} > {SHARED_GZIP_BUDGET:,}')
    def dependency_assets(name, seen=None):
        seen = set() if seen is None else seen
        if name in seen:
            return []
        seen.add(name)
        module = modules[name]
        return [module['script'], *module['styles'], *(asset for dep in module.get('dependencies', []) for asset in dependency_assets(dep, seen))]

    first_sizes = {}
    for name, module in modules.items():
        common_size = shared_size if module.get('requiresUI', True) else compressed([app, *shell_styles])
        first_sizes[name] = common_size + max(len(gzip.compress(html.encode(), mtime=0)) for html in pages.values()) + compressed(dependency_assets(name))
        if first_sizes[name] > FIRST_ROUTE_GZIP_BUDGET:
            raise SystemExit(f'{name} first-load budget exceeded: {first_sizes[name]:,} > {FIRST_ROUTE_GZIP_BUDGET:,}')
    for filename, data in pending.items():
        path = OUT / filename
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_bytes(data)
        elif path.read_bytes() != data:
            raise SystemExit(f'Asset hash collision: {filename}')
    (ROOT / 'asset-manifest.json').write_text(json.dumps({'entryBytes': len(pages['pc.html'].encode()), 'entries': {name:len(html.encode()) for name,html in pages.items()}, 'sharedGzipBytes': shared_size, 'preferredFontBytes': font_size, 'firstRouteGzipBytes': first_sizes, 'files': report}, ensure_ascii=False, indent=2) + '\n')
    for filename, html in pages.items():
        (PROJECT / filename).write_text(html)
    print(f'Built {len(pages)} PC entries; pc.html: {len(pages["pc.html"].encode()):,} bytes; {len(report)} versioned assets. Shared gzip: {shared_size:,} bytes.')
    for name, size in first_sizes.items():
        print(f'  {name}: first load gzip {size:,} bytes (including required business dependencies)')


if __name__ == '__main__':
    build()
