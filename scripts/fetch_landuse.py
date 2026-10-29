"""용도지역·용도지구·규제 for every K-apt complex in 서울·경기 (브이월드 토지이용계획 속성) → web/public/data/landuse.json (per complex) and landuse_region.json (구·동·시군구 mix).

    python scripts/fetch_landuse.py [--limit 9000]

1. parcel number (PNU = 법정동코드 + 산 여부 + 본번 + 부번) from the complex's lot address via Kakao, else from its
   coordinates (coord2address for the lot, coord2regioncode for the 법정동 code); cached in data/raw/pnu_kapt.json
2. 브이월드 getLandUseAttr for that parcel; cached in data/raw/landuse_kapt.json (zoning rarely changes, so a
   complex is looked up once and refreshed after 90 days)
Needs VWORLD_API_KEY (vworld.kr, 서비스 URL https://howcani2.github.io) and KAKAO_REST_KEY.
"""
import argparse, datetime as dt, json, os, re, time, urllib.parse, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# keys for local runs live in <repo>/.env (gitignored); CI passes them as real environment variables
if os.path.exists(os.path.join(ROOT, ".env")):
    for _l in open(os.path.join(ROOT, ".env"), encoding="utf-8-sig"):
        if "=" in _l and not _l.lstrip().startswith("#"): os.environ.setdefault(*[s.strip() for s in _l.split("=", 1)])
RAW, OUT = os.path.join(ROOT, "data", "raw"), os.path.join(ROOT, "web", "public", "data", "landuse.json")
DOMAIN = "https://howcani2.github.io"

# 용도지역 → 용적률 상한 (%): 서울시 도시계획조례, and 국토계획법 시행령 maxima for Gyeonggi (each 시군 조례 can be lower)
ZONES = ["제1종전용주거지역", "제2종전용주거지역", "제1종일반주거지역", "제2종일반주거지역", "제3종일반주거지역", "준주거지역",
         "중심상업지역", "일반상업지역", "근린상업지역", "유통상업지역", "전용공업지역", "일반공업지역", "준공업지역",
         "보전녹지지역", "생산녹지지역", "자연녹지지역", "보전관리지역", "생산관리지역", "계획관리지역"]
FAR_SEOUL = {"제1종전용주거지역": 100, "제2종전용주거지역": 120, "제1종일반주거지역": 150, "제2종일반주거지역": 200, "제3종일반주거지역": 250, "준주거지역": 400,
             "중심상업지역": 1000, "일반상업지역": 800, "근린상업지역": 600, "유통상업지역": 600, "전용공업지역": 200, "일반공업지역": 200, "준공업지역": 400,
             "보전녹지지역": 50, "생산녹지지역": 50, "자연녹지지역": 50}
FAR_LAW = {"제1종전용주거지역": 100, "제2종전용주거지역": 150, "제1종일반주거지역": 200, "제2종일반주거지역": 250, "제3종일반주거지역": 300, "준주거지역": 500,
           "중심상업지역": 1500, "일반상업지역": 1300, "근린상업지역": 900, "유통상업지역": 1100, "전용공업지역": 300, "일반공업지역": 350, "준공업지역": 400,
           "보전녹지지역": 80, "생산녹지지역": 100, "자연녹지지역": 100, "보전관리지역": 80, "생산관리지역": 80, "계획관리지역": 100}
# what is worth flagging for a home buyer, by keyword in the 지역·지구 name
FLAGS = [("토지거래", "토지거래허가구역"), ("재정비촉진", "재정비촉진지구"), ("정비구역", "정비구역"), ("지구단위계획", "지구단위계획구역"),
         ("고도지구", "고도지구"), ("경관지구", "경관지구"), ("개발제한구역", "개발제한구역"), ("군사기지", "군사시설보호구역"), ("비행안전", "비행안전구역"),
         ("역사문화환경", "문화유산 주변"), ("문화재보호", "문화유산 주변"), ("국가유산", "문화유산 주변"), ("상수원", "상수원보호구역"),
         ("공공주택지구", "공공주택지구"), ("택지개발", "택지개발지구"), ("도시개발구역", "도시개발구역"), ("방화지구", "방화지구"), ("학교환경위생", "교육환경보호구역"), ("교육환경보호", "교육환경보호구역")]

def get(url, headers=None, tries=3):
    for t in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=20) as r: return json.load(r)
        except Exception as e:
            err = e; time.sleep(1 + t)
    raise RuntimeError(err)
