"""Single-process WSGI deployment; existing local server stays unchanged."""
import base64
import hmac
import json
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

from simulation import Scenario, VERSION, compare
from investigation import connection, counterfactuals
from server import JOBS, LOCK, ROOT, work

HEADERS = [("Cache-Control", "no-store"), ("X-Content-Type-Options", "nosniff"),
           ("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'")]


def authenticated(environ):
    password = os.environ.get("BLINDSPOT_PASSWORD", "")
    if not password:
        return False
    try:
        scheme, token = environ.get("HTTP_AUTHORIZATION", "").split(" ", 1)
        if scheme.lower() != "basic":
            return False
        user, supplied = base64.b64decode(token, validate=True).decode().split(":", 1)
        return hmac.compare_digest(user, "blindspot") and hmac.compare_digest(supplied.encode(), password.encode())
    except (ValueError, UnicodeError):
        return False


def origin_allowed(environ):
    origin = environ.get("HTTP_ORIGIN")
    if not origin:
        return True
    configured = os.environ.get("BLINDSPOT_PUBLIC_ORIGIN", "").rstrip("/")
    railway_domain = os.environ.get("RAILWAY_PUBLIC_DOMAIN", "")
    allowed = {configured} if configured else set()
    if railway_domain:
        allowed.add("https://" + railway_domain)
    render_url = os.environ.get("RENDER_EXTERNAL_URL", "").rstrip("/")
    if render_url:
        allowed.add(render_url)
    # Loopback is useful for testing this production entrypoint locally.
    host = environ.get("HTTP_HOST", "")
    if host.split(":")[0] in ("localhost", "127.0.0.1"):
        allowed.add("http://" + host)
    return origin in allowed


def reserve_ai_run():
    limit = int(os.environ.get("BLINDSPOT_AI_DAILY_RUNS", "3"))
    folder = Path(os.environ.get("BLINDSPOT_DATA_DIR", "/data"))
    folder.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(str(folder / "limits.sqlite"), timeout=5)
    try:
        db.execute("CREATE TABLE IF NOT EXISTS usage (day TEXT PRIMARY KEY, runs INTEGER NOT NULL)")
        db.execute("BEGIN IMMEDIATE")
        day = datetime.now(timezone.utc).date().isoformat()
        row = db.execute("SELECT runs FROM usage WHERE day=?", (day,)).fetchone()
        used = row[0] if row else 0
        if used >= limit:
            db.rollback()
            return False
        db.execute("INSERT INTO usage VALUES (?,1) ON CONFLICT(day) DO UPDATE SET runs=runs+1", (day,))
        db.commit()
        return True
    finally:
        db.close()


