"""远行前端本地服务器。

同时提供 web/ 下的静态文件，并把 /api、/docs、/redoc、/openapi.json
反向代理到 FastAPI。这样浏览器只访问同源地址，不会触发 CORS，也不需要
修改后端的 CORS_ORIGINS。

用法：
    cd backend
    .\\.venv\\Scripts\\python.exe web\\serve.py
    # 打开 http://127.0.0.1:5174

可选：
    --port 5174          前端端口
    --backend http://127.0.0.1:8001    FastAPI 地址
    --open               启动后自动打开浏览器
"""

from __future__ import annotations

import argparse
import http.client
import sys
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

WEB_DIR = Path(__file__).resolve().parent
PROXY_PREFIXES = ("/api/", "/api", "/docs", "/redoc", "/openapi.json")

BACKEND = urlsplit("http://127.0.0.1:8001")
TIMEOUT_SECONDS = 320.0

# 不转发给上游的请求头：Host 由代理重写，Origin 去掉后上游不会执行 CORS 判断，
# Accept-Encoding 去掉后上游返回未压缩内容，便于原样流式转发。
SKIP_REQUEST_HEADERS = {
    "host",
    "connection",
    "accept-encoding",
    "origin",
    "referer",
    "upgrade",
    "proxy-connection",
    "transfer-encoding",
}

SKIP_RESPONSE_HEADERS = {
    "connection",
    "keep-alive",
    "proxy-authenticate",
    "proxy-authorization",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
}


class VoyageHandler(SimpleHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "VoyageDev/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def do_GET(self):  # noqa: N802 - http.server API
        if self._is_proxy_path():
            self._proxy()
        else:
            super().do_GET()

    def do_HEAD(self):  # noqa: N802 - http.server API
        if self._is_proxy_path():
            self._proxy()
        else:
            super().do_HEAD()

    def do_POST(self):  # noqa: N802 - http.server API
        if self._is_proxy_path():
            self._proxy()
        else:
            self.send_error(405, "Method Not Allowed")

    def do_PUT(self):  # noqa: N802 - http.server API
        if self._is_proxy_path():
            self._proxy()
        else:
            self.send_error(405, "Method Not Allowed")

    def do_PATCH(self):  # noqa: N802 - http.server API
        if self._is_proxy_path():
            self._proxy()
        else:
            self.send_error(405, "Method Not Allowed")

    def do_DELETE(self):  # noqa: N802 - http.server API
        if self._is_proxy_path():
            self._proxy()
        else:
            self.send_error(405, "Method Not Allowed")

    def do_OPTIONS(self):  # noqa: N802 - http.server API
        # 同源页面不会发送预检请求；如果确实收到，直接放行。
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", "*"))
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID")
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _is_proxy_path(self) -> bool:
        path = urlsplit(self.path).path
        return any(path == prefix or path.startswith(prefix) for prefix in PROXY_PREFIXES)

    def _proxy(self) -> None:
        backend_path = BACKEND.path.rstrip("/")
        target = f"{backend_path}{self.path}" if backend_path else self.path

        body = None
        if self.command in {"POST", "PUT", "PATCH"}:
            try:
                length = int(self.headers.get("Content-Length") or 0)
            except ValueError:
                length = 0
            body = self.rfile.read(length) if length > 0 else b""

        headers = {
            name: value
            for name, value in self.headers.items()
            if name.lower() not in SKIP_REQUEST_HEADERS
        }
        headers["Host"] = BACKEND.netloc
        headers["Connection"] = "close"

        connection_class = (
            http.client.HTTPSConnection if BACKEND.scheme == "https" else http.client.HTTPConnection
        )
        connection = None
        try:
            connection = connection_class(BACKEND.hostname, BACKEND.port, timeout=TIMEOUT_SECONDS)
            connection.request(self.command, target, body=body, headers=headers)
            response = connection.getresponse()

            self.send_response(response.status, response.reason)
            for name, value in response.getheaders():
                if name.lower() in SKIP_RESPONSE_HEADERS:
                    continue
                self.send_header(name, value)
            # 上游流式响应可能是 chunked；这里改为读到连接关闭为止。
            self.send_header("Connection", "close")
            self.end_headers()
            self.close_connection = True

            if self.command == "HEAD":
                return

            while True:
                chunk = response.read1(65536)
                if not chunk:
                    break
                self.wfile.write(chunk)
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            # 浏览器取消规划时，正常断开即可，让上游任务也随之中止。
            self.close_connection = True
        except Exception as exc:  # noqa: BLE001 - 开发服务器需要给出可读错误
            if not self.wfile.closed:
                try:
                    if not getattr(self, "_headers_buffer", None):
                        self.send_error(502, f"无法连接 FastAPI：{exc}")
                    else:
                        self.close_connection = True
                except (BrokenPipeError, ConnectionResetError):
                    self.close_connection = True
        finally:
            if connection is not None:
                connection.close()


def main() -> int:
    global BACKEND

    parser = argparse.ArgumentParser(description="远行前端本地服务器（静态文件 + FastAPI 同源代理）")
    parser.add_argument("--port", type=int, default=5174, help="前端端口，默认 5174")
    parser.add_argument(
        "--backend",
        default="http://127.0.0.1:8001",
        help="FastAPI 地址，默认 http://127.0.0.1:8001",
    )
    parser.add_argument("--open", action="store_true", help="启动后自动打开浏览器")
    args = parser.parse_args()

    backend = urlsplit(args.backend.strip().rstrip("/"))
    if backend.scheme not in {"http", "https"} or not backend.hostname:
        parser.error("--backend 必须是完整的 http(s) 地址，例如 http://127.0.0.1:8001")
    BACKEND = backend

    try:
        server = ThreadingHTTPServer(("127.0.0.1", args.port), VoyageHandler)
    except OSError as exc:
        print(f"无法监听 127.0.0.1:{args.port}：{exc}", file=sys.stderr)
        print("换一个端口试试：python web/serve.py --port 5175", file=sys.stderr)
        return 1

    server.daemon_threads = True
    url = f"http://127.0.0.1:{args.port}/"
    print("远行 · VOYAGE ATELIER")
    print(f"  页面   {url}")
    print(f"  后端   {args.backend}")
    print(f"  接口   {url}api/v1/...（同源代理，无需 CORS）")
    print("  按 Ctrl+C 停止")
    if args.open:
        webbrowser.open(url)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止。")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
