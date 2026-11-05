"""What real-estate posts are ranking on Naver blog search this week, and which keywords are rising.

Uses the official NAVER API HUB (Naver Cloud Platform): blog search + 검색어 트렌드.
Needs two env vars (GitHub secrets, never in git):  NAVER_API_ID, NAVER_API_KEY
Without them it writes a short note and exits 0, so the weekly draft still goes out.

    python blog/naver_research.py                       # blog/out/research.md
    python blog/naver_research.py --extra 망원동 이문동  # also look up this week's 동/단지
    python blog/naver_research.py --fixture FILE.json    # offline: analyse saved search results

Search 'sim' order is what Naver shows first for the query, so the titles below are the posts
currently winning that query. Trend values are Naver's relative index (0~100), not search counts.
"""
import argparse
import collections
import datetime as dt
import html
import json
import os
import re
import sys
import urllib.parse
import urllib.request

HOST = "https://naverapihub.apigw.ntruss.com"
KST = dt.timezone(dt.timedelta(hours=9))

# queries a 서울 내집마련 reader types; the blog-search pass reads the top posts for each
SEARCH_SEEDS = ["서울 아파트 실거래가", "서울 아파트 신고가", "서울 아파트 급매", "내집마련", "생애최초 주택담보대출",
                "토지거래허가구역 아파트", "서울 아파트 전망", "노원구 아파트", "서울 소형 아파트", "전세가율"]
# 검색어 트렌드: up to 5 groups per call, up to 20 keywords per group
TREND_GROUPS = [
    [("실거래가", ["아파트 실거래가", "실거래가 조회"]), ("신고가", ["아파트 신고가", "신고가"]), ("급매", ["아파트 급매", "급매물"]),
     ("집값 전망", ["집값 전망", "부동산 전망", "아파트 전망"]), ("매물", ["아파트 매물", "매물 증가"])],
    [("내집마련", ["내집마련", "내 집 마련"]), ("주담대", ["주택담보대출", "주담대 금리"]), ("디딤돌", ["디딤돌대출"]),
     ("생애최초", ["생애최초", "생애최초 대출"]), ("토허제", ["토지거래허가구역", "토허제"])],
]
# hook patterns seen in Korean real-estate titles; counted on the collected titles
HOOKS = [("숫자 들어감", r"\d"), ("억·만원 금액", r"\d+\s*억|\d+\s*만\s*원"), ("% 변화", r"%"), ("TOP·순위·N곳", r"TOP|top|순위|\d+\s*(곳|개|가지|단지)"),
         ("질문형 ?", r"\?"), ("[ ] 말머리", r"[\[【]"), ("총정리·정리", r"총정리|정리"), ("후기·임장", r"후기|임장|다녀"),
         ("전망·예측", r"전망|예측|오를까|떨어질까"), ("시점(월·주·연도)", r"\d{1,2}\s*월|\d\s*주|20\d\d|올해|이번 주|최근"),
         ("손해·주의", r"손해|주의|모르면|꼭|필수|놓치"), ("지역명(구·동)", r"[가-힣]+(구|동)\b")]
STOP = {"서울", "아파트", "부동산", "the", "및", "그리고", "있는", "하는", "에서", "으로", "이번", "정리", "블로그"}


