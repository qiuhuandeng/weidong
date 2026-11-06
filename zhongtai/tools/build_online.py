"""Build the online middle platform without changing its single-file source.

The deployment directory keeps the same public URLs for all three projects.
Only zhongtai/zhongtai.html is replaced in that directory; offline.html is the
byte-for-byte source. Run with --single-file to build a rollback deployment.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import html
import json
import posixpath
import re
import shutil
import tempfile
from pathlib import Path
from urllib.parse import unquote, urlsplit

from online_checks import check_boundaries, check_sizes, read_policy

PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT.parent
SOURCE = PROJECT / "zhongtai.html"
TABLE = re.compile(r'<script[^>]*id="weid-embedded-files"[^>]*>([\s\S]*?)</script>')
LAZY = {
    "tags": {"page": "page-dict-customer-tag", "global": "TagValueRules", "prefix": "tag-value-rule", "dependencies": []},
    "broadcast": {"page": "page-broadcast-rules", "global": "BroadcastRules", "prefix": "broadcast-rules", "dependencies": ["tags"]},
}


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def resource_path(value, origin):
    parsed = urlsplit(html.unescape(value))
    if parsed.scheme or parsed.netloc or not parsed.path or value.startswith(("#", "/")):
        return None
    return posixpath.normpath(posixpath.join(posixpath.dirname(origin), unquote(parsed.path)))


def unpack(raw):
    match = TABLE.search(raw)
    if not match:
        raise ValueError("中台源文件缺少 weid-embedded-files，停止构建")
    resources = json.loads(match.group(1))
    if not resources.get("index.html", {}).get("text"):
        raise ValueError("中台源文件缺少宿主页面")
    return resources, raw[:match.start()]


def split_inline(resources):
    """Extract complete inline blocks; do not split the coupled main script."""
    origins = {key: key for key in resources}
    lazy = json.loads(compact(LAZY))
    for page, item in list(resources.items()):
        if item["type"] != "text/html":
            continue
        sequence = 0

        def extract(match):
            nonlocal sequence
            tag, attrs, body = match.groups()
            if tag == "script" and re.search(r"\bsrc\s*=", attrs):
                return match.group(0)
            if tag == "script" and re.search(r'\btype\s*=\s*["\'](?!text/javascript|application/javascript|module)', attrs):
                return match.group(0)
            if not body.strip():
                return match.group(0)
            sequence += 1
            key = f"online-inline/{page.replace('/', '-')}/{sequence:02d}.{'js' if tag == 'script' else 'css'}"
            group = next((value for value in lazy.values() if page == "index.html" and f'id="{value["prefix"]}-{tag}"' in attrs), None)
            if group and tag == "script":
                needle = "document.addEventListener('DOMContentLoaded',install);"
                if body.count(needle) != 1:
                    raise ValueError(f"{group['prefix']} 初始化边界已变化，请先核对构建适配")
                body = body.replace(needle, "if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();")
                if group["global"] == "BroadcastRules":
                    # The online router activates a direct link before loading.
                    # A slow response must not pull a user back after navigation.
                    route = "if(location.hash==='#broadcast-rules')showPage('broadcast-rules');"
                    if body.count(route) != 1:
                        raise ValueError("群发规则直达入口已变化，请先核对构建适配")
                    body = body.replace(route, "if(location.hash==='#broadcast-rules'&&document.getElementById('page-broadcast-rules')?.classList.contains('active'))showPage('broadcast-rules');")
            resources[key] = {"type": "text/javascript" if tag == "script" else "text/css", "text": body}
            origins[key] = page
            if group:
                group[tag] = key
                return ""
            relative = posixpath.relpath(key, posixpath.dirname(page) or ".")
            if tag == "script":
                return f'<script{attrs} src="{relative}"></script>'
            return f'<link{attrs} rel="stylesheet" href="{relative}">'

        item["text"] = re.sub(r"<(script|style)\b([^>]*)>([\s\S]*?)</\1>", extract, item["text"], flags=re.I)
    for name, group in lazy.items():
        if not group.get("script") or not group.get("style"):
            raise ValueError(f"{name} 缺少独立脚本或样式，停止构建")
        group.pop("prefix")
    return origins, lazy


def write_assets(resources, origins, directory):
    directory.mkdir(parents=True)
    manifest = {}
    visiting = set()

    def emit(key):
        if key in manifest:
            return manifest[key]["url"]
        if key in visiting:
            raise ValueError(f"循环样式依赖: {key}")
        visiting.add(key)
        item = resources[key]
        if "data" in item:
            body = base64.b64decode(item["data"].split(",", 1)[1], validate=True)
        else:
            text = item["text"]
            if item["type"] == "text/css":
                def css_url(match):
                    target = resource_path(match.group(2), origins[key])
                    if target not in resources:
                        return match.group(0)
                    return 'url("' + emit(target).rsplit("/", 1)[-1] + '")'
                text = re.sub(r"url\(\s*(['\"]?)([^\s)'\"]+)\1\s*\)", css_url, text)
            body = text.encode()
        extension = {"text/html": "html", "text/javascript": "js", "text/css": "css", "font/woff2": "woff2", "image/webp": "webp"}[item["type"]]
        name = hashlib.sha256(body).hexdigest()[:20] + "." + extension
        (directory / name).write_bytes(body)
        manifest[key] = {"type": item["type"], "url": "assets/" + name, "size": len(body)}
        visiting.remove(key)
        return manifest[key]["url"]

    for key in resources:
        emit(key)
    return manifest


def copy_site(stage, output):
    shutil.copy2(ROOT / "index.html", stage / "index.html")
    def ignore(parent, names):
        return [name for name in names if name in {".DS_Store", "__pycache__", ".publish"} or (Path(parent) / name).resolve() in {stage, output}]
    for name in ("pc", "v3", "zhongtai"):
        shutil.copytree(ROOT / name, stage / name, ignore=ignore)


def build(output, single_file=False):
    output = Path(output).resolve()
    if output in {ROOT, PROJECT, ROOT / "pc", ROOT / "v3"} or output in SOURCE.parents or output.is_file():
        raise ValueError("发布目录不能覆盖源码目录")
    if output.exists() and not (output / ".weid-build.json").is_file():
        raise ValueError("发布目录已存在且不是本工具生成的目录，停止以保护原文件")
    output.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix=".weid-build-", dir=output.parent)).resolve()
    try:
        raw = SOURCE.read_text()
        source_hash = hashlib.sha256(raw.encode()).hexdigest()
        copy_site(stage, output)
        target = stage / "zhongtai"
        shutil.copy2(SOURCE, target / "offline.html")
        stats = {"source_sha256": source_hash, "single_file": single_file, "source_bytes": len(raw.encode())}
        if not single_file:
            resources, prefix = unpack(raw)
            policy = read_policy()
            check_boundaries(resources, LAZY, policy, resource_path)
            origins, lazy = split_inline(resources)
            manifest = write_assets(resources, origins, target / "assets")
            config = {"release": source_hash[:16], "resources": manifest, "lazy": lazy}
            runtime = (PROJECT / "tools/online-runtime.js").read_text()
            runtime = "/* Generated online runtime; edit tools/online-runtime.js. */\n" + runtime.replace("/*__WEID_CONFIG__*/", compact(config))
            name = hashlib.sha256(runtime.encode()).hexdigest()[:20] + ".js"
            (target / "assets" / name).write_text(runtime)
            entry = prefix + f'<script src="assets/{name}" defer></script></body></html>\n'
            stats["performance"] = check_sizes(resources, origins, manifest, target / "assets", entry, runtime, lazy, policy, resource_path)
            (target / "zhongtai.html").write_text(entry)
            stats.update(entry_bytes=len(entry.encode()), resources=len(manifest), runtime_bytes=len(runtime.encode()))
        if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != source_hash:
            raise ValueError("构建期间源文件发生变化，请重新构建")
        (stage / ".weid-build.json").write_text(compact(stats))
        # Publish only a complete build. The existing output is retained on errors.
        previous = output.with_name(output.name + ".previous")
        if previous.exists():
            raise ValueError(f"上次发布备份尚未清理: {previous}")
        if output.exists():
            output.rename(previous)
        try:
            stage.rename(output)
        except Exception:
            if previous.exists():
                previous.rename(output)
            raise
        if previous.exists():
            shutil.rmtree(previous)
        print(compact({"output": str(output), **stats}))
        return stats
    finally:
        if stage.exists():
            shutil.rmtree(stage)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=PROJECT / ".publish")
    parser.add_argument("--single-file", action="store_true", help="生成使用原单文件的回退发布包")
    parser.add_argument("--check", action="store_true", help="检查按需边界与性能上限，不保留发布产物")
    args = parser.parse_args()
    if args.check:
        if args.single_file:
            parser.error("--check 用于检查线上分包，不能与 --single-file 同用")
        with tempfile.TemporaryDirectory(prefix="weid-online-check-") as folder:
            build(Path(folder) / "site")
    else:
        build(args.output, args.single_file)
