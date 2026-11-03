"""브이월드 Geocoder 2.0: 주소 → 좌표, 필지번호(PNU), 법정동·행정동 코드. Shared by the refresh scripts.

    from vgeo import Geo
    g = Geo()                                 # loads data/raw/vworld_geo.json
    hit = g.parcel("서울특별시 강남구 대치동 316") # or g.road("서울특별시 강남구 삼성로 212"), g.any(지번, 도로명)
    g.save()

A 지번 lookup lands on that parcel's representative point and also returns its PNU and the 행정동 it lies in, so one call
places a complex, links it to the 건축물대장·토지이용계획 by parcel, and gives its 행정동. Replaces the Kakao Local lookups,
whose results may not be stored or redistributed. Needs VWORLD_API_KEY (vworld.kr, 서비스 URL https://howcani2.github.io).
Results (and misses) are cached by address; misses are retried after 90 days.
"""
import datetime as dt, json, os, re, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if os.path.exists(os.path.join(ROOT, ".env")):
    for _l in open(os.path.join(ROOT, ".env"), encoding="utf-8-sig"):
        if "=" in _l and not _l.lstrip().startswith("#"): os.environ.setdefault(*[s.strip() for s in _l.split("=", 1)])
CACHE = os.path.join(ROOT, "data", "raw", "vworld_geo.json")
SIDO = {"11": "서울특별시", "41": "경기도"}

def kapt_address(b):
    """K-apt writes "<시도> <시군구> [읍면] <동·리> <지번>[,지번…] <단지명>": the 지번 address up to the first lot, and the 도로명"""
    sido = SIDO.get(b.get("sido", "11"), "서울특별시")
    toks = re.sub(r"^(서울특별시|서울|경기도|경기)\s*", "", (b.get("address") or "").strip()).split()
    i = next((k for k, t in enumerate(toks) if re.fullmatch(r"산?\d+(-\d*)?(,.*)?", t)), None)
    lot = toks[i].split(",")[0].rstrip("-") if i else None
    # K-apt runs 시 and 구 together ("수원장안구"), so the 시군구 and 동 come from its own gu/dong fields when it has them
    parcel = (f"{sido} {b['gu']} {b['dong']} {lot}" if b.get("gu") and b.get("dong") else f"{sido} " + " ".join(toks[:i] + [lot])) if lot else None
    road = (b.get("road_address") or "").split(",")[0].strip() or None
    return parcel, (road if not road or road.startswith(("서울", "경기")) else f"{sido} {road}")

def kapt_geo(basic=None):
    """kaptCode -> {lon, lat, hcode, pnu} for K-apt complexes, from the 브이월드 cache (refresh.py fills it)"""
    if basic is None:
        p = os.path.join(ROOT, "data", "static", "apt_basic.json")
        basic = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else []
    G, out = Geo(key=""), {}
    for b in basic:
        hit = G.any(*kapt_address(b))
        if hit: out[b["kaptCode"]] = hit
    return out

