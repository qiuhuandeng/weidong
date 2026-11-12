"""Build, startup-boundary, module-contract and rollback regression checks."""
import hashlib
import json
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import build_online as build


class OnlineBuildTests(unittest.TestCase):
    def test_site_copy_has_no_dependency_on_moved_projects(self):
        with tempfile.TemporaryDirectory(prefix="weid-copy-test-") as folder:
            root = Path(folder) / "weidong"
            root.mkdir()
            (root / "index.html").write_text("navigation")
            for name in ("pc", "v3", "zhongtai"):
                (root / name).mkdir()
                (root / name / "entry.html").write_text(name)
            # The independently deployed sibling must never enter this release.
            sibling = Path(folder) / "wechat"
            sibling.mkdir()
            (sibling / "index.html").write_text("independent project")
            for legacy_present in (False, True):
                with self.subTest(legacy_present=legacy_present):
                    if legacy_present:
                        for name in ("企微", "chat", "wechat"):
                            (root / name).mkdir()
                            (root / name / "old.html").write_text("obsolete")
                    stage = Path(folder) / str(legacy_present)
                    stage.mkdir()
                    with patch.object(build, "ROOT", root):
                        build.copy_site(stage, Path(folder) / "release")
                    self.assertEqual({p.name for p in stage.iterdir()}, {"index.html", "pc", "v3", "zhongtai"})
                    for name in ("pc", "v3", "zhongtai"):
                        self.assertEqual((stage / name / "entry.html").read_text(), name)

    def sources(self):
        resources, _ = build.unpack(build.SOURCE.read_text())
        return resources, build.lazy_modules(resources)

    def check(self, resources, modules):
        build.check_boundaries(resources, modules, build.read_policy(), build.resource_path)

    def test_build_cache_isolation_and_rollback(self):
        source = build.SOURCE.read_bytes()
        with tempfile.TemporaryDirectory(prefix="weid-build-test-") as folder:
            output = Path(folder) / "site"
            stats = build.build(output)
            self.assertLess(stats["entry_bytes"], 65536)
            self.assertEqual(stats["performance"]["startup"]["startup_requests"], 4)
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
            self.assertIn("欢迎使用AI中台", re.sub(r"<[^>]*>", "", entry))
            self.assertNotIn("weid-embedded-files", entry)
            self.assertNotIn("<iframe", entry)
            self.assertIsNone(re.search(r"<(?:input|select|textarea|form|table)\b", entry))
            self.assertEqual(set(re.findall(r'id="(page-[^"]+)"', entry)), {"page-home"})
            for group in config["lazy"].values():
                for path in group["html"] + group["scripts"]:
                    self.assertNotIn(config["resources"][path]["url"], entry)
            build.build(output)
            self.assertEqual({p.name: p.read_bytes() for p in assets.iterdir()}, first)
            bad = Path(folder) / "broken.html"
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

    def test_registered_business_cannot_become_eager(self):
        for addition in ['<div id="page-org"></div>', '<script>window.newBusiness = true;</script>', '<script src="host/code/controls.js"></script>']:
            with self.subTest(addition=addition):
                resources, modules = self.sources()
                resources["index.html"]["text"] += addition
                with self.assertRaises(ValueError):
                    self.check(resources, modules)

    def test_missing_and_cyclic_module_dependencies_are_blocked(self):
        for dependencies in [["missing"], ["org"]]:
            resources, modules = self.sources()
            modules["org"]["dependencies"] = dependencies
            with self.assertRaises(ValueError):
                self.check(resources, modules)
        resources, modules = self.sources()
        del resources[modules["org"]["html"][0]]
        with self.assertRaises(ValueError):
            self.check(resources, modules)

    def test_new_page_requires_complete_registration(self):
        resources, modules = self.sources()
        resources["host/pages/future.html"] = {"type": "text/html", "text": '<div class="page" id="page-future"></div>'}
        with self.assertRaises(ValueError):
            self.check(resources, modules)
        modules["future"] = {"page": "page-future", "html": ["host/pages/future.html"], "dialogs": [], "scripts": [], "styles": [], "dependencies": []}
        self.check(resources, modules)
        self.assertNotIn("page-future", resources["index.html"]["text"])

    def test_offline_resource_index_is_complete_and_lazy(self):
        raw = build.SOURCE.read_text()
        catalog = json.loads(build.TABLE.search(raw).group(1))
        self.assertTrue(all("block" in item and "text" not in item for item in catalog.values()))
        broken = raw.replace('id="' + next(iter(catalog.values()))["block"] + '"', 'id="missing-block"', 1)
        with self.assertRaises(ValueError):
            build.unpack(broken)
        resources, modules = self.sources()
        self.assertNotIn("localStorage", resources["host/shell.js"]["text"])
        self.assertNotIn("indexedDB", resources["host/shell.js"]["text"])
        self.assertNotIn("host/pages/dict-customer-tag.html", modules["broadcast-rules"]["html"])
        self.assertEqual(modules["broadcast-rules"]["dialogs"], [])

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
