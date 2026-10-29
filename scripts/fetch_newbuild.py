"""신축 공급: where new apartments are being sold, built and moved into (서울·경기) → web/public/data/newbuild.json.

    python scripts/fetch_newbuild.py

- 분양·입주 예정: 청약홈 분양 공고 since 2021 (same service and key as fetch_applyhome.py), with each notice's
  입주 예정월 and 주택형별 분양가 (전용 3.3㎡당, comparable with the app's 평당가)
- 최근 입주: K-apt complexes whose 사용승인 is within the last 2 years (data/static/apt_basic.json)
- 연령: 10세 단위 인구 (data/static/population_age.json) of the 행정동 with the most newly completed households
"""
import datetime as dt, json, os, re, statistics as st, sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_applyhome as ah  # noqa: E402  (shares the 청약홈 client, .env loading and geocoder)

ROOT = ah.ROOT
OUT = os.path.join(ROOT, "web", "public", "data", "newbuild.json")
STATIC, RAW = os.path.join(ROOT, "data", "static"), os.path.join(ROOT, "data", "raw")
PY = 3.3058
load = lambda p, d=None: json.load(open(p, encoding="utf-8")) if os.path.exists(p) else d

def region_of(addr, sido):
    """서울 → 구, 경기 → 시/군 (화성특례시 → 화성시)."""
    t = re.sub(r"특례시", "시", addr or "").split()
    return (t[1] if len(t) > 1 else "") if sido == "11" else (t[1] if len(t) > 1 else "")

