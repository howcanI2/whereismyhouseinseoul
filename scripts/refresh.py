"""Daily data refresh for 서울 내집마련 전략판.

    python scripts/refresh.py            # fetch latest trades, geocode new complexes, rebuild web/public/data
    python scripts/refresh.py --no-fetch # rebuild only, from data/raw

Environment: DATA_GO_KR_API_KEY (국토부 실거래가 API), KAKAO_REST_KEY (optional; geocodes new complexes).
Every window (3/6/12 months, 2-year trend) is computed from today's date, so nothing here needs editing month to month.
"""
import argparse, datetime as dt, gzip, json, math, os, re, statistics as st, sys, time, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW, STATIC, OUT = (os.path.join(ROOT, "data", "raw"), os.path.join(ROOT, "data", "static"), os.path.join(ROOT, "web", "public", "data"))
GU = {"11110":"종로구","11140":"중구","11170":"용산구","11200":"성동구","11215":"광진구","11230":"동대문구","11260":"중랑구","11290":"성북구","11305":"강북구","11320":"도봉구","11350":"노원구","11380":"은평구","11410":"서대문구","11440":"마포구","11470":"양천구","11500":"강서구","11530":"구로구","11545":"금천구","11560":"영등포구","11590":"동작구","11620":"관악구","11650":"서초구","11680":"강남구","11710":"송파구","11740":"강동구"}
# Gyeonggi at the finest level the trade API answers for (구 codes where a city has 구, else the city/county)
GG = {"41111":"수원시 장안구","41113":"수원시 권선구","41115":"수원시 팔달구","41117":"수원시 영통구","41131":"성남시 수정구","41133":"성남시 중원구","41135":"성남시 분당구","41150":"의정부시",
      "41171":"안양시 만안구","41173":"안양시 동안구","41192":"부천시 원미구","41194":"부천시 소사구","41196":"부천시 오정구","41210":"광명시","41220":"평택시","41250":"동두천시",
      "41271":"안산시 상록구","41273":"안산시 단원구","41281":"고양시 덕양구","41285":"고양시 일산동구","41287":"고양시 일산서구","41290":"과천시","41310":"구리시","41360":"남양주시",
      "41370":"오산시","41390":"시흥시","41410":"군포시","41430":"의왕시","41450":"하남시","41461":"용인시 처인구","41463":"용인시 기흥구","41465":"용인시 수지구","41480":"파주시",
      "41500":"이천시","41550":"안성시","41570":"김포시","41591":"화성시 만세구","41593":"화성시 효행구","41595":"화성시 병점구","41597":"화성시 동탄구","41610":"광주시",
      "41630":"양주시","41650":"포천시","41670":"여주시","41800":"연천군","41820":"가평군","41830":"양평군"}
REGIONS = {**GU, **GG}
# rough transit minutes from each 구's main residential area to 광화문 (estimate shown as such in the app)
COMMUTE = {"종로구":15,"중구":15,"용산구":25,"서대문구":25,"마포구":30,"성북구":30,"동대문구":30,"성동구":35,"은평구":35,"광진구":40,"영등포구":40,"동작구":40,"중랑구":45,"강북구":45,"관악구":45,"서초구":45,"강남구":45,"구로구":45,"양천구":45,"송파구":50,"노원구":50,"도봉구":50,"강서구":50,"금천구":50,"강동구":55}
NOW_MAX, LATER_MIN, LATER_MAX, PY = 40000, 80000, 105000, 3.3058
TRADE_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade"
RENT_URL = "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent"

def load(p, default=None):
    if not os.path.exists(p): return default
    if p.endswith(".gz"):
        with gzip.open(p, "rt", encoding="utf-8") as f: return json.load(f)
    with open(p, encoding="utf-8") as f: return json.load(f)
def save(p, obj, gz=False, pretty=False):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    txt = json.dumps(obj, ensure_ascii=False, indent=0 if pretty else None, separators=None if pretty else (",", ":"))
    if gz:
        with gzip.open(p, "wt", encoding="utf-8") as f: f.write(txt)
    else:
        with open(p, "w", encoding="utf-8") as f: f.write(txt)
med = lambda xs: round(st.median(xs)) if xs else None
# 21-point price distribution (every 5%) so the app can work out "share of trades under my budget" for any budget
def quant(xs):
    if len(xs) < 5: return None
    xs = sorted(xs); return [xs[round(i / 20 * (len(xs) - 1))] for i in range(21)]
won = lambda v: (f"{v/10000:.1f}".rstrip("0").rstrip(".") + "억") if v >= 10000 else f"{v:,}만"

# ---------------- windows ----------------
def ym_add(ym, k):
    y, m = int(ym[:4]), int(ym[4:]) + k
    while m < 1: y, m = y - 1, m + 12
    while m > 12: y, m = y + 1, m - 12
    return f"{y}{m:02d}"
def windows(today):
    cur = today.strftime("%Y%m")              # current month: still being reported (30-day lag)
    last = ym_add(cur, -1)                    # last complete month
    rng = lambda end, n: [ym_add(end, -i) for i in range(n - 1, -1, -1)]
    return {"cur": cur, "last": last, "months24": rng(cur, 24), "months12": rng(cur, 12),
            "p3": (rng(last, 3), rng(ym_add(last, -3), 3)), "p6": (rng(last, 6), rng(ym_add(last, -6), 6)), "p12": (rng(last, 12), rng(ym_add(last, -12), 12)),
            "six": rng(cur, 7), "rents": rng(last, 6)}
