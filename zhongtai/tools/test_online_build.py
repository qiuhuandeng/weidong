"""Focused build/rollback/cache regression checks for the online adapter."""
import hashlib
import json
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from copy import deepcopy

import build_online as build


class OnlineBuildTests(unittest.TestCase):
    def test_build_cache_isolation_and_rollback(self):
        source = build.SOURCE.read_bytes()
        with tempfile.TemporaryDirectory(prefix="weid-build-test-") as folder:
            root = Path(folder)
            output = root / "site"
            stats = build.build(output)
            self.assertLess(stats["entry_bytes"], 4096)
            self.assertEqual(build.SOURCE.read_bytes(), source)
            self.assertEqual((output / "zhongtai/offline.html").read_bytes(), source)
            for relative in ["index.html", "pc/pc.html", "pc/inventory.html", "v3/v3.html"]:
                self.assertEqual((output / relative).read_bytes(), (build.ROOT / relative).read_bytes())
            assets = output / "zhongtai/assets"
            first = {p.name: p.read_bytes() for p in assets.iterdir()}
            for name, content in first.items():
                self.assertEqual(name.split(".")[0], hashlib.sha256(content).hexdigest()[:20])
                if name.endswith(".css"):
                    for url in re.findall(r'url\("([^"]+)"\)', content.decode()):
                        if not url.startswith(("data:", "http", "#")):
                            self.assertTrue((assets / url).is_file(), url)
            entry = (output / "zhongtai/zhongtai.html").read_text()
            runtime_path = re.search(r'<script src="([^"]+)"', entry).group(1)
            runtime = (output / "zhongtai" / runtime_path).read_text()
            config = json.loads(runtime.rsplit("})(", 1)[1].rsplit(");", 1)[0])
            manifest = config["resources"]
            host = (output / "zhongtai" / manifest["index.html"]["url"]).read_text()
            for name in ["tags", "broadcast"]:
                group = config["lazy"][name]
                self.assertNotIn(group["script"], host)
                self.assertNotIn(group["style"], host)
            self.assertNotIn("weid-embedded-files", entry)
            build.build(output)
            self.assertEqual({p.name: p.read_bytes() for p in assets.iterdir()}, first)
            bad = root / "broken.html"
            bad.write_text("broken source")
            with patch.object(build, "SOURCE", bad), self.assertRaises(ValueError):
                build.build(output)
            self.assertEqual((output / "zhongtai/zhongtai.html").read_text(), entry)
            build.build(output, single_file=True)
            self.assertEqual((output / "zhongtai/zhongtai.html").read_bytes(), source)
            self.assertFalse(assets.exists())
            self.assertEqual(build.SOURCE.read_bytes(), source)

    def test_never_overwrite_unowned_directory(self):
        with tempfile.TemporaryDirectory(prefix="weid-build-test-") as folder:
            path = Path(folder)
            sentinel = path / "keep.txt"
            sentinel.write_text("keep")
            with self.assertRaises(ValueError):
                build.build(path)
            self.assertEqual(sentinel.read_text(), "keep")

    def test_lazy_adapter_fails_when_source_contract_changes(self):
        resources, _ = build.unpack(build.SOURCE.read_text())
        resources["index.html"]["text"] = resources["index.html"]["text"].replace('id="broadcast-rules-script"', 'id="unexpected-script"')
        with self.assertRaises(ValueError):
            build.split_inline(resources)
        resources, _ = build.unpack(build.SOURCE.read_text())
        resources["index.html"]["text"] = resources["index.html"]["text"].replace("if(location.hash==='#broadcast-rules')showPage('broadcast-rules');", "")
        with self.assertRaises(ValueError):
            build.split_inline(resources)

    def test_new_page_and_eager_script_require_lazy_registration(self):
        for addition in ['<div id="page-new-business"></div>', '<script>window.newBusiness = true;</script>', '<script src="unregistered.js"></script>']:
            with self.subTest(addition=addition):
                resources, _ = build.unpack(build.SOURCE.read_text())
                resources["index.html"]["text"] += addition
                with self.assertRaises(ValueError):
                    build.check_boundaries(resources, build.LAZY, build.read_policy(), build.resource_path)

    def test_invalid_lazy_dependency_is_blocked(self):
        resources, _ = build.unpack(build.SOURCE.read_text())
        for dependencies in [["missing"], ["broadcast"]]:
            lazy = deepcopy(build.LAZY)
            lazy["tags"]["dependencies"] = dependencies
            with self.assertRaises(ValueError):
                build.check_boundaries(resources, lazy, build.read_policy(), build.resource_path)

    def test_registered_new_module_stays_out_of_startup(self):
        resources, _ = build.unpack(build.SOURCE.read_text())
        resources["index.html"]["text"] += '''<div class="page" id="page-future"></div>
<style id="future-style">#page-future { color: inherit; }</style>
<script id="future-script">window.FuturePage = (() => {
function install() { window.futureInstalled = true; }
document.addEventListener('DOMContentLoaded',install);
return {};
})();</script>'''
        lazy = deepcopy(build.LAZY)
        lazy["future"] = {"page": "page-future", "global": "FuturePage", "prefix": "future", "dependencies": []}
        build.check_boundaries(resources, lazy, build.read_policy(), build.resource_path)
        with patch.object(build, "LAZY", lazy):
            _, groups = build.split_inline(resources)
        self.assertNotIn("futureInstalled", resources["index.html"]["text"])
        self.assertNotIn(groups["future"]["script"], resources["index.html"]["text"])
        self.assertIn("else install()", resources[groups["future"]["script"]]["text"])

    def test_budget_failure_keeps_previous_deployment(self):
        with tempfile.TemporaryDirectory(prefix="weid-budget-test-") as folder:
            output = Path(folder) / "site"
            stats = build.build(output)
            entry = (output / "zhongtai/zhongtai.html").read_bytes()
            policy = build.read_policy()
            policy["limits"]["startup_code_gzip_bytes"] = stats["performance"]["startup"]["startup_code_gzip_bytes"] - 1
            with patch.object(build, "read_policy", return_value=policy), self.assertRaisesRegex(ValueError, "性能检查未通过"):
                build.build(output)
            self.assertEqual((output / "zhongtai/zhongtai.html").read_bytes(), entry)
            policy = build.read_policy()
            policy["limits"]["module_gzip_bytes"] = 1
            with patch.object(build, "read_policy", return_value=policy), self.assertRaisesRegex(ValueError, "模块 gzip"):
                build.build(output)
            self.assertEqual((output / "zhongtai/zhongtai.html").read_bytes(), entry)


if __name__ == "__main__":
    unittest.main()
