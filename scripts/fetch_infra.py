"""생활 인프라 around every complex (서울·경기) from public data → web/public/data/infra.json + infra_region.json.

    python scripts/fetch_infra.py   # not in the daily refresh for now: the map shows no 생활 인프라 until these sources are set up

For each located complex: the nearest 마트 (대형마트·SSM), 병·의원 within 1 km, 어린이집 within 500 m, and the nearest 공원.
Sources (each list is downloaded whole, kept in data/raw/infra_src.json and refreshed after 30 days; distances are worked
out here, so no per-complex API calls):
  병·의원  건강보험심사평가원_병원정보서비스 getHospBasisList (공공데이터포털, DATA_GO_KR_API_KEY; 공공누리 1유형 출처표시)
  어린이집 전국어린이집표준데이터 (공공데이터포털 표준데이터 API, same key; 이용허락범위 제한 없음), 운영 중인 곳만
  공원    전국도시공원정보표준데이터 (same; 제한 없음): 근린·체육·수변·문화·역사·묘지공원 등, 어린이공원·소공원 제외.
          Distance is to the park's edge, estimated as its center minus the radius of a circle of the park's area.
  마트    행정안전부_생활_대규모점포 조회서비스 (same key; 제한 없음): 영업 중인 대형마트·백화점·쇼핑센터, plus the
          SSM brands (GS더프레시, 롯데슈퍼, 홈플러스익스프레스 …) from OpenStreetMap (Overpass; © OpenStreetMap contributors, ODbL)
A source that fails keeps its previous download. Replaces the Kakao Local version, whose results may not be stored.
"""
import datetime as dt, json, math, os, re, statistics as st, time, urllib.parse, urllib.request
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# keys for local runs live in <repo>/.env (gitignored); CI passes them as real environment variables
if os.path.exists(os.path.join(ROOT, ".env")):
    for _l in open(os.path.join(ROOT, ".env"), encoding="utf-8-sig"):
        if "=" in _l and not _l.lstrip().startswith("#"): os.environ.setdefault(*[s.strip() for s in _l.split("=", 1)])
OUT, RAW = os.path.join(ROOT, "web", "public", "data"), os.path.join(ROOT, "data", "raw")
SRC = os.path.join(RAW, "infra_src.json")
BBOX = (36.85, 126.35, 38.32, 127.90)  # 서울 + 경기 (S, W, N, E)
MART = re.compile(r"이마트|홈플러스|롯데마트|롯데슈퍼|GS\s?더\s?프레시|GS\s?수퍼|코스트코|트레이더스|하나로마트|노브랜드|킴스클럽|메가마트|탑마트|농협마트|홈마트|빅마켓")

def get(url, data=None, tries=4, timeout=60):
    for t in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": "whereismyhouseinseoul/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as r: return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code in (401, 403): raise RuntimeError(f"HTTP {e.code} (활용신청 or key)")
            time.sleep(3 * (t + 1))
        except Exception:
            time.sleep(3 * (t + 1))
    raise RuntimeError(f"no answer from {url.split('?')[0]}")

num = lambda v: float(v) if v not in (None, "") and re.fullmatch(r"-?\d+(\.\d+)?", str(v).strip()) else None
inside = lambda lon, lat: lon is not None and lat is not None and BBOX[0] <= lat <= BBOX[2] and BBOX[1] <= lon <= BBOX[3]

def hira(key):
    """병·의원 (서울 110000, 경기 310000): [lon, lat, name]"""
    out = []
    for sido in ("110000", "310000"):
        page = 1
        while True:
            j = json.loads(get("https://apis.data.go.kr/B551182/hospInfoServicev2/getHospBasisList?" + urllib.parse.urlencode(
                {"serviceKey": key, "sidoCd": sido, "numOfRows": 1000, "pageNo": page, "_type": "json"})))
            body = j["response"]["body"]; it = (body.get("items") or {}).get("item") or []
            it = it if isinstance(it, list) else [it]
            out += [[num(x.get("XPos")), num(x.get("YPos")), x.get("yadmNm")] for x in it]
            if page * 1000 >= int(body.get("totalCount") or 0) or not it: break
            page += 1; time.sleep(0.1)
    return [r for r in out if inside(r[0], r[1])]

def standard(api, key, keep):
    """a 공공데이터포털 표준데이터 API, all pages; keep(row) -> [lon, lat, name, extra] or None"""
    out, page = [], 1
    while True:
        j = json.loads(get(f"http://api.data.go.kr/openapi/{api}?" + urllib.parse.urlencode({"serviceKey": key, "pageNo": page, "numOfRows": 1000, "type": "json"})))
        body = (j.get("response") or {}).get("body") or {}; it = body.get("items") or []
        it = it.get("item", []) if isinstance(it, dict) else it
        out += [r for r in (keep(x) for x in it) if r and inside(r[0], r[1])]
        if page * 1000 >= int(body.get("totalCount") or 0) or not it: break
        page += 1; time.sleep(0.1)
    return out