def call(path, key_id, key, body=None, query=None):
    url = HOST + path + ("?" + urllib.parse.urlencode(query) if query else "")
    req = urllib.request.Request(url, data=json.dumps(body).encode() if body else None, method="POST" if body else "GET",
                                 headers={"X-NCP-APIGW-API-KEY-ID": key_id, "X-NCP-APIGW-API-KEY": key, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def clean(s):
    return html.unescape(re.sub(r"</?b>", "", s or "")).strip()


def collect(key_id, key, seeds, display=30):
    out = {}
    for q in seeds:
        try:
            out[q] = call("/search/v1/blog", key_id, key, query={"query": q, "display": display, "sort": "sim"})["items"]
        except Exception as e:  # one bad query shouldn't sink the report
            print(f"blog search failed for {q}: {e}", file=sys.stderr)
            out[q] = []
    return out


def trends(key_id, key, today):
    end = today - dt.timedelta(days=today.weekday() + 1)  # last full week (ends Sunday)
    start = end - dt.timedelta(weeks=12)
    rows = []
    for groups in TREND_GROUPS:
        body = {"startDate": str(start), "endDate": str(end), "timeUnit": "week",
                "keywordGroups": [{"groupName": g, "keywords": k} for g, k in groups]}
        try:
            for r in call("/search-trend/v1/search", key_id, key, body=body)["results"]:
                d = r["data"]
                if len(d) >= 5:
                    last, prev4 = d[-1]["ratio"], sum(x["ratio"] for x in d[-5:-1]) / 4
                    rows.append((r["title"], last, prev4, (last - prev4) / prev4 * 100 if prev4 else None))
        except Exception as e:
            print(f"trend failed: {e}", file=sys.stderr)
    # ratios are only comparable inside one call, so report each keyword against its own last 4 weeks
    return sorted(rows, key=lambda r: -(r[3] or -999)), str(start), str(end)


def analyse(results):
    items = [(q, it) for q, its in results.items() for it in its]
    titles = [clean(it["title"]) for _, it in items]
    n = len(titles) or 1
    hooks = [(name, sum(bool(re.search(p, t)) for t in titles)) for name, p in HOOKS]
    words = collections.Counter()
    for t in titles:
        for w in set(re.findall(r"[가-힣A-Za-z0-9%]{2,}", t)):
            if w not in STOP:
                words[w] += 1
    lens = sorted(len(t) for t in titles)
    recent = collections.Counter(it.get("postdate", "")[:6] for _, it in items)
    return titles, n, hooks, words, lens, recent


def report(results, trend, today):
    titles, n, hooks, words, lens, recent = analyse(results)
    md = [f"## 네이버 블로그 키워드 리포트 ({today:%Y-%m-%d})", "",
          f"검색어 {len(results)}개 × 정확도순 상위 글 → 제목 {len(titles)}개를 모았습니다. (NAVER API HUB 블로그 검색)", ""]
    if trend and trend[0]:
        rows, s, e = trend
        md += [f"### 검색량이 오르는 키워드 (주간, {s}~{e})", "",
               "| 키워드 | 지난주 지수 | 직전 4주 평균 | 변화 |", "|---|---|---|---|"]
        md += [f"| {t} | {last:.1f} | {prev:.1f} | {'—' if chg is None else f'{chg:+.0f}%'} |" for t, last, prev, chg in rows]
        md += ["", "※ 네이버 검색어 트렌드 지수(최대 100 기준 상대값)라 검색 횟수가 아닙니다. 같은 묶음 안에서만 크기 비교가 됩니다.", ""]
    md += ["### 상위 글 제목에서 많이 쓰는 말", "",
           ", ".join(f"{w}({c})" for w, c in words.most_common(30)), "",
           "### 제목 후킹 패턴 (상위 글 중 비율)", "", "| 패턴 | 글 수 | 비율 |", "|---|---|---|"]
    md += [f"| {name} | {c} | {c / n * 100:.0f}% |" for name, c in sorted(hooks, key=lambda h: -h[1])]
    if lens:
        md += ["", f"제목 길이: 중간값 {lens[len(lens) // 2]}자 (짧은 쪽 1/4 {lens[len(lens) // 4]}자, 긴 쪽 1/4 {lens[len(lens) * 3 // 4]}자)"]
    md += ["", "### 검색어별 1~5위 글", ""]
    for q, its in results.items():
        md.append(f"**{q}**")
        md += [f"- {clean(it['title'])} · {it.get('bloggername', '')} · {it.get('postdate', '')}" for it in its[:5]] or ["- (결과 없음)"]
        md.append("")
    return "\n".join(md)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--extra", nargs="*", default=[], help="this week's 동·단지 names to look up too")
    ap.add_argument("--fixture", help="saved {query: items} JSON instead of calling the API")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"))
    a = ap.parse_args()
    today = dt.datetime.now(KST).date()
    os.makedirs(a.out, exist_ok=True)
    path = os.path.join(a.out, "research.md")
    key_id, key = os.environ.get("NAVER_API_ID"), os.environ.get("NAVER_API_KEY")
    if a.fixture:
        with open(a.fixture, encoding="utf-8") as f:
            results, trend = json.load(f), None
    elif key_id and key:
        results = collect(key_id, key, SEARCH_SEEDS + [f"{x} 아파트" for x in a.extra])
        trend = trends(key_id, key, today)
    else:
        with open(path, "w", encoding="utf-8") as f:
            f.write("## 네이버 블로그 키워드 리포트\n\nNAVER_API_ID / NAVER_API_KEY secret이 없어 건너뛰었습니다. blog/README.md의 '키워드 리포트 켜기'를 보세요.\n")
        print("no NAVER_API_ID/NAVER_API_KEY; wrote a placeholder")
        return
    md = report(results, trend, today)
    with open(path, "w", encoding="utf-8") as f:
        f.write(md)
    sys.stdout.reconfigure(encoding="utf-8")
    print(md)


if __name__ == "__main__":
    main()
