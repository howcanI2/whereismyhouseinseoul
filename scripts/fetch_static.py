"""Re-download and rebuild the slow-moving public datasets (no login, stdlib only).

    python scripts/fetch_static.py                    # all sources
    python scripts/fetch_static.py --only kapt,pop    # some of them
    python scripts/fetch_static.py --keep-raw         # keep downloads in data/raw/static_src/

Sources (all keyless):
  kapt  K-apt 자료실 (www.k-apt.go.kr/web/board/webReference/boardList.do): newest weekly
        "관리비공개의무단지 기본정보" + "면적정보" xlsx -> data/static/apt_basic.json (서울 11 + 경기 41)
  pop   행정안전부 주민등록 인구 및 세대현황 (jumin.mois.go.kr/statMonth.do): latest month,
        전체읍면동현황 CSV -> data/static/population.json
  redev 서울 열린데이터광장 OA-23112 (정비사업) / OA-23113 (소규모정비사업) sheet CSV
        -> web/public/data/redev.json

Environment: KAKAO_REST_KEY (optional) geocodes redev rows that have no coordinates yet;
results are cached in data/raw/geocode_redev.json keyed by row id.

A source that fails (site down, layout change, suspiciously few rows) is skipped with a
warning and its previous output is left untouched; the script still exits 0.
"""
import argparse, collections, csv, datetime as dt, http.cookiejar, io, json, os, re, sys, time
import urllib.parse, urllib.request, zipfile
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW, STATIC, OUT = (os.path.join(ROOT, "data", "raw"), os.path.join(ROOT, "data", "static"), os.path.join(ROOT, "web", "public", "data"))
SRC = os.path.join(RAW, "static_src")
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"

GU = {"11110":"종로구","11140":"중구","11170":"용산구","11200":"성동구","11215":"광진구","11230":"동대문구","11260":"중랑구","11290":"성북구","11305":"강북구","11320":"도봉구","11350":"노원구","11380":"은평구","11410":"서대문구","11440":"마포구","11470":"양천구","11500":"강서구","11530":"구로구","11545":"금천구","11560":"영등포구","11590":"동작구","11620":"관악구","11650":"서초구","11680":"강남구","11710":"송파구","11740":"강동구"}
GG = {"41111":"수원시 장안구","41113":"수원시 권선구","41115":"수원시 팔달구","41117":"수원시 영통구","41131":"성남시 수정구","41133":"성남시 중원구","41135":"성남시 분당구","41150":"의정부시",
      "41171":"안양시 만안구","41173":"안양시 동안구","41192":"부천시 원미구","41194":"부천시 소사구","41196":"부천시 오정구","41210":"광명시","41220":"평택시","41250":"동두천시",
      "41271":"안산시 상록구","41273":"안산시 단원구","41281":"고양시 덕양구","41285":"고양시 일산동구","41287":"고양시 일산서구","41290":"과천시","41310":"구리시","41360":"남양주시",
      "41370":"오산시","41390":"시흥시","41410":"군포시","41430":"의왕시","41450":"하남시","41461":"용인시 처인구","41463":"용인시 기흥구","41465":"용인시 수지구","41480":"파주시",
      "41500":"이천시","41550":"안성시","41570":"김포시","41591":"화성시 만세구","41593":"화성시 효행구","41595":"화성시 병점구","41597":"화성시 동탄구","41590":"화성시","41610":"광주시",
      "41630":"양주시","41650":"포천시","41670":"여주시","41800":"연천군","41820":"가평군","41830":"양평군"}
SIDO = {"서울특별시": "11", "경기도": "41"}
# K-apt writes Gyeonggi 구 as "수원장안구" / "화성동탄구": map both spellings to code + "수원시 장안구"
SGG_BY_NAME = {}
for _c, _n in {**GU, **GG}.items():
    SGG_BY_NAME[_n] = _c; SGG_BY_NAME[_n.replace(" ", "")] = _c
    if " " in _n: SGG_BY_NAME[_n.split()[0][:-1] + _n.split()[1]] = _c