def pick(x, *names):
    for n in names:
        if x.get(n) not in (None, ""): return x[n]
    return None

def kids_row(x):
    if "폐지" in (pick(x, "crStatusNm", "crstatusname", "operSttus", "운영현황") or "") or "휴지" in (pick(x, "crStatusNm", "crstatusname", "operSttus", "운영현황") or ""): return None
    return [num(pick(x, "longitude", "lo", "lot", "경도")), num(pick(x, "latitude", "la", "lat", "위도")), pick(x, "crNm", "crname", "fcltyNm", "어린이집명")]

def park_row(x):
    kind = pick(x, "parkSe", "공원구분") or ""
    if "어린이" in kind or kind == "소공원": return None
    area = num(pick(x, "parkAr", "공원면적")) or 0
    return [num(pick(x, "longitude", "경도")), num(pick(x, "latitude", "위도")), pick(x, "parkNm", "공원명"), round(math.sqrt(area / math.pi))]

def large_stores(key):
    """대규모점포 (LOCALDATA via 공공데이터포털): 영업 중인 대형마트·백화점·쇼핑센터·복합쇼핑몰, 좌표 EPSG:5174 → WGS84"""
    from pyproj import Transformer
    tf = Transformer.from_crs("EPSG:5174", "EPSG:4326", always_xy=True)
    out, page = [], 1
    while True:
        j = json.loads(get("https://apis.data.go.kr/1741000/large_scale_retail_stores/info?" + urllib.parse.urlencode({"serviceKey": key, "pageNo": page, "numOfRows": 1000, "type": "json"})))
        body = (j.get("response") or {}).get("body") or j.get("body") or {}
        it = body.get("items") or []; it = it.get("item", []) if isinstance(it, dict) else it
        for x in it:
            state, kind = pick(x, "SALS_STTS_NM", "salsSttsNm", "DTL_SALS_STTS_NM", "영업상태명") or "", pick(x, "UPTAE_NM", "uptaeNm", "업태구분명") or ""
            if "폐업" in state or "휴업" in state or not re.search(r"대형마트|백화점|쇼핑센터|복합쇼핑몰", kind): continue
            xx, yy = num(pick(x, "CRD_INFO_X", "crdInfoX", "X", "좌표정보(X)")), num(pick(x, "CRD_INFO_Y", "crdInfoY", "Y", "좌표정보(Y)"))
            if xx and yy: lon, lat = tf.transform(xx, yy); out.append([round(lon, 6), round(lat, 6), pick(x, "BPLC_NM", "bplcNm", "사업장명")])
        if page * 1000 >= int(body.get("totalCount") or 0) or not it: break
        page += 1; time.sleep(0.1)
    return [r for r in out if inside(r[0], r[1])]

def osm_marts():
    s, w, n, e = BBOX
    q = f'[out:json][timeout:180];(nwr["shop"~"supermarket|department_store|wholesale"]({s},{w},{n},{e}););out center tags;'
    j = json.loads(get("https://overpass-api.de/api/interpreter", data=urllib.parse.urlencode({"data": q}).encode(), timeout=240))
    out = []
    for el in j.get("elements", []):
        t = el.get("tags") or {}; name = t.get("name:ko") or t.get("name") or ""
        if not MART.search(name + " " + (t.get("brand") or "")): continue
        c = el.get("center") or el
        out.append([c.get("lon"), c.get("lat"), name])
    return out

