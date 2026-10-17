#!/bin/zsh
cd "$(dirname "$0")/.." || exit 1
python3 - <<'PY'
import http.server
import os
import webbrowser

server = None
for port in range(8765, 8790):
    try:
        server = http.server.ThreadingHTTPServer(('127.0.0.1', port), http.server.SimpleHTTPRequestHandler)
        break
    except OSError:
        continue
if server is None:
    raise SystemExit('没有可用的本地端口，请关闭之前启动的原型服务后再试。')
url = f'http://127.0.0.1:{server.server_port}/customer-merge-prototype/demo.html'
print('客户档案合并原型已启动：' + url, flush=True)
print('此窗口保持运行；按 Control+C 停止服务。', flush=True)
webbrowser.open(url)
try:
    server.serve_forever()
except KeyboardInterrupt:
    print('\n原型服务已停止。')
finally:
    server.server_close()
PY
