"""학군: assigned 초등학교 and 중학교 학교군 for every complex (서울·경기) → web/public/data/school.json + school_region.json.

    python scripts/fetch_school.py

Sources (공공데이터포털, keyless file downloads from (재)한국지방교육행정연구재단, refreshed every March and September):
  초등학교통학구역 SHP (15099520), 중학교학교군 SHP (15099522), 학교학구도연계정보 CSV (15099521), 초중등학교위치 CSV (15099519)
The SHPs are EPSG:5186 polygons; each complex's map point is placed in its 통학구역 / 학교군 (point in polygon), linked to
schools through 학구ID, and measured to its 초등학교 (straight line). Downloads are cached in data/raw/school_src (not in git)
and refetched after 30 days. Needs: pip install pyshp pyproj
"""
import csv, datetime as dt, io, json, math, os, re, sys, time, urllib.parse, urllib.request, zipfile
from collections import defaultdict

import shapefile  # pyshp
from pyproj import Transformer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "data", "raw", "school_src")
OUT = os.path.join(ROOT, "web", "public", "data")
PORTAL = "https://www.data.go.kr"
FILES = {"zone": "15099520", "mid": "15099522", "link": "15099521", "school": "15099519"}
SIDO = ("11", "41")

def fetch(url, timeout=300):
    for t in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=timeout) as r: return r.read()
        except Exception as e:
            err = e; time.sleep(2 + t * 2)
    raise RuntimeError(f"{url}: {err}")

def download(name, pk):
    """The detail id changes with every release, so read it from the dataset page each time."""
    path = os.path.join(SRC, name + ".bin")
    if os.path.exists(path) and time.time() - os.path.getmtime(path) < 30 * 86400: return path
    page = fetch(f"{PORTAL}/data/{pk}/fileData.do").decode("utf-8", "replace")
    m = re.search(rf"fn_fileDataDown\('{pk}', '([^']+)'", page)
    if not m: raise RuntimeError(f"{name}: download id not found on the dataset page")
    j = json.loads(fetch(f"{PORTAL}/tcs/dss/selectFileDataDownload.do?" + urllib.parse.urlencode({"recommendDataYn": "Y", "publicDataPk": pk, "publicDataDetailPk": m.group(1)})))
    b = fetch(f"{PORTAL}/cmm/cmm/fileDownload.do?" + urllib.parse.urlencode({"atchFileId": j["atchFileId"], "fileDetailSn": j["fileDetailSn"]}))
    if len(b) < 10000: raise RuntimeError(f"{name}: download too small ({len(b)} bytes)")
    os.makedirs(SRC, exist_ok=True); open(path, "wb").write(b)
    return path

def read_shp(path):
    """zip of .shp/.shx/.dbf → [(학구ID, 이름, bbox, parts)] for 서울·경기."""
    z = zipfile.ZipFile(path); parts = {}
    for i in z.infolist(): parts[i.filename.rsplit(".", 1)[1].lower()] = io.BytesIO(z.read(i))
    r = shapefile.Reader(shp=parts["shp"], shx=parts["shx"], dbf=parts["dbf"], encoding="cp949")
    names = [f[0] for f in r.fields[1:]]
    out = []
    for sr in r.iterShapeRecords():
        rec = dict(zip(names, sr.record))
        if rec["SD_CD"] not in SIDO: continue
        pts, idx = sr.shape.points, list(sr.shape.parts) + [len(sr.shape.points)]
        out.append((rec["HAKGUDO_ID"], rec["HAKGUDO_NM"], sr.shape.bbox, [pts[idx[k]:idx[k + 1]] for k in range(len(idx) - 1)]))
    return out

def inside(x, y, rings):
    """even-odd over every ring, so holes are handled"""
    c = False
    for ring in rings:
        j = len(ring) - 1
        for i in range(len(ring)):
            xi, yi = ring[i]; xj, yj = ring[j]
            if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi + 1e-12) + xi: c = not c
            j = i
    return c