def load_sources():
    src = json.load(open(SRC, encoding="utf-8")) if os.path.exists(SRC) else {}
    key, stale = os.environ.get("DATA_GO_KR_API_KEY"), (dt.date.today() - dt.timedelta(days=30)).isoformat()
    jobs = {"hosp": lambda: hira(key), "kids": lambda: standard("tn_pubr_public_child_house_api", key, kids_row),
            "park": lambda: standard("tn_pubr_public_cty_park_info_api", key, park_row), "store": lambda: large_stores(key), "osm": osm_marts}
    for name, job in jobs.items():
        if src.get(name, {}).get("at", "") >= stale: continue
        if name != "osm" and not key: print(f"infra: DATA_GO_KR_API_KEY not set; {name} kept"); continue
        try:
            rows = job()
            if len(rows) < (50 if name in ("osm", "store") else 500): raise RuntimeError(f"only {len(rows)} rows")
            src[name] = {"at": dt.date.today().isoformat(), "rows": rows}; print(f"infra: {name} {len(rows):,} places")
        except (RuntimeError, KeyError, ValueError) as e:
            print(f"infra: {name} not refreshed ({e}); {len(src.get(name, {}).get('rows', [])):,} kept")
    os.makedirs(RAW, exist_ok=True); json.dump(src, open(SRC, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    rows = {k: v.get("rows", []) for k, v in src.items()}
    rows["mart"] = rows.get("store", []) + rows.get("osm", []) if rows.get("store") else []  # SSMs alone would miss the big stores
    return rows

class Grid:
    """places bucketed by ~1 km cells, for nearest / within-radius lookups"""
    def __init__(self, rows, cell=0.01):
        self.cell, self.b = cell, defaultdict(list)
        for r in rows: self.b[(int(r[0] / cell), int(r[1] / cell))].append(r)
    def around(self, lon, lat, m):
        k = math.ceil(m / 800) + 1; cx, cy = int(lon / self.cell), int(lat / self.cell); kx = math.cos(math.radians(lat))
        for dx in range(-k, k + 1):
            for dy in range(-k, k + 1):
                for r in self.b.get((cx + dx, cy + dy), ()):
                    d = 6371000 * math.hypot(math.radians(r[0] - lon) * kx, math.radians(r[1] - lat))
                    if d <= m: yield d, r

def main():
    src = load_sources()
    apts = {}
    for f in ("metro_apts.json", "apts.json"):  # metro rows carry sido and sgg too
        p = os.path.join(OUT, f)
        if os.path.exists(p):
            for a in json.load(open(p, encoding="utf-8")):
                if a.get("lon") is not None: apts.setdefault(a["id"], a)
    if not all(src.get(k) for k in ("hosp", "park", "mart")):  # 어린이집 is optional: its count is left empty without a source
        missing = [k for k in ("hosp", "park", "mart") if not src.get(k)]
        print(f"infra: no data yet for {', '.join(missing)}; infra.json left as it is"); return
    G = {k: Grid(src[k]) for k in ("hosp", "kids", "park", "mart") if src.get(k)}
    near = lambda g, a, m, edge=False: min(((max(0, d - (r[3] if edge else 0)), r) for d, r in G[g].around(a["lon"], a["lat"], m)), default=(None, None), key=lambda x: x[0])
    # per complex: [마트 m, 마트 이름, 병의원 1km 수, 어린이집 500m 수, 공원 m, 공원 이름]
    out = {}
    for aid, a in apts.items():
        md, mr = near("mart", a, 3000); pd, pr = near("park", a, 3000, edge=True)
        out[aid] = [round(md) if md is not None else None, mr[2] if mr else None, sum(1 for _ in G["hosp"].around(a["lon"], a["lat"], 1000)),
                    sum(1 for _ in G["kids"].around(a["lon"], a["lat"], 500)) if "kids" in G else None, round(pd) if pd is not None else None, pr[2] if pr else None]
    json.dump({"as_of": dt.date.today().isoformat(), "fields": ["마트 거리", "마트", "병·의원 1km", "어린이집 500m", "공원 거리", "공원"],
               "source": "건강보험심사평가원 병원정보서비스, 전국어린이집·도시공원정보 표준데이터 (공공데이터포털), 마트 © OpenStreetMap contributors (ODbL)", "apts": out},
              open(os.path.join(OUT, "infra.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    # per region: share of complexes with a 마트 within 1 km and a 공원 within 500 m, median 병·의원 and 어린이집 counts
    acc = {lv: defaultdict(list) for lv in ("gu", "bdong", "hdong", "sgg")}
    for aid, r in out.items():
        a = apts[aid]
        keys = [("hdong", a.get("hcode")), ("sgg", a.get("sgg"))]
        if a.get("sido", "11") == "11": keys += [("gu", a.get("gu")), ("bdong", f"{a.get('gu')} {a.get('dong')}")]
        for lv, k in keys:
            if k: acc[lv][k].append(r)
    region = {"as_of": dt.date.today().isoformat()}
    for lv, tbl in acc.items():
        region[lv] = {k: {"n": len(v), "mart1k": round(sum(1 for r in v if r[0] is not None and r[0] <= 1000) / len(v) * 100, 1),
                          "park500": round(sum(1 for r in v if r[4] is not None and r[4] <= 500) / len(v) * 100, 1),
                          "hosp": st.median([r[2] or 0 for r in v]), "kids": st.median([r[3] or 0 for r in v]) if "kids" in G else None} for k, v in tbl.items() if len(v) >= 3}
    json.dump(region, open(os.path.join(OUT, "infra_region.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"infra: {len(out):,} complexes; " + ", ".join(f"{k} {len(v):,}" for k, v in src.items()))

if __name__ == "__main__":
    main()
