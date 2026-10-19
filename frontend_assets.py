"""Serve only the built React entry point and Vite asset filenames."""
import re
from pathlib import Path

FRONTEND_ROOT = Path(__file__).resolve().parent / 'frontend' / 'dist'


def frontend_asset(path):
    if path == '/':
        relative, mime = 'index.html', 'text/html; charset=utf-8'
    elif path == '/THREE-LICENSE.txt':
        relative, mime = 'THREE-LICENSE.txt', 'text/plain; charset=utf-8'
    elif re.fullmatch(r'/assets/[A-Za-z0-9][A-Za-z0-9_.-]*\.(js|css)', path):
        relative = path.lstrip('/')
        mime = 'text/javascript; charset=utf-8' if path.endswith('.js') else 'text/css; charset=utf-8'
    else:
        return None
    root = FRONTEND_ROOT.resolve()
    candidate = (root / relative).resolve()
    if root not in candidate.parents or not candidate.is_file():
        return None
    return candidate.read_bytes(), mime