def mlabel(ym): return f"{int(ym[4:])}월"
def span(ms): return f"{mlabel(ms[0])}~{mlabel(ms[-1])}" if ms[0][:4] == ms[-1][:4] else f"{ms[0][2:4]}.{ms[0][4:]}~{ms[-1][2:4]}.{ms[-1][4:]}"

# ---------------- fetch ----------------
def _get(url, params):
    q = urllib.parse.urlencode(params)
    for t in range(4):
        try:
            with urllib.request.urlopen(f"{url}?{q}", timeout=30) as r: return r.read().decode("utf-8")
        except Exception as e:
            err = e; time.sleep(2 + t * 2)
    raise RuntimeError(f"{url} failed: {err}")
def _num(s):
    s = (s or "").replace(",", "").strip()
    try: return int(float(s))
    except ValueError: return None
def _f(s):
    try: return float((s or "").strip())
    except ValueError: return None
def fetch_month(key, url, code, ym, kind):
    items, page = [], 1
    while True:
        root = ET.fromstring(_get(url, {"serviceKey": key, "LAWD_CD": code, "DEAL_YMD": ym, "numOfRows": 1000, "pageNo": page}))
        rc = root.findtext(".//resultCode") or ""
        if rc not in ("00", "000"): raise RuntimeError(f"{kind} {code} {ym}: {rc} {root.findtext('.//resultMsg')}")
        for it in root.iter("item"):
            t = lambda tag: (it.findtext(tag) or "").strip()
            if t("cdealType") == "O": continue  # cancelled deal
            date = f"{t('dealYear')}-{int(t('dealMonth') or 1):02d}-{int(t('dealDay') or 1):02d}"
            base = {"dong": t("umdNm"), "area_sqm": _f(t("excluUseAr")), "floor": _num(t("floor")), "trade_date": date, "build_year": _num(t("buildYear"))}
            if kind == "trade":
                p = _num(t("dealAmount"))
                if p: items.append({"apt_name": t("aptNm"), "price_10k": p, **base})
            else:
                d = _num(t("deposit"))
                if d: items.append({"unit_name": t("aptNm"), "deposit_10k": d, "monthly_rent_10k": _num(t("monthlyRent")) or 0, **base})
        total = int(root.findtext(".//totalCount") or 0)
        if page * 1000 >= total: return items
        page += 1
def fetch(W, key):
    raw = load(os.path.join(RAW, "molit.json.gz"), {"trades": {}, "rents": {}})
    keep_t, keep_r = set(W["months24"]), set(W["rents"])
    raw["trades"] = {k: v for k, v in raw["trades"].items() if k.split("_")[1] in keep_t}
    raw["rents"] = {k: v for k, v in raw["rents"].items() if k.split("_")[1] in keep_r}
    fresh = set(W["months24"][-3:])  # late reports keep arriving for ~30 days, so re-pull the last 3 months
    calls = 0
    for code in REGIONS:
        for ym in W["months24"]:
            k = f"{code}_{ym}"
            if k in raw["trades"] and ym not in fresh: continue
            raw["trades"][k] = {"items": fetch_month(key, TRADE_URL, code, ym, "trade")}; calls += 1
        for ym in W["rents"]:
            k = f"{code}_{ym}"
            if k in raw["rents"] and ym not in fresh: continue
            raw["rents"][k] = {"items": fetch_month(key, RENT_URL, code, ym, "rent")}; calls += 1
    save(os.path.join(RAW, "molit.json.gz"), raw, gz=True)
    print(f"fetch: {calls} API calls, {sum(len(v['items']) for v in raw['trades'].values()):,} trades kept")
    return raw

# ---------------- geocoding (Kakao, cached) ----------------
def kakao(path, params, key):
    req = urllib.request.Request(f"https://dapi.kakao.com/v2/local/{path}.json?" + urllib.parse.urlencode(params), headers={"Authorization": "KakaoAK " + key})
    for t in range(3):
        try:
            with urllib.request.urlopen(req, timeout=15) as r: return json.load(r)
        except Exception: time.sleep(1 + t)
    return {}
