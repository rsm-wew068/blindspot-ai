#!/usr/bin/env python3
"""Local-only application server. Python standard library; no installation needed."""
import argparse
import json
import os
import re
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

from simulation import Scenario, VERSION, compare
from investigation import connection, counterfactuals, held_out, investigate

ROOT = Path(__file__).resolve().parent
JOBS = {}
LOCK = threading.Lock()


def load_local_config():
    path = ROOT / ".env.local"
    if path.exists():
        for line in path.read_text().splitlines():
            name, sep, value = line.partition("=")
            if sep and name.strip() in ("NEBIUS_TOKEN_FACTORY_KEY", "NEBIUS_MODEL"):
                os.environ.setdefault(name.strip(), value.strip().strip('"').strip("'"))


def work(job_id, data):
    def progress(value):
        with LOCK:
            JOBS[job_id]["progress"] = value
    try:
        if data.get("mode") == "held-out":
            result = held_out()
        else:
            result = investigate(data.get("mode", "random"), data.get("seed", 17),
                                 data.get("budget", 24), data.get("concern", ""), progress)
        with LOCK:
            JOBS[job_id].update(status="done", result=result)
    except Exception as exc:
        # Upstream messages are sanitized in the API adapter; never serialize arbitrary errors.
        message = str(exc) if isinstance(exc, ValueError) else "Investigation failed. Check server configuration and retry."
        with LOCK:
            JOBS[job_id].update(status="error", error=message)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send(self, status, data, mime="application/json"):
        raw = json.dumps(data, allow_nan=False).encode() if mime == "application/json" else data
        self.send_response(status)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(raw)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(raw)

    def trusted_host(self):
        return self.headers.get("Host") in (f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}")

    def do_GET(self):
        if not self.trusted_host():
            return self.send(403, {"error": "Local access only."})
        path = urlparse(self.path).path
        if path == "/api/status":
            return self.send(200, {"version": VERSION, "connection": connection()})
        if path.startswith("/api/jobs/"):
            with LOCK:
                job = JOBS.get(path.rsplit("/", 1)[-1])
                snapshot = dict(job) if job else None
            return self.send(200 if snapshot else 404, snapshot or {"error": "Run not found."})
        assets = {"/": ("index.html", "text/html; charset=utf-8"),
                  "/app.js": ("app.js", "text/javascript; charset=utf-8"),
                  "/styles.css": ("styles.css", "text/css; charset=utf-8")}
        if path in assets:
            name, mime = assets[path]
            return self.send(200, (ROOT / "static" / name).read_bytes(), mime)
        return self.send(404, {"error": "Not found."})

    def do_POST(self):
        origin = self.headers.get("Origin")
        valid_origins = (f"http://127.0.0.1:{self.server.server_port}", f"http://localhost:{self.server.server_port}")
        if not self.trusted_host() or (origin and origin not in valid_origins):
            return self.send(403, {"error": "Local access only."})
        if self.headers.get("Content-Type", "").split(";")[0] != "application/json":
            return self.send(415, {"error": "Expected application/json."})
        try:
            length = int(self.headers.get("Content-Length", 0))
            if not 0 < length <= 750000:
                raise ValueError("Request is empty or too large.")
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError("Request must be an object.")
            path = urlparse(self.path).path
            if path == "/api/export":
                name = data.get("name", "")
                artifact = data.get("artifact")
                if not isinstance(name, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}\.json", name) or not isinstance(artifact, dict):
                    raise ValueError("Expected a JSON artifact with a simple .json filename.")
                raw = json.dumps(artifact, indent=2, allow_nan=False)
                folder = ROOT / "exports"
                folder.mkdir(exist_ok=True)
                destination = folder / (uuid.uuid4().hex[:8] + "-" + name)
                destination.write_text(raw)
                return self.send(200, {"saved": "exports/" + destination.name})
            if path == "/api/simulate":
                return self.send(200, compare(Scenario.parse(data.get("scenario", {}))))
            if path == "/api/counterfactuals":
                return self.send(200, counterfactuals(Scenario.parse(data.get("scenario", {})), data.get("policy", "reactive")))
            if path == "/api/investigate":
                if data.get("mode") == "ai" and not connection()["configured"]:
                    raise ValueError("Nebius is not connected. Open Connection for setup instructions. No AI calls were made.")
                with LOCK:
                    if any(j["status"] == "running" for j in JOBS.values()):
                        return self.send(409, {"error": "An investigation is already running. Wait for it to finish."})
                    if len(JOBS) > 20:
                        JOBS.pop(next(iter(JOBS)))
                    job_id = uuid.uuid4().hex
                    JOBS[job_id] = {"status": "running", "progress": {"completed": 0, "message": "Preparing investigation"}}
                threading.Thread(target=work, args=(job_id, data), daemon=True).start()
                return self.send(202, {"job_id": job_id})
            return self.send(404, {"error": "Not found."})
        except (ValueError, TypeError) as exc:
            return self.send(400, {"error": str(exc)})


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8765)
    args = parser.parse_args()
    load_local_config()
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    print(f"BlindSpot is ready at http://127.0.0.1:{args.port}", flush=True)
    server.serve_forever()
