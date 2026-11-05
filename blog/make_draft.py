"""Weekly blog draft from the site's public data (https://whereismyhouse.kr/data/).

Every number in the draft comes straight from the fetched JSON; nothing is estimated here.
The draft is Markdown: the owner adds a line of their own view and pastes it into Naver blog / Tistory.

    python blog/make_draft.py                    # writes blog/out/draft.md and blog/out/title.txt
    python blog/make_draft.py --topic budget     # force the second topic (gu | budget | jeonse)
    python blog/make_draft.py --data-dir DIR     # read DIR/*.json instead of fetching (offline test)

Standard library only, no API keys.
"""
import argparse
import datetime as dt
import json
import os
import sys
import urllib.request

REMOTE = "https://whereismyhouse.kr/data/"
SITE = "https://whereismyhouse.kr/"
NEEDED = ["deals", "insights", "gu_summary", "dong_summary", "market"]
KST = dt.timezone(dt.timedelta(hours=9))
TOPICS = ["gu", "budget", "jeonse"]  # rotates by ISO week
RECENT_DAYS = 21  # 실거래 신고는 계약 후 30일 안이라, 최근 1주만 보면 건수가 너무 적습니다
TOP_N = 10
# matches the footer SOURCES in web/src/App.jsx (only the ones this draft uses)
SOURCES = "국토교통부 실거래가 공개시스템(아파트 매매·전월세, 공공데이터포털)"


