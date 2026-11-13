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
SHARED_GZIP_BUDGET = 100000
FIRST_ROUTE_GZIP_BUDGET = 300000
NEW_MODULE_GZIP_BUDGET = 60000
LEGACY_MODULE_BUDGETS = {'customer': 180000, 'complaints': 40000}


def read(filename):
    return (ROOT / filename).read_text()


def runtime_source(filename):
    """Enforce native, local runtime inputs before writing any release assets.

    This is a dependency-boundary check, not a JavaScript security sandbox.
    Business links, attachments and inline SVG are not runtime library imports.
    """
    path = Path(filename)
    if (path.is_absolute() or not (ROOT / path).resolve().is_relative_to(ROOT.resolve()) or
            any(part in {'vendor', 'node_modules'} for part in path.parts) or
            re.match(r'(?i)(?:vue|element-plus|by-components|vxe(?:table|iconfont)?|react|jquery)(?:[.-]|$)', path.name)):
        raise SystemExit(f'{filename}: native PC runtime cannot include vendor/package files')
    content = read(filename)

    def reject(pattern, reason, flags=0):
        match = re.search(pattern, content, flags)
        if match:
            line = content.count('\n', 0, match.start()) + 1
            raise SystemExit(f'{filename}:{line}: native PC runtime only; {reason}')

    # Block the former UI globals and common framework entry points, including
    # window["Vue"]. Local UMD require('./engine.js') remains usable by unit tests.
    libraries = r'(?:Vue|ElementPlus|ByComponentsV3|VXETable|VxeUI|React|ReactDOM|jQuery)'
    reject(r'\b' + libraries + r'\s*(?:\?\.|\.|\[|\()', 'third-party UI runtime reference')
    reject(r'\b(?:window|globalThis)\s*(?:\.\s*' + libraries + r'\b|\[\s*[\'\"]' + libraries + r'[\'\"]\s*\])', 'third-party UI runtime global')
    reject(r'(?<![\w$.\'\"])import\s*\(|(?:^|[;\n}])\s*(?:import\s*(?:[\'\"{*]|[\w$]+\s+(?:from\b|,))|export\s+[^;\n]*\bfrom\s*[\'\"])', 'register local modules in routes.json and load through PCApp.loadModule')
    for match in re.finditer(r'\brequire\s*\(\s*([\'\"])(.*?)\1\s*\)', content):
        target = match.group(2)
        resolved = (ROOT / path.parent / target).resolve()
        if (not target.startswith(('./', '../')) or not resolved.is_relative_to(ROOT.resolve()) or
                'vendor' in Path(target).parts or 'node_modules' in Path(target).parts or not resolved.is_file()):
            raise SystemExit(f'{filename}: native PC runtime cannot require package {target}')
    reject(r'@font-face\b|\bnew\s+FontFace\s*\(', 'use system fonts and inline SVG; font packages are not allowed', re.I)
    reject(r'@import\b', 'register local CSS in routes.json; CSS imports are not allowed', re.I)
    reject(r'url\(\s*[\'\"]?(?:https?:|//)', 'remote CSS resources are not allowed', re.I)
    reject(r'<script\b[^>]*\bsrc\s*=|<link\b[^>]*\bhref\s*=', 'scripts/styles must come from the generated local asset manifest', re.I)
    reject(r'\bimportScripts\s*\(', 'worker runtime imports are not allowed')
    if filename not in {'js/bootstrap.js', 'js/loader.js'}:
        reject(r'\bcreateElement\s*\(\s*[\'\"](?:script|link)[\'\"]', 'only the shared loader may insert runtime resources', re.I)
    return content


def shell_styles():
    """Extract the welcome theme from its existing sources, in cascade order."""
    def extract(filename):
        content = runtime_source(filename)
        fragments = re.findall(r'/\* pc-shell:start \*/(.*?)/\* pc-shell:end \*/', content, re.S)
        if not fragments or content.count('/* pc-shell:start */') != len(fragments) or content.count('/* pc-shell:end */') != len(fragments):
            raise SystemExit(filename + ': invalid or missing PC shell style boundaries')
        return '\n'.join(fragments)
    return runtime_source('css/tokens.css') + '\n@layer pc-business {\n' + extract('css/legacy-business.css') + '\n}\n' + extract('css/theme.css')


