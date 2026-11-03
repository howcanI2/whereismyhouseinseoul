"""건축물대장 for complexes K-apt does not list (mostly small ones under the 의무관리 threshold) → web/public/data/apt_small.json.

    python scripts/fetch_small_bldg.py [--limit 4000]

K-apt only covers 의무관리 complexes, so about half of the traded complexes have no 세대수·동수·사용승인. For those this finds
the complex's parcel (the PNU of the 지번 its sales report, placed by 브이월드 in refresh.py → data/raw/pnu_apts.json) and reads the 건축물대장
(공공데이터포털 건축HUB, DATA_GO_KR_API_KEY; 표제부 first, 총괄표제부 only when there are several buildings). A parcel whose
register has no 공동주택/아파트 row is dropped (often an 오피스텔 or a 도시형 생활주택 filed as 업무·근린시설). Cached in data/raw/bldg_small.json,
refreshed yearly; Seoul first. Stops on the daily API limit and resumes the next run.

items[단지 id] = {households, buildings, approval, floors_max, parking, far, name (대장 건물명)}
"""
import argparse, datetime as dt, json, os, sys, time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_bldg import RAW, OUT, items, load, summarize  # also loads <repo>/.env

HOME = ("공동주택", "아파트", "연립", "다세대")

def lookup(pnu, key):
    titles = items("getBrTitleInfo", key, pnu)
    home = [t for t in titles if any(h in (t.get("mainPurpsCdNm") or "") for h in HOME)]
    if not home: return {"miss": True}, 1
    recap, calls = [], 1
    if len(home) > 1: recap = items("getBrRecapTitleInfo", key, pnu); calls += 1
    v = summarize(recap, home) or {}
    day = min((t.get("useAprDay") or "").strip() for t in home) or ""
    return {"hh": v.get("hh"), "dongs": len(home), "approval": f"{day[:4]}-{day[4:6]}-{day[6:8]}" if len(day) == 8 else None, "floors": v.get("floors"),
            "park": v.get("park"), "far": v.get("far"), "name": (home[0].get("bldNm") or "").strip()}, calls

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--limit", type=int, default=4000); args = ap.parse_args()
    key = os.environ.get("DATA_GO_KR_API_KEY"); pnus = load(os.path.join(RAW, "pnu_apts.json"), {}) or {}
    info = {**load(os.path.join(OUT, "apt_info.json"), {}), **load(os.path.join(OUT, "apt_info_gg.json"), {})}
    seoul = load(os.path.join(OUT, "apts.json"), []) or []
    metro = [a for a in load(os.path.join(OUT, "metro_apts.json"), []) or [] if a.get("sido", "11") != "11"]
    want = [a for a in seoul + metro if a["id"] not in info and a.get("lon") is not None]  # Seoul first
    cp = os.path.join(RAW, "bldg_small.json"); cache = load(cp, {}) or {}
    stale = (dt.date.today() - dt.timedelta(days=365)).isoformat()
    # looked up again when stale, or when the PNU it was found by has changed (the first run placed them by map point)
    todo = [a for a in want if cache.get(a["id"], {}).get("at", "") < stale or cache.get(a["id"], {}).get("pnu") != pnus.get(a["id"])]
    calls = 0
    if not key: print(f"small: DATA_GO_KR_API_KEY not set; {len(todo)} complexes left")
    try:
        for a in todo if key else []:
            if calls + 2 > args.limit: break
            pnu = pnus.get(a["id"])
            if not pnu: cache[a["id"]] = {"at": dt.date.today().isoformat(), "miss": True}; continue
            v, n = lookup(pnu, key); calls += n
            cache[a["id"]] = {"at": dt.date.today().isoformat(), "pnu": pnu, **v}
            if calls % 500 < 2: json.dump(cache, open(cp, "w", encoding="utf-8"), ensure_ascii=False); print(f"small: {calls} calls", flush=True)
            time.sleep(0.05)
    except RuntimeError as e:
        print("small: stopped:", e)
    json.dump(cache, open(cp, "w", encoding="utf-8"), ensure_ascii=False)
    ids = {a["id"] for a in want}
    out = {k: {"households": v["hh"], "buildings": v["dongs"], "approval": v.get("approval"), "floors_max": v.get("floors"), "parking": v.get("park"),
               "far": v.get("far"), "name": v.get("name")} for k, v in cache.items() if k in ids and not v.get("miss") and v.get("hh") and v.get("pnu") == pnus.get(k)}
    json.dump({"as_of": dt.date.today().isoformat(), "source": "건축물대장 (실거래 지번의 필지)", "items": out},
              open(os.path.join(OUT, "apt_small.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    left = sum(1 for a in want if a["id"] not in cache)
    print(f"small: {calls} API calls this run, {len(out):,} complexes with 세대수, {left:,} left")

if __name__ == "__main__":
    main()
