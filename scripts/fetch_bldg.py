"""건축물대장: the built 용적률, 건폐율, 주차 and size of every K-apt complex (서울·경기) → web/public/data/bldg.json.

    python scripts/fetch_bldg.py [--limit 9000]

Source: 공공데이터포털 "국토교통부_건축HUB_건축물대장정보 서비스" (DATA_GO_KR_API_KEY, approved separately), looked up by the
complex's parcel number from fetch_landuse.py (data/raw/pnu_kapt.json). 총괄표제부 first (one row per complex); a single-
building site has none, so its 표제부 rows are summed. Cached in data/raw/bldg_kapt.json, refreshed yearly; Seoul and older
complexes go first because 재건축 여지 matters most there. With the 용도지역 상한 from landuse.json it also writes, per region,
how many complexes aged 25+ still have 50%p or more of 용적률 headroom.
"""
import argparse, datetime as dt, json, os, sys, time, urllib.parse, urllib.request
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# keys for local runs live in <repo>/.env (gitignored); CI passes them as real environment variables
if os.path.exists(os.path.join(ROOT, ".env")):
    for _l in open(os.path.join(ROOT, ".env"), encoding="utf-8-sig"):
        if "=" in _l and not _l.lstrip().startswith("#"): os.environ.setdefault(*[s.strip() for s in _l.split("=", 1)])
RAW, STATIC, OUT = os.path.join(ROOT, "data", "raw"), os.path.join(ROOT, "data", "static"), os.path.join(ROOT, "web", "public", "data")
API = "https://apis.data.go.kr/1613000/BldRgstHubService/"
load = lambda p, d=None: json.load(open(p, encoding="utf-8")) if os.path.exists(p) else d

def items(ep, key, pnu):
    q = {"serviceKey": key, "sigunguCd": pnu[:5], "bjdongCd": pnu[5:10], "platGbCd": "1" if pnu[10] == "2" else "0", "bun": pnu[11:15], "ji": pnu[15:19],
         "_type": "json", "numOfRows": 100, "pageNo": 1}
    text = ""
    for t in range(4):
        try:
            with urllib.request.urlopen(API + ep + "?" + urllib.parse.urlencode(q), timeout=30) as r: text = r.read().decode("utf-8", "replace")
            j = json.loads(text); body = j["response"]["body"]; it = (body.get("items") or {})
            it = it.get("item") if isinstance(it, dict) else it
            return it if isinstance(it, list) else [it] if it else []
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 429): raise RuntimeError(f"HTTP {e.code} (quota or key)")
            time.sleep(3 + t * 3)
        except (KeyError, ValueError):
            if "LIMITED_NUMBER" in text: raise RuntimeError("daily request limit reached")
            time.sleep(5 + t * 5)  # the gateway sometimes answers with an XML error page; back off and retry
        except Exception:
            time.sleep(3 + t * 3)
    raise RuntimeError(f"{ep}: no valid answer after retries ({text[:120]!r})")

def land_area(pnu, vkey):
    """토지대장 면적 of one parcel (브이월드), for old registers that store 대지면적 as 0"""
    if not vkey: return None
    u = "https://api.vworld.kr/ned/data/ladfrlList?" + urllib.parse.urlencode({"key": vkey, "pnu": pnu, "format": "json", "numOfRows": 1, "domain": "https://howcani2.github.io"})
    try:
        with urllib.request.urlopen(u, timeout=20) as r: j = json.load(r)
        rows = (j.get("ladfrlVOList") or {}).get("ladfrlVOList") or []
        return float(rows[0]["lndpclAr"]) if rows else None
    except Exception:
        return None

