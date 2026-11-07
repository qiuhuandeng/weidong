"""Static startup boundaries and size budgets; these do not measure CPU time."""
import gzip
import json
import re
from html.parser import HTMLParser
from pathlib import Path

POLICY = Path(__file__).with_name("online-policy.json")
CSS_URL = re.compile(r"url\(\s*(['\"]?)([^\s)'\"]+)\1\s*\)")


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.elements = 0
        self.urls = []
        self.pages = set()

    def handle_starttag(self, tag, attrs):
        self.elements += 1
        attrs = dict(attrs)
        if attrs.get("id", "").startswith("page-"):
            self.pages.add(attrs["id"])
        # Frames have their own visible-only loading boundary, not startup bytes.
        if tag in {"script", "img", "source", "audio", "video"}:
            self.urls.extend(attrs[key] for key in ("src", "poster") if attrs.get(key))
            if attrs.get("srcset"):
                self.urls.extend(value.strip().split()[0] for value in attrs["srcset"].split(",") if value.strip())
        elif tag == "link" and set(attrs.get("rel", "").split()) & {"stylesheet", "preload", "modulepreload"}:
            if attrs.get("href"):
                self.urls.append(attrs["href"])

    handle_startendtag = handle_starttag


def read_policy():
    policy = json.loads(POLICY.read_text())
    required = {"entry_bytes", "startup_gzip_bytes", "startup_code_gzip_bytes", "startup_raw_bytes", "startup_script_bytes", "startup_requests", "host_elements", "module_gzip_bytes", "module_raw_bytes"}
    if set(policy.get("limits", {})) != required or any(type(value) is not int or value <= 0 for value in policy["limits"].values()):
        raise ValueError("online-policy.json 性能上限缺失或无效")
    return policy


def check_boundaries(resources, lazy, policy, resource_path):
    host = resources["index.html"]["text"]
    parser = References()
    parser.feed(host)
    extra = parser.pages - set(policy["startup"]["pages"])
    if extra:
        raise ValueError("新增页面须登记按需加载，不得直接堆入首页：" + ", ".join(sorted(extra)))
    if re.search(r"<(?:iframe|form|input|select|textarea|table)\b", host, re.I):
        raise ValueError("首页包含业务控件或内嵌页面；请移入按需模块")
    counts = {"script": 0, "style": 0}
    for tag, attrs, body in re.findall(r"<(script|style)\b([^>]*)>([\s\S]*?)</\1>", host):
        if tag == "script" and re.search(r'\btype\s*=\s*["\'](?!text/javascript|application/javascript|module)', attrs):
            continue
        src = re.search(r'\bsrc\s*=\s*(["\'])(.*?)\1', attrs)
        if src:
            key = resource_path(src[2], "index.html")
            if key not in policy["startup"]["scripts"]:
                raise ValueError("新增首页启动脚本未登记按需加载：" + src[2])
        elif body.strip():
            counts[tag] += 1
    for tag in counts:
        if counts[tag] > policy["startup"]["inline_" + tag + "s"]:
            raise ValueError("新增首页内联" + ("脚本" if tag == "script" else "样式") + "未登记按需加载；请复用公共层或登记独立模块")
    # Catch dependency mistakes before publishing an unopenable lazy page.
    seen, visiting = set(), set()
    def visit(name):
        if name not in lazy:
            raise ValueError("未登记的按需模块依赖：" + name)
        if name in visiting:
            raise ValueError("按需模块存在循环依赖：" + name)
        if name in seen:
            return
        visiting.add(name)
        for dependency in lazy[name]["dependencies"]:
            visit(dependency)
        visiting.remove(name)
        seen.add(name)
    for name in lazy:
        visit(name)
        group = lazy[name]
        for field, kind in [("html", "text/html"), ("dialogs", "text/html"), ("scripts", "text/javascript"), ("styles", "text/css")]:
            if not isinstance(group.get(field), list):
                raise ValueError(f"按需模块 {name} 缺少 {field} 清单")
            for path in group[field]:
                if path not in resources or resources[path]["type"] != kind:
                    raise ValueError(f"按需模块 {name} 的资源无效：{path}")
        if not group["html"]:
            raise ValueError(f"按需模块 {name} 缺少页面")
        pages = References()
        for path in group["html"]:
            pages.feed(resources[path]["text"])
        required_pages = {group["page"]} | {part["page"] for part in group.get("parts", [])}
        if not required_pages <= pages.pages:
            raise ValueError(f"按需模块 {name} 缺少登记的页面 ID")
        if not set(group.get("contentDialogs", [])) <= set(group["dialogs"]):
            raise ValueError(f"按需模块 {name} 的弹层挂载位置未登记")
    registered = {path for group in lazy.values() for field in ("html", "dialogs", "scripts", "styles") for path in group[field]}
    unregistered = {key for key in resources if key.startswith("host/pages/")} - registered
    if unregistered:
        raise ValueError("未登记的宿主页面：" + ", ".join(sorted(unregistered)))