def geocode_new(ids_rows, key):
    geo = load(os.path.join(RAW, "geocode_apts.json"), {}); hd = load(os.path.join(RAW, "hdong_apts.json"), {})
    new = [r for r in ids_rows if r["id"] not in geo]
    if new and not key: print(f"geocode: {len(new)} new complexes left without coordinates (KAKAO_REST_KEY not set)")
    for r in new if key else []:
        gu, dong, apt = r["gu"], r["dong"], r["apt"]; hit = None
        m = re.fullmatch(r"\((\d+(?:-\d+)?)\)", apt.strip())
        city = gu.split()[0]  # "수원시 장안구" -> match on "수원시": new 구 names lag in some address records
        inside = lambda a: a and city in a and dong in a.split()
        sido = "서울" if r.get("sido", "11") == "11" else "경기"
        if m:
            for d in kakao("search/address", {"query": f"{sido} {gu} {dong} {m.group(1)}", "size": 5}, key).get("documents", []):
                if inside(d.get("address_name", "")): hit = d; break
        else:
            docs = kakao("search/keyword", {"query": f"{gu} {dong} {re.sub(r'\(.*?\)', '', apt).strip() or apt}", "size": 15}, key).get("documents", [])
            cand = [d for d in docs if inside(d.get("address_name", ""))]
            hit = ([d for d in cand if "아파트" in d.get("category_name", "") or "주거시설" in d.get("category_name", "")] or cand or [None])[0]
        geo[r["id"]] = {"lon": round(float(hit["x"]), 6), "lat": round(float(hit["y"]), 6)} if hit else None
        if hit:
            h = next((d for d in kakao("geo/coord2regioncode", {"x": hit["x"], "y": hit["y"]}, key).get("documents", []) if d["region_type"] == "H"), None)
            hd[r["id"]] = {"hcode": h["code"], "hdong": h["region_3depth_name"], "hgu": h["region_2depth_name"]} if h else None
        time.sleep(0.05)
    if new and key:
        save(os.path.join(RAW, "geocode_apts.json"), geo); save(os.path.join(RAW, "hdong_apts.json"), hd)
        print(f"geocode: {len(new)} new complexes looked up")
    return geo, hd

