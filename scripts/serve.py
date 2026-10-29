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
import re
import wave
from recording_store import RecordingStore

IDENTITY_PATH = '/__tangerine__/identity'
SAMPLES_PATH = '/__tangerine__/samples'
AUDIO_SUFFIXES = {'.wav', '.aif', '.aiff', '.flac', '.ogg', '.mp3', '.m4a'}
SERVER_VERSION = 2


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


SFZ_NOTES = {'c': 0, 'd': 2, 'e': 4, 'f': 5, 'g': 7, 'a': 9, 'b': 11}


def sfz_key(value):
    """An SFZ key: a MIDI number or a note name (c4 = 60)."""
    value = value.strip().lower()
    if value.lstrip('-').isdigit():
        return int(value)
    if value and value[0] in SFZ_NOTES:
        sign = {'#': 1, 'b': -1}.get(value[1:2], 0)
        octave = value[2:] if sign else value[1:]
        if octave.lstrip('-').isdigit():
            return 12 * (int(octave) + 1) + SFZ_NOTES[value[0]] + sign
    return None


def wav_rate(path):
    try:
        with wave.open(str(path)) as audio:
            return audio.getframerate()
    except (OSError, wave.Error, EOFError):
        return 44100


def sfz_zones(path, url):
    """The regions of an SFZ file, as zones Tangerine can play."""
    text = re.sub(r'//[^\n]*', '', path.read_text(errors='replace'))
    zones, scope, defaults, region, base = [], None, {}, None, path.parent
    for token in re.finditer(r'<(\w+)>|(\w+)=([^\n<]*?)(?=\s+\w+=|\s*<|\s*$)', text, re.S):
        if token.group(1):
            if region is not None:
                zones.append(region)
            scope = token.group(1)
            region = dict(defaults) if scope == 'region' else None
            if scope in ('group', 'global', 'master'):
                defaults = {} if scope != 'group' else {k: v for k, v in defaults.items() if k == 'default_path'}
            continue
        key, value = token.group(2), token.group(3).strip()
        (region if region is not None else defaults)[key] = value
    if region is not None:
        zones.append(region)
    out = []
    for z in zones:
        if 'sample' not in z:
            continue
        sample = (base / (z.get('default_path', '') + z['sample']).replace('\\', '/')).resolve()
        if not sample.is_file():
            continue
        key = sfz_key(z.get('pitch_keycenter', z.get('key', '60'))) or 60
        zone = {'name': sample.name, 'url': url(sample), 'key': key, 'tune': float(z.get('tune', 0) or 0)}
        lo, hi = sfz_key(z.get('lokey', z.get('key', ''))), sfz_key(z.get('hikey', z.get('key', '')))
        if lo is not None and hi is not None:
            zone['lo'], zone['hi'] = lo, hi
        if z.get('loop_mode', 'loop_continuous') in ('loop_continuous', 'loop_sustain') and 'loop_end' in z:
            zone['loop'] = [int(z.get('loop_start', 0)), int(z['loop_end'])]
            zone['rate'] = wav_rate(sample)
        out.append(zone)
    return out


def sample_folder(root):
    """samples/ next to Tangerine, or SAMPLES next to its folder."""
    for folder in (root / 'samples', root.parent / 'SAMPLES', root.parent / 'samples'):
        if folder.is_dir() and any(p.is_dir() for p in folder.iterdir()):
            return folder.resolve()
    return (root / 'samples').resolve()


def sample_index(root):
    """Tangerine II: the instruments of instruments.json, plus any folder of named notes; real spaces in _spaces/."""
    folder = sample_folder(root)
    index = {'folder': str(folder), 'instruments': {}, 'spaces': {}}
    if not folder.is_dir():
        return index

    def url(path):
        return '/samples/' + urllib.parse.quote(path.relative_to(folder).as_posix())

    def audio_in(path):
        return sorted(p for p in path.iterdir() if p.is_file() and p.suffix.lower() in AUDIO_SUFFIXES and not p.name.startswith('.'))

    def inside(relative):
        path = (folder / relative).resolve()
        return path if path.is_relative_to(folder) and path.exists() else None

    try:
        named = json.loads((root / 'instruments.json').read_text())
    except (OSError, ValueError):
        named = {}
    for name, spec in named.items():
        if name.startswith('_') or not isinstance(spec, dict):
            continue
        zones = []
        if spec.get('sfz') and inside(spec['sfz']):
            zones = sfz_zones(inside(spec['sfz']), url)
        elif spec.get('folder') and inside(spec['folder']):
            zones = [{'name': p.name, 'url': url(p)} for p in audio_in(inside(spec['folder']))]
        elif spec.get('files'):
            zones = [{'name': p.name, 'url': url(p)} for p in map(inside, spec['files']) if p and p.is_file()]
        if zones:
            index['instruments'][name] = {'label': spec.get('label', name), 'gain': spec.get('gain', 1), 'zones': zones[:128]}

    note = re.compile(r'[A-G](#|b)?-?[0-8]$')
    for entry in sorted(folder.iterdir()):
        if not entry.is_dir() or entry.name.startswith('.'):
            continue
        files = audio_in(entry)
        if entry.name.lower() == '_spaces':
            index['spaces'] = {p.stem.lower(): url(p) for p in files}
            continue
        # A folder of single notes (Choir C3.wav, Choir D3.wav...) is an instrument by itself.
        if len(files) >= 3 and sum(bool(note.search(p.stem)) for p in files) >= 0.8 * len(files):
            name = re.sub(r'[^a-z0-9]+', '-', entry.name.lower()).strip('-')
            index['instruments'].setdefault(name, {'label': entry.name, 'gain': 1, 'zones': [{'name': p.name, 'url': url(p)} for p in files[:128]]})
    return index


