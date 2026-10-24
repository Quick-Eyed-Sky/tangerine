#!/usr/bin/env python3
"""Serve this copy of Tangerine without reopening another copy or a stale page."""

import argparse
import hashlib
import json
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import secrets
import threading
import urllib.error
import urllib.parse
import urllib.request
import webbrowser

IDENTITY_PATH = '/__tangerine__/identity'
SERVER_VERSION = 1


def identity_for(root):
    digest = hashlib.sha256()
    for path in sorted((root / 'dist').rglob('*')):
        if path.is_file() and not path.name.startswith('.'):
            digest.update(path.relative_to(root).as_posix().encode())
            digest.update(b'\0')
            digest.update(path.read_bytes())
            digest.update(b'\0')
    digest.update(Path(__file__).read_bytes())
    try:
        version = json.loads((root / 'package.json').read_text())['version']
    except (OSError, ValueError, KeyError):
        version = 'local'
    return {
        'app': 'tangerine', 'server_version': SERVER_VERSION,
        'instance': hashlib.sha256(str(root).encode()).hexdigest(),
        'build': digest.hexdigest(), 'version': version,
    }


def matching_server(port, identity):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(f'http://127.0.0.1:{port}{IDENTITY_PATH}', timeout=0.35) as response:
            actual = json.loads(response.read(8192))
        return actual == identity
    except (OSError, ValueError, urllib.error.URLError):
        return False


def handler_for(root, identity):
    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(root / 'dist'), **kwargs)

        def end_headers(self):
            self.send_header('Cache-Control', 'no-store, max-age=0')
            self.send_header('Pragma', 'no-cache')
            self.send_header('Expires', '0')
            super().end_headers()

        def send_head(self):
            if urllib.parse.urlsplit(self.path).path == IDENTITY_PATH:
                from io import BytesIO
                data = json.dumps(identity).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                return BytesIO(data)
            return super().send_head()

        def list_directory(self, path):
            self.send_error(404, 'Not found')
            return None

    return Handler


def launch_url(port, identity):
    query = urllib.parse.urlencode({'build': identity['build'][:16], 'launch': secrets.token_hex(6)})
    return f'http://127.0.0.1:{port}/?{query}'


def reopen(port, identity, open_browser):
    url = launch_url(port, identity)
    print(f'\n  Tangerine {identity["version"]} is already running from this folder.\n  {url}\n', flush=True)
    if open_browser:
        webbrowser.open(url)
    return 0


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument('--port', type=int, default=4250)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--open', dest='open_browser', action='store_true')
    mode.add_argument('--no-open', dest='open_browser', action='store_false')
    parser.set_defaults(open_browser=False)
    args = parser.parse_args()
    root = args.root.resolve()
    if not (root / 'dist' / 'index.html').is_file():
        parser.error('Tangerine could not find dist/index.html next to its launcher.')
    if not 1 <= args.port <= 65504:
        parser.error('Choose a port between 1 and 65504.')
    identity = identity_for(root)
    # Keep the same browser origin even if a lower port has become available
    # since this copy was started. An origin owns its saved browser settings.
    for port in range(args.port, args.port + 32):
        if matching_server(port, identity):
            return reopen(port, identity, args.open_browser)
    server = None
    for port in range(args.port, args.port + 32):
        try:
            server = ThreadingHTTPServer(('127.0.0.1', port), handler_for(root, identity))
            break
        except OSError:
            # Another launch can finish between the initial scan and bind().
            if matching_server(port, identity):
                return reopen(port, identity, args.open_browser)
    if server is None:
        print('Tangerine could not find a free local port. Close an older Tangerine server and try again.', flush=True)
        return 1
    server.daemon_threads = True
    url = launch_url(port, identity)
    print(f'\n  Tangerine {identity["version"]} — sequences in slow light\n\n  {url}\n\n  Keep this Terminal window open while you listen.\n  Close it, or press Ctrl+C, to stop Tangerine.\n', flush=True)
    if args.open_browser:
        opener = threading.Timer(0.35, lambda: webbrowser.open(url))
        opener.daemon = True
        opener.start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
