"""serve.py - static server for the flight test (explicit MIME types: the Windows registry can map .js to text/plain,
which browsers refuse for ES modules; no-cache so a rebuilt GLB is always picked up).

    python serve.py [port]      -> http://localhost:8765
"""
import http.server
import json
import os
import sys
import urllib.parse
import urllib.error
from scoreboard import ScoreStore
from lobby import Lobby, LobbyError

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
ROOT = os.path.dirname(os.path.abspath(__file__))
SCORES = ScoreStore()
LOBBY = Lobby()
ORIGINS = set(filter(None, os.environ.get('NEED4SPACE_ALLOWED_ORIGINS', '').split(',')))


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript", ".glb": "model/gltf-binary",
                      ".gltf": "model/gltf+json", ".json": "application/json", ".webp": "image/webp",
                      ".html": "text/html", ".css": "text/css"}

    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def origin_allowed(self):
        origin = self.headers.get('Origin')
        return not origin or origin in ORIGINS or origin in (f'http://localhost:{PORT}', f'http://127.0.0.1:{PORT}')

    def json_response(self, code, data):
        content = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(content)))
        origin = self.headers.get('Origin')
        if origin and self.origin_allowed():
            self.send_header('Access-Control-Allow-Origin', origin)
            self.send_header('Vary', 'Origin')
        self.end_headers()
        self.wfile.write(content)

    def do_OPTIONS(self):
        if not self.path.startswith(('/api/scoreboard', '/api/lobby/')) or not self.origin_allowed():
            self.json_response(403, {'error': 'Origin not allowed.'})
            return
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', self.headers.get('Origin', f'http://localhost:{PORT}'))
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Vary', 'Origin')
        self.end_headers()

    def lobby(self, method):
        """the multiplayer lobby (lobby.py): rooms, the hosts' calls, the players' handshakes"""
        url = urllib.parse.urlsplit(self.path)
        parts = url.path[len('/api/lobby/'):].strip('/').split('/')
        if not self.origin_allowed():
            self.json_response(403, {'error': 'Origin not allowed.'})
            return
        try:
            data = {}
            if method == 'POST':
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 32768:
                    raise LobbyError(400, 'Invalid request.')
                data = json.loads(self.rfile.read(size))
                if not isinstance(data, dict):
                    raise LobbyError(400, 'Invalid request.')
            query = urllib.parse.parse_qs(url.query)
            if method == 'GET' and parts == ['rooms']:
                out = LOBBY.list(query.get('v', [None])[0])
            elif method == 'POST' and parts == ['rooms']:
                out = LOBBY.create(data)
            elif method == 'POST' and len(parts) == 3 and parts[0] == 'rooms' and parts[2] in ('host', 'close', 'join'):
                out = getattr(LOBBY, parts[2])(parts[1], data)
            elif method == 'GET' and len(parts) == 4 and parts[0] == 'rooms' and parts[2] == 'join':
                out = LOBBY.answer(parts[1], parts[3], query.get('token', [''])[0])
            else:
                raise LobbyError(404, 'Not found.')
            self.json_response(200, out)
        except LobbyError as error:
            self.json_response(error.status, {'error': str(error)})
        except (ValueError, UnicodeError):
            self.json_response(400, {'error': 'Invalid request.'})

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        if url.path.startswith('/api/lobby/'):
            return self.lobby('GET')
        if url.path != '/api/scoreboard':
            return super().do_GET()
        try:
            query = urllib.parse.parse_qs(url.query)
            data = SCORES.read(query.get('map', [''])[0], query.get('difficulty', [''])[0], query.get('name', [None])[0])
            self.json_response(200, data)
        except ValueError as error:
            self.json_response(400, {'error': str(error)})
        except (OSError, urllib.error.HTTPError, KeyError):
            self.json_response(503, {'error': 'Scores are unavailable. Try Refresh again.'})

    def do_POST(self):
        """debug frames: POST /shot/<name> with a PNG body -> racer/wip/shots/<name>.png"""
        if urllib.parse.urlsplit(self.path).path.startswith('/api/lobby/'):
            return self.lobby('POST')
        if urllib.parse.urlsplit(self.path).path == '/api/scoreboard':
            if not self.origin_allowed():
                self.json_response(403, {'error': 'Origin not allowed.'})
                return
            try:
                size = int(self.headers.get('Content-Length', '0'))
                if not 0 < size <= 4096:
                    raise ValueError('Invalid race result.')
                data = json.loads(self.rfile.read(size))
                self.json_response(200, SCORES.submit(data))
            except (ValueError, UnicodeError) as error:
                self.json_response(400, {'error': str(error)})
            except (OSError, urllib.error.HTTPError, KeyError):
                self.json_response(503, {'error': 'Your time was not saved. Please try again.'})
            return
        name = os.path.basename(self.path.split("?")[0])
        if not self.path.startswith("/shot/") or not name.replace("_", "").replace("-", "").isalnum():
            self.send_error(404)
            return
        data = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        out = os.path.join(os.path.dirname(ROOT), "wip", "shots")
        os.makedirs(out, exist_ok=True)
        with open(os.path.join(out, name + ".png"), "wb") as f:
            f.write(data)
        self.send_response(204)
        self.end_headers()

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        if "404" in (fmt % args):
            super().log_message(fmt, *args)


class Server(http.server.ThreadingHTTPServer):
    # several test browsers loading the game at once: the default backlog of 5 refused their connections
    request_queue_size = 128
    daemon_threads = True


if __name__ == "__main__":
    print(f"serving {ROOT} on http://localhost:{PORT}", flush=True)
    Server((os.environ.get('NEED4SPACE_HOST', '127.0.0.1'), PORT), Handler).serve_forever()