def log(*a): print(*a, flush=True)
def save(p, obj, indent=None):
    os.makedirs(os.path.dirname(p), exist_ok=True)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=indent, separators=None if indent is not None else (",", ":"))
    os.replace(tmp, p)
def load(p, default=None):
    if not os.path.exists(p): return default
    with open(p, encoding="utf-8") as f: return json.load(f)
def opener():
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    op.addheaders = [("User-Agent", UA), ("Accept-Language", "ko-KR,ko;q=0.9")]
    return op
def fetch(op, url, data=None, headers=None, timeout=120, tries=3):
    body = urllib.parse.urlencode(data).encode() if isinstance(data, dict) else data
    err = None
    for t in range(tries):
        try:
            with op.open(urllib.request.Request(url, data=body, headers=headers or {}), timeout=timeout) as r:
                return r.read(), r.headers
        except Exception as e:
            err = e; time.sleep(2 + 3 * t)
    raise RuntimeError(f"{url}: {err}")
def guard(name, new_n, old_n):
    if old_n and new_n < old_n * 0.7:
        raise RuntimeError(f"{name}: only {new_n} rows vs {old_n} before - refusing to overwrite")


# ---------------- minimal xlsx reader (streaming, first sheet) ----------------
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
def _col(ref):
    n = 0
    for ch in re.match(r"[A-Z]+", ref).group(): n = n * 26 + ord(ch) - 64
    return n - 1
def xlsx_rows(path):
    z = zipfile.ZipFile(path)
    ss = []
    if "xl/sharedStrings.xml" in z.namelist():
        for _, el in ET.iterparse(z.open("xl/sharedStrings.xml")):
            if el.tag == NS + "si":
                ss.append("".join(t.text or "" for t in el.iter(NS + "t"))); el.clear()
    sheet = sorted(n for n in z.namelist() if re.match(r"xl/worksheets/sheet\d+\.xml$", n))[0]
    for _, el in ET.iterparse(z.open(sheet)):
        if el.tag != NS + "row": continue
        out = {}
        for c in el.iter(NS + "c"):
            v, t = c.find(NS + "v"), c.get("t")
            if t == "inlineStr": val = "".join(x.text or "" for x in c.iter(NS + "t"))
            elif v is None: val = None
            elif t == "s": val = ss[int(v.text)]
            else: val = v.text
            out[_col(c.get("r"))] = val
        el.clear()
        yield [out.get(i) for i in range(max(out) + 1)] if out else []


# ---------------- K-apt ----------------
KAPT = "https://www.k-apt.go.kr"
def kapt_latest(op, tok, scode, word):
    """Newest post on 자료실 tab `scode` whose title has `word` -> (seq, file_num, 'YYYY-MM-DD', title)."""
    html, _ = fetch(op, KAPT + "/web/board/webReference/boardListAjax.do",
                    {"scode": scode, "boardType": "03", "pageNo": "1", "stype": "all", "keyword": "", "_csrf": tok},
                    {"X-Requested-With": "XMLHttpRequest", "X-CSRF-TOKEN": tok, "Referer": KAPT + "/web/board/webReference/boardList.do"}, timeout=30)
    html = html.decode("utf-8", "replace"); posts = []
    for li in re.split(r"<li>", html)[1:]:
        m = re.search(r"goCheck\((\d+),[^)]*\);\">\s*([^<]+?)\s*</a>", li); f = re.search(r"fileDown\('(\d+)','03','(\d+)'\)", li)
        if not (m and f and word in m.group(2)): continue
        d = re.search(r"\((\d{4})\.(\d{1,2})\.(\d{1,2})\.?\)", m.group(2)) or re.search(r"boardDate\">(\d{4})-(\d{2})-(\d{2})", li)
        posts.append((f"{d.group(1)}-{int(d.group(2)):02d}-{int(d.group(3)):02d}" if d else "", f.group(1), f.group(2), m.group(2)))
    if not posts: raise RuntimeError(f"K-apt: no '{word}' post with a file on tab {scode}")
    date, seq, fnum, title = max(posts)
    return seq, fnum, date, title

