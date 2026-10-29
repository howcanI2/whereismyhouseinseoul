"""Upcoming and recent apartment subscriptions (청약) in 서울·경기 from 청약홈 → web/public/data/applyhome.json.

    python scripts/fetch_applyhome.py

Source: 공공데이터포털 "한국부동산원_청약홈 분양정보 조회 서비스" (odcloud). It uses the same DATA_GO_KR_API_KEY,
but the key has to be approved for this service separately (활용신청, auto-approved). Like the trade API it refuses
some overseas IPs, so it runs from the PC refresh task. Without a working key the existing file is kept.
"""
import datetime as dt, json, os, re, sys, time, urllib.parse, urllib.request
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# keys for local runs live in <repo>/.env (gitignored); CI passes them as real environment variables
if os.path.exists(os.path.join(ROOT, ".env")):
    for _l in open(os.path.join(ROOT, ".env"), encoding="utf-8"):
        if "=" in _l and not _l.lstrip().startswith("#"): os.environ.setdefault(*[s.strip() for s in _l.split("=", 1)])
OUT = os.path.join(ROOT, "web", "public", "data", "applyhome.json")
GEO = os.path.join(ROOT, "data", "raw", "geocode_applyhome.json")
BASE = "https://api.odcloud.kr/api/ApplyhomeInfoDetailSvc/v1/"

def get(path, key, cond):
    rows, page = [], 1
    while True:
        q = urllib.parse.urlencode({"page": page, "perPage": 500, "serviceKey": key, **cond})
        with urllib.request.urlopen(BASE + path + "?" + q, timeout=30) as r: j = json.load(r)
        rows += j.get("data") or []
        if page * 500 >= (j.get("matchCount") or j.get("totalCount") or 0): return rows
        page += 1; time.sleep(0.2)

def kakao(kind, q, key):
    req = urllib.request.Request(f"https://dapi.kakao.com/v2/local/search/{kind}.json?" + urllib.parse.urlencode({"query": q, "size": 1}), headers={"Authorization": "KakaoAK " + key})
    try:
        with urllib.request.urlopen(req, timeout=15) as r: return (json.load(r).get("documents") or [None])[0]
    except Exception: return None

def geocode(addr, name, key, cache):
    """New-town notices give addresses like "…동 일원(○○지구 A-4블록)", so try, in order: the lot address inside or before
    the brackets, the complex name, then the 동/읍 itself (marked approx)."""
    if addr in cache or not key: return cache.get(addr)
    a = re.sub(r"화성특례시", "화성시", addr)
    inner = re.findall(r"\(([^()]*\d[^()]*)\)", a)
    clean = lambda s: re.sub(r"\s+", " ", re.sub(r"\[.*?\]|\(.*?\)|일원|번지|외\s*\d+필지|,.*", " ", s)).strip()
    tries = [("address", clean(s)) for s in [*inner, a]] + [("keyword", re.sub(r"\(.*", "", name or "").strip())]
    town = re.match(r"(\S+[도시]\s+\S+[시군구](?:\s+\S+구)?\s+\S+[동읍면])", clean(a))
    if town: tries.append(("address", town.group(1)))
    for i, (kind, q) in enumerate(tries):
        if not q: continue
        d = kakao(kind, q, key)
        if d and (kind == "address" or (d.get("address_name") or "").split()[:2] == clean(a).split()[:2]):
            cache[addr] = {"lon": round(float(d["x"]), 6), "lat": round(float(d["y"]), 6), **({"approx": True} if town and q == town.group(1) else {})}
            return cache[addr]
    cache[addr] = None
    return None

def main():
    key = os.environ.get("DATA_GO_KR_API_KEY"); kk = os.environ.get("KAKAO_REST_KEY")
    if not key: sys.exit("DATA_GO_KR_API_KEY is not set; keeping the existing applyhome.json")
    since = (dt.date.today() - dt.timedelta(days=60)).isoformat()
    try:
        heads = [h for area in ("서울", "경기") for h in get("getAPTLttotPblancDetail", key, {"cond[RCRIT_PBLANC_DE::GTE]": since, "cond[SUBSCRPT_AREA_CODE_NM::EQ]": area})]
        models = get("getAPTLttotPblancMdl", key, {}) if heads else []
    except Exception as e:
        body = e.read().decode()[:200] if hasattr(e, "read") else ""
        sys.exit(f"applyhome: request failed ({e} {body}); keeping the existing file. 공공데이터포털에서 '청약홈 분양정보 조회 서비스' 활용신청이 되어 있는지 확인하세요.")
    by = defaultdict(list)
    for m in models: by[(m.get("HOUSE_MANAGE_NO"), m.get("PBLANC_NO"))].append(m)
    cache = json.load(open(GEO, encoding="utf-8")) if os.path.exists(GEO) else {}
    out = []
    for h in heads:
        addr = h.get("HSSPLY_ADRES") or ""; g = geocode(addr, h.get("HOUSE_NM"), kk, cache) or {}
        types = [{"type": m.get("HOUSE_TY"), "area": float(m.get("SUPLY_AR") or 0) or None, "supply": int(m.get("SUPLY_HSHLDCO") or 0), "special": int(m.get("SPSPLY_HSHLDCO") or 0),
                  "price_max": int(m.get("LTTOT_TOP_AMOUNT") or 0) or None} for m in by[(h.get("HOUSE_MANAGE_NO"), h.get("PBLANC_NO"))]]
        out.append({"id": f"{h.get('HOUSE_MANAGE_NO')}-{h.get('PBLANC_NO')}", "name": h.get("HOUSE_NM"), "sido": "11" if h.get("SUBSCRPT_AREA_CODE_NM") == "서울" else "41",
                    "addr": addr, "kind": h.get("HOUSE_SECD_NM") or h.get("HOUSE_DTL_SECD_NM"), "households": int(h.get("TOT_SUPLY_HSHLDCO") or 0),
                    "notice": h.get("RCRIT_PBLANC_DE"), "special_from": h.get("SPSPLY_RCEPT_BGNDE"), "first_rank": h.get("GNRL_RNK1_CRSPAREA_RCPTDE"),
                    "receipt_start": h.get("RCEPT_BGNDE"), "receipt_end": h.get("RCEPT_ENDDE"), "winner": h.get("PRZWNER_PRESNATN_DE"),
                    "url": h.get("PBLANC_URL"), "types": types, **({"lon": g["lon"], "lat": g["lat"], "approx": bool(g.get("approx"))} if g else {})})
    os.makedirs(os.path.dirname(GEO), exist_ok=True); json.dump(cache, open(GEO, "w", encoding="utf-8"), ensure_ascii=False)
    out.sort(key=lambda r: r.get("receipt_start") or r.get("notice") or "")
    json.dump({"as_of": dt.date.today().isoformat(), "since": since, "items": out}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"applyhome: {len(out)} 공고 (서울 {sum(r['sido'] == '11' for r in out)}, 경기 {sum(r['sido'] == '41' for r in out)}), {sum(1 for r in out if 'lon' in r)} located")

if __name__ == "__main__":
    main()