def check_sizes(resources, origins, manifest, directory, entry, runtime, lazy, policy, resource_path):
    """Count the static startup graph, including CSS assets, without loading frames."""
    startup, visited = set(), set()
    def visit(key):
        if key in visited:
            return
        visited.add(key)
        startup.add(manifest[key]["url"])
        item = resources[key]
        urls = []
        if item["type"] == "text/html":
            parser = References()
            parser.feed(item["text"])
            urls = parser.urls
        elif item["type"] == "text/css":
            urls = [match[1] for match in CSS_URL.findall(item["text"])]
        for url in urls:
            if url.startswith(("data:", "#")):
                continue
            target = resource_path(url, origins[key])
            if target not in resources:
                raise ValueError(f"首页存在无法计量或未打包的依赖：{key} → {url}；请使用资源表并按需加载")
            visit(target)
    visit("index.html")
    blobs = {url: (directory.parent / url).read_bytes() for url in startup}
    # The host is the actual entry now, not an additional fetch after the runtime.
    blobs.pop(manifest["index.html"]["url"], None)
    blobs["entry"] = entry.encode()
    blobs["runtime"] = runtime.encode()
    script_urls = {manifest[key]["url"] for key in visited if resources[key]["type"] == "text/javascript"}
    code_urls = {manifest[key]["url"] for key in visited if key != "index.html" and resources[key]["type"].startswith("text/")} | {"entry", "runtime"}
    parser = References()
    parser.feed(resources["index.html"]["text"])
    gzip_size = lambda body: len(gzip.compress(body, mtime=0))
    metrics = {
        "entry_bytes": len(blobs["entry"]),
        "startup_gzip_bytes": sum(map(gzip_size, blobs.values())),
        "startup_code_gzip_bytes": sum(gzip_size(blobs[url]) for url in code_urls),
        "startup_raw_bytes": sum(map(len, blobs.values())),
        "startup_script_bytes": sum(len(blobs[url]) for url in script_urls) + len(blobs["runtime"]),
        "startup_requests": len(blobs),
        "host_elements": parser.elements,
    }
    failures = []
    def check(label, value, limit):
        maximum = policy["limits"][limit]
        if value > maximum:
            failures.append(f"{label}: {value:,}，上限 {maximum:,}")
    for name, value in metrics.items():
        check(name, value, name)
    modules = {}
    def module_urls(name):
        group = lazy[name]
        urls = {manifest[path]["url"] for field in ("html", "dialogs", "scripts", "styles") for path in group[field]}
        for dependency in group["dependencies"]:
            urls.update(module_urls(dependency))
        return urls
    for name, group in lazy.items():
        urls = module_urls(name)
        bodies = [(directory.parent / url).read_bytes() for url in urls]
        modules[name] = {"raw_bytes": sum(map(len, bodies)), "gzip_bytes": sum(map(gzip_size, bodies))}
        check(name + " 模块原始体积", modules[name]["raw_bytes"], "module_raw_bytes")
        check(name + " 模块 gzip 体积", modules[name]["gzip_bytes"], "module_gzip_bytes")
    if failures:
        raise ValueError("中台性能检查未通过，停止生成发布包：\n" + "\n".join(failures) + "\n请拆分业务、延后初始化或压缩资源；不要自动放宽上限。")
    return {"startup": metrics, "modules": modules}
