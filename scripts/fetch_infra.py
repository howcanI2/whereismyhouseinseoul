"""생활 인프라 around every complex (서울·경기) via Kakao Local → web/public/data/infra.json + infra_region.json.

    python scripts/fetch_infra.py [--limit 70000]

For each located complex: the nearest 대형마트 (MT1), 병·의원 (HP8) count within 1 km, 어린이집·유치원 (PS3) count within
500 m, and the nearest 공원 (keyword) — one Kakao call each, cached per ~10 m point in data/raw/infra_cache.json and
refreshed after 180 days. KAKAO_REST_KEY required.
"""
import argparse, datetime as dt, json, os, statistics as st, time, urllib.parse, urllib.request
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# keys for local runs live in <repo>/.env (gitignored); CI passes them as real environment variables
if os.path.exists(os.path.join(ROOT, ".env")):
    for _l in open(os.path.join(ROOT, ".env"), encoding="utf-8-sig"):
        if "=" in _l and not _l.lstrip().startswith("#"): os.environ.setdefault(*[s.strip() for s in _l.split("=", 1)])
OUT, RAW = os.path.join(ROOT, "web", "public", "data"), os.path.join(ROOT, "data", "raw")
CACHE = os.path.join(RAW, "infra_cache.json")
# (key, kind, query, radius m): nearest one within radius, plus how many
ASKS = [("mart", "category", "MT1", 3000), ("hosp", "category", "HP8", 1000), ("kids", "category", "PS3", 500), ("park", "keyword", "공원", 2000)]

def is_park(d):
    """a real park: Kakao's 공원 category, not a 어린이공원 playground or a facility named after a park (화장실, 주차장)"""
    return "> 공원" in (d.get("category_name") or "") and "어린이공원" not in d["place_name"]

def kakao(kind, q, lon, lat, radius, key):
    params = {"x": lon, "y": lat, "radius": radius, "sort": "distance", "size": 15 if q == "공원" else 1}
    params["category_group_code" if kind == "category" else "query"] = q
    req = urllib.request.Request(f"https://dapi.kakao.com/v2/local/search/{kind}.json?" + urllib.parse.urlencode(params), headers={"Authorization": "KakaoAK " + key})
    for t in range(3):
        try:
            with urllib.request.urlopen(req, timeout=15) as r: j = json.load(r)
            docs = j.get("documents") or []
            if q == "공원": docs = [x for x in docs if is_park(x)]
            d = (docs or [None])[0]
            return [int(d["distance"]) if d and d.get("distance") else None, d["place_name"] if d else None, (j.get("meta") or {}).get("total_count", 0)]
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 429): raise RuntimeError(f"Kakao {e.code}: quota or key")
            time.sleep(1 + t)
        except Exception:
            time.sleep(1 + t)
    return None

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--limit", type=int, default=70000)
    ap.add_argument("--only", help="re-query just this field for every cached point (e.g. park)"); args = ap.parse_args()
    key = os.environ.get("KAKAO_REST_KEY")
    cache = json.load(open(CACHE, encoding="utf-8")) if os.path.exists(CACHE) else {}
    apts = {}
    for f in ("metro_apts.json", "apts.json"):  # metro rows carry sido and sgg too
        p = os.path.join(OUT, f)
        if os.path.exists(p):
            for a in json.load(open(p, encoding="utf-8")):
                if a.get("lon") is not None: apts.setdefault(a["id"], a)
    stale = (dt.date.today() - dt.timedelta(days=180)).isoformat()
    pt = lambda a: f"{a['lon']:.4f},{a['lat']:.4f}"
    todo = [a for a in apts.values() if cache.get(pt(a), {}).get("at", "") < stale]
    todo.sort(key=lambda a: (a.get("sido", "11") != "11", -(a.get("trades_6m") or 0)))  # Seoul and busy complexes first
    calls = 0
    if args.only and key:  # refresh one field everywhere, e.g. after changing how parks are picked
        ask = next(x for x in ASKS if x[0] == args.only); done = set()
        for a in sorted(apts.values(), key=lambda a: a.get("sido", "11") != "11"):
            k = pt(a)
            if k in done or k not in cache or calls >= args.limit: continue
            cache[k][ask[0]] = kakao(ask[1], ask[2], a["lon"], a["lat"], ask[3], key); calls += 1; done.add(k); time.sleep(0.03)
            if calls % 2000 == 0: json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False); print(f"infra: {args.only} {calls}", flush=True)
        todo = []
    if not key: print(f"infra: KAKAO_REST_KEY not set; {len(todo)} points left")
    try:
        for a in todo if key else []:
            if calls + len(ASKS) > args.limit: break
            k = pt(a)
            if cache.get(k, {}).get("at", "") >= stale: continue  # another complex at the same point
            row = {"at": dt.date.today().isoformat()}
            for name, kind, q, radius in ASKS:
                row[name] = kakao(kind, q, a["lon"], a["lat"], radius, key); calls += 1; time.sleep(0.03)
            cache[k] = row
            if calls % 4000 < len(ASKS): json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False); print(f"infra: {calls} calls", flush=True)
    except RuntimeError as e:
        print("infra: stopped:", e)
    json.dump(cache, open(CACHE, "w", encoding="utf-8"), ensure_ascii=False)

    # per complex: [마트 m, 마트 이름, 병의원 1km 수, 어린이집·유치원 500m 수, 공원 m, 공원 이름]
    out = {}
    for aid, a in apts.items():
        c = cache.get(pt(a))
        if not c: continue
        g = lambda n, i: (c.get(n) or [None, None, None])[i]
        out[aid] = [g("mart", 0), g("mart", 1), g("hosp", 2), g("kids", 2), g("park", 0), g("park", 1)]
    json.dump({"as_of": dt.date.today().isoformat(), "fields": ["마트 거리", "마트", "병·의원 1km", "어린이집·유치원 500m", "공원 거리", "공원"], "apts": out},
              open(os.path.join(OUT, "infra.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    # per region: share of complexes with a 대형마트 within 1 km and a 공원 within 500 m, median 병·의원 count
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
                          "hosp": st.median([r[2] or 0 for r in v]), "kids": st.median([r[3] or 0 for r in v])} for k, v in tbl.items() if len(v) >= 3}
    json.dump(region, open(os.path.join(OUT, "infra_region.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    left = sum(1 for a in apts.values() if not cache.get(pt(a)))
    print(f"infra: {calls} Kakao calls this run, {len(out):,} of {len(apts):,} complexes covered, {left:,} left")

if __name__ == "__main__":
    main()