class Geo:
    def __init__(self, key=None):
        self.key = os.environ.get("VWORLD_API_KEY") if key is None else key  # key="" reads the cache only
        self.cache = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
        self.calls = 0

    def _ask(self, address, kind):
        q = {"service": "address", "request": "getcoord", "version": "2.0", "crs": "epsg:4326", "address": address, "refine": "true", "simple": "false",
             "format": "json", "type": kind, "key": self.key, "domain": "https://howcani2.github.io"}
        for t in range(5):  # 브이월드 drops a request now and then: back off and ask again
            try:
                with urllib.request.urlopen("https://api.vworld.kr/req/address?" + urllib.parse.urlencode(q), timeout=20) as r: j = json.load(r)
                break
            except Exception:
                time.sleep(2 * (t + 1))
        else:
            raise RuntimeError("vworld: no answer")
        res = j.get("response", {}); self.calls += 1
        if res.get("status") == "ERROR": raise RuntimeError(f"vworld: {(res.get('error') or {}).get('text', 'error')}")  # quota or key: stop, cache nothing
        if res.get("status") != "OK": return None
        s, pt = (res.get("refined") or {}).get("structure") or {}, (res.get("result") or {}).get("point") or {}
        if not pt.get("x"): return None
        pnu = s.get("level4LC") if kind == "parcel" and len(s.get("level4LC") or "") == 19 else None
        return {"lon": round(float(pt["x"]), 6), "lat": round(float(pt["y"]), 6), "pnu": pnu, "bcode": (s.get("level4LC") or "")[:10] if pnu else None,
                "bdong": s.get("level4L") if kind == "parcel" else s.get("level3"), "hcode": s.get("level4AC") or None, "hdong": s.get("level4A") or None, "bld": s.get("detail") or None}

    @staticmethod
    def _same(address, kind, v):
        """브이월드 'refines' a 지번 it cannot find into a nearby one (강일동 66 → 상일동 산66): keep a parcel hit only when
        its 법정동 is the one asked for and it is a 산 lot only if a 산 lot was asked for"""
        if not v or kind != "parcel": return v
        toks = address.split()
        if v.get("bdong") and v["bdong"] not in toks: return None
        if v.get("pnu") and v["pnu"][10] == "2" and not any(t.startswith("산") for t in toks): return None
        return v

    def lookup(self, address, kind):
        if not address or not self.key: return self._same(address, kind, self.cache.get(f"{kind}|{address}", {}).get("v")) if address else None
        k = f"{kind}|{address}"; c = self.cache.get(k)
        retry = (dt.date.today() - dt.timedelta(days=90)).isoformat()
        if c and (c.get("v") or c.get("at", "") >= retry): return self._same(address, kind, c.get("v"))
        v = self._ask(address, kind); time.sleep(0.02)
        self.cache[k] = {"at": dt.date.today().isoformat(), "v": v}
        if self.calls % 500 == 0: self.save()
        return self._same(address, kind, v)

    def district(self, name):
        """center of a 법정동 ("서울특별시 동작구 사당동"), for rows with no usable address (marked approximate by callers)"""
        k = f"district|{name}"
        if k in self.cache or not self.key: return self.cache.get(k, {}).get("v")
        q = {"service": "search", "request": "search", "version": "2.0", "crs": "EPSG:4326", "size": 1, "query": name, "type": "district", "category": "L4",
             "format": "json", "key": self.key, "domain": "https://howcani2.github.io"}
        try:
            with urllib.request.urlopen("https://api.vworld.kr/req/search?" + urllib.parse.urlencode(q), timeout=20) as r: j = json.load(r)
            it = (((j.get("response") or {}).get("result") or {}).get("items") or [None])[0]
        except Exception: it = None
        self.calls += 1
        v = {"lon": round(float(it["point"]["x"]), 6), "lat": round(float(it["point"]["y"]), 6), "bcode": it.get("id")} if it else None
        self.cache[k] = {"at": dt.date.today().isoformat(), "v": v}
        return v

    def safe(self, fn, *a):
        """fn(*a), or None once 브이월드 has refused (daily limit): later lookups in this run read the cache only"""
        if self.key and getattr(self, "stopped", None): return None
        try: return fn(*a)
        except RuntimeError as e:
            print(e, "- using cached places only for the rest of this run"); self.stopped = True; self.key = ""; return None

    def parcel(self, address): return self.lookup(address, "parcel")
    def road(self, address): return self.lookup(address, "road")
    def road_pnu(self, road):
        """PNU of the lot a 도로명 address stands on (브이월드 search), for complexes whose listed 지번 has since been merged away"""
        k = f"roadpnu|{road}"
        if k in self.cache or not self.key: return self.cache.get(k, {}).get("v")
        q = {"service": "search", "request": "search", "version": "2.0", "crs": "EPSG:4326", "size": 5, "query": road, "type": "address", "category": "road",
             "format": "json", "key": self.key, "domain": "https://howcani2.github.io"}
        try:
            with urllib.request.urlopen("https://api.vworld.kr/req/search?" + urllib.parse.urlencode(q), timeout=20) as r: j = json.load(r)
            items = ((j.get("response") or {}).get("result") or {}).get("items") or []
        except Exception: items = []
        self.calls += 1
        v = next((it["id"] for it in items if (it.get("address") or {}).get("road", "").split(" (")[0] == road and len(it.get("id") or "") == 19), None)
        self.cache[k] = {"at": dt.date.today().isoformat(), "v": v}
        return v

    def any(self, parcel=None, road=None):
        v = self.safe(self.parcel, parcel) if parcel else None
        if v or not road: return v
        v = self.safe(self.road, road)
        if v and not v.get("pnu") and (p := self.safe(self.road_pnu, road)): v = {**v, "pnu": p}
        return v

    def save(self):
        json.dump(self.cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