def kapt_download(op, tok, seq, fnum, path):
    b, h = fetch(op, f"{KAPT}/board/getFileDownload.do?seq={seq}&boardType=03", {"file_num": fnum, "fileNum": fnum, "_csrf": tok},
                 {"Referer": KAPT + "/web/board/webReference/boardList.do"}, timeout=300)
    if b[:2] != b"PK": raise RuntimeError(f"K-apt seq {seq}: not an xlsx ({b[:80]!r})")
    with open(path, "wb") as f: f.write(b)
    return urllib.parse.unquote(re.search(r'filename="?([^";]+)', h.get("Content-Disposition", "") or "x").group(1))

def run_kapt(keep):
    op = opener()
    page, _ = fetch(op, KAPT + "/web/board/webReference/boardList.do", timeout=30)
    tok = re.search(r'name="_csrf"\s+(?:value|content)="([^"]+)"', page.decode("utf-8", "replace")).group(1)
    b_seq, b_f, b_date, b_title = kapt_latest(op, tok, "01", "기본정보")
    a_seq, a_f, a_date, a_title = kapt_latest(op, tok, "04", "면적정보")
    if a_date != b_date: log(f"  kapt: note 기본정보 {b_date} vs 면적정보 {a_date}")
    os.makedirs(SRC, exist_ok=True)
    pb, pa = os.path.join(SRC, "kapt_basic.xlsx"), os.path.join(SRC, "kapt_area.xlsx")
    nb = kapt_download(op, tok, b_seq, b_f, pb); na = kapt_download(op, tok, a_seq, a_f, pa)
    log(f"  kapt: {nb} ({os.path.getsize(pb)>>20}MB), {na} ({os.path.getsize(pa)>>20}MB)")

    num = lambda v, f=int: (lambda x: f(x) if x is not None else None)(_float(v))
    s = lambda v: ((v or "").strip() or None) if isinstance(v, str) else v
    area, seen = collections.defaultdict(lambda: [0, 0, 0, 0]), set()
    for i, r in enumerate(xlsx_rows(pa)):
        if i < 2 or not r or r[0] not in SIDO: continue
        r = r + [None] * (11 - len(r)); a = _float(r[9]); n = num(r[10]) or 0
        if a is None: continue
        seen.add(r[4]); area[r[4]][0 if a <= 60 else 1 if a <= 85 else 2 if a <= 135 else 3] += n
    res, unmapped = [], collections.Counter()
    for i, r in enumerate(xlsx_rows(pb)):
        if i < 2 or not r or r[0] not in SIDO: continue
        r = r + [None] * (90 - len(r))
        sido = SIDO[r[0]]; raw_gu = s(r[1]) or ""
        sgg = SGG_BY_NAME.get(raw_gu) or SGG_BY_NAME.get(raw_gu.replace(" ", ""))
        if not sgg: unmapped[raw_gu] += 1
        gu = (GU if sido == "11" else GG).get(sgg, raw_gu)
        emd, ri = s(r[2]), s(r[3])
        ap = s(r[11]); ap = f"{ap[:4]}-{ap[4:6]}-{ap[6:8]}" if ap and len(ap) == 8 and ap.isdigit() else None
        sale = s(r[10]); ru = num(r[16]); k = r[4]; ar = area.get(k) if k in seen else None
        o = {"kaptCode": k, "name": s(r[5]), "gu": gu, "dong": emd or ri,
             "address": s(r[7]) or s(r[9]), "road_address": s(r[9]),
             "households": num(r[14]), "buildings": num(r[13]), "approval": ap,
             "builder": s(r[22]), "heating": s(r[20]), "hall": s(r[21]), "parking": num(r[52]),
             "floors_max": num(r[70]) or num(r[69]),
             "units_le60": ar[0] if ar else None, "units_60_85": ar[1] if ar else None,
             "units_85_135": ar[2] if ar else None, "units_gt135": ar[3] if ar else None,
             "rental": True if sale == "임대" else False if sale == "분양" else (bool(ru) if ru is not None else None),
             "sale_type": sale, "rental_units": ru, "category": s(r[6]),
             "lon": None, "lat": None, "sido": sido, "sgg": sgg}
        if emd and ri: o["ri"] = ri  # 읍·면 지역: dong is the 읍/면, ri the 리
        res.append(o)
    if unmapped: log(f"  kapt: WARNING unmapped 시군구 {dict(unmapped)}")
    p = os.path.join(STATIC, "apt_basic.json"); old = load(p, [])
    c = collections.Counter(x["sido"] for x in res)
    guard("apt_basic 서울", c["11"], sum(1 for x in old if x.get("sido", "11") == "11"))
    guard("apt_basic 경기", c["41"], sum(1 for x in old if x.get("sido") == "41"))
    save(p, res)
    if not keep:
        for f in (pb, pa): os.remove(f)
    return f"kapt: {len(res):,} complexes (서울 {c['11']:,}, 경기 {c['41']:,}), as_of {b_date}"

