"""Mortgage and base rates from the Bank of Korea ECOS API → web/public/data/rates.json.

    python scripts/rates_ecos.py          # ECOS_API_KEY if set, else the public "sample" key (10 rows per call)

Series: 121Y006 예금은행 신규취급액 가중평균금리 (주담대 / 고정형 / 변동형 / 가계대출), 722Y001 한국은행 기준금리.
"""
import datetime as dt, json, os, time, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# keys for local runs live in <repo>/.env (gitignored); CI passes them as real environment variables
if os.path.exists(os.path.join(ROOT, ".env")):
    for _l in open(os.path.join(ROOT, ".env"), encoding="utf-8"):
        if "=" in _l and not _l.lstrip().startswith("#"): os.environ.setdefault(*[s.strip() for s in _l.split("=", 1)])
OUT = os.path.join(ROOT, "web", "public", "data", "rates.json")
KEY = os.environ.get("ECOS_API_KEY") or "sample"
SERIES = {"mortgage_pct": ("121Y006", "BECBLA0302"), "fixed_pct": ("121Y006", "BECBLA030201"), "variable_pct": ("121Y006", "BECBLA030202"),
          "household_pct": ("121Y006", "BECBLA03"), "base_pct": ("722Y001", "0101000")}

def months(a, b):
    y, m = int(a[:4]), int(a[4:]); out = []
    while f"{y}{m:02d}" <= b:
        out.append(f"{y}{m:02d}"); m += 1
        if m > 12: y, m = y + 1, 1
    return out

def fetch(stat, item, start, end):
    vals, ms = {}, months(start, end)
    for i in range(0, len(ms), 10):  # the sample key returns at most 10 rows per request
        a, b = ms[i], ms[min(i + 9, len(ms) - 1)]
        url = f"https://ecos.bok.or.kr/api/StatisticSearch/{KEY}/json/kr/1/10/{stat}/M/{a}/{b}/{item}"
        for t in range(3):
            try:
                with urllib.request.urlopen(url, timeout=30) as r: j = json.load(r); break
            except Exception:
                time.sleep(2 + t)
        else:
            raise RuntimeError(f"ECOS {stat}/{item} {a}-{b} failed")
        for row in (j.get("StatisticSearch") or {}).get("row", []):
            vals[row["TIME"]] = float(row["DATA_VALUE"])
        time.sleep(0.3)
    return vals

def main():
    today = dt.date.today()
    end = f"{today.year}{today.month:02d}"
    start = f"{today.year - 2}{today.month:02d}"
    data = {k: fetch(s, i, start, end) for k, (s, i) in SERIES.items()}
    rows = [{"month": f"{m[:4]}-{m[4:]}", **{k: data[k].get(m) for k in SERIES}} for m in months(start, end) if m in data["mortgage_pct"]]
    last = None  # base rate is a level; carry it forward for months ECOS has not posted yet
    for r in rows:
        if r["base_pct"] is None: r["base_pct"] = last
        last = r["base_pct"]
    if len(rows) < 6: raise SystemExit(f"ECOS returned only {len(rows)} months; keeping the existing rates.json")
    json.dump(rows, open(OUT, "w", encoding="utf-8"), ensure_ascii=False, indent=0)
    print(f"rates: {len(rows)} months, {rows[0]['month']}~{rows[-1]['month']}, latest 주담대 {rows[-1]['mortgage_pct']}%, 기준금리 {rows[-1]['base_pct']}% (key: {'own' if KEY != 'sample' else 'sample'})")

if __name__ == "__main__":
    main()
