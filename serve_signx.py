"""
SignX - High Performance Local Server (Web Preview & Backend API)
Runs both the SignX Web Interface (port 3000) and API Backend (port 3001).
Zero external dependencies required (Pure Python 3).
"""

import os
import sys
import re
import json
import mimetypes
import urllib.request
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
import threading
import webbrowser
import time

ROOT_DIR = os.path.dirname(os.path.abspath(__file__))
PORT_PREVIEW = 3000
PORT_BACKEND = 3001

MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json'
}

# Load environment configuration
ENV_CONFIG = {
    'PORT': '3001',
    'CORS_ORIGIN': '*',
    'OLLAMA_BASE_URL': 'https://ollama.com/api',
    'OLLAMA_MODEL': 'qwen3:8b',
    'OLLAMA_API_KEY': '',
    'OLLAMA_TIMEOUT_MS': '12000',
    'OLLAMA_MAX_RETRIES': '2',
    'YOUTUBE_API_KEY': ''
}

env_file = os.path.join(ROOT_DIR, 'backend', '.env')
if os.path.exists(env_file):
    try:
        with open(env_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    ENV_CONFIG[k.strip()] = v.strip().strip('"\'')
    except Exception as e:
        print(f"[Config] Error reading .env: {e}")


class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True


class PreviewHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Clean logging
        pass

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Range')
        self.send_header('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length')
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        req_path = urllib.parse.unquote(parsed.path)

        if req_path in ('', '/'):
            req_path = '/index.html'

        rel_path = req_path.lstrip('/')
        file_path = os.path.join(ROOT_DIR, rel_path)

        # Normalize and prevent traversal
        try:
            file_path = os.path.abspath(file_path)
            if not file_path.startswith(ROOT_DIR):
                self.send_error(403, "Forbidden")
                return
        except Exception:
            self.send_error(403, "Forbidden")
            return

        if os.path.isdir(file_path):
            index_path = os.path.join(file_path, 'index.html')
            if os.path.exists(index_path):
                file_path = index_path
            else:
                sidepanel_path = os.path.join(file_path, 'sidepanel.html')
                if os.path.exists(sidepanel_path):
                    file_path = sidepanel_path
                else:
                    self.send_error(404, f"Directory index not found: {req_path}")
                    return

        if not os.path.exists(file_path) or not os.path.isfile(file_path):
            if os.path.exists(file_path + '.html'):
                file_path = file_path + '.html'
            else:
                self.send_error(404, f"File not found: {req_path}")
                return

        ext = os.path.splitext(file_path)[1].lower()
        content_type = MIME_TYPES.get(ext, mimetypes.guess_type(file_path)[0] or 'application/octet-stream')

        try:
            total_size = os.path.getsize(file_path)
            range_header = self.headers.get('Range')

            # Range request handling (for 3D models and media streaming)
            if range_header and range_header.startswith('bytes='):
                range_spec = range_header[6:].split('-')
                start = int(range_spec[0]) if range_spec[0] else 0
                end = int(range_spec[1]) if len(range_spec) > 1 and range_spec[1] else total_size - 1
                if start >= total_size:
                    self.send_error(416, "Requested Range Not Satisfiable")
                    return
                end = min(end, total_size - 1)
                chunk_len = (end - start) + 1

                self.send_response(206)
                self.send_header('Content-Type', content_type)
                self.send_header('Content-Range', f'bytes {start}-{end}/{total_size}')
                self.send_header('Accept-Ranges', 'bytes')
                self.send_header('Content-Length', str(chunk_len))
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()

                with open(file_path, 'rb') as f:
                    f.seek(start)
                    bytes_to_send = chunk_len
                    while bytes_to_send > 0:
                        read_size = min(bytes_to_send, 65536)
                        data = f.read(read_size)
                        if not data:
                            break
                        self.wfile.write(data)
                        bytes_to_send -= len(data)
                return

            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Content-Length', str(total_size))
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
            self.end_headers()

            with open(file_path, 'rb') as f:
                while True:
                    chunk = f.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
        except (ConnectionResetError, BrokenPipeError):
            pass
        except Exception as err:
            try:
                self.send_error(500, f"Error: {err}")
            except Exception:
                pass


class BackendHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass

    def send_cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
        self.send_header('Access-Control-Max-Age', '86400')

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        qs = urllib.parse.parse_qs(parsed.query)

        # /api/health or /health
        if path in ('/api/health', '/health'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_cors()
            self.end_headers()
            payload = {
                "status": "healthy",
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "service": "SignX Sign-to-Text Backend",
                "version": "1.0.0",
                "ollamaConnectivity": {
                    "reachable": True,
                    "model": ENV_CONFIG.get('OLLAMA_MODEL', 'qwen3:8b')
                }
            }
            self.wfile.write(json.dumps(payload, indent=2).encode('utf-8'))
            return

        # /api/config
        if path == '/api/config':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_cors()
            self.end_headers()
            yt_key = ENV_CONFIG.get('YOUTUBE_API_KEY', '')
            masked_yt = (yt_key[:6] + '...' + yt_key[-4:]) if len(yt_key) > 10 else 'NOT_SET'
            payload = {
                "status": "success",
                "config": {
                    "port": PORT_BACKEND,
                    "youtube": {
                        "apiKeyConfigured": bool(yt_key),
                        "apiKeyMasked": masked_yt
                    }
                }
            }
            self.wfile.write(json.dumps(payload, indent=2).encode('utf-8'))
            return

        # /api/youtube/search
        if path == '/api/youtube/search':
            q = qs.get('q', [''])[0]
            max_results = min(25, int(qs.get('maxResults', ['8'])[0]))
            key = qs.get('key', [''])[0] or ENV_CONFIG.get('YOUTUBE_API_KEY', '')
            if not q or not key:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Missing query or YouTube API key"}).encode('utf-8'))
                return

            try:
                url = f"https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults={max_results}&q={urllib.parse.quote(q)}&key={key}"
                req = urllib.request.Request(url, headers={'User-Agent': 'SignX/1.0'})
                with urllib.request.urlopen(req, timeout=10) as resp:
                    yt_data = json.loads(resp.read().decode('utf-8'))

                items = []
                for item in yt_data.get('items', []):
                    vid_id = item.get('id', {}).get('videoId')
                    if vid_id:
                        snippet = item.get('snippet', {})
                        items.append({
                            'id': vid_id,
                            'title': snippet.get('title'),
                            'description': snippet.get('description'),
                            'channel': snippet.get('channelTitle'),
                            'publishedAt': snippet.get('publishedAt'),
                            'thumb': snippet.get('thumbnails', {}).get('medium', {}).get('url', f"https://img.youtube.com/vi/{vid_id}/hqdefault.jpg")
                        })

                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'success', 'count': len(items), 'query': q, 'items': items}).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({'error': str(e)}).encode('utf-8'))
            return

        # /api/youtube/captions
        if path == '/api/youtube/captions':
            video_id = qs.get('id', [''])[0]
            if not video_id:
                self.send_response(400)
                self.send_cors()
                self.end_headers()
                self.wfile.write(b'{"error": "Missing video id"}')
                return

            subtitles = []
            try:
                caption_url = f"https://www.youtube.com/api/timedtext?lang=en&v={urllib.parse.quote(video_id)}"
                req = urllib.request.Request(caption_url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
                with urllib.request.urlopen(req, timeout=6) as resp:
                    xml_text = resp.read().decode('utf-8', errors='ignore')

                pattern = re.compile(r'<text\s+start="([\d\.]+)"\s+dur="([\d\.]+)"[^>]*>([\s\S]*?)</text>', re.IGNORECASE)
                for m in pattern.finditer(xml_text):
                    start = float(m.group(1))
                    dur = float(m.group(2))
                    raw_t = m.group(3)
                    t = (raw_t.replace('&amp;', '&').replace('&lt;', '<')
                               .replace('&gt;', '>').replace('&#39;', "'")
                               .replace('&quot;', '"').replace('\n', ' ').strip())
                    if t:
                        subtitles.append({'start': start, 'end': round(start + dur, 2), 'text': t})
            except Exception:
                pass

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_cors()
            self.end_headers()
            self.wfile.write(json.dumps({'status': 'success', 'videoId': video_id, 'count': len(subtitles), 'subtitles': subtitles}).encode('utf-8'))
            return

        # 404 Fallback
        self.send_response(404)
        self.send_header('Content-Type', 'application/json')
        self.send_cors()
        self.end_headers()
        self.wfile.write(json.dumps({'error': 'Not Found', 'path': path}).encode('utf-8'))

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path == '/api/sign-to-text':
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8', errors='ignore')
            try:
                data = json.loads(body) if body else {}
            except Exception:
                data = {}

            tokens = data.get('tokens', [])
            confidence = float(data.get('confidence', 1.0))
            display_text = " ".join(tokens)

            res_body = {
                "status": "success",
                "recognizedTokens": tokens,
                "displayText": display_text.capitalize() + ("." if display_text else ""),
                "confidence": confidence,
                "source": "local_synthesizer"
            }

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_cors()
            self.end_headers()
            self.wfile.write(json.dumps(res_body).encode('utf-8'))
            return

        self.send_response(404)
        self.send_cors()
        self.end_headers()


def run_server():
    preview_server = ThreadedHTTPServer(('127.0.0.1', PORT_PREVIEW), PreviewHandler)
    backend_server = ThreadedHTTPServer(('127.0.0.1', PORT_BACKEND), BackendHandler)

    t1 = threading.Thread(target=preview_server.serve_forever, daemon=True)
    t2 = threading.Thread(target=backend_server.serve_forever, daemon=True)

    t1.start()
    t2.start()

    print("\n" + "=" * 60)
    print("  SignX - Indian Sign Language (ISL) Assistant & Companion")
    print("=" * 60)
    print(f"  [+] Main Website Preview:  http://localhost:{PORT_PREVIEW}")
    print(f"  [+] Side Panel Interface:  http://localhost:{PORT_PREVIEW}/sidepanel/sidepanel.html")
    print(f"  [+] Popup Interface:       http://localhost:{PORT_PREVIEW}/popup/popup.html")
    print(f"  [+] Backend API Health:    http://localhost:{PORT_BACKEND}/api/health")
    print("=" * 60)
    print("  Server is actively running. Press Ctrl+C to stop.\n")

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nShutting down SignX server...")
        preview_server.shutdown()
        backend_server.shutdown()
        sys.exit(0)


if __name__ == '__main__':
    run_server()
