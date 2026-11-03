"""Per-complex answers for the map's yes/no metrics → web/public/data/apt_flags.json (no API calls).

    python scripts/build_apt_flags.py

The map colours regions by shares like "재건축 여유 큰 구축"; this file says which complexes those shares count, so the map
can mark them. Built from files the refresh already wrote: apt_info(_gg).json (단지 id → kaptCode), landuse.json (용도지역,
상한 용적률), bldg.json (지금 용적률), school.json (배정 초등학교까지 거리). Run after fetch_bldg.py and fetch_school.py.

items[단지 id] = [여유 %p (25년 넘은 구축만, else null), 용도지역 묶음 (1종/2종/3종/준주거·상업/기타 or null), 초등학교까지 m (or null), 사용승인 연도 (K-apt; the age rule uses it, not the trade data's 건축연도)]
"""
import datetime as dt, json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "web", "public", "data")
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fetch_landuse import BUCKETS  # same 용도지역 묶음 as the region shares

load = lambda n: json.load(open(os.path.join(OUT, n), encoding="utf-8")) if os.path.exists(os.path.join(OUT, n)) else {}

def main():
    info = {**load("apt_info.json"), **load("apt_info_gg.json")}
    land = load("landuse.json").get("items", {}) or {}
    bldg = load("bldg.json").get("items", {}) or {}
    school = load("school.json").get("apts", {}) or {}
    year = dt.date.today().year
    out = {}
    for aid, b in info.items():
        code = b.get("kaptCode")
        lu, bl = land.get(code) or {}, bldg.get(code)
        age = year - int(b["approval"][:4]) if b.get("approval") else None
        # same rule as fetch_bldg.py's region share: 25년+ and 상한 − 지금 용적률
        room = round(lu["far_max"] - bl[0]) if lu.get("far_max") and bl and bl[0] and age is not None and age >= 25 else None
        zone = lu["zones"][0] if lu.get("zones") else None
        bucket = next((k for k, zs in BUCKETS if zone in zs), "기타") if zone else None
        sch = school.get(aid)
        dist = sch[1] if sch and len(sch) > 1 and sch[1] is not None else None
        if room is not None or bucket or dist is not None: out[aid] = [room, bucket, dist, int(b["approval"][:4]) if b.get("approval") else None]
    json.dump({"as_of": dt.date.today().isoformat(), "fields": ["재건축 여유 %p (25년+)", "용도지역", "초등학교 m", "사용승인 연도"], "items": out},
              open(os.path.join(OUT, "apt_flags.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print(f"flags: {len(out):,} complexes, {sum(1 for v in out.values() if v[0] is not None and v[0] >= 50):,} 구축 with 50%p+ 여유")

if __name__ == "__main__":
    main()
