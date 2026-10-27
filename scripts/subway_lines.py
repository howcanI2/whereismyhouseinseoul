"""Subway line shapes from OpenStreetMap (Overpass), one stroke per line.

OSM maps each direction's track as its own way, so a line comes back as two parallel strokes a few
metres apart. Segments that mostly retrace an already kept segment of the same line are dropped.

    python scripts/subway_lines.py   # writes web/public/data/subway_lines.json
"""
import json, os, re, urllib.parse, urllib.request
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BBOX = (37.20, 126.60, 37.95, 127.40)  # Seoul and the commuter belt
CELL = 0.0005                           # ~50 m grid used to spot retraced track

def line_of(t):
    ref, name = (t.get("ref") or "").strip(), t.get("name", "")
    if ":" in name and any(w in name for w in ("ITX", "무궁화", "새마을")): return None
    if re.fullmatch(r"[1-9]", ref): return f"{ref}호선"
    for key, nm in [("신분당", "신분당선"), ("수인", "수인분당선"), ("분당", "수인분당선"), ("경의", "경의중앙선"), ("중앙", "경의중앙선"), ("공항", "공항철도"),
                    ("GTX-A", "GTX-A"), ("경춘", "경춘선"), ("우이", "우이신설선"), ("Silim", "신림선"), ("신림", "신림선"), ("서해", "서해선"), ("경강", "경강선"),
                    ("김포", "김포골드라인"), ("에버라인", "용인에버라인"), ("의정부", "의정부경전철"), ("인천1", "인천1호선"), ("인천2", "인천2호선"), ("I1", "인천1호선"), ("I2", "인천2호선")]:
        if key in ref or key in name: return nm
    return None

def simplify(pts, tol=0.00012):
    if len(pts) < 3: return pts
    a, b = pts[0], pts[-1]; dx, dy = b[0] - a[0], b[1] - a[1]; L = (dx * dx + dy * dy) or 1e-12
    best, idx = 0, 0
    for i in range(1, len(pts) - 1):
        p = pts[i]; t = max(0, min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L))
        d = ((p[0] - a[0] - t * dx) ** 2 + (p[1] - a[1] - t * dy) ** 2) ** .5
        if d > best: best, idx = d, i
    return [a, b] if best <= tol else simplify(pts[:idx + 1], tol)[:-1] + simplify(pts[idx:], tol)

def densify(pts, step=CELL / 2):
    out = []
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        n = max(1, int(max(abs(x2 - x1), abs(y2 - y1)) / step))
        out += [(x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n) for i in range(n)]
    return out + [tuple(pts[-1])]

def main():
    q = f'[out:json][timeout:240];(relation["route"~"subway|light_rail|train"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]}););out geom;'
    req = urllib.request.Request("https://overpass-api.de/api/interpreter", data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": "whereismyhouseinseoul/1.0"})
    with urllib.request.urlopen(req, timeout=300) as r: rel = json.load(r)["elements"]
    ways = {}
    for e in rel:
        ln = line_of(e.get("tags", {}))
        if not ln: continue
        for m in e.get("members", []):
            if m.get("type") == "way" and "geometry" in m and m.get("role") not in ("platform", "stop"):
                ways[(ln, m["ref"])] = [[g["lon"], g["lat"]] for g in m["geometry"]]
    taken, out = defaultdict(set), []
    cell = lambda p: (int(p[0] / CELL), int(p[1] / CELL))
    near = lambda c, s: any((c[0] + dx, c[1] + dy) in s for dx in (-1, 0, 1) for dy in (-1, 0, 1))
    for (ln, _), pts in sorted(ways.items(), key=lambda kv: -len(kv[1])):
        cells = [cell(p) for p in densify(pts)]
        if cells and sum(near(c, taken[ln]) for c in cells) / len(cells) > 0.6: continue  # the other direction's track
        taken[ln].update(cells)
        out.append({"line": ln, "coords": [[round(x, 5), round(y, 5)] for x, y in simplify(pts)]})
    path = os.path.join(ROOT, "web", "public", "data", "subway_lines.json")
    json.dump(out, open(path, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(len(out), "segments kept of", len(ways), "|", Counter(o["line"] for o in out).most_common(8), "|", os.path.getsize(path), "bytes")

if __name__ == "__main__":
    main()
