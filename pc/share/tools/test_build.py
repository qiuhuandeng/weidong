"""Regression checks for deployability, cache isolation and future module budgets.
Runs entirely in a temporary copy; never rewrites project data or generated assets.
"""
from contextlib import redirect_stdout
import importlib.util
import io
import json
from pathlib import Path
import random
import shutil
import sys
import tempfile
import unittest
import re
import base64
import hashlib

sys.dont_write_bytecode = True
SOURCE = Path(__file__).resolve().parent.parent


class BuildChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='weid-pc-build-')
        self.root = Path(self.temp.name)
        shutil.copytree(SOURCE, self.root / 'share', ignore=shutil.ignore_patterns('verification', 'dist', '__pycache__'))
        spec = importlib.util.spec_from_file_location('pc_build_test', self.root / 'share/tools/build.py')
        self.builder = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.builder)

    def tearDown(self):
        self.temp.cleanup()

    def build(self):
        with redirect_stdout(io.StringIO()):
            self.builder.build()
        return json.loads((self.root / 'share/asset-manifest.json').read_text())

    def test_deterministic_and_complete_deployment(self):
        first = self.build()
        html = (self.root / 'pc.html').read_bytes()
        self.assertEqual(first, self.build())
        self.assertEqual(html, (self.root / 'pc.html').read_bytes())
        for filename, info in first['files'].items():
            data = (self.root / 'share/dist' / filename).read_bytes()
            self.assertEqual(len(data), info['bytes'])
            self.assertIn(info['sha256'][:16], filename)
        self.assertLess(len(html), self.builder.ENTRY_BUDGET)
        self.assertNotIn(b'pc-ui/', html)
        self.assertNotIn(b'share/pages/', html)
        self.assertNotIn(b'share/js/', html)
        self.assertNotIn(b'https://', html)

    def test_business_edit_preserves_shared_cache_and_old_assets(self):
        before = self.build()
        old_html = (self.root / 'pc.html').read_bytes()
        complaint = self.root / 'share/pages/complaints/business.js'
        complaint.write_text(complaint.read_text() + '\n/* cache regression fixture */\n')
        after = self.build()
        changed = set(before['files']) ^ set(after['files'])
        self.assertEqual(len(changed), 2)
        self.assertTrue(all(name.startswith('js/complaints.') and name.endswith('.js') for name in changed))
        self.assertNotEqual(old_html, (self.root / 'pc.html').read_bytes())
        self.assertTrue(all((self.root / 'share/dist' / name).exists() for name in before['files']))

    def test_fonts_preserve_vendor_bytes_and_relative_urls(self):
        manifest = self.build()
        css = (self.root / 'share/vendor/by-components-v3-1.1.26.css').read_text()
        embedded = re.findall(r'url\(data:[^,)]*;base64,([A-Za-z0-9+/=]+)\)', ''.join(re.findall(r'@font-face\s*\{[^}]+\}', css)))
        fonts = {name: info for name, info in manifest['files'].items() if name.startswith('fonts/')}
        self.assertEqual(len(fonts), 6)
        self.assertEqual({hashlib.sha256(base64.b64decode(data)).hexdigest() for data in embedded}, {info['sha256'] for info in fonts.values()})
        published = next(self.root / 'share/dist' / name for name in manifest['files'] if name.startswith('css/vendor.'))
        urls = re.findall(r'url\((\.\./fonts/[^)]+)\)', published.read_text())
        self.assertEqual(len(urls), 6)
        self.assertTrue(all((published.parent / url).is_file() for url in urls))
        self.assertEqual(manifest['preferredFontBytes'], sum(info['bytes'] for name, info in fonts.items() if name.endswith('.woff2')))

    def test_shell_only_module_has_no_ui_preload(self):
        manifest = self.build()
        html = (self.root / 'pc.html').read_text()
        config = json.loads(re.search(r'window.PC_ASSETS=(.*?);\(function', html).group(1))
        self.assertFalse(config['modules']['home']['requiresUI'])
        self.assertTrue(config['modules']['customer']['requiresUI'])
        self.assertLess(manifest['firstRouteGzipBytes']['home'], 60000)
        self.assertEqual(len([url for url in config['scripts'] if '/vendor.' in url]), 1)

    def test_new_module_is_independent_and_gets_default_budget(self):
        before = self.build()
        config_file = self.root / 'share/routes.json'
        config = json.loads(config_file.read_text())
        config['modules']['probe'] = {'scripts':['pages/probe/index.js'], 'styles':[], 'routes':['probe']}
        config_file.write_text(json.dumps(config))
        probe = self.root / 'share/pages/probe/index.js'
        probe.parent.mkdir(parents=True)
        probe.write_text('window.PCModules.probe={render(){},leave(){}};')
        after = self.build()
        self.assertTrue(set(before['files']).issubset(after['files']))
        self.assertEqual(len(after['files']), len(before['files']) + 1)
        previous_html = (self.root / 'pc.html').read_bytes()
        rng = random.Random(19)
        probe.write_text('const oversize=' + json.dumps(''.join(rng.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=110000))) + ';')
        with self.assertRaisesRegex(SystemExit, 'compressed module budget'):
            self.build()
        self.assertEqual(previous_html, (self.root / 'pc.html').read_bytes())

    def test_duplicate_routes_and_vendor_mutations_fail(self):
        config_file = self.root / 'share/routes.json'
        config = json.loads(config_file.read_text())
        config['modules']['complaints']['routes'].append('rules')
        config_file.write_text(json.dumps(config))
        with self.assertRaisesRegex(SystemExit, 'Duplicate route'):
            self.build()
        vendor = self.root / 'share/vendor/vue-3.5.13.js'
        vendor.write_text(vendor.read_text() + '\n// changed')
        with self.assertRaisesRegex(SystemExit, 'Vendor checksum mismatch'):
            self.build()

    def test_multiple_entries_share_the_exact_same_assets(self):
        before = self.build()
        file = self.root / 'share/entries.json'
        file.write_text(json.dumps({'pc.html':{'route':'rules'}, 'pc-refunds.html':{'route':'refunds'}}))
        after = self.build()
        self.assertEqual(before['files'], after['files'])
        def config(filename):
            html = (self.root / filename).read_text()
            return json.loads(re.search(r'window.PC_ASSETS=(.*?);\(function', html).group(1))
        main, second = config('pc.html'), config('pc-refunds.html')
        self.assertEqual(second.pop('defaultRoute'), 'refunds')
        main.pop('defaultRoute')
        self.assertEqual(main, second)
        # Other systems and existing hand-maintained files cannot be overwritten.
        for name in ['index.html','zhongtai.html','v3.html','../pc.html']:
            file.write_text(json.dumps({'pc.html':{'route':'rules'},name:{'route':'refunds'}}))
            with self.assertRaisesRegex(SystemExit, 'PC entry must be'):
                self.build()
        file.write_text(json.dumps({'pc.html':{'route':'rules'},'pc-existing.html':{'route':'refunds'}}))
        (self.root / 'pc-existing.html').write_text('<p>Existing page</p>')
        with self.assertRaisesRegex(SystemExit, 'unmanaged HTML'):
            self.build()

    def test_scaffold_and_module_boundary(self):
        spec = importlib.util.spec_from_file_location('pc_scaffold_test', self.root / 'share/tools/new_page.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with redirect_stdout(io.StringIO()):
            module.create('inventory', '库存', entry=True)
        self.build()
        self.assertTrue((self.root / 'pc-inventory.html').is_file())
        with self.assertRaisesRegex(SystemExit, '已存在'):
            module.create('inventory','库存')
        file = self.root / 'share/routes.json'
        config = json.loads(file.read_text())
        for source in ['vendor/vue-3.5.13.js','pages/customer/index.js','pages/inventory/../../js/core.js']:
            config['modules']['inventory']['scripts'] = [source]
            file.write_text(json.dumps(config))
            with self.assertRaisesRegex(SystemExit, 'sources must stay'):
                self.build()


if __name__ == '__main__':
    unittest.main(verbosity=2)