def _float(v):
    try: return float(str(v).replace(",", ""))
    except (TypeError, ValueError): return None


# ---------------- 주민등록 인구 ----------------
MOIS = "https://jumin.mois.go.kr/"
def run_pop(keep):
    op = opener()
    page = fetch(op, MOIS + "statMonth.do", timeout=60)[0].decode("utf-8", "replace")
    y = re.search(r"var yearDB = '(\d{4})'", page).group(1); m = re.search(r"var monthDB = '(\d{2})'", page).group(1)
    form = dict(sltOrgType="1", sltOrgLvl1="A", sltOrgLvl2="", gender="gender", genderPer="genderPer", generation="generation", sltUndefType="",
                searchYearStart=y, searchMonthStart=m, searchYearEnd=y, searchMonthEnd=m, sltOrderType="1", sltOrderValue="ASC", category="month", state="3")
    b, _ = fetch(op, MOIS + "downloadCsv.do?searchYearMonth=month&xlsStats=3", form, {"Referer": MOIS + "statMonth.do"}, timeout=300)
    try: text = b.decode("cp949")
    except UnicodeDecodeError: text = b.decode("utf-8-sig")
    if "총인구수" not in text[:300]: raise RuntimeError(f"MOIS: unexpected CSV header {text[:120]!r}")
    if keep:
        os.makedirs(SRC, exist_ok=True)
        with open(os.path.join(SRC, f"jumin_{y}{m}_emd.csv"), "wb") as f: f.write(b)
    gu, sgg, hd, skipped = {}, {}, {}, 0
    for r in csv.reader(io.StringIO(text)):
        mm = re.match(r"^(\S+)\s+(.*?)\s*\((\d{10})\)$", (r[0] if r else "").strip())
        if not mm or mm.group(1) not in SIDO: continue
        sido, rest, code = SIDO[mm.group(1)], mm.group(2).strip(), mm.group(3)
        p, h = int(r[1].replace(",", "")), int(r[2].replace(",", ""))
        parts = rest.split()
        if not parts: continue
        if code[5:] == "00000":
            sgg[code[:5]] = {"name": " ".join(parts), "population": p, "households": h}
            if sido == "11" and len(parts) == 1: gu[parts[0]] = {"population": p, "households": h}
        elif len(parts) >= 2:
            if p == 0 and h == 0: skipped += 1; continue
            hd[code] = {"gu": " ".join(parts[:-1]), "hdong": parts[-1], "population": p, "households": h, "sido": sido}
    out = {"as_of": f"{y}-{m}", "source": "https://jumin.mois.go.kr/statMonth.do (행정안전부 주민등록 인구 및 세대현황, 월간, 전체읍면동현황 CSV)",
           "gu": gu, "sgg": sgg, "hdong": hd}
    p = os.path.join(STATIC, "population.json"); old = load(p, {}) or {}
    if len(gu) != 25: raise RuntimeError(f"MOIS: {len(gu)} Seoul 구 (expected 25)")
    hs = sum(1 for v in hd.values() if v["sido"] == "11"); hg = len(hd) - hs
    guard("population hdong 서울", hs, sum(1 for v in (old.get("hdong") or {}).values() if v.get("sido", "11") == "11"))
    save(p, out, indent=0)
    ss = sum(1 for c in sgg if c[:2] == "11")
    return f"pop: 구 {len(gu)}, 시군구 {len(sgg)} (서울 {ss}, 경기 {len(sgg)-ss}), 행정동 {len(hd):,} (서울 {hs}, 경기 {hg}; {skipped} empty skipped), as_of {y}-{m}"


