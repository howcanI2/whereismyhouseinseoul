"""학군 part 2: 학원 밀집도 (나이스) and 학교 지표 (학교알리미) → web/public/data/school_stats.json + edu_region.json.

    python scripts/fetch_edu.py

- 학원: 나이스 교육정보 개방 포털 학원교습소정보 (NEIS_API_KEY), 서울·경기, 개원 중인 입시·검정·보습 and 국제화(어학) academies.
  Each is placed once by its road address with 브이월드 (VWORLD_API_KEY; cached in data/raw/vworld_geo.json) to get
  its 행정동, then counted per 구 / 법정동 / 행정동 / 시군구, and per 1,000 residents aged 10–19 where population is known.
- 학교: 학교알리미 OpenAPI (SCHOOLINFO_API_KEY), 초·중학교 학년별·학급별 학생수 (09) and 전·출입 학생 수 (10) for the latest
  공시 year; matched to the 학구도 school ids in school.json by name within the same 시도.
- 학군 지표: per region, the mean percentile of 학원 밀도, 초등학교 400 m 단지 비율 and 배정 초등학교 순전입률 (a relative score, 0–100).
"""
import datetime as dt, json, os, re, sys, time, urllib.parse, urllib.request
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from vgeo import Geo
# keys for local runs live in <repo>/.env (gitignored); CI passes them as real environment variables
if os.path.exists(os.path.join(ROOT, ".env")):
    for _l in open(os.path.join(ROOT, ".env"), encoding="utf-8-sig"):
        if "=" in _l and not _l.lstrip().startswith("#"): os.environ.setdefault(*[s.strip() for s in _l.split("=", 1)])
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from refresh import GG, GU, sgg_of  # noqa: E402  (region codes)

RAW, STATIC, OUT = os.path.join(ROOT, "data", "raw"), os.path.join(ROOT, "data", "static"), os.path.join(ROOT, "web", "public", "data")
REALMS = ("입시.검정 및 보습", "국제화")
load = lambda p, d=None: json.load(open(p, encoding="utf-8")) if os.path.exists(p) else d

def get_json(url, headers=None, tries=3):
    for t in range(tries):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=headers or {}), timeout=90) as r: return json.loads(r.read().decode("utf-8", "replace"))
        except Exception as e:
            err = e; time.sleep(2 + t * 2)
    raise RuntimeError(err)

# ---------------- 학원 ----------------
def academies(key):
    out = []
    for office in ("B10", "J10"):  # 서울, 경기 교육청
        page = 1
        while True:
            j = get_json("https://open.neis.go.kr/hub/acaInsTiInfo?" + urllib.parse.urlencode({"KEY": key, "Type": "json", "pIndex": page, "pSize": 1000, "ATPT_OFCDC_SC_CODE": office}))
            body = j.get("acaInsTiInfo")
            if not body: break
            rows = body[1]["row"]
            out += [r for r in rows if r.get("REG_STTUS_NM") == "개원" and r.get("REALM_SC_NM") in REALMS]
            if page * 1000 >= body[0]["head"][0]["list_total_count"]: break
            page += 1
    return out

def place(rows, G):
    """road address → [lon, lat, 행정동 code, 법정동 name] via 브이월드 (cached in data/raw/vworld_geo.json)"""
    out = {}
    for r in rows:
        a = (r.get("FA_RDNMA") or "").strip()
        if not a or a in out: continue
        d = G.safe(G.road, a)
        out[a] = [round(d["lon"], 5), round(d["lat"], 5), d.get("hcode"), d.get("bdong")] if d else None
        if G.calls and G.calls % 1000 == 0: print(f"edu: {G.calls} academy addresses placed", flush=True)
    G.save()
    return out

# ---------------- 학교알리미 ----------------
def schoolinfo(key):
    """{(sido, name): {"n": students, "cls": 학급당 학생수, "in": 전입, "out": 전출}} for 초(02)·중(03), latest year with data"""
    sggs = [("11", c) for c in GU] + [("41", c) for c in GG] + [("41", "41590")]
    res, year = {}, None
    for yr in (str(dt.date.today().year), str(dt.date.today().year - 1)):
        probe = get_json("https://www.schoolinfo.go.kr/openApi.do?" + urllib.parse.urlencode({"apiKey": key, "apiType": "09", "pbanYr": yr, "sidoCode": "11", "sggCode": "11110", "schulKndCode": "02"}))
        if probe.get("list"): year = yr; break
    if not year: raise RuntimeError("학교알리미: no 공시 data for this year or last")
    for sido, sgg in sggs:
        for knd in ("02", "03"):
            for t in ("09", "10"):
                j = get_json("https://www.schoolinfo.go.kr/openApi.do?" + urllib.parse.urlencode({"apiKey": key, "apiType": t, "pbanYr": year, "sidoCode": sido, "sggCode": sgg, "schulKndCode": knd}))
                for r in j.get("list") or []:
                    s = res.setdefault((sido, r["SCHUL_NM"]), {})
                    if t == "09": s["n"], s["cls"] = r.get("COL_S_SUM"), r.get("COL_SUM")
                    else: s["in"], s["out"], s["n10"] = r.get("MVIN_SUM"), r.get("MVT_SUM"), r.get("STDNT_SUM")
                time.sleep(0.05)
    return year, res

def pct_rank(vals):
    xs = sorted(v for v in vals.values() if v is not None)
    if not xs: return {}
    return {k: round(sum(x <= v for x in xs) / len(xs) * 100) for k, v in vals.items() if v is not None}