class Grid:
    """bbox index so each point only tests the few polygons around it"""
    def __init__(self, polys, cell=2000):
        self.cell, self.g = cell, defaultdict(list)
        for k, p in enumerate(polys):
            x0, y0, x1, y1 = p[2]
            for gx in range(int(x0 // cell), int(x1 // cell) + 1):
                for gy in range(int(y0 // cell), int(y1 // cell) + 1): self.g[(gx, gy)].append(k)
        self.polys = polys
    def find(self, x, y):
        for k in self.g.get((int(x // self.cell), int(y // self.cell)), []):
            p = self.polys[k]
            if p[2][0] <= x <= p[2][2] and p[2][1] <= y <= p[2][3] and inside(x, y, p[3]): return p
        return None

def read_csv(path):
    b = open(path, "rb").read()
    for enc in ("utf-8-sig", "cp949"):
        try: return list(csv.DictReader(io.StringIO(b.decode(enc))))
        except UnicodeDecodeError: pass
    raise RuntimeError(f"{path}: unknown encoding")

def meters(a, b): return 6371000 * math.hypot(math.radians(b[0] - a[0]) * math.cos(math.radians(a[1])), math.radians(b[1] - a[1]))

def main():
    try: paths = {k: download(k, pk) for k, pk in FILES.items()}
    except RuntimeError as e: sys.exit(f"school: download failed ({e}); keeping the existing files")
    zones, groups = read_shp(paths["zone"]), read_shp(paths["mid"])
    link = read_csv(paths["link"]); schools_raw = read_csv(paths["school"])
    pos = {s["학교ID"]: s for s in schools_raw if s.get("위도") and s.get("경도")}
    by_zone = defaultdict(list)
    for r in link: by_zone[r["학구ID"]].append(r["학교ID"])
    gz, gm = Grid(zones), Grid(groups)
    to5186 = Transformer.from_crs("EPSG:4326", "EPSG:5186", always_xy=True)

    apts = {}
    for f in ("metro_apts.json", "apts.json"):  # metro rows carry sido and sgg too
        p = os.path.join(OUT, f)
        if os.path.exists(p):
            for a in json.load(open(p, encoding="utf-8")):
                if a.get("lon") is not None: apts.setdefault(a["id"], a)
    used, out, mgroups, gidx = {}, {}, [], {}
    for aid, a in apts.items():
        x, y = to5186.transform(a["lon"], a["lat"])
        z, g = gz.find(x, y), gm.find(x, y)
        row = [None, None, None]
        if z:  # a 공동통학구역 lists several schools: keep the nearest
            cands = [(meters((a["lon"], a["lat"]), (float(pos[s]["경도"]), float(pos[s]["위도"]))), s) for s in by_zone.get(z[0], []) if s in pos]
            if cands:
                d, s = min(cands); row[0], row[1] = s, round(d); used[s] = pos[s]
        if g:
            if g[0] not in gidx:
                ms = [s for s in by_zone.get(g[0], []) if s in pos]
                for s in ms: used[s] = pos[s]
                gidx[g[0]] = len(mgroups); mgroups.append([g[1], ms])
            row[2] = gidx[g[0]]
        if row[0] or row[2] is not None: out[aid] = row
    schools = {s: [p["학교명"], "e" if p["학교급구분"] == "초등학교" else "m" if p["학교급구분"] == "중학교" else "h", round(float(p["경도"]), 6), round(float(p["위도"]), 6),
                   p.get("설립형태"), (p.get("설립일자") or "")[:4]] for s, p in used.items()}
    base = max((r.get("데이터기준일자") or "" for r in link), default="")
    json.dump({"as_of": dt.date.today().isoformat(), "base": base, "schools": schools, "mgroups": mgroups, "apts": out},
              open(os.path.join(OUT, "school.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

    # region roll-up: share of complexes whose 초등학교 is within 400 m (≈ 도보 5~6분), and median distance
    acc = {lv: defaultdict(list) for lv in ("gu", "bdong", "hdong", "sgg")}
    for aid, row in out.items():
        a = apts[aid]
        if row[1] is None: continue
        keys = [("hdong", a.get("hcode")), ("sgg", a.get("sgg") or None)]
        if a.get("sido", "11") == "11": keys += [("gu", a.get("gu")), ("bdong", f"{a.get('gu')} {a.get('dong')}")]
        for lv, k in keys:
            if k: acc[lv][k].append(row[1])
    region = {"as_of": dt.date.today().isoformat()}
    for lv, tbl in acc.items():
        region[lv] = {k: {"n": len(v), "near": round(sum(d <= 400 for d in v) / len(v) * 100, 1), "dist": sorted(v)[len(v) // 2]} for k, v in tbl.items() if len(v) >= 3}
    json.dump(region, open(os.path.join(OUT, "school_region.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    e = sum(1 for r in out.values() if r[0]); m = sum(1 for r in out.values() if r[2] is not None)
    print(f"school: {len(apts):,} complexes, 초등학교 배정 {e:,}, 중학교 학교군 {m:,}, {len(schools):,} schools, {len(mgroups)} 학교군, 기준 {base}")

if __name__ == "__main__":
    main()