# ---------------- 정비사업 (redev) ----------------
SEOUL_SHEET = [("OA-23112", "https://data.seoul.go.kr/dataList/OA-23112/S/1/datasetView.do"),
               ("OA-23113", "https://data.seoul.go.kr/dataList/OA-23113/S/1/datasetView.do")]
STAGE = {'대상지선정':'후보지·선정','기획완료':'후보지·선정','정비계획수립':'후보지·선정','열람공고':'후보지·선정',
 '수립범위 자문':'후보지·선정','사전자문':'후보지·선정','위원회심의':'후보지·선정',
 '구역지정':'정비구역 지정','관리지역고시':'정비구역 지정',
 '추진위구성':'추진위·조합설립','조합설립인가':'추진위·조합설립','조합설립추진중':'추진위·조합설립','건축심의':'추진위·조합설립',
 '조합설립인가 추진중(연번부여)':'추진위·조합설립','주민합의체 구성':'추진위·조합설립',
 '사업시행인가':'사업시행인가','사업시행계획인가':'사업시행인가','관리처분계획인가':'관리처분인가',
 '착공':'이주·철거·착공','준공':'준공','준공(일부)':'준공'}
TYPE = {'재개발(주택정비형)':'재개발','재건축(단독)':'재건축','신속통합기획':'신속통합기획','재개발(도시정비형)':'기타','주거환경개선(정비형)':'기타',
        '모아타운':'모아타운','소규모재개발사업':'기타'}
APT = re.compile(r'아파트|APT|맨션|시영|주공|우성|현대|삼익|한양|미성|대림|신동아|한신|삼호|목동|신시가지|럭키|극동|쌍용|삼성|코오롱|선경|롯데|두산|벽산|동아|대우|진로|한진|빌라트')

def seoul_sheet_csv(op, inf):
    """서울 열린데이터광장 sheet 'CSV 내려받기' (same POST the page's doAction('csv') makes)."""
    h = fetch(op, f"https://data.seoul.go.kr/dataList/sheetView.do?infId={inf}", {"infId": inf, "srvType": "S", "serviceKind": "1"}, timeout=60)[0].decode("utf-8", "replace")
    ob = re.search(r'name="strOrderby" id="strOrderby" value="([^"]*)"', h)
    form = {"srvType": "S", "infId": inf, "serviceKind": "1", "pageNo": "1", "gridTotalCnt": "", "ssUserId": "SAMPLE_VIEW",
            "strWhere": "", "strOrderby": ob.group(1) if ob else "", "filterCol": "필터선택", "txtFilter": ""}
    b, _ = fetch(op, "https://datafile.seoul.go.kr/bigfile/iot/sheet/csv/download.do", form,
                 {"Referer": f"https://data.seoul.go.kr/dataList/{inf}/S/1/datasetView.do"}, timeout=300)
    for enc in ("utf-8-sig", "cp949"):
        try: text = b.decode(enc); break
        except UnicodeDecodeError: continue
    else: text = b.decode("cp949", "replace")
    if "기본정보_pk" not in text[:300]: raise RuntimeError(f"{inf}: unexpected CSV header {text[:120]!r}")
    return b, text

def dong_of(addr):
    m = re.match(r'\s*([가-힣0-9]+(?:동|가|로)\d*가?)\s', addr + ' ')
    return m.group(1) if m else None