def summarize(recap, titles):
    num = lambda v: float(v) if v not in (None, "") else 0.0
    park = lambda x: sum(num(x.get(k)) for k in ("indrMechUtcnt", "oudrMechUtcnt", "indrAutoUtcnt", "oudrAutoUtcnt"))
    if recap:
        r = max(recap, key=lambda x: num(x.get("totArea")))
        return {"far": num(r.get("vlRat")) or None, "bcr": num(r.get("bcRat")) or None, "area": round(num(r.get("totArea"))), "site": round(num(r.get("platArea"))),
                "est": round(num(r.get("vlRatEstmTotArea"))), "lots": int(num(r.get("bylotCnt"))),
                "park": round(park(r)) or None, "hh": int(num(r.get("hhldCnt"))) or None, "elev": int(sum(num(t.get("rideUseElvtCnt")) for t in titles)) or None,
                "floors": int(max((num(t.get("grndFlrCnt")) for t in titles), default=0)) or None}
    if titles:
        res = [t for t in titles if "주택" in (t.get("mainPurpsCdNm") or "")] or titles
        site = max(num(t.get("platArea")) for t in res); area = sum(num(t.get("vlRatEstmTotArea") or t.get("totArea")) for t in res)
        far = max(num(t.get("vlRat")) for t in res) or (round(area / site * 100, 2) if site else 0)
        return {"far": far or None, "bcr": max(num(t.get("bcRat")) for t in res) or None, "area": round(sum(num(t.get("totArea")) for t in res)), "site": round(site),
                "est": round(sum(num(t.get("vlRatEstmTotArea")) for t in res)), "lots": int(max(num(t.get("bylotCnt")) for t in res)),
                "park": round(sum(park(t) for t in res)) or None, "hh": int(sum(num(t.get("hhldCnt")) for t in res)) or None,
                "elev": int(sum(num(t.get("rideUseElvtCnt")) for t in res)) or None, "floors": int(max(num(t.get("grndFlrCnt")) for t in res)) or None}
    return None

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--limit", type=int, default=9000); args = ap.parse_args()
    key, vkey = os.environ.get("DATA_GO_KR_API_KEY"), os.environ.get("VWORLD_API_KEY")
    basic = load(os.path.join(STATIC, "apt_basic.json"), []) or []
    pnus = load(os.path.join(RAW, "pnu_kapt.json"), {}) or {}
    cp = os.path.join(RAW, "bldg_kapt.json"); cache = load(cp, {}) or {}
    stale = (dt.date.today() - dt.timedelta(days=365)).isoformat()
    # entries from before the 구대장 fallback lack "est": look those up again
    todo = [b for b in basic if pnus.get(b["kaptCode"]) and (cache.get(b["kaptCode"], {}).get("at", "") < stale or "est" not in cache.get(b["kaptCode"], {}))]
    todo.sort(key=lambda b: (b.get("sido", "11") != "11", b.get("approval") or "9999"))  # Seoul, then oldest first
    calls = 0
    if not key: print(f"bldg: DATA_GO_KR_API_KEY not set; {len(todo)} complexes left")
    try:
        for b in todo if key else []:
            if calls + 2 > args.limit: break
            p = pnus[b["kaptCode"]]
            recap = items("getBrRecapTitleInfo", key, p); calls += 1
            titles = items("getBrTitleInfo", key, p); calls += 1
            v = summarize(recap, titles) or {}
            if not v.get("far") and v.get("est") and v.get("lots", 0) <= 1:  # 구대장: 대지면적 0 → 토지대장 면적 of the single parcel
                land = land_area(p, vkey)
                far = v["est"] / land * 100 if land and land > 100 else None
                if far and 50 <= far <= 350: v["far"], v["far_est"], v["site"] = round(far, 1), True, round(land)  # above that the site spans other parcels (old complexes were rarely denser)
            cache[b["kaptCode"]] = {"at": dt.date.today().isoformat(), **v}
            if calls % 1000 < 2: json.dump(cache, open(cp, "w", encoding="utf-8"), ensure_ascii=False); print(f"bldg: {calls} calls", flush=True)
            time.sleep(0.05)
    except RuntimeError as e:
        print("bldg: stopped:", e)
    json.dump(cache, open(cp, "w", encoding="utf-8"), ensure_ascii=False)

    # per complex: [지금 용적률, 건폐율, 연면적, 대지면적, 주차 대수, 승강기, 최고층]; plus 재건축 여지 per region
    land = (load(os.path.join(OUT, "landuse.json"), {}) or {}).get("items", {})
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from vgeo import kapt_geo
    geo = kapt_geo(basic)  # 행정동 of each complex, from the 브이월드 cache
    out, reg = {}, defaultdict(list)
    year = dt.date.today().year
    for b in basic:
        v = cache.get(b["kaptCode"])
        if not v or not v.get("far"): continue
        out[b["kaptCode"]] = [round(v["far"], 1), v.get("bcr"), v.get("area"), v.get("site"), v.get("park"), v.get("elev"), v.get("floors"), 1 if v.get("far_est") else 0]
        cap = (land.get(b["kaptCode"]) or {}).get("far_max")
        age = year - int(b["approval"][:4]) if b.get("approval") else None
        if cap and age is not None and age >= 25:
            sgg = b.get("sgg") or ""; sgg = "41590" if sgg.startswith("4159") else sgg
            keys = [("sgg", sgg), ("hdong", (geo.get(b["kaptCode"]) or {}).get("hcode"))]
            if b.get("sido", "11") == "11": keys += [("gu", b.get("gu")), ("bdong", f"{b.get('gu')} {b.get('dong')}")]
            for lv, k in keys:
                if k: reg[(lv, k)].append((cap - v["far"], age))
    region = {lv: {} for lv in ("gu", "bdong", "hdong", "sgg")}
    for (lv, k), ms in reg.items():
        if len(ms) < 3: continue
        rs = [m for m, _ in ms]
        region[lv][k] = {"old": len(ms), "room50": round(sum(m >= 50 for m in rs) / len(rs) * 100, 1), "room": round(sorted(rs)[len(rs) // 2], 1)}
        for yrs in (30, 35):  # the same share among 30년+ / 35년+ complexes (the map's 연한 picker)
            sub = [m for m, a in ms if a >= yrs]
            if len(sub) >= 3: region[lv][k][f"room50_{yrs}"] = round(sum(m >= 50 for m in sub) / len(sub) * 100, 1)
    json.dump({"as_of": dt.date.today().isoformat(), "fields": ["용적률", "건폐율", "연면적㎡", "대지면적㎡", "주차대수", "승강기", "최고층", "용적률 추정(구대장)"], "items": out, "region": region},
              open(os.path.join(OUT, "bldg.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    left = sum(1 for b in basic if pnus.get(b["kaptCode"]) and b["kaptCode"] not in cache)
    print(f"bldg: {calls} API calls this run, {len(out):,} complexes with 용적률, {left:,} left")

if __name__ == "__main__":
    main()
