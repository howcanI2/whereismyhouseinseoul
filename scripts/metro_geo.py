"""Seoul + Gyeonggi boundaries for the 서울+경기 view, from the 2025 행정동 file (vuski/admdongkor).

    python scripts/metro_geo.py <HangJeongDong.geojson>
writes web/public/data/metro_hdong_geo.json (행정동) and metro_sgg_geo.json (시군구, dissolved from 행정동).
"""
import json, os, sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "web", "public", "data")
g = json.load(open(sys.argv[1], encoding="utf-8"))
P = lambda c: (round(c[0], 6), round(c[1], 6))

def simp(r, tol):
    out = [r[0]]
    for p in r[1:-1]:
        if abs(p[0] - out[-1][0]) + abs(p[1] - out[-1][1]) >= tol: out.append(p)
    return out + [r[-1]]
def area(r): return abs(sum(x1 * y2 - x2 * y1 for (x1, y1), (x2, y2) in zip(r, r[1:]))) / 2

hd, edges, names = [], defaultdict(lambda: defaultdict(int)), {}
for f in g["features"]:
    p = f["properties"]
    if p.get("sido") not in ("11", "41"): continue
    sgg = p["sgg"]; names[sgg] = p["sggnm"]
    geom = f["geometry"]; polys = [geom["coordinates"]] if geom["type"] == "Polygon" else geom["coordinates"]
    hd.append({"code": str(p["adm_cd2"]), "sgg": sgg, "sido": p["sido"], "name": p["adm_nm"].split()[-1],
               "geometry": {"type": "MultiPolygon", "coordinates": [[[[round(x, 5), round(y, 5)] for x, y in simp([tuple(c) for c in ring], 0.00012)] for ring in poly] for poly in polys]}})
    for poly in polys:
        for ring in poly:
            for a, b in zip(ring, ring[1:]):
                a, b = P(a), P(b)
                if a != b: edges[sgg][(a, b) if a < b else (b, a)] += 1

def rings_from(ec):
    adj = defaultdict(list)
    for (a, b), n in ec.items():
        if n == 1: adj[a].append(b); adj[b].append(a)
    used, rings = set(), []
    for start in list(adj):
        for nxt in adj[start]:
            e = (start, nxt) if start < nxt else (nxt, start)
            if e in used: continue
            ring, cur = [start], nxt; used.add(e)
            while cur != start:
                ring.append(cur)
                cand = [n for n in adj[cur] if ((cur, n) if cur < n else (n, cur)) not in used]
                if not cand: break
                n = cand[0]; used.add((cur, n) if cur < n else (n, cur)); cur = n
            if cur == start and len(ring) >= 4: rings.append(ring + [start])
    return sorted((r for r in rings if area(r) > 1e-7), key=area, reverse=True)

sgg = [{"sgg": code, "sido": code[:2], "name": names[code], "geometry": {"type": "MultiPolygon", "coordinates": [[[[round(x, 5), round(y, 5)] for x, y in simp(r, 0.0001)]] for r in rings_from(ec)]}} for code, ec in edges.items()]
json.dump(hd, open(os.path.join(OUT, "metro_hdong_geo.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
json.dump(sgg, open(os.path.join(OUT, "metro_sgg_geo.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(len(hd), "행정동,", len(sgg), "시군구;", os.path.getsize(os.path.join(OUT, "metro_hdong_geo.json")), "+", os.path.getsize(os.path.join(OUT, "metro_sgg_geo.json")), "bytes")