def keyaddr(gu, a):
    a = re.sub(r'일대|번지|외\s*\d+필지|\s', '', a); m = re.match(r'([가-힣0-9]+?(?:동|가))(\d+(?:-\d+)?)', a)
    return (gu, m.group(1), m.group(2)) if m else (gu, a)

def build_redev(sheets, today):
    gus = set(GU.values()); cutoff = (today - dt.timedelta(days=365)).isoformat()
    out, skipped = [], collections.Counter()
    for inf, url, text in sheets:
        for r in csv.DictReader(io.StringIO(text)):
            gu = (r.get('지차체 코드명') or '').strip(); sub = (r.get('소분류 코드명') or '').strip()
            if gu not in gus: continue
            if sub not in TYPE: skipped[sub] += 1; continue
            st = (r.get('추진단계 코드명') or '').strip(); date = (r.get('추진현황') or '')[:10]
            stage = STAGE.get(st)
            if stage is None: skipped['stage:' + st] += 1; continue
            if stage == '준공' and date and date < cutoff: skipped['old 준공'] += 1; continue
            addr = (r.get('사업위치') or '').strip().replace('?', '·'); addr = re.sub(r'^\s*' + gu + r'\s+', '', addr)
            addr = re.sub(r'면목\d[·\d]*동', '면목동', addr); addr = re.sub(r'(\d)\s*번지', r'\1', addr); addr = re.sub(r'^서소문\s', '서소문동 ', addr)
            addr = re.sub(r'^([가-힣]+동)(?=\d+(?:-\d+)?(?:\s|$))', r'\1 ', addr); addr = re.sub(r'^([가-힣]+?)\d+(?:·\d+)*동(?=\s)', r'\1동', addr)
            name = (r.get('사업명칭') or '').strip(); hh = _pos(r.get('공급세대'))
            o = {"id": "%s-%s" % (inf, (r.get('기본정보_pk') or '').split('.')[0]), "gu": gu, "dong": dong_of(addr), "name": name, "type": TYPE[sub],
                 "subtype": sub, "stage": stage, "stage_raw": st,
                 "address": ("서울특별시 %s %s" % (gu, re.sub(r'\s*일대\s*$', '', addr))).strip() if addr else None,
                 "households": int(hh) if hh else None, "builder": None,
                 "area_m2": _pos(r.get('사업면적')), "updated": date or None, "source": url,
                 "homepage": (r.get('사업장 홈페이지 주소') or '').strip() or None}
            if sub == '재개발(도시정비형)' and o['households'] is None: skipped['도시정비형 no households'] += 1; continue
            if sub == '신속통합기획': o['apt_guess'] = bool(APT.search(name))
            out.append(o)
    # 신속통합기획 rows at the same address as a 재개발/재건축 row: flag that row instead of listing twice
    tail = lambda o: o['address'].split(o['gu'], 1)[1] if o['address'] else ''
    idx = {}
    for o in out:
        if o['type'] != '신속통합기획': idx.setdefault(keyaddr(o['gu'], tail(o)), []).append(o)
    final = []
    for o in out:
        if o['type'] == '신속통합기획':
            k = keyaddr(o['gu'], tail(o))
            if k in idx:
                for t in idx[k]: t['sintong'] = True
                continue
        final.append(o)
    return final

def _pos(v):
    try:
        x = float(v); return x if x > 0 else None
    except (TypeError, ValueError): return None

def kakao_search(path, q, key):
    url = f"https://dapi.kakao.com/v2/local/search/{path}.json?" + urllib.parse.urlencode({"query": q, "size": 5})
    req = urllib.request.Request(url, headers={"Authorization": "KakaoAK " + key})
    for a in range(3):
        try:
            with urllib.request.urlopen(req, timeout=15) as r: return json.load(r).get("documents", [])
        except Exception: time.sleep(1 + a)
    return []