# ---------------- build ----------------
def build(raw, W, kakao_key):
    trades = []  # (gu, dong, apt, ym, date, area, floor, price)
    for k, v in raw["trades"].items():
        code, ym = k.split("_")
        if code not in GU: continue  # the Seoul build; Gyeonggi goes through build_metro
        gu = GU[code]
        for i in v["items"]:
            if i.get("price_10k") and i.get("area_sqm"): trades.append((gu, i["dong"], i["apt_name"], ym, i["trade_date"], i["area_sqm"], i.get("floor"), i["price_10k"], i.get("build_year")))
    rents = []  # (gu, dong, name, area, deposit) jeonse only
    for k, v in raw["rents"].items():
        if k.split("_")[0] not in GU: continue
        gu = GU[k.split("_")[0]]
        for i in v["items"]:
            if not i.get("monthly_rent_10k") and i.get("deposit_10k") and i.get("area_sqm"): rents.append((gu, i["dong"], i.get("unit_name", ""), i["area_sqm"], i["deposit_10k"]))
    last, rec, prv, six = W["last"], set(W["p3"][0]), set(W["p3"][1]), set(W["six"])

    # monthly series (구 and 서울 전체, last 12 months)
    by = defaultdict(lambda: defaultdict(list))
    for t in trades:
        if t[3] in W["months12"]: by[t[0]][t[3]].append(t[7] / t[5]); by["서울 전체"][t[3]].append(t[7] / t[5])
    monthly = [{"month": f"{ym[:4]}-{ym[4:]}", "gu": g, "trades": len(by[g][ym]), "median_price_per_sqm_10k": med(by[g][ym]), "partial": ym == W["cur"]} for g in list(GU.values()) + ["서울 전체"] for ym in W["months12"]]
    save(os.path.join(OUT, "monthly.json"), monthly)

    # 구 summary (strategy screen)
    gu_rows = []
    for gu in GU.values():
        g = [t for t in trades if t[0] == gu]; r_ = [t for t in g if t[3] in rec]; p_ = [t for t in g if t[3] in prv]; s_ = [t for t in g if t[3] in six]
        pr, pv = med([t[7] / t[5] for t in r_]), med([t[7] / t[5] for t in p_])
        m84 = med([t[7] for t in s_ if 75 <= t[5] <= 90]); j84 = med([x[4] for x in rents if x[0] == gu and 75 <= x[3] <= 90])
        gu_rows.append({"gu": gu, "commute_min_est": COMMUTE[gu], "trades_recent3": len(r_), "trades_prev3": len(p_), "volume_change_pct": round((len(r_) - len(p_)) / len(p_) * 100, 1) if p_ else None,
                        "price_per_sqm_recent_10k": pr, "price_change_pct": round((pr - pv) / pv * 100, 1) if pr and pv else None,
                        "median_59_10k": med([t[7] for t in s_ if 50 <= t[5] < 65]), "median_84_10k": m84, "jeonse_ratio_pct": round(j84 / m84 * 100, 1) if j84 and m84 else None,
                        "share_now_band_pct": round(sum(t[7] <= NOW_MAX for t in s_) / len(s_) * 100, 1) if s_ else None,
                        "share_later_band_pct": round(sum(LATER_MIN <= t[7] <= LATER_MAX for t in s_) / len(s_) * 100, 1) if s_ else None})
    save(os.path.join(OUT, "gu_summary.json"), gu_rows)

    # complexes traded in the recent window
    cx = defaultdict(list)
    for t in trades:
        if t[3] in six: cx[(t[0], t[1], t[2])].append(t)
    apt_rows = []
    for (gu, dong, apt), v in cx.items():
        p = [t[7] for t in v]; mp = med(p)
        fit = "지금 예산" if mp <= NOW_MAX else "결혼 후 예산" if LATER_MIN <= mp <= LATER_MAX else "그 사이" if mp < LATER_MIN else "예산 초과"
        apt_rows.append({"id": f"{gu} {dong} {apt}", "gu": gu, "dong": dong, "apt": apt, "build_year": v[0][8], "trades_6m": len(v), "median_price_10k": mp, "min_price_10k": min(p), "max_price_10k": max(p),
                         "median_area_sqm": round(st.median([t[5] for t in v])), "last_trade": max(t[4] for t in v), "fit": fit})
    geo, hd = geocode_new(apt_rows, kakao_key)
    for a in apt_rows:
        g = geo.get(a["id"]); h = hd.get(a["id"])
        if g: a["lon"], a["lat"] = g["lon"], g["lat"]
        if h: a["hcode"] = h["hcode"]
    save(os.path.join(OUT, "apts.json"), apt_rows)

    # 법정동 summary with apartment-density class
    dgeo = load(os.path.join(OUT, "dong_geo.json"), [])
    def ring_area(r):
        lat0 = sum(c[1] for c in r) / len(r); kx = 111320 * math.cos(math.radians(lat0))
        return abs(sum(r[i][0] * kx * r[i - 1][1] * 110574 - r[i - 1][0] * kx * r[i][1] * 110574 for i in range(len(r)))) / 2
    area = {}
    for g_ in dgeo:
        pp = [g_["geometry"]["coordinates"]] if g_["geometry"]["type"] == "Polygon" else g_["geometry"]["coordinates"]
        area[g_["id"]] = area.get(g_["id"], 0) + sum(ring_area(p[0]) for p in pp) / 1e6
    d12 = set(W["p12"][0]) | {W["cur"]}
    dd = defaultdict(list)
    for t in trades: dd[f"{t[0]} {t[1]}"].append(t)
    dong_rows = []
    for key, v in dd.items():
        s_ = [t for t in v if t[3] in six]
        if not s_: continue
        y = [t for t in v if t[3] in d12]; ncx = len({t[2] for t in y}); a = area.get(key)
        dens = round(len(y) / a, 1) if a else None
        zone = "아파트 드묾" if (len(y) < 20 or ncx < 3) else "아파트 밀집" if (len(y) >= 100 and (dens or 0) >= 100) else "아파트 일부"
        dong_rows.append({"id": key, "gu": key.split()[0], "dong": key.split(" ", 1)[1], "trades_6m": len(s_), "trades_12m": len(y), "complexes_12m": ncx, "area_km2": round(a, 2) if a else None, "trades_per_km2": dens, "apt_zone": zone,
                          "price_per_sqm_10k": med([t[7] / t[5] for t in s_]), "median_84_10k": med([t[7] for t in s_ if 75 <= t[5] <= 90]), "median_59_10k": med([t[7] for t in s_ if 50 <= t[5] < 65]),
                          "share_now_band_pct": round(sum(t[7] <= NOW_MAX for t in s_) / len(s_) * 100, 1), "share_later_band_pct": round(sum(LATER_MIN <= t[7] <= LATER_MAX for t in s_) / len(s_) * 100, 1), "commute_min_est": COMMUTE[key.split()[0]]})
    save(os.path.join(OUT, "dong_summary.json"), dong_rows)

    # region insights (same-complex-and-size change; neighbourhoods need ≥10 pairs)
    hnames = {r["code"]: (r["gu"], r["hdong"]) for r in load(os.path.join(OUT, "hdong_geo.json"), [])}
    coord = {a["id"]: (a.get("lon"), a.get("lat")) for a in apt_rows}
    reg = defaultdict(list); cent = defaultdict(lambda: [0.0, 0.0, 0])
    for t in trades:
        aid = f"{t[0]} {t[1]} {t[2]}"; h = hd.get(aid)
        keys = [("gu", t[0]), ("bdong", f"{t[0]} {t[1]}")] + ([("hdong", h["hcode"])] if h and h["hcode"] in hnames else [])
        for kk in keys:
            reg[kk].append((t[3], t[5], t[7], f"{t[2]}|{round(t[5])}"))
            c = coord.get(aid)
            if c and c[0] is not None: cc = cent[kk]; cc[0] += c[0]; cc[1] += c[1]; cc[2] += 1
    rent_reg = defaultdict(list)
    for x in rents: rent_reg[("gu", x[0])].append((x[3], x[4])); rent_reg[("bdong", f"{x[0]} {x[1]}")].append((x[3], x[4]))
    BANDS = [("s", lambda a: a < 60), ("m", lambda a: 60 <= a <= 85), ("l", lambda a: a > 85)]
    def unit_chg(c, q, n):
        a, b = defaultdict(list), defaultdict(list)
        for r in c: a[r[3]].append(r[2])
        for r in q: b[r[3]].append(r[2])
        ratios = [st.median(a[k]) / st.median(b[k]) for k in a.keys() & b.keys()]
        return round((st.median(ratios) - 1) * 100, 1) if len(ratios) >= n else None
    ins = {"gu": {}, "bdong": {}, "hdong": {}}
    for (lv, key), rows in reg.items():
        n_min = 5 if lv == "gu" else 10
        rec_ = {"name": key} if lv == "gu" else {"name": key.split(" ", 1)[1], "gu": key.split(" ", 1)[0]} if lv == "bdong" else {"gu": hnames[key][0], "name": hnames[key][1]}
        for p in ("p3", "p6", "p12"):
            cw, pw = set(W[p][0]), set(W[p][1]); c = [r for r in rows if r[0] in cw]; q = [r for r in rows if r[0] in pw]
            d = {"n": len(c), "n_prev": len(q), "vol_chg": round((len(c) - len(q)) / len(q) * 100, 1) if len(c) >= 5 and len(q) >= 5 else None,
                 "ppp": med([r[2] / r[1] * PY for r in c]), "ppp_prev": med([r[2] / r[1] * PY for r in q]), "chg": unit_chg(c, q, n_min), "p84": med([r[2] for r in c if 75 <= r[1] <= 90]), "q": quant([r[2] for r in c]),
                 "fit_now": round(sum(r[2] <= NOW_MAX for r in c) / len(c) * 100, 1) if c else None, "fit_later": round(sum(LATER_MIN <= r[2] <= LATER_MAX for r in c) / len(c) * 100, 1) if c else None, "bands": {}}
            for b, ok in BANDS:
                bc = [r for r in c if ok(r[1])]; bq = [r for r in q if ok(r[1])]
                d["bands"][b] = {"share": round(len(bc) / len(c) * 100, 1) if c else 0, "ppp": med([r[2] / r[1] * PY for r in bc]), "chg": unit_chg(bc, bq, n_min), "n": len(bc)}
            rec_[p] = d
        rr = rent_reg.get((lv, key), []); s6 = [r for r in rows if r[0] in set(W["p6"][0])]
        if len(rr) >= 5 and len(s6) >= 5:
            rec_["jeonse_ratio"] = round(st.median([d / a for a, d in rr]) / st.median([r[2] / r[1] for r in s6]) * 100, 1); rec_["jeonse_ppp"] = round(st.median([d / a for a, d in rr]) * PY)
        bm = defaultdict(list)
        for r in rows: bm[r[0]].append(r[2] / r[1] * PY)
        rec_["series"] = [[m, len(bm[m]), med(bm[m])] for m in W["months24"]]
        cc = cent.get((lv, key))
        if cc and cc[2]: rec_["center"] = [round(cc[0] / cc[2], 5), round(cc[1] / cc[2], 5)]
        ins[lv][key] = rec_
    ins["meta"] = {"as_of": dt.date.today().isoformat(), "last_complete": last, "partial": W["cur"],
                   "notes": {p: f"{span(W[p][0])} vs {span(W[p][1])}" for p in ("p3", "p6", "p12")}}
    save(os.path.join(OUT, "insights.json"), ins)

    # per-complex detail: per-size prices, 2-year high, jeonse
    tr = defaultdict(list)
    for t in trades: tr[f"{t[0]} {t[1]} {t[2]}"].append((t[4], t[5], t[6], t[7]))
    rn = defaultdict(list)
    for x in rents: rn[f"{x[0]} {x[1]} {x[2]}"].append((x[3], x[4]))
    six_start = f"{W['six'][0][:4]}-{W['six'][0][4:]}-01"; rec_start = f"{W['p3'][0][0][:4]}-{W['p3'][0][0][4:]}-01"
    detail, highs, hist = {}, [], {}
    for a in apt_rows:
        rows = sorted(tr[a["id"]]); hist[a["id"]] = [[d, round(ar, 1), fl, p] for d, ar, fl, p in reversed(rows)]
        ba = defaultdict(list)
        for r in rows: ba[round(r[1])].append(r)
        areas, high = [], False
        for ar, rs in sorted(ba.items()):
            recent = [r for r in rs if r[0] >= six_start]; lst = rs[-1]; pmax = max((r[3] for r in rs[:-1]), default=None)
            nh = bool(pmax and lst[3] > pmax and lst[0] >= rec_start and len(rs) >= 3)
            if nh: high = True; highs.append({"id": a["id"], "area": ar, "price": lst[3], "prev_max": pmax, "date": lst[0], "jump": lst[3] - pmax, "name": a["apt"], "gu": a["gu"]})
            jr = [d for ra, d in rn[a["id"]] if abs(ra - ar) <= 3]; mp = med([r[3] for r in recent]) or lst[3]
            areas.append({"a": ar, "n": len(rs), "n6": len(recent), "med": med([r[3] for r in recent]), "last": lst[3], "last_date": lst[0], "last_floor": lst[2], "max": max(r[3] for r in rs),
                          "max_date": max(rs, key=lambda r: r[3])[0], "min": min(r[3] for r in rs), "jeonse": med(jr), "jeonse_n": len(jr), "jeonse_ratio": round(med(jr) / mp * 100, 1) if jr and mp else None, "high": nh})
        detail[a["id"]] = {"areas": areas, "high": high}
    save(os.path.join(OUT, "apt_detail.json"), detail); save(os.path.join(OUT, "trades.json"), hist)

    # complex basics from K-apt (matched by name in the same 법정동, else nearby + shared name)
    basic = load(os.path.join(STATIC, "apt_basic.json"), []); kgeo = load(os.path.join(RAW, "geocode_kapt.json"), {})
    for b in basic:
        g_ = kgeo.get(b["kaptCode"])
        if g_: b["lon"], b["lat"] = g_["lon"], g_["lat"]
    norm = lambda s: re.sub(r"\(.*?\)|아파트|apt|[\s\-·.,]", "", (s or "").lower())
    bd = defaultdict(list)
    for b in basic: bd[(b["gu"], b["dong"])].append(b)
    def dist(a, b): return 6371000 * math.hypot(math.radians(b["lon"] - a["lon"]) * math.cos(math.radians(a["lat"])), math.radians(b["lat"] - a["lat"]))
    info = {}
    for a in apt_rows:
        n = norm(a["apt"]); cands = bd.get((a["gu"], a["dong"]), [])
        hit = next((b for b in cands if norm(b["name"]) == n), None) or next((b for b in cands if n and (n in norm(b["name"]) or norm(b["name"]) in n)), None)
        if not hit and a.get("lon") is not None:
            near = sorted(((dist(a, b), b) for b in basic if b.get("lon") is not None and abs(b["lat"] - a["lat"]) < 0.003 and abs(b["lon"] - a["lon"]) < 0.004), key=lambda x: x[0])
            hit = next((b for d, b in near if d <= 200 and any(n[i:i + 2] in norm(b["name"]) for i in range(len(n) - 1))), None)
        if hit: info[a["id"]] = {k: hit.get(k) for k in ("kaptCode", "name", "households", "buildings", "approval", "builder", "heating", "hall", "parking", "floors_max", "units_le60", "units_60_85", "units_85_135", "units_gt135", "sale_type", "rental_units")}
    save(os.path.join(OUT, "apt_info.json"), info)

    # auto-written market summary
    seoul = {r["month"].replace("-", ""): r["trades"] for r in monthly if r["gu"] == "서울 전체"}
    lm, pm = last, ym_add(last, -1)
    avg = round(st.mean(v for k, v in seoul.items() if k != W["cur"]))
    g3 = [(k, v["p3"]) for k, v in ins["gu"].items() if v["p3"]["chg"] is not None]
    up = sorted(g3, key=lambda x: -x[1]["chg"])[:3]; dn = sorted(g3, key=lambda x: x[1]["chg"])[:3]
    d3 = [(k, v["p3"]) for k, v in ins["hdong"].items() if v["p3"]["chg"] is not None and v["p3"]["n"] >= 20]; dup = sorted(d3, key=lambda x: -x[1]["chg"])[:3]
    busy = sorted(((a, sum(1 for r in tr[a["id"]] if r[0] >= rec_start)) for a in apt_rows), key=lambda x: -x[1])[:3]
    highs.sort(key=lambda h: -h["jump"])
    js = sorted([(k, v["jeonse_ratio"]) for k, v in ins["gu"].items() if v.get("jeonse_ratio")], key=lambda x: -x[1])
    rates = load(os.path.join(OUT, "rates.json"), []); redev = load(os.path.join(OUT, "redev.json"), [])
    near = [v["p3"] for k, v in ins["gu"].items() if COMMUTE.get(k, 99) <= 45 and v["p3"]["n"]]
    fit_share = round(sum(p["fit_later"] * p["n"] for p in near) / sum(p["n"] for p in near), 1) if near else None
    year0 = f"{last[:4]}-01-01"
    staged = [z for z in redev if (z.get("updated") or "") >= year0 and z.get("stage") in ("사업시행인가", "관리처분인가", "이주·철거·착공")]
    rs = span(W["p3"][0])
    b = [("거래", f"{mlabel(lm)} 서울 아파트 매매는 {seoul[lm]:,}건으로 {mlabel(pm)}({seoul[pm]:,}건)보다 {abs(round((seoul[lm]-seoul[pm])/seoul[pm]*100,1))}% {'늘었' if seoul[lm]>seoul[pm] else '줄었'}고, 최근 평균({avg:,}건)의 {round(seoul[lm]/avg*100)}% 수준입니다."),
         ("가격", f"{rs} 같은 단지·평형 기준으로 가장 많이 오른 구는 {', '.join(f'{k} {v['chg']:+.1f}%' for k, v in up)}이고, 가장 약한 곳은 {', '.join(f'{k} {v['chg']:+.1f}%' for k, v in dn)}입니다.")]
    if dup: b.append(("동네", f"행정동 기준(거래 20건 이상)으로는 {', '.join(f'{ins['hdong'][k]['gu']} {ins['hdong'][k]['name']} {v['chg']:+.1f}%' for k, v in dup)}가 가장 많이 올랐습니다."))
    b.append(("인기 단지", f"{rs} 거래가 가장 많은 단지는 {', '.join(f'{a['apt']}({a['gu']}·{n}건)' for a, n in busy)}입니다."))
    if highs: b.append(("신고가", f"{rs} 그 단지·평형의 최근 2년 최고가를 넘은 거래는 {len(highs):,}건이고, 가장 크게 오른 곳은 {highs[0]['name']} {highs[0]['area']}㎡ {won(highs[0]['prev_max'])} → {won(highs[0]['price'])}입니다."))
    if js: b.append(("전세", f"전세가율이 가장 높은 구는 {js[0][0]} {js[0][1]}%, 가장 낮은 구는 {js[-1][0]} {js[-1][1]}%입니다. 높을수록 매매가 대비 전세가 비쌉니다."))
    if len(rates) >= 2: b.append(("금리", f"주담대 평균 금리는 {rates[-1]['month']} {rates[-1]['mortgage_pct']:.2f}%로 전월보다 {rates[-1]['mortgage_pct']-rates[-2]['mortgage_pct']:+.2f}%p, 기준금리는 {rates[-1]['base_pct']:.2f}%입니다."))
    b.append(("정비사업", f"올해 사업시행인가 이후 단계로 넘어간 재개발·정비구역은 {len(staged)}곳입니다."))
    save(os.path.join(OUT, "market.json"), {"period": f"{span(W['p3'][0])} ({mlabel(W['cur'])}은 집계 중)", "as_of": dt.date.today().isoformat(), "bullets": [{"tag": t, "text": x} for t, x in b], "highs": highs[:10]}, pretty=True)
    print(f"build: {len(apt_rows):,} complexes ({sum(1 for a in apt_rows if a.get('lon') is not None):,} located), {len(info):,} with K-apt basics, {len(highs):,} record highs; window {W['p3'][0][0]}~{last}")

