"""Turn the single-file Vite build (app/dist/index.html) into the page fragment claude.ai publishes.

    npm --prefix app run build && python scripts/package_artifact.py   # writes app/dist/artifact.html

claude.ai wraps the page in its own <html>/<head>/<body>, so only the title, font links, inlined CSS,
the root div and the inlined script are kept. Data files are published next to it from web/public/data.
"""
import os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIST = os.path.join(ROOT, "app", "dist")

html = open(os.path.join(DIST, "index.html"), encoding="utf-8").read()
head = re.search(r"<head>(.*?)</head>", html, re.S).group(1)
body = re.search(r"<body>(.*?)</body>", html, re.S).group(1)
keep = []
for pat in (r"<title>.*?</title>", r'<meta name="claude:viewport-fit-sides"[^>]*>', r'<link rel="preconnect"[^>]*>', r'<link rel="stylesheet" href="https://fonts[^>]*>'):
    keep += re.findall(pat, head, re.S)
styles = re.findall(r"<style[^>]*>.*?</style>", head, re.S)
scripts = re.findall(r"<script[^>]*>.*?</script>", head, re.S)
body = re.sub(r'<script type="module" src="[^"]*"></script>', "", body)
frag = "\n".join(keep + styles) + "\n" + body.strip() + "\n" + "\n".join(scripts) + "\n"
open(os.path.join(DIST, "artifact.html"), "w", encoding="utf-8").write(frag)
print(f"artifact.html: {len(frag.encode()):,} bytes ({len(styles)} style, {len(scripts)} script)")