def application(environ, start_response):
    def send(code, data, content_type="application/json", extra=()):
        body = json.dumps(data, allow_nan=False).encode() if content_type == "application/json" else data
        names = {200:"OK",202:"Accepted",400:"Bad Request",401:"Unauthorized",403:"Forbidden",404:"Not Found",405:"Method Not Allowed",409:"Conflict",413:"Content Too Large",415:"Unsupported Media Type",429:"Too Many Requests",500:"Internal Server Error",503:"Service Unavailable"}
        start_response(str(code)+" "+names[code], HEADERS + [("Content-Type", content_type), ("Content-Length", str(len(body)))] + list(extra))
        return [body]
    path, method = environ.get("PATH_INFO", "/"), environ.get("REQUEST_METHOD", "GET")
    if path == "/healthz" and method == "GET":
        return send(200, {"status":"ok"})
    if not os.environ.get("BLINDSPOT_PASSWORD"):
        return send(503, {"error":"Set BLINDSPOT_PASSWORD before opening this deployment."})
    if not authenticated(environ):
        return send(401, {"error":"Sign in with username blindspot and the demo password."}, extra=[("WWW-Authenticate", 'Basic realm="BlindSpot", charset="UTF-8"')])
    if method == "GET":
        if path == "/api/status":
            state = connection()
            state["configured"] = state["configured"] and os.environ.get("BLINDSPOT_ENABLE_AI") == "1"
            return send(200, {"version": VERSION, "connection":state,"deployment":"hosted"})
        if path.startswith("/api/jobs/"):
            with LOCK:
                job = JOBS.get(path.rsplit("/",1)[-1])
                snapshot = dict(job) if job else None
            return send(200 if snapshot else 404, snapshot or {"error":"Run not found; the deployment may have restarted."})
        assets = {"/":("index.html","text/html; charset=utf-8"),"/app.js":("app.js","text/javascript; charset=utf-8"),"/styles.css":("styles.css","text/css; charset=utf-8")}
        assets.update({"/street.js": ("street.js", "text/javascript; charset=utf-8"),
                       "/vendor/three.module.min.js": ("vendor/three.module.min.js", "text/javascript; charset=utf-8"),
                       "/vendor/THREE-LICENSE.txt": ("vendor/THREE-LICENSE.txt", "text/plain; charset=utf-8")})
        if path in assets:
            name, mime = assets[path]
            return send(200, (ROOT/"static"/name).read_bytes(), mime)
        return send(404, {"error":"Not found."})
    if method != "POST":
        return send(405, {"error":"Method not allowed."})
    if not origin_allowed(environ):
        return send(403, {"error":"This request came from a different site."})
    if environ.get("CONTENT_TYPE", "").split(";")[0] != "application/json":
        return send(415, {"error":"Expected application/json."})
    try:
        length = int(environ.get("CONTENT_LENGTH") or "0")
        if not 0 < length <= 750000:
            return send(413, {"error":"Request is empty or too large."})
        data = json.loads(environ["wsgi.input"].read(length))
        if not isinstance(data, dict):
            raise ValueError("Request must be an object.")
        if path == "/api/export":
            if not isinstance(data.get("artifact"), dict):
                raise ValueError("Expected a JSON artifact.")
            return send(200, {"download":data["artifact"]})
        if path == "/api/simulate":
            return send(200, compare(Scenario.parse(data.get("scenario", {}))))
        if path == "/api/counterfactuals":
            return send(200, counterfactuals(Scenario.parse(data.get("scenario", {})), data.get("policy","reactive")))
        if path == "/api/investigate":
            mode = data.get("mode", "random")
            if mode not in ("random", "systematic", "ai", "held-out"):
                raise ValueError("Unknown investigation method.")
            budget = data.get("budget",24)
            seed = data.get("seed",17)
            concern = data.get("concern", "")
            if isinstance(budget,bool) or not isinstance(budget,int) or not 4 <= budget <= 48:
                raise ValueError("Budget must be an integer from 4 to 48.")
            if isinstance(seed,bool) or not isinstance(seed,int) or not 0 <= seed <= 2**32-1:
                raise ValueError("Invalid seed.")
            if not isinstance(concern,str) or len(concern)>1000:
                raise ValueError("Concern must be at most 1000 characters.")
            if mode == "ai":
                if os.environ.get("BLINDSPOT_ENABLE_AI") != "1" or not connection()["configured"]:
                    return send(403, {"error":"Live AI is disabled on this deployment."})
                if budget > 12:
                    raise ValueError("Hosted AI runs are limited to 12 scenarios (two model calls).")
            with LOCK:
                if any(j["status"] == "running" for j in JOBS.values()):
                    return send(409, {"error":"An investigation is already running."})
                if mode == "ai" and not reserve_ai_run():
                    return send(429, {"error":"The daily AI run allowance has been reached."})
                if len(JOBS)>=20:
                    JOBS.pop(next(iter(JOBS)))
                job_id = uuid.uuid4().hex
                JOBS[job_id] = {"status":"running","progress":{"completed":0,"message":"Preparing investigation"}}
            threading.Thread(target=work,args=(job_id,data),daemon=True).start()
            return send(202, {"job_id":job_id})
        return send(404, {"error":"Not found."})
    except (ValueError, TypeError):
        return send(400, {"error":"Invalid request. Check scenario values and test budget."})
    except Exception:
        return send(500, {"error":"The server could not complete this request."})


if __name__ == "__main__":
    from waitress import serve
    if len(os.environ.get("BLINDSPOT_PASSWORD", "")) < 16:
        raise SystemExit("Set BLINDSPOT_PASSWORD to at least 16 characters.")
    serve(application, host="0.0.0.0", port=int(os.environ.get("PORT", "8080")),
          threads=4, max_request_body_size=750000, channel_timeout=30)