def geocode_redev(rows, key):
    cp = os.path.join(RAW, "geocode_redev.json"); cache = load(cp, {}) or {}
    prev = {r["id"]: r for r in load(os.path.join(OUT, "redev.json"), []) or [] if r.get("lon") is not None}
    for i, r in prev.items():  # seed the cache from the coordinates already published
        cache.setdefault(i, {"lon": r["lon"], "lat": r["lat"], "geo": r.get("geo"), "address": r.get("address")})
    looked = 0
    for r in rows:
        c = cache.get(r["id"])
        if c is not None and c.get("address") not in (None, r.get("address")): c = None  # address changed: look it up again
        if c is None and key:
            addr = r.get("address") or ""
            q = addr if addr.startswith("서울") else f"서울 {r['gu']} {addr}"
            d = next((x for x in kakao_search("address", q, key) if r["gu"] in x.get("address_name", "")), None); how = "address"
            if not d:
                d = next((x for x in kakao_search("keyword", f"{r['gu']} {r.get('dong') or ''} {r['name']}", key) if r["gu"] in x.get("address_name", "")), None); how = "keyword"
            if not d:
                docs = kakao_search("address", f"서울 {r['gu']} {r.get('dong') or ''}", key); d = docs[0] if docs else None; how = "dong"
            c = {"lon": round(float(d["x"]), 6), "lat": round(float(d["y"]), 6), "geo": how, "address": r.get("address")} if d else {"lon": None, "lat": None, "geo": None, "address": r.get("address")}
            cache[r["id"]] = c; looked += 1; time.sleep(0.05)
        if c and c.get("lon") is not None:
            r["lon"], r["lat"], r["geo"] = c["lon"], c["lat"], c.get("geo")
    save(cp, cache)
    missing = sum(1 for r in rows if r.get("lon") is None)
    pending = sum(1 for r in rows if r["id"] not in cache)
    if pending and not key: log(f"  redev: {pending} new rows left without coordinates (KAKAO_REST_KEY not set)")
    return looked, missing

def run_redev(keep):
    op = opener(); sheets = []
    for inf, url in SEOUL_SHEET:
        b, text = seoul_sheet_csv(op, inf); sheets.append((inf, url, text))
        if keep:
            os.makedirs(SRC, exist_ok=True)
            with open(os.path.join(SRC, f"{inf}.csv"), "wb") as f: f.write(b)
    rows = build_redev(sheets, dt.date.today())
    p = os.path.join(OUT, "redev.json"); old = load(p, []) or []
    guard("redev", len(rows), len(old))
    looked, missing = geocode_redev(rows, os.environ.get("KAKAO_REST_KEY"))
    save(p, rows)
    as_of = max((r["updated"] for r in rows if r.get("updated")), default="?")
    return (f"redev: {len(rows)} rows in {len(set(r['gu'] for r in rows))} 구, {len(rows)-missing} with coordinates "
            f"({looked} looked up now), latest update {as_of}")


SOURCES = {"kapt": run_kapt, "pop": run_pop, "redev": run_redev}
def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--only", default=",".join(SOURCES), help="comma list of: " + ",".join(SOURCES))
    ap.add_argument("--keep-raw", action="store_true", help="keep downloaded files in data/raw/static_src/")
    a = ap.parse_args()
    try: sys.stdout.reconfigure(encoding="utf-8")
    except Exception: pass
    names = [n.strip() for n in a.only.split(",") if n.strip()]
    bad = [n for n in names if n not in SOURCES]
    if bad: ap.error(f"unknown source(s): {bad}")
    t0, lines = time.time(), []
    for n in names:
        t = time.time()
        try: lines.append(SOURCES[n](a.keep_raw) + f" [{time.time()-t:.0f}s]")
        except Exception as e: lines.append(f"{n}: WARNING skipped, previous output kept - {type(e).__name__}: {e}")
        log(lines[-1])
    if os.path.isdir(SRC) and not os.listdir(SRC): os.rmdir(SRC)
    log(f"done in {time.time()-t0:.0f}s")

if __name__ == "__main__":
    main()