def matching_server(port, identity):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(f'http://127.0.0.1:{port}{IDENTITY_PATH}', timeout=0.35) as response:
            actual = json.loads(response.read(8192))
        return actual == identity
    except (OSError, ValueError, urllib.error.URLError):
        return False


def handler_for(root, identity, recordings):
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
            if urllib.parse.urlsplit(self.path).path == SAMPLES_PATH:
                from io import BytesIO
                data = json.dumps(sample_index(root)).encode()
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                return BytesIO(data)
            return super().send_head()

        def translate_path(self, path):
            # /samples/... comes from the samples folder next to the launcher, never from above it.
            route = urllib.parse.unquote(urllib.parse.urlsplit(path).path)
            if route.startswith('/samples/'):
                folder = sample_folder(root)
                target = (folder / route[len('/samples/'):]).resolve()
                return str(target) if target.is_relative_to(folder) else str(folder / '__outside__')
            return super().translate_path(path)

        def _json(self, code, value):
            data = json.dumps(value).encode()
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            parts = urllib.parse.urlsplit(self.path)
            if parts.path == '/__tangerine__/recordings':
                return self._json(200, {'available': True, 'folder': str(recordings.folder)})
            if parts.path.startswith('/__tangerine__/recordings/'):
                route = parts.path.split('/')
                try:
                    if len(route) != 6 or route[4] != 'files': raise KeyError()
                    path = recordings.download(route[3], urllib.parse.unquote(route[5]))
                    self.send_response(200)
                    self.send_header('Content-Type', 'audio/wav')
                    self.send_header('Content-Disposition', f'attachment; filename="{path.name}"')
                    self.send_header('Content-Length', str(path.stat().st_size))
                    self.end_headers()
                    with path.open('rb') as stream:
                        import shutil
                        shutil.copyfileobj(stream, self.wfile)
                    return
                except (KeyError, OSError): return self._json(404, {'error': 'Recording not found.'})
            return super().do_GET()

        def do_POST(self):
            # Local API: reject cross-origin writes and all unexpected body types.
            host = self.headers.get('Host', '')
            expected = {f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}'}
            if host not in expected:
                return self._json(403, {'error': 'Use the local loopback address.'})
            origin = self.headers.get('Origin')
            if origin and origin != 'http://' + self.headers.get('Host', ''):
                return self._json(403, {'error': 'This recording must be started from this local Tangerine tab.'})
            parts = urllib.parse.urlsplit(self.path)
            route = parts.path.split('/')
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 2_000_000: raise ValueError('Invalid request size.')
                kind = self.headers.get('Content-Type', '').split(';')[0]
                if kind not in ['application/json', 'application/octet-stream']: raise ValueError('Invalid content type.')
                data = self.rfile.read(size)
                if route == ['', '__tangerine__', 'recordings', 'start'] and kind == 'application/json':
                    options = json.loads(data)
                    return self._json(201, recordings.start(options.get('sampleRate'), options.get('source'), options.get('seed')))
                if len(route) == 5 and route[1:3] == ['__tangerine__', 'recordings']:
                    sid, action = route[3:5]
                    if action == 'chunk' and kind == 'application/octet-stream':
                        sequence = int(urllib.parse.parse_qs(parts.query)['sequence'][0])
                        return self._json(200, recordings.append(sid, sequence, data))
                    if action == 'stop' and kind == 'application/json':
                        return self._json(200, recordings.stop(sid))
                return self._json(404, {'error': 'Unknown recording action.'})
            except KeyError: return self._json(404, {'error': 'Recording not found.'})
            except (ValueError, TypeError) as error: return self._json(400, {'error': str(error)})
            except OSError: return self._json(507, {'error': 'The Mac could not write the recording. Check free disk space and folder permissions.'})

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
    parser.add_argument('--port', type=int, default=4350)
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
    recordings = RecordingStore(root / 'Recordings')
    server = None
    for port in range(args.port, args.port + 32):
        try:
            server = ThreadingHTTPServer(('127.0.0.1', port), handler_for(root, identity, recordings))
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
    print(f'\n  Tangerine {identity["version"]} — local studio\n\n  {url}\n\n  Keep this Terminal window open while you listen.\n  Close it, or press Ctrl+C, to stop Tangerine.\n', flush=True)
    if args.open_browser:
        opener = threading.Timer(0.35, lambda: webbrowser.open(url))
        opener.daemon = True
        opener.start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        recordings.close()
        server.server_close()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
