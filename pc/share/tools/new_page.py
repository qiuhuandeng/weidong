"""Scaffold a PC module using the existing shared UI. Does not build or publish."""
import argparse
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent


def create(name, title, group='业务管理', entry=False):
    if not re.fullmatch(r'[a-z][a-z0-9]*(?:-[a-z0-9]+)*', name):
        raise SystemExit('模块名使用小写英文、数字和连字符，例如 inventory。')
    config_file = ROOT / 'routes.json'
    config = json.loads(config_file.read_text())
    entries_file = ROOT / 'entries.json'
    entries = json.loads(entries_file.read_text())
    target = ROOT / 'pages' / name
    filename = f'pc-{name}.html'
    if target.exists() or name in config['modules'] or any(name in m['routes'] for m in config['modules'].values()):
        raise SystemExit(f'模块或路由已存在：{name}')
    if entry and (filename in entries or (ROOT.parent / filename).exists()):
        raise SystemExit(f'入口已存在：{filename}')
    template = (ROOT / 'templates/module.js').read_text()
    source = template.replace('__MODULE_KEY__', json.dumps(name)).replace('__MODULE_NAME__', name).replace('__PAGE_TITLE__', json.dumps(title, ensure_ascii=False))
    target.mkdir(parents=True)
    (target / 'index.js').write_text(source)
    # A standard list needs no private stylesheet. Add style.css only for real business layouts.
    config['modules'][name] = {'scripts':[f'pages/{name}/index.js'], 'styles':[], 'routes':[name]}
    nav = next((g for g in config['navigation'] if g['group'] == group), None)
    if nav is None:
        nav = {'group':group, 'items':[]}
        config['navigation'].append(nav)
    nav['items'].append([name, title, 'file'])
    if entry:
        entries[filename] = {'route':name}
    config_file.write_text(json.dumps(config, ensure_ascii=False, indent=2) + '\n')
    entries_file.write_text(json.dumps(entries, ensure_ascii=False, indent=2) + '\n')
    print(f'已创建 share/pages/{name}/index.js；入口 pc.html#{name}' + (f'，独立入口 {filename}' if entry else ''))
    print('填写业务数据和操作后运行 python3 share/tools/build.py；请勿复制公共控件样式。')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('name')
    parser.add_argument('--title', required=True)
    parser.add_argument('--group', default='业务管理')
    parser.add_argument('--entry', action='store_true', help='同时注册 pc-<name>.html，复用相同公共资源')
    args = parser.parse_args()
    create(args.name, args.title, args.group, args.entry)
