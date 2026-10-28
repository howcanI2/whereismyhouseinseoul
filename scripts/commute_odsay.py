"""Public-transit time from every Seoul/Gyeonggi 행정동 to 광화문, via the ODsay API (cached; resumable).

    ODSAY_API_KEY=... python scripts/commute_odsay.py [--limit 900]
writes data/raw/commute_odsay.json (raw cache) and web/public/data/commute.json.

Origin = the trade-weighted centre of the 행정동's apartment complexes (falls back to the polygon centre),
so the time reflects where people actually live in that 동. ODsay registers callers by server IP.
"""
import argparse, json, math, os, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# keys for local runs live in <repo>/.env (gitignored); CI passes them as real environment variables
if os.path.exists(os.path.join(ROOT, ".env")):
    for _l in open(os.path.join(ROOT, ".env"), encoding="utf-8"):
        if "=" in _l and not _l.lstrip().startswith("#"): os.environ.setdefault(*[s.strip() for s in _l.split("=", 1)])
RAW = os.path.join(ROOT, "data", "raw", "commute_odsay.json")
OUT = os.path.join(ROOT, "web", "public", "data")
DEST = (126.9769, 37.5759)  # 광화문 (직장)

def origins():
    geo = json.load(open(os.path.join(OUT, "metro_hdong_geo.json"), encoding="utf-8"))
    apts = []
    for f in ("apts.json", "metro_apts.json"):
        p = os.path.join(OUT, f)
        if os.path.exists(p): apts += json.load(open(p, encoding="utf-8"))
    acc = {}
    for a in apts:
        if a.get("hcode") and a.get("lon") is not None:
            c = acc.setdefault(a["hcode"], [0.0, 0.0, 0]); w = a.get("trades_6m", 1)
            c[0] += a["lon"] * w; c[1] += a["lat"] * w; c[2] += w
    out = {}
    for h in geo:
        if h["code"] in acc and acc[h["code"]][2]:
            c = acc[h["code"]]; out[h["code"]] = (c[0] / c[2], c[1] / c[2], True)
        else:
            ring = h["geometry"]["coordinates"][0][0]
            out[h["code"]] = (sum(p[0] for p in ring) / len(ring), sum(p[1] for p in ring) / len(ring), False)
    return out

def ask(key, sx, sy):
    q = urllib.parse.urlencode({"SX": f"{sx:.6f}", "SY": f"{sy:.6f}", "EX": DEST[0], "EY": DEST[1], "apiKey": key})
    with urllib.request.urlopen(f"https://api.odsay.com/v1/api/searchPubTransPathT?{q}", timeout=20) as r: return json.load(r)

def summarize(res):
    paths = (res.get("result") or {}).get("path") or []
    if not paths: return None
    p = min(paths, key=lambda x: x["info"]["totalTime"]); i = p["info"]
    legs, first = [], None
    for s in p.get("subPath", []):
        if s.get("trafficType") == 1: name = (s.get("lane") or [{}])[0].get("name", "지하철")
        elif s.get("trafficType") == 2: name = "버스 " + (s.get("lane") or [{}])[0].get("busNo", "")
        else: continue
        legs.append(name.strip()); first = first or s.get("startName")
    return {"min": i["totalTime"], "transfers": max(0, i.get("busTransitCount", 0) + i.get("subwayTransitCount", 0) - 1), "walk": i.get("totalWalk"),
            "fare": i.get("payment"), "route": " → ".join(legs), "first": first}

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--limit", type=int, default=900); args = ap.parse_args()
    key = os.environ.get("ODSAY_API_KEY")
    cache = json.load(open(RAW, encoding="utf-8")) if os.path.exists(RAW) else {}
    org = origins()
    todo = sorted((c for c in org if c not in cache), key=lambda c: math.hypot(org[c][0] - DEST[0], org[c][1] - DEST[1]))  # nearest first
    if key:
        for n, code in enumerate(todo[: args.limit]):
            sx, sy, _ = org[code]
            try: res = ask(key, sx, sy)
            except Exception as e: print("stopped:", e); break
            if "error" in res:
                msg = json.dumps(res["error"], ensure_ascii=False)
                if any(w in msg for w in ("limit", "초과", "ApiKey", "apiKey", "인증")): print("stopped:", msg); break
                cache[code] = None  # no route (e.g. walking distance or island); don't retry daily
            else: cache[code] = summarize(res)
            if n % 50 == 49: json.dump(cache, open(RAW, "w", encoding="utf-8"), ensure_ascii=False)
            time.sleep(0.15)
        json.dump(cache, open(RAW, "w", encoding="utf-8"), ensure_ascii=False)
    elif todo: print(f"ODSAY_API_KEY not set; {len(todo)} 행정동 still without a transit time")
    out = {c: {**v, "origin": "apts" if org.get(c, (0, 0, False))[2] else "area"} for c, v in cache.items() if v}
    json.dump(out, open(os.path.join(OUT, "commute.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"commute: {len(out)} 행정동 with a time, {len(org) - len(cache)} left")

if __name__ == "__main__":
    main()
