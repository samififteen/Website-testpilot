"""Minimal fixture web server for TestPilot AI integration tests.

Serves the static fixture pages and adds two deliberately problematic dynamic
endpoints: ``/slow`` (2 s delay) and ``/error`` (HTTP 500).

Run standalone:  python test-sites/fixtures/local_test_site/server.py --port 8099
"""

from __future__ import annotations

import argparse
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent


class FixtureHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self) -> None:  # noqa: N802 - stdlib naming
        path = self.path.split("?", 1)[0]
        if path == "/slow":
            time.sleep(2.0)
            body = b"<html><head><title>Slow page</title></head><body><h1>Slow</h1><p>This endpoint responded after two seconds.</p></body></html>"
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/error":
            body = b"<html><head><title>Server error</title></head><body><h1>500</h1></body></html>"
            self.send_response(500)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, *_args) -> None:  # silence test output
        return


def create_server(port: int = 0) -> ThreadingHTTPServer:
    return ThreadingHTTPServer(("127.0.0.1", port), FixtureHandler)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the TestPilot fixture site")
    parser.add_argument("--port", type=int, default=8099)
    args = parser.parse_args()
    server = create_server(args.port)
    print(f"Fixture site on http://127.0.0.1:{server.server_port}/")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