def kakao(path, params, key): return get(f"https://dapi.kakao.com/v2/local/{path}.json?" + urllib.parse.urlencode(params), {"Authorization": "KakaoAK " + key}) or {}
def pnu_from(d):
    if not d or not d.get("b_code") or not d.get("main_address_no"): return None
    return d["b_code"] + ("2" if d.get("mountain_yn") == "Y" else "1") + d["main_address_no"].zfill(4) + (d.get("sub_address_no") or "0").zfill(4)

def find_pnu(b, geo, key):
    """K-apt writes 시군구 run together ("수원장안구 파장동 199,…- 이름"), so rebuild "<시도> <시군구> <동> <지번>" first."""
    sido = "서울특별시" if b.get("sido", "11") == "11" else "경기도"
    m = re.search(r"\s(" + re.escape(b.get("dong") or "") + r")\s+(산\s*)?(\d+(?:-\d+)?)", b.get("address") or "") if b.get("dong") else None
    tries = [f"{sido} {b.get('gu', '')} {b['dong']} {m.group(2) or ''}{m.group(3)}"] if m else []
    if b.get("road_address"): tries.append(b["road_address"].split(",")[0])
    for q in tries:
        for d in kakao("search/address", {"query": q, "size": 1}, key).get("documents", []):
            p = pnu_from(d.get("address"))
            if p: return p
    g = geo.get(b["kaptCode"])
    if g:  # last resort: the lot under the complex's map point
        a = (kakao("geo/coord2address", {"x": g["lon"], "y": g["lat"]}, key).get("documents") or [{}])[0].get("address")
        rc = next((d for d in kakao("geo/coord2regioncode", {"x": g["lon"], "y": g["lat"]}, key).get("documents", []) if d["region_type"] == "B"), None)
        if a and rc: return pnu_from({**a, "b_code": rc["code"]})
    return None

def summarize(rows, sido):
    """rows: [{n: 지역·지구 name, c: 포함/저촉/접함}]. 접함 only touches the parcel's edge (it is the neighbour's), so it is left out;
    the main 용도지역 is one the parcel lies in (포함), ahead of ones it only overlaps (저촉)."""
    names, inside = [], set()
    for r in rows:
        c, n = (r.get("c") or "").strip(), (r.get("n") or "").strip().replace(" ", "")
        if not n or c in ("접함", "접합"): continue
        if n not in names: names.append(n)
        if c == "포함": inside.add(n)
    zones = sorted((z for z in ZONES if z in names), key=lambda z: (z not in inside, ZONES.index(z)))
    flags = []
    for kw, label in FLAGS:
        if any(kw in n for n in names) and label not in flags: flags.append(label)
    far = (FAR_SEOUL if sido == "11" else FAR_LAW).get(zones[0]) if zones else None
    return {"zones": zones, "far_max": far, "far_basis": "서울시 조례" if sido == "11" else "국토계획법 상한", "flags": flags, "all": names}

# 용도지역 groups for the region view (share of apartment households in each)
BUCKETS = [("1종", ("제1종일반주거지역", "제1종전용주거지역", "제2종전용주거지역")), ("2종", ("제2종일반주거지역",)), ("3종", ("제3종일반주거지역",)),
           ("준주거·상업", ("준주거지역", "중심상업지역", "일반상업지역", "근린상업지역", "유통상업지역"))]
REGION_FLAGS = {"토허": ("토지거래허가구역",), "정비": ("정비구역", "재정비촉진지구"), "지구단위": ("지구단위계획구역",), "높이제한": ("고도지구", "경관지구", "비행안전구역", "문화유산 주변")}