def sgg_of(code):
    """Boundary key and display name. 화성시 split into 4 구 in 2026, after the boundary file, so its 구 roll up to 화성시."""
    if code.startswith("4159"): return "41590", "화성시"
    return code, REGIONS[code]

def build_metro(raw, W, kakao_key):
    """서울+경기 view: 시군구 / 행정동 insights, complexes, per-complex detail for Gyeonggi."""
    trades, rents = [], []
    for k, v in raw["trades"].items():
        code, ym = k.split("_")
        if code not in REGIONS: continue
        sgg, name = sgg_of(code)
        for i in v["items"]:
            if i.get("price_10k") and i.get("area_sqm"): trades.append((sgg, name, i["dong"], i["apt_name"], ym, i["trade_date"], i["area_sqm"], i.get("floor"), i["price_10k"], i.get("build_year")))
    for k, v in raw["rents"].items():
        code = k.split("_")[0]
        if code not in REGIONS: continue
        sgg, name = sgg_of(code)
        for i in v["items"]:
            if not i.get("monthly_rent_10k") and i.get("deposit_10k") and i.get("area_sqm"): rents.append((sgg, i["dong"], i.get("unit_name", ""), i["area_sqm"], i["deposit_10k"]))
    six, rec_start = set(W["six"]), f"{W['p3'][0][0][:4]}-{W['p3'][0][0][4:]}-01"
    six_start = f"{W['six'][0][:4]}-{W['six'][0][4:]}-01"
    # complexes (Seoul ids stay "구 동 단지" so they share geocodes and detail with the Seoul view)
    cx = defaultdict(list)
    for t in trades:
        if t[4] in six: cx[(t[0], t[1], t[2], t[3])].append(t)
    apts = []
    for (sgg, name, dong, apt), v in cx.items():
        p = [t[8] for t in v]; mp = med(p)
        apts.append({"id": f"{name} {dong} {apt}", "sido": sgg[:2], "sgg": sgg, "gu": name, "dong": dong, "apt": apt, "build_year": v[0][9], "trades_6m": len(v), "median_price_10k": mp,
                     "min_price_10k": min(p), "max_price_10k": max(p), "median_area_sqm": round(st.median([t[6] for t in v])), "last_trade": max(t[5] for t in v),
                     "fit": "지금 예산" if mp <= NOW_MAX else "결혼 후 예산" if LATER_MIN <= mp <= LATER_MAX else "그 사이" if mp < LATER_MIN else "예산 초과"})
    geo, hd = geocode_new(apts, kakao_key)
    for a in apts:
        g = geo.get(a["id"]); h = hd.get(a["id"])
        if g: a["lon"], a["lat"] = g["lon"], g["lat"]
        if h: a["hcode"] = h["hcode"]
    save(os.path.join(OUT, "metro_apts.json"), apts)
    # regions
    hgeo = load(os.path.join(OUT, "metro_hdong_geo.json"), []); hnames = {h["code"]: (h["sgg"], h["name"]) for h in hgeo}
    sgg_names = {code: sgg_of(code)[1] for code in REGIONS}
    by_id = {a["id"]: a for a in apts}
    reg = defaultdict(list); cent = defaultdict(lambda: [0.0, 0.0, 0]); rent_reg = defaultdict(list)
    for t in trades:
        a = by_id.get(f"{t[1]} {t[2]} {t[3]}"); keys = [("sgg", t[0])]
        if a and a.get("hcode") in hnames: keys.append(("hdong", a["hcode"]))
        for kk in keys:
            reg[kk].append((t[4], t[6], t[8], f"{t[3]}|{round(t[6])}"))
            if a and a.get("lon") is not None: c = cent[kk]; c[0] += a["lon"]; c[1] += a["lat"]; c[2] += 1
    for x in rents: rent_reg[("sgg", x[0])].append((x[3], x[4]))
    BANDS = [("s", lambda a: a < 60), ("m", lambda a: 60 <= a <= 85), ("l", lambda a: a > 85)]
    def unit_chg(c, q, n):
        a, b = defaultdict(list), defaultdict(list)
        for r in c: a[r[3]].append(r[2])
        for r in q: b[r[3]].append(r[2])
        ratios = [st.median(a[k]) / st.median(b[k]) for k in a.keys() & b.keys()]
        return round((st.median(ratios) - 1) * 100, 1) if len(ratios) >= n else None
    ins = {"sgg": {}, "hdong": {}}
    for (lv, key), rows in reg.items():
        n_min = 5 if lv == "sgg" else 10
        rec = {"name": sgg_names.get(key, key), "sido": key[:2]} if lv == "sgg" else {"name": hnames[key][1], "gu": sgg_names.get(hnames[key][0], ""), "sgg": hnames[key][0], "sido": key[:2]}
        for p in ("p3", "p6", "p12"):
            cw, pw = set(W[p][0]), set(W[p][1]); c = [r for r in rows if r[0] in cw]; q = [r for r in rows if r[0] in pw]
            d = {"n": len(c), "n_prev": len(q), "vol_chg": round((len(c) - len(q)) / len(q) * 100, 1) if len(c) >= 5 and len(q) >= 5 else None,
                 "ppp": med([r[2] / r[1] * PY for r in c]), "chg": unit_chg(c, q, n_min), "p84": med([r[2] for r in c if 75 <= r[1] <= 90]), "q": quant([r[2] for r in c]),
                 "fit_now": round(sum(r[2] <= NOW_MAX for r in c) / len(c) * 100, 1) if c else None, "fit_later": round(sum(LATER_MIN <= r[2] <= LATER_MAX for r in c) / len(c) * 100, 1) if c else None, "bands": {}}
            for b, ok in BANDS:
                bc = [r for r in c if ok(r[1])]; bq = [r for r in q if ok(r[1])]
                d["bands"][b] = {"share": round(len(bc) / len(c) * 100, 1) if c else 0, "ppp": med([r[2] / r[1] * PY for r in bc]), "chg": unit_chg(bc, bq, n_min), "n": len(bc)}
            rec[p] = d
        rr = rent_reg.get((lv, key), []); s6 = [r for r in rows if r[0] in set(W["p6"][0])]
        if len(rr) >= 5 and len(s6) >= 5:
            rec["jeonse_ratio"] = round(st.median([d / a for a, d in rr]) / st.median([r[2] / r[1] for r in s6]) * 100, 1); rec["jeonse_ppp"] = round(st.median([d / a for a, d in rr]) * PY)
        bm = defaultdict(list)
        for r in rows: bm[r[0]].append(r[2] / r[1] * PY)
        rec["series"] = [[m, len(bm[m]), med(bm[m])] for m in W["months24"]]
        cc = cent.get((lv, key))
        if cc and cc[2]: rec["center"] = [round(cc[0] / cc[2], 5), round(cc[1] / cc[2], 5)]
        ins[lv][key] = rec
    ins["meta"] = {"as_of": dt.date.today().isoformat(), "notes": {p: f"{span(W[p][0])} vs {span(W[p][1])}" for p in ("p3", "p6", "p12")}}
    save(os.path.join(OUT, "metro_insights.json"), ins)
    # per-complex detail and trade history for Gyeonggi complexes (Seoul ones already live in apt_detail.json)
    tr = defaultdict(list)
    for t in trades:
        if t[0][:2] == "41": tr[f"{t[1]} {t[2]} {t[3]}"].append((t[5], t[6], t[7], t[8]))
    rn = defaultdict(list)
    for x in rents:
        if x[0][:2] == "41": rn[f"{sgg_names.get(x[0], '')} {x[1]} {x[2]}"].append((x[3], x[4]))
    detail, hist = {}, {}
    for a in apts:
        if a["sido"] != "41": continue
        rows = sorted(tr[a["id"]]); hist[a["id"]] = [[d, round(ar, 1), fl, p] for d, ar, fl, p in reversed(rows)]
        ba = defaultdict(list)
        for r in rows: ba[round(r[1])].append(r)
        areas, high = [], False
        for ar, rs in sorted(ba.items()):
            recent = [r for r in rs if r[0] >= six_start]; lst = rs[-1]; pmax = max((r[3] for r in rs[:-1]), default=None)
            nh = bool(pmax and lst[3] > pmax and lst[0] >= rec_start and len(rs) >= 3); high = high or nh
            jr = [d for ra, d in rn[a["id"]] if abs(ra - ar) <= 3]; mp = med([r[3] for r in recent]) or lst[3]
            areas.append({"a": ar, "n": len(rs), "n6": len(recent), "med": med([r[3] for r in recent]), "last": lst[3], "last_date": lst[0], "last_floor": lst[2], "max": max(r[3] for r in rs),
                          "max_date": max(rs, key=lambda r: r[3])[0], "min": min(r[3] for r in rs), "jeonse": med(jr), "jeonse_n": len(jr), "jeonse_ratio": round(med(jr) / mp * 100, 1) if jr and mp else None, "high": nh})
        detail[a["id"]] = {"areas": areas, "high": high}
    save(os.path.join(OUT, "apt_detail_gg.json"), detail); save(os.path.join(OUT, "trades_gg.json"), hist)
    print(f"metro: {len(apts):,} complexes ({sum(1 for a in apts if a.get('lon') is not None):,} located), {len(ins['sgg'])} 시군구, {len(ins['hdong'])} 행정동")

if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("--no-fetch", action="store_true"); ap.add_argument("--today", help="YYYY-MM-DD, for testing"); args = ap.parse_args()
    today = dt.date.fromisoformat(args.today) if args.today else dt.date.today()
    W = windows(today)
    key = os.environ.get("DATA_GO_KR_API_KEY")
    if args.no_fetch: raw = load(os.path.join(RAW, "molit.json.gz"))
    elif not key: sys.exit("DATA_GO_KR_API_KEY is not set (use --no-fetch to rebuild from data/raw)")
    else: raw = fetch(W, key)
    build(raw, W, os.environ.get("KAKAO_REST_KEY"))
    build_metro(raw, W, os.environ.get("KAKAO_REST_KEY"))