def fetch(name, data_dir=None):
    if data_dir:
        with open(os.path.join(data_dir, f"{name}.json"), encoding="utf-8") as f:
            return json.load(f)
    req = urllib.request.Request(f"{REMOTE}{name}.json", headers={"User-Agent": "whereismyhouse-blog-draft", "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def won(man):
    """만원 → '18억 2,000만' / '9,500만'."""
    if man is None:
        return "—"
    man = int(round(man))
    eok, rest = divmod(man, 10000)
    if eok and rest:
        return f"{eok}억 {rest:,}만"
    return f"{eok}억" if eok else f"{rest:,}만"


def josa(word, with_final, without_final):
    """'망원동' + 을/를 → '망원동을'. Picks the particle by the last syllable's 받침."""
    c = word[-1] if word else ""
    has = "가" <= c <= "힣" and (ord(c) - 0xAC00) % 28 != 0
    return word + (with_final if has else without_final)


def pct(x, sign=True):
    return "—" if x is None else (f"{x:+.1f}%" if sign else f"{x:.1f}%")


def table(head, rows):
    out = ["| " + " | ".join(head) + " |", "|" + "|".join("---" for _ in head) + "|"]
    out += ["| " + " | ".join(str(c) for c in r) + " |" for r in rows]
    return "\n".join(out)


def link(utm):
    return f"{SITE}?utm_source=blog&utm_medium=draft&utm_campaign={utm}#map"


def mmdd(d):
    return f"{int(d[5:7])}/{int(d[8:10])}"


# ---------- main topic: 신고가 · 급매 ----------
def deals_section(deals, as_of):
    cutoff = str(dt.date.fromisoformat(as_of) - dt.timedelta(days=RECENT_DAYS))
    seoul = lambda k: [x for x in deals.get(k, []) if x.get("sido") == "11"]
    highs = sorted((x for x in seoul("highs") if x["date"] >= cutoff), key=lambda x: -x["gap_pct"])[:TOP_N]
    dips = sorted((x for x in seoul("dips") if x["date"] >= cutoff), key=lambda x: x["gap_pct"])[:TOP_N]
    n = deals.get("n", {}).get("11", {})
    since = deals["since"]
    parts = []
    parts.append(f"## 1. 어디서 신고가가 나왔을까? 2년 최고가를 크게 넘긴 서울 거래 (계약일 {mmdd(cutoff)}~{mmdd(as_of)})\n")
    if highs:
        parts.append(table(["구", "동", "단지", "면적", "층", "계약일", "거래가", "직전 2년 최고가", "차이"],
                           [[h["gu"], h["dong"], h["apt"], f"{h['area']:.0f}㎡", f"{h['floor']}층", mmdd(h["date"]), won(h["price"]), won(h["ref"]), pct(h["gap_pct"])] for h in highs]))
    else:
        parts.append("이 기간에 집계된 신고가 거래가 없습니다.")
    parts.append(f"\n※ 같은 단지·같은 평형의 직전 2년 최고가 대비. {since[:4]}.{since[5:7]} 이후 서울 신고가 거래는 모두 {n.get('high', 0):,}건이고, 위 표는 그중 상승 폭이 큰 거래입니다.\n")
    parts.append(f"## 2. 급매는 어디에? 직전 6개월 중위가보다 싸게 팔린 서울 거래 (계약일 {mmdd(cutoff)}~{mmdd(as_of)})\n")
    if dips:
        parts.append(table(["구", "동", "단지", "면적", "층", "계약일", "거래가", "직전 6개월 중위가", "차이"],
                           [[d["gu"], d["dong"], d["apt"], f"{d['area']:.0f}㎡", f"{d['floor']}층", mmdd(d["date"]), won(d["price"]), won(d["ref"]), pct(d["gap_pct"])] for d in dips]))
    else:
        parts.append("이 기간에 집계된 급매 거래가 없습니다.")
    parts.append(f"\n※ {since[:4]}.{since[5:7]} 이후 서울에서 이렇게 싸게 팔린 거래는 {n.get('dip', 0):,}건입니다. 1~2층·직거래, 가족 간 양도로 보이는 할인 폭(시가 30% 또는 3억 바로 안쪽)은 뺐습니다. 급매가 아니라 사정이 있는 거래일 수 있습니다.\n")
    return "\n".join(parts), highs, dips


# ---------- rotating second topic ----------
def topic_gu(ins, gus, dongs):
    note = ins["meta"]["notes"]["p3"]
    rows = sorted(((g["name"], g["p3"]) for g in ins["gu"].values() if g["p3"].get("chg") is not None), key=lambda r: -r[1]["chg"])
    gs = {g["gu"]: g for g in gus}
    body = [f"## 3. 어느 구가 올랐을까? 서울 25개 구 가격 변화 ({note})\n",
            table(["구", "가격 변화", "평당 중위가", "거래량", "거래량 변화", "84㎡ 중위가(최근 6개월)"],
                  [[name, pct(p["chg"]), won(p["ppp"]), f"{p['n']:,}건", pct(p.get("vol_chg")), won(gs.get(name, {}).get("median_84_10k"))] for name, p in rows]),
            "\n※ 가격 변화는 두 기간에 모두 거래된 같은 단지·같은 평형끼리 가격을 비교한 값의 중위값입니다. 그래서 거래된 단지 구성이 바뀌어도 흔들리지 않습니다."
            " 평당 중위가는 최근 3개월 3.3㎡당 거래가격의 중위값, 84㎡ 중위가는 전용 75~90㎡ 거래의 중위값입니다.\n"]
    up, down = rows[0], rows[-1]
    line = f"{note.split(' vs ')[0]} 같은 단지·평형 기준 가격은 {josa(up[0], '이', '가')} {pct(up[1]['chg'])}로 가장 많이 올랐고, {josa(down[0], '은', '는')} {pct(down[1]['chg'])}입니다."
    return "구별 아파트 가격 변화", "\n".join(body), line, up[0]


BUDGETS = [60000, 90000, 120000]


def topic_budget(ins, gus, dongs):
    body = ["## 3. 내 예산이면 어디? 84㎡를 살 수 있는 동네 (최근 6개월 실거래 중위가 기준)\n"]
    first = None
    for b in BUDGETS:
        lo = BUDGETS[BUDGETS.index(b) - 1] if BUDGETS.index(b) else 0
        fit = [d for d in dongs if d.get("median_84_10k") and lo < d["median_84_10k"] <= b and d.get("trades_6m", 0) >= 20]
        fit.sort(key=lambda d: -d["trades_6m"])
        body.append(f"### {won(lo) + ' 초과 ~ ' if lo else ''}{won(b)} 이하\n")
        if fit:
            body.append(table(["구", "동", "84㎡ 중위가", "59㎡ 중위가", "6개월 거래"],
                              [[d["gu"], d["dong"], won(d["median_84_10k"]), won(d.get("median_59_10k")), f"{d['trades_6m']:,}건"] for d in fit[:8]]))
            first = first or (b, fit[0])
        else:
            body.append("해당하는 동이 없습니다.")
        body.append("")
    body.append("※ 6개월 거래 20건 이상인 법정동만, 거래가 많은 순. 84㎡는 전용 75~90㎡, 59㎡는 50~65㎡ 거래의 중위값입니다. 대출 한도와 취득세는 따로 따져야 합니다.\n")
    line = f"84㎡ 중위가 {won(first[0])} 이하 동네 중 최근 6개월 거래가 가장 많은 곳은 {first[1]['gu']} {first[1]['dong']}({won(first[1]['median_84_10k'])})입니다." if first else ""
    return "예산별 살 수 있는 동네", "\n".join(body), line, first[1]["gu"] if first else None


def topic_jeonse(ins, gus, dongs):
    rows = sorted((g for g in gus if g.get("jeonse_ratio_pct") is not None), key=lambda g: -g["jeonse_ratio_pct"])
    body = ["## 3. 전세 끼면 얼마 필요할까? 구별 전세가율 (84㎡, 최근 6개월 중위가 기준)\n",
            table(["구", "전세가율", "84㎡ 매매 중위가", "59㎡ 매매 중위가"],
                  [[g["gu"], pct(g["jeonse_ratio_pct"], sign=False), won(g["median_84_10k"]), won(g.get("median_59_10k"))] for g in rows]),
            "\n※ 전세가율 = 84㎡(전용 75~90㎡) 순수 전세 보증금 중위값 ÷ 매매 중위값. 높을수록 매매가와 전세가 차이가 작습니다.\n"]
    hi, lo = rows[0], rows[-1]
    line = f"84㎡ 전세가율은 {hi['gu']} {pct(hi['jeonse_ratio_pct'], False)}로 가장 높고, {lo['gu']} {pct(lo['jeonse_ratio_pct'], False)}로 가장 낮습니다."
    return "구별 전세가율", "\n".join(body), line, hi["gu"]


TOPIC_FN = {"gu": topic_gu, "budget": topic_budget, "jeonse": topic_jeonse}


def build(data, today, topic=None):
    ins, deals, market = data["insights"], data["deals"], data["market"]
    as_of = ins["meta"]["as_of"]
    topic = topic or TOPICS[today.isocalendar()[1] % len(TOPICS)]
    dsec, highs, dips = deals_section(deals, as_of)
    tname, tbody, tline, tgu = TOPIC_FN[topic](ins, data["gu_summary"], data["dong_summary"])

    week = f"{today.month}월 {(today.day - 1) // 7 + 1}주"
    h0, d0 = (highs or [None])[0], (dips or [None])[0]
    # main search words first, then a number and the period, then the one concrete fact that makes people click
    core = f"서울 아파트 신고가·급매 TOP{TOP_N} ({week})" + (f" | {h0['dong']} {h0['apt']} {pct(h0['gap_pct'])}" if h0 else "")
    alt = [f"서울 아파트, 지금 어디서 신고가가 나올까? {week} 실거래 정리", f"{tname} ({week}) + 서울 신고가·급매 단지"]
    n11, since = deals.get("n", {}).get("11", {}), deals["since"]
    hook = (f"{since[:4]}년 {int(since[5:7])}월 이후 서울에서 직전 2년 최고가를 넘긴 아파트 거래는 {n11.get('high', 0):,}건, "
            f"직전 6개월 시세보다 10% 이상 싸게 팔린 거래는 {n11.get('dip', 0):,}건입니다. 이번에는 어디였는지 실거래로만 정리했습니다.")
    summary = []
    if h0:
        summary.append(f"최근 {RECENT_DAYS}일 계약 중 신고가 폭이 가장 큰 곳은 {h0['gu']} {h0['dong']} {h0['apt']} {h0['area']:.0f}㎡로, {won(h0['price'])}에 거래돼 직전 2년 최고가({won(h0['ref'])})보다 {pct(h0['gap_pct'])}입니다.")
    if d0:
        summary.append(f"같은 기간 가장 싸게 팔린 거래는 {d0['gu']} {d0['dong']} {d0['apt']} {d0['area']:.0f}㎡ {josa(won(d0['price']), '으로', '로')}, 직전 6개월 중위가({won(d0['ref'])})보다 {pct(d0['gap_pct'])}입니다.")
    if tline:
        summary.append(tline)
    vol = next((b["text"] for b in market.get("bullets", []) if b.get("tag") == "거래"), None)
    if len(summary) < 3 and vol:
        summary.append(vol)

    # Naver allows up to 30 tags: fixed search words first, then this week's places
    places = [p for x in highs[:5] + dips[:3] for p in (x["gu"], x["dong"], x["apt"])] + ([tgu] if tgu else [])
    tags = list(dict.fromkeys(["서울아파트", "아파트실거래가", "신고가", "급매", "내집마련", "서울부동산"] + [p.replace(" ", "") for p in places]))[:30]
    build.alt_titles = alt
    build.keywords = list(dict.fromkeys(x["dong"] for x in highs[:3] + dips[:2]))

    focus = highs[:1] + dips[:1]
    links = [f"- [서울 내집마련 전략판 지도에서 직접 보기]({link(today.strftime('%Y%m%d'))})"]
    for x in focus:
        links.append(f"- {x['gu']} {x['dong']} {x['apt']}: 위 링크의 지도에서 {x['gu']} → {josa(x['dong'], '을', '를')} 누르면 단지별 실거래를 볼 수 있습니다.")
    if tgu:
        links.append(f"- {tgu}: 지도에서 {josa(tgu, '을', '를')} 누르면 동별 가격·거래량 변화를 볼 수 있습니다.")

    md = [f"# {core}", "",
          hook, "",
          "**3줄 요약**", ""] + [f"{i}. {s}" for i, s in enumerate(summary[:3], 1)] + [
          "", "✍️ [여기에 내 의견 한두 줄]", "",
          dsec, tbody,
          "## 더 보기", "", *links, "",
          f"기준일 {as_of} · 출처: {SOURCES}. 실거래 신고는 계약 후 30일 안에 들어와 최근 거래는 더 늘어날 수 있습니다. 투자 권유가 아닙니다.",
          "", "태그: " + " ".join("#" + t for t in tags), ""]
    return core, "\n".join(md)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--topic", choices=TOPICS)
    ap.add_argument("--data-dir")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.abspath(__file__)), "out"))
    a = ap.parse_args()
    today = dt.datetime.now(KST).date()
    data = {n: fetch(n, a.data_dir) for n in NEEDED}
    title, md = build(data, today, a.topic)
    os.makedirs(a.out, exist_ok=True)
    with open(os.path.join(a.out, "draft.md"), "w", encoding="utf-8") as f:
        f.write(md)
    with open(os.path.join(a.out, "title.txt"), "w", encoding="utf-8") as f:
        f.write(title)
    with open(os.path.join(a.out, "keywords.txt"), "w", encoding="utf-8") as f:
        f.write(" ".join(build.keywords))
    with open(os.path.join(a.out, "notes.md"), "w", encoding="utf-8") as f:
        f.write("## 편집 메모\n\n제목 후보 (본문 첫 줄 제목 대신 골라 쓰세요)\n\n" + "\n".join(f"- {t}" for t in [title] + build.alt_titles)
                + "\n\n올리기 전에: ✍️ 줄을 내 말로 바꾸기 · 표 아래 ※ 설명은 지우지 않기 · 태그 줄은 블로그 태그 칸에 옮기기\n")
    sys.stdout.reconfigure(encoding="utf-8")
    print(md)


if __name__ == "__main__":
    main()