def region_rollup(out, basic, geo):
    """구 / 법정동 / 행정동 / 시군구 → households-weighted zoning mix and flag shares of the apartment complexes in it."""
    acc = {lv: {} for lv in ("gu", "bdong", "hdong", "sgg")}
    for b in basic:
        v = out.get(b["kaptCode"])
        if not v: continue
        w = b.get("households") or 0
        if not w: continue
        sgg = b.get("sgg") or ""; sgg = "41590" if sgg.startswith("4159") else sgg
        keys = [("hdong", (geo.get(b["kaptCode"]) or {}).get("hcode")), ("sgg", sgg)]
        if b.get("sido", "11") == "11": keys += [("gu", b.get("gu")), ("bdong", f"{b.get('gu')} {b.get('dong')}")]
        zone = v["zones"][0] if v["zones"] else None
        bucket = next((k for k, zs in BUCKETS if zone in zs), "기타")
        for lv, k in keys:
            if not k: continue
            a = acc[lv].setdefault(k, {"n": 0, "hh": 0, "zones": {}, "flags": {}, "far": [0, 0]})
            a["n"] += 1; a["hh"] += w; a["zones"][bucket] = a["zones"].get(bucket, 0) + w
            for f, labels in REGION_FLAGS.items():
                if any(l in v["flags"] for l in labels): a["flags"][f] = a["flags"].get(f, 0) + w
            if v.get("far_max"): a["far"][0] += v["far_max"] * w; a["far"][1] += w
    res = {}
    for lv, tbl in acc.items():
        res[lv] = {k: {"n": a["n"], "hh": a["hh"], "zones": {z: round(c / a["hh"] * 100, 1) for z, c in a["zones"].items()},
                       "flags": {f: round(c / a["hh"] * 100, 1) for f, c in a["flags"].items()}, "far_avg": round(a["far"][0] / a["far"][1]) if a["far"][1] else None,
                       "high": round((a["zones"].get("3종", 0) + a["zones"].get("준주거·상업", 0)) / a["hh"] * 100, 1)} for k, a in tbl.items()}
    return res

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--limit", type=int, default=9000); args = ap.parse_args()
    vk, kk = os.environ.get("VWORLD_API_KEY"), os.environ.get("KAKAO_REST_KEY")
    basic = json.load(open(os.path.join(ROOT, "data", "static", "apt_basic.json"), encoding="utf-8"))
    geo = json.load(open(os.path.join(RAW, "geocode_kapt.json"), encoding="utf-8"))
    pp, lp = os.path.join(RAW, "pnu_kapt.json"), os.path.join(RAW, "landuse_kapt.json")
    pnus = json.load(open(pp, encoding="utf-8")) if os.path.exists(pp) else {}
    lu = json.load(open(lp, encoding="utf-8")) if os.path.exists(lp) else {}
    stale = (dt.date.today() - dt.timedelta(days=90)).isoformat()
    # Seoul first, then Gyeonggi; within each, complexes never looked up before those due a refresh
    todo = sorted((b for b in basic if b["kaptCode"] not in lu or lu[b["kaptCode"]].get("at", "") < stale), key=lambda b: (b.get("sido") != "11", b["kaptCode"] in lu))
    done = calls = 0
    if not (vk and kk): print(f"landuse: VWORLD_API_KEY / KAKAO_REST_KEY not set; {len(todo)} complexes still to look up")
    for b in todo if vk and kk else []:
        if done >= args.limit: break
        code = b["kaptCode"]
        try:
            if code not in pnus: pnus[code] = find_pnu(b, geo, kk)
            if not pnus[code]: lu[code] = {"at": dt.date.today().isoformat(), "rows": []}; done += 1; continue
            j = get("https://api.vworld.kr/ned/data/getLandUseAttr?" + urllib.parse.urlencode({"key": vk, "pnu": pnus[code], "format": "json", "numOfRows": 100, "pageNo": 1, "domain": DOMAIN}))
            calls += 1
        except RuntimeError as e:
            print("landuse: stopped:", e); break
        body = j.get("landUses") or j.get("response") or {}
        if body.get("resultCode") not in (None, "", "INFO-000") and not body.get("field"):
            print("landuse: stopped:", body.get("resultCode"), body.get("resultMsg")); break
        lu[code] = {"at": dt.date.today().isoformat(), "pnu": pnus[code], "rows": [{"n": f.get("prposAreaDstrcCodeNm"), "c": f.get("cnflcAtNm")} for f in body.get("field") or []]}
        done += 1
        if done % 200 == 0:
            json.dump(pnus, open(pp, "w", encoding="utf-8"), ensure_ascii=False); json.dump(lu, open(lp, "w", encoding="utf-8"), ensure_ascii=False)
            print(f"landuse: {done} looked up")
        time.sleep(0.05)
    json.dump(pnus, open(pp, "w", encoding="utf-8"), ensure_ascii=False); json.dump(lu, open(lp, "w", encoding="utf-8"), ensure_ascii=False)
    sido = {b["kaptCode"]: b.get("sido", "11") for b in basic}
    out = {code: {"pnu": v.get("pnu"), **summarize(v["rows"], sido.get(code, "11"))} for code, v in lu.items() if v.get("rows")}
    json.dump({"as_of": dt.date.today().isoformat(), "items": out}, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    json.dump({"as_of": dt.date.today().isoformat(), **region_rollup(out, basic, geo)}, open(OUT.replace("landuse.json", "landuse_region.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    left = sum(1 for b in basic if b["kaptCode"] not in lu)
    print(f"landuse: {done} looked up this run ({calls} 브이월드 calls), {len(out)} complexes with zoning, {left} left")

if __name__ == "__main__":
    main()