def main():
    nk, sk = os.environ.get("NEIS_API_KEY"), os.environ.get("SCHOOLINFO_API_KEY"); G = Geo()
    school = load(os.path.join(OUT, "school.json"))
    if not school: sys.exit("edu: run fetch_school.py first")
    pop = (load(os.path.join(STATIC, "population_age.json"), {}) or {})
    teen = {c: v[1] for c, v in (pop.get("hdong") or {}).items()}
    teen_sgg = {c: v[1] for c, v in (pop.get("sgg") or {}).items()}
    gu_code = {v: k for k, v in GU.items()}; gg_code = {v: k for k, v in GG.items()}

    # 학원 counts per region
    acad = defaultdict(lambda: defaultdict(int))
    if nk:
        rows = academies(nk); cache = place(rows, G)
        for r in rows:
            g = cache.get((r.get("FA_RDNMA") or "").strip())
            seoul = r["ATPT_OFCDC_SC_CODE"] == "B10"
            m = re.search(r"\(([^,)]+)", r.get("FA_RDNDA") or "")
            bdong = (g[3] if g and g[3] else (m.group(1).strip() if m else None))
            if seoul:
                gu = r.get("ADMST_ZONE_NM"); acad["gu"][gu] += 1; acad["sgg"][gu_code.get(gu)] += 1
                if bdong: acad["bdong"][f"{gu} {bdong}"] += 1
            else:
                t = (r.get("FA_RDNMA") or "").replace("특례시", "시").split()
                nm = " ".join(t[1:3]) if len(t) > 2 and t[2].endswith("구") else (t[1] if len(t) > 1 else "")
                code = gg_code.get(nm) or gg_code.get(t[1] if len(t) > 1 else "")
                if code: acad["sgg"][sgg_of(code)[0]] += 1
            if g and g[2]: acad["hdong"][g[2]] += 1
        print(f"edu: {len(rows):,} 입시·보습·어학 academies, {sum(1 for r in rows if cache.get((r.get('FA_RDNMA') or '').strip())):,} placed")
    else: print("edu: NEIS_API_KEY not set; 학원 counts skipped")

    # 학교알리미 → per 학구도 school id
    stats, year = {}, None
    if sk:
        year, si = schoolinfo(sk)
        norm = lambda s: re.sub(r"\s", "", s or "")
        by_name = {(sd, norm(n)): v for (sd, n), v in si.items()}
        for sid, s in school["schools"].items():
            v = by_name.get((s[6], norm(s[0]))) if len(s) > 6 and s[6] else None
            if not v or not v.get("n"): continue
            net = round(((v.get("in") or 0) - (v.get("out") or 0)) / v["n10"] * 100, 1) if v.get("n10") else None
            stats[sid] = [v.get("n"), v.get("cls"), net]
        print(f"edu: 학교알리미 {year} 공시, {len(si):,} schools fetched, {len(stats):,} matched to 학구도 schools")
    else: print("edu: SCHOOLINFO_API_KEY not set; school stats skipped")
    json.dump({"as_of": dt.date.today().isoformat(), "year": year, "fields": ["학생수", "학급당 학생수", "순전입률(%)"], "schools": stats},
              open(os.path.join(OUT, "school_stats.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))

    # 초등학교 순전입률 per region: the assigned 초등학교 of each complex (families moving in for school show up here first)
    apts = {}
    for f in ("metro_apts.json", "apts.json"):
        for a in load(os.path.join(OUT, f), []) or []:
            if a.get("lon") is not None: apts.setdefault(a["id"], a)
    mid = defaultdict(list)
    for aid, row in school["apts"].items():
        a = apts.get(aid)
        if not a or row[0] is None or row[0] not in stats or stats[row[0]][2] is None: continue
        keys = [("hdong", a.get("hcode")), ("sgg", a.get("sgg"))]
        if a.get("sido", "11") == "11": keys += [("gu", a.get("gu")), ("bdong", f"{a.get('gu')} {a.get('dong')}")]
        for lv, k in keys:
            if k: mid[(lv, k)].append(stats[row[0]][2])

    sr = load(os.path.join(OUT, "school_region.json"), {}) or {}
    region = {"as_of": dt.date.today().isoformat(), "year": year}
    for lv in ("gu", "bdong", "hdong", "sgg"):
        keys = set(acad[lv]) | set((sr.get(lv) or {}).keys())
        tbl = {}
        for k in keys:
            if not k: continue
            t = teen.get(k) if lv == "hdong" else teen_sgg.get(gu_code.get(k)) if lv == "gu" else teen_sgg.get(k) if lv == "sgg" else None
            n = acad[lv].get(k, 0)
            nets = mid.get((lv, k), [])
            tbl[k] = {"acad": n, "acad_per1k": round(n / t * 1000, 1) if t else None, "net": round(sum(nets) / len(nets), 2) if nets else None, "near": (sr.get(lv) or {}).get(k, {}).get("near")}
        # 학군 지표: mean percentile of what is known (학원 밀도 needs population, so 법정동 uses the raw count)
        dens = {k: (v["acad_per1k"] if lv != "bdong" else v["acad"]) for k, v in tbl.items()}
        pr = [pct_rank(dens), pct_rank({k: v["near"] for k, v in tbl.items()}), pct_rank({k: v["net"] for k, v in tbl.items()})]
        for k, v in tbl.items():
            ps = [p[k] for p in pr if k in p]
            v["score"] = round(sum(ps) / len(ps)) if len(ps) >= 2 else None
        region[lv] = tbl
    json.dump(region, open(os.path.join(OUT, "edu_region.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"edu: regions {', '.join(f'{lv} {len(region[lv])}' for lv in ('gu', 'bdong', 'hdong', 'sgg'))}")

if __name__ == "__main__":
    main()