def critical_styles():
    """Inline only tokens needed before the full theme arrives; keep one source."""
    css = runtime_source('css/critical.css')
    tokens = dict(re.findall(r'(--[\w-]+)\s*:\s*([^;{}]+);', runtime_source('css/tokens.css')))
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

    def asset(name, content, extension):
        data = content if isinstance(content, bytes) else content.encode()
        digest = hashlib.sha256(data).hexdigest()[:16]
        if extension not in {'js', 'css'}:
            raise SystemExit('PC runtime builds only native JS/CSS; font and vendor assets are not allowed')
        filename = f'{extension}/{name}.{digest}.{extension}'
        pending[filename] = data
        report[filename] = {'bytes': len(data), 'gzipBytes': len(gzip.compress(data, mtime=0)), 'sha256': hashlib.sha256(data).hexdigest()}
        return 'share/dist/' + filename

    def compressed(urls):
        return sum(report[url.removeprefix('share/dist/')]['gzipBytes'] for url in urls)

    def js(name, files):
        return asset(name, '\n;\n'.join(runtime_source(file) for file in files), 'js')

    def css(name, files, layer=False):
        content = '\n'.join(runtime_source(file).replace('/* pc-shell:start */', '').replace('/* pc-shell:end */', '') for file in files)
        if layer:
            content = '@layer pc-business {\n' + content + '\n}'
        return asset(name, content, 'css')

    # Native UI and system fonts: no framework, component vendor or font downloads.
    scripts = [{'src': js('components', ['js/components.js', 'js/ui-collections.js', 'js/ui-richtext.js']), 'global': 'PCUI'}]
    styles = [css('business', ['css/legacy-business.css'], True), css('theme', ['css/tokens.css', 'css/theme.css'])]
    app = js('app', ['js/shell.js', 'js/loader.js'])
    business_script = js('core', ['js/core.js'])
    modules = {}
    for name, module in routes['modules'].items():
        if not re.fullmatch(r'[a-z][a-z0-9-]*', name):
            raise SystemExit(f'Invalid module name: {name}')
        for file in [*module['scripts'], *module['styles']]:
            if not (ROOT / file).resolve().is_relative_to((ROOT / 'pages' / name).resolve()):
                raise SystemExit(f'{name} sources must stay in pages/{name}/; reuse the shared native UI.')
        module_js = js(name, module['scripts'])
        module_css = [css(name, module['styles'], True)] if module['styles'] else []
        size = compressed([module_js, *module_css])
        ceiling = LEGACY_MODULE_BUDGETS.get(name, NEW_MODULE_GZIP_BUDGET)
        budget = min(module.get('gzipBudget', ceiling), ceiling)
        if size > budget:
            raise SystemExit(f'{name} exceeds compressed module budget: {size:,} > {budget:,}. Split the business module; do not raise the limit to bypass this check.')
        if 'requiresUI' in module and not isinstance(module['requiresUI'], bool):
            raise SystemExit(f'{name} requiresUI must be a boolean')
        if 'shellOnly' in module and (not isinstance(module['shellOnly'], bool) or (module['shellOnly'] and module.get('requiresUI') is not False)):
            raise SystemExit(f'{name} shellOnly requires requiresUI: false')
        # Empty collections are restored by bootstrap before any module is used.
        # Keep the entry registry compact as independent business modules grow.
        modules[name] = {'script': module_js}
        if module['routes']:
            modules[name]['routes'] = module['routes']
        if module_css:
            modules[name]['styles'] = module_css
        if module.get('shellOnly'):
            modules[name]['shellOnly'] = True
        if module.get('requiresUI') is False:
            modules[name]['requiresUI'] = False
        if module.get('dependencies'):
            modules[name]['dependencies'] = module['dependencies']
    entry_shell_styles = [asset('shell', shell_styles(), 'css')]
    config = {'scripts': scripts, 'businessScript': business_script, 'styles': styles, 'shellStyles': entry_shell_styles}
    template = runtime_source('templates/entry.html').replace('<!-- pc-critical -->', '<style>\n' + critical_styles() + '\n</style>')
    bootstrap = runtime_source('js/bootstrap.js')
    pages = {}
    for filename, entry in entries.items():
        selected_modules = {name: modules[name] for name in scopes[filename]}
        selected_routes = {route for module in selected_modules.values() for route in module.get('routes', [])}
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
    shared_size = compressed(set([app, business_script, *(script['src'] for script in scripts), *styles, *entry_shell_styles]))
    if shared_size > SHARED_GZIP_BUDGET:
        raise SystemExit(f'Shared assets exceed budget: {shared_size:,} > {SHARED_GZIP_BUDGET:,}')
    def dependency_assets(name, seen=None):
        seen = set() if seen is None else seen
        if name in seen:
            return []
        seen.add(name)
        module = modules[name]
        common = list(entry_shell_styles if module.get('shellOnly') else [business_script, *styles])
        if module.get('requiresUI', True):
            common.extend(script['src'] for script in scripts)
        return [*common, module['script'], *module.get('styles', []), *(asset for dep in module.get('dependencies', []) for asset in dependency_assets(dep, seen))]

    first_sizes = {}
    for name, module in modules.items():
        first_sizes[name] = max(len(gzip.compress(html.encode(), mtime=0)) for html in pages.values()) + compressed(set([app, *dependency_assets(name)]))
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
        print(f'  {name}: first load gzip {size:,} bytes (including required business dependencies)')


if __name__ == '__main__':
    build()
