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
from urllib.parse import quote, unquote, urlsplit

from online_checks import check_boundaries, check_sizes, read_policy

PROJECT = Path(__file__).resolve().parents[1]
ROOT = PROJECT.parent
SOURCE = PROJECT / "zhongtai.html"
TABLE = re.compile(r'<script[^>]*id="weid-embedded-files"[^>]*>([\s\S]*?)</script>')
MODULES = "host/modules.json"


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
    catalog = json.loads(match.group(1))
    resources = {}
    blocks = {key: body for key, body in re.findall(r'<script[^>]*id="([^"]+)"[^>]*>([\s\S]*?)</script>', raw)}
    for key, item in catalog.items():
        if "block" not in item or item["block"] not in blocks:
            raise ValueError(f"内嵌资源索引无效：{key}")
        resources[key] = json.loads(blocks[item["block"]])
        if resources[key]["type"] != item["type"]:
            raise ValueError(f"内嵌资源类型不一致：{key}")
    head = re.search(r'<!-- weid-host-head -->([\s\S]*?)<!-- /weid-host-head -->', raw)
    body = re.search(r'<!-- weid-host-body -->([\s\S]*?)<!-- /weid-host-body -->', raw)
    if not head or not body:
        raise ValueError("源文件缺少静态首页壳层")
    style = re.search(r'<style id="weid-shell-style">([\s\S]*?)</style>', head[1])
    if not style:
        raise ValueError("源文件缺少首页样式")
    resources["host/shell.css"] = {"type": "text/css", "text": style[1]}
    host_head = head[1].replace(style[0], '<link data-weid-shell rel="stylesheet" href="host/shell.css">')
    resources["index.html"] = {"type": "text/html", "text": '<!DOCTYPE html><html lang="zh-CN"><head>' + host_head + '</head><body>' + body[1] + '<script src="host/shell.js"></script></body></html>'}
    if not resources.get("index.html", {}).get("text"):
        raise ValueError("中台源文件缺少宿主页面")
    return resources, ""


def lazy_modules(resources):
    return json.loads(resources[MODULES]["text"])


def bundle_host_styles(resources, lazy):
    """One request per route for its shared rules; source rules remain stored once."""
    for name, group in lazy.items():
        paths = [path for path in group["styles"] if path.startswith("host/styles/") or path == "host/shell.css"]
        if not paths:
            continue
        key = f"online-styles/{name}.css"
        resources[key] = {"type": "text/css", "text": "\n".join(resources[path]["text"] for path in paths)}
        group["styles"] = [key] + [path for path in group["styles"] if path not in paths]


def split_inline(resources):
    """Extract complete child-page blocks. Host modules are already explicit resources."""
    origins = {key: key for key in resources}
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
            resources[key] = {"type": "text/javascript" if tag == "script" else "text/css", "text": body}
            origins[key] = page
            relative = posixpath.relpath(key, posixpath.dirname(page) or ".")
            if tag == "script":
                return f'<script{attrs} src="{relative}"></script>'
            return f'<link{attrs} rel="stylesheet" href="{relative}">'

        item["text"] = re.sub(r"<(script|style)\b([^>]*)>([\s\S]*?)</\1>", extract, item["text"], flags=re.I)
    return origins


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
        extension = {"text/html": "html", "text/javascript": "js", "text/css": "css", "application/json": "json", "font/woff2": "woff2", "image/webp": "webp"}[item["type"]]
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
            resources, _ = unpack(raw)
            lazy = lazy_modules(resources)
            policy = read_policy()
            check_boundaries(resources, lazy, policy, resource_path)
            bundle_host_styles(resources, lazy)
            origins = split_inline(resources)
            manifest = write_assets(resources, origins, target / "assets")
            config = {"release": source_hash[:16], "resources": manifest, "lazy": lazy}
            runtime = (PROJECT / "tools/online-runtime.js").read_text()
            runtime = "/* Generated online runtime; edit tools/online-runtime.js. */\n" + runtime.replace("/*__WEID_CONFIG__*/", compact(config))
            name = hashlib.sha256(runtime.encode()).hexdigest()[:20] + ".js"
            (target / "assets" / name).write_text(runtime)
            host = resources["index.html"]["text"]
            def startup_url(match):
                key = resource_path(match[3], "index.html")
                if key not in manifest:
                    return match[0]
                url = manifest[key]["url"]
                if resources[key]["type"] == "text/html":
                    target = urlsplit(html.unescape(match[3]))
                    url = "zhongtai.html?__weid_page=" + quote(key, safe="/")
                    if target.query:
                        url += "&" + target.query
                    if target.fragment:
                        url += "#" + target.fragment
                    url = html.escape(url, quote=True)
                return match[1] + '=' + match[2] + url + match[2]
            entry = re.sub(r'\b(src|href)\s*=\s*([\"\'])([^\"\']*)\2', startup_url, host)
            # Runtime context must exist before shell code, while all URLs are discoverable in the first HTML.
            entry = entry.replace('<script src=', f'<script src="assets/{name}"></script><script src=', 1)
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