def main():
    key, kk = os.environ.get("DATA_GO_KR_API_KEY"), os.environ.get("KAKAO_REST_KEY")
    if not key: sys.exit("DATA_GO_KR_API_KEY is not set; keeping the existing newbuild.json")
    today = dt.date.today(); ym_now = today.strftime("%Y%m")
    try:
        heads = [h for area in ("서울", "경기") for h in ah.get("getAPTLttotPblancDetail", key, {"cond[RCRIT_PBLANC_DE::GTE]": "2021-01-01", "cond[SUBSCRPT_AREA_CODE_NM::EQ]": area})]
        models = ah.get("getAPTLttotPblancMdl", key, {"cond[HOUSE_MANAGE_NO::GTE]": min(h["HOUSE_MANAGE_NO"] for h in heads)}) if heads else []
    except Exception as e:
        sys.exit(f"newbuild: 청약홈 request failed ({e}); keeping the existing file")
    by = defaultdict(list)
    for m in models: by[(m.get("HOUSE_MANAGE_NO"), m.get("PBLANC_NO"))].append(m)
    cache = load(ah.GEO, {})
    notices = []
    for h in heads:
        sido = "11" if h.get("SUBSCRPT_AREA_CODE_NM") == "서울" else "41"
        mvn = (h.get("MVN_PREARNGE_YM") or "").strip()
        types = by[(h.get("HOUSE_MANAGE_NO"), h.get("PBLANC_NO"))]
        prices = [int(m.get("LTTOT_TOP_AMOUNT") or 0) for m in types if m.get("LTTOT_TOP_AMOUNT")]
        # 전용면적 is the leading number of the 주택형 ("059.9800A"); price per 전용 3.3㎡ matches the app's 평당가
        ppp = [int(m["LTTOT_TOP_AMOUNT"]) / float(mm.group(1)) * PY for m in types if m.get("LTTOT_TOP_AMOUNT") and (mm := re.match(r"0*(\d+(?:\.\d+)?)", m.get("HOUSE_TY") or "")) and float(mm.group(1)) > 10]
        g = ah.geocode(h.get("HSSPLY_ADRES") or "", h.get("HOUSE_NM"), kk, cache) or {}
        notices.append({"id": f"{h.get('HOUSE_MANAGE_NO')}-{h.get('PBLANC_NO')}", "name": h.get("HOUSE_NM"), "sido": sido, "region": region_of(h.get("HSSPLY_ADRES"), sido),
                        "addr": h.get("HSSPLY_ADRES"), "kind": h.get("HOUSE_DTL_SECD_NM") or h.get("HOUSE_SECD_NM"), "households": int(h.get("TOT_SUPLY_HSHLDCO") or 0),
                        "notice": h.get("RCRIT_PBLANC_DE"), "receipt_end": h.get("RCEPT_ENDDE"), "mvn": f"{mvn[:4]}-{mvn[4:6]}" if len(mvn) >= 6 else None, "_mvn": mvn,
                        "builder": h.get("CNSTRCT_ENTRPS_NM"), "price_min": min(prices) if prices else None, "price_max": max(prices) if prices else None,
                        "ppp": round(st.median(ppp)) if ppp else None, "url": h.get("PBLANC_URL"),
                        **({"lon": g["lon"], "lat": g["lat"], "approx": bool(g.get("approx"))} if g else {})})
    json.dump(cache, open(ah.GEO, "w", encoding="utf-8"), ensure_ascii=False)
    selling = [n for n in notices if (n["receipt_end"] or "") >= today.isoformat()]
    # 조합원 취소분·잔여세대·추가 모집 re-offer flats of a complex already counted by its first notice
    reoffer = re.compile(r"취소분|잔여|추가\s*입주|추가입주|무순위|재공급|임의공급")
    upcoming = sorted((n for n in notices if n["_mvn"] >= ym_now and not reoffer.search(n["name"] or "")), key=lambda n: n["_mvn"])

    # 최근 입주: K-apt 사용승인 within 2 years
    basic, geo = load(os.path.join(STATIC, "apt_basic.json"), []), load(os.path.join(RAW, "geocode_kapt.json"), {})
    since = (today - dt.timedelta(days=730)).isoformat()
    recent = []
    for b in basic:
        if (b.get("approval") or "") < since: continue
        g = geo.get(b["kaptCode"]) or {}
        sido = b.get("sido", "11"); region = b.get("gu", "") if sido == "11" else (b.get("gu") or "").split()[0]
        recent.append({"id": f"{b.get('gu')} {b.get('dong')} {b['name']}", "name": b["name"], "sido": sido, "region": region, "dong": b.get("dong"), "households": b.get("households") or 0,
                       "approval": b["approval"], "hcode": g.get("hcode"), **({"lon": round(g["lon"], 6), "lat": round(g["lat"], 6)} if g.get("lon") else {})})
    recent.sort(key=lambda r: r["approval"], reverse=True)

    # 지역별 공급량: 입주 예정 세대 by year, 최근 2년 입주 세대
    supply = {}
    for n in upcoming:
        s = supply.setdefault(n["region"], {"sido": n["sido"], "upcoming": {}, "recent": 0, "selling": 0})
        y = n["_mvn"][:4]; s["upcoming"][y] = s["upcoming"].get(y, 0) + n["households"]
    for r in recent:
        supply.setdefault(r["region"], {"sido": r["sido"], "upcoming": {}, "recent": 0, "selling": 0})["recent"] += r["households"]
    for n in selling:
        supply.setdefault(n["region"], {"sido": n["sido"], "upcoming": {}, "recent": 0, "selling": 0})["selling"] += n["households"]
    supply.pop("", None)

    # 연령: 행정동 where the most households moved into new complexes, against their 시도
    age = load(os.path.join(STATIC, "population_age.json"), {}) or {}
    pop = (load(os.path.join(STATIC, "population.json"), {}) or {}).get("hdong", {})
    hh = defaultdict(int)
    for r in recent:
        if r.get("hcode"): hh[r["hcode"]] += r["households"]
    top = []
    for code, n in sorted(hh.items(), key=lambda x: -x[1]):
        v = (age.get("hdong") or {}).get(code)
        if not v or n < 300: continue
        p = pop.get(code, {})
        top.append({"hcode": code, "name": f"{p.get('gu', '')} {p.get('hdong', '')}".strip(), "sido": code[:2], "new_hh": n, "ages": v})
        if len(top) >= 20: break
    base = {}
    for sd in ("11", "41"):
        rows = [v for c, v in (age.get("sgg") or {}).items() if c[:2] == sd]
        if rows: base[sd] = [sum(x) for x in zip(*rows)]
    for n in notices: n.pop("_mvn", None)
    out = {"as_of": today.isoformat(), "notices_since": "2021-01-01", "selling": selling, "upcoming": upcoming, "recent": recent, "supply": supply,
           "age": {"as_of": age.get("as_of"), "bands": age.get("bands"), "base": base, "dongs": top}}
    json.dump(out, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"newbuild: {len(notices)} 공고 since 2021 (분양 중 {len(selling)}, 입주 예정 {len(upcoming)} / {sum(n['households'] for n in upcoming):,}세대), "
          f"최근 2년 입주 {len(recent)}단지 {sum(r['households'] for r in recent):,}세대, {len(supply)} 지역, 연령 {len(top)} 행정동")

if __name__ == "__main__":
    main()
